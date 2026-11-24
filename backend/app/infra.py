"""Infra (Vercel) operada pelo agente do escritório.

O token da Vercel tem escopo amplo e NÃO vai para a Vercel: fica só no .env do agente. O painel (na nuvem) pede
uma operação pela fila de comandos (tipo "infra"), o agente chama a API da Vercel e devolve o resultado.
Só operações desta lista, e só nos projetos do sistema (app e site).
"""
import datetime
import time

import httpx

from . import db

API = "https://api.vercel.com"
EQUIPE = "team_yGogpkWeAo5ExKwRr8HYYR4C"
NOMES = ("clima-casa", "clima-escritorio-site")
# limites do plano Hobby (o que a tela de uso da Vercel mostra)
LIMITES = {"requisicoes": 1_000_000, "invocacoes": 1_000_000, "transferencia_rapida": 100 * 1024 ** 3, "origem_rapida": 10 * 1024 ** 3,
           "gb_horas": 360, "build_min": 6000, "armazenamento_funcoes": 10 * 1024 ** 3, "armazenamento_deploy": 10 * 1024 ** 3}
_projetos: dict = {}


class ErroInfra(Exception):
    pass


def _token() -> str:
    t = db.ENV.get("VERCEL_TOKEN")
    if not t:
        raise ErroInfra("Este computador não tem o VERCEL_TOKEN no .env (copie o .env completo do Mac).")
    return t


def _req(metodo: str, caminho: str, params: dict | None = None, json=None):
    p = {"teamId": EQUIPE, **(params or {})}
    r = httpx.request(metodo, f"{API}{caminho}", params=p, json=json, headers={"Authorization": f"Bearer {_token()}"}, timeout=25)
    if r.status_code >= 400:
        try:
            msg = r.json().get("error", {}).get("message")
        except ValueError:
            msg = None
        raise ErroInfra(f"Vercel respondeu {r.status_code}: {msg or r.text[:160]}")
    return r.json() if r.content else {}


def projetos() -> dict:
    """{nome: projeto} só dos projetos do sistema (cache de 10 min)."""
    if _projetos.get("em", 0) > time.time() - 600:
        return _projetos["dados"]
    lista = _req("GET", "/v9/projects", {"limit": 100}).get("projects", [])
    dados = {p["name"]: p for p in lista if p["name"] in NOMES}
    _projetos.update({"em": time.time(), "dados": dados})
    return dados


def _pid(projeto: str) -> str:
    p = projetos()
    if projeto in p:
        return p[projeto]["id"]
    for x in p.values():
        if x["id"] == projeto:
            return x["id"]
    raise ErroInfra("Projeto fora do sistema.")


def _da_publicacao(pid: str, dep_id: str) -> dict:
    d = _req("GET", f"/v13/deployments/{dep_id}")
    if d.get("projectId") != pid:
        raise ErroInfra("Essa publicação não é deste projeto.")
    return d


def _resumir_dep(d: dict, producao_id: str | None) -> dict:
    criado = d.get("created") or d.get("createdAt")
    pronto = d.get("ready")
    return {"id": d.get("uid") or d.get("id"), "url": d.get("url"), "estado": d.get("state") or d.get("readyState"), "alvo": d.get("target"),
            "criado": criado, "pronto": pronto, "duracao_s": round((pronto - (d.get("buildingAt") or criado)) / 1000) if pronto and criado else None,
            "criador": (d.get("creator") or {}).get("username"), "origem": (d.get("meta") or {}).get("githubCommitMessage") or d.get("source"),
            "atual": (d.get("uid") or d.get("id")) == producao_id}


def _producao(pid: str) -> str | None:
    p = _req("GET", f"/v9/projects/{pid}")
    alvo = (p.get("targets") or {}).get("production") or {}
    return alvo.get("id")


def op_resumo(_a):
    equipe = _req("GET", f"/v2/teams/{EQUIPE}")
    out = []
    for nome, p in projetos().items():
        pid = p["id"]
        det = _req("GET", f"/v9/projects/{pid}")
        deps = _req("GET", "/v6/deployments", {"projectId": pid, "limit": 100}).get("deployments", [])
        dominios = _req("GET", f"/v9/projects/{pid}/domains").get("domains", [])
        prod = (det.get("targets") or {}).get("production") or {}
        out.append({
            "nome": nome, "id": pid, "framework": det.get("framework"), "node": det.get("nodeVersion"),
            "regiao": ", ".join(det.get("serverlessFunctionRegion") and [det["serverlessFunctionRegion"]] or []),
            "retencao": det.get("deploymentExpiration"), "criado": det.get("createdAt"),
            "producao": prod and {"id": prod.get("id"), "url": prod.get("url"), "criado": prod.get("createdAt"), "estado": prod.get("readyState")},
            "publicacoes": len(deps), "com_erro": sum(1 for d in deps if d.get("state") == "ERROR"),
            "mais_antiga": min((d["created"] for d in deps), default=None),
            "dominios": [{"nome": d["name"], "verificado": d.get("verified"), "redireciona": d.get("redirect")} for d in dominios],
            "ataque": (det.get("security") or {}).get("attackModeEnabled", False),
        })
    return {"equipe": {"nome": equipe.get("name"), "slug": equipe.get("slug"), "plano": (equipe.get("billing") or {}).get("plan", "hobby")},
            "projetos": out, "limites": LIMITES, "lido_em": int(time.time())}


def op_uso(a):
    dias = max(1, min(int(a.get("dias", 30)), 31))
    fim = datetime.datetime.now(datetime.UTC)
    ini = fim - datetime.timedelta(days=dias)
    f = lambda t: t.strftime("%Y-%m-%dT%H:%M:%S.000Z")  # noqa: E731
    req = _req("GET", "/v2/usage", {"type": "requests", "from": f(ini), "to": f(fim)}).get("data", [])
    bld = _req("GET", "/v2/usage", {"type": "builds", "from": f(ini), "to": f(fim)}).get("data", [])
    porbuild = {b["date"][:10]: b for b in bld}
    serie, proj = [], {}
    for r in req:
        dia = r["date"][:10]
        b = porbuild.get(dia, {})
        serie.append({"dia": dia, "requisicoes": r.get("request_hit_count", 0) + r.get("request_miss_count", 0), "cache": r.get("request_hit_count", 0),
                      "invocacoes": r.get("function_invocation_successful_count", 0) + r.get("function_invocation_error_count", 0),
                      "erros": r.get("function_invocation_error_count", 0) + r.get("function_invocation_timeout_count", 0),
                      "saida": r.get("bandwidth_outgoing_bytes", 0), "entrada": r.get("bandwidth_incoming_bytes", 0),
                      "gb_horas": round(r.get("function_execution_successful_gb_hours", 0) + r.get("function_execution_error_gb_hours", 0) + r.get("function_execution_timeout_gb_hours", 0), 4),
                      "builds": b.get("build_completed_count", 0), "builds_falhos": b.get("build_failed_count", 0), "build_s": b.get("build_build_seconds", 0)})
        for item in (r.get("breakdown") or {}).get("requests", []):
            proj.setdefault(item["name"], []).append(item.get("percent", 0) * (r.get("request_hit_count", 0) + r.get("request_miss_count", 0)) / 100)
    tot = {k: sum(s[k] for s in serie) for k in ("requisicoes", "cache", "invocacoes", "erros", "saida", "entrada", "gb_horas", "builds", "builds_falhos", "build_s")}
    soma = sum(sum(v) for v in proj.values()) or 1
    por_projeto = sorted(({"nome": k, "requisicoes": round(sum(v)), "pct": round(sum(v) / soma * 100, 1)} for k, v in proj.items()), key=lambda x: -x["requisicoes"])
    return {"dias": dias, "serie": serie, "total": tot, "por_projeto": por_projeto, "limites": LIMITES}


def op_publicacoes(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    prod = _producao(pid)
    deps = _req("GET", "/v6/deployments", {"projectId": pid, "limit": min(int(a.get("limite", 50)), 100)}).get("deployments", [])
    return {"producao": prod, "itens": [_resumir_dep(d, prod) for d in deps]}


def op_eventos(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    _da_publicacao(pid, a["id"])
    ev = _req("GET", f"/v3/deployments/{a['id']}/events", {"direction": "backward", "limit": 300, "builds": 1})
    linhas = []
    for e in (ev if isinstance(ev, list) else ev.get("events", [])):
        txt = (e.get("payload") or {}).get("text") or e.get("text")
        if txt:
            linhas.append({"t": e.get("created") or (e.get("payload") or {}).get("date"), "tipo": e.get("type"), "texto": txt[:400]})
    return {"linhas": sorted(linhas, key=lambda x: x["t"] or 0)[-300:]}


def op_promover(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    d = _da_publicacao(pid, a["id"])
    if d.get("readyState") != "READY":
        raise ErroInfra("Só dá para colocar no ar uma publicação pronta (READY).")
    _req("POST", f"/v10/projects/{pid}/promote/{a['id']}")
    db.registrar("sistema", "Infra: publicação colocada no ar", detalhe=f"{a.get('projeto')} · {d.get('url')}")
    return {"ok": True}


def op_republicar(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    d = _da_publicacao(pid, a["id"])
    novo = _req("POST", "/v13/deployments", {"forceNew": 1}, json={"name": d.get("name"), "deploymentId": a["id"], "target": "production", "project": pid})
    db.registrar("sistema", "Infra: republicação iniciada", detalhe=f"{a.get('projeto')} · a partir de {d.get('url')}")
    return {"ok": True, "id": novo.get("id"), "url": novo.get("url")}


def op_cancelar(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    _da_publicacao(pid, a["id"])
    _req("PATCH", f"/v12/deployments/{a['id']}/cancel")
    db.registrar("sistema", "Infra: publicação cancelada", detalhe=a["id"])
    return {"ok": True}


def op_apagar(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    if a["id"] == _producao(pid):
        raise ErroInfra("Essa é a publicação que está no ar; ponha outra no ar antes de apagar.")
    d = _da_publicacao(pid, a["id"])
    _req("DELETE", f"/v13/deployments/{a['id']}")
    db.registrar("sistema", "Infra: publicação apagada", detalhe=f"{a.get('projeto')} · {d.get('url')}")
    return {"ok": True}


def op_limpar(a):
    """Apaga as publicações antigas, mantendo as N mais novas e sempre a que está no ar."""
    pid = _pid(a.get("projeto", "clima-casa"))
    manter = max(3, min(int(a.get("manter", 10)), 100))
    prod = _producao(pid)
    deps = sorted(_req("GET", "/v6/deployments", {"projectId": pid, "limit": 100}).get("deployments", []), key=lambda d: -d["created"])
    apagar = [d for d in deps[manter:] if d["uid"] != prod and d.get("state") in ("READY", "ERROR", "CANCELED")]
    if a.get("simular"):
        return {"apagaria": len(apagar), "manteria": len(deps) - len(apagar)}
    ok, inicio = 0, time.time()
    for d in apagar:
        if time.time() - inicio > 45:   # cabe no tempo da função da nuvem; o resto sai na próxima limpeza
            break
        try:
            _req("DELETE", f"/v13/deployments/{d['uid']}"); ok += 1
        except ErroInfra:
            pass
    db.registrar("sistema", "Infra: publicações antigas apagadas", detalhe=f"{a.get('projeto')} · {ok} apagada(s), mantidas as {manter} mais novas")
    return {"apagadas": ok, "mantidas": len(deps) - ok, "faltam": len(apagar) - ok}


def op_retencao(a):
    # Desde nov/2026 a Vercel recusa deploymentExpiration no PATCH do projeto (400 "additional property"): a regra só muda no
    # painel (Settings → Build and Deployment → Deployment Retention Policy). Fica a mensagem clara em vez de um 400 cru.
    raise ErroInfra("A Vercel não muda mais a retenção pela API. Abra o projeto na Vercel → Settings → Build and Deployment → Deployment Retention Policy.")


def op_env(a):
    pid = _pid(a.get("projeto", "clima-casa"))
    envs = _req("GET", f"/v9/projects/{pid}/env").get("envs", [])
    # só nomes e onde valem: valores nunca saem daqui
    return {"itens": sorted(({"nome": e["key"], "alvos": e.get("target") or [], "tipo": e.get("type"), "atualizado": e.get("updatedAt")} for e in envs), key=lambda x: x["nome"])}


def op_dominios(_a):
    """Domínios de cada projeto como na aba Domains da Vercel: verificação, redirecionamento, como o DNS está apontado
    (A/CNAME), conflitos e os endereços que a publicação em produção atende (aliases)."""
    from .cloudflare import _paralelo
    out = []
    for nome, p in projetos().items():
        pid = p["id"]
        doms = _req("GET", f"/v9/projects/{pid}/domains").get("domains", [])
        prod = _producao(pid)
        tarefas = {d["name"]: (lambda n=d["name"]: _req("GET", f"/v6/domains/{n}/config")) for d in doms}
        if prod:
            tarefas["__aliases"] = lambda: _req("GET", f"/v2/deployments/{prod}/aliases").get("aliases", [])
        res = _paralelo(tarefas)
        itens = []
        for d in doms:
            c = res.get(d["name"])
            c = {} if isinstance(c, Exception) else (c or {})
            itens.append({"nome": d["name"], "verificado": d.get("verified"), "redireciona": d.get("redirect"), "codigo_redirecionamento": d.get("redirectStatusCode"),
                          "ramo": d.get("gitBranch"), "criado": d.get("createdAt"), "configurado_por": c.get("configuredBy"), "mal_configurado": c.get("misconfigured"),
                          "conflitos": c.get("conflicts") or [], "valores_a": c.get("aValues") or [], "cnames": c.get("cnames") or [],
                          "nameservers": c.get("nameservers") or [], "servico": c.get("serviceType")})
        al = res.get("__aliases")
        out.append({"projeto": nome, "dominios": itens, "aliases": [] if isinstance(al, Exception) or not al else [{"alias": x.get("alias"), "criado": x.get("created")} for x in al]})
    return {"projetos": out, "lido_em": int(time.time())}


def op_supabase_uso(_a):
    """Uso real do projeto no Supabase (só no agente: o token da Management API fica no .env daqui).
    Tamanho do banco, tamanho de cada bucket e pedidos por hora de cada serviço nas últimas 24 h. O Egress em GB não sai
    pela API com este token (é da organização): a tela leva ao número oficial."""
    import datetime
    from . import db as _db
    env = _db.ENV
    tk, ref = env.get("SUPABASE_ACCESS_TOKEN", ""), env.get("SUPABASE_URL", "").split("//")[-1].split(".")[0]
    cab = {"apikey": env["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}"}
    url = env["SUPABASE_URL"]
    banco = _db.um("SELECT pg_database_size(current_database()) AS b")["b"]
    buckets = []
    from . import backup_sistema as bs
    for b in httpx.get(f"{url}/storage/v1/bucket", headers=cab, timeout=15).json():
        objs = bs._listar_tudo(b["id"])
        buckets.append({"bucket": b["id"], "arquivos": len(objs), "bytes": sum(o["tamanho"] for o in objs), "publico": b.get("public")})
    pedidos, erro = [], ""
    if tk:
        fim = datetime.datetime.now(datetime.timezone.utc)
        r = httpx.get(f"https://api.supabase.com/v1/projects/{ref}/analytics/endpoints/usage.api-counts", headers={"Authorization": f"Bearer {tk}"},
                      params={"interval": "1day"}, timeout=20)
        if r.status_code == 200:
            pedidos = [{"hora": x["timestamp"], "auth": x.get("total_auth_requests", 0), "rest": x.get("total_rest_requests", 0),
                        "storage": x.get("total_storage_requests", 0), "realtime": x.get("total_realtime_requests", 0)} for x in r.json().get("result", [])]
        else:
            erro = f"pedidos por hora indisponíveis ({r.status_code})"
        _ = fim
    else:
        erro = "sem SUPABASE_ACCESS_TOKEN no agente"
    usuarios = _db.um("SELECT count(*) AS n FROM auth.users")["n"]
    return {"ref": ref, "banco_bytes": banco, "buckets": sorted(buckets, key=lambda x: -x["bytes"]), "pedidos": pedidos, "usuarios_auth": usuarios,
            "cotas": {"banco": 500 * 1024 ** 2, "storage": 1024 ** 3, "egress": 5 * 1024 ** 3, "mau": 50000}, "erro": erro, "lido_em": int(time.time())}


def op_portas(_a):
    """Do computador do agente: alcança cada serviço de que o sistema depende? (TCP, com o tempo). É o teste que a TI
    precisa ver quando a rede é de órgão público: banco 6543, HTTPS e cada transmissor na porta 6668."""
    import socket
    from concurrent.futures import ThreadPoolExecutor
    from . import db as _db
    env = _db.ENV
    ref = env.get("SUPABASE_URL", "").split("//")[-1].split("/")[0]
    alvos = [("Banco de dados (Supabase, porta 6543)", env.get("SUPABASE_DB_HOST") or "aws-1-us-east-2.pooler.supabase.com", int(env.get("SUPABASE_DB_PORT") or 6543), "nuvem"),
             ("Painel (app.zynio.com.br)", "app.zynio.com.br", 443, "nuvem"), ("Supabase (login e arquivos)", ref, 443, "nuvem"),
             ("Alexa e Google (Sinric Pro)", "ws.sinric.pro", 443, "nuvem"), ("Nuvem Tuya (Smart Life)", "openapi.tuyaus.com", 443, "nuvem"),
             ("E-mails (Resend)", "api.resend.com", 443, "nuvem"), ("DNS da Cloudflare", "1.1.1.1", 53, "nuvem")]
    for h in _db.consultar("SELECT nome, ip FROM hubs WHERE ip IS NOT NULL AND ip <> ''"):
        alvos.append((f"Transmissor {h['nome']}", h["ip"], 6668, "local"))

    def testar(a):
        nome, host, porta, tipo = a
        t0 = time.time()
        try:
            socket.create_connection((host, porta), timeout=4).close()
            return {"nome": nome, "host": host, "porta": porta, "tipo": tipo, "ok": True, "ms": round((time.time() - t0) * 1000)}
        except OSError as e:
            return {"nome": nome, "host": host, "porta": porta, "tipo": tipo, "ok": False, "erro": type(e).__name__}
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(testar, alvos))
    return {"resultados": res, "maquina": socket.gethostname().split(".")[0], "lido_em": int(time.time())}


OPS = {"resumo": op_resumo, "uso": op_uso, "publicacoes": op_publicacoes, "eventos": op_eventos, "promover": op_promover, "republicar": op_republicar,
       "cancelar": op_cancelar, "apagar": op_apagar, "limpar": op_limpar, "retencao": op_retencao, "env": op_env, "dominios": op_dominios, "supabase_uso": op_supabase_uso, "portas": op_portas}
ALTERAM = {"promover", "republicar", "cancelar", "apagar", "limpar", "retencao", "agente_convite"}


def op_agente_convite(a):
    """Código de instalação de outro computador: só o agente tem o .env para cifrar (convite.py)."""
    from . import convite
    try:
        return convite.criar(a.get("criado_por", ""))
    except RuntimeError as e:
        raise ErroInfra(str(e)) from e


OPS["agente_convite"] = op_agente_convite


def op_rede_teste(a):   # teste de velocidade da internet do escritório + tempo de resposta dos transmissores (rede.py)
    from . import rede
    return rede.testar_agente(a)


OPS["rede_teste"] = op_rede_teste


def op_seguranca_testes(a):   # lote de testes de segurança ao vivo (testes_seguranca.py); demora 1 a 3 min
    from . import testes_seguranca
    return testes_seguranca.executar(a)


OPS["seguranca_testes"] = op_seguranca_testes


def op_rede_diagnostico(a):
    from . import rede
    return rede.diagnostico(a)


OPS["rede_diagnostico"] = op_rede_diagnostico


def executar(op: str, args: dict):
    if op.startswith("cf_"):           # Cloudflare (cloudflare.py): mesmo caminho, token próprio no .env do agente
        from . import cloudflare
        if op not in cloudflare.OPS:
            raise ErroInfra("Operação desconhecida.")
        try:
            return cloudflare.OPS[op](args or {})
        except cloudflare.ErroCF as e:
            raise ErroInfra(str(e)) from e
    if op not in OPS:
        raise ErroInfra("Operação desconhecida.")
    return OPS[op](args or {})


_GH_MEMORIA = {"t": ""}   # o token do `gh` fica só na memória deste processo (o chaveiro do Mac tranca com a tela bloqueada)


def _token_github() -> str:
    """Token do GitHub SÓ no agente: GITHUB_APPS_TOKEN do .env (de preferência só leitura) ou o `gh` já logado neste
    computador (lido na hora, nunca gravado em arquivo nem no banco). Depois da 1ª leitura bem-sucedida, o do `gh` fica
    em memória: com o Mac bloqueado ou dormindo o `gh auth token` falha e o download dos apps quebrava (23/11/2026)."""
    import os
    import shutil
    import subprocess
    t = (db.carregar_env().get("GITHUB_APPS_TOKEN") or os.environ.get("GITHUB_APPS_TOKEN") or "").strip()
    if t:
        return t
    gh = shutil.which("gh") or next((c for c in ("/opt/homebrew/bin/gh", "/usr/local/bin/gh") if os.path.exists(c)), None)
    if gh:
        try:
            r = subprocess.run([gh, "auth", "token"], capture_output=True, text=True, timeout=10)
            if r.returncode == 0 and r.stdout.strip():
                _GH_MEMORIA["t"] = r.stdout.strip()
                return _GH_MEMORIA["t"]
        except Exception:  # noqa: BLE001
            pass
    if _GH_MEMORIA["t"]:   # o `gh` falhou agora (chaveiro trancado), mas já tinha dado certo neste processo
        return _GH_MEMORIA["t"]
    raise ErroInfra("Este computador não tem acesso ao GitHub (sem GITHUB_APPS_TOKEN e sem o gh logado).")


def op_app_link(a):
    """Link temporário (minutos) do instalador do último release do repositório privado. Só o link sai do agente."""
    import httpx
    repo, arquivo = "estevam5s/clima-casa", str(a.get("arquivo") or "")
    if not arquivo or "/" in arquivo:
        raise ErroInfra("Arquivo inválido.")
    h = {"Authorization": f"Bearer {_token_github()}", "X-GitHub-Api-Version": "2022-11-28"}
    rel = httpx.get(f"https://api.github.com/repos/{repo}/releases/latest", headers={**h, "Accept": "application/vnd.github+json"}, timeout=15)
    if rel.status_code != 200:
        raise ErroInfra(f"O GitHub recusou o acesso ({rel.status_code}).")
    ativo = next((x for x in rel.json().get("assets", []) if x.get("name") == arquivo), None)
    if not ativo:
        raise ErroInfra("Este arquivo não está no último release.")
    r = httpx.get(f"https://api.github.com/repos/{repo}/releases/assets/{ativo['id']}", headers={**h, "Accept": "application/octet-stream"},
                  timeout=15, follow_redirects=False)
    if r.status_code not in (301, 302, 307) or not r.headers.get("location"):
        raise ErroInfra(f"O GitHub não liberou o arquivo ({r.status_code}).")
    return {"url": r.headers["location"], "versao": rel.json().get("tag_name"), "tamanho": ativo.get("size")}


OPS["app_link"] = op_app_link

