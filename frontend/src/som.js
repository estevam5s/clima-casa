// Sons de notificação sintetizados com Web Audio (nenhum arquivo de áudio de terceiros).
// O navegador só libera áudio depois de um toque/clique na página: o contexto é criado e "destravado" no 1º gesto.
let ctx = null
function contexto() {
  if (!ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A() }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}
if (typeof window !== 'undefined') {
  const destravar = () => { contexto(); window.removeEventListener('pointerdown', destravar); window.removeEventListener('keydown', destravar) }
  window.addEventListener('pointerdown', destravar); window.addEventListener('keydown', destravar)
}

// nota curta com ataque rápido e decaimento exponencial; harmônico leve deixa o som "redondo"
function nota(c, saida, t, freq, dur, vol, tipo = 'sine', deslize = 0) {
  const o = c.createOscillator(), g = c.createGain()
  o.type = tipo
  o.frequency.setValueAtTime(freq, t)
  if (deslize) o.frequency.exponentialRampToValueAtTime(freq * deslize, t + dur * 0.6)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(saida); o.start(t); o.stop(t + dur + 0.02)
}

export const TONS = {
  mensagem: { rotulo: 'Mensagem (pop duplo)', tocar: (c, s, t) => { nota(c, s, t, 1318, 0.09, 0.5, 'sine', 1.08); nota(c, s, t + 0.11, 1760, 0.16, 0.45, 'sine', 1.05); nota(c, s, t + 0.11, 3520, 0.08, 0.06, 'sine') } },
  gota: { rotulo: 'Gota', tocar: (c, s, t) => { nota(c, s, t, 900, 0.18, 0.55, 'sine', 2.2) } },
  sino: { rotulo: 'Sino', tocar: (c, s, t) => { nota(c, s, t, 1568, 0.9, 0.35); nota(c, s, t, 3136, 0.5, 0.08); nota(c, s, t + 0.005, 2093, 0.7, 0.12) } },
  digital: { rotulo: 'Digital', tocar: (c, s, t) => { nota(c, s, t, 1046, 0.07, 0.3, 'square'); nota(c, s, t + 0.09, 1568, 0.09, 0.3, 'square') } },
  suave: { rotulo: 'Suave', tocar: (c, s, t) => { nota(c, s, t, 660, 0.35, 0.4); nota(c, s, t + 0.16, 880, 0.45, 0.35) } },
  alerta: { rotulo: 'Alerta (urgente)', tocar: (c, s, t) => { for (let i = 0; i < 3; i++) { nota(c, s, t + i * 0.18, 1200, 0.12, 0.45, 'triangle'); nota(c, s, t + i * 0.18 + 0.06, 900, 0.1, 0.35, 'triangle') } } },
}

export function tocar(tom = 'mensagem', volume = 70) {
  const c = contexto()
  if (!c || !volume) return false
  const saida = c.createGain(); saida.gain.value = Math.min(1, volume / 100); saida.connect(c.destination)
  ;(TONS[tom] || TONS.mensagem).tocar(c, saida, c.currentTime + 0.02)
  return true
}

export function emNaoPerturbe(p) {
  if (!p?.nao_perturbe) return false
  const agora = new Date(), m = agora.getHours() * 60 + agora.getMinutes()
  const [a, b] = [p.nao_perturbe_inicio, p.nao_perturbe_fim].map((x) => { const [h, mm] = (x || '00:00').split(':').map(Number); return h * 60 + mm })
  return a <= b ? m >= a && m < b : m >= a || m < b   // pode virar a meia-noite
}

// Avisa uma notificação nova: som (tom normal ou de alerta), vibração e aviso do sistema operacional.
export function avisar(n, p) {
  if (!p || emNaoPerturbe(p)) return
  const importante = n.gravidade === 'alta' || n.tipo === 'seguranca'
  if (p.som_so_importantes && !importante) return
  if (p.som) tocar(importante ? p.som_alerta : p.som_tom, p.som_volume)
  if (p.vibrar && navigator.vibrate) navigator.vibrate(importante ? [120, 60, 120, 60, 200] : [70, 40, 70])
  if (p.desktop && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
    try {
      const aviso = new Notification(n.titulo, { body: n.detalhe || '', icon: '/icone-192.png', tag: n.chave || String(n.id), silent: true })
      aviso.onclick = () => { window.focus(); if (n.link) window.location.assign(n.link); aviso.close() }
    } catch { /* sem suporte */ }
  }
}

// Clique do mouse (Configurações → Aparência → Cursor → Som ao clicar): um "tique" curto e baixo, sintetizado aqui mesmo.
// Toca em botões, links e controles; não toca em campos de texto (digitar não faz som). Preferência de cada navegador.
let ultimoClique = 0
export function clique(volume = 35) {
  const agora = performance.now()
  if (agora - ultimoClique < 40) return   // duplo evento (pointerdown + click de label) não vira dois sons
  ultimoClique = agora
  const c = contexto()
  if (!c || !volume) return
  const t = c.currentTime + 0.005
  const saida = c.createGain(); saida.gain.value = Math.min(1, volume / 100) * 0.5; saida.connect(c.destination)
  nota(c, saida, t, 1850, 0.035, 0.55, 'triangle', 0.7)
  nota(c, saida, t, 3700, 0.018, 0.12, 'sine')
}
const ALVO_CLIQUE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="option"], summary, select, input[type="checkbox"], input[type="radio"], label[for]'
export function ligarSomDeClique(ler) {
  if (typeof window === 'undefined') return () => {}
  const ouvir = (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return
    const p = ler()
    if (!p.som_clique) return
    const el = e.target?.closest?.(ALVO_CLIQUE)
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return
    clique(p.som_clique_volume ?? 35)
  }
  window.addEventListener('pointerdown', ouvir, { capture: true, passive: true })
  return () => window.removeEventListener('pointerdown', ouvir, { capture: true })
}
