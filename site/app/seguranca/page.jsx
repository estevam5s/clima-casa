import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina, Titulo } from '@/components/Secoes'

export const metadata = meta({ titulo: 'Segurança', descricao: 'Como o Clima Escritório protege o acesso e os dados: verificação anti-robô, firewall, duas etapas, biometria, criptografia e LGPD.', caminho: '/seguranca', og: 'funcionalidade-seguranca' })

const CAMADAS = [
  ['ShieldCheck', 'Verificação anti-robô', 'Quem abre o site ou o sistema passa por uma checagem da Cloudflare (Turnstile). O login também.'],
  ['Flame', 'Firewall próprio', 'Bloqueio por IP, faixa e país, detecção de varredura e de ataques comuns, limite de pedidos e escudo automático contra ataque em massa.'],
  ['KeyRound', 'Duas etapas e biometria', 'Google Authenticator e chaves de acesso (Face ID, digital, Windows Hello). A política pode exigir duas etapas de administradores.'],
  ['Timer', 'Sessões sob controle', 'Login expira sem uso e tem duração máxima. Cada pessoa vê onde está conectada e encerra aparelhos à distância.'],
  ['Lock', 'Criptografia', 'Tráfego só em HTTPS com HSTS. Chaves de integrações guardadas cifradas (AES-256-GCM). Senhas nunca ficam no sistema.'],
  ['Database', 'Banco fechado', 'Todas as tabelas com proteção por linha (RLS). Nada é lido direto do navegador: tudo passa pela API, que confere o papel de cada pessoa.'],
  ['UserCog', 'Papéis e permissões', 'Dono, administrador, subadministrador, operador e visualizador, além de permissões por tela e por projeto (sala).'],
  ['ScrollText', 'Registro de tudo', 'Cada comando, login e mudança fica na Atividade. A tela de Segurança mostra de onde vêm os acessos num globo 3D.'],
]
const LGPD = [
  'Cookies só com consentimento (exceto os essenciais), com prova da escolha guardada sem o IP em claro.',
  'Senhas checadas contra vazamentos conhecidos sem enviar a senha (k-anonimato).',
  'Dados de contato do site usados só para responder quem escreveu.',
  'Pedidos de acesso e exclusão atendidos pelo contato do site.',
]

export default function Seguranca() {
  return (
    <>
      <BannerPagina titulo="Segurança" texto="Oito camadas entre a internet e o ar-condicionado do seu escritório." trilha={[{ rotulo: 'Segurança' }]} />
      <section className="pt-130 pb-80">
        <div className="container">
          <Titulo sub="Como protegemos" centro className="mb-50">Segurança em cada etapa, não só no login</Titulo>
          <div className="grade-camadas">
            {CAMADAS.map(([i, t, d], k) => (
              <div key={t} className="camada pf_fadeup" style={{ transitionDelay: `${k * 40}ms` }}>
                <span className="camada-icone"><Icone nome={i} tamanho={26} /></span><h3>{t}</h3><p>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="pt-60 pb-90">
        <div className="container">
          <div className="linha alinha-centro">
            <div className="lg-6"><div className="caixa-imagem mb-50 pf_zoomIn"><img src="/telas/seguranca.jpg" alt="Tela de segurança com o globo de acessos" style={{ filter: 'none', borderRadius: 20 }} /></div></div>
            <div className="lg-6">
              <Titulo sub="Privacidade" className="mb-30">De acordo com a LGPD</Titulo>
              <ul className="lista-check">{LGPD.map((t) => <li key={t} className="pf_fadeup"><span>{t}</span></li>)}</ul>
              <div className="pf_fadeup" style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}><Botao href="/privacidade">Política de privacidade</Botao><Botao href="/status" className="contorno">Status do sistema</Botao></div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
