#!/bin/bash
# Instala o agente do Clima Casa como serviço do macOS (inicia sozinho ao entrar no Mac e reinicia se cair).
#
# O macOS não deixa serviços de fundo lerem ~/Documents, então o agente roda de uma cópia em
# ~/Library/Application Support/ClimaCasa. Rode este script de novo depois de atualizar o código.
#
#   ./instalar-servico.sh            instala ou atualiza
#   ./instalar-servico.sh remover    desinstala
#   ./instalar-servico.sh status     mostra se está rodando
set -e
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
DESTINO="$HOME/Library/Application Support/ClimaCasa"
LOG="$HOME/Library/Logs/ClimaCasa.log"
ROTULO="com.climacasa.servidor"
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
UID_ATUAL="$(id -u)"

if [ "$1" = "remover" ]; then
  launchctl bootout "gui/$UID_ATUAL" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"; echo "Serviço removido (a cópia em $DESTINO foi mantida)."; exit 0
fi
if [ "$1" = "status" ]; then
  launchctl print "gui/$UID_ATUAL/$ROTULO" 2>/dev/null | grep -E "state|pid|last exit" || echo "Não instalado."
  curl -s -m 3 -o /dev/null -w "HTTP local: %{http_code}\n" http://127.0.0.1:8090/saude || true
  exit 0
fi

[ -f "$ORIGEM/.env" ] || { echo "Falta o arquivo .env em $ORIGEM"; exit 1; }
[ -f "$ORIGEM/backend/static/index.html" ] || (cd "$ORIGEM/frontend" && npm install --silent && npm run build)

echo "Copiando o agente para $DESTINO…"
mkdir -p "$DESTINO/data" "$(dirname "$LOG")"
rsync -a --delete --exclude "__pycache__" "$ORIGEM/backend/" "$DESTINO/backend/"
install -m 600 "$ORIGEM/.env" "$DESTINO/.env"

if [ ! -x "$DESTINO/.venv/bin/python" ]; then
  echo "Criando ambiente Python 3.13…"
  if command -v uv >/dev/null; then uv venv -q "$DESTINO/.venv" --python 3.13
  else python3.13 -m venv "$DESTINO/.venv"; fi
fi
if command -v uv >/dev/null; then uv pip install -q --python "$DESTINO/.venv/bin/python" -r "$DESTINO/backend/requirements.txt"
else "$DESTINO/.venv/bin/pip" install -q -r "$DESTINO/backend/requirements.txt"; fi

HOST="${CLIMA_HOST:-127.0.0.1}"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$ROTULO</string>
  <key>ProgramArguments</key><array>
    <string>$DESTINO/.venv/bin/python</string><string>-m</string><string>app.main</string>
  </array>
  <key>WorkingDirectory</key><string>$DESTINO/backend</string>
  <key>EnvironmentVariables</key><dict>
    <key>CLIMA_HOST</key><string>$HOST</string>
    <key>CLIMA_PORTA</key><string>8090</string>
    <key>PYTHONUNBUFFERED</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PL
launchctl bootout "gui/$UID_ATUAL" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$UID_ATUAL" "$PLIST"
echo "Agente instalado. Painel local: http://localhost:8090 · log: $LOG"
