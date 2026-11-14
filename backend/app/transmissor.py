"""Comunicação com os transmissores IR (SRW-004).

O sistema roda em dois papéis:
- "agente" (Mac na rede de casa): fala direto com o transmissor pela rede local e processa a fila.
- "nuvem" (Vercel): não alcança a rede local; grava o comando na fila do Supabase e espera o agente
  executar. Se o agente estiver offline, tenta a nuvem Tuya.
"""
import json
import os
import socket
import threading
import time

from . import db, tuya_nuvem

PAPEL = "nuvem" if os.environ.get("VERCEL") else os.environ.get("CLIMA_PAPEL", "agente")
AGENTE_ONLINE_SEG = 45
_travas: dict[str, threading.Lock] = {}


def _trava(hub_id):
    return _travas.setdefault(hub_id, threading.Lock())


def hub(hub_id: str) -> dict:
    h = db.um("SELECT * FROM hubs WHERE id = ?", (hub_id,))
    if not h:
        raise KeyError("Transmissor não encontrado.")
    return h


def agente_online() -> bool:
    visto = db.cfg("agente_visto_em", 0)
    return visto > time.time() - AGENTE_ONLINE_SEG


def porta_aberta(ip: str, porta=6668, timeout=1.5) -> bool:
    try:
        with socket.create_connection((ip, porta), timeout=timeout):
            return True
    except OSError:
        return False


# ---------------- execução local (só no agente) ----------------
def _ir(h: dict, tipo=None):
    from tinytuya.Contrib import IRRemoteControlDevice
    if not (h["ip"] and h["local_key"]):
        raise RuntimeError("Transmissor sem IP ou Local Key.")
    tipo = tipo or h["control_type"]
    if not tipo:
        raise RuntimeError("Formato de comando do transmissor ainda não definido. Grave o primeiro botão.")
    return IRRemoteControlDevice(h["id"], h["ip"], h["local_key"], version=float(h["versao"]), control_type=tipo,
                                 persist=True, connection_timeout=4, connection_retry_limit=1)


def _enviar_local(h: dict, codigo: str):
    with _trava(h["id"]):
        if not porta_aberta(h["ip"]):
            raise RuntimeError(f"Transmissor fora da rede local ({h['ip']}).")
        ir = _ir(h)
        ir.send_button(codigo)
        ir.close()


def _aprender_local(h: dict, timeout=30) -> tuple[str, int]:
    if not (h["ip"] and h["local_key"]):
        raise RuntimeError("O transmissor precisa de IP e Local Key para aprender botões.")
    if not porta_aberta(h["ip"]):
        raise RuntimeError(f"Transmissor fora da rede local ({h['ip']}).")
    for tipo in ([h["control_type"]] if h["control_type"] else [2, 1]):
        with _trava(h["id"]):
            ir = _ir(h, tipo)
            codigo = ir.receive_button(timeout=timeout)
            ir.close()
        if isinstance(codigo, str) and len(codigo) > 8:
            return codigo, tipo
    raise RuntimeError("Nenhum sinal recebido. Aponte o controle a 10–20 cm do transmissor e tente de novo.")


def descobrir_local(segundos=8) -> list[dict]:
    import tinytuya
    achados = tinytuya.deviceScan(False, segundos)
    cadastrados = {h["id"] for h in db.consultar("SELECT id FROM hubs")}
    return [{"id": d.get("gwId"), "ip": ip, "versao": d.get("version"), "cadastrado": d.get("gwId") in cadastrados}
            for ip, d in achados.items()]


def atualizar_online():
    if PAPEL != "agente":
        return
    for h in db.consultar("SELECT id, ip FROM hubs"):
        if h["ip"] and porta_aberta(h["ip"]):
            db.executar("UPDATE hubs SET online = 1, visto_em = ? WHERE id = ?", (db.agora(), h["id"]))
        else:
            db.executar("UPDATE hubs SET online = 0 WHERE id = ?", (h["id"],))


# ---------------- fila no Supabase ----------------
def enfileirar(tipo: str, hub_id: str | None, dados: dict) -> int:
    return db.executar("INSERT INTO fila_comandos (tipo, hub_id, dados, criado_em) VALUES (?, ?, CAST(? AS jsonb), ?)",
                       (tipo, hub_id, json.dumps(dados), db.agora()))


def aguardar(fila_id: int, limite: float) -> dict:
    fim = time.time() + limite
    while time.time() < fim:
        f = db.um("SELECT estado, resultado, erro FROM fila_comandos WHERE id = ?", (fila_id,))
        if f and f["estado"] in ("ok", "erro"):
            return f
        time.sleep(0.4)
    db.executar("UPDATE fila_comandos SET estado = 'erro', erro = 'Tempo esgotado' WHERE id = ? AND estado = 'pendente'",
                (fila_id,))
    return {"estado": "erro", "erro": "O agente do Mac não respondeu a tempo."}


def processar_fila_uma_vez() -> bool:
    """Pega o próximo comando pendente (o agente chama isso em laço). Retorna True se processou algo."""
    item = db.um("""UPDATE fila_comandos SET estado = 'executando', inicio_em = ?
                    WHERE id = (SELECT id FROM fila_comandos WHERE estado = 'pendente' AND criado_em > ?
                                ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
                    RETURNING *""", (db.agora(), db.agora() - 120))
    if not item:
        return False
    dados = item["dados"] if isinstance(item["dados"], dict) else json.loads(item["dados"] or "{}")
    resultado, erro = None, None
    try:
        if item["tipo"] == "enviar":
            _enviar_local(hub(item["hub_id"]), dados["codigo"])
            _avisar_sinric(dados.get("contexto"))
            resultado = {"via": "local"}
        elif item["tipo"] == "aprender":
            h = hub(item["hub_id"])
            codigo, tipo = _aprender_local(h, dados.get("timeout", 30))
            if not h["control_type"]:
                db.executar("UPDATE hubs SET control_type = ? WHERE id = ?", (tipo, h["id"]))
            _salvar_codigo(dados["aparelho_id"], dados["chave"], dados.get("rotulo", ""), codigo)
            resultado = {"tipo": tipo}
        elif item["tipo"] == "descobrir":
            resultado = {"aparelhos": descobrir_local(dados.get("segundos", 6))}
    except Exception as e:  # noqa: BLE001
        erro = str(e)
    db.executar("UPDATE fila_comandos SET estado = ?, resultado = CAST(? AS jsonb), erro = ?, fim_em = ? WHERE id = ?",
                ("erro" if erro else "ok", json.dumps(resultado), erro, db.agora(), item["id"]))
    return True


def _salvar_codigo(aparelho_id, chave, rotulo, codigo):
    from .clima import rotulo_chave
    db.executar(
        "INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) VALUES (?,?,?,?,?) "
        "ON CONFLICT(aparelho_id, chave) DO UPDATE SET codigo = excluded.codigo, rotulo = excluded.rotulo, "
        "criado_em = excluded.criado_em", (aparelho_id, chave, rotulo.strip(), codigo, db.agora()))
    db.registrar("agente", f"Botão gravado: {rotulo.strip() or rotulo_chave(chave)}", aparelho_id=aparelho_id)


def laco_agente():
    """Thread do agente: heartbeat + fila. Roda só no Mac."""
    ultimo_batimento = 0
    while True:
        try:
            if time.time() - ultimo_batimento > 15:
                db.set_cfg("agente_visto_em", int(time.time()))
                ultimo_batimento = time.time()
            if not processar_fila_uma_vez():
                time.sleep(0.8)
        except Exception:  # noqa: BLE001  (rede caiu: tenta de novo)
            time.sleep(3)


# ---------------- API usada pelo resto do sistema ----------------
def _avisar_sinric(contexto):
    if contexto and contexto.get("aparelho"):
        from . import sinric
        sinric.notificar_estado(contexto["aparelho"])


def enviar(hub_id: str, codigo: str, contexto: dict | None = None) -> str:
    """Dispara um código IR. Retorna o caminho usado: 'local', 'agente' ou 'nuvem'."""
    h = hub(hub_id)
    modo = db.cfg("modo_envio", "auto")
    erro_local = None
    if modo in ("auto", "local"):
        try:
            if PAPEL == "agente":
                _enviar_local(h, codigo)
                _avisar_sinric(contexto)
                return "local"
            if not agente_online():
                raise RuntimeError("Agente do Mac offline.")
            f = aguardar(enfileirar("enviar", hub_id, {"codigo": codigo, "contexto": contexto}), 8)
            if f["estado"] == "ok":
                return "agente"
            raise RuntimeError(f["erro"])
        except Exception as e:  # noqa: BLE001
            erro_local = str(e)
            if modo == "local":
                raise RuntimeError(erro_local)
    if not tuya_nuvem.conectada():
        raise RuntimeError(erro_local or "Conta Smart Life não conectada para envio pela nuvem.")
    funcoes = json.loads(h["funcoes_nuvem"] or "[]")
    try:
        tuya_nuvem.enviar_ir(hub_id, codigo, funcoes)
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"Rede local: {erro_local or 'desativada'}. Nuvem: {e}")
    return "nuvem"


def iniciar_aprendizado(hub_id: str, aparelho_id: int, chave: str, rotulo: str, timeout=30) -> int:
    h = hub(hub_id)
    if not (h["ip"] and h["local_key"]):
        raise RuntimeError("O transmissor precisa de IP e Local Key para aprender botões.")
    if PAPEL != "agente" and not agente_online():
        raise RuntimeError("Gravar botões precisa do agente rodando no Mac (na mesma rede do transmissor).")
    if db.um("SELECT 1 FROM fila_comandos WHERE hub_id = ? AND tipo = 'aprender' AND estado IN ('pendente','executando') "
             "AND criado_em > ?", (hub_id, db.agora() - 90)):
        raise RuntimeError("Este transmissor já está gravando um botão.")
    tentativas = 1 if h["control_type"] else 2
    return enfileirar("aprender", hub_id, {"aparelho_id": aparelho_id, "chave": chave, "rotulo": rotulo,
                                           "timeout": timeout, "duracao": timeout * tentativas})


def job(job_id: int) -> dict:
    f = db.um("SELECT * FROM fila_comandos WHERE id = ? AND tipo = 'aprender'", (job_id,))
    if not f:
        raise KeyError("Gravação não encontrada.")
    dados = f["dados"] if isinstance(f["dados"], dict) else json.loads(f["dados"] or "{}")
    res = f["resultado"] if isinstance(f["resultado"], (dict, type(None))) else json.loads(f["resultado"])
    inicio = f["inicio_em"] or f["criado_em"]
    estado = {"pendente": "iniciando", "executando": "escutando"}.get(f["estado"], f["estado"])
    if f["estado"] == "pendente" and f["criado_em"] < db.agora() - 20:
        estado, f["erro"] = "erro", "O agente do Mac não pegou o pedido. Confira se o Clima Casa está rodando no Mac."
    return {"id": f["id"], "estado": estado, "erro": f["erro"], "tipo": (res or {}).get("tipo"),
            "restante": max(0, int(inicio + dados.get("duracao", 30) - time.time()))}


def descobrir(segundos=8) -> list[dict]:
    if PAPEL == "agente":
        return descobrir_local(segundos)
    if not agente_online():
        raise RuntimeError("Procurar na rede precisa do agente rodando no Mac.")
    f = aguardar(enfileirar("descobrir", None, {"segundos": 6}), 20)
    if f["estado"] != "ok":
        raise RuntimeError(f["erro"])
    res = f["resultado"] if isinstance(f["resultado"], dict) else json.loads(f["resultado"])
    return res["aparelhos"]
