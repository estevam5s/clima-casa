"""Projetos do Assistente de IA (como os Projetos do Claude): nome, instruções e "conhecimento" (arquivos de texto enviados,
um .zip do projeto ou um repositório do GitHub). As conversas dentro do projeto recebem as instruções e os trechos dos
arquivos mais ligados à pergunta. Cada projeto é da pessoa que criou (ninguém vê o de outra pessoa).

Limites: só texto (código, markdown, json, csv…); binários e pastas pesadas (node_modules, .git, dist) ficam de fora;
até 300 arquivos e ~1,5 MB de texto por projeto; cada arquivo até 200 KB. Segredos óbvios (.env, chaves) não entram.
"""
from __future__ import annotations

import base64
import io
import re
import zipfile

import httpx

from . import db

EXT_TEXTO = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".md", ".mdx", ".txt", ".csv", ".html", ".htm", ".css", ".scss",
             ".sql", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".sh", ".ps1", ".bat", ".java", ".kt", ".swift", ".go", ".rs", ".c", ".h",
             ".cpp", ".hpp", ".cs", ".php", ".rb", ".vue", ".svelte", ".xml", ".ino", ".gradle", ".dart", ".lua", ".r", ".tex", ".rst", ".graphql", ".prisma"}
NOMES_TEXTO = {"dockerfile", "makefile", "readme", "license", "procfile", ".gitignore", ".dockerignore"}
FORA = re.compile(r"(^|/)(node_modules|\.git|dist|build|\.next|\.venv|venv|__pycache__|\.cache|coverage|vendor|target|\.idea|\.vscode)(/|$)")
SEGREDO = re.compile(r"(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|credentials.*|.*secret.*)$", re.I)
MAX_ARQ, MAX_TOTAL, MAX_UM = 300, 1_500_000, 200_000


class ErroProjeto(Exception):
    pass


def _serve(nome: str) -> bool:
    n = nome.replace("\\", "/").lstrip("./")
    if not n or n.endswith("/") or FORA.search(n) or SEGREDO.search(n):
        return False
    base = n.rsplit("/", 1)[-1].lower()
    ext = ("." + base.rsplit(".", 1)[-1]) if "." in base else ""
    return ext in EXT_TEXTO or base in NOMES_TEXTO or base.split(".")[0] in NOMES_TEXTO


def _texto(dados: bytes) -> str | None:
    if b"\x00" in dados[:4096]:
        return None
    try:
        return dados.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return dados.decode("latin-1")
        except Exception:  # noqa: BLE001
            return None


def _juntar(atuais: list[dict], novos: list[tuple[str, str]]) -> tuple[list[dict], int]:
    por_nome = {a["nome"]: a for a in atuais}
    for nome, txt in novos:
        por_nome[nome] = {"nome": nome[:300], "tamanho": len(txt), "texto": txt[:MAX_UM]}
    lista = sorted(por_nome.values(), key=lambda a: a["nome"])
    total, saida, fora = 0, [], 0
    for a in lista:
        if len(saida) >= MAX_ARQ or total + len(a["texto"]) > MAX_TOTAL:
            fora += 1
            continue
        saida.append(a); total += len(a["texto"])
    return saida, fora


def de_upload(arquivos: list[dict]) -> list[tuple[str, str]]:
    """[{nome, base64}] → [(nome, texto)]. Um .zip é aberto e só os arquivos de texto entram."""
    saida = []
    for a in arquivos:
        nome = str(a.get("nome") or "")[:300]
        try:
            dados = base64.b64decode(a.get("base64") or "", validate=False)
        except Exception:  # noqa: BLE001
            continue
        if nome.lower().endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(dados)) as z:
                    raiz = _raiz_comum([i.filename for i in z.infolist() if not i.is_dir()])
                    for i in z.infolist():
                        if i.is_dir() or i.file_size > MAX_UM or not _serve(i.filename):
                            continue
                        t = _texto(z.read(i))
                        if t is not None:
                            saida.append((i.filename[len(raiz):], t))
            except zipfile.BadZipFile as e:
                raise ErroProjeto(f"{nome}: o .zip está corrompido.") from e
            continue
        if _serve(nome) and len(dados) <= MAX_UM:
            t = _texto(dados)
            if t is not None:
                saida.append((nome, t))
    return saida


def _raiz_comum(nomes: list[str]) -> str:
    """Zip de uma pasta (projeto/arquivo.py): tira o "projeto/" do começo de todos."""
    primeiros = {n.split("/", 1)[0] for n in nomes if "/" in n}
    if len(primeiros) == 1 and all("/" in n for n in nomes):
        return primeiros.pop() + "/"
    return ""


def do_github(repo: str, ref: str = "") -> tuple[list[tuple[str, str]], dict]:
    """Lê um repositório do GitHub (público; os privados só com o token de leitura de Apps, se ele tiver acesso)."""
    if not re.match(r"^[A-Za-z0-9-]{1,39}/[A-Za-z0-9._-]{1,100}$", repo):
        raise ErroProjeto("Use o formato dono/repositorio (ex.: vercel/next.js).")
    token = (db.cfg("github_apps") or {}).get("token") or ""
    cab = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    with httpx.Client(timeout=30, follow_redirects=True) as c:
        info = c.get(f"https://api.github.com/repos/{repo}", headers=cab)
        if info.status_code == 404 and token:
            cab["Authorization"] = f"Bearer {token}"
            info = c.get(f"https://api.github.com/repos/{repo}", headers=cab)
        if info.status_code == 404:
            raise ErroProjeto("Repositório não encontrado (ou privado, sem acesso).")
        if info.status_code != 200:
            raise ErroProjeto(f"O GitHub respondeu {info.status_code}. Tente de novo em alguns minutos.")
        j = info.json()
        ref = ref or j.get("default_branch") or "main"
        # o pacote do repositório inteiro (zipball) numa chamada só: mais rápido que um pedido por arquivo
        z = c.get(f"https://api.github.com/repos/{repo}/zipball/{ref}", headers=cab)
        if z.status_code != 200:
            raise ErroProjeto(f"Não consegui baixar a branch {ref} ({z.status_code}).")
        if len(z.content) > 40_000_000:
            raise ErroProjeto("Repositório grande demais (mais de 40 MB compactado). Envie só as pastas que importam em .zip.")
    arquivos = de_upload([{"nome": "repo.zip", "base64": base64.b64encode(z.content).decode()}])
    return arquivos, {"repo": repo, "ref": ref, "privado": bool(j.get("private")), "url": j.get("html_url"), "descricao": (j.get("description") or "")[:300],
                      "importado_em": db.agora()}


def contexto(projeto: dict, pergunta: str, limite: int = 60_000) -> str:
    """Instruções + arquivos do projeto mais ligados à pergunta (palavras em comum), até `limite` caracteres."""
    partes = []
    if projeto.get("instrucoes"):
        partes.append(f"Instruções do projeto \"{projeto['nome']}\" (siga se não conflitarem com as regras acima):\n{projeto['instrucoes'][:4000]}")
    arquivos = projeto.get("arquivos") or []
    if arquivos:
        palavras = {p for p in re.findall(r"[\wÀ-ú]{4,}", pergunta.lower())}
        def nota(a):
            nome = a["nome"].lower()
            t = a["texto"][:20000].lower()
            return sum(3 for p in palavras if p in nome) + sum(min(5, t.count(p)) for p in palavras) + (2 if re.search(r"readme|package\.json|requirements|main\.|index\.", nome) else 0)
        ordem = sorted(arquivos, key=nota, reverse=True)
        lista = "\n".join(f"- {a['nome']} ({a['tamanho']} caracteres)" for a in arquivos[:300])
        partes.append(f"Arquivos do projeto ({len(arquivos)}):\n{lista}")
        usado = sum(len(p) for p in partes)
        for a in ordem:
            bloco = f"\n--- {a['nome']} ---\n{a['texto']}"
            if usado + len(bloco) > limite:
                resto = limite - usado
                if resto > 2000:
                    partes.append(bloco[:resto] + "\n[…cortado]")
                break
            partes.append(bloco); usado += len(bloco)
    return "\n\n".join(partes)
