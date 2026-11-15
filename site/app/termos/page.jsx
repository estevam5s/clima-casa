import { meta } from '@/lib/seo'
import Legal from '@/components/Legal'

export const metadata = meta({ titulo: 'Termos de uso', descricao: 'As regras para usar o zynio (Clima Escritório): contas, uso permitido, limites do controle por infravermelho e responsabilidades.', caminho: '/termos', og: 'sobre' })

const SECOES = [
  ['Aceite', [
    'Ao entrar no zynio (Clima Escritório) você concorda com estes termos e com a Política de privacidade. Se não concordar, não use o sistema.',
  ]],
  ['Contas', [
    'Não existe cadastro público: as contas são criadas por um administrador do escritório, que define o nível de acesso e os projetos de cada pessoa. Você é responsável por manter sua senha em segredo e pode ativar a verificação em duas etapas e o login com biometria. O login com Google só funciona para e-mails que já têm conta no sistema.',
  ]],
  ['Uso permitido', [
    'O sistema serve para controlar os ares-condicionados do escritório. Não é permitido:',
    [
      'tentar acessar contas, projetos ou dados que não são seus;',
      'atacar, sobrecarregar ou procurar falhas no sistema sem autorização;',
      'usar robôs ou programas automáticos fora das integrações oferecidas (Alexa, Google Home, apps).',
    ],
    'Acessos que violem estas regras são bloqueados automaticamente e a conta pode ser desativada.',
  ]],
  ['Como o controle funciona e seus limites', [
    'O sistema envia os mesmos sinais infravermelhos do controle remoto original, por meio de transmissores Wi-Fi. O ar-condicionado não informa o próprio estado de volta: se alguém usar o controle original, o sistema pode mostrar um estado diferente do real. Os comandos dependem da energia, do Wi-Fi do escritório e do computador do agente estarem funcionando.',
  ]],
  ['Integrações de terceiros', [
    'Alexa, Google Home, Smart Life e Sinric Pro são serviços de outras empresas, com termos próprios. O funcionamento deles não depende de nós.',
  ]],
  ['Disponibilidade', [
    'Trabalhamos para manter o sistema no ar, mas ele pode ficar indisponível por manutenção ou falhas de provedores. Agendamentos e automações que dependem do agente no escritório não rodam enquanto ele estiver desligado.',
  ]],
  ['Responsabilidade', [
    'O sistema é uma ferramenta de conveniência e economia de energia. Ele não substitui a manutenção dos aparelhos nem garante temperatura em ambientes que exigem controle crítico (servidores, laboratórios, medicamentos).',
  ]],
  ['Mudanças', [
    'Estes termos podem mudar. A data no topo mostra a versão atual; mudanças importantes são avisadas dentro do sistema.',
  ]],
  ['Contato', [
    'Dúvidas sobre estes termos: use a página de Contato do site.',
  ]],
]

export default function Termos() {
  return <Legal titulo="Termos de uso" resumo="As regras para usar o sistema e os limites do controle por infravermelho." atualizado="14 de novembro de 2026" secoes={SECOES} />
}
