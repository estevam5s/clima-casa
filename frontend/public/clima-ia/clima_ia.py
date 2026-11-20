#!/usr/bin/env python3
"""clima-ia (cliente): o Assistente do Clima Escritório no terminal, no jeito do Claude Code.

Instalação (uma linha, como a do Claude Code):
    curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash          (macOS / Linux)
    irm https://app.zynio.com.br/instalar-ia.ps1 | iex                  (Windows PowerShell)

Fala com a API do sistema usando a SUA conta: as ferramentas (estado, ares, salas, relatórios, comandos) rodam no
servidor com as suas permissões. Nenhuma chave da NVIDIA, do banco ou de integração fica neste computador: só a sua
sessão, em ~/.clima-ia/sessao.json (permissão 600), renovada sozinha.

Login: `clima-ia login` abre o navegador (com a verificação anti-robô e as duas etapas de sempre); o site mostra um
código de uso único que você cola aqui. PKCE: o código não vale nada sem o verificador que só este terminal tem.

Modos (Shift+Tab): manual (pede o seu "sim" antes de qualquer ação em lote) · aceitar (confirma sozinho) ·
plano (só leitura: consulta e propõe, não muda nada). Comandos: digite "/" para ver a lista.
"""
from __future__ import annotations

import hashlib
import json
import os
import random
import secrets
import sys
import threading
import time
import webbrowser
from pathlib import Path

import httpx
from prompt_toolkit import PromptSession
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.styles import Style
from rich.console import Console, Group
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

VERSAO = "1.5.0"
API = os.environ.get("CLIMA_URL", "https://app.zynio.com.br")
PASTA = Path.home() / ".clima-ia"
SESSAO = PASTA / "sessao.json"
con = Console(highlight=False)

# cores do Claude Code (capturas do brainless): laranja do cabeçalho, lavanda do texto, cinza das dicas
LARANJA, LAVANDA, CINZA, VERDE, VERMELHO, AZUL, AMARELO = "#d77757", "#c0caf5", "#949494", "#5faf5f", "#e06c75", "#7aa2f7", "#ffd700"
MODOS = [("manual", "⏸", "modo manual", CINZA, "· pede o seu sim antes de agir"), ("aceitar", "⏵⏵", "aceitar ações", "#afafd7", "(shift+tab para alternar)"),
         ("plano", "⏸", "modo plano", "#5fafaf", "(shift+tab para alternar) · só leitura")]
GERUNDIOS = ["Resfriando", "Consultando", "Calibrando", "Medindo", "Ajustando", "Conferindo", "Pensando", "Climatizando", "Organizando", "Verificando"]
COMANDOS = [
    ("/ajuda", "O que dá para fazer aqui"), ("/modelo", "Escolher o modelo de IA (13 gratuitos da NVIDIA)"), ("/plano", "Liga/desliga o modo plano (só leitura)"),
    ("/status", "Ares ligados, agente e transmissores"), ("/ligados", "Quais ares estão ligados agora"), ("/ares", "Todos os ares e o estado"),
    ("/salas", "Salas e quantos ares ligados"), ("/relatorio", "Uso e custo dos últimos 7 dias"), ("/falhas", "O que falhou e por quê"),
    ("/tempo", "Tempo lá fora e a temperatura sugerida"), ("/novidades", "O que mudou na última versão"), ("/limpar", "Começa uma conversa nova"),
    ("/conta", "Quem está logado"), ("/login", "Entrar com a sua conta"), ("/logout", "Sair desta conta neste computador"), ("/sair", "Fechar o clima-ia"),
]
PERGUNTAS = {"/status": "Me dê um resumo geral agora: ares ligados, agente no comando e transmissores.", "/ligados": "Quais ares estão ligados agora, com modo e temperatura?",
             "/ares": "Liste todos os meus ares com o estado de cada um.", "/salas": "Como estão as salas: quantos ares e quantos ligados em cada uma?",
             "/relatorio": "Faça um resumo dos últimos 7 dias: uso, consumo, custo e o que chama atenção.", "/falhas": "Quais comandos falharam recentemente e por quê? O que eu faço?",
             "/tempo": "Como está o tempo lá fora e qual temperatura você sugere para os ares?"}
EST = {"modo": 0, "modelo": "", "modelos": [], "hist": [], "conversa": None, "usuario": {}, "tokens": 0}


# ---------------- sessão (PKCE + refresh) ----------------
def _ler_sessao() -> dict:
    try:
        return json.loads(SESSAO.read_text())
    except (OSError, ValueError):
        return {}


def _gravar_sessao(s: dict):
    PASTA.mkdir(mode=0o700, exist_ok=True)
    SESSAO.write_text(json.dumps(s))
    os.chmod(SESSAO, 0o600)


def login():
    verificador = secrets.token_hex(48)
    desafio = hashlib.sha256(verificador.encode()).hexdigest()
    url = f"{API}/entrar-app?cli=1&desafio={desafio}"
    con.print(Panel(Text.assemble(("Entrar no clima-ia\n\n", f"bold {LAVANDA}"), ("1. Abra: ", CINZA), (url, AZUL),
                                  ("\n2. Entre com a sua conta e toque em ", CINZA), ("Gerar código para o terminal", "bold"),
                                  ("\n3. Cole o código aqui (vale 2 minutos, uma vez)", CINZA)), border_style=LARANJA, padding=(1, 2)))
    try:
        webbrowser.open(url)
    except Exception:  # noqa: BLE001
        pass
    codigo = input("❯ código: ").strip()
    if not codigo:
        con.print(f"[{CINZA}]Cancelado.[/]")
        return False
    r = httpx.post(f"{API}/api/apps/login/trocar", json={"codigo": codigo, "verificador": verificador}, timeout=30)
    if r.status_code != 200:
        con.print(f"[{VERMELHO}]Não deu: {_detalhe(r)}[/]")
        return False
    t = r.json()
    _gravar_sessao({"access": t["access_token"], "refresh": t["refresh_token"], "expira": t.get("expires_at") or time.time() + int(t.get("expires_in") or 3600)})
    con.print(f"[{VERDE}]✔ Entrou.[/] A sessão fica em {SESSAO} (só você lê).")
    return True


def _detalhe(r) -> str:
    try:
        return r.json().get("detail") or f"erro {r.status_code}"
    except ValueError:
        return f"erro {r.status_code}"


def _renovar(s: dict) -> dict | None:
    try:
        cfg = httpx.get(f"{API}/api/supabase-config", timeout=15).json()
        r = httpx.post(f"{cfg['url']}/auth/v1/token?grant_type=refresh_token", headers={"apikey": cfg["chave"]}, json={"refresh_token": s["refresh"]}, timeout=20)
        if r.status_code != 200:
            return None
        t = r.json()
        novo = {"access": t["access_token"], "refresh": t["refresh_token"], "expira": t.get("expires_at") or time.time() + int(t.get("expires_in") or 3600)}
        _gravar_sessao(novo)
        return novo
    except (httpx.HTTPError, KeyError, ValueError):
        return None


def chamar(metodo: str, caminho: str, corpo=None, timeout=120):
    s = _ler_sessao()
    if not s:
        raise RuntimeError("Você não entrou ainda. Rode /login (ou: clima-ia login).")
    if s.get("expira", 0) - time.time() < 90:
        s = _renovar(s) or s
    h = {"Authorization": f"Bearer {s['access']}", "User-Agent": f"clima-ia/{VERSAO}"}
    r = httpx.request(metodo, f"{API}{caminho}", json=corpo, headers=h, timeout=timeout)
    if r.status_code == 401:
        s2 = _renovar(s)
        if s2:
            h["Authorization"] = f"Bearer {s2['access']}"
            r = httpx.request(metodo, f"{API}{caminho}", json=corpo, headers=h, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(_detalhe(r))
    return r.json()


# ---------------- interface (componentes no jeito do Claude Code) ----------------
MASCOTE = ["   ▗▄▄▄▄▄▖   ", " ▗▟█▘ █ ▝█▙▖ ", " ▐█▄▄▄█▄▄▄█▌ ", "   ▀▘   ▝▀   "]


def cabecalho():
    u = EST["usuario"]
    nome = (u.get("nome") or u.get("email") or "").split(" ")[0] or "você"
    modelo = next((m["nome"] for m in EST["modelos"] if m["id"] == EST["modelo"]), EST["modelo"] or "modelo padrão")
    esq = Group(Text(f"Bem-vindo de volta, {nome}!", style=f"bold {LAVANDA}", justify="center"), Text(""),
                *[Text(l, style=LARANJA, justify="center") for l in MASCOTE], Text(""),
                Text(f"{modelo} · {u.get('papel_rotulo') or u.get('papel') or ''}", style=CINZA, justify="center"),
                Text(u.get("email") or "", style=CINZA, justify="center"), Text(f"~/{Path.cwd().name}", style=CINZA, justify="center"))
    novidades = []
    try:
        v = chamar("GET", "/api/novidades", timeout=20)["versoes"][0]
        novidades = (v.get("novo") or [])[:2]
    except Exception:  # noqa: BLE001
        pass
    dir_ = Group(Text("Dicas para começar", style=f"bold {LARANJA}"), Text("Pergunte do seu jeito: \"quais ares estão ligados?\"", style=LAVANDA),
                 Text("Digite / para ver os comandos · Shift+Tab muda o modo", style=LAVANDA), Text("─" * 34, style=LARANJA),
                 Text("Novidades", style=f"bold {LARANJA}"), *[Text(n[:60] + ("…" if len(n) > 60 else ""), style=LAVANDA) for n in novidades],
                 Text("/novidades para mais", style=f"italic {CINZA}"))
    t = Table.grid(padding=(0, 3))
    t.add_column(justify="center", ratio=1)
    t.add_column(ratio=1)
    t.add_row(esq, dir_)
    con.print(Panel(t, title=Text.assemble(("clima-ia ", LARANJA), (f"v{VERSAO}", CINZA)), title_align="left", border_style=LARANJA, padding=(1, 2)))


def ferramenta(nome: str, alvo: str, resultado: str, ok: bool = True):
    con.print(Text.assemble(("● ", VERDE if ok else VERMELHO), (nome, LAVANDA), ("(", CINZA), (alvo, AZUL), (")", CINZA)))
    con.print(Text.assemble(("  ⎿  ", CINZA), (resultado, LAVANDA if ok else VERMELHO)))


def mostrar_acoes(acoes: list):
    for a in acoes or []:
        if a.get("ok") is False:
            ferramenta("Ar", a.get("ar") or "?", f"não foi: {a.get('erro') or ''}", False)
        elif a.get("ferramenta") == "temporizador":
            ferramenta("Timer", a.get("ar") or "", f"{a.get('acao')} em {a.get('em_minutos')} min")
        else:
            estado = f"{a.get('modo')} {a.get('temperatura')}° · ventilação {a.get('ventilacao')}" if a.get("ligado") else "desligado"
            junto = f" (mudou junto: {', '.join(a.get('mudaram_junto') or [])})" if a.get("mudaram_junto") else ""
            ferramenta("Ar", a.get("ar") or "", estado + junto)


def permissao(c: dict) -> bool:
    """Pedido de permissão (como o do Claude Code): opções numeradas; Enter = Sim."""
    con.print(Panel(Text.assemble((c.get("descricao") or "Confirmar ação?", f"bold {LAVANDA}"), ("\n\n❯ 1. Sim\n  2. Não, e diga o que fazer diferente", LAVANDA)),
                    title=Text("Permissão", style=AMARELO), title_align="left", border_style=AMARELO, padding=(0, 2)))
    if MODOS[EST["modo"]][0] == "aceitar":
        con.print(f"[{CINZA}]  aceito sozinho (modo aceitar ações)[/]")
        return True
    resp = input("  ❯ ").strip().lower()
    return resp in ("", "1", "s", "sim", "y")


class Pensando:
    """Linha "✻ Resfriando… (12s · esc para interromper)" enquanto a IA responde."""
    def __init__(self):
        self.parar = threading.Event()
        self.t0 = time.time()
        self.palavra = random.choice(GERUNDIOS)

    def __enter__(self):
        if not sys.stdout.isatty():   # saída redirecionada: sem animação
            self.th = threading.Thread(target=lambda: None); self.th.start()
            return self

        def girar():
            gl = "✻✽✶✳✢·"
            i = 0
            while not self.parar.wait(0.12):
                s = int(time.time() - self.t0)
                sys.stdout.write(f"\r\033[38;2;215;119;87m{gl[i % len(gl)]} {self.palavra}…\033[0m \033[38;2;148;148;148m({s}s · ctrl+c para interromper)\033[0m   ")
                sys.stdout.flush()
                i += 1
            sys.stdout.write("\r\033[2K")
            sys.stdout.flush()
        self.th = threading.Thread(target=girar, daemon=True)
        self.th.start()
        return self

    def __exit__(self, *a):
        self.parar.set()
        self.th.join()


def perguntar(q: str):
    EST["hist"].append({"role": "user", "content": q[:4000]})
    modo = MODOS[EST["modo"]][0]
    corpo = {"mensagens": EST["hist"][-20:], "modelo": EST["modelo"] or None, "leitura": modo == "plano"}
    if EST["conversa"]:
        corpo["conversa_id"] = EST["conversa"]
    try:
        with Pensando():
            r = chamar("POST", "/api/ia/conversar", corpo, timeout=180)
    except KeyboardInterrupt:
        con.print(f"[{CINZA}]  Interrompido.[/]")
        EST["hist"].pop()
        return
    except RuntimeError as e:
        con.print(f"[{VERMELHO}]  {e}[/]")
        EST["hist"].pop()
        return
    EST["conversa"] = r.get("conversa_id") or EST["conversa"]
    mostrar_acoes(r.get("acoes"))
    texto = r.get("texto") or ""
    con.print(Text("● ", style=LAVANDA), end="")
    con.print(Markdown(texto))
    EST["hist"].append({"role": "assistant", "content": texto[:4000]})
    for c in r.get("confirmacoes") or []:
        if permissao(c):
            try:
                rr = chamar("POST", "/api/ia/confirmar", {"confirmacao": c["confirmacao"]})
                ferramenta("Confirmar", c.get("descricao", "")[:40], rr.get("texto") or "feito")
            except RuntimeError as e:
                ferramenta("Confirmar", c.get("descricao", "")[:40], str(e), False)
        else:
            con.print(f"[{CINZA}]  Cancelado. Diga o que fazer diferente.[/]")


def escolher_modelo():
    for i, m in enumerate(EST["modelos"], 1):
        marca = "◉" if m["id"] == EST["modelo"] else "○"
        extra = "" if m.get("ferramentas") else " · só texto"
        con.print(Text.assemble((f"  {marca} {i:>2}. ", LARANJA if m["id"] == EST["modelo"] else CINZA), (m["nome"], LAVANDA), (f"  {m.get('descricao', '')}{extra}", CINZA)))
    n = input("  ❯ número (Enter mantém): ").strip()
    if n.isdigit() and 1 <= int(n) <= len(EST["modelos"]):
        EST["modelo"] = EST["modelos"][int(n) - 1]["id"]
        con.print(f"[{VERDE}]  Modelo: {EST['modelos'][int(n) - 1]['nome']}[/]")


class Completa(Completer):
    def get_completions(self, doc, evento):
        t = doc.text_before_cursor
        if t.startswith("/") and " " not in t:
            for c, d in COMANDOS:
                if c.startswith(t):
                    yield Completion(c, start_position=-len(t), display=c, display_meta=d)


def chip():
    m = next((x for x in EST["modelos"] if x["id"] == EST["modelo"]), None)
    return f"◉ {m['nome'] if m else 'modelo padrão'} · /modelo"


def rodape():
    _, g, rot, cor, dica = MODOS[EST["modo"]]
    return HTML(f'<style fg="{cor}">{g} {rot}</style> <style fg="{CINZA}">{dica} · / para comandos · ctrl+d para sair</style>')


def comando_local(q: str) -> bool:
    c = q.split()[0].lower()
    if c in ("/sair", "/exit", "/quit"):
        raise EOFError
    if c == "/ajuda":
        for cm, d in COMANDOS:
            con.print(Text.assemble((f"  {cm:<12}", AZUL), (d, CINZA)))
        con.print(f"[{CINZA}]  Shift+Tab: manual → aceitar ações → plano (só leitura). Ctrl+C interrompe a resposta.[/]")
    elif c == "/modelo":
        escolher_modelo()
    elif c == "/plano":
        EST["modo"] = 0 if MODOS[EST["modo"]][0] == "plano" else 2
        con.print(f"[{CINZA}]  {MODOS[EST['modo']][2]}[/]")
    elif c == "/limpar":
        EST["hist"], EST["conversa"] = [], None
        con.clear()
        cabecalho()
    elif c == "/conta":
        u = EST["usuario"]
        con.print(f"  {u.get('nome') or '-'} · {u.get('email')} · {u.get('papel_rotulo') or u.get('papel')}")
    elif c == "/login":
        if login():
            iniciar()
    elif c == "/logout":
        SESSAO.unlink(missing_ok=True)
        con.print(f"[{CINZA}]  Saiu deste computador.[/]")
    elif c == "/novidades":
        try:
            v = chamar("GET", "/api/novidades")["versoes"][0]
            con.print(Markdown(f"**{v['versao']}** · {v['titulo']}\n\n" + "\n".join(f"- {x}" for x in (v.get("novo") or []) + (v.get("melhorias") or []))))
        except RuntimeError as e:
            con.print(f"[{VERMELHO}]  {e}[/]")
    elif c in PERGUNTAS:
        perguntar(PERGUNTAS[c])
    else:
        return False
    return True


def iniciar():
    EST["usuario"] = chamar("GET", "/api/sessao", timeout=30)
    e = chamar("GET", "/api/ia/estado", timeout=30)
    EST["modelos"] = e.get("modelos") or []
    EST["modelo"] = EST["modelo"] or e.get("modelo") or ""


def main():
    args = sys.argv[1:]
    if args[:1] == ["login"]:
        login()
        return
    if args[:1] in (["--versao"], ["--version"], ["-v"]):
        print(f"clima-ia {VERSAO}")
        return
    if not _ler_sessao() and not login():
        return
    try:
        iniciar()
    except RuntimeError as e:
        con.print(f"[{VERMELHO}]{e}[/] Rode: clima-ia login")
        return
    if args and not args[0].startswith("-"):   # uma pergunta só: clima-ia "quais ares estão ligados?"
        perguntar(" ".join(args))
        return
    cabecalho()
    kb = KeyBindings()

    @kb.add("s-tab")
    def _(ev):
        EST["modo"] = (EST["modo"] + 1) % len(MODOS)
        ev.app.invalidate()

    PASTA.mkdir(mode=0o700, exist_ok=True)
    sess = PromptSession(history=FileHistory(str(PASTA / "historico")), completer=Completa(), complete_while_typing=True, key_bindings=kb,
                         bottom_toolbar=rodape, style=Style.from_dict({"bottom-toolbar": "noreverse bg:default", "rule": CINZA}))
    while True:
        try:
            con.print(Text(chip(), style=CINZA, justify="right"))
            con.rule(style=CINZA)
            q = sess.prompt(HTML(f'<style fg="{LAVANDA}">❯ </style>')).strip()
            con.rule(style=CINZA)
        except KeyboardInterrupt:
            continue
        except EOFError:
            con.print(f"[{CINZA}]Até mais.[/]")
            return
        if not q:
            continue
        con.print(Text(f"❯ {q}", style=f"{LAVANDA} on #3a3a3a"))
        try:
            if q.startswith("/") and comando_local(q):
                continue
        except EOFError:
            con.print(f"[{CINZA}]Até mais.[/]")
            return
        perguntar(q)


if __name__ == "__main__":
    main()
