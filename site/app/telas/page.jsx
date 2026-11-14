import { BannerPagina, CartaoTela } from '@/components/Secoes'
import { TELAS } from '@/lib/dados'

export const metadata = { title: 'Telas do sistema', description: 'Capturas reais do painel: 3D, segurança, relatórios, apps, notificações e mais.' }

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
