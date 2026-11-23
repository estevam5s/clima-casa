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
  // trocar o desenho pelo modelo 3D da biblioteca (Avatares): some o corpo vermelho, ficam a xícara, a luz e o vapor,
  // reposicionados no bico do modelo. O modelo vem de frente para +z (como os do Tripo) e é escalado para 33 cm de altura
  const desenho = [corpo, base, tanque, agua, tampa, alavanca, grade, ...g.children.filter((o) => o.isMesh && o.geometry?.type === 'BoxGeometry' && o !== agua)]
  const trocar = (modelo, altura = 0.33) => {
    const bb = new THREE.Box3().setFromObject(modelo), tam = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3())
    const k = altura / Math.max(0.01, tam.y)
    const m = new THREE.Group(); m.add(modelo); modelo.position.set(-c.x, -bb.min.y, -c.z); m.scale.setScalar(k)
    modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    desenho.forEach((o) => { o.visible = false })
    g.add(m)
    const fz = (tam.z * k) / 2
    // pousa a xícara EM CIMA da grelha do modelo e afastada do corpo: antes ela ficava a 3 cm do chão, afundada na grelha
    // e encostada na coluna (parecia grudada). Um raio de cima acha a grelha; um raio de frente para trás acha o corpo.
    g.updateMatrixWorld(true)
    const malhas = []; m.traverse((o) => { if (o.isMesh) malhas.push(o) })
    const ray = new THREE.Raycaster(), alvoZ = fz * 0.5
    const raioXic = 0.034
    ray.set(new THREE.Vector3(0, altura * 0.45, alvoZ), new THREE.Vector3(0, -1, 0))
    const chao = ray.intersectObjects(malhas, false).find((h) => h.point.y < altura * 0.35)
    const yBase = chao ? chao.point.y + 0.002 : 0.03
    ray.set(new THREE.Vector3(0, yBase + 0.035, fz + 0.2), new THREE.Vector3(0, 0, -1))
    const frente = ray.intersectObjects(malhas, false)[0]
    const zXic = frente ? Math.min(fz + 0.02, Math.max(alvoZ, frente.point.z + raioXic + 0.012)) : alvoZ
    xic.position.set(0, yBase, zXic); vapor.forEach((v) => { v.userData.z = zXic })
    luz.position.set(tam.x * k * 0.32, altura * 0.82, fz + 0.004)
    zV = zXic; yV = Math.max(altura * 0.42, yBase + 0.18)
  }
  let zV = 0.09, yV = 0.12
  const animarBase = animar
  return { g, animar: (t, fazendo) => { animarBase(t, fazendo); if (zV !== 0.09) vapor.forEach((v, i) => { const k2 = ((t * 0.6 + i / 6) % 1); v.position.set(Math.sin(t * 2 + i) * 0.012, yV - 0.1 + k2 * 0.16, zV) }) },
    definirLigada: (l) => { ligada = l }, trocar }
}

// o que fica em volta da cafeteira: açucareiro com colher, porta-cápsulas com cápsulas de várias cores, pilha de
// xícaras, adoçante e copo de mexedores. Origem no tampo, à direita da máquina; frente para +z, como a cafeteira.
export function acessoriosCafe() {
  const g = new THREE.Group()
  const branco = M({ color: 0xf8fafc, roughness: 0.3 }), inox = M({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.45 })
  // açucareiro de louça com tampa e colher
  const acu = new THREE.Group(); acu.position.set(0.2, 0, 0.02); g.add(acu)
  const pote = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.075, 20), branco); pote.position.y = 0.038; pote.castShadow = true; acu.add(pote)
  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 20), branco); tampa.position.y = 0.081; acu.add(tampa)
  const pegador = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), branco); pegador.position.y = 0.093; acu.add(pegador)
  const colher = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.09, 0.004), inox); colher.position.set(0.03, 0.095, 0.01); colher.rotation.z = -0.5; acu.add(colher)
  // porta-cápsulas: caixa de acrílico escuro com 3 fileiras de cápsulas coloridas
  const porta = new THREE.Group(); porta.position.set(-0.24, 0, 0.0); g.add(porta)
  caixa(porta, 0.16, 0.012, 0.11, M({ color: 0x18181b, roughness: 0.4 }), 0, 0.006, 0)
  const cores = [0x7c2d12, 0x1d4ed8, 0xb45309, 0x15803d, 0x6b21a8, 0xb91c1c, 0x0f766e, 0x374151, 0xca8a04]
  const geoC = new THREE.CylinderGeometry(0.014, 0.018, 0.018, 14)
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const c = new THREE.Mesh(geoC, M({ color: cores[(i * 3 + j) % cores.length], roughness: 0.25, metalness: 0.5 }))
    c.position.set(-0.054 + i * 0.036, 0.021, -0.034 + j * 0.034); porta.add(c)
  }
  // duas cápsulas soltas ao lado, uma deitada
  for (const [x, z, rot, cor] of [[-0.1, 0.09, 0, 0x1d4ed8], [-0.06, 0.1, 1.4, 0x7c2d12]]) { const c = new THREE.Mesh(geoC, M({ color: cor, roughness: 0.25, metalness: 0.5 })); c.position.set(x, 0.01, z); c.rotation.z = rot; g.add(c) }
  // pilha de xícaras de cabeça para baixo
  for (let k = 0; k < 3; k++) { const x = xicara(); x.rotation.x = Math.PI; x.position.set(0.33, 0.066 + k * 0.05, -0.02); g.add(x) }
  // copo com mexedores e caixinha de adoçante
  const copo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.022, 0.08, 14, 1, true), M({ color: 0x94a3b8, roughness: 0.2, metalness: 0.4, side: THREE.DoubleSide })); copo.position.set(0.12, 0.04, -0.08); g.add(copo)
  for (let k = 0; k < 5; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.11, 0.002), M({ color: 0xd6b98c, roughness: 0.7 })); m.position.set(0.12 + Math.sin(k * 1.3) * 0.01, 0.07, -0.08 + Math.cos(k * 1.3) * 0.01); m.rotation.z = (k - 2) * 0.08; g.add(m) }
  caixa(g, 0.07, 0.04, 0.05, M({ color: 0x0ea5e9, roughness: 0.5 }), 0.02, 0.02, 0.1)
  return g
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

function paredes(g, { L, D, ALT, porta, matParede, vidroFrente = false, matVidro, fundo = false }) {
  const E = 0.1, obst = []
  // fundo: a parede do escritório (já existe); na sala encostada na fachada de vidro, a parede do fundo é desenhada aqui
  if (fundo) { caixa(g, L, ALT, E, matParede, 0, ALT / 2, E / 2); obst.push({ u: 0, v: E / 2, w: L, d: E }) }
  for (const s of [-1, 1]) { caixa(g, E, ALT, D, matParede, s * (L / 2 - E / 2), ALT / 2, D / 2); obst.push({ u: s * (L / 2 - E / 2), v: D / 2, w: E, d: D }) }
  const [p0, p1] = porta
  const frente = vidroFrente ? matVidro : matParede
  if (p0 > -L / 2) { const w = p0 + L / 2; caixa(g, w, ALT, E, frente, -L / 2 + w / 2, ALT / 2, D - E / 2, !vidroFrente); obst.push({ u: -L / 2 + w / 2, v: D - E / 2, w, d: E }) }
  if (p1 < L / 2) { const w = L / 2 - p1; caixa(g, w, ALT, E, frente, p1 + w / 2, ALT / 2, D - E / 2, !vidroFrente); obst.push({ u: p1 + w / 2, v: D - E / 2, w, d: E }) }
  caixa(g, p1 - p0, ALT - 2.1, E, matParede, (p0 + p1) / 2, 2.1 + (ALT - 2.1) / 2, D - E / 2)   // bandeira em cima da porta
  if (vidroFrente) for (const x of [-L / 2 + 0.02, p0, p1, L / 2 - 0.02]) caixa(g, 0.04, ALT, 0.06, M({ color: 0x9ca3af, roughness: 0.4, metalness: 0.3 }), x, ALT / 2, D - E / 2)
  return obst
}

function placa(texto, fundo = '#1f2937') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96
  const c = cv.getContext('2d'); c.fillStyle = fundo; c.fillRect(0, 0, 256, 96)
  c.fillStyle = '#f8fafc'; c.font = `600 ${texto.length > 9 ? 30 : 40}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(texto, 128, 50)
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
  const ace = acessoriosCafe(); ace.position.set(-0.45, 0.92, 0.36); g.add(ace)
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

// banheiros do andar, encostados na fachada e virados para a copa: masculino, feminino e acessível (PcD), cada um
// com porta própria, vaso, pia e espelho. O acessível é mais largo, com barras de apoio e pia mais baixa.
// Coordenadas como as outras salas: u ao longo da parede, v para fora (0 = fundo, D = frente com as portas).
export function montarBanheiros({ D = 2.4, ALT = 2.7, matParede }) {
  const g = new THREE.Group(), obst = []
  const tipos = [['Masculino', 1.7, '#1e3a8a'], ['Feminino', 1.7, '#9d174d'], ['Acessível', 2.3, '#0f766e']]
  const L = tipos.reduce((s, t) => s + t[1], 0)
  const E = 0.1
  const branco = M({ color: 0xffffff, roughness: 0.25 }), inox = M({ color: 0xc8ccd2, roughness: 0.3, metalness: 0.45 })
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, D), M({ color: 0xcbd5e1, roughness: 0.4 })); piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0.012, D / 2); piso.receiveShadow = true; g.add(piso)
  // fundo e laterais externas
  caixa(g, L, ALT, E, matParede, 0, ALT / 2, E / 2); obst.push({ u: 0, v: E / 2, w: L, d: E })
  let u0 = -L / 2
  tipos.forEach(([nome, w, cor], i) => {
    const uc = u0 + w / 2
    // parede lateral (entre os banheiros e nas pontas)
    caixa(g, E, ALT, D, matParede, u0 + (i === 0 ? E / 2 : 0), ALT / 2, D / 2); obst.push({ u: u0, v: D / 2, w: E, d: D })
    // frente com a porta (vão de 0,9 m; 1,0 m no acessível) e a folha entreaberta
    const vao = i === 2 ? 1.0 : 0.85, p0 = uc - vao / 2 + 0.15, p1 = p0 + vao
    if (p0 > u0) { caixa(g, p0 - u0, ALT, E, matParede, (u0 + p0) / 2, ALT / 2, D - E / 2); obst.push({ u: (u0 + p0) / 2, v: D - E / 2, w: p0 - u0, d: E }) }
    if (p1 < u0 + w) { caixa(g, u0 + w - p1, ALT, E, matParede, (p1 + u0 + w) / 2, ALT / 2, D - E / 2); obst.push({ u: (p1 + u0 + w) / 2, v: D - E / 2, w: u0 + w - p1, d: E }) }
    caixa(g, vao, ALT - 2.1, E, matParede, (p0 + p1) / 2, 2.1 + (ALT - 2.1) / 2, D - E / 2)
    const folha = new THREE.Group(); folha.position.set(p0, 0, D - E); folha.rotation.y = 1.2; g.add(folha)
    caixa(folha, vao - 0.02, 2.05, 0.04, M({ color: 0xe7e5e4, roughness: 0.5 }), (vao - 0.02) / 2, 1.03, -0.02)
    caixa(folha, 0.03, 0.12, 0.05, inox, vao - 0.12, 1.0, 0.0, false)
    const pl = placa(nome, cor); pl.position.set((p0 + p1) / 2, 2.25, D + 0.001); g.add(pl)
    // vaso no fundo, pia na lateral, espelho
    const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.4, 16), branco); vaso.position.set(uc + w / 2 - 0.42, 0.2, 0.38); vaso.castShadow = true; g.add(vaso)
    caixa(g, 0.36, 0.35, 0.14, branco, uc + w / 2 - 0.42, 0.55, 0.14)
    obst.push({ u: uc + w / 2 - 0.42, v: 0.38, w: 0.45, d: 0.6 })
    const yPia = i === 2 ? 0.78 : 0.88
    const pia = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.08, 18), branco); pia.position.set(u0 + 0.3, yPia, 0.5); g.add(pia)
    caixa(g, 0.03, 0.15, 0.03, inox, u0 + 0.14, yPia + 0.1, 0.5, false)
    const esp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.7), M({ color: 0xdbeafe, roughness: 0.02, metalness: 0.9 })); esp.rotation.y = Math.PI / 2; esp.position.set(u0 + 0.06, yPia + 0.6, 0.5); g.add(esp)
    obst.push({ u: u0 + 0.3, v: 0.5, w: 0.45, d: 0.5 })
    if (i === 2) {   // barras de apoio em volta do vaso
      caixa(g, 0.8, 0.035, 0.035, inox, uc + w / 2 - 0.5, 0.78, 0.13, false)
      caixa(g, 0.035, 0.035, 0.8, inox, uc + w / 2 - 0.07, 0.78, 0.5, false)
    }
    u0 += w
  })
  caixa(g, E, ALT, D, matParede, L / 2 - E / 2, ALT / 2, D / 2); obst.push({ u: L / 2 - E / 2, v: D / 2, w: E, d: D })
  return { grupo: g, obst, L }
}

// sala multiuso no canto do andar, encostada na fachada: frente de vidro com porta, mesa com 6 cadeiras, sofá e TV.
export function montarSalaMultiuso({ L = 5.6, D = 3.2, ALT = 2.7, matParede, matVidro }) {
  const g = new THREE.Group()
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L, D), M({ color: 0xd6c7b0, roughness: 0.7 })); piso.rotation.x = -Math.PI / 2; piso.position.set(0, 0.012, D / 2); piso.receiveShadow = true; g.add(piso)
  const porta = [-L / 2 + 0.5, -L / 2 + 1.5]
  const obst = paredes(g, { L, D, ALT, porta, matParede, vidroFrente: true, matVidro, fundo: true })
  const madeira = M({ color: 0x8a5a36, roughness: 0.55 }), preto = M({ color: 0x18181b, roughness: 0.4 }), tecido = M({ color: 0x475569, roughness: 0.9 })
  // mesa com 6 cadeiras
  const mx = 0.6, mv = D / 2 + 0.1
  caixa(g, 2.0, 0.04, 0.95, madeira, mx, 0.74, mv); caixa(g, 1.8, 0.7, 0.06, preto, mx, 0.36, mv, false)
  for (const [du, dv, ry] of [[-0.6, -0.75, 0], [0, -0.75, 0], [0.6, -0.75, 0], [-0.6, 0.75, Math.PI], [0, 0.75, Math.PI], [0.6, 0.75, Math.PI]]) {
    const c = new THREE.Group(); c.position.set(mx + du, 0, mv + dv); c.rotation.y = ry; g.add(c)
    caixa(c, 0.42, 0.05, 0.42, tecido, 0, 0.46, 0); caixa(c, 0.42, 0.45, 0.05, tecido, 0, 0.7, -0.19); caixa(c, 0.05, 0.44, 0.05, preto, 0, 0.22, 0, false)
  }
  obst.push({ u: mx, v: mv, w: 2.3, d: 1.9 })
  // sofá encostado no fundo e TV na lateral
  caixa(g, 1.6, 0.42, 0.75, tecido, -L / 2 + 1.0, 0.21, 0.5); caixa(g, 1.6, 0.4, 0.18, tecido, -L / 2 + 1.0, 0.6, 0.2)
  obst.push({ u: -L / 2 + 1.0, v: 0.45, w: 1.7, d: 0.85 })
  const tv = caixa(g, 0.05, 0.75, 1.3, preto, L / 2 - 0.08, 1.45, D / 2); tv.castShadow = false
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.69), M({ color: 0x0b1220, emissive: 0x1e3a8a, emissiveIntensity: 0.35, roughness: 0.2 })); tela.rotation.y = -Math.PI / 2; tela.position.set(L / 2 - 0.111, 1.45, D / 2); g.add(tela)
  const pl = placa('Multiuso'); pl.position.set((porta[0] + porta[1]) / 2, 2.25, D + 0.001); g.add(pl)
  return { grupo: g, obst }
}
