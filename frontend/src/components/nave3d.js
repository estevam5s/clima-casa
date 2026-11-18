import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Nave para voar pelo universo do globo: foguete de aço inox no estilo das naves reutilizáveis de hoje (corpo
// cilíndrico de 9 m por 50 m na proporção, nariz em ogiva, escudo térmico de placas hexagonais pretas no lado de baixo,
// 2 aletas dianteiras e 2 traseiras articuladas e 6 motores: 3 centrais que giram e 3 de vácuo com sino maior).
// Desenhada aqui, sem logotipos nem marcas. Eixo: comprimento em Z, nariz para -Z (frente), barriga (escudo) para -Y.
function texturaPlacas() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512
  const g = c.getContext('2d')
  g.fillStyle = '#16181c'; g.fillRect(0, 0, 512, 512)
  const r = 9, h = Math.sqrt(3) * r
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let y = -h; y < 512 + h; y += h) for (let x = -r * 3, k = 0; x < 512 + r * 3; x += r * 1.5, k++) {
    const cy = y + (k % 2 ? h / 2 : 0), v = 18 + Math.floor(rnd() * 16)
    g.beginPath(); for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.lineTo(x + Math.cos(t) * (r - 0.9), cy + Math.sin(t) * (r - 0.9)) }
    g.closePath(); g.fillStyle = `rgb(${v},${v + 1},${v + 3})`; g.fill()
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}
function texturaInox() {   // aço escovado: listras finas no comprimento + painéis de solda
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024
  const g = c.getContext('2d')
  g.fillStyle = '#7d7d7d'; g.fillRect(0, 0, 256, 1024)
  let s = 3; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < 900; i++) { const v = 100 + Math.floor(rnd() * 70); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 256, 0, 0.6 + rnd(), 1024) }
  for (let y = 0; y < 1024; y += 128) { g.fillStyle = '#b5b5b5'; g.fillRect(0, y, 256, 2) }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

export function criarNave(renderer) {
  const g = new THREE.Group()
  const corpoG = new THREE.Group(); g.add(corpoG)   // o corpo treme com o empuxo; o grupo de fora é a pose da nave
  let env = null
  if (renderer) {   // reflexo do aço: ambiente de estúdio só nos materiais da nave (não mexe no resto da cena)
    const pm = new THREE.PMREMGenerator(renderer)
    env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose()
  }
  const rugInox = texturaInox()
  const inox = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.3, roughnessMap: rugInox, envMap: env, envMapIntensity: 1.15 })
  if (!env) { inox.metalness = 0.45; inox.emissive = new THREE.Color(0x2a2f36); inox.emissiveIntensity = 0.35 }
  const placas = texturaPlacas()
  const escudo = new THREE.MeshStandardMaterial({ color: 0xffffff, map: placas, metalness: 0.05, roughness: 0.85, envMap: env, envMapIntensity: 0.25 })
  const escuro = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.7, roughness: 0.45, envMap: env })
  const solda = new THREE.MeshStandardMaterial({ color: 0x9aa1a9, metalness: 1, roughness: 0.45, envMap: env })
  const R = 0.09, L = 0.72, NARIZ = 0.28
  // corpo: cilindro (inox) + metade de baixo coberta de placas (um pouco por fora, para não brigar no z-buffer)
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 64, 1, true), inox); corpo.rotation.x = Math.PI / 2; corpoG.add(corpo)
  placas.repeat.set(10, 4)
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.006, R * 1.006, L, 64, 1, true, -Math.PI * 0.38, Math.PI * 0.76), escudo); sh.rotation.x = Math.PI / 2; corpoG.add(sh)
  for (let i = 1; i < 8; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(R * 1.002, 0.0009, 4, 64), solda); a.position.z = -L / 2 + i * (L / 8); corpoG.add(a) }
  // nariz em ogiva tangente (perfil de verdade, ponta arredondada)
  const rho = (R * R + NARIZ * NARIZ) / (2 * R)
  const perfil = []
  for (let i = 0; i <= 28; i++) { const y = (i / 28) * NARIZ; const x = Math.sqrt(Math.max(0, rho * rho - y * y)) + R - rho; perfil.push(new THREE.Vector2(Math.max(0.0001, x), y)) }
  const nariz = new THREE.Mesh(new THREE.LatheGeometry(perfil, 64), inox); nariz.rotation.x = -Math.PI / 2; nariz.position.z = -L / 2; corpoG.add(nariz)
  const narizSh = new THREE.Mesh(new THREE.LatheGeometry(perfil.map((v) => new THREE.Vector2(v.x * 1.008, v.y)), 64, Math.PI * 0.62, Math.PI * 0.76), escudo); narizSh.rotation.x = -Math.PI / 2; narizSh.position.z = -L / 2; corpoG.add(narizSh)
  // saia traseira (fecha o corpo) e pinos de captura perto do nariz
  const saia = new THREE.Mesh(new THREE.CircleGeometry(R, 64), escuro); saia.position.z = L / 2; corpoG.add(saia)
  for (const x of [-1, 1]) { const pino = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.02), solda); pino.position.set(x * R * 0.72, R * 0.72, -L / 2 + 0.02); corpoG.add(pino) }
  // aletas (no plano horizontal, presas pela dobradiça ao corpo; o lado de baixo também tem placas)
  const aleta = (comp, larg, z, lado, dianteira, xBase) => {
    const pts = dianteira ? [[0, 0], [larg, comp * 0.35], [larg * 0.92, comp], [0, comp]] : [[0, 0], [larg * 0.85, comp * 0.12], [larg, comp * 0.78], [0, comp]]
    const f = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * lado, y)))   // lado esquerdo = espelhado na forma (normais certas)
    const geo = new THREE.ExtrudeGeometry(f, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 })
    geo.translate(0, 0, -0.0035)
    const piv = new THREE.Group(); piv.position.set(lado * xBase, 0, z)
    const m = new THREE.Mesh(geo, [escudo, inox]); m.rotation.set(Math.PI / 2, 0, 0)
    piv.add(m); corpoG.add(piv); return piv
  }
  const aletas = { de: aleta(0.13, 0.05, -L / 2 - 0.1, -1, true, R * 0.86), dd: aleta(0.13, 0.05, -L / 2 - 0.1, 1, true, R * 0.86), te: aleta(0.25, 0.1, L / 2 - 0.27, -1, false, R * 0.97), td: aleta(0.25, 0.1, L / 2 - 0.27, 1, false, R * 0.97) }
  // motores: sino com perfil parabólico; dentro, garganta que brilha com o empuxo
  const chamas = [], gargantas = []
  const matChama = (cor, op) => new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const motor = (x, y, raio, comp, vacuo) => {
    const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(raio * (0.32 + 0.68 * Math.sqrt(t)), t * comp)) }
    const sino = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshStandardMaterial({ color: vacuo ? 0x6b5a4a : 0x3b3f45, metalness: 0.85, roughness: 0.35, envMap: env, side: THREE.DoubleSide }))
    sino.rotation.x = Math.PI / 2; sino.position.set(x, y, L / 2 - 0.004); corpoG.add(sino)
    const gar = new THREE.Mesh(new THREE.CircleGeometry(raio * 0.3, 20), new THREE.MeshBasicMaterial({ color: 0xffb36b })); gar.position.set(x, y, L / 2 + 0.002); corpoG.add(gar); gargantas.push(gar)
    const z0 = L / 2 + comp
    const nucleo = new THREE.Mesh(new THREE.ConeGeometry(raio * 0.55, 0.3, 20, 1, true), matChama(0xd6e8ff, 0.9)); nucleo.rotation.x = -Math.PI / 2
    const pluma = new THREE.Mesh(new THREE.ConeGeometry(raio * 0.75, 0.55, 20, 1, true), matChama(0x8f80ff, 0.2)); pluma.rotation.x = Math.PI / 2   // abre para trás (no vácuo a pluma se espalha)
    const diamantes = []
    for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(raio * (0.32 - k * 0.05), 10, 8), matChama(0xffd7a8, 0.7)); diamantes.push(d); corpoG.add(d) }
    corpoG.add(nucleo); corpoG.add(pluma)
    chamas.push({ nucleo, pluma, diamantes, x, y, z0, fase: Math.random() * 10, vacuo })
  }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 2; motor(Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0.017, 0.032, false) }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; motor(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0.027, 0.055, true) }
  const brilho = new THREE.PointLight(0x9db7ff, 0, 2.5); brilho.position.set(0, 0, L / 2 + 0.35); corpoG.add(brilho)
  const luz = (cor, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), new THREE.MeshBasicMaterial({ color: cor })); m.position.set(x, y, z); corpoG.add(m); return m }
  const luzes = [luz(0xff3b30, -R - 0.1, 0, L / 2 - 0.15), luz(0x34c759, R + 0.1, 0, L / 2 - 0.15), luz(0xffffff, 0, R + 0.003, -0.1)]
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false })

  const estado = { empuxo: 0, guinada: 0, arfagem: 0, rolagem: 0 }
  // c = { empuxo 0..1, boost, guinada -1..1, arfagem -1..1, rolagem -1..1 }: só o visual (motores, aletas, tremor)
  const atualizar = (dt, t, c) => {
    const alvo = Math.min(1.6, c.empuxo * (c.boost ? 1.6 : 1))
    estado.empuxo += (alvo - estado.empuxo) * Math.min(1, dt * 5)
    for (const k of ['guinada', 'arfagem', 'rolagem']) estado[k] += ((c[k] || 0) - estado[k]) * Math.min(1, dt * 4)
    const e = estado.empuxo
    for (const ch of chamas) {
      const pisca = 0.9 + Math.sin(t * 47 + ch.fase) * 0.06 + Math.random() * 0.06
      const k = Math.max(0.02, e) * pisca * (ch.vacuo ? 1.15 : 1)
      const gx = ch.vacuo ? 0 : -estado.guinada * 0.01, gy = ch.vacuo ? 0 : estado.arfagem * 0.01   // motores centrais giram (vetorização)
      ch.nucleo.scale.set(1, k, 1); ch.nucleo.position.set(ch.x + gx, ch.y + gy, ch.z0 + 0.15 * k)
      ch.pluma.scale.set(1 + e * 0.25, k * (c.boost ? 1.7 : 1), 1 + e * 0.25); ch.pluma.position.set(ch.x + gx * 2, ch.y + gy * 2, ch.z0 + 0.3 * k * (c.boost ? 1.7 : 1))
      ch.nucleo.material.opacity = Math.min(0.95, 0.15 + 0.75 * e); ch.pluma.material.opacity = Math.min(0.22, 0.03 + 0.16 * e)
      ch.diamantes.forEach((d, i) => { d.position.set(ch.x + gx * (1 + i), ch.y + gy * (1 + i), ch.z0 + (0.05 + i * 0.07) * Math.max(0.3, k)); d.visible = e > 0.25; d.material.opacity = 0.55 * Math.min(1, e) * (1 - i * 0.2) })
    }
    gargantas.forEach((gg) => gg.material.color.setRGB(1, 0.45 + 0.4 * Math.min(1, e), 0.2 + 0.3 * Math.min(1, e)))
    brilho.intensity = 0.1 + e * 3
    luzes[2].visible = (t % 1.2) < 0.12
    // aletas: arfagem = as 4 juntas; rolagem = diferencial; guinada = dianteiras opostas
    const a = estado
    aletas.de.rotation.z = (a.arfagem + a.rolagem + a.guinada * 0.6) * 0.35
    aletas.dd.rotation.z = -(a.arfagem - a.rolagem - a.guinada * 0.6) * 0.35
    aletas.te.rotation.z = (-a.arfagem + a.rolagem) * 0.3
    aletas.td.rotation.z = -(-a.arfagem - a.rolagem) * 0.3
    // tremor do empuxo (só o corpo, a câmera não)
    const tr = e > 0.6 ? (e - 0.6) * 0.0025 : 0
    corpoG.position.set((Math.random() - 0.5) * tr, (Math.random() - 0.5) * tr, 0)
  }
  return { grupo: g, atualizar, estado, comprimento: L + NARIZ }
}

// estrelas cadentes no céu ao fundo: um risco que atravessa e some, de tempos em tempos
export function criarMeteoros(cena) {
  const lista = []
  const mat = () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  let proximo = 2
  return (dt) => {
    proximo -= dt
    if (proximo <= 0) {
      proximo = 2.5 + Math.random() * 5
      const dir = new THREE.Vector3().randomDirection(), ini = dir.clone().multiplyScalar(40 + Math.random() * 25)
      const vel = new THREE.Vector3().randomDirection().projectOnPlane(dir).normalize().multiplyScalar(18 + Math.random() * 14)
      const geo = new THREE.BufferGeometry().setFromPoints([ini, ini.clone()])
      const l = new THREE.Line(geo, mat()); l.frustumCulled = false; cena.add(l)
      lista.push({ l, ini, vel, vida: 0, dur: 0.7 + Math.random() * 0.6 })
    }
    for (let i = lista.length - 1; i >= 0; i--) {
      const m = lista[i]; m.vida += dt
      const k = m.vida / m.dur
      const cabeca = m.ini.clone().addScaledVector(m.vel, m.vida), cauda = cabeca.clone().addScaledVector(m.vel, -0.35)
      const p = m.l.geometry.attributes.position.array
      p[0] = cauda.x; p[1] = cauda.y; p[2] = cauda.z; p[3] = cabeca.x; p[4] = cabeca.y; p[5] = cabeca.z
      m.l.geometry.attributes.position.needsUpdate = true
      m.l.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9
      if (k >= 1) { cena.remove(m.l); m.l.geometry.dispose(); m.l.material.dispose(); lista.splice(i, 1) }
    }
  }
}

// aurora nos dois polos: cortina de luz verde e roxa que ondula (gira junto com a Terra)
export function criarAurora(globo, raio) {
  const uniforms = { t: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; uniform float t; void main(){ vUv = uv; vec3 p = position; p += normal * sin(uv.x*40.0 + t*1.7) * 0.004; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float t; void main(){ float onda = 0.55 + 0.45*sin(vUv.x*24.0 + t*1.3) * sin(vUv.x*7.0 - t*0.6); float v = smoothstep(0.0,0.25,vUv.y) * (1.0 - smoothstep(0.35,1.0,vUv.y)); vec3 cor = mix(vec3(0.15,1.0,0.55), vec3(0.65,0.3,1.0), vUv.y); gl_FragColor = vec4(cor, v * onda * 0.55); }',
  })
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.36, raio * 0.33, raio * 0.09, 96, 1, true), mat)
    m.position.y = s * raio * 0.95; m.renderOrder = 3; globo.add(m)
  }
  return (dt) => { uniforms.t.value += dt }
}
