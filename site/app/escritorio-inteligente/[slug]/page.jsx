import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, Plug } from 'lucide-react'
import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina } from '@/components/Secoes'
import { DISPOSITIVOS, SISTEMA_URL } from '@/lib/dados'

export const generateStaticParams = () => DISPOSITIVOS.map((d) => ({ slug: d.slug }))
export async function generateMetadata({ params }) {
  const { slug } = await params
  const d = DISPOSITIVOS.find((x) => x.slug === slug)
  return d ? meta({ titulo: d.titulo, descricao: d.resumo, caminho: `/escritorio-inteligente/${d.slug}`, og: 'funcionalidades' }) : {}
}

export default async function Dispositivo({ params }) {
  const { slug } = await params
  const d = DISPOSITIVOS.find((x) => x.slug === slug)
  if (!d) notFound()
  return (
    <>
      <BannerPagina titulo={d.titulo} texto={d.resumo} trilha={[{ rotulo: 'Escritório', href: '/escritorio-inteligente' }, { rotulo: d.curto }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8">
              <div className="detalhe mb-50">
                <div className="icone-dispositivo pf_fadeup"><Icone nome={d.icone} tamanho={44} traco={1.2} /></div>
                <h2 className="pf_fadeup" style={{ marginTop: 20 }}>Como funciona</h2>
                <p className="pf_fadeup">{d.texto}</p>
                <h3 className="pf_fadeup">O que dá para fazer</h3>
                <ul className="lista-check pf_fadeup">{d.lista.map((l) => <li key={l}><Check size={18} /><span>{l}</span></li>)}</ul>
                <h3 className="pf_fadeup">O que precisa</h3>
                <ul className="lista-check pf_fadeup">{d.precisa.map((l) => <li key={l}><Plug size={18} /><span>{l}</span></li>)}</ul>
                <div className="pf_fadeup" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 40 }}>
                  <Botao href={`${SISTEMA_URL}${d.sistema}`} externo hover="ABRIR NO PAINEL">Ver no sistema</Botao>
                  <Botao href="/contato" className="contorno">Tirar uma dúvida</Botao>
                </div>
              </div>
            </div>
            <div className="lg-4">
              <div className="lado-detalhe pf_fadeup">
                <h4>Outros aparelhos</h4>
                <ul>{DISPOSITIVOS.map((x) => <li key={x.slug}><Link href={`/escritorio-inteligente/${x.slug}`} className={x.slug === d.slug ? 'ativo' : ''}><span>{x.titulo}</span><Icone nome={x.icone} tamanho={18} /></Link></li>)}</ul>
                <p style={{ marginTop: 16 }}><Link href="/escritorio-inteligente" className="leia-mais">Visão geral</Link></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
