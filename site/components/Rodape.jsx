import Link from 'next/link'
import { LogIn, MonitorSmartphone } from 'lucide-react'
import { TextoEntrar } from './Sessao'
import Espiral from './Espiral'
import { FormNovidades } from './Formularios'
import { APPS_URL, MARCA, SISTEMA_URL } from '@/lib/dados'

export default function Rodape() {
  return (
    <footer className="rodape cinza-escuro pt-130">
      <div className="mancha m1"><span /></div>
      <div className="mancha m2"><span /></div>
      <div className="espiral-1"><Espiral tamanho={300} faixas={20} torcao={3.4} cor="#0e0f11" fundo="#c8ff9a" esfera className="gira" /></div>
      <div className="espiral-2"><Espiral tamanho={170} faixas={16} cor="rgba(255,255,255,.25)" className="gira" /></div>
      <div className="container">
        <div className="linha">
          <div className="lg-4 md-6">
            <div className="widget widget-sobre mb-40 pf_fadeup">
              <div className="marca-pilula logo-rodape" style={{ display: 'inline-block' }}>
                <Link href="/"><img src="/icone.svg" alt="" width="30" height="30" />{MARCA}</Link>
              </div>
              <p>Ar-condicionados do escritório por infravermelho, com Alexa, agenda, automações e relatórios.</p>
              <FormNovidades />
            </div>
          </div>
          <div className="lg-3 md-6">
            <div className="widget widget-endereco mb-40 pf_fadeup">
              <h4 className="titulo-widget">Onde funciona</h4>
              <p style={{ marginBottom: 30 }}>Painel na nuvem: {SISTEMA_URL.replace('https://', '')}</p>
              <h4 className="titulo-widget">Agente local</h4>
              <p>Computador do escritório, na mesma rede do transmissor infravermelho.</p>
            </div>
          </div>
          <div className="lg-2 md-6">
            <div className="widget mb-40 pf_fadeup">
              <h4 className="titulo-widget" style={{ marginBottom: 20 }}>Links</h4>
              <ul>
                <li><Link href="/sobre">Sobre o sistema</Link></li>
                <li><Link href="/funcionalidades">Funcionalidades</Link></li>
                <li><Link href="/telas">Telas</Link></li>
                <li><Link href="/faq">Perguntas frequentes</Link></li>
                <li><Link href="/contato">Contato</Link></li>
                <li><Link href="/privacidade">Privacidade</Link></li>
                <li><Link href="/termos">Termos de uso</Link></li>
              </ul>
            </div>
          </div>
          <div className="lg-3 md-6">
            <div className="widget mb-40 pf_fadeup">
              <h4 className="titulo-widget" style={{ marginBottom: 20 }}>Acesso</h4>
              <div className="info-contato">
                <span className="ic"><LogIn size={20} strokeWidth={1.5} /></span>
                <div><h5>Sistema</h5><TextoEntrar logado="Entrar no painel" deslogado="Fazer login no painel" /></div>
              </div>
              <div className="info-contato">
                <span className="ic"><MonitorSmartphone size={20} strokeWidth={1.5} /></span>
                <div><h5>Apps</h5><a href={APPS_URL}>Baixar para celular e computador</a></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="copyright" style={{ position: 'relative' }}>
        <div className="container">
          <div className="linha">
            <div className="lg-6"><p>© {new Date().getFullYear()} <span>{MARCA}</span> - Todos os direitos reservados.</p></div>
            <div className="lg-6">
              <ul>
                <li><Link href="/faq">Perguntas frequentes</Link></li>
                <li><Link href="/contato">Contato</Link></li>
                <li><TextoEntrar /></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
