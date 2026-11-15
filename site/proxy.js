// Proxy do Next 16 (antigo middleware): quem abre o site sem o passe "zv" vê a tela
// "Executando verificação de segurança" (Cloudflare Turnstile). Buscadores e prévias de link passam direto (SEO e WhatsApp).
import { NextResponse } from 'next/server'
import { ROBOS_LIBERADOS, paginaPortao, passeValido } from './lib/portao.mjs'
import { TURNSTILE_SITE_KEY } from './lib/dados'

export const config = {
  matcher: ['/((?!api/|_next/|og/|telas/|icone|apple-touch-icon|favicon|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest|verificacao\\.js|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|txt|xml)$).*)'],
}

export async function proxy(request) {
  const segredo = process.env.VERIFICACAO_SEGREDO
  if (!segredo) return NextResponse.next()
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next()
  if (request.headers.get('rsc') || request.headers.get('next-router-prefetch')) return NextResponse.next() // navegação interna já passou
  if (ROBOS_LIBERADOS.test(request.headers.get('user-agent') || '')) return NextResponse.next()
  if (await passeValido(request.headers.get('cookie'), segredo)) return NextResponse.next()
  const url = request.nextUrl
  return new NextResponse(paginaPortao({ host: url.hostname, chave: TURNSTILE_SITE_KEY, endpoint: '/api/verificacao', volta: url.pathname + url.search }), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })
}
