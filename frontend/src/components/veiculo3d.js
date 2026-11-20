import * as THREE from 'three'

// Veículo dirigível no mapa 3D a partir de um avatar .glb (espécie "veículo").
//
// Rodas: os modelos importados costumam ser uma malha só. Aqui as rodas são SEPARADAS da carroceria pela geometria
// (triângulos dentro do círculo de cada roda, na faixa externa da lateral) e ganham um pivô próprio: giram com a
// velocidade e as da frente esterçam (Ackermann). Se não der para achar, usa rodas desenhadas por código.
//
// Física (modelo de bicicleta com 2 eixos, passo fixo de 1/120 s):
// - motor com curva de torque, limitador de giro, câmbio automático com tempo de troca, embreagem na saída, ré;
// - pneus com fórmula mágica simplificada (Pacejka: pico de aderência ~7°), círculo de atrito (acelerar ou frear
//   numa curva tira aderência lateral), carga por eixo com transferência de peso (frear carrega a frente);
// - freio com ABS, controle de tração, freio de mão travando a traseira (derrapagem), arrasto aerodinâmico e de
//   rolagem, velocidade máxima pela potência e pelo arrasto;
// - abaixo de ~3 m/s mistura com o modelo cinemático (manobra devagar sem tremer);
// - colisão da caixa do carro com os lotes da cidade, o pódio do prédio e o limite: empurra para fora, devolve parte
//   da velocidade (restituição) e dá um giro pelo ponto de contato;
// - carroceria inclina no eixo (mergulho ao frear, agachar ao acelerar, rolagem na curva) por mola + amortecedor;
// - câmbio AUTOMÁTICO (P/R/N/D): troca cedo com pouco pé e tarde com o pé no fundo, reduz para ultrapassar (kickdown) e não
//   corta a força na troca (conversor de torque);
// - controle de estabilidade (ESC): compara o giro do carro com o que o volante pede e corrige a derrapagem antes de rodar,
//   como os carros de rua; a direção fica mais leve e com menos ângulo em velocidade;
// - elétrico: uma marcha, força máxima desde parado até o limite de potência; nitro (Shift): 2,2x a potência por ~4 s;
// - moto: inclina para dentro da curva; propulsores (carro elétrico com `voar`): decola, paira, sobe e desce.

const G = 9.81

export const FISICA_PADRAO = { massa: 1400, potencia: 520, aderencia: 1.1, freio: 1.1, velmax: 330, marchas: 8, direcao: 32, suspensao: 1, cg: 0.42, tracao: 'traseira', inverter: 0,
  comprimento: 0, esc: 1, nitro: 1, eletrico: 0, voar: 0, duasRodas: 0 }

function separarRodas(modelo) {
  // geometria única no espaço da raiz (o modelo já vem centrado, pés em y = 0)
  modelo.updateMatrixWorld(true)
  const malhas = []
  modelo.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) malhas.push(o) })
  if (malhas.length !== 1) return null   // várias malhas: o modelo já tem peças, deixa como está
  const m = malhas[0]
  const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
  g.applyMatrix4(m.matrixWorld)
  g.computeBoundingBox()
  const bb = g.boundingBox, L = bb.max.z - bb.min.z, W = bb.max.x - bb.min.x
  if (L < W * 1.4) return null   // não parece um carro (comprimento em z)
  const pos = g.attributes.position
  const r = THREE.MathUtils.clamp(0.074 * L, 0.24, 0.48)
  // centro de cada roda: contato com o chão (vértices bem baixos) em cada quadrante
  const centros = []
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    let soma = 0, n = 0, xmax = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      if (y > bb.min.y + r * 0.35 || Math.sign(x) !== sx || Math.sign(z) !== sz || Math.abs(z) < L * 0.18) continue
      soma += z; n++; xmax = Math.max(xmax, Math.abs(x))
    }
    if (n < 6) return null
    centros.push({ sx, sz, x: sx * Math.max(W * 0.3, xmax - 0.11), y: bb.min.y + r, z: soma / n })
  }
  const uv = g.attributes.uv, nor = g.attributes.normal
  const corpo = { p: [], n: [], u: [] }, rodas = centros.map(() => ({ p: [], n: [], u: [] }))
  const tri = (dst, i0) => { for (let k = 0; k < 3; k++) { const i = i0 + k; dst.p.push(pos.getX(i), pos.getY(i), pos.getZ(i)); if (nor) dst.n.push(nor.getX(i), nor.getY(i), nor.getZ(i)); if (uv) dst.u.push(uv.getX(i), uv.getY(i)) } }
  const faixa = W / 2 - 0.34
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    let alvo = corpo
    if (Math.abs(cx) > faixa) {
      for (let k = 0; k < centros.length; k++) {
        const c = centros[k]
        if (Math.sign(cx) === c.sx && Math.hypot(cy - c.y, cz - c.z) < r * 1.04) { alvo = rodas[k]; break }
      }
    }
    tri(alvo, i)
  }
  if (rodas.some((x) => x.p.length < 9 * 25)) return null   // poucas faces numa roda: a separação não confiável
  const montar = (d, desloc) => {
    const ng = new THREE.BufferGeometry()
    const p = new Float32Array(d.p); if (desloc) for (let i = 0; i < p.length; i += 3) { p[i] -= desloc.x; p[i + 1] -= desloc.y; p[i + 2] -= desloc.z }
    ng.setAttribute('position', new THREE.BufferAttribute(p, 3))
    if (d.n.length) ng.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3)); else ng.computeVertexNormals()
    if (d.u.length) ng.setAttribute('uv', new THREE.Float32BufferAttribute(d.u, 2))
    return ng
  }
  return { material: m.material, corpo: montar(corpo), rodas: rodas.map((d, k) => ({ geo: montar(d, centros[k]), ...centros[k] })), r, L, W, H: bb.max.y - bb.min.y }
}

function rodaDesenhada(r, larg) {
  const g = new THREE.Group()
  const pneu = new THREE.Mesh(new THREE.CylinderGeometry(r, r, larg, 24), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }))
  pneu.rotation.z = Math.PI / 2; g.add(pneu)
  const aro = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, larg * 1.02, 12), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.35 }))
  aro.rotation.z = Math.PI / 2; g.add(aro)
  return g
}

export function criarVeiculo(gltfCena, fisicaCfg = {}) {
  const F = { ...FISICA_PADRAO, ...fisicaCfg }
  const modelo = gltfCena
  // normaliza: centrado, no chão, comprimento em z e frente para +z
  const bb0 = new THREE.Box3().setFromObject(modelo), s0 = bb0.getSize(new THREE.Vector3()), c0 = bb0.getCenter(new THREE.Vector3())
  const giro = new THREE.Group(); giro.add(modelo)
  modelo.position.set(-c0.x, -bb0.min.y, -c0.z)
  if (s0.x > s0.z * 1.2) giro.rotation.y = Math.PI / 2   // modelo deitado no eixo x
  if (F.inverter) giro.rotation.y += Math.PI
  const base = new THREE.Group(); base.add(giro)
  // modelos gerados por IA vêm com ~1 m: escala para o comprimento real (cadastrado ou 4,5 m quando parece miniatura)
  base.updateMatrixWorld(true)
  const s1 = new THREE.Box3().setFromObject(base).getSize(new THREE.Vector3())
  const alvoL = F.comprimento > 0 ? F.comprimento : s1.z < 2 ? 4.5 : 0
  if (alvoL) base.scale.setScalar(alvoL / Math.max(0.01, s1.z))
  base.updateMatrixWorld(true)
  const sep = F.duasRodas ? null : separarRodas(base)
  const raiz = new THREE.Group()          // posição e rumo no mundo
  const corpo = new THREE.Group()         // inclinação (mola/amortecedor)
  raiz.add(corpo)
  let rodas, r, L, W, H
  if (sep) {
    const mesh = new THREE.Mesh(sep.corpo, sep.material); mesh.castShadow = true; mesh.receiveShadow = true; corpo.add(mesh)
    r = sep.r; L = sep.L; W = sep.W; H = sep.H
    rodas = sep.rodas.map((x) => {
      const piv = new THREE.Group(); piv.position.set(x.x, x.y, x.z)
      const giraR = new THREE.Group(); piv.add(giraR)
      const m = new THREE.Mesh(x.geo, sep.material); m.castShadow = true; giraR.add(m)
      raiz.add(piv)   // rodas fora do corpo: não inclinam junto com a carroceria
      return { piv, gira: giraR, frente: x.sz > 0, esq: x.sx > 0, x: x.x, z: x.z, y0: x.y }
    })
  } else {
    const bb = new THREE.Box3().setFromObject(base), s = bb.getSize(new THREE.Vector3())
    L = s.z; W = s.x; H = s.y; r = THREE.MathUtils.clamp(0.074 * L, 0.24, 0.48)
    base.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
    base.position.y = 0.04; corpo.add(base)
    rodas = []
    if (F.duasRodas) {   // moto: as rodas já estão no modelo; pivôs vazios marcam os eixos para a física
      for (const sz of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(0, r, sz * L * 0.36); const giraR = new THREE.Group(); piv.add(giraR); raiz.add(piv); rodas.push({ piv, gira: giraR, frente: sz > 0, esq: false, x: 0.35, z: sz * L * 0.36, y0: r }) }
    } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const piv = new THREE.Group(); const x = sx * (W / 2 - 0.12), z = sz * L * 0.33
      piv.position.set(x, r, z); const giraR = new THREE.Group(); piv.add(giraR); giraR.add(rodaDesenhada(r, 0.22)); raiz.add(piv)
      rodas.push({ piv, gira: giraR, frente: sz > 0, esq: sx > 0, x, z, y0: r })
    }
  }
  // propulsores (só aparecem voando): chama azul embaixo de cada canto + luz
  const jatos = []
  if (F.voar) {
    const matJ = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    const matN = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 })
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(sx * W * 0.32, 0.18, sz * L * 0.3)
      const bocal = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.16, 16), matN); g.add(bocal)
      const chama = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.2, 14, 1, true), matJ); chama.rotation.x = Math.PI; chama.position.y = -0.68; g.add(chama)
      g.visible = false; corpo.add(g); jatos.push({ g, chama })
    }
    const luz = new THREE.PointLight(0x7dd3fc, 0, 9, 2); luz.position.y = -0.4; corpo.add(luz); jatos.luz = luz
  }
  const zf = Math.max(...rodas.filter((x) => x.frente).map((x) => x.z)), zr = Math.min(...rodas.filter((x) => !x.frente).map((x) => x.z))
  const entre = Math.max(1.6, zf - zr), a = zf, b = -zr          // distância do centro de massa (origem) aos eixos
  const bitola = Math.max(1.2, Math.abs(rodas[0].x) * 2)
  const m = F.massa, Iz = (m * (L * L + W * W)) / 12 * 0.9
  const potW = F.potencia * 735.5, VMAX = F.velmax / 3.6
  const IDLE = 900, LIMITE = 7600
  const curva = (rpm) => { const k = THREE.MathUtils.clamp((rpm - IDLE) / (LIMITE - IDLE), 0, 1); return 0.72 + 0.5 * k - 0.36 * k * k }   // sobe e cai perto do limite
  let melhor = 0
  for (let rpm = IDLE; rpm <= LIMITE; rpm += 50) melhor = Math.max(melhor, curva(rpm) * rpm * (2 * Math.PI / 60))
  const Tpico = potW / melhor
  const n = Math.round(F.marchas)
  const g1 = 3.4, gN = 0.78
  const relacoes = Array.from({ length: n }, (_, i) => g1 * Math.pow(gN / g1, i / Math.max(1, n - 1)))
  const ELET = !!F.eletrico, RPM_ELET = 18000
  const diferencial = (LIMITE * 2 * Math.PI / 60 * r) / (gN * VMAX * 1.02)
  const CdA = (2 * potW * 0.82) / (1.2 * VMAX ** 3)   // arrasto que fecha a conta da velocidade máxima com a potência
  const mu = F.aderencia, h = F.cg
  const kSusp = 9 * F.suspensao, cSusp = 2 * Math.sqrt(kSusp) * 0.55

  const S = {
    x: 0, z: 0, psi: 0, vx: 0, vy: 0, w: 0, delta: 0, marcha: 1, re: false, rpm: IDLE, troca: 0, ax: 0, ay: 0,
    pitch: 0, vPitch: 0, roll: 0, vRoll: 0, giroRoda: 0, girandoRe: 0, patinaT: 0, deslize: 0, travou: false, batida: 0,
    abs: false, tcs: false, freioMao: false, paradoRe: 0, esc: false, nitro: 1, nitroOn: false,
    voando: false, y: 0, vUp: 0, dobra: 0, pouso: 0,
  }
  const ent = { acel: 0, freio: 0, dir: 0, mao: false, nitro: false, subir: false, descer: false }
  const pac = (alfa, Fz) => mu * Fz * Math.sin(1.35 * Math.atan(9.5 * alfa - 0.6 * (9.5 * alfa - Math.atan(9.5 * alfa))))

  function passo(dt, colide) {
    const v = Math.hypot(S.vx, S.vy)
    // direção: menos ângulo e mais devagar em velocidade alta (como um carro de verdade), mas sem travar a curva:
    // antes, a 100 km/h sobrava 1/4 do volante e virar era difícil. Volta ao centro mais rápido do que vira.
    const vf = Math.max(0, Math.abs(S.vx))
    const maxD = THREE.MathUtils.degToRad(F.direcao) / (1 + vf / (F.duasRodas ? 28 : 22))
    const voltando = ent.dir === 0 || Math.sign(ent.dir) !== Math.sign(S.delta)
    const taxa = (voltando ? 4.2 : 3.2) / (1 + vf / 45)
    S.delta += THREE.MathUtils.clamp(ent.dir * maxD - S.delta, -taxa * dt, taxa * dt)
    // pedal: W acelera; S freia e, parado, engata a ré (aí W freia)
    let acel = ent.acel, freio = ent.freio
    if (!S.re && freio > 0 && acel === 0 && Math.abs(S.vx) < 0.4) { S.paradoRe += dt; if (S.paradoRe > 0.35) { S.re = true; S.paradoRe = 0 } } else if (!S.re) S.paradoRe = 0
    if (S.re) {
      if (acel > 0 && S.vx > -0.4 && freio === 0) { S.re = false; S.marcha = 1 } else { const t = freio; freio = acel; acel = t }
    }
    // nitro: +60% de potência enquanto houver carga (recarrega devagar)
    S.nitroOn = !!(F.nitro && ent.nitro && acel > 0 && S.nitro > 0.02 && !S.re)
    S.nitro = THREE.MathUtils.clamp(S.nitro + (S.nitroOn ? -dt / 4 : dt / 18), 0, 1)
    const boost = S.nitroOn ? 2.2 : 1
    let Fmotor
    if (ELET) {   // elétrico: força máxima desde parado (limitada pela aderência) até a curva de potência
      const vAbs = Math.max(1, Math.abs(S.vx))
      Fmotor = acel * Math.min(mu * m * G * 0.95, (potW * boost * 0.92) / vAbs) * (Math.abs(S.vx) > VMAX * (S.nitroOn ? 1.35 : 1) ? 0 : 1) * (S.re ? -0.4 : 1)
      S.rpm += (Math.min(RPM_ELET, (Math.abs(S.vx) / VMAX) * RPM_ELET) - S.rpm) * Math.min(1, dt * 10)
    } else {
      // câmbio automático: troca para cima mais cedo com pouco pé, mais tarde com o pé no fundo; kickdown ao afundar
      const g = S.re ? 3.2 : relacoes[S.marcha - 1]
      const rpmRoda = Math.abs(S.vx) / r * g * diferencial * 60 / (2 * Math.PI)
      let rpm = Math.max(IDLE, rpmRoda)
      if (acel > 0 && rpmRoda < 2400) rpm = Math.max(rpm, IDLE + (2400 - IDLE) * acel)   // conversor de torque na saída
      if (S.troca > 0) S.troca -= dt
      if (!S.re && S.troca <= 0) {
        const sobe = LIMITE * (0.5 + 0.43 * acel), desce = LIMITE * (acel > 0.9 ? 0.5 : 0.28)
        if (rpmRoda > sobe && S.marcha < n) { S.marcha++; S.troca = 0.16 }
        else if (rpmRoda < desce && S.marcha > 1) { S.marcha--; S.troca = 0.12 }
      }
      S.rpm += (Math.min(LIMITE + 150, rpm) - S.rpm) * Math.min(1, dt * 12)
      const cortou = rpmRoda > LIMITE
      const Tm = cortou ? 0 : Tpico * curva(S.rpm) * acel * boost * (S.troca > 0 ? 0.45 : 1)   // a troca não corta a força
      Fmotor = (Tm * g * diferencial * 0.88) / r * (S.re ? -1 : 1)
    }
    // cargas por eixo com transferência de peso longitudinal
    const Fzf = Math.max(0.15 * m * G, (m * G * b) / entre - (m * S.ax * h) / entre)
    const Fzr = Math.max(0.15 * m * G, (m * G * a) / entre + (m * S.ax * h) / entre)
    const tr = F.tracao, ff = tr === 'dianteira' ? 1 : tr === '4x4' ? 0.4 : 0, fr = 1 - ff
    // controle de tração: não passa da aderência do eixo que puxa; em curva, só até 80% (sobra aderência lateral).
    // 4x4 (40/60): o limite é o do eixo que patina primeiro
    const eixo = ff && fr ? Math.min((mu * 0.96 * Fzf) / ff, (mu * 1.06 * Fzr) / fr) : ff ? mu * 0.96 * Fzf : mu * 1.06 * Fzr
    const limTr = eixo * (1 - 0.2 * Math.min(1, Math.abs(S.delta) / 0.08))
    S.tcs = Math.abs(Fmotor) > limTr * 1.02
    if (S.tcs) Fmotor = Math.sign(Fmotor) * limTr
    // freios (ABS limita ao que o pneu aguenta) e freio de mão na traseira
    const sentido = Math.sign(S.vx) || 0
    let Ffreio = freio * F.freio * m * G
    const limF = mu * (Fzf + Fzr) * 0.98
    S.abs = Ffreio > limF && v > 2
    Ffreio = Math.min(Ffreio, limF)
    S.freioMao = ent.mao
    const Fmao = ent.mao ? mu * Fzr * 0.85 : 0
    const Farrasto = 0.5 * 1.2 * CdA * S.vx * Math.abs(S.vx) + 0.012 * m * G * sentido
    // forças longitudinais por eixo
    let Fxf = Fmotor * ff - Ffreio * 0.64 * sentido
    let Fxr = Fmotor * fr - Ffreio * 0.36 * sentido - Fmao * sentido
    if (Math.abs(S.vx) < 0.3 && acel === 0) { Fxf = 0; Fxr = 0; if (freio > 0 || ent.mao || Math.abs(S.vx) < 0.05) S.vx *= 0.8 }
    // ângulos de deriva e forças laterais (círculo de atrito: o que sobra depois do longitudinal)
    const vxs = Math.max(Math.abs(S.vx), 0.5)
    const af = Math.atan2(S.vy + a * S.w, vxs) - S.delta * Math.sign(S.vx || 1)
    const ar = Math.atan2(S.vy - b * S.w, vxs)
    // acerto "sai de frente" como nos carros de rua: traseira com um pouco mais de aderência que a dianteira
    const muF = 0.97, muR = 1.12 * (ent.mao ? 0.5 : 1)
    const capF = Math.sqrt(Math.max(0, (mu * muF * Fzf) ** 2 - Fxf ** 2)), capR = Math.sqrt(Math.max(0, (mu * muR * Fzr) ** 2 - Fxr ** 2))
    const Fyf = -THREE.MathUtils.clamp(pac(af, Fzf) * muF, -capF, capF)
    const Fyr = -THREE.MathUtils.clamp(pac(ar, Fzr) * muR, -capR, capR)
    const cd = Math.cos(S.delta), sd = Math.sin(S.delta)
    let ax = (Fxr + Fxf * cd - Fyf * sd - Farrasto) / m + S.vy * S.w
    let ay = (Fyr + Fyf * cd + Fxf * sd) / m - S.vx * S.w
    let aw = (a * (Fyf * cd + Fxf * sd) - b * Fyr) / Iz
    // ESC: o giro que o volante pede (limitado pela aderência) contra o giro real; derrapando, corrige o giro, tira
    // a força do motor e segura o deslize lateral (o carro de rua faz isso freando uma roda de cada vez)
    S.esc = false
    if (F.esc && !ent.mao && v > 4) {
      const wMax = (mu * G * 0.9) / Math.max(v, 1)
      const wDes = THREE.MathUtils.clamp((S.vx * Math.tan(S.delta)) / entre, -wMax, wMax)
      const erro = S.w - wDes, beta = Math.atan2(S.vy, Math.abs(S.vx))
      if (Math.abs(erro) > 0.04 || Math.abs(beta) > 0.06) {
        S.esc = true
        aw -= erro * 9
        ay -= S.vy * 4 * Math.min(1, Math.abs(beta) / 0.06)
        if (acel > 0 && Fmotor !== 0) ax -= (Fmotor * 0.5) / m
      }
    }
    // devagar: modelo cinemático (sem as derivas, que divergem perto de zero)
    const k = THREE.MathUtils.clamp((v - 1.5) / 3, 0, 1)
    S.vx += ax * dt
    const vLim = VMAX * (S.nitroOn ? 1.35 : 1.05)
    if (Math.abs(S.vx) > vLim) S.vx = Math.sign(S.vx) * vLim
    const wKin = (S.vx * Math.tan(S.delta)) / entre
    S.vy = k * (S.vy + ay * dt) + (1 - k) * 0
    S.w = k * (S.w + aw * dt) + (1 - k) * wKin
    S.ax += (ax - S.ax) * Math.min(1, dt * 8); S.ay += (ay + S.vx * S.w - S.ay) * Math.min(1, dt * 8)
    S.deslize = Math.max(Math.abs(ar), Math.abs(af) * 0.8) * (v > 3 ? 1 : 0)
    S.travou = ent.mao && v > 2
    S.girandoRe = S.tcs && acel > 0.6 ? 1 : 0
    // integra no mundo: frente = (sen ψ, cos ψ), esquerda = (cos ψ, −sen ψ)
    S.psi += S.w * dt
    const sp = Math.sin(S.psi), cp = Math.cos(S.psi)
    const vxw = S.vx * sp + S.vy * cp, vzw = S.vx * cp - S.vy * sp
    let nx = S.x + vxw * dt, nz = S.z + vzw * dt
    const toque = colide ? colide(nx, nz, S.psi, L, W) : null
    if (toque) {
      nx += toque.px; nz += toque.pz
      const nl = Math.hypot(toque.px, toque.pz) || 1, nnx = toque.px / nl, nnz = toque.pz / nl
      const vn = vxw * nnx + vzw * nnz
      if (vn < 0) {
        const e = 0.22, vx2 = vxw - (1 + e) * vn * nnx, vz2 = vzw - (1 + e) * vn * nnz
        const atr = 0.82
        S.vx = (vx2 * sp + vz2 * cp) * atr; S.vy = (vx2 * cp - vz2 * sp) * atr
        S.w = S.w * 0.5 + (toque.braco || 0) * vn * 0.25
        S.batida = Math.max(S.batida, Math.min(1, Math.abs(vn) / 12))
      }
    }
    S.x = nx; S.z = nz
    // carroceria: mergulho/agachar e rolagem (mola + amortecedor)
    const alvoP = THREE.MathUtils.clamp(-S.ax * 0.0065 * h / 0.45, -0.07, 0.07), alvoR = THREE.MathUtils.clamp(S.ay * 0.0075 * h / 0.45, -0.09, 0.09)
    S.vPitch += (kSusp * (alvoP - S.pitch) - cSusp * S.vPitch) * dt; S.pitch += S.vPitch * dt
    if (F.duasRodas) S.roll += (THREE.MathUtils.clamp(-Math.atan((S.vx * S.w) / G), -0.75, 0.75) - S.roll) * Math.min(1, dt * 6)   // moto inclina para dentro
    else { S.vRoll += (kSusp * (alvoR - S.roll) - cSusp * S.vRoll) * dt; S.roll += S.vRoll * dt }
    S.giroRoda += (S.vx / r) * dt
  }

  // voo com propulsores: empuxo para a frente, paira sozinho (segura a altitude sem tecla), sobe/desce, vira inclinando
  const VMAX_VOO = 105, ALTO = 38   // m/s (~380 km/h); acima de ALTO metros não bate em prédio
  function passoVoo(dt, colide) {
    const sp = Math.sin(S.psi), cp = Math.cos(S.psi)
    const ligado = S.voando
    const empuxo = ligado ? ent.acel * 1.15 * G * (S.nitroOn ? 1.5 : 1) : 0
    S.nitroOn = !!(ligado && ent.nitro && ent.acel > 0 && S.nitro > 0.02); S.nitro = THREE.MathUtils.clamp(S.nitro + (S.nitroOn ? -dt / 4 : dt / 18), 0, 1)
    const arrasto = (G * 1.15 * (S.vx * Math.abs(S.vx))) / (VMAX_VOO * VMAX_VOO)
    S.vx += (empuxo - arrasto - (ligado ? ent.freio * 0.9 * G * Math.sign(S.vx) : 0)) * dt
    if (Math.abs(S.vx) < 0.3 && ent.acel === 0) S.vx *= 0.9
    S.vy *= Math.exp(-3 * dt)   // os propulsores laterais seguram o deslize
    const wAlvo = ligado ? ent.dir * 1.3 / (1 + Math.abs(S.vx) / 70) : 0
    S.w += (wAlvo - S.w) * Math.min(1, dt * 3)
    // vertical: com os propulsores ligados a gravidade é compensada e a altitude fica parada sem tecla
    const alvoUp = ent.subir ? 9 : ent.descer ? -7 : 0
    if (ligado) S.vUp += (alvoUp - S.vUp) * Math.min(1, dt * 2.2); else S.vUp -= G * dt
    S.y += S.vUp * dt
    if (S.y <= 0) { if (S.vUp < -7) S.batida = Math.max(S.batida, Math.min(1, -S.vUp / 20)); S.y = 0; S.vUp = Math.max(0, S.vUp); if (!ligado) { S.vx *= Math.exp(-1.5 * dt); S.pouso = 1 } }
    if (S.y > 400) { S.y = 400; S.vUp = Math.min(0, S.vUp) }
    S.psi += S.w * dt
    let nx = S.x + (S.vx * sp + S.vy * cp) * dt, nz = S.z + (S.vx * cp - S.vy * sp) * dt
    const toque = colide && S.y < ALTO ? colide(nx, nz, S.psi, L, W) : null
    if (toque) { nx += toque.px; nz += toque.pz; S.batida = Math.max(S.batida, Math.min(1, Math.abs(S.vx) / 25)); S.vx *= -0.2 }
    S.x = nx; S.z = nz
    S.pitch += (THREE.MathUtils.clamp(-ent.acel * 0.12 + ent.freio * 0.1 - S.vUp * 0.012, -0.25, 0.25) - S.pitch) * Math.min(1, dt * 3)
    S.roll += (THREE.MathUtils.clamp(-S.w * Math.abs(S.vx) * 0.02, -0.6, 0.6) - S.roll) * Math.min(1, dt * 3)
    S.rpm = Math.abs(S.vx) / VMAX_VOO * RPM_ELET
    S.giroRoda += 0; S.esc = S.abs = S.tcs = false; S.deslize = 0; S.travou = false; S.girandoRe = 0
  }

  function atualizar(dt, colide, yBase) {
    let resto = Math.min(dt, 0.1)
    const noAr = S.voando || S.y > 0.01
    while (resto > 1e-4) { const h2 = Math.min(1 / 120, resto); if (noAr) passoVoo(h2, colide); else passo(h2, colide); resto -= h2 }
    if (!S.voando && S.y <= 0.01 && S.pouso) { S.pouso = 0; S.vy = 0; S.w = 0 }
    // rodas recolhem (giram 90°) ao decolar e voltam ao pousar
    S.dobra += ((S.voando ? 1 : 0) - S.dobra) * Math.min(1, dt * 2.5)
    const flutua = S.voando ? Math.sin(performance.now() / 380) * 0.05 * Math.min(1, S.y) : 0
    raiz.position.set(S.x, yBase + S.y + flutua, S.z); raiz.rotation.y = S.psi
    corpo.rotation.set(S.pitch, 0, S.roll)
    if (jatos.length) {
      const on = S.voando || S.dobra > 0.05
      for (const j of jatos) { j.g.visible = on; j.chama.scale.set(1, 0.6 + 0.5 * Math.max(ent.subir ? 1 : 0, ent.acel) + Math.random() * 0.25 + (S.nitroOn ? 0.6 : 0), 1) }
      jatos.luz.intensity = on ? 2.5 + (S.nitroOn ? 2 : 0) : 0
    }
    // Ackermann: a roda de dentro da curva vira mais
    const tanD = Math.tan(S.delta)
    for (const w of rodas) {
      if (w.frente && Math.abs(S.delta) > 1e-4) {
        const R = entre / tanD, dentro = (R > 0) === w.esq
        w.piv.rotation.y = Math.atan(entre / (R - (w.esq ? 1 : -1) * bitola / 2)) * (dentro ? 1 : 1)
      } else if (w.frente) w.piv.rotation.y = 0
      w.gira.rotation.x = S.giroRoda * (w.frente ? 1 : 1) + (!w.frente && S.girandoRe ? performance.now() / 40 : 0)
      w.piv.rotation.z = (w.esq ? 1 : -1) * S.dobra * Math.PI / 2   // voando: roda deitada, como num carro voador
      w.piv.position.y = w.y0 + S.dobra * 0.05
    }
    S.batida *= Math.pow(0.02, dt)
  }

  return {
    raiz, S, ent, F, dims: { L, W, H, r, entre, bitola },
    rodasTraseiras: () => rodas.filter((w) => !w.frente).map((w) => w.piv.getWorldPosition(new THREE.Vector3())),
    atualizar,
    colocar(x, z, psi) { S.x = x; S.z = z; S.psi = psi; S.vx = S.vy = S.w = 0; S.delta = 0; S.marcha = 1; S.re = false; S.pitch = S.roll = 0; S.y = 0; S.vUp = 0; S.voando = false },
    // propulsores: liga/desliga o voo (só no veículo com `voar`); desligar no ar = cai
    propulsores() { if (!F.voar) return null; S.voando = !S.voando; if (S.voando) { S.vUp = Math.max(S.vUp, 4); S.re = false } return S.voando },
    hud() {
      const parado = Math.abs(S.vx) < 0.2 && ent.acel === 0 && S.y < 0.01
      const pos = S.re ? 'R' : parado && (ent.mao || S.freioMao) ? 'P' : parado ? 'N' : 'D'
      return { kmh: Math.round(Math.hypot(S.vx, S.voando ? S.vUp : 0) * 3.6), rpm: Math.round(S.rpm), limite: ELET || S.voando ? RPM_ELET : LIMITE,
        marcha: pos === 'D' && !ELET && !S.voando ? `D${S.marcha}` : pos, abs: S.abs, tcs: S.tcs, esc: S.esc, mao: S.freioMao, deslize: S.deslize,
        nitro: F.nitro ? S.nitro : null, nitroOn: S.nitroOn, voar: !!F.voar, voando: S.voando, alt: Math.round(S.y), eletrico: ELET }
    },
  }
}

// colisão da caixa do carro (orientada) com retângulos alinhados (lotes, pódio) e com o limite da cidade
export function colisorCidade(cid) {
  return (x, z, psi, L, W) => {
    const sp = Math.sin(psi), cp = Math.cos(psi)
    const hl = L / 2 - 0.05, hw = W / 2 - 0.05
    const pts = []
    for (const [u, v] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [hl, 0], [-hl, 0], [0, hw], [0, -hw]]) pts.push([x + u * sp + v * cp, z + u * cp - v * sp, u])
    let px = 0, pz = 0, braco = 0
    const rets = [...(cid.obstaculos || []), cid.podio].filter(Boolean)
    for (const [qx, qz, u] of pts) {
      for (const o of rets) {
        if (qx <= o[0] || qx >= o[2] || qz <= o[1] || qz >= o[3]) continue
        const opts = [[o[0] - qx, 0], [o[2] - qx, 0], [0, o[1] - qz], [0, o[3] - qz]]
        const [dx, dz] = opts.reduce((m2, c) => (Math.abs(c[0] + c[1]) < Math.abs(m2[0] + m2[1]) ? c : m2))
        if (Math.abs(dx) > Math.abs(px)) px = dx
        if (Math.abs(dz) > Math.abs(pz)) pz = dz
        braco = u
      }
      const Lm = cid.limite
      if (Lm) {
        if (qx < Lm[0]) px = Math.max(px, Lm[0] - qx); if (qx > Lm[2]) px = Math.min(px, Lm[2] - qx)
        if (qz < Lm[1]) pz = Math.max(pz, Lm[1] - qz); if (qz > Lm[3]) pz = Math.min(pz, Lm[3] - qz)
      }
    }
    return px || pz ? { px, pz, braco } : null
  }
}

// som do carro: motor (duas ondas pelo giro, filtro que abre com o acelerador), pneu cantando, batida e buzina
export function criarSom() {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  const ac = new Ctx()
  const mestre = ac.createGain(); mestre.gain.value = 0.55; mestre.connect(ac.destination)
  const filtro = ac.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 600; filtro.Q.value = 3; filtro.connect(mestre)
  const gm = ac.createGain(); gm.gain.value = 0; gm.connect(filtro)
  const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.connect(gm); o1.start()
  const o2 = ac.createOscillator(); o2.type = 'square'; const g2 = ac.createGain(); g2.gain.value = 0.35; o2.connect(g2); g2.connect(gm); o2.start()
  const ruido = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = ruido.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const fonte = ac.createBufferSource(); fonte.buffer = ruido; fonte.loop = true
  const banda = ac.createBiquadFilter(); banda.type = 'bandpass'; banda.frequency.value = 1500; banda.Q.value = 6
  const gp = ac.createGain(); gp.gain.value = 0; fonte.connect(banda); banda.connect(gp); gp.connect(mestre); fonte.start()
  let buzina = null
  return {
    atualizar(h, acel) {
      const t = ac.currentTime
      if (h.eletrico || h.voando) {   // elétrico: zunido agudo que sobe com a velocidade; voando, mais o sopro dos jatos
        if (o1.type !== 'sine') { o1.type = 'sine'; o2.type = 'triangle' }
        o1.frequency.setTargetAtTime(180 + h.rpm / 22, t, 0.05); o2.frequency.setTargetAtTime(90 + h.rpm / 60, t, 0.05)
        filtro.frequency.setTargetAtTime(900 + acel * 1800, t, 0.05)
        gm.gain.setTargetAtTime(0.025 + acel * 0.05, t, 0.05)
        gp.gain.setTargetAtTime(h.voando ? 0.08 + acel * 0.1 + (h.nitroOn ? 0.08 : 0) : 0, t, 0.08)
        banda.frequency.setTargetAtTime(h.voando ? 450 : 1500, t, 0.1)
        return
      }
      if (o1.type !== 'sawtooth') { o1.type = 'sawtooth'; o2.type = 'square'; banda.frequency.value = 1500 }
      const f = Math.max(30, (h.rpm / 60) * 4)   // V8: 4 explosões por volta
      o1.frequency.setTargetAtTime(f, t, 0.03); o2.frequency.setTargetAtTime(f * 0.5, t, 0.03)
      filtro.frequency.setTargetAtTime(350 + acel * 2200 + h.rpm * 0.08, t, 0.05)
      gm.gain.setTargetAtTime(0.05 + acel * 0.09, t, 0.05)
      gp.gain.setTargetAtTime(Math.min(0.22, Math.max(0, h.deslize - 0.12) * 0.9 + (h.mao && h.kmh > 8 ? 0.12 : 0)), t, 0.05)
    },
    batida(forca) {
      const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = ruido
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500
      const g = ac.createGain(); g.gain.setValueAtTime(Math.min(0.8, forca), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      s.connect(lp); lp.connect(g); g.connect(mestre); s.start(t); s.stop(t + 0.4)
    },
    buzinar(ligar) {
      if (ligar && !buzina) {
        const g = ac.createGain(); g.gain.value = 0.12; g.connect(mestre)
        const a1 = ac.createOscillator(), a2 = ac.createOscillator(); a1.type = a2.type = 'square'; a1.frequency.value = 415; a2.frequency.value = 500
        a1.connect(g); a2.connect(g); a1.start(); a2.start(); buzina = { a1, a2, g }
      } else if (!ligar && buzina) { buzina.a1.stop(); buzina.a2.stop(); buzina.g.disconnect(); buzina = null }
    },
    fechar() { try { ac.close() } catch { /* já fechado */ } },
  }
}

// marcas de pneu no asfalto (instâncias num anel: as mais velhas somem primeiro)
export function criarMarcas(N = 900) {
  const geo = new THREE.PlaneGeometry(0.2, 0.32); geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const im = new THREE.InstancedMesh(geo, mat, N); im.count = 0; im.frustumCulled = false
  let i = 0
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0)
  return {
    malha: im,
    marcar(p, psi, y) {
      q.setFromAxisAngle(up, psi); m.compose(new THREE.Vector3(p.x, y + 0.035, p.z), q, s)
      im.setMatrixAt(i, m); i = (i + 1) % N; im.count = Math.min(N, im.count + 1); im.instanceMatrix.needsUpdate = true
    },
  }
}
