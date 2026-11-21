import Link from 'next/link'
import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina, Titulo } from '@/components/Secoes'
import { DISPOSITIVOS, ENTRAR_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Escritório inteligente', descricao: 'Ar-condicionado, iluminação, cafeteira, persianas, fechadura e música no mesmo painel, com Alexa, automações, travas de segurança e o mapa 3D do escritório.', caminho: '/escritorio-inteligente', og: 'funcionalidades' })

const JUNTOS = [
  ['Sunset', 'Anoiteceu', 'As luzes das salas acendem pelo pôr do sol real do dia, uma vez: se alguém apagar, o sistema não insiste.'],
  ['DoorOpen', 'Chegou alguém à noite', 'Destrancou a porta depois do anoitecer: as luzes acendem para quem entra.'],
  ['Sun', 'O sol esquentou', 'As persianas fecham sozinhas e o ar não precisa trabalhar tanto.'],
  ['Coffee', 'Começo do expediente', 'A agenda liga a cafeteira de manhã; ela desliga sozinha depois, por segurança.'],
  ['Music2', 'O ar ligou', 'Uma rotina pode tocar a playlist do escritório quando o primeiro ar liga.'],
  ['Moon', 'Fim do expediente', '"Alexa, fim do expediente": a rotina desliga os ares de uma vez.'],
]
const TRAVAS = [
  'Estado seguro sempre passa: desligar, fechar, parar e trancar nunca são barrados',
  'Limite de comandos por minuto em cada aparelho (contra rajadas e automações em laço)',
  'Ar-condicionado: no máximo 8 trocas de ligado e desligado em 10 minutos, para poupar o compressor',
  'Comando de infravermelho parado na fila por mais de 20 segundos é descartado',
  'Isolar um aparelho suspeito: ele só aceita o estado seguro até alguém liberar',
  'Destrancar a porta só com a senha de quem pede, e tudo fica registrado',
]

export default function Escritorio() {
  return (
    <>
      <BannerPagina titulo="Escritório inteligente" texto="Os aparelhos que o escritório já tem, comandados do mesmo painel, do celular e pela voz." trilha={[{ rotulo: 'Escritório' }]} />

      <section className="pt-130">
        <div className="container">
          <div className="linha alinha-fim">
            <div className="lg-6"><Titulo sub="Um painel só" className="mb-50">Ar, luz, café, persianas,<br />porta e música</Titulo></div>
            <div className="lg-6"><div className="caixa-texto empurra-direita pf_fadeup mb-50"><p>Cada aparelho aparece na sua tela, no app, na Alexa, no Telegram, no assistente de IA e no <span>mapa 3D</span> do escritório.</p></div></div>
          </div>
          <div className="grade-dispositivos">
            {DISPOSITIVOS.map((d) => (
              <Link key={d.slug} href={`/escritorio-inteligente/${d.slug}`} className="cartao-dispositivo pf_fadeup">
                <span className="ic"><Icone nome={d.icone} tamanho={30} traco={1.3} /></span>
                <h4>{d.titulo}</h4>
                <p>{d.resumo}</p>
                <span className="leia-mais">Ver detalhes</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-130">
        <div className="container">
          <Titulo sub="Tudo junto" centro className="mb-50">Um aparelho avisa o outro</Titulo>
          <div className="grade-juntos">
            {JUNTOS.map(([i, t, x]) => (
              <div key={t} className="cartao-passo pf_fadeup">
                <div className="icone"><Icone nome={i} tamanho={40} traco={1.2} /></div>
                <h5>{t}</h5>
                <p>{x}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pt-130 pb-90">
        <div className="container">
          <div className="linha alinha-centro">
            <div className="lg-6">
              <Titulo sub="Travas de segurança" className="mb-30">Mexe em equipamento<br />de verdade, com cuidado</Titulo>
              <p className="pf_fadeup mb-30">Todo comando passa por travas no servidor antes de sair, venha de onde vier: painel, app, Alexa, Telegram, assistente de IA, agenda ou automação.</p>
              <div className="pf_fadeup mb-50" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Botao href="/seguranca">Ver a segurança</Botao><Botao href={ENTRAR_URL} externo className="contorno" hover="ABRIR O PAINEL">Entrar no sistema</Botao></div>
            </div>
            <div className="lg-6">
              <ul className="lista-check mb-50 pf_fadeup">{TRAVAS.map((t) => <li key={t}><Icone nome="ShieldCheck" tamanho={18} /><span>{t}</span></li>)}</ul>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
