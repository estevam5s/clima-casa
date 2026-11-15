import Link from 'next/link'
import { BannerPagina } from '@/components/Secoes'
import Botao from '@/components/Botao'
import IndiceLegal from '@/components/IndiceLegal'

// Página legal no padrão do site: seções em cartões (como as perguntas do FAQ) e coluna lateral com
// resumo, índice e o canal do encarregado. Blocos aceitos: texto, lista, tabela e destaque.
function Bloco({ b }) {
  if (typeof b === 'string') return <p>{b}</p>
  if (b.lista) return <ul>{b.lista.map((x) => <li key={x}>{x}</li>)}</ul>
  if (b.destaque) return <p className="legal-destaque">{b.destaque}</p>
  if (b.tabela) return (
    <div className="legal-tabela">
      <table>
        <thead><tr>{b.tabela[0].map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>{b.tabela.slice(1).map((l) => <tr key={l.join('|')}>{l.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
  return null
}

export default function Legal({ titulo, resumo, atualizado, emResumo, secoes, outra }) {
  return (
    <>
      <BannerPagina titulo={titulo} texto={resumo} trilha={[{ rotulo: titulo }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha">
            <div className="lg-8">
              <p className="legal-data pf_fadeup">Versão em vigor desde {atualizado}</p>
              {secoes.map((s, i) => (
                <article key={s.id} id={s.id} className="legal-secao pf_fadeup">
                  <span className="legal-num">{String(i + 1).padStart(2, '0')}</span>
                  <h2>{s.titulo}</h2>
                  {s.blocos.map((b, j) => <Bloco key={j} b={b} />)}
                </article>
              ))}
            </div>
            <div className="lg-4">
              <aside className="legal-lateral">
                <div className="lateral pf_fadeup">
                  <h3>Em resumo</h3>
                  <ul className="legal-resumo">{emResumo.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                <div className="lateral pf_fadeup">
                  <h3>Nesta página</h3>
                  <IndiceLegal itens={secoes.map((s) => [s.id, s.titulo])} />
                </div>
                <div className="lateral pf_fadeup">
                  <h3>Fale com o encarregado</h3>
                  <p style={{ marginBottom: 25 }}>Pedidos sobre seus dados, dúvidas sobre privacidade ou sobre estes termos: escreva pelo formulário com o assunto “Privacidade”. Resposta em até 15 dias.</p>
                  <Botao href="/contato">Abrir o contato</Botao>
                  {outra && <p className="legal-outra">Veja também: <Link href={outra[0]}>{outra[1]}</Link></p>}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
