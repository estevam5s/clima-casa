import { meta } from '@/lib/seo'
import { BannerPagina, Titulo } from '@/components/Secoes'

export const metadata = meta({ titulo: 'Glossário', descricao: 'Os termos do Clima Escritório explicados: agente, transmissor, zona, botão gravado, Sinric, portão, PIN e mais.', caminho: '/glossario', og: 'sobre' })

const TERMOS = [
  ['Agente', 'O programa que roda num computador do escritório e fala com os transmissores pela rede local. Sem um agente no escritório, os comandos não chegam aos ares.'],
  ['Agente principal e reserva', 'Com vários computadores, só um executa (o principal); os outros esperam e assumem em até 45 segundos se ele sumir.'],
  ['Transmissor', 'O aparelho infravermelho Wi-Fi (Smart IR) instalado no teto que reenvia os sinais do controle remoto para os ares à vista dele.'],
  ['Botão gravado', 'Um sinal do controle remoto original guardado no sistema, como "Desligar" ou "Frio 23° ventilação alta".'],
  ['Zona', 'Ares iguais à vista do mesmo transmissor obedecem ao mesmo sinal: o sistema trata o grupo como uma zona e muda todos juntos.'],
  ['Teste de interferência', 'Assistente que manda o sinal de um ar por vez para descobrir quais ares respondem juntos.'],
  ['Sinric Pro', 'O serviço que liga os ares à Alexa e ao Google Home: cada ar (ou zona) aparece como um aparelho na casa da Alexa.'],
  ['Fila de comandos', 'Quando o pedido nasce na nuvem, ele vira uma linha na fila; o agente executa e devolve o resultado.'],
  ['Portão', 'A página de verificação anti-robô que aparece antes do site e do sistema.'],
  ['Escudo', 'Modo de defesa que liga sozinho num pico de acessos e endurece os limites por um tempo.'],
  ['PIN do Telegram', 'Seis dígitos definidos no painel para liberar os comandos críticos do bot por 10 minutos.'],
  ['Kanban das mensagens', 'Quadro com as pessoas que escreveram pelo site, organizadas por etapa do atendimento.'],
]

export default function Pagina() {
  return (
    <>
      <BannerPagina titulo="Glossário" texto="As palavras do sistema, explicadas em uma frase." trilha={[{ rotulo: 'Glossário' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <Titulo sub="De A a Z" centro className="mb-50">Termos que aparecem no painel e no guia</Titulo>
          <div className="grade-camadas">
            {TERMOS.map(([t, d], k) => (
              <div key={t} id={t.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')} className="camada pf_fadeup" style={{ transitionDelay: `${(k % 4) * 40}ms` }}><h3>{t}</h3><p>{d}</p></div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
