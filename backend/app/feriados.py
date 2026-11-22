"""Feriados para a agenda: os ares não ligam sozinhos em feriado nem durante uma pausa ("férias").

Regras em `config.agenda_regras`: {pular_feriados, pausa_ate (AAAA-MM-DD, inclusive), pausa_motivo, datas_extras: [{data, nome}]}.
Feriados nacionais fixos e móveis (Páscoa pelo algoritmo de Meeus/Butcher), Carnaval e Corpus Christi (pontos facultativos
que a Prefeitura costuma seguir) e o aniversário de Florianópolis (23/03). Datas extras (recesso, ponte) o dono cadastra.
"""
from __future__ import annotations

import datetime

from . import db

PADRAO = {"pular_feriados": False, "pausa_ate": None, "pausa_motivo": "", "datas_extras": []}


def pascoa(ano: int) -> datetime.date:
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    m = (32 + 2 * e + 2 * i - h - k) % 7
    n = (a + 11 * h + 22 * m) // 451
    mes, dia = divmod(h + m - 7 * n + 114, 31)
    return datetime.date(ano, mes, dia + 1)


def do_ano(ano: int) -> list[dict]:
    p = pascoa(ano)
    fixos = [((1, 1), "Confraternização Universal"), ((3, 23), "Aniversário de Florianópolis"), ((4, 21), "Tiradentes"),
             ((5, 1), "Dia do Trabalho"), ((9, 7), "Independência"), ((10, 12), "Nossa Senhora Aparecida"), ((11, 2), "Finados"),
             ((11, 15), "Proclamação da República"), ((11, 20), "Dia da Consciência Negra"), ((12, 25), "Natal")]
    lista = [{"data": datetime.date(ano, m, d).isoformat(), "nome": n, "tipo": "municipal" if n.startswith("Aniversário") else "nacional"} for (m, d), n in fixos]
    lista += [{"data": (p - datetime.timedelta(days=48)).isoformat(), "nome": "Carnaval (segunda)", "tipo": "ponto facultativo"},
              {"data": (p - datetime.timedelta(days=47)).isoformat(), "nome": "Carnaval (terça)", "tipo": "ponto facultativo"},
              {"data": (p - datetime.timedelta(days=2)).isoformat(), "nome": "Sexta-feira Santa", "tipo": "nacional"},
              {"data": (p + datetime.timedelta(days=60)).isoformat(), "nome": "Corpus Christi", "tipo": "ponto facultativo"}]
    return sorted(lista, key=lambda f: f["data"])


def regras() -> dict:
    return {**PADRAO, **(db.cfg("agenda_regras", {}) or {})}


def motivo_para_nao_rodar(dia: datetime.date) -> str | None:
    """Texto do motivo se a agenda não deve rodar neste dia; None se pode."""
    r = regras()
    if r.get("pausa_ate") and dia.isoformat() <= r["pausa_ate"]:
        return f"agenda pausada até {r['pausa_ate']}" + (f" ({r['pausa_motivo']})" if r.get("pausa_motivo") else "")
    if r.get("pular_feriados"):
        for f in do_ano(dia.year) + list(r.get("datas_extras") or []):
            if f.get("data") == dia.isoformat():
                return f"feriado: {f.get('nome') or 'data sem expediente'}"
    return None


def proximos(dias: int = 120) -> list[dict]:
    hoje = datetime.date.today()
    fim = (hoje + datetime.timedelta(days=dias)).isoformat()
    extras = [{**e, "tipo": "cadastrado"} for e in (regras().get("datas_extras") or [])]
    todos = do_ano(hoje.year) + do_ano(hoje.year + 1) + extras
    return sorted([f for f in todos if hoje.isoformat() <= f["data"] <= fim], key=lambda f: f["data"])
