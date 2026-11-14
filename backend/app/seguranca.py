"""Autenticação pelo Supabase Auth: só o administrador (app_metadata.role = 'admin') acessa.

O navegador faz login direto no Supabase e manda o access token (Bearer) em cada chamada.
O backend confere o token no próprio Supabase e guarda o resultado por 60 s.
"""
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


def usuario_admin(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Faça login para continuar.")
    usuario = _usuario_do_token(auth[7:].strip())
    if not usuario:
        raise HTTPException(401, "Sessão expirada. Faça login de novo.")
    if (usuario.get("app_metadata") or {}).get("role") != "admin":
        raise HTTPException(403, "Esta conta não tem acesso de administrador.")
    return usuario


def exigir_login(request: Request):
    request.state.usuario = usuario_admin(request)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
