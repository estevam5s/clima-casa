// Routing Middleware da Vercel (roda na borda antes de servir o sistema).
// Quem abre o sistema sem o passe "zv" vê a tela "Executando verificação de segurança" (Cloudflare Turnstile).
// API, Alexa, OAuth, arquivos estáticos e a própria verificação passam direto: o app do celular e a Alexa não são afetados,
// e a API continua protegida pelo login (token) e pelo Turnstile no /api/auth/entrar.
// Portão "Executando verificação de segurança" compartilhado pelo middleware do sistema (Vercel) e pelo proxy do site (Next).
// Passe = "<expira_epoch>.<hmac_sha256_hex(segredo, expira)>" no cookie "zv" (12 h, HttpOnly, domínio .zynio.com.br).

// Robôs que precisam ver a página como ela é: buscadores e quem monta prévia de link (WhatsApp, redes sociais).
const ROBOS_LIBERADOS = /Googlebot|Google-InspectionTool|bingbot|DuckDuckBot|Applebot|YandexBot|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|WhatsApp|TelegramBot|Slackbot|Discordbot|SkypeUriPreview|Pinterestbot/i

async function passeValido(cookie, segredo) {
  if (!segredo) return true
  const m = /(?:^|;\s*)zv=(\d+)\.([0-9a-f]{64})/.exec(cookie || '')
  if (!m || Number(m[1]) < Date.now() / 1000) return false
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const ass = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(m[1])))
  const hex = Array.from(ass, (b) => b.toString(16).padStart(2, '0')).join('')
  let dif = 0
  for (let i = 0; i < 64; i++) dif |= hex.charCodeAt(i) ^ m[2].charCodeAt(i)
  return dif === 0
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function paginaPortao({ host, chave, endpoint, volta }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Um momento…</title>
<style>
  :root{color-scheme:dark}
  html,body{margin:0;min-height:100%;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
  main{max-width:720px;margin:0 auto;padding:18vh 24px 48px}
  h1{font-size:clamp(28px,5vw,40px);font-weight:600;margin:0 0 14px;letter-spacing:-.01em}
  h2{font-size:clamp(20px,3vw,24px);font-weight:600;margin:0 0 8px}
  p{margin:0;color:#b3b3b3;line-height:1.55;font-size:16px}
  #caixa{margin-top:28px;min-height:65px}
  #status{margin-top:34px;font-size:clamp(18px,2.6vw,22px);font-weight:600;color:#fff}
  #erro{margin-top:24px;color:#ff8a8a;font-size:15px}
  #erro button{margin-top:12px;background:#fff;color:#000;border:0;border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer}
  footer{position:fixed;left:0;right:0;bottom:0;padding:16px 24px;font-size:12px;color:#6b6b6b;text-align:center}
  noscript p{margin-top:24px;color:#ff8a8a}
</style></head>
<body><main id="verificacao" data-chave="${esc(chave)}" data-endpoint="${esc(endpoint)}" data-host="${esc(host)}" data-volta="${esc(volta)}">
<h1>${esc(host)}</h1>
<h2>Executando verificação de segurança</h2>
<p>Este site utiliza um serviço de segurança para proteção contra bots maliciosos. Esta página é exibida enquanto o site verifica se você não é um bot.</p>
<div id="caixa"></div><p id="status" hidden></p><p id="erro" hidden></p>
<noscript><p>Ative o JavaScript para continuar.</p></noscript>
</main>
<footer>Desempenho e segurança por Cloudflare Turnstile</footer>
<script src="/verificacao.js" defer></script></body></html>`
}


export const config = {
  matcher: ['/((?!api/|alexa/|oauth/|saude|assets/|icone|apple-touch-icon|manifest\\.webmanifest|sw\\.js|tema\\.js|og\\.jpg|verificacao\\.js|favicon).*)'],
}

export default async function middleware(request) {
  const segredo = process.env.VERIFICACAO_SEGREDO
  const chave = process.env.TURNSTILE_SITE_KEY
  if (!segredo || !chave) return undefined
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined
  if (ROBOS_LIBERADOS.test(request.headers.get('user-agent') || '')) return undefined
  if (await passeValido(request.headers.get('cookie'), segredo)) return undefined
  const url = new URL(request.url)
  return new Response(paginaPortao({ host: url.hostname, chave, endpoint: '/api/verificacao', volta: url.pathname + url.search }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })
}
