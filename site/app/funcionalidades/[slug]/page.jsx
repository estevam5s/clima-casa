import { meta } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check } from 'lucide-react'
import Botao from '@/components/Botao'
import { BannerPagina } from '@/components/Secoes'
import { FormContato } from '@/components/Formularios'
import { ENTRAR_URL, FUNCIONALIDADES, TELAS } from '@/lib/dados'

export const generateStaticParams = () => FUNCIONALIDADES.map((f) => ({ slug: f.slug }))
export async function generateMetadata({ params }) {
  const { slug } = await params
  const f = FUNCIONALIDADES.find((x) => x.slug === slug)
  return f ? meta({ titulo: `Funcionalidade: ${f.titulo}`, descricao: f.resumo, caminho: `/funcionalidades/${f.slug}`, og: `funcionalidade-${f.slug}` }) : {}
}

export default async function Funcionalidade({ params }) {
  const { slug } = await params
  const f = FUNCIONALIDADES.find((x) => x.slug === slug)
  if (!f) notFound()
  const tela = TELAS.find((t) => t.slug === f.tela)
  return (
    <>
      <BannerPagina titulo={f.titulo} texto={f.resumo} trilha={[{ rotulo: 'Funcionalidades', href: '/funcionalidades' }, { rotulo: f.titulo }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8">
              <div className="detalhe mb-50">
                {tela && <img className="principal pf_zoomIn" src={`/telas/${tela.img}`} alt={`Tela ${tela.titulo}`} />}
                <h2 className="pf_fadeup">Como funciona</h2>
                <p className="pf_fadeup">{f.texto}</p>
                <h3 className="pf_fadeup">O que você ganha</h3>
                <ul className="lista-check pf_fadeup">{f.lista.map((l) => <li key={l}><Check size={18} />{l}</li>)}</ul>
                <div className="pf_fadeup" style={{ marginTop: 40, display: 'flex', gap: 15, flexWrap: 'wrap' }}>
                  <Botao href={ENTRAR_URL} externo>Usar no sistema</Botao>
                  {tela && <Link href={`/telas/${tela.slug}`} className="leia-mais" style={{ alignSelf: 'center' }}>Ver a tela</Link>}
                </div>
              </div>
            </div>
            <div className="lg-4">
              <div className="lado-detalhe mb-40 pf_fadeup">
                <h4>Funcionalidades</h4>
                <ul>{FUNCIONALIDADES.map((x) => <li key={x.slug}><Link href={`/funcionalidades/${x.slug}`} className={x.slug === slug ? 'ativo' : ''}>{x.titulo}</Link></li>)}</ul>
              </div>
              <div className="lateral pf_fadeup"><h3>Fale com a gente</h3><p style={{ marginBottom: 25 }}>Dúvida sobre esta funcionalidade?</p><FormContato compacto /></div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
