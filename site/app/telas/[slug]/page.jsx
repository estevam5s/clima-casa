import { meta } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import Botao from '@/components/Botao'
import { BannerPagina, CartaoTela } from '@/components/Secoes'
import { ENTRAR_URL, TELAS } from '@/lib/dados'

export const generateStaticParams = () => TELAS.map((t) => ({ slug: t.slug }))
export async function generateMetadata({ params }) {
  const { slug } = await params
  const t = TELAS.find((x) => x.slug === slug)
  return t ? meta({ titulo: t.titulo, descricao: t.resumo, caminho: `/telas/${t.slug}`, og: `tela-${t.slug}` }) : {}
}

export default async function Tela({ params }) {
  const { slug } = await params
  const i = TELAS.findIndex((x) => x.slug === slug)
  if (i < 0) notFound()
  const t = TELAS[i]
  const outras = [TELAS[(i + 1) % TELAS.length], TELAS[(i + 2) % TELAS.length]]
  return (
    <>
      <BannerPagina titulo={t.titulo} texto={t.resumo} trilha={[{ rotulo: 'Telas', href: '/telas' }, { rotulo: t.titulo }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="detalhe">
            <img className="principal pf_zoomIn" src={`/telas/${t.img}`} alt={`Tela ${t.titulo}`} />
            <div className="linha" style={{ marginTop: 50 }}>
              <div className="lg-8">
                <h2 className="pf_fadeup" style={{ marginTop: 0 }}>Sobre esta tela</h2>
                <p className="pf_fadeup">{t.texto}</p>
              </div>
              <div className="lg-4">
                <div className="lado-detalhe pf_fadeup">
                  <h4>Detalhes</h4>
                  <p style={{ marginBottom: 15 }}>{t.tags.join(' · ')}</p>
                  <Botao href={ENTRAR_URL} externo>Abrir no sistema</Botao>
                </div>
              </div>
            </div>
          </div>
          <h2 className="pf_fadeup" style={{ margin: '80px 0 40px' }}>Outras telas</h2>
          <div className="linha">{outras.map((o) => <div key={o.slug} className="lg-6"><CartaoTela t={o} /></div>)}</div>
          <div className="pf_fadeup"><Link href="/telas" className="leia-mais">Ver todas as telas</Link></div>
        </div>
      </section>
    </>
  )
}
