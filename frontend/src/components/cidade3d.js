import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ---------------------------------------------------------------------------------------------------------------
// Cidade em volta do prédio do escritório (genérica: nenhum prédio real, nenhuma marca).
//
// Quadras numa grade de lotes ao redor do prédio, com ruas entre elas, calçadas, árvores e postes. Cada lote recebe um
// prédio de um "estilo" (vidro de escritório, residencial com sacadas, concreto, comercial baixo) ou vira praça.
// Desempenho: tudo do mesmo estilo vira UMA malha (mergeGeometries) com a textura de janelas repetida pelas
// coordenadas UV em metros; árvores e postes são InstancedMesh. Resultado: ~20 chamadas de desenho para a cidade toda.
// À noite, parte das janelas acende (emissiveMap) e as luminárias dos postes brilham (sem PointLight: caro).
//
// montarCidade({ centro, livres, ruas, camera, noite, r }) → { grupo }
//   livres: retângulos [x0, z0, x1, z1] onde não entra lote (o prédio, as ruas principais)
//   camera: direção (x, z) de onde a câmera olha o prédio fechado: ali os lotes próximos ficam baixos
// ---------------------------------------------------------------------------------------------------------------

const TILE_C = 8, TILE_L = 6   // a textura de janelas cobre 8 vãos × 6 andares (variedade de janelas acesas)

// estilos: cor da parede, vidro (2 tons), largura do vão, altura do andar, tipo de janela
const ESTILOS = {
  vidroAzul: { parede: '#1f3a52', vidro: ['#5d86a8', '#1c2f45'], vao: 1.5, fh: 3.6, cortina: true },
  vidroVerde: { parede: '#23443f', vidro: ['#6f9e93', '#1d3a36'], vao: 1.6, fh: 3.5, cortina: true },
  vidroCinza: { parede: '#2b2f36', vidro: ['#8d99a8', '#2a313b'], vao: 1.4, fh: 3.7, cortina: true },
  residBege: { parede: '#d9c7a7', vidro: ['#5b6b7f', '#2c3a4b'], vao: 3.0, fh: 2.9, cortina: false },
  residBranco: { parede: '#e8e6e1', vidro: ['#4f6276', '#26323f'], vao: 2.8, fh: 2.9, cortina: false },
  residTerracota: { parede: '#b9785a', vidro: ['#4b5a6b', '#26303b'], vao: 3.2, fh: 2.9, cortina: false },
  concreto: { parede: '#a8a29e', vidro: ['#55606e', '#262d36'], vao: 2.5, fh: 3.3, cortina: false },
}

function texturaEstilo(e, noite, semente) {
  const W = 512, H = 384, cw = W / TILE_C, ch = H / TILE_L
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  const em = document.createElement('canvas'); em.width = W; em.height = H
  const ge = em.getContext('2d'); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H)
  let s = semente >>> 0
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  g.fillStyle = e.parede; g.fillRect(0, 0, W, H)
  for (let j = 0; j < TILE_L; j++) for (let i = 0; i < TILE_C; i++) {
    const x0 = i * cw, y0 = j * ch
    // pele de vidro: vão quase inteiro de vidro, faixa opaca (laje) embaixo e montante fino; residencial: janela no meio da parede
    const [x, y, w, h] = e.cortina ? [x0 + 3, y0 + ch * 0.2, cw - 6, ch * 0.78] : [x0 + cw * 0.18, y0 + ch * 0.22, cw * 0.64, ch * 0.5]
    const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h)
    // reflexo do céu varia um pouco de vão para vão (o vidro de verdade não é uniforme)
    const k = 0.85 + rnd() * 0.3
    gr.addColorStop(0, e.vidro[0]); gr.addColorStop(1, e.vidro[1])
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x, y, w, h)
    g.globalAlpha = 0.18 * k; g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h * 0.35); g.globalAlpha = 1
    // persianas/cortinas em parte das janelas
    if (rnd() < 0.35) { g.fillStyle = 'rgba(230,226,218,0.55)'; g.fillRect(x, y, w, h * (0.2 + rnd() * 0.5)) }
    // caixilho
    g.strokeStyle = e.cortina ? 'rgba(200,210,220,0.55)' : 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.strokeRect(x, y, w, h)
    if (!e.cortina) { g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke() }
    if (noite && rnd() < 0.28) { ge.fillStyle = rnd() > 0.25 ? '#ffd9a0' : '#d6e6ff'; ge.globalAlpha = 0.55 + rnd() * 0.45; ge.fillRect(x, y, w, h); ge.globalAlpha = 1 }
  }
  if (e.cortina) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let j = 0; j < TILE_L; j++) g.fillRect(0, j * ch, W, ch * 0.2) }   // laje entre andares
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4
  const te = new THREE.CanvasTexture(em); te.colorSpace = THREE.SRGBColorSpace; te.wrapS = te.wrapT = THREE.RepeatWrapping
  return [t, te]
}

// quatro fachadas de um volume (sem teto/chão), com UV em "vãos × andares" para a textura repetir em metros
function fachadas(cx, cz, w, d, y0, h, e, ou, ov) {
  const pos = [], nor = [], uv = [], idx = []
  const su = (len) => len / (e.vao * TILE_C), sv = h / (e.fh * TILE_L)
  const face = (ax, az, bx, bz, nx, nz, len) => {
    const b = pos.length / 3
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az)
    for (let i = 0; i < 4; i++) nor.push(nx, 0, nz)
    const u1 = ou + su(len)
    uv.push(ou, ov, u1, ov, u1, ov + sv, ou, ov + sv)
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
  }
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2
  face(x0, z1, x1, z1, 0, 1, w)    // sul (+z)
  face(x1, z0, x0, z0, 0, -1, w)   // norte
  face(x1, z1, x1, z0, 1, 0, d)    // leste
  face(x0, z0, x0, z1, -1, 0, d)   // oeste
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

const caixaGeo = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g }
// telhado de duas águas: prisma triangular de largura w (ao longo da cumeeira), profundidade d e altura h
const telhadoGeo = (w, d, h, x, y, z, giro = 0) => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3); g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2)   // ponta para cima, de -0,5 a 1
  g.scale(w, h / 1.5, d / 1.732); g.translate(0, h / 3, 0); if (giro) g.rotateY(giro); g.translate(x, y, z); return g
}
const planoGeo = (w, d, x, y, z) => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g }

export function montarCidade({ centro, livres, camera, noite, r, sombraAte = 90 }) {
  const grupo = new THREE.Group()
  const [cx, cz] = centro
  const PASSO = 34, LOTE = 24, N = 5          // lotes de 24 m a cada 34 m (10 m de rua) até ±170 m
  const porEstilo = Object.fromEntries(Object.keys(ESTILOS).map((k) => [k, { perto: [], longe: [] }]))
  const tetos = [], parapeitos = [], sacadas = [], maquinas = [], caixas = [], calcadas = [], gramados = [], toldos = []
  const arvores = [], postes = []
  const casasP = [[], [], []], telhas = [], muros = []   // bairro de casas: paredes (3 cores), telhados, muros baixos
  const andaveis = [], pracas = []   // para vida3d: perímetro das calçadas das quadras e centro das praças
  const obstaculos = []   // lotes com prédio ou casas: o avatar anda pelas ruas, calçadas e praças, nunca por dentro deles
  const camN = Math.hypot(camera[0], camera[1]) || 1, cam = [camera[0] / camN, camera[1] / camN]
  const cruza = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
  const nomes = Object.keys(ESTILOS)

  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const lx = cx + i * PASSO, lz = cz + j * PASSO
    const ret = [lx - LOTE / 2 - 2.5, lz - LOTE / 2 - 2.5, lx + LOTE / 2 + 2.5, lz + LOTE / 2 + 2.5]
    if (livres.some((l) => cruza(ret, l))) continue
    const dx = lx - cx, dz = lz - cz, dist = Math.hypot(dx, dz)
    const naFrente = (dx * cam[0] + dz * cam[1]) / dist > 0.55 && dist < 150   // entre a câmera e o prédio
    calcadas.push(planoGeo(LOTE + 5, LOTE + 5, lx, 0.012, lz))
    if (dist < 150) andaveis.push([lx - LOTE / 2 - 1.3, lz - LOTE / 2 - 1.3, lx + LOTE / 2 + 1.3, lz + LOTE / 2 + 1.3])
    // postes nas quinas da quadra e árvores na calçada
    postes.push([lx - LOTE / 2 - 1.6, lz - LOTE / 2 - 1.6])
    for (let k = 0; k < 4; k++) {
      const lado = k % 2 ? 1 : -1, ao = (r() - 0.5) * LOTE * 0.8
      arvores.push(k < 2 ? [lx + ao, lz + lado * (LOTE / 2 + 1.4)] : [lx + lado * (LOTE / 2 + 1.4), lz + ao])
    }
    const sorte = r()
    // lotes mais afastados: parte vira bairro de casas (2 fileiras de sobrados com quintal e telhado de duas águas)
    const ocupado = [lx - LOTE / 2 + 0.4, lz - LOTE / 2 + 0.4, lx + LOTE / 2 - 0.4, lz + LOTE / 2 - 0.4]
    if (!naFrente && dist > 95 && sorte > 0.62) {
      obstaculos.push(ocupado)
      gramados.push(planoGeo(LOTE - 1, LOTE - 1, lx, 0.02, lz))
      const giro = r() < 0.5 ? 0 : Math.PI / 2
      for (let fil = -1; fil <= 1; fil += 2) for (let k = 0; k < 4; k++) {
        const u = -LOTE / 2 + 3 + k * ((LOTE - 6) / 3), v = fil * 5.4
        const [hx, hz] = giro ? [lx + v, lz + u] : [lx + u, lz + v]
        const w = 4.6 + r() * 0.8, d = 6 + r() * 1.5, pav = r() < 0.6 ? 2 : 1, h = pav * 2.9
        const [gw, gd] = giro ? [d, w] : [w, d]
        casasP[Math.floor(r() * 3)].push(caixaGeo(gw, h, gd, hx, h / 2, hz))
        telhas.push(telhadoGeo(d + 0.6, w + 0.6, 1.6 + r() * 0.5, hx, h, hz, giro ? 0 : Math.PI / 2))
        muros.push(giro ? caixaGeo(0.15, 1, LOTE / 4.6, hx + fil * (d / 2 + 2.2), 0.5, hz) : caixaGeo(LOTE / 4.6, 1, 0.15, hx, 0.5, hz + fil * (d / 2 + 2.2)))
        if (r() < 0.6) arvores.push(giro ? [hx + fil * (d / 2 + 1.2), hz + 1.5] : [hx + 1.5, hz + fil * (d / 2 + 1.2)])
      }
      continue
    }
    if (sorte < 0.1 || (naFrente && sorte < 0.45)) {   // praça: gramado com árvores
      gramados.push(planoGeo(LOTE - 1, LOTE - 1, lx, 0.02, lz))
      pracas.push([lx, lz])
      for (let k = 0; k < 6; k++) arvores.push([lx + (r() - 0.5) * (LOTE - 5), lz + (r() - 0.5) * (LOTE - 5)])
      continue
    }
    // 1 prédio grande ou 2 menores no lote
    obstaculos.push(ocupado)
    const dois = r() < 0.35
    const partes = dois ? [[-LOTE / 4, LOTE / 2 - 1.5], [LOTE / 4, LOTE / 2 - 1.5]] : [[0, LOTE - 3]]
    for (const [off, larg] of partes) {
      const horiz = r() < 0.5
      const bx = lx + (horiz ? off : 0), bz = lz + (horiz ? 0 : off)
      const w = horiz ? larg * (0.8 + r() * 0.2) : (LOTE - 3) * (0.6 + r() * 0.4)
      const d = horiz ? (LOTE - 3) * (0.6 + r() * 0.4) : larg * (0.8 + r() * 0.2)
      // altura: mais alta longe do prédio e baixa na frente da câmera
      let estilo, andares
      if (naFrente) { estilo = r() < 0.5 ? 'residBranco' : 'concreto'; andares = 2 + Math.floor(r() * 3) }
      else {
        estilo = nomes[Math.floor(r() * nomes.length)]
        const cortina = ESTILOS[estilo].cortina
        andares = cortina ? 8 + Math.floor(r() * 13) : 4 + Math.floor(r() * 12)
        if (dist < 75) andares = Math.min(andares, 4 + Math.floor(r() * 5))   // vizinhos imediatos baixos: a torre do escritório se destaca
        if (dist > 120 && r() < 0.4) andares += 6
      }
      const e = ESTILOS[estilo], h = andares * e.fh
      const terreo = e.cortina ? 0 : 3.6   // residencial/concreto: térreo comercial com vitrine e toldo
      const alvo = dist < sombraAte ? 'perto' : 'longe'
      if (terreo) {
        porEstilo.vidroCinza[alvo].push(fachadas(bx, bz, w - 0.6, d - 0.6, 0, terreo, ESTILOS.vidroCinza, r() * 4, 0.02))
        const lado = Math.floor(r() * 4), tw = (lado < 2 ? w : d) * 0.7
        toldos.push(lado < 2 ? caixaGeo(tw, 0.12, 1.4, bx, terreo - 0.3, bz + (lado ? 1 : -1) * (d / 2 + 0.6)) : caixaGeo(1.4, 0.12, tw, bx + (lado === 3 ? 1 : -1) * (w / 2 + 0.6), terreo - 0.3, bz))
      }
      porEstilo[estilo][alvo].push(fachadas(bx, bz, w, d, terreo, h, e, Math.floor(r() * TILE_C) / TILE_C, Math.floor(r() * TILE_L) / TILE_L))
      const topo = terreo + h
      tetos.push(planoGeo(w, d, bx, topo, bz))
      // platibanda
      for (const [pw, pd, px, pz] of [[w, 0.25, bx, bz - d / 2], [w, 0.25, bx, bz + d / 2], [0.25, d, bx - w / 2, bz], [0.25, d, bx + w / 2, bz]]) parapeitos.push(caixaGeo(pw, 0.9, pd, px, topo + 0.45, pz))
      // sacadas no residencial (faixa por andar numa ou duas fachadas)
      if (!e.cortina && estilo !== 'concreto') {
        const frente = r() < 0.5
        for (let f = 1; f < andares; f++) {
          const y = terreo + f * e.fh
          if (frente) sacadas.push(caixaGeo(w * 0.86, 0.14, 1.1, bx, y, bz + d / 2 + 0.55), caixaGeo(w * 0.86, 0.95, 0.06, bx, y + 0.5, bz + d / 2 + 1.08))
          else sacadas.push(caixaGeo(1.1, 0.14, d * 0.86, bx + w / 2 + 0.55, y, bz), caixaGeo(0.06, 0.95, d * 0.86, bx + w / 2 + 1.08, y + 0.5, bz))
        }
      }
      // cobertura: casa de máquinas, caixa d'água e condensadoras
      if (andares > 4) {
        maquinas.push(caixaGeo(w * 0.3, 2.6, d * 0.3, bx + (r() - 0.5) * w * 0.3, topo + 1.3, bz + (r() - 0.5) * d * 0.3))
        caixas.push(caixaGeo(2.2, 1.6, 2.2, bx - w * 0.25, topo + 0.8, bz + d * 0.22))
      }
      for (let k = 0; k < 3 + Math.floor(r() * 4); k++) maquinas.push(caixaGeo(1, 0.8, 0.8, bx + (r() - 0.5) * w * 0.7, topo + 0.4, bz + (r() - 0.5) * d * 0.7))
    }
  }

  // skyline distante (sem detalhes, some na névoa)
  for (let k = 0; k < 46; k++) {
    const ang = r() * Math.PI * 2, dist = 205 + r() * 70
    const dx = Math.cos(ang), dz = Math.sin(ang)
    if (dx * cam[0] + dz * cam[1] > 0.7) continue
    const estilo = nomes[Math.floor(r() * nomes.length)], e = ESTILOS[estilo]
    const w = 14 + r() * 16, d = 14 + r() * 16, h = (8 + Math.floor(r() * 22)) * e.fh
    porEstilo[estilo].longe.push(fachadas(cx + dx * dist, cz + dz * dist, w, d, 0, h, e, r(), r()))
    tetos.push(planoGeo(w, d, cx + dx * dist, h, cz + dz * dist))
  }

  // ---- malhas (uma por material) ----
  const malha = (geos, mat, sombra = true) => {
    if (!geos.length) return null
    const m = new THREE.Mesh(mergeGeometries(geos), mat)
    m.castShadow = sombra; m.receiveShadow = true; grupo.add(m); geos.forEach((g) => g.dispose()); return m
  }
  const M = (o) => new THREE.MeshStandardMaterial(o)
  let semente = 300
  for (const [k, e] of Object.entries(ESTILOS)) {
    const [t, te] = texturaEstilo(e, noite, semente++)
    const mat = M({ map: t, emissiveMap: te, emissive: 0xffffff, emissiveIntensity: noite ? 0.7 : 0, roughness: e.cortina ? 0.25 : 0.8, metalness: e.cortina ? 0.35 : 0 })
    malha(porEstilo[k].perto, mat, true)
    malha(porEstilo[k].longe, mat, false)
  }
  malha(tetos, M({ color: 0x8e8b86, roughness: 0.95 }), false)
  ;[0xf1e4c8, 0xdbe7e4, 0xf3d1c3].forEach((cor, i) => malha(casasP[i], M({ color: cor, roughness: 0.9 })))
  malha(telhas, M({ color: noite ? 0x5a2a1a : 0xa4472a, roughness: 0.85, flatShading: true }))
  malha(muros, M({ color: 0xe7e5e4, roughness: 0.95 }), false)
  malha(parapeitos, M({ color: 0xd6d3d1, roughness: 0.85 }))
  malha(sacadas, M({ color: 0xf5f5f4, roughness: 0.8 }))
  malha(maquinas, M({ color: 0xcbd5e1, roughness: 0.6, metalness: 0.2 }))
  malha(caixas, M({ color: 0x60a5fa, roughness: 0.6 }))
  malha(toldos, M({ color: 0x7c2d12, roughness: 0.9 }), false)
  malha(calcadas, M({ color: noite ? 0x3a3f46 : 0xc7c2b8, roughness: 0.9 }), false)
  malha(gramados, M({ color: noite ? 0x1e3a24 : 0x5f9e4a, roughness: 1 }), false)

  // árvores (tronco + copa) e postes por instância
  const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), esc = new THREE.Vector3()
  const instancias = (geo, mat, lista, ajuste, sombra = true) => {
    const im = new THREE.InstancedMesh(geo, mat, lista.length)
    lista.forEach((p, i) => { const [y, s] = ajuste(i); esc.set(s, s, s); mat4.compose(new THREE.Vector3(p[0], y * s, p[1]), q, esc); im.setMatrixAt(i, mat4) })
    im.castShadow = sombra; im.receiveShadow = true; grupo.add(im); return im
  }
  const escala = arvores.map(() => 0.8 + r() * 0.6)
  instancias(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 6), M({ color: 0x6b4f3a, roughness: 0.95 }), arvores, (i) => [1.2, escala[i]])
  instancias(new THREE.IcosahedronGeometry(1.7, 1), M({ color: noite ? 0x1f3d2b : 0x3f7d4e, roughness: 0.9, flatShading: true }), arvores, (i) => [3.4, escala[i]])
  instancias(new THREE.CylinderGeometry(0.07, 0.1, 7, 6), M({ color: 0x6b7280, roughness: 0.6, metalness: 0.4 }), postes, () => [3.5, 1], false)
  instancias(new THREE.BoxGeometry(0.5, 0.14, 0.5), M({ color: 0xfff3c4, emissive: 0xffe2a0, emissiveIntensity: noite ? 2.2 : 0.1 }), postes, () => [7.05, 1], false)
  return { grupo, calcadas: andaveis, pracas, obstaculos, limite: [cx - N * PASSO - LOTE / 2 - 4, cz - N * PASSO - LOTE / 2 - 4, cx + N * PASSO + LOTE / 2 + 4, cz + N * PASSO + LOTE / 2 + 4] }
}
