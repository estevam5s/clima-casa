import { api } from './api'

// Erros de JavaScript nas telas: guarda os últimos (para anexar a um relato de bug) e manda cada erro novo para a área de
// Bugs (o servidor deduplica e limita). Não manda o mesmo erro duas vezes na mesma visita, nem quando não há login.
const enviados = new Set()
export const errosRecentes = []
// trilha: os últimos passos da visita (telas, cliques, falhas de API, travamentos). Vai junto com o erro e com o relato de bug,
// para quem corrige saber o que a pessoa fez antes. Só o texto do botão ou do link, nunca o que foi digitado.
export const trilha = []
function passo(t) {
  trilha.unshift(`${new Date().toLocaleTimeString('pt-BR')} ${t}`.slice(0, 160))
  trilha.length = Math.min(trilha.length, 25)
}
const ignorar = /ResizeObserver loop|Script error\.?$|turnstile|cloudflare|extension:\/\//i

// Publicação nova troca os nomes dos arquivos (hash). Uma aba aberta antes tenta baixar um pedaço que não existe mais:
// em vez de virar erro (e bug), recarrega a página UMA vez e pega a versão nova. Se falhar de novo em 1 minuto, é erro real.
const VERSAO_TROCADA = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk \S+ failed/i
// enquanto a página recarrega por versão nova, o Vite devolve "nada" no lugar da tela (o React acusa "reading 'default'"):
// esse erro do meio segundo antes de recarregar também não é bug
export const versaoTrocada = (erro) => VERSAO_TROCADA.test(String(erro?.message || erro || '')) || (typeof window !== 'undefined' && !!window.__climaRecarregando)
export function podeRecarregar() {
  try { return Date.now() - Number(sessionStorage.getItem('clima-recarga-versao') || 0) >= 60000 } catch { return false }   // já recarregou há pouco: não entra em laço
}
export function recarregarUmaVez() {
  if (!podeRecarregar()) return false
  try { sessionStorage.setItem('clima-recarga-versao', String(Date.now())) } catch { return false }
  window.__climaRecarregando = true
  location.reload()
  return true
}

// o pedaço que falhou ainda existe no servidor? Se não existe (404), a aba é de uma versão anterior: não é bug do código
async function pedacoSumiu(mensagem) {
  const url = String(mensagem).match(/https?:\/\/[^\s'"]+\.(?:js|css)/)?.[0]
  if (!url) return true
  try { const r = await fetch(url, { method: 'HEAD', cache: 'no-store' }); return r.status === 404 } catch { return true }   // sem rede: também não é bug
}

async function anotar(mensagem, pilha = '', tipo = 'js') {
  if (!mensagem || ignorar.test(mensagem)) return
  if (versaoTrocada(mensagem) && (recarregarUmaVez() || await pedacoSumiu(mensagem))) return
  errosRecentes.unshift(`${new Date().toLocaleTimeString('pt-BR')} ${mensagem}`.slice(0, 300))
  errosRecentes.length = Math.min(errosRecentes.length, 10)
  const chave = `${location.pathname}|${mensagem}`.slice(0, 300)
  if (enviados.has(chave) || enviados.size > 30) return
  enviados.add(chave)
  api.post('/api/bugs/erro-cliente', { mensagem: String(mensagem).slice(0, 500), pilha: String(pilha || '').slice(0, 3000), pagina: location.pathname + location.search,
    navegador: navigator.userAgent.slice(0, 300), trilha: trilha.slice(0, 25), tipo }).catch(() => {})
}

// problemas que não são erro de JavaScript mas estragam o uso: tela travada, API que falha seguido, tela que ficou em branco
const contagemApi = {}
function vigiarProblemas() {
  let ultimaRota = location.pathname
  setInterval(() => { if (location.pathname !== ultimaRota) { ultimaRota = location.pathname; passo(`abriu ${ultimaRota}`); conferirBranco() } }, 700)
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('button, a, [role=tab], [role=button]')
    if (!el) return
    const txt = (el.getAttribute('aria-label') || el.innerText || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 50)
    if (txt) passo(`clicou "${txt}"`)
  }, true)
  window.addEventListener('clima:api', (e) => {
    const { metodo, caminho, status, ms } = e.detail
    passo(status ? `${metodo} ${caminho} → ${status} (${ms} ms)` : `${metodo} ${caminho} → sem conexão`)
    if (status >= 500 || ms > 15000) {
      const k = `${metodo} ${caminho.replace(/\/\d+(?=\/|$)/g, '/{id}')}`
      contagemApi[k] = (contagemApi[k] || 0) + 1
      if (contagemApi[k] === 3) anotar(status >= 500 ? `A API falhou 3 vezes seguidas: ${k} (${status})` : `A API demorou mais de 15 s 3 vezes: ${k}`, '', 'api')
    }
  })
  try {   // travamento: tarefa do navegador que segura a tela por mais de 3 s
    new PerformanceObserver((l) => {
      for (const t of l.getEntries()) if (t.duration > 3000) { passo(`tela travou ${Math.round(t.duration)} ms`); anotar(`A tela travou por ${(t.duration / 1000).toFixed(1)} s`, '', 'travamento') }
    }).observe({ type: 'longtask', buffered: false })
  } catch { /* navegador sem longtask */ }
}
function conferirBranco() {
  const rota = location.pathname
  setTimeout(() => {
    if (location.pathname !== rota || document.hidden) return
    const main = document.querySelector('main')
    if (main && main.innerText.trim().length < 5 && !main.querySelector('canvas, svg, img, [role=status]')) anotar(`A tela ${rota} ficou em branco por 10 s`, '', 'branco')
  }, 10000)
}

export function vigiarErros() {
  // o Vite avisa quando um import dinâmico (tela, 3D) não carrega: recarrega antes de virar erro
  window.addEventListener('vite:preloadError', (e) => { if (recarregarUmaVez()) e.preventDefault() })
  window.addEventListener('error', (e) => anotar(e.message, e.error?.stack))
  vigiarProblemas()
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r?.status && r.status < 500) return   // erro de API já tratado na tela (401, 403, 409…): não é bug do código
    anotar(r?.message || String(r), r?.stack)
  })
}
