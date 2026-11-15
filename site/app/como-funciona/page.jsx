import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import { BannerPagina, SecaoProcesso, Titulo } from '@/components/Secoes'
import { PlayerExplicativo } from '@/components/VideoExplicativo'
import { ENTRAR_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Como funciona', descricao: 'Vídeo e passo a passo: como o Clima Escritório grava o controle do ar, recebe o comando e liga o aparelho em cerca de 1 segundo.', caminho: '/como-funciona', og: 'sobre' })

const PRECISA = [
  ['Transmissor infravermelho Wi-Fi', 'Um por sala (modelo Tuya SRW-004 ou compatível), instalado de frente para os ares.'],
  ['Wi-Fi de 2,4 GHz', 'O transmissor só conecta em redes 2,4 GHz. A mesma rede do computador do escritório.'],
  ['Um computador ligado no escritório', 'Roda o agente que fala com os transmissores na rede local. Sem ele, o envio tenta a nuvem Tuya.'],
  ['Conta Smart Life', 'O app gratuito em que o transmissor é pareado. O sistema lê de lá a chave de cada transmissor.'],
]
const INSTALAR = [
  ['Pareie o transmissor', 'No app Smart Life, adicione o transmissor na rede 2,4 GHz do escritório.'],
  ['Conecte a conta', 'No sistema, em Configurações, leia o QR Code com o Smart Life. É feito uma vez só.'],
  ['Cadastre os ares', 'Informe nome, sala, marca e a faixa de temperatura de cada aparelho.'],
  ['Grave os botões', 'Aponte o controle original para o transmissor e aperte cada botão quando o sistema pedir.'],
  ['Ligue a voz (opcional)', 'Conecte o Sinric Pro e a skill na Alexa ou no Google Home para comandar falando.'],
]

export default function ComoFunciona() {
  return (
    <>
      <BannerPagina titulo="Como funciona" texto="Do controle remoto ao comando de voz: o caminho de cada clique até o ar gelado." trilha={[{ rotulo: 'Como funciona' }]} />
      <section className="pt-130 pb-80">
        <div className="container">
          <Titulo sub="Vídeo · 50 segundos" className="mb-40">Assista e entenda em menos de um minuto</Titulo>
          <div className="pf_fadeup"><PlayerExplicativo /></div>
        </div>
      </section>
      <SecaoProcesso classe="pt-40 pb-60" />
      <section className="pt-80 pb-80">
        <div className="container">
          <div className="linha">
            <div className="lg-6">
              <Titulo sub="Antes de começar" className="mb-40">O que você precisa</Titulo>
              <ul className="lista-check">{PRECISA.map(([t, d]) => <li key={t} className="pf_fadeup"><strong>{t}</strong><span>{d}</span></li>)}</ul>
            </div>
            <div className="lg-6">
              <Titulo sub="Instalação" className="mb-40">Em cinco passos</Titulo>
              <ol className="lista-passos">{INSTALAR.map(([t, d], i) => <li key={t} className="pf_fadeup"><b>{String(i + 1).padStart(2, '0')}</b><div><strong>{t}</strong><span>{d}</span></div></li>)}</ol>
              <div className="pf_fadeup" style={{ marginTop: 30 }}><Botao href={ENTRAR_URL} externo>Entrar no sistema</Botao></div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
