import { Suspense } from 'react'
import { meta } from '@/lib/seo'
import { BannerPagina, Titulo } from '@/components/Secoes'
import { EstadoNewsletter, PedirSaida } from '@/components/Newsletter'
import { FormNovidades } from '@/components/Formularios'
import Icone from '@/components/Icone'
import VERSOES from '@/lib/versoes.json'

export const metadata = meta({ titulo: 'Newsletter', descricao: 'Receba por e-mail as versões novas do Clima Escritório, os recursos que chegaram e dicas de uso. Inscrição com confirmação e cancelamento em um clique.', caminho: '/newsletter', og: 'novidades' })

const O_QUE = [
  ['Megaphone', 'Versões novas', 'O que entrou em cada publicação do sistema, explicado em poucas linhas.'],
  ['Lightbulb', 'Recursos do escritório', 'Ar, luzes, cafeteira, persianas, fechadura e música: como tirar proveito de cada um.'],
  ['ShieldCheck', 'Segurança', 'O que ficou mais protegido e o que vale revisar no seu escritório.'],
]
const COMO = [
  ['Mail', 'Inscrição com confirmação', 'Você recebe um e-mail e só entra na lista depois de clicar em "Confirmar inscrição".'],
  ['CalendarClock', 'Sem excesso', 'No máximo algumas vezes por mês, quando há novidade de verdade.'],
  ['LogOut', 'Sair em um clique', 'Todo e-mail tem o link de cancelar. Sem formulário, sem pergunta.'],
  ['Lock', 'Seu e-mail fica com a gente', 'Usado só para a newsletter. Nada de vender, ceder ou misturar com outras listas.'],
]

export default function Newsletter() {
  const ultimas = VERSOES.slice(0, 3)
  return (
    <>
      <BannerPagina titulo="Newsletter" texto="As novidades do Clima Escritório no seu e-mail: versões novas, recursos e dicas." trilha={[{ rotulo: 'Novidades', href: '/novidades' }, { rotulo: 'Newsletter' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <Suspense fallback={null}><EstadoNewsletter /></Suspense>
          <div className="linha alinha-centro">
            <div className="lg-6">
              <Titulo sub="Assinar" className="mb-30">Fique por dentro<br />do que muda</Titulo>
              <p className="pf_fadeup mb-30">Escreva o seu e-mail. Chega um pedido de confirmação; com um clique você está na lista.</p>
              <div className="pf_fadeup mb-50"><FormNovidades /></div>
            </div>
            <div className="lg-6">
              <div className="lista-cartoes-news mb-50">
                {O_QUE.map(([i, t, x]) => <div key={t} className="cartao-news pf_fadeup"><span className="ic"><Icone nome={i} tamanho={22} /></span><div><h5>{t}</h5><p>{x}</p></div></div>)}
              </div>
            </div>
          </div>
          <div className="grade-como-news">
            {COMO.map(([i, t, x]) => <div key={t} className="cartao-passo pf_fadeup"><div className="icone"><Icone nome={i} tamanho={36} traco={1.2} /></div><h5>{t}</h5><p>{x}</p></div>)}
          </div>
          <div className="pt-70 pf_fadeup"><PedirSaida /></div>
          <div className="pt-70">
            <Titulo sub="Exemplo do que chega" className="mb-30">As últimas versões</Titulo>
            <div className="linha">
              {ultimas.map((v) => (
                <div key={v.versao} className="lg-4">
                  <a href={`/novidades/versao/${v.versao}`} className="cartao-versao-mini pf_fadeup mb-30">
                    <span className="numero-versao">{v.versao}</span>
                    <h5>{v.titulo}</h5>
                    <p>{v.resumo}</p>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
