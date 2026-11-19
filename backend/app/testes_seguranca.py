"""Testes de segurança ao vivo, em lote (mais de mil verificações reais contra os próprios domínios).

Roda no agente (fila `infra`, op `seguranca_testes`), em paralelo (16 por vez), e grava o progresso em
config.seguranca_testes_progresso para a tela animar. Os pedidos levam o cabeçalho X-Clima-Teste assinado (HMAC, 5 min):
o firewall não conta os 401/403 deles nem os limita (senão o próprio teste bloquearia o IP do escritório).

Nada aqui ataca terceiros: só app.zynio.com.br, zynio.com.br, www.zynio.com.br e o endereço antigo da Vercel.
Categorias: arquivos sensíveis expostos, cabeçalhos de segurança por página, API sem login, métodos HTTP, CORS,
mensagens de erro, cookies, TLS (versões antigas e validade), DNS e e-mail (SPF, DMARC, DKIM, CAA, DNSSEC).
"""
from __future__ import annotations

import asyncio
import re
import socket
import ssl
import time

from . import db

HOSTS = ["app.zynio.com.br", "zynio.com.br", "www.zynio.com.br", "clima-casa-lac.vercel.app"]
APP = "app.zynio.com.br"
PROGRESSO = "seguranca_testes_progresso"
RESULTADO = "seguranca_testes_lote"

# arquivos que nunca podem ser servidos (assinatura = o que denunciaria o arquivo verdadeiro na resposta)
SENSIVEIS = {
    r"/.env": r"^[A-Z_]{3,}=", r"/.env.local": r"^[A-Z_]{3,}=", r"/.env.production": r"^[A-Z_]{3,}=", r"/.env.bak": r"^[A-Z_]{3,}=",
    r"/backend/.env": r"^[A-Z_]{3,}=", r"/api/.env": r"^[A-Z_]{3,}=", r"/.git/config": r"\[core\]", r"/.git/HEAD": r"^ref: refs/",
    r"/.git/index": r"^DIRC", r"/.gitignore": r"^\.env", r"/.svn/entries": r"^\d+\s", r"/.hg/hgrc": r"\[paths\]", r"/.DS_Store": r"Bud1",
    r"/.vercel/project.json": r'"projectId"', r"/vercel.json": r'"functions"', r"/supabase/schema.sql": r"create table", r"/schema.sql": r"create table",
    r"/backup.sql": r"(?i)create table|insert into", r"/dump.sql": r"(?i)create table|insert into", r"/db.sql": r"(?i)create table", r"/database.sql": r"(?i)create table",
    r"/backup.zip": r"^PK", r"/site.zip": r"^PK", r"/codigo.zip": r"^PK", r"/backup.tar.gz": r"^\x1f\x8b", r"/data/agente.log": r"agente", r"/agente.log": r"agente",
    r"/docs/credentials/supabase.md": r"(?i)senha|password|key", r"/docs/contas.md": r"(?i)senha", r"/requirements.txt": r"fastapi==", r"/backend/requirements.txt": r"fastapi==",
    r"/package-lock.json": r'"lockfileVersion"', r"/node_modules/.package-lock.json": r'"lockfileVersion"', r"/id_rsa": r"PRIVATE KEY", r"/.ssh/id_rsa": r"PRIVATE KEY",
    r"/.aws/credentials": r"aws_access_key_id", r"/.npmrc": r"_authToken", r"/.pypirc": r"password", r"/config.json": r'"(api_key|secret)"', r"/credentials.json": r'"private_key"',
    r"/wp-config.php": r"DB_PASSWORD", r"/config.php": r"\$", r"/phpinfo.php": r"phpinfo", r"/info.php": r"phpinfo", r"/.htaccess": r"RewriteRule|Deny", r"/.htpasswd": r":\$",
    r"/server-status": r"Apache Server Status", r"/server-info": r"Apache Server Information", r"/docker-compose.yml": r"services:", r"/Dockerfile": r"^FROM ",
    r"/.dockerenv": r".", r"/web.config": r"<configuration", r"/crossdomain.xml": r"allow-access-from domain=\"\*\"", r"/actuator/env": r'"propertySources"',
    r"/actuator/health": r'"status"', r"/debug": r"(?i)traceback", r"/console": r"(?i)werkzeug", r"/admin.php": r"<form", r"/.well-known/openid-configuration": r'"issuer"',
    r"/api/backup": r'"aparelhos"', r"/api/supabase/tabelas": r'"tabelas"', r"/storage/v1/object/public/codigo-fonte/": r"^PK", r"/sitemap.xml.bak": r"<urlset",
    r"/.idea/workspace.xml": r"<project", r"/.vscode/settings.json": r"\{", r"/npm-debug.log": r"npm ERR", r"/yarn-error.log": r"Arguments:", r"/error.log": r"(?i)error",
    r"/access.log": r"GET /", r"/logs/app.log": r"(?i)info|error", r"/.bash_history": r"(?i)cd |ls ", r"/.zsh_history": r": \d+:", r"/backup/": r"Index of",
    r"/uploads/": r"Index of", r"/static/": r"Index of", r"/assets/": r"Index of", r"/.well-known/": r"Index of", r"/test.php": r"<\?", r"/cgi-bin/": r"Index of",
}
PAGINAS = ["/", "/login", "/mapa", "/aparelhos", "/transmissores", "/relatorios", "/seguranca", "/configuracoes", "/infra", "/rede", "/cafeteira",
           "/persianas", "/fechadura", "/avatares", "/novidades", "/guia", "/apps", "/projetos", "/atividade", "/integracoes", "/musica", "/emails",
           "/supabase", "/cenas", "/automacoes", "/agendamentos", "/mensagens", "/comandos-alexa", "/alexa", "/treinamento", "/redefinir-senha"]
PUBLICAS = {"/api/supabase-config", "/api/verificacao/desafio", "/api/site/status", "/api/apps/versao", "/api/novidades/publicas", "/api/marca/publica",
            "/api/site/cookies", "/api/clima-externo", "/api/satelites"}


def _rotas_api() -> list[str]:
    """GETs da API sem parâmetro (os com {id} recebem 1): todas precisam pedir login, fora as públicas."""
    from .rotas import api, contas, correio, dispositivos, infra, musica
    saida = set()
    for rt in (api.api, contas.contas, musica.rotas_musica, infra.rotas_infra, correio.rotas_email, dispositivos.rotas_disp):
        for r in rt.routes:
            caminho = getattr(r, "path", "")
            if "GET" in getattr(r, "methods", set()) and caminho.startswith("/api/"):
                saida.add(re.sub(r"\{[^}]+\}", "1", caminho))
    return sorted(saida - PUBLICAS)


def catalogo() -> list[dict]:
    t = []
    for h in HOSTS:   # 1. arquivos sensíveis em cada domínio
        for caminho, assin in SENSIVEIS.items():
            t.append({"cat": "Arquivos expostos", "nome": f"{h}{caminho} não é servido", "tipo": "sensivel", "host": h, "caminho": caminho, "assin": assin})
    for h in HOSTS[:2]:   # 2. cabeçalhos por página
        for pg in PAGINAS:
            for cab, regra in (("strict-transport-security", r"max-age=\d{7,}"), ("content-security-policy", r"default-src"), ("x-content-type-options", r"nosniff"),
                               ("referrer-policy", r"."), ("permissions-policy", r"camera=\(\)"), ("x-frame-options", r"DENY|SAMEORIGIN")):
                t.append({"cat": "Cabeçalhos", "nome": f"{h}{pg}: {cab}", "tipo": "cabecalho", "host": h, "caminho": pg, "cab": cab, "regra": regra})
            t.append({"cat": "Cabeçalhos", "nome": f"{h}{pg}: sem versão do servidor exposta", "tipo": "sem_versao", "host": h, "caminho": pg})
    for rota in _rotas_api():   # 3. API sem login → 401
        t.append({"cat": "API sem login", "nome": f"GET {rota} pede login", "tipo": "sem_login", "host": APP, "caminho": rota})
        t.append({"cat": "API sem login", "nome": f"GET {rota} recusa token falso", "tipo": "token_falso", "host": APP, "caminho": rota})
    for h in HOSTS[:2]:   # 4. métodos HTTP perigosos
        for met in ("TRACE", "TRACK", "PUT", "DELETE", "PATCH", "PROPFIND", "CONNECT"):
            for pg in ("/", "/index.html", "/api/saude"):
                t.append({"cat": "Métodos HTTP", "nome": f"{met} {h}{pg} recusado", "tipo": "metodo", "host": h, "caminho": pg, "metodo": met})
    for rota in _rotas_api()[:60]:   # 5. CORS: outra origem nunca é liberada
        t.append({"cat": "CORS", "nome": f"{rota} não libera https://site-malicioso.example", "tipo": "cors", "host": APP, "caminho": rota})
    for rota in ("/api/nao-existe", "/api/aparelhos/abc", "/api/../../etc/passwd", "/api/%00", "/api/aparelhos/1%27%20OR%201=1--", "/api/<script>alert(1)</script>",
                 "/api/mapa?x=" + "A" * 3000, "/oauth/token", "/alexa/diretiva"):   # 6. erro sem rastro interno
        t.append({"cat": "Mensagens de erro", "nome": f"{rota[:60]} sem rastro interno", "tipo": "erro", "host": APP, "caminho": rota})
    for h in HOSTS[:3]:   # 7. TLS
        for v in ("TLSv1", "TLSv1_1"):
            t.append({"cat": "TLS", "nome": f"{h} recusa {v.replace('_', '.')}", "tipo": "tls_antigo", "host": h, "versao": v})
        t.append({"cat": "TLS", "nome": f"{h} certificado válido por mais de 14 dias", "tipo": "tls_validade", "host": h})
        t.append({"cat": "TLS", "nome": f"{h} HTTP redireciona para HTTPS", "tipo": "redirect", "host": h})
    for nome, tipo in (("SPF publicado e terminando em ~all ou -all", "spf"), ("DMARC com p=reject ou quarantine", "dmarc"), ("DKIM do Resend publicado", "dkim"),
                       ("DNSSEC ativo (registro DS)", "dnssec"), ("CAA restringe quem emite certificado", "caa"), ("MX do recebimento configurado", "mx")):
        t.append({"cat": "DNS e e-mail", "nome": f"zynio.com.br: {nome}", "tipo": "dns", "chk": tipo})
    t.append({"cat": "Cookies", "nome": "cookie do portão (zv) com Secure, HttpOnly e SameSite", "tipo": "cookie", "host": APP})
    t.append({"cat": "Cookies", "nome": "security.txt publicado", "tipo": "securitytxt", "host": "zynio.com.br"})
    for i, x in enumerate(t):
        x["id"] = i
    return t


async def _um(cli, x, assin) -> tuple[bool, str]:
    h, c = x.get("host"), x.get("caminho", "/")
    url = f"https://{h}{c}"
    tp = x["tipo"]
    if tp == "sensivel":
        r = await cli.get(url, headers=assin)
        corpo = r.content[:4000]
        if r.status_code in (401, 403, 404, 405, 410, 400):
            return True, f"{r.status_code}"
        txt = corpo.decode("utf-8", "ignore")
        if re.search(x["assin"], txt, re.M) and "<div id=\"root\"" not in txt and "<!doctype html" not in txt.lower()[:200]:
            return False, f"{r.status_code}: conteúdo do arquivo apareceu"
        return True, f"{r.status_code} (página do app, sem o arquivo)"
    if tp in ("cabecalho", "sem_versao"):
        r = await cli.get(url, headers=assin)
        if tp == "sem_versao":
            srv = r.headers.get("server", "") + r.headers.get("x-powered-by", "")
            return (not re.search(r"\d+\.\d+", srv)), (srv or "sem cabeçalho")
        v = r.headers.get(x["cab"], "")
        if x["cab"] == "x-frame-options" and not v and "frame-ancestors 'none'" in r.headers.get("content-security-policy", ""):
            return True, "frame-ancestors 'none'"
        return bool(re.search(x["regra"], v, re.I)), (v[:80] or "ausente")
    if tp == "sem_login":
        r = await cli.get(url, headers=assin)
        return r.status_code in (401, 403), f"{r.status_code}"
    if tp == "token_falso":
        r = await cli.get(url, headers={**assin, "Authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.ZmFsc28"})
        return r.status_code in (401, 403), f"{r.status_code}"
    if tp == "metodo":
        r = await cli.request(x["metodo"], url, headers=assin)
        return r.status_code in (400, 401, 403, 404, 405, 501), f"{r.status_code}"
    if tp == "cors":
        r = await cli.get(url, headers={**assin, "Origin": "https://site-malicioso.example"})
        aco = r.headers.get("access-control-allow-origin", "")
        return aco not in ("*", "https://site-malicioso.example"), (aco or "sem liberação")
    if tp == "erro":
        r = await cli.get(url, headers=assin)
        txt = r.text[:3000]
        vaz = re.search(r"Traceback|File \"/|psycopg|sqlalchemy|at [\w.]+\(.*\.js:\d+|Exception:", txt)
        return (r.status_code < 500 and not vaz), f"{r.status_code}{' + rastro interno' if vaz else ''}"
    if tp == "redirect":
        r = await cli.get(f"http://{h}/", follow_redirects=False)
        return r.status_code in (301, 302, 307, 308) and r.headers.get("location", "").startswith("https://"), f"{r.status_code} → {r.headers.get('location', '')[:40]}"
    if tp == "cookie":
        r = await cli.get(f"https://{h}/", headers={"User-Agent": "Mozilla/5.0 teste"})
        sc = r.headers.get("set-cookie", "")
        if "zv=" not in sc:
            return True, "portão não emitiu cookie nesta visita"
        ok = all(k.lower() in sc.lower() for k in ("secure", "httponly", "samesite"))
        return ok, sc.split(";", 1)[1][:80] if ";" in sc else sc[:80]
    if tp == "securitytxt":
        r = await cli.get(f"https://{h}/.well-known/security.txt")
        return r.status_code == 200 and "Contact:" in r.text, f"{r.status_code}"
    if tp in ("tls_antigo", "tls_validade"):
        return await asyncio.to_thread(_tls, x)
    if tp == "dns":
        return await asyncio.to_thread(_dns, x["chk"], cli)
    return False, "tipo desconhecido"


def _tls(x) -> tuple[bool, str]:
    h = x["host"]
    if x["tipo"] == "tls_validade":
        ctx = ssl.create_default_context()
        with socket.create_connection((h, 443), timeout=6) as s, ctx.wrap_socket(s, server_hostname=h) as t:
            fim = ssl.cert_time_to_seconds(t.getpeercert()["notAfter"])
        dias = int((fim - time.time()) / 86400)
        return dias > 14, f"{dias} dias"
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    v = getattr(ssl.TLSVersion, x["versao"])
    try:
        ctx.minimum_version = v; ctx.maximum_version = v
    except ValueError:
        return True, "a própria biblioteca não fala mais essa versão"
    try:
        with socket.create_connection((h, 443), timeout=6) as s, ctx.wrap_socket(s, server_hostname=h):
            return False, "aceitou"
    except (ssl.SSLError, OSError):
        return True, "recusou"


def _dns(chk: str, _cli) -> tuple[bool, str]:
    import httpx
    def q(nome, tipo):
        r = httpx.get("https://cloudflare-dns.com/dns-query", params={"name": nome, "type": tipo}, headers={"accept": "application/dns-json"}, timeout=8).json()
        return [a.get("data", "") for a in r.get("Answer", []) or []], r
    if chk == "spf":
        v, _ = q("zynio.com.br", "TXT"); spf = [x for x in v if "v=spf1" in x]
        return len(spf) == 1 and re.search(r"[~-]all", spf[0]) is not None, (spf[0][:60] if spf else "ausente")
    if chk == "dmarc":
        v, _ = q("_dmarc.zynio.com.br", "TXT"); d = next((x for x in v if "v=DMARC1" in x), "")
        return bool(re.search(r"p=(reject|quarantine)", d)), d[:60] or "ausente"
    if chk == "dkim":
        v, _ = q("resend._domainkey.zynio.com.br", "TXT")
        return any("p=" in x for x in v), "publicado" if v else "ausente"
    if chk == "dnssec":
        v, r = q("zynio.com.br", "DS")
        return bool(v) or bool(r.get("AD")), "DS publicado" if v else "sem DS"
    if chk == "caa":
        v, _ = q("zynio.com.br", "CAA")
        return bool(v), ", ".join(v)[:60] or "sem CAA (qualquer autoridade pode emitir)"
    if chk == "mx":
        v, _ = q("zynio.com.br", "MX")
        return bool(v), ", ".join(v)[:60] or "sem MX"
    return False, "?"


def executar(_a=None) -> dict:
    """Roda o lote inteiro (no agente) gravando o progresso a cada ~40 testes."""
    import httpx
    from . import firewall
    lista = catalogo()
    total = len(lista)
    inicio = time.time()
    db.set_cfg(PROGRESSO, {"rodando": True, "total": total, "feitos": 0, "falhas": 0, "inicio": int(inicio), "ultimos": []})
    resultados: list[dict] = [None] * total   # type: ignore[list-item]

    async def principal():
        sem = asyncio.Semaphore(16)
        assin = {"X-Clima-Teste": firewall.iniciar_token_teste(), "User-Agent": "clima-testes-seguranca/1.0"}
        feitos = {"n": 0, "f": 0}
        ultimos: list = []
        async with httpx.AsyncClient(timeout=10, follow_redirects=False, verify=True) as cli:
            # trava: se a nuvem não reconhece a assinatura, centenas de 401 bloqueariam o IP do escritório no firewall
            r = await cli.get(f"https://{APP}/api/seguranca/testes/assinatura", headers=assin)
            if not (r.status_code == 200 and r.headers.get("content-type", "").startswith("application/json") and r.json().get("aceita")):
                if r.status_code in (403, 429) and "Security Checkpoint" in r.text:
                    raise RuntimeError("O escudo anti-DDoS está ligado (a Vercel desafia todo acesso). Desligue em Segurança → Escudo e rode de novo.")
                raise RuntimeError(f"A nuvem não aceitou o token dos testes (resposta {r.status_code}). Lote cancelado para não bloquear o IP do escritório.")

            async def rodar(x):
                async with sem:
                    try:
                        ok, det = await _um(cli, x, assin)
                    except Exception as e:  # noqa: BLE001  (sem resposta conta como falha, com o motivo)
                        ok, det = False, f"erro: {type(e).__name__}"
                    resultados[x["id"]] = {"id": x["id"], "cat": x["cat"], "nome": x["nome"], "ok": bool(ok), "det": str(det)[:120]}
                    feitos["n"] += 1; feitos["f"] += 0 if ok else 1
                    ultimos.append(resultados[x["id"]]); del ultimos[:-30]
                    if feitos["n"] % 40 == 0 or feitos["n"] == total:
                        db.set_cfg(PROGRESSO, {"rodando": feitos["n"] < total, "total": total, "feitos": feitos["n"], "falhas": feitos["f"],
                                               "inicio": int(inicio), "ultimos": ultimos[-30:]})
            await asyncio.gather(*(rodar(x) for x in lista))

    try:
        asyncio.run(principal())
    except RuntimeError as e:
        db.set_cfg(PROGRESSO, {"rodando": False, "total": total, "feitos": 0, "falhas": 0, "inicio": int(inicio), "ultimos": [], "erro": str(e)})
        return {"ok": False, "erro": str(e)}
    finally:
        firewall.encerrar_token_teste()   # o token vale só para este lote
    cats: dict = {}
    for r in resultados:
        c = cats.setdefault(r["cat"], {"total": 0, "ok": 0})
        c["total"] += 1; c["ok"] += 1 if r["ok"] else 0
    res = {"em": int(time.time()), "duracao_s": round(time.time() - inicio, 1), "total": total, "ok": sum(1 for r in resultados if r["ok"]),
           "categorias": cats, "falhas": [r for r in resultados if not r["ok"]][:300], "resultados": resultados}
    db.set_cfg(RESULTADO, res)
    db.set_cfg(PROGRESSO, {"rodando": False, "total": total, "feitos": total, "falhas": total - res["ok"], "inicio": int(inicio), "ultimos": []})
    db.registrar("sistema", "Testes de segurança em lote", detalhe=f"{res['ok']}/{total} aprovados em {res['duracao_s']} s")
    return {"ok": True, "total": total}
