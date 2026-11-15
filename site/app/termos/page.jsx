import { meta } from '@/lib/seo'
import Legal from '@/components/Legal'

export const metadata = meta({ titulo: 'Termos de uso', descricao: 'As regras para usar o zynio (Clima Escritório): contas, uso permitido, limites do controle por infravermelho, integrações, disponibilidade e responsabilidades.', caminho: '/termos', og: 'sobre' })

const SECOES = [
  { id: 'aceite', titulo: 'Aceite', blocos: [
    'Estes termos regem o uso do zynio (Clima Escritório): o site zynio.com.br, o painel em app.zynio.com.br, os apps de celular e computador e as integrações com assistentes de voz. Ao entrar no sistema você concorda com estes termos e com a Política de privacidade. Se não concordar, não use o sistema.',
  ] },
  { id: 'definicoes', titulo: 'Definições', blocos: [
    { tabela: [
      ['Termo', 'Significado'],
      ['Sistema', 'O zynio (Clima Escritório) em todas as suas formas: site, painel, apps e integrações'],
      ['Administrador', 'Quem cria contas, define níveis de acesso e configura o escritório no sistema'],
      ['Usuário', 'Pessoa com conta criada por um administrador'],
      ['Projeto', 'Um lugar ou sala do escritório, com os seus ares-condicionados'],
      ['Transmissor', 'Aparelho infravermelho Wi-Fi que envia os comandos ao ar-condicionado'],
      ['Agente', 'Programa que roda num computador do escritório e fala com os transmissores pela rede local'],
    ] },
  ] },
  { id: 'contas', titulo: 'Contas e acesso', blocos: [
    { lista: [
      'Não existe cadastro público: as contas são criadas por um administrador, que define o nível de acesso e os projetos de cada pessoa.',
      'O login com Google só funciona para um e-mail que já tenha conta no sistema.',
      'A conta é pessoal. Você é responsável por manter a senha em segredo e por tudo o que for feito com o seu acesso.',
      'Recomendamos ativar a verificação em duas etapas (Google Authenticator) e o login com biometria.',
      'Avise um administrador se suspeitar de uso indevido da sua conta.',
    ] },
  ] },
  { id: 'uso', titulo: 'Uso permitido', blocos: [
    'O sistema serve para controlar e acompanhar os ares-condicionados do escritório. Não é permitido:',
    { lista: [
      'tentar acessar contas, projetos ou dados que não são seus;',
      'atacar, sobrecarregar, copiar ou procurar falhas no sistema sem autorização por escrito;',
      'usar robôs ou programas automáticos fora das integrações oferecidas (Alexa, Google Home e apps);',
      'usar o sistema para qualquer fim ilegal ou que prejudique outras pessoas.',
    ] },
    'Acessos que violem estas regras são bloqueados automaticamente e a conta pode ser suspensa ou apagada.',
  ] },
  { id: 'funcionamento', titulo: 'Como o controle funciona e seus limites', blocos: [
    'O sistema envia os mesmos sinais infravermelhos do controle remoto original, por meio de transmissores Wi-Fi. Por isso:',
    { lista: [
      'o ar-condicionado não informa o próprio estado de volta. Se alguém usar o controle original, o sistema pode mostrar um estado diferente do real;',
      'os comandos dependem de energia elétrica, do Wi-Fi do escritório, do transmissor e do computador do agente estarem funcionando;',
      'se o Wi-Fi mudar, o transmissor precisa ser pareado de novo no app Smart Life;',
      'consumo e custo nos relatórios são estimativas pela potência cadastrada, não medição real.',
    ] },
  ] },
  { id: 'integracoes', titulo: 'Integrações de terceiros', blocos: [
    'Alexa, Google Home, Google, Smart Life, Sinric Pro e Cloudflare são serviços de outras empresas, com termos e políticas próprios. Usá-los é opcional, e o funcionamento deles não depende de nós.',
  ] },
  { id: 'disponibilidade', titulo: 'Disponibilidade e manutenção', blocos: [
    'Trabalhamos para manter o sistema no ar, mas ele pode ficar indisponível por manutenção, atualização ou falha de provedores. Agendamentos e automações que dependem do agente no escritório não rodam enquanto ele estiver desligado. Mudanças importantes são avisadas dentro do sistema.',
  ] },
  { id: 'propriedade', titulo: 'Propriedade intelectual', blocos: [
    'O código, o design, a marca e os textos do sistema pertencem ao responsável pelo zynio. Os dados que você cadastra (aparelhos, projetos, agendamentos) continuam sendo do escritório e podem ser exportados pelo backup do sistema.',
  ] },
  { id: 'responsabilidade', titulo: 'Responsabilidade', blocos: [
    'O sistema é uma ferramenta de conveniência e economia de energia. Ele não substitui a manutenção dos aparelhos nem deve ser a única garantia de temperatura em ambientes que exigem controle crítico, como salas de servidores, laboratórios ou guarda de medicamentos. Não respondemos por danos causados por falta de energia, de internet, por falha dos aparelhos ou de serviços de terceiros, nos limites permitidos pela lei.',
  ] },
  { id: 'suspensao', titulo: 'Suspensão e encerramento', blocos: [
    'Um administrador pode desativar ou apagar contas a qualquer momento. Podemos suspender acessos que violem estes termos ou coloquem o sistema em risco. Ao apagar uma conta, os dados dela são tratados como descrito na Política de privacidade.',
  ] },
  { id: 'privacidade', titulo: 'Privacidade', blocos: [
    'O tratamento de dados pessoais segue a Política de privacidade e a LGPD. Ela explica quais dados tratamos, com qual base legal, com quem compartilhamos, por quanto tempo guardamos e como exercer seus direitos.',
  ] },
  { id: 'mudancas', titulo: 'Mudanças nos termos', blocos: [
    'Estes termos podem mudar. A data no topo mostra a versão em vigor, e mudanças importantes são avisadas dentro do sistema antes de valer. Continuar usando o sistema depois disso significa aceitar a nova versão.',
  ] },
  { id: 'lei', titulo: 'Lei aplicável e contato', blocos: [
    'Estes termos seguem as leis da República Federativa do Brasil, incluindo o Marco Civil da Internet (Lei 12.965/2014) e a LGPD. Dúvidas: use a página de Contato do site.',
  ] },
]

const RESUMO = [
  'Contas são criadas por um administrador; não há cadastro público.',
  'A conta é pessoal: guarde a senha e ative a verificação em duas etapas.',
  'O ar não informa o estado de volta: o controle original pode desatualizar o painel.',
  'Ataques e abuso são bloqueados automaticamente.',
  'Não use como única garantia em ambientes críticos.',
]

export default function Termos() {
  return <Legal titulo="Termos de uso" resumo="As regras para usar o sistema, os limites do controle por infravermelho e as responsabilidades." atualizado="14 de novembro de 2026" emResumo={RESUMO} secoes={SECOES} outra={['/privacidade', 'Política de privacidade']} />
}
