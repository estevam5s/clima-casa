#!/bin/bash
# Inicia o agente do Clima Casa no Mac (fila de comandos, agenda e painel local). Uso: ./iniciar.sh            (só neste computador, porta 8090)
#                           CLIMA_HOST=0.0.0.0 ./iniciar.sh   (acessível pelo celular na mesma rede)
set -e
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "Criando ambiente Python..."
  if command -v uv >/dev/null; then uv venv -q .venv --python 3.13 && uv pip install -q --python .venv/bin/python -r backend/requirements.txt
  else python3.13 -m venv .venv && .venv/bin/pip install -q -r backend/requirements.txt; fi
fi
if [ ! -f backend/static/index.html ]; then
  echo "Compilando a interface..."
  (cd frontend && npm install --silent && npm run build)
fi
cd backend
exec ../.venv/bin/python -m app.main
