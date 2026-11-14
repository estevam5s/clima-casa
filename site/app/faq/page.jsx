import { BannerPagina } from '@/components/Secoes'
import { Acordeao } from '@/components/Interativos'
import { FormContato } from '@/components/Formularios'
import { FAQ } from '@/lib/dados'

export const metadata = { title: 'Perguntas frequentes', description: 'Respostas diretas sobre o que o sistema faz e o que ele precisa.' }

export default function Faq() {
  return (
    <>
      <BannerPagina titulo="Perguntas frequentes" texto="O que perguntam antes de colocar o sistema no escritório." trilha={[{ rotulo: 'Perguntas' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8"><div className="mb-50"><Acordeao itens={FAQ} /></div></div>
            <div className="lg-4">
              <div className="lateral pf_fadeup">
                <h3>Fale com a gente</h3>
                <p style={{ marginBottom: 25 }}>Não achou a resposta? Mande sua pergunta.</p>
                <FormContato compacto />
              </div>
            </div>
          </div>
          <div className="texto-faq">Perguntas</div>
        </div>
      </section>
    </>
  )
}
