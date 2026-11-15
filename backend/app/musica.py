"""Música: Spotify (Web API) ligado ao Clima Escritório.

- O dono cria um app no Spotify for Developers e cola o Client ID e o Client Secret (ficam cifrados em config.spotify).
- Login pelo OAuth "authorization code": o Spotify volta para /musica do painel com ?code=…, o painel manda o código
  para a API, que troca por tokens (refresh token cifrado; o access token é renovado sozinho).
- Player: o que está tocando, aparelhos Spotify Connect (inclui os Echo da Alexa quando a conta Alexa tem o Spotify
  vinculado), play/pausa/próxima/volume/aleatório/repetir, transferir para outro aparelho e tocar playlist/música.
- Rotinas (config.musica_rotinas): gatilho por horário (dias da semana) ou por um ar ligar/desligar, com janela de
  horário opcional, e ação tocar/pausar/volume. Rodam no agente do Mac (laço da agenda, a cada 20 s).
Controlar a reprodução exige conta Spotify Premium (regra do Spotify).
"""
import base64
import datetime
import logging
import secrets
import time
import urllib.parse

import httpx

from . import db

log = logging.getLogger("clima.musica")
CONTA = "https://accounts.spotify.com"
API = "https://api.spotify.com/v1"
ESCOPOS = ("user-read-playback-state user-modify-playback-state user-read-currently-playing "
           "playlist-read-private playlist-read-collaborative user-read-private user-library-read user-read-recently-played")
REDIRECIONAR = "https://app.zynio.com.br/musica"


class ErroSpotify(Exception):
    def __init__(self, status: int, msg: str):
        super().__init__(msg)
        self.status = status


def _cfg() -> dict:
    return db.cfg("spotify") or {}


def _salvar(c: dict):
    db.set_cfg("spotify", c)


def estado() -> dict:
    c = _cfg()
    return {
        "configurado": bool(c.get("client_id") and c.get("client_secret")),
        "conectado": bool(c.get("refresh_token")),
        "client_id": (c.get("client_id") or "")[:6] + "…" if c.get("client_id") else "",
        "conta": c.get("conta"),
        "redirect_uri": c.get("redirect_uri") or REDIRECIONAR,
        "escopos": ESCOPOS.split(),
    }


def salvar_credenciais(client_id: str, client_secret: str, redirect_uri: str | None = None):
    c = _cfg()
    if c.get("client_id") != client_id:   # outro app: o login antigo não vale mais
        c.pop("refresh_token", None); c.pop("access_token", None); c.pop("conta", None)
    c.update({"client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri or REDIRECIONAR})
    _salvar(c)


def url_login() -> str:
    c = _cfg()
    if not c.get("client_id"):
        raise ErroSpotify(409, "Cadastre o Client ID e o Client Secret do app do Spotify primeiro.")
    estado_oauth = secrets.token_urlsafe(24)
    c["oauth_estado"] = {"valor": estado_oauth, "expira": int(time.time()) + 600}
    _salvar(c)
    db.registrar("musica", "Login no Spotify iniciado", detalhe=f"volta em {c.get('redirect_uri') or REDIRECIONAR}")
    q = {"client_id": c["client_id"], "response_type": "code", "redirect_uri": c.get("redirect_uri") or REDIRECIONAR,
         "scope": ESCOPOS, "state": estado_oauth, "show_dialog": "true"}
    return f"{CONTA}/authorize?{urllib.parse.urlencode(q)}"


def _basic(c: dict) -> str:
    return "Basic " + base64.b64encode(f"{c['client_id']}:{c['client_secret']}".encode()).decode()


def concluir_login(code: str, estado_oauth: str) -> dict:
    c = _cfg()
    esp = c.get("oauth_estado") or {}
    if not esp or not secrets.compare_digest(esp.get("valor", ""), estado_oauth or "") or esp.get("expira", 0) < time.time():
        db.registrar("musica", "Volta do Spotify recusada", ok=False, detalhe="state ausente, diferente ou vencido (mais de 10 min)")
        raise ErroSpotify(400, "O login do Spotify expirou ou não começou por aqui. Clique em Conectar de novo.")
    c.pop("oauth_estado", None); _salvar(c)   # uso único
    r = httpx.post(f"{CONTA}/api/token", headers={"Authorization": _basic(c)}, timeout=15,
                   data={"grant_type": "authorization_code", "code": code, "redirect_uri": c.get("redirect_uri") or REDIRECIONAR})
    if r.status_code != 200:
        try:
            motivo = r.json().get("error_description") or r.json().get("error") or r.status_code
        except ValueError:
            motivo = r.status_code
        db.registrar("musica", "Spotify recusou a troca do código", ok=False, detalhe=str(motivo)[:200])
        dica = (" Em developer.spotify.com → app → Settings, o Redirect URI tem que ser exatamente " + (c.get("redirect_uri") or REDIRECIONAR) + "."
                if "redirect" in str(motivo).lower() else " Clique em Conectar com o Spotify de novo (cada código vale uma vez, por poucos minutos).")
        raise ErroSpotify(400, f"O Spotify recusou o login ({motivo}).{dica}")
    t = r.json()
    c.update({"refresh_token": t["refresh_token"], "access_token": t["access_token"], "expira": int(time.time()) + t.get("expires_in", 3600) - 60})
    _salvar(c)
    try:
        eu = chamar("GET", "/me")
    except ErroSpotify as e:
        db.registrar("musica", "Spotify conectado, mas a conta não pôde ser lida", ok=False, detalhe=str(e)[:200])
        if e.status == 403:
            raise ErroSpotify(403, "O Spotify autorizou, mas bloqueou o acesso à conta: em developer.spotify.com, abra o app → User Management e adicione o e-mail desta conta Spotify.") from e
        raise
    c = _cfg()
    c["conta"] = {"nome": eu.get("display_name") or eu.get("id"), "id": eu.get("id"), "produto": eu.get("product"), "pais": eu.get("country"),
                  "foto": ((eu.get("images") or [{}])[0] or {}).get("url"), "conectado_em": int(time.time())}
    _salvar(c)
    db.registrar("musica", "Spotify conectado", detalhe=f"conta {c['conta']['nome']} ({c['conta']['produto']})")
    return estado()


def desconectar():
    c = _cfg()
    for k in ("refresh_token", "access_token", "expira", "conta", "oauth_estado"):
        c.pop(k, None)
    _salvar(c)
    db.registrar("musica", "Spotify desconectado")


def _token() -> str:
    c = _cfg()
    if not c.get("refresh_token"):
        raise ErroSpotify(409, "Spotify não conectado.")
    if c.get("access_token") and c.get("expira", 0) > time.time():
        return c["access_token"]
    r = httpx.post(f"{CONTA}/api/token", headers={"Authorization": _basic(c)}, timeout=15,
                   data={"grant_type": "refresh_token", "refresh_token": c["refresh_token"]})
    if r.status_code != 200:
        raise ErroSpotify(401, "O acesso ao Spotify foi revogado ou expirou. Conecte de novo.")
    t = r.json()
    c["access_token"] = t["access_token"]; c["expira"] = int(time.time()) + t.get("expires_in", 3600) - 60
    if t.get("refresh_token"):
        c["refresh_token"] = t["refresh_token"]
    _salvar(c)
    return c["access_token"]


MENSAGENS = {
    "NO_ACTIVE_DEVICE": "Nenhum aparelho do Spotify ativo. Abra o Spotify em algum aparelho (ou escolha um Echo) e tente de novo.",
    "PREMIUM_REQUIRED": "Controlar a reprodução exige Spotify Premium.",
}


def chamar(metodo: str, caminho: str, **kw):
    r = httpx.request(metodo, f"{API}{caminho}", headers={"Authorization": f"Bearer {_token()}"}, timeout=15, **kw)
    if r.status_code == 204 or not r.content:
        return {}
    if r.status_code >= 400:
        try:
            err = r.json().get("error", {})
        except ValueError:
            err = {}
        motivo = err.get("reason") or ""
        raise ErroSpotify(r.status_code if r.status_code < 500 else 502, MENSAGENS.get(motivo) or err.get("message") or f"Spotify respondeu {r.status_code}.")
    return r.json()


def _resumo_item(it: dict | None) -> dict | None:
    if not it:
        return None
    imgs = (it.get("album") or {}).get("images") or it.get("images") or []
    return {"nome": it.get("name"), "uri": it.get("uri"), "tipo": it.get("type"),
            "artistas": ", ".join(a["name"] for a in it.get("artists") or []) or (it.get("show") or {}).get("name"),
            "album": (it.get("album") or {}).get("name"), "capa": imgs[0]["url"] if imgs else None, "duracao_ms": it.get("duration_ms")}


def tocando() -> dict:
    p = chamar("GET", "/me/player", params={"additional_types": "track,episode"}) or {}
    aparelhos = chamar("GET", "/me/player/devices").get("devices", [])
    return {
        "tocando": p.get("is_playing", False), "progresso_ms": p.get("progress_ms"), "aleatorio": p.get("shuffle_state"),
        "repetir": p.get("repeat_state"), "item": _resumo_item(p.get("item")), "contexto": (p.get("context") or {}).get("uri"),
        "aparelho": p.get("device") and {"id": p["device"]["id"], "nome": p["device"]["name"], "tipo": p["device"]["type"], "volume": p["device"].get("volume_percent")},
        "aparelhos": [{"id": d["id"], "nome": d["name"], "tipo": d["type"], "ativo": d["is_active"], "volume": d.get("volume_percent"), "restrito": d.get("is_restricted")} for d in aparelhos],
    }


def _aparelho_por_nome(nome: str | None) -> str | None:
    if not nome:
        return None
    for d in chamar("GET", "/me/player/devices").get("devices", []):
        if d["name"].strip().lower() == nome.strip().lower():
            return d["id"]
    raise ErroSpotify(404, f"O aparelho “{nome}” não está disponível no Spotify agora (ligado e na mesma conta?).")


def comando(acao: str, device_id: str | None = None, uri: str | None = None, volume: int | None = None, valor=None, aparelho_nome: str | None = None):
    if aparelho_nome and not device_id:
        device_id = _aparelho_por_nome(aparelho_nome)
    q = {"device_id": device_id} if device_id else {}
    if acao == "tocar":
        corpo = {}
        if uri:
            corpo = {"uris": [uri]} if ":track:" in uri or ":episode:" in uri else {"context_uri": uri}
        chamar("PUT", "/me/player/play", params=q, json=corpo or None)
    elif acao == "pausar":
        chamar("PUT", "/me/player/pause", params=q)
    elif acao == "proxima":
        chamar("POST", "/me/player/next", params=q)
    elif acao == "anterior":
        chamar("POST", "/me/player/previous", params=q)
    elif acao == "volume":
        chamar("PUT", "/me/player/volume", params={**q, "volume_percent": max(0, min(100, int(volume or 0)))})
    elif acao == "aleatorio":
        chamar("PUT", "/me/player/shuffle", params={**q, "state": "true" if valor else "false"})
    elif acao == "repetir":
        chamar("PUT", "/me/player/repeat", params={**q, "state": valor if valor in ("off", "context", "track") else "off"})
    elif acao == "transferir":
        if not device_id:
            raise ErroSpotify(422, "Escolha o aparelho.")
        chamar("PUT", "/me/player", json={"device_ids": [device_id], "play": True})
    elif acao == "fila":
        chamar("POST", "/me/player/queue", params={**q, "uri": uri})
    else:
        raise ErroSpotify(422, "Ação desconhecida.")


def buscar(q: str, tipos: str = "playlist,track,album,artist") -> dict:
    r = chamar("GET", "/search", params={"q": q, "type": tipos, "limit": 8, "market": "from_token"})
    out = {}
    for k in ("playlists", "tracks", "albums", "artists"):
        itens = [i for i in (r.get(k) or {}).get("items", []) if i]
        out[k] = [{"nome": i["name"], "uri": i["uri"], "tipo": i["type"],
                   "sub": ", ".join(a["name"] for a in i.get("artists") or []) or (i.get("owner") or {}).get("display_name") or "",
                   "capa": ((i.get("images") or (i.get("album") or {}).get("images") or [{}])[0] or {}).get("url")} for i in itens]
    return out


def playlists() -> list:
    r = chamar("GET", "/me/playlists", params={"limit": 50})
    return [{"nome": p["name"], "uri": p["uri"], "faixas": (p.get("tracks") or {}).get("total"), "dono": (p.get("owner") or {}).get("display_name"),
             "capa": ((p.get("images") or [{}])[0] or {}).get("url")} for p in r.get("items", []) if p]


# ---------------- rotinas ----------------
def rotinas() -> list:
    return db.cfg("musica_rotinas") or []


def salvar_rotinas(lista: list):
    db.set_cfg("musica_rotinas", lista)


def executar_rotina(r: dict, motivo: str):
    a = r.get("acao") or {}
    try:
        if a.get("tipo") == "tocar":
            dev = _aparelho_por_nome(a.get("aparelho_nome")) if a.get("aparelho_nome") else None
            if a.get("volume") is not None:
                try:
                    comando("volume", device_id=dev, volume=a["volume"])
                except ErroSpotify:
                    pass   # alguns aparelhos não aceitam volume antes de tocar
            if a.get("aleatorio") is not None:
                try:
                    comando("aleatorio", device_id=dev, valor=a["aleatorio"])
                except ErroSpotify:
                    pass
            comando("tocar", device_id=dev, uri=a.get("uri"))
        elif a.get("tipo") == "pausar":
            comando("pausar", aparelho_nome=a.get("aparelho_nome"))
        elif a.get("tipo") == "volume":
            comando("volume", aparelho_nome=a.get("aparelho_nome"), volume=a.get("volume", 30))
        elif a.get("tipo") == "proxima":
            comando("proxima", aparelho_nome=a.get("aparelho_nome"))
        db.registrar("musica", f"Rotina de música: {r.get('nome')}", detalhe=motivo)
        return True
    except Exception as e:  # noqa: BLE001
        db.registrar("musica", f"Rotina de música: {r.get('nome')}", ok=False, detalhe=f"{motivo}: {e}")
        log.warning("rotina de música %s falhou: %s", r.get("id"), e)
        return False


def _dentro_da_janela(r: dict, agora: datetime.datetime) -> bool:
    j = r.get("janela") or {}
    if not j.get("inicio") or not j.get("fim"):
        return True
    m = agora.hour * 60 + agora.minute
    ini = int(j["inicio"][:2]) * 60 + int(j["inicio"][3:5]); fim = int(j["fim"][:2]) * 60 + int(j["fim"][3:5])
    return ini <= m < fim if ini <= fim else (m >= ini or m < fim)


def ciclo(agora: datetime.datetime | None = None):
    """Rotinas por horário (chamado pelo laço da agenda no agente, a cada 20 s)."""
    if not (_cfg().get("refresh_token")):
        return
    agora = agora or datetime.datetime.now()
    hoje = (agora.weekday() + 1) % 7
    hhmm = agora.strftime("%H:%M"); marca = agora.strftime("%Y-%m-%d ") + hhmm
    lista = rotinas(); mudou = False
    for r in lista:
        g = r.get("gatilho") or {}
        if not r.get("ativo", True) or g.get("tipo") != "horario" or g.get("hora") != hhmm:
            continue
        if hoje not in (g.get("dias") or [0, 1, 2, 3, 4, 5, 6]) or r.get("ultima") == marca:
            continue
        r["ultima"] = marca; mudou = True
        executar_rotina(r, f"horário {hhmm}")
    if mudou:
        salvar_rotinas(lista)


def evento_ar(aparelho_id: int, ligado: bool):
    """Rotinas "quando um ar ligar/desligar" (chamado pelo agente junto com as automações)."""
    if not (_cfg().get("refresh_token")):
        return
    tipo = "ar_ligou" if ligado else "ar_desligou"
    agora = datetime.datetime.now()
    for r in rotinas():
        g = r.get("gatilho") or {}
        if not r.get("ativo", True) or g.get("tipo") != tipo:
            continue
        if g.get("aparelho_id") and int(g["aparelho_id"]) != int(aparelho_id):
            continue
        if _dentro_da_janela(r, agora):
            executar_rotina(r, f"ar {aparelho_id} {'ligou' if ligado else 'desligou'}")
