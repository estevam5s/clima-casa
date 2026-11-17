#!/usr/bin/env bash
# Clima Escritório: instala (ou atualiza) o agente num Linux do escritório (Raspberry Pi 3B/4/5 com o sistema de
# 64 bits, mini PC, Ubuntu/Debian) com o código de instalação do painel.
#
# No painel: Infra → Agentes → "Gerar código de instalação". Depois, no terminal do Raspberry/Linux:
#   curl -fsSL https://app.zynio.com.br/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh XXXX-XXXX-XXXX-XXXX
#
# O que ele faz: confere o código, baixa o sistema, recebe o .env cifrado (só o seu código decifra, aqui), instala o
# Python 3.13 (pelo uv, sem mexer no Python do sistema) e chama o instalar-linux.sh (serviço systemd que liga sozinho).
# Este arquivo não tem segredo.
set -euo pipefail
CODIGO="${1:-}"
PASTA="${2:-/opt/clima-escritorio/ar-controle}"
SERVIDOR="${CLIMA_SERVIDOR:-https://app.zynio.com.br}"
titulo() { printf '\n== %s\n' "$1"; }
ok() { printf '  [ok] %s\n' "$1"; }
falha() { printf '\n  [x] %s\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || falha "Rode com sudo: sudo bash $0 SEU-CODIGO"
[ -n "$CODIGO" ] || falha "Falta o código. Gere em Infra → Agentes no painel e rode: sudo bash $0 XXXX-XXXX-XXXX-XXXX"
case "$(uname -m)" in
  aarch64|x86_64) ;;
  armv7l|armv6l) falha "Este sistema é de 32 bits. Instale o Raspberry Pi OS (64-bit) pelo Raspberry Pi Imager: o Pi 3B, 4 e 5 rodam. No de 32 bits faltam as bibliotecas prontas do agente." ;;
  *) falha "Processador $(uname -m) não testado. Use um Raspberry Pi com o sistema de 64 bits ou um PC x86_64." ;;
esac
USUARIO="${SUDO_USER:-root}"

titulo "1/5 Conferindo o código"
for p in curl python3 unzip; do command -v "$p" >/dev/null || { apt-get update -qq && apt-get install -y -qq curl python3 python3-venv unzip; break; }; done
python3 -c 'import venv' 2>/dev/null || apt-get install -y -qq python3-venv
NORM="$(printf '%s' "$CODIGO" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9')"
[ "${#NORM}" = 16 ] || falha "O código tem 16 letras e números (ex.: ABCD-EFGH-JKMN-PQRS). Copie de novo do painel."
ID="$(printf '%s' "$NORM" | sha256sum | cut -c1-16)"
PROVA="$(printf '%s' "$NORM:prova" | sha256sum | cut -d' ' -f1)"
TMP="$(mktemp -d /tmp/clima-convite-XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
CODIGO_HTTP="$(curl -sS -o "$TMP/resp.json" -w '%{http_code}' -X POST "$SERVIDOR/api/agentes/convite/resgatar" \
  -H 'Content-Type: application/json' -d "{\"id\":\"$ID\",\"prova\":\"$PROVA\"}")" || falha "Sem conexão com $SERVIDOR."
if [ "$CODIGO_HTTP" != 200 ]; then
  falha "O painel recusou o código: $(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("detail","erro"))' "$TMP/resp.json" 2>/dev/null || echo "HTTP $CODIGO_HTTP")"
fi
ok "código aceito (ele não vale mais: é de uso único)"
python3 - "$TMP" <<'PY'
import json, sys, pathlib
d = pathlib.Path(sys.argv[1]); r = json.loads((d / "resp.json").read_text())
(d / "pacote.json").write_text(json.dumps({k: r[k] for k in ("sal", "nonce", "cifrado", "id")}))
p = r.get("pacote") or {}
(d / "pacote.txt").write_text(f"{p.get('url','')}\n{p.get('pasta','')}\n{p.get('arquivo','')}\n")
PY
PACOTE_URL="$(sed -n 1p "$TMP/pacote.txt")"; PACOTE_PASTA="$(sed -n 2p "$TMP/pacote.txt")"; PACOTE_ARQ="$(sed -n 3p "$TMP/pacote.txt")"

titulo "2/5 Baixando o sistema"
[ -n "$PACOTE_URL" ] || falha "O painel não tem o pacote do código agora. Baixe em Apps → Código-fonte, extraia em $PASTA e rode o instalar-linux.sh."
curl -fsSL "$PACOTE_URL" -o "$TMP/codigo.zip" || falha "Não deu para baixar o pacote (o link vale 2 minutos: gere outro código)."
unzip -q "$TMP/codigo.zip" -d "$TMP/x"
ORIGEM="$TMP/x/$PACOTE_PASTA"
[ -f "$ORIGEM/backend/app/main.py" ] || falha "O pacote baixado não tem o sistema completo."
# a pasta do serviço é do root (o serviço roda como $USUARIO, que só lê o código e escreve em data/)
mkdir -p "$PASTA"; chown root:root "$(dirname "$PASTA")" "$PASTA"; chmod 755 "$(dirname "$PASTA")" "$PASTA"
# atualiza os arquivos e guarda o que é deste computador (.venv, data; o .env é substituído logo abaixo)
( cd "$ORIGEM" && tar --exclude=./.venv --exclude=./data -cf - . ) | ( cd "$PASTA" && tar -xf - )
ok "sistema em $PASTA ($PACOTE_ARQ)"

titulo "3/5 Python 3.13"
if [ ! -x "$PASTA/.venv/bin/python" ] || ! "$PASTA/.venv/bin/python" -c 'import sys; assert sys.version_info >= (3, 12)' 2>/dev/null; then
  # o Raspberry Pi OS vem com Python 3.11 e o agente pede 3.12+: o uv instala um Python à parte, sem mexer no do sistema
  python3 -m venv "$TMP/boot" && "$TMP/boot/bin/pip" install -q --retries 8 --timeout 90 uv
  export UV_PYTHON_INSTALL_DIR=/opt/clima-escritorio/python
  "$TMP/boot/bin/uv" python install 3.13
  rm -rf "$PASTA/.venv"; "$TMP/boot/bin/uv" venv -q --python 3.13 --seed "$PASTA/.venv"
fi
"$PASTA/.venv/bin/python" -m pip install -q --retries 8 --timeout 90 --upgrade pip cryptography
ok "Python pronto ($("$PASTA/.venv/bin/python" --version))"

# o instalar-linux.sh roda o pip como $USUARIO: a .venv é dele
chown -R "$USUARIO" "$PASTA/.venv"; mkdir -p "$PASTA/data"; chown "$USUARIO" "$PASTA/data"

titulo "4/5 Recebendo as chaves (.env)"
"$PASTA/.venv/bin/python" "$PASTA/backend/convite_env.py" "$TMP/pacote.json" "$CODIGO" "$PASTA" || falha "Não deu para decifrar as chaves com esse código. Gere outro no painel."
chown "$USUARIO" "$PASTA/.env"; chmod 600 "$PASTA/.env"
ok ".env gravado e protegido (só $USUARIO lê)"

titulo "5/5 Instalando o agente"
chmod +x "$PASTA/instalar-linux.sh"
SUDO_USER="$USUARIO" bash "$PASTA/instalar-linux.sh"
printf '\nPronto. Volte ao painel (Infra → Agentes): este computador aparece em alguns segundos.\n'
printf 'Para atualizar no futuro: gere um código novo e rode o mesmo comando.\n'
