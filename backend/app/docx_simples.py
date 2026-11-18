"""Gerador mínimo de Word (.docx) sem dependências (zip + WordprocessingML).

Substitui o python-docx, que puxa o lxml (≈19 MB) para dentro de cada publicação da função na Vercel. Cobre o que
os relatórios usam: parágrafos com trechos (negrito, itálico, tamanho, cor), títulos, listas com marcador, tabelas
com cabeçalho sombreado e linhas zebradas, imagens PNG, quebra de página, seção nova deitada, rodapé e metadados.
"""
import io
import struct
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' \
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' \
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
EMU_CM = 360000
A4 = (11906, 16838)   # largura, altura em twips (retrato)


def trecho(texto, negrito=False, italico=False, tam=None, cor=None):
    """tam em pontos (ex.: 10.5); cor 'RRGGBB'."""
    return {"t": str(texto), "b": negrito, "i": italico, "tam": tam, "cor": cor}


class Documento:
    def __init__(self, fonte="Calibri", tam=10.5, cor_titulo="0f766a", margem_cm=2.0):
        self.fonte, self.tam, self.cor_titulo, self.margem = fonte, tam, cor_titulo.lstrip("#"), int(margem_cm * 567)
        self.corpo, self.midias, self.secoes_fechadas = [], [], []
        self.titulo, self.autor, self.rodape = "", "", ""
        # cabeçalho repetido em todas as páginas: {"imagem": png, "linhas": [...], "fonte": "Times New Roman", "largura_cm": 1.6}
        self.cabecalho = None
        self.numerar_paginas = False
        self._deitado = False

    # ---------- texto ----------
    def _run(self, r):
        if isinstance(r, str):
            r = trecho(r)
        p = []
        if r.get("b"):
            p.append("<w:b/>")
        if r.get("i"):
            p.append("<w:i/>")
        if r.get("cor"):
            p.append(f'<w:color w:val="{r["cor"].lstrip("#")}"/>')
        if r.get("tam"):
            meio = int(round(r["tam"] * 2)); p.append(f'<w:sz w:val="{meio}"/><w:szCs w:val="{meio}"/>')
        partes = escape(r["t"]).split("\n")
        texto = '<w:br/>'.join(f'<w:t xml:space="preserve">{x}</w:t>' for x in partes)
        return f'<w:r>{"<w:rPr>" + "".join(p) + "</w:rPr>" if p else ""}{texto}</w:r>'

    def paragrafo(self, *trechos, estilo=None, depois=None, alinhar=None):
        ppr = []
        if estilo:
            ppr.append(f'<w:pStyle w:val="{estilo}"/>')
        if alinhar:
            ppr.append(f'<w:jc w:val="{alinhar}"/>')
        if depois is not None:
            ppr.append(f'<w:spacing w:after="{int(depois)}"/>')
        self.corpo.append(f'<w:p>{"<w:pPr>" + "".join(ppr) + "</w:pPr>" if ppr else ""}{"".join(self._run(t) for t in trechos)}</w:p>')

    def titulo_secao(self, texto, nivel=1):
        self.paragrafo(texto, estilo=f"Titulo{nivel}")

    def marcador(self, *trechos):
        self.paragrafo(trecho("•  "), *trechos, estilo="Lista")

    def quebra_pagina(self):
        self.corpo.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

    # ---------- tabela ----------
    def tabela(self, cabecalho, linhas, cor=None, zebra="F6F6F7", tam=9, cab_cor_texto="FFFFFF"):
        cor = (cor or self.cor_titulo).lstrip("#")
        bordas = "".join(f'<w:{b} w:val="single" w:sz="4" w:space="0" w:color="C9CED4"/>' for b in ("top", "left", "bottom", "right", "insideH", "insideV"))

        def cel(v, fundo=None, negrito=False, cor_txt=None):
            sombra = f'<w:shd w:val="clear" w:color="auto" w:fill="{fundo}"/>' if fundo else ""
            conteudo = v if isinstance(v, list) else [trecho(v, negrito=negrito, tam=tam, cor=cor_txt)]
            return f'<w:tc><w:tcPr>{sombra}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>{"".join(self._run(x) for x in conteudo)}</w:p></w:tc>'
        cab = ""
        if cabecalho:
            cab = '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + "".join(cel(c, cor, True, cab_cor_texto) for c in cabecalho) + "</w:tr>"
        corpo = "".join("<w:tr>" + "".join(cel(v, zebra if (j % 2 and zebra) else None) for v in l) + "</w:tr>" for j, l in enumerate(linhas))
        self.corpo.append(f'<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>{bordas}</w:tblBorders>'
                          f'<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>{cab}{corpo}</w:tbl>')
        self.paragrafo(depois=60)

    # ---------- imagem ----------
    def imagem(self, png: bytes | io.BytesIO, largura_cm: float):
        dados = png.getvalue() if hasattr(png, "getvalue") else png
        if dados[:8] != b"\x89PNG\r\n\x1a\n":
            return
        w, h = struct.unpack(">II", dados[16:24])
        cx = int(largura_cm * EMU_CM); cy = int(cx * h / max(1, w))
        n = len(self.midias) + 1
        self.midias.append(dados)
        rid = f"rIdImg{n}"
        self.corpo.append(
            f'<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{n}" name="Imagem {n}"/>'
            f'<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{n}" name="imagem{n}.png"/><pic:cNvPicPr/></pic:nvPicPr>'
            f'<pic:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
            f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>')

    # ---------- seções ----------
    def _sectpr(self, deitado):
        larg, alt = (A4[1], A4[0]) if deitado else A4
        m = self.margem
        rod = ('<w:headerReference w:type="default" r:id="rIdCab"/>' if self.cabecalho else "") + \
              ('<w:footerReference w:type="default" r:id="rIdRodape"/>' if (self.rodape or self.numerar_paginas) else "")
        orient = ' w:orient="landscape"' if deitado else ""   # fora da f-string: barra dentro da expressão só vale no Python 3.12+
        return (f'<w:sectPr>{rod}<w:pgSz w:w="{larg}" w:h="{alt}"{orient}/>'
                f'<w:pgMar w:top="{int(m * 0.9)}" w:right="{m}" w:bottom="{int(m * 0.9)}" w:left="{m}" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr>')

    def nova_secao(self, deitado=True):
        """Fecha a seção atual (com a orientação dela) e começa outra numa página nova."""
        self.corpo.append(f'<w:p><w:pPr>{self._sectpr(self._deitado)}</w:pPr></w:p>')
        self._deitado = deitado

    def deitar(self):
        self._deitado = True

    # ---------- saída ----------
    def salvar(self) -> bytes:
        f = self.fonte
        meio = int(round(self.tam * 2))
        estilos = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}>'
                   f'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{f}" w:hAnsi="{f}" w:cs="{f}" w:eastAsia="{f}"/><w:sz w:val="{meio}"/><w:szCs w:val="{meio}"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault>'
                   '<w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
                   '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
                   f'<w:style w:type="paragraph" w:styleId="Titulo1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="{self.cor_titulo}"/></w:rPr></w:style>'
                   '<w:style w:type="paragraph" w:styleId="Titulo2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/><w:color w:val="3F3F46"/></w:rPr></w:style>'
                   '<w:style w:type="paragraph" w:styleId="Lista"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="220"/><w:spacing w:after="60"/></w:pPr></w:style>'
                   '<w:style w:type="paragraph" w:styleId="Rodape"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="16"/><w:color w:val="71717A"/></w:rPr></w:style>'
                   '</w:styles>')
        documento = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>{"".join(self.corpo)}{self._sectpr(self._deitado)}</w:body></w:document>'
        rels = ['<Relationship Id="rIdEstilos" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>']
        rels += [f'<Relationship Id="rIdImg{i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/imagem{i + 1}.png"/>' for i in range(len(self.midias))]
        tem_rodape = bool(self.rodape or self.numerar_paginas)
        if tem_rodape:
            rels.append('<Relationship Id="rIdRodape" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>')
        if self.cabecalho:
            rels.append('<Relationship Id="rIdCab" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>')
        agora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        arquivos = {
            "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
                                   '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                                   '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                                   + ('<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' if tem_rodape else "")
                                   + ('<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>' if self.cabecalho else "")
                                   + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>',
            "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                           '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                           '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
            "docProps/core.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                                 'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
                                 f'<dc:title>{escape(self.titulo)}</dc:title><dc:creator>{escape(self.autor)}</dc:creator>'
                                 f'<dcterms:created xsi:type="dcterms:W3CDTF">{agora}</dcterms:created></cp:coreProperties>',
            "word/_rels/document.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + "".join(rels) + "</Relationships>",
            "word/document.xml": documento, "word/styles.xml": estilos,
        }
        if tem_rodape:
            pag = ('<w:r><w:tab/><w:t xml:space="preserve">Página </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>'
                   '<w:r><w:t xml:space="preserve"> de </w:t></w:r><w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>') if self.numerar_paginas else ""
            arquivos["word/footer1.xml"] = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr {W}><w:p><w:pPr><w:pStyle w:val="Rodape"/>'
                                            '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="BFBFBF"/></w:pBdr><w:tabs><w:tab w:val="right" w:pos="9638"/></w:tabs></w:pPr>'
                                            f'<w:r><w:t xml:space="preserve">{escape(self.rodape)}</w:t></w:r>{pag}</w:p></w:ftr>')
        if self.cabecalho:
            c = self.cabecalho
            fonte = c.get("fonte", "Times New Roman")
            img = c.get("imagem")
            desenho = ""
            if img and img[:8] == b"\x89PNG\r\n\x1a\n":
                w_, h_ = struct.unpack(">II", img[16:24])
                cx = int(c.get("largura_cm", 1.6) * EMU_CM); cy = int(cx * h_ / max(1, w_))
                desenho = (f'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="900" name="Brasão"/>'
                           '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="900" name="cabecalho.png"/><pic:cNvPicPr/></pic:nvPicPr>'
                           '<pic:blipFill><a:blip r:embed="rIdCabImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
                           f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>')
                arquivos["word/media/cabecalho.png"] = img
                arquivos["word/_rels/header1.xml.rels"] = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                                                           '<Relationship Id="rIdCabImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cabecalho.png"/></Relationships>')
            sem_borda = "".join(f'<w:{b} w:val="nil"/>' for b in ("top", "left", "bottom", "right", "insideH", "insideV"))
            texto = "".join(f'<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="{fonte}" w:hAnsi="{fonte}" w:cs="{fonte}"/><w:sz w:val="24"/></w:rPr>'
                            f'<w:t xml:space="preserve">{escape(l)}</w:t></w:r></w:p>' for l in c.get("linhas", []))
            arquivos["word/header1.xml"] = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr {W}>'
                                            f'<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>{sem_borda}</w:tblBorders></w:tblPr>'
                                            '<w:tblGrid><w:gridCol w:w="1600"/><w:gridCol w:w="8038"/></w:tblGrid>'
                                            f'<w:tr><w:tc><w:tcPr><w:tcW w:w="1600" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>{desenho}</w:p></w:tc>'
                                            f'<w:tc><w:tcPr><w:tcW w:w="8038" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>{texto}</w:tc></w:tr></w:tbl>'
                                            '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr><w:spacing w:after="120"/></w:pPr></w:p></w:hdr>')
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for nome, conteudo in arquivos.items():
                z.writestr(nome, conteudo)
            for i, m in enumerate(self.midias):
                z.writestr(f"word/media/imagem{i + 1}.png", m)
        return buf.getvalue()
