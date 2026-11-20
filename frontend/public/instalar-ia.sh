#!/usr/bin/env bash
# Instala o clima-ia (Assistente do Clima Escritório no terminal) no macOS ou no Linux:
#   curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash
# Coloca tudo em ~/.clima-ia (Python próprio num ambiente isolado) e o comando em ~/.local/bin/clima-ia.
# Não pede senha nem chave: depois de instalar, rode `clima-ia login` e entre pelo navegador.
set -euo pipefail
BASE="${CLIMA_URL:-https://app.zynio.com.br}"
DEST="$HOME/.clima-ia"
BIN="$HOME/.local/bin"
laranja() { printf '\033[38;2;215;119;87m%s\033[0m\n' "$1"; }
cinza() { printf '\033[38;2;148;148;148m%s\033[0m\n' "$1"; }

laranja "clima-ia · instalando"
PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  if command -v uv >/dev/null 2>&1; then cinza "Usando o Python do uv"; uv python install 3.12 >/dev/null; PY="$(uv python find 3.12)";
  else echo "Precisa do Python 3.10 ou mais novo (ou do uv: curl -LsSf https://astral.sh/uv/install.sh | sh)."; exit 1; fi
fi
mkdir -p "$DEST" "$BIN"
chmod 700 "$DEST"
cinza "→ ambiente isolado em $DEST/venv"
"$PY" -m venv "$DEST/venv"
"$DEST/venv/bin/python" -m pip install -q --upgrade pip
"$DEST/venv/bin/python" -m pip install -q "httpx==0.28.1" "rich==13.9.4" "prompt_toolkit==3.0.48"
cinza "→ baixando o clima-ia"
curl -fsSL "$BASE/clima-ia/clima_ia.py" -o "$DEST/clima_ia.py.novo"
"$DEST/venv/bin/python" -m py_compile "$DEST/clima_ia.py.novo"
mv "$DEST/clima_ia.py.novo" "$DEST/clima_ia.py"
cat > "$BIN/clima-ia" <<SH
#!/usr/bin/env bash
# Dentro da pasta do projeto (com o agente instalado), usa o clima-ia completo (lê e edita o código);
# em qualquer outro lugar, o cliente que fala com o painel usando a sua conta.
if [ -f "\$PWD/agente-ia/clima_ia.py" ] && [ -x "\$PWD/.venv/bin/python" ] && [ -f "\$PWD/.env" ]; then
  exec "\$PWD/.venv/bin/python" "\$PWD/agente-ia/clima_ia.py" "\$@"
fi
exec "$DEST/venv/bin/python" "$DEST/clima_ia.py" "\$@"
SH
chmod +x "$BIN/clima-ia"
laranja "✔ clima-ia $("$DEST/venv/bin/python" "$DEST/clima_ia.py" --versao | cut -d' ' -f2) instalado"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) SH_RC="$HOME/.zshrc"; [ -n "${BASH_VERSION:-}" ] && [ ! -f "$HOME/.zshrc" ] && SH_RC="$HOME/.bashrc"
     echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SH_RC"; cinza "→ $BIN adicionado ao PATH em $SH_RC (abra um terminal novo)";;
esac
echo
echo "  Próximos passos:"
echo "    clima-ia login     entrar com a sua conta (abre o navegador)"
echo "    clima-ia           conversar"
echo "    clima-ia \"quais ares estão ligados?\""
