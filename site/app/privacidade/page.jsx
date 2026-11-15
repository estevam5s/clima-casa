import { meta } from '@/lib/seo'
import Legal from '@/components/Legal'

export const metadata = meta({ titulo: 'Política de privacidade', descricao: 'Quais dados o zynio (Clima Escritório) guarda, para quê, por quanto tempo e com quem compartilha.', caminho: '/privacidade', og: 'sobre' })

const SECOES = [
  ['Quem somos', [
    'O zynio (Clima Escritório) é um sistema para controlar os ares-condicionados de um escritório por infravermelho, pelo painel web, pelos apps e por assistentes de voz. Esta política explica como tratamos dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018).',
  ]],
  ['Dados que guardamos', [
    'Só guardamos o que o sistema usa para funcionar:',
    [
      'Conta de quem usa o sistema: nome, e-mail, cargo, telefone (opcional), foto de perfil (opcional), nível de acesso e projetos que a pessoa vê.',
      'Login com Google: quando a pessoa escolhe entrar com o Google, recebemos do Google o nome, o e-mail e a foto da conta. Não recebemos a senha do Google nem acesso a e-mails, arquivos ou agenda.',
      'Uso do sistema: comandos enviados aos aparelhos (quem, quando, de onde), agendamentos, automações e cenas.',
      'Segurança: endereço IP, navegador e localização aproximada (cidade e país informados pela rede de hospedagem) de acessos, logins e tentativas bloqueadas.',
      'Formulários do site: nome, e-mail e mensagem enviados em Contato ou Novidades, com país e cidade aproximados.',
    ],
  ]],
  ['Para que usamos', [
    [
      'Permitir o login e mostrar a cada pessoa só o que ela pode acessar.',
      'Executar os comandos nos aparelhos e mostrar o histórico e os relatórios de uso.',
      'Proteger o sistema contra robôs e ataques (bloqueio de IPs, verificação anti-robô, verificação em duas etapas).',
      'Responder quem escreveu pelo site.',
    ],
    'Não vendemos dados, não usamos para publicidade e não fazemos perfil de comportamento.',
  ]],
  ['Com quem os dados são tratados', [
    'Usamos serviços de terceiros que processam dados em nosso nome, só para o sistema funcionar:',
    [
      'Supabase: banco de dados e login (servidores nos Estados Unidos).',
      'Vercel: hospedagem do site e do sistema.',
      'Cloudflare: DNS e verificação anti-robô (Turnstile).',
      'Google: login com Google, quando a pessoa escolhe esse caminho.',
      'Tuya (Smart Life) e Sinric Pro: envio de comandos aos transmissores e integração com Alexa e Google Home, quando o escritório usa esses recursos.',
    ],
  ]],
  ['Cookies e armazenamento no navegador', [
    'O sistema guarda a sessão de login no próprio navegador para você não precisar entrar a cada página. O site e o sistema gravam um cookie de verificação de segurança ("zv") por 12 horas depois que a Cloudflare confirma que o acesso não é de um robô. Não usamos cookies de publicidade nem de rastreamento.',
  ]],
  ['Por quanto tempo guardamos', [
    [
      'Histórico de atividade: 90 dias.',
      'Eventos de segurança: 30 dias.',
      'Notificações arquivadas: 60 dias.',
      'Cópias de segurança automáticas: as 14 mais recentes.',
      'Conta: enquanto estiver ativa. Quando um administrador apaga a conta, o login, a biometria e o perfil são removidos.',
    ],
  ]],
  ['Segurança', [
    'Conexões sempre por HTTPS, senhas guardadas pelo provedor de login (nunca em texto), chaves de integração criptografadas com AES-256, verificação em duas etapas opcional, login com biometria e bloqueio automático de IPs que atacam o sistema.',
  ]],
  ['Seus direitos', [
    'Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, exclusão, portabilidade e informação sobre com quem compartilhamos. O pedido é feito pela página de Contato do site e respondido em até 15 dias.',
  ]],
  ['Mudanças nesta política', [
    'Quando esta política mudar, a data no topo é atualizada. Mudanças importantes são avisadas dentro do sistema.',
  ]],
]

export default function Privacidade() {
  return <Legal titulo="Política de privacidade" resumo="Quais dados o sistema guarda, para quê e por quanto tempo." atualizado="14 de novembro de 2026" secoes={SECOES} />
}
