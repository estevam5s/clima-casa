"""Rotas da API usadas pela interface (todas exigem login, exceto as de autenticação)."""
import json
import re
import time

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import clima, cripto, db, transmissor, tuya_nuvem
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
    return {"url": db.ENV["SUPABASE_URL"], "chave": db.ENV["SUPABASE_PUBLISHABLE_KEY"], "turnstile": db.ENV.get("TURNSTILE_SITE_KEY", "")}


@api.get("/sessao")
def sessao(request: Request):
    from .. import acesso
    from ..seguranca import tem_totp
    u = request.state.usuario
    return {"logado": True, "email": u.get("email"), "ultimo_login": u.get("last_sign_in_at"), **acesso.resumo(request.state.u),
            "totp_ativo": tem_totp(u), "passkeys": db.um("SELECT count(*) AS n FROM passkeys WHERE usuario_id = ?", (u["id"],))["n"]}


@api.post("/sessao/registrar-login")
def registrar_login(request: Request):
    db.registrar("sistema", "Login do administrador", detalhe=request.state.usuario.get("email", ""))
    return {"ok": True}


# ---------------- painel ----------------
def _exigir_projeto(pid):
    from .. import acesso
    if acesso.projetos_permitidos() is not None:
        acesso.checar_projeto(pid)


def _exigir_aparelhos(ids):
    perm = _ids_aparelhos_permitidos()
    if perm is not None and not {int(i) for i in ids if i} <= perm:
        raise HTTPException(403, "Você não tem acesso a um dos aparelhos escolhidos.")


def _dar_acesso_projeto(pid):
    """Quem tem acesso limitado e cria um projeto passa a ver esse projeto."""
    from .. import acesso
    u = acesso.atual.get()
    if u and u["projetos"] != "*" and pid:
        db.executar("UPDATE usuarios SET projetos = CAST(? AS jsonb) WHERE id = ?", (json.dumps([*u["projetos"], int(pid)]), u["id"]))


def _escopo(coluna):
    from .. import acesso
    return acesso.filtro_sql(coluna)


def _filtro_projeto(projeto_id, alias="a"):
    """Filtro por projeto; sem projeto escolhido, limita aos projetos que o usuário pode ver."""
    from .. import acesso
    if projeto_id:
        acesso.checar_projeto(projeto_id) if acesso.projetos_permitidos() is not None else None
        return (f" WHERE {alias}.projeto_id = ?", (projeto_id,))
    f, pp = acesso.filtro_sql(f"{alias}.projeto_id")
    return (f" WHERE true{f}", pp) if f else ("", ())


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
    f, pp = _escopo("a.projeto_id")
    sql += f; p += list(pp)
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
    potencia_w: int = Field(1000, ge=100, le=10000)


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
    _exigir_projeto(projeto)
    novo = db.executar(
        "INSERT INTO aparelhos (nome, comodo, marca, hub_id, temp_min, temp_max, modos, alexa, temperatura, modo, "
        "projeto_id, criado_em, potencia_w) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (d.nome.strip(), d.comodo.strip(), d.marca.strip(), d.hub_id, d.temp_min, d.temp_max, ",".join(d.modos),
         int(d.alexa), temp, d.modos[0], projeto, db.agora(), d.potencia_w))
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
    _exigir_projeto(d.projeto_id)
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    temp = max(d.temp_min, min(d.temp_max, a["temperatura"]))
    modo = a["modo"] if a["modo"] in d.modos else d.modos[0]
    db.executar("UPDATE aparelhos SET nome=?, comodo=?, marca=?, hub_id=?, temp_min=?, temp_max=?, modos=?, alexa=?, "
                "temperatura=?, modo=?, projeto_id=?, potencia_w=? WHERE id=?",
                (d.nome.strip(), d.comodo.strip(), d.marca.strip(), d.hub_id, d.temp_min, d.temp_max,
                 ",".join(d.modos), int(d.alexa), temp, modo, d.projeto_id, d.potencia_w, aid))
    db.registrar("painel", "Aparelho editado", aparelho_id=aid)
    if a.get("sinric_device_id") and (a["nome"] != d.nome.strip() or (a.get("comodo") or "") != d.comodo.strip()):
        from .. import sinric
        try:
            sinric.renomear_dispositivo(a["sinric_device_id"], d.nome.strip(), d.comodo.strip())
            db.registrar("painel", "Nome atualizado no Sinric Pro (Alexa/Google)", aparelho_id=aid, detalhe=d.nome.strip())
        except Exception as e:  # noqa: BLE001  (a edição vale mesmo se o Sinric falhar)
            db.registrar("painel", "Não foi possível renomear no Sinric Pro", ok=False, aparelho_id=aid, detalhe=str(e))
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
    _exigir_projeto(d.projeto_id)
    if db.um("SELECT 1 FROM hubs WHERE id = ?", (d.id,)):
        raise HTTPException(409, "Esse transmissor já está cadastrado.")
    db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, projeto_id, criado_em) VALUES (?,?,?,?,?,?,?)",
                (d.id.strip(), d.nome.strip(), d.ip.strip(), cripto.cifrar(d.local_key.strip(), "hub:local_key"), d.versao,
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
                    (cripto.cifrar(info["local_key"], "hub:local_key"), info["control_type"], json.dumps(info["funcoes"]), ip, device_id))
    else:
        db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, control_type, funcoes_nuvem, projeto_id, criado_em) "
                    "VALUES (?,?,?,?,?,?,?,?,?)",
                    (device_id, info["nome"], ip, cripto.cifrar(info["local_key"], "hub:local_key"), versao, info["control_type"],
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
        db.executar("UPDATE hubs SET local_key = ? WHERE id = ?", (cripto.cifrar(d.local_key.strip(), "hub:local_key"), hub_id))
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
        "SELECT g.*, a.nome AS aparelho_nome FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id WHERE true"
        + _escopo("a.projeto_id")[0] + " ORDER BY g.hora", _escopo("a.projeto_id")[1])]


@api.post("/agendamentos")
def criar_agendamento(d: AgendaIn):
    _exigir_aparelhos({d.aparelho_id})
    novo = db.executar("INSERT INTO agendamentos (aparelho_id, nome, dias, hora, acao, ativo, criado_em) VALUES (?,?,?,?,?,?,?)",
                       (d.aparelho_id, d.nome.strip(), ",".join(map(str, sorted(set(d.dias)))), d.hora, _acao(d),
                        int(d.ativo), db.agora()))
    db.registrar("painel", f"Agendamento criado: {d.nome}", aparelho_id=d.aparelho_id)
    return {"id": novo}


@api.put("/agendamentos/{gid}")
def editar_agendamento(gid: int, d: AgendaIn):
    _exigir_aparelhos({d.aparelho_id})
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
    tarifa_kwh: float | None = Field(None, ge=0, le=20)


@api.get("/config")
def ver_config():
    conta = db.cfg("tuya_conta")
    return {
        "modo_envio": db.cfg("modo_envio", "auto"),
        "nome_casa": db.cfg("nome_casa", "Minha casa"),
        "tarifa_kwh": float(db.cfg("tarifa_kwh", 0.85)),
        "tuya": {"conectada": bool(conta), "usuario": (conta or {}).get("usuario", ""),
                 "user_code": (conta or {}).get("user_code", "")},
    }


@api.put("/config")
def salvar_config(d: ConfigIn):
    db.set_cfg("modo_envio", d.modo_envio)
    db.set_cfg("nome_casa", d.nome_casa.strip() or "Minha casa")
    if d.tarifa_kwh is not None:
        db.set_cfg("tarifa_kwh", round(d.tarifa_kwh, 4))
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
    f, pp = _escopo("a.projeto_id")
    linhas = db.consultar("SELECT al.*, a.nome AS aparelho_nome FROM alertas al LEFT JOIN aparelhos a ON a.id = al.aparelho_id WHERE true"
                          + (" AND NOT al.resolvido" if abertos else "") + f + " ORDER BY al.id DESC LIMIT 50", pp)
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
    from .. import acesso
    f, pp = acesso.filtro_sql("p.id")
    return db.consultar(f"""
        SELECT p.*,
          (SELECT COUNT(*) FROM aparelhos a WHERE a.projeto_id = p.id) AS aparelhos,
          (SELECT COUNT(*) FROM aparelhos a WHERE a.projeto_id = p.id AND a.ligado = 1) AS ligados,
          (SELECT COUNT(*) FROM hubs h WHERE h.projeto_id = p.id) AS transmissores,
          (SELECT COUNT(*) FROM hubs h WHERE h.projeto_id = p.id AND h.online = 1) AS transmissores_online,
          (SELECT COUNT(*) FROM cenas c WHERE c.projeto_id = p.id) AS cenas
        FROM projetos p WHERE true{f} ORDER BY p.nome""", pp)


@api.post("/projetos")
def criar_projeto(d: ProjetoIn):
    novo = db.executar("INSERT INTO projetos (nome, descricao, endereco, cor, criado_em) VALUES (?,?,?,?,?)",
                       (d.nome.strip(), d.descricao.strip(), d.endereco.strip(), d.cor, db.agora()))
    _dar_acesso_projeto(novo)
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
    _exigir_projeto(d.projeto_id)
    _exigir_aparelhos({a.aparelho_id for a in d.acoes})
    novo = db.executar("INSERT INTO cenas (nome, projeto_id, icone, acoes, criado_em) VALUES (?,?,?,CAST(? AS jsonb),?)",
                       (d.nome.strip(), d.projeto_id, d.icone, json.dumps([a.model_dump() for a in d.acoes]), db.agora()))
    db.registrar("painel", f"Cena criada: {d.nome}")
    return {"id": novo}


@api.put("/cenas/{cid}")
def editar_cena(cid: int, d: CenaIn):
    _exigir_projeto(d.projeto_id)
    _exigir_aparelhos({a.aparelho_id for a in d.acoes})
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


@api.get("/apps/qr")
def qr_app(alvo: str = "android", request: Request = None):
    """QR Code para abrir o download no celular. Só gera para os destinos conhecidos (nada de URL livre)."""
    import base64
    import io
    import qrcode
    destinos = {"android": "https://github.com/estevam5s/clima-casa/releases/latest/download/ClimaCasa-android.apk",
                "site": f"https://{request.headers.get('host', 'clima-casa-lac.vercel.app')}/"}
    if alvo not in destinos:
        raise HTTPException(400, "Destino inválido.")
    buf = io.BytesIO()
    qrcode.make(destinos[alvo], box_size=8, border=2).save(buf, format="PNG")
    return {"url": destinos[alvo], "qr": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}


@api.get("/clima-externo")
def clima_externo(request: Request, projeto_id: int | None = None):
    from .. import clima_externo as ce
    try:
        return ce.agora(projeto_id, request)
    except Exception:  # noqa: BLE001
        return {"disponivel": False, "motivo": "Serviço de clima indisponível agora."}


# ---------------- relatórios ----------------
@api.get("/relatorios")
def relatorios(dias: int = 30, projeto_id: int | None = None):
    dias = max(1, min(dias, 90))
    desde = db.agora() - dias * 86400
    filtro_ap = " AND a.projeto_id = ?" if projeto_id else _escopo("a.projeto_id")[0]
    p = (desde, projeto_id) if projeto_id else (desde, *_escopo("a.projeto_id")[1])
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


def _intervalo(dias: int, inicio: str | None, fim: str | None) -> tuple[int, int]:
    import datetime as _dt
    fuso = _dt.timezone(_dt.timedelta(hours=-3))
    try:
        if inicio and fim:
            a = int(_dt.datetime.strptime(inicio, "%Y-%m-%d").replace(tzinfo=fuso).timestamp())
            b = int(_dt.datetime.strptime(fim, "%Y-%m-%d").replace(tzinfo=fuso).timestamp()) + 86399
            if b <= a or b - a > 366 * 86400:
                raise ValueError
            return a, b
    except ValueError:
        raise HTTPException(400, "Período inválido: use datas AAAA-MM-DD, com no máximo 1 ano.")
    fim_ts = db.agora()
    return fim_ts - max(1, min(dias, 366)) * 86400, fim_ts


@api.get("/relatorios/completo")
def relatorio_completo(dias: int = 30, inicio: str | None = None, fim: str | None = None,
                       projeto_id: int | None = None, aparelho_id: int | None = None):
    from .. import relatorio
    a, b = _intervalo(dias, inicio, fim)
    return relatorio.montar(a, b, projeto_id, aparelho_id)


@api.get("/relatorios/exportar")
def relatorio_exportar(formato: str = "pdf", dias: int = 30, inicio: str | None = None, fim: str | None = None,
                       projeto_id: int | None = None, aparelho_id: int | None = None):
    from fastapi.responses import Response
    from .. import relatorio
    if formato not in relatorio.FORMATOS:
        raise HTTPException(400, f"Formato inválido. Use: {', '.join(relatorio.FORMATOS)}.")
    a, b = _intervalo(dias, inicio, fim)
    corpo, tipo, ext = relatorio.FORMATOS[formato](relatorio.montar(a, b, projeto_id, aparelho_id))
    nome = f"relatorio-clima-{time.strftime('%Y%m%d-%H%M')}.{ext}"
    db.registrar("painel", "Relatório exportado", detalhe=formato.upper())
    return Response(corpo, media_type=tipo, headers={"Content-Disposition": f'attachment; filename="{nome}"'})


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


def _ids_aparelhos_permitidos():
    from .. import acesso
    if acesso.projetos_permitidos() is None:
        return None
    f, pp = acesso.filtro_sql("projeto_id")
    return {a["id"] for a in db.consultar(f"SELECT id FROM aparelhos WHERE true{f}", pp)}


def _aparelhos_da_automacao(a) -> set:
    ids = set()
    for parte in (a.get("gatilho") or {}, *(a.get("acoes") or [])):
        if isinstance(parte, dict) and parte.get("aparelho_id"):
            ids.add(int(parte["aparelho_id"]))
    return ids


def listar_automacoes():
    lista = db.consultar("SELECT * FROM automacoes ORDER BY nome")
    permitidos = _ids_aparelhos_permitidos()
    if permitidos is None:
        return lista
    return [a for a in lista if _aparelhos_da_automacao(a) and _aparelhos_da_automacao(a) <= permitidos]


api.get("/automacoes")(listar_automacoes)


@api.post("/automacoes")
def criar_automacao(d: AutomacaoIn):
    _exigir_aparelhos(_aparelhos_da_automacao(d.model_dump()))
    g, c, a = _validar_auto(d)
    novo = db.executar("INSERT INTO automacoes (nome, ativo, gatilho, condicoes, acoes, criado_em) "
                       "VALUES (?, ?, CAST(? AS jsonb), CAST(? AS jsonb), CAST(? AS jsonb), ?)",
                       (d.nome.strip(), int(d.ativo), g, c, a, db.agora()))
    db.registrar("painel", f"Automação criada: {d.nome}")
    return {"id": novo}


@api.put("/automacoes/{aid}")
def editar_automacao(aid: int, d: AutomacaoIn):
    _exigir_aparelhos(_aparelhos_da_automacao(d.model_dump()))
    if (perm := _ids_aparelhos_permitidos()) is not None:
        atual_auto = db.um("SELECT * FROM automacoes WHERE id = ?", (aid,))
        if atual_auto and not _aparelhos_da_automacao(atual_auto) <= perm:
            raise HTTPException(403, "Você não tem acesso a essa automação.")
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
    f, pp = _escopo("a.projeto_id")
    return db.consultar(f"SELECT t.*, a.nome AS aparelho_nome FROM temporizadores t JOIN aparelhos a ON a.id = t.aparelho_id WHERE true{f} ORDER BY t.executar_em", pp)


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
        {"frase": "Alexa, fim do expediente", "faz": "Desliga todos os ares e confere se ficou algum ligado (cena)"},
        {"frase": "Alexa, cheguei", "faz": "Liga os ares do escritório em 23° no modo frio"},
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
def listar_notificacoes(filtro: str = "todas"):
    from .. import notificacoes
    from .. import acesso
    r = notificacoes.listar(filtro)
    restrito = acesso.projetos_permitidos() is not None
    if restrito or not acesso.pode("configuracoes.gerenciar"):
        # só avisos dos aparelhos que o usuário vê; segurança e sistema só para quem gerencia isso
        permitidos = _ids_aparelhos_permitidos()
        def visivel(n):
            m = re.search(r"/aparelhos/(\d+)", n.get("link") or "")
            if m:
                return permitidos is None or int(m.group(1)) in permitidos
            if n["tipo"] == "seguranca":
                return acesso.pode("seguranca.gerenciar")
            if (n.get("chave") or "").startswith("site-"):
                return acesso.pode("mensagens.ver")
            return acesso.pode("configuracoes.gerenciar") or n["tipo"] in ("transmissor", "agente")
        r["itens"] = [n for n in r["itens"] if visivel(n)]
        nao_lidas = sum(1 for n in r["itens"] if not n["lida"])
        r["contagem"] = {**r["contagem"], "todas": len(r["itens"]), "nao_lidas": nao_lidas,
                         "importantes": sum(1 for n in r["itens"] if n["gravidade"] == "alta" and not n["resolvida"]),
                         "seguranca": sum(1 for n in r["itens"] if n["tipo"] == "seguranca")}
        r["total"] = nao_lidas
    fa, pa = _escopo("projeto_id")
    ligados = db.um(f"SELECT count(*) FILTER (WHERE ligado = 1) AS ligados, count(*) AS total FROM aparelhos WHERE true{fa}", pa)
    hubs = db.um(f"SELECT count(*) FILTER (WHERE online = 1) AS online, count(*) AS total FROM hubs WHERE true{fa}", pa)
    msgs = db.um("SELECT count(*) AS n FROM site_mensagens WHERE NOT lida AND NOT arquivada") if acesso.pode("mensagens.ver") else {"n": 0}
    r["status"] = {"agente_online": transmissor.agente_online(), "ligados": ligados["ligados"], "aparelhos": ligados["total"],
                   "hubs_online": hubs["online"], "hubs": hubs["total"], "mensagens_nao_lidas": msgs["n"]}
    return r


@api.post("/notificacoes/{nid}/lida")
def marcar_notificacao(nid: int, lida: bool = True):
    db.executar("UPDATE notificacoes SET lida = ? WHERE id = ?", (lida, nid))
    return {"ok": True}


@api.post("/notificacoes/ler-todas")
def ler_todas_notificacoes():
    db.executar("UPDATE notificacoes SET lida = true WHERE NOT lida AND NOT arquivada")
    return {"ok": True}


@api.delete("/notificacoes/{nid}")
def arquivar_notificacao(nid: int):
    db.executar("UPDATE notificacoes SET arquivada = true, lida = true WHERE id = ?", (nid,))
    return {"ok": True}


@api.post("/notificacoes/limpar")
def limpar_notificacoes(somente: str = "todas"):
    """Arquiva (limpa da lista): todas, só as lidas ou só as resolvidas. Condições ainda ativas voltam se mudarem de estado."""
    filtro = {"lidas": " AND lida", "resolvidas": " AND resolvida"}.get(somente, "")
    db.executar(f"UPDATE notificacoes SET arquivada = true, lida = true WHERE NOT arquivada{filtro}")
    db.registrar("painel", "Notificações limpas", detalhe=somente)
    return {"ok": True}


@api.post("/notificacoes/{nid}/acao")
def acao_notificacao(nid: int):
    from .. import notificacoes
    try:
        return {"mensagem": notificacoes.executar_acao(nid)}
    except ValueError as e:
        raise HTTPException(400, str(e))


class PrefNotificacoesIn(BaseModel):
    tipos_ocultos: list[str] = Field([], max_length=10)
    som: bool = False
    contador_so_importantes: bool = False
    arquivar_resolvidas_h: int = Field(24, ge=0, le=720)


@api.get("/notificacoes/historico")
def historico_notificacoes(limite: int = 200):
    return db.consultar("SELECT * FROM notificacoes ORDER BY atualizado_em DESC LIMIT ?", (min(limite, 500),))


@api.put("/notificacoes/preferencias")
def salvar_pref_notificacoes(d: PrefNotificacoesIn):
    from .. import notificacoes
    dados = d.model_dump()
    dados["tipos_ocultos"] = [t for t in dados["tipos_ocultos"] if t in notificacoes.TIPOS]
    db.set_cfg("notificacoes_pref", dados)
    return dados


# ---------------- site institucional: contato e novidades (público, com limite por IP) ----------------
class SiteContatoIn(BaseModel):
    turnstile: str | None = Field(None, max_length=4096)
    tipo: str = Field(pattern="^(contato|novidades)$")
    nome: str = Field("", max_length=80)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    assunto: str = Field("", max_length=120)
    mensagem: str = Field("", max_length=2000)


@publico.post("/site/contato")
def site_contato(d: SiteContatoIn, request: Request):
    from .. import firewall, notificacoes
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("site_contato",), 60) >= 5:
        raise HTTPException(429, "Muitas mensagens em pouco tempo. Tente de novo em uma hora.")
    from .. import turnstile
    turnstile.exigir(d.turnstile, ip, "/api/site/contato")
    if d.tipo == "contato" and (not d.nome.strip() or len(d.mensagem.strip()) < 5):
        raise HTTPException(400, "Preencha o nome e a mensagem.")
    firewall.registrar(ip, "site_contato", "/api/site/contato", d.tipo)
    from urllib.parse import unquote
    mid = db.executar("INSERT INTO site_mensagens (quando, tipo, nome, email, assunto, mensagem, ip, pais, cidade) VALUES (?,?,?,?,?,?,?,?,?)",
                      (db.agora(), d.tipo, d.nome.strip(), d.email.strip().lower(), d.assunto.strip(), d.mensagem.strip(), ip,
                       request.headers.get("x-vercel-ip-country", "")[:4], unquote(request.headers.get("x-vercel-ip-city", ""))[:80]))
    if d.tipo == "novidades":
        titulo, detalhe = "Novo cadastro para receber novidades", d.email.strip()
    else:
        titulo = f"Mensagem do site: {d.nome.strip()}" + (f" · {d.assunto.strip()}" if d.assunto.strip() else "")
        detalhe = f"{d.email.strip()} · {d.mensagem.strip()}"
    notificacoes.notificar(f"site-{mid}", "sistema", "media", titulo, detalhe, f"/mensagens?id={mid}",
                           {"rotulo": "Abrir mensagem", "tipo": "link", "para": f"/mensagens?id={mid}"})
    return {"ok": True}


# ---------------- mensagens do site (tela do administrador) ----------------
@api.get("/site/mensagens")
def listar_mensagens_site(filtro: str = "entrada", busca: str = "", limite: int = 200):
    w, p = ["true"], []
    w.append({"entrada": "NOT arquivada", "nao_lidas": "NOT arquivada AND NOT lida", "contato": "NOT arquivada AND tipo = 'contato'",
              "novidades": "NOT arquivada AND tipo = 'novidades'", "respondidas": "respondida", "arquivadas": "arquivada"}.get(filtro, "NOT arquivada"))
    if busca.strip():
        w.append("(nome ILIKE ? OR email ILIKE ? OR assunto ILIKE ? OR mensagem ILIKE ?)")
        p += [f"%{busca.strip()}%"] * 4
    itens = db.consultar(f"SELECT * FROM site_mensagens WHERE {' AND '.join(w)} ORDER BY quando DESC LIMIT ?", (*p, min(limite, 500)))
    c = db.um("SELECT count(*) FILTER (WHERE NOT arquivada) AS entrada, count(*) FILTER (WHERE NOT arquivada AND NOT lida) AS nao_lidas, "
              "count(*) FILTER (WHERE NOT arquivada AND tipo = 'contato') AS contato, count(*) FILTER (WHERE NOT arquivada AND tipo = 'novidades') AS novidades, "
              "count(*) FILTER (WHERE respondida) AS respondidas, count(*) FILTER (WHERE arquivada) AS arquivadas, "
              "count(DISTINCT email) FILTER (WHERE tipo = 'novidades') AS inscritos, count(*) FILTER (WHERE quando > ?) AS semana FROM site_mensagens",
              (db.agora() - 7 * 86400,))
    return {"itens": itens, "contagem": c}


class MensagemSiteIn(BaseModel):
    lida: bool | None = None
    arquivada: bool | None = None
    respondida: bool | None = None
    notas: str | None = Field(None, max_length=2000)


@api.put("/site/mensagens/{mid}")
def atualizar_mensagem_site(mid: int, d: MensagemSiteIn):
    campos = {k: v for k, v in d.model_dump().items() if v is not None}
    if campos:
        db.executar(f"UPDATE site_mensagens SET {', '.join(f'{k} = ?' for k in campos)} WHERE id = ?", (*campos.values(), mid))
        if campos.get("lida") or campos.get("arquivada"):
            db.executar("UPDATE notificacoes SET lida = true WHERE chave = ?", (f"site-{mid}",))
    return db.um("SELECT * FROM site_mensagens WHERE id = ?", (mid,)) or {}


@api.post("/site/mensagens/lote")
def lote_mensagens_site(d: dict):
    ids = [int(i) for i in (d.get("ids") or [])][:500]
    acao = d.get("acao")
    if not ids or acao not in ("lida", "nao_lida", "arquivar", "desarquivar", "apagar"):
        raise HTTPException(400, "Escolha mensagens e uma ação.")
    marcas = ",".join("?" * len(ids))
    if acao == "apagar":
        db.executar(f"DELETE FROM site_mensagens WHERE id IN ({marcas})", ids)
    else:
        campo, valor = {"lida": ("lida", True), "nao_lida": ("lida", False), "arquivar": ("arquivada", True), "desarquivar": ("arquivada", False)}[acao]
        db.executar(f"UPDATE site_mensagens SET {campo} = ? WHERE id IN ({marcas})", (valor, *ids))
    db.registrar("painel", "Mensagens do site atualizadas", detalhe=f"{acao}: {len(ids)}")
    return {"ok": True}


@api.delete("/site/mensagens/{mid}")
def apagar_mensagem_site(mid: int):
    db.executar("DELETE FROM site_mensagens WHERE id = ?", (mid,))
    db.executar("UPDATE notificacoes SET arquivada = true WHERE chave = ?", (f"site-{mid}",))
    return {"ok": True}


@api.get("/site/mensagens/exportar")
def exportar_mensagens_site(tipo: str = "todas"):
    import csv
    import io
    from fastapi.responses import Response
    w = "true" if tipo == "todas" else "tipo = ?"
    linhas = db.consultar(f"SELECT * FROM site_mensagens WHERE {w} ORDER BY quando DESC", () if tipo == "todas" else (tipo,))
    s = io.StringIO(); c = csv.writer(s, delimiter=";")
    c.writerow(["data", "tipo", "nome", "email", "assunto", "mensagem", "lida", "respondida", "arquivada", "pais", "cidade", "notas"])
    import datetime as _dt
    for m in linhas:
        c.writerow([_dt.datetime.fromtimestamp(m["quando"]).strftime("%d/%m/%Y %H:%M"), m["tipo"], m["nome"], m["email"], m["assunto"], m["mensagem"],
                    "sim" if m["lida"] else "não", "sim" if m["respondida"] else "não", "sim" if m["arquivada"] else "não", m["pais"], m["cidade"], m["notas"]])
    return Response("\ufeff" + s.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="mensagens-do-site-%s.csv"' % time.strftime("%Y%m%d")})


# ---------------- perfil do administrador (nome, cargo, foto) ----------------
class PerfilIn(BaseModel):
    nome: str = Field("", max_length=80)
    cargo: str = Field("", max_length=80)
    telefone: str = Field("", max_length=40)
    bio: str = Field("", max_length=500)


class AvatarIn(BaseModel):
    dados: str | None = Field(None, max_length=12_000_000)   # data URL do upload
    url: str | None = Field(None, max_length=2000)           # link externo (imagem ou página)


@api.get("/perfil")
def ver_perfil():
    from .. import perfil
    return perfil.ler()


@api.put("/perfil")
def salvar_perfil(d: PerfilIn):
    from .. import perfil
    p = perfil.salvar(d.model_dump())
    db.registrar("painel", "Perfil do administrador atualizado")
    return p


@api.post("/perfil/avatar")
def enviar_avatar(d: AvatarIn):
    from .. import perfil
    try:
        if d.dados:
            img = perfil.de_data_url(d.dados)
        elif d.url:
            img = perfil.importar(d.url)
        else:
            raise ValueError("Envie um arquivo ou um link.")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except httpx.HTTPError:
        raise HTTPException(400, "Não consegui baixar a imagem desse link (tempo esgotado ou site fora do ar).")
    db.registrar("painel", "Foto do perfil alterada")
    return perfil.definir_avatar(img)


@api.delete("/perfil/avatar")
def remover_avatar():
    from .. import perfil
    return perfil.definir_avatar("")


# ---------------- login protegido (conta tentativas por IP e por e-mail) ----------------
class EsqueciIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    turnstile: str | None = Field(None, max_length=4096)
    voltar_para: str = Field("", max_length=300)


@publico.post("/auth/esqueci")
def esqueci_senha(d: EsqueciIn, request: Request):
    """Envia o link de nova senha (com Turnstile e limite por IP). Responde igual exista ou não a conta."""
    import httpx
    from urllib.parse import urlparse
    from .. import firewall, turnstile
    ip = firewall.ip_do_pedido(request)
    turnstile.exigir(d.turnstile, ip, "/api/auth/esqueci")
    if firewall.falhas_recentes(ip, ("esqueci_senha",), 60) >= 5:
        raise HTTPException(429, "Muitos pedidos. Tente de novo em uma hora.")
    firewall.registrar(ip, "esqueci_senha", "/api/auth/esqueci", "")
    host = urlparse(d.voltar_para).hostname or ""
    destino = d.voltar_para if host in ("app.zynio.com.br", "clima-casa-lac.vercel.app", "localhost", "127.0.0.1") else "https://app.zynio.com.br/redefinir-senha"
    try:
        httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/recover", params={"redirect_to": destino}, timeout=12,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}, json={"email": d.email.strip()})
    except httpx.HTTPError:
        pass
    return {"ok": True}


class EntrarIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    senha: str = Field(min_length=1, max_length=200)
    turnstile: str | None = Field(None, max_length=4096)


def _hash_email(email: str) -> str:
    import hashlib
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()[:24]


@publico.post("/auth/entrar")
def entrar(d: EntrarIn, request: Request):
    import httpx
    from .. import firewall
    c = firewall.config()
    ip = firewall.ip_do_pedido(request)
    pais = request.headers.get("x-vercel-ip-country", "")
    agente = request.headers.get("user-agent", "")
    marca = _hash_email(d.email)
    from .. import turnstile
    turnstile.exigir(d.turnstile, ip, "/api/auth/entrar")
    limite, janela = c["tentativas_login"], c["janela_min"]
    if firewall.falhas_recentes(ip, ("login_falhou",), janela, marca) >= limite:
        raise HTTPException(429, f"Muitas tentativas para este e-mail. Tente de novo em {janela} minutos.")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/token?grant_type=password", timeout=12,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}, json={"email": d.email.strip(), "password": d.senha})
    dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or not dados.get("access_token"):
        firewall.registrar(ip, "login_falhou", "/api/auth/entrar", marca, pais, agente)
        falhas_ip = firewall.falhas_recentes(ip, ("login_falhou",), janela)
        if falhas_ip >= limite * 2:
            firewall.bloqueio_automatico(ip, "tentativas de login em excesso")
            raise HTTPException(403, "Acesso bloqueado por excesso de tentativas.")
        restantes = max(0, limite - firewall.falhas_recentes(ip, ("login_falhou",), janela, marca))
        time.sleep(0.4)  # atrasa força bruta
        raise HTTPException(401, "E-mail ou senha incorretos." + (f" Restam {restantes} tentativa(s)." if restantes <= 3 else ""))
    usuario = dados.get("user") or {}
    from .. import acesso
    try:
        u = acesso.carregar(usuario)
    except HTTPException as e:
        firewall.registrar(ip, "login_negado", "/api/auth/entrar", marca, pais, agente)
        raise e
    conhecido = firewall.falhas_recentes(ip, ("login_ok",), 30 * 1440) > 0
    if c.get("registrar_logins_ok", True):
        firewall.registrar(ip, "login_ok", "/api/auth/entrar", marca, pais, agente)
    if not conhecido:
        from .. import notificacoes
        cidade = request.headers.get("x-vercel-ip-city", "")
        from urllib.parse import unquote
        local = ", ".join(x for x in (unquote(cidade), pais) if x)
        notificacoes.notificar(f"login-{ip}", "seguranca", "media", "Entrada do administrador por um IP novo",
                               f"IP {ip}{' · ' + local if local else ''}. Se não foi você, troque a senha e bloqueie o IP.", "/seguranca",
                               {"rotulo": "Ver segurança", "tipo": "link", "para": "/seguranca"})
    db.registrar("sistema", "Login do administrador", detalhe=f"IP {ip}{' · ' + pais if pais else ''}")
    from ..seguranca import tem_totp
    db.executar("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?", (db.agora(), u["id"]))
    return {**{k: dados.get(k) for k in ("access_token", "refresh_token", "expires_in", "expires_at", "token_type")},
            "precisa_2fa": tem_totp(usuario)}


# ---------------- painel de segurança (Configurações → Segurança) ----------------
class SegurancaIn(BaseModel):
    ativo: bool = True
    limite_por_minuto: int = Field(240, ge=30, le=5000)
    tentativas_login: int = Field(5, ge=3, le=20)
    falhas_auth: int = Field(20, ge=5, le=500)
    janela_min: int = Field(15, ge=1, le=1440)
    bloqueio_progressivo: list[int] = Field([15, 60, 1440, 10080], min_length=1, max_length=8)
    detectar_scanners: bool = True
    paises_bloqueados: list[str] = []
    paises_permitidos: list[str] = []
    registrar_logins_ok: bool = True


@api.get("/seguranca")
def ver_seguranca(request: Request):
    from .. import cripto, firewall
    desde = db.agora() - 86400
    por_tipo = {r["tipo"]: r["n"] for r in db.consultar("SELECT tipo, count(*) n FROM seguranca_eventos WHERE quando > ? GROUP BY tipo", (desde,))}
    cifrados = db.um("SELECT count(*) n FROM hubs WHERE local_key LIKE 'enc:v1:%'")["n"] + \
        db.um("SELECT count(*) n FROM config WHERE valor LIKE '\"enc:v1:%'")["n"]
    return {
        "config": firewall.config(),
        "meu_ip": firewall.ip_do_pedido(request), "meu_pais": request.headers.get("x-vercel-ip-country", ""),
        "eventos_24h": por_tipo,
        "bloqueados": db.um("SELECT count(*) n FROM seguranca_ips WHERE tipo = 'bloqueado' AND (expira_em IS NULL OR expira_em > ?)", (db.agora(),))["n"],
        "permitidos": db.um("SELECT count(*) n FROM seguranca_ips WHERE tipo = 'permitido'")["n"],
        "criptografia": {"algoritmo": "AES-256-GCM", "ativa": cripto.disponivel(), "segredos_cifrados": cifrados},
        "camadas": ["TLS 1.2+ e HSTS com preload", "TLS verificado até o banco (CA do Supabase)", "AES-256-GCM em repouso com AAD",
                    "Tokens OAuth guardados como SHA-256", "Supabase Auth com RLS em todas as tabelas", "Firewall de aplicação",
                    "CSP, COOP, CORP, X-Frame-Options, Permissions-Policy"],
    }


@api.put("/seguranca")
def salvar_seguranca(d: SegurancaIn):
    from .. import firewall
    dados = d.model_dump()
    dados["paises_bloqueados"] = sorted({p.strip().upper()[:2] for p in d.paises_bloqueados if p.strip()})
    dados["paises_permitidos"] = sorted({p.strip().upper()[:2] for p in d.paises_permitidos if p.strip()})
    db.set_cfg("seguranca", dados)
    firewall.invalidar()
    db.registrar("painel", "Configurações de segurança alteradas")
    return dados


class IpIn(BaseModel):
    alvo: str = Field(min_length=3, max_length=60)
    tipo: str = Field(pattern="^(bloqueado|permitido)$")
    motivo: str = Field("", max_length=200)
    minutos: int | None = Field(None, ge=1, le=525600)


@api.get("/seguranca/ips")
def listar_ips():
    return db.consultar("SELECT * FROM seguranca_ips WHERE expira_em IS NULL OR expira_em > ? ORDER BY criado_em DESC", (db.agora(),))


@api.post("/seguranca/ips")
def adicionar_ip(d: IpIn, request: Request):
    import ipaddress
    from .. import firewall
    try:
        rede = ipaddress.ip_network(d.alvo.strip(), strict=False)
    except ValueError:
        raise HTTPException(400, "IP ou faixa CIDR inválida (ex.: 203.0.113.7 ou 203.0.113.0/24).")
    meu = firewall.ip_do_pedido(request)
    if d.tipo == "bloqueado":
        try:
            if ipaddress.ip_address(meu) in rede:
                raise HTTPException(400, "Esse bloqueio incluiria o seu próprio IP.")
        except ValueError:
            pass
    alvo = str(rede) if rede.num_addresses > 1 else str(rede.network_address)
    expira = db.agora() + d.minutos * 60 if d.minutos else None
    db.executar("INSERT INTO seguranca_ips (alvo, tipo, motivo, automatico, expira_em, criado_em) VALUES (?,?,?,false,?,?) "
                "ON CONFLICT (alvo) DO UPDATE SET tipo = excluded.tipo, motivo = excluded.motivo, automatico = false, expira_em = excluded.expira_em",
                (alvo, d.tipo, d.motivo.strip(), expira, db.agora()))
    firewall.invalidar()
    db.registrar("painel", f"IP {'bloqueado' if d.tipo == 'bloqueado' else 'liberado'}: {alvo}")
    return {"ok": True}


@api.delete("/seguranca/ips/{iid}")
def remover_ip(iid: int):
    from .. import firewall
    db.executar("DELETE FROM seguranca_ips WHERE id = ?", (iid,))
    firewall.invalidar()
    return {"ok": True}


@api.get("/seguranca/eventos")
def eventos_seguranca(tipo: str | None = None, ip: str | None = None, limite: int = 200):
    sql, p = "SELECT * FROM seguranca_eventos WHERE 1=1", []
    if tipo:
        sql += " AND tipo = ?"; p.append(tipo)
    if ip:
        sql += " AND ip = ?"; p.append(ip)
    sql += " ORDER BY id DESC LIMIT ?"; p.append(min(limite, 1000))
    return db.consultar(sql, p)


@api.get("/seguranca/resumo")
def resumo_seguranca(dias: int = 7):
    from .. import seguranca_relatorio
    return seguranca_relatorio.resumo(max(1, min(dias, 90)))


@api.get("/seguranca/relatorio")
def relatorio_seguranca(formato: str = "pdf", dias: int = 30):
    from fastapi.responses import Response
    from .. import exportar, seguranca_relatorio
    if formato not in exportar.FORMATOS:
        raise HTTPException(400, f"Formato inválido. Use: {', '.join(exportar.FORMATOS)}.")
    corpo, tipo, ext = exportar.FORMATOS[formato](seguranca_relatorio.documento(max(1, min(dias, 90))))
    db.registrar("painel", "Relatório de segurança exportado", detalhe=formato.upper())
    return Response(corpo, media_type=tipo,
                    headers={"Content-Disposition": 'attachment; filename="seguranca-clima-%s.%s"' % (time.strftime("%Y%m%d-%H%M"), ext)})


@api.delete("/seguranca/eventos")
def limpar_eventos_seguranca(dias: int = 30):
    """Apaga eventos mais antigos que N dias (0 = todos)."""
    db.executar("DELETE FROM seguranca_eventos WHERE quando < ?", (db.agora() - max(0, dias) * 86400,))
    db.registrar("painel", "Eventos de segurança apagados", detalhe=f"mais antigos que {dias} dias")
    return {"ok": True}


# ---------------- white label (marca, cores, textos, menu, login) ----------------
MARCA_PADRAO = {
    "nome": "Clima Escritório", "nome_curto": "Clima", "slogan": "O ar do escritório no ponto certo, antes de você chegar.",
    "descricao": "Ar-condicionados por infravermelho, com Alexa, agenda e automações.",
    "logo": "", "favicon": "", "cor_primaria": "#0f766a", "cor_destaque": "#2563a8", "cor_alerta": "#dc2626",
    "tema_padrao": "sistema", "fonte": "sistema", "escala": 100, "raio": 12, "densidade": "confortavel",
    "login_titulo": "Entrar", "login_subtitulo": "Acesso do administrador do escritório.", "login_fumaca": True,
    "login_downloads": True, "login_rodape": "Sem cadastro: o acesso é só do administrador.",
    "rodape": "", "suporte_email": "", "suporte_telefone": "", "suporte_whatsapp": "", "site": "",
    "banner_ativo": False, "banner_texto": "", "banner_cor": "info", "boas_vindas": "",
    "menu_rotulos": {}, "menu_ocultos": [], "css": "", "meta_descricao": "", "dominio": "", "mostrar_creditos": True,
    "unidade_temperatura": "C", "formato_hora": "24h",
}
_CSS_PROIBIDO = re.compile(r"(@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|</style)", re.I)
_COR = re.compile(r"^#[0-9a-fA-F]{6}$")
ROTAS_MENU = {"/", "/projetos", "/relatorios", "/aparelhos", "/cenas", "/automacoes", "/agendamentos", "/transmissores",
              "/integracoes", "/comandos-alexa", "/alexa", "/supabase", "/atividade", "/seguranca", "/mensagens", "/apps"}


def _marca() -> dict:
    return {**MARCA_PADRAO, **(db.cfg("white_label") or {})}


def _validar_marca(m: dict) -> dict:
    limpo = {}
    for k, padrao in MARCA_PADRAO.items():
        v = m.get(k, padrao)
        if isinstance(padrao, bool):
            v = bool(v)
        elif isinstance(padrao, int):
            v = int(v)
        elif isinstance(padrao, dict):
            v = {str(a)[:40]: str(b)[:40] for a, b in (v or {}).items() if str(a) in ROTAS_MENU and str(b).strip()}
        elif isinstance(padrao, list):
            v = [str(x) for x in (v or []) if str(x) in ROTAS_MENU and str(x) != "/"]
        else:
            v = str(v or "")
        limpo[k] = v
    for k in ("cor_primaria", "cor_destaque", "cor_alerta"):
        if not _COR.match(limpo[k]):
            raise HTTPException(400, f"Cor inválida em {k}: use o formato #RRGGBB.")
    for k in ("logo", "favicon"):
        if limpo[k] and not re.match(r"^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$", limpo[k]):
            raise HTTPException(400, "Imagem inválida: envie PNG, JPG, WEBP ou SVG.")
        if len(limpo[k]) > 400_000:
            raise HTTPException(400, "Imagem grande demais (máximo de ~300 KB).")
        if "svg" in limpo[k][:30]:
            import base64 as b64
            svg = b64.b64decode(limpo[k].split(",", 1)[1]).decode(errors="ignore").lower()
            if "<script" in svg or "onload" in svg or "onerror" in svg or "javascript:" in svg or "<foreignobject" in svg:
                raise HTTPException(400, "SVG com script não é permitido.")
    if _CSS_PROIBIDO.search(limpo["css"]) or len(limpo["css"]) > 20_000:
        raise HTTPException(400, "CSS personalizado não pode ter @import, url(), expression ou passar de 20 mil caracteres.")
    limpo["escala"] = max(85, min(120, limpo["escala"]))
    limpo["raio"] = max(0, min(24, limpo["raio"]))
    if limpo["tema_padrao"] not in ("claro", "escuro", "sistema"): limpo["tema_padrao"] = "sistema"
    if limpo["fonte"] not in ("sistema", "arredondada", "serifada", "mono", "condensada"): limpo["fonte"] = "sistema"
    if limpo["densidade"] not in ("compacta", "confortavel", "espacosa"): limpo["densidade"] = "confortavel"
    if limpo["banner_cor"] not in ("info", "alerta", "sucesso", "marca"): limpo["banner_cor"] = "info"
    if limpo["unidade_temperatura"] not in ("C", "F"): limpo["unidade_temperatura"] = "C"
    if limpo["formato_hora"] not in ("24h", "12h"): limpo["formato_hora"] = "24h"
    for k in ("nome", "nome_curto", "login_titulo"):
        if not limpo[k].strip():
            raise HTTPException(400, "Nome e título do login não podem ficar vazios.")
        limpo[k] = limpo[k].strip()[:60]
    for k in ("slogan", "descricao", "login_subtitulo", "login_rodape", "rodape", "banner_texto", "boas_vindas", "meta_descricao"):
        limpo[k] = limpo[k].strip()[:300]
    return limpo


@publico.get("/marca")
def ver_marca():
    """Pública: o login e o favicon precisam da marca antes do login."""
    return _marca()


@api.put("/marca")
def salvar_marca(m: dict):
    novo = _validar_marca(m)
    historico = db.cfg("white_label_historico") or []
    historico.insert(0, {"em": db.agora(), "marca": _marca()})
    db.set_cfg("white_label_historico", historico[:15])
    db.set_cfg("white_label", novo)
    db.registrar("painel", "White label atualizado", detalhe=novo["nome"])
    return novo


@api.get("/marca/historico")
def historico_marca():
    return [{"indice": i, "em": h["em"], "nome": h["marca"].get("nome"), "cor": h["marca"].get("cor_primaria")}
            for i, h in enumerate(db.cfg("white_label_historico") or [])]


@api.post("/marca/historico/{indice}/restaurar")
def restaurar_marca(indice: int):
    historico = db.cfg("white_label_historico") or []
    if not 0 <= indice < len(historico):
        raise HTTPException(404, "Versão não encontrada.")
    return salvar_marca(historico[indice]["marca"])


@api.post("/marca/padrao")
def marca_padrao():
    return salvar_marca(dict(MARCA_PADRAO))
