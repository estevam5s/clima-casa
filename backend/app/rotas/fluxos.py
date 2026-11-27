"""Rotas dos fluxos (Rotinas → Fluxos). Ver backend/app/fluxos.py.

Logado: ver (qualquer pessoa), criar/editar/ligar/apagar (automacoes.gerenciar), executar (aparelhos.controlar).
Público: POST /api/fluxos/gancho/{token} (gatilho webhook; token secreto de 32 caracteres, só de fluxo ativo, 20 por minuto).
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import acesso, db, fluxos, fluxos_catalogo, ia
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
            "fluxo": [{"id": x["id"], "nome": x["nome"]} for x in db.consultar("SELECT id, nome FROM fluxos ORDER BY nome")],
            "automacao": [{"id": x["id"], "nome": x["nome"]} for x in db.consultar("SELECT id, nome FROM automacoes ORDER BY nome")],
            "tarefa_projeto": [{"id": x["id"], "nome": x["nome"]} for x in db.consultar("SELECT id, nome FROM tarefas_projetos WHERE NOT arquivado ORDER BY nome")],
            "modelo": [{"id": k, "nome": v} for k, v in ia.MODELOS.items()],
            "conexao": [{"id": k, "nome": v.get("nome") or k, "servico": v.get("servico")} for k, v in fluxos_catalogo.conexoes().items()],
        },
        "contagem": fluxos_catalogo.contagem(),
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
        antigo = _fluxo(f_id)
        if json.dumps(antigo["grafo"], sort_keys=True) != json.dumps(grafo, sort_keys=True):   # guarda a versão anterior (as 30 mais novas)
            db.executar("INSERT INTO fluxos_versoes (fluxo_id, nome, grafo, autor, criado_em) VALUES (?, ?, CAST(? AS jsonb), ?, ?)",
                        (f_id, antigo["nome"], json.dumps(antigo["grafo"]), u.get("nome") or u.get("email"), agora))
            db.executar("DELETE FROM fluxos_versoes WHERE fluxo_id = ? AND id NOT IN (SELECT id FROM fluxos_versoes WHERE fluxo_id = ? ORDER BY id DESC LIMIT 30)", (f_id, f_id))
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


@rotas_fluxos.get("/fluxos/{fid}/versoes")
def versoes(fid: int):
    _fluxo(fid)
    return [{**v, "blocos": len((v.pop("grafo") or {}).get("nos", []))} for v in
            db.consultar("SELECT id, nome, grafo, autor, criado_em FROM fluxos_versoes WHERE fluxo_id = ? ORDER BY id DESC LIMIT 30", (fid,))]


@rotas_fluxos.post("/fluxos/{fid}/versoes/{vid}/restaurar")
def restaurar_versao(fid: int, vid: int, request: Request):
    f = _fluxo(fid)
    v = db.um("SELECT grafo FROM fluxos_versoes WHERE id = ? AND fluxo_id = ?", (vid, fid))
    if not v:
        raise HTTPException(404, "Versão não encontrada.")
    return _salvar(fid, FluxoIn(nome=f["nome"], descricao=f["descricao"] or "", grafo=v["grafo"]), request)


@rotas_fluxos.get("/fluxos-execucoes")
def todas_execucoes(estado: str = "", limite: int = 100):
    """Execuções de todos os fluxos (Rotinas → Execuções)."""
    filtro, p = (" AND e.estado = ?", [estado]) if estado in ("ok", "erro", "rodando", "ignorada") else ("", [])
    return db.consultar(f"SELECT e.id, e.fluxo_id, f.nome AS fluxo, e.inicio, e.fim, e.estado, e.origem, e.erro, jsonb_array_length(e.passos) AS passos "
                        f"FROM fluxos_execucoes e JOIN fluxos f ON f.id = e.fluxo_id WHERE true{filtro} ORDER BY e.id DESC LIMIT ?", (*p, max(1, min(limite, 300))))


@rotas_fluxos.get("/fluxos-execucoes/{eid}")
def uma_execucao(eid: int):
    e = db.um("SELECT e.*, f.nome AS fluxo FROM fluxos_execucoes e JOIN fluxos f ON f.id = e.fluxo_id WHERE e.id = ?", (eid,))
    if not e:
        raise HTTPException(404, "Execução não encontrada.")
    return e


# ---------------- variáveis globais ----------------
@rotas_fluxos.get("/fluxos-variaveis")
def variaveis():
    return db.cfg("fluxos_variaveis") or {}


class VariaveisIn(BaseModel):
    variaveis: dict = Field(default_factory=dict)


@rotas_fluxos.put("/fluxos-variaveis")
def salvar_variaveis(d: VariaveisIn):
    if len(d.variaveis) > 200:
        raise HTTPException(422, "Até 200 variáveis.")
    limpo = {}
    for k, v in d.variaveis.items():
        nome = "".join(c for c in str(k) if c.isalnum() or c == "_")[:40]
        if nome:
            limpo[nome] = v if isinstance(v, (int, float, bool)) else str(v)[:2000]
    db.set_cfg("fluxos_variaveis", limpo)
    db.registrar("painel", "Variáveis dos fluxos salvas", detalhe=f"{len(limpo)} variável(is)")
    return limpo


# ---------------- conexões (integrações externas, cifradas) ----------------
def _so_gestor(request: Request):
    if (request.state.u or {}).get("papel") not in ("dono", "admin"):
        raise HTTPException(403, "Só o dono ou um administrador mexe nas conexões.")


def _mascarar(c: dict) -> dict:
    segredos = {nome for nome, _r, seg in fluxos_catalogo.SERVICOS.get(c.get("servico"), ("", []))[1] if seg}
    return {k: (("•" * 6 + str(v)[-4:]) if k in segredos and v else v) for k, v in c.items()}


@rotas_fluxos.get("/fluxos-conexoes")
def listar_conexoes():
    return {"servicos": {k: {"nome": n, "campos": [{"nome": c, "rotulo": r, "segredo": s} for c, r, s in campos], "rede_local": loc}
                         for k, (n, campos, loc) in fluxos_catalogo.SERVICOS.items()},
            "conexoes": [{"id": k, **_mascarar(v)} for k, v in fluxos_catalogo.conexoes().items()]}


class ConexaoIn(BaseModel):
    id: str = Field("", max_length=40)
    servico: str = Field(max_length=40)
    nome: str = Field(min_length=1, max_length=60)
    campos: dict = Field(default_factory=dict)
    rede_local: bool = False


@rotas_fluxos.post("/fluxos-conexoes")
def salvar_conexao(d: ConexaoIn, request: Request):
    _so_gestor(request)
    if d.servico not in fluxos_catalogo.SERVICOS:
        raise HTTPException(422, "Serviço desconhecido.")
    nome_s, campos, permite_local = fluxos_catalogo.SERVICOS[d.servico]
    if d.rede_local and (not permite_local or request.state.u.get("papel") != "dono"):
        raise HTTPException(403, "Conexão da rede local: só o dono, e só para Home Assistant, Node-RED ou n8n.")
    todas = fluxos_catalogo.conexoes()
    cid = "".join(c for c in d.id if c.isalnum() or c in "_-")[:40]
    antigo = todas.get(cid) or {}
    if not cid:
        if len(todas) >= 60:
            raise HTTPException(409, "Limite de 60 conexões.")
        import secrets
        cid = f"{d.servico}-{secrets.token_hex(3)}"
    novo = {"servico": d.servico, "nome": d.nome.strip(), "rede_local": bool(d.rede_local), "atualizado_em": db.agora()}
    for c, rotulo, seg in campos:
        v = str(d.campos.get(c) or "").strip()[:2000]
        if seg and (not v or v.startswith("••")):
            v = antigo.get(c, "")   # vazio ou mascarado = mantém
        if not v and c not in ("token", "cabecalho") and rotulo.find("opcional") < 0:
            raise HTTPException(422, f"{nome_s}: preencha {rotulo}.")
        if c == "url" and v and not (v.startswith("https://") or (d.rede_local and v.startswith("http://"))):
            raise HTTPException(422, f"{nome_s}: o endereço precisa começar com https://.")
        novo[c] = v
    todas[cid] = novo
    db.set_cfg(fluxos_catalogo.CONEXOES_CFG, todas)
    db.registrar("painel", f"Conexão salva: {d.nome.strip()}", detalhe=nome_s)
    return {"id": cid, **_mascarar(novo)}


@rotas_fluxos.delete("/fluxos-conexoes/{cid}")
def apagar_conexao(cid: str, request: Request):
    _so_gestor(request)
    todas = fluxos_catalogo.conexoes()
    c = todas.pop(cid, None)
    if not c:
        raise HTTPException(404, "Conexão não encontrada.")
    db.set_cfg(fluxos_catalogo.CONEXOES_CFG, todas)
    db.registrar("painel", f"Conexão apagada: {c.get('nome')}")
    return {"ok": True}


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
