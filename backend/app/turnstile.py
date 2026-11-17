"""Cloudflare Turnstile: confirma no servidor que o formulário foi enviado por uma pessoa (bloqueio de bots).

Usado no login com senha, no "esqueci a senha" e nos formulários do site (contato e novidades).
Sem TURNSTILE_SECRET_KEY configurada (ex.: desenvolvimento), a checagem é pulada.
"""
import httpx
from fastapi import HTTPException

from . import db


def chave_publica() -> str:
    return db.ENV.get("TURNSTILE_SITE_KEY", "")


def no_supabase() -> bool:
    """CAPTCHA ligado também no Supabase Auth (Attack Protection, provedor Turnstile). Aí o token do formulário vai para o
    Supabase conferir (o token só vale uma vez: se o servidor conferisse antes, o Supabase recusaria)."""
    return bool((db.cfg("auth_captcha") or {}).get("ativo"))


def corpo_supabase(token: str | None) -> dict:
    """Pedaço do corpo do /auth/v1/token com o token do CAPTCHA, quando o Supabase exige."""
    return {"gotrue_meta_security": {"captcha_token": token}} if no_supabase() and token else {}


def recusado_pelo_captcha(resposta: dict) -> bool:
    texto = f"{resposta.get('error_code', '')} {resposta.get('msg', '')} {resposta.get('message', '')} {resposta.get('error_description', '')}".lower()
    return "captcha" in texto


def exigir(token: str | None, ip: str = "", acao: str = ""):
    segredo = db.ENV.get("TURNSTILE_SECRET_KEY")
    if not segredo:
        return
    if not token:
        raise HTTPException(400, "Confirme que você não é um robô (verificação da Cloudflare) e tente de novo.")
    try:
        r = httpx.post("https://challenges.cloudflare.com/turnstile/v0/siteverify", timeout=8,
                       data={"secret": segredo, "response": token, **({"remoteip": ip} if ip and ip != "0.0.0.0" else {})})
        dados = r.json()
    except Exception:  # noqa: BLE001  (Cloudflare fora do ar não deve trancar o administrador)
        return
    if not dados.get("success"):
        from . import firewall
        firewall.registrar(ip, "bot_bloqueado", acao, ",".join(dados.get("error-codes", []))[:200])
        raise HTTPException(400, "A verificação contra robôs falhou ou expirou. Recarregue a página e tente de novo.")
