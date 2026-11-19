"""Clima Casa: servidor da API + interface web."""
import asyncio
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import agenda, coordenador, cripto, db, firewall, sinric, transmissor
from .rotas import alexa as rotas_alexa
from .rotas import api as rotas_api
from .rotas import contas as rotas_contas
from .rotas import musica as rotas_musica
from .rotas import infra as rotas_infra
from .rotas import correio as rotas_correio
from .rotas import dispositivos as rotas_dispositivos
from .rotas import telegram as rotas_telegram
from .rotas import bugs as rotas_bugs
from .rotas import ia as rotas_ia

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
    if transmissor.PAPEL == "agente":  # no computador do escritório: fila de comandos, Alexa, agenda e transmissores
        async def virar_agente():
            # vários computadores podem ter o agente; só o principal executa (os outros ficam de reserva)
            await asyncio.to_thread(coordenador.esperar_posto)
            coordenador.vigiar()
            _migrar_env()
            threading.Thread(target=transmissor.laco_agente, daemon=True, name="agente").start()
            sinric.iniciar_no_agente()
            await agenda.laco()
        tarefa = asyncio.create_task(virar_agente())
    yield
    if tarefa:
        tarefa.cancel()


app = FastAPI(title="Clima Casa", lifespan=ciclo_de_vida, docs_url=None, redoc_url=None, openapi_url=None)


# Origens do site institucional que podem enviar o formulário de contato (CORS só nesta rota)
SITE_ORIGENS = {o.strip() for o in os.environ.get("CLIMA_SITE_ORIGENS", "https://zynio.com.br,https://www.zynio.com.br,https://clima-escritorio-site.vercel.app,http://localhost:3100").split(",") if o.strip()}


@app.middleware("http")
async def cabecalhos(request: Request, chamar):
    origem_site = request.headers.get("origin", "")
    if request.url.path in ("/api/site/contato", "/api/site/cookies", "/api/site/cookies/consentimento", "/api/site/status", "/api/apps/versao") and origem_site in SITE_ORIGENS:
        cors = {"Access-Control-Allow-Origin": origem_site, "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", "Vary": "Origin"}
        if request.method == "OPTIONS":
            return Response(status_code=204, headers=cors)
        firewall.definir_contexto(request)
        barrado = await asyncio.to_thread(firewall.verificar, request)
        if barrado:
            return JSONResponse({"detail": barrado[1]}, status_code=barrado[0], headers=cors)
        resp = await chamar(request)
        resp.headers.update(cors)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["Cache-Control"] = "no-store"
        return resp
    # Firewall: listas de IP, país, assinaturas de ataque e limite de taxa (só nas rotas dinâmicas)
    dinamica = request.url.path.startswith(("/api/", "/oauth/", "/alexa/"))
    de_teste = dinamica and request.headers.get("x-clima-teste") and firewall.pedido_de_teste(request)   # testes ao vivo do próprio sistema
    if dinamica and not de_teste:
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
    if dinamica and resp.status_code in (401, 403) and not de_teste:
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
        "default-src 'self'; img-src 'self' data: blob: https://challenges.cloudflare.com https://*.scdn.co https://*.spotifycdn.com; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' https://challenges.cloudflare.com https://sdk.scdn.co; frame-src https://challenges.cloudflare.com https://sdk.scdn.co; "
        "font-src 'self'; connect-src 'self' blob: data: https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://api.pwnedpasswords.com https://speed.cloudflare.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests")
    if request.url.scheme == "https":
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return resp


NOMES_CAMPOS = {"hora": "horário", "nome": "nome", "dias": "dias", "temp_min": "temperatura mínima",
                "temp_max": "temperatura máxima", "user_code": "código do usuário", "id": "ID", "senha": "senha"}


@app.exception_handler(Exception)
async def erro_interno(request: Request, exc: Exception):
    """Erro 500 inesperado: vira bug automático (área de Bugs) e a pessoa recebe uma mensagem em português."""
    import asyncio
    from . import bugs
    await asyncio.to_thread(bugs.registrar_excecao, request.url.path, request.method, exc)
    import logging
    logging.getLogger("clima").exception("erro interno em %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Erro interno. Ele foi registrado na área de Bugs para correção."}, status_code=500)


@app.exception_handler(RequestValidationError)
async def validacao(request: Request, exc: RequestValidationError):
    campos = sorted({NOMES_CAMPOS.get(str(e["loc"][-1]), str(e["loc"][-1])) for e in exc.errors()})
    return JSONResponse({"detail": f"Confira o(s) campo(s): {', '.join(campos)}."}, status_code=422)


app.include_router(rotas_api.publico)
app.include_router(rotas_contas.publico_contas)
app.include_router(rotas_contas.contas)
app.include_router(rotas_api.api)
app.include_router(rotas_musica.publico_musica)
app.include_router(rotas_musica.rotas_musica)
app.include_router(rotas_infra.rotas_infra)
app.include_router(rotas_correio.publico_email)
app.include_router(rotas_correio.rotas_email)
app.include_router(rotas_alexa.roteador)
app.include_router(rotas_dispositivos.publico_iot)
app.include_router(rotas_dispositivos.rotas_disp)
app.include_router(rotas_telegram.publico_telegram)
app.include_router(rotas_telegram.rotas_telegram)
app.include_router(rotas_bugs.rotas_bugs)
app.include_router(rotas_ia.rotas_ia)


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
    # Sem proxy na frente do agente: X-Forwarded-For de quem fala pelo 127.0.0.1 NÃO vale (senão um programa local
    # forjaria o IP e bloquearia IPs reais no firewall que a produção também usa). Atrás de um proxy de verdade,
    # use CLIMA_CONFIAR_PROXY=1 (o firewall então lê o cabeçalho da borda).
    proxy = bool(os.environ.get("CLIMA_CONFIAR_PROXY"))
    uvicorn.run("app.main:app", host=host, port=porta, proxy_headers=proxy, forwarded_allow_ips="127.0.0.1" if proxy else "")


if __name__ == "__main__":
    rodar()
