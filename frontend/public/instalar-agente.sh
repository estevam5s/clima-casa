#!/usr/bin/env bash
# Clima Escritório: instala (ou atualiza) o agente em qualquer Linux de 64 bits (x86_64 ou ARM64) com o código de
# instalação do painel: Raspberry Pi 3B/4/5, mini PC, PC ou servidor com Debian, Ubuntu, Fedora, RHEL, Rocky, Alma,
# CentOS Stream, openSUSE ou Arch. Com --docker roda num contêiner (servidor sem systemd ou que só aceita Docker).
#
# No painel: Infra → Agentes → "Gerar código de instalação". Depois, no terminal do Raspberry/Linux:
#   curl -fsSL https://app.zynio.com.br/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh XXXX-XXXX-XXXX-XXXX
#   ... sudo bash /tmp/ia.sh XXXX-XXXX-XXXX-XXXX --docker      (no lugar do serviço systemd, um contêiner Docker)
#
# O que ele faz: confere o código, baixa o sistema, recebe o .env cifrado (só o seu código decifra, aqui), instala o
# Python 3.13 (pelo uv, sem mexer no Python do sistema) e chama o instalar-linux.sh (serviço systemd que liga sozinho).
# Este arquivo não tem segredo.
set -euo pipefail
CODIGO=""; PASTA="/opt/clima-escritorio/ar-controle"; MODO=systemd
for a in "$@"; do
  case "$a" in
    --docker) MODO=docker ;;
    --pasta=*) PASTA="${a#--pasta=}" ;;
    -*) printf 'Opção desconhecida: %s\n' "$a" >&2; exit 1 ;;
    *) if [ -z "$CODIGO" ]; then CODIGO="$a"; else PASTA="$a"; fi ;;
  esac
done
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

# pacotes do sistema pelo gerenciador que existir (Debian/Ubuntu/Raspberry Pi OS, Fedora/RHEL/Rocky/Alma, openSUSE, Arch)
instalar_pacotes() {
  if command -v apt-get >/dev/null; then apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq curl python3 python3-venv unzip
  elif command -v dnf >/dev/null; then dnf install -y -q curl python3 unzip
  elif command -v yum >/dev/null; then yum install -y -q curl python3 unzip
  elif command -v zypper >/dev/null; then zypper --non-interactive install -y curl python3 unzip
  elif command -v pacman >/dev/null; then pacman -Sy --noconfirm --needed curl python unzip
  elif command -v apk >/dev/null; then falha "Alpine (musl) não tem as bibliotecas prontas do agente. Use Debian/Ubuntu ou rode com --docker."
  else falha "Não achei apt, dnf, yum, zypper nem pacman. Instale curl, python3 e unzip e rode de novo (ou use --docker)."
  fi
}
[ -r /etc/os-release ] && . /etc/os-release && ok "sistema: ${PRETTY_NAME:-Linux} ($(uname -m))"

titulo "1/5 Conferindo o código"
for p in curl python3 unzip; do command -v "$p" >/dev/null || { instalar_pacotes; break; }; done
python3 -c 'import venv, ensurepip' 2>/dev/null || { command -v apt-get >/dev/null && apt-get install -y -qq python3-venv; } || true
python3 -c 'import venv' 2>/dev/null || falha "O Python deste sistema não tem o módulo venv. Instale o pacote python3-venv (ou python3-virtualenv) e rode de novo."
if [ "$MODO" = docker ]; then command -v docker >/dev/null || falha "Docker não encontrado. Instale (docs.docker.com/engine/install) ou rode sem --docker para usar o serviço do sistema."; fi
if [ "$MODO" = systemd ] && ! command -v systemctl >/dev/null; then falha "Este Linux não usa systemd. Rode de novo com --docker (precisa do Docker instalado)."; fi
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

titulo "Rede: este computador alcança o banco e o painel?"
# redes de órgão público costumam bloquear a porta 6543 (Postgres) ou interceptar o HTTPS; melhor saber agora
"$PASTA/.venv/bin/python" - "$PASTA/.env" "$SERVIDOR" <<'PY' || true
import socket, ssl, sys, urllib.request
env = dict(l.split("=", 1) for l in open(sys.argv[1], encoding="utf-8").read().splitlines() if "=" in l and not l.startswith("#"))
host, porta = env.get("SUPABASE_DB_HOST", ""), int(env.get("SUPABASE_DB_PORT", "6543") or 6543)
def tcp(h, p):
    try: socket.create_connection((h, p), timeout=6).close(); return True
    except OSError: return False
if host:
    print(f"  [{'ok' if tcp(host, porta) else 'x'}] banco ({host.split('.')[0]}…:{porta})" + ("" if tcp(host, porta) else
          " BLOQUEADO: peça à TI para liberar a saída TCP 6543 para *.pooler.supabase.com; sem isso o agente não funciona aqui"))
try:
    urllib.request.urlopen(sys.argv[2] + "/saude", timeout=8, context=ssl.create_default_context()); print("  [ok] painel (HTTPS)")
except ssl.SSLError:
    print("  [x] o certificado do painel foi trocado no caminho (inspeção SSL do firewall): peça à TI para liberar zynio.com.br da inspeção")
except Exception as e:
    print(f"  [x] painel sem resposta ({e.__class__.__name__}): confira proxy/firewall de saída 443")
PY

titulo "5/5 Instalando o agente ($MODO)"
if [ "$MODO" = docker ]; then
  # contêiner com o Python oficial, código e .env montados da pasta; rede do host para alcançar os transmissores (6668 e UDP 6666/6667)
  cat > "$PASTA/docker-compose.agente.yml" <<YML
# Gerado pelo instalar-agente.sh. Atualizar: gere um código novo e rode o instalador com --docker de novo.
services:
  agente:
    image: python:3.13-slim
    container_name: clima-escritorio-agente
    restart: unless-stopped
    network_mode: host
    working_dir: /app/backend
    environment: { CLIMA_PAPEL: agente, PYTHONUTF8: "1", PYTHONUNBUFFERED: "1" }
    volumes: [ "$PASTA:/app" ]
    command: sh -c "python -m venv /app/.venv-docker && /app/.venv-docker/bin/pip install -q -r /app/backend/requirements.txt && exec /app/.venv-docker/bin/python -m app.main"
YML
  ( cd "$PASTA" && docker compose -f docker-compose.agente.yml up -d --force-recreate ) || falha "O Docker não subiu o contêiner: docker compose -f $PASTA/docker-compose.agente.yml logs"
  ok "contêiner clima-escritorio-agente no ar (reinicia sozinho; logs: docker logs -f clima-escritorio-agente)"
else
  chmod +x "$PASTA/instalar-linux.sh"
  SUDO_USER="$USUARIO" bash "$PASTA/instalar-linux.sh"
fi
printf '\nPronto. Volte ao painel (Infra → Agentes): este computador aparece em alguns segundos.\n'
printf 'Para atualizar no futuro: gere um código novo e rode o mesmo comando.\n'
