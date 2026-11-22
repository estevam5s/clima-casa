import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Raspberry Pi 3 Model B em 3D (three.js), nas medidas reais (85 × 56 mm, unidades em mm), desenhado por código.
// Mostra o estado real do agente que roda nele:
// - LED verde (ACT) pisca com a atividade; LED vermelho (PWR) aceso e piscando quando a fonte está fraca (como na placa);
// - ativo na rede dos transmissores: pacotes de dados saindo pelo cabo (Ethernet, com os LEDs da porta) ou pela antena
//   (ondas do Wi-Fi); fora da rede: poucos pacotes, âmbar; desligado: tudo apagado e parado;
// - o processador esquenta de cor conforme a temperatura que o próprio Raspberry informa.
// Passar o mouse numa peça mostra o que ela é. Arrastar gira. Respeita "reduzir movimento". Só desenha visível.

const PECAS = {
  soc: 'Processador BCM2837: 4 núcleos ARM Cortex-A53 a 1,2 GHz (64 bits)',
  ram: 'Memória: 1 GB LPDDR2 (embaixo da placa)',
  lan: 'Controlador USB e Ethernet (LAN9514)',
  usb: '4 portas USB 2.0',
  eth: 'Ethernet 10/100: cabo de rede (recomendado para o agente)',
  gpio: 'GPIO: 40 pinos (sensores, relés, placas)',
  hdmi: 'Saída HDMI (monitor)',
  pwr: 'Alimentação micro USB: 5 V, 2,5 A (fonte oficial)',
  audio: 'Áudio e vídeo composto (P2, 3,5 mm)',
  csi: 'Conector da câmera (CSI)',
  dsi: 'Conector da tela (DSI)',
  wifi: 'Wi-Fi 2,4 GHz e Bluetooth 4.1 (BCM43438)',
  antena: 'Antena do Wi-Fi e do Bluetooth',
  sd: 'Cartão microSD (sistema e agente)',
  leds: 'LEDs: vermelho = energia (pisca se a fonte estiver fraca), verde = atividade',
  pcb: 'Raspberry Pi 3 Model B (85 × 56 mm)',
}

// número aleatório com semente: a placa sai sempre igual
function sorteio(semente) { let s = semente >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

// textura da placa: máscara verde, trilhas de cobre, vias, ilhas douradas e a serigrafia
function texturaPcb() {
  const W = 2048, H = Math.round(2048 * 56 / 85)
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d'), sx = W / 85, sy = H / 56, r = sorteio(7)
  const fundo = g.createLinearGradient(0, 0, W, H); fundo.addColorStop(0, '#1d6b34'); fundo.addColorStop(1, '#17592b')
  g.fillStyle = fundo; g.fillRect(0, 0, W, H)
  // cobre sob a máscara (áreas de terra mais claras)
  g.globalAlpha = 0.18; g.fillStyle = '#3fae5c'
  for (let i = 0; i < 26; i++) g.fillRect(r() * W, r() * H, (6 + r() * 18) * sx, (3 + r() * 10) * sy)
  g.globalAlpha = 1
  // trilhas em 45°/90°
  g.lineCap = 'round'; g.lineJoin = 'round'
  for (let i = 0; i < 200; i++) {
    g.strokeStyle = r() < 0.5 ? 'rgba(64,150,86,0.32)' : 'rgba(46,128,68,0.38)'
    g.lineWidth = (0.12 + r() * 0.22) * sx
    let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y)
    for (let k = 0; k < 3 + Math.floor(r() * 4); k++) {
      const d = (3 + r() * 14) * sx, a = Math.floor(r() * 8) * Math.PI / 4
      x += Math.cos(a) * d; y += Math.sin(a) * d; g.lineTo(x, y)
    }
    g.stroke()
  }
  // vias
  for (let i = 0; i < 420; i++) { const x = r() * W, y = r() * H; g.fillStyle = '#c9a54a'; g.beginPath(); g.arc(x, y, 0.32 * sx, 0, 7); g.fill(); g.fillStyle = '#0f3a1c'; g.beginPath(); g.arc(x, y, 0.15 * sx, 0, 7); g.fill() }
  // furos de fixação com anel dourado
  for (const [x, y] of [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) {
    g.fillStyle = '#d8b24a'; g.beginPath(); g.arc(x * sx, y * sy, 3.1 * sx, 0, 7); g.fill()
  }
  // ilhas da GPIO
  for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) { g.fillStyle = '#d8b24a'; g.beginPath(); g.arc((8.37 + i * 2.54) * sx, (2.23 + j * 2.54) * sy, 0.85 * sx, 0, 7); g.fill() }
  // serigrafia
  g.fillStyle = 'rgba(245,245,240,0.92)'; g.textBaseline = 'middle'
  const txt = (t, x, y, tam, rot = 0, peso = '600') => { g.save(); g.translate(x * sx, y * sy); g.rotate(rot); g.font = `${peso} ${tam * sx}px Arial, sans-serif`; g.fillText(t, 0, 0); g.restore() }
  txt('Raspberry Pi 3 Model B V1.2', 18, 13.5, 2.4, 0, '700')
  txt('© Raspberry Pi 2015', 18, 17, 1.7)
  txt('J8', 4.6, 8.2, 1.4); txt('GPIO', 52, 8.6, 1.3)
  txt('HDMI', 28.5, 45.5, 1.4); txt('PWR IN', 6.8, 49.5, 1.3); txt('AUDIO', 50, 44, 1.3)
  txt('CAMERA', 38.5, 41, 1.3); txt('DISPLAY', 6.6, 24, 1.3, -Math.PI / 2)
  txt('ACT', 3.4, 41.2, 1.0); txt('PWR', 3.4, 44.2, 1.0)
  // contornos dos componentes (serigrafia)
  g.strokeStyle = 'rgba(245,245,240,0.6)'; g.lineWidth = 0.18 * sx
  for (const [x, y, w, h] of [[21.5, 25, 15, 15], [56, 26, 10, 10], [20, 44, 25, 12], [9.5, 6.5, 7, 7]]) g.strokeRect(x * sx, y * sy, w * sx, h * sy)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8
  return t
}

// brilho redondo (LEDs, pacotes): sprite somado à cena, faz o papel do "bloom" sem pós-processamento
function texturaBrilho() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export default function Raspberry3D({ estado = 'ativo', temperatura = null, rede = 'cabo', subtensao = false, altura = 260 }) {
  const ref = useRef(null)
  const vivo = useRef({ estado, temperatura, rede, subtensao })
  const [dica, setDica] = useState(null)   // { x, y, texto }
  vivo.current = { estado, temperatura, rede, subtensao }

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y'

    const cena = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    cena.environment = ambiente
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 1000)
    camera.position.set(60, 70, 96)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.dampingFactor = 0.08; controles.enablePan = false
    controles.minDistance = 60; controles.maxDistance = 200; controles.maxPolarAngle = Math.PI * 0.62
    controles.target.set(4, 1, 2)
    controles.autoRotate = !calmo; controles.autoRotateSpeed = 0.55

    cena.add(new THREE.HemisphereLight(0xffffff, 0x3a4a40, 0.55))
    const sol = new THREE.DirectionalLight(0xffffff, 2.1)
    sol.position.set(40, 120, 60); sol.castShadow = true
    Object.assign(sol.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 260 })
    sol.shadow.mapSize.set(1024, 1024); sol.shadow.bias = -0.0004; sol.shadow.radius = 4
    cena.add(sol)
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.22 }))
    chao.rotation.x = -Math.PI / 2; chao.position.y = -11; chao.receiveShadow = true; cena.add(chao)

    const placa = new THREE.Group(); cena.add(placa)
    const descartar = []
    const guardar = (o) => { descartar.push(o); return o }
    // coordenadas da placa (x da esquerda 0–85, y a partir da borda da GPIO 0–56) para a cena
    const P = (bx, by) => [bx - 42.5, by - 28]
    const TOPO = 0.7

    // materiais
    const M = {
      metal: guardar(new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.28 })),
      metalEscovado: guardar(new THREE.MeshStandardMaterial({ color: 0xbfc4c9, metalness: 1, roughness: 0.42 })),
      ouro: guardar(new THREE.MeshStandardMaterial({ color: 0xe2b74a, metalness: 1, roughness: 0.25 })),
      preto: guardar(new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.05, roughness: 0.55 })),
      epoxi: guardar(new THREE.MeshPhysicalMaterial({ color: 0x1a1b1e, metalness: 0.1, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 })),
      bege: guardar(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 })),
      buraco: guardar(new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9 })),
      plasticoUsb: guardar(new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 })),
      ceramica: guardar(new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.4 })),
      sd: guardar(new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.45 })),
      substrato: guardar(new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.6 })),
    }
    const peca = (mesh, chave) => { mesh.userData.peca = chave; mesh.castShadow = true; mesh.receiveShadow = true; return mesh }
    const caixa = (w, d, h, mat, bx, by, y0 = TOPO, chave = null, arredonda = 0) => {
      const geo = guardar(arredonda ? new RoundedBoxGeometry(w, h, d, 2, arredonda) : new THREE.BoxGeometry(w, h, d))
      const m = new THREE.Mesh(geo, mat); const [x, z] = P(bx, by)
      m.position.set(x, y0 + h / 2, z); placa.add(chave ? peca(m, chave) : peca(m, 'pcb')); return m
    }

    // placa de circuito com cantos arredondados e furos de fixação
    const forma = new THREE.Shape(), R = 3, w2 = 42.5, d2 = 28
    forma.moveTo(-w2 + R, -d2); forma.lineTo(w2 - R, -d2); forma.quadraticCurveTo(w2, -d2, w2, -d2 + R)
    forma.lineTo(w2, d2 - R); forma.quadraticCurveTo(w2, d2, w2 - R, d2); forma.lineTo(-w2 + R, d2)
    forma.quadraticCurveTo(-w2, d2, -w2, d2 - R); forma.lineTo(-w2, -d2 + R); forma.quadraticCurveTo(-w2, -d2, -w2 + R, -d2)
    for (const [bx, by] of [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) {
      const furo = new THREE.Path(); const [x, z] = P(bx, by); furo.absarc(x, -z, 1.375, 0, Math.PI * 2, true); forma.holes.push(furo)
    }
    const geoPcb = guardar(new THREE.ExtrudeGeometry(forma, { depth: 1.4, bevelEnabled: false, curveSegments: 24 }))
    geoPcb.rotateX(-Math.PI / 2); geoPcb.translate(0, -TOPO, 0)
    const tex = guardar(texturaPcb()); tex.repeat.set(1 / 85, 1 / 56); tex.offset.set(0.5, 0.5)
    const matPcb = guardar(new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32 }))
    const matBorda = guardar(new THREE.MeshStandardMaterial({ color: 0x1c5a2f, roughness: 0.7 }))
    const pcb = new THREE.Mesh(geoPcb, [matPcb, matBorda]); pcb.castShadow = true; pcb.receiveShadow = true; pcb.userData.peca = 'pcb'
    placa.add(pcb)

    // processador (substrato + tampa de epóxi) e o brilho do calor
    caixa(14, 14, 0.5, M.substrato, 29, 32, TOPO, 'soc')
    const soc = caixa(12.2, 12.2, 0.75, guardar(M.epoxi.clone()), 29, 32, TOPO + 0.5, 'soc', 0.25)
    const memoria = caixa(12, 12, 1.1, M.epoxi, 29, 32, -TOPO - 1.1, 'ram', 0.2)
    void memoria
    caixa(9, 9, 1, M.epoxi, 61, 31, TOPO, 'lan', 0.2)
    caixa(5.5, 5.5, 0.9, M.epoxi, 13, 10, TOPO, 'wifi', 0.15)
    caixa(1.8, 5, 1, M.ceramica, 2.6, 15, TOPO, 'antena', 0.2)

    // GPIO: base preta e 40 pinos dourados (instanciados)
    caixa(50.8, 5.08, 2.5, M.preto, 32.5, 3.5, TOPO, 'gpio')
    const geoPino = guardar(new THREE.BoxGeometry(0.64, 11, 0.64))
    const pinos = new THREE.InstancedMesh(geoPino, M.ouro, 40); peca(pinos, 'gpio')
    const mm = new THREE.Matrix4(); let n = 0
    for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) { const [x, z] = P(8.37 + i * 2.54, 2.23 + j * 2.54); mm.makeTranslation(x, TOPO - 2.5 + 5.5, z); pinos.setMatrixAt(n++, mm) }
    placa.add(pinos)

    // USB: dois blocos duplos de metal com as bocas pretas e a lingueta plástica
    for (const by of [29, 47]) {
      caixa(17, 13.1, 15.6, M.metal, 79.2, by, TOPO, 'usb', 0.35)
      for (const h of [3.2, 11]) {
        const [x, z] = P(87.75, by)
        const boca = new THREE.Mesh(guardar(new THREE.BoxGeometry(0.3, 5.2, 12)), M.buraco); boca.position.set(x, TOPO + h, z); placa.add(peca(boca, 'usb'))
        const lingueta = new THREE.Mesh(guardar(new THREE.BoxGeometry(0.4, 1.7, 10.4)), M.plasticoUsb); lingueta.position.set(x - 0.05, TOPO + h + 0.9, z); placa.add(peca(lingueta, 'usb'))
      }
    }
    // Ethernet com os dois LEDs da porta (link e atividade)
    caixa(21, 16, 13.5, M.metalEscovado, 77.2, 10.25, TOPO, 'eth', 0.35)
    const [ex, ez] = P(87.75, 10.25)
    const bocaEth = new THREE.Mesh(guardar(new THREE.BoxGeometry(0.3, 9, 12)), M.buraco); bocaEth.position.set(ex, TOPO + 6, ez); placa.add(peca(bocaEth, 'eth'))
    const ledEth = [0x22c55e, 0xf59e0b].map((cor, i) => {
      const mat = guardar(new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0 }))
      const l = new THREE.Mesh(guardar(new THREE.BoxGeometry(0.4, 1.6, 2.4)), mat); l.position.set(ex + 0.05, TOPO + 11.5, ez + (i ? 4.6 : -4.6)); placa.add(peca(l, 'eth')); return mat
    })
    // HDMI, micro USB, áudio, câmera, tela, microSD
    caixa(15, 11.5, 6.5, M.metal, 32, 51.25, TOPO, 'hdmi', 0.3)
    { const [x, z] = P(32, 57.05); const b = new THREE.Mesh(guardar(new THREE.BoxGeometry(13.5, 4.4, 0.3)), M.buraco); b.position.set(x, TOPO + 3.4, z); placa.add(peca(b, 'hdmi')) }
    caixa(8, 5.6, 3, M.metal, 10.6, 54.2, TOPO, 'pwr', 0.4)
    { const [x, z] = P(10.6, 57.05); const b = new THREE.Mesh(guardar(new THREE.BoxGeometry(6.8, 1.8, 0.3)), M.buraco); b.position.set(x, TOPO + 1.5, z); placa.add(peca(b, 'pwr')) }
    caixa(7, 12, 6, M.preto, 53.5, 50.5, TOPO, 'audio', 0.4)
    { const [x, z] = P(53.5, 57.2); const cil = new THREE.Mesh(guardar(new THREE.CylinderGeometry(3, 3, 2.6, 32)), M.preto); cil.rotation.x = Math.PI / 2; cil.position.set(x, TOPO + 3.2, z); placa.add(peca(cil, 'audio'))
      const fu = new THREE.Mesh(guardar(new THREE.CylinderGeometry(1.75, 1.75, 2.7, 24)), M.buraco); fu.rotation.x = Math.PI / 2; fu.position.set(x, TOPO + 3.2, z + 0.05); placa.add(peca(fu, 'audio')) }
    caixa(22, 3, 5.5, M.bege, 45, 44.5, TOPO, 'csi', 0.2)
    caixa(3, 22, 5.5, M.bege, 4, 28, TOPO, 'dsi', 0.2)
    caixa(14, 15, 1.6, M.metalEscovado, 8, 28, -TOPO - 1.6, 'sd', 0.15)
    caixa(11, 15, 0.8, M.sd, 2, 28, -TOPO - 1.25, 'sd', 0.3)

    // LEDs da placa: ACT (verde) e PWR (vermelho), com brilho
    const brilho = guardar(texturaBrilho())
    const led = (cor, by) => {
      const mat = guardar(new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0, roughness: 0.3 }))
      caixa(1.6, 0.8, 0.6, mat, 1.8, by, TOPO, 'leds')
      const s = new THREE.Sprite(guardar(new THREE.SpriteMaterial({ map: brilho, color: cor, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })))
      const [x, z] = P(1.8, by); s.position.set(x, TOPO + 0.9, z); s.scale.set(7, 7, 1); placa.add(s)
      return { mat, s }
    }
    const act = led(0x22e05a, 41.2), pwr = led(0xff2a2a, 44.2)

    // componentes pequenos (capacitores e resistores SMD) espalhados longe das peças grandes
    const ocupado = [[21, 24, 37, 41], [55, 25, 67, 37], [6, 0, 59, 7], [66, 2, 88, 55], [23, 44, 41, 57], [5, 50, 15, 57], [49, 43, 58, 57], [33, 42, 57, 47], [2, 16, 6, 40], [9, 6, 17, 14], [0, 13, 4, 18], [0, 38, 4, 46]]
    const livre = (x, y) => x > 1.5 && x < 84 && y > 1.5 && y < 55 && !ocupado.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)
    const r = sorteio(11), geoSmd = guardar(new THREE.BoxGeometry(1, 0.5, 0.5))
    const smdCap = new THREE.InstancedMesh(geoSmd, guardar(new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 0.5 })), 150)
    const smdRes = new THREE.InstancedMesh(geoSmd, M.preto, 110)
    const q = new THREE.Quaternion(), v = new THREE.Vector3(), esc = new THREE.Vector3(1, 1, 1)
    for (const [mesh, total] of [[smdCap, 150], [smdRes, 110]]) {
      let k = 0, tent = 0
      while (k < total && tent++ < 5000) {
        const bx = r() * 85, by = r() * 56
        if (!livre(bx, by)) continue
        const [x, z] = P(bx, by); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() < 0.5 ? 0 : Math.PI / 2)
        v.set(x, TOPO + 0.25, z); esc.set(mesh === smdRes ? 0.9 : 1, mesh === smdRes ? 0.7 : 1, 1); mm.compose(v, q, esc); mesh.setMatrixAt(k++, mm)
      }
      mesh.count = k; mesh.castShadow = true; mesh.userData.peca = 'pcb'; placa.add(mesh)
    }

    // calor do processador: brilho alaranjado por cima, mais forte quanto mais quente
    const calor = new THREE.Sprite(guardar(new THREE.SpriteMaterial({ map: brilho, color: 0xff7a1a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })))
    { const [x, z] = P(29, 32); calor.position.set(x, TOPO + 2.2, z); calor.scale.set(26, 26, 1); placa.add(calor) }

    // pacotes de dados: saem do processador, passam pelo controlador e vão pela Ethernet (cabo) ou pela antena (Wi-Fi)
    const pt = (bx, by, h) => { const [x, z] = P(bx, by); return new THREE.Vector3(x, h, z) }
    const rotaCabo = new THREE.CatmullRomCurve3([pt(29, 32, 2.2), pt(45, 31, 1.6), pt(61, 31, 2.2), pt(72, 16, 4), pt(88, 10.25, 6), pt(115, 10.25, 7)])
    const rotaWifi = new THREE.CatmullRomCurve3([pt(29, 32, 2.2), pt(18, 18, 1.6), pt(13, 10, 1.8), pt(2.6, 15, 1.8), pt(-14, 15, 7), pt(-34, 15, 14)])
    const N_PAC = 14
    const pacotes = Array.from({ length: N_PAC }, (_, i) => {
      const s = new THREE.Sprite(guardar(new THREE.SpriteMaterial({ map: brilho, color: 0x34d399, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })))
      s.scale.set(4.6, 4.6, 1); placa.add(s); return { s, fase: i / N_PAC, volta: i % 3 === 0 }
    })
    // ondas do Wi-Fi saindo da antena
    const ondas = Array.from({ length: 3 }, (_, i) => {
      const m = new THREE.Mesh(guardar(new THREE.TorusGeometry(1, 0.08, 6, 48)), guardar(new THREE.MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0, depthWrite: false })))
      const [x, z] = P(2.6, 15); m.position.set(x, TOPO + 2, z); m.rotation.y = Math.PI / 2; placa.add(m); return { m, fase: i / 3 }
    })

    // passar o mouse: nome da peça
    const raio = new THREE.Raycaster(), mouse = new THREE.Vector2()
    let ultimoMove = 0
    const mover = (e) => {
      const agora = performance.now(); if (agora - ultimoMove < 60) return; ultimoMove = agora
      const b = renderer.domElement.getBoundingClientRect()
      mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1)
      raio.setFromCamera(mouse, camera)
      const alvo = raio.intersectObjects(placa.children, false).find((h) => h.object.userData.peca)
      setDica(alvo ? { x: e.clientX - b.left, y: e.clientY - b.top, texto: PECAS[alvo.object.userData.peca] } : null)
    }
    const sair = () => setDica(null)
    renderer.domElement.addEventListener('pointermove', mover)
    renderer.domElement.addEventListener('pointerleave', sair)
    let parado = 0
    controles.addEventListener('start', () => { controles.autoRotate = false })
    controles.addEventListener('end', () => { parado = performance.now() })

    // laço: só desenha com a aba visível e o quadro na tela
    let visivel = true, quadro = 0
    const io = new IntersectionObserver(([en]) => { visivel = en.isIntersecting }, { rootMargin: '60px' }); io.observe(el)
    const distBase = camera.position.distanceTo(controles.target)
    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix()
      // quadro estreito (celular): afasta a câmera para a placa inteira caber de lado a lado
      const dist = distBase * Math.max(1, 2.1 / camera.aspect)
      camera.position.sub(controles.target).setLength(Math.min(dist, controles.maxDistance)).add(controles.target)
    }
    const ro = new ResizeObserver(ajustar); ro.observe(el); ajustar()
    const relogio = new THREE.Clock()
    const cor = new THREE.Color(), verde = new THREE.Color(0x34d399), ambar = new THREE.Color(0xfbbf24)
    let piscaAct = 0, proxAct = 0
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (!visivel || document.hidden) { relogio.getDelta(); return }
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      const { estado: st, temperatura: temp, rede: rd, subtensao: sub } = vivo.current
      const ligado = st !== 'desligado', ativo = st === 'ativo'
      if (!calmo && !controles.autoRotate && parado && performance.now() - parado > 4000) controles.autoRotate = true
      placa.position.y = calmo ? 0 : Math.sin(t * 0.9) * 0.8
      // PWR: aceso; com fonte fraca pisca (a placa de verdade apaga o LED vermelho quando a tensão cai)
      const pwrLuz = !ligado ? 0 : sub ? (Math.sin(t * 9) > 0 ? 2.4 : 0.1) : 2.4
      pwr.mat.emissiveIntensity = pwrLuz; pwr.s.material.opacity = pwrLuz / 4
      // ACT: piscadas curtas e irregulares (leitura do cartão), mais frequentes quando ativo
      if (ligado && t > proxAct) { piscaAct = 0.09 + Math.random() * 0.12; proxAct = t + (ativo ? 0.15 + Math.random() * 0.6 : 0.8 + Math.random() * 2) }
      piscaAct -= dt
      const actLuz = ligado && piscaAct > 0 ? 3 : 0
      act.mat.emissiveIntensity = actLuz; act.s.material.opacity = actLuz / 4
      // LEDs da Ethernet: link aceso quando no cabo; atividade piscando com o tráfego
      const noCabo = ligado && rd === 'cabo'
      ledEth[0].emissiveIntensity = noCabo ? 1.6 : 0
      ledEth[1].emissiveIntensity = noCabo && (ativo ? Math.random() < 0.35 : Math.random() < 0.05) ? 2 : 0
      // calor do processador: 40 °C ninguém nota; 80 °C fica bem laranja
      const q = temp == null ? 0.15 : Math.min(1, Math.max(0, (temp - 40) / 40))
      calor.material.opacity = ligado ? q * (0.55 + Math.sin(t * 2.3) * 0.08) : 0
      cor.setRGB(0.1 + q * 0.5, 0.1 + q * 0.12, 0.1)
      soc.material.emissive.copy(cor).multiplyScalar(ligado ? 0.6 * q : 0)
      // pacotes e ondas
      const rota = rd === 'wifi' ? rotaWifi : rotaCabo
      const corPac = ativo ? verde : ambar, quantos = ativo ? N_PAC : ligado ? 3 : 0, vel = ativo ? 0.22 : 0.07
      pacotes.forEach((p, i) => {
        if (i >= quantos || calmo) { p.s.material.opacity = 0; return }
        p.fase = (p.fase + dt * vel) % 1
        const u = p.volta ? 1 - p.fase : p.fase
        p.s.position.copy(rota.getPointAt(u))
        p.s.material.color.copy(corPac)
        p.s.material.opacity = Math.sin(p.fase * Math.PI) * (ativo ? 0.95 : 0.5)
      })
      ondas.forEach((o) => {
        if (calmo || !ligado || rd !== 'wifi') { o.m.material.opacity = 0; return }
        o.fase = (o.fase + dt * (ativo ? 0.45 : 0.15)) % 1
        const raioOnda = 2 + o.fase * 22
        o.m.scale.set(raioOnda, raioOnda, raioOnda); o.m.material.color.copy(corPac); o.m.material.opacity = (1 - o.fase) * (ativo ? 0.55 : 0.25)
      })
      controles.update()
      renderer.render(cena, camera)
    }
    laco()

    return () => {
      cancelAnimationFrame(quadro); io.disconnect(); ro.disconnect(); controles.dispose()
      renderer.domElement.removeEventListener('pointermove', mover); renderer.domElement.removeEventListener('pointerleave', sair)
      descartar.forEach((o) => o.dispose?.()); chao.geometry.dispose(); chao.material.dispose(); ambiente.dispose(); pmrem.dispose()
      cena.traverse((o) => { if (o.isInstancedMesh) o.dispose() })
      renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="relative w-full select-none" style={{ height: altura }} ref={ref} aria-label="Raspberry Pi 3 Model B em 3D: arraste para girar" role="img">
      {dica && <span className="pointer-events-none absolute z-10 max-w-[16rem] rounded-md border border-border bg-card/95 px-2 py-1 text-xs shadow-sm backdrop-blur" style={{ left: Math.min(dica.x + 12, (ref.current?.clientWidth || 300) - 200), top: Math.max(4, dica.y - 34) }}>{dica.texto}</span>} {/* marca: dica flutua sobre o 3D */}
    </div>
  )
}
