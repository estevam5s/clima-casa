"""Rotas do bot do Telegram. Webhook público (protegido por segredo + IPs do Telegram) e rotas do painel.
Ver app/telegram.py (segurança e comandos)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import acesso, db, telegram
from ..seguranca import exigir_login

publico_telegram = APIRouter(prefix="/api")
rotas_telegram = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])


@publico_telegram.post("/telegram/webhook")
async def webhook(request: Request):
    import asyncio
    from .. import firewall
    ip = firewall.ip_do_pedido(request)
    if not telegram.origem_valida(ip, request.headers.get("x-telegram-bot-api-secret-token", "")):
        firewall.registrar(ip, "telegram_webhook_negado", "/api/telegram/webhook", "segredo ou IP inválido")
        raise HTTPException(403, "Proibido.")
    corpo = await request.body()
    if len(corpo) > 64_000:
        raise HTTPException(413, "Grande demais.")
    try:
        upd = await request.json()
    except ValueError:
        raise HTTPException(400, "JSON inválido.")
    await asyncio.to_thread(telegram.processar, upd)
    return {"ok": True}   # sempre 200 para o Telegram não repetir a mesma atualização


def _u() -> dict:
    return acesso.atual.get() or {}


@rotas_telegram.get("/telegram/estado")
def estado():
    u = _u()
    return telegram.estado_publico(u.get("id"), todos=u.get("papel") in ("dono", "admin"))


@rotas_telegram.post("/telegram/codigo")
def codigo():
    if not telegram.cfg().get("token"):
        raise HTTPException(409, "O bot ainda não foi configurado pelo dono.")
    r = telegram.gerar_codigo(_u()["id"])
    db.registrar("painel", "Código de vínculo do Telegram gerado", detalhe=_u().get("email", ""))
    return r


@rotas_telegram.delete("/telegram/vinculo/{chat}")
def desvincular(chat: str):
    u = _u()
    v = (telegram.cfg().get("vinculos") or {}).get(chat)
    if not v:
        raise HTTPException(404, "Vínculo não encontrado.")
    if v.get("usuario_id") != u.get("id") and u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono do vínculo ou um administrador desvincula.")
    telegram.desvincular(chat, "painel")
    try:
        telegram.chamar("sendMessage", chat_id=chat, text="Este Telegram foi desvinculado do Clima Escritório pelo painel.")
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


class ConfigIn(BaseModel):
    token: str = Field(min_length=30, max_length=80, pattern=r"^\d{6,12}:[A-Za-z0-9_-]{30,60}$")


@rotas_telegram.post("/telegram/configurar")
def configurar(d: ConfigIn):
    if _u().get("papel") != "dono":
        raise HTTPException(403, "Só o dono configura o bot do Telegram.")
    try:
        return telegram.configurar(d.token)
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e
