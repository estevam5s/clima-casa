#!/usr/bin/env python3
"""clima-ia: agente de IA no terminal para o Clima Escritório (estilo Claude Code), com modelos da NVIDIA.

Conversa em português, conhece o projeto (CLAUDE.md, diário da última sessão, código) e controla o sistema (estado,
ares, transmissores, cenas) pelas mesmas funções do painel. Tudo que muda algo pede confirmação no terminal.

Segurança:
- nunca lê .env, docs/credentials nem chaves; não sai da pasta do projeto;
- mascara segredos (tokens, chaves, senhas) em TODO texto antes de enviar ao modelo (a NVIDIA não recebe segredo);
- banco só com SELECT, fora das tabelas sensíveis; comandos nos ares vão pela fila até o agente (origem "ia").

Interface no jeito do Claude Code: boas-vindas, barra de status (modelo, modo de permissão, ares ligados, agente),
indicador "pensando" com o tempo, autocompletar de /comandos e @arquivos, modos de permissão (Shift+Tab),
"!" roda no terminal, "#" guarda na memória (agente-ia/MEMORIA.md, lida em toda conversa), comandos diretos dos ares
(/ares, /ligar, /desligar, /temp, /cena) sem passar pela IA, /compactar, /contexto e /revisar (git diff).

Uso: clima-ia [--modelo ID] [pergunta]   ·   dentro: /ajuda
"""
from __future__ import annotations

import argparse
import difflib
import fnmatch
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend"))
os.environ.setdefault("CLIMA_PAPEL", "nuvem")   # comandos de ar vão pela fila até o agente do escritório

import httpx  # noqa: E402
from prompt_toolkit import PromptSession  # noqa: E402
from prompt_toolkit.completion import Completer, Completion  # noqa: E402
from prompt_toolkit.history import FileHistory  # noqa: E402
from prompt_toolkit.key_binding import KeyBindings  # noqa: E402
from rich.table import Table  # noqa: E402
from rich.console import Console  # noqa: E402
from rich.markdown import Markdown  # noqa: E402
from rich.panel import Panel  # noqa: E402
from rich.syntax import Syntax  # noqa: E402

URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODELO_PADRAO = "nvidia/nemotron-3-ultra-550b-a55b"
MODELOS = {"ultra": "nvidia/nemotron-3-ultra-550b-a55b", "rapido": "nvidia/nemotron-3.5-lightning-30b-a3b",
           "mistral": "mistralai/mistral-large-4-1t-a52b"}
PASTA_USUARIO = Path.home() / ".clima-ia"
MEMORIA = RAIZ / "agente-ia" / "MEMORIA.md"
con = Console()
# modos de permissão (Shift+Tab troca): perguntar tudo · aceitar edições de arquivo · só leitura (nada muda)
MODOS_PERMISSAO = ["perguntar", "aceitar edições", "só leitura"]
ESTADO = {"modo": 0, "tokens": 0, "ligados": None, "agente": None, "visto": 0.0}
NOMES_FERRAMENTA = {"ler_arquivo": "Ler", "listar": "Listar", "buscar": "Buscar", "estado_sistema": "Estado", "atividade": "Atividade",
                    "consultar_banco": "Banco", "comandar_ar": "Ar", "desligar_todos": "DesligarTodos", "executar_cena": "Cena",
                    "editar_arquivo": "Editar", "escrever_arquivo": "Escrever", "executar_comando": "Terminal"}

# ---------------- segredos ----------------
PROIBIDOS = (".env", "docs/credentials", ".git/", "node_modules", "docs/contas.md", ".pem", ".key", "id_ed25519", "id_rsa")
PADROES_SEGREDO = [r"sb_secret_[A-Za-z0-9_-]{10,}", r"sbp_[a-f0-9]{20,}", r"vcp_[A-Za-z0-9]{20,}", r"gh[pousr]_[A-Za-z0-9]{20,}",
                   r"re_[A-Za-z0-9]{20,}", r"whsec_[A-Za-z0-9+/=]{10,}", r"spak_[A-Za-z0-9]{10,}", r"nvapi-[A-Za-z0-9_-]{20,}",
                   r"\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b", r"enc:v1:[A-Za-z0-9+/=:_-]{10,}", r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
                   r"(?i)(senha|password|secret|token|api_key|local_key)(\"?\s*[:=]\s*\"?)[^\s\"',}]{6,}"]


def mascarar(t: str) -> str:
    for p in PADROES_SEGREDO:
        t = re.sub(p, lambda m: (m.group(1) + m.group(2) + "«oculto»") if m.lastindex and m.lastindex >= 2 else "«segredo oculto»", t)
    return t


def caminho_seguro(rel: str) -> Path:
    p = (RAIZ / rel).resolve()
    if p != RAIZ and RAIZ not in p.parents:
        raise ValueError("fora da pasta do projeto")
    r = str(p.relative_to(RAIZ)) + ("/" if p.is_dir() else "")
    if any(x in r or r.endswith(x.rstrip("/")) for x in PROIBIDOS):
        raise ValueError("arquivo protegido (segredos): não leio nem altero")
    return p


def carregar_env():
    for linha in (RAIZ / ".env").read_text().splitlines():
        if "=" in linha and not linha.strip().startswith("#"):
            k, v = linha.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


# ---------------- ferramentas ----------------
def _db():
    from app import db
    return db


def t_ler_arquivo(caminho: str, inicio: int = 1, fim: int = 400):
    p = caminho_seguro(caminho)
    linhas = p.read_text(errors="replace").splitlines()
    fim = min(len(linhas), max(inicio, fim), inicio + 800)
    return f"{caminho} (linhas {inicio}-{fim} de {len(linhas)})\n" + "\n".join(f"{i:5d}  {l}" for i, l in enumerate(linhas[inicio - 1:fim], inicio))


def t_listar(caminho: str = ".", padrao: str = "*"):
    base = caminho_seguro(caminho)
    saida = []
    for p in sorted(base.rglob(padrao) if "**" in padrao or "/" in padrao else base.glob(padrao)):
        rel = str(p.relative_to(RAIZ))
        if any(x.rstrip("/") in rel for x in PROIBIDOS) or "/node_modules/" in rel or "/.venv/" in rel or "/static/assets/" in rel:
            continue
        saida.append(rel + ("/" if p.is_dir() else ""))
        if len(saida) >= 300:
            break
    return "\n".join(saida) or "(vazio)"


def t_buscar(regex: str, caminho: str = ".", arquivos: str = "*"):
    base = caminho_seguro(caminho)
    rx = re.compile(regex)
    achados = []
    for p in base.rglob("*"):
        rel = str(p.relative_to(RAIZ))
        if not p.is_file() or any(x.rstrip("/") in rel for x in PROIBIDOS) or re.search(r"(node_modules|\.venv|static/assets|\.next|dist|build)/", rel):
            continue
        if not fnmatch.fnmatch(p.name, arquivos) or p.suffix in (".png", ".jpg", ".pdf", ".apk", ".dmg", ".glb", ".zip", ".ico", ".woff2"):
            continue
        try:
            for i, l in enumerate(p.read_text(errors="ignore").splitlines(), 1):
                if rx.search(l):
                    achados.append(f"{rel}:{i}: {l.strip()[:200]}")
                    if len(achados) >= 120:
                        return "\n".join(achados) + "\n(parei em 120 resultados)"
        except OSError:
            continue
    return "\n".join(achados) or "nenhum resultado"


def t_estado_sistema():
    from app import coordenador, transmissor
    db = _db()
    maqs = coordenador.maquinas()
    ares = db.consultar("SELECT a.id, a.nome, a.ligado, a.temperatura, a.modo, h.nome AS transmissor, h.online FROM aparelhos a LEFT JOIN hubs h ON h.id = a.hub_id ORDER BY a.nome")
    hubs = db.consultar("SELECT nome, ip, versao, online, problema FROM hubs ORDER BY nome")
    return json.dumps({"agente_online": transmissor.agente_online(),
                       "computadores": [{**{k: m.get(k) for k in ("nome", "principal", "ve_transmissores", "total_transmissores", "sistema")},
                                         "visto_ha_s": int(time.time() - (m.get("visto") or 0)), "online": time.time() - (m.get("visto") or 0) < 60} for m in maqs],
                       "transmissores": hubs, "ares": ares}, ensure_ascii=False, default=str)


def t_atividade(limite: int = 20, so_falhas: bool = False):
    db = _db()
    rs = db.consultar(f"SELECT quando, origem, acao, ok, detalhe FROM atividade{' WHERE ok = 0' if so_falhas else ''} ORDER BY quando DESC LIMIT ?", (min(limite, 100),))
    return "\n".join(f"{time.strftime('%d/%m %H:%M', time.localtime(r['quando']))} [{r['origem']}] {'ok' if r['ok'] else 'FALHOU'} {r['acao']} | {r['detalhe'] or ''}" for r in rs)


TABELAS_PROIBIDAS = ("config", "auth.", "oauth_", "passkeys", "sessoes", "webauthn", "codigos")


def t_consultar_banco(sql: str):
    s = sql.strip().rstrip(";")
    if not re.match(r"(?is)^\s*(select|with)\b", s) or ";" in s or re.search(r"(?i)\b(insert|update|delete|drop|alter|create|grant|truncate|copy)\b", s):
        raise ValueError("só consultas SELECT (sem ponto e vírgula)")
    if any(t in s.lower() for t in TABELAS_PROIBIDAS):
        raise ValueError("tabela sensível (config, contas, sessões, chaves ou botões IR): não consulto")
    rs = _db().consultar(f"SELECT * FROM ({s}) _q LIMIT 200")
    return json.dumps(rs, ensure_ascii=False, default=str)


def _achar_ar(alvo):
    db = _db()
    if str(alvo).isdigit():
        a = db.um("SELECT id, nome FROM aparelhos WHERE id = ?", (int(alvo),))
        return [a] if a else []
    return db.consultar("SELECT id, nome FROM aparelhos WHERE lower(nome) LIKE ? ORDER BY nome", (f"%{str(alvo).lower()}%",))


def t_comandar_ar(ar: str, ligado: bool, temperatura: int | None = None, modo: str | None = None):
    from app import clima
    achados = _achar_ar(ar)
    if len(achados) != 1:
        return f"ambíguo ou não encontrado: {[a['nome'] for a in achados] or 'nenhum'}"
    r = clima.aplicar(achados[0]["id"], "ia", ligado=ligado, temperatura=temperatura, modo=modo)
    junto = f"; mudaram junto: {r.get('juntos')}" if r.get("juntos") else ""
    return f"{achados[0]['nome']}: {'ligado em ' + str(r.get('temperatura')) + '°' if ligado else 'desligado'}{junto}"


def t_desligar_todos():
    from app import clima
    db = _db()
    feitos, falhas, ja = [], [], set()
    for a in db.consultar("SELECT id, nome FROM aparelhos WHERE ligado = 1 ORDER BY nome"):
        if a["id"] in ja:
            continue
        try:
            r = clima.aplicar(a["id"], "ia", ligado=False); feitos.append(a["nome"]); ja.update(r.get("juntos") or [])
        except Exception as e:  # noqa: BLE001
            falhas.append(f"{a['nome']}: {e}")
    return f"desligados: {feitos or 'nenhum'}; falhas: {falhas or 'nenhuma'}"


def t_executar_cena(nome: str):
    from app.rotas import api as rapi
    db = _db()
    c = db.consultar("SELECT id, nome FROM cenas WHERE lower(nome) LIKE ?", (f"%{nome.lower()}%",))
    if len(c) != 1:
        return f"cena ambígua ou não encontrada: {[x['nome'] for x in c] or 'nenhuma'}"
    r = rapi.executar_cena(c[0]["id"])
    return f"{c[0]['nome']}: {sum(1 for x in r['resultados'] if x['ok'])}/{len(r['resultados'])} comandos ok"


def t_editar_arquivo(caminho: str, antigo: str, novo: str):
    p = caminho_seguro(caminho)
    s = p.read_text()
    if s.count(antigo) != 1:
        raise ValueError(f"o trecho antigo aparece {s.count(antigo)} vezes (precisa ser exatamente 1)")
    p.write_text(s.replace(antigo, novo))
    return f"{caminho} editado"


def t_escrever_arquivo(caminho: str, conteudo: str):
    p = caminho_seguro(caminho)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(conteudo)
    return f"{caminho} gravado ({len(conteudo)} caracteres)"


def t_executar_comando(comando: str):
    if re.search(r"(\.env|credentials|rm\s+-rf\s+/|sudo|mkfs|diskutil\s+erase|dd\s+if=|git\s+push\s+.*--force)", comando):
        raise ValueError("comando bloqueado (segredos, sudo ou destrutivo)")
    r = subprocess.run(comando, shell=True, cwd=RAIZ, capture_output=True, text=True, timeout=180)
    return f"saída {r.returncode}\n{(r.stdout + r.stderr)[-6000:]}"


FERRAMENTAS = {
    "ler_arquivo": (t_ler_arquivo, False, "Lê um arquivo do projeto (caminho relativo à raiz), com números de linha.",
                    {"caminho": "string", "inicio": "integer", "fim": "integer"}, ["caminho"]),
    "listar": (t_listar, False, "Lista arquivos de uma pasta do projeto (padrão glob, ex.: '*.py' ou '**/*.jsx').", {"caminho": "string", "padrao": "string"}, []),
    "buscar": (t_buscar, False, "Procura um regex no código do projeto (arquivos: filtro glob do nome, ex.: '*.py').",
               {"regex": "string", "caminho": "string", "arquivos": "string"}, ["regex"]),
    "estado_sistema": (t_estado_sistema, False, "Estado ao vivo: computadores do agente, transmissores e todos os ares (ligado, temperatura, transmissor).", {}, []),
    "atividade": (t_atividade, False, "Últimos eventos da Atividade (comandos, falhas, agentes).", {"limite": "integer", "so_falhas": "boolean"}, []),
    "consultar_banco": (t_consultar_banco, False, "SELECT no banco (Postgres) para responder perguntas; sem tabelas sensíveis.", {"sql": "string"}, ["sql"]),
    "comandar_ar": (t_comandar_ar, True, "Liga ou desliga um ar (nome ou id), com temperatura e modo (frio, quente, ventilar, seco, auto) opcionais.",
                    {"ar": "string", "ligado": "boolean", "temperatura": "integer", "modo": "string"}, ["ar", "ligado"]),
    "desligar_todos": (t_desligar_todos, True, "Desliga todos os ares ligados.", {}, []),
    "executar_cena": (t_executar_cena, True, "Executa uma cena pelo nome.", {"nome": "string"}, ["nome"]),
    "editar_arquivo": (t_editar_arquivo, True, "Troca um trecho exato (que aparece uma vez) por outro num arquivo do projeto.",
                       {"caminho": "string", "antigo": "string", "novo": "string"}, ["caminho", "antigo", "novo"]),
    "escrever_arquivo": (t_escrever_arquivo, True, "Cria ou substitui um arquivo inteiro do projeto.", {"caminho": "string", "conteudo": "string"}, ["caminho", "conteudo"]),
    "executar_comando": (t_executar_comando, True, "Roda um comando no terminal na raiz do projeto (build, testes, git status…). Até 180 s.",
                         {"comando": "string"}, ["comando"]),
}


def esquema():
    return [{"type": "function", "function": {"name": n, "description": d,
             "parameters": {"type": "object", "properties": {k: {"type": t} for k, t in props.items()}, "required": req}}}
            for n, (_, _, d, props, req) in FERRAMENTAS.items()]


# ---------------- conversa ----------------
def contexto_inicial() -> str:
    claude = (RAIZ / "CLAUDE.md").read_text()
    fim = claude.find("## 3. Estrutura de pastas")
    resumo = claude[: fim if fim > 0 else 40000]
    sessoes = sorted((RAIZ / "docs/continuar").glob("sessao-*"))
    estado = (sessoes[-1] / "02-estado-atual.md").read_text() if sessoes and (sessoes[-1] / "02-estado-atual.md").exists() else ""
    return mascarar(
        "Você é o clima-ia, agente de IA do sistema Clima Escritório (controle de ares-condicionados por infravermelho), rodando no "
        "terminal do dono, na pasta do projeto. Responda sempre em português do Brasil, direto e sem enrolar. Use as ferramentas para "
        "ler o código e ver o estado real antes de afirmar algo; não invente. Antes de mudar algo (ares, arquivos, comandos), explique "
        "o que vai fazer: o usuário confirma cada ação no terminal. Infravermelho não tem endereço: ares iguais à vista do mesmo "
        "transmissor mudam juntos. Comandos de ar só chegam com um agente ligado na rede do escritório que enxergue o transmissor: "
        "sem isso o comando falha em cerca de 8 segundos (não fica guardado na fila para depois).\n\n"
        f"=== CLAUDE.md (seções 0 a 2; o resto você lê com ler_arquivo) ===\n{resumo}\n\n=== Estado registrado na última sessão ===\n{estado}"
        + (f"\n\n=== Memória do dono (agente-ia/MEMORIA.md) ===\n{MEMORIA.read_text()[:6000]}" if MEMORIA.exists() else ""))


class Agente:
    def __init__(self, modelo: str):
        self.modelo = modelo
        self.chave = os.environ.get("NVIDIA_API_KEY", "")
        self.msgs = [{"role": "system", "content": contexto_inicial()}]
        self.auto_leitura = True

    def _pedir(self):
        corpo = {"model": self.modelo, "messages": self.msgs, "tools": esquema(), "temperature": 0.2, "max_tokens": 4096, "stream": True}
        texto, chamadas = "", {}
        t0 = time.time()
        status = con.status("[magenta]✻ Pensando…[/magenta] [dim](esc ou Ctrl+C interrompe)[/dim]", spinner="dots")
        status.start()
        parado = False

        def parar():
            nonlocal parado
            if not parado:
                status.stop(); parado = True
        ESTADO["tokens"] += sum(len(str(m.get("content") or "")) for m in self.msgs[-3:]) // 4
        with httpx.stream("POST", URL, json=corpo, headers={"Authorization": f"Bearer {self.chave}"}, timeout=httpx.Timeout(120, connect=15)) as r:
            if r.status_code != 200:
                raise RuntimeError(f"NVIDIA respondeu {r.status_code}: {r.read().decode()[:300]}")
            for linha in r.iter_lines():
                if not linha.startswith("data:") or linha.strip() == "data: [DONE]":
                    continue
                d = json.loads(linha[5:]).get("choices", [{}])[0].get("delta", {})
                if not parado:
                    status.update(f"[magenta]✻ Pensando…[/magenta] [dim]({int(time.time() - t0)} s · esc ou Ctrl+C interrompe)[/dim]")
                if d.get("content") or d.get("tool_calls"):
                    parar()
                if d.get("content"):
                    texto += d["content"]
                    con.print(d["content"], end="", markup=False, highlight=False, soft_wrap=True)
                for tc in d.get("tool_calls") or []:
                    c = chamadas.setdefault(tc.get("index", 0), {"id": "", "nome": "", "args": ""})
                    c["id"] = tc.get("id") or c["id"]
                    f = tc.get("function") or {}
                    c["nome"] += f.get("name") or ""
                    c["args"] += f.get("arguments") or ""
        parar()
        if texto:
            con.print()
        ESTADO["tokens"] += len(texto) // 4
        return texto, [chamadas[i] for i in sorted(chamadas)]

    def turno(self, pergunta: str):
        self.msgs.append({"role": "user", "content": mascarar(pergunta)})
        for _ in range(12):   # no máximo 12 rodadas de ferramenta por pergunta
            texto, chamadas = self._pedir()
            self.msgs.append({"role": "assistant", "content": texto or None,
                              **({"tool_calls": [{"id": c["id"] or f"c{i}", "type": "function", "function": {"name": c["nome"], "arguments": c["args"] or "{}"}}
                                                 for i, c in enumerate(chamadas)]} if chamadas else {})})
            if not chamadas:
                return
            for i, c in enumerate(chamadas):
                saida = self._rodar(c)
                self.msgs.append({"role": "tool", "tool_call_id": c["id"] or f"c{i}", "content": mascarar(saida)[:12000]})

    def _rodar(self, c) -> str:
        nome = c["nome"]
        if nome not in FERRAMENTAS:
            return f"ferramenta desconhecida: {nome}"
        fn, muda, _, _, _ = FERRAMENTAS[nome]
        try:
            args = json.loads(c["args"] or "{}")
        except json.JSONDecodeError:
            return "argumentos inválidos (JSON)"
        resumo = ", ".join(f"{k}={str(v)[:60]!s}" for k, v in args.items() if k not in ("conteudo", "antigo", "novo"))
        con.print(f"[green]⏺[/green] [bold]{NOMES_FERRAMENTA.get(nome, nome)}[/bold]([dim]{mascarar(resumo)}[/dim])")
        modo = MODOS_PERMISSAO[ESTADO["modo"]]
        if muda and modo == "só leitura":
            con.print("[dim]  ⎿ bloqueado: modo só leitura (Shift+Tab troca)[/dim]")
            return "o modo só leitura está ativo: nenhuma ação que muda algo é permitida. Explique o que faria."
        if muda and modo == "aceitar edições" and nome in ("editar_arquivo", "escrever_arquivo"):
            muda = False   # edições de arquivo passam direto; ares e comandos continuam pedindo
        if muda:
            if nome == "editar_arquivo":
                dif = "".join(difflib.unified_diff(args.get("antigo", "").splitlines(True), args.get("novo", "").splitlines(True), "antes", "depois"))
                con.print(Syntax(mascarar(dif) or "(sem diferença)", "diff", theme="ansi_dark"))
            elif nome == "escrever_arquivo":
                con.print(Panel(mascarar(args.get("conteudo", ""))[:2000], title=args.get("caminho", ""), border_style="dim"))
            resp = con.input("[yellow]Permitir? [s]im / [n]ão / [t]odas as edições nesta conversa: [/yellow]").strip().lower()
            if resp in ("t", "todas"):
                ESTADO["modo"] = 1; resp = "s"
            if resp not in ("s", "sim", "y"):
                return "o usuário NÃO permitiu esta ação"
        try:
            saida = str(fn(**args))
            _registrar(nome, args, True)
        except Exception as e:  # noqa: BLE001
            saida = f"erro: {getattr(e, 'detail', None) or e}"
            _registrar(nome, args, False, saida)
        linhas = saida.splitlines()
        con.print(f"[dim]  ⎿ {mascarar(linhas[0][:160]) if linhas else '(vazio)'}{' …' if len(linhas) > 1 else ''}[/dim]")
        return saida


def _registrar(nome, args, ok, erro=""):
    if nome in ("comandar_ar", "desligar_todos", "executar_cena", "editar_arquivo", "escrever_arquivo", "executar_comando"):
        try:
            _db().registrar("ia", f"Agente de IA: {nome}", ok=ok, detalhe=mascarar(json.dumps(args, ensure_ascii=False))[:200] + (f" · {erro[:80]}" if erro else ""))
        except Exception:  # noqa: BLE001
            pass


AJUDA = """**Conversa**: escreva do seu jeito. `@caminho` anexa um arquivo; `!comando` roda no terminal; `#texto` guarda na memória.

**Ares (direto, sem IA)**
- `/ares` tabela de todos · `/ligar NOME [graus]` · `/desligar NOME` · `/temp NOME 23` · `/cenas` · `/cena NOME`
- `/transmissores` · `/agentes` · `/falhas`

**Sessão**
- `/status` resumo pela IA · `/modelo [ultra|rapido|mistral|ID]` · `/permissoes` (ou **Shift+Tab**): perguntar · aceitar edições · só leitura
- `/contexto` tamanho da conversa · `/compactar` resume e continua · `/memoria` mostra a memória · `/revisar` revisa o git diff
- `/limpar` conversa nova · `/salvar` grava em ~/.clima-ia · `/sair` (ou Ctrl+D)

**Exemplos**: "quais ares estão ligados?", "desliga o ar do diretor", "por que o transmissor dos Devs falhou hoje?",
"onde fica a lógica do pôr do sol?", "roda o build do frontend".

Tudo que muda algo (ares, arquivos, comandos) pede **sim** aqui. Segredos nunca saem desta máquina."""


COMANDOS = ["/ajuda", "/status", "/ares", "/ligar", "/desligar", "/temp", "/cenas", "/cena", "/transmissores", "/agentes", "/falhas",
            "/modelo", "/permissoes", "/contexto", "/compactar", "/memoria", "/revisar", "/limpar", "/salvar", "/sair"]


class Completar(Completer):
    """/comandos no começo e @arquivos em qualquer lugar (como no Claude Code)."""
    def get_completions(self, doc, _ev):
        t = doc.text_before_cursor
        if t.startswith("/") and " " not in t:
            for c in COMANDOS:
                if c.startswith(t):
                    yield Completion(c, start_position=-len(t))
            return
        m = re.search(r"@([\w./-]*)$", t)
        if m:
            parcial = m.group(1)
            base = RAIZ / (parcial.rsplit("/", 1)[0] if "/" in parcial else "")
            try:
                for p in sorted(base.iterdir())[:200]:
                    rel = str(p.relative_to(RAIZ)) + ("/" if p.is_dir() else "")
                    if rel.startswith(parcial) and not any(x.rstrip("/") in rel for x in PROIBIDOS) and "node_modules" not in rel:
                        yield Completion(rel, start_position=-len(parcial))
            except OSError:
                return


def _estado_rapido():
    """Para a barra de baixo: ares ligados e agente (no máximo a cada 30 s, sem travar a digitação)."""
    if time.time() - ESTADO["visto"] < 30:
        return
    ESTADO["visto"] = time.time()
    try:
        from app import transmissor
        ESTADO["ligados"] = _db().um("SELECT count(*) AS n FROM aparelhos WHERE ligado = 1")["n"]
        ESTADO["agente"] = transmissor.agente_online()
    except Exception:  # noqa: BLE001
        pass


def _barra(ag):
    def f():
        _estado_rapido()
        lig = "?" if ESTADO["ligados"] is None else ESTADO["ligados"]
        agente = "agente on" if ESTADO["agente"] else "agente off"
        return (f" {ag.modelo.split('/')[-1]} · ⏵⏵ {MODOS_PERMISSAO[ESTADO['modo']]} (shift+tab) · {lig} ar(es) ligado(s) · {agente}"
                f" · ~{ESTADO['tokens'] // 1000}k tokens")
    return f


def _anexar(texto: str) -> str:
    """@caminho na mensagem: junta o conteúdo do arquivo (respeitando os arquivos protegidos)."""
    extra = []
    for m in re.finditer(r"@([\w./-]+)", texto):
        try:
            p = caminho_seguro(m.group(1))
            if p.is_file():
                extra.append(f"\n\n=== {m.group(1)} ===\n{p.read_text(errors='replace')[:20000]}")
                con.print(f"[dim]  ⎿ anexado {m.group(1)}[/dim]")
        except ValueError as e:
            con.print(f"[red]  ⎿ {m.group(1)}: {e}[/red]")
    return texto + "".join(extra)


def _tabela_ares():
    rs = _db().consultar("SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.ventilador, h.nome AS tx, h.online, p.nome AS sala FROM aparelhos a "
                         "LEFT JOIN hubs h ON h.id = a.hub_id LEFT JOIN projetos p ON p.id = a.projeto_id ORDER BY p.nome, a.nome")
    t = Table(title="Ares", header_style="bold", border_style="dim")
    for c in ("id", "ar", "sala", "estado", "transmissor"):
        t.add_column(c)
    for r in rs:
        t.add_row(str(r["id"]), r["nome"], r["sala"] or "", f"[green]● {r['modo']} {r['temperatura']}° {r['ventilador']}[/green]" if r["ligado"] else "[dim]○ desligado[/dim]",
                  (r["tx"] or "[red]sem transmissor[/red]") + ("" if not r["tx"] else (" [green]on[/green]" if r["online"] else " [red]off[/red]")))
    con.print(t)


def _direto(cmd: str, arg: str) -> bool:
    """Comandos dos ares sem passar pela IA. Devolve True se tratou."""
    try:
        if cmd == "/ares":
            _tabela_ares()
        elif cmd in ("/ligar", "/desligar", "/temp"):
            m = re.match(r"^(.*?)(?:\s+(\d{2}))?$", arg.strip())
            nome, graus = (m.group(1).strip(), m.group(2)) if m else (arg, None)
            if not nome:
                con.print(f"uso: {cmd} NOME{' [graus]' if cmd != '/desligar' else ''}"); return True
            if MODOS_PERMISSAO[ESTADO["modo"]] == "só leitura":
                con.print("[yellow]modo só leitura: troque com Shift+Tab[/yellow]"); return True
            r = t_comandar_ar(nome, cmd != "/desligar", int(graus) if graus else None)
            _registrar("comandar_ar", {"ar": nome, "graus": graus, "via": cmd}, True)
            con.print(f"[green]⏺[/green] {r}")
        elif cmd == "/cenas":
            for c in _db().consultar("SELECT nome FROM cenas ORDER BY nome"):
                con.print(f"  • {c['nome']}")
        elif cmd == "/cena":
            if con.input(f"[yellow]Executar a cena '{arg}'? [s/n]: [/yellow]").strip().lower() in ("s", "sim"):
                con.print(f"[green]⏺[/green] {t_executar_cena(arg)}")
        elif cmd == "/transmissores":
            for h in _db().consultar("SELECT nome, ip, versao, online, problema FROM hubs ORDER BY nome"):
                con.print(f"  {'[green]●[/green]' if h['online'] else '[red]○[/red]'} {h['nome']} · {h['ip']} · {h['versao']}" + (f" · [yellow]{h['problema'][:80]}[/yellow]" if h["problema"] else ""))
        elif cmd == "/agentes":
            from app import coordenador
            for m in coordenador.maquinas():
                con.print(f"  {'[green]●[/green]' if m.get('online') else '[red]○[/red]'} {m.get('nome')} · {'no comando' if m.get('principal') else 'reserva'} · enxerga {m.get('ve_transmissores') or 0}/{m.get('total_transmissores') or 0}")
        elif cmd == "/falhas":
            con.print(t_atividade(15, True) or "nenhuma falha")
        else:
            return False
    except Exception as e:  # noqa: BLE001
        con.print(f"[red]{mascarar(str(e))[:300]}[/red]")
    return True


def _boas_vindas(modelo):
    _estado_rapido()
    con.print(Panel.fit(
        f"[magenta]✻[/magenta] Bem-vindo ao [bold]clima-ia[/bold], o agente do Clima Escritório!\n\n"
        f"[dim]/ajuda para os comandos · /ares para ver os ares · Shift+Tab muda o modo de permissão[/dim]\n\n"
        f"[dim]pasta: {RAIZ}\nmodelo: {modelo}[/dim]", border_style="magenta"))
    con.print("\n[dim] Dicas para começar:[/dim]")
    for d in ("pergunte \"quais ares estão ligados?\" ou \"por que o ar do diretor não obedece?\"",
              "use @caminho para mostrar um arquivo (ex.: @backend/app/clima.py)",
              "!git status roda no terminal; #lembrete guarda na memória"):
        con.print(f"[dim]  · {d}[/dim]")
    con.print()


def main():
    ap = argparse.ArgumentParser(description="clima-ia: agente de IA do Clima Escritório no terminal")
    ap.add_argument("--modelo", default=None)
    ap.add_argument("pergunta", nargs="*")
    a = ap.parse_args()
    carregar_env()
    if not os.environ.get("NVIDIA_API_KEY"):
        con.print("[red]Falta NVIDIA_API_KEY no .env da raiz do projeto.[/red]"); return 1
    modelo = MODELOS.get(a.modelo or "", a.modelo) or os.environ.get("CLIMA_IA_MODELO") or MODELO_PADRAO
    ag = Agente(modelo)
    if a.pergunta:   # modo de uma pergunta só (para scripts)
        ag.turno(_anexar(" ".join(a.pergunta))); return 0
    PASTA_USUARIO.mkdir(exist_ok=True)
    _boas_vindas(modelo)
    teclas = KeyBindings()

    @teclas.add("s-tab")
    def _(ev):   # Shift+Tab: troca o modo de permissão, como no Claude Code
        ESTADO["modo"] = (ESTADO["modo"] + 1) % len(MODOS_PERMISSAO)
        ev.app.invalidate()

    sessao = PromptSession(history=FileHistory(str(PASTA_USUARIO / "historico")), completer=Completar(), key_bindings=teclas,
                           bottom_toolbar=_barra(ag), complete_while_typing=True)
    while True:
        try:
            p = sessao.prompt("> ").strip()
        except (EOFError, KeyboardInterrupt):
            con.print("até mais."); return 0
        if not p:
            continue
        if p.startswith("!"):   # terminal direto (você digitou: não pede confirmação)
            r = subprocess.run(p[1:], shell=True, cwd=RAIZ, capture_output=True, text=True, timeout=300)
            con.print(mascarar((r.stdout + r.stderr)[-8000:]) or f"(saída {r.returncode})")
            ag.msgs.append({"role": "user", "content": mascarar(f"(rodei no terminal: {p[1:]})\n{(r.stdout + r.stderr)[-3000:]}")})
            continue
        if p.startswith("#"):   # memória permanente
            with MEMORIA.open("a") as f:
                f.write(f"- {p[1:].strip()} ({time.strftime('%d/%m/%Y')})\n")
            con.print(f"[dim]  ⎿ guardado em {MEMORIA.relative_to(RAIZ)}[/dim]"); continue
        if p.startswith("/"):
            cmd, _, arg = p.partition(" ")
            if cmd in ("/sair", "/exit"):
                return 0
            if _direto(cmd, arg):
                continue
            if cmd == "/ajuda":
                con.print(Markdown(AJUDA)); continue
            if cmd == "/limpar":
                ag = Agente(ag.modelo); sessao.bottom_toolbar = _barra(ag); con.print("[dim]conversa nova[/dim]"); continue
            if cmd == "/modelo":
                if arg:
                    ag.modelo = MODELOS.get(arg, arg)
                con.print(f"modelo: [cyan]{ag.modelo}[/cyan] (atalhos: {', '.join(MODELOS)})"); continue
            if cmd == "/permissoes":
                ESTADO["modo"] = (ESTADO["modo"] + 1) % len(MODOS_PERMISSAO)
                con.print(f"modo de permissão: [cyan]{MODOS_PERMISSAO[ESTADO['modo']]}[/cyan]"); continue
            if cmd == "/contexto":
                chars = sum(len(str(m.get("content") or "")) for m in ag.msgs)
                con.print(f"{len(ag.msgs)} mensagens · ~{chars // 4 // 1000}k tokens · use /compactar quando passar de ~60k"); continue
            if cmd == "/memoria":
                con.print(Markdown(MEMORIA.read_text() if MEMORIA.exists() else "_memória vazia: use #texto para guardar_")); continue
            if cmd == "/compactar":
                ag.msgs.append({"role": "user", "content": "Resuma esta conversa em tópicos curtos: o que foi pedido, o que foi feito, decisões e o que falta. Só o resumo."})
                texto, _c = ag._pedir()
                ag.msgs = ag.msgs[:1] + [{"role": "user", "content": "Resumo da conversa até aqui:"}, {"role": "assistant", "content": texto}]
                con.print("[dim]  ⎿ conversa compactada[/dim]"); continue
            if cmd == "/status":
                p = "Resuma o estado do sistema agora (agente, transmissores e ares ligados) em poucas linhas."
            elif cmd == "/revisar":
                dif = subprocess.run("git diff --stat && git diff", shell=True, cwd=RAIZ, capture_output=True, text=True).stdout[:30000]
                if not dif.strip():
                    con.print("nada mudado no git"); continue
                p = "Revise estas mudanças como um revisor sênior: bugs, segurança (segredos, permissões), e o que testar. Seja direto.\n\n" + dif
            elif cmd == "/salvar":
                arq = PASTA_USUARIO / f"conversa-{time.strftime('%Y%m%d-%H%M')}.md"
                arq.write_text("\n\n".join(f"## {m['role']}\n{m.get('content') or ''}" for m in ag.msgs[1:]))
                con.print(f"salvo em {arq}"); continue
            else:
                con.print("comando desconhecido; /ajuda"); continue
        try:
            ag.turno(_anexar(p))
        except KeyboardInterrupt:
            con.print("\n[dim]interrompido[/dim]")
        except Exception as e:  # noqa: BLE001
            con.print(f"[red]{mascarar(str(e))}[/red]")


if __name__ == "__main__":
    sys.exit(main() or 0)
