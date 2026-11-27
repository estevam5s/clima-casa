// Tradução do painel no navegador (o original é em português). Troca os textos visíveis e os atributos placeholder, title
// e aria-label, acompanha o que o React muda (MutationObserver) e manda ao servidor, em lotes, o que ainda não tem tradução:
// a IA traduz na hora e guarda (backend/app/idiomas.py, escopo "painel"). Revisão à mão em Idiomas → Painel.
// Não mexe em: campos de texto, código, nada com translate="no" ou .notranslate. Números viram {0}, {1}… antes de procurar,
// então "4/9 ligados" e "5/9 ligados" são o mesmo texto no dicionário. A tradução entra sempre como texto, nunca como HTML.
import { api } from './api'

export const IDIOMAS_PAINEL = [['pt', 'Português'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['ru', 'Русский'], ['ko', '한국어']]
const CHAVE = 'clima-idioma-painel'
const ATRS = ['placeholder', 'title', 'aria-label']
const PULAR = 'script,style,code,pre,kbd,textarea,input,select,svg,[translate="no"],.notranslate,[contenteditable="true"],[data-sem-traducao]'

let idioma = 'pt'
let dic = {}
let obs = null
let fila = new Set()
let quadro = 0
const faltando = new Set()
const pedindo = new Set()
let envio = 0
let espera = 0
const ouvintes = new Set()
const orig = new WeakMap()        // nó de texto -> { pt, tr }
const origAtr = new WeakMap()     // elemento -> { [atributo]: { pt, tr } }

const ler = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const gravar = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }
const logado = () => { try { return !!JSON.parse(ler('clima-casa-auth') || 'null')?.access_token } catch { return false } }

export const idiomaAtual = () => idioma
export function aoMudarIdioma(f) { ouvintes.add(f); return () => ouvintes.delete(f) }
const avisar = () => ouvintes.forEach((f) => { try { f(idioma) } catch { /* ignora */ } })

const normalizar = (t) => t.replace(/\s+/g, ' ').trim()
const util = (t) => t.length > 1 && t.length <= 600 && /[A-Za-zÀ-ÿ]{2}/.test(t) && !/^\S+@\S+\.\S+$|^https?:\/\//.test(t)

function molde(t) {
  const nums = []
  const chave = t.replace(/\d+(?:[.,:/]\d+)*/g, (m) => `{${nums.push(m) - 1}}`)
  return { chave, nums }
}
const aplicar = (tr, nums) => tr.replace(/\{(\d+)\}/g, (m, i) => (nums[+i] ?? m))

function traduzir(texto) {
  const core = normalizar(texto)
  if (!util(core)) return null
  const { chave, nums } = molde(core)
  const tr = dic[chave]
  if (tr == null) { if (!pedindo.has(chave)) faltando.add(chave); return null }
  const ini = texto.match(/^\s*/)[0], fim = texto.match(/\s*$/)[0]
  return ini + aplicar(tr, nums) + fim
}

function noTexto(n) {
  const el = n.parentElement
  if (!el || el.closest(PULAR)) return
  const atual = n.nodeValue
  const reg = orig.get(n)
  const pt = reg && atual === reg.tr ? reg.pt : atual   // se não é o que a gente pôs, o React trocou: é o original novo
  if (idioma === 'pt') { if (reg && atual === reg.tr && atual !== reg.pt) n.nodeValue = reg.pt; orig.delete(n); return }
  const novo = traduzir(pt)
  const final = novo ?? pt
  orig.set(n, { pt, tr: final })
  if (final !== atual) n.nodeValue = final
}

function noElemento(el) {
  if (el.closest(PULAR) && !el.matches('input,textarea')) return   // placeholder de campo vale traduzir
  if (el.closest('[translate="no"],.notranslate,[data-sem-traducao]')) return
  for (const a of ATRS) {
    if (!el.hasAttribute(a)) continue
    const atual = el.getAttribute(a)
    const regs = origAtr.get(el) || {}
    const reg = regs[a]
    const pt = reg && atual === reg.tr ? reg.pt : atual
    const final = idioma === 'pt' ? pt : (traduzir(pt) ?? pt)
    regs[a] = { pt, tr: final }
    origAtr.set(el, regs)
    if (final !== atual) el.setAttribute(a, final)
  }
}

function varrer(raiz) {
  if (!raiz) return
  if (raiz.nodeType === 3) { noTexto(raiz); return }
  if (raiz.nodeType !== 1) return
  noElemento(raiz)
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n = w.nextNode()
  while (n) { if (n.nodeType === 3) noTexto(n); else noElemento(n); n = w.nextNode() }
}

function processar() {
  quadro = 0
  const nos = [...fila]
  fila = new Set()
  for (const n of nos) if (n.isConnected) varrer(n)
  pedirFaltando()
}
function agendar(n) { fila.add(n); if (!quadro) quadro = requestAnimationFrame(processar) }

let emVoo = 0
function pedirFaltando() {
  if (idioma === 'pt' || !faltando.size || !logado()) return
  clearTimeout(envio)
  envio = setTimeout(enviarLote, 500)
}

async function enviarLote() {
  if (idioma === 'pt' || !faltando.size || emVoo >= 2) return
  if (Date.now() < espera) { setTimeout(enviarLote, espera - Date.now()); return }
  const lote = [...faltando].slice(0, 80)
  lote.forEach((t) => { faltando.delete(t); pedindo.add(t) })
  const alvo = idioma
  emVoo++
  if (faltando.size) enviarLote()   // até 2 lotes ao mesmo tempo
  try {
    const r = await api.post(`/api/painel-idiomas/${alvo}/traduzir`, { textos: lote, rota: location.pathname.slice(0, 120) })
    if (alvo !== idioma) return
    Object.assign(dic, r.textos || {})
    gravar(`clima-i18n-painel:${alvo}`, JSON.stringify({ em: Date.now(), textos: dic }))
    varrer(document.body)
  } catch (e) {
    espera = Date.now() + (e?.status === 429 ? 60000 : 20000)   // sem IA configurada ou limite: tenta de novo mais tarde
    lote.forEach((t) => faltando.add(t))
  } finally {
    emVoo--
    lote.forEach((t) => pedindo.delete(t))
    if (faltando.size) pedirFaltando()
  }
}

function observar() {
  if (obs) return
  obs = new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') agendar(m.target)
      else if (m.type === 'attributes') agendar(m.target)
      else m.addedNodes.forEach((n) => agendar(n))
    }
  })
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRS })
}

async function carregarDicionario(alvo) {
  try { const c = JSON.parse(ler(`clima-i18n-painel:${alvo}`) || 'null'); if (c?.textos) dic = { ...c.textos } } catch { dic = {} }
  if (!logado()) return
  try {
    const r = await api.get(`/api/painel-idiomas/${alvo}`)
    if (alvo !== idioma) return
    dic = { ...dic, ...(r.textos || {}) }
    gravar(`clima-i18n-painel:${alvo}`, JSON.stringify({ em: Date.now(), textos: dic }))
  } catch { /* fica com a cópia do navegador */ }
}

export async function mudarIdioma(novo) {
  if (!IDIOMAS_PAINEL.some(([c]) => c === novo)) novo = 'pt'
  idioma = novo
  gravar(CHAVE, novo)
  document.documentElement.lang = novo === 'pt' ? 'pt-BR' : novo
  faltando.clear()
  if (novo === 'pt') {
    varrer(document.body)            // devolve os originais
    obs?.disconnect(); obs = null
    dic = {}
    avisar()
    return
  }
  dic = {}
  await carregarDicionario(novo)
  if (idioma !== novo) return
  varrer(document.body)
  observar()
  pedirFaltando()
  avisar()
}

export function iniciarTraducaoPainel() {
  const salvo = ler(CHAVE)
  if (salvo && salvo !== 'pt') mudarIdioma(salvo)
}
