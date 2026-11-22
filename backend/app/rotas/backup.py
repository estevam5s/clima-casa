"""Rota /backup: backup completo, lista, download, apagar, envio de um .zip e restauração (simular, mesclar, substituir).
Só dono ou admin; além disso o acesso.py exige acesso a todos os projetos para tudo que começa com /api/backup."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import backup_sistema as bs, db
from ..seguranca import exigir_login

rotas_backup = APIRouter(prefix="/api/backup-sistema", dependencies=[Depends(exigir_login)])


def _quem(request: Request) -> str:
    u = getattr(request.state, "u", None) or {}
    if u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono ou um administrador faz backup e restauração.")
    return u.get("nome") or (u.get("email") or "?").split("@")[0]   # nome, não o e-mail (aparece no manifesto e na tela)


class GerarIn(BaseModel):
    tabelas: list[str] | None = Field(None, max_length=200)


class EnvioIn(BaseModel):
    tamanho: int = Field(gt=0, le=bs.LIMITE_ENVIO)


class RestaurarIn(BaseModel):
    arquivo: str = Field(min_length=5, max_length=120)
    modo: str = Field(pattern="^(simular|mesclar|substituir)$")
    tabelas: list[str] | None = Field(None, max_length=200)
    chaves: list[str] | None = Field(None, max_length=500)   # só estas linhas (uma tabela)
    seguranca: bool = True                                    # backup das tabelas antes de gravar
    confirmacao: str = ""


class GerarRotuloIn(BaseModel):
    tabelas: list[str] | None = Field(None, max_length=200)
    rotulo: str = Field("", max_length=120)


class RotuloIn(BaseModel):
    arquivo: str = Field(min_length=5, max_length=120)
    rotulo: str = Field("", max_length=120)


class AgendaIn(BaseModel):
    ativo: bool
    frequencia: str = Field(pattern="^(diario|semanal)$")
    hora: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    dia_semana: int = Field(0, ge=0, le=6)
    manter: int = Field(7, ge=1, le=60)
    grupos: list[str] | None = Field(None, max_length=10)


def _erro(e: Exception):
    if isinstance(e, KeyError):
        raise HTTPException(404, str(e).strip("'"))
    if isinstance(e, ValueError):
        raise HTTPException(400, str(e))
    raise HTTPException(502, str(e))


@rotas_backup.get("/tabelas")
def tabelas(request: Request):
    _quem(request)
    return {"tabelas": bs.tabelas(), "grupos": {k: {"descricao": d, "tabelas": t} for k, (d, t) in bs.GRUPOS.items()}}


@rotas_backup.get("")
def listar(request: Request):
    _quem(request)
    auto = db.consultar("SELECT id, criado_em, length(dados::text) AS tamanho FROM backups ORDER BY id DESC LIMIT 14")
    arquivos = bs.listar()
    uso = {}
    for a in arquivos:
        t = uso.setdefault(a["tipo"], {"arquivos": 0, "bytes": 0}); t["arquivos"] += 1; t["bytes"] += a["tamanho"] or 0
    return {"arquivos": arquivos, "automaticos": auto, "agenda": bs.agenda(), "uso": uso}


@rotas_backup.post("/gerar")
def gerar(d: GerarRotuloIn, request: Request):
    quem = _quem(request)
    try:
        return bs.gerar(quem, d.tabelas, rotulo=d.rotulo)
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.get("/baixar/{arquivo}")
def baixar(arquivo: str, request: Request):
    _quem(request)
    try:
        return {"url": bs.link(arquivo)}
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.get("/automatico/{bid}")
def automatico(bid: int, request: Request):
    _quem(request)
    b = db.um("SELECT id, criado_em, dados FROM backups WHERE id = ?", (bid,))
    if not b:
        raise HTTPException(404, "Backup automático não encontrado.")
    return b


@rotas_backup.delete("/{arquivo}")
def apagar(arquivo: str, request: Request):
    _quem(request)
    try:
        bs.apagar(arquivo)
    except Exception as e:  # noqa: BLE001
        _erro(e)
    return {"ok": True}


@rotas_backup.post("/envio")
def envio(d: EnvioIn, request: Request):
    _quem(request)
    try:
        return bs.preparar_envio(d.tamanho)
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.post("/restaurar")
def restaurar(d: RestaurarIn, request: Request):
    quem = _quem(request)
    if d.modo != "simular" and d.confirmacao != "RESTAURAR":
        raise HTTPException(400, "Para gravar, digite RESTAURAR.")
    if d.modo == "substituir" and not d.tabelas:
        raise HTTPException(400, "Substituir exige escolher as tabelas (nunca o banco inteiro de uma vez).")
    try:
        return bs.restaurar(d.arquivo, d.modo, d.tabelas, quem, chaves=d.chaves, seguranca=d.seguranca)
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.get("/agenda")
def ver_agenda(request: Request):
    _quem(request)
    return bs.agenda()


@rotas_backup.put("/agenda")
def mudar_agenda(d: AgendaIn, request: Request):
    quem = _quem(request)
    if d.grupos and any(g not in bs.GRUPOS for g in d.grupos):
        raise HTTPException(422, "Grupo de tabelas desconhecido.")
    r = bs.salvar_agenda(d.model_dump())
    db.registrar("painel", "Backup agendado " + ("ligado" if d.ativo else "desligado"), detalhe=f"{d.frequencia} às {d.hora}, guarda {d.manter} · {quem}")
    return r


@rotas_backup.put("/rotulo")
def rotulo(d: RotuloIn, request: Request):
    _quem(request)
    try:
        bs.rotular(d.arquivo, d.rotulo)
    except Exception as e:  # noqa: BLE001
        _erro(e)
    return {"ok": True}


@rotas_backup.get("/manifesto/{arquivo}")
def manifesto(arquivo: str, request: Request):
    _quem(request)
    try:
        return bs.manifesto(arquivo)
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.get("/comparar")
def comparar(a: str, b: str, request: Request):
    _quem(request)
    try:
        return bs.comparar(a, b)
    except Exception as e:  # noqa: BLE001
        _erro(e)


@rotas_backup.get("/linhas")
def linhas(arquivo: str, tabela: str, request: Request, q: str = ""):
    _quem(request)
    if len(q) > 100 or len(tabela) > 64:
        raise HTTPException(422, "Busca longa demais.")
    try:
        return bs.linhas(arquivo, tabela, q)
    except Exception as e:  # noqa: BLE001
        _erro(e)
