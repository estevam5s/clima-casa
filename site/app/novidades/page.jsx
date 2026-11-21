import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import { BannerPagina, CartaoNovidade, Titulo } from '@/components/Secoes'
import LinhaVersoes from '@/components/Versoes'
import { TIPOS, dataLonga } from '@/components/ItensVersao'
import { FormNovidades } from '@/components/Formularios'
import { NOVIDADES } from '@/lib/dados'
import VERSOES from '@/lib/versoes.json'

export const metadata = meta({ titulo: 'Novidades', descricao: `Todas as ${VERSOES.length} versões do Clima Escritório: o que entrou de novo, o que melhorou, segurança e correções, da mais nova para a mais antiga.`, caminho: '/novidades', og: 'novidades' })

export default function Novidades() {
  const total = (id) => VERSOES.reduce((n, v) => n + (v[id]?.length || 0), 0)
  const atual = VERSOES[0]
  const primeira = VERSOES[VERSOES.length - 1]
  return (
    <>
      <BannerPagina titulo="Novidades" texto="Tudo o que mudou no sistema, versão por versão: o que é novo, o que melhorou, o que ficou mais seguro e o que foi corrigido." trilha={[{ rotulo: 'Novidades' }]} />

      <section className="pt-130">
        <div className="container">
          <div className="resumo-versoes pf_fadeup">
            <div className="atual">
              <span className="sub-titulo">Versão atual</span>
              <h2>{atual.versao}</h2>
              <h4>{atual.titulo}</h4>
              <p>{dataLonga(atual.data)} · {atual.resumo}</p>
              <Botao href={`/novidades/versao/${atual.versao}`}>Ver o que entrou</Botao>
            </div>
            <ul className="numeros-versoes">
              <li><b>{VERSOES.length}</b><span>versões publicadas</span></li>
              {TIPOS.map((t) => <li key={t.id} style={{ '--cor': t.cor }}><b>{total(t.id)}</b><span><i />{t.rotulo === 'Novo' ? 'recursos novos' : t.rotulo === 'Melhoria' ? 'melhorias' : t.rotulo === 'Segurança' ? 'reforços de segurança' : 'correções'}</span></li>)}
              <li><b>{Math.max(1, Math.round((new Date(`${atual.data}T12:00:00`) - new Date(`${primeira.data}T12:00:00`)) / 86400000) + 1)}</b><span>dias, da primeira versão à atual</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="pt-130" id="destaques">
        <div className="container">
          <div className="linha alinha-centro">
            <div className="lg-7"><Titulo sub="Destaques" className="mb-50">As mudanças maiores,<br />explicadas</Titulo></div>
            <div className="lg-5"><div className="caixa-texto empurra-direita mb-50 pf_fadeup"><p>Cada destaque junta várias versões num texto só, com a tela de onde a mudança aparece.</p></div></div>
          </div>
          <div className="linha">{NOVIDADES.slice(0, 4).map((n) => <div key={n.slug} className="xl-6"><CartaoNovidade n={n} /></div>)}</div>
        </div>
      </section>

      <section className="pt-70 pb-90">
        <div className="container">
          <Titulo sub="Todas as versões" className="mb-50">Linha do tempo completa</Titulo>
          <LinhaVersoes versoes={VERSOES} />
        </div>
      </section>

      <section className="pb-130">
        <div className="container">
          <div className="faixa-newsletter pf_fadeup">
            <div><h3>Receba as próximas versões por e-mail</h3><p>No máximo algumas vezes por mês. Para sair, um clique no próprio e-mail.</p></div>
            <FormNovidades />
          </div>
        </div>
      </section>
    </>
  )
}
