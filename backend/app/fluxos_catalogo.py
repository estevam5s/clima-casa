"""Catálogo ampliado dos Fluxos (0.7.9): mais de 100 gatilhos, 100 blocos de lógica e dados e 100 ações e integrações.

Tudo aqui se registra no mesmo fluxos.CATALOGO (fonte única para a tela, a validação e o motor). Cada bloco roda de verdade:
- gatilhos de EVENTO leem linhas novas de uma tabela do sistema (atividade, segurança, notificações, bugs, tarefas, e-mails,
  aparelhos do escritório, fila, mensagens do site…) a partir do último id visto; de ESTADO comparam um valor medido agora com o
  anterior (dispara ao cruzar); de TEMPO calculam uma chave da ocorrência (dispara uma vez por ocorrência).
- lógica e dados: comparações com saída Sim/Não, matemática, texto, data/hora, listas/JSON, controle e leituras do sistema.
  O resultado vai para {{var.<guardar_em>}} (padrão: o nome do bloco).
- integrações externas usam CONEXÕES (Rotinas → Conexões), guardadas cifradas em config.fluxos_conexoes; a URL de destino passa
  pela mesma trava de SSRF do bloco HTTP (só https público), exceto conexões marcadas "rede local" (Home Assistant, Node-RED, n8n
  na rede do escritório), que só o dono cria e só rodam no agente.
"""
from __future__ import annotations

import base64
import datetime
import hashlib
import json
import math
import random
import re
import time
import unicodedata
import uuid

import httpx

from . import db

# ---------------------------------------------------------------- registro
EXEC: dict = {}          # tipo -> fn(fluxo, n, ctx, prazo, P) -> (porta, resumo)
GATILHO: dict = {}       # tipo -> fn(f, n) -> list[dict] (contextos a disparar)


def _reg(tipo, cat, grupo, rotulo, desc, campos=(), portas=None, fn=None, gat=None):
    from .fluxos import CATALOGO
    CATALOGO[tipo] = {"cat": cat, "grupo": grupo, "rotulo": rotulo, "desc": desc, "campos": list(campos), **({"portas": portas} if portas else {})}
    if fn:
        EXEC[tipo] = fn
    if gat:
        GATILHO[tipo] = gat


def _f(nome, tipo, rotulo, extra=None):
    return (nome, tipo, rotulo, extra)


GUARDAR = _f("guardar_em", "texto", "Guardar em {{var.…}} (nome)")
VALOR = _f("valor", "texto", "Valor (use {{...}})")


def _guardar(n, ctx, valor, padrao):
    nome = re.sub(r"[^a-zA-Z0-9_]", "", (n["config"].get("guardar_em") or "")) or padrao
    ctx.setdefault("var", {})[nome] = valor
    return f"var.{nome} = {str(valor)[:80]}"


def _agora():
    from .fluxos import _agora_br
    return _agora_br()


def _int(v, padrao=0):
    try:
        return int(float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return padrao


# ================================================================ GATILHOS
# ---- de evento: linhas novas numa tabela (a partir do último id visto) --------------------------------------------------
def _ev(tabela, cond="true", texto_col=None, campos_ctx=("*",)):
    def gat(f, n):
        from .fluxos import _marcar
        chave = f"ev:{n['id']}"
        ultimo = (f.get("estado") or {}).get(chave)
        filtro, p = "", []
        contem = (n["config"].get("contem") or "").strip()
        if contem and texto_col:
            filtro, p = f" AND {texto_col} ILIKE ?", [f"%{contem[:80]}%"]
        if ultimo is None:   # primeira vez: começa do agora (não dispara pelo histórico)
            m = (db.um(f"SELECT max(id) AS m FROM {tabela}") or {}).get("m") or 0
            _marcar(f, chave, int(m))
            return []
        linhas = db.consultar(f"SELECT * FROM {tabela} WHERE id > ? AND ({cond}){filtro} ORDER BY id LIMIT 10", (ultimo, *p))
        if linhas:
            _marcar(f, chave, int(linhas[-1]["id"]))
        return [{"evento": {k: (v if isinstance(v, (str, int, float, bool, type(None))) else str(v)) for k, v in r.items()}} for r in linhas[:5]]
    return gat


CONTEM = _f("contem", "texto", "Só se o texto contiver (opcional)")
EVENTOS = [
    # atividade
    ("ev_comando_falhou", "Comando falhou", "Um comando para um ar ou aparelho falhou.", "atividade", "ok = 0", "acao || ' ' || coalesce(detalhe,'')", "Ares e comandos"),
    ("ev_ar_pela_alexa", "Ar comandado pela Alexa", "Alguém mandou um ar pela Alexa ou Google.", "atividade", "(origem LIKE 'alexa%' OR origem LIKE 'sinric%') AND aparelho_id IS NOT NULL", "acao", "Ares e comandos"),
    ("ev_ar_pelo_painel", "Ar comandado pelo painel", "Alguém mudou um ar pelo painel.", "atividade", "origem = 'painel' AND aparelho_id IS NOT NULL", "acao", "Ares e comandos"),
    ("ev_ar_pelo_telegram", "Ar comandado pelo Telegram", "Alguém mudou um ar pelo bot.", "atividade", "origem LIKE 'telegram%' AND aparelho_id IS NOT NULL", "acao", "Ares e comandos"),
    ("ev_ar_pelo_app", "Ar comandado pelo app", "Alguém mudou um ar pelo app do celular ou do computador.", "atividade", "origem LIKE 'app%' AND aparelho_id IS NOT NULL", "acao", "Ares e comandos"),
    ("ev_ar_pela_ia", "Ar comandado pela IA", "O assistente de IA mudou um ar.", "atividade", "origem LIKE 'ia%' AND aparelho_id IS NOT NULL", "acao", "Ares e comandos"),
    ("ev_temperatura_mudou", "Temperatura de um ar mudou", "Um ar recebeu uma temperatura nova.", "atividade", "ok = 1 AND acao LIKE '%°%' AND acao NOT LIKE 'Desligar%'", "acao", "Ares e comandos"),
    ("ev_modo_frio", "Ar foi para o frio", "Um ar foi ligado ou ajustado no modo frio.", "atividade", "ok = 1 AND acao ILIKE '%frio%'", "acao", "Ares e comandos"),
    ("ev_modo_quente", "Ar foi para o quente", "Um ar foi ligado ou ajustado no aquecimento.", "atividade", "ok = 1 AND acao ILIKE '%quente%'", "acao", "Ares e comandos"),
    ("ev_modo_ventilar", "Ar foi para ventilar", "Um ar entrou no modo ventilação.", "atividade", "ok = 1 AND acao ILIKE '%ventil%'", "acao", "Ares e comandos"),
    ("ev_cena_executada", "Uma cena rodou", "Qualquer cena executada.", "atividade", "origem LIKE 'cena:%'", "origem", "Rotinas"),
    ("ev_agenda_rodou", "Um agendamento rodou", "A agenda mandou um comando.", "atividade", "origem LIKE 'agenda:%'", "origem", "Rotinas"),
    ("ev_agenda_pulou", "Agendamento pulado (feriado/férias)", "A agenda não rodou por feriado ou pausa.", "atividade", "acao = 'Agendamento não rodou'", "detalhe", "Rotinas"),
    ("ev_automacao_rodou", "Uma automação rodou", "Uma automação por regra disparou.", "atividade", "origem LIKE 'automacao:%'", "origem", "Rotinas"),
    ("ev_outro_fluxo_rodou", "Outro fluxo rodou", "Algum fluxo terminou (veja {{evento.acao}}).", "atividade", "acao LIKE 'Fluxo executado:%'", "acao", "Rotinas"),
    ("ev_fluxo_falhou", "Um fluxo falhou", "Algum fluxo terminou com erro.", "atividade", "acao LIKE 'Fluxo executado:%' AND ok = 0", "acao", "Rotinas"),
    ("ev_temporizador", "Temporizador disparou", "Um temporizador de ar venceu.", "atividade", "origem LIKE 'temporizador%' OR acao LIKE 'Temporizador%'", "acao", "Rotinas"),
    ("ev_alguem_entrou", "Alguém entrou no sistema", "Login de qualquer pessoa.", "atividade", "acao ILIKE 'Entrou no sistema%'", "coalesce(usuario,'') || ' ' || coalesce(detalhe,'')", "Pessoas e contas"),
    ("ev_usuario_criado", "Conta criada", "Uma conta nova foi criada.", "atividade", "acao ILIKE 'Usuário criado%'", "acao", "Pessoas e contas"),
    ("ev_senha_trocada", "Senha trocada", "Alguém trocou ou redefiniu a senha.", "atividade", "acao ILIKE '%senha%'", "acao", "Pessoas e contas"),
    ("ev_backup_gerado", "Backup gerado", "Um backup completo foi criado.", "atividade", "acao ILIKE 'Backup%gerado%'", "acao", "Sistema"),
    ("ev_restauracao", "Restauração feita", "Alguém restaurou dados de um backup.", "atividade", "acao ILIKE '%restaur%'", "acao", "Sistema"),
    ("ev_relatorio_enviado", "Relatório enviado por e-mail", "Um relatório saiu por e-mail.", "atividade", "acao ILIKE 'Relatório enviado%'", "detalhe", "Sistema"),
    ("ev_conversa_ia", "Alguém conversou com a IA", "Pergunta ao assistente de IA.", "atividade", "acao ILIKE 'Conversa com a IA%'", "detalhe", "Sistema"),
    ("ev_configuracao_mudou", "Configuração mudou", "Alguém salvou configurações do sistema.", "atividade", "acao ILIKE '%Configura%salva%' OR acao ILIKE 'Regras do escritório%'", "acao", "Sistema"),
    ("ev_atividade_qualquer", "Qualquer atividade (com filtro)", "Toda linha nova da Atividade; use o filtro de texto.", "atividade", "true", "acao || ' ' || coalesce(detalhe,'')", "Sistema"),
    # segurança
    ("ev_ip_bloqueado", "IP bloqueado", "O firewall bloqueou um IP.", "seguranca_eventos", "tipo LIKE 'ip_bloqueado%'", "ip || ' ' || coalesce(detalhe,'')", "Segurança"),
    ("ev_login_falhou", "Senha errada no login", "Tentativa de login com senha errada.", "seguranca_eventos", "tipo = 'login_falhou'", "coalesce(detalhe,'')", "Segurança"),
    ("ev_login_ok_seguranca", "Login com sucesso (segurança)", "Entrada registrada pelo firewall.", "seguranca_eventos", "tipo = 'login_ok'", "coalesce(detalhe,'')", "Segurança"),
    ("ev_robo_bloqueado", "Robô barrado", "O firewall barrou um robô.", "seguranca_eventos", "tipo = 'bot_bloqueado'", "coalesce(agente,'')", "Segurança"),
    ("ev_rate_limit", "Excesso de pedidos", "Alguém passou do limite de pedidos por minuto.", "seguranca_eventos", "tipo = 'rate_limit'", "ip", "Segurança"),
    ("ev_token_invalido", "Token inválido usado", "Pedido com sessão vencida ou falsa.", "seguranca_eventos", "tipo = 'token_invalido'", "ip", "Segurança"),
    ("ev_prompt_injection", "Tentativa de enganar a IA", "Pedido que tentou mudar as regras da IA.", "seguranca_eventos", "tipo = 'prompt_injection'", "coalesce(detalhe,'')", "Segurança"),
    ("ev_escudo_ligado", "Escudo anti-DDoS ligado", "O modo de ataque foi ligado.", "seguranca_eventos", "tipo = 'escudo_ligado'", "coalesce(detalhe,'')", "Segurança"),
    ("ev_telegram_negado", "Acesso negado no Telegram", "Alguém não autorizado tentou usar o bot.", "seguranca_eventos", "tipo LIKE 'telegram%negado'", "coalesce(detalhe,'')", "Segurança"),
    ("ev_contato_site", "Formulário do site", "Mensagem enviada pelo site.", "seguranca_eventos", "tipo = 'site_contato'", "coalesce(detalhe,'')", "Site e e-mail"),
    ("ev_seguranca_qualquer", "Qualquer evento de segurança", "Toda linha nova de segurança; use o filtro.", "seguranca_eventos", "tipo <> 'acesso'", "tipo || ' ' || coalesce(detalhe,'')", "Segurança"),
    # notificações
    ("ev_notificacao_critica", "Notificação crítica", "Aviso de gravidade crítica.", "notificacoes", "gravidade = 'critica'", "titulo", "Avisos"),
    ("ev_notificacao_alta", "Notificação alta ou crítica", "Aviso importante.", "notificacoes", "gravidade IN ('alta','critica')", "titulo", "Avisos"),
    ("ev_notificacao_qualquer", "Qualquer notificação", "Todo aviso novo no sino.", "notificacoes", "chave NOT LIKE 'pessoal:%'", "titulo", "Avisos"),
    ("ev_aviso_transmissor", "Aviso de transmissor", "Notificação sobre transmissor.", "notificacoes", "tipo = 'transmissor'", "titulo", "Avisos"),
    ("ev_aviso_agente", "Aviso do agente", "Notificação sobre o agente do escritório.", "notificacoes", "tipo = 'agente'", "titulo", "Avisos"),
    ("ev_aviso_seguranca", "Aviso de segurança", "Notificação de segurança.", "notificacoes", "tipo = 'seguranca'", "titulo", "Avisos"),
    # bugs e tarefas
    ("ev_bug_novo", "Bug novo", "Um bug foi registrado (por pessoa ou pelo sistema).", "bugs", "true", "titulo", "Bugs e tarefas"),
    ("ev_bug_critico", "Bug crítico ou alto", "Bug novo de gravidade alta ou crítica.", "bugs", "gravidade IN ('alta','critica')", "titulo", "Bugs e tarefas"),
    ("ev_bug_relatado", "Bug relatado por alguém", "Bug aberto por uma pessoa.", "bugs", "origem = 'usuario'", "titulo", "Bugs e tarefas"),
    ("ev_tarefa_criada", "Tarefa criada", "Uma tarefa nova em qualquer projeto.", "tarefas", "pai_id IS NULL", "titulo", "Bugs e tarefas"),
    ("ev_subtarefa_criada", "Subtarefa criada", "Uma subtarefa nova.", "tarefas", "pai_id IS NOT NULL", "titulo", "Bugs e tarefas"),
    ("ev_tarefa_urgente", "Tarefa urgente criada", "Tarefa nova com prioridade urgente.", "tarefas", "prioridade = 'urgente'", "titulo", "Bugs e tarefas"),
    ("ev_comentario_tarefa", "Comentário em tarefa", "Alguém comentou uma tarefa.", "tarefas_comentarios", "tipo = 'comentario'", "texto", "Bugs e tarefas"),
    # aparelhos do escritório
    ("ev_aparelho_escritorio", "Aparelho do escritório mudou", "Luz, cafeteira, persiana ou fechadura recebeu comando.", "dispositivos_eventos", "true", "acao", "Escritório"),
    ("ev_luz_ligou", "Uma luz ligou", "Alguma lâmpada foi ligada.", "dispositivos_eventos", "acao = 'Ligou' AND dispositivo_id IN (SELECT id FROM dispositivos WHERE tipo = 'luz')", "acao", "Escritório"),
    ("ev_luz_desligou", "Uma luz desligou", "Alguma lâmpada foi desligada.", "dispositivos_eventos", "acao = 'Desligou' AND dispositivo_id IN (SELECT id FROM dispositivos WHERE tipo = 'luz')", "acao", "Escritório"),
    ("ev_cafeteira_ligou", "Cafeteira ligou", "A cafeteira foi ligada.", "dispositivos_eventos", "acao IN ('Ligou','Café') AND dispositivo_id IN (SELECT id FROM dispositivos WHERE tipo = 'cafeteira')", "acao", "Escritório"),
    ("ev_persiana_abriu", "Persiana abriu", "Alguma persiana foi aberta.", "dispositivos_eventos", "acao = 'Abriu'", "acao", "Escritório"),
    ("ev_persiana_fechou", "Persiana fechou", "Alguma persiana foi fechada.", "dispositivos_eventos", "acao = 'Fechou'", "acao", "Escritório"),
    ("ev_porta_destrancada", "Porta destrancada", "A fechadura foi destrancada.", "dispositivos_eventos", "acao = 'Destrancou'", "acao", "Escritório"),
    ("ev_porta_trancada", "Porta trancada", "A fechadura foi trancada.", "dispositivos_eventos", "acao = 'Trancou'", "acao", "Escritório"),
    ("ev_aparelho_falhou", "Aparelho do escritório falhou", "Comando para luz, cafeteira, persiana ou fechadura falhou.", "dispositivos_eventos", "ok = 0", "acao || ' ' || coalesce(detalhe,'')", "Escritório"),
    # e-mail e site
    ("ev_email_devolvido", "E-mail devolvido", "Um e-mail voltou (endereço inválido ou caixa cheia).", "email_envios", "estado = 'devolvido'", "para", "Site e e-mail"),
    ("ev_email_falhou", "E-mail falhou", "Um e-mail não saiu.", "email_envios", "estado = 'falhou'", "para || ' ' || coalesce(erro,'')", "Site e e-mail"),
    ("ev_email_enviado", "E-mail enviado", "Qualquer e-mail enviado pelo sistema.", "email_envios", "true", "assunto", "Site e e-mail"),
    ("ev_mensagem_site", "Mensagem pelo site", "Alguém escreveu pelo zynio.com.br.", "site_mensagens", "true", "assunto || ' ' || mensagem", "Site e e-mail"),
    ("ev_inscrito_newsletter", "Inscrição na newsletter", "Alguém se inscreveu na newsletter.", "newsletter_inscritos", "true", "email", "Site e e-mail"),
    ("ev_telegram_mensagem", "Mensagem no bot do Telegram", "Alguém escreveu para o bot.", "telegram_eventos", "tipo IN ('mensagem','texto','ia')", "coalesce(texto,'')", "Site e e-mail"),
    # fila
    ("ev_fila_erro", "Pedido ao agente falhou", "Um pedido na fila do agente terminou com erro.", "fila_comandos", "estado = 'erro'", "tipo || ' ' || coalesce(erro,'')", "Sistema"),
    ("ev_gravacao_concluida", "Botão gravado", "Uma gravação de botão terminou.", "fila_comandos", "tipo = 'aprender' AND estado = 'feito'", "tipo", "Sistema"),
]
for _t, _r, _d, _tab, _cond, _col, _g in EVENTOS:
    _reg(_t, "gatilho", _g, _r, _d + " Dados em {{evento.…}}.", [CONTEM], gat=_ev(_tab, _cond, _col))


# ---- de estado: mede algo agora e dispara ao cruzar o limite ------------------------------------------------------------
def _estado(medir, comparar_campo=True, padrao=0):
    """medir(cfg) -> (valor, contexto). Dispara quando a condição passa de falsa para verdadeira."""
    def gat(f, n):
        from .fluxos import _marcar
        c = n["config"]
        valor, ctx = medir(c)
        if valor is None:
            return []
        if comparar_campo:
            lim = float(c.get("valor") if c.get("valor") not in (None, "") else padrao)
            ok = valor > lim if (c.get("sentido") or "acima") == "acima" else valor < lim
        else:
            ok = bool(valor)
        if _marcar(f, f"st:{n['id']}", bool(ok)) and ok:
            return [{"evento": {"valor": valor, **ctx}}]
        return []
    return gat


SENTIDO = _f("sentido", "escolha", "Quando ficar", [["acima", "Acima de"], ["abaixo", "Abaixo de"]])
LIMITE = _f("valor", "numero", "Limite", {"min": -100000, "max": 100000000})


def _ligados(c=None):
    n = (db.um("SELECT count(*) AS n FROM aparelhos WHERE ligado = 1") or {}).get("n") or 0
    return n, {"ligados": n}


def _clima(campo):
    def m(c):
        from .fluxos import _tempo_fora
        try:
            f = _tempo_fora(c.get("projeto_id"))
        except Exception:  # noqa: BLE001
            return None, {}
        return (f.get(campo), {"fora": f})
    return m


def _gasto(periodo):
    def m(c):
        from . import relatorio
        fim = db.agora()
        ini = int(datetime.datetime.now().replace(day=1, hour=0, minute=0, second=0).timestamp()) if periodo == "mes" else fim - 86400
        r = relatorio.montar(ini, fim)["resumo"]
        return r["custo"], {"custo": r["custo"], "kwh": r["kwh"], "horas": r["horas_ligado"]}
    return m


def _contagem(sql):
    def m(c):
        v = (db.um(sql) or {}).get("n") or 0
        return v, {"total": v}
    return m


def _transicao(medir_bool):
    def m(c):
        v, ctx = medir_bool(c)
        return (1 if v else 0), ctx
    return m


ESTADOS = [
    ("ev_primeiro_ar_ligou", "Primeiro ar do dia ligou", "Saiu de nenhum ar ligado para algum ligado.", lambda c: ((_ligados()[0] > 0), {}), False, "Ares e comandos"),
    ("ev_todos_desligados", "Todos os ares desligaram", "O último ar ligado foi desligado.", lambda c: ((_ligados()[0] == 0), {}), False, "Ares e comandos"),
    ("ev_ligados_acima", "Muitos ares ligados", "Número de ares ligados passou do limite.", _ligados, True, "Ares e comandos"),
    ("ev_umidade", "Umidade lá fora", "Umidade da rua passou do limite (%).", _clima("umidade"), True, "Tempo lá fora"),
    ("ev_sensacao", "Sensação térmica lá fora", "Sensação térmica passou do limite (°C).", _clima("sensacao"), True, "Tempo lá fora"),
    ("ev_vento", "Vento forte", "Vento da rua passou do limite (km/h).", _clima("vento"), True, "Tempo lá fora"),
    ("ev_comecou_chover", "Começou a chover", "O tempo virou chuva ou trovoada.", lambda c: (lambda f: ((f[0] in ("chuva", "trovoada")) if f[0] else None, f[1]))(_clima("tipo")(c)), False, "Tempo lá fora"),
    ("ev_trovoada", "Trovoada", "Começou uma trovoada.", lambda c: (lambda f: ((f[0] == "trovoada") if f[0] else None, f[1]))(_clima("tipo")(c)), False, "Tempo lá fora"),
    ("ev_tempo_limpo", "Abriu o tempo", "O céu ficou limpo.", lambda c: (lambda f: ((f[0] == "limpo") if f[0] else None, f[1]))(_clima("tipo")(c)), False, "Tempo lá fora"),
    ("ev_gasto_hoje", "Gasto das últimas 24 h", "Custo estimado dos ares em 24 h passou do limite (R$).", _gasto("dia"), True, "Gasto"),
    ("ev_gasto_mes", "Gasto do mês", "Custo estimado do mês passou do limite (R$).", _gasto("mes"), True, "Gasto"),
    ("ev_bugs_abertos", "Muitos bugs abertos", "Bugs abertos passaram do limite.", _contagem("SELECT count(*) AS n FROM bugs WHERE estado = 'aberto'"), True, "Bugs e tarefas"),
    ("ev_tarefas_atrasadas", "Tarefas atrasadas", "Tarefas atrasadas passaram do limite.", _contagem("SELECT count(*) AS n FROM tarefas WHERE NOT concluida AND prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD')"), True, "Bugs e tarefas"),
    ("ev_nao_lidas", "Avisos não lidos", "Notificações não lidas passaram do limite.", _contagem("SELECT count(*) AS n FROM notificacoes WHERE NOT lida AND NOT arquivada"), True, "Avisos"),
    ("ev_transmissor_offline", "Algum transmissor saiu do ar", "Pelo menos um transmissor ficou offline.", _transicao(lambda c: ((db.um("SELECT count(*) AS n FROM hubs WHERE online = 0") or {}).get("n", 0) > 0, {})), False, "Sistema"),
    ("ev_transmissores_ok", "Todos os transmissores online", "Todos voltaram.", _transicao(lambda c: ((db.um("SELECT count(*) AS n FROM hubs WHERE online = 0") or {}).get("n", 1) == 0, {})), False, "Sistema"),
    ("ev_agente_offline", "Agente do escritório caiu", "Nenhum agente principal online.", _transicao(lambda c: (db.agora() - int(db.cfg("agente_visto_em", 0) or 0) > 120, {})), False, "Sistema"),
    ("ev_agente_online", "Agente do escritório voltou", "Um agente voltou a responder.", _transicao(lambda c: (db.agora() - int(db.cfg("agente_visto_em", 0) or 0) <= 60, {})), False, "Sistema"),
    ("ev_fila_parada", "Fila do agente parada", "Pedidos esperando há mais de 2 min.", _transicao(lambda c: ((db.um("SELECT count(*) AS n FROM fila_comandos WHERE estado = 'pendente' AND criado_em < ?", (db.agora() - 120,)) or {}).get("n", 0) > 0, {})), False, "Sistema"),
]
for _t, _r, _d, _m, _cmp, _g in ESTADOS:
    _reg(_t, "gatilho", _g, _r, _d + " Confere a cada ~20 s; dispara ao cruzar.", [SENTIDO, LIMITE] if _cmp else [], gat=_estado(_m, _cmp))


# ---- de tempo: uma chave por ocorrência ---------------------------------------------------------------------------------
def _tempo(chave_de):
    def gat(f, n):
        from .fluxos import _marcar
        ch = chave_de(_agora(), n["config"])
        if ch and _marcar(f, f"tp:{n['id']}", ch):
            return [{"evento": {"quando": ch}}]
        return []
    return gat


def _sol(campo, deslocar=0):
    def ch(a, c):
        from . import dispositivos
        s = dispositivos.sol_do_dia(a.date())
        alvo = s.get(campo)
        if not alvo:
            return None
        h, m = map(int, str(alvo)[:5].split(":"))
        t = a.replace(hour=h, minute=m, second=0) + datetime.timedelta(minutes=_int(c.get("minutos")) * deslocar)
        return t.strftime("%Y-%m-%d %H:%M") if a.strftime("%H:%M") == t.strftime("%H:%M") else None
    return ch


def _exped(qual):
    def ch(a, c):
        g = db.cfg("geral") or {}
        e = g.get("expediente") or {"inicio": "08:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}
        dia = (a.weekday() + 1) % 7
        if dia not in (e.get("dias") or [1, 2, 3, 4, 5]):
            return None
        hora = e.get(qual) or ("08:00" if qual == "inicio" else "18:00")
        return a.strftime("%Y-%m-%d ") + hora if a.strftime("%H:%M") == hora else None
    return ch


def _feriado(vespera=False):
    def ch(a, c):
        from . import feriados
        d = a.date() + datetime.timedelta(days=1 if vespera else 0)
        if not feriados.motivo_para_nao_rodar(d):
            return None
        hora = c.get("hora") or "08:00"
        return a.strftime("%Y-%m-%d ") + hora if a.strftime("%H:%M") == hora else None
    return ch


def _cron(a, c):
    """Expressão cron simples de 5 campos (minuto hora dia mês dia-da-semana; *, */N, a-b, listas). Dia da semana 0 = domingo."""
    partes = (c.get("expressao") or "").split()
    if len(partes) != 5:
        return None
    vals = [a.minute, a.hour, a.day, a.month, (a.weekday() + 1) % 7]

    def casa(campo, v):
        for p in campo.split(","):
            passo = 1
            if "/" in p:
                p, s = p.split("/", 1); passo = max(1, _int(s, 1))
            if p in ("*", ""):
                ini, fim = 0, 59
            elif "-" in p:
                ini, fim = (_int(x) for x in p.split("-", 1))
            else:
                ini = fim = _int(p, -1)
            if ini <= v <= fim and (v - ini) % passo == 0:
                return True
        return False
    return a.strftime("%Y-%m-%d %H:%M") if all(casa(p, v) for p, v in zip(partes, vals)) else None


HORA = _f("hora", "hora", "Hora")
TEMPOS = [
    ("ev_nascer_do_sol", "Nascer do sol", "Na hora do nascer do sol em Florianópolis (± minutos).", _sol("nascer", 1), [_f("minutos", "numero", "Minutos depois (negativo = antes)", {"min": -180, "max": 180})]),
    ("ev_por_do_sol", "Pôr do sol", "Na hora do pôr do sol (± minutos).", _sol("por", 1), [_f("minutos", "numero", "Minutos depois (negativo = antes)", {"min": -180, "max": 180})]),
    ("ev_inicio_expediente", "Início do expediente", "Hora de início do expediente (Configurações → Geral).", _exped("inicio"), []),
    ("ev_fim_expediente", "Fim do expediente", "Hora de fim do expediente.", _exped("fim"), []),
    ("ev_dia_feriado", "Em dia de feriado ou férias", "No horário escolhido, só em feriado ou pausa da agenda.", _feriado(False), [HORA]),
    ("ev_vespera_feriado", "Véspera de feriado", "No horário escolhido, no dia antes de um feriado.", _feriado(True), [HORA]),
    ("ev_primeiro_dia_mes", "Primeiro dia do mês", "Dia 1 no horário escolhido.", lambda a, c: a.strftime("%Y-%m-%d ") + (c.get("hora") or "08:00") if a.day == 1 and a.strftime("%H:%M") == (c.get("hora") or "08:00") else None, [HORA]),
    ("ev_ultimo_dia_mes", "Último dia do mês", "Último dia do mês no horário escolhido.", lambda a, c: a.strftime("%Y-%m-%d ") + (c.get("hora") or "17:00") if (a + datetime.timedelta(days=1)).day == 1 and a.strftime("%H:%M") == (c.get("hora") or "17:00") else None, [HORA]),
    ("ev_toda_hora", "Toda hora cheia", "No minuto escolhido de cada hora.", lambda a, c: a.strftime("%Y-%m-%d %H:") + f"{_int(c.get('minuto')):02d}" if a.minute == _int(c.get("minuto")) else None, [_f("minuto", "numero", "Minuto", {"min": 0, "max": 59})]),
    ("ev_meia_noite", "Meia-noite", "Todo dia à 00:00.", lambda a, c: a.strftime("%Y-%m-%d") if a.strftime("%H:%M") == "00:00" else None, []),
    ("ev_data_hora", "Data e hora marcadas", "Uma vez, na data e hora escolhidas.", lambda a, c: a.strftime("%Y-%m-%d %H:%M") if a.strftime("%Y-%m-%d") == (c.get("data") or "") and a.strftime("%H:%M") == (c.get("hora") or "") else None,
     [_f("data", "texto", "Data (AAAA-MM-DD)"), HORA]),
    ("ev_cron", "Expressão cron", "Para quem conhece cron: 5 campos (ex.: */15 8-18 * * 1-5). Dia da semana 0 = domingo.", _cron, [_f("expressao", "texto", "Expressão cron")]),
    ("ev_dia_util_hora", "Dia útil, num horário", "Segunda a sexta (sem feriado) no horário escolhido.",
     lambda a, c: a.strftime("%Y-%m-%d ") + (c.get("hora") or "08:00") if a.weekday() < 5 and a.strftime("%H:%M") == (c.get("hora") or "08:00") and not __import__("app.feriados", fromlist=["x"]).motivo_para_nao_rodar(a.date()) else None, [HORA]),
    ("ev_fim_de_semana_hora", "Fim de semana, num horário", "Sábado e domingo no horário escolhido.", lambda a, c: a.strftime("%Y-%m-%d ") + (c.get("hora") or "10:00") if a.weekday() >= 5 and a.strftime("%H:%M") == (c.get("hora") or "10:00") else None, [HORA]),
]
for _t, _r, _d, _fn, _campos in TEMPOS:
    _reg(_t, "gatilho", "Tempo e calendário", _r, _d, _campos, gat=_tempo(_fn))


# ================================================================ LÓGICA E DADOS
SN = ["sim", "nao"]


def _cmp_fn(teste):
    def fn(fluxo, n, ctx, prazo, P):
        try:
            ok = bool(teste(P, n["config"], ctx))
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"Não deu para comparar: {e}") from e
        return ("sim" if ok else "nao"), ("sim" if ok else "não")
    return fn


def _num(v):
    from .fluxos import _num as n
    return n(v)


B = _f("b", "texto", "Comparar com")
COMPARACOES = [
    ("se_igual", "É igual a", lambda P, c, x: str(P("valor")).strip().lower() == str(P("b")).strip().lower(), [VALOR, B]),
    ("se_diferente", "É diferente de", lambda P, c, x: str(P("valor")).strip().lower() != str(P("b")).strip().lower(), [VALOR, B]),
    ("se_maior", "É maior que", lambda P, c, x: (_num(P("valor")) or 0) > (_num(P("b")) or 0), [VALOR, B]),
    ("se_maior_igual", "É maior ou igual a", lambda P, c, x: (_num(P("valor")) or 0) >= (_num(P("b")) or 0), [VALOR, B]),
    ("se_menor", "É menor que", lambda P, c, x: (_num(P("valor")) or 0) < (_num(P("b")) or 0), [VALOR, B]),
    ("se_menor_igual", "É menor ou igual a", lambda P, c, x: (_num(P("valor")) or 0) <= (_num(P("b")) or 0), [VALOR, B]),
    ("se_entre", "Está entre dois números", lambda P, c, x: (_num(P("de")) or 0) <= (_num(P("valor")) or 0) <= (_num(P("ate")) or 0), [VALOR, _f("de", "texto", "De"), _f("ate", "texto", "Até")]),
    ("se_contem", "Contém o texto", lambda P, c, x: str(P("b")).lower() in str(P("valor")).lower(), [VALOR, B]),
    ("se_nao_contem", "Não contém o texto", lambda P, c, x: str(P("b")).lower() not in str(P("valor")).lower(), [VALOR, B]),
    ("se_comeca", "Começa com", lambda P, c, x: str(P("valor")).lower().startswith(str(P("b")).lower()), [VALOR, B]),
    ("se_termina", "Termina com", lambda P, c, x: str(P("valor")).lower().endswith(str(P("b")).lower()), [VALOR, B]),
    ("se_regex", "Casa com expressão regular", lambda P, c, x: re.search(str(P("b"))[:200], str(P("valor"))) is not None, [VALOR, _f("b", "texto", "Expressão regular")]),
    ("se_vazio", "Está vazio", lambda P, c, x: str(P("valor")).strip() == "", [VALOR]),
    ("se_preenchido", "Está preenchido", lambda P, c, x: str(P("valor")).strip() != "", [VALOR]),
    ("se_numero", "É um número", lambda P, c, x: _num(P("valor")) is not None, [VALOR]),
    ("se_par", "É um número par", lambda P, c, x: (_int(P("valor"), 1) % 2) == 0, [VALOR]),
    ("se_verdadeiro", "É verdadeiro (sim/true/1)", lambda P, c, x: str(P("valor")).strip().lower() in ("sim", "true", "1", "ligado", "s", "yes"), [VALOR]),
    ("se_dia_util", "Hoje é dia útil?", lambda P, c, x: _agora().weekday() < 5 and not __import__("app.feriados", fromlist=["x"]).motivo_para_nao_rodar(_agora().date()), []),
    ("se_fim_de_semana", "Hoje é fim de semana?", lambda P, c, x: _agora().weekday() >= 5, []),
    ("se_expediente", "Está no expediente?", lambda P, c, x: _no_expediente(), []),
    ("se_ar_ligado", "Este ar está ligado?", lambda P, c, x: bool((db.um("SELECT ligado FROM aparelhos WHERE id = ?", (_aid(c, x),)) or {}).get("ligado")), [_f("aparelho_id", "ar_ou_evento", "Ar")]),
    ("se_algum_ligado", "Algum ar ligado?", lambda P, c, x: _ligados()[0] > 0, []),
    ("se_sala_ligada", "Algum ar ligado nesta sala?", lambda P, c, x: (db.um("SELECT count(*) AS n FROM aparelhos WHERE ligado = 1 AND projeto_id = ?", (c.get("projeto_id"),)) or {}).get("n", 0) > 0, [_f("projeto_id", "projeto", "Sala (projeto)")]),
    ("se_agente_online", "O agente do escritório está online?", lambda P, c, x: db.agora() - int(db.cfg("agente_visto_em", 0) or 0) <= 60, []),
    ("se_transmissores_ok", "Todos os transmissores online?", lambda P, c, x: (db.um("SELECT count(*) AS n FROM hubs WHERE online = 0") or {}).get("n", 1) == 0, []),
    ("se_chance", "Sorteio (chance %)", lambda P, c, x: random.random() * 100 < (_num(c.get("pct")) or 50), [_f("pct", "numero", "Chance (%)", {"min": 0, "max": 100})]),
    ("se_hora_antes", "Agora é antes de…", lambda P, c, x: _agora().strftime("%H:%M") < (c.get("hora") or "12:00"), [HORA]),
    ("se_hora_depois", "Agora é depois de…", lambda P, c, x: _agora().strftime("%H:%M") >= (c.get("hora") or "12:00"), [HORA]),
    ("se_dia_semana", "Hoje é um destes dias?", lambda P, c, x: ((_agora().weekday() + 1) % 7) in (c.get("dias") or []), [_f("dias", "dias", "Dias")]),
    ("se_quente_fora", "Está quente lá fora?", lambda P, c, x: (lambda f: (f.get("temperatura") or 0) >= (_num(c.get("valor")) or 28))(__import__("app.fluxos", fromlist=["x"])._tempo_fora(c.get("projeto_id"))), [_f("valor", "numero", "A partir de (°C)", {"min": -10, "max": 50}), _f("projeto_id", "projeto", "Lugar")]),
    ("se_chovendo", "Está chovendo?", lambda P, c, x: __import__("app.fluxos", fromlist=["x"])._tempo_fora(c.get("projeto_id")).get("tipo") in ("chuva", "trovoada"), [_f("projeto_id", "projeto", "Lugar")]),
]


def _aid(c, ctx):
    return (ctx.get("evento") or {}).get("aparelho_id") if c.get("aparelho_id") == "evento" else c.get("aparelho_id")


def _no_expediente() -> bool:
    a = _agora()
    e = (db.cfg("geral") or {}).get("expediente") or {"inicio": "08:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}
    return ((a.weekday() + 1) % 7) in (e.get("dias") or []) and (e.get("inicio") or "08:00") <= a.strftime("%H:%M") < (e.get("fim") or "18:00")


for _t, _r, _fn, _campos in COMPARACOES:
    _reg(_t, "logica", "Comparar e decidir", _r, "Segue pelo Sim ou pelo Não.", _campos, SN, _cmp_fn(_fn))


def _calc(op):
    def fn(fluxo, n, ctx, prazo, P):
        v = op(P, n["config"])
        if isinstance(v, float) and v.is_integer() and abs(v) < 1e15:
            v = int(v)
        return "saida", _guardar(n, ctx, v, n["tipo"].replace("calc_", "").replace("txt_", "").replace("dt_", "").replace("ls_", ""))
    return fn


A = _f("valor", "texto", "Valor (use {{...}})")
B2 = _f("b", "texto", "Segundo valor")
NUM = lambda P, k="valor": _num(P(k)) or 0   # noqa: E731
MATEMATICA = [
    ("calc_somar", "Somar", lambda P, c: NUM(P) + NUM(P, "b"), [A, B2]),
    ("calc_subtrair", "Subtrair", lambda P, c: NUM(P) - NUM(P, "b"), [A, B2]),
    ("calc_multiplicar", "Multiplicar", lambda P, c: NUM(P) * NUM(P, "b"), [A, B2]),
    ("calc_dividir", "Dividir", lambda P, c: NUM(P) / NUM(P, "b") if NUM(P, "b") else 0, [A, B2]),
    ("calc_resto", "Resto da divisão", lambda P, c: NUM(P) % NUM(P, "b") if NUM(P, "b") else 0, [A, B2]),
    ("calc_potencia", "Potência", lambda P, c: NUM(P) ** min(NUM(P, "b"), 50), [A, B2]),
    ("calc_raiz", "Raiz quadrada", lambda P, c: math.sqrt(abs(NUM(P))), [A]),
    ("calc_arredondar", "Arredondar", lambda P, c: round(NUM(P), _int(P("b"), 0)), [A, _f("b", "texto", "Casas decimais")]),
    ("calc_piso", "Arredondar para baixo", lambda P, c: math.floor(NUM(P)), [A]),
    ("calc_teto", "Arredondar para cima", lambda P, c: math.ceil(NUM(P)), [A]),
    ("calc_absoluto", "Valor absoluto", lambda P, c: abs(NUM(P)), [A]),
    ("calc_porcentagem", "X% de um valor", lambda P, c: NUM(P) * NUM(P, "b") / 100, [A, _f("b", "texto", "Porcentagem")]),
    ("calc_variacao", "Variação percentual", lambda P, c: round((NUM(P, "b") - NUM(P)) / NUM(P) * 100, 2) if NUM(P) else 0, [_f("valor", "texto", "Antes"), _f("b", "texto", "Depois")]),
    ("calc_minimo", "Menor de dois", lambda P, c: min(NUM(P), NUM(P, "b")), [A, B2]),
    ("calc_maximo", "Maior de dois", lambda P, c: max(NUM(P), NUM(P, "b")), [A, B2]),
    ("calc_media", "Média de uma lista", lambda P, c: (lambda l: round(sum(l) / len(l), 2) if l else 0)([x for x in (_num(i) for i in re.split(r"[;,\s]+", str(P("valor")))) if x is not None]), [_f("valor", "texto", "Números separados por vírgula")]),
    ("calc_aleatorio", "Número aleatório", lambda P, c: random.randint(min(_int(P("valor")), _int(P("b"), 100)), max(_int(P("valor")), _int(P("b"), 100))), [_f("valor", "texto", "De"), _f("b", "texto", "Até")]),
    ("calc_c_para_f", "Celsius para Fahrenheit", lambda P, c: round(NUM(P) * 9 / 5 + 32, 1), [A]),
    ("calc_f_para_c", "Fahrenheit para Celsius", lambda P, c: round((NUM(P) - 32) * 5 / 9, 1), [A]),
    ("calc_custo_kwh", "kWh em reais", lambda P, c: round(NUM(P) * float(db.cfg("tarifa_kwh", 0.85)), 2), [_f("valor", "texto", "kWh")]),
    ("calc_incrementar", "Somar 1", lambda P, c: NUM(P) + 1, [A]),
    ("calc_decrementar", "Tirar 1", lambda P, c: NUM(P) - 1, [A]),
]
for _t, _r, _fn, _campos in MATEMATICA:
    _reg(_t, "logica", "Matemática", _r, "O resultado vai para {{var.…}}.", [*_campos, GUARDAR], fn=_calc(_fn))


def _sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


T = _f("valor", "textao", "Texto (use {{...}})")
TEXTO = [
    ("txt_maiusculas", "MAIÚSCULAS", lambda P, c: str(P("valor")).upper(), [T]),
    ("txt_minusculas", "minúsculas", lambda P, c: str(P("valor")).lower(), [T]),
    ("txt_capitalizar", "Primeira Letra Maiúscula", lambda P, c: str(P("valor")).title(), [T]),
    ("txt_aparar", "Tirar espaços das pontas", lambda P, c: str(P("valor")).strip(), [T]),
    ("txt_substituir", "Substituir texto", lambda P, c: str(P("valor")).replace(str(P("de")), str(P("para"))), [T, _f("de", "texto", "Procurar"), _f("para", "texto", "Trocar por")]),
    ("txt_sem_acento", "Tirar acentos", lambda P, c: _sem_acento(str(P("valor"))), [T]),
    ("txt_tamanho", "Tamanho do texto", lambda P, c: len(str(P("valor"))), [T]),
    ("txt_trecho", "Pegar um trecho", lambda P, c: str(P("valor"))[_int(P("de")):_int(P("ate"), 100)], [T, _f("de", "texto", "Do caractere"), _f("ate", "texto", "Até o caractere")]),
    ("txt_dividir", "Dividir em lista", lambda P, c: [x.strip() for x in str(P("valor")).split(str(P("sep")) or ",")], [T, _f("sep", "texto", "Separador")]),
    ("txt_juntar", "Juntar lista em texto", lambda P, c: (str(P("sep")) or ", ").join(str(x) for x in _lista(P("valor"))), [_f("valor", "texto", "Lista ({{var.…}})"), _f("sep", "texto", "Separador")]),
    ("txt_repetir", "Repetir texto", lambda P, c: str(P("valor")) * max(0, min(_int(P("vezes"), 1), 50)), [T, _f("vezes", "texto", "Vezes")]),
    ("txt_inverter", "Inverter texto", lambda P, c: str(P("valor"))[::-1], [T]),
    ("txt_slug", "Virar slug (para URL)", lambda P, c: re.sub(r"[^a-z0-9]+", "-", _sem_acento(str(P("valor")).lower())).strip("-"), [T]),
    ("txt_numeros", "Extrair números", lambda P, c: re.findall(r"-?\d+(?:[.,]\d+)?", str(P("valor"))), [T]),
    ("txt_emails", "Extrair e-mails", lambda P, c: re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", str(P("valor"))), [T]),
    ("txt_palavras", "Contar palavras", lambda P, c: len(str(P("valor")).split()), [T]),
    ("txt_primeira_palavra", "Primeira palavra", lambda P, c: (str(P("valor")).split() or [""])[0], [T]),
    ("txt_moeda", "Formatar em reais", lambda P, c: f"R$ {NUM(P):,.2f}".replace(",", "X").replace(".", ",").replace("X", "."), [A]),
    ("txt_numero", "Formatar número", lambda P, c: f"{NUM(P):,.{_int(P('b'), 0)}f}".replace(",", "X").replace(".", ",").replace("X", "."), [A, _f("b", "texto", "Casas decimais")]),
    ("txt_mascarar", "Mascarar (esconder o meio)", lambda P, c: (lambda s: s[:2] + "•" * max(0, len(s) - 4) + s[-2:] if len(s) > 4 else "•" * len(s))(str(P("valor"))), [T]),
    ("txt_modelo", "Montar texto", lambda P, c: str(P("valor")), [_f("valor", "textao", "Modelo (use {{...}})")]),
    ("txt_url", "Codificar para URL", lambda P, c: __import__("urllib.parse", fromlist=["x"]).quote(str(P("valor"))), [T]),
    ("txt_base64", "Codificar em Base64", lambda P, c: base64.b64encode(str(P("valor")).encode()).decode(), [T]),
    ("txt_base64_ler", "Ler Base64", lambda P, c: base64.b64decode(str(P("valor")).encode() + b"==").decode("utf-8", "replace"), [T]),
    ("txt_sha256", "Resumo SHA-256", lambda P, c: hashlib.sha256(str(P("valor")).encode()).hexdigest(), [T]),
    ("txt_uuid", "Gerar identificador único", lambda P, c: str(uuid.uuid4()), []),
]
for _t, _r, _fn, _campos in TEXTO:
    _reg(_t, "logica", "Texto", _r, "O resultado vai para {{var.…}}.", [*_campos, GUARDAR], fn=_calc(_fn))


def _lista(v):
    if isinstance(v, list):
        return v
    try:
        j = json.loads(v)
        if isinstance(j, list):
            return j
    except (TypeError, ValueError):
        pass
    return [x.strip() for x in str(v or "").split(",") if x.strip()]


def _data(P, k="valor"):
    s = str(P(k) or "").strip()
    if not s:
        return _agora()
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            return datetime.datetime.strptime(s[:16], fmt)
        except ValueError:
            continue
    return _agora()


D = _f("valor", "texto", "Data (vazio = agora; AAAA-MM-DD HH:MM)")
DIAS_NOME = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
DATAS = [
    ("dt_agora", "Data e hora de agora", lambda P, c: _agora().strftime("%d/%m/%Y %H:%M"), []),
    ("dt_hoje", "Data de hoje", lambda P, c: _agora().strftime("%Y-%m-%d"), []),
    ("dt_hora", "Hora de agora", lambda P, c: _agora().strftime("%H:%M"), []),
    ("dt_formatar", "Formatar data", lambda P, c: _data(P).strftime(str(P("formato")) or "%d/%m/%Y"), [D, _f("formato", "texto", "Formato (ex.: %d/%m/%Y %H:%M)")]),
    ("dt_somar_minutos", "Somar minutos", lambda P, c: (_data(P) + datetime.timedelta(minutes=_int(P("b")))).strftime("%Y-%m-%d %H:%M"), [D, _f("b", "texto", "Minutos")]),
    ("dt_somar_dias", "Somar dias", lambda P, c: (_data(P) + datetime.timedelta(days=_int(P("b")))).strftime("%Y-%m-%d"), [D, _f("b", "texto", "Dias")]),
    ("dt_dia_semana", "Dia da semana", lambda P, c: DIAS_NOME[_data(P).weekday()], [D]),
    ("dt_semana_ano", "Número da semana", lambda P, c: _data(P).isocalendar()[1], [D]),
    ("dt_diferenca", "Minutos entre duas datas", lambda P, c: int((_data(P, "b") - _data(P)).total_seconds() // 60), [_f("valor", "texto", "De"), _f("b", "texto", "Até")]),
    ("dt_timestamp", "Data em segundos (epoch)", lambda P, c: int(_data(P).timestamp()), [D]),
    ("dt_mes", "Mês atual", lambda P, c: _agora().strftime("%m/%Y"), []),
    ("dt_ano", "Ano atual", lambda P, c: _agora().year, []),
    ("dt_proximo_feriado", "Próximo feriado", lambda P, c: (lambda l: f"{l[0]['data']} · {l[0]['nome']}" if l else "")(__import__("app.feriados", fromlist=["x"]).proximos(120)), []),
    ("dt_sol", "Nascer e pôr do sol hoje", lambda P, c: (lambda s: f"nasce {s.get('nascer')}, se põe {s.get('por')}")(__import__("app.dispositivos", fromlist=["x"]).sol_do_dia(_agora().date())), []),
    ("dt_minutos_ate", "Minutos até um horário", lambda P, c: (lambda h: int((_agora().replace(hour=int(h[:2]), minute=int(h[3:5]), second=0) - _agora()).total_seconds() // 60))(c.get("hora") or "18:00"), [HORA]),
]
for _t, _r, _fn, _campos in DATAS:
    _reg(_t, "logica", "Data e hora", _r, "O resultado vai para {{var.…}}.", [*_campos, GUARDAR], fn=_calc(_fn))


L = _f("valor", "texto", "Lista ({{var.…}} ou itens separados por vírgula)")
LISTAS = [
    ("ls_criar", "Criar lista", lambda P, c: _lista(P("valor")), [L]),
    ("ls_tamanho", "Tamanho da lista", lambda P, c: len(_lista(P("valor"))), [L]),
    ("ls_primeiro", "Primeiro item", lambda P, c: (_lista(P("valor")) or [""])[0], [L]),
    ("ls_ultimo", "Último item", lambda P, c: (_lista(P("valor")) or [""])[-1], [L]),
    ("ls_item", "Item na posição", lambda P, c: (lambda l, i: l[i] if -len(l) <= i < len(l) else "")(_lista(P("valor")), _int(P("b"))), [L, _f("b", "texto", "Posição (0 = primeiro)")]),
    ("ls_ordenar", "Ordenar lista", lambda P, c: sorted(_lista(P("valor")), key=lambda x: (_num(x) is None, _num(x) or 0, str(x))), [L]),
    ("ls_inverter", "Inverter lista", lambda P, c: list(reversed(_lista(P("valor")))), [L]),
    ("ls_unicos", "Tirar repetidos", lambda P, c: list(dict.fromkeys(_lista(P("valor")))), [L]),
    ("ls_filtrar", "Filtrar itens que contêm", lambda P, c: [x for x in _lista(P("valor")) if str(P("b")).lower() in str(x).lower()], [L, B]),
    ("ls_somar", "Somar os números", lambda P, c: sum(_num(x) or 0 for x in _lista(P("valor"))), [L]),
    ("ls_adicionar", "Adicionar item", lambda P, c: [*_lista(P("valor")), P("b")], [L, _f("b", "texto", "Item")]),
    ("json_ler", "Ler campo de um JSON", lambda P, c: (lambda o: __import__("app.fluxos", fromlist=["x"])._caminho({"x": o}, "x." + str(P("caminho"))) if str(P("caminho")) else o)(_json(P("valor"))), [_f("valor", "textao", "JSON (ou {{http.json}})"), _f("caminho", "texto", "Caminho (ex.: dados.0.nome)")]),
    ("json_converter", "Texto para JSON", lambda P, c: _json(P("valor")), [_f("valor", "textao", "Texto JSON")]),
    ("json_texto", "JSON para texto", lambda P, c: json.dumps(_json(P("valor")), ensure_ascii=False), [_f("valor", "texto", "Valor ({{var.…}})")]),
    ("json_montar", "Montar objeto (chave=valor)", lambda P, c: {k.strip(): v.strip() for k, _, v in (l.partition("=") for l in str(P("valor")).splitlines()) if k.strip()}, [_f("valor", "textao", "Uma linha por campo: chave=valor")]),
]


def _json(v):
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return {}


for _t, _r, _fn, _campos in LISTAS:
    _reg(_t, "logica", "Listas e JSON", _r, "O resultado vai para {{var.…}}.", [*_campos, GUARDAR], fn=_calc(_fn))


# ---- controle ------------------------------------------------------------------------------------------------------------
def _parar(fluxo, n, ctx, prazo, P):
    ctx["_parar"] = True
    return "fim", "fluxo parado aqui"


def _uma_vez_dia(fluxo, n, ctx, prazo, P):
    from .fluxos import _marcar
    hoje = _agora().strftime("%Y-%m-%d")
    return ("sim", "primeira vez hoje") if _marcar(fluxo, f"1x:{n['id']}", hoje) else ("nao", "já rodou hoje")


def _intervalo_minimo(fluxo, n, ctx, prazo, P):
    from .fluxos import _marcar
    m = max(1, _int(n["config"].get("minutos"), 30))
    est = (fluxo.get("estado") or {}).get(f"im:{n['id']}") or 0
    if time.time() - est >= m * 60:
        _marcar(fluxo, f"im:{n['id']}", int(time.time()))
        return "sim", "liberado"
    return "nao", f"esperando completar {m} min"


def _escolher(fluxo, n, ctx, prazo, P):
    v = str(P("valor")).strip().lower()
    for i in (1, 2, 3):
        if v and v == str(P(f"caso{i}")).strip().lower():
            return f"caso{i}", f"caso {i}"
    return "outro", "nenhum caso"


def _var_global(ler):
    def fn(fluxo, n, ctx, prazo, P):
        nome = re.sub(r"[^a-zA-Z0-9_]", "", n["config"].get("nome") or "")[:40] or "valor"
        vg = db.cfg("fluxos_variaveis") or {}
        if ler:
            ctx.setdefault("var", {})[nome] = vg.get(nome, "")
            return "saida", f"var.{nome} = {vg.get(nome, '')!r}"[:120]
        vg[nome] = P("valor")
        db.set_cfg("fluxos_variaveis", vg)
        return "saida", f"global {nome} = {vg[nome]!r}"[:120]
    return fn


def _contador(fluxo, n, ctx, prazo, P):
    nome = re.sub(r"[^a-zA-Z0-9_]", "", n["config"].get("nome") or "")[:40] or "contador"
    vg = db.cfg("fluxos_variaveis") or {}
    vg[nome] = (_num(vg.get(nome)) or 0) + (_num(n["config"].get("passo")) or 1)
    db.set_cfg("fluxos_variaveis", vg)
    ctx.setdefault("var", {})[nome] = vg[nome]
    return "saida", f"{nome} = {vg[nome]}"


def _esperar_ate(fluxo, n, ctx, prazo, P):
    h = n["config"].get("hora") or "08:00"
    a = _agora()
    alvo = a.replace(hour=int(h[:2]), minute=int(h[3:5]), second=0)
    s = max(0, (alvo - a).total_seconds())
    if prazo.get("nuvem"):
        s = min(s, max(0, prazo["ate"] - time.time()))
    time.sleep(min(s, 3600))
    return "saida", f"esperou {int(s)} s"


def _log(fluxo, n, ctx, prazo, P):
    return "saida", str(P("valor"))[:300]


_reg("ctl_parar", "logica", "Controle", "Parar o fluxo", "Encerra este caminho aqui.", [], ["fim"], _parar)
_reg("ctl_uma_vez_dia", "logica", "Controle", "Só uma vez por dia", "Segue pelo Sim só na primeira passagem do dia.", [], SN, _uma_vez_dia)
_reg("ctl_intervalo", "logica", "Controle", "Intervalo mínimo", "Sim se já passou N minutos desde a última vez (evita repetição).", [_f("minutos", "numero", "Minutos", {"min": 1, "max": 1440})], SN, _intervalo_minimo)
_reg("ctl_escolher", "logica", "Controle", "Escolher pelo valor", "Até 3 casos e um caminho 'outro'.", [VALOR, _f("caso1", "texto", "Caso 1"), _f("caso2", "texto", "Caso 2"), _f("caso3", "texto", "Caso 3")], ["caso1", "caso2", "caso3", "outro"], _escolher)
_reg("ctl_esperar_ate", "logica", "Controle", "Esperar até um horário", "Pausa até a hora escolhida (no agente, até 1 h).", [HORA], fn=_esperar_ate)
_reg("ctl_global_gravar", "logica", "Controle", "Gravar variável global", "Guarda um valor que vale para todos os fluxos (Rotinas → Variáveis).", [_f("nome", "texto", "Nome"), VALOR], fn=_var_global(False))
_reg("ctl_global_ler", "logica", "Controle", "Ler variável global", "Lê para {{var.nome}}.", [_f("nome", "texto", "Nome")], fn=_var_global(True))
_reg("ctl_contador", "logica", "Controle", "Contador", "Soma ao contador global e guarda em {{var.nome}}.", [_f("nome", "texto", "Nome"), _f("passo", "numero", "Somar", {"min": -1000, "max": 1000})], fn=_contador)
_reg("ctl_log", "logica", "Controle", "Anotar no histórico", "Escreve uma linha no histórico da execução.", [VALOR], fn=_log)


# ---- dados do sistema ----------------------------------------------------------------------------------------------------
def _dado(fn_valor, padrao):
    def fn(fluxo, n, ctx, prazo, P):
        v = fn_valor(n["config"], ctx)
        return "saida", _guardar(n, ctx, v, padrao)
    return fn


def _rel(dias):
    from . import relatorio
    fim = db.agora()
    return relatorio.montar(fim - dias * 86400, fim)["resumo"]


DADOS = [
    ("dado_ligados", "Quantos ares ligados", lambda c, x: _ligados()[0], "ligados", []),
    ("dado_lista_ligados", "Quais ares estão ligados", lambda c, x: [r["nome"] for r in db.consultar("SELECT nome FROM aparelhos WHERE ligado = 1 ORDER BY nome")], "ligados_lista", []),
    ("dado_sala", "Ares de uma sala", lambda c, x: db.consultar("SELECT nome, ligado, temperatura, modo FROM aparelhos WHERE projeto_id = ? ORDER BY nome", (c.get("projeto_id"),)), "sala", [_f("projeto_id", "projeto", "Sala (projeto)")]),
    ("dado_gasto_24h", "Gasto das últimas 24 h", lambda c, x: _rel(1)["custo"], "gasto_24h", []),
    ("dado_gasto_mes", "Gasto dos últimos 30 dias", lambda c, x: _rel(30)["custo"], "gasto_30d", []),
    ("dado_projecao", "Projeção do mês", lambda c, x: _rel(7)["projecao_mes"], "projecao_mes", []),
    ("dado_kwh_mes", "Consumo dos últimos 30 dias (kWh)", lambda c, x: _rel(30)["kwh"], "kwh_30d", []),
    ("dado_horas_ligado", "Horas ligado em 7 dias", lambda c, x: _rel(7)["horas_ligado"], "horas_7d", []),
    ("dado_previsao", "Previsão das próximas horas", lambda c, x: [{"hora": p["hora"], "temp": p["temperatura"], "chuva": p["chuva"]} for p in (__import__("app.clima_externo", fromlist=["x"]).agora(c.get("projeto_id") or 1, None).get("proximas") or [])[:6]], "previsao", [_f("projeto_id", "projeto", "Lugar")]),
    ("dado_transmissores", "Situação dos transmissores", lambda c, x: [{"nome": h["nome"], "online": bool(h["online"])} for h in db.consultar("SELECT nome, online FROM hubs ORDER BY nome")], "transmissores", []),
    ("dado_agentes", "Agentes do escritório", lambda c, x: [{k: m.get(k) for k in ("nome", "online", "principal")} for m in __import__("app.coordenador", fromlist=["x"]).maquinas()], "agentes", []),
    ("dado_ultimo_comando", "Último comando", lambda c, x: (db.um("SELECT acao, origem, quando FROM atividade WHERE aparelho_id IS NOT NULL ORDER BY id DESC LIMIT 1") or {}), "ultimo_comando", []),
    ("dado_falhas_24h", "Falhas nas últimas 24 h", lambda c, x: (db.um("SELECT count(*) AS n FROM atividade WHERE ok = 0 AND quando > ?", (db.agora() - 86400,)) or {}).get("n", 0), "falhas_24h", []),
    ("dado_bugs_abertos", "Bugs abertos", lambda c, x: (db.um("SELECT count(*) AS n FROM bugs WHERE estado = 'aberto'") or {}).get("n", 0), "bugs_abertos", []),
    ("dado_tarefas_atrasadas", "Tarefas atrasadas", lambda c, x: [r["titulo"] for r in db.consultar("SELECT titulo FROM tarefas WHERE NOT concluida AND prazo < to_char(now() AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') ORDER BY prazo LIMIT 20")], "atrasadas", []),
    ("dado_nao_lidas", "Notificações não lidas", lambda c, x: (db.um("SELECT count(*) AS n FROM notificacoes WHERE NOT lida AND NOT arquivada AND chave NOT LIKE 'pessoal:%'") or {}).get("n", 0), "nao_lidas", []),
    ("dado_pessoas_expediente", "Quem está no expediente", lambda c, x: [p.get("nome") for p in ((db.cfg("mapa") or {}).get("pessoas") or []) if p.get("nome")], "equipe", []),
    ("dado_feriado_hoje", "Motivo de não rodar hoje", lambda c, x: __import__("app.feriados", fromlist=["x"]).motivo_para_nao_rodar(_agora().date()) or "", "feriado", []),
    ("dado_tarifa", "Tarifa de energia (R$/kWh)", lambda c, x: float(db.cfg("tarifa_kwh", 0.85)), "tarifa", []),
    ("dado_ar_detalhe", "Detalhes de um ar", lambda c, x: (db.um("SELECT id, nome, ligado, modo, temperatura, ventilador, ligado_desde, hub_id FROM aparelhos WHERE id = ?", (_aid(c, x),)) or {}), "ar", [_f("aparelho_id", "ar_ou_evento", "Ar")]),
    ("dado_gasto_por_ar", "Gasto por ar (30 dias)", lambda c, x: [{"ar": a["nome"], "custo": a["custo"]} for a in __import__("app.relatorio", fromlist=["x"]).montar(db.agora() - 30 * 86400, db.agora())["por_aparelho"]], "gasto_por_ar", []),
]
for _t, _r, _fn, _pad, _campos in DADOS:
    _reg(_t, "logica", "Dados do sistema", _r, f"Guarda em {{{{var.{_pad}}}}} (ou no nome escolhido).", [*_campos, GUARDAR], fn=_dado(_fn, _pad))


# ================================================================ AÇÕES
def _aplicar(aid, origem, **estado):
    from . import clima
    if not aid:
        raise RuntimeError("Escolha o ar.")
    r = clima.aplicar(int(aid), origem, **estado)
    return f"ar {aid}: {'ligado' if r.get('ligado') else 'desligado'}" + (f" {r.get('temperatura')}°" if r.get("ligado") else "")


def _orig(fluxo):
    return f"fluxo:{fluxo['nome']}"[:60]


def _ar_fn(montar):
    def fn(fluxo, n, ctx, prazo, P):
        c = n["config"]
        aid = _aid(c, ctx)
        a = db.um("SELECT ligado, modo, temperatura, ventilador FROM aparelhos WHERE id = ?", (aid,)) or {}
        return "saida", _aplicar(aid, _orig(fluxo), **montar(c, a, P))
    return fn


AR = _f("aparelho_id", "ar_ou_evento", "Ar")
TEMP = _f("temperatura", "numero", "Temperatura", {"min": 16, "max": 30})
ACOES_AR = [
    ("ar_ligar_frio", "Ligar no frio", lambda c, a, P: {"ligado": True, "modo": "frio", "temperatura": _int(c.get("temperatura"), 23)}, [AR, TEMP]),
    ("ar_ligar_quente", "Ligar no quente", lambda c, a, P: {"ligado": True, "modo": "quente", "temperatura": _int(c.get("temperatura"), 25)}, [AR, TEMP]),
    ("ar_ligar_ventilar", "Ligar só ventilando", lambda c, a, P: {"ligado": True, "modo": "ventilar"}, [AR]),
    ("ar_desligar", "Desligar ar", lambda c, a, P: {"ligado": False}, [AR]),
    ("ar_temperatura", "Ajustar temperatura", lambda c, a, P: {"ligado": True, "temperatura": _int(c.get("temperatura"), 23)}, [AR, TEMP]),
    ("ar_mais_quente", "Subir 1 grau", lambda c, a, P: {"ligado": True, "temperatura": min(30, (a.get("temperatura") or 23) + 1)}, [AR]),
    ("ar_mais_frio", "Baixar 1 grau", lambda c, a, P: {"ligado": True, "temperatura": max(16, (a.get("temperatura") or 23) - 1)}, [AR]),
    ("ar_economia", "Modo economia (+2 graus)", lambda c, a, P: {"ligado": True, "temperatura": min(30, (a.get("temperatura") or 23) + 2)}, [AR]),
    ("ar_conforto", "Conforto (23° no frio)", lambda c, a, P: {"ligado": True, "modo": "frio", "temperatura": 23}, [AR]),
    ("ar_ventilacao", "Mudar ventilação", lambda c, a, P: {"ligado": True, "ventilador": c.get("ventilacao") or "auto"}, [AR, _f("ventilacao", "escolha", "Ventilação", [["auto", "Automática"], ["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]])]),
    ("ar_modo", "Mudar modo", lambda c, a, P: {"ligado": True, "modo": c.get("modo") or "frio"}, [AR, _f("modo", "escolha", "Modo", [["frio", "Frio"], ["quente", "Quente"], ["ventilar", "Ventilar"], ["desumidificar", "Desumidificar"], ["auto", "Automático"]])]),
]
for _t, _r, _fn, _campos in ACOES_AR:
    _reg(_t, "acao", "Ares", _r, "Manda o comando pelo transmissor do ar.", _campos, fn=_ar_fn(_fn))


def _sala(ligar):
    def fn(fluxo, n, ctx, prazo, P):
        from . import clima
        pid = n["config"].get("projeto_id")
        feitos = 0
        for a in db.consultar(f"SELECT id FROM aparelhos WHERE projeto_id = ? AND hub_id IS NOT NULL{'' if ligar else ' AND ligado = 1'}", (pid,)):
            try:
                clima.aplicar(a["id"], _orig(fluxo), ligado=ligar, **({"modo": "frio", "temperatura": _int(n["config"].get("temperatura"), 23)} if ligar else {}))
                feitos += 1
            except Exception:  # noqa: BLE001
                pass
        return "saida", f"{feitos} ar(es) {'ligados' if ligar else 'desligados'}"
    return fn


def _temporizador(fluxo, n, ctx, prazo, P):
    from . import automacao
    aid = _aid(n["config"], ctx)
    automacao.criar_temporizador(int(aid), _int(n["config"].get("minutos"), 60), {"ligado": False}, _orig(fluxo))
    return "saida", f"desliga em {_int(n['config'].get('minutos'), 60)} min"


def _ociosos(fluxo, n, ctx, prazo, P):
    from . import clima
    m = _int(n["config"].get("minutos"), 240)
    feitos = 0
    for a in db.consultar("SELECT id FROM aparelhos WHERE ligado = 1 AND ligado_desde < ? AND hub_id IS NOT NULL", (db.agora() - m * 60,)):
        try:
            clima.aplicar(a["id"], _orig(fluxo), ligado=False); feitos += 1
        except Exception:  # noqa: BLE001
            pass
    return "saida", f"{feitos} ar(es) ligados há mais de {m} min desligados"


def _copiar_estado(fluxo, n, ctx, prazo, P):
    c = n["config"]
    a = db.um("SELECT ligado, modo, temperatura, ventilador FROM aparelhos WHERE id = ?", (c.get("de_id"),)) or {}
    if not a:
        raise RuntimeError("Ar de origem não encontrado.")
    est = {"ligado": bool(a["ligado"])} if not a["ligado"] else {"ligado": True, "modo": a["modo"], "temperatura": a["temperatura"]}
    return "saida", _aplicar(c.get("aparelho_id"), _orig(fluxo), **est)


_reg("ar_ligar_sala", "acao", "Ares", "Ligar a sala inteira", "Liga todos os ares de uma sala no frio.", [_f("projeto_id", "projeto", "Sala"), TEMP], fn=_sala(True))
_reg("ar_desligar_sala", "acao", "Ares", "Desligar a sala inteira", "Desliga os ares ligados de uma sala.", [_f("projeto_id", "projeto", "Sala")], fn=_sala(False))
_reg("ar_temporizador", "acao", "Ares", "Desligar daqui a N minutos", "Programa o desligamento do ar.", [AR, _f("minutos", "numero", "Minutos", {"min": 1, "max": 1440})], fn=_temporizador)
_reg("ar_desligar_ociosos", "acao", "Ares", "Desligar os esquecidos", "Desliga os ares ligados há mais de N minutos.", [_f("minutos", "numero", "Ligados há mais de (min)", {"min": 10, "max": 2880})], fn=_ociosos)
_reg("ar_copiar_estado", "acao", "Ares", "Copiar o estado de outro ar", "Deixa um ar igual a outro (ligado, modo e temperatura).", [_f("de_id", "ar", "Copiar de"), _f("aparelho_id", "ar", "Para")], fn=_copiar_estado)


def _disp(acao_fixa=None, valor_campo=None, tipo=None):
    def fn(fluxo, n, ctx, prazo, P):
        from . import dispositivos
        c = n["config"]
        did = c.get("dispositivo_id")
        if not did and tipo:
            alvo = db.consultar("SELECT id FROM dispositivos WHERE tipo = ? AND (? IS NULL OR projeto_id = ?)", (tipo, c.get("projeto_id"), c.get("projeto_id")))
            ids = [r["id"] for r in alvo]
        else:
            ids = [int(did)] if did else []
        if not ids:
            raise RuntimeError("Escolha o aparelho.")
        feitos = []
        for i in ids:
            dispositivos.comando(i, acao_fixa or c.get("acao") or "ligar", _int(P(valor_campo)) if valor_campo else None, origem=_orig(fluxo))
            feitos.append(i)
        return "saida", f"{len(feitos)} aparelho(s): {acao_fixa or c.get('acao')}"
    return fn


DISP = _f("dispositivo_id", "dispositivo", "Aparelho (vazio = todos do tipo na sala)")
SALA_OPC = _f("projeto_id", "projeto", "Sala (opcional)")
for _t, _r, _a, _vc, _tp, _campos in [
    ("luz_ligar", "Ligar luz", "ligar", None, "luz", [DISP, SALA_OPC]),
    ("luz_desligar", "Desligar luz", "desligar", None, "luz", [DISP, SALA_OPC]),
    ("luz_brilho", "Brilho da luz", "brilho", "brilho", "luz", [DISP, SALA_OPC, _f("brilho", "texto", "Brilho (0 a 100)")]),
    ("persiana_abrir", "Abrir persiana", "abrir", None, "persiana", [DISP, SALA_OPC]),
    ("persiana_fechar", "Fechar persiana", "fechar", None, "persiana", [DISP, SALA_OPC]),
    ("persiana_posicao", "Persiana numa posição", "posicao", "posicao", "persiana", [DISP, SALA_OPC, _f("posicao", "texto", "Abertura (0 a 100)")]),
    ("cafeteira_ligar", "Ligar cafeteira", "ligar", None, "cafeteira", [DISP]),
    ("cafeteira_desligar", "Desligar cafeteira", "desligar", None, "cafeteira", [DISP]),
    ("fechadura_trancar", "Trancar a porta", "trancar", None, "fechadura", [DISP]),
]:
    _reg(_t, "acao", "Escritório", _r, "Comando pela nuvem do Smart Life ou pela placa.", _campos, fn=_disp(_a, _vc, _tp))


# ---- sistema ------------------------------------------------------------------------------------------------------------
def _criar_tarefa(fluxo, n, ctx, prazo, P):
    c = n["config"]
    pid = c.get("tarefa_projeto") or (db.um("SELECT id FROM tarefas_projetos WHERE nome = 'Plano de melhorias' AND NOT arquivado") or {}).get("id")
    if not pid:
        raise RuntimeError("Escolha o projeto de tarefas.")
    sec = db.um("SELECT id FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem LIMIT 1", (pid,))
    r = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, prioridade, prazo, ordem, criado_em, atualizado_em) "
              "VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?) RETURNING id", (pid, (sec or {}).get("id"), (P("titulo") or "Tarefa do fluxo")[:300], P("descricao")[:20000],
                                                                   c.get("prioridade") or "media", P("prazo") or None, db.agora(), db.agora()))
    ctx.setdefault("var", {})["tarefa_id"] = r["id"]
    return "saida", f"tarefa #{r['id']} criada"


def _comentar_tarefa(fluxo, n, ctx, prazo, P):
    tid = _int(P("tarefa_id"))
    if not db.um("SELECT 1 AS ok FROM tarefas WHERE id = ?", (tid,)):
        raise RuntimeError("Tarefa não encontrada.")
    db.executar("INSERT INTO tarefas_comentarios (tarefa_id, autor_nome, tipo, texto, criado_em) VALUES (?, ?, 'comentario', ?, ?)", (tid, f"Fluxo {fluxo['nome']}"[:60], P("texto")[:5000], db.agora()))
    return "saida", f"comentou na #{tid}"


def _concluir_tarefa(fluxo, n, ctx, prazo, P):
    tid = _int(P("tarefa_id"))
    db.executar("UPDATE tarefas SET concluida = true, concluida_em = ?, atualizado_em = ? WHERE id = ?", (db.agora(), db.agora(), tid))
    return "saida", f"#{tid} concluída"


def _criar_bug(fluxo, n, ctx, prazo, P):
    from . import bugs
    bugs.registrar_auto(bugs._chave("fluxo", fluxo["id"], P("titulo")[:60]), (P("titulo") or "Problema encontrado por um fluxo")[:200], P("descricao")[:3000],
                        gravidade=n["config"].get("gravidade") or "media", categoria="fluxo")
    return "saida", "bug registrado"


def _relatorio_email(fluxo, n, ctx, prazo, P):
    from . import correio, relatorio
    from .fluxos import _usuarios
    dias = max(1, min(_int(n["config"].get("dias"), 7), 90))
    fim = db.agora()
    d = relatorio.montar(fim - dias * 86400, fim)
    corpo, _tp, ext = relatorio.exportar("pdf", d)
    nome = f"relatorio-{time.strftime('%Y%m%d')}.{ext}"
    enviados = 0
    for u in _usuarios(n["config"].get("para") or []):
        correio.enviar(u["email"], "relatorio", {"nome": u.get("nome") or "", "periodo": f"últimos {dias} dias", "formato": "PDF", "arquivo": nome,
                                                 "linhas": [list(x) for x in relatorio._resumo_linhas(d)[1:6]], "gerado_por": f"Fluxo {fluxo['nome']}"},
                       anexos=[{"filename": nome, "content": corpo if isinstance(corpo, bytes) else str(corpo).encode()}])
        enviados += 1
    return "saida", f"relatório enviado para {enviados} pessoa(s)"


def _backup(fluxo, n, ctx, prazo, P):
    from . import backup_sistema
    r = backup_sistema.gerar(f"fluxo:{fluxo['nome']}", None, "backup", f"Gerado pelo fluxo {fluxo['nome']}"[:120])
    return "saida", str(r.get("arquivo") or r.get("nome") or "backup gerado")


def _fluxo_executar(fluxo, n, ctx, prazo, P):
    from . import fluxos
    alvo = db.um("SELECT * FROM fluxos WHERE id = ?", (n["config"].get("fluxo_id"),))
    if not alvo or alvo["id"] == fluxo["id"]:
        raise RuntimeError("Escolha outro fluxo.")
    r = fluxos.executar(alvo, None, f"chamado pelo fluxo {fluxo['nome']}", {"var": ctx.get("var", {})}, nuvem=prazo.get("nuvem", False))
    return "saida", f"{alvo['nome']}: {r.get('estado')}"


def _fluxo_ligar(ativo):
    def fn(fluxo, n, ctx, prazo, P):
        db.executar("UPDATE fluxos SET ativo = ? WHERE id = ?", (ativo, n["config"].get("fluxo_id")))
        return "saida", "fluxo " + ("ligado" if ativo else "desligado")
    return fn


def _automacao_ligar(ativo):
    def fn(fluxo, n, ctx, prazo, P):
        db.executar("UPDATE automacoes SET ativo = ? WHERE id = ?", (1 if ativo else 0, n["config"].get("automacao_id")))
        return "saida", "automação " + ("ligada" if ativo else "desligada")
    return fn


def _pausar_agenda(fluxo, n, ctx, prazo, P):
    r = db.cfg("agenda_regras") or {}
    hoje = _agora().date()
    fim = hoje + datetime.timedelta(days=max(0, _int(n["config"].get("dias"), 1) - 1))
    r.setdefault("pausas", []).append({"inicio": hoje.isoformat(), "fim": fim.isoformat(), "motivo": f"fluxo {fluxo['nome']}"[:80]})
    db.set_cfg("agenda_regras", r)
    return "saida", f"agenda pausada até {fim:%d/%m}"


def _musica(acao):
    def fn(fluxo, n, ctx, prazo, P):
        from . import musica
        musica.comando(acao, uri=P("uri") or None, volume=_int(P("volume")) if acao == "volume" else None)
        return "saida", f"música: {acao}"
    return fn


def _notificar_pessoa(fluxo, n, ctx, prazo, P):
    from . import notificacoes
    from .fluxos import _usuarios
    for u in _usuarios(n["config"].get("para") or []):
        notificacoes.notificar(f"pessoal:fluxo:{fluxo['id']}:{n['id']}:{int(time.time() // 60)}:{u['id']}", "fluxo", n["config"].get("gravidade") or "baixa",
                               (P("titulo") or fluxo["nome"])[:120], P("texto")[:500], "/rotinas?aba=fluxos")
    return "saida", "aviso pessoal criado"


def _notificacoes_ler(fluxo, n, ctx, prazo, P):
    db.executar("UPDATE notificacoes SET lida = true WHERE NOT lida AND chave NOT LIKE 'pessoal:%' AND gravidade IN ('baixa','media')")
    return "saida", "avisos baixos e médios marcados como lidos"


def _bloquear_ip(fluxo, n, ctx, prazo, P):
    from . import firewall
    ip = P("ip").strip()
    if not re.fullmatch(r"[0-9a-fA-F:.\/]{3,45}", ip) or ip.startswith(("127.", "10.", "192.168.", "::1")):
        raise RuntimeError("IP inválido ou da rede interna.")
    firewall.bloquear(ip, f"bloqueado pelo fluxo {fluxo['nome']}"[:120], _int(n["config"].get("minutos"), 1440), automatico=True)
    return "saida", f"{ip} bloqueado"


PESSOAS = _f("para", "pessoas", "Para (vazio = dono e administradores)")
FLUXO = _f("fluxo_id", "fluxo", "Fluxo")
_reg("sis_criar_tarefa", "acao", "Sistema", "Criar tarefa", "Cria uma tarefa (o id vai para {{var.tarefa_id}}).",
     [_f("tarefa_projeto", "tarefa_projeto", "Projeto de tarefas"), _f("titulo", "texto", "Título"), _f("descricao", "textao", "Descrição"),
      _f("prioridade", "escolha", "Prioridade", [["media", "Média"], ["baixa", "Baixa"], ["alta", "Alta"], ["urgente", "Urgente"]]), _f("prazo", "texto", "Prazo (AAAA-MM-DD)")], fn=_criar_tarefa)
_reg("sis_comentar_tarefa", "acao", "Sistema", "Comentar numa tarefa", "Escreve um comentário.", [_f("tarefa_id", "texto", "Id da tarefa"), _f("texto", "textao", "Comentário")], fn=_comentar_tarefa)
_reg("sis_concluir_tarefa", "acao", "Sistema", "Concluir tarefa", "Marca a tarefa como concluída.", [_f("tarefa_id", "texto", "Id da tarefa")], fn=_concluir_tarefa)
_reg("sis_criar_bug", "acao", "Sistema", "Registrar bug", "Cria (ou atualiza) um bug.", [_f("titulo", "texto", "Título"), _f("descricao", "textao", "Descrição"),
     _f("gravidade", "escolha", "Gravidade", [["media", "Média"], ["baixa", "Baixa"], ["alta", "Alta"], ["critica", "Crítica"]])], fn=_criar_bug)
_reg("sis_relatorio_email", "acao", "Sistema", "Enviar relatório em PDF", "Gera o relatório e manda por e-mail.", [PESSOAS, _f("dias", "numero", "Dias", {"min": 1, "max": 90})], fn=_relatorio_email)
_reg("sis_backup", "acao", "Sistema", "Fazer backup completo", "Gera um backup do banco inteiro.", [], fn=_backup)
_reg("sis_executar_fluxo", "acao", "Sistema", "Rodar outro fluxo", "Chama outro fluxo e passa as variáveis.", [FLUXO], fn=_fluxo_executar)
_reg("sis_ligar_fluxo", "acao", "Sistema", "Ligar um fluxo", "Liga outro fluxo.", [FLUXO], fn=_fluxo_ligar(True))
_reg("sis_desligar_fluxo", "acao", "Sistema", "Desligar um fluxo", "Desliga outro fluxo.", [FLUXO], fn=_fluxo_ligar(False))
_reg("sis_ligar_automacao", "acao", "Sistema", "Ligar automação", "Liga uma automação.", [_f("automacao_id", "automacao", "Automação")], fn=_automacao_ligar(True))
_reg("sis_desligar_automacao", "acao", "Sistema", "Desligar automação", "Desliga uma automação.", [_f("automacao_id", "automacao", "Automação")], fn=_automacao_ligar(False))
_reg("sis_pausar_agenda", "acao", "Sistema", "Pausar a agenda", "Pausa os agendamentos por N dias (a partir de hoje).", [_f("dias", "numero", "Dias", {"min": 1, "max": 60})], fn=_pausar_agenda)
_reg("sis_aviso_pessoa", "acao", "Sistema", "Aviso só para algumas pessoas", "Notificação que só essas pessoas veem.", [PESSOAS, _f("titulo", "texto", "Título"), _f("texto", "textao", "Detalhe"),
     _f("gravidade", "escolha", "Gravidade", [["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]])], fn=_notificar_pessoa)
_reg("sis_ler_avisos", "acao", "Sistema", "Marcar avisos como lidos", "Marca os avisos baixos e médios como lidos.", [], fn=_notificacoes_ler)
_reg("sis_bloquear_ip", "acao", "Segurança", "Bloquear IP", "Bloqueia um IP no firewall (nunca da rede interna).", [_f("ip", "texto", "IP (ex.: {{evento.ip}})"), _f("minutos", "numero", "Por quantos minutos", {"min": 5, "max": 43200})], fn=_bloquear_ip)
for _t, _r, _a, _campos in [("musica_tocar", "Tocar música", "tocar", [_f("uri", "texto", "Playlist ou música (spotify:…)")]), ("musica_pausar", "Pausar música", "pausar", []),
                             ("musica_proxima", "Próxima música", "proxima", []), ("musica_volume", "Volume da música", "volume", [_f("volume", "texto", "Volume (0 a 100)")])]:
    _reg(_t, "acao", "Música", _r, "Spotify (conta Premium conectada).", _campos, fn=_musica(_a))


# ---- IA com escolha de modelo ----------------------------------------------------------------------------------------------
def _ia(sistema, saida="texto", portas=False):
    def fn(fluxo, n, ctx, prazo, P):
        from . import ia
        modelo = n["config"].get("modelo") or None
        txt = ia.gerar(sistema(n["config"], P), P("valor")[:6000], modelo=modelo, max_tokens=900, temperatura=0.2).strip()
        if portas:
            ok = txt.lower().startswith(("sim", "yes"))
            ctx.setdefault("ia", {})["texto"] = txt
            return ("sim" if ok else "nao"), txt[:120]
        valor = txt
        if saida == "json":
            valor = ia.json_da_resposta(txt) or {}
        ctx.setdefault("ia", {})["texto"] = txt
        return "saida", _guardar(n, ctx, valor, "ia")
    return fn


MODELO = _f("modelo", "modelo", "Modelo de IA (vazio = o padrão)")
for _t, _r, _sis, _saida, _por, _campos in [
    ("ia_resumir", "IA: resumir", lambda c, P: "Resuma em português do Brasil, em no máximo 5 frases.", "texto", False, [_f("valor", "textao", "Texto")]),
    ("ia_classificar", "IA: classificar", lambda c, P: f"Classifique o texto em UMA destas categorias e responda só o nome dela: {P('categorias')}.", "texto", False, [_f("valor", "textao", "Texto"), _f("categorias", "texto", "Categorias (vírgula)")]),
    ("ia_extrair", "IA: extrair dados (JSON)", lambda c, P: f"Extraia do texto os campos {P('campos')} e responda SÓ um objeto JSON.", "json", False, [_f("valor", "textao", "Texto"), _f("campos", "texto", "Campos (vírgula)")]),
    ("ia_traduzir", "IA: traduzir", lambda c, P: f"Traduza para {P('idioma') or 'inglês'}. Responda só a tradução.", "texto", False, [_f("valor", "textao", "Texto"), _f("idioma", "texto", "Para o idioma")]),
    ("ia_decidir", "IA: decidir sim ou não", lambda c, P: f"Responda só 'sim' ou 'não' à pergunta: {P('pergunta')}", "texto", True, [_f("valor", "textao", "Contexto"), _f("pergunta", "texto", "Pergunta")]),
    ("ia_sentimento", "IA: humor do texto", lambda c, P: "Diga só 'positivo', 'neutro' ou 'negativo' para o tom do texto.", "texto", False, [_f("valor", "textao", "Texto")]),
    ("ia_escrever", "IA: escrever mensagem", lambda c, P: f"Escreva uma mensagem curta, em português do Brasil, no tom {P('tom') or 'profissional'}, sobre o pedido.", "texto", False, [_f("valor", "textao", "Pedido"), _f("tom", "texto", "Tom")]),
]:
    _reg(_t, "integracao", "Inteligência artificial", _r, "Pela IA da NVIDIA; o resultado vai para {{ia.texto}} e {{var.…}}.", [*_campos, MODELO, *([] if _por else [GUARDAR])], SN if _por else None, _ia(_sis, _saida, _por))


# ================================================================ INTEGRAÇÕES EXTERNAS (com Conexões)
SERVICOS = {   # id: (nome, campos [(nome, rótulo, segredo)], rede_local_permitida)
    "slack": ("Slack", [("url", "Webhook URL", True)], False), "discord": ("Discord", [("url", "Webhook URL", True)], False),
    "teams": ("Microsoft Teams", [("url", "Webhook URL", True)], False), "google_chat": ("Google Chat", [("url", "Webhook URL", True)], False),
    "mattermost": ("Mattermost", [("url", "Webhook URL", True)], False), "rocketchat": ("Rocket.Chat", [("url", "Webhook URL", True)], False),
    "ntfy": ("ntfy", [("url", "Tópico (https://ntfy.sh/…)", False), ("token", "Token (opcional)", True)], False),
    "gotify": ("Gotify", [("url", "Endereço do servidor", False), ("token", "Token do app", True)], False),
    "pushover": ("Pushover", [("token", "Token do app", True), ("user", "Chave do usuário", True)], False),
    "ifttt": ("IFTTT", [("chave", "Chave do Webhooks", True)], False), "zapier": ("Zapier", [("url", "Catch Hook URL", True)], False),
    "make": ("Make", [("url", "Webhook URL", True)], False), "n8n": ("n8n", [("url", "Webhook URL", True)], True), "nodered": ("Node-RED", [("url", "Endpoint HTTP", True)], True),
    "home_assistant": ("Home Assistant", [("url", "Endereço (https://…)", False), ("token", "Token de longa duração", True)], True),
    "github": ("GitHub", [("token", "Token (escopo issues)", True), ("repo", "Repositório (dono/nome)", False)], False),
    "gitlab": ("GitLab", [("url", "Servidor (https://gitlab.com)", False), ("token", "Token", True), ("projeto", "Id do projeto", False)], False),
    "trello": ("Trello", [("chave", "API key", True), ("token", "Token", True), ("lista", "Id da lista", False)], False),
    "notion": ("Notion", [("token", "Token da integração", True), ("banco", "Id do banco de dados", False)], False),
    "airtable": ("Airtable", [("token", "Token pessoal", True), ("base", "Id da base", False), ("tabela", "Nome da tabela", False)], False),
    "todoist": ("Todoist", [("token", "Token", True)], False), "asana": ("Asana", [("token", "Token pessoal", True), ("projeto", "Id do projeto", False)], False),
    "clickup": ("ClickUp", [("token", "Token", True), ("lista", "Id da lista", False)], False),
    "linear": ("Linear", [("token", "API key", True), ("time", "Id do time", False)], False),
    "jira": ("Jira", [("url", "Site (https://….atlassian.net)", False), ("email", "E-mail", False), ("token", "API token", True), ("projeto", "Chave do projeto", False)], False),
    "evolution": ("WhatsApp (Evolution API)", [("url", "Servidor da Evolution", False), ("apikey", "API key", True), ("instancia", "Instância", False)], False),
    "twilio": ("SMS (Twilio)", [("sid", "Account SID", False), ("token", "Auth token", True), ("de", "Número de envio (+55…)", False)], False),
    "telegram_externo": ("Telegram (outro bot)", [("token", "Token do bot", True), ("chat", "Chat id", False)], False),
    "pagerduty": ("PagerDuty", [("chave", "Routing key", True)], False), "opsgenie": ("Opsgenie", [("chave", "API key", True)], False),
    "healthchecks": ("Healthchecks.io", [("url", "Ping URL", True)], False), "uptime_kuma": ("Uptime Kuma (push)", [("url", "Push URL", True)], False),
    "matrix": ("Matrix", [("url", "Homeserver", False), ("token", "Access token", True), ("sala", "Id da sala", False)], False),
    "sheets": ("Google Sheets (Apps Script)", [("url", "URL do Web App", True)], False),
    "webhook": ("Webhook genérico", [("url", "URL", True), ("cabecalho", "Cabeçalho extra (Nome: valor)", True)], False),
}
CONEXOES_CFG = "fluxos_conexoes"


def conexoes() -> dict:
    return db.cfg(CONEXOES_CFG) or {}


def conexao(cid: str, servico: str) -> dict:
    c = conexoes().get(str(cid or ""))
    if not c or c.get("servico") != servico:
        raise RuntimeError(f"Escolha uma conexão de {SERVICOS[servico][0]} (Rotinas → Conexões).")
    return c


def _url_ok(url: str, c: dict, servico: str):
    from .fluxos import _url_publica
    from . import transmissor
    if c.get("rede_local") and SERVICOS[servico][2]:
        if transmissor.PAPEL != "agente":
            raise RuntimeError("Conexão da rede local: só roda no agente do escritório (gatilhos automáticos), não pelo botão Executar na nuvem.")
        if not url.startswith(("http://", "https://")):
            raise RuntimeError("Endereço inválido.")
        return
    if not _url_publica(url):
        raise RuntimeError("Endereço recusado: use https:// público.")


def _req(metodo, url, c, servico, **kw):
    _url_ok(url, c, servico)
    r = httpx.request(metodo, url, timeout=12, follow_redirects=False, headers={"User-Agent": "ClimaEscritorio-Fluxos/1.0", **kw.pop("headers", {})}, **kw)
    if r.status_code >= 400:
        raise RuntimeError(f"{SERVICOS[servico][0]} respondeu {r.status_code}: {r.text[:160]}")
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, r.text[:500]


CONEXAO = lambda s: _f("conexao", "conexao", f"Conexão ({SERVICOS[s][0]})", s)   # noqa: E731
MSG = _f("texto", "textao", "Mensagem (use {{...}})")
TIT = _f("titulo", "texto", "Título")


def _msg_simples(servico, chave, rotulo):
    _reg(f"int_{servico}", "integracao", "Mensagens e avisos", rotulo, f"Manda uma mensagem para o {SERVICOS[servico][0]}. Resposta em {{{{integracao.resposta}}}}.",
         [CONEXAO(servico), MSG], fn=lambda fluxo, n, ctx, prazo, P, s=servico, k=chave: _fim(ctx, s, _req("POST", conexao(n["config"].get("conexao"), s)["url"], conexao(n["config"].get("conexao"), s), s, json={k: P("texto")[:3500]})))


def _fim(ctx, servico, r):
    st, resp = r
    ctx["integracao"] = {"servico": servico, "status": st, "resposta": resp}
    return "saida", f"{SERVICOS[servico][0]}: {st}"


_msg_simples("slack", "text", "Slack: mensagem")
_msg_simples("discord", "content", "Discord: mensagem")
_msg_simples("teams", "text", "Teams: mensagem")
_msg_simples("google_chat", "text", "Google Chat: mensagem")
_msg_simples("mattermost", "text", "Mattermost: mensagem")
_msg_simples("rocketchat", "text", "Rocket.Chat: mensagem")


def _x(servico, rotulo, desc, campos, fazer, grupo="Mensagens e avisos"):
    def fn(fluxo, n, ctx, prazo, P):
        c = conexao(n["config"].get("conexao"), servico)
        return _fim(ctx, servico, fazer(c, P, servico))
    _reg(f"int_{servico}", "integracao", grupo, rotulo, desc + " Resposta em {{integracao.resposta}}.", [CONEXAO(servico), *campos], fn=fn)


_x("ntfy", "ntfy: notificação no celular", "Push grátis pelo app ntfy.", [TIT, MSG],
   lambda c, P, s: _req("POST", c["url"], c, s, content=P("texto").encode()[:4000], headers={"Title": P("titulo")[:120].encode("latin-1", "ignore").decode("latin-1"), **({"Authorization": f"Bearer {c['token']}"} if c.get("token") else {})}))
_x("gotify", "Gotify: notificação", "Push no servidor Gotify.", [TIT, MSG],
   lambda c, P, s: _req("POST", c["url"].rstrip("/") + "/message", c, s, params={"token": c["token"]}, json={"title": P("titulo")[:120], "message": P("texto")[:4000], "priority": 5}))
_x("pushover", "Pushover: notificação", "Push no celular pelo Pushover.", [TIT, MSG],
   lambda c, P, s: _req("POST", "https://api.pushover.net/1/messages.json", c, s, data={"token": c["token"], "user": c["user"], "title": P("titulo")[:120], "message": P("texto")[:1000]}))
_x("ifttt", "IFTTT: disparar evento", "Dispara um evento do IFTTT (value1..3).", [_f("evento", "texto", "Nome do evento"), _f("v1", "texto", "value1"), _f("v2", "texto", "value2"), _f("v3", "texto", "value3")],
   lambda c, P, s: _req("POST", f"https://maker.ifttt.com/trigger/{re.sub(r'[^A-Za-z0-9_-]', '', P('evento'))}/with/key/{c['chave']}", c, s, json={"value1": P("v1"), "value2": P("v2"), "value3": P("v3")}), "Automação externa")
for _s, _r in (("zapier", "Zapier: disparar Zap"), ("make", "Make: disparar cenário"), ("n8n", "n8n: disparar workflow"), ("nodered", "Node-RED: chamar fluxo"), ("sheets", "Google Sheets: adicionar linha")):
    _x(_s, _r, "Manda os dados em JSON para o endereço da conexão.", [_f("dados", "textao", "Dados (chave=valor por linha ou JSON)")],
       lambda c, P, s: _req("POST", c["url"], c, s, json=_json(P("dados")) or {k.strip(): v.strip() for k, _, v in (l.partition("=") for l in P("dados").splitlines()) if k.strip()}), "Automação externa")
_x("webhook", "Webhook: chamar endereço", "POST com JSON (e cabeçalho extra da conexão).", [_f("dados", "textao", "Corpo JSON")],
   lambda c, P, s: _req("POST", c["url"], c, s, json=_json(P("dados")), headers=dict([tuple(x.strip() for x in c.get("cabecalho", "").split(":", 1))]) if ":" in (c.get("cabecalho") or "") else {}), "Automação externa")
_x("home_assistant", "Home Assistant: chamar serviço", "Ex.: domínio light, serviço turn_on, dados entity_id=light.sala.", [_f("dominio", "texto", "Domínio"), _f("servico", "texto", "Serviço"), _f("dados", "textao", "Dados (chave=valor)")],
   lambda c, P, s: _req("POST", f"{c['url'].rstrip('/')}/api/services/{re.sub(r'[^a-z_]', '', P('dominio'))}/{re.sub(r'[^a-z_]', '', P('servico'))}", c, s,
                        headers={"Authorization": f"Bearer {c['token']}"}, json={k.strip(): v.strip() for k, _, v in (l.partition("=") for l in P("dados").splitlines()) if k.strip()}), "Casa e escritório")
_x("github", "GitHub: abrir issue", "Cria uma issue no repositório da conexão.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", f"https://api.github.com/repos/{c['repo']}/issues", c, s, headers={"Authorization": f"Bearer {c['token']}", "Accept": "application/vnd.github+json"}, json={"title": P("titulo")[:250], "body": P("texto")[:60000]}), "Projetos e tarefas")
_x("gitlab", "GitLab: abrir issue", "Cria uma issue no projeto.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", f"{c['url'].rstrip('/')}/api/v4/projects/{c['projeto']}/issues", c, s, headers={"PRIVATE-TOKEN": c["token"]}, json={"title": P("titulo")[:250], "description": P("texto")[:60000]}), "Projetos e tarefas")
_x("trello", "Trello: criar cartão", "Cartão novo na lista da conexão.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", "https://api.trello.com/1/cards", c, s, params={"key": c["chave"], "token": c["token"], "idList": c["lista"], "name": P("titulo")[:250], "desc": P("texto")[:15000]}), "Projetos e tarefas")
_x("notion", "Notion: criar página", "Página nova no banco de dados (propriedade de título 'Name').", [TIT, _f("texto", "textao", "Texto")],
   lambda c, P, s: _req("POST", "https://api.notion.com/v1/pages", c, s, headers={"Authorization": f"Bearer {c['token']}", "Notion-Version": "2022-06-28"},
                        json={"parent": {"database_id": c["banco"]}, "properties": {"Name": {"title": [{"text": {"content": P("titulo")[:200]}}]}},
                              "children": [{"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"type": "text", "text": {"content": P("texto")[:1900]}}]}}]}), "Projetos e tarefas")
_x("airtable", "Airtable: adicionar registro", "Linha nova na tabela (campos chave=valor).", [_f("dados", "textao", "Campos (chave=valor)")],
   lambda c, P, s: _req("POST", f"https://api.airtable.com/v0/{c['base']}/{__import__('urllib.parse', fromlist=['x']).quote(c['tabela'])}", c, s, headers={"Authorization": f"Bearer {c['token']}"},
                        json={"fields": {k.strip(): v.strip() for k, _, v in (l.partition("=") for l in P("dados").splitlines()) if k.strip()}}), "Projetos e tarefas")
_x("todoist", "Todoist: criar tarefa", "Tarefa nova no Todoist.", [TIT, _f("prazo", "texto", "Prazo (ex.: amanhã, today)")],
   lambda c, P, s: _req("POST", "https://api.todoist.com/rest/v2/tasks", c, s, headers={"Authorization": f"Bearer {c['token']}"}, json={"content": P("titulo")[:500], **({"due_string": P("prazo")} if P("prazo") else {})}), "Projetos e tarefas")
_x("asana", "Asana: criar tarefa", "Tarefa nova no projeto do Asana.", [TIT, _f("texto", "textao", "Notas")],
   lambda c, P, s: _req("POST", "https://app.asana.com/api/1.0/tasks", c, s, headers={"Authorization": f"Bearer {c['token']}"}, json={"data": {"name": P("titulo")[:500], "notes": P("texto")[:20000], "projects": [c["projeto"]]}}), "Projetos e tarefas")
_x("clickup", "ClickUp: criar tarefa", "Tarefa nova na lista.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", f"https://api.clickup.com/api/v2/list/{c['lista']}/task", c, s, headers={"Authorization": c["token"]}, json={"name": P("titulo")[:500], "description": P("texto")[:20000]}), "Projetos e tarefas")
_x("linear", "Linear: criar issue", "Issue nova no time.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", "https://api.linear.app/graphql", c, s, headers={"Authorization": c["token"]},
                        json={"query": "mutation($t:String!,$d:String,$team:String!){issueCreate(input:{title:$t,description:$d,teamId:$team}){success issue{identifier url}}}",
                              "variables": {"t": P("titulo")[:250], "d": P("texto")[:20000], "team": c["time"]}}), "Projetos e tarefas")
_x("jira", "Jira: criar issue", "Issue (Task) no projeto.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", f"{c['url'].rstrip('/')}/rest/api/2/issue", c, s, auth=(c["email"], c["token"]),
                        json={"fields": {"project": {"key": c["projeto"]}, "summary": P("titulo")[:250], "description": P("texto")[:30000], "issuetype": {"name": "Task"}}}), "Projetos e tarefas")
_x("evolution", "WhatsApp: mandar mensagem", "Pela Evolution API (o número com DDI, ex.: 5548999990000).", [_f("numero", "texto", "Número"), MSG],
   lambda c, P, s: _req("POST", f"{c['url'].rstrip('/')}/message/sendText/{c['instancia']}", c, s, headers={"apikey": c["apikey"]}, json={"number": re.sub(r"\D", "", P("numero")), "text": P("texto")[:4000]}))
_x("twilio", "SMS: mandar mensagem", "Pelo Twilio (número com +55).", [_f("numero", "texto", "Número"), MSG],
   lambda c, P, s: _req("POST", f"https://api.twilio.com/2010-04-01/Accounts/{c['sid']}/Messages.json", c, s, auth=(c["sid"], c["token"]), data={"From": c["de"], "To": P("numero"), "Body": P("texto")[:1500]}))
_x("telegram_externo", "Telegram: outro bot", "Manda pelo bot da conexão (não o do sistema).", [MSG],
   lambda c, P, s: _req("POST", f"https://api.telegram.org/bot{c['token']}/sendMessage", c, s, json={"chat_id": c["chat"], "text": P("texto")[:4000]}))
_x("pagerduty", "PagerDuty: abrir alerta", "Evento de alerta (Events API v2).", [TIT, _f("gravidade", "escolha", "Gravidade", [["warning", "Aviso"], ["error", "Erro"], ["critical", "Crítico"], ["info", "Informação"]])],
   lambda c, P, s: _req("POST", "https://events.pagerduty.com/v2/enqueue", c, s, json={"routing_key": c["chave"], "event_action": "trigger",
                                                                                          "payload": {"summary": P("titulo")[:1000], "source": "clima-escritorio", "severity": P("gravidade") or "warning"}}), "Monitoramento")
_x("opsgenie", "Opsgenie: abrir alerta", "Alerta novo.", [TIT, _f("texto", "textao", "Descrição")],
   lambda c, P, s: _req("POST", "https://api.opsgenie.com/v2/alerts", c, s, headers={"Authorization": f"GenieKey {c['chave']}"}, json={"message": P("titulo")[:130], "description": P("texto")[:15000]}), "Monitoramento")
_x("healthchecks", "Healthchecks: sinal de vida", "Avisa que está tudo bem (ping).", [],
   lambda c, P, s: _req("GET", c["url"], c, s), "Monitoramento")
_x("uptime_kuma", "Uptime Kuma: sinal de vida", "Push para o monitor.", [_f("texto", "texto", "Mensagem")],
   lambda c, P, s: _req("GET", c["url"], c, s, params={"status": "up", "msg": P("texto")[:200] or "OK"}), "Monitoramento")
_x("matrix", "Matrix: mensagem", "Mensagem numa sala do Matrix.", [MSG],
   lambda c, P, s: _req("PUT", f"{c['url'].rstrip('/')}/_matrix/client/v3/rooms/{__import__('urllib.parse', fromlist=['x']).quote(c['sala'])}/send/m.room.message/{uuid.uuid4().hex}", c, s,
                        headers={"Authorization": f"Bearer {c['token']}"}, json={"msgtype": "m.text", "body": P("texto")[:4000]}))

# HTTP variantes (sem conexão; só https público)


def _http(metodo):
    def fn(fluxo, n, ctx, prazo, P):
        from .fluxos import _url_publica
        url = P("url").strip()
        if not _url_publica(url):
            raise RuntimeError("Use https:// para um endereço público.")
        corpo = _json(P("corpo")) if P("corpo").strip() else None
        r = httpx.request(metodo, url, json=corpo, timeout=10, follow_redirects=False, headers={"User-Agent": "ClimaEscritorio-Fluxos/1.0"})
        try:
            j = r.json()
        except ValueError:
            j = None
        ctx["http"] = {"status": r.status_code, "texto": r.text[:5000], "json": j}
        return "saida", f"{metodo} {r.status_code}"
    return fn


for _m in ("DELETE", "PATCH"):
    _reg(f"http_{_m.lower()}", "integracao", "HTTP", f"HTTP {_m}", "Chama um endereço https público. Resposta em {{http.…}}.", [_f("url", "texto", "URL (https)"), _f("corpo", "textao", "Corpo JSON (opcional)")], fn=_http(_m))
_reg("http_get_json", "integracao", "HTTP", "Buscar JSON (GET)", "GET e guarda o JSON em {{http.json}}.", [_f("url", "texto", "URL (https)")], fn=_http("GET"))
_reg("http_post_json", "integracao", "HTTP", "Enviar JSON (POST)", "POST com corpo JSON. Resposta em {{http.…}}.", [_f("url", "texto", "URL (https)"), _f("corpo", "textao", "Corpo JSON")], fn=_http("POST"))


# ---------------------------------------------------------------- grupos dos blocos originais (para a paleta organizar)
def _grupos_originais():
    from .fluxos import CATALOGO
    for t, g in {"gatilho_manual": "Básicos", "gatilho_horario": "Tempo e calendário", "gatilho_intervalo": "Tempo e calendário", "gatilho_ar": "Ares e comandos",
                 "gatilho_ligado_ha": "Ares e comandos", "gatilho_temperatura": "Tempo lá fora", "gatilho_webhook": "Básicos", "condicao": "Comparar e decidir",
                 "janela": "Comparar e decidir", "feriado": "Comparar e decidir", "esperar": "Controle", "ar_estado": "Dados do sistema", "clima_fora": "Dados do sistema",
                 "definir": "Controle", "ar": "Ares", "desligar_todos": "Ares", "cena": "Ares", "dispositivo": "Escritório", "notificacao": "Sistema",
                 "registrar": "Sistema", "email": "Mensagens e avisos", "telegram": "Mensagens e avisos", "http": "HTTP", "ia": "Inteligência artificial"}.items():
        if t in CATALOGO:
            CATALOGO[t].setdefault("grupo", g)
    if "ia" in CATALOGO and not any(cp[0] == "modelo" for cp in CATALOGO["ia"]["campos"]):
        CATALOGO["ia"]["campos"].append(MODELO)


_grupos_originais()


def contagem() -> dict:
    from .fluxos import CATALOGO
    c = {}
    for v in CATALOGO.values():
        c[v["cat"]] = c.get(v["cat"], 0) + 1
    return c


# ---------------------------------------------------------------- mais ações (atalhos que reaproveitam os blocos básicos)
def _delegar(tipo_base, montar):
    def fn(fluxo, n, ctx, prazo, P):
        from .fluxos import _rodar_no
        return _rodar_no(fluxo, {**n, "tipo": tipo_base, "config": montar(n["config"])}, ctx, prazo)
    return fn


def _todos(tipo, acao):
    def fn(fluxo, n, ctx, prazo, P):
        from . import dispositivos
        ok = 0
        for r in db.consultar("SELECT id FROM dispositivos WHERE tipo = ?", (tipo,)):
            try:
                dispositivos.comando(r["id"], acao, None, origem=_orig(fluxo)); ok += 1
            except Exception:  # noqa: BLE001
                pass
        return "saida", f"{ok} aparelho(s): {acao}"
    return fn


def _ligar_todos(fluxo, n, ctx, prazo, P):
    from . import clima
    ok = 0
    for a in db.consultar("SELECT id FROM aparelhos WHERE hub_id IS NOT NULL AND ligado = 0"):
        try:
            clima.aplicar(a["id"], _orig(fluxo), ligado=True, modo="frio", temperatura=_int(n["config"].get("temperatura"), 23)); ok += 1
        except Exception:  # noqa: BLE001
            pass
    return "saida", f"{ok} ar(es) ligados"


def _bug_estado(fluxo, n, ctx, prazo, P):
    bid = _int(P("bug_id"))
    est = n["config"].get("estado") or "corrigido"
    db.executar("UPDATE bugs SET estado = ?, atualizado_em = ?, corrigido_em = CASE WHEN ? = 'corrigido' THEN ? ELSE corrigido_em END WHERE id = ?",
                (est, db.agora(), est, db.agora(), bid))
    return "saida", f"bug #{bid}: {est}"


def _tarefa_prazo(fluxo, n, ctx, prazo, P):
    tid, pz = _int(P("tarefa_id")), P("prazo").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", pz):
        raise RuntimeError("Prazo no formato AAAA-MM-DD.")
    db.executar("UPDATE tarefas SET prazo = ?, atualizado_em = ? WHERE id = ?", (pz, db.agora(), tid))
    return "saida", f"#{tid} prazo {pz}"


def _apagar_global(fluxo, n, ctx, prazo, P):
    nome = re.sub(r"[^a-zA-Z0-9_]", "", n["config"].get("nome") or "")[:40]
    vg = db.cfg("fluxos_variaveis") or {}
    vg.pop(nome, None)
    db.set_cfg("fluxos_variaveis", vg)
    return "saida", f"{nome} apagada"


def _mensagem_lida(fluxo, n, ctx, prazo, P):
    mid = _int(P("mensagem_id"))
    db.executar("UPDATE site_mensagens SET lida = true WHERE id = ?", (mid,))
    return "saida", f"mensagem #{mid} lida"


def _webhook_get(fluxo, n, ctx, prazo, P):
    c = conexao(n["config"].get("conexao"), "webhook")
    return _fim(ctx, "webhook", _req("GET", c["url"], c, "webhook"))


_reg("ar_ligar_todos", "acao", "Ares", "Ligar todos os ares", "Liga no frio todos os ares desligados que têm transmissor.", [TEMP], fn=_ligar_todos)
for _t, _r, _tp, _a in [("luzes_apagar_todas", "Apagar todas as luzes", "luz", "desligar"), ("luzes_acender_todas", "Acender todas as luzes", "luz", "ligar"),
                         ("persianas_fechar_todas", "Fechar todas as persianas", "persiana", "fechar"), ("persianas_abrir_todas", "Abrir todas as persianas", "persiana", "abrir")]:
    _reg(_t, "acao", "Escritório", _r, "Todos os aparelhos desse tipo, de todas as salas.", [], fn=_todos(_tp, _a))
_reg("sis_aviso_alto", "acao", "Sistema", "Aviso importante no sino", "Notificação de gravidade alta.", [TIT, _f("texto", "textao", "Detalhe")],
     fn=_delegar("notificacao", lambda c: {"titulo": c.get("titulo"), "texto": c.get("texto"), "gravidade": "alta"}))
_reg("sis_email_admins", "acao", "Mensagens e avisos", "E-mail para dono e administradores", "Pelo Resend do sistema.", [_f("assunto", "texto", "Assunto"), _f("texto", "textao", "Mensagem")],
     fn=_delegar("email", lambda c: {"para": [], "assunto": c.get("assunto"), "texto": c.get("texto")}))
_reg("sis_telegram_admins", "acao", "Mensagens e avisos", "Telegram para dono e administradores", "Pelo bot do sistema.", [MSG],
     fn=_delegar("telegram", lambda c: {"para": [], "texto": c.get("texto")}))
_reg("sis_bug_estado", "acao", "Sistema", "Mudar estado de um bug", "Corrigido, descartado ou aberto de novo.", [_f("bug_id", "texto", "Id do bug"),
     _f("estado", "escolha", "Estado", [["corrigido", "Corrigido"], ["descartado", "Descartado"], ["aberto", "Aberto"]])], fn=_bug_estado)
_reg("sis_tarefa_prazo", "acao", "Sistema", "Mudar prazo de tarefa", "Novo prazo (AAAA-MM-DD).", [_f("tarefa_id", "texto", "Id da tarefa"), _f("prazo", "texto", "Prazo")], fn=_tarefa_prazo)
_reg("ctl_global_apagar", "acao", "Sistema", "Apagar variável global", "Remove uma variável de Rotinas → Variáveis.", [_f("nome", "texto", "Nome")], fn=_apagar_global)
_reg("sis_mensagem_lida", "acao", "Site e e-mail", "Marcar mensagem do site como lida", "Use {{evento.id}} do gatilho Mensagem pelo site.", [_f("mensagem_id", "texto", "Id da mensagem")], fn=_mensagem_lida)
_reg("int_webhook_get", "integracao", "Automação externa", "Webhook: buscar (GET)", "GET no endereço da conexão. Resposta em {{integracao.resposta}}.", [CONEXAO("webhook")], fn=_webhook_get)
