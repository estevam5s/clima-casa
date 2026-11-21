"""Acessos e desempenho do site (zynio.com.br) e do sistema (app.zynio.com.br), medidos por nós mesmos.

- Coleta (`coletar`): o navegador manda lotes de eventos (página vista, clique, Web Vitals, tempo da API, ping de quem está
  com a aba aberta). Não guardamos IP: país, estado e cidade vêm do cabeçalho da Vercel; aparelho e navegador do User-Agent.
  No site, o visitante só é identificado entre visitas com o consentimento de "estatísticas" (aviso de cookies).
- Relatório (`resumo`): online agora, visitantes, sessões, rotas, cliques, lugares, origens, aparelhos, idiomas, horários,
  Web Vitals por rota (p75, como o Google mede) e tempo das chamadas da API do sistema.
- SEO (`auditar`): lê o sitemap do site e confere cada página (título, descrição, canonical, h1, imagens sem alt, Open Graph,
  idiomas alternativos, JSON-LD, tempo de resposta), mais robots.txt e os cabeçalhos de segurança do sistema.
- PageSpeed (`pagespeed`): nota do Lighthouse (Google) de uma página, sob demanda.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import unquote, urlparse

import httpx

from . import db

SITE = "https://zynio.com.br"
SISTEMA = "https://app.zynio.com.br"
TIPOS = {"pagina", "clique", "vital", "api", "ping", "erro"}
VITAIS = {"LCP": (2500, 4000), "INP": (200, 500), "CLS": (0.1, 0.25), "FCP": (1800, 3000), "TTFB": (800, 1800)}   # bom até / ruim acima
RETENCAO_DIAS = 90
ROBOS = re.compile(r"bot|crawl|spider|slurp|headless|lighthouse|playwright|puppeteer|preview|facebookexternalhit|whatsapp|telegram", re.I)
_ultima_limpeza = [0.0]


# ---------------- coleta ----------------
def _ua(ua: str) -> tuple[str, str, str]:
    u = ua or ""
    disp = "tablet" if re.search(r"ipad|tablet", u, re.I) else "celular" if re.search(r"mobi|android|iphone", u, re.I) else "computador"
    nav = ("Edge" if "Edg/" in u else "Opera" if "OPR/" in u else "Samsung" if "SamsungBrowser" in u else "Chrome" if "Chrome/" in u
           else "Firefox" if "Firefox/" in u else "Safari" if "Safari/" in u else "Outro")
    so = ("iOS" if re.search(r"iphone|ipad", u, re.I) else "Android" if "Android" in u else "Windows" if "Windows" in u
          else "macOS" if "Mac OS X" in u else "Linux" if "Linux" in u else "Outro")
    return disp, nav, so


def _txt(v, n: int) -> str:
    return re.sub(r"[\x00-\x1f]", " ", str(v or ""))[:n]


def _rota(v) -> str:
    """Só o caminho: parâmetros podem carregar dados (e o idioma já vai em campo próprio)."""
    return _txt(v, 300).split("#")[0].split("?")[0] or "/"


def coletar(d: dict, request) -> int:
    """Grava um lote de eventos. Devolve quantos entraram (robôs e lixo ficam de fora)."""
    ua = request.headers.get("user-agent", "")
    if ROBOS.search(ua) or request.headers.get("x-clima-teste"):
        return 0
    origem = "sistema" if d.get("origem") == "sistema" else "site"
    eventos = [e for e in (d.get("eventos") or [])[:40] if isinstance(e, dict) and e.get("tipo") in TIPOS]
    if not eventos:
        return 0
    disp, nav, so = _ua(ua)
    pais = request.headers.get("x-vercel-ip-country", "")[:4]
    regiao = unquote(request.headers.get("x-vercel-ip-country-region", ""))[:40]
    cidade = unquote(request.headers.get("x-vercel-ip-city", ""))[:80]
    sessao, visitante = _txt(d.get("sessao"), 40), _txt(d.get("visitante"), 40)
    ref = _txt(d.get("ref"), 300)
    if ref:
        h = urlparse(ref).hostname or ""
        ref = "" if h.endswith("zynio.com.br") or h in ("localhost", "127.0.0.1") else h   # só o domínio de quem mandou a visita
    idioma = _txt(d.get("idioma"), 12)
    agora = db.agora()
    linhas = []
    for e in eventos:
        valor = e.get("valor")
        try:
            valor = float(valor) if valor is not None else None
        except (TypeError, ValueError):
            valor = None
        dados = e.get("dados") if isinstance(e.get("dados"), dict) else None
        if dados:
            dados = {str(k)[:30]: (v if isinstance(v, (int, float, bool)) else _txt(v, 120)) for k, v in list(dados.items())[:12]}
        linhas.append((agora, origem, e["tipo"], _rota(e.get("rota")), sessao, visitante, ref if e["tipo"] == "pagina" else "",
                       pais, regiao, cidade, disp, nav, so, idioma, _txt(e.get("alvo"), 200), _txt(e.get("nome"), 120), valor,
                       json.dumps(dados) if dados else None))
    with db.conexao() as c:
        with c.cursor() as cur:
            cur.executemany("INSERT INTO analise_eventos (quando, origem, tipo, rota, sessao, visitante, ref, pais, regiao, cidade, dispositivo, "
                            "navegador, so, idioma, alvo, nome, valor, dados) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,CAST(%s AS jsonb))", linhas)
    if time.time() - _ultima_limpeza[0] > 3600:   # retenção: 90 dias (uma vez por hora, por instância)
        _ultima_limpeza[0] = time.time()
        try:
            db.executar("DELETE FROM analise_eventos WHERE quando < ?", (agora - RETENCAO_DIAS * 86400,))
        except Exception:  # noqa: BLE001
            pass
    return len(linhas)


# ---------------- relatório ----------------
def _p(valores: list[float], q: float) -> float | None:
    if not valores:
        return None
    v = sorted(valores)
    return v[min(len(v) - 1, int(round(q * (len(v) - 1))))]


def _nota_vital(nome: str, v: float | None) -> str:
    if v is None or nome not in VITAIS:
        return ""
    bom, ruim = VITAIS[nome]
    return "bom" if v <= bom else "ruim" if v > ruim else "melhorar"


def resumo(origem: str = "site", dias: int = 7) -> dict:
    origem = "sistema" if origem == "sistema" else "site"
    dias = max(1, min(dias, RETENCAO_DIAS))
    agora = db.agora()
    de = agora - dias * 86400
    w = "origem = ? AND quando > ?"
    p = (origem, de)
    um = lambda sql, extra=(): db.um(sql, (*p, *extra)) or {}  # noqa: E731
    lista = lambda sql, extra=(): db.consultar(sql, (*p, *extra))  # noqa: E731

    tot = um(f"SELECT count(*) FILTER (WHERE tipo = 'pagina') AS paginas, count(DISTINCT sessao) FILTER (WHERE sessao <> '') AS sessoes, "
             f"count(DISTINCT coalesce(nullif(visitante, ''), sessao)) AS visitantes, count(*) FILTER (WHERE tipo = 'clique') AS cliques FROM analise_eventos WHERE {w}")
    # sessão: duração (primeiro ao último evento) e se só viu uma página sem clicar (rejeição)
    ses = um(f"WITH s AS (SELECT sessao, max(quando) - min(quando) AS dur, count(*) FILTER (WHERE tipo = 'pagina') AS pg, count(*) FILTER (WHERE tipo = 'clique') AS ck "
             f"FROM analise_eventos WHERE {w} AND sessao <> '' GROUP BY sessao) "
             "SELECT avg(dur) AS duracao, avg(pg) AS paginas_por_sessao, avg(CASE WHEN pg <= 1 AND ck = 0 THEN 1.0 ELSE 0 END) AS rejeicao FROM s")
    online = db.consultar("SELECT DISTINCT ON (sessao) sessao, rota, cidade, pais, dispositivo, navegador, quando FROM analise_eventos "
                     "WHERE origem = ? AND quando > ? AND sessao <> '' AND tipo IN ('pagina', 'ping') ORDER BY sessao, quando DESC", (origem, agora - 300))
    por_dia = lista(f"SELECT to_char(to_timestamp(quando) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia, count(*) FILTER (WHERE tipo = 'pagina') AS paginas, "
                    f"count(DISTINCT sessao) AS sessoes, count(*) FILTER (WHERE tipo = 'clique') AS cliques FROM analise_eventos WHERE {w} GROUP BY 1 ORDER BY 1")
    por_hora = lista(f"SELECT extract(hour FROM to_timestamp(quando) AT TIME ZONE 'America/Sao_Paulo')::int AS hora, count(*) AS n FROM analise_eventos "
                     f"WHERE {w} AND tipo = 'pagina' GROUP BY 1 ORDER BY 1")
    rotas = lista(f"SELECT rota, count(*) AS paginas, count(DISTINCT sessao) AS sessoes FROM analise_eventos WHERE {w} AND tipo = 'pagina' "
                  "GROUP BY rota ORDER BY paginas DESC LIMIT 30")
    entradas = lista(f"WITH p AS (SELECT DISTINCT ON (sessao) rota FROM analise_eventos WHERE {w} AND tipo = 'pagina' AND sessao <> '' ORDER BY sessao, quando) "
                     "SELECT rota, count(*) AS n FROM p GROUP BY rota ORDER BY n DESC LIMIT 10")
    saidas = lista(f"WITH p AS (SELECT DISTINCT ON (sessao) rota FROM analise_eventos WHERE {w} AND tipo = 'pagina' AND sessao <> '' ORDER BY sessao, quando DESC) "
                   "SELECT rota, count(*) AS n FROM p GROUP BY rota ORDER BY n DESC LIMIT 10")
    cliques = lista(f"SELECT nome, alvo, rota, count(*) AS n FROM analise_eventos WHERE {w} AND tipo = 'clique' GROUP BY nome, alvo, rota ORDER BY n DESC LIMIT 30")
    grupo = lambda col, lim=15: lista(f"SELECT {col} AS nome, count(DISTINCT sessao) AS sessoes, count(*) FILTER (WHERE tipo = 'pagina') AS paginas "  # noqa: E731
                                      f"FROM analise_eventos WHERE {w} AND {col} <> '' GROUP BY 1 ORDER BY sessoes DESC LIMIT {lim}")
    cidades = lista(f"SELECT cidade, regiao, pais, count(DISTINCT sessao) AS sessoes FROM analise_eventos WHERE {w} AND cidade <> '' "
                    "GROUP BY cidade, regiao, pais ORDER BY sessoes DESC LIMIT 20")
    origens = lista(f"SELECT ref AS nome, count(*) AS n FROM analise_eventos WHERE {w} AND tipo = 'pagina' AND ref <> '' GROUP BY ref ORDER BY n DESC LIMIT 15")
    diretas = um(f"SELECT count(*) AS n FROM analise_eventos WHERE {w} AND tipo = 'pagina' AND ref = ''")
    # Web Vitals: p75 por métrica e por rota (como o Google conta no Search Console)
    vit = lista(f"SELECT nome, rota, valor FROM analise_eventos WHERE {w} AND tipo = 'vital' AND valor IS NOT NULL ORDER BY quando DESC LIMIT 20000")
    geral, por_rota = {}, {}
    for v in vit:
        geral.setdefault(v["nome"], []).append(v["valor"])
        por_rota.setdefault(v["rota"], {}).setdefault(v["nome"], []).append(v["valor"])
    vitais = {k: {"p75": _p(x, 0.75), "n": len(x), "nota": _nota_vital(k, _p(x, 0.75)),
                  "distribuicao": {n: sum(1 for y in x if _nota_vital(k, y) == n) for n in ("bom", "melhorar", "ruim")}} for k, x in geral.items()}
    vitais_rotas = sorted(({"rota": r, **{k: {"p75": _p(x, 0.75), "n": len(x), "nota": _nota_vital(k, _p(x, 0.75))} for k, x in m.items()},
                            "amostras": sum(len(x) for x in m.values())} for r, m in por_rota.items()), key=lambda x: -x["amostras"])[:25]
    api = []
    if origem == "sistema":
        amostras = lista(f"SELECT alvo, valor, (dados->>'status')::int AS status FROM analise_eventos WHERE {w} AND tipo = 'api' AND valor IS NOT NULL "
                         "ORDER BY quando DESC LIMIT 30000")
        g = {}
        for a in amostras:
            g.setdefault(a["alvo"], []).append(a)
        api = sorted(({"rota": k, "n": len(x), "p50": _p([y["valor"] for y in x], 0.5), "p95": _p([y["valor"] for y in x], 0.95),
                       "erros": sum(1 for y in x if (y["status"] or 0) >= 500 or (y["status"] or 0) == 0)} for k, x in g.items()),
                     key=lambda x: -(x["p95"] or 0))[:30]
    erros = lista(f"SELECT nome, rota, count(*) AS n, max(quando) AS ultimo FROM analise_eventos WHERE {w} AND tipo = 'erro' GROUP BY nome, rota ORDER BY n DESC LIMIT 15")
    return {
        "origem": origem, "dias": dias,
        "totais": {"paginas": int(tot.get("paginas") or 0), "sessoes": int(tot.get("sessoes") or 0), "visitantes": int(tot.get("visitantes") or 0),
                   "cliques": int(tot.get("cliques") or 0), "duracao_media_s": round(float(ses.get("duracao") or 0)),
                   "paginas_por_sessao": round(float(ses.get("paginas_por_sessao") or 0), 1), "rejeicao": round(float(ses.get("rejeicao") or 0) * 100),
                   "online": len(online)},
        "online": online[:50], "por_dia": por_dia, "por_hora": por_hora, "rotas": rotas, "entradas": entradas, "saidas": saidas, "cliques": cliques,
        "paises": grupo("pais"), "cidades": cidades, "dispositivos": grupo("dispositivo", 5), "navegadores": grupo("navegador", 8), "sistemas": grupo("so", 8),
        "idiomas": grupo("idioma", 10), "origens": origens, "diretas": int(diretas.get("n") or 0), "vitais": vitais, "vitais_rotas": vitais_rotas,
        "api": api, "erros": erros, "recomendacoes": _recomendacoes(vitais, vitais_rotas, api, ses, origem),
    }


def _recomendacoes(vitais, vitais_rotas, api, ses, origem) -> list[dict]:
    """O que melhorar, a partir do que foi medido (nada inventado: só aparece se o número existe)."""
    r = []
    nomes = {"LCP": "o maior elemento demora a aparecer", "INP": "a página demora a responder ao clique", "CLS": "a página pula enquanto carrega",
             "FCP": "a primeira pintura demora", "TTFB": "o servidor demora a responder"}
    for k, v in vitais.items():
        if v["nota"] in ("melhorar", "ruim") and v["n"] >= 5:
            piores = [x["rota"] for x in vitais_rotas if x.get(k, {}).get("nota") == "ruim"][:3]
            r.append({"gravidade": "alta" if v["nota"] == "ruim" else "media", "titulo": f"{k} {v['nota']}: {nomes.get(k, '')}",
                      "detalhe": f"p75 de {_fmt(k, v['p75'])} em {v['n']} medições" + (f"; piores rotas: {', '.join(piores)}" if piores else "")})
    for a in api:
        if a["n"] >= 10 and (a["p95"] or 0) > 2500:
            r.append({"gravidade": "media", "titulo": f"API lenta: {a['rota']}", "detalhe": f"p95 de {round(a['p95'])} ms em {a['n']} chamadas"})
        if a["erros"] >= 3:
            r.append({"gravidade": "alta", "titulo": f"Falhas na API: {a['rota']}", "detalhe": f"{a['erros']} respostas com erro de servidor ou sem conexão"})
    rej = float(ses.get("rejeicao") or 0) * 100
    if origem == "site" and rej > 70:
        r.append({"gravidade": "baixa", "titulo": f"Rejeição alta ({round(rej)}%)", "detalhe": "a maioria vê uma página e sai sem clicar: reveja o primeiro bloco e os botões das páginas de entrada"})
    return r[:20]


def _fmt(k, v):
    if v is None:
        return "-"
    return f"{v:.2f}" if k == "CLS" else f"{round(v)} ms"


# ---------------- SEO ----------------
class _Leitor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title, self.dentro_title, self.h1, self.imgs, self.sem_alt, self.links = "", False, 0, 0, 0, 0
        self.meta, self.links_rel, self.ld, self.lang = {}, [], 0, ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html":
            self.lang = a.get("lang", "")
        elif tag == "title":
            self.dentro_title = True
        elif tag == "h1":
            self.h1 += 1
        elif tag == "img":
            self.imgs += 1
            if a.get("alt") is None:
                self.sem_alt += 1
        elif tag == "a" and a.get("href"):
            self.links += 1
        elif tag == "meta":
            k = a.get("name") or a.get("property")
            if k:
                self.meta[k.lower()] = a.get("content", "")
        elif tag == "link":
            self.links_rel.append(a)
        elif tag == "script" and a.get("type") == "application/ld+json":
            self.ld += 1

    def handle_endtag(self, tag):
        if tag == "title":
            self.dentro_title = False

    def handle_data(self, data):
        if self.dentro_title:
            self.title += data


def _passe() -> dict:
    """Cabeçalho que o portão anti-robô do site aceita (HMAC com o mesmo segredo, vale 5 min): a auditoria lê a página real."""
    seg = db.ENV.get("VERIFICACAO_SEGREDO") or os.environ.get("VERIFICACAO_SEGREDO", "")
    if not seg:
        return {}
    ts = str(int(time.time()))
    return {"x-zynio-auditoria": ts + "." + hmac.new(seg.encode(), f"auditoria:{ts}".encode(), hashlib.sha256).hexdigest()}


def _pagina(cli: httpx.Client, url: str) -> dict:
    t0 = time.perf_counter()
    try:
        r = cli.get(url)
    except httpx.HTTPError as e:
        return {"url": url, "status": 0, "ms": None, "problemas": [{"g": "alta", "t": f"Não abriu: {str(e)[:80]}"}], "nota": 0}
    ms = round((time.perf_counter() - t0) * 1000)
    h = _Leitor()
    try:
        h.feed(r.text[:800_000])
    except Exception:  # noqa: BLE001
        pass
    m, probs = h.meta, []
    titulo, desc = re.sub(r"\s+", " ", h.title).strip(), m.get("description", "")
    canon = next((x.get("href") for x in h.links_rel if (x.get("rel") or "").lower() == "canonical"), "")
    alternos = [x.get("hreflang") for x in h.links_rel if (x.get("rel") or "").lower() == "alternate" and x.get("hreflang")]
    portao = (r.headers.get("x-robots-tag") or "").lower() == "noindex" and "verificacao" in r.text[:20000]   # a página do portão manda noindex
    if r.status_code >= 400:
        probs.append({"g": "alta", "t": f"Responde {r.status_code}"})
    if portao:
        probs.append({"g": "alta", "t": "O portão anti-robô respondeu no lugar da página"})
    if not titulo:
        probs.append({"g": "alta", "t": "Sem título"})
    elif not 15 <= len(titulo) <= 65:
        probs.append({"g": "media", "t": f"Título com {len(titulo)} caracteres (ideal 15 a 65)"})
    if not desc:
        probs.append({"g": "alta", "t": "Sem meta descrição"})
    elif not 70 <= len(desc) <= 165:
        probs.append({"g": "baixa", "t": f"Descrição com {len(desc)} caracteres (ideal 70 a 165)"})
    if not canon:
        probs.append({"g": "media", "t": "Sem link canonical"})
    if h.h1 != 1:
        probs.append({"g": "media", "t": f"{h.h1} títulos H1 (o ideal é 1)"})
    if h.sem_alt:
        probs.append({"g": "baixa", "t": f"{h.sem_alt} imagem(ns) sem texto alternativo"})
    if not m.get("og:image"):
        probs.append({"g": "baixa", "t": "Sem imagem de compartilhamento (og:image)"})
    if not m.get("twitter:card"):
        probs.append({"g": "baixa", "t": "Sem cartão do X/Twitter"})
    if "noindex" in (m.get("robots") or "").lower():
        probs.append({"g": "alta", "t": "Marcada como noindex"})
    if not alternos:
        probs.append({"g": "baixa", "t": "Sem idiomas alternativos (hreflang)"})
    if ms > 1500:
        probs.append({"g": "media", "t": f"Resposta lenta ({ms} ms)"})
    peso = {"alta": 25, "media": 10, "baixa": 4}
    return {"url": url, "caminho": urlparse(url).path or "/", "status": r.status_code, "ms": ms, "bytes": len(r.content), "titulo": titulo, "descricao": desc,
            "canonical": canon, "h1": h.h1, "imagens": h.imgs, "sem_alt": h.sem_alt, "links": h.links, "json_ld": h.ld, "lang": h.lang,
            "idiomas": alternos, "og_image": bool(m.get("og:image")), "problemas": probs,
            "nota": max(0, 100 - sum(peso[p["g"]] for p in probs))}


def auditar() -> dict:
    t0 = time.time()
    cab = {"user-agent": "ZynioAuditoriaSEO/1.0 (+https://zynio.com.br)", **_passe()}
    with httpx.Client(timeout=15, follow_redirects=True, headers=cab) as cli:
        robots = cli.get(f"{SITE}/robots.txt")
        sm = cli.get(f"{SITE}/sitemap.xml")
        urls = re.findall(r"<loc>([^<]+)</loc>", sm.text)[:160]
        with ThreadPoolExecutor(8) as ex:
            paginas = list(ex.map(lambda u: _pagina(cli, u), urls))
        # sistema: cabeçalhos de segurança e tempo da raiz
        t1 = time.perf_counter()
        try:
            rs = cli.get(f"{SISTEMA}/saude")
            sis = {"status": rs.status_code, "ms": round((time.perf_counter() - t1) * 1000)}
            raiz = cli.get(f"{SISTEMA}/")
            hs = {k.lower(): v for k, v in raiz.headers.items()}
            sis["cabecalhos"] = {n: bool(hs.get(n)) for n in ("strict-transport-security", "content-security-policy", "x-content-type-options",
                                                              "x-frame-options", "referrer-policy", "permissions-policy")}
        except httpx.HTTPError as e:
            sis = {"status": 0, "erro": str(e)[:120]}
    gerais = []
    if robots.status_code != 200:
        gerais.append({"g": "alta", "t": "robots.txt não abre"})
    elif "sitemap" not in robots.text.lower():
        gerais.append({"g": "baixa", "t": "robots.txt não aponta o sitemap"})
    if not urls:
        gerais.append({"g": "alta", "t": "sitemap.xml sem páginas"})
    titulos = {}
    for p in paginas:
        if p.get("titulo"):
            titulos.setdefault(p["titulo"], []).append(p.get("caminho"))
    for t, cs in titulos.items():
        if len(cs) > 1:
            gerais.append({"g": "media", "t": f"Título repetido em {len(cs)} páginas: {t[:60]}"})
    notas = [p["nota"] for p in paginas]
    res = {"quando": db.agora(), "segundos": round(time.time() - t0, 1), "paginas": paginas, "gerais": gerais, "sistema": sis,
           "nota": round(sum(notas) / len(notas)) if notas else 0, "robots": robots.status_code, "sitemap": len(urls),
           "ms_medio": round(sum(p["ms"] or 0 for p in paginas) / len(paginas)) if paginas else None}
    db.set_cfg("seo_auditoria", res)
    return res


def pagespeed(url: str, estrategia: str = "mobile") -> dict:
    """Nota do Lighthouse pela API PageSpeed Insights do Google (chave opcional em config.seo.psi_chave)."""
    if not (url.startswith(SITE) or url.startswith(SISTEMA)):
        raise ValueError("Só páginas de zynio.com.br.")
    chave = (db.cfg("seo") or {}).get("psi_chave") or ""
    params = [("url", url), ("strategy", "desktop" if estrategia == "desktop" else "mobile"), ("locale", "pt_BR")]
    params += [("category", c) for c in ("performance", "accessibility", "best-practices", "seo")]
    if chave:
        params.append(("key", chave))
    r = httpx.get("https://www.googleapis.com/pagespeedonline/v5/runPagespeed", params=params, timeout=58)
    if r.status_code != 200:
        msg = (r.json().get("error") or {}).get("message", r.text[:200]) if r.headers.get("content-type", "").startswith("application/json") else r.text[:200]
        raise RuntimeError(f"PageSpeed não respondeu ({r.status_code}): {msg[:200]}")
    j = r.json().get("lighthouseResult") or {}
    cats = {k: round((v.get("score") or 0) * 100) for k, v in (j.get("categories") or {}).items()}
    au = j.get("audits") or {}
    met = {k: (au.get(a) or {}).get("displayValue") for k, a in (("LCP", "largest-contentful-paint"), ("FCP", "first-contentful-paint"),
                                                                   ("CLS", "cumulative-layout-shift"), ("TBT", "total-blocking-time"), ("SI", "speed-index"))}
    oport = sorted(({"titulo": v.get("title"), "economia_ms": round((v.get("details") or {}).get("overallSavingsMs") or 0)}
                    for v in au.values() if (v.get("details") or {}).get("type") == "opportunity" and ((v.get("details") or {}).get("overallSavingsMs") or 0) > 100),
                   key=lambda x: -x["economia_ms"])[:8]
    res = {"url": url, "estrategia": estrategia, "quando": db.agora(), "categorias": cats, "metricas": met, "oportunidades": oport}
    hist = db.cfg("seo_pagespeed") or []
    hist = [res] + [h for h in hist if not (h.get("url") == url and h.get("estrategia") == estrategia)][:30]
    db.set_cfg("seo_pagespeed", hist)
    return res
