import { meta } from '@/lib/seo'
import Legal from '@/components/Legal'

export const metadata = meta({ titulo: 'Política de privacidade', descricao: 'Como o zynio (Clima Escritório) trata dados pessoais: quais dados, para quê, com qual base legal da LGPD, com quem, por quanto tempo e como exercer seus direitos.', caminho: '/privacidade', og: 'sobre' })

const SECOES = [
  { id: 'controlador', titulo: 'Quem cuida dos seus dados', blocos: [
    'O zynio (Clima Escritório) é um sistema para controlar os ares-condicionados de um escritório por infravermelho, pelo painel web, pelos apps de celular e computador e por assistentes de voz. Ele é operado pelo responsável pelo site zynio.com.br, que atua como controlador dos dados pessoais tratados aqui, nos termos da Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018, a LGPD).',
    'O encarregado pelo tratamento de dados (DPO) atende pelo formulário de Contato do site, com o assunto “Privacidade”.',
  ] },
  { id: 'abrangencia', titulo: 'A quem esta política se aplica', blocos: [
    { lista: [
      'Pessoas com conta no sistema (a equipe do escritório), criada por um administrador.',
      'Visitantes do site zynio.com.br.',
      'Quem envia mensagem pelo formulário de Contato ou se inscreve em Novidades.',
    ] },
  ] },
  { id: 'dados', titulo: 'Quais dados tratamos', blocos: [
    'Tratamos só o necessário para o sistema funcionar e ficar seguro:',
    { tabela: [
      ['Categoria', 'Dados', 'De onde vêm'],
      ['Conta', 'Nome, e-mail, cargo, telefone (opcional), foto de perfil (opcional), nível de acesso e projetos liberados', 'Do administrador que cria a conta e da própria pessoa no Perfil'],
      ['Login com Google', 'Nome, e-mail e foto da conta Google', 'Do Google, só quando a pessoa escolhe entrar com o Google'],
      ['Autenticação', 'Senha (guardada só como hash pelo provedor de login), fator do Google Authenticator e chaves de biometria (chave pública)', 'Da própria pessoa'],
      ['Uso do sistema', 'Comandos enviados aos aparelhos (quem, quando, de onde), agendamentos, automações e cenas', 'Gerados pelo uso'],
      ['Segurança', 'Endereço IP, navegador, cidade e país aproximados, horário de acessos, logins e tentativas bloqueadas', 'Da conexão, pela rede de hospedagem'],
      ['Formulários do site', 'Nome, e-mail, assunto e mensagem; país e cidade aproximados', 'De quem preenche'],
    ] },
    { destaque: 'Não tratamos dados pessoais sensíveis (saúde, biometria para identificação, origem racial, religião, opinião política etc.). A biometria do login fica no seu aparelho: o sistema recebe só uma chave pública, nunca a sua digital ou o seu rosto.' },
  ] },
  { id: 'finalidades', titulo: 'Para que usamos e com qual base legal', blocos: [
    'Cada uso tem uma base legal do art. 7º da LGPD:',
    { tabela: [
      ['Finalidade', 'Base legal'],
      ['Criar a conta, permitir o login e mostrar a cada pessoa só o que ela pode acessar', 'Execução de contrato ou de procedimentos preliminares (art. 7º, V)'],
      ['Executar os comandos nos aparelhos e mostrar histórico e relatórios de uso', 'Execução de contrato (art. 7º, V) e legítimo interesse (art. 7º, IX)'],
      ['Proteger o sistema contra robôs, invasões e abuso (firewall, verificação anti-robô, bloqueio de IPs, 2FA)', 'Legítimo interesse (art. 7º, IX) e prevenção à fraude e segurança do titular'],
      ['Responder mensagens enviadas pelo site', 'Legítimo interesse (art. 7º, IX), a pedido da própria pessoa'],
      ['Enviar novidades do sistema por e-mail', 'Consentimento (art. 7º, I), que pode ser retirado a qualquer momento'],
      ['Cumprir obrigações legais e atender autoridades', 'Cumprimento de obrigação legal (art. 7º, II)'],
    ] },
    'Não vendemos dados, não usamos para publicidade, não fazemos perfil de comportamento e não usamos dados para treinar inteligência artificial.',
  ] },
  { id: 'automatizadas', titulo: 'Decisões automatizadas', blocos: [
    'O firewall do sistema pode bloquear sozinho, por um tempo, um endereço IP que errou a senha muitas vezes, mandou requisições demais ou usou ferramentas de ataque. Se você foi bloqueado por engano, pode pedir a revisão dessa decisão (art. 20 da LGPD) pelo formulário de Contato.',
  ] },
  { id: 'compartilhamento', titulo: 'Com quem os dados são compartilhados', blocos: [
    'Os dados são tratados por empresas que prestam serviço para o sistema funcionar (operadores), só para essas finalidades:',
    { tabela: [
      ['Operador', 'Para quê', 'Onde'],
      ['Supabase', 'Banco de dados, login e cópias de segurança', 'Estados Unidos'],
      ['Vercel', 'Hospedagem do site e do sistema', 'Brasil e Estados Unidos'],
      ['Cloudflare', 'DNS e verificação anti-robô (Turnstile)', 'Rede global'],
      ['Google', 'Login com Google, quando você escolhe', 'Rede global'],
      ['Tuya (Smart Life) e Sinric Pro', 'Envio de comandos aos transmissores e integração com Alexa e Google Home, quando o escritório usa esses recursos', 'Rede global'],
    ] },
    'Também podemos compartilhar dados quando a lei exigir ou por ordem de autoridade competente.',
  ] },
  { id: 'transferencia', titulo: 'Transferência internacional', blocos: [
    'Como alguns operadores têm servidores fora do Brasil, há transferência internacional de dados. Ela acontece com base no art. 33 da LGPD, com provedores que oferecem garantias de proteção compatíveis (cláusulas contratuais de proteção de dados, criptografia em trânsito e em repouso e controles de acesso).',
  ] },
  { id: 'cookies', titulo: 'Cookies e armazenamento no navegador', blocos: [
    'Usamos só o necessário para o site e o sistema funcionarem com segurança. Não há cookies de publicidade nem de rastreamento de terceiros.',
    { tabela: [
      ['Nome', 'Tipo', 'Para quê', 'Duração'],
      ['zv', 'Cookie essencial', 'Lembrar que o acesso já passou na verificação de segurança', '12 horas'],
      ['Cookies da Cloudflare (Turnstile)', 'Essencial, de segurança', 'Confirmar que o acesso não é de um robô', 'Durante a verificação'],
      ['clima-casa-auth', 'Armazenamento local', 'Manter a sessão de login do sistema', 'Até sair da conta ou a sessão vencer'],
      ['clima-sessao-sistema', 'Armazenamento local', 'Mostrar no site o botão certo (Login ou Entrar no sistema)', '30 dias'],
      ['Preferências', 'Armazenamento local', 'Tema claro ou escuro, menu fixo e vista do mapa', 'Até você limpar o navegador'],
    ] },
    'Como são essenciais, esses itens não dependem de consentimento. Você pode apagá-los nas configurações do navegador; nesse caso, será preciso passar de novo pela verificação e entrar de novo.',
  ] },
  { id: 'retencao', titulo: 'Por quanto tempo guardamos', blocos: [
    { tabela: [
      ['Dado', 'Prazo'],
      ['Conta e perfil', 'Enquanto a conta existir. Ao apagar a conta, login, biometria e perfil são removidos'],
      ['Histórico de atividade', '90 dias'],
      ['Eventos de segurança', '30 dias'],
      ['Notificações arquivadas', '60 dias'],
      ['Mensagens do site', 'Até serem apagadas pelo administrador ou a pedido de quem enviou'],
      ['Cópias de segurança automáticas', 'As 14 mais recentes (cerca de duas semanas)'],
    ] },
    'Depois desses prazos os dados são apagados automaticamente, salvo quando a lei exigir guardar por mais tempo.',
  ] },
  { id: 'seguranca', titulo: 'Como protegemos os dados', blocos: [
    { lista: [
      'Conexões sempre por HTTPS (TLS) com HSTS.',
      'Senhas guardadas só como hash pelo provedor de login; nunca em texto.',
      'Chaves de integração criptografadas com AES-256.',
      'Verificação em duas etapas (Google Authenticator) e login com biometria.',
      'Firewall com bloqueio automático de IPs que atacam o sistema e verificação anti-robô.',
      'Acesso por níveis: cada pessoa só vê os projetos e as funções liberadas para ela.',
    ] },
  ] },
  { id: 'incidentes', titulo: 'Incidentes de segurança', blocos: [
    'Se ocorrer um incidente que possa trazer risco ou dano relevante, comunicaremos a Autoridade Nacional de Proteção de Dados (ANPD) e as pessoas afetadas em prazo razoável, com a descrição do ocorrido, os dados envolvidos e as medidas tomadas, como pede o art. 48 da LGPD.',
  ] },
  { id: 'direitos', titulo: 'Seus direitos', blocos: [
    'Pelo art. 18 da LGPD, você pode pedir a qualquer momento:',
    { lista: [
      'Confirmação de que tratamos seus dados e acesso a eles.',
      'Correção de dados incompletos, inexatos ou desatualizados.',
      'Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.',
      'Portabilidade dos dados a outro fornecedor.',
      'Eliminação dos dados tratados com o seu consentimento.',
      'Informação sobre com quem compartilhamos seus dados.',
      'Informação sobre a possibilidade de não consentir e as consequências.',
      'Revogação do consentimento.',
      'Revisão de decisões tomadas só com tratamento automatizado.',
    ] },
    'Faça o pedido pelo formulário de Contato com o assunto “Privacidade”. Podemos pedir uma confirmação de identidade antes de atender. Respondemos em até 15 dias. Se não ficar satisfeito, você pode reclamar à ANPD (gov.br/anpd).',
  ] },
  { id: 'menores', titulo: 'Crianças e adolescentes', blocos: [
    'O sistema é de uso profissional e não é destinado a menores de 18 anos. Não tratamos de propósito dados de crianças e adolescentes.',
  ] },
  { id: 'mudancas', titulo: 'Mudanças nesta política', blocos: [
    'Esta política pode ser atualizada. A data no topo mostra a versão em vigor, e mudanças importantes são avisadas dentro do sistema antes de valer.',
  ] },
]

const RESUMO = [
  'Só tratamos o necessário para o sistema funcionar e ficar seguro.',
  'Não vendemos dados nem usamos para publicidade.',
  'Cookies só essenciais: verificação de segurança e sessão.',
  'Histórico por 90 dias e eventos de segurança por 30.',
  'Você pode pedir acesso, correção e exclusão a qualquer momento.',
]

export default function Privacidade() {
  return <Legal titulo="Política de privacidade" resumo="Como tratamos dados pessoais, com qual base legal e como exercer seus direitos pela LGPD." atualizado="14 de novembro de 2026" emResumo={RESUMO} secoes={SECOES} outra={['/termos', 'Termos de uso']} />
}
