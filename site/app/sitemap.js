import { DISPOSITIVOS, FUNCIONALIDADES, NOVIDADES, SITE_URL, TELAS } from '@/lib/dados'
import VERSOES from '@/lib/versoes.json'
export default function sitemap() {
  const fixas = ['', '/como-funciona', '/integracoes', '/seguranca', '/status', '/baixar', '/sobre', '/funcionalidades', '/telas', '/novidades', '/faq', '/contato', '/privacidade', '/termos', '/assistente-ia', '/bot-telegram', '/mapa-3d', '/seguranca/defesas', '/glossario', '/escritorio-inteligente', '/newsletter']
  return [...fixas, ...FUNCIONALIDADES.map((f) => `/funcionalidades/${f.slug}`), ...TELAS.map((t) => `/telas/${t.slug}`), ...NOVIDADES.map((n) => `/novidades/${n.slug}`), ...DISPOSITIVOS.map((d) => `/escritorio-inteligente/${d.slug}`), ...VERSOES.map((v) => `/novidades/versao/${v.versao}`)]
    .map((c) => {
      const url = `${SITE_URL}${c}`
      // o mesmo endereço em outros idiomas (?lang=)
      return { url, lastModified: new Date(VERSOES[0].data), alternates: { languages: Object.fromEntries(['en', 'es', 'fr', 'ru', 'ko'].map((l) => [l, `${url}?lang=${l}`])) } }
    })
}
