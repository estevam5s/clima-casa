"""Modo de ataque da Vercel (Attack Challenge Mode) ligado junto com o escudo anti-DDoS.

Roda só no agente do Mac: é ele que tem o VERCEL_TOKEN (o token tem escopo amplo e não vai para a Vercel).
A cada ciclo da agenda (~20 s) compara o escudo (config.escudo) com o estado da Vercel e liga ou desliga.
Com o modo ligado, a borda da Vercel desafia todo acesso antes de chegar ao sistema.
"""
import logging

import httpx

from . import db, firewall

log = logging.getLogger("clima.vercel")
EQUIPE = "team_yGogpkWeAo5ExKwRr8HYYR4C"
PROJETO = "prj_WrOfA95u3dvL6Hurtx2EfsYRMHQm"


def _chamar(ligar: bool, ate_ms: int | None = None) -> bool:
    token = db.ENV.get("VERCEL_TOKEN")
    if not token:
        return False
    corpo = {"projectId": PROJETO, "attackModeEnabled": ligar, **({"attackModeActiveUntil": ate_ms} if ligar and ate_ms else {})}
    r = httpx.post(f"https://api.vercel.com/v1/security/attack-mode?teamId={EQUIPE}", headers={"Authorization": f"Bearer {token}"}, json=corpo, timeout=15)
    if r.status_code >= 300:
        log.warning("modo de ataque da Vercel: %s %s", r.status_code, r.text[:200])
        return False
    return True


def sincronizar():
    firewall._escudo_cache["em"] = 0          # lê o estado fresco do banco
    e = firewall.escudo()
    quer = e["ativo"] and firewall.config().get("escudo_vercel", True)
    if quer and not e.get("vercel"):
        if _chamar(True, e["ate"] * 1000):
            db.set_cfg("escudo", {**{k: v for k, v in e.items() if k != "ativo"}, "vercel": True})
            db.registrar("sistema", "Modo de ataque da Vercel ligado", detalhe=f"até {e['ate']}")
    elif not quer and e.get("vercel"):
        if _chamar(False):
            db.set_cfg("escudo", {**{k: v for k, v in e.items() if k != "ativo"}, "vercel": False})
            db.registrar("sistema", "Modo de ataque da Vercel desligado")
