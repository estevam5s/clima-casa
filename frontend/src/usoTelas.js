// Tempo de tela de quem está logado (Configurações → Usuários → Uso do sistema): soma só o tempo com a aba visível e
// com alguém mexendo (sem mouse, teclado ou rolagem por 5 min, o relógio para), mais as passagens de uma tela para
// outra. Vai para /api/conta/uso-telas a cada minuto e quando a aba some. Nada do que foi digitado sai daqui.
import { tokenAtual } from './supabase'

const OCIOSO = 5 * 60 * 1000
let atual = null, desde = 0, ultimaAcao = Date.now(), ligado = false
const telas = new Map(), caminhos = new Map()
const desligado = typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent || ''))

const normal = (r) => (r || '/').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/+$/, '') || '/'

function fechar() {
  if (!atual || !desde) return
  const fim = Math.min(Date.now(), ultimaAcao + OCIOSO)
  if (fim > desde) { const t = telas.get(atual) || { ms: 0, visitas: 0 }; t.ms += fim - desde; telas.set(atual, t) }
  desde = document.visibilityState === 'visible' ? Date.now() : 0
}

async function enviar(final = false) {
  fechar()
  if (!telas.size && !caminhos.size) return
  const t = [...telas].map(([rota, v]) => ({ rota: String(rota).slice(0, 120), ms: Math.round(v.ms) || 0, visitas: v.visitas || 0 }))
  const c = [...caminhos].map(([k, n]) => { const [de, para] = k.split('>'); return { de: String(de).slice(0, 120), para: String(para || '').slice(0, 120), n } })
  telas.clear(); caminhos.clear()
  try {
    const token = await tokenAtual().catch(() => null)
    if (!token) return
    // em partes de até 40 (o limite do servidor): antes um minuto com muitas telas era recusado inteiro
    for (let i = 0; i < Math.max(t.length, c.length); i += 40) {
      await fetch('/api/conta/uso-telas', { method: 'POST', keepalive: final, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ telas: t.slice(i, i + 40), caminhos: c.slice(i, i + 40) }) })
    }
  } catch { /* sem rede: perde este minuto, sem atrapalhar a tela */ }
}

function iniciar() {
  if (ligado || desligado || typeof window === 'undefined') return
  ligado = true
  const acao = () => { const antes = ultimaAcao; ultimaAcao = Date.now(); if (Date.now() - antes > OCIOSO && document.visibilityState === 'visible') desde = Date.now() }
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, acao, { passive: true, capture: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { fechar(); desde = 0; enviar(true) } else { desde = Date.now(); ultimaAcao = Date.now() }
  })
  window.addEventListener('pagehide', () => enviar(true))
  setInterval(() => enviar(), 60000)
}

// chamada a cada troca de tela dentro do sistema (Layout)
export function trocarTela(rota) {
  if (desligado) return
  iniciar()
  const r = normal(rota)
  if (r === atual) return
  fechar()
  if (atual) caminhos.set(`${atual}>${r}`, (caminhos.get(`${atual}>${r}`) || 0) + 1)
  atual = r
  const t = telas.get(r) || { ms: 0, visitas: 0 }; t.visitas += 1; telas.set(r, t)
  desde = document.visibilityState === 'visible' ? Date.now() : 0
}
