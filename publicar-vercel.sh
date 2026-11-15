#!/bin/bash
# Publica o Clima Casa na Vercel (produção) a partir de uma cópia sem .git.
# Motivo: no plano Hobby a Vercel bloqueia deploys cujo autor do commit não é membro do time.
set -e
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
# histórico do código (commits, arquivos, releases) e pacotes do código-fonte para a tela /apps
node "$ORIGEM/scripts/gerar-repositorio.mjs" || echo "aviso: não gerei o repositorio.json (a tela /apps mostra o último gerado)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude /apps --exclude /docs --exclude /site --exclude node_modules --exclude .venv --exclude data \
  --exclude backend/static --exclude "__pycache__" --exclude ".env" --exclude ".env.local" "$ORIGEM/" "$TMP/"
mkdir -p "$TMP/.vercel" && cp "$ORIGEM/.vercel/project.json" "$TMP/.vercel/"
TOKEN="${VERCEL_TOKEN:-$(grep ^VERCEL_TOKEN= "$ORIGEM/.env" | cut -d= -f2-)}"
cd "$TMP" && vercel deploy --prod --yes --token "$TOKEN"
