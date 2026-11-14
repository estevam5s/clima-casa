"""Dados da tela /seguranca (resumo, mapa, linha do tempo) e o relatório de segurança exportável."""
import datetime
import ipaddress

from . import db

FUSO = datetime.timezone(datetime.timedelta(hours=-3))
# Onde a API roda: Vercel região cle1 (Cleveland, EUA). Usado como destino dos arcos no mapa.
SERVIDOR = {"nome": "Servidor (Vercel · Cleveland)", "lat": 41.4993, "lon": -81.6944}
ATAQUES = ("scanner", "rate_limit", "auth_negado", "login_falhou", "login_negado", "pais_bloqueado", "ip_bloqueado_auto")
ROTULOS = {"acesso": "Acesso", "login_ok": "Login aceito", "login_falhou": "Senha errada", "login_negado": "Conta sem permissão",
           "auth_negado": "Acesso negado", "scanner": "Ferramenta de ataque", "rate_limit": "Excesso de requisições",
           "pais_bloqueado": "País bloqueado", "ip_bloqueado_auto": "IP bloqueado"}
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


def resumo(dias: int) -> dict:
    agora = db.agora()
    desde = agora - dias * 86400
    ev = db.consultar("SELECT id, quando, ip, tipo, rota, detalhe, pais, cidade, regiao, lat, lon, agente FROM seguranca_eventos "
                      "WHERE quando > ? ORDER BY quando DESC LIMIT 20000", (desde,))
    anterior = db.um("SELECT count(*) FILTER (WHERE tipo IN (" + ",".join("?" * len(ATAQUES)) + ")) AS ataques, count(*) AS total "
                     "FROM seguranca_eventos WHERE quando BETWEEN ? AND ?", (*ATAQUES, desde - dias * 86400, desde))
    por_tipo, por_dia, por_hora, ips, paises, rotas, agentes, pontos = {}, {}, [0] * 24, {}, {}, {}, {}, {}
    for e in ev:
        cat = categoria(e["tipo"])
        por_tipo[e["tipo"]] = por_tipo.get(e["tipo"], 0) + 1
        d = _d(e["quando"])
        dia = por_dia.setdefault(d.strftime("%Y-%m-%d"), {"dia": d.strftime("%Y-%m-%d"), "acesso": 0, "login": 0, "ataque": 0})
        dia[cat] += 1
        por_hora[d.hour] += 1
        i = ips.setdefault(e["ip"], {"ip": e["ip"], "eventos": 0, "ataques": 0, "logins": 0, "pais": e["pais"], "cidade": e["cidade"],
                                     "primeiro": e["quando"], "ultimo": e["quando"], "tipos": set(), "privado": _privado(e["ip"])})
        i["eventos"] += 1; i["ataques"] += cat == "ataque"; i["logins"] += e["tipo"] == "login_ok"
        i["primeiro"] = min(i["primeiro"], e["quando"]); i["tipos"].add(e["tipo"])
        i["pais"] = i["pais"] or e["pais"]; i["cidade"] = i["cidade"] or e["cidade"]
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
                                       "ataque": 0, "ips": set(), "ultimo": e["quando"]})
            pt[cat] += 1; pt["ips"].add(e["ip"])
    bloqueados = db.consultar("SELECT * FROM seguranca_ips WHERE tipo = 'bloqueado' AND (expira_em IS NULL OR expira_em > ?) ORDER BY criado_em DESC", (agora,))
    bl = {b["alvo"] for b in bloqueados}
    lista_ips = []
    for i in sorted(ips.values(), key=lambda x: (-x["ataques"], -x["eventos"]))[:200]:
        i["tipos"] = sorted(i["tipos"]); i["bloqueado"] = i["ip"] in bl
        i["risco"] = min(100, i["ataques"] * 12 + (40 if "scanner" in i["tipos"] else 0) + (25 if "ip_bloqueado_auto" in i["tipos"] else 0))
        lista_ips.append(i)
    ataques = sum(v for k, v in por_tipo.items() if k in ATAQUES)
    serie = []
    for n in range(dias - 1, -1, -1):
        k = _d(agora - n * 86400).strftime("%Y-%m-%d")
        serie.append(por_dia.get(k, {"dia": k, "acesso": 0, "login": 0, "ataque": 0}))
    for p in pontos.values():
        p["ips"] = len(p["ips"])
    pontuacao = 100 - min(40, ataques // 5) - min(30, len(bloqueados) * 3)
    return {
        "dias": dias, "servidor": SERVIDOR, "rotulos": ROTULOS,
        "totais": {"eventos": len(ev), "ataques": ataques, "acessos": por_tipo.get("acesso", 0), "logins_ok": por_tipo.get("login_ok", 0),
                   "logins_falhos": por_tipo.get("login_falhou", 0) + por_tipo.get("login_negado", 0), "ips_unicos": len(ips),
                   "paises": len(paises), "bloqueados_agora": len(bloqueados),
                   "ataques_periodo_anterior": anterior["ataques"], "eventos_periodo_anterior": anterior["total"],
                   "postura": max(0, pontuacao)},
        "por_tipo": [{"tipo": k, "rotulo": ROTULOS.get(k, k), "n": v} for k, v in sorted(por_tipo.items(), key=lambda x: -x[1])],
        "por_dia": serie, "por_hora": por_hora,
        "ips": lista_ips, "paises": sorted(paises.values(), key=lambda x: -x["eventos"]),
        "rotas_atacadas": [{"rota": k, "n": v} for k, v in sorted(rotas.items(), key=lambda x: -x[1])[:15]],
        "agentes_ataque": [{"agente": k, "n": v} for k, v in sorted(agentes.items(), key=lambda x: -x[1])[:10]],
        "pontos": sorted(pontos.values(), key=lambda x: -(x["acesso"] + x["login"] + x["ataque"]))[:300],
        "recentes": [{**e, "categoria": categoria(e["tipo"]), "rotulo": ROTULOS.get(e["tipo"], e["tipo"])} for e in ev[:60]],
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
                   ("Ataques barrados", f"{t['ataques']} ({var})"), ("Acessos legítimos", t["acessos"]),
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
             "cabecalho": ["IP", "Local", "Eventos", "Ataques", "Risco", "Bloqueado", "Primeiro", "Último", "Tipos"],
             "linhas": [[i["ip"], ", ".join(x for x in (i["cidade"], i["pais"]) if x) or ("rede local" if i["privado"] else "—"), i["eventos"], i["ataques"],
                         i["risco"], "sim" if i["bloqueado"] else "não", data(i["primeiro"]), data(i["ultimo"]),
                         ", ".join(ROTULOS.get(x, x) for x in i["tipos"])] for i in r["ips"][:60]],
             "larguras": [30, 32, 15, 15, 13, 17, 27, 27, 90]},
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
    perigosos = [i["ip"] for i in r["ips"] if i["risco"] >= 60 and not i["bloqueado"]]
    if perigosos:
        rec.append(["Alta", f"Bloquear de forma permanente os IPs de alto risco: {', '.join(perigosos[:8])}."])
    estrangeiros = [p["nome"] for p in r["paises"] if p["pais"] != "BR" and p["ataques"] and p["eventos"] == p["ataques"]]
    if estrangeiros and not c.get("paises_permitidos"):
        rec.append(["Média", f"Só houve ataques vindos de {', '.join(estrangeiros[:6])}. Considere permitir apenas BR em Segurança → Regras."])
    rec.append(["Rotina", "Marcar o IP do escritório como permitido (Nunca bloquear meu IP)."])
    rec.append(["Rotina", "Trocar a senha do administrador a cada 90 dias e manter a CLIMA_CHAVE_MESTRA num gerenciador de senhas."])
    return rec
