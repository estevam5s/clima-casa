"""Rotas de Tarefas (app/tarefas.py). Qualquer pessoa logada vê e mexe nas tarefas; o papel visualizador só vê.
Conectar o GitHub (token) é só do dono; ligar um projeto ao GitHub e sincronizar, dono ou administradores."""
from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import acesso, db, tarefas
from ..seguranca import exigir_login

rotas_tarefas = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])
DATA = r"^\d{4}-\d{2}-\d{2}$"
COR = r"^#[0-9a-fA-F]{6}$"


def _u() -> dict:
    return acesso.atual.get() or {}


def _editor() -> dict:
    u = _u()
    if u.get("papel") == "visualizador":
        raise HTTPException(403, "Seu papel só permite ver as tarefas.")
    return u


def _gestor() -> dict:
    u = _u()
    if u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores ligam projetos ao GitHub.")
    return u


def _json(v, padrao):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except ValueError:
            return padrao
    return v if v is not None else padrao


def _tarefa(t: dict) -> dict:
    t = dict(t)
    t["etiquetas"] = _json(t.get("etiquetas"), [])
    for k in ("responsavel_id", "criado_por"):
        if t.get(k) is not None:
            t[k] = str(t[k])
    return t


def _projeto(pid: int) -> dict:
    p = db.um("SELECT * FROM tarefas_projetos WHERE id = ?", (pid,))
    if not p:
        raise HTTPException(404, "Projeto não encontrado.")
    p = dict(p)
    p["github"] = _json(p.get("github"), None)
    p["criado_por"] = str(p["criado_por"]) if p.get("criado_por") else None
    return p


def _da_tarefa(tid: int) -> dict:
    t = db.um("SELECT * FROM tarefas WHERE id = ?", (tid,))
    if not t:
        raise HTTPException(404, "Tarefa não encontrada.")
    return t


def _ev(tid: int, texto: str):
    tarefas.evento(tid, _u(), texto)


# ---------------- pessoas ----------------
@rotas_tarefas.get("/tarefas/pessoas")
def pessoas():
    return {"pessoas": [{"id": str(r["id"]), "nome": r["nome"] or r["email"].split("@")[0], "avatar": r.get("avatar") or ""}
                        for r in db.consultar("SELECT id, nome, email, avatar FROM usuarios WHERE ativo ORDER BY nome")]}


# ---------------- projetos ----------------
class ProjetoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str = Field("", max_length=2000)
    cor: str = Field("#0f766a", pattern=COR)
    secoes: list[str] | None = Field(None, max_length=20)
    modelo: str | None = Field(None, max_length=30)
    arquivado: bool = False
    membros: list[str] | None = Field(None, max_length=100)
    portfolio: str = Field("", max_length=80)
    layout: str = Field("lista", pattern=r"^(lista|quadro|calendario|cronograma|painel)$")
    prazo: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")


@rotas_tarefas.get("/tarefas/projetos")
def projetos():
    linhas = db.consultar("""SELECT p.id, p.nome, p.descricao, p.cor, p.arquivado, p.ordem, p.github IS NOT NULL AS no_github,
        p.membros, p.status, p.portfolio, p.layout, p.prazo, p.atualizado_em, p.criado_por::text AS criado_por,
        COUNT(t.id) FILTER (WHERE t.pai_id IS NULL) AS total, COUNT(t.id) FILTER (WHERE t.pai_id IS NULL AND t.concluida) AS feitas,
        COUNT(t.id) FILTER (WHERE t.pai_id IS NULL AND NOT t.concluida AND t.prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS atrasadas
        FROM tarefas_projetos p LEFT JOIN tarefas t ON t.projeto_id = p.id GROUP BY p.id ORDER BY p.arquivado, p.ordem, p.id""")
    for p in linhas:
        p["membros"] = _json(p.get("membros"), [])
    gh = db.cfg("github_tarefas") or {}
    return {"projetos": linhas, "modelos": {k: {"nome": m["nome"], "descricao": m["descricao"], "layout": m["layout"],
                                                "secoes": [x[0] for x in m["secoes"]]} for k, m in tarefas.MODELOS.items()}, "github": {"conectado": bool(gh.get("token")), "login": gh.get("login")},
            "pode_editar": _u().get("papel") != "visualizador", "gestor": _u().get("papel") in ("dono", "admin"), "dono": _u().get("papel") == "dono"}


@rotas_tarefas.post("/tarefas/projetos")
def criar_projeto(d: ProjetoIn):
    u = _editor()
    modelo = tarefas.MODELOS.get(d.modelo or "")
    membros = sorted({*(_pessoa_valida(m) for m in (d.membros or []) if m), str(u.get("id"))})
    pid = db.um("INSERT INTO tarefas_projetos (nome, descricao, cor, criado_por, criado_em, atualizado_em, ordem, membros, portfolio, layout, prazo) "
                "VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas_projetos), CAST(? AS jsonb), ?, ?, ?) RETURNING id",
                (d.nome.strip(), d.descricao.strip() or (modelo or {}).get("descricao", ""), d.cor, u.get("id"), db.agora(), db.agora(),
                 json.dumps(membros), d.portfolio.strip(), (modelo or {}).get("layout") or d.layout, d.prazo or None))["id"]
    secoes = modelo["secoes"] if modelo else [(x, []) for x in (d.secoes or tarefas.SECOES_PADRAO)]
    for i, (nome, itens) in enumerate([(a.strip()[:80], b) for a, b in secoes if a.strip()]):
        sid = db.um("INSERT INTO tarefas_secoes (projeto_id, nome, ordem) VALUES (?, ?, ?) RETURNING id", (pid, nome, i))["id"]
        for j, titulo in enumerate(itens):
            tid = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, ordem, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?) RETURNING id",
                        (pid, sid, titulo, j + 1, u.get("id"), db.agora(), db.agora()))["id"]
            _ev(tid, "Criou a tarefa (modelo)")
    db.registrar("painel", f"Tarefas: projeto criado ({d.nome.strip()})")
    return detalhe_projeto(pid)


@rotas_tarefas.put("/tarefas/projetos/{pid}")
def editar_projeto(pid: int, d: ProjetoIn):
    _editor(); _projeto(pid)
    membros = None if d.membros is None else json.dumps(sorted({_pessoa_valida(m) for m in d.membros if m}))
    db.executar("UPDATE tarefas_projetos SET nome = ?, descricao = ?, cor = ?, arquivado = ?, portfolio = ?, layout = ?, prazo = ?, "
                "membros = COALESCE(CAST(? AS jsonb), membros), atualizado_em = ? WHERE id = ?",
                (d.nome.strip(), d.descricao.strip(), d.cor, d.arquivado, d.portfolio.strip(), d.layout, d.prazo or None, membros, db.agora(), pid))
    return detalhe_projeto(pid)


@rotas_tarefas.delete("/tarefas/projetos/{pid}")
def apagar_projeto(pid: int):
    _gestor(); p = _projeto(pid)
    db.executar("DELETE FROM tarefas_projetos WHERE id = ?", (pid,))
    db.registrar("painel", f"Tarefas: projeto apagado ({p['nome']})", detalhe="as tarefas no GitHub, se houver, continuam lá")
    return {"ok": True}


@rotas_tarefas.get("/tarefas/projetos/{pid}")
def detalhe_projeto(pid: int):
    p = _projeto(pid)
    secoes = db.consultar("SELECT id, nome, ordem, github_opcao FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem, id", (pid,))
    itens = db.consultar("""SELECT t.*, (SELECT COUNT(*) FROM tarefas s WHERE s.pai_id = t.id) AS subtarefas,
        (SELECT COUNT(*) FROM tarefas s WHERE s.pai_id = t.id AND s.concluida) AS subtarefas_feitas,
        (SELECT COUNT(*) FROM tarefas_comentarios c WHERE c.tarefa_id = t.id AND c.tipo = 'comentario') AS comentarios
        FROM tarefas t WHERE t.projeto_id = ? AND t.pai_id IS NULL ORDER BY t.ordem, t.id""", (pid,))
    p["membros"] = _json(p.get("membros"), [])
    hist = db.consultar("SELECT id, status, texto, autor_id::text AS autor_id, autor_nome, criado_em FROM tarefas_status WHERE projeto_id = ? ORDER BY criado_em DESC LIMIT 30", (pid,))
    return {"projeto": p, "secoes": secoes, "tarefas": [_tarefa(t) for t in itens], "status_historico": hist}


class StatusIn(BaseModel):
    status: str = Field(pattern=r"^(sem_status|no_caminho|em_risco|fora_do_caminho|pausado|concluido)$")
    texto: str = Field("", max_length=4000)


@rotas_tarefas.post("/tarefas/projetos/{pid}/status")
def atualizar_status(pid: int, d: StatusIn):
    u = _editor(); _projeto(pid)
    db.executar("UPDATE tarefas_projetos SET status = ?, atualizado_em = ? WHERE id = ?", (d.status, db.agora(), pid))
    db.executar("INSERT INTO tarefas_status (projeto_id, status, texto, autor_id, autor_nome, criado_em) VALUES (?, ?, ?, ?, ?, ?)",
                (pid, d.status, d.texto.strip(), u.get("id"), u.get("nome") or (u.get("email") or "").split("@")[0], db.agora()))
    return detalhe_projeto(pid)


@rotas_tarefas.get("/tarefas/caixa")
def caixa():
    """Caixa de entrada: o que aconteceu nas tarefas da pessoa (responsável, criadas por ela ou em que comentou) e
    nos projetos em que é membro, menos o que ela mesma fez."""
    uid = str(_u().get("id"))
    itens = db.consultar("""SELECT c.id, c.tipo, c.texto, c.autor_nome, c.criado_em, t.id AS tarefa_id, t.titulo, t.projeto_id,
        p.nome AS projeto_nome, p.cor AS projeto_cor FROM tarefas_comentarios c JOIN tarefas t ON t.id = c.tarefa_id
        JOIN tarefas_projetos p ON p.id = t.projeto_id
        WHERE c.criado_em > ? AND COALESCE(c.autor_id::text, '') <> ? AND (t.responsavel_id::text = ? OR t.criado_por::text = ?
          OR p.membros ? ? OR EXISTS (SELECT 1 FROM tarefas_comentarios m WHERE m.tarefa_id = t.id AND m.autor_id::text = ?))
        ORDER BY c.criado_em DESC LIMIT 200""".replace("p.membros ? ?", "p.membros @> to_jsonb(CAST(? AS text))"),
                         (db.agora() - 30 * 86400, uid, uid, uid, uid, uid))
    return {"itens": itens}


@rotas_tarefas.get("/tarefas/carga")
def carga():
    linhas = db.consultar("""SELECT responsavel_id::text AS id, COUNT(*) AS abertas,
        COUNT(*) FILTER (WHERE prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS atrasadas
        FROM tarefas WHERE NOT concluida AND responsavel_id IS NOT NULL GROUP BY 1""")
    return {"pessoas": [{"id": r["id"], "abertas": int(r["abertas"]), "atrasadas": int(r["atrasadas"])} for r in linhas]}


@rotas_tarefas.get("/tarefas/inicio")
def inicio():
    uid = str(_u().get("id"))
    semana = db.agora() - 7 * 86400
    r = db.um("""SELECT COUNT(*) FILTER (WHERE concluida AND concluida_em > ? AND responsavel_id::text = ?) AS feitas_semana,
        COUNT(*) FILTER (WHERE NOT concluida AND responsavel_id::text = ?) AS abertas,
        COUNT(*) FILTER (WHERE NOT concluida AND responsavel_id::text = ? AND prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')) AS atrasadas
        FROM tarefas""", (semana, uid, uid, uid)) or {}
    colab = db.um("""SELECT COUNT(DISTINCT x) AS n FROM (SELECT jsonb_array_elements_text(membros) AS x FROM tarefas_projetos
        WHERE membros @> to_jsonb(CAST(? AS text))) y WHERE x <> ?""", (uid, uid)) or {}
    return {**{k: int(v or 0) for k, v in r.items()}, "colaboradores": int(colab.get("n") or 0)}


# ---------------- seções ----------------
class SecaoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)


@rotas_tarefas.post("/tarefas/projetos/{pid}/secoes")
def criar_secao(pid: int, d: SecaoIn):
    _editor(); _projeto(pid)
    db.executar("INSERT INTO tarefas_secoes (projeto_id, nome, ordem) VALUES (?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas_secoes WHERE projeto_id = ?))",
                (pid, d.nome.strip(), pid))
    return detalhe_projeto(pid)


@rotas_tarefas.put("/tarefas/secoes/{sid}")
def renomear_secao(sid: int, d: SecaoIn):
    _editor()
    s = db.um("UPDATE tarefas_secoes SET nome = ? WHERE id = ? RETURNING projeto_id", (d.nome.strip(), sid))
    if not s:
        raise HTTPException(404, "Seção não encontrada.")
    return detalhe_projeto(s["projeto_id"])


@rotas_tarefas.delete("/tarefas/secoes/{sid}")
def apagar_secao(sid: int):
    _editor()
    s = db.um("SELECT projeto_id FROM tarefas_secoes WHERE id = ?", (sid,))
    if not s:
        raise HTTPException(404, "Seção não encontrada.")
    destino = db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? AND id <> ? ORDER BY ordem LIMIT 1", (s["projeto_id"], sid))
    db.executar("UPDATE tarefas SET secao_id = ? WHERE secao_id = ?", (destino["id"] if destino else None, sid))   # as tarefas vão para a 1ª seção
    db.executar("DELETE FROM tarefas_secoes WHERE id = ?", (sid,))
    return detalhe_projeto(s["projeto_id"])


class OrdemSecoesIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)


@rotas_tarefas.put("/tarefas/projetos/{pid}/secoes/ordem")
def ordenar_secoes(pid: int, d: OrdemSecoesIn):
    _editor()
    for i, sid in enumerate(d.ids):
        db.executar("UPDATE tarefas_secoes SET ordem = ? WHERE id = ? AND projeto_id = ?", (i, sid, pid))
    return detalhe_projeto(pid)


# ---------------- tarefas ----------------
class TarefaIn(BaseModel):
    projeto_id: int | None = None
    secao_id: int | None = None
    pai_id: int | None = None
    titulo: str = Field(min_length=1, max_length=300)
    descricao: str = Field("", max_length=20000)
    responsavel_id: str | None = Field(None, max_length=40)
    inicio: str | None = Field(None, pattern=DATA)
    prazo: str | None = Field(None, pattern=DATA)
    prioridade: str = Field("nenhuma", pattern=r"^(nenhuma|baixa|media|alta|urgente)$")
    etiquetas: list[str] = Field(default_factory=list, max_length=12)
    estimativa_h: float | None = Field(None, ge=0, le=10000)


class TarefaParcialIn(BaseModel):
    secao_id: int | None = None
    titulo: str | None = Field(None, min_length=1, max_length=300)
    descricao: str | None = Field(None, max_length=20000)
    responsavel_id: str | None = Field(None, max_length=40)
    inicio: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    prazo: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    prioridade: str | None = Field(None, pattern=r"^(nenhuma|baixa|media|alta|urgente)$")
    etiquetas: list[str] | None = Field(None, max_length=12)
    concluida: bool | None = None
    estimativa_h: float | None = Field(None, ge=0, le=10000)
    ordem: float | None = None
    recorrencia: str | None = Field(None, pattern=r"^(|diaria|dias_uteis|semanal|quinzenal|mensal)$")   # ao concluir, cria a próxima


def _pessoa_valida(uid: str | None) -> str | None:
    if not uid:
        return None
    if not re.match(r"^[0-9a-f-]{36}$", uid) or not db.um("SELECT id FROM usuarios WHERE id = CAST(? AS uuid)", (uid,)):
        raise HTTPException(400, "Responsável inválido.")
    return uid


def _nome(uid: str | None) -> str:
    if not uid:
        return "ninguém"
    r = db.um("SELECT nome, email FROM usuarios WHERE id = CAST(? AS uuid)", (uid,))
    return (r["nome"] or r["email"].split("@")[0]) if r else "?"


@rotas_tarefas.post("/tarefas")
def criar(d: TarefaIn):
    u = _editor()
    if d.pai_id:
        pai = _da_tarefa(d.pai_id)
        pid, secao = pai["projeto_id"], pai["secao_id"]
    else:
        if not d.projeto_id:
            raise HTTPException(400, "Escolha o projeto.")
        _projeto(d.projeto_id)
        pid = d.projeto_id
        secao = d.secao_id or (db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem LIMIT 1", (pid,)) or {}).get("id")
    ordem = (db.um("SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM tarefas WHERE projeto_id = ? AND COALESCE(secao_id, 0) = COALESCE(?, 0)", (pid, secao)) or {}).get("o") or 1
    t = db.um("INSERT INTO tarefas (projeto_id, secao_id, pai_id, titulo, descricao, responsavel_id, inicio, prazo, prioridade, etiquetas, estimativa_h, "
              "ordem, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,CAST(? AS uuid),?,?,?,CAST(? AS jsonb),?,?,?,?,?) RETURNING *",
              (pid, secao, d.pai_id, d.titulo.strip(), d.descricao, _pessoa_valida(d.responsavel_id), d.inicio, d.prazo, d.prioridade,
               json.dumps([e.strip()[:30] for e in d.etiquetas if e.strip()]), d.estimativa_h, ordem, u.get("id"), db.agora(), db.agora()))
    _ev(t["id"], "Criou a tarefa" if not d.pai_id else "Criou a subtarefa")
    if d.responsavel_id and d.responsavel_id != str(u.get("id")):
        _avisar(d.responsavel_id, t)
    return _tarefa(t)


def _avisar(uid: str, t: dict):
    try:
        from .. import notificacoes
        notificacoes.notificar(f"tarefa:{t['id']}:{uid}", "tarefa", "baixa", f"Tarefa para você: {t['titulo'][:150]}",
                               "Você foi marcado como responsável ou recebeu um comentário.", f"/tarefas?projeto={t['projeto_id']}&tarefa={t['id']}")
    except Exception:  # noqa: BLE001  (aviso não pode derrubar a tarefa)
        pass


@rotas_tarefas.get("/tarefas/minhas")
def minhas():
    uid = _u().get("id")
    itens = db.consultar("""SELECT t.*, p.nome AS projeto_nome, p.cor AS projeto_cor, s.nome AS secao_nome FROM tarefas t
        JOIN tarefas_projetos p ON p.id = t.projeto_id LEFT JOIN tarefas_secoes s ON s.id = t.secao_id
        WHERE t.responsavel_id = CAST(? AS uuid) AND (NOT t.concluida OR t.concluida_em > ?) AND NOT p.arquivado
        ORDER BY t.concluida, t.prazo NULLS LAST, t.ordem LIMIT 500""", (str(uid), db.agora() - 7 * 86400))
    return {"tarefas": [_tarefa(t) for t in itens]}


@rotas_tarefas.get("/tarefas/{tid}")
def detalhe(tid: int):
    t = _tarefa(_da_tarefa(tid))
    subs = [_tarefa(s) for s in db.consultar("SELECT * FROM tarefas WHERE pai_id = ? ORDER BY ordem, id", (tid,))]
    coms = db.consultar("SELECT id, autor_id, autor_nome, tipo, texto, criado_em FROM tarefas_comentarios WHERE tarefa_id = ? ORDER BY criado_em, id LIMIT 500", (tid,))
    for c in coms:
        c["autor_id"] = str(c["autor_id"]) if c["autor_id"] else None
    pai = db.um("SELECT id, titulo FROM tarefas WHERE id = ?", (t["pai_id"],)) if t.get("pai_id") else None
    return {"tarefa": t, "subtarefas": subs, "comentarios": coms, "pai": pai}


PRIO_NOME = {"nenhuma": "sem prioridade", "baixa": "baixa", "media": "média", "alta": "alta", "urgente": "urgente"}


@rotas_tarefas.put("/tarefas/{tid}")
def editar(tid: int, d: TarefaParcialIn):
    u = _editor()
    t = _da_tarefa(tid)
    mud = {k: v for k, v in d.model_dump(exclude_unset=True).items()}
    if not mud:
        return detalhe(tid)
    sets, vals, eventos = [], [], []
    for k, v in mud.items():
        if k in ("inicio", "prazo") and v == "":
            v = None
        if k == "responsavel_id":
            v = _pessoa_valida(v)
            sets.append("responsavel_id = CAST(? AS uuid)"); vals.append(v)
            if str(t["responsavel_id"] or "") != str(v or ""):
                eventos.append(f"Responsável: {_nome(v)}")
                if v and v != str(u.get("id")):
                    _avisar(v, {**t, "titulo": mud.get("titulo") or t["titulo"]})
            continue
        if k == "etiquetas":
            sets.append("etiquetas = CAST(? AS jsonb)"); vals.append(json.dumps([e.strip()[:30] for e in v if e.strip()])); continue
        if k == "secao_id" and v is not None:
            if not db.um("SELECT id FROM tarefas_secoes WHERE id = ? AND projeto_id = ?", (v, t["projeto_id"])):
                raise HTTPException(400, "Seção de outro projeto.")
            if v != t["secao_id"]:
                eventos.append("Moveu para " + (db.um("SELECT nome FROM tarefas_secoes WHERE id = ?", (v,)) or {}).get("nome", "?"))
        if k == "concluida" and v != t["concluida"]:
            eventos.append("Concluiu" if v else "Reabriu")
            sets.append("concluida_em = ?"); vals.append(db.agora() if v else None)
        if k == "prazo" and v != t["prazo"]:
            eventos.append(f"Prazo: {v or 'sem prazo'}")
        if k == "prioridade" and v != t["prioridade"]:
            eventos.append(f"Prioridade {PRIO_NOME[v]}")
        if k == "titulo" and v != t["titulo"]:
            eventos.append("Renomeou")
            v = v.strip()
        sets.append(f"{k} = ?"); vals.append(v)
    sets.append("atualizado_em = ?"); vals.append(db.agora())
    db.executar(f"UPDATE tarefas SET {', '.join(sets)} WHERE id = ?", (*vals, tid))   # nomes vêm do modelo (lista fechada)
    if mud.get("concluida") is True and not t["concluida"]:
        prox = _proxima_recorrencia(tid)
        if prox:
            eventos.append(f"Próxima repetição criada (#{prox})")
    for e in eventos:
        _ev(tid, e)
    return detalhe(tid)


def _proxima_recorrencia(tid: int) -> int | None:
    """Tarefa recorrente concluída: cria a próxima igual, com prazo avançado (diária, dias úteis, semanal, quinzenal, mensal)."""
    import datetime as dt
    t = db.um("SELECT * FROM tarefas WHERE id = ?", (tid,))
    rec = (t or {}).get("recorrencia") or ""
    if not rec:
        return None
    base = dt.date.fromisoformat(t["prazo"]) if t.get("prazo") else dt.date.today()
    if rec == "diaria":
        prox = base + dt.timedelta(days=1)
    elif rec == "dias_uteis":
        prox = base + dt.timedelta(days=1)
        while prox.weekday() >= 5:
            prox += dt.timedelta(days=1)
    elif rec == "semanal":
        prox = base + dt.timedelta(days=7)
    elif rec == "quinzenal":
        prox = base + dt.timedelta(days=14)
    else:
        m = base.month % 12 + 1
        a = base.year + (1 if base.month == 12 else 0)
        import calendar
        prox = dt.date(a, m, min(base.day, calendar.monthrange(a, m)[1]))
    novo = db.um("INSERT INTO tarefas (projeto_id, secao_id, pai_id, titulo, descricao, responsavel_id, prazo, prioridade, etiquetas, ordem, estimativa_h, "
                 "criado_por, criado_em, atualizado_em, recorrencia, concluida) SELECT projeto_id, secao_id, pai_id, titulo, descricao, responsavel_id, ?, prioridade, "
                 "etiquetas, ordem + 0.001, estimativa_h, criado_por, ?, ?, recorrencia, false FROM tarefas WHERE id = ? RETURNING id",
                 (prox.isoformat(), db.agora(), db.agora(), tid))
    return novo["id"] if novo else None


# ---------------- Metas (estilo Asana): progresso pelas tarefas concluídas dos projetos ligados ----------------
class MetaIn(BaseModel):
    titulo: str = Field(min_length=2, max_length=160)
    descricao: str = Field("", max_length=2000)
    dono_id: str | None = Field(None, max_length=40)
    prazo: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    projetos: list[int] = Field(default_factory=list, max_length=40)


@rotas_tarefas.get("/tarefas-metas")
def metas():
    lista = db.consultar("SELECT * FROM tarefas_metas ORDER BY prazo NULLS LAST, id")
    for m in lista:
        ids = [int(x) for x in (m["projetos"] or [])] or [-1]
        r = db.um(f"SELECT COUNT(*) FILTER (WHERE pai_id IS NULL) AS total, COUNT(*) FILTER (WHERE pai_id IS NULL AND concluida) AS feitas "
                  f"FROM tarefas WHERE projeto_id IN ({','.join('?' * len(ids))})", tuple(ids)) or {}
        m["total"], m["feitas"] = int(r.get("total") or 0), int(r.get("feitas") or 0)
        m["progresso"] = round(m["feitas"] / m["total"] * 100) if m["total"] else 0
    return lista


@rotas_tarefas.post("/tarefas-metas")
def criar_meta(d: MetaIn):
    _editor()
    agora = db.agora()
    return db.um("INSERT INTO tarefas_metas (titulo, descricao, dono_id, prazo, projetos, criado_em, atualizado_em) VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, ?) RETURNING *",
                 (d.titulo.strip(), d.descricao, _pessoa_valida(d.dono_id), d.prazo or None, json.dumps(d.projetos), agora, agora))


@rotas_tarefas.put("/tarefas-metas/{mid}")
def editar_meta(mid: int, d: MetaIn):
    _editor()
    db.executar("UPDATE tarefas_metas SET titulo = ?, descricao = ?, dono_id = ?, prazo = ?, projetos = CAST(? AS jsonb), atualizado_em = ? WHERE id = ?",
                (d.titulo.strip(), d.descricao, _pessoa_valida(d.dono_id), d.prazo or None, json.dumps(d.projetos), db.agora(), mid))
    return {"ok": True}


@rotas_tarefas.delete("/tarefas-metas/{mid}")
def apagar_meta(mid: int):
    _editor()
    db.executar("DELETE FROM tarefas_metas WHERE id = ?", (mid,))
    return {"ok": True}


class MoverIn(BaseModel):
    itens: list[dict] = Field(min_length=1, max_length=500)   # [{id, secao_id, ordem}]


@rotas_tarefas.put("/tarefas-ordem")
def mover(d: MoverIn):
    _editor()
    for it in d.itens:
        try:
            tid, sid, ordem = int(it["id"]), (int(it["secao_id"]) if it.get("secao_id") is not None else None), float(it["ordem"])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(400, "Lista inválida.") from None
        t = db.um("SELECT secao_id, projeto_id FROM tarefas WHERE id = ?", (tid,))
        if not t:
            continue
        if sid is not None and not db.um("SELECT id FROM tarefas_secoes WHERE id = ? AND projeto_id = ?", (sid, t["projeto_id"])):
            raise HTTPException(400, "Seção de outro projeto.")
        db.executar("UPDATE tarefas SET secao_id = ?, ordem = ?, atualizado_em = CASE WHEN secao_id IS DISTINCT FROM ? THEN ? ELSE atualizado_em END WHERE id = ?",
                    (sid, ordem, sid, db.agora(), tid))
        if sid != t["secao_id"]:
            _ev(tid, "Moveu para " + (db.um("SELECT nome FROM tarefas_secoes WHERE id = ?", (sid,)) or {}).get("nome", "sem seção"))
    return {"ok": True}


@rotas_tarefas.delete("/tarefas/{tid}")
def apagar(tid: int):
    u = _editor()
    t = _da_tarefa(tid)
    if u.get("papel") not in ("dono", "admin") and str(t["criado_por"] or "") != str(u.get("id")):
        raise HTTPException(403, "Só quem criou a tarefa, o dono ou um administrador apaga.")
    db.executar("DELETE FROM tarefas WHERE id = ?", (tid,))
    return {"ok": True}


class ComentarioIn(BaseModel):
    texto: str = Field(min_length=1, max_length=5000)


@rotas_tarefas.post("/tarefas/{tid}/comentarios")
def comentar(tid: int, d: ComentarioIn):
    u = _editor()
    t = _da_tarefa(tid)
    db.executar("INSERT INTO tarefas_comentarios (tarefa_id, autor_id, autor_nome, tipo, texto, criado_em) VALUES (?, ?, ?, 'comentario', ?, ?)",
                (tid, u.get("id"), u.get("nome") or (u.get("email") or "").split("@")[0], d.texto.strip(), db.agora()))
    if t["responsavel_id"] and str(t["responsavel_id"]) != str(u.get("id")):
        _avisar(str(t["responsavel_id"]), t)
    return detalhe(tid)


# ---------------- GitHub Projects ----------------
class TokenIn(BaseModel):
    token: str = Field("", max_length=300)


@rotas_tarefas.put("/tarefas-github/token")
def github_token(d: TokenIn):
    if _u().get("papel") != "dono":
        raise HTTPException(403, "Só o dono conecta o GitHub.")
    t = d.token.strip()
    if not t:
        db.set_cfg("github_tarefas", {}); db.registrar("painel", "Tarefas: GitHub desconectado")
        return {"conectado": False}
    try:
        info = tarefas.conferir_token(t)
    except tarefas.ErroGithub as e:
        raise HTTPException(400, str(e)) from e
    db.set_cfg("github_tarefas", {"token": t, "login": info["login"], "escopos": info["escopos"]})
    db.registrar("painel", "Tarefas: GitHub conectado", detalhe=f"conta {info['login']}")
    return {"conectado": True, "login": info["login"]}


@rotas_tarefas.get("/tarefas-github/projetos")
def github_projetos(dono: str = ""):
    _gestor()
    if dono and not re.match(r"^[A-Za-z0-9-]{1,39}$", dono):
        raise HTTPException(400, "Nome de conta ou organização inválido.")
    try:
        return {"projetos": tarefas.projetos_github(dono)}
    except tarefas.ErroGithub as e:
        raise HTTPException(424, str(e)) from e


class LigarIn(BaseModel):
    dono: str = Field(pattern=r"^[A-Za-z0-9-]{1,39}$")
    numero: int = Field(ge=1, le=100000)


@rotas_tarefas.post("/tarefas/projetos/{pid}/github")
def github_ligar(pid: int, d: LigarIn):
    _gestor(); _projeto(pid)
    try:
        g = tarefas.ligar(pid, d.dono, d.numero)
    except tarefas.ErroGithub as e:
        raise HTTPException(424, str(e)) from e
    db.registrar("painel", f"Tarefas: projeto ligado ao GitHub ({g['titulo']})")
    return detalhe_projeto(pid)


@rotas_tarefas.delete("/tarefas/projetos/{pid}/github")
def github_desligar(pid: int):
    _gestor(); _projeto(pid)
    db.executar("UPDATE tarefas_projetos SET github = NULL WHERE id = ?", (pid,))
    return detalhe_projeto(pid)


@rotas_tarefas.post("/tarefas/projetos/{pid}/github/sincronizar")
def github_sincronizar(pid: int):
    u = _editor(); _projeto(pid)
    try:
        r = tarefas.sincronizar(pid, u)
    except tarefas.ErroGithub as e:
        raise HTTPException(424, str(e)) from e
    return {**r, **detalhe_projeto(pid)}
