"""Bot do Telegram (@zynio_bot): controlar os ares, ver o estado, cenas, luzes, notificações e relatório pelo celular.

Hospedagem: webhook na própria API (Vercel) em POST /api/telegram/webhook. Não depende do computador do escritório para
receber mensagens; os comandos de ar seguem pela fila até o agente, igual ao painel.

Segurança (mais rígida que a do painel):
- o webhook só aceita o cabeçalho X-Telegram-Bot-Api-Secret-Token igual ao segredo guardado (cifrado) e IPs do Telegram;
- só conversas PRIVADAS de pessoas vinculadas; vínculo por código de uso único (10 min, só o hash fica no banco) que a
  própria pessoa gera logada no painel; o bot age com as MESMAS permissões dela (papel, projetos e ares);
- ações em lote (desligar todos, cenas) pedem confirmação por botão que expira em 60 s (nonce de uso único);
- limite de 20 comandos por minuto por conversa; quem tenta usar sem vínculo é bloqueado por 24 h depois de 5 tentativas;
- tudo vai para a Atividade (origem telegram); token e segredo ficam em config.telegram (cifrado, CHAVES_SENSIVEIS).
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import time

import httpx

from . import db

log = logging.getLogger("clima.telegram")
API = "https://api.telegram.org"
APP = "https://app.zynio.com.br"
CFG = "telegram"            # cifrado: token, segredo, username, vinculos
ESTADO = "telegram_estado"  # códigos pendentes (hash), confirmações, limites e bloqueios (sem segredo)
REDES_TELEGRAM = [ipaddress.ip_network(n) for n in ("149.154.160.0/20", "91.108.4.0/22", "2001:67c:4e8::/48", "2001:b28:f23c::/48")]
LIMITE_MIN = 20
FALHAS_BLOQUEIO = 5

COMANDOS = [
    ("menu", "Menu principal"), ("status", "Agente, ares ligados e transmissores"), ("ares", "Ares: ligar, desligar e temperatura"),
    ("desligartodos", "Desligar todos os ares ligados"), ("cenas", "Executar uma cena"), ("luzes", "Acender e apagar as luzes"),
    ("notificacoes", "Últimas notificações"), ("relatorio", "Resumo dos últimos 7 dias"), ("ajuda", "Como usar e segurança"),
    ("sair", "Desvincular este Telegram"),
]


# ---------------- configuração ----------------
def cfg() -> dict:
    return db.cfg(CFG) or {}


def _salvar(c: dict):
    db.set_cfg(CFG, c)


def _estado() -> dict:
    e = db.cfg(ESTADO) or {}
    for k in ("codigos", "confirmar", "uso", "bloqueios"):
        e.setdefault(k, {})
    agora = time.time()   # limpa o que venceu
    e["codigos"] = {h: v for h, v in e["codigos"].items() if v.get("expira", 0) > agora}
    e["confirmar"] = {n: v for n, v in e["confirmar"].items() if v.get("expira", 0) > agora}
    e["uso"] = {c: [t for t in v if t > agora - 60] for c, v in e["uso"].items() if v}
    e["bloqueios"] = {c: v for c, v in e["bloqueios"].items() if v.get("ate", 0) > agora or v.get("falhas", 0) and v.get("em", 0) > agora - 86400}
    return e


def _salvar_estado(e: dict):
    db.set_cfg(ESTADO, e)


def _hash(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def chamar(metodo: str, **dados) -> dict:
    token = cfg().get("token")
    if not token:
        raise RuntimeError("Bot do Telegram não configurado.")
    r = httpx.post(f"{API}/bot{token}/{metodo}", json=dados, timeout=15)
    j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if not j.get("ok"):
        raise RuntimeError(f"Telegram recusou {metodo}: {j.get('description') or r.status_code}")
    return j.get("result")


def configurar(token: str) -> dict:
    """Guarda o token (cifrado), cria um segredo novo do webhook, registra webhook, comandos e o botão de menu."""
    c = cfg()
    c.update({"token": token.strip(), "segredo": secrets.token_urlsafe(32), "ativo": True})
    c.setdefault("vinculos", {})
    _salvar(c)
    eu = chamar("getMe")
    c["username"] = eu.get("username"); c["nome"] = eu.get("first_name"); _salvar(c)
    chamar("setWebhook", url=f"{APP}/api/telegram/webhook", secret_token=c["segredo"], allowed_updates=["message", "callback_query"],
           drop_pending_updates=True, max_connections=10)
    chamar("setMyCommands", commands=[{"command": k, "description": d} for k, d in COMANDOS])
    chamar("setChatMenuButton", menu_button={"type": "commands"})
    chamar("setMyDescription", description="Bot do Clima Escritório. Só funciona para quem vinculou o Telegram pelo painel (app.zynio.com.br → Telegram).")
    chamar("setMyShortDescription", short_description="Ares-condicionados do escritório pelo Telegram, com as permissões de cada pessoa.")
    db.registrar("painel", "Bot do Telegram configurado", detalhe=f"@{c['username']}")
    return estado_publico()


def estado_publico(usuario_id: str | None = None, todos: bool = False) -> dict:
    c = cfg()
    info = {}
    if c.get("token"):
        try:
            info = chamar("getWebhookInfo")
        except Exception as e:  # noqa: BLE001
            info = {"erro": str(e)[:200]}
    vinc = [{"chat": k, **{x: v.get(x) for x in ("usuario_id", "nome", "desde", "telegram")}} for k, v in (c.get("vinculos") or {}).items()
            if todos or v.get("usuario_id") == usuario_id]
    return {"configurado": bool(c.get("token")), "username": c.get("username"), "nome": c.get("nome"),
            "webhook_ok": bool(info.get("url", "").endswith("/api/telegram/webhook")), "pendentes": info.get("pending_update_count"),
            "ultimo_erro": info.get("last_error_message"), "vinculos": vinc, "comandos": COMANDOS}


def gerar_codigo(usuario_id: str) -> dict:
    codigo = secrets.token_hex(4).upper()   # 8 caracteres
    e = _estado()
    e["codigos"][_hash(codigo)] = {"usuario_id": usuario_id, "expira": time.time() + 600}
    _salvar_estado(e)
    u = cfg().get("username") or "zynio_bot"
    return {"codigo": codigo, "expira_em": int(time.time() + 600), "link": f"https://t.me/{u}?start={codigo}"}


def desvincular(chat: str, por: str = "painel"):
    c = cfg()
    v = (c.get("vinculos") or {}).pop(str(chat), None)
    _salvar(c)
    if v:
        db.registrar(por, "Telegram desvinculado", detalhe=v.get("nome") or "")
    return bool(v)


# ---------------- webhook ----------------
def origem_valida(ip: str, segredo_recebido: str) -> bool:
    seg = cfg().get("segredo") or ""
    if not seg or not hmac.compare_digest(seg, segredo_recebido or ""):
        return False
    try:
        a = ipaddress.ip_address(ip)
        return any(a in n for n in REDES_TELEGRAM)
    except ValueError:
        return False


def _usuario(uid: str) -> dict | None:
    from . import acesso
    u = db.um("SELECT * FROM usuarios WHERE id = ?", (uid,))
    if not u or not u["ativo"]:
        return None
    u["id"] = str(u["id"])
    dono = u["papel"] in ("dono", "admin")
    u["permissoes"] = acesso.TODAS if dono else acesso._json(u["permissoes"], [])
    u["projetos"] = "*" if dono else acesso._json(u["projetos"], "*")
    u["aparelhos"] = "*" if dono else acesso._json(u.get("aparelhos"), "*")
    return u


def _enviar(chat, texto, botoes=None, editar=None):
    dados = {"chat_id": chat, "text": texto[:4000], "parse_mode": "HTML", "disable_web_page_preview": True}
    if botoes is not None:
        dados["reply_markup"] = {"inline_keyboard": botoes}
    try:
        if editar:
            chamar("editMessageText", message_id=editar, **dados)
        else:
            chamar("sendMessage", **dados)
    except Exception as e:  # noqa: BLE001
        if editar:   # mensagem antiga ou igual: manda nova
            try:
                chamar("sendMessage", **dados)
            except Exception:  # noqa: BLE001
                log.warning("telegram: %s", e)


def _e(t) -> str:
    import html
    return html.escape(str(t if t is not None else ""))


def processar(upd: dict):
    """Uma atualização do Telegram (mensagem ou clique em botão)."""
    msg = upd.get("message")
    cb = upd.get("callback_query")
    origem = msg or (cb or {}).get("message") or {}
    chat = origem.get("chat") or {}
    if chat.get("type") != "private":
        return   # grupos e canais: ignorados, sem resposta
    cid = str(chat.get("id"))
    quem = (msg or cb or {}).get("from") or {}
    e = _estado()
    agora = time.time()
    b = e["bloqueios"].get(cid) or {}
    if b.get("ate", 0) > agora:
        return
    uso = e["uso"].setdefault(cid, [])
    if len(uso) >= LIMITE_MIN:
        _salvar_estado(e)
        _enviar(cid, "Muitos comandos em pouco tempo. Espere um minuto.")
        return
    uso.append(agora)
    texto = ((msg or {}).get("text") or "").strip()
    c = cfg()
    vinc = (c.get("vinculos") or {}).get(cid)

    # vínculo: /start CODIGO (link do painel) ou /vincular CODIGO
    partes = texto.split()
    if not vinc:
        cod = partes[1] if len(partes) == 2 and partes[0] in ("/start", "/vincular") else ""
        dado = e["codigos"].pop(_hash(cod.upper()), None) if cod else None
        if dado:
            u = _usuario(dado["usuario_id"])
            if u:
                c.setdefault("vinculos", {})[cid] = {"usuario_id": u["id"], "nome": u.get("nome") or u["email"], "desde": int(agora),
                                                     "telegram": quem.get("username") or quem.get("first_name")}
                _salvar(c); e["bloqueios"].pop(cid, None); _salvar_estado(e)
                db.registrar("telegram", "Telegram vinculado", detalhe=f"{u.get('nome') or u['email']} (@{quem.get('username') or '-'})")
                _enviar(cid, f"Pronto, <b>{_e(u.get('nome') or 'você')}</b>: este Telegram está ligado à sua conta, com as suas permissões.", _menu())
                return
        falhas = int(b.get("falhas", 0)) + 1
        e["bloqueios"][cid] = {"falhas": falhas, "em": agora, **({"ate": agora + 86400} if falhas >= FALHAS_BLOQUEIO else {})}
        _salvar_estado(e)
        from . import firewall
        firewall.registrar(f"telegram:{cid}", "telegram_negado", "/api/telegram/webhook", f"falha {falhas} · @{quem.get('username') or '-'}")
        if falhas < FALHAS_BLOQUEIO:
            _enviar(cid, "Este Telegram não está vinculado. Entre no painel (app.zynio.com.br → Telegram), gere o código e mande aqui: /vincular CÓDIGO")
        return
    _salvar_estado(e)
    u = _usuario(vinc["usuario_id"])
    if not u:   # conta desativada ou apagada: corta o vínculo
        desvincular(cid, "telegram")
        _enviar(cid, "A sua conta não está mais ativa no sistema. O vínculo foi desfeito.")
        return
    from . import acesso
    acesso.atual.set(u)
    try:
        if cb:
            _clique(cid, cb, u)
        else:
            _comando(cid, texto, u)
    except Exception as ex:  # noqa: BLE001
        msg_erro = getattr(ex, "detail", None) or str(ex)
        _enviar(cid, f"Não deu: {_e(msg_erro)[:300]}")
        db.registrar("telegram", "Comando do Telegram falhou", ok=False, detalhe=f"{u.get('nome') or u['email']}: {str(msg_erro)[:160]}")


def _menu():
    return [[{"text": "Status", "callback_data": "m:status"}, {"text": "Ares", "callback_data": "m:ares"}],
            [{"text": "Cenas", "callback_data": "m:cenas"}, {"text": "Luzes", "callback_data": "m:luzes"}],
            [{"text": "Notificações", "callback_data": "m:notif"}, {"text": "Relatório 7 dias", "callback_data": "m:rel"}],
            [{"text": "Desligar todos os ares", "callback_data": "m:desligartodos"}]]


def _ares_visiveis():
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    return db.consultar(f"SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.hub_id FROM aparelhos a WHERE true{f}{fa} ORDER BY a.nome", tuple(p) + pa)


def _pode(perm):
    from . import acesso
    if not acesso.pode(perm):
        raise RuntimeError("seu usuário não tem permissão para isto.")


def _comando(cid, texto, u):
    cmd = (texto.split() or [""])[0].split("@")[0].lower()
    resto = texto[len(texto.split()[0]):].strip() if texto.split() else ""
    if cmd in ("/start", "/menu", ""):
        return _enviar(cid, f"Olá, {_e((u.get('nome') or '').split(' ')[0] or 'tudo bem')}. O que você quer fazer?", _menu())
    if cmd == "/ajuda":
        return _enviar(cid, "<b>Comandos</b>\n" + "\n".join(f"/{k} · {_e(d)}" for k, d in COMANDOS) +
                       "\n\n<b>Também por texto:</b> /ligar NOME, /desligar NOME, /temperatura NOME 23\n\n"
                       "<b>Segurança:</b> o bot só responde a quem vinculou o Telegram pelo painel e age com as permissões dessa pessoa. "
                       "Ações em lote pedem confirmação. Perdeu o celular? No painel → Telegram → Desvincular.")
    if cmd == "/status":
        return _status(cid)
    if cmd == "/ares":
        return _lista_ares(cid)
    if cmd in ("/ligar", "/desligar", "/temperatura"):
        return _por_texto(cid, cmd, resto)
    if cmd == "/desligartodos":
        return _pedir_confirmacao(cid, "desligartodos", None, "Desligar <b>todos</b> os ares ligados que você controla?")
    if cmd == "/cenas":
        return _cenas(cid)
    if cmd == "/luzes":
        return _luzes(cid)
    if cmd == "/notificacoes":
        return _notificacoes(cid)
    if cmd == "/relatorio":
        return _relatorio(cid)
    if cmd == "/sair":
        desvincular(cid, "telegram")
        return _enviar(cid, "Telegram desvinculado. Para usar de novo, gere outro código no painel.")
    return _enviar(cid, "Não conheço esse comando. Use /menu ou /ajuda.", _menu())


def _status(cid, editar=None):
    from . import coordenador, transmissor
    ares = _ares_visiveis()
    lig = [a for a in ares if a["ligado"]]
    hubs = db.um("SELECT count(*) FILTER (WHERE online = 1) on_, count(*) n FROM hubs")
    princ = next((m for m in coordenador.maquinas() if m.get("principal")), None)
    ag = ("sem agente ligado no escritório" if not transmissor.agente_online() or not princ else
          f"{_e(princ['nome'])}, enxerga {princ.get('ve_transmissores') or 0} de {princ.get('total_transmissores') or 0} transmissor(es)")
    linhas = [f"<b>Agente:</b> {ag}", f"<b>Transmissores online:</b> {hubs['on_']} de {hubs['n']}", f"<b>Ares ligados:</b> {len(lig)} de {len(ares)}"]
    linhas += [f"  • {_e(a['nome'])}: {a['temperatura']}°" for a in lig[:15]]
    _enviar(cid, "\n".join(linhas), [[{"text": "Ares", "callback_data": "m:ares"}, {"text": "Atualizar", "callback_data": "m:status"}], [{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _lista_ares(cid, editar=None):
    ares = _ares_visiveis()
    if not ares:
        return _enviar(cid, "Nenhum ar sob a sua responsabilidade.", editar=editar)
    bt = [[{"text": f"{'● ' if a['ligado'] else '○ '}{a['nome']}{' · ' + str(a['temperatura']) + '°' if a['ligado'] else ''}"[:60], "callback_data": f"a:{a['id']}"}] for a in ares[:40]]
    bt.append([{"text": "Menu", "callback_data": "m:menu"}])
    _enviar(cid, "Escolha o ar (● ligado, ○ desligado):", bt, editar)


def _painel_ar(cid, aid, editar=None):
    from . import acesso, clima
    acesso.checar_aparelho(aid)
    a = clima.aparelho(aid)
    acesso.checar_projeto(a["projeto_id"]) if acesso.projetos_permitidos() is not None else None
    t = a["temperatura"]
    texto = (f"<b>{_e(a['nome'])}</b>\n{'Ligado' if a['ligado'] else 'Desligado'} · {t}° · {_e(a['modo'])}"
             + ("" if a.get("hub_id") else "\nSem transmissor: este ar não recebe comandos."))
    bt = [[{"text": "Ligar", "callback_data": f"l:{aid}"}, {"text": "Desligar", "callback_data": f"d:{aid}"}],
          [{"text": f"{x}°", "callback_data": f"t:{aid}:{x}"} for x in (max(a["temp_min"], t - 2), max(a["temp_min"], t - 1), min(a["temp_max"], t + 1), min(a["temp_max"], t + 2))],
          [{"text": "Voltar", "callback_data": "m:ares"}]]
    _enviar(cid, texto, bt, editar)


def _aplicar(cid, aid, editar=None, **estado):
    from . import acesso, clima
    _pode("aparelhos.controlar")
    acesso.checar_aparelho(aid)
    a = clima.aparelho(aid)
    acesso.checar_projeto(a["projeto_id"]) if acesso.projetos_permitidos() is not None else None
    r = clima.aplicar(aid, "telegram", **estado)
    extra = f" (mudou junto: {len(r.get('juntos') or [])} ar(es) iguais à vista do transmissor)" if r.get("juntos") else ""
    _enviar(cid, f"Feito: <b>{_e(a['nome'])}</b> {'desligado' if estado.get('ligado') is False else 'em ' + str(r.get('temperatura', '')) + '°'}{extra}.")
    _painel_ar(cid, aid)


def _por_texto(cid, cmd, resto):
    ares = _ares_visiveis()
    partes = resto.rsplit(" ", 1)
    graus = None
    if cmd == "/temperatura" and len(partes) == 2 and partes[1].isdigit():
        resto, graus = partes[0], int(partes[1])
    alvo = [a for a in ares if resto and resto.lower() in a["nome"].lower()]
    if len(alvo) != 1:
        return _enviar(cid, "Não achei um ar só com esse nome. Escolha na lista:" if resto else "Escolha o ar:",
                       [[{"text": a["nome"][:60], "callback_data": f"a:{a['id']}"}] for a in (alvo or ares)[:20]])
    aid = alvo[0]["id"]
    if cmd == "/desligar":
        return _aplicar(cid, aid, ligado=False)
    if cmd == "/ligar":
        return _aplicar(cid, aid, ligado=True)
    if graus is None:
        return _enviar(cid, "Use: /temperatura NOME 23")
    return _aplicar(cid, aid, ligado=True, temperatura=graus)


def _pedir_confirmacao(cid, acao, valor, texto):
    e = _estado()
    n = secrets.token_hex(6)
    e["confirmar"][n] = {"chat": cid, "acao": acao, "valor": valor, "expira": time.time() + 60}
    _salvar_estado(e)
    _enviar(cid, texto + "\n\nConfirme em até 60 segundos.", [[{"text": "Confirmar", "callback_data": f"c:{n}"}, {"text": "Cancelar", "callback_data": "m:menu"}]])


def _cenas(cid, editar=None):
    from . import acesso
    f, p = acesso.filtro_sql("projeto_id")
    cenas = db.consultar(f"SELECT id, nome FROM cenas WHERE true{f} ORDER BY nome", tuple(p))
    if not cenas:
        return _enviar(cid, "Nenhuma cena disponível para você.", [[{"text": "Menu", "callback_data": "m:menu"}]], editar)
    _enviar(cid, "Qual cena executar?", [[{"text": c["nome"][:60], "callback_data": f"s:{c['id']}"}] for c in cenas[:30]] + [[{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _luzes(cid, editar=None):
    from . import dispositivos
    from .rotas import dispositivos as rd
    f, p = rd._escopo()
    luzes = [d for d in dispositivos.listar("luz", f, p) if d["conectado"]]
    if not luzes:
        return _enviar(cid, "Nenhuma luz conectada a um aparelho ainda.", [[{"text": "Menu", "callback_data": "m:menu"}]], editar)
    bt = [[{"text": f"{'● ' if (d['resumo'] or {}).get('ligada') else '○ '}{d['nome']}"[:60], "callback_data": f"z:{d['id']}"}] for d in luzes[:30]]
    _enviar(cid, "Toque para acender ou apagar (● acesa):", bt + [[{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _notificacoes(cid, editar=None):
    from . import notificacoes
    from .rotas import api as rapi
    r = notificacoes.listar("todas", 30)
    vis = rapi._visibilidade_notificacoes()
    itens = [n for n in r["itens"] if vis is None or vis(n)][:6]
    if not itens:
        return _enviar(cid, "Nenhuma notificação aberta.", [[{"text": "Menu", "callback_data": "m:menu"}]], editar)
    _enviar(cid, "\n\n".join(f"<b>{_e(n['titulo'])}</b>\n{_e((n.get('detalhe') or '')[:180])}" for n in itens),
            [[{"text": "Abrir no painel", "url": f"{APP}/notificacoes"}], [{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _relatorio(cid, editar=None):
    _pode("relatorios.ver")
    from . import relatorio
    fim = db.agora()
    d = relatorio.montar(fim - 7 * 86400, fim)
    linhas = relatorio._resumo_linhas(d)[1:8]
    _enviar(cid, "<b>Últimos 7 dias</b>\n" + "\n".join(f"{_e(a)}: {_e(b)}" for a, b in linhas),
            [[{"text": "Relatório completo", "url": f"{APP}/relatorios"}], [{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _clique(cid, cb, u):
    dado = cb.get("data") or ""
    mid = (cb.get("message") or {}).get("message_id")
    try:
        chamar("answerCallbackQuery", callback_query_id=cb["id"])
    except Exception:  # noqa: BLE001
        pass
    tipo, _, arg = dado.partition(":")
    if tipo == "m":
        fn = {"menu": lambda: _enviar(cid, "O que você quer fazer?", _menu(), mid), "status": lambda: _status(cid, mid), "ares": lambda: _lista_ares(cid, mid),
              "cenas": lambda: _cenas(cid, mid), "luzes": lambda: _luzes(cid, mid), "notif": lambda: _notificacoes(cid, mid), "rel": lambda: _relatorio(cid, mid),
              "desligartodos": lambda: _pedir_confirmacao(cid, "desligartodos", None, "Desligar <b>todos</b> os ares ligados que você controla?")}.get(arg)
        return fn() if fn else None
    if tipo == "a":
        return _painel_ar(cid, int(arg), mid)
    if tipo in ("l", "d"):
        return _aplicar(cid, int(arg), ligado=(tipo == "l"))
    if tipo == "t":
        aid, graus = arg.split(":")
        return _aplicar(cid, int(aid), ligado=True, temperatura=int(graus))
    if tipo == "s":
        nome = (db.um("SELECT nome FROM cenas WHERE id = ?", (int(arg),)) or {}).get("nome", "a cena")
        return _pedir_confirmacao(cid, "cena", int(arg), f"Executar a cena <b>{_e(nome)}</b>?")
    if tipo == "z":
        _pode("aparelhos.controlar")
        from . import dispositivos
        from .rotas import dispositivos as rd
        d = rd._pegar(int(arg))
        if d["tipo"] != "luz":
            raise RuntimeError("isto não é uma luz.")
        acao = "desligar" if (d["resumo"] or {}).get("ligada") else "ligar"
        dispositivos.comando(d["id"], acao, None, f"telegram:{(u.get('nome') or '')[:20]}")
        return _luzes(cid, mid)
    if tipo == "c":
        e = _estado()
        p = e["confirmar"].pop(arg, None)
        _salvar_estado(e)
        if not p or p["chat"] != cid:
            return _enviar(cid, "Esta confirmação venceu. Peça de novo.", _menu())
        if p["acao"] == "desligartodos":
            _pode("aparelhos.controlar")
            from . import clima
            feitos, falhas, ja = 0, 0, set()
            for a in [a for a in _ares_visiveis() if a["ligado"]]:
                if a["id"] in ja:
                    feitos += 1; continue
                try:
                    r = clima.aplicar(a["id"], "telegram", ligado=False); feitos += 1; ja.update(r.get("juntos") or [])
                except Exception:  # noqa: BLE001
                    falhas += 1
            return _enviar(cid, f"{feitos} ar(es) desligado(s)" + (f", {falhas} sem resposta" if falhas else "") + ".", _menu())
        if p["acao"] == "cena":
            _pode("aparelhos.controlar")
            from .rotas import api as rapi
            r = rapi.executar_cena(int(p["valor"]))
            falhas = [x for x in r.get("resultados", []) if not x["ok"]]
            return _enviar(cid, "Cena executada." if not falhas else f"Cena executada com {len(falhas)} falha(s): {_e(falhas[0].get('erro', ''))[:160]}", _menu())
