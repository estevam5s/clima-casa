#!/usr/bin/env bash
# Procura chaves reais nos arquivos versionados. Mostra só arquivo:linha, nunca o valor.
# Roda no CI (.github/workflows/ci.yml) e deve rodar antes de todo commit: bash scripts/verificar-segredos.sh
# A chave pública do Supabase (sb_publishable_…) não é segredo e não entra aqui.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PADROES=(
  'gh[pousr]_[A-Za-z0-9]{36}'                 # GitHub (token clássico, OAuth, app)
  'github_pat_[A-Za-z0-9_]{60,}'              # GitHub (fine-grained)
  'sk_live_[A-Za-z0-9]{20,}'                  # Stripe
  'rk_live_[A-Za-z0-9]{20,}'                  # Stripe (restrita)
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl'   # JWT service_role do Supabase
  'sb_secret_[A-Za-z0-9_-]{20,}'              # Supabase (chave secreta nova)
  'sbp_[a-f0-9]{40}'                          # Supabase Management API
  'vcp_[A-Za-z0-9]{30,}'                      # Vercel
  'nvapi-[A-Za-z0-9_-]{30,}'                  # NVIDIA
  're_[A-Za-z0-9]{8}_[A-Za-z0-9]{20,}'        # Resend
  'whsec_[A-Za-z0-9+/=]{24,}'                 # webhook (Svix/Resend)
  'AKIA[0-9A-Z]{16}'                          # AWS
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
  'xox[baprs]-[A-Za-z0-9-]{10,}'              # Slack
  'AIza[0-9A-Za-z_-]{35}'                     # Google API
  '[0-9]{8,10}:AA[A-Za-z0-9_-]{33}'           # bot do Telegram
)
achou=0
for p in "${PADROES[@]}"; do
  # -l -n com cut: só arquivo:linha (o conteúdo da linha nunca é impresso)
  if saida=$(git grep -nIE -e "$p" -- . ':!package-lock.json' ':!**/package-lock.json' 2>/dev/null | cut -d: -f1,2); then
    if [ -n "$saida" ]; then
      achou=1
      echo "Possível segredo (padrão ${p:0:14}…):"
      echo "$saida" | sed 's/^/  /'
    fi
  fi
done
if [ "$achou" = 1 ]; then
  echo "::error::Há possíveis segredos no código. Tire do arquivo E rotacione a chave (ela já está no histórico)."
  exit 1
fi
echo "Nenhum segredo encontrado nos arquivos versionados."
