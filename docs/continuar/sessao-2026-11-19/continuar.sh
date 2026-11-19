#!/usr/bin/env bash
# Abre uma sessão nova do Claude Code no projeto já com o contexto desta sessão (PROMPT.md).
#   ./docs/continuar/sessao-2026-11-19/continuar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$AQUI/../../.." && pwd)"
cd "$RAIZ"
command -v claude >/dev/null || { echo "Instale o Claude Code: https://claude.com/claude-code"; exit 1; }
exec claude "$(cat "$AQUI/PROMPT.md")"
