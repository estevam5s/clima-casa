#!/usr/bin/env bash
# Instala o comando `clima-ia` (agente de IA do Clima Escritório no terminal) no macOS ou no Linux.
#   ./agente-ia/instalar.sh
# Precisa: o .env da raiz com NVIDIA_API_KEY (e as chaves do banco), Python 3.13 e o uv (https://docs.astral.sh/uv/).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
command -v uv >/dev/null || { echo "Instale o uv: curl -LsSf https://astral.sh/uv/install.sh | sh"; exit 1; }
[ -f .env ] || { echo "Falta o .env na raiz (o mesmo do agente)."; exit 1; }
grep -q '^NVIDIA_API_KEY=' .env || echo "Aviso: falta NVIDIA_API_KEY no .env (crie em build.nvidia.com → API Keys)."
[ -x .venv/bin/python ] || uv venv .venv --python 3.13
uv pip install --python .venv/bin/python -q -r backend/requirements.txt -r agente-ia/requirements.txt
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/clima-ia" <<SH
#!/usr/bin/env bash
exec "$RAIZ/.venv/bin/python" "$RAIZ/agente-ia/clima_ia.py" "\$@"
SH
chmod +x "$HOME/.local/bin/clima-ia"
echo "Pronto: rode  clima-ia   (ou: clima-ia \"quais ares estão ligados?\")"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "Adicione ao PATH: echo 'export PATH=\$HOME/.local/bin:\$PATH' >> ~/.zshrc && source ~/.zshrc";; esac
