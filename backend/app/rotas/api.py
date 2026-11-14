"""Rotas da API usadas pela interface (todas exigem login, exceto as de autenticação)."""
import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import clima, db, transmissor, tuya_nuvem
from ..seguranca import exigir_login

publico = APIRouter(prefix="/api")
api = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])


def _erro(e: Exception):
    if isinstance(e, KeyError):
        raise HTTPException(404, e.args[0] if e.args else "Não encontrado.")
    if isinstance(e, ValueError):
        raise HTTPException(400, str(e))
    raise HTTPException(502, str(e))


# ---------------- autenticação (Supabase Auth, só login, sem cadastro) ----------------
@publico.get("/supabase-config")
def supabase_config():
    """Dados públicos para o navegador fazer login no Supabase (chave publishable, nunca a secret)."""
    return {"url": db.ENV["SUPABASE_URL"], "chave": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}


@api.get("/sessao")
def sessao(request: Request):
    u = request.state.usuario
    return {"logado": True, "email": u.get("email"), "ultimo_login": u.get("last_sign_in_at")}


@api.post("/sessao/registrar-login")
def registrar_login(request: Request):
    db.registrar("sistema", "Login do administrador", detalhe=request.state.usuario.get("email", ""))
    return {"ok": True}


# ---------------- painel ----------------
def _filtro_projeto(projeto_id, alias="a"):
    return (f" WHERE {alias}.projeto_id = ?", (projeto_id,)) if projeto_id else ("", ())


@api.get("/painel")
def painel(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id)
    aparelhos = db.consultar(f"""
        SELECT a.*, h.nome AS hub_nome, h.online AS hub_online, pr.nome AS projeto_nome,
               (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS total_codigos
        FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id LEFT JOIN projetos pr ON pr.id = a.projeto_id
        {w} ORDER BY a.comodo, a.nome""", p)
    wh, ph = _filtro_projeto(projeto_id, "h")
    hubs = db.consultar(f"SELECT h.id, h.nome, h.online FROM hubs h{wh}", ph)
    hoje = int(time.time()) - 86400
    return {
        "totais": {
            "aparelhos": len(aparelhos),
            "ligados": sum(1 for a in aparelhos if a["ligado"]),
            "hubs": len(hubs),
            "hubs_online": sum(1 for h in hubs if h["online"]),
            "agendamentos": db.um("SELECT COUNT(*) n FROM agendamentos WHERE ativo = 1")["n"],
            "comandos_24h": db.um("SELECT COUNT(*) n FROM atividade WHERE quando > ? AND aparelho_id IS NOT NULL",
                                  (hoje,))["n"],
            "falhas_24h": db.um("SELECT COUNT(*) n FROM atividade WHERE quando > ? AND ok = 0", (hoje,))["n"],
        },
        "aparelhos": aparelhos,
        "atividade": _atividade(8),
        "projetos": db.um("SELECT COUNT(*) n FROM projetos")["n"],
        "sinric": (db.cfg("sinric_status") or {}).get("conectado", False),
        "nuvem": tuya_nuvem.conectada(),
        "alertas": db.um("SELECT COUNT(*) n FROM alertas WHERE NOT resolvido")["n"],
        "agente": {"online": transmissor.agente_online(), "visto_em": db.cfg("agente_visto_em"),
                   "papel": transmissor.PAPEL},
        "alexa": bool(db.um("SELECT 1 FROM oauth_tokens WHERE tipo = 'refresh' AND expira > ?", (db.agora(),))),
    }


def _atividade(limite, aparelho_id=None, origem=None, so_falhas=False, antes=None):
    sql = ("SELECT t.*, a.nome AS aparelho_nome FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id "
           "WHERE 1=1")
    p = []
    if aparelho_id:
        sql += " AND t.aparelho_id = ?"; p.append(aparelho_id)
    if origem:
        sql += " AND (t.origem = ? OR t.origem LIKE ?)"; p += [origem, origem + ":%"]
    if so_falhas:
        sql += " AND t.ok = 0"
    if antes:
        sql += " AND t.id < ?"; p.append(antes)
    sql += " ORDER BY t.id DESC LIMIT ?"; p.append(limite)
    return db.consultar(sql, p)


@api.get("/atividade")
def atividade(aparelho_id: int | None = None, origem: str | None = None, falhas: bool = False,
              antes: int | None = None, limite: int = 50):
    return _atividade(min(limite, 200), aparelho_id, origem, falhas, antes)


# ---------------- aparelhos ----------------
class AparelhoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    comodo: str = Field("", max_length=40)
    marca: str = Field("", max_length=40)
    hub_id: str | None = None
    temp_min: int = Field(16, ge=10, le=35)
    temp_max: int = Field(30, ge=10, le=35)
    modos: list[str] = list(clima.MODOS)
    alexa: bool = True
    projeto_id: int | None = None


def _validar_aparelho(d: AparelhoIn):
    if d.temp_min >= d.temp_max:
        raise HTTPException(400, "A temperatura mínima precisa ser menor que a máxima.")
    if not d.modos or any(m not in clima.MODOS for m in d.modos):
        raise HTTPException(400, "Escolha ao menos um modo válido.")
    if d.hub_id and not db.um("SELECT 1 FROM hubs WHERE id = ?", (d.hub_id,)):
        raise HTTPException(400, "Transmissor não encontrado.")


@api.get("/aparelhos")
def listar_aparelhos(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id)
    return db.consultar(f"""
        SELECT a.*, h.nome AS hub_nome, h.online AS hub_online, pr.nome AS projeto_nome,
               (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS total_codigos
        FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id LEFT JOIN projetos pr ON pr.id = a.projeto_id
        {w} ORDER BY pr.nome, a.comodo, a.nome""", p)


@api.post("/aparelhos")
def criar_aparelho(d: AparelhoIn):
    _validar_aparelho(d)
    temp = max(d.temp_min, min(d.temp_max, 23))
    projeto = d.projeto_id or (db.um("SELECT projeto_id FROM hubs WHERE id = ?", (d.hub_id,)) or {}).get("projeto_id")
    novo = db.executar(
        "INSERT INTO aparelhos (nome, comodo, marca, hub_id, temp_min, temp_max, modos, alexa, temperatura, modo, "
        "projeto_id, criado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (d.nome.strip(), d.comodo.strip(), d.marca.strip(), d.hub_id, d.temp_min, d.temp_max, ",".join(d.modos),
         int(d.alexa), temp, d.modos[0], projeto, db.agora()))
    db.registrar("painel", "Aparelho adicionado", aparelho_id=novo, detalhe=d.nome)
    _sinric_automatico(novo)
    return clima.aparelho(novo)


def _sinric_automatico(aid: int):
    """Cria o dispositivo no Sinric Pro (Alexa/Google) sozinho, se a automação estiver ligada."""
    from .. import sinric
    cfg = sinric.config()
    a = clima.aparelho(aid)
    if not (cfg.get("ativo") and cfg.get("automatico", True) and cfg.get("api_key") and a["alexa"]) or a["sinric_device_id"]:
        return
    try:
        dev = sinric.criar_dispositivo(a)
        db.executar("UPDATE aparelhos SET sinric_device_id = ? WHERE id = ?", (dev, aid))
        db.registrar("sistema", "Criado no Sinric Pro (Alexa/Google)", aparelho_id=aid, detalhe=dev)
    except Exception as e:  # noqa: BLE001  (o aparelho fica salvo; dá para tentar de novo em Integrações)
        db.registrar("sistema", "Não foi possível criar no Sinric Pro", ok=False, aparelho_id=aid, detalhe=str(e))


@api.get("/aparelhos/{aid}")
def ver_aparelho(aid: int):
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    cods = db.consultar("SELECT id, chave, rotulo, criado_em FROM codigos WHERE aparelho_id = ? ORDER BY chave", (aid,))
    for c in cods:
        c["descricao"] = c["rotulo"] or clima.rotulo_chave(c["chave"])
    hub = db.um("SELECT id, nome, online, ip, control_type FROM hubs WHERE id = ?", (a["hub_id"],)) if a["hub_id"] else None
    return {**a, "codigos": cods, "hub": hub, "atividade": _atividade(15, aid)}


@api.put("/aparelhos/{aid}")
def editar_aparelho(aid: int, d: AparelhoIn):
    _validar_aparelho(d)
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    temp = max(d.temp_min, min(d.temp_max, a["temperatura"]))
    modo = a["modo"] if a["modo"] in d.modos else d.modos[0]
    db.executar("UPDATE aparelhos SET nome=?, comodo=?, marca=?, hub_id=?, temp_min=?, temp_max=?, modos=?, alexa=?, "
                "temperatura=?, modo=?, projeto_id=? WHERE id=?",
                (d.nome.strip(), d.comodo.strip(), d.marca.strip(), d.hub_id, d.temp_min, d.temp_max,
                 ",".join(d.modos), int(d.alexa), temp, modo, d.projeto_id, aid))
    db.registrar("painel", "Aparelho editado", aparelho_id=aid)
    return clima.aparelho(aid)


@api.delete("/aparelhos/{aid}")
def apagar_aparelho(aid: int):
    a = db.um("SELECT nome, sinric_device_id FROM aparelhos WHERE id = ?", (aid,))
    if not a:
        raise HTTPException(404, "Aparelho não encontrado.")
    if a["sinric_device_id"]:
        from .. import sinric
        try:
            sinric.apagar_dispositivo(a["sinric_device_id"])
        except Exception:  # noqa: BLE001
            pass
    db.executar("DELETE FROM aparelhos WHERE id = ?", (aid,))
    db.registrar("painel", "Aparelho removido", detalhe=a["nome"])
    return {"ok": True}


class EstadoIn(BaseModel):
    ligado: bool | None = None
    modo: str | None = None
    temperatura: int | None = None
    ventilador: str | None = None


@api.post("/aparelhos/{aid}/estado")
def mudar_estado(aid: int, d: EstadoIn):
    try:
        return clima.aplicar(aid, "painel", **d.model_dump())
    except Exception as e:  # noqa: BLE001
        _erro(e)


@api.post("/aparelhos/{aid}/botoes/{chave}/enviar")
def enviar_botao(aid: int, chave: str):
    try:
        return {"via": clima.enviar_extra(aid, chave, "painel")}
    except Exception as e:  # noqa: BLE001
        _erro(e)


class AprenderIn(BaseModel):
    chave: str
    rotulo: str = Field("", max_length=40)


@api.post("/aparelhos/{aid}/aprender")
def aprender(aid: int, d: AprenderIn):
    try:
        a = clima.aparelho(aid)
        clima.validar_chave(d.chave)
        if not a["hub_id"]:
            raise RuntimeError("Vincule um transmissor ao aparelho antes de gravar botões.")

        return {"job": transmissor.iniciar_aprendizado(a["hub_id"], aid, d.chave, d.rotulo)}
    except Exception as e:  # noqa: BLE001
        _erro(e)


@api.get("/gravacoes/{job_id}")
def andamento(job_id: int):
    try:
        return transmissor.job(job_id)
    except KeyError as e:
        _erro(e)


@api.delete("/aparelhos/{aid}/botoes/{chave}")
def apagar_botao(aid: int, chave: str):
    db.executar("DELETE FROM codigos WHERE aparelho_id = ? AND chave = ?", (aid, chave))
    db.registrar("painel", f"Botão apagado: {clima.rotulo_chave(chave)}", aparelho_id=aid)
    return {"ok": True}


@api.get("/catalogo")
def catalogo():
    return {"modos": clima.MODOS, "ventilacao": clima.VENTILACAO}


# ---------------- transmissores ----------------
class HubIn(BaseModel):
    id: str = Field(min_length=10, max_length=40)
    nome: str = Field(min_length=1, max_length=60)
    ip: str = ""
    local_key: str = ""
    versao: str = "3.5"
    projeto_id: int | None = None


class HubEdit(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    ip: str = ""
    versao: str = "3.5"
    local_key: str | None = None
    projeto_id: int | None = None


def _hub_publico(h):
    h = dict(h)
    h["tem_chave"] = bool(h.pop("local_key", None))
    h["funcoes_nuvem"] = json.loads(h["funcoes_nuvem"] or "[]")
    h["aparelhos"] = db.um("SELECT COUNT(*) n FROM aparelhos WHERE hub_id = ?", (h["id"],))["n"]
    return h


@api.get("/hubs")
def listar_hubs(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id, "h")
    return [_hub_publico(h) for h in db.consultar(
        f"SELECT h.*, pr.nome AS projeto_nome FROM hubs h LEFT JOIN projetos pr ON pr.id = h.projeto_id{w} ORDER BY h.nome", p)]


@api.post("/hubs/verificar")
def verificar_hubs():
    transmissor.atualizar_online()
    return listar_hubs()


@api.get("/hubs/descobrir")
def descobrir_hubs():
    try:
        return transmissor.descobrir()
    except Exception as e:  # noqa: BLE001
        _erro(e)


@api.post("/hubs")
def criar_hub(d: HubIn):
    if db.um("SELECT 1 FROM hubs WHERE id = ?", (d.id,)):
        raise HTTPException(409, "Esse transmissor já está cadastrado.")
    db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, projeto_id, criado_em) VALUES (?,?,?,?,?,?,?)",
                (d.id.strip(), d.nome.strip(), d.ip.strip(), d.local_key.strip(), d.versao,
                 d.projeto_id or (db.um("SELECT min(id) AS id FROM projetos") or {}).get("id"), db.agora()))
    transmissor.atualizar_online()
    db.registrar("painel", "Transmissor adicionado", detalhe=d.nome)
    return _hub_publico(transmissor.hub(d.id))


@api.post("/hubs/importar/{device_id}")
def importar_hub(device_id: str):
    """Cadastra (ou atualiza) um transmissor a partir da conta Smart Life: traz Local Key e formato."""
    try:
        info = tuya_nuvem.detalhes(device_id)
    except Exception as e:  # noqa: BLE001
        _erro(e)
    ip = info["ip"] if info["ip"] and info["ip"].startswith(("192.168.", "10.", "172.")) else ""
    if not ip:
        try:
            local = {d["id"]: d for d in transmissor.descobrir(6)}
        except Exception:  # noqa: BLE001  (sem agente: fica sem IP, dá para editar depois)
            local = {}
        ip = local.get(device_id, {}).get("ip", "")
        versao = local.get(device_id, {}).get("versao") or "3.5"
    else:
        versao = "3.5"
    existente = db.um("SELECT * FROM hubs WHERE id = ?", (device_id,))
    if existente:
        db.executar("UPDATE hubs SET local_key = ?, control_type = COALESCE(?, control_type), funcoes_nuvem = ?, "
                    "ip = COALESCE(NULLIF(?, ''), ip) WHERE id = ?",
                    (info["local_key"], info["control_type"], json.dumps(info["funcoes"]), ip, device_id))
    else:
        db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, control_type, funcoes_nuvem, projeto_id, criado_em) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (device_id, info["nome"], ip, info["local_key"], versao, info["control_type"],
                     json.dumps(info["funcoes"]), (db.um("SELECT min(id) AS id FROM projetos") or {}).get("id"), db.agora()))
    transmissor.atualizar_online()
    db.registrar("painel", "Transmissor importado da conta Smart Life", detalhe=info["nome"])
    return _hub_publico(transmissor.hub(device_id))


@api.put("/hubs/{hub_id}")
def editar_hub(hub_id: str, d: HubEdit):
    try:
        transmissor.hub(hub_id)
    except KeyError as e:
        _erro(e)
    db.executar("UPDATE hubs SET nome = ?, ip = ?, versao = ?, projeto_id = ? WHERE id = ?",
                (d.nome.strip(), d.ip.strip(), d.versao, d.projeto_id, hub_id))
    if d.local_key:
        db.executar("UPDATE hubs SET local_key = ? WHERE id = ?", (d.local_key.strip(), hub_id))
    transmissor.atualizar_online()
    return _hub_publico(transmissor.hub(hub_id))


@api.delete("/hubs/{hub_id}")
def apagar_hub(hub_id: str):
    db.executar("DELETE FROM hubs WHERE id = ?", (hub_id,))
    db.registrar("painel", "Transmissor removido", detalhe=hub_id)
    return {"ok": True}


# ---------------- agendamentos ----------------
class AgendaIn(BaseModel):
    aparelho_id: int
    nome: str = Field(min_length=1, max_length=60)
    dias: list[int]
    hora: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    ligado: bool
    modo: str | None = None
    temperatura: int | None = None
    ventilador: str | None = None
    ativo: bool = True


def _acao(d: AgendaIn):
    if not d.dias or any(x not in range(7) for x in d.dias):
        raise HTTPException(400, "Escolha ao menos um dia da semana.")
    if not db.um("SELECT 1 FROM aparelhos WHERE id = ?", (d.aparelho_id,)):
        raise HTTPException(400, "Aparelho não encontrado.")
    acao = {"ligado": d.ligado}
    if d.ligado:
        acao.update({k: v for k, v in {"modo": d.modo, "temperatura": d.temperatura, "ventilador": d.ventilador}.items() if v is not None})
    return json.dumps(acao)


def _agenda_publica(r):
    r["dias"] = [int(x) for x in r["dias"].split(",") if x]
    r["acao"] = json.loads(r["acao"])
    return r


@api.get("/agendamentos")
def listar_agendamentos():
    return [_agenda_publica(r) for r in db.consultar(
        "SELECT g.*, a.nome AS aparelho_nome FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id "
        "ORDER BY g.hora")]


@api.post("/agendamentos")
def criar_agendamento(d: AgendaIn):
    novo = db.executar("INSERT INTO agendamentos (aparelho_id, nome, dias, hora, acao, ativo, criado_em) VALUES (?,?,?,?,?,?,?)",
                       (d.aparelho_id, d.nome.strip(), ",".join(map(str, sorted(set(d.dias)))), d.hora, _acao(d),
                        int(d.ativo), db.agora()))
    db.registrar("painel", f"Agendamento criado: {d.nome}", aparelho_id=d.aparelho_id)
    return {"id": novo}


@api.put("/agendamentos/{gid}")
def editar_agendamento(gid: int, d: AgendaIn):
    db.executar("UPDATE agendamentos SET aparelho_id=?, nome=?, dias=?, hora=?, acao=?, ativo=? WHERE id=?",
                (d.aparelho_id, d.nome.strip(), ",".join(map(str, sorted(set(d.dias)))), d.hora, _acao(d),
                 int(d.ativo), gid))
    return {"ok": True}


@api.delete("/agendamentos/{gid}")
def apagar_agendamento(gid: int):
    db.executar("DELETE FROM agendamentos WHERE id = ?", (gid,))
    return {"ok": True}


# ---------------- configurações e conta Smart Life ----------------
class ConfigIn(BaseModel):
    modo_envio: str = Field(pattern="^(auto|local|nuvem)$")
    nome_casa: str = Field("Minha casa", max_length=40)


@api.get("/config")
def ver_config():
    conta = db.cfg("tuya_conta")
    return {
        "modo_envio": db.cfg("modo_envio", "auto"),
        "nome_casa": db.cfg("nome_casa", "Minha casa"),
        "tuya": {"conectada": bool(conta), "usuario": (conta or {}).get("usuario", ""),
                 "user_code": (conta or {}).get("user_code", "")},
    }


@api.put("/config")
def salvar_config(d: ConfigIn):
    db.set_cfg("modo_envio", d.modo_envio)
    db.set_cfg("nome_casa", d.nome_casa.strip() or "Minha casa")
    db.registrar("painel", "Configurações salvas", detalhe=f"envio: {d.modo_envio}")
    return ver_config()


class UserCode(BaseModel):
    user_code: str = Field(min_length=4, max_length=20)


@api.post("/tuya/qr")
def tuya_qr(d: UserCode):
    try:
        return tuya_nuvem.iniciar_qr(d.user_code)
    except Exception as e:  # noqa: BLE001
        _erro(ValueError(str(e)))


@api.get("/tuya/qr")
def tuya_qr_estado():
    try:
        return tuya_nuvem.checar_qr()
    except Exception as e:  # noqa: BLE001
        _erro(e)


@api.delete("/tuya")
def tuya_sair():
    tuya_nuvem.desconectar()
    return {"ok": True}


@api.get("/tuya/aparelhos")
def tuya_aparelhos():
    try:
        lista = tuya_nuvem.listar_aparelhos()
    except Exception as e:  # noqa: BLE001
        _erro(e)
    cadastrados = {h["id"] for h in db.consultar("SELECT id FROM hubs")}
    for d in lista:
        d["cadastrado"] = d["id"] in cadastrados
    return lista


@api.get("/backup")
def backup():
    """Exporta aparelhos, botões gravados e agendamentos (sem senhas nem chaves)."""
    return {
        "versao": 1, "gerado_em": db.agora(),
        "aparelhos": db.consultar("SELECT * FROM aparelhos"),
        "codigos": db.consultar("SELECT aparelho_id, chave, rotulo, codigo FROM codigos"),
        "agendamentos": db.consultar("SELECT * FROM agendamentos"),
        "hubs": db.consultar("SELECT id, nome, ip, versao, control_type FROM hubs"),
    }


# ---------------- Supabase: rotinas (cron), métricas, alertas, backups ----------------
def _num(v):
    return float(v) if v is not None and not isinstance(v, (int, float, str, bool)) else v


@api.get("/supabase/rotinas")
def rotinas():
    linhas = db.consultar("""
        SELECT j.jobid, j.jobname, j.schedule, j.active, coalesce(r.description, '') AS descricao,
               d.status AS ultimo_status, extract(epoch FROM d.start_time)::bigint AS ultimo_em,
               extract(epoch FROM (d.end_time - d.start_time)) * 1000 AS duracao_ms, d.return_message AS mensagem,
               (SELECT count(*) FROM cron.job_run_details x WHERE x.jobid = j.jobid AND x.status = 'failed'
                  AND x.start_time > now() - interval '7 days') AS falhas_7d,
               (SELECT count(*) FROM cron.job_run_details x WHERE x.jobid = j.jobid
                  AND x.start_time > now() - interval '7 days') AS execucoes_7d
        FROM cron.job j
        LEFT JOIN public.cron_job_registry r ON r.job_name = j.jobname
        LEFT JOIN LATERAL (SELECT * FROM cron.job_run_details d WHERE d.jobid = j.jobid
                           ORDER BY d.start_time DESC LIMIT 1) d ON true
        WHERE j.jobname LIKE 'clima_%' ORDER BY j.jobid""")
    for l in linhas:
        l["duracao_ms"] = round(float(l["duracao_ms"]), 1) if l["duracao_ms"] is not None else None
    return linhas


class RotinaIn(BaseModel):
    ativo: bool


@api.put("/supabase/rotinas/{nome}")
def alternar_rotina(nome: str, d: RotinaIn):
    if not nome.startswith("clima_") or not db.um("SELECT 1 FROM cron.job WHERE jobname = ?", (nome,)):
        raise HTTPException(404, "Rotina não encontrada.")
    db.consultar("SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = ?), active := ?)",
                 (nome, d.ativo))
    db.registrar("painel", f"Rotina {'ativada' if d.ativo else 'pausada'}: {nome}")
    return {"ok": True}


@api.post("/supabase/rotinas/{nome}/executar")
def executar_rotina(nome: str):
    """Roda o SQL da rotina agora (mesmo comando agendado no pg_cron)."""
    job = db.um("SELECT command FROM cron.job WHERE jobname = ? AND jobname LIKE 'clima_%'", (nome,))
    if not job:
        raise HTTPException(404, "Rotina não encontrada.")
    try:
        with db.conexao() as con:
            for parte in [p for p in job["command"].split(";") if p.strip()]:
                con.execute(parte.replace("%", "%%"))
    except Exception as e:  # noqa: BLE001
        db.registrar("painel", f"Rotina executada manualmente: {nome}", ok=False, detalhe=str(e))
        raise HTTPException(500, f"A rotina falhou: {e}")
    db.registrar("painel", f"Rotina executada manualmente: {nome}")
    return {"ok": True}


@api.get("/supabase/resumo")
def resumo_supabase():
    saude = db.um("SELECT * FROM saude_sistema ORDER BY id DESC LIMIT 1")
    if saude:
        saude["tamanho_banco_mb"] = float(saude["tamanho_banco_mb"])
        saude["medido_em"] = saude["medido_em"].timestamp()
    backups = db.consultar("SELECT id, criado_em, pg_column_size(dados) AS bytes, "
                           "jsonb_array_length(dados->'aparelhos') AS aparelhos, "
                           "jsonb_array_length(dados->'codigos') AS codigos FROM backups ORDER BY id DESC")
    for b in backups:
        b["criado_em"] = b["criado_em"].timestamp()
    return {"projeto": db.REF, "saude": saude, "backups": backups, "limite_mb": 500}


@api.get("/supabase/backups/{bid}")
def baixar_backup_supabase(bid: int):
    b = db.um("SELECT id, criado_em, dados FROM backups WHERE id = ?", (bid,))
    if not b:
        raise HTTPException(404, "Backup não encontrado.")
    dados = b["dados"] if isinstance(b["dados"], dict) else json.loads(b["dados"])
    return {"id": b["id"], "criado_em": b["criado_em"].timestamp(), **dados}


@api.get("/metricas")
def metricas(dias: int = 14):
    linhas = db.consultar("SELECT * FROM metricas_diarias WHERE dia > ((now() at time zone 'America/Sao_Paulo')::date - CAST(? AS integer)) "
                          "ORDER BY dia", (min(dias, 90),))
    for l in linhas:
        l["dia"] = l["dia"].isoformat()
        l["calculado_em"] = l["calculado_em"].timestamp()
    return linhas


@api.get("/alertas")
def alertas(abertos: bool = True):
    linhas = db.consultar("SELECT al.*, a.nome AS aparelho_nome FROM alertas al LEFT JOIN aparelhos a ON a.id = al.aparelho_id "
                          + ("WHERE NOT al.resolvido " if abertos else "") + "ORDER BY al.id DESC LIMIT 50")
    for l in linhas:
        l["criado_em"] = l["criado_em"].timestamp()
    return linhas


@api.post("/alertas/{aid}/resolver")
def resolver_alerta(aid: int):
    db.executar("UPDATE alertas SET resolvido = true WHERE id = ?", (aid,))
    return {"ok": True}


# ---------------- projetos ----------------
class ProjetoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: str = Field("", max_length=200)
    endereco: str = Field("", max_length=120)
    cor: str = Field("#0f766a", pattern=r"^#[0-9a-fA-F]{6}$")


@api.get("/projetos")
def listar_projetos():
    return db.consultar("""
        SELECT p.*,
          (SELECT COUNT(*) FROM aparelhos a WHERE a.projeto_id = p.id) AS aparelhos,
          (SELECT COUNT(*) FROM aparelhos a WHERE a.projeto_id = p.id AND a.ligado = 1) AS ligados,
          (SELECT COUNT(*) FROM hubs h WHERE h.projeto_id = p.id) AS transmissores,
          (SELECT COUNT(*) FROM hubs h WHERE h.projeto_id = p.id AND h.online = 1) AS transmissores_online,
          (SELECT COUNT(*) FROM cenas c WHERE c.projeto_id = p.id) AS cenas
        FROM projetos p ORDER BY p.nome""")


@api.post("/projetos")
def criar_projeto(d: ProjetoIn):
    novo = db.executar("INSERT INTO projetos (nome, descricao, endereco, cor, criado_em) VALUES (?,?,?,?,?)",
                       (d.nome.strip(), d.descricao.strip(), d.endereco.strip(), d.cor, db.agora()))
    db.registrar("painel", f"Projeto criado: {d.nome}")
    return {"id": novo}


@api.put("/projetos/{pid}")
def editar_projeto(pid: int, d: ProjetoIn):
    db.executar("UPDATE projetos SET nome=?, descricao=?, endereco=?, cor=? WHERE id=?",
                (d.nome.strip(), d.descricao.strip(), d.endereco.strip(), d.cor, pid))
    return {"ok": True}


@api.delete("/projetos/{pid}")
def apagar_projeto(pid: int):
    if db.um("SELECT COUNT(*) n FROM projetos")["n"] <= 1:
        raise HTTPException(400, "Precisa existir pelo menos um projeto.")
    p = db.um("SELECT nome FROM projetos WHERE id = ?", (pid,))
    db.executar("DELETE FROM projetos WHERE id = ?", (pid,))
    db.registrar("painel", f"Projeto removido: {(p or {}).get('nome', pid)}", detalhe="aparelhos e transmissores ficaram sem projeto")
    return {"ok": True}


# ---------------- cenas ----------------
class AcaoCena(BaseModel):
    aparelho_id: int
    ligado: bool
    modo: str | None = None
    temperatura: int | None = None
    ventilador: str | None = None


class CenaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    projeto_id: int | None = None
    icone: str = Field("sparkles", max_length=30)
    acoes: list[AcaoCena] = Field(min_length=1, max_length=30)


@api.get("/cenas")
def listar_cenas(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id, "c")
    linhas = db.consultar(f"SELECT c.*, pr.nome AS projeto_nome FROM cenas c LEFT JOIN projetos pr ON pr.id = c.projeto_id{w} "
                          "ORDER BY c.nome", p)
    nomes = {a["id"]: a["nome"] for a in db.consultar("SELECT id, nome FROM aparelhos")}
    for c in linhas:
        for a in c["acoes"]:
            a["aparelho_nome"] = nomes.get(a["aparelho_id"], "Aparelho removido")
    return linhas


@api.post("/cenas")
def criar_cena(d: CenaIn):
    novo = db.executar("INSERT INTO cenas (nome, projeto_id, icone, acoes, criado_em) VALUES (?,?,?,CAST(? AS jsonb),?)",
                       (d.nome.strip(), d.projeto_id, d.icone, json.dumps([a.model_dump() for a in d.acoes]), db.agora()))
    db.registrar("painel", f"Cena criada: {d.nome}")
    return {"id": novo}


@api.put("/cenas/{cid}")
def editar_cena(cid: int, d: CenaIn):
    db.executar("UPDATE cenas SET nome=?, projeto_id=?, icone=?, acoes=CAST(? AS jsonb) WHERE id=?",
                (d.nome.strip(), d.projeto_id, d.icone, json.dumps([a.model_dump() for a in d.acoes]), cid))
    return {"ok": True}


@api.delete("/cenas/{cid}")
def apagar_cena(cid: int):
    db.executar("DELETE FROM cenas WHERE id = ?", (cid,))
    return {"ok": True}


@api.post("/cenas/{cid}/executar")
def executar_cena(cid: int):
    cena = db.um("SELECT * FROM cenas WHERE id = ?", (cid,))
    if not cena:
        raise HTTPException(404, "Cena não encontrada.")
    resultados = []
    for a in cena["acoes"]:
        try:
            clima.aplicar(a["aparelho_id"], f"cena:{cena['nome']}", ligado=a["ligado"], modo=a.get("modo"),
                          temperatura=a.get("temperatura"), ventilador=a.get("ventilador"))
            resultados.append({"aparelho_id": a["aparelho_id"], "ok": True})
        except Exception as e:  # noqa: BLE001
            resultados.append({"aparelho_id": a["aparelho_id"], "ok": False, "erro": str(e)})
    db.executar("UPDATE cenas SET executada_em = ? WHERE id = ?", (db.agora(), cid))
    return {"resultados": resultados, "ok": all(r["ok"] for r in resultados)}


# ---------------- relatórios ----------------
@api.get("/relatorios")
def relatorios(dias: int = 30, projeto_id: int | None = None):
    dias = max(1, min(dias, 90))
    desde = db.agora() - dias * 86400
    filtro_ap = " AND a.projeto_id = ?" if projeto_id else ""
    p = (desde, projeto_id) if projeto_id else (desde,)
    por_aparelho = db.consultar(f"""
        SELECT a.id, a.nome, a.comodo, count(t.id) AS comandos,
               count(t.id) FILTER (WHERE t.ok = 0) AS falhas,
               count(t.id) FILTER (WHERE t.acao LIKE 'Ligar%') AS ligou,
               max(t.quando) AS ultimo
        FROM aparelhos a LEFT JOIN atividade t ON t.aparelho_id = a.id AND t.quando > ?
        WHERE true{filtro_ap} GROUP BY a.id ORDER BY comandos DESC""", p)
    por_origem = db.consultar(f"""
        SELECT split_part(t.origem, ':', 1) AS origem, count(*) AS total
        FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id
        WHERE t.quando > ?{filtro_ap} GROUP BY 1 ORDER BY 2 DESC""", p)
    por_hora = db.consultar(f"""
        SELECT extract(hour FROM to_timestamp(t.quando) AT TIME ZONE 'America/Sao_Paulo')::int AS hora, count(*) AS total
        FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id
        WHERE t.quando > ?{filtro_ap} GROUP BY 1 ORDER BY 1""", p)
    temperaturas = db.consultar(f"""
        SELECT substring(t.acao from '(\\d+)°')::int AS temperatura, count(*) AS total
        FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id
        WHERE t.quando > ? AND t.acao LIKE 'Ligar:%' AND t.ok = 1{filtro_ap} GROUP BY 1 ORDER BY 1""", p)
    return {"dias": dias, "por_aparelho": por_aparelho, "por_origem": por_origem, "por_hora": por_hora,
            "temperaturas": [t for t in temperaturas if t["temperatura"]], "metricas": metricas(dias)}


# ---------------- Sinric Pro (Alexa / Google Home) ----------------
class SinricIn(BaseModel):
    ativo: bool = True
    automatico: bool = True
    api_key: str | None = Field(None, max_length=80)
    app_key: str | None = Field(None, max_length=80)
    app_secret: str | None = Field(None, max_length=200)


@api.get("/sinric")
def ver_sinric():
    from .. import sinric
    return sinric.config_publica()


@api.put("/sinric")
def salvar_sinric(d: SinricIn):
    from .. import sinric
    c = sinric.config()
    c["ativo"] = d.ativo
    c["automatico"] = d.automatico
    for campo in ("api_key", "app_key", "app_secret"):
        valor = getattr(d, campo)
        if valor and "…" not in valor:
            c[campo] = valor.strip()
    db.set_cfg("sinric", c)
    db.registrar("painel", f"Sinric Pro {'ativado' if d.ativo else 'desativado'}")
    return sinric.config_publica()


@api.get("/sinric/dispositivos")
def sinric_dispositivos():
    from .. import sinric
    try:
        return sinric.listar_dispositivos()
    except Exception as e:  # noqa: BLE001
        _erro(RuntimeError(str(e)))


class VinculoIn(BaseModel):
    sinric_device_id: str | None = Field(None, max_length=40)


@api.put("/aparelhos/{aid}/sinric")
def vincular_sinric(aid: int, d: VinculoIn):
    dev = (d.sinric_device_id or "").strip() or None
    if dev:
        db.executar("UPDATE aparelhos SET sinric_device_id = NULL WHERE sinric_device_id = ? AND id <> ?", (dev, aid))
    db.executar("UPDATE aparelhos SET sinric_device_id = ? WHERE id = ?", (dev, aid))
    db.registrar("painel", "Aparelho vinculado ao Sinric Pro" if dev else "Vínculo com o Sinric Pro removido", aparelho_id=aid)
    return {"ok": True}


@api.post("/aparelhos/{aid}/sinric/criar")
def criar_no_sinric(aid: int):
    from .. import sinric
    try:
        a = clima.aparelho(aid)
        if a["sinric_device_id"]:
            raise ValueError("Este aparelho já está no Sinric Pro.")
        dev = sinric.criar_dispositivo(a)
    except Exception as e:  # noqa: BLE001
        _erro(e if isinstance(e, (KeyError, ValueError)) else RuntimeError(str(e)))
    db.executar("UPDATE aparelhos SET sinric_device_id = ? WHERE id = ?", (dev, aid))
    db.registrar("painel", "Criado no Sinric Pro (Alexa/Google)", aparelho_id=aid, detalhe=dev)
    return {"sinric_device_id": dev}


@api.get("/sinric/conectar-alexa")
def sinric_conectar_alexa():
    from .. import sinric
    return sinric.conectar_alexa()


# ---------------- automações e temporizadores ----------------
class GatilhoIn(BaseModel):
    tipo: str = Field(pattern="^(ligou|desligou|ligado_ha|horario)$")
    aparelho_id: int | None = None
    origem: str = Field("qualquer", pattern="^(qualquer|alexa|sinric|painel|agenda|cena)$")
    minutos: int | None = Field(None, ge=1, le=1440)
    hora: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class CondicoesIn(BaseModel):
    dias: list[int] = []
    das: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    ate: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class AcaoAutoIn(BaseModel):
    tipo: str = Field(pattern="^(aparelho|cena|desligar_apos)$")
    aparelho_id: int | None = None
    cena_id: int | None = None
    ligado: bool | None = None
    modo: str | None = None
    temperatura: int | None = None
    ventilador: str | None = None
    minutos: int | None = Field(None, ge=1, le=1440)


class AutomacaoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    ativo: bool = True
    gatilho: GatilhoIn
    condicoes: CondicoesIn = CondicoesIn()
    acoes: list[AcaoAutoIn] = Field(min_length=1, max_length=20)


def _validar_auto(d: AutomacaoIn):
    g = d.gatilho
    if g.tipo == "horario" and not g.hora:
        raise HTTPException(400, "Informe o horário do gatilho.")
    if g.tipo == "ligado_ha" and not g.minutos:
        raise HTTPException(400, "Informe há quantos minutos o aparelho precisa estar ligado.")
    for a in d.acoes:
        if a.tipo == "cena" and not a.cena_id:
            raise HTTPException(400, "Escolha a cena da ação.")
        if a.tipo == "aparelho" and not a.aparelho_id and g.tipo == "horario":
            raise HTTPException(400, "Escolha o aparelho da ação.")
    return (json.dumps(g.model_dump(exclude_none=True)), json.dumps(d.condicoes.model_dump(exclude_none=True)),
            json.dumps([a.model_dump(exclude_none=True) for a in d.acoes]))


@api.get("/automacoes")
def listar_automacoes():
    return db.consultar("SELECT * FROM automacoes ORDER BY nome")


@api.post("/automacoes")
def criar_automacao(d: AutomacaoIn):
    g, c, a = _validar_auto(d)
    novo = db.executar("INSERT INTO automacoes (nome, ativo, gatilho, condicoes, acoes, criado_em) "
                       "VALUES (?, ?, CAST(? AS jsonb), CAST(? AS jsonb), CAST(? AS jsonb), ?)",
                       (d.nome.strip(), int(d.ativo), g, c, a, db.agora()))
    db.registrar("painel", f"Automação criada: {d.nome}")
    return {"id": novo}


@api.put("/automacoes/{aid}")
def editar_automacao(aid: int, d: AutomacaoIn):
    g, c, a = _validar_auto(d)
    db.executar("UPDATE automacoes SET nome=?, ativo=?, gatilho=CAST(? AS jsonb), condicoes=CAST(? AS jsonb), acoes=CAST(? AS jsonb) WHERE id=?",
                (d.nome.strip(), int(d.ativo), g, c, a, aid))
    return {"ok": True}


@api.delete("/automacoes/{aid}")
def apagar_automacao(aid: int):
    db.executar("DELETE FROM automacoes WHERE id = ?", (aid,))
    return {"ok": True}


@api.post("/automacoes/{aid}/executar")
def executar_automacao(aid: int):
    from .. import automacao
    auto = db.um("SELECT * FROM automacoes WHERE id = ?", (aid,))
    if not auto:
        raise HTTPException(404, "Automação não encontrada.")
    automacao.executar_acoes(auto, auto["gatilho"].get("aparelho_id"))
    return {"ok": True}


class TemporizadorIn(BaseModel):
    minutos: int = Field(ge=1, le=1440)
    ligado: bool = False
    temperatura: int | None = None


@api.post("/aparelhos/{aid}/temporizador")
def criar_temporizador(aid: int, d: TemporizadorIn):
    from .. import automacao
    acao = {"ligado": d.ligado} | ({"temperatura": d.temperatura} if d.temperatura else {})
    return {"id": automacao.criar_temporizador(aid, d.minutos, acao, "painel")}


@api.get("/temporizadores")
def listar_temporizadores():
    return db.consultar("SELECT t.*, a.nome AS aparelho_nome FROM temporizadores t JOIN aparelhos a ON a.id = t.aparelho_id ORDER BY t.executar_em")


@api.delete("/aparelhos/{aid}/temporizador")
def cancelar_temporizador(aid: int):
    db.executar("DELETE FROM temporizadores WHERE aparelho_id = ?", (aid,))
    db.registrar("painel", "Temporizador cancelado", aparelho_id=aid)
    return {"ok": True}


# ---------------- comandos de voz da Alexa (gerados para cada aparelho) ----------------
@api.get("/alexa/comandos")
def comandos_alexa():
    aparelhos = db.consultar("SELECT a.*, pr.nome AS projeto_nome FROM aparelhos a LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                             "WHERE a.alexa = 1 ORDER BY a.nome")
    cenas = db.consultar("SELECT id, nome FROM cenas ORDER BY nome")
    saida = []
    for a in aparelhos:
        n = a["nome"]
        modos = [m for m in a["modos"].split(",") if m in ("frio", "quente", "auto")]
        grupos = [
            ("Ligar e desligar", [f"Alexa, ligar {n}", f"Alexa, desligar {n}", f"Alexa, {n} está ligado?"]),
            ("Temperatura", [f"Alexa, colocar {n} em {t} graus" for t in range(a["temp_min"], a["temp_max"] + 1)]
             + [f"Alexa, aumentar a temperatura do {n}", f"Alexa, diminuir a temperatura do {n}",
                f"Alexa, aumentar {n} em 2 graus", f"Alexa, qual a temperatura do {n}?"]),
            ("Modo", [f"Alexa, colocar {n} no modo {dict(frio='frio', quente='aquecimento', auto='automático')[m]}" for m in modos]),
            ("Ventilação", [f"Alexa, colocar a velocidade do {n} em {v}" for v in (1, 2, 3)]
             + [f"Alexa, aumentar a ventilação do {n}", f"Alexa, diminuir a ventilação do {n}"]),
        ]
        saida.append({"id": a["id"], "nome": n, "projeto": a["projeto_nome"], "no_sinric": bool(a["sinric_device_id"]),
                      "grupos": [{"titulo": t, "frases": f} for t, f in grupos],
                      "total": sum(len(f) for _, f in grupos)})
    rotinas = [
        {"frase": "Alexa, boa noite", "faz": "Ar do quarto em 24°, ventilação baixa, e desliga 3 h depois (automação)"},
        {"frase": "Alexa, cheguei", "faz": "Liga os ares da casa em 23° no modo frio"},
        {"frase": "Alexa, estou saindo", "faz": "Desliga todos os ares"},
        {"frase": "Alexa, está calor", "faz": "Liga o ar do cômodo em 21°, ventilação alta"},
        {"frase": "Alexa, hora de trabalhar", "faz": "Ar do escritório em 23° de segunda a sexta"},
    ]
    return {"aparelhos": saida, "cenas": cenas, "rotinas": rotinas,
            "total": sum(a["total"] for a in saida)}


@api.post("/hubs/importar-todos")
def importar_todos_hubs():
    """Importa de uma vez todos os transmissores infravermelhos da conta Smart Life."""
    try:
        lista = [d for d in tuya_nuvem.listar_aparelhos() if d["transmissor_ir"]]
    except Exception as e:  # noqa: BLE001
        _erro(e)
    resultado = []
    for d in lista:
        try:
            importar_hub(d["id"])
            resultado.append({"id": d["id"], "nome": d["nome"], "ok": True})
        except Exception as e:  # noqa: BLE001
            resultado.append({"id": d["id"], "nome": d["nome"], "ok": False, "erro": str(getattr(e, "detail", e))})
    return {"importados": resultado}


@api.post("/hubs/reparar")
def reparar_hubs():
    """Força a reconfiguração automática agora (procura IP novo e busca a chave nova na conta Smart Life)."""
    try:
        if transmissor.PAPEL == "agente":
            return {"resultados": transmissor.autorreparar(forcar=True)}
        if not transmissor.agente_online():
            raise RuntimeError("O agente do Mac está offline: ele que procura o transmissor na rede de casa.")
        f = transmissor.aguardar(transmissor.enfileirar("reparar", None, {}), 45)
        if f["estado"] != "ok":
            raise RuntimeError(f["erro"])
        return f["resultado"] if isinstance(f["resultado"], dict) else json.loads(f["resultado"])
    except Exception as e:  # noqa: BLE001
        _erro(e)


# ---------------- notificações (tudo o que pede atenção, de todas as telas) ----------------
@api.get("/notificacoes")
def notificacoes():
    itens = []
    agora = db.agora()
    for a in db.consultar("SELECT al.id, al.mensagem, al.criado_em FROM alertas al WHERE NOT al.resolvido ORDER BY al.id DESC LIMIT 20"):
        itens.append({"id": f"alerta-{a['id']}", "tipo": "alerta", "gravidade": "alta", "titulo": a["mensagem"],
                      "detalhe": "Alerta das rotinas do Supabase", "link": "/supabase", "quando": int(a["criado_em"].timestamp()),
                      "alerta_id": a["id"]})
    falhas = db.consultar("SELECT t.aparelho_id, max(a.nome) AS nome, count(*) AS n, max(t.quando) AS ultimo, max(t.detalhe) AS detalhe "
                          "FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id WHERE t.ok = 0 AND t.quando > ? "
                          "GROUP BY t.aparelho_id ORDER BY ultimo DESC", (agora - 86400,))
    for f in falhas:
        itens.append({"id": f"falha-{f['aparelho_id']}", "tipo": "falha", "gravidade": "media",
                      "titulo": f"{f['nome']}: {f['n']} comando(s) falharam nas últimas 24 h", "detalhe": f["detalhe"] or "",
                      "link": f"/aparelhos/{f['aparelho_id']}", "quando": f["ultimo"]})
    for h in db.consultar("SELECT id, nome, online, problema, visto_em FROM hubs WHERE online = 0 OR problema IS NOT NULL"):
        itens.append({"id": f"hub-{h['id']}", "tipo": "transmissor", "gravidade": "alta",
                      "titulo": f"Transmissor {h['nome']} {'com problema' if h['problema'] else 'offline'}",
                      "detalhe": h["problema"] or "Sem resposta na rede. O agente tenta reconectar sozinho.",
                      "link": "/transmissores", "quando": h["visto_em"] or agora})
    if not transmissor.agente_online():
        itens.append({"id": "agente", "tipo": "agente", "gravidade": "alta", "titulo": "Agente do Mac offline",
                      "detalhe": "Sem ele os comandos, a Alexa, a agenda e as automações param.", "link": "/configuracoes#agente",
                      "quando": db.cfg("agente_visto_em") or agora})
    sinric_cfg, sinric_st = db.cfg("sinric") or {}, db.cfg("sinric_status") or {}
    if sinric_cfg.get("ativo") and sinric_st.get("dispositivos") and not sinric_st.get("conectado"):
        itens.append({"id": "sinric", "tipo": "alexa", "gravidade": "media", "titulo": "Alexa/Google desconectado (Sinric Pro)",
                      "detalhe": sinric_st.get("erro") or "O agente reconecta sozinho em até 30 s.", "link": "/integracoes",
                      "quando": sinric_st.get("atualizado_em") or agora})
    for a in db.consultar("SELECT a.id, a.nome FROM aparelhos a WHERE NOT EXISTS (SELECT 1 FROM codigos c WHERE c.aparelho_id = a.id)"):
        itens.append({"id": f"sem-botoes-{a['id']}", "tipo": "configuracao", "gravidade": "baixa",
                      "titulo": f"{a['nome']} ainda não tem botões gravados", "detalhe": "Grave os botões do controle original para controlar o ar.",
                      "link": f"/aparelhos/{a['id']}?aba=botoes", "quando": agora})
    ordem = {"alta": 0, "media": 1, "baixa": 2}
    itens.sort(key=lambda x: (ordem[x["gravidade"]], -(x["quando"] or 0)))
    return {"total": len(itens), "itens": itens}
