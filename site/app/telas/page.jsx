import { meta } from '@/lib/seo'
import { BannerPagina, CartaoTela } from '@/components/Secoes'
import { TELAS } from '@/lib/dados'

export const metadata = meta({ titulo: 'Telas do sistema', descricao: 'Capturas reais do painel: ar em 3D, segurança com globo, relatórios, apps, notificações e mais.', caminho: '/telas', og: 'telas' })

export default function Telas() {
  return (
    <>
      <BannerPagina titulo="Telas do sistema" texto="Capturas reais do painel em funcionamento, sem montagem." trilha={[{ rotulo: 'Telas' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">{TELAS.map((t) => <div key={t.slug} className="lg-6"><CartaoTela t={t} /></div>)}</div>
        </div>
      </section>
    </>
  )
}
