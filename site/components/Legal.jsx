import { BannerPagina } from '@/components/Secoes'

// Página de texto legal: seções numeradas, leitura confortável, sem efeitos.
export default function Legal({ titulo, resumo, atualizado, secoes }) {
  return (
    <>
      <BannerPagina titulo={titulo} texto={resumo} trilha={[{ rotulo: titulo }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <div className="texto-legal">
            <p className="legal-data">Última atualização: {atualizado}</p>
            {secoes.map(([t, paragrafos], i) => (
              <div key={t} className="legal-secao">
                <h2>{i + 1}. {t}</h2>
                {paragrafos.map((p, j) => (Array.isArray(p)
                  ? <ul key={j}>{p.map((x) => <li key={x}>{x}</li>)}</ul>
                  : <p key={j}>{p}</p>))}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
