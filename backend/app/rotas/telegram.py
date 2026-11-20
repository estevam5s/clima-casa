"""Rotas do bot do Telegram. Webhook público (protegido por segredo + IPs do Telegram) e rotas do painel.
Ver app/telegram.py (segurança e comandos)."""
from __future__ import annotations

import time

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
    await asyncio.to_thread(telegram.processar, upd, ip)
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


# ---------------- PIN dos comandos críticos (cada pessoa define o seu) ----------------
class PinIn(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$")


_PINS_FRACOS = {"000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777", "888888", "999999",
                "123456", "654321", "121212", "112233", "123123", "102030", "010203", "147258", "159753", "696969"}


@rotas_telegram.get("/telegram/pin")
def pin_estado():
    return {"definido": telegram.tem_pin(_u()["id"]), "criticos": sorted(telegram.CRITICOS), "valido_min": telegram.PIN_MIN}


@rotas_telegram.put("/telegram/pin")
def pin_definir(d: PinIn):
    if d.pin in _PINS_FRACOS or len(set(d.pin)) <= 2:
        raise HTTPException(422, "PIN fácil demais. Use 6 dígitos sem sequência nem repetição.")
    telegram.definir_pin(_u()["id"], d.pin)
    db.registrar("painel", "PIN do Telegram definido", detalhe=_u().get("nome") or _u().get("email") or "")
    return pin_estado()


@rotas_telegram.delete("/telegram/pin")
def pin_apagar():
    telegram.definir_pin(_u()["id"], None)
    db.registrar("painel", "PIN do Telegram removido", detalhe=_u().get("nome") or _u().get("email") or "")
    return pin_estado()


# ---------------- Segurança → Telegram: auditoria, conversas, bloqueios ----------------
@rotas_telegram.get("/seguranca/telegram")
def seguranca_telegram(horas: int = 168):
    horas = max(1, min(24 * 90, horas))
    desde = db.agora() - horas * 3600
    ev = db.consultar("SELECT quando, chat, tg_id, username, usuario_nome, tipo, texto, ok, ip FROM telegram_eventos WHERE quando > ? ORDER BY quando DESC LIMIT 400", (desde,))
    por_tipo = {r["tipo"]: r["n"] for r in db.consultar("SELECT tipo, count(*) n FROM telegram_eventos WHERE quando > ? GROUP BY tipo", (desde,))}
    ips = db.consultar("SELECT ip, count(*) n, max(quando) ultimo FROM telegram_eventos WHERE quando > ? AND ip <> '' GROUP BY ip ORDER BY n DESC LIMIT 30", (desde,))
    chats = db.consultar("SELECT chat, max(username) username, max(usuario_nome) usuario, count(*) n, count(*) FILTER (WHERE NOT ok) negados, max(quando) ultimo "
                         "FROM telegram_eventos WHERE quando > ? GROUP BY chat ORDER BY ultimo DESC LIMIT 60", (desde,))
    import ipaddress
    for r in ips:   # confere se o IP é mesmo da rede do Telegram (o webhook já recusa os outros)
        try:
            r["telegram"] = any(ipaddress.ip_address(r["ip"]) in n for n in telegram.REDES_TELEGRAM)
        except ValueError:
            r["telegram"] = False
    e = telegram._estado()
    agora = time.time()
    bloqueios = [{"chat": c, "ate": int(v.get("ate", 0)), "motivo": v.get("motivo") or ("vínculo" if v.get("falhas") else ""), "falhas": v.get("falhas", 0)}
                 for c, v in e["bloqueios"].items() if v.get("ate", 0) > agora]
    c = telegram.cfg()
    pins = db.cfg("telegram_pins") or {}
    vinc = [{"chat": k, "nome": v.get("nome"), "telegram": v.get("telegram"), "desde": v.get("desde"), "tg_id": bool(v.get("tg_id")),
             "ultimo": int(e["ultimo"].get(k, 0)) or v.get("desde"), "pin": str(v.get("usuario_id")) in pins} for k, v in (c.get("vinculos") or {}).items()]
    return {"horas": horas, "eventos": ev, "por_tipo": por_tipo, "ips": ips, "chats": chats, "bloqueios": bloqueios, "vinculos": vinc,
            "regras": {"limite_min": telegram.LIMITE_MIN, "falhas_bloqueio": telegram.FALHAS_BLOQUEIO, "pin_erros": telegram.PIN_ERROS,
                       "pin_min": telegram.PIN_MIN, "vinculo_dias": telegram.VINCULO_DIAS, "criticos": sorted(telegram.CRITICOS),
                       "redes": [str(n) for n in telegram.REDES_TELEGRAM]}}


class ChatIn(BaseModel):
    chat: str = Field(pattern=r"^-?\d{1,20}$")
    horas: int = Field(24, ge=1, le=24 * 365)


@rotas_telegram.post("/seguranca/telegram/bloquear")
def seguranca_telegram_bloquear(d: ChatIn):
    e = telegram._estado()
    e["bloqueios"][d.chat] = {"falhas": 0, "em": time.time(), "ate": time.time() + d.horas * 3600, "motivo": "manual"}
    telegram._salvar_estado(e)
    telegram.auditar(d.chat, None, "bloqueado", f"bloqueado no painel por {d.horas} h", False, _u())
    db.registrar("painel", "Conversa do Telegram bloqueada", detalhe=f"{d.chat} · {d.horas} h")
    return seguranca_telegram()


@rotas_telegram.post("/seguranca/telegram/desbloquear")
def seguranca_telegram_desbloquear(d: ChatIn):
    e = telegram._estado()
    e["bloqueios"].pop(d.chat, None); e["pin_erros"].pop(d.chat, None); e["floods"].pop(d.chat, None)
    telegram._salvar_estado(e)
    db.registrar("painel", "Conversa do Telegram desbloqueada", detalhe=d.chat)
    return seguranca_telegram()
