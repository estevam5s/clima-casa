"""Comandos do bot do Telegram acrescentados na 0.6.8 (14 categorias novas, todos com função de verdade):
tarefas, backup, acessos do site e do sistema, relatórios por ar e por sala, ranking e comparações, agenda por dia,
previsão hora a hora, checklists, lembretes, calculadora de BTU e custo, placas, apps, treinamento e novidades por versão.

Registrado no fim de telegram_cmds.py (mesmo catálogo C, mesmas permissões e confirmações).
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from . import db
from .telegram_cmds import APP, C, CATS, NOME_CAT, _clima, _e, _inicio_dia, ares, brl, cmd, num, quando, tempo

_ANTES = len(C)
CATS += [
    ("tarefas", "Tarefas", "Suas tarefas, prazos, concluir, criar e os projetos da equipe"),
    ("backup", "Backup", "Saúde do backup, testar a restauração, gerar agora e cópias"),
    ("acessos", "Acessos e SEO", "Quem acessa o site e o sistema: páginas, cidades, aparelhos, origens e desempenho"),
    ("porar", "Relatórios por ar", "Gasto, horas, consumo, comandos e falhas de um ar em 1 a 90 dias"),
    ("porsala", "Relatórios por sala", "Gasto, horas, consumo, comandos e falhas de uma sala em 1 a 90 dias"),
    ("comparar", "Comparações e médias", "Esta semana × anterior, este mês × anterior, temperatura média, pico de uso"),
    ("agendadia", "Agenda por dia", "O que está agendado para cada dia da semana"),
    ("previsao", "Previsão hora a hora", "Temperatura e chuva nas próximas horas e dias, e a temperatura sugerida"),
    ("rotina", "Checklists", "Abertura e fechamento do escritório: o que está ligado, luzes, persianas e porta"),
    ("lembretes", "Lembretes", "O bot avisa você aqui daqui a 5 min a 24 h"),
    ("calc", "Calculadora", "BTU recomendado por área e custo de um ar por horas de uso"),
    ("placas", "Placas Arduino e ESP", "Qual placa usar, pino do relé e o que cada uma precisa"),
    ("apps", "Apps e treinamento", "Baixar os apps, versão atual, treinamento e certificado"),
    ("versoes", "Novidades por versão", "O que mudou em cada versão do sistema"),
]
NOME_CAT.update({k: r for k, r, _ in CATS})
MENU = [[{"text": "Menu", "callback_data": "m:menu"}]]


def _link(txt, rota):
    return [[{"text": txt, "url": f"{APP}{rota}"}], [{"text": "Menu", "callback_data": "m:menu"}]]


def _hoje() -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600))


# =====================================================================================================================
# TAREFAS
# =====================================================================================================================
def _minhas(uid, extra="", params=()):
    return db.consultar("SELECT t.id, t.titulo, t.prazo, t.prioridade, t.concluida, p.nome AS projeto FROM tarefas t JOIN tarefas_projetos p ON p.id = t.projeto_id "
                        f"WHERE t.responsavel_id::text = ? AND NOT p.arquivado{extra} ORDER BY t.concluida, t.prazo NULLS LAST, t.id LIMIT 30", (str(uid), *params))


def _lista_tarefas(ctx, titulo, itens, vazio="Nada aqui."):
    if not itens:
        return ctx.enviar(f"<b>{_e(titulo)}</b>\n{vazio}", _link("Abrir Tarefas", "/tarefas"))
    linhas = [f"{'✓' if t['concluida'] else '○'} <b>#{t['id']}</b> {_e(t['titulo'][:80])}" + (f" · {t['prazo'][8:]}/{t['prazo'][5:7]}" if t.get("prazo") else "")
              + (f" · {_e(t['projeto'])}" if t.get("projeto") else "") for t in itens]
    botoes = [[{"text": f"Concluir #{t['id']}", "callback_data": f"x:concluir_tarefa:{t['id']}"}] for t in itens if not t["concluida"]][:6]
    ctx.enviar(f"<b>{_e(titulo)}</b> ({len(itens)})\n" + "\n".join(linhas), botoes + _link("Abrir Tarefas", "/tarefas"))


cmd("tarefas", "tarefas", "Suas tarefas abertas", top=60)(lambda ctx, a: _lista_tarefas(ctx, "Suas tarefas", _minhas(ctx.u["id"], " AND NOT t.concluida"), "Nenhuma tarefa com você."))
cmd("tarefas_hoje", "tarefas", "Suas tarefas com prazo hoje")(lambda ctx, a: _lista_tarefas(ctx, "Prazo hoje", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prazo = ?", (_hoje(),))))
cmd("tarefas_atrasadas", "tarefas", "Suas tarefas atrasadas")(lambda ctx, a: _lista_tarefas(ctx, "Atrasadas", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prazo < ?", (_hoje(),)), "Nenhuma atrasada."))
cmd("tarefas_amanha", "tarefas", "Suas tarefas com prazo amanhã")(lambda ctx, a: _lista_tarefas(ctx, "Prazo amanhã", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prazo = ?", (time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 + 86400)),))))
cmd("tarefas_semana", "tarefas", "Suas tarefas com prazo nos próximos 7 dias")(lambda ctx, a: _lista_tarefas(ctx, "Próximos 7 dias", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prazo BETWEEN ? AND ?", (_hoje(), time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 + 7 * 86400))))))
cmd("tarefas_sem_prazo", "tarefas", "Suas tarefas sem prazo")(lambda ctx, a: _lista_tarefas(ctx, "Sem prazo", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prazo IS NULL")))
cmd("tarefas_concluidas", "tarefas", "O que você concluiu nos últimos 7 dias")(lambda ctx, a: _lista_tarefas(ctx, "Concluídas (7 dias)", _minhas(ctx.u["id"], " AND t.concluida AND t.concluida_em > ?", (db.agora() - 7 * 86400,))))
for _p, _r in (("urgente", "urgentes"), ("alta", "de prioridade alta"), ("media", "de prioridade média"), ("baixa", "de prioridade baixa")):
    cmd(f"tarefas_{_p}", "tarefas", f"Suas tarefas {_r}")(lambda ctx, a, _p=_p, _r=_r: _lista_tarefas(ctx, f"Tarefas {_r}", _minhas(ctx.u["id"], " AND NOT t.concluida AND t.prioridade = ?", (_p,))))
for _d in (1, 7, 15, 30, 60, 90):
    def _fcd(ctx, a, _d=_d):
        r = db.um("SELECT count(*) FILTER (WHERE concluida AND concluida_em > ?) AS feitas, count(*) FILTER (WHERE criado_em > ?) AS criadas FROM tarefas", (db.agora() - _d * 86400, db.agora() - _d * 86400))
        ctx.enviar(f"<b>Tarefas em {_d} dia(s)</b>\nCriadas: {r['criadas']}\nConcluídas: {r['feitas']}", _link("Abrir Tarefas", "/tarefas?projeto=projetos"))
    cmd(f"tarefas_{_d}d", "tarefas", f"Tarefas criadas e concluídas em {_d} dia(s) (equipe)")(_fcd)


@cmd("projetos_tarefas", "tarefas", "Projetos de tarefas: abertas, atrasadas e status")
def c_projetos_tarefas(ctx, a):
    ps = db.consultar("""SELECT p.id, p.nome, p.status, COUNT(t.id) FILTER (WHERE NOT t.concluida AND t.pai_id IS NULL) AS abertas,
        COUNT(t.id) FILTER (WHERE NOT t.concluida AND t.prazo < ?) AS atrasadas FROM tarefas_projetos p LEFT JOIN tarefas t ON t.projeto_id = p.id
        WHERE NOT p.arquivado GROUP BY p.id ORDER BY p.nome""", (_hoje(),))
    st = {"no_caminho": "no caminho", "em_risco": "em risco", "fora_do_caminho": "fora do caminho", "pausado": "pausado", "concluido": "concluído"}
    ctx.enviar("<b>Projetos</b>\n" + ("\n".join(f"• {_e(p['nome'])}: {p['abertas']} aberta(s)" + (f", {p['atrasadas']} atrasada(s)" if p["atrasadas"] else "")
                                                + (f" · {st[p['status']]}" if p["status"] in st else "") for p in ps) or "Nenhum projeto."), _link("Abrir Tarefas", "/tarefas?projeto=projetos"))


@cmd("tarefa", "tarefas", "Detalhe de uma tarefa", "/tarefa NÚMERO", arg="texto")
def c_tarefa(ctx, a, resto=""):
    n = "".join(ch for ch in str(resto or a or "") if ch.isdigit())
    t = db.um("SELECT t.*, p.nome AS projeto FROM tarefas t JOIN tarefas_projetos p ON p.id = t.projeto_id WHERE t.id = ?", (int(n),)) if n else None
    if not t:
        return ctx.enviar("Use /tarefa e o número (ex.: /tarefa 12).")
    ctx.enviar(f"<b>#{t['id']} {_e(t['titulo'])}</b>\nProjeto: {_e(t['projeto'])}\nPrazo: {t['prazo'] or 'sem prazo'} · prioridade {t['prioridade']}\n{'Concluída' if t['concluida'] else 'Aberta'}"
               + (f"\n\n{_e(t['descricao'][:600])}" if t["descricao"] else ""),
               ([[{"text": "Concluir", "callback_data": f"x:concluir_tarefa:{t['id']}"}]] if not t["concluida"] else []) + _link("Abrir no painel", f"/tarefas?projeto={t['projeto_id']}&tarefa={t['id']}"))


@cmd("concluir_tarefa", "tarefas", "Marca uma tarefa como concluída", "/concluir_tarefa NÚMERO", arg="texto")
def c_concluir_tarefa(ctx, a, resto=""):
    n = "".join(ch for ch in str(resto or a or "") if ch.isdigit())
    if not n or ctx.u.get("papel") == "visualizador":
        return ctx.enviar("Use /concluir_tarefa e o número da tarefa." if not n else "Seu papel só permite ver as tarefas.")
    t = db.um("UPDATE tarefas SET concluida = true, concluida_em = ?, atualizado_em = ? WHERE id = ? AND NOT concluida RETURNING id, titulo", (db.agora(), db.agora(), int(n)))
    if not t:
        return ctx.enviar("Tarefa não encontrada ou já concluída.")
    from . import tarefas
    tarefas.evento(t["id"], ctx.u, "Concluiu (pelo Telegram)")
    ctx.enviar(f"✓ Concluída: <b>#{t['id']} {_e(t['titulo'])}</b>", MENU)


@cmd("nova_tarefa", "tarefas", "Cria uma tarefa para você no primeiro projeto", "/nova_tarefa TEXTO", arg="texto")
def c_nova_tarefa(ctx, a, resto=""):
    titulo = str(resto or a or "").strip()
    if not titulo or ctx.u.get("papel") == "visualizador":
        return ctx.enviar("Use /nova_tarefa e o texto (ex.: /nova_tarefa Comprar pilhas do controle)." if not titulo else "Seu papel só permite ver as tarefas.")
    p = db.um("SELECT id, nome FROM tarefas_projetos WHERE NOT arquivado ORDER BY ordem, id LIMIT 1")
    if not p:
        return ctx.enviar("Crie um projeto em Tarefas antes.", _link("Abrir Tarefas", "/tarefas"))
    s = db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem LIMIT 1", (p["id"],))
    t = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, responsavel_id, ordem, criado_por, criado_em, atualizado_em) VALUES (?,?,?,CAST(? AS uuid),?,?,?,?) RETURNING id",
              (p["id"], (s or {}).get("id"), titulo[:300], str(ctx.u["id"]), time.time(), ctx.u["id"], db.agora(), db.agora()))
    from . import tarefas
    tarefas.evento(t["id"], ctx.u, "Criou a tarefa (pelo Telegram)")
    ctx.enviar(f"Criada: <b>#{t['id']} {_e(titulo[:120])}</b> em {_e(p['nome'])}.", _link("Abrir no painel", f"/tarefas?projeto={p['id']}&tarefa={t['id']}"))


@cmd("caixa_tarefas", "tarefas", "Últimos comentários e mudanças nas suas tarefas")
def c_caixa_tarefas(ctx, a):
    uid = str(ctx.u["id"])
    itens = db.consultar("""SELECT c.texto, c.tipo, c.autor_nome, c.criado_em, t.id, t.titulo FROM tarefas_comentarios c JOIN tarefas t ON t.id = c.tarefa_id
        WHERE COALESCE(c.autor_id::text, '') <> ? AND (t.responsavel_id::text = ? OR t.criado_por::text = ?) ORDER BY c.criado_em DESC LIMIT 12""", (uid, uid, uid))
    ctx.enviar("<b>Caixa de entrada</b>\n" + ("\n".join(f"• #{x['id']} {_e(x['titulo'][:40])}: <b>{_e(x['autor_nome'])}</b> {_e(x['texto'][:80])} ({quando(x['criado_em'])})" for x in itens)
                                             or "Nada novo."), _link("Abrir a caixa", "/tarefas?projeto=caixa"))


# =====================================================================================================================
# BACKUP
# =====================================================================================================================
@cmd("backup_saude", "backup", "Último backup, próximo, teste de restauração e cópia local", perm="configuracoes.gerenciar")
def c_backup_saude(ctx, a):
    from . import backup_sistema as bs
    s = bs.saude()
    t, loc = s.get("teste"), s.get("local_estado")
    ctx.enviar(f"<b>Saúde do backup</b>\nÚltimo: {('há ' + num(s['horas_desde'], 0) + ' h') if s['horas_desde'] is not None else 'nenhum'}\n"
               f"Próximo agendado: {quando(s['proximo']) if s['proximo'] else 'desligado'}\nTeste de restauração: {('passou' if t['ok'] else 'FALHOU') + ' em ' + quando(t['em']) if t else 'nunca'}\n"
               f"Cópia no computador: {(str(len(loc.get('arquivos') or [])) + ' arquivo(s) em ' + loc.get('maquina', '')) if s['local'].get('ativo') and loc else 'desligada'}\n"
               f"Guardados: {s['quantidade']}", _link("Abrir Backup", "/backup"))


@cmd("backup_lista", "backup", "Os 10 backups mais novos", perm="configuracoes.gerenciar")
def c_backup_lista(ctx, a):
    from . import backup_sistema as bs
    lst = bs.listar()[:10]
    ctx.enviar("<b>Backups</b>\n" + ("\n".join(f"• {_e(x['arquivo'])} · {round((x['tamanho'] or 0) / 1048576, 2)} MB · {_e(x['tipo'])}" for x in lst) or "Nenhum."), _link("Abrir Backup", "/backup"))


@cmd("backup_agora", "backup", "Gera um backup completo agora (pede confirmação)", perm="configuracoes.gerenciar", confirmar=True)
def c_backup_agora(ctx, a):
    from . import backup_sistema as bs
    r = bs.gerar(f"telegram:{ctx.u.get('email', '')}", None, rotulo="pelo Telegram")
    ctx.enviar(f"Backup gerado: <b>{_e(r['arquivo'])}</b>", _link("Abrir Backup", "/backup"))


@cmd("backup_testar", "backup", "Simula a restauração do último backup (nada é gravado)", perm="configuracoes.gerenciar")
def c_backup_testar(ctx, a):
    from . import backup_sistema as bs
    lst = bs.listar()
    if not lst:
        return ctx.enviar("Nenhum backup para testar.")
    r = bs.testar_restauracao(lst[0]["arquivo"])
    ctx.enviar(f"Teste de {_e(lst[0]['arquivo'])}: <b>{'passou' if r['ok'] else 'falhou'}</b> ({r['tabelas']} tabela(s))" + (f"\n{_e('; '.join(r['erros']))}" if r["erros"] else ""), MENU)


@cmd("backup_agenda", "backup", "Como está o backup agendado", perm="configuracoes.gerenciar")
def c_backup_agenda(ctx, a):
    from . import backup_sistema as bs
    g = bs.agenda()
    fr = {"6h": "a cada 6 h", "12h": "a cada 12 h", "diario": "todo dia", "semanal": "toda semana"}.get(g["frequencia"], g["frequencia"])
    ctx.enviar(f"<b>Backup agendado</b>: {'ligado' if g['ativo'] else 'desligado'}\n{fr} às {g['hora']}\nRetenção: {'7 diários, 4 semanais, 12 mensais' if g.get('retencao') == 'gfs' else 'os ' + str(g['manter']) + ' mais novos'}\n"
               f"Testar depois: {'sim' if g.get('testar', True) else 'não'}\nPróximo: {quando(g.get('proximo')) if g.get('proximo') else '-'}", _link("Abrir Backup", "/backup"))


@cmd("backup_local", "backup", "Cópia dos backups no computador do agente", perm="configuracoes.gerenciar")
def c_backup_local(ctx, a):
    c, e = db.cfg("backup_local") or {}, db.cfg("backup_local_estado") or {}
    if not c.get("ativo"):
        return ctx.enviar("A cópia local está desligada. Ligue em Backup → Cópia fora da nuvem.", _link("Abrir Backup", "/backup"))
    ctx.enviar(f"<b>Cópia local</b> em {_e(e.get('maquina', '?'))}\n{len(e.get('arquivos') or [])} arquivo(s) · {e.get('livre_gb', '?')} GB livres · conferido {quando(e.get('em'))}", MENU)


for _d in (1, 7, 30):
    def _fbd(ctx, a, _d=_d):
        from . import backup_sistema as bs
        lim = time.time() - _d * 86400
        lst = [x for x in bs.listar() if bs._epoch(x.get("criado_em")) > lim]
        ctx.enviar(f"<b>Backups em {_d} dia(s)</b>: {len(lst)} · {round(sum(x['tamanho'] or 0 for x in lst) / 1048576, 1)} MB", MENU)
    cmd(f"backups_{_d}d", "backup", f"Quantos backups foram feitos em {_d} dia(s)", perm="configuracoes.gerenciar")(_fbd)
cmd("backup_uso", "backup", "Espaço que os backups ocupam", perm="configuracoes.gerenciar")(
    lambda ctx, a: ctx.enviar("<b>Espaço dos backups</b>\n" + "\n".join(f"• {_e(k)}: {v['arquivos']} arquivo(s), {round(v['bytes'] / 1048576, 1)} MB" for k, v in __import__("app.backup_sistema", fromlist=["uso"]).uso()["por_tipo"].items()) or "Nada.", MENU))
cmd("backup_regra_321", "backup", "O que é a regra 3-2-1 de backup")(lambda ctx, a: ctx.enviar("<b>Regra 3-2-1</b>\n3 cópias dos dados, em 2 lugares diferentes, 1 delas fora do lugar principal. Aqui: o banco, o backup no Storage e a cópia no computador do agente (Backup → Cópia fora da nuvem).", _link("Abrir Backup", "/backup")))

# =====================================================================================================================
# ACESSOS (site e sistema) por período
# =====================================================================================================================
_ACESSO = [
    ("resumo", "Resumo", lambda d: f"Visitantes: {d['totais']['visitantes']}\nSessões: {d['totais']['sessoes']}\nPáginas: {d['totais']['paginas']}\nCliques: {d['totais']['cliques']}\nTempo médio: {tempo(d['totais']['duracao_media_s'])}\nRejeição: {d['totais']['rejeicao']}%\nOnline agora: {d['totais']['online']}"),
    ("paginas", "Páginas mais vistas", lambda d: "\n".join(f"• {_e(r['rota'])}: {r['paginas']}" for r in d["rotas"][:12]) or "Nada."),
    ("cidades", "Cidades", lambda d: "\n".join(f"• {_e(r['cidade'])}, {_e(r['regiao'])}: {r['sessoes']}" for r in d["cidades"][:12]) or "Nada."),
    ("aparelhos", "Aparelhos e navegadores", lambda d: "\n".join(f"• {_e(r['nome'])}: {r['sessoes']}" for r in d["dispositivos"] + d["navegadores"][:6]) or "Nada."),
    ("origens", "De onde vêm", lambda d: (f"Diretas: {d['diretas']}\n" + "\n".join(f"• {_e(r['nome'])}: {r['n']}" for r in d["origens"][:10]))),
    ("vitais", "Desempenho (Web Vitals p75)", lambda d: "\n".join(f"• {k}: {round(v['p75']) if v['p75'] and k != 'CLS' else v['p75']} ({v['nota'] or '-'})" for k, v in d["vitais"].items()) or "Sem medições."),
    ("cliques", "Cliques mais feitos", lambda d: "\n".join(f"• {_e(r['nome'])}: {r['n']}" for r in d["cliques"][:12]) or "Nada."),
    ("campanhas", "Campanhas (UTM)", lambda d: "\n".join(f"• {_e(r['fonte'])}/{_e(r['meio'])} {_e(r['campanha'])}: {r['sessoes']}" for r in d.get("campanhas", [])[:10]) or "Nenhuma visita com UTM."),
]
for _o, _on in (("site", "site"), ("sistema", "sistema")):
    for _d in (1, 7, 30, 90):
        for _k, _t, _f in _ACESSO:
            def _fac(ctx, a, _o=_o, _d=_d, _t=_t, _f=_f, _on=_on):
                from . import analise
                ctx.enviar(f"<b>{_t} · {_on} · {'hoje' if _d == 1 else f'{_d} dias'}</b>\n" + _f(analise.resumo(_o, _d)), _link("Abrir Acessos", "/analise"))
            cmd(f"{_on}_{_k}_{_d}d", "acessos", f"{_t} do {_on} em {'1 dia' if _d == 1 else f'{_d} dias'}", perm="configuracoes.gerenciar")(_fac)
for _d in (1, 7, 30, 90):
    def _fer(ctx, a, _d=_d):
        from . import analise
        d = analise.resumo("sistema", _d)
        ctx.enviar(f"<b>Erros nas telas ({_d} dia(s))</b>\n" + ("\n".join(f"• {_e(r['nome'][:80])} · {_e(r['rota'])}: {r['n']}" for r in d["erros"][:10]) or "Nenhum."), MENU)
    cmd(f"erros_telas_{_d}d", "acessos", f"Erros de JavaScript no sistema em {_d} dia(s)", perm="configuracoes.gerenciar")(_fer)
    def _fap(ctx, a, _d=_d):
        from . import analise
        d = analise.resumo("sistema", _d)
        ctx.enviar(f"<b>Chamadas mais lentas ({_d} dia(s))</b>\n" + ("\n".join(f"• {_e(r['rota'][:60])}: p95 {round(r['p95'])} ms" for r in d["api"][:10]) or "Sem amostras."), MENU)
    cmd(f"api_lenta_{_d}d", "acessos", f"Chamadas da API mais lentas em {_d} dia(s)", perm="configuracoes.gerenciar")(_fap)

# =====================================================================================================================
# RELATÓRIOS POR AR E POR SALA
# =====================================================================================================================
_METRICAS = [("gasto", "Gasto", lambda r: f"{brl(r['custo'])} (estimativa)"), ("horas", "Horas ligado", lambda r: f"{num(r['horas_ligado'])} h"),
             ("kwh", "Consumo", lambda r: f"{num(r['kwh'])} kWh"), ("comandos", "Comandos", lambda r: f"{r['comandos']} ({r['sucesso_pct']}% ok)"),
             ("falhas", "Falhas", lambda r: f"{r['falhas']} de {r['comandos']} comando(s)")]
for _d in (1, 7, 15, 30, 60, 90):
    for _k, _t, _f in _METRICAS:
        def _far(ctx, a, _d=_d, _t=_t, _f=_f):
            from . import relatorio
            fim = db.agora(); r = relatorio.montar(fim - _d * 86400, fim, aparelho_id=a["id"])["resumo"]
            ctx.enviar(f"<b>{_e(a['nome'])}</b> · {_t} em {_d} dia(s)\n{_f(r)}", MENU)
        cmd(f"{_k}_ar_{_d}d", "porar", f"{_t} de um ar em {_d} dia(s)", f"/{_k}_ar_{_d}d NOME", arg="ar?", perm="relatorios.ver")(_far)
        def _fsl(ctx, s, _d=_d, _t=_t, _f=_f):
            from . import relatorio
            fim = db.agora(); r = relatorio.montar(fim - _d * 86400, fim, projeto_id=s["id"])["resumo"]
            ctx.enviar(f"<b>{_e(s['nome'])}</b> · {_t} em {_d} dia(s)\n{_f(r)}", MENU)
        cmd(f"{_k}_sala_{_d}d", "porsala", f"{_t} de uma sala em {_d} dia(s)", f"/{_k}_sala_{_d}d NOME", arg="sala", perm="relatorios.ver")(_fsl)
for _h in (1, 3, 6, 12, 24, 48, 72, 168):
    def _fha(ctx, a, _h=_h):
        lst = db.consultar("SELECT quando, origem, acao, ok FROM atividade WHERE aparelho_id = ? AND quando > ? ORDER BY quando DESC LIMIT 15", (a["id"], db.agora() - _h * 3600))
        ctx.enviar(f"<b>{_e(a['nome'])}</b> · últimas {_h} h\n" + ("\n".join(f"{quando(x['quando'])} {'✓' if x['ok'] else '✗'} {_e(x['acao'][:60])} ({_e(x['origem'])})" for x in lst) or "Nada nesse período."), MENU)
    cmd(f"historico_ar_{_h}h", "porar", f"O que aconteceu com um ar nas últimas {_h} h", f"/historico_ar_{_h}h NOME", arg="ar?", perm="atividade.ver")(_fha)
for _h in (1, 2, 4, 6, 8, 10, 12):
    def _fcu(ctx, a, _h=_h):
        tarifa = float((db.cfg("tarifa_kwh") or 0.95) if not isinstance(db.cfg("tarifa_kwh"), dict) else db.cfg("tarifa_kwh").get("valor", 0.95))
        w = float(a.get("potencia_w") or 0)
        if not w:
            return ctx.enviar(f"{_e(a['nome'])} está sem potência cadastrada (Aparelho → Ajustes → Potência).")
        kwh = w / 1000 * _h
        ctx.enviar(f"<b>{_e(a['nome'])}</b> ligado {_h} h\n{num(kwh)} kWh · {brl(kwh * tarifa)} (potência {int(w)} W, tarifa {brl(tarifa)}/kWh)\nPor mês (22 dias úteis): {brl(kwh * tarifa * 22)}", MENU)
    cmd(f"custo_{_h}h", "calc", f"Quanto custa um ar ligado {_h} h por dia", f"/custo_{_h}h NOME", arg="ar?")(_fcu)

# =====================================================================================================================
# COMPARAÇÕES E MÉDIAS
# =====================================================================================================================
def _cmp(ctx, titulo, ini_a, fim_a, ini_b, fim_b):
    from . import relatorio
    a, b = relatorio.montar(ini_a, fim_a)["resumo"], relatorio.montar(ini_b, fim_b)["resumo"]
    var = lambda x, y: (f"{'+' if x >= y else ''}{round((x - y) / y * 100)}%" if y else "-")  # noqa: E731
    ctx.enviar(f"<b>{titulo}</b>\nGasto: {brl(a['custo'])} × {brl(b['custo'])} ({var(a['custo'], b['custo'])})\nHoras ligado: {num(a['horas_ligado'])} × {num(b['horas_ligado'])} ({var(a['horas_ligado'], b['horas_ligado'])})\n"
               f"Comandos: {a['comandos']} × {b['comandos']} ({var(a['comandos'], b['comandos'])})\nFalhas: {a['falhas']} × {b['falhas']}", MENU)


cmd("comparar_hoje_ontem", "comparar", "Hoje até agora × ontem inteiro", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "Hoje × ontem", _inicio_dia(), db.agora(), _inicio_dia(-1), _inicio_dia()))
cmd("comparar_7d", "comparar", "Últimos 7 dias × os 7 anteriores", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "7 dias × 7 anteriores", db.agora() - 7 * 86400, db.agora(), db.agora() - 14 * 86400, db.agora() - 7 * 86400))
cmd("comparar_30d", "comparar", "Últimos 30 dias × os 30 anteriores", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "30 dias × 30 anteriores", db.agora() - 30 * 86400, db.agora(), db.agora() - 60 * 86400, db.agora() - 30 * 86400))
cmd("comparar_semana_passada", "comparar", "Semana passada × retrasada", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "Semana passada × retrasada", db.agora() - 14 * 86400, db.agora() - 7 * 86400, db.agora() - 21 * 86400, db.agora() - 14 * 86400))
cmd("comparar_90d", "comparar", "Últimos 90 dias × os 90 anteriores", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "90 dias × 90 anteriores", db.agora() - 90 * 86400, db.agora(), db.agora() - 180 * 86400, db.agora() - 90 * 86400))
cmd("comparar_mesmo_dia", "comparar", "Hoje × o mesmo dia da semana passada", perm="relatorios.ver")(lambda ctx, a: _cmp(ctx, "Hoje × mesmo dia da semana passada", _inicio_dia(), db.agora(), _inicio_dia(-7), _inicio_dia(-7) + (db.agora() - _inicio_dia())))
for _d in (1, 7, 30):
    def _ftm(ctx, a, _d=_d):
        r = __import__("app.telegram_cmds", fromlist=["_relatorio"])._relatorio(_d)
        ctx.enviar(f"<b>Temperatura média escolhida ({_d} dia(s))</b>: {num(r['resumo']['temperatura_media'])}°" if r["resumo"]["temperatura_media"] else "Sem comandos de temperatura nesse período.", MENU)
    cmd(f"temp_media_{_d}d", "comparar", f"Temperatura média escolhida em {_d} dia(s)", perm="relatorios.ver")(_ftm)
for _d in (1, 7, 30, 90):
    def _fpu(ctx, a, _d=_d):
        r = __import__("app.telegram_cmds", fromlist=["_relatorio"])._relatorio(_d)
        ph = sorted(r["por_hora"], key=lambda x: -(x.get("comandos") or x.get("n") or 0))[:5] if isinstance(r["por_hora"], list) else []
        ctx.enviar(f"<b>Horários de mais uso ({_d} dia(s))</b>\n" + ("\n".join(f"• {x.get('hora')}h: {x.get('comandos') or x.get('n') or 0} comando(s)" for x in ph) or "Sem dados."), MENU)
    cmd(f"pico_uso_{_d}d", "comparar", f"Horários de mais uso em {_d} dia(s)", perm="relatorios.ver")(_fpu)
    def _ffe(ctx, a, _d=_d):
        r = __import__("app.telegram_cmds", fromlist=["_relatorio"])._relatorio(_d)["resumo"]
        ctx.enviar(f"<b>Fora do expediente ({_d} dia(s))</b>\n{num(r['fora_expediente_h'])} h ligado ({r['fora_expediente_pct']}% do tempo) · {brl(r['custo_fora_expediente'])}", MENU)
    cmd(f"fora_expediente_{_d}d", "comparar", f"Ar ligado fora do expediente em {_d} dia(s)", perm="relatorios.ver")(_ffe)
    def _fss(ctx, a, _d=_d):
        r = __import__("app.telegram_cmds", fromlist=["_relatorio"])._relatorio(_d)["resumo"]
        ctx.enviar(f"<b>Sessões de uso ({_d} dia(s))</b>\n{r['sessoes']} vez(es) ligado · em média {num(r['sessao_media_h'])} h cada", MENU)
    cmd(f"sessoes_{_d}d", "comparar", f"Quantas vezes os ares ficaram ligados e por quanto tempo ({_d} dia(s))", perm="relatorios.ver")(_fss)

# =====================================================================================================================
# AGENDA POR DIA DA SEMANA
# =====================================================================================================================
_DIAS = [("domingo", 0), ("segunda", 1), ("terca", 2), ("quarta", 3), ("quinta", 4), ("sexta", 5), ("sabado", 6)]
_NOME_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]


def _agenda_do_dia(ctx, dia):
    itens = db.consultar("SELECT g.*, a.nome AS ar FROM agendamentos g LEFT JOIN aparelhos a ON a.id = g.aparelho_id WHERE g.ativo = 1 ORDER BY g.hora")
    lst = [g for g in itens if str(dia) in str(g.get("dias") or "0123456").replace(",", "")]
    ctx.enviar(f"<b>Agenda de {_NOME_DIA[dia]}</b>\n" + ("\n".join(f"• {g.get('hora')} {_e(g.get('nome') or g.get('ar') or '')}: {'liga' if g.get('ligado') else 'desliga'}" for g in lst[:20]) or "Nada agendado."), _link("Abrir Agenda", "/agendamentos"))


for _k, _n in _DIAS:
    cmd(f"agenda_{_k}", "agendadia", f"O que está agendado para {_NOME_DIA[_n]}")(lambda ctx, a, _n=_n: _agenda_do_dia(ctx, _n))
cmd("agenda_amanha", "agendadia", "O que está agendado para amanhã")(lambda ctx, a: _agenda_do_dia(ctx, (time.gmtime(time.time() - 3 * 3600 + 86400).tm_wday + 1) % 7))

# =====================================================================================================================
# PREVISÃO
# =====================================================================================================================
for _h in range(1, 13):
    def _fph(ctx, a, _h=_h):
        c = _clima(); p = (c.get("proximas") or [])[_h - 1:_h]
        if not p:
            return ctx.enviar("Previsão indisponível agora.")
        x = p[0]
        ctx.enviar(f"<b>Daqui a {_h} h ({x['hora']})</b>\n{num(x['temperatura'])}° · {_e(x['condicao'])} · chance de chuva {x['chuva']}%", MENU)
    cmd(f"previsao_{_h}h", "previsao", f"Tempo daqui a {_h} hora(s) em Florianópolis")(_fph)
for _i, _r in ((0, "hoje"), (1, "amanhã"), (2, "depois de amanhã")):
    def _fpd(ctx, a, _i=_i, _r=_r):
        d = (_clima().get("dias") or [])[_i:_i + 1]
        if not d:
            return ctx.enviar("Previsão indisponível agora.")
        x = d[0]
        ctx.enviar(f"<b>{_r.capitalize()} ({x['data'][8:]}/{x['data'][5:7]})</b>\n{_e(x['condicao'])} · mín. {num(x['min'])}° · máx. {num(x['max'])}° · chuva {x['chuva']}%", MENU)
    cmd(f"previsao_{['hoje', 'amanha', 'depois'][_i]}", "previsao", f"Previsão de {_r}")(_fpd)


@cmd("chuva_proximas", "previsao", "Em que horas deve chover nas próximas 12 h")
def c_chuva(ctx, a):
    p = [x for x in (_clima().get("proximas") or []) if x["chuva"] >= 50]
    ctx.enviar("<b>Chuva nas próximas 12 h</b>\n" + ("\n".join(f"• {x['hora']}: {x['chuva']}%" for x in p) or "Sem previsão de chuva forte (menos de 50%)."), MENU)


@cmd("temperatura_sugerida", "previsao", "Temperatura sugerida para o ar com o tempo de agora")
def c_sugerida(ctx, a):
    c = _clima()
    t = c.get("temperatura")
    if t is None:
        return ctx.enviar("Sem o tempo de agora.")
    alvo = 24 if t >= 30 else 23 if t >= 26 else 24 if t >= 20 else 22
    ctx.enviar(f"Lá fora: {num(t)}° (sensação {num(c.get('sensacao'))}°).\n<b>Sugestão: {alvo}°</b> no modo {'frio' if t >= 20 else 'quente'}. Regra prática: diferença de até 7° entre dentro e fora evita choque térmico e gasto alto.", MENU)


@cmd("previsao_tabela", "previsao", "As próximas 12 h numa tabela")
def c_prev_tab(ctx, a):
    p = _clima().get("proximas") or []
    ctx.enviar("<b>Próximas 12 h</b>\n<pre>" + "\n".join(f"{x['hora']}  {num(x['temperatura']):>5}°  chuva {x['chuva']:>3}%" for x in p) + "</pre>", MENU)

# =====================================================================================================================
# CHECKLISTS
# =====================================================================================================================
def _checklist(ctx, titulo, fechamento):
    lig = [x for x in ares() if x["ligado"]]
    disp = db.consultar("SELECT tipo, nome, estado FROM dispositivos WHERE tipo IN ('luz','persiana','fechadura','cafeteira')")
    def st(d):
        e = d["estado"] if isinstance(d["estado"], dict) else json.loads(d["estado"] or "{}")
        return e
    luzes = [d for d in disp if d["tipo"] == "luz" and st(d).get("ligado")]
    porta = [d for d in disp if d["tipo"] == "fechadura"]
    linhas = [f"{'⚠' if fechamento and lig else '✓'} Ares ligados: {len(lig)}" + (f" ({_e(', '.join(x['nome'] for x in lig[:8]))})" if lig else ""),
              f"{'⚠' if fechamento and luzes else '✓'} Luzes acesas: {len(luzes)}",
              f"• Fechadura: {'cadastrada' if porta else 'sem fechadura cadastrada'}"]
    from . import transmissor
    linhas.append(f"{'✓' if transmissor.agente_online() else '⚠'} Agente do escritório {'online' if transmissor.agente_online() else 'offline'}")
    botoes = ([[{"text": f"Desligar os {len(lig)} ares", "callback_data": "x:desligartodos"}]] if fechamento and lig and "desligartodos" in C else [])
    ctx.enviar(f"<b>{titulo}</b>\n" + "\n".join(linhas), botoes + MENU)


cmd("checklist_abertura", "rotina", "Checklist de abertura do escritório")(lambda ctx, a: _checklist(ctx, "Abertura do escritório", False))
cmd("checklist_fechamento", "rotina", "Checklist de fechamento: o que ficou ligado")(lambda ctx, a: _checklist(ctx, "Fechamento do escritório", True))
cmd("checklist_fim_de_semana", "rotina", "Antes do fim de semana: o que ficou ligado")(lambda ctx, a: _checklist(ctx, "Antes do fim de semana", True))
cmd("checklist_feriado", "rotina", "Antes de um feriado: o que ficou ligado")(lambda ctx, a: _checklist(ctx, "Antes do feriado", True))

# =====================================================================================================================
# LEMBRETES (o agente manda a mensagem na hora; config telegram_lembretes)
# =====================================================================================================================
CHAVE_LEMB = "telegram_lembretes"
for _m in (5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720, 1440):
    def _flb(ctx, a, resto="", _m=_m):
        texto = (resto or "").strip()[:300] or "Lembrete"
        lst = db.cfg(CHAVE_LEMB) or []
        if len([x for x in lst if x["cid"] == ctx.cid]) >= 20:
            return ctx.enviar("Você já tem 20 lembretes marcados. Veja em /lembretes.")
        lst.append({"cid": ctx.cid, "uid": str(ctx.u["id"]), "quando": int(time.time()) + _m * 60, "texto": texto, "id": f"{int(time.time())}{len(lst)}"})
        db.set_cfg(CHAVE_LEMB, lst)
        ctx.enviar(f"Combinado: aviso aqui {('daqui a ' + tempo(_m * 60))} ({quando(time.time() + _m * 60)}).\n<i>{_e(texto)}</i>", MENU)
    cmd(f"lembrar_{_m}min" if _m < 60 else f"lembrar_{_m // 60}h", "lembretes", f"Me lembre daqui a {tempo(_m * 60)}", f"/lembrar_{_m}min TEXTO" if _m < 60 else f"/lembrar_{_m // 60}h TEXTO")(_flb)


@cmd("lembretes", "lembretes", "Seus lembretes marcados")
def c_lembretes(ctx, a):
    lst = sorted([x for x in (db.cfg(CHAVE_LEMB) or []) if x["cid"] == ctx.cid], key=lambda x: x["quando"])
    ctx.enviar("<b>Lembretes</b>\n" + ("\n".join(f"• {quando(x['quando'])}: {_e(x['texto'][:80])}" for x in lst) or "Nenhum. Ex.: /lembrar_30min ligar o ar da reunião"), MENU)


@cmd("cancelar_lembretes", "lembretes", "Cancela todos os seus lembretes")
def c_cancelar_lemb(ctx, a):
    lst = db.cfg(CHAVE_LEMB) or []
    db.set_cfg(CHAVE_LEMB, [x for x in lst if x["cid"] != ctx.cid])
    ctx.enviar(f"{len([x for x in lst if x['cid'] == ctx.cid])} lembrete(s) cancelado(s).", MENU)


def lembretes_ciclo():
    """No agente (laço da agenda): manda os lembretes vencidos e tira da lista."""
    lst = db.cfg(CHAVE_LEMB) or []
    agora = time.time()
    vencidos = [x for x in lst if x["quando"] <= agora]
    if not vencidos:
        return
    db.set_cfg(CHAVE_LEMB, [x for x in lst if x["quando"] > agora])
    from . import telegram
    for x in vencidos:
        try:
            telegram._enviar(x["cid"], f"⏰ <b>Lembrete</b>\n{_e(x['texto'])}", MENU)
        except Exception:  # noqa: BLE001
            pass

# =====================================================================================================================
# CALCULADORA
# =====================================================================================================================
for _m2 in range(10, 65, 5):
    def _fbt(ctx, a, _m2=_m2):
        base = _m2 * 600
        ctx.enviar(f"<b>Sala de {_m2} m²</b>\nRegra prática: 600 BTU/h por m² ≈ <b>{base:,} BTU/h</b>".replace(",", ".", 1)
                   + "\nSome 600 BTU/h por pessoa além de 2 e 600 por aparelho que esquenta (computador, TV). Sol da tarde: escolha o tamanho acima.\n"
                   + f"Tamanhos comuns: {', '.join(f'{x:,}'.replace(',', '.') for x in (9000, 12000, 18000, 24000, 30000, 36000) if x >= base * 0.9)[:60] or '36.000 ou mais'}", MENU)
    cmd(f"btu_{_m2}m2", "calc", f"BTU recomendado para uma sala de {_m2} m² (regra prática)")(_fbt)


@cmd("calc_btu", "calc", "BTU para a sua sala: /calc_btu ÁREA PESSOAS APARELHOS", "/calc_btu 25 4 3", arg="texto")
def c_calc_btu(ctx, a, resto=""):
    n = [float(x.replace(",", ".")) for x in str(resto or a or "").split() if x.replace(",", "").replace(".", "").isdigit()]
    if not n:
        return ctx.enviar("Use /calc_btu ÁREA PESSOAS APARELHOS (ex.: /calc_btu 25 4 3).")
    area, pessoas, apar = (n + [2, 0])[:3]
    total = area * 600 + max(0, pessoas - 2) * 600 + apar * 600
    btu = f"{int(total):,}".replace(",", ".")
    ctx.enviar(f"<b>{num(area, 0)} m², {int(pessoas)} pessoa(s), {int(apar)} aparelho(s)</b>\nRegra prática: <b>{btu} BTU/h</b>", MENU)

# =====================================================================================================================
# PLACAS
# =====================================================================================================================
_PLACAS = [("uno_r4", "Arduino UNO R4 WiFi", "7", "Módulo Wi-Fi ESP32-S3; atualize o firmware do módulo se o HTTPS falhar. Use módulo de relé de 5 V."),
           ("giga_r1", "Arduino GIGA R1 WiFi", "7", "Pinos de 3,3 V: módulo de relé que aceite 3,3 V no sinal."),
           ("opta", "Arduino Opta WiFi", "D0", "Já tem 4 relés de 10 A (D0 a D3). Trilho DIN, instalação por eletricista."),
           ("portenta", "Arduino Portenta H7", "D7", "Pacote Mbed OS Portenta; relé com sinal de 3,3 V."),
           ("nano33iot", "Arduino Nano 33 IoT", "7", "Atualize o firmware do NINA para ter as raízes de certificado atuais."),
           ("mkr1010", "Arduino MKR WiFi 1010", "5", "Combina com o MKR Relay Proto Shield."),
           ("nanoesp32", "Arduino Nano ESP32", "D7", "Pacote Arduino ESP32 Boards; sinal de 3,3 V."),
           ("esp32", "ESP32 DevKit", "26", "Pacote esp32 (Espressif); GPIO 26 no relé; sinal de 3,3 V."),
           ("esp8266", "ESP8266 NodeMCU / Wemos D1", "D1", "Pouca memória: certificado conferido com BearSSL e hora pela internet (NTP).")]
for _k, _n, _p, _d in _PLACAS:
    cmd(f"placa_{_k}", "placas", f"{_n}: pino do relé e o que precisa")(lambda ctx, a, _n=_n, _p=_p, _d=_d: ctx.enviar(f"<b>{_e(_n)}</b>\nPino do relé: <b>{_p}</b>\n{_e(_d)}\nO código completo (com o token) é gerado no painel, em cada aparelho → Conectar → Placa própria. Lá também tem o modelo 3D da placa.", _link("Abrir Cafeteira", "/cafeteira")))
cmd("placas", "placas", "Quais placas o sistema aceita")(lambda ctx, a: ctx.enviar("<b>Placas aceitas</b>\n" + "\n".join(f"• /placa_{k}: {_e(n)}" for k, n, _, _ in _PLACAS), MENU))

# =====================================================================================================================
# APPS E TREINAMENTO
# =====================================================================================================================
for _k, _arq, _n in (("android", "ClimaCasa-android.apk", "Android"), ("windows", "ClimaCasa-windows.exe", "Windows"), ("mac", "ClimaCasa-mac-apple-silicon.dmg", "Mac (Apple Silicon)"),
                     ("mac_intel", "ClimaCasa-mac-intel.dmg", "Mac (Intel)"), ("linux", "ClimaCasa-linux-x64.AppImage", "Linux")):
    cmd(f"baixar_{_k}", "apps", f"Baixar o app para {_n}")(lambda ctx, a, _n=_n, _k=_k: ctx.enviar(f"<b>App para {_n}</b>\nO download sai pela tela Apps (link temporário).", _link(f"Baixar para {_n}", f"/apps?baixar={_k.split('_')[0]}")))
cmd("apps_versao", "apps", "Versão atual dos apps")(lambda ctx, a: ctx.enviar(f"<b>Apps</b>: versão {_e((json.loads((Path(__file__).parent / 'versao_apps.json').read_text(encoding='utf-8')) or {}).get('versao', '?'))}", _link("Abrir Apps", "/apps")))


@cmd("treino_status", "apps", "Seu treinamento de segurança: provas e notas")
def c_treino(ctx, a):
    lst = db.consultar("SELECT curso, nota, aprovado, criado_em FROM treinamentos WHERE usuario_id = ? ORDER BY criado_em DESC LIMIT 8", (str(ctx.u["id"]),)) if db.um("SELECT to_regclass('public.treinamentos') AS t")["t"] else []
    ctx.enviar("<b>Treinamento</b>\n" + ("\n".join(f"• {_e(x['curso'])}: {x['nota']}% {'(aprovado)' if x['aprovado'] else ''} · {quando(x['criado_em'])}" for x in lst) or "Nenhuma prova ainda."), _link("Abrir Treinamento", "/seguranca?aba=treinamento"))


@cmd("certificado", "apps", "Confere um certificado do treinamento", "/certificado CE-XXXX-XXXX-XXXX", arg="texto")
def c_certificado(ctx, a, resto=""):
    from . import treinamento
    cod = str(resto or a or "").strip().upper()
    if not cod:
        return ctx.enviar("Use /certificado e o código (CE-XXXX-XXXX-XXXX).")
    try:
        r = treinamento.verificar_certificado(cod)
    except Exception:  # noqa: BLE001
        r = None
    ctx.enviar(f"<b>Certificado válido</b>\n{_e(r.get('nome', ''))} · {_e(r.get('curso', ''))} · nota {r.get('nota')}%" if r else "Certificado não encontrado.", MENU)

# =====================================================================================================================
# NOVIDADES POR VERSÃO (uma por versão do novidades.json)
# =====================================================================================================================
try:
    _VERSOES = json.loads((Path(__file__).parent / "novidades.json").read_text(encoding="utf-8"))["versoes"]
except Exception:  # noqa: BLE001
    _VERSOES = []
for _v in _VERSOES:
    _nm = "versao_" + _v["versao"].replace(".", "_")
    if _nm in C:
        continue
    def _fvs(ctx, a, _v=_v):
        partes = [f"<b>{_e(_v['versao'])} · {_e(_v.get('titulo', ''))}</b> ({_v.get('data', '')})", _e(_v.get("resumo", ""))]
        for k, r in (("novo", "Novo"), ("melhorias", "Melhorias"), ("seguranca", "Segurança"), ("correcoes", "Correções")):
            if _v.get(k):
                partes.append(f"\n<b>{r}</b>\n" + "\n".join(f"• {_e(x)}" for x in _v[k][:10]))
        ctx.enviar("\n".join(partes)[:3900], _link("Ver todas", "/novidades"))
    cmd(_nm, "versoes", f"O que mudou na versão {_v['versao']}")(_fvs)
cmd("versoes", "versoes", "Lista das versões mais novas")(lambda ctx, a: ctx.enviar("<b>Versões</b>\n" + "\n".join(f"• /versao_{v['versao'].replace('.', '_')} {_e(v.get('titulo', '')[:60])}" for v in _VERSOES[:15]), _link("Ver todas", "/novidades")))

# ---------- mais por ar, por sala e acessos (0.6.8) ----------
for _d in (1, 7, 15, 30, 60, 90):
    def _ftma(ctx, a, _d=_d):
        from . import relatorio
        fim = db.agora(); r = relatorio.montar(fim - _d * 86400, fim, aparelho_id=a["id"])
        t = r["resumo"]["temperatura_media"]
        ctx.enviar(f"<b>{_e(a['nome'])}</b> · temperatura média em {_d} dia(s): {num(t)}°" if t else f"{_e(a['nome'])}: sem comandos de temperatura em {_d} dia(s).", MENU)
    cmd(f"temp_ar_{_d}d", "porar", f"Temperatura média escolhida num ar em {_d} dia(s)", f"/temp_ar_{_d}d NOME", arg="ar?", perm="relatorios.ver")(_ftma)
    def _fmda(ctx, a, _d=_d):
        from . import relatorio
        fim = db.agora(); m = relatorio.montar(fim - _d * 86400, fim, aparelho_id=a["id"]).get("modos") or []
        ctx.enviar(f"<b>{_e(a['nome'])}</b> · modos em {_d} dia(s)\n" + ("\n".join(f"• {_e(x.get('modo') or x.get('nome'))}: {x.get('n') or x.get('comandos') or x.get('vezes') or 0}" for x in (m if isinstance(m, list) else [{"modo": k, "n": v} for k, v in m.items()])) or "Sem dados."), MENU)
    cmd(f"modos_ar_{_d}d", "porar", f"Modos mais usados num ar em {_d} dia(s)", f"/modos_ar_{_d}d NOME", arg="ar?", perm="relatorios.ver")(_fmda)
    def _frks(ctx, sl, _d=_d):
        from . import relatorio
        fim = db.agora(); lst = relatorio.montar(fim - _d * 86400, fim, projeto_id=sl["id"])["por_aparelho"]
        ctx.enviar(f"<b>{_e(sl['nome'])}</b> · ares por gasto em {_d} dia(s)\n" + ("\n".join(f"{i + 1}. {_e(x['nome'])}: {brl(x['custo'])} · {num(x['horas_ligado'])} h" for i, x in enumerate(sorted(lst, key=lambda x: -x['custo'])[:10])) or "Sem dados."), MENU)
    cmd(f"ranking_sala_{_d}d", "porsala", f"Ares de uma sala por gasto em {_d} dia(s)", f"/ranking_sala_{_d}d NOME", arg="sala", perm="relatorios.ver")(_frks)
for _o in ("site", "sistema"):
    for _d in (1, 7, 30, 90):
        def _fnr(ctx, a, _o=_o, _d=_d):
            from . import analise
            v = analise.resumo(_o, _d).get("visitantes_tipo") or {}
            ctx.enviar(f"<b>Quem são · {_o} · {_d} dia(s)</b>\nNovos: {v.get('novos', 0)}\nVoltaram: {v.get('recorrentes', 0)}\nSessões anônimas: {v.get('anonimas', 0)}", _link("Abrir Acessos", "/analise"))
        cmd(f"{_o}_quem_{_d}d", "acessos", f"Novos, recorrentes e anônimos no {_o} em {_d} dia(s)", perm="configuracoes.gerenciar")(_fnr)
        def _fcm(ctx, a, _o=_o, _d=_d):
            from . import analise
            c = analise.resumo(_o, _d).get("caminhos") or []
            ctx.enviar(f"<b>Caminhos · {_o} · {_d} dia(s)</b>\n" + ("\n".join(f"• {_e(x['de'])} → {_e(x['para'])}: {x['n']}" for x in c[:12]) or "Nada."), _link("Abrir Acessos", "/analise"))
        cmd(f"{_o}_caminhos_{_d}d", "acessos", f"Caminhos mais comuns no {_o} em {_d} dia(s)", perm="configuracoes.gerenciar")(_fcm)
        def _ftp(ctx, a, _o=_o, _d=_d):
            from . import analise
            p = analise.resumo(_o, _d).get("paginas_tempo") or []
            ctx.enviar(f"<b>Tempo por página · {_o} · {_d} dia(s)</b>\n" + ("\n".join(f"• {_e(x['rota'])}: {tempo(x['tempo_s']) if x['tempo_s'] else '-'}" + (f" · rolou {x['rolagem']}%" if x.get("rolagem") is not None else "") for x in p[:12]) or "Nada."), _link("Abrir Acessos", "/analise"))
        cmd(f"{_o}_tempo_{_d}d", "acessos", f"Tempo e rolagem por página no {_o} em {_d} dia(s)", perm="configuracoes.gerenciar")(_ftp)

NOVOS_068 = len(C) - _ANTES
