'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AudioLines, Minus, Play, Plus, X } from 'lucide-react'
import { COMANDOS, TELAS } from '@/lib/dados'

// Botão de play do bloco de vídeo: abre um tour pelas telas reais do sistema (troca a cada 3,5 s).
export function Tour({ imagem, alt }) {
  const [aberto, setAberto] = useState(false)
  const [i, setI] = useState(0)
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  useEffect(() => {
    if (!aberto) return undefined
    const t = setInterval(() => setI((x) => (x + 1) % TELAS.length), 3500)
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    window.addEventListener('keydown', esc)
    return () => { clearInterval(t); window.removeEventListener('keydown', esc) }
  }, [aberto])
  const tela = TELAS[i]
  return (
    <div className="video-imagem">
      <img src={imagem} alt={alt} />
      <div className="play"><button onClick={() => { setI(0); setAberto(true) }} aria-label="Ver o tour pelas telas"><Play size={26} fill="currentColor" /></button></div>
      {montado && createPortal(
        <div className={`modal ${aberto ? 'aberto' : ''}`} onClick={() => setAberto(false)} role="dialog" aria-modal="true" aria-label="Tour pelas telas do sistema">
          <div className="quadro" onClick={(e) => e.stopPropagation()}>
            <button className="fechar" onClick={() => setAberto(false)} aria-label="Fechar"><X size={18} /></button>
            {aberto && <img key={tela.slug} src={`/telas/${tela.img}`} alt={tela.titulo} style={{ animation: 'zoom-entra .6s' }} />}
            <div className="barra-tour"><span key={i} style={{ width: '100%', animation: 'barra 3.5s linear' }} /></div>
            <p><strong>{tela.titulo}</strong> · {tela.resumo}</p>
          </div>
        </div>, document.body)}
    </div>
  )
}

// Carrossel dos comandos de voz (um por vez, troca a cada 3 s com transição de 0,8 s, como o slider do modelo).
export function CarrosselComandos() {
  const [i, setI] = useState(0)
  const pausa = useRef(false)
  useEffect(() => {
    const t = setInterval(() => { if (!pausa.current) setI((x) => (x + 1) % COMANDOS.length) }, 3000)
    return () => clearInterval(t)
  }, [])
  return (
    <div onMouseEnter={() => { pausa.current = true }} onMouseLeave={() => { pausa.current = false }}>
      <div className="carrossel">
        <div className="trilho" style={{ transform: `translateX(-${i * 100}%)` }}>
          {COMANDOS.map((c) => (
            <div className="slide" key={c.frase} aria-hidden={COMANDOS[i] !== c}>
              <div className="ondas" aria-hidden="true">{[0, 1, 2, 3, 4].map((k) => <AudioLines key={k} size={20} />)}</div>
              <p className="dep-frase">“{c.frase}”</p>
              <div className="dep-autor"><h4>{c.titulo}</h4><h5>{c.origem}</h5></div>
            </div>
          ))}
        </div>
      </div>
      <div className="dep-pontos">{COMANDOS.map((c, k) => <button key={c.frase} className={k === i ? 'ativo' : ''} onClick={() => setI(k)} aria-label={`Comando ${k + 1}`} />)}</div>
    </div>
  )
}

export function Acordeao({ itens, inicial = 0 }) {
  const [aberto, setAberto] = useState(inicial)
  return (
    <div>
      {itens.map((it, k) => (
        <div className="acordeao pf_fadeup" key={it.p}>
          <button onClick={() => setAberto(aberto === k ? null : k)} aria-expanded={aberto === k}>
            {it.p}{aberto === k ? <Minus size={22} /> : <Plus size={22} />}
          </button>
          <div className="resposta" style={{ height: aberto === k ? 'auto' : 0 }}><p>{it.r}</p></div>
        </div>
      ))}
    </div>
  )
}
