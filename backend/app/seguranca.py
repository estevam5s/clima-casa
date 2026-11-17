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


_pk_cache: dict[str, tuple[float, bool]] = {}


def _tem_passkey(uid: str) -> bool:
    v = _pk_cache.get(uid)
    if v and v[0] > time.time():
        return v[1]
    r = bool(db.um("SELECT 1 FROM passkeys WHERE usuario_id = ? LIMIT 1", (uid,)))
    _pk_cache[uid] = (time.time() + 120, r)
    return r


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
    from . import firewall, sessoes
    cfg = firewall.config()
    sessoes.registrar_uso(claims, u, request, cfg)   # inatividade, duração máxima e sessões encerradas
    # política: administradores precisam de 2 etapas (autenticador ou biometria) para usar o sistema
    # Vale a SESSÃO atual: entrar só com senha (ou Google) não passa só porque a conta tem biometria cadastrada.
    if cfg.get("exigir_2fa_admin") and u["papel"] in ("dono", "admin", "subadmin") and not tem_totp(usuario) \
            and not sessao_forte(claims.get("session_id", "")) \
            and not rota.startswith(("/api/sessao", "/api/conta", "/api/perfil", "/api/notificacoes", "/api/marca", "/api/supabase-config")):
        msg = ("Esta conta usa biometria: saia e entre com a biometria (ou ative o autenticador) para continuar." if _tem_passkey(u["id"])
               else "Ative a verificação em duas etapas (Configurações → Segurança) para continuar.")
        raise HTTPException(403, msg, headers={"X-Clima-Exige-2FA": "1"})
    # modo manutenção (white label): só dono e admin usam; os outros veem a tela de manutenção
    if u["papel"] not in ("dono", "admin") and not rota.startswith(("/api/sessao", "/api/perfil", "/api/marca", "/api/supabase-config", "/api/conta")):
        marca = db.cfg("white_label") or {}
        if marca.get("manutencao"):
            raise HTTPException(503, marca.get("manutencao_mensagem") or "O sistema está em manutenção. Volte em alguns minutos.", headers={"X-Clima-Manutencao": "1"})
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
