"""Exportador genérico de documentos tabulares: PDF, DOCX, XLSX, CSV (zip), HTML, XML, JSON e Markdown.

Documento = {
  "titulo": str, "subtitulo": str, "cor": "#rrggbb",
  "resumo": [(rotulo, valor)],
  "grafico": {"titulo": str, "rotulos": [str], "valores": [num]} | None,
  "secoes": [{"titulo": str, "nota": str, "cabecalho": [str], "linhas": [[...]], "larguras": [mm] | None}],
  "rodape": str, "dados": {...}   # "dados" vai inteiro no JSON
}
"""
import csv
import html
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET


def _s(v):
    return "" if v is None else str(v)


def _slug(t):
    return re.sub(r"[^a-z0-9]+", "_", t.lower().encode("ascii", "ignore").decode()).strip("_") or "secao"


def json_(doc):
    return json.dumps(doc.get("dados") or {k: v for k, v in doc.items() if k != "cor"}, ensure_ascii=False, indent=2, default=str).encode(), "application/json", "json"


def csv_(doc):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        partes = [("resumo", ["indicador", "valor"], doc["resumo"])] + [(_slug(s["titulo"]), s["cabecalho"], s["linhas"]) for s in doc["secoes"]]
        for nome, cab, linhas in partes:
            t = io.StringIO(); w = csv.writer(t, delimiter=";"); w.writerow(cab); w.writerows([[_s(c) for c in l] for l in linhas])
            z.writestr(f"{nome}.csv", "﻿" + t.getvalue())
    return buf.getvalue(), "application/zip", "zip"


def xml_(doc):
    raiz = ET.Element("relatorio", titulo=doc["titulo"], periodo=doc.get("subtitulo", ""))
    r = ET.SubElement(raiz, "resumo")
    for k, v in doc["resumo"]:
        ET.SubElement(r, "indicador", nome=k).text = _s(v)
    for s in doc["secoes"]:
        e = ET.SubElement(raiz, "secao", titulo=s["titulo"])
        chaves = [_slug(c) for c in s["cabecalho"]]
        for l in s["linhas"]:
            ET.SubElement(e, "linha", {k: _s(v) for k, v in zip(chaves, l)})
    ET.indent(raiz)
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(raiz, encoding="utf-8"), "application/xml", "xml"


def md_(doc):
    l = [f"# {doc['titulo']}", "", doc.get("subtitulo", ""), "", "## Resumo", "", "| Indicador | Valor |", "|---|---|",
         *[f"| {a} | {_s(b)} |" for a, b in doc["resumo"]]]
    for s in doc["secoes"]:
        l += ["", f"## {s['titulo']}", ""] + ([s["nota"], ""] if s.get("nota") else [])
        if not s["linhas"]:
            l.append("_Sem registros no período._"); continue
        l += ["| " + " | ".join(s["cabecalho"]) + " |", "|" + "---|" * len(s["cabecalho"]),
              *["| " + " | ".join(_s(c).replace("|", "/") for c in x) + " |" for x in s["linhas"]]]
    if doc.get("rodape"):
        l += ["", f"_{doc['rodape']}_"]
    return "\n".join(l).encode(), "text/markdown; charset=utf-8", "md"


def html_(doc):
    e, cor = html.escape, doc.get("cor", "#0f766a")
    g = doc.get("grafico")
    barras = ""
    if g and g["valores"]:
        m = max(g["valores"]) or 1
        barras = "".join(f'<div class="b" title="{e(r)}: {v}"><span style="height:{v / m * 100:.0f}%"></span><i>{e(r)}</i></div>' for r, v in zip(g["rotulos"], g["valores"]))
        barras = f'<h2>{e(g["titulo"])}</h2><div class="graf">{barras}</div><br>'
    secoes = ""
    for s in doc["secoes"]:
        corpo = "".join("<tr>" + "".join(f"<td>{e(_s(c))}</td>" for c in l) + "</tr>" for l in s["linhas"]) or f'<tr><td colspan="{len(s["cabecalho"])}" class="sub">Sem registros no período.</td></tr>'
        secoes += f'<h2>{e(s["titulo"])}</h2>' + (f'<p class="sub">{e(s["nota"])}</p>' if s.get("nota") else "") + \
            f'<table><tr>{"".join(f"<th>{e(c)}</th>" for c in s["cabecalho"])}</tr>{corpo}</table>'
    pagina = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(doc['titulo'])}</title>
<style>body{{font:14px -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;max-width:1100px;margin:40px auto;padding:0 24px}}h1{{font-size:24px;margin:0}}h2{{font-size:16px;margin:30px 0 10px;color:{cor}}}
.sub{{color:#71717a}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #e4e4e7;padding:6px 9px;text-align:left;font-size:13px;vertical-align:top}}th{{background:#f4f4f5}}
.kpi{{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}}.kpi div{{border:1px solid #e4e4e7;border-radius:10px;padding:11px}}.kpi b{{display:block;font-size:20px}}
.graf{{display:flex;align-items:flex-end;gap:3px;height:150px;border-bottom:1px solid #e4e4e7}}.b{{flex:1;max-width:48px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;position:relative}}
.b span{{background:{cor};border-radius:3px 3px 0 0;min-height:2px}}.b i{{position:absolute;bottom:-18px;width:100%;text-align:center;font-size:10px;color:#71717a;font-style:normal}}</style></head><body>
<h1>{e(doc['titulo'])}</h1><p class="sub">{e(doc.get('subtitulo', ''))}</p><h2>Resumo</h2>
<div class="kpi">{''.join(f'<div><span class="sub">{e(a)}</span><b>{e(_s(b))}</b></div>' for a, b in doc['resumo'])}</div>{barras}{secoes}
<p class="sub" style="margin-top:30px">{e(doc.get('rodape', ''))}</p></body></html>"""
    return pagina.encode(), "text/html; charset=utf-8", "html"


def xlsx_(doc):
    from openpyxl import Workbook
    from openpyxl.chart import BarChart, Reference
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter
    wb = Workbook()
    fonte, fundo = Font(bold=True, color="FFFFFF"), PatternFill("solid", fgColor=doc.get("cor", "#0f766a").lstrip("#").upper())
    ws = wb.active; ws.title = "Resumo"
    ws.append([doc["titulo"]]); ws["A1"].font = Font(bold=True, size=14); ws.append([doc.get("subtitulo", "")]); ws.append([])
    for a, b in doc["resumo"]:
        ws.append([a, b])
    ws.column_dimensions["A"].width = 34; ws.column_dimensions["B"].width = 50
    g = doc.get("grafico")
    if g and g["valores"]:
        wg = wb.create_sheet("Gráfico")
        wg.append(["Rótulo", g["titulo"]])
        for r, v in zip(g["rotulos"], g["valores"]):
            wg.append([r, v])
        ch = BarChart(); ch.title = g["titulo"]; ch.height, ch.width = 8, 18
        ch.add_data(Reference(wg, min_col=2, min_row=1, max_row=len(g["valores"]) + 1), titles_from_data=True)
        ch.set_categories(Reference(wg, min_col=1, min_row=2, max_row=len(g["valores"]) + 1)); wg.add_chart(ch, "D2")
    for s in doc["secoes"]:
        w = wb.create_sheet(s["titulo"][:31].replace("/", "-"))
        w.append(s["cabecalho"])
        for c in w[1]:
            c.font, c.fill = fonte, fundo
        for l in s["linhas"]:
            w.append([c if isinstance(c, (int, float)) else _s(c) for c in l])
        w.freeze_panes = "A2"
        for i, c in enumerate(s["cabecalho"], start=1):
            maior = max([len(_s(c))] + [len(_s(l[i - 1])) for l in s["linhas"][:200]])
            w.column_dimensions[get_column_letter(i)].width = min(60, max(9, maior + 2))
    buf = io.BytesIO(); wb.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"


def docx_(doc):
    from docx import Document
    from docx.enum.section import WD_ORIENT
    from docx.shared import Pt, RGBColor
    cor = doc.get("cor", "#0f766a").lstrip("#")
    d = Document()
    sec = d.sections[0]
    sec.orientation, sec.page_width, sec.page_height = WD_ORIENT.LANDSCAPE, sec.page_height, sec.page_width
    d.styles["Normal"].font.name = "Calibri"; d.styles["Normal"].font.size = Pt(9.5)
    d.add_heading(doc["titulo"], 0); d.add_paragraph(doc.get("subtitulo", ""))

    def tabela(cab, linhas):
        t = d.add_table(rows=1, cols=len(cab)); t.style = "Light Grid Accent 1"
        for i, c in enumerate(cab):
            t.rows[0].cells[i].text = c
        for l in linhas[:500]:
            cel = t.add_row().cells
            for i, v in enumerate(l):
                cel[i].text = _s(v)
    for titulo, cab, linhas, nota in [("Resumo", ["Indicador", "Valor"], doc["resumo"], "")] + [(s["titulo"], s["cabecalho"], s["linhas"], s.get("nota", "")) for s in doc["secoes"]]:
        h = d.add_heading(titulo, 1)
        for r in h.runs:
            r.font.color.rgb = RGBColor(int(cor[0:2], 16), int(cor[2:4], 16), int(cor[4:6], 16))
        if nota:
            d.add_paragraph(nota)
        if linhas:
            tabela(cab, linhas)
        else:
            d.add_paragraph("Sem registros no período.")
    if doc.get("rodape"):
        d.add_paragraph().add_run(doc["rodape"]).italic = True
    buf = io.BytesIO(); d.save(buf)
    return buf.getvalue(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"


def pdf_(doc):
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    cor = colors.HexColor(doc.get("cor", "#0f766a"))
    pagina = landscape(A4)
    est = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=est["Title"], alignment=0, fontSize=19, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=est["Heading2"], textColor=cor, spaceBefore=12, spaceAfter=5)
    pq = ParagraphStyle("p", parent=est["Normal"], fontSize=8, leading=10, textColor=colors.HexColor("#3f3f46"))
    cinza = ParagraphStyle("c", parent=pq, textColor=colors.HexColor("#71717a"))
    estilo = TableStyle([("BACKGROUND", (0, 0), (-1, 0), cor), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                         ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
                         ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4e4e7")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                         ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8f9")])])
    largura = pagina[0] - 30 * mm
    buf = io.BytesIO()

    def rodape(c, dd):
        c.saveState(); c.setFont("Helvetica", 7.5); c.setFillColor(colors.HexColor("#71717a"))
        c.drawString(15 * mm, 8 * mm, doc["titulo"]); c.drawRightString(pagina[0] - 15 * mm, 8 * mm, f"Página {dd.page}"); c.restoreState()
    el = [Paragraph(html.escape(doc["titulo"]), h1), Paragraph(html.escape(doc.get("subtitulo", "")), cinza), Spacer(1, 4),
          Paragraph("Resumo", h2)]
    pares = [[Paragraph(html.escape(a), pq), Paragraph(html.escape(_s(b)), pq)] for a, b in doc["resumo"]]
    metade = (len(pares) + 1) // 2
    grade = [[*pares[i], *(pares[i + metade] if i + metade < len(pares) else ["", ""])] for i in range(metade)]
    el.append(Table(grade, colWidths=[largura * 0.2, largura * 0.3] * 2, hAlign="LEFT",
                    style=TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e4e4e7")), ("VALIGN", (0, 0), (-1, -1), "TOP")])))
    g = doc.get("grafico")
    if g and g["valores"]:
        dw = Drawing(largura, 52 * mm)
        b = VerticalBarChart(); b.x, b.y, b.width, b.height = 10 * mm, 8 * mm, largura - 15 * mm, 40 * mm
        b.data = [g["valores"]]; b.categoryAxis.categoryNames = g["rotulos"]; b.valueAxis.valueMin = 0
        b.categoryAxis.labels.fontSize = 6; b.valueAxis.labels.fontSize = 7; b.bars[0].fillColor = cor; b.bars[0].strokeColor = None
        b.barWidth = 6
        dw.add(b); el += [Paragraph(html.escape(g["titulo"]), h2), dw]
    for s in doc["secoes"]:
        el.append(Paragraph(html.escape(s["titulo"]), h2))
        if s.get("nota"):
            el.append(Paragraph(html.escape(s["nota"]), cinza))
        if not s["linhas"]:
            el.append(Paragraph("Sem registros no período.", cinza)); continue
        n = len(s["cabecalho"])
        larg = [w * mm for w in s["larguras"]] if s.get("larguras") else [largura / n] * n
        linhas = [[Paragraph(html.escape(_s(c))[:400], pq) for c in l] for l in s["linhas"][:400]]
        el.append(Table([s["cabecalho"], *linhas], colWidths=larg, repeatRows=1, hAlign="LEFT", style=estilo))
    if doc.get("rodape"):
        el += [Spacer(1, 8), Paragraph(html.escape(doc["rodape"]), cinza)]
    SimpleDocTemplate(buf, pagesize=pagina, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                      title=doc["titulo"]).build(el, onFirstPage=rodape, onLaterPages=rodape)
    return buf.getvalue(), "application/pdf", "pdf"


FORMATOS = {"pdf": pdf_, "docx": docx_, "xlsx": xlsx_, "csv": csv_, "html": html_, "xml": xml_, "json": json_, "md": md_}
