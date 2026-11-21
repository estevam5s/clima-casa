import { tokenAtual } from './supabase'
import { marcaAtual } from './marcaAtual'
import { medirApi } from './medicao'

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
  const t0 = performance.now()
  try {
    r = await fetch(caminho, opcoes)
  } catch {
    medirApi(caminho, metodo, performance.now() - t0, 0)
    throw new ErroApi(0, 'Sem conexão com o servidor do Clima Escritório.')
  }
  medirApi(caminho, metodo, performance.now() - t0, r.status)
  const texto = await r.text()
  let dados = null
  try { dados = texto ? JSON.parse(texto) : null } catch { /* resposta não-JSON */ }
  if (!r.ok) {
    let msg = dados?.detail
    if (Array.isArray(msg)) msg = msg.map((d) => d.msg).join('; ')
    if (r.status === 401) window.dispatchEvent(new Event(r.headers.get('x-clima-2fa') ? 'clima:2fa' : 'clima:sessao-expirada'))
    if (r.status === 403 && r.headers.get('x-clima-exige-2fa')) window.dispatchEvent(new CustomEvent('clima:exige-2fa', { detail: msg }))
    if (r.status === 401 && r.headers.get('x-clima-2fa')) throw Object.assign(new ErroApi(401, msg || 'Confirme o código do Google Authenticator.'), { precisa2fa: true })
    throw new ErroApi(r.status, msg || `Erro ${r.status}`)
  }
  return dados
}

// Baixa um arquivo da API (com o Bearer) e dispara o download no navegador.
async function baixar(caminho, corpo = null) {
  const token = await tokenAtual().catch(() => null)
  const cab = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }
  const r = await fetch(caminho, { credentials: 'same-origin', headers: cab, ...(corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {}) })
  if (!r.ok) {
    let msg = `Erro ${r.status}`
    try { msg = (await r.json()).detail || msg } catch { /* sem corpo */ }
    throw new ErroApi(r.status, msg)
  }
  const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || 'arquivo'
  const url = URL.createObjectURL(await r.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nome })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return nome
}

// Busca uma resposta como texto (ex.: o relatório em HTML para pré-visualizar)
async function texto(caminho, corpo = null) {
  const token = await tokenAtual().catch(() => null)
  const cab = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }
  const r = await fetch(caminho, { credentials: 'same-origin', headers: cab, ...(corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {}) })
  if (!r.ok) throw new ErroApi(r.status, `Erro ${r.status}`)
  return r.text()
}

export const api = {
  baixar,
  texto,
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
  return new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: marcaAtual.hora12 })
}

export const MODOS = { frio: 'Frio', quente: 'Quente', ventilar: 'Ventilar', seco: 'Desumidificar', auto: 'Automático' }
export const VENTILACAO = { auto: 'Automática', baixa: 'Baixa', media: 'Média', alta: 'Alta' }
export const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function rotuloOrigem(o) {
  if (!o) return ''
  if (o.startsWith('agenda:')) return `Agenda · ${o.slice(7)}`
  if (o.startsWith('cena:')) return `Cena · ${o.slice(5)}`
  if (o.startsWith('automacao:')) return `Automação · ${o.slice(10)}`
  return { painel: 'Painel', alexa: 'Alexa', sistema: 'Sistema', agente: 'Agente do Mac', sinric: 'Alexa/Google', automacao: 'Automação', cena: 'Cena', agenda: 'Agenda', tuya: 'Nuvem Tuya', musica: 'Música', controle: 'Controle remoto' }[o] || o
}

// Só caminhos internos ("/algo"): bloqueia "//site", "/\site" e URLs completas (GHSA-wrjc-x8rr-h8h6 no React Router 6)
export function rotaSegura(caminho, padrao = '/') {
  if (typeof caminho !== 'string' || !caminho.startsWith('/') || caminho.startsWith('//') || caminho.includes('\\') || /^\/[a-z][\w+.-]*:/i.test(caminho)) return padrao
  return caminho
}

// Senha vazada? Have I Been Pwned por k-anonimato: só os 5 primeiros caracteres do SHA-1 saem do navegador.
export async function senhaVazada(senha) {
  try {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(senha))
    const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
    const r = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { 'Add-Padding': 'true' } })
    if (!r.ok) return 0
    const linha = (await r.text()).split('\n').find((l) => l.startsWith(hex.slice(5)))
    return linha ? Number(linha.split(':')[1]) || 0 : 0
  } catch { return 0 }   // sem internet ou serviço fora: não trava a troca de senha
}

// Regra de senha forte (igual à do Supabase Auth): 10+ caracteres com minúscula, maiúscula, número e símbolo
export function problemaSenha(s) {
  if ((s || '').length < 10) return 'Use pelo menos 10 caracteres.'
  if (!/[a-z]/.test(s) || !/[A-Z]/.test(s) || !/\d/.test(s) || !/[^A-Za-z0-9]/.test(s)) return 'Misture letra minúscula, maiúscula, número e símbolo.'
  return ''
}

export async function validarSenhaNova(s) {
  const p = problemaSenha(s)
  if (p) throw new Error(p)
  const n = await senhaVazada(s)
  if (n) throw new Error(`Essa senha já apareceu em ${n.toLocaleString('pt-BR')} vazamentos de dados. Escolha outra.`)
}
