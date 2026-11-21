// Metadados de compartilhamento (Open Graph, X/Twitter, WhatsApp, LinkedIn, Discord, Telegram) por página.
import { MARCA, SITE_URL } from './dados'

export const DESCRICAO_PADRAO = 'O escritório inteiro num painel: ar-condicionado por infravermelho, luzes, cafeteira, persianas, fechadura e música, com Alexa e Google, assistente de IA, relatórios de consumo e mapa 3D.'

// Tamanhos que os buscadores mostram inteiros: título até ~65 caracteres (com " · Clima Escritório") e descrição de 70 a 160.
// Corta na última palavra inteira (sem reticências no título) e completa descrição curta com a frase do sistema.
function encurtar(t, max) { if (!t || t.length <= max) return t; const c = t.slice(0, max); return c.slice(0, c.lastIndexOf(' ')).replace(/[,:;·-]+$/, '') }
function ajustarDescricao(d) {
  if (d.length > 160) return `${encurtar(d, 157)}…`
  if (d.length < 70) return `${d} ${MARCA}: o escritório inteiro num painel.`.slice(0, 160)
  return d
}

export function meta({ titulo: tituloLongo, descricao: descricaoLonga = DESCRICAO_PADRAO, caminho = '/', og = 'inicio', tipo = 'website', publicado }) {
  const titulo = encurtar(tituloLongo, 46)
  const descricao = ajustarDescricao(descricaoLonga)
  const url = `${SITE_URL}${caminho === '/' ? '' : caminho}`
  const imagem = { url: `${SITE_URL}/og/${og}.jpg`, secureUrl: `${SITE_URL}/og/${og}.jpg`, width: 1200, height: 630, type: 'image/jpeg', alt: titulo ? `${titulo} · ${MARCA}` : MARCA }
  return {
    ...(titulo ? { title: titulo } : {}),
    description: descricao,
    // o mesmo endereço em outros idiomas (o site troca os textos pelo parâmetro ?lang=)
    alternates: { canonical: url, languages: { 'pt-BR': url, en: `${url}?lang=en`, es: `${url}?lang=es`, fr: `${url}?lang=fr`, ru: `${url}?lang=ru`, ko: `${url}?lang=ko`, 'x-default': url } },
    openGraph: {
      type: tipo, url, siteName: MARCA, locale: 'pt_BR', alternateLocale: ['en_US', 'es_ES', 'fr_FR', 'ru_RU', 'ko_KR'], title: titulo ? `${titulo} · ${MARCA}` : `${MARCA} · ar-condicionado inteligente para escritório`,
      description: descricao, images: [imagem], ...(publicado ? { publishedTime: publicado, authors: [MARCA] } : {}),
    },
    twitter: { card: 'summary_large_image', title: titulo ? `${titulo} · ${MARCA}` : MARCA, description: descricao, images: [imagem] },
  }
}
