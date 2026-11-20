import { meta } from '@/lib/seo'
import PaginaCamadas from '@/components/PaginaCamadas'

export const metadata = meta({ titulo: 'Defesas contra ataques', descricao: 'Como o Clima Escritório se defende de força bruta, injeções (SQL, NoSQL, comando), robôs, ferramentas de ataque e truques contra a IA.', caminho: '/seguranca/defesas', og: 'funcionalidade-seguranca' })

const CAMADAS = [
  ['KeyRound', 'Força bruta e listas vazadas', 'Senha errada atrasa cada vez mais a resposta, tentativas em várias contas pelo mesmo endereço bloqueiam na hora e o login exige verificação anti-robô.'],
  ['Database', 'Injeções', 'O conteúdo de cada pedido é examinado contra SQL injection (inclusive às cegas), NoSQL, injeção de comando, de template, XXE e Log4Shell.'],
  ['Bug', 'Ferramentas de ataque', 'Programas de varredura e de força bruta conhecidos são reconhecidos e barrados; varrer a API sem login também leva a bloqueio.'],
  ['Fish', 'Iscas', 'Endereços que só robô visita (páginas de outros sistemas, arquivos de configuração) bloqueiam quem cai neles.'],
  ['Bot', 'Robôs de IA e truques na IA', 'Robôs de coleta de IA não acessam o sistema, e pedidos que tentam mudar as regras do Assistente ou pedir segredos são recusados.'],
  ['Gauge', 'Excesso e ataque em massa', 'Limite por endereço e por rajada, bloqueio progressivo e um escudo que liga sozinho num pico de acessos.'],
  ['Send', 'Bot do Telegram', 'Webhook com segredo e endereços oficiais, vínculo por código, PIN nos comandos críticos, auditoria e bloqueio automático.'],
  ['ShieldCheck', 'Testado continuamente', 'O próprio sistema confere HTTPS, certificado, cabeçalhos, arquivos expostos e CORS, e mede a conformidade com a ISO 27001.'],
]
const LISTA = [
  'Bloqueios crescem a cada reincidência: minutos, horas, um dia, uma semana.',
  'Cada tentativa vira um evento na tela de Segurança, com país, tipo e o trecho que denunciou o ataque.',
  'A equipe pode liberar o próprio endereço para não ser barrada por engano.',
  'Segredos nunca chegam ao navegador nem ao Assistente de IA.',
]

export default function Pagina() {
  return <PaginaCamadas titulo="Defesas contra ataques" texto="O que acontece quando alguém tenta entrar à força, injetar código ou enganar a IA." trilha={[{ rotulo: 'Segurança', href: '/seguranca' }, { rotulo: 'Defesas' }]}
    sub="Camadas" chamada="Quem ataca encontra uma parede, não uma porta" camadas={CAMADAS}
    subLista="Na prática" tituloLista="Bloqueio automático e registro de tudo" lista={LISTA} botoes={[{ rotulo: 'Segurança e LGPD', href: '/seguranca' }, { rotulo: 'Status do sistema', href: '/status' }]} />
}
