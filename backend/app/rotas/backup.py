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
    return u.get("email") or u.get("nome") or "?"


class GerarIn(BaseModel):
    tabelas: list[str] | None = Field(None, max_length=200)


class EnvioIn(BaseModel):
    tamanho: int = Field(gt=0, le=bs.LIMITE_ENVIO)


class RestaurarIn(BaseModel):
    arquivo: str = Field(min_length=5, max_length=120)
    modo: str = Field(pattern="^(simular|mesclar|substituir)$")
    tabelas: list[str] | None = Field(None, max_length=200)
    confirmacao: str = ""


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
    return {"arquivos": bs.listar(), "automaticos": auto}


@rotas_backup.post("/gerar")
def gerar(d: GerarIn, request: Request):
    quem = _quem(request)
    try:
        return bs.gerar(quem, d.tabelas)
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
        return bs.restaurar(d.arquivo, d.modo, d.tabelas, quem)
    except Exception as e:  # noqa: BLE001
        _erro(e)
