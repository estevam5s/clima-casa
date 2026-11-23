#!/usr/bin/env python3
"""Horário de publicação de cada versão (tela Novidades), de fontes verificáveis:

- `no_ar`: quando a Vercel deixou PRONTA a primeira publicação de produção que servia essa versão. A versão de cada
  publicação é lida do próprio novidades.json enviado nela (API de arquivos da Vercel), não deduzida. Só existe para as
  publicações que a Vercel ainda guarda.
- `commit_em`: quando o commit que criou a entrada da versão entrou no Git (versões renumeradas em 20/11 usam o
  número antigo, `antes`, para não pegar a data da renumeração).

Grava backend/app/versoes_horarios.json. Rodado pelo publicar-vercel.sh (antes de publicar) ou à mão:
  .venv/bin/python scripts/horarios-versoes.py
Lê VERCEL_TOKEN do .env (nunca imprime). Sem token ou sem rede, mantém o que já havia e só atualiza o Git.
"""
import base64
import json
import pathlib
import subprocess
import sys

import httpx

RAIZ = pathlib.Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "backend/app/versoes_horarios.json"
NOV = json.loads((RAIZ / "backend/app/novidades.json").read_text(encoding="utf-8"))["versoes"]


def env(chave):
    for linha in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if linha.startswith(chave + "="):
            return linha.split("=", 1)[1].strip()
    return ""


def git(*a):
    return subprocess.run(["git", "-C", str(RAIZ), *a], capture_output=True, text=True).stdout.strip()


antigo = json.loads(SAIDA.read_text(encoding="utf-8")) if SAIDA.exists() else {}
saida = {v["versao"]: dict(antigo.get(v["versao"], {})) for v in NOV}

# 1) Git: primeiro commit em que a versão (ou o número antigo) aparece no novidades.json
for v in NOV:
    alvo = v.get("antes") or v["versao"]
    linha = git("log", "--reverse", "--format=%H %ct", "-S", f'"versao": "{alvo}"', "--", "backend/app/novidades.json").splitlines()
    if linha:
        sha, ct = linha[0].split()
        saida[v["versao"]].update({"commit": sha[:7], "commit_em": int(ct)})

# 2) Vercel: versão servida por cada publicação de produção (lida do arquivo enviado) e quando ficou pronta
tk = env("VERCEL_TOKEN")
proj = json.loads((RAIZ / ".vercel/project.json").read_text(encoding="utf-8"))
if tk:
    h = {"Authorization": f"Bearer {tk}"}
    q = {"teamId": proj["orgId"]}
    try:
        with httpx.Client(timeout=20, headers=h, params=q) as cli:
            deps, ate = [], None
            for _ in range(5):
                r = cli.get("https://api.vercel.com/v6/deployments", params={**q, "projectId": proj["projectId"], "target": "production", "limit": 100, **({"until": ate} if ate else {})}).json()
                deps += r.get("deployments", [])
                ate = (r.get("pagination") or {}).get("next")
                if not ate:
                    break
            for d in sorted((x for x in deps if x.get("state") == "READY"), key=lambda x: x.get("ready") or x["created"]):
                pronto = int((d.get("ready") or d["created"]) / 1000)
                if any(x.get("deploy") == d["url"] for x in saida.values()):
                    continue
                arv = cli.get(f"https://api.vercel.com/v6/deployments/{d['uid']}/files").json()

                def achar(nos, c=""):
                    for n in nos or []:
                        cc = f"{c}/{n['name']}"
                        if n.get("type") == "directory":
                            r2 = achar(n.get("children"), cc)
                            if r2:
                                return r2
                        elif cc.endswith("backend/app/novidades.json"):
                            return n["uid"]
                    return None
                uid = achar(arv if isinstance(arv, list) else arv.get("files"))
                if not uid:
                    continue
                bruto = cli.get(f"https://api.vercel.com/v8/deployments/{d['uid']}/files/{uid}").text
                try:
                    j = json.loads(bruto)
                    txt = base64.b64decode(j["data"]).decode() if isinstance(j, dict) and "data" in j else bruto
                    versao = json.loads(txt)["versoes"][0]["versao"]
                except Exception:  # noqa: BLE001
                    continue
                if versao in saida and (not saida[versao].get("no_ar") or pronto < saida[versao]["no_ar"]):
                    saida[versao].update({"no_ar": pronto, "deploy": d["url"], "fonte": "vercel"})
    except httpx.HTTPError as e:
        print(f"aviso: Vercel indisponível ({type(e).__name__}); mantive os horários anteriores", file=sys.stderr)

SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
com = sum(1 for x in saida.values() if x.get("no_ar"))
print(f"versoes_horarios.json: {len(saida)} versões, {com} com horário confirmado pela Vercel, {sum(1 for x in saida.values() if x.get('commit_em'))} com horário do commit")
