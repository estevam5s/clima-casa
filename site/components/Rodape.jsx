import Link from 'next/link'
import { ArrowUpRight, LogIn } from 'lucide-react'
import BotaoCookies from './BotaoCookies'
import { TextoEntrar } from './Sessao'
import Espiral from './Espiral'
import Icone from './Icone'
import { FormNovidades } from './Formularios'
import { MARCA, PLATAFORMAS, RODAPE, SISTEMA_URL } from '@/lib/dados'

// Logo do Windows desenhado aqui (o pacote de logotipos não traz as marcas da Microsoft).
function IconeApp({ nome }) {
  if (nome === 'windows') return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M3 5.5 10.5 4.5v7H3zM11.5 4.4 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z" /></svg>
  return <Icone nome={nome} tamanho={20} />
}

export default function Rodape() {
  return (
    <footer className="rodape cinza-escuro pt-130">
      <div className="mancha m1"><span /></div>
      <div className="mancha m2"><span /></div>
      <div className="espiral-1"><Espiral tamanho={300} faixas={20} torcao={3.4} cor="#0e0f11" fundo="#c8ff9a" esfera className="gira" /></div>
      <div className="espiral-2"><Espiral tamanho={170} faixas={16} cor="rgba(255,255,255,.25)" className="gira" /></div>
      <div className="container">
        <div className="rodape-grade">
          <div className="widget widget-sobre pf_fadeup">
            <div className="marca-pilula logo-rodape" style={{ display: 'inline-block' }}>
              <Link href="/"><img src="/icone.svg" alt="" width="30" height="30" /><span translate="no">{MARCA}</span></Link>
            </div>
            <p>O escritório inteiro num painel só: ar-condicionado por infravermelho, luzes, cafeteira, persianas, fechadura e música, com Alexa, assistente de IA e relatórios.</p>
            <p className="rotulo-form">Receba as novidades por e-mail</p>
            <FormNovidades />
          </div>
          {RODAPE.map((g) => (
            <div key={g.titulo} className="widget coluna-links pf_fadeup">
              <h4 className="titulo-widget">{g.titulo}</h4>
              <ul>{g.itens.map(([rot, href]) => <li key={href}><Link href={href}>{rot}</Link></li>)}</ul>
            </div>
          ))}
        </div>

        <div className="faixa-apps pf_fadeup">
          <div className="faixa-apps-texto">
            <h4>Baixe os apps</h4>
            <p>O mesmo sistema no celular, no computador e no navegador.</p>
          </div>
          <ul className="lista-apps">
            {PLATAFORMAS.map((p) => (
              <li key={p.id}>
                <Link href={`/baixar#${p.id}`} className="app-rodape" aria-label={`${p.nome}: ${p.detalhe}`}>
                  <span className="ic"><IconeApp nome={p.icone} /></span>
                  <span className="txt"><b>{p.nome}</b><small>{p.detalhe}</small></span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="faixa-apps-acesso">
            <a href={SISTEMA_URL} className="app-rodape destaque"><span className="ic"><LogIn size={18} strokeWidth={1.6} /></span><span className="txt"><b>Entrar no sistema</b><small>app.zynio.com.br</small></span><ArrowUpRight size={16} /></a>
          </div>
        </div>
      </div>
      <div className="copyright" style={{ position: 'relative' }}>
        <div className="container">
          <div className="linha">
            <div className="lg-6"><p>© {new Date().getFullYear()} <span translate="no">{MARCA}</span> · Todos os direitos reservados.</p></div>
            <div className="lg-6">
              <ul>
                <li><Link href="/privacidade">Privacidade</Link></li>
                <li><Link href="/termos">Termos de uso</Link></li>
                <li><BotaoCookies /></li>
                <li><TextoEntrar /></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
