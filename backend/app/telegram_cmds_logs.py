"""Comandos do bot do Telegram acrescentados na 0.6.9: logs, quem fez o quê, auditoria, eventos de segurança, sessões,
bugs, e-mails, newsletter, uso da IA e das telas, fila, rotinas do banco, métricas, conversões, glossário, guia e atalhos
para cada tela. Todos leem dados reais do banco (nada inventado). O que mostra dados de outras pessoas ou de segurança
é só para dono e admin.

Registrado no fim de telegram_cmds.py (mesmo catálogo C).
"""
from __future__ import annotations

import datetime
import time

from . import db
from .telegram_cmds import APP, C, CATS, NOME_CAT, _e, ares, brl, cmd, num, tempo
from .telegram_cmds import quando as _quando

_ANTES = len(C)
ADM = ("dono", "admin")
CATS += [
    ("logs", "Logs do sistema", "Tudo o que aconteceu: por período, só falhas, só ares e só administração"),
    ("pessoas", "Quem fez o quê", "Ações de cada pessoa: quem ligou, desligou e mudou a temperatura"),
    ("auditoria", "Auditoria", "Mudanças administrativas: usuários, senhas, configurações, backup e integrações"),
    ("segev", "Eventos de segurança", "Logins, negados, limite de pedidos, robôs e bloqueios por período"),
    ("ips", "IPs e países", "IPs bloqueados, quem mais acessa, países e provedores"),
    ("sessoes", "Sessões e logins", "Sessões abertas, por pessoa, países e aparelhos"),
    ("bugsbot", "Bugs", "Bugs abertos, por gravidade, página e categoria"),
    ("notif", "Notificações", "Não lidas, por gravidade, por tipo e por período"),
    ("emailsbot", "E-mails enviados", "Envios, entregas, aberturas, devoluções e falhas"),
    ("newsletter", "Newsletter", "Inscritos, confirmados, campanhas e envios"),
    ("sitemsg", "Mensagens do site", "Contatos do site: não lidas, recentes e por tipo"),
    ("iauso", "Uso da IA", "Tokens por dia, por modelo, por pessoa e por canal"),
    ("telas", "Abrir telas", "Link direto para cada tela do painel"),
    ("usotelas", "Tempo de tela", "Quanto tempo a equipe passa em cada tela"),
    ("tempotela", "Tempo por tela", "Tempo de uso de cada tela nos últimos 7 dias, por pessoa"),
    ("avatarbot", "Biblioteca 3D", "Avatares e modelos 3D: total, espécies, tamanhos e licenças"),
    ("botoes", "Botões gravados", "Botões por ar, gerados, extras e quem está sem Desligar"),
    ("filabot", "Fila do agente", "Pedidos pendentes, falhas, tipos e tempo de resposta"),
    ("cronbot", "Rotinas do banco", "Últimas execuções das rotinas automáticas (pg_cron)"),
    ("metricas", "Métricas diárias", "Comandos, falhas e origem consolidados por dia"),
    ("alertasbot", "Alertas", "Alertas abertos, resolvidos e por tipo"),
    ("banco", "Saúde do banco", "Tamanho, crescimento e medições"),
    ("dispev", "Eventos dos dispositivos", "Luzes, persianas, cafeteira e fechadura: eventos e falhas"),
    ("cookies", "Cookies do site", "Consentimentos aceitos e recusados, versões e países"),
    ("termos", "Termos aceitos", "Quem aceitou os termos de uso e quem falta"),
    ("treino", "Treinamento", "Notas, aprovados e quem ainda não fez"),
    ("conversoes", "Conversões", "°C e °F, BTU e kW, watts em kWh e kWh em reais"),
    ("glossario", "Glossário", "O que é cada termo do sistema"),
    ("guiabot", "Passo a passo", "Link para cada capítulo do Guia"),
    ("tglogs", "Logs do Telegram", "Uso do bot por pessoa, comandos mais usados, erros e negados"),
    ("alexabot", "Alexa (lista)", "Ares na Alexa, fora dela e sem dispositivo no Sinric"),
    ("horasuso", "Horários de uso", "Primeiro a ligar, último a desligar e quem está ligado há mais tempo"),
    ("temps", "Temperaturas", "Média, mais baixa, mais alta e ares fora da faixa confortável"),
    ("modosar", "Modos dos ares", "Quais ares estão em frio, quente, ventilar, seco ou automático"),
    ("transbot", "Transmissores (detalhe)", "IPs, protocolo, problemas e reparos"),
    ("salasbot", "Salas (detalhe)", "Metas, responsáveis, tipos e salas sem ar"),
    ("usuariosbot", "Usuários", "Lista, papéis, inativos e últimos acessos"),
    ("agendabot", "Agendamentos (lista)", "Ativos, pausados e próximos"),
    ("cenasbot", "Cenas (lista)", "Todas as cenas, recentes e nunca usadas"),
    ("autosbot", "Automações (lista)", "Ativas, pausadas e as que mais dispararam"),
    ("timersbot", "Temporizadores (lista)", "Temporizadores pendentes e o próximo"),
    ("versoesar", "Versões no ar", "Versão do sistema, dos apps e as últimas publicações"),
    ("integridade", "Integridade dos registros", "Selos SHA-256 da Atividade e dos eventos de segurança"),
    ("feriadosbot", "Feriados", "Próximos feriados e se hoje é feriado"),
    ("datas", "Datas e horas", "Hora de Brasília, semana do ano e dias úteis do mês"),
    ("economia", "Custo por ar", "Quanto custa cada ar por hora, por dia e por mês"),
    ("potencia", "Potência", "Potência cadastrada de cada ar e o total ligado agora"),
    ("mapabot", "Planta do escritório", "Salas, pessoas, janelas e itens do mapa"),
    ("agentesbot", "Agentes (detalhe)", "Versão, temperatura, memória e disco de cada computador"),
    ("minhaseg", "Minha segurança", "Meus logins, sessões, IPs e biometria"),
    ("meuhist", "Meu histórico", "O que eu fiz hoje e nos últimos dias"),
    ("porhora", "Atividade por hora", "Em que horas o sistema é mais usado"),
    ("porsemana", "Atividade por dia da semana", "Registros de cada dia da semana nas últimas 4 semanas"),
    ("origens", "Atividade por origem", "Painel, Alexa, agenda, cenas, Telegram, música e sistema"),
    ("papeis", "Papéis", "O que cada papel pode fazer"),
    ("permbot", "Quem tem cada permissão", "Pessoas com cada uma das 14 permissões"),
    ("faixas", "Faixas de temperatura", "Mínima e máxima aceitas por ar"),
    ("periodosdia", "Períodos do dia", "Atividade de manhã, tarde, noite e madrugada"),
    ("backupsdia", "Retratos diários", "Retratos diários do banco feitos pela rotina das 5h"),
    ("calendario", "Calendário", "Calendário do mês com os feriados marcados"),
]
NOME_CAT.update({k: r for k, r, _ in CATS})
MENU = [[{"text": "Menu", "callback_data": "m:menu"}]]


def quando(ts) -> str:
    """Aceita epoch ou datetime (algumas tabelas das rotinas do banco usam timestamptz)."""
    if isinstance(ts, datetime.datetime):
        ts = ts.timestamp()
    return _quando(ts)


BRT = datetime.timezone(datetime.timedelta(hours=-3))


def _reg(nome, cat, desc, fn, uso="", arg=None, perm=None, papel=None, top=0):
    """Registra sem pisar em comando existente (nome repetido ganha o prefixo da categoria)."""
    if nome in C:
        nome = f"{cat}_{nome}"
    assert nome not in C, nome
    cmd(nome, cat, desc, uso, arg=arg, perm=perm, papel=papel, top=top)(fn)
    return nome


def _link(txt, rota):
    return [[{"text": txt, "url": f"{APP}{rota}"}], [{"text": "Menu", "callback_data": "m:menu"}]]


def _resp(ctx, titulo, linhas, rota=None, vazio="Nada no período.", botao="Abrir no painel"):
    corpo = "\n".join(linhas) if linhas else vazio
    ctx.enviar(f"<b>{_e(titulo)}</b>\n{corpo}"[:4000], _link(botao, rota) if rota else MENU)


def _num_arg(a, resto):
    t = str(resto or a or "").replace(",", ".").strip()
    try:
        return float(t.split()[0])
    except (ValueError, IndexError):
        return None


PERIODOS = (("1h", 3600, "na última hora"), ("6h", 6 * 3600, "nas últimas 6 h"), ("24h", 86400, "nas últimas 24 h"),
            ("7d", 7 * 86400, "nos últimos 7 dias"), ("30d", 30 * 86400, "nos últimos 30 dias"))


def _linha_ativ(r) -> str:
    quem = r.get("usuario") or r.get("origem") or ""
    ar = f" · {r['aparelho_nome']}" if r.get("aparelho_nome") else ""
    return f"{'✓' if r['ok'] else '✗'} {quando(r['quando'])} <b>{_e(quem)}</b>{_e(ar)}: {_e(r['acao'][:70])}"


def _ativ(extra="", params=(), limite=15):
    return db.consultar("SELECT t.quando, t.origem, t.acao, t.ok, t.detalhe, t.usuario, a.nome AS aparelho_nome FROM atividade t "
                        f"LEFT JOIN aparelhos a ON a.id = t.aparelho_id WHERE true{extra} ORDER BY t.id DESC LIMIT {int(limite)}", params)


# =====================================================================================================================
# LOGS
# =====================================================================================================================
_FILTROS_LOG = (("", "Log", "Tudo o que aconteceu", ""),
                ("falhas", "Falhas", "Só o que falhou", " AND t.ok = 0"),
                ("ares", "Ares", "Só comandos nos ares", " AND t.aparelho_id IS NOT NULL"),
                ("admin", "Administração", "Só ações administrativas (sem ar)", " AND t.aparelho_id IS NULL AND split_part(t.origem, ':', 1) IN ('painel', 'sistema')"))
for _pk, _ps, _pr in PERIODOS[1:]:
    for _fk, _ft, _fd, _fw in _FILTROS_LOG:
        def _fl(ctx, a, _ps=_ps, _pr=_pr, _ft=_ft, _fw=_fw):
            itens = _ativ(" AND t.quando > ?" + _fw, (db.agora() - _ps,), 20)
            _resp(ctx, f"{_ft} {_pr}", [_linha_ativ(r) for r in itens], "/seguranca?aba=logs")
        _reg(f"log_{_fk + '_' if _fk else ''}{_pk}", "logs", f"{_fd} {_pr}", _fl, papel=ADM)


def _log_buscar(ctx, a, resto=""):
    t = str(resto or a or "").strip()
    if len(t) < 2:
        return ctx.enviar("Use /log_buscar e o texto (ex.: /log_buscar desligar).")
    itens = _ativ(" AND (t.acao ILIKE ? OR t.detalhe ILIKE ? OR t.usuario ILIKE ? OR a.nome ILIKE ?)", (f"%{t[:60]}%",) * 4, 20)
    _resp(ctx, f"Log com \"{t[:40]}\"", [_linha_ativ(r) for r in itens], "/seguranca?aba=logs", "Nada encontrado.")


_reg("log_buscar", "logs", "Procura no log por texto (ação, detalhe, pessoa ou ar)", _log_buscar, "/log_buscar TEXTO", arg="texto", papel=ADM)


# =====================================================================================================================
# QUEM FEZ O QUÊ
# =====================================================================================================================
def _por_pessoa(ctx, desde, titulo, filtro="", params=()):
    rs = db.consultar("SELECT COALESCE(NULLIF(usuario, ''), '(sem pessoa: ' || split_part(origem, ':', 1) || ')') AS quem, count(*) AS n, "
                      f"count(*) FILTER (WHERE ok = 0) AS f FROM atividade WHERE quando > ?{filtro} GROUP BY 1 ORDER BY 2 DESC LIMIT 15", (desde, *params))
    _resp(ctx, titulo, [f"• <b>{_e(r['quem'])}</b>: {r['n']}" + (f" ({r['f']} falha(s))" if r["f"] else "") for r in rs], "/atividade?aba=pessoas")


_LIGAR = " AND acao ILIKE 'Ligar%'"
_DESLIGAR = " AND acao ILIKE 'Desligar%'"
_TEMP = " AND acao LIKE '%°%'"
for _nome, _desc, _filtro, _per in (("quem_fez_hoje", "Quantas ações cada pessoa fez hoje", "", 0), ("quem_fez_7d", "Ações por pessoa em 7 dias", "", 7),
                                    ("quem_fez_30d", "Ações por pessoa em 30 dias", "", 30), ("quem_ligou_hoje", "Quem ligou ares hoje", _LIGAR, 0),
                                    ("quem_desligou_hoje", "Quem desligou ares hoje", _DESLIGAR, 0), ("quem_mudou_temp_hoje", "Quem mudou a temperatura hoje", _TEMP, 0),
                                    ("quem_ligou_7d", "Quem ligou ares em 7 dias", _LIGAR, 7), ("quem_desligou_7d", "Quem desligou ares em 7 dias", _DESLIGAR, 7)):
    def _fp(ctx, a, _desc=_desc, _filtro=_filtro, _per=_per):
        desde = int(datetime.datetime.now(BRT).replace(hour=0, minute=0, second=0).timestamp()) if _per == 0 else db.agora() - _per * 86400
        _por_pessoa(ctx, desde, _desc, " AND aparelho_id IS NOT NULL" + _filtro if _filtro else "")
    _reg(_nome, "pessoas", _desc, _fp, papel=ADM)


def _acoes_de(ctx, a, resto=""):
    t = str(resto or a or "").strip()
    if len(t) < 2:
        return ctx.enviar("Use /acoes_de e o nome da pessoa (ex.: /acoes_de Deison).")
    itens = _ativ(" AND t.usuario ILIKE ?", (f"%{t[:40]}%",), 20)
    _resp(ctx, f"Últimas ações de {t[:40]}", [_linha_ativ(r) for r in itens], "/atividade?aba=pessoas", "Nada registrado com esse nome.")


_reg("acoes_de", "pessoas", "Últimas ações de uma pessoa", _acoes_de, "/acoes_de NOME", arg="texto", papel=ADM)


def _ultimo_de_cada(ctx, a):
    rs = db.consultar("SELECT DISTINCT ON (usuario_id) usuario, quando, acao FROM atividade WHERE usuario_id IS NOT NULL ORDER BY usuario_id, id DESC")
    rs.sort(key=lambda r: -r["quando"])
    _resp(ctx, "Última ação de cada pessoa", [f"• <b>{_e(r['usuario'])}</b> {quando(r['quando'])}: {_e(r['acao'][:60])}" for r in rs], "/atividade?aba=pessoas")


_reg("ultima_acao_cada", "pessoas", "A última ação de cada pessoa", _ultimo_de_cada, papel=ADM)

# =====================================================================================================================
# AUDITORIA
# =====================================================================================================================
_AUD = (("auditoria_usuarios", "Usuários criados, alterados e apagados", "Usuário%"),
        ("auditoria_senhas", "Senhas redefinidas e trocas de e-mail", "%enha%"),
        ("auditoria_email", "Trocas de e-mail de login", "E-mail de usuário%"),
        ("auditoria_sessoes", "Sessões encerradas à distância", "%essões%"),
        ("auditoria_backup", "Backups gerados e restaurados", "%ackup%"),
        ("auditoria_config", "Mudanças de configuração e marca", "%onfigura%"),
        ("auditoria_dns", "Mudanças no DNS da Cloudflare", "Cloudflare%"),
        ("auditoria_vercel", "Ações na Vercel", "%ercel%"),
        ("auditoria_dono", "Transferência do posto de dono", "Posto de dono%"),
        ("auditoria_duas_etapas", "Verificação em duas etapas removida", "Verificação em duas%"))
for _n, _d, _pad in _AUD:
    def _fa(ctx, a, _d=_d, _pad=_pad):
        itens = _ativ(" AND t.acao ILIKE ? AND t.quando > ?", (_pad, db.agora() - 90 * 86400), 20)
        _resp(ctx, f"{_d} (90 dias)", [_linha_ativ(r) + (f"\n   {_e(r['detalhe'][:90])}" if r.get("detalhe") else "") for r in itens], "/seguranca?aba=logs")
    _reg(_n, "auditoria", f"{_d} nos últimos 90 dias", _fa, papel=ADM)

# =====================================================================================================================
# EVENTOS DE SEGURANÇA
# =====================================================================================================================
_TIPOS_SEG = (("login_ok", "Logins aceitos"), ("login_falhou", "Logins com senha errada"), ("sem_login", "Pedidos sem login"),
              ("token_invalido", "Sessões vencidas ou inválidas"), ("rate_limit", "Limite de pedidos atingido"), ("auth_negado", "Acessos negados"),
              ("scanner", "Robôs procurando falhas"), ("bloqueado", "Pedidos de IPs bloqueados"), ("ip_bloqueado_auto", "IPs bloqueados sozinhos"),
              ("bot_bloqueado", "Robôs barrados"), ("esqueci_senha", "Pedidos de nova senha"), ("sem_agente", "Comandos sem agente no escritório"),
              ("escudo_ligado", "Escudo anti-DDoS ligado"), ("acesso", "Acessos registrados"))
for _t, _r in _TIPOS_SEG:
    for _pk, _ps, _pr in (PERIODOS[2], PERIODOS[3]):
        def _fs(ctx, a, _t=_t, _r=_r, _ps=_ps, _pr=_pr):
            rs = db.consultar("SELECT quando, ip, rota, detalhe, pais FROM seguranca_eventos WHERE tipo = ? AND quando > ? ORDER BY id DESC LIMIT 15", (_t, db.agora() - _ps))
            tot = db.um("SELECT count(*) AS n FROM seguranca_eventos WHERE tipo = ? AND quando > ?", (_t, db.agora() - _ps))["n"]
            _resp(ctx, f"{_r} {_pr}: {tot}", [f"• {quando(r['quando'])} {_e(r['ip'])} {_e(r['pais'])} {_e(r['rota'][:40])} {_e(r['detalhe'][:40])}" for r in rs], "/seguranca")
        _reg(f"seg_{_t}_{_pk}", "segev", f"{_r} {_pr}", _fs, papel=ADM)


# =====================================================================================================================
# IPs
# =====================================================================================================================
def _ips_bloqueados(ctx, a):
    rs = db.consultar("SELECT alvo, tipo, motivo, automatico, expira_em FROM seguranca_ips ORDER BY id DESC LIMIT 20")
    _resp(ctx, "IPs e regras do firewall", [f"• {_e(r['alvo'])} ({_e(r['tipo'])}) {_e(r['motivo'][:50])}" + (" · automático" if r["automatico"] else "")
                                             + (f" · até {quando(r['expira_em'])}" if r.get("expira_em") else "") for r in rs], "/seguranca", "Nenhuma regra.")


def _top_ips(ctx, seg, rot):
    rs = db.consultar("SELECT ip, max(pais) AS pais, count(*) AS n FROM seguranca_eventos WHERE quando > ? GROUP BY ip ORDER BY 3 DESC LIMIT 12", (db.agora() - seg,))
    _resp(ctx, f"IPs com mais eventos {rot}", [f"• {_e(r['ip'])} {_e(r['pais'])}: {r['n']}" for r in rs], "/seguranca")


def _paises(ctx, seg, rot):
    rs = db.consultar("SELECT COALESCE(NULLIF(pais, ''), '-') AS pais, count(*) AS n, count(DISTINCT ip) AS ips FROM seguranca_eventos WHERE quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 15", (db.agora() - seg,))
    _resp(ctx, f"Países {rot}", [f"• {_e(r['pais'])}: {r['n']} evento(s), {r['ips']} IP(s)" for r in rs], "/seguranca")


def _ip_info(ctx, a, resto=""):
    ip = str(resto or a or "").strip()[:45]
    if not ip:
        return ctx.enviar("Use /ip_info e o IP.")
    i = db.um("SELECT ptr, provedor, consultado_em FROM seguranca_ip_info WHERE ip = ?", (ip,))
    n = db.um("SELECT count(*) AS n, max(quando) AS ultimo FROM seguranca_eventos WHERE ip = ?", (ip,))
    _resp(ctx, f"IP {ip}", [f"Eventos: {n['n']} · último {quando(n['ultimo'])}", f"Nome reverso: {_e((i or {}).get('ptr') or '-')}", f"Provedor: {_e((i or {}).get('provedor') or '-')}"], "/seguranca")


def _provedores(ctx, a):
    rs = db.consultar("SELECT COALESCE(NULLIF(provedor, ''), '-') AS p, count(*) AS n FROM seguranca_ip_info GROUP BY 1 ORDER BY 2 DESC LIMIT 15")
    _resp(ctx, "Provedores dos IPs consultados", [f"• {_e(r['p'])}: {r['n']}" for r in rs], "/seguranca")


_reg("ips_bloqueados", "ips", "IPs bloqueados e regras do firewall", _ips_bloqueados, papel=ADM)
_reg("ips_top_24h", "ips", "IPs com mais eventos nas últimas 24 h", lambda ctx, a: _top_ips(ctx, 86400, "nas últimas 24 h"), papel=ADM)
_reg("ips_top_7d", "ips", "IPs com mais eventos em 7 dias", lambda ctx, a: _top_ips(ctx, 7 * 86400, "em 7 dias"), papel=ADM)
_reg("paises_24h", "ips", "Países de onde vieram os acessos nas últimas 24 h", lambda ctx, a: _paises(ctx, 86400, "nas últimas 24 h"), papel=ADM)
_reg("paises_7d", "ips", "Países de onde vieram os acessos em 7 dias", lambda ctx, a: _paises(ctx, 7 * 86400, "em 7 dias"), papel=ADM)
_reg("ip_info", "ips", "Eventos, nome reverso e provedor de um IP", _ip_info, "/ip_info IP", arg="texto", papel=ADM)
_reg("provedores", "ips", "Provedores de internet dos IPs vistos", _provedores, papel=ADM)


# =====================================================================================================================
# SESSÕES
# =====================================================================================================================
def _nav(agente: str) -> str:
    a = agente or ""
    n = next((x for x in ("Edg", "OPR", "Brave", "Firefox", "Chrome", "Safari") if x in a), "Navegador")
    s = next((x for x, k in (("Android", "Android"), ("iPhone", "iPhone"), ("Windows", "Windows"), ("macOS", "Mac"), ("Linux", "Linux")) if k in a), "")
    return f"{ {'Edg': 'Edge', 'OPR': 'Opera'}.get(n, n)}{' · ' + s if s else ''}"


def _sessoes(ctx, extra="", params=(), titulo="Sessões abertas"):
    rs = db.consultar("SELECT s.criado_em, s.visto_em, s.ip, s.pais, s.cidade, s.agente, u.nome, u.email FROM sessoes_uso s LEFT JOIN usuarios u ON u.id = s.usuario_id "
                      f"WHERE NOT s.revogada{extra} ORDER BY s.visto_em DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"• <b>{_e(r['nome'] or r['email'])}</b> {_e(_nav(r['agente']))} · {_e(r['cidade'] or r['pais'])} · visto {quando(r['visto_em'])}" for r in rs],
          "/configuracoes?aba=seguranca", "Nenhuma sessão.")


_reg("sessoes_abertas", "sessoes", "Sessões abertas de todos (últimos usos)", lambda ctx, a: _sessoes(ctx, " AND s.visto_em > ?", (db.agora() - 7 * 86400,)), papel=ADM)
_reg("sessoes_hoje", "sessoes", "Sessões usadas nas últimas 24 h", lambda ctx, a: _sessoes(ctx, " AND s.visto_em > ?", (db.agora() - 86400,), "Sessões nas últimas 24 h"), papel=ADM)
_reg("sessoes_minhas", "sessoes", "As suas sessões abertas", lambda ctx, a: _sessoes(ctx, " AND s.usuario_id::text = ?", (str(ctx.u["id"]),), "Suas sessões"))


def _sessoes_por_pessoa(ctx, a):
    rs = db.consultar("SELECT u.nome, u.email, count(*) AS n, max(s.visto_em) AS ult FROM sessoes_uso s JOIN usuarios u ON u.id = s.usuario_id WHERE NOT s.revogada GROUP BY u.nome, u.email ORDER BY 3 DESC")
    _resp(ctx, "Sessões por pessoa", [f"• <b>{_e(r['nome'] or r['email'])}</b>: {r['n']} · último uso {quando(r['ult'])}" for r in rs], "/configuracoes?aba=usuarios")


def _sessoes_paises(ctx, a):
    rs = db.consultar("SELECT COALESCE(NULLIF(cidade, ''), NULLIF(pais, ''), '-') AS l, count(*) AS n FROM sessoes_uso WHERE NOT revogada GROUP BY 1 ORDER BY 2 DESC LIMIT 12")
    _resp(ctx, "De onde as sessões entram", [f"• {_e(r['l'])}: {r['n']}" for r in rs], "/configuracoes?aba=usuarios")


def _sessoes_aparelhos(ctx, a):
    cont = {}
    for r in db.consultar("SELECT agente FROM sessoes_uso WHERE NOT revogada"):
        k = _nav(r["agente"]); cont[k] = cont.get(k, 0) + 1
    _resp(ctx, "Navegadores e sistemas das sessões", [f"• {_e(k)}: {v}" for k, v in sorted(cont.items(), key=lambda kv: -kv[1])], "/configuracoes?aba=usuarios")


def _passkeys(ctx, a):
    rs = db.consultar("SELECT u.nome, u.email, p.nome AS chave, p.ultimo_uso FROM passkeys p JOIN usuarios u ON u.id = p.usuario_id ORDER BY p.criado_em DESC")
    _resp(ctx, "Biometria cadastrada", [f"• <b>{_e(r['nome'] or r['email'])}</b>: {_e(r['chave'] or 'chave')} · último uso {quando(r['ultimo_uso'])}" for r in rs], "/configuracoes?aba=seguranca", "Ninguém cadastrou biometria.")


_reg("sessoes_por_pessoa", "sessoes", "Quantas sessões cada pessoa tem abertas", _sessoes_por_pessoa, papel=ADM)
_reg("sessoes_locais", "sessoes", "Cidades e países das sessões abertas", _sessoes_paises, papel=ADM)
_reg("sessoes_navegadores", "sessoes", "Navegadores e sistemas das sessões", _sessoes_aparelhos, papel=ADM)
_reg("biometrias", "sessoes", "Quem tem biometria (chave de acesso) cadastrada", _passkeys, papel=ADM)


# =====================================================================================================================
# BUGS
# =====================================================================================================================
def _bugs(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT id, titulo, gravidade, estado, pagina, ocorrencias, atualizado_em FROM bugs WHERE true{extra} ORDER BY atualizado_em DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"• <b>#{r['id']}</b> [{_e(r['gravidade'])}] {_e(r['titulo'][:70])} · {_e(r['estado'])}" + (f" · {r['ocorrencias']}×" if (r["ocorrencias"] or 0) > 1 else "") for r in rs],
          "/bugs", "Nenhum bug.")


_reg("bugs_abertos", "bugsbot", "Bugs abertos", lambda ctx, a: _bugs(ctx, "Bugs abertos", " AND estado NOT IN ('corrigido', 'descartado')"))
for _g in ("critica", "alta", "media", "baixa"):
    _reg(f"bugs_{_g}", "bugsbot", f"Bugs abertos de gravidade {_g}", lambda ctx, a, _g=_g: _bugs(ctx, f"Bugs ({_g})", " AND gravidade = ? AND estado NOT IN ('corrigido', 'descartado')", (_g,)))
_reg("bugs_recentes", "bugsbot", "Bugs atualizados nos últimos 7 dias", lambda ctx, a: _bugs(ctx, "Bugs recentes", " AND atualizado_em > ?", (db.agora() - 7 * 86400,)))
_reg("bugs_corrigidos", "bugsbot", "Bugs corrigidos nos últimos 30 dias", lambda ctx, a: _bugs(ctx, "Corrigidos (30 dias)", " AND estado = 'corrigido' AND atualizado_em > ?", (db.agora() - 30 * 86400,)))


def _bugs_por(ctx, campo, titulo):
    rs = db.consultar(f"SELECT COALESCE(NULLIF({campo}, ''), '-') AS k, count(*) AS n FROM bugs WHERE estado NOT IN ('corrigido', 'descartado') GROUP BY 1 ORDER BY 2 DESC LIMIT 15")  # nosec B608
    _resp(ctx, titulo, [f"• {_e(r['k'])}: {r['n']}" for r in rs], "/bugs", "Nenhum bug aberto.")


_reg("bugs_por_pagina", "bugsbot", "Bugs abertos por página", lambda ctx, a: _bugs_por(ctx, "pagina", "Bugs abertos por página"))
_reg("bugs_por_categoria", "bugsbot", "Bugs abertos por categoria", lambda ctx, a: _bugs_por(ctx, "categoria", "Bugs abertos por categoria"))
_reg("bugs_por_origem", "bugsbot", "Bugs abertos por origem (automático ou relatado)", lambda ctx, a: _bugs_por(ctx, "origem", "Bugs abertos por origem"))


def _bug(ctx, a, resto=""):
    n = "".join(ch for ch in str(resto or a or "") if ch.isdigit())
    b = db.um("SELECT * FROM bugs WHERE id = ?", (int(n),)) if n else None
    if not b:
        return ctx.enviar("Use /bug e o número (ex.: /bug 12).")
    _resp(ctx, f"#{b['id']} {b['titulo'][:90]}", [f"Gravidade: {_e(b['gravidade'])} · {_e(b['estado'])} · {_e(b['pagina'])}", f"Ocorrências: {b['ocorrencias']} · atualizado {quando(b['atualizado_em'])}",
                                                  _e((b["descricao"] or "")[:600])], f"/bugs?bug={b['id']}")


_reg("bug_ver", "bugsbot", "Detalhe de um bug", _bug, "/bug_ver NÚMERO", arg="texto")


# =====================================================================================================================
# NOTIFICAÇÕES
# =====================================================================================================================
def _notifs(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT titulo, gravidade, tipo, atualizado_em, lida FROM notificacoes WHERE NOT arquivada{extra} ORDER BY atualizado_em DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"{'·' if r['lida'] else '•'} [{_e(r['gravidade'])}] {_e(r['titulo'][:70])} ({quando(r['atualizado_em'])})" for r in rs], "/notificacoes", "Nenhuma.")


_reg("notif_nao_lidas", "notif", "Notificações não lidas", lambda ctx, a: _notifs(ctx, "Não lidas", " AND NOT lida"))
for _g in ("critica", "alta", "media", "baixa"):
    _reg(f"notif_{_g}", "notif", f"Notificações de gravidade {_g}", lambda ctx, a, _g=_g: _notifs(ctx, f"Gravidade {_g}", " AND gravidade = ?", (_g,)))
_reg("notif_hoje", "notif", "Notificações das últimas 24 h", lambda ctx, a: _notifs(ctx, "Últimas 24 h", " AND atualizado_em > ?", (db.agora() - 86400,)))


def _notif_tipos(ctx, a):
    rs = db.consultar("SELECT tipo, count(*) AS n, count(*) FILTER (WHERE NOT lida) AS nl FROM notificacoes WHERE NOT arquivada GROUP BY 1 ORDER BY 2 DESC")
    _resp(ctx, "Notificações por tipo", [f"• {_e(r['tipo'])}: {r['n']} ({r['nl']} não lida(s))" for r in rs], "/notificacoes")


_reg("notif_por_tipo", "notif", "Notificações por tipo", _notif_tipos)


# =====================================================================================================================
# E-MAILS E NEWSLETTER
# =====================================================================================================================
def _emails(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT tipo, para, assunto, estado, criado_em FROM email_envios WHERE true{extra} ORDER BY id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"• {quando(r['criado_em'])} [{_e(r['estado'])}] {_e(r['tipo'])} → {_e((r['para'] or '')[:3])}… {_e((r['assunto'] or '')[:50])}" for r in rs], "/emails", "Nenhum e-mail.")


_reg("emails_recentes", "emailsbot", "Últimos e-mails enviados", lambda ctx, a: _emails(ctx, "Últimos e-mails"), papel=ADM)
for _est, _rot in (("bounced", "devolvidos"), ("delivered", "entregues"), ("opened", "abertos"), ("clicked", "clicados"), ("delivery_delayed", "atrasados"), ("erro", "com erro")):
    _reg(f"emails_{_rot.replace(' ', '_')}", "emailsbot", f"E-mails {_rot} (30 dias)",
         lambda ctx, a, _est=_est, _rot=_rot: _emails(ctx, f"E-mails {_rot} (30 dias)", " AND (estado = ? OR (? = 'erro' AND erro <> '')) AND criado_em > ?", (_est, _est, db.agora() - 30 * 86400)), papel=ADM)


def _emails_tipo(ctx, a):
    rs = db.consultar("SELECT tipo, count(*) AS n FROM email_envios WHERE criado_em > ? GROUP BY 1 ORDER BY 2 DESC", (db.agora() - 30 * 86400,))
    _resp(ctx, "E-mails por tipo (30 dias)", [f"• {_e(r['tipo'])}: {r['n']}" for r in rs], "/emails")


_reg("emails_por_tipo", "emailsbot", "E-mails enviados por tipo (30 dias)", _emails_tipo, papel=ADM)


def _news(ctx, titulo, estado=None):
    if estado:
        n = db.um("SELECT count(*) AS n FROM newsletter_inscritos WHERE estado = ?", (estado,))["n"]
        return _resp(ctx, titulo, [f"{n} inscrito(s)"], "/emails?aba=newsletter")
    rs = db.consultar("SELECT estado, count(*) AS n FROM newsletter_inscritos GROUP BY 1")
    _resp(ctx, titulo, [f"• {_e(r['estado'])}: {r['n']}" for r in rs], "/emails?aba=newsletter", "Nenhum inscrito.")


_reg("news_inscritos", "newsletter", "Inscritos da newsletter por estado", lambda ctx, a: _news(ctx, "Inscritos"), papel=ADM)
for _est, _rot in (("confirmado", "confirmados"), ("pendente", "aguardando confirmação"), ("cancelado", "que saíram")):
    _reg(f"news_{_est}s", "newsletter", f"Inscritos {_rot}", lambda ctx, a, _est=_est, _rot=_rot: _news(ctx, f"Inscritos {_rot}", _est), papel=ADM)


def _campanhas(ctx, a, estado=None):
    rs = db.consultar("SELECT titulo, estado, enviados, falhas, enviada_em, agendada_para FROM newsletter_campanhas" + (" WHERE estado = ?" if estado else "") + " ORDER BY id DESC LIMIT 12", (estado,) if estado else ())
    _resp(ctx, "Campanhas" + (f" ({estado})" if estado else ""), [f"• {_e(r['titulo'][:60])} · {_e(r['estado'])} · {r['enviados'] or 0} enviado(s)" + (f" · agendada {quando(r['agendada_para'])}" if r.get("agendada_para") else "") for r in rs],
          "/emails?aba=newsletter", "Nenhuma campanha.")


_reg("news_campanhas", "newsletter", "Campanhas da newsletter", _campanhas, papel=ADM)
_reg("news_agendadas", "newsletter", "Campanhas agendadas", lambda ctx, a: _campanhas(ctx, a, "agendada"), papel=ADM)


# =====================================================================================================================
# MENSAGENS DO SITE
# =====================================================================================================================
def _msgs(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT quando, tipo, nome, assunto, lida, respondida, cidade FROM site_mensagens WHERE NOT arquivada{extra} ORDER BY id DESC LIMIT 12", params)
    _resp(ctx, titulo, [f"{'·' if r['lida'] else '•'} {quando(r['quando'])} <b>{_e(r['nome'])}</b> [{_e(r['tipo'])}] {_e((r['assunto'] or '')[:50])}" + (" · respondida" if r["respondida"] else "") for r in rs],
          "/mensagens", "Nenhuma mensagem.")


_reg("msgs_nao_lidas", "sitemsg", "Mensagens do site não lidas", lambda ctx, a: _msgs(ctx, "Não lidas", " AND NOT lida"), perm="mensagens.ver")
_reg("msgs_recentes", "sitemsg", "Últimas mensagens do site", lambda ctx, a: _msgs(ctx, "Últimas mensagens"), perm="mensagens.ver")
_reg("msgs_7d", "sitemsg", "Mensagens do site em 7 dias", lambda ctx, a: _msgs(ctx, "Últimos 7 dias", " AND quando > ?", (db.agora() - 7 * 86400,)), perm="mensagens.ver")
_reg("msgs_sem_resposta", "sitemsg", "Mensagens ainda sem resposta", lambda ctx, a: _msgs(ctx, "Sem resposta", " AND NOT respondida"), perm="mensagens.ver")


def _msgs_tipo(ctx, a):
    rs = db.consultar("SELECT tipo, count(*) AS n FROM site_mensagens GROUP BY 1 ORDER BY 2 DESC")
    _resp(ctx, "Mensagens por tipo", [f"• {_e(r['tipo'])}: {r['n']}" for r in rs], "/mensagens")


_reg("msgs_por_tipo", "sitemsg", "Mensagens do site por tipo", _msgs_tipo, perm="mensagens.ver")


# =====================================================================================================================
# USO DA IA
# =====================================================================================================================
def _ia_tokens(ctx, dias, rot):
    r = db.um("SELECT COALESCE(sum(tokens), 0) AS t, count(*) AS n FROM ia_uso WHERE quando > ?", (db.agora() - dias * 86400,))
    _resp(ctx, f"IA {rot}", [f"{num(r['t'], 0)} tokens em {r['n']} pedido(s)"], "/ia")


for _d, _r in ((1, "nas últimas 24 h"), (7, "em 7 dias"), (30, "em 30 dias")):
    _reg(f"ia_tokens_{_d}d", "iauso", f"Tokens gastos pela IA {_r}", lambda ctx, a, _d=_d, _r=_r: _ia_tokens(ctx, _d, _r), papel=ADM)


def _ia_por(ctx, campo, titulo):
    if campo == "usuario":
        rs = db.consultar("SELECT COALESCE(NULLIF(u.nome, ''), u.email, '-') AS k, sum(i.tokens) AS t, count(*) AS n FROM ia_uso i LEFT JOIN usuarios u ON u.id::text = i.usuario_id::text "
                          "WHERE i.quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 12", (db.agora() - 30 * 86400,))
    else:
        rs = db.consultar(f"SELECT COALESCE(NULLIF({campo}, ''), '-') AS k, sum(tokens) AS t, count(*) AS n FROM ia_uso WHERE quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 12", (db.agora() - 30 * 86400,))  # nosec B608
    _resp(ctx, titulo, [f"• {_e(r['k'])}: {num(r['t'], 0)} tokens, {r['n']} pedido(s)" for r in rs], "/ia", "Sem uso em 30 dias.")


_reg("ia_por_modelo", "iauso", "Uso da IA por modelo (30 dias)", lambda ctx, a: _ia_por(ctx, "modelo", "IA por modelo (30 dias)"), papel=ADM)
_reg("ia_por_canal", "iauso", "Uso da IA por canal: painel ou Telegram (30 dias)", lambda ctx, a: _ia_por(ctx, "canal", "IA por canal (30 dias)"), papel=ADM)
_reg("ia_por_pessoa", "iauso", "Uso da IA por pessoa (30 dias)", lambda ctx, a: _ia_por(ctx, "usuario", "IA por pessoa (30 dias)"), papel=ADM)
_reg("ia_minhas_conversas", "iauso", "Suas conversas salvas com a IA",
     lambda ctx, a: _resp(ctx, "Suas conversas", [f"• {_e(r['titulo'][:60])} ({quando(r['atualizado_em'])})" for r in db.consultar(
         "SELECT titulo, atualizado_em FROM ia_conversas WHERE usuario_id::text = ? ORDER BY atualizado_em DESC LIMIT 12", (str(ctx.u["id"]),))], "/ia", "Nenhuma conversa salva."))

# =====================================================================================================================
# TELAS (link direto) E TEMPO DE TELA
# =====================================================================================================================
from .uso import NOMES as _TELAS  # noqa: E402


def _slug(rota: str) -> str:
    return "painel" if rota == "/" else rota.strip("/").replace("-", "_").replace("/", "_")


for _rota, _nome in _TELAS.items():
    if ":" in _rota:
        continue
    _reg(f"abrir_{_slug(_rota)}", "telas", f"Abre a tela {_nome}", lambda ctx, a, _rota=_rota, _nome=_nome: ctx.enviar(f"<b>{_e(_nome)}</b>\n{APP}{_rota}", _link(f"Abrir {_nome}", _rota)))


def _ms(v) -> str:
    return tempo(int(v or 0) / 1000)


def _uso(ctx, dias, titulo, so_eu=False):
    desde = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 - (dias - 1) * 86400))
    if so_eu:
        rs = db.consultar("SELECT rota AS k, sum(ms) AS ms FROM uso_telas WHERE dia >= ? AND usuario_id::text = ? GROUP BY 1 ORDER BY 2 DESC LIMIT 12", (desde, str(ctx.u["id"])))
        return _resp(ctx, titulo, [f"• {_e(_TELAS.get(r['k'], r['k']))}: {_ms(r['ms'])}" for r in rs], "/configuracoes?aba=usuarios&ver=uso", "Sem uso registrado.")
    rs = db.consultar("SELECT COALESCE(NULLIF(u.nome, ''), u.email) AS k, sum(t.ms) AS ms FROM uso_telas t JOIN usuarios u ON u.id = t.usuario_id WHERE t.dia >= ? GROUP BY 1 ORDER BY 2 DESC", (desde,))
    _resp(ctx, titulo, [f"• <b>{_e(r['k'])}</b>: {_ms(r['ms'])}" for r in rs], "/configuracoes?aba=usuarios&ver=uso", "Sem uso registrado.")


_reg("uso_hoje", "usotelas", "Tempo de tela de cada pessoa hoje", lambda ctx, a: _uso(ctx, 1, "Tempo de tela hoje"), papel=ADM)
_reg("uso_7d", "usotelas", "Tempo de tela de cada pessoa em 7 dias", lambda ctx, a: _uso(ctx, 7, "Tempo de tela (7 dias)"), papel=ADM)
_reg("uso_30d", "usotelas", "Tempo de tela de cada pessoa em 30 dias", lambda ctx, a: _uso(ctx, 30, "Tempo de tela (30 dias)"), papel=ADM)
_reg("uso_meu_7d", "usotelas", "Seu tempo em cada tela nos últimos 7 dias", lambda ctx, a: _uso(ctx, 7, "Seu tempo de tela (7 dias)", True))


def _uso_telas(ctx, a):
    desde = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 - 6 * 86400))
    rs = db.consultar("SELECT rota, sum(ms) AS ms, sum(visitas) AS v FROM uso_telas WHERE dia >= ? GROUP BY 1 ORDER BY 2 DESC LIMIT 15", (desde,))
    _resp(ctx, "Telas mais usadas (7 dias)", [f"• {_e(_TELAS.get(r['rota'], r['rota']))}: {_ms(r['ms'])}, {r['v']} visita(s)" for r in rs], "/configuracoes?aba=usuarios&ver=uso")


def _caminhos(ctx, a):
    desde = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 - 6 * 86400))
    rs = db.consultar("SELECT de, para, sum(n) AS n FROM uso_caminhos WHERE dia >= ? GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 12", (desde,))
    _resp(ctx, "Caminhos mais comuns (7 dias)", [f"• {_e(_TELAS.get(r['de'], r['de']))} → {_e(_TELAS.get(r['para'], r['para']))}: {r['n']}" for r in rs], "/configuracoes?aba=usuarios&ver=uso")


_reg("uso_por_tela", "usotelas", "Telas mais usadas em 7 dias", _uso_telas, papel=ADM)
_reg("uso_caminhos", "usotelas", "Caminhos mais comuns entre telas (7 dias)", _caminhos, papel=ADM)

for _rota, _nome in _TELAS.items():
    if ":" in _rota:
        continue
    def _ft(ctx, a, _rota=_rota, _nome=_nome):
        desde = time.strftime("%Y-%m-%d", time.gmtime(time.time() - 3 * 3600 - 6 * 86400))
        rs = db.consultar("SELECT COALESCE(NULLIF(u.nome, ''), u.email) AS k, sum(t.ms) AS ms, sum(t.visitas) AS v FROM uso_telas t JOIN usuarios u ON u.id = t.usuario_id "
                          "WHERE t.dia >= ? AND t.rota = ? GROUP BY 1 ORDER BY 2 DESC", (desde, _rota))
        _resp(ctx, f"{_nome}: tempo em 7 dias", [f"• <b>{_e(r['k'])}</b>: {_ms(r['ms'])}, {r['v']} visita(s)" for r in rs], _rota, "Ninguém usou esta tela em 7 dias.")
    _reg(f"tempo_{_slug(_rota)}", "tempotela", f"Tempo de cada pessoa na tela {_nome} (7 dias)", _ft, papel=ADM)


# =====================================================================================================================
# BIBLIOTECA 3D, BOTÕES, FILA, CRON, MÉTRICAS, ALERTAS, BANCO, DISPOSITIVOS
# =====================================================================================================================
def _avatares(ctx, titulo, sql, fmt):
    _resp(ctx, titulo, [fmt(r) for r in db.consultar(sql)], "/avatares", "Biblioteca vazia.")


_reg("biblioteca_total", "avatarbot", "Quantos modelos 3D há e o espaço usado",
     lambda ctx, a: _avatares(ctx, "Biblioteca 3D", "SELECT count(*) AS n, COALESCE(sum(tamanho), 0) AS t FROM avatares", lambda r: f"{r['n']} modelo(s), {num(r['t'] / 1048576, 1)} MB"))
_reg("biblioteca_especies", "avatarbot", "Modelos 3D por espécie (pessoa, carro, ar…)",
     lambda ctx, a: _avatares(ctx, "Por espécie", "SELECT COALESCE(NULLIF(especie, ''), '-') AS e, count(*) AS n FROM avatares GROUP BY 1 ORDER BY 2 DESC", lambda r: f"• {_e(r['e'])}: {r['n']}"))
_reg("biblioteca_recentes", "avatarbot", "Últimos modelos 3D importados",
     lambda ctx, a: _avatares(ctx, "Recentes", "SELECT nome, criado_em FROM avatares ORDER BY criado_em DESC LIMIT 10", lambda r: f"• {_e(r['nome'][:60])} ({quando(r['criado_em'])})"))
_reg("biblioteca_maiores", "avatarbot", "Os modelos 3D mais pesados",
     lambda ctx, a: _avatares(ctx, "Mais pesados", "SELECT nome, tamanho FROM avatares ORDER BY tamanho DESC NULLS LAST LIMIT 10", lambda r: f"• {_e(r['nome'][:50])}: {num((r['tamanho'] or 0) / 1048576, 1)} MB"))
_reg("biblioteca_licencas", "avatarbot", "Licenças dos modelos 3D",
     lambda ctx, a: _avatares(ctx, "Licenças", "SELECT COALESCE(NULLIF(licenca, ''), '-') AS l, count(*) AS n FROM avatares GROUP BY 1 ORDER BY 2 DESC", lambda r: f"• {_e(r['l'])}: {r['n']}"))


def _botoes_por_ar(ctx, a):
    rs = db.consultar("SELECT a.nome, count(c.id) AS n, count(c.id) FILTER (WHERE c.chave = 'desligar') AS d FROM aparelhos a LEFT JOIN codigos c ON c.aparelho_id = a.id GROUP BY a.id, a.nome ORDER BY a.nome")
    _resp(ctx, "Botões gravados por ar", [f"• {_e(r['nome'])}: {r['n']}" + ("" if r["d"] else " · sem Desligar") for r in rs], "/aparelhos")


def _botoes_do_ar(ctx, a):
    rs = db.consultar("SELECT chave, rotulo FROM codigos WHERE aparelho_id = ? ORDER BY chave LIMIT 40", (a["id"],))
    tot = db.um("SELECT count(*) AS n FROM codigos WHERE aparelho_id = ?", (a["id"],))["n"]
    _resp(ctx, f"Botões de {a['nome']} ({tot})", [f"• {_e(r['chave'])}" + (f" ({_e(r['rotulo'])})" if r["rotulo"] else "") for r in rs], f"/aparelhos/{a['id']}", "Nenhum botão gravado.")


_reg("botoes_por_ar", "botoes", "Quantos botões cada ar tem", _botoes_por_ar)
_reg("botoes_do_ar", "botoes", "Lista os botões gravados de um ar", _botoes_do_ar, "/botoes_do_ar NOME", arg="ar?")
_reg("botoes_sem_desligar", "botoes", "Ares sem o botão Desligar gravado",
     lambda ctx, a: _resp(ctx, "Sem o Desligar", [f"• {_e(r['nome'])}" for r in db.consultar("SELECT nome FROM aparelhos a WHERE NOT EXISTS (SELECT 1 FROM codigos c WHERE c.aparelho_id = a.id AND c.chave = 'desligar') ORDER BY nome")], "/aparelhos", "Todos têm o Desligar."))
_reg("botoes_gerados", "botoes", "Botões gerados pelo protocolo Gree, por ar",
     lambda ctx, a: _resp(ctx, "Gerados (Gree)", [f"• {_e(r['nome'])}: {r['n']}" for r in db.consultar("SELECT a.nome, count(*) AS n FROM codigos c JOIN aparelhos a ON a.id = c.aparelho_id WHERE c.rotulo ILIKE '%gerado%' GROUP BY a.nome ORDER BY a.nome")], "/aparelhos", "Nenhum botão gerado."))
_reg("botoes_extras", "botoes", "Botões extras gravados (fora de modo/temperatura)",
     lambda ctx, a: _resp(ctx, "Botões extras", [f"• {_e(r['nome'])}: {_e(r['chave'][6:])}" for r in db.consultar("SELECT a.nome, c.chave FROM codigos c JOIN aparelhos a ON a.id = c.aparelho_id WHERE c.chave LIKE 'extra_%' ORDER BY a.nome LIMIT 30")], "/aparelhos", "Nenhum extra."))


def _fila(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT tipo, estado, erro, criado_em, fim_em FROM fila_comandos WHERE true{extra} ORDER BY id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"• {quando(r['criado_em'])} {_e(r['tipo'])} · {_e(r['estado'])}" + (f" · {_e((r['erro'] or '')[:50])}" if r.get("erro") else "") for r in rs], "/infra?aba=agentes", "Fila vazia.")


_reg("fila_ultimos", "filabot", "Últimos pedidos da nuvem ao agente", lambda ctx, a: _fila(ctx, "Últimos pedidos"), papel=ADM)
_reg("fila_pendentes", "filabot", "Pedidos esperando o agente", lambda ctx, a: _fila(ctx, "Pendentes", " AND estado IN ('pendente', 'qualquer', 'executando')"), papel=ADM)
_reg("fila_falhas", "filabot", "Pedidos que falharam nas últimas 24 h", lambda ctx, a: _fila(ctx, "Falhas (24 h)", " AND estado IN ('erro', 'expirado') AND criado_em > ?", (db.agora() - 86400,)), papel=ADM)


def _fila_tipos(ctx, a):
    rs = db.consultar("SELECT tipo, count(*) AS n, avg(fim_em - criado_em) FILTER (WHERE fim_em IS NOT NULL) AS m FROM fila_comandos GROUP BY 1 ORDER BY 2 DESC")
    _resp(ctx, "Fila por tipo", [f"• {_e(r['tipo'])}: {r['n']}" + (f" · resposta média {num(r['m'] or 0, 1)} s" if r["m"] is not None else "") for r in rs], "/infra?aba=agentes")


_reg("fila_por_tipo", "filabot", "Pedidos por tipo e tempo médio de resposta", _fila_tipos, papel=ADM)


def _cron(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT job_name, description, ran_at FROM cron_log WHERE true{extra} ORDER BY id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"• {_e(str(r['ran_at'])[:16])} {_e(r['job_name'])}" + (f": {_e((r['description'] or '')[:50])}" if r.get("description") else "") for r in rs], "/supabase", "Nada registrado.")


_reg("cron_ultimas", "cronbot", "Últimas execuções das rotinas do banco", lambda ctx, a: _cron(ctx, "Últimas rotinas"), papel=ADM)
for _job, _rot in (("backup", "backup diário"), ("metricas", "métricas"), ("limpar", "limpezas"), ("alerta", "alertas"), ("saude", "saúde do banco"), ("transmissores", "transmissores offline")):
    _reg(f"cron_{_job}", "cronbot", f"Últimas execuções das rotinas de {_rot}", lambda ctx, a, _job=_job, _rot=_rot: _cron(ctx, f"Rotinas de {_rot}", " AND job_name ILIKE ?", (f"%{_job}%",)), papel=ADM)


def _metricas(ctx, dias, titulo, campo=None):
    rs = db.consultar("SELECT * FROM metricas_diarias ORDER BY dia DESC LIMIT ?", (dias,))
    if campo:
        return _resp(ctx, titulo, [f"• {r['dia']}: {r[campo]}" for r in rs], "/relatorios", "Sem métricas.")
    _resp(ctx, titulo, [f"• {r['dia']}: {r['comandos']} comando(s), {r['falhas']} falha(s), Alexa {r['pela_alexa']}, agenda {r['pela_agenda']}, painel {r['pelo_painel']}" for r in rs], "/relatorios", "Sem métricas.")


_reg("metricas_hoje", "metricas", "Métricas consolidadas de hoje", lambda ctx, a: _metricas(ctx, 1, "Hoje"))
_reg("metricas_7d", "metricas", "Métricas dos últimos 7 dias", lambda ctx, a: _metricas(ctx, 7, "Últimos 7 dias"))
_reg("metricas_30d", "metricas", "Métricas dos últimos 30 dias", lambda ctx, a: _metricas(ctx, 30, "Últimos 30 dias"))
for _c, _r in (("pela_alexa", "pela Alexa"), ("pela_agenda", "pela agenda"), ("pelo_painel", "pelo painel"), ("falhas", "que falharam"), ("aparelhos_ligados", "de ares ligados")):
    _reg(f"metricas_{_c}", "metricas", f"Comandos {_r} por dia (14 dias)" if _c != "aparelhos_ligados" else "Ares ligados por dia (14 dias)",
         lambda ctx, a, _c=_c, _r=_r: _metricas(ctx, 14, f"Por dia: {_r}", _c))


def _alertas(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT l.criado_em, l.tipo, l.mensagem, l.resolvido, a.nome FROM alertas l LEFT JOIN aparelhos a ON a.id = l.aparelho_id WHERE true{extra} ORDER BY l.id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"{'·' if r['resolvido'] else '•'} {quando(r['criado_em'])} [{_e(r['tipo'])}] {_e(r['nome'] or '')} {_e((r['mensagem'] or '')[:60])}" for r in rs], "/notificacoes", "Nenhum alerta.")


_reg("alertas_abertos", "alertasbot", "Alertas ainda não resolvidos", lambda ctx, a: _alertas(ctx, "Abertos", " AND NOT l.resolvido"))
_reg("alertas_resolvidos", "alertasbot", "Alertas resolvidos", lambda ctx, a: _alertas(ctx, "Resolvidos", " AND l.resolvido"))
_reg("alertas_7d", "alertasbot", "Alertas dos últimos 7 dias", lambda ctx, a: _alertas(ctx, "Últimos 7 dias", " AND l.criado_em > to_timestamp(?)", (db.agora() - 7 * 86400,)))
_reg("alertas_por_tipo", "alertasbot", "Alertas por tipo",
     lambda ctx, a: _resp(ctx, "Alertas por tipo", [f"• {_e(r['tipo'])}: {r['n']}" for r in db.consultar("SELECT tipo, count(*) AS n FROM alertas GROUP BY 1 ORDER BY 2 DESC")], "/notificacoes", "Nenhum alerta."))


def _saude(ctx, n, titulo):
    rs = db.consultar("SELECT * FROM saude_sistema ORDER BY medido_em DESC LIMIT ?", (n,))
    _resp(ctx, titulo, [f"• {quando(r['medido_em'])}: {num(r['tamanho_banco_mb'], 1)} MB · {r['linhas_atividade']} registros · {r['transmissores_online']} transmissor(es) online" for r in rs], "/supabase", "Sem medições.")


_reg("banco_tamanho", "banco", "Tamanho atual do banco (limite 500 MB)", lambda ctx, a: _saude(ctx, 1, "Tamanho do banco"), papel=ADM)
_reg("banco_medicoes", "banco", "Últimas medições do banco", lambda ctx, a: _saude(ctx, 8, "Medições"), papel=ADM)


def _crescimento(ctx, a):
    rs = db.consultar("SELECT medido_em, tamanho_banco_mb FROM saude_sistema ORDER BY medido_em DESC LIMIT 28")
    if len(rs) < 2:
        return ctx.enviar("Medições insuficientes.")
    dif = float(rs[0]["tamanho_banco_mb"]) - float(rs[-1]["tamanho_banco_mb"])
    dias = max(1, (rs[0]["medido_em"] - rs[-1]["medido_em"]).total_seconds() / 86400)
    _resp(ctx, "Crescimento do banco", [f"{num(dif, 1)} MB em {num(dias, 1)} dia(s) ({num(dif / dias, 2)} MB por dia)", f"Agora: {num(rs[0]['tamanho_banco_mb'], 1)} MB de 500 MB"], "/supabase")


_reg("banco_crescimento", "banco", "Quanto o banco cresce por dia", _crescimento, papel=ADM)
_reg("banco_linhas", "banco", "Registros por tabela principal",
     lambda ctx, a: _resp(ctx, "Registros", [f"• {t}: {db.um(f'SELECT count(*) AS n FROM {t}')['n']}" for t in ("atividade", "seguranca_eventos", "codigos", "notificacoes", "telegram_eventos", "analise_eventos", "cron_log")], "/supabase"), papel=ADM)


def _disp_ev(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT e.quando, e.acao, e.origem, e.ok, d.nome FROM dispositivos_eventos e JOIN dispositivos d ON d.id = e.dispositivo_id WHERE true{extra} ORDER BY e.id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"{'✓' if r['ok'] else '✗'} {quando(r['quando'])} <b>{_e(r['nome'])}</b>: {_e(r['acao'])} ({_e(r['origem'])})" for r in rs], "/luzes", "Nenhum evento.")


_reg("disp_eventos", "dispev", "Últimos eventos de luzes, persianas, cafeteira e fechadura", lambda ctx, a: _disp_ev(ctx, "Últimos eventos"))
_reg("disp_eventos_hoje", "dispev", "Eventos dos dispositivos nas últimas 24 h", lambda ctx, a: _disp_ev(ctx, "Últimas 24 h", " AND e.quando > ?", (db.agora() - 86400,)))
_reg("disp_falhas", "dispev", "Comandos de dispositivos que falharam", lambda ctx, a: _disp_ev(ctx, "Falhas", " AND e.ok = 0"))
_reg("disp_offline", "dispev", "Dispositivos offline ou sem aparelho conectado",
     lambda ctx, a: _resp(ctx, "Offline / sem aparelho", [f"• {_e(r['nome'])} ({_e(r['tipo'])})" + ("" if r["tuya_id"] or r["placa"] else " · sem aparelho") for r in db.consultar(
         "SELECT nome, tipo, tuya_id, placa FROM dispositivos WHERE COALESCE(online, 0) = 0 ORDER BY tipo, nome")], "/luzes", "Todos online."))
_reg("disp_por_tipo", "dispev", "Dispositivos cadastrados por tipo",
     lambda ctx, a: _resp(ctx, "Dispositivos por tipo", [f"• {_e(r['tipo'])}: {r['n']} ({r['ligados']} online)" for r in db.consultar(
         "SELECT tipo, count(*) AS n, count(*) FILTER (WHERE online = 1) AS ligados FROM dispositivos GROUP BY 1 ORDER BY 1")], "/luzes"))
_reg("disp_placas", "dispev", "Dispositivos ligados a uma placa própria (Arduino/ESP)",
     lambda ctx, a: _resp(ctx, "Placas próprias", [f"• {_e(r['nome'])}: {_e(r['placa'])} · último contato {quando(r['ultimo_contato'])}" for r in db.consultar(
         "SELECT nome, placa, ultimo_contato FROM dispositivos WHERE COALESCE(placa, '') <> '' ORDER BY nome")], "/cafeteira", "Nenhuma placa configurada."))


# =====================================================================================================================
# COOKIES, TERMOS, TREINAMENTO
# =====================================================================================================================
def _cookies(ctx, acao, rot):
    n = db.um("SELECT count(*) AS n FROM site_consentimentos WHERE quando > ? AND acao ILIKE ?", (db.agora() - 30 * 86400, f"%{acao}%"))["n"]
    _resp(ctx, f"Consentimentos {rot} (30 dias)", [f"{n} registro(s)"], "/analise")


_reg("cookies_aceitos", "cookies", "Quem aceitou os cookies do site (30 dias)", lambda ctx, a: _cookies(ctx, "aceit", "aceitos"), papel=ADM)
_reg("cookies_recusados", "cookies", "Quem recusou os cookies do site (30 dias)", lambda ctx, a: _cookies(ctx, "recus", "recusados"), papel=ADM)
_reg("cookies_por_acao", "cookies", "Consentimentos por ação",
     lambda ctx, a: _resp(ctx, "Consentimentos por ação", [f"• {_e(r['acao'])}: {r['n']}" for r in db.consultar("SELECT acao, count(*) AS n FROM site_consentimentos GROUP BY 1 ORDER BY 2 DESC")], "/analise"), papel=ADM)
_reg("cookies_por_pais", "cookies", "Consentimentos por país",
     lambda ctx, a: _resp(ctx, "Consentimentos por país", [f"• {_e(r['pais'] or '?')}: {r['n']}" for r in db.consultar("SELECT pais, count(*) AS n FROM site_consentimentos GROUP BY 1 ORDER BY 2 DESC LIMIT 12")], "/analise"), papel=ADM)
_reg("termos_aceites", "termos", "Quem aceitou os termos e quando",
     lambda ctx, a: _resp(ctx, "Termos aceitos", [f"• <b>{_e(r['nome'] or r['email'])}</b>: {_e(r['documento'])} v{_e(r['versao'])} em {quando(r['aceito_em'])}" for r in db.consultar(
         "SELECT u.nome, u.email, t.documento, t.versao, t.aceito_em FROM aceites t JOIN usuarios u ON u.id::text = t.usuario_id::text ORDER BY t.aceito_em DESC LIMIT 20")], "/seguranca?aba=acessos", "Ninguém aceitou ainda."), papel=ADM)
_reg("termos_faltam", "termos", "Quem ainda não aceitou os termos",
     lambda ctx, a: _resp(ctx, "Ainda não aceitaram", [f"• {_e(r['nome'] or r['email'])}" for r in db.consultar(
         "SELECT nome, email FROM usuarios u WHERE ativo AND NOT EXISTS (SELECT 1 FROM aceites t WHERE t.usuario_id::text = u.id::text) ORDER BY nome")], "/seguranca?aba=acessos", "Todos aceitaram."), papel=ADM)
_reg("termos_meu", "termos", "Os termos que você aceitou",
     lambda ctx, a: _resp(ctx, "Seus aceites", [f"• {_e(r['documento'])} v{_e(r['versao'])} em {quando(r['aceito_em'])}" for r in db.consultar(
         "SELECT documento, versao, aceito_em FROM aceites WHERE usuario_id::text = ? ORDER BY aceito_em DESC", (str(ctx.u["id"]),))], None, "Você ainda não aceitou nenhum termo."))
_reg("treino_notas", "treino", "Notas do treinamento de cada pessoa",
     lambda ctx, a: _resp(ctx, "Notas do treinamento", [f"• <b>{_e(r['nome'] or r['email'])}</b>: {num(r['nota'], 0)}" + (" · aprovado" if r["aprovado"] else "") + f" ({quando(r['concluido_em'])})" for r in db.consultar(
         "SELECT u.nome, u.email, t.nota, t.aprovado, t.concluido_em FROM treinamentos t JOIN usuarios u ON u.id::text = t.usuario_id::text ORDER BY t.concluido_em DESC LIMIT 20")], "/seguranca?aba=treinamento", "Ninguém fez a prova ainda."), papel=ADM)
_reg("treino_faltam", "treino", "Quem ainda não fez o treinamento",
     lambda ctx, a: _resp(ctx, "Sem treinamento", [f"• {_e(r['nome'] or r['email'])}" for r in db.consultar(
         "SELECT nome, email FROM usuarios u WHERE ativo AND NOT EXISTS (SELECT 1 FROM treinamentos t WHERE t.usuario_id::text = u.id::text) ORDER BY nome")], "/seguranca?aba=treinamento", "Todos fizeram."), papel=ADM)
_reg("treino_meu", "treino", "Suas provas do treinamento",
     lambda ctx, a: _resp(ctx, "Suas provas", [f"• nota {num(r['nota'], 0)}" + (" · aprovado" if r["aprovado"] else "") + f" ({quando(r['concluido_em'])})" for r in db.consultar(
         "SELECT nota, aprovado, concluido_em FROM treinamentos WHERE usuario_id::text = ? ORDER BY concluido_em DESC", (str(ctx.u["id"]),))], "/seguranca?aba=treinamento", "Você ainda não fez a prova."))


# =====================================================================================================================
# CONVERSÕES
# =====================================================================================================================
def _conv(fn, uso, unidade_ok):
    def f(ctx, a, resto=""):
        v = _num_arg(a, resto)
        if v is None:
            return ctx.enviar(f"Use {uso}")
        ctx.enviar(unidade_ok(v), MENU)
    return f


def _tarifa() -> float:
    return float(db.cfg("tarifa_kwh", 0.85) or 0.85)


_CONV = (("c_para_f", "Converte °C em °F", "/c_para_f 23", lambda v: f"{num(v, 1)} °C = <b>{num(v * 9 / 5 + 32, 1)} °F</b>"),
         ("f_para_c", "Converte °F em °C", "/f_para_c 75", lambda v: f"{num(v, 1)} °F = <b>{num((v - 32) * 5 / 9, 1)} °C</b>"),
         ("btu_para_kw", "Converte BTU/h em kW de refrigeração", "/btu_para_kw 12000", lambda v: f"{num(v, 0)} BTU/h = <b>{num(v * 0.000293071, 2)} kW</b>"),
         ("kw_para_btu", "Converte kW de refrigeração em BTU/h", "/kw_para_btu 3.5", lambda v: f"{num(v, 2)} kW = <b>{num(v / 0.000293071, 0)} BTU/h</b>"),
         ("tr_para_btu", "Converte toneladas de refrigeração (TR) em BTU/h", "/tr_para_btu 2", lambda v: f"{num(v, 1)} TR = <b>{num(v * 12000, 0)} BTU/h</b>"),
         ("w_para_kwh_dia", "Consumo de um aparelho de N watts em 8 h por dia", "/w_para_kwh_dia 1200",
          lambda v: f"{num(v, 0)} W × 8 h = <b>{num(v * 8 / 1000, 2)} kWh por dia</b>, {num(v * 8 * 22 / 1000, 1)} kWh em 22 dias úteis"),
         ("kwh_para_reais", "Quanto custam N kWh na tarifa cadastrada", "/kwh_para_reais 150", lambda v: f"{num(v, 1)} kWh × {brl(_tarifa())} = <b>{brl(v * _tarifa())}</b>"),
         ("reais_para_kwh", "Quantos kWh cabem em N reais na tarifa cadastrada", "/reais_para_kwh 100", lambda v: f"{brl(v)} ÷ {brl(_tarifa())} = <b>{num(v / _tarifa(), 1)} kWh</b>"),
         ("min_para_horas", "Converte minutos em horas e minutos", "/min_para_horas 135", lambda v: f"{num(v, 0)} min = <b>{tempo(v * 60)}</b>"))
for _n, _d, _u, _f in _CONV:
    _reg(_n, "conversoes", _d, _conv(_n, _u, _f), _u, arg="texto")

# =====================================================================================================================
# GLOSSÁRIO E GUIA
# =====================================================================================================================
_GLOSSARIO = (
    ("agente", "Agente", "O programa do sistema rodando num computador do escritório. É ele que fala com os transmissores pela rede local."),
    ("principal", "Principal e reserva", "Só um agente executa os comandos (o principal). Os outros ficam de reserva e assumem em até 45 s se o principal sumir."),
    ("preferido", "Preferido", "O computador que deve ficar no comando quando está online e enxergando os transmissores."),
    ("enxergar", "Enxergar", "O agente alcança o transmissor na rede (porta 6668). Sem isso, nenhum comando chega ao ar."),
    ("nuvem", "Nuvem", "O mesmo sistema rodando na Vercel. Ela não alcança a rede do escritório e pede ao agente pela fila."),
    ("fila", "Fila", "Onde a nuvem deixa os pedidos (ligar, gravar botão, infra) para o agente executar e responder."),
    ("transmissor", "Transmissor", "O Smart IR SRW-004 (Tuya) que manda o sinal infravermelho para o ar. Um no teto atende até uns 4 ares à vista."),
    ("botao", "Botão gravado", "O sinal infravermelho de um botão do controle original, guardado para o sistema reenviar."),
    ("gree", "Gree", "Protocolo do controle Gree: com o Desligar gravado, o sistema gera os 300 ajustes sozinho."),
    ("zona", "Zona", "Ares iguais à vista do mesmo transmissor obedecem ao mesmo sinal. O grupo é uma zona: um comando muda todos."),
    ("interferencia", "Teste de interferência", "Manda o sinal de um ar por vez; quem está no salão marca quem apitou. O resultado vira as zonas reais."),
    ("portao", "Portão", "A página de verificação de segurança antes do sistema (Turnstile), que barra robôs."),
    ("convite", "Código de instalação", "Código de uso único (30 min) que leva a configuração cifrada para instalar o agente num computador novo."),
    ("novidades", "Novidades", "O que mudou em cada versão. Aparece uma vez para cada pessoa na janela O que há de novo."),
    ("sinric", "Sinric Pro", "A ponte entre o sistema e a Alexa/Google Home. Cada ar na Alexa é um dispositivo no Sinric."),
    ("selo", "Selo de integridade", "Um resumo SHA-256 de cada dia da Atividade e dos eventos de segurança, encadeado: mudar um registro quebra a cadeia."),
)
for _k, _t, _txt in _GLOSSARIO:
    _reg(f"o_que_e_{_k}", "glossario", f"O que é: {_t}", lambda ctx, a, _t=_t, _txt=_txt: ctx.enviar(f"<b>{_e(_t)}</b>\n{_e(_txt)}", MENU))

_GUIA = (("como-funciona", "Como o sistema funciona"), ("antes", "Antes de começar"), ("smart-life", "App Smart Life: transmissor no Wi-Fi"),
         ("conta-tuya", "Ligar a conta Smart Life ao sistema"), ("transmissores", "Trazer os transmissores"), ("aparelhos", "Cadastrar o ar-condicionado"),
         ("botoes", "Gravar os botões do controle"), ("remoto", "Usar no dia a dia e desligar de longe"), ("windows", "Agente em outro computador"),
         ("varios-ares", "Um transmissor para vários ares"), ("sala-transmissor", "Um transmissor por sala"), ("sinric", "Sinric Pro: a ponte para a Alexa"),
         ("alexa", "Colocar na Alexa"), ("outra-alexa", "Integrar outra Alexa"), ("voz", "Comandos de voz e rotinas da Alexa"), ("google", "Google Home"),
         ("mapa", "Mapa do escritório"), ("musica", "Música com Spotify"), ("dominio", "Domínio e e-mails"), ("site", "Site: idiomas, acessos, SEO e newsletter"),
         ("luzes", "Iluminação"), ("notificacoes", "Notificações e relatórios por e-mail"), ("raspberry", "Raspberry Pi: agente ligado 24 horas"),
         ("telegram", "Bot do Telegram"), ("bugs", "Bugs: relatar e corrigir com IA"), ("tarefas", "Tarefas da equipe"), ("ia", "Agente de IA no terminal"),
         ("seg-relatorio", "Relatórios oficiais e por e-mail"), ("uso", "Usuários e uso do sistema"), ("placa", "Placa própria (Arduino ou ESP)"),
         ("dono", "Transferir o posto de dono"), ("avatares", "Avatares 3D e Blender"), ("problemas", "Quando algo não funciona"))
for _id, _t in _GUIA:
    _reg(f"guia_{_id.replace('-', '_')}", "guiabot", f"Guia: {_t}", lambda ctx, a, _id=_id, _t=_t: ctx.enviar(f"<b>Guia: {_e(_t)}</b>", _link("Abrir o capítulo", f"/guia#{_id}")))


# =====================================================================================================================
# LOGS DO TELEGRAM
# =====================================================================================================================
def _tg(ctx, titulo, extra="", params=()):
    rs = db.consultar(f"SELECT quando, usuario_nome, username, tipo, texto, ok FROM telegram_eventos WHERE true{extra} ORDER BY id DESC LIMIT 15", params)
    _resp(ctx, titulo, [f"{'✓' if r['ok'] else '✗'} {quando(r['quando'])} <b>{_e(r['usuario_nome'] or r['username'] or '?')}</b> [{_e(r['tipo'])}] {_e((r['texto'] or '')[:50])}" for r in rs],
          "/telegram?aba=logs", "Nada registrado.")


_reg("tg_meu_uso", "tglogs", "Suas últimas interações com o bot", lambda ctx, a: _tg(ctx, "Seu uso do bot", " AND usuario_id::text = ?", (str(ctx.u["id"]),)))
_reg("tg_uso_24h", "tglogs", "Interações com o bot nas últimas 24 h", lambda ctx, a: _tg(ctx, "Últimas 24 h", " AND quando > ?", (db.agora() - 86400,)), papel=ADM)
_reg("tg_erros_24h", "tglogs", "Erros do bot nas últimas 24 h", lambda ctx, a: _tg(ctx, "Erros (24 h)", " AND tipo = 'erro' AND quando > ?", (db.agora() - 86400,)), papel=ADM)
_reg("tg_erros_7d", "tglogs", "Erros do bot em 7 dias", lambda ctx, a: _tg(ctx, "Erros (7 dias)", " AND tipo = 'erro' AND quando > ?", (db.agora() - 7 * 86400,)), papel=ADM)
_reg("tg_negados", "tglogs", "Tentativas negadas (sem vínculo, PIN errado, bloqueios)", lambda ctx, a: _tg(ctx, "Negados", " AND NOT ok AND tipo <> 'erro'"), papel=ADM)


def _tg_por(ctx, a, dias=7):
    rs = db.consultar("SELECT COALESCE(NULLIF(usuario_nome, ''), NULLIF(username, ''), chat) AS k, count(*) AS n, count(*) FILTER (WHERE tipo = 'erro') AS e FROM telegram_eventos "
                      "WHERE quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 12", (db.agora() - dias * 86400,))
    _resp(ctx, f"Uso do bot por pessoa ({dias} dias)", [f"• <b>{_e(r['k'])}</b>: {r['n']}" + (f" ({r['e']} erro(s))" if r["e"] else "") for r in rs], "/telegram?aba=logs")


def _tg_top(ctx, a):
    rs = db.consultar("SELECT split_part(texto, ' ', 1) AS c, count(*) AS n FROM telegram_eventos WHERE tipo = 'comando' AND quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 15", (db.agora() - 30 * 86400,))
    _resp(ctx, "Comandos mais usados (30 dias)", [f"• {_e(r['c'])}: {r['n']}" for r in rs], "/telegram?aba=logs")


def _tg_lentos(ctx, a):
    rs = db.consultar("SELECT texto, ms, quando FROM telegram_eventos WHERE ms IS NOT NULL AND quando > ? ORDER BY ms DESC LIMIT 10", (db.agora() - 7 * 86400,))
    _resp(ctx, "Respostas mais lentas (7 dias)", [f"• {num((r['ms'] or 0) / 1000, 1)} s {_e((r['texto'] or '')[:50])} ({quando(r['quando'])})" for r in rs], "/telegram?aba=logs", "Sem medições.")


_reg("tg_por_pessoa", "tglogs", "Uso do bot por pessoa (7 dias)", _tg_por, papel=ADM)
_reg("tg_top_comandos", "tglogs", "Comandos mais usados no bot (30 dias)", _tg_top, papel=ADM)
_reg("tg_lentos", "tglogs", "Respostas mais lentas do bot (7 dias)", _tg_lentos, papel=ADM)


# =====================================================================================================================
# ALEXA, HORÁRIOS, TEMPERATURAS, MODOS
# =====================================================================================================================
def _lista_ares(ctx, titulo, extra="", fmt=None, vazio="Nenhum."):
    lst = ares(extra)
    fmt = fmt or (lambda x: f"• {_e(x['nome'])}" + (f" ({_e(x['sala'])})" if x.get("sala") else ""))
    _resp(ctx, titulo, [fmt(x) for x in lst], "/aparelhos", vazio)


_reg("alexa_ares", "alexabot", "Ares disponíveis na Alexa", lambda ctx, a: _lista_ares(ctx, "Na Alexa", " AND a.alexa = 1"))
_reg("alexa_fora", "alexabot", "Ares que não estão na Alexa", lambda ctx, a: _lista_ares(ctx, "Fora da Alexa", " AND COALESCE(a.alexa, 0) = 0", vazio="Todos estão na Alexa."))
_reg("alexa_sem_dispositivo", "alexabot", "Ares marcados para a Alexa sem dispositivo no Sinric",
     lambda ctx, a: _lista_ares(ctx, "Sem dispositivo no Sinric", " AND a.alexa = 1 AND COALESCE(a.sinric_device_id, '') = ''", vazio="Todos têm dispositivo."))


def _hoje_ini():
    return int(datetime.datetime.now(BRT).replace(hour=0, minute=0, second=0, microsecond=0).timestamp())


def _primeiro(ctx, padrao, titulo, ordem):
    r = db.um(f"SELECT t.quando, t.usuario, t.origem, a.nome FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id WHERE t.quando > ? AND t.ok = 1 AND t.acao ILIKE ? ORDER BY t.id {ordem} LIMIT 1",  # nosec B608
              (_hoje_ini(), padrao))
    _resp(ctx, titulo, [f"{quando(r['quando'])}: <b>{_e(r['nome'])}</b> por {_e(r['usuario'] or r['origem'])}"] if r else [], "/atividade", "Ainda não aconteceu hoje.")


_reg("primeiro_ligar_hoje", "horasuso", "Qual ar foi ligado primeiro hoje e por quem", lambda ctx, a: _primeiro(ctx, "Ligar%", "Primeiro a ligar hoje", "ASC"))
_reg("ultimo_ligar_hoje", "horasuso", "O último ar ligado hoje", lambda ctx, a: _primeiro(ctx, "Ligar%", "Último a ligar hoje", "DESC"))
_reg("primeiro_desligar_hoje", "horasuso", "O primeiro ar desligado hoje", lambda ctx, a: _primeiro(ctx, "Desligar%", "Primeiro a desligar hoje", "ASC"))
_reg("ultimo_desligar_hoje", "horasuso", "O último ar desligado hoje", lambda ctx, a: _primeiro(ctx, "Desligar%", "Último a desligar hoje", "DESC"))
_reg("ligado_ha_mais_tempo", "horasuso", "Os ares ligados há mais tempo agora",
     lambda ctx, a: _resp(ctx, "Ligados há mais tempo", [f"• {_e(x['nome'])}: {tempo(time.time() - x['ligado_desde'])}" for x in sorted(ares(" AND a.ligado = 1 AND a.ligado_desde IS NOT NULL"), key=lambda x: x["ligado_desde"])], "/aparelhos", "Nenhum ar ligado."))


def _temps(ctx, a):
    lst = ares(" AND a.ligado = 1")
    if not lst:
        return ctx.enviar("Nenhum ar ligado agora.")
    ts = [x["temperatura"] for x in lst if x["temperatura"]]
    _resp(ctx, "Temperatura dos ares ligados", [f"Média: {num(sum(ts) / len(ts), 1)}°", f"Mais baixa: {min(ts)}° · mais alta: {max(ts)}°"] + [f"• {_e(x['nome'])}: {x['temperatura']}°" for x in lst], "/aparelhos")


_reg("temp_media", "temps", "Média, mínima e máxima dos ares ligados", _temps)
_reg("temp_abaixo_22", "temps", "Ares ligados abaixo de 22°", lambda ctx, a: _lista_ares(ctx, "Abaixo de 22°", " AND a.ligado = 1 AND a.temperatura < 22", lambda x: f"• {_e(x['nome'])}: {x['temperatura']}°", "Nenhum."))
_reg("temp_acima_25", "temps", "Ares ligados acima de 25°", lambda ctx, a: _lista_ares(ctx, "Acima de 25°", " AND a.ligado = 1 AND a.temperatura > 25", lambda x: f"• {_e(x['nome'])}: {x['temperatura']}°", "Nenhum."))
_reg("temp_por_sala", "temps", "Temperatura dos ares ligados por sala",
     lambda ctx, a: _resp(ctx, "Por sala", [f"• {_e(x['sala'] or 'Sem sala')}: {_e(x['nome'])} {x['temperatura']}°" for x in sorted(ares(" AND a.ligado = 1"), key=lambda x: x["sala"] or "")], "/projetos", "Nenhum ar ligado."))
for _m, _r in (("frio", "frio"), ("quente", "quente"), ("ventilar", "só ventilar"), ("seco", "desumidificar"), ("auto", "automático")):
    _reg(f"ares_modo_{_m}", "modosar", f"Ares no modo {_r}", lambda ctx, a, _m=_m, _r=_r: _lista_ares(ctx, f"Modo {_r}", f" AND a.modo = '{_m}'",
                                                                                               lambda x: f"• {_e(x['nome'])}: {'ligado' if x['ligado'] else 'desligado'} {x['temperatura']}°", "Nenhum ar nesse modo."))
_reg("faixas_temp", "faixas", "Faixa de temperatura aceita por cada ar",
     lambda ctx, a: _lista_ares(ctx, "Faixas", "", lambda x: f"• {_e(x['nome'])}: {x['temp_min']}° a {x['temp_max']}°"))


# =====================================================================================================================
# TRANSMISSORES, SALAS, USUÁRIOS
# =====================================================================================================================
def _hubs(ctx, titulo, fmt):
    _resp(ctx, titulo, [fmt(r) for r in db.consultar("SELECT h.*, p.nome AS sala FROM hubs h LEFT JOIN projetos p ON p.id = h.projeto_id ORDER BY h.nome")], "/transmissores", "Nenhum transmissor.")


_reg("trans_ips", "transbot", "IP de cada transmissor na rede", lambda ctx, a: _hubs(ctx, "IPs", lambda r: f"• {_e(r['nome'])}: {_e(r['ip'] or '?')}"), papel=ADM)
_reg("trans_protocolo", "transbot", "Protocolo Tuya de cada transmissor", lambda ctx, a: _hubs(ctx, "Protocolo", lambda r: f"• {_e(r['nome'])}: {_e(r['versao'] or '?')}"))
_reg("trans_problemas", "transbot", "Problemas registrados nos transmissores", lambda ctx, a: _hubs(ctx, "Problemas", lambda r: f"• {_e(r['nome'])}: {_e(r['problema'] or 'nenhum')}"))
_reg("trans_reparos", "transbot", "Último autorreparo de cada transmissor", lambda ctx, a: _hubs(ctx, "Reparos", lambda r: f"• {_e(r['nome'])}: {quando(r['reparado_em'])}"))
_reg("trans_salas", "transbot", "Sala de cada transmissor e quando foi visto", lambda ctx, a: _hubs(ctx, "Salas", lambda r: f"• {_e(r['nome'])}: {_e(r['sala'] or 'sem sala')} · visto {quando(r['visto_em'])}"))


def _salas_det(ctx, titulo, fmt):
    rs = db.consultar("SELECT p.*, (SELECT count(*) FROM aparelhos a WHERE a.projeto_id = p.id) AS ares FROM projetos p ORDER BY p.nome")
    _resp(ctx, titulo, [fmt(r) for r in rs], "/projetos", "Nenhuma sala.")


_reg("salas_metas", "salasbot", "Meta de gasto por mês de cada sala", lambda ctx, a: _salas_det(ctx, "Metas", lambda r: f"• {_e(r['nome'])}: {brl(r['meta_custo_mes']) if r['meta_custo_mes'] else 'sem meta'}"))
_reg("salas_responsaveis", "salasbot", "Responsável de cada sala", lambda ctx, a: _salas_det(ctx, "Responsáveis", lambda r: f"• {_e(r['nome'])}: {_e(r['responsavel'] or '-')}"))
_reg("salas_tipos", "salasbot", "Tipo de cada sala", lambda ctx, a: _salas_det(ctx, "Tipos", lambda r: f"• {_e(r['nome'])}: {_e(r['tipo'] or '-')}"))
_reg("salas_qtd_ares", "salasbot", "Quantos ares cada sala tem", lambda ctx, a: _salas_det(ctx, "Ares por sala", lambda r: f"• {_e(r['nome'])}: {r['ares']}"))
_reg("salas_sem_ar", "salasbot", "Salas sem nenhum ar cadastrado",
     lambda ctx, a: _resp(ctx, "Salas sem ar", [f"• {_e(r['nome'])}" for r in db.consultar("SELECT nome FROM projetos p WHERE NOT EXISTS (SELECT 1 FROM aparelhos a WHERE a.projeto_id = p.id) ORDER BY nome")], "/projetos", "Todas têm ar."))


def _usuarios(ctx, titulo, extra="", params=(), fmt=None):
    rs = db.consultar(f"SELECT nome, email, papel, cargo, ativo, ultimo_acesso, exige_troca_senha FROM usuarios WHERE true{extra} ORDER BY nome", params)
    fmt = fmt or (lambda r: f"• <b>{_e(r['nome'] or r['email'])}</b> · {_e(r['papel'])}" + (f" · {_e(r['cargo'])}" if r["cargo"] else ""))
    _resp(ctx, titulo, [fmt(r) for r in rs], "/configuracoes?aba=usuarios", "Ninguém.")


_reg("usuarios_lista", "usuariosbot", "Todos os usuários e papéis", lambda ctx, a: _usuarios(ctx, "Usuários"), papel=ADM)
_reg("usuarios_inativos", "usuariosbot", "Usuários desativados", lambda ctx, a: _usuarios(ctx, "Desativados", " AND NOT ativo"), papel=ADM)
_reg("usuarios_ultimos_acessos", "usuariosbot", "Último acesso de cada pessoa",
     lambda ctx, a: _usuarios(ctx, "Últimos acessos", fmt=lambda r: f"• <b>{_e(r['nome'] or r['email'])}</b>: {quando(r['ultimo_acesso'])}"), papel=ADM)
_reg("usuarios_sem_acesso_7d", "usuariosbot", "Quem não entra há mais de 7 dias",
     lambda ctx, a: _usuarios(ctx, "Sem entrar há 7 dias", " AND ativo AND COALESCE(ultimo_acesso, 0) < ?", (db.agora() - 7 * 86400,), lambda r: f"• {_e(r['nome'] or r['email'])}: {quando(r['ultimo_acesso'])}"), papel=ADM)
_reg("usuarios_troca_senha", "usuariosbot", "Quem precisa trocar a senha no próximo acesso", lambda ctx, a: _usuarios(ctx, "Troca de senha pendente", " AND exige_troca_senha"), papel=ADM)
_reg("usuarios_por_papel", "usuariosbot", "Quantas pessoas há em cada papel",
     lambda ctx, a: _resp(ctx, "Por papel", [f"• {_e(r['papel'])}: {r['n']}" for r in db.consultar("SELECT papel, count(*) AS n FROM usuarios WHERE ativo GROUP BY 1 ORDER BY 2 DESC")], "/configuracoes?aba=usuarios"), papel=ADM)

# =====================================================================================================================
# AGENDA, CENAS, AUTOMAÇÕES, TEMPORIZADORES (listas)
# =====================================================================================================================
_DS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]


def _agend(ctx, titulo, extra=""):
    rs = db.consultar(f"SELECT g.nome, g.dias, g.hora, g.acao, g.ativo, g.ultima_exec, a.nome AS ar FROM agendamentos g LEFT JOIN aparelhos a ON a.id = g.aparelho_id WHERE true{extra} ORDER BY g.hora")
    _resp(ctx, titulo, [f"• {_e(r['hora'])} {_e(r['nome'] or r['ar'] or '')} · {_e(str(r['dias'])[:30])}" + ("" if r["ativo"] else " · pausado") + (f" · última {quando(r['ultima_exec'])}" if r.get("ultima_exec") else "") for r in rs],
          "/agendamentos", "Nenhum agendamento.")


_reg("agend_ativos", "agendabot", "Agendamentos ativos", lambda ctx, a: _agend(ctx, "Ativos", " AND g.ativo = 1"))
_reg("agend_pausados", "agendabot", "Agendamentos pausados", lambda ctx, a: _agend(ctx, "Pausados", " AND g.ativo = 0"))
_reg("agend_todos", "agendabot", "Todos os agendamentos", lambda ctx, a: _agend(ctx, "Todos"))
_reg("cenas_lista", "cenasbot", "Todas as cenas e quando rodaram",
     lambda ctx, a: _resp(ctx, "Cenas", [f"• {_e(r['nome'])} · última {quando(r['executada_em'])}" for r in db.consultar("SELECT nome, executada_em FROM cenas ORDER BY nome")], "/cenas", "Nenhuma cena."))
_reg("cenas_nunca_usadas", "cenasbot", "Cenas que nunca rodaram",
     lambda ctx, a: _resp(ctx, "Nunca usadas", [f"• {_e(r['nome'])}" for r in db.consultar("SELECT nome FROM cenas WHERE executada_em IS NULL ORDER BY nome")], "/cenas", "Todas já rodaram."))
_reg("autos_ativas", "autosbot", "Automações ativas",
     lambda ctx, a: _resp(ctx, "Ativas", [f"• {_e(r['nome'])}: {r['disparos'] or 0} disparo(s)" for r in db.consultar("SELECT nome, disparos FROM automacoes WHERE ativo = 1 ORDER BY nome")], "/automacoes", "Nenhuma ativa."))
_reg("autos_pausadas", "autosbot", "Automações pausadas",
     lambda ctx, a: _resp(ctx, "Pausadas", [f"• {_e(r['nome'])}" for r in db.consultar("SELECT nome FROM automacoes WHERE ativo = 0 ORDER BY nome")], "/automacoes", "Nenhuma pausada."))
_reg("autos_mais_disparos", "autosbot", "Automações que mais dispararam",
     lambda ctx, a: _resp(ctx, "Mais disparos", [f"• {_e(r['nome'])}: {r['disparos'] or 0} · último {quando(r['ultimo_disparo'])}" for r in db.consultar("SELECT nome, disparos, ultimo_disparo FROM automacoes ORDER BY disparos DESC NULLS LAST LIMIT 10")], "/automacoes", "Nenhuma automação."))
_reg("timers_pendentes", "timersbot", "Temporizadores esperando a hora",
     lambda ctx, a: _resp(ctx, "Temporizadores", [f"• {_e(r['nome'])}: {_e(r['acao'])} às {quando(r['executar_em'])}" for r in db.consultar(
         "SELECT a.nome, t.acao, t.executar_em FROM temporizadores t JOIN aparelhos a ON a.id = t.aparelho_id ORDER BY t.executar_em")], "/aparelhos", "Nenhum temporizador."))
_reg("timer_proximo", "timersbot", "O próximo temporizador a disparar",
     lambda ctx, a: _resp(ctx, "Próximo", [f"{_e(r['nome'])}: {_e(r['acao'])} às {quando(r['executar_em'])}" for r in db.consultar(
         "SELECT a.nome, t.acao, t.executar_em FROM temporizadores t JOIN aparelhos a ON a.id = t.aparelho_id ORDER BY t.executar_em LIMIT 1")], "/aparelhos", "Nenhum temporizador."))


# =====================================================================================================================
# VERSÕES, INTEGRIDADE, FERIADOS, DATAS
# =====================================================================================================================
def _novidades():
    import json
    from pathlib import Path
    return json.loads((Path(__file__).parent / "novidades.json").read_text("utf-8"))["versoes"]


_reg("versao_atual", "versoesar", "Versão do sistema no ar agora",
     lambda ctx, a: (lambda v: _resp(ctx, f"Versão {v['versao']}", [f"{_e(v['titulo'])} ({v['data']})"], "/novidades"))(_novidades()[0]))
_reg("versoes_ultimas", "versoesar", "As últimas 8 versões publicadas",
     lambda ctx, a: _resp(ctx, "Últimas versões", [f"• <b>{v['versao']}</b> {v['data']}: {_e(v['titulo'][:70])}" for v in _novidades()[:8]], "/novidades"))
_reg("versao_apps", "versoesar", "Versão atual dos apps (Android, iPhone e computador)",
     lambda ctx, a: (lambda j: _resp(ctx, "Apps", [f"Versão {_e(j.get('versao'))}"], "/apps"))(__import__("json").loads((__import__("pathlib").Path(__file__).parent / "versao_apps.json").read_text("utf-8"))))
_reg("versoes_no_ar", "versoesar", "Quando cada versão entrou no ar",
     lambda ctx, a: _resp(ctx, "Versões no ar", [f"• {k}: {quando(v)}" for k, v in sorted(((db.cfg('versoes_no_ar') or {}).items()), key=lambda kv: -float(kv[1] or 0))[:10]], "/novidades", "Sem registro."))


def _selos(ctx, a, n=7):
    selos = (db.cfg("integridade_selos") or [])[-n:]
    _resp(ctx, "Selos de integridade", [f"• {time.strftime('%d/%m', time.gmtime(s['dia']))}: {s['n_atividade']} registro(s), {s['n_eventos']} evento(s) · {s['selo'][:12]}…" for s in reversed(selos)],
          "/seguranca?aba=integridade", "Nenhum selo ainda.")


def _verificar(ctx, a):
    from . import conformidade
    r = conformidade.verificar(30)
    _resp(ctx, "Conferência da integridade (30 dias)", [("Tudo íntegro." if r["ok"] else f"{len(r['problemas'])} problema(s)"), f"Selos: {r['selos']} · conferidos: {r['conferidos']}"]
          + [f"• {time.strftime('%d/%m', time.gmtime(p['dia']))}: {_e(p['motivo'])}" for p in r["problemas"][:8]], "/seguranca?aba=integridade")


_reg("integridade_selos", "integridade", "Os selos dos últimos 7 dias", _selos, papel=ADM)
_reg("integridade_conferir", "integridade", "Confere agora se algum registro foi alterado (30 dias)", _verificar, papel=ADM)


def _feriados(ctx, a, dias=120):
    from . import feriados
    _resp(ctx, "Próximos feriados", [f"• {f['data'][8:]}/{f['data'][5:7]}: {_e(f['nome'])}" for f in feriados.proximos(dias)[:12]], "/agendamentos", "Nenhum feriado no período.")


def _hoje_feriado(ctx, a):
    from . import feriados
    hoje = datetime.datetime.now(BRT).date().isoformat()
    f = next((x for x in feriados.proximos(1) if x["data"] == hoje), None)
    ctx.enviar(f"Hoje é feriado: <b>{_e(f['nome'])}</b>. A agenda pode pular os horários." if f else "Hoje não é feriado.", MENU)


_reg("feriados_proximos", "feriadosbot", "Próximos feriados (nacionais e de Florianópolis)", _feriados)
_reg("feriados_ano", "feriadosbot", "Todos os feriados deste ano",
     lambda ctx, a: _resp(ctx, "Feriados do ano", [f"• {f['data'][8:]}/{f['data'][5:7]}: {_e(f['nome'])}" for f in __import__("app.feriados", fromlist=["do_ano"]).do_ano(datetime.date.today().year)], "/agendamentos"))
_reg("hoje_e_feriado", "feriadosbot", "Diz se hoje é feriado", _hoje_feriado)


def _uteis(ano, mes):
    from . import feriados
    fer = {f["data"] for f in feriados.do_ano(ano)}
    d, n = datetime.date(ano, mes, 1), 0
    while d.month == mes:
        if d.weekday() < 5 and d.isoformat() not in fer:
            n += 1
        d += datetime.timedelta(days=1)
    return n


_reg("hora_brasilia", "datas", "Data e hora de Brasília agora", lambda ctx, a: ctx.enviar(datetime.datetime.now(BRT).strftime("<b>%d/%m/%Y %H:%M</b> (Brasília)"), MENU))
_reg("semana_do_ano", "datas", "Número da semana do ano", lambda ctx, a: ctx.enviar(f"Semana <b>{datetime.datetime.now(BRT).isocalendar()[1]}</b> de {datetime.datetime.now(BRT).year}.", MENU))
_reg("dias_uteis_mes", "datas", "Dias úteis deste mês (sem feriados)", lambda ctx, a: (lambda h: ctx.enviar(f"<b>{_uteis(h.year, h.month)}</b> dias úteis em {h.strftime('%m/%Y')}.", MENU))(datetime.datetime.now(BRT)))
_reg("dias_fim_mes", "datas", "Quantos dias faltam para o fim do mês",
     lambda ctx, a: (lambda h: ctx.enviar(f"Faltam <b>{((h.replace(day=28) + datetime.timedelta(days=4)).replace(day=1) - h).days - 1}</b> dia(s) para o fim do mês.", MENU))(datetime.datetime.now(BRT).date()))


def _calendario(ctx, a, desloc=0):
    import calendar
    from . import feriados
    h = datetime.datetime.now(BRT).date()
    ano, mes = (h.year + (h.month - 1 + desloc) // 12, (h.month - 1 + desloc) % 12 + 1)
    fer = {f["data"]: f["nome"] for f in feriados.do_ano(ano)}
    linhas = ["D  S  T  Q  Q  S  S"]
    for sem in calendar.Calendar(6).monthdatescalendar(ano, mes):
        linhas.append(" ".join(("  " if d.month != mes else (f"{d.day:2d}" if d.isoformat() not in fer else " *")) for d in sem))
    mf = [f"* {d[8:]}: {n}" for d, n in sorted(fer.items()) if d[5:7] == f"{mes:02d}"]
    ctx.enviar(f"<b>{mes:02d}/{ano}</b>\n<pre>{_e(chr(10).join(linhas))}</pre>" + ("\n" + _e("\n".join(mf)) if mf else ""), MENU)


_reg("calendario_mes", "calendario", "Calendário deste mês com os feriados", _calendario)
_reg("calendario_proximo", "calendario", "Calendário do próximo mês com os feriados", lambda ctx, a: _calendario(ctx, a, 1))


# =====================================================================================================================
# CUSTO, POTÊNCIA, MAPA, AGENTES
# =====================================================================================================================
def _custo_ar(ctx, a, horas, rot):
    w = a.get("potencia_w") or 0
    if not w:
        return ctx.enviar(f"{_e(a['nome'])} está sem potência cadastrada (Aparelho → Ajustes).", _link("Abrir o ar", f"/aparelhos/{a['id']}"))
    kwh = w * horas / 1000
    ctx.enviar(f"<b>{_e(a['nome'])}</b> ({w} W) {rot}: {num(kwh, 2)} kWh = <b>{brl(kwh * _tarifa())}</b> (tarifa {brl(_tarifa())})", MENU)


_reg("custo_hora", "economia", "Quanto um ar gasta por hora ligado", lambda ctx, a: _custo_ar(ctx, a, 1, "por hora"), "/custo_hora NOME", arg="ar?")
_reg("custo_dia_8h", "economia", "Quanto um ar gasta em 8 h ligado", lambda ctx, a: _custo_ar(ctx, a, 8, "em 8 h"), "/custo_dia_8h NOME", arg="ar?")
_reg("custo_mes_uteis", "economia", "Quanto um ar gasta no mês (8 h × 22 dias úteis)", lambda ctx, a: _custo_ar(ctx, a, 176, "em 22 dias de 8 h"), "/custo_mes_uteis NOME", arg="ar?")
_reg("custo_agora", "economia", "Quanto os ares ligados agora gastam por hora",
     lambda ctx, a: (lambda lst: _resp(ctx, "Ligados agora", [f"Total: <b>{brl(sum((x['potencia_w'] or 0) for x in lst) / 1000 * _tarifa())} por hora</b>"]
                                       + [f"• {_e(x['nome'])}: {brl((x['potencia_w'] or 0) / 1000 * _tarifa())}/h" for x in lst], "/relatorios", "Nenhum ar ligado."))(ares(" AND a.ligado = 1")))
_reg("potencia_ares", "potencia", "Potência cadastrada de cada ar", lambda ctx, a: _lista_ares(ctx, "Potência", "", lambda x: f"• {_e(x['nome'])}: {x['potencia_w'] or '?'} W"))
_reg("potencia_ligada", "potencia", "Potência somada dos ares ligados agora",
     lambda ctx, a: (lambda lst: ctx.enviar(f"<b>{num(sum((x['potencia_w'] or 0) for x in lst) / 1000, 2)} kW</b> em {len(lst)} ar(es) ligado(s).", MENU))(ares(" AND a.ligado = 1")))
_reg("potencia_sem_cadastro", "potencia", "Ares sem potência cadastrada", lambda ctx, a: _lista_ares(ctx, "Sem potência", " AND COALESCE(a.potencia_w, 0) = 0", vazio="Todos têm potência."))


def _mapa():
    return db.cfg("mapa") or {}


_reg("mapa_salas", "mapabot", "Salas desenhadas na planta e o tamanho de cada uma",
     lambda ctx, a: (lambda nomes: _resp(ctx, "Salas na planta", [f"• {_e(nomes.get(str(k), 'Sala ' + str(k)))}: {num(float(s.get('w', 0)) / 100, 1)} × {num(float(s.get('h', 0)) / 100, 1)} m"
                                                                  for k, s in (_mapa().get("salas") or {}).items()], "/mapa", "Nenhuma sala."))(
         {str(r["id"]): r["nome"] for r in db.consultar("SELECT id, nome FROM projetos")}))
_reg("mapa_pessoas", "mapabot", "Pessoas da equipe no mapa e o expediente",
     lambda ctx, a: _resp(ctx, "Equipe no mapa", [f"• {_e(p.get('nome'))}: {_e(p.get('cargo') or '-')}" for p in (_mapa().get("pessoas") or [])], "/mapa", "Ninguém cadastrado."))
_reg("mapa_janelas", "mapabot", "Janelas e quanto cada uma está aberta",
     lambda ctx, a: _resp(ctx, "Janelas", [f"• {_e(e.get('nome') or e.get('id'))}: {e.get('aberta', 0)}%" for e in (_mapa().get("elementos") or []) if e.get("tipo") == "janela"], "/mapa", "Nenhuma janela."))
_reg("mapa_itens", "mapabot", "Itens da planta por tipo",
     lambda ctx, a: (lambda c: _resp(ctx, "Itens da planta", [f"• {_e(k)}: {v}" for k, v in sorted(c.items(), key=lambda kv: -kv[1])], "/mapa"))(
         __import__("collections").Counter(e.get("tipo", "?") for e in (_mapa().get("elementos") or []))))
_reg("mapa_andar", "mapabot", "Andar do escritório e total do prédio",
     lambda ctx, a: ctx.enviar(f"Escritório no <b>{_mapa().get('andar', '-')}º andar</b> de {_mapa().get('andares', '-')}.", MENU))


def _maquinas():
    return [db.cfg(r["chave"]) or {} for r in db.consultar("SELECT chave FROM config WHERE chave LIKE 'agente_maquina:%'")]


def _ag(ctx, titulo, fmt):
    _resp(ctx, titulo, [fmt(m, m.get("saude") or {}) for m in _maquinas()], "/infra?aba=agentes", "Nenhum agente.")


_reg("agentes_versoes", "agentesbot", "Versão do agente em cada computador", lambda ctx, a: _ag(ctx, "Versões", lambda m, s: f"• {_e(m.get('nome'))}: {_e(m.get('versao') or 'antiga (sem versão)')}"), papel=ADM)
def _v(x, suf=""):
    return "sem leitura" if x is None else f"{num(x, 1)}{suf}"


_reg("agentes_temperatura", "agentesbot", "Temperatura do processador de cada computador",
     lambda ctx, a: _ag(ctx, "Temperatura", lambda m, s: f"• {_e(m.get('nome'))}: {_v(s.get('temperatura'), '°')}"), papel=ADM)
_reg("agentes_memoria", "agentesbot", "Memória livre de cada computador",
     lambda ctx, a: _ag(ctx, "Memória", lambda m, s: f"• {_e(m.get('nome'))}: {_v(s.get('memoria_livre_mb'), ' MB')} livres de {_v(s.get('memoria_total_mb'), ' MB')}"), papel=ADM)
_reg("agentes_disco", "agentesbot", "Disco livre de cada computador", lambda ctx, a: _ag(ctx, "Disco", lambda m, s: f"• {_e(m.get('nome'))}: {_v(s.get('disco_livre_gb'), ' GB')} livres"), papel=ADM)
_reg("agentes_carga", "agentesbot", "Carga e tempo ligado de cada computador",
     lambda ctx, a: _ag(ctx, "Carga", lambda m, s: f"• {_e(m.get('nome'))}: carga {_v(s.get('carga'))} · ligado há {tempo(s.get('ligado_ha_s') or 0)}"), papel=ADM)
_reg("agentes_sistemas", "agentesbot", "Sistema e Python de cada computador", lambda ctx, a: _ag(ctx, "Sistemas", lambda m, s: f"• {_e(m.get('nome'))}: {_e(m.get('sistema'))} · Python {_e(m.get('python'))}"), papel=ADM)


# =====================================================================================================================
# MINHA SEGURANÇA E MEU HISTÓRICO
# =====================================================================================================================
_reg("meus_logins", "minhaseg", "Suas últimas entradas no sistema",
     lambda ctx, a: _resp(ctx, "Suas entradas", [f"• {quando(r['criado_em'])} {_e(_nav(r['agente']))} · {_e(r['cidade'] or r['pais'])}" for r in db.consultar(
         "SELECT criado_em, agente, cidade, pais FROM sessoes_uso WHERE usuario_id::text = ? ORDER BY criado_em DESC LIMIT 10", (str(ctx.u["id"]),))], "/configuracoes?aba=seguranca", "Nenhuma entrada."))
_reg("meus_ips", "minhaseg", "IPs de onde você entrou",
     lambda ctx, a: _resp(ctx, "Seus IPs", [f"• {_e(r['ip'])} {_e(r['cidade'] or r['pais'])}: {r['n']} sessão(ões)" for r in db.consultar(
         "SELECT ip, max(cidade) AS cidade, max(pais) AS pais, count(*) AS n FROM sessoes_uso WHERE usuario_id::text = ? GROUP BY ip ORDER BY 4 DESC LIMIT 10", (str(ctx.u["id"]),))], "/configuracoes?aba=seguranca"))
_reg("minha_biometria", "minhaseg", "Suas chaves de biometria",
     lambda ctx, a: _resp(ctx, "Sua biometria", [f"• {_e(r['nome'] or 'chave')} · último uso {quando(r['ultimo_uso'])}" for r in db.consultar(
         "SELECT nome, ultimo_uso FROM passkeys WHERE usuario_id::text = ?", (str(ctx.u["id"]),))], "/configuracoes?aba=seguranca", "Nenhuma biometria cadastrada."))
_reg("minhas_acoes_hoje", "meuhist", "O que você fez hoje no sistema",
     lambda ctx, a: _resp(ctx, "Suas ações hoje", [_linha_ativ(r) for r in _ativ(" AND t.usuario_id = ? AND t.quando > ?", (str(ctx.u["id"]), _hoje_ini()), 20)], "/atividade", "Nada hoje."))
_reg("minhas_acoes_7d", "meuhist", "O que você fez nos últimos 7 dias",
     lambda ctx, a: _resp(ctx, "Suas ações (7 dias)", [_linha_ativ(r) for r in _ativ(" AND t.usuario_id = ? AND t.quando > ?", (str(ctx.u["id"]), db.agora() - 7 * 86400), 20)], "/atividade", "Nada nos últimos 7 dias."))
_reg("meus_ares_usados", "meuhist", "Os ares que você mais comandou (30 dias)",
     lambda ctx, a: _resp(ctx, "Seus ares", [f"• {_e(r['nome'])}: {r['n']}" for r in db.consultar(
         "SELECT a.nome, count(*) AS n FROM atividade t JOIN aparelhos a ON a.id = t.aparelho_id WHERE t.usuario_id = ? AND t.quando > ? GROUP BY a.nome ORDER BY 2 DESC LIMIT 10",
         (str(ctx.u["id"]), db.agora() - 30 * 86400))], "/aparelhos", "Nenhum comando seu em 30 dias."))
_reg("minha_ultima_acao", "meuhist", "A sua última ação no sistema",
     lambda ctx, a: _resp(ctx, "Sua última ação", [_linha_ativ(r) for r in _ativ(" AND t.usuario_id = ?", (str(ctx.u["id"]),), 1)], "/atividade", "Nenhuma ainda."))

# =====================================================================================================================
# ATIVIDADE POR HORA, DIA DA SEMANA, ORIGEM E PERÍODO DO DIA
# =====================================================================================================================
_H = "EXTRACT(HOUR FROM to_timestamp(quando - 10800) AT TIME ZONE 'UTC')::int"
_DOW = "EXTRACT(DOW FROM to_timestamp(quando - 10800) AT TIME ZONE 'UTC')::int"


def _por_hora(ctx, dias, rot):
    rs = db.consultar(f"SELECT {_H} AS h, count(*) AS n FROM atividade WHERE quando > ? GROUP BY 1 ORDER BY 1", (db.agora() - dias * 86400,))  # nosec B608
    mx = max([r["n"] for r in rs] or [1])
    _resp(ctx, f"Atividade por hora {rot}", [f"<code>{r['h']:02d}h {'█' * max(1, round(r['n'] / mx * 12))}</code> {r['n']}" for r in rs], "/atividade?aba=analise")


_reg("atividade_hora_hoje", "porhora", "Registros por hora nas últimas 24 h", lambda ctx, a: _por_hora(ctx, 1, "(24 h)"))
_reg("atividade_hora_7d", "porhora", "Registros por hora em 7 dias", lambda ctx, a: _por_hora(ctx, 7, "(7 dias)"))
_reg("atividade_hora_30d", "porhora", "Registros por hora em 30 dias", lambda ctx, a: _por_hora(ctx, 30, "(30 dias)"))
for _i, _nd in enumerate(("domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado")):
    def _fd(ctx, a, _i=_i, _nd=_nd):
        rs = db.consultar(f"SELECT {_H} AS h, count(*) AS n FROM atividade WHERE quando > ? AND {_DOW} = ? GROUP BY 1 ORDER BY 1", (db.agora() - 28 * 86400, _i))  # nosec B608
        tot = sum(r["n"] for r in rs)
        pico = max(rs, key=lambda r: r["n"]) if rs else None
        _resp(ctx, f"{_nd.capitalize()} (últimas 4 semanas)", [f"{tot} registro(s)" + (f" · pico às {pico['h']:02d}h ({pico['n']})" if pico else "")], "/atividade?aba=analise")
    _reg(f"atividade_{_nd.replace('ç', 'c').replace('á', 'a')}", "porsemana", f"Atividade das {_nd}s nas últimas 4 semanas" if _i not in (0, 6) else f"Atividade aos {_nd}s nas últimas 4 semanas", _fd)

_ORIGENS = (("painel", "Painel e app"), ("sinric", "Alexa e Google"), ("agenda", "Agenda"), ("cena", "Cenas"), ("automacao", "Automações"),
            ("telegram", "Telegram"), ("musica", "Música"), ("sistema", "Sistema"), ("agente", "Agente"), ("ia", "Assistente de IA"))
for _o, _r in _ORIGENS:
    for _pk, _ps, _pr in (PERIODOS[2], PERIODOS[3]):
        _reg(f"origem_{_o}_{_pk}", "origens", f"O que veio de {_r} {_pr}",
             lambda ctx, a, _o=_o, _r=_r, _ps=_ps, _pr=_pr: _resp(ctx, f"{_r} {_pr}", [_linha_ativ(r) for r in _ativ(" AND split_part(t.origem, ':', 1) = ? AND t.quando > ?", (_o, db.agora() - _ps), 15)],
                                                                 "/atividade", "Nada no período."))

for _k, _rot, _h0, _h1 in (("manha", "de manhã (6h às 12h)", 6, 12), ("tarde", "à tarde (12h às 18h)", 12, 18), ("noite", "à noite (18h à meia-noite)", 18, 24), ("madrugada", "de madrugada (meia-noite às 6h)", 0, 6)):
    def _fpd(ctx, a, _rot=_rot, _h0=_h0, _h1=_h1):
        rs = db.consultar(f"SELECT t.quando, t.origem, t.acao, t.ok, t.detalhe, t.usuario, a.nome AS aparelho_nome FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id "  # nosec B608
                          f"WHERE t.quando > ? AND EXTRACT(HOUR FROM to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC') >= ? AND EXTRACT(HOUR FROM to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC') < ? "
                          "ORDER BY t.id DESC LIMIT 15", (db.agora() - 7 * 86400, _h0, _h1))
        _resp(ctx, f"Atividade {_rot}, 7 dias", [_linha_ativ(r) for r in rs], "/atividade")
    _reg(f"atividade_{_k}", "periodosdia", f"O que aconteceu {_rot} nos últimos 7 dias", _fpd)


# =====================================================================================================================
# PAPÉIS E PERMISSÕES
# =====================================================================================================================
def _papel(ctx, a, pid):
    from . import acesso
    p = acesso.PAPEIS[pid]
    perms = acesso.TODAS if pid in ("dono", "admin") else p.get("permissoes", [])
    _resp(ctx, f"Papel: {p['rotulo']}", [_e(p.get("descricao", ""))] + [f"• {_e(acesso.PERMISSOES[x][1])}" for x in perms if x in acesso.PERMISSOES], "/configuracoes?aba=usuarios")


def _quem_tem(ctx, a, perm):
    from . import acesso
    rs = db.consultar("SELECT nome, email, papel, permissoes FROM usuarios WHERE ativo ORDER BY nome")
    tem = [r for r in rs if r["papel"] in ("dono", "admin") or perm in (acesso._json(r["permissoes"], []) or [])]
    _resp(ctx, f"Quem pode: {acesso.PERMISSOES[perm][1]}", [f"• {_e(r['nome'] or r['email'])} ({_e(r['papel'])})" for r in tem], "/configuracoes?aba=usuarios", "Ninguém.")


def _registrar_papeis():
    from . import acesso
    for pid in acesso.PAPEIS:
        _reg(f"papel_{pid}", "papeis", f"O que o papel {acesso.PAPEIS[pid]['rotulo']} pode fazer", lambda ctx, a, pid=pid: _papel(ctx, a, pid))
    for perm in acesso.PERMISSOES:
        _reg(f"quem_pode_{perm.replace('.', '_')}", "permbot", f"Quem tem a permissão: {acesso.PERMISSOES[perm][1]}", lambda ctx, a, perm=perm: _quem_tem(ctx, a, perm), papel=ADM)


_registrar_papeis()


# =====================================================================================================================
# RETRATOS DIÁRIOS
# =====================================================================================================================
_reg("retratos_diarios", "backupsdia", "Retratos diários do banco feitos pela rotina das 5h",
     lambda ctx, a: _resp(ctx, "Retratos diários", [f"• {quando(r['criado_em'])}" for r in db.consultar("SELECT criado_em FROM backups ORDER BY criado_em DESC LIMIT 14")], "/backup", "Nenhum retrato."), papel=ADM)
_reg("retrato_ultimo", "backupsdia", "Quando foi o último retrato diário",
     lambda ctx, a: _resp(ctx, "Último retrato", [quando(r["criado_em"]) for r in db.consultar("SELECT criado_em FROM backups ORDER BY criado_em DESC LIMIT 1")], "/backup", "Nenhum retrato."), papel=ADM)

NOVOS = len(C) - _ANTES
