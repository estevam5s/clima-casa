"""Rotas do assistente de IA: conversar, confirmar ação em lote e configuração (só o dono)."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db, ia
from ..seguranca import exigir_login

rotas_ia = APIRouter(prefix="/api/ia", dependencies=[Depends(exigir_login)])


class MensagemIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ConversaIn(BaseModel):
    mensagens: list[MensagemIn] = Field(min_length=1, max_length=60)
    conversa_id: int | None = None      # com id, a conversa fica salva (lista à esquerda em /ia)
    modelo: str | None = Field(None, max_length=80)
    leitura: bool = False               # modo plano (terminal): só consulta, nenhuma ferramenta que muda algo


class ConversaEditIn(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=120)
    fixada: bool | None = None


class ConfirmarIn(BaseModel):
    confirmacao: str = Field(min_length=8, max_length=64)


class ConfigIn(BaseModel):
    api_key: str | None = Field(None, max_length=200)
    modelo: str | None = Field(None, max_length=80)
    ativo: bool | None = None
    telegram: bool | None = None


def _erro(e: Exception):
    if isinstance(e, PermissionError):
        raise HTTPException(403 if "permissão" in str(e) or "não é sua" in str(e) else 429, str(e))
    raise HTTPException(424, str(e))


@rotas_ia.get("/estado")
def estado():
    return ia.estado_publico() | {"terminal": {"instalar": "curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash",
                                              "instalar_windows": "irm https://app.zynio.com.br/instalar-ia.ps1 | iex",
                                              "comando": "clima-ia", "login": "clima-ia login"}}


@rotas_ia.post("/conversar")
def conversar(d: ConversaIn):
    if d.mensagens[-1].role != "user":
        raise HTTPException(400, "A última mensagem precisa ser a sua pergunta.")
    try:
        r = ia.conversar([m.model_dump() for m in d.mensagens], "painel", modelo=d.modelo, leitura=d.leitura)
    except (PermissionError, RuntimeError) as e:
        _erro(e)
    # salva a conversa (nova ou existente) com a resposta; o título nasce da primeira pergunta
    uid = _uid()
    msgs = [m.model_dump() for m in d.mensagens] + [{"role": "assistant", "content": r["texto"], "acoes": r.get("acoes") or [], "modelo": r.get("modelo")}]
    agora = db.agora()
    if d.conversa_id and db.um("SELECT 1 AS ok FROM ia_conversas WHERE id = ? AND usuario_id = ?", (d.conversa_id, uid)):
        db.executar("UPDATE ia_conversas SET mensagens = CAST(? AS jsonb), atualizado_em = ? WHERE id = ?", (json.dumps(msgs[-80:], ensure_ascii=False), agora, d.conversa_id))
        r["conversa_id"] = d.conversa_id
    else:
        titulo = " ".join(d.mensagens[0].content.split())[:60] or "Nova conversa"
        r["conversa_id"] = db.um("INSERT INTO ia_conversas (usuario_id, titulo, mensagens, criado_em, atualizado_em) VALUES (?,?,CAST(? AS jsonb),?,?) RETURNING id",
                                 (uid, titulo, json.dumps(msgs[-80:], ensure_ascii=False), agora, agora))["id"]
        r["titulo"] = titulo
    return r


def _uid() -> str:
    from .. import acesso
    return str((acesso.atual.get() or {}).get("id") or "")


@rotas_ia.get("/conversas")
def conversas(q: str = ""):
    sql, p = "SELECT id, titulo, fixada, atualizado_em FROM ia_conversas WHERE usuario_id = ?", [_uid()]
    if q.strip():
        sql += " AND (titulo ILIKE ? OR mensagens::text ILIKE ?)"; p += [f"%{q.strip()[:80]}%"] * 2
    return db.consultar(sql + " ORDER BY fixada DESC, atualizado_em DESC LIMIT 200", tuple(p))


@rotas_ia.get("/conversas/{cid}")
def conversa(cid: int):
    c = db.um("SELECT id, titulo, fixada, mensagens, atualizado_em FROM ia_conversas WHERE id = ? AND usuario_id = ?", (cid, _uid()))
    if not c:
        raise HTTPException(404, "Conversa não encontrada.")
    return c


@rotas_ia.put("/conversas/{cid}")
def editar_conversa(cid: int, d: ConversaEditIn):
    conversa(cid)
    if d.titulo is not None:
        db.executar("UPDATE ia_conversas SET titulo = ? WHERE id = ?", (d.titulo.strip(), cid))
    if d.fixada is not None:
        db.executar("UPDATE ia_conversas SET fixada = ? WHERE id = ?", (d.fixada, cid))
    return conversa(cid)


@rotas_ia.delete("/conversas/{cid}")
def apagar_conversa(cid: int):
    conversa(cid)
    db.executar("DELETE FROM ia_conversas WHERE id = ?", (cid,))
    return {"ok": True}


@rotas_ia.post("/confirmar")
def confirmar(d: ConfirmarIn):
    try:
        return ia.confirmar(d.confirmacao, "ia")
    except (PermissionError, RuntimeError, ValueError) as e:
        _erro(e)


@rotas_ia.put("/config")
def config(d: ConfigIn, request: Request):
    u = getattr(request.state, "u", None) or {}
    if u.get("papel") != "dono":
        raise HTTPException(403, "Só o dono configura o assistente de IA.")
    try:
        ia.salvar(d.api_key, d.modelo, d.ativo, d.telegram)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ia.estado_publico()
