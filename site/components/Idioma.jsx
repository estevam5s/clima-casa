'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Languages } from 'lucide-react'
import { IDIOMAS, aoMudarIdioma, coletarChaves, idiomaAtual, iniciarTraducao, trocarIdioma } from '@/lib/i18n'

// Liga o motor de tradução depois que a página hidrata (traduzir antes faria o React refazer a página em português).
export function MotorIdioma() {
  useEffect(() => {
    iniciarTraducao()
    window.__zynioI18n = { coletar: coletarChaves }   // usado só pela publicação (scripts/extrair-textos.mjs)
  }, [])
  return null
}

function useIdioma() {
  const [idioma, setIdioma] = useState('pt')
  const [ativos, setAtivos] = useState(IDIOMAS.map((i) => i.codigo))
  useEffect(() => {
    setIdioma(idiomaAtual())
    return aoMudarIdioma((novo, lista) => { setIdioma(novo); if (lista) setAtivos(lista.map((x) => x.codigo)) })
  }, [])
  return [idioma, IDIOMAS.filter((i) => ativos.includes(i.codigo))]
}

// Botão do topo (ao lado de Entrar): código do idioma e a lista com o nome de cada um no próprio idioma.
export function SeletorIdioma() {
  const [idioma, lista] = useIdioma()
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('pointerdown', fora); window.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); window.removeEventListener('keydown', esc) }
  }, [aberto])
  const atual = IDIOMAS.find((i) => i.codigo === idioma) || IDIOMAS[0]
  return (
    <div className={`seletor-idioma ${aberto ? 'aberto' : ''}`} ref={ref} translate="no">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-haspopup="listbox" aria-expanded={aberto} aria-label={`Idioma: ${atual.nome}`} data-sem-traducao>
        <Languages size={18} strokeWidth={1.6} /><span className="codigo">{atual.codigo.toUpperCase()}</span><ChevronDown size={15} className={aberto ? 'girado' : ''} />
      </button>
      <ul role="listbox" aria-label="Idioma" className="lista-idiomas">
        {lista.map((i) => (
          <li key={i.codigo}>
            <button type="button" role="option" aria-selected={i.codigo === idioma} lang={i.html} onClick={() => { setAberto(false); trocarIdioma(i.codigo) }}>
              <span className="sigla">{i.codigo.toUpperCase()}</span><span className="nome">{i.nome}</span>{i.codigo === idioma && <Check size={16} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// No menu do celular: os idiomas em fila.
export function SeletorIdiomaMovel({ tabIndex }) {
  const [idioma, lista] = useIdioma()
  return (
    <div className="idiomas-movel" translate="no" role="group" aria-label="Idioma">
      <Languages size={18} strokeWidth={1.6} />
      {lista.map((i) => (
        <button key={i.codigo} type="button" lang={i.html} tabIndex={tabIndex} aria-pressed={i.codigo === idioma} title={i.nome} onClick={() => trocarIdioma(i.codigo)} className={i.codigo === idioma ? 'ativo' : ''}>{i.codigo.toUpperCase()}</button>
      ))}
    </div>
  )
}
