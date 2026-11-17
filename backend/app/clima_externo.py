"""Temperatura e umidade reais do lado de fora (Open-Meteo, sem chave), para o display do ar e o painel.

Local, nesta ordem: endereço do projeto (geocodificado) → config "clima_local" → localização do IP de quem
abriu o painel (cabeçalhos da Vercel, gravada em clima_local na primeira vez). Cache de 10 min por local.
"""
import time

import httpx

from . import db

_cache: dict[str, tuple[float, dict]] = {}
CODIGOS = {0: "céu limpo", 1: "quase limpo", 2: "parcialmente nublado", 3: "nublado", 45: "neblina", 48: "neblina",
           51: "garoa", 53: "garoa", 55: "garoa forte", 61: "chuva fraca", 63: "chuva", 65: "chuva forte", 80: "pancadas",
           81: "pancadas", 82: "pancadas fortes", 95: "trovoadas", 96: "trovoadas", 99: "trovoadas"}


def _geocodificar(texto: str) -> dict | None:
    chave = "geo:" + texto.lower()
    if chave in _cache and time.time() - _cache[chave][0] < 86400:
        return _cache[chave][1]
    r = httpx.get("https://geocoding-api.open-meteo.com/v1/search", params={"name": texto.split(",")[0].strip(), "count": 1, "language": "pt"}, timeout=8)
    res = (r.json().get("results") or [None])[0]
    local = {"lat": res["latitude"], "lon": res["longitude"], "cidade": res["name"]} if res else None
    _cache[chave] = (time.time(), local)
    return local


def local(projeto_id: int | None, request) -> dict | None:
    if projeto_id:
        p = db.um("SELECT endereco FROM projetos WHERE id = ?", (projeto_id,))
        if p and p["endereco"].strip():
            try:
                g = _geocodificar(p["endereco"])
                if g:
                    return g
            except httpx.HTTPError:
                pass
    salvo = db.cfg("clima_local")
    if salvo:
        return salvo
    h = request.headers
    try:
        from urllib.parse import unquote
        g = {"lat": float(h["x-vercel-ip-latitude"]), "lon": float(h["x-vercel-ip-longitude"]), "cidade": unquote(h.get("x-vercel-ip-city", ""))}
        db.set_cfg("clima_local", g)
        return g
    except (KeyError, ValueError):
        pass
    ev = db.um("SELECT lat, lon, cidade FROM seguranca_eventos WHERE lat IS NOT NULL AND tipo IN ('login_ok', 'acesso') ORDER BY id DESC LIMIT 1")
    return {"lat": ev["lat"], "lon": ev["lon"], "cidade": ev["cidade"]} if ev else None


def tipo_tempo(codigo, precipitacao=0, chance_hora=0) -> str:
    """Resumo para o 3D: limpo, nublado, neblina, chuva ou trovoada (chove agora ou chance >= 60% nesta hora)."""
    codigo = codigo or 0
    if codigo >= 95:
        return "trovoada"
    if codigo >= 51 or (precipitacao or 0) > 0.1 or (chance_hora or 0) >= 60:
        return "chuva"
    if codigo in (45, 48):
        return "neblina"
    return "nublado" if codigo >= 2 else "limpo"


def agora(projeto_id: int | None, request) -> dict:
    lugar = local(projeto_id, request)
    if not lugar:
        return {"disponivel": False, "motivo": "Informe o endereço do projeto (cidade) para mostrar a temperatura de fora."}
    chave = f"{lugar['lat']:.2f},{lugar['lon']:.2f}"
    if chave in _cache and time.time() - _cache[chave][0] < 600:
        return _cache[chave][1]
    r = httpx.get("https://api.open-meteo.com/v1/forecast", timeout=8, params={
        "latitude": lugar["lat"], "longitude": lugar["lon"], "timezone": "auto",
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,cloud_cover,precipitation",
        "hourly": "temperature_2m,precipitation_probability,weather_code,cloud_cover", "forecast_hours": 12,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max", "forecast_days": 3})
    j = r.json()
    c = j.get("current") or {}
    hr, dl = j.get("hourly") or {}, j.get("daily") or {}
    proximas = [{"hora": h[11:16], "temperatura": t, "chuva": pr, "codigo": cd, "condicao": CODIGOS.get(cd, ""), "nuvens": nv}
                for h, t, pr, cd, nv in zip(hr.get("time", []), hr.get("temperature_2m", []), hr.get("precipitation_probability", []),
                                            hr.get("weather_code", []), hr.get("cloud_cover", []))]
    dias = [{"data": d, "codigo": cd, "condicao": CODIGOS.get(cd, ""), "max": mx, "min": mn, "chuva": pr}
            for d, cd, mx, mn, pr in zip(dl.get("time", []), dl.get("weather_code", []), dl.get("temperature_2m_max", []),
                                         dl.get("temperature_2m_min", []), dl.get("precipitation_probability_max", []))]
    dados = {"disponivel": True, "cidade": lugar.get("cidade") or "", "temperatura": c.get("temperature_2m"),
             "sensacao": c.get("apparent_temperature"), "umidade": c.get("relative_humidity_2m"), "vento": c.get("wind_speed_10m"),
             "dia": bool(c.get("is_day", 1)), "condicao": CODIGOS.get(c.get("weather_code"), ""), "codigo": c.get("weather_code"),
             "nuvens": c.get("cloud_cover"), "precipitacao": c.get("precipitation"), "tipo": tipo_tempo(c.get("weather_code"), c.get("precipitation"),
                                                                                                     proximas[0]["chuva"] if proximas else 0),
             "atualizado": c.get("time"), "proximas": proximas, "dias": dias, "fonte": "Open-Meteo"}
    _cache[chave] = (time.time(), dados)
    return dados
