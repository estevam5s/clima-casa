'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { consentiu } from '@/lib/consentimento'
import { SISTEMA_URL } from '@/lib/dados'

// Medição própria de acessos (tela Acessos e SEO do sistema): página vista, cliques em links e botões, Web Vitals e quem
// está com a página aberta. Sem cookies de terceiros e sem guardar IP (o servidor só anota país, estado e cidade).
// O visitante só é reconhecido entre visitas com o consentimento de "estatísticas"; sem ele, cada visita é anônima.
const fila = []
let sessao = '', visitante = '', rota = '/', iniciado = false
const robo = typeof navigator !== 'undefined' && (navigator.webdriver || /bot|crawl|spider|headless|lighthouse/i.test(navigator.userAgent))
const novoId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

function ids() {
  if (consentiu('estatisticas')) {
    try {
      visitante = localStorage.getItem('zynio-visitante') || novoId(); localStorage.setItem('zynio-visitante', visitante)
      sessao = sessionStorage.getItem('zynio-sessao') || novoId(); sessionStorage.setItem('zynio-sessao', sessao)
      return
    } catch { /* sem armazenamento */ }
  }
  visitante = ''
  sessao ||= novoId()   // só na memória desta aba
}

function enviar(final = false) {
  if (!fila.length || robo) return
  ids()
  const corpo = JSON.stringify({ origem: 'site', sessao, visitante, idioma: document.documentElement.lang || navigator.language || '', ref: document.referrer || '', eventos: fila.splice(0, 40) })
  const url = `${SISTEMA_URL}/api/site/coletar`
  try {
    if (final && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([corpo], { type: 'text/plain' })); return }
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {})
  } catch { /* sem rede */ }
}
const por = (e) => { if (!robo) { fila.push(e); if (fila.length >= 30) enviar() } }

function iniciar() {
  if (iniciado || robo) return
  iniciado = true
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('a,button,[role="button"]')
    if (!el) return
    const nome = (el.getAttribute('aria-label') || el.title || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!nome) return
    por({ tipo: 'clique', rota, nome, alvo: el.tagName === 'A' ? (el.getAttribute('href') || '').split('?')[0].slice(0, 160) : '' })
  }, { capture: true, passive: true })
  try {
    const nav = performance.getEntriesByType('navigation')[0]
    if (nav) por({ tipo: 'vital', nome: 'TTFB', valor: nav.responseStart, rota })
    new PerformanceObserver((l) => { for (const x of l.getEntries()) if (x.name === 'first-contentful-paint') por({ tipo: 'vital', nome: 'FCP', valor: x.startTime, rota }) }).observe({ type: 'paint', buffered: true })
    let lcp = 0, cls = 0, inp = 0, fechou = false
    new PerformanceObserver((l) => { const x = l.getEntries().at(-1); if (x) lcp = x.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => { for (const x of l.getEntries()) if (!x.hadRecentInput) cls += x.value }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((l) => { for (const x of l.getEntries()) if (x.interactionId) inp = Math.max(inp, x.duration) }).observe({ type: 'event', buffered: true, durationThreshold: 40 })
    const r0 = rota
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      if (!fechou) {
        fechou = true
        if (lcp) por({ tipo: 'vital', nome: 'LCP', valor: lcp, rota: r0 })
        por({ tipo: 'vital', nome: 'CLS', valor: Math.round(cls * 1000) / 1000, rota: r0 })
        if (inp) por({ tipo: 'vital', nome: 'INP', valor: inp, rota: r0 })
      }
      enviar(true)
    })
  } catch { /* sem PerformanceObserver */ }
  window.addEventListener('error', (e) => por({ tipo: 'erro', rota, nome: String(e.message || 'erro').slice(0, 120) }))
  setInterval(() => { if (document.visibilityState === 'visible') por({ tipo: 'ping', rota }); enviar() }, 60000)
}

export default function Medicao() {
  const caminho = usePathname()
  useEffect(() => {
    iniciar()
    rota = caminho
    por({ tipo: 'pagina', rota: caminho })
    const t = setTimeout(enviar, 3000)
    return () => clearTimeout(t)
  }, [caminho])
  return null
}
