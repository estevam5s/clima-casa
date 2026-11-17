"""E-mail transacional pelo Resend (com o domínio no DNS da Cloudflare).

- Envio: POST https://api.resend.com/emails com a chave de ENVIO (config.email, cifrada). Cada envio fica em
  email_envios (destino, tipo, assunto, id do Resend, estado e eventos que chegam pelo webhook).
- Modelos: recuperar a senha, senha alterada, boas-vindas/convite (link para criar a senha), acesso por IP novo,
  senha redefinida pelo administrador, alerta do sistema e teste. HTML em tabelas (compatível com Gmail/Outlook),
  logo da marca, botão "à prova de Outlook", versão em texto puro e texto de prévia.
- Domínio: verificação pública do DNS (DNS sobre HTTPS da Cloudflare, sem chave nenhuma); com uma chave do Resend
  de acesso total e um token da Cloudflare (só DNS da zona), cadastra o domínio, cria os registros e verifica sozinho.
- Enquanto o domínio não está verificado, o Resend só entrega para o e-mail da própria conta: quem chama tem um
  plano B (ex.: o "esqueci a senha" volta para o envio do Supabase).
"""
import base64
import hashlib
import hmac
import html
import json
import logging
import time
import uuid

import httpx

from . import db

log = logging.getLogger("clima.correio")
RESEND = "https://api.resend.com"
DOMINIO = "zynio.com.br"
APP = "https://app.zynio.com.br"
SITE = "https://zynio.com.br"
AUTOMATICOS = {"recuperar_senha": True, "senha_alterada": True, "boas_vindas": True, "acesso_novo": True, "senha_redefinida": True, "alerta": False}


# ---------------- configuração ----------------
def cfg() -> dict:
    return db.cfg("email") or {}


def salvar_cfg(c: dict):
    db.set_cfg("email", c)


def marca() -> dict:
    w = db.cfg("white_label") or {}
    return {"nome": w.get("nome") or "Clima Escritório", "cor": (w.get("cor_primaria") or "#0f766a"), "logo": f"{APP}/icone-192.png",
            "slogan": w.get("slogan") or "O ar do escritório no ponto certo, antes de você chegar."}


def dominio_verificado() -> bool:
    return (cfg().get("dominio") or {}).get("status") == "verified"


def remetente() -> str:
    c, m = cfg(), marca()
    if dominio_verificado():
        return f'{c.get("remetente_nome") or m["nome"]} <{c.get("remetente_local") or "nao-responda"}@{DOMINIO}>'
    return f'{c.get("remetente_nome") or m["nome"]} <onboarding@resend.dev>'   # teste do Resend: só entrega para a conta dona


def automatico(tipo: str) -> bool:
    return bool({**AUTOMATICOS, **(cfg().get("automaticos") or {})}.get(tipo))


# ---------------- modelos ----------------
def _e(t) -> str:
    return html.escape(str(t or ""))


def _base(titulo: str, previa: str, blocos: list[str], m: dict, rodape_motivo: str) -> str:
    cor = m["cor"]
    return f'''<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>{_e(titulo)}</title>
<style>
body{{margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%}}
a{{color:{cor}}}
@media (max-width:620px){{.conteudo{{padding:24px 20px!important}} .card{{width:100%!important}}}}
@media (prefers-color-scheme:dark){{body,.fundo{{background:#0b0f14!important}} .card{{background:#111827!important;border-color:#1f2937!important}} .t{{color:#f3f4f6!important}} .s{{color:#9ca3af!important}} .caixa{{background:#0f172a!important;border-color:#1f2937!important}}}}
</style></head>
<body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{_e(previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fundo" style="background:#f3f4f6"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<tr><td style="height:4px;background:{cor};font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:28px 40px 0 40px" class="conteudo">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle"><img src="{m["logo"]}" width="40" height="40" alt="{_e(m["nome"])}" style="display:block;border:0;border-radius:10px"></td>
<td style="vertical-align:middle;padding-left:12px;font:600 16px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827" class="t">{_e(m["nome"])}</td></tr></table>
</td></tr>
<tr><td style="padding:24px 40px 32px 40px;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#374151" class="conteudo s">
<h1 class="t" style="margin:0 0 12px 0;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">{_e(titulo)}</h1>
{"".join(blocos)}
</td></tr>
<tr><td style="padding:20px 40px 28px 40px;border-top:1px solid #f3f4f6;font:400 12px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#6b7280" class="conteudo s">
{_e(rodape_motivo)}<br>{_e(m["nome"])} · <a href="{APP}" style="color:#6b7280">app.zynio.com.br</a> · <a href="{SITE}/contato" style="color:#6b7280">Suporte</a><br>
Este é um e-mail automático; respostas a este endereço não são lidas.
</td></tr></table>
<p style="margin:16px 0 0 0;font:400 11px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#9ca3af">{_e(m["slogan"])}</p>
</td></tr></table></body></html>'''


def _p(texto: str) -> str:
    return f'<p style="margin:0 0 14px 0">{texto}</p>'


def _botao(rotulo: str, url: str, cor: str) -> str:
    return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td align="center" bgcolor="{cor}" style="border-radius:8px">'
            f'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{_e(url)}" style="height:44px;v-text-anchor:middle;width:260px" arcsize="18%" fillcolor="{cor}" stroke="f"><center style="color:#ffffff;font:600 15px Arial">{_e(rotulo)}</center></v:roundrect><![endif]-->'
            f'<!--[if !mso]><!--><a href="{_e(url)}" target="_blank" style="display:inline-block;padding:12px 26px;font:600 15px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px;background:{cor}">{_e(rotulo)}</a><!--<![endif]-->'
            '</td></tr></table>')


def _caixa(linhas: list[tuple[str, str]]) -> str:
    itens = "".join(f'<tr><td style="padding:4px 0;color:#6b7280;width:120px;vertical-align:top" class="s">{_e(k)}</td><td style="padding:4px 0;color:#111827;font-weight:500" class="t">{_e(v)}</td></tr>' for k, v in linhas if v)
    return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="caixa" style="margin:6px 0 18px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px"><tr><td style="padding:12px 16px;font:400 13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{itens}</table></td></tr></table>'


def _link_bruto(url: str) -> str:
    return f'<p style="margin:0 0 14px 0;font-size:12px;color:#6b7280" class="s">Se o botão não abrir, copie e cole no navegador:<br><a href="{_e(url)}" style="word-break:break-all;color:#6b7280">{_e(url)}</a></p>'


def _alerta_cor(texto: str) -> str:
    return f'<p style="margin:0 0 14px 0;padding:10px 14px;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:13px;border-radius:4px">{texto}</p>'


def _quando(ts=None) -> str:
    return time.strftime("%d/%m/%Y às %H:%M", time.gmtime((ts or time.time()) - 3 * 3600)) + " (Brasília)"


MODELOS = {
    "recuperar_senha": "Recuperar a senha",
    "boas_vindas": "Boas-vindas e criar a senha",
    "senha_alterada": "Senha alterada",
    "senha_redefinida": "Senha redefinida pelo administrador",
    "acesso_novo": "Acesso por um IP novo",
    "alerta": "Alerta do sistema",
    "teste": "Teste da conexão",
}

EXEMPLO = {"nome": "Deison", "email": "deison@exemplo.com.br", "link": f"{APP}/redefinir-senha#exemplo", "ip": "177.74.175.96", "local": "Florianópolis, BR",
           "dispositivo": "Chrome no macOS", "titulo": "Ar do escritório ligado há 12 horas", "detalhe": "Ligado desde as 08:02. Confira se alguém esqueceu ligado.",
           "gravidade": "alta", "por": "Estevam (dono)", "papel": "Administrador", "convidado_por": "Estevam"}


def montar(tipo: str, d: dict) -> tuple[str, str, str]:
    """(assunto, html, texto) do modelo."""
    m = marca(); cor = m["cor"]
    nome = d.get("nome") or ""
    ola = f"Olá{', ' + _e(nome.split()[0]) if nome else ''},"
    if tipo == "recuperar_senha":
        assunto = f"Redefinir a sua senha no {m['nome']}"
        blocos = [_p(ola), _p(f"Recebemos um pedido para criar uma senha nova para a conta <b>{_e(d.get('email'))}</b>. Clique no botão para escolher a senha nova. O link vale por <b>1 hora</b> e só funciona uma vez."),
                  _botao("Criar senha nova", d["link"], cor), _caixa([("Pedido feito", _quando()), ("IP", d.get("ip")), ("Local", d.get("local")), ("Navegador", d.get("dispositivo"))]),
                  _alerta_cor("Não foi você? Ignore este e-mail: a sua senha atual continua valendo. Se receber vários pedidos que não fez, avise o administrador."), _link_bruto(d["link"])]
        texto = f"{ola}\n\nPara criar uma senha nova para {d.get('email')}, abra (vale 1 hora, uma vez):\n{d['link']}\n\nPedido em {_quando()} · IP {d.get('ip', '')}\nNão foi você? Ignore: a senha atual continua valendo."
        motivo = "Você recebeu este e-mail porque alguém pediu para redefinir a senha desta conta."
        previa = "Link para criar uma senha nova (vale 1 hora)."
    elif tipo == "boas_vindas":
        assunto = f"Seu acesso ao {m['nome']} está pronto"
        blocos = [_p(ola), _p(f"{_e(d.get('convidado_por') or 'O administrador')} criou o seu acesso ao <b>{_e(m['nome'])}</b>, o painel que controla os ares-condicionados do escritório (pelo site, pelo celular e pela Alexa)."),
                  _caixa([("E-mail de acesso", d.get("email")), ("Nível", d.get("papel"))]),
                  _p("Para começar, crie a sua senha. O link vale por 24 horas:"), _botao("Criar minha senha", d["link"], cor),
                  _p(f"Depois é só entrar em <a href=\"{APP}\">app.zynio.com.br</a>. Recomendamos ativar a verificação em duas etapas em <b>Configurações → Segurança</b>."), _link_bruto(d["link"])]
        texto = f"{ola}\n\nSeu acesso ao {m['nome']} foi criado ({d.get('email')}, {d.get('papel', '')}).\nCrie a sua senha (vale 24 h):\n{d['link']}\n\nDepois entre em {APP}."
        motivo = "Você recebeu este e-mail porque um administrador criou um acesso para você."
        previa = "Crie a sua senha e comece a usar o painel."
    elif tipo == "senha_alterada":
        assunto = f"A senha da sua conta no {m['nome']} foi alterada"
        blocos = [_p(ola), _p(f"A senha da conta <b>{_e(d.get('email'))}</b> acabou de ser alterada."), _caixa([("Quando", _quando()), ("IP", d.get("ip")), ("Local", d.get("local")), ("Navegador", d.get("dispositivo"))]),
                  _alerta_cor("Não foi você? Peça uma senha nova agora em “Esqueci a senha” e avise o administrador: alguém pode ter acesso à sua conta."),
                  _botao("Abrir o painel", APP, cor)]
        texto = f"{ola}\n\nA senha de {d.get('email')} foi alterada em {_quando()}.\nNão foi você? Use 'Esqueci a senha' em {APP} e avise o administrador."
        motivo = "Aviso de segurança enviado sempre que a senha da conta muda."
        previa = "Aviso de segurança: a senha foi alterada."
    elif tipo == "senha_redefinida":
        assunto = f"Sua senha no {m['nome']} foi redefinida pelo administrador"
        blocos = [_p(ola), _p(f"{_e(d.get('por') or 'Um administrador')} redefiniu a senha da conta <b>{_e(d.get('email'))}</b>. A senha nova vai ser passada a você por ele, por um canal seguro (nunca por e-mail)."),
                  _p("Ao entrar, troque por uma senha só sua. Se preferir, crie uma agora:"), _botao("Criar minha senha", d.get("link") or APP, cor),
                  _caixa([("Quando", _quando()), ("Feito por", d.get("por"))])]
        texto = f"{ola}\n\n{d.get('por') or 'Um administrador'} redefiniu a senha de {d.get('email')} em {_quando()}.\nCrie uma senha sua: {d.get('link') or APP}"
        motivo = "Aviso de segurança enviado quando um administrador muda a sua senha."
        previa = "Um administrador redefiniu a sua senha."
    elif tipo == "acesso_novo":
        assunto = f"Novo acesso à sua conta no {m['nome']}"
        blocos = [_p(ola), _p("A sua conta entrou a partir de um endereço (IP) que não víamos há pelo menos 30 dias."),
                  _caixa([("Quando", _quando()), ("IP", d.get("ip")), ("Local", d.get("local")), ("Navegador", d.get("dispositivo"))]),
                  _p("Se foi você, não precisa fazer nada."), _alerta_cor("Não reconhece? Troque a senha agora e encerre as outras sessões em Configurações → Segurança."),
                  _botao("Revisar a segurança", f"{APP}/configuracoes", cor)]
        texto = f"{ola}\n\nNovo acesso em {_quando()} · IP {d.get('ip', '')} · {d.get('local', '')} · {d.get('dispositivo', '')}.\nNão foi você? Troque a senha em {APP}/configuracoes."
        motivo = "Aviso de segurança enviado quando a conta entra por um IP novo."
        previa = f"Entrada pelo IP {d.get('ip', '')}."
    elif tipo == "alerta":
        g = d.get("gravidade") or "media"
        cor_g = {"critica": "#dc2626", "alta": "#ea580c", "media": "#d97706"}.get(g, cor)
        assunto = f"[{m['nome']}] {d.get('titulo')}"
        blocos = [f'<p style="margin:0 0 10px 0"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:{cor_g};color:#fff;font-size:12px;font-weight:600">Alerta {_e(g)}</span></p>',
                  _p(f"<b>{_e(d.get('titulo'))}</b>"), _p(_e(d.get("detalhe"))), _caixa([("Quando", _quando())]), _botao("Ver no painel", APP + (d.get("link") or ""), cor)]
        texto = f"{d.get('titulo')}\n{d.get('detalhe', '')}\n{_quando()}\n{APP}{d.get('link') or ''}"
        motivo = "Você recebe alertas do sistema porque é administrador. Ajuste em E-mails → Automáticos."
        previa = str(d.get("detalhe") or "")[:90]
    else:   # teste
        assunto = f"Teste de e-mail do {m['nome']}"
        blocos = [_p(ola), _p("Se você está lendo isto, o envio de e-mails pelo Resend está funcionando. 🎉"),
                  _caixa([("Enviado", _quando()), ("Remetente", remetente()), ("Domínio", DOMINIO + (" (verificado)" if dominio_verificado() else " (ainda não verificado)"))]),
                  _botao("Abrir o painel", f"{APP}/emails", cor)]
        texto = f"{ola}\n\nTeste de envio pelo Resend em {_quando()}. Remetente: {remetente()}"
        motivo = "E-mail de teste enviado pela tela E-mails do painel."
        previa = "O envio de e-mails está funcionando."
    return assunto, _base(assunto if tipo != "teste" else "Teste de envio", previa, blocos, m, motivo), texto


# ---------------- envio ----------------
def _chave() -> str | None:
    return cfg().get("api_key")


def configurado() -> bool:
    return bool(_chave())


def enviar(para: str, tipo: str, dados: dict | None = None, assunto: str | None = None, html_: str | None = None, texto: str | None = None) -> dict:
    """Manda e registra. Lança RuntimeError com o motivo se falhar."""
    chave = _chave()
    if not chave:
        raise RuntimeError("Resend não configurado.")
    if not assunto:
        assunto, html_, texto = montar(tipo, dados or {})
    c = cfg()
    corpo = {"from": remetente(), "to": [para], "subject": assunto, "html": html_, "text": texto,
             "tags": [{"name": "tipo", "value": tipo}], **({"reply_to": c["responder_para"]} if c.get("responder_para") else {})}
    agora = db.agora()
    linha = db.um("INSERT INTO email_envios (tipo, para, assunto, estado, criado_em, atualizado_em) VALUES (?,?,?,'enviando',?,?) RETURNING id", (tipo, para, assunto[:200], agora, agora))
    try:
        r = httpx.post(f"{RESEND}/emails", json=corpo, timeout=15, headers={"Authorization": f"Bearer {chave}", "Idempotency-Key": f"{tipo}-{linha['id']}-{uuid.uuid4().hex[:8]}"})
        if r.status_code >= 300:
            try:
                msg = r.json().get("message") or r.text
            except ValueError:
                msg = r.text
            if "testing emails" in str(msg).lower() or "verify a domain" in str(msg).lower():
                msg = "Domínio ainda não verificado no Resend: por enquanto só dá para enviar para o e-mail da conta do Resend."
            raise RuntimeError(str(msg)[:300])
        rid = r.json().get("id")
        db.executar("UPDATE email_envios SET resend_id = ?, estado = 'enviado', atualizado_em = ? WHERE id = ?", (rid, db.agora(), linha["id"]))
        return {"id": linha["id"], "resend_id": rid}
    except Exception as e:
        db.executar("UPDATE email_envios SET estado = 'falhou', erro = ?, atualizado_em = ? WHERE id = ?", (str(e)[:300], db.agora(), linha["id"]))
        raise RuntimeError(str(e)) from e


def enviar_quieto(para: str, tipo: str, dados: dict) -> bool:
    """Para avisos automáticos: nunca derruba quem chamou."""
    if not configurado() or not automatico(tipo) or not para:
        return False
    try:
        recentes = db.um("SELECT COUNT(*) AS n FROM email_envios WHERE para = ? AND tipo = ? AND criado_em > ?", (para, tipo, db.agora() - 3600))
        if recentes and recentes["n"] >= 5:   # limite por destino e tipo, contra abuso
            return False
        enviar(para, tipo, dados)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("e-mail %s para %s falhou: %s", tipo, para, e)
        return False


def contexto(request) -> dict:
    """IP, cidade/país (cabeçalhos da Vercel) e navegador resumido, para os avisos de segurança."""
    from urllib.parse import unquote
    from . import firewall
    ua = request.headers.get("user-agent", "")
    nav = next((n for n in ("Edg", "OPR", "Chrome", "Firefox", "Safari") if n in ua), "Navegador")
    so = next((s for s, k in (("Windows", "Windows"), ("macOS", "Mac OS"), ("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"), ("Linux", "Linux")) if k in ua), "")
    nav = {"Edg": "Edge", "OPR": "Opera"}.get(nav, nav)
    local = ", ".join(x for x in (unquote(request.headers.get("x-vercel-ip-city", "")), request.headers.get("x-vercel-ip-country", "")) if x)
    return {"ip": firewall.ip_do_pedido(request), "local": local, "dispositivo": f"{nav}{' no ' + so if so else ''}"}


def avisar_admins(titulo: str, detalhe: str, gravidade: str, link: str = ""):
    """Alerta por e-mail para dono e administradores (se ligado), no máximo 1 por título a cada 6 h."""
    if not configurado() or not automatico("alerta") or gravidade not in ("critica", "alta"):
        return
    if db.um("SELECT 1 FROM email_envios WHERE tipo = 'alerta' AND assunto LIKE ? AND criado_em > ?", (f"%{titulo[:80]}%", db.agora() - 6 * 3600)):
        return
    for u in db.consultar("SELECT email, nome FROM usuarios WHERE ativo = true AND papel IN ('dono','admin')"):
        enviar_quieto(u["email"], "alerta", {"nome": u.get("nome"), "titulo": titulo, "detalhe": detalhe, "gravidade": gravidade, "link": link})


# ---------------- links do Supabase Auth ----------------
def link_auth(tipo: str, email: str, voltar_para: str) -> str | None:
    """Link de recuperação/convite gerado pela API de administração do Supabase (não envia nada)."""
    chave = db.ENV.get("SUPABASE_SECRET_KEY")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/admin/generate_link", timeout=12, headers={"apikey": chave, "Authorization": f"Bearer {chave}"},
                   json={"type": tipo, "email": email, "redirect_to": voltar_para})
    if r.status_code >= 300:
        return None
    j = r.json()
    return j.get("action_link") or (j.get("properties") or {}).get("action_link")


def recuperar_senha(email: str, voltar_para: str, contexto: dict) -> bool:
    """True se mandou pelo Resend (com o link do Supabase); False para o chamador usar o envio do Supabase."""
    if not configurado() or not automatico("recuperar_senha") or not dominio_verificado():
        return False
    u = db.um("SELECT nome FROM usuarios WHERE lower(email) = ?", (email.lower(),))
    if not u:
        return True   # não existe: não manda nada, mas responde igual (não revela quem tem conta)
    link = link_auth("recovery", email, voltar_para)
    if not link:
        return False
    return enviar_quieto(email, "recuperar_senha", {**contexto, "email": email, "nome": u.get("nome"), "link": link})


# ---------------- domínio (Resend + Cloudflare) ----------------
def dns_publico() -> list[dict]:
    """Registros que o Resend pede, conferidos no DNS público (sem chave): DKIM, subdomínios de envio e DMARC.

    Desde nov/2026 o Resend ("Forge") pede CNAME `send` → send.forge.rmta.net e CNAME `rsend` → rsend-<região>.forge.rmta.net
    no lugar do MX + TXT (SPF) em `send`. Os dois formatos contam como encontrado."""
    def q(nome, tipo):
        try:
            r = httpx.get("https://cloudflare-dns.com/dns-query", params={"name": nome, "type": tipo}, headers={"accept": "application/dns-json"}, timeout=8)
            return [a.get("data", "").strip('"') for a in r.json().get("Answer", []) if a.get("type") in (16, 15, 5)]
        except Exception:  # noqa: BLE001
            return []
    def envio(nome):
        r = q(nome, "CNAME") or q(nome, "MX")
        return {"ok": any("rmta.net" in x or "amazonses.com" in x for x in r), "valor": (r or [""])[0]}
    dkim = q(f"resend._domainkey.{DOMINIO}", "TXT")
    dmarc = q(f"_dmarc.{DOMINIO}", "TXT")
    send, rsend = envio(f"send.{DOMINIO}"), envio(f"rsend.{DOMINIO}")
    return [
        {"nome": f"resend._domainkey.{DOMINIO}", "tipo": "TXT", "para": "DKIM (assinatura)", "ok": any("p=" in x for x in dkim), "valor": (dkim or [""])[0][:60]},
        {"nome": f"send.{DOMINIO}", "tipo": "CNAME", "para": "Envio e retorno de devoluções (SPF)", **send},
        {"nome": f"rsend.{DOMINIO}", "tipo": "CNAME", "para": "Envio pela região São Paulo (SPF)", **rsend},
        {"nome": f"_dmarc.{DOMINIO}", "tipo": "TXT", "para": "DMARC (política)", "ok": any("v=DMARC1" in x for x in dmarc), "valor": (dmarc or [""])[0]},
    ]


def _resend_total(metodo, caminho, **kw):
    chave = cfg().get("api_key_total")
    if not chave:
        raise RuntimeError("Falta a chave do Resend com acesso total (Conexões).")
    r = httpx.request(metodo, f"{RESEND}{caminho}", headers={"Authorization": f"Bearer {chave}"}, timeout=20, **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"Resend: {r.json().get('message') if r.content else r.status_code}")
    return r.json() if r.content else {}


def _cf(metodo, caminho, **kw):
    tok = cfg().get("cloudflare_token")
    if not tok:
        raise RuntimeError("Falta o token da Cloudflare (Conexões).")
    r = httpx.request(metodo, f"https://api.cloudflare.com/client/v4{caminho}", headers={"Authorization": f"Bearer {tok}"}, timeout=20, **kw)
    j = r.json()
    if not j.get("success"):
        raise RuntimeError("Cloudflare: " + "; ".join(e.get("message", "") for e in j.get("errors", [])) or str(r.status_code))
    return j.get("result")


def atualizar_dominio() -> dict:
    """Lê o domínio no Resend (precisa da chave total) e guarda o estado."""
    c = cfg()
    dom = c.get("dominio") or {}
    if not dom.get("id"):
        lista = _resend_total("GET", "/domains").get("data", [])
        achado = next((x for x in lista if x["name"] == DOMINIO), None)
        if not achado:
            return {}
        dom["id"] = achado["id"]
    det = _resend_total("GET", f"/domains/{dom['id']}")
    dom.update({"id": det["id"], "status": det.get("status"), "regiao": det.get("region"), "registros": det.get("records", []), "lido_em": db.agora()})
    c["dominio"] = dom; salvar_cfg(c)
    return dom


def provisionar() -> dict:
    """Cadastra o domínio no Resend (se faltar), cria os registros na Cloudflare e pede a verificação."""
    passos = []
    c = cfg()
    dom = atualizar_dominio()
    if not dom:
        novo = _resend_total("POST", "/domains", json={"name": DOMINIO, "region": "sa-east-1"})
        c = cfg(); c["dominio"] = {"id": novo["id"], "status": novo.get("status"), "registros": novo.get("records", [])}; salvar_cfg(c)
        dom = c["dominio"]; passos.append("Domínio cadastrado no Resend (região São Paulo).")
    else:
        passos.append(f"Domínio já existe no Resend ({dom.get('status')}).")
    if cfg().get("cloudflare_token"):
        zona = (_cf("GET", "/zones", params={"name": DOMINIO}) or [None])[0]
        if not zona:
            raise RuntimeError(f"A zona {DOMINIO} não aparece para esse token da Cloudflare.")
        existentes = _cf("GET", f"/zones/{zona['id']}/dns_records", params={"per_page": 500}) or []
        for reg in dom.get("registros", []):
            nome = reg["name"] if reg["name"].endswith(DOMINIO) else f"{reg['name']}.{DOMINIO}"
            tipo, valor = reg["type"], reg["value"]
            if any(e["type"] == tipo and e["name"] == nome and e["content"].strip('"') == valor.strip('"') for e in existentes):
                passos.append(f"{tipo} {nome}: já existia."); continue
            corpo = {"type": tipo, "name": nome, "content": valor, "ttl": 1, "proxied": False, "comment": "Resend (Clima Escritório)"}
            if tipo == "MX":
                corpo["priority"] = int(reg.get("priority") or 10)
            _cf("POST", f"/zones/{zona['id']}/dns_records", json=corpo)
            passos.append(f"{tipo} {nome}: criado na Cloudflare.")
    else:
        passos.append("Sem token da Cloudflare: crie os registros da tabela à mão no painel da Cloudflare.")
    try:
        _resend_total("POST", f"/domains/{dom['id']}/verify"); passos.append("Verificação pedida ao Resend (leva de segundos a alguns minutos).")
    except RuntimeError as e:
        passos.append(str(e))
    db.registrar("sistema", "E-mail: domínio preparado no Resend/Cloudflare", detalhe=" · ".join(passos)[:480])
    return {"passos": passos, "dominio": atualizar_dominio()}


# ---------------- webhook (eventos de entrega) ----------------
ESTADOS = {"email.sent": "enviado", "email.delivered": "entregue", "email.delivery_delayed": "atrasado", "email.bounced": "devolvido",
           "email.complained": "marcado como spam", "email.opened": "aberto", "email.clicked": "clicado", "email.failed": "falhou"}


def webhook_valido(corpo: bytes, cab: dict) -> bool:
    segredo = cfg().get("webhook_secret")
    if not segredo:
        return False
    sid, ts, assinaturas = cab.get("svix-id", ""), cab.get("svix-timestamp", ""), cab.get("svix-signature", "")
    try:
        if abs(time.time() - int(ts)) > 300:
            return False
        chave = base64.b64decode(segredo.split("_", 1)[1] if segredo.startswith("whsec_") else segredo)
    except (ValueError, TypeError):
        return False
    esperado = base64.b64encode(hmac.new(chave, f"{sid}.{ts}.".encode() + corpo, hashlib.sha256).digest()).decode()
    # bytes: cabeçalho com caractere fora do ASCII não derruba a rota (compare_digest de str exige ASCII)
    return any(hmac.compare_digest(esperado.encode(), s.split(",", 1)[1].encode("utf-8", "replace")) for s in assinaturas.split() if "," in s)


def registrar_evento(ev: dict):
    tipo, dados = ev.get("type", ""), ev.get("data") or {}
    rid = dados.get("email_id")
    if not rid:
        return
    estado = ESTADOS.get(tipo)
    linha = db.um("SELECT id, estado, eventos FROM email_envios WHERE resend_id = ?", (rid,))
    if not linha:
        return
    eventos = linha["eventos"] if isinstance(linha["eventos"], list) else json.loads(linha["eventos"] or "[]")
    eventos.append({"tipo": tipo, "quando": db.agora(), **({"motivo": (dados.get("bounce") or {}).get("message")} if tipo == "email.bounced" else {})})
    # não rebaixa: aberto/clicado valem mais que entregue
    ordem = ["enviando", "enviado", "atrasado", "entregue", "aberto", "clicado", "devolvido", "marcado como spam", "falhou"]
    novo = estado if estado and ordem.index(estado) >= ordem.index(linha["estado"] if linha["estado"] in ordem else "enviado") else linha["estado"]
    db.executar("UPDATE email_envios SET estado = ?, eventos = CAST(? AS jsonb), atualizado_em = ? WHERE id = ?", (novo, json.dumps(eventos[-30:]), db.agora(), linha["id"]))
