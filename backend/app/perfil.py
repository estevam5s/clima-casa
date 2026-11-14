"""Perfil do administrador: nome, cargo, telefone, bio e foto.

A foto vem de upload (data URL) ou de um link qualquer. Em ambos os casos o servidor decodifica a imagem com o
Pillow, recorta em quadrado, reduz para 256 px e regrava como WEBP, então nada do arquivo original (metadados,
scripts em SVG etc.) chega ao navegador. O link é baixado com proteção contra SSRF: só http/https, sem IP interno,
redirecionamentos checados um a um, tempo e tamanho limitados. Se o link for uma página (HTML), usa a imagem de
pré-visualização dela (og:image / twitter:image / ícone).
"""
import base64
import io
import ipaddress
import re
import socket
from urllib.parse import urljoin, urlparse

import httpx

from . import db

PADRAO = {"nome": "", "cargo": "", "telefone": "", "bio": "", "avatar": ""}
MAX_BYTES = 8 * 1024 * 1024
_RE_META = re.compile(r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::url)?|twitter:image)["\'][^>]*>', re.I)
_RE_CONTENT = re.compile(r'content=["\']([^"\']+)["\']', re.I)
_RE_ICONE = re.compile(r'<link[^>]+rel=["\'][^"\']*(?:apple-touch-icon|icon)[^"\']*["\'][^>]*>', re.I)
_RE_HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
_RE_IMG = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)


def ler() -> dict:
    return {**PADRAO, **(db.cfg("perfil_admin") or {})}


def salvar(dados: dict) -> dict:
    p = ler()
    for k in ("nome", "cargo", "telefone", "bio"):
        if k in dados and dados[k] is not None:
            p[k] = str(dados[k]).strip()
    db.set_cfg("perfil_admin", p)
    return p


def _processar(bruto: bytes) -> str:
    from PIL import Image, ImageOps
    if len(bruto) > MAX_BYTES:
        raise ValueError("A imagem passa de 8 MB.")
    try:
        im = Image.open(io.BytesIO(bruto))
        im.load()
    except Exception:  # noqa: BLE001
        raise ValueError("Não consegui ler esse arquivo como imagem (use PNG, JPG, WEBP, GIF, BMP ou TIFF).")
    if im.width * im.height > 40_000_000:
        raise ValueError("Imagem grande demais.")
    im = ImageOps.exif_transpose(im)
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    lado = min(im.size)
    x, y = (im.width - lado) // 2, (im.height - lado) // 2
    im = im.crop((x, y, x + lado, y + lado)).resize((256, 256), Image.LANCZOS)
    saida = io.BytesIO()
    im.save(saida, "WEBP", quality=86, method=6)
    return "data:image/webp;base64," + base64.b64encode(saida.getvalue()).decode()


def _checar_host(url: str):
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise ValueError("Use um link http ou https.")
    try:
        enderecos = {i[4][0] for i in socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == "https" else 80))}
    except socket.gaierror:
        raise ValueError("Não encontrei esse endereço.")
    for e in enderecos:
        ip = ipaddress.ip_address(e.split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise ValueError("Esse link aponta para uma rede interna e foi recusado.")


def _baixar(url: str) -> tuple[bytes, str, str]:
    """Baixa com redirecionamentos checados (cada destino passa pelo filtro de rede interna)."""
    with httpx.Client(timeout=8, follow_redirects=False, headers={"User-Agent": "Mozilla/5.0 (ClimaEscritorio avatar)", "Accept": "image/*,text/html;q=0.8,*/*;q=0.5"}) as c:
        for _ in range(4):
            _checar_host(url)
            with c.stream("GET", url) as r:
                if r.status_code in (301, 302, 303, 307, 308) and r.headers.get("location"):
                    url = urljoin(url, r.headers["location"])
                    continue
                if r.status_code >= 400:
                    raise ValueError(f"O link respondeu com erro {r.status_code}.")
                corpo = bytearray()
                for parte in r.iter_bytes():
                    corpo += parte
                    if len(corpo) > MAX_BYTES:
                        raise ValueError("O arquivo do link passa de 8 MB.")
                return bytes(corpo), r.headers.get("content-type", ""), url
    raise ValueError("Redirecionamentos demais.")


def importar(url: str) -> str:
    url = url.strip()
    if url.startswith("data:image/"):
        return de_data_url(url)
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    corpo, tipo, final = _baixar(url)
    if "html" in tipo or corpo[:200].lstrip().lower().startswith((b"<!doctype html", b"<html")):
        texto = corpo[:400_000].decode("utf-8", "ignore")
        achado = None
        for padrao, attr in ((_RE_META, _RE_CONTENT), (_RE_ICONE, _RE_HREF)):
            m = padrao.search(texto)
            if m and attr.search(m.group(0)):
                achado = attr.search(m.group(0)).group(1)
                break
        if not achado:
            m = _RE_IMG.search(texto)
            achado = m.group(1) if m else None
        if not achado:
            raise ValueError("Esse link é uma página sem imagem de pré-visualização. Cole o link direto da imagem.")
        corpo, tipo, _ = _baixar(urljoin(final, achado.replace("&amp;", "&")))
    if "svg" in tipo or corpo[:300].lstrip().startswith((b"<svg", b"<?xml")):
        raise ValueError("SVG não é aceito como foto. Use PNG, JPG ou WEBP.")
    return _processar(corpo)


def de_data_url(texto: str) -> str:
    m = re.match(r"^data:image/[\w.+-]+;base64,(.+)$", texto.strip(), re.S)
    if not m:
        raise ValueError("Arquivo inválido.")
    try:
        bruto = base64.b64decode(m.group(1), validate=False)
    except Exception:  # noqa: BLE001
        raise ValueError("Arquivo inválido.")
    if bruto[:300].lstrip().startswith((b"<svg", b"<?xml")):
        raise ValueError("SVG não é aceito como foto. Use PNG, JPG ou WEBP.")
    return _processar(bruto)


def definir_avatar(avatar: str) -> dict:
    p = ler()
    p["avatar"] = avatar
    db.set_cfg("perfil_admin", p)
    return p
