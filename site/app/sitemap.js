import { FUNCIONALIDADES, NOVIDADES, SITE_URL, TELAS } from '@/lib/dados'
export default function sitemap() {
  const fixas = ['', '/como-funciona', '/integracoes', '/seguranca', '/status', '/baixar', '/sobre', '/funcionalidades', '/telas', '/novidades', '/faq', '/contato', '/privacidade', '/termos', '/assistente-ia', '/bot-telegram', '/mapa-3d', '/seguranca/defesas', '/glossario']
  return [...fixas, ...FUNCIONALIDADES.map((f) => `/funcionalidades/${f.slug}`), ...TELAS.map((t) => `/telas/${t.slug}`), ...NOVIDADES.map((n) => `/novidades/${n.slug}`)]
    .map((c) => ({ url: `${SITE_URL}${c}`, lastModified: new Date('2026-11-14') }))
}
