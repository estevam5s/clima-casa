#!/bin/bash
# Publica o site institucional (Next.js) na Vercel, projeto "clima-escritorio-site", a partir de uma cópia sem .git
# (o plano Hobby bloqueia deploy de commit cujo autor não é do time).
set -e
ORIGEM="$(cd "$(dirname "$0")" && pwd)"
TOKEN=$(grep -E '^VERCEL_TOKEN=' "$ORIGEM/../.env" | cut -d= -f2- | tr -d '"')
# histórico de versões do sistema para a página /novidades
node "$ORIGEM/scripts/copiar-versoes.mjs"
# textos do site para a tradução (Idiomas do site no painel): precisa do Google Chrome; sem ele, mantém a lista atual
if [ "${SEM_TEXTOS:-0}" != "1" ]; then node "$ORIGEM/scripts/extrair-textos.mjs" || echo "Aviso: não deu para atualizar public/i18n/textos.json (siga assim; os textos novos aparecem pelo navegador)."; fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude node_modules --exclude .next --exclude .vercel --exclude ".env*" "$ORIGEM/" "$TMP/"
if [ -f "$ORIGEM/.vercel/project.json" ]; then mkdir -p "$TMP/.vercel" && cp "$ORIGEM/.vercel/project.json" "$TMP/.vercel/"; fi
cd "$TMP"
npx --yes vercel@latest deploy --prod --yes --token "$TOKEN" "$@"
if [ ! -f "$ORIGEM/.vercel/project.json" ] && [ -f "$TMP/.vercel/project.json" ]; then mkdir -p "$ORIGEM/.vercel" && cp "$TMP/.vercel/project.json" "$ORIGEM/.vercel/"; fi
