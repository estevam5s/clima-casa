#!/usr/bin/env bash
# Instala o clima-ia (Assistente do Clima Escritório no terminal) no macOS e no Linux (Debian, Ubuntu, Mint, Fedora,
# Arch, Manjaro, openSUSE, Alpine) e no WSL do Windows:
#   curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash
#   curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash -s -- --desinstalar
# Tudo fica em ~/.clima-ia (ambiente Python isolado, sem sudo) e o comando em ~/.local/bin/clima-ia.
# Sem Python 3.10+ que sirva (ou sem o módulo venv, comum no Debian/Ubuntu), baixa o uv, que traz um Python próprio.
# Não pede senha nem chave: na primeira vez o clima-ia mostra as configurações e depois abre o login no navegador.
set -euo pipefail
BASE="${CLIMA_URL:-https://app.zynio.com.br}"
DEST="$HOME/.clima-ia"
BIN="$HOME/.local/bin"
destaque() { printf '\033[38;2;47;191;155m%s\033[0m\n' "$1"; }
cinza() { printf '\033[38;2;148;148;148m%s\033[0m\n' "$1"; }
erro() { printf '\033[38;2;224;108;117m%s\033[0m\n' "$1" >&2; }
baixar() { if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"; elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"; else erro "Precisa do curl ou do wget."; exit 1; fi; }

if [ "${1:-}" = "--desinstalar" ]; then
  rm -rf "$DEST" "$BIN/clima-ia"
  destaque "clima-ia removido (configurações e histórico em $DEST também)."
  exit 0
fi

SO="$(uname -s)"; DISTRO=""
if [ -r /etc/os-release ]; then DISTRO="$(. /etc/os-release; echo "${ID:-}" | tr 'A-Z' 'a-z')"; fi
grep -qi microsoft /proc/version 2>/dev/null && DISTRO="$DISTRO (WSL)"
destaque "clima-ia · instalando ($SO${DISTRO:+ · $DISTRO})"
mkdir -p "$DEST" "$BIN"
chmod 700 "$DEST"

PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys, venv, ensurepip; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then PY="$c"; break; fi
done

rm -rf "$DEST/venv"
if [ -n "$PY" ] && "$PY" -m venv "$DEST/venv" 2>/dev/null; then
  cinza "→ Python do sistema: $("$PY" --version 2>&1)"
  VPY="$DEST/venv/bin/python"
  "$VPY" -m pip install -q --upgrade pip
  "$VPY" -m pip install -q "httpx==0.28.1" "rich==13.9.4" "prompt_toolkit==3.0.48"
else
  # sem Python que sirva: o uv (um arquivo, sem sudo) baixa um Python próprio só para o clima-ia
  UV="$(command -v uv || true)"
  if [ -z "$UV" ]; then
    cinza "→ sem Python 3.10+ com venv: baixando o uv (Python próprio, sem sudo)"
    case "$DISTRO" in
      debian*|ubuntu*|linuxmint*|pop*) cinza "  (ou instale com: sudo apt install python3 python3-venv)";;
      arch*|manjaro*|endeavouros*) cinza "  (ou instale com: sudo pacman -S python)";;
      fedora*|rhel*|centos*|rocky*|almalinux*) cinza "  (ou instale com: sudo dnf install python3)";;
      opensuse*) cinza "  (ou instale com: sudo zypper install python3)";;
      alpine*) cinza "  (ou instale com: sudo apk add python3 py3-pip)";;
    esac
    baixar https://astral.sh/uv/install.sh /tmp/clima-uv.sh
    UV_UNMANAGED_INSTALL="$DEST/uv" sh /tmp/clima-uv.sh >/dev/null 2>&1 || { erro "Não deu para baixar o uv."; exit 1; }
    rm -f /tmp/clima-uv.sh
    UV="$DEST/uv/uv"
  fi
  "$UV" venv -q --python 3.12 "$DEST/venv"
  VPY="$DEST/venv/bin/python"
  "$UV" pip install -q --python "$VPY" "httpx==0.28.1" "rich==13.9.4" "prompt_toolkit==3.0.48"
  cinza "→ Python próprio: $("$VPY" --version 2>&1)"
fi

cinza "→ baixando o clima-ia"
baixar "$BASE/clima-ia/clima_ia.py" "$DEST/clima_ia.py.novo"
"$VPY" -m py_compile "$DEST/clima_ia.py.novo"
mv "$DEST/clima_ia.py.novo" "$DEST/clima_ia.py"
cat > "$BIN/clima-ia" <<SH
#!/usr/bin/env bash
# Dentro da pasta do projeto (com o agente instalado), usa o clima-ia completo (lê e edita o código);
# em qualquer outro lugar, o cliente que fala com o painel usando a sua conta.
if [ -f "\$PWD/agente-ia/clima_ia.py" ] && [ -x "\$PWD/.venv/bin/python" ] && [ -f "\$PWD/.env" ]; then
  exec "\$PWD/.venv/bin/python" "\$PWD/agente-ia/clima_ia.py" "\$@"
fi
export PYTHONUTF8=1
exec "$VPY" "$DEST/clima_ia.py" "\$@"
SH
chmod +x "$BIN/clima-ia"
destaque "✔ clima-ia $("$VPY" "$DEST/clima_ia.py" --versao | cut -d' ' -f2) instalado"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    LINHA='export PATH="$HOME/.local/bin:$PATH"'
    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
      if [ -f "$rc" ] && ! grep -qs '.local/bin' "$rc"; then echo "$LINHA" >> "$rc"; cinza "→ $BIN no PATH em $rc"; fi
    done
    [ -f "$HOME/.zshrc" ] || [ -f "$HOME/.bashrc" ] || { echo "$LINHA" >> "$HOME/.profile"; cinza "→ $BIN no PATH em ~/.profile"; }
    if command -v fish >/dev/null 2>&1; then mkdir -p "$HOME/.config/fish/conf.d"; echo 'fish_add_path -g $HOME/.local/bin' > "$HOME/.config/fish/conf.d/clima-ia.fish"; cinza "→ $BIN no PATH do fish"; fi
    cinza "  Abra um terminal novo (ou rode: export PATH=\"\$HOME/.local/bin:\$PATH\")";;
esac
echo
echo "  Próximos passos:"
echo "    clima-ia           na 1ª vez: tema, cores e modo; depois o login pelo navegador"
echo "    clima-ia config    mudar as configurações"
echo "    clima-ia \"quais ares estão ligados?\""
