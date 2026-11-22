"""Cloudflare do domínio zynio.com.br, operada pelo agente do escritório.

O token (CLOUDFLARE_API_TOKEN) fica só no .env do agente, como o da Vercel: a nuvem pede pela fila (tipo "infra",
op "cf_…") e o agente chama a API. Só a zona zynio.com.br e a conta dona dela.

Os registros do domínio são "DNS only" (o proxy laranja quebra o certificado da Vercel). Por isso WAF, cache,
modo "Under Attack" e as métricas HTTP da Cloudflare não se aplicam: aqui ficam DNS, consultas DNS, DNSSEC,
redirecionamento de e-mail, Turnstile e a auditoria da conta.
"""
import datetime
import re
import time

import httpx

from . import db

API = "https://api.cloudflare.com/client/v4"
ZONA = "zynio.com.br"
IPS_VERCEL = ("216.198.79.1", "64.29.17.1", "76.76.21.21")
TIPOS = ("A", "AAAA", "CNAME", "TXT", "MX", "CAA", "SRV")
_cache: dict = {}


class ErroCF(Exception):
    pass


def _token() -> str:
    t = db.ENV.get("CLOUDFLARE_API_TOKEN")
    if not t:
        raise ErroCF("Este computador não tem o CLOUDFLARE_API_TOKEN no .env. Crie o token (Infra → Cloudflare → Token) e reinstale o agente.")
    return t


def _req(metodo: str, caminho: str, params: dict | None = None, json=None, bruto: bool = False):
    try:
        r = httpx.request(metodo, f"{API}{caminho}", params=params, json=json, headers={"Authorization": f"Bearer {_token()}"}, timeout=25)
    except httpx.HTTPError as e:
        raise ErroCF(f"Sem resposta da Cloudflare ({type(e).__name__}).") from e
    if bruto:
        if r.status_code >= 400:
            raise ErroCF(f"Cloudflare respondeu {r.status_code}.")
        return r.text
    try:
        j = r.json()
    except ValueError:
        raise ErroCF(f"Cloudflare respondeu {r.status_code} sem JSON.") from None
    if not j.get("success", r.status_code < 400):
        erros = "; ".join(f"{e.get('message', '')}" for e in j.get("errors", [])) or str(r.status_code)
        if r.status_code in (401, 403):
            erros += " (o token não tem essa permissão: confira em Infra → Cloudflare → Token)"
        raise ErroCF(f"Cloudflare: {erros}")
    return j


def _gql(query: str, variaveis: dict) -> dict:
    """GraphQL de análise. Erro (plano grátis, permissão) vira ErroCF com a mensagem da Cloudflare."""
    j = httpx.post(f"{API}/graphql", json={"query": query, "variables": variaveis},
                   headers={"Authorization": f"Bearer {_token()}"}, timeout=25).json()
    if j.get("errors"):
        raise ErroCF("; ".join(e.get("message", "") for e in j["errors"])[:300])
    return j.get("data") or {}


def _paralelo(tarefas: dict) -> dict:
    """Roda chamadas independentes ao mesmo tempo (a fila do agente é uma só: cada segundo conta). Erro vira ErroCF no lugar."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=min(8, len(tarefas))) as ex:
        fut = {k: ex.submit(f) for k, f in tarefas.items()}
    out = {}
    for k, f in fut.items():
        try:
            out[k] = f.result()
        except Exception as e:  # noqa: BLE001
            out[k] = e if isinstance(e, ErroCF) else ErroCF(str(e)[:200])
    return out


def _ou_erro(v):
    if isinstance(v, Exception):
        raise v
    return v


def zona() -> dict:
    """Zona zynio.com.br (cache de 10 min)."""
    if _cache.get("em", 0) > time.time() - 600:
        return _cache["zona"]
    lista = _req("GET", "/zones", {"name": ZONA}).get("result") or []
    if not lista:
        raise ErroCF(f"A zona {ZONA} não aparece para este token (confira se ele tem a zona {ZONA}).")
    _cache.update({"em": time.time(), "zona": lista[0]})
    return lista[0]


def _zid() -> str:
    return zona()["id"]


def _conta() -> str:
    return zona()["account"]["id"]


def _nome(n: str) -> str:
    n = (n or "").strip().rstrip(".").lower()
    if n in ("", "@", ZONA):
        return ZONA
    return n if n.endswith("." + ZONA) else f"{n}.{ZONA}"


def _dias(n: int) -> tuple[str, str]:
    hoje = datetime.date.today()
    return (hoje - datetime.timedelta(days=n - 1)).isoformat(), hoje.isoformat()


# ---------------- DNS ----------------
def _finalidade(r: dict) -> tuple[str, bool]:
    """Para que serve o registro e se ele é protegido (mexer exige digitar o nome)."""
    nome, tipo, c = r["name"], r["type"], (r.get("content") or "").strip('"')
    sub = nome[: -len(ZONA)].rstrip(".") if nome.endswith(ZONA) else nome
    if (tipo == "A" and c in IPS_VERCEL) or (tipo == "CNAME" and "vercel-dns" in c):
        return "Vercel (site e app)", True
    if sub in ("resend._domainkey", "send", "rsend"):
        return "Resend (envio de e-mail)", True
    if tipo == "MX" and "mx.cloudflare.net" in c or sub.startswith("cf20") and "_domainkey" in sub:
        return "E-mail recebido (Cloudflare)", True
    if tipo == "TXT" and c.startswith("v=spf1") and sub == "":
        return "SPF (quem envia pelo domínio)", True
    if sub == "_dmarc":
        return "DMARC (política anti-falsificação)", True
    if tipo == "TXT" and c.startswith("google-site-verification"):
        return "Google (verificação do domínio)", True
    return "Outro", False


def _resumir_reg(r: dict) -> dict:
    para, protegido = _finalidade(r)
    meta = r.get("meta") or {}
    return {"id": r["id"], "tipo": r["type"], "nome": r["name"], "conteudo": r.get("content"), "proxy": r.get("proxied", False),
            "pode_proxy": r.get("proxiable", False), "ttl": r.get("ttl"), "prioridade": r.get("priority"), "comentario": r.get("comment"),
            "criado": r.get("created_on"), "alterado": r.get("modified_on"), "para": para, "protegido": protegido,
            "travado": bool(meta.get("read_only") or meta.get("email_routing"))}


def _registros() -> list[dict]:
    return _req("GET", f"/zones/{_zid()}/dns_records", {"per_page": 500}).get("result") or []


def op_cf_dns(_a):
    regs = sorted((_resumir_reg(r) for r in _registros()), key=lambda r: (r["tipo"], r["nome"]))
    return {"zona": ZONA, "itens": regs}


def _validar(corpo: dict, atual: dict | None, todos: list[dict]):
    tipo, nome, conteudo = corpo["type"], corpo["name"], corpo["content"]
    if tipo not in TIPOS:
        raise ErroCF("Tipo de registro não permitido aqui.")
    vercel = (tipo == "A" and conteudo in IPS_VERCEL) or (tipo == "CNAME" and "vercel-dns" in conteudo) or nome in (ZONA, f"www.{ZONA}", f"app.{ZONA}")
    if corpo.get("proxied") and vercel:
        raise ErroCF("Proxy laranja bloqueado nos endereços da Vercel: ele quebra o certificado do site e do app. Deixe em “DNS only”.")
    if corpo.get("proxied") and tipo not in ("A", "AAAA", "CNAME"):
        raise ErroCF("Só registros A, AAAA e CNAME podem passar pelo proxy.")
    if tipo == "TXT" and conteudo.strip('"').startswith("v=spf1") and nome == ZONA:
        outros = [r for r in todos if r["type"] == "TXT" and r["name"] == ZONA and (r.get("content") or "").strip('"').startswith("v=spf1")
                  and (not atual or r["id"] != atual["id"])]
        if outros:
            raise ErroCF("Já existe um SPF na raiz. Dois SPF fazem os e-mails falharem: edite o que existe em vez de criar outro.")
    if tipo == "CNAME" and nome == ZONA:
        raise ErroCF("A raiz do domínio não pode ser CNAME (ela já tem os registros A da Vercel).")


def _corpo(a: dict) -> dict:
    tipo = str(a.get("tipo", "")).upper()
    conteudo = str(a.get("conteudo", "")).strip()
    if tipo == "TXT" and not conteudo.startswith('"'):
        conteudo = f'"{conteudo}"'          # aspas evitam o bloqueio de texto longo (chaves DKIM) no envio
    corpo = {"type": tipo, "name": _nome(a.get("nome", "")), "content": conteudo, "ttl": int(a.get("ttl") or 1),
             "proxied": bool(a.get("proxy")) if tipo in ("A", "AAAA", "CNAME") else False, "comment": (a.get("comentario") or "")[:100] or None}
    if tipo in ("MX", "SRV"):
        corpo["priority"] = int(a.get("prioridade") or 10)
    if corpo["ttl"] != 1 and not 60 <= corpo["ttl"] <= 86400:
        raise ErroCF("TTL fora do intervalo (automático ou de 60 a 86400 s).")
    return corpo


def _exigir_confirmacao(reg: dict, a: dict, verbo: str):
    para, protegido = _finalidade(reg)
    if protegido and (a.get("confirmar") or "").strip().lower() != reg["name"]:
        raise ErroCF(f"Registro protegido ({para}). Para {verbo}, digite o nome completo: {reg['name']}")


def op_cf_dns_criar(a):
    corpo = _corpo(a)
    todos = _registros()
    _validar(corpo, None, todos)
    r = _req("POST", f"/zones/{_zid()}/dns_records", json=corpo)["result"]
    db.registrar("sistema", "Cloudflare: registro DNS criado", detalhe=f"{corpo['type']} {corpo['name']}")
    return {"ok": True, "registro": _resumir_reg(r)}


def op_cf_dns_editar(a):
    todos = _registros()
    atual = next((r for r in todos if r["id"] == a.get("id")), None)
    if not atual:
        raise ErroCF("Registro não encontrado (já foi apagado?).")
    if (atual.get("meta") or {}).get("read_only"):
        raise ErroCF("Esse registro é gerenciado pelo redirecionamento de e-mail da Cloudflare e não pode ser editado.")
    _exigir_confirmacao(atual, a, "editar")
    corpo = _corpo(a)
    _validar(corpo, atual, todos)
    r = _req("PATCH", f"/zones/{_zid()}/dns_records/{atual['id']}", json=corpo)["result"]
    db.registrar("sistema", "Cloudflare: registro DNS editado", detalhe=f"{atual['type']} {atual['name']}: {str(atual.get('content'))[:80]} → {corpo['content'][:80]}")
    return {"ok": True, "registro": _resumir_reg(r)}


def op_cf_dns_apagar(a):
    atual = next((r for r in _registros() if r["id"] == a.get("id")), None)
    if not atual:
        raise ErroCF("Registro não encontrado (já foi apagado?).")
    if (atual.get("meta") or {}).get("read_only"):
        raise ErroCF("Esse registro é gerenciado pelo redirecionamento de e-mail. Para tirá-lo, desligue o redirecionamento.")
    _exigir_confirmacao(atual, a, "apagar")
    _req("DELETE", f"/zones/{_zid()}/dns_records/{atual['id']}")
    db.registrar("sistema", "Cloudflare: registro DNS apagado", detalhe=f"{atual['type']} {atual['name']} = {str(atual.get('content'))[:120]}")
    return {"ok": True}


def op_cf_dns_exportar(_a):
    return {"arquivo": f"{ZONA}.txt", "texto": _req("GET", f"/zones/{_zid()}/dns_records/export", bruto=True)}


def op_cf_dns_analise(a):
    dias = max(1, min(int(a.get("dias", 7)), 30))
    d0, d1 = _dias(dias)
    base = "query($z: String!, $d0: Date!, $d1: Date!) { viewer { zones(filter: {zoneTag: $z}) { dnsAnalyticsAdaptiveGroups(limit: %d, filter: {date_geq: $d0, date_leq: $d1}, orderBy: [%s]) { count dimensions { %s } } } } }"
    v = {"z": _zid(), "d0": d0, "d1": d1}

    def grupos(lim, ordem, dims):
        z = (_gql(base % (lim, ordem, dims), v).get("viewer", {}).get("zones") or [{}])[0]
        return z.get("dnsAnalyticsAdaptiveGroups") or []
    try:
        serie = [{"dia": g["dimensions"]["date"], "consultas": g["count"]} for g in grupos(100, "date_ASC", "date")]
    except ErroCF as e:
        return {"indisponivel": str(e), "dias": dias}
    out = {"dias": dias, "serie": serie, "total": sum(s["consultas"] for s in serie)}
    for chave, dim in (("por_tipo", "queryType"), ("por_resposta", "responseCode"), ("por_nome", "queryName")):
        try:
            out[chave] = [{"nome": g["dimensions"][dim], "consultas": g["count"]} for g in grupos(10, "count_DESC", dim)]
        except ErroCF:
            out[chave] = []
    return out


# ---------------- DNSSEC e configurações ----------------
def op_cf_dnssec(_a):
    d = _req("GET", f"/zones/{_zid()}/dnssec")["result"]
    return {"estado": d.get("status"), "ds": d.get("ds"), "tag": d.get("key_tag"), "algoritmo": d.get("algorithm"),
            "tipo_digest": d.get("digest_type"), "digest": d.get("digest"), "alterado": d.get("modified_on")}


def op_cf_dnssec_mudar(a):
    ligar = bool(a.get("ligar"))
    if not ligar and (a.get("confirmar") or "").strip().lower() != ZONA:
        raise ErroCF(f"Para desligar o DNSSEC, tire antes o DS no Registro.br e digite {ZONA} para confirmar.")
    _req("PATCH", f"/zones/{_zid()}/dnssec", json={"status": "active" if ligar else "disabled"})
    db.registrar("sistema", f"Cloudflare: DNSSEC {'ligado' if ligar else 'desligado'}")
    return op_cf_dnssec({})


CONFIG_ZONA = {"ssl": "Modo SSL", "always_use_https": "Sempre HTTPS", "min_tls_version": "TLS mínimo", "tls_1_3": "TLS 1.3",
               "automatic_https_rewrites": "Reescrever para HTTPS", "security_level": "Nível de segurança", "browser_check": "Checagem do navegador",
               "challenge_ttl": "Validade do desafio", "ipv6": "IPv6", "http3": "HTTP/3", "0rtt": "0-RTT", "brotli": "Brotli",
               "email_obfuscation": "Esconder e-mails nas páginas", "hotlink_protection": "Proteção de hotlink", "development_mode": "Modo desenvolvimento"}


def op_cf_config(_a):
    itens = _req("GET", f"/zones/{_zid()}/settings").get("result") or []
    return {"itens": [{"id": i["id"], "nome": CONFIG_ZONA[i["id"]], "valor": i.get("value"), "editavel": i.get("editable")}
                      for i in itens if i["id"] in CONFIG_ZONA],
            "aviso": "Estas opções só valem para tráfego que passa pelo proxy da Cloudflare. Aqui todo registro é “DNS only” (o site e o app são servidos pela Vercel)."}


# ---------------- e-mail (Email Routing) ----------------
def _destinos() -> list[dict]:
    lista = _req("GET", f"/accounts/{_conta()}/email/routing/addresses", {"per_page": 50}).get("result") or []
    return [{"id": d.get("id") or d.get("tag"), "email": d["email"], "verificado": bool(d.get("verified")), "criado": d.get("created")} for d in lista]


def _regra(r: dict) -> dict:
    para = next((m.get("value") for m in r.get("matchers", []) if m.get("field") == "to"), None)
    acao = (r.get("actions") or [{}])[0]
    return {"id": r.get("id") or r.get("tag"), "nome": r.get("name"), "ativa": r.get("enabled", False), "prioridade": r.get("priority"),
            "endereco": para, "acao": acao.get("type"), "destinos": acao.get("value") or []}


def _email_eventos(z: str) -> list:
    d0 = (datetime.datetime.now(datetime.UTC) - datetime.timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    q = ("query($z: String!, $d0: Time!) { viewer { zones(filter: {zoneTag: $z}) { emailRoutingAdaptive(limit: 200, filter: {datetime_geq: $d0}, "
         "orderBy: [datetime_DESC]) { datetime action status from to spf dkim dmarc } } } }")
    return ((_gql(q, {"z": z, "d0": d0}).get("viewer", {}).get("zones") or [{}])[0].get("emailRoutingAdaptive")) or []


def op_cf_email(a):
    z = _zid()
    r = _paralelo({"st": lambda: _req("GET", f"/zones/{z}/email/routing")["result"],
                   "regras": lambda: _req("GET", f"/zones/{z}/email/routing/rules", {"per_page": 50}).get("result") or [],
                   "pega": lambda: _req("GET", f"/zones/{z}/email/routing/rules/catch_all")["result"],
                   "destinos": _destinos,
                   **({"ev": lambda: _email_eventos(z)} if a.get("atividade", True) else {})})
    st, regras, pega = _ou_erro(r["st"]), _ou_erro(r["regras"]), _ou_erro(r["pega"])
    regras = [x for x in regras if not any(m.get("type") == "all" for m in x.get("matchers", []))]   # o pega-tudo vem à parte
    out = {"ativo": st.get("enabled"), "estado": st.get("status"), "regras": [_regra(x) for x in regras], "pega_tudo": _regra(pega),
           "destinos": _ou_erro(r["destinos"])}
    if "ev" not in r:
        return out
    try:
        ev = _ou_erro(r["ev"])
        porDia: dict = {}
        for e in ev:
            dia = e["datetime"][:10]
            s = porDia.setdefault(dia, {"dia": dia, "recebidos": 0, "encaminhados": 0, "rejeitados": 0})
            s["recebidos"] += 1
            if e.get("status") == "delivered":
                s["encaminhados"] += 1
            elif e.get("status") in ("rejected", "failed", "dropped", "error"):
                s["rejeitados"] += 1
        out["atividade"] = {"serie": sorted(porDia.values(), key=lambda s: s["dia"]),
                            "ultimos": [{"quando": e["datetime"], "de": e.get("from"), "para": e.get("to"), "estado": e.get("status"),
                                         "acao": e.get("action"), "spf": e.get("spf"), "dkim": e.get("dkim"), "dmarc": e.get("dmarc")} for e in ev[:30]]
                            if a.get("detalhe") else []}
    except ErroCF as e:
        out["atividade"] = {"indisponivel": str(e)}
    return out


def op_cf_email_regra(a):
    z, acao = _zid(), a.get("acao")
    if acao == "criar":
        local = str(a.get("local", "")).strip().lower()
        if not re.fullmatch(r"[a-z0-9._+-]{1,64}", local):
            raise ErroCF("Endereço inválido: use letras, números, ponto, hífen ou sublinhado.")
        destino = str(a.get("destino", "")).strip().lower()
        if destino not in {d["email"].lower() for d in _destinos() if d["verificado"]}:
            raise ErroCF("Esse destino ainda não foi confirmado. Cadastre o e-mail em Destinos e clique no link que a Cloudflare enviar.")
        corpo = {"name": a.get("nome") or f"{local}@{ZONA}", "enabled": True,
                 "matchers": [{"type": "literal", "field": "to", "value": f"{local}@{ZONA}"}], "actions": [{"type": "forward", "value": [destino]}]}
        _req("POST", f"/zones/{z}/email/routing/rules", json=corpo)
        db.registrar("sistema", "Cloudflare: e-mail criado", detalhe=f"{local}@{ZONA} → {destino}")
    elif acao in ("ligar", "desligar"):
        r = _req("GET", f"/zones/{z}/email/routing/rules/{a['id']}")["result"]
        r["enabled"] = acao == "ligar"
        _req("PUT", f"/zones/{z}/email/routing/rules/{a['id']}", json={k: r[k] for k in ("name", "enabled", "matchers", "actions", "priority") if k in r})
        db.registrar("sistema", f"Cloudflare: e-mail {'ligado' if r['enabled'] else 'desligado'}", detalhe=_regra(r)["endereco"] or "")
    elif acao == "apagar":
        r = _req("GET", f"/zones/{z}/email/routing/rules/{a['id']}")["result"]
        _req("DELETE", f"/zones/{z}/email/routing/rules/{a['id']}")
        db.registrar("sistema", "Cloudflare: e-mail apagado", detalhe=_regra(r)["endereco"] or "")
    else:
        raise ErroCF("Ação desconhecida.")
    return op_cf_email({})


def op_cf_email_pegatudo(a):
    ativo, acao = bool(a.get("ativo")), a.get("acao", "forward")
    if acao == "forward":
        destino = str(a.get("destino", "")).strip().lower()
        if destino not in {d["email"].lower() for d in _destinos() if d["verificado"]}:
            raise ErroCF("Escolha um destino já confirmado.")
        acoes = [{"type": "forward", "value": [destino]}]
    else:
        acoes = [{"type": "drop"}]
    _req("PUT", f"/zones/{_zid()}/email/routing/rules/catch_all", json={"enabled": ativo, "matchers": [{"type": "all"}], "actions": acoes})
    db.registrar("sistema", "Cloudflare: pega-tudo do e-mail mudado", detalhe=f"{'ligado' if ativo else 'desligado'} · {acao}")
    return op_cf_email({})


def op_cf_email_destino(a):
    email = str(a.get("email", "")).strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", email):
        raise ErroCF("E-mail inválido.")
    _req("POST", f"/accounts/{_conta()}/email/routing/addresses", json={"email": email})
    db.registrar("sistema", "Cloudflare: destino de e-mail cadastrado (aguarda confirmação)", detalhe=email)
    return op_cf_email({})


# ---------------- Turnstile e auditoria ----------------
def op_cf_turnstile(a):
    ws = _widgets_da_zona()   # a conta tem widgets de outros projetos do dono: aqui só os deste domínio
    chaves = {w["sitekey"] for w in ws}
    out = {"widgets": [{"sitekey": w["sitekey"], "nome": w.get("name"), "dominios": w.get("domains") or [], "modo": w.get("mode"),
                        "criado": w.get("created_on"), "alterado": w.get("modified_on")} for w in ws]}
    dias = max(1, min(int(a.get("dias", 7)), 30))
    d0, d1 = _dias(dias)
    try:
        q = ("query($c: String!, $d0: Date!, $d1: Date!) { viewer { accounts(filter: {accountTag: $c}) { turnstileAdaptiveGroups(limit: 1000, "
             "filter: {date_geq: $d0, date_leq: $d1}, orderBy: [date_ASC]) { count dimensions { date eventType siteKey } } } } }")
        gs = ((_gql(q, {"c": _conta(), "d0": d0, "d1": d1}).get("viewer", {}).get("accounts") or [{}])[0].get("turnstileAdaptiveGroups")) or []
        porDia: dict = {}
        for g in gs:
            dm = g["dimensions"]
            if dm.get("siteKey") and dm["siteKey"] not in chaves:
                continue
            s = porDia.setdefault(dm["date"], {"dia": dm["date"]})
            s[dm.get("eventType") or "outros"] = s.get(dm.get("eventType") or "outros", 0) + g["count"]
        out["desafios"] = {"dias": dias, "serie": sorted(porDia.values(), key=lambda s: s["dia"]),
                           "tipos": sorted({g["dimensions"].get("eventType") or "outros" for g in gs})}
    except ErroCF as e:
        out["desafios"] = {"indisponivel": str(e)}
    return out


def op_cf_auditoria(a):
    lim = max(10, min(int(a.get("limite", 50)), 100))
    itens = _req("GET", f"/accounts/{_conta()}/audit_logs", {"per_page": lim, "direction": "desc"}).get("result") or []
    out = []
    for i in itens:
        zn = (i.get("metadata") or {}).get("zone_name") or (i.get("resource") or {}).get("zone_name")
        if zn and zn != ZONA:
            continue
        out.append({"quando": i.get("when"), "acao": (i.get("action") or {}).get("type"), "ok": (i.get("action") or {}).get("result"),
                    "quem": (i.get("actor") or {}).get("email") or (i.get("actor") or {}).get("type"), "ip": (i.get("actor") or {}).get("ip"),
                    "recurso": (i.get("resource") or {}).get("type"), "via": i.get("interface")})
    return {"itens": out}


# ---------------- resumo, token e saúde do domínio ----------------
def op_cf_token(_a):
    t = _req("GET", "/user/tokens/verify")["result"]
    testes = {}
    for nome, f in (("Zona", lambda: zona()), ("DNS", lambda: _registros()), ("DNSSEC", lambda: op_cf_dnssec({})),
                    ("Configurações da zona", lambda: _req("GET", f"/zones/{_zid()}/settings/ssl")),
                    ("E-mail (regras)", lambda: _req("GET", f"/zones/{_zid()}/email/routing/rules")),
                    ("E-mail (destinos)", lambda: _destinos()), ("Turnstile", lambda: _req("GET", f"/accounts/{_conta()}/challenges/widgets")),
                    ("Auditoria", lambda: _req("GET", f"/accounts/{_conta()}/audit_logs", {"per_page": 1}))):
        try:
            f(); testes[nome] = True
        except ErroCF:
            testes[nome] = False
    return {"estado": t.get("status"), "expira": t.get("expires_on"), "nao_antes": t.get("not_before"), "permissoes": testes}


def _resumo_email(e: dict) -> dict:
    return {"ativo": e["ativo"], "estado": e["estado"], "regras": len(e["regras"]), "ativas": sum(1 for r in e["regras"] if r["ativa"]),
            "pega_tudo": e["pega_tudo"]["ativa"]}


def _widgets_da_zona() -> list:
    ws = _req("GET", f"/accounts/{_conta()}/challenges/widgets", {"per_page": 50}).get("result") or []
    return [w for w in ws if any(d == ZONA or d.endswith("." + ZONA) for d in (w.get("domains") or []))]


def op_cf_resumo(_a):
    z = zona()
    r = _paralelo({"regs": _registros, "dnssec": lambda: op_cf_dnssec({})["estado"],
                   "email": lambda: _resumo_email(op_cf_email({"atividade": False})), "turnstile": lambda: len(_widgets_da_zona())})
    regs = _ou_erro(r["regs"])
    out = {"zona": {"nome": z["name"], "estado": z.get("status"), "plano": (z.get("plan") or {}).get("name"), "pausada": z.get("paused"),
                    "nameservers": z.get("name_servers"), "registrador": z.get("original_registrar"), "ativa_desde": z.get("activated_on"),
                    "conta": (z.get("account") or {}).get("name")},
           "registros": len(regs), "com_proxy": sum(1 for x in regs if x.get("proxied"))}
    for chave in ("dnssec", "email", "turnstile"):
        out[chave] = {"erro": str(r[chave])} if isinstance(r[chave], Exception) else r[chave]
    return out


def op_cf_visao(_a):
    """Página inicial da zona, no jeito do painel da Cloudflare: estado, plano, nameservers, DNSSEC, SSL/TLS, registros por
    tipo, e-mails roteados e widgets do Turnstile, com o que vale a pena ajustar."""
    z = zona()
    r = _paralelo({"regs": _registros, "dnssec": lambda: op_cf_dnssec({})["estado"], "cfg": lambda: op_cf_config({})["itens"],
                   "email": lambda: _resumo_email(op_cf_email({"atividade": False})), "turnstile": lambda: len(_widgets_da_zona())})
    regs = _ou_erro(r["regs"])
    tipos = {}
    for x in regs:
        tipos[x["type"]] = tipos.get(x["type"], 0) + 1
    cfg = {} if isinstance(r["cfg"], Exception) else {i["id"]: i["valor"] for i in r["cfg"]}
    dicas = []
    if not isinstance(r["dnssec"], Exception) and r["dnssec"] != "active":
        dicas.append("Ligar o DNSSEC (Segurança → DNSSEC) protege contra respostas de DNS falsificadas.")
    if any(x.get("proxied") for x in regs):
        dicas.append("Há registros com o proxy laranja: nos endereços da Vercel isso quebra o certificado.")
    return {"zona": {"nome": z["name"], "estado": z.get("status"), "plano": (z.get("plan") or {}).get("name"), "pausada": z.get("paused"),
                     "nameservers": z.get("name_servers"), "registrador": z.get("original_registrar"), "ativa_desde": z.get("activated_on"),
                     "criada": z.get("created_on"), "tipo": z.get("type")},
            "registros": {"total": len(regs), "por_tipo": tipos, "com_proxy": sum(1 for x in regs if x.get("proxied"))},
            "dnssec": None if isinstance(r["dnssec"], Exception) else r["dnssec"],
            "ssl": {k: cfg.get(k) for k in ("ssl", "min_tls_version", "tls_1_3", "always_use_https", "http3", "ipv6")},
            "email": None if isinstance(r["email"], Exception) else r["email"], "turnstile": None if isinstance(r["turnstile"], Exception) else r["turnstile"],
            "dicas": dicas, "aviso": "Todos os registros são “DNS only”: o tráfego vai direto para a Vercel, então cache, WAF e certificados são da Vercel."}


def _dominios_vercel() -> list:
    """Só os domínios dos projetos (bem mais leve que infra.op_resumo)."""
    from . import infra
    proj = infra.projetos()
    res = _paralelo({n: (lambda pid=p["id"]: infra._req("GET", f"/v9/projects/{pid}/domains").get("domains", [])) for n, p in proj.items()})
    return [{"nome": d["name"], "verificado": d.get("verified")} for v in res.values() for d in _ou_erro(v)]


def op_cf_saude(_a):
    """Checklist do domínio: une Cloudflare (DNS autoritativo), Vercel e Resend."""
    from . import correio
    pre = _paralelo({"regs": _registros, "vercel": _dominios_vercel, "resend": correio.dns_publico,
                     "email": lambda: op_cf_email({"atividade": False}), "dnssec": lambda: op_cf_dnssec({})["estado"]})
    regs = _ou_erro(pre["regs"])
    def acha(tipo, nome):
        return [r for r in regs if r["type"] == tipo and r["name"] == _nome(nome)]
    itens = []
    def item(grupo, nome, ok, detalhe, fazer="", alerta=False):
        itens.append({"grupo": grupo, "nome": nome, "estado": "ok" if ok else ("alerta" if alerta else "erro"), "detalhe": detalhe, "fazer": "" if ok else fazer})
    raiz = acha("A", "@")
    item("Site e app", "Raiz aponta para a Vercel", raiz and all(r["content"] in IPS_VERCEL for r in raiz),
         ", ".join(r["content"] for r in raiz) or "sem registro A", "Os registros A da raiz devem ser os IPs da Vercel (216.198.79.1 e 64.29.17.1).")
    for sub in ("app", "www"):
        c = acha("CNAME", sub)
        item("Site e app", f"{sub}.{ZONA} na Vercel", bool(c) and "vercel-dns" in c[0]["content"], c[0]["content"] if c else "sem CNAME",
             f"Crie o CNAME {sub} apontando para o endereço que a Vercel mostrar.")
    prox = [r["name"] for r in regs if r.get("proxied") and r["type"] in ("A", "CNAME") and _finalidade(r)[0].startswith("Vercel")]
    item("Site e app", "Proxy desligado nos endereços da Vercel", not prox, ", ".join(prox) or "todos em DNS only",
         "Desligue o proxy (nuvem cinza): o laranja quebra o certificado.")
    if isinstance(pre["vercel"], Exception):   # sem token da Vercel o resto continua
        item("Site e app", "Domínios na Vercel", False, f"não deu para ler: {str(pre['vercel'])[:120]}", "Confira o VERCEL_TOKEN do agente.", alerta=True)
    else:
        for d in pre["vercel"]:
            if d["nome"].endswith(ZONA):
                item("Site e app", f"Vercel reconhece {d['nome']}", d.get("verificado") is not False, "verificado" if d.get("verificado") is not False else "não verificado",
                     "Abra o domínio no painel da Vercel e siga a verificação.")
    spf = [r for r in acha("TXT", "@") if r["content"].strip('"').startswith("v=spf1")]
    item("E-mail", "Um único SPF na raiz", len(spf) == 1, spf[0]["content"].strip('"') if len(spf) == 1 else f"{len(spf)} registros SPF",
         "Deixe só um SPF na raiz (edite em vez de criar outro).")
    dm = acha("TXT", "_dmarc")
    item("E-mail", "DMARC publicado", bool(dm) and "v=DMARC1" in dm[0]["content"], dm[0]["content"].strip('"') if dm else "sem DMARC",
         "Crie TXT _dmarc com v=DMARC1; p=reject.")
    for r in ([] if isinstance(pre["resend"], Exception) else pre["resend"]):
        if "DMARC" in r["para"]:
            continue
        item("E-mail", f"Resend: {r['para']}", r["ok"], r["nome"], "Confira os registros do Resend em /emails.")
    item("E-mail", "Domínio verificado no Resend", correio.dominio_verificado(), "remetente " + correio.remetente(),
         "Abra /emails e siga os passos de verificação.")
    mx = acha("MX", "@")
    item("E-mail", "MX da Cloudflare (receber e-mails)", any("mx.cloudflare.net" in r["content"] for r in mx), f"{len(mx)} MX",
         "Ative o redirecionamento em Infra → Cloudflare → E-mail.")
    try:
        e = _ou_erro(pre["email"])
        item("E-mail", "Redirecionamento de e-mail ativo", bool(e["ativo"]) and e["estado"] in ("ready", "enabled"), e["estado"] or "—",
             "Na Cloudflare, Email Routing → Settings → corrija os registros pendentes.", alerta=e["estado"] == "syncing")
        pend = [d["email"] for d in e["destinos"] if not d["verificado"]]
        item("E-mail", "Destinos confirmados", not pend, ", ".join(pend) or f"{len(e['destinos'])} confirmado(s)",
             "Peça para o dono do e-mail clicar no link de confirmação da Cloudflare.", alerta=True)
    except ErroCF as ex:
        item("E-mail", "Redirecionamento de e-mail", False, str(ex)[:160], "Dê ao token a permissão Email Routing.", alerta=True)
    try:
        ds = _ou_erro(pre["dnssec"])
        item("Segurança", "DNSSEC", ds == "active", ds or "—", "Ligue em Infra → Cloudflare → Segurança e cole o DS no Registro.br.", alerta=True)
    except ErroCF as ex:
        item("Segurança", "DNSSEC", False, str(ex)[:160], "Dê ao token a permissão DNS.", alerta=True)
    caa = acha("CAA", "@")
    item("Segurança", "CAA (quem pode emitir certificado)", bool(caa), f"{len(caa)} registro(s)" if caa else "sem CAA (qualquer autoridade pode emitir)",
         "Opcional: CAA para letsencrypt.org e pki.goog (as que a Vercel usa).", alerta=True)
    return {"itens": itens, "lido_em": int(time.time()),
            "resumo": {k: sum(1 for i in itens if i["estado"] == k) for k in ("ok", "alerta", "erro")}}


OPS = {f"cf_{n[6:]}" if n.startswith("op_cf_") else n: f for n, f in list(globals().items()) if n.startswith("op_cf_") and callable(f)}
ALTERAM = {"cf_dns_criar", "cf_dns_editar", "cf_dns_apagar", "cf_dnssec_mudar", "cf_email_regra", "cf_email_pegatudo", "cf_email_destino"}
