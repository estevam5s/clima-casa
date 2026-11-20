"""Assistente de IA (NVIDIA NIM) com acesso aos ares, transmissores, agentes, cenas e atividade.

Usado pela tela /ia (painel) e pelo bot do Telegram (mensagem de texto livre). Roda na nuvem e no agente: a chave fica
CIFRADA em config.ia (CHAVES_SENSIVEIS); no agente, cai para NVIDIA_API_KEY do .env se o banco não tiver.

Segurança:
- toda ferramenta age com as permissões de quem pergunta (acesso.atual já definido pela rota ou pelo Telegram):
  projetos, ares de responsabilidade e permissões (aparelhos.controlar etc.);
- comandos de UM ar executam direto (é o mesmo que tocar no botão e dá para desfazer); ações em lote (desligar todos,
  cena) ficam PENDENTES e só rodam com a confirmação explícita da pessoa (nonce de uso único, 5 min, preso a quem pediu);
- nenhum segredo vai para o modelo: as ferramentas devolvem só nomes, estados e mensagens;
- limite de 40 perguntas por hora por pessoa; cada comando vai para a Atividade com origem "ia".
"""
from __future__ import annotations

import json
import os
import secrets
import time

import httpx

from . import db

URL = "https://integrate.api.nvidia.com/v1/chat/completions"
# Catálogo gratuito da NVIDIA (build.nvidia.com) que conversa, testado em 20/11/2026 com a chave do sistema.
# "ferramentas" = aceita function calling (consegue consultar e agir nos ares); sem isso, só responde em texto.
# Fora: embeddings, filtros de segurança, detector de vídeo, calibração, tradução e modelos que deram 404.
CATALOGO = [
    # id, nome, empresa, descrição, ferramentas, ritmo
    ("nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra", "nvidia", "Padrão. Preciso e rápido para controlar os ares", True, "rapido"),
    ("nvidia/nemotron-3.5-lightning-30b-a3b", "Nemotron 3.5 Lightning", "nvidia", "O mais rápido para perguntas do dia a dia", True, "rapido"),
    ("nvidia/nemotron-3.5-super-vl-120b-a12b", "Nemotron 3.5 Super VL", "nvidia", "Equilibrado, entende texto e imagem", True, "rapido"),
    ("nvidia/nemotron-3.5-bolt-e4b", "Nemotron 3.5 Bolt", "nvidia", "Pequeno e muito leve", True, "rapido"),
    ("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", "Nemotron 3 Nano Omni", "nvidia", "Raciocina passo a passo antes de responder", True, "rapido"),
    ("mistralai/mistral-large-4-1t-a52b", "Mistral Large 4", "mistral", "Muito capaz, às vezes mais lento", True, "medio"),
    ("google/gemma-4-31b-it", "Gemma 4 31B", "google", "Modelo aberto do Google, bom em português", True, "rapido"),
    ("meta/muse-glimmer-30b", "Muse Glimmer 30B", "meta", "Modelo da Meta para conversa geral", True, "medio"),
    ("minimaxai/minimax-m3.1-flash", "MiniMax M3.1 Flash", "minimax", "Rápido, bom para resumos", True, "rapido"),
    ("poolside/laguna-xs-2.1", "Laguna XS 2.1", "poolside", "Focado em código e respostas técnicas", True, "rapido"),
    ("moonshotai/kimi-k3.1-pro", "Kimi K3.1 Pro", "kimi", "Raciocínio longo; só responde em texto (não age nos ares)", False, "lento"),
    ("stepfun-ai/step-5-preview", "Step 5 (prévia)", "stepfun", "Prévia; a NVIDIA às vezes demora a responder", False, "instavel"),
    ("z-ai/glm-5.3-flash", "GLM 5.3 Flash", "zai", "A NVIDIA às vezes demora a responder", False, "instavel"),
]
MODELOS = {m[0]: m[1] for m in CATALOGO}
COM_FERRAMENTAS = {m[0] for m in CATALOGO if m[4]}
PADRAO = "nvidia/nemotron-3-ultra-550b-a55b"
RESERVA = "nvidia/nemotron-3.5-lightning-30b-a3b"
LIMITE_HORA = 40
RODADAS = 6


# ---------------- configuração ----------------
def cfg() -> dict:
    return db.cfg("ia") or {}


def chave() -> str:
    return (cfg().get("api_key") or os.environ.get("NVIDIA_API_KEY") or "").strip()


def estado_publico() -> dict:
    c = cfg()
    k = chave()
    return {"configurada": bool(k), "mascara": (k[:6] + "…" + k[-4:]) if len(k) > 12 else "", "modelo": c.get("modelo") or PADRAO,
            "modelos": [{"id": i, "nome": n, "empresa": e, "descricao": d, "ferramentas": f, "ritmo": r} for i, n, e, d, f, r in CATALOGO],
            "ativo": c.get("ativo", True),
            "telegram": c.get("telegram", True)}


def salvar(api_key: str | None, modelo: str | None, ativo: bool | None, telegram: bool | None):
    c = cfg()
    if api_key is not None:
        if api_key == "-":
            c.pop("api_key", None)
        elif api_key.strip():
            c["api_key"] = api_key.strip()
    if modelo:
        if modelo not in MODELOS:
            raise ValueError("Modelo não disponível.")
        c["modelo"] = modelo
    if ativo is not None:
        c["ativo"] = bool(ativo)
    if telegram is not None:
        c["telegram"] = bool(telegram)
    db.set_cfg("ia", c)
    db.registrar("painel", "Assistente de IA configurado", detalhe=c.get("modelo") or PADRAO)


def _limite(uid: str):
    uso = db.cfg("ia_uso") or {}
    agora = time.time()
    lista = [t for t in uso.get(uid, []) if t > agora - 3600]
    if len(lista) >= LIMITE_HORA:
        raise PermissionError(f"Limite de {LIMITE_HORA} perguntas por hora. Tente de novo mais tarde.")
    lista.append(agora)
    uso = {k: [t for t in v if t > agora - 3600] for k, v in uso.items() if k != uid}
    uso[uid] = lista
    db.set_cfg("ia_uso", uso)


# ---------------- ferramentas ----------------
def _u() -> dict:
    from . import acesso
    return acesso.atual.get() or {}


def _ares(ids: list[int] | None = None) -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    extra, pe = ("", ())
    if ids:
        extra, pe = f" AND a.id IN ({','.join('?' * len(ids))})", tuple(ids)
    return db.consultar(
        "SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.ventilador, a.temp_min, a.temp_max, a.hub_id, a.alexa, a.ligado_desde, "
        "p.nome AS projeto, h.nome AS transmissor, h.online AS transmissor_online, "
        "(SELECT count(*) FROM codigos c WHERE c.aparelho_id = a.id) AS botoes, "
        "(SELECT t.executar_em FROM temporizadores t WHERE t.aparelho_id = a.id ORDER BY t.executar_em LIMIT 1) AS temporizador_em "
        f"FROM aparelhos a LEFT JOIN projetos p ON p.id = a.projeto_id LEFT JOIN hubs h ON h.id = a.hub_id WHERE true{f}{fa}{extra} ORDER BY a.nome",
        tuple(p) + pa + pe)


def _resumo_ar(a: dict) -> dict:
    from . import clima
    agora = db.agora()
    r = {"id": a["id"], "nome": a["nome"], "sala": a["projeto"], "ligado": bool(a["ligado"]), "modo": clima.MODOS.get(a["modo"], a["modo"]),
         "temperatura": a["temperatura"], "ventilacao": clima.VENTILACAO.get(a["ventilador"], a["ventilador"]),
         "faixa": f"{a['temp_min']}–{a['temp_max']}°", "transmissor": a["transmissor"] or "sem transmissor (não recebe comandos)",
         "botoes_gravados": a["botoes"], "na_alexa": bool(a["alexa"])}
    if a["ligado"] and a["ligado_desde"]:
        r["ligado_ha_min"] = max(0, (agora - a["ligado_desde"]) // 60)
    if a["temporizador_em"]:
        r["temporizador_em_min"] = max(0, (a["temporizador_em"] - agora) // 60)
    try:
        from . import zonas
        z = zonas.de_aparelho(a["id"])
        if z:
            r["zona"] = f"{z['nome']} ({z['total']} ares iguais mudam juntos)"
    except Exception:  # noqa: BLE001
        pass
    return r


def t_estado_geral() -> dict:
    from . import coordenador, transmissor
    ares = _ares()
    maqs = []
    try:
        maqs = coordenador.maquinas()
    except Exception:  # noqa: BLE001
        pass
    princ = next((m for m in maqs if m.get("principal")), None)
    hubs = db.consultar("SELECT nome, online, problema FROM hubs ORDER BY nome")
    return {"agente": {"online": transmissor.agente_online(), "principal": (princ or {}).get("nome"),
                       "enxerga": f"{(princ or {}).get('ve_transmissores') or 0} de {(princ or {}).get('total_transmissores') or 0} transmissores",
                       "aviso": None if princ and princ.get("ve_transmissores") else transmissor.sem_agente()},
            "transmissores": [{"nome": h["nome"], "online": bool(h["online"]), "problema": h["problema"]} for h in hubs],
            "ares_ligados": [f"{a['nome']} ({a['temperatura']}°)" for a in ares if a["ligado"]],
            "total_ares": len(ares), "hora_brasilia": time.strftime("%d/%m %H:%M", time.gmtime(time.time() - 3 * 3600))}


def t_listar_ares() -> list[dict]:
    return [_resumo_ar(a) for a in _ares()]


def t_transmissores() -> list[dict]:
    hubs = db.consultar("SELECT id, nome, ip, versao, online, problema, visto_em FROM hubs ORDER BY nome")
    ares = _ares()
    return [{"nome": h["nome"], "online": bool(h["online"]), "problema": h["problema"],
             "visto_ha_min": (db.agora() - h["visto_em"]) // 60 if h["visto_em"] else None,
             "ares": [a["nome"] for a in ares if a["hub_id"] == h["id"]]} for h in hubs]


def t_atividade(limite: int = 15, so_falhas: bool = False) -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    rows = db.consultar(f"SELECT t.quando, t.origem, t.acao, t.ok, t.detalhe, a.nome ar FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id "
                        f"WHERE (t.aparelho_id IS NULL OR (true{f}{fa})){' AND t.ok = 0' if so_falhas else ''} ORDER BY t.quando DESC LIMIT ?",
                        tuple(p) + pa + (max(1, min(int(limite), 40)),))
    return [{"quando": time.strftime("%d/%m %H:%M", time.gmtime(r["quando"] - 3 * 3600)), "origem": r["origem"], "acao": r["acao"],
             "ar": r["ar"], "ok": bool(r["ok"]), "detalhe": (r["detalhe"] or "")[:160]} for r in rows]


def t_listar_cenas() -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("projeto_id")
    return db.consultar(f"SELECT id, nome FROM cenas WHERE true{f} ORDER BY nome", tuple(p))


def t_clima_externo() -> dict:
    try:
        from . import clima_externo
        pid = (db.um("SELECT min(id) AS id FROM projetos") or {}).get("id")
        d = clima_externo.agora(pid, None)
        return {k: v for k, v in d.items() if k not in ("proximas", "dias") and not isinstance(v, (list, dict))}
    except Exception as e:  # noqa: BLE001
        return {"erro": str(e)[:120]}


def _checar_ar(aid: int) -> dict:
    from . import acesso
    if not acesso.pode("aparelhos.controlar"):
        raise PermissionError("Seu usuário não tem permissão para controlar os ares.")
    a = _ares([int(aid)])
    if not a:
        raise PermissionError("Este ar não existe ou não está sob sua responsabilidade.")
    return a[0]


def t_comandar_ar(id: int, ligado: bool | None = None, modo: str | None = None, temperatura: int | None = None,
                  ventilacao: str | None = None, origem: str = "ia") -> dict:
    from . import clima
    a = _checar_ar(id)
    if not a["hub_id"]:
        return {"ok": False, "erro": f"{a['nome']} não tem transmissor: não recebe comandos."}
    if modo and modo not in clima.MODOS:
        modo = {"refrigerar": "frio", "aquecer": "quente", "ventilador": "ventilar", "desumidificar": "seco", "automatico": "auto"}.get(modo, modo)
    if ventilacao and ventilacao not in clima.VENTILACAO:
        ventilacao = {"automatica": "auto", "media": "media", "média": "media"}.get(ventilacao, ventilacao)
    if temperatura is not None:
        temperatura = max(a["temp_min"], min(a["temp_max"], int(temperatura)))
    if ligado is None and any(x is not None for x in (modo, temperatura, ventilacao)):
        ligado = True
    try:
        r = clima.aplicar(int(id), origem, ligado=ligado, modo=modo, temperatura=temperatura, ventilador=ventilacao)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "ar": a["nome"], "erro": str(e)[:300]}
    juntos = r.get("juntos") or []
    nomes = [x["nome"] for x in _ares(juntos)] if juntos else []
    return {"ok": True, "ar": a["nome"], "ligado": bool(r.get("ligado")), "modo": clima.MODOS.get(r.get("modo"), r.get("modo")),
            "temperatura": r.get("temperatura"), "ventilacao": clima.VENTILACAO.get(r.get("ventilador"), r.get("ventilador")),
            "mudaram_junto": nomes}


def t_temporizador(id: int, minutos: int, acao: str = "desligar") -> dict:
    from . import automacao
    a = _checar_ar(id)
    automacao.criar_temporizador(int(id), max(1, min(int(minutos), 1440)), {"ligado": acao != "desligar"}, "ia")
    return {"ok": True, "ar": a["nome"], "acao": acao, "em_minutos": int(minutos)}


def _pendente(acao: str, valor, descricao: str) -> dict:
    """Ação em lote: não executa; devolve um pedido de confirmação de uso único preso a quem pediu."""
    u = _u()
    pend = db.cfg("ia_pendentes") or {}
    agora = time.time()
    pend = {k: v for k, v in pend.items() if v.get("expira", 0) > agora}
    n = secrets.token_urlsafe(12)
    pend[n] = {"usuario_id": str(u.get("id")), "acao": acao, "valor": valor, "descricao": descricao, "expira": agora + 300}
    db.set_cfg("ia_pendentes", pend)
    return {"aguardando_confirmacao": True, "confirmacao": n, "descricao": descricao,
            "instrucao": "NÃO foi executado. Diga à pessoa que confirme no botão Confirmar (vale 5 minutos)."}


def t_desligar_todos() -> dict:
    _checar_permissao()
    lig = [a for a in _ares() if a["ligado"] and a["hub_id"]]
    if not lig:
        return {"ok": True, "mensagem": "Nenhum ar ligado entre os que você controla."}
    return _pendente("desligar_todos", None, f"Desligar {len(lig)} ar(es) ligado(s): {', '.join(a['nome'] for a in lig)}")


def t_executar_cena(id: int) -> dict:
    _checar_permissao()
    c = [x for x in t_listar_cenas() if x["id"] == int(id)]
    if not c:
        return {"ok": False, "erro": "Cena não encontrada ou fora das suas salas."}
    return _pendente("cena", int(id), f"Executar a cena {c[0]['nome']}")


def _checar_permissao():
    from . import acesso
    if not acesso.pode("aparelhos.controlar"):
        raise PermissionError("Seu usuário não tem permissão para controlar os ares.")


def confirmar(nonce: str, origem: str = "ia") -> dict:
    """Executa uma ação pendente (só quem pediu, dentro de 5 min, uma vez)."""
    u = _u()
    pend = db.cfg("ia_pendentes") or {}
    p = pend.pop(nonce, None)
    db.set_cfg("ia_pendentes", pend)
    if not p or p.get("expira", 0) < time.time() or p.get("usuario_id") != str(u.get("id")):
        raise PermissionError("Esta confirmação venceu ou não é sua. Peça de novo.")
    _checar_permissao()
    if p["acao"] == "desligar_todos":
        from . import clima
        feitos, falhas, ja = [], [], set()
        for a in [a for a in _ares() if a["ligado"] and a["hub_id"]]:
            if a["id"] in ja:
                feitos.append(a["nome"]); continue
            try:
                r = clima.aplicar(a["id"], origem, ligado=False); feitos.append(a["nome"]); ja.update(r.get("juntos") or [])
            except Exception as e:  # noqa: BLE001
                falhas.append(f"{a['nome']}: {str(e)[:120]}")
        return {"ok": not falhas, "texto": f"{len(feitos)} ar(es) desligado(s)." + (f" Sem resposta: {'; '.join(falhas)}" if falhas else "")}
    if p["acao"] == "cena":
        from .rotas import api as rapi
        r = rapi.executar_cena(int(p["valor"]))
        f = [x for x in r.get("resultados", []) if not x.get("ok")]
        return {"ok": not f, "texto": "Cena executada." if not f else f"Cena executada com {len(f)} falha(s): {f[0].get('erro', '')[:160]}"}
    raise ValueError("Ação desconhecida.")


def _fn(nome, desc, props=None, req=None):
    return {"type": "function", "function": {"name": nome, "description": desc,
                                             "parameters": {"type": "object", "properties": props or {}, "required": req or []}}}


FERRAMENTAS = [
    _fn("estado_geral", "Resumo do sistema agora: agente do escritório (quem está no comando e se enxerga os transmissores), transmissores e ares ligados."),
    _fn("listar_ares", "Todos os ares que a pessoa controla, com id, sala, ligado, modo, temperatura, ventilação, faixa, transmissor, temporizador e zona."),
    _fn("transmissores", "Transmissores infravermelho: online, problema e quais ares cada um atende."),
    _fn("atividade", "Últimos comandos e eventos (quem, de onde, se deu certo).",
        {"limite": {"type": "integer", "description": "1 a 40"}, "so_falhas": {"type": "boolean"}}),
    _fn("listar_cenas", "Cenas disponíveis (id e nome)."),
    _fn("clima_externo", "Tempo lá fora agora (temperatura, umidade, descrição)."),
    _fn("comandar_ar", "Liga, desliga ou ajusta UM ar. Use o id de listar_ares. Executa na hora.",
        {"id": {"type": "integer"}, "ligado": {"type": "boolean"},
         "modo": {"type": "string", "enum": ["frio", "quente", "ventilar", "seco", "auto"]},
         "temperatura": {"type": "integer", "description": "graus Celsius, dentro da faixa do ar"},
         "ventilacao": {"type": "string", "enum": ["auto", "baixa", "media", "alta"]}}, ["id"]),
    _fn("temporizador", "Programa um ar para desligar (ou ligar) daqui a N minutos.",
        {"id": {"type": "integer"}, "minutos": {"type": "integer"}, "acao": {"type": "string", "enum": ["desligar", "ligar"]}}, ["id", "minutos"]),
    _fn("desligar_todos", "Pede para desligar TODOS os ares ligados. Não executa: gera um pedido que a pessoa confirma no botão."),
    _fn("executar_cena", "Pede para executar uma cena. Não executa: a pessoa confirma no botão.", {"id": {"type": "integer"}}, ["id"]),
]
def t_relatorio(dias: int = 7) -> dict:
    from . import acesso, relatorio
    if not acesso.pode("relatorios.ver"):
        return {"erro": "sem permissão para relatórios"}
    fim = db.agora(); d = relatorio.montar(fim - max(1, min(int(dias), 90)) * 86400, fim)
    return {"resumo": d["resumo"], "conclusoes": [c["texto"] for c in d.get("conclusoes", [])][:6],
            "por_ar": [{k: a[k] for k in ("nome", "comandos", "horas_ligado", "custo")} for a in d["por_aparelho"][:12]]}


def t_listar_salas() -> list[dict]:
    lst = _ares()
    salas = {}
    for a in lst:
        s = salas.setdefault(a.get("projeto") or "Sem sala", {"sala": a.get("projeto") or "Sem sala", "ares": 0, "ligados": 0})
        s["ares"] += 1; s["ligados"] += 1 if a.get("ligado") else 0
    return list(salas.values())


def t_agentes() -> list[dict]:
    from . import coordenador
    return [{k: m.get(k) for k in ("nome", "online", "principal", "ve_transmissores", "total_transmissores")} for m in coordenador.maquinas()]


def t_zonas() -> list[dict]:
    from . import zonas
    ids = {a["id"]: a["nome"] for a in _ares()}
    return [{"nome": z["nome"], "ares": [ids[i] for i in z.get("aparelhos", []) if i in ids]} for z in zonas.listar() if set(z.get("aparelhos", [])) & set(ids)]


def t_dispositivos() -> list[dict]:
    from . import dispositivos
    from .rotas import dispositivos as rd
    f, p = rd._escopo()
    return [{"nome": d["nome"], "tipo": d["tipo"], "conectado": d["conectado"], "estado": d.get("resumo")} for d in dispositivos.listar(None, f, p)][:40]


def t_notificacoes() -> list[dict]:
    from . import notificacoes
    from .rotas import api as rapi
    r = notificacoes.listar("todas", 30); vis = rapi._visibilidade_notificacoes()
    return [{"titulo": n["titulo"], "detalhe": (n.get("detalhe") or "")[:160], "gravidade": n["gravidade"], "lida": n["lida"]} for n in r["itens"] if vis is None or vis(n)][:8]


FERRAMENTAS += [
    _fn("relatorio", "Resumo de uso, consumo (kWh), custo e conclusões dos últimos N dias.", {"dias": {"type": "integer"}}),
    _fn("listar_salas", "Salas (projetos) com quantos ares e quantos ligados."),
    _fn("agentes", "Computadores do escritório com o agente: online, quem está no comando e quantos transmissores enxerga."),
    _fn("zonas", "Zonas: ares iguais no mesmo transmissor que mudam juntos."),
    _fn("dispositivos", "Luzes, persianas, cafeteira e fechadura com o estado de cada um."),
    _fn("notificacoes", "Últimas notificações do sistema."),
]

EXECUTORES = {"relatorio": t_relatorio, "listar_salas": t_listar_salas, "agentes": t_agentes, "zonas": t_zonas, "dispositivos": t_dispositivos, "notificacoes": t_notificacoes,"estado_geral": t_estado_geral, "listar_ares": t_listar_ares, "transmissores": t_transmissores, "atividade": t_atividade,
              "listar_cenas": t_listar_cenas, "clima_externo": t_clima_externo, "comandar_ar": t_comandar_ar, "temporizador": t_temporizador,
              "desligar_todos": t_desligar_todos, "executar_cena": t_executar_cena}


def _sistema(canal: str) -> str:
    u = _u()
    return (
        "Você é o assistente do Clima Escritório, sistema que controla os ares-condicionados de um escritório por infravermelho "
        "(transmissores Tuya SRW-004). Responda SEMPRE em português do Brasil, curto e direto, sem emoji, sem travessão e sem inventar dados.\n"
        + ("Formato: Telegram. Não use tabelas nem títulos; use frases curtas e listas com '- '. Negrito com **texto** é permitido.\n"
           if canal == "telegram" else "Formato: Markdown simples (negrito, listas e tabelas pequenas).\n") +
        f"Quem fala com você: {u.get('nome') or u.get('email') or 'usuário'} (papel {u.get('papel', '?')}). Canal: {canal}.\n"
        "Regras:\n"
        "- Para saber estados, nomes ou ids, chame as ferramentas; nunca chute um id. Se o nome for ambíguo, pergunte qual.\n"
        "- Para mudar UM ar use comandar_ar (executa na hora) e diga o resultado real que a ferramenta devolveu, inclusive erros.\n"
        "- Desligar todos e cenas só geram pedido de confirmação: avise que a pessoa precisa tocar em Confirmar.\n"
        "- O ar não informa o estado de volta: diga 'enviado', nunca 'confirmado' nem 'o ar está em'; o estado mostrado é o do último comando. Ares iguais à vista do mesmo transmissor "
        "mudam juntos (zona); avise quando a ferramenta disser mudaram_junto.\n"
        "- Sem agente no escritório enxergando os transmissores, nenhum comando chega ao ar: explique e sugira ligar o computador "
        "do escritório ou o Raspberry Pi.\n"
        "- Temperatura confortável e econômica: 23 a 24 °C. Sugira, nunca imponha.\n"
        "- Não fale de chaves, senhas ou tokens; você não tem acesso a eles."
    )


def _chamar_modelo(msgs: list[dict], modelo: str) -> dict:
    k = chave()
    if not k:
        raise RuntimeError("O assistente de IA não está configurado (falta a chave da NVIDIA em IA → Configuração).")
    ultimo = None
    for m in (modelo, RESERVA) if modelo != RESERVA else (modelo,):
        corpo = {"model": m, "messages": msgs, "temperature": 0.2, "max_tokens": 900}
        if m in COM_FERRAMENTAS:   # modelo sem function calling recusa "tools" (400): responde só em texto
            corpo["tools"] = FERRAMENTAS
        try:
            r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, json=corpo, timeout=50)
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]
            ultimo = f"{r.status_code} {r.text[:160]}"
        except httpx.HTTPError as e:
            ultimo = str(e)[:160]
    raise RuntimeError(f"A IA da NVIDIA não respondeu agora ({ultimo}). Tente de novo.")


def conversar(historico: list[dict], canal: str = "painel", origem: str = "ia", modelo: str | None = None) -> dict:
    """Uma rodada de conversa. `historico` = [{role: user|assistant, content}] (o último é a pergunta).
    Devolve {texto, acoes: [...feitas], confirmacoes: [{confirmacao, descricao}]}."""
    u = _u()
    _limite(str(u.get("id") or "anon"))
    c = cfg()
    if c.get("ativo") is False:
        raise RuntimeError("O assistente de IA está desligado (IA → Configuração).")
    modelo = modelo if modelo in MODELOS else (c.get("modelo") or PADRAO)
    msgs = [{"role": "system", "content": _sistema(canal)}]
    for h in historico[-16:]:
        if h.get("role") in ("user", "assistant") and isinstance(h.get("content"), str):
            msgs.append({"role": h["role"], "content": h["content"][:3000]})
    acoes, confirmacoes = [], []
    for _ in range(RODADAS):
        m = _chamar_modelo(msgs, modelo)
        chamadas = m.get("tool_calls") or []
        if not chamadas:
            texto = (m.get("content") or "").strip() or "Feito."
            pergunta = next((h["content"] for h in reversed(historico) if h.get("role") == "user"), "")
            db.registrar(origem, "Conversa com a IA", detalhe=f"{u.get('nome') or u.get('email') or '-'}: {pergunta[:120]}")
            return {"texto": texto, "acoes": acoes, "confirmacoes": confirmacoes, "modelo": modelo}
        msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": chamadas})
        for ch in chamadas:
            nome = ch["function"]["name"]
            try:
                args = json.loads(ch["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            fn = EXECUTORES.get(nome)
            try:
                if not fn:
                    raise ValueError("ferramenta inexistente")
                if nome == "comandar_ar":
                    args["origem"] = origem
                res = fn(**{k: v for k, v in args.items() if k in fn.__code__.co_varnames})
            except Exception as e:  # noqa: BLE001
                res = {"ok": False, "erro": str(e)[:300]}
            if nome in ("comandar_ar", "temporizador") and isinstance(res, dict):
                acoes.append({"ferramenta": nome, **{k: v for k, v in res.items() if k != "origem"}})
            if isinstance(res, dict) and res.get("aguardando_confirmacao"):
                confirmacoes.append({"confirmacao": res["confirmacao"], "descricao": res["descricao"]})
            msgs.append({"role": "tool", "tool_call_id": ch.get("id"), "content": json.dumps(res, ensure_ascii=False, default=str)[:6000]})
    return {"texto": "Precisei de muitas consultas para responder. Pergunte de um jeito mais direto.", "acoes": acoes,
            "confirmacoes": confirmacoes, "modelo": modelo}
