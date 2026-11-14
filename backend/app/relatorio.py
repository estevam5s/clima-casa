"""Relatórios: dados consolidados do período + exportação em PDF, DOCX, XLSX, XML, HTML, CSV, JSON e Markdown."""
import csv
import datetime
import html
import io
import json
import zipfile
from xml.etree import ElementTree as ET

from . import db

FUSO = datetime.timezone(datetime.timedelta(hours=-3))
DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]


def _data(ts):
    return datetime.datetime.fromtimestamp(ts, FUSO)


def _horas_ligado(eventos, inicio, fim):
    """Soma o tempo entre cada 'Ligar' e o 'Desligar' seguinte (ou o fim do período, limitado a 24 h)."""
    total, ligado_em = 0, None
    for t in eventos:
        if t["acao"].startswith("Ligar"):
            if ligado_em is None:
                ligado_em = t["quando"]
        elif t["acao"].startswith("Desligar") and ligado_em is not None:
            total += min(t["quando"] - ligado_em, 86400); ligado_em = None
    if ligado_em is not None:
        total += min(fim - ligado_em, 86400)
    return total / 3600


def montar(inicio: int, fim: int, projeto_id: int | None = None, aparelho_id: int | None = None) -> dict:
    tarifa = float(db.cfg("tarifa_kwh", 0.85))
    filtro, p = "", []
    if projeto_id:
        filtro += " AND a.projeto_id = ?"; p.append(projeto_id)
    if aparelho_id:
        filtro += " AND a.id = ?"; p.append(aparelho_id)
    from . import acesso
    f_esc, p_esc = acesso.filtro_sql("a.projeto_id")   # limita aos projetos do usuário
    filtro += f_esc; p += list(p_esc)
    aparelhos = db.consultar(f"SELECT a.id, a.nome, a.comodo, a.marca, a.potencia_w, pr.nome AS projeto FROM aparelhos a "
                             f"LEFT JOIN projetos pr ON pr.id = a.projeto_id WHERE true{filtro} ORDER BY a.nome", p)
    ids = [a["id"] for a in aparelhos] or [-1]
    marcas = ",".join("?" * len(ids))
    eventos = db.consultar(f"SELECT aparelho_id, quando, acao, origem, ok, detalhe FROM atividade WHERE aparelho_id IN ({marcas}) "
                           f"AND quando BETWEEN ? AND ? ORDER BY quando", (*ids, inicio, fim))
    duracao = max(fim - inicio, 1)
    anteriores = db.consultar(f"SELECT ok FROM atividade WHERE aparelho_id IN ({marcas}) AND quando BETWEEN ? AND ?",
                              (*ids, inicio - duracao, inicio))

    por_aparelho, por_dia, por_hora, por_origem, temps = [], {}, [0] * 24, {}, {}
    calor = [[0] * 24 for _ in range(7)]
    for a in aparelhos:
        ev = [e for e in eventos if e["aparelho_id"] == a["id"]]
        horas = _horas_ligado([e for e in ev if e["ok"]], inicio, fim)
        kwh = horas * (a["potencia_w"] or 1000) / 1000
        por_aparelho.append({"id": a["id"], "nome": a["nome"], "comodo": a["comodo"] or "", "projeto": a["projeto"] or "",
                             "comandos": len(ev), "falhas": sum(1 for e in ev if not e["ok"]),
                             "ligou": sum(1 for e in ev if e["acao"].startswith("Ligar") and e["ok"]),
                             "horas_ligado": round(horas, 1), "kwh": round(kwh, 1), "custo": round(kwh * tarifa, 2),
                             "potencia_w": a["potencia_w"] or 1000, "ultimo": ev[-1]["quando"] if ev else None})
    for e in eventos:
        d = _data(e["quando"])
        chave = d.strftime("%Y-%m-%d")
        dia = por_dia.setdefault(chave, {"dia": chave, "comandos": 0, "falhas": 0, "alexa": 0, "agenda": 0, "painel": 0, "automacao": 0})
        dia["comandos"] += 1; dia["falhas"] += 0 if e["ok"] else 1
        base = e["origem"].split(":")[0]
        grupo = "alexa" if base in ("alexa", "sinric") else base if base in ("agenda", "painel", "automacao") else None
        if grupo: dia[grupo] += 1
        por_hora[d.hour] += 1
        calor[(d.weekday() + 1) % 7][d.hour] += 1
        por_origem[base] = por_origem.get(base, 0) + 1
        if e["ok"] and e["acao"].startswith("Ligar") and "°" in e["acao"]:
            try:
                t = int(e["acao"].split("°")[0].split()[-1]); temps[t] = temps.get(t, 0) + 1
            except ValueError:
                pass
    total, falhas = len(eventos), sum(1 for e in eventos if not e["ok"])
    total_ant, falhas_ant = len(anteriores), sum(1 for e in anteriores if not e["ok"])
    horas = sum(a["horas_ligado"] for a in por_aparelho)
    kwh = sum(a["kwh"] for a in por_aparelho)
    temp_media = round(sum(t * n for t, n in temps.items()) / max(1, sum(temps.values())), 1) if temps else None
    falhas_lista = [{"quando": e["quando"], "aparelho": next((a["nome"] for a in aparelhos if a["id"] == e["aparelho_id"]), ""),
                     "acao": e["acao"], "origem": e["origem"], "detalhe": e["detalhe"]} for e in eventos if not e["ok"]][-50:]
    marca = {**{"nome": "Clima Escritório"}, **(db.cfg("white_label") or {})}
    return {
        "titulo": f"Relatório de uso · {marca.get('nome')}", "gerado_em": db.agora(), "inicio": inicio, "fim": fim,
        "tarifa_kwh": tarifa,
        "resumo": {"comandos": total, "falhas": falhas, "sucesso_pct": round((total - falhas) / total * 100, 1) if total else 100.0,
                   "horas_ligado": round(horas, 1), "kwh": round(kwh, 1), "custo": round(kwh * tarifa, 2),
                   "aparelhos": len(aparelhos), "temperatura_media": temp_media,
                   "comandos_periodo_anterior": total_ant, "variacao_comandos_pct": round((total - total_ant) / total_ant * 100, 1) if total_ant else None,
                   "falhas_periodo_anterior": falhas_ant},
        "por_aparelho": sorted(por_aparelho, key=lambda x: -x["comandos"]),
        "por_dia": [por_dia[k] for k in sorted(por_dia)],
        "por_hora": [{"hora": h, "comandos": n} for h, n in enumerate(por_hora)],
        "por_origem": [{"origem": k, "comandos": v} for k, v in sorted(por_origem.items(), key=lambda x: -x[1])],
        "temperaturas": [{"temperatura": t, "vezes": n} for t, n in sorted(temps.items())],
        "mapa_calor": [{"dia": DIAS[i], "horas": linha} for i, linha in enumerate(calor)],
        "falhas": falhas_lista,
    }


# ---------------- exportadores ----------------
def _periodo(d):
    return f"{_data(d['inicio']):%d/%m/%Y} a {_data(d['fim']):%d/%m/%Y}"


def _brl(v):
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _tabela_aparelhos(d):
    cab = ["Aparelho", "Cômodo", "Comandos", "Falhas", "Vezes ligado", "Horas ligado", "kWh", "Custo"]
    linhas = [[a["nome"], a["comodo"], a["comandos"], a["falhas"], a["ligou"], _n(a["horas_ligado"]), _n(a["kwh"]), _brl(a["custo"])] for a in d["por_aparelho"]]
    return cab, linhas


def _n(v):
    return f"{v:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _resumo_linhas(d):
    r = d["resumo"]
    var = f"{'+' if r['variacao_comandos_pct'] > 0 else ''}{_n(r['variacao_comandos_pct'])}% vs período anterior" if r["variacao_comandos_pct"] is not None else "sem período anterior"
    return [("Período", _periodo(d)), ("Comandos", f"{r['comandos']} ({var})"), ("Taxa de sucesso", f"{_n(r['sucesso_pct'])}%"),
            ("Falhas", str(r["falhas"])), ("Horas ligado (estimado)", f"{_n(r['horas_ligado'])} h"),
            ("Consumo estimado", f"{_n(r['kwh'])} kWh"), ("Custo estimado", f"{_brl(r['custo'])} (tarifa {_brl(d['tarifa_kwh'])}/kWh)"),
            ("Temperatura média escolhida", f"{_n(r['temperatura_media'])}°C" if r["temperatura_media"] else "—"), ("Aparelhos", str(r["aparelhos"]))]


def exportar_json(d):
    return json.dumps(d, ensure_ascii=False, indent=2).encode(), "application/json", "json"


def exportar_csv(d):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, linhas in (("resumo", [["indicador", "valor"], *_resumo_linhas(d)]),
                             ("aparelhos", [_tabela_aparelhos(d)[0], *_tabela_aparelhos(d)[1]]),
                             ("por_dia", [["dia", "comandos", "falhas", "alexa", "agenda", "painel", "automacao"]] + [[x["dia"], x["comandos"], x["falhas"], x["alexa"], x["agenda"], x["painel"], x["automacao"]] for x in d["por_dia"]]),
                             ("por_hora", [["hora", "comandos"]] + [[x["hora"], x["comandos"]] for x in d["por_hora"]]),
                             ("falhas", [["quando", "aparelho", "acao", "origem", "detalhe"]] + [[_data(x["quando"]).isoformat(), x["aparelho"], x["acao"], x["origem"], x["detalhe"]] for x in d["falhas"]])):
            s = io.StringIO(); csv.writer(s, delimiter=";").writerows(linhas)
            z.writestr(f"{nome}.csv", "﻿" + s.getvalue())
    return buf.getvalue(), "application/zip", "zip"


def exportar_xml(d):
    raiz = ET.Element("relatorio", titulo=d["titulo"], inicio=_data(d["inicio"]).isoformat(), fim=_data(d["fim"]).isoformat(),
                      gerado_em=_data(d["gerado_em"]).isoformat())
    res = ET.SubElement(raiz, "resumo")
    for k, v in d["resumo"].items():
        ET.SubElement(res, k).text = "" if v is None else str(v)
    ap = ET.SubElement(raiz, "aparelhos")
    for a in d["por_aparelho"]:
        ET.SubElement(ap, "aparelho", {k: "" if v is None else str(v) for k, v in a.items()})
    dias = ET.SubElement(raiz, "por_dia")
    for x in d["por_dia"]:
        ET.SubElement(dias, "dia", {k: str(v) for k, v in x.items()})
    fal = ET.SubElement(raiz, "falhas")
    for x in d["falhas"]:
        e = ET.SubElement(fal, "falha", quando=_data(x["quando"]).isoformat(), aparelho=x["aparelho"], origem=x["origem"])
        e.text = f"{x['acao']} · {x['detalhe']}"
    ET.indent(raiz)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(raiz, encoding="utf-8"), "application/xml", "xml"


def exportar_md(d):
    l = [f"# {d['titulo']}", "", f"Período: **{_periodo(d)}** · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}", "", "## Resumo", "",
         "| Indicador | Valor |", "|---|---|", *[f"| {a} | {b} |" for a, b in _resumo_linhas(d)], "", "## Por aparelho", ""]
    cab, linhas = _tabela_aparelhos(d)
    l += ["| " + " | ".join(cab) + " |", "|" + "---|" * len(cab), *["| " + " | ".join(map(str, x)) + " |" for x in linhas], "", "## Comandos por dia", "",
          "| Dia | Comandos | Falhas | Alexa | Agenda | Painel | Automação |", "|---|---|---|---|---|---|---|",
          *[f"| {x['dia']} | {x['comandos']} | {x['falhas']} | {x['alexa']} | {x['agenda']} | {x['painel']} | {x['automacao']} |" for x in d["por_dia"]],
          "", "## Origem dos comandos", "", *[f"- {x['origem']}: {x['comandos']}" for x in d["por_origem"]], ""]
    if d["falhas"]:
        l += ["## Falhas", "", *[f"- {_data(x['quando']):%d/%m %H:%M} · {x['aparelho']} · {x['acao']} · {x['detalhe']}" for x in d["falhas"]]]
    return "\n".join(l).encode(), "text/markdown; charset=utf-8", "md"


def exportar_html(d):
    cor = (db.cfg("white_label") or {}).get("cor_primaria", "#0f766a")
    e = html.escape
    cab, linhas = _tabela_aparelhos(d)
    maxd = max([x["comandos"] for x in d["por_dia"]] or [1])
    barras = "".join(f'<div class="b" title="{e(x["dia"])}: {x["comandos"]}"><span style="height:{x["comandos"] / maxd * 100:.0f}%"></span><i>{e(x["dia"][8:])}</i></div>' for x in d["por_dia"])
    maxc = max([max(l["horas"]) for l in d["mapa_calor"]] or [1]) or 1
    calor = "".join(f'<tr><th>{l["dia"]}</th>' + "".join(f'<td style="background:color-mix(in srgb,{cor} {v / maxc * 90:.0f}%,#f4f4f5)" title="{v}"></td>' for v in l["horas"]) + "</tr>" for l in d["mapa_calor"])
    pagina = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>{e(d['titulo'])}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font:14px -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:1000px;margin:40px auto;padding:0 24px}}h1{{font-size:24px;margin:0}}
h2{{font-size:16px;margin:32px 0 10px;color:{cor}}}.sub{{color:#71717a}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #e4e4e7;padding:7px 10px;text-align:left}}
th{{background:#f4f4f5;font-weight:600}}.kpi{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}}.kpi div{{border:1px solid #e4e4e7;border-radius:10px;padding:12px}}
.kpi b{{display:block;font-size:22px}}.graf{{display:flex;align-items:flex-end;gap:4px;height:160px;border-bottom:1px solid #e4e4e7}}.b{{flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}}
.b span{{background:{cor};border-radius:3px 3px 0 0;min-height:2px}}.b i{{position:absolute;bottom:-18px;width:100%;text-align:center;font-size:10px;color:#71717a;font-style:normal}}
.calor td{{width:3.8%;height:18px;padding:0;border:1px solid #fff}}.calor th{{font-size:11px;padding:2px 6px;background:none;border:none}}@media print{{body{{margin:0}}}}</style></head><body>
<h1>{e(d['titulo'])}</h1><p class="sub">Período {e(_periodo(d))} · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}</p>
<h2>Resumo</h2><div class="kpi">{''.join(f'<div><span class="sub">{e(a)}</span><b>{e(b)}</b></div>' for a, b in _resumo_linhas(d)[1:])}</div>
<h2>Comandos por dia</h2><div class="graf">{barras or '<p class="sub">Sem dados no período.</p>'}</div><br>
<h2>Por aparelho</h2><table><tr>{''.join(f'<th>{e(c)}</th>' for c in cab)}</tr>{''.join('<tr>' + ''.join(f'<td>{e(str(v))}</td>' for v in x) + '</tr>' for x in linhas)}</table>
<h2>Mapa de uso (dia × hora)</h2><table class="calor"><tr><th></th>{''.join(f'<th>{h}</th>' if h % 3 == 0 else '<th></th>' for h in range(24))}</tr>{calor}</table>
<h2>Origem dos comandos</h2><table><tr><th>Origem</th><th>Comandos</th></tr>{''.join(f'<tr><td>{e(x["origem"])}</td><td>{x["comandos"]}</td></tr>' for x in d['por_origem'])}</table>
{('<h2>Falhas</h2><table><tr><th>Quando</th><th>Aparelho</th><th>Ação</th><th>Detalhe</th></tr>' + ''.join(f'<tr><td>{_data(x["quando"]):%d/%m %H:%M}</td><td>{e(x["aparelho"])}</td><td>{e(x["acao"])}</td><td>{e(x["detalhe"])}</td></tr>' for x in d['falhas']) + '</table>') if d['falhas'] else ''}
<p class="sub" style="margin-top:32px">Horas ligado, consumo e custo são estimativas a partir dos comandos enviados e da potência cadastrada de cada aparelho.</p></body></html>"""
    return pagina.encode(), "text/html; charset=utf-8", "html"


def exportar_xlsx(d):
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.styles import Alignment, Font, PatternFill
    wb = Workbook()
    cor = (db.cfg("white_label") or {}).get("cor_primaria", "#0f766a").lstrip("#").upper()
    cab_estilo = (Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor=cor))

    def folha(ws, cab, linhas, larguras=None):
        ws.append(cab)
        for c in ws[1]:
            c.font, c.fill = cab_estilo; c.alignment = Alignment(vertical="center")
        for l in linhas:
            ws.append(list(l))
        ws.freeze_panes = "A2"
        for i, w in enumerate(larguras or [18] * len(cab), start=1):
            ws.column_dimensions[chr(64 + i)].width = w
    ws = wb.active; ws.title = "Resumo"
    ws.append([d["titulo"]]); ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Período {_periodo(d)}"]); ws.append([])
    for a, b in _resumo_linhas(d):
        ws.append([a, b])
    ws.column_dimensions["A"].width = 32; ws.column_dimensions["B"].width = 48
    cab, linhas = _tabela_aparelhos(d)
    folha(wb.create_sheet("Aparelhos"), cab, linhas, [24, 16, 11, 9, 13, 13, 9, 13])
    wsd = wb.create_sheet("Por dia")
    folha(wsd, ["Dia", "Comandos", "Falhas", "Alexa", "Agenda", "Painel", "Automação"],
          [[x["dia"], x["comandos"], x["falhas"], x["alexa"], x["agenda"], x["painel"], x["automacao"]] for x in d["por_dia"]], [13, 11, 9, 9, 9, 9, 11])
    if d["por_dia"]:
        g = BarChart(); g.title = "Comandos por dia"; g.y_axis.title = "Comandos"; g.height, g.width = 8, 18
        g.add_data(Reference(wsd, min_col=2, min_row=1, max_row=len(d["por_dia"]) + 1), titles_from_data=True)
        g.set_categories(Reference(wsd, min_col=1, min_row=2, max_row=len(d["por_dia"]) + 1)); wsd.add_chart(g, "I2")
    folha(wb.create_sheet("Por hora"), ["Hora", "Comandos"], [[x["hora"], x["comandos"]] for x in d["por_hora"]], [8, 11])
    folha(wb.create_sheet("Mapa de uso"), ["Dia", *[f"{h}h" for h in range(24)]], [[l["dia"], *l["horas"]] for l in d["mapa_calor"]], [8] + [5] * 24)
    folha(wb.create_sheet("Falhas"), ["Quando", "Aparelho", "Ação", "Origem", "Detalhe"],
          [[_data(x["quando"]).strftime("%d/%m/%Y %H:%M"), x["aparelho"], x["acao"], x["origem"], x["detalhe"]] for x in d["falhas"]], [17, 20, 26, 16, 50])
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


def exportar_docx(d):
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor
    cor = (db.cfg("white_label") or {}).get("cor_primaria", "#0f766a").lstrip("#")
    rgb = RGBColor(int(cor[0:2], 16), int(cor[2:4], 16), int(cor[4:6], 16))
    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"; doc.styles["Normal"].font.size = Pt(10.5)
    t = doc.add_heading(d["titulo"], 0); t.alignment = WD_ALIGN_PARAGRAPH.LEFT
    doc.add_paragraph(f"Período {_periodo(d)} · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}")

    def tabela(cab, linhas):
        tb = doc.add_table(rows=1, cols=len(cab)); tb.style = "Light Grid Accent 1"
        for i, c in enumerate(cab):
            tb.rows[0].cells[i].text = str(c)
        for l in linhas:
            cel = tb.add_row().cells
            for i, v in enumerate(l):
                cel[i].text = str(v)
    for titulo, cab, linhas in (("Resumo", ["Indicador", "Valor"], _resumo_linhas(d)), ("Por aparelho", *_tabela_aparelhos(d)),
                                ("Comandos por dia", ["Dia", "Comandos", "Falhas", "Alexa", "Agenda", "Painel", "Automação"],
                                 [[x["dia"], x["comandos"], x["falhas"], x["alexa"], x["agenda"], x["painel"], x["automacao"]] for x in d["por_dia"]]),
                                ("Origem dos comandos", ["Origem", "Comandos"], [[x["origem"], x["comandos"]] for x in d["por_origem"]])):
        h = doc.add_heading(titulo, 1)
        for r in h.runs:
            r.font.color.rgb = rgb
        tabela(cab, linhas)
    if d["falhas"]:
        doc.add_heading("Falhas", 1)
        tabela(["Quando", "Aparelho", "Ação", "Detalhe"], [[_data(x["quando"]).strftime("%d/%m %H:%M"), x["aparelho"], x["acao"], x["detalhe"]] for x in d["falhas"]])
    doc.add_paragraph().add_run("Horas ligado, consumo e custo são estimativas a partir dos comandos enviados e da potência cadastrada.").italic = True
    buf = io.BytesIO(); doc.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"


def exportar_pdf(d):
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    cor = colors.HexColor((db.cfg("white_label") or {}).get("cor_primaria", "#0f766a"))
    est = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=est["Title"], alignment=0, fontSize=20, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=est["Heading2"], textColor=cor, spaceBefore=12, spaceAfter=6)
    pq = ParagraphStyle("p", parent=est["Normal"], fontSize=9, textColor=colors.HexColor("#52525b"))
    buf = io.BytesIO()

    def rodape(canvas, doc_):
        canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#71717a"))
        canvas.drawString(18 * mm, 10 * mm, d["titulo"]); canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Página {doc_.page}")
        canvas.restoreState()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm, title=d["titulo"])
    estilo_tab = TableStyle([("BACKGROUND", (0, 0), (-1, 0), cor), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                             ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4e4e7")),
                             ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8f9")]), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")])
    el = [Paragraph(html.escape(d["titulo"]), h1), Paragraph(f"Período {_periodo(d)} · gerado em {_data(d['gerado_em']):%d/%m/%Y %H:%M}", pq), Spacer(1, 6)]
    el += [Paragraph("Resumo", h2), Table([["Indicador", "Valor"], *[[a, b] for a, b in _resumo_linhas(d)]], colWidths=[60 * mm, 110 * mm], style=estilo_tab, hAlign="LEFT")]
    if d["por_dia"]:
        desenho = Drawing(170 * mm, 55 * mm)
        g = VerticalBarChart(); g.x, g.y, g.width, g.height = 10 * mm, 8 * mm, 155 * mm, 42 * mm
        g.data = [[x["comandos"] for x in d["por_dia"]]]
        g.categoryAxis.categoryNames = [x["dia"][8:] for x in d["por_dia"]]
        g.categoryAxis.labels.fontSize = 6; g.valueAxis.labels.fontSize = 7; g.valueAxis.valueMin = 0
        g.bars[0].fillColor = cor; g.bars[0].strokeColor = None
        desenho.add(g)
        el += [Paragraph("Comandos por dia", h2), desenho]
    cab, linhas = _tabela_aparelhos(d)
    el += [Paragraph("Por aparelho", h2), Table([cab, *linhas], repeatRows=1, style=estilo_tab, hAlign="LEFT")]
    el += [Paragraph("Origem dos comandos", h2), Table([["Origem", "Comandos"], *[[x["origem"], x["comandos"]] for x in d["por_origem"]]], colWidths=[85 * mm, 30 * mm], style=estilo_tab, hAlign="LEFT")]
    if d["falhas"]:
        el += [Paragraph("Falhas", h2), Table([["Quando", "Aparelho", "Ação", "Detalhe"],
               *[[_data(x["quando"]).strftime("%d/%m %H:%M"), Paragraph(html.escape(x["aparelho"]), pq), Paragraph(html.escape(x["acao"]), pq), Paragraph(html.escape(x["detalhe"][:120]), pq)] for x in d["falhas"]]],
               colWidths=[22 * mm, 34 * mm, 45 * mm, 73 * mm], repeatRows=1, style=estilo_tab, hAlign="LEFT")]
    el += [Spacer(1, 10), Paragraph("Horas ligado, consumo e custo são estimativas a partir dos comandos enviados e da potência cadastrada de cada aparelho.", pq)]
    doc.build(el, onFirstPage=rodape, onLaterPages=rodape)
    return buf.getvalue(), "application/pdf", "pdf"


FORMATOS = {"pdf": exportar_pdf, "docx": exportar_docx, "xlsx": exportar_xlsx, "xml": exportar_xml, "html": exportar_html,
            "csv": exportar_csv, "json": exportar_json, "md": exportar_md}
