import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Espiral from '@/components/Espiral'
import { VideoExplicativo } from '@/components/VideoExplicativo'
import { SecaoComandos, SecaoFuncionalidades, SecaoIntegracoes, SecaoNovidades, SecaoNumeros, SecaoProcesso, SecaoTecnologias, SecaoTelas } from '@/components/Secoes'

export const metadata = meta({ caminho: '/', og: 'inicio' })

export default function Inicio() {
  return (
    <>
      <section className="heroi-secao">
        <div className="heroi">
          <div className="mancha m1"><span /></div>
          <div className="mancha m2"><span /></div>
          <div className="mancha m3"><span /></div>
          <div className="container">
            <div className="heroi-conteudo">
              <h1 className="text-anm">Clima</h1>
              <div className="texto-grande text-anm">Certo</div>
              <div className="caixa-heroi pf_zoomIn">
                <p>Somos o <span className="destaque">Clima Escritório</span>: os ares-condicionados do escritório comandados por infravermelho, pelo painel, pelo celular ou pela Alexa.</p>
                <div className="heroi-botao"><Botao href="/funcionalidades">Saiba mais</Botao></div>
              </div>
              <div className="elemento"><Espiral tamanho={150} faixas={18} cor="rgba(140,130,200,.55)" className="gira" /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="video">
        <div className="container">
          <div className="pf_zoomIn"><VideoExplicativo capa="/telas/painel.jpg" /></div>
        </div>
      </section>

      <SecaoFuncionalidades />
      <SecaoTelas />
      <SecaoProcesso />
      <SecaoTecnologias />
      <SecaoIntegracoes />
      <SecaoNumeros />
      <SecaoComandos />
      <SecaoNovidades />
    </>
  )
}
