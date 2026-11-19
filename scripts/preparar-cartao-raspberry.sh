#!/usr/bin/env bash
# Prepara o microSD do Raspberry Pi (3B, 4 ou 5) como agente fixo do Clima Escritório, no Mac.
#
#   ./scripts/preparar-cartao-raspberry.sh [imagem.img.xz]
#
# O que faz (pede confirmação antes de apagar):
#  1. Usa a imagem oficial do Raspberry Pi OS Lite 64-bit (baixa e confere o SHA-256 se não for passada).
#  2. Mostra só os discos EXTERNOS; você digita qual é o cartão; apaga e grava a imagem (pede a senha do Mac: sudo).
#  3. Na partição de boot: user-data (nome clima-agente, usuário clima só com a chave ~/.ssh/clima-agente, SSH, fuso),
#     network-config (Wi-Fi 2,4 GHz do escritório: você digita o nome e a senha aqui, a senha não aparece), o código do
#     agente e o .env (no 1º boot ele vai para /opt com permissão 600 e é apagado do cartão).
#  4. Ejeta o cartão. Depois: cartão no Raspberry, ligar na tomada, esperar ~10 min, Infra → Agentes → "Preferir este".
# Não imprime segredos. Não grava em disco interno.
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
URL_LATEST=https://downloads.raspberrypi.com/raspios_lite_arm64_latest
titulo() { printf '\n== %s\n' "$1"; }
falha() { printf '\n[x] %s\n' "$1" >&2; exit 1; }

[ "$(uname)" = Darwin ] || falha "Este script é para macOS."
command -v xz >/dev/null || falha "Falta o xz: brew install xz"
[ -f "$RAIZ/.env" ] || falha "Falta o .env na raiz do projeto."
[ -f "$HOME/.ssh/clima-agente.pub" ] || ssh-keygen -q -t ed25519 -f "$HOME/.ssh/clima-agente" -N "" -C "clima-agente (Mac do dono)"

titulo "1/5 Imagem do Raspberry Pi OS Lite 64-bit"
IMG="${1:-}"
if [ -z "$IMG" ]; then
  CACHE="$HOME/Library/Caches/clima-raspberry"; mkdir -p "$CACHE"
  REAL="$(curl -fsIL -o /dev/null -w '%{url_effective}' "$URL_LATEST")"
  IMG="$CACHE/$(basename "$REAL")"
  if [ ! -f "$IMG" ]; then echo "baixando $(basename "$REAL")…"; curl -fL --progress-bar -o "$IMG" "$REAL"; fi
  ESPERADO="$(curl -fsSL "$REAL.sha256" | cut -d' ' -f1)"
  [ "$(shasum -a 256 "$IMG" | cut -d' ' -f1)" = "$ESPERADO" ] || { rm -f "$IMG"; falha "Checksum não confere; rode de novo para baixar outra vez."; }
fi
[ -f "$IMG" ] || falha "Imagem não encontrada: $IMG"
echo "imagem: $(basename "$IMG") (checksum ok)"

titulo "2/5 Escolha o cartão microSD"
diskutil list external physical
echo
read -r -p "Digite o disco do cartão (ex.: disk4) ou Enter para cancelar: " DISCO
[ -n "$DISCO" ] || falha "Cancelado."
[[ "$DISCO" =~ ^disk[0-9]+$ ]] || falha "Nome inválido (use o formato disk4)."
INFO="$(diskutil info "/dev/$DISCO")" || falha "Disco não encontrado."
echo "$INFO" | grep -qE "Device Location:\s+External|Removable Media:\s+(Removable|Yes)" || falha "/dev/$DISCO não é externo/removível. Não vou apagar."
echo "$INFO" | grep -qE "^\s*Internal:\s+Yes" && falha "/dev/$DISCO é interno. Não vou apagar."
TAM="$(echo "$INFO" | awk -F'[()]' '/Disk Size/{print $2; exit}' | awk '{print $1}')"
[ -n "$TAM" ] && [ "$TAM" -lt 300000000000 ] || falha "Disco grande demais para ser um microSD ($TAM bytes). Não vou apagar."
NOME="$(echo "$INFO" | awk -F: '/Media Name/{gsub(/^ +/,"",$2); print $2; exit}')"
echo "Vai APAGAR TUDO em /dev/$DISCO ($NOME, $((TAM / 1000000000)) GB)."
read -r -p "Digite APAGAR para confirmar: " OK
[ "$OK" = APAGAR ] || falha "Cancelado."

titulo "3/5 Wi-Fi do escritório (2,4 GHz, a mesma rede dos transmissores)"
SSID="${CLIMA_WIFI_SSID:-}"   # ex.: CLIMA_WIFI_SSID=Egov ./scripts/preparar-cartao-raspberry.sh
if [ -n "$SSID" ]; then echo "Rede: $SSID"; else read -r -p "Nome da rede (SSID) — Enter para usar só cabo de rede: " SSID; fi
SENHA=""
if [ -n "$SSID" ]; then read -r -s -p "Senha do Wi-Fi (não aparece): " SENHA; echo; fi

titulo "4/5 Gravando (pede a senha de administrador do Mac)"
diskutil unmountDisk "/dev/$DISCO"
xz -dc "$IMG" | sudo dd of="/dev/r$DISCO" bs=4m status=progress
sync
sleep 3; diskutil mountDisk "/dev/$DISCO" >/dev/null 2>&1 || true
BOOT=""
for i in $(seq 1 20); do for v in /Volumes/bootfs /Volumes/boot; do [ -f "$v/cmdline.txt" ] && BOOT="$v"; done; [ -n "$BOOT" ] && break; sleep 1; done
[ -n "$BOOT" ] || falha "A partição de boot não montou. Tire e coloque o cartão e rode de novo (a gravação já foi feita)."

titulo "5/5 Configuração do primeiro boot"
CHAVE="$(cat "$HOME/.ssh/clima-agente.pub")"
cat > "$BOOT/user-data" <<EOF
#cloud-config
# Clima Escritório: Raspberry Pi como agente fixo do escritório.
hostname: clima-agente
timezone: America/Sao_Paulo
locale: pt_BR.UTF-8
keyboard:
  model: pc105
  layout: br
ssh_pwauth: false
users:
- name: clima
  gecos: Agente Clima Escritório
  groups: users,adm,sudo,netdev
  shell: /bin/bash
  sudo: ALL=(ALL) NOPASSWD:ALL
  lock_passwd: true
  ssh_authorized_keys:
  - $CHAVE
package_update: true
packages:
- avahi-daemon
- python3-venv
- curl
- unzip
- iw
- unattended-upgrades
write_files:
# 24/7: o watchdog de hardware reinicia o Pi se o sistema travar (15 s sem resposta)
- path: /etc/systemd/system.conf.d/clima-watchdog.conf
  content: |
    [Manager]
    RuntimeWatchdogSec=15
    RebootWatchdogSec=2min
# cartão dura mais: diário do sistema com tamanho limitado
- path: /etc/systemd/journald.conf.d/clima.conf
  content: |
    [Journal]
    SystemMaxUse=80M
    MaxRetentionSec=14day
# o Wi-Fi do Pi entra em economia de energia e cai de madrugada: desliga isso a cada boot
- path: /etc/systemd/system/clima-wifi-sempre.service
  content: |
    [Unit]
    Description=Wi-Fi sem economia de energia (agente 24/7)
    After=network-online.target
    Wants=network-online.target
    [Service]
    Type=oneshot
    ExecStart=/bin/sh -c '/usr/sbin/iw dev wlan0 set power_save off || true'
    [Install]
    WantedBy=multi-user.target
# atualizações de segurança automáticas (sem reiniciar sozinho)
- path: /etc/apt/apt.conf.d/20auto-upgrades
  content: |
    APT::Periodic::Update-Package-Lists "1";
    APT::Periodic::Unattended-Upgrade "1";
runcmd:
- [ systemctl, enable, --now, ssh ]
- [ systemctl, enable, --now, avahi-daemon ]
- [ systemctl, daemon-reload ]
- [ systemctl, enable, --now, clima-wifi-sempre.service ]
- [ bash, -c, "bash /boot/firmware/clima/primeiro-boot.sh >> /var/log/clima-primeiro-boot.log 2>&1" ]
EOF
{
  echo "network:"
  echo "  version: 2"
  echo "  ethernets:"
  echo "    eth0:"
  echo "      dhcp4: true"
  echo "      optional: true"
  if [ -n "$SSID" ]; then
    esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }
    echo "  wifis:"
    echo "    wlan0:"
    echo "      dhcp4: true"
    echo "      optional: true"
    echo "      regulatory-domain: BR"
    echo "      access-points:"
    echo "        \"$(esc "$SSID")\":"
    echo "          password: \"$(esc "$SENHA")\""
  fi
} > "$BOOT/network-config"
unset SENHA
# watchdog de hardware do Broadcom (usado pelo systemd acima)
grep -q '^dtparam=watchdog=on' "$BOOT/config.txt" || printf '\n# Clima Escritório: watchdog de hardware (reinicia se travar)\ndtparam=watchdog=on\n' >> "$BOOT/config.txt"
mkdir -p "$BOOT/clima"
( cd "$RAIZ" && git archive --format=tar HEAD backend requirements.txt instalar-linux.sh > "$BOOT/clima/codigo.tar" \
  && { [ -d backend/static ] && tar -rf "$BOOT/clima/codigo.tar" backend/static || true; } && gzip -9f "$BOOT/clima/codigo.tar" )
cp "$RAIZ/.env" "$BOOT/clima/.env"
cat > "$BOOT/clima/primeiro-boot.sh" <<'EOF'
#!/usr/bin/env bash
# Primeiro boot: instala o agente a partir do código e do .env do cartão. Log: /var/log/clima-primeiro-boot.log
set -euo pipefail
ORIGEM=/boot/firmware/clima
PASTA=/opt/clima-escritorio/ar-controle
USUARIO=clima
echo "== $(date) primeiro boot do agente"
[ -f "$ORIGEM/codigo.tar.gz" ] || { echo "sem código no cartão"; exit 1; }
for i in $(seq 1 36); do curl -fsS -o /dev/null --max-time 5 https://app.zynio.com.br/saude && break; sleep 5; done
mkdir -p "$PASTA" && tar -xzf "$ORIGEM/codigo.tar.gz" -C "$PASTA"
chown -R root:root "$PASTA"; chmod 755 /opt/clima-escritorio "$PASTA"
if [ -f "$ORIGEM/.env" ]; then
  install -m 600 -o "$USUARIO" "$ORIGEM/.env" "$PASTA/.env"
  shred -u "$ORIGEM/.env" 2>/dev/null || rm -f "$ORIGEM/.env"
fi
[ -f "$PASTA/.env" ] || { echo "sem .env: instale com o código (Infra → Agentes)"; exit 1; }
python3 -m venv "$PASTA/.venv"
"$PASTA/.venv/bin/pip" install -q --retries 8 --timeout 90 --upgrade pip
mkdir -p "$PASTA/data"; chown -R "$USUARIO" "$PASTA/.venv" "$PASTA/data"
chmod +x "$PASTA/instalar-linux.sh"
SUDO_USER="$USUARIO" bash "$PASTA/instalar-linux.sh"
rm -f "$ORIGEM/codigo.tar.gz"
echo "== $(date) pronto: agente instalado"
EOF
sync
diskutil eject "/dev/$DISCO" >/dev/null
printf '\nPronto. O cartão foi ejetado.\n'
printf '1. Coloque no Raspberry e ligue na tomada (perto do roteador do escritório).\n'
printf '2. Espere de 10 a 20 minutos: ele configura a rede, atualiza e instala o agente sozinho.\n'
printf '3. No painel: Infra → Agentes → "clima-agente" aparece → Preferir este.\n'
printf 'Acesso pelo Mac (mesma rede): ssh -i ~/.ssh/clima-agente clima@clima-agente.local\n'
printf 'Ver o andamento: ssh … "sudo tail -f /var/log/clima-primeiro-boot.log"\n'
