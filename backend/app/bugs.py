"""Área de Bugs: relatados pelas pessoas e encontrados pelo próprio sistema, cada um com sugestão de correção e um prompt
pronto para a IA (clima-ia no terminal ou Claude Code) corrigir.

Fontes automáticas (origem "sistema", deduplicadas por `chave` e somando ocorrências):
- erro de JavaScript na tela de quem usa (POST /api/bugs/erro-cliente, com limite);
- erro interno do servidor (500) capturado no middleware (`registrar_excecao`);
- varredura (`varrer`): falhas repetidas na Atividade e na fila, rotas sem regra de permissão, transmissor com problema há
  horas, agente sem anunciar. Roda pelo botão "Procurar bugs agora" e no laço do agente (de hora em hora).
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time

from . import db

log = logging.getLogger("clima.bugs")

# rota da tela → arquivos prováveis (mesmo mapa do CLAUDE.md "Onde mexer")
ARQUIVOS = {
    "/aparelhos": "frontend/src/pages/Aparelhos.jsx, frontend/src/pages/Aparelho.jsx, backend/app/clima.py, backend/app/rotas/api.py",
    "/transmissores": "frontend/src/pages/Transmissores.jsx, backend/app/transmissor.py, backend/app/rotas/api.py",
    "/mapa": "frontend/src/components/Mapa3D.jsx, frontend/src/pages/Mapa.jsx, frontend/src/components/predio3d.js",
    "/seguranca": "frontend/src/pages/Seguranca.jsx, backend/app/firewall.py, backend/app/testes_seguranca.py",
    "/musica": "frontend/src/pages/Musica.jsx, backend/app/musica.py, backend/app/rotas/musica.py",
    "/luzes": "frontend/src/pages/Luzes.jsx, backend/app/dispositivos.py, backend/app/rotas/dispositivos.py",
    "/relatorios": "frontend/src/pages/Relatorios.jsx, backend/app/relatorio.py",
    "/infra": "frontend/src/pages/Infra.jsx, backend/app/infra.py, backend/app/rotas/infra.py",
    "/integracoes": "frontend/src/pages/Integracoes.jsx, backend/app/sinric.py",
    "/telegram": "frontend/src/pages/Telegram.jsx, backend/app/telegram.py",
    "/": "frontend/src/pages/Painel.jsx, backend/app/rotas/api.py (/painel)",
}


def _arquivos(pagina: str) -> str:
    p = (pagina or "").split("?")[0]
    for rota in sorted(ARQUIVOS, key=len, reverse=True):
        if p == rota or (rota != "/" and p.startswith(rota)):
            return ARQUIVOS[rota]
    return "procure pela rota no frontend/src/main.jsx e no backend/app/rotas/"


def montar_prompt(b: dict) -> str:
    ctx = b.get("contexto") or {}
    if isinstance(ctx, str):
        ctx = json.loads(ctx or "{}")
    erros = "\n".join(f"- {e}" for e in (ctx.get("erros") or [])[:8])
    return (f"Corrija este bug do Clima Escritório (projeto na pasta atual; leia o CLAUDE.md antes).\n\n"
            f"Título: {b['titulo']}\nGravidade: {b.get('gravidade')}\nOrigem: {'encontrado pelo sistema' if b.get('origem') == 'sistema' else 'relatado por ' + (b.get('autor_nome') or 'usuário')}\n"
            f"Página: {b.get('pagina') or '-'}\nOcorrências: {b.get('ocorrencias', 1)}\n\n"
            f"O que acontece:\n{b.get('descricao') or '-'}\n\n"
            + (f"Passos para reproduzir:\n{b['passos']}\n\n" if b.get("passos") else "")
            + (f"Erros registrados:\n{erros}\n\n" if erros else "")
            + (f"Detalhe técnico:\n{str(ctx.get('detalhe'))[:1500]}\n\n" if ctx.get("detalhe") else "")
            + f"Arquivos prováveis: {_arquivos(b.get('pagina', ''))}\n\n"
            + (f"Sugestão inicial: {b['sugestao']}\n\n" if b.get("sugestao") else "")
            + "Como entregar: ache a causa (não só o sintoma), corrija sem quebrar o resto, rode o build do frontend e o import "
              "do backend, teste a tela no navegador (1440 e 375) e descreva o que mudou. Siga as regras de ouro do CLAUDE.md "
              "(sem segredos, novidades.json se o usuário perceber a mudança).")


def sugestao_para(texto: str) -> str:
    t = (texto or "").lower()
    regras = [
        (r"cannot read propert|undefined is not|of undefined|of null", "Algum dado ainda não chegou quando a tela tentou usá-lo: proteja com ?. ou espere o carregamento (estado 'carregando')."),
        (r"rendered (more|fewer) hooks|invalid hook", "Hook do React chamado depois de um return antecipado ou dentro de condição: mova os useState/useMemo para o topo do componente."),
        (r"failed to fetch|networkerror|load failed", "Pedido de rede falhou: confira se a rota existe na publicação atual, CORS/CSP e se o firewall não bloqueou o IP."),
        (r"chunk|dynamically imported module|importing a module script failed", "Arquivo de código antigo depois de publicar: o navegador pediu um pedaço que não existe mais. Recarregar resolve; para evitar, trate o erro de import e recarregue a página."),
        (r"webgl|context lost|shader", "Problema de 3D/placa de vídeo: reduza o peso da cena, descarte materiais só depois do compileAsync e trate a perda de contexto."),
        (r"formato de comando", "O transmissor ainda não tem o formato de comando (control_type): grave um botão nele (Aparelhos → Botões gravados → Gravar) ou copie os botões de outro ar igual; o agente define o formato na primeira gravação."),
        (r"nenhum sinal recebido", "Gravação sem sinal: confira o protocolo do transmissor (Reconectar agora testa 3.3/3.4/3.5) e aponte o controle a 10–20 cm, com o visor aceso."),
        (r"tempo esgotado|não respondeu a tempo|timeout", "O agente do escritório não pegou o pedido: confira Infra → Agentes (online e enxergando os transmissores)."),
        (r"local key|914|chave", "Transmissor pareado de novo ou protocolo errado: Transmissores → Reconectar agora (o agente testa 3.3/3.4/3.5)."),
        (r"permiss|403|forbidden", "Regra de permissão: confira acesso.REGRAS e o escopo do usuário (projetos e ares)."),
        (r"500|internal server error|traceback|exception", "Erro no servidor: veja o detalhe técnico, reproduza localmente (CLIMA_PAPEL=nuvem) e trate o caso que lança a exceção."),
    ]
    for rx, s in regras:
        if re.search(rx, t):
            return s
    return "Reproduza o problema, veja o console do navegador e a Atividade (filtro falhas) e corrija a causa."


def _chave(*partes) -> str:
    return hashlib.sha256("|".join(str(p) for p in partes).encode()).hexdigest()[:40]


def registrar_auto(chave: str, titulo: str, descricao: str, pagina: str = "", gravidade: str = "media", categoria: str = "",
                   contexto: dict | None = None, ultimo: int | None = None) -> int:
    """Cria ou soma ocorrência de um bug encontrado pelo sistema. Corrigido que volta a acontecer reabre.
    `ultimo` = quando o erro mais recente aconteceu: se não houve nada depois da última atualização do bug (erros antigos
    ainda dentro da janela de 24 h), não soma ocorrência nem reabre o que já foi corrigido."""
    agora = db.agora()
    ja = db.um("SELECT id, estado, contexto, atualizado_em FROM bugs WHERE chave = ?", (chave,))
    if ja and ultimo is not None and ultimo <= (ja["atualizado_em"] or 0):
        return ja["id"]
    if ja:
        ctx = ja["contexto"] if isinstance(ja["contexto"], dict) else json.loads(ja["contexto"] or "{}")
        novos = (contexto or {}).get("erros") or []
        ctx["erros"] = (novos + (ctx.get("erros") or []))[:15]
        estado = "aberto" if ja["estado"] == "corrigido" else ja["estado"]
        db.executar("UPDATE bugs SET ocorrencias = ocorrencias + 1, atualizado_em = ?, estado = ?, contexto = CAST(? AS jsonb) WHERE id = ?",
                    (agora, estado, json.dumps(ctx, default=str)[:20000], ja["id"]))
        return ja["id"]
    b = {"titulo": titulo[:160], "descricao": descricao[:4000], "pagina": pagina[:200], "gravidade": gravidade, "origem": "sistema", "contexto": contexto or {},
         "sugestao": sugestao_para(f"{titulo} {descricao} {json.dumps(contexto or {}, default=str)}"), "ocorrencias": 1}
    b["prompt"] = montar_prompt(b)
    r = db.um("INSERT INTO bugs (chave, titulo, descricao, pagina, gravidade, origem, categoria, contexto, sugestao, prompt, criado_em, atualizado_em) "
              "VALUES (?,?,?,?,?,'sistema',?,CAST(? AS jsonb),?,?,?,?) RETURNING id",
              (chave, b["titulo"], b["descricao"], b["pagina"], gravidade, categoria, json.dumps(b["contexto"], default=str)[:20000], b["sugestao"], b["prompt"], agora, agora))
    try:   # bug novo já entra em Tarefas → Plano de melhorias
        sincronizar_tarefas([r["id"]])
    except Exception as e:  # noqa: BLE001
        log.warning("bug %s → tarefa: %s", r["id"], e)
    return r["id"]


def registrar_excecao(rota: str, metodo: str, exc: BaseException):
    """Erro 500 no servidor (chamado pelo middleware). Nunca derruba o pedido."""
    import traceback
    try:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))[-3000:]
        rota_norm = re.sub(r"/\d+(?=/|$)", "/{id}", rota)
        registrar_auto(_chave("500", metodo, rota_norm, type(exc).__name__), f"Erro interno em {metodo} {rota_norm}",
                       f"{type(exc).__name__}: {str(exc)[:500]}", pagina=rota_norm, gravidade="alta", categoria="servidor",
                       contexto={"detalhe": tb, "erros": [f"{time.strftime('%d/%m %H:%M')} {type(exc).__name__}: {str(exc)[:200]}"]})
    except Exception:  # noqa: BLE001
        pass


def registrar_formulario(rota: str, metodo: str, campos: list, u: dict):
    """422 de quem está logado: a tela mandou o formulário no formato errado (campo faltando, tipo trocado)."""
    try:
        rota_norm = re.sub(r"/[0-9a-z]{16,}(?=/|$)|/\d+(?=/|$)", "/{id}", rota)
        cat = "cadastro" if re.search(r"/(hubs|aparelhos|projetos|cenas|automacoes|agendamentos|dispositivos)", rota_norm) else "tela"
        registrar_auto(_chave("422", metodo, rota_norm, ",".join(campos)), f"Formulário recusado: {metodo} {rota_norm}",
                       f"A tela enviou dados que o servidor não aceitou nos campos: {', '.join(campos)}. Quem usa não consegue salvar.",
                       pagina=rota_norm, gravidade="alta" if cat == "cadastro" else "media", categoria=cat,
                       contexto={"erros": [f"{time.strftime('%d/%m %H:%M')} {u.get('email', '')}: {', '.join(campos)}"]})
    except Exception:  # noqa: BLE001
        pass


def varrer() -> dict:
    """Procura problemas no próprio sistema e transforma em bugs (sem duplicar)."""
    achados = 0
    desde = db.agora() - 86400
    # falha porque nenhum agente estava no escritório já vira o bug "agente parado" (abaixo): não repete por ação
    for r in db.consultar("SELECT acao, count(*) n, max(detalhe) detalhe, max(quando) ultimo FROM atividade WHERE ok = 0 AND quando > ? "
                          "AND coalesce(detalhe, '') NOT SIMILAR TO '%(não respondeu a tempo|agente do Mac offline|Nenhum computador do escritório|não enxerga os transmissores)%' "
                          "AND acao NOT LIKE 'IP bloqueado%' AND acao NOT LIKE 'Pedido recusado pelo Assistente%' "
                          "GROUP BY acao HAVING count(*) >= 3 ORDER BY count(*) DESC LIMIT 15", (desde,)):
        acao = re.sub(r"\d+°", "N°", r["acao"])[:120]
        registrar_auto(_chave("atividade", acao), f"Falha repetida: {acao}", f"{r['n']} falhas nas últimas 24 h. Último motivo: {r['detalhe'] or '-'}",
                       gravidade="alta" if r["n"] >= 10 else "media", categoria="atividade", contexto={"erros": [str(r["detalhe"])[:200]]}, ultimo=r["ultimo"])
        achados += 1
    # gravação sem sinal é o resultado normal de quem não apertou o controle a tempo: não é bug do sistema
    for r in db.consultar("SELECT tipo, erro, count(*) n, max(criado_em) ultimo FROM fila_comandos WHERE estado = 'erro' AND criado_em > ? "
                          "AND NOT (tipo = 'aprender' AND (erro LIKE 'Nenhum sinal%' OR erro LIKE 'Sinal incompleto%')) "
                          "GROUP BY tipo, erro HAVING count(*) >= 3", (desde,)):
        registrar_auto(_chave("fila", r["tipo"], (r["erro"] or "")[:60]), f"Fila: {r['tipo']} falhando", f"{r['n']} pedidos '{r['tipo']}' com erro em 24 h: {r['erro']}",
                       gravidade="media", categoria="agente", contexto={"erros": [str(r["erro"])[:200]]}, ultimo=r["ultimo"])
        achados += 1
    try:
        from .rotas import api as rapi
        sem = rapi.rotas_sem_regra()
        if sem:
            registrar_auto(_chave("rotas_sem_regra"), "Rotas que mudam dados sem regra de permissão", ", ".join(sem)[:2000], gravidade="critica", categoria="segurança")
            achados += 1
    except Exception:  # noqa: BLE001
        pass
    # Sem agente no escritório, todo transmissor parece "fora da rede": é um problema só (o agente), não um por transmissor
    visto = db.cfg("agente_visto_em", 0) or 0
    try:
        from . import coordenador
        principal = next((m for m in coordenador.maquinas() if m.get("principal")), None)
    except Exception:  # noqa: BLE001
        principal = None
    cego = bool(principal) and not principal.get("ve_transmissores")
    if visto and db.agora() - int(visto) > 3 * 3600:
        # situação de operação (computador desligado), não defeito do sistema: vira notificação, não bug
        from . import notificacoes
        notificacoes.notificar("agente:off", "agente", "alta", "Nenhum agente ligado há mais de 3 horas",
                               "Sem agente, nenhum comando chega aos ares. Ligue o computador do escritório (ou o Raspberry Pi).", "/infra?aba=agentes")
    elif cego:
        cegos = int(db.cfg("agente_cego_desde", 0) or 0) or db.agora()
        db.set_cfg("agente_cego_desde", cegos)
        if db.agora() - cegos > 3 * 3600:
            from . import notificacoes   # operação (computador fora do escritório), não defeito: notificação, não bug
            notificacoes.notificar("agente:cego", "agente", "alta", "O agente no comando não está no escritório",
                                   f"O computador no comando ({principal.get('nome')}) não enxerga nenhum transmissor há mais de 3 horas: os comandos "
                                   "não chegam aos ares. Ligue um computador do escritório (ou o Raspberry Pi) e deixe-o como preferido em Infra → Agentes.",
                                   "/infra?aba=agentes")
    if not cego:
        db.set_cfg("agente_cego_desde", 0)
    if not (cego or (visto and db.agora() - int(visto) > 3 * 3600)):
        # transmissor fora da rede é operação (desligado, Wi-Fi, agente longe), não defeito do sistema: notificação, não bug
        from . import notificacoes
        for h in db.consultar("SELECT id, nome, problema, visto_em FROM hubs WHERE problema IS NOT NULL AND (visto_em IS NULL OR visto_em < ?)", (db.agora() - 6 * 3600,)):
            notificacoes.notificar(f"hub:{h['id']}:parado", "transmissor", "media", f"Transmissor {h['nome']} sem responder há horas",
                                   f"{h['problema']} Confira se ele está ligado e se o computador do agente está no Wi-Fi do escritório.", "/transmissores")
    for c in checar_cadastros():
        registrar_auto(_chave("cadastro", c["codigo"], c.get("alvo", "")), c["titulo"], c["descricao"], pagina=c.get("pagina", ""),
                       gravidade=c["gravidade"], categoria="cadastro", contexto={"erros": [c["descricao"][:200]]})
        achados += 1
    for c in checar_profundo():
        registrar_auto(_chave("profundo", c["codigo"], c.get("alvo", "")), c["titulo"], c["descricao"], pagina=c.get("pagina", ""),
                       gravidade=c["gravidade"], categoria=c["categoria"], contexto={"erros": [c["descricao"][:200]]}, ultimo=c.get("ultimo"))
        achados += 1
    try:
        tarefas_r = sincronizar_tarefas()
    except Exception as e:  # noqa: BLE001
        log.warning("bugs → tarefas: %s", e)
        tarefas_r = {"erro": str(e)[:200]}
    db.set_cfg("bugs_ultima_varredura", db.agora())
    return {"achados": achados, "em": db.agora(), "tarefas": tarefas_r}


# ---------------- cadastros inconsistentes (ares, transmissores, botões, zonas) ----------------
def checar_cadastros() -> list[dict]:
    """Dados que quebram o uso: o que um formulário antigo, uma remoção pela metade ou uma importação deixou para trás.
    Só inconsistência de verdade (ar sem transmissor de propósito, como o da Reunião, não entra)."""
    achados = []

    def add(codigo, titulo, descricao, gravidade="media", pagina="/aparelhos", alvo=""):
        achados.append({"codigo": codigo, "titulo": titulo, "descricao": descricao, "gravidade": gravidade, "pagina": pagina, "alvo": str(alvo)})

    for a in db.consultar("SELECT a.id, a.nome, a.hub_id FROM aparelhos a WHERE a.hub_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM hubs h WHERE h.id = a.hub_id)"):
        add("hub_orfao", f"Ar {a['nome']} aponta para um transmissor que não existe", "Os comandos desse ar falham. Escolha o transmissor de novo em Aparelho → Ajustes.", "alta", f"/aparelhos/{a['id']}", a["id"])
    for a in db.consultar("SELECT a.id, a.nome FROM aparelhos a WHERE a.projeto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projetos p WHERE p.id = a.projeto_id)"):
        add("projeto_orfao", f"Ar {a['nome']} está numa sala que não existe", "Ele some do painel das salas e do mapa. Escolha a sala em Aparelho → Ajustes.", "alta", f"/aparelhos/{a['id']}", a["id"])
    for a in db.consultar("SELECT id, nome FROM aparelhos WHERE projeto_id IS NULL"):
        add("sem_projeto", f"Ar {a['nome']} sem sala", "Quem tem acesso só a algumas salas não vê este ar. Escolha a sala em Aparelho → Ajustes.", "media", f"/aparelhos/{a['id']}", a["id"])
    n = db.um("SELECT count(*) n FROM codigos c WHERE NOT EXISTS (SELECT 1 FROM aparelhos a WHERE a.id = c.aparelho_id)")["n"]
    if n:
        add("codigos_orfaos", f"{n} botões gravados de ares que não existem mais", "Sobra de ar apagado pela metade: ocupam espaço e entram nos backups.", "baixa", "/aparelhos")
    for a in db.consultar("SELECT a.id, a.nome FROM aparelhos a WHERE a.alexa = 1 AND a.hub_id IS NOT NULL AND NOT EXISTS "
                          "(SELECT 1 FROM codigos c WHERE c.aparelho_id = a.id AND c.chave = 'desligar')"):
        add("alexa_sem_desligar", f"Ar {a['nome']} está na Alexa sem o botão Desligar", "Pedir \"desligar\" na Alexa vai falhar. Grave o Desligar (ou copie de um ar igual).", "media", f"/aparelhos/{a['id']}", a["id"])
    for a in db.consultar("SELECT id, nome, temperatura, temp_min, temp_max FROM aparelhos WHERE temp_min >= temp_max OR temperatura < temp_min OR temperatura > temp_max"):
        add("faixa", f"Ar {a['nome']} com temperatura fora da faixa", f"Está em {a['temperatura']}° com faixa {a['temp_min']}°–{a['temp_max']}°. Ajuste a faixa em Aparelho → Ajustes.", "baixa", f"/aparelhos/{a['id']}", a["id"])
    for r in db.consultar("SELECT lower(trim(nome)) nome, count(*) n FROM aparelhos GROUP BY 1 HAVING count(*) > 1"):
        add("nome_repetido", f"{r['n']} ares com o nome \"{r['nome']}\"", "A Alexa e o Telegram acham o ar pelo nome: com nomes iguais, o comando pode ir para o ar errado.", "alta", "/aparelhos", r["nome"])
    for r in db.consultar("SELECT sinric_device_id d, count(*) n FROM aparelhos WHERE coalesce(sinric_device_id, '') <> '' GROUP BY 1 HAVING count(*) > 1"):
        add("sinric_repetido", "Dois ares ligados ao mesmo aparelho da Alexa", "Um comando de voz muda os dois no sistema. Refaça o vínculo em Integrações.", "alta", "/integracoes", r["d"])
    for h in db.consultar("SELECT id, nome, local_key, versao FROM hubs"):
        if not h["local_key"]:
            add("hub_sem_chave", f"Transmissor {h['nome']} sem Local Key", "Sem a chave o agente não fala com ele. Conecte a conta Smart Life e use Importar.", "alta", "/transmissores", h["id"])
        if h["versao"] not in ("3.1", "3.2", "3.3", "3.4", "3.5"):
            add("hub_versao", f"Transmissor {h['nome']} com protocolo inválido ({h['versao']})", "Edite o transmissor e escolha 3.3, 3.4 ou 3.5.", "alta", "/transmissores", h["id"])
    ids = {r["id"] for r in db.consultar("SELECT id FROM aparelhos")}
    for z in (db.cfg("zonas") or []):
        fora = [i for i in (z.get("aparelhos") or []) if i not in ids]
        if fora:
            add("zona_orfa", f"Zona {z.get('nome') or z.get('id')} com ar que não existe mais", "A zona manda o sinal para um ar apagado. Refaça o teste de interferência no transmissor.", "media", "/transmissores", z.get("id"))
    return achados


# ---------------- autoteste: os cadastros funcionam? (tudo numa transação desfeita no fim) ----------------
def autoteste() -> list[dict]:
    """Cadastra uma sala, um transmissor, um ar e um botão de mentira, lê como as telas leem, e DESFAZ tudo (rollback).
    Pega o tipo de erro que só aparece na hora de cadastrar: coluna obrigatória nova, restrição, tipo trocado."""
    from .rotas.api import HubIn, AparelhoIn, VERSOES_TUYA   # mesmos modelos dos formulários
    passos = []

    def passo(nome, fn):
        t0 = time.time()
        try:
            det = fn() or "ok"
            passos.append({"nome": nome, "ok": True, "detalhe": str(det)[:200], "ms": int((time.time() - t0) * 1000)})
        except Exception as e:  # noqa: BLE001
            passos.append({"nome": nome, "ok": False, "detalhe": f"{type(e).__name__}: {str(e)[:300]}", "ms": int((time.time() - t0) * 1000)})

    passo("Formulário de transmissor aceita um cadastro válido", lambda: HubIn(id="autoteste0000000000x", nome="Autoteste", ip="192.168.0.50", versao="3.3").id)

    def recusa():
        ruins = [dict(id="autoteste0000000000x", nome="x", ip="abc"), dict(id="autoteste0000000000x", nome="x", versao="9"), dict(id="curto", nome="x")]
        for d in ruins:
            try:
                HubIn(**d)
            except Exception:  # noqa: BLE001
                continue
            raise AssertionError(f"aceitou dado inválido: {d}")
        return f"{len(ruins)} cadastros inválidos recusados"
    passo("Formulário de transmissor recusa IP, protocolo e ID inválidos", recusa)
    passo("Formulário de ar aceita os valores padrão", lambda: AparelhoIn(nome="Ar autoteste").modos)
    passo("Fila aceita todos os tipos de pedido do agente", lambda: _tipos_fila())

    def transacao():
        with db.conexao() as con:
            cur = con.execute("INSERT INTO projetos (nome, descricao, endereco, cor, criado_em, tipo, responsavel, meta_custo_mes) "
                              "VALUES ('[autoteste]', '', '', '#0f766a', %s, 'sala', '', 0) RETURNING id", (db.agora(),))
            pid = _v(cur.fetchone())
            con.execute("INSERT INTO hubs (id, nome, ip, local_key, versao, projeto_id, criado_em) VALUES ('autoteste0000000000x', '[autoteste]', '', '', %s, %s, %s)",
                        (VERSOES_TUYA[2], pid, db.agora()))
            cur = con.execute("INSERT INTO aparelhos (nome, comodo, marca, hub_id, temp_min, temp_max, modos, alexa, temperatura, modo, projeto_id, criado_em, potencia_w) "
                              "VALUES ('[autoteste]', '', '', 'autoteste0000000000x', 16, 30, 'frio', 0, 23, 'frio', %s, %s, 1000) RETURNING id", (pid, db.agora()))
            aid = _v(cur.fetchone())
            con.execute("INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) VALUES (%s, 'desligar', 'Desligar', 'AAAA', %s)", (aid, db.agora()))
            n = _v(con.execute("SELECT count(*) FROM aparelhos a JOIN hubs h ON h.id = a.hub_id JOIN codigos c ON c.aparelho_id = a.id WHERE a.id = %s", (aid,)).fetchone())
            if n != 1:
                raise AssertionError("o ar cadastrado não aparece junto do transmissor e do botão")
            raise _Desfazer()   # só chega aqui se tudo deu certo: desfaz a transação inteira

    def rodar_transacao():
        try:
            transacao()
        except _Desfazer:
            pass
        sobrou = db.um("SELECT count(*) n FROM hubs WHERE id = 'autoteste0000000000x'")["n"]
        if sobrou:
            raise AssertionError("o autoteste deixou dados para trás")
        return "sala, transmissor, ar e botão gravados, lidos e desfeitos"
    passo("Cadastro de sala → transmissor → ar → botão no banco (desfeito no fim)", rodar_transacao)
    passo("Cadastros sem inconsistência (ares, transmissores, zonas)", lambda: _sem_achados())
    db.set_cfg("bugs_autoteste", {"em": db.agora(), "passos": passos})
    return passos


class _Desfazer(Exception):
    pass


def _v(linha):
    return next(iter(linha.values())) if isinstance(linha, dict) else linha[0]


def _tipos_fila():
    d = db.um("SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'fila_comandos_tipo_check'")["d"]
    faltam = [t for t in ("enviar", "aprender", "descobrir", "evento", "reparar", "infra") if f"'{t}'" not in d]
    if faltam:
        raise AssertionError(f"a restrição da fila não aceita: {', '.join(faltam)}")
    return "6 tipos aceitos"


def _sem_achados():
    a = checar_cadastros()
    if a:
        raise AssertionError(f"{len(a)} problema(s): " + "; ".join(x["titulo"] for x in a[:4]))
    return "nenhum problema"


# ---------------- varredura profunda: o que quebra sem ninguém perceber ----------------
def checar_profundo() -> list[dict]:
    """Checagens além das falhas repetidas: rotinas do banco, fila travada, automações apontando para ares apagados,
    e-mails que não chegam, desempenho ruim de verdade (LCP p75 > 4 s, o limite "ruim" do Google), banco perto do limite,
    backup atrasado, agente que não consegue se atualizar e transmissores com o mesmo IP. Só fatos medidos no banco."""
    achados = []

    def add(codigo, titulo, descricao, gravidade="media", pagina="", categoria="sistema", alvo="", ultimo=None):
        achados.append({"codigo": codigo, "titulo": titulo, "descricao": descricao, "gravidade": gravidade, "pagina": pagina,
                        "categoria": categoria, "alvo": str(alvo), "ultimo": ultimo})

    def tenta(fn):
        try:
            fn()
        except Exception as e:  # noqa: BLE001  (uma checagem com problema não derruba as outras)
            log.warning("checagem profunda: %s", e)

    def cron():
        for r in db.consultar("SELECT j.jobname, count(*) n, max(d.return_message) m, extract(epoch FROM max(d.start_time))::bigint ultimo "
                              "FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid "
                              "WHERE d.status = 'failed' AND d.start_time > now() - interval '1 day' GROUP BY 1"):
            add("cron", f"Rotina do banco falhando: {r['jobname']}", f"{r['n']} falha(s) em 24 h. Última mensagem: {(r['m'] or '-')[:300]}",
                "alta", "/supabase", "banco", r["jobname"], ultimo=r["ultimo"])

    def fila():
        for r in db.consultar("SELECT tipo, estado, count(*) n FROM fila_comandos WHERE estado IN ('executando', 'pendente') AND criado_em < ? "
                              "AND criado_em > ? GROUP BY 1, 2", (db.agora() - 600, db.agora() - 86400)):
            add("fila_presa", f"Fila: {r['n']} pedido(s) '{r['tipo']}' parados em '{r['estado']}'",
                "Há mais de 10 minutos sem resposta. O agente pode ter travado no meio (veja Infra → Agentes e o log do agente).",
                "media", "/infra?aba=agentes", "agente", f"{r['tipo']}:{r['estado']}")

    def automacoes():
        ids = {r["id"] for r in db.consultar("SELECT id FROM aparelhos")}

        def ares_de(acoes):
            lista = acoes if isinstance(acoes, list) else json.loads(acoes or "[]")
            return [a.get("aparelho_id") for a in lista if isinstance(a, dict) and a.get("aparelho_id")]
        for c in db.consultar("SELECT id, nome, acoes FROM cenas"):
            fora = [i for i in ares_de(c["acoes"]) if i not in ids]
            if fora:
                add("cena_orfa", f"Cena {c['nome']} manda comando para ar apagado", f"Ar(es) {fora} não existem mais: a cena falha nessa parte. Edite a cena.",
                    "media", "/rotinas?aba=cenas", "cadastro", c["id"])
        for a in db.consultar("SELECT id, nome, acoes, gatilho FROM automacoes WHERE ativo = 1"):
            g = a["gatilho"] if isinstance(a["gatilho"], dict) else json.loads(a["gatilho"] or "{}")
            fora = [i for i in ares_de(a["acoes"]) + ([g.get("aparelho_id")] if g.get("aparelho_id") else []) if i not in ids]
            if fora:
                add("automacao_orfa", f"Automação {a['nome']} usa ar apagado", f"Ar(es) {fora} não existem mais: ela não dispara ou falha. Edite a automação.",
                    "media", "/rotinas?aba=automacoes", "cadastro", a["id"])
        for g in db.consultar("SELECT g.id, g.nome FROM agendamentos g WHERE g.ativo = 1 AND NOT EXISTS (SELECT 1 FROM aparelhos a WHERE a.id = g.aparelho_id)"):
            add("agenda_orfa", f"Agendamento {g['nome']} de um ar apagado", "Ele nunca vai rodar. Apague ou escolha outro ar.", "media", "/rotinas?aba=agenda", "cadastro", g["id"])
        for g in db.consultar("SELECT g.id, g.nome, a.nome ar FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id WHERE g.ativo = 1 AND a.hub_id IS NULL"):
            add("agenda_sem_tx", f"Agendamento {g['nome']} de um ar sem transmissor", f"O {g['ar']} não tem transmissor: o horário chega e o comando falha.",
                "media", "/rotinas?aba=agenda", "cadastro", g["id"])

    def emails():
        r = db.um("SELECT count(*) n, max(erro) erro, max(criado_em) ultimo FROM email_envios WHERE estado IN ('falhou', 'devolvido') AND criado_em > ?",
                  (db.agora() - 7 * 86400,))
        if r and r["n"] >= 3:   # `ultimo`: só reabre se houver falha nova depois de corrigido
            add("email_falhas", f"{r['n']} e-mails não entregues em 7 dias", f"Falharam ou voltaram. Último erro: {(r['erro'] or '-')[:200]}. Veja E-mails → Histórico.",
                "media", "/emails", "e-mail", ultimo=int(r["ultimo"] or 0))

    def desempenho():
        for r in db.consultar("SELECT rota, count(*) n, percentile_cont(0.75) WITHIN GROUP (ORDER BY valor) p75 FROM analise_eventos "
                              "WHERE origem = 'sistema' AND nome = 'LCP' AND quando > ? GROUP BY rota HAVING count(*) >= 5", (db.agora() - 7 * 86400,)):
            if (r["p75"] or 0) > 4000:
                add("lcp", f"Tela lenta: {r['rota']}", f"O conteúdo principal leva {r['p75'] / 1000:.1f} s para aparecer (75% das {r['n']} aberturas em 7 dias). "
                    "Acima de 4 s o Google considera ruim. Veja Acessos e SEO → O que melhorar.", "baixa", r["rota"], "desempenho", r["rota"])

    def banco():
        r = db.um("SELECT tamanho_banco_mb FROM saude_sistema ORDER BY medido_em DESC LIMIT 1")
        if r and float(r["tamanho_banco_mb"] or 0) > 400:
            add("banco_cheio", "Banco perto do limite do plano", f"{float(r['tamanho_banco_mb']):.0f} MB de 500 MB. Limpe registros antigos ou mude de plano.",
                "alta", "/supabase", "banco")

    def backup():
        r = db.um("SELECT max(criado_em) ultimo FROM backups")
        ultimo = r and r["ultimo"]
        ts = ultimo.timestamp() if hasattr(ultimo, "timestamp") else (ultimo or 0)
        if ts and db.agora() - ts > 2 * 86400:
            add("backup_atrasado", "Backup diário do banco parado", f"O último é de {int((db.agora() - ts) / 86400)} dia(s) atrás. Confira a rotina clima_backup_diario.",
                "alta", "/backup", "banco")

    def agentes():
        for r in db.consultar("SELECT chave, valor FROM config WHERE chave LIKE 'agente_atualizar_falhou:%'"):
            v = r["valor"] if isinstance(r["valor"], dict) else json.loads(r["valor"] or "{}")
            if v and db.agora() - int(v.get("em") or 0) < 86400:
                nome = (db.cfg(f"agente_maquina:{r['chave'].split(':', 1)[1]}") or {}).get("nome") or r["chave"].split(":", 1)[1]
                add("agente_atualizar", f"Agente {nome} não consegue se atualizar", f"{(v.get('erro') or '-')[:300]}", "media", "/infra?aba=agentes", "agente", nome)

    def transmissores():
        for r in db.consultar("SELECT ip, string_agg(nome, ', ') nomes, count(*) n FROM hubs WHERE COALESCE(ip, '') <> '' GROUP BY ip HAVING count(*) > 1"):
            add("hub_ip_repetido", f"Transmissores com o mesmo IP ({r['ip']})", f"{r['nomes']}: um deles está com o IP velho e os comandos podem ir para o errado. "
                "Use Testar conexão em cada um (o sistema procura o IP certo).", "alta", "/transmissores", "cadastro", r["ip"])

    for f in (cron, fila, automacoes, emails, desempenho, banco, backup, agentes, transmissores):
        tenta(f)
    return achados


# ---------------- bugs ↔ Tarefas (Plano de melhorias) ----------------
PROJETO_TAREFAS = "Plano de melhorias"
SECAO_TAREFAS = "Bugs e qualidade"
PRIO_DO_BUG = {"critica": "urgente", "alta": "alta", "media": "media", "baixa": "baixa"}
ABERTOS = ("aberto", "analisando")


def _destino_tarefas() -> tuple[int, int, dict]:
    from . import tarefas
    dono = db.um("SELECT id::text AS id, COALESCE(NULLIF(nome, ''), 'Sistema') AS nome FROM usuarios WHERE papel = 'dono' ORDER BY criado_em LIMIT 1") or {}
    pid = tarefas.projeto_por_nome(PROJETO_TAREFAS, dono, cor="#2563eb", descricao="Melhorias do sistema e correções vindas da tela Bugs.")
    sec = db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? AND lower(nome) = lower(?)", (pid, SECAO_TAREFAS)) or \
        db.um("INSERT INTO tarefas_secoes (projeto_id, nome, ordem) VALUES (?, ?, (SELECT COALESCE(MAX(ordem), 0) + 1 FROM tarefas_secoes WHERE projeto_id = ?)) RETURNING id",
              (pid, SECAO_TAREFAS, pid))
    return pid, sec["id"], dono


def _descricao_tarefa(b: dict) -> str:
    return (f"Bug #{b['id']} · gravidade {b['gravidade']} · {b['ocorrencias']} ocorrência(s) · {b.get('pagina') or 'sem tela'}\n\n"
            f"{(b.get('descricao') or '')[:2000]}\n\nSugestão: {b.get('sugestao') or '-'}\n\nhttps://app.zynio.com.br/bugs?bug={b['id']}")


def sincronizar_tarefas(ids: list[int] | None = None) -> dict:
    """Mantém cada bug ligado a uma tarefa em Tarefas → Plano de melhorias (seção "Bugs e qualidade"):
    bug aberto sem tarefa ganha uma (prioridade = gravidade: crítica → Urgente, alta → Alta, média → Média, baixa → Baixa);
    mudar a gravidade muda a prioridade; bug corrigido/descartado conclui a tarefa; bug que reabre reabre a tarefa;
    tarefa concluída em Tarefas (depois da última mudança do bug) marca o bug como corrigido."""
    from . import tarefas
    pid, sid, dono = _destino_tarefas()
    feitos = {"criadas": 0, "prioridade": 0, "concluidas": 0, "reabertas": 0, "bugs_corrigidos": 0}
    filtro, ps = ("WHERE b.id = ANY(?)", ([int(i) for i in ids],)) if ids else ("", ())
    linhas = db.consultar("SELECT b.*, t.id AS t_id, t.concluida AS t_concluida, t.prioridade AS t_prio, t.atualizado_em AS t_atual "  # nosec B608 (filtro fixo)
                          f"FROM bugs b LEFT JOIN tarefas t ON t.id = b.tarefa_id {filtro} ORDER BY b.id", ps)
    autor = {"id": dono.get("id"), "nome": "Bugs"}
    for b in linhas:
        prio = PRIO_DO_BUG.get(b["gravidade"], "media")
        aberto = b["estado"] in ABERTOS
        if not b["t_id"]:
            if not aberto:
                continue
            etiq = sorted({"bug", *([b["categoria"]] if b.get("categoria") else [])})
            ordem = (db.um("SELECT COALESCE(MIN(ordem), 0) - 1 AS o FROM tarefas WHERE secao_id = ?", (sid,)) or {}).get("o") or 0
            t = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, prioridade, prazo, responsavel_id, etiquetas, ordem, criado_por, criado_em, atualizado_em) "
                      "VALUES (?,?,?,?,?,?,CAST(NULLIF(?, '') AS uuid),CAST(? AS jsonb),?,CAST(NULLIF(?, '') AS uuid),?,?) RETURNING id",
                      (pid, sid, f"Bug #{b['id']}: {b['titulo'][:270]}", _descricao_tarefa(b), prio, b.get("prazo") or None, b.get("responsavel_id") or "",
                       json.dumps(etiq), ordem, dono.get("id") or "", db.agora(), db.agora()))
            db.executar("UPDATE bugs SET tarefa_id = ? WHERE id = ?", (t["id"], b["id"]))
            db.executar("INSERT INTO bugs_historico (bug_id, quando, autor_nome, tipo, texto) VALUES (?, ?, 'Sistema', 'tarefa', ?)",
                        (b["id"], db.agora(), f"Tarefa #{t['id']} criada em Tarefas → {PROJETO_TAREFAS} (prioridade {prio})"))
            tarefas.evento(t["id"], autor, f"Criada a partir do bug #{b['id']}")
            feitos["criadas"] += 1
            continue
        if aberto and b["t_concluida"] and int(b["t_atual"] or 0) >= int(b["atualizado_em"] or 0):
            db.executar("UPDATE bugs SET estado = 'corrigido', corrigido_em = ?, atualizado_em = ? WHERE id = ?", (db.agora(), db.agora(), b["id"]))
            db.executar("INSERT INTO bugs_historico (bug_id, quando, autor_nome, tipo, texto) VALUES (?, ?, 'Tarefas', 'estado', ?)",
                        (b["id"], db.agora(), f"Corrigido: a tarefa #{b['t_id']} foi concluída em Tarefas"))
            feitos["bugs_corrigidos"] += 1
            continue
        if aberto and b["t_concluida"]:
            db.executar("UPDATE tarefas SET concluida = false, concluida_em = NULL, atualizado_em = ? WHERE id = ?", (db.agora(), b["t_id"]))
            tarefas.evento(b["t_id"], autor, f"Reaberta: o bug #{b['id']} voltou a acontecer")
            feitos["reabertas"] += 1
        elif not aberto and not b["t_concluida"]:
            db.executar("UPDATE tarefas SET concluida = true, concluida_em = ?, atualizado_em = ? WHERE id = ?", (db.agora(), db.agora(), b["t_id"]))
            tarefas.evento(b["t_id"], autor, f"Concluída: o bug #{b['id']} foi marcado como {b['estado']}")
            feitos["concluidas"] += 1
        if b["t_prio"] != prio:
            db.executar("UPDATE tarefas SET prioridade = ?, atualizado_em = ? WHERE id = ?", (prio, db.agora(), b["t_id"]))
            tarefas.evento(b["t_id"], autor, f"Prioridade {prio}: gravidade do bug #{b['id']} é {b['gravidade']}")
            feitos["prioridade"] += 1
    return feitos
