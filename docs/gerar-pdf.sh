#!/bin/bash
# Gera docs/Manual-Clima-Casa.pdf a partir de docs/MANUAL.md (pandoc + Chrome sem janela).
set -e
cd "$(dirname "$0")"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
pandoc MANUAL.md -s --toc --toc-depth=2 --css manual.css --embed-resources --metadata pagetitle="Manual Clima Casa" -o "$TMP/manual.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$PWD/Manual-Clima-Casa.pdf" "file://$TMP/manual.html" 2>/dev/null
echo "PDF gerado: $PWD/Manual-Clima-Casa.pdf"
