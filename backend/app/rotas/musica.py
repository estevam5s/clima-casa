"""Rotas da Música (Spotify). Configurar o app e conectar: dono/admin. Tocar e rotinas: quem controla aparelhos."""
import re
import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import musica
from ..seguranca import exigir_login

rotas_musica = APIRouter(prefix="/api/musica", dependencies=[Depends(exigir_login)])
# volta do Spotify sem exigir login: o "state" (aleatório, 10 min, uso único, criado por um admin logado) é a prova.
# Assim funciona mesmo quando o Spotify devolve num navegador ou app onde o painel não está logado.
publico_musica = APIRouter(prefix="/api/musica")


def _admin():
    from .. import acesso
    u = acesso.atual.get()
    if not u or u.get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono e os administradores configuram o Spotify.")


def _controla():
    from .. import acesso
    if not acesso.pode("aparelhos.controlar"):
        raise HTTPException(403, "Sua conta não pode controlar a música.")


def _sp(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except musica.ErroSpotify as e:
        raise HTTPException(e.status, str(e)) from e


@rotas_musica.get("/estado")
def estado():
    return musica.estado()


class Credenciais(BaseModel):
    client_id: str = Field(min_length=20, max_length=64, pattern=r"^[A-Za-z0-9]+$")
    client_secret: str = Field(min_length=20, max_length=64, pattern=r"^[A-Za-z0-9]+$")


@rotas_musica.put("/credenciais")
def credenciais(d: Credenciais):
    _admin()
    musica.salvar_credenciais(d.client_id.strip(), d.client_secret.strip())
    return musica.estado()


@rotas_musica.get("/conectar")
def conectar():
    _admin()
    return {"url": _sp(musica.url_login)}


class Retorno(BaseModel):
    code: str = Field(min_length=10, max_length=1000)
    state: str = Field(min_length=10, max_length=100)


@rotas_musica.post("/retorno")
def retorno(d: Retorno):
    _admin()
    return _sp(musica.concluir_login, d.code, d.state)


@publico_musica.post("/spotify-retorno")
def retorno_publico(d: Retorno):
    e = _sp(musica.concluir_login, d.code, d.state)
    return {"conectado": e["conectado"], "conta": (e.get("conta") or {}).get("nome")}


@rotas_musica.post("/desconectar")
def desconectar():
    _admin()
    musica.desconectar()
    return musica.estado()


@rotas_musica.get("/tocando")
def tocando():
    _controla()
    return _sp(musica.tocando)


class Comando(BaseModel):
    acao: str = Field(pattern=r"^(tocar|pausar|proxima|anterior|volume|aleatorio|repetir|transferir|fila)$")
    device_id: str | None = Field(None, max_length=80)
    uri: str | None = Field(None, max_length=120, pattern=r"^spotify:[a-z]+:[A-Za-z0-9:]+$")
    volume: int | None = Field(None, ge=0, le=100)
    valor: bool | str | None = None


@rotas_musica.post("/comando")
def comando(d: Comando):
    _controla()
    _sp(musica.comando, d.acao, device_id=d.device_id, uri=d.uri, volume=d.volume, valor=d.valor)
    time.sleep(0.35)   # o Spotify demora um instante para refletir a mudança
    return _sp(musica.tocando)


@rotas_musica.get("/buscar")
def buscar(q: str):
    _controla()
    q = q.strip()[:100]
    if len(q) < 2:
        return {"playlists": [], "tracks": [], "albums": [], "artists": []}
    return _sp(musica.buscar, q)


@rotas_musica.get("/playlists")
def playlists():
    _controla()
    return _sp(musica.playlists)


HHMM = r"^([01]\d|2[0-3]):[0-5]\d$"


class Gatilho(BaseModel):
    tipo: str = Field(pattern=r"^(horario|ar_ligou|ar_desligou)$")
    hora: str | None = Field(None, pattern=HHMM)
    dias: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5], max_length=7)
    aparelho_id: int | None = None


class Janela(BaseModel):
    inicio: str | None = Field(None, pattern=HHMM)
    fim: str | None = Field(None, pattern=HHMM)


class Acao(BaseModel):
    tipo: str = Field(pattern=r"^(tocar|pausar|volume|proxima)$")
    uri: str | None = Field(None, max_length=120, pattern=r"^spotify:[a-z]+:[A-Za-z0-9:]+$")
    nome: str = Field("", max_length=120)
    capa: str = Field("", max_length=300)
    aparelho_nome: str = Field("", max_length=80)
    volume: int | None = Field(None, ge=0, le=100)
    aleatorio: bool | None = None


class Rotina(BaseModel):
    id: str = Field(min_length=1, max_length=40, pattern=r"^[\w-]+$")
    nome: str = Field(min_length=1, max_length=60)
    ativo: bool = True
    gatilho: Gatilho
    janela: Janela = Field(default_factory=Janela)
    acao: Acao
    ultima: str | None = None


@rotas_musica.get("/rotinas")
def ver_rotinas():
    return musica.rotinas()


@rotas_musica.put("/rotinas")
def salvar_rotinas(lista: Annotated[list[Rotina], Field(max_length=100)]):
    _controla()
    for r in lista:
        if r.gatilho.tipo == "horario" and not r.gatilho.hora:
            raise HTTPException(422, f"A rotina “{r.nome}” precisa de um horário.")
        if r.acao.tipo == "tocar" and not r.acao.uri:
            raise HTTPException(422, f"Escolha o que tocar na rotina “{r.nome}”.")
    musica.salvar_rotinas([r.model_dump() for r in lista])
    return musica.rotinas()


class Testar(BaseModel):
    id: str = Field(pattern=r"^[\w-]+$")


@rotas_musica.post("/rotinas/testar")
def testar_rotina(d: Testar):
    _controla()
    r = next((x for x in musica.rotinas() if x.get("id") == d.id), None)
    if not r:
        raise HTTPException(404, "Rotina não encontrada (salve antes de testar).")
    ok = musica.executar_rotina(r, "teste pelo painel")
    if not ok:
        raise HTTPException(502, "A rotina falhou. Veja o motivo em Atividade.")
    return {"ok": True}
