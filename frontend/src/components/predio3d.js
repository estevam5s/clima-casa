import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// ---------------------------------------------------------------------------------------------------------------
// Física simples das pessoas: uma grade de 10 cm sobre o andar marca o que é ocupado (paredes, mesas, cadeiras,
// armários, folhas de porta), já engordado pelo raio do corpo. As rotas saem de um A* nessa grade (8 vizinhos, sem
// cortar quina) e são encurtadas por linha de visão. Assim ninguém atravessa parede nem mesa.
// ---------------------------------------------------------------------------------------------------------------
export function criarGrade(bx0, bz0, bx1, bz1, obstaculos, livre, R = 0.22, C = 0.1) {
  const nx = Math.ceil((bx1 - bx0) / C), nz = Math.ceil((bz1 - bz0) / C)
  const bloq = new Uint8Array(nx * nz)
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if (!livre(bx0 + (i + 0.5) * C, bz0 + (j + 0.5) * C)) bloq[j * nx + i] = 1
  for (const o of obstaculos) {
    const c = Math.cos(o.ry || 0), s = Math.sin(o.ry || 0)
    const hw = o.w / 2 + R, hd = o.d / 2 + R
    const ex = Math.abs(hw * c) + Math.abs(hd * s), ez = Math.abs(hw * s) + Math.abs(hd * c)
    const i0 = Math.max(0, Math.floor((o.x - ex - bx0) / C)), i1 = Math.min(nx - 1, Math.ceil((o.x + ex - bx0) / C))
    const j0 = Math.max(0, Math.floor((o.z - ez - bz0) / C)), j1 = Math.min(nz - 1, Math.ceil((o.z + ez - bz0) / C))
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = bx0 + (i + 0.5) * C - o.x, dz = bz0 + (j + 0.5) * C - o.z
      // mundo → local do retângulo (rotação em y)
      const lx = dx * c - dz * s, lz = dx * s + dz * c
      if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) bloq[j * nx + i] = 1
    }
  }
  return { nx, nz, C, bx0, bz0, bloq }
}

const celula = (G, x, z) => [Math.floor((x - G.bx0) / G.C), Math.floor((z - G.bz0) / G.C)]
export function celulaLivre(G, x, z) {
  const [i, j] = celula(G, x, z)
  return i >= 0 && j >= 0 && i < G.nx && j < G.nz && !G.bloq[j * G.nx + i]
}
export function livreProxima(G, x, z, raio = 12) {
  const [i0, j0] = celula(G, x, z)
  for (let r = 0; r <= raio; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
    const i = i0 + di, j = j0 + dj
    if (i >= 0 && j >= 0 && i < G.nx && j < G.nz && !G.bloq[j * G.nx + i]) return [i, j]
  }
  return null
}
export function visaoLivre(G, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (G.C * 0.5))
  for (let k = 1; k < n; k++) if (!celulaLivre(G, ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false
  return true
}

export function caminho(G, de, ate) {
  const { nx, nz, bloq, C, bx0, bz0 } = G
  const a = livreProxima(G, de[0], de[1]), b = livreProxima(G, ate[0], ate[1])
  if (!a || !b) return null
  const ini = a[1] * nx + a[0], fim = b[1] * nx + b[0]
  const N = nx * nz
  const g = new Float32Array(N).fill(Infinity), veio = new Int32Array(N).fill(-1), fechado = new Uint8Array(N)
  const heap = []   // [f, idx]
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p } }
  const pop = () => {
    const top = heap[0], ult = heap.pop()
    if (heap.length) { heap[0] = ult; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m } }
    return top
  }
  const h = (k) => { const dx = Math.abs((k % nx) - b[0]), dz = Math.abs(Math.floor(k / nx) - b[1]); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz) }
  g[ini] = 0; push(h(ini), ini)
  const viz = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]]
  let achou = false, passos = 0
  while (heap.length && passos++ < 60000) {
    const [, k] = pop()
    if (fechado[k]) continue
    if (k === fim) { achou = true; break }
    fechado[k] = 1
    const i = k % nx, j = Math.floor(k / nx)
    for (const [di, dj, custo] of viz) {
      const ii = i + di, jj = j + dj
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue
      const kk = jj * nx + ii
      if (bloq[kk] || fechado[kk]) continue
      if (di && dj && (bloq[j * nx + ii] || bloq[jj * nx + i])) continue   // não corta quina
      const ng = g[k] + custo
      if (ng < g[kk]) { g[kk] = ng; veio[kk] = k; push(ng + h(kk), kk) }
    }
  }
  if (!achou) return null
  const pts = []
  for (let k = fim; k !== -1; k = veio[k]) pts.push([bx0 + ((k % nx) + 0.5) * C, bz0 + (Math.floor(k / nx) + 0.5) * C])
  pts.reverse()
  // encurta: de cada ponto, pula para o mais distante que se vê em linha reta
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let j = pts.length - 1
    while (j > i + 1 && !visaoLivre(G, pts[i][0], pts[i][1], pts[j][0], pts[j][1])) j--
    out.push(pts[j]); i = j
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Prédio em volta do escritório, inspirado num prédio público de esquina: pódio de 2 andares branco com pilastras e
// faixa azul (com o nome da empresa), entrada em arco azul na fachada da porta, e uma torre de 12 andares por trás,
// com faixas brancas de sacada, vidro escuro, colunas azuis e condensadoras de ar. Em volta: calçada, duas ruas com
// faixa de pedestre, canteiro com palmeiras, postes, carros andando e prédios vizinhos.
// ---------------------------------------------------------------------------------------------------------------
function texturaJanelas(cols, linhas, base, vidro, acesas, semente) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256
  const g = cv.getContext('2d')
  let s = semente >>> 0
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  const cw = 256 / cols, ch = 256 / linhas
  const em = document.createElement('canvas'); em.width = em.height = 256
  const ge = em.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, 256, 256)
  for (let j = 0; j < linhas; j++) for (let i = 0; i < cols; i++) {
    const x = i * cw + cw * 0.12, y = j * ch + ch * 0.18, w = cw * 0.76, h = ch * 0.64
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, vidro[0]); gr.addColorStop(1, vidro[1])
    g.fillStyle = gr; g.fillRect(x, y, w, h)
    if (rnd() < acesas) { ge.fillStyle = rnd() > 0.3 ? '#ffe2a8' : '#cfe3ff'; ge.fillRect(x, y, w, h) }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  const te = new THREE.CanvasTexture(em); te.colorSpace = THREE.SRGBColorSpace; te.wrapS = te.wrapT = THREE.RepeatWrapping
  return [t, te]
}

function placa(texto) {
  const c = document.createElement('canvas'); const g = c.getContext('2d')
  g.font = '700 120px system-ui, -apple-system, sans-serif'
  const w = Math.min(2048, Math.ceil(g.measureText(texto).width) + 80)
  c.width = w; c.height = 170
  g.font = '700 120px system-ui, -apple-system, sans-serif'
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(texto, 40, 92, w - 80)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return { t, prop: w / 170 }
}

function palmeira(r, matTronco, matFolha) {
  const g = new THREE.Group()
  const alt = 5.5 + r() * 2.5, curva = (r() - 0.5) * 0.5
  let y = 0, x = 0
  for (let i = 0; i < 7; i++) {
    const h = alt / 7, raio = 0.17 - i * 0.012
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(raio - 0.01, raio, h, 8), matTronco)
    x += curva * (i / 7) * 0.25
    seg.position.set(x, y + h / 2, 0); seg.castShadow = true; g.add(seg); y += h
  }
  const copa = new THREE.Group(); copa.position.set(x, y, 0); g.add(copa)
  const nF = 10
  for (let i = 0; i < nF; i++) {
    const folha = new THREE.Group(); folha.rotation.y = (i / nF) * Math.PI * 2 + r() * 0.3; copa.add(folha)
    const comp = 2.2 + r() * 0.6
    const f = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), matFolha)
    f.scale.set(comp / 2, 0.04, 0.32); f.position.set(comp / 2, 0, 0); f.rotation.z = -0.35 - r() * 0.35; f.castShadow = true
    folha.add(f)
  }
  copa.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), matTronco))
  return { g, copa }
}

function carro(cor) {
  const g = new THREE.Group()
  const lata = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.25, metalness: 0.55 })
  const vidro = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.05, metalness: 0.8 })
  const pneu = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 })
  const corpo = new THREE.Mesh(new RoundedBoxGeometry(4.2, 0.62, 1.78, 3, 0.18), lata); corpo.position.y = 0.55; corpo.castShadow = true; g.add(corpo)
  const cab = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.55, 1.6, 3, 0.2), vidro); cab.position.set(-0.2, 1.08, 0); cab.castShadow = true; g.add(cab)
  const teto = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.08, 1.5, 2, 0.04), lata); teto.position.set(-0.25, 1.37, 0); g.add(teto)
  const rodas = []
  for (const [x, z] of [[1.35, 0.82], [1.35, -0.82], [-1.35, 0.82], [-1.35, -0.82]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 16), pneu); w.rotation.x = Math.PI / 2; w.position.set(x, 0.33, z); g.add(w); rodas.push(w)
  }
  const farol = new THREE.MeshStandardMaterial({ color: 0xfff7d6, emissive: 0xfff2c0, emissiveIntensity: 0.6 })
  const lanterna = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, emissive: 0xdc2626, emissiveIntensity: 0.5 })
  for (const z of [0.6, -0.6]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.34), farol); f.position.set(2.1, 0.68, z); g.add(f)
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.34), lanterna); l.position.set(-2.1, 0.68, z); g.add(l)
  }
  return { g, rodas }
}

// O escritório fica num andar da torre (padrão: 9º). O grupo inteiro desce para que esse andar fique na altura 0
// do mundo: aberto, os andares de cima sobem e somem, a fachada do andar some, e o resto do prédio fica embaixo.
export function montarPredio({ bx0: ox0, bx1: ox1, bz0: oz0, bz1: oz1, entrada, nome, noite, r, andar = 9 }) {
  const bx0 = ox0 - 5, bx1 = ox1 + 5, bz0 = oz0 - 3, bz1 = oz1 + 8   // pódio maior que a torre
  const grupo = new THREE.Group()
  const casca = new THREE.Group(); grupo.add(casca)     // o que fica: pódio, torre até o andar de baixo do escritório
  const andarG = new THREE.Group(); grupo.add(andarG)   // fachada do andar do escritório: some ao abrir
  const torre = new THREE.Group(); grupo.add(torre)     // andares de cima: sobem e somem ao abrir
  const entorno = new THREE.Group(); grupo.add(entorno) // ruas, calçada, palmeiras, carros, vizinhos
  const fade = []                                        // materiais que somem ao abrir
  const M = (o) => new THREE.MeshStandardMaterial(o)
  const F = (m) => { const c = m.clone(); c.transparent = true; c.userData.op0 = c.opacity; fade.push(c); return c }
  const matBranco = M({ color: 0xf5f5f4, roughness: 0.75 })
  const matAzul = M({ color: 0x1d4fb8, roughness: 0.5 })
  const matAzulEsc = M({ color: 0x173a87, roughness: 0.5 })
  const matBase = M({ color: 0x475569, roughness: 0.8 })
  const [texJ, texJE] = texturaJanelas(2, 2, '#1e293b', ['#24344d', '#0f172a'], noite ? 0.55 : 0, 11)
  const matVidroPodio = M({ color: 0xffffff, map: texJ, emissiveMap: texJE, emissive: 0xffffff, emissiveIntensity: noite ? 1 : 0, roughness: 0.18, metalness: 0.45 })
  const [texT, texTE] = texturaJanelas(10, 1, '#cbd5e1', ['#2b3d57', '#111827'], noite ? 0.45 : 0, 29)
  const matVidroTorre = M({ color: 0xffffff, map: texT, emissiveMap: texTE, emissive: 0xffffff, emissiveIntensity: noite ? 1 : 0, roughness: 0.2, metalness: 0.4 })
  const matCond = M({ color: 0xe5e7eb, roughness: 0.5 })
  const BW = bx1 - bx0, BD = bz1 - bz0, cxp = (bx0 + bx1) / 2, czp = (bz0 + bz1) / 2
  const HP = 7.4, ESPF = 0.3
  const alvos = []
  const caixa = (pai, w, h, d, m, x, y, z, sombra = true) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = sombra; o.receiveShadow = true; pai.add(o); alvos.push(o); return o
  }
  // lados do pódio: linha, eixo, normal para fora
  const LADOS = {
    norte: { horiz: true, k: bz0, n: -1, a: bx0, b: bx1 }, sul: { horiz: true, k: bz1, n: 1, a: bx0, b: bx1 },
    oeste: { horiz: false, k: bx0, n: -1, a: bz0, b: bz1 }, leste: { horiz: false, k: bx1, n: 1, a: bz0, b: bz1 },
  }
  const faixa = (L, a, b, ya, yb, m, prof = ESPF, sai = 0) => {
    const comp = b - a, alt = yb - ya
    if (comp <= 0.01 || alt <= 0.01) return null
    const off = L.k + L.n * (sai + prof / 2)
    return caixa(casca, L.horiz ? comp : prof, alt, L.horiz ? prof : comp, m, L.horiz ? (a + b) / 2 : off, ya + alt / 2, L.horiz ? off : (a + b) / 2)
  }
  const ladoEntrada = entrada?.lado || 'sul'
  const centroEntrada = entrada ? (LADOS[ladoEntrada].horiz ? entrada.x : entrada.z) : cxp
  for (const [nomeLado, L] of Object.entries(LADOS)) {
    const comVao = nomeLado === ladoEntrada
    const va = centroEntrada - 1.15, vb = centroEntrada + 1.15
    // parede com vão da entrada (até 3,2 m)
    if (comVao) { faixa(L, L.a - ESPF, va, 0, HP, matBranco); faixa(L, vb, L.b + ESPF, 0, HP, matBranco); faixa(L, va, vb, 3.2, HP, matBranco) }
    else faixa(L, L.a - ESPF, L.b + ESPF, 0, HP, matBranco)
    faixa(L, L.a - ESPF, L.b + ESPF, 0, 0.45, matBase, 0.06, ESPF)   // rodapé
    // vãos de janela altos entre pilastras azuis (2 andares)
    const comp = L.b - L.a, nB = Math.max(2, Math.round(comp / 3.3)), passo = comp / nB
    for (let i = 0; i < nB; i++) {
      const a = L.a + i * passo, b = a + passo
      if (comVao && b > va - 0.3 && a < vb + 0.3) continue
      for (const [ya, yb] of [[0.75, 3.05], [4.05, HP - 1.75]]) faixa(L, a + 0.42, b - 0.42, ya, yb, matVidroPodio, 0.04, ESPF)
    }
    for (let i = 0; i <= nB; i++) { const p = L.a + i * passo; faixa(L, p - 0.26, p + 0.26, 0.45, HP - 1.6, i % 2 ? matAzul : matBranco, 0.32, ESPF - 0.05) }
    // faixa azul do topo (onde vai o nome)
    faixa(L, L.a - ESPF - 0.35, L.b + ESPF + 0.35, HP - 1.65, HP + 0.25, matAzul, 0.5, ESPF)
    faixa(L, L.a - ESPF - 0.4, L.b + ESPF + 0.4, HP + 0.25, HP + 0.4, matAzulEsc, 0.6, ESPF)
    if (nome && (comVao || nomeLado === 'sul')) {
      const { t, prop } = placa(nome.toUpperCase())
      const alt = 0.95, larg = Math.min(alt * prop, comp * 0.8)
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(larg, larg / prop), M({ map: t, transparent: true, depthWrite: false, roughness: 0.6 }))
      const off = L.k + L.n * (ESPF + 0.52)
      pl.position.set(L.horiz ? cxp : off, HP - 0.7, L.horiz ? off : czp)
      pl.rotation.y = L.horiz ? (L.n > 0 ? 0 : Math.PI) : (L.n > 0 ? Math.PI / 2 : -Math.PI / 2)
      casca.add(pl)
    }
  }
  // portal em arco na entrada (moldura azul com abertura em arco)
  {
    const L = LADOS[ladoEntrada]
    const forma = new THREE.Shape()
    forma.moveTo(-1.8, 0); forma.lineTo(1.8, 0); forma.lineTo(1.8, HP - 1.65); forma.lineTo(-1.8, HP - 1.65); forma.lineTo(-1.8, 0)
    const furo = new THREE.Path(); furo.moveTo(-1.15, 0); furo.lineTo(1.15, 0); furo.lineTo(1.15, 3.1); furo.absarc(0, 3.1, 1.15, 0, Math.PI, false); furo.lineTo(-1.15, 0)
    forma.holes.push(furo)
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 24 })
    const portal = new THREE.Mesh(geo, matAzul); portal.castShadow = true; alvos.push(portal)
    const off = L.k + L.n * (ESPF + 0.05)
    if (L.horiz) { portal.position.set(centroEntrada, 0, off); portal.rotation.y = L.n > 0 ? 0 : Math.PI }
    else { portal.position.set(off, 0, centroEntrada); portal.rotation.y = L.n > 0 ? Math.PI / 2 : -Math.PI / 2 }
    casca.add(portal)
    // porta de vidro dentro do arco
    const pv = faixa(L, centroEntrada - 1.1, centroEntrada + 1.1, 0, 3.1, M({ color: 0x9cc3e0, roughness: 0.05, metalness: 0.3, opacity: 0.55, transparent: true }), 0.06, ESPF * 0.4)
    if (pv) pv.castShadow = false
  }
  // laje do pódio e platibanda
  caixa(casca, BW + 2 * ESPF + 0.1, 0.3, BD + 2 * ESPF + 0.1, matBranco, cxp, HP + 0.1, czp)
  // torre
  const TW = ox1 - ox0 + 0.25, TD = oz1 - oz0 + 0.25, tx = (ox0 + ox1) / 2, tz = (oz0 + oz1) / 2   // torre = planta do escritório
  // andares da torre: 2º ao 16º; o do escritório (andar) fica em yA
  const PRIMEIRO = 2, ULTIMO = Math.max(16, andar + 4), FH = 3.1, base = HP + 0.25
  const NF = ULTIMO - PRIMEIRO + 1, TH = NF * FH
  const nA = Math.min(Math.max(andar, PRIMEIRO), ULTIMO) - PRIMEIRO     // índice do andar do escritório
  const yA = base + nA * FH
  const fBranco = F(matBranco), fAzul = F(matAzul), fAzulEsc = F(matAzulEsc), fVidro = F(matVidroTorre), fCond = F(matCond), fBase = F(matBase)
  const grupoDo = (f) => (f < nA ? casca : f === nA ? andarG : torre)
  const mDo = (f, m, fm) => (f < nA ? m : fm)
  // núcleo de vidro em três partes: abaixo do escritório, o andar dele e acima
  const texCima = texT.clone(), texCimaE = texTE.clone(); texCima.repeat.set(1, NF - nA - 1); texCimaE.repeat.set(1, NF - nA - 1)
  const texBaixo = texT.clone(), texBaixoE = texTE.clone(); texBaixo.repeat.set(1, Math.max(1, nA)); texBaixoE.repeat.set(1, Math.max(1, nA))
  const vBaixo = matVidroTorre.clone(); vBaixo.map = texBaixo; vBaixo.emissiveMap = texBaixoE
  const vCima = fVidro.clone(); vCima.map = texCima; vCima.emissiveMap = texCimaE; vCima.userData.op0 = 1; fade.push(vCima)
  if (nA > 0) caixa(casca, TW, nA * FH - 0.06, TD, vBaixo, tx, base + (nA * FH - 0.06) / 2, tz)
  caixa(andarG, TW, FH, TD, fVidro, tx, yA + FH / 2, tz)
  if (NF - nA - 1 > 0) caixa(torre, TW, (NF - nA - 1) * FH, TD, vCima, tx, yA + FH + (NF - nA - 1) * FH / 2, tz)
  for (let f = 0; f < NF; f++) {
    const y = base + f * FH, G = grupoDo(f)
    caixa(G, TW + 0.9, 1.0, TD + 0.9, mDo(f, matBranco, fBranco), tx, y + 0.5, tz)
    caixa(G, TW + 0.94, 0.14, TD + 0.94, mDo(f, matAzulEsc, fAzulEsc), tx, y + 0.07, tz, false)
    // condensadoras de ar nas sacadas
    for (let k = 0; k < 3; k++) {
      if (r() > 0.55) continue
      const lado = Math.floor(r() * 4), u = (r() - 0.5) * 0.8
      const px = lado < 2 ? tx + u * TW : tx + (lado === 2 ? -1 : 1) * (TW / 2 + 0.32)
      const pz = lado < 2 ? tz + (lado === 0 ? -1 : 1) * (TD / 2 + 0.32) : tz + u * TD
      if (f === nA) continue   // no andar do escritório, nada na sacada para não tapar a vista
      caixa(G, lado < 2 ? 0.7 : 0.3, 0.5, lado < 2 ? 0.3 : 0.7, mDo(f, matCond, fCond), px, y + 1.25, pz, false)
    }
  }
  caixa(torre, TW + 0.9, 1.2, TD + 0.9, fBranco, tx, base + TH + 0.6, tz)
  // colunas azuis (canto da frente, centro e canto de trás), cortadas em: até o andar, o andar, acima
  for (const [w, d, x, z] of [[1.4, 1.4, tx - TW / 2 + 0.3, tz + TD / 2 + 0.2], [1.9, 1.0, tx + TW * 0.12, tz + TD / 2 + 0.25], [1.2, 1.2, tx + TW / 2 - 0.2, tz - TD / 2 + 0.3]]) {
    if (yA - base > 0.05) caixa(casca, w, yA - base, d, matAzul, x, base + (yA - base) / 2, z)
    caixa(andarG, w, FH, d, fAzul, x, yA + FH / 2, z)
    const topo = base + TH + 1.6
    caixa(torre, w, topo - yA - FH, d, fAzul, x, yA + FH + (topo - yA - FH) / 2, z)
  }
  // casa de máquinas, caixa d'água e antenas no topo
  caixa(torre, TW * 0.4, 2.6, TD * 0.4, fBranco, tx, base + TH + 2.5, tz)
  caixa(torre, TW * 0.22, 1.6, TD * 0.25, fAzulEsc, tx + TW * 0.25, base + TH + 2.0, tz - TD * 0.15)
  for (let i = 0; i < 3; i++) { const an = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3 + i, 6), fBase); an.position.set(tx - TW * 0.1 + i * 0.6, base + TH + 3.8 + i / 2, tz + 0.3); torre.add(an) }
  // mastros com bandeiras na laje do pódio
  const bandeiras = []
  const corBand = [0x0f766a, 0xffffff, 0x1d4fb8]
  for (let i = 0; i < 3; i++) {
    const mx = tx + TW * 0.12 + 1.6 + i * 0.7, mz = tz + TD / 2 + 3.2
    const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 5, 8), M({ color: 0xd4d4d8, metalness: 0.6, roughness: 0.3 })); mastro.position.set(mx, HP + 2.75, mz); casca.add(mastro)
    const geo = new THREE.PlaneGeometry(1.1, 0.72, 10, 1)
    const b = new THREE.Mesh(geo, M({ color: corBand[i], side: THREE.DoubleSide, roughness: 0.8 })); b.position.set(mx + 0.57, HP + 4.85, mz); casca.add(b)
    bandeiras.push({ b, base: Float32Array.from(geo.attributes.position.array), fase: i })
  }

  // refletores à noite: iluminam a fachada do pódio e a torre de baixo para cima
  if (noite) {
    for (const [dx, dz] of [[-1, 1], [1, 1], [-1, -1]]) {
      const sp = new THREE.SpotLight(0xfff1d6, 60, 70, 0.5, 0.6, 1.4)
      sp.position.set(cxp + dx * (BW / 2 + 9), 0.6, czp + dz * (BD / 2 + 9))
      sp.target.position.set(tx, 24, tz); casca.add(sp); casca.add(sp.target)
    }
  }

  // ---- entorno ----
  const matAsfalto = new THREE.MeshStandardMaterial({ color: noite ? 0x1f2329 : 0x3b3f45, roughness: 0.95 })
  const matCalcada = new THREE.MeshStandardMaterial({ color: noite ? 0x3a3f46 : 0xc7c2b8, roughness: 0.9 })
  const matFaixa = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
  const matAmarela = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 })
  const matGrama = new THREE.MeshStandardMaterial({ color: noite ? 0x1e3a24 : 0x5f9e4a, roughness: 1 })
  const plano = (w, d, m, x, z, y = 0.005) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); o.rotation.x = -Math.PI / 2; o.position.set(x, y, z); o.receiveShadow = true; entorno.add(o); return o }
  const CAL = 4.2, RUA = 10, MED = 3
  plano(BW + 2 * CAL + 6, BD + 2 * CAL + 6, matCalcada, cxp, czp, 0.004)
  // rua do lado da entrada (oeste/leste → corre em z; norte/sul → corre em x) e a rua da esquina (sul)
  const ruas = []
  const ladoRua1 = ladoEntrada, ladoRua2 = ['oeste', 'leste'].includes(ladoEntrada) ? 'sul' : 'oeste'
  for (const lado of [ladoRua1, ladoRua2]) {
    const L = LADOS[lado], horiz = L.horiz
    const meio = L.k + L.n * (CAL + 3 + RUA / 2), comp = 220
    plano(horiz ? comp : RUA, horiz ? RUA : comp, matAsfalto, horiz ? cxp : meio, horiz ? meio : czp, 0.006)
    // canteiro central com grama e palmeiras (como na foto), faixas tracejadas
    const can = meio + L.n * (RUA / 2 + MED / 2)
    plano(horiz ? comp : MED, horiz ? MED : comp, matGrama, horiz ? cxp : can, horiz ? can : czp, 0.01)
    const meio2 = can + L.n * (MED / 2 + RUA / 2)
    plano(horiz ? comp : RUA, horiz ? RUA : comp, matAsfalto, horiz ? cxp : meio2, horiz ? meio2 : czp, 0.006)
    for (let k = -100; k < 100; k += 4.5) {
      plano(horiz ? 2.2 : 0.14, horiz ? 0.14 : 2.2, matFaixa, horiz ? cxp + k : meio, horiz ? meio : czp + k, 0.012)
      plano(horiz ? 2.2 : 0.14, horiz ? 0.14 : 2.2, matFaixa, horiz ? cxp + k : meio2, horiz ? meio2 : czp + k, 0.012)
    }
    plano(horiz ? comp : 0.12, horiz ? 0.12 : comp, matAmarela, horiz ? cxp : meio - L.n * (RUA / 2 - 0.3), horiz ? meio - L.n * (RUA / 2 - 0.3) : czp, 0.012)
    ruas.push({ horiz, faixas: [meio - L.n * 2.4, meio + L.n * 2.4] })
    // faixa de pedestre perto da esquina
    const pe = horiz ? bx0 - CAL - 6 : bz1 + CAL + 6
    for (let i = 0; i < 9; i++) plano(horiz ? 0.5 : RUA - 0.6, horiz ? RUA - 0.6 : 0.5, matFaixa, horiz ? pe : meio - RUA / 2 + 0.6 + i * 1.05, horiz ? meio - RUA / 2 + 0.6 + i * 1.05 : pe, 0.013)
  }
  // palmeiras no canteiro e na calçada
  const arvores = []
  const matTronco = new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.95 })
  const matFolha = new THREE.MeshStandardMaterial({ color: noite ? 0x1f4d2b : 0x3f8f3a, roughness: 0.85 })
  for (const lado of [ladoRua1, ladoRua2]) {
    const L = LADOS[lado]
    const can = L.k + L.n * (CAL + 3 + RUA + MED / 2)
    for (let k = -60; k <= 60; k += 7) {
      const pm = palmeira(r, matTronco, matFolha)
      pm.g.position.set(L.horiz ? cxp + k : can, 0, L.horiz ? can : czp + k); entorno.add(pm.g); arvores.push({ copa: pm.copa, fase: r() * 6 })
    }
  }
  // postes
  const postes = []
  const matPoste = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.4 })
  const matLuz = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe2a0, emissiveIntensity: noite ? 2 : 0.1 })
  for (const lado of [ladoRua1, ladoRua2]) {
    const L = LADOS[lado], lin = L.k + L.n * (CAL + 2.4)
    for (let k = -1; k <= 1; k++) {
      const u = (L.horiz ? cxp : czp) + k * 11
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.5, 8), matPoste); p.position.set(L.horiz ? u : lin, 3.75, L.horiz ? lin : u); p.castShadow = true; entorno.add(p)
      const bra = new THREE.Mesh(new THREE.BoxGeometry(L.horiz ? 0.1 : 1.6, 0.08, L.horiz ? 1.6 : 0.1), matPoste); bra.position.set(L.horiz ? u : lin + L.n * 0.8, 7.4, L.horiz ? lin + L.n * 0.8 : u); entorno.add(bra)
      const lu = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), matLuz); lu.position.set(L.horiz ? u : lin + L.n * 1.5, 7.3, L.horiz ? lin + L.n * 1.5 : u); entorno.add(lu)
      if (noite) { const pl = new THREE.PointLight(0xffd59a, 2.2, 14, 1.8); pl.position.copy(lu.position).setY(6.8); entorno.add(pl); postes.push(pl) }
    }
  }
  // carros andando nas duas mãos
  const carros = []
  const cores = [0xf8fafc, 0xd4d4d8, 0x9ca3af, 0x1f2937, 0xb91c1c, 0x1e40af, 0xe5e7eb]
  ruas.forEach((rua, ir) => rua.faixas.forEach((lin, mao) => {
    for (let i = 0; i < 2; i++) {
      const c = carro(cores[Math.floor(r() * cores.length)])
      const sentido = mao ? 1 : -1
      c.g.rotation.y = rua.horiz ? (sentido > 0 ? 0 : Math.PI) : (sentido > 0 ? -Math.PI / 2 : Math.PI / 2)
      entorno.add(c.g)
      carros.push({ ...c, rua, lin, sentido, u: -90 + r() * 180 + i * 60 + ir * 13, vel: 7 + r() * 5 })
    }
  }))
  // prédios vizinhos (fundo da cidade)
  const viz = []
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + r() * 0.3, dist = 60 + r() * 30
    if (Math.cos(ang) < -0.2 && Math.sin(ang) > 0.2) continue   // não tapa a câmera (que olha de sudoeste)
    const w = 9 + r() * 8, d = 9 + r() * 7, h = 12 + r() * 30
    const [tv, tve] = texturaJanelas(5, 4, ['#e7dccb', '#f1f5f9', '#d6d3d1'][i % 3], ['#5b6b7f', '#334155'], noite ? 0.4 : 0, 100 + i)
    tv.repeat.set(Math.round(w / 3.5) / 5, Math.round(h / 3) / 4); tve.repeat.copy(tv.repeat)
    const m = new THREE.MeshStandardMaterial({ map: tv, emissiveMap: tve, emissive: 0xffffff, emissiveIntensity: noite ? 0.9 : 0, roughness: 0.8 })
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [m, m, new THREE.MeshStandardMaterial({ color: 0x9ca3af }), m, m, m])
    o.position.set(cxp + Math.cos(ang) * dist, h / 2, czp + Math.sin(ang) * dist); o.castShadow = true; o.receiveShadow = true
    entorno.add(o); viz.push(o)
  }

  // abertura: 0 = prédio fechado, 1 = andar aberto (torre sobe e some, fachada some)
  let k = 0
  const aplicar = (v) => {
    k = v
    torre.position.y = v * 30
    const op = 1 - Math.min(1, v * 1.15)
    fade.forEach((m) => { m.opacity = m.userData.op0 * op })
    torre.visible = andarG.visible = v < 0.999
  }
  const tick = (dt, t) => {
    carros.forEach((c) => {
      c.u += c.sentido * c.vel * dt
      if (c.u > 110) c.u -= 220
      if (c.u < -110) c.u += 220
      const base2 = c.rua.horiz ? cxp : czp
      if (c.rua.horiz) c.g.position.set(base2 + c.u, 0, c.lin); else c.g.position.set(c.lin, 0, base2 + c.u)
      c.rodas.forEach((w) => { w.rotation.y += c.vel * dt / 0.33 * c.sentido })
    })
    bandeiras.forEach(({ b, base: b0, fase }) => {
      const pos = b.geometry.attributes.position
      for (let i = 0; i < pos.count; i++) { const x = b0[i * 3] + 0.55; pos.array[i * 3 + 2] = Math.sin(x * 4 - t * 5 + fase) * 0.08 * x }
      pos.needsUpdate = true
    })
    arvores.forEach((a) => { a.copa.rotation.z = Math.sin(t * 0.8 + a.fase) * 0.05; a.copa.rotation.x = Math.cos(t * 0.6 + a.fase) * 0.04 })
  }
  grupo.position.y = -yA
  return { grupo, alvos, aplicar, tick, get k() { return k }, yA, altura: base + TH + 4, largura: Math.max(BW, BD) }
}
