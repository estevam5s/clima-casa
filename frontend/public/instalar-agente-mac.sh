#!/usr/bin/env bash
# Clima Escritório: instala (ou atualiza) o agente num Mac do escritório (Apple Silicon ou Intel, macOS 12 ou mais novo)
# com o código de instalação do painel. Sem sudo: o agente roda como serviço do usuário (LaunchAgent) e liga sozinho
# quando a pessoa entra no Mac.
#
# No painel: Infra → Agentes → "Gerar código de instalação" → aba Mac. No Terminal:
#   curl -fsSL https://app.zynio.com.br/instalar-agente-mac.sh -o /tmp/ia.sh && bash /tmp/ia.sh XXXX-XXXX-XXXX-XXXX
#
# O que ele faz: confere o código, baixa o sistema, recebe o .env cifrado (só o seu código decifra, aqui), instala o
# Python 3.13 à parte (uv, sem mexer no Python do macOS) e chama o instalar-servico.sh. Este arquivo não tem segredo.
set -euo pipefail
CODIGO="${1:-}"
PASTA="${2:-$HOME/ClimaEscritorio/ar-controle}"
SERVIDOR="${CLIMA_SERVIDOR:-https://app.zynio.com.br}"
titulo() { printf '\n== %s\n' "$1"; }
ok() { printf '  [ok] %s\n' "$1"; }
falha() { printf '\n  [x] %s\n' "$1" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || falha "Este instalador é do Mac. No Linux use instalar-agente.sh; no Windows, instalar-agente.ps1."
[ "$(id -u)" != 0 ] || falha "Rode sem sudo (o agente fica no seu usuário): bash $0 SEU-CODIGO"
[ -n "$CODIGO" ] || falha "Falta o código. Gere em Infra → Agentes no painel e rode: bash $0 XXXX-XXXX-XXXX-XXXX"
command -v python3 >/dev/null && python3 -c 'import venv' 2>/dev/null || falha "Falta o Python do macOS. Rode 'xcode-select --install', aceite a instalação e rode este comando de novo."
ok "macOS $(sw_vers -productVersion) ($(uname -m))"

titulo "1/5 Conferindo o código"
NORM="$(printf '%s' "$CODIGO" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9')"
[ "${#NORM}" = 16 ] || falha "O código tem 16 letras e números (ex.: ABCD-EFGH-JKMN-PQRS). Copie de novo do painel."
ID="$(printf '%s' "$NORM" | shasum -a 256 | cut -c1-16)"
PROVA="$(printf '%s' "$NORM:prova" | shasum -a 256 | cut -d' ' -f1)"
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
PACOTE_URL="$(sed -n 1p "$TMP/pacote.txt")"; PACOTE_PASTA="$(sed -n 2p "$TMP/pacote.txt")"

titulo "2/5 Baixando o sistema"
[ -n "$PACOTE_URL" ] || falha "O painel não tem o pacote do código agora. Tente de novo mais tarde."
curl -fsSL "$PACOTE_URL" -o "$TMP/codigo.zip" || falha "Não deu para baixar o pacote (o link vale 2 minutos: gere outro código)."
unzip -q "$TMP/codigo.zip" -d "$TMP/x"
ORIGEM="$TMP/x/$PACOTE_PASTA"
[ -f "$ORIGEM/backend/app/main.py" ] || falha "O pacote baixado não tem o sistema completo."
mkdir -p "$PASTA"
( cd "$ORIGEM" && tar --exclude=./.venv --exclude=./data -cf - . ) | ( cd "$PASTA" && tar -xf - )
ok "sistema em $PASTA"

titulo "3/5 Python 3.13 (à parte, pelo uv)"
python3 -m venv "$TMP/boot" && "$TMP/boot/bin/pip" install -q --retries 8 --timeout 90 uv
export PATH="$TMP/boot/bin:$PATH"
uv python install 3.13 >/dev/null
[ -x "$PASTA/.venv/bin/python" ] || uv venv -q --python 3.13 --seed "$PASTA/.venv"
"$PASTA/.venv/bin/python" -m pip install -q --retries 8 --timeout 90 cryptography
ok "Python pronto"

titulo "4/5 Recebendo as chaves (.env)"
"$PASTA/.venv/bin/python" "$PASTA/backend/convite_env.py" "$TMP/pacote.json" "$CODIGO" "$PASTA" || falha "Não deu para decifrar as chaves com esse código. Gere outro no painel."
chmod 600 "$PASTA/.env"
ok ".env gravado e protegido (só você lê)"

titulo "5/5 Instalando o serviço"
chmod +x "$PASTA/instalar-servico.sh"
bash "$PASTA/instalar-servico.sh"
printf '\nPronto. Volte ao painel (Infra → Agentes): este Mac aparece em alguns segundos.\n'
printf 'O Mac precisa ficar ligado e sem dormir (Ajustes → Bateria/Energia → impedir repouso automático).\n'
