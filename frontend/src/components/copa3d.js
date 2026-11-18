import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// ---------------------------------------------------------------------------------------------------------------
// Copa do andar: cafeteira de cápsulas vermelha (desenho genérico, sem logotipo), cozinha e banheiro no corredor, ao
// lado do elevador. Coordenadas locais de cada sala: u = ao longo da parede do escritório (centro em 0), v = para fora
// (0 = parede do escritório, D = frente da sala, onde fica a porta, virada para o corredor).
// Cada montar* devolve { grupo, obst: [{u, v, w, d}], pontos } para o Mapa3D virar coordenadas do mundo.
// ---------------------------------------------------------------------------------------------------------------
const M = (o) => new THREE.MeshStandardMaterial(o)
const caixa = (pai, w, h, d, m, x, y, z, sombra = true) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = sombra; o.receiveShadow = true; pai.add(o); return o
}

// cafeteira de cápsulas: corpo arredondado vermelho, reservatório translúcido atrás, alavanca da cápsula em cima,
// bandeja de gotas, bico e luz de estado. ligada = luz verde e vapor quando passa café (animar(t, fazendo))
export function cafeteiraVermelha({ ligada = true } = {}) {
  const g = new THREE.Group()
  const vermelho = new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.22, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.15 })
  const preto = M({ color: 0x18181b, roughness: 0.4 }), inox = M({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.45 })
  const corpo = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.27, 0.2, 4, 0.045), vermelho); corpo.position.set(0, 0.155, -0.02); corpo.castShadow = true; g.add(corpo)
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.03, 0.27, 3, 0.012), preto); base.position.set(0, 0.015, 0.01); g.add(base)
  const tanque = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.22, 0.07, 3, 0.02), M({ color: 0x93c5fd, roughness: 0.05, transparent: true, opacity: 0.45 }))
  tanque.position.set(0, 0.15, -0.155); g.add(tanque)
  const agua = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.05), M({ color: 0x60a5fa, transparent: true, opacity: 0.35 })); agua.position.set(0, 0.11, -0.155); g.add(agua)
  const tampa = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.03, 0.12, 3, 0.012), preto); tampa.position.set(0, 0.3, 0.01); g.add(tampa)
  const alavanca = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.02, 0.1, 2, 0.008), preto); alavanca.position.set(0, 0.322, 0.05); alavanca.rotation.x = -0.25; g.add(alavanca)
  caixa(g, 0.03, 0.04, 0.03, preto, 0, 0.21, 0.09, false)   // bico
  const grade = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.012, 0.09, 2, 0.004), inox); grade.position.set(0, 0.04, 0.09); g.add(grade)
  const luz = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), new THREE.MeshBasicMaterial({ color: ligada ? 0x22c55e : 0x7f1d1d })); luz.position.set(0.05, 0.27, 0.08); g.add(luz)
  const xic = xicara(); xic.position.set(0, 0.046, 0.09); g.add(xic)
  // vapor: 6 bolinhas que sobem quando passa café
  const vapor = []
  const matV = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
  for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), matV.clone()); v.position.set(0, 0.12, 0.09); g.add(v); vapor.push(v) }
  const animar = (t, fazendo) => {
    luz.material.color.setHex(fazendo ? (Math.sin(t * 8) > 0 ? 0x22c55e : 0x14532d) : ligada ? 0x22c55e : 0x7f1d1d)
    vapor.forEach((v, i) => {
      const k = ((t * 0.6 + i / 6) % 1)
      v.position.set(Math.sin(t * 2 + i) * 0.012, 0.12 + k * 0.16, 0.09)
      v.material.opacity = fazendo ? 0.35 * (1 - k) : 0
      v.scale.setScalar(0.6 + k * 1.4)
    })
  }
  return { g, animar, definirLigada: (l) => { ligada = l } }
}

// xícara branca com café (também vai na mão das pessoas)
export function xicara() {
  const g = new THREE.Group()
  const branco = M({ color: 0xf8fafc, roughness: 0.3 })
  const copo = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.065, 18, 1, true), branco); copo.position.y = 0.033; g.add(copo)
  const fundo = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), branco); fundo.rotation.x = -Math.PI / 2; fundo.position.y = 0.002; g.add(fundo)
  const cafe = new THREE.Mesh(new THREE.CircleGeometry(0.028, 18), M({ color: 0x3b2314, roughness: 0.2 })); cafe.rotation.x = -Math.PI / 2; cafe.position.y = 0.055; g.add(cafe)
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.005, 6, 12, Math.PI), branco); asa.position.set(0.032, 0.035, 0); asa.rotation.z = -Math.PI / 2; g.add(asa)
  return g
}

function paredes(g, { L, D, ALT, porta, matParede, vidroFrente = false, matVidro }) {
  const E = 0.1, obst = []
  // fundo é a parede do escritório (já existe); laterais e frente com o vão da porta
  for (const s of [-1, 1]) { caixa(g, E, ALT, D, matParede, s * (L / 2 - E / 2), ALT / 2, D / 2); obst.push({ u: s * (L / 2 - E / 2), v: D / 2, w: E, d: D }) }
  const [p0, p1] = porta
  const frente = vidroFrente ? matVidro : matParede
  if (p0 > -L / 2) { const w = p0 + L / 2; caixa(g, w, ALT, E, frente, -L / 2 + w / 2, ALT / 2, D - E / 2, !vidroFrente); obst.push({ u: -L / 2 + w / 2, v: D - E / 2, w, d: E }) }
  if (p1 < L / 2) { const w = L / 2 - p1; caixa(g, w, ALT, E, frente, p1 + w / 2, ALT / 2, D - E / 2, !vidroFrente); obst.push({ u: p1 + w / 2, v: D - E / 2, w, d: E }) }
  caixa(g, p1 - p0, ALT - 2.1, E, matParede, (p0 + p1) / 2, 2.1 + (ALT - 2.1) / 2, D - E / 2)   // bandeira em cima da porta
  if (vidroFrente) for (const x of [-L / 2 + 0.02, p0, p1, L / 2 - 0.02]) caixa(g, 0.04, ALT, 0.06, M({ color: 0x9ca3af, roughness: 0.4, metalness: 0.3 }), x, ALT / 2, D - E / 2)
  return obst
}

function placa(texto) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96
  const c = cv.getContext('2d'); c.fillStyle = '#1f2937'; c.fillRect(0, 0, 256, 96)
  c.fillStyle = '#f8fafc'; c.font = '600 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texto, 128, 50)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), M({ map: t, roughness: 0.5 }))
}

// cozinha: bancada no fundo com pia, micro-ondas e a cafeteira; geladeira no canto; mesa com 4 cadeiras
export function montarCozinha({ L = 3.6, D = 2.8, ALT = 2.7, matParede, matVidro, ligada = true }) {
  const g = new THREE.Group(), pontos = {}
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, D), M({ color: 0xe7e5e4, roughness: 0.6 })); piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0.012, D / 2); piso.receiveShadow = true; g.add(piso)
  const porta = [L / 2 - 1.35, L / 2 - 0.35]
  const obst = paredes(g, { L, D, ALT, porta, matParede, vidroFrente: true, matVidro })
  const branco = M({ color: 0xf5f5f4, roughness: 0.5 }), pedra = M({ color: 0x27272a, roughness: 0.3 }), inox = M({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.45 })
  // bancada encostada na parede do escritório (v = 0)
  const bw = L - 1.0
  caixa(g, bw, 0.88, 0.6, branco, -0.5, 0.44, 0.35); caixa(g, bw + 0.02, 0.04, 0.62, pedra, -0.5, 0.9, 0.35)
  obst.push({ u: -0.5, v: 0.35, w: bw, d: 0.62 })
  caixa(g, 0.5, 0.02, 0.38, inox, -1.1, 0.915, 0.33, false)   // cuba
  const torn = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 12, Math.PI), inox); torn.position.set(-1.1, 1.0, 0.16); g.add(torn)
  caixa(g, 0.48, 0.28, 0.36, M({ color: 0x18181b, roughness: 0.4 }), 0.25, 1.06, 0.3)   // micro-ondas
  caixa(g, bw, 0.6, 0.35, branco, -0.5, 1.85, 0.18)   // armário alto
  const cafe = cafeteiraVermelha({ ligada }); cafe.g.position.set(-0.45, 0.92, 0.35); g.add(cafe.g)
  pontos.cafe = { u: -0.45, v: 0.95, ry: Math.PI }   // em pé de frente para a máquina
  // geladeira no canto da frente, ao lado da porta? fica no fundo, à direita
  caixa(g, 0.7, 1.85, 0.68, M({ color: 0xd4d4d8, roughness: 0.35, metalness: 0.3 }), L / 2 - 0.45, 0.925, 0.4)
  caixa(g, 0.02, 0.5, 0.03, inox, L / 2 - 0.75, 1.2, 0.76, false)
  obst.push({ u: L / 2 - 0.45, v: 0.4, w: 0.7, d: 0.7 })
  // mesa redonda com 4 cadeiras
  const mx = -0.6, mv = D - 0.95
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 28), branco); tampo.position.set(mx, 0.74, mv); tampo.castShadow = true; g.add(tampo)
  const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.2, 0.72, 16), pedra); pe.position.set(mx, 0.36, mv); g.add(pe)
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, cx = mx + Math.cos(a) * 0.62, cz = mv + Math.sin(a) * 0.62
    const cad = new THREE.Group(); cad.position.set(cx, 0, cz); cad.rotation.y = -a - Math.PI / 2; g.add(cad)
    caixa(cad, 0.4, 0.04, 0.4, M({ color: 0xa16207, roughness: 0.6 }), 0, 0.45, 0); caixa(cad, 0.4, 0.4, 0.04, M({ color: 0xa16207, roughness: 0.6 }), 0, 0.68, -0.19)
    for (const [px, pz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) caixa(cad, 0.025, 0.45, 0.025, pedra, px, 0.225, pz, false)
  }
  obst.push({ u: mx, v: mv, w: 1.6, d: 1.6 })
  const pl = placa('Copa'); pl.position.set((porta[0] + porta[1]) / 2, 2.25, D + 0.001); g.add(pl)
  return { grupo: g, obst, pontos, cafeteira: cafe }
}

// banheiro: duas cabines com porta, bancada com duas pias e espelho, secador de mãos
export function montarBanheiro({ L = 3.2, D = 2.8, ALT = 2.7, matParede }) {
  const g = new THREE.Group()
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, D), M({ color: 0xcbd5e1, roughness: 0.4 })); piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0.012, D / 2); piso.receiveShadow = true; g.add(piso)
  const porta = [-L / 2 + 0.3, -L / 2 + 1.2]
  const obst = paredes(g, { L, D, ALT, porta, matParede })
  const branco = M({ color: 0xffffff, roughness: 0.25 }), divis = M({ color: 0x64748b, roughness: 0.5 }), inox = M({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.45 })
  // cabines no fundo direito
  for (let k = 0; k < 2; k++) {
    const cu = L / 2 - 0.5 - k * 0.95
    caixa(g, 0.04, 1.9, 1.3, divis, cu - 0.47, 1.05, 0.7)
    const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 16), branco); vaso.position.set(cu, 0.2, 0.3); g.add(vaso)
    caixa(g, 0.36, 0.35, 0.14, branco, cu, 0.55, 0.08)
    caixa(g, 0.85, 1.85, 0.04, divis, cu, 1.0, 1.34)   // porta da cabine (fechada)
    obst.push({ u: cu, v: 0.7, w: 0.95, d: 1.35 })
  }
  // pias na parede da esquerda (lateral)
  caixa(g, 0.5, 0.06, 1.4, M({ color: 0x334155, roughness: 0.3 }), -L / 2 + 0.3, 0.85, 0.85)
  for (const pv of [0.5, 1.2]) { const cuba = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 18), branco); cuba.position.set(-L / 2 + 0.3, 0.9, pv); g.add(cuba); caixa(g, 0.03, 0.15, 0.03, inox, -L / 2 + 0.12, 1.0, pv, false) }
  const espelho = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), M({ color: 0xdbeafe, roughness: 0.02, metalness: 0.9 })); espelho.rotation.y = Math.PI / 2; espelho.position.set(-L / 2 + 0.06, 1.55, 0.85); g.add(espelho)
  caixa(g, 0.25, 0.3, 0.12, M({ color: 0xe5e7eb, roughness: 0.4 }), -L / 2 + 0.12, 1.3, 1.85)   // secador
  obst.push({ u: -L / 2 + 0.3, v: 0.85, w: 0.55, d: 1.45 })
  const pl = placa('Banheiro'); pl.position.set((porta[0] + porta[1]) / 2, 2.25, D + 0.001); g.add(pl)
  return { grupo: g, obst }
}
