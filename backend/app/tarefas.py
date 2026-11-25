"""Tarefas no estilo Asana: projetos, seções (colunas do quadro), tarefas com subtarefas, responsável, datas, prioridade,
etiquetas, comentários e histórico. Integração opcional com o GitHub Projects (v2) pela API GraphQL:

- O dono cadastra um token que só mexe em Projects (clássico com `project`/`read:project`, ou fine-grained com Projects).
  Token que também escreve em repositórios é recusado. Fica cifrado em `config.github_tarefas`.
- Um projeto daqui se liga a um Project do GitHub (dono + número). As opções do campo "Status" viram as seções.
- Sincronizar: o que mudou no GitHub depois da última sincronização vem para cá (título, descrição, status, issue fechada);
  tarefa nova daqui vira rascunho (draft issue) no Project; mudar de seção daqui muda o Status lá. Apagar aqui não apaga lá.
"""
from __future__ import annotations

import json
import re
from datetime import datetime

import httpx

from . import db

PRIORIDADES = ("nenhuma", "baixa", "media", "alta", "urgente")
SECOES_PADRAO = ("A fazer", "Fazendo", "Feito")
FEITO = re.compile(r"^(done|feito|conclu[ií]d[oa]s?|finalizad[oa]|pronto|closed|fechad[oa])$", re.I)
ESCOPOS_OK = {"project", "read:project", "read:org", "read:user", "user:email"}
GQL = "https://api.github.com/graphql"


class ErroGithub(Exception):
    pass


def agora() -> int:
    return db.agora()


# ---------------- token ----------------
def token() -> str:
    return (db.cfg("github_tarefas") or {}).get("token") or ""


def conferir_token(t: str) -> dict:
    r = httpx.get("https://api.github.com/user", headers={"Authorization": f"Bearer {t}", "X-GitHub-Api-Version": "2022-11-28"}, timeout=15)
    if r.status_code != 200:
        raise ErroGithub(f"O GitHub recusou o token ({r.status_code}).")
    escopos = {e.strip() for e in (r.headers.get("x-oauth-scopes") or "").split(",") if e.strip()}
    sobra = escopos - ESCOPOS_OK
    if sobra:
        raise ErroGithub(f"Este token pode mais do que precisa ({', '.join(sorted(sobra))}). Gere um só com o escopo project.")
    return {"login": r.json().get("login"), "escopos": sorted(escopos), "fino": not escopos}


def _gql(consulta: str, variaveis: dict | None = None) -> dict:
    t = token()
    if not t:
        raise ErroGithub("O GitHub ainda não foi conectado (Tarefas → GitHub, só o dono).")
    r = httpx.post(GQL, headers={"Authorization": f"Bearer {t}"}, json={"query": consulta, "variables": variaveis or {}}, timeout=30)
    if r.status_code != 200:
        raise ErroGithub(f"O GitHub respondeu {r.status_code}.")
    d = r.json()
    if d.get("errors"):
        msg = d["errors"][0].get("message", "erro")
        raise ErroGithub(f"GitHub: {msg[:200]}")
    return d["data"]


# ---------------- projetos do GitHub ----------------
_LISTA = "projectsV2(first: 40, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id number title url closed shortDescription } }"


def projetos_github(dono: str = "") -> list[dict]:
    if dono:
        for tipo in ("organization", "user"):
            try:
                d = _gql(f"query($l: String!) {{ {tipo}(login: $l) {{ {_LISTA} }} }}", {"l": dono})
                if d.get(tipo):
                    return [{**p, "dono": dono} for p in d[tipo]["projectsV2"]["nodes"] if not p["closed"]]
            except ErroGithub:
                continue
        raise ErroGithub(f"Não achei projetos de {dono} (confira o nome e se o token enxerga essa conta ou organização).")
    d = _gql(f"query {{ viewer {{ login {_LISTA} }} }}")
    return [{**p, "dono": d["viewer"]["login"]} for p in d["viewer"]["projectsV2"]["nodes"] if not p["closed"]]


_CAMPOS = "id title url fields(first: 40) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } ... on ProjectV2Field { id name dataType } } }"


def projeto_github(dono: str, numero: int) -> dict:
    for tipo in ("organization", "user"):
        try:
            d = _gql(f"query($l: String!, $n: Int!) {{ {tipo}(login: $l) {{ projectV2(number: $n) {{ {_CAMPOS} }} }} }}", {"l": dono, "n": numero})
        except ErroGithub:
            continue
        p = (d.get(tipo) or {}).get("projectV2")
        if p:
            campos = [c for c in p["fields"]["nodes"] if c]
            status = next((c for c in campos if c.get("options") is not None and c["name"].lower() == "status"), None) \
                or next((c for c in campos if c.get("options") is not None), None)
            datas = {c["name"].lower(): c["id"] for c in campos if c.get("dataType") == "DATE"}
            return {"id": p["id"], "titulo": p["title"], "url": p["url"], "dono": dono, "numero": numero,
                    "campo_status": status["id"] if status else None, "opcoes": status["options"] if status else [],
                    "campo_prazo": datas.get("prazo") or datas.get("due date") or datas.get("due") or datas.get("end date") or datas.get("target date")}
    raise ErroGithub(f"Project {numero} de {dono} não encontrado (ou o token não tem acesso).")


def ligar(pid: int, dono: str, numero: int) -> dict:
    g = projeto_github(dono, numero)
    g["sincronizado_em"] = 0
    db.executar("UPDATE tarefas_projetos SET github = CAST(? AS jsonb), atualizado_em = ? WHERE id = ?", (json.dumps(g), agora(), pid))
    # as opções do Status viram seções (as que já existem com o mesmo nome são aproveitadas)
    secoes = db.consultar("SELECT id, nome, github_opcao FROM tarefas_secoes WHERE projeto_id = ? ORDER BY ordem", (pid,))
    for i, o in enumerate(g["opcoes"]):
        s = next((s for s in secoes if s["github_opcao"] == o["id"] or s["nome"].strip().lower() == o["name"].strip().lower()), None)
        if s:
            db.executar("UPDATE tarefas_secoes SET github_opcao = ?, ordem = ? WHERE id = ?", (o["id"], i, s["id"]))
        else:
            db.executar("INSERT INTO tarefas_secoes (projeto_id, nome, ordem, github_opcao) VALUES (?, ?, ?, ?)", (pid, o["name"][:80], i, o["id"]))
    return g


_ITENS = """query($id: ID!, $depois: String) { node(id: $id) { ... on ProjectV2 { items(first: 100, after: $depois) {
  pageInfo { hasNextPage endCursor }
  nodes { id isArchived updatedAt
    fieldValues(first: 20) { nodes {
      ... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2SingleSelectField { id } } }
      ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { id } } } } }
    content {
      ... on DraftIssue { id title body }
      ... on Issue { title body url state }
      ... on PullRequest { title body url state } } } } } } }"""


def _ts(iso: str) -> int:
    try:
        return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
    except Exception:  # noqa: BLE001
        return 0


def sincronizar(pid: int, autor: dict) -> dict:
    p = db.um("SELECT * FROM tarefas_projetos WHERE id = ?", (pid,))
    g = (p or {}).get("github")
    if isinstance(g, str):
        g = json.loads(g)
    if not g:
        raise ErroGithub("Este projeto não está ligado a um Project do GitHub.")
    desde = int(g.get("sincronizado_em") or 0)
    secoes = db.consultar("SELECT id, nome, github_opcao FROM tarefas_secoes WHERE projeto_id = ?", (pid,))
    por_opcao = {s["github_opcao"]: s["id"] for s in secoes if s["github_opcao"]}
    op_da_secao = {s["id"]: s["github_opcao"] for s in secoes}
    op_feito = next((o["id"] for o in g.get("opcoes", []) if FEITO.match(o["name"].strip())), None)
    feitos = {"vieram": 0, "atualizadas": 0, "enviadas": 0, "status": 0}
    # 1) GitHub → aqui
    depois, vistos = None, set()
    for _ in range(20):
        d = _gql(_ITENS, {"id": g["id"], "depois": depois})["node"]["items"]
        for it in d["nodes"]:
            if it["isArchived"] or not it.get("content"):
                continue
            vistos.add(it["id"])
            c = it["content"]
            opcao = next((v.get("optionId") for v in it["fieldValues"]["nodes"] if v and v.get("field", {}).get("id") == g.get("campo_status") and v.get("optionId")), None)
            prazo = next((v.get("date") for v in it["fieldValues"]["nodes"] if v and v.get("date") and v.get("field", {}).get("id") == g.get("campo_prazo")), None)
            fechada = c.get("state") in ("CLOSED", "MERGED") or (opcao and opcao == op_feito)
            loc = db.um("SELECT id, atualizado_em FROM tarefas WHERE projeto_id = ? AND github_item = ?", (pid, it["id"]))
            if not loc:
                ordem = (db.um("SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM tarefas WHERE projeto_id = ?", (pid,)) or {}).get("o") or 1
                tid = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, prazo, concluida, concluida_em, ordem, github_item, github_url, "
                            "github_rascunho, criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
                            (pid, por_opcao.get(opcao), (c.get("title") or "Sem título")[:300], (c.get("body") or "")[:20000], prazo, bool(fechada),
                             agora() if fechada else None, ordem, it["id"], c.get("url"), c.get("id"), autor.get("id"), agora(), agora()))["id"]
                evento(tid, autor, "Veio do GitHub Projects")
                feitos["vieram"] += 1
            elif _ts(it["updatedAt"]) > desde and _ts(it["updatedAt"]) > int(loc["atualizado_em"] or 0) - 5:
                db.executar("UPDATE tarefas SET titulo = ?, descricao = ?, secao_id = COALESCE(?, secao_id), prazo = COALESCE(?, prazo), concluida = ?, "
                            "concluida_em = CASE WHEN ? AND concluida_em IS NULL THEN ? WHEN NOT ? THEN NULL ELSE concluida_em END, github_url = COALESCE(?, github_url), "
                            "atualizado_em = ? WHERE id = ?",
                            ((c.get("title") or "Sem título")[:300], (c.get("body") or "")[:20000], por_opcao.get(opcao), prazo, bool(fechada),
                             bool(fechada), agora(), bool(fechada), c.get("url"), agora(), loc["id"]))
                feitos["atualizadas"] += 1
        if not d["pageInfo"]["hasNextPage"]:
            break
        depois = d["pageInfo"]["endCursor"]
    # 2) aqui → GitHub: tarefas novas viram rascunho; mudança de seção/conclusão vira Status
    for t in db.consultar("SELECT * FROM tarefas WHERE projeto_id = ? AND pai_id IS NULL AND (github_item IS NULL OR atualizado_em > ?) ORDER BY ordem", (pid, desde)):
        item = t["github_item"]
        if not item:
            r = _gql("mutation($p: ID!, $t: String!, $b: String) { addProjectV2DraftIssue(input: {projectId: $p, title: $t, body: $b}) { projectItem { id content { ... on DraftIssue { id } } } } }",
                     {"p": g["id"], "t": t["titulo"], "b": t["descricao"] or ""})["addProjectV2DraftIssue"]["projectItem"]
            item = r["id"]
            db.executar("UPDATE tarefas SET github_item = ?, github_rascunho = ? WHERE id = ?", (item, (r.get("content") or {}).get("id"), t["id"]))
            feitos["enviadas"] += 1
        elif t["github_rascunho"] and item in vistos:
            _gql("mutation($d: ID!, $t: String!, $b: String) { updateProjectV2DraftIssue(input: {draftIssueId: $d, title: $t, body: $b}) { draftIssue { id } } }",
                 {"d": t["github_rascunho"], "t": t["titulo"], "b": t["descricao"] or ""})
        opcao = op_feito if (t["concluida"] and op_feito) else op_da_secao.get(t["secao_id"])
        if opcao and g.get("campo_status"):
            _gql("mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) { updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: {singleSelectOptionId: $o}}) { projectV2Item { id } } }",
                 {"p": g["id"], "i": item, "f": g["campo_status"], "o": opcao})
            feitos["status"] += 1
        if t["prazo"] and g.get("campo_prazo"):
            _gql("mutation($p: ID!, $i: ID!, $f: ID!, $d: Date!) { updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: {date: $d}}) { projectV2Item { id } } }",
                 {"p": g["id"], "i": item, "f": g["campo_prazo"], "d": t["prazo"]})
    g["sincronizado_em"] = agora()
    db.executar("UPDATE tarefas_projetos SET github = CAST(? AS jsonb) WHERE id = ?", (json.dumps(g), pid))
    db.registrar("painel", f"Tarefas: projeto sincronizado com o GitHub ({g.get('titulo')})",
                 detalhe=f"{feitos['vieram']} vieram, {feitos['atualizadas']} atualizadas, {feitos['enviadas']} enviadas")
    return {**feitos, "sincronizado_em": g["sincronizado_em"]}


# ---------------- histórico ----------------
def evento(tid: int, autor: dict, texto: str):
    db.executar("INSERT INTO tarefas_comentarios (tarefa_id, autor_id, autor_nome, tipo, texto, criado_em) VALUES (?, ?, ?, 'evento', ?, ?)",
                (tid, autor.get("id"), autor.get("nome") or (autor.get("email") or "").split("@")[0], texto[:500], agora()))
