"""Rotas da API usadas pela interface (todas exigem login, exceto as de autenticação)."""
import json
import re
import time

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Annotated

from pydantic import BaseModel, Field

from .. import clima, cripto, db, supabase_painel, transmissor, tuya_nuvem
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


_STATUS = {"em": 0, "dados": None}


@publico.get("/site/status")
def status_publico():
    """Página de status do site: só o que é seguro mostrar (nada de IP, nome de aparelho ou usuário). Cache de 30 s."""
    if time.time() - _STATUS["em"] < 30 and _STATUS["dados"]:
        return _STATUS["dados"]
    inicio = time.perf_counter()
    try:
        db.um("SELECT 1 AS ok")
        banco = {"ok": True, "ms": round((time.perf_counter() - inicio) * 1000)}
    except Exception:  # noqa: BLE001
        banco = {"ok": False, "ms": None}
    try:
        hubs = db.um("SELECT count(*) AS total, count(*) FILTER (WHERE online = 1) AS online FROM hubs")
        rot = db.um("SELECT count(*) FILTER (WHERE d.status = 'failed') AS falhas, count(*) AS total FROM cron.job_run_details d "
                    "JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname LIKE 'clima_%' AND d.start_time > now() - interval '24 hours'")
        visto = db.cfg("agente_visto_em")
    except Exception:  # noqa: BLE001
        hubs, rot, visto = {"total": 0, "online": 0}, {"falhas": 0, "total": 0}, None
    dados = {"verificado_em": db.agora(), "api": {"ok": True}, "banco": banco,
             "agente": {"ok": transmissor.agente_online(), "visto_ha_s": (db.agora() - int(visto)) if visto else None},
             "transmissores": {"online": hubs["online"], "total": hubs["total"]},
             "rotinas": {"execucoes_24h": rot["total"], "falhas_24h": rot["falhas"]},
             "apps": versao_apps()}
    _STATUS.update(em=time.time(), dados=dados)
    return dados


@publico.get("/apps/versao")
def versao_apps():
    """Versão mais recente dos apps (Android e computador): os apps comparam com a deles e avisam quando há novidade."""
    import pathlib
    return json.loads((pathlib.Path(__file__).resolve().parent.parent / "versao_apps.json").read_text(encoding="utf-8"))


@api.get("/sessao")
def sessao(request: Request):
    from .. import acesso
    from ..seguranca import tem_totp
    u = request.state.usuario
    return {"logado": True, "email": u.get("email"), "ultimo_login": u.get("last_sign_in_at"), **acesso.resumo(request.state.u),
            "totp_ativo": tem_totp(u), "passkeys": db.um("SELECT count(*) AS n FROM passkeys WHERE usuario_id = ?", (u["id"],))["n"]}


@api.post("/sessao/registrar-login")
def registrar_login(request: Request):
    from .. import firewall
    db.registrar("sistema", "Login do administrador", detalhe=request.state.usuario.get("email", ""))
    try:
        firewall.registrar(firewall.ip_do_pedido(request), "login_ok", "/api/sessao/registrar-login", request.state.usuario.get("email", ""),
                           request.headers.get("x-vercel-ip-country", ""), request.headers.get("user-agent", ""))
    except Exception:  # noqa: BLE001
        pass
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
    """Filtro de escopo. Em "a.projeto_id" (tabela de ares) também limita aos ares de quem cuida só de alguns."""
    from .. import acesso
    f, p = acesso.filtro_sql(coluna)
    if coluna == "a.projeto_id":
        fa, pa = acesso.filtro_aparelhos("a.id")
        f, p = f + fa, tuple(p) + pa
    return f, p


def _filtro_projeto(projeto_id, alias="a"):
    """Filtro por projeto; sem projeto escolhido, limita aos projetos que o usuário pode ver."""
    from .. import acesso
    # na tabela de ares (alias "a"), quem cuida só de alguns ares vê só esses
    fa, pa = acesso.filtro_aparelhos(f"{alias}.id") if alias == "a" else ("", ())
    if projeto_id:
        acesso.checar_projeto(projeto_id) if acesso.projetos_permitidos() is not None else None
        return (f" WHERE {alias}.projeto_id = ?{fa}", (projeto_id,) + pa)
    f, pp = acesso.filtro_sql(f"{alias}.projeto_id")
    return (f" WHERE true{f}{fa}", pp + pa) if (f or fa) else ("", ())


def _filtro_hubs(projeto_id=None, alias="h"):
    """Transmissores de um projeto: os do projeto E os que atendem algum ar dele (o transmissor do salão aparece em
    Analistas, Diretor, Bancada e Deison). Sem projeto escolhido, limita ao escopo do usuário do mesmo jeito."""
    from .. import acesso
    if projeto_id:
        if acesso.projetos_permitidos() is not None:
            acesso.checar_projeto(projeto_id)
        return (f" WHERE ({alias}.projeto_id = ? OR {alias}.id IN (SELECT hub_id FROM aparelhos WHERE projeto_id = ? AND hub_id IS NOT NULL))",
                (projeto_id, projeto_id))
    perm = acesso.projetos_permitidos()
    if perm is None:
        return "", ()
    if not perm:
        return " WHERE false", ()
    marcas = ",".join("?" * len(perm))
    return (f" WHERE ({alias}.projeto_id IN ({marcas}) OR {alias}.id IN (SELECT hub_id FROM aparelhos WHERE projeto_id IN ({marcas}) AND hub_id IS NOT NULL))",
            tuple(perm) + tuple(perm))


def _com_zona(lista):
    """Marca em cada ar a zona dele (ares que obedecem juntos): a tela avisa que o comando muda a zona inteira."""
    from .. import zonas
    mapa_z = {}
    for z in zonas.listar():
        for i in z["aparelhos"]:
            mapa_z[i] = {"id": z["id"], "nome": z["nome"], "total": len(z["aparelhos"]), "outros": [a["nome"] for a in z["ares"] if a["id"] != i]}
    for a in lista:
        a["zona"] = mapa_z.get(a["id"])
    return lista


@api.get("/painel")
def painel(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id)
    aparelhos = db.consultar(f"""
        SELECT a.*, h.nome AS hub_nome, h.online AS hub_online, pr.nome AS projeto_nome,
               (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS total_codigos
        FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id LEFT JOIN projetos pr ON pr.id = a.projeto_id
        {w} ORDER BY a.comodo, a.nome""", p)
    wh, ph = _filtro_hubs(projeto_id, "h")
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
        "aparelhos": _com_zona(aparelhos),
        "atividade": _atividade(8),
        "projetos": db.um("SELECT COUNT(*) n FROM projetos")["n"],
        "sinric": (db.cfg("sinric_status") or {}).get("conectado", False),
        "nuvem": tuya_nuvem.conectada(),
        "alertas": db.um("SELECT COUNT(*) n FROM alertas WHERE NOT resolvido")["n"],
        "agente": {"online": transmissor.agente_online(), "visto_em": db.cfg("agente_visto_em"),
                   "papel": transmissor.PAPEL},
        "alexa": bool(db.um("SELECT 1 FROM oauth_tokens WHERE tipo = 'refresh' AND expira > ?", (db.agora(),))),
    }


@api.get("/painel/analise")
def painel_analise(projeto_id: int | None = None):
    """Leitura rápida para o Painel: 7 dias (uso por hora e dia, origens, horas ligado, conclusões) e o mês (custo e projeção)."""
    import datetime as _dt
    from .. import relatorio
    agora = db.agora()
    semana = relatorio.montar(agora - 7 * 86400, agora, projeto_id=projeto_id)
    inicio_mes = int(_dt.datetime.now(relatorio.FUSO).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    mes = relatorio.montar(inicio_mes, agora, projeto_id=projeto_id)["resumo"]
    meta = db.um("SELECT coalesce(sum(meta_custo_mes), 0) AS m FROM projetos" + (" WHERE id = ?" if projeto_id else ""), (projeto_id,) if projeto_id else ())["m"]
    return {"semana": {k: semana[k] for k in ("resumo", "por_dia", "por_hora", "por_origem", "mapa_calor", "modos", "conclusoes", "por_aparelho")},
            "mes": {"custo": mes["custo"], "kwh": mes["kwh"], "horas": mes["horas_ligado"], "projecao": mes["projecao_mes"],
                    "dias": mes["dias"], "fora_expediente_pct": mes["fora_expediente_pct"], "meta": float(meta or 0)}}


def _atividade(limite, aparelho_id=None, origem=None, so_falhas=False, antes=None, de=None, ate=None, q=None):
    sql = ("SELECT t.*, a.nome AS aparelho_nome FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id "
           "WHERE 1=1")
    p = []
    if de:
        sql += " AND t.quando >= ?"; p.append(int(de))
    if ate:
        sql += " AND t.quando < ?"; p.append(int(ate))
    if q:
        sql += " AND (t.acao ILIKE ? OR t.detalhe ILIKE ? OR a.nome ILIKE ? OR t.origem ILIKE ?)"; p += [f"%{q[:80]}%"] * 4
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
              antes: int | None = None, limite: int = 50, de: int | None = None, ate: int | None = None, q: str | None = None):
    return _atividade(min(limite, 500), aparelho_id, origem, falhas, antes, de, ate, (q or "").strip() or None)


# dicas para as falhas mais comuns (o texto do erro → o que fazer)
DICAS_FALHA = [
    ("Nenhum botão gravado", "Grave os botões do controle original na tela do aparelho (Botões gravados).", "/aparelhos"),
    ("ainda não foi gravado", "Grave esse botão na tela do aparelho.", "/aparelhos"),
    ("não respondeu a tempo", "O agente do escritório estava offline ou ocupado. Confira em Infra → Agentes.", "/infra"),
    ("offline", "Transmissor fora da rede: confira a tomada e o Wi-Fi 2,4 GHz e use Reconectar agora.", "/transmissores"),
    ("state", "Login do Spotify vencido: clique em Conectar de novo.", "/musica"),
    ("Spotify", "Veja a tela Música: conta, Premium e aparelho ativo.", "/musica"),
    ("bloqueado", "Acesso barrado pelo firewall; veja Segurança.", "/seguranca"),
]


@api.get("/atividade/analise")
def analise_atividade(dias: int = 7, aparelho_id: int | None = None, origem: str | None = None):
    dias = max(1, min(dias, 90))
    desde = db.agora() - dias * 86400
    w, p = " WHERE t.quando >= ?", [desde]
    if aparelho_id:
        w += " AND t.aparelho_id = ?"; p.append(aparelho_id)
    if origem:
        w += " AND (t.origem = ? OR t.origem LIKE ?)"; p += [origem, origem + ":%"]
    f, pp = _escopo("a.projeto_id"); w += f; p += list(pp)
    base = "FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id" + w
    # horário de Brasília (UTC-3) para dia, hora e dia da semana
    por_dia = db.consultar(f"SELECT to_char(to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia, COUNT(*) AS total, "
                           f"SUM(CASE WHEN t.ok = 0 THEN 1 ELSE 0 END) AS falhas {base} GROUP BY 1 ORDER BY 1", tuple(p))
    mapa = db.consultar(f"SELECT EXTRACT(DOW FROM to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC')::int AS dow, "
                        f"EXTRACT(HOUR FROM to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC')::int AS hora, COUNT(*) AS n {base} GROUP BY 1, 2", tuple(p))
    por_origem = db.consultar(f"SELECT split_part(t.origem, ':', 1) AS origem, COUNT(*) AS total, SUM(CASE WHEN t.ok = 0 THEN 1 ELSE 0 END) AS falhas {base} GROUP BY 1 ORDER BY 2 DESC", tuple(p))
    por_aparelho = db.consultar(f"SELECT COALESCE(a.nome, '(sistema)') AS nome, t.aparelho_id, COUNT(*) AS total, SUM(CASE WHEN t.ok = 0 THEN 1 ELSE 0 END) AS falhas {base} GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12", tuple(p))
    acoes = db.consultar(f"SELECT t.acao, COUNT(*) AS total {base} GROUP BY 1 ORDER BY 2 DESC LIMIT 10", tuple(p))
    falhas = db.consultar(f"SELECT COALESCE(NULLIF(t.detalhe, ''), t.acao) AS motivo, COUNT(*) AS total, MAX(t.quando) AS ultima {base} AND t.ok = 0 GROUP BY 1 ORDER BY 2 DESC LIMIT 8", tuple(p))
    for x in falhas:
        dica = next((d for d in DICAS_FALHA if d[0].lower() in (x["motivo"] or "").lower()), None)
        x["dica"], x["link"] = (dica[1], dica[2]) if dica else ("", "")
    total = sum(int(d["total"]) for d in por_dia); nf = sum(int(d["falhas"] or 0) for d in por_dia)
    return {"dias": dias, "total": total, "falhas": nf, "sucesso_pct": round((total - nf) / total * 100, 1) if total else None,
            "por_dia": por_dia, "mapa": mapa, "por_origem": por_origem, "por_aparelho": por_aparelho, "acoes": acoes, "falhas_comuns": falhas}


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


def _exigir_hub_usavel(hub_id: str | None):
    """Com acesso limitado, só dá para pôr o ar num transmissor do seu projeto ou que já atende um ar seu
    (salão aberto: um transmissor no teto serve salas de projetos diferentes)."""
    from .. import acesso
    perm = acesso.projetos_permitidos()
    if perm is None or not hub_id:
        return
    h = db.um("SELECT projeto_id FROM hubs WHERE id = ?", (hub_id,))
    if h and h["projeto_id"] in perm:
        return
    ids = _ids_aparelhos_permitidos() or set()
    if any(r["id"] in ids for r in db.consultar("SELECT id FROM aparelhos WHERE hub_id = ?", (hub_id,))):
        return
    raise HTTPException(403, "Esse transmissor é de outro projeto.")


@api.get("/aparelhos")
def listar_aparelhos(projeto_id: int | None = None):
    w, p = _filtro_projeto(projeto_id)
    return _com_zona(db.consultar(f"""
        SELECT a.*, h.nome AS hub_nome, h.online AS hub_online, pr.nome AS projeto_nome,
               (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS total_codigos
        FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id LEFT JOIN projetos pr ON pr.id = a.projeto_id
        {w} ORDER BY pr.nome, a.comodo, a.nome""", p))


@api.post("/aparelhos")
def criar_aparelho(d: AparelhoIn):
    _validar_aparelho(d)
    temp = max(d.temp_min, min(d.temp_max, 23))
    projeto = d.projeto_id or (db.um("SELECT projeto_id FROM hubs WHERE id = ?", (d.hub_id,)) or {}).get("projeto_id")
    _exigir_projeto(projeto)
    _exigir_hub_usavel(d.hub_id)
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


@api.get("/aparelhos/{aid}/pronto-para-gravar")
def pronto_para_gravar(aid: int):
    """Antes de gravar um botão: o ar tem transmissor? ele responde? há um agente principal na rede do escritório que o
    enxerga? Gravar só funciona com o agente perto do transmissor (o sinal vem do controle original para o transmissor)."""
    from .. import coordenador, zonas
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    itens = []
    hub = db.um("SELECT id, nome, online, visto_em FROM hubs WHERE id = ?", (a["hub_id"],)) if a.get("hub_id") else None
    itens.append({"chave": "transmissor", "ok": bool(hub), "titulo": "Transmissor vinculado",
                  "detalhe": hub["nome"] if hub else "Este ar não tem transmissor: escolha um em Ajustes antes de gravar."})
    if hub:
        itens.append({"chave": "online", "ok": bool(hub["online"]), "titulo": "Transmissor respondendo",
                      "detalhe": "Online." if hub["online"] else "Sem resposta: confira a tomada e o Wi-Fi 2,4 GHz; em Transmissores, “Reconectar agora”."})
    principal = next((m for m in coordenador.maquinas() if m.get("principal")), None)
    ve = (principal or {}).get("ve_transmissores")
    itens.append({"chave": "agente", "ok": bool(principal) and bool(ve),
                  "titulo": "Agente no escritório",
                  "detalhe": (f"{principal['nome']} no comando, enxergando {ve} de {principal.get('total_transmissores')} transmissor(es)."
                              if principal and ve else f"{principal['nome']} está no comando mas não enxerga os transmissores (fora da rede do escritório)."
                              if principal else "Nenhum agente ligado: ligue o PC ou o Raspberry Pi do escritório.")})
    z = next((x for x in zonas.listar() if aid in x.get("aparelhos", [])), None)
    outros = [n["nome"] for n in db.consultar(f"SELECT nome FROM aparelhos WHERE id IN ({','.join('?' * len(z['aparelhos']))}) AND id <> ?", (*z["aparelhos"], aid))] if z else []
    total = db.um("SELECT count(*) n FROM codigos WHERE aparelho_id = ?", (aid,))["n"]
    tem_desligar = bool(db.um("SELECT 1 FROM codigos WHERE aparelho_id = ? AND chave = 'desligar'", (aid,)))
    gree = "gree" in (a.get("marca") or "").lower()
    return {"pronto": all(i["ok"] for i in itens), "itens": itens, "zona_outros": outros, "botoes": total, "tem_desligar": tem_desligar, "gree": gree}


@api.get("/aparelhos/{aid}")
def ver_aparelho(aid: int):
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    _com_zona([a])
    cods = db.consultar("SELECT id, chave, rotulo, criado_em FROM codigos WHERE aparelho_id = ? ORDER BY chave", (aid,))
    for c in cods:
        c["descricao"] = c["rotulo"] or clima.rotulo_chave(c["chave"])
    hub = db.um("SELECT id, nome, online, ip, control_type FROM hubs WHERE id = ?", (a["hub_id"],)) if a["hub_id"] else None
    # quem cuida deste ar (contas com "só estes ares" que incluem ele)
    resp = [r["nome"] or r["email"] for r in db.consultar(
        "SELECT nome, email FROM usuarios WHERE ativo AND jsonb_typeof(aparelhos) = 'array' AND aparelhos @> CAST(? AS jsonb) ORDER BY nome", (json.dumps([aid]),))]
    return {**a, "codigos": cods, "hub": hub, "atividade": _atividade(15, aid), "responsaveis": resp}


@api.put("/aparelhos/{aid}")
def editar_aparelho(aid: int, d: AparelhoIn):
    _validar_aparelho(d)
    _exigir_projeto(d.projeto_id)
    try:
        a = clima.aparelho(aid)
    except KeyError as e:
        _erro(e)
    if d.hub_id != a["hub_id"]:
        _exigir_hub_usavel(d.hub_id)
    temp = max(d.temp_min, min(d.temp_max, a["temperatura"]))
    modo = a["modo"] if a["modo"] in d.modos else d.modos[0]
    db.executar("UPDATE aparelhos SET nome=?, comodo=?, marca=?, hub_id=?, temp_min=?, temp_max=?, modos=?, alexa=?, "
                "temperatura=?, modo=?, projeto_id=?, potencia_w=? WHERE id=?",
                (d.nome.strip(), d.comodo.strip(), d.marca.strip(), d.hub_id, d.temp_min, d.temp_max,
                 ",".join(d.modos), int(d.alexa), temp, modo, d.projeto_id, d.potencia_w, aid))
    db.registrar("painel", "Aparelho editado", aparelho_id=aid)
    if a.get("sinric_device_id") and (a["nome"] != d.nome.strip() or (a.get("comodo") or "") != d.comodo.strip() or a.get("projeto_id") != d.projeto_id):
        from .. import sinric
        try:   # nome falado e sala (projeto) mudam também no Sinric
            sinric.renomear_dispositivo(a["sinric_device_id"], d.nome.strip(), d.comodo.strip(), {**a, "projeto_id": d.projeto_id})
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


class GreeIn(BaseModel):
    acao: str = Field(pattern=r"^(conferir|testar|gerar)$")
    base: str = Field("desligar", max_length=60, pattern=r"^[a-z0-9_]+$")
    modo: str = Field("frio", pattern=r"^(auto|frio|seco|ventilar|quente)$")
    temperatura: int = Field(24, ge=16, le=30)
    ventilador: str = Field("auto", pattern=r"^(auto|baixa|media|alta)$")


@api.post("/aparelhos/{aid}/gree")
def gree_aparelho(aid: int, d: GreeIn):
    """Controle Gree: com UM botão gravado (o Desligar), confere o sinal, testa um ajuste e gera os 300 botões."""
    from .. import gree
    a = clima.aparelho(aid)
    linha = db.um("SELECT codigo FROM codigos WHERE aparelho_id = ? AND chave = ?", (aid, d.base))
    if not linha:
        raise HTTPException(409, "Grave primeiro o botão Desligar deste ar (Botões → Desligar). Ele é a base para gerar os outros.")
    base = gree.pulsos(linha["codigo"])
    if not gree.eh_gree(base):
        raise HTTPException(422, f"O sinal gravado ({len(base)} pulsos) não é do protocolo Gree ou veio com defeito. "
                                 "Grave o Desligar de novo ou grave os botões à mão.")
    if d.acao == "conferir":
        return {"gree": True, "base": d.base, "pulsos": len(base), "estado": gree.descrever(base), "total": 5 * 15 * 4}
    if d.acao == "testar":
        if not a["hub_id"]:
            raise HTTPException(409, "Este ar não tem transmissor vinculado.")
        p = gree.gerar(base, True, gree.MODOS[d.modo], d.temperatura, gree.VENT[d.ventilador])
        try:
            via = transmissor.enviar(a["hub_id"], gree.codigo(p))
        except Exception as e:  # noqa: BLE001
            db.registrar("painel", f"Teste Gree: {d.modo} {d.temperatura}°", ok=False, aparelho_id=aid, detalhe=str(e))
            _erro(e)
        db.registrar("painel", f"Teste Gree: {clima.MODOS[d.modo]} {d.temperatura}° · ventilação {clima.VENTILACAO[d.ventilador].lower()}",
                     aparelho_id=aid, detalhe=f"via {via}")
        return {"ok": True, "via": via}
    n = 0
    for chave, cod in gree.todos(base):
        db.executar("INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) VALUES (?,?,?,?,?) "
                    "ON CONFLICT (aparelho_id, chave) DO UPDATE SET codigo = excluded.codigo, rotulo = excluded.rotulo, criado_em = excluded.criado_em",
                    (aid, chave, "gerado (Gree)", cod, db.agora()))
        n += 1
    db.registrar("painel", f"{n} botões gerados pelo protocolo Gree", aparelho_id=aid, detalhe=f"a partir de '{d.base}'")
    return {"ok": True, "gerados": n}


class CopiarIn(BaseModel):
    de: int = Field(ge=1)


@api.post("/aparelhos/{aid}/copiar-botoes")
def copiar_botoes(aid: int, d: CopiarIn):
    """Ar do mesmo modelo: usa os botões de outro ar (sem gravar de novo). Substitui os que tiverem o mesmo nome."""
    if d.de == aid:
        raise HTTPException(422, "Escolha outro ar.")
    _exigir_aparelhos([d.de])
    origem = clima.aparelho(d.de)
    clima.aparelho(aid)
    n = db.um("SELECT COUNT(*) n FROM codigos WHERE aparelho_id = ?", (d.de,))["n"]
    if not n:
        raise HTTPException(409, f"O ar '{origem['nome']}' ainda não tem botões.")
    db.executar("INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) SELECT ?, chave, rotulo, codigo, ? FROM codigos "
                "WHERE aparelho_id = ? ON CONFLICT (aparelho_id, chave) DO UPDATE SET codigo = excluded.codigo, rotulo = excluded.rotulo, "
                "criado_em = excluded.criado_em", (aid, db.agora(), d.de))
    db.registrar("painel", f"{n} botões copiados de '{origem['nome']}'", aparelho_id=aid, detalhe="mesmo modelo de controle")
    return {"ok": True, "copiados": n}


class JuntoIn(BaseModel):
    junto: bool


@api.post("/aparelhos/{aid}/zona")
def ar_na_zona(aid: int, d: JuntoIn):
    """Este ar muda (ou não) junto com os outros do mesmo transmissor. Para quem conhece a sala sem fazer o teste inteiro."""
    from .. import zonas
    a = clima.aparelho(aid)
    _exigir_hub_inteiro(a["hub_id"]) if a.get("hub_id") else None
    try:
        zonas.mudar_junto(aid, d.junto)
    except ValueError as e:
        _erro(e)
    db.registrar("painel", f"{a['nome']}: {'obedece junto com os outros do transmissor' if d.junto else 'não obedece junto (sala separada)'}", aparelho_id=aid)
    return {"zona": next((z for z in zonas.listar() if aid in z["aparelhos"]), None)}


class EstadoRealIn(BaseModel):
    ligado: bool
    modo: str | None = Field(None, pattern=r"^(auto|frio|seco|ventilar|quente)$")
    temperatura: int | None = Field(None, ge=16, le=30)
    ventilador: str | None = Field(None, pattern=r"^(auto|baixa|media|alta)$")
    zona: bool = False   # aplicar também aos ares da zona (o controle remoto também atinge os iguais à vista)


@api.post("/aparelhos/{aid}/estado-real")
def estado_real(aid: int, d: EstadoRealIn):
    """Ligaram (ou mudaram) pelo controle remoto: o ar não avisa ninguém (infravermelho só vai num sentido e o SRW-004 não
    tem sensor). Aqui a pessoa conta o que o ar está fazendo e o sistema atualiza o estado SEM mandar sinal."""
    from .. import zonas
    a = clima.aparelho(aid)
    ids = [aid]
    if d.zona:
        z = zonas.de_aparelho(aid)
        ids += [i for i in (z["aparelhos"] if z else []) if i != aid]
    _exigir_aparelhos(ids)
    agora = db.agora()
    modo = d.modo or a["modo"]
    temp = max(a["temp_min"], min(a["temp_max"], d.temperatura or a["temperatura"]))
    vent = d.ventilador or a["ventilador"]
    for i in ids:
        atual = clima.aparelho(i)
        desde = (atual["ligado_desde"] if atual["ligado"] else agora) if d.ligado else None
        db.executar("UPDATE aparelhos SET ligado = ?, modo = ?, temperatura = ?, ventilador = ?, ligado_desde = ?, atualizado_em = ? WHERE id = ?",
                    (int(d.ligado), modo, temp, vent, desde, agora, i))
        db.registrar("controle", f"Estado corrigido: {'ligado ' + clima.MODOS.get(modo, modo) + f' {temp}°' if d.ligado else 'desligado'} pelo controle remoto",
                     aparelho_id=i, detalhe="informado no painel (sem mandar sinal)")
    return {**clima.aparelho(aid), "juntos": [i for i in ids if i != aid]}


class TodosIn(BaseModel):
    ligado: bool
    modo: str | None = Field(None, pattern=r"^(auto|frio|seco|ventilar|quente)$")
    temperatura: int | None = Field(None, ge=16, le=30)


# ---------------- zonas (ares que obedecem juntos ao mesmo transmissor: backend/app/zonas.py) ----------------
@api.get("/zonas")
def listar_zonas():
    from .. import zonas
    perm = _ids_aparelhos_permitidos()
    if perm is None:
        return zonas.listar()
    # acesso limitado: a zona aparece se tem um ar seu, mas os ares de outros projetos viram só uma contagem
    return [{**z, "aparelhos": [i for i in z["aparelhos"] if i in perm], "ares": [a for a in z["ares"] if a["id"] in perm],
             "total": len(z["aparelhos"]), "outros_projetos": len([i for i in z["aparelhos"] if i not in perm])}
            for z in zonas.listar() if set(z["aparelhos"]) & perm]


def _hubs_inteiros_permitidos() -> set | None:
    """Transmissores em que TODOS os ares são do usuário (None = acesso total). Só nesses dá para mexer nas zonas e testar
    interferência: o sinal e as zonas de um transmissor atingem todos os ares dele."""
    perm = _ids_aparelhos_permitidos()
    if perm is None:
        return None
    por_hub: dict[str, set] = {}
    for r in db.consultar("SELECT id, hub_id FROM aparelhos WHERE hub_id IS NOT NULL"):
        por_hub.setdefault(r["hub_id"], set()).add(r["id"])
    return {h for h, ids in por_hub.items() if ids <= perm}


def _exigir_hub_inteiro(hid: str):
    ok = _hubs_inteiros_permitidos()
    if ok is not None and hid not in ok:
        raise HTTPException(403, "Este transmissor também atende ares de outro projeto: peça a quem tem acesso a todos.")


class ZonaIn(BaseModel):
    id: str = Field("", max_length=40)
    nome: str = Field(min_length=1, max_length=40)
    hub_id: str = Field(min_length=1, max_length=40)
    aparelhos: list[int] = Field(max_length=20)
    alexa_aparelho_id: int | None = None


@api.put("/zonas")
def salvar_zonas(d: list[ZonaIn]):
    """Substitui as zonas salvas (nome, ares, qual ar representa a zona na Alexa)."""
    from .. import zonas
    if len(d) > 30:
        raise HTTPException(422, "Zonas demais.")
    for z in d:
        try:
            transmissor.hub(z.hub_id)
        except KeyError as e:
            _erro(e)
        _exigir_hub_inteiro(z.hub_id)
        if z.alexa_aparelho_id and z.alexa_aparelho_id not in z.aparelhos:
            raise HTTPException(422, f"O ar da Alexa da zona '{z.nome}' precisa estar na zona.")
    novas = [{**z.model_dump(), "origem": "manual"} for z in d]
    editaveis = _hubs_inteiros_permitidos()
    if editaveis is not None:   # acesso limitado: as zonas dos outros transmissores continuam como estão
        novas = [z for z in zonas._salvas() if z["hub_id"] not in editaveis] + novas
    r = zonas.salvar(novas)
    db.registrar("painel", "Zonas de ar atualizadas", detalhe=", ".join(f"{z['nome']} ({len(z['aparelhos'])})" for z in r))
    return zonas.listar()


class EstadoZonaIn(BaseModel):
    ligado: bool | None = None
    modo: str | None = Field(None, pattern=r"^(auto|frio|seco|ventilar|quente)$")
    temperatura: int | None = Field(None, ge=16, le=30)
    ventilador: str | None = Field(None, pattern=r"^(auto|baixa|media|alta)$")


@api.post("/zonas/{zid}/estado")
def estado_zona(zid: str, d: EstadoZonaIn):
    """Um único sinal pelo transmissor: todos os ares da zona mudam (é o que acontece fisicamente)."""
    from .. import zonas
    z = next((x for x in zonas.listar() if x["id"] == zid), None)
    if not z:
        raise HTTPException(404, "Zona não encontrada.")
    _exigir_aparelhos(z["aparelhos"])
    com_botoes = {r["aparelho_id"] for r in db.consultar(
        f"SELECT DISTINCT aparelho_id FROM codigos WHERE aparelho_id IN ({','.join('?' * len(z['aparelhos']))})", tuple(z["aparelhos"]))}
    rep_id = z.get("alexa_aparelho_id") if z.get("alexa_aparelho_id") in com_botoes else next((i for i in z["aparelhos"] if i in com_botoes), None)
    if not rep_id:
        raise HTTPException(409, "Nenhum ar desta zona tem botões gravados.")
    try:
        r = clima.aplicar(rep_id, "painel", **d.model_dump())
    except Exception as e:  # noqa: BLE001
        _erro(e)
    return {**r, "zona": z["id"]}


class TesteInterferenciaIn(BaseModel):
    acao: str = Field(pattern=r"^(enviar|gravar)$")
    aparelho_id: int | None = None
    comando: str = Field("ligar", pattern=r"^(ligar|desligar)$")
    respostas: dict[int, list[int]] = Field(default_factory=dict)


@api.post("/hubs/{hid}/teste-interferencia")
def teste_interferencia(hid: str, d: TesteInterferenciaIn):
    """Assistente: manda o sinal de UM ar (Ligar Frio 24° ou Desligar) sem mexer no estado salvo; a pessoa no salão diz quem
    apitou. No fim ('gravar'), os grupos viram as zonas deste transmissor (o resultado real vence o palpite por código)."""
    from .. import zonas
    try:
        transmissor.hub(hid)
    except KeyError as e:
        _erro(e)
    _exigir_hub_inteiro(hid)
    if d.acao == "gravar":
        ids = {r["id"] for r in db.consultar("SELECT id FROM aparelhos WHERE hub_id = ?", (hid,))}
        respostas = {a: [b for b in lst if b in ids] for a, lst in d.respostas.items() if a in ids}
        zs = zonas.gravar_do_teste(hid, respostas)
        db.registrar("painel", "Teste de interferência gravado", detalhe=f"{len([z for z in zs if z['hub_id'] == hid])} zona(s) no transmissor")
        return {"zonas": [z for z in zonas.listar() if z["hub_id"] == hid]}
    a = db.um("SELECT id, nome, hub_id FROM aparelhos WHERE id = ?", (d.aparelho_id or 0,))
    if not a or a["hub_id"] != hid:
        raise HTTPException(422, "Escolha um ar deste transmissor.")
    cods = clima.codigos(a["id"])
    chave = "desligar" if d.comando == "desligar" else (clima.escolher_codigo(cods, "frio", 24, "auto")[0])
    if not chave or chave not in cods:
        raise HTTPException(409, f"O ar '{a['nome']}' não tem o botão necessário gravado.")
    try:
        via = transmissor.enviar(hid, cods[chave])
    except Exception as e:  # noqa: BLE001
        _erro(e)
    db.registrar("painel", f"Teste de interferência: {'Desligar' if d.comando == 'desligar' else 'Ligar Frio 24°'}", aparelho_id=a["id"], detalhe=f"via {via}")
    return {"ok": True, "via": via, "botao": chave}


class AresDoHubIn(BaseModel):
    aparelhos: list[int] = Field(max_length=30)
    projeto_id: int | None = None


@api.put("/hubs/{hid}/ares")
def ares_do_hub(hid: str, d: AresDoHubIn):
    """Planejar ou mover um transmissor: quais ares ele atende agora. Quem sai fica 'sem transmissor' (botões continuam
    salvos), assim um transmissor levado para outro lugar nunca dispara num ar que não vê mais."""
    h = transmissor.hub(hid)
    _exigir_aparelhos(d.aparelhos)
    if d.projeto_id:
        _exigir_projeto(d.projeto_id)
    antes = {r["id"] for r in db.consultar("SELECT id FROM aparelhos WHERE hub_id = ?", (hid,))}
    _exigir_aparelhos(antes)
    novos = set(d.aparelhos)
    for i in antes - novos:
        db.executar("UPDATE aparelhos SET hub_id = NULL WHERE id = ?", (i,))
    for i in novos - antes:
        db.executar("UPDATE aparelhos SET hub_id = ? WHERE id = ?", (hid, i))
    if d.projeto_id:
        db.executar("UPDATE hubs SET projeto_id = ? WHERE id = ?", (d.projeto_id, hid))
    db.registrar("painel", f"Ares do transmissor {h['nome']} atualizados", detalhe=f"entraram {len(novos - antes)}, saíram {len(antes - novos)}")
    return listar_hubs()


@api.post("/hubs/{hid}/todos")
def hub_todos(hid: str, d: TodosIn):
    """Liga ou desliga todos os ares de um transmissor, um de cada vez (o SRW-004 manda um sinal por vez)."""
    import time
    transmissor.hub(hid)
    ids = [r["id"] for r in db.consultar("SELECT id FROM aparelhos WHERE hub_id = ? ORDER BY nome", (hid,))]
    perm = _ids_aparelhos_permitidos()
    if perm is not None:
        ids = [i for i in ids if i in perm]
    if not ids:
        raise HTTPException(404, "Nenhum ar seu neste transmissor.")
    feitos, falhas, ja = [], [], set()
    for i in ids:
        if i in ja:             # já mudou junto com outro (mesmo modelo): não manda de novo
            feitos.append(i); continue
        try:
            r = clima.aplicar(i, "painel", ligado=d.ligado, modo=d.modo, temperatura=d.temperatura)
            feitos.append(i); ja.update(r.get("juntos") or [])
        except Exception as e:  # noqa: BLE001
            falhas.append({"id": i, "erro": str(e)[:160]})
        time.sleep(1.2)
    return {"feitos": feitos, "falhas": falhas}


# ---------------- "O que há de novo" (backend/app/novidades.json) ----------------
def _novidades() -> list[dict]:
    import pathlib
    return json.loads((pathlib.Path(__file__).resolve().parent.parent / "novidades.json").read_text(encoding="utf-8"))["versoes"]


def _chave_versao(v: str) -> tuple:
    return tuple(int(x) if x.isdigit() else 0 for x in (v or "0").split("."))


@api.get("/novidades")
def novidades():
    """Histórico de versões + qual a pessoa já viu. `mostrar` = abrir o modal agora (versão nova desde a última vista)."""
    from .. import acesso
    versoes = _novidades()
    u = acesso.atual.get() or {}
    vista = (db.um("SELECT novidades_vista FROM usuarios WHERE id = ?", (u.get("id"),)) or {}).get("novidades_vista") if u.get("id") else None
    atual = versoes[0]["versao"] if versoes else None
    if atual:   # avisa também na central de notificações (uma por versão, para todos)
        if not db.um("SELECT 1 FROM notificacoes WHERE chave = ?", (f"versao:{atual}",)):
            from .. import notificacoes
            notificacoes.notificar(f"versao:{atual}", "sistema", "baixa", f"Versão {atual} no ar: {versoes[0]['titulo']}",
                                   versoes[0].get("resumo", ""), "/novidades")
    return {"atual": atual, "vista": vista, "mostrar": bool(atual and _chave_versao(atual) > _chave_versao(vista)),
            "versoes": versoes}


class VistaIn(BaseModel):
    versao: str = Field(max_length=20, pattern=r"^\d+\.\d+\.\d+$")


@api.post("/novidades/vista")
def novidades_vista(d: VistaIn):
    from .. import acesso
    u = acesso.atual.get() or {}
    if not u.get("id"):
        raise HTTPException(401, "Entre de novo.")
    db.executar("UPDATE usuarios SET novidades_vista = ? WHERE id = ?", (d.versao, u["id"]))
    return {"ok": True}


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


LIMITE_ARES_POR_TRANSMISSOR = 6   # recomendado: um SRW-004 no teto de um salão aberto alcança bem até ~6 ares à vista


def _hub_publico(h):
    h = dict(h)
    h["tem_chave"] = bool(h.pop("local_key", None))
    h["funcoes_nuvem"] = json.loads(h["funcoes_nuvem"] or "[]")
    ares = db.consultar("SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.projeto_id, p.nome AS projeto_nome, "
                        "(SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS botoes "
                        "FROM aparelhos a LEFT JOIN projetos p ON p.id = a.projeto_id WHERE a.hub_id = ? ORDER BY a.nome", (h["id"],))
    h["aparelhos"] = len(ares)
    perm = _ids_aparelhos_permitidos()   # acesso limitado: ares de outros projetos viram só uma contagem
    h["ares"] = [dict(a) for a in ares if perm is None or a["id"] in perm]
    h["outros_projetos"] = len(ares) - len(h["ares"])
    from .. import zonas
    zs = [z for z in zonas.listar() if z["hub_id"] == h["id"]]
    vis = (lambda ids: ids) if perm is None else (lambda ids: [i for i in ids if i in perm])
    h["zonas"] = [{**{k: z[k] for k in ("id", "nome", "alexa_aparelho_id", "origem")}, "aparelhos": vis(z["aparelhos"])} for z in zs]
    h["juntos"] = [vis(z["aparelhos"]) for z in zs]
    h["testado"] = h["id"] in (db.cfg(zonas.TESTADOS) or [])
    h["limite_recomendado"] = LIMITE_ARES_POR_TRANSMISSOR
    return h


@api.get("/hubs")
def listar_hubs(projeto_id: int | None = None):
    w, p = _filtro_hubs(projeto_id, "h")
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
    if d.projeto_id:   # com acesso limitado, não dá para mover o transmissor para um projeto que não é seu
        _exigir_projeto(d.projeto_id)
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
    from .. import acesso
    # a conta do Smart Life só aparece para quem cuida das integrações
    conta = db.cfg("tuya_conta") if acesso.pode("integracoes.gerenciar") else ({"usuario": ""} if db.cfg("tuya_conta") else None)
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


# ---------------- Supabase: painel no estilo do dashboard (só leitura) ----------------
def _sp(fn, *a, **k):
    try:
        return fn(*a, **k)
    except ValueError as e:
        raise HTTPException(400, str(e))


@api.get("/supabase/visao")
def supabase_visao():
    return supabase_painel.visao()


@api.get("/supabase/tabelas")
def supabase_tabelas():
    return supabase_painel.tabelas()


@api.get("/supabase/tabelas/{nome}/estrutura")
def supabase_estrutura(nome: str):
    return _sp(supabase_painel.estrutura, nome)


@api.get("/supabase/tabelas/{nome}/linhas")
def supabase_linhas(nome: str, pagina: int = 1, por_pagina: int = 50, ordem: str = "", direcao: str = "desc", busca: str = ""):
    return _sp(supabase_painel.linhas_tabela, nome, pagina, por_pagina, ordem, direcao, busca)


class SqlIn(BaseModel):
    sql: str = Field(..., max_length=20000)
    limite: int = Field(500, ge=1, le=1000)


@api.post("/supabase/sql")
def supabase_sql(d: SqlIn, request: Request):
    u = getattr(request.state, "u", {}) or {}
    if u.get("papel") != "dono":
        raise HTTPException(403, "Só o dono do sistema pode usar o editor SQL.")
    try:
        r = supabase_painel.rodar_sql(d.sql, d.limite)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001 - erro do Postgres volta legível
        msg = str(e).split("\n")[0]
        if "read-only" in msg:
            msg = "O editor é só de leitura: essa consulta tentou alterar dados."
        elif "statement timeout" in msg:
            msg = "A consulta passou de 8 segundos e foi cancelada."
        raise HTTPException(400, f"Erro do Postgres: {msg[:400]}")
    db.registrar("painel", "Consulta SQL (somente leitura)", detalhe=f"{u.get('email', '')}: {d.sql.strip()[:180]}")
    return r


@api.get("/supabase/auth")
def supabase_auth():
    return supabase_painel.usuarios_auth()


@api.get("/supabase/registros")
def supabase_registros(status: str = "", limite: int = 150):
    return supabase_painel.registros(status, limite)


@api.get("/supabase/desempenho")
def supabase_desempenho():
    return supabase_painel.desempenho()


@api.get("/supabase/avisos")
def supabase_avisos():
    return supabase_painel.avisos()


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
    from .. import acesso
    if acesso.projetos_permitidos() is not None:
        al = db.um("SELECT a.projeto_id FROM alertas l LEFT JOIN aparelhos a ON a.id = l.aparelho_id WHERE l.id = ?", (aid,))
        if not al:
            raise HTTPException(404, "Alerta não encontrado.")
        acesso.checar_projeto(al["projeto_id"])
    db.executar("UPDATE alertas SET resolvido = true WHERE id = ?", (aid,))
    return {"ok": True}


# ---------------- projetos ----------------
TIPOS_PROJETO = {"escritorio", "casa", "loja", "consultorio", "sala", "outro"}


class ProjetoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    descricao: str = Field("", max_length=200)
    endereco: str = Field("", max_length=120)
    cor: str = Field("#0f766a", pattern=r"^#[0-9a-fA-F]{6}$")
    tipo: str = Field("escritorio", pattern=r"^(escritorio|casa|loja|consultorio|sala|outro)$")
    responsavel: str = Field("", max_length=80)
    meta_custo_mes: float = Field(0, ge=0, le=1000000)


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
    novo = db.executar("INSERT INTO projetos (nome, descricao, endereco, cor, tipo, responsavel, meta_custo_mes, criado_em) VALUES (?,?,?,?,?,?,?,?)",
                       (d.nome.strip(), d.descricao.strip(), d.endereco.strip(), d.cor, d.tipo, d.responsavel.strip(), d.meta_custo_mes, db.agora()))
    _dar_acesso_projeto(novo)
    db.registrar("painel", f"Projeto criado: {d.nome}")
    return {"id": novo}


@api.put("/projetos/{pid}")
def editar_projeto(pid: int, d: ProjetoIn):
    db.executar("UPDATE projetos SET nome=?, descricao=?, endereco=?, cor=?, tipo=?, responsavel=?, meta_custo_mes=? WHERE id=?",
                (d.nome.strip(), d.descricao.strip(), d.endereco.strip(), d.cor, d.tipo, d.responsavel.strip(), d.meta_custo_mes, pid))
    db.registrar("painel", f"Projeto editado: {d.nome}")
    return {"ok": True}


@api.get("/projetos/visao")
def visao_projetos():
    """Tudo o que a tela de Projetos mostra de cada lugar: aparelhos ao vivo, transmissores, rotinas, pessoas,
    salas no mapa, atividade de 14 dias e custo do mês com projeção contra a meta."""
    import datetime as _dt
    from .. import acesso, relatorio
    f, pp = acesso.filtro_sql("p.id")
    projetos = db.consultar(f"SELECT * FROM projetos p WHERE true{f} ORDER BY p.nome", pp)
    if not projetos:
        return []
    ids = [p["id"] for p in projetos]
    marcas = ",".join("?" * len(ids))
    aparelhos = db.consultar(f"SELECT a.id, a.nome, a.comodo, a.ligado, a.modo, a.temperatura, a.projeto_id, a.ligado_desde, a.hub_id, "
                             f"coalesce(h.online, 0) AS hub_online FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id "
                             f"WHERE a.projeto_id IN ({marcas}) ORDER BY a.nome", ids)
    hubs = db.consultar(f"SELECT id, nome, online, projeto_id, problema FROM hubs WHERE projeto_id IN ({marcas})", ids)
    cenas = db.consultar(f"SELECT projeto_id, count(*) n FROM cenas WHERE projeto_id IN ({marcas}) GROUP BY 1", ids)
    agenda = db.consultar(f"SELECT a.projeto_id, count(*) n, sum(g.ativo) ativos FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id "
                          f"WHERE a.projeto_id IN ({marcas}) GROUP BY 1", ids)
    automacoes = db.consultar("SELECT id, ativo, gatilho::text AS g, acoes::text AS ac FROM automacoes")
    usuarios = db.consultar("SELECT papel, projetos FROM usuarios WHERE ativo IS NULL OR ativo::text NOT IN ('false', '0')")
    agora = db.agora()
    inicio_dia = int(_dt.datetime.now(relatorio.FUSO).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
    atividade = db.consultar(f"""SELECT a.projeto_id, floor((t.quando - ?) / 86400)::int AS d, count(*) n, count(*) FILTER (WHERE t.ok = 0) falhas,
        max(t.quando) ultimo FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id
        WHERE a.projeto_id IN ({marcas}) AND t.quando > ? GROUP BY 1, 2""", (inicio_dia - 13 * 86400, *ids, inicio_dia - 13 * 86400))
    mapa = db.cfg("mapa") or {}
    salas = {str(k) for k in (mapa.get("salas") or {})} if isinstance(mapa.get("salas"), dict) else set()
    inicio_mes = int(_dt.datetime.now(relatorio.FUSO).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp())
    dias_mes = max(1, (agora - inicio_mes) / 86400)
    try:
        custos = {x["projeto_id"]: x for x in relatorio.montar(inicio_mes, agora)["por_projeto"]}
    except Exception:  # noqa: BLE001 - sem dados não derruba a tela
        custos = {}
    saida = []
    for p in projetos:
        pid = p["id"]
        aps = [a for a in aparelhos if a["projeto_id"] == pid]
        hs = [h for h in hubs if h["projeto_id"] == pid]
        aids = {a["id"] for a in aps}
        n_auto = sum(1 for x in automacoes if any(f'"aparelho_id": {i}' in (x["g"] + x["ac"]) or f'"aparelho_id":{i}' in (x["g"] + x["ac"]) for i in aids))
        serie = [{"d": i, "comandos": 0, "falhas": 0} for i in range(14)]
        ultimo = None
        for t in atividade:
            if t["projeto_id"] == pid and 0 <= t["d"] < 14:
                serie[t["d"]]["comandos"] += t["n"]; serie[t["d"]]["falhas"] += t["falhas"]
                ultimo = max(ultimo or 0, t["ultimo"])
        custo_mes, horas_mes = custos.get(pid, {}).get("custo", 0), custos.get(pid, {}).get("horas_ligado", 0)
        projecao = round(custo_mes / dias_mes * 30, 2)
        pessoas = sum(1 for u in usuarios if u["papel"] in ("dono", "admin") or acesso._json(u["projetos"], "*") == "*" or pid in [int(x) for x in (acesso._json(u["projetos"], []) or []) if str(x).isdigit()])
        saida.append({**{k: (float(v) if k == "meta_custo_mes" else v) for k, v in p.items()},
                      "aparelhos": [{"id": a["id"], "nome": a["nome"], "comodo": a["comodo"], "ligado": bool(a["ligado"]), "modo": a["modo"],
                                     "temperatura": a["temperatura"], "ligado_desde": a["ligado_desde"], "hub_online": bool(a["hub_online"])} for a in aps],
                      "transmissores": [{"id": h["id"], "nome": h["nome"], "online": bool(h["online"]), "problema": h["problema"]} for h in hs],
                      "cenas": next((c["n"] for c in cenas if c["projeto_id"] == pid), 0),
                      "agendamentos": next((g["n"] for g in agenda if g["projeto_id"] == pid), 0),
                      "automacoes": n_auto, "pessoas": pessoas,
                      "no_mapa": str(pid) in salas,
                      "serie": serie, "comandos_14d": sum(x["comandos"] for x in serie), "falhas_14d": sum(x["falhas"] for x in serie),
                      "ultima_atividade": ultimo, "custo_mes": custo_mes, "horas_mes": horas_mes, "projecao_mes": projecao})
    return saida


@api.post("/projetos/{pid}/desligar")
def desligar_projeto(pid: int):
    """Desliga todos os ares ligados do projeto (cada envio é independente: um que falhar não para os outros)."""
    ok, falhas = 0, []
    for a in db.consultar("SELECT id, nome FROM aparelhos WHERE projeto_id = ? AND ligado = 1", (pid,)):
        try:
            clima.aplicar(a["id"], "painel", ligado=False); ok += 1
        except Exception as e:  # noqa: BLE001
            falhas.append(f"{a['nome']}: {e}")
    return {"desligados": ok, "falhas": falhas}


@api.get("/projetos/{pid}/exportar")
def exportar_projeto(pid: int):
    """Cópia do projeto em JSON (sem os sinais IR nem chaves): para documentar ou recriar o lugar."""
    p = db.um("SELECT * FROM projetos WHERE id = ?", (pid,))
    if not p:
        raise HTTPException(404, "Projeto não encontrado.")
    aps = db.consultar("SELECT id, nome, comodo, marca, potencia_w, temp_min, temp_max, modos, hub_id, alexa FROM aparelhos WHERE projeto_id = ?", (pid,))
    ids = [a["id"] for a in aps] or [-1]
    marcas = ",".join("?" * len(ids))
    return {"versao": 1, "exportado_em": db.agora(), "projeto": {k: (float(v) if k == "meta_custo_mes" else v) for k, v in p.items()},
            "aparelhos": aps, "transmissores": db.consultar("SELECT id, nome, versao, projeto_id FROM hubs WHERE projeto_id = ?", (pid,)),
            "cenas": db.consultar("SELECT nome, acoes FROM cenas WHERE projeto_id = ?", (pid,)),
            "agendamentos": db.consultar(f"SELECT aparelho_id, nome, dias, hora, acao, ativo FROM agendamentos WHERE aparelho_id IN ({marcas})", ids),
            "botoes_gravados": db.consultar(f"SELECT aparelho_id, count(*) n FROM codigos WHERE aparelho_id IN ({marcas}) GROUP BY 1", ids)}


@api.delete("/projetos/{pid}")
def apagar_projeto(pid: int):
    if db.um("SELECT COUNT(*) n FROM projetos")["n"] <= 1:
        raise HTTPException(400, "Precisa existir pelo menos um projeto.")
    p = db.um("SELECT nome FROM projetos WHERE id = ?", (pid,))
    db.executar("DELETE FROM projetos WHERE id = ?", (pid,))
    db.registrar("painel", f"Projeto removido: {(p or {}).get('nome', pid)}", detalhe="aparelhos e transmissores ficaram sem projeto")
    return {"ok": True}


# ---------------- mapa do escritório ----------------
# Planta guardada em config.mapa: tamanho, retângulo de cada sala (projeto), posição de cada ar e elementos
# (porta, janela, mesa, bancada, parede, coluna, planta, texto). Quem só vê alguns projetos só mexe nas salas deles.
MAPA_TIPOS = {"porta", "janela", "mesa", "bancada", "parede", "coluna", "planta", "texto", "armario", "sofa", "monitor", "ar_previsto", "estacao", "gaveteiro",
              "rack", "roteador", "impressora", "nobreak", "projetor", "camera", "alexa", "ventilador", "purificador",
              "bebedouro", "frigobar", "cadeira", "quadro"}


class SalaMapa(BaseModel):
    x: float = Field(ge=0, le=6000)
    y: float = Field(ge=0, le=6000)
    w: float = Field(ge=40, le=6000)
    h: float = Field(ge=40, le=6000)
    # aparência no 3D (vazio = padrão): chão, cadeiras e mesas da sala
    cor_piso: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    cor_cadeira: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    cor_mesa: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")


COR_HEX = r"^#[0-9a-fA-F]{6}$"


class ArMapa(BaseModel):
    x: float = Field(ge=0, le=6000)
    y: float = Field(ge=0, le=6000)
    rot: int = Field(0, ge=0, le=270)
    modelo: str = Field("", max_length=30)   # aparência no 3D: split, cassete, piso_teto, janela
    cor: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")


class ElementoMapa(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[\w-]+$")
    tipo: str
    x: float = Field(ge=0, le=6000)
    y: float = Field(ge=0, le=6000)
    w: float = Field(ge=4, le=6000)
    h: float = Field(ge=4, le=6000)
    rot: int = Field(0, ge=0, le=270)
    rotulo: str = Field("", max_length=40)
    cor: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    modelo: str = Field("", max_length=30)
    aberta: int = Field(50, ge=0, le=100)     # janela: persiana (0 = fechada); porta: 0 = fechada, 50+ = aberta
    ligado: bool = True                       # dispositivo do mapa: aceso ou apagado


class AparenciaPessoa(BaseModel):
    pele: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    cabelo: str = Field("curto", max_length=12)
    cor_cabelo: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    roupa: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    calca: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    sapato: str = Field("", max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    traje: str = Field("camisa", max_length=12)    # camisa, camiseta, social, blusa, saia
    corpo: str = Field("a", max_length=2)
    oculos: bool = False
    barba: bool = False
    cracha: bool = True


class PessoaMapa(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[\w-]+$")
    nome: str = Field(min_length=1, max_length=40)
    cargo: str = Field("", max_length=40)
    sexo: str = Field("", pattern=r"^(masculino|feminino|)$")   # mostrado no cartão da pessoa no 3D
    sala: str = Field("", max_length=12)
    posto: str = Field("", max_length=60)
    inicio: str = Field("08:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    fim: str = Field("18:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    dias: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5], max_length=7)
    aparencia: AparenciaPessoa = Field(default_factory=AparenciaPessoa)


class EscritaMapa(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[\w-]+$")
    x: float = Field(ge=0, le=6000)
    y: float = Field(ge=0, le=6000)
    horiz: bool
    lado: int = Field(1, ge=-1, le=1)
    altura: float = Field(1.45, ge=0.3, le=2.4)
    texto: str = Field(min_length=1, max_length=160)
    cor: str = Field("azul", pattern=r"^(azul|preto|vermelho)$")
    tamanho: int = Field(2, ge=1, le=4)
    autor: str = Field("", max_length=80)
    criado_em: int = 0


class MapaIn(BaseModel):
    largura: int = Field(1400, ge=400, le=6000)
    altura: int = Field(900, ge=300, le=6000)
    salas: dict[str, SalaMapa] = Field(default_factory=dict, max_length=200)
    ares: dict[str, ArMapa] = Field(default_factory=dict, max_length=500)
    elementos: list[ElementoMapa] = Field(default_factory=list, max_length=400)
    # ids de móveis/janelas criados sozinhos uma vez (mesa de cada sala, janela em frente à porta): apagar não os recria
    auto: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=400)
    andar: int = Field(9, ge=0, le=200)   # andar do prédio onde fica o escritório (3D)
    andares: int = Field(11, ge=1, le=200)   # total de andares do prédio (3D): o escritório fica abaixo ou no último
    pessoas: list[PessoaMapa] = Field(default_factory=list, max_length=200)
    escritas: list[EscritaMapa] = Field(default_factory=list, max_length=300)


MAPA_PADRAO = {"largura": 1400, "altura": 900, "salas": {}, "ares": {}, "elementos": []}


@api.get("/mapa")
def ver_mapa(request: Request):
    from .. import acesso
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    fp, pp = acesso.filtro_sql("p.id")
    projetos = db.consultar(f"SELECT p.id, p.nome, p.cor, p.descricao FROM projetos p WHERE true{fp} ORDER BY p.nome", pp)
    fa, pa = acesso.filtro_sql("a.projeto_id")
    fx, px = acesso.filtro_aparelhos("a.id")
    fa, pa = fa + fx, pa + px
    ares = db.consultar(f"""
        SELECT a.id, a.nome, a.comodo, a.marca, a.projeto_id, a.hub_id, a.ligado, a.modo, a.temperatura, a.ventilador,
               a.temp_min, a.temp_max, a.modos, a.potencia_w, a.ligado_desde, a.atualizado_em,
               COALESCE(h.online, 0) AS hub_online, h.nome AS hub_nome,
               (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS botoes,
               (SELECT t.executar_em FROM temporizadores t WHERE t.aparelho_id = a.id ORDER BY t.executar_em LIMIT 1) AS desliga_em
        FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id WHERE true{fa} ORDER BY a.nome""", pa)
    ids_p = {str(p["id"]) for p in projetos}
    ids_a = {str(a["id"]) for a in ares}
    tudo = acesso.projetos_permitidos() is None
    return {
        "mapa": {"largura": mapa["largura"], "altura": mapa["altura"],
                 "salas": {k: v for k, v in mapa["salas"].items() if k in ids_p},
                 "ares": {k: v for k, v in mapa["ares"].items() if k in ids_a},
                 "elementos": mapa["elementos"], "atualizado_em": mapa.get("atualizado_em"),
                 "auto": mapa.get("auto", []), "andar": mapa.get("andar", 9), "andares": mapa.get("andares", 11),
                 "pessoas": mapa.get("pessoas", []), "escritas": mapa.get("escritas", [])},
        "projetos": projetos, "ares": ares, "pode_editar": acesso.pode("projetos.gerenciar"),
        "edita_elementos": tudo, "pode_controlar": acesso.pode("aparelhos.controlar"),
        "admin": (acesso.atual.get() or {}).get("papel") in ("dono", "admin"),
    }


@api.put("/mapa")
def salvar_mapa(d: MapaIn, request: Request):
    from .. import acesso
    antigo = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    permitidos = acesso.projetos_permitidos()
    for e in d.elementos:
        if e.tipo not in MAPA_TIPOS:
            raise HTTPException(422, f"Tipo de elemento desconhecido: {e.tipo}.")
    if permitidos is None:
        novo = d.model_dump()
    else:
        # só as salas e os ares dos projetos da pessoa mudam; o resto (e os elementos) fica como estava
        meus_ares = {str(r["id"]) for r in db.consultar(
            f"SELECT id FROM aparelhos WHERE projeto_id IN ({','.join('?' * len(permitidos)) or 'NULL'})", tuple(permitidos))} if permitidos else set()
        salas = {k: v for k, v in antigo["salas"].items() if int(k) not in permitidos}
        salas.update({k: v.model_dump() for k, v in d.salas.items() if k.isdigit() and int(k) in permitidos})
        ares = {k: v for k, v in antigo["ares"].items() if k not in meus_ares}
        ares.update({k: v.model_dump() for k, v in d.ares.items() if k in meus_ares})
        novo = {"largura": antigo["largura"], "altura": antigo["altura"], "salas": salas, "ares": ares, "elementos": antigo["elementos"], "auto": antigo.get("auto", []), "andar": antigo.get("andar", 9), "andares": antigo.get("andares", 11),
                "pessoas": antigo.get("pessoas", []), "escritas": antigo.get("escritas", [])}
    novo["atualizado_em"] = db.agora()
    db.set_cfg("mapa", novo)
    db.registrar("painel", "Mapa do escritório atualizado", detalhe=f"{len(novo['salas'])} sala(s), {len(novo['ares'])} ar(es), {len(novo['elementos'])} elemento(s)")
    return ver_mapa(request)


# Ações rápidas fora da edição (não mexem no resto da planta): persiana e liga/desliga de itens do mapa,
# equipe (avatares com nome, cargo e expediente) e escritas nos vidros.
class ItemMapaIn(BaseModel):
    aberta: int | None = Field(None, ge=0, le=100)
    ligado: bool | None = None
    cor: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    modelo: str | None = Field(None, max_length=30)


def _pode_decorar():
    from .. import acesso
    if not (acesso.pode("projetos.gerenciar") and acesso.projetos_permitidos() is None):
        raise HTTPException(403, "Só quem gerencia todos os projetos muda cor e modelo dos itens do mapa.")


@api.post("/mapa/elementos/{eid}/estado")
def mexer_item_mapa(eid: str, d: ItemMapaIn, request: Request):
    from .. import acesso
    if not (acesso.pode("aparelhos.controlar") or acesso.pode("projetos.gerenciar")):
        raise HTTPException(403, "Sem permissão para mexer nos itens do mapa.")
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    el = next((e for e in mapa["elementos"] if e.get("id") == eid), None)
    if not el:
        raise HTTPException(404, "Item não encontrado no mapa.")
    if d.aberta is not None:
        if el.get("tipo") not in ("janela", "porta"):
            raise HTTPException(422, "Só janelas (persiana) e portas abrem e fecham.")
        el["aberta"] = d.aberta
    if d.ligado is not None:
        el["ligado"] = d.ligado
    if d.cor is not None or d.modelo is not None:
        _pode_decorar()
        if d.cor is not None:
            el["cor"] = d.cor
        if d.modelo is not None:
            el["modelo"] = d.modelo
    db.set_cfg("mapa", mapa)
    acao = (("porta " + ("aberta" if d.aberta >= 50 else "fechada")) if d.aberta is not None and el.get("tipo") == "porta"
            else f"persiana {d.aberta}% aberta" if d.aberta is not None else ("ligado" if d.ligado else "desligado") if d.ligado is not None
            else f"cor {d.cor or 'padrão'}" if d.cor is not None else f"modelo {d.modelo}")
    db.registrar("painel", f"Mapa: {el.get('rotulo') or el.get('tipo')} {acao}")
    return ver_mapa(request)


def _sala_do_elemento(mapa: dict, e: dict):
    """Sala de um item da planta: a menor sala que contém o centro dele (porta na divisa fica com a sala menor, a privativa)."""
    cx, cy = e["x"] + e["w"] / 2, e["y"] + e["h"] / 2
    dentro = lambda s, m: s["x"] - m < cx < s["x"] + s["w"] + m and s["y"] - m < cy < s["y"] + s["h"] + m
    cand = [(k, s) for k, s in mapa["salas"].items() if dentro(s, 12)]
    return min(cand, key=lambda ks: ks[1]["w"] * ks[1]["h"])[0] if cand else None


class AparenciaSalaIn(BaseModel):
    piso: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    cadeira: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    mesa: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    porta: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    porta_aberta: bool | None = None   # abre/fecha todas as portas da sala


@api.post("/mapa/salas/{pid}/aparencia")
def aparencia_sala_mapa(pid: int, d: AparenciaSalaIn, request: Request):
    """Cores do chão, cadeiras, mesas e porta de uma sala no 3D, e abrir/fechar a porta, sem entrar na edição da planta."""
    from .. import acesso
    acesso.checar_projeto(pid)
    so_porta = d.porta_aberta is not None and all(v is None for v in (d.piso, d.cadeira, d.mesa, d.porta))
    if not (acesso.pode("projetos.gerenciar") or (so_porta and acesso.pode("aparelhos.controlar"))):
        raise HTTPException(403, "Sem permissão para mudar a sala no mapa.")
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    s = mapa["salas"].get(str(pid))
    if not s:
        raise HTTPException(404, "Esta sala ainda não está na planta.")
    for campo, chave in (("piso", "cor_piso"), ("cadeira", "cor_cadeira"), ("mesa", "cor_mesa")):
        v = getattr(d, campo)
        if v is not None:
            s[chave] = v
    portas = [e for e in mapa["elementos"] if e.get("tipo") == "porta" and _sala_do_elemento(mapa, e) == str(pid)]
    for e in portas:
        if d.porta is not None:
            e["cor"] = d.porta
        if d.porta_aberta is not None:
            e["aberta"] = 100 if d.porta_aberta else 0
    db.set_cfg("mapa", mapa)
    nome = (db.um("SELECT nome FROM projetos WHERE id = ?", (pid,)) or {}).get("nome", pid)
    db.registrar("painel", f"Mapa: aparência da sala {nome}", detalhe=", ".join(f"{k} {v or 'padrão'}" for k, v in d.model_dump().items() if v is not None))
    return ver_mapa(request)


class AparenciaArIn(BaseModel):
    cor: str | None = Field(None, max_length=7, pattern=r"^(#[0-9a-fA-F]{6})?$")
    modelo: str | None = Field(None, pattern=r"^(split|cassete|piso_teto|janela)$")


@api.post("/mapa/ares/{aid}/aparencia")
def aparencia_ar_mapa(aid: int, d: AparenciaArIn, request: Request):
    """Cor e modelo do ar no 3D (mapa e painel), sem entrar na edição da planta."""
    from .. import acesso
    if not acesso.pode("projetos.gerenciar"):
        raise HTTPException(403, "Sem permissão para mudar a aparência dos ares.")
    a = db.consultar("SELECT projeto_id FROM aparelhos WHERE id = ?", (aid,))
    if not a:
        raise HTTPException(404, "Ar não encontrado.")
    acesso.checar_projeto(a[0]["projeto_id"])
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    pos = mapa["ares"].get(str(aid))
    if not pos:
        raise HTTPException(409, "Este ar ainda não está posicionado na planta.")
    if d.cor is not None:
        pos["cor"] = d.cor
    if d.modelo is not None:
        pos["modelo"] = d.modelo
    db.set_cfg("mapa", mapa)
    db.registrar("painel", "Aparência do ar no mapa mudada", aparelho_id=aid, detalhe=f"cor {pos.get('cor') or 'branco'} · modelo {pos.get('modelo') or 'split'}")
    return ver_mapa(request)


@api.put("/mapa/pessoas")
def salvar_pessoas_mapa(pessoas: list[PessoaMapa], request: Request):
    _so_dono_admin_mapa()
    if len(pessoas) > 200:
        raise HTTPException(422, "No máximo 200 pessoas.")
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    mapa["pessoas"] = [p.model_dump() for p in pessoas]
    db.set_cfg("mapa", mapa)
    db.registrar("painel", "Equipe do mapa atualizada", detalhe=f"{len(pessoas)} pessoa(s)")
    return ver_mapa(request)


@api.put("/mapa/escritas")
def salvar_escritas_mapa(escritas: list[EscritaMapa], request: Request):
    u = _so_dono_admin_mapa()
    if len(escritas) > 300:
        raise HTTPException(422, "No máximo 300 escritas.")
    mapa = {**MAPA_PADRAO, **(db.cfg("mapa") or {})}
    antigas = {e.get("id"): e for e in mapa.get("escritas", [])}
    lista = []
    for e in escritas:
        x = e.model_dump()
        velha = antigas.get(e.id)
        x["autor"] = (velha or {}).get("autor") or u.get("email", "")
        x["criado_em"] = (velha or {}).get("criado_em") or db.agora()
        lista.append(x)
    mapa["escritas"] = lista
    db.set_cfg("mapa", mapa)
    db.registrar("painel", "Escritas nos vidros do mapa atualizadas", detalhe=f"{len(lista)} escrita(s)")
    return ver_mapa(request)


def _so_dono_admin_mapa():
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores mudam a equipe e as escritas do mapa.")
    return u


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
    _exigir_aparelhos([a.get("aparelho_id") for a in cena["acoes"]])   # cena pode ter ar de outro projeto
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


# ---------------- código-fonte e histórico (tela /apps) ----------------
# backend/app/repositorio.json é gerado a cada publicação por scripts/gerar-repositorio.mjs (commits, arquivos,
# releases, README) e os pacotes ficam no Storage privado (bucket codigo-fonte). Só dono e admin veem e baixam.
def _so_dono_admin():
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores veem o código-fonte.")
    return u


@api.get("/apps/repositorio")
def apps_repositorio():
    _so_dono_admin()
    from pathlib import Path
    arq = Path(__file__).resolve().parent.parent / "repositorio.json"
    if not arq.exists():
        raise HTTPException(404, "O histórico do código ainda não foi gerado. Publique de novo com ./publicar-vercel.sh.")
    return json.loads(arq.read_text(encoding="utf-8"))


@api.get("/apps/codigo/{arquivo}")
def apps_codigo(arquivo: str):
    u = _so_dono_admin()
    if not re.fullmatch(r"clima-casa-[\w.\-]+\.(zip|tar\.gz)", arquivo):
        raise HTTPException(422, "Pacote inválido.")
    env = db.carregar_env()
    url, chave = env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY")
    if not url or not chave:
        raise HTTPException(503, "Download indisponível neste servidor.")
    r = httpx.post(f"{url}/storage/v1/object/sign/codigo-fonte/{arquivo}", headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
                   json={"expiresIn": 120}, timeout=15)
    if r.status_code != 200:
        raise HTTPException(404, "Pacote não encontrado. Publique de novo para gerar os pacotes.")
    assinado = r.json().get("signedURL") or r.json().get("signedUrl")
    db.registrar("painel", "Código-fonte baixado", detalhe=f"{arquivo} por {u.get('email', '')}")
    return {"url": f"{url}/storage/v1{assinado}&download={arquivo}", "expira_em": db.agora() + 120}


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


# ---------------- satélites (globo da tela Segurança) ----------------
# Elementos orbitais (TLE) públicos da CelesTrak, guardados 6 h em config.satelites_tle. O navegador calcula a
# posição de cada satélite em tempo real (SGP4) a partir deles.
_GRUPOS_SAT = [("estacoes", "stations", 40), ("visiveis", "visual", 90), ("gps", "gps-ops", 40),
               ("clima", "weather", 40), ("starlink", "starlink", 160), ("ciencia", "science", 40)]


def _ler_tle(texto: str, grupo: str, limite: int) -> list[dict]:
    linhas = [l.rstrip() for l in texto.splitlines() if l.strip()]
    out = []
    for i in range(0, len(linhas) - 2, 3):
        nome, l1, l2 = linhas[i].strip(), linhas[i + 1], linhas[i + 2]
        if l1.startswith("1 ") and l2.startswith("2 ") and len(l1) >= 68 and len(l2) >= 68:
            out.append({"nome": nome[:40], "grupo": grupo, "l1": l1[:69], "l2": l2[:69]})
        if len(out) >= limite:
            break
    return out


@api.get("/satelites")
def satelites():
    cache = db.cfg("satelites_tle") or {}
    if cache.get("lista") and db.agora() - int(cache.get("em", 0)) < 6 * 3600:
        return {"atualizado_em": cache["em"], "fonte": "CelesTrak", "satelites": cache["lista"]}
    lista, vistos = [], set()
    try:
        with httpx.Client(timeout=12, headers={"User-Agent": "clima-escritorio/1.0"}) as cli:
            for grupo, nome_ct, limite in _GRUPOS_SAT:
                try:
                    r = cli.get("https://celestrak.org/NORAD/elements/gp.php", params={"GROUP": nome_ct, "FORMAT": "tle"})
                    if r.status_code != 200:
                        continue
                    for s in _ler_tle(r.text, grupo, limite):
                        num = s["l1"][2:7]
                        if num not in vistos:
                            vistos.add(num); lista.append(s)
                except httpx.HTTPError:
                    continue
    except Exception:  # noqa: BLE001
        lista = []
    if lista:
        db.set_cfg("satelites_tle", {"em": db.agora(), "lista": lista})
        return {"atualizado_em": db.agora(), "fonte": "CelesTrak", "satelites": lista}
    if cache.get("lista"):
        return {"atualizado_em": cache["em"], "fonte": "CelesTrak (cache)", "satelites": cache["lista"]}
    raise HTTPException(503, "Não consegui buscar os satélites agora. Tente de novo em alguns minutos.")


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
def relatorio_exportar(request: Request, formato: str = "pdf", dias: int = 30, inicio: str | None = None, fim: str | None = None,
                       projeto_id: int | None = None, aparelho_id: int | None = None, modelo: str = "pmf"):
    from fastapi.responses import Response
    from .. import relatorio
    if formato not in relatorio.FORMATOS:
        raise HTTPException(400, f"Formato inválido. Use: {', '.join(relatorio.FORMATOS)}.")
    if modelo not in ("pmf", "moderno"):
        raise HTTPException(400, "Modelo inválido. Use pmf (Prefeitura) ou moderno.")
    a, b = _intervalo(dias, inicio, fim)
    dados = relatorio.montar(a, b, projeto_id, aparelho_id)
    u = getattr(request.state, "u", None) or {}
    dados["gerado_por"] = " · ".join(x for x in (u.get("nome"), u.get("cargo")) if x) or u.get("email") or ""
    corpo, tipo, ext = relatorio.exportar(formato, dados, modelo)
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
        if not db.um("SELECT 1 FROM codigos WHERE aparelho_id = ? LIMIT 1", (aid,)):
            # sem botões, a Alexa responderia "ok" e o ar não receberia nada (e gastaria um dispositivo do plano)
            raise ValueError("Grave os botões deste ar antes de pôr na Alexa (Aparelho → Botões, ou Controle Gree).")
        dev = sinric.criar_dispositivo(a)
    except Exception as e:  # noqa: BLE001
        _erro(e if isinstance(e, (KeyError, ValueError)) else RuntimeError(str(e)))
    db.executar("UPDATE aparelhos SET sinric_device_id = ? WHERE id = ?", (dev, aid))
    db.registrar("painel", "Criado no Sinric Pro (Alexa/Google)", aparelho_id=aid, detalhe=dev)
    return {"sinric_device_id": dev}


@api.get("/sinric/ultimo-comando")
def sinric_ultimo_comando():
    """Último comando de voz que chegou (Alexa/Google pelo Sinric ou skill própria): o assistente de troca de conta usa
    para confirmar ao vivo que a Alexa nova está mandando comandos."""
    u = db.um("SELECT t.quando, t.acao, t.ok, t.detalhe, a.nome AS aparelho FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id "
              "WHERE t.origem IN ('alexa', 'sinric') ORDER BY t.quando DESC LIMIT 1")
    return {"comando": u, "agora": db.agora()}


@api.get("/sinric/diagnostico")
def sinric_diagnostico():
    """Confere, ao vivo, se os aparelhos vão funcionar numa Alexa nova (ou trocada): credencial, agente conectado ao
    Sinric, aparelhos existentes no Sinric, limite do plano, nomes que a Alexa entende e botões IR gravados."""
    from .. import sinric
    c = sinric.config()
    # aparelhos que a conta do Sinric comporta: 3 no grátis; depois de comprar, ajuste config.sinric.limite_aparelhos
    limite = int(c.get("limite_aparelhos") or 3)
    st = db.cfg("sinric_status") or {}
    ap = db.consultar("""SELECT a.id, a.nome, a.sinric_device_id, a.alexa,
                         (SELECT COUNT(*) FROM codigos k WHERE k.aparelho_id = a.id) AS botoes FROM aparelhos a ORDER BY a.nome""")
    itens = []

    def item(chave, titulo, estado, detalhe, acao=None):
        itens.append({"chave": chave, "titulo": titulo, "estado": estado, "detalhe": detalhe, "acao": acao})

    tem_cred = bool(c.get("api_key") and c.get("app_key") and c.get("app_secret"))
    item("credencial", "Credenciais do Sinric Pro", "ok" if tem_cred else "erro",
         "API Key, App Key e App Secret salvas." if tem_cred else "Falta alguma credencial: preencha no cartão Sinric Pro.")
    item("ativo", "Integração ligada", "ok" if c.get("ativo") else "erro",
         "Ligada." if c.get("ativo") else "Desligada: a Alexa vai achar os aparelhos, mas os comandos não chegam.")
    visto = int(db.cfg("agente_visto_em") or 0)
    agente_on = db.agora() - visto < 90
    item("agente", "Agente ligado", "ok" if agente_on else "erro",
         "Respondendo." if agente_on else "Sem sinal do agente: os comandos da Alexa passam por ele, ligue o computador do escritório.")
    item("websocket", "Agente conectado ao Sinric", "ok" if st.get("conectado") else "erro",
         "Conectado desde " + time.strftime("%d/%m %H:%M", time.gmtime((st.get("desde") or 0) - 3 * 3600)) + "." if st.get("conectado")
         else f"Não conectado{': ' + st['erro'] if st.get('erro') else ''}.")
    remotos = []
    if tem_cred:
        try:
            remotos = sinric.listar_dispositivos()
        except Exception as e:  # noqa: BLE001
            item("portal", "Acesso ao portal do Sinric", "erro", f"Não consegui listar os dispositivos: {e}")
    ids_remotos = {d["id"] for d in remotos}
    vinc = [a for a in ap if a["sinric_device_id"]]
    sumidos = [a["nome"] for a in vinc if remotos and a["sinric_device_id"] not in ids_remotos]
    item("vinculos", "Aparelhos no Sinric", "ok" if vinc and not sumidos else ("aviso" if vinc else "erro"),
         (f"{len(vinc)} de {len(ap)} aparelho(s) vinculado(s)." + (f" Não existem mais no Sinric: {', '.join(sumidos)}." if sumidos else ""))
         if vinc else "Nenhum aparelho vinculado: a Alexa não vai encontrar nada.")
    if remotos:
        item("plano", f"Limite do plano do Sinric ({limite})", "ok" if len(remotos) <= limite else "aviso",
             f"{len(remotos)} de {limite} dispositivo(s) no Sinric." + (f" Acima de {limite}: comprar mais aparelhos no portal e ajustar o limite." if len(remotos) > limite else ""))
    nomes = [a["nome"].strip().lower() for a in vinc]
    repetidos = sorted({n for n in nomes if nomes.count(n) > 1})
    curtos = [a["nome"] for a in vinc if len(a["nome"].strip()) < 3]
    item("nomes", "Nomes que a Alexa entende", "ok" if not repetidos and not curtos else "aviso",
         "Nomes únicos." if not repetidos and not curtos else f"Ajuste: {', '.join(repetidos + curtos)} (nomes repetidos ou curtos confundem a Alexa).")
    sem_ir = [a["nome"] for a in vinc if not a["botoes"]]
    item("ir", "Botões do controle gravados", "ok" if vinc and not sem_ir else "aviso",
         "Todos têm sinais IR gravados." if not sem_ir else f"Sem botões gravados: {', '.join(sem_ir)}. A Alexa responde \"ok\", mas o ar não recebe nada.")
    ult = db.um("SELECT quando, origem, acao, ok FROM atividade WHERE origem IN ('alexa', 'sinric') ORDER BY quando DESC LIMIT 1")
    item("ultimo", "Último comando de voz recebido", "ok" if ult and ult["ok"] else "aviso",
         (time.strftime("%d/%m %H:%M", time.gmtime(ult["quando"] - 3 * 3600)) + f" · {ult['acao']} ({'ok' if ult['ok'] else 'falhou'})") if ult
         else "Nenhum ainda. Depois de conectar a nova Alexa, fale um comando e clique em Verificar de novo.")
    # zonas: ares iguais no mesmo transmissor mudam juntos; na Alexa cada zona deve ser UM aparelho
    from .. import zonas as _z
    zs = _z.listar()
    for z in zs:
        na_alexa = [a["nome"] for a in z["ares"] if a.get("sinric_device_id")]
        item(f"zona-{z['id']}", f"Zona {z['nome']} na Alexa", "ok" if len(na_alexa) == 1 else "aviso",
             f"Na Alexa como 1 aparelho ({na_alexa[0]}): falar com ele muda os {len(z['aparelhos'])} ares." if len(na_alexa) == 1 else
             (f"{len(na_alexa)} ares desta zona estão na Alexa ({', '.join(na_alexa)}): qualquer um muda todos e gasta o limite. Use 'Organizar na Alexa'."
              if na_alexa else "Esta zona ainda não está na Alexa. Use 'Organizar na Alexa'."))
    em_zona = {i for z in zs for i in z["aparelhos"]}
    soltos = [a for a in ap if a["id"] not in em_zona and a["botoes"]]
    precisa = len(zs) + len(soltos)
    item("capacidade", f"Cabe no plano do Sinric ({limite} aparelhos)?", "ok" if precisa <= limite else "aviso",
         f"Precisa de {precisa} aparelho(s) no Sinric: {len(zs)} zona(s) + {len(soltos)} ar(es) independente(s) com botões."
         + ("" if precisa <= limite else f" Acima de {limite}: comprar mais aparelhos no Sinric ou juntar ares em zonas."))
    lider = (db.cfg("agente_lider") or {}).get("id")
    maq = db.cfg(f"agente_maquina:{lider}") if lider else None
    if maq and maq.get("total_transmissores"):
        ve, tot = maq.get("ve_transmissores", 0), maq["total_transmissores"]
        item("rede", "Agente enxerga os transmissores", "ok" if ve == tot else ("aviso" if ve else "erro"),
             f"O computador no comando ({maq.get('nome', lider)}) enxerga {ve} de {tot}." + ("" if ve == tot else " A Alexa responde 'ok', mas o sinal não sai: ligue o PC do escritório."))
    bloqueia = [i for i in itens if i["estado"] == "erro"]
    veredito = "funciona" if not bloqueia and not [i for i in itens if i["estado"] == "aviso" and i["chave"] in ("ir", "vinculos")] else ("parcial" if not bloqueia else "nao_funciona")
    return {"veredito": veredito, "itens": itens, "remotos": len(remotos), "verificado_em": db.agora()}


class ZonaAlexaIn(BaseModel):
    nome: str = Field(min_length=3, max_length=60)
    executar: bool = False


@api.post("/sinric/zona/{zid}")
def sinric_zona(zid: str, d: ZonaAlexaIn):
    """Prévia (executar=false) ou execução: a zona vira UM aparelho na Alexa com o nome falado escolhido."""
    from .. import sinric, zonas
    z = next((x for x in zonas.listar() if x["id"] == zid), None)
    if not z:
        raise HTTPException(404, "Zona não encontrada.")
    try:
        r = sinric.organizar_zona(z, d.nome.strip(), d.executar)
    except Exception as e:  # noqa: BLE001
        _erro(e)
    if d.executar:   # guarda quem representa a zona (zona automática vira salva)
        salvas = [x for x in (db.cfg(zonas.CHAVE) or []) if x.get("id") != zid]
        zonas.salvar(salvas + [{**{k: z[k] for k in ("id", "nome", "hub_id", "aparelhos")}, "id": zid if not zid.startswith("auto-") else "",
                                "alexa_aparelho_id": r["representante"], "origem": z.get("origem") if z.get("origem") != "auto" else "manual"}])
    return r


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
    """Ares que o usuário vê e comanda: os dos projetos dele e, se ele cuida só de alguns ares, só esses (None = todos)."""
    from .. import acesso
    so_estes = acesso.aparelhos_permitidos()
    if acesso.projetos_permitidos() is None and so_estes is None:
        return None
    f, pp = acesso.filtro_sql("projeto_id")
    fa, pa = acesso.filtro_aparelhos("id")
    return {a["id"] for a in db.consultar(f"SELECT id FROM aparelhos WHERE true{f}{fa}", pp + pa)}


def _aparelhos_da_automacao(a) -> set:
    ids = set()
    for parte in (a.get("gatilho") or {}, *(a.get("acoes") or [])):
        if isinstance(parte, dict) and parte.get("aparelho_id"):
            ids.add(int(parte["aparelho_id"]))
    return ids


def _exigir_automacao(a: dict):
    """Quem vê só alguns projetos não pode criar automação que atinja ar de outro projeto: gatilho de ar sem ar escolhido
    vale para TODOS os ares (o alvo é quem disparou), e a cena pode ser de outro projeto."""
    perm = _ids_aparelhos_permitidos()
    if perm is None:
        return
    ids = set(_aparelhos_da_automacao(a))
    g = a.get("gatilho") or {}
    if g.get("tipo") in ("ligou", "desligou", "ligado_ha") and not g.get("aparelho_id"):
        raise HTTPException(403, "Com acesso a alguns projetos, escolha o ar do gatilho (sem ar escolhido, a automação vale para todos os ares).")
    for acao in a.get("acoes") or []:
        if isinstance(acao, dict) and acao.get("tipo") == "cena" and acao.get("cena_id"):
            c = db.um("SELECT projeto_id, acoes FROM cenas WHERE id = ?", (int(acao["cena_id"]),))
            if not c:
                raise HTTPException(404, "Cena da ação não encontrada.")
            _exigir_projeto(c["projeto_id"])
            ids |= {int(x["aparelho_id"]) for x in (c["acoes"] or []) if x.get("aparelho_id")}
    if not ids <= perm:
        raise HTTPException(403, "Você não tem acesso a um dos aparelhos desta automação.")


def _automacao_permitida(aid: int) -> dict:
    auto = db.um("SELECT * FROM automacoes WHERE id = ?", (aid,))
    if not auto:
        raise HTTPException(404, "Automação não encontrada.")
    if _ids_aparelhos_permitidos() is not None:
        try:
            _exigir_automacao(auto)
        except HTTPException:
            raise HTTPException(403, "Você não tem acesso a essa automação.") from None
    return auto


def listar_automacoes():
    lista = db.consultar("SELECT * FROM automacoes ORDER BY nome")
    permitidos = _ids_aparelhos_permitidos()
    if permitidos is None:
        return lista
    return [a for a in lista if _aparelhos_da_automacao(a) and _aparelhos_da_automacao(a) <= permitidos]


api.get("/automacoes")(listar_automacoes)


@api.post("/automacoes")
def criar_automacao(d: AutomacaoIn):
    _exigir_automacao(d.model_dump())
    g, c, a = _validar_auto(d)
    novo = db.executar("INSERT INTO automacoes (nome, ativo, gatilho, condicoes, acoes, criado_em) "
                       "VALUES (?, ?, CAST(? AS jsonb), CAST(? AS jsonb), CAST(? AS jsonb), ?)",
                       (d.nome.strip(), int(d.ativo), g, c, a, db.agora()))
    db.registrar("painel", f"Automação criada: {d.nome}")
    return {"id": novo}


@api.put("/automacoes/{aid}")
def editar_automacao(aid: int, d: AutomacaoIn):
    _exigir_automacao(d.model_dump())
    _automacao_permitida(aid)
    g, c, a = _validar_auto(d)
    db.executar("UPDATE automacoes SET nome=?, ativo=?, gatilho=CAST(? AS jsonb), condicoes=CAST(? AS jsonb), acoes=CAST(? AS jsonb) WHERE id=?",
                (d.nome.strip(), int(d.ativo), g, c, a, aid))
    return {"ok": True}


@api.delete("/automacoes/{aid}")
def apagar_automacao(aid: int):
    _automacao_permitida(aid)
    db.executar("DELETE FROM automacoes WHERE id = ?", (aid,))
    return {"ok": True}


@api.post("/automacoes/{aid}/executar")
def executar_automacao(aid: int):
    from .. import automacao
    auto = _automacao_permitida(aid)
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
    fa, pa = _escopo("a.projeto_id")
    aparelhos = db.consultar("SELECT a.*, pr.nome AS projeto_nome FROM aparelhos a LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                             f"WHERE a.alexa = 1{fa} ORDER BY a.nome", pa)
    fc, pc = _escopo("projeto_id")
    cenas = db.consultar(f"SELECT id, nome FROM cenas WHERE true{fc} ORDER BY nome", pc)
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
def _visibilidade_notificacoes():
    """None = vê todas; senão, função que diz se a pessoa pode ver (e mexer em) uma notificação.
    A tabela é uma só para todos: quem tem acesso limitado só enxerga e mexe no que é dele."""
    from .. import acesso
    if acesso.projetos_permitidos() is None and acesso.pode("configuracoes.gerenciar"):
        return None
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
    return visivel


def _notificacao_minha(nid: int) -> dict:
    n = db.um("SELECT * FROM notificacoes WHERE id = ?", (nid,))
    vis = _visibilidade_notificacoes()
    if not n or (vis is not None and not vis(n)):
        raise HTTPException(404, "Notificação não encontrada.")
    return n


def _ids_notificacoes_visiveis(extra_sql: str = "") -> list[int] | None:
    vis = _visibilidade_notificacoes()
    if vis is None:
        return None
    return [n["id"] for n in db.consultar(f"SELECT id, tipo, chave, link FROM notificacoes WHERE true{extra_sql}") if vis(n)]


@api.get("/notificacoes")
def listar_notificacoes(filtro: str = "todas"):
    from .. import notificacoes
    from .. import acesso
    r = notificacoes.listar(filtro)
    visivel = _visibilidade_notificacoes()
    if visivel is not None:
        # só avisos dos aparelhos que o usuário vê; segurança e sistema só para quem gerencia isso
        r["itens"] = [n for n in r["itens"] if visivel(n)]
        nao_lidas = sum(1 for n in r["itens"] if not n["lida"])
        r["contagem"] = {**r["contagem"], "todas": len(r["itens"]), "nao_lidas": nao_lidas,
                         "importantes": sum(1 for n in r["itens"] if n["gravidade"] == "alta" and not n["resolvida"]),
                         "seguranca": sum(1 for n in r["itens"] if n["tipo"] == "seguranca")}
        r["total"] = nao_lidas
    fa, pa = _escopo("projeto_id")
    fx, px = acesso.filtro_aparelhos("id")
    fa, pa = fa + fx, tuple(pa) + px
    ligados = db.um(f"SELECT count(*) FILTER (WHERE ligado = 1) AS ligados, count(*) AS total FROM aparelhos WHERE true{fa}", pa)
    wh, ph = _filtro_hubs(None, "hubs")
    hubs = db.um(f"SELECT count(*) FILTER (WHERE online = 1) AS online, count(*) AS total FROM hubs{wh}", ph)
    msgs = db.um("SELECT count(*) AS n FROM site_mensagens WHERE NOT lida AND NOT arquivada") if acesso.pode("mensagens.ver") else {"n": 0}
    r["status"] = {"agente_online": transmissor.agente_online(), "ligados": ligados["ligados"], "aparelhos": ligados["total"],
                   "hubs_online": hubs["online"], "hubs": hubs["total"], "mensagens_nao_lidas": msgs["n"]}
    return r


@api.post("/notificacoes/{nid}/lida")
def marcar_notificacao(nid: int, lida: bool = True):
    _notificacao_minha(nid)
    db.executar("UPDATE notificacoes SET lida = ? WHERE id = ?", (lida, nid))
    return {"ok": True}


@api.post("/notificacoes/ler-todas")
def ler_todas_notificacoes():
    ids = _ids_notificacoes_visiveis(" AND NOT lida AND NOT arquivada")
    if ids is None:
        db.executar("UPDATE notificacoes SET lida = true WHERE NOT lida AND NOT arquivada")
    elif ids:
        db.executar(f"UPDATE notificacoes SET lida = true WHERE id IN ({','.join('?' * len(ids))})", tuple(ids))
    return {"ok": True}


@api.delete("/notificacoes/{nid}")
def arquivar_notificacao(nid: int):
    _notificacao_minha(nid)
    db.executar("UPDATE notificacoes SET arquivada = true, lida = true WHERE id = ?", (nid,))
    return {"ok": True}


@api.post("/notificacoes/limpar")
def limpar_notificacoes(somente: str = "todas"):
    """Arquiva (limpa da lista): todas, só as lidas ou só as resolvidas. Condições ainda ativas voltam se mudarem de estado."""
    filtro = {"lidas": " AND lida", "resolvidas": " AND resolvida"}.get(somente, "")
    ids = _ids_notificacoes_visiveis(f" AND NOT arquivada{filtro}")
    if ids is None:
        db.executar(f"UPDATE notificacoes SET arquivada = true, lida = true WHERE NOT arquivada{filtro}")
    elif ids:
        db.executar(f"UPDATE notificacoes SET arquivada = true, lida = true WHERE id IN ({','.join('?' * len(ids))})", tuple(ids))
    db.registrar("painel", "Notificações limpas", detalhe=somente)
    return {"ok": True}


@api.post("/notificacoes/{nid}/acao")
def acao_notificacao(nid: int):
    from .. import acesso, notificacoes
    n = _notificacao_minha(nid)
    acao = n["acao"] if isinstance(n["acao"], dict) else json.loads(n["acao"] or "null")
    # a ação vale o mesmo que a tela própria dela: desbloquear IP é do firewall, reparar é dos transmissores
    perm = {"desbloquear_ip": "seguranca.gerenciar", "resolver_alerta": "aparelhos.controlar",
            "reparar_hub": "transmissores.gerenciar"}.get((acao or {}).get("tipo"))
    if perm and not acesso.pode(perm):
        raise HTTPException(403, f"Seu usuário não tem permissão para isto ({acesso.PERMISSOES[perm][1].lower()}).")
    if (acao or {}).get("tipo") == "resolver_alerta" and acesso.projetos_permitidos() is not None:
        resolver_alerta(int(acao["alerta_id"]))
    try:
        return {"mensagem": notificacoes.executar_acao(nid)}
    except ValueError as e:
        raise HTTPException(400, str(e))


class PrefNotificacoesIn(BaseModel):
    tipos_ocultos: list[str] = Field([], max_length=12)
    som: bool = False
    contador_so_importantes: bool = False
    arquivar_resolvidas_h: int = Field(24, ge=0, le=720)
    som_tom: str = Field("mensagem", pattern="^(mensagem|gota|sino|digital|suave)$")
    som_alerta: str = Field("alerta", pattern="^(alerta|mensagem|gota|sino|digital|suave)$")
    som_volume: int = Field(70, ge=0, le=100)
    som_so_importantes: bool = False
    desktop: bool = False
    vibrar: bool = True
    nao_perturbe: bool = False
    nao_perturbe_inicio: str = Field("22:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    nao_perturbe_fim: str = Field("07:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


@api.get("/notificacoes/historico")
def historico_notificacoes(limite: int = 200):
    vis = _visibilidade_notificacoes()
    itens = db.consultar("SELECT * FROM notificacoes ORDER BY atualizado_em DESC LIMIT ?", (min(limite, 500) if vis is None else 2000,))
    return itens if vis is None else [n for n in itens if vis(n)][:min(limite, 500)]


@api.put("/notificacoes/preferencias")
def salvar_pref_notificacoes(d: PrefNotificacoesIn):
    from .. import notificacoes
    dados = d.model_dump()
    dados["tipos_ocultos"] = [t for t in dados["tipos_ocultos"] if t in notificacoes.TIPOS]
    notificacoes.salvar_preferencias(dados)   # por usuário: ninguém muda as notificações dos outros
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
    notificacoes.notificar(f"site-{mid}", "mensagem", "media", titulo, detalhe, f"/mensagens?id={mid}",
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
    from ..exportar import celula
    import csv
    import io
    from fastapi.responses import Response
    w = "true" if tipo == "todas" else "tipo = ?"
    linhas = db.consultar(f"SELECT * FROM site_mensagens WHERE {w} ORDER BY quando DESC", () if tipo == "todas" else (tipo,))
    s = io.StringIO(); c = csv.writer(s, delimiter=";")
    c.writerow(["data", "tipo", "nome", "email", "assunto", "mensagem", "lida", "respondida", "arquivada", "pais", "cidade", "notas"])
    import datetime as _dt
    for m in linhas:
        c.writerow([celula(x) for x in (_dt.datetime.fromtimestamp(m["quando"]).strftime("%d/%m/%Y %H:%M"), m["tipo"], m["nome"], m["email"], m["assunto"], m["mensagem"],
                    "sim" if m["lida"] else "não", "sim" if m["respondida"] else "não", "sim" if m["arquivada"] else "não", m["pais"], m["cidade"], m["notas"])])
    return Response("\ufeff" + s.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="mensagens-do-site-%s.csv"' % time.strftime("%Y%m%d")})


# ---------------- mensagens do site em formato de conversa (uma conversa por e-mail) ----------------
def _conversa_estado(email: str) -> dict:
    c = db.um("SELECT * FROM site_conversas WHERE email = ?", (email,))
    if c:
        c["etiquetas"] = c["etiquetas"] if isinstance(c["etiquetas"], list) else json.loads(c["etiquetas"] or "[]")
    return c or {"email": email, "fixada": False, "favorita": False, "arquivada": False, "silenciada": False, "etiquetas": []}


@api.get("/site/conversas")
def listar_conversas(filtro: str = "tudo", busca: str = ""):
    p, w = [], ""
    if busca.strip():
        w = " WHERE (m.nome ILIKE ? OR m.email ILIKE ? OR m.assunto ILIKE ? OR m.mensagem ILIKE ?)"
        p = [f"%{busca.strip()}%"] * 4
    linhas = db.consultar(f"""
        WITH ult AS (SELECT DISTINCT ON (email) email, nome, assunto, mensagem, tipo, quando, pais, cidade FROM site_mensagens m{w} ORDER BY email, quando DESC),
             cnt AS (SELECT email, count(*) AS total, count(*) FILTER (WHERE NOT lida) AS nao_lidas, bool_or(tipo = 'contato') AS contato,
                            bool_or(tipo = 'novidades') AS novidades, min(quando) AS primeira FROM site_mensagens GROUP BY email),
             resp AS (SELECT DISTINCT ON (email) email, texto, quando, tipo FROM site_respostas ORDER BY email, quando DESC)
        SELECT u.*, c.total, c.nao_lidas, c.contato, c.novidades, c.primeira,
               r.texto AS resp_texto, r.quando AS resp_quando, r.tipo AS resp_tipo,
               COALESCE(s.fixada, false) AS fixada, COALESCE(s.favorita, false) AS favorita, COALESCE(s.arquivada, false) AS arquivada,
               COALESCE(s.silenciada, false) AS silenciada, COALESCE(s.etiquetas, '[]'::jsonb) AS etiquetas
        FROM ult u JOIN cnt c USING (email) LEFT JOIN resp r USING (email) LEFT JOIN site_conversas s USING (email)""", p)
    itens = []
    for c in linhas:
        c["etiquetas"] = c["etiquetas"] if isinstance(c["etiquetas"], list) else json.loads(c["etiquetas"] or "[]")
        ultima_resp = c["resp_quando"] and c["resp_quando"] > c["quando"]
        c["ultimo"] = {"quando": c["resp_quando"] if ultima_resp else c["quando"], "de": ("admin" if c["resp_tipo"] == "resposta" else "nota") if ultima_resp else "contato",
                       "texto": (c["resp_texto"] if ultima_resp else (c["mensagem"] or ("Inscreveu-se nas novidades" if c["tipo"] == "novidades" else c["assunto"])))[:160]}
        c["respondida"] = bool(c["resp_quando"] and c["resp_tipo"] == "resposta")
        itens.append(c)
    contagem = {"tudo": sum(not c["arquivada"] for c in itens), "nao_lidas": sum(bool(c["nao_lidas"]) and not c["arquivada"] for c in itens),
                "favoritas": sum(c["favorita"] for c in itens), "contato": sum(c["contato"] and not c["arquivada"] for c in itens),
                "novidades": sum(c["novidades"] and not c["arquivada"] for c in itens), "respondidas": sum(c["respondida"] for c in itens),
                "sem_resposta": sum(c["contato"] and not c["respondida"] and not c["arquivada"] for c in itens), "arquivadas": sum(c["arquivada"] for c in itens)}
    filtros = {"tudo": lambda c: not c["arquivada"], "nao_lidas": lambda c: c["nao_lidas"] and not c["arquivada"], "favoritas": lambda c: c["favorita"],
               "contato": lambda c: c["contato"] and not c["arquivada"], "novidades": lambda c: c["novidades"] and not c["arquivada"],
               "respondidas": lambda c: c["respondida"], "sem_resposta": lambda c: c["contato"] and not c["respondida"] and not c["arquivada"],
               "arquivadas": lambda c: c["arquivada"]}
    f = filtros.get(filtro, filtros["tudo"])
    itens = sorted((c for c in itens if f(c)), key=lambda c: (not c["fixada"], -c["ultimo"]["quando"]))
    return {"itens": itens[:300], "contagem": contagem, "etiquetas": sorted({e for c in linhas for e in (c["etiquetas"] or [])})}


@api.get("/site/conversa")
def ver_conversa(email: str):
    msgs = db.consultar("SELECT * FROM site_mensagens WHERE email = ? ORDER BY quando", (email,))
    if not msgs:
        raise HTTPException(404, "Conversa não encontrada.")
    resp = db.consultar("SELECT * FROM site_respostas WHERE email = ? ORDER BY quando", (email,))
    linha = [{"id": f"m{m['id']}", "mid": m["id"], "de": "contato", "quando": m["quando"], "tipo": m["tipo"], "assunto": m["assunto"],
              "texto": m["mensagem"], "lida": m["lida"]} for m in msgs]
    linha += [{"id": f"r{r['id']}", "rid": r["id"], "de": "admin" if r["tipo"] == "resposta" else "nota", "quando": r["quando"], "texto": r["texto"],
               "autor": r["autor_nome"]} for r in resp]
    linha.sort(key=lambda x: x["quando"])
    ult = msgs[-1]
    contato = {"email": email, "nome": next((m["nome"] for m in reversed(msgs) if m["nome"]), ""), "pais": ult["pais"], "cidade": ult["cidade"],
               "primeira": msgs[0]["quando"], "total": len(msgs), "respostas": sum(r["tipo"] == "resposta" for r in resp),
               "notas": sum(r["tipo"] == "nota" for r in resp), "novidades": any(m["tipo"] == "novidades" for m in msgs),
               "assunto": next((m["assunto"] for m in reversed(msgs) if m["assunto"]), "")}
    return {"contato": contato, "estado": _conversa_estado(email), "linha": linha}


class ConversaIn(BaseModel):
    fixada: bool | None = None
    favorita: bool | None = None
    arquivada: bool | None = None
    silenciada: bool | None = None
    lida: bool | None = None
    etiquetas: list[str] | None = Field(None, max_length=12)


@api.put("/site/conversa")
def atualizar_conversa(email: str, d: ConversaIn):
    if not db.um("SELECT 1 FROM site_mensagens WHERE email = ? LIMIT 1", (email,)):
        raise HTTPException(404, "Conversa não encontrada.")
    est = _conversa_estado(email)
    for k in ("fixada", "favorita", "arquivada", "silenciada"):
        if getattr(d, k) is not None:
            est[k] = getattr(d, k)
    if d.etiquetas is not None:
        est["etiquetas"] = [e.strip()[:24] for e in d.etiquetas if e.strip()][:12]
    db.executar("INSERT INTO site_conversas (email, fixada, favorita, arquivada, silenciada, etiquetas, atualizado_em) VALUES (?,?,?,?,?,CAST(? AS jsonb),?) "
                "ON CONFLICT (email) DO UPDATE SET fixada = excluded.fixada, favorita = excluded.favorita, arquivada = excluded.arquivada, "
                "silenciada = excluded.silenciada, etiquetas = excluded.etiquetas, atualizado_em = excluded.atualizado_em",
                (email, est["fixada"], est["favorita"], est["arquivada"], est["silenciada"], json.dumps(est["etiquetas"]), db.agora()))
    if d.lida is not None:
        db.executar("UPDATE site_mensagens SET lida = ? WHERE email = ?", (d.lida, email))
        if d.lida:
            db.executar("UPDATE notificacoes SET lida = true WHERE chave IN (SELECT 'site-' || id FROM site_mensagens WHERE email = ?)", (email,))
    if d.arquivada is not None:
        db.executar("UPDATE site_mensagens SET arquivada = ? WHERE email = ?", (d.arquivada, email))
    return est


class RespostaIn(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)
    nota: bool = False


@api.post("/site/conversa/responder")
def responder_conversa(email: str, d: RespostaIn, request: Request):
    if not db.um("SELECT 1 FROM site_mensagens WHERE email = ? LIMIT 1", (email,)):
        raise HTTPException(404, "Conversa não encontrada.")
    u = getattr(request.state, "u", {}) or {}
    rid = db.executar("INSERT INTO site_respostas (email, quando, autor_id, autor_nome, texto, tipo) VALUES (?,?,?,?,?,?)",
                      (email, db.agora(), u.get("id"), u.get("nome") or u.get("email", ""), d.texto.strip(), "nota" if d.nota else "resposta"))
    if not d.nota:
        db.executar("UPDATE site_mensagens SET respondida = true, lida = true WHERE email = ?", (email,))
    db.registrar("painel", "Nota interna em mensagem do site" if d.nota else "Resposta a mensagem do site", detalhe=email)
    return {"id": rid}


@api.delete("/site/conversa/resposta/{rid}")
def apagar_resposta(rid: int):
    db.executar("DELETE FROM site_respostas WHERE id = ?", (rid,))
    return {"ok": True}


@api.delete("/site/conversa")
def apagar_conversa(email: str):
    ids = [r["id"] for r in db.consultar("SELECT id FROM site_mensagens WHERE email = ?", (email,))]
    db.executar("DELETE FROM site_mensagens WHERE email = ?", (email,))
    db.executar("DELETE FROM site_respostas WHERE email = ?", (email,))
    db.executar("DELETE FROM site_conversas WHERE email = ?", (email,))
    for i in ids:
        db.executar("UPDATE notificacoes SET arquivada = true WHERE chave = ?", (f"site-{i}",))
    db.registrar("painel", "Conversa do site apagada", detalhe=f"{email} ({len(ids)} mensagem(ns))")
    return {"ok": True}


RESPOSTAS_PADRAO = [
    {"titulo": "Agradecimento", "texto": "Olá! Obrigado pelo contato. Recebemos sua mensagem e respondemos em breve."},
    {"titulo": "Pedir detalhes", "texto": "Olá! Para ajudar melhor, pode contar quantos ares-condicionados são, as marcas e se o escritório tem Wi-Fi 2,4 GHz?"},
    {"titulo": "Como funciona", "texto": "O sistema usa um transmissor infravermelho Wi-Fi em cada sala e controla os ares pelo painel, pelo celular e pela Alexa. Posso mostrar uma demonstração?"},
]


@api.get("/site/respostas-prontas")
def ver_respostas_prontas():
    return db.cfg("respostas_prontas") or RESPOSTAS_PADRAO


class RespostaProntaIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=40)
    texto: str = Field(min_length=1, max_length=2000)


@api.put("/site/respostas-prontas")
def salvar_respostas_prontas(d: list[RespostaProntaIn]):
    lista = [x.model_dump() for x in d][:30]
    db.set_cfg("respostas_prontas", lista)
    return lista


# ---------------- cookies do site (aviso de consentimento LGPD + gestão no admin) ----------------
COOKIES_PADRAO = {
    "ativo": True, "versao": 1, "dias_validade": 180, "posicao": "rodape",
    "bloquear_ate_escolher": False, "botao_flutuante": True, "rejeitar_destacado": True, "google_consent_mode": False,
    "retencao_dias": 1825, "idiomas": {"en": {"titulo": "Your privacy", "texto": "We use essential cookies to keep the site working and secure. With your permission, we also use preference cookies. You choose, and you can change it anytime."},
                                       "es": {"titulo": "Tu privacidad", "texto": "Usamos cookies esenciales para que el sitio funcione y sea seguro. Con tu permiso, también usamos cookies de preferencias. Tú eliges y puedes cambiarlo cuando quieras."}},
    "historico_versoes": [],
    "titulo": "Sua privacidade",
    "texto": "Usamos cookies essenciais para o site funcionar e ficar seguro. Com a sua permissão, usamos também cookies de preferências. Você escolhe e pode mudar quando quiser.",
    "categorias": [
        {"id": "essenciais", "nome": "Essenciais", "obrigatoria": True,
         "descricao": "Necessários para o site funcionar e se proteger de robôs. Não podem ser desligados."},
        {"id": "preferencias", "nome": "Preferências", "obrigatoria": False,
         "descricao": "Lembram escolhas suas, como mostrar o botão certo para entrar no sistema."},
        {"id": "estatisticas", "nome": "Estatísticas", "obrigatoria": False,
         "descricao": "Ajudariam a entender o uso do site de forma agregada. Hoje o site não usa nenhum cookie desta categoria."},
        {"id": "marketing", "nome": "Marketing", "obrigatoria": False,
         "descricao": "Serviriam para anúncios personalizados. O site não usa nenhum cookie desta categoria."},
    ],
    "cookies": [
        {"nome": "zv", "categoria": "essenciais", "provedor": "zynio.com.br", "finalidade": "Lembrar que o acesso passou na verificação de segurança", "duracao": "12 horas"},
        {"nome": "Cookies do Turnstile", "categoria": "essenciais", "provedor": "Cloudflare", "finalidade": "Confirmar que o acesso não é de um robô", "duracao": "Durante a verificação"},
        {"nome": "zynio-cookies", "categoria": "essenciais", "provedor": "zynio.com.br", "finalidade": "Guardar as suas escolhas de cookies", "duracao": "6 meses"},
        {"nome": "clima-sessao-sistema", "categoria": "preferencias", "provedor": "zynio.com.br", "finalidade": "Mostrar o botão Entrar no sistema para quem já entrou", "duracao": "30 dias"},
    ],
}


def _cookies_cfg() -> dict:
    return {**COOKIES_PADRAO, **(db.cfg("cookies_site") or {})}


@publico.get("/site/cookies")
def cookies_publico():
    c = _cookies_cfg()
    return {k: c[k] for k in ("ativo", "versao", "dias_validade", "posicao", "titulo", "texto", "categorias", "cookies",
                              "bloquear_ate_escolher", "botao_flutuante", "rejeitar_destacado", "google_consent_mode", "idiomas")}


class ConsentimentoIn(BaseModel):
    id_anonimo: str = Field(min_length=8, max_length=64, pattern=r"^[\w-]+$")
    versao: int = Field(ge=1, le=100000)
    acao: str = Field(pattern="^(aceitar_todos|rejeitar|personalizar)$")
    escolhas: dict[str, bool] = Field(default_factory=dict, max_length=12)


@publico.post("/site/cookies/consentimento")
def registrar_consentimento(d: ConsentimentoIn, request: Request):
    import hashlib
    from .. import firewall
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("consentimento",), 60) >= 30:
        raise HTTPException(429, "Muitos registros. Tente mais tarde.")
    firewall.registrar(ip, "consentimento", "/api/site/cookies/consentimento", d.acao)
    validas = {c["id"] for c in _cookies_cfg()["categorias"]}
    escolhas = {k: bool(v) for k, v in d.escolhas.items() if k in validas}
    escolhas["essenciais"] = True
    sal = db.ENV.get("CLIMA_CHAVE_MESTRA", "")[:16]
    db.executar("INSERT INTO site_consentimentos (quando, id_anonimo, versao, acao, escolhas, pais, ip_hash, agente) VALUES (?,?,?,?,CAST(? AS jsonb),?,?,?)",
                (db.agora(), d.id_anonimo, d.versao, d.acao, json.dumps(escolhas), request.headers.get("x-vercel-ip-country", "")[:4],
                 hashlib.sha256(f"{sal}:{ip}".encode()).hexdigest()[:24], request.headers.get("user-agent", "")[:160]))
    return {"ok": True}


@api.get("/site/cookies/config")
def ver_cookies_config():
    return _cookies_cfg()


class CategoriaCookie(BaseModel):
    id: str = Field(min_length=2, max_length=30, pattern=r"^[a-z_]+$")
    nome: str = Field(min_length=1, max_length=40)
    descricao: str = Field("", max_length=400)
    obrigatoria: bool = False


class CookieItem(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    categoria: str = Field(min_length=2, max_length=30)
    provedor: str = Field("", max_length=60)
    finalidade: str = Field("", max_length=200)
    duracao: str = Field("", max_length=40)


class TextoIdioma(BaseModel):
    titulo: str = Field("", max_length=60)
    texto: str = Field("", max_length=600)


class CookiesConfigIn(BaseModel):
    ativo: bool = True
    dias_validade: int = Field(180, ge=1, le=730)
    posicao: str = Field("rodape", pattern="^(rodape|canto|centro)$")
    bloquear_ate_escolher: bool = False
    botao_flutuante: bool = True
    rejeitar_destacado: bool = True
    google_consent_mode: bool = False
    retencao_dias: int = Field(1825, ge=180, le=3650)
    idiomas: dict[str, TextoIdioma] = Field(default_factory=dict)
    resumo_mudanca: str = Field("", max_length=200)
    titulo: str = Field(min_length=1, max_length=60)
    texto: str = Field(min_length=10, max_length=600)
    categorias: list[CategoriaCookie] = Field(min_length=1, max_length=8)
    cookies: list[CookieItem] = Field(default_factory=list, max_length=60)
    nova_versao: bool = False


@api.put("/site/cookies/config")
def salvar_cookies_config(d: CookiesConfigIn):
    atual = _cookies_cfg()
    dados = d.model_dump(exclude={"nova_versao", "resumo_mudanca"})
    dados["idiomas"] = {k: v for k, v in dados["idiomas"].items() if k in ("en", "es")}
    if not any(c["id"] == "essenciais" for c in dados["categorias"]):
        raise HTTPException(400, "A categoria Essenciais precisa existir.")
    for c in dados["categorias"]:
        if c["id"] == "essenciais":
            c["obrigatoria"] = True
    ids = {c["id"] for c in dados["categorias"]}
    for k in dados["cookies"]:
        if k["categoria"] not in ids:
            raise HTTPException(400, f"O cookie {k['nome']} está numa categoria que não existe.")
    dados["versao"] = atual["versao"] + (1 if d.nova_versao else 0)
    hist = list(atual.get("historico_versoes") or [])
    if d.nova_versao:
        antes = {k["nome"] for k in atual["cookies"]}; depois = {k["nome"] for k in dados["cookies"]}
        mud = [f"+ {n}" for n in sorted(depois - antes)] + [f"- {n}" for n in sorted(antes - depois)]
        cats_a = {c["id"] for c in atual["categorias"]}; cats_d = {c["id"] for c in dados["categorias"]}
        mud += [f"+ categoria {c}" for c in sorted(cats_d - cats_a)] + [f"- categoria {c}" for c in sorted(cats_a - cats_d)]
        hist.insert(0, {"versao": dados["versao"], "quando": db.agora(), "resumo": d.resumo_mudanca.strip() or "Nova versão publicada", "mudancas": mud[:30]})
    dados["historico_versoes"] = hist[:30]
    db.set_cfg("cookies_site", dados)
    db.registrar("painel", "Cookies do site atualizados", detalhe=f"versão {dados['versao']}" + (" (novo consentimento pedido)" if d.nova_versao else ""))
    return dados


@api.get("/site/cookies/relatorio")
def relatorio_cookies(dias: int = 30):
    # retenção: registros mais velhos que o prazo configurado saem sozinhos
    db.executar("DELETE FROM site_consentimentos WHERE quando < ?", (db.agora() - int(_cookies_cfg().get("retencao_dias", 1825)) * 86400,))
    desde = db.agora() - min(dias, 365) * 86400
    linhas = db.consultar("SELECT quando, id_anonimo, versao, acao, escolhas, pais, agente FROM site_consentimentos WHERE quando > ? ORDER BY quando DESC LIMIT 20000", (desde,))
    total = len(linhas)
    acoes = {a: sum(1 for l in linhas if l["acao"] == a) for a in ("aceitar_todos", "personalizar", "rejeitar")}
    cats = {}
    for l in linhas:
        e = l["escolhas"] if isinstance(l["escolhas"], dict) else json.loads(l["escolhas"] or "{}")
        for k, v in e.items():
            c = cats.setdefault(k, [0, 0]); c[0] += bool(v); c[1] += 1
    por_dia = {}
    import datetime as _dt
    for l in linhas:
        k = _dt.datetime.fromtimestamp(l["quando"], _dt.timezone(_dt.timedelta(hours=-3))).strftime("%Y-%m-%d")
        d = por_dia.setdefault(k, {"dia": k, "aceitar_todos": 0, "personalizar": 0, "rejeitar": 0}); d[l["acao"]] += 1
    serie = []
    for n in range(min(dias, 90) - 1, -1, -1):
        k = _dt.datetime.fromtimestamp(db.agora() - n * 86400, _dt.timezone(_dt.timedelta(hours=-3))).strftime("%Y-%m-%d")
        serie.append(por_dia.get(k, {"dia": k, "aceitar_todos": 0, "personalizar": 0, "rejeitar": 0}))
    def _agrupar(chave):
        g = {}
        for l in linhas:
            k = chave(l); x = g.setdefault(k, {"nome": k, "total": 0, "aceitar_todos": 0})
            x["total"] += 1; x["aceitar_todos"] += l["acao"] == "aceitar_todos"
        return sorted(g.values(), key=lambda x: -x["total"])[:12]
    disp = lambda l: "Celular" if re.search(r"Mobile|Android|iPhone", l.get("agente") or "") else "Computador"  # noqa: E731
    extra = {"por_pais": _agrupar(lambda l: l["pais"] or "?"), "por_dispositivo": _agrupar(disp), "por_versao": _agrupar(lambda l: f"v{l['versao']}")}
    for l in linhas:
        l.pop("agente", None)
    return {**extra, "total": total, "visitantes": len({l["id_anonimo"] for l in linhas}), "acoes": acoes,
            "categorias": {k: {"aceitos": a, "total": t, "taxa": round(a / t * 100) if t else 0} for k, (a, t) in cats.items()},
            "por_dia": serie, "recentes": [{**l, "escolhas": l["escolhas"] if isinstance(l["escolhas"], dict) else json.loads(l["escolhas"] or "{}")} for l in linhas[:60]],
            "versao": _cookies_cfg()["versao"]}


@api.get("/site/cookies/consentimento/{id_anonimo}")
def consultar_consentimento(id_anonimo: str):
    """Direito de acesso do titular: tudo o que foi registrado para um identificador (ele vê o ID nas preferências do site)."""
    linhas = db.consultar("SELECT quando, versao, acao, escolhas, pais FROM site_consentimentos WHERE id_anonimo = ? ORDER BY quando DESC LIMIT 500", (id_anonimo[:64],))
    return [{**l, "escolhas": l["escolhas"] if isinstance(l["escolhas"], dict) else json.loads(l["escolhas"] or "{}")} for l in linhas]


@api.get("/site/cookies/exportar")
def exportar_consentimentos(dias: int = 365):
    import csv as _csv
    import datetime
    import io
    from fastapi.responses import Response
    linhas = db.consultar("SELECT quando, id_anonimo, versao, acao, escolhas, pais FROM site_consentimentos WHERE quando > ? ORDER BY quando DESC",
                          (db.agora() - min(dias, 3650) * 86400,))
    buf = io.StringIO(); w = _csv.writer(buf, delimiter=";")
    w.writerow(["quando", "visitante", "versao", "escolha", "categorias_liberadas", "pais"])
    for l in linhas:
        e = l["escolhas"] if isinstance(l["escolhas"], dict) else json.loads(l["escolhas"] or "{}")
        w.writerow([datetime.datetime.fromtimestamp(l["quando"]).isoformat(), l["id_anonimo"], l["versao"], l["acao"], ",".join(k for k, v in e.items() if v), l["pais"]])
    db.registrar("painel", "Registros de consentimento exportados", detalhe=f"{len(linhas)} registro(s)")
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="consentimentos-cookies.csv"'})


@api.post("/site/cookies/escanear")
def escanear_cookies():
    """Abre as páginas públicas do site e do sistema e lista os cookies que o servidor grava, comparando com a lista declarada."""
    import httpx
    declarados = {k["nome"].lower() for k in _cookies_cfg()["cookies"]}
    achados = {}
    for url in ("https://zynio.com.br/", "https://zynio.com.br/privacidade", "https://zynio.com.br/contato", "https://app.zynio.com.br/login"):
        try:
            r = httpx.get(url, follow_redirects=True, timeout=8, headers={"User-Agent": "Mozilla/5.0 (verificador de cookies do Clima Escritorio)"})
            for h in r.history + [r]:
                for c in h.headers.get_list("set-cookie"):
                    nome = c.split("=", 1)[0].strip()
                    a = achados.setdefault(nome, {"nome": nome, "paginas": [], "seguro": "secure" in c.lower(), "httponly": "httponly" in c.lower(),
                                                  "samesite": (re.search(r"samesite=(\w+)", c, re.I) or [None, ""])[1], "validade": (re.search(r"max-age=(\d+)", c, re.I) or [None, ""])[1]})
                    if url not in a["paginas"]:
                        a["paginas"].append(url)
        except Exception as e:  # noqa: BLE001
            achados.setdefault(f"erro:{url}", {"nome": url, "erro": str(e)[:120]})
    lista = []
    for a in achados.values():
        if "erro" in a:
            lista.append(a); continue
        a["declarado"] = a["nome"].lower() in declarados or any(a["nome"].lower().startswith(d.split()[0]) for d in declarados)
        lista.append(a)
    db.registrar("painel", "Varredura de cookies do site", detalhe=f"{sum(1 for a in lista if a.get('declarado') is False)} não declarado(s)")
    return {"quando": db.agora(), "cookies": lista,
            "observacao": "O navegador também guarda dados locais (localStorage), que não aparecem nesta varredura: confira a lista declarada."}


@api.delete("/site/cookies/consentimento/{id_anonimo}")
def apagar_consentimento(id_anonimo: str):
    db.executar("DELETE FROM site_consentimentos WHERE id_anonimo = ?", (id_anonimo,))
    db.registrar("painel", "Registro de consentimento apagado a pedido do titular", detalhe=id_anonimo[:12])
    return {"ok": True}


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


class ResgateConvite(BaseModel):
    id: str = Field(..., pattern=r"^[0-9a-f]{16}$")
    prova: str = Field(..., pattern=r"^[0-9a-f]{64}$")


@publico.post("/agentes/convite/resgatar")
def resgatar_convite(d: ResgateConvite, request: Request):
    """Instalador do PC: troca id + prova pelo .env CIFRADO (só o código decifra) e pelo link do código do sistema. Uso único."""
    from pathlib import Path
    from .. import convite, firewall
    ip = firewall.ip_do_pedido(request)
    r = convite.resgatar(d.id, d.prova)
    if r == "prova":
        firewall.registrar(ip, "login_falhou", "/api/agentes/convite/resgatar", "código de instalação errado")
        raise HTTPException(403, "Código de instalação errado. Confira as letras ou gere outro no painel.")
    if isinstance(r, str):
        raise HTTPException(410, "Código vencido ou já usado. Gere outro no painel (Infra → Agentes).")
    pacote = None
    try:
        rep = json.loads((Path(__file__).resolve().parent.parent / "repositorio.json").read_text(encoding="utf-8"))
        arquivo = next(p["arquivo"] for p in rep.get("pacotes", []) if p.get("atual") and p.get("formato") == "zip")
        env = db.carregar_env()
        rr = httpx.post(f"{env['SUPABASE_URL']}/storage/v1/object/sign/codigo-fonte/{arquivo}",
                        headers={"apikey": env["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}"},
                        json={"expiresIn": 300}, timeout=15)
        assinado = rr.json().get("signedURL") or rr.json().get("signedUrl")
        pacote = {"url": f"{env['SUPABASE_URL']}/storage/v1{assinado}", "arquivo": arquivo, "pasta": arquivo.rsplit(".zip", 1)[0]}
    except Exception:  # noqa: BLE001  (sem pacote: o instalador avisa para baixar em Apps → Código-fonte)
        pacote = None
    firewall.registrar(ip, "login_ok", "/api/agentes/convite/resgatar", "código de instalação usado")
    return {**r, "pacote": pacote}


# Verificação alternativa do portão (prova de trabalho): quando o Turnstile da Cloudflare emperra no navegador
# (bloqueadores, Brave, instabilidade da Cloudflare), o navegador resolve um desafio assinado por nós: achar um número
# que, junto do desafio, dá um SHA-256 com POW_BITS bits zero no começo (~1 s num computador comum). Sem estado no
# servidor: o desafio leva validade e assinatura HMAC (VERIFICACAO_SEGREDO). O login continua com Turnstile + firewall.
POW_BITS = 16


def _assinar_pow(desafio: str, bits: int, exp: int) -> str:
    import hashlib
    import hmac
    return hmac.new(db.ENV.get("VERIFICACAO_SEGREDO", "").encode(), f"pow:{desafio}:{bits}:{exp}".encode(), hashlib.sha256).hexdigest()


@publico.get("/verificacao/desafio")
def verificacao_desafio():
    import secrets
    desafio, exp = secrets.token_hex(16), db.agora() + 300
    return {"desafio": desafio, "bits": POW_BITS, "exp": exp, "assinatura": _assinar_pow(desafio, POW_BITS, exp)}


class ProvaIn(BaseModel):
    desafio: str = Field(pattern=r"^[0-9a-f]{32}$")
    bits: int = Field(ge=8, le=30)
    exp: int
    assinatura: str = Field(pattern=r"^[0-9a-f]{64}$")
    nonce: int = Field(ge=0, le=10**9)


def _prova_ok(pv: ProvaIn) -> bool:
    import hashlib
    import hmac
    if pv.bits < POW_BITS or pv.exp < db.agora() or pv.exp > db.agora() + 600:
        return False
    if not hmac.compare_digest(_assinar_pow(pv.desafio, pv.bits, pv.exp), pv.assinatura):
        return False
    h = int.from_bytes(hashlib.sha256(f"{pv.desafio}:{pv.nonce}".encode()).digest(), "big")
    return h >> (256 - pv.bits) == 0


class VerificacaoIn(BaseModel):
    turnstile: str | None = Field(None, max_length=4000)
    prova: ProvaIn | None = None


@publico.post("/verificacao")
def verificacao(d: VerificacaoIn, request: Request):
    """Tela "Executando verificação de segurança": confere o Turnstile (ou a prova de trabalho, quando o Turnstile emperra)
    e grava um passe assinado (cookie) por 12 h. O passe vale para o site e o sistema (domínio .zynio.com.br); o
    middleware da Vercel confere a assinatura."""
    import hashlib
    import hmac
    from fastapi.responses import JSONResponse
    from .. import firewall, turnstile
    ip = firewall.ip_do_pedido(request)
    if d.prova is not None:
        if not _prova_ok(d.prova):
            firewall.registrar(ip, "bot_bloqueado", "/api/verificacao", "prova de trabalho inválida ou vencida")
            raise HTTPException(400, "A verificação expirou. Recarregue a página.")
    else:
        turnstile.exigir(d.turnstile, ip, "/api/verificacao")
    segredo = db.ENV.get("VERIFICACAO_SEGREDO", "")
    if not segredo:
        return {"ok": True}
    exp = db.agora() + 12 * 3600
    passe = f"{exp}.{hmac.new(segredo.encode(), str(exp).encode(), hashlib.sha256).hexdigest()}"
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(":")[0]
    r = JSONResponse({"ok": True})
    r.set_cookie("zv", passe, max_age=12 * 3600, httponly=True, secure=True, samesite="lax", path="/",
                 domain=".zynio.com.br" if host.endswith("zynio.com.br") else None)
    return r


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
    import os
    # em produção o link só volta para os endereços oficiais, por https; localhost só no agente/desenvolvimento
    hosts = ("app.zynio.com.br", "clima-casa-lac.vercel.app") + (() if os.environ.get("VERCEL") else ("localhost", "127.0.0.1"))
    ok = host in hosts and (d.voltar_para.startswith("https://") or host in ("localhost", "127.0.0.1"))
    destino = d.voltar_para if ok else "https://app.zynio.com.br/redefinir-senha"
    from .. import correio
    try:   # e-mail próprio pelo Resend (com a marca); se não der, o Supabase manda o dele
        if correio.recuperar_senha(d.email.strip().lower(), destino, correio.contexto(request)):
            return {"ok": True}
    except Exception:  # noqa: BLE001
        pass
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
    if turnstile.no_supabase():   # o Supabase confere o token (ele só vale uma vez)
        if not d.turnstile:
            raise HTTPException(400, "Confirme que você não é um robô (verificação da Cloudflare) e tente de novo.")
    else:
        turnstile.exigir(d.turnstile, ip, "/api/auth/entrar")
    limite, janela = c["tentativas_login"], c["janela_min"]
    if firewall.falhas_recentes(ip, ("login_falhou",), janela, marca) >= limite or firewall.falhas_da_conta(marca, janela) >= limite * 3:
        raise HTTPException(429, f"Muitas tentativas para este e-mail. Tente de novo em {janela} minutos.")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/token?grant_type=password", timeout=12,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}, json={"email": d.email.strip(), "password": d.senha, **turnstile.corpo_supabase(d.turnstile)})
    dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 and turnstile.recusado_pelo_captcha(dados):
        firewall.registrar(ip, "bot_bloqueado", "/api/auth/entrar", "captcha recusado pelo Supabase")
        raise HTTPException(400, "A verificação contra robôs falhou ou expirou. Recarregue a página e tente de novo.")
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
        try:
            from .. import correio
            correio.enviar_quieto(u["email"], "acesso_novo", {**correio.contexto(request), "nome": u.get("nome"), "email": u["email"]})
        except Exception:  # noqa: BLE001
            pass
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
    rajada_10s: int = Field(60, ge=10, le=2000)
    escudo_auto: bool = True
    ddos_req_seg: int = Field(60, ge=5, le=5000)
    ddos_ips_min: int = Field(80, ge=10, le=100000)
    escudo_minutos: int = Field(30, ge=5, le=1440)
    limite_escudo_por_minuto: int = Field(40, ge=10, le=1000)
    escudo_vercel: bool = True
    bloquear_nuvem: bool = False
    sessao_inatividade_min: int = Field(240, ge=0, le=10080)
    sessao_max_horas: int = Field(168, ge=0, le=2160)
    exigir_2fa_admin: bool = False


# rotas que mudam dados e, de propósito, caem na regra padrão (configuracoes.gerenciar) + checagem própria de papel
_PADRAO_DE_PROPOSITO = ("/api/infra/", "/api/email/", "/api/agentes/")


def rotas_sem_regra() -> list[str]:
    """Rotas logadas que mudam dados sem regra explícita em acesso.REGRAS (fora as de propósito acima)."""
    from .. import acesso
    from . import alexa, contas, correio, infra, musica
    sem = []
    for rt in (api, contas.contas, musica.rotas_musica, infra.rotas_infra, correio.rotas_email, alexa.roteador):
        for r in rt.routes:
            caminho = getattr(r, "path", "")
            if not caminho.startswith("/api") or caminho.startswith(_PADRAO_DE_PROPOSITO):
                continue
            for met in getattr(r, "methods", set()) - {"GET", "HEAD"}:
                if not any((mm is None or met in mm) and pp.search(caminho) for mm, pp, _ in acesso._REGRAS):
                    sem.append(f"{met} {caminho}")
    return sorted(set(sem))


@api.get("/seguranca/checklist")
def checklist_seguranca():
    """Controles de segurança conferidos na hora (não é texto fixo): cada item diz se está ok e como corrigir."""
    from .. import firewall
    from ..seguranca import tem_totp  # noqa: F401
    c = firewall.config()
    agora = db.agora()
    sem_rls = [r["tablename"] for r in db.consultar("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity")]
    escrita_anon = db.um("SELECT count(*) n FROM pg_policies WHERE schemaname='public' AND cmd <> 'SELECT'")["n"]
    admins = db.consultar("SELECT u.id, u.email, u.papel, EXISTS(SELECT 1 FROM passkeys p WHERE p.usuario_id = u.id) AS pk, "
                          "EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified') AS totp "
                          "FROM usuarios u WHERE u.ativo AND u.papel IN ('dono','admin','subadmin')")
    sem2fa = [a["email"] for a in admins if not (a["pk"] or a["totp"])]
    backup = db.um("SELECT max(criado_em) AS t FROM backups")
    ultimo_backup = backup["t"].timestamp() if backup and backup["t"] and hasattr(backup["t"], "timestamp") else (backup or {}).get("t") or 0
    bloqueados = db.um("SELECT count(*) n FROM seguranca_ips WHERE tipo='bloqueado' AND (expira_em IS NULL OR expira_em > ?)", (agora,))["n"]
    itens = [
        ("dados", "RLS em todas as tabelas do banco", not sem_rls, f"Sem RLS: {', '.join(sem_rls)}" if sem_rls else "Nenhuma tabela pública lê ou grava sem passar pelo servidor."),
        ("dados", "Nenhuma política de escrita direta no banco", escrita_anon == 0, "Toda gravação passa pela API, com permissão por rota."),
        ("dados", "Segredos cifrados em repouso (AES-256-GCM)", bool(db.ENV.get("CLIMA_CHAVE_MESTRA")), "Chaves de Smart Life, Sinric e Alexa gravadas cifradas."),
        ("dados", "Backup automático nas últimas 36 h", bool(ultimo_backup) and agora - ultimo_backup < 36 * 3600, "Rotina diária do banco guarda as 14 últimas cópias."),
        ("acesso", "Dono com verificação em duas etapas", any(a["papel"] == "dono" and (a["pk"] or a["totp"]) for a in admins), "Google Authenticator ou biometria cadastrados."),
        ("acesso", "Todos os administradores com duas etapas", not sem2fa, f"Sem duas etapas: {', '.join(sem2fa)}" if sem2fa else "Dono, admins e subadmins protegidos."),
        ("acesso", "Duas etapas obrigatórias para administradores", bool(c.get("exigir_2fa_admin")), "Ligue em Regras do firewall: admin sem 2FA não usa o sistema."),
        ("acesso", "Toda rota que muda dados tem permissão explícita", not (sem_regra := rotas_sem_regra()),
         f"Sem regra (só o dono/admin consegue usar): {', '.join(sem_regra[:6])}" if sem_regra else "Cada ação confere a permissão certa do usuário (acesso.REGRAS)."),
        ("acesso", "Sessões expiram por inatividade", bool(c.get("sessao_inatividade_min")), f"Sem uso por {c.get('sessao_inatividade_min')} min pede login de novo."),
        ("acesso", "Duração máxima de cada login", bool(c.get("sessao_max_horas")), f"Login vale no máximo {c.get('sessao_max_horas')} h."),
        ("acesso", "Senhas fortes (10+ caracteres, 4 tipos) e conferência de vazamento", True, "Regra no Supabase Auth e checagem no Have I Been Pwned ao trocar a senha."),
        ("borda", "Verificação anti-robô (Cloudflare Turnstile)", bool(db.ENV.get("TURNSTILE_SECRET_KEY")), "Login, esqueci a senha, formulários e tela de verificação."),
        ("borda", "Firewall ativo", bool(c.get("ativo")), "Listas de IP, países, assinaturas de ataque e limites."),
        ("borda", "Escudo anti-DDoS automático", bool(c.get("escudo_auto")), f"Liga com {c.get('ddos_req_seg')} req/s ou {c.get('ddos_ips_min')} IPs/min."),
        ("borda", "Modo de ataque da Vercel junto com o escudo", bool(c.get("escudo_vercel")), "Ligado pelo agente do escritório."),
        ("borda", "Detecção de ferramentas de ataque", bool(c.get("detectar_scanners")), f"{bloqueados} IP(s) bloqueado(s) agora."),
        ("borda", "HTTPS obrigatório (HSTS preload) e cabeçalhos de segurança", True, "CSP restrita, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy."),
        ("borda", "CORS só para o site oficial", True, "Rotas públicas aceitam só zynio.com.br; o resto, só a mesma origem."),
        ("privacidade", "Aviso de cookies e prova do consentimento (LGPD)", bool(_cookies_cfg().get("ativo")), "Categorias, registro sem IP em claro e revogação a qualquer momento."),
    ]
    lista = [{"grupo": g, "item": i, "ok": bool(ok), "detalhe": d} for g, i, ok, d in itens]
    return {"itens": lista, "nota": round(sum(x["ok"] for x in lista) / len(lista) * 100), "ok": sum(x["ok"] for x in lista), "total": len(lista)}


# ---------------- conformidade ISO 27001/27002/27701, riscos, incidentes, acessos, integridade e testes ao vivo ----------------
class ControleIn(BaseModel):
    status: str = Field(pattern="^(implementado|parcial|pendente|nao_aplicavel)$")
    evidencia: str = Field("", max_length=800)
    responsavel: str = Field("", max_length=80)


class PlanoIn(BaseModel):
    escopo: str = Field("", max_length=1500)
    responsavel: str = Field("", max_length=120)
    contato_anpd: str = Field("", max_length=200)


@api.get("/seguranca/conformidade")
def ver_conformidade():
    from .. import conformidade
    return conformidade.avaliar()


@api.put("/seguranca/conformidade/plano")
def salvar_plano_seguranca(d: PlanoIn):
    db.set_cfg("seguranca_plano", {k: v.strip() for k, v in d.model_dump().items()})
    db.registrar("painel", "Plano de segurança atualizado")
    return {"ok": True}


@api.put("/seguranca/conformidade/{chave}")
def salvar_controle_iso(chave: str, d: ControleIn, request: Request):
    from .. import conformidade
    try:
        r = conformidade.salvar_controle(chave, d.status, d.evidencia, d.responsavel or getattr(request.state, "u", {}).get("email", ""))
    except ValueError as e:
        raise HTTPException(400, str(e))
    db.registrar("painel", f"Controle ISO {chave.lstrip('c')} marcado como {d.status}")
    return r


@api.get("/seguranca/conformidade/declaracao")
def declaracao_aplicabilidade(formato: str = "csv"):
    """Declaração de Aplicabilidade (SoA): cada controle do Anexo A, se se aplica, situação, como é atendido e evidência."""
    from fastapi.responses import Response
    from .. import conformidade
    a = conformidade.avaliar()
    rotulo = {"implementado": "Implementado", "parcial": "Parcial", "pendente": "Pendente", "nao_aplicavel": "Não se aplica"}
    linhas = [[x["id"], x["tema"], x["titulo"], "Não" if x["status"] == "nao_aplicavel" else "Sim", rotulo[x["status"]],
               {"automatico": "Conferido pelo sistema", "sistema": "Do próprio sistema", "manual": "Declarado"}[x["origem"]],
               x["detalhe"], x["evidencia"], x["responsavel"]] for x in a["controles"]]
    cab = ["Controle", "Tema", "Título", "Aplicável", "Situação", "Origem", "Como é atendido", "Evidência", "Responsável"]
    nome = "declaracao-aplicabilidade-%s" % time.strftime("%Y%m%d")
    if formato == "html":
        import html as h
        corpo = "".join("<tr>" + "".join(f"<td>{h.escape(str(c))}</td>" for c in l) + "</tr>" for l in linhas)
        doc = (f"<!doctype html><meta charset='utf-8'><title>Declaração de Aplicabilidade</title><style>body{{font-family:system-ui;margin:24px}}"
               f"table{{border-collapse:collapse;width:100%;font-size:12px}}td,th{{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}}th{{background:#f4f4f5}}</style>"
               f"<h1>Declaração de Aplicabilidade · ISO/IEC 27001:2022</h1><p>Gerada em {time.strftime('%d/%m/%Y %H:%M')} · conformidade do Anexo A: {a['nota_anexo']}% · cláusulas: {a['nota_clausulas']}%</p>"
               f"<table><tr>{''.join(f'<th>{c}</th>' for c in cab)}</tr>{corpo}</table>")
        return Response(doc, media_type="text/html; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{nome}.html"'})
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(cab)
    w.writerows(linhas)
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{nome}.csv"'})


@api.get("/seguranca/documentos")
def documentos_seguranca():
    from .. import documentos
    return {"documentos": documentos.lista()}


@api.get("/seguranca/documentos/{tipo}")
def documento_seguranca(tipo: str, request: Request, formato: str = "pdf"):
    """Minuta de política/plano/termo no modelo oficial (PDF ou Word), com os fatos do sistema."""
    from fastapi.responses import Response
    from .. import documentos
    if formato not in ("pdf", "docx"):
        raise HTTPException(400, "Formato inválido. Use pdf ou docx.")
    u = getattr(request.state, "u", None) or {}
    try:
        corpo, tipo_mime, ext, titulo = documentos.gerar(tipo, formato, " · ".join(x for x in (u.get("nome"), u.get("cargo")) if x) or u.get("email", ""))
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'")) from e
    db.registrar("painel", "Documento de segurança gerado", detalhe=f"{titulo} ({ext.upper()})")
    return Response(corpo, media_type=tipo_mime, headers={"Content-Disposition": f'attachment; filename="{tipo}-{time.strftime("%Y%m%d")}.{ext}"'})


@api.get("/seguranca/testes")
def ver_testes_seguranca():
    from .. import conformidade
    return conformidade.ultimos_testes() or {"em": None, "hosts": {}, "ok": 0, "total": 0}


@api.post("/seguranca/testes")
def rodar_testes_seguranca():
    from .. import conformidade
    r = conformidade.rodar_testes()
    db.registrar("painel", "Testes de segurança ao vivo", detalhe=f"{r['ok']}/{r['total']} aprovados")
    return r


@api.get("/seguranca/integridade")
def ver_integridade():
    from .. import conformidade
    conformidade.selar()
    return conformidade.verificar()


@api.post("/seguranca/integridade/selar")
def selar_integridade():
    from .. import conformidade
    r = conformidade.selar(max_dias=120)
    db.registrar("painel", "Registros selados", detalhe=f"{r['novos']} dia(s)")
    return {**r, **conformidade.verificar()}


class RiscoIn(BaseModel):
    titulo: str = Field(min_length=3, max_length=140)
    ativo: str = Field("", max_length=120)
    ameaca: str = Field("", max_length=200)
    probabilidade: int = Field(3, ge=1, le=5)
    impacto: int = Field(3, ge=1, le=5)
    tratamento: str = Field("pendente", pattern="^(pendente|mitigar|aceitar|transferir|evitar)$")
    controles: list[str] = []
    responsavel: str = Field("", max_length=80)
    plano: str = Field("", max_length=600)


def _salvar_lista(chave: str, lista: list) -> list:
    db.set_cfg(chave, lista[:300])
    return lista[:300]


@api.get("/seguranca/riscos")
def listar_riscos():
    return db.cfg("seguranca_riscos") or []


@api.post("/seguranca/riscos")
def criar_risco(d: RiscoIn):
    lista = db.cfg("seguranca_riscos") or []
    novo = {**d.model_dump(), "controles": [c for c in d.controles if re.match(r"^[5-8]\.\d{1,2}$", c)][:12], "id": f"r{int(time.time() * 1000):x}", "criado_em": db.agora(), "revisado_em": db.agora()}
    db.registrar("painel", "Risco de segurança registrado", detalhe=d.titulo)
    return _salvar_lista("seguranca_riscos", [novo, *lista])


@api.post("/seguranca/riscos/sugeridos")
def riscos_sugeridos():
    from .. import conformidade
    lista = db.cfg("seguranca_riscos") or []
    titulos = {x["titulo"] for x in lista}
    agora = db.agora()
    novos = [{**r, "responsavel": "", "plano": "", "id": f"r{int(time.time() * 1000) + i:x}", "criado_em": agora, "revisado_em": agora}
             for i, r in enumerate(conformidade.RISCOS_SUGERIDOS) if r["titulo"] not in titulos]
    return _salvar_lista("seguranca_riscos", [*lista, *novos])


@api.put("/seguranca/riscos/{rid}")
def editar_risco(rid: str, d: RiscoIn):
    lista = db.cfg("seguranca_riscos") or []
    if not any(x["id"] == rid for x in lista):
        raise HTTPException(404, "Risco não encontrado.")
    lista = [{**x, **d.model_dump(), "controles": [c for c in d.controles if re.match(r"^[5-8]\.\d{1,2}$", c)][:12], "revisado_em": db.agora()} if x["id"] == rid else x for x in lista]
    return _salvar_lista("seguranca_riscos", lista)


@api.delete("/seguranca/riscos/{rid}")
def apagar_risco(rid: str):
    return _salvar_lista("seguranca_riscos", [x for x in (db.cfg("seguranca_riscos") or []) if x["id"] != rid])


class IncidenteIn(BaseModel):
    titulo: str = Field(min_length=3, max_length=140)
    severidade: str = Field("media", pattern="^(baixa|media|alta|critica)$")
    status: str = Field("aberto", pattern="^(aberto|contido|resolvido)$")
    descricao: str = Field("", max_length=2000)
    acoes: str = Field("", max_length=2000)
    licoes: str = Field("", max_length=2000)
    dados_pessoais: bool = False
    anpd_comunicada: bool = False
    ip: str = Field("", max_length=60)


@api.get("/seguranca/incidentes")
def listar_incidentes():
    return {"itens": db.cfg("seguranca_incidentes") or [], "plano": db.cfg("seguranca_plano") or {}}


@api.post("/seguranca/incidentes")
def criar_incidente(d: IncidenteIn, request: Request):
    lista = db.cfg("seguranca_incidentes") or []
    agora = db.agora()
    novo = {**d.model_dump(), "id": f"i{int(time.time() * 1000):x}", "aberto_em": agora, "resolvido_em": agora if d.status == "resolvido" else None,
            "por": getattr(request.state, "u", {}).get("email", ""), "linha": [{"em": agora, "texto": f"Aberto como {d.status}"}]}
    db.registrar("painel", f"Incidente de segurança aberto ({d.severidade})", detalhe=d.titulo)
    return _salvar_lista("seguranca_incidentes", [novo, *lista])


@api.put("/seguranca/incidentes/{iid}")
def editar_incidente(iid: str, d: IncidenteIn):
    lista = db.cfg("seguranca_incidentes") or []
    atual = next((x for x in lista if x["id"] == iid), None)
    if not atual:
        raise HTTPException(404, "Incidente não encontrado.")
    agora = db.agora()
    linha = list(atual.get("linha") or [])
    if atual.get("status") != d.status:
        linha.append({"em": agora, "texto": f"Situação: {atual.get('status')} → {d.status}"})
    novo = {**atual, **d.model_dump(), "linha": linha[-50:], "resolvido_em": (atual.get("resolvido_em") or agora) if d.status == "resolvido" else None}
    if d.status == "resolvido" and atual.get("status") != "resolvido":
        db.registrar("painel", "Incidente de segurança resolvido", detalhe=d.titulo)
    return _salvar_lista("seguranca_incidentes", [novo if x["id"] == iid else x for x in lista])


@api.delete("/seguranca/incidentes/{iid}")
def apagar_incidente(iid: str):
    return _salvar_lista("seguranca_incidentes", [x for x in (db.cfg("seguranca_incidentes") or []) if x["id"] != iid])


@api.get("/seguranca/acessos")
def revisao_acessos():
    """Revisão de acessos (ISO 5.18): cada conta com papel, último login, duas etapas e sinais de risco."""
    linhas = db.consultar(
        "SELECT u.id, u.email, u.nome, u.papel, u.ativo, u.permissoes, u.projetos, extract(epoch FROM a.last_sign_in_at)::bigint AS ultimo_login, "
        "extract(epoch FROM a.created_at)::bigint AS criado, "
        "EXISTS(SELECT 1 FROM passkeys p WHERE p.usuario_id = u.id) AS passkey, "
        "EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified') AS totp "
        "FROM usuarios u LEFT JOIN auth.users a ON a.id = u.id ORDER BY u.papel, u.email")
    agora = db.agora()
    itens = []
    for u in linhas:
        alertas = []
        priv = u["papel"] in ("dono", "admin", "subadmin")
        if u["ativo"] and priv and not (u["passkey"] or u["totp"]):
            alertas.append("privilegiado sem duas etapas")
        if u["ativo"] and (not u["ultimo_login"] or agora - u["ultimo_login"] > 90 * 86400):
            alertas.append("sem login há mais de 90 dias")
        if u["ativo"] and u["papel"] == "dono" and sum(1 for x in linhas if x["papel"] == "dono" and x["ativo"]) > 2:
            alertas.append("muitos donos")
        itens.append({"id": str(u["id"]), "email": u["email"], "nome": u.get("nome") or "", "papel": u["papel"], "ativo": bool(u["ativo"]),
                      "ultimo_login": u["ultimo_login"], "duas_etapas": bool(u["passkey"] or u["totp"]), "alertas": alertas})
    return {"itens": itens, "revisoes": (db.cfg("revisoes_acesso") or [])[:20]}


class RevisaoIn(BaseModel):
    nota: str = Field("", max_length=600)


@api.post("/seguranca/acessos/revisao")
def registrar_revisao_acessos(d: RevisaoIn, request: Request):
    revs = db.cfg("revisoes_acesso") or []
    n = db.um("SELECT count(*) n FROM usuarios")["n"]
    revs.insert(0, {"em": db.agora(), "por": getattr(request.state, "u", {}).get("email", ""), "nota": d.nota.strip(), "contas": n})
    db.set_cfg("revisoes_acesso", revs[:50])
    db.registrar("painel", "Revisão de acessos concluída", detalhe=f"{n} conta(s)")
    return revs[:20]


@api.get("/seguranca/escudo")
def ver_escudo():
    from .. import firewall
    e = firewall.escudo()
    desde = e.get("desde") or 0
    bloq = db.um("SELECT count(*) n FROM seguranca_ips WHERE automatico AND criado_em >= ?", (desde,))["n"] if e["ativo"] else 0
    return {**e, "taxa": firewall.taxa_atual(), "bloqueados_no_ataque": bloq, "config": {k: firewall.config()[k] for k in
            ("escudo_auto", "ddos_req_seg", "ddos_ips_min", "escudo_minutos", "limite_escudo_por_minuto", "rajada_10s", "escudo_vercel")}}


class EscudoIn(BaseModel):
    acao: str = Field(pattern="^(ligar|desligar)$")
    minutos: int = Field(30, ge=5, le=1440)


@api.post("/seguranca/escudo")
def mudar_escudo(d: EscudoIn, request: Request):
    from .. import firewall
    if d.acao == "ligar":
        firewall.ligar_escudo("Ligado manualmente pelo painel", d.minutos, automatico=False)
    else:
        firewall.desligar_escudo()
    db.registrar("painel", f"Escudo anti-DDoS {'ligado' if d.acao == 'ligar' else 'desligado'}", detalhe=getattr(request.state, "u", {}).get("email", ""))
    return ver_escudo()


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
    # extras do white label
    "logo_escuro": "", "menu_estilo": "padrao", "login_fundo": "fumaca", "login_imagem": "", "login_cor": "#0f172a",
    "animacoes": "completas", "selo_ambiente": "", "mostrar_ajuda": True, "link_privacidade": "https://zynio.com.br/privacidade",
    "link_termos": "https://zynio.com.br/termos", "banner_inicio": "", "banner_fim": "",
    # aparência avançada
    "tom_neutro": "zinco", "estilo_botao": "solido", "estilo_cartao": "borda", "largura": "padrao", "icone_espessura": 20,
    # login, navegação e operação
    "login_layout": "dividido", "login_aviso": "", "pagina_inicial": "/", "mostrar_link_site": True,
    "manutencao": False, "manutencao_mensagem": "", "manutencao_previsao": "",
    # relatórios exportados
    "relatorio_logo": True, "relatorio_rodape": "", "relatorio_orgao": "",   # orgão = 3ª linha do cabeçalho oficial (modelo Prefeitura)
    # cores e tipografia avançadas
    "cor_sucesso": "#16a34a", "cor_aviso": "#d97706", "fonte_titulos": "mesma", "peso_titulos": 600, "espaco_letras": 0,
    "sombra": "suave", "borda_espessura": 1, "fundo_app": "liso", "cabecalho_estilo": "vidro", "menu_largura": 264,
    # acessibilidade
    "alto_contraste": False, "foco_reforcado": False, "sublinhar_links": False, "reduzir_transparencia": False,
    # marca d'água, título da aba e tema sazonal
    "marca_dagua": "", "marca_dagua_opacidade": 6, "titulo_aba": "{sistema}",
    "sazonal_ativo": False, "sazonal_nome": "", "sazonal_cor": "#b91c1c", "sazonal_destaque": "#15803d", "sazonal_inicio": "", "sazonal_fim": "",
    # cursor padrão da empresa (para quem nunca escolheu um)
    "cursor_empresa": False, "cursor_empresa_estilo": "anel_ponto", "cursor_empresa_modelo": "sistema", "cursor_empresa_efeitos": [],
    # contato e redes no rodapé, tela de abertura
    "rede_instagram": "", "rede_linkedin": "", "rede_youtube": "", "abertura": False, "abertura_texto": "",
}
_CSS_PROIBIDO = re.compile(r"(@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|-moz-binding|</style)", re.I)
_COR = re.compile(r"^#[0-9a-fA-F]{6}$")
ROTAS_MENU = {"/", "/projetos", "/mapa", "/relatorios", "/aparelhos", "/cenas", "/automacoes", "/agendamentos", "/transmissores",
              "/integracoes", "/comandos-alexa", "/alexa", "/supabase", "/atividade", "/seguranca", "/mensagens", "/apps"}


_EFEITOS_CURSOR = {"rastro", "brilho", "ondas", "faiscas", "magnetico", "arco_iris"}
_FONTES = ("sistema", "arredondada", "serifada", "mono", "condensada", "inter", "manrope", "dm_sans", "nunito", "outfit", "plex")


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
        elif isinstance(padrao, list) and k == "cursor_empresa_efeitos":
            v = [str(x) for x in (v or []) if str(x) in _EFEITOS_CURSOR][:6]
        elif isinstance(padrao, list):
            v = [str(x) for x in (v or []) if str(x) in ROTAS_MENU and str(x) != "/"]
        else:
            v = str(v or "")
        limpo[k] = v
    for k in ("cor_primaria", "cor_destaque", "cor_alerta"):
        if not _COR.match(limpo[k]):
            raise HTTPException(400, f"Cor inválida em {k}: use o formato #RRGGBB.")
    for k in ("logo", "favicon", "logo_escuro", "login_imagem"):
        if limpo[k] and not re.match(r"^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$", limpo[k]):
            raise HTTPException(400, "Imagem inválida: envie PNG, JPG, WEBP ou SVG.")
        if len(limpo[k]) > (1_400_000 if k == "login_imagem" else 400_000):
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
    if limpo["fonte"] not in _FONTES: limpo["fonte"] = "sistema"
    for k, ok in (("tom_neutro", ("zinco", "pedra", "ardosia", "oliva")), ("estilo_botao", ("solido", "contorno", "pilula")),
                  ("estilo_cartao", ("borda", "sombra", "plano")), ("largura", ("padrao", "larga", "total")), ("login_layout", ("dividido", "centralizado"))):
        if limpo[k] not in ok: limpo[k] = ok[0]
    limpo["icone_espessura"] = max(12, min(28, limpo["icone_espessura"]))
    if limpo["pagina_inicial"] not in ROTAS_MENU: limpo["pagina_inicial"] = "/"
    if limpo["manutencao_previsao"] and not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", limpo["manutencao_previsao"]): limpo["manutencao_previsao"] = ""
    for k in ("login_aviso", "manutencao_mensagem", "relatorio_rodape", "relatorio_orgao"):
        limpo[k] = limpo[k].strip()[:300]
    if limpo["densidade"] not in ("compacta", "confortavel", "espacosa"): limpo["densidade"] = "confortavel"
    for k, padrao_cor in (("cor_sucesso", "#16a34a"), ("cor_aviso", "#d97706"), ("sazonal_cor", "#b91c1c"), ("sazonal_destaque", "#15803d")):
        if not _COR.match(limpo[k]): limpo[k] = padrao_cor
    if limpo["fonte_titulos"] != "mesma" and limpo["fonte_titulos"] not in _FONTES: limpo["fonte_titulos"] = "mesma"
    limpo["peso_titulos"] = max(400, min(800, round(limpo["peso_titulos"] / 100) * 100))
    limpo["espaco_letras"] = max(-3, min(6, limpo["espaco_letras"]))
    limpo["borda_espessura"] = max(0, min(3, limpo["borda_espessura"]))
    limpo["menu_largura"] = max(200, min(320, limpo["menu_largura"]))
    limpo["marca_dagua_opacidade"] = max(2, min(20, limpo["marca_dagua_opacidade"]))
    for k, ok in (("sombra", ("suave", "nenhuma", "media", "forte")), ("fundo_app", ("liso", "pontos", "grade", "gradiente")),
                  ("cabecalho_estilo", ("vidro", "solido", "marca")), ("cursor_empresa_estilo", ("anel_ponto", "anel", "ponto", "mira", "quadrado", "bolha", "sem_ponteiro", "nenhum")),
                  ("cursor_empresa_modelo", ("sistema", "seta", "neon", "vazado", "mira", "ponto", "triangulo", "pixel"))):
        if limpo[k] not in ok: limpo[k] = ok[0]
    limpo["marca_dagua"] = limpo["marca_dagua"].strip()[:60]
    limpo["titulo_aba"] = (limpo["titulo_aba"].strip() or "{sistema}")[:80]
    limpo["sazonal_nome"] = limpo["sazonal_nome"].strip()[:40]
    limpo["abertura_texto"] = limpo["abertura_texto"].strip()[:120]
    for k in ("sazonal_inicio", "sazonal_fim"):
        if limpo[k] and not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", limpo[k]): limpo[k] = ""
    for k, dominio in (("rede_instagram", "instagram.com"), ("rede_linkedin", "linkedin.com"), ("rede_youtube", "youtube.com")):
        if limpo[k] and not re.match(r"^https://(www\.)?" + re.escape(dominio) + r"/[\w./@%-]*$", limpo[k]):
            raise HTTPException(400, f"Link inválido em {k}: use https://{dominio}/…")
    if limpo["banner_cor"] not in ("info", "alerta", "sucesso", "marca"): limpo["banner_cor"] = "info"
    if limpo["unidade_temperatura"] not in ("C", "F"): limpo["unidade_temperatura"] = "C"
    if limpo["formato_hora"] not in ("24h", "12h"): limpo["formato_hora"] = "24h"
    if limpo["menu_estilo"] not in ("padrao", "escuro", "marca"): limpo["menu_estilo"] = "padrao"
    if limpo["login_fundo"] not in ("fumaca", "cor", "imagem"): limpo["login_fundo"] = "fumaca"
    if limpo["animacoes"] not in ("completas", "reduzidas", "desligadas"): limpo["animacoes"] = "completas"
    if not _COR.match(limpo["login_cor"]): limpo["login_cor"] = "#0f172a"
    for k in ("link_privacidade", "link_termos"):
        if limpo[k] and not re.match(r"^https://[\w.-]+(/[\w./#?=&%-]*)?$", limpo[k]):
            raise HTTPException(400, "Os links de privacidade e termos precisam começar com https://.")
    # o site vira link no menu Ajuda: só https (javascript:, data:, smb: e afins abririam outra coisa no computador)
    if limpo.get("site") and not re.match(r"^https://[\w.-]+(/[\w./#?=&%-]*)?$", str(limpo["site"])):
        raise HTTPException(400, "O site precisa começar com https://.")
    for k in ("banner_inicio", "banner_fim"):
        if limpo[k] and not re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$", limpo[k]):
            limpo[k] = ""
    limpo["selo_ambiente"] = limpo["selo_ambiente"].strip()[:24]
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


@api.get("/marca/historico/{indice}")
def versao_marca(indice: int):
    """Uma versão completa, para comparar com a atual campo a campo."""
    historico = db.cfg("white_label_historico") or []
    if not 0 <= indice < len(historico):
        raise HTTPException(404, "Versão não encontrada.")
    return {"em": historico[indice]["em"], "marca": {k: v for k, v in historico[indice]["marca"].items() if k not in ("logo", "logo_escuro", "favicon", "login_imagem")}}


class TemaMarcaIn(BaseModel):
    nome: str = Field(min_length=1, max_length=40)
    valores: dict


# temas próprios da empresa (sem imagens): aplicar um tema é só um atalho, nada muda até salvar a marca
_CAMPOS_TEMA = ("cor_primaria", "cor_destaque", "cor_alerta", "cor_sucesso", "cor_aviso", "fonte", "fonte_titulos", "peso_titulos", "raio",
                "densidade", "menu_estilo", "tema_padrao", "tom_neutro", "estilo_botao", "estilo_cartao", "sombra", "borda_espessura",
                "fundo_app", "cabecalho_estilo", "espaco_letras", "escala", "icone_espessura")


@api.get("/marca/temas")
def temas_marca():
    return db.cfg("white_label_temas") or []


@api.post("/marca/temas")
def salvar_tema_marca(d: TemaMarcaIn):
    temas = [t for t in (db.cfg("white_label_temas") or []) if t["nome"].lower() != d.nome.strip().lower()]
    base = _validar_marca({**_marca(), **{k: d.valores[k] for k in _CAMPOS_TEMA if k in d.valores}})
    temas.insert(0, {"nome": d.nome.strip(), "em": db.agora(), "valores": {k: base[k] for k in _CAMPOS_TEMA}})
    db.set_cfg("white_label_temas", temas[:24])
    db.registrar("painel", "Tema da marca salvo", detalhe=d.nome.strip())
    return temas[:24]


@api.delete("/marca/temas/{nome}")
def apagar_tema_marca(nome: str):
    temas = [t for t in (db.cfg("white_label_temas") or []) if t["nome"] != nome]
    db.set_cfg("white_label_temas", temas)
    return temas


@api.post("/marca/historico/{indice}/restaurar")
def restaurar_marca(indice: int):
    historico = db.cfg("white_label_historico") or []
    if not 0 <= indice < len(historico):
        raise HTTPException(404, "Versão não encontrada.")
    return salvar_marca(historico[indice]["marca"])


@api.post("/marca/padrao")
def marca_padrao():
    return salvar_marca(dict(MARCA_PADRAO))
