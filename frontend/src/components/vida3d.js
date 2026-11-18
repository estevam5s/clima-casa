import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// ---------------------------------------------------------------------------------------------------------------
// Vida na cidade do mapa 3D (decorativo, desenhado por código; nada aqui é dado real):
// - pedestres andando pelas calçadas das quadras, alguns com cachorro; guarda-chuva quando chove;
// - pombos nas praças (voam quando alguém passa perto), gaivotas sobrevoando, gatos deitados nas calçadas;
// - terminal de ônibus inspirado no TICEN (Terminal Integrado do Centro, Florianópolis), em forma estilizada:
//   plataformas cobertas, baias, ônibus comuns e articulados entrando, parando e saindo, passageiros esperando.
// Tudo em InstancedMesh: cada parte do corpo é UMA chamada de desenho para todo mundo.
// montarVida({ calcadas, pracas, terminal, noite, r }) → { grupo, tick(dt, t, chovendo), passageiros }
//   calcadas: retângulos [x0, z0, x1, z1] (o pedestre anda pelo perímetro); pracas: pontos [x, z]
//   terminal: { x, z } centro do terminal (eixo comprido em x)
// ---------------------------------------------------------------------------------------------------------------

const PELES = [0x8d5524, 0xc68642, 0xe0ac69, 0xf1c27d, 0xffdbac, 0x5c3a21]
const ROUPAS = [0x1e3a5f, 0x7f1d1d, 0x14532d, 0xf8fafc, 0x334155, 0xa16207, 0x6d28d9, 0x0f766e, 0xbe185d, 0x111827]

// multidão instanciada: tronco, cabeça, duas pernas e guarda-chuva por pessoa
function multidao(n, r) {
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o })
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.2, 0.62, 8), M({}), n)
  const cabeca = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 10, 8), M({}), n)
  const gPerna = new THREE.BoxGeometry(0.11, 0.78, 0.12); gPerna.translate(0, -0.39, 0)
  const pernaE = new THREE.InstancedMesh(gPerna, M({ color: 0x1f2937 }), n)
  const pernaD = new THREE.InstancedMesh(gPerna, M({ color: 0x1f2937 }), n)
  const gGuarda = new THREE.ConeGeometry(0.62, 0.28, 10, 1, true); gGuarda.translate(0, 2.05, 0)
  const guarda = new THREE.InstancedMesh(gGuarda, M({ side: THREE.DoubleSide }), n)
  const c = new THREE.Color()
  for (let i = 0; i < n; i++) {
    tronco.setColorAt(i, c.setHex(ROUPAS[Math.floor(r() * ROUPAS.length)]))
    cabeca.setColorAt(i, c.setHex(PELES[Math.floor(r() * PELES.length)]))
    guarda.setColorAt(i, c.setHex([0x111827, 0x1d4ed8, 0xb91c1c, 0x15803d][i % 4]))
  }
  const partes = [tronco, cabeca, pernaE, pernaD, guarda]
  partes.forEach((p) => { p.castShadow = true; p.frustumCulled = false })
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qp = new THREE.Quaternion(), v = new THREE.Vector3(), um = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0)
  const eixoY = new THREE.Vector3(0, 1, 0), eixoX = new THREE.Vector3(1, 0, 0)
  // coloca a pessoa i em (x, z) virada para yaw; fase da passada (andando) e se usa guarda-chuva
  const por = (i, x, z, yaw, fase, andando, chuva) => {
    q.setFromAxisAngle(eixoY, yaw)
    const b = andando ? Math.abs(Math.sin(fase)) * 0.04 : 0
    m4.compose(v.set(x, 1.12 + b, z), q, um); tronco.setMatrixAt(i, m4)
    m4.compose(v.set(x, 1.58 + b, z), q, um); cabeca.setMatrixAt(i, m4)
    const ang = andando ? Math.sin(fase) * 0.5 : 0
    const lx = Math.cos(yaw) * 0.09, lz = -Math.sin(yaw) * 0.09
    qp.setFromAxisAngle(eixoX, ang); qp.premultiply(q); m4.compose(v.set(x + lx, 0.8 + b, z + lz), qp, um); pernaE.setMatrixAt(i, m4)
    qp.setFromAxisAngle(eixoX, -ang); qp.premultiply(q); m4.compose(v.set(x - lx, 0.8 + b, z - lz), qp, um); pernaD.setMatrixAt(i, m4)
    m4.compose(v.set(x, b, z), q, chuva ? um : zero); guarda.setMatrixAt(i, m4)
  }
  const atualizar = () => partes.forEach((p) => { p.instanceMatrix.needsUpdate = true })
  return { partes, por, atualizar }
}

function caminhoRet([x0, z0, x1, z1], s) {
  // ponto e direção a `s` metros do canto, andando pelo perímetro do retângulo
  const w = x1 - x0, d = z1 - z0, per = 2 * (w + d)
  s = ((s % per) + per) % per
  if (s < w) return [x0 + s, z0, Math.PI / 2]
  if (s < w + d) return [x1, z0 + (s - w), 0]
  if (s < 2 * w + d) return [x1 - (s - w - d), z1, -Math.PI / 2]
  return [x0, z1 - (s - 2 * w - d), Math.PI]
}

function onibus(articulado, cor, destino) {
  const g = new THREE.Group()
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.4, ...o })
  const lata = M({ color: 0xf8fafc, metalness: 0.2 }), faixa = M({ color: cor }), vidro = M({ color: 0x0f172a, roughness: 0.1, metalness: 0.6 }), pneu = M({ color: 0x111111, roughness: 0.9 })
  const trechos = articulado ? [[-4.6, 9], [4.9, 8.2]] : [[0, 12]]
  for (const [x, comp] of trechos) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(comp, 2.9, 2.5, 3, 0.25), lata); c.position.set(x, 1.75, 0); c.castShadow = true; g.add(c)
    const j = new THREE.Mesh(new THREE.BoxGeometry(comp - 0.6, 0.9, 2.52), vidro); j.position.set(x, 2.35, 0); g.add(j)
    const f = new THREE.Mesh(new THREE.BoxGeometry(comp - 0.2, 0.35, 2.54), faixa); f.position.set(x, 1.15, 0); g.add(f)
    for (const dx of [-comp / 2 + 1.6, comp / 2 - 1.8]) for (const dz of [-1.15, 1.15]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14), pneu); w.rotation.x = Math.PI / 2; w.position.set(x + dx, 0.5, dz); g.add(w)
    }
  }
  if (articulado) { const fole = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.9, 14, 1, true), M({ color: 0x27272a, side: THREE.DoubleSide })); fole.rotation.z = Math.PI / 2; fole.position.set(0.4, 1.75, 0); g.add(fole) }
  // letreiro do destino (bairro) na frente
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const c2 = cv.getContext('2d')
  c2.fillStyle = '#0b0b0b'; c2.fillRect(0, 0, 256, 48); c2.fillStyle = '#fbbf24'; c2.font = '700 28px system-ui, sans-serif'; c2.textBaseline = 'middle'; c2.fillText(destino, 10, 25)
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace
  const frente = articulado ? 9 : 6
  const let1 = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.38), M({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: 0.8 }))
  let1.position.set(frente + 0.02, 2.95, 0); let1.rotation.y = Math.PI / 2; g.add(let1)
  return g
}

function terminal(x, z, noite, r) {
  const g = new THREE.Group(); g.position.set(x, 0, z)
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.75, ...o })
  const L = 74, ILHAS = [-11, 0, 11]
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(L + 30, 34), M({ color: noite ? 0x22262c : 0x3a3e44, roughness: 0.95 }))
  piso.rotation.x = -Math.PI / 2; piso.position.y = 0.014; piso.receiveShadow = true; g.add(piso)
  const concreto = M({ color: 0xc8c3b8 }), amarelo = M({ color: 0xeab308 }), branco = M({ color: 0xf1f5f9, metalness: 0.35, roughness: 0.35, side: THREE.DoubleSide })
  const coluna = M({ color: 0x9ca3af, metalness: 0.5, roughness: 0.4 })
  const luzes = M({ color: 0xfff7e0, emissive: 0xffe9b0, emissiveIntensity: noite ? 1.6 : 0.15 })
  for (const iz of ILHAS) {
    const ilha = new THREE.Mesh(new THREE.BoxGeometry(L - 6, 0.3, 3.6), concreto); ilha.position.set(0, 0.15, iz); ilha.receiveShadow = true; g.add(ilha)
    for (const lado of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(L - 6, 0.02, 0.35), amarelo); p.position.set(0, 0.31, iz + lado * 1.6); g.add(p) }
    // cobertura em arco (trecho de cilindro deitado) sobre colunas
    // trecho de cilindro deitado no eixo x: o topo do arco fica a ~5,3 m, cobrindo ~7,8 m de largura
    const arco = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, L - 2, 28, 1, true, Math.PI / 2 - 0.28, 0.56), branco)
    arco.rotation.z = Math.PI / 2; arco.position.set(0, 5.3 - 14, iz); arco.castShadow = true; g.add(arco)
    for (let k = -L / 2 + 6; k <= L / 2 - 6; k += 9) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4.7, 10), coluna); c.position.set(k, 2.6, iz); c.castShadow = true; g.add(c)
      const banco = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.5), M({ color: 0x475569 })); banco.position.set(k + 3, 0.52, iz + 0.9); g.add(banco)
      const pl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.3), luzes); pl.position.set(k + 4.5, 4.9, iz); g.add(pl)
    }
  }
  // fachada/letreiro na ponta
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128; const c2 = cv.getContext('2d')
  c2.fillStyle = '#0f3d5e'; c2.fillRect(0, 0, 1024, 128); c2.fillStyle = '#ffffff'; c2.font = '700 54px system-ui, sans-serif'; c2.textBaseline = 'middle'
  c2.fillText('TERMINAL INTEGRADO DO CENTRO · TICEN', 28, 66)
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace
  // letreiro de pé na ponta de entrada (comprido em z), com o nome nas duas faces (±x)
  const face = M({ map: tx, emissiveMap: tx, emissive: 0xffffff, emissiveIntensity: noite ? 0.7 : 0.1 }), azul = M({ color: 0x0f3d5e })
  const placa = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.2, 17.6), [face, face, azul, azul, azul, azul])
  placa.position.set(-L / 2 - 4, 6.4, 0); g.add(placa)
  for (const zz of [-7.5, 7.5]) { const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6.4, 0.5), coluna); pil.position.set(-L / 2 - 4, 3.2, zz); g.add(pil) }
  // ônibus: 2 faixas (entre as ilhas), entram por +x, param numa baia e saem por -x
  const DEST = ['Centro', 'Trindade', 'Canasvieiras', 'Lagoa', 'Estreito', 'Ingleses', 'Campeche', 'Santo Antônio']
  const CORES = [0x0f766e, 0x1d4ed8, 0xb45309, 0x15803d, 0x7c3aed, 0xbe123c]
  const frota = []
  for (let i = 0; i < 6; i++) {
    const art = i % 3 === 0
    const b = onibus(art, CORES[i % CORES.length], DEST[Math.floor(r() * DEST.length)])
    b.rotation.y = Math.PI   // anda para -x
    const faixa = i % 2 ? -5.5 : 5.5
    b.position.set(L / 2 + 25 + i * 18, 0, faixa); g.add(b)
    frota.push({ b, faixa, x: L / 2 + 25 + i * 22, parada: -L / 2 + 14 + (i % 3) * 20 + r() * 4, espera: 0, estado: 'chegando', vel: 0, comp: art ? 19 : 12 })
  }
  return { g, frota, L, ILHAS }
}

export function montarVida({ calcadas = [], pracas = [], terminal: posTerminal = null, travessias = [], noite, r }) {
  const grupo = new THREE.Group()
  const termi = posTerminal ? terminal(posTerminal.x, posTerminal.z, noite, r) : null
  if (termi) grupo.add(termi.g)
  // pedestres pelas calçadas + passageiros nas plataformas do terminal
  const N_PED = Math.min(150, calcadas.length * 5), N_PAS = termi ? 26 : 0, N_TRA = travessias.length * 3
  const povo = multidao(N_PED + N_PAS + N_TRA, r)
  povo.partes.forEach((p) => grupo.add(p))
  const peds = []
  for (let i = 0; i < N_PED; i++) {
    const ret = calcadas[i % calcadas.length]
    peds.push({ ret, s: r() * 400, vel: (1.0 + r() * 0.5) * (r() < 0.5 ? 1 : -1), fase: r() * 6, lado: (r() - 0.5) * 1.2 })
  }
  const pas = []
  for (let i = 0; i < N_PAS; i++) {
    const iz = termi.ILHAS[i % 3]
    pas.push({ x: posTerminal.x + (r() - 0.5) * (termi.L - 12), z: posTerminal.z + iz + (r() - 0.5) * 2.2, yaw: r() * Math.PI * 2, vai: r() * 10, fase: r() * 6 })
  }
  // quem atravessa: espera na calçada e cruza a faixa só na fase de pedestres do semáforo (sinal.pedestre)
  const tra = []
  travessias.forEach(([ax, az, bx, bz]) => {
    const c = Math.hypot(bx - ax, bz - az) || 1, px = -(bz - az) / c, pz = (bx - ax) / c   // perpendicular à faixa: lado a lado
    for (let k = 0; k < 3; k++) { const o = (k - 1) * 0.8; tra.push({ a: [ax + px * o, az + pz * o], b: [bx + px * o, bz + pz * o], lado: k % 2, k: 0, andando: false, fase: r() * 6 }) }
  })
  // cães com os primeiros pedestres
  const M = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, ...o })
  const N_CAO = Math.min(8, N_PED)
  const caoCorpo = new THREE.InstancedMesh(new RoundedBoxGeometry(0.55, 0.24, 0.22, 2, 0.08), M({}), N_CAO)
  const caoCabeca = new THREE.InstancedMesh(new RoundedBoxGeometry(0.2, 0.18, 0.18, 2, 0.06), M({}), N_CAO)
  const corCao = [0x8b5a2b, 0x111111, 0xd2b48c, 0xf5f5f4, 0x6b4423]
  for (let i = 0; i < N_CAO; i++) { const c = new THREE.Color(corCao[i % corCao.length]); caoCorpo.setColorAt(i, c); caoCabeca.setColorAt(i, c) }
  // pombos nas praças, gaivotas no céu, gatos deitados
  const pombos = []
  pracas.forEach(([px, pz]) => { for (let k = 0; k < 6; k++) pombos.push({ bx: px + (r() - 0.5) * 8, bz: pz + (r() - 0.5) * 8, x: 0, y: 0, z: 0, voo: 0, fase: r() * 6 }) })
  const gPombo = new THREE.SphereGeometry(0.13, 8, 6); gPombo.scale(1.4, 0.9, 0.9)
  const pomboM = new THREE.InstancedMesh(gPombo, M({ color: 0x6b7280 }), Math.max(1, pombos.length))
  const N_GAI = 12, gaivotas = []
  const gAsaE = new THREE.BoxGeometry(0.28, 0.03, 0.9); gAsaE.translate(0, 0, 0.45)
  const gAsaD = new THREE.BoxGeometry(0.28, 0.03, 0.9); gAsaD.translate(0, 0, -0.45)
  const gaiCorpo = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.5, 4, 8), M({ color: 0xf8fafc }), N_GAI)
  const gaiAsaE = new THREE.InstancedMesh(gAsaE, M({ color: 0xe5e7eb }), N_GAI), gaiAsaD = new THREE.InstancedMesh(gAsaD, M({ color: 0xe5e7eb }), N_GAI)
  const centroGai = posTerminal || (calcadas[0] ? { x: (calcadas[0][0] + calcadas[0][2]) / 2, z: (calcadas[0][1] + calcadas[0][3]) / 2 } : { x: 0, z: 0 })
  for (let i = 0; i < N_GAI; i++) gaivotas.push({ cx: centroGai.x + (r() - 0.5) * 120, cz: centroGai.z + (r() - 0.5) * 120, raio: 20 + r() * 35, y: 28 + r() * 18, a: r() * 6, vel: 0.18 + r() * 0.12 })
  const N_GATO = Math.min(5, calcadas.length), gatos = []
  const gatoCorpo = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8), M({ color: 0x9a6b3f }), Math.max(1, N_GATO))
  for (let i = 0; i < N_GATO; i++) { const [x0, z0, x1] = calcadas[(i * 7) % calcadas.length]; gatos.push({ x: x0 + (x1 - x0) * r(), z: z0 - 0.9, rot: r() * 6 }) }
  ;[caoCorpo, caoCabeca, pomboM, gaiCorpo, gaiAsaE, gaiAsaD, gatoCorpo].forEach((m) => { m.castShadow = true; m.frustumCulled = false; grupo.add(m) })
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), v = new THREE.Vector3(), um = new THREE.Vector3(1, 1, 1)
  const eY = new THREE.Vector3(0, 1, 0), eZ = new THREE.Vector3(0, 0, 1), eX = new THREE.Vector3(1, 0, 0)

  // aviões passando alto (ilustração: rota de aproximação do aeroporto, sem companhia nem marca). À noite: luzes de
  // navegação (vermelha à esquerda, verde à direita) e o pisca branco
  const centroAv = calcadas[0] ? [(calcadas[0][0] + calcadas[0][2]) / 2, (calcadas[0][1] + calcadas[0][3]) / 2] : [0, 0]
  const avioes = []
  const branco = M({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.3, fog: false }), cinzaA = M({ color: 0x94a3b8, roughness: 0.5, metalness: 0.3, fog: false })   // sem névoa: ficam visíveis no céu
  const luz = (cor) => new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: cor, fog: false }))
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Group()
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(1.9, 30, 6, 12), branco); fus.rotation.z = Math.PI / 2; a.add(fus)
    const asa = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 34), branco); asa.position.set(-1, -0.6, 0); asa.rotation.y = 0.12; a.add(asa)
    const est = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 12), branco); est.position.set(-15.5, 0.8, 0); a.add(est)
    const deriva = new THREE.Mesh(new THREE.BoxGeometry(4.5, 7, 0.4), cinzaA); deriva.position.set(-15, 4, 0); deriva.rotation.z = -0.35; a.add(deriva)
    for (const sz of [-1, 1]) { const mot = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 12), cinzaA); mot.rotation.z = Math.PI / 2; mot.position.set(1.5, -1.6, sz * 6.5); a.add(mot) }
    const le = luz(0xef4444), ld = luz(0x22c55e), pisca = luz(0xffffff)
    le.position.set(-1.4, -0.6, -17); ld.position.set(-1.4, -0.6, 17); pisca.position.set(0, 2.1, 0)
    a.add(le, ld, pisca); [le, ld, pisca].forEach((l) => { l.visible = noite })
    a.scale.setScalar(0.85); grupo.add(a)
    avioes.push({ a, pisca, ang: (i / 3) * Math.PI * 2 + r(), alt: 170 + i * 45, dist: 520, vel: 55 + r() * 15, fase: r() * 10, desce: i === 0 })
  }
  const tick = (dt, t, chovendo, sinal = {}) => {
    // cada avião cruza o céu numa reta de ~1,8 km e volta por outra rota
    for (const p of avioes) {
      p.fase += dt * p.vel / (p.dist * 2)
      if (p.fase > 1) { p.fase -= 1; p.ang += 2.1 }
      const k = p.fase * 2 - 1, dx = Math.cos(p.ang), dz = Math.sin(p.ang)
      const lado = 90
      const y = p.desce ? p.alt - (k + 1) * 18 : p.alt   // aproximação suave, sempre acima dos prédios
      p.a.position.set(centroAv[0] + dx * k * p.dist - dz * lado, y, centroAv[1] + dz * k * p.dist + dx * lado)
      p.a.rotation.set(0, -p.ang, p.desce ? -0.05 : 0)
      if (noite) p.pisca.visible = (t * 1.2 + p.fase * 10) % 1 < 0.12
    }
    // pedestres
    peds.forEach((p, i) => {
      p.s += p.vel * dt; p.fase += Math.abs(p.vel) * dt * 4.2
      const [x, z, yaw] = caminhoRet(p.ret, p.s)
      const dir = p.vel > 0 ? yaw : yaw + Math.PI
      const ox = Math.cos(yaw) * p.lado, oz = -Math.sin(yaw) * p.lado
      p.x = x + ox; p.z = z + oz
      povo.por(i, p.x, p.z, dir, p.fase, true, chovendo && i % 3 !== 0)
      if (i < N_CAO) {
        const cx = p.x - Math.sin(dir) * 0.9 + Math.cos(dir) * 0.5, cz = p.z - Math.cos(dir) * 0.9 - Math.sin(dir) * 0.5
        q.setFromAxisAngle(eY, dir + Math.PI / 2); const pul = Math.abs(Math.sin(p.fase * 1.6)) * 0.05
        m4.compose(v.set(cx, 0.36 + pul, cz), q, um); caoCorpo.setMatrixAt(i, m4)
        m4.compose(v.set(cx + Math.sin(dir) * 0.32, 0.5 + pul, cz + Math.cos(dir) * 0.32), q, um); caoCabeca.setMatrixAt(i, m4)
      }
    })
    // passageiros: esperam e às vezes andam um pouco pela plataforma
    pas.forEach((p, k) => {
      p.vai -= dt
      const andando = p.vai < 0 && p.vai > -3
      if (andando) { p.x += Math.sin(p.yaw) * dt * 0.9; p.fase += dt * 4 }
      if (p.vai < -3) { p.vai = 6 + Math.random() * 12; p.yaw = Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2 }
      povo.por(N_PED + k, p.x, p.z, p.yaw, p.fase, andando, false)
    })
    tra.forEach((p, k) => {
      const de = p.lado ? p.b : p.a, para = p.lado ? p.a : p.b
      if (!p.andando && sinal.pedestre) { p.andando = true; p.k = 0 }
      const comp = Math.hypot(para[0] - de[0], para[1] - de[1]) || 1
      if (p.andando) { p.k += (1.35 * dt) / comp; p.fase += dt * 5.5; if (p.k >= 1) { p.k = 0; p.andando = false; p.lado = 1 - p.lado } }
      const x = de[0] + (para[0] - de[0]) * p.k, z = de[1] + (para[1] - de[1]) * p.k
      povo.por(N_PED + N_PAS + k, x, z, Math.atan2(para[0] - de[0], para[1] - de[1]), p.fase, p.andando, chovendo)
    })
    povo.atualizar()
    caoCorpo.instanceMatrix.needsUpdate = true; caoCabeca.instanceMatrix.needsUpdate = true
    // pombos: bicam o chão; voam quando alguém passa a menos de 2,5 m e pousam depois
    pombos.forEach((b, i) => {
      if (b.voo <= 0) {
        const perto = peds.some((p) => p.x !== undefined && (p.x - b.bx) ** 2 + (p.z - b.bz) ** 2 < 6.25)
        if (perto || Math.random() < dt * 0.01) b.voo = 3.5
      }
      if (b.voo > 0) {
        b.voo -= dt; const k = b.voo / 3.5, alt = Math.sin(k * Math.PI) * 6
        b.x = b.bx + Math.cos(b.fase + k * 4) * 3; b.z = b.bz + Math.sin(b.fase + k * 4) * 3; b.y = 0.15 + alt
      } else { b.x = b.bx; b.z = b.bz; b.y = 0.13 + Math.abs(Math.sin(t * 6 + b.fase)) * 0.03 }
      q.setFromAxisAngle(eY, b.fase + t * 0.2); m4.compose(v.set(b.x, b.y, b.z), q, um); pomboM.setMatrixAt(i, m4)
    })
    pomboM.instanceMatrix.needsUpdate = true
    // gaivotas em círculo batendo as asas
    gaivotas.forEach((g, i) => {   // corpo deitado no eixo x local; asas em ±z batendo em volta do eixo x
      g.a += g.vel * dt
      const x = g.cx + Math.cos(g.a) * g.raio, z = g.cz + Math.sin(g.a) * g.raio
      q.setFromAxisAngle(eY, -g.a)
      m4.compose(v.set(x, g.y, z), qa.copy(q).multiply(qb.setFromAxisAngle(eZ, Math.PI / 2)), um); gaiCorpo.setMatrixAt(i, m4)
      const bat = Math.sin(t * 7 + i) * 0.5
      m4.compose(v, qa.copy(q).multiply(qb.setFromAxisAngle(eX, bat)), um); gaiAsaE.setMatrixAt(i, m4)
      m4.compose(v, qa.copy(q).multiply(qb.setFromAxisAngle(eX, -bat)), um); gaiAsaD.setMatrixAt(i, m4)
    })
    ;[gaiCorpo, gaiAsaE, gaiAsaD].forEach((m) => { m.instanceMatrix.needsUpdate = true })
    gatos.forEach((g, i) => { q.setFromAxisAngle(eY, g.rot + Math.sin(t * 0.3 + i) * 0.1); m4.compose(v.set(g.x, 0.12, g.z), qa.copy(q).multiply(qb.setFromAxisAngle(eZ, Math.PI / 2)), um); gatoCorpo.setMatrixAt(i, m4) })
    gatoCorpo.instanceMatrix.needsUpdate = true
    // ônibus do terminal: chegam, param na baia (8–14 s), saem e voltam ao começo
    if (termi) termi.frota.forEach((o, i) => {
      const fim = -termi.L / 2 - 30, inicio = termi.L / 2 + 30
      if (o.estado === 'chegando') { o.vel = Math.min(9, o.vel + dt * 3); if (o.x - o.parada < 10) o.vel = Math.max(1.2, (o.x - o.parada) * 0.8); o.x -= o.vel * dt; if (o.x <= o.parada) { o.estado = 'parado'; o.espera = 8 + Math.random() * 6 } }
      else if (o.estado === 'parado') { o.espera -= dt; if (o.espera <= 0) { o.estado = 'saindo'; o.vel = 0 } }
      else { o.vel = Math.min(9, o.vel + dt * 2.5); o.x -= o.vel * dt; if (o.x < fim) { o.x = inicio + i * 14 + Math.random() * 30; o.estado = 'chegando'; o.vel = 8 } }
      // não encosta no da frente na mesma faixa
      const frente = termi.frota.filter((x) => x !== o && x.faixa === o.faixa && x.x < o.x).sort((a, b) => b.x - a.x)[0]
      if (frente && o.x - frente.x < (frente.comp + o.comp) / 2 + 3) o.x = frente.x + (frente.comp + o.comp) / 2 + 3
      o.b.position.set(o.x, 0, o.faixa)
    })
  }
  return { grupo, tick }
}
