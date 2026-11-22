import { api } from './api'

// Erros de JavaScript nas telas: guarda os últimos (para anexar a um relato de bug) e manda cada erro novo para a área de
// Bugs (o servidor deduplica e limita). Não manda o mesmo erro duas vezes na mesma visita, nem quando não há login.
const enviados = new Set()
export const errosRecentes = []
const ignorar = /ResizeObserver loop|Script error\.?$|turnstile|cloudflare|extension:\/\//i

// Publicação nova troca os nomes dos arquivos (hash). Uma aba aberta antes tenta baixar um pedaço que não existe mais:
// em vez de virar erro (e bug), recarrega a página UMA vez e pega a versão nova. Se falhar de novo em 1 minuto, é erro real.
const VERSAO_TROCADA = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk \S+ failed/i
export const versaoTrocada = (erro) => VERSAO_TROCADA.test(String(erro?.message || erro || ''))
export function podeRecarregar() {
  try { return Date.now() - Number(sessionStorage.getItem('clima-recarga-versao') || 0) >= 60000 } catch { return false }   // já recarregou há pouco: não entra em laço
}
export function recarregarUmaVez() {
  if (!podeRecarregar()) return false
  try { sessionStorage.setItem('clima-recarga-versao', String(Date.now())) } catch { return false }
  location.reload()
  return true
}

function anotar(mensagem, pilha = '') {
  if (!mensagem || ignorar.test(mensagem)) return
  if (versaoTrocada(mensagem) && recarregarUmaVez()) return
  errosRecentes.unshift(`${new Date().toLocaleTimeString('pt-BR')} ${mensagem}`.slice(0, 300))
  errosRecentes.length = Math.min(errosRecentes.length, 10)
  const chave = `${location.pathname}|${mensagem}`.slice(0, 300)
  if (enviados.has(chave) || enviados.size > 30) return
  enviados.add(chave)
  api.post('/api/bugs/erro-cliente', { mensagem: String(mensagem).slice(0, 500), pilha: String(pilha || '').slice(0, 3000), pagina: location.pathname + location.search, navegador: navigator.userAgent.slice(0, 300) }).catch(() => {})
}

export function vigiarErros() {
  // o Vite avisa quando um import dinâmico (tela, 3D) não carrega: recarrega antes de virar erro
  window.addEventListener('vite:preloadError', (e) => { if (recarregarUmaVez()) e.preventDefault() })
  window.addEventListener('error', (e) => anotar(e.message, e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r?.status && r.status < 500) return   // erro de API já tratado na tela (401, 403, 409…): não é bug do código
    anotar(r?.message || String(r), r?.stack)
  })
}
