// Processamento da textura no editor de aparência (tudo no navegador, sobre o ORIGINAL):
//   original → ajustes globais de cor (matiz, saturação, brilho, contraste, tingir) → operações em ordem
//   (recolorir região, traços de pincel). As operações ficam guardadas: dá para desfazer, reabrir e restaurar.
// Coordenadas: textura glTF com flipY = false, então uv (0,0) é o canto de cima à esquerda da imagem.

export const AJUSTES_PADRAO = {
  cor: { matiz: 0, saturacao: 1, brilho: 1, contraste: 1, tinta: '#ffffff', tintaForca: 0 },
  material: { aspereza: null, metal: null, emissao: '#000000', emissaoForca: 0, opacidade: 1, plano: false, aramado: false },
  forma: { escala: 1, largura: 1, altura: 1, profundidade: 1, giro: 0, espelhar: false },
  ops: [],
}

export function hexRgb(h) {
  const n = parseInt(String(h || '#000000').slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgbHex([r, g, b]) { return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('') }
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// matriz de matiz + saturação no espaço YIQ (rápida: 9 multiplicações por pixel)
function matrizCor(matizGraus, sat) {
  const a = (matizGraus * Math.PI) / 180, c = Math.cos(a) * sat, s = Math.sin(a) * sat
  const T = [[0.299, 0.587, 0.114], [0.596, -0.274, -0.322], [0.211, -0.523, 0.312]]
  const Ti = [[1, 0.956, 0.621], [1, -0.272, -0.647], [1, -1.106, 1.703]]
  const R = [[1, 0, 0], [0, c, -s], [0, s, c]]
  const mul = (A, B) => A.map((l) => B[0].map((_, j) => l.reduce((acc, v, k) => acc + v * B[k][j], 0)))
  return mul(Ti, mul(R, T))
}

export function ajustarCores(src, dst, cor) {
  const M = matrizCor(cor.matiz || 0, cor.saturacao ?? 1)
  const br = cor.brilho ?? 1, ct = cor.contraste ?? 1
  const [tr, tg, tb] = hexRgb(cor.tinta), tk = cor.tintaForca || 0, tl = Math.max(12, lum(tr, tg, tb))
  const neutro = !cor.matiz && (cor.saturacao ?? 1) === 1 && br === 1 && ct === 1 && !tk
  const s = src.data, d = dst.data
  if (neutro) { d.set(s); return }
  for (let i = 0; i < s.length; i += 4) {
    let r = s[i], g = s[i + 1], b = s[i + 2]
    let nr = M[0][0] * r + M[0][1] * g + M[0][2] * b
    let ng = M[1][0] * r + M[1][1] * g + M[1][2] * b
    let nb = M[2][0] * r + M[2][1] * g + M[2][2] * b
    nr = (nr * br - 128) * ct + 128; ng = (ng * br - 128) * ct + 128; nb = (nb * br - 128) * ct + 128
    if (tk) { const L = lum(nr, ng, nb) / tl; nr += (tr * L - nr) * tk; ng += (tg * L - ng) * tk; nb += (tb * L - nb) * tk }
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; d[i + 3] = s[i + 3]
  }
}

// recolorir: pixels parecidos com a cor escolhida viram a cor nova, mantendo luz e sombra (a variação de luminância)
export function recolorir(img, op) {
  const { width: W, height: H, data: d } = img
  const [pr, pg, pb] = op.de, [nr, ng, nb] = hexRgb(op.para)
  const tol = Math.max(0.02, op.tol || 0.18) * 441.7, borda = tol * 0.7
  const lp = Math.max(10, lum(pr, pg, pb))
  const dist = (i) => Math.hypot(d[i] - pr, d[i + 1] - pg, d[i + 2] - pb)
  const pintar = (i, dd) => {
    const f = dd <= borda ? 1 : 1 - (dd - borda) / (tol - borda)
    const L = lum(d[i], d[i + 1], d[i + 2]) / lp
    d[i] += (Math.min(255, nr * L) - d[i]) * f; d[i + 1] += (Math.min(255, ng * L) - d[i + 1]) * f; d[i + 2] += (Math.min(255, nb * L) - d[i + 2]) * f
  }
  if (!op.conectado) {
    for (let i = 0; i < d.length; i += 4) { const dd = dist(i); if (dd < tol) pintar(i, dd) }
    return
  }
  // só a região ligada ao ponto clicado (preenchimento por inundação em 4 direções)
  const x0 = Math.min(W - 1, Math.max(0, Math.floor(op.u * W))), y0 = Math.min(H - 1, Math.max(0, Math.floor(op.v * H)))
  const visto = new Uint8Array(W * H), fila = new Int32Array(W * H)
  let ini = 0, fim = 0
  fila[fim++] = y0 * W + x0; visto[y0 * W + x0] = 1
  const alvos = []
  while (ini < fim) {
    const p = fila[ini++], i = p * 4, dd = dist(i)
    if (dd >= tol) continue
    alvos.push(p, dd)
    const x = p % W, y = (p / W) | 0
    if (x > 0 && !visto[p - 1]) { visto[p - 1] = 1; fila[fim++] = p - 1 }
    if (x < W - 1 && !visto[p + 1]) { visto[p + 1] = 1; fila[fim++] = p + 1 }
    if (y > 0 && !visto[p - W]) { visto[p - W] = 1; fila[fim++] = p - W }
    if (y < H - 1 && !visto[p + W]) { visto[p + W] = 1; fila[fim++] = p + W }
  }
  for (let k = 0; k < alvos.length; k += 2) pintar(alvos[k] * 4, alvos[k + 1])
}

// um ponto do pincel (gradiente radial: dureza 1 = borda seca, 0 = macia)
export function pincelada(ctx, W, H, u, v, op) {
  const x = u * W, y = v * H, r = Math.max(1, op.raio * W)
  const [cr, cg, cb] = hexRgb(op.cor)
  const g = ctx.createRadialGradient(x, y, r * Math.min(0.98, op.dureza ?? 0.6), x, y, r)
  g.addColorStop(0, `rgba(${cr},${cg},${cb},${op.opac ?? 1})`); g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}

export function traco(ctx, W, H, op) {
  const pts = op.pts || []
  for (let i = 0; i < pts.length; i++) {
    pincelada(ctx, W, H, pts[i][0], pts[i][1], op)
    if (i) {   // preenche entre dois pontos para o traço não sair pontilhado
      const [u0, v0] = pts[i - 1], [u1, v1] = pts[i], passos = Math.ceil(Math.hypot((u1 - u0) * W, (v1 - v0) * H) / Math.max(1, op.raio * W * 0.35))
      if (passos < 60) for (let k = 1; k < passos; k++) pincelada(ctx, W, H, u0 + ((u1 - u0) * k) / passos, v0 + ((v1 - v0) * k) / passos, op)
    }
  }
}

// reconstrói a textura inteira a partir do original
export function reconstruir(base, canvas, ajustes) {
  const W = base.width, H = base.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const saida = ctx.createImageData(W, H)
  ajustarCores(base, saida, ajustes.cor)
  ctx.putImageData(saida, 0, 0)
  for (const op of ajustes.ops || []) aplicarOp(ctx, W, H, op)
}

export function aplicarOp(ctx, W, H, op) {
  if (op.tipo === 'traco') traco(ctx, W, H, op)
  else if (op.tipo === 'recolorir') { const img = ctx.getImageData(0, 0, W, H); recolorir(img, op); ctx.putImageData(img, 0, 0) }
}

export function corNoPonto(canvas, u, v) {
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(u * canvas.width))), y = Math.min(canvas.height - 1, Math.max(0, Math.floor(v * canvas.height)))
  const p = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data
  return [p[0], p[1], p[2]]
}
