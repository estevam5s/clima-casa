'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, ChevronDown, X } from 'lucide-react'
import Botao from './Botao'
import { APPS_URL, ENTRAR_URL, MARCA, MENU } from '@/lib/dados'

function Logo({ aoClicar }) {
  return (
    <div className="marca-pilula">
      <Link href="/" onClick={aoClicar} aria-label={`${MARCA}, página inicial`}><img src="/icone.svg" alt="" width="30" height="30" />{MARCA}</Link>
    </div>
  )
}

export default function Cabecalho() {
  const caminho = usePathname()
  const [gaveta, setGaveta] = useState(false)
  const [subGaveta, setSubGaveta] = useState(null)
  const [submenu, setSubmenu] = useState(null)   // índice do submenu aberto no desktop (só um por vez)
  const [montado, setMontado] = useState(false)
  const nav = useRef(null)
  const fechar = useRef(null)

  useEffect(() => setMontado(true), [])
  useEffect(() => { setGaveta(false); setSubGaveta(null); setSubmenu(null) }, [caminho])
  // gaveta aberta: trava a rolagem da página e fecha com Esc
  useEffect(() => {
    document.documentElement.classList.toggle('menu-aberto', gaveta)
    if (!gaveta) return undefined
    const esc = (e) => e.key === 'Escape' && setGaveta(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [gaveta])
  // submenu: fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (submenu === null) return undefined
    const fora = (e) => { if (!nav.current?.contains(e.target)) setSubmenu(null) }
    const esc = (e) => e.key === 'Escape' && setSubmenu(null)
    document.addEventListener('pointerdown', fora)
    window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); window.removeEventListener('keydown', esc) }
  }, [submenu])

  const abrirComAtraso = (i) => { clearTimeout(fechar.current); setSubmenu(i) }
  const fecharComAtraso = () => { clearTimeout(fechar.current); fechar.current = setTimeout(() => setSubmenu(null), 160) }
  const ativo = (item) => (item.href ? item.href === caminho : item.itens.some((i) => i.href !== '/' && caminho.startsWith(i.href.split('/').slice(0, 2).join('/'))))

  const telaCheia = (
    <div className={`menu-movel ${gaveta ? 'aberto' : ''}`} aria-hidden={!gaveta} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="menu-movel-topo">
        <Logo aoClicar={() => setGaveta(false)} />
        <button className="menu-movel-fechar" onClick={() => setGaveta(false)} aria-label="Fechar menu" tabIndex={gaveta ? 0 : -1}><X size={22} /></button>
      </div>
      <nav className="menu-movel-lista" aria-label="Menu">
        <ul>
          {MENU.map((m, i) => (
            <li key={m.rotulo} style={{ '--i': i }} className={ativo(m) ? 'ativo' : ''}>
              {m.href ? <Link href={m.href} tabIndex={gaveta ? 0 : -1}>{m.rotulo}</Link> : (
                <>
                  <button onClick={() => setSubGaveta(subGaveta === i ? null : i)} aria-expanded={subGaveta === i} tabIndex={gaveta ? 0 : -1}>
                    {m.rotulo}<ChevronDown size={24} className={subGaveta === i ? 'girado' : ''} />
                  </button>
                  <div className={`menu-movel-sub ${subGaveta === i ? 'aberto' : ''}`}>
                    <ul>{m.itens.map((s) => <li key={s.href}><Link href={s.href} tabIndex={gaveta && subGaveta === i ? 0 : -1}>{s.rotulo}</Link></li>)}</ul>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="menu-movel-rodape">
        <Botao href={ENTRAR_URL} externo tabIndex={gaveta ? 0 : -1}>ENTRAR NO SISTEMA</Botao>
        <a href={APPS_URL} className="menu-movel-apps" tabIndex={gaveta ? 0 : -1}>Baixar os apps <ArrowUpRight size={18} /></a>
      </div>
    </div>
  )

  return (
    <header className="cabecalho">
      <div className="container">
        <div className="barra">
          <Logo />
          <nav className="menu-pilula" aria-label="Menu principal" ref={nav} onMouseLeave={fecharComAtraso}>
            <ul>
              {MENU.map((m, i) => (
                <li key={m.rotulo} className={`${ativo(m) ? 'ativo' : ''} ${submenu === i ? 'aberto' : ''}`} onMouseEnter={() => (m.itens ? abrirComAtraso(i) : setSubmenu(null))}>
                  {m.href ? <Link href={m.href}>{m.rotulo}</Link> : (
                    <>
                      <button aria-haspopup="true" aria-expanded={submenu === i} onClick={() => { clearTimeout(fechar.current); setSubmenu(i) }}>
                        {m.rotulo}<ChevronDown size={16} className={submenu === i ? 'girado' : ''} />
                      </button>
                      <ul className="submenu">{m.itens.map((s) => <li key={s.href}><Link href={s.href} onClick={() => setSubmenu(null)}>{s.rotulo}</Link></li>)}</ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="direita">
            <Botao href={ENTRAR_URL} externo>ENTRAR NO SISTEMA</Botao>
            <button className={`alternar-menu ${gaveta ? 'ativo' : ''}`} onClick={() => setGaveta(true)} aria-label="Abrir menu" aria-expanded={gaveta}><span /><span /><span /></button>
          </div>
        </div>
      </div>
      {montado && createPortal(telaCheia, document.body)}
    </header>
  )
}
