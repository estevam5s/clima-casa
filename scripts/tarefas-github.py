#!/usr/bin/env python3
"""Envia ao GitHub Project as tarefas de um projeto que ainda não estão lá, no ritmo que o GitHub aceita.

Por que existe: tarefas.sincronizar manda tudo de uma vez. Para centenas de tarefas o GitHub barra com o limite secundário
(cerca de 80 criações por minuto e 500 por hora). Aqui cada item novo espera ~7,5 s, os campos (Status, Prioridade, Prazo) vão
logo depois, e "devagar" do GitHub vira espera e nova tentativa. Pode parar e rodar de novo: continua de onde parou.

Token: o de Tarefas → GitHub (config.github_tarefas, escopo project). Com --gh usa o `gh` já logado neste computador,
só na memória deste processo (nunca gravado).

Uso: cd backend && ../.venv/bin/python ../scripts/tarefas-github.py [projeto_id=5] [--gh] [--incluir-concluidas]
"""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import db, tarefas  # noqa: E402

INTERVALO = 7.5


def gql(q, v, tentativas=8):
    espera = 30
    for t in range(tentativas):
        try:
            return tarefas._gql(q, v)
        except Exception as e:  # noqa: BLE001
            msg = str(e).lower()
            if t == tentativas - 1:
                raise
            if "secondary" in msg or "too quickly" in msg or "rate" in msg or "abuse" in msg or "403" in msg:
                print(f"  GitHub pediu calma: esperando {espera} s", flush=True)
                time.sleep(espera)
                espera = min(espera * 2, 600)
            else:
                time.sleep(5)
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    pid = int(args[0]) if args else 5
    if "--gh" in sys.argv:
        import re
        t = ""
        for _ in range(5):   # com o Mac bloqueado o chaveiro às vezes devolve uma mensagem no lugar do token
            t = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True).stdout.strip()
            if re.fullmatch(r"gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}", t):
                break
            time.sleep(10)
        else:
            raise SystemExit("O gh não devolveu um token válido (chaveiro trancado?). Desbloqueie o Mac e rode de novo.")
        tarefas.token = lambda: t
    p = db.um("SELECT github FROM tarefas_projetos WHERE id = ?", (pid,))
    g = p and p["github"]
    g = json.loads(g) if isinstance(g, str) else g
    if not g:
        raise SystemExit("Projeto sem GitHub ligado.")
    secoes = {s["id"]: s["github_opcao"] for s in db.consultar("SELECT id, github_opcao FROM tarefas_secoes WHERE projeto_id = ?", (pid,))}
    op_feito = next((o["id"] for o in g.get("opcoes", []) if tarefas.FEITO.match(o["name"].strip())), None)
    prio_op = {tarefas.PRIO_GITHUB.get(tarefas._sem_acento(o["name"])): o["id"] for o in g.get("opcoes_prioridade", [])}
    filtro = "" if "--incluir-concluidas" in sys.argv else " AND NOT concluida"
    lista = db.consultar(f"SELECT * FROM tarefas WHERE projeto_id = ? AND pai_id IS NULL AND github_item IS NULL{filtro} ORDER BY ordem", (pid,))  # nosec B608
    print(f"{len(lista)} tarefa(s) para enviar ao Project {g.get('titulo')} (~{len(lista) * INTERVALO / 60:.0f} min)", flush=True)
    feitas = 0
    for t in lista:
        inicio = time.time()
        r = gql("mutation($p: ID!, $t: String!, $b: String) { addProjectV2DraftIssue(input: {projectId: $p, title: $t, body: $b}) { projectItem { id content { ... on DraftIssue { id } } } } }",
                {"p": g["id"], "t": t["titulo"][:250], "b": (t["descricao"] or "")[:60000]})
        item = r["addProjectV2DraftIssue"]["projectItem"]
        db.executar("UPDATE tarefas SET github_item = ?, github_rascunho = ? WHERE id = ?", (item["id"], (item.get("content") or {}).get("id"), t["id"]))
        campo = "mutation($p: ID!, $i: ID!, $f: ID!, $v: ProjectV2FieldValue!) { updateProjectV2ItemFieldValue(input: {projectId: $p, itemId: $i, fieldId: $f, value: $v}) { projectV2Item { id } } }"
        status = op_feito if (t["concluida"] and op_feito) else secoes.get(t["secao_id"])
        if status and g.get("campo_status"):
            gql(campo, {"p": g["id"], "i": item["id"], "f": g["campo_status"], "v": {"singleSelectOptionId": status}})
        if g.get("campo_prioridade") and prio_op.get(t["prioridade"]):
            gql(campo, {"p": g["id"], "i": item["id"], "f": g["campo_prioridade"], "v": {"singleSelectOptionId": prio_op[t["prioridade"]]}})
        if t["prazo"] and g.get("campo_prazo"):
            gql(campo, {"p": g["id"], "i": item["id"], "f": g["campo_prazo"], "v": {"date": t["prazo"]}})
        feitas += 1
        if feitas % 25 == 0:
            print(f"  {feitas}/{len(lista)} enviadas", flush=True)
        time.sleep(max(0, INTERVALO - (time.time() - inicio)))
    g["sincronizado_em"] = int(time.time())   # a sincronização de 10 em 10 min não reenvia tudo
    db.executar("UPDATE tarefas_projetos SET github = CAST(? AS jsonb) WHERE id = ?", (json.dumps(g), pid))
    db.registrar("painel", f"Tarefas: {feitas} tarefa(s) enviadas ao GitHub ({g.get('titulo')})")
    print(f"Pronto: {feitas} enviadas", flush=True)


if __name__ == "__main__":
    main()
