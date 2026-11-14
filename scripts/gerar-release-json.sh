#!/bin/bash
# Gera frontend/src/release.json (versão, data, tamanho, SHA-256 e downloads de cada arquivo) a partir do
# último release do GitHub. Rode depois de cada "gh release create/upload" e antes do build.
set -e
cd "$(dirname "$0")/.."
gh release view --repo estevam5s/clima-casa --json tagName,publishedAt,assets,body \
  -q '{versao:.tagName,publicado:.publishedAt,notas:.body,arquivos:[.assets[]|{nome:.name,tamanho:.size,sha256:(.digest|sub("sha256:";"")),downloads:.downloadCount}]}' \
  > frontend/src/release.json
echo "frontend/src/release.json atualizado: $(grep -o '"versao":"[^"]*"' frontend/src/release.json)"
