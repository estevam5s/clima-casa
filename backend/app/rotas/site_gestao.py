"""Rotas de acessos/SEO, idiomas do site e newsletter.

Públicas (`/api/site/...`, CORS só para as origens do site, ver main.py): coleta de acessos, dicionário de idiomas, textos
sem tradução vistos no navegador, confirmar/cancelar a newsletter e ver uma campanha no navegador.
Do painel (logado): /api/analise, /api/idiomas e /api/newsletter, só dono e administradores.
"""
from __future__ import annotations

import csv
import io
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from pydantic import BaseModel, Field

from .. import analise, db, idiomas, newsletter
from ..seguranca import exigir_login

publico_site = APIRouter(prefix="/api/site")
gestao = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


def _papel():
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores mexem aqui.")
    return u


# ================= público (site) =================
@publico_site.post("/coletar")
async def coletar(request: Request):
    try:
        d = await request.json()
    except ValueError:
        raise HTTPException(400, "Corpo inválido.")
    if not isinstance(d, dict):
        raise HTTPException(400, "Corpo inválido.")
    import asyncio
    n = await asyncio.to_thread(analise.coletar, d, request)
    return {"ok": True, "n": n}


@publico_site.get("/idiomas/{idioma}")
def dicionario(idioma: str):
    return idiomas.publico(idioma)


class FaltandoIn(BaseModel):
    idioma: str = Field(max_length=5)
    rota: str = Field("", max_length=200)
    textos: list[str] = Field(default_factory=list, max_length=40)


@publico_site.post("/idiomas/faltando")
def faltando(d: FaltandoIn):
    if d.idioma not in idiomas.TRADUZIVEIS:
        return {"ok": True}
    pend = (db.um("SELECT count(*) AS n FROM site_textos WHERE NOT ativo") or {}).get("n") or 0
    if pend > 2000:   # teto: ninguém de fora enche a lista
        return {"ok": True}
    textos = [{"texto": t[:600], "rotas": [d.rota]} for t in d.textos if isinstance(t, str) and 1 < len(t) <= 600]
    idiomas.importar(textos, "navegador")
    return {"ok": True}


@publico_site.get("/newsletter/confirmar")
def news_confirmar(t: str = ""):
    ok = bool(re.match(r"^[\w-]{16,64}$", t)) and newsletter.confirmar(t)
    return RedirectResponse(f"{newsletter.SITE}/newsletter?{'confirmado=1' if ok else 'erro=link'}", status_code=303)


@publico_site.get("/newsletter/sair")
def news_sair_link(t: str = ""):
    # link do e-mail: só mostra a página com o botão (verificadores de link não cancelam ninguém sozinhos)
    token = t if re.match(r"^[\w-]{16,64}$", t) else ""   # fora da f-string: com "\" dentro ela não compila no 3.11
    return RedirectResponse(f"{newsletter.SITE}/newsletter?sair={token}", status_code=303)


@publico_site.post("/newsletter/sair")
async def news_sair(request: Request, t: str = ""):
    token = t
    if not token:
        try:
            token = str((await request.json()).get("token") or "")
        except ValueError:
            token = ""
    ok = bool(re.match(r"^[\w-]{16,64}$", token)) and newsletter.cancelar(token)
    return {"ok": ok}


class PedirSaidaIn(BaseModel):
    email: str = Field(max_length=200, pattern=EMAIL)
    turnstile: str | None = Field(None, max_length=4096)


@publico_site.post("/newsletter/pedir-saida")
def news_pedir_saida(d: PedirSaidaIn, request: Request):
    from .. import firewall, turnstile
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("newsletter_saida",), 60) >= 5:
        raise HTTPException(429, "Muitos pedidos em pouco tempo. Tente de novo em uma hora.")
    turnstile.exigir(d.turnstile, ip, "/api/site/newsletter/pedir-saida")
    firewall.registrar(ip, "newsletter_saida", "/api/site/newsletter/pedir-saida", "")
    newsletter.pedir_saida(d.email)
    return {"ok": True}


@publico_site.get("/newsletter/ver/{cid}", response_class=HTMLResponse)
def news_ver(cid: int):
    c = newsletter.um(cid)
    if not c or c["estado"] != "enviada":
        raise HTTPException(404, "Campanha não encontrada.")
    return HTMLResponse(newsletter.montar(c, None, None)[1], headers={"Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"})


# ================= painel: acessos e SEO =================
@gestao.get("/analise/resumo")
def analise_resumo(origem: str = "site", dias: int = 7):
    _papel()
    return analise.resumo(origem, dias)


@gestao.get("/analise/seo")
def analise_seo():
    _papel()
    return {"auditoria": db.cfg("seo_auditoria"), "pagespeed": db.cfg("seo_pagespeed") or [], "psi_chave": bool((db.cfg("seo") or {}).get("psi_chave"))}


@gestao.post("/analise/seo/auditar")
def analise_auditar():
    _papel()
    try:
        return analise.auditar()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(424, f"Não deu para auditar agora: {str(e)[:200]}")


class PageSpeedIn(BaseModel):
    url: str = Field(max_length=300)
    estrategia: str = Field("mobile", pattern="^(mobile|desktop)$")


@gestao.post("/analise/pagespeed")
def analise_pagespeed(d: PageSpeedIn):
    _papel()
    try:
        return analise.pagespeed(d.url, d.estrategia)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(424, str(e)[:300])


class SeoCfgIn(BaseModel):
    psi_chave: str = Field("", max_length=120)


@gestao.put("/analise/config")
def analise_config(d: SeoCfgIn):
    _papel()
    c = db.cfg("seo") or {}
    if d.psi_chave == "-":
        c.pop("psi_chave", None)
    elif d.psi_chave.strip():
        c["psi_chave"] = d.psi_chave.strip()
    db.set_cfg("seo", c)
    return {"psi_chave": bool(c.get("psi_chave"))}


# ================= painel: idiomas =================
@gestao.get("/idiomas")
def idiomas_estado(escopo: str = "site"):
    _papel()
    return idiomas.estado(escopo)


class IdiomasIn(BaseModel):
    ativos: list[str] | None = None
    detectar: bool | None = None


@gestao.put("/idiomas")
def idiomas_salvar(d: IdiomasIn):
    _papel()
    idiomas.salvar(d.ativos, d.detectar)
    db.registrar("sistema", "Idiomas do site alterados", detalhe=", ".join(d.ativos or []))
    return idiomas.estado()


@gestao.post("/idiomas/buscar")
def idiomas_buscar():
    _papel()
    try:
        return idiomas.buscar_do_site()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(424, str(e)[:300])


@gestao.get("/idiomas/textos")
def idiomas_textos(idioma: str = "en", busca: str = "", filtro: str = "todos", limite: int = 100, depois: int = 0, escopo: str = "site"):
    _papel()
    return idiomas.listar(idioma, busca, filtro, limite, depois, escopo)


class TraducaoIn(BaseModel):
    texto: str = Field(max_length=1200)
    idioma: str = Field(max_length=5)
    traducao: str = Field("", max_length=2400)
    escopo: str = Field("site", pattern="^(site|painel)$")


@gestao.put("/idiomas/traducao")
def idiomas_traducao(d: TraducaoIn):
    _papel()
    try:
        return idiomas.editar(d.texto, d.idioma, d.traducao, d.escopo)
    except ValueError as e:
        raise HTTPException(400, str(e))


class TraduzirIn(BaseModel):
    idioma: str = Field(max_length=5)
    lote: int = Field(30, ge=5, le=60)
    refazer_ia: bool = False
    escopo: str = Field("site", pattern="^(site|painel)$")


@gestao.post("/idiomas/traduzir")
def idiomas_traduzir(d: TraduzirIn):
    _papel()
    try:
        return idiomas.traduzir_faltantes(d.idioma, d.lote, d.refazer_ia, d.escopo)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(424, str(e)[:300])


class PendentesIn(BaseModel):
    textos: list[str] | None = None
    aprovar: bool = True


@gestao.post("/idiomas/pendentes")
def idiomas_pendentes(d: PendentesIn):
    _papel()
    return {"n": idiomas.aprovar_pendentes(d.textos, d.aprovar)}


@gestao.get("/idiomas/exportar/{idioma}")
def idiomas_exportar(idioma: str, escopo: str = "site"):
    _papel()
    return JSONResponse(idiomas.exportar(idioma, escopo), headers={"Content-Disposition": f'attachment; filename="{"painel" if escopo == "painel" else "site"}-{idioma}.json"'})


# ================= painel traduzido (qualquer pessoa logada) =================
_limite_traducao: dict = {}


@gestao.get("/painel-idiomas/{idioma}")
def painel_dicionario(idioma: str):
    return idiomas.dicionario_painel(idioma)


class PainelTraduzirIn(BaseModel):
    textos: list[str] = Field(max_length=80)
    rota: str = Field("", max_length=120)


@gestao.post("/painel-idiomas/{idioma}/traduzir")
def painel_traduzir(idioma: str, d: PainelTraduzirIn):
    """Textos que a tela mostrou sem tradução: traduz agora pela IA e guarda. Até 12 pedidos por minuto por pessoa."""
    import time as _t
    from .. import acesso
    u = acesso.atual.get() or {}
    agora = _t.time()
    hist = [x for x in _limite_traducao.get(u.get("id"), []) if agora - x < 60]
    if len(hist) >= 12:
        raise HTTPException(429, "Muitos pedidos de tradução. Espere um minuto.")
    _limite_traducao[u.get("id")] = [*hist, agora]
    try:
        return idiomas.traduzir_painel(idioma, [t[:600] for t in d.textos], d.rota)
    except ValueError as e:
        raise HTTPException(400, str(e))


# ================= painel: newsletter =================
@gestao.get("/newsletter")
def news_estado():
    _papel()
    from .. import correio, ia
    return {"config": newsletter.cfg(), "contagem": newsletter.contagem(), "modelos": newsletter.MODELOS, "remetente": newsletter.remetente(),
            "dominio_verificado": correio.dominio_verificado(), "resend": correio.configurado(), "ia": bool(ia.chave()),
            "versoes": [{"versao": v["versao"], "titulo": v.get("titulo"), "data": v.get("data")} for v in newsletter._versoes(30)]}


class NewsCfgIn(BaseModel):
    remetente_local: str | None = Field(None, max_length=40)
    remetente_nome: str | None = Field(None, max_length=80)
    responder_para: str | None = Field(None, max_length=200)
    boas_vindas: bool | None = None
    modelo_padrao: str | None = Field(None, max_length=20)
    assinatura: str | None = Field(None, max_length=120)


@gestao.put("/newsletter/config")
def news_config(d: NewsCfgIn):
    _papel()
    try:
        return newsletter.salvar_cfg(d.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))


@gestao.get("/newsletter/inscritos")
def news_inscritos(estado: str = "", busca: str = "", limite: int = 300):
    _papel()
    w, p = ["true"], []
    if estado in ("ativo", "pendente", "cancelado", "devolvido"):
        w.append("estado = ?"); p.append(estado)
    if busca.strip():
        w.append("(email ILIKE ? OR nome ILIKE ?)"); p += [f"%{busca.strip()}%"] * 2
    return db.consultar(f"SELECT id, email, nome, estado, idioma, origem, pais, criado_em, confirmado_em, cancelado_em FROM newsletter_inscritos "
                        f"WHERE {' AND '.join(w)} ORDER BY criado_em DESC LIMIT ?", (*p, min(limite, 2000)))


class InscritoIn(BaseModel):
    email: str = Field(max_length=200, pattern=EMAIL)
    nome: str = Field("", max_length=80)
    confirmar: bool = True   # True = manda o e-mail de confirmação; False = a pessoa já autorizou (o admin atesta)


@gestao.post("/newsletter/inscritos")
def news_inscrever(d: InscritoIn):
    u = _papel()
    r = newsletter.inscrever(d.email, d.nome, "pt", f"painel ({u.get('nome') or u.get('email') or 'admin'})"[:30], "", ativo=not d.confirmar)
    db.registrar("sistema", "Inscrito na newsletter pelo painel", detalhe=f"{d.email} · {'confirmação enviada' if d.confirmar else 'ativo (atestado)'}")
    return r


class EstadoInscritoIn(BaseModel):
    estado: str = Field(pattern="^(ativo|cancelado)$")


@gestao.put("/newsletter/inscritos/{iid}")
def news_mudar_inscrito(iid: int, d: EstadoInscritoIn):
    _papel()
    db.executar("UPDATE newsletter_inscritos SET estado = ?, cancelado_em = CASE WHEN ? = 'cancelado' THEN ? ELSE NULL END WHERE id = ?",
                (d.estado, d.estado, db.agora(), iid))
    return {"ok": True}


@gestao.delete("/newsletter/inscritos/{iid}")
def news_apagar_inscrito(iid: int):
    _papel()
    db.executar("DELETE FROM newsletter_inscritos WHERE id = ?", (iid,))
    db.registrar("sistema", "Inscrito apagado da newsletter", detalhe=f"#{iid}")
    return {"ok": True}


@gestao.get("/newsletter/inscritos/exportar")
def news_exportar():
    _papel()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["email", "nome", "estado", "idioma", "origem", "criado_em", "confirmado_em"])
    from .. import exportar
    for r in db.consultar("SELECT email, nome, estado, idioma, origem, criado_em, confirmado_em FROM newsletter_inscritos ORDER BY id"):
        w.writerow([exportar.celula(r[k]) if isinstance(r[k], str) else r[k] for k in ("email", "nome", "estado", "idioma", "origem", "criado_em", "confirmado_em")])
    return Response(buf.getvalue().encode("utf-8-sig"), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="newsletter-inscritos.csv"'})


@gestao.get("/newsletter/campanhas")
def news_campanhas():
    _papel()
    return newsletter.listar()


class CampanhaIn(BaseModel):
    titulo: str | None = Field(None, max_length=150)
    assunto: str | None = Field(None, max_length=150)
    previa: str | None = Field(None, max_length=200)
    modelo: str | None = Field(None, max_length=20)
    cor: str | None = Field(None, max_length=7)
    blocos: list[dict] | None = Field(None, max_length=60)
    ia: bool | None = None
    agendada_para: int | None = None


@gestao.post("/newsletter/campanhas")
def news_criar(d: CampanhaIn):
    u = _papel()
    return newsletter.criar(d.model_dump(exclude_none=True), u.get("nome") or u.get("email") or "")


@gestao.get("/newsletter/campanhas/{cid}")
def news_uma(cid: int):
    _papel()
    c = newsletter.um(cid)
    if not c:
        raise HTTPException(404, "Campanha não existe.")
    return {**c, "estatisticas": newsletter.estatisticas(cid)}


@gestao.put("/newsletter/campanhas/{cid}")
def news_salvar(cid: int, d: CampanhaIn):
    _papel()
    try:
        dados = d.model_dump(exclude_none=True)
        if "agendada_para" in d.model_fields_set:
            dados["agendada_para"] = d.agendada_para
        return newsletter.atualizar(cid, dados)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))


@gestao.delete("/newsletter/campanhas/{cid}")
def news_apagar(cid: int):
    _papel()
    c = newsletter.um(cid)
    if c and c["estado"] == "enviando":
        raise HTTPException(409, "A campanha está sendo enviada.")
    db.executar("DELETE FROM newsletter_campanhas WHERE id = ?", (cid,))
    return {"ok": True}


@gestao.post("/newsletter/campanhas/{cid}/duplicar")
def news_duplicar(cid: int):
    u = _papel()
    c = newsletter.um(cid)
    if not c:
        raise HTTPException(404, "Campanha não existe.")
    return newsletter.criar({**{k: c[k] for k in newsletter.CAMPOS}, "titulo": f"{c['titulo'] or c['assunto']} (cópia)"[:150]}, u.get("nome") or "")


@gestao.post("/newsletter/previa", response_class=HTMLResponse)
def news_previa(d: CampanhaIn):
    _papel()
    return HTMLResponse(newsletter.montar(d.model_dump(exclude_none=True), None, None)[1],
                        headers={"Content-Security-Policy": "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'"})


class IaIn(BaseModel):
    tema: str = Field(min_length=3, max_length=500)
    tom: str = Field("profissional", max_length=40)
    modelo: str = Field("classico", max_length=20)
    versoes: int = Field(3, ge=1, le=8)
    tamanho: str = Field("media", pattern="^(curta|media|longa)$")
    publico: str = Field("", max_length=200)


@gestao.post("/newsletter/ia")
def news_ia(d: IaIn):
    _papel()
    try:
        return newsletter.gerar_com_ia(d.tema, d.tom, d.modelo, d.versoes, d.tamanho, d.publico)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(424, str(e)[:300])


class TesteNewsIn(BaseModel):
    para: str = Field(max_length=200, pattern=EMAIL)


@gestao.post("/newsletter/campanhas/{cid}/teste")
def news_teste(cid: int, d: TesteNewsIn):
    _papel()
    try:
        return newsletter.enviar_teste(cid, d.para)
    except RuntimeError as e:
        raise HTTPException(424, str(e)[:300])


@gestao.post("/newsletter/campanhas/{cid}/enviar")
def news_enviar(cid: int):
    u = _papel()
    try:
        r = newsletter.enviar(cid)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(424, str(e)[:300])
    if r["estado"] == "enviada":
        db.registrar("sistema", f"Newsletter #{cid} enviada", detalhe=f"{r['enviados']} de {r['total']} por {u.get('nome') or u.get('email')}")
    return r
