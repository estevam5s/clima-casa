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
# horário de cada versão para a tela Novidades (publicações da Vercel + Git): ver scripts/horarios-versoes.py
if command -v uv >/dev/null; then uv run -q --no-project --with httpx python "$ORIGEM/scripts/horarios-versoes.py" || echo "aviso: não atualizei os horários das versões"; fi
# histórico do código (commits, arquivos, releases) e pacotes do código-fonte para a tela /apps
node "$ORIGEM/scripts/gerar-repositorio.mjs" || echo "aviso: não gerei o repositorio.json (a tela /apps mostra o último gerado)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rsync -a --exclude .git --exclude /apps --exclude /docs --exclude /site --exclude node_modules --exclude .venv --exclude data \
  --exclude backend/static --exclude "__pycache__" --exclude ".env" --exclude ".env.local" --exclude .sec-scan --exclude "SECURITY-REPORT.*" --exclude "/*.jpeg" --exclude "/.md" "$ORIGEM/" "$TMP/"
mkdir -p "$TMP/.vercel" && cp "$ORIGEM/.vercel/project.json" "$TMP/.vercel/"
TOKEN="${VERCEL_TOKEN:-$(grep ^VERCEL_TOKEN= "$ORIGEM/.env" | cut -d= -f2-)}"
cd "$TMP" && vercel deploy --prod --yes --token "$TOKEN"
# confirma que a versão nova já responde (e o servidor grava o horário em que ela entrou no ar)
VERSAO=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['versoes'][0]['versao'])" "$ORIGEM/backend/app/novidades.json" 2>/dev/null || true)
for i in $(seq 1 18); do
  NOAR=$(curl -fsS --max-time 8 "https://app.zynio.com.br/saude" 2>/dev/null | python3 -c "import json,sys;print(json.load(sys.stdin).get('versao') or '')" 2>/dev/null || true)
  [ -n "$VERSAO" ] && [ "$NOAR" = "$VERSAO" ] && { echo "Versão $VERSAO confirmada no ar ($(date '+%d/%m %H:%M:%S'))."; break; }
  sleep 10
done
[ "$NOAR" = "$VERSAO" ] || echo "aviso: app.zynio.com.br ainda responde a versão ${NOAR:-?} (esperada $VERSAO)"
