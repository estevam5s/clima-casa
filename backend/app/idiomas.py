"""Tradução do site institucional (zynio.com.br) para inglês, espanhol, francês, russo e coreano.

Como funciona:
- O site é escrito em português. Na publicação, `site/scripts/extrair-textos.mjs` abre cada página e grava todos os textos
  visíveis (e placeholders, títulos, aria-label, alt) em `site/public/i18n/textos.json`. Em Idiomas → "Buscar textos do site",
  o sistema lê esse arquivo e cadastra os textos novos em `site_textos`.
- Quem visita em outro idioma também avisa os textos que ainda não têm tradução (mensagens que só aparecem depois de uma ação):
  eles entram como "vistos no navegador" e só valem depois que alguém do painel aprova (ninguém de fora enche a lista).
- A tradução é feita pela IA (NVIDIA) em lotes e pode ser corrigida à mão (fica marcada como revisada e a IA não mexe mais).
- O site busca o dicionário do idioma em `GET /api/site/idiomas/{idioma}` (público, em cache) e troca os textos na página.
"""
from __future__ import annotations

import json
import re
import time

import httpx

from . import db

IDIOMAS = {
    "pt": {"nome": "Português", "ingles": "Brazilian Portuguese", "bandeira": "BR"},
    "en": {"nome": "English", "ingles": "English (US)", "bandeira": "US"},
    "es": {"nome": "Español", "ingles": "Spanish (Latin America)", "bandeira": "ES"},
    "fr": {"nome": "Français", "ingles": "French", "bandeira": "FR"},
    "ru": {"nome": "Русский", "ingles": "Russian", "bandeira": "RU"},
    "ko": {"nome": "한국어", "ingles": "Korean", "bandeira": "KR"},
}
TRADUZIVEIS = [k for k in IDIOMAS if k != "pt"]
TEXTOS_URL = "https://zynio.com.br/i18n/textos.json"
# nomes que nunca se traduzem (marca, produtos, protocolos)
FIXOS = ["Clima Escritório", "Zynio", "zynio.com.br", "app.zynio.com.br", "Alexa", "Google Home", "Sinric Pro", "Tuya", "Smart Life", "Smart IR",
         "SRW-004", "Telegram", "Spotify", "Supabase", "Vercel", "Cloudflare", "Turnstile", "Resend", "NVIDIA", "Raspberry Pi", "Three.js",
         "FastAPI", "React", "Python", "Novadigital", "Gree", "Open-Meteo", "LGPD", "ISO/IEC 27001", "WhatsApp", "GitHub", "Android", "iPhone"]
_cache: dict = {}
# "site" = zynio.com.br; "painel" = o próprio sistema (app.zynio.com.br), traduzido no navegador conforme a pessoa usa
ESCOPOS = {"site": ("site_textos", "site_traducoes", "site_idiomas"), "painel": ("painel_textos", "painel_traducoes", "painel_idiomas")}


def _tab(escopo: str = "site") -> tuple[str, str, str]:
    return ESCOPOS.get(escopo) or ESCOPOS["site"]


def normalizar(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def cfg(escopo: str = "site") -> dict:
    T, R, C = _tab(escopo)
    c = db.cfg(C) or {}
    return {"ativos": c.get("ativos") or TRADUZIVEIS, "padrao": c.get("padrao") or "pt", "versao": int(c.get("versao") or 1),
            "detectar": c.get("detectar", True), "atualizado_em": c.get("atualizado_em")}


def _salvar_cfg(escopo: str = "site", **mud):
    T, R, C = _tab(escopo)
    c = {**cfg(escopo), **mud}
    db.set_cfg(C, c)
    _cache.clear()
    return c


def subir_versao(escopo: str = "site"):
    """Muda a versão do dicionário: o site descarta a cópia guardada no navegador e baixa de novo."""
    T, R, C = _tab(escopo)
    return _salvar_cfg(escopo, versao=cfg(escopo)["versao"] + 1, atualizado_em=db.agora())


def salvar(ativos: list[str] | None = None, detectar: bool | None = None) -> dict:
    mud = {}
    if ativos is not None:
        mud["ativos"] = [a for a in ativos if a in TRADUZIVEIS]
    if detectar is not None:
        mud["detectar"] = bool(detectar)
    _salvar_cfg(**mud)
    return subir_versao()


def publico(idioma: str) -> dict:
    """Dicionário de um idioma para o site (pt → tradução). Cache de 60 s por instância."""
    c = cfg()
    ativos = ["pt", *c["ativos"]]
    if idioma not in IDIOMAS:
        idioma = "pt"
    chave = (idioma, c["versao"])
    if chave in _cache and time.time() - _cache[chave][0] < 60:
        return _cache[chave][1]
    textos = {}
    if idioma != "pt" and idioma in ativos:
        for r in db.consultar("SELECT t.texto, t.traducao FROM site_traducoes t JOIN site_textos s ON s.texto = t.texto WHERE t.idioma = ? AND s.ativo", (idioma,)):
            textos[r["texto"]] = r["traducao"]
    res = {"idioma": idioma, "versao": c["versao"], "ativos": [{"codigo": k, "nome": IDIOMAS[k]["nome"]} for k in ativos],
           "detectar": c["detectar"], "textos": textos}
    _cache[chave] = (time.time(), res)
    return res


def estado(escopo: str = "site") -> dict:
    T, R, C = _tab(escopo)
    c = cfg(escopo)
    total = (db.um(f"SELECT count(*) AS n FROM {T} WHERE ativo") or {}).get("n") or 0
    pendentes = (db.um(f"SELECT count(*) AS n FROM {T} WHERE NOT ativo") or {}).get("n") or 0
    por = {r["idioma"]: r for r in db.consultar(
        "SELECT t.idioma, count(*) AS feitas, count(*) FILTER (WHERE t.revisada) AS revisadas, count(*) FILTER (WHERE t.origem = 'ia') AS ia, max(t.atualizado_em) AS ultima "
        f"FROM {R} t JOIN {T} s ON s.texto = t.texto WHERE s.ativo GROUP BY t.idioma")}
    lista = []
    for k, v in IDIOMAS.items():
        p = por.get(k) or {}
        feitas = total if k == "pt" else int(p.get("feitas") or 0)
        lista.append({"codigo": k, **v, "ativo": k == "pt" or k in c["ativos"], "feitas": feitas, "faltam": max(0, total - feitas),
                      "revisadas": int(p.get("revisadas") or 0), "ia": int(p.get("ia") or 0), "ultima": p.get("ultima"),
                      "cobertura": round(feitas * 100 / total) if total else 0})
    return {**c, "total": total, "pendentes": pendentes, "idiomas": lista}


def importar(textos: list[dict | str], origem: str = "site") -> dict:
    """Cadastra textos (com as rotas onde aparecem). Textos do site entram ativos; os vistos no navegador esperam aprovação."""
    novos, agora = 0, db.agora()
    for t in textos[:6000]:
        texto = normalizar(t.get("texto") if isinstance(t, dict) else t)
        if not texto or len(texto) > 1200 or not re.search(r"[A-Za-zÀ-ÿ]", texto):
            continue
        rotas = (t.get("rotas") if isinstance(t, dict) else None) or []
        r = db.um("INSERT INTO site_textos (texto, rotas, origem, ativo, visto_em) VALUES (?, CAST(? AS jsonb), ?, ?, ?) "
                  "ON CONFLICT (texto) DO UPDATE SET visto_em = excluded.visto_em, "
                  "rotas = CASE WHEN excluded.origem = 'site' THEN excluded.rotas ELSE site_textos.rotas END, "
                  "ativo = site_textos.ativo OR excluded.ativo RETURNING (xmax = 0) AS novo",
                  (texto, json.dumps(rotas[:20]), origem, origem == "site", agora))
        novos += 1 if r and r.get("novo") else 0
    if novos:
        subir_versao()
    return {"novos": novos}


def buscar_do_site() -> dict:
    r = httpx.get(TEXTOS_URL, timeout=20, headers={"user-agent": "ZynioIdiomas/1.0"})
    if r.status_code != 200:
        raise RuntimeError(f"O site não devolveu a lista de textos ({r.status_code}). Publique o site de novo.")
    j = r.json()
    res = importar(j.get("textos") or [], "site")
    # o que sumiu do site (e não foi visto no navegador) deixa de valer, mas a tradução fica guardada
    atuais = {normalizar(t.get("texto") if isinstance(t, dict) else t) for t in j.get("textos") or []}
    velhos = [r["texto"] for r in db.consultar("SELECT texto FROM site_textos WHERE ativo AND origem = 'site'") if r["texto"] not in atuais]
    for t in velhos:
        db.executar("UPDATE site_textos SET ativo = false WHERE texto = ?", (t,))
    if velhos:
        subir_versao()
    return {**res, "removidos": len(velhos), "total_site": len(atuais), "gerado_em": j.get("gerado_em")}


def aprovar_pendentes(textos: list[str] | None, aprovar: bool) -> int:
    alvo = db.consultar("SELECT texto FROM site_textos WHERE NOT ativo AND origem = 'navegador'") if textos is None else [{"texto": t} for t in textos]
    n = 0
    for r in alvo:
        if aprovar:
            db.executar("UPDATE site_textos SET ativo = true WHERE texto = ?", (r["texto"],))
        else:
            db.executar("DELETE FROM site_textos WHERE texto = ? AND origem = 'navegador'", (r["texto"],))
        n += 1
    if n:
        subir_versao()
    return n


def listar(idioma: str, busca: str = "", filtro: str = "todos", limite: int = 100, depois: int = 0, escopo: str = "site") -> dict:
    T, R, C = _tab(escopo)
    w, p = ["s.ativo"], [idioma]
    if filtro == "pendentes":
        w = ["NOT s.ativo"]
    if busca.strip():
        w.append("(s.texto ILIKE ? OR t.traducao ILIKE ?)")
        p += [f"%{busca.strip()}%"] * 2
    if filtro == "faltando":
        w.append("t.traducao IS NULL")
    elif filtro == "ia":
        w.append("t.origem = 'ia' AND NOT t.revisada")
    elif filtro == "revisadas":
        w.append("t.revisada")
    sql = (f"SELECT s.texto, s.rotas, s.origem AS origem_texto, t.traducao, t.origem, t.revisada, t.atualizado_em FROM {T} s "
           f"LEFT JOIN {R} t ON t.texto = s.texto AND t.idioma = ? WHERE {' AND '.join(w)} ORDER BY length(s.texto), s.texto LIMIT ? OFFSET ?")
    itens = db.consultar(sql, (*p, min(limite, 300), max(0, depois)))
    total = (db.um(f"SELECT count(*) AS n FROM {T} s LEFT JOIN {R} t ON t.texto = s.texto AND t.idioma = ? WHERE {' AND '.join(w)}", tuple(p)) or {}).get("n")
    return {"itens": itens, "total": total}


def editar(texto: str, idioma: str, traducao: str, escopo: str = "site") -> dict:
    T, R, C = _tab(escopo)
    if idioma not in TRADUZIVEIS:
        raise ValueError("Idioma inválido.")
    traducao = (traducao or "").strip()
    if not traducao:
        db.executar(f"DELETE FROM {R} WHERE texto = ? AND idioma = ?", (texto, idioma))
    else:
        db.executar(f"INSERT INTO {R} (texto, idioma, traducao, origem, revisada, atualizado_em) VALUES (?,?,?,'manual',true,?) "
                    "ON CONFLICT (texto, idioma) DO UPDATE SET traducao = excluded.traducao, origem = 'manual', revisada = true, atualizado_em = excluded.atualizado_em",
                    (texto, idioma, traducao[:2400], db.agora()))
    subir_versao(escopo)
    return {"ok": True}


def _prompt(idioma: str, escopo: str = "site") -> str:
    alvo = IDIOMAS[idioma]["ingles"]
    if escopo == "painel":
        return (f"You are a professional software localizer translating the user interface of an admin dashboard from Brazilian Portuguese into {alvo}. "
                "The dashboard controls office air conditioners by infrared (Smart IR transmitters), lights, coffee maker, blinds, door lock, "
                "Spotify music, Alexa/Google Home, Telegram bot, an AI assistant, tasks, bugs, reports, security and infrastructure.\n"
                "Rules:\n- Return ONLY a JSON array of strings, same length and same order as the input. No comments.\n"
                "- Tokens like {0}, {1} are placeholders for numbers: keep every one of them, exactly once, and move them where the grammar needs.\n"
                "- Keep these names exactly as they are: " + ", ".join(FIXOS) + ".\n"
                "- Proper names of people, rooms, devices and projects (e.g. 'Ar do Deison', 'Sala Fabio') stay as they are unless they are a generic label.\n"
                "- Keep URLs, e-mail addresses, file names, code, keyboard keys, units (°C, kWh, ms, MB) and punctuation style.\n"
                "- UI labels (menus, buttons, tabs, table headers) stay short; keep the capitalization style of the source.\n"
                "- Use the usual software terms of that language (Settings, Dashboard, Sign out...). Do not add or remove information.")
    return (f"You are a professional localizer translating the website of a B2B smart-office product from Brazilian Portuguese into {alvo}. "
            "The product controls office air conditioners by infrared, plus lights, coffee maker, blinds, door lock and Spotify music, "
            "with Alexa, Google Home, Telegram and an AI assistant.\n"
            "Rules:\n- Return ONLY a JSON array of strings, same length and same order as the input. No comments.\n"
            "- Keep these names exactly as they are: " + ", ".join(FIXOS) + ".\n"
            "- Keep numbers, units, versions, URLs, e-mail addresses, code (like /23, clima-ia, ?lang=en) and punctuation style. Keep °C.\n"
            "- Short UI labels (menus, buttons) stay short. Buttons written in UPPERCASE stay in uppercase.\n"
            "- Natural, concise marketing tone for a professional audience. Do not add or remove information.\n"
            "- Quoted voice commands like \"Alexa, ligar o ar...\" must be translated to how a speaker of that language would say it to Alexa.")


def traduzir_faltantes(idioma: str, lote: int = 30, refazer_ia: bool = False, escopo: str = "site") -> dict:
    """Traduz um lote do que falta (ou refaz o que a IA fez e ninguém revisou). Chamado em sequência pela tela."""
    T, R, C = _tab(escopo)
    from . import ia
    if idioma not in TRADUZIVEIS:
        raise ValueError("Idioma inválido.")
    if refazer_ia:
        linhas = db.consultar(f"SELECT s.texto FROM {T} s JOIN {R} t ON t.texto = s.texto AND t.idioma = ? "
                              "WHERE s.ativo AND t.origem = 'ia' AND NOT t.revisada AND t.atualizado_em < ? ORDER BY s.texto LIMIT ?",
                              (idioma, db.agora() - 600, lote))
    else:
        linhas = db.consultar(f"SELECT s.texto FROM {T} s LEFT JOIN {R} t ON t.texto = s.texto AND t.idioma = ? "
                              "WHERE s.ativo AND t.texto IS NULL ORDER BY length(s.texto) DESC, s.texto LIMIT ?", (idioma, lote))
    # lote por tamanho: até ~2.500 caracteres (um parágrafo longo vai sozinho), senão a resposta não cabe
    textos, soma = [], 0
    for r in linhas:
        if textos and soma + len(r["texto"]) > 2500:
            break
        textos.append(r["texto"]); soma += len(r["texto"])
    if not textos:
        return {"traduzidos": 0, "faltam": 0}
    resp = ia.gerar(_prompt(idioma, escopo), json.dumps(textos, ensure_ascii=False), max_tokens=min(6000, 300 + sum(len(t) for t in textos) * 2), temperatura=0.1)
    saida = ia.json_da_resposta(resp)
    if not isinstance(saida, list) or len(saida) != len(textos):
        raise RuntimeError("A IA devolveu um número diferente de textos. Tente de novo (lotes menores ajudam).")
    agora = db.agora()
    linhas = [(pt, idioma, normalizar(str(tr or ""))[:2400], agora) for pt, tr in zip(textos, saida) if normalizar(str(tr or ""))]
    with db.conexao() as c:   # o lote inteiro numa ida só ao banco
        with c.cursor() as cur:
            cur.executemany(f"INSERT INTO {R} (texto, idioma, traducao, origem, revisada, atualizado_em) VALUES (%s,%s,%s,'ia',false,%s) "
                            "ON CONFLICT (texto, idioma) DO UPDATE SET traducao = excluded.traducao, atualizado_em = excluded.atualizado_em "
                            f"WHERE NOT {R}.revisada", linhas)
    feitos = len(linhas)
    subir_versao(escopo)
    faltam = (db.um(f"SELECT count(*) AS n FROM {T} s LEFT JOIN {R} t ON t.texto = s.texto AND t.idioma = ? WHERE s.ativo AND t.texto IS NULL", (idioma,)) or {}).get("n")
    return {"traduzidos": feitos, "faltam": int(faltam or 0)}


def exportar(idioma: str, escopo: str = "site") -> dict:
    T, R, C = _tab(escopo)
    return {r["texto"]: r["traducao"] for r in db.consultar(f"SELECT texto, traducao FROM {R} WHERE idioma = ? ORDER BY texto", (idioma,))}


# ================= painel (o próprio sistema) =================
# O navegador troca os textos da tela (frontend/src/i18nPainel.js). Números viram {0}, {1}… antes de procurar a tradução
# ("4/9 ligados" e "5/9 ligados" são o mesmo texto), então o dicionário não cresce a cada número novo.
_cache_painel: dict = {}


def dicionario_painel(idioma: str) -> dict:
    if idioma not in TRADUZIVEIS:
        return {"idioma": "pt", "versao": 0, "textos": {}}
    c = cfg("painel")
    chave = (idioma, c["versao"])
    if chave in _cache_painel and time.time() - _cache_painel[chave][0] < 60:
        return _cache_painel[chave][1]
    textos = {r["texto"]: r["traducao"] for r in db.consultar("SELECT texto, traducao FROM painel_traducoes WHERE idioma = ?", (idioma,))}
    res = {"idioma": idioma, "versao": c["versao"], "textos": textos}
    _cache_painel.clear()
    _cache_painel[chave] = (time.time(), res)
    return res


def _valido_painel(t: str) -> bool:
    return bool(t) and len(t) <= 600 and re.search(r"[A-Za-zÀ-ÿ]{2}", t) is not None and not re.fullmatch(r"\S+@\S+\.\S+|https?://\S+", t)


def traduzir_painel(idioma: str, textos: list[str], rota: str = "") -> dict:
    """Cadastra o que a tela mostrou sem tradução e traduz na hora pela IA (lotes de ~2.500 caracteres). Devolve só o
    que conseguiu traduzir agora; o resto volta na próxima vez que a tela pedir."""
    from . import ia
    if idioma not in TRADUZIVEIS:
        raise ValueError("Idioma inválido.")
    lista = list(dict.fromkeys(normalizar(t) for t in textos if _valido_painel(normalizar(t))))[:80]
    if not lista:
        return {"textos": {}}
    agora = db.agora()
    with db.conexao() as c:
        with c.cursor() as cur:
            cur.executemany("INSERT INTO painel_textos (texto, rotas, origem, ativo, visto_em) VALUES (%s, CAST(%s AS jsonb), 'navegador', true, %s) "
                            "ON CONFLICT (texto) DO UPDATE SET visto_em = excluded.visto_em", [(t, json.dumps([rota] if rota else []), agora) for t in lista])
    ja = {r["texto"]: r["traducao"] for r in db.consultar(
        f"SELECT texto, traducao FROM painel_traducoes WHERE idioma = ? AND texto IN ({','.join('?' * len(lista))})", (idioma, *lista))}
    faltam = [t for t in lista if t not in ja]
    saida = dict(ja)
    lotes, lote, soma = [], [], 0
    for t in faltam:   # lotes de ~2.500 caracteres, traduzidos em paralelo (até 4 ao mesmo tempo)
        if lote and soma + len(t) > 2500:
            lotes.append(lote); lote, soma = [], 0
        lote.append(t); soma += len(t)
    if lote:
        lotes.append(lote)

    def um_lote(lt):
        try:
            resp = ia.gerar(_prompt(idioma, "painel"), json.dumps(lt, ensure_ascii=False), max_tokens=min(6000, 300 + sum(map(len, lt)) * 2), temperatura=0.1)
            res = ia.json_da_resposta(resp)
        except Exception:  # noqa: BLE001
            return []
        if not isinstance(res, list) or len(res) != len(lt):
            return []
        boas = []
        for pt, tr in zip(lt, res):
            tr = normalizar(str(tr or ""))[:2400]
            # o número de marcadores {n} tem que bater, senão a tela mostraria número errado
            if tr and sorted(re.findall(r"\{\d+\}", pt)) == sorted(re.findall(r"\{\d+\}", tr)):
                boas.append((pt, tr))
        return boas

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(4) as ex:
        feitos = [par for r in ex.map(um_lote, lotes[:8]) for par in r]
    if feitos:
        agora = db.agora()
        with db.conexao() as c:
            with c.cursor() as cur:
                cur.executemany("INSERT INTO painel_traducoes (texto, idioma, traducao, origem, revisada, atualizado_em) VALUES (%s,%s,%s,'ia',false,%s) "
                                "ON CONFLICT (texto, idioma) DO NOTHING", [(pt, idioma, tr, agora) for pt, tr in feitos])
        saida.update(dict(feitos))
    if len(saida) > len(ja):
        subir_versao("painel")
    return {"textos": saida}
