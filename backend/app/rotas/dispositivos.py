"""Rotas da cafeteira, das persianas, das luzes e da fechadura (aparelhos Tuya/Smart Life do escritório). Ver app/dispositivos.py.

Permissões (acesso.REGRAS): ver = qualquer pessoa logada (no escopo de projetos dela); comandar cafeteira e persianas =
aparelhos.controlar; cadastrar, conectar, configurar e apagar = transmissores.gerenciar; a fechadura (trancar/destrancar
e configurar) só dono e admin, e destrancar pede a senha de novo (POST com "senha").
"""
from __future__ import annotations

import httpx
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import acesso, db, dispositivos
from ..seguranca import exigir_login

rotas_disp = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])
publico_iot = APIRouter(prefix="/api")   # só a sincronização das placas (autenticada pelo token da placa)


def _escopo() -> tuple[str, tuple]:
    f, p = acesso.filtro_sql("d.projeto_id")
    if f:   # aparelho sem projeto (ex.: fechadura da entrada) é do escritório todo: aparece para quem tem algum projeto
        f = f" AND (d.projeto_id IS NULL OR true{f})"
    return f, p


def _pegar(did: int) -> dict:
    try:
        d = dispositivos.um(did)
    except KeyError as e:
        raise HTTPException(404, str(e)) from e
    if d["projeto_id"]:
        acesso.checar_projeto(d["projeto_id"]) if acesso.projetos_permitidos() is not None else None
    return d


def _so_dono_admin():
    u = acesso.atual.get() or {}
    if u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores mexem na fechadura.")
    return u


@rotas_disp.get("/dispositivos")
def listar(tipo: str | None = None):
    if tipo and tipo not in dispositivos.TIPOS:
        raise HTTPException(400, "Tipo inválido.")
    f, p = _escopo()
    out = {"dispositivos": dispositivos.listar(tipo, f, p)}
    if tipo == "luz":   # a tela mostra o horário real de hoje (a automação de anoitecer usa o mesmo cálculo)
        out["sol"] = dispositivos.sol_do_dia()
        out["noite"] = dispositivos.e_noite()
    return out


@rotas_disp.get("/dispositivos/disponiveis")
def disponiveis():
    """Tomadas, motores de cortina e fechaduras da conta Smart Life conectada (para conectar a um item)."""
    try:
        return {"aparelhos": dispositivos.disponiveis()}
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"A conta Smart Life não respondeu: {e}") from e


class NovoIn(BaseModel):
    tipo: str = Field(pattern="^(cafeteira|persiana|fechadura|luz)$")
    nome: str = Field(min_length=1, max_length=60)
    projeto_id: int | None = None
    mapa_elemento: str = Field("", max_length=40)


@rotas_disp.post("/dispositivos")
def criar(d: NovoIn):
    if d.tipo == "fechadura":
        _so_dono_admin()
        if db.um("SELECT 1 FROM dispositivos WHERE tipo = 'fechadura'"):
            raise HTTPException(409, "Já existe a fechadura da porta do escritório.")
    if d.projeto_id:
        acesso.checar_projeto(d.projeto_id) if acesso.projetos_permitidos() is not None else None
    did = db.um("INSERT INTO dispositivos (tipo, nome, projeto_id, mapa_elemento, criado_em) VALUES (?,?,?,?,?) RETURNING id",
                (d.tipo, d.nome.strip(), d.projeto_id, d.mapa_elemento, db.agora()))["id"]
    dispositivos.evento(did, "Cadastrado", "painel")
    db.registrar("painel", f"{d.tipo.capitalize()} cadastrada: {d.nome.strip()}")
    return dispositivos.um(did)


class EditarIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)
    projeto_id: int | None = None
    mapa_elemento: str = Field("", max_length=40)


@rotas_disp.put("/dispositivos/{did}")
def editar(did: int, d: EditarIn):
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    db.executar("UPDATE dispositivos SET nome = ?, projeto_id = ?, mapa_elemento = ? WHERE id = ?", (d.nome.strip(), d.projeto_id, d.mapa_elemento, did))
    return dispositivos.um(did)


@rotas_disp.delete("/dispositivos/{did}")
def apagar(did: int):
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    db.executar("DELETE FROM dispositivos WHERE id = ?", (did,))
    db.registrar("painel", f"Aparelho removido: {atual['nome']}")
    return {"ok": True}


class ConectarIn(BaseModel):
    tuya_id: str = Field(min_length=6, max_length=40, pattern=r"^[A-Za-z0-9]+$")
    tecla: str | None = Field(None, pattern=r"^switch_\d{1,2}$")


@rotas_disp.get("/dispositivos/teclas/{tuya_id}")
def ver_teclas(tuya_id: str):
    """Teclas de um interruptor da conta Smart Life (Novadigital 4 teclas = switch_1…switch_4) e as já usadas."""
    if not re.fullmatch(r"[A-Za-z0-9]{6,40}", tuya_id):
        raise HTTPException(422, "Aparelho inválido.")
    try:
        return dispositivos.teclas(tuya_id)
    except KeyError as e:
        raise HTTPException(404, str(e).strip("'")) from e
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e


class TeclaIn(BaseModel):
    tecla: str = Field(pattern=r"^switch_\d{1,2}$")
    nome: str = Field(min_length=1, max_length=60)
    projeto_id: int | None = None


class InterruptorIn(BaseModel):
    tuya_id: str = Field(min_length=6, max_length=40, pattern=r"^[A-Za-z0-9]+$")
    teclas: list[TeclaIn] = Field(min_length=1, max_length=8)


@rotas_disp.post("/dispositivos/interruptor")
def criar_interruptor(d: InterruptorIn):
    """Uma luz para cada tecla escolhida do interruptor (cada uma com nome e sala próprios)."""
    info = ver_teclas(d.tuya_id)
    ja = {u["tecla"] for u in info["usadas"]}
    for t in d.teclas:
        if t.tecla not in info["teclas"]:
            raise HTTPException(400, f"O interruptor não tem a tecla {t.tecla}.")
        if t.tecla in ja:
            raise HTTPException(409, f"A tecla {t.tecla.split('_')[1]} já está cadastrada.")
        if t.projeto_id and acesso.projetos_permitidos() is not None:
            acesso.checar_projeto(t.projeto_id)
    criadas = []
    for t in d.teclas:
        did = db.um("INSERT INTO dispositivos (tipo, nome, projeto_id, mapa_elemento, criado_em) VALUES ('luz',?,?,'',?) RETURNING id",
                    (t.nome.strip(), t.projeto_id, db.agora()))["id"]
        dispositivos.evento(did, "Cadastrado", "painel", True, f"tecla {t.tecla.split('_')[1]} de {info['nome']}")
        try:
            criadas.append(dispositivos.conectar(did, d.tuya_id, t.tecla))
        except Exception as e:  # noqa: BLE001
            db.executar("DELETE FROM dispositivos WHERE id = ?", (did,))
            raise HTTPException(502, f"Não deu para ligar a tecla {t.tecla.split('_')[1]}: {e}") from e
    db.registrar("painel", f"Interruptor cadastrado: {info['nome']}", detalhe=f"{len(criadas)} tecla(s)")
    return {"criadas": criadas}


@rotas_disp.post("/dispositivos/{did}/conectar")
def conectar(did: int, d: ConectarIn):
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    try:
        return dispositivos.conectar(did, d.tuya_id, d.tecla)
    except (KeyError, ValueError) as e:
        raise HTTPException(400, str(e).strip("'")) from e


class PlacaIn(BaseModel):
    placa: str = Field(pattern=r"^[a-z0-9_]{3,30}$")


@rotas_disp.post("/dispositivos/{did}/placa")
def configurar_placa(did: int, d: PlacaIn):
    """Liga o aparelho a uma placa própria (Arduino/ESP) e devolve o token UMA vez, para colar no código da placa."""
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    try:
        r = dispositivos.gerar_token_placa(did, d.placa)
    except (ValueError, KeyError) as e:
        raise HTTPException(400, str(e).strip("'")) from e
    db.registrar("painel", f"{atual['nome']}: placa própria configurada", detalhe=r["nome_placa"])
    return {**r, "dispositivo": dispositivos.um(did)}


@rotas_disp.post("/dispositivos/{did}/tuya")
def voltar_tuya(did: int):
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    return dispositivos.voltar_para_tuya(did)


@rotas_disp.get("/dispositivos/placas")
def placas():
    return {"placas": dispositivos.PLACAS}


class SincIn(BaseModel):
    estado: dict = Field(default_factory=dict)
    feitos: list[str] = Field(default_factory=list, max_length=50)
    firmware: str | None = Field(None, max_length=40)
    placa: str | None = Field(None, max_length=40)
    rssi: int | None = Field(None, ge=-150, le=0)
    ip: str | None = Field(None, max_length=45)
    uptime_s: int | None = Field(None, ge=0)
    heap: int | None = Field(None, ge=0)


@publico_iot.post("/iot/sincronizar")
def sincronizar(d: SincIn, request: Request):
    """Placa Arduino/ESP: manda o estado e recebe os comandos pendentes. Token no cabeçalho Authorization: Bearer cp_…"""
    from .. import firewall
    ip = firewall.ip_do_pedido(request)
    tok = (request.headers.get("authorization") or "").removeprefix("Bearer ").strip()
    if firewall.falhas_recentes(ip, ("iot_token",), 10) >= 20:
        raise HTTPException(429, "Muitas tentativas com token inválido.")
    r = dispositivos.sincronizar(tok, d.model_dump()) if tok else None
    if r is None:
        firewall.registrar(ip, "iot_token", "/api/iot/sincronizar", "token de placa inválido")
        raise HTTPException(401, "Token da placa inválido. Gere outro no painel.")
    return r


class ComandoIn(BaseModel):
    acao: str = Field(pattern="^(ligar|desligar|abrir|fechar|parar|posicao|trancar|destrancar|brilho)$")
    valor: int | None = Field(None, ge=0, le=100)
    senha: str | None = Field(None, max_length=200)
    turnstile: str | None = Field(None, max_length=4096)


def _conferir_senha(request: Request, email: str, senha: str | None, token: str | None):
    """Mesma conferência de /api/conta/conferir-senha (com o CAPTCHA do Supabase e o limite de tentativas por IP)."""
    from .. import firewall, turnstile
    if not senha:
        raise HTTPException(428, "Para destrancar a porta, confirme a sua senha.")
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("senha_atual_errada",), 15) >= 5:
        raise HTTPException(429, "Muitas tentativas. Espere 15 minutos.")
    if turnstile.no_supabase() and not token:
        raise HTTPException(400, "Confirme que você não é um robô (verificação da Cloudflare) e tente de novo.")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/token?grant_type=password", timeout=12,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}, json={"email": email, "password": senha, **turnstile.corpo_supabase(token)})
    dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 and turnstile.recusado_pelo_captcha(dados):
        raise HTTPException(400, "A verificação contra robôs falhou ou expirou. Tente de novo.")
    if r.status_code != 200 or not dados.get("access_token"):
        firewall.registrar(ip, "senha_atual_errada", "/api/dispositivos/comando", email[:3] + "…")
        raise HTTPException(401, "Senha não confere.")
    try:   # a sessão aberta só para conferir não fica viva
        httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/logout?scope=local", timeout=8,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"], "Authorization": f"Bearer {dados['access_token']}"})
    except httpx.HTTPError:
        pass


@rotas_disp.post("/dispositivos/{did}/comando")
def comandar(did: int, d: ComandoIn, request: Request):
    atual = _pegar(did)
    validas = dispositivos.ACOES[atual["tipo"]]
    if d.acao not in validas:
        raise HTTPException(400, "Ação não vale para este aparelho.")
    if atual["tipo"] == "fechadura":
        u = _so_dono_admin()
        if d.acao == "destrancar":
            _conferir_senha(request, u["email"], d.senha, d.turnstile)
    u = acesso.atual.get() or {}
    try:
        return dispositivos.comando(did, d.acao, d.valor, f"painel:{(u.get('nome') or u.get('email') or '')[:30]}")
    except RuntimeError as e:
        raise HTTPException(409, str(e)) from e


@rotas_disp.post("/dispositivos/{did}/atualizar")
def atualizar(did: int):
    _pegar(did)
    return dispositivos.atualizar(did)


@rotas_disp.get("/dispositivos/{did}/eventos")
def eventos(did: int, limite: int = 60):
    _pegar(did)
    return {"eventos": dispositivos.eventos(did, max(1, min(limite, 300)))}


class AgendaIn(BaseModel):
    dias: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5], max_length=7)
    hora: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    acao: str = Field(pattern="^(ligar|desligar|abrir|fechar|posicao|brilho)$")
    valor: int | None = Field(None, ge=0, le=100)
    nome: str = Field("", max_length=40)


class SolIn(BaseModel):
    ativo: bool = False
    temp_min: float = Field(27, ge=10, le=45)
    posicao: int = Field(30, ge=0, le=100)
    das: str = Field("10:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    ate: str = Field("16:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class AnoitecerIn(BaseModel):
    ativo: bool = False
    antes_min: int = Field(15, ge=0, le=120)
    ate: str = Field("19:30", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    dias: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5], max_length=7)


class ConfigIn(BaseModel):
    agendas: list[AgendaIn] | None = Field(None, max_length=30)
    desligar_apos_min: int | None = Field(None, ge=0, le=600)
    capsulas: int | None = Field(None, ge=0, le=10000)
    capsulas_alerta: int | None = Field(None, ge=0, le=500)
    potencia_w: int | None = Field(None, ge=100, le=5000)
    sol_forte: SolIn | None = None
    auto_trancar_min: int | None = Field(None, ge=0, le=240)
    alertar_fora_expediente: bool | None = None
    expediente: list[str] | None = Field(None, min_length=2, max_length=2)
    anoitecer: AnoitecerIn | None = None
    com_fechadura: bool | None = None
    brilho_padrao: int | None = Field(None, ge=1, le=100)


@rotas_disp.put("/dispositivos/{did}/config")
def configurar(did: int, d: ConfigIn):
    import json
    atual = _pegar(did)
    if atual["tipo"] == "fechadura":
        _so_dono_admin()
    novo = {**atual["config"], **{k: v for k, v in d.model_dump(exclude_none=True).items()}}
    db.executar("UPDATE dispositivos SET config = CAST(? AS jsonb) WHERE id = ?", (json.dumps(novo), did))
    dispositivos.evento(did, "Configuração alterada", "painel")
    return dispositivos.um(did)


@rotas_disp.post("/dispositivos/{did}/cafe")
def registrar_cafe(did: int):
    """Alguém fez um café: conta no dia e desconta uma cápsula do estoque."""
    import json
    atual = _pegar(did)
    if atual["tipo"] != "cafeteira":
        raise HTTPException(400, "Só para a cafeteira.")
    cfg = atual["config"]
    cfg["capsulas"] = max(0, int(cfg.get("capsulas") or 0) - 1)
    db.executar("UPDATE dispositivos SET config = CAST(? AS jsonb) WHERE id = ?", (json.dumps(cfg), did))
    u = acesso.atual.get() or {}
    dispositivos.evento(did, "Café", f"painel:{(u.get('nome') or u.get('email') or '')[:30]}")
    if cfg["capsulas"] <= int(cfg.get("capsulas_alerta") or 0):
        from .. import notificacoes
        notificacoes.notificar(f"cafeteira:{did}:capsulas", "aviso", "media", "Cápsulas de café acabando", f"Restam {cfg['capsulas']}.", link="/cafeteira")
    return dispositivos.um(did)
