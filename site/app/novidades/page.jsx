import { BannerPagina, CartaoNovidade } from '@/components/Secoes'
import { NOVIDADES } from '@/lib/dados'

export const metadata = { title: 'Novidades', description: 'O que mudou em cada versão do sistema.' }

export default function Novidades() {
  return (
    <>
      <BannerPagina titulo="Novidades" texto="Cada mudança publicada no sistema, da mais nova para a mais antiga." trilha={[{ rotulo: 'Novidades' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">{NOVIDADES.map((n) => <div key={n.slug} className="xl-6"><CartaoNovidade n={n} /></div>)}</div>
        </div>
      </section>
    </>
  )
}
