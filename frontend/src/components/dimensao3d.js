import * as THREE from 'three'
import { criarNave } from './nave3d'
import { compilarSeguro } from './compilar3d'

// Outra dimensão (ficção) para onde a nave vai depois do salto hipersônico: céu de nebulosa, sol binário, planeta
// anelado gigante com anel orbital habitado, megacidade flutuante com torres e elevador espacial, portal de energia,
// cristais, frota de naves alienígenas e uma nave-mãe. Tudo procedural e instanciado (~25 chamadas de desenho), montado
// em etapas curtas durante a contagem regressiva (prepararDimensao) e com os shaders compilados antes de chegar.
// Usa o mesmo renderer do globo; ao sair, descartar() libera geometrias, materiais e texturas.

const pausa = () => new Promise((r) => setTimeout(r, 0))

function texturaJanelas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256
  const g = c.getContext('2d')
  g.fillStyle = '#05060c'; g.fillRect(0, 0, 64, 256)
  const cores = ['#5eead4', '#a78bfa', '#f0abfc', '#67e8f9', '#fde68a']
  for (let y = 4; y < 256; y += 7) for (let x = 3; x < 64; x += 6) {
    if (Math.random() < 0.45) { g.fillStyle = cores[(Math.random() * cores.length) | 0]; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 3, 4) }
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function placaGlifos(texto, cor) {   // letreiro holográfico com "escrita" alienígena (símbolos geométricos)
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')
  g.strokeStyle = cor; g.fillStyle = cor; g.lineWidth = 4; g.globalAlpha = 0.9
  g.strokeRect(6, 6, 500, 116)
  let x = 24
  for (const ch of texto) {
    const s = ch.charCodeAt(0)
    g.beginPath()
    if (s % 3 === 0) g.arc(x + 14, 64, 14, 0, Math.PI * (1 + (s % 5) / 5))
    else if (s % 3 === 1) { g.moveTo(x, 40); g.lineTo(x + 28, 88); g.moveTo(x + 28, 40); g.lineTo(x + 6, 70) }
    else { g.rect(x + 2, 44, 24, 40); g.moveTo(x + 14, 44); g.lineTo(x + 14, 84) }
    g.stroke(); x += 40
    if (x > 470) break
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }))
  return s
}

const RUIDO_GLSL = /* glsl */`
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * n3(p); p *= 2.03; a *= 0.5; } return v; }
`

export async function prepararDimensao(renderer, aoProgresso = () => {}) {
  const cena = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 9000)
  const tempo = { value: 0 }
  const animar = []   // (dt, t) por quadro
  const passos = 10
  let passo = 0
  const avancar = async () => { passo++; aoProgresso(Math.round((passo / passos) * 100)); await pausa() }

  // 1) céu de nebulosa (um shader na esfera de fundo) + névoa
  const ceu = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, uniforms: { t: tempo },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RUIDO_GLSL + /* glsl */`
      uniform float t; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float n = fbm(d * 3.0 + vec3(0.0, t * 0.01, 0.0));
        float m = fbm(d * 6.0 - vec3(t * 0.006));
        vec3 c = mix(vec3(0.02, 0.01, 0.06), vec3(0.32, 0.06, 0.42), smoothstep(0.35, 0.8, n));
        c = mix(c, vec3(0.02, 0.45, 0.48), smoothstep(0.55, 0.9, m) * 0.6);
        c += vec3(0.9, 0.3, 0.6) * pow(max(0.0, fbm(d * 12.0)), 6.0) * 0.6;
        float s = h3(floor(d * 900.0)); c += vec3(step(0.9985, s)) * (0.6 + 0.4 * sin(t * 2.0 + s * 50.0));
        gl_FragColor = vec4(c, 1.0);
      }` }))
  cena.add(ceu)
  cena.fog = new THREE.FogExp2(0x1a0b2e, 0.00018)
  cena.add(new THREE.HemisphereLight(0xb38bff, 0x0b3a3a, 0.9))
  const sol = new THREE.DirectionalLight(0xffd9f2, 2.2); sol.position.set(-1500, 900, -2200); cena.add(sol)
  const sol2 = new THREE.DirectionalLight(0x7df9ff, 0.9); sol2.position.set(1800, 400, 1200); cena.add(sol2)
  // dois sóis: discos brilhantes ao fundo
  for (const [cor, pos, r] of [[0xffb3e6, [-1500, 900, -2200], 120], [0x8ffcff, [1800, 400, 1200], 70]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: cor, fog: false }))
    s.position.set(...pos).multiplyScalar(1.6); cena.add(s)
  }
  await avancar()

  // 2) planeta anelado gigante + anel orbital habitado
  const P = new THREE.Vector3(1400, -200, -2600), RP = 900
  const planeta = new THREE.Mesh(new THREE.SphereGeometry(RP, 96, 64), new THREE.ShaderMaterial({
    uniforms: { t: tempo, sol: { value: new THREE.Vector3(-0.5, 0.35, 0.2).normalize() } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RUIDO_GLSL + /* glsl */`
      uniform float t; uniform vec3 sol; varying vec3 vN; varying vec3 vP;
      void main(){
        vec3 p = normalize(vP);
        float faixa = sin(p.y * 22.0 + fbm(p * 4.0 + vec3(t * 0.02, 0.0, 0.0)) * 5.0);
        vec3 c = mix(vec3(0.15, 0.55, 0.6), vec3(0.55, 0.2, 0.65), faixa * 0.5 + 0.5);
        c = mix(c, vec3(0.95, 0.75, 0.55), smoothstep(0.7, 0.95, fbm(p * 9.0)) * 0.4);
        float luz = max(0.06, dot(normalize(vN), normalize((viewMatrix * vec4(sol, 0.0)).xyz)));
        // luzes da civilização no lado noturno
        float cidade = step(0.78, fbm(p * 40.0)) * (1.0 - smoothstep(0.0, 0.25, luz));
        float borda = pow(1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0))), 3.0);
        gl_FragColor = vec4(c * luz + vec3(1.0, 0.7, 0.3) * cidade * 0.9 + vec3(0.5, 0.3, 1.0) * borda * 0.6, 1.0);
      }` }))
  planeta.position.copy(P); cena.add(planeta)
  const anel = new THREE.Mesh(new THREE.RingGeometry(RP * 1.3, RP * 2.1, 128, 1), new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, uniforms: { t: tempo },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; vec4 m = modelMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * viewMatrix * m; }',
    fragmentShader: /* glsl */`uniform float t; varying vec2 vU;
      void main(){ float r = vU.x; float b = 0.5 + 0.5 * sin(r * 140.0) * sin(r * 37.0 + 1.3);
        vec3 c = mix(vec3(0.7, 0.5, 0.95), vec3(0.4, 0.95, 0.9), b);
        gl_FragColor = vec4(c, 0.35 * b + 0.1); }` }))
  anel.position.copy(P); anel.rotation.x = -Math.PI / 2 + 0.35; cena.add(anel)
  // anel orbital (estrutura artificial) com painéis de luz
  const orbital = new THREE.Mesh(new THREE.TorusGeometry(RP * 1.12, 14, 12, 220), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.35, emissive: 0x22d3ee, emissiveIntensity: 0.35 }))
  orbital.position.copy(P); orbital.rotation.x = Math.PI / 2 - 0.2; cena.add(orbital)
  animar.push((dt) => { planeta.rotation.y += dt * 0.01; orbital.rotation.z += dt * 0.02 })
  await avancar()

  // 3) megacidade flutuante: plataforma + torres instanciadas com janelas acesas
  const cidade = new THREE.Group(); cidade.position.set(0, -60, -700); cena.add(cidade)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(420, 260, 60, 64, 1), new THREE.MeshStandardMaterial({ color: 0x1f2433, metalness: 0.6, roughness: 0.5 }))
  cidade.add(base)
  const brilhoBase = new THREE.Mesh(new THREE.TorusGeometry(422, 4, 8, 160), new THREE.MeshBasicMaterial({ color: 0x5eead4 })); brilhoBase.rotation.x = Math.PI / 2; brilhoBase.position.y = 30; cidade.add(brilhoBase)
  // propulsores embaixo da plataforma
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const p = new THREE.Mesh(new THREE.ConeGeometry(40, 160, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    p.position.set(Math.cos(a) * 200, -110, Math.sin(a) * 200); p.rotation.x = Math.PI; cidade.add(p)
  }
  const janelas = texturaJanelas()
  janelas.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1)   // janelas nítidas de longe (sem serrilhado)
  const N_TORRES = 520
  const torres = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: janelas, emissiveMap: janelas, emissive: 0xffffff, emissiveIntensity: 1.1, metalness: 0.5, roughness: 0.4, color: 0x9aa3b5 }), N_TORRES)
  const dummy = new THREE.Object3D()
  let ti = 0
  for (let i = 0; i < N_TORRES; i++) {
    const r = Math.sqrt(Math.random()) * 380, a = Math.random() * Math.PI * 2
    const h = 30 + Math.pow(Math.random(), 2.2) * (r < 120 ? 520 : 260)
    const w = 10 + Math.random() * 18
    dummy.position.set(Math.cos(a) * r, 30 + h / 2, Math.sin(a) * r); dummy.scale.set(w, h, w); dummy.rotation.y = Math.random() * Math.PI
    dummy.updateMatrix(); torres.setMatrixAt(ti++, dummy.matrix)
  }
  cidade.add(torres)
  // agulhas no topo das maiores e feixes de luz para o céu
  const N_AG = 60
  const agulhas = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, emissive: 0xf0abfc, emissiveIntensity: 0.6, metalness: 0.9, roughness: 0.2 }), N_AG)
  const feixes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }), N_AG)
  for (let i = 0; i < N_AG; i++) {
    const r = Math.random() * 140, a = Math.random() * Math.PI * 2, h = 380 + Math.random() * 260
    dummy.position.set(Math.cos(a) * r, 30 + h + 40, Math.sin(a) * r); dummy.scale.set(6, 80, 6); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); agulhas.setMatrixAt(i, dummy.matrix)
    dummy.position.y = 30 + h + 900; dummy.scale.set(3, 1700, 3); dummy.updateMatrix(); feixes.setMatrixAt(i, dummy.matrix)
  }
  cidade.add(agulhas, feixes)
  // elevador espacial: da cidade até o anel orbital (um cabo de luz)
  const elev = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4200, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
  elev.position.set(0, 2100, 0); cidade.add(elev)
  const cabine = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 30, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xa78bfa, emissiveIntensity: 1 }))
  cidade.add(cabine)
  animar.push((dt, t) => { cabine.position.y = 80 + ((t * 120) % 3800); cidade.position.y = -60 + Math.sin(t * 0.3) * 6 })
  await avancar()

  // 4) rede de energia entre os topos das torres (linhas com pulso)
  const NL = 160, posL = new Float32Array(NL * 6), uL = new Float32Array(NL * 2)
  for (let i = 0; i < NL; i++) {
    const a1 = Math.random() * Math.PI * 2, r1 = Math.random() * 360, a2 = a1 + (Math.random() - 0.5) * 1.2, r2 = Math.random() * 360
    posL.set([Math.cos(a1) * r1, 120 + Math.random() * 300, Math.sin(a1) * r1, Math.cos(a2) * r2, 120 + Math.random() * 300, Math.sin(a2) * r2], i * 6)
    uL.set([0, 1], i * 2)
  }
  const gL = new THREE.BufferGeometry(); gL.setAttribute('position', new THREE.BufferAttribute(posL, 3)); gL.setAttribute('u', new THREE.BufferAttribute(uL, 1))
  const linhas = new THREE.LineSegments(gL, new THREE.ShaderMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, uniforms: { t: tempo },
    vertexShader: 'attribute float u; varying float vU; void main(){ vU = u; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float t; varying float vU; void main(){ float p = smoothstep(0.85, 1.0, 1.0 - abs(fract(vU - t * 0.6) - 0.5) * 2.0); gl_FragColor = vec4(vec3(0.4, 1.0, 0.95) * (0.15 + p), 0.25 + p); }' }))
  cidade.add(linhas)
  await avancar()

  // 5) portal de energia (anéis girando + disco que rodopia)
  const portal = new THREE.Group(); portal.position.set(-650, 120, -350); portal.rotation.y = 0.9; cena.add(portal)
  const aneisP = [140, 165, 190].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 5 - i, 10, 120), new THREE.MeshStandardMaterial({ color: 0xc4b5fd, emissive: i === 1 ? 0x22d3ee : 0xa855f7, emissiveIntensity: 1.2, metalness: 0.9, roughness: 0.2 }))
    portal.add(m); return m
  })
  const vortice = new THREE.Mesh(new THREE.CircleGeometry(136, 64), new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { t: tempo },
    vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`uniform float t; varying vec2 vU;
      void main(){ vec2 p = vU - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float s = sin(a * 6.0 + r * 18.0 - t * 4.0) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.3, 0.05, 0.6), vec3(0.3, 1.0, 0.95), s) * (1.2 - r);
        gl_FragColor = vec4(c, (1.0 - smoothstep(0.85, 1.0, r)) * 0.85); }` }))
  portal.add(vortice)
  animar.push((dt) => { aneisP.forEach((m, i) => { m.rotation.x += dt * (0.4 + i * 0.25) * (i % 2 ? -1 : 1); m.rotation.y += dt * 0.2 * (i + 1) }) })
  await avancar()

  // 6) cristais de energia flutuando (instanciados; o grupo gira)
  const cristais = new THREE.Group(); cena.add(cristais)
  const NC = 140
  const cris = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x99f6e4, emissive: 0x2dd4bf, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.9 }), NC)
  for (let i = 0; i < NC; i++) {
    const a = Math.random() * Math.PI * 2, r = 900 + Math.random() * 900
    dummy.position.set(Math.cos(a) * r, -200 + Math.random() * 700, Math.sin(a) * r - 600)
    const s = 6 + Math.random() * 26; dummy.scale.set(s, s * 2.2, s); dummy.rotation.set(Math.random(), Math.random(), Math.random()); dummy.updateMatrix(); cris.setMatrixAt(i, dummy.matrix)
  }
  cristais.add(cris)
  animar.push((dt) => { cristais.rotation.y += dt * 0.015 })
  await avancar()

  // 7) frota alienígena: discos e naves-flecha em órbitas (matrizes atualizadas por quadro: 90 instâncias)
  const disco = new THREE.LatheGeometry([[0, -2], [9, -1.2], [14, 0], [9, 1.4], [4, 3.2], [0, 3.6]].map(([x, y]) => new THREE.Vector2(x, y)), 24)
  const ND = 50, NF = 40
  const discos = new THREE.InstancedMesh(disco, new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.95, roughness: 0.25, emissive: 0x4c1d95, emissiveIntensity: 0.25 }), ND)
  const aros = new THREE.InstancedMesh(new THREE.TorusGeometry(13.5, 0.8, 6, 32), new THREE.MeshBasicMaterial({ color: 0x5eead4 }), ND)
  const flecha = new THREE.ConeGeometry(4, 22, 3); flecha.rotateX(-Math.PI / 2)
  const flechas = new THREE.InstancedMesh(flecha, new THREE.MeshStandardMaterial({ color: 0x1e1b4b, metalness: 0.7, roughness: 0.3, emissive: 0xf472b6, emissiveIntensity: 0.5 }), NF)
  const rotas = [...Array(ND + NF)].map((_, i) => ({
    c: new THREE.Vector3((Math.random() - 0.5) * 1600, 80 + Math.random() * 600, -500 + (Math.random() - 0.5) * 1600),
    r: 120 + Math.random() * 500, w: (0.05 + Math.random() * 0.15) * (Math.random() < 0.5 ? -1 : 1), f: Math.random() * 6.28, h: 20 + Math.random() * 60, disco: i < ND,
  }))
  cena.add(discos, aros, flechas)
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3()
  const posicionarFrota = (t) => {
    rotas.forEach((ro, i) => {
      const a = ro.f + t * ro.w
      p0.set(ro.c.x + Math.cos(a) * ro.r, ro.c.y + Math.sin(a * 1.7) * ro.h, ro.c.z + Math.sin(a) * ro.r)
      if (ro.disco) {
        dummy.position.copy(p0); dummy.rotation.set(Math.sin(a) * 0.2, a * 3, 0); dummy.scale.setScalar(1); dummy.updateMatrix()
        discos.setMatrixAt(i, dummy.matrix); dummy.rotation.set(Math.PI / 2 + Math.sin(a) * 0.2, 0, 0); dummy.updateMatrix(); aros.setMatrixAt(i, dummy.matrix)
      } else {
        const a2 = a + ro.w * 0.05
        p1.set(ro.c.x + Math.cos(a2) * ro.r, ro.c.y + Math.sin(a2 * 1.7) * ro.h, ro.c.z + Math.sin(a2) * ro.r)
        dummy.position.copy(p0); dummy.lookAt(p1); dummy.scale.setScalar(1); dummy.updateMatrix(); flechas.setMatrixAt(i - ND, dummy.matrix)
      }
    })
    discos.instanceMatrix.needsUpdate = aros.instanceMatrix.needsUpdate = flechas.instanceMatrix.needsUpdate = true
  }
  posicionarFrota(0)
  animar.push((dt, t) => posicionarFrota(t))
  await avancar()

  // 8) nave-mãe: lente gigante com anel de luzes que pulsa e raio de tração
  const mae = new THREE.Group(); mae.position.set(500, 700, -1300); cena.add(mae)
  const casco = new THREE.Mesh(new THREE.SphereGeometry(260, 64, 24), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.3 }))
  casco.scale.set(1, 0.18, 1); mae.add(casco)
  const luzesMae = new THREE.Mesh(new THREE.TorusGeometry(250, 6, 8, 120), new THREE.MeshBasicMaterial({ color: 0xf0abfc })); luzesMae.rotation.x = Math.PI / 2; mae.add(luzesMae)
  const cupula = new THREE.Mesh(new THREE.SphereGeometry(70, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0891b2, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }))
  cupula.position.y = 40; mae.add(cupula)
  const tracao = new THREE.Mesh(new THREE.ConeGeometry(110, 700, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
  tracao.position.y = -360; mae.add(tracao)
  animar.push((dt, t) => { mae.rotation.y += dt * 0.05; luzesMae.material.color.setHSL(0.83 + Math.sin(t) * 0.05, 0.9, 0.6 + Math.sin(t * 3) * 0.15); tracao.material.opacity = 0.06 + Math.sin(t * 2) * 0.03 })
  await avancar()

  // 9) poeira luminosa e letreiros holográficos
  const NP = 2500, pp = new Float32Array(NP * 3)
  for (let i = 0; i < NP; i++) pp.set([(Math.random() - 0.5) * 3000, -200 + Math.random() * 1400, (Math.random() - 0.5) * 3000 - 400], i * 3)
  const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.BufferAttribute(pp, 3))
  const poeira = new THREE.Points(gp, new THREE.PointsMaterial({ color: 0xc4b5fd, size: 2.2, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }))
  cena.add(poeira)
  for (const [txt, cor, pos] of [['OMEGA SETE', '#5eead4', [0, 700, -700]], ['PORTAL NORTE', '#c4b5fd', [-650, 360, -350]], ['FROTA ARKAN', '#f0abfc', [500, 900, -1300]], ['ANEL KAEL', '#67e8f9', [900, 400, -2000]]]) {
    const s = placaGlifos(txt, cor); s.position.set(...pos); s.scale.set(220, 55, 1); cena.add(s)
    animar.push((dt, t) => { s.material.opacity = 0.7 + Math.sin(t * 2 + pos[0]) * 0.25 })
  }
  await avancar()

  // 10) a nave (mesmo modelo do universo) e a compilação dos shaders antes de chegar
  const nave = criarNave(renderer)
  const ESC = 4
  nave.grupo.scale.setScalar(ESC); cena.add(nave.grupo)
  const luzN = new THREE.DirectionalLight(0xffffff, 1.6); luzN.position.set(0.7, 1.3, 0.4); nave.grupo.add(luzN); nave.grupo.add(luzN.target)
  camera.position.set(0, 40, 300); camera.lookAt(0, 0, 0)
  await compilarSeguro(renderer, cena, camera)
  await avancar()

  // ---------- voo dentro da dimensão (mesmas teclas da nave do universo) ----------
  const voo = { pos: new THREE.Vector3(0, 220, 420), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), w: new THREE.Vector3(), acel: 0.35, camOff: null, up: new THREE.Vector3(0, 1, 0) }
  const frente = new THREE.Vector3(), tmp = new THREE.Vector3(), tam = new THREE.Vector2()
  const quadro = (dt, t, teclas) => {
    tempo.value = t
    renderer.getSize(tam)
    if (Math.abs(camera.aspect - tam.x / Math.max(1, tam.y)) > 0.001) { camera.aspect = tam.x / Math.max(1, tam.y); camera.updateProjectionMatrix() }
    const T = (k) => teclas.has(k)
    if (T('w')) voo.acel = Math.min(1, voo.acel + dt * 0.6)
    if (T('s')) voo.acel = Math.max(0, voo.acel - dt * 0.8)
    if (T('x')) voo.acel = 0
    const boost = T('shift')
    const ent = new THREE.Vector3(((T('arrowdown') ? 1 : 0) - (T('arrowup') ? 1 : 0)) * 0.9, ((T('a') ? 1 : 0) - (T('d') ? 1 : 0)) * 0.9,
      ((T('q') || T('arrowleft') ? 1 : 0) - (T('e') || T('arrowright') ? 1 : 0)) * 1.4)
    voo.w.lerp(ent, 1 - Math.exp(-dt * 3.5))
    voo.quat.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(voo.w.x * dt, voo.w.y * dt, voo.w.z * dt))).normalize()
    frente.set(0, 0, -1).applyQuaternion(voo.quat)
    const vMax = 70 * (boost ? 3.5 : 1)
    if (T(' ')) { voo.vel.multiplyScalar(Math.exp(-dt * 3)); voo.acel = Math.max(0, voo.acel - dt * 1.5) }
    else voo.vel.lerp(frente.clone().multiplyScalar(voo.acel * vMax), 1 - Math.exp(-dt * (boost ? 1.6 : 0.9)))
    voo.pos.addScaledVector(voo.vel, dt)
    // limites: não atravessa o planeta nem a plataforma da cidade; longe demais, volta devagar
    tmp.copy(voo.pos).sub(P); if (tmp.length() < RP + 20) { tmp.normalize(); voo.pos.copy(P).addScaledVector(tmp, RP + 20); const vn = voo.vel.dot(tmp); if (vn < 0) voo.vel.addScaledVector(tmp, -vn) }
    tmp.copy(voo.pos).sub(cidade.position); if (Math.hypot(tmp.x, tmp.z) < 420 && tmp.y > -40 && tmp.y < 40) { voo.pos.y = cidade.position.y + (tmp.y >= 0 ? 40 : -40); voo.vel.y = 0 }
    if (voo.pos.length() > 4200) voo.vel.addScaledVector(voo.pos.clone().normalize(), -dt * 60)
    nave.grupo.position.copy(voo.pos); nave.grupo.quaternion.copy(voo.quat)
    nave.atualizar(dt, t, { empuxo: voo.acel, boost, guinada: voo.w.y, arfagem: voo.w.x, rolagem: voo.w.z })
    // câmera de perseguição
    const atras = new THREE.Vector3(0, 0.32, 1.7 + Math.min(0.8, voo.vel.length() / vMax)).multiplyScalar(ESC).applyQuaternion(voo.quat)
    if (!voo.camOff) voo.camOff = atras.clone()
    voo.camOff.lerp(atras, 1 - Math.exp(-dt * 6))
    camera.position.copy(voo.pos).add(voo.camOff)
    voo.up.lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(voo.quat), 1 - Math.exp(-dt * 4)).normalize(); camera.up.copy(voo.up)
    camera.lookAt(tmp.copy(voo.pos).add(new THREE.Vector3(0, 0.12, -0.9).multiplyScalar(ESC).applyQuaternion(voo.quat)))
    const fovAlvo = 62 + (boost ? 14 : 0)
    if (Math.abs(camera.fov - fovAlvo) > 0.2) { camera.fov += (fovAlvo - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix() }
    for (const f of animar) f(dt, t)
    renderer.render(cena, camera)
    return { empuxo: voo.acel, boost, vel: voo.vel.length() }
  }

  const descartar = () => {
    nave.descartar?.()
    cena.traverse((o) => {
      o.geometry?.dispose?.()
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      ms.forEach((m) => { m.map?.dispose?.(); m.emissiveMap?.dispose?.(); m.dispose?.() })
    })
    janelas.dispose()
  }
  return { cena, camera, quadro, descartar }
}
