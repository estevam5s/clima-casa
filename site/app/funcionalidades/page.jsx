import { BannerPagina, CartaoFuncionalidade, SecaoProcesso } from '@/components/Secoes'
import { FUNCIONALIDADES } from '@/lib/dados'

export const metadata = { title: 'Funcionalidades', description: 'Controle por infravermelho, Alexa e Google, agenda, automações, relatórios, segurança e apps.' }

export default function Funcionalidades() {
  return (
    <>
      <BannerPagina titulo="Funcionalidades" texto="Tudo o que o sistema faz hoje, de verdade, na versão 1.0." trilha={[{ rotulo: 'Funcionalidades' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">{FUNCIONALIDADES.map((f) => <div key={f.slug} className="lg-4 md-6"><CartaoFuncionalidade f={f} /></div>)}</div>
        </div>
      </section>
      <SecaoProcesso classe="pt-70 pb-90" />
    </>
  )
}
