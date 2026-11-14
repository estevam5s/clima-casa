"""Skill da Alexa: configuração, OAuth 2.0 (vinculação de conta) e endpoint das diretivas."""
import base64
import hmac
import secrets
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import alexa, db
from ..seguranca import exigir_login, hash_token

roteador = APIRouter()
DOMINIOS_AMAZON = ("pitangui.amazon.com", "layla.amazon.com", "alexa.amazon.co.jp", "alexa.amazon.com")
DURACAO_ACCESS = 3600
DURACAO_REFRESH = 365 * 24 * 3600


def _config():
    c = db.cfg("alexa")
    if not c:
        c = {"client_id": "clima-alexa", "client_secret": secrets.token_urlsafe(32),
             "chave_lambda": secrets.token_urlsafe(32), "url_publica": ""}
        db.set_cfg("alexa", c)
    return c


class AlexaCfg(BaseModel):
    url_publica: str = Field("", max_length=200)


@roteador.get("/api/alexa", dependencies=[Depends(exigir_login)])
def ver(request: Request):
    c = _config()
    base = c["url_publica"].rstrip("/")
    vinculos = db.um("SELECT COUNT(*) n, MAX(criado_em) ultimo FROM oauth_tokens WHERE tipo = 'refresh' AND expira > ?",
                     (db.agora(),))
    ultima = db.um("SELECT quando, acao, ok FROM atividade WHERE origem = 'alexa' ORDER BY id DESC LIMIT 1")
    return {
        **c,
        "vinculada": vinculos["n"] > 0, "vinculada_em": vinculos["ultimo"], "ultima_diretiva": ultima,
        "aparelhos": db.um("SELECT COUNT(*) n FROM aparelhos WHERE alexa = 1")["n"],
        "urls": {
            "autorizacao": f"{base}/oauth/autorizar" if base else "",
            "token": f"{base}/oauth/token" if base else "",
            "diretivas": f"{base}/alexa/diretiva" if base else "",
        },
    }


@roteador.put("/api/alexa", dependencies=[Depends(exigir_login)])
def salvar(d: AlexaCfg, request: Request):
    url = d.url_publica.strip().rstrip("/")
    if url and not url.startswith("https://"):
        raise HTTPException(400, "A Alexa exige endereço com https://")
    c = _config()
    c["url_publica"] = url
    db.set_cfg("alexa", c)
    return ver(request)


@roteador.post("/api/alexa/revogar", dependencies=[Depends(exigir_login)])
def revogar():
    db.executar("DELETE FROM oauth_tokens")
    db.registrar("painel", "Vinculação com a Alexa revogada")
    return {"ok": True}


@roteador.post("/api/alexa/nova-chave", dependencies=[Depends(exigir_login)])
def nova_chave(request: Request):
    c = _config()
    c["client_secret"] = secrets.token_urlsafe(32)
    c["chave_lambda"] = secrets.token_urlsafe(32)
    db.set_cfg("alexa", c)
    db.executar("DELETE FROM oauth_tokens")
    db.registrar("painel", "Chaves da Alexa trocadas (vínculo precisa ser refeito)")
    return ver(request)


# ---------------- OAuth 2.0 (authorization code) ----------------
def _redirect_ok(uri: str) -> bool:
    p = urlparse(uri)
    return p.scheme == "https" and p.hostname in DOMINIOS_AMAZON


@roteador.get("/api/oauth/validar")
def validar(client_id: str, redirect_uri: str, response_type: str = "code"):
    if client_id != _config()["client_id"] or response_type != "code" or not _redirect_ok(redirect_uri):
        raise HTTPException(400, "Pedido de autorização inválido.")
    return {"ok": True}


class Aprovar(BaseModel):
    client_id: str
    redirect_uri: str
    state: str = ""


@roteador.post("/api/oauth/aprovar", dependencies=[Depends(exigir_login)])
def aprovar(d: Aprovar):
    validar(d.client_id, d.redirect_uri)
    codigo = secrets.token_urlsafe(24)
    db.executar("INSERT INTO oauth_codigos (codigo, redirect_uri, expira) VALUES (?,?,?)",
                (hash_token(codigo), d.redirect_uri, db.agora() + 300))
    db.registrar("alexa", "Vinculação de conta autorizada")
    sep = "&" if "?" in d.redirect_uri else "?"
    return {"redirect": f"{d.redirect_uri}{sep}{urlencode({'code': codigo, 'state': d.state})}"}


def _emitir():
    access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(40)
    agora = db.agora()
    db.executar("INSERT INTO oauth_tokens VALUES (?,?,?,?)", (hash_token(access), "access", agora + DURACAO_ACCESS, agora))
    db.executar("INSERT INTO oauth_tokens VALUES (?,?,?,?)", (hash_token(refresh), "refresh", agora + DURACAO_REFRESH, agora))
    db.executar("DELETE FROM oauth_tokens WHERE expira < ?", (agora,))
    return {"access_token": access, "refresh_token": refresh, "token_type": "Bearer", "expires_in": DURACAO_ACCESS}


def _oauth_erro(codigo, status=400):
    return JSONResponse({"error": codigo}, status_code=status, headers={"Cache-Control": "no-store"})


_tentativas_token: dict[str, list[float]] = {}


def _limite_token(ip: str):
    """Até 20 trocas de token por minuto por IP (a Alexa usa poucas; barra força bruta no client_secret)."""
    import time as _t
    agora = _t.time()
    lista = [x for x in _tentativas_token.get(ip, []) if x > agora - 60]
    lista.append(agora)
    _tentativas_token[ip] = lista
    return len(lista) <= 20


@roteador.post("/oauth/token")
def token(request: Request, grant_type: str = Form(...), code: str = Form(None), refresh_token: str = Form(None),
          redirect_uri: str = Form(None), client_id: str = Form(None), client_secret: str = Form(None)):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    if not _limite_token(ip):
        return _oauth_erro("slow_down", 429)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            client_id, client_secret = base64.b64decode(auth[6:]).decode().split(":", 1)
        except Exception:
            return _oauth_erro("invalid_client", 401)
    c = _config()
    if client_id != c["client_id"] or not hmac.compare_digest(client_secret or "", c["client_secret"]):
        return _oauth_erro("invalid_client", 401)

    if grant_type == "authorization_code":
        linha = db.um("SELECT * FROM oauth_codigos WHERE codigo = ?", (hash_token(code or ""),))
        db.executar("DELETE FROM oauth_codigos WHERE codigo = ? OR expira < ?", (hash_token(code or ""), db.agora()))
        if not linha or linha["expira"] < db.agora() or (redirect_uri and redirect_uri != linha["redirect_uri"]):
            return _oauth_erro("invalid_grant")
        return JSONResponse(_emitir(), headers={"Cache-Control": "no-store"})
    if grant_type == "refresh_token":
        h = hash_token(refresh_token or "")
        linha = db.um("SELECT * FROM oauth_tokens WHERE hash = ? AND tipo = 'refresh'", (h,))
        if not linha or linha["expira"] < db.agora():
            return _oauth_erro("invalid_grant")
        db.executar("DELETE FROM oauth_tokens WHERE hash = ?", (h,))
        return JSONResponse(_emitir(), headers={"Cache-Control": "no-store"})
    return _oauth_erro("unsupported_grant_type")


# ---------------- diretivas (chamadas pela Lambda) ----------------
@roteador.post("/alexa/diretiva")
async def diretiva(request: Request):
    chave = request.headers.get("x-clima-chave", "")
    if not hmac.compare_digest(chave, _config()["chave_lambda"]):
        raise HTTPException(403, "Chave da Lambda inválida.")
    import asyncio
    return await asyncio.to_thread(alexa.tratar, await request.json())
