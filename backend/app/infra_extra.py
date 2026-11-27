"""Infra (0.7.8): Monitor da API, Integrações ao vivo e Limites e cotas.

- monitor(horas): latência (p50/p95) e taxa de erro da API do próprio sistema por hora, rotas mais lentas e mais chamadas,
  a partir das medições reais que o painel manda (analise_eventos, tipo "api", amostra de 1 em 5 e todas as falhas).
- integracoes(): testa agora cada serviço que o sistema usa com as SUAS chaves (banco, Auth, Storage, NVIDIA, Resend,
  Telegram, Sinric, Spotify, Smart Life, Open-Meteo). Devolve só situação e tempo: nenhuma chave sai daqui.
- limites(): uso perto do teto de cada plano (banco 500 MB, Storage 1 GB, e-mails do mês, aparelhos da Alexa, IA).
Tudo roda na nuvem (não precisa do agente).
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor

import httpx

from . import db


def _p(valores: list[float], q: float):
    if not valores:
        return None
    v = sorted(valores)
    return round(v[min(len(v) - 1, int(q * (len(v) - 1)))])


def monitor(horas: int = 24) -> dict:
    horas = max(1, min(horas, 24 * 14))
    desde = db.agora() - horas * 3600
    linhas = db.consultar("SELECT quando, rota, valor, (dados->>'status')::int AS status FROM analise_eventos WHERE tipo = 'api' AND quando > ? ORDER BY quando", (desde,))
    passo = 3600 if horas <= 48 else 6 * 3600
    blocos: dict[int, dict] = {}
    rotas: dict[str, dict] = {}
    codigos: dict[str, int] = {}
    for r in linhas:
        b = blocos.setdefault(int(r["quando"] // passo * passo), {"ms": [], "erros": 0, "total": 0})
        b["total"] += 1
        if r["valor"] is not None:
            b["ms"].append(float(r["valor"]))
        st = r["status"] or 0
        if st >= 500 or st == 0:
            b["erros"] += 1
        codigos[f"{st // 100}xx" if st else "sem resposta"] = codigos.get(f"{st // 100}xx" if st else "sem resposta", 0) + 1
        x = rotas.setdefault(r["rota"] or "?", {"rota": r["rota"] or "?", "ms": [], "erros": 0})
        if r["valor"] is not None:
            x["ms"].append(float(r["valor"]))
        if st >= 500 or st == 0:
            x["erros"] += 1
    serie = [{"quando": k, "p50": _p(v["ms"], 0.5), "p95": _p(v["ms"], 0.95), "chamadas": v["total"], "erros": v["erros"],
              "erro_pct": round(v["erros"] / v["total"] * 100, 1) if v["total"] else 0} for k, v in sorted(blocos.items())]
    todas = [float(r["valor"]) for r in linhas if r["valor"] is not None]
    lista = [{"rota": x["rota"], "chamadas": len(x["ms"]), "p50": _p(x["ms"], 0.5), "p95": _p(x["ms"], 0.95), "erros": x["erros"]} for x in rotas.values()]
    t0 = time.time()
    db.um("SELECT 1 AS ok")
    return {"horas": horas, "amostras": len(linhas), "p50": _p(todas, 0.5), "p95": _p(todas, 0.95), "p99": _p(todas, 0.99),
            "erro_pct": round(sum(1 for r in linhas if (r["status"] or 0) >= 500 or not r["status"]) / len(linhas) * 100, 2) if linhas else 0,
            "serie": serie, "codigos": codigos, "banco_ms": round((time.time() - t0) * 1000),
            "lentas": sorted([x for x in lista if x["chamadas"] >= 3], key=lambda x: -(x["p95"] or 0))[:10],
            "mais_chamadas": sorted(lista, key=lambda x: -x["chamadas"])[:10]}


# ---------------- integrações ao vivo ----------------
def _medir(nome, fn):
    t0 = time.time()
    try:
        estado, detalhe = fn()
    except Exception as e:  # noqa: BLE001
        estado, detalhe = "falhou", str(e)[:160]
    return {"servico": nome, "estado": estado, "detalhe": detalhe, "ms": round((time.time() - t0) * 1000)}


def integracoes() -> list[dict]:
    env = db.ENV
    url, sec = env.get("SUPABASE_URL", ""), env.get("SUPABASE_SECRET_KEY", "")

    def banco():
        db.um("SELECT 1 AS ok")
        return "ok", "Postgres (pooler 6543, TLS verificado)"

    def auth():
        r = httpx.get(f"{url}/auth/v1/health", headers={"apikey": env.get("SUPABASE_PUBLISHABLE_KEY", "")}, timeout=8)
        return ("ok" if r.status_code == 200 else "falhou"), f"Auth respondeu {r.status_code}"

    def storage():
        r = httpx.get(f"{url}/storage/v1/bucket", headers={"apikey": sec, "Authorization": f"Bearer {sec}"}, timeout=8)
        return ("ok", f"{len(r.json())} bucket(s)") if r.status_code == 200 else ("falhou", f"Storage respondeu {r.status_code}")

    def nvidia():
        from . import ia
        k = ia.chave()
        if not k:
            return "sem_config", "Sem chave (IA → Configuração)"
        r = httpx.get("https://integrate.api.nvidia.com/v1/models", headers={"Authorization": f"Bearer {k}"}, timeout=10)
        return ("ok", f"{len((r.json() or {}).get('data') or [])} modelos disponíveis") if r.status_code == 200 else ("falhou", f"NVIDIA respondeu {r.status_code}")

    def resend():
        from . import correio
        c = correio.cfg()
        if not c.get("api_key"):
            return "sem_config", "Sem chave (E-mails → Conexões)"
        r = httpx.get("https://api.resend.com/domains", headers={"Authorization": f"Bearer {c['api_key']}"}, timeout=10)
        if r.status_code == 200:
            return "ok", "Chave válida"
        if r.status_code == 401 and "restricted" in r.text:
            return "ok", "Chave válida (só envio, como deve ser)"
        return "falhou", f"Resend respondeu {r.status_code}"

    def telegram():
        from . import telegram as tg
        c = tg.cfg()
        if not c.get("token"):
            return "sem_config", "Bot não configurado"
        r = tg.chamar("getMe")   # devolve o "result" (levanta erro se o Telegram recusar)
        return "ok", f"@{(r or {}).get('username', '?')} · {len(c.get('vinculos') or {})} conversa(s) ligada(s)"

    def sinric():
        c = db.cfg("sinric") or {}
        if not c.get("app_key"):
            return "sem_config", "Sem credenciais (Alexa e Google)"
        st = db.cfg("sinric_status") or {}
        on = st.get("conectado")
        return ("ok" if on else "atencao"), ("Conectado pelo agente" if on else f"Desconectado{(': ' + str(st.get('erro'))[:80]) if st.get('erro') else ''} (só o agente conecta)")

    def spotify():
        c = db.cfg("spotify") or {}
        if not c.get("client_id"):
            return "sem_config", "App do Spotify não cadastrado"
        return ("ok", "Conta conectada") if c.get("refresh_token") else ("atencao", "App cadastrado, conta não conectada")

    def tuya():
        c = db.cfg("tuya_conta") or {}
        return ("ok", "Conta Smart Life conectada") if c else ("sem_config", "Conta Smart Life não conectada")

    def tempo():
        r = httpx.get("https://api.open-meteo.com/v1/forecast", params={"latitude": -27.6, "longitude": -48.5, "current": "temperature_2m"}, timeout=8)
        return ("ok", f"{(r.json().get('current') or {}).get('temperature_2m')} °C em Florianópolis") if r.status_code == 200 else ("falhou", f"Open-Meteo {r.status_code}")

    testes = [("Banco (Supabase)", banco), ("Login (Supabase Auth)", auth), ("Arquivos (Supabase Storage)", storage), ("IA (NVIDIA)", nvidia),
              ("E-mail (Resend)", resend), ("Bot do Telegram", telegram), ("Alexa e Google (Sinric Pro)", sinric), ("Música (Spotify)", spotify),
              ("Smart Life (Tuya)", tuya), ("Previsão do tempo (Open-Meteo)", tempo)]
    with ThreadPoolExecutor(6) as ex:
        return list(ex.map(lambda t: _medir(*t), testes))


# ---------------- limites e cotas ----------------
def limites() -> list[dict]:
    itens = []

    def add(nome, usado, limite, unidade, dica, fonte):
        itens.append({"nome": nome, "usado": usado, "limite": limite, "unidade": unidade, "pct": round(usado / limite * 100, 1) if limite else None, "dica": dica, "fonte": fonte})

    tam = (db.um("SELECT pg_database_size(current_database()) AS b") or {}).get("b") or 0
    add("Banco de dados", round(tam / 1048576, 1), 500, "MB", "Plano grátis do Supabase. Acima, o banco fica só leitura.", "Supabase")
    try:
        st = db.consultar("SELECT bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) AS b, count(*) AS n FROM storage.objects GROUP BY bucket_id")
        total = sum(int(r["b"] or 0) for r in st)
        add("Arquivos (Storage)", round(total / 1048576, 1), 1024, "MB", ", ".join(f"{r['bucket_id']} {int(r['b'] or 0) / 1048576:.0f} MB" for r in sorted(st, key=lambda r: -(r["b"] or 0))[:4]), "Supabase")
    except Exception:  # noqa: BLE001
        pass
    inicio_mes = int(time.mktime(time.strptime(time.strftime("%Y-%m-01"), "%Y-%m-%d")))
    env = (db.um("SELECT count(*) AS n FROM email_envios WHERE criado_em >= ?", (inicio_mes,)) or {}).get("n") or 0
    add("E-mails no mês", env, 3000, "e-mails", "Plano grátis do Resend (100 por dia também).", "Resend")
    sin = db.cfg("sinric") or {}
    lim = int(sin.get("limite_aparelhos") or 3)
    usados = (db.um("SELECT count(*) AS n FROM aparelhos WHERE alexa = 1") or {}).get("n") or 0
    add("Aparelhos na Alexa", usados, lim, "aparelhos", "Plano do Sinric Pro comprado (cada zona conta como um).", "Sinric Pro")
    try:
        from . import ia_uso
        pess = ia_uso.por_pessoa()
        tokens = sum(int(p.get("semana") or p.get("tokens_semana") or 0) for p in pess)
        if tokens:
            add("IA na semana (tokens, todas as pessoas)", tokens, None, "tokens", "Sem teto pago: os limites por pessoa ficam em IA → Uso.", "NVIDIA")
    except Exception:  # noqa: BLE001
        pass
    linhas = (db.um("SELECT sum(reltuples)::bigint AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'") or {}).get("n") or 0
    add("Linhas no banco (estimativa)", int(linhas), None, "linhas", "Informativo: atividade e eventos crescem e são limpos pelas rotinas do banco.", "Supabase")
    return itens
