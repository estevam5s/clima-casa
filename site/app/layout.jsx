import { Roboto, Source_Sans_3 } from 'next/font/google'
import './globals.css'
import Cabecalho from '@/components/Cabecalho'
import Rodape from '@/components/Rodape'
import Efeitos from '@/components/Efeitos'
import { MARCA, SITE_URL } from '@/lib/dados'

const titulo = Source_Sans_3({ subsets: ['latin'], weight: ['400', '500', '600', '700'], style: ['normal', 'italic'], variable: '--f-titulo', display: 'swap' })
const corpo = Roboto({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--f-corpo', display: 'swap' })

const descricao = 'Ar-condicionados do escritório por infravermelho, com Alexa e Google Home, agenda, automações, relatórios de consumo e custo e segurança com mapa 3D.'
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${MARCA} · ar-condicionado por infravermelho, Alexa e automações`, template: `%s · ${MARCA}` },
  description: descricao,
  icons: { icon: '/icone.svg', apple: '/icone-192.png' },
  openGraph: { title: MARCA, description: descricao, type: 'website', locale: 'pt_BR', images: ['/telas/painel.jpg'] },
  twitter: { card: 'summary_large_image', title: MARCA, description: descricao, images: ['/telas/painel.jpg'] },
}
export const viewport = { themeColor: '#0e0f11' }

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${titulo.variable} ${corpo.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body>
        <Efeitos>
          <Cabecalho />
          <main>{children}</main>
          <Rodape />
        </Efeitos>
      </body>
    </html>
  )
}
