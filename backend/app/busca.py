"""Busca do topo (⌘K): resultados do sistema inteiro e, para perguntas, a resposta da IA com os links das telas.

- buscar(q): procura em ares, salas, transmissores, cenas, automações, agenda, fluxos, tarefas, bugs, usuários, aparelhos do
  escritório, versões e conversas com a IA. Sempre com o escopo de quem busca (projetos e ares permitidos, permissões).
- perguntar(q): a IA do sistema em modo só leitura, com o MAPA das telas abaixo e as ferramentas de consulta, responde curto e
  aponta a tela certa (links /rota). Nada é salvo como conversa.
"""
from __future__ import annotations

import re

from . import acesso, db

# mapa do sistema para a IA da busca: tela → para que serve (mantenha junto com o menu, Layout.jsx)
MAPA = [
    ("/", "Painel: ares ligados, gasto, avisos, escritório 3D"), ("/aparelhos", "lista e controle dos ares; /aparelhos/ID detalhe, botões gravados, temporizador"),
    ("/transmissores", "transmissores Smart IR: status, reconectar, ares atendidos, zonas, teste de interferência"),
    ("/rotinas", "visão geral das rotinas"), ("/rotinas?aba=cenas", "cenas"), ("/rotinas?aba=automacoes", "automações por regra"),
    ("/rotinas?aba=agenda", "agendamentos por horário, feriados e férias"), ("/rotinas?aba=fluxos", "fluxos em blocos estilo N8N"),
    ("/rotinas?aba=execucoes", "execuções dos fluxos, erros de cada bloco"), ("/rotinas?aba=conexoes", "conexões externas dos fluxos: Slack, Discord, WhatsApp, GitHub, Home Assistant"),
    ("/rotinas?aba=variaveis", "variáveis globais dos fluxos"), ("/rotinas?aba=calendario", "calendário do que roda em cada dia, feriados"),
    ("/rotinas?aba=historico", "histórico das rotinas"), ("/projetos", "salas/projetos, metas de gasto"), ("/mapa", "mapa 2D/3D do escritório"),
    ("/relatorios", "relatórios de uso e custo, exportar PDF/Word/Excel"), ("/atividade", "linha do tempo de comandos, quem fez"),
    ("/notificacoes", "central de notificações"), ("/luzes", "iluminação"), ("/cafeteira", "cafeteira"), ("/persianas", "persianas"), ("/fechadura", "fechadura"),
    ("/musica", "Spotify, rotinas de música"), ("/integracoes", "Alexa e Google (Sinric Pro), diagnóstico"), ("/comandos-alexa", "frases de voz"),
    ("/ia", "assistente de IA (conversas, projetos, agendados, plugins, modo anônimo)"), ("/telegram", "bot do Telegram"),
    ("/tarefas", "tarefas da equipe estilo Asana, GitHub Projects"), ("/bugs", "bugs: relatar, procurar bugs, autoteste"),
    ("/seguranca", "segurança: monitoramento, firewall, IPs"), ("/seguranca?aba=logs", "logs completos"), ("/seguranca?aba=conformidade", "ISO 27001"),
    ("/seguranca?aba=testes", "testes de segurança ao vivo"), ("/seguranca?aba=integridade", "selos de integridade dos registros"),
    ("/seguranca?aba=treinamento", "treinamento e prova de segurança"), ("/infra", "Vercel, Cloudflare, agentes"), ("/infra?aba=agentes", "computadores com o agente"),
    ("/infra?aba=monitor", "monitor da API"), ("/infra?aba=integracoes", "integrações testadas ao vivo"), ("/infra?aba=limites", "limites e cotas dos planos"),
    ("/backup", "backup e restauração"), ("/rede", "rede e velocidade"), ("/emails", "e-mails (Resend), modelos, newsletter"),
    ("/supabase", "banco de dados"), ("/analise", "acessos e SEO, desempenho"), ("/idiomas", "idiomas do site e do painel"), ("/avatares", "avatares 3D"),
    ("/configuracoes", "perfil, usuários, marca, segurança da conta, sistema"), ("/configuracoes?aba=contas", "usuários e permissões"),
    ("/apps", "baixar os apps, código-fonte, commits"), ("/guia", "passo a passo de tudo"), ("/novidades", "o que há de novo em cada versão"),
]


def _like(q: str) -> str:
    return "%" + re.sub(r"[%_\\]", "", q.strip())[:80] + "%"


def buscar(q: str) -> list[dict]:
    q = (q or "").strip()
    if len(q) < 2:
        return []
    L = _like(q)
    out: list[dict] = []

    def add(tipo, titulo, sub, link, lista):
        for r in lista:
            out.append({"tipo": tipo, "titulo": titulo(r), "sub": sub(r), "link": link(r)})

    fp, pp = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    add("Ar", lambda r: r["nome"], lambda r: f"{r['projeto'] or 'sem sala'} · {'ligado' if r['ligado'] else 'desligado'}", lambda r: f"/aparelhos/{r['id']}",
        db.consultar(f"SELECT a.id, a.nome, a.ligado, p.nome AS projeto FROM aparelhos a LEFT JOIN projetos p ON p.id = a.projeto_id "
                     f"WHERE (a.nome ILIKE ? OR a.comodo ILIKE ? OR p.nome ILIKE ?){fp}{fa} ORDER BY a.nome LIMIT 6", (L, L, L, *pp, *pa)))
    fp2, pp2 = acesso.filtro_sql("id")
    add("Sala", lambda r: r["nome"], lambda r: r["descricao"] or "projeto", lambda r: "/projetos",
        db.consultar(f"SELECT id, nome, descricao FROM projetos WHERE (nome ILIKE ? OR descricao ILIKE ?){fp2} LIMIT 4", (L, L, *pp2)))
    add("Transmissor", lambda r: r["nome"], lambda r: f"{'online' if r['online'] else 'offline'}{' · ' + r['ip'] if r['ip'] else ''}", lambda r: "/transmissores",
        db.consultar("SELECT nome, online, ip FROM hubs WHERE nome ILIKE ? OR ip ILIKE ? LIMIT 4", (L, L)))
    add("Cena", lambda r: r["nome"], lambda r: "cena", lambda r: "/rotinas?aba=cenas", db.consultar("SELECT nome FROM cenas WHERE nome ILIKE ? LIMIT 4", (L,)))
    add("Automação", lambda r: r["nome"], lambda r: "ligada" if r["ativo"] else "desligada", lambda r: "/rotinas?aba=automacoes",
        db.consultar("SELECT nome, ativo FROM automacoes WHERE nome ILIKE ? LIMIT 4", (L,)))
    add("Agenda", lambda r: r["nome"], lambda r: f"às {r['hora']}", lambda r: "/rotinas?aba=agenda", db.consultar("SELECT nome, hora FROM agendamentos WHERE nome ILIKE ? LIMIT 4", (L,)))
    add("Fluxo", lambda r: r["nome"], lambda r: "ligado" if r["ativo"] else "desligado", lambda r: "/rotinas?aba=fluxos",
        db.consultar("SELECT nome, ativo FROM fluxos WHERE nome ILIKE ? OR descricao ILIKE ? LIMIT 4", (L, L)))
    add("Tarefa", lambda r: r["titulo"], lambda r: "concluída" if r["concluida"] else "aberta", lambda r: "/tarefas",
        db.consultar("SELECT titulo, concluida FROM tarefas WHERE titulo ILIKE ? ORDER BY concluida, atualizado_em DESC NULLS LAST LIMIT 5", (L,)))
    add("Bug", lambda r: f"#{r['id']} {r['titulo']}", lambda r: r["estado"], lambda r: f"/bugs?bug={r['id']}",
        db.consultar("SELECT id, titulo, estado FROM bugs WHERE titulo ILIKE ? OR descricao ILIKE ? ORDER BY (estado = 'aberto') DESC, id DESC LIMIT 4", (L, L)))
    if acesso.pode("usuarios.gerenciar"):
        add("Pessoa", lambda r: r["nome"] or r["email"], lambda r: f"{r['papel']}{'' if r['ativo'] else ' · desativada'}", lambda r: "/configuracoes?aba=contas",
            db.consultar("SELECT nome, email, papel, ativo FROM usuarios WHERE nome ILIKE ? OR email ILIKE ? LIMIT 4", (L, L)))
    add("Aparelho do escritório", lambda r: r["nome"], lambda r: r["tipo"], lambda r: {"luz": "/luzes", "cafeteira": "/cafeteira", "persiana": "/persianas", "fechadura": "/fechadura"}.get(r["tipo"], "/"),
        db.consultar("SELECT nome, tipo FROM dispositivos WHERE nome ILIKE ? LIMIT 4", (L,)))
    u = acesso.atual.get() or {}
    add("Conversa com a IA", lambda r: r["titulo"], lambda r: "conversa", lambda r: f"/ia?c={r['id']}",
        db.consultar("SELECT id, titulo FROM ia_conversas WHERE usuario_id = ? AND titulo ILIKE ? ORDER BY atualizado_em DESC LIMIT 3", (str(u.get("id") or ""), L)))
    t = q.lower()
    out += [{"tipo": "Tela", "titulo": d.split(":")[0].split(",")[0].capitalize()[:60], "sub": d, "link": r} for r, d in MAPA if t in d.lower() or t in r][:6]
    try:
        import json
        from pathlib import Path
        nov = json.loads((Path(__file__).with_name("novidades.json")).read_text(encoding="utf-8"))["versoes"]
        for v in nov:
            texto = " ".join([v["titulo"], *(v.get("novo") or []), *(v.get("melhorias") or []), *(v.get("correcoes") or [])])
            if t in texto.lower():
                out.append({"tipo": "Versão", "titulo": f"{v['versao']} · {v['titulo']}"[:90], "sub": v["data"], "link": f"/novidades#{v['versao']}"})
                if sum(1 for x in out if x["tipo"] == "Versão") >= 3:
                    break
    except Exception:  # noqa: BLE001
        pass
    return out[:40]


def perguntar(q: str) -> dict:
    """Resposta da IA para a busca: curta, com o caminho no painel. Só consulta (nada muda), nada é salvo."""
    from . import ia
    mapa = "\n".join(f"- {r}: {d}" for r, d in MAPA)
    pedido = (f"A pessoa digitou na BUSCA do sistema: \"{q[:400]}\"\n\nResponda em no máximo 4 linhas curtas, sem títulos. Se precisar de dados (ares, salas, "
              f"falhas, gasto…), use as ferramentas e dê só o número principal. TERMINE SEMPRE com a linha 'Onde ver: [nome da tela](/rota)' usando SÓ rotas desta lista "
              f"(pode citar até 2 telas).\n\nTelas do sistema:\n{mapa}")
    r = ia.conversar([{"role": "user", "content": pedido}], "busca", origem="ia:busca", leitura=True, esforco="baixo", anonimo=True)
    texto = r.get("texto") or ""
    rotas = {x for x, _ in MAPA}
    links = []
    for nome, rota in re.findall(r"\[([^\]]{1,60})\]\((/[^)\s]*)\)", texto):
        base = rota.split("#")[0]
        if base in rotas or re.fullmatch(r"/(aparelhos|ia)(/\d+|\?c=\d+)?", base) or base.startswith("/bugs?bug="):
            desc = dict(MAPA).get(base, "")
            links.append({"titulo": (desc.split(":")[0].split(",")[0].capitalize()[:40] if nome.startswith("/") and desc else nome), "link": rota})
    if not links:   # a IA não apontou a tela: sugere pelo assunto (palavras da pergunta que aparecem na descrição da tela)
        palavras = [w for w in re.findall(r"[a-zà-ú]{4,}", q.lower()) if w not in ("onde", "como", "quero", "posso", "qual", "quais", "para", "fazer", "está", "estão")]
        nota = sorted(((sum(w[:5] in d.lower() for w in palavras), r, d) for r, d in MAPA), reverse=True)
        links = [{"titulo": d.split(":")[0].split(",")[0].capitalize()[:40], "link": r} for n, r, d in nota[:2] if n]
    return {"texto": texto, "links": links[:6], "modelo": r.get("modelo")}
