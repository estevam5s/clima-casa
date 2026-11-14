// Metadados de compartilhamento (Open Graph, X/Twitter, WhatsApp, LinkedIn, Discord, Telegram) por página.
import { MARCA, SITE_URL } from './dados'

export const DESCRICAO_PADRAO = 'Ar-condicionados do escritório comandados por infravermelho: painel, celular, Alexa e Google, agenda, automações, relatórios de consumo e custo e segurança com mapa 3D.'

export function meta({ titulo, descricao = DESCRICAO_PADRAO, caminho = '/', og = 'inicio', tipo = 'website', publicado }) {
  const url = `${SITE_URL}${caminho === '/' ? '' : caminho}`
  const imagem = { url: `${SITE_URL}/og/${og}.jpg`, secureUrl: `${SITE_URL}/og/${og}.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: titulo ? `${titulo} · ${MARCA}` : MARCA }
  return {
    ...(titulo ? { title: titulo } : {}),
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      type: tipo, url, siteName: MARCA, locale: 'pt_BR', title: titulo ? `${titulo} · ${MARCA}` : `${MARCA} · ar-condicionado inteligente para escritório`,
      description: descricao, images: [imagem], ...(publicado ? { publishedTime: publicado, authors: [MARCA] } : {}),
    },
    twitter: { card: 'summary_large_image', title: titulo ? `${titulo} · ${MARCA}` : MARCA, description: descricao, images: [imagem] },
  }
}
