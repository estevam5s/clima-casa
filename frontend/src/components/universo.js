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
  // órbitas circulares médias: para Plutão e Ceres (órbitas excêntricas) a direção é só aproximada
  urano: [313.23, 30688.5, 19.19], netuno: [304.88, 60182, 30.07], plutao: [238.93, 90560, 39.48], ceres: [153.0, 1680.5, 2.77],
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
  for (const n of ['mercurio', 'venus', 'marte', 'jupiter', 'saturno', 'urano', 'netuno', 'plutao', 'ceres']) {
    const [px, py] = helio(n, d)
    res[n] = { ...eclipticaParaTerra(Math.atan2(py - ey, px - ex), 0, d), ua: Math.hypot(px - ex, py - ey) }
  }
  // Lua (Meeus, baixa precisão)
  const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD
  res.lua = eclipticaParaTerra(L + 6.289 * RAD * Math.sin(M), 5.128 * RAD * Math.sin(F), d)
  return res
}

// objetos de céu profundo: ascensão reta e declinação (graus) → lat/lon no referencial fixo da Terra
export function equatorialParaTerra(ra, dec, data = new Date()) {
  const d = diasJ2000(data)
  return { lat: dec, lon: ((ra - gmst(d) + 540) % 360) - 180 }
}
export const CEU_PROFUNDO = { andromeda: [10.68, 41.27], magalhaes: [80.9, -69.8], orion: [83.82, -5.39], pleiades: [56.75, 24.12] }

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
export const naTerra = (lat, lon, r, quat) => {
  const phi = (90 - lat) * RAD, theta = (lon + 180) * RAD
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)).applyQuaternion(quat)
}

// halo de atmosfera em volta de um planeta (mais forte do lado do Sol)
function atmosfera(raio, cor, forca = 1) {
  return new THREE.Mesh(new THREE.SphereGeometry(raio * 1.12, 48, 48), new THREE.ShaderMaterial({
    uniforms: { cor: { value: new THREE.Color(cor) }, forca: { value: forca } },
    vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 cor; uniform float forca; varying vec3 n; void main(){ float i = pow(0.72 - dot(n, vec3(0,0,1.0)), 3.0); gl_FragColor = vec4(cor, 1.0) * i * forca; }',
    blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
  }))
}

// superfície do Sol: granulação em movimento (ruído fractal) e escurecimento na borda
const SOMBREADOR_SOL = {
  vertex: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
  fragment: `uniform float t; varying vec3 vP; varying vec3 vN; varying vec3 vV;
    float h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float ru(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * ru(p); p *= 2.03; a *= 0.5; } return v; }
    void main(){ vec3 p = normalize(vP) * 3.2; float n = fbm(p + vec3(t * 0.04, 0.0, t * 0.03)); float g = fbm(p * 5.0 - vec3(t * 0.15));
      float m = clamp(0.5 * n + 0.6 * g - 0.1, 0.0, 1.0); float borda = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 0.5);
      vec3 c = mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.95, 0.72), m); c = mix(c * vec3(0.9, 0.45, 0.2), c, borda);
      gl_FragColor = vec4(c * 1.35, 1.0); }`,
}

// imagens de céu profundo desenhadas em canvas (galáxia espiral, nuvens, nebulosa, aglomerado)
function texturaGalaxia(semente) {
  const [c, g] = canvas(512, 512); const r = aleat(semente)
  const nucleo = g.createRadialGradient(256, 256, 0, 256, 256, 90); nucleo.addColorStop(0, 'rgba(255,240,215,1)'); nucleo.addColorStop(0.4, 'rgba(240,215,190,0.5)'); nucleo.addColorStop(1, 'rgba(200,180,220,0)')
  for (let i = 0; i < 9000; i++) {
    const braco = i % 2, k = r() * 1, ang = k * 9 + braco * Math.PI + (r() - 0.5) * 0.6, raio = 20 + k * 220
    const x = 256 + Math.cos(ang) * raio + (r() - 0.5) * 22, y = 256 + Math.sin(ang) * raio + (r() - 0.5) * 22
    g.fillStyle = r() < 0.15 ? `rgba(255,190,220,${0.35 * (1 - k)})` : `rgba(${180 + r() * 60},${190 + r() * 50},255,${0.28 * (1 - k * 0.7)})`
    g.fillRect(x, y, 1.6, 1.6)
  }
  g.fillStyle = nucleo; g.fillRect(0, 0, 512, 512)
  return textura(c)
}
function texturaNevoa(cores, semente, pontos = 0) {
  const [c, g] = canvas(256, 256); const r = aleat(semente)
  for (let i = 0; i < 70; i++) {
    const x = 128 + (r() - 0.5) * 150, y = 128 + (r() - 0.5) * 150, rr = 20 + r() * 60
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, cores[i % cores.length]); gr.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256)
  }
  for (let i = 0; i < pontos; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(128 + (r() - 0.5) * 160, 128 + (r() - 0.5) * 160, 1.2, 1.2) }
  return textura(c)
}

export function criarUniverso(cena, globo) {
  const grupo = new THREE.Group(); cena.add(grupo)
  const corpos = {}
  const descartar = []
  const q = globo.quaternion
  const animaveis = []   // luas em órbita: { piv, periodo }

  // ---------- estrelas e Via Láctea ----------
  const N = 16000
  const pos = new Float32Array(N * 3), cor = new Float32Array(N * 3), tam = new Float32Array(N), fase = new Float32Array(N)
  const r = aleat(7)
  const plano = new THREE.Vector3(0.45, 0.88, 0.17).normalize() // plano galáctico inclinado
  const tmp = new THREE.Vector3()
  for (let i = 0; i < N; i++) {
    const naFaixa = i < N * 0.62
    tmp.randomDirection()
    if (naFaixa) { const k = tmp.dot(plano); tmp.addScaledVector(plano, -k * (0.86 + r() * 0.13)).normalize() }
    tmp.multiplyScalar(420 + r() * 80)
    pos.set([tmp.x, tmp.y, tmp.z], i * 3)
    const t = r(); const c = t < 0.15 ? [1, 0.82, 0.62] : t < 0.3 ? [0.72, 0.82, 1] : t < 0.33 ? [1, 0.6, 0.55] : [1, 0.97, 0.92]
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
  const estrelas = new THREE.Points(geo, matEstrelas); estrelas.frustumCulled = false; grupo.add(estrelas); descartar.push(geo, matEstrelas)
  // nebulosidade da Via Láctea: manchas grandes e suaves ao longo do plano, com poeira escura e tons quentes no centro
  const texNeb = brilho([[0, 'rgba(255,255,255,0.55)'], [0.4, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']])
  descartar.push(texNeb)
  const eixoA = new THREE.Vector3().crossVectors(plano, new THREE.Vector3(0, 0, 1)).normalize(), eixoB = new THREE.Vector3().crossVectors(plano, eixoA)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + r() * 0.2
    const centro = Math.max(0, Math.cos(a))
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texNeb, color: new THREE.Color().setHSL(centro > 0.6 ? 0.08 + r() * 0.05 : 0.6 + r() * 0.12, 0.5, 0.55), transparent: true, opacity: 0.05 + r() * 0.05 + centro * 0.04, depthWrite: false, blending: THREE.AdditiveBlending }))
    s.position.copy(eixoA.clone().multiplyScalar(Math.cos(a)).addScaledVector(eixoB, Math.sin(a)).multiplyScalar(460).addScaledVector(plano, (r() - 0.5) * 40))
    s.scale.setScalar(80 + r() * 100 + centro * 60); grupo.add(s); descartar.push(s.material)
  }

  // ---------- Sol ----------
  const dir = direcoes()
  const solPos = naTerra(dir.sol.lat, dir.sol.lon, 150, q)
  const texSol = brilho([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,250,230,1)'], [0.22, 'rgba(255,214,140,0.85)'], [0.45, 'rgba(255,170,70,0.25)'], [1, 'rgba(255,140,40,0)']])
  const texCoroa = brilho([[0, 'rgba(255,220,160,0.5)'], [0.5, 'rgba(255,170,90,0.12)'], [1, 'rgba(255,140,60,0)']])
  descartar.push(texSol, texCoroa)
  const sol = new THREE.Group(); sol.position.copy(solPos); grupo.add(sol)
  const matSol = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: SOMBREADOR_SOL.vertex, fragmentShader: SOMBREADOR_SOL.fragment })
  const nucleo = new THREE.Mesh(new THREE.SphereGeometry(4.2, 64, 64), matSol)
  sol.add(nucleo); descartar.push(nucleo.geometry, matSol)
  const disco = new THREE.Sprite(new THREE.SpriteMaterial({ map: texSol, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 })); disco.scale.setScalar(26); sol.add(disco)
  const coroa = new THREE.Sprite(new THREE.SpriteMaterial({ map: texCoroa, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); coroa.scale.setScalar(60); sol.add(coroa)
  descartar.push(disco.material, coroa.material)
  // proeminências: arcos de plasma que sobem e descem na borda
  const proeminencias = []
  for (let i = 0; i < 6; i++) {
    const arco = new THREE.Mesh(new THREE.TorusGeometry(0.9 + r() * 0.8, 0.07, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }))
    const d = new THREE.Vector3().randomDirection()
    arco.position.copy(d.clone().multiplyScalar(4.05)); arco.lookAt(d.clone().multiplyScalar(10)); arco.rotateX(Math.PI / 2); arco.rotateY(r() * Math.PI)
    sol.add(arco); proeminencias.push({ arco, fase: r() * 6 }); descartar.push(arco.geometry, arco.material)
  }
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
  grupo.add(new THREE.AmbientLight(0x404a66, 0.1))
  corpos.sol = { obj: sol, raio: 4.2, nome: 'Sol', distancia: 'a 150 milhões de km', alvo: nucleo }

  // ---------- Lua e planetas ----------
  const astro = (chave, nome, raio, distancia, tex, extra = {}) => {
    const d = dir[chave]
    const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 64, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 }))
    m.position.copy(naTerra(d.lat, d.lon, distancia, q))
    m.rotation.z = extra.inclinacao || 0
    grupo.add(m); descartar.push(m.geometry, m.material, tex)
    if (extra.atmosfera) { const at = atmosfera(raio, extra.atmosfera, extra.forcaAtm || 1); m.add(at); descartar.push(at.geometry, at.material) }
    corpos[chave] = { obj: m, raio, nome, distancia: extra.texto || (d.ua ? `a ${d.ua.toFixed(2).replace('.', ',')} UA da Terra hoje${extra.aprox ? ' (aprox.)' : ''}` : ''), giro: extra.giro ?? 0.05 }
    return m
  }
  // luas em órbita em volta de um planeta (raio da órbita e tamanho fora de escala; períodos na proporção real)
  const luas = (chavePlaneta, lista) => {
    const planeta = corpos[chavePlaneta].obj
    const sistema = new THREE.Group(); sistema.position.copy(planeta.position); grupo.add(sistema)
    for (const [chave, nome, raio, orbita, periodo, corHex, retro] of lista) {
      const piv = new THREE.Group(); piv.rotation.x = 0.05 + r() * 0.1; sistema.add(piv)
      const giro = new THREE.Group(); giro.rotation.y = r() * Math.PI * 2; piv.add(giro)
      const tex = texturaRochosa(corHex, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.15)'], chave.length * 13)
      const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 32, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }))
      m.position.x = orbita; giro.add(m)
      const caminho = new THREE.Mesh(new THREE.RingGeometry(orbita - 0.008, orbita + 0.008, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }))
      caminho.rotation.x = Math.PI / 2; piv.add(caminho)
      descartar.push(m.geometry, m.material, tex, caminho.geometry, caminho.material)
      animaveis.push({ giro, periodo: periodo * (retro ? -1 : 1) })
      corpos[chave] = { obj: m, raio, nome, distancia: `lua de ${corpos[chavePlaneta].nome}`, giro: 0.02 }
    }
  }
  astro('lua', 'Lua', 0.27, 6.5, texturaRochosa('#9b9b98', ['rgba(60,60,62,0.55)', 'rgba(170,170,165,0.35)'], 3), { texto: 'a 384 mil km · fase real de hoje', giro: 0.01 })
  astro('mercurio', 'Mercúrio', 0.35, 70, texturaRochosa('#8f8a85', ['rgba(60,55,50,0.4)', 'rgba(180,170,160,0.3)'], 11))
  astro('venus', 'Vênus', 0.7, 60, texturaFaixas(['#e8d4a2', '#dcc38c', '#efdcb2', '#d6b97e'], 5, 0.25), { atmosfera: 0xffe2a8, forcaAtm: 0.9 })
  astro('marte', 'Marte', 0.5, 80, texturaRochosa('#b5532c', ['rgba(90,35,20,0.55)', 'rgba(210,120,70,0.35)'], 9, true), { atmosfera: 0xff9a6a, forcaAtm: 0.35 })
  luas('marte', [['fobos', 'Fobos', 0.05, 0.85, 0.32, '#77706a']])
  astro('ceres', 'Ceres', 0.16, 95, (() => { const t = texturaRochosa('#8a8a88', ['rgba(40,40,40,0.4)', 'rgba(200,200,200,0.2)'], 23); const g = t.image.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(300, 230, 7, 0, 7); g.fill(); t.needsUpdate = true; return t })(), { aprox: true })
  // Júpiter com a Grande Mancha Vermelha
  const texJup = texturaFaixas(['#d8c4a6', '#b8916b', '#e9dcc6', '#a7754f', '#cfb08c', '#efe3cf'], 13, 0.3)
  { const g = texJup.image.getContext('2d'); const gr = g.createRadialGradient(620, 330, 2, 620, 330, 34); gr.addColorStop(0, 'rgba(190,80,50,0.95)'); gr.addColorStop(0.7, 'rgba(200,110,70,0.7)'); gr.addColorStop(1, 'rgba(200,120,80,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(620, 330, 52, 24, 0, 0, 7); g.fill(); texJup.needsUpdate = true }
  astro('jupiter', 'Júpiter', 2.2, 110, texJup, { inclinacao: 0.05, giro: 0.12, atmosfera: 0xf5deb3, forcaAtm: 0.5 })
  luas('jupiter', [['io', 'Io', 0.13, 3.3, 1.77, '#d9c44a'], ['europa', 'Europa', 0.11, 4.0, 3.55, '#d8d2c6'], ['ganimedes', 'Ganimedes', 0.18, 5.0, 7.15, '#8f877c'], ['calisto', 'Calisto', 0.16, 6.3, 16.7, '#5f5852']])
  const saturno = astro('saturno', 'Saturno', 1.8, 135, texturaFaixas(['#e3d3a8', '#cdb682', '#ece0bf', '#c2a46e'], 17, 0.15), { inclinacao: 0.47, giro: 0.1, atmosfera: 0xf0e0b0, forcaAtm: 0.4 })
  luas('saturno', [['tita', 'Titã', 0.17, 6.0, 15.9, '#c98a2c']])
  const urano = astro('urano', 'Urano', 1.15, 165, texturaFaixas(['#a6e4ea', '#9bdbe3', '#b5ecf0', '#93d3dc'], 29, 0.05), { inclinacao: 1.71, giro: 0.08, atmosfera: 0x9eeaf5, forcaAtm: 0.8, aprox: false })
  astro('netuno', 'Netuno', 1.1, 185, texturaFaixas(['#3f6fd8', '#4a7ce6', '#335fc4', '#5a8af0'], 31, 0.12), { giro: 0.09, atmosfera: 0x6a9bff, forcaAtm: 0.9 })
  luas('netuno', [['tritao', 'Tritão', 0.1, 2.2, 5.88, '#d9b8b0', true]])
  astro('plutao', 'Plutão', 0.22, 205, (() => { const t = texturaRochosa('#b89c7d', ['rgba(110,70,40,0.5)', 'rgba(230,215,195,0.3)'], 37); const g = t.image.getContext('2d'); g.fillStyle = 'rgba(245,238,225,0.92)'; g.beginPath(); g.arc(480, 250, 34, 0, 7); g.arc(530, 250, 34, 0, 7); g.fill(); g.beginPath(); g.moveTo(448, 262); g.lineTo(505, 330); g.lineTo(562, 262); g.fill(); t.needsUpdate = true; return t })(), { aprox: true })
  // anéis de Saturno
  const [cA, gA] = canvas(512, 8)
  for (let x = 0; x < 512; x++) { const f = x / 512; const a = f < 0.12 ? 0 : f < 0.5 ? 0.55 + Math.sin(x * 0.7) * 0.15 : f < 0.56 ? 0.08 : 0.42 + Math.sin(x * 0.4) * 0.12; gA.fillStyle = `rgba(222,205,165,${a})`; gA.fillRect(x, 0, 1, 8) }
  const anelGeo = (r1, r2) => { const ge = new THREE.RingGeometry(r1, r2, 128); const uv = ge.attributes.uv, p3 = ge.attributes.position; for (let i = 0; i < uv.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p3, i); uv.setXY(i, (v.length() - r1) / (r2 - r1), 0.5) } return ge }
  const texAneis = new THREE.CanvasTexture(cA)
  const geoAneis = anelGeo(2.3, 4.2)
  const aneis = new THREE.Mesh(geoAneis, new THREE.MeshStandardMaterial({ map: texAneis, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }))
  aneis.rotation.x = Math.PI / 2; saturno.add(aneis); descartar.push(geoAneis, aneis.material, texAneis)
  // anéis finos de Urano (quase invisíveis)
  const geoAnU = anelGeo(1.6, 1.9)
  const aneisU = new THREE.Mesh(geoAnU, new THREE.MeshBasicMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }))
  aneisU.rotation.x = Math.PI / 2; urano.add(aneisU); descartar.push(geoAnU, aneisU.material)
  corpos.terra = { obj: globo, raio: 1, nome: 'Terra', distancia: 'acessos ao sistema agora' }

  // ---------- cinturão de asteroides em volta do Sol (ilustração fora de escala) ----------
  const pe = eclipticaParaTerra(0, Math.PI / 2, diasJ2000())   // polo norte da eclíptica
  const polo = naTerra(pe.lat, pe.lon, 1, q).normalize()
  const ua = new THREE.Vector3().crossVectors(polo, new THREE.Vector3(0, 1, 0.3)).normalize(), ub = new THREE.Vector3().crossVectors(polo, ua)
  const NA = 5000, posA = new Float32Array(NA * 3)
  for (let i = 0; i < NA; i++) {
    const ang = r() * Math.PI * 2, raio = 30 + r() * 9 + (r() - 0.5) * 3
    const p = ua.clone().multiplyScalar(Math.cos(ang) * raio).addScaledVector(ub, Math.sin(ang) * raio).addScaledVector(polo, (r() - 0.5) * 1.6).add(solPos)
    posA.set([p.x, p.y, p.z], i * 3)
  }
  const geoA = new THREE.BufferGeometry(); geoA.setAttribute('position', new THREE.BufferAttribute(posA, 3))
  const texPedra = brilho([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(200,190,170,0.6)'], [1, 'rgba(0,0,0,0)']])
  const cinturao = new THREE.Points(geoA, new THREE.PointsMaterial({ map: texPedra, color: 0xb8ad9c, size: 0.35, transparent: true, depthWrite: false, opacity: 0.85 }))
  grupo.add(cinturao); descartar.push(geoA, cinturao.material, texPedra)
  const marcaCint = new THREE.Object3D(); marcaCint.position.copy(solPos.clone().add(ua.clone().multiplyScalar(34))); grupo.add(marcaCint)
  corpos.cinturao = { obj: marcaCint, raio: 3, nome: 'Cinturão de asteroides', distancia: 'entre Marte e Júpiter (ilustração)' }

  // ---------- cometa: núcleo, coma e duas caudas apontando para longe do Sol ----------
  const posCometa = solPos.clone().add(ub.clone().multiplyScalar(48)).add(polo.clone().multiplyScalar(12))
  const cometa = new THREE.Group(); cometa.position.copy(posCometa); grupo.add(cometa)
  const nucCom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshStandardMaterial({ color: 0x8b8378, roughness: 1, flatShading: true })); cometa.add(nucCom)
  const texComa = brilho([[0, 'rgba(220,250,255,0.9)'], [0.3, 'rgba(160,220,255,0.35)'], [1, 'rgba(120,200,255,0)']])
  const coma = new THREE.Sprite(new THREE.SpriteMaterial({ map: texComa, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); coma.scale.setScalar(2.2); cometa.add(coma)
  const longe = posCometa.clone().sub(solPos).normalize()
  const NC = 2200, posC = new Float32Array(NC * 3), velC = []
  for (let i = 0; i < NC; i++) velC.push([r(), (r() - 0.5) * 0.5, (r() - 0.5) * 0.5, r() < 0.3 ? 1 : 0])
  const geoC = new THREE.BufferGeometry(); geoC.setAttribute('position', new THREE.BufferAttribute(posC, 3))
  const cauda = new THREE.Points(geoC, new THREE.PointsMaterial({ map: texComa, color: 0x9be7ff, size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }))
  cometa.add(cauda); descartar.push(nucCom.geometry, nucCom.material, texComa, coma.material, geoC, cauda.material)
  const lateral = new THREE.Vector3().crossVectors(longe, polo).normalize()
  corpos.cometa = { obj: cometa, raio: 0.4, nome: 'Cometa', distancia: 'ilustração · cauda oposta ao Sol', alvo: coma }

  // ---------- céu profundo nas direções reais ----------
  const fundo = (chave, nome, tex, escala, dist, rot = 0, opac = 0.9) => {
    const [ra, dec] = CEU_PROFUNDO[chave]; const e = equatorialParaTerra(ra, dec)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opac, rotation: rot }))
    s.position.copy(naTerra(e.lat, e.lon, dist, q)); s.scale.set(escala[0], escala[1], 1); grupo.add(s); descartar.push(tex, s.material)
    corpos[chave] = { obj: s, raio: escala[0] / 3.2, nome, distancia: 'direção real no céu · fora de escala' }
  }
  fundo('andromeda', 'Andrômeda', texturaGalaxia(41), [46, 20], 360, 0.6)
  fundo('magalhaes', 'Nuvens de Magalhães', texturaNevoa(['rgba(190,210,255,0.35)', 'rgba(255,255,255,0.25)'], 43, 300), [40, 30], 370, 0.3, 0.7)
  fundo('orion', 'Nebulosa de Órion', texturaNevoa(['rgba(255,110,170,0.4)', 'rgba(120,220,255,0.3)', 'rgba(255,170,120,0.25)'], 47, 40), [34, 34], 350, 0, 0.85)
  fundo('pleiades', 'Plêiades', texturaNevoa(['rgba(120,170,255,0.3)', 'rgba(180,210,255,0.2)'], 53, 0), [26, 26], 340, 0, 0.6)
  { // as sete irmãs: estrelas azuladas brilhantes por cima da névoa
    const pl = corpos.pleiades.obj.position; const tp = brilho([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(170,200,255,0.8)'], [1, 'rgba(120,160,255,0)']]); descartar.push(tp)
    for (let i = 0; i < 7; i++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: tp, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); st.position.copy(pl).add(new THREE.Vector3((r() - 0.5) * 12, (r() - 0.5) * 9, (r() - 0.5) * 12)); st.scale.setScalar(2.4 + r() * 1.8); grupo.add(st); descartar.push(st.material) }
  }

  // ---------- estrelas cadentes ----------
  const meteoros = []
  const novoMeteoro = (camera) => {
    const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const ini = frente.clone().add(new THREE.Vector3((r() - 0.5) * 1.4, (r() - 0.5) * 0.9, (r() - 0.5) * 1.4)).normalize().multiplyScalar(260).add(camera.position)
    const desl = new THREE.Vector3().randomDirection().multiplyScalar(28 + r() * 20)
    const geoM = new THREE.BufferGeometry().setFromPoints([ini.clone(), ini.clone()])
    geoM.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3))
    const linha = new THREE.Line(geoM, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
    grupo.add(linha); meteoros.push({ linha, ini, desl, k: 0 })
  }
  let proxMeteoro = 3

  // ---------- linhas de dobra (aparecem durante as viagens longas) ----------
  const ND = 500, posD = new Float32Array(ND * 6), velD = new Float32Array(ND)
  for (let i = 0; i < ND; i++) {
    const a = r() * Math.PI * 2, rr = 1.5 + r() * 12, z = -5 - r() * 120
    posD.set([Math.cos(a) * rr, Math.sin(a) * rr, z, Math.cos(a) * rr, Math.sin(a) * rr, z - 4 - r() * 6], i * 6); velD[i] = 0.6 + r()
  }
  const geoD = new THREE.BufferGeometry(); geoD.setAttribute('position', new THREE.BufferAttribute(posD, 3))
  const corD = new Float32Array(ND * 6); for (let i = 0; i < ND; i++) corD.set([0.75, 0.85, 1, 0, 0, 0], i * 6)
  geoD.setAttribute('color', new THREE.BufferAttribute(corD, 3))
  const dobra = new THREE.LineSegments(geoD, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
  dobra.frustumCulled = false; dobra.visible = false; grupo.add(dobra); descartar.push(geoD, dobra.material)

  let escalaTempo = 1, warp = 0
  return {
    grupo, corpos, solPos,
    set escala(v) { escalaTempo = v },
    get escala() { return escalaTempo },
    set dobra(v) { warp = v },
    atualizar(dt, t, camera) {
      matEstrelas.uniforms.t.value = t
      matSol.uniforms.t.value = t
      const k = dt * escalaTempo
      for (const c of Object.values(corpos)) if (c.giro && c.obj.isMesh) c.obj.rotation.y += k * c.giro
      // períodos em dias: 1 dia = 6 s na escala 1
      for (const a of animaveis) a.giro.rotation.y += (k / 6) * (Math.PI * 2 / a.periodo)
      coroa.material.rotation += dt * 0.02; coroa.scale.setScalar(60 + Math.sin(t * 0.8) * 3)
      proeminencias.forEach((p) => { const s = 0.75 + Math.sin(t * 0.6 + p.fase) * 0.25; p.arco.scale.setScalar(s); p.arco.material.opacity = 0.35 + s * 0.4 })
      // cauda do cometa: partículas saindo do núcleo e indo para longe do Sol (a de íons, reta e azul; a de poeira, curva)
      for (let i = 0; i < NC; i++) {
        const v = velC[i]; v[0] = (v[0] + dt * (v[3] ? 0.18 : 0.1)) % 1
        const d = v[0] * (v[3] ? 22 : 15), curva = v[3] ? 0 : v[0] * v[0] * 5
        posC[i * 3] = longe.x * d + lateral.x * curva + v[1] * d * 0.08; posC[i * 3 + 1] = longe.y * d + lateral.y * curva + v[2] * d * 0.08; posC[i * 3 + 2] = longe.z * d + lateral.z * curva + v[1] * d * 0.05
      }
      geoC.attributes.position.needsUpdate = true
      coma.material.opacity = 0.8 + Math.sin(t * 3) * 0.1
      if (!camera) return
      // estrelas cadentes de vez em quando
      proxMeteoro -= dt
      if (proxMeteoro < 0) { novoMeteoro(camera); proxMeteoro = 4 + r() * 8 }
      for (let i = meteoros.length - 1; i >= 0; i--) {
        const m = meteoros[i]; m.k += dt * 1.4
        const cabeca = m.ini.clone().addScaledVector(m.desl, Math.min(1, m.k)), cauda = m.ini.clone().addScaledVector(m.desl, Math.max(0, m.k - 0.35))
        const pa = m.linha.geometry.attributes.position; pa.setXYZ(0, cabeca.x, cabeca.y, cabeca.z); pa.setXYZ(1, cauda.x, cauda.y, cauda.z); pa.needsUpdate = true
        m.linha.material.opacity = m.k < 1 ? 1 : Math.max(0, 1.35 - m.k)
        if (m.k > 1.35) { grupo.remove(m.linha); m.linha.geometry.dispose(); m.linha.material.dispose(); meteoros.splice(i, 1) }
      }
      // dobra espacial: presa à câmera, as linhas correm em direção a ela
      dobra.visible = warp > 0.02
      if (dobra.visible) {
        dobra.position.copy(camera.position); dobra.quaternion.copy(camera.quaternion)
        for (let i = 0; i < ND; i++) {
          let z = posD[i * 6 + 2] + dt * 160 * warp * velD[i]
          if (z > 2) z -= 125
          const comp = 4 + warp * 26 * velD[i]
          posD[i * 6 + 2] = z; posD[i * 6 + 5] = z - comp
        }
        geoD.attributes.position.needsUpdate = true
        dobra.material.opacity = Math.min(1, warp * 1.2)
      }
    },
    descartar() { meteoros.forEach((m) => { m.linha.geometry.dispose(); m.linha.material.dispose() }); descartar.forEach((x) => x.dispose?.()); cena.remove(grupo) },
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
