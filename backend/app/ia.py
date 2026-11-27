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
import re
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
COM_VISAO = {"nvidia/nemotron-3.5-super-vl-120b-a12b", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"}
OUVE = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"   # entende áudio: transcreve as mensagens de voz
ESTILOS = {
    "normal": "",
    "conciso": "\nEstilo pedido: CONCISO. Responda no menor número de frases possível, sem introdução.",
    "explicativo": "\nEstilo pedido: EXPLICATIVO. Explique o porquê de cada passo, com exemplos curtos, como para alguém aprendendo.",
    "formal": "\nEstilo pedido: FORMAL. Linguagem formal e técnica, adequada a relatório para a direção.",
}
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


# ---------------- comparar modelos e saúde do catálogo ----------------
def _perguntar_texto(modelo: str, pergunta: str, max_tokens: int = 700, timeout: float = 45) -> dict:
    """Uma pergunta só, SEM ferramentas (não consulta nem age nos ares): para comparar como cada modelo responde."""
    t0 = time.time()
    try:
        r = httpx.post(URL, headers={"Authorization": f"Bearer {chave()}"}, timeout=timeout, json={
            "model": modelo, "max_tokens": max_tokens, "temperature": 0.4,
            "messages": [{"role": "system", "content": "Responda em português do Brasil, de forma direta. Você não tem acesso aos aparelhos nesta comparação."},
                         {"role": "user", "content": pergunta}]})
        ms = round((time.time() - t0) * 1000)
        if r.status_code != 200:
            return {"modelo": modelo, "ok": False, "ms": ms, "erro": f"a NVIDIA respondeu {r.status_code}"}
        j = r.json()
        return {"modelo": modelo, "ok": True, "ms": ms, "texto": (j["choices"][0]["message"].get("content") or "").strip(),
                "tokens": (j.get("usage") or {}).get("total_tokens")}
    except httpx.HTTPError as e:
        return {"modelo": modelo, "ok": False, "ms": round((time.time() - t0) * 1000), "erro": "demorou demais" if isinstance(e, httpx.TimeoutException) else type(e).__name__}


def comparar(pergunta: str, modelos: list[str]) -> list[dict]:
    from concurrent.futures import ThreadPoolExecutor
    if not chave():
        raise RuntimeError("A IA ainda não foi configurada (chave da NVIDIA).")
    validos = [m for m in modelos if m in MODELOS][:3]
    if len(validos) < 2:
        raise RuntimeError("Escolha de 2 a 3 modelos do catálogo.")
    u = _u()
    _limite(str(u.get("id") or "anon"))   # a comparação conta como uma pergunta no limite por hora
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(lambda m: _perguntar_texto(m, pergunta), validos))
    for r in res:
        r["nome"] = next((c[1] for c in CATALOGO if c[0] == r["modelo"]), r["modelo"])
    return res


def saude_modelos(forcar: bool = False) -> dict:
    """Quais modelos do catálogo respondem agora e em quanto tempo (pergunta curtinha). Guardado 10 min."""
    from concurrent.futures import ThreadPoolExecutor
    guardado = db.cfg("ia_saude_modelos") or {}
    if not forcar and guardado.get("em", 0) > time.time() - 600:
        return guardado
    if not chave():
        raise RuntimeError("A IA ainda não foi configurada (chave da NVIDIA).")
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda c: _perguntar_texto(c[0], "Diga apenas: ok", max_tokens=8, timeout=20), CATALOGO))
    out = {"em": int(time.time()), "modelos": [{"modelo": r["modelo"], "ok": r["ok"], "ms": r["ms"], "erro": r.get("erro")} for r in res]}
    db.set_cfg("ia_saude_modelos", out)
    return out


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
    if p["acao"] in ("desligar_todos", "cena"):
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
    if p["acao"] in ("criar_usuario", "editar_usuario", "encerrar_sessoes"):
        _exigir("usuarios.gerenciar", "Seu usuário não gerencia contas.")
        from fastapi import HTTPException
        from .rotas import contas
        try:
            if p["acao"] == "criar_usuario":
                v = p["valor"]
                contas.criar_usuario(contas.UsuarioIn(nome=v["nome"], email=v["email"], papel=v["papel"], acesso="todos", convite=True), _req())
                return {"ok": True, "texto": f"Conta criada para {v['email']}. O convite foi enviado por e-mail."}
            if p["acao"] == "encerrar_sessoes":
                n = contas.encerrar_sessoes_usuario(p["valor"], _req())
                return {"ok": True, "texto": f"{n.get('encerradas', 0)} sessão(ões) encerrada(s)."}
            v = p["valor"]
            alvo = db.um("SELECT * FROM usuarios WHERE id = ?", (v["id"],))
            from . import acesso
            proj = acesso._json(alvo["projetos"], "*")
            papel = v.get("papel") or alvo["papel"]
            contas.editar_usuario(v["id"], contas.UsuarioEdit(
                nome=alvo["nome"] or alvo["email"], cargo=alvo.get("cargo") or "", papel=papel,
                permissoes=acesso.PAPEIS[papel]["permissoes"] if v.get("papel") else (acesso._json(alvo["permissoes"], []) or []),
                acesso="todos" if proj == "*" else "escolher", projetos=[] if proj == "*" else proj,
                ativo=alvo["ativo"] if v.get("ativo") is None else bool(v["ativo"])), _req())
            return {"ok": True, "texto": "Conta atualizada."}
        except HTTPException as e:
            raise PermissionError(str(e.detail))
    if p["acao"] == "executar_fluxo":
        from . import fluxos, transmissor
        f = db.um("SELECT * FROM fluxos WHERE id = ?", (int(p["valor"]),))
        if not f:
            raise ValueError("Fluxo não encontrado.")
        r = fluxos.executar(f, None, f"assistente de IA · {u.get('nome') or u.get('email')}", None, nuvem=transmissor.PAPEL == "nuvem")
        return {"ok": r.get("estado") == "ok", "texto": f"Fluxo rodou: {len(r.get('passos') or [])} bloco(s)." + (f" Erro: {r['erro']}" if r.get("erro") else "")}
    if p["acao"] == "ligar_fluxo":
        _exigir("automacoes.gerenciar", "Seu usuário não gerencia fluxos.")
        from .rotas import fluxos as rf
        rf.ligar(int(p["valor"]["id"]), rf.AtivoIn(ativo=bool(p["valor"]["ativo"])))
        return {"ok": True, "texto": "Fluxo " + ("ligado." if p["valor"]["ativo"] else "desligado.")}
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


# ================= 0.7.6: usuários, fluxos e bugs (com as permissões de quem pergunta) =================
def _req():
    """Pedido 'falso' para reaproveitar as rotas de contas (elas leem request.state.u) com as checagens de papel delas."""
    from types import SimpleNamespace
    from . import acesso
    return SimpleNamespace(state=SimpleNamespace(u=acesso.atual.get() or {}, usuario={}))


def _exigir(perm: str, texto: str):
    from . import acesso
    if not acesso.pode(perm):
        raise PermissionError(texto)


def _usuario_por_email(email: str) -> dict:
    u = db.um("SELECT * FROM usuarios WHERE lower(email) = lower(?)", ((email or "").strip(),))
    if not u:
        raise ValueError(f"Nenhum usuário com o e-mail {email}.")
    return u


def t_listar_usuarios() -> list[dict]:
    _exigir("usuarios.gerenciar", "Seu usuário não gerencia contas.")
    from .rotas import contas
    r = contas.listar_usuarios(_req())
    return [{k: x.get(k) for k in ("nome", "email", "papel", "ativo", "ultimo_login", "dois_fatores", "pode_editar")} for x in r["itens"]][:80]


def t_convidar_usuario(nome: str, email: str, papel: str = "visualizador") -> dict:
    _exigir("usuarios.gerenciar", "Seu usuário não gerencia contas.")
    from . import acesso
    if papel not in acesso.PAPEIS or papel == "dono":
        return {"ok": False, "erro": f"Papel inválido. Use: {', '.join(k for k in acesso.PAPEIS if k != 'dono')}."}
    if not acesso.email_permitido(email):
        return {"ok": False, "erro": f"Só e-mails @{acesso.DOMINIO_LOGIN} entram no sistema."}
    return _pendente("criar_usuario", {"nome": nome[:80], "email": email.strip().lower(), "papel": papel},
                     f"Convidar {nome} ({email}) como {acesso.PAPEIS[papel]['rotulo']}: ele recebe um e-mail para criar a senha")


def t_mudar_usuario(email: str, papel: str | None = None, ativo: bool | None = None) -> dict:
    _exigir("usuarios.gerenciar", "Seu usuário não gerencia contas.")
    from . import acesso
    u = _usuario_por_email(email)
    if papel and papel not in acesso.PAPEIS:
        return {"ok": False, "erro": "Papel inválido."}
    partes = ([f"papel {acesso.PAPEIS[papel]['rotulo']}"] if papel else []) + (["reativar" if ativo else "desativar"] if ativo is not None else [])
    if not partes:
        return {"ok": False, "erro": "Diga o que mudar: papel ou ativo."}
    return _pendente("editar_usuario", {"id": str(u["id"]), "papel": papel, "ativo": ativo}, f"{u['nome'] or u['email']}: " + " e ".join(partes))


def t_encerrar_sessoes(email: str) -> dict:
    _exigir("usuarios.gerenciar", "Seu usuário não gerencia contas.")
    u = _usuario_por_email(email)
    return _pendente("encerrar_sessoes", str(u["id"]), f"Encerrar todas as sessões de {u['nome'] or u['email']} (ele precisa entrar de novo)")


def t_listar_fluxos() -> list[dict]:
    from .rotas import fluxos as rf
    return [{k: f[k] for k in ("id", "nome", "ativo", "gatilhos", "blocos", "ultimo_estado", "execucoes")} for f in rf.listar()][:50]


def t_executar_fluxo(id: int) -> dict:
    _exigir("aparelhos.controlar", "Seu usuário não roda fluxos.")
    f = db.um("SELECT id, nome FROM fluxos WHERE id = ?", (int(id),))
    if not f:
        return {"ok": False, "erro": "Fluxo não encontrado."}
    return _pendente("executar_fluxo", int(id), f"Executar agora o fluxo {f['nome']}")


def t_ligar_fluxo(id: int, ativo: bool) -> dict:
    _exigir("automacoes.gerenciar", "Seu usuário não gerencia fluxos.")
    f = db.um("SELECT id, nome FROM fluxos WHERE id = ?", (int(id),))
    if not f:
        return {"ok": False, "erro": "Fluxo não encontrado."}
    return _pendente("ligar_fluxo", {"id": int(id), "ativo": bool(ativo)}, f"{'Ligar' if ativo else 'Desligar'} o fluxo {f['nome']}")


def t_listar_bugs(estado: str = "aberto") -> list[dict]:
    rows = db.consultar("SELECT id, titulo, gravidade, estado, ocorrencias, atualizado_em FROM bugs WHERE (? = 'todos' OR estado = ?) ORDER BY atualizado_em DESC LIMIT 30",
                        (estado, estado))
    return rows


def t_agendamentos() -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    return db.consultar(f"SELECT g.id, g.nome, g.hora, g.dias, g.ativo, a.nome AS ar FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id WHERE true{f} ORDER BY g.hora", p)[:60]


FERRAMENTAS += [
    _fn("listar_usuarios", "Contas do sistema (nome, e-mail, papel, ativo, último login). Só quem gerencia usuários."),
    _fn("convidar_usuario", "Pede para criar uma conta e mandar o convite por e-mail. Não executa: a pessoa confirma.",
        {"nome": {"type": "string"}, "email": {"type": "string"}, "papel": {"type": "string", "enum": ["admin", "subadmin", "operador", "visualizador"]}}, ["nome", "email"]),
    _fn("mudar_usuario", "Pede para mudar o papel de uma conta ou desativar/reativar. Não executa: a pessoa confirma.",
        {"email": {"type": "string"}, "papel": {"type": "string", "enum": ["admin", "subadmin", "operador", "visualizador"]}, "ativo": {"type": "boolean"}}, ["email"]),
    _fn("encerrar_sessoes", "Pede para derrubar todas as sessões de uma conta (celular perdido, desligamento). A pessoa confirma.", {"email": {"type": "string"}}, ["email"]),
    _fn("listar_fluxos", "Fluxos de Rotinas → Fluxos (blocos estilo N8N): id, nome, ligado, gatilhos e última execução."),
    _fn("executar_fluxo", "Pede para rodar um fluxo agora. A pessoa confirma.", {"id": {"type": "integer"}}, ["id"]),
    _fn("ligar_fluxo", "Pede para ligar ou desligar um fluxo. A pessoa confirma.", {"id": {"type": "integer"}, "ativo": {"type": "boolean"}}, ["id", "ativo"]),
    _fn("listar_bugs", "Bugs registrados no sistema.", {"estado": {"type": "string", "enum": ["aberto", "corrigido", "descartado", "todos"]}}),
    _fn("agendamentos", "Agendamentos (horário, dias, ar, ligado)."),
]
EXECUTORES.update({"listar_usuarios": t_listar_usuarios, "convidar_usuario": t_convidar_usuario, "mudar_usuario": t_mudar_usuario,
                   "encerrar_sessoes": t_encerrar_sessoes, "listar_fluxos": t_listar_fluxos, "executar_fluxo": t_executar_fluxo,
                   "ligar_fluxo": t_ligar_fluxo, "listar_bugs": t_listar_bugs, "agendamentos": t_agendamentos})

# Ferramentas que rodam no COMPUTADOR de quem usa o clima-ia (terminal): o servidor só repassa o pedido; o terminal executa,
# pede o "sim" da pessoa quando muda algo e devolve o resultado (POST /api/ia/continuar). Nunca rodam no servidor.
FERRAMENTAS_LOCAIS = [
    _fn("ler_arquivo", "Lê um arquivo de texto no computador de quem usa o terminal.", {"caminho": {"type": "string"}, "inicio": {"type": "integer"}, "fim": {"type": "integer"}}, ["caminho"]),
    _fn("listar_pasta", "Lista arquivos e pastas.", {"caminho": {"type": "string"}}),
    _fn("buscar_texto", "Procura um texto (ou expressão regular) nos arquivos de uma pasta.", {"padrao": {"type": "string"}, "pasta": {"type": "string"}}, ["padrao"]),
    _fn("escrever_arquivo", "Cria ou substitui um arquivo inteiro. A pessoa aprova antes (menos no modo aceitar ações).", {"caminho": {"type": "string"}, "conteudo": {"type": "string"}}, ["caminho", "conteudo"]),
    _fn("editar_arquivo", "Troca um trecho exato de um arquivo por outro. A pessoa aprova antes.", {"caminho": {"type": "string"}, "procurar": {"type": "string"}, "trocar": {"type": "string"}}, ["caminho", "procurar", "trocar"]),
    _fn("executar_comando", "Roda um comando no terminal da pessoa (bash/PowerShell). Sempre pede o sim dela antes.", {"comando": {"type": "string"}, "pasta": {"type": "string"}}, ["comando"]),
    _fn("baixar_relatorio", "Salva o relatório do sistema num arquivo no computador (pdf, docx, xlsx, csv, html, md, json).",
        {"formato": {"type": "string", "enum": ["pdf", "docx", "xlsx", "csv", "html", "md", "json"]}, "dias": {"type": "integer"}, "caminho": {"type": "string"}}, ["formato"]),
]
NOMES_LOCAIS = {f["function"]["name"] for f in FERRAMENTAS_LOCAIS}
LOCAIS_MUDAM = {"escrever_arquivo", "editar_arquivo", "executar_comando", "baixar_relatorio"}


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


ACOES_IA = {"comandar_ar", "temporizador", "desligar_todos", "executar_cena", "convidar_usuario", "mudar_usuario", "encerrar_sessoes",
            "executar_fluxo", "ligar_fluxo", *LOCAIS_MUDAM}   # o que muda algo (fora no modo plano)


def _chamar_modelo(msgs: list[dict], modelo: str, leitura: bool = False, pensar: bool = False, locais: list[str] | None = None) -> dict:
    k = chave()
    if not k:
        raise RuntimeError("O assistente de IA não está configurado (falta a chave da NVIDIA em IA → Configuração).")
    ultimo = None
    for m in (modelo, RESERVA) if modelo != RESERVA else (modelo,):
        # raciocínio estendido só quando a pessoa liga ("Pensar mais"): sem ele a resposta sai mais rápido e não gasta
        # os tokens pensando (os modelos que pensam por padrão devolviam resposta vazia com finish_reason "length")
        corpo = {"model": m, "messages": msgs, "temperature": 0.2, "max_tokens": 3500 if pensar else 1200,
                 "chat_template_kwargs": {"enable_thinking": bool(pensar)}}
        if m in COM_FERRAMENTAS:   # modelo sem function calling recusa "tools" (400): responde só em texto
            corpo["tools"] = [f for f in FERRAMENTAS + [x for x in FERRAMENTAS_LOCAIS if x["function"]["name"] in (locais or [])]
                              if not (leitura and f["function"]["name"] in ACOES_IA)]
        try:
            r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, json=corpo, timeout=50)
            if r.status_code == 400 and "chat_template" in r.text:   # modelo que não aceita o ajuste: manda sem ele
                corpo.pop("chat_template_kwargs", None)
                r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, json=corpo, timeout=50)
            if r.status_code == 200:
                j = r.json()
                msg = j["choices"][0]["message"]
                uso = j.get("usage") or {}
                # tokens desta chamada (para os limites de 5 h e semanal); sem "usage", estima por caracteres (~4 por token)
                msg["_tokens"] = int(uso.get("total_tokens") or (len(json.dumps(msg_lista_txt(msgs))) + len(msg.get("content") or "")) // 4)
                msg["_modelo"] = m
                return msg
            ultimo = f"{r.status_code} {r.text[:160]}"
        except httpx.HTTPError as e:
            ultimo = str(e)[:160]
    raise RuntimeError(f"A IA da NVIDIA não respondeu agora ({ultimo}). Tente de novo.")


def preferencias(uid: str) -> dict:
    return {"estilo": "normal", "instrucoes": "", "pensar": False, "voz": False, **(db.cfg(f"ia_pref:{uid}") or {})} if uid else {"estilo": "normal", "instrucoes": ""}


def salvar_preferencias(uid: str, d: dict) -> dict:
    p = preferencias(uid)
    for k in ("estilo", "instrucoes", "pensar", "voz", "chamar", "trabalho", "esforco", "fonte", "largura", "notificar", "agir", "sugestoes"):
        if d.get(k) is not None:
            p[k] = d[k]
    if p["estilo"] not in ESTILOS:
        p["estilo"] = "normal"
    p["instrucoes"] = str(p.get("instrucoes") or "")[:1500]
    db.set_cfg(f"ia_pref:{uid}", p)
    return p


def transcrever(audio_b64: str, formato: str = "wav") -> str:
    """Mensagem de voz → texto, pelo modelo da NVIDIA que entende áudio (funciona em qualquer navegador, inclusive no Brave,
    que não tem o reconhecimento de voz do Chrome)."""
    k = chave()
    if not k:
        raise RuntimeError("A IA não está configurada (falta a chave da NVIDIA).")
    corpo = {"model": OUVE, "temperature": 0, "max_tokens": 600, "chat_template_kwargs": {"enable_thinking": False},
             "messages": [{"role": "user", "content": [
                 {"type": "text", "text": "Transcreva literalmente este áudio em português do Brasil. Escreva números como algarismos (vinte e três = 23). "
                                          "Responda SÓ com a transcrição, sem comentários. Se não houver fala, responda exatamente: [sem fala]"},
                 {"type": "input_audio", "input_audio": {"data": audio_b64, "format": formato}}]}]}
    try:
        r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, json=corpo, timeout=55)
    except httpx.HTTPError as e:
        raise RuntimeError(f"A transcrição não respondeu agora ({str(e)[:80]}). Tente de novo.") from e
    if r.status_code != 200:
        raise RuntimeError(f"A transcrição falhou ({r.status_code}). Tente de novo ou digite a mensagem.")
    txt = (r.json()["choices"][0]["message"].get("content") or "").strip()
    txt = re.sub(r"<think>.*?</think>", "", txt, flags=re.S).strip().strip('"')
    if not txt or txt == "[sem fala]":
        raise RuntimeError("Não deu para entender a fala. Grave de novo, mais perto do microfone.")
    return txt[:3000]


def gerar(sistema: str, pedido: str, modelo: str | None = None, max_tokens: int = 3000, temperatura: float = 0.3, sem_pensar: bool = True) -> str:
    """Texto livre, sem ferramentas (tradução do site, newsletter). Mesmo catálogo e reserva do assistente.
    sem_pensar: desliga o raciocínio dos modelos que "pensam" antes (senão eles gastam todos os tokens pensando e a resposta
    vem vazia, com finish_reason "length")."""
    k = chave()
    if not k:
        raise RuntimeError("A IA não está configurada (falta a chave da NVIDIA em Assistente de IA → Configuração).")
    ultimo = None
    alvo = modelo if modelo in MODELOS else (cfg().get("modelo") or PADRAO)
    for m in (alvo, RESERVA) if alvo != RESERVA else (alvo,):
        try:
            corpo = {"model": m, "temperature": temperatura, "max_tokens": max_tokens,
                     "messages": [{"role": "system", "content": ("/no_think\n" if sem_pensar else "") + sistema}, {"role": "user", "content": pedido}]}
            if sem_pensar:
                corpo["chat_template_kwargs"] = {"enable_thinking": False}
            r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, timeout=55, json=corpo)
            if r.status_code == 400 and sem_pensar:   # modelo que não aceita o ajuste: tenta sem ele
                corpo.pop("chat_template_kwargs", None)
                r = httpx.post(URL, headers={"Authorization": f"Bearer {k}", "Accept": "application/json"}, timeout=55, json=corpo)
            if r.status_code == 200:
                txt = (r.json()["choices"][0]["message"].get("content") or "").strip()
                if txt:
                    return txt
                ultimo = "resposta vazia"
            else:
                ultimo = f"{r.status_code} {r.text[:160]}"
        except httpx.HTTPError as e:
            ultimo = str(e)[:160]
    raise RuntimeError(f"A IA da NVIDIA não respondeu agora ({ultimo}). Tente de novo.")


def json_da_resposta(txt: str):
    """Tira o JSON de uma resposta (com ou sem cerca ```json, com ou sem raciocínio antes)."""
    t = re.sub(r"<think>.*?</think>", "", txt, flags=re.S).strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.S)
    if m:
        t = m.group(1).strip()
    for abre, fecha in (("{", "}"), ("[", "]")):
        i, j = t.find(abre), t.rfind(fecha)
        if i >= 0 and j > i:
            try:
                return json.loads(t[i:j + 1])
            except ValueError:
                continue
    raise ValueError("A IA não devolveu JSON válido.")


def msg_lista_txt(msgs: list[dict]) -> list[str]:
    return [str(m.get("content") or "") for m in msgs]


def conversar(historico: list[dict], canal: str = "painel", origem: str = "ia", modelo: str | None = None, leitura: bool = False,
              estilo: str | None = None, pensar: bool = False, imagens: list[str] | None = None, projeto: dict | None = None,
              esforco: str | None = None, locais: list[str] | None = None) -> dict:
    """Uma rodada de conversa. `historico` = [{role: user|assistant, content}] (o último é a pergunta).
    Devolve {texto, acoes: [...feitas], confirmacoes: [{confirmacao, descricao}]}."""
    u = _u()
    from . import ia_uso
    ia_uso.checar(u)                      # limites de sessão (5 h) e semanal, definidos pelo dono
    _limite(str(u.get("id") or "anon"))   # e o freio de rajada (perguntas por hora)
    c = cfg()
    if c.get("ativo") is False:
        raise RuntimeError("O assistente de IA está desligado (IA → Configuração).")
    modelo = modelo if modelo in MODELOS else (c.get("modelo") or PADRAO)
    # prompt injection: tentar trocar as regras, pedir segredos ou o prompt do sistema → recusa e evento de segurança
    from . import defesa
    pergunta = next((h.get("content") for h in reversed(historico) if h.get("role") == "user"), "") or ""
    trecho = defesa.prompt_injection(pergunta)
    if trecho:
        from . import firewall
        firewall.registrar(f"{canal}:{u.get('id') or 'anon'}", "prompt_injection", f"/ia ({canal})", f"{u.get('nome') or u.get('email') or '-'}: {trecho}")
        db.registrar(origem, "Pedido recusado pelo Assistente (tentativa de mudar as regras)", ok=False, detalhe=trecho[:120])
        return {"texto": "Não posso fazer isso: o pedido tenta mudar as minhas regras ou pede informações protegidas. Posso ajudar com os ares, as salas e os relatórios.",
                "acoes": [], "confirmacoes": [], "modelo": modelo, "recusado": True}
    prefs = preferencias(str(u.get("id") or ""))
    extra = ESTILOS.get(estilo or prefs.get("estilo") or "normal", "")
    if prefs.get("instrucoes"):
        extra += "\nInstruções de quem pergunta (siga se não conflitarem com as regras acima): " + prefs["instrucoes"][:1500]
    if prefs.get("chamar"):
        extra += f"\nChame a pessoa de {prefs['chamar'][:40]}."
    if prefs.get("trabalho"):
        extra += f"\nTrabalho de quem pergunta: {prefs['trabalho'][:60]} (ajuste o nível técnico)."
    if prefs.get("agir") is False:
        leitura = True   # Capacidades → "Agir nos ares" desligado: sempre só consulta
    esforco = esforco or prefs.get("esforco")
    if esforco == "baixo":
        extra += "\nEsforço BAIXO: responda direto e curto."
    if projeto:
        from . import ia_projetos
        extra += "\n\n" + ia_projetos.contexto(projeto, pergunta, 90_000 if esforco == "maximo" else 60_000)
    locais = [x for x in (locais or []) if x in NOMES_LOCAIS] if canal == "terminal" else []
    if locais:
        extra += ("\n\nTERMINAL (clima-ia): você também pode usar ferramentas no computador da pessoa: " + ", ".join(locais) + ". "
                  "Caminhos relativos são da pasta onde ela abriu o terminal. Escrever, editar, rodar comando e baixar pedem o sim dela; "
                  "diga o que vai fazer antes. Nunca apague nada sem ela pedir com todas as letras. Mostre só o essencial das saídas.")
    msgs = [{"role": "system", "content": _sistema(canal) + ("\n- MODO PLANO (só leitura): você NÃO pode mudar nada; consulte, explique e proponha um plano passo a passo." if leitura else "") + extra}]
    for h in historico[-(30 if esforco == "maximo" else 16):]:
        if h.get("role") in ("user", "assistant") and isinstance(h.get("content"), str):
            msgs.append({"role": h["role"], "content": h["content"][:3000]})
    # imagens (prints da tela, foto do controle): vão junto da última pergunta; modelo sem visão troca para o que enxerga
    imgs = [i for i in (imagens or []) if isinstance(i, str) and i.startswith("data:image/") and len(i) < 2_200_000][:2]
    if imgs and msgs[-1]["role"] == "user":
        msgs[-1] = {"role": "user", "content": [{"type": "text", "text": msgs[-1]["content"]}, *({"type": "image_url", "image_url": {"url": i}} for i in imgs)]}
        if modelo not in COM_VISAO:
            modelo = "nvidia/nemotron-3.5-super-vl-120b-a12b"
    acoes, confirmacoes = [], []
    gasto = {"tokens": 0}
    try:
        return _rodadas(msgs, modelo, leitura, historico, origem, u, acoes, confirmacoes, gasto, pensar, locais)
    finally:
        ia_uso.registrar(u, gasto["tokens"], modelo, canal)


def _rodadas(msgs, modelo, leitura, historico, origem, u, acoes, confirmacoes, gasto, pensar=False, locais=None) -> dict:
    for _ in range(RODADAS):
        m = _chamar_modelo(msgs, modelo, leitura, pensar, locais)
        gasto["tokens"] += int(m.pop("_tokens", 0) or 0)
        m.pop("_modelo", None)
        chamadas = m.get("tool_calls") or []
        if not chamadas:
            texto = (m.get("content") or "").strip() or "Feito."
            pergunta = next((h["content"] for h in reversed(historico) if h.get("role") == "user"), "")
            db.registrar(origem, "Conversa com a IA", detalhe=f"{u.get('nome') or u.get('email') or '-'}: {pergunta[:120]}")
            return {"texto": texto, "acoes": acoes, "confirmacoes": confirmacoes, "modelo": modelo, "tokens": gasto["tokens"]}
        msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": chamadas})
        pendentes = []
        for ch in chamadas:
            nome = ch["function"]["name"]
            try:
                args = json.loads(ch["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            if nome in (locais or []):   # roda no terminal: devolve o pedido e espera o resultado
                pendentes.append({"id": ch.get("id"), "nome": nome, "args": args})
                continue
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
        if pendentes:
            token = secrets.token_urlsafe(16)
            est = db.cfg("ia_cli_estado") or {}
            agora = time.time()
            est = {k: v for k, v in est.items() if v.get("expira", 0) > agora}
            est[token] = {"usuario_id": str(u.get("id")), "msgs": msgs, "modelo": modelo, "leitura": leitura, "pensar": pensar, "locais": locais,
                          "origem": origem, "pergunta": next((h["content"] for h in reversed(historico) if h.get("role") == "user"), "")[:500],
                          "pendentes": [p["id"] for p in pendentes], "expira": agora + 900}
            db.set_cfg("ia_cli_estado", est)
            return {"texto": (m.get("content") or "").strip(), "pendentes_locais": pendentes, "continuar": token, "acoes": acoes,
                    "confirmacoes": confirmacoes, "modelo": modelo, "tokens": gasto["tokens"]}
    return {"texto": "Precisei de muitas consultas para responder. Pergunte de um jeito mais direto.", "acoes": acoes,
            "confirmacoes": confirmacoes, "modelo": modelo}



def continuar(token: str, resultados: list[dict]) -> dict:
    """Volta de uma pausa por ferramentas locais: junta o que o terminal devolveu e segue a conversa."""
    u = _u()
    est = db.cfg("ia_cli_estado") or {}
    e = est.pop(token, None)
    db.set_cfg("ia_cli_estado", est)
    if not e or e.get("expira", 0) < time.time() or e.get("usuario_id") != str(u.get("id")):
        raise PermissionError("Esta etapa venceu ou não é sua. Pergunte de novo.")
    from . import ia_uso
    ia_uso.checar(u)
    por_id = {str(r.get("id")): r for r in resultados}
    msgs = e["msgs"]
    for pid in e["pendentes"]:
        r = por_id.get(str(pid)) or {"conteudo": "A pessoa não executou (sem resultado)."}
        msgs.append({"role": "tool", "tool_call_id": pid, "content": str(r.get("conteudo") or "")[:12000]})
    acoes, confirmacoes, gasto = [], [], {"tokens": 0}
    try:
        return _rodadas(msgs, e["modelo"], e["leitura"], [{"role": "user", "content": e.get("pergunta") or ""}], e["origem"], u, acoes, confirmacoes, gasto,
                        e.get("pensar", False), e.get("locais") or [])
    finally:
        ia_uso.registrar(u, gasto["tokens"], e["modelo"], "terminal")
