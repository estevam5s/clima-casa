"""Fluxos (Rotinas → Fluxos): automações em blocos ligados por setas, no estilo do N8N.

Um fluxo é um grafo: nós (gatilho, lógica, ação, integração) e ligações (de um nó/porta para outro nó). Quando um gatilho
dispara, o motor segue as setas a partir dele: cada nó roda, devolve a porta de saída ("saida", ou "sim"/"nao" nas
condições) e o caminho continua pelas ligações dessa porta. O que cada nó produz fica num contexto e pode ser usado nos
campos dos nós seguintes com {{caminho}} (ex.: {{ar.temperatura}}, {{fora.temperatura}}, {{http.status}}, {{ia.texto}}).

Onde roda:
- horário, intervalo, "ar ligado há", temperatura lá fora: no agente principal, a cada ciclo do agenda.laco (~20 s);
- "o ar ligou/desligou": no agente, junto com as automações (automacao.processar_evento);
- manual (botão Executar) e webhook: no próprio pedido (nuvem ou agente). Na nuvem, as esperas somam no máximo 25 s.
Comandos físicos (ar, dispositivos) seguem o caminho de sempre: na nuvem viram pedido na fila para o agente.
Cada execução fica em fluxos_execucoes com o resultado de cada nó (as 200 mais novas por fluxo).
"""
from __future__ import annotations

import datetime
import ipaddress
import json
import logging
import re
import secrets
import socket
import threading
import time

from . import db

log = logging.getLogger("clima.fluxos")
LIMITE_NOS, LIMITE_LIGACOES, LIMITE_PASSOS = 60, 120, 200
ESPERA_MAX = 3600            # um nó "esperar" no agente
ESPERA_NUVEM = 25            # soma das esperas quando roda dentro de um pedido
_rodando: set[int] = set()   # fluxos em execução neste processo (um por vez por fluxo)
_trava = threading.Lock()

# ---------------- catálogo (mesma fonte para a tela) ----------------
# campos: (nome, tipo, rótulo, extra). tipos: texto, textao, numero, hora, dias, sim_nao, escolha, ar, ar_ou_evento,
# cena, dispositivo, projeto, pessoas, segredo
CATALOGO = {
    # gatilhos
    "gatilho_manual": {"cat": "gatilho", "rotulo": "Ao clicar em Executar", "desc": "Roda quando alguém aperta Executar no fluxo.", "campos": []},
    "gatilho_horario": {"cat": "gatilho", "rotulo": "Horário", "desc": "Todo dia escolhido, na hora marcada (horário de Brasília).",
                        "campos": [("hora", "hora", "Hora", None), ("dias", "dias", "Dias", None), ("pular_feriado", "sim_nao", "Não rodar em feriado ou férias", None)]},
    "gatilho_intervalo": {"cat": "gatilho", "rotulo": "A cada N minutos", "desc": "Repete sozinho no intervalo escolhido (mínimo 5 min).",
                          "campos": [("minutos", "numero", "Minutos", {"min": 5, "max": 1440})]},
    "gatilho_ar": {"cat": "gatilho", "rotulo": "Quando um ar ligar ou desligar", "desc": "Pelo painel, Alexa, agenda ou outro fluxo não conta (evita laço).",
                   "campos": [("evento", "escolha", "Quando", [["ligou", "Ligar"], ["desligou", "Desligar"], ["qualquer", "Ligar ou desligar"]]), ("aparelho_id", "ar", "Ar (vazio = qualquer)", None)]},
    "gatilho_ligado_ha": {"cat": "gatilho", "rotulo": "Ar ligado há muito tempo", "desc": "Dispara uma vez a cada vez que o ar passa do tempo ligado.",
                          "campos": [("minutos", "numero", "Minutos ligado", {"min": 5, "max": 1440}), ("aparelho_id", "ar", "Ar (vazio = qualquer)", None)]},
    "gatilho_temperatura": {"cat": "gatilho", "rotulo": "Temperatura lá fora", "desc": "Quando a temperatura da rua passa do limite (confere a cada 10 min, dispara ao cruzar).",
                            "campos": [("sentido", "escolha", "Quando ficar", [["acima", "Acima de"], ["abaixo", "Abaixo de"]]), ("valor", "numero", "°C", {"min": -10, "max": 50}), ("projeto_id", "projeto", "Lugar (projeto)", None)]},
    "gatilho_webhook": {"cat": "gatilho", "rotulo": "Webhook (chamada de fora)", "desc": "Outro sistema chama um endereço secreto (POST) e o fluxo roda. O corpo enviado fica em {{webhook}}.",
                        "campos": [("token", "segredo", "Endereço", None)]},
    # lógica
    "condicao": {"cat": "logica", "rotulo": "Se (condição)", "desc": "Compara um valor e segue pelo Sim ou pelo Não.", "portas": ["sim", "nao"],
                 "campos": [("campo", "texto", "Valor (use {{...}})", None), ("operador", "escolha", "Operador", [["=", "igual a"], ["!=", "diferente de"], [">", "maior que"], [">=", "maior ou igual"], ["<", "menor que"], ["<=", "menor ou igual"], ["contem", "contém"], ["vazio", "está vazio"]]), ("valor", "texto", "Comparar com", None)]},
    "janela": {"cat": "logica", "rotulo": "Dentro do horário?", "desc": "Sim se agora está entre as horas e nos dias marcados.", "portas": ["sim", "nao"],
               "campos": [("inicio", "hora", "De", None), ("fim", "hora", "Até", None), ("dias", "dias", "Dias", None)]},
    "feriado": {"cat": "logica", "rotulo": "É feriado ou férias?", "desc": "Usa os feriados e pausas de Rotinas → Agenda.", "portas": ["sim", "nao"], "campos": []},
    "esperar": {"cat": "logica", "rotulo": "Esperar", "desc": "Pausa antes de seguir (no agente até 1 h; no botão Executar, até 25 s no total).",
                "campos": [("segundos", "numero", "Segundos", {"min": 1, "max": ESPERA_MAX})]},
    "ar_estado": {"cat": "logica", "rotulo": "Ler estado do ar", "desc": "Guarda o estado do ar em {{ar.ligado}}, {{ar.temperatura}}, {{ar.modo}}, {{ar.nome}}.",
                  "campos": [("aparelho_id", "ar_ou_evento", "Ar", None)]},
    "clima_fora": {"cat": "logica", "rotulo": "Tempo lá fora", "desc": "Guarda {{fora.temperatura}}, {{fora.umidade}}, {{fora.sensacao}} e {{fora.tipo}} (Open-Meteo).",
                   "campos": [("projeto_id", "projeto", "Lugar (projeto)", None)]},
    "definir": {"cat": "logica", "rotulo": "Guardar valor", "desc": "Cria uma variável {{var.nome}} para os próximos nós.",
                "campos": [("nome", "texto", "Nome", None), ("valor", "texto", "Valor", None)]},
    # ações
    "ar": {"cat": "acao", "rotulo": "Comandar ar", "desc": "Liga, desliga ou ajusta um ar (o do gatilho ou um escolhido).",
           "campos": [("aparelho_id", "ar_ou_evento", "Ar", None), ("acao", "escolha", "Ação", [["ligar", "Ligar"], ["desligar", "Desligar"]]),
                      ("modo", "escolha", "Modo", [["", "Manter"], ["frio", "Frio"], ["quente", "Quente"], ["ventilar", "Ventilar"], ["desumidificar", "Desumidificar"], ["auto", "Automático"]]),
                      ("temperatura", "numero", "Temperatura", {"min": 16, "max": 30})]},
    "desligar_todos": {"cat": "acao", "rotulo": "Desligar todos os ares", "desc": "Desliga os ares ligados (de um projeto ou de todos).",
                       "campos": [("projeto_id", "projeto", "Projeto (vazio = todos)", None)]},
    "cena": {"cat": "acao", "rotulo": "Executar cena", "desc": "Roda uma cena salva.", "campos": [("cena_id", "cena", "Cena", None)]},
    "dispositivo": {"cat": "acao", "rotulo": "Comandar aparelho", "desc": "Luz, cafeteira, persiana ou fechadura (Smart Life).",
                    "campos": [("dispositivo_id", "dispositivo", "Aparelho", None), ("acao", "escolha", "Ação", [["ligar", "Ligar"], ["desligar", "Desligar"], ["abrir", "Abrir (persiana)"], ["fechar", "Fechar (persiana)"], ["trancar", "Trancar (fechadura)"]])]},
    "notificacao": {"cat": "acao", "rotulo": "Aviso no sino", "desc": "Cria uma notificação no painel.",
                    "campos": [("titulo", "texto", "Título", None), ("texto", "textao", "Detalhe", None), ("gravidade", "escolha", "Gravidade", [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]])]},
    "registrar": {"cat": "acao", "rotulo": "Registrar na Atividade", "desc": "Escreve uma linha na Atividade.", "campos": [("texto", "texto", "Texto", None)]},
    # integrações
    "email": {"cat": "integracao", "rotulo": "Enviar e-mail", "desc": "Para pessoas cadastradas no sistema (pelo Resend).",
              "campos": [("para", "pessoas", "Para", None), ("assunto", "texto", "Assunto", None), ("texto", "textao", "Mensagem", None)]},
    "telegram": {"cat": "integracao", "rotulo": "Mensagem no Telegram", "desc": "Para quem ligou o bot do Telegram ao painel.",
                 "campos": [("para", "pessoas", "Para (vazio = dono e administradores)", None), ("texto", "textao", "Mensagem", None)]},
    "http": {"cat": "integracao", "rotulo": "Chamar URL (HTTP)", "desc": "GET ou POST para um endereço https da internet. A resposta fica em {{http.status}}, {{http.json}} e {{http.texto}}.",
             "campos": [("metodo", "escolha", "Método", [["GET", "GET"], ["POST", "POST"], ["PUT", "PUT"]]), ("url", "texto", "URL (https)", None), ("corpo", "textao", "Corpo JSON (opcional)", None)]},
    "ia": {"cat": "integracao", "rotulo": "Perguntar à IA", "desc": "Gera um texto (NVIDIA) e guarda em {{ia.texto}}.", "campos": [("pedido", "textao", "Pedido", None)]},
}
CATEGORIAS = [["gatilho", "Gatilhos"], ["logica", "Lógica e dados"], ["acao", "Ações"], ["integracao", "Integrações"]]


def _agora_br() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).replace(tzinfo=None)


# ---------------- validação ----------------
def validar(grafo: dict, aparelhos_ok: set | None) -> dict:
    """Confere e limpa o grafo vindo da tela. aparelhos_ok = ares que quem salva pode comandar (None = todos)."""
    nos_in = (grafo or {}).get("nos") or []
    lig_in = (grafo or {}).get("ligacoes") or []
    if len(nos_in) > LIMITE_NOS:
        raise ValueError(f"Um fluxo pode ter até {LIMITE_NOS} blocos.")
    if len(lig_in) > LIMITE_LIGACOES:
        raise ValueError(f"Um fluxo pode ter até {LIMITE_LIGACOES} ligações.")
    nos, ids = [], set()
    for n in nos_in:
        tipo = str(n.get("tipo") or "")
        if tipo not in CATALOGO:
            raise ValueError(f"Bloco desconhecido: {tipo[:40]}.")
        nid = re.sub(r"[^a-zA-Z0-9_-]", "", str(n.get("id") or ""))[:40] or secrets.token_hex(4)
        if nid in ids:
            nid = f"{nid}{secrets.token_hex(2)}"
        ids.add(nid)
        cfg_in = n.get("config") or {}
        cfg = {}
        for nome, t, _r, extra in CATALOGO[tipo]["campos"]:
            v = cfg_in.get(nome)
            if t in ("numero",):
                if v in (None, ""):
                    v = None
                else:
                    v = float(v)
                    if extra and not (extra["min"] <= v <= extra["max"]):
                        raise ValueError(f"{CATALOGO[tipo]['rotulo']}: {_r} precisa ficar entre {extra['min']} e {extra['max']}.")
            elif t in ("fluxo", "automacao", "tarefa_projeto"):
                v = None if v in (None, "") else int(v)
            elif t == "conexao":
                v = re.sub(r"[^a-zA-Z0-9_-]", "", str(v or ""))[:40]
            elif t == "modelo":
                from . import ia
                v = str(v or "")
                v = v if v in ia.MODELOS else ""
            elif t in ("ar", "ar_ou_evento", "cena", "dispositivo", "projeto"):
                v = None if v in (None, "", "evento") else int(v)
                if t == "ar_ou_evento" and cfg_in.get(nome) == "evento":
                    v = "evento"
                if t in ("ar", "ar_ou_evento") and isinstance(v, int) and aparelhos_ok is not None and v not in aparelhos_ok:
                    raise ValueError("Um dos blocos usa um ar que não está sob sua responsabilidade.")
            elif t == "dias":
                v = sorted({int(x) for x in (v or []) if str(x).isdigit() and 0 <= int(x) <= 6}) or [1, 2, 3, 4, 5]
            elif t == "sim_nao":
                v = bool(v)
            elif t == "pessoas":
                v = [str(x)[:40] for x in (v or [])][:20]
            elif t == "segredo":
                v = re.sub(r"[^a-zA-Z0-9_-]", "", str(v or ""))[:48] or secrets.token_urlsafe(24)
            elif t == "hora":
                v = str(v or "08:00")
                if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                    raise ValueError(f"{CATALOGO[tipo]['rotulo']}: hora inválida.")
            elif t == "escolha":
                opcoes = [o[0] for o in extra]
                v = v if v in opcoes else opcoes[0]
            else:
                v = str(v or "")[:4000 if t == "textao" else 500]
            cfg[nome] = v
        if tipo == "http" or tipo.startswith("http_"):
            u = cfg.get("url") or ""
            if u and not u.startswith("https://"):
                raise ValueError("Chamar URL: só endereços https://.")
        nos.append({"id": nid, "tipo": tipo, "x": round(float(n.get("x") or 0), 1), "y": round(float(n.get("y") or 0), 1),
                    "nome": str(n.get("nome") or "")[:60], "config": cfg})
    portas_ok = {n["id"]: (CATALOGO[n["tipo"]].get("portas") or ["saida"]) for n in nos}
    ligacoes, vistos = [], set()
    for lg in lig_in:
        de, para, porta = str(lg.get("de") or ""), str(lg.get("para") or ""), str(lg.get("porta") or "saida")
        if de not in portas_ok or para not in portas_ok or de == para or porta not in portas_ok[de]:
            continue
        if CATALOGO[next(n["tipo"] for n in nos if n["id"] == para)]["cat"] == "gatilho":
            continue   # nada entra num gatilho
        k = (de, porta, para)
        if k not in vistos:
            vistos.add(k); ligacoes.append({"de": de, "porta": porta, "para": para})
    return {"nos": nos, "ligacoes": ligacoes}


def resumo_gatilhos(grafo: dict) -> list[str]:
    out = []
    for n in grafo.get("nos", []):
        c = n["config"]
        t = n["tipo"]
        if t == "gatilho_horario":
            out.append(f"às {c.get('hora')}")
        elif t == "gatilho_intervalo":
            out.append(f"a cada {int(c.get('minutos') or 0)} min")
        elif t == "gatilho_ar":
            out.append({"ligou": "quando um ar ligar", "desligou": "quando um ar desligar"}.get(c.get("evento"), "quando um ar mudar"))
        elif t == "gatilho_ligado_ha":
            out.append(f"ar ligado há {int(c.get('minutos') or 0)} min")
        elif t == "gatilho_temperatura":
            out.append(f"rua {'acima' if c.get('sentido') == 'acima' else 'abaixo'} de {c.get('valor')} °C")
        elif t not in ("gatilho_webhook", "gatilho_manual") and CATALOGO.get(t, {}).get("cat") == "gatilho":
            out.append(CATALOGO[t]["rotulo"].lower())
        elif t == "gatilho_webhook":
            out.append("webhook")
        elif t == "gatilho_manual":
            out.append("manual")
    return out


# ---------------- contexto e modelos {{...}} ----------------
def _caminho(ctx: dict, caminho: str):
    v = ctx
    for p in caminho.strip().split("."):
        if isinstance(v, dict):
            v = v.get(p)
        elif isinstance(v, list) and p.isdigit():
            v = v[int(p)] if int(p) < len(v) else None
        else:
            return None
    return v


def preencher(texto, ctx: dict) -> str:
    if not isinstance(texto, str) or "{{" not in texto:
        return texto
    def troca(m):
        v = _caminho(ctx, m.group(1))
        if v is None:
            return ""
        if isinstance(v, (dict, list)):
            return json.dumps(v, ensure_ascii=False)[:2000]
        if isinstance(v, bool):
            return "sim" if v else "não"
        return str(v)
    return re.sub(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}", troca, texto)


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _comparar(a, op, b) -> bool:
    if op == "vazio":
        return a in (None, "", [], {})
    if op == "contem":
        return str(b).lower() in str(a).lower()
    na, nb = _num(a), _num(b)
    if na is not None and nb is not None:
        a, b = na, nb
    else:
        a, b = str(a or "").strip().lower(), str(b or "").strip().lower()
        if b in ("sim", "true", "ligado") and a in ("sim", "true", "1", "ligado"):
            a = b
    if op in ("=", "!="):
        return (a == b) == (op == "=")
    if isinstance(a, str) != isinstance(b, str):
        return False
    try:
        return {">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b}.get(op, False)
    except TypeError:
        return False


# ---------------- segurança do HTTP (sem endereço interno) ----------------
def _url_publica(url: str) -> bool:
    from urllib.parse import urlparse
    u = urlparse(url)
    if u.scheme != "https" or not u.hostname:
        return False
    try:
        for info in socket.getaddrinfo(u.hostname, u.port or 443, proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
                return False
    except (socket.gaierror, ValueError):
        return False
    return True


# ---------------- execução de cada nó ----------------
def _usuarios(ids: list[str], so_admins: bool = False) -> list[dict]:
    if so_admins or not ids:
        return db.consultar("SELECT id, email, nome FROM usuarios WHERE ativo AND papel IN ('dono','admin')")
    return db.consultar(f"SELECT id, email, nome FROM usuarios WHERE ativo AND id::text IN ({','.join('?' * len(ids))})", tuple(ids))


def _rodar_no(fluxo: dict, n: dict, ctx: dict, prazo: dict) -> tuple[str, str]:
    """Roda um nó e devolve (porta de saída, resumo para o histórico)."""
    from . import clima
    t, c = n["tipo"], n["config"]
    origem = f"fluxo:{fluxo['nome']}"[:60]
    P = lambda k: preencher(c.get(k), ctx)   # noqa: E731
    if CATALOGO[t]["cat"] == "gatilho":
        return "saida", "disparou"
    if t == "condicao":
        a = P("campo")
        ok = _comparar(a, c.get("operador"), P("valor"))
        return ("sim" if ok else "nao"), f"{a!r} {c.get('operador')} {P('valor')!r} → {'sim' if ok else 'não'}"
    if t == "janela":
        agora = _agora_br()
        dia = (agora.weekday() + 1) % 7
        h = agora.strftime("%H:%M")
        ini, fim = c.get("inicio") or "00:00", c.get("fim") or "23:59"
        dentro = (ini <= h <= fim) if ini <= fim else (h >= ini or h <= fim)
        ok = dentro and dia in (c.get("dias") or [])
        return ("sim" if ok else "nao"), f"{h} {'dentro' if ok else 'fora'} de {ini}–{fim}"
    if t == "feriado":
        from . import feriados
        m = feriados.motivo_para_nao_rodar(_agora_br().date())
        return ("sim" if m else "nao"), (m or "dia normal")
    if t == "esperar":
        s = int(c.get("segundos") or 0)
        if prazo.get("nuvem"):
            s = min(s, max(0, int(prazo["ate"] - time.time())))
        time.sleep(max(0, min(s, ESPERA_MAX)))
        return "saida", f"esperou {s} s"
    if t == "ar_estado":
        aid = ctx.get("evento", {}).get("aparelho_id") if c.get("aparelho_id") == "evento" else c.get("aparelho_id")
        a = db.um("SELECT id, nome, ligado, modo, temperatura, ventilador, ligado_desde FROM aparelhos WHERE id = ?", (aid,)) if aid else None
        if not a:
            raise RuntimeError("Ar não encontrado.")
        ctx["ar"] = {**a, "ligado": bool(a["ligado"]), "ligado_ha_min": int((db.agora() - a["ligado_desde"]) / 60) if a["ligado"] and a["ligado_desde"] else 0}
        return "saida", f"{a['nome']}: {'ligado' if a['ligado'] else 'desligado'}, {a['temperatura']} °C"
    if t == "clima_fora":
        f = _tempo_fora(c.get("projeto_id"))
        ctx["fora"] = f
        return "saida", f"{f.get('temperatura')} °C, {f.get('tipo')}"
    if t == "definir":
        nome = re.sub(r"[^a-zA-Z0-9_]", "", c.get("nome") or "")[:40] or "valor"
        ctx.setdefault("var", {})[nome] = P("valor")
        return "saida", f"var.{nome} = {ctx['var'][nome]!r}"[:200]
    if t == "ar":
        aid = ctx.get("evento", {}).get("aparelho_id") if c.get("aparelho_id") == "evento" else c.get("aparelho_id")
        if not aid:
            raise RuntimeError("Escolha o ar (ou use o ar do gatilho).")
        estado = {"ligado": c.get("acao") != "desligar"}
        if estado["ligado"]:
            if c.get("modo"):
                estado["modo"] = c["modo"]
            if c.get("temperatura") is not None:
                estado["temperatura"] = int(c["temperatura"])
        r = clima.aplicar(int(aid), origem, **estado)
        return "saida", f"ar {aid}: {'ligado' if r.get('ligado') else 'desligado'}" + (f" {r.get('temperatura')} °C" if r.get("ligado") else "")
    if t == "desligar_todos":
        filtro, p = ("AND projeto_id = ?", (c["projeto_id"],)) if c.get("projeto_id") else ("", ())
        feitos = 0
        for a in db.consultar(f"SELECT id FROM aparelhos WHERE ligado = 1 AND hub_id IS NOT NULL {filtro}", p):
            try:
                clima.aplicar(a["id"], origem, ligado=False); feitos += 1
            except Exception as e:  # noqa: BLE001
                log.warning("fluxo: desligar %s: %s", a["id"], e)
        return "saida", f"{feitos} ar(es) desligado(s)"
    if t == "cena":
        cena = db.um("SELECT * FROM cenas WHERE id = ?", (c.get("cena_id"),))
        if not cena:
            raise RuntimeError("Cena não encontrada.")
        for a in cena["acoes"]:
            clima.aplicar(a["aparelho_id"], origem, ligado=a["ligado"], modo=a.get("modo"), temperatura=a.get("temperatura"), ventilador=a.get("ventilador"))
        return "saida", f"cena {cena['nome']}"
    if t == "dispositivo":
        from . import dispositivos
        r = dispositivos.comando(int(c.get("dispositivo_id") or 0), c.get("acao") or "ligar", origem=origem)
        return "saida", str(r.get("mensagem") or r.get("estado") or "comando enviado")[:200]
    if t == "notificacao":
        from . import notificacoes
        notificacoes.notificar(f"fluxo:{fluxo['id']}:{n['id']}:{int(time.time() // 60)}", "fluxo", c.get("gravidade") or "baixa",
                               (P("titulo") or fluxo["nome"])[:120], P("texto")[:500], "/rotinas?aba=fluxos")
        return "saida", "aviso criado"
    if t == "registrar":
        db.registrar(origem, (P("texto") or "Fluxo")[:200])
        return "saida", "registrado"
    if t == "email":
        from . import correio
        if not correio.configurado():
            raise RuntimeError("E-mail não configurado (E-mails → Conexões).")
        enviados = 0
        for u in _usuarios(c.get("para") or []):
            correio.enviar(u["email"], "alerta", {"titulo": (P("assunto") or fluxo["nome"])[:150], "detalhe": P("texto")[:3000], "gravidade": "media", "link": "/rotinas?aba=fluxos"})
            enviados += 1
        return "saida", f"{enviados} e-mail(s)"
    if t == "telegram":
        from . import telegram
        tg = telegram.cfg()
        if not tg.get("token"):
            raise RuntimeError("Bot do Telegram não configurado.")
        alvo = {str(u["id"]) for u in _usuarios(c.get("para") or [])}
        enviados = 0
        for cid, v in (tg.get("vinculos") or {}).items():
            if str(v.get("usuario_id")) in alvo:
                telegram._enviar(cid, telegram._e(P("texto")[:3500] or fluxo["nome"]))
                enviados += 1
        return "saida", f"{enviados} mensagem(ns)"
    if t == "http":
        import httpx
        url = P("url").strip()
        if not _url_publica(url):
            raise RuntimeError("URL recusada: use https:// para um endereço público da internet.")
        corpo = P("corpo").strip()
        dados = None
        if corpo:
            try:
                dados = json.loads(corpo)
            except ValueError:
                raise RuntimeError("Corpo não é um JSON válido.")
        r = httpx.request(c.get("metodo") or "GET", url, json=dados, timeout=10, follow_redirects=False,
                          headers={"User-Agent": "ClimaEscritorio-Fluxos/1.0"})
        texto = r.text[:5000]
        try:
            j = r.json()
        except ValueError:
            j = None
        ctx["http"] = {"status": r.status_code, "texto": texto, "json": j}
        return "saida", f"HTTP {r.status_code}"
    if t == "ia":
        from . import ia
        txt = ia.gerar("Você ajuda a automatizar um escritório. Responda em português do Brasil, curto e direto, sem markdown.", P("pedido")[:4000], max_tokens=600, temperatura=0.4)
        ctx["ia"] = {"texto": (txt or "").strip()[:3000]}
        return "saida", ctx["ia"]["texto"][:120]
    from . import fluxos_catalogo
    if t in fluxos_catalogo.EXEC:
        return fluxos_catalogo.EXEC[t](fluxo, n, ctx, prazo, P)
    raise RuntimeError(f"Bloco sem execução: {t}")


def _tempo_fora(projeto_id) -> dict:
    from . import clima_externo
    p = db.um("SELECT id FROM projetos WHERE id = ?", (projeto_id,)) if projeto_id else db.um("SELECT id FROM projetos ORDER BY id LIMIT 1")
    try:
        r = clima_externo.agora(p["id"] if p else None, None)
    except AttributeError:   # sem endereço no projeto e sem local salvo: a busca pelo IP precisa de um pedido
        raise RuntimeError("Informe o endereço do projeto (cidade) para saber o tempo lá fora.")
    if not r.get("disponivel", True) and not r.get("temperatura"):
        raise RuntimeError(r.get("motivo") or "Previsão indisponível.")
    return {"temperatura": r.get("temperatura"), "umidade": r.get("umidade"), "sensacao": r.get("sensacao"), "tipo": r.get("tipo"), "cidade": r.get("cidade")}


def executar(fluxo: dict, gatilho_id: str | None, origem: str, ctx_inicial: dict | None = None, nuvem: bool = False) -> dict:
    """Roda o fluxo a partir de um gatilho (ou de todos os gatilhos manuais). Devolve a execução gravada."""
    fid = fluxo["id"]
    with _trava:
        if fid in _rodando:
            return {"estado": "ignorada", "erro": "Este fluxo já está rodando."}
        _rodando.add(fid)
    grafo = fluxo["grafo"] if isinstance(fluxo["grafo"], dict) else json.loads(fluxo["grafo"])
    nos = {n["id"]: n for n in grafo.get("nos", [])}
    saidas: dict[tuple, list] = {}
    for lg in grafo.get("ligacoes", []):
        saidas.setdefault((lg["de"], lg["porta"]), []).append(lg["para"])
    inicio = [gatilho_id] if gatilho_id else [n["id"] for n in nos.values() if n["tipo"] == "gatilho_manual"] or \
        [n["id"] for n in nos.values() if CATALOGO[n["tipo"]]["cat"] == "gatilho"][:1]
    ctx = {"fluxo": {"id": fid, "nome": fluxo["nome"]}, "agora": _agora_br().strftime("%d/%m/%Y %H:%M"), "var": {}, **(ctx_inicial or {})}
    prazo = {"nuvem": nuvem, "ate": time.time() + ESPERA_NUVEM}
    passos, erro, fila, n_passos = [], "", list(inicio), 0
    eid = (db.um("INSERT INTO fluxos_execucoes (fluxo_id, inicio, estado, origem, passos) VALUES (?, ?, 'rodando', ?, CAST('[]' AS jsonb)) RETURNING id",
                 (fid, db.agora(), origem[:60])) or {}).get("id")
    try:
        while fila and n_passos < LIMITE_PASSOS:
            nid = fila.pop(0)
            n = nos.get(nid)
            if not n:
                continue
            n_passos += 1
            t0 = time.time()
            try:
                porta, resumo = _rodar_no(fluxo, n, ctx, prazo)
                passos.append({"no": nid, "tipo": n["tipo"], "ok": True, "porta": porta, "resumo": str(resumo)[:300], "ms": int((time.time() - t0) * 1000)})
            except Exception as e:  # noqa: BLE001  (o erro para este caminho; os outros caminhos continuam)
                passos.append({"no": nid, "tipo": n["tipo"], "ok": False, "erro": str(e)[:300], "ms": int((time.time() - t0) * 1000)})
                erro = erro or f"{CATALOGO[n['tipo']]['rotulo']}: {str(e)[:200]}"
                continue
            if ctx.pop("_parar", False):
                continue
            fila.extend(saidas.get((nid, porta), []))
        if n_passos >= LIMITE_PASSOS:
            erro = erro or f"Parou em {LIMITE_PASSOS} passos (o fluxo tem um laço?)."
    finally:
        with _trava:
            _rodando.discard(fid)
    estado = "erro" if erro else "ok"
    if eid:
        db.executar("UPDATE fluxos_execucoes SET fim = ?, estado = ?, passos = CAST(? AS jsonb), erro = ? WHERE id = ?",
                    (db.agora(), estado, json.dumps(passos, ensure_ascii=False, default=str), erro[:500], eid))
        db.executar("DELETE FROM fluxos_execucoes WHERE fluxo_id = ? AND id NOT IN (SELECT id FROM fluxos_execucoes WHERE fluxo_id = ? ORDER BY id DESC LIMIT 200)", (fid, fid))
    db.executar("UPDATE fluxos SET ultima_exec = ?, execucoes = execucoes + 1, ultimo_estado = ? WHERE id = ?", (db.agora(), estado, fid))
    db.registrar(f"fluxo:{fluxo['nome']}"[:60], f"Fluxo executado: {fluxo['nome']}", ok=not erro, detalhe=(erro or f"{len(passos)} bloco(s) · {origem}")[:300])
    return {"id": eid, "estado": estado, "erro": erro, "passos": passos, "contexto": {k: v for k, v in ctx.items() if k in ("ar", "fora", "http", "ia", "var", "evento", "webhook", "integracao")}}


def _rodar_em_fundo(fluxo, gid, origem, ctx=None):
    threading.Thread(target=lambda: _seguro(executar, fluxo, gid, origem, ctx), daemon=True).start()


def _seguro(f, *a):
    try:
        f(*a)
    except Exception as e:  # noqa: BLE001
        log.warning("fluxo: %s", e)


def _ativos() -> list[dict]:
    return db.consultar("SELECT * FROM fluxos WHERE ativo")


def _gatilhos(fluxo: dict, tipo: str) -> list[dict]:
    g = fluxo["grafo"] if isinstance(fluxo["grafo"], dict) else json.loads(fluxo["grafo"])
    return [n for n in g.get("nos", []) if n["tipo"] == tipo]


def _marcar(fluxo: dict, chave: str, valor) -> bool:
    """Guarda o estado de um gatilho (último disparo). Devolve False se já estava igual (não dispara de novo)."""
    est = fluxo.get("estado") or {}
    if est.get(chave) == valor:
        return False
    est[chave] = valor
    fluxo["estado"] = est
    db.executar("UPDATE fluxos SET estado = CAST(? AS jsonb) WHERE id = ?", (json.dumps(est), fluxo["id"]))
    return True


def ciclo():
    """No agente, a cada ~20 s (agenda.laco): horário, intervalo, ar ligado há N min e temperatura lá fora."""
    agora = _agora_br()
    hoje = (agora.weekday() + 1) % 7
    hhmm = agora.strftime("%H:%M")
    for f in _ativos():
        try:
            for n in _gatilhos(f, "gatilho_horario"):
                c = n["config"]
                if c.get("hora") == hhmm and hoje in (c.get("dias") or []) and _marcar(f, f"h:{n['id']}", agora.strftime("%Y-%m-%d %H:%M")):
                    if c.get("pular_feriado"):
                        from . import feriados
                        m = feriados.motivo_para_nao_rodar(agora.date())
                        if m:
                            db.registrar(f"fluxo:{f['nome']}"[:60], "Fluxo não rodou", detalhe=m)
                            continue
                    _rodar_em_fundo(f, n["id"], "horário")
            for n in _gatilhos(f, "gatilho_intervalo"):
                m = max(5, int(n["config"].get("minutos") or 60))
                fatia = int(time.time() // (m * 60))
                if _marcar(f, f"i:{n['id']}", fatia):
                    _rodar_em_fundo(f, n["id"], f"a cada {m} min")
            for n in _gatilhos(f, "gatilho_ligado_ha"):
                c = n["config"]
                m = int(c.get("minutos") or 60)
                filtro, p = ("AND id = ?", (db.agora() - m * 60, c["aparelho_id"])) if c.get("aparelho_id") else ("", (db.agora() - m * 60,))
                for a in db.consultar(f"SELECT id, nome, ligado_desde FROM aparelhos WHERE ligado = 1 AND ligado_desde <= ? {filtro}", p):
                    if _marcar(f, f"l:{n['id']}:{a['id']}", a["ligado_desde"]):
                        _rodar_em_fundo(f, n["id"], f"{a['nome']} ligado há {m} min", {"evento": {"aparelho_id": a["id"], "nome": a["nome"], "minutos": m}})
            for n in _gatilhos(f, "gatilho_temperatura"):
                c = n["config"]
                if int(time.time() // 600) == (f.get("estado") or {}).get(f"tv:{n['id']}"):
                    continue
                _marcar(f, f"tv:{n['id']}", int(time.time() // 600))
                fora = _tempo_fora(c.get("projeto_id"))
                temp = fora.get("temperatura")
                if temp is None:
                    continue
                passou = temp > float(c.get("valor") or 0) if c.get("sentido") == "acima" else temp < float(c.get("valor") or 0)
                if _marcar(f, f"t:{n['id']}", bool(passou)) and passou:
                    _rodar_em_fundo(f, n["id"], f"rua a {temp} °C", {"fora": fora})
            _gatilhos_catalogo(f)
        except Exception as e:  # noqa: BLE001
            log.warning("fluxo %s: %s", f.get("id"), e)


def _gatilhos_catalogo(f: dict):
    """Gatilhos do catálogo ampliado (fluxos_catalogo.GATILHO): evento por tabela, estado que cruza um limite, tempo."""
    from . import fluxos_catalogo
    g = f["grafo"] if isinstance(f["grafo"], dict) else json.loads(f["grafo"])
    for n in g.get("nos", []):
        fn = fluxos_catalogo.GATILHO.get(n["tipo"])
        if not fn:
            continue
        try:
            for ctx in fn(f, n) or []:
                _rodar_em_fundo(f, n["id"], CATALOGO[n["tipo"]]["rotulo"][:60], ctx)
        except Exception as e:  # noqa: BLE001
            log.warning("fluxo %s gatilho %s: %s", f.get("id"), n["tipo"], e)


def evento_ar(aparelho_id: int, origem: str, ligado: bool):
    """Chamado por automacao.processar_evento (no agente). Ignora o que os próprios fluxos e automações fizeram."""
    if origem.startswith(("fluxo", "automacao")):
        return
    a = db.um("SELECT nome FROM aparelhos WHERE id = ?", (aparelho_id,)) or {}
    for f in _ativos():
        for n in _gatilhos(f, "gatilho_ar"):
            c = n["config"]
            if c.get("aparelho_id") and int(c["aparelho_id"]) != aparelho_id:
                continue
            if c.get("evento") not in ("qualquer", "ligou" if ligado else "desligou"):
                continue
            _rodar_em_fundo(f, n["id"], f"{a.get('nome', 'ar')} {'ligou' if ligado else 'desligou'}",
                            {"evento": {"aparelho_id": aparelho_id, "nome": a.get("nome"), "ligado": ligado, "origem": origem}})


def por_token(token: str) -> tuple[dict, str] | None:
    if not token or len(token) < 16:
        return None
    for f in _ativos():
        for n in _gatilhos(f, "gatilho_webhook"):
            if secrets.compare_digest(str(n["config"].get("token") or ""), token):
                return f, n["id"]
    return None


from . import fluxos_catalogo as _catalogo  # noqa: E402,F401  (registra os blocos ampliados no CATALOGO)
