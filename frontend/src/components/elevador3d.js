import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// ---------------------------------------------------------------------------------------------------------------
// Elevadores e térreo (recepção) do mapa 3D. Tudo desenhado por código, sem marca de fabricante.
//
// Núcleo de elevadores: grupo com origem no meio da face da parede onde ele encosta; +z local aponta para fora
// (para o corredor), +x corre ao longo da parede. Dois carros lado a lado; cada um tem cabine de verdade (chão,
// paredes de inox, corrimão e luz), duas folhas de porta que correm para dentro das paredes e um mostrador do andar.
// ---------------------------------------------------------------------------------------------------------------
export const ELEV = { larg: 3.7, prof: 1.75, alt: 2.9, vao: 1.1, carros: [-0.95, 0.95] }

function texDisplay() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 56
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace
  const desenhar = (andar, seta = '') => {
    const g = cv.getContext('2d')
    g.fillStyle = '#05080f'; g.fillRect(0, 0, 128, 56)
    g.fillStyle = '#fbbf24'; g.font = '700 34px ui-monospace, Menlo, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(String(andar), seta ? 76 : 64, 30)
    if (seta) { g.font = '700 26px system-ui, sans-serif'; g.fillText(seta, 30, 30) }
    tx.needsUpdate = true
  }
  return { tx, desenhar }
}

export function montarElevador({ rotuloAndar = '9', escuro = false }) {
  const { larg, prof, alt, vao, carros } = ELEV
  const grupo = new THREE.Group()
  const M = (o) => new THREE.MeshStandardMaterial(o)
  const pedra = M({ color: escuro ? 0x57534e : 0xd6d3d1, roughness: 0.55 })          // revestimento do núcleo
  // inox com metal moderado: sem mapa de ambiente, metal alto sai preto (armadilha conhecida do 3D)
  const inox = M({ color: 0xd9dee4, roughness: 0.32, metalness: 0.45 })
  const inoxEsc = M({ color: 0xa3abb5, roughness: 0.35, metalness: 0.45 })
  const piso = M({ color: 0x3f3f46, roughness: 0.6 })
  const luz = M({ color: 0xffffff, emissive: 0xfff3dc, emissiveIntensity: 1.1 })
  const caixa = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; grupo.add(o); return o }
  // corpo: fundo, pilares entre os vãos e a viga em cima das portas (os vãos ficam ocos: é ali que estão as cabines)
  caixa(larg, alt, 0.18, pedra, 0, alt / 2, 0.09)
  const bordas = [-larg / 2, ...carros.flatMap((c) => [c - vao / 2, c + vao / 2]), larg / 2]
  for (let i = 0; i < bordas.length; i += 2) { const a = bordas[i], b = bordas[i + 1]; if (b - a > 0.01) caixa(b - a, alt, prof, pedra, (a + b) / 2, alt / 2, prof / 2) }
  caixa(larg, alt - 2.25, prof, pedra, 0, 2.25 + (alt - 2.25) / 2, prof / 2)
  // rodapé e friso de inox na frente
  caixa(larg + 0.02, 0.1, 0.02, inoxEsc, 0, 0.05, prof + 0.01)
  const lista = carros.map((cx) => {
    // cabine (a porta corre para dentro dos pilares, que escondem as folhas abertas)
    caixa(vao - 0.02, 0.02, prof - 0.2, piso, cx, 0.01, 0.18 + (prof - 0.2) / 2)
    caixa(vao - 0.02, 2.2, 0.02, inox, cx, 1.12, 0.19)   // fundo (espelho de inox)
    for (const s of [-1, 1]) caixa(0.02, 2.2, prof - 0.24, inox, cx + s * (vao / 2 - 0.02), 1.12, 0.18 + (prof - 0.24) / 2)
    caixa(vao - 0.1, 0.035, 0.035, inoxEsc, cx, 0.92, 0.26)   // corrimão
    const teto = caixa(vao - 0.12, 0.01, prof - 0.4, luz, cx, 2.22, 0.2 + (prof - 0.4) / 2); teto.castShadow = false
    // moldura do vão
    for (const s of [-1, 1]) caixa(0.06, 2.28, 0.05, inox, cx + s * (vao / 2 + 0.03), 1.14, prof + 0.012)
    caixa(vao + 0.18, 0.06, 0.05, inox, cx, 2.28, prof + 0.012)
    // duas folhas que se abrem do meio para os lados
    const folhas = [-1, 1].map((s) => caixa(vao / 2, 2.2, 0.04, inox, cx + s * vao / 4, 1.1, prof - 0.07))
    // mostrador do andar
    const d = texDisplay(); d.desenhar(rotuloAndar)
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.15), new THREE.MeshStandardMaterial({ map: d.tx, emissiveMap: d.tx, emissive: 0xffffff, emissiveIntensity: 0.9 }))
    tela.position.set(cx, 2.48, prof + 0.003); grupo.add(tela)
    return { cx, folhas, display: d, aberto: 0, alvo: 0 }
  })
  // botoeira entre os dois carros (acende quando alguém chama)
  caixa(0.14, 0.3, 0.02, inox, 0, 1.15, prof + 0.01)
  const botao = new THREE.Mesh(new THREE.CircleGeometry(0.025, 20), new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0x38bdf8, emissiveIntensity: 0.15 }))
  botao.position.set(0, 1.18, prof + 0.022); grupo.add(botao)
  const botao2 = botao.clone(); botao2.material = botao.material.clone(); botao2.position.y = 1.1; grupo.add(botao2)
  const tick = (dt) => {
    for (const c of lista) {
      c.aberto = THREE.MathUtils.clamp(c.aberto + Math.sign(c.alvo - c.aberto) * dt / 0.9, 0, 1)
      const e = c.aberto < 0.5 ? 2 * c.aberto * c.aberto : 1 - Math.pow(-2 * c.aberto + 2, 2) / 2   // suave nas pontas
      c.folhas.forEach((f, i) => { const s = i ? 1 : -1; f.position.x = c.cx + s * (vao / 4 + e * (vao / 2 - 0.04)) })
    }
  }
  const chamar = (on) => { botao.material.emissiveIntensity = on ? 1.2 : 0.15; botao2.material.emissiveIntensity = on ? 1.2 : 0.15 }
  return { grupo, carros: lista, tick, chamar }
}

// ---------------------------------------------------------------------------------------------------------------
// Térreo: recepção do prédio dentro do pódio (pé-direito duplo). Coordenadas do mundo, com o chão em yT.
// Devolve os obstáculos (retângulos) para a grade de colisão e os lugares das pessoas (recepcionista, segurança).
// ---------------------------------------------------------------------------------------------------------------
export function montarTerreo({ podio, yT, elev, marca = '', noite = false, pisoTex, r = Math.random }) {
  const { bx0, bx1, bz0, bz1 } = podio
  const HP = podio.HP - 0.2
  const grupo = new THREE.Group(); grupo.position.y = yT; grupo.visible = false
  const obst = []
  const bloquear = (x, z, w, d, ry = 0) => obst.push({ x, z, w, d, ry })
  const M = (o) => new THREE.MeshStandardMaterial(o)
  const caixa = (w, h, d, m, x, y, z, ry = 0, pai = grupo) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; pai.add(o); return o }
  const W = bx1 - bx0, D = bz1 - bz0, cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2
  // piso de pedra clara polida, com faixa escura no caminho da porta até os elevadores
  const tex = pisoTex.clone(); tex.needsUpdate = true; tex.repeat.set(W / 1.2, D / 1.2)
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M({ color: 0xf2efe9, map: tex, roughness: 0.18, metalness: 0.05 }))
  chao.rotation.x = -Math.PI / 2; chao.position.set(cx, 0.004, cz); chao.receiveShadow = true; grupo.add(chao)
  // teto com painéis de luz e luzes pontuais (o pódio fechado não recebe sol por dentro)
  const teto = new THREE.Mesh(new THREE.PlaneGeometry(W, D), M({ color: 0xf5f5f4, roughness: 0.9, side: THREE.DoubleSide }))
  teto.rotation.x = Math.PI / 2; teto.position.set(cx, HP, cz); grupo.add(teto)
  const matPainel = M({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: noite ? 1.5 : 1.0 })
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), matPainel); p.rotation.x = Math.PI / 2
    p.position.set(bx0 + W * (i + 0.5) / 4, HP - 0.02, bz0 + D * (j + 0.5) / 3); grupo.add(p)
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const l = new THREE.PointLight(0xffeedd, noite ? 9 : 7, Math.max(W, D) * 0.7, 1.2)
    l.position.set(bx0 + W * (i + 0.5) / 3, HP - 0.6, bz0 + D * (j + 0.5) / 2); grupo.add(l)
  }
  grupo.add(new THREE.HemisphereLight(0xfffaf0, 0x8a7f72, 0.55))
  // lado da entrada (o portal em arco do pódio): normal para dentro
  const ent = podio.entrada, ce = podio.centroEntrada
  const dentro = { oeste: [1, 0], leste: [-1, 0], norte: [0, 1], sul: [0, -1] }[ent] || [0, -1]
  const horizE = ent === 'norte' || ent === 'sul'
  const portaP = horizE ? [ce, ent === 'norte' ? bz0 : bz1] : [ent === 'oeste' ? bx0 : bx1, ce]   // meio do portal, na parede
  const em = (u, v) => horizE ? [portaP[0] + u, portaP[1] + dentro[1] * v] : [portaP[0] + dentro[0] * v, portaP[1] + u]   // u: ao longo da parede, v: para dentro
  const ryFrente = Math.atan2(-dentro[0], -dentro[1])   // olhando para a porta
  // tapete de entrada
  { const [x, z] = em(0, 1.4); const t = new THREE.Mesh(new THREE.PlaneGeometry(horizE ? 2.6 : 2.2, horizE ? 2.2 : 2.6), M({ color: 0x27272a, roughness: 1 })); t.rotation.x = -Math.PI / 2; t.position.set(x, 0.008, z); grupo.add(t) }
  // recepção: balcão em L com tampo de pedra, painel de ripas de madeira e o nome do prédio atrás
  const madeira = M({ color: 0x8a5a36, roughness: 0.55 }), pedraEsc = M({ color: 0x1f2937, roughness: 0.3, metalness: 0.1 }), branco = M({ color: 0xf8fafc, roughness: 0.4 })
  const lado = elev.u > 0 ? -1 : 1   // recepção do lado oposto aos elevadores
  const [rx, rz] = em(lado * 4.2, 5.2)
  const balcao = new THREE.Group(); balcao.position.set(rx, 0, rz); balcao.rotation.y = ryFrente; grupo.add(balcao)
  caixa(3.2, 1.08, 0.6, branco, 0, 0.54, 0, 0, balcao)
  caixa(3.3, 0.05, 0.75, pedraEsc, 0, 1.105, 0.05, 0, balcao)
  caixa(3.0, 0.04, 0.55, madeira, 0, 0.74, -0.55, 0, balcao)   // mesa de trabalho por trás
  caixa(0.6, 0.36, 0.03, M({ color: 0x111827 }), 0.4, 1.0, -0.62, 0, balcao)   // monitor
  caixa(0.56, 0.32, 0.005, M({ color: 0x0b1220, emissive: 0x2563eb, emissiveIntensity: 0.5 }), 0.4, 1.0, -0.604, 0, balcao)
  // lugar da recepcionista, atrás do balcão (local → grupo, só rotação em y)
  const posRecep = new THREE.Vector3(rx + 0.4 * Math.cos(ryFrente) - 1.05 * Math.sin(ryFrente), 0, rz - 0.4 * Math.sin(ryFrente) - 1.05 * Math.cos(ryFrente))
  bloquear(rx, rz, 3.4, 1.9, ryFrente)
  // parede de ripas com o nome
  { const [px, pz] = em(lado * 4.2, 7.4)
    const painel = new THREE.Group(); painel.position.set(px, 0, pz); painel.rotation.y = ryFrente; grupo.add(painel)
    caixa(4.6, 3.4, 0.12, M({ color: 0x3f2a1d, roughness: 0.7 }), 0, 1.7, 0, 0, painel)
    for (let i = 0; i < 22; i++) caixa(0.09, 3.3, 0.06, madeira, -2.2 + i * 0.21, 1.7, 0.08, 0, painel)
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 200; const g = cv.getContext('2d')
    g.fillStyle = '#f5f5f4'; g.font = '600 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText((marca || 'Recepção').toUpperCase(), 512, 100)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
    const nome = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), M({ map: t, transparent: true, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }))
    nome.position.set(0, 2.5, 0.13); painel.add(nome)
    bloquear(px, pz, 4.8, 0.4, ryFrente) }
  // catracas entre a porta e os elevadores (uma livre, de acessibilidade, sempre aberta)
  const inoxC = M({ color: 0xcfd5dc, roughness: 0.3, metalness: 0.45 }), vidroC = M({ color: 0xbfdbfe, roughness: 0.05, transparent: true, opacity: 0.45 })
  const vC = Math.max(3.2, elev.v - 2.6)
  for (let i = -2; i <= 2; i++) {
    const u = elev.u + i * 0.95
    const [x, z] = em(u, vC)
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ryFrente; grupo.add(g)
    caixa(0.18, 1.0, 1.2, inoxC, 0.42, 0.5, 0, 0, g)
    caixa(0.2, 0.03, 1.22, pedraEsc, 0.42, 1.015, 0, 0, g)
    if (i !== 0) { const asa = caixa(0.36, 0.5, 0.02, vidroC, 0.14, 0.75, 0.1, 0, g); asa.castShadow = false }
    const [bx, bz] = [x + Math.sin(ryFrente) * 0 + Math.cos(ryFrente) * 0.42, z - Math.sin(ryFrente) * 0.42]
    bloquear(bx, bz, 0.22, 1.25, ryFrente)
    if (i !== 0) bloquear(x + Math.cos(ryFrente) * 0.14, z - Math.sin(ryFrente) * 0.14, 0.4, 0.06, ryFrente)
  }
  // sala de espera: sofás, mesa de centro e tapete, do lado dos elevadores, perto da porta
  const tecido = M({ color: 0x475569, roughness: 0.9 })
  const [sx, sz] = em(-lado * 5.2, 3.0)
  const espera = new THREE.Group(); espera.position.set(sx, 0, sz); espera.rotation.y = ryFrente + Math.PI / 2; grupo.add(espera)
  const tap = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), M({ color: 0xa8a29e, roughness: 1 })); tap.rotation.x = -Math.PI / 2; tap.position.y = 0.01; espera.add(tap)
  for (const s of [-1, 1]) {
    const sofa = new THREE.Group(); sofa.position.z = s * 1.0; sofa.rotation.y = s > 0 ? Math.PI : 0; espera.add(sofa)
    caixa(2.0, 0.42, 0.85, tecido, 0, 0.21, 0, 0, sofa); caixa(2.0, 0.45, 0.2, tecido, 0, 0.62, -0.33, 0, sofa)
    for (const k of [-1, 1]) caixa(0.18, 0.55, 0.85, tecido, k * 0.92, 0.3, 0, 0, sofa)
  }
  caixa(1.1, 0.04, 0.6, M({ color: 0x1c1917, roughness: 0.3 }), 0, 0.42, 0, 0, espera)
  caixa(0.06, 0.4, 0.06, inoxC, 0, 0.2, 0, 0, espera)
  bloquear(sx, sz, 2.4, 3.0, ryFrente + Math.PI / 2)
  // colunas redondas de concreto e vasos grandes
  const concreto = M({ color: 0xe7e5e4, roughness: 0.8 })
  const folha = M({ color: 0x2f6e46, roughness: 0.85, flatShading: true }), vaso = M({ color: 0x44403c, roughness: 0.6 })
  for (const [u, v] of [[-7, 9], [7, 9], [-7, 14], [7, 14]]) {
    const [x, z] = em(u, v)
    if (x < bx0 + 0.6 || x > bx1 - 0.6 || z < bz0 + 0.6 || z > bz1 - 0.6) continue
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, HP, 24), concreto); c.position.set(x, HP / 2, z); c.castShadow = c.receiveShadow = true; grupo.add(c)
    bloquear(x, z, 0.7, 0.7)
  }
  for (const [u, v] of [[-2.2, 0.9], [2.2, 0.9], [lado * 6.6, 7.6], [-lado * 7.2, 6.4]]) {
    const [x, z] = em(u, v)
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 18), vaso); p.position.set(x, 0.3, z); p.castShadow = true; grupo.add(p)
    for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.12, 1), folha); f.position.set(x + (r() - 0.5) * 0.35, 0.85 + r() * 0.7, z + (r() - 0.5) * 0.35); f.castShadow = true; grupo.add(f) }
    bloquear(x, z, 0.65, 0.65)
  }
  // placa de andares ao lado dos elevadores
  { const [x, z] = em(elev.u + (elev.u > 0 ? 1 : -1) * (ELEV.larg / 2 + 0.55), elev.v - 0.2)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 640; const g = cv.getContext('2d')
    g.fillStyle = '#111827'; g.fillRect(0, 0, 512, 640)
    g.fillStyle = '#e5e7eb'; g.font = '600 40px system-ui, sans-serif'; g.fillText('Andares', 36, 70)
    g.font = '400 30px system-ui, sans-serif'
    const linhas = [['T', 'Recepção'], ['1º', 'Serviços'], [`${elev.andar}º`, marca || 'Escritório']]
    linhas.forEach(([a, n], i) => { g.fillStyle = i === 2 ? '#5eead4' : '#cbd5e1'; g.fillText(a, 36, 150 + i * 60); g.fillText(n, 130, 150 + i * 60) })
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.75), M({ map: t, roughness: 0.4 }))
    placa.position.set(x, 1.5, z); placa.rotation.y = ryFrente + Math.PI; grupo.add(placa)
    const pe = caixa(0.05, 1.2, 0.05, inoxC, x, 0.6, z); pe.castShadow = false
    bloquear(x, z, 0.4, 0.3) }
  // limites do chão andável (com folga das paredes do pódio)
  const limites = [bx0 + 0.4, bz0 + 0.4, bx1 - 0.4, bz1 - 0.4]
  return { grupo, obst, limites, posRecep, ryRecep: ryFrente + Math.PI, em, ryFrente }
}
