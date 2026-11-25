// Medição de uso do próprio sistema (tela Acessos e SEO): páginas vistas, cliques em botões e links, Web Vitals,
// tempo de cada chamada da API (amostra) e quem está com a aba aberta. Vai em lotes para /api/site/coletar.
// Não manda o conteúdo de campos nem textos digitados: de um clique, só o rótulo do botão/link (até 60 caracteres).
const fila = []
let sessao = ''
try { sessao = sessionStorage.getItem('clima-medicao') || '' } catch { /* sem armazenamento */ }
if (!sessao) {
  sessao = Math.random().toString(36).slice(2) + Date.now().toString(36)
  try { sessionStorage.setItem('clima-medicao', sessao) } catch { /* sem armazenamento */ }
}
const desligado = typeof navigator !== 'undefined' && (navigator.webdriver || /HeadlessChrome/.test(navigator.userAgent))
let rotaAtual = typeof location !== 'undefined' ? location.pathname : '/'

function enviar(final = false) {
  if (!fila.length || desligado) return
  const corpo = JSON.stringify({ origem: 'sistema', sessao, idioma: navigator.language || '', ref: document.referrer || '', eventos: fila.splice(0, 40) })
  try {
    if (final && navigator.sendBeacon) { navigator.sendBeacon('/api/site/coletar', new Blob([corpo], { type: 'application/json' })); return }
    fetch('/api/site/coletar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true }).catch(() => {})
  } catch { /* sem rede */ }
}
// quanto da página a pessoa rolou (maior %): só conta a área de rolagem principal (mais de metade da tela de altura)
let rolou = 0
function medirRolagem(e) {
  const el = e.target === document ? document.scrollingElement : e.target
  if (!el || !el.clientHeight || el.clientHeight < window.innerHeight * 0.5 || el.scrollHeight <= el.clientHeight + 40) return
  const pct = Math.min(100, Math.round(((el.scrollTop + el.clientHeight) / el.scrollHeight) * 100))
  if (pct > rolou) rolou = pct
}
if (typeof document !== 'undefined') document.addEventListener('scroll', medirRolagem, { capture: true, passive: true })
function fecharRolagem() { if (rolou) por({ tipo: 'rolagem', rota: rotaAtual, valor: rolou }); rolou = 0 }

function por(evento) {
  if (desligado) return
  fila.push(evento)
  if (fila.length >= 30) enviar()
}

export function medirPagina(rota) {
  fecharRolagem()
  rotaAtual = rota.replace(/\/\d+(?=\/|$)/g, '/:id')   // /aparelhos/12 conta junto com /aparelhos/7
  por({ tipo: 'pagina', rota: rotaAtual })
}

// amostra de 1 em 5 chamadas (e todas as que falham): tempo por rota, com os ids trocados por :id
export function medirApi(caminho, metodo, ms, status) {
  if (desligado || caminho.startsWith('/api/site/coletar')) return
  if (status > 0 && status < 500 && Math.random() > 0.2) return
  const rota = `${metodo} ${caminho.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id').replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, '/:id')}`
  por({ tipo: 'api', rota: rotaAtual, alvo: rota.slice(0, 120), valor: Math.round(ms), dados: { status } })
}

function iniciar() {
  if (desligado || typeof window === 'undefined') return
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('a,button,[role="button"],[role="tab"]')
    if (!el) return
    const nome = (el.getAttribute('aria-label') || el.title || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!nome) return
    const alvo = el.tagName === 'A' ? (el.getAttribute('href') || '').split('?')[0].slice(0, 120) : ''
    por({ tipo: 'clique', rota: rotaAtual, nome, alvo })
  }, { capture: true, passive: true })
  // Web Vitals (o mesmo jeito que o Google mede): LCP, CLS, INP aproximado, FCP e TTFB
  try {
    const nav = performance.getEntriesByType('navigation')[0]
    if (nav) por({ tipo: 'vital', nome: 'TTFB', valor: nav.responseStart, rota: rotaAtual })
    new PerformanceObserver((l) => { for (const x of l.getEntries()) if (x.name === 'first-contentful-paint') por({ tipo: 'vital', nome: 'FCP', valor: x.startTime, rota: rotaAtual }) }).observe({ type: 'paint', buffered: true })
    let lcp = 0
    new PerformanceObserver((l) => { const x = l.getEntries().at(-1); if (x) lcp = x.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
    // CLS como o Google conta: a pior "janela" de deslocamentos (até 5 s, com menos de 1 s entre um e outro), e não a
    // soma de tudo enquanto a aba fica aberta. A soma crescia por horas, a cada tela visitada, e chegou a 1,56.
    let cls = 0, janela = 0, inicioJ = 0, ultimo = 0
    new PerformanceObserver((l) => {
      for (const x of l.getEntries()) {
        if (x.hadRecentInput) continue
        if (janela && x.startTime - ultimo < 1000 && x.startTime - inicioJ < 5000) janela += x.value
        else { janela = x.value; inicioJ = x.startTime }
        ultimo = x.startTime
        cls = Math.max(cls, janela)
      }
    }).observe({ type: 'layout-shift', buffered: true })
    let inp = 0
    new PerformanceObserver((l) => { for (const x of l.getEntries()) if (x.interactionId) inp = Math.max(inp, x.duration) }).observe({ type: 'event', buffered: true, durationThreshold: 40 })
    let fechou = false
    const fechar = () => {
      if (fechou) return
      fechou = true
      if (lcp) por({ tipo: 'vital', nome: 'LCP', valor: lcp, rota: rotaAtual })
      por({ tipo: 'vital', nome: 'CLS', valor: Math.round(cls * 1000) / 1000, rota: rotaAtual, dados: { janela: 1 } })
      if (inp) por({ tipo: 'vital', nome: 'INP', valor: inp, rota: rotaAtual })
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { fechar(); fecharRolagem(); enviar(true) } })
  } catch { /* navegador sem PerformanceObserver */ }
  window.addEventListener('error', (e) => por({ tipo: 'erro', rota: rotaAtual, nome: String(e.message || 'erro').slice(0, 120) }))
  // quem está com a aba aberta (online agora) e envio periódico
  setInterval(() => { if (document.visibilityState === 'visible') por({ tipo: 'ping', rota: rotaAtual }); enviar() }, 60000)
  setTimeout(enviar, 4000)
}
iniciar()
