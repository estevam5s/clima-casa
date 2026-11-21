import { Roboto, Source_Sans_3 } from 'next/font/google'
import './globals.css'
import Cabecalho from '@/components/Cabecalho'
import Rodape from '@/components/Rodape'
import Efeitos from '@/components/Efeitos'
import Cookies from '@/components/Cookies'
import Medicao from '@/components/Medicao'
import { MotorIdioma } from '@/components/Idioma'
import { MARCA, SISTEMA_URL, SITE_URL } from '@/lib/dados'
import { DESCRICAO_PADRAO, meta } from '@/lib/seo'

const titulo = Source_Sans_3({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--f-titulo', display: 'swap' })
const corpo = Roboto({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--f-corpo', display: 'swap' })

export const metadata = {
  metadataBase: new URL(SITE_URL),
  ...meta({}),
  title: { default: `${MARCA} · ar-condicionado inteligente para escritório`, template: `%s · ${MARCA}` },
  applicationName: MARCA,
  keywords: ['ar-condicionado', 'controle por infravermelho', 'escritório inteligente', 'automação de escritório', 'Alexa', 'Google Home', 'iluminação inteligente', 'cafeteira inteligente', 'persiana motorizada', 'fechadura inteligente', 'Spotify', 'Tuya', 'Smart Life', 'Smart IR', 'consumo de energia', 'Zynio'],
  authors: [{ name: MARCA, url: SITE_URL }],
  creator: MARCA, publisher: MARCA, category: 'technology',
  formatDetection: { telephone: false, email: false, address: false },
  icons: { icon: [{ url: '/icone.svg', type: 'image/svg+xml' }, { url: '/icone-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }] },
  manifest: '/manifest.webmanifest',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
}
export const viewport = { themeColor: '#0e0f11', colorScheme: 'dark' }

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: MARCA, url: SITE_URL, logo: `${SITE_URL}/icone-512.png` },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#site`, url: SITE_URL, name: MARCA, inLanguage: ['pt-BR', 'en', 'es', 'fr', 'ru', 'ko'], publisher: { '@id': `${SITE_URL}/#org` } },
    { '@type': 'SoftwareApplication', name: MARCA, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, macOS, Windows, Linux',
      description: DESCRICAO_PADRAO, url: SITE_URL, image: `${SITE_URL}/og/inicio.jpg`, publisher: { '@id': `${SITE_URL}/#org` },
      offers: { '@type': 'Offer', availability: 'https://schema.org/OnlineOnly', url: SISTEMA_URL } },
  ],
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
        {/* idioma escolhido antes da primeira pintura: esconde a página até trocar os textos (no máximo 2,5 s) */}
        <script dangerouslySetInnerHTML={{ __html: "(function(){try{var c=['en','es','fr','ru','ko'],p=new URLSearchParams(location.search).get('lang'),s=localStorage.getItem('zynio-idioma'),n=(navigator.language||'').slice(0,2).toLowerCase(),l=p||s||n;if(c.indexOf(l)>=0&&!(p==='pt'||(!p&&s==='pt'))){var h=document.documentElement;h.classList.add('i18n-carregando');h.lang=l;setTimeout(function(){h.classList.remove('i18n-carregando')},2500)}}catch(e){}})()" }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </head>
      <body>
        <Efeitos>
          <Cabecalho />
          <main>{children}</main>
          <Rodape />
        </Efeitos>
        <Cookies />
        <MotorIdioma />
        <Medicao />
      </body>
    </html>
  )
}
