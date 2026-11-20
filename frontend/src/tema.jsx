import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'

// Tema claro/escuro/sistema. A classe "dark" no <html> liga os tokens escuros (index.css) e o Tailwind (darkMode: 'class').
const Ctx = createContext({ escolha: 'sistema', escuro: false, setEscolha: () => {} })
const midia = () => window.matchMedia('(prefers-color-scheme: dark)')

function lerEscolha() { try { return localStorage.getItem('clima-tema') || 'sistema' } catch { return 'sistema' } }

function aplicar(escuro, animar) {
  const html = document.documentElement
  if (animar) {
    html.classList.add('tema-trocando')
    window.setTimeout(() => html.classList.remove('tema-trocando'), 350)
  }
  html.classList.toggle('dark', escuro)
  html.style.colorScheme = escuro ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0e0e10' : '#f6f6f7')
}

export function TemaProvider({ children }) {
  const [escolha, setEscolhaState] = useState(lerEscolha)
  const [sistemaEscuro, setSistemaEscuro] = useState(() => midia().matches)
  const escuro = escolha === 'escuro' || (escolha === 'sistema' && sistemaEscuro)

  useEffect(() => {
    const m = midia(); const f = () => setSistemaEscuro(m.matches)
    m.addEventListener('change', f); return () => m.removeEventListener('change', f)
  }, [])
  // layout effect: a classe `dark` muda antes dos efeitos dos filhos (as cenas 3D leem o tema ao montar)
  useLayoutEffect(() => { aplicar(escuro, true) }, [escuro])

  const setEscolha = useCallback((v) => {
    setEscolhaState(v)
    try { localStorage.setItem('clima-tema', v) } catch { /* sem storage */ }
  }, [])
  const definirPadrao = useCallback((padrao) => {
    let salvo = null
    try { salvo = localStorage.getItem('clima-tema') } catch { /* sem storage */ }
    if (!salvo && padrao) setEscolhaState(padrao)
  }, [])
  return <Ctx.Provider value={{ escolha, escuro, setEscolha, definirPadrao }}>{children}</Ctx.Provider>
}

export const useTema = () => useContext(Ctx)
