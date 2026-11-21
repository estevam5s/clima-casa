"""Newsletter do Clima Escritório (Resend): inscrição com confirmação, campanhas com modelos e blocos, geração por IA.

- Inscrição (site → `inscrever`): fica "pendente" e recebe um e-mail de confirmação (dupla confirmação, LGPD). Só quem
  confirmou recebe campanhas. Todo e-mail leva o link de cancelar (e o cabeçalho List-Unsubscribe de um clique).
- Campanha = assunto, prévia, modelo visual e uma lista de blocos (título, texto, imagem, botão, lista, destaque,
  cartões, versão do sistema, divisor). `montar` gera o HTML no padrão dos e-mails do sistema (tabelas, Outlook, modo escuro).
- IA (`gerar_com_ia`): a NVIDIA escreve os blocos a partir de um tema, usando como fatos só as versões reais de
  `novidades.json` e as funcionalidades do sistema (sem números ou promessas inventados).
- Envio: lotes de até 100 pela API de lote do Resend; cada destinatário vira uma linha em `email_envios` (campanha_id) e o
  webhook do Resend atualiza entregue/aberto/clicado. Agendadas saem pelo agente (`ciclo`, chamado na agenda).
"""
from __future__ import annotations

import html
import json
import pathlib
import re
import secrets
import time

import httpx

from . import correio, db

APP, SITE = correio.APP, correio.SITE
MODELOS = {
    "classico": {"nome": "Clássico", "descricao": "Cartão branco com o logo no topo, igual aos e-mails do sistema."},
    "destaque": {"nome": "Destaque", "descricao": "Faixa colorida com o título grande, bom para lançamentos."},
    "escuro": {"nome": "Escuro", "descricao": "Fundo grafite com detalhes verde-limão, no visual do site zynio.com.br."},
    "boletim": {"nome": "Boletim", "descricao": "Edição datada, com seções numeradas, para o resumo do mês."},
    "minimo": {"nome": "Mínimo", "descricao": "Quase só texto, elegante e leve, parece uma carta."},
}
TIPOS_BLOCO = {"titulo", "texto", "imagem", "botao", "lista", "destaque", "cartoes", "versao", "divisor", "espaco"}
_FONTE = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"


def cfg() -> dict:
    c = db.cfg("newsletter") or {}
    return {"remetente_local": c.get("remetente_local") or "novidades", "remetente_nome": c.get("remetente_nome") or f"{correio.marca()['nome']} · Novidades",
            "responder_para": c.get("responder_para") or "contato@zynio.com.br", "boas_vindas": c.get("boas_vindas", True),
            "modelo_padrao": c.get("modelo_padrao") or "classico", "assinatura": c.get("assinatura") or "Equipe Clima Escritório"}


def salvar_cfg(d: dict) -> dict:
    atual = cfg()
    for k in ("remetente_local", "remetente_nome", "responder_para", "boas_vindas", "modelo_padrao", "assinatura"):
        if k in d and d[k] is not None:
            atual[k] = d[k]
    if not re.match(r"^[a-z0-9._-]{1,40}$", str(atual["remetente_local"])):
        raise ValueError("Remetente: só letras minúsculas, números, ponto, hífen e sublinhado.")
    db.set_cfg("newsletter", atual)
    return atual


def remetente() -> str:
    c = cfg()
    if correio.dominio_verificado():
        return f'{c["remetente_nome"]} <{c["remetente_local"]}@{correio.DOMINIO}>'
    return correio.remetente()


# ---------------- inscrição ----------------
def _link_confirmar(token: str) -> str:
    return f"{APP}/api/site/newsletter/confirmar?t={token}"


def _link_sair(token: str) -> str:
    return f"{SITE}/newsletter?sair={token}"


def inscrever(email: str, nome: str = "", idioma: str = "pt", origem: str = "site", pais: str = "", ativo: bool = False) -> dict:
    email = email.strip().lower()
    atual = db.um("SELECT * FROM newsletter_inscritos WHERE email = ?", (email,))
    agora = db.agora()
    if atual and atual["estado"] == "ativo":
        return {"estado": "ativo", "novo": False}
    token = atual["token"] if atual else secrets.token_urlsafe(24)
    estado = "ativo" if ativo else "pendente"
    if atual:
        db.executar("UPDATE newsletter_inscritos SET estado = ?, nome = COALESCE(NULLIF(?, ''), nome), idioma = ?, origem = ?, cancelado_em = NULL, "
                    "confirmado_em = CASE WHEN ? = 'ativo' THEN ? ELSE confirmado_em END WHERE id = ?",
                    (estado, nome.strip()[:80], idioma[:5], origem[:30], estado, agora, atual["id"]))
    else:
        db.executar("INSERT INTO newsletter_inscritos (email, nome, estado, idioma, origem, token, pais, criado_em, confirmado_em) VALUES (?,?,?,?,?,?,?,?,?)",
                    (email, nome.strip()[:80], estado, idioma[:5], origem[:30], token, pais[:4], agora, agora if ativo else None))
    if not ativo and correio.configurado():
        # no máximo 3 confirmações por endereço por dia (ninguém usa o formulário para encher a caixa de outra pessoa)
        n = (db.um("SELECT count(*) AS n FROM email_envios WHERE para = ? AND tipo = 'newsletter_confirmar' AND criado_em > ?", (email, agora - 86400)) or {}).get("n") or 0
        if n < 3:
            assunto, h, t = _email_confirmacao(token)
            try:
                correio.enviar(email, "newsletter_confirmar", assunto=assunto, html_=h, texto=t)
            except RuntimeError:
                pass
    return {"estado": estado, "novo": not atual}


def _email_confirmacao(token: str) -> tuple[str, str, str]:
    m = correio.marca()
    assunto = f"Confirme a sua inscrição nas novidades do {m['nome']}"
    link = _link_confirmar(token)
    blocos = [correio._p("Recebemos um pedido para enviar as novidades do sistema para este endereço: versões novas, recursos e dicas, no máximo algumas vezes por mês."),
              correio._botao("Confirmar inscrição", link, m["cor"]),
              correio._p("Não pediu? Ignore este e-mail: sem a confirmação, nada é enviado."), correio._link_bruto(link)]
    h = correio._base("Confirme a sua inscrição", "Falta um clique para receber as novidades.", blocos, m,
                      "Você recebeu este e-mail porque alguém informou este endereço no formulário de novidades do site.")
    return assunto, h, f"Confirme a inscrição nas novidades do {m['nome']}:\n{link}\n\nNão pediu? Ignore este e-mail."


def confirmar(token: str) -> bool:
    r = db.um("SELECT id, email, estado FROM newsletter_inscritos WHERE token = ?", (token,))
    if not r:
        return False
    if r["estado"] != "ativo":
        db.executar("UPDATE newsletter_inscritos SET estado = 'ativo', confirmado_em = ?, cancelado_em = NULL WHERE id = ?", (db.agora(), r["id"]))
        if cfg()["boas_vindas"] and correio.configurado():
            try:
                assunto, h, t = _email_boas_vindas(token)
                correio.enviar(r["email"], "newsletter_boas_vindas", assunto=assunto, html_=h, texto=t)
            except RuntimeError:
                pass
    return True


def _email_boas_vindas(token: str) -> tuple[str, str, str]:
    v = (_versoes(1) or [{}])[0]
    blocos = [{"tipo": "texto", "texto": "Inscrição confirmada. Você vai receber as versões novas do sistema, os recursos que chegaram e dicas de uso."},
              {"tipo": "destaque", "titulo": f"A versão mais recente: {v.get('versao', '')}", "texto": v.get("titulo", "")},
              {"tipo": "botao", "rotulo": "Ver todas as novidades", "url": f"{SITE}/novidades"}]
    c = {"assunto": "Bem-vindo às novidades do Clima Escritório", "titulo": "Você está na lista", "previa": "Inscrição confirmada.", "modelo": "classico", "blocos": blocos}
    return montar(c, token)


def cancelar(token: str) -> bool:
    r = db.um("SELECT id FROM newsletter_inscritos WHERE token = ?", (token,))
    if not r:
        return False
    db.executar("UPDATE newsletter_inscritos SET estado = 'cancelado', cancelado_em = ? WHERE id = ?", (db.agora(), r["id"]))
    return True


def contagem() -> dict:
    r = db.um("SELECT count(*) FILTER (WHERE estado = 'ativo') AS ativos, count(*) FILTER (WHERE estado = 'pendente') AS pendentes, "
              "count(*) FILTER (WHERE estado = 'cancelado') AS cancelados, count(*) FILTER (WHERE estado = 'devolvido') AS devolvidos, "
              "count(*) FILTER (WHERE criado_em > ?) AS semana FROM newsletter_inscritos", (db.agora() - 7 * 86400,)) or {}
    return {k: int(v or 0) for k, v in r.items()}


# ---------------- conteúdo ----------------
def _versoes(n: int = 5) -> list[dict]:
    p = pathlib.Path(__file__).resolve().parent / "novidades.json"
    return json.loads(p.read_text(encoding="utf-8"))["versoes"][:n]


def _e(t) -> str:
    return html.escape(str(t or ""))


def _inline(t: str, cor: str) -> str:
    """Texto com **negrito**, *itálico* e [link](https://…), sem HTML de quem escreveu."""
    s = _e(t)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"(?<!\*)\*(?!\*)(.+?)\*", r"<i>\1</i>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", lambda m: f'<a href="{m.group(2)}" style="color:{cor}">{m.group(1)}</a>', s)
    return s.replace("\n", "<br>")


def _tema(modelo: str, cor: str) -> dict:
    if modelo == "escuro":
        return {"fundo": "#0e0f11", "cartao": "#17181b", "borda": "#26282d", "texto": "#d4d4d8", "titulo": "#ffffff", "suave": "#a1a1aa", "cor": "#c8ff9a",
                "botao_txt": "#0e0f11", "caixa": "#1f2125"}
    return {"fundo": "#f3f4f6", "cartao": "#ffffff", "borda": "#e5e7eb", "texto": "#374151", "titulo": "#111827", "suave": "#6b7280", "cor": cor,
            "botao_txt": "#ffffff", "caixa": "#f9fafb"}


def _bloco(b: dict, t: dict, i: int, modelo: str) -> tuple[str, str]:
    """(html, texto puro) de um bloco."""
    tipo, cor = b.get("tipo"), t["cor"]
    f = f"font-family:{_FONTE}"
    if tipo == "titulo":
        num = f'<span style="color:{cor};font-weight:700;margin-right:8px">{i:02d}</span>' if modelo == "boletim" else ""
        return (f'<h2 style="margin:26px 0 10px 0;{f};font-size:19px;line-height:1.3;font-weight:700;color:{t["titulo"]}">{num}{_e(b.get("texto"))}</h2>',
                f"\n{b.get('texto', '').upper()}\n")
    if tipo == "texto":
        return f'<p style="margin:0 0 14px 0;{f};font-size:15px;line-height:1.65;color:{t["texto"]}">{_inline(b.get("texto", ""), cor)}</p>', b.get("texto", "") + "\n"
    if tipo == "imagem" and str(b.get("url", "")).startswith("https://"):
        img = f'<img src="{_e(b["url"])}" alt="{_e(b.get("alt"))}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:10px">'
        if str(b.get("link", "")).startswith("https://"):
            img = f'<a href="{_e(b["link"])}">{img}</a>'
        return f'<div style="margin:8px 0 18px 0">{img}</div>', f"[imagem: {b.get('alt', '')}]\n"
    if tipo == "botao" and str(b.get("url", "")).startswith("https://"):
        rot, url = _e(b.get("rotulo") or "Saiba mais"), _e(b["url"])
        return (f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td bgcolor="{cor}" style="border-radius:8px">'
                f'<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{url}" style="height:44px;v-text-anchor:middle;width:260px" arcsize="18%" fillcolor="{cor}" stroke="f"><center style="color:{t["botao_txt"]};font:600 15px Arial">{rot}</center></v:roundrect><![endif]-->'
                f'<!--[if !mso]><!--><a href="{url}" target="_blank" style="display:inline-block;padding:12px 26px;{f};font-size:15px;font-weight:600;color:{t["botao_txt"]};text-decoration:none;border-radius:8px;background:{cor}">{rot}</a><!--<![endif]-->'
                "</td></tr></table>", f"{b.get('rotulo')}: {b['url']}\n")
    if tipo == "lista":
        itens = [x for x in (b.get("itens") or []) if str(x).strip()][:15]
        li = "".join(f'<tr><td style="width:22px;vertical-align:top;padding:4px 0;color:{cor};font-weight:700">✓</td><td style="padding:4px 0;{f};font-size:15px;line-height:1.55;color:{t["texto"]}">{_inline(x, cor)}</td></tr>' for x in itens)
        return f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0">{li}</table>', "".join(f"- {x}\n" for x in itens)
    if tipo == "destaque":
        return (f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0"><tr><td style="padding:16px 18px;background:{t["caixa"]};'
                f'border-left:4px solid {cor};border-radius:8px;{f}"><p style="margin:0 0 4px 0;font-size:15px;font-weight:700;color:{t["titulo"]}">{_e(b.get("titulo"))}</p>'
                f'<p style="margin:0;font-size:14px;line-height:1.6;color:{t["texto"]}">{_inline(b.get("texto", ""), cor)}</p></td></tr></table>',
                f"» {b.get('titulo', '')}: {b.get('texto', '')}\n")
    if tipo == "cartoes":
        itens = (b.get("itens") or [])[:6]
        celulas, txt = [], ""
        for x in itens:
            link = f'<a href="{_e(x["link"])}" style="color:{cor};font-size:13px;font-weight:600;text-decoration:none">Saiba mais →</a>' if str(x.get("link", "")).startswith("https://") else ""
            celulas.append(f'<td class="col" width="50%" style="width:50%;vertical-align:top;padding:6px"><div style="padding:14px 16px;border:1px solid {t["borda"]};border-radius:10px;background:{t["caixa"]};{f}">'
                           f'<p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:{t["titulo"]}">{_e(x.get("titulo"))}</p>'
                           f'<p style="margin:0 0 8px 0;font-size:13px;line-height:1.55;color:{t["texto"]}">{_inline(x.get("texto", ""), cor)}</p>{link}</div></td>')
            txt += f"* {x.get('titulo', '')}: {x.get('texto', '')}\n"
        linhas = "".join("<tr>" + "".join(celulas[k:k + 2]) + ("<td></td>" if len(celulas[k:k + 2]) == 1 else "") + "</tr>" for k in range(0, len(celulas), 2))
        return f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px -6px 14px -6px">{linhas}</table>', txt
    if tipo == "versao":
        v = next((x for x in _versoes(80) if x.get("versao") == b.get("versao")), None)
        if not v:
            return "", ""
        selos = {"novo": ("Novo", "#16a34a"), "melhorias": ("Melhoria", "#2563eb"), "seguranca": ("Segurança", "#9333ea"), "correcoes": ("Correção", "#d97706")}
        partes, txt = [], f"Versão {v['versao']} · {v.get('titulo', '')}\n"
        for k, (rot, c2) in selos.items():
            for item in (v.get(k) or [])[:6]:
                partes.append(f'<tr><td style="vertical-align:top;padding:5px 10px 5px 0;white-space:nowrap"><span style="display:inline-block;padding:2px 8px;border-radius:999px;background:{c2};color:#fff;{f};font-size:11px;font-weight:600">{rot}</span></td>'
                              f'<td style="padding:5px 0;{f};font-size:14px;line-height:1.5;color:{t["texto"]}">{_e(item)}</td></tr>')
                txt += f"[{rot}] {item}\n"
        return (f'<div style="margin:8px 0 18px 0;padding:16px 18px;border:1px solid {t["borda"]};border-radius:10px;{f}"><p style="margin:0 0 2px 0;font-size:12px;color:{t["suave"]}">Versão {_e(v["versao"])} · {_e(v.get("data"))}</p>'
                f'<p style="margin:0 0 10px 0;font-size:16px;font-weight:700;color:{t["titulo"]}">{_e(v.get("titulo"))}</p><table role="presentation" cellpadding="0" cellspacing="0">{"".join(partes)}</table></div>', txt)
    if tipo == "divisor":
        return f'<hr style="border:0;border-top:1px solid {t["borda"]};margin:22px 0">', "\n---\n"
    if tipo == "espaco":
        return '<div style="height:18px;line-height:18px">&nbsp;</div>', "\n"
    return "", ""


def montar(c: dict, token: str | None = None, campanha_id: int | None = None) -> tuple[str, str, str]:
    """(assunto, html, texto) de uma campanha. token = do inscrito (link de cancelar próprio)."""
    m = correio.marca()
    modelo = c.get("modelo") if c.get("modelo") in MODELOS else "classico"
    cor = c.get("cor") if re.match(r"^#[0-9a-fA-F]{6}$", str(c.get("cor") or "")) else m["cor"]
    t = _tema(modelo, cor)
    assunto = (c.get("assunto") or c.get("titulo") or "Novidades").strip()[:150]
    titulo = (c.get("titulo") or assunto).strip()
    previa = (c.get("previa") or "").strip()
    corpo_h, corpo_t, n = [], [], 0
    for b in (c.get("blocos") or [])[:60]:
        if not isinstance(b, dict) or b.get("tipo") not in TIPOS_BLOCO:
            continue
        n += b["tipo"] == "titulo"
        h, tx = _bloco(b, t, n, modelo)
        corpo_h.append(h); corpo_t.append(tx)
    sair = _link_sair(token) if token else f"{SITE}/newsletter"
    ver = f"{APP}/api/site/newsletter/ver/{campanha_id}" if campanha_id else ""
    f = f"font-family:{_FONTE}"
    logo = f'<img src="{m["logo"]}" width="40" height="40" alt="{_e(m["nome"])}" style="display:block;border:0;border-radius:10px">'
    marca_linha = (f'<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle">{logo}</td>'
                   f'<td style="vertical-align:middle;padding-left:12px;{f};font-size:16px;font-weight:600;color:{{cor_nome}}">{_e(m["nome"])}</td></tr></table>')
    data_ed = time.strftime("%d/%m/%Y", time.gmtime(time.time() - 3 * 3600))
    if modelo == "destaque":
        topo = (f'<tr><td style="background:{cor};padding:28px 40px 30px 40px" class="conteudo">{marca_linha.replace("{cor_nome}", "#ffffff")}'
                f'<h1 style="margin:22px 0 6px 0;{f};font-size:28px;line-height:1.2;font-weight:800;color:#ffffff">{_e(titulo)}</h1>'
                f'<p style="margin:0;{f};font-size:15px;line-height:1.5;color:#ffffff;opacity:.9">{_e(previa)}</p></td></tr>')
    elif modelo == "boletim":
        topo = (f'<tr><td style="padding:26px 40px 0 40px" class="conteudo">{marca_linha.replace("{cor_nome}", t["titulo"])}</td></tr>'
                f'<tr><td style="padding:20px 40px 6px 40px" class="conteudo"><p style="margin:0;{f};font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:{cor};font-weight:700">Boletim · {data_ed}</p>'
                f'<h1 style="margin:6px 0 0 0;{f};font-size:26px;line-height:1.25;font-weight:800;color:{t["titulo"]}">{_e(titulo)}</h1>'
                f'<div style="margin-top:14px;border-top:3px solid {t["titulo"]};font-size:0;line-height:0">&nbsp;</div></td></tr>')
    elif modelo == "minimo":
        topo = (f'<tr><td style="padding:30px 40px 0 40px" class="conteudo"><p style="margin:0;{f};font-size:13px;color:{t["suave"]}">{_e(m["nome"])}</p>'
                f'<h1 style="margin:10px 0 0 0;font-family:Georgia,Times New Roman,serif;font-size:26px;line-height:1.3;font-weight:400;color:{t["titulo"]}">{_e(titulo)}</h1></td></tr>')
    else:   # clássico e escuro
        topo = (f'<tr><td style="height:4px;background:{cor};font-size:0;line-height:0">&nbsp;</td></tr>'
                f'<tr><td style="padding:28px 40px 0 40px" class="conteudo">{marca_linha.replace("{cor_nome}", t["titulo"])}'
                f'<h1 style="margin:24px 0 0 0;{f};font-size:24px;line-height:1.3;font-weight:700;color:{t["titulo"]}">{_e(titulo)}</h1></td></tr>')
    assinatura = cfg()["assinatura"]
    escuro_css = "" if modelo == "escuro" else (".card{background:#111827!important;border-color:#1f2937!important} body,.fundo{background:#0b0f14!important} "
                                                 "h1,h2,.t{color:#f3f4f6!important} p,td{color:#d1d5db}")
    h = f'''<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>{_e(assunto)}</title>
<style>body{{margin:0;padding:0;background:{t["fundo"]};-webkit-text-size-adjust:100%}} @media (max-width:620px){{.conteudo{{padding-left:20px!important;padding-right:20px!important}} .card{{width:100%!important}} .col{{display:block!important;width:100%!important}}}}
@media (prefers-color-scheme:dark){{{escuro_css}}}</style></head>
<body><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">{_e(previa)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="fundo" style="background:{t["fundo"]}"><tr><td align="center" style="padding:28px 12px">
{f'<p style="margin:0 0 10px 0;{f};font-size:11px;color:{t["suave"]}"><a href="{ver}" style="color:{t["suave"]}">Ver no navegador</a></p>' if ver else ""}
<table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;background:{t["cartao"]};border:1px solid {t["borda"]};border-radius:14px;overflow:hidden">
{topo}
<tr><td style="padding:22px 40px 30px 40px" class="conteudo">{"".join(corpo_h)}
<p style="margin:22px 0 0 0;{f};font-size:14px;color:{t["suave"]}">{_e(assinatura)}</p></td></tr>
<tr><td style="padding:18px 40px 26px 40px;border-top:1px solid {t["borda"]};{f};font-size:12px;line-height:1.6;color:{t["suave"]}" class="conteudo">
Você recebe este e-mail porque se inscreveu nas novidades do {_e(m["nome"])} em zynio.com.br.<br>
<a href="{sair}" style="color:{t["suave"]}">Cancelar inscrição</a> · <a href="{SITE}" style="color:{t["suave"]}">zynio.com.br</a> · <a href="{SITE}/novidades" style="color:{t["suave"]}">Todas as novidades</a>
</td></tr></table></td></tr></table></body></html>'''
    texto = f"{titulo}\n{'=' * min(60, len(titulo))}\n\n" + "".join(corpo_t) + f"\n{assinatura}\n\nCancelar inscrição: {sair}\n"
    return assunto, h, texto


# ---------------- IA ----------------
def _fatos(n_versoes: int) -> str:
    vs = _versoes(n_versoes)
    linhas = []
    for v in vs:
        linhas.append(f"Versão {v['versao']} ({v.get('data')}): {v.get('titulo')}. {v.get('resumo', '')}")
        for k in ("novo", "melhorias", "seguranca", "correcoes"):
            for item in v.get(k) or []:
                linhas.append(f"  - [{k}] {item}")
    return "\n".join(linhas)


FUNCIONALIDADES = ("Ares-condicionados comandados por infravermelho (transmissor Tuya SRW-004), Alexa e Google Home pelo Sinric Pro, agenda, automações, "
                   "cenas, temporizadores, relatórios de consumo e custo em 8 formatos, mapa 3D do escritório com o prédio e a cidade, iluminação com "
                   "acender ao anoitecer, cafeteira com desligamento automático, persianas, fechadura Wi-Fi, música pelo Spotify, assistente de IA, "
                   "bot do Telegram, apps Android, iPhone, macOS, Windows e Linux, segurança com firewall e globo 3D, backup e treinamento ISO 27001.")


def gerar_com_ia(tema: str, tom: str = "profissional", modelo: str = "classico", versoes: int = 3, tamanho: str = "media", publico: str = "") -> dict:
    from . import ia
    regras = ("Você escreve newsletters em português do Brasil para o Clima Escritório (zynio.com.br), sistema que controla o escritório inteiro. "
              "Responda SÓ com um objeto JSON, sem comentários, no formato: {\"assunto\": str (até 70 caracteres, sem emoji), \"previa\": str (até 110), "
              "\"titulo\": str (até 60), \"blocos\": [ ... ]}. Tipos de bloco permitidos: "
              "{\"tipo\":\"titulo\",\"texto\"}, {\"tipo\":\"texto\",\"texto\"} (aceita **negrito**), {\"tipo\":\"lista\",\"itens\":[str]}, "
              "{\"tipo\":\"destaque\",\"titulo\",\"texto\"}, {\"tipo\":\"cartoes\",\"itens\":[{\"titulo\",\"texto\",\"link\"}]} (2 a 4 cartões), "
              "{\"tipo\":\"versao\",\"versao\":\"0.4.8\"} (mostra a versão inteira), {\"tipo\":\"botao\",\"rotulo\",\"url\"}, {\"tipo\":\"divisor\"}.\n"
              "Regras: use SÓ os fatos fornecidos; não invente números, clientes, depoimentos, preços, prazos nem promessas. Frases curtas e diretas, "
              "sem travessão (—), sem emoji, sem jargão técnico (nada de nome de função). Links só destes: https://zynio.com.br, https://zynio.com.br/novidades, "
              "https://zynio.com.br/funcionalidades, https://app.zynio.com.br, https://zynio.com.br/baixar, https://zynio.com.br/contato. "
              "Termine com um bloco botao. Não escreva saudação de despedida (a assinatura é automática).")
    extensao = {"curta": "3 a 5 blocos", "media": "6 a 9 blocos", "longa": "10 a 14 blocos"}.get(tamanho, "6 a 9 blocos")
    pedido = (f"Tema: {tema.strip()[:500]}\nTom: {tom}\nTamanho: {extensao}\n" + (f"Público: {publico.strip()[:200]}\n" if publico.strip() else "")
              + f"\nFATOS (versões reais, da mais nova para a mais antiga):\n{_fatos(max(1, min(versoes, 8)))}\n\nO QUE O SISTEMA FAZ:\n{FUNCIONALIDADES}")
    resp = ia.gerar(regras, pedido, max_tokens=3500, temperatura=0.5)
    j = ia.json_da_resposta(resp)
    if not isinstance(j, dict) or not isinstance(j.get("blocos"), list):
        raise RuntimeError("A IA não devolveu a newsletter no formato esperado. Tente de novo.")
    blocos = [b for b in j["blocos"] if isinstance(b, dict) and b.get("tipo") in TIPOS_BLOCO]
    for b in blocos:   # links só do nosso domínio
        for k in ("url", "link"):
            if k in b and not re.match(r"^https://(app\.)?zynio\.com\.br(/|$)", str(b[k])):
                b[k] = SITE
        for x in b.get("itens") or []:
            if isinstance(x, dict) and "link" in x and not re.match(r"^https://(app\.)?zynio\.com\.br(/|$)", str(x["link"])):
                x["link"] = SITE
    return {"assunto": str(j.get("assunto") or "")[:150], "previa": str(j.get("previa") or "")[:200], "titulo": str(j.get("titulo") or "")[:150],
            "modelo": modelo if modelo in MODELOS else "classico", "blocos": blocos, "ia": True}


# ---------------- campanhas ----------------
CAMPOS = ("titulo", "assunto", "previa", "modelo", "cor", "blocos")


def _limpar(d: dict) -> dict:
    out = {}
    for k in CAMPOS:
        if k in d and d[k] is not None:
            out[k] = d[k]
    if "blocos" in out:
        out["blocos"] = [b for b in out["blocos"] if isinstance(b, dict) and b.get("tipo") in TIPOS_BLOCO][:60]
    if "modelo" in out and out["modelo"] not in MODELOS:
        out["modelo"] = "classico"
    return out


def criar(d: dict, quem: str) -> dict:
    c = {"titulo": "", "assunto": "", "previa": "", "modelo": cfg()["modelo_padrao"], "cor": "", "blocos": [], **_limpar(d)}
    agora = db.agora()
    cid = db.executar("INSERT INTO newsletter_campanhas (titulo, assunto, previa, modelo, cor, blocos, ia, criado_por, criado_em, atualizado_em) "
                      "VALUES (?,?,?,?,?,CAST(? AS jsonb),?,?,?,?)", (c["titulo"][:150], c["assunto"][:150], c["previa"][:200], c["modelo"], c["cor"][:7],
                                                                    json.dumps(c["blocos"]), bool(d.get("ia")), quem[:80], agora, agora))
    return um(cid)


def um(cid: int) -> dict | None:
    return db.um("SELECT * FROM newsletter_campanhas WHERE id = ?", (cid,))


def atualizar(cid: int, d: dict) -> dict:
    c = um(cid)
    if not c:
        raise LookupError("Campanha não existe.")
    if c["estado"] in ("enviando", "enviada"):
        raise ValueError("Campanha já enviada: duplique para fazer outra.")
    mud = _limpar(d)
    if "agendada_para" in d:
        ag = d.get("agendada_para")
        mud["agendada_para"] = int(ag) if ag else None
        mud["estado"] = "agendada" if ag else "rascunho"
    if mud:
        sets = ", ".join(f"{k} = CAST(? AS jsonb)" if k == "blocos" else f"{k} = ?" for k in mud)
        vals = [json.dumps(v) if k == "blocos" else v for k, v in mud.items()]
        db.executar(f"UPDATE newsletter_campanhas SET {sets}, atualizado_em = ? WHERE id = ?", (*vals, db.agora(), cid))
    return um(cid)


def listar() -> list[dict]:
    lst = db.consultar("SELECT id, titulo, assunto, modelo, estado, ia, criado_por, criado_em, atualizado_em, agendada_para, enviada_em, total, enviados, falhas "
                       "FROM newsletter_campanhas ORDER BY atualizado_em DESC LIMIT 200")
    st = {r["campanha_id"]: r for r in db.consultar(
        "SELECT campanha_id, count(*) FILTER (WHERE estado IN ('entregue','aberto','clicado')) AS entregues, count(*) FILTER (WHERE estado IN ('aberto','clicado')) AS abertos, "
        "count(*) FILTER (WHERE estado = 'clicado') AS clicados FROM email_envios WHERE campanha_id IS NOT NULL GROUP BY campanha_id")}
    for c in lst:
        s = st.get(c["id"]) or {}
        c.update({k: int(s.get(k) or 0) for k in ("entregues", "abertos", "clicados")})
    return lst


def estatisticas(cid: int) -> dict:
    por = db.consultar("SELECT estado, count(*) AS n FROM email_envios WHERE campanha_id = ? GROUP BY estado", (cid,))
    envios = db.consultar("SELECT para, estado, atualizado_em, erro FROM email_envios WHERE campanha_id = ? ORDER BY atualizado_em DESC LIMIT 500", (cid,))
    return {"por_estado": {r["estado"]: int(r["n"]) for r in por}, "envios": envios}


def enviar_teste(cid_ou_dados, para: str) -> dict:
    c = um(cid_ou_dados) if isinstance(cid_ou_dados, int) else cid_ou_dados
    assunto, h, t = montar(c, None, c.get("id"))
    return correio.enviar(para, "newsletter_teste", assunto="[Teste] " + assunto, html_=h, texto=t)


def _lote_resend(itens: list[dict]) -> list[str | None]:
    chave = correio._chave()
    r = httpx.post(f"{correio.RESEND}/emails/batch", json=itens, timeout=40, headers={"Authorization": f"Bearer {chave}"})
    if r.status_code >= 300:
        raise RuntimeError(f"Resend recusou o lote ({r.status_code}): {r.text[:200]}")
    dados = r.json().get("data") or []
    return [x.get("id") for x in dados] + [None] * (len(itens) - len(dados))


def enviar(cid: int, limite_tempo: float = 40.0) -> dict:
    """Manda para os inscritos ativos que ainda não receberam esta campanha. Chamada em sequência pela tela (ou pelo agente)
    até terminar: cada chamada trabalha no máximo ~40 s (limite das funções da Vercel)."""
    if not correio.configurado():
        raise RuntimeError("Resend não configurado (E-mails → Conexões).")
    if not correio.dominio_verificado():
        raise RuntimeError("O domínio zynio.com.br ainda não está verificado no Resend: campanhas para inscritos precisam dele.")
    c = um(cid)
    if not c:
        raise LookupError("Campanha não existe.")
    if c["estado"] == "enviada":
        return {"estado": "enviada", "enviados": c["enviados"], "total": c["total"]}
    if not (c.get("assunto") or c.get("titulo")) or not c.get("blocos"):
        raise ValueError("Preencha o assunto e pelo menos um bloco antes de enviar.")
    t0 = time.time()
    if c["estado"] != "enviando":
        total = (db.um("SELECT count(*) AS n FROM newsletter_inscritos WHERE estado = 'ativo'") or {}).get("n") or 0
        db.executar("UPDATE newsletter_campanhas SET estado = 'enviando', total = ?, atualizado_em = ? WHERE id = ?", (total, db.agora(), cid))
    resp = cfg().get("responder_para") or ""
    while time.time() - t0 < limite_tempo:
        faltam = db.consultar("SELECT i.email, i.token FROM newsletter_inscritos i WHERE i.estado = 'ativo' AND NOT EXISTS "
                              "(SELECT 1 FROM email_envios e WHERE e.campanha_id = ? AND e.para = i.email) ORDER BY i.id LIMIT 100", (cid,))
        if not faltam:
            db.executar("UPDATE newsletter_campanhas SET estado = 'enviada', enviada_em = ?, atualizado_em = ? WHERE id = ?", (db.agora(), db.agora(), cid))
            break
        itens, ids = [], []
        agora = db.agora()
        for f in faltam:
            assunto, h, t = montar(c, f["token"], cid)
            sair_api = f"{APP}/api/site/newsletter/sair?t={f['token']}"
            itens.append({"from": remetente(), "to": [f["email"]], "subject": assunto, "html": h, "text": t,
                          "headers": {"List-Unsubscribe": f"<{sair_api}>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"},
                          "tags": [{"name": "tipo", "value": "newsletter"}, {"name": "campanha", "value": str(cid)}], **({"reply_to": resp} if resp else {})})
            linha = db.um("INSERT INTO email_envios (tipo, para, assunto, estado, criado_em, atualizado_em, campanha_id) VALUES ('newsletter',?,?,'enviando',?,?,?) RETURNING id",
                          (f["email"], assunto[:200], agora, agora, cid))
            ids.append(linha["id"])
        try:
            rids = _lote_resend(itens)
            for i, rid in zip(ids, rids):
                db.executar("UPDATE email_envios SET resend_id = ?, estado = ?, atualizado_em = ? WHERE id = ?", (rid, "enviado" if rid else "falhou", db.agora(), i))
        except Exception as e:  # noqa: BLE001
            for i in ids:
                db.executar("UPDATE email_envios SET estado = 'falhou', erro = ?, atualizado_em = ? WHERE id = ?", (str(e)[:300], db.agora(), i))
            _contar(cid)
            raise RuntimeError(str(e)) from e
        _contar(cid)
    c = um(cid)
    return {"estado": c["estado"], "enviados": c["enviados"], "falhas": c["falhas"], "total": c["total"]}


def _contar(cid: int):
    r = db.um("SELECT count(*) FILTER (WHERE estado <> 'falhou') AS ok, count(*) FILTER (WHERE estado = 'falhou') AS falhas FROM email_envios WHERE campanha_id = ?", (cid,)) or {}
    db.executar("UPDATE newsletter_campanhas SET enviados = ?, falhas = ?, atualizado_em = ? WHERE id = ?", (int(r.get("ok") or 0), int(r.get("falhas") or 0), db.agora(), cid))


def ciclo():
    """No agente (agenda): manda as campanhas agendadas que chegaram na hora e continua as que pararam no meio."""
    agora = db.agora()
    for c in db.consultar("SELECT id FROM newsletter_campanhas WHERE (estado = 'agendada' AND agendada_para <= ?) OR (estado = 'enviando' AND atualizado_em < ?)",
                          (agora, agora - 120)):
        try:
            enviar(c["id"], limite_tempo=15)
        except Exception as e:  # noqa: BLE001
            db.registrar("newsletter", f"Campanha #{c['id']} não saiu", ok=False, detalhe=str(e)[:300])


def marcar_devolvido(email: str):
    db.executar("UPDATE newsletter_inscritos SET estado = 'devolvido' WHERE email = ? AND estado = 'ativo'", (email.strip().lower(),))
