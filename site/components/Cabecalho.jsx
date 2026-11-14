'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, X } from 'lucide-react'
import Botao from './Botao'
import { APPS_URL, ENTRAR_URL, MARCA, MENU } from '@/lib/dados'

function Logo() {
  return (
    <div className="marca-pilula">
      <Link href="/" aria-label={`${MARCA}, página inicial`}><img src="/icone.svg" alt="" width="30" height="30" />{MARCA}</Link>
    </div>
  )
}

export default function Cabecalho() {
  const caminho = usePathname()
  const [aberta, setAberta] = useState(false)
  const [sub, setSub] = useState(null)
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  useEffect(() => { setAberta(false); setSub(null) }, [caminho])
  const ativo = (item) => (item.href ? item.href === caminho : item.itens.some((i) => caminho.startsWith(i.href) && i.href !== '/'))

  const gaveta = (
    <>
      <div className={`sombra-gaveta ${aberta ? 'aberta' : ''}`} onClick={() => setAberta(false)} />
      <aside className={`gaveta ${aberta ? 'aberta' : ''}`} aria-hidden={!aberta}>
        <button className="fechar" onClick={() => setAberta(false)} aria-label="Fechar menu"><X size={18} /></button>
        <div style={{ display: 'flex', justifyContent: 'center' }}><Logo /></div>
        <nav aria-label="Menu">
          <ul>
            {MENU.map((m, i) => (
              <li key={m.rotulo}>
                {m.href ? <Link href={m.href}>{m.rotulo}</Link> : (
                  <>
                    <button onClick={() => setSub(sub === i ? null : i)} aria-expanded={sub === i}>{m.rotulo}<ChevronDown size={18} style={{ transform: sub === i ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} /></button>
                    {sub === i && <ul className="sub">{m.itens.map((s) => <li key={s.href}><Link href={s.href}>{s.rotulo}</Link></li>)}</ul>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div style={{ marginTop: 20 }}><Botao href={ENTRAR_URL} externo>ENTRAR NO SISTEMA</Botao></div>
        <h5>Baixe o app</h5>
        <a href={APPS_URL} className="leia-mais">Android, macOS, Windows e Linux</a>
      </aside>
    </>
  )

  return (
    <header className="cabecalho">
      <div className="container">
        <div className="barra">
          <Logo />
          <nav className="menu-pilula" aria-label="Menu principal">
            <ul>
              {MENU.map((m) => (
                <li key={m.rotulo} className={ativo(m) ? 'ativo' : ''}>
                  {m.href ? <Link href={m.href}>{m.rotulo}</Link> : (
                    <>
                      <button aria-haspopup="true">{m.rotulo}<ChevronDown size={16} /></button>
                      <ul className="submenu">{m.itens.map((s) => <li key={s.href}><Link href={s.href}>{s.rotulo}</Link></li>)}</ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="direita">
            <Botao href={ENTRAR_URL} externo>ENTRAR NO SISTEMA</Botao>
            <button className={`alternar-menu ${aberta ? 'ativo' : ''}`} onClick={() => setAberta(!aberta)} aria-label="Abrir menu"><span /><span /><span /></button>
          </div>
        </div>
      </div>
      {montado && createPortal(gaveta, document.body)}
    </header>
  )
}
