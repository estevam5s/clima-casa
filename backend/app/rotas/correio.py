"""Rotas de E-mail (Resend + Cloudflare). Ver: dono e admin. Chaves, domínio e automáticos: só o dono.
O webhook do Resend é público, mas só aceita pedidos com a assinatura Svix válida."""
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .. import correio, db
from ..seguranca import exigir_login

rotas_email = APIRouter(prefix="/api/email", dependencies=[Depends(exigir_login)])
publico_email = APIRouter(prefix="/api/email")


def _papel(*ok):
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in ok:
        raise HTTPException(403, "Só o dono" + (" e os administradores" if "admin" in ok else "") + " mexem nos e-mails.")
    return u


@rotas_email.get("/estado")
def estado():
    _papel("dono", "admin")
    c = correio.cfg()
    agora = db.agora()
    stats = db.um("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE estado IN ('entregue','aberto','clicado')) AS entregues, "
                  "COUNT(*) FILTER (WHERE estado IN ('aberto','clicado')) AS abertos, COUNT(*) FILTER (WHERE estado IN ('devolvido','falhou','marcado como spam')) AS problemas "
                  "FROM email_envios WHERE criado_em > ?", (agora - 30 * 86400,)) or {}
    dom = c.get("dominio") or {}
    return {
        "chave_envio": bool(c.get("api_key")), "chave_total": bool(c.get("api_key_total")), "cloudflare": bool(c.get("cloudflare_token")),
        "webhook": bool(c.get("webhook_secret")), "webhook_url": "https://app.zynio.com.br/api/email/webhook",
        "dominio": {"nome": correio.DOMINIO, "status": dom.get("status") or "não cadastrado", "regiao": dom.get("regiao"), "registros": dom.get("registros", []), "lido_em": dom.get("lido_em")},
        "dns": correio.dns_publico(), "remetente": correio.remetente(), "remetente_nome": c.get("remetente_nome") or correio.marca()["nome"],
        "remetente_local": c.get("remetente_local") or "nao-responda", "responder_para": c.get("responder_para") or "",
        "automaticos": {**correio.AUTOMATICOS, **(c.get("automaticos") or {})}, "stats_30d": {k: int(v or 0) for k, v in stats.items()},
    }


class ConfigIn(BaseModel):
    remetente_nome: str | None = Field(None, max_length=60)
    remetente_local: str | None = Field(None, max_length=40, pattern=r"^[a-z0-9._-]+$")
    responder_para: str | None = Field(None, max_length=120)
    automaticos: dict[str, bool] | None = None
    api_key_total: str | None = Field(None, max_length=100)
    cloudflare_token: str | None = Field(None, max_length=100)
    webhook_secret: str | None = Field(None, max_length=120)
    api_key: str | None = Field(None, max_length=100)


@rotas_email.put("/config")
def salvar_config(d: ConfigIn):
    _papel("dono")
    c = correio.cfg()
    if d.responder_para and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", d.responder_para):
        raise HTTPException(422, "E-mail de resposta inválido.")
    for k in ("remetente_nome", "remetente_local", "responder_para"):
        if getattr(d, k) is not None:
            c[k] = getattr(d, k).strip()
    if d.automaticos is not None:
        c["automaticos"] = {k: bool(v) for k, v in d.automaticos.items() if k in correio.AUTOMATICOS}
    # chaves: vazio = mantém; "-" = apaga
    for k, padrao in (("api_key", r"^re_[A-Za-z0-9_]{10,}$"), ("api_key_total", r"^re_[A-Za-z0-9_]{10,}$"), ("cloudflare_token", r"^[A-Za-z0-9_-]{30,}$"), ("webhook_secret", r"^whsec_[A-Za-z0-9+/=]{10,}$")):
        v = (getattr(d, k) or "").strip()
        if v == "-":
            c.pop(k, None)
        elif v:
            if not re.match(padrao, v):
                raise HTTPException(422, f"O valor de {k} não tem o formato esperado.")
            c[k] = v
    correio.salvar_cfg(c)
    db.registrar("sistema", "E-mail: configuração salva")
    return estado()


@rotas_email.post("/dominio/provisionar")
def provisionar():
    _papel("dono")
    try:
        return correio.provisionar()
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e


@rotas_email.post("/dominio/verificar")
def verificar():
    _papel("dono", "admin")
    try:
        dom = correio.atualizar_dominio() if correio.cfg().get("api_key_total") else {}
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
    return {"dominio": dom, "dns": correio.dns_publico()}


@rotas_email.get("/modelos")
def modelos():
    _papel("dono", "admin")
    return [{"tipo": k, "nome": v, "assunto": correio.montar(k, correio.EXEMPLO)[0], "automatico": correio.automatico(k) if k in correio.AUTOMATICOS else None} for k, v in correio.MODELOS.items()]


@rotas_email.get("/modelos/{tipo}/previa", response_class=HTMLResponse)
def previa(tipo: str):
    _papel("dono", "admin")
    if tipo not in correio.MODELOS:
        raise HTTPException(404, "Modelo não existe.")
    return HTMLResponse(correio.montar(tipo, correio.EXEMPLO)[1], headers={"Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"})


class TesteIn(BaseModel):
    tipo: str = Field("teste", max_length=30)
    para: str | None = Field(None, max_length=200)


@rotas_email.post("/teste")
def teste(d: TesteIn):
    u = _papel("dono", "admin")
    if d.tipo not in correio.MODELOS:
        raise HTTPException(404, "Modelo não existe.")
    para = (d.para or u.get("email") or "").strip()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", para):
        raise HTTPException(422, "E-mail inválido.")
    try:
        r = correio.enviar(para, d.tipo, {**correio.EXEMPLO, "nome": u.get("nome") or correio.EXEMPLO["nome"], "email": para})
    except RuntimeError as e:
        raise HTTPException(400, str(e)) from e
    db.registrar("painel", f"E-mail de teste enviado ({correio.MODELOS[d.tipo]})", detalhe=para)
    return r


@rotas_email.get("/envios")
def envios(limite: int = 100, tipo: str | None = None, estado: str | None = None, q: str | None = None):
    _papel("dono", "admin")
    sql, p = "SELECT * FROM email_envios WHERE 1=1", []
    if tipo:
        sql += " AND tipo = ?"; p.append(tipo)
    if estado:
        sql += " AND estado = ?"; p.append(estado)
    if q:
        sql += " AND (para ILIKE ? OR assunto ILIKE ?)"; p += [f"%{q[:80]}%"] * 2
    sql += " ORDER BY id DESC LIMIT ?"; p.append(max(1, min(limite, 500)))
    return db.consultar(sql, tuple(p))


@publico_email.post("/webhook")
async def webhook(request: Request):
    corpo = await request.body()
    if len(corpo) > 200_000 or not correio.webhook_valido(corpo, {k.lower(): v for k, v in request.headers.items()}):
        raise HTTPException(401, "Assinatura inválida.")
    try:
        correio.registrar_evento(json.loads(corpo))
    except ValueError as e:
        raise HTTPException(400, "Corpo inválido.") from e
    return {"ok": True}
