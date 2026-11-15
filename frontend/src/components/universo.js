import * as THREE from 'three'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'

// Universo em volta do globo de acessos: Sol, Lua e planetas nas direções reais de agora (efemérides simplificadas,
// erro de poucos graus), Via Láctea e estrelas que cintilam. Tudo em coordenadas fixas na Terra (as mesmas do globo),
// por isso o Sol aparece exatamente do lado iluminado e a noite fica do lado oposto. Distâncias e tamanhos estão fora
// de escala para caber na tela; as direções e as fases da Lua e dos planetas são as reais.
const RAD = Math.PI / 180
const EPS = 23.4393 * RAD
const diasJ2000 = (d = new Date()) => d.getTime() / 86400000 + 2440587.5 - 2451545.0
const gmst = (d) => (((280.46061837 + 360.98564736629 * d) % 360) + 360) % 360

function eclipticaParaTerra(lambda, beta, d) {
  const x = Math.cos(beta) * Math.cos(lambda)
  const y = Math.cos(beta) * Math.sin(lambda) * Math.cos(EPS) - Math.sin(beta) * Math.sin(EPS)
  const z = Math.cos(beta) * Math.sin(lambda) * Math.sin(EPS) + Math.sin(beta) * Math.cos(EPS)
  const ra = Math.atan2(y, x) / RAD, dec = Math.asin(z) / RAD
  return { lat: dec, lon: ((ra - gmst(d) + 540) % 360) - 180 }
}

// órbitas médias circulares no plano da eclíptica (longitude média J2000, período em dias, raio em UA)
const ORBITAS = {
  mercurio: [252.25, 87.969, 0.387], venus: [181.98, 224.701, 0.723], terra: [100.46, 365.256, 1.0],
  marte: [355.45, 686.98, 1.524], jupiter: [34.40, 4332.59, 5.203], saturno: [49.94, 10759.22, 9.537],
}
function helio(nome, d) {
  const [l0, p, a] = ORBITAS[nome]
  const l = (l0 + (360 / p) * d) * RAD
  return [a * Math.cos(l), a * Math.sin(l)]
}
export function direcoes(data = new Date()) {
  const d = diasJ2000(data)
  const [ex, ey] = helio('terra', d)
  const res = { sol: eclipticaParaTerra(Math.atan2(-ey, -ex), 0, d) }
  for (const n of ['mercurio', 'venus', 'marte', 'jupiter', 'saturno']) {
    const [px, py] = helio(n, d)
    res[n] = { ...eclipticaParaTerra(Math.atan2(py - ey, px - ex), 0, d), ua: Math.hypot(px - ex, py - ey) }
  }
  // Lua (Meeus, baixa precisão)
  const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD
  res.lua = eclipticaParaTerra(L + 6.289 * RAD * Math.sin(M), 5.128 * RAD * Math.sin(F), d)
  return res
}

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')] }
const textura = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
function aleat(semente) { let s = semente; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }

function texturaFaixas(cores, semente, turbulencia = 0.15) {
  const [c, g] = canvas(1024, 512); const r = aleat(semente)
  for (let y = 0; y < 512; y += 2) {
    const k = Math.floor((y / 512) * cores.length * 3 + Math.sin(y * 0.05) * 2) % cores.length
    g.fillStyle = cores[(k + cores.length) % cores.length]; g.fillRect(0, y, 1024, 2)
  }
  for (let i = 0; i < 900; i++) { // redemoinhos
    const x = r() * 1024, y = r() * 512, rr = 6 + r() * 30
    g.fillStyle = `rgba(255,255,255,${r() * turbulencia * 0.5})`; g.beginPath(); g.ellipse(x, y, rr * 2.5, rr * 0.5, 0, 0, 7); g.fill()
  }
  return textura(c)
}
function texturaRochosa(base, manchas, semente, calotas = false) {
  const [c, g] = canvas(1024, 512); const r = aleat(semente)
  g.fillStyle = base; g.fillRect(0, 0, 1024, 512)
  for (let i = 0; i < 1600; i++) {
    const x = r() * 1024, y = r() * 512, rr = 2 + r() * (i < 60 ? 70 : 14)
    const gr = g.createRadialGradient(x, y, 0, x, y, rr)
    gr.addColorStop(0, manchas[i % manchas.length]); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill()
  }
  for (let i = 0; i < 260; i++) { // crateras
    const x = r() * 1024, y = r() * 512, rr = 1.5 + r() * 9
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, rr, 0, 7); g.stroke()
  }
  if (calotas) { g.fillStyle = 'rgba(245,245,250,0.9)'; g.fillRect(0, 0, 1024, 22); g.fillRect(0, 495, 1024, 17) }
  return textura(c)
}
function brilho(cores) {
  const [c, g] = canvas(256, 256)
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  cores.forEach(([p, cor]) => gr.addColorStop(p, cor))
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  return new THREE.CanvasTexture(c)
}

// pontos: posição no "céu" fixo na Terra (lat/lon) → mundo, aplicando a rotação do globo
const naTerra = (lat, lon, r, quat) => {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)).applyQuaternion(quat)
}

export function criarUniverso(cena, globo) {
  const grupo = new THREE.Group(); cena.add(grupo)
  const corpos = {}
  const descartar = []
  const q = globo.quaternion

  // ---------- estrelas e Via Láctea ----------
  const N = 14000
  const pos = new Float32Array(N * 3), cor = new Float32Array(N * 3), tam = new Float32Array(N), fase = new Float32Array(N)
  const r = aleat(7)
  const plano = new THREE.Vector3(0.45, 0.88, 0.17).normalize() // plano galáctico inclinado
  const tmp = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const naFaixa = i < N * 0.62
    tmp.randomDirection()
    if (naFaixa) { const k = tmp.dot(plano); tmp.addScaledVector(plano, -k * (0.86 + r() * 0.13)).normalize() }
    tmp.multiplyScalar(320 + r() * 80)
    pos.set([tmp.x, tmp.y, tmp.z], i * 3)
    const t = r(); const c = t < 0.15 ? [1, 0.82, 0.62] : t < 0.3 ? [0.72, 0.82, 1] : [1, 0.97, 0.92]
    const b = naFaixa ? 0.45 + r() * 0.5 : 0.6 + r() * 0.4
    cor.set([c[0] * b, c[1] * b, c[2] * b], i * 3)
    tam[i] = (r() < 0.02 ? 3.6 : 1 + r() * 1.6) * (naFaixa ? 0.85 : 1)
    fase[i] = r() * 6.28
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('cor', new THREE.BufferAttribute(cor, 3))
  geo.setAttribute('tam', new THREE.BufferAttribute(tam, 1)); geo.setAttribute('fase', new THREE.BufferAttribute(fase, 1))
  const matEstrelas = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, px: { value: Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `attribute vec3 cor; attribute float tam; attribute float fase; uniform float t; uniform float px; varying vec3 vc; varying float va;
      void main(){ vc = cor; va = 0.65 + 0.35 * sin(t * (1.0 + fase * 0.4) + fase); vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = tam * px * 1.6; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vc; varying float va; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vc * (0.6 + a), a * va); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const estrelas = new THREE.Points(geo, matEstrelas); grupo.add(estrelas); descartar.push(geo, matEstrelas)
  // nebulosidade da Via Láctea: manchas grandes e suaves ao longo do plano
  const texNeb = brilho([[0, 'rgba(255,255,255,0.55)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']])
  descartar.push(texNeb)
  const eixoA = new THREE.Vector3().crossVectors(plano, new THREE.Vector3(0, 0, 1)).normalize(), eixoB = new THREE.Vector3().crossVectors(plano, eixoA)
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + r() * 0.2
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texNeb, color: new THREE.Color().setHSL(0.6 + r() * 0.12, 0.5, 0.55), transparent: true, opacity: 0.05 + r() * 0.05, depthWrite: false, blending: THREE.AdditiveBlending }))
    s.position.copy(eixoA.clone().multiplyScalar(Math.cos(a)).addScaledVector(eixoB, Math.sin(a)).multiplyScalar(360).addScaledVector(plano, (r() - 0.5) * 40))
    s.scale.setScalar(70 + r() * 90); grupo.add(s); descartar.push(s.material)
  }

  // ---------- Sol ----------
  const dir = direcoes()
  const solPos = naTerra(dir.sol.lat, dir.sol.lon, 150, q)
  const texSol = brilho([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,250,230,1)'], [0.22, 'rgba(255,214,140,0.85)'], [0.45, 'rgba(255,170,70,0.25)'], [1, 'rgba(255,140,40,0)']])
  const texCoroa = brilho([[0, 'rgba(255,220,160,0.5)'], [0.5, 'rgba(255,170,90,0.12)'], [1, 'rgba(255,140,60,0)']])
  descartar.push(texSol, texCoroa)
  const sol = new THREE.Group(); sol.position.copy(solPos); grupo.add(sol)
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(4.2, 48, 48), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }))
  sol.add(nucleo); descartar.push(nucleo.geometry, nucleo.material)
  const disco = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); disco.scale.setScalar(26); sol.add(disco)
  const coroa = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCoroa, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); coroa.scale.setScalar(60); sol.add(coroa)
  descartar.push(disco.material, coroa.material)
  // reflexos de lente quando o Sol aparece na tela
  const texFlare = brilho([[0, 'rgba(255,255,255,0.9)'], [0.3, 'rgba(255,220,180,0.35)'], [1, 'rgba(255,200,150,0)']])
  const texAnel = brilho([[0, 'rgba(0,0,0,0)'], [0.6, 'rgba(0,0,0,0)'], [0.7, 'rgba(140,200,255,0.18)'], [0.8, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']])
  descartar.push(texFlare, texAnel)
  const flare = new Lensflare()
  flare.addElement(new LensflareElement(texFlare, 380, 0, new THREE.Color(1, 0.92, 0.8)))
  flare.addElement(new LensflareElement(texAnel, 120, 0.4)); flare.addElement(new LensflareElement(texFlare, 60, 0.6, new THREE.Color(0.6, 0.8, 1)))
  flare.addElement(new LensflareElement(texAnel, 200, 0.85)); flare.addElement(new LensflareElement(texFlare, 40, 1))
  sol.add(flare)
  const luzSol = new THREE.PointLight(0xfff1dc, 3.2, 0, 0); luzSol.position.copy(solPos); grupo.add(luzSol)
  grupo.add(new THREE.AmbientLight(0x404a66, 0.08))
  corpos.sol = { obj: sol, raio: 4.2, nome: 'Sol', distancia: 'a 150 milhões de km' }

  // ---------- Lua e planetas ----------
  const astro = (chave, nome, raio, distancia, tex, extra = {}) => {
    const d = dir[chave]
    const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 64, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }))
    m.position.copy(naTerra(d.lat, d.lon, distancia, q))
    m.rotation.z = extra.inclinacao || 0
    grupo.add(m); descartar.push(m.geometry, m.material, tex)
    corpos[chave] = { obj: m, raio, nome, distancia: extra.texto || (d.ua ? `a ${d.ua.toFixed(2).replace('.', ',')} UA da Terra hoje` : '') }
    return m
  }
  astro('lua', 'Lua', 0.27, 6.5, texturaRochosa('#9b9b98', ['rgba(60,60,62,0.55)', 'rgba(170,170,165,0.35)'], 3), { texto: 'a 384 mil km · fase real de hoje' })
  astro('mercurio', 'Mercúrio', 0.35, 70, texturaRochosa('#8f8a85', ['rgba(60,55,50,0.4)', 'rgba(180,170,160,0.3)'], 11))
  astro('venus', 'Vênus', 0.7, 60, texturaFaixas(['#e8d4a2', '#dcc38c', '#efdcb2', '#d6b97e'], 5, 0.25))
  astro('marte', 'Marte', 0.5, 80, texturaRochosa('#b5532c', ['rgba(90,35,20,0.55)', 'rgba(210,120,70,0.35)'], 9, true))
  astro('jupiter', 'Júpiter', 2.2, 110, texturaFaixas(['#d8c4a6', '#b8916b', '#e9dcc6', '#a7754f', '#cfb08c', '#efe3cf'], 13, 0.3), { inclinacao: 0.05 })
  const saturno = astro('saturno', 'Saturno', 1.8, 135, texturaFaixas(['#e3d3a8', '#cdb682', '#ece0bf', '#c2a46e'], 17, 0.15), { inclinacao: 0.47 })
  // anéis de Saturno
  const [cA, gA] = canvas(512, 8)
  for (let x = 0; x < 512; x++) { const f = x / 512; const a = f < 0.12 ? 0 : f < 0.5 ? 0.55 + Math.sin(x * 0.7) * 0.15 : f < 0.56 ? 0.08 : 0.42 + Math.sin(x * 0.4) * 0.12; gA.fillStyle = `rgba(222,205,165,${a})`; gA.fillRect(x, 0, 1, 8) }
  const texAneis = new THREE.CanvasTexture(cA)
  const geoAneis = new THREE.RingGeometry(2.3, 4.2, 128)
  const uv = geoAneis.attributes.uv, p3 = geoAneis.attributes.position
  for (let i = 0; i < uv.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p3, i); uv.setXY(i, (v.length() - 2.3) / 1.9, 0.5) }
  const aneis = new THREE.Mesh(geoAneis, new THREE.MeshStandardMaterial({ map: texAneis, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }))
  aneis.rotation.x = Math.PI / 2; saturno.add(aneis); descartar.push(geoAneis, aneis.material, texAneis)
  corpos.terra = { obj: globo, raio: 1, nome: 'Terra', distancia: 'acessos ao sistema agora' }

  return {
    grupo, corpos, solPos,
    atualizar(dt, t) {
      matEstrelas.uniforms.t.value = t
      for (const k of ['lua', 'mercurio', 'venus', 'marte', 'jupiter', 'saturno']) corpos[k].obj.rotation.y += dt * (k === 'jupiter' ? 0.12 : k === 'lua' ? 0.01 : 0.05)
      coroa.material.rotation += dt * 0.02; coroa.scale.setScalar(60 + Math.sin(t * 0.8) * 3)
    },
    descartar() { descartar.forEach((x) => x.dispose?.()); cena.remove(grupo) },
  }
}

// luzes das cidades no lado da noite: pontos quentes sobre a terra firme, mais densos perto do litoral
export function luzesDasCidades(ctx, mascaraAgua, L, A) {
  const dados = mascaraAgua.getContext('2d').getImageData(0, 0, L, A).data
  const r = aleat(21)
  const terra = (x, y) => dados[((y | 0) * L + (x | 0)) * 4] < 128
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  let n = 0
  for (let i = 0; i < 220000 && n < 52000; i++) {
    const x = r() * L, y = A * (0.12 + r() * 0.62)
    if (!terra(x, y)) continue
    const costa = !terra(x + 9, y) || !terra(x - 9, y) || !terra(x, y + 9) || !terra(x, y - 9)
    if (!costa && r() < 0.72) continue
    n++
    const a = 0.25 + r() * 0.6, rr = r() < 0.03 ? 2.6 : 1.1
    ctx.fillStyle = `rgba(255,${190 + (r() * 40) | 0},${110 + (r() * 50) | 0},${a})`
    ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill()
  }
  ctx.restore()
}
