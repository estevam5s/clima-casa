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
Reforço de 20/11:
- auditoria de TODA interação em telegram_eventos (quem, o quê, resultado e o IP do servidor do Telegram que entregou);
  o Telegram não revela o IP de quem usa o bot: o que chega aqui é o IP dos servidores dele (conferido na lista oficial);
- identidade: o ID da pessoa no Telegram tem que ser o mesmo gravado no vínculo (senão o vínculo cai);
- flood: 3 estouros do limite em 10 min = conversa bloqueada por 1 h (e evento de segurança);
- PIN de 6 dígitos (hash scrypt, definido no painel) para comandos críticos (destrancar a porta, escudo, bloquear IP,
  reiniciar o agente, backup, encerrar sessões…); vale 10 min por conversa; 5 erros = 24 h bloqueado;
- vínculo sem uso por 60 dias expira (precisa vincular de novo); prompt injection no texto livre é recusado (ia.py).
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import re
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
CRITICOS = {"destrancar", "reiniciaragente", "escudo", "desligarescudo", "bloquearip", "desbloquearip", "backup", "encerrarsessoes",
            "pausartodasautos", "ativartodasautos", "desligartodos", "telegramvinculos"}
PIN_MIN = 10            # minutos que o PIN vale depois de digitado
PIN_ERROS = 5
VINCULO_DIAS = 60
_ip_atual = {"ip": ""}   # IP do servidor do Telegram que entregou a atualização em processamento


def auditar(cid, quem: dict | None, tipo: str, texto: str = "", ok: bool = True, u: dict | None = None, erro: str = "", ms: int | None = None):
    """Uma linha em telegram_eventos. Texto curto (até 160) e sem segredo: PIN nunca é gravado. Devolve o id (para `concluir`)."""
    if texto and re.match(r"(?i)^\s*/?pin", texto):   # PIN digitado com erro (/pinb123456) nunca vai para o log
        texto = "/pin ••••••"
    try:
        q = quem or {}
        r = db.um("INSERT INTO telegram_eventos (quando, chat, tg_id, username, usuario_id, usuario_nome, tipo, texto, ok, ip, erro, ms) "
                  "VALUES (?,?,?,?,CAST(? AS uuid),?,?,?,?,?,?,?) RETURNING id",
                  (db.agora(), str(cid), str(q.get("id") or ""), (q.get("username") or q.get("first_name") or "")[:60], (u or {}).get("id"),
                   ((u or {}).get("nome") or (u or {}).get("email") or "")[:80], tipo, (texto or "")[:160], ok, _ip_atual["ip"][:45], (erro or "")[:400], ms))
        return (r or {}).get("id")
    except Exception as e:  # noqa: BLE001
        log.warning("telegram auditoria: %s", e)
        return None


def concluir(eid, ms: int, erro: str = ""):
    """Grava quanto tempo a resposta levou e, se deu erro, o motivo (a tela Telegram → Logs mostra)."""
    if not eid:
        return
    try:
        if erro:
            db.executar("UPDATE telegram_eventos SET ms = ?, ok = false, erro = ? WHERE id = ?", (ms, erro[:400], eid))
        else:
            db.executar("UPDATE telegram_eventos SET ms = ? WHERE id = ?", (ms, eid))
    except Exception as e:  # noqa: BLE001
        log.warning("telegram concluir: %s", e)


# ---------------- PIN para comandos críticos ----------------
def _hash_pin(pin: str, sal: bytes) -> str:
    return hashlib.scrypt(pin.encode(), salt=sal, n=2 ** 14, r=8, p=1, dklen=32).hex()


def definir_pin(usuario_id: str, pin: str | None):
    pins = db.cfg("telegram_pins") or {}
    if pin is None:
        pins.pop(str(usuario_id), None)
    else:
        sal = secrets.token_bytes(16)
        pins[str(usuario_id)] = {"sal": sal.hex(), "hash": _hash_pin(pin, sal), "em": int(time.time())}
    db.set_cfg("telegram_pins", pins)


def tem_pin(usuario_id: str) -> bool:
    return str(usuario_id) in (db.cfg("telegram_pins") or {})


def conferir_pin(usuario_id: str, pin: str) -> bool:
    p = (db.cfg("telegram_pins") or {}).get(str(usuario_id))
    if not p or not re.fullmatch(r"\d{6}", pin or ""):
        return False
    return hmac.compare_digest(p["hash"], _hash_pin(pin, bytes.fromhex(p["sal"])))


def pin_liberado(cid: str) -> bool:
    return (_estado().get("pin_ok") or {}).get(str(cid), 0) > time.time()

# os comandos ficam em telegram_cmds.py (catálogo com categorias, permissões e confirmação); o menu "/" do Telegram
# mostra os 100 mais usados (limite do Telegram) e /comandos navega por todos


# ---------------- configuração ----------------
def cfg() -> dict:
    return db.cfg(CFG) or {}


def _salvar(c: dict):
    db.set_cfg(CFG, c)


def _estado() -> dict:
    e = db.cfg(ESTADO) or {}
    for k in ("codigos", "confirmar", "uso", "bloqueios", "pin_ok", "pin_erros", "floods", "ultimo"):
        e.setdefault(k, {})
    e.setdefault("vistos", [])
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
    from . import telegram_cmds
    chamar("setMyCommands", commands=telegram_cmds.para_telegram())
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
            "ultimo_erro": info.get("last_error_message"), "vinculos": vinc, "comandos": _catalogo(), "categorias": _categorias()}


def _catalogo():
    from . import telegram_cmds
    return telegram_cmds.publico()


def _categorias():
    from . import telegram_cmds
    return [{"id": k, "nome": r, "descricao": d} for k, r, d in telegram_cmds.CATS]


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


def processar(upd: dict, ip: str = ""):
    """Uma atualização do Telegram (mensagem ou clique em botão)."""
    _ip_atual["ip"] = ip or ""
    uid_upd = upd.get("update_id")
    if uid_upd is not None:   # o Telegram reenvia se a resposta demorar (ex.: IA): o mesmo comando não roda duas vezes
        ev = _estado()
        if uid_upd in ev["vistos"]:
            return
        ev["vistos"] = (ev["vistos"] + [uid_upd])[-60:]
        _salvar_estado(ev)
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
    texto = ((msg or {}).get("text") or "").strip()
    if b.get("ate", 0) > agora:
        auditar(cid, quem, "bloqueado", texto[:60] or (cb or {}).get("data", ""), False)
        return
    uso = e["uso"].setdefault(cid, [])
    if len(uso) >= LIMITE_MIN:
        # flood: 3 estouros em 10 min = conversa bloqueada por 1 h
        fl = [x for x in e["floods"].get(cid, []) if x > agora - 600] + [agora]
        e["floods"][cid] = fl
        if len(fl) >= 3:
            e["bloqueios"][cid] = {"falhas": b.get("falhas", 0), "em": agora, "ate": agora + 3600, "motivo": "flood"}
            from . import firewall
            firewall.registrar(f"telegram:{cid}", "telegram_flood", "/api/telegram/webhook", f"flood · @{quem.get('username') or '-'}")
        _salvar_estado(e)
        auditar(cid, quem, "flood", f"{len(uso)} comandos/min", False)
        _enviar(cid, "Muitos comandos em pouco tempo. Espere um minuto." if len(fl) < 3 else "Muitos comandos seguidos: esta conversa ficou bloqueada por 1 hora.")
        return
    uso.append(agora)
    c = cfg()
    vinc = (c.get("vinculos") or {}).get(cid)
    # identidade: quem escreve tem que ser a mesma conta do Telegram que fez o vínculo
    if vinc and vinc.get("tg_id") and str(quem.get("id") or "") != str(vinc["tg_id"]):
        auditar(cid, quem, "identidade", f"esperado {vinc['tg_id']}", False)
        from . import firewall
        firewall.registrar(f"telegram:{cid}", "telegram_identidade", "/api/telegram/webhook", f"ID diferente do vínculo · @{quem.get('username') or '-'}")
        desvincular(cid, "seguranca")
        _salvar_estado(e)
        return
    # vínculo parado há muito tempo expira
    ult = e["ultimo"].get(cid) or (vinc or {}).get("desde") or agora
    if vinc and agora - ult > VINCULO_DIAS * 86400:
        auditar(cid, quem, "expirado", f"sem uso há {int((agora - ult) / 86400)} dias", False)
        desvincular(cid, "expirou")
        _salvar_estado(e)
        _enviar(cid, f"Este Telegram ficou {VINCULO_DIAS} dias sem uso e o vínculo expirou. Gere um código novo no painel (app.zynio.com.br → Telegram).")
        return
    if vinc:
        e["ultimo"][cid] = agora
        if not vinc.get("tg_id") and quem.get("id"):   # vínculo antigo: grava o ID no primeiro uso (depois passa a conferir)
            vinc["tg_id"] = str(quem["id"]); _salvar(c)

    # vínculo: /start CODIGO (link do painel) ou /vincular CODIGO
    partes = texto.split()
    if not vinc:
        cod = partes[1] if len(partes) == 2 and partes[0] in ("/start", "/vincular") else ""
        dado = e["codigos"].pop(_hash(cod.upper()), None) if cod else None
        if dado:
            u = _usuario(dado["usuario_id"])
            if u:
                c.setdefault("vinculos", {})[cid] = {"usuario_id": u["id"], "nome": u.get("nome") or u["email"], "desde": int(agora),
                                                     "telegram": quem.get("username") or quem.get("first_name"), "tg_id": str(quem.get("id") or "")}
                auditar(cid, quem, "vinculo", "vinculou o Telegram", True, u)
                _salvar(c); e["bloqueios"].pop(cid, None); _salvar_estado(e)
                db.registrar("telegram", "Telegram vinculado", detalhe=f"{u.get('nome') or u['email']} (@{quem.get('username') or '-'})")
                _primeiros_passos(cid, u)
                return
        # quem chega pela primeira vez (/start, /ajuda, /sobre sem código): apresentação completa, sem contar como tentativa negada.
        # No máximo uma a cada 10 min por conversa (o controle de flood acima já barra rajadas).
        if partes[:1] and partes[0].split("@")[0] in ("/start", "/ajuda", "/sobre", "/help", "/como") and len(partes) == 1:
            ult = e.setdefault("apresentado", {}).get(cid, 0)
            if agora - ult > 600:
                e["apresentado"][cid] = agora
                _salvar_estado(e)
                auditar(cid, quem, "apresentacao", texto[:20], True)
                return _apresentacao(cid, quem)
            _salvar_estado(e)
            return
        falhas = int(b.get("falhas", 0)) + 1
        e["bloqueios"][cid] = {"falhas": falhas, "em": agora, **({"ate": agora + 86400} if falhas >= FALHAS_BLOQUEIO else {})}
        _salvar_estado(e)
        from . import firewall
        firewall.registrar(f"telegram:{cid}", "telegram_negado", "/api/telegram/webhook", f"falha {falhas} · @{quem.get('username') or '-'}")
        auditar(cid, quem, "negado", texto[:60], False)
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
    # PIN digitado: /pin 123456 (nunca vai para a auditoria nem para a Atividade)
    if texto.split()[:1] == ["/pin"]:
        return _pin(cid, quem, u, (texto.split() + [""])[1])
    eid = auditar(cid, quem, "clique" if cb else ("comando" if texto.startswith("/") else "ia"), (cb or {}).get("data", "") if cb else texto[:120], True, u)
    t0 = time.monotonic()
    try:
        if cb:
            _clique(cid, cb, u)
        else:
            _comando(cid, texto, u)
        concluir(eid, int((time.monotonic() - t0) * 1000))
    except Exception as ex:  # noqa: BLE001
        msg_erro = getattr(ex, "detail", None) or str(ex)
        ms = int((time.monotonic() - t0) * 1000)
        _enviar(cid, f"Não deu: {_e(msg_erro)[:300]}")
        db.registrar("telegram", "Comando do Telegram falhou", ok=False, detalhe=f"{u.get('nome') or u['email']}: {str(msg_erro)[:160]}")
        # recusa esperada (HTTPException: permissão, validação) fica no próprio registro; erro de código vira um "erro" à parte
        concluir(eid, ms, str(msg_erro))
        if not hasattr(ex, "status_code"):
            import traceback
            local = "".join(traceback.format_exception(type(ex), ex, ex.__traceback__)[-2:])[-300:]
            auditar(cid, quem, "erro", (cb or {}).get("data", "") if cb else texto[:120], False, u, f"{type(ex).__name__}: {msg_erro} | {local}", ms)
            try:
                from . import bugs
                cmd_txt = ((cb or {}).get("data", "") if cb else texto.split()[0] if texto else "")[:60]
                bugs.registrar_auto(f"telegram:{type(ex).__name__}:{cmd_txt}", f"Bot do Telegram: erro em {cmd_txt or 'mensagem'}",
                                    f"{type(ex).__name__}: {str(msg_erro)[:300]}\n\n{local}", pagina="/telegram", gravidade="media", categoria="telegram",
                                    contexto={"erros": [{"quando": db.agora(), "comando": cmd_txt, "erro": str(msg_erro)[:300]}]})
            except Exception:  # noqa: BLE001
                pass


APP_URL = "https://app.zynio.com.br"


def _apresentacao(cid, quem):
    """Para quem ainda não vinculou: o que é o bot, o que dá para fazer, como vincular e a segurança."""
    from . import telegram_cmds
    nome = _e(quem.get("first_name") or "")
    _enviar(cid,
            f"Olá{(', ' + nome) if nome else ''}! Este é o bot do <b>Clima Escritório</b>: controla os ar-condicionados do escritório "
            "pelo Telegram, com as mesmas permissões que você tem no painel.\n\n"
            "<b>O que dá para fazer</b>\n"
            "• Ligar, desligar, mudar temperatura, modo e ventilação de cada ar ou da sala inteira\n"
            "• Timers (desligar às 18:00, ligar por 1 hora), cenas e agenda\n"
            "• Relatórios de uso e gasto, previsão do tempo hora a hora\n"
            "• Luzes, cafeteira, persianas e música\n"
            "• Avisos importantes aqui (ar ligado há muito tempo, falhas, segurança)\n"
            f"• Conversar com a IA do sistema: escreva do seu jeito, como \"desliga o ar dos devs daqui a 1 hora\"\n"
            f"• São {len(telegram_cmds.C)} comandos, organizados em {len(telegram_cmds.CATS)} categorias\n\n"
            "<b>Como começar (1 minuto)</b>\n"
            "1. Entre no painel: app.zynio.com.br\n"
            "2. Abra <b>Telegram</b> no menu e toque em <b>Vincular meu Telegram</b>\n"
            "3. Toque no link (ou mande aqui <code>/vincular CÓDIGO</code>). O código vale poucos minutos e só uma vez.\n\n"
            "<b>Segurança</b>\n"
            "• O bot só responde a quem vinculou pelo painel; o resto é bloqueado e registrado\n"
            "• Ações em lote pedem confirmação; as críticas pedem o seu PIN\n"
            "• Perdeu o celular? No painel → Telegram → Desvincular\n\n"
            "Ainda não tem acesso? Peça ao administrador do escritório.",
            [[{"text": "Abrir o painel e vincular", "url": f"{APP_URL}/telegram"}],
             [{"text": "Como funciona o sistema", "url": f"{APP_URL}/guia#como-funciona"}, {"text": "Passo a passo do bot", "url": f"{APP_URL}/guia#telegram"}]])


def _primeiros_passos(cid, u):
    """Logo depois de vincular: um roteiro curto do que fazer primeiro."""
    from . import telegram_cmds
    _enviar(cid,
            f"Pronto, <b>{_e(u.get('nome') or 'você')}</b>! Este Telegram está ligado à sua conta, com as suas permissões.\n\n"
            "<b>Primeiros passos</b>\n"
            "1. <b>/ares</b> mostra os ares que você controla; toque num para abrir o painel dele\n"
            "2. <b>/usar NOME</b> escolhe o ar atual: depois <b>/23</b>, <b>/frio</b>, <b>/mais</b>, <b>/desligar</b> agem nele\n"
            "3. <b>/desligar_1800</b> desliga o ar atual às 18:00 (há horários de 06:00 a 23:30)\n"
            "4. <b>/avisos sim</b> recebe aqui os avisos importantes\n"
            "5. Crie um <b>PIN</b> no painel (Telegram → PIN) para liberar os comandos críticos\n\n"
            "<b>Dicas</b>\n"
            "• Escreva do seu jeito que a IA entende\n"
            f"• <b>/buscar palavra</b> acha um comando entre os {len(telegram_cmds.C)}\n"
            "• <b>/menu</b> abre tudo por categoria · <b>/oque_zona</b> e os outros /oque_ explicam cada termo\n"
            "• <b>/uso_ia</b> mostra o seu limite de uso da IA",
            [[{"text": "Ver meus ares", "callback_data": "m:ares"}, {"text": "Menu completo", "callback_data": "m:menu"}],
             [{"text": "Todos os comandos", "callback_data": "x:comandos"}, {"text": "Guia e glossário", "callback_data": "k:guia:0"}]])


def _menu():
    """Atalhos curtos que acompanham as respostas; o menu completo (com o estado no topo) é o /menu."""
    return [[{"text": "Ares", "callback_data": "m:ares"}, {"text": "Ligados", "callback_data": "m:ligados"}, {"text": "Status", "callback_data": "m:status"}],
            [{"text": "Menu completo", "callback_data": "m:menu"}, {"text": "Todos os comandos", "callback_data": "x:comandos"}]]


def _ares_visiveis():
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    return db.consultar(f"SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.ventilador, a.hub_id FROM aparelhos a WHERE true{f}{fa} ORDER BY a.nome", tuple(p) + pa)


def _pode(perm):
    from . import acesso
    if not acesso.pode(perm):
        raise RuntimeError("seu usuário não tem permissão para isto.")


def _comando(cid, texto, u):
    cmd = (texto.split() or [""])[0].split("@")[0].lower()
    resto = texto[len(texto.split()[0]):].strip() if texto.split() else ""
    if texto and not texto.startswith("/"):
        return _ia(cid, texto, u)
    from . import telegram_cmds
    nome = cmd.lstrip("/")
    if nome == "status":
        return _status(cid)
    if nome in telegram_cmds.C:
        return telegram_cmds.executar(telegram_cmds.Ctx(cid, u), nome, resto)
    return _enviar(cid, "Não conheço esse comando. Use /menu, /buscar palavra ou escreva do seu jeito.", _menu())


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


def _lista_ares(cid, editar=None, so_ligados=False):
    ares = _ares_visiveis()
    if so_ligados:
        ares = [a for a in ares if a["ligado"]]
    if not ares:
        return _enviar(cid, "Nenhum ar ligado agora." if so_ligados else "Nenhum ar sob a sua responsabilidade.",
                       [[{"text": "Todos os ares", "callback_data": "m:ares"}, {"text": "Menu", "callback_data": "m:menu"}]], editar)
    from . import clima
    bt = [[{"text": (f"● {a['nome']} · {clima.MODOS.get(a['modo'], a['modo'])} {a['temperatura']}°" if a["ligado"] else f"○ {a['nome']}")[:60],
            "callback_data": f"a:{a['id']}"}] for a in ares[:40]]
    bt.append([{"text": "Todos" if so_ligados else "Só ligados", "callback_data": "m:ares" if so_ligados else "m:ligados"},
               {"text": "Desligar todos", "callback_data": "m:desligartodos"}, {"text": "Menu", "callback_data": "m:menu"}])
    _enviar(cid, ("Ares ligados" if so_ligados else "Escolha o ar") + " (● ligado, ○ desligado):", bt, editar)


def _tempo(seg) -> str:
    m = max(0, int(seg) // 60)
    return f"{m} min" if m < 60 else f"{m // 60} h {m % 60:02d} min"


def _painel_ar(cid, aid, editar=None, aviso=""):
    """Painel do ar no estilo do controle remoto: estado completo e todos os ajustes num toque."""
    from . import acesso, clima, transmissor
    acesso.checar_aparelho(aid)
    a = clima.aparelho(aid)
    acesso.checar_projeto(a["projeto_id"]) if acesso.projetos_permitidos() is not None else None
    agora = db.agora()
    t, modo, vent = a["temperatura"], a["modo"], a["ventilador"]
    sala = (db.um("SELECT nome FROM projetos WHERE id = ?", (a["projeto_id"],)) or {}).get("nome", "")
    hub = db.um("SELECT nome, online FROM hubs WHERE id = ?", (a["hub_id"],)) if a.get("hub_id") else None
    timer = db.um("SELECT executar_em, acao FROM temporizadores WHERE aparelho_id = ? ORDER BY executar_em LIMIT 1", (aid,))
    linhas = [f"<b>{_e(a['nome'])}</b>" + (f" · {_e(sala)}" if sala else "")]
    if a["ligado"]:
        linhas.append(f"<b>Ligado</b> · {_e(clima.MODOS.get(modo, modo))} <b>{t}°</b> · ventilação {_e(clima.VENTILACAO.get(vent, vent).lower())}")
        if a.get("ligado_desde"):
            linhas.append(f"Ligado há {_tempo(agora - a['ligado_desde'])}")
    else:
        linhas.append(f"<b>Desligado</b> · ao ligar: {_e(clima.MODOS.get(modo, modo))} {t}°")
    if timer:
        acao = json.loads(timer["acao"]) if isinstance(timer["acao"], str) else (timer["acao"] or {})
        linhas.append(f"Timer: {'desliga' if acao.get('ligado') is False else 'liga'} em {_tempo(timer['executar_em'] - agora)}")
    if not hub:
        linhas.append("Sem transmissor: este ar não recebe comandos.")
    else:
        linhas.append(f"Transmissor {_e(hub['nome'])}: {'online' if hub['online'] else 'sem contato'}")
        try:
            from . import zonas
            z = zonas.de_aparelho(aid)
            if z and z.get("total", 0) > 1:
                linhas.append(f"Zona {_e(z['nome'])}: {z['total']} ares iguais mudam juntos")
        except Exception:  # noqa: BLE001
            pass
        if not transmissor.agente_online() or not hub["online"]:
            linhas.append(f"<i>{_e(transmissor.sem_agente())}</i>")
    if aviso:
        linhas.append(f"\n{aviso}")
    lo, hi = a["temp_min"], a["temp_max"]
    marca = lambda atual, k, r: ("· " + r + " ·") if atual == k else r  # noqa: E731
    bt = [[{"text": "Ligar" if not a["ligado"] else "Ligado", "callback_data": f"l:{aid}"}, {"text": "Desligar", "callback_data": f"d:{aid}"}],
          [{"text": "−1°", "callback_data": f"t:{aid}:{max(lo, t - 1)}"}, {"text": f"{t}°", "callback_data": f"a:{aid}"}, {"text": "+1°", "callback_data": f"t:{aid}:{min(hi, t + 1)}"}],
          [{"text": f"{x}°", "callback_data": f"t:{aid}:{x}"} for x in (18, 20, 22, 23, 24, 26) if lo <= x <= hi],
          [{"text": marca(modo, k, r), "callback_data": f"o:{aid}:{k}"} for k, r in (("frio", "Frio"), ("quente", "Quente"), ("ventilar", "Vent."), ("seco", "Seco"), ("auto", "Auto"))],
          [{"text": marca(vent, k, r), "callback_data": f"v:{aid}:{k}"} for k, r in (("auto", "Vent. auto"), ("baixa", "Baixa"), ("media", "Média"), ("alta", "Alta"))],
          [{"text": f"Desligar em {r}", "callback_data": f"p:{aid}:{m}"} for m, r in ((30, "30 min"), (60, "1 h"), (120, "2 h"))]
          + ([{"text": "Sem timer", "callback_data": f"pc:{aid}"}] if timer else []),
          [{"text": "Diagnóstico", "callback_data": f"xs:diagnostico:{aid}"}, {"text": "Histórico", "callback_data": f"xs:historico:{aid}"}, {"text": "Favoritar", "callback_data": f"fv:{aid}"}],
          [{"text": "Atualizar", "callback_data": f"a:{aid}"}, {"text": "Voltar", "callback_data": "m:ares"}, {"text": "Menu", "callback_data": "m:menu"}]]
    bt = [r for r in bt if r]
    _enviar(cid, "\n".join(linhas), bt, editar)


def _aplicar(cid, aid, editar=None, **estado):
    from . import acesso, clima
    _pode("aparelhos.controlar")
    acesso.checar_aparelho(aid)
    a = clima.aparelho(aid)
    acesso.checar_projeto(a["projeto_id"]) if acesso.projetos_permitidos() is not None else None
    if estado.get("ligado") is None and any(k in estado for k in ("modo", "temperatura", "ventilador")):
        estado["ligado"] = True
    try:
        r = clima.aplicar(aid, "telegram", **estado)
    except Exception as e:  # noqa: BLE001
        return _painel_ar(cid, aid, editar, aviso=f"Não foi: {_e(str(e)[:300])}")
    extra = ""
    if r.get("juntos"):
        nomes = [x["nome"] for x in db.consultar(f"SELECT nome FROM aparelhos WHERE id IN ({','.join('?' * len(r['juntos']))})", tuple(r["juntos"]))]
        extra = f" Mudou junto: {_e(', '.join(nomes))}."
    via = {"local": "pela rede do escritório", "agente": "pelo agente do escritório", "nuvem": "pela nuvem"}.get(r.get("via"), "")
    feito = "Desligado" if estado.get("ligado") is False else f"Enviado: {_e(clima.MODOS.get(r['modo'], r['modo']))} {r['temperatura']}°"
    _painel_ar(cid, aid, editar, aviso=f"<b>{feito}</b> {via}.{extra}")


def _temporizador(cid, aid, minutos, editar=None):
    from . import acesso, automacao
    _pode("aparelhos.controlar")
    acesso.checar_aparelho(aid)
    if minutos:
        automacao.criar_temporizador(aid, int(minutos), {"ligado": False}, "telegram")
        aviso = f"<b>Timer:</b> desliga em {_tempo(int(minutos) * 60)}."
    else:
        db.executar("DELETE FROM temporizadores WHERE aparelho_id = ?", (aid,))
        db.registrar("telegram", "Temporizador cancelado", aparelho_id=aid)
        aviso = "Timer cancelado."
    _painel_ar(cid, aid, editar, aviso=aviso)


def _transmissores(cid, editar=None):
    ares = _ares_visiveis()
    hubs = db.consultar("SELECT id, nome, online, problema, visto_em FROM hubs ORDER BY nome")
    linhas = []
    for h in hubs:
        seus = [a["nome"] for a in ares if a["hub_id"] == h["id"]]
        if not seus and ares and len(ares) < 50:
            continue   # transmissor sem nenhum ar desta pessoa
        visto = f" (visto há {_tempo(db.agora() - h['visto_em'])})" if h["visto_em"] and not h["online"] else ""
        linhas.append(f"<b>{_e(h['nome'])}</b>: {'online' if h['online'] else 'sem contato'}{visto}"
                      + (f"\n  {_e(h['problema'])}" if h["problema"] and not h["online"] else "")
                      + (f"\n  Atende: {_e(', '.join(seus))}" if seus else ""))
    sem = [a["nome"] for a in ares if not a["hub_id"]]
    if sem:
        linhas.append(f"<b>Sem transmissor</b>: {_e(', '.join(sem))}")
    _enviar(cid, "\n\n".join(linhas) or "Nenhum transmissor.", [[{"text": "Agentes", "callback_data": "m:agentes"}, {"text": "Atualizar", "callback_data": "m:tx"}],
                                                                  [{"text": "Menu", "callback_data": "m:menu"}]], editar)


def _agentes(cid, editar=None):
    from . import coordenador, transmissor
    try:
        maqs = coordenador.maquinas()
    except Exception:  # noqa: BLE001
        maqs = []
    try:
        pref = coordenador.preferido()
    except Exception:  # noqa: BLE001
        pref = None
    linhas = []
    for m in maqs:
        m["preferido"] = m.get("id") == pref
        papel = "no comando" if m.get("principal") else "reserva"
        linhas.append(f"<b>{_e(m.get('nome'))}</b> · {'online' if m.get('online') else 'offline'} · {papel}"
                      + (" · preferido" if m.get("preferido") else "")
                      + f"\n  Enxerga {m.get('ve_transmissores') or 0} de {m.get('total_transmissores') or 0} transmissor(es)")
    aviso = "" if any(m.get("principal") and m.get("ve_transmissores") for m in maqs) else f"\n\n<i>{_e(transmissor.sem_agente())}</i>"
    _enviar(cid, ("\n\n".join(linhas) or "Nenhum computador com o agente.") + aviso,
            [[{"text": "Transmissores", "callback_data": "m:tx"}, {"text": "Atualizar", "callback_data": "m:agentes"}],
             [{"text": "Abrir no painel", "url": f"{APP}/infra?aba=agentes"}], [{"text": "Menu", "callback_data": "m:menu"}]], editar)


# ---------------- IA (NVIDIA) por texto livre ----------------
def _historico(cid, nova: list | None = None, limpar=False) -> list:
    h = db.cfg("telegram_ia") or {}
    if limpar:
        h.pop(cid, None)
    elif nova is not None:
        h[cid] = nova[-12:]
    else:
        return h.get(cid) or []
    db.set_cfg("telegram_ia", h)
    return h.get(cid) or []


def _md_html(t: str) -> str:
    import re
    t = _e(t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"^#{1,4}\s*(.+)$", r"<b>\1</b>", t, flags=re.M)
    return t


def _ia(cid, texto, u):
    from . import ia
    if (ia.cfg().get("telegram") is False) or not ia.chave():
        return _enviar(cid, "A conversa com a IA está desligada. Use os botões:", _menu())
    try:
        chamar("sendChatAction", chat_id=cid, action="typing")
    except Exception:  # noqa: BLE001
        pass
    hist = _historico(cid) + [{"role": "user", "content": texto[:2000]}]
    try:
        r = ia.conversar(hist, "telegram", origem="telegram")
    except Exception as e:  # noqa: BLE001
        return _enviar(cid, f"A IA não respondeu: {_e(str(e)[:250])}", _menu())
    _historico(cid, hist + [{"role": "assistant", "content": r["texto"][:2000]}])
    partes = [_md_html(r["texto"])]
    bt = []
    for c in r.get("confirmacoes") or []:
        bt.append([{"text": f"Confirmar: {c['descricao']}"[:60], "callback_data": f"i:{c['confirmacao']}"}])
    bt.append([{"text": "Ares", "callback_data": "m:ares"}, {"text": "Status", "callback_data": "m:status"}, {"text": "Menu", "callback_data": "m:menu"}])
    _enviar(cid, "\n".join(partes), bt)


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
    from . import telegram_cmds
    ctx = telegram_cmds.Ctx(cid, u, mid)
    if tipo == "k":   # página de uma categoria
        cat, _, pag = arg.partition(":")
        t, bt = telegram_cmds.pagina_categoria(ctx, cat, int(pag or 0))
        return _enviar(cid, t, bt, mid)
    if tipo == "kp":   # página da grade de categorias
        n = int(arg or 0) if str(arg or "0").isdigit() else 0
        return _enviar(cid, f"<b>{len(telegram_cmds.C)} comandos</b> em {len(telegram_cmds.CATS)} categorias. Escolha:", telegram_cmds._grade_categorias(n), mid)
    if tipo == "x":   # executa um comando do catálogo (x:nome ou x:nome:argumentos)
        nome, _, args = arg.partition(":")
        return telegram_cmds.executar(ctx, nome, args)
    if tipo == "xs":   # comando com o item escolhido na lista (xs:nome:id[:resto])
        nome, _, r2 = arg.partition(":")
        ent, _, args = r2.partition(":")
        return telegram_cmds.executar(ctx, nome, args, ent_id=ent)
    if tipo == "xt":
        return telegram_cmds.executar(ctx, "transmissor", (db.um("SELECT nome FROM hubs WHERE id = ?", (arg,)) or {}).get("nome", ""))
    if tipo == "fv":   # favoritar pelo painel do ar
        return telegram_cmds.executar(ctx, "fav", "", ent_id=arg)
    if tipo == "m":
        fn = {"menu": lambda: _enviar(cid, *telegram_cmds.menu_principal(ctx), mid), "status": lambda: _status(cid, mid), "ares": lambda: _lista_ares(cid, mid),
              "ligados": lambda: _lista_ares(cid, mid, so_ligados=True), "tx": lambda: _transmissores(cid, mid), "agentes": lambda: _agentes(cid, mid),
              "ia": lambda: telegram_cmds.executar(ctx, "ia", ""),
              "cenas": lambda: _cenas(cid, mid), "luzes": lambda: _luzes(cid, mid), "notif": lambda: _notificacoes(cid, mid), "rel": lambda: _relatorio(cid, mid),
              "desligartodos": lambda: _pedir_confirmacao(cid, "desligartodos", None, "Desligar <b>todos</b> os ares ligados que você controla?")}.get(arg)
        return fn() if fn else None
    if tipo == "a":
        return _painel_ar(cid, int(arg), mid)
    if tipo in ("l", "d"):
        return _aplicar(cid, int(arg), mid, ligado=(tipo == "l"))
    if tipo == "t":
        aid, graus = arg.split(":")
        return _aplicar(cid, int(aid), mid, temperatura=int(graus))
    if tipo == "o":
        aid, modo = arg.split(":")
        return _aplicar(cid, int(aid), mid, modo=modo)
    if tipo == "v":
        aid, vent = arg.split(":")
        return _aplicar(cid, int(aid), mid, ventilador=vent)
    if tipo == "p":
        aid, minutos = arg.split(":")
        return _temporizador(cid, int(aid), int(minutos), mid)
    if tipo == "pc":
        return _temporizador(cid, int(arg), 0, mid)
    if tipo == "i":   # confirmação de ação em lote pedida pela IA
        from . import ia
        try:
            r = ia.confirmar(arg, "telegram")
            return _enviar(cid, _e(r["texto"]), _menu())
        except Exception as e:  # noqa: BLE001
            return _enviar(cid, _e(str(e)[:200]), _menu())
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
        if p["acao"] == "cmd":
            v = p["valor"] or {}
            return telegram_cmds.executar(telegram_cmds.Ctx(cid, u, None, confirmado=True), v.get("nome", ""), v.get("args", ""), ent_id=v.get("id"))
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


def _pin(cid, quem, u, pin):
    e = _estado()
    agora = time.time()
    if not tem_pin(u["id"]):
        return _enviar(cid, "Você ainda não tem PIN. Defina no painel: app.zynio.com.br → Telegram → PIN dos comandos críticos.")
    if conferir_pin(u["id"], pin):
        e["pin_ok"][str(cid)] = agora + PIN_MIN * 60; e["pin_erros"].pop(str(cid), None); _salvar_estado(e)
        auditar(cid, quem, "pin_ok", "", True, u)
        return _enviar(cid, f"PIN conferido: comandos críticos liberados por {PIN_MIN} minutos nesta conversa.", _menu())
    n = int(e["pin_erros"].get(str(cid), 0)) + 1
    e["pin_erros"][str(cid)] = n
    if n >= PIN_ERROS:
        e["bloqueios"][str(cid)] = {"falhas": n, "em": agora, "ate": agora + 86400, "motivo": "pin"}
        from . import firewall, notificacoes
        firewall.registrar(f"telegram:{cid}", "telegram_pin", "/api/telegram/webhook", f"{n} PINs errados · @{quem.get('username') or '-'}")
        notificacoes.notificar(f"telegram:pin:{cid}", "seguranca", "alta", "PIN do Telegram errado 5 vezes",
                               f"A conversa de {u.get('nome') or u.get('email')} no Telegram ficou bloqueada por 24 h.", "/seguranca?aba=telegram")
    _salvar_estado(e)
    auditar(cid, quem, "pin_errado", f"tentativa {n}", False, u)
    return _enviar(cid, "PIN incorreto." + (" Conversa bloqueada por 24 h." if n >= PIN_ERROS else f" Restam {PIN_ERROS - n} tentativa(s)."))

