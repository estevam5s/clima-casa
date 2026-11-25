"""Clima Casa: servidor da API + interface web."""
import asyncio
import json
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
from .rotas import tarefas as rotas_tarefas
from .rotas import ia as rotas_ia
from .rotas import backup as rotas_backup
from .rotas import site_gestao as rotas_site

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
    caminho = request.url.path
    rota_site = caminho in ("/api/site/contato", "/api/site/cookies", "/api/site/cookies/consentimento", "/api/site/status", "/api/apps/versao",
                            "/api/site/coletar", "/api/site/newsletter/sair", "/api/site/newsletter/pedir-saida") or caminho.startswith("/api/site/idiomas/")
    if rota_site and origem_site in SITE_ORIGENS:
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
        # dicionário de idiomas: pode ficar em cache um pouco (a URL leva a versão, que muda a cada tradução)
        resp.headers["Cache-Control"] = "public, max-age=120, s-maxage=60" if caminho.startswith("/api/site/idiomas/") and request.method == "GET" and resp.status_code == 200 else "no-store"
        return resp
    # Firewall: listas de IP, país, assinaturas de ataque e limite de taxa (só nas rotas dinâmicas)
    from . import defesa
    # iscas (/wp-login.php, /.env…) passam pelo firewall mesmo não sendo rota da API (na Vercel caem aqui pelo catch-all)
    dinamica = request.url.path.startswith(("/api/", "/oauth/", "/alexa/")) or bool(defesa.ISCAS.search(request.url.path))
    de_teste = dinamica and request.headers.get("x-clima-teste") and firewall.pedido_de_teste(request)   # testes ao vivo do próprio sistema
    if dinamica and not de_teste:
        firewall.definir_contexto(request)
        barrado = await asyncio.to_thread(firewall.verificar, request)
        if barrado:
            return JSONResponse({"detail": barrado[1]}, status_code=barrado[0], headers={"Retry-After": "60"} if barrado[0] == 429 else None)
    # Corpo das escritas na API: tamanho máximo e assinaturas de injeção (SQL, NoSQL, comando, SSTI, XXE, Log4Shell…)
    if dinamica and not de_teste and request.method in ("POST", "PUT", "PATCH"):
        tam = request.headers.get("content-length")
        if tam and tam.isdigit() and int(tam) > 4 * 1024 * 1024:
            return JSONResponse({"detail": "Conteúdo grande demais."}, status_code=413)
        corpo = await request.body()
        barrado = await asyncio.to_thread(firewall.inspecionar_corpo, request, corpo)
        if barrado:
            return JSONResponse({"detail": barrado[1]}, status_code=barrado[0])
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
    resp.headers["Permissions-Policy"] = "camera=(), microphone=(self), geolocation=(), payment=(), usb=()"   # microfone: mensagem de voz do Assistente
    resp.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    resp.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    resp.headers["X-Permitted-Cross-Domain-Policies"] = "none"   # Flash/PDF não usam o domínio para ler dados
    resp.headers["Origin-Agent-Cluster"] = "?1"                  # página isolada em processo próprio do navegador
    resp.headers["X-DNS-Prefetch-Control"] = "off"
    if dinamica and "cache-control" not in resp.headers:
        resp.headers["Cache-Control"] = "no-store"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data: blob: https://challenges.cloudflare.com https://*.scdn.co https://*.spotifycdn.com https://*.googleusercontent.com; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; "
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
    # mensagem escrita por nós (validador "Value error, ...") vai inteira para a tela: diz o que fazer
    proprias = [str(e.get("msg", ""))[len("Value error, "):] for e in exc.errors() if str(e.get("msg", "")).startswith("Value error, ")]
    detalhe = " ".join(dict.fromkeys(proprias)) if proprias else f"Confira o(s) campo(s): {', '.join(campos)}."
    # formulário do próprio sistema mandando dado no formato errado = bug da tela (cadastro de ar, transmissor…).
    # Só com login (robô sem sessão não enche a área de bugs) e só quando não é erro de digitação explicado acima.
    u = getattr(request.state, "u", None)
    if u and not proprias and request.method in ("POST", "PUT", "PATCH"):
        from . import bugs
        await asyncio.to_thread(bugs.registrar_formulario, request.url.path, request.method, campos, u)
    return JSONResponse({"detail": detalhe}, status_code=422)


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
app.include_router(rotas_tarefas.rotas_tarefas)
app.include_router(rotas_ia.rotas_ia)
app.include_router(rotas_backup.rotas_backup)
app.include_router(rotas_site.publico_site)
app.include_router(rotas_site.gestao)


_VERSAO_REGISTRADA = False


@app.get("/saude")
def saude():
    """Saúde + versão no ar. Na primeira resposta de uma publicação nova (na nuvem), grava "versão X no ar desde agora" em
    config.versoes_no_ar: é o horário que a tela Novidades mostra como confirmado. O publicar-vercel.sh chama esta rota
    logo depois de publicar, então o horário é o da publicação, não o da primeira visita."""
    global _VERSAO_REGISTRADA
    try:
        versao = json.loads((Path(__file__).resolve().parent / "novidades.json").read_text(encoding="utf-8"))["versoes"][0]["versao"]
    except Exception:  # noqa: BLE001
        versao = None
    if versao and not _VERSAO_REGISTRADA and transmissor.PAPEL == "nuvem":
        _VERSAO_REGISTRADA = True
        try:
            reg = db.cfg("versoes_no_ar", {}) or {}
            if versao not in reg:
                db.set_cfg("versoes_no_ar", {**reg, versao: db.agora()})
        except Exception:  # noqa: BLE001  (banco fora: a saúde responde mesmo assim)
            pass
    return {"ok": True, "versao": versao}


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
