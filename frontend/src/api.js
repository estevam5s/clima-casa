import { tokenAtual } from './supabase'

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem)
    this.status = status
  }
}

async function chamar(metodo, caminho, corpo) {
  const opcoes = { method: metodo, credentials: 'same-origin', headers: {} }
  const token = await tokenAtual().catch(() => null)
  if (token) opcoes.headers.Authorization = `Bearer ${token}`
  if (corpo !== undefined) {
    opcoes.headers['Content-Type'] = 'application/json'
    opcoes.body = JSON.stringify(corpo)
  }
  let r
  try {
    r = await fetch(caminho, opcoes)
  } catch {
    throw new ErroApi(0, 'Sem conexão com o servidor do Clima Casa.')
  }
  const texto = await r.text()
  let dados = null
  try { dados = texto ? JSON.parse(texto) : null } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    let msg = dados?.detail
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join('; ')
    if (r.status === 401) window.dispatchEvent(new Event('clima:sessao-expirada'))
    throw new ErroApi(r.status, msg || `Erro ${r.status}`)
  }
  return dados
}

export const api = {
  get: (c) => chamar('GET', c),
  post: (c, b = {}) => chamar('POST', c, b),
  put: (c, b) => chamar('PUT', c, b),
  del: (c) => chamar('DELETE', c),
}

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
export function haQuanto(ts) {
  if (!ts) return 'nunca'
  const s = Math.round(ts - Date.now() / 1000)
  const abs = Math.abs(s)
  if (abs < 45) return 'agora'
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day')
  return dataHora(ts)
}

export function dataHora(ts) {
  return new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const MODOS = { frio: 'Frio', quente: 'Quente', ventilar: 'Ventilar', seco: 'Desumidificar', auto: 'Automático' }
export const VENTILACAO = { auto: 'Automática', baixa: 'Baixa', media: 'Média', alta: 'Alta' }
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function rotuloOrigem(o) {
  if (!o) return ''
  if (o.startsWith('agenda:')) return `Agenda · ${o.slice(7)}`
  if (o.startsWith('cena:')) return `Cena · ${o.slice(5)}`
  if (o.startsWith('automacao:')) return `Automação · ${o.slice(10)}`
  return { painel: 'Painel', alexa: 'Alexa', sistema: 'Sistema', agente: 'Agente do Mac', sinric: 'Alexa/Google', automacao: 'Automação' }[o] || o
}
