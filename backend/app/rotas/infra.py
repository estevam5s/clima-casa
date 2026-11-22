"""Rotas de Infra (Vercel) e dos computadores com o agente.

A Vercel é operada pelo agente (o token não vai para a nuvem): a nuvem enfileira e espera a resposta.
Ver: dono e administradores. Alterar (colocar no ar, apagar, limpar, retenção, computador preferido): só o dono.
"""
import os
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import coordenador, db, transmissor
from ..seguranca import exigir_login

rotas_infra = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])


def _papel(*permitidos):
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in permitidos:
        raise HTTPException(403, "Só o dono" + (" e os administradores" if "admin" in permitidos else "") + " podem fazer isso.")
    return u


def _via_agente(op: str, args: dict, espera: float = 40):
    from .. import infra
    if transmissor.PAPEL == "agente":
        try:
            return infra.executar(op, args)
        except infra.ErroInfra as e:
            raise HTTPException(400, str(e)) from e
    if not transmissor.agente_online():
        raise HTTPException(503, "O agente do escritório está offline. A Infra da Vercel passa por ele (o token não fica na nuvem).")
    fid = transmissor.enfileirar("infra", None, {"op": op, "args": args})
    f = transmissor.aguardar(fid, espera)
    if f.get("estado") != "ok":
        raise HTTPException(502, f.get("erro") or "O agente não conseguiu falar com a Vercel.")
    r = f.get("resultado")
    try:   # a resposta pode ter coisa sensível (código de instalação, e-mails recebidos): não fica guardada na fila
        db.executar("UPDATE fila_comandos SET resultado = NULL WHERE id = ?", (fid,))
    except Exception:  # noqa: BLE001
        pass
    return r if isinstance(r, (dict, list)) else {}


@rotas_infra.get("/infra/saude")
def saude():
    _papel("dono", "admin")
    t0 = time.perf_counter(); db.um("SELECT 1 AS ok"); banco_ms = round((time.perf_counter() - t0) * 1000, 1)
    fila = db.um("SELECT COUNT(*) FILTER (WHERE estado = 'pendente') AS pendentes, COUNT(*) FILTER (WHERE estado = 'erro' AND criado_em > ?) AS erros_1h, "
                 "COUNT(*) FILTER (WHERE criado_em > ?) AS total_1h, AVG(fim_em - inicio_em) FILTER (WHERE fim_em IS NOT NULL AND criado_em > ?) AS media_s "
                 "FROM fila_comandos", (db.agora() - 3600, db.agora() - 3600, db.agora() - 3600)) or {}
    return {"regiao": os.environ.get("VERCEL_REGION") or "local", "ambiente": "Vercel" if os.environ.get("VERCEL") else "agente local",
            "banco_ms": banco_ms, "agente_online": transmissor.agente_online(), "fila": {k: (float(v) if v is not None else None) for k, v in fila.items()},
            "versao": os.environ.get("VERCEL_GIT_COMMIT_SHA", "")[:7] or os.environ.get("VERCEL_DEPLOYMENT_ID", "")[:12], "agora": db.agora()}


@rotas_infra.get("/infra/resumo")
def resumo():
    _papel("dono", "admin")
    return _via_agente("resumo", {})


@rotas_infra.get("/infra/uso")
def uso(dias: int = 30):
    _papel("dono", "admin")
    return _via_agente("uso", {"dias": max(1, min(dias, 31))})


@rotas_infra.get("/infra/publicacoes")
def publicacoes(projeto: str = "clima-casa", limite: int = 50):
    _papel("dono", "admin")
    return _via_agente("publicacoes", {"projeto": projeto, "limite": limite})


@rotas_infra.get("/infra/publicacoes/{dep}/log")
def log_publicacao(dep: str, projeto: str = "clima-casa"):
    _papel("dono", "admin")
    if not re.fullmatch(r"[A-Za-z0-9_]{1,64}", dep):
        raise HTTPException(400, "Publicação inválida.")
    return _via_agente("eventos", {"projeto": projeto, "id": dep})


@rotas_infra.get("/infra/variaveis")
def variaveis(projeto: str = "clima-casa"):
    _papel("dono", "admin")
    return _via_agente("env", {"projeto": projeto})


class AcaoPub(BaseModel):
    projeto: str = Field("clima-casa", max_length=60)
    id: str = Field(min_length=5, max_length=60, pattern=r"^[A-Za-z0-9_]+$")
    acao: str = Field(pattern=r"^(promover|republicar|cancelar|apagar)$")


@rotas_infra.post("/infra/publicacoes/acao")
def acao_publicacao(d: AcaoPub):
    _papel("dono")
    return _via_agente(d.acao, {"projeto": d.projeto, "id": d.id}, 50)


class Limpar(BaseModel):
    projeto: str = Field("clima-casa", max_length=60)
    manter: int = Field(10, ge=3, le=100)
    simular: bool = False


@rotas_infra.post("/infra/limpar")
def limpar(d: Limpar):
    _papel("dono")
    return _via_agente("limpar", d.model_dump(), 55)   # a função da Vercel tem 60 s


class Retencao(BaseModel):
    projeto: str = Field("clima-casa", max_length=60)
    dias: int = Field(30, ge=1, le=365)
    manter: int = Field(10, ge=3, le=100)


@rotas_infra.post("/infra/retencao")
def retencao(d: Retencao):
    _papel("dono")
    return _via_agente("retencao", d.model_dump())


# ---------- Cloudflare (zynio.com.br) — também pelo agente, com o CLOUDFLARE_API_TOKEN dele ----------
@rotas_infra.get("/infra/dominios")
def dominios():
    _papel("dono", "admin")
    return _via_agente("dominios", {}, 50)


@rotas_infra.get("/infra/cf/visao")
def cf_visao():
    _papel("dono", "admin")
    return _via_agente("cf_visao", {}, 50)


@rotas_infra.get("/infra/cf/resumo")
def cf_resumo():
    _papel("dono", "admin")
    return _via_agente("cf_resumo", {})


@rotas_infra.get("/infra/cf/saude")
def cf_saude():
    _papel("dono", "admin")
    return _via_agente("cf_saude", {}, 50)


@rotas_infra.get("/infra/cf/token")
def cf_token():
    _papel("dono", "admin")
    return _via_agente("cf_token", {})


@rotas_infra.get("/infra/cf/dns")
def cf_dns():
    _papel("dono", "admin")
    return _via_agente("cf_dns", {})


@rotas_infra.get("/infra/cf/dns/analise")
def cf_dns_analise(dias: int = 7):
    _papel("dono", "admin")
    return _via_agente("cf_dns_analise", {"dias": max(1, min(dias, 30))})


@rotas_infra.get("/infra/cf/dns/exportar")
def cf_dns_exportar():
    _papel("dono")
    return _via_agente("cf_dns_exportar", {})


class RegistroDNS(BaseModel):
    tipo: str = Field(pattern=r"^(A|AAAA|CNAME|TXT|MX|CAA|SRV)$")
    nome: str = Field(min_length=1, max_length=255, pattern=r"^[A-Za-z0-9@._*-]+$")
    conteudo: str = Field(min_length=1, max_length=2048)
    ttl: int = Field(1, ge=1, le=86400)
    proxy: bool = False
    prioridade: int | None = Field(None, ge=0, le=65535)
    comentario: str | None = Field(None, max_length=100)
    confirmar: str | None = Field(None, max_length=255)


@rotas_infra.post("/infra/cf/dns")
def cf_dns_criar(d: RegistroDNS):
    _papel("dono")
    return _via_agente("cf_dns_criar", d.model_dump())


@rotas_infra.put("/infra/cf/dns/{rid}")
def cf_dns_editar(rid: str, d: RegistroDNS):
    _papel("dono")
    if not rid.isalnum() or len(rid) > 40:
        raise HTTPException(422, "Registro inválido.")
    return _via_agente("cf_dns_editar", {**d.model_dump(), "id": rid})


class Confirmar(BaseModel):
    confirmar: str | None = Field(None, max_length=255)


@rotas_infra.post("/infra/cf/dns/{rid}/apagar")
def cf_dns_apagar(rid: str, d: Confirmar):
    _papel("dono")
    if not rid.isalnum() or len(rid) > 40:
        raise HTTPException(422, "Registro inválido.")
    return _via_agente("cf_dns_apagar", {"id": rid, "confirmar": d.confirmar})


@rotas_infra.get("/infra/cf/dnssec")
def cf_dnssec():
    _papel("dono", "admin")
    return _via_agente("cf_dnssec", {})


class DNSSEC(BaseModel):
    ligar: bool
    confirmar: str | None = Field(None, max_length=255)


@rotas_infra.post("/infra/cf/dnssec")
def cf_dnssec_mudar(d: DNSSEC):
    _papel("dono")
    return _via_agente("cf_dnssec_mudar", d.model_dump())


@rotas_infra.get("/infra/cf/config")
def cf_config():
    _papel("dono", "admin")
    return _via_agente("cf_config", {})


@rotas_infra.get("/infra/cf/email")
def cf_email():
    u = _papel("dono", "admin")
    # a lista de mensagens recebidas (remetente/destinatário) é só do dono: são os e-mails dele
    return _via_agente("cf_email", {"detalhe": u.get("papel") == "dono"})


class RegraEmail(BaseModel):
    acao: str = Field(pattern=r"^(criar|ligar|desligar|apagar)$")
    id: str | None = Field(None, max_length=64, pattern=r"^[A-Za-z0-9]+$")
    local: str | None = Field(None, max_length=64)
    destino: str | None = Field(None, max_length=254)
    nome: str | None = Field(None, max_length=100)


@rotas_infra.post("/infra/cf/email/regra")
def cf_email_regra(d: RegraEmail):
    _papel("dono")
    if d.acao != "criar" and not d.id:
        raise HTTPException(422, "Falta a regra.")
    return _via_agente("cf_email_regra", d.model_dump())


class PegaTudo(BaseModel):
    ativo: bool
    acao: str = Field("forward", pattern=r"^(forward|drop)$")
    destino: str | None = Field(None, max_length=254)


@rotas_infra.post("/infra/cf/email/pega-tudo")
def cf_email_pegatudo(d: PegaTudo):
    _papel("dono")
    return _via_agente("cf_email_pegatudo", d.model_dump())


class Destino(BaseModel):
    email: str = Field(min_length=5, max_length=254)


@rotas_infra.post("/infra/cf/email/destino")
def cf_email_destino(d: Destino):
    _papel("dono")
    return _via_agente("cf_email_destino", d.model_dump())


@rotas_infra.get("/infra/cf/turnstile")
def cf_turnstile(dias: int = 7):
    _papel("dono", "admin")
    return _via_agente("cf_turnstile", {"dias": max(1, min(dias, 30))})


@rotas_infra.get("/infra/cf/auditoria")
def cf_auditoria(limite: int = 50):
    _papel("dono", "admin")
    return _via_agente("cf_auditoria", {"limite": limite})


# ---------- teste de velocidade da rede ----------
@rotas_infra.post("/infra/rede/teste")
def rede_teste_agente():
    """Mede a internet do escritório pelo agente (Raspberry/PC) e o tempo de resposta de cada transmissor."""
    _papel("dono", "admin")
    r = _via_agente("rede_teste", {}, espera=58)
    db.registrar("sistema", "Teste de velocidade da rede do escritório", detalhe=f"↓ {r.get('download')} Mbps · ↑ {r.get('upload')} Mbps · {r.get('latencia')} ms")
    return r


@rotas_infra.get("/infra/rede/historico")
def rede_historico():
    _papel("dono", "admin")
    from .. import rede
    return {"historico": rede.historico()}


@rotas_infra.post("/infra/rede/diagnostico")
def rede_diagnostico():
    """IP público v4/v6, roteador, Wi-Fi, DNS, serviços, traceroute e aparelhos da rede local, medidos pelo agente."""
    _papel("dono", "admin")
    r = _via_agente("rede_diagnostico", {}, espera=58)
    db.registrar("sistema", "Diagnóstico da rede do escritório")
    return r


@rotas_infra.get("/infra/rede/diagnostico")
def rede_diagnostico_ultimo():
    _papel("dono", "admin")
    return {"diagnostico": db.cfg("rede_diagnostico")}


class AgendaRede(BaseModel):
    ativo: bool = False
    a_cada_h: int = Field(6, ge=1, le=168)
    alerta_download_min: float | None = Field(None, ge=0, le=100000)
    alerta_latencia_max: float | None = Field(None, ge=0, le=100000)
    alerta_perda_max: float | None = Field(None, ge=0, le=100)


@rotas_infra.get("/infra/rede/agenda")
def rede_agenda():
    _papel("dono", "admin")
    from .. import rede
    return rede.agenda_cfg()


@rotas_infra.put("/infra/rede/agenda")
def rede_agenda_salvar(d: AgendaRede):
    _papel("dono", "admin")
    from .. import rede
    db.set_cfg(rede.AGENDA, {**rede.agenda_cfg(), **d.model_dump()})
    db.registrar("painel", "Agenda do teste de rede", detalhe=f"{'ligada' if d.ativo else 'desligada'} · a cada {d.a_cada_h} h")
    return rede.agenda_cfg()


@rotas_infra.delete("/infra/rede/historico")
def rede_historico_limpar():
    _papel("dono")
    from .. import rede
    db.set_cfg(rede.HIST, [])
    db.registrar("painel", "Histórico de testes de rede apagado")
    return {"historico": []}


class ResultadoRede(BaseModel):
    download: float | None = Field(None, ge=0, le=100000)
    upload: float | None = Field(None, ge=0, le=100000)
    latencia: float | None = Field(None, ge=0, le=100000)
    latencia_min: float | None = Field(None, ge=0, le=100000)
    jitter: float | None = Field(None, ge=0, le=100000)
    latencia_carga: float | None = Field(None, ge=0, le=100000)
    perda_pct: float | None = Field(None, ge=0, le=100)
    ip: str | None = Field(None, max_length=60)
    colo: str | None = Field(None, max_length=10)
    cidade: str | None = Field(None, max_length=80)
    pais: str | None = Field(None, max_length=4)
    asn: str | None = Field(None, max_length=20)
    navegador: str | None = Field(None, max_length=120)
    conexao: str | None = Field(None, max_length=30)


@rotas_infra.post("/infra/rede/resultado")
def rede_resultado(d: ResultadoRede):
    """O navegador mede a própria conexão e manda o resultado para entrar no histórico."""
    u = _papel("dono", "admin")
    from .. import rede
    return rede.salvar_resultado(d.model_dump(), u.get("nome") or u.get("email", ""))


# ---------- computadores com o agente ----------
@rotas_infra.get("/agentes")
def agentes():
    u = _papel("dono", "admin")
    from .. import convite
    return {"maquinas": coordenador.maquinas(), "principal": coordenador.lider(), "preferido": coordenador.preferido(), "aluguel_s": coordenador.ALUGUEL,
            "convites": convite.pendentes() if u.get("papel") in ("dono", "admin") else []}


@rotas_infra.post("/agentes/convite")
def agentes_convite():
    """Gera o código de instalação de outro computador (dono e admin). O código abre todas as chaves do sistema: uso único, 30 min."""
    u = _papel("dono", "admin")
    return _via_agente("agente_convite", {"criado_por": u.get("email", "")})


class Preferido(BaseModel):
    id: str | None = Field(None, max_length=40)


@rotas_infra.post("/agentes/preferido")
def preferido(d: Preferido):
    _papel("dono", "admin")   # o admin também escolhe quem fica no comando (ex.: o PC Windows dele)
    if d.id and not db.cfg(f"agente_maquina:{d.id}"):
        raise HTTPException(404, "Computador não encontrado.")
    db.set_cfg("agente_preferido", d.id or None)
    db.registrar("sistema", "Computador preferido do agente mudado", detalhe=d.id or "nenhum (quem estiver ligado)")
    return agentes()


class Reiniciar(BaseModel):
    id: str = Field(min_length=1, max_length=40)


@rotas_infra.post("/agentes/reiniciar")
def reiniciar_agente(d: Reiniciar):
    """Pede a um computador que reinicie o agente (ele lê o pedido em até ~10 s e o serviço do sistema o liga de novo).
    Útil no Raspberry Pi sem tela: destrava sem precisar de SSH."""
    u = _papel("dono", "admin")
    m = db.cfg(f"agente_maquina:{d.id}")
    if not m:
        raise HTTPException(404, "Computador não encontrado.")
    if time.time() - int(m.get("visto") or 0) > coordenador.ALUGUEL:
        raise HTTPException(409, "Esse computador está desligado ou sem internet: ele não recebe o pedido.")
    db.set_cfg(f"agente_ordem:{d.id}", {"acao": "reiniciar", "em": int(time.time()), "por": u.get("email", "")})
    db.registrar("sistema", f"Pedido para reiniciar o agente em {m.get('nome') or d.id}", detalhe=f"por {u.get('email', '')}")
    return {"ok": True, "mensagem": f"{m.get('nome') or 'O computador'} reinicia o agente em até 15 s e volta em cerca de 1 minuto."}


class Esquecer(BaseModel):
    id: str = Field(min_length=1, max_length=40)


@rotas_infra.post("/agentes/esquecer")
def esquecer(d: Esquecer):
    _papel("dono")
    m = db.cfg(f"agente_maquina:{d.id}")
    if not m:
        raise HTTPException(404, "Computador não encontrado.")
    if time.time() - int(m.get("visto") or 0) < coordenador.ALUGUEL:
        raise HTTPException(409, "Esse computador está ligado; desligue o agente nele antes de tirar da lista.")
    db.set_cfg(f"agente_maquina:{d.id}", None)
    if coordenador.preferido() == d.id:
        db.set_cfg("agente_preferido", None)
    return agentes()
