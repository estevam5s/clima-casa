import { api } from './api'

// Erros de JavaScript nas telas: guarda os últimos (para anexar a um relato de bug) e manda cada erro novo para a área de
// Bugs (o servidor deduplica e limita). Não manda o mesmo erro duas vezes na mesma visita, nem quando não há login.
const enviados = new Set()
export const errosRecentes = []
const ignorar = /ResizeObserver loop|Script error\.?$|turnstile|cloudflare|extension:\/\//i

function anotar(mensagem, pilha = '') {
  if (!mensagem || ignorar.test(mensagem)) return
  errosRecentes.unshift(`${new Date().toLocaleTimeString('pt-BR')} ${mensagem}`.slice(0, 300))
  errosRecentes.length = Math.min(errosRecentes.length, 10)
  const chave = `${location.pathname}|${mensagem}`.slice(0, 300)
  if (enviados.has(chave) || enviados.size > 30) return
  enviados.add(chave)
  api.post('/api/bugs/erro-cliente', { mensagem: String(mensagem).slice(0, 500), pilha: String(pilha || '').slice(0, 3000), pagina: location.pathname + location.search, navegador: navigator.userAgent.slice(0, 300) }).catch(() => {})
}

export function vigiarErros() {
  window.addEventListener('error', (e) => anotar(e.message, e.error?.stack))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    if (r?.status && r.status < 500) return   // erro de API já tratado na tela (401, 403, 409…): não é bug do código
    anotar(r?.message || String(r), r?.stack)
  })
}
