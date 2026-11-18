"""Teste de velocidade da rede (como o speed.cloudflare.com), de dois lugares:

- **agente** (o computador do escritório: Raspberry Pi ou PC): mede a internet do escritório e o tempo de resposta de cada
  transmissor na rede local (porta 6668). Roda no agente pela fila `infra` (op `rede_teste`).
- **navegador** (o computador de quem abriu o painel): o próprio navegador mede e manda o resultado (`salvar_resultado`).

Servidor de medição: speed.cloudflare.com (__down e __up, públicos). O resultado traz o IP, o datacenter da Cloudflare,
a cidade e o número do provedor (AS) pelos cabeçalhos cf-meta-*; o cabeçalho server-timing (cfL4) traz o RTT e os pacotes
perdidos/retransmitidos da conexão TCP, usados para estimar a perda. Nada é inventado: o que não der para medir fica None.
"""
from __future__ import annotations

import re
import socket
import statistics
import threading
import time

from . import db

BASE = "https://speed.cloudflare.com"
HIST = "rede_testes"
MAX_HIST = 80


def _meta(h) -> dict:
    g = lambda k: h.get(f"cf-meta-{k}")  # noqa: E731
    asn = g("asn")
    return {"ip": g("ip"), "colo": g("colo"), "cidade": g("city"), "pais": g("country"), "asn": f"AS{asn}" if asn else None}


def _l4(h) -> dict:
    st = ",".join(v for k, v in h.multi_items() if k.lower() == "server-timing") if hasattr(h, "multi_items") else h.get("server-timing", "")
    m = re.search(r'cfL4;desc="\?([^"]+)"', st or "")
    if not m:
        return {}
    kv = dict(x.split("=", 1) for x in m.group(1).split("&") if "=" in x)
    try:
        return {"rtt_ms": int(kv.get("rtt", 0)) / 1000, "enviados": int(kv.get("sent", 0)), "perdidos": int(kv.get("lost", 0)), "retrans": int(kv.get("retrans", 0))}
    except ValueError:
        return {}


def qualidade(r: dict) -> dict:
    """Leitura simples do resultado para três usos (limiares públicos de referência, ajustáveis)."""
    d, u, lat, jit = r.get("download") or 0, r.get("upload") or 0, r.get("latencia") or 999, r.get("jitter") or 999
    def nota(ok, medio):
        return "boa" if ok else "razoavel" if medio else "ruim"
    return {
        "video_4k": nota(d >= 25 and lat < 100, d >= 10),
        "chamadas": nota(d >= 3 and u >= 3 and lat < 60 and jit < 20, d >= 1.5 and u >= 1 and lat < 150),
        "jogos": nota(lat < 40 and jit < 10 and d >= 5, lat < 80 and jit < 25),
    }


def historico() -> list[dict]:
    return db.cfg(HIST) or []


def _gravar(r: dict) -> dict:
    r = {**r, "quando": db.agora(), "qualidade": qualidade(r)}
    h = [r] + historico()
    db.set_cfg(HIST, h[:MAX_HIST])
    return r


def salvar_resultado(r: dict, quem: str) -> dict:
    return _gravar({**r, "origem": "navegador", "quem": quem})


def _mbps(bytes_: int, seg: float) -> float:
    return round(bytes_ * 8 / max(seg, 1e-6) / 1e6, 2)


def testar_agente(_a=None) -> dict:
    """Roda no agente. ~20 a 40 s. Latência (20 medidas), download e upload em tamanhos crescentes, latência com carga,
    perda estimada pela conexão TCP, DNS e cada transmissor na rede local."""
    import httpx
    from . import coordenador
    r: dict = {"origem": "agente", "quem": socket.gethostname().split(".")[0], "etapas": {}}
    with httpx.Client(timeout=30, headers={"User-Agent": "clima-escritorio-agente/1.0"}) as c:
        # DNS
        t0 = time.perf_counter()
        try:
            socket.getaddrinfo("speed.cloudflare.com", 443)
            r["dns_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        except OSError:
            r["dns_ms"] = None
        # latência sem carga
        lat = []
        for _ in range(20):
            t0 = time.perf_counter()
            resp = c.get(f"{BASE}/__down", params={"bytes": 0})
            lat.append((time.perf_counter() - t0) * 1000)
            if not r.get("ip"):
                r.update(_meta(resp.headers))
        lat.sort()
        base = lat[: max(5, len(lat) // 2)]   # a metade mais rápida descarta o 1º aperto de mão
        r["latencia"] = round(statistics.median(base), 1)
        r["jitter"] = round(statistics.mean(abs(a - b) for a, b in zip(lat, lat[1:])), 1) if len(lat) > 1 else None
        r["latencia_min"] = round(lat[0], 1)
        # download (para quando uma medida passa de ~4 s)
        amostras, l4 = [], {}
        carga, parar = [], threading.Event()
        def pingar():   # latência com carga: em paralelo ao download maior
            with httpx.Client(timeout=10) as c2:
                while not parar.is_set():
                    t1 = time.perf_counter()
                    try:
                        c2.get(f"{BASE}/__down", params={"bytes": 0}); carga.append((time.perf_counter() - t1) * 1000)
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.25)
        for n in (100_000, 1_000_000, 10_000_000, 25_000_000, 50_000_000):
            if n >= 10_000_000 and not carga:
                th = threading.Thread(target=pingar, daemon=True); th.start()
            t0 = time.perf_counter()
            resp = c.get(f"{BASE}/__down", params={"bytes": n})
            dur = time.perf_counter() - t0
            if n >= 1_000_000:
                amostras.append(_mbps(len(resp.content), dur))
            l4 = _l4(resp.headers) or l4
            if dur > 4:
                break
        parar.set()
        r["download"] = round(statistics.median(sorted(amostras)[-3:]), 2) if amostras else None
        r["latencia_carga"] = round(statistics.median(carga), 1) if carga else None
        if l4.get("enviados"):
            r["perda_pct"] = round(l4["perdidos"] / max(1, l4["enviados"]) * 100, 2)
            r["retransmissoes"] = l4["retrans"]
        # upload
        up = []
        for n in (100_000, 1_000_000, 5_000_000, 10_000_000):
            dados = b"0" * n
            t0 = time.perf_counter()
            c.post(f"{BASE}/__up", content=dados, headers={"Content-Type": "application/octet-stream"})
            dur = time.perf_counter() - t0
            if n >= 1_000_000:
                up.append(_mbps(n, dur))
            if dur > 4:
                break
        r["upload"] = round(statistics.median(sorted(up)[-3:]), 2) if up else None
    # transmissores na rede local: tempo para abrir a conexão na porta 6668 (o SRW-004 aceita poucas conexões: 2 tentativas)
    tx = []
    for h in db.consultar("SELECT id, nome, ip FROM hubs ORDER BY nome"):
        ms = None
        if h["ip"]:
            for _ in range(2):
                t0 = time.perf_counter()
                try:
                    with socket.create_connection((h["ip"], 6668), timeout=1.5):
                        ms = round((time.perf_counter() - t0) * 1000, 1)
                        break
                except OSError:
                    time.sleep(0.3)
        tx.append({"nome": h["nome"], "ip": h["ip"], "ms": ms})
    r["transmissores"] = tx
    try:
        r["ip_local"] = coordenador.saude().get("ip")
    except Exception:  # noqa: BLE001
        r["ip_local"] = None
    return _gravar(r)
