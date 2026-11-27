#!/usr/bin/env python3
"""clima-ia: o Assistente do Clima Escritório no terminal, no jeito do Claude Code (verde, com o logo do sistema).

Instalação (uma linha):
    curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash          (macOS / Linux)
    irm https://app.zynio.com.br/instalar-ia.ps1 | iex                  (Windows PowerShell)

Fala com a API do sistema usando a SUA conta: as ferramentas rodam no servidor com as suas permissões. Nenhuma chave
da NVIDIA, do banco ou de integração fica neste computador: só a sua sessão, em ~/.clima-ia/sessao.json (600).

Login: `clima-ia login` abre o navegador; o site mostra um código de uso único (PKCE: não vale nada sem o verificador
que só este terminal tem). Limites de uso: sessão de 5 horas e semana, definidos pelo dono (/uso).
Segurança: /seguranca, /ataques, /ips, /ip, /bloquear, /desbloquear, /escudo, /sessoes, /telegram, /analisar,
/diagnostico (TLS, permissões, relógio, versão), /atualizar, /auditoria. Segredos colados na pergunta são ocultados.

1.8.0: a IA também trabalha NESTE computador (ler, listar e procurar arquivos; criar e editar arquivos; rodar comandos; salvar
relatórios), sempre na pasta onde o clima-ia foi aberto (ou em qualquer lugar com /liberdade total). Criar, editar, rodar e
salvar mostram o que vai acontecer e pedem o seu sim; rodar comando pede SEMPRE, até no modo aceitar ações. No sistema:
contas (listar, convidar, mudar papel, desativar, derrubar sessões), fluxos (listar, rodar, ligar) e bugs, com as suas
permissões e com confirmação no que muda algo. /usuarios e /fluxos mostram direto.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import random
import re
import secrets
import socket
import ssl
import sys
import threading
import time
import webbrowser
import difflib
import fnmatch
import subprocess
from pathlib import Path
from urllib.parse import urlparse

import httpx
from prompt_toolkit import PromptSession
from prompt_toolkit.application import Application
from prompt_toolkit.completion import Completer, Completion
from prompt_toolkit.formatted_text import HTML
from prompt_toolkit.history import FileHistory
from prompt_toolkit.key_binding import KeyBindings
from prompt_toolkit.layout import Layout, Window
from prompt_toolkit.layout.controls import FormattedTextControl
from prompt_toolkit.shortcuts import CompleteStyle
from prompt_toolkit.styles import Style
from rich.console import Console, Group
from rich.markdown import Markdown
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

VERSAO = "1.8.1"
API = os.environ.get("CLIMA_URL", "https://app.zynio.com.br")
PASTA = Path.home() / ".clima-ia"
SESSAO = PASTA / "sessao.json"
AUDITORIA = PASTA / "auditoria.log"
con = Console(highlight=False)

# paleta: a do Claude Code com o laranja trocado pelo verde da marca (o fundo do logo é o #0f766a do ícone do sistema)
VERDE, VERDE_ESCURO, LAVANDA, CINZA, OK, ERRO, AZUL, AMARELO, REGUA = (
    "#2fbf9b", "#0f766a", "#c0caf5", "#949494", "#5faf5f", "#e06c75", "#7aa2f7", "#ffd700", "#808080")
MODOS = [  # (chave, glifo, rótulo, cor, dica) como os de shift+tab do Claude Code
    ("manual", "⏸", "modo manual ligado", CINZA, "· ? para atalhos · pede o seu sim antes de agir"),
    ("aceitar", "⏵⏵", "aceitar ações ligado", "#afafd7", "(shift+tab para alternar)"),
    ("plano", "⏸", "modo plano ligado", "#5fafaf", "(shift+tab para alternar) · só leitura"),
]
GERUNDIOS = ["Resfriando", "Climatizando", "Consultando", "Calibrando", "Medindo", "Ajustando", "Conferindo", "Ventilando", "Organizando", "Verificando"]
COMANDOS = [
    ("/ajuda", "O que dá para fazer aqui"), ("/modelo", "Escolher o modelo de IA (setas + Enter)"), ("/uso", "Limite da sessão de 5 horas e da semana"),
    ("/plano", "Liga/desliga o modo plano (só leitura)"), ("/status", "Ares ligados, agente e transmissores"), ("/ligados", "Quais ares estão ligados agora"),
    ("/ares", "Todos os ares e o estado"), ("/salas", "Salas e quantos ares ligados"), ("/relatorio", "Uso e custo dos últimos 7 dias"),
    ("/falhas", "O que falhou e por quê"), ("/tempo", "Tempo lá fora e a temperatura sugerida"),
    ("/seguranca", "Postura de segurança: controles conferidos ao vivo"), ("/ataques", "Ataques recentes por tipo e por IP"),
    ("/ips", "IPs bloqueados e liberados"), ("/ip", "Investigar um IP: /ip 203.0.113.7"), ("/bloquear", "Bloquear IP ou faixa: /bloquear IP [horas] [motivo]"),
    ("/desbloquear", "Tirar um IP da lista: /desbloquear IP"), ("/escudo", "Escudo anti-DDoS: /escudo [ligar|desligar] [min]"),
    ("/sessoes", "Suas sessões abertas (e encerrar as outras)"), ("/telegram", "Segurança do bot do Telegram"),
    ("/analisar", "A IA analisa os ataques das últimas 24 h"), ("/integridade", "Selo de integridade dos registros"),
    ("/diagnostico", "Confere TLS, permissões, relógio, versão e conexão"), ("/atualizar", "Baixa a versão nova do clima-ia"),
    ("/auditoria", "O que você fez por aqui (registro local)"), ("/novidades", "O que mudou na última versão"),
    ("/config", "Cores, tema do código, modo padrão, dicas e som"), ("/tema", "Tema e cor de destaque"),
    ("/retomar", "Voltar a uma conversa anterior"), ("/atalhos", "Teclas e atalhos"),
    ("/usuarios", "Contas do sistema (quem gerencia usuários)"), ("/fluxos", "Fluxos de Rotinas → Fluxos e a última execução"),
    ("/liberdade", "Onde a IA mexe em arquivos: /liberdade pasta | total"), ("/ferramentas", "Ligar/desligar ferramentas neste computador"),
    ("/limpar", "Começa uma conversa nova"), ("/conta", "Quem está logado"), ("/login", "Entrar com a sua conta"),
    ("/logout", "Sair desta conta neste computador"), ("/sair", "Fechar o clima-ia"),
]
PERGUNTAS = {"/status": "Me dê um resumo geral agora: ares ligados, agente no comando e transmissores.", "/ligados": "Quais ares estão ligados agora, com modo e temperatura?",
             "/ares": "Liste todos os meus ares com o estado de cada um.", "/salas": "Como estão as salas: quantos ares e quantos ligados em cada uma?",
             "/relatorio": "Faça um resumo dos últimos 7 dias: uso, consumo, custo e o que chama atenção.", "/falhas": "Quais comandos falharam recentemente e por quê? O que eu faço?",
             "/tempo": "Como está o tempo lá fora e qual temperatura você sugere para os ares?"}
EST = {"modo": 0, "modelo": "", "modelos": [], "hist": [], "conversa": None, "usuario": {}, "uso": None, "uso_em": 0.0, "ativo_em": time.time()}

# segredos que não podem ir para o modelo nem ficar no histórico (colados sem querer na pergunta)
SEGREDOS = re.compile(r"(ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{20,}|nvapi-[A-Za-z0-9_-]{20,}|"
                      r"sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,}|vcp_[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9+/=]{10,}|re_[A-Za-z0-9]{20,}|"
                      r"AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|"
                      r"-----BEGIN [A-Z ]*PRIVATE KEY-----|\b\d{8,10}:[A-Za-z0-9_-]{35}\b|(?i:(?:senha|password|passwd|secret|token)\s*[:=]\s*\S{6,}))")


# ---------------- configurações (~/.clima-ia/config.json): tema, cor de destaque, tema do código, modo, dicas, som ----------------
CONFIG = PASTA / "config.json"
TEMAS = {  # texto, apagado, régua, fundo da pergunta
    "escuro": ("#c0caf5", "#949494", "#808080", "#3a3a3a"), "claro": ("#24292f", "#6e7781", "#afb8c1", "#eaeef2"),
    "escuro-daltonico": ("#e6e6e6", "#9e9e9e", "#808080", "#3a3a3a"), "claro-daltonico": ("#1f1f1f", "#5f5f5f", "#a0a0a0", "#e8e8e8"),
    "contraste": ("#ffffff", "#c8c8c8", "#9e9e9e", "#303030"),
}
NOMES_TEMA = {"escuro": "Escuro", "claro": "Claro", "escuro-daltonico": "Escuro para daltônicos", "claro-daltonico": "Claro para daltônicos", "contraste": "Alto contraste"}
CORES = {"verde": ("#2fbf9b", "#0f766a"), "laranja": ("#d77757", "#9a4a2f"), "azul": ("#7aa2f7", "#3d59a1"), "roxo": ("#bb9af7", "#6d4bb3"),
         "rosa": ("#f7768e", "#a3364c"), "ciano": ("#7dcfff", "#2a7fa6"), "amarelo": ("#e0af68", "#9a7337"), "branco": ("#e6e6e6", "#8a8a8a")}
TEMAS_CODIGO = {"monokai": "Monokai", "dracula": "Dracula", "one-dark": "One Dark", "github-dark": "GitHub escuro", "nord": "Nord",
                "gruvbox-dark": "Gruvbox escuro", "solarized-dark": "Solarized escuro", "solarized-light": "Solarized claro", "vs": "Visual Studio claro", "friendly": "Claro suave"}
PADRAO_CFG = {"tema": "escuro", "cor": "verde", "codigo": "monokai", "modo": 0, "dicas": True, "som": False, "tokens": True,
              "liberdade": "pasta", "locais": True, "comandos": True}


def ler_config() -> dict:
    try:
        return {**PADRAO_CFG, **json.loads(CONFIG.read_text())}
    except (OSError, ValueError):
        return dict(PADRAO_CFG)


def gravar_config(c: dict):
    try:
        PASTA.mkdir(mode=0o700, exist_ok=True)
        CONFIG.write_text(json.dumps(c, ensure_ascii=False, indent=1))
    except OSError:
        pass


CFG = ler_config()


def aplicar_config():
    """Recalcula a paleta (as funções leem as cores na hora, então a troca vale na mesma sessão)."""
    global VERDE, VERDE_ESCURO, LAVANDA, CINZA, REGUA, FUNDO_PERGUNTA, MODOS
    VERDE, VERDE_ESCURO = CORES.get(CFG.get("cor"), CORES["verde"])
    LAVANDA, CINZA, REGUA, FUNDO_PERGUNTA = TEMAS.get(CFG.get("tema"), TEMAS["escuro"])
    MODOS = [("manual", "⏸", "modo manual ligado", CINZA, "· ? para atalhos · pede o seu sim antes de agir"),
             ("aceitar", "⏵⏵", "aceitar ações ligado", "#afafd7", "(shift+tab para alternar)"),
             ("plano", "⏸", "modo plano ligado", "#5fafaf", "(shift+tab para alternar) · só leitura")]


FUNDO_PERGUNTA = "#3a3a3a"


# ---------------- logo do sistema em pixels (meio-bloco: 2 pixels por caractere) ----------------
def _pixels(n=16, raio=4.0, braco=0.31, larg=0.052):
    """Quadrado arredondado verde com o asterisco branco de 6 pontas: o mesmo desenho do ícone do app."""
    c = n / 2
    g = [[None] * n for _ in range(n)]
    for y in range(n):
        for x in range(n):
            px, py = x + .5, y + .5
            dx, dy = max(abs(px - c) - (c - raio), 0), max(abs(py - c) - (c - raio), 0)
            if dx * dx + dy * dy > raio * raio:
                continue
            g[y][x] = VERDE_ESCURO
            for ang in (90, 30, -30):
                a = math.radians(ang)
                ux, uy = math.cos(a), -math.sin(a)
                t, d = (px - c) * ux + (py - c) * uy, abs(-(px - c) * uy + (py - c) * ux)
                if abs(t) <= braco * n and d <= larg * n:
                    g[y][x] = "#ffffff"
                for s in (-1, 1):
                    ex, ey = c + s * braco * n * ux, c + s * braco * n * uy
                    if (px - ex) ** 2 + (py - ey) ** 2 <= (larg * n) ** 2:
                        g[y][x] = "#ffffff"
    return g


def logo(n=16) -> list[Text]:
    if not con.color_system or con.color_system == "standard":   # terminal sem cor real: asterisco em texto
        return [Text("✳", style=f"bold {VERDE}", justify="center")]
    g, linhas = _pixels(n), []
    for y in range(0, n, 2):
        t = Text(justify="center")
        for x in range(n):
            a, b = g[y][x], g[y + 1][x] if y + 1 < n else None
            t.append("▀" if a else ("▄" if b else " "), style=f"{a} on {b}" if a and b else (a or b or ""))
        linhas.append(t)
    return linhas


# ---------------- sessão (PKCE + refresh) ----------------
def _ler_sessao() -> dict:
    try:
        return json.loads(SESSAO.read_text())
    except (OSError, ValueError):
        return {}


def _gravar_sessao(s: dict):
    PASTA.mkdir(mode=0o700, exist_ok=True)
    os.chmod(PASTA, 0o700)
    tmp = SESSAO.with_suffix(".tmp")
    tmp.write_text(json.dumps(s))
    os.chmod(tmp, 0o600)
    tmp.replace(SESSAO)


def auditar(acao: str, detalhe: str = ""):
    """Registro local do que foi feito por aqui (sem segredos), como um histórico de comandos com hora."""
    try:
        PASTA.mkdir(mode=0o700, exist_ok=True)
        with AUDITORIA.open("a") as f:
            f.write(f"{time.strftime('%Y-%m-%d %H:%M:%S')}\t{(EST['usuario'] or {}).get('email', '-')}\t{acao}\t{SEGREDOS.sub('[oculto]', detalhe)[:300]}\n")
        os.chmod(AUDITORIA, 0o600)
    except OSError:
        pass


def login():
    verificador = secrets.token_hex(48)
    desafio = hashlib.sha256(verificador.encode()).hexdigest()
    url = f"{API}/entrar-app?cli=1&desafio={desafio}"
    con.print(Panel(Text.assemble(("Entrar no clima-ia\n\n", f"bold {LAVANDA}"), ("1. Abra: ", CINZA), (url, AZUL),
                                  ("\n2. Entre com a sua conta e toque em ", CINZA), ("Gerar código para o terminal", "bold"),
                                  ("\n3. Cole o código aqui (vale 2 minutos, uma vez)", CINZA)), border_style=VERDE, padding=(1, 2)))
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
        con.print(f"[{ERRO}]Não deu: {_detalhe(r)}[/]")
        return False
    t = r.json()
    _gravar_sessao({"access": t["access_token"], "refresh": t["refresh_token"], "expira": t.get("expires_at") or time.time() + int(t.get("expires_in") or 3600)})
    con.print(f"[{OK}]✔ Entrou.[/] A sessão fica em {SESSAO} (só você lê).")
    auditar("login")
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


def chamar(metodo: str, caminho: str, corpo=None, timeout=120, params=None):
    s = _ler_sessao()
    if not s:
        raise RuntimeError("Você não entrou ainda. Rode /login (ou: clima-ia login).")
    if s.get("expira", 0) - time.time() < 90:
        s = _renovar(s) or s
    h = {"Authorization": f"Bearer {s['access']}", "User-Agent": f"clima-ia/{VERSAO}"}
    r = httpx.request(metodo, f"{API}{caminho}", json=corpo, headers=h, timeout=timeout, params=params)
    if r.status_code == 401:
        s2 = _renovar(s)
        if s2:
            h["Authorization"] = f"Bearer {s2['access']}"
            r = httpx.request(metodo, f"{API}{caminho}", json=corpo, headers=h, timeout=timeout, params=params)
    if r.status_code >= 400:
        raise RuntimeError(_detalhe(r))
    return r.json()


# ---------------- componentes (mesmo desenho do Claude Code) ----------------
def _nome_modelo() -> str:
    return next((m["nome"] for m in EST["modelos"] if m["id"] == EST["modelo"]), EST["modelo"].split("/")[-1] or "modelo padrão")


def _ha(ep) -> str:
    d = max(0, time.time() - (ep or 0))
    return f"{int(d // 60)}min" if d < 3600 else f"{int(d // 3600)}h" if d < 86400 else f"{int(d // 86400)}d"


def cabecalho(novidades: list[str] | None = None, pasta: str | None = None, linha_conta: str | None = None):
    """Caixa de boas-vindas no jeito do Claude Code: à esquerda saudação + logo + modelo/conta/pasta; à direita a atividade
    recente (últimas conversas, /retomar) e as novidades da versão do sistema."""
    u = EST["usuario"]
    nome = (u.get("nome") or "").strip().split(" ")[0]   # sem nome no perfil, não usa o e-mail na saudação
    if novidades is None:
        novidades = []
        try:
            v = chamar("GET", "/api/novidades", timeout=20)["versoes"][0]
            novidades = ((v.get("novo") or []) + (v.get("melhorias") or []))[:3]
        except Exception:  # noqa: BLE001
            pass
    recentes = []
    try:
        recentes = chamar("GET", "/api/ia/conversas", timeout=15)[:4]
    except Exception:  # noqa: BLE001
        pass
    papel = u.get("papel_rotulo") or (u.get("papel") or "").capitalize()
    esq = Group(Text(f"Bem-vindo de volta, {nome}!" if nome else "Bem-vindo de volta!", style=f"bold {LAVANDA}", justify="center"), Text(""), *logo(), Text(""),
                Text(f"{_nome_modelo()} · {MODOS[EST['modo']][0]}", style=CINZA, justify="center"),
                Text(linha_conta or f"{u.get('email') or ''}", style=CINZA, justify="center"),
                Text(f"Clima Escritório · {papel}" if papel else "Clima Escritório", style=CINZA, justify="center"),
                Text(pasta or f"~/{Path.cwd().name}", style=CINZA, justify="center"))
    larg = max(30, (con.width - 16) // 2 - 2)
    cortar = lambda s, n=larg: s if len(s) <= n else s[:n - 1] + "…"  # noqa: E731
    ativ = [Text.assemble((f"{_ha(c.get('atualizado_em')):<6}", CINZA), (cortar(c.get("titulo") or "Conversa", larg - 6), LAVANDA)) for c in recentes]
    if not ativ:
        ativ = [Text("Nenhuma conversa ainda", style=CINZA)]
    dir_ = Group(Text("Atividade recente", style=f"bold {VERDE}"), *ativ, Text("… /retomar para mais", style=f"italic {CINZA}"),
                 Text("─" * larg, style=VERDE_ESCURO),
                 Text("Novidades", style=f"bold {VERDE}"), *[Text(cortar(n), style=LAVANDA) for n in novidades],
                 Text("… /novidades para mais", style=f"italic {CINZA}"))
    altura = max(7 + len(logo()), 5 + len(ativ) + len(novidades))
    t = Table.grid(padding=(0, 2))
    t.add_column(justify="center", ratio=1)
    t.add_column(width=1)
    t.add_column(ratio=1)
    t.add_row(esq, Text("\n".join("│" for _ in range(altura)), style=VERDE_ESCURO), dir_)
    con.print(Panel(t, title=Text.assemble(("clima-ia ", VERDE), (f"v{VERSAO}", CINZA)), title_align="left", border_style=VERDE, padding=(1, 2)))
    if CFG.get("dicas", True):
        con.print(Text(f"  Dica: {random.choice(DICAS)}", style=CINZA))


DICAS = ["Shift+Tab troca entre manual, aceitar ações e modo plano.", "Digite / para ver os comandos; setas escolhem, Tab completa.",
         "/config muda as cores, o tema do código e o modo padrão.", "/retomar volta a uma conversa anterior.",
         "Ctrl+C interrompe a resposta; Ctrl+D fecha o clima-ia.", "? mostra todos os atalhos.",
         "clima-ia \"pergunta\" responde direto, sem abrir a conversa.", "/uso mostra o quanto falta do limite da sessão e da semana."]


def ferramenta(nome: str, alvo: str, resultado: str, ok: bool = True):
    con.print(Text.assemble(("● ", OK if ok else ERRO), (nome, LAVANDA), ("(", CINZA), (alvo, AZUL), (")", CINZA)))
    con.print(Text.assemble(("  ⎿  ", CINZA), (resultado, LAVANDA if ok else ERRO)))


def eco(q: str):
    """A pergunta enviada, numa faixa cinza da largura da tela (como no Claude Code)."""
    t = Text(f"❯ {q}", style=f"{LAVANDA} on {FUNDO_PERGUNTA}")
    t.pad_right(max(0, con.width - len(t.plain)))
    con.print(t)


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


def permissao(descricao: str, sempre_perguntar: bool = False) -> bool:
    """Pedido de permissão como o do Claude Code: opções numeradas; Enter = Sim. Ações de segurança sempre perguntam."""
    con.print(Panel(Text.assemble((descricao, f"bold {LAVANDA}"), ("\n\n❯ 1. Sim\n  2. Não, e diga o que fazer diferente", LAVANDA)),
                    title=Text("Permissão", style=AMARELO), title_align="left", border_style=AMARELO, padding=(0, 2)))
    if MODOS[EST["modo"]][0] == "aceitar" and not sempre_perguntar:
        con.print(f"[{CINZA}]  aceito sozinho (modo aceitar ações)[/]")
        return True
    return input("  ❯ ").strip().lower() in ("", "1", "s", "sim", "y")


class Pensando:
    """Linha "✻ Resfriando… (12s · ↑ 1,2k tokens · ctrl+c para interromper)" enquanto a IA responde."""
    def __init__(self, tokens: int = 0):
        self.parar, self.t0, self.palavra, self.tokens = threading.Event(), time.time(), random.choice(GERUNDIOS), tokens

    def __enter__(self):
        if not sys.stdout.isatty():
            self.th = threading.Thread(target=lambda: None)
            self.th.start()
            return self
        r, g, b = (int(VERDE[i:i + 2], 16) for i in (1, 3, 5))

        def girar():
            gl, i = "✻✽✶✳✢·", 0
            while not self.parar.wait(0.12):
                s = int(time.time() - self.t0)
                tk = f" · ↑ {self.tokens / 1000:.1f}k tokens".replace(".", ",") if self.tokens and CFG.get("tokens", True) else ""
                sys.stdout.write(f"\r\033[38;2;{r};{g};{b}m{gl[i % len(gl)]} {self.palavra}…\033[0m \033[38;2;148;148;148m({s}s{tk} · ctrl+c para interromper)\033[0m   ")
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


def escolher(titulo: str, itens: list[tuple[str, str, str]], atual: str) -> str | None:
    """Lista com setas (↑/↓, Enter escolhe, Esc cancela), como o /model do Claude Code. itens = [(id, nome, descrição)]."""
    if not sys.stdin.isatty():
        return None
    i = next((k for k, x in enumerate(itens) if x[0] == atual), 0)
    kb = KeyBindings()

    @kb.add("up")
    def _(e):
        nonlocal i
        i = (i - 1) % len(itens)

    @kb.add("down")
    def _(e):
        nonlocal i
        i = (i + 1) % len(itens)

    @kb.add("enter")
    def _(e):
        e.app.exit(result=itens[i][0])

    @kb.add("escape", eager=True)
    @kb.add("c-c")
    def _(e):
        e.app.exit(result=None)

    for n in range(min(9, len(itens))):
        @kb.add(str(n + 1))
        def _(e, n=n):
            e.app.exit(result=itens[n][0])

    def texto():
        linhas = [(f"fg:{VERDE} bold", f" {titulo}\n"), (f"fg:{CINZA}", " ↑/↓ para escolher · Enter confirma · Esc cancela\n\n")]
        for k, (iid, nome, desc) in enumerate(itens):
            sel = k == i
            linhas += [(f"fg:{VERDE}", " ❯ " if sel else "   "), (f"fg:{LAVANDA}" + (" bold" if sel else ""), f"{k + 1:>2}. {nome}"),
                       (f"fg:{OK}", " ✔" if iid == atual else "  "), (f"fg:{CINZA}", f"  {desc}\n")]
        return linhas
    app = Application(layout=Layout(Window(FormattedTextControl(texto), always_hide_cursor=True)), key_bindings=kb, full_screen=False)
    return app.run()


# ---------------- limites de uso (sessão de 5 h e semana) ----------------
def barra(pct: int, larg: int = 30) -> Text:
    cheio = round(larg * pct / 100)
    cor = ERRO if pct >= 90 else (AMARELO if pct >= 70 else VERDE)
    return Text.assemble(("█" * cheio, cor), ("░" * (larg - cheio), "#3a3a3a"))


def _quando(ep) -> str:
    if not ep:
        return ""
    t = time.localtime(ep)
    return time.strftime("%H:%M", t) if time.strftime("%d", t) == time.strftime("%d") else time.strftime("%d/%m às %H:%M", t)


def atualizar_uso(forcar=False):
    if forcar or time.time() - EST["uso_em"] > 60:
        try:
            EST["uso"] = chamar("GET", "/api/ia/uso", timeout=20)
            EST["uso_em"] = time.time()
        except RuntimeError:
            pass
    return EST["uso"]


def mostrar_uso():
    u = atualizar_uso(True)
    if not u:
        con.print(f"[{ERRO}]  Não consegui ler o uso agora.[/]")
        return
    m = u["meu"]
    con.print(Text("Uso do Assistente", style=f"bold {VERDE}"))
    if m.get("ilimitado"):
        con.print(f"[{CINZA}]  Sua conta não tem limite (definido pelo dono).[/]")
    for chave, rot in (("sessao", "Sessão atual (5 horas)"), ("semana", "Semana atual (7 dias)")):
        j = m[chave]
        con.print(Text(f"  {rot}", style=LAVANDA))
        if j.get("limite"):
            reinicia = f"reinicia {'às ' if chave == 'sessao' else 'em '}{_quando(j['reinicia_em'])}" if j.get("reinicia_em") else "começa na próxima pergunta"
            con.print(Text.assemble(("  ", ""), barra(j["pct"]), (f"  {j['pct']}% usado", LAVANDA), (f" · {reinicia}", CINZA)))
            con.print(Text(f"  {j['usado']:,} de {j['limite']:,} tokens".replace(",", "."), style=CINZA))
        else:
            con.print(Text(f"  {j['usado']:,} tokens · sem limite".replace(",", "."), style=CINZA))
    con.print(f"[{CINZA}]  A sessão começa na sua primeira pergunta e dura 5 horas; a semana, 7 dias. Vale para o painel, o terminal e o Telegram.[/]")
    if u.get("pessoas"):
        t = Table(title="Uso por pessoa (só o dono vê)", title_style=f"bold {VERDE}", border_style=CINZA, header_style=LAVANDA)
        for c in ("pessoa", "papel", "sessão", "semana"):
            t.add_column(c)
        for p in u["pessoas"]:
            f = lambda j: "sem limite" if not j.get("limite") else f"{j['pct']}%"  # noqa: E731
            t.add_row(p["nome"] or "-", p.get("papel") or "", f(p["sessao"]), f(p["semana"]))
        con.print(t)
        c = u.get("config") or {}
        con.print(f"[{CINZA}]  Limites: sessão {c.get('sessao', 0):,} · semana {c.get('semana', 0):,} tokens. Mude em app.zynio.com.br/ia → Configuração.[/]".replace(",", "."))


def aviso_uso() -> str:
    u = EST["uso"]
    if not u or u["meu"].get("ilimitado"):
        return ""
    for chave, rot in (("semana", "semanal"), ("sessao", "da sessão")):
        j = u["meu"][chave]
        if j.get("limite") and j["pct"] >= 80:
            return f"{j['pct']}% do limite {rot} · libera {_quando(j['reinicia_em'])}"
    return ""


# ---------------- conversa ----------------
def limpar_segredos(q: str) -> str:
    achados = SEGREDOS.findall(q)
    if not achados:
        return q
    con.print(Text(f"  ⚠ Ocultei {len(achados)} segredo(s) antes de enviar (chave, token ou senha). Nunca mande segredos para a IA.", style=AMARELO))
    auditar("segredo_ocultado", f"{len(achados)} item(ns)")
    return SEGREDOS.sub("[segredo oculto]", q)


def perguntar(q: str):
    q = limpar_segredos(q)
    EST["hist"].append({"role": "user", "content": q[:4000]})
    modo = MODOS[EST["modo"]][0]
    corpo = {"mensagens": EST["hist"][-20:], "modelo": EST["modelo"] or None, "leitura": modo == "plano", "terminal": True, "locais": ferramentas_ligadas()}
    if EST["conversa"]:
        corpo["conversa_id"] = EST["conversa"]
    estimado = sum(len(m["content"]) for m in corpo["mensagens"]) // 4 + 2500
    try:
        with Pensando(estimado):
            r = chamar("POST", "/api/ia/conversar", corpo, timeout=180)
    except KeyboardInterrupt:
        con.print(f"[{CINZA}]  Interrompido.[/]")
        EST["hist"].pop()
        return
    except RuntimeError as e:
        con.print(f"[{ERRO}]  {e}[/]")
        EST["hist"].pop()
        if "limite" in str(e).lower():
            con.print(f"[{CINZA}]  Veja o seu uso com /uso.[/]")
        return
    EST["conversa"] = r.get("conversa_id") or EST["conversa"]
    mostrar_acoes(r.get("acoes"))
    # ferramentas neste computador: executa, devolve o resultado e a IA continua (pode repetir algumas vezes)
    voltas = 0
    while r.get("pendentes_locais") and voltas < 12:
        voltas += 1
        if (r.get("texto") or "").strip():
            con.print(Text("● ", style=LAVANDA), end=""); con.print(Markdown(r["texto"], code_theme=CFG.get("codigo") or "monokai"))
        resultados = [{"id": p.get("id"), "conteudo": executar_local(p.get("nome"), p.get("args") or {})} for p in r["pendentes_locais"]]
        try:
            with Pensando(2500):
                r = chamar("POST", "/api/ia/continuar", {"continuar": r["continuar"], "resultados": resultados}, timeout=180)
        except (RuntimeError, KeyboardInterrupt) as e:
            con.print(f"[{ERRO}]  {e or 'Interrompido.'}[/]")
            return
        mostrar_acoes(r.get("acoes"))
    texto = r.get("texto") or ""
    con.print(Text("● ", style=LAVANDA), end="")
    con.print(Markdown(texto, code_theme=CFG.get("codigo") or "monokai"))
    if CFG.get("som"):
        sys.stdout.write("\a"); sys.stdout.flush()
    EST["hist"].append({"role": "assistant", "content": texto[:4000]})
    for c in r.get("confirmacoes") or []:
        if permissao(c.get("descricao") or "Confirmar ação?"):
            try:
                rr = chamar("POST", "/api/ia/confirmar", {"confirmacao": c["confirmacao"]})
                ferramenta("Confirmar", c.get("descricao", "")[:40], rr.get("texto") or "feito")
                auditar("confirmou", c.get("descricao", ""))
            except RuntimeError as e:
                ferramenta("Confirmar", c.get("descricao", "")[:40], str(e), False)
        else:
            con.print(f"[{CINZA}]  Cancelado. Diga o que fazer diferente.[/]")
    atualizar_uso(True)
    if aviso_uso():
        con.print(Text(f"  ⚠ {aviso_uso()} (/uso)", style=AMARELO))


def escolher_modelo():
    itens = [(m["id"], m["nome"], f"{m.get('empresa', '')} · {m.get('descricao', '')}" + ("" if m.get("ferramentas") else " · só texto"))
             for m in EST["modelos"]]
    novo = escolher("Escolha o modelo de IA", itens, EST["modelo"])
    if novo is None and not sys.stdin.isatty():
        for i, (iid, nome, desc) in enumerate(itens, 1):
            con.print(Text.assemble((f"  {i:>2}. ", CINZA), (nome, LAVANDA), (f"  {desc}", CINZA)))
        n = input("  ❯ número: ").strip()
        novo = itens[int(n) - 1][0] if n.isdigit() and 1 <= int(n) <= len(itens) else None
    if novo:
        EST["modelo"] = novo
        con.print(Text(f"  ⎿  Modelo: {_nome_modelo()}", style=OK))
        _gravar_pref()


def _gravar_pref():
    try:
        (PASTA / "preferencias.json").write_text(json.dumps({"modelo": EST["modelo"], "modo": EST["modo"]}))
    except OSError:
        pass


def _ler_pref():
    try:
        p = json.loads((PASTA / "preferencias.json").read_text())
        EST["modelo"] = p.get("modelo") or EST["modelo"]
        EST["modo"] = int(p.get("modo") or 0) % len(MODOS)
    except (OSError, ValueError):
        EST["modo"] = int(CFG.get("modo") or 0) % len(MODOS)


# ---------------- cibersegurança ----------------
def tabela(titulo: str, colunas: list[str], linhas: list[list], vazio: str = "Nada aqui."):
    if not linhas:
        con.print(f"[{CINZA}]  {vazio}[/]")
        return
    t = Table(title=titulo, title_style=f"bold {VERDE}", title_justify="left", border_style=CINZA, header_style=LAVANDA)
    for c in colunas:
        t.add_column(c, overflow="fold")
    for l in linhas:
        t.add_row(*[str(x if x is not None else "") for x in l])
    con.print(t)


def seg_postura():
    r = chamar("GET", "/api/seguranca/checklist")
    con.print(Text.assemble(("Postura de segurança  ", f"bold {VERDE}"), barra(r["nota"], 24), (f"  {r['nota']}% · {r['ok']} de {r['total']} controles", LAVANDA)))
    grupo = None
    for i in r["itens"]:
        if i["grupo"] != grupo:
            grupo = i["grupo"]
            con.print(Text(f"\n  {grupo.capitalize()}", style=f"bold {CINZA}"))
        con.print(Text.assemble(("  ✔ " if i["ok"] else "  ✘ ", OK if i["ok"] else ERRO), (i["item"], LAVANDA), (f"  {i['detalhe']}", CINZA)))


def seg_ataques(horas: int = 24):
    evs = chamar("GET", "/api/seguranca/eventos", params={"limite": 500})
    desde = time.time() - horas * 3600
    evs = [e for e in evs if (e.get("quando") or 0) >= desde]
    if not evs:
        con.print(f"[{OK}]  Nenhum evento de segurança nas últimas {horas} h.[/]")
        return
    por_tipo, por_ip = {}, {}
    for e in evs:
        por_tipo[e.get("tipo")] = por_tipo.get(e.get("tipo"), 0) + 1
        k = e.get("ip") or "?"
        x = por_ip.setdefault(k, {"n": 0, "pais": e.get("pais") or "", "tipos": set()})
        x["n"] += 1
        x["tipos"].add(e.get("tipo"))
    maior = max(por_tipo.values())
    con.print(Text(f"Ataques e eventos nas últimas {horas} h · {len(evs)}{'+ (os 500 mais recentes)' if len(evs) >= 500 else ' no total'}", style=f"bold {VERDE}"))
    for t, n in sorted(por_tipo.items(), key=lambda x: -x[1])[:12]:
        con.print(Text.assemble((f"  {t:<24}", LAVANDA), barra(round(100 * n / maior), 20), (f"  {n}", CINZA)))
    tabela("IPs mais ativos", ["IP", "país", "eventos", "tipos"], [[ip, x["pais"], x["n"], ", ".join(sorted(t for t in x["tipos"] if t))[:60]]
                                                                  for ip, x in sorted(por_ip.items(), key=lambda x: -x[1]["n"])[:10]])
    con.print(Text("  Investigue um IP com /ip <endereço>; bloqueie com /bloquear <endereço> [horas].", style=CINZA))


def seg_ips():
    rs = chamar("GET", "/api/seguranca/ips")
    tabela("Lista de IPs do firewall", ["id", "alvo", "tipo", "motivo", "automático", "expira"],
           [[r["id"], r["alvo"], r["tipo"], (r.get("motivo") or "")[:50], "sim" if r.get("automatico") else "não", _quando(r.get("expira_em")) or "nunca"] for r in rs],
           "Nenhum IP bloqueado ou liberado na lista.")


def seg_ip(ip: str):
    if not re.fullmatch(r"[0-9a-fA-F:.]{3,45}", ip or ""):
        con.print(f"[{ERRO}]  Use: /ip 203.0.113.7[/]")
        return
    evs = chamar("GET", "/api/seguranca/eventos", params={"ip": ip, "limite": 200})
    lista = [r for r in chamar("GET", "/api/seguranca/ips") if r["alvo"] == ip]
    situacao = f"{lista[0]['tipo']} ({lista[0].get('motivo') or 'sem motivo'})" if lista else "fora da lista"
    loc = next((f"{e.get('cidade') or ''} {e.get('regiao') or ''} {e.get('pais') or ''}".strip() for e in evs if e.get("pais")), "")
    con.print(Text.assemble(("IP ", f"bold {VERDE}"), (ip, AZUL), (f"  · {situacao}", LAVANDA), (f" · {loc}" if loc else "", CINZA)))
    tipos = {}
    for e in evs:
        tipos[e["tipo"]] = tipos.get(e["tipo"], 0) + 1
    con.print(Text("  " + (" · ".join(f"{t}: {n}" for t, n in sorted(tipos.items(), key=lambda x: -x[1])) or "sem eventos registrados"), style=LAVANDA))
    tabela("Últimos eventos", ["quando", "tipo", "rota", "detalhe"],
           [[_quando(e.get("quando")), e.get("tipo"), (e.get("rota") or "")[:40], (e.get("detalhe") or "")[:70]] for e in evs[:15]])


def _modo_leitura() -> bool:
    if MODOS[EST["modo"]][0] == "plano":
        con.print(f"[{AMARELO}]  Modo plano (só leitura): troque com Shift+Tab para mudar algo.[/]")
        return True
    return False


def seg_bloquear(args: list[str]):
    if not args:
        con.print(Text("  Use: /bloquear IP_ou_FAIXA [horas] [motivo]", style=ERRO))
        return
    if _modo_leitura():
        return
    alvo, horas = args[0], (int(args[1]) if len(args) > 1 and args[1].isdigit() else 24)
    motivo = " ".join(args[2:] if len(args) > 1 and args[1].isdigit() else args[1:]) or "bloqueado pelo terminal (clima-ia)"
    if permissao(f"Bloquear {alvo} por {horas} h no firewall? Motivo: {motivo}", sempre_perguntar=True):
        chamar("POST", "/api/seguranca/ips", {"alvo": alvo, "tipo": "bloqueado", "motivo": motivo[:200], "minutos": horas * 60})
        ferramenta("Firewall", alvo, f"bloqueado por {horas} h")
        auditar("bloquear_ip", f"{alvo} {horas}h {motivo}")


def seg_desbloquear(args: list[str]):
    if not args or _modo_leitura():
        if not args:
            con.print(f"[{ERRO}]  Use: /desbloquear IP[/]")
        return
    r = next((x for x in chamar("GET", "/api/seguranca/ips") if x["alvo"] == args[0]), None)
    if not r:
        con.print(f"[{CINZA}]  {args[0]} não está na lista.[/]")
        return
    if permissao(f"Tirar {r['alvo']} da lista ({r['tipo']})?", sempre_perguntar=True):
        chamar("DELETE", f"/api/seguranca/ips/{r['id']}")
        ferramenta("Firewall", r["alvo"], "removido da lista")
        auditar("desbloquear_ip", r["alvo"])


def seg_escudo(args: list[str]):
    e = chamar("GET", "/api/seguranca/escudo")
    if not args:
        con.print(Text.assemble(("Escudo anti-DDoS: ", f"bold {VERDE}"), ("LIGADO" if e.get("ativo") else "desligado", ERRO if e.get("ativo") else OK),
                                (f" · agora {e['taxa'].get('req_seg', 0)} req/s, {e['taxa'].get('ips_min', 0)} IPs/min" if isinstance(e.get("taxa"), dict) else "", CINZA)))
        con.print(f"[{CINZA}]  Automático: {'sim' if (e.get('config') or {}).get('escudo_auto') else 'não'} · use /escudo ligar 30 ou /escudo desligar[/]")
        return
    if _modo_leitura():
        return
    acao, minutos = args[0], (int(args[1]) if len(args) > 1 and args[1].isdigit() else 30)
    if acao not in ("ligar", "desligar"):
        con.print(Text("  Use: /escudo ligar [minutos] ou /escudo desligar", style=ERRO))
        return
    aviso = " Com ele ligado, o login pode pedir a verificação da Vercel." if acao == "ligar" else ""
    if permissao(f"{acao.capitalize()} o escudo anti-DDoS{f' por {minutos} min' if acao == 'ligar' else ''}?{aviso}", sempre_perguntar=True):
        chamar("POST", "/api/seguranca/escudo", {"acao": acao, "minutos": minutos})
        ferramenta("Escudo", acao, "feito")
        auditar("escudo", acao)


def seg_sessoes(args: list[str]):
    rs = chamar("GET", "/api/conta/sessoes")
    itens = rs.get("sessoes") if isinstance(rs, dict) else rs
    linhas = []
    for s in itens or []:
        linhas.append([s.get("id", "")[:8], "esta" if s.get("atual") else "", s.get("navegador") or s.get("agente") or s.get("user_agent") or "",
                       s.get("ip") or "", _quando(s.get("ultimo_uso") or s.get("visto_em") or s.get("atualizado_em"))])
    tabela("Suas sessões abertas", ["id", "", "aparelho", "IP", "último uso"], linhas)
    if args[:1] == ["encerrar"] and not _modo_leitura():
        if permissao("Encerrar todas as outras sessões (menos esta)?", sempre_perguntar=True):
            chamar("POST", "/api/conta/sessoes/encerrar", {"todas_menos_esta": True})
            ferramenta("Sessões", "outras", "encerradas")
            auditar("encerrar_sessoes")
    else:
        con.print(f"[{CINZA}]  Sessão que você não reconhece? /sessoes encerrar e troque a senha no painel.[/]")


def seg_telegram(horas: int = 168):
    r = chamar("GET", "/api/seguranca/telegram", params={"horas": horas})
    con.print(Text(f"Bot do Telegram · últimos {horas // 24} dias", style=f"bold {VERDE}"))
    tipos = r.get("por_tipo") or {}
    con.print(Text("  " + (" · ".join(f"{t}: {n}" for t, n in sorted(tipos.items(), key=lambda x: -x[1])) or "nenhum evento"), style=LAVANDA))
    vinc = r.get("vinculos") or []
    tabela("Contas vinculadas", ["chat", "pessoa", "identidade conferida", "PIN", "último uso"],
           [[v["chat"], v.get("nome") or "", "sim" if v.get("tg_id") else "não", "sim" if v.get("pin") else "não", _quando(v.get("ultimo"))] for v in vinc],
           "Nenhuma conta vinculada ao bot.")
    tabela("IPs que chamaram o webhook", ["IP", "chamadas", "rede oficial do Telegram", "último"],
           [[i["ip"], i["n"], "sim" if i.get("telegram") else "NÃO", _quando(i.get("ultimo"))] for i in r.get("ips") or []], "Nenhuma chamada registrada.")
    if r.get("bloqueios"):
        tabela("Chats bloqueados agora", ["chat", "até", "motivo"], [[b["chat"], _quando(b["ate"]), b.get("motivo") or ""] for b in r["bloqueios"]])
    negados = [e for e in r.get("eventos") or [] if not e.get("ok")]
    tabela("Tentativas negadas", ["quando", "chat", "usuário", "tipo", "texto"],
           [[_quando(e["quando"]), e["chat"], e.get("username") or "", e["tipo"], (e.get("texto") or "")[:40]] for e in negados[:15]], "Nenhuma tentativa negada.")


def seg_integridade():
    r = chamar("GET", "/api/seguranca/integridade")
    ok = r.get("ok", r.get("integro"))
    con.print(Text.assemble(("Integridade dos registros: ", f"bold {VERDE}"), ("íntegros" if ok else "ALTERADOS", OK if ok else ERRO)))
    for k, v in r.items():
        if k not in ("ok", "integro") and isinstance(v, (int, str)):
            con.print(Text.assemble((f"  {k}: ", CINZA), (str(v), LAVANDA)))


def seg_analisar():
    evs = chamar("GET", "/api/seguranca/eventos", params={"limite": 300})
    desde = time.time() - 86400
    evs = [e for e in evs if (e.get("quando") or 0) >= desde]
    if not evs:
        con.print(f"[{OK}]  Nada para analisar: nenhum evento nas últimas 24 h.[/]")
        return
    linhas = [f"{_quando(e.get('quando'))} {e.get('ip')} {e.get('pais') or ''} {e.get('tipo')} {(e.get('rota') or '')[:40]} {(e.get('detalhe') or '')[:60]}" for e in evs[:120]]
    perguntar("Você é analista de segurança. Analise estes eventos do firewall das últimas 24 h (um por linha) e responda em tópicos curtos: "
              "o que está acontecendo, quais IPs ou padrões são mais perigosos, se algum ataque parece ter dado certo, e o que fazer agora "
              "(bloquear quem, ligar o escudo ou não, o que conferir). Não invente dados.\n\n" + "\n".join(linhas))


def diagnostico():
    """Como o /doctor do Claude Code: confere o que costuma dar errado no terminal e na rede."""
    def item(ok, nome, det):
        con.print(Text.assemble(("  ✔ " if ok is True else ("  ⚠ " if ok is None else "  ✘ "), OK if ok is True else (AMARELO if ok is None else ERRO)), (nome, LAVANDA), (f"  {det}", CINZA)))
    con.print(Text("Diagnóstico do clima-ia", style=f"bold {VERDE}"))
    item(sys.version_info >= (3, 10), "Python", f"{platform.python_version()} · {platform.system()} {platform.machine()}")
    host = urlparse(API).hostname or ""
    try:
        t0 = time.time()
        r = httpx.get(f"{API}/saude", timeout=10)
        item(r.status_code == 200, "Servidor", f"{API} respondeu {r.status_code} em {int((time.time() - t0) * 1000)} ms")
        data = r.headers.get("date")
        if data:
            from email.utils import parsedate_to_datetime
            dif = abs(parsedate_to_datetime(data).timestamp() - time.time())
            item(dif < 120 or None, "Relógio", f"diferença de {int(dif)} s para o servidor" + (" (acerte a hora: o login vence antes)" if dif >= 120 else ""))
    except httpx.HTTPError as e:
        item(False, "Servidor", f"sem resposta: {str(e)[:120]}")
    if API.startswith("https://"):
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((host, 443), timeout=8) as s, ctx.wrap_socket(s, server_hostname=host) as t:
                cert = t.getpeercert()
                emissor = dict(x[0] for x in cert.get("issuer", ()))
                org = emissor.get("organizationName", "") + " " + emissor.get("commonName", "")
                conhecido = re.search(r"Let's Encrypt|Google Trust|DigiCert|Sectigo|GlobalSign|Amazon|ZeroSSL|GoDaddy|Entrust|Cloudflare", org, re.I)
                item(bool(conhecido) or None, "Certificado TLS", f"{t.version()} · emitido por {org.strip()}"
                     + ("" if conhecido else " · emissor incomum: a rede pode estar interceptando o HTTPS (firewall corporativo). Não entre por esta rede."))
        except ssl.SSLCertVerificationError as e:
            item(False, "Certificado TLS", f"inválido ({e.verify_message}): rede interceptando o HTTPS? Não use esta rede.")
        except OSError as e:
            item(None, "Certificado TLS", f"não conferi: {str(e)[:80]}")
    for p, esperado in ((PASTA, 0o700), (SESSAO, 0o600)):
        if p.exists() and os.name != "nt":
            modo = p.stat().st_mode & 0o777
            if modo & 0o077:
                os.chmod(p, esperado)
                item(None, f"Permissão de {p.name}", f"estava {oct(modo)}; corrigi para {oct(esperado)} (outros usuários conseguiam ler)")
            else:
                item(True, f"Permissão de {p.name}", oct(modo))
    s = _ler_sessao()
    if s:
        falta = int(s.get("expira", 0) - time.time())
        item(True, "Sessão", f"entrou como {EST['usuario'].get('email', '-')}; token renova sozinho (vence em {max(0, falta) // 60} min)")
    else:
        item(False, "Sessão", "sem login: rode /login")
    try:
        remoto = httpx.get(f"{API}/clima-ia/clima_ia.py", timeout=15).content
        local = Path(__file__).read_bytes()
        igual = hashlib.sha256(remoto).hexdigest() == hashlib.sha256(local).hexdigest()
        item(igual or None, "Versão", f"{VERSAO}" + ("" if igual else " · há uma versão nova: /atualizar"))
    except (httpx.HTTPError, OSError):
        item(None, "Versão", "não conferi")


def atualizar():
    novo = httpx.get(f"{API}/clima-ia/clima_ia.py", timeout=30).content
    destino = Path(__file__)
    if hashlib.sha256(novo).hexdigest() == hashlib.sha256(destino.read_bytes()).hexdigest():
        con.print(f"[{OK}]  Você já está na versão mais nova ({VERSAO}).[/]")
        return
    try:
        compile(novo, "clima_ia.py", "exec")
    except SyntaxError as e:
        con.print(f"[{ERRO}]  O arquivo baixado está quebrado ({e}); nada foi trocado.[/]")
        return
    v = re.search(rb'VERSAO = "([^"]+)"', novo)
    if not permissao(f"Atualizar o clima-ia de {VERSAO} para {v.group(1).decode() if v else '?'}? (a versão atual fica em clima_ia.py.anterior)"):
        return
    destino.with_suffix(".py.anterior").write_bytes(destino.read_bytes())
    destino.write_bytes(novo)
    auditar("atualizar", v.group(1).decode() if v else "")
    con.print(f"[{OK}]  ✔ Atualizado. Feche e abra o clima-ia de novo.[/]")


def ver_auditoria():
    try:
        linhas = AUDITORIA.read_text().splitlines()[-25:]
    except OSError:
        linhas = []
    tabela("Registro local (~/.clima-ia/auditoria.log)", ["quando", "conta", "ação", "detalhe"], [l.split("\t") + [""] * (4 - len(l.split("\t"))) for l in linhas],
           "Nada registrado ainda.")


# ---------------- prompt ----------------
class Completa(Completer):
    def get_completions(self, doc, evento):
        t = doc.text_before_cursor
        if t.startswith("/") and " " not in t:
            for c, d in COMANDOS:
                if c.startswith(t.lower()):
                    yield Completion(c, start_position=-len(t), display=f"{c:<16}", display_meta=d)


def estilo_prompt() -> Style:
    """Lista de comandos do "/" sem o bloco cinza do prompt_toolkit: o item escolhido fica na cor de destaque."""
    cor = VERDE
    return Style.from_dict({
        "bottom-toolbar": "noreverse bg:default", "placeholder": f"fg:{CINZA}",
        "completion-menu": "bg:default", "completion-menu.completion": "bg:default fg:default", "completion-menu.completion.current": f"bg:default fg:{cor} bold",
        "completion-menu.meta.completion": "bg:default fg:#808080", "completion-menu.meta.completion.current": f"bg:default fg:{cor}",
        "completion-menu.multi-column-meta": "bg:default", "scrollbar.background": "bg:default", "scrollbar.button": "bg:default",
    })


ATALHOS = [("/", "comandos"), ("Tab", "completa o comando"), ("↑ / ↓", "pergunta anterior / seguinte"), ("Shift+Tab", "manual → aceitar ações → plano"),
           ("Ctrl+C", "interrompe a resposta"), ("Ctrl+D", "fecha o clima-ia"), ("Ctrl+L", "limpa a tela"), ("Esc Esc", "apaga o que você digitou"),
           ("Alt+Enter", "quebra linha na pergunta"), ("?", "esta lista")]


def mostrar_atalhos():
    for k, d in ATALHOS:
        con.print(Text.assemble((f"  {k:<12}", VERDE), (d, CINZA)))


def configurar(so: str | None = None) -> bool:
    """Configurações com setas (o /config do Claude Code). so = um item só (ex.: "tema"). Devolve True se mudou algo."""
    mudou = False
    itens_cfg = [("tema", "Tema", lambda: NOMES_TEMA.get(CFG["tema"])), ("cor", "Cor de destaque", lambda: CFG["cor"]),
                 ("codigo", "Tema do código", lambda: TEMAS_CODIGO.get(CFG["codigo"])), ("modo", "Modo padrão", lambda: MODOS[int(CFG.get("modo") or 0)][0]),
                 ("dicas", "Dicas ao abrir", lambda: "ligadas" if CFG["dicas"] else "desligadas"), ("som", "Som ao terminar a resposta", lambda: "ligado" if CFG["som"] else "desligado"),
                 ("tokens", "Mostrar tokens enquanto pensa", lambda: "sim" if CFG.get("tokens", True) else "não")]
    while True:
        k = so or escolher("Configurações do clima-ia", [(c, n, v()) for c, n, v in itens_cfg] + [("sair", "Pronto", "")], "")
        if not k or k == "sair":
            return mudou
        if k == "tema":
            v = escolher("Tema", [(t, n, "") for t, n in NOMES_TEMA.items()], CFG["tema"])
        elif k == "cor":
            v = escolher("Cor de destaque", [(c, c.capitalize(), h[0]) for c, h in CORES.items()], CFG["cor"])
        elif k == "codigo":
            v = escolher("Tema do código (blocos de código nas respostas)", [(c, n, "") for c, n in TEMAS_CODIGO.items()], CFG["codigo"])
            if v:
                from rich.syntax import Syntax
                con.print(Syntax('def ligar(ar: str, temperatura: int = 23) -> dict:\n    """Liga o ar no modo frio."""\n    return {"ar": ar, "modo": "frio", "temperatura": temperatura}',
                                 "python", theme=v, line_numbers=True, background_color="default" if v in ("vs", "friendly", "solarized-light") else None))
        elif k == "modo":
            v = escolher("Modo padrão ao abrir", [("0", "Manual", "pede o seu sim antes de agir"), ("1", "Aceitar ações", "faz sem perguntar (as de segurança sempre perguntam)"), ("2", "Plano", "só leitura")], str(CFG.get("modo") or 0))
            v = int(v) if v is not None else None
        else:
            v = escolher(dict((c, n) for c, n, _ in itens_cfg)[k], [("1", "Ligado", ""), ("0", "Desligado", "")], "1" if CFG.get(k, True) else "0")
            v = (v == "1") if v is not None else None
        if v is not None:
            CFG[k] = v
            gravar_config(CFG)
            aplicar_config()
            if k == "modo":
                EST["modo"] = int(v)
            mudou = True
            con.print(Text(f"  ⎿  {dict((c, n) for c, n, _ in itens_cfg)[k]}: ok", style=OK))
        if so:
            return mudou


def primeira_vez():
    """Primeira execução neste computador: escolhe o visual e o jeito de trabalhar antes de entrar (como o Claude Code)."""
    con.print(Panel(Text.assemble(("Bem-vindo ao clima-ia!\n\n", f"bold {VERDE}"), ("Vamos deixar o terminal do seu jeito. Dá para mudar tudo depois com /config.", LAVANDA)),
                    border_style=VERDE, padding=(1, 2)))
    if not sys.stdin.isatty():
        gravar_config(CFG)
        return
    for k in ("tema", "cor", "codigo", "modo"):
        configurar(k)
    v = escolher("Mostrar uma dica ao abrir?", [("1", "Sim", ""), ("0", "Não", "")], "1")
    CFG["dicas"] = v != "0"
    v = escolher("Tocar um som quando a resposta terminar?", [("1", "Sim", "útil quando você troca de janela"), ("0", "Não", "")], "0")
    CFG["som"] = v == "1"
    gravar_config(CFG)
    aplicar_config()
    con.print(Panel(Text.assemble(("Pronto. ", f"bold {OK}"), ("Seguro por padrão: ", LAVANDA), ("as ações nos ares pedem o seu sim no modo manual, ações de segurança sempre perguntam e "
                                   "segredos colados na pergunta são ocultados antes de ir para a IA.", CINZA)), border_style=VERDE_ESCURO, padding=(0, 2)))


def retomar():
    try:
        lista = chamar("GET", "/api/ia/conversas", timeout=20)[:20]
    except RuntimeError as e:
        con.print(f"[{ERRO}]  {e}[/]")
        return
    if not lista:
        con.print(f"[{CINZA}]  Nenhuma conversa salva ainda.[/]")
        return
    cid = escolher("Retomar uma conversa", [(str(c["id"]), (c.get("titulo") or "Conversa")[:60], f"há {_ha(c.get('atualizado_em'))}") for c in lista], "")
    if not cid:
        return
    c = chamar("GET", f"/api/ia/conversas/{cid}", timeout=20)
    EST["conversa"] = int(cid)
    EST["hist"] = [{"role": m["role"], "content": str(m.get("content", ""))[:4000]} for m in (c.get("mensagens") or []) if m.get("role") in ("user", "assistant")]
    for m in EST["hist"][-4:]:
        if m["role"] == "user":
            eco(m["content"][:200])
        else:
            con.print(Text("● ", style=LAVANDA), end="")
            con.print(Markdown(m["content"], code_theme=CFG.get("codigo") or "monokai"))
    con.print(Text(f"  ⎿  Conversa retomada ({len(EST['hist'])} mensagens). Continue de onde parou.", style=OK))


def chip() -> Text:
    return Text(f"◉ {_nome_modelo()} · /modelo", style=CINZA, justify="right")


def rodape():
    """Abaixo do campo: a régua de baixo e a linha do modo (como no Claude Code), e o aviso de limite perto do fim."""
    _, g, rot, cor, dica = MODOS[EST["modo"]]
    w = max(20, con.width)
    av = aviso_uso()
    extra = f' · <style fg="{AMARELO}">⚠ {av}</style>' if av else ""
    return HTML(f'<style fg="{REGUA}">{"─" * w}</style>\n<style fg="{cor}">{g} {rot}</style> <style fg="{CINZA}">{dica}</style>{extra}')


# ---------------- ferramentas neste computador (pedidas pela IA, executadas aqui) ----------------
LOCAIS = ["ler_arquivo", "listar_pasta", "buscar_texto", "escrever_arquivo", "editar_arquivo", "executar_comando", "baixar_relatorio"]
IGNORAR = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build", ".cache", ".DS_Store"}
# comandos que nunca rodam, nem com o sim (apagar o disco, formatar, desligar a máquina, bomba de processos)
PROIBIDOS = re.compile(r"(rm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME)(\s|$)|mkfs|dd\s+if=.*of=/dev/|:\(\)\s*\{|shutdown|reboot|halt\b|format\s+[a-z]:|"
                       r"Remove-Item\s+.*-Recurse.*\s+[A-Z]:\\\s*$|chmod\s+-R\s+777\s+/)", re.I)


def ferramentas_ligadas() -> list[str]:
    if not CFG.get("locais", True):
        return []
    return [f for f in LOCAIS if f != "executar_comando" or CFG.get("comandos", True)]


def _caminho(c: str) -> Path:
    base = Path.cwd().resolve()
    p = (base / os.path.expanduser(c or ".")).resolve()
    if CFG.get("liberdade", "pasta") != "total" and base != p and base not in p.parents:
        raise PermissionError(f"Fora da pasta atual ({base}). Use /liberdade total para permitir.")
    return p


def _rel(p: Path) -> str:
    try:
        return str(p.relative_to(Path.cwd().resolve())) or "."
    except ValueError:
        return str(p)


def _diff(antes: str, depois: str, nome: str) -> Text:
    t = Text()
    linhas = list(difflib.unified_diff(antes.splitlines(), depois.splitlines(), f"a/{nome}", f"b/{nome}", lineterm="", n=2))
    for l in linhas[:80]:
        t.append(l + "\n", style=OK if l.startswith("+") and not l.startswith("+++") else ERRO if l.startswith("-") and not l.startswith("---") else CINZA)
    if len(linhas) > 80:
        t.append(f"… mais {len(linhas) - 80} linha(s)\n", style=CINZA)
    return t


def executar_local(nome: str, a: dict) -> str:
    """Roda uma ferramenta local e devolve o texto que volta para a IA (erros também voltam, para ela corrigir)."""
    try:
        if nome == "ler_arquivo":
            p = _caminho(a.get("caminho"))
            txt = p.read_text(encoding="utf-8", errors="replace")
            linhas = txt.splitlines()
            ini, fim = max(1, int(a.get("inicio") or 1)), int(a.get("fim") or min(len(linhas), 2000))
            ferramenta("Ler", _rel(p), f"{len(linhas)} linha(s)" + (f", trecho {ini}-{fim}" if a.get("inicio") or a.get("fim") else ""))
            return "\n".join(f"{i}\t{l}" for i, l in enumerate(linhas[ini - 1:fim], start=ini))[:60000]
        if nome == "listar_pasta":
            p = _caminho(a.get("caminho") or ".")
            itens = sorted(p.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
            saida = [f"{'📁 ' if x.is_dir() else ''}{x.name}{'/' if x.is_dir() else f'  ({x.stat().st_size} B)'}" for x in itens if x.name not in IGNORAR][:400]
            ferramenta("Listar", _rel(p), f"{len(saida)} item(ns)")
            return "\n".join(saida) or "(vazia)"
        if nome == "buscar_texto":
            p = _caminho(a.get("pasta") or ".")
            try:
                rx = re.compile(a.get("padrao") or "", re.I)
            except re.error:
                rx = re.compile(re.escape(a.get("padrao") or ""), re.I)
            achados = []
            for raiz, pastas, arqs in os.walk(p):
                pastas[:] = [d for d in pastas if d not in IGNORAR]
                for f in arqs:
                    fp = Path(raiz) / f
                    if fp.stat().st_size > 2_000_000 or fnmatch.fnmatch(f, "*.min.*"):
                        continue
                    try:
                        for i, l in enumerate(fp.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                            if rx.search(l):
                                achados.append(f"{_rel(fp)}:{i}: {l.strip()[:200]}")
                    except OSError:
                        continue
                    if len(achados) >= 300:
                        break
            ferramenta("Buscar", a.get("padrao", "")[:40], f"{len(achados)} resultado(s)")
            return "\n".join(achados[:300]) or "Nada encontrado."
        if nome == "escrever_arquivo":
            p = _caminho(a.get("caminho"))
            novo = str(a.get("conteudo") or "")
            antes = p.read_text(encoding="utf-8", errors="replace") if p.exists() else ""
            con.print(Panel(_diff(antes, novo, _rel(p)) if antes else Text("\n".join(novo.splitlines()[:40]) + ("\n…" if novo.count("\n") > 40 else ""), style=LAVANDA),
                            title=Text(f"{'Substituir' if p.exists() else 'Criar'} {_rel(p)}", style=AZUL), title_align="left", border_style=REGUA))
            if not permissao(f"{'Substituir' if p.exists() else 'Criar'} {_rel(p)} ({len(novo.splitlines())} linha(s))?"):
                return "A pessoa recusou. Pergunte o que fazer diferente."
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(novo, encoding="utf-8")
            auditar("arquivo_escrito", _rel(p))
            ferramenta("Escrever", _rel(p), f"{len(novo.splitlines())} linha(s) gravadas")
            return f"Arquivo gravado: {_rel(p)}"
        if nome == "editar_arquivo":
            p = _caminho(a.get("caminho"))
            antes = p.read_text(encoding="utf-8")
            alvo, troca = str(a.get("procurar") or ""), str(a.get("trocar") or "")
            n = antes.count(alvo) if alvo else 0
            if n != 1:
                ferramenta("Editar", _rel(p), "trecho não encontrado" if not n else f"trecho aparece {n} vezes", False)
                return f"Não editei: o trecho aparece {n} vez(es) em {_rel(p)}. Mande um trecho único (com mais contexto)."
            depois = antes.replace(alvo, troca, 1)
            con.print(Panel(_diff(antes, depois, _rel(p)), title=Text(f"Editar {_rel(p)}", style=AZUL), title_align="left", border_style=REGUA))
            if not permissao(f"Aplicar esta mudança em {_rel(p)}?"):
                return "A pessoa recusou a edição."
            p.write_text(depois, encoding="utf-8")
            auditar("arquivo_editado", _rel(p))
            ferramenta("Editar", _rel(p), "mudança aplicada")
            return f"Editado: {_rel(p)}"
        if nome == "executar_comando":
            cmd = str(a.get("comando") or "").strip()
            pasta = _caminho(a.get("pasta") or ".")
            if not cmd:
                return "Comando vazio."
            if PROIBIDOS.search(cmd):
                ferramenta("Comando", cmd[:60], "recusado: comando destrutivo", False)
                auditar("comando_recusado", cmd[:200])
                return "Recusado: esse comando pode destruir dados ou desligar a máquina. Não rodo, nem com permissão."
            con.print(Panel(Text(f"$ {cmd}", style=LAVANDA), title=Text(f"Rodar em {_rel(pasta)}", style=AZUL), title_align="left", border_style=REGUA))
            if not permissao("Rodar este comando neste computador?", sempre_perguntar=True):
                return "A pessoa recusou o comando."
            auditar("comando", cmd[:200])
            t0 = time.time()
            r = subprocess.run(cmd, shell=True, cwd=str(pasta), capture_output=True, text=True, timeout=180, errors="replace")
            saida = ((r.stdout or "") + (("\n[stderr]\n" + r.stderr) if r.stderr else "")).strip()
            ferramenta("Comando", cmd[:60], f"saiu com {r.returncode} em {time.time() - t0:.1f} s", r.returncode == 0)
            for l in saida.splitlines()[:12]:
                con.print(Text(f"     {l[:200]}", style=CINZA))
            return f"código de saída {r.returncode}\n{saida[-12000:]}"
        if nome == "baixar_relatorio":
            fmt = a.get("formato") or "pdf"
            dias = max(1, min(int(a.get("dias") or 30), 365))
            p = _caminho(a.get("caminho") or f"relatorio-clima-{time.strftime('%Y%m%d')}.{'zip' if fmt == 'csv' else fmt}")
            if not permissao(f"Salvar o relatório ({fmt.upper()}, {dias} dias) em {_rel(p)}?"):
                return "A pessoa recusou."
            s_ = _ler_sessao()
            r = httpx.get(f"{API}/api/relatorios/exportar", params={"formato": fmt, "dias": dias}, timeout=180,
                          headers={"Authorization": f"Bearer {s_['access']}", "User-Agent": f"clima-ia/{VERSAO}"})
            if r.status_code >= 400:
                raise RuntimeError(_detalhe(r))
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(r.content)
            auditar("relatorio_salvo", _rel(p))
            ferramenta("Relatório", _rel(p), f"{len(r.content) // 1024} KB salvos")
            return f"Relatório salvo em {_rel(p)} ({len(r.content)} bytes)."
        return f"Ferramenta desconhecida: {nome}"
    except subprocess.TimeoutExpired:
        ferramenta("Comando", str(a.get("comando"))[:60], "passou de 3 min: parei", False)
        return "O comando passou de 3 minutos e foi parado."
    except (OSError, PermissionError, ValueError, RuntimeError, UnicodeDecodeError) as e:
        ferramenta(nome.replace("_", " ").capitalize(), str(a.get("caminho") or a.get("pasta") or "")[:50], str(e)[:160], False)
        return f"Erro: {e}"


def comando_local(q: str) -> bool:
    partes = q.split()
    c, args = partes[0].lower(), partes[1:]
    try:
        if c in ("/sair", "/exit", "/quit"):
            raise EOFError
        if c == "/ajuda":
            for cm, d in COMANDOS:
                con.print(Text.assemble((f"  {cm:<14}", VERDE), (d, CINZA)))
            con.print(f"[{CINZA}]  Shift+Tab: manual → aceitar ações → plano. Ctrl+C interrompe. Ações de segurança sempre pedem o seu sim.[/]")
        elif c == "/modelo":
            escolher_modelo()
        elif c == "/config":
            configurar()
        elif c == "/tema":
            configurar("tema") | configurar("cor")
        elif c == "/retomar":
            retomar()
        elif c in ("/atalhos", "?"):
            mostrar_atalhos()
        elif c == "/uso":
            mostrar_uso()
        elif c == "/plano":
            EST["modo"] = 0 if MODOS[EST["modo"]][0] == "plano" else 2
            _gravar_pref()
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
            auditar("logout")
            con.print(f"[{CINZA}]  Saiu deste computador.[/]")
        elif c == "/novidades":
            v = chamar("GET", "/api/novidades")["versoes"][0]
            con.print(Markdown(f"**{v['versao']}** · {v['titulo']}\n\n" + "\n".join(f"- {x}" for x in (v.get("novo") or []) + (v.get("melhorias") or []))))
        elif c == "/seguranca":
            seg_postura()
        elif c == "/ataques":
            seg_ataques(int(args[0]) if args and args[0].isdigit() else 24)
        elif c == "/ips":
            seg_ips()
        elif c == "/ip":
            seg_ip(args[0] if args else "")
        elif c == "/bloquear":
            seg_bloquear(args)
        elif c == "/desbloquear":
            seg_desbloquear(args)
        elif c == "/escudo":
            seg_escudo(args)
        elif c == "/sessoes":
            seg_sessoes(args)
        elif c == "/telegram":
            seg_telegram(int(args[0]) * 24 if args and args[0].isdigit() else 168)
        elif c == "/integridade":
            seg_integridade()
        elif c == "/analisar":
            seg_analisar()
        elif c in ("/diagnostico", "/doctor"):
            diagnostico()
        elif c == "/atualizar":
            atualizar()
        elif c == "/auditoria":
            ver_auditoria()
        elif c == "/usuarios":
            r = chamar("GET", "/api/usuarios")
            tabela("Contas", ["Nome", "E-mail", "Papel", "Ativo", "Último login"],
                   [[u.get("nome") or "-", u.get("email"), u.get("papel_rotulo") or u.get("papel"), "sim" if u.get("ativo") else "não", (u.get("ultimo_login") or "")[:16].replace("T", " ")] for u in r.get("itens", [])])
        elif c == "/fluxos":
            r = chamar("GET", "/api/fluxos")
            tabela("Fluxos", ["Id", "Nome", "Ligado", "Gatilhos", "Última"], [[f["id"], f["nome"], "sim" if f["ativo"] else "não", ", ".join(f["gatilhos"]) or "-",
                                                                             (f.get("ultimo_estado") or "-") + (f" · {_quando(f['ultima_exec'])}" if f.get("ultima_exec") else "")] for f in r])
        elif c == "/liberdade":
            if args and args[0] in ("pasta", "total"):
                CFG["liberdade"] = args[0]; gravar_config(CFG)
            con.print(f"[{CINZA}]  Arquivos: {'só dentro de ' + str(Path.cwd()) if CFG.get('liberdade', 'pasta') == 'pasta' else 'qualquer pasta deste computador'} "
                      f"(/liberdade pasta | total). Criar, editar e rodar comando sempre mostram o que vai acontecer.[/]")
        elif c == "/ferramentas":
            if args and args[0] in ("ligar", "desligar"):
                CFG["locais"] = args[0] == "ligar"; gravar_config(CFG)
            if len(args) > 1 and args[0] == "comandos" and args[1] in ("ligar", "desligar"):
                CFG["comandos"] = args[1] == "ligar"; gravar_config(CFG)
            con.print(f"[{CINZA}]  Ferramentas neste computador: {', '.join(ferramentas_ligadas()) or 'desligadas'}. "
                      f"(/ferramentas ligar|desligar · /ferramentas comandos ligar|desligar)[/]")
        elif c in PERGUNTAS:
            perguntar(PERGUNTAS[c])
        else:
            return False
    except RuntimeError as e:
        con.print(f"[{ERRO}]  {e}[/]")
    return True


def iniciar():
    EST["usuario"] = chamar("GET", "/api/sessao", timeout=30)
    e = chamar("GET", "/api/ia/estado", timeout=30)
    EST["modelos"] = e.get("modelos") or []
    _ler_pref()
    if EST["modelo"] not in {m["id"] for m in EST["modelos"]}:
        EST["modelo"] = e.get("modelo") or ""
    atualizar_uso(True)


def _sessao_viva() -> bool:
    """Parado há mais de 10 min: confere se a sessão não foi encerrada no painel (senha trocada, sessão revogada)."""
    if time.time() - EST["ativo_em"] < 600:
        return True
    try:
        chamar("GET", "/api/sessao", timeout=15)
        return True
    except RuntimeError:
        con.print(f"[{AMARELO}]  Sua sessão foi encerrada (no painel ou por segurança). Entre de novo com /login.[/]")
        SESSAO.unlink(missing_ok=True)
        return False


def main():
    args = sys.argv[1:]
    if args[:1] == ["login"]:
        login()
        return
    if args[:1] in (["--versao"], ["--version"], ["-v"]):
        print(f"clima-ia {VERSAO}")
        return
    if args[:1] in (["diagnostico"], ["doctor"]):
        if _ler_sessao():
            try:
                iniciar()
            except RuntimeError:
                pass
        diagnostico()
        return
    if "--modelo" in args:
        i = args.index("--modelo")
        EST["modelo"] = args[i + 1] if i + 1 < len(args) else ""
        args = args[:i] + args[i + 2:]
    if args[:1] == ["config"]:
        aplicar_config()
        configurar()
        return
    aplicar_config()
    if not CONFIG.exists():
        primeira_vez()
    if not _ler_sessao() and not login():
        return
    try:
        iniciar()
    except RuntimeError as e:
        con.print(f"[{ERRO}]{e}[/] Rode: clima-ia login")
        return
    if args and not args[0].startswith("-"):   # uma pergunta só: clima-ia "quais ares estão ligados?"
        perguntar(" ".join(args))
        return
    cabecalho()
    kb = KeyBindings()

    @kb.add("s-tab")
    def _(ev):
        EST["modo"] = (EST["modo"] + 1) % len(MODOS)
        _gravar_pref()
        ev.app.invalidate()

    PASTA.mkdir(mode=0o700, exist_ok=True)
    @kb.add("c-l")
    def _(ev):
        ev.app.renderer.clear()

    @kb.add("escape", "escape")
    def _(ev):
        ev.app.current_buffer.reset()

    exemplos = ["liga o ar do diretor em 23", "quais ares estão ligados?", "por que os comandos não chegam?", "resumo do uso desta semana", "/seguranca"]
    sess = PromptSession(history=FileHistory(str(PASTA / "historico")), completer=Completa(), complete_while_typing=True, key_bindings=kb,
                         bottom_toolbar=rodape, style=estilo_prompt(), complete_style=CompleteStyle.COLUMN, reserve_space_for_menu=10,
                         erase_when_done=True)   # apaga a linha digitada ao enviar: só fica o eco com a faixa (antes a pergunta aparecia duas vezes)
    while True:
        try:
            con.print()
            con.print(chip(), justify="right")
            con.rule(style=REGUA)
            q = sess.prompt(HTML(f'<style fg="{LAVANDA}">❯ </style>'), placeholder=HTML(f'<style fg="#6c6c6c">Tente "{random.choice(exemplos)}"</style>'), style=estilo_prompt()).strip()
        except KeyboardInterrupt:
            continue
        except EOFError:
            con.print(f"[{CINZA}]Até mais.[/]")
            return
        if not q:
            continue
        if not _sessao_viva():
            return
        EST["ativo_em"] = time.time()
        eco(q)
        try:
            if q == "?":
                mostrar_atalhos()
                continue
            if q.startswith("/") and comando_local(q):
                continue
        except EOFError:
            con.print(f"[{CINZA}]Até mais.[/]")
            return
        perguntar(q)


if __name__ == "__main__":
    main()
