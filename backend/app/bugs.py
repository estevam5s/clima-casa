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
import re
import time

from . import db

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


def varrer() -> dict:
    """Procura problemas no próprio sistema e transforma em bugs (sem duplicar)."""
    achados = 0
    desde = db.agora() - 86400
    # falha porque nenhum agente estava no escritório já vira o bug "agente parado" (abaixo): não repete por ação
    for r in db.consultar("SELECT acao, count(*) n, max(detalhe) detalhe, max(quando) ultimo FROM atividade WHERE ok = 0 AND quando > ? "
                          "AND coalesce(detalhe, '') NOT SIMILAR TO '%(não respondeu a tempo|agente do Mac offline|Nenhum computador do escritório|não enxerga os transmissores)%' "
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
    db.set_cfg("bugs_ultima_varredura", db.agora())
    return {"achados": achados, "em": db.agora()}
