"""Rotas dos fluxos (Rotinas → Fluxos). Ver backend/app/fluxos.py.

Logado: ver (qualquer pessoa), criar/editar/ligar/apagar (automacoes.gerenciar), executar (aparelhos.controlar).
Público: POST /api/fluxos/gancho/{token} (gatilho webhook; token secreto de 32 caracteres, só de fluxo ativo, 20 por minuto).
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import acesso, db, fluxos
from ..seguranca import exigir_login

rotas_fluxos = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])
publico_fluxos = APIRouter(prefix="/api")


def _fluxo(fid: int) -> dict:
    f = db.um("SELECT * FROM fluxos WHERE id = ?", (fid,))
    if not f:
        raise HTTPException(404, "Fluxo não encontrado.")
    return f


def _permitidos():
    from .api import _ids_aparelhos_permitidos
    return _ids_aparelhos_permitidos()


def _resumo(f: dict) -> dict:
    g = f["grafo"] or {}
    return {"id": f["id"], "nome": f["nome"], "descricao": f["descricao"], "ativo": f["ativo"], "gatilhos": fluxos.resumo_gatilhos(g),
            "blocos": len(g.get("nos", [])), "ligacoes": len(g.get("ligacoes", [])), "ultima_exec": f["ultima_exec"],
            "ultimo_estado": f["ultimo_estado"], "execucoes": f["execucoes"], "atualizado_em": f["atualizado_em"],
            "tipos": sorted({n["tipo"] for n in g.get("nos", [])})}


@rotas_fluxos.get("/fluxos")
def listar():
    return [_resumo(f) for f in db.consultar("SELECT * FROM fluxos ORDER BY ativo DESC, atualizado_em DESC NULLS LAST")]


@rotas_fluxos.get("/fluxos/catalogo")
def catalogo():
    """Blocos disponíveis e as opções dos campos (ares, cenas, aparelhos, projetos, pessoas)."""
    from .api import _escopo
    f, p = _escopo("a.projeto_id")
    ares = db.consultar(f"SELECT a.id, a.nome, a.projeto_id FROM aparelhos a WHERE true{f} ORDER BY a.nome", p)
    return {
        "categorias": fluxos.CATEGORIAS,
        "blocos": {k: {**{kk: vv for kk, vv in v.items() if kk != "campos"}, "portas": v.get("portas") or ["saida"],
                       "campos": [{"nome": n, "tipo": t, "rotulo": r, "extra": e} for n, t, r, e in v["campos"]]} for k, v in fluxos.CATALOGO.items()},
        "opcoes": {
            "ar": [{"id": a["id"], "nome": a["nome"]} for a in ares],
            "cena": [{"id": c["id"], "nome": c["nome"]} for c in db.consultar("SELECT id, nome FROM cenas ORDER BY nome")],
            "dispositivo": [{"id": d["id"], "nome": f"{d['nome']} ({d['tipo']})"} for d in db.consultar("SELECT id, nome, tipo FROM dispositivos ORDER BY tipo, nome")],
            "projeto": [{"id": p["id"], "nome": p["nome"]} for p in db.consultar("SELECT id, nome FROM projetos ORDER BY nome")],
            "pessoas": [{"id": str(u["id"]), "nome": u["nome"] or u["email"]} for u in db.consultar("SELECT id, nome, email FROM usuarios WHERE ativo ORDER BY nome")],
        },
    }


class FluxoIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    descricao: str = Field("", max_length=400)
    grafo: dict = Field(default_factory=dict)
    ativo: bool | None = None


def _salvar(f_id: int | None, d: FluxoIn, request: Request) -> dict:
    try:
        grafo = fluxos.validar(d.grafo, _permitidos())
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    if d.ativo and not any(fluxos.CATALOGO[n["tipo"]]["cat"] == "gatilho" for n in grafo["nos"]):
        raise HTTPException(422, "Para ligar o fluxo, coloque pelo menos um gatilho.")
    u = request.state.u
    agora = db.agora()
    if f_id is None:
        f_id = db.um("INSERT INTO fluxos (nome, descricao, grafo, ativo, criado_por, criado_em, atualizado_em) VALUES (?, ?, CAST(? AS jsonb), ?, ?, ?, ?) RETURNING id",
                     (d.nome.strip(), d.descricao.strip(), json.dumps(grafo), bool(d.ativo), u.get("email"), agora, agora))["id"]
        db.registrar("painel", f"Fluxo criado: {d.nome.strip()}", detalhe=f"{len(grafo['nos'])} bloco(s)")
    else:
        _fluxo(f_id)
        ativo_sql, extra = (", ativo = ?", (bool(d.ativo),)) if d.ativo is not None else ("", ())
        db.executar(f"UPDATE fluxos SET nome = ?, descricao = ?, grafo = CAST(? AS jsonb), atualizado_em = ?{ativo_sql} WHERE id = ?",
                    (d.nome.strip(), d.descricao.strip(), json.dumps(grafo), agora, *extra, f_id))
        db.registrar("painel", f"Fluxo salvo: {d.nome.strip()}", detalhe=f"{len(grafo['nos'])} bloco(s)")
    return ver(f_id)


@rotas_fluxos.post("/fluxos")
def criar(d: FluxoIn, request: Request):
    if (db.um("SELECT count(*) n FROM fluxos") or {}).get("n", 0) >= 200:
        raise HTTPException(409, "Limite de 200 fluxos.")
    return _salvar(None, d, request)


@rotas_fluxos.get("/fluxos/{fid}")
def ver(fid: int):
    f = _fluxo(fid)
    return {**_resumo(f), "grafo": f["grafo"], "criado_por": f["criado_por"], "criado_em": f["criado_em"]}


@rotas_fluxos.put("/fluxos/{fid}")
def editar(fid: int, d: FluxoIn, request: Request):
    return _salvar(fid, d, request)


class AtivoIn(BaseModel):
    ativo: bool


@rotas_fluxos.put("/fluxos/{fid}/ativo")
def ligar(fid: int, d: AtivoIn):
    f = _fluxo(fid)
    if d.ativo and not fluxos.resumo_gatilhos(f["grafo"]):
        raise HTTPException(422, "Para ligar o fluxo, coloque pelo menos um gatilho.")
    db.executar("UPDATE fluxos SET ativo = ?, atualizado_em = ? WHERE id = ?", (d.ativo, db.agora(), fid))
    db.registrar("painel", f"Fluxo {'ligado' if d.ativo else 'desligado'}: {f['nome']}")
    return ver(fid)


@rotas_fluxos.delete("/fluxos/{fid}")
def apagar(fid: int):
    f = _fluxo(fid)
    db.executar("DELETE FROM fluxos WHERE id = ?", (fid,))
    db.registrar("painel", f"Fluxo apagado: {f['nome']}")
    return {"ok": True}


@rotas_fluxos.post("/fluxos/{fid}/duplicar")
def duplicar(fid: int, request: Request):
    f = _fluxo(fid)
    g = f["grafo"]
    for n in g.get("nos", []):   # o webhook da cópia ganha endereço novo
        if n["tipo"] == "gatilho_webhook":
            n["config"]["token"] = ""
    return _salvar(None, FluxoIn(nome=f"{f['nome']} (cópia)"[:80], descricao=f["descricao"], grafo=g, ativo=False), request)


class ExecutarIn(BaseModel):
    dados: dict = Field(default_factory=dict)   # valores de teste para o contexto (ex.: {"evento": {"aparelho_id": 1}})


@rotas_fluxos.post("/fluxos/{fid}/executar")
def executar(fid: int, d: ExecutarIn):
    f = _fluxo(fid)
    permitidos = _permitidos()
    if permitidos is not None:   # quem cuida só de alguns ares não roda fluxo que mexe nos outros
        usados = {n["config"].get("aparelho_id") for n in f["grafo"].get("nos", []) if isinstance(n["config"].get("aparelho_id"), int)}
        if usados - permitidos:
            raise HTTPException(403, "Este fluxo mexe em ares que não estão sob sua responsabilidade.")
    ctx = {k: v for k, v in (d.dados or {}).items() if k in ("evento", "webhook", "var")}
    u = acesso.atual.get() or {}
    from .. import transmissor
    return fluxos.executar(f, None, f"manual · {u.get('nome') or u.get('email') or 'painel'}", ctx, nuvem=transmissor.PAPEL == "nuvem")


@rotas_fluxos.get("/fluxos/{fid}/execucoes")
def execucoes(fid: int, limite: int = 30):
    _fluxo(fid)
    return db.consultar("SELECT id, inicio, fim, estado, origem, passos, erro FROM fluxos_execucoes WHERE fluxo_id = ? ORDER BY id DESC LIMIT ?",
                        (fid, max(1, min(limite, 100))))


# ---------------- webhook público ----------------
_chamadas: dict = {}


@publico_fluxos.post("/fluxos/gancho/{token}")
async def gancho(token: str, request: Request):
    agora = time.time()
    hist = [x for x in _chamadas.get(token[:48], []) if agora - x < 60]
    if len(hist) >= 20:
        raise HTTPException(429, "Muitas chamadas para este endereço. Espere um minuto.")
    _chamadas[token[:48]] = [*hist, agora]
    achado = fluxos.por_token(token)
    if not achado:
        raise HTTPException(404, "Endereço não encontrado ou fluxo desligado.")
    corpo = await request.body()
    if len(corpo) > 64_000:
        raise HTTPException(413, "Corpo grande demais (até 64 KB).")
    try:
        dados = json.loads(corpo or b"{}")
    except ValueError:
        dados = {"texto": corpo.decode("utf-8", "replace")[:5000]}
    f, gid = achado
    from .. import transmissor
    import asyncio
    r = await asyncio.to_thread(fluxos.executar, f, gid, "webhook", {"webhook": dados}, transmissor.PAPEL == "nuvem")
    return {"ok": r.get("estado") == "ok", "execucao": r.get("id"), "estado": r.get("estado"), "erro": r.get("erro") or None}
