import { meta } from '@/lib/seo'
import PaginaCamadas from '@/components/PaginaCamadas'
import { SISTEMA_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Assistente de IA', descricao: 'Converse com o escritório: o Assistente de IA vê o estado real dos ares e age com as permissões de quem pergunta, com 13 modelos gratuitos da NVIDIA.', caminho: '/assistente-ia', og: 'sobre' })

const CAMADAS = [
  ['MessageSquare', 'Pergunte do seu jeito', '"Quais ares estão ligados?", "Coloca o ar do diretor em 23 graus", "Quanto gastamos nesta semana?". Ele consulta o sistema antes de responder.'],
  ['ShieldCheck', 'Só o que você pode', 'O Assistente age com as permissões de quem pergunta: salas, ares e ações liberadas para o seu usuário. Ações em lote pedem Confirmar.'],
  ['Cpu', '13 modelos gratuitos', 'Modelos de conversa do catálogo gratuito da NVIDIA (NVIDIA, Google, Meta, Mistral, MiniMax, Kimi e outros). O seletor mostra quais conseguem agir nos ares.'],
  ['History', 'Conversas salvas', 'Histórico por pessoa, com fixar, renomear, procurar, exportar em Markdown e comandos com "/" para as perguntas mais comuns.'],
  ['Send', 'Também no Telegram', 'Mande um texto livre para o bot e a mesma IA responde no celular, com as mesmas regras e permissões.'],
  ['Lock', 'Protegido contra truques', 'Pedidos que tentam mudar as regras da IA ou pedir chaves e senhas são recusados e viram evento de segurança.'],
]
const LISTA = [
  'Diagnóstico: por que um comando não chegou ao ar e o que fazer.',
  'Timers: "desliga o ar dos devs daqui a 30 minutos".',
  'Relatórios: gasto, consumo, horas ligado e ranking por período.',
  'Tempo lá fora e a temperatura recomendada para os ares.',
  'Luzes, persianas, cafeteira e fechadura com o mesmo pedido em português.',
]

export default function Pagina() {
  return <PaginaCamadas titulo="Assistente de IA" texto="Converse com o escritório em português: ele vê o estado real e só faz o que o seu usuário pode." trilha={[{ rotulo: 'Assistente de IA' }]}
    sub="Como funciona" chamada="Uma conversa no lugar de vários cliques" camadas={CAMADAS}
    subLista="Exemplos" tituloLista="O que dá para pedir" lista={LISTA} botoes={[{ rotulo: 'Abrir o Assistente', href: `${SISTEMA_URL}/ia`, externo: true }, { rotulo: 'Bot do Telegram', href: '/bot-telegram' }]} />
}
