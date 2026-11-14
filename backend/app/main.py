"""Clima Casa: servidor da API + interface web."""
import asyncio
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import agenda, cripto, db, firewall, sinric, transmissor
from .rotas import alexa as rotas_alexa
from .rotas import api as rotas_api

ESTATICO = Path(__file__).resolve().parents[1] / "static"


def _migrar_env():
    """Traz o transmissor configurado na primeira versão (arquivo .env) para o banco."""
    arq = db.RAIZ / ".env"
    if not arq.exists() or db.um("SELECT 1 FROM hubs"):
        return
    env = {}
    for linha in arq.read_text().splitlines():
        if "=" in linha and not linha.lstrip().startswith("#"):
            k, v = linha.split("=", 1)
            env[k.strip()] = v.strip()
    if env.get("TUYA_DEVICE_ID"):
        db.executar("INSERT INTO hubs (id, nome, ip, local_key, versao, criado_em) VALUES (?,?,?,?,?,?)",
                    (env["TUYA_DEVICE_ID"], "Smart IR", env.get("TUYA_IP", ""), cripto.cifrar(env.get("TUYA_LOCAL_KEY", ""), "hub:local_key"),
                     env.get("TUYA_VERSION", "3.5"), db.agora()))
        db.registrar("sistema", "Transmissor importado do .env", detalhe=env["TUYA_DEVICE_ID"])


@asynccontextmanager
async def ciclo_de_vida(app):
    db.iniciar()
    try:
        cripto.migrar()
    except Exception:  # noqa: BLE001
        pass
    tarefa = None
    if transmissor.PAPEL == "agente":  # no Mac: fila de comandos, agenda e status dos transmissores
        _migrar_env()
        threading.Thread(target=transmissor.laco_agente, daemon=True, name="agente").start()
        sinric.iniciar_no_agente()
        tarefa = asyncio.create_task(agenda.laco())
    yield
    if tarefa:
        tarefa.cancel()


app = FastAPI(title="Clima Casa", lifespan=ciclo_de_vida, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware("http")
async def cabecalhos(request: Request, chamar):
    # Firewall: listas de IP, país, assinaturas de ataque e limite de taxa (só nas rotas dinâmicas)
    dinamica = request.url.path.startswith(("/api/", "/oauth/", "/alexa/"))
    if dinamica:
        firewall.definir_contexto(request)
        barrado = await asyncio.to_thread(firewall.verificar, request)
        if barrado:
            return JSONResponse({"detail": barrado[1]}, status_code=barrado[0], headers={"Retry-After": "60"} if barrado[0] == 429 else None)
    # Bloqueia POST/PUT/DELETE vindos de outros sites (CSRF) nas rotas de sessão
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/"):
        origem = request.headers.get("origin")
        if origem and origem.split("://", 1)[-1] != request.headers.get("host"):
            return JSONResponse({"detail": "Origem não permitida."}, status_code=403)
    resp = await chamar(request)
    if dinamica and resp.status_code in (401, 403):
        await asyncio.to_thread(firewall.depois, request, resp.status_code)
    elif dinamica and resp.status_code < 400 and firewall.config().get("ativo"):
        await asyncio.to_thread(firewall.registrar_acesso, request, resp.status_code)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    if dinamica and "cache-control" not in resp.headers:
        resp.headers["Cache-Control"] = "no-store"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'")
    if request.url.scheme == "https":
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return resp


NOMES_CAMPOS = {"hora": "horário", "nome": "nome", "dias": "dias", "temp_min": "temperatura mínima",
                "temp_max": "temperatura máxima", "user_code": "código do usuário", "id": "ID", "senha": "senha"}


@app.exception_handler(RequestValidationError)
async def validacao(request: Request, exc: RequestValidationError):
    campos = sorted({NOMES_CAMPOS.get(str(e["loc"][-1]), str(e["loc"][-1])) for e in exc.errors()})
    return JSONResponse({"detail": f"Confira o(s) campo(s): {', '.join(campos)}."}, status_code=422)


app.include_router(rotas_api.publico)
app.include_router(rotas_api.api)
app.include_router(rotas_alexa.roteador)


@app.get("/saude")
def saude():
    return {"ok": True}


if (ESTATICO / "assets").exists():
    app.mount("/assets", StaticFiles(directory=ESTATICO / "assets"), name="assets")


@app.get("/{caminho:path}")
def spa(caminho: str):
    if caminho.startswith(("api/", "alexa/", "oauth/token")):
        return JSONResponse({"detail": "Não encontrado."}, status_code=404)
    arquivo = ESTATICO / caminho
    if caminho and arquivo.is_file() and ESTATICO in arquivo.resolve().parents:
        return FileResponse(arquivo)
    indice = ESTATICO / "index.html"
    if not indice.exists():
        return JSONResponse({"detail": "Interface não compilada. Rode: cd frontend && npm run build"}, status_code=503)
    return FileResponse(indice, headers={"Cache-Control": "no-cache"})


def rodar():
    import uvicorn
    host = os.environ.get("CLIMA_HOST", "127.0.0.1")
    porta = int(os.environ.get("CLIMA_PORTA", "8090"))
    uvicorn.run("app.main:app", host=host, port=porta, proxy_headers=True, forwarded_allow_ips="127.0.0.1")


if __name__ == "__main__":
    rodar()
