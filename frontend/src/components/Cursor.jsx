import { useEffect, useRef } from 'react'
import { lerCursores, usePreferencias } from '../preferencias'
import { cursorDeImagem, cursorEmbutido } from '../cursores'

// Cursor personalizado, em duas partes independentes:
// 1) Efeito que segue o mouse (anel, ponto, mira, quadrado ou bolha de luz) com atraso suave, que cresce sobre o que é
//    clicável, gruda nos botões (magnético), vira barra em campos de texto e encolhe no clique; mais rastro, brilho,
//    ondas e faíscas no clique e cor arco-íris.
// 2) Modelo do ponteiro do sistema (seta moderna, neon, mira, pixel… ou uma imagem enviada pelo usuário), via CSS.
// Só em mouse/trackpad (nunca no toque); o efeito desliga com "reduzir movimento".
const CLICAVEL = 'a, button, [role="button"], [role="switch"], [role="tab"], select, summary, label[for], .cursor-pointer'
const TEXTO = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable="true"]'

function corDoCursor(p) {
  if (p.cursor_cor === 'marca') return 'hsl(var(--primary))'
  if (p.cursor_cor === 'contraste') return 'hsl(var(--foreground))'
  if (p.cursor_cor === 'personalizada') return p.cursor_cor_hex || '#14b8a6'
  return '#ffffff'
}

export default function Cursor() {
  const [p] = usePreferencias()
  const anel = useRef(null), ponto = useRef(null), tela = useRef(null)
  const fino = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
  const calmo = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ativo = p.cursor && fino && !calmo
  const efeitos = Array.isArray(p.cursor_efeitos) ? p.cursor_efeitos : []
  const esconder = ativo && (p.cursor_esconder_seta || p.cursor_estilo === 'sem_ponteiro')
  const chaveEfeitos = efeitos.join(',')

  // modelo do ponteiro do sistema (vale mesmo com o efeito desligado)
  useEffect(() => {
    let css = document.getElementById('cursor-modelo')
    const limpar = () => { if (css) css.textContent = '' }
    if (!fino || p.cursor_modelo === 'sistema' || esconder) { limpar(); return undefined }
    let cancelado = false
    ;(async () => {
      let par = null
      if (p.cursor_modelo.startsWith('meu:')) {
        const item = lerCursores().find((c) => c.id === p.cursor_modelo.slice(4))
        if (item) par = await cursorDeImagem(item, p.cursor_modelo_tamanho).catch(() => null)
      } else par = cursorEmbutido(p.cursor_modelo, p.cursor_modelo_tamanho, p.cursor_cor === 'personalizada' ? (p.cursor_cor_hex || '#14b8a6') : p.cursor_cor === 'branco' ? '#ffffff' : p.cursor_cor)
      if (cancelado) return
      if (!par) { limpar(); return }
      if (!css) { css = document.createElement('style'); css.id = 'cursor-modelo'; document.head.appendChild(css) }
      css.textContent = `html, html * { cursor: ${par.normal}, auto !important; }
html :is(${CLICAVEL}) { cursor: ${par.clicavel}, pointer !important; }
html :is(${TEXTO}) { cursor: text !important; }`
    })()
    return () => { cancelado = true }
  }, [fino, esconder, p.cursor_modelo, p.cursor_modelo_tamanho, p.cursor_cor, p.cursor_cor_hex])
  useEffect(() => () => { const c = document.getElementById('cursor-modelo'); if (c) c.textContent = '' }, [])

  // efeito que segue o mouse
  useEffect(() => {
    document.documentElement.classList.toggle('cursor-escondido', esconder)
    if (!ativo) return undefined
    const a = anel.current, d = ponto.current, cv = tela.current
    const tem = (k) => efeitos.includes(k)
    const alvo = { x: -100, y: -100 }, atual = { x: -100, y: -100 }
    const suave = Math.max(0.04, Math.min(1, (Number(p.cursor_suavidade) || 20) / 100))
    let escala = 1, escalaAlvo = 1, forma = 'normal', visivel = false, quadro, ima = null
    const rastro = [], ondas = [], faiscas = []
    const g = cv?.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const ajustar = () => { if (!cv) return; cv.width = window.innerWidth * dpr; cv.height = window.innerHeight * dpr; cv.style.width = `${window.innerWidth}px`; cv.style.height = `${window.innerHeight}px` }
    ajustar(); window.addEventListener('resize', ajustar)
    const corBase = () => getComputedStyle(a || d).borderColor || getComputedStyle(d).backgroundColor

    const mover = (e) => {
      alvo.x = e.clientX; alvo.y = e.clientY
      if (!visivel) { visivel = true; atual.x = alvo.x; atual.y = alvo.y; a.style.opacity = d.style.opacity = '1' }
      const el = e.target instanceof Element ? e.target : null
      const clic = el?.closest(CLICAVEL)
      forma = el?.closest(TEXTO) ? 'texto' : clic ? 'clicavel' : 'normal'
      ima = tem('magnetico') && clic && forma === 'clicavel' ? clic : null
      escalaAlvo = forma === 'clicavel' && !ima ? 1.6 : 1
      a.dataset.forma = ima ? 'ima' : forma
      if (tem('rastro')) { rastro.push({ x: e.clientX, y: e.clientY, v: 1 }); if (rastro.length > 28) rastro.shift() }
    }
    const baixo = (e) => {
      escalaAlvo = 0.7
      const cor = corBase()
      if (tem('ondas')) ondas.push({ x: e.clientX, y: e.clientY, r: 4, v: 1, cor })
      if (tem('faiscas')) for (let i = 0; i < 16; i++) { const ang = Math.random() * Math.PI * 2, vel = 2 + Math.random() * 4; faiscas.push({ x: e.clientX, y: e.clientY, vx: Math.cos(ang) * vel, vy: Math.sin(ang) * vel - 1.5, v: 1, cor, t: 1.5 + Math.random() * 2 }) }
    }
    const cima = () => { escalaAlvo = forma === 'clicavel' && !ima ? 1.6 : 1 }
    const sair = () => { visivel = false; a.style.opacity = d.style.opacity = '0' }
    const t0 = performance.now()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      const t = (performance.now() - t0) / 1000
      let tx = alvo.x, ty = alvo.y
      if (ima && ima.isConnected) {
        const r = ima.getBoundingClientRect()
        tx = r.left + r.width / 2 + (alvo.x - (r.left + r.width / 2)) * 0.12; ty = r.top + r.height / 2 + (alvo.y - (r.top + r.height / 2)) * 0.12
        a.style.width = `${r.width + 10}px`; a.style.height = `${r.height + 10}px`
        a.style.borderRadius = `${Math.min(r.height / 2 + 5, parseFloat(getComputedStyle(ima).borderRadius) + 5 || 10)}px`
      } else if (a.style.borderRadius) { a.style.width = a.style.height = ''; a.style.borderRadius = '' }
      atual.x += (tx - atual.x) * suave; atual.y += (ty - atual.y) * suave
      escala += (escalaAlvo - escala) * 0.18
      a.style.transform = `translate3d(${atual.x}px, ${atual.y}px, 0) translate(-50%, -50%) scale(${forma === 'texto' || ima ? 1 : escala})`
      d.style.transform = `translate3d(${alvo.x}px, ${alvo.y}px, 0) translate(-50%, -50%)`
      if (tem('arco_iris')) { const cor = `hsl(${(t * 70) % 360}, 85%, 60%)`; a.style.borderColor = cor; a.style.color = cor; d.style.background = cor }
      if (!g) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, window.innerWidth, window.innerHeight)
      if (rastro.length) {
        const cor = corBase()
        for (let i = 0; i < rastro.length; i++) {
          const pt = rastro[i]; pt.v -= 0.035
          if (pt.v <= 0) continue
          g.globalAlpha = pt.v * 0.55 * (i / rastro.length); g.fillStyle = cor
          g.beginPath(); g.arc(pt.x, pt.y, 1 + pt.v * (Number(p.cursor_ponto_tamanho) || 6) * 0.6, 0, Math.PI * 2); g.fill()
        }
        while (rastro.length && rastro[0].v <= 0) rastro.shift()
      }
      for (const o of ondas) { o.r += 2.6; o.v -= 0.03; if (o.v <= 0) continue; g.globalAlpha = Math.max(0, o.v); g.strokeStyle = o.cor; g.lineWidth = 2; g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.stroke() }
      for (let i = ondas.length - 1; i >= 0; i--) if (ondas[i].v <= 0) ondas.splice(i, 1)
      for (const f of faiscas) { f.x += f.vx; f.y += f.vy; f.vy += 0.18; f.vx *= 0.97; f.v -= 0.025; if (f.v <= 0) continue; g.globalAlpha = f.v; g.fillStyle = f.cor; g.beginPath(); g.arc(f.x, f.y, f.t * f.v, 0, Math.PI * 2); g.fill() }
      for (let i = faiscas.length - 1; i >= 0; i--) if (faiscas[i].v <= 0) faiscas.splice(i, 1)
      g.globalAlpha = 1
    }
    window.addEventListener('pointermove', mover, { passive: true })
    window.addEventListener('pointerdown', baixo); window.addEventListener('pointerup', cima)
    document.addEventListener('pointerleave', sair); window.addEventListener('blur', sair)
    quadro = requestAnimationFrame(laco)
    return () => {
      cancelAnimationFrame(quadro)
      window.removeEventListener('resize', ajustar)
      window.removeEventListener('pointermove', mover); window.removeEventListener('pointerdown', baixo); window.removeEventListener('pointerup', cima)
      document.removeEventListener('pointerleave', sair); window.removeEventListener('blur', sair)
      document.documentElement.classList.remove('cursor-escondido')
    }
  }, [ativo, esconder, chaveEfeitos, p.cursor_suavidade, p.cursor_ponto_tamanho]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!ativo) return null
  const cor = corDoCursor(p)
  const tam = Math.max(12, Math.min(120, Number(p.cursor_tamanho) || 36))
  const tamPonto = Math.max(2, Math.min(24, Number(p.cursor_ponto_tamanho) || 6))
  const estilo = p.cursor_estilo === 'sem_ponteiro' ? 'anel_ponto' : p.cursor_estilo
  const comAnel = !['ponto', 'nenhum'].includes(estilo), comPonto = ['anel_ponto', 'ponto', 'mira'].includes(estilo)
  const mistura = p.cursor_cor === 'branco' ? 'difference' : 'normal'
  const brilho = efeitos.includes('brilho')
  const precisaTela = efeitos.some((e) => ['rastro', 'ondas', 'faiscas'].includes(e))
  return (
    <>
      {precisaTela && <canvas ref={tela} aria-hidden className="pointer-events-none fixed left-0 top-0 z-[2147483645]" style={{ mixBlendMode: mistura }} />}
      <div ref={anel} aria-hidden className="cursor-anel" data-forma="normal" data-estilo={estilo} data-brilho={brilho ? '1' : undefined}
        style={{ width: tam, height: tam, borderColor: cor, color: cor, borderWidth: Number(p.cursor_espessura) || 1.5, display: comAnel ? 'block' : 'none', mixBlendMode: mistura }} />
      <div ref={ponto} aria-hidden className="cursor-ponto" data-brilho={brilho ? '1' : undefined} style={{ width: tamPonto, height: tamPonto, background: cor, color: cor, display: comPonto ? 'block' : 'none', mixBlendMode: mistura }} />
    </>
  )
}
