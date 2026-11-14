"""Autenticação pelo Supabase Auth + usuários do sistema (acesso.py).

O navegador faz login no Supabase e manda o access token (Bearer) em cada chamada. O backend confere o token no
próprio Supabase (cache de 60 s), carrega o usuário em `usuarios`, aplica as permissões da rota e o escopo de
projetos. Se a conta tem o Google Authenticator (TOTP) ativo, só aceita sessão aal2 ou aberta com passkey.
"""
import base64
import json
import hashlib
import time

import httpx
from fastapi import HTTPException, Request

from . import db

_cache: dict[str, tuple[float, dict]] = {}
CACHE_SEG = 60


def _usuario_do_token(token: str) -> dict | None:
    agora = time.time()
    em_cache = _cache.get(token)
    if em_cache and em_cache[0] > agora:
        return em_cache[1]
    try:
        r = httpx.get(f"{db.ENV['SUPABASE_URL']}/auth/v1/user", timeout=8,
                      headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"], "Authorization": f"Bearer {token}"})
    except httpx.HTTPError:
        raise HTTPException(503, "Não foi possível falar com o Supabase para validar o login.")
    if r.status_code != 200:
        return None
    usuario = r.json()
    if len(_cache) > 200:
        _cache.clear()
    _cache[token] = (agora + CACHE_SEG, usuario)
    return usuario


def _claims(token: str) -> dict:
    try:
        parte = token.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(parte + "=" * (-len(parte) % 4)))
    except Exception:  # noqa: BLE001
        return {}


_fortes: dict[str, float] = {}


def sessao_forte(session_id: str) -> bool:
    """Sessão aberta com passkey (biometria) vale como segundo fator."""
    if not session_id:
        return False
    if _fortes.get(session_id, 0) > time.time():
        return True
    linha = db.um("SELECT expira_em FROM sessoes_fortes WHERE session_id = ? AND expira_em > ?", (session_id, db.agora()))
    if linha:
        _fortes[session_id] = min(time.time() + 300, linha["expira_em"])
        return True
    return False


def tem_totp(usuario: dict) -> bool:
    return any(f.get("factor_type") == "totp" and f.get("status") == "verified" for f in (usuario.get("factors") or []))


def usuario_logado(request: Request) -> tuple[dict, dict]:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Faça login para continuar.")
    token = auth[7:].strip()
    usuario = _usuario_do_token(token)
    if not usuario:
        raise HTTPException(401, "Sessão expirada. Faça login de novo.")
    claims = _claims(token)
    if tem_totp(usuario) and claims.get("aal") != "aal2" and not sessao_forte(claims.get("session_id", "")):
        raise HTTPException(401, "Confirme o código do Google Authenticator para continuar.", headers={"X-Clima-2FA": "necessario"})
    return usuario, claims


_ultimo_acesso: dict[str, float] = {}


def _validar(request: Request) -> dict:
    from . import acesso
    usuario, claims = usuario_logado(request)
    u = acesso.carregar(usuario)
    request.state.usuario = usuario
    request.state.u = u
    acesso.atual.set(u)   # vale para checar_escopo abaixo (mesma thread)
    rota = getattr(request.scope.get("route"), "path", request.url.path)
    acesso.checar_rota(request.method, rota, u)
    acesso.checar_escopo(rota, request.path_params, dict(request.query_params))
    if time.time() - _ultimo_acesso.get(u["id"], 0) > 120:
        _ultimo_acesso[u["id"]] = time.time()
        db.executar("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?", (db.agora(), u["id"]))
    return u


async def exigir_login(request: Request):
    """Dependência das rotas: valida em thread (chamadas de rede/banco) e guarda o usuário no contexto da
    requisição, que o FastAPI copia para a thread do endpoint (acesso.atual)."""
    import asyncio
    from . import acesso
    u = await asyncio.to_thread(_validar, request)
    acesso.atual.set(u)


# compatibilidade: rotas antigas que usam usuario_admin
def usuario_admin(request: Request) -> dict:
    _validar(request)
    return request.state.usuario


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
