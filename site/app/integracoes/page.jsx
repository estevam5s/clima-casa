import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina, Titulo } from '@/components/Secoes'
import { ENTRAR_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Integrações', descricao: 'Alexa, Google Home, Sinric Pro, Smart Life (Tuya) e a skill própria: com o que o Clima Escritório conversa e como conectar.', caminho: '/integracoes', og: 'funcionalidade-alexa-e-google' })

const ITENS = [
  { icone: 'Mic', nome: 'Amazon Alexa', papel: 'Voz', texto: 'Ligar, desligar, mudar a temperatura e o modo falando. Funciona pela skill do Sinric Pro ou pela skill própria do sistema.',
    passos: ['No app Alexa, ative a skill Sinric Pro', 'Entre com a mesma conta do sistema', 'Peça “Alexa, descobrir dispositivos”'], frase: '“Alexa, ligar o ar do escritório”' },
  { icone: 'siGooglehome', nome: 'Google Home', papel: 'Voz', texto: 'Os mesmos ares aparecem no Google Home e no Google Assistente, com temperatura e modo.',
    passos: ['No Google Home, adicione “Funciona com o Google”', 'Procure Sinric Pro e entre', 'Os ares aparecem na casa escolhida'], frase: '“Ok Google, ar da reunião em 23 graus”' },
  { icone: 'Plug', nome: 'Sinric Pro', papel: 'Ponte de voz', texto: 'Conecta o sistema às assistentes de voz. O sistema cria e renomeia os dispositivos sozinho quando você cadastra um ar.',
    passos: ['Crie a conta no Sinric Pro', 'Cole as chaves em Integrações no sistema', 'Marque “Disponível na Alexa” em cada ar'], frase: 'Plano gratuito: até 3 aparelhos' },
  { icone: 'Radio', nome: 'Smart Life (Tuya)', papel: 'Infravermelho', texto: 'O app onde o transmissor é pareado. O sistema importa os transmissores e reconfigura sozinho quando a rede ou a chave mudam.',
    passos: ['Pareie o transmissor no Smart Life', 'Em Configurações, leia o QR Code', 'Importe os transmissores'], frase: 'Uma vez só por conta' },
  { icone: 'Sparkles', nome: 'Skill própria', papel: 'Voz sem limite', texto: 'Alternativa ao Sinric para muitos aparelhos: a Alexa conversa direto com o sistema e também ativa cenas.',
    passos: ['Crie a skill no console da Amazon', 'Use as URLs da tela Skill própria', 'Vincule a conta no app Alexa'], frase: '“Alexa, ativar Fim do expediente”' },
  { icone: 'siSupabase', nome: 'Supabase', papel: 'Banco e rotinas', texto: 'Guarda aparelhos, botões gravados, agenda e histórico, com backups diários e rotinas automáticas de limpeza e alerta.',
    passos: ['Já vem configurado', 'Acompanhe em Supabase no sistema', 'Baixe os backups quando quiser'], frase: 'Backup todo dia às 2h' },
]

export default function Integracoes() {
  return (
    <>
      <BannerPagina titulo="Integrações" texto="Voz, infravermelho e nuvem: tudo o que o sistema usa para o ar obedecer." trilha={[{ rotulo: 'Integrações' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <Titulo sub="Conecte" centro className="mb-50">Com o que o Clima Escritório conversa</Titulo>
          <div className="grade-integracoes">
            {ITENS.map((it) => (
              <article key={it.nome} className="cartao-integracao pf_fadeup">
                <header><span className="camada-icone"><Icone nome={it.icone} tamanho={26} /></span><div><h3>{it.nome}</h3><small>{it.papel}</small></div></header>
                <p>{it.texto}</p>
                <ol>{it.passos.map((p) => <li key={p}>{p}</li>)}</ol>
                <footer>{it.frase}</footer>
              </article>
            ))}
          </div>
          <div className="texto-centro pf_fadeup" style={{ marginTop: 50 }}><Botao href={ENTRAR_URL} externo>Conectar no sistema</Botao></div>
        </div>
      </section>
    </>
  )
}
