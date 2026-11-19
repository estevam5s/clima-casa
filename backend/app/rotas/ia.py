"""Rotas do assistente de IA: conversar, confirmar ação em lote e configuração (só o dono)."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db, ia
from ..seguranca import exigir_login

rotas_ia = APIRouter(prefix="/api/ia", dependencies=[Depends(exigir_login)])


class MensagemIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ConversaIn(BaseModel):
    mensagens: list[MensagemIn] = Field(min_length=1, max_length=40)


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
    return ia.estado_publico() | {"terminal": {"instalar": "./agente-ia/instalar.sh", "comando": "clima-ia"}}


@rotas_ia.post("/conversar")
def conversar(d: ConversaIn):
    if d.mensagens[-1].role != "user":
        raise HTTPException(400, "A última mensagem precisa ser a sua pergunta.")
    try:
        return ia.conversar([m.model_dump() for m in d.mensagens], "painel")
    except (PermissionError, RuntimeError) as e:
        _erro(e)


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
