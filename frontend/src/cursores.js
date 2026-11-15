// Modelos de ponteiro: desenhados em canvas no tamanho escolhido e aplicados com CSS `cursor: url(...)`.
// Cada modelo tem a versão normal e a de "clicável" (links e botões). Os enviados pelo usuário usam a mesma imagem nos dois.
const SETA = 'M2 2 L2 25.5 L8.2 19.6 L12.6 29 L16.9 27.1 L12.6 17.9 L21.2 17.9 Z'
const MAO = 'M11 3.2c1.4 0 2.3 1 2.3 2.4v8.2c.4-.6 1.1-1 1.9-1 1.3 0 2.2.9 2.2 2.2v.7c.4-.5 1-.8 1.8-.8 1.2 0 2.1.9 2.1 2.2v1c.4-.4 1-.6 1.6-.6 1.2 0 2.1 1 2.1 2.3v5.3c0 3.8-2.9 6.6-6.8 6.6h-2.3c-2.2 0-3.8-.8-5.2-2.6l-4.4-5.6c-.8-1-.6-2.3.4-3 .9-.6 2.1-.4 2.8.4l1.2 1.4V5.6c0-1.4.9-2.4 2.4-2.4z'

function corResolvida(cor) {
  if (cor !== 'marca' && cor !== 'contraste') return cor
  const v = getComputedStyle(document.documentElement).getPropertyValue(cor === 'marca' ? '--primary' : '--foreground').trim()
  if (!v) return cor === 'marca' ? '#0f766a' : '#111111'
  const [h, s, l] = v.split(/\s+/)
  return `hsl(${h}, ${s}, ${l})`
}

function tela(tam) {
  const c = document.createElement('canvas'); c.width = c.height = tam
  const g = c.getContext('2d'); g.scale(tam / 32, tam / 32)
  return [c, g]
}

// desenhos: (g, cor, clicavel) → [hotspotX, hotspotY] em unidades de 32
export const MODELOS = {
  seta: { nome: 'Seta moderna', desenhar(g, cor, clic) {
    const p = new Path2D(clic ? MAO : SETA)
    g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = '#ffffff'; g.fillStyle = cor
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 2.5; g.shadowOffsetY = 1
    g.stroke(p); g.shadowColor = 'transparent'; g.fill(p)
    return clic ? [11, 3] : [2, 2]
  } },
  neon: { nome: 'Neon', desenhar(g, cor, clic) {
    const p = new Path2D(clic ? MAO : SETA)
    g.lineJoin = 'round'; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(p)
    g.strokeStyle = cor; g.lineWidth = 1.8; g.shadowColor = cor; g.shadowBlur = 6
    g.stroke(p); g.stroke(p)
    return clic ? [11, 3] : [2, 2]
  } },
  vazado: { nome: 'Contorno', desenhar(g, cor, clic) {
    const p = new Path2D(clic ? MAO : SETA)
    g.lineJoin = 'round'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.fill(p)
    g.strokeStyle = cor; g.lineWidth = 2; g.stroke(p)
    return clic ? [11, 3] : [2, 2]
  } },
  mira: { nome: 'Mira', desenhar(g, cor, clic) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 3.4; g.lineCap = 'round'
    const linhas = () => { g.beginPath(); g.arc(16, 16, clic ? 9 : 7, 0, Math.PI * 2); g.moveTo(16, 2); g.lineTo(16, 9); g.moveTo(16, 23); g.lineTo(16, 30); g.moveTo(2, 16); g.lineTo(9, 16); g.moveTo(23, 16); g.lineTo(30, 16) }
    linhas(); g.stroke(); g.strokeStyle = cor; g.lineWidth = 1.6; linhas(); g.stroke()
    g.fillStyle = cor; g.beginPath(); g.arc(16, 16, 1.6, 0, Math.PI * 2); g.fill()
    return [16, 16]
  } },
  ponto: { nome: 'Ponto', desenhar(g, cor, clic) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(16, 16, clic ? 9 : 6.5, 0, Math.PI * 2); g.fill()
    g.fillStyle = cor; g.beginPath(); g.arc(16, 16, clic ? 7.5 : 5, 0, Math.PI * 2); g.fill()
    return [16, 16]
  } },
  triangulo: { nome: 'Triângulo', desenhar(g, cor, clic) {
    const p = new Path2D('M3 3 L28 12 L16.5 16.5 L12 28 Z')
    g.lineJoin = 'round'; g.lineWidth = 2.2; g.strokeStyle = '#ffffff'; g.stroke(p); g.fillStyle = cor; g.fill(p)
    if (clic) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(13.5, 13.5, 2.4, 0, Math.PI * 2); g.fill() }
    return [3, 3]
  } },
  pixel: { nome: 'Pixel retrô', desenhar(g, cor) {
    // seta em grade 12×19 (estilo dos primeiros sistemas gráficos), contorno preto e miolo na cor
    const mapa = ['X', 'XX', 'XoX', 'XooX', 'XoooX', 'XooooX', 'XoooooX', 'XooooooX', 'XoooooooX', 'XooooooooX', 'XoooooXXXXX', 'XooXooX', 'XoX XooX', 'XX  XooX', 'X    XooX', '     XooX', '      XX']
    const u = 1.7
    mapa.forEach((linha, y) => [...linha].forEach((ch, x) => { if (ch === ' ') return; g.fillStyle = ch === 'X' ? '#111111' : cor; g.fillRect(1 + x * u, 1 + y * u, u, u) }))
    return [1, 1]
  } },
}

// gera o CSS `cursor:` de um modelo embutido no tamanho pedido
export function cursorEmbutido(chave, tamanho, cor) {
  const m = MODELOS[chave]
  if (!m) return null
  const tam = Math.max(16, Math.min(128, Math.round(tamanho)))
  const corOk = corResolvida(cor)
  const gerar = (clic) => {
    const [c, g] = tela(tam)
    const [hx, hy] = m.desenhar(g, corOk, clic)
    return `url(${c.toDataURL('image/png')}) ${Math.round(hx * tam / 32)} ${Math.round(hy * tam / 32)}`
  }
  return { normal: gerar(false), clicavel: gerar(true) }
}

// imagem enviada → PNG quadrado no tamanho pedido (os .cur/.ico vão como estão)
export async function cursorDeImagem(item, tamanho) {
  if (/^data:image\/(x-icon|vnd\.microsoft\.icon)|^data:application\/octet-stream/.test(item.url)) return { normal: `url(${item.url}) 0 0`, clicavel: `url(${item.url}) 0 0` }
  const tam = Math.max(16, Math.min(128, Math.round(tamanho)))
  const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = item.url })
  const [c, g] = tela(tam)
  g.setTransform(1, 0, 0, 1, 0, 0)
  const k = Math.min(tam / img.width, tam / img.height)
  const w = img.width * k, h = img.height * k
  g.drawImage(img, item.ponta === 'centro' ? (tam - w) / 2 : 0, item.ponta === 'centro' ? (tam - h) / 2 : 0, w, h)
  const hs = item.ponta === 'centro' ? `${Math.round(tam / 2)} ${Math.round(tam / 2)}` : '0 0'
  const css = `url(${c.toDataURL('image/png')}) ${hs}`
  return { normal: css, clicavel: css }
}

// arquivo do usuário → item salvo (data URL). Aceita PNG, SVG, WEBP, GIF, JPG, CUR e ICO até 200 KB.
export function lerArquivoCursor(arquivo) {
  return new Promise((ok, erro) => {
    const tipo = arquivo.type || (/\.cur$/i.test(arquivo.name) ? 'application/octet-stream' : /\.ico$/i.test(arquivo.name) ? 'image/x-icon' : '')
    if (!/^image\/(png|svg\+xml|webp|gif|jpeg|x-icon|vnd\.microsoft\.icon)$|^application\/octet-stream$/.test(tipo)) return erro(new Error('Use PNG, SVG, WEBP, GIF, JPG, CUR ou ICO.'))
    if (arquivo.size > 200_000) return erro(new Error('Arquivo grande demais (máximo de 200 KB).'))
    const r = new FileReader()
    r.onload = async () => {
      let url = String(r.result)
      if (tipo === 'image/svg+xml') {
        // SVG com script não entra (o navegador não roda script em cursor, mas a regra evita surpresa)
        const txt = atob(url.split(',')[1] || '').toLowerCase()
        if (/<script|onload|onerror|javascript:|<foreignobject/.test(txt)) return erro(new Error('SVG com script não é aceito.'))
      }
      if (tipo === 'application/octet-stream') url = url.replace(/^data:[^;]*;/, 'data:image/x-icon;')
      ok({ id: `c${Date.now().toString(36)}`, nome: arquivo.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Meu cursor', url, ponta: 'ponta' })
    }
    r.onerror = () => erro(new Error('Não foi possível ler o arquivo.'))
    r.readAsDataURL(arquivo)
  })
}
