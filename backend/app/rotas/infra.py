"""Rotas de Infra (Vercel) e dos computadores com o agente.

A Vercel é operada pelo agente (o token não vai para a nuvem): a nuvem enfileira e espera a resposta.
Ver: dono e administradores. Alterar (colocar no ar, apagar, limpar, retenção, computador preferido): só o dono.
"""
import os
import re
import time

import httpx
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


QUALQUER_AGENTE = {"app_link"}   # precisa do GitHub, que só alguns computadores têm


def _via_agente(op: str, args: dict, espera: float = 40):
    from .. import infra
    if transmissor.PAPEL == "agente":
        try:
            return infra.executar(op, args)
        except infra.ErroInfra as e:
            raise HTTPException(400, str(e)) from e
    if not transmissor.agente_online():
        raise HTTPException(503, "O agente do escritório está offline. A Infra da Vercel passa por ele (o token não fica na nuvem).")
    lid = coordenador.lider() or {}
    principal = db.cfg(f"agente_maquina:{lid.get('id')}") if lid.get("id") else None
    antigo = bool(principal) and not principal.get("versao")
    # principal com código de antes da 0.6.6 recusa operações novas: o pedido vai para qualquer agente atualizado (reserva também).
    # Operações que dependem de um acesso que nem todo computador tem (GitHub) vão sempre para "qualquer": quem tem o acesso
    # pega (infra.capaz), mesmo de reserva. Antes ia para o principal (PC sem GitHub) e falhava toda vez (bug #35, 26/11/2026).
    qualquer = antigo or op in QUALQUER_AGENTE
    fid = transmissor.enfileirar("infra", None, {"op": op, "args": args}, estado="qualquer" if qualquer else "pendente")
    f = transmissor.aguardar(fid, max(espera, 35) if qualquer else espera)
    if f.get("estado") != "ok" and op in QUALQUER_AGENTE and not antigo:
        # ninguém com o acesso respondeu: quem chamou tem um caminho alternativo; não deixa erro na fila (viraria bug falso)
        db.executar("DELETE FROM fila_comandos WHERE id = ?", (fid,))
        raise HTTPException(502, "Nenhum computador do agente com acesso a este serviço respondeu agora.")
    if f.get("estado") != "ok":
        erro = f.get("erro") or "O agente não conseguiu falar com a Vercel."
        if antigo and (erro.startswith("Tempo") or erro == transmissor.sem_agente()):
            nome = principal.get("nome") or "O computador no comando"
            erro = (f"{nome} está no comando com uma versão antiga do agente, e nenhum outro computador atualizado e com o acesso "
                    "necessário respondeu. Rode o instalador uma vez nele (Infra → Agentes → Instalar); depois ele se atualiza sozinho.")
        elif erro.startswith("Operação desconhecida"):   # quem está no comando roda código antigo
            nome = (coordenador.lider() or {}).get("nome") or "O computador no comando"
            erro = (f"{nome} está com uma versão antiga do agente e não conhece esta função. Atualize em Infra → Agentes "
                    "(botão Atualizar agente) ou rode o instalador de novo nele.")
        raise HTTPException(502, erro)
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
# ---------- 0.7.8: Monitor da API, Integrações ao vivo e Limites e cotas (na nuvem, sem agente) ----------
@rotas_infra.get("/infra/monitor")
def monitor_api(horas: int = 24):
    _papel("dono", "admin")
    from .. import infra_extra
    return infra_extra.monitor(horas)


@rotas_infra.get("/infra/integracoes")
def integracoes():
    _papel("dono", "admin")
    from .. import infra_extra
    return {"lido_em": db.agora(), "itens": infra_extra.integracoes()}


@rotas_infra.get("/infra/limites")
def limites():
    _papel("dono", "admin")
    from .. import infra_extra
    return {"lido_em": db.agora(), "itens": infra_extra.limites()}


@rotas_infra.get("/infra/portas")
def portas():
    _papel("dono", "admin")
    return _via_agente("portas", {}, 40)


_STATUS = {"Vercel": "https://www.vercel-status.com/api/v2/summary.json", "Supabase": "https://status.supabase.com/api/v2/summary.json",
           "Cloudflare": "https://www.cloudflarestatus.com/api/v2/summary.json", "Resend": "https://resend-status.com/api/v2/summary.json"}


@rotas_infra.get("/infra/servicos")
def servicos():
    """Situação oficial dos serviços de que o sistema depende (páginas de status públicas) e os dias até cada certificado
    dos domínios vencer. Nada aqui usa segredo."""
    import socket
    import ssl
    from concurrent.futures import ThreadPoolExecutor
    from datetime import datetime, timezone
    _papel("dono", "admin")

    def status(item):
        nome, url = item
        try:
            j = httpx.get(url, timeout=8).json()
            incid = [{"nome": i.get("name"), "impacto": i.get("impact"), "atualizado": i.get("updated_at")} for i in (j.get("incidents") or [])][:5]
            return {"servico": nome, "indicador": (j.get("status") or {}).get("indicator"), "descricao": (j.get("status") or {}).get("description"), "incidentes": incid}
        except Exception as e:  # noqa: BLE001
            return {"servico": nome, "indicador": "desconhecido", "descricao": f"sem resposta ({type(e).__name__})", "incidentes": []}

    def certificado(host):
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((host, 443), timeout=6) as sk, ctx.wrap_socket(sk, server_hostname=host) as ss:
                c = ss.getpeercert()
            fim = datetime.strptime(c["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
            emissor = dict(x[0] for x in c.get("issuer", []))
            return {"host": host, "vence": int(fim.timestamp()), "dias": (fim - datetime.now(timezone.utc)).days, "emissor": emissor.get("organizationName", "")}
        except Exception as e:  # noqa: BLE001
            return {"host": host, "erro": type(e).__name__}
    with ThreadPoolExecutor(8) as ex:
        st = list(ex.map(status, _STATUS.items()))
        certs = list(ex.map(certificado, ["app.zynio.com.br", "zynio.com.br", "www.zynio.com.br"]))
    return {"servicos": st, "certificados": certs, "lido_em": int(datetime.now(timezone.utc).timestamp())}


@rotas_infra.get("/infra/supabase-uso")
def supabase_uso():
    _papel("dono", "admin")
    return _via_agente("supabase_uso", {}, 50)


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
    from .. import atualizar_agente
    maqs = coordenador.maquinas()
    for m in maqs:
        f = db.cfg(f"agente_atualizar_falhou:{m.get('id')}")
        if f:
            m["atualizar_falhou"] = f
    return {"maquinas": maqs, "principal": coordenador.lider(), "preferido": coordenador.preferido(), "aluguel_s": coordenador.ALUGUEL,
            "convites": convite.pendentes() if u.get("papel") in ("dono", "admin") else [],
            "versao_publicada": atualizar_agente.versao_publicada(), "auto_atualizar": atualizar_agente.auto_ligado()}


class AutoAtualizar(BaseModel):
    ativo: bool


@rotas_infra.put("/agentes/auto-atualizar")
def agentes_auto_atualizar(d: AutoAtualizar):
    u = _papel("dono", "admin")
    from .. import atualizar_agente
    db.set_cfg(atualizar_agente.CHAVE_AUTO, {"ativo": d.ativo})
    db.registrar("sistema", f"Atualização automática dos agentes {'ligada' if d.ativo else 'desligada'}", detalhe=f"por {u.get('email', '')}")
    return {"ok": True, "ativo": d.ativo}


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


@rotas_infra.post("/agentes/atualizar")
def atualizar_agente_rota(d: Reiniciar):
    """Pede a um computador que baixe a versão mais nova do código, confira e reinicie (Mac, Windows, Linux, Raspberry)."""
    u = _papel("dono", "admin")
    m = db.cfg(f"agente_maquina:{d.id}")
    if not m:
        raise HTTPException(404, "Computador não encontrado.")
    if time.time() - int(m.get("visto") or 0) > coordenador.ALUGUEL:
        raise HTTPException(409, "Esse computador está desligado ou sem internet: ele não recebe o pedido.")
    if not m.get("versao"):
        raise HTTPException(409, f"{m.get('nome') or 'Esse computador'} tem um agente de antes da atualização pelo painel: rode o instalador "
                                 "de novo nele uma vez (Infra → Agentes → Instalar). Depois ele se atualiza sozinho.")
    if m.get("docker"):
        raise HTTPException(409, "Agente no Docker: atualize recriando o contêiner (rode o instalador de novo com --docker).")
    db.set_cfg(f"agente_atualizar_falhou:{d.id}", None)
    db.set_cfg(f"agente_ordem:{d.id}", {"acao": "atualizar", "em": int(time.time()), "por": u.get("email", "")})
    db.registrar("sistema", f"Pedido para atualizar o agente em {m.get('nome') or d.id}", detalhe=f"por {u.get('email', '')}")
    return {"ok": True, "mensagem": f"{m.get('nome') or 'O computador'} baixa a versão nova em até 15 s e volta em 1 a 3 minutos "
                                    "(no Raspberry pode levar mais se houver dependências novas)."}


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
