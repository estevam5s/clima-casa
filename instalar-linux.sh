#!/usr/bin/env bash
# Instala o agente do Clima Escritório num Linux que fica no escritório (Raspberry Pi 3B/4/5 com o sistema de 64 bits, mini PC, PC com Ubuntu),
# no mesmo Wi-Fi 2,4 GHz do transmissor. Roda como serviço systemd e reinicia sozinho.
#   sudo ./instalar-linux.sh            instala ou atualiza
#   sudo ./instalar-linux.sh status     mostra se está rodando
#   sudo ./instalar-linux.sh remover    tira o serviço
# Antes: copie o .env do Mac para esta pasta (pendrive ou rede local; nunca por e-mail ou chat).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")" && pwd)"
SERVICO=clima-escritorio-agente
USUARIO="${SUDO_USER:-$(whoami)}"
case "${1:-instalar}" in
  status) systemctl --no-pager status "$SERVICO" | head -15; journalctl -u "$SERVICO" -n 15 --no-pager; exit 0 ;;
  remover) systemctl disable --now "$SERVICO" 2>/dev/null || true; rm -f "/etc/systemd/system/$SERVICO.service"; systemctl daemon-reload; echo "Serviço removido."; exit 0 ;;
esac
[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }
[ -f "$RAIZ/backend/app/main.py" ] || { echo "Rode dentro da pasta ar-controle."; exit 1; }
[ -f "$RAIZ/.env" ] || { echo "Falta o .env: copie o do Mac para $RAIZ."; exit 1; }
chmod 600 "$RAIZ/.env"   # só o dono do arquivo lê as chaves
echo "== Python e dependências"
if ! command -v python3 >/dev/null; then apt-get update -qq && apt-get install -y -qq python3 python3-venv python3-pip; fi
python3 -c 'import sys; assert sys.version_info >= (3, 11), "precisa de Python 3.11 ou mais novo"'
[ -x "$RAIZ/.venv/bin/python" ] || sudo -u "$USUARIO" python3 -m venv "$RAIZ/.venv"
sudo -u "$USUARIO" "$RAIZ/.venv/bin/pip" install -q --retries 8 --timeout 90 --upgrade pip
sudo -u "$USUARIO" "$RAIZ/.venv/bin/pip" install -q --retries 8 --timeout 90 -r "$RAIZ/backend/requirements.txt"
mkdir -p "$RAIZ/data" && chown "$USUARIO" "$RAIZ/data"
echo "== Serviço systemd"
cat > "/etc/systemd/system/$SERVICO.service" <<UNIT
[Unit]
Description=Agente do Clima Escritório (fila de comandos, Alexa, agenda)
After=network-online.target
Wants=network-online.target

[Service]
User=$USUARIO
WorkingDirectory=$RAIZ/backend
Environment=CLIMA_PAPEL=agente
Environment=PYTHONUTF8=1
ExecStart=$RAIZ/.venv/bin/python -m app.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now "$SERVICO"
sleep 10
curl -fsS -o /dev/null http://127.0.0.1:8090/saude && echo "Agente respondendo em http://127.0.0.1:8090" || echo "Ainda não respondeu: sudo ./instalar-linux.sh status"
echo "Pronto. No painel: Infra → Agentes mostra este computador como principal ou reserva."
