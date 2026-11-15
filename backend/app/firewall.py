"""Firewall da aplicação: listas de IP, bloqueio automático, detecção de ataque, limite de taxa e login protegido.

Ordem de cada requisição (middleware em main.py):
  1. IP na lista de permitidos  → passa direto
  2. IP/CIDR bloqueado (manual ou automático, com expiração) → 403
  3. país bloqueado (cabeçalho x-vercel-ip-country) → 403
  4. assinatura de ferramenta/ataque (agente, caminho, query) → evento "scanner" + 403; 3 no período → bloqueio
  5. limite de requisições por minuto por IP → 429; estourar várias vezes → bloqueio
  6. depois da resposta: 401 sem token = visita sem login (não é ataque); token falso = "token_invalido";
     403 = "auth_negado"; excesso ou varredura da API → bloqueio progressivo

Os contadores rápidos ficam em memória (por instância); os bloqueios e eventos ficam no Supabase,
então valem para a Vercel e para o agente ao mesmo tempo.
"""
import contextvars
import ipaddress
import re
import threading
import time
from collections import defaultdict, deque
from urllib.parse import unquote

from . import db

PADRAO = {
    "ativo": True,
    "limite_por_minuto": 240,          # requisições por IP por minuto na API
    "tentativas_login": 5,             # falhas de login antes de bloquear
    "falhas_auth": 20,                 # respostas 401/403 antes de bloquear
    "janela_min": 15,                  # janela de contagem das falhas
    "bloqueio_progressivo": [15, 60, 1440, 10080],  # minutos: 15 min, 1 h, 24 h, 7 dias
    "detectar_scanners": True,
    "paises_bloqueados": [],           # ex.: ["CN", "RU"]
    "paises_permitidos": [],           # se preenchido, só estes países entram
    "registrar_logins_ok": True,
}
AGENTES_MALICIOSOS = re.compile(
    r"sqlmap|nikto|nmap|masscan|zgrab|nuclei|acunetix|wpscan|dirbuster|gobuster|ffuf|feroxbuster|hydra|"
    r"medusa|netsparker|openvas|nessus|w3af|arachni|havij|jaeles|whatweb|xsstrike|commix|metasploit", re.I)
CAMINHOS_MALICIOSOS = re.compile(
    r"(\.\./|%2e%2e|/\.env|/\.git|wp-(admin|login|content)|phpmyadmin|xmlrpc\.php|/cgi-bin|/vendor/phpunit|"
    r"/boaform|/actuator|/server-status|\.(php|asp|aspx|jsp)(\?|$)|/etc/passwd|win\.ini)", re.I)
CARGAS_MALICIOSAS = re.compile(
    r"(union(\s|%20|\+)+select|select(\s|%20|\+).+from|sleep\(\d|benchmark\(|<script|javascript:|onerror=|"
    r"\$\{jndi:|%00|' *or *'1'='1|\bdrop(\s|%20|\+)+table)", re.I)

_cache = {"lista": [], "lista_em": 0.0, "cfg": dict(PADRAO), "cfg_em": 0.0}
_reqs: dict[str, deque] = defaultdict(deque)
_estouros: dict[str, int] = defaultdict(int)
_trava = threading.Lock()
_vistos: dict[str, float] = {}       # IP → último "acesso" registrado (para não gravar cada requisição)
_geo = contextvars.ContextVar("clima_geo", default={})


def definir_contexto(request):
    """Guarda a localização do pedido (cabeçalhos da borda da Vercel) para os registros desta requisição."""
    h = request.headers

    def num(c):
        try:
            return float(h.get(c, ""))
        except ValueError:
            return None
    _geo.set({"pais": h.get("x-vercel-ip-country", ""), "cidade": unquote(h.get("x-vercel-ip-city", "")),
              "regiao": h.get("x-vercel-ip-country-region", ""), "lat": num("x-vercel-ip-latitude"), "lon": num("x-vercel-ip-longitude")})


_sem_login: dict[str, deque] = defaultdict(lambda: deque(maxlen=200))
_sem_login_visto: dict[str, float] = {}


def registrar_acesso(request, status: int):
    """Grava um evento "acesso" por IP a cada 10 min (alimenta o mapa e o relatório de acessos)."""
    ip = ip_do_pedido(request)
    agora = time.time()
    if agora - _vistos.get(ip, 0) < 600:
        return
    _vistos[ip] = agora
    if len(_vistos) > 5000:
        _vistos.clear()
    registrar(ip, "acesso", request.url.path, str(status), agente=request.headers.get("user-agent", ""))


def config() -> dict:
    if time.time() - _cache["cfg_em"] > 30:
        _cache["cfg"] = {**PADRAO, **(db.cfg("seguranca") or {})}
        _cache["cfg_em"] = time.time()
    return _cache["cfg"]


def invalidar():
    _cache["lista_em"] = 0
    _cache["cfg_em"] = 0


def _lista() -> list[dict]:
    if time.time() - _cache["lista_em"] > 20:
        agora = db.agora()
        linhas = db.consultar("SELECT alvo, tipo, motivo, expira_em FROM seguranca_ips WHERE expira_em IS NULL OR expira_em > ?", (agora,))
        for l in linhas:
            try:
                l["rede"] = ipaddress.ip_network(l["alvo"], strict=False)
            except ValueError:
                l["rede"] = None
        _cache["lista"] = linhas
        _cache["lista_em"] = time.time()
    return _cache["lista"]


def ip_do_pedido(request) -> str:
    # Na Vercel o IP real vem em x-real-ip / x-forwarded-for (preenchidos pela borda, não pelo cliente).
    import os
    confiar_proxy = os.environ.get("VERCEL") or os.environ.get("CLIMA_CONFIAR_PROXY")  # só atrás da borda da Vercel
    bruto = ""
    if confiar_proxy:
        bruto = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not bruto and request.client:
        bruto = request.client.host
    try:
        return str(ipaddress.ip_address(bruto))
    except ValueError:
        return "0.0.0.0"


def _casa(ip: str, tipo: str) -> dict | None:
    try:
        endereco = ipaddress.ip_address(ip)
    except ValueError:
        return None
    for l in _lista():
        if l["tipo"] == tipo and l["rede"] is not None and endereco.version == l["rede"].version and endereco in l["rede"]:
            return l
    return None


def registrar(ip: str, tipo: str, rota: str = "", detalhe: str = "", pais: str = "", agente: str = ""):
    g = _geo.get()
    try:
        db.executar("INSERT INTO seguranca_eventos (quando, ip, tipo, rota, detalhe, pais, agente, cidade, regiao, lat, lon) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (db.agora(), ip, tipo, rota[:200], detalhe[:300], (pais or g.get("pais", ""))[:4], agente[:200],
                     g.get("cidade", "")[:80], g.get("regiao", "")[:10], g.get("lat"), g.get("lon")))
    except Exception:  # noqa: BLE001  (registro nunca derruba a requisição)
        pass


def bloquear(alvo: str, motivo: str, minutos: int | None, automatico: bool = True):
    """Bloqueia IP/CIDR. Se já existe, soma a ocorrência e renova a expiração."""
    ipaddress.ip_network(alvo, strict=False)  # valida
    expira = db.agora() + minutos * 60 if minutos else None
    db.executar(
        "INSERT INTO seguranca_ips (alvo, tipo, motivo, automatico, expira_em, criado_em) VALUES (?, 'bloqueado', ?, ?, ?, ?) "
        "ON CONFLICT (alvo) DO UPDATE SET tipo = 'bloqueado', motivo = excluded.motivo, automatico = excluded.automatico, "
        "expira_em = excluded.expira_em, ocorrencias = seguranca_ips.ocorrencias + 1",
        (alvo, motivo[:200], automatico, expira, db.agora()))
    invalidar()


def bloqueio_automatico(ip: str, motivo: str):
    """Bloqueio progressivo: cada reincidência usa o próximo degrau (15 min → 1 h → 24 h → 7 dias)."""
    if _casa(ip, "permitido"):
        return
    degraus = config()["bloqueio_progressivo"] or [60]
    anterior = db.um("SELECT ocorrencias FROM seguranca_ips WHERE alvo = ? AND automatico", (ip,))
    nivel = min((anterior or {}).get("ocorrencias", 0), len(degraus) - 1)
    bloquear(ip, motivo, degraus[nivel], automatico=True)
    registrar(ip, "ip_bloqueado_auto", detalhe=f"{motivo} · {degraus[nivel]} min")
    db.registrar("sistema", f"IP bloqueado automaticamente: {ip}", ok=False, detalhe=f"{motivo} · {degraus[nivel]} min")
    from . import notificacoes
    g = _geo.get()
    local = ", ".join(x for x in (g.get("cidade"), g.get("pais")) if x)
    notificacoes.notificar(f"ip-{ip}", "seguranca", "alta", f"IP {ip} bloqueado automaticamente",
                           f"{motivo}. Bloqueio de {degraus[nivel]} min{' · ' + local if local else ''}.", "/seguranca",
                           {"rotulo": "Desbloquear", "tipo": "desbloquear_ip", "alvo": ip})


def falhas_recentes(ip: str, tipos: tuple[str, ...], minutos: int, detalhe_contem: str | None = None) -> int:
    filtro = " AND detalhe = ?" if detalhe_contem else ""
    params = (ip, db.agora() - minutos * 60, *tipos) + ((detalhe_contem,) if detalhe_contem else ())
    marcas = ",".join("?" * len(tipos))
    return db.um(f"SELECT count(*) n FROM seguranca_eventos WHERE ip = ? AND quando > ? AND tipo IN ({marcas}){filtro}", params)["n"]


def verificar(request) -> tuple[int, str] | None:
    """Antes de atender: devolve (status, motivo) para barrar, ou None para seguir."""
    c = config()
    if not c.get("ativo"):
        return None
    ip = ip_do_pedido(request)
    if _casa(ip, "permitido"):
        return None
    pais = request.headers.get("x-vercel-ip-country", "")
    rota = request.url.path
    agente = request.headers.get("user-agent", "")
    bloqueio = _casa(ip, "bloqueado")
    if bloqueio:
        return 403, "Acesso bloqueado pelo firewall."
    if pais and (pais in c["paises_bloqueados"] or (c["paises_permitidos"] and pais not in c["paises_permitidos"])):
        registrar(ip, "pais_bloqueado", rota, pais, pais, agente)
        return 403, "Acesso não permitido a partir desta região."
    if c.get("detectar_scanners"):
        alvo = rota + "?" + str(request.url.query)
        if AGENTES_MALICIOSOS.search(agente) or CAMINHOS_MALICIOSOS.search(alvo) or CARGAS_MALICIOSAS.search(alvo):
            registrar(ip, "scanner", rota, alvo[:300], pais, agente)
            if falhas_recentes(ip, ("scanner",), 60) >= 3:
                bloqueio_automatico(ip, "assinatura de ferramenta de ataque")
            return 403, "Requisição recusada."
    agora = time.time()
    with _trava:
        fila = _reqs[ip]
        while fila and fila[0] < agora - 60:
            fila.popleft()
        fila.append(agora)
        excedeu = len(fila) > c["limite_por_minuto"]
        if excedeu:
            _estouros[ip] += 1
    if excedeu:
        if _estouros[ip] in (1, 50):
            registrar(ip, "rate_limit", rota, f"{len(fila)} req/min", pais, agente)
        if _estouros[ip] >= 200:
            _estouros[ip] = 0
            bloqueio_automatico(ip, "excesso de requisições")
        return 429, "Muitas requisições. Aguarde um minuto."
    return None


def depois(request, status: int):
    """Depois de responder: separa visita sem login (normal) de ataque de verdade.

    - 401 SEM token: alguém abriu a página do sistema sem estar logado (o navegador pergunta "tenho sessão?").
      Isso é visita, não ataque: vira "sem_login", amostrado 1 por IP a cada 10 min. Só uma varredura
      (muitas rotas diferentes da API sem login em poucos minutos) leva a bloqueio.
    - 401 COM token: token falso, adulterado ou de outro projeto → "token_invalido" (ataque) e conta para o bloqueio.
    - 403 com sessão válida: pessoa logada tentando algo que o papel dela não permite → "auth_negado".
    """
    if status not in (401, 403) or not request.url.path.startswith(("/api/", "/oauth/", "/alexa/")):
        return
    c = config()
    if not c.get("ativo"):
        return
    ip = ip_do_pedido(request)
    if _casa(ip, "permitido") or falhas_recentes(ip, ("login_ok",), 1440):
        return  # sessão vencida do próprio administrador não conta como ataque
    pais, agente = request.headers.get("x-vercel-ip-country", ""), request.headers.get("user-agent", "")
    auth = request.headers.get("authorization", "")
    tem_token = auth.lower().startswith("bearer ") and len(auth.strip()) > 20
    if status == 401 and not tem_token:
        agora = time.time()
        rotas = _sem_login[ip]
        rotas.append((agora, request.url.path))
        while rotas and agora - rotas[0][0] > 300:
            rotas.popleft()
        if len({r for _, r in rotas}) >= 12:   # 12+ rotas diferentes da API sem login em 5 min = varredura
            rotas.clear()
            registrar(ip, "scanner", request.url.path, "varredura da API sem login", pais, agente)
            bloqueio_automatico(ip, "varredura da API sem login")
            return
        if agora - _sem_login_visto.get(ip, 0) >= 600:
            _sem_login_visto[ip] = agora
            registrar(ip, "sem_login", request.url.path, "abriu o sistema sem estar logado", pais, agente)
        return
    tipo = "token_invalido" if status == 401 else "auth_negado"
    registrar(ip, tipo, request.url.path, str(status), pais, agente)
    if falhas_recentes(ip, ("token_invalido", "auth_negado"), c["janela_min"]) >= c["falhas_auth"]:
        bloqueio_automatico(ip, "excesso de acessos não autorizados")