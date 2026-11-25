"""Rotas da área de Bugs. Ver app/bugs.py. Qualquer pessoa logada relata e vê os seus; quem gerencia o sistema
(configuracoes.gerenciar) vê todos, muda o estado, apaga e manda procurar."""
from __future__ import annotations

import json
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import acesso, bugs, db
from ..seguranca import exigir_login

rotas_bugs = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])


def _u() -> dict:
    return acesso.atual.get() or {}


def _gestor() -> bool:
    return acesso.pode("configuracoes.gerenciar")


def _linha(b: dict) -> dict:
    b = dict(b)
    if isinstance(b.get("contexto"), str):
        b["contexto"] = json.loads(b["contexto"] or "{}")
    return b


@rotas_bugs.get("/bugs")
def listar():
    w, p = ("", ()) if _gestor() else (" WHERE autor_id = ?", (_u().get("id"),))
    itens = [_linha(b) for b in db.consultar(f"SELECT * FROM bugs{w} ORDER BY (estado IN ('aberto','analisando')) DESC, atualizado_em DESC LIMIT 400", p)]
    return {"itens": itens, "gestor": _gestor(), "ultima_varredura": db.cfg("bugs_ultima_varredura"),
            "autoteste": db.cfg("bugs_autoteste") if _gestor() else None,
            "abertos": sum(1 for b in itens if b["estado"] in ("aberto", "analisando"))}


class BugIn(BaseModel):
    titulo: str = Field(min_length=4, max_length=160)
    descricao: str = Field(min_length=4, max_length=4000)
    passos: str = Field("", max_length=3000)
    pagina: str = Field("", max_length=200)
    gravidade: str = Field("media", pattern="^(baixa|media|alta|critica)$")
    navegador: str = Field("", max_length=300)
    erros: list[str] = Field([], max_length=10)


@rotas_bugs.post("/bugs")
def relatar(d: BugIn):
    u = _u()
    recentes = db.um("SELECT count(*) n FROM bugs WHERE autor_id = ? AND criado_em > ?", (u.get("id"), db.agora() - 3600))["n"]
    if recentes >= 10:
        raise HTTPException(429, "Muitos relatos na última hora. Tente de novo mais tarde.")
    ctx = {"navegador": d.navegador, "erros": [e[:300] for e in d.erros]}
    b = {"titulo": d.titulo.strip(), "descricao": d.descricao.strip(), "passos": d.passos.strip(), "pagina": d.pagina, "gravidade": d.gravidade,
         "origem": "usuario", "autor_nome": u.get("nome") or u.get("email"), "contexto": ctx, "ocorrencias": 1}
    b["sugestao"] = bugs.sugestao_para(f"{b['titulo']} {b['descricao']} {' '.join(d.erros)}")
    b["prompt"] = bugs.montar_prompt(b)
    r = db.um("INSERT INTO bugs (titulo, descricao, passos, pagina, gravidade, origem, autor_id, autor_nome, contexto, sugestao, prompt, criado_em, atualizado_em) "
              "VALUES (?,?,?,?,?,'usuario',?,?,CAST(? AS jsonb),?,?,?,?) RETURNING id",
              (b["titulo"], b["descricao"], b["passos"], b["pagina"], d.gravidade, u.get("id"), b["autor_nome"], json.dumps(ctx), b["sugestao"], b["prompt"], db.agora(), db.agora()))
    db.registrar("painel", "Bug relatado", detalhe=b["titulo"][:120])
    _hist(r["id"], "criado", f"Relatado por {b['autor_nome']}")
    from .. import notificacoes
    notificacoes.notificar(f"bug:{r['id']}", "sistema", "alta" if d.gravidade in ("alta", "critica") else "media", f"Bug relatado: {b['titulo'][:80]}",
                           f"por {b['autor_nome']}", link="/bugs")
    return {"id": r["id"]}


class ErroClienteIn(BaseModel):
    mensagem: str = Field(min_length=1, max_length=500)
    pilha: str = Field("", max_length=3000)
    pagina: str = Field("", max_length=200)
    navegador: str = Field("", max_length=300)


@rotas_bugs.post("/bugs/erro-cliente")
def erro_cliente(d: ErroClienteIn):
    """Erro de JavaScript na tela (enviado pelo próprio app, com limite): vira bug automático, sem duplicar."""
    u = _u()
    if db.um("SELECT count(*) n FROM bugs WHERE origem = 'sistema' AND categoria = 'tela' AND atualizado_em > ?", (db.agora() - 3600,))["n"] >= 60:
        return {"ok": False}
    msg = re.sub(r"\b[0-9a-f]{8,}\b|\d+", "N", d.mensagem)[:160]
    pagina = re.sub(r"/\d+(?=/|$)", "/{id}", d.pagina.split("?")[0])
    bugs.registrar_auto(bugs._chave("tela", pagina, msg), f"Erro na tela {pagina or '/'}: {d.mensagem[:100]}", d.mensagem, pagina=pagina, gravidade="media",
                        categoria="tela", contexto={"detalhe": d.pilha, "navegador": d.navegador, "erros": [f"{u.get('nome') or u.get('email') or ''}: {d.mensagem[:200]}"]})
    return {"ok": True}


class EstadoIn(BaseModel):
    estado: str = Field(pattern="^(aberto|analisando|corrigido|descartado)$")


def _hist(bid: int, tipo: str, texto: str):
    u = _u()
    db.executar("INSERT INTO bugs_historico (bug_id, quando, autor_id, autor_nome, tipo, texto) VALUES (?,?,?,?,?,?)",
                (bid, db.agora(), u.get("id"), (u.get("nome") or u.get("email") or "Sistema")[:80], tipo, (texto or "")[:2000]))


def _bug_visivel(bid: int) -> dict:
    b = db.um("SELECT * FROM bugs WHERE id = ?", (bid,))
    if not b or (not _gestor() and str(b.get("autor_id")) != str(_u().get("id"))):
        raise HTTPException(404, "Bug não encontrado.")
    return b


ROTULO_ESTADO = {"aberto": "Aberto", "analisando": "Analisando", "corrigido": "Corrigido", "descartado": "Descartado"}


def _mudar_estado(bid: int, estado: str, titulo: str = ""):
    agora = db.agora()
    db.executar("UPDATE bugs SET estado = ?, atualizado_em = ?, corrigido_em = CASE WHEN ? = 'corrigido' THEN ? ELSE corrigido_em END WHERE id = ?",
                (estado, agora, estado, agora, bid))
    _hist(bid, "estado", ROTULO_ESTADO[estado])
    db.registrar("painel", f"Bug {estado}", detalhe=(titulo or f"#{bid}")[:120])


@rotas_bugs.put("/bugs/{bid}")
def mudar_estado(bid: int, d: EstadoIn):
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema muda o estado dos bugs.")
    b = db.um("SELECT titulo FROM bugs WHERE id = ?", (bid,))
    if not b:
        raise HTTPException(404, "Bug não encontrado.")
    _mudar_estado(bid, d.estado, b["titulo"])
    return {"ok": True}


class EditarIn(BaseModel):
    gravidade: str | None = Field(None, pattern="^(baixa|media|alta|critica)$")
    responsavel_id: str | None = Field(None, max_length=60)
    etiquetas: list[str] | None = Field(None, max_length=12)
    prazo: str | None = Field(None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    correcao: str | None = Field(None, max_length=3000)
    titulo: str | None = Field(None, min_length=4, max_length=160)


@rotas_bugs.put("/bugs/{bid}/editar")
def editar(bid: int, d: EditarIn):
    """Gravidade, responsável, etiquetas, prazo, como foi corrigido e título. Cada mudança entra no histórico."""
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema edita os bugs.")
    b = _bug_visivel(bid)
    sets, ps = [], []
    if d.gravidade and d.gravidade != b["gravidade"]:
        sets.append("gravidade = ?"); ps.append(d.gravidade); _hist(bid, "gravidade", f"{b['gravidade']} → {d.gravidade}")
    if d.responsavel_id is not None and d.responsavel_id != (b.get("responsavel_id") or ""):
        r = db.um("SELECT id::text AS id, COALESCE(NULLIF(nome, ''), email) AS nome FROM usuarios WHERE id::text = ?", (d.responsavel_id,)) if d.responsavel_id else None
        if d.responsavel_id and not r:
            raise HTTPException(400, "Pessoa não encontrada.")
        sets += ["responsavel_id = ?", "responsavel_nome = ?"]; ps += [r["id"] if r else None, r["nome"] if r else ""]
        _hist(bid, "responsavel", f"Responsável: {r['nome']}" if r else "Sem responsável")
        if r and r["id"] != str(_u().get("id")):
            from .. import notificacoes
            notificacoes.notificar(f"bug_resp:{bid}:{r['id']}", "sistema", "media", f"Bug com você: {b['titulo'][:80]}", f"por {_u().get('nome') or _u().get('email')}", f"/bugs?bug={bid}")
    if d.etiquetas is not None:
        et = sorted({e.strip().lower()[:24] for e in d.etiquetas if e.strip()})
        sets.append("etiquetas = CAST(? AS jsonb)"); ps.append(json.dumps(et)); _hist(bid, "etiquetas", ", ".join(et) or "sem etiquetas")
    if d.prazo is not None and d.prazo != (b.get("prazo") or ""):
        sets.append("prazo = ?"); ps.append(d.prazo or None); _hist(bid, "prazo", d.prazo or "sem prazo")
    if d.correcao is not None and d.correcao.strip() != (b.get("correcao") or ""):
        sets.append("correcao = ?"); ps.append(d.correcao.strip()); _hist(bid, "correcao", d.correcao.strip())
    if d.titulo and d.titulo.strip() != b["titulo"]:
        sets.append("titulo = ?"); ps.append(d.titulo.strip()); _hist(bid, "titulo", d.titulo.strip())
    if sets:
        db.executar(f"UPDATE bugs SET {', '.join(sets)}, atualizado_em = ? WHERE id = ?", (*ps, db.agora(), bid))  # nosec B608 (colunas fixas)
    return _linha(db.um("SELECT * FROM bugs WHERE id = ?", (bid,)))


class ComentarioIn(BaseModel):
    texto: str = Field(min_length=1, max_length=2000)


@rotas_bugs.get("/bugs/{bid}/historico")
def historico(bid: int):
    _bug_visivel(bid)
    return db.consultar("SELECT id, quando, autor_nome, tipo, texto FROM bugs_historico WHERE bug_id = ? ORDER BY quando, id", (bid,))


@rotas_bugs.post("/bugs/{bid}/comentar")
def comentar(bid: int, d: ComentarioIn):
    b = _bug_visivel(bid)
    _hist(bid, "comentario", d.texto.strip())
    db.executar("UPDATE bugs SET atualizado_em = ? WHERE id = ?", (db.agora(), bid))
    if b.get("autor_id") and str(b["autor_id"]) != str(_u().get("id")):
        from .. import notificacoes
        notificacoes.notificar(f"bug_coment:{bid}:{db.agora()}", "sistema", "baixa", f"Comentário no bug: {b['titulo'][:80]}", d.texto[:200], f"/bugs?bug={bid}")
    return historico(bid)


class LoteIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    acao: str = Field(pattern="^(aberto|analisando|corrigido|descartado|apagar|baixa|media|alta|critica)$")


@rotas_bugs.post("/bugs/lote")
def lote(d: LoteIn):
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema mexe em vários bugs.")
    n = 0
    for bid in d.ids:
        b = db.um("SELECT id, titulo, gravidade FROM bugs WHERE id = ?", (bid,))
        if not b:
            continue
        if d.acao == "apagar":
            db.executar("DELETE FROM bugs WHERE id = ?", (bid,)); db.executar("DELETE FROM bugs_historico WHERE bug_id = ?", (bid,))
        elif d.acao in ROTULO_ESTADO:
            _mudar_estado(bid, d.acao, b["titulo"])
        elif d.acao != b["gravidade"]:
            db.executar("UPDATE bugs SET gravidade = ?, atualizado_em = ? WHERE id = ?", (d.acao, db.agora(), bid)); _hist(bid, "gravidade", f"{b['gravidade']} → {d.acao}")
        n += 1
    db.registrar("painel", f"Bugs em lote: {d.acao}", detalhe=f"{n} bug(s)")
    return {"ok": True, "feitos": n}


class DuplicadoIn(BaseModel):
    de: int


@rotas_bugs.post("/bugs/{bid}/duplicado")
def marcar_duplicado(bid: int, d: DuplicadoIn):
    """Este bug é cópia de outro: soma as ocorrências no original e descarta este."""
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema junta bugs.")
    if bid == d.de:
        raise HTTPException(400, "Escolha outro bug.")
    b, orig = _bug_visivel(bid), _bug_visivel(d.de)
    db.executar("UPDATE bugs SET ocorrencias = ocorrencias + ?, atualizado_em = ? WHERE id = ?", (b["ocorrencias"] or 1, db.agora(), d.de))
    db.executar("UPDATE bugs SET estado = 'descartado', duplicado_de = ?, atualizado_em = ? WHERE id = ?", (d.de, db.agora(), bid))
    _hist(bid, "duplicado", f"Duplicado de #{d.de} {orig['titulo'][:80]}")
    _hist(d.de, "duplicado", f"Recebeu #{bid} ({b['ocorrencias']} ocorrência(s)): {b['titulo'][:80]}")
    return {"ok": True}


@rotas_bugs.post("/bugs/{bid}/tarefa")
def criar_tarefa(bid: int):
    """Cria uma tarefa no projeto "Bugs" das Tarefas (cria o projeto se não existir) e liga as duas."""
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema cria tarefa a partir de um bug.")
    b = _bug_visivel(bid)
    if b.get("tarefa_id") and db.um("SELECT 1 FROM tarefas WHERE id = ?", (b["tarefa_id"],)):
        return {"tarefa_id": b["tarefa_id"], "ja_existia": True}
    from .. import tarefas
    u = _u()
    pid = tarefas.projeto_por_nome("Bugs", u, cor="#dc2626", descricao="Correções vindas da tela Bugs.")
    sec = db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem LIMIT 1", (pid,))
    prio = {"critica": "urgente", "alta": "alta", "media": "media", "baixa": "baixa"}.get(b["gravidade"], "media")
    desc = f"Bug #{bid} ({b['gravidade']}, {b['ocorrencias']}×) em {b['pagina'] or 'sem tela'}.\n\n{b['descricao'][:2000]}\n\nSugestão: {b['sugestao'] or '-'}\n\nhttps://app.zynio.com.br/bugs?bug={bid}"
    t = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, prioridade, prazo, responsavel_id, ordem, criado_por, criado_em, atualizado_em) "
              "VALUES (?,?,?,?,?,?,CAST(? AS uuid),?,?,?,?) RETURNING id",
              (pid, (sec or {}).get("id"), f"Corrigir: {b['titulo'][:280]}", desc, prio, b.get("prazo"), b.get("responsavel_id"), time.time(), u.get("id"), db.agora(), db.agora()))
    db.executar("UPDATE bugs SET tarefa_id = ?, atualizado_em = ? WHERE id = ?", (t["id"], db.agora(), bid))
    _hist(bid, "tarefa", f"Tarefa #{t['id']} criada em Tarefas → Bugs")
    tarefas.evento(t["id"], u, f"Criou a tarefa a partir do bug #{bid}")
    return {"tarefa_id": t["id"], "projeto_id": pid}


@rotas_bugs.get("/bugs/estatisticas")
def estatisticas(dias: int = 30):
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema vê as estatísticas.")
    dias = max(7, min(365, dias))
    desde = db.agora() - dias * 86400
    criados = db.consultar("SELECT to_char(to_timestamp(criado_em - 10800) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia, count(*) AS n FROM bugs WHERE criado_em > ? GROUP BY 1 ORDER BY 1", (desde,))
    corrigidos = db.consultar("SELECT to_char(to_timestamp(corrigido_em - 10800) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia, count(*) AS n FROM bugs WHERE corrigido_em > ? GROUP BY 1 ORDER BY 1", (desde,))
    tempo = db.um("SELECT avg(corrigido_em - criado_em) AS media, percentile_cont(0.5) WITHIN GROUP (ORDER BY corrigido_em - criado_em) AS mediana, count(*) AS n "
                  "FROM bugs WHERE corrigido_em IS NOT NULL AND corrigido_em > ?", (desde,))
    por = lambda campo: db.consultar(f"SELECT COALESCE(NULLIF({campo}, ''), '-') AS k, count(*) FILTER (WHERE estado IN ('aberto', 'analisando')) AS abertos, count(*) AS total "  # noqa: E731  # nosec B608
                                     f"FROM bugs GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 15")
    recorrentes = db.consultar("SELECT id, titulo, ocorrencias, estado, gravidade, pagina FROM bugs ORDER BY ocorrencias DESC LIMIT 10")
    reabertos = db.um("SELECT count(DISTINCT bug_id) AS n FROM bugs_historico WHERE tipo = 'estado' AND texto = 'Aberto' AND quando > ?", (desde,))
    atrasados = db.consultar("SELECT id, titulo, prazo, responsavel_nome FROM bugs WHERE estado IN ('aberto', 'analisando') AND prazo IS NOT NULL AND prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') ORDER BY prazo")
    return {"dias": dias, "criados": criados, "corrigidos": corrigidos,
            "tempo_medio_h": round(float(tempo["media"]) / 3600, 1) if tempo and tempo["media"] else None,
            "tempo_mediana_h": round(float(tempo["mediana"]) / 3600, 1) if tempo and tempo["mediana"] else None, "corrigidos_n": (tempo or {}).get("n", 0),
            "por_gravidade": por("gravidade"), "por_pagina": por("pagina"), "por_categoria": por("categoria"), "por_responsavel": por("responsavel_nome"),
            "por_origem": por("origem"), "recorrentes": recorrentes, "reabertos": (reabertos or {}).get("n", 0), "atrasados": atrasados}


@rotas_bugs.get("/bugs/pessoas")
def pessoas_bugs():
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema atribui bugs.")
    return db.consultar("SELECT id::text AS id, COALESCE(NULLIF(nome, ''), email) AS nome FROM usuarios WHERE ativo ORDER BY 2")


@rotas_bugs.delete("/bugs/{bid}")
def apagar(bid: int):
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema apaga bugs.")
    db.executar("DELETE FROM bugs WHERE id = ?", (bid,))
    return {"ok": True}


@rotas_bugs.post("/bugs/varrer")
def varrer():
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema manda procurar bugs.")
    return bugs.varrer()


@rotas_bugs.post("/bugs/autoteste")
def autoteste():
    """Testa os cadastros de verdade numa transação desfeita (nada fica gravado)."""
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema roda o autoteste.")
    passos = bugs.autoteste()
    for p in passos:
        if not p["ok"]:
            bugs.registrar_auto(bugs._chave("autoteste", p["nome"]), f"Autoteste falhou: {p['nome']}", p["detalhe"], gravidade="alta",
                                categoria="cadastro", contexto={"erros": [p["detalhe"][:200]]})
    db.registrar("painel", "Autoteste dos cadastros", ok=all(p["ok"] for p in passos), detalhe=f"{sum(p['ok'] for p in passos)}/{len(passos)} ok")
    return {"em": db.agora(), "passos": passos}
