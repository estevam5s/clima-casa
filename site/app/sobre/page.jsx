import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import { BannerPagina, SecaoIntegracoes, SecaoProcesso, SecaoTecnologias, Titulo } from '@/components/Secoes'
import { CONTADORES, ENTRAR_URL, MARCA } from '@/lib/dados'

export const metadata = meta({ titulo: 'Sobre o sistema', descricao: 'O que é o Clima Escritório, como funciona do clique ao ar gelado e com o que ele conversa: Alexa, Google, Sinric Pro e Tuya.', caminho: '/sobre', og: 'sobre' })

export default function Sobre() {
  return (
    <>
      <BannerPagina titulo="Sobre o sistema" texto="Um painel só para todos os ares do escritório, com voz, agenda, relatórios e segurança." trilha={[{ rotulo: 'Sobre' }]} />
      <section className="pt-130 pb-80">
        <div className="container">
          <div className="linha alinha-centro">
            <div className="lg-6">
              <div className="mb-50">
                <Titulo sub="O que é" className="mb-30">Ar-condicionado comum, comandado como se fosse inteligente</Titulo>
                <p className="pf_fadeup" style={{ marginBottom: 20 }}>Ar split comum não tem Wi-Fi: só obedece ao controle remoto. O {MARCA} grava os sinais do controle original e os reenvia por um transmissor infravermelho Wi-Fi, a partir do painel, do celular, da agenda, das automações ou da voz.</p>
                <p className="pf_fadeup" style={{ marginBottom: 30 }}>O mesmo código roda em dois lugares: na nuvem (Vercel), que recebe os comandos de qualquer lugar, e num agente no computador do escritório, que fala com o transmissor na rede local.</p>
                <div className="pf_fadeup"><Botao href={ENTRAR_URL} externo>Entrar no sistema</Botao></div>
              </div>
            </div>
            <div className="lg-6"><div className="caixa-imagem mb-50 pf_zoomIn"><img src="/telas/painel.jpg" alt="Painel do sistema" style={{ filter: 'none', borderRadius: 20 }} /></div></div>
          </div>
          <div className="linha" style={{ marginTop: 40 }}>
            {CONTADORES.map((c) => (
              <div key={c.rotulo} className="lg-3 md-6">
                <div className="contador mb-40 pf_fadeup"><h2><span className="contar" data-alvo={c.n}>0</span>{c.sufixo}</h2><p>{c.rotulo}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <SecaoProcesso classe="pt-70 pb-90" />
      <SecaoTecnologias />
      <SecaoIntegracoes />
    </>
  )
}
