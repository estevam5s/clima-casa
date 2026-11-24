"""Atualização do agente sozinho (qualquer sistema: Mac, Windows, Linux, Raspberry Pi).

Antes, cada computador só mudava de versão quando alguém rodava o instalador de novo nele; um PC esquecido ficava com o
código antigo e, ao assumir o comando, recusava operações novas ("Operação desconhecida"). Agora cada agente anuncia a
versão que roda e, quando a nuvem publica uma mais nova (config.versoes_no_ar), baixa o pacote do código do Storage
privado (bucket codigo-fonte, o mesmo que a instalação por código usa), confere que compila, copia por cima da pasta
dele (sem tocar em .env, .venv e data) e reinicia pelo serviço. Nunca volta para uma versão mais velha.
"""
import hashlib
import io
import json
import logging
import os
import py_compile
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

from . import db

log = logging.getLogger("clima.atualizar")
RAIZ = Path(__file__).resolve().parents[2]          # pasta com backend/ (cópia do serviço no Mac, /opt/... no Linux)
PRESERVAR = {".env", ".venv", "data", ".git", "node_modules"}
CHAVE_AUTO = "agente_auto_atualizar"                # {"ativo": bool}; padrão ligado
INTERVALO = 600                                     # confere a cada 10 min (uma leitura de config)
_ultimo = {"em": 0.0}


def _v(t: str) -> tuple:
    try:
        return tuple(int(x) for x in str(t).split("."))
    except ValueError:
        return (0,)


def versao_local() -> str:
    try:
        d = json.loads((Path(__file__).resolve().parent / "novidades.json").read_text(encoding="utf-8"))
        return d["versoes"][0]["versao"]
    except Exception:  # noqa: BLE001
        return ""


def versao_publicada() -> str:
    reg = db.cfg("versoes_no_ar") or {}
    return max(reg.keys(), key=_v) if reg else ""


def auto_ligado() -> bool:
    return bool((db.cfg(CHAVE_AUTO) or {"ativo": True}).get("ativo", True))


def em_docker() -> bool:
    return os.path.exists("/.dockerenv")


def _pacote_mais_novo() -> tuple[str, str]:
    import httpx
    env = db.carregar_env()
    h = {"apikey": env["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}"}
    r = httpx.post(f"{env['SUPABASE_URL']}/storage/v1/object/list/codigo-fonte", headers=h, timeout=20,
                   json={"prefix": "", "limit": 50, "sortBy": {"column": "created_at", "order": "desc"}})
    r.raise_for_status()
    zips = [x["name"] for x in r.json() if x["name"].endswith(".zip")]
    if not zips:
        raise RuntimeError("nenhum pacote do código no Storage")
    return zips[0], f"{env['SUPABASE_URL']}/storage/v1/object/codigo-fonte/{zips[0]}"


def _baixar(url: str) -> bytes:
    import httpx
    env = db.carregar_env()
    r = httpx.get(url, headers={"apikey": env["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {env['SUPABASE_SECRET_KEY']}"},
                  timeout=120, follow_redirects=True)
    r.raise_for_status()
    return r.content


def _hash_req(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else ""


def _instalar_deps(req: Path):
    """Instala as dependências novas no Python do próprio agente (venv criada pelo uv não tem pip)."""
    uv = shutil.which("uv") or next((c for c in (os.path.expanduser("~/.local/bin/uv"), "/opt/clima-escritorio/uv",
                                                  "/usr/local/bin/uv", "/opt/homebrew/bin/uv") if os.path.exists(c)), None)
    cmd = [uv, "pip", "install", "--python", sys.executable, "-q", "-r", str(req)] if uv else [sys.executable, "-m", "pip", "install", "-q", "-r", str(req)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode != 0:
        raise RuntimeError("dependências não instalaram: " + (r.stderr or r.stdout)[-300:])


def aplicar(motivo: str = "automático") -> dict:
    """Baixa, confere e aplica o pacote mais novo. Reinicia o processo no fim (o serviço o liga de novo)."""
    if em_docker():
        raise RuntimeError("no Docker, atualize recriando o contêiner (rode o instalador de novo com --docker)")
    nome, url = _pacote_mais_novo()
    dados = _baixar(url)
    with tempfile.TemporaryDirectory(prefix="clima-atualizar-") as tmp:
        with zipfile.ZipFile(io.BytesIO(dados)) as z:
            for n in z.namelist():   # nada fora da pasta (zip com "../")
                if n.startswith("/") or ".." in Path(n).parts:
                    raise RuntimeError("pacote com caminho inválido")
            z.extractall(tmp)
        topo = [p for p in Path(tmp).iterdir() if p.is_dir()]
        origem = topo[0] if len(topo) == 1 and not (Path(tmp) / "backend").exists() else Path(tmp)
        app_novo = origem / "backend" / "app"
        if not (app_novo / "main.py").exists():
            raise RuntimeError("pacote sem backend/app/main.py")
        nova = json.loads((app_novo / "novidades.json").read_text(encoding="utf-8"))["versoes"][0]["versao"]
        atual = versao_local()
        if _v(nova) <= _v(atual):
            return {"ok": True, "mudou": False, "versao": atual, "pacote": nome}
        for f in app_novo.rglob("*.py"):   # só copia se tudo compila neste Python
            py_compile.compile(str(f), doraise=True, cfile=os.path.join(tmp, "c.pyc"))
        req_antes = _hash_req(RAIZ / "backend" / "requirements.txt")
        for item in origem.iterdir():
            if item.name in PRESERVAR:
                continue
            destino = RAIZ / item.name
            if item.is_dir():
                shutil.copytree(item, destino, dirs_exist_ok=True)
            else:
                shutil.copy2(item, destino)
        if _hash_req(RAIZ / "backend" / "requirements.txt") != req_antes:
            _instalar_deps(RAIZ / "backend" / "requirements.txt")
    import socket
    db.registrar("agente", f"{socket.gethostname().split('.')[0]} atualizado de {atual or '?'} para {nova}", detalhe=f"{motivo} · {nome}")
    log.info("atualizado de %s para %s (%s); reiniciando", atual, nova, nome)
    return {"ok": True, "mudou": True, "de": atual, "para": nova, "pacote": nome}


def conferir(papel: str):
    """Chamado no anúncio do agente. A cada 10 min, se a nuvem já tem versão mais nova e a atualização automática está
    ligada, atualiza e reinicia. Falhou: registra uma vez e tenta de novo só na próxima versão."""
    if time.time() - _ultimo["em"] < INTERVALO:
        return
    _ultimo["em"] = time.time()
    try:
        pub, loc = versao_publicada(), versao_local()
        if not pub or not loc or _v(pub) <= _v(loc) or not auto_ligado() or em_docker():
            return
        falhou = db.cfg("agente_atualizar_falhou:" + _eu()) or {}
        if falhou.get("versao") == pub:
            return
        r = aplicar("automático")
        if r.get("mudou"):
            _reiniciar(papel)
    except Exception as e:  # noqa: BLE001
        log.warning("atualização automática falhou: %s", e)
        db.set_cfg("agente_atualizar_falhou:" + _eu(), {"versao": versao_publicada(), "erro": str(e)[:300], "em": int(time.time())})
        db.registrar("agente", "Atualização automática do agente falhou", ok=False, detalhe=str(e)[:300])


def _eu() -> str:
    from .coordenador import _eu as eu
    return eu()


def _reiniciar(papel: str):
    if papel == "principal":   # libera o posto para um reserva assumir enquanto este volta
        db.executar("UPDATE config SET valor = ? WHERE chave = 'agente_lider'", (json.dumps({"id": "", "visto": 0}),))
    os._exit(3)
