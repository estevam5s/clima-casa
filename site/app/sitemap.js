import { FUNCIONALIDADES, NOVIDADES, SITE_URL, TELAS } from '@/lib/dados'
export default function sitemap() {
  const fixas = ['', '/sobre', '/funcionalidades', '/telas', '/novidades', '/faq', '/contato']
  return [...fixas, ...FUNCIONALIDADES.map((f) => `/funcionalidades/${f.slug}`), ...TELAS.map((t) => `/telas/${t.slug}`), ...NOVIDADES.map((n) => `/novidades/${n.slug}`)]
    .map((c) => ({ url: `${SITE_URL}${c}`, lastModified: new Date('2026-11-14') }))
}
