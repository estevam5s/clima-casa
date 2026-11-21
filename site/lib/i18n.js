// Tradução do site no navegador (inglês, espanhol, francês, russo e coreano).
//
// O site é escrito em português. Com outro idioma escolhido, este motor troca os textos da página pelo dicionário que o
// sistema publica em /api/site/idiomas/{idioma} (traduzido pela IA e revisado no painel, tela Idiomas do site):
// - texto simples: cada nó de texto vira a tradução da frase inteira;
// - frase com trechos destacados ("Somos o <span>Clima Escritório</span>: …") vira uma chave com marcadores
//   ("Somos o <1>Clima Escritório</1>: …"), para a tradução poder mudar a ordem das palavras sem perder o destaque;
// - títulos animados letra a letra (.text-anm, .split) são traduzidos inteiros;
// - placeholder, aria-label, title e alt também; o título da aba idem.
// Um observador acompanha o que o React muda depois (navegação, mensagens de formulário) e traduz na hora.
// O que não tem tradução é avisado ao sistema (entra como "visto no navegador" e só vale depois de aprovado no painel).
import { SISTEMA_URL } from './dados'

export const IDIOMAS = [
  { codigo: 'pt', nome: 'Português', html: 'pt-BR' },
  { codigo: 'en', nome: 'English', html: 'en' },
  { codigo: 'es', nome: 'Español', html: 'es' },
  { codigo: 'fr', nome: 'Français', html: 'fr' },
  { codigo: 'ru', nome: 'Русский', html: 'ru' },
  { codigo: 'ko', nome: '한국어', html: 'ko' },
]
export const CHAVE_IDIOMA = 'zynio-idioma'
const CODIGOS = IDIOMAS.map((i) => i.codigo)
const IGNORAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO', 'TEMPLATE'])
const INLINE = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'A', 'SMALL', 'MARK', 'U', 'SUB', 'SUP', 'ABBR'])
const ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt']
const INTEIROS = '.text-anm, .split'

export const normalizar = (s) => String(s || '').replace(/\s+/g, ' ').trim()
const temLetra = (s) => /[A-Za-zÀ-ÿ]/.test(s)
const semMarcas = (s) => s.replace(/<\/?\d+>/g, '')

// ---------------- idioma escolhido ----------------
export function idiomaSalvo() {
  try {
    const p = new URLSearchParams(window.location.search).get('lang')
    if (p && CODIGOS.includes(p)) { localStorage.setItem(CHAVE_IDIOMA, p); return p }
    const s = localStorage.getItem(CHAVE_IDIOMA)
    if (s && CODIGOS.includes(s)) return s
    const nav = (navigator.language || '').slice(0, 2).toLowerCase()
    return CODIGOS.includes(nav) && nav !== 'pt' ? nav : 'pt'
  } catch { return 'pt' }
}

// ---------------- motor ----------------
const estado = {
  idioma: 'pt', dic: {}, ativo: false, obs: null,
  textos: new WeakMap(),     // nó de texto → { pt, posto }
  blocos: new WeakMap(),     // elemento → { partes: [{ tipo, k, no, pt }], posto }
  noBloco: new WeakMap(),    // nó de texto → elemento do bloco
  inteiros: new WeakMap(),   // elemento .text-anm → { pt, posto }
  attrs: new WeakMap(),      // elemento → { attr: { pt, posto } }
  faltando: new Set(), avisados: new Set(), timer: 0, titulo: null,
}

const escrever = (no, v) => { if (no.nodeValue !== v) no.nodeValue = v }   // só escreve se mudou (escrever igual também dispara o observador)

function traduzir(chave) {
  if (estado.idioma === 'pt') return null
  const t = estado.dic[chave]
  if (t) return t
  if (temLetra(semMarcas(chave)) && chave.length > 1 && !estado.avisados.has(chave)) {
    estado.faltando.add(chave)
    clearTimeout(estado.timer)
    estado.timer = setTimeout(avisarFaltando, 5000)
  }
  return null
}

function avisarFaltando() {
  const lista = [...estado.faltando].slice(0, 40)
  lista.forEach((t) => { estado.faltando.delete(t); estado.avisados.add(t) })
  if (!lista.length || estado.idioma === 'pt') return
  try {
    fetch(`${SISTEMA_URL}/api/site/idiomas/faltando`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ idioma: estado.idioma, rota: window.location.pathname, textos: lista }) }).catch(() => {})
  } catch { /* sem rede */ }
  if (estado.faltando.size) estado.timer = setTimeout(avisarFaltando, 5000)
}

function comEspacos(original, novo) {
  const ini = original.match(/^\s*/)[0], fim = original.match(/\s*$/)[0]
  return ini + novo + fim
}

// frase com trechos destacados: chave com marcadores <1>…</1>
function lerBloco(el) {
  if (el.closest('[translate="no"],[data-sem-traducao]')) return null
  const partes = []
  let k = 0, temElemento = false
  for (const n of el.childNodes) {
    if (n.nodeType === 8) continue
    if (n.nodeType === 3) { partes.push({ tipo: 't', no: n }); continue }
    if (n.nodeType !== 1) return null
    if (n.tagName === 'BR') return null
    if (!INLINE.has(n.tagName) || n.hasAttribute('translate') || n.childNodes.length !== 1 || n.firstChild.nodeType !== 3) return null
    temElemento = true
    k += 1
    partes.push({ tipo: 'e', k, no: n.firstChild })
  }
  if (!temElemento || !partes.some((p) => p.tipo === 't' && normalizar(p.no.nodeValue))) return null
  return partes
}

function chaveDoBloco(partes, campo = 'pt') {
  return normalizar(partes.map((p) => (p.tipo === 't' ? p[campo] : `<${p.k}>${p[campo]}</${p.k}>`)).join(''))
}

function aplicarBloco(el, b) {
  const chave = chaveDoBloco(b.partes)
  const t = traduzir(chave)
  if (!t) { b.partes.forEach((p) => escrever(p.no, p.pt)); b.posto = null; return }
  // segmentos da tradução: texto solto e <k>…</k>
  const segs = []
  const re = /<(\d+)>([\s\S]*?)<\/\1>/g
  let i = 0, m
  while ((m = re.exec(t))) { if (m.index > i) segs.push({ texto: t.slice(i, m.index) }); segs.push({ k: +m[1], texto: m[2] }); i = re.lastIndex }
  if (i < t.length) segs.push({ texto: t.slice(i) })
  const ordemOk = segs.filter((s) => s.k).map((s) => s.k).join() === b.partes.filter((p) => p.tipo === 'e').map((p) => p.k).join()
  if (!ordemOk) {   // a tradução mudou os destaques de lugar: tudo no primeiro texto, sem o destaque
    const primeiro = b.partes.find((p) => p.tipo === 't')
    b.partes.forEach((p) => escrever(p.no, p === primeiro ? comEspacos(p.pt, semMarcas(t)) : ''))
  } else {
    let s = 0
    for (const p of b.partes) {
      if (p.tipo === 'e') { const seg = segs.find((x) => x.k === p.k); escrever(p.no, seg ? seg.texto : p.pt); s = segs.indexOf(seg) + 1; continue }
      if (segs[s] && !segs[s].k) { escrever(p.no, segs[s].texto); s += 1 } else escrever(p.no, '')
    }
    const resto = segs.slice(s).filter((x) => !x.k).map((x) => x.texto).join('')
    if (resto) { const ult = [...b.partes].reverse().find((p) => p.tipo === 't') || b.partes[b.partes.length - 1]; escrever(ult.no, ult.no.nodeValue + resto) }
  }
  b.posto = b.partes.map((p) => p.no.nodeValue)
}

function visitarTexto(n) {
  const v = n.nodeValue
  let r = estado.textos.get(n)
  if (!r) { r = { pt: v, posto: null }; estado.textos.set(n, r) } else if (v !== r.posto) r.pt = v   // o React trocou o texto
  const chave = normalizar(r.pt)
  if (!chave || !temLetra(chave)) return
  const t = traduzir(chave)
  const novo = t ? comEspacos(r.pt, t) : r.pt
  escrever(n, novo)
  r.posto = t ? novo : null
}

function visitarAtributos(el) {
  for (const a of ATRIBUTOS) {
    if (!el.hasAttribute(a)) continue
    let m = estado.attrs.get(el)
    if (!m) { m = {}; estado.attrs.set(el, m) }
    const v = el.getAttribute(a)
    if (!m[a]) m[a] = { pt: v, posto: null }
    else if (v !== m[a].posto) m[a].pt = v
    const chave = normalizar(m[a].pt)
    if (!chave || !temLetra(chave)) continue
    const t = traduzir(chave)
    const novo = t || m[a].pt
    if (v !== novo) el.setAttribute(a, novo)
    m[a].posto = t ? novo : null
  }
}

function visitarInteiro(el) {
  let r = estado.inteiros.get(el)
  if (!r) { r = { pt: normalizar(el.textContent), posto: null }; estado.inteiros.set(el, r) }
  const t = traduzir(r.pt)
  if (t && el.textContent !== t) { el.textContent = t; r.posto = t } else if (!t && r.posto) { el.textContent = r.pt; r.posto = null }
}

function visitar(raiz) {
  if (!raiz) return
  if (raiz.nodeType === 3) { const pai = raiz.parentElement; if (pai && !pai.closest('[translate="no"],[data-sem-traducao]')) { const b = estado.noBloco.get(raiz); if (b) visitarBloco(b); else if (!pai.closest(INTEIROS) && !IGNORAR.has(pai.tagName)) visitarTexto(raiz) } return }
  if (raiz.nodeType !== 1 || IGNORAR.has(raiz.tagName) || raiz.getAttribute('translate') === 'no' || raiz.hasAttribute('data-sem-traducao')) return
  visitarAtributos(raiz)
  if (raiz.matches(INTEIROS)) { visitarInteiro(raiz); return }
  const partes = lerBloco(raiz)
  if (partes) {
    let b = estado.blocos.get(raiz)
    if (!b) {
      b = { partes: partes.map((p) => ({ ...p, pt: p.no.nodeValue })), posto: null }
      estado.blocos.set(raiz, b)
      b.partes.forEach((p) => estado.noBloco.set(p.no, raiz))
    }
    visitarBloco(raiz)
    raiz.querySelectorAll('*').forEach(visitarAtributos)
    return
  }
  for (const f of [...raiz.childNodes]) visitar(f)
}

function visitarBloco(el) {
  const b = estado.blocos.get(el)
  if (!b) return
  b.partes.forEach((p, i) => { const esperado = b.posto ? b.posto[i] : p.pt; if (p.no.nodeValue !== esperado) p.pt = p.no.nodeValue })   // o React trocou: vira o novo original
  aplicarBloco(el, b)
}

function traduzirTitulo() {
  const atual = document.title
  if (!estado.titulo || (atual !== estado.titulo.posto)) estado.titulo = { pt: atual, posto: null }
  const t = estado.idioma === 'pt' ? null : estado.dic[normalizar(estado.titulo.pt)]
  if (t) { if (document.title !== t) document.title = t; estado.titulo.posto = t } else if (estado.titulo.posto) { estado.titulo.posto = null; if (document.title !== estado.titulo.pt) document.title = estado.titulo.pt }
}

function observar() {
  if (estado.obs) return
  estado.obs = new MutationObserver((lista) => {
    for (const m of lista) {
      if (m.type === 'childList') m.addedNodes.forEach(visitar)
      else if (m.type === 'characterData') visitar(m.target)
      else if (m.type === 'attributes' && m.target.nodeType === 1) visitarAtributos(m.target)
    }
    traduzirTitulo()
  })
  estado.obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS })
  const t = document.querySelector('head > title')
  if (t) estado.obs.observe(t, { childList: true, characterData: true, subtree: true })
}

async function carregarDicionario(idioma) {
  const chave = `zynio-i18n-${idioma}`
  let guardado = null
  try { guardado = JSON.parse(localStorage.getItem(chave) || 'null') } catch { /* sem armazenamento */ }
  const buscar = fetch(`${SISTEMA_URL}/api/site/idiomas/${idioma}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (j?.textos) { try { localStorage.setItem(chave, JSON.stringify({ versao: j.versao, textos: j.textos, ativos: j.ativos })) } catch { /* cheio */ } }
    return j
  }).catch(() => null)
  return { guardado, buscar }
}

let ouvintes = []
export function aoMudarIdioma(fn) { ouvintes.push(fn); return () => { ouvintes = ouvintes.filter((x) => x !== fn) } }
export function idiomaAtual() { return estado.idioma }

export async function trocarIdioma(idioma, { salvar = true } = {}) {
  if (!CODIGOS.includes(idioma)) idioma = 'pt'
  if (salvar) { try { localStorage.setItem(CHAVE_IDIOMA, idioma) } catch { /* sem armazenamento */ } }
  estado.idioma = idioma
  document.documentElement.lang = IDIOMAS.find((i) => i.codigo === idioma)?.html || 'pt-BR'
  ouvintes.forEach((f) => f(idioma))
  if (idioma === 'pt') {
    estado.dic = {}
    visitar(document.body); traduzirTitulo()
    document.documentElement.classList.remove('i18n-carregando')
    return
  }
  const { guardado, buscar } = await carregarDicionario(idioma)
  if (guardado?.textos && estado.idioma === idioma) { estado.dic = guardado.textos; aplicarTudo() }
  const novo = await buscar
  if (estado.idioma !== idioma) return
  if (novo?.textos && (!guardado || guardado.versao !== novo.versao)) { estado.dic = novo.textos; aplicarTudo() }
  else if (!guardado) aplicarTudo()
  if (novo?.ativos) ouvintes.forEach((f) => f(idioma, novo.ativos))
}

function aplicarTudo() {
  visitar(document.body)
  traduzirTitulo()
  observar()
  document.documentElement.classList.remove('i18n-carregando')
}

export function iniciarTraducao() {
  if (estado.ativo) return
  estado.ativo = true
  const idioma = idiomaSalvo()
  if (idioma === 'pt') { document.documentElement.classList.remove('i18n-carregando'); observar(); estado.idioma = 'pt'; return }
  trocarIdioma(idioma, { salvar: false })
}

// Para a publicação (scripts/extrair-textos.mjs): todas as chaves que a página tem agora, em português.
export function coletarChaves() {
  const chaves = new Set()
  const ir = (raiz) => {
    if (raiz.nodeType === 3) { const c = normalizar(raiz.nodeValue); if (c && temLetra(c)) chaves.add(c); return }
    if (raiz.nodeType !== 1 || IGNORAR.has(raiz.tagName) || raiz.getAttribute('translate') === 'no' || raiz.hasAttribute('data-sem-traducao')) return
    for (const a of ATRIBUTOS) { const v = normalizar(raiz.getAttribute(a)); if (v && temLetra(v)) chaves.add(v) }
    if (raiz.matches(INTEIROS)) { const c = normalizar(raiz.textContent); if (c) chaves.add(c); return }
    const partes = lerBloco(raiz)
    if (partes) { chaves.add(chaveDoBloco(partes.map((p) => ({ ...p, pt: p.no.nodeValue })))); raiz.querySelectorAll('*').forEach((e) => ATRIBUTOS.forEach((a) => { const v = normalizar(e.getAttribute(a)); if (v && temLetra(v)) chaves.add(v) })); return }
    for (const f of raiz.childNodes) ir(f)
  }
  ir(document.body)
  const t = normalizar(document.title)
  if (t) chaves.add(t)
  return [...chaves]
}
