"""Decifra o .env recebido pelo código de instalação (roda no PC novo, antes de existir .env).

Uso: python convite_env.py <arquivo-json-do-resgate> <código> <pasta-de-destino>
Não importa nada do app (o .env ainda não existe). Mesma derivação de backend/app/convite.py.
"""
import base64
import hashlib
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def normalizar(codigo: str) -> str:
    return "".join(c for c in (codigo or "").upper() if c.isalnum())


def main():
    pacote, codigo, destino = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    d = json.loads(pacote.read_text(encoding="utf-8"))
    chave = hashlib.scrypt(normalizar(codigo).encode(), salt=base64.b64decode(d["sal"]), n=2 ** 15, r=8, p=1,
                           maxmem=64 * 1024 * 1024, dklen=32)
    try:
        conteudo = AESGCM(chave).decrypt(base64.b64decode(d["nonce"]), base64.b64decode(d["cifrado"]), d["id"].encode())
    except Exception:  # noqa: BLE001
        print("Código não confere com o pacote recebido. Gere um código novo no painel.", file=sys.stderr)
        sys.exit(2)
    alvo = destino / ".env"
    alvo.write_bytes(conteudo)
    linhas = sum(1 for l in conteudo.decode("utf-8", "replace").splitlines() if "=" in l and not l.startswith("#"))
    print(f".env gravado em {alvo} ({linhas} variáveis)")


if __name__ == "__main__":
    main()
