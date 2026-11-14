import { meta } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check } from 'lucide-react'
import { BannerPagina, dataBR } from '@/components/Secoes'
import { NOVIDADES } from '@/lib/dados'

export const generateStaticParams = () => NOVIDADES.map((n) => ({ slug: n.slug }))
export async function generateMetadata({ params }) {
  const { slug } = await params
  const n = NOVIDADES.find((x) => x.slug === slug)
  return n ? meta({ titulo: n.titulo, descricao: n.resumo, caminho: `/novidades/${n.slug}`, og: `novidade-${n.slug}`, tipo: 'article', publicado: `${n.data}T12:00:00-03:00` }) : {}
}

export default async function Novidade({ params }) {
  const { slug } = await params
  const n = NOVIDADES.find((x) => x.slug === slug)
  if (!n) notFound()
  return (
    <>
      <BannerPagina titulo="Novidades" texto={n.resumo} trilha={[{ rotulo: 'Novidades', href: '/novidades' }, { rotulo: n.categoria }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8">
              <div className="detalhe mb-50">
                <p className="pf_fadeup" style={{ marginBottom: 10 }}>{dataBR(n.data)} · {n.categoria}</p>
                <h2 className="pf_fadeup" style={{ marginTop: 0 }}>{n.titulo}</h2>
                <img className="principal pf_zoomIn" src={`/telas/${n.img}`} alt="" style={{ marginBottom: 30 }} />
                <h3 className="pf_fadeup">O que mudou</h3>
                <ul className="lista-check pf_fadeup">{n.itens.map((l) => <li key={l}><Check size={18} />{l}</li>)}</ul>
              </div>
            </div>
            <div className="lg-4">
              <div className="lado-detalhe pf_fadeup">
                <h4>Outras novidades</h4>
                <ul>{NOVIDADES.filter((x) => x.slug !== slug).slice(0, 5).map((x) => <li key={x.slug}><Link href={`/novidades/${x.slug}`}>{x.titulo.length > 42 ? `${x.titulo.slice(0, 40)}…` : x.titulo}</Link></li>)}</ul>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
