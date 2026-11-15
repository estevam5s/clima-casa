// Ícone da aba com o número de notificações e título "(N) Clima Escritório".
let TITULO = 'Clima Escritório'
let NOME = 'Clima Escritório', CURTO = 'Clima', FORMATO = '{sistema}', PAGINA = ''
let original = null
let imagem = null
let ultimoTotal = 0

// formato do título vindo do white label: {sistema}, {curto} e {pagina}
function montarTitulo() {
  const t = (FORMATO || '{sistema}').replace(/\{sistema\}/g, NOME).replace(/\{curto\}/g, CURTO).replace(/\{pagina\}/g, PAGINA)
  return t.replace(/^\s*[·|\-–]\s*|\s*[·|\-–]\s*$/g, '').trim() || NOME
}
export function definirPagina(nome) { PAGINA = nome || ''; TITULO = montarTitulo(); atualizarAba(ultimoTotal) }
export function definirNomeAba(nome, img, formato, curto) {
  NOME = nome || NOME; CURTO = curto || CURTO; FORMATO = formato || FORMATO
  TITULO = montarTitulo()
  if (img) { const i = new Image(); i.onload = () => { imagem = i; atualizarAba(ultimoTotal) }; i.src = img } else imagem = null
  atualizarAba(ultimoTotal)
}

function desenhar(total) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (imagem) { g.drawImage(imagem, 0, 0, 64, 64) } else {
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary') ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().split(' ').join(', ')})` : '#0f766a'
  g.beginPath(); g.roundRect(0, 0, 64, 64, 16); g.fill()
  g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'
  for (const a of [90, 30, -30]) {
    const r = (a * Math.PI) / 180, dx = Math.cos(r) * 20, dy = Math.sin(r) * 20
    g.beginPath(); g.moveTo(32 - dx, 32 - dy); g.lineTo(32 + dx, 32 + dy); g.stroke()
  }
  }
  if (total > 0) {
    const txt = total > 99 ? '99+' : String(total)
    const w = Math.max(30, 14 + txt.length * 13)
    g.fillStyle = '#dc2626'
    g.beginPath(); g.roundRect(64 - w, 0, w, 30, 15); g.fill()
    g.fillStyle = '#fff'; g.font = 'bold 24px -apple-system, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(txt, 64 - w / 2, 16)
  }
  return c.toDataURL('image/png')
}

export function atualizarAba(total) {
  ultimoTotal = total
  document.title = total > 0 ? `(${total > 99 ? '99+' : total}) ${TITULO}` : TITULO
  let link = document.querySelector('link[rel="icon"]')
  if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
  if (original === null) original = link.href
  link.type = 'image/png'
  link.href = desenhar(total)
}
