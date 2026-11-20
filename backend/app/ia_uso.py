"""Limites de uso do Assistente de IA, no mesmo método do Claude (20/11, 1.31.0).

- Sessão de 5 horas: começa na primeira pergunta depois que a anterior acabou e dura 5 h; ao acabar, o uso zera.
- Semana: começa no primeiro uso depois que a semana anterior acabou e dura 7 dias.
- O uso é medido em tokens (o que a NVIDIA conta em cada resposta, pergunta + resposta + consultas da IA).
- O dono define os limites em IA → Configuração (padrão para todos e por pessoa). Dono pode ficar sem limite.
Vale para o painel, o terminal (clima-ia) e o Telegram: é a mesma conta.
"""
from __future__ import annotations

import datetime as dt
import random
from zoneinfo import ZoneInfo

from . import db

SESSAO_S = 5 * 3600
SEMANA_S = 7 * 86400
PADRAO = {"sessao": 300_000, "semana": 2_000_000, "dono_ilimitado": True, "usuarios": {}}
BR = ZoneInfo("America/Sao_Paulo")


def config() -> dict:
    c = {**PADRAO, **(db.cfg("ia_limites") or {})}
    c["usuarios"] = c.get("usuarios") or {}
    return c


def salvar(sessao: int | None, semana: int | None, dono_ilimitado: bool | None, usuarios: dict | None):
    c = config()
    if sessao is not None:
        c["sessao"] = int(sessao)
    if semana is not None:
        c["semana"] = int(semana)
    if dono_ilimitado is not None:
        c["dono_ilimitado"] = bool(dono_ilimitado)
    if usuarios is not None:
        c["usuarios"] = {str(k): {kk: v[kk] for kk in ("sessao", "semana", "ilimitado") if kk in v} for k, v in usuarios.items() if isinstance(v, dict)}
    db.set_cfg("ia_limites", c)
    db.registrar("painel", "Limites de uso da IA alterados", detalhe=f"sessão {c['sessao']:,} · semana {c['semana']:,} tokens".replace(",", "."))
    return c


def limites_de(u: dict) -> tuple[int | None, int | None]:
    """(limite da sessão, limite da semana) em tokens; None = sem limite."""
    c = config()
    p = c["usuarios"].get(str(u.get("id") or ""), {})
    if p.get("ilimitado") or (u.get("papel") == "dono" and c.get("dono_ilimitado")):
        return None, None
    return (p.get("sessao") or c["sessao"]), (p.get("semana") or c["semana"])


def _janela(linhas: list[dict], duracao: int, agora: int) -> tuple[int | None, int]:
    """Janela atual (início, tokens) a partir dos usos em ordem: uma janela nova começa no primeiro uso depois que a anterior acabou."""
    inicio = None
    for r in linhas:
        if inicio is None or r["quando"] >= inicio + duracao:
            inicio = r["quando"]
    if inicio is None or agora >= inicio + duracao:
        return None, 0
    return inicio, sum(r["tokens"] for r in linhas if r["quando"] >= inicio)


def status(u: dict) -> dict:
    uid = str(u.get("id") or "anon")
    agora = db.agora()
    linhas = db.consultar("SELECT quando, tokens FROM ia_uso WHERE usuario_id = ? AND quando > ? ORDER BY quando", (uid, agora - 2 * SEMANA_S))
    lim_s, lim_w = limites_de(u)
    out = {"ilimitado": lim_s is None and lim_w is None}
    for nome, dur, lim in (("sessao", SESSAO_S, lim_s), ("semana", SEMANA_S, lim_w)):
        ini, usado = _janela(linhas, dur, agora)
        out[nome] = {"usado": usado, "limite": lim, "pct": min(100, round(100 * usado / lim)) if lim else 0,
                     "inicio": ini, "reinicia_em": (ini + dur) if ini else None}
    return out


def hora_br(epoch: int | None) -> str:
    if not epoch:
        return ""
    d = dt.datetime.fromtimestamp(epoch, BR)
    hoje = dt.datetime.now(BR).date()
    return d.strftime("%H:%M") if d.date() == hoje else d.strftime("%d/%m às %H:%M")


def checar(u: dict):
    """Antes de perguntar: estourou a sessão ou a semana? Levanta PermissionError (vira 429) com a hora em que libera."""
    s = status(u)
    if s["ilimitado"]:
        return s
    if s["semana"]["limite"] and s["semana"]["usado"] >= s["semana"]["limite"]:
        raise PermissionError(f"Você chegou ao limite semanal do Assistente. Libera em {hora_br(s['semana']['reinicia_em'])} (horário de Brasília).")
    if s["sessao"]["limite"] and s["sessao"]["usado"] >= s["sessao"]["limite"]:
        raise PermissionError(f"Você chegou ao limite da sessão de 5 horas. Libera às {hora_br(s['sessao']['reinicia_em'])} (horário de Brasília).")
    return s


def registrar(u: dict, tokens: int, modelo: str, canal: str):
    if tokens <= 0:
        return
    db.executar("INSERT INTO ia_uso (usuario_id, quando, tokens, modelo, canal) VALUES (?,?,?,?,?)",
                (str(u.get("id") or "anon"), db.agora(), int(tokens), modelo[:80], canal[:20]))
    if random.random() < 0.02:   # limpeza de vez em quando: só as duas últimas semanas importam para os limites
        db.executar("DELETE FROM ia_uso WHERE quando < ?", (db.agora() - 30 * 86400,))


def por_pessoa() -> list[dict]:
    """Para o dono: uso atual de cada pessoa que usou o Assistente nas duas últimas semanas."""
    agora = db.agora()
    gente = db.consultar("SELECT u.id, u.nome, u.email, u.papel FROM usuarios u WHERE EXISTS "
                         "(SELECT 1 FROM ia_uso i WHERE i.usuario_id = u.id::text AND i.quando > ?) ORDER BY u.nome", (agora - 2 * SEMANA_S,))
    return [{"id": str(g["id"]), "nome": g["nome"] or g["email"], "papel": g["papel"], **status(g)} for g in gente]
