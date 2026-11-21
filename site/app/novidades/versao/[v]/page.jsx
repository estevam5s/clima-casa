import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { meta } from '@/lib/seo'
import { BannerPagina } from '@/components/Secoes'
import { ItensVersao, TIPOS, dataLonga } from '@/components/ItensVersao'
import VERSOES from '@/lib/versoes.json'

export const generateStaticParams = () => VERSOES.map((v) => ({ v: v.versao }))
export async function generateMetadata({ params }) {
  const { v } = await params
  const x = VERSOES.find((y) => y.versao === v)
  return x ? meta({ titulo: `Versão ${x.versao}: ${x.titulo}`, descricao: x.resumo || x.titulo, caminho: `/novidades/versao/${x.versao}`, og: 'novidades', tipo: 'article', publicado: `${x.data}T12:00:00-03:00` }) : {}
}

export default async function Versao({ params }) {
  const { v } = await params
  const i = VERSOES.findIndex((y) => y.versao === v)
  if (i < 0) notFound()
  const x = VERSOES[i], nova = VERSOES[i - 1], antiga = VERSOES[i + 1]
  return (
    <>
      <BannerPagina titulo={`Versão ${x.versao}`} texto={x.resumo || x.titulo} trilha={[{ rotulo: 'Novidades', href: '/novidades' }, { rotulo: x.versao }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8">
              <article className="detalhe mb-50">
                <p className="pf_fadeup" style={{ marginBottom: 10 }}>{dataLonga(x.data)}{i === 0 ? ' · versão atual' : ''}{x.antes ? ` · antes chamada ${x.antes}` : ''}</p>
                <h2 className="pf_fadeup" style={{ marginTop: 0 }}>{x.titulo}</h2>
                {TIPOS.filter((t) => x[t.id]?.length).map((t) => (
                  <div key={t.id} className="pf_fadeup">
                    <h3>{{ novo: 'O que é novo', melhorias: 'O que melhorou', seguranca: 'Segurança', correcoes: 'Correções' }[t.id]}</h3>
                    <ItensVersao v={x} tipos={[t.id]} />
                  </div>
                ))}
              </article>
              <div className="nav-versoes pf_fadeup">
                {antiga ? <Link href={`/novidades/versao/${antiga.versao}`}><ArrowLeft size={18} /><span><small>Anterior</small>{antiga.versao} · {antiga.titulo}</span></Link> : <span />}
                {nova ? <Link href={`/novidades/versao/${nova.versao}`} className="dir"><span><small>Seguinte</small>{nova.versao} · {nova.titulo}</span><ArrowRight size={18} /></Link> : <span />}
              </div>
            </div>
            <div className="lg-4">
              <div className="lado-detalhe pf_fadeup">
                <h4>Versões recentes</h4>
                <ul>{VERSOES.slice(0, 8).map((y) => <li key={y.versao}><Link href={`/novidades/versao/${y.versao}`} className={y.versao === x.versao ? 'ativo' : ''}><span>{y.versao}</span><span>{y.data.slice(8, 10)}/{y.data.slice(5, 7)}</span></Link></li>)}</ul>
                <p style={{ marginTop: 16 }}><Link href="/novidades" className="leia-mais">Todas as versões</Link></p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
