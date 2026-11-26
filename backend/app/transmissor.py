"""Comunicação com os transmissores IR (SRW-004).

O sistema roda em dois papéis:
- "agente" (Mac na rede de casa): fala direto com o transmissor pela rede local e processa a fila.
- "nuvem" (Vercel): não alcança a rede local; grava o comando na fila do Supabase e espera o agente
  executar. Se o agente estiver offline, tenta a nuvem Tuya.
"""
import json
import os
import socket
import struct
import threading
import time

from . import cripto, db, tuya_nuvem

PAPEL = "nuvem" if os.environ.get("VERCEL") else os.environ.get("CLIMA_PAPEL", "agente")
AGENTE_ONLINE_SEG = 45
_travas: dict[str, threading.Lock] = {}


# Varredura UDP da rede (tinytuya.deviceScan) escuta as portas 6666/6667: duas ao mesmo tempo (reparar + autorreparo +
# "Procurar na rede") dão "WinError 10048 / Address already in use". Uma varredura por vez no processo inteiro.
_varredura = threading.Lock()


def _varrer(segundos: int) -> dict:
    import tinytuya   # import local: o módulo não importa tinytuya no topo (a nuvem não precisa dele)
    with _varredura:
        return tinytuya.deviceScan(False, segundos)


def _trava(hub_id):
    return _travas.setdefault(hub_id, threading.Lock())


def _abrir(h: dict) -> dict:
    """Decifra a Local Key (guardada com AES-256-GCM)."""
    if h and h.get("local_key"):
        h["local_key"] = cripto.decifrar(h["local_key"], "hub:local_key")
    return h


def hub(hub_id: str) -> dict:
    h = db.um("SELECT * FROM hubs WHERE id = ?", (hub_id,))
    if not h:
        raise KeyError("Transmissor não encontrado.")
    return _abrir(h)


def agente_online() -> bool:
    visto = db.cfg("agente_visto_em", 0)
    return visto > time.time() - AGENTE_ONLINE_SEG


def porta_aberta(ip: str, porta=6668, timeout=1.5) -> bool:
    try:
        with socket.create_connection((ip, porta), timeout=timeout):
            return True
    except OSError:
        return False


def tipo_padrao(hub_id: str | None = None) -> int:
    """Formato de comando para um transmissor que ainda não tem o seu (ex.: importado de novo pela conta Smart Life, que
    nem sempre informa). Usa o formato dos outros transmissores (mesmo modelo SRW-004) e, sem nenhum, o 1 (dp 201 do
    protocolo 3.3). Antes o envio era recusado com "Formato de comando ainda não definido" até gravar um botão."""
    r = db.um("SELECT control_type, count(*) n FROM hubs WHERE control_type IS NOT NULL AND id <> ? GROUP BY control_type "
              "ORDER BY count(*) DESC LIMIT 1", (hub_id or "",))
    return int(r["control_type"]) if r else 1


# ---------------- execução local (só no agente) ----------------
def _ir(h: dict, tipo=None):
    from tinytuya.Contrib import IRRemoteControlDevice
    if not (h["ip"] and h["local_key"]):
        raise RuntimeError("Transmissor sem IP ou Local Key.")
    tipo = tipo or h["control_type"] or tipo_padrao(h["id"])
    return IRRemoteControlDevice(h["id"], h["ip"], h["local_key"], version=float(h["versao"]), control_type=tipo,
                                 persist=True, connection_timeout=4, connection_retry_limit=1)


def _enviar_local(h: dict, codigo: str, tentou_reparar=False):
    if not porta_aberta(h["ip"]) and not tentou_reparar:
        ok, _ = reparar(h)
        if ok:
            return _enviar_local(hub(h["id"]), codigo, True)
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
    # antes de esperar pelo controle: o transmissor aceita a conexão? Com o protocolo errado ele recusa e a gravação
    # terminava em "Nenhum sinal recebido" mesmo com o controle apontado certo
    diag = diagnosticar(h)
    if diag != "ok":
        novo = _acertar_versao(h)
        if novo:
            h = novo
        elif diag == "chave":
            raise RuntimeError("O transmissor está na rede, mas recusou a conexão (chave ou protocolo). Em Transmissores, "
                               "clique em “Reconectar agora” e grave de novo.")
    for tipo in ([h["control_type"]] if h["control_type"] else [2, 1]):
        codigo = None
        for tentativa in range(2):
            try:
                with _trava(h["id"]):
                    ir = _ir(h, tipo)
                    try:
                        codigo = ir.receive_button(timeout=timeout)
                    finally:
                        ir.close()
                break
            except struct.error:
                # resposta do transmissor cortada no meio (outra conexão aberta ao mesmo tempo, ex.: varredura do
                # autorreparo): o tinytuya quebrava com "unpack requires a buffer of 8 bytes". Espera e escuta de novo.
                if tentativa:
                    raise RuntimeError("O transmissor respondeu pela metade (outra conexão com ele ao mesmo tempo). "
                                       "Espere 10 segundos e grave de novo.")
                time.sleep(2)
        if isinstance(codigo, str) and len(codigo) > 8:
            # Um comando de ar tem de ~100 a 300 pulsos; poucos pulsos = ruído (lâmpada, sol) ou só a ponta do sinal.
            # Antes isso era salvo como "Gravado" e o botão não funcionava.
            from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice
            try:
                pulsos = len(IRRemoteControlDevice.base64_to_pulses(codigo))
            except Exception:  # noqa: BLE001
                pulsos = 0
            if pulsos < 16:
                raise RuntimeError(f"Sinal incompleto ({pulsos} pulsos): aproxime o controle a 5 cm do transmissor, longe de lâmpadas e do sol, "
                                   "e aperte o botão uma vez, firme.")
            return codigo, tipo
    raise RuntimeError("Nenhum sinal recebido. Aponte o controle a 10–20 cm do transmissor e tente de novo.")


def descobrir_local(segundos=8) -> list[dict]:
    import tinytuya
    achados = _varrer(segundos)
    cadastrados = {h["id"] for h in db.consultar("SELECT id FROM hubs")}
    return [{"id": d.get("gwId"), "ip": ip, "versao": d.get("version"), "cadastrado": d.get("gwId") in cadastrados}
            for ip, d in achados.items()]


_falhas_seguidas: dict[str, int] = {}
FALHAS_PARA_OFFLINE = 3  # o SRW-004 aceita poucas conexões: uma falha isolada não é "offline"


def responde(ip: str) -> bool:
    return porta_aberta(ip, timeout=2.5) or (time.sleep(0.4) is None and porta_aberta(ip, timeout=3))


def atualizar_online():
    if PAPEL != "agente":
        return
    for h in db.consultar("SELECT id, ip, online FROM hubs"):
        if h["ip"] and responde(h["ip"]):
            _falhas_seguidas[h["id"]] = 0
            db.executar("UPDATE hubs SET online = 1, visto_em = ? WHERE id = ?", (db.agora(), h["id"]))
        else:
            _falhas_seguidas[h["id"]] = _falhas_seguidas.get(h["id"], 0) + 1
            if _falhas_seguidas[h["id"]] >= FALHAS_PARA_OFFLINE and h["online"]:
                db.executar("UPDATE hubs SET online = 0 WHERE id = ?", (h["id"],))
    try:
        autorreparar()
    except Exception:  # noqa: BLE001  (sem rede/sem nuvem: tenta no próximo ciclo)
        pass


# ---------------- fila no Supabase ----------------
def sem_agente() -> str:
    """Por que um pedido que depende da rede do escritório não vai funcionar agora (texto para a tela)."""
    try:
        from . import coordenador
        maquinas = coordenador.maquinas()
    except Exception:  # noqa: BLE001
        maquinas = []
    principal = next((m for m in maquinas if m.get("principal")), None)
    if not agente_online() or not principal:
        return ("Nenhum computador do escritório está com o agente ligado. Ligue o PC do escritório (ou o Raspberry Pi) "
                "e confira em Infra → Agentes.")
    if not principal.get("ve_transmissores"):
        return (f"O computador no comando ({principal.get('nome')}) não está na rede do escritório e não enxerga os transmissores. "
                "Ligue um computador que esteja no escritório.")
    return f"O agente ({principal.get('nome')}) não respondeu a tempo. Tente de novo em alguns segundos."


def enfileirar(tipo: str, hub_id: str | None, dados: dict, estado: str = "pendente") -> int:
    return db.executar("INSERT INTO fila_comandos (tipo, hub_id, dados, criado_em, estado) VALUES (?, ?, CAST(? AS jsonb), ?, ?)",
                       (tipo, hub_id, json.dumps(dados), db.agora(), estado))


def aguardar(fila_id: int, limite: float) -> dict:
    fim = time.time() + limite
    while time.time() < fim:
        f = db.um("SELECT estado, resultado, erro FROM fila_comandos WHERE id = ?", (fila_id,))
        if f and f["estado"] in ("ok", "erro"):
            return f
        time.sleep(0.4)
    db.executar("UPDATE fila_comandos SET estado = 'erro', erro = 'Tempo esgotado' WHERE id = ? AND estado IN ('pendente', 'qualquer')",
                (fila_id,))
    return {"estado": "erro", "erro": sem_agente()}


# Sinal de infravermelho só vale enquanto a nuvem espera por ele (8 s) e um pouco mais: um pedido que ficou parado
# (agente caiu e voltou) não liga o ar minutos depois de alguém ter visto "não respondeu" na tela.
VALIDADE_ENVIO = 20


def atender_qualquer() -> bool:
    """Pedidos de Infra marcados 'qualquer' (a nuvem viu que o principal roda código antigo e não conhece a operação):
    qualquer agente atualizado que tenha o acesso pedido atende, mesmo de reserva. Agente antigo só lê 'pendente' e nem vê.
    Chamado a cada anúncio (~15 s), uma consulta só."""
    from . import infra
    itens = db.consultar("SELECT id, dados FROM fila_comandos WHERE estado = 'qualquer' AND tipo = 'infra' AND criado_em > ? ORDER BY id LIMIT 5",
                         (db.agora() - 60,))
    for it in itens:
        dados = it["dados"] if isinstance(it["dados"], dict) else json.loads(it["dados"] or "{}")
        if not infra.capaz(dados.get("op", "")):
            continue
        item = db.um("UPDATE fila_comandos SET estado = 'executando', inicio_em = ? WHERE id = ? AND estado = 'qualquer' RETURNING *",
                     (db.agora(), it["id"]))
        if item:
            _infra_pool().submit(_executar_item, item)
    return bool(itens)


def processar_fila_uma_vez() -> bool:
    """Pega o próximo comando pendente (o agente chama isso em laço). Retorna True se processou algo."""
    item = db.um("""UPDATE fila_comandos SET estado = 'executando', inicio_em = ?
                    WHERE id = (SELECT id FROM fila_comandos WHERE estado = 'pendente' AND criado_em > ?
                                AND (tipo <> 'enviar' OR criado_em > ?)
                                ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
                    RETURNING *""", (db.agora(), db.agora() - 120, db.agora() - VALIDADE_ENVIO))
    if not item:
        return False
    if item["tipo"] == "infra":
        # Vercel/Cloudflare podem levar segundos: rodam em paralelo (até 4) para não segurar os comandos de infravermelho
        # nem uns aos outros. Os demais tipos continuam um por vez, na ordem.
        _infra_pool().submit(_executar_item, item)
        return True
    _executar_item(item)
    return True


_infra_exec = None


def _infra_pool():
    global _infra_exec
    if _infra_exec is None:
        from concurrent.futures import ThreadPoolExecutor
        _infra_exec = ThreadPoolExecutor(max_workers=4, thread_name_prefix="infra")
    return _infra_exec


def _executar_item(item):
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
            # reconhece o sinal: no Gree lê o estado e, se a pessoa gravou outro ajuste sem querer, salva no botão certo
            from . import ir_analise
            analise = ir_analise.analisar(codigo, dados["chave"])
            chave = analise.get("chave_certa") or dados["chave"]
            if chave != dados["chave"] and analise.get("estado", {}).get("temperatura") is not None:
                a = db.um("SELECT temp_min, temp_max, modos FROM aparelhos WHERE id = ?", (dados["aparelho_id"],)) or {}
                t, m = analise["estado"]["temperatura"], analise["estado"]["modo"]
                if not (a and a["temp_min"] <= t <= a["temp_max"] and m in (a["modos"] or "").split(",")):
                    chave = dados["chave"]   # fora da faixa do ar: guarda onde foi pedido (o aviso continua)
            _salvar_codigo(dados["aparelho_id"], chave, dados.get("rotulo", ""), codigo)
            resultado = {"tipo": tipo, "analise": analise, "chave_salva": chave}
        elif item["tipo"] == "testar":
            resultado = testar_local(hub(item["hub_id"]))
        elif item["tipo"] == "evento":
            from . import automacao
            automacao.processar_evento(dados["aparelho_id"], dados["origem"], dados["ligado"])
            resultado = {"ok": True}
        elif item["tipo"] == "reparar":
            resultado = {"resultados": autorreparar(forcar=True)}
        elif item["tipo"] == "descobrir":
            resultado = {"aparelhos": descobrir_local(dados.get("segundos", 6))}
        elif item["tipo"] == "infra":   # operação na Vercel com o token que só o agente tem
            from . import infra
            resultado = infra.executar(dados["op"], dados.get("args") or {})
    except Exception as e:  # noqa: BLE001
        erro = str(e)
    db.executar("UPDATE fila_comandos SET estado = ?, resultado = CAST(? AS jsonb), erro = ?, fim_em = ? WHERE id = ?",
                ("erro" if erro else "ok", json.dumps(resultado), erro, db.agora(), item["id"]))


def _salvar_codigo(aparelho_id, chave, rotulo, codigo):
    from .clima import rotulo_chave
    db.executar(
        "INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) VALUES (?,?,?,?,?) "
        "ON CONFLICT(aparelho_id, chave) DO UPDATE SET codigo = excluded.codigo, rotulo = excluded.rotulo, "
        "criado_em = excluded.criado_em", (aparelho_id, chave, rotulo.strip(), codigo, db.agora()))
    db.registrar("agente", f"Botão gravado: {rotulo.strip() or rotulo_chave(chave)}", aparelho_id=aparelho_id)


def laco_agente():
    """Thread do agente: heartbeat + fila.
    A fila é consultada a cada 0,8 s por 2 minutos depois de qualquer comando (comandos em sequência saem rápido) e a cada
    2,5 s com o agente parado. Cada consulta é tráfego no Supabase (cota de 5 GB/mês do plano grátis, estourada em
    22/11/2026 com o agente perguntando toda hora): parado, isso corta mais da metade das consultas."""
    ultimo_batimento = 0
    ultimo_comando = time.time()
    while True:
        try:
            if time.time() - ultimo_batimento > 15:
                db.set_cfg("agente_visto_em", int(time.time()))
                ultimo_batimento = time.time()
            if processar_fila_uma_vez():
                ultimo_comando = time.time()
            else:
                time.sleep(0.8 if time.time() - ultimo_comando < 120 else 2.5)
        except Exception:  # noqa: BLE001  (rede caiu: tenta de novo)
            time.sleep(3)


# ---------------- API usada pelo resto do sistema ----------------
def _avisar_sinric(contexto):
    """Depois do envio: avisa o Sinric (Alexa/Google) do ar comandado e dos que mudaram junto (zona)."""
    if not contexto:
        return
    from . import sinric
    for ap in ([contexto["aparelho"]] if contexto.get("aparelho") else []) + list(contexto.get("juntos") or []):
        sinric.notificar_estado(ap)


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
                raise RuntimeError(sem_agente())
            f = aguardar(enfileirar("enviar", hub_id, {"codigo": codigo, "contexto": contexto}), 8)
            if f["estado"] == "ok":
                return "agente"
            raise RuntimeError(sem_agente() if (f.get("erro") or "").startswith("Tempo esgotado") else f["erro"])
        except Exception as e:  # noqa: BLE001
            erro_local = str(e)
            if modo == "local":
                raise RuntimeError(erro_local)
    if not tuya_nuvem.conectada():
        raise RuntimeError(erro_local or "Conta Smart Life não conectada para envio pela nuvem.")
    funcoes = json.loads(h["funcoes_nuvem"] or "[]")
    if erro_local and not ({"ir_send", "send_ir", "mode"} & set(funcoes)):
        raise RuntimeError(erro_local)   # este transmissor não envia código gravado pela nuvem: o motivo real é o local
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
        raise RuntimeError("Gravar botões precisa do agente num computador do escritório. " + sem_agente())
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
        estado, f["erro"] = "erro", sem_agente()
    return {"id": f["id"], "estado": estado, "erro": f["erro"], "tipo": (res or {}).get("tipo"), "analise": (res or {}).get("analise"),
            "chave_pedida": dados.get("chave"), "chave_salva": (res or {}).get("chave_salva"),
            "restante": max(0, int(inicio + dados.get("duracao", 30) - time.time()))}


def _redes_do_agente() -> list[str]:
    """Prefixos /24 onde procurar um transmissor: a rede deste computador e a dos transmissores já cadastrados."""
    prefixos = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))   # UDP não envia nada: só descobre o IP da rota padrão
        prefixos.add(s.getsockname()[0].rsplit(".", 1)[0])
        s.close()
    except OSError:
        pass
    for o in db.consultar("SELECT ip FROM hubs WHERE COALESCE(ip, '') <> ''"):
        if o["ip"].startswith(("192.168.", "10.", "172.")):
            prefixos.add(o["ip"].rsplit(".", 1)[0])
    return sorted(p for p in prefixos if not p.startswith("127."))[:3]


def localizar(h: dict, limite_s: float = 40) -> dict:
    """Acha o IP de um transmissor que está sem IP (importado da nuvem, que só conhece o IP público).
    1) varredura UDP (o transmissor se anuncia a cada ~5 s); 2) se nada vier (firewall do Windows no perfil "Público",
    roteador que não repassa broadcast), procura a porta 6668 nas redes do agente e confirma com a Local Key.
    Devolve {ip, versao, como} ou {ip: None, detalhe}."""
    from concurrent.futures import ThreadPoolExecutor
    fim = time.time() + limite_s
    try:
        achados = _varrer(8)
    except Exception:  # noqa: BLE001
        achados = {}
    for ip, d in achados.items():
        if d.get("gwId") == h["id"]:
            return {"ip": ip, "versao": d.get("version") or h.get("versao"), "como": "anúncio na rede"}
    ocupados = set(achados) | {o["ip"] for o in db.consultar("SELECT ip FROM hubs WHERE id <> ? AND COALESCE(ip, '') <> ''", (h["id"],))}
    redes = _redes_do_agente()
    ips = [f"{p}.{i}" for p in redes for i in range(1, 255) if f"{p}.{i}" not in ocupados]
    with ThreadPoolExecutor(64) as ex:
        abertos = [ip for ip, ok in zip(ips, ex.map(lambda i: porta_aberta(i, timeout=0.6), ips)) if ok]
    versoes = [str(h.get("versao") or "3.3")] + [v for v in VERSOES_TUYA if v != str(h.get("versao") or "3.3")]
    if h.get("local_key"):
        for ip in abertos:
            for v in versoes:
                if time.time() > fim:
                    break
                try:
                    if diagnosticar({**h, "ip": ip, "versao": v}) == "ok":
                        return {"ip": ip, "versao": v, "como": "procura pela porta 6668"}
                except Exception:  # noqa: BLE001
                    pass
    return {"ip": None, "redes": redes, "anunciados": len(achados), "portas": len(abertos)}


def testar_local(h: dict) -> dict:
    """Teste de conexão de um transmissor (no agente): chega na rede? a chave e o protocolo estão certos?
    Se outro protocolo funcionar, grava o certo. Sem IP, procura o transmissor na rede antes de desistir.
    Devolve o que a tela precisa para dizer o próximo passo."""
    t0 = time.time()
    if not h.get("ip"):
        achou = localizar(h)
        if achou["ip"]:
            db.executar("UPDATE hubs SET ip = ?, versao = ?, problema = NULL WHERE id = ?", (achou["ip"], achou["versao"], h["id"]))
            db.registrar("sistema", f"Transmissor {h['nome']}: IP encontrado na rede", detalhe=f"{achou['ip']} (protocolo {achou['versao']}, {achou['como']})")
            h = hub(h["id"])
        else:
            redes = ", ".join(f"{p}.x" for p in achou["redes"]) or "nenhuma"
            nuvem = ""
            try:
                online = next((d["online"] for d in tuya_nuvem.listar_aparelhos() if d["id"] == h["id"]), None)
                if online is not None:
                    nuvem = (" Na conta Smart Life ele aparece online: está no Wi-Fi, mas numa rede que este computador não alcança."
                             if online else " Na conta Smart Life ele aparece offline: confira se está na tomada e no Wi-Fi 2,4 GHz.")
            except Exception:  # noqa: BLE001
                pass
            return {"etapa": "ip", "ok": False, "ms": round((time.time() - t0) * 1000),
                    "mensagem": f"Este computador ({socket.gethostname()}) procurou o transmissor nas redes {redes} e não achou "
                                f"({achou['anunciados']} aparelho(s) Tuya se anunciaram, {achou['portas']} porta(s) 6668 abertas).{nuvem} "
                                "Ligue o agente num computador do mesmo Wi-Fi do transmissor ou digite o IP em Editar."}
    if not h.get("local_key"):
        return {"etapa": "chave", "ok": False, "mensagem": "Falta a Local Key: importe da conta Smart Life (traz a chave sozinho) ou cole em Editar."}
    if not porta_aberta(h["ip"], timeout=3):
        return {"etapa": "rede", "ok": False, "ms": round((time.time() - t0) * 1000),
                "mensagem": f"Nada respondeu em {h['ip']}: confira se o transmissor está na tomada, no Wi-Fi 2,4 GHz do escritório e se este agente está na mesma rede. "
                            "Se ele mudou de IP, “Reconectar agora” procura sozinho."}
    diag = diagnosticar(h)
    versao = h.get("versao")
    if diag != "ok":
        novo = _acertar_versao(h)
        if novo:
            diag, versao = "ok", novo["versao"]
    ms = round((time.time() - t0) * 1000)
    if diag == "ok":
        db.executar("UPDATE hubs SET online = 1, visto_em = ?, problema = NULL WHERE id = ?", (db.agora(), h["id"]))
        return {"etapa": "ok", "ok": True, "versao": versao, "ms": ms, "mensagem": f"Transmissor respondendo (protocolo {versao}, {ms} ms). Pronto para gravar botões."}
    if diag == "chave":
        return {"etapa": "chave", "ok": False, "ms": ms, "mensagem": "Está na rede, mas recusou a chave: ele foi pareado de novo no Smart Life. Importe de novo da conta (traz a chave nova) ou use “Reconectar agora”."}
    return {"etapa": "rede", "ok": False, "ms": ms, "mensagem": "A porta respondeu, mas o transmissor não completou a conversa. Tire da tomada por 10 segundos e teste de novo."}


def testar(hub_id: str) -> dict:
    if PAPEL == "agente":
        return testar_local(hub(hub_id))
    if not agente_online():
        return {"etapa": "agente", "ok": False, "mensagem": sem_agente()}
    f = aguardar(enfileirar("testar", hub_id, {}), 55)   # sem IP, o agente procura na rede (até ~50 s)
    if f["estado"] != "ok":
        return {"etapa": "agente", "ok": False, "mensagem": f["erro"] or "O agente não respondeu a tempo. " + sem_agente()}
    return f["resultado"] if isinstance(f["resultado"], dict) else json.loads(f["resultado"])


def descobrir(segundos=8) -> list[dict]:
    if PAPEL == "agente":
        return descobrir_local(segundos)
    if not agente_online():
        raise RuntimeError(sem_agente())
    f = aguardar(enfileirar("descobrir", None, {"segundos": 6}), 20)
    if f["estado"] != "ok":
        raise RuntimeError(f["erro"])
    res = f["resultado"] if isinstance(f["resultado"], dict) else json.loads(f["resultado"])
    return res["aparelhos"]


# ---------------- reconfiguração automática (mudou de rede ou foi pareado de novo) ----------------
# Respostas do SRW-004 ao status(): 900 = chave certa (IR não tem estado), 914 = chave errada (novo
# pareamento gera outra Local Key), 905/901 = não encontrado no IP (mudou de rede ou de endereço).
_ultimo_reparo: dict[str, float] = {}
_ultima_checagem_chave = 0.0
INTERVALO_REPARO = 120          # tenta de novo no máximo a cada 2 min por transmissor
INTERVALO_CHAVE = 600           # confere a chave dos online a cada 10 min


def diagnosticar(h: dict) -> str:
    """'ok', 'chave' (Local Key velha) ou 'rede' (não responde no IP)."""
    import tinytuya
    if not (h.get("ip") and h.get("local_key")):
        return "rede" if not h.get("ip") else "chave"
    with _trava(h["id"]):
        d = tinytuya.Device(h["id"], h["ip"], h["local_key"], version=float(h["versao"]),
                            connection_timeout=4, connection_retry_limit=1)
        r = d.status() or {}
        tipo_disp = getattr(d, "dev_type", "")
        d.close()
    err = str(r.get("Err", "")) if isinstance(r, dict) else ""
    if err == "914":
        return "chave"
    # SRW-004 v3.3 ("device22"): responde e decifra (a troca de formato prova que a chave está certa), mas não devolve status.
    # Sem isto o diagnóstico dizia "rede" e o autorreparo mexia num transmissor que funciona.
    if not r and tipo_disp == "device22" and porta_aberta(h["ip"]):
        return "ok"
    if err in ("905", "901", "902") or not r:
        return "rede"
    return "ok"


VERSOES_TUYA = ("3.3", "3.4", "3.5")


def _acertar_versao(h: dict) -> dict | None:
    """Testa as outras versões do protocolo Tuya e grava a que responder com certeza ("ok" no diagnóstico).
    Por que existe: o transmissor pode vir cadastrado com a versão errada (a importação pela nuvem não sabe qual é e a
    varredura UDP às vezes informa outra). Com a versão errada ele recusa a conexão e a gravação dizia só "Nenhum sinal
    recebido". Só troca quando outra versão funciona; senão devolve None e nada muda."""
    if not (h.get("ip") and h.get("local_key")) or not porta_aberta(h["ip"]):
        return None
    atual = str(h.get("versao") or "")
    for v in VERSOES_TUYA:
        if v == atual:
            continue
        try:
            ok = diagnosticar({**h, "versao": v}) == "ok"
        except Exception:  # noqa: BLE001
            ok = False
        if ok:
            db.executar("UPDATE hubs SET versao = ? WHERE id = ?", (v, h["id"]))
            db.registrar("sistema", f"Transmissor {h['nome']}: protocolo corrigido", detalhe=f"{atual or '—'} → {v}")
            return hub(h["id"])
    return None


def _registrar_reparo(h: dict, mudancas: list[str]):
    db.executar("UPDATE hubs SET problema = NULL, reparado_em = ?, online = 1, visto_em = ? WHERE id = ?",
                (db.agora(), db.agora(), h["id"]))
    db.registrar("sistema", f"Transmissor reconfigurado sozinho: {h['nome']}", detalhe="; ".join(mudancas))
    from . import notificacoes
    notificacoes.notificar(f"reconfig-{h['id']}", "sistema", "baixa", f"Transmissor {h['nome']} se reconfigurou sozinho",
                           "; ".join(mudancas), "/transmissores")


def _migrar_id(antigo: dict, novo_id: str) -> dict:
    """O pareamento gerou outro ID: cria o novo cadastro, passa os aparelhos e apaga o antigo."""
    db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, control_type, funcoes_nuvem, projeto_id, criado_em) "
                "VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING",
                (novo_id, antigo["nome"], antigo["ip"], cripto.cifrar(antigo["local_key"], "hub:local_key"), antigo["versao"], antigo["control_type"],
                 antigo["funcoes_nuvem"], antigo["projeto_id"], db.agora()))
    db.executar("UPDATE aparelhos SET hub_id = ? WHERE hub_id = ?", (novo_id, antigo["id"]))
    db.executar("DELETE FROM hubs WHERE id = ?", (antigo["id"],))
    return hub(novo_id)


def reparar(h: dict, varredura: dict | None = None) -> tuple[bool, str]:
    """Tenta deixar o transmissor funcionando sozinho. Retorna (ok, mensagem)."""
    mudancas: list[str] = []
    diag = diagnosticar(h)
    if diag == "ok":
        if h.get("problema"):
            db.executar("UPDATE hubs SET problema = NULL WHERE id = ?", (h["id"],))
        return True, "funcionando"

    # 0) responde na rede, mas recusa a conexão: pode ser só o protocolo cadastrado errado
    if h.get("ip") and h.get("local_key"):
        novo = _acertar_versao(h)
        if novo:
            mudancas.append(f"protocolo {h.get('versao') or '—'} → {novo['versao']}")
            h, diag = novo, "ok"

    # 1) IP novo: procura o mesmo aparelho na rede pelo ID
    if diag == "rede":
        if varredura is None:
            import tinytuya
            varredura = {d.get("gwId"): {"ip": ip, "versao": d.get("version")} for ip, d in _varrer(6).items()}
        achado = varredura.get(h["id"])
        if achado:
            if achado["ip"] != h["ip"]:
                mudancas.append(f"IP {h['ip'] or '—'} → {achado['ip']}")
            db.executar("UPDATE hubs SET ip = ?, versao = COALESCE(?, versao) WHERE id = ?",
                        (achado["ip"], achado.get("versao"), h["id"]))
            h = hub(h["id"])
            diag = diagnosticar(h)

    # 2) Chave nova (ou aparelho não achado na rede): pergunta à conta Smart Life
    if diag != "ok":
        if not tuya_nuvem.conectada():
            msg = ("Local Key mudou (o transmissor foi pareado de novo)." if diag == "chave" else "Não encontrado na rede.") + \
                  " Conecte a conta Smart Life em Configurações → Contas para o sistema se ajustar sozinho."
            db.executar("UPDATE hubs SET problema = ? WHERE id = ?", (msg, h["id"]))
            return False, msg
        try:
            ids_nuvem = {d["id"]: d for d in tuya_nuvem.listar_aparelhos() if d["transmissor_ir"]}
            # pareado de novo com outro ID: o antigo some da conta OU fica nela offline (o Smart Life não apaga sozinho)
            if h["id"] not in ids_nuvem or not ids_nuvem[h["id"]].get("online"):
                cadastrados = {x["id"] for x in db.consultar("SELECT id FROM hubs")}
                novos = [i for i in ids_nuvem if i not in cadastrados and (h["id"] not in ids_nuvem or ids_nuvem[i].get("online"))]
                if len(novos) == 1:
                    h = _migrar_id(h, novos[0])
                    mudancas.append(f"novo ID {novos[0]}")
                elif h["id"] not in ids_nuvem:   # sumiu da conta e não dá para saber qual é o novo
                    raise RuntimeError("não está mais na conta Smart Life" + (" e há vários transmissores novos; importe pela tela" if novos else ""))
                # na conta, offline e sem um novo óbvio: segue o fluxo normal (pode só estar sem energia)
            info = tuya_nuvem.detalhes(h["id"])
            ip = info["ip"] if (info.get("ip") or "").startswith(("192.168.", "10.", "172.")) else None
            if varredura and varredura.get(h["id"]):
                ip = varredura[h["id"]]["ip"]
            db.executar("UPDATE hubs SET local_key = ?, ip = COALESCE(?, ip), control_type = COALESCE(?, control_type), "
                        "funcoes_nuvem = ? WHERE id = ?",
                        (cripto.cifrar(info["local_key"], "hub:local_key"), ip, info["control_type"], json.dumps(info["funcoes"]), h["id"]))
            mudancas.append("Local Key atualizada pela conta Smart Life")
            h = hub(h["id"])
            if ip is None and diagnosticar(h) == "rede":  # IP ainda desconhecido: varre de novo com a chave certa
                import tinytuya
                for ip_achado, d in _varrer(6).items():
                    if d.get("gwId") == h["id"]:
                        db.executar("UPDATE hubs SET ip = ? WHERE id = ?", (ip_achado, h["id"]))
                        mudancas.append(f"IP → {ip_achado}")
                h = hub(h["id"])
            diag = diagnosticar(h)
            if diag != "ok":   # chave nova certa, mas o protocolo cadastrado pode estar errado
                novo = _acertar_versao(h)
                if novo:
                    mudancas.append(f"protocolo {h.get('versao') or '—'} → {novo['versao']}")
                    h, diag = novo, "ok"
        except Exception as e:  # noqa: BLE001
            msg = f"Não foi possível se ajustar sozinho: {e}"
            db.executar("UPDATE hubs SET problema = ? WHERE id = ?", (msg[:300], h["id"]))
            return False, msg

    if diag == "ok":
        _registrar_reparo(h, mudancas or ["reconectado"])
        return True, "; ".join(mudancas) or "reconectado"
    msg = "Transmissor fora da rede. Confira se ele e o Mac estão no mesmo Wi-Fi (2,4 GHz)."
    db.executar("UPDATE hubs SET problema = ? WHERE id = ?", (msg, h["id"]))
    return False, msg


def autorreparar(forcar: bool = False) -> list[dict]:
    """Chamado pelo laço do agente: repara offline e confere a chave dos online de tempos em tempos."""
    global _ultima_checagem_chave
    if PAPEL != "agente":
        return []
    agora = time.time()
    checar_chave = forcar or agora - _ultima_checagem_chave > INTERVALO_CHAVE
    if checar_chave:
        _ultima_checagem_chave = agora
    resultados, varredura = [], None
    for h in map(_abrir, db.consultar("SELECT * FROM hubs")):
        precisa = forcar or (not h["online"] and _falhas_seguidas.get(h["id"], FALHAS_PARA_OFFLINE) >= FALHAS_PARA_OFFLINE) or h["problema"] or checar_chave
        if not precisa or (not forcar and agora - _ultimo_reparo.get(h["id"], 0) < INTERVALO_REPARO and h["online"]):
            continue
        if not forcar and not h["online"] and agora - _ultimo_reparo.get(h["id"], 0) < INTERVALO_REPARO:
            continue
        _ultimo_reparo[h["id"]] = agora
        if varredura is None and (not h["online"] or forcar):
            import tinytuya
            varredura = {d.get("gwId"): {"ip": ip, "versao": d.get("version")} for ip, d in _varrer(6).items()}
        ok, msg = reparar(h, varredura)
        resultados.append({"id": h["id"], "nome": h["nome"], "ok": ok, "mensagem": msg})
    return resultados
