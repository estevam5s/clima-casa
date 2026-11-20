import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina, Titulo } from '@/components/Secoes'

// Página de conteúdo no mesmo desenho de /seguranca: banner, grade de "camadas" (ícone, título, texto), uma lista com
// marcadores e botões. Só usa classes que o site já tem (nada novo no design system).
export default function PaginaCamadas({ titulo, texto, trilha, sub, chamada, camadas, lista, tituloLista, subLista, imagem, botoes = [] }) {
  return (
    <>
      <BannerPagina titulo={titulo} texto={texto} trilha={trilha} />
      <section className="pt-130 pb-80">
        <div className="container">
          <Titulo sub={sub} centro className="mb-50">{chamada}</Titulo>
          <div className="grade-camadas">
            {camadas.map(([i, t, d], k) => (
              <div key={t} className="camada pf_fadeup" style={{ transitionDelay: `${k * 40}ms` }}>
                <span className="camada-icone"><Icone nome={i} tamanho={26} /></span><h3>{t}</h3><p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {lista && (
        <section className="pt-60 pb-90">
          <div className="container">
            <div className="linha alinha-centro">
              {imagem && <div className="lg-6"><div className="caixa-imagem mb-50 pf_zoomIn"><img src={imagem.src} alt={imagem.alt} style={{ filter: 'none', borderRadius: 20 }} /></div></div>}
              <div className={imagem ? 'lg-6' : 'lg-12'}>
                <Titulo sub={subLista} className="mb-30">{tituloLista}</Titulo>
                <ul className="lista-check">{lista.map((t) => <li key={t} className="pf_fadeup"><span>{t}</span></li>)}</ul>
                {botoes.length > 0 && <div className="pf_fadeup" style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}>{botoes.map((b, i) => <Botao key={b.href} href={b.href} externo={b.externo} className={i ? 'contorno' : ''}>{b.rotulo}</Botao>)}</div>}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  )
}
