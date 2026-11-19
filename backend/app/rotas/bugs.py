"""Rotas da área de Bugs. Ver app/bugs.py. Qualquer pessoa logada relata e vê os seus; quem gerencia o sistema
(configuracoes.gerenciar) vê todos, muda o estado, apaga e manda procurar."""
from __future__ import annotations

import json
import re

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


@rotas_bugs.put("/bugs/{bid}")
def mudar_estado(bid: int, d: EstadoIn):
    if not _gestor():
        raise HTTPException(403, "Só quem gerencia o sistema muda o estado dos bugs.")
    b = db.um("SELECT titulo FROM bugs WHERE id = ?", (bid,))
    if not b:
        raise HTTPException(404, "Bug não encontrado.")
    db.executar("UPDATE bugs SET estado = ?, atualizado_em = ? WHERE id = ?", (d.estado, db.agora(), bid))
    db.registrar("painel", f"Bug {d.estado}", detalhe=b["titulo"][:120])
    return {"ok": True}


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
