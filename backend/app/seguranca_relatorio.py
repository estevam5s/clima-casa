"""Dados da tela /seguranca (resumo, mapa, linha do tempo) e o relatório de segurança exportável."""
import datetime
import ipaddress
import os
import re
import socket
from concurrent.futures import ThreadPoolExecutor, wait

from . import db

FUSO = datetime.timezone(datetime.timedelta(hours=-3))
# Onde a API roda: a Vercel informa a região da função em VERCEL_REGION. Destino dos arcos no mapa.
REGIOES = {"gru1": ("São Paulo", -23.55, -46.63), "cle1": ("Cleveland", 41.50, -81.69), "iad1": ("Washington", 38.90, -77.04),
           "sfo1": ("São Francisco", 37.77, -122.42), "pdx1": ("Portland", 45.52, -122.68), "fra1": ("Frankfurt", 50.11, 8.68),
           "lhr1": ("Londres", 51.51, -0.13), "cdg1": ("Paris", 48.86, 2.35), "dub1": ("Dublin", 53.35, -6.26), "arn1": ("Estocolmo", 59.33, 18.07),
           "hnd1": ("Tóquio", 35.68, 139.69), "icn1": ("Seul", 37.57, 126.98), "sin1": ("Singapura", 1.35, 103.82), "syd1": ("Sydney", -33.87, 151.21),
           "bom1": ("Mumbai", 19.08, 72.88), "hkg1": ("Hong Kong", 22.32, 114.17), "cpt1": ("Cidade do Cabo", -33.92, 18.42), "kix1": ("Osaka", 34.69, 135.50)}
_reg = os.environ.get("VERCEL_REGION", "")
if _reg in REGIOES:
    SERVIDOR = {"nome": f"Vercel · {REGIOES[_reg][0]}", "lat": REGIOES[_reg][1], "lon": REGIOES[_reg][2]}
else:  # agente no Mac (escritório, Grande Florianópolis)
    SERVIDOR = {"nome": "agente do escritório", "lat": -27.69, "lon": -48.78}
# Ataque de verdade: alguém tentou entrar, adulterar ou varrer. Visita sem login e robô de pré-visualização não entram aqui.
ATAQUES = ("scanner", "rate_limit", "token_invalido", "login_falhou", "login_negado", "pais_bloqueado", "ip_bloqueado_auto", "bot_bloqueado",
           "isca", "robo_ia", "spraying", "prompt_injection", "injecao_sqli", "injecao_nosql", "injecao_comando", "injecao_ssti", "injecao_xxe",
           "injecao_log4shell", "injecao_prototype", "injecao_travessia", "telegram_negado", "telegram_flood", "telegram_pin", "telegram_identidade",
           "telegram_webhook_negado")
ROTULOS = {"acesso": "Acesso", "login_ok": "Login aceito", "login_falhou": "Senha errada", "login_negado": "Conta sem permissão",
           "auth_negado": "Sem permissão (logado)", "token_invalido": "Token falso ou adulterado", "sem_login": "Abriu sem login",
           "scanner": "Ferramenta de ataque", "rate_limit": "Excesso de requisições", "bot_bloqueado": "Robô barrado (Turnstile)",
           "esqueci_senha": "Pediu nova senha", "consentimento": "Escolheu cookies no site", "site_contato": "Formulário do site", "pais_bloqueado": "País bloqueado", "ip_bloqueado_auto": "IP bloqueado",
           "isca": "Caiu na isca (robô)", "robo_ia": "Robô de IA barrado", "spraying": "Senha testada em várias contas", "prompt_injection": "Tentou mudar as regras da IA",
           "injecao_sqli": "SQL injection", "injecao_nosql": "NoSQL injection", "injecao_comando": "Injeção de comando", "injecao_ssti": "Injeção de template (SSTI)",
           "injecao_xxe": "XXE", "injecao_log4shell": "Log4Shell", "injecao_prototype": "Prototype pollution", "injecao_travessia": "Travessia de pasta",
           "sem_agente": "Sem User-Agent", "telegram_negado": "Telegram sem vínculo", "telegram_flood": "Flood no Telegram", "telegram_pin": "PIN do Telegram errado",
           "telegram_identidade": "Telegram com identidade diferente", "telegram_webhook_negado": "Webhook do Telegram falso"}
_PREVIA = re.compile(r"WhatsApp|facebookexternalhit|Facebot|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview|"
                     r"Googlebot|bingbot|Applebot|DuckDuckBot|YandexBot|Google-InspectionTool|vercel", re.I)
_AUTOMATICO = re.compile(r"HeadlessChrome|python-requests|python-httpx|curl/|Wget|Go-http-client|okhttp|axios|node-fetch|"
                         r"Scrapy|PhantomJS|Puppeteer|Playwright|bot|crawl|spider|scan", re.I)
_NUVENS = [("amazonaws.com", "AWS (Amazon)"), ("googleusercontent.com", "Google Cloud"), ("1e100.net", "Google"),
           ("cloudapp.net", "Microsoft Azure"), ("azure", "Microsoft Azure"), ("digitalocean", "DigitalOcean"), ("linode", "Akamai/Linode"),
           ("akamai", "Akamai"), ("ovh", "OVH"), ("your-server.de", "Hetzner"), ("hetzner", "Hetzner"), ("contabo", "Contabo"),
           ("vultr", "Vultr"), ("oraclecloud", "Oracle Cloud"), ("aliyun", "Alibaba Cloud"), ("tencent", "Tencent Cloud"),
           ("censys", "Censys (varredor)"), ("shodan", "Shodan (varredor)"), ("shadowserver", "Shadowserver (varredor)"),
           ("binaryedge", "BinaryEdge (varredor)"), ("internet-measurement", "Varredor de pesquisa"), ("stretchoid", "Stretchoid (varredor)")]
PAISES = {"BR": "Brasil", "US": "Estados Unidos", "PT": "Portugal", "AR": "Argentina", "DE": "Alemanha", "FR": "França",
          "GB": "Reino Unido", "NL": "Holanda", "IE": "Irlanda", "CN": "China", "RU": "Rússia", "IN": "Índia", "JP": "Japão",
          "SG": "Singapura", "CA": "Canadá", "MX": "México", "CL": "Chile", "CO": "Colômbia", "ES": "Espanha", "IT": "Itália",
          "KR": "Coreia do Sul", "HK": "Hong Kong", "UA": "Ucrânia", "VN": "Vietnã", "ID": "Indonésia", "TR": "Turquia"}


def _d(ts):
    return datetime.datetime.fromtimestamp(ts, FUSO)


def categoria(tipo: str) -> str:
    return "ataque" if tipo in ATAQUES else "login" if tipo == "login_ok" else "acesso"


def _privado(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private or ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return True


def _provedor(ptr: str) -> str:
    ptr = (ptr or "").lower()
    return next((nome for chave, nome in _NUVENS if chave in ptr), "")


def info_ips(ips: list[str], limite_novos: int = 30) -> dict:
    """Nome reverso (PTR) de cada IP, com cache no banco. Mostra se o IP é de servidor na nuvem (AWS, Google…)
    ou de varredor conhecido. Consulta no máximo `limite_novos` IPs novos por vez, com 2,5 s no total."""
    publicos = [i for i in dict.fromkeys(ips) if not _privado(i)]
    if not publicos:
        return {}
    cache = {r["ip"]: r for r in db.consultar("SELECT ip, ptr, provedor FROM seguranca_ip_info WHERE ip = ANY(?)", (publicos,))}
    faltam = [i for i in publicos if i not in cache][:limite_novos]
    if faltam:
        def rev(ip):
            try:
                return ip, socket.gethostbyaddr(ip)[0]
            except Exception:  # noqa: BLE001  (sem PTR é comum)
                return ip, ""
        ex = ThreadPoolExecutor(max_workers=12)
        futuros = [ex.submit(rev, ip) for ip in faltam]
        prontos, _ = wait(futuros, timeout=2.5)
        ex.shutdown(wait=False, cancel_futures=True)
        for f in prontos:
            ip, ptr = f.result()
            cache[ip] = {"ip": ip, "ptr": ptr[:200], "provedor": _provedor(ptr)}
            db.executar("INSERT INTO seguranca_ip_info (ip, ptr, provedor, consultado_em) VALUES (?,?,?,?) "
                        "ON CONFLICT (ip) DO UPDATE SET ptr = excluded.ptr, provedor = excluded.provedor, consultado_em = excluded.consultado_em",
                        (ip, ptr[:200], cache[ip]["provedor"], db.agora()))
    return cache


def veredito(i: dict) -> dict:
    """O que esse IP realmente fez: ataque, suspeito, robô inofensivo, visitante ou equipe."""
    t, n = i["tipos"], i["contagem"]
    agentes = " ".join(i["agentes"])
    if i["privado"]:
        return {"nivel": "confiavel", "rotulo": "Rede local", "motivo": "Acesso de dentro do escritório (o próprio agente ou um computador da rede)."}
    if i["logins"] or i.get("permitido"):
        return {"nivel": "confiavel", "rotulo": "Equipe", "motivo": "Esse IP já entrou com senha certa: é alguém do sistema."}
    if "scanner" in t:
        return {"nivel": "ataque", "rotulo": "Ataque real", "motivo": "Usou ferramenta de ataque ou varreu rotas que não existem (.env, wp-admin, SQL)."}
    if "token_invalido" in t:
        return {"nivel": "ataque", "rotulo": "Ataque real", "motivo": "Mandou um token de sessão falso ou adulterado."}
    if n.get("login_falhou", 0) >= 2 or "login_negado" in t:
        return {"nivel": "ataque", "rotulo": "Ataque real", "motivo": f"Tentou entrar com senha errada {n.get('login_falhou', 0)} vez(es)."}
    if "rate_limit" in t or "ip_bloqueado_auto" in t:
        return {"nivel": "ataque", "rotulo": "Ataque real", "motivo": "Mandou requisições demais e foi bloqueado sozinho."}
    if "bot_bloqueado" in t:
        return {"nivel": "ataque", "rotulo": "Robô barrado", "motivo": "Tentou login ou formulário e foi reprovado na verificação anti-robô."}
    if "pais_bloqueado" in t:
        return {"nivel": "ataque", "rotulo": "País bloqueado", "motivo": "Veio de um país fora da lista permitida."}
    if n.get("login_falhou"):
        return {"nivel": "suspeito", "rotulo": "Suspeito", "motivo": "Errou a senha uma vez. Pode ser alguém da equipe digitando errado."}
    if _PREVIA.search(agentes):
        return {"nivel": "robo", "rotulo": "Pré-visualização / buscador", "motivo": "Robô que monta a prévia do link (WhatsApp, redes sociais) ou indexa o site. Inofensivo."}
    versoes = [int(v) for v in re.findall(r"Chrome/(\d+)", agentes)]
    if versoes and max(versoes) < 100:
        return {"nivel": "robo", "rotulo": "Robô disfarçado", "motivo": f"Diz ser um Chrome {max(versoes)}, de anos atrás: é programa automático fingindo ser navegador. Só abriu a página."}
    if i.get("provedor") or _AUTOMATICO.search(agentes):
        onde = i.get("provedor") or "programa automatizado"
        return {"nivel": "robo", "rotulo": "Robô de nuvem", "motivo": f"Servidor automático ({onde}) que só abriu a página, sem tentar senha. Comum em antivírus de link e varreduras; não é invasão."}
    return {"nivel": "visitante", "rotulo": "Visitante", "motivo": "Abriu a página do sistema sem estar logado e não tentou nada."}


RISCO = {"ataque": 70, "suspeito": 30, "robo": 8, "visitante": 3, "confiavel": 0}


_CACHE_RESUMO: dict = {}   # dias -> (quando, resultado): a tela atualiza sozinha e cada leitura trazia ~1.300 eventos do banco


def resumo(dias: int) -> dict:
    """Mesmo resultado por 60 s para o mesmo período (várias abas e atualizações automáticas leem uma vez só)."""
    import copy
    import time as _t
    c = _CACHE_RESUMO.get(dias)
    if c and _t.time() - c[0] < 60:
        return copy.deepcopy(c[1])
    r = _resumo(dias)
    _CACHE_RESUMO[dias] = (_t.time(), r)
    return copy.deepcopy(r)


def _resumo(dias: int) -> dict:
    agora = db.agora()
    desde = agora - dias * 86400
    ev = db.consultar("SELECT id, quando, ip, tipo, rota, detalhe, pais, cidade, regiao, lat, lon, agente FROM seguranca_eventos "
                      "WHERE quando > ? ORDER BY quando DESC LIMIT 20000", (desde,))
    permitidos = {r["alvo"] for r in db.consultar("SELECT alvo FROM seguranca_ips WHERE tipo = 'permitido'")}
    bloqueados = db.consultar("SELECT * FROM seguranca_ips WHERE tipo = 'bloqueado' AND (expira_em IS NULL OR expira_em > ?) ORDER BY criado_em DESC", (agora,))
    bl = {b["alvo"] for b in bloqueados}

    # 1ª passada: o que cada IP fez → veredito
    ips = {}
    for e in ev:
        i = ips.setdefault(e["ip"], {"ip": e["ip"], "eventos": 0, "ataques": 0, "logins": 0, "pais": e["pais"], "cidade": e["cidade"],
                                     "primeiro": e["quando"], "ultimo": e["quando"], "tipos": set(), "contagem": {}, "agentes": set(),
                                     "privado": _privado(e["ip"])})
        i["eventos"] += 1; i["logins"] += e["tipo"] == "login_ok"
        i["primeiro"] = min(i["primeiro"], e["quando"]); i["tipos"].add(e["tipo"])
        i["contagem"][e["tipo"]] = i["contagem"].get(e["tipo"], 0) + 1
        if e["agente"]:
            i["agentes"].add(e["agente"][:200])
        i["pais"] = i["pais"] or e["pais"]; i["cidade"] = i["cidade"] or e["cidade"]
    ordem = sorted(ips.values(), key=lambda x: (-len(x["tipos"] & set(ATAQUES)), -x["eventos"]))
    try:
        info = info_ips([x["ip"] for x in ordem[:120]])
    except Exception:  # noqa: BLE001  (tabela ainda não criada ou DNS fora: segue sem o nome reverso)
        info = {}
    for i in ips.values():
        extra = info.get(i["ip"]) or {}
        i["ptr"], i["provedor"] = extra.get("ptr", ""), extra.get("provedor", "")
        i["permitido"] = i["ip"] in permitidos
        i["veredito"] = veredito(i)
    confiaveis = {k for k, v in ips.items() if v["veredito"]["nivel"] == "confiavel"}
    # regra rígida opcional: servidor de nuvem que não é da equipe fica bloqueado por 24 h
    try:
        from . import firewall
        if firewall.config().get("bloquear_nuvem"):
            ja = {b["alvo"] for b in db.consultar("SELECT alvo FROM seguranca_ips WHERE tipo = 'bloqueado' AND (expira_em IS NULL OR expira_em > ?)", (agora,))}
            for i in ips.values():
                if i["veredito"]["nivel"] == "robo" and i.get("provedor") and i["ip"] not in ja and not i["privado"]:
                    firewall.bloquear(i["ip"], f"servidor de nuvem sem login ({i['provedor']})", 1440)
    except Exception:  # noqa: BLE001
        pass

    # 2ª passada: agregados (ataque só conta vindo de IP que não é da equipe)
    por_tipo, por_dia, por_hora, paises, rotas, agentes, pontos = {}, {}, [0] * 24, {}, {}, {}, {}
    def cat_de(e):
        c = categoria(e["tipo"])
        if c == "ataque" and e["ip"] in confiaveis:
            return "acesso"
        if c == "acesso" and ips[e["ip"]]["veredito"]["nivel"] == "robo":
            return "robo"
        return c
    for e in ev:
        cat = cat_de(e)
        e["categoria"] = cat
        por_tipo[e["tipo"]] = por_tipo.get(e["tipo"], 0) + 1
        d = _d(e["quando"])
        dia = por_dia.setdefault(d.strftime("%Y-%m-%d"), {"dia": d.strftime("%Y-%m-%d"), "acesso": 0, "login": 0, "robo": 0, "ataque": 0})
        dia[cat] += 1
        por_hora[d.hour] += 1
        ips[e["ip"]]["ataques"] += cat == "ataque"
        if e["pais"]:
            p = paises.setdefault(e["pais"], {"pais": e["pais"], "nome": PAISES.get(e["pais"], e["pais"]), "eventos": 0, "ataques": 0})
            p["eventos"] += 1; p["ataques"] += cat == "ataque"
        if cat == "ataque":
            rotas[e["rota"]] = rotas.get(e["rota"], 0) + 1
            ag = (e["agente"] or "(vazio)")[:80]
            agentes[ag] = agentes.get(ag, 0) + 1
        if e["lat"] is not None and e["lon"] is not None:
            k = (round(e["lat"], 1), round(e["lon"], 1))
            pt = pontos.setdefault(k, {"lat": e["lat"], "lon": e["lon"], "cidade": e["cidade"], "pais": e["pais"], "acesso": 0, "login": 0,
                                       "robo": 0, "ataque": 0, "ips": set(), "ultimo": e["quando"]})
            pt[cat] += 1; pt["ips"].add(e["ip"])
    lista_ips = []
    for i in sorted(ips.values(), key=lambda x: (-RISCO[x["veredito"]["nivel"]], -x["ataques"], -x["eventos"]))[:200]:
        nivel = i["veredito"]["nivel"]
        i["risco"] = min(100, RISCO[nivel] + (20 if "scanner" in i["tipos"] else 0) + min(10, i["ataques"]) if nivel == "ataque" else RISCO[nivel])
        i["tipos"] = sorted(i["tipos"]); i["agentes"] = sorted(i["agentes"])[:3]; i["bloqueado"] = i["ip"] in bl
        lista_ips.append(i)
    ataques = sum(d["ataque"] for d in por_dia.values())
    anterior = db.um("SELECT count(*) FILTER (WHERE tipo IN (" + ",".join("?" * len(ATAQUES)) + ")) AS ataques, count(*) AS total "
                     "FROM seguranca_eventos WHERE quando BETWEEN ? AND ?", (*ATAQUES, desde - dias * 86400, desde))
    serie = []
    for n in range(dias - 1, -1, -1):
        k = _d(agora - n * 86400).strftime("%Y-%m-%d")
        serie.append(por_dia.get(k, {"dia": k, "acesso": 0, "login": 0, "robo": 0, "ataque": 0}))
    for p in pontos.values():
        p["ips"] = len(p["ips"])
    niveis = {}
    for i in ips.values():
        niveis[i["veredito"]["nivel"]] = niveis.get(i["veredito"]["nivel"], 0) + 1
    ips_ataque = niveis.get("ataque", 0)
    pontuacao = 100 - min(40, ataques // 3) - min(20, ips_ataque * 4) - min(20, len(bloqueados) * 2)
    return {
        "dias": dias, "servidor": SERVIDOR, "rotulos": ROTULOS,
        "totais": {"eventos": len(ev), "ataques": ataques, "acessos": por_tipo.get("acesso", 0), "logins_ok": por_tipo.get("login_ok", 0),
                   "logins_falhos": por_tipo.get("login_falhou", 0) + por_tipo.get("login_negado", 0), "ips_unicos": len(ips),
                   "paises": len(paises), "bloqueados_agora": len(bloqueados), "sem_login": por_tipo.get("sem_login", 0),
                   "ataques_periodo_anterior": anterior["ataques"], "eventos_periodo_anterior": anterior["total"],
                   "postura": max(0, pontuacao)},
        "analise": {"ataque": niveis.get("ataque", 0), "suspeito": niveis.get("suspeito", 0), "robo": niveis.get("robo", 0),
                    "visitante": niveis.get("visitante", 0), "confiavel": niveis.get("confiavel", 0)},
        "por_tipo": [{"tipo": k, "rotulo": ROTULOS.get(k, k), "n": v} for k, v in sorted(por_tipo.items(), key=lambda x: -x[1])],
        "por_dia": serie, "por_hora": por_hora,
        "ips": lista_ips, "paises": sorted(paises.values(), key=lambda x: -x["eventos"]),
        "rotas_atacadas": [{"rota": k, "n": v} for k, v in sorted(rotas.items(), key=lambda x: -x[1])[:15]],
        "agentes_ataque": [{"agente": k, "n": v} for k, v in sorted(agentes.items(), key=lambda x: -x[1])[:10]],
        "pontos": sorted(pontos.values(), key=lambda x: -(x["acesso"] + x["login"] + x["robo"] + x["ataque"]))[:300],
        "recentes": [{**e, "rotulo": ROTULOS.get(e["tipo"], e["tipo"]), "veredito": ips[e["ip"]]["veredito"]["rotulo"]} for e in ev[:60]],
        "bloqueados": bloqueados,
    }


def documento(dias: int) -> dict:
    r = resumo(dias)
    t = r["totais"]
    cor = (db.cfg("white_label") or {}).get("cor_primaria", "#0f766a")
    nome = (db.cfg("white_label") or {}).get("nome", "Clima Escritório")
    fim = db.agora()
    from . import firewall
    c = firewall.config()

    def data(ts):
        return _d(ts).strftime("%d/%m/%Y %H:%M") if ts else "sem expiração"
    var = (f"{(t['ataques'] - t['ataques_periodo_anterior']) / t['ataques_periodo_anterior'] * 100:+.0f}% vs período anterior"
           if t["ataques_periodo_anterior"] else "sem ataques no período anterior")
    return {
        "titulo": f"Relatório de segurança · {nome}", "cor": cor,
        "subtitulo": f"Período {_d(fim - dias * 86400):%d/%m/%Y} a {_d(fim):%d/%m/%Y} ({dias} dias) · gerado em {_d(fim):%d/%m/%Y %H:%M}",
        "resumo": [("Postura de segurança", f"{t['postura']}/100"), ("Eventos registrados", t["eventos"]),
                   ("Ataques reais barrados", f"{t['ataques']} ({var})"),
                   ("IPs por veredito", f"{r['analise']['ataque']} ataque · {r['analise']['suspeito']} suspeito · {r['analise']['robo']} robô inofensivo · {r['analise']['visitante']} visitante · {r['analise']['confiavel']} equipe"), ("Acessos legítimos", t["acessos"]),
                   ("Logins aceitos", t["logins_ok"]), ("Logins recusados", t["logins_falhos"]), ("IPs únicos", t["ips_unicos"]),
                   ("Países de origem", t["paises"]), ("IPs bloqueados agora", t["bloqueados_agora"]),
                   ("Firewall", "ativo" if c.get("ativo") else "DESLIGADO"),
                   ("Limites", f"{c['tentativas_login']} senhas erradas · {c['limite_por_minuto']} req/min · janela {c['janela_min']} min"),
                   ("Bloqueio progressivo", " → ".join(f"{m} min" for m in c["bloqueio_progressivo"])),
                   ("Criptografia em repouso", "AES-256-GCM com contexto por campo"), ("Transporte", "TLS 1.2+ com HSTS preload")],
        "grafico": {"titulo": "Ataques barrados por dia", "rotulos": [d["dia"][8:] + "/" + d["dia"][5:7] for d in r["por_dia"]],
                    "valores": [d["ataque"] for d in r["por_dia"]]},
        "secoes": [
            {"titulo": "Eventos por tipo", "cabecalho": ["Tipo", "Quantidade"], "linhas": [[x["rotulo"], x["n"]] for x in r["por_tipo"]], "larguras": [80, 30]},
            {"titulo": "IPs com mais atividade suspeita", "nota": "Risco de 0 a 100 calculado pela quantidade e pelo tipo de ataque.",
             "cabecalho": ["IP", "Local", "Veredito", "Eventos", "Ataques", "Risco", "Bloqueado", "Último", "Tipos"],
             "linhas": [[i["ip"], ", ".join(x for x in (i["cidade"], i["pais"]) if x) or ("rede local" if i["privado"] else "—"),
                         i["veredito"]["rotulo"] + (f" ({i['provedor']})" if i["provedor"] else ""), i["eventos"], i["ataques"],
                         i["risco"], "sim" if i["bloqueado"] else "não", data(i["ultimo"]),
                         ", ".join(ROTULOS.get(x, x) for x in i["tipos"])] for i in r["ips"][:60]],
             "larguras": [30, 32, 40, 15, 15, 13, 17, 27, 75]},
            {"titulo": "Países de origem", "cabecalho": ["País", "Código", "Eventos", "Ataques"],
             "linhas": [[p["nome"], p["pais"], p["eventos"], p["ataques"]] for p in r["paises"]], "larguras": [60, 20, 25, 25]},
            {"titulo": "Rotas mais atacadas", "cabecalho": ["Rota", "Tentativas"], "linhas": [[x["rota"], x["n"]] for x in r["rotas_atacadas"]], "larguras": [150, 30]},
            {"titulo": "Ferramentas e agentes usados nos ataques", "cabecalho": ["User-Agent", "Ocorrências"],
             "linhas": [[x["agente"], x["n"]] for x in r["agentes_ataque"]], "larguras": [200, 30]},
            {"titulo": "IPs bloqueados agora", "cabecalho": ["IP/Faixa", "Motivo", "Automático", "Ocorrências", "Desde", "Expira"],
             "linhas": [[b["alvo"], b["motivo"], "sim" if b["automatico"] else "não", b["ocorrencias"], data(b["criado_em"]), data(b["expira_em"])] for b in r["bloqueados"]],
             "larguras": [35, 90, 22, 22, 32, 32]},
            {"titulo": "Distribuição por hora (Brasília)", "cabecalho": ["Hora", "Eventos"], "linhas": [[f"{h:02d}h", n] for h, n in enumerate(r["por_hora"])], "larguras": [20, 25]},
            {"titulo": "Eventos mais recentes", "cabecalho": ["Quando", "Tipo", "IP", "Local", "Rota", "Detalhe"],
             "linhas": [[data(e["quando"]), e["rotulo"], e["ip"], ", ".join(x for x in (e["cidade"], e["pais"]) if x), e["rota"], e["detalhe"]] for e in r["recentes"]],
             "larguras": [28, 32, 30, 35, 55, 85]},
            {"titulo": "Recomendações", "cabecalho": ["Prioridade", "Ação"], "linhas": _recomendacoes(r, c), "larguras": [25, 230]},
        ],
        "rodape": "Localização aproximada pelo IP (borda da Vercel). Eventos de acesso são amostrados: um por IP a cada 10 minutos.",
        "dados": r,
    }


def _recomendacoes(r, c):
    t, rec = r["totais"], []
    if not c.get("ativo"):
        rec.append(["Alta", "Ligar o firewall em Segurança → Regras."])
    if t["logins_falhos"] >= 5:
        rec.append(["Alta", f"{t['logins_falhos']} logins recusados no período: confirme se foi você e troque a senha se houver dúvida."])
    perigosos = [i["ip"] for i in r["ips"] if i["veredito"]["nivel"] == "ataque" and not i["bloqueado"]]
    if perigosos:
        rec.append(["Alta", f"Bloquear de forma permanente os IPs de alto risco: {', '.join(perigosos[:8])}."])
    estrangeiros = [p["nome"] for p in r["paises"] if p["pais"] != "BR" and p["ataques"] and p["eventos"] == p["ataques"]]
    if estrangeiros and not c.get("paises_permitidos"):
        rec.append(["Média", f"Só houve ataques vindos de {', '.join(estrangeiros[:6])}. Considere permitir apenas BR em Segurança → Regras."])
    rec.append(["Rotina", "Marcar o IP do escritório como permitido (Nunca bloquear meu IP)."])
    rec.append(["Rotina", "Trocar a senha do administrador a cada 90 dias e manter a CLIMA_CHAVE_MESTRA num gerenciador de senhas."])
    return rec


def exportar_pmf(formato: str, dias: int, emitido_por: str = "") -> tuple[bytes, str, str]:
    """PDF ou Word no modelo oficial da Prefeitura (brasão, cabeçalho, seções numeradas, página X de Y, assinaturas),
    com o mesmo conteúdo do relatório comum."""
    from . import documentos
    from .relatorio import _cabecalho_oficial
    d = documento(dias)
    agora = db.agora()
    org = _cabecalho_oficial()
    meta = [["Órgão", " · ".join(org[1:]) or (org[0] if org else "")], ["Documento", "Relatório de segurança da informação"],
            ["Período", d["subtitulo"].split(" · ")[0].removeprefix("Período ")], ["Emissão", f"{_d(agora):%d/%m/%Y às %H:%M}"],
            ["Emitido por", emitido_por or "Sistema Clima Escritório"], ["Classificação", "Uso interno"]]
    secoes = [("Resumo executivo", [("tabela", ["Indicador", "Valor"], [[a, str(b)] for a, b in d["resumo"]])])]
    g = d.get("grafico") or {}
    dias_ataque = [[r, v] for r, v in zip(g.get("rotulos") or [], g.get("valores") or []) if v]
    secoes.append((g.get("titulo") or "Ataques barrados por dia", [("tabela", ["Dia", "Ataques barrados"], dias_ataque)] if dias_ataque else ["Nenhum ataque real barrado no período."]))
    for s in d["secoes"]:
        blocos = ([s["nota"]] if s.get("nota") else []) + ([("tabela", s["cabecalho"], [[str(c) for c in l] for l in s["linhas"][:300]])] if s["linhas"] else ["Sem registros no período."])
        secoes.append((s["titulo"], blocos))
    secoes.append(("Observações", [d["rodape"]]))
    titulo = "Relatório de Segurança da Informação"
    if formato == "docx":
        return documentos._docx(titulo, meta, secoes, agora, rodape="uso interno"), \
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"
    return documentos._pdf(titulo, meta, secoes, agora, rodape="uso interno"), "application/pdf", "pdf"
