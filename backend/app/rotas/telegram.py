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


@rotas_telegram.get("/telegram/logs")
def logs_telegram(request: Request, dias: int = 7, pessoa: str = "", tipo: str = "", q: str = "", so_erros: bool = False, limite: int = 200):
    """Logs de uso do bot (dono/admin): volume por dia, por pessoa, comandos mais usados, erros e tempo de resposta."""
    u = request.state.u
    if u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só dono e administradores veem os logs do bot.")
    dias = max(1, min(90, dias))
    desde = db.agora() - dias * 86400
    w, p = " WHERE quando > ?", [desde]
    if pessoa:
        w += " AND (usuario_id::text = ? OR chat = ?)"; p += [pessoa[:60], pessoa[:60]]
    if tipo:
        w += " AND tipo = ?"; p.append(tipo[:30])
    if so_erros:
        w += " AND (tipo = 'erro' OR erro <> '')"
    if q.strip():
        w += " AND (texto ILIKE ? OR erro ILIKE ? OR usuario_nome ILIKE ?)"; p += [f"%{q.strip()[:60]}%"] * 3
    pt = tuple(p)
    resumo = db.um(f"SELECT count(*) AS total, count(DISTINCT chat) AS conversas, count(DISTINCT usuario_id) AS pessoas, "  # nosec B608
                   f"count(*) FILTER (WHERE tipo = 'erro') AS erros, count(*) FILTER (WHERE NOT ok AND tipo <> 'erro') AS negados, "
                   f"avg(ms) FILTER (WHERE ms IS NOT NULL) AS ms_medio, percentile_cont(0.95) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL) AS ms_p95 "
                   f"FROM telegram_eventos{w}", pt)
    por_dia = db.consultar(f"SELECT to_char(to_timestamp(quando - 10800) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia, count(*) AS total, "  # nosec B608
                           f"count(*) FILTER (WHERE tipo = 'erro') AS erros FROM telegram_eventos{w} GROUP BY 1 ORDER BY 1", pt)
    por_hora = db.consultar(f"SELECT EXTRACT(HOUR FROM to_timestamp(quando - 10800) AT TIME ZONE 'UTC')::int AS hora, count(*) AS n FROM telegram_eventos{w} GROUP BY 1 ORDER BY 1", pt)  # nosec B608
    por_pessoa = db.consultar(f"SELECT COALESCE(usuario_id::text, chat) AS id, max(COALESCE(NULLIF(usuario_nome, ''), NULLIF(username, ''), chat)) AS nome, count(*) AS total, "  # nosec B608
                              f"count(*) FILTER (WHERE tipo = 'comando') AS comandos, count(*) FILTER (WHERE tipo = 'clique') AS cliques, count(*) FILTER (WHERE tipo = 'ia') AS ia, "
                              f"count(*) FILTER (WHERE tipo = 'erro') AS erros, count(*) FILTER (WHERE NOT ok) AS falhas, avg(ms) FILTER (WHERE ms IS NOT NULL) AS ms_medio, max(quando) AS ultimo "
                              f"FROM telegram_eventos{w} GROUP BY 1 ORDER BY 3 DESC LIMIT 50", pt)
    comandos = db.consultar(f"SELECT split_part(split_part(texto, ' ', 1), '@', 1) AS comando, count(*) AS n, count(*) FILTER (WHERE NOT ok) AS falhas, avg(ms) AS ms "  # nosec B608
                            f"FROM telegram_eventos{w} AND tipo = 'comando' GROUP BY 1 ORDER BY 2 DESC LIMIT 25", pt)
    cliques = db.consultar(f"SELECT split_part(texto, ':', 1) || ':' || split_part(texto, ':', 2) AS botao, count(*) AS n FROM telegram_eventos{w} AND tipo = 'clique' GROUP BY 1 ORDER BY 2 DESC LIMIT 15", pt)  # nosec B608
    por_tipo = db.consultar(f"SELECT tipo, count(*) AS n FROM telegram_eventos{w} GROUP BY 1 ORDER BY 2 DESC", pt)  # nosec B608
    erros = db.consultar(f"SELECT id, quando, usuario_nome, username, texto, erro, ms FROM telegram_eventos{w} AND (tipo = 'erro' OR erro <> '') ORDER BY id DESC LIMIT 40", pt)  # nosec B608
    lentos = db.consultar(f"SELECT quando, usuario_nome, texto, ms FROM telegram_eventos{w} AND ms IS NOT NULL ORDER BY ms DESC LIMIT 10", pt)  # nosec B608
    eventos = db.consultar(f"SELECT id, quando, chat, usuario_id::text AS usuario_id, usuario_nome, username, tipo, texto, ok, ms, erro FROM telegram_eventos{w} "  # nosec B608
                           f"ORDER BY id DESC LIMIT ?", (*pt, max(10, min(500, limite))))
    pessoas = db.consultar("SELECT DISTINCT COALESCE(usuario_id::text, chat) AS id, COALESCE(NULLIF(usuario_nome, ''), NULLIF(username, ''), chat) AS nome FROM telegram_eventos WHERE quando > ? ORDER BY 2", (desde,))
    r = {k: (float(v) if v is not None and k.startswith("ms") else v) for k, v in (resumo or {}).items()}
    return {"dias": dias, "resumo": r, "por_dia": por_dia, "por_hora": por_hora, "por_pessoa": por_pessoa, "comandos": comandos, "cliques": cliques,
            "por_tipo": por_tipo, "erros": erros, "lentos": lentos, "eventos": eventos, "pessoas": pessoas}


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
