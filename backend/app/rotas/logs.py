"""Rotas do log completo (ver app/logs.py).

- /api/seguranca/logs…  : tudo (atividade, segurança, Telegram, dispositivos, e-mails). Permissão seguranca.gerenciar e
  acesso a todos os projetos (acesso._SO_ACESSO_TOTAL).
- /api/atividade/pessoas|linha : só a atividade, respeitando os projetos e ares de quem pede (atividade.ver).
- /api/usuarios/acoes : o que cada pessoa fez (usuarios.gerenciar), para Configurações → Usuários → Uso do sistema.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from .. import db, logs
from ..seguranca import exigir_login

rotas_logs = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])


def _periodo(dias: int, de: int | None, ate: int | None) -> tuple[int, int | None]:
    if de:
        return int(de), (int(ate) if ate else None)
    return db.agora() - max(1, min(365, dias)) * 86400, None


def _escopo():
    from .api import _escopo as esc
    return esc("a.projeto_id")


def _filtros(pessoa, sala, aparelho, origem, categoria, tipo_seg, ip, com_acessos):
    return {"pessoa": pessoa or None, "sala": sala, "aparelho": aparelho, "origem": origem or None, "categoria": categoria or None,
            "tipo_seg": tipo_seg or None, "ip": ip or None, "com_acessos": com_acessos}


@rotas_logs.get("/seguranca/logs")
def logs_tudo(fontes: str = "atividade,seguranca,telegram,dispositivos,email", dias: int = 7, de: int | None = None, ate: int | None = None,
              q: str = "", falhas: bool = False, pessoa: str = "", sala: int | None = None, aparelho: int | None = None, origem: str = "",
              categoria: str = Query("", pattern="^(|ares|admin)$"), tipo_seg: str = "", ip: str = "", com_acessos: bool = False,
              antes: int | None = None, limite: int = 200):
    lst = [f for f in fontes.split(",") if f in logs.FONTES] or list(logs.FONTES)
    desde, fim = _periodo(dias, de, ate)
    itens = logs.consultar(lst, desde, fim, q, falhas, limite, antes, _filtros(pessoa, sala, aparelho, origem, categoria, tipo_seg, ip, com_acessos))
    return {"itens": itens, "mais": len(itens) >= max(10, min(1000, limite)), "proximo": itens[-1]["quando"] if itens else None}


@rotas_logs.get("/seguranca/logs/resumo")
def logs_resumo(dias: int = 7, de: int | None = None, ate: int | None = None):
    desde, fim = _periodo(dias, de, ate)
    r = logs.resumo(desde, fim)
    r["opcoes"] = _opcoes()
    return r


def _opcoes() -> dict:
    return {"pessoas": db.consultar("SELECT id::text AS id, COALESCE(NULLIF(nome, ''), email) AS nome FROM usuarios ORDER BY 2"),
            "salas": db.consultar("SELECT id, nome FROM projetos ORDER BY nome"),
            "ares": db.consultar("SELECT id, nome, projeto_id FROM aparelhos ORDER BY nome"),
            "tipos_seg": [r["tipo"] for r in db.consultar("SELECT DISTINCT tipo FROM seguranca_eventos ORDER BY 1")]}


@rotas_logs.get("/atividade/pessoas")
def atividade_pessoas(dias: int = 7, de: int | None = None, ate: int | None = None):
    """Resumo por pessoa, sala e ar (só o que a pessoa que pede pode ver)."""
    desde, fim = _periodo(dias, de, ate)
    r = logs.resumo(desde, fim, _escopo())
    for k in ("seg_tipos", "ips"):
        r.pop(k, None)
    r["totais"] = {"atividade": r["totais"]["atividade"]}
    return r


@rotas_logs.get("/atividade/linha")
def atividade_linha(dias: int = 7, de: int | None = None, ate: int | None = None, q: str = "", falhas: bool = False, pessoa: str = "",
                    sala: int | None = None, aparelho: int | None = None, origem: str = "", so_ares: bool = False, antes: int | None = None, limite: int = 200):
    """Atividade com a pessoa, a sala e o que mudou no ar (ligou, subiu a temperatura…)."""
    desde, fim = _periodo(dias, de, ate)
    f = {"pessoa": pessoa or None, "sala": sala, "aparelho": aparelho, "origem": origem or None, "so_ares": so_ares}
    itens = logs.consultar(["atividade"], desde, fim, q, falhas, limite, antes, f, _escopo())
    return {"itens": itens, "mais": len(itens) >= max(10, min(1000, limite)), "proximo": itens[-1]["quando"] if itens else None}


@rotas_logs.get("/usuarios/acoes")
def usuarios_acoes(request: Request, dias: int = 30, pessoa: str = "", limite: int = 150):
    """Para Uso do sistema: o que cada pessoa fez nos ares e no sistema, as entradas e o uso do Telegram."""
    desde = db.agora() - max(1, min(365, dias)) * 86400
    r = logs.resumo(desde, None, _escopo())
    saida = {"pessoas": r["pessoas"], "acoes_ar": r["acoes_ar"], "admin": r["admin"]}
    if pessoa:
        saida["itens"] = logs.consultar(["atividade", "telegram"], desde, None, "", False, limite, None, {"pessoa": pessoa}, _escopo())
        saida["entradas"] = db.consultar("SELECT criado_em, visto_em, ip, pais, cidade, agente, revogada FROM sessoes_uso WHERE usuario_id::text = ? ORDER BY criado_em DESC LIMIT 20", (pessoa,))
        saida["ares"] = db.consultar("SELECT a.nome, pr.nome AS sala, count(*) AS n FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                                     "WHERE t.usuario_id = ? AND t.quando > ? GROUP BY a.nome, pr.nome ORDER BY 3 DESC LIMIT 12", (pessoa, desde))
        saida["telegram"] = db.um("SELECT count(*) AS n, count(*) FILTER (WHERE tipo = 'erro') AS erros, max(quando) AS ultimo FROM telegram_eventos WHERE usuario_id::text = ? AND quando > ?", (pessoa, desde))
        saida["ia"] = db.um("SELECT count(*) AS n, COALESCE(sum(tokens), 0) AS tokens FROM ia_uso WHERE usuario_id::text = ? AND quando > ?", (pessoa, desde))
    return saida
