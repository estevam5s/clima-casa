"""Relatórios: dados consolidados do período + exportação em PDF, DOCX, XLSX, XML, HTML, CSV, JSON e Markdown."""
import csv
import datetime
import html
import io
import json
import os
import re
import zipfile
from xml.etree import ElementTree as ET

from . import db

FUSO = datetime.timezone(datetime.timedelta(hours=-3))
DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]


def _data(ts):
    return datetime.datetime.fromtimestamp(ts, FUSO)


EXPEDIENTE = (7, 19)   # seg a sex, 7h às 19h: fora disso conta como "fora do expediente"
MODOS = ("Frio", "Quente", "Ventilar", "Desumidificar", "Seco", "Automático", "Auto")


def _sessoes(eventos, fim):
    """Cada 'Ligar' até o 'Desligar' seguinte vira uma sessão (no máximo 24 h; aberta no fim do período fecha no fim)."""
    sessoes, aberta = [], None
    for t in eventos:
        if not t["ok"]:
            continue
        if t["acao"].startswith("Ligar"):
            if aberta is None:
                aberta = {"inicio": t["quando"], "origem": t["origem"], "acao": t["acao"]}
        elif t["acao"].startswith("Desligar") and aberta is not None:
            aberta["fim"] = min(t["quando"], aberta["inicio"] + 86400); aberta["origem_fim"] = t["origem"]
            sessoes.append(aberta); aberta = None
    if aberta is not None:
        aberta["fim"] = min(fim, aberta["inicio"] + 86400); aberta["origem_fim"] = "ainda ligado" if fim - aberta["inicio"] < 86400 else "sem registro"
        sessoes.append(aberta)
    for x in sessoes:
        x["horas"] = (x["fim"] - x["inicio"]) / 3600
        x["fora_expediente_h"] = _fora_expediente(x["inicio"], x["fim"])
    return sessoes


def _fora_expediente(ini, fim):
    total, t = 0, ini
    while t < fim:
        passo = min(600, fim - t)
        d = _data(t)
        if d.weekday() >= 5 or not (EXPEDIENTE[0] <= d.hour < EXPEDIENTE[1]):
            total += passo
        t += passo
    return total / 3600


def _horas_ligado(eventos, inicio, fim):
    return sum(x["horas"] for x in _sessoes(eventos, fim))


def _modo(acao):
    if not acao.startswith("Ligar"):
        return None
    resto = acao.split(":", 1)[-1].strip()
    for m in MODOS:
        if resto.lower().startswith(m.lower()):
            return {"Seco": "Desumidificar", "Auto": "Automático"}.get(m, m)
    return "Outro"


def _consolidar(aparelhos, eventos, inicio, fim, tarifa):
    por = {}
    for a in aparelhos:
        ev = [e for e in eventos if e["aparelho_id"] == a["id"]]
        ses = _sessoes(ev, fim)
        horas = sum(x["horas"] for x in ses)
        kwh = horas * (a["potencia_w"] or 1000) / 1000
        por[a["id"]] = {"ev": ev, "sessoes": ses, "horas": horas, "kwh": kwh, "custo": kwh * tarifa,
                        "fora_h": sum(x["fora_expediente_h"] for x in ses)}
    return por


def montar(inicio: int, fim: int, projeto_id: int | None = None, aparelho_id: int | None = None) -> dict:
    tarifa = float(db.cfg("tarifa_kwh", 0.85))
    filtro, p = "", []
    if projeto_id:
        filtro += " AND a.projeto_id = ?"; p.append(projeto_id)
    if aparelho_id:
        filtro += " AND a.id = ?"; p.append(aparelho_id)
    from . import acesso
    f_esc, p_esc = acesso.filtro_sql("a.projeto_id")   # limita aos projetos do usuário
    f_ar, p_ar = acesso.filtro_aparelhos("a.id")       # e aos ares de quem cuida só de alguns
    filtro += f_esc + f_ar; p += list(p_esc) + list(p_ar)
    aparelhos = db.consultar(f"SELECT a.id, a.nome, a.comodo, a.marca, a.potencia_w, a.hub_id, pr.id AS projeto_id, pr.nome AS projeto, "
                             f"h.nome AS hub FROM aparelhos a LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                             f"LEFT JOIN hubs h ON h.id = a.hub_id WHERE true{filtro} ORDER BY a.nome", p)
    ids = [a["id"] for a in aparelhos] or [-1]
    marcas = ",".join("?" * len(ids))
    duracao = max(fim - inicio, 1)
    eventos = db.consultar(f"SELECT aparelho_id, quando, acao, origem, ok, detalhe, usuario FROM atividade WHERE aparelho_id IN ({marcas}) "
                           f"AND quando BETWEEN ? AND ? ORDER BY quando", (*ids, inicio, fim))
    anteriores = db.consultar(f"SELECT aparelho_id, quando, acao, origem, ok, detalhe FROM atividade WHERE aparelho_id IN ({marcas}) "
                              f"AND quando BETWEEN ? AND ? ORDER BY quando", (*ids, inicio - duracao, inicio))
    atual = _consolidar(aparelhos, eventos, inicio, fim, tarifa)
    antes = _consolidar(aparelhos, anteriores, inicio - duracao, inicio, tarifa)

    por_aparelho, por_dia, por_hora, por_origem, temps, modos = [], {}, [0] * 24, {}, {}, {}
    calor = [[0] * 24 for _ in range(7)]
    por_semana = [{"dia": DIAS[i], "comandos": 0, "horas": 0.0} for i in range(7)]
    for a in aparelhos:
        c = atual[a["id"]]; ev = c["ev"]; ses = c["sessoes"]
        por_aparelho.append({"id": a["id"], "nome": a["nome"], "comodo": a["comodo"] or "", "projeto": a["projeto"] or "", "hub": a["hub"] or "",
                             "comandos": len(ev), "falhas": sum(1 for e in ev if not e["ok"]),
                             "ligou": sum(1 for e in ev if e["acao"].startswith("Ligar") and e["ok"]),
                             "horas_ligado": round(c["horas"], 1), "kwh": round(c["kwh"], 1), "custo": round(c["custo"], 2),
                             "fora_expediente_h": round(c["fora_h"], 1), "sessoes": len(ses),
                             "sessao_media_h": round(c["horas"] / len(ses), 1) if ses else 0,
                             "sessao_maior_h": round(max((x["horas"] for x in ses), default=0), 1),
                             "custo_anterior": round(antes[a["id"]]["custo"], 2),
                             "potencia_w": a["potencia_w"] or 1000, "ultimo": ev[-1]["quando"] if ev else None})
        for x in ses:
            por_semana[(_data(x["inicio"]).weekday() + 1) % 7]["horas"] += x["horas"]
    for e in eventos:
        d = _data(e["quando"])
        chave = d.strftime("%Y-%m-%d")
        dia = por_dia.setdefault(chave, {"dia": chave, "comandos": 0, "falhas": 0, "alexa": 0, "agenda": 0, "painel": 0, "automacao": 0, "cena": 0})
        dia["comandos"] += 1; dia["falhas"] += 0 if e["ok"] else 1
        base = e["origem"].split(":")[0]
        grupo = "alexa" if base in ("alexa", "sinric") else base if base in ("agenda", "painel", "automacao", "cena") else None
        if grupo: dia[grupo] += 1
        por_hora[d.hour] += 1
        calor[(d.weekday() + 1) % 7][d.hour] += 1
        por_semana[(d.weekday() + 1) % 7]["comandos"] += 1
        por_origem[base] = por_origem.get(base, 0) + 1
        m = _modo(e["acao"]) if e["ok"] else None
        if m:
            modos[m] = modos.get(m, 0) + 1
        if e["ok"] and e["acao"].startswith("Ligar") and "°" in e["acao"]:
            try:
                t = int(e["acao"].split("°")[0].split()[-1]); temps[t] = temps.get(t, 0) + 1
            except ValueError:
                pass
    # horas ligado por dia (para a curva de consumo)
    for c in atual.values():
        for x in c["sessoes"]:
            chave = _data(x["inicio"]).strftime("%Y-%m-%d")
            dia = por_dia.setdefault(chave, {"dia": chave, "comandos": 0, "falhas": 0, "alexa": 0, "agenda": 0, "painel": 0, "automacao": 0, "cena": 0})
            dia["horas"] = round(dia.get("horas", 0) + x["horas"], 2)
    for dia in por_dia.values():
        dia.setdefault("horas", 0)
    nomes = {a["id"]: a["nome"] for a in aparelhos}
    sessoes = sorted(({"aparelho": nomes[aid], "inicio": x["inicio"], "fim": x["fim"], "horas": round(x["horas"], 2),
                       "fora_expediente_h": round(x["fora_expediente_h"], 2), "origem": x["origem"], "origem_fim": x["origem_fim"], "acao": x["acao"]}
                      for aid, c in atual.items() for x in c["sessoes"]), key=lambda x: -x["horas"])
    por_projeto = {}
    for a in por_aparelho:
        pj = por_projeto.setdefault(a["projeto"] or "Sem projeto", {"projeto": a["projeto"] or "Sem projeto", "projeto_id": next((x["projeto_id"] for x in aparelhos if x["id"] == a["id"]), None), "aparelhos": 0, "comandos": 0, "falhas": 0, "horas_ligado": 0, "kwh": 0, "custo": 0})
        pj["aparelhos"] += 1
        for k in ("comandos", "falhas", "horas_ligado", "kwh", "custo"):
            pj[k] = round(pj[k] + a[k], 2)
    por_hub = {}
    for a in por_aparelho:
        if a["hub"]:
            h = por_hub.setdefault(a["hub"], {"transmissor": a["hub"], "aparelhos": 0, "comandos": 0, "falhas": 0})
            h["aparelhos"] += 1; h["comandos"] += a["comandos"]; h["falhas"] += a["falhas"]
    for h in por_hub.values():
        h["sucesso_pct"] = round((h["comandos"] - h["falhas"]) / h["comandos"] * 100, 1) if h["comandos"] else 100.0
    rotinas = {}
    for e in eventos:
        if e["origem"].startswith(("automacao:", "cena:", "fluxo:", "agenda:")):
            k = e["origem"]
            tipo_r = {"automacao": "Automação", "cena": "Cena", "fluxo": "Fluxo", "agenda": "Agenda"}[k.split(":", 1)[0]]
            r_ = rotinas.setdefault(k, {"tipo": tipo_r, "nome": k.split(":", 1)[1], "execucoes": 0, "falhas": 0})
            r_["execucoes"] += 1; r_["falhas"] += 0 if e["ok"] else 1

    total, falhas = len(eventos), sum(1 for e in eventos if not e["ok"])
    total_ant, falhas_ant = len(anteriores), sum(1 for e in anteriores if not e["ok"])
    horas = sum(c["horas"] for c in atual.values()); horas_ant = sum(c["horas"] for c in antes.values())
    kwh = sum(c["kwh"] for c in atual.values()); kwh_ant = sum(c["kwh"] for c in antes.values())
    custo = kwh * tarifa; custo_ant = kwh_ant * tarifa
    fora = sum(c["fora_h"] for c in atual.values())
    dias_periodo = max(1, round(duracao / 86400))
    temp_media = round(sum(t * n for t, n in temps.items()) / max(1, sum(temps.values())), 1) if temps else None
    # por que os comandos falharam (agrupado pela mensagem de erro) e quanto cada origem acerta
    MOTIVOS = [("sem_agente", r"tempo esgotado|não respondeu a tempo|agente|offline", "Nenhum agente no escritório respondeu", "Ligue um computador ou o Raspberry na rede dos transmissores (Infra → Agentes)"),
               ("transmissor", r"sem resposta|905|901|timeout|não alcan|fora da rede|WinError", "Transmissor não respondeu na rede", "Confira se o transmissor está ligado e no mesmo Wi-Fi; Transmissores → Reconectar agora"),
               ("botao", r"botão|gravad|código", "Botão do controle não gravado", "Grave o botão que falta (Aparelho → Botões) ou gere os botões Gree"),
               ("chave", r"local key|914|chave", "A chave do transmissor mudou", "Ele foi pareado de novo: conecte a conta Smart Life em Configurações → Contas"),
               ("permissao", r"permiss|não está sob|403", "Sem permissão para esse ar", "Confira os ares de responsabilidade da pessoa em Configurações → Usuários")]
    motivos = {}
    for e in eventos:
        if e["ok"]:
            continue
        txt = f"{e.get('acao') or ''} {e.get('detalhe') or ''}".lower()
        chave, rot, dica = next(((k, r_, d_) for k, rx, r_, d_ in MOTIVOS if re.search(rx, txt)), ("outro", "Outros motivos", "Veja o detalhe na Atividade (filtro falhas)"))
        m = motivos.setdefault(chave, {"motivo": rot, "dica": dica, "vezes": 0, "exemplo": (e.get("detalhe") or e.get("acao") or "")[:120]})
        m["vezes"] += 1
    sucesso_origem = {}
    for e in eventos:
        o = (e.get("origem") or "outro").split(":")[0]
        x = sucesso_origem.setdefault(o, {"origem": o, "comandos": 0, "falhas": 0})
        x["comandos"] += 1; x["falhas"] += 0 if e["ok"] else 1
    for x in sucesso_origem.values():
        x["sucesso_pct"] = round((x["comandos"] - x["falhas"]) / x["comandos"] * 100, 1) if x["comandos"] else 100.0
    falhas_lista = [{"quando": e["quando"], "aparelho": nomes.get(e["aparelho_id"], ""),
                     "acao": e["acao"], "origem": e["origem"], "detalhe": e["detalhe"]} for e in eventos if not e["ok"]][-50:]
    alertas = db.consultar(f"SELECT tipo, mensagem, criado_em, resolvido FROM alertas WHERE criado_em BETWEEN to_timestamp(?) AND to_timestamp(?) "
                           f"AND (aparelho_id IS NULL OR aparelho_id IN ({marcas})) ORDER BY criado_em DESC LIMIT 50", (inicio, fim, *ids))
    for x in alertas:
        x["criado_em"] = x["criado_em"].timestamp() if x["criado_em"] else None
    var = lambda a, b: round((a - b) / b * 100, 1) if b else None  # noqa: E731
    marca = {**{"nome": "Clima Escritório"}, **(db.cfg("white_label") or {})}
    projeto_nome = db.um("SELECT nome FROM projetos WHERE id = ?", (projeto_id,))["nome"] if projeto_id and db.um("SELECT 1 FROM projetos WHERE id = ?", (projeto_id,)) else None
    resumo = {"comandos": total, "falhas": falhas, "sucesso_pct": round((total - falhas) / total * 100, 1) if total else 100.0,
              "horas_ligado": round(horas, 1), "kwh": round(kwh, 1), "custo": round(custo, 2),
              "aparelhos": len(aparelhos), "temperatura_media": temp_media,
              "comandos_periodo_anterior": total_ant, "variacao_comandos_pct": var(total, total_ant),
              "falhas_periodo_anterior": falhas_ant,
              "horas_periodo_anterior": round(horas_ant, 1), "variacao_horas_pct": var(horas, horas_ant),
              "kwh_periodo_anterior": round(kwh_ant, 1), "custo_periodo_anterior": round(custo_ant, 2), "variacao_custo_pct": var(custo, custo_ant),
              "fora_expediente_h": round(fora, 1), "fora_expediente_pct": round(fora / horas * 100, 1) if horas else 0,
              "custo_fora_expediente": round(sum(c["fora_h"] * (next(a["potencia_w"] for a in aparelhos if a["id"] == aid) or 1000) / 1000 * tarifa for aid, c in atual.items()), 2),
              "sessoes": len(sessoes), "sessao_media_h": round(horas / len(sessoes), 1) if sessoes else 0,
              "dias": dias_periodo, "custo_dia": round(custo / dias_periodo, 2), "projecao_mes": round(custo / dias_periodo * 30, 2),
              "projecao_kwh_mes": round(kwh / dias_periodo * 30, 1), "alertas": len(alertas)}
    d = {
        "titulo": f"Relatório de uso · {marca.get('nome')}", "marca": marca.get("nome"), "gerado_em": db.agora(), "inicio": inicio, "fim": fim,
        "tarifa_kwh": tarifa, "filtros": {"projeto": projeto_nome, "aparelho": aparelhos[0]["nome"] if aparelho_id and aparelhos else None},
        "expediente": f"segunda a sexta, {EXPEDIENTE[0]}h às {EXPEDIENTE[1]}h",
        "resumo": resumo,
        "por_aparelho": sorted(por_aparelho, key=lambda x: -x["comandos"]),
        "por_projeto": sorted(por_projeto.values(), key=lambda x: -x["custo"]),
        "por_transmissor": sorted(por_hub.values(), key=lambda x: -x["comandos"]),
        "por_dia": [por_dia[k] for k in sorted(por_dia)],
        "por_hora": [{"hora": h, "comandos": n} for h, n in enumerate(por_hora)],
        "por_dia_semana": [{**x, "horas": round(x["horas"], 1)} for x in por_semana],
        "por_origem": [{"origem": k, "comandos": v} for k, v in sorted(por_origem.items(), key=lambda x: -x[1])],
        "modos": [{"modo": k, "vezes": v} for k, v in sorted(modos.items(), key=lambda x: -x[1])],
        "temperaturas": [{"temperatura": t, "vezes": n} for t, n in sorted(temps.items())],
        "mapa_calor": [{"dia": DIAS[i], "horas": linha} for i, linha in enumerate(calor)],
        "sessoes": sessoes[:60],
        "rotinas": sorted(rotinas.values(), key=lambda x: -x["execucoes"]),
        "alertas": alertas,
        "falhas": falhas_lista,
        "motivos_falha": sorted(motivos.values(), key=lambda x: -x["vezes"]),
        "sucesso_por_origem": sorted(sucesso_origem.values(), key=lambda x: -x["comandos"]),
    }
    d.update(_analises(aparelhos, atual, eventos, inicio, fim, tarifa, d))
    d["conclusoes"] = _conclusoes(d)
    return d


def _analises(aparelhos, atual, eventos, inicio, fim, tarifa, d):
    """Análises da 0.7.6: por pessoa, meta de gasto por projeto, custo por semana, ares que viraram a noite ligados,
    dia mais caro e aparelhos do escritório (luzes, cafeteira, persianas). Só com o que está registrado."""
    from . import acesso
    pot = {a["id"]: (a["potencia_w"] or 1000) for a in aparelhos}
    nomes = {a["id"]: a["nome"] for a in aparelhos}
    # por pessoa (quem mandou o comando; sem pessoa = automático: agenda, Alexa, automações, fluxos)
    pessoas = {}
    # nome do cadastro no lugar do e-mail; sem pessoa: origem automática, ou painel de antes da 0.6.9 (quando não se gravava quem fez)
    nome_de = {(u["email"] or "").lower(): (u["nome"] or u["email"]) for u in db.consultar("SELECT email, nome FROM usuarios")}
    AUTO = {"alexa": "Alexa / Google", "sinric": "Alexa / Google", "agenda": "Agenda", "automacao": "Automações", "fluxo": "Fluxos",
            "cena": "Cenas", "temporizador": "Temporizador"}
    for e in eventos:
        quem = e.get("usuario") or None
        base = (e.get("origem") or "").split(":")[0]
        rot = nome_de.get(quem.lower(), quem) if quem else AUTO.get(base, f"{_origem(base) or 'Sem origem'} (sem registro de quem fez)")
        x = pessoas.setdefault(rot, {"pessoa": rot, "automatico": not quem and base in AUTO, "sem_registro": not quem and base not in AUTO, "comandos": 0, "ligou": 0, "desligou": 0, "ajustou": 0, "falhas": 0, "fora_expediente": 0, "ultimo": 0})
        x["comandos"] += 1
        acao = e.get("acao") or ""
        if not e["ok"]:
            x["falhas"] += 1
        elif acao.startswith("Ligar"):
            x["ligou"] += 1
        elif acao.startswith("Desligar"):
            x["desligou"] += 1
        else:
            x["ajustou"] += 1
        dt = _data(e["quando"])
        if dt.weekday() >= 5 or not (EXPEDIENTE[0] <= dt.hour < EXPEDIENTE[1]):
            x["fora_expediente"] += 1
        x["ultimo"] = max(x["ultimo"], e["quando"])
    # meta de gasto mensal por projeto (projetos.meta_custo_mes) contra a projeção de 30 dias
    dias = max(1, round(max(fim - inicio, 1) / 86400))
    metas = []
    ids_proj = sorted({a["projeto_id"] for a in aparelhos if a["projeto_id"]})
    if ids_proj:
        meta_de = {r["id"]: r for r in db.consultar(f"SELECT id, nome, meta_custo_mes FROM projetos WHERE id IN ({','.join('?' * len(ids_proj))})", tuple(ids_proj))}
        for pj in d["por_projeto"]:
            m = meta_de.get(pj.get("projeto_id"))
            if not m or not m.get("meta_custo_mes"):
                continue
            proj = round(pj["custo"] / dias * 30, 2)
            metas.append({"projeto": pj["projeto"], "meta": float(m["meta_custo_mes"]), "gasto": pj["custo"], "projecao_mes": proj,
                          "uso_meta_pct": round(proj / float(m["meta_custo_mes"]) * 100, 1)})
    # custo por semana, dia mais caro e noites com ar ligado (pelas sessões de cada ar)
    semanas, custo_dia, noites = {}, {}, []
    for aid, c in atual.items():
        for x in c["sessoes"]:
            custo = x["horas"] * pot.get(aid, 1000) / 1000 * tarifa
            ini = _data(x["inicio"])
            ano, sem, _ = ini.isocalendar()
            k = f"{ano}-S{sem:02d}"
            w = semanas.setdefault(k, {"semana": k, "comeca": (ini - datetime.timedelta(days=ini.weekday())).strftime("%d/%m"), "horas": 0.0, "custo": 0.0, "sessoes": 0})
            w["horas"] += x["horas"]; w["custo"] += custo; w["sessoes"] += 1
            custo_dia[ini.strftime("%Y-%m-%d")] = custo_dia.get(ini.strftime("%Y-%m-%d"), 0) + custo
            fimd = _data(x["fim"])
            if fimd.date() != ini.date():
                noites.append({"aparelho": nomes.get(aid, ""), "inicio": x["inicio"], "fim": x["fim"], "horas": round(x["horas"], 1),
                               "custo": round(custo, 2), "ligou_por": _origem(x["origem"]), "desligou_por": _origem(x["origem_fim"])})
    for dia in d["por_dia"]:
        dia["custo"] = round(custo_dia.get(dia["dia"], 0), 2)
    mais_caro = max(custo_dia.items(), key=lambda kv: kv[1]) if custo_dia else None
    # aparelhos do escritório (luzes, cafeteira, persianas, fechadura): só para quem vê todos os projetos
    escritorio = []
    if acesso.projetos_permitidos() is None and acesso.aparelhos_permitidos() is None:
        for r in db.consultar("SELECT d.nome, d.tipo, count(*) AS acoes, count(*) FILTER (WHERE e.ok = 0) AS falhas, max(e.quando) AS ultimo "
                              "FROM dispositivos_eventos e JOIN dispositivos d ON d.id = e.dispositivo_id WHERE e.quando BETWEEN ? AND ? "
                              "GROUP BY d.nome, d.tipo ORDER BY count(*) DESC", (inicio, fim)):
            escritorio.append({"aparelho": r["nome"], "tipo": r["tipo"], "acoes": r["acoes"], "falhas": r["falhas"], "ultimo": r["ultimo"]})
    return {
        "por_pessoa": sorted(pessoas.values(), key=lambda x: (x["sem_registro"], x["automatico"], -x["comandos"])),
        "metas": sorted(metas, key=lambda x: -x["uso_meta_pct"]),
        "por_semana": [{**w, "horas": round(w["horas"], 1), "custo": round(w["custo"], 2), "completa": _semana_completa(w["semana"], inicio, fim)} for w in (semanas[k] for k in sorted(semanas))],
        "noites": sorted(noites, key=lambda x: -x["horas"])[:40],
        "dia_mais_caro": {"dia": mais_caro[0], "custo": round(mais_caro[1], 2)} if mais_caro else None,
        "escritorio": escritorio,
    }


def _semana_completa(chave: str, inicio: int, fim: int) -> bool:
    """A semana (seg a dom) cabe inteira no período? Comparar uma semana pela metade com uma inteira engana."""
    ano, sem = int(chave[:4]), int(chave[6:])
    seg = datetime.date.fromisocalendar(ano, sem, 1)
    return _data(inicio).date() <= seg and seg + datetime.timedelta(days=6) <= _data(fim).date()


def _extras(d) -> list[tuple[str, list, list]]:
    """Tabelas da 0.7.6, iguais em todos os formatos: (título, cabeçalho, linhas)."""
    out = []
    if d.get("por_pessoa"):
        out.append(("Quem usou os ares", ["Pessoa ou origem", "Comandos", "Ligou", "Desligou", "Ajustou", "Falhas", "Fora do expediente", "Último"],
                    [[x["pessoa"], x["comandos"], x["ligou"], x["desligou"], x["ajustou"], x["falhas"], x["fora_expediente"], f"{_data(x['ultimo']):%d/%m %H:%M}" if x["ultimo"] else ""] for x in d["por_pessoa"]]))
    if d.get("metas"):
        out.append(("Meta de gasto por projeto", ["Projeto", "Meta mensal", "Gasto no período", "Projeção 30 dias", "Da meta"],
                    [[x["projeto"], _brl(x["meta"]), _brl(x["gasto"]), _brl(x["projecao_mes"]), f"{_n(x['uso_meta_pct'])}%"] for x in d["metas"]]))
    if d.get("por_semana"):
        out.append(("Custo por semana", ["Semana", "Começa em", "Sessões", "Horas ligado", "Custo estimado"],
                    [[x["semana"] + ("" if x.get("completa") else " (parcial)"), x["comeca"], x["sessoes"], _n(x["horas"]), _brl(x["custo"])] for x in d["por_semana"]]))
    if d.get("noites"):
        out.append(("Ares que viraram a noite ligados", ["Aparelho", "Ligou", "Desligou", "Horas", "Custo", "Ligado por", "Desligado por"],
                    [[x["aparelho"], f"{_data(x['inicio']):%d/%m %H:%M}", f"{_data(x['fim']):%d/%m %H:%M}", _n(x["horas"]), _brl(x["custo"]), x["ligou_por"], x["desligou_por"]] for x in d["noites"]]))
    if d.get("escritorio"):
        out.append(("Aparelhos do escritório (luzes, cafeteira, persianas)", ["Aparelho", "Tipo", "Ações", "Falhas", "Última"],
                    [[x["aparelho"], x["tipo"], x["acoes"], x["falhas"], f"{_data(x['ultimo']):%d/%m %H:%M}" if x["ultimo"] else ""] for x in d["escritorio"]]))
    return out


def _conclusoes(d):
    """Leitura automática dos números, em frases curtas (o que um analista diria olhando o relatório)."""
    r, c = d["resumo"], []
    if not r["comandos"]:
        return [{"tipo": "info", "texto": "Nenhum comando no período. Escolha um período maior ou confira se os aparelhos estão em uso."}]
    if r["variacao_custo_pct"] is not None and abs(r["variacao_custo_pct"]) >= 10:
        c.append({"tipo": "alerta" if r["variacao_custo_pct"] > 0 else "bom",
                  "texto": f"O custo estimado {'subiu' if r['variacao_custo_pct'] > 0 else 'caiu'} {_n(abs(r['variacao_custo_pct']))}% em relação ao período anterior ({_brl(r['custo_periodo_anterior'])} → {_brl(r['custo'])})."})
    if r["horas_ligado"]:
        c.append({"tipo": "info", "texto": f"No ritmo atual, a conta de energia dos ares fica em torno de {_brl(r['projecao_mes'])} por mês ({_n(r['projecao_kwh_mes'])} kWh)."})
    if r["fora_expediente_pct"] >= 15:
        c.append({"tipo": "alerta", "texto": f"{_n(r['fora_expediente_pct'])}% do tempo ligado foi fora do expediente ({_n(r['fora_expediente_h'])} h, cerca de {_brl(r['custo_fora_expediente'])}). Uma automação de desligar às {EXPEDIENTE[1]}h evitaria esse gasto."})
    elif r["horas_ligado"]:
        c.append({"tipo": "bom", "texto": f"Uso concentrado no expediente: só {_n(r['fora_expediente_pct'])}% do tempo ligado foi fora dele."})
    longas = [s for s in d["sessoes"] if s["horas"] >= 10]
    if longas:
        s = longas[0]
        c.append({"tipo": "alerta", "texto": f"{len(longas)} vez(es) um ar ficou ligado 10 h ou mais seguidas. A maior: {s['aparelho']}, {_n(s['horas'])} h a partir de {_data(s['inicio']):%d/%m %H:%M}."})
    if r["falhas"]:
        pior = max(d["por_aparelho"], key=lambda a: a["falhas"])
        c.append({"tipo": "alerta", "texto": f"{r['falhas']} comando(s) falharam ({_n(100 - r['sucesso_pct'])}%). O aparelho com mais falhas foi {pior['nome']} ({pior['falhas']}); confira o transmissor {pior['hub'] or 'dele'} e os botões gravados."})
    else:
        c.append({"tipo": "bom", "texto": "Todos os comandos do período foram enviados com sucesso."})
    pico = max(d["por_hora"], key=lambda h: h["comandos"])
    dia_pico = max(d["por_dia_semana"], key=lambda x: x["comandos"])
    c.append({"tipo": "info", "texto": f"O horário de maior uso é por volta das {pico['hora']}h, e o dia da semana mais movimentado é {dia_pico['dia']}."})
    if d["por_origem"]:
        o = d["por_origem"][0]
        c.append({"tipo": "info", "texto": f"A maior parte dos comandos veio de {_origem(o['origem'])} ({round(o['comandos'] / r['comandos'] * 100)}%)."})
    if len(d["por_aparelho"]) > 1 and r["custo"]:
        top = max(d["por_aparelho"], key=lambda a: a["custo"])
        c.append({"tipo": "info", "texto": f"{top['nome']} responde por {round(top['custo'] / r['custo'] * 100)}% do custo estimado."})
    if r["temperatura_media"] and r["temperatura_media"] < 22:
        c.append({"tipo": "alerta", "texto": f"Temperatura média escolhida de {_n(r['temperatura_media'])}°C. Cada grau a mais no frio economiza perto de 8% de energia; 23°C a 24°C costuma ser confortável."})
    for mt in d.get("metas", []):
        if mt["uso_meta_pct"] >= 100:
            c.append({"tipo": "alerta", "texto": f"{mt['projeto']} deve passar da meta de gasto: projeção de {_brl(mt['projecao_mes'])} para uma meta de {_brl(mt['meta'])} por mês ({_n(mt['uso_meta_pct'])}%)."})
        elif mt["uso_meta_pct"] >= 80:
            c.append({"tipo": "info", "texto": f"{mt['projeto']} está perto da meta de gasto ({_n(mt['uso_meta_pct'])}% da meta de {_brl(mt['meta'])} na projeção de 30 dias)."})
    if d.get("noites"):
        n = d["noites"]
        c.append({"tipo": "alerta", "texto": f"{len(n)} vez(es) um ar passou da meia-noite ligado, somando {_n(sum(x['horas'] for x in n))} h e cerca de {_brl(sum(x['custo'] for x in n))}. A maior foi {n[0]['aparelho']} ({_n(n[0]['horas'])} h)."})
    if d.get("dia_mais_caro") and d["dia_mais_caro"]["custo"]:
        dm = d["dia_mais_caro"]
        c.append({"tipo": "info", "texto": f"O dia mais caro foi {dm['dia'][8:10]}/{dm['dia'][5:7]}, com {_brl(dm['custo'])} estimados."})
    completas = [w for w in d.get("por_semana") or [] if w.get("completa")]
    if len(completas) >= 2:
        a, b = completas[-2]["custo"], completas[-1]["custo"]
        if a and abs(b - a) / a >= 0.15:
            c.append({"tipo": "alerta" if b > a else "bom", "texto": f"Na última semana o custo {'subiu' if b > a else 'caiu'} {_n(abs(b - a) / a * 100)}% em relação à anterior ({_brl(a)} → {_brl(b)})."})
    pessoas = [x for x in d.get("por_pessoa", []) if not x["automatico"] and not x["sem_registro"]]
    if pessoas:
        p0 = pessoas[0]
        auto = sum(x["comandos"] for x in d["por_pessoa"] if x["automatico"])
        sem = sum(x["comandos"] for x in d["por_pessoa"] if x["sem_registro"])
        c.append({"tipo": "info", "texto": f"Entre os comandos com a pessoa registrada, quem mais usou foi {p0['pessoa']} ({p0['comandos']}). "
                                           f"{round(auto / r['comandos'] * 100)}% vieram da Alexa ou de rotinas automáticas"
                                           + (f"; {sem} são de antes do sistema registrar quem fez." if sem else ".")})
    if d.get("motivos_falha"):
        m = d["motivos_falha"][0]
        if m["vezes"] >= 3:
            c.append({"tipo": "alerta", "texto": f"A maior causa de falha foi “{m['motivo'].lower()}” ({m['vezes']} vez(es)). {m['dica']}."})
    return c


# ---------------- exportadores ----------------
ROTULO_ORIGEM = {"painel": "Painel", "alexa": "Alexa", "sinric": "Alexa/Google", "agenda": "Agenda", "automacao": "Automação",
                 "cena": "Cena", "sistema": "Sistema", "app": "App", "temporizador": "Temporizador", "api": "API"}
CORES_ORIGEM = {"painel": None, "alexa": "#2563a8", "agenda": "#c2410c", "automacao": "#7c3aed", "cena": "#0891b2"}


def _origem(o):
    base = o.split(":")[0]
    nome = ROTULO_ORIGEM.get(base, base.capitalize())
    return f"{nome}: {o.split(':', 1)[1]}" if ":" in o else nome


def _periodo(d):
    return f"{_data(d['inicio']):%d/%m/%Y} a {_data(d['fim']):%d/%m/%Y}"


def _brl(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _n(v, casas=1):
    if v is None:
        return "—"
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _var(v):
    return "—" if v is None else f"{'+' if v > 0 else ''}{_n(v)}%"


def _cor():
    return (db.cfg("white_label") or {}).get("cor_primaria", "#0f766a")


def _marca_rel():
    """Logo (PNG/JPG/WEBP em bytes) e rodapé que o white label manda colocar nos relatórios."""
    import base64
    m = db.cfg("white_label") or {}
    logo = None
    url = m.get("logo") or ""
    if m.get("relatorio_logo", True) and re.match(r"^data:image/(png|jpeg|webp);base64,", url):
        try:
            logo = base64.b64decode(url.split(",", 1)[1])
        except Exception:  # noqa: BLE001
            logo = None
    return logo, (m.get("relatorio_rodape") or "").strip()


# ---------- modelo oficial (Prefeitura Municipal de Florianópolis) ----------
# Mesma estrutura dos documentos da PMF (ex.: manual da VPN): brasão à esquerda e "Estado de Santa Catarina /
# Prefeitura Municipal de Florianópolis" centralizado em fonte serifada em todas as páginas, linha embaixo, título
# centralizado e seções numeradas "1 – …" / "1.1 – …". O texto do cabeçalho e o órgão saem do white label.
MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
SECOES_RELATORIO = ["Sumário executivo", "Uso ao longo do tempo", "Quando os ares são usados", "Consumo e custo", "Hábitos de uso",
                    "Confiabilidade", "Metodologia"]
AZUL_PMF = "#1f3864"


def _cabecalho_oficial() -> list[str]:
    m = db.cfg("white_label") or {}
    linhas = [x for x in (m.get("relatorio_cabecalho") or ["Estado de Santa Catarina", "Prefeitura Municipal de Florianópolis"]) if x]
    org = (m.get("relatorio_orgao") or "").strip()
    return linhas + ([org] if org else [])


def _brasao() -> bytes | None:
    try:
        with open(os.path.join(os.path.dirname(__file__), "assets", "brasao-pmf.png"), "rb") as f:
            return f.read()
    except OSError:
        return None


def _data_extenso(ts) -> str:
    dt = _data(ts)
    return f"{dt.day} de {MESES[dt.month - 1]} de {dt.year}"


def _identificacao(d) -> list[list[str]]:
    r = d["resumo"]
    filtros = " · ".join(x for x in (d["filtros"]["projeto"] and f"Projeto {d['filtros']['projeto']}", d["filtros"]["aparelho"] and f"Aparelho {d['filtros']['aparelho']}") if x) or "Todos os projetos e aparelhos"
    org = _cabecalho_oficial()
    return [["Órgão", " · ".join(org[1:]) or org[0]], ["Documento", "Relatório de uso dos ares-condicionados"], ["Período", _periodo(d)],
            ["Abrangência", filtros], ["Ares no relatório", str(r["aparelhos"])], ["Expediente considerado", d["expediente"]],
            ["Tarifa de energia", f"{_brl(d['tarifa_kwh'])} por kWh"], ["Emissão", f"{_data(d['gerado_em']):%d/%m/%Y às %H:%M}"],
            ["Emitido por", d.get("gerado_por") or "Sistema Clima Escritório"]]


def exportar(formato: str, d: dict, modelo: str = "pmf"):
    """Gera o arquivo no formato pedido. PDF e Word aceitam o modelo: 'pmf' (oficial da Prefeitura) ou 'moderno'."""
    if formato == "pdf":
        return exportar_pdf(d, modelo)
    if formato == "docx":
        return exportar_docx(d, modelo)
    return FORMATOS[formato](d)


def _tabela_aparelhos(d):
    cab = ["Aparelho", "Projeto", "Comandos", "Falhas", "Sessões", "Horas", "Fora exped. (h)", "kWh", "Custo", "Custo ant."]
    linhas = [[a["nome"], a["projeto"], a["comandos"], a["falhas"], a["sessoes"], _n(a["horas_ligado"]), _n(a["fora_expediente_h"]),
               _n(a["kwh"]), _brl(a["custo"]), _brl(a["custo_anterior"])] for a in d["por_aparelho"]]
    return cab, linhas


def _comparativo(d):
    r = d["resumo"]
    return [["Indicador", "Período", "Período anterior", "Variação"],
            ["Comandos", str(r["comandos"]), str(r["comandos_periodo_anterior"]), _var(r["variacao_comandos_pct"])],
            ["Falhas", str(r["falhas"]), str(r["falhas_periodo_anterior"]), "—"],
            ["Horas ligado", f"{_n(r['horas_ligado'])} h", f"{_n(r['horas_periodo_anterior'])} h", _var(r["variacao_horas_pct"])],
            ["Consumo", f"{_n(r['kwh'])} kWh", f"{_n(r['kwh_periodo_anterior'])} kWh", _var(r["variacao_custo_pct"])],
            ["Custo estimado", _brl(r["custo"]), _brl(r["custo_periodo_anterior"]), _var(r["variacao_custo_pct"])]]


def _resumo_linhas(d):
    r = d["resumo"]
    return [("Período", _periodo(d)), ("Comandos", f"{r['comandos']} ({_var(r['variacao_comandos_pct'])} vs período anterior)"),
            ("Taxa de sucesso", f"{_n(r['sucesso_pct'])}%"), ("Falhas", str(r["falhas"])),
            ("Horas ligado (estimado)", f"{_n(r['horas_ligado'])} h em {r['sessoes']} sessão(ões), média de {_n(r['sessao_media_h'])} h"),
            ("Fora do expediente", f"{_n(r['fora_expediente_h'])} h ({_n(r['fora_expediente_pct'])}%), {_brl(r['custo_fora_expediente'])}"),
            ("Consumo estimado", f"{_n(r['kwh'])} kWh"), ("Custo estimado", f"{_brl(r['custo'])} (tarifa {_brl(d['tarifa_kwh'])}/kWh)"),
            ("Custo médio por dia", _brl(r["custo_dia"])), ("Projeção para 30 dias", f"{_brl(r['projecao_mes'])} ({_n(r['projecao_kwh_mes'])} kWh)"),
            ("Temperatura média escolhida", f"{_n(r['temperatura_media'])}°C" if r["temperatura_media"] else "—"),
            ("Aparelhos", str(r["aparelhos"])), ("Alertas no período", str(r["alertas"]))]


METODOLOGIA = [
    ("Horas ligado", "Tempo entre cada comando de ligar aceito e o desligar seguinte, limitado a 24 h por sessão. Se o período termina com o ar ligado, conta até o fim do período."),
    ("Consumo (kWh)", "Horas ligado multiplicadas pela potência cadastrada em cada aparelho (padrão 1.000 W). É uma estimativa: o compressor não fica 100% do tempo em carga."),
    ("Custo", "Consumo multiplicado pela tarifa configurada em Relatórios (R$/kWh)."),
    ("Fora do expediente", "Parte das sessões em fins de semana ou fora do horário de segunda a sexta, 7h às 19h."),
    ("Período anterior", "Janela de mesma duração imediatamente antes do período escolhido."),
    ("Limitação", "O ar-condicionado não informa o estado de volta: se alguém usar o controle remoto original, o sistema não fica sabendo."),
]


def exportar_json(d):
    return json.dumps(d, ensure_ascii=False, indent=2).encode(), "application/json", "json"


def _tabelas_planas(d):
    return [
        ("resumo", [["indicador", "valor"], *_resumo_linhas(d)]),
        ("comparativo", _comparativo(d)),
        ("conclusoes", [["tipo", "texto"]] + [[c["tipo"], c["texto"]] for c in d["conclusoes"]]),
        ("aparelhos", [_tabela_aparelhos(d)[0], *_tabela_aparelhos(d)[1]]),
        ("projetos", [["projeto", "aparelhos", "comandos", "falhas", "horas", "kwh", "custo"]] + [[x["projeto"], x["aparelhos"], x["comandos"], x["falhas"], x["horas_ligado"], x["kwh"], x["custo"]] for x in d["por_projeto"]]),
        ("por_dia", [["dia", "comandos", "falhas", "horas_ligado", "alexa", "agenda", "painel", "automacao", "cena"]] + [[x["dia"], x["comandos"], x["falhas"], x["horas"], x["alexa"], x["agenda"], x["painel"], x["automacao"], x["cena"]] for x in d["por_dia"]]),
        ("por_hora", [["hora", "comandos"]] + [[x["hora"], x["comandos"]] for x in d["por_hora"]]),
        ("dia_da_semana", [["dia", "comandos", "horas"]] + [[x["dia"], x["comandos"], x["horas"]] for x in d["por_dia_semana"]]),
        ("origens", [["origem", "comandos"]] + [[_origem(x["origem"]), x["comandos"]] for x in d["por_origem"]]),
        ("modos", [["modo", "vezes"]] + [[x["modo"], x["vezes"]] for x in d["modos"]]),
        ("temperaturas", [["temperatura", "vezes"]] + [[x["temperatura"], x["vezes"]] for x in d["temperaturas"]]),
        ("sessoes", [["aparelho", "inicio", "fim", "horas", "fora_expediente_h", "ligou_por", "desligou_por"]] + [[x["aparelho"], _data(x["inicio"]).isoformat(), _data(x["fim"]).isoformat(), x["horas"], x["fora_expediente_h"], _origem(x["origem"]), _origem(x["origem_fim"])] for x in d["sessoes"]]),
        ("transmissores", [["transmissor", "aparelhos", "comandos", "falhas", "sucesso_pct"]] + [[x["transmissor"], x["aparelhos"], x["comandos"], x["falhas"], x["sucesso_pct"]] for x in d["por_transmissor"]]),
        ("rotinas", [["tipo", "nome", "execucoes", "falhas"]] + [[x["tipo"], x["nome"], x["execucoes"], x["falhas"]] for x in d["rotinas"]]),
        ("falhas", [["quando", "aparelho", "acao", "origem", "detalhe"]] + [[_data(x["quando"]).isoformat(), x["aparelho"], x["acao"], _origem(x["origem"]), x["detalhe"]] for x in d["falhas"]]),
        ("motivos_falha", [["motivo", "vezes", "o_que_fazer"]] + [[x["motivo"], x["vezes"], x["dica"]] for x in d.get("motivos_falha", [])]),
        ("sucesso_por_origem", [["origem", "comandos", "falhas", "sucesso_pct"]] + [[_origem(x["origem"]), x["comandos"], x["falhas"], x["sucesso_pct"]] for x in d.get("sucesso_por_origem", [])]),
        *[(re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")[:40], [cab, *linhas]) for t, cab, linhas in _extras(d)],
    ]


def exportar_csv(d):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for i, (nome, linhas) in enumerate(_tabelas_planas(d), start=1):
            from .exportar import celula
            s = io.StringIO(); csv.writer(s, delimiter=";").writerows([[celula(c) for c in l] for l in linhas])
            z.writestr(f"{i:02d}_{nome}.csv", "﻿" + s.getvalue())
        z.writestr("LEIA-ME.txt", f"{d['titulo']}\nPeríodo {_periodo(d)}\nGerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}\n\n"
                   "Arquivos separados por ponto e vírgula, em UTF-8.\n\n" + "\n".join(f"{a}: {b}" for a, b in METODOLOGIA))
    return buf.getvalue(), "application/zip", "zip"


def exportar_xml(d):
    raiz = ET.Element("relatorio", titulo=d["titulo"], inicio=_data(d["inicio"]).isoformat(), fim=_data(d["fim"]).isoformat(),
                      gerado_em=_data(d["gerado_em"]).isoformat(), tarifa_kwh=str(d["tarifa_kwh"]))
    res = ET.SubElement(raiz, "resumo")
    for k, v in d["resumo"].items():
        ET.SubElement(res, k).text = "" if v is None else str(v)
    con = ET.SubElement(raiz, "conclusoes")
    for c in d["conclusoes"]:
        ET.SubElement(con, "conclusao", tipo=c["tipo"]).text = c["texto"]
    for grupo, item, chave in (("aparelhos", "aparelho", "por_aparelho"), ("projetos", "projeto", "por_projeto"), ("dias", "dia", "por_dia"),
                               ("dias_da_semana", "dia", "por_dia_semana"), ("transmissores", "transmissor", "por_transmissor"),
                               ("modos", "modo", "modos"), ("rotinas", "rotina", "rotinas"), ("sessoes", "sessao", "sessoes")):
        g = ET.SubElement(raiz, grupo)
        for x in d[chave]:
            ET.SubElement(g, item, {k: "" if v is None else str(v) for k, v in x.items()})
    fal = ET.SubElement(raiz, "falhas")
    for x in d["falhas"]:
        e = ET.SubElement(fal, "falha", quando=_data(x["quando"]).isoformat(), aparelho=x["aparelho"], origem=x["origem"])
        e.text = f"{x['acao']} · {x['detalhe']}"
    ET.indent(raiz)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(raiz, encoding="utf-8"), "application/xml", "xml"


def exportar_md(d):
    def tab(linhas):
        return ["| " + " | ".join(map(str, linhas[0])) + " |", "|" + "---|" * len(linhas[0]), *["| " + " | ".join(map(str, x)) + " |" for x in linhas[1:]], ""]
    l = [f"# {d['titulo']}", "", f"Período **{_periodo(d)}** · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}", ""]
    l += ["## Sumário executivo", "", *[f"- {'⚠️ ' if c['tipo'] == 'alerta' else ''}{c['texto']}" for c in d["conclusoes"]], ""]
    l += ["## Comparativo", "", *tab(_comparativo(d)), "## Indicadores", "", *tab([["Indicador", "Valor"], *_resumo_linhas(d)])]
    cab, linhas = _tabela_aparelhos(d)
    l += ["## Por aparelho", "", *tab([cab, *linhas])]
    for nome, linhas in _tabelas_planas(d)[4:]:
        if len(linhas) > 1 and nome not in ("por_hora",):
            l += [f"## {nome.replace('_', ' ').capitalize()}", "", *tab(linhas)]
    l += ["## Metodologia", "", *[f"- **{a}**: {b}" for a, b in METODOLOGIA]]
    return "\n".join(l).encode(), "text/markdown; charset=utf-8", "md"


# ---------- HTML (SVG embutido, sem dependências) ----------
def _svg_barras(rotulos, series, cores, altura=180, largura=760, empilhado=True):
    n = max(1, len(rotulos))
    totais = [sum(s[i] for s in series) for i in range(n)] if empilhado else [max(s[i] for s in series) for i in range(n)]
    mx = max(totais + [1])
    bw = largura / n
    partes = []
    for i in range(n):
        y = altura
        for s, c in zip(series, cores):
            h = s[i] / mx * (altura - 10)
            y -= h
            partes.append(f'<rect x="{i * bw + bw * 0.15:.1f}" y="{y:.1f}" width="{bw * 0.7:.1f}" height="{h:.1f}" rx="2" fill="{c}"><title>{html.escape(str(rotulos[i]))}: {s[i]}</title></rect>')
        if n <= 16 or i % max(1, round(n / 12)) == 0:
            partes.append(f'<text x="{i * bw + bw / 2:.1f}" y="{altura + 14}" font-size="10" text-anchor="middle" fill="#71717a">{html.escape(str(rotulos[i]))}</text>')
    return f'<svg viewBox="0 0 {largura} {altura + 20}" width="100%" role="img"><line x1="0" x2="{largura}" y1="{altura}" y2="{altura}" stroke="#e4e4e7"/>{"".join(partes)}</svg>'


def _svg_hbarras(itens, cor, largura=760):
    mx = max([v for _, v, _ in itens] + [1])
    linhas = []
    for i, (rot, v, txt) in enumerate(itens):
        y = i * 30
        linhas.append(f'<text x="0" y="{y + 15}" font-size="12" fill="#18181b">{html.escape(rot[:28])}</text>'
                      f'<rect x="200" y="{y + 4}" width="{max(2, v / mx * (largura - 330)):.1f}" height="16" rx="3" fill="{cor}"/>'
                      f'<text x="{205 + v / mx * (largura - 330):.1f}" y="{y + 16}" font-size="11" fill="#52525b">{html.escape(txt)}</text>')
    return f'<svg viewBox="0 0 {largura} {len(itens) * 30 + 4}" width="100%">{"".join(linhas)}</svg>'


def _svg_rosca(itens, cores):
    import math
    tot = sum(v for _, v in itens) or 1
    a0, partes, leg = -math.pi / 2, [], []
    for i, (rot, v) in enumerate(itens):
        a1 = a0 + v / tot * 2 * math.pi
        large = 1 if a1 - a0 > math.pi else 0
        x0, y0, x1, y1 = 80 + 70 * math.cos(a0), 80 + 70 * math.sin(a0), 80 + 70 * math.cos(a1 - 1e-6), 80 + 70 * math.sin(a1 - 1e-6)
        partes.append(f'<path d="M{x0:.1f},{y0:.1f} A70,70 0 {large} 1 {x1:.1f},{y1:.1f}" fill="none" stroke="{cores[i % len(cores)]}" stroke-width="26"/>')
        leg.append(f'<text x="180" y="{30 + i * 22}" font-size="12"><tspan fill="{cores[i % len(cores)]}">■</tspan> {html.escape(rot)}: {v} ({round(v / tot * 100)}%)</text>')
        a0 = a1
    return f'<svg viewBox="0 0 420 170" width="100%" style="max-width:420px">{"".join(partes)}{"".join(leg)}</svg>'


def exportar_html(d):
    cor = _cor(); e = html.escape; r = d["resumo"]
    dias = d["por_dia"]
    serie_origem = [[x[k] for x in dias] for k in ("painel", "alexa", "agenda", "automacao", "cena")]
    graf_dia = _svg_barras([x["dia"][8:] + "/" + x["dia"][5:7] for x in dias], serie_origem, [cor, "#2563a8", "#c2410c", "#7c3aed", "#0891b2"]) if dias else '<p class="sub">Sem comandos no período.</p>'
    graf_horas = _svg_barras([x["dia"][8:] for x in dias], [[x["horas"] for x in dias]], ["#f59e0b"]) if dias else ""
    graf_hora = _svg_barras([f"{h['hora']}h" for h in d["por_hora"]], [[h["comandos"] for h in d["por_hora"]]], [cor], 140)
    graf_semana = _svg_barras([x["dia"] for x in d["por_dia_semana"]], [[x["comandos"] for x in d["por_dia_semana"]]], [cor], 140, 400)
    graf_custo = _svg_hbarras([(a["nome"], a["custo"], _brl(a["custo"])) for a in sorted(d["por_aparelho"], key=lambda a: -a["custo"])[:12]], cor)
    graf_modos = _svg_rosca([(m["modo"], m["vezes"]) for m in d["modos"]], [cor, "#2563a8", "#f59e0b", "#7c3aed", "#0891b2", "#71717a"]) if d["modos"] else '<p class="sub">Nenhum ligar com modo no período.</p>'
    maxc = max([max(l["horas"]) for l in d["mapa_calor"]] or [1]) or 1
    calor = "".join(f'<tr><th>{l["dia"]}</th>' + "".join(f'<td style="background:color-mix(in srgb,{cor} {v / maxc * 90:.0f}%,#f4f4f5)" title="{l["dia"]} {h}h: {v}"></td>' for h, v in enumerate(l["horas"])) + "</tr>" for l in d["mapa_calor"])
    cab, linhas = _tabela_aparelhos(d)

    def tabela(cab, linhas, num_a_partir=1):
        return ('<table><thead><tr>' + ''.join(f'<th{" class=n" if i >= num_a_partir else ""}>{e(str(c))}</th>' for i, c in enumerate(cab)) + '</tr></thead><tbody>'
                + ''.join('<tr>' + ''.join(f'<td{" class=n" if i >= num_a_partir else ""}>{e(str(v))}</td>' for i, v in enumerate(x)) + '</tr>' for x in linhas) + '</tbody></table>')
    icone = {"alerta": "#d97706", "bom": "#059669", "info": "#2563a8"}
    kpis = [("Custo estimado", _brl(r["custo"]), f"{_var(r['variacao_custo_pct'])} vs anterior"), ("Projeção 30 dias", _brl(r["projecao_mes"]), f"{_n(r['projecao_kwh_mes'])} kWh"),
            ("Horas ligado", f"{_n(r['horas_ligado'])} h", f"{r['sessoes']} sessões · média {_n(r['sessao_media_h'])} h"), ("Fora do expediente", f"{_n(r['fora_expediente_pct'])}%", f"{_n(r['fora_expediente_h'])} h · {_brl(r['custo_fora_expediente'])}"),
            ("Comandos", str(r["comandos"]), f"{_var(r['variacao_comandos_pct'])} vs anterior"), ("Taxa de sucesso", f"{_n(r['sucesso_pct'])}%", f"{r['falhas']} falha(s)")]
    secoes = [
        ("1. Sumário executivo", '<ul class="conc">' + ''.join(f'<li><span style="background:{icone[c["tipo"]]}"></span>{e(c["texto"])}</li>' for c in d["conclusoes"]) + '</ul>'
         + '<h3>Comparativo com o período anterior</h3>' + tabela(_comparativo(d)[0], _comparativo(d)[1:])),
        ("2. Uso ao longo do tempo", '<h3>Comandos por dia, por origem</h3><div class="leg">' + ''.join(f'<span><i style="background:{c}"></i>{n}</span>' for n, c in (("Painel", cor), ("Alexa", "#2563a8"), ("Agenda", "#c2410c"), ("Automação", "#7c3aed"), ("Cena", "#0891b2"))) + f'</div>{graf_dia}<h3>Horas ligado por dia</h3>{graf_horas}'),
        ("3. Quando os ares são usados", f'<div class="g2"><div><h3>Por hora do dia</h3>{graf_hora}</div><div><h3>Por dia da semana</h3>{graf_semana}</div></div><h3>Mapa de uso (dia × hora)</h3><table class="calor"><tr><th></th>'
         + ''.join(f'<th>{h if h % 3 == 0 else ""}</th>' for h in range(24)) + f'</tr>{calor}</table>'),
        ("4. Consumo e custo", f'<h3>Custo estimado por aparelho</h3>{graf_custo}<h3>Detalhe por aparelho</h3>{tabela(cab, linhas, 2)}<h3>Por projeto</h3>'
         + tabela(["Projeto", "Aparelhos", "Comandos", "Falhas", "Horas", "kWh", "Custo"], [[x["projeto"], x["aparelhos"], x["comandos"], x["falhas"], _n(x["horas_ligado"]), _n(x["kwh"]), _brl(x["custo"])] for x in d["por_projeto"]])),
        ("5. Hábitos de uso", f'<div class="g2"><div><h3>Modos escolhidos</h3>{graf_modos}</div><div><h3>Temperaturas pedidas</h3>'
         + (tabela(["Temperatura", "Vezes"], [[f"{t['temperatura']}°C", t["vezes"]] for t in d["temperaturas"]]) if d["temperaturas"] else '<p class="sub">Sem dados.</p>') + '</div></div>'
         + '<h3>Sessões mais longas</h3>' + (tabela(["Aparelho", "Ligou", "Desligou", "Horas", "Fora exped.", "Ligado por", "Desligado por"], [[x["aparelho"], f"{_data(x['inicio']):%d/%m %H:%M}", f"{_data(x['fim']):%d/%m %H:%M}", _n(x["horas"]), _n(x["fora_expediente_h"]), _origem(x["origem"]), _origem(x["origem_fim"])] for x in d["sessoes"][:20]], 3) if d["sessoes"] else '<p class="sub">Nenhuma sessão completa no período.</p>')),
        ("6. Confiabilidade", '<h3>Transmissores</h3>' + (tabela(["Transmissor", "Aparelhos", "Comandos", "Falhas", "Sucesso"], [[x["transmissor"], x["aparelhos"], x["comandos"], x["falhas"], f"{_n(x['sucesso_pct'])}%"] for x in d["por_transmissor"]]) if d["por_transmissor"] else '<p class="sub">Sem dados.</p>')
         + '<h3>Automações e cenas</h3>' + (tabela(["Tipo", "Nome", "Execuções", "Falhas"], [[x["tipo"], x["nome"], x["execucoes"], x["falhas"]] for x in d["rotinas"]], 2) if d["rotinas"] else '<p class="sub">Nenhuma automação ou cena rodou no período.</p>')
         + '<h3>Falhas</h3>' + (tabela(["Quando", "Aparelho", "Ação", "Origem", "Detalhe"], [[f"{_data(x['quando']):%d/%m %H:%M}", x["aparelho"], x["acao"], _origem(x["origem"]), x["detalhe"]] for x in reversed(d["falhas"])], 9) if d["falhas"] else '<p class="sub">Nenhuma falha.</p>')),
        *([("7. Pessoas, metas e escritório", ''.join(f'<h3>{e(t)}</h3>' + tabela(cab, linhas) for t, cab, linhas in _extras(d)))] if _extras(d) else []),
        (f"{8 if _extras(d) else 7}. Metodologia", '<dl>' + ''.join(f'<dt>{e(a)}</dt><dd>{e(b)}</dd>' for a, b in METODOLOGIA) + '</dl>'),
    ]
    filtros = " · ".join(x for x in (d["filtros"]["projeto"] and f"Projeto {d['filtros']['projeto']}", d["filtros"]["aparelho"] and f"Aparelho {d['filtros']['aparelho']}") if x) or "Todos os projetos e aparelhos"
    pagina = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{e(d['titulo'])}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{{box-sizing:border-box}}body{{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;margin:0;background:#fafafa}}main{{max-width:1040px;margin:0 auto;padding:0 28px 60px}}
header{{background:{cor};color:#fff;padding:44px 28px 36px}}header div{{max-width:1040px;margin:0 auto}}header h1{{font-size:30px;margin:6px 0 4px;letter-spacing:-.01em}}header p{{margin:0;opacity:.85}}
.kpi{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:-22px 0 8px}}.kpi div{{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:14px 16px}}.kpi span{{color:#71717a;font-size:12px}}.kpi b{{display:block;font-size:24px;margin:2px 0}}.kpi small{{color:#52525b}}
section{{background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:22px 24px;margin-top:20px;break-inside:avoid-page}}h2{{font-size:18px;margin:0 0 12px;color:{cor}}}h3{{font-size:13px;margin:20px 0 8px;color:#3f3f46;text-transform:uppercase;letter-spacing:.04em}}
.sub{{color:#71717a}}table{{border-collapse:collapse;width:100%;font-size:13px}}th,td{{border-bottom:1px solid #f0f0f2;padding:7px 9px;text-align:left}}th{{background:#f8f8f9;font-weight:600;font-size:12px;color:#52525b}}.n{{text-align:right;font-variant-numeric:tabular-nums}}
.conc{{list-style:none;padding:0;margin:0}}.conc li{{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #f4f4f5}}.conc span{{flex:0 0 8px;height:8px;border-radius:50%;margin-top:7px}}
.g2{{display:grid;grid-template-columns:1fr 1fr;gap:24px}}.leg{{display:flex;gap:14px;font-size:12px;color:#52525b}}.leg i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px}}
.calor td{{width:3.8%;height:20px;padding:0;border:2px solid #fff;border-radius:4px}}.calor th{{font-size:11px;padding:2px 4px;background:none;border:none;color:#71717a}}dt{{font-weight:600;margin-top:10px}}dd{{margin:2px 0 0;color:#52525b}}
footer{{max-width:1040px;margin:24px auto;padding:0 28px;color:#a1a1aa;font-size:12px}}@media (max-width:720px){{.kpi,.g2{{grid-template-columns:1fr}}}}@media print{{body{{background:#fff}}section{{border:none;padding:0}}header{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}}}</style></head><body>
<header><div><p>{e(d['marca'] or '')} · Relatório de uso dos ares-condicionados</p><h1>{e(_periodo(d))}</h1><p>{e(filtros)} · gerado em {_data(d['gerado_em']):%d/%m/%Y às %H:%M}</p></div></header>
<main><div class="kpi">{''.join(f'<div><span>{e(a)}</span><b>{e(b)}</b><small>{e(c)}</small></div>' for a, b, c in kpis)}</div>
{''.join(f'<section><h2>{e(t)}</h2>{c}</section>' for t, c in secoes)}</main>
<footer>{e(_marca_rel()[1]) + ' · ' if _marca_rel()[1] else ''}Estimativas calculadas a partir dos comandos registrados pelo sistema. Tarifa usada: {_brl(d['tarifa_kwh'])}/kWh.</footer></body></html>"""
    return pagina.encode(), "text/html; charset=utf-8", "html"


# ---------- XLSX ----------
def exportar_xlsx(d):
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, LineChart, PieChart, Reference
    from openpyxl.formatting.rule import ColorScaleRule, DataBarRule
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    cor = _cor().lstrip("#").upper()
    cab_estilo = (Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor=cor))
    fino = Border(bottom=Side(style="thin", color="E4E4E7"))
    BRL = '"R$" #,##0.00'

    def folha(titulo, cab, linhas, larguras=None, formatos=None):
        ws = wb.create_sheet(titulo)
        ws.append(cab)
        for c in ws[1]:
            c.font, c.fill = cab_estilo; c.alignment = Alignment(vertical="center", wrap_text=True)
        ws.row_dimensions[1].height = 28
        from .exportar import celula
        for l in linhas:
            ws.append([celula(c) for c in l])
        for row in ws.iter_rows(min_row=2):
            for c in row:
                c.border = fino
        for col, fmt in (formatos or {}).items():
            for c in ws[col][1:]:
                c.number_format = fmt
        ws.freeze_panes = "A2"
        if linhas:
            ws.auto_filter.ref = f"A1:{get_column_letter(len(cab))}{len(linhas) + 1}"
        for i, w in enumerate(larguras or [16] * len(cab), start=1):
            ws.column_dimensions[get_column_letter(i)].width = w
        return ws

    ws = wb.active; ws.title = "Resumo"
    ws.sheet_view.showGridLines = False
    ws["A1"] = d["titulo"]; ws["A1"].font = Font(bold=True, size=16, color=cor)
    ws["A2"] = f"Período {_periodo(d)} · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}"; ws["A2"].font = Font(color="71717A")
    linha = 4
    for a, b in _resumo_linhas(d):
        ws.cell(linha, 1, a).font = Font(color="52525B"); ws.cell(linha, 2, b).font = Font(bold=True); linha += 1
    linha += 1
    ws.cell(linha, 1, "Comparativo com o período anterior").font = Font(bold=True, size=12, color=cor); linha += 1
    for i, l in enumerate(_comparativo(d)):
        for j, v in enumerate(l, start=1):
            c = ws.cell(linha, j, v)
            if i == 0:
                c.font, c.fill = cab_estilo
        linha += 1
    linha += 1
    ws.cell(linha, 1, "Conclusões").font = Font(bold=True, size=12, color=cor); linha += 1
    for c in d["conclusoes"]:
        ws.cell(linha, 1, {"alerta": "Atenção", "bom": "Positivo", "info": "Observação"}[c["tipo"]]).font = Font(bold=True, color={"alerta": "D97706", "bom": "059669", "info": "2563A8"}[c["tipo"]])
        ws.cell(linha, 2, c["texto"]).alignment = Alignment(wrap_text=True, vertical="top"); ws.row_dimensions[linha].height = 32; linha += 1
    ws.column_dimensions["A"].width = 30; ws.column_dimensions["B"].width = 90; ws.column_dimensions["C"].width = 18; ws.column_dimensions["D"].width = 14

    cab = ["Aparelho", "Projeto", "Cômodo", "Transmissor", "Potência (W)", "Comandos", "Falhas", "Sessões", "Horas ligado", "Fora exped. (h)", "Sessão média (h)", "Maior sessão (h)", "kWh", "Custo", "Custo anterior"]
    wa = folha("Aparelhos", cab, [[a["nome"], a["projeto"], a["comodo"], a["hub"], a["potencia_w"], a["comandos"], a["falhas"], a["sessoes"], a["horas_ligado"], a["fora_expediente_h"],
                                   a["sessao_media_h"], a["sessao_maior_h"], a["kwh"], a["custo"], a["custo_anterior"]] for a in d["por_aparelho"]],
               [24, 16, 14, 16, 12, 11, 9, 9, 12, 13, 13, 13, 9, 13, 14], {"N": BRL, "O": BRL})
    n = len(d["por_aparelho"]) + 1
    if n > 1:
        wa.append(["Total", "", "", "", "", f"=SUM(F2:F{n})", f"=SUM(G2:G{n})", f"=SUM(H2:H{n})", f"=SUM(I2:I{n})", f"=SUM(J2:J{n})", "", "", f"=SUM(M2:M{n})", f"=SUM(N2:N{n})", f"=SUM(O2:O{n})"])
        for c in wa[n + 1]:
            c.font = Font(bold=True)
        wa[f"N{n + 1}"].number_format = BRL; wa[f"O{n + 1}"].number_format = BRL
        wa.conditional_formatting.add(f"N2:N{n}", DataBarRule(start_type="min", end_type="max", color=cor))
    folha("Projetos", ["Projeto", "Aparelhos", "Comandos", "Falhas", "Horas", "kWh", "Custo"],
          [[x["projeto"], x["aparelhos"], x["comandos"], x["falhas"], x["horas_ligado"], x["kwh"], x["custo"]] for x in d["por_projeto"]], [22, 11, 11, 9, 10, 10, 13], {"G": BRL})
    wd = folha("Por dia", ["Dia", "Comandos", "Falhas", "Horas ligado", "Painel", "Alexa", "Agenda", "Automação", "Cena"],
               [[x["dia"], x["comandos"], x["falhas"], x["horas"], x["painel"], x["alexa"], x["agenda"], x["automacao"], x["cena"]] for x in d["por_dia"]], [12, 11, 9, 12, 9, 9, 9, 11, 9])
    if d["por_dia"]:
        m = len(d["por_dia"]) + 1
        g = BarChart(); g.type = "col"; g.grouping = "stacked"; g.overlap = 100; g.title = "Comandos por dia e origem"; g.height, g.width = 8, 22
        g.add_data(Reference(wd, min_col=5, max_col=9, min_row=1, max_row=m), titles_from_data=True)
        g.set_categories(Reference(wd, min_col=1, min_row=2, max_row=m)); wd.add_chart(g, "K2")
        lc = LineChart(); lc.title = "Horas ligado por dia"; lc.height, lc.width = 7, 22
        lc.add_data(Reference(wd, min_col=4, min_row=1, max_row=m), titles_from_data=True)
        lc.set_categories(Reference(wd, min_col=1, min_row=2, max_row=m)); wd.add_chart(lc, "K19")
    folha("Por hora", ["Hora", "Comandos"], [[x["hora"], x["comandos"]] for x in d["por_hora"]], [8, 11])
    folha("Dia da semana", ["Dia", "Comandos", "Horas ligado"], [[x["dia"], x["comandos"], x["horas"]] for x in d["por_dia_semana"]], [8, 11, 13])
    wm = folha("Mapa de uso", ["Dia", *[f"{h}h" for h in range(24)]], [[l["dia"], *l["horas"]] for l in d["mapa_calor"]], [8] + [5] * 24)
    wm.conditional_formatting.add("B2:Y8", ColorScaleRule(start_type="min", start_color="F4F4F5", end_type="max", end_color=cor))
    wo = folha("Origens e modos", ["Origem", "Comandos"], [[_origem(x["origem"]), x["comandos"]] for x in d["por_origem"]], [22, 11, 4, 18, 10, 4, 14, 10])
    for i, x in enumerate([["Modo", "Vezes"], *[[m_["modo"], m_["vezes"]] for m_ in d["modos"]]], start=1):
        wo.cell(i, 4, x[0]); wo.cell(i, 5, x[1])
    for i, x in enumerate([["Temperatura", "Vezes"], *[[f"{t['temperatura']}°C", t["vezes"]] for t in d["temperaturas"]]], start=1):
        wo.cell(i, 7, x[0]); wo.cell(i, 8, x[1])
    for c in (wo["D1"], wo["E1"], wo["G1"], wo["H1"]):
        c.font, c.fill = cab_estilo
    if d["por_origem"]:
        pc = PieChart(); pc.title = "Origem dos comandos"; pc.height, pc.width = 8, 12
        pc.add_data(Reference(wo, min_col=2, min_row=1, max_row=len(d["por_origem"]) + 1), titles_from_data=True)
        pc.set_categories(Reference(wo, min_col=1, min_row=2, max_row=len(d["por_origem"]) + 1)); wo.add_chart(pc, "J2")
    folha("Sessões", ["Aparelho", "Ligou", "Desligou", "Horas", "Fora exped. (h)", "Ligado por", "Desligado por"],
          [[x["aparelho"], _data(x["inicio"]).strftime("%d/%m/%Y %H:%M"), _data(x["fim"]).strftime("%d/%m/%Y %H:%M"), x["horas"], x["fora_expediente_h"], _origem(x["origem"]), _origem(x["origem_fim"])] for x in d["sessoes"]],
          [22, 17, 17, 9, 14, 18, 18])
    folha("Confiabilidade", ["Transmissor", "Aparelhos", "Comandos", "Falhas", "Sucesso (%)"], [[x["transmissor"], x["aparelhos"], x["comandos"], x["falhas"], x["sucesso_pct"]] for x in d["por_transmissor"]], [22, 11, 11, 9, 12])
    folha("Automações e cenas", ["Tipo", "Nome", "Execuções", "Falhas"], [[x["tipo"], x["nome"], x["execucoes"], x["falhas"]] for x in d["rotinas"]], [12, 28, 11, 9])
    folha("Falhas", ["Quando", "Aparelho", "Ação", "Origem", "Detalhe"],
          [[_data(x["quando"]).strftime("%d/%m/%Y %H:%M"), x["aparelho"], x["acao"], _origem(x["origem"]), x["detalhe"]] for x in d["falhas"]], [17, 20, 26, 16, 60])
    for t, cab, linhas in _extras(d):
        folha(t[:31], cab, linhas, [max(12, min(40, len(str(c)) + 6)) for c in cab])
    wmet = folha("Metodologia", ["Termo", "Como é calculado"], METODOLOGIA, [22, 110])
    for row in wmet.iter_rows(min_row=2):
        row[1].alignment = Alignment(wrap_text=True, vertical="top")
    wb.properties.title = d["titulo"]; wb.properties.creator = d["marca"] or "Clima Escritório"
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


# ---------- gráficos PNG (Pillow) para o DOCX ----------
def _png_barras(titulo, rotulos, valores, cor, horizontal=False, largura=1600, altura=640, formato=str):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (largura, altura), "white"); dr = ImageDraw.Draw(im)
    try:
        f_t, f, f_p = ImageFont.load_default(36), ImageFont.load_default(24), ImageFont.load_default(22)
    except TypeError:
        f_t = f = f_p = ImageFont.load_default()
    dr.text((30, 20), titulo, fill="#18181b", font=f_t)
    mx = max(valores + [1]) or 1
    n = max(1, len(valores))
    if horizontal:
        top, h = 90, (altura - 110) / n
        for i, (r_, v) in enumerate(zip(rotulos, valores)):
            y = top + i * h
            dr.text((30, y + h * 0.25), str(r_)[:26], fill="#3f3f46", font=f)
            w = (largura - 560) * v / mx
            dr.rounded_rectangle((400, y + h * 0.18, 400 + max(4, w), y + h * 0.82), 6, fill=cor)
            dr.text((412 + w, y + h * 0.27), formato(v), fill="#52525b", font=f_p)
    else:
        base, top, esq = altura - 60, 90, 80
        bw = (largura - esq - 30) / n
        for k in range(5):
            y = base - (base - top) * k / 4
            dr.line((esq, y, largura - 30, y), fill="#eeeef0", width=2)
            dr.text((10, y - 12), formato(round(mx * k / 4, 1)), fill="#a1a1aa", font=f_p)
        passo = max(1, n // 16)
        for i, (r_, v) in enumerate(zip(rotulos, valores)):
            x = esq + i * bw
            hh = (base - top) * v / mx
            if v:
                dr.rounded_rectangle((x + bw * 0.15, base - hh, x + bw * 0.85, base), 5, fill=cor)
            if i % passo == 0:
                dr.text((x + bw / 2 - 18, base + 14), str(r_), fill="#71717a", font=f_p)
    b = io.BytesIO(); im.save(b, "PNG"); b.seek(0)
    return b


def exportar_docx(d, modelo="pmf"):
    """Word do relatório completo, gerado sem python-docx (ver docx_simples)."""
    from .docx_simples import Documento, trecho
    pmf = modelo == "pmf"
    cor = AZUL_PMF.lstrip("#") if pmf else _cor().lstrip("#")
    doc = Documento(cor_titulo=cor)
    cinza = "52525B"
    num = [0, 0]

    def sec(t):
        num[0] += 1; num[1] = 0
        doc.titulo_secao(f"{num[0]} – {t}" if pmf else f"{num[0]}. {t}", 1)

    def sub(t):
        num[1] += 1
        doc.titulo_secao(f"{num[0]}.{num[1]} – {t}" if pmf else t, 2)

    def tabela(cab, linhas):
        doc.tabela([str(c) for c in cab], [[str(v) for v in l] for l in linhas], cor=cor)

    logo, rodape = _marca_rel()
    if pmf:   # cabeçalho oficial em todas as páginas, título, identificação e índice
        doc.cabecalho = {"imagem": _brasao(), "linhas": _cabecalho_oficial(), "fonte": "Times New Roman", "largura_cm": 1.5}
        doc.numerar_paginas = True
        doc.paragrafo(trecho("Relatório de Uso dos Ares-Condicionados", negrito=True, tam=16), alinhar="center", depois=40)
        doc.paragrafo(trecho(_periodo(d), tam=11, cor=cinza), alinhar="center", depois=200)
        doc.tabela(["Identificação", ""], _identificacao(d), cor=cor)
        doc.paragrafo(trecho("Índice", negrito=True, tam=12))
        for i, t in enumerate(SECOES_RELATORIO + ["Encerramento"], start=1):
            doc.paragrafo(f"{i} – {t}", depois=20)
        doc.quebra_pagina()
    if not pmf and logo:   # capa do modelo moderno
        try:
            doc.imagem(logo, 2.2)
        except Exception:  # noqa: BLE001
            pass
    if not pmf:
        _capa_docx_moderna(doc, d, cor, cinza, trecho)
    _corpo_docx(doc, d, cor, sec, sub, tabela, trecho, pmf)
    doc.rodape = rodape or f"{d['titulo']} · {_periodo(d)}"
    doc.titulo, doc.autor = d["titulo"], d["marca"] or ""
    return doc.salvar(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"


def _capa_docx_moderna(doc, d, cor, cinza, trecho):
    r = d["resumo"]
    doc.paragrafo(trecho((d["marca"] or "").upper(), negrito=True, tam=11, cor=cor))
    doc.paragrafo(trecho("Relatório de uso dos ares-condicionados", negrito=True, tam=26))
    doc.paragrafo(trecho(_periodo(d), tam=16, cor=cinza))
    filtros = " · ".join(x for x in (d["filtros"]["projeto"] and f"Projeto {d['filtros']['projeto']}", d["filtros"]["aparelho"] and f"Aparelho {d['filtros']['aparelho']}") if x) or "Todos os projetos e aparelhos"
    doc.paragrafo(f"{filtros}\nGerado em {_data(d['gerado_em']):%d/%m/%Y às %H:%M} · tarifa {_brl(d['tarifa_kwh'])}/kWh")
    kpis = (("Custo estimado", _brl(r["custo"])), ("Projeção 30 dias", _brl(r["projecao_mes"])), ("Horas ligado", f"{_n(r['horas_ligado'])} h"),
            ("Fora do expediente", f"{_n(r['fora_expediente_pct'])}%"), ("Comandos", str(r["comandos"])), ("Taxa de sucesso", f"{_n(r['sucesso_pct'])}%"))
    celula = lambda a, b: [trecho(a + "\n", tam=9, cor="71717A"), trecho(b, negrito=True, tam=18)]  # noqa: E731
    doc.tabela(None, [[celula(*k) for k in kpis[:3]], [celula(*k) for k in kpis[3:]]], zebra=None)
    doc.quebra_pagina()


def _corpo_docx(doc, d, cor, sec, sub, tabela, trecho, pmf):
    r = d["resumo"]  # noqa: F841

    sec("Sumário executivo")
    for c in d["conclusoes"]:
        pre = {"alerta": ("Atenção: ", "D97706"), "bom": ("Positivo: ", "059669"), "info": ("", None)}[c["tipo"]]
        doc.marcador(trecho(pre[0], negrito=True, cor=pre[1]), c["texto"])
    sub("Comparativo com o período anterior")
    cp = _comparativo(d); tabela(cp[0], cp[1:])
    sub("Indicadores")
    tabela(["Indicador", "Valor"], _resumo_linhas(d))

    sec("Uso ao longo do tempo")
    if d["por_dia"]:
        doc.imagem(_png_barras("Comandos por dia", [x["dia"][8:] for x in d["por_dia"]], [x["comandos"] for x in d["por_dia"]], "#" + cor), 17)
        doc.imagem(_png_barras("Horas ligado por dia", [x["dia"][8:] for x in d["por_dia"]], [x["horas"] for x in d["por_dia"]], "#f59e0b", formato=lambda v: _n(v)), 17)
    else:
        doc.paragrafo("Sem comandos no período.")
    sec("Quando os ares são usados")
    doc.imagem(_png_barras("Comandos por hora do dia", [f"{h['hora']}h" for h in d["por_hora"]], [h["comandos"] for h in d["por_hora"]], "#" + cor), 17)
    tabela(["Dia", "Comandos", "Horas ligado"], [[x["dia"], x["comandos"], _n(x["horas"])] for x in d["por_dia_semana"]])

    sec("Consumo e custo")
    top = sorted(d["por_aparelho"], key=lambda a: -a["custo"])[:12]
    if top and any(a["custo"] for a in top):
        doc.imagem(_png_barras("Custo estimado por aparelho", [a["nome"] for a in top], [a["custo"] for a in top], "#" + cor, horizontal=True,
                               altura=120 + 70 * len(top), formato=_brl), 17)
    doc.nova_secao(deitado=True)   # as tabelas largas vão em página deitada
    sub("Detalhe por aparelho")
    tabela(*_tabela_aparelhos(d))
    sub("Por projeto")
    tabela(["Projeto", "Aparelhos", "Comandos", "Falhas", "Horas", "kWh", "Custo"], [[x["projeto"], x["aparelhos"], x["comandos"], x["falhas"], _n(x["horas_ligado"]), _n(x["kwh"]), _brl(x["custo"])] for x in d["por_projeto"]])
    sec("Hábitos de uso")
    if d["modos"]:
        tabela(["Modo", "Vezes"], [[m["modo"], m["vezes"]] for m in d["modos"]])
    if d["temperaturas"]:
        tabela(["Temperatura", "Vezes"], [[f"{t['temperatura']}°C", t["vezes"]] for t in d["temperaturas"]])
    sub("Sessões mais longas")
    if d["sessoes"]:
        tabela(["Aparelho", "Ligou", "Desligou", "Horas", "Fora exped.", "Ligado por", "Desligado por"],
               [[x["aparelho"], f"{_data(x['inicio']):%d/%m %H:%M}", f"{_data(x['fim']):%d/%m %H:%M}", _n(x["horas"]), _n(x["fora_expediente_h"]), _origem(x["origem"]), _origem(x["origem_fim"])] for x in d["sessoes"][:20]])
    else:
        doc.paragrafo("Nenhuma sessão completa no período.")
    sec("Confiabilidade")
    if d["por_transmissor"]:
        tabela(["Transmissor", "Aparelhos", "Comandos", "Falhas", "Sucesso"], [[x["transmissor"], x["aparelhos"], x["comandos"], x["falhas"], f"{_n(x['sucesso_pct'])}%"] for x in d["por_transmissor"]])
    if d["rotinas"]:
        tabela(["Tipo", "Nome", "Execuções", "Falhas"], [[x["tipo"], x["nome"], x["execucoes"], x["falhas"]] for x in d["rotinas"]])
    if d["falhas"]:
        sub("Falhas")
        tabela(["Quando", "Aparelho", "Ação", "Origem", "Detalhe"], [[f"{_data(x['quando']):%d/%m %H:%M}", x["aparelho"], x["acao"], _origem(x["origem"]), x["detalhe"][:140]] for x in reversed(d["falhas"])])
    if _extras(d):
        sec("Pessoas, metas e escritório")
        for t, cab, linhas in _extras(d):
            sub(t)
            tabela(cab, linhas)
    sec("Metodologia")
    for a, b in METODOLOGIA:
        doc.paragrafo(trecho(f"{a}. ", negrito=True), b)
    if pmf:
        sec("Encerramento")
        doc.paragrafo("Relatório emitido pelo sistema Clima Escritório a partir dos registros de uso dos ares-condicionados no período indicado. "
                      "Consumo e custo são estimativas (ver Metodologia).")
        doc.paragrafo(f"Florianópolis, {_data_extenso(d['gerado_em'])}.", alinhar="right", depois=600)
        doc.tabela(None, [[[trecho("_______________________________\n"), trecho("Emitido por\n", negrito=True), trecho(d.get("gerado_por") or "", tam=9)],
                           [trecho("_______________________________\n"), trecho("Responsável pelo setor\n", negrito=True), trecho("Nome e matrícula", tam=9, cor="71717A")]]], zebra=None)


# ---------- PDF ----------
def exportar_pdf(d, modelo="pmf"):
    from reportlab.graphics.charts.barcharts import HorizontalBarChart, VerticalBarChart
    from reportlab.graphics.charts.lineplots import LinePlot
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics.shapes import Drawing, Rect, String
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import (CondPageBreak, KeepTogether, NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                    TableStyle, BaseDocTemplate, Frame)
    pmf = modelo == "pmf"
    cor_hex = AZUL_PMF if pmf else _cor(); cor = colors.HexColor(cor_hex)
    cinza, cinza_claro, texto = colors.HexColor("#71717a"), colors.HexColor("#e4e4e7"), colors.HexColor("#18181b")
    r = d["resumo"]; L, A = A4
    est = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=est["Heading1"], fontName="Helvetica-Bold", fontSize=15, textColor=cor, spaceBefore=4, spaceAfter=8)
    h2 = ParagraphStyle("h2", parent=est["Heading2"], fontName="Helvetica-Bold", fontSize=10.5, textColor=texto, spaceBefore=10, spaceAfter=5)
    corpo = ParagraphStyle("c", parent=est["Normal"], fontSize=9.5, leading=13.5, textColor=texto)
    pq = ParagraphStyle("p", parent=corpo, fontSize=8, leading=10.5, textColor=colors.HexColor("#52525b"))
    cel = ParagraphStyle("cel", parent=corpo, fontSize=8, leading=10)
    cab_st = ParagraphStyle("cab", parent=corpo, fontSize=7.5, leading=9, textColor=colors.white, fontName="Helvetica-Bold")
    buf = io.BytesIO()

    class Numerada(rl_canvas.Canvas):
        """Guarda as páginas para escrever 'Página X de Y' no fim."""
        def __init__(self, *a, **k):
            super().__init__(*a, **k); self._paginas = []

        def showPage(self):
            self._paginas.append(dict(self.__dict__)); self._startPage()

        def save(self):
            total = len(self._paginas)
            for i, estado in enumerate(self._paginas, start=1):
                self.__dict__.update(estado)
                if i > 1 or pmf:
                    self.setFont("Helvetica", 7.5); self.setFillColor(cinza)
                    self.drawRightString(L - 18 * mm, 10 * mm, f"Página {i} de {total}")
                super().showPage()
            super().save()

    def capa(c, doc_):
        c.saveState()
        c.setFillColor(cor); c.rect(0, A - 120 * mm, L, 120 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        logo, _ = _marca_rel()
        x_nome = 20 * mm
        if logo:
            try:
                from reportlab.lib.utils import ImageReader
                c.setFillColor(colors.white); c.roundRect(20 * mm, A - 34 * mm, 14 * mm, 14 * mm, 2.5 * mm, stroke=0, fill=1)
                c.drawImage(ImageReader(io.BytesIO(logo)), 21 * mm, A - 33 * mm, 12 * mm, 12 * mm, preserveAspectRatio=True, mask="auto")
                x_nome = 38 * mm
            except Exception:  # noqa: BLE001 - logo inválido não derruba o relatório
                pass
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10); c.drawString(x_nome, A - 28 * mm, (d["marca"] or "").upper())
        c.setFont("Helvetica-Bold", 28); c.drawString(20 * mm, A - 62 * mm, "Relatório de uso")
        c.drawString(20 * mm, A - 74 * mm, "dos ares-condicionados")
        c.setFont("Helvetica", 14); c.drawString(20 * mm, A - 90 * mm, _periodo(d))
        filtros = " · ".join(x for x in (d["filtros"]["projeto"] and f"Projeto {d['filtros']['projeto']}", d["filtros"]["aparelho"] and f"Aparelho {d['filtros']['aparelho']}") if x) or "Todos os projetos e aparelhos"
        c.setFont("Helvetica", 9.5); c.drawString(20 * mm, A - 100 * mm, filtros)
        # indicadores da capa
        kp = [("Custo estimado", _brl(r["custo"]), f"{_var(r['variacao_custo_pct'])} vs período anterior"),
              ("Projeção 30 dias", _brl(r["projecao_mes"]), f"{_n(r['projecao_kwh_mes'])} kWh"),
              ("Horas ligado", f"{_n(r['horas_ligado'])} h", f"{r['sessoes']} sessões"),
              ("Fora do expediente", f"{_n(r['fora_expediente_pct'])}%", f"{_n(r['fora_expediente_h'])} h · {_brl(r['custo_fora_expediente'])}"),
              ("Comandos", str(r["comandos"]), f"{_var(r['variacao_comandos_pct'])} vs período anterior"),
              ("Taxa de sucesso", f"{_n(r['sucesso_pct'])}%", f"{r['falhas']} falha(s)")]
        w, h = (L - 40 * mm - 2 * 6 * mm) / 3, 30 * mm
        for i, (a, b, s) in enumerate(kp):
            x = 20 * mm + (i % 3) * (w + 6 * mm); y = A - 160 * mm - (i // 3) * (h + 6 * mm)
            c.setStrokeColor(cinza_claro); c.setFillColor(colors.white); c.roundRect(x, y, w, h, 3 * mm, stroke=1, fill=1)
            c.setFillColor(cinza); c.setFont("Helvetica", 8.5); c.drawString(x + 5 * mm, y + h - 8 * mm, a)
            c.setFillColor(texto); c.setFont("Helvetica-Bold", 17); c.drawString(x + 5 * mm, y + h - 17 * mm, b)
            c.setFillColor(cinza); c.setFont("Helvetica", 7.5); c.drawString(x + 5 * mm, y + 5 * mm, s[:48])
        c.setFillColor(cinza); c.setFont("Helvetica", 8.5)
        c.drawString(20 * mm, 30 * mm, f"Gerado em {_data(d['gerado_em']):%d/%m/%Y às %H:%M} · tarifa {_brl(d['tarifa_kwh'])}/kWh · expediente {d['expediente']}")
        c.drawString(20 * mm, 24 * mm, "Valores de consumo e custo são estimativas. Veja a metodologia na última seção.")
        c.restoreState()

    def interna(c, doc_):
        c.saveState()
        c.setFillColor(cor); c.rect(0, A - 6 * mm, L, 6 * mm, stroke=0, fill=1)
        c.setFont("Helvetica", 7.5); c.setFillColor(cinza)
        c.drawString(18 * mm, A - 13 * mm, f"{d['marca'] or ''} · Relatório de uso · {_periodo(d)}")
        c.setStrokeColor(cinza_claro); c.line(18 * mm, 14 * mm, L - 18 * mm, 14 * mm)
        c.drawString(18 * mm, 10 * mm, _marca_rel()[1][:110] or f"Gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}")
        c.restoreState()

    brasao = _brasao() if pmf else None
    linhas_cab = _cabecalho_oficial() if pmf else []

    def oficial(c, doc_):
        """Cabeçalho e rodapé do modelo da Prefeitura, iguais em todas as páginas."""
        c.saveState()
        if brasao:
            try:
                from reportlab.lib.utils import ImageReader
                c.drawImage(ImageReader(io.BytesIO(brasao)), 22 * mm, A - 41 * mm, 18 * mm, 25 * mm, preserveAspectRatio=True, mask="auto")
            except Exception:  # noqa: BLE001
                pass
        c.setFillColor(colors.black)
        for i, t in enumerate(linhas_cab[:3]):
            c.setFont("Times-Roman", 12.5 if i < 2 else 11); c.drawCentredString(L / 2 + 14 * mm, A - 22 * mm - i * 5.6 * mm, t)
        c.setStrokeColor(colors.black); c.setLineWidth(0.6); c.line(20 * mm, A - 45 * mm, L - 20 * mm, A - 45 * mm)
        c.setStrokeColor(cinza_claro); c.setLineWidth(0.4); c.line(20 * mm, 15 * mm, L - 20 * mm, 15 * mm)
        c.setFont("Helvetica", 7.5); c.setFillColor(cinza)
        c.drawString(20 * mm, 10 * mm, (_marca_rel()[1][:90] or f"Relatório de uso dos ares-condicionados · {_periodo(d)}"))
        c.restoreState()

    if pmf:
        doc = BaseDocTemplate(buf, pagesize=A4, title=d["titulo"], author=" · ".join(linhas_cab[1:2]) or "", leftMargin=20 * mm, rightMargin=20 * mm, topMargin=50 * mm, bottomMargin=20 * mm)
        doc.addPageTemplates([PageTemplate("interna", [Frame(20 * mm, 20 * mm, L - 40 * mm, A - 70 * mm, id="q")], onPage=oficial)])
        larg = L - 40 * mm
    else:
        doc = BaseDocTemplate(buf, pagesize=A4, title=d["titulo"], author=d["marca"] or "", leftMargin=18 * mm, rightMargin=18 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
        quadro = Frame(18 * mm, 20 * mm, L - 36 * mm, A - 40 * mm, id="q")
        doc.addPageTemplates([PageTemplate("capa", [Frame(0, 0, L, A, id="c")], onPage=capa), PageTemplate("interna", [quadro], onPage=interna)])
        larg = L - 36 * mm

    def tab(linhas, larguras=None, num_a_partir=1, zebra=True):
        dados = [[Paragraph(html.escape(str(v)), cab_st) for v in linhas[0]]]
        dados += [[Paragraph(html.escape(str(v)), cel) if isinstance(v, str) and len(v) > 28 else v for v in l] for l in linhas[1:]]
        t = Table(dados, colWidths=larguras, repeatRows=1, hAlign="LEFT")
        estilo = [("BACKGROUND", (0, 0), (-1, 0), cor), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                  ("FONTSIZE", (0, 0), (-1, -1), 8), ("LINEBELOW", (0, 1), (-1, -1), 0.4, cinza_claro), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                  ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 4),
                  ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("ALIGN", (num_a_partir, 1), (-1, -1), "RIGHT")]
        if zebra:
            estilo.append(("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8f9")]))
        t.setStyle(TableStyle(estilo))
        return t

    def barras(rotulos, series, cores_, altura=62 * mm, empilhado=False, legenda=None, fmt=None):
        dr = Drawing(larg, altura)
        g = VerticalBarChart(); g.x, g.y, g.width, g.height = 12 * mm, 10 * mm, larg - 16 * mm, altura - 18 * mm
        g.data = series; g.categoryAxis.categoryNames = rotulos
        g.categoryAxis.labels.fontSize = 6.5; g.categoryAxis.labels.fillColor = cinza; g.categoryAxis.strokeColor = cinza_claro
        g.valueAxis.labels.fontSize = 7; g.valueAxis.labels.fillColor = cinza; g.valueAxis.valueMin = 0; g.valueAxis.strokeColor = None
        g.valueAxis.visibleGrid = True; g.valueAxis.gridStrokeColor = colors.HexColor("#f0f0f2")
        if fmt:
            g.valueAxis.labelTextFormat = fmt
        if len(rotulos) > 20:
            g.categoryAxis.labels.angle = 0
            g.categoryAxis.categoryNames = [x if i % max(1, len(rotulos) // 15) == 0 else "" for i, x in enumerate(rotulos)]
        g.barSpacing = 0.5; g.groupSpacing = 3
        if empilhado:
            g.categoryAxis.style = "stacked"
        for i, c_ in enumerate(cores_):
            g.bars[i].fillColor = colors.HexColor(c_) if isinstance(c_, str) else c_; g.bars[i].strokeColor = None
        dr.add(g)
        if legenda:
            x = 12 * mm
            for nome, c_ in legenda:
                dr.add(Rect(x, altura - 4 * mm, 6, 6, fillColor=colors.HexColor(c_) if isinstance(c_, str) else c_, strokeColor=None))
                dr.add(String(x + 9, altura - 4 * mm + 0.5, nome, fontSize=7, fillColor=cinza)); x += 24 * mm
        return dr

    def calor():
        dr = Drawing(larg, 52 * mm)
        mx = max([max(l["horas"]) for l in d["mapa_calor"]] or [1]) or 1
        cw, ch, x0 = (larg - 14 * mm) / 24, 6 * mm, 12 * mm
        for i, l in enumerate(d["mapa_calor"]):
            y = 52 * mm - 10 * mm - i * (ch + 0.8 * mm)
            dr.add(String(0, y + 1.8 * mm, l["dia"], fontSize=7, fillColor=cinza))
            for h, v in enumerate(l["horas"]):
                f = v / mx
                fill = colors.Color(1 - (1 - cor.red) * (0.12 + 0.88 * f), 1 - (1 - cor.green) * (0.12 + 0.88 * f), 1 - (1 - cor.blue) * (0.12 + 0.88 * f)) if v else colors.HexColor("#f4f4f5")
                dr.add(Rect(x0 + h * cw, y, cw - 1, ch, fillColor=fill, strokeColor=None, rx=1.5, ry=1.5))
        for h in range(0, 24, 3):
            dr.add(String(x0 + h * cw, 52 * mm - 3 * mm, f"{h}h", fontSize=6.5, fillColor=cinza))
        return dr

    def linha_horas():
        dr = Drawing(larg, 50 * mm)
        lp = LinePlot(); lp.x, lp.y, lp.width, lp.height = 12 * mm, 8 * mm, larg - 16 * mm, 38 * mm
        lp.data = [[(i, x["horas"]) for i, x in enumerate(d["por_dia"])]]
        lp.lines[0].strokeColor = colors.HexColor("#f59e0b"); lp.lines[0].strokeWidth = 1.8
        lp.xValueAxis.visible = False; lp.yValueAxis.valueMin = 0; lp.yValueAxis.labels.fontSize = 7; lp.yValueAxis.labels.fillColor = cinza
        lp.yValueAxis.visibleGrid = True; lp.yValueAxis.gridStrokeColor = colors.HexColor("#f0f0f2"); lp.yValueAxis.strokeColor = None
        dr.add(lp)
        return dr

    def rosca(itens):
        dr = Drawing(larg / 2, 50 * mm)
        pz = Pie(); pz.x, pz.y, pz.width, pz.height = 4 * mm, 4 * mm, 40 * mm, 40 * mm
        pz.data = [v for _, v in itens] or [1]; pz.labels = None; pz.innerRadiusFraction = 0.55; pz.strokeWidth = 1; pz.strokeColor = colors.white
        paleta = [cor, colors.HexColor("#2563a8"), colors.HexColor("#f59e0b"), colors.HexColor("#7c3aed"), colors.HexColor("#0891b2"), cinza]
        for i in range(len(pz.data)):
            pz.slices[i].fillColor = paleta[i % len(paleta)]
        dr.add(pz)
        tot = sum(v for _, v in itens) or 1
        for i, (n_, v) in enumerate(itens[:6]):
            y = 42 * mm - i * 6 * mm
            dr.add(Rect(50 * mm, y, 6, 6, fillColor=paleta[i % len(paleta)], strokeColor=None))
            dr.add(String(50 * mm + 9, y + 0.5, f"{n_}: {v} ({round(v / tot * 100)}%)", fontSize=7.5, fillColor=texto))
        return dr

    num = [0, 0]

    def S(t):   # seção numerada: "1 – Título" (oficial) ou "1. Título"
        num[0] += 1; num[1] = 0
        return Paragraph(html.escape(f"{num[0]} – {t}" if pmf else f"{num[0]}. {t}"), h1)

    def SS(t):  # subseção: "1.1 – Título" (oficial)
        num[1] += 1
        return Paragraph(html.escape(f"{num[0]}.{num[1]} – {t}" if pmf else t), h2)

    if pmf:
        titulo_st = ParagraphStyle("tit", parent=corpo, fontName="Helvetica-Bold", fontSize=15, leading=19, alignment=1, spaceAfter=2)
        sub_st = ParagraphStyle("sub", parent=corpo, alignment=1, textColor=cinza, spaceAfter=12)
        ident = tab([["Identificação", ""], *_identificacao(d)], [larg * 0.3, larg * 0.7], num_a_partir=9)
        indice = [Paragraph("Índice", h2)] + [Paragraph(f"{i} – {html.escape(t)}", corpo) for i, t in enumerate(SECOES_RELATORIO + ["Encerramento"], start=1)]
        el = [Paragraph("Relatório de Uso dos Ares-Condicionados", titulo_st), Paragraph(html.escape(_periodo(d)), sub_st), ident, Spacer(1, 10), *indice, PageBreak()]
    else:
        el = [NextPageTemplate("interna"), PageBreak()]
    # 1. sumário
    el += [S("Sumário executivo")]
    cores_c = {"alerta": "#d97706", "bom": "#059669", "info": "#2563a8"}
    for c_ in d["conclusoes"]:
        el.append(Table([[ "", Paragraph(html.escape(c_["texto"]), corpo)]], colWidths=[3 * mm, larg - 3 * mm],
                        style=TableStyle([("BACKGROUND", (0, 0), (0, 0), colors.HexColor(cores_c[c_["tipo"]])), ("LEFTPADDING", (1, 0), (1, 0), 8),
                                          ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]), hAlign="LEFT"))
        el.append(Spacer(1, 4))
    el += [SS("Comparativo com o período anterior"), tab(_comparativo(d), [larg * 0.34, larg * 0.22, larg * 0.24, larg * 0.2])]
    el += [SS("Indicadores do período"), tab([["Indicador", "Valor"], *[[a, b] for a, b in _resumo_linhas(d)]], [larg * 0.34, larg * 0.66], num_a_partir=9)]
    # 2. tempo
    el += [PageBreak(), S("Uso ao longo do tempo")]
    if d["por_dia"]:
        rot = [x["dia"][8:] + "/" + x["dia"][5:7] for x in d["por_dia"]]
        el += [SS("Comandos por dia, por origem"),
               barras(rot, [[x[k] for x in d["por_dia"]] for k in ("painel", "alexa", "agenda", "automacao", "cena")], [cor, "#2563a8", "#c2410c", "#7c3aed", "#0891b2"],
                      empilhado=True, legenda=[("Painel", cor), ("Alexa", "#2563a8"), ("Agenda", "#c2410c"), ("Automação", "#7c3aed"), ("Cena", "#0891b2")], altura=70 * mm),
               SS("Horas ligado por dia"), linha_horas()]
    else:
        el.append(Paragraph("Sem comandos no período.", corpo))
    # 3. quando
    el += [CondPageBreak(110 * mm), S("Quando os ares são usados"), SS("Mapa de uso: dia da semana × hora do dia"), calor(),
           SS("Comandos por hora do dia"), barras([f"{h['hora']}h" for h in d["por_hora"]], [[h["comandos"] for h in d["por_hora"]]], [cor], altura=48 * mm),
           KeepTogether([SS("Por dia da semana"), tab([["Dia", "Comandos", "Horas ligado"], *[[x["dia"], x["comandos"], _n(x["horas"])] for x in d["por_dia_semana"]]], [larg * 0.3, larg * 0.35, larg * 0.35])])]
    # 4. consumo
    el += [PageBreak(), S("Consumo e custo")]
    top = sorted(d["por_aparelho"], key=lambda a: -a["custo"])[:12]
    if top and any(a["custo"] for a in top):
        alt = 12 * mm + 8 * mm * len(top)
        dr = Drawing(larg, alt); hb = HorizontalBarChart(); hb.x, hb.y, hb.width, hb.height = 45 * mm, 4 * mm, larg - 70 * mm, alt - 8 * mm
        hb.data = [[a["custo"] for a in reversed(top)]]; hb.categoryAxis.categoryNames = [a["nome"][:26] for a in reversed(top)]
        hb.categoryAxis.labels.fontSize = 7.5; hb.valueAxis.labels.fontSize = 7; hb.valueAxis.valueMin = 0; hb.bars[0].fillColor = cor; hb.bars[0].strokeColor = None
        hb.barLabelFormat = lambda v: _brl(v); hb.barLabels.fontSize = 7; hb.barLabels.boxAnchor = "w"; hb.barLabels.dx = 3
        dr.add(hb); el += [SS("Custo estimado por aparelho"), dr]
    cab, linhas = _tabela_aparelhos(d)
    cab_pdf = ["Aparelho", "Projeto", "Cmds.", "Falhas", "Sessões", "Horas", "Fora exp.", "kWh", "Custo", "Anterior"]
    el += [SS("Detalhe por aparelho"), tab([cab_pdf, *linhas], [larg * w for w in (0.18, 0.15, 0.07, 0.07, 0.08, 0.08, 0.09, 0.08, 0.1, 0.1)], num_a_partir=2),
           Paragraph("Cmds. = comandos enviados · Fora exp. = horas ligado fora do expediente · Anterior = custo no período anterior.", pq)]
    el += [SS("Por projeto"), tab([["Projeto", "Aparelhos", "Comandos", "Falhas", "Horas", "kWh", "Custo"],
                                              *[[x["projeto"], x["aparelhos"], x["comandos"], x["falhas"], _n(x["horas_ligado"]), _n(x["kwh"]), _brl(x["custo"])] for x in d["por_projeto"]]],
                                             [larg * w for w in (0.28, 0.11, 0.12, 0.1, 0.12, 0.12, 0.15)])]
    # 5. hábitos
    el += [CondPageBreak(90 * mm), S("Hábitos de uso")]
    blocos = []
    if d["modos"]:
        blocos.append([SS("Modos escolhidos"), rosca([(m["modo"], m["vezes"]) for m in d["modos"]])])
    if d["temperaturas"]:
        blocos.append([SS("Temperaturas pedidas"), tab([["Temperatura", "Vezes"], *[[f"{t['temperatura']}°C", t["vezes"]] for t in d["temperaturas"]]], [larg * 0.22, larg * 0.2])])
    if blocos:
        el.append(Table([blocos], colWidths=[larg / 2] * len(blocos), style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]), hAlign="LEFT"))
    el.append(SS("Sessões mais longas"))
    el.append(tab([["Aparelho", "Ligou", "Desligou", "Horas", "Fora exped.", "Ligado por", "Desligado por"],
                   *[[x["aparelho"], f"{_data(x['inicio']):%d/%m %H:%M}", f"{_data(x['fim']):%d/%m %H:%M}", _n(x["horas"]), _n(x["fora_expediente_h"]), _origem(x["origem"]), _origem(x["origem_fim"])] for x in d["sessoes"][:20]]],
                  [larg * w for w in (0.2, 0.13, 0.13, 0.09, 0.11, 0.17, 0.17)], num_a_partir=3) if d["sessoes"] else Paragraph("Nenhuma sessão completa no período.", corpo))
    # 6. confiabilidade
    el += [CondPageBreak(80 * mm), S("Confiabilidade")]
    el += [SS("Transmissores"), tab([["Transmissor", "Aparelhos", "Comandos", "Falhas", "Sucesso"], *[[x["transmissor"], x["aparelhos"], x["comandos"], x["falhas"], f"{_n(x['sucesso_pct'])}%"] for x in d["por_transmissor"]]],
                                               [larg * w for w in (0.36, 0.16, 0.16, 0.16, 0.16)]) if d["por_transmissor"] else Paragraph("Sem dados.", corpo)]
    el += [SS("Automações e cenas"), tab([["Tipo", "Nome", "Execuções", "Falhas"], *[[x["tipo"], x["nome"], x["execucoes"], x["falhas"]] for x in d["rotinas"]]], [larg * w for w in (0.18, 0.46, 0.18, 0.18)], num_a_partir=2)
           if d["rotinas"] else Paragraph("Nenhuma automação ou cena rodou no período.", corpo)]
    if d["alertas"]:
        el += [SS("Alertas"), tab([["Quando", "Tipo", "Mensagem", "Situação"], *[[f"{_data(x['criado_em']):%d/%m %H:%M}", x["tipo"], x["mensagem"], "resolvido" if x["resolvido"] else "aberto"] for x in d["alertas"]]],
                                             [larg * w for w in (0.15, 0.17, 0.53, 0.15)], num_a_partir=9)]
    if d["falhas"]:
        el += [SS("Falhas"), tab([["Quando", "Aparelho", "Ação", "Origem", "Detalhe"],
                                             *[[f"{_data(x['quando']):%d/%m %H:%M}", x["aparelho"], x["acao"], _origem(x["origem"]), Paragraph(html.escape(x["detalhe"][:160]), cel)] for x in reversed(d["falhas"])]],
                                            [larg * w for w in (0.12, 0.17, 0.18, 0.13, 0.4)], num_a_partir=9)]
    # 7. metodologia
    if _extras(d):
        el += [CondPageBreak(90 * mm), S("Pessoas, metas e escritório")]
        for t, cab, linhas in _extras(d):
            el += [KeepTogether([SS(t), tab([cab, *linhas], [larg / len(cab)] * len(cab))])] if len(linhas) <= 12 else [SS(t), tab([cab, *linhas], [larg / len(cab)] * len(cab))]
    el += [CondPageBreak(70 * mm), S("Metodologia")]
    for a, b in METODOLOGIA:
        el.append(Paragraph(f"<b>{html.escape(a)}.</b> {html.escape(b)}", corpo)); el.append(Spacer(1, 4))
    if pmf:   # encerramento: local, data por extenso e assinaturas (nomes não são inventados: quem emitiu + campo em branco)
        dir_st = ParagraphStyle("dir", parent=corpo, alignment=2)
        ass = ParagraphStyle("ass", parent=corpo, alignment=1, fontSize=9, leading=12)
        assin = Table([[Paragraph("_______________________________<br/><b>Emitido por</b><br/>" + html.escape(d.get("gerado_por") or ""), ass),
                        Paragraph("_______________________________<br/><b>Responsável pelo setor</b><br/>Nome e matrícula", ass)]], colWidths=[larg / 2, larg / 2])
        el += [CondPageBreak(80 * mm), S("Encerramento"),
               Paragraph("Relatório emitido pelo sistema Clima Escritório a partir dos registros de uso dos ares-condicionados no período indicado. "
                         "Consumo e custo são estimativas (ver Metodologia).", corpo), Spacer(1, 14),
               Paragraph(f"Florianópolis, {_data_extenso(d['gerado_em'])}.", dir_st), Spacer(1, 36), assin]
    doc.build(el, canvasmaker=Numerada)
    return buf.getvalue(), "application/pdf", "pdf"


FORMATOS = {"pdf": exportar_pdf, "docx": exportar_docx, "xlsx": exportar_xlsx, "xml": exportar_xml, "html": exportar_html,
            "csv": exportar_csv, "json": exportar_json, "md": exportar_md}
