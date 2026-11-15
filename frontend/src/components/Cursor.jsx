import { useEffect, useRef } from 'react'
import { usePreferencias } from '../preferencias'

// Efeito de cursor: anel que segue o mouse com atraso suave, cresce sobre o que é clicável, vira barra em campos de texto
// e encolhe no clique. Só em mouse/trackpad (nunca no toque) e desligado com "reduzir movimento".
const CLICAVEL = 'a, button, [role="button"], [role="switch"], [role="tab"], select, summary, label[for], .cursor-pointer'
const TEXTO = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]'

export default function Cursor() {
  const [p] = usePreferencias()
  const anel = useRef(null), ponto = useRef(null)
  const ativo = p.cursor && typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    document.documentElement.classList.toggle('cursor-escondido', ativo && p.cursor_esconder_seta)
    if (!ativo) return undefined
    const a = anel.current, d = ponto.current
    const alvo = { x: -100, y: -100 }, atual = { x: -100, y: -100 }
    let escala = 1, escalaAlvo = 1, forma = 'normal', visivel = false, quadro
    const mover = (e) => {
      alvo.x = e.clientX; alvo.y = e.clientY
      if (!visivel) { visivel = true; atual.x = alvo.x; atual.y = alvo.y; a.style.opacity = d.style.opacity = '1' }
      const el = e.target instanceof Element ? e.target : null
      forma = el?.closest(TEXTO) ? 'texto' : el?.closest(CLICAVEL) ? 'clicavel' : 'normal'
      escalaAlvo = forma === 'clicavel' ? 1.6 : 1
      a.dataset.forma = forma
    }
    const baixo = () => { escalaAlvo = 0.7 }
    const cima = () => { escalaAlvo = forma === 'clicavel' ? 1.6 : 1 }
    const sair = () => { visivel = false; a.style.opacity = d.style.opacity = '0' }
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      atual.x += (alvo.x - atual.x) * 0.2; atual.y += (alvo.y - atual.y) * 0.2
      escala += (escalaAlvo - escala) * 0.18
      a.style.transform = `translate3d(${atual.x}px, ${atual.y}px, 0) translate(-50%, -50%) scale(${forma === 'texto' ? 1 : escala})`
      d.style.transform = `translate3d(${alvo.x}px, ${alvo.y}px, 0) translate(-50%, -50%)`
    }
    window.addEventListener('pointermove', mover, { passive: true })
    window.addEventListener('pointerdown', baixo); window.addEventListener('pointerup', cima)
    document.addEventListener('pointerleave', sair); window.addEventListener('blur', sair)
    quadro = requestAnimationFrame(laco)
    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerdown', baixo); window.removeEventListener('pointerup', cima)
      document.removeEventListener('pointerleave', sair); window.removeEventListener('blur', sair)
      document.documentElement.classList.remove('cursor-escondido')
    }
  }, [ativo, p.cursor_esconder_seta])

  if (!ativo) return null
  const cor = p.cursor_cor === 'marca' ? 'hsl(var(--primary))' : p.cursor_cor === 'contraste' ? 'hsl(var(--foreground))' : '#ffffff'
  const tam = Math.max(20, Math.min(64, Number(p.cursor_tamanho) || 36))
  const comAnel = p.cursor_estilo !== 'ponto', comPonto = p.cursor_estilo !== 'anel'
  return (
    <>
      <div ref={anel} aria-hidden className="cursor-anel" data-forma="normal"
        style={{ width: tam, height: tam, borderColor: cor, display: comAnel ? 'block' : 'none', mixBlendMode: p.cursor_cor === 'branco' ? 'difference' : 'normal' }} />
      <div ref={ponto} aria-hidden className="cursor-ponto" style={{ background: cor, display: comPonto ? 'block' : 'none', mixBlendMode: p.cursor_cor === 'branco' ? 'difference' : 'normal' }} />
    </>
  )
}
