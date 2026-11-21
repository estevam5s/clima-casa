import { meta } from '@/lib/seo'
import PaginaCamadas from '@/components/PaginaCamadas'
import { SISTEMA_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Bot do Telegram', descricao: 'Controle os ares pelo Telegram: 1.114 comandos em 28 categorias, menu por botões, avisos e segurança com PIN, auditoria e bloqueio automático.', caminho: '/bot-telegram', og: 'sobre' })

const CAMADAS = [
  ['Send', '1.114 comandos', 'Ligar, desligar, modo, temperatura e ventilação num toque (/frio23alta), salas, zonas, timers, relatórios, luzes, música e mais, em 28 categorias.'],
  ['LayoutGrid', 'Menu por botões', 'Quem não quer decorar comando navega pelo menu: categoria, item e ação, com o "ar atual" lembrado na conversa.'],
  ['Bell', 'Avisos no celular', 'Notificações importantes (agente fora do ar, transmissor sem resposta, segurança) chegam no Telegram de quem pediu.'],
  ['KeyRound', 'PIN nos comandos críticos', 'Destrancar a porta, ligar o escudo, bloquear IP ou reiniciar o agente pedem um PIN de 6 dígitos definido no painel.'],
  ['ScrollText', 'Auditoria completa', 'Toda interação fica registrada: quem, o quê, o resultado e o servidor do Telegram que entregou. O dono analisa em Segurança.'],
  ['ShieldAlert', 'Bloqueio automático', 'Conversa sem vínculo, flood de comandos, PIN errado ou identidade diferente do vínculo bloqueiam a conversa sozinhos.'],
]
const LISTA = [
  'Vínculo por código de uso único gerado no painel: o bot age com as permissões da sua conta.',
  'Só conversas privadas; grupos e canais são ignorados.',
  'Ações em lote pedem Confirmar por botão que vence em 60 segundos.',
  'O webhook só aceita o segredo do bot vindo dos servidores oficiais do Telegram.',
  'Vínculo sem uso por 60 dias expira e precisa ser refeito.',
]

export default function Pagina() {
  return <PaginaCamadas titulo="Bot do Telegram" texto="O escritório no bolso: comandos, menu, avisos e a IA, com a mesma segurança do painel." trilha={[{ rotulo: 'Bot do Telegram' }]}
    sub="Recursos" chamada="Tudo o que o painel faz, numa conversa" camadas={CAMADAS}
    subLista="Segurança" tituloLista="Mais rígido que o painel" lista={LISTA} botoes={[{ rotulo: 'Vincular meu Telegram', href: `${SISTEMA_URL}/telegram`, externo: true }, { rotulo: 'Defesas do sistema', href: '/seguranca/defesas' }]} />
}
