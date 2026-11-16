"""Código de instalação de um novo computador com o agente (ex.: o PC Windows do escritório).

O agente (que tem o .env) gera um código de uso único e grava no banco só o .env CIFRADO com uma chave derivada do
código (scrypt + AES-GCM). O código aparece uma vez na tela do dono; o banco guarda o id e o hash da "prova", nunca o
código. No PC, o instalador manda o id e a prova, recebe o conteúdo cifrado e decifra localmente com o código
(backend/convite_env.py). Vale 30 min e some no primeiro resgate.
"""
import base64
import hashlib
import json
import os
import secrets

from . import db

ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"   # sem 0/O, 1/I/L: dá para ditar e digitar sem erro
VALIDADE = 30 * 60
PREFIXO = "agente_convite:"


def normalizar(codigo: str) -> str:
    return "".join(c for c in (codigo or "").upper() if c.isalnum())


def ident(codigo: str) -> str:
    return hashlib.sha256(normalizar(codigo).encode()).hexdigest()[:16]


def prova(codigo: str) -> str:
    return hashlib.sha256((normalizar(codigo) + ":prova").encode()).hexdigest()


def chave(codigo: str, sal: bytes) -> bytes:
    return hashlib.scrypt(normalizar(codigo).encode(), salt=sal, n=2 ** 15, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)


def criar(criado_por: str = "") -> dict:
    """Roda NO AGENTE (precisa do .env). Devolve o código uma única vez."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    arq = db.RAIZ / ".env"
    if not arq.exists():
        raise RuntimeError("Este computador não tem o arquivo .env para repassar.")
    limpar_vencidos()
    codigo = "-".join("".join(secrets.choice(ALFABETO) for _ in range(4)) for _ in range(4))
    sal, nonce, cid = os.urandom(16), os.urandom(12), ident(codigo)
    cifrado = AESGCM(chave(codigo, sal)).encrypt(nonce, arq.read_bytes(), cid.encode())
    expira = db.agora() + VALIDADE
    db.set_cfg(PREFIXO + cid, {"sal": base64.b64encode(sal).decode(), "nonce": base64.b64encode(nonce).decode(),
                               "cifrado": base64.b64encode(cifrado).decode(), "prova": hashlib.sha256(prova(codigo).encode()).hexdigest(),
                               "expira": expira, "criado_por": criado_por})
    db.registrar("sistema", "Código de instalação de agente gerado", detalhe=f"vale 30 min · por {criado_por or 'dono'}")
    return {"codigo": codigo, "id": cid, "expira": expira}


def limpar_vencidos():
    for r in db.consultar("SELECT chave, valor FROM config WHERE chave LIKE ?", (PREFIXO + "%",)):
        try:
            if int(json.loads(r["valor"]).get("expira") or 0) < db.agora():
                db.executar("DELETE FROM config WHERE chave = ?", (r["chave"],))
        except (ValueError, TypeError):
            db.executar("DELETE FROM config WHERE chave = ?", (r["chave"],))


def resgatar(cid: str, prova_recebida: str) -> dict | str:
    """Roda na nuvem. Devolve o conteúdo cifrado (uso único) ou um motivo: 'nao_existe', 'vencido', 'prova'."""
    r = db.um("SELECT valor FROM config WHERE chave = ?", (PREFIXO + cid,))
    if not r:
        return "nao_existe"
    c = json.loads(r["valor"])
    if int(c.get("expira") or 0) < db.agora():
        db.executar("DELETE FROM config WHERE chave = ?", (PREFIXO + cid,))
        return "vencido"
    if not secrets.compare_digest(hashlib.sha256(prova_recebida.encode()).hexdigest(), c.get("prova", "")):
        return "prova"
    apagado = db.consultar("DELETE FROM config WHERE chave = ? RETURNING chave", (PREFIXO + cid,))   # uso único, sem corrida
    if not apagado:
        return "nao_existe"
    db.registrar("sistema", "Código de instalação de agente usado", detalhe=f"id {cid}")
    return {"sal": c["sal"], "nonce": c["nonce"], "cifrado": c["cifrado"], "id": cid}


def pendentes() -> list[dict]:
    out = []
    for r in db.consultar("SELECT chave, valor FROM config WHERE chave LIKE ?", (PREFIXO + "%",)):
        try:
            c = json.loads(r["valor"])
        except ValueError:
            continue
        if int(c.get("expira") or 0) >= db.agora():
            out.append({"id": r["chave"][len(PREFIXO):], "expira": c["expira"], "criado_por": c.get("criado_por", "")})
    return out
