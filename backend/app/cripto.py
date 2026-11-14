"""Criptografia em repouso: AES-256-GCM (autenticada) para segredos guardados no banco.

Formato: "enc:v1:" + base64(nonce de 12 bytes + texto cifrado + tag de 16 bytes).
A chave-mestra (32 bytes, base64) fica só em CLIMA_CHAVE_MESTRA (.env do agente e variável da Vercel).
Valores sem o prefixo são tratados como texto puro (compatível com dados antigos; a migração os cifra).
"""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIXO = "enc:v1:"
_aes: AESGCM | None = None


def _cifra() -> AESGCM:
    global _aes
    if _aes is None:
        from . import db
        bruta = db.ENV.get("CLIMA_CHAVE_MESTRA") or os.environ.get("CLIMA_CHAVE_MESTRA")
        if not bruta:
            raise RuntimeError("CLIMA_CHAVE_MESTRA não configurada.")
        chave = base64.b64decode(bruta)
        if len(chave) != 32:
            raise RuntimeError("CLIMA_CHAVE_MESTRA precisa ter 32 bytes (AES-256).")
        _aes = AESGCM(chave)
    return _aes


def disponivel() -> bool:
    try:
        _cifra(); return True
    except Exception:  # noqa: BLE001
        return False


def cifrar(texto: str | None, contexto: str = "") -> str | None:
    """`contexto` entra como dado associado (AAD): um valor cifrado não pode ser trocado de campo."""
    if texto is None or texto == "" or str(texto).startswith(PREFIXO) or not disponivel():
        return texto
    nonce = os.urandom(12)
    dado = _cifra().encrypt(nonce, str(texto).encode(), contexto.encode() or None)
    return PREFIXO + base64.b64encode(nonce + dado).decode()


def decifrar(valor: str | None, contexto: str = "") -> str | None:
    if not valor or not str(valor).startswith(PREFIXO):
        return valor
    bruto = base64.b64decode(str(valor)[len(PREFIXO):])
    return _cifra().decrypt(bruto[:12], bruto[12:], contexto.encode() or None).decode()


def cifrado(valor) -> bool:
    return isinstance(valor, str) and valor.startswith(PREFIXO)


def migrar() -> dict:
    """Cifra o que ainda estiver em texto puro (Local Keys e configurações sensíveis). Idempotente."""
    from . import db
    feitos = {"hubs": 0, "config": 0}
    if not disponivel():
        return feitos
    for h in db.consultar("SELECT id, local_key FROM hubs"):
        if h["local_key"] and not cifrado(h["local_key"]):
            db.executar("UPDATE hubs SET local_key = ? WHERE id = ?", (cifrar(h["local_key"], "hub:local_key"), h["id"]))
            feitos["hubs"] += 1
    for chave in db.CHAVES_SENSIVEIS:
        linha = db.um("SELECT valor FROM config WHERE chave = ?", (chave,))
        if linha and not cifrado(db.json.loads(linha["valor"])):
            db.set_cfg(chave, db.cfg(chave))
            feitos["config"] += 1
    return feitos
