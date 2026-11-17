#!/bin/bash
# Publica o Clima Casa na Vercel (produção) a partir de uma cópia sem .git.
# Motivo: no plano Hobby a Vercel bloqueia deploys cujo autor do commit não é membro do time.
set -e
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
# "O que há de novo" (backend/app/novidades.json): avisa (sem bloquear) se há commits no sistema depois da data da
# última versão registrada. Versão nova = entrada nova no topo do arquivo (CLAUDE.md §16).
ULTIMA=$(python3 -c "import json,sys;v=json.load(open(sys.argv[1]))['versoes'][0];print(v['versao'],v['data'])" "$ORIGEM/backend/app/novidades.json" 2>/dev/null || true)
if [ -n "$ULTIMA" ]; then
  DEPOIS=$(git -C "$ORIGEM" log --oneline --since="${ULTIMA#* } 23:59:59" -- frontend/src backend/app 2>/dev/null | wc -l | tr -d ' ')
  if [ "${DEPOIS:-0}" -gt 0 ]; then
    echo "aviso: $DEPOIS commit(s) no sistema depois da versão ${ULTIMA% *} (${ULTIMA#* }). Os usuários só veem o aviso de"
    echo "       novidades com uma entrada nova em backend/app/novidades.json (versão, novo, melhorias, segurança, correções)."
  fi
fi
# histórico do código (commits, arquivos, releases) e pacotes do código-fonte para a tela /apps
node "$ORIGEM/scripts/gerar-repositorio.mjs" || echo "aviso: não gerei o repositorio.json (a tela /apps mostra o último gerado)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude /apps --exclude /docs --exclude /site --exclude node_modules --exclude .venv --exclude data \
  --exclude backend/static --exclude "__pycache__" --exclude ".env" --exclude ".env.local" --exclude .sec-scan --exclude "SECURITY-REPORT.*" --exclude "/*.jpeg" --exclude "/.md" "$ORIGEM/" "$TMP/"
mkdir -p "$TMP/.vercel" && cp "$ORIGEM/.vercel/project.json" "$TMP/.vercel/"
TOKEN="${VERCEL_TOKEN:-$(grep ^VERCEL_TOKEN= "$ORIGEM/.env" | cut -d= -f2-)}"
cd "$TMP" && vercel deploy --prod --yes --token "$TOKEN"
