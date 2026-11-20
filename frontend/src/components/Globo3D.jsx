import { compilarSeguro } from './compilar3d'
import { useEffect, useRef, useState } from 'react'
import { Compass, Crosshair, FastForward, Globe2, Info, Maximize2, Minimize2, Minus, Orbit, Pause, Play, Plus, Rocket, RotateCcw, Route, Satellite, SkipForward, Volume2, VolumeX, X, Zap } from 'lucide-react'
import { criarSom } from './somNave'
import { criarAurora, criarMeteoros, criarNave } from './nave3d'
import { api } from '../api'
import { criarSatelites, GRUPOS_SAT } from './satelites3d'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { criarUniverso, luzesDasCidades } from './universo'
import { COR_ASTRO, GRUPOS_ASTROS, INFO_ASTROS } from './astros-info'
import { criarMarcos, MARCOS } from './marcos3d'
import { criarExoplanetas } from './exoplanetas3d'

// Globo de acessos em Three.js, desenhado a partir de dados reais:
// - Terra: países do world-atlas (Natural Earth 1:50m) pintados numa textura equirretangular, com fronteiras e litoral;
// - dia e noite pela posição real do Sol agora (ponto subsolar calculado pela data/hora UTC), reflexo do Sol no oceano;
// - atmosfera, estrelas, colunas por cidade (altura = volume), arcos com pulso de luz até o servidor e onda de impacto;
// - nome das cidades com mais movimento acompanhando a rotação.
// pontos: [{lat, lon, cidade, pais, acesso, login, robo, ataque, ips, ultimo}], servidor: {lat, lon, nome}
const R = 1
const CORES = { ataque: 0xef4444, login: 0x22c55e, robo: 0xf59e0b, acesso: 0x2dd4bf }
const ORDEM = ['ataque', 'login', 'robo', 'acesso']

function vetor(lat, lon, r = R) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

const categoria = (p) => ORDEM.find((k) => (p[k] || 0) > 0) || 'acesso'
const total = (p) => (p.acesso || 0) + (p.login || 0) + (p.robo || 0) + (p.ataque || 0)

// Ponto da Terra onde o Sol está a pino agora (aproximação astronômica, erro < 1°).
function pontoSubsolar(data = new Date()) {
  const inicio = Date.UTC(data.getUTCFullYear(), 0, 0)
  const dia = (data - inicio) / 86400000
  const g = (2 * Math.PI / 365) * (dia - 1 + (data.getUTCHours() - 12) / 24)
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const minutos = data.getUTCHours() * 60 + data.getUTCMinutes() + data.getUTCSeconds() / 60
  return { lat: decl * 180 / Math.PI, lon: -((minutos + eqt) / 4 - 180) }
}

// ruído suave (value noise com 5 oitavas) que dá a volta na longitude: relevo, biomas e nuvens sem imagem externa
function criarRuido(semente = 1) {
  const P = new Uint8Array(512); let s = semente
  for (let i = 0; i < 256; i++) P[i] = i
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [P[i], P[j]] = [P[j], P[i]] }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i]
  const v = (x, y) => P[(P[x & 255] + y) & 255] / 255
  const sm = (t) => t * t * (3 - 2 * t)
  const n2 = (x, y, per) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi
    const a = v(xi % per, yi), b = v((xi + 1) % per, yi), c = v(xi % per, yi + 1), d = v((xi + 1) % per, yi + 1)
    const u = sm(xf), w = sm(yf)
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w
  }
  return (x, y, oit = 5, base = 8) => { let t = 0, amp = 0.5, f = base; for (let o = 0; o < oit; o++) { t += amp * n2(x * f, y * f, f); amp *= 0.5; f *= 2 } return t }
}

// Texturas do dia (cores), da noite (litoral e fronteiras acesos) e máscara de água (para o brilho do Sol).
async function texturasTerra() {
  const [{ feature, mesh }, mundo] = await Promise.all([import('topojson-client'), import('world-atlas/countries-50m.json')])
  const topo = mundo.default || mundo
  const paises = feature(topo, topo.objects.countries)
  const fronteiras = mesh(topo, topo.objects.countries, (a, b) => a !== b)
  const litoral = mesh(topo, topo.objects.countries, (a, b) => a === b)
  // 2048×1024 (antes 4096×2048): 4× menos memória e tempo; a pausa entre as etapas devolve o controle ao navegador
  const L = 2048, A = 1024
  const pausa = () => new Promise((r) => setTimeout(r, 0))
  const px = ([lon, lat]) => [(lon + 180) / 360 * L, (90 - lat) / 180 * A]
  const tracar = (g, geometria) => {
    const linhas = geometria.type === 'MultiLineString' ? geometria.coordinates : [geometria.coordinates]
    for (const linha of linhas) {
      let ant = null
      linha.forEach((p, i) => {
        const [x, y] = px(p)
        if (!i || (ant && Math.abs(x - ant) > L / 2)) g.moveTo(x, y); else g.lineTo(x, y) // não cruza o antimeridiano
        ant = x
      })
    }
  }
  const preencher = (g) => {
    for (const f of paises.features) {
      if (!f.geometry) continue
      const polis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
      for (const poli of polis) {
        g.beginPath()
        for (const anel of poli) {
          let ant = null
          anel.forEach((p, i) => { const [x, y] = px(p); if (!i || Math.abs(x - ant) > L / 2) g.moveTo(x, y); else g.lineTo(x, y); ant = x })
          g.closePath()
        }
        g.fill('evenodd')
      }
    }
  }
  const tela = () => { const c = document.createElement('canvas'); c.width = L; c.height = A; return [c, c.getContext('2d')] }

  // dia: oceano com profundidade (mais escuro no meio dos oceanos, mais claro nos polos), terra com relevo leve por latitude
  const [cDia, d] = tela()
  const mar = d.createLinearGradient(0, 0, 0, A)
  mar.addColorStop(0, '#16324a'); mar.addColorStop(0.18, '#0d2a45'); mar.addColorStop(0.5, '#0a2440'); mar.addColorStop(0.82, '#0d2a45'); mar.addColorStop(1, '#1d3a52')
  d.fillStyle = mar; d.fillRect(0, 0, L, A)
  // biomas (ilustração): gelo nos polos, tundra, floresta temperada, cinturão de desertos perto dos trópicos, savana e
  // floresta tropical no equador; o ruído quebra as faixas e o relevo sombreado (luz de noroeste) dá volume
  const BL = 512, BA = 256, relevo = criarRuido(7), umid = criarRuido(19)
  const cB = document.createElement('canvas'); cB.width = BL; cB.height = BA
  const gB = cB.getContext('2d'), img = gB.createImageData(BL, BA)
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const C = { gelo: [236, 241, 245], tundra: [128, 138, 118], boreal: [52, 74, 50], temperada: [70, 102, 56], estepe: [150, 146, 98], deserto: [205, 172, 120], savana: [148, 140, 72], tropical: [34, 84, 38] }
  for (let y = 0; y < BA; y++) {
    const lat = Math.abs(90 - (y + 0.5) / BA * 180)
    for (let x = 0; x < BL; x++) {
      const u = x / BL, w = y / BA
      const h = relevo(u, w * 0.5, 5, 6), um = umid(u, w * 0.5, 4, 4)
      const latR = lat + (h - 0.5) * 14
      let cor
      if (latR > 70) cor = mix(C.tundra, C.gelo, Math.min(1, (latR - 70) / 8))
      else if (latR > 55) cor = mix(C.boreal, C.tundra, (latR - 55) / 15)
      else if (latR > 38) cor = mix(C.temperada, C.boreal, (latR - 38) / 17)
      else if (latR > 14) { const seco = Math.max(0, 1 - Math.abs(latR - 25) / 12) * (1.2 - um); cor = mix(mix(C.temperada, C.estepe, Math.min(1, (latR - 14) / 10)), C.deserto, Math.min(1, seco * 1.4)) }
      else cor = mix(C.tropical, C.savana, Math.max(0, Math.min(1, (0.55 - um) * 2.2 + latR / 40)))
      const dx = relevo((x + 1) / BL, w * 0.5, 5, 6) - h, dy = relevo(u, (y + 1) / BA * 0.5, 5, 6) - h
      const luz = 1 + (-dx - dy) * 38 + (h - 0.5) * 0.25
      const i = (y * BL + x) * 4
      img.data[i] = Math.min(255, cor[0] * luz); img.data[i + 1] = Math.min(255, cor[1] * luz); img.data[i + 2] = Math.min(255, cor[2] * luz); img.data[i + 3] = 255
    }
  }
  gB.putImageData(img, 0, 0)
  await pausa()
  // recorta os biomas pelo contorno dos continentes
  const [cT, gT] = tela(); gT.fillStyle = '#000'; preencher(gT); gT.globalCompositeOperation = 'source-in'; gT.imageSmoothingQuality = 'high'; gT.drawImage(cB, 0, 0, L, A)
  // águas rasas perto da costa: litoral borrado em azul mais claro antes de pintar a terra
  // (desenhada pequena e ampliada: o filtro blur() na textura inteira travava a placa de vídeo por segundos)
  { const cR = document.createElement('canvas'); cR.width = L / 8; cR.height = A / 8; const gR = cR.getContext('2d')
    gR.scale(1 / 8, 1 / 8); gR.fillStyle = 'rgba(40,110,150,0.55)'; preencher(gR)
    d.save(); d.imageSmoothingEnabled = true; d.imageSmoothingQuality = 'high'; d.drawImage(cR, 0, 0, L, A); d.restore() }
  d.drawImage(cT, 0, 0)
  // textura de ruído fino (sensação de relevo): um ladrilho de 256 px repetido. Ler e regravar os pixels da textura
  // inteira (como era antes) levava ~2 s e travava a tela
  const cR = document.createElement('canvas'); cR.width = cR.height = 256
  const gR = cR.getContext('2d'), iR = gR.createImageData(256, 256)
  for (let i = 0; i < iR.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; iR.data[i] = iR.data[i + 1] = iR.data[i + 2] = v; iR.data[i + 3] = Math.random() * 16 }
  gR.putImageData(iR, 0, 0)
  d.fillStyle = d.createPattern(cR, 'repeat'); d.fillRect(0, 0, L, A)
  d.strokeStyle = 'rgba(255,255,255,0.28)'; d.lineWidth = 0.7; d.beginPath(); tracar(d, fronteiras); d.stroke()
  d.strokeStyle = 'rgba(190,230,255,0.35)'; d.lineWidth = 0.9; d.beginPath(); tracar(d, litoral); d.stroke()

  await pausa()
  // noite: quase preto, litoral e fronteiras em luz fria (lembra as luzes das cidades ao longo das costas)
  const [cNoite, n] = tela()
  n.fillStyle = '#040b14'; n.fillRect(0, 0, L, A)
  n.fillStyle = '#122233'; preencher(n)
  // brilho do litoral: uma linha larga e fraca por baixo da fina (shadowBlur no litoral inteiro custava ~1 s)
  n.beginPath(); tracar(n, litoral)
  n.strokeStyle = 'rgba(255,190,110,0.16)'; n.lineWidth = 3.5; n.stroke()
  n.strokeStyle = 'rgba(255,196,120,0.55)'; n.lineWidth = 1; n.stroke()
  n.strokeStyle = 'rgba(94,234,212,0.22)'; n.lineWidth = 0.7; n.beginPath(); tracar(n, fronteiras); n.stroke()

  // máscara de água: branco = oceano. Tela pequena e só na CPU (willReadFrequently): as luzes das cidades leem os
  // pixels dela, e ler uma tela da placa de vídeo obriga o navegador a terminar todo o desenho pendente (segundos)
  const cAgua = document.createElement('canvas'); cAgua.width = L / 2; cAgua.height = A / 2
  const a = cAgua.getContext('2d', { willReadFrequently: true })
  a.scale(0.5, 0.5); a.fillStyle = '#fff'; a.fillRect(0, 0, L, A); a.fillStyle = '#000'; preencher(a)
  await pausa()
  // luzes das cidades numa tela de CPU (willReadFrequently): milhares de pontinhos na tela acelerada viravam ~2,7 s
  // de trabalho da placa de vídeo no envio da textura; na CPU são poucos milissegundos, e depois é uma cópia só
  const cLuz = document.createElement('canvas'); cLuz.width = L; cLuz.height = A
  luzesDasCidades(cLuz.getContext('2d', { willReadFrequently: true }), cAgua, L, A)
  n.save(); n.globalCompositeOperation = 'lighter'; n.drawImage(cLuz, 0, 0); n.restore()

  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
  return { dia: tex(cDia), noite: tex(cNoite), agua: new THREE.CanvasTexture(cAgua) }
}

function texturaPonto() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

const SOMBREADOR_TERRA = {
  vertex: `varying vec2 vUv; varying vec3 vNormal; varying vec3 vNormalVista; varying vec3 vVista;
    void main(){ vUv = uv; vNormal = normalize(normal); vNormalVista = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vVista = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv; }`,
  fragment: `uniform sampler2D dia; uniform sampler2D noite; uniform sampler2D agua; uniform vec3 sol; uniform vec3 solVista; uniform float carregado;
    varying vec2 vUv; varying vec3 vNormal; varying vec3 vNormalVista; varying vec3 vVista;
    void main(){
      float luz = dot(normalize(vNormal), normalize(sol));
      float diaF = smoothstep(-0.12, 0.22, luz);
      vec3 cDia = texture2D(dia, vUv).rgb * (0.35 + 0.85 * max(luz, 0.0));
      vec3 cNoite = texture2D(noite, vUv).rgb * 1.35;
      vec3 cor = mix(cNoite, cDia, diaF);
      // reflexo do Sol só no oceano
      float m = texture2D(agua, vUv).r;
      vec3 nV = normalize(vNormalVista);
      vec3 h = normalize(normalize(solVista) + vVista);
      cor += vec3(1.0, 0.92, 0.78) * pow(max(dot(nV, h), 0.0), 60.0) * 0.55 * m * diaF;
      // faixa do crepúsculo levemente alaranjada
      cor += vec3(0.55, 0.25, 0.08) * (1.0 - abs(smoothstep(-0.15, 0.15, luz) * 2.0 - 1.0)) * 0.18;
      // borda azulada (espessura da atmosfera vista de lado)
      float borda = pow(1.0 - max(dot(nV, vVista), 0.0), 3.0);
      cor += vec3(0.25, 0.55, 0.85) * borda * (0.25 + 0.6 * diaF);
      gl_FragColor = vec4(mix(vec3(0.03, 0.07, 0.12), cor, carregado), 1.0);
    }`,
}

// nuvens procedurais: manchas suaves sobrepostas em várias escalas (sem imagem externa)
function texturaNuvens() {
  // nuvens por ruído com oitavas: formas irregulares, mais nas faixas de chuva (equador e latitudes médias), menos nos desertos
  const L = 512, A = 256, n = criarRuido(31), n2 = criarRuido(53)
  const c = document.createElement('canvas'); c.width = L; c.height = A
  const g = c.getContext('2d'), img = g.createImageData(L, A)
  for (let y = 0; y < A; y++) {
    const lat = Math.abs(90 - (y + 0.5) / A * 180)
    const faixa = 0.55 + 0.35 * Math.exp(-((lat - 3) ** 2) / 60) + 0.3 * Math.exp(-((lat - 55) ** 2) / 120) - 0.35 * Math.exp(-((lat - 24) ** 2) / 50)
    for (let x = 0; x < L; x++) {
      const v = n(x / L, y / A * 0.5, 6, 5) * 0.75 + n2(x / L, y / A * 0.5, 3, 12) * 0.25
      const a = Math.max(0, Math.min(1, (v - (1 - faixa * 0.62)) * 3.2))
      const i = (y * L + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 235)
    }
  }
  g.putImageData(img, 0, 0)
  // a textura de nuvens usa o canal vermelho como intensidade: pinta sobre preto
  const f = document.createElement('canvas'); f.width = L; f.height = A
  const gf = f.getContext('2d'); gf.fillStyle = '#000'; gf.fillRect(0, 0, L, A); gf.drawImage(c, 0, 0)
  return new THREE.CanvasTexture(f)
}

export default function Globo3D({ pontos = [], servidor, aoSelecionar, className = '', ataque = false }) {
  const ataqueRef = useRef(ataque)
  ataqueRef.current = ataque
  const ref = useRef(null)
  const dicaRef = useRef(null)
  const rotulosRef = useRef(null)
  const dadosRef = useRef({ pontos })
  dadosRef.current = { pontos }
  const montarRef = useRef(null)
  const acoesRef = useRef({})
  const [girando, setGirando] = useState(true)
  const [explorar, setExplorar] = useState(false)
  const astrosRef = useRef(null)
  const caixaRef = useRef(null)
  const [info, setInfo] = useState(null)          // astro em foco (ficha)
  const exoRef = useRef({})
  const [exoLista, setExoLista] = useState([])
  const [buscaAstro, setBuscaAstro] = useState('')
  const [aba, setAba] = useState('dados')
  const [tour, setTour] = useState(false)
  const [nave, setNave] = useState(false)         // pilotar a nave (voo livre pelo teclado)
  const [hiper, setHiper] = useState(null)        // salto hipersônico: { n (contagem), prog (% da dimensão pronta), fase }
  const [dentro, setDentro] = useState(false)     // na outra dimensão
  const [mudo, setMudo] = useState(() => { try { return localStorage.getItem('clima-nave-mudo') === '1' } catch { return false } })
  const hiperTimer = useRef(null)
  const [hud, setHud] = useState(null)
  const [seguirIss, setSeguirIss] = useState(false)
  const [tempo, setTempo] = useState(1)
  const [telaCheia, setTelaCheia] = useState(false)
  const [viajando, setViajando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const satRotulosRef = useRef(null), satsRef = useRef(null), mostrarSatsRef = useRef(true)
  const [mostrarSats, setMostrarSats] = useState(true)
  const [resumoSats, setResumoSats] = useState(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 2500)
    const inicioCam = new THREE.Vector3(0, 0.75, 3.15)
    camera.position.copy(inicioCam)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.dampingFactor = 0.06
    controles.enablePan = false; controles.enableZoom = false // a roda rola a página; zoom pelos botões
    controles.minDistance = 1.5; controles.maxDistance = 9
    controles.autoRotate = !calmo; controles.autoRotateSpeed = 0.35
    controles.rotateSpeed = 0.55

    const tex = texturaPonto()

    const globo = new THREE.Group()
    globo.rotation.y = -1.25 // começa nas Américas
    cena.add(globo)
    globo.updateMatrixWorld()
    // O universo (Sol, Lua, planetas, 16 mil estrelas, exoplanetas) e a nave são pesados: só são montados quando a
    // pessoa entra no modo universo. Até lá, um céu leve de estrelas e um "universo" mínimo com a Terra e os lugares.
    let vivo = true, exo = null, nave = null, compilando = false
    const marcos = criarMarcos(globo, vetor)
    let universo = {
      leve: true, grupo: null, solPos: new THREE.Vector3(), escala: 1, dobra: 0,
      corpos: { terra: { obj: globo, raio: 1, nome: 'Terra', distancia: 'acessos ao sistema agora' }, ...marcos.corpos },
      atualizar() {}, descartar() {},
    }
    const ceuLeve = (() => {
      const n = 1800, pos = new Float32Array(n * 3), v = new THREE.Vector3()
      for (let i = 0; i < n; i++) { v.randomDirection().multiplyScalar(420 + Math.random() * 60); pos.set([v.x, v.y, v.z], i * 3) }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const p = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false }))
      p.frustumCulled = false; cena.add(p); return p
    })()
    const garantirUniverso = () => {
      if (!universo.leve || !vivo) return
      cena.remove(ceuLeve); ceuLeve.geometry.dispose(); ceuLeve.material.dispose()
      // Sol, Lua, planetas e Via Láctea nas direções reais de agora
      universo = criarUniverso(cena, globo); Object.assign(universo.corpos, marcos.corpos)
      // nave no mundo (não presa à câmera): voo com inércia e câmera de perseguição
      nave = criarNave(renderer); cena.add(nave.grupo)
      const luzNave = new THREE.DirectionalLight(0xffffff, 2.4); luzNave.position.set(0.7, 1.3, 0.4); nave.grupo.add(luzNave); nave.grupo.add(luzNave.target)
      nave.grupo.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a1d22, 0.9))
      // compila os sombreadores fora do quadro (senão o 1º quadro trava a tela por segundos); até lá, só o globo aparece
      const grupoU = universo.grupo, grupoN = nave.grupo
      compilando = true
      const liberar = () => { compilando = false; if (vivo) { grupoU.visible = true } }
      compilarSeguro(renderer, cena, camera).then(liberar, liberar)
      grupoN.visible = false
      // os 200 exoplanetas mais próximos (NASA Exoplanet Archive)
      api.get('/api/exoplanetas').then((d) => {
        if (!vivo) return
        exo = criarExoplanetas(universo.grupo, d.lista || [], globo.quaternion); Object.assign(universo.corpos, exo.corpos)
        exoRef.current = exo.dados; setExoLista(Object.entries(exo.dados).map(([k, x]) => ({ k, nome: x.pl_name, al: x.anos_luz })))
      }).catch(() => { /* sem o arquivo da NASA agora: o resto do universo continua */ })
    }
    // satélites reais (SGP4) em volta da Terra
    const sats = criarSatelites(globo, vetor, satRotulosRef.current)
    // nave (visão de perseguição, presa à câmera), estrelas cadentes e aurora nos polos
    cena.add(camera)
    // A escala da nave acompanha a distância do astro mais perto (perto da Terra ela fica pequena e lenta; no espaço
    // profundo, grande e rápida), como nos jogos. Ela nasce em garantirUniverso().
    const voo = { ativo: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), vel: new THREE.Vector3(), w: new THREE.Vector3(), acel: 0.35, k: 0.05, arrasto: null, upCam: new THREE.Vector3(0, 1, 0), nearAntes: camera.near }
    const meteoros = criarMeteoros(cena)
    const aurora = criarAurora(globo, R)
    let ultimoHud = 0, ultimoIss = 0
    const issPos = new THREE.Vector3(), posAntes = new THREE.Vector3()
    satsRef.current = { camada: sats, fonte: null }
    sats.visivel = mostrarSatsRef.current
    api.get('/api/satelites').then((d) => { sats.carregar(d.satelites || []); if (satsRef.current) satsRef.current.fonte = d }).catch(() => {})

    // Terra com dia e noite reais
    const sub = pontoSubsolar()
    const solLocal = vetor(sub.lat, sub.lon, 1).normalize()
    const uniforms = {
      dia: { value: null }, noite: { value: null }, agua: { value: null },
      sol: { value: solLocal.clone() }, solVista: { value: new THREE.Vector3() }, carregado: { value: 0 },
    }
    const matTerra = new THREE.ShaderMaterial({ uniforms, vertexShader: SOMBREADOR_TERRA.vertex, fragmentShader: SOMBREADOR_TERRA.fragment })
    const terra = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 96), matTerra)
    globo.add(terra)
    let texturas = null
    // envia uma textura por quadro para a placa de vídeo (as três juntas seguravam um quadro por segundos)
    const quadroLivre = () => new Promise((r) => requestAnimationFrame(() => r()))
    texturasTerra().then(async (t) => {
      for (const x of [t.agua, t.noite, t.dia]) { await quadroLivre(); if (!vivo) return; renderer.initTexture?.(x) }
      texturas = t
      uniforms.dia.value = t.dia; uniforms.noite.value = t.noite; uniforms.agua.value = t.agua
      setPronto(true)
    }).catch(() => setPronto(true))

    // atmosfera: halo externo (lado de trás) e brilho fino na borda
    const halo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.16, 64, 64), new THREE.ShaderMaterial({
      uniforms: { sol: { value: new THREE.Vector3() }, cor: { value: new THREE.Color(0.30, 0.62, 1.0) } },
      vertexShader: 'varying vec3 n; varying vec3 w; void main(){ n = normalize(normalMatrix * normal); w = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 sol; uniform vec3 cor; varying vec3 n; varying vec3 w;
        void main(){ float i = pow(0.68 - dot(n, vec3(0,0,1.0)), 3.2); float d = 0.35 + 0.65 * smoothstep(-0.4, 0.6, dot(w, normalize(sol)));
          gl_FragColor = vec4(cor * d, 1.0) * i * 1.3; }`,
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
    }))
    cena.add(halo)

    // camada de nuvens, iluminada pelo Sol (some no lado da noite)
    const texNuvens = texturaNuvens()
    const nuvens = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 64, 64), new THREE.ShaderMaterial({
      uniforms: { mapa: { value: texNuvens }, sol: { value: uniforms.sol.value } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normalize(normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D mapa; uniform vec3 sol; varying vec2 vUv; varying vec3 vN;
        void main(){ float a = texture2D(mapa, vUv).r; float luz = smoothstep(-0.15, 0.35, dot(normalize(vN), normalize(sol)));
          gl_FragColor = vec4(vec3(0.92 + 0.08 * luz) * (0.15 + 0.85 * luz), a * (0.25 + 0.6 * luz)); }`,
      transparent: true, depthWrite: false,
    }))
    globo.add(nuvens)

    // anel de alarme em volta do globo (só durante ataque em massa)
    const alarme = new THREE.Mesh(new THREE.RingGeometry(R * 1.2, R * 1.24, 128), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
    cena.add(alarme)
    const corNormal = new THREE.Color(0.30, 0.62, 1.0), corAtaque = new THREE.Color(1.0, 0.18, 0.12)

    // grade bem leve
    const matGrade = new THREE.LineBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.07, depthWrite: false })
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = []; for (let lon = -180; lon <= 180; lon += 4) pts.push(vetor(lat, lon, R * 1.002))
      globo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matGrade))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = []; for (let lat = -88; lat <= 88; lat += 4) pts.push(vetor(lat, lon, R * 1.002))
      globo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matGrade))
    }

    // servidor: ponto branco, anel e onda de impacto
    const posServ = vetor(servidor?.lat ?? -23.55, servidor?.lon ?? -46.63, R * 1.004)
    const serv = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }))
    serv.position.copy(posServ); globo.add(serv)
    const fazerAnel = (r1, r2, cor) => {
      const a = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), new THREE.MeshBasicMaterial({ color: cor, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
      a.position.copy(posServ.clone().multiplyScalar(1.001)); a.lookAt(posServ.clone().multiplyScalar(2)); globo.add(a); return a
    }
    const anelServ = fazerAnel(0.024, 0.029, 0xffffff)
    const impactos = [fazerAnel(0.02, 0.026, 0xef4444), fazerAnel(0.02, 0.026, 0x2dd4bf)].map((a) => { a.material.opacity = 0; a.userData.t = 1; return a })

    // camada dinâmica (colunas, anéis, arcos e pulsos) recriada quando os dados mudam
    let dinamica = new THREE.Group(); globo.add(dinamica)
    let marcadores = [], pulsos = [], aneis = [], rotulos = []
    const montar = () => {
      globo.remove(dinamica)
      dinamica.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      dinamica = new THREE.Group(); globo.add(dinamica)
      marcadores = []; pulsos = []; aneis = []
      const { pontos: ps } = dadosRef.current
      const max = Math.max(1, ...ps.map(total))
      ps.forEach((p, idx) => {
        const cat = categoria(p)
        const cor = new THREE.Color(CORES[cat])
        const base = vetor(p.lat, p.lon, R)
        const altura = 0.03 + 0.26 * Math.sqrt(total(p) / max)
        const normal = base.clone().normalize()
        // coluna de luz que some no topo
        const geoCol = new THREE.CylinderGeometry(0.0035, 0.0075, altura, 10, 1, true)
        const coluna = new THREE.Mesh(geoCol, new THREE.ShaderMaterial({
          uniforms: { cor: { value: cor }, h: { value: altura } },
          vertexShader: 'varying float y; uniform float h; void main(){ y = position.y / h + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: 'uniform vec3 cor; varying float y; void main(){ gl_FragColor = vec4(cor * (1.2 - y * 0.4), (1.0 - y) * 0.95); }',
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }))
        coluna.position.copy(normal.clone().multiplyScalar(R + altura / 2))
        coluna.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
        dinamica.add(coluna)
        const ponta = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cor, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
        ponta.position.copy(normal.clone().multiplyScalar(R + 0.004)); ponta.scale.setScalar(0.05 + 0.04 * Math.sqrt(total(p) / max))
        dinamica.add(ponta)
        // alvo clicável maior (invisível)
        const alvo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), new THREE.MeshBasicMaterial({ visible: false }))
        alvo.position.copy(base); alvo.userData = { ponto: p }; dinamica.add(alvo); marcadores.push(alvo)
        // dois anéis defasados na base
        for (let k = 0; k < 2; k++) {
          const anel = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.016, 40), new THREE.MeshBasicMaterial({ color: cor, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
          anel.position.copy(normal.clone().multiplyScalar(R * 1.002)); anel.lookAt(normal.clone().multiplyScalar(2))
          anel.userData.fase = idx * 0.37 + k * 0.5; anel.userData.vel = cat === 'ataque' ? 1.1 : 0.6
          dinamica.add(anel); aneis.push(anel)
        }
        // arco até o servidor: linha fraca + pulso de luz que corre por ela (shader com progresso)
        const fim = posServ.clone()
        const dist = base.distanceTo(fim)
        if (dist < 0.03) return
        const meio = base.clone().add(fim).multiplyScalar(0.5).normalize().multiplyScalar(R + dist * 0.42)
        const curva = new THREE.QuadraticBezierCurve3(base.clone().multiplyScalar(1.002), meio, fim)
        const pts = curva.getPoints(120)
        const geoArco = new THREE.BufferGeometry().setFromPoints(pts)
        geoArco.setAttribute('t', new THREE.BufferAttribute(new Float32Array(pts.map((_, i) => i / (pts.length - 1))), 1))
        const mat = new THREE.ShaderMaterial({
          uniforms: { cor: { value: cor }, fase: { value: Math.random() }, forca: { value: cat === 'ataque' ? 1 : 0.7 } },
          vertexShader: 'attribute float t; varying float vt; void main(){ vt = t; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: `uniform vec3 cor; uniform float fase; uniform float forca; varying float vt;
            void main(){ float d = vt - fase; float cabeca = smoothstep(-0.22, 0.0, d) * (1.0 - smoothstep(0.0, 0.015, d));
              float base = 0.16 * forca; gl_FragColor = vec4(cor * (1.0 + cabeca * 1.6), base + cabeca * forca); }`,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        })
        dinamica.add(new THREE.Line(geoArco, mat))
        pulsos.push({ mat, vel: (cat === 'ataque' ? 0.42 : 0.26) * (0.85 + Math.random() * 0.3), impacto: cat === 'ataque' ? 0 : 1 })
      })
      // rótulos HTML das cidades com mais movimento
      const caixa = rotulosRef.current
      if (caixa) {
        caixa.innerHTML = ''
        rotulos = [...ps].sort((a, b) => total(b) - total(a)).filter((p) => p.cidade).slice(0, 6).map((p) => {
          const div = document.createElement('div')
          div.className = 'absolute whitespace-nowrap rounded border border-white/10 bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm transition-opacity'
          div.textContent = `${p.cidade}${p.pais ? ` · ${p.pais}` : ''}`
          caixa.appendChild(div)
          return { div, pos: vetor(p.lat, p.lon, R * 1.02) }
        })
        const dServ = document.createElement('div')
        dServ.className = 'absolute whitespace-nowrap rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-900'
        dServ.textContent = 'Servidor'
        caixa.appendChild(dServ)
        rotulos.push({ div: dServ, pos: posServ.clone().multiplyScalar(1.02) })
      }
    }
    montar()
    montarRef.current = montar

    // ações dos botões
    const animarCamera = (destino) => {
      const de = camera.position.clone(); let t0 = null
      const passo = (ts) => {
        t0 ??= ts
        const k = Math.min(1, (ts - t0) / 700), e = 1 - Math.pow(1 - k, 3)
        camera.position.lerpVectors(de, destino, e); controles.update()
        if (k < 1) requestAnimationFrame(passo)
      }
      requestAnimationFrame(passo)
    }
    // viagem: curva suave; em trechos longos, dobra espacial (linhas de luz) e a lente abre no meio do caminho
    const viagem = { ativa: false }
    const voar = (alvo, destino, ms = 1600) => {
      const de = camera.position.clone(), deAlvo = controles.target.clone(); let t0 = null
      const longe = de.distanceTo(destino) > 25 && !calmo
      const msReal = longe ? Math.min(4200, ms + de.distanceTo(destino) * 9) : ms
      viagem.ativa = true; acoesRef.current.viajando?.(longe)
      const passo = (ts) => {
        t0 ??= ts
        const k = Math.min(1, (ts - t0) / msReal), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
        controles.target.lerpVectors(deAlvo, alvo, e); camera.position.lerpVectors(de, destino, e)
        if (longe) { const sino = Math.sin(Math.PI * k); universo.dobra = sino; camera.fov = 38 + sino * 34; camera.updateProjectionMatrix() }
        controles.update()
        if (k < 1) requestAnimationFrame(passo)
        else { viagem.ativa = false; universo.dobra = 0; camera.fov = 38; camera.updateProjectionMatrix(); acoesRef.current.viajando?.(false); seguir.pos = null }
      }
      requestAnimationFrame(passo)
    }
    // acompanha astros que se movem (luas em órbita): câmera e alvo andam junto
    const seguir = { pos: null }
    const foco = { atual: 'terra' }
    const irPara = (chave) => {
      const c = universo.corpos[chave]; if (!c) return
      foco.atual = chave
      acoesRef.current.aoFocar?.(chave)
      if (chave === 'terra') { controles.minDistance = 1.5; voar(new THREE.Vector3(), controles.maxDistance > 50 ? new THREE.Vector3(2.2, 1.2, 4.2) : inicioCam.clone()); return }
      const alvo = c.obj.getWorldPosition(new THREE.Vector3())
      if (c.superficie) {   // lugar na Terra: desce de cima, a ~2.000 km de altura (na escala do globo)
        controles.minDistance = 0.05
        voar(alvo, alvo.clone().add(alvo.clone().normalize().multiplyScalar(0.32)).add(new THREE.Vector3(0, 0.04, 0)), 1800); return
      }
      // chega pelo lado iluminado (entre o astro e o Sol), um pouco acima
      const lado = universo.solPos.clone().sub(alvo).normalize().multiplyScalar(0.55).add(camera.position.clone().sub(alvo).normalize().multiplyScalar(0.45)).normalize()
      const dist = chave === 'sol' ? 40 : c.obj.isSprite ? c.raio * 2.6 : c.raio * 4.2 + 0.6
      controles.minDistance = Math.max(0.25, c.raio * 1.4)
      voar(alvo, alvo.clone().add(lado.multiplyScalar(dist)).add(new THREE.Vector3(0, c.raio * 0.8, 0)), chave === 'sol' ? 2400 : 1800)
    }
    acoesRef.current = {
      zoom: (f) => { const alvo = controles.target.clone(); const v = camera.position.clone().sub(alvo); animarCamera(alvo.add(v.setLength(Math.min(controles.maxDistance, Math.max(controles.minDistance, v.length() * f))))) },
      inicio: () => irPara('terra'),
      girar: (v) => { controles.autoRotate = v && !calmo },
      explorar: (v) => {
        if (v) garantirUniverso()
        controles.enableZoom = v; controles.zoomToCursor = false
        controles.maxDistance = v ? 600 : 9
        if (!v) { universo.escala = 1; irPara('terra') }
        else voar(new THREE.Vector3(), new THREE.Vector3(5, 3.4, 9))
      },
      tempo: (v) => { universo.escala = v },
      irPara,
      corpos: () => Object.entries(universo.corpos).map(([k, c]) => ({ chave: k, nome: c.nome, distancia: c.distancia })),
    }

    // dica ao passar o mouse e clique para selecionar
    const ray = new THREE.Raycaster()
    const mouse = new THREE.Vector2()
    let sobre = null
    const mover = (e) => {
      const b = el.getBoundingClientRect()
      mouse.x = ((e.clientX - b.left) / b.width) * 2 - 1
      mouse.y = -((e.clientY - b.top) / b.height) * 2 + 1
      ray.setFromCamera(mouse, camera)
      const hit = ray.intersectObjects([terra, ...marcadores])[0]
      sobre = hit && hit.object !== terra ? hit.object.userData.ponto : null
      el.style.cursor = sobre ? 'pointer' : 'grab'
      const d = dicaRef.current
      if (!d) return
      if (sobre) {
        d.style.display = 'block'
        d.style.left = `${Math.min(e.clientX - b.left + 14, b.width - 220)}px`; d.style.top = `${e.clientY - b.top + 14}px`
        d.innerHTML = ''
        const linhas = [[`${sobre.cidade || 'Local desconhecido'}${sobre.pais ? `, ${sobre.pais}` : ''}`, 'font-weight:600'],
          [`${sobre.ips} IP(s) · ${sobre.acesso} acesso(s) · ${sobre.login} login(s)`, ''],
          [sobre.robo ? `${sobre.robo} evento(s) de robô inofensivo` : '', 'color:#f59e0b'],
          [sobre.ataque ? `${sobre.ataque} ataque(s) real(is) barrado(s)` : 'Nenhum ataque real', sobre.ataque ? 'color:#ef4444' : 'color:#22c55e']]
        linhas.filter(([t]) => t).forEach(([t, st]) => { const p = document.createElement('p'); p.textContent = t; p.style.cssText = st; d.appendChild(p) })
      } else d.style.display = 'none'
    }
    const clicar = () => { if (sobre) aoSelecionar?.(sobre) }
    const sair = () => { if (dicaRef.current) dicaRef.current.style.display = 'none' }
    const duplo = (e) => {
      const b = el.getBoundingClientRect()
      mouse.x = ((e.clientX - b.left) / b.width) * 2 - 1; mouse.y = -((e.clientY - b.top) / b.height) * 2 + 1
      ray.setFromCamera(mouse, camera)
      const lista = Object.entries(universo.corpos).filter(([k]) => k !== 'terra').map(([k, c]) => [k, c.alvo || (c.obj.type === 'Group' ? c.obj.children[0] : c.obj)])
      const hit = ray.intersectObjects([terra, ...lista.map(([, o]) => o).filter((o) => o.isMesh || o.isSprite)])[0]
      if (!hit) return
      const achado = hit.object === terra ? 'terra' : lista.find(([, o]) => o === hit.object)?.[0]
      if (achado) { if (achado !== 'terra' && controles.maxDistance < 50) acoesRef.current.explorarExterno?.(true); irPara(achado) }
    }
    el.addEventListener('dblclick', duplo)
    // voo livre: W/S ou ↑/↓ avançam e recuam, A/D ou ←/→ de lado, Q/E sobem e descem, Shift acelera
    const teclas = new Set()
    let dobraNave = 0
    // som da nave e a outra dimensão (montada só quando pedem o salto; descartada ao voltar)
    const som = criarSom(); acoesRef.current.som = som
    const dim = { estado: null, obj: null, preparo: null, carga: 0 }; acoesRef.current.dim = dim
    acoesRef.current.prepararDimensao = (prog) => {
      if (!dim.preparo) dim.preparo = import('./dimensao3d').then((m) => m.prepararDimensao(renderer, prog || (() => {}))).then((o) => { dim.obj = o; return o })
      return dim.preparo
    }
    acoesRef.current.sairDimensao = () => {
      dim.estado = null; dim.obj?.descartar(); dim.obj = null; dim.preparo = null; dim.carga = 0
      universo.dobra = 0; camera.fov = 38; camera.updateProjectionMatrix(); relogio.getDelta()
    }
    let ultimoSom = 0, somPausado = false
    const tecla = (e) => {
      if (!acoesRef.current.naveLigada || /input|textarea|select/i.test(e.target.tagName)) return
      if (e.type === 'keydown') som.iniciar()
      const k = e.key.toLowerCase()
      if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' ', 'x', 'c'].includes(k)) return
      if (e.type === 'keydown') { teclas.add(k); if (k.startsWith('arrow') || k === ' ') e.preventDefault(); if (k === 'x') voo.acel = 0; if (k === 'c') voo.camLivre = !voo.camLivre } else teclas.delete(k)
    }
    const soltar = () => teclas.clear()
    // arrastar com o mouse durante o voo: aponta o nariz (guinada e arfagem)
    const arrastoIni = (e) => { if (acoesRef.current.naveLigada && !voo.camLivre) voo.arrasto = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 } }
    const arrastoMove = (e) => { if (voo.arrasto) { voo.arrasto.dx = (e.clientX - voo.arrasto.x) / 120; voo.arrasto.dy = (e.clientY - voo.arrasto.y) / 120 } }
    const arrastoFim = () => { voo.arrasto = null }
    el.addEventListener('pointerdown', arrastoIni); window.addEventListener('pointermove', arrastoMove); window.addEventListener('pointerup', arrastoFim)
    window.addEventListener('keydown', tecla); window.addEventListener('keyup', tecla); window.addEventListener('blur', soltar)
    el.addEventListener('pointermove', mover); el.addEventListener('click', clicar); el.addEventListener('pointerleave', sair)
    let retomar
    controles.addEventListener('start', () => { clearTimeout(retomar); controles.autoRotate = false })
    controles.addEventListener('end', () => { retomar = setTimeout(() => { controles.autoRotate = acoesRef.current.girando !== false && !calmo }, 5000) })

    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar); ro.observe(el)
    // fora da tela (rolou a página) ou em tela cheia de outra coisa: não desenha
    let naTela = true
    const io = new IntersectionObserver(([e]) => { naTela = e.isIntersecting }, { rootMargin: '100px' }); io.observe(el)
    const relogio = new THREE.Clock()
    const tmp = new THREE.Vector3(), solMundo = new THREE.Vector3()
    let quadro, ultimoSol = 0
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (document.hidden || !naTela) { relogio.getDelta(); if (!somPausado) { som.pausar(true); somPausado = true } return }
      if (somPausado) { som.pausar(false); somPausado = false }
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      // na outra dimensão só ela é desenhada (o globo e o universo param: nada pesa a mais)
      if (dim.estado === 'dentro' && dim.obj) {
        const r = dim.obj.quadro(dt, t, teclas)
        if (t - ultimoSom > 0.1) { ultimoSom = t; som.atualizar({ ligado: true, empuxo: r.empuxo, boost: r.boost, dobra: 0 }) }
        return
      }
      if (t - ultimoSol > 60) { // o Sol anda 0,25° por minuto
        ultimoSol = t
        const s = pontoSubsolar(); uniforms.sol.value.copy(vetor(s.lat, s.lon, 1).normalize())
      }
      uniforms.carregado.value = Math.min(1, uniforms.carregado.value + (texturas ? dt * 1.5 : 0))
      solMundo.copy(uniforms.sol.value).applyQuaternion(globo.quaternion)
      uniforms.solVista.value.copy(solMundo).transformDirection(camera.matrixWorldInverse)
      halo.material.uniforms.sol.value.copy(solMundo)
      const emAtaque = ataqueRef.current
      halo.material.uniforms.cor.value.lerp(emAtaque ? corAtaque : corNormal, 0.05)
      nuvens.rotation.y += dt * 0.006
      alarme.quaternion.copy(camera.quaternion)
      if (emAtaque) { const pulso = (t * 1.2) % 1; alarme.scale.setScalar(1 + pulso * 0.35); alarme.material.opacity = 0.55 * (1 - pulso) } else alarme.material.opacity = 0
      pulsos.forEach((p) => {
        const antes = p.mat.uniforms.fase.value
        const f = (antes + dt * p.vel * (ataqueRef.current ? 2.2 : 1)) % 1.25
        p.mat.uniforms.fase.value = f
        if (f < antes) { const a = impactos[p.impacto]; a.userData.t = 0 } // chegou ao servidor
      })
      impactos.forEach((a) => {
        a.userData.t = Math.min(1, a.userData.t + dt * 1.4)
        a.scale.setScalar(1 + a.userData.t * 4); a.material.opacity = 0.9 * (1 - a.userData.t)
      })
      aneis.forEach((a) => {
        const f = ((t * a.userData.vel + a.userData.fase) % 1)
        a.scale.setScalar(1 + f * 3.2); a.material.opacity = 0.85 * (1 - f)
      })
      const fs = (t * 0.5) % 1
      anelServ.scale.setScalar(1 + fs * (ataqueRef.current ? 4 : 2)); anelServ.material.opacity = 1 - fs
      anelServ.material.color.setHex(ataqueRef.current ? 0xef4444 : 0xffffff)
      universo.atualizar(dt, t, camera)
      if (!calmo) { meteoros(dt); aurora(dt) }
      // seguir a ISS: a câmera acompanha a estação em órbita
      if (acoesRef.current.seguirIss && t - ultimoIss > 0.1) {
        ultimoIss = t
        const iss = sats.resumo().iss
        if (iss) {
          issPos.copy(vetor(iss.lat, iss.lon, R * (1 + iss.alt / 6371))).applyMatrix4(globo.matrixWorld)
          controles.target.lerp(issPos, 0.25)
          const longe = issPos.clone().setLength(issPos.length() + 0.55).add(new THREE.Vector3(0, 0.12, 0))
          camera.position.lerp(longe, 0.08)
        }
      }
      sats.atualizar(t, camera, el.clientWidth, el.clientHeight, uniforms.sol.value, camera.position.length() < 14)
      // acompanha o astro em foco se ele estiver em órbita
      if (!viagem.ativa && foco.atual !== 'terra' && controles.maxDistance > 50) {
        const c = universo.corpos[foco.atual]
        if (c) { c.obj.getWorldPosition(tmp); if (seguir.pos) { const d = tmp.clone().sub(seguir.pos); if (d.lengthSq() > 1e-10 && d.length() < 2) { camera.position.add(d); controles.target.add(d) } } seguir.pos = (seguir.pos || new THREE.Vector3()).copy(tmp) }
      }
      // ---------- voo da nave: inércia, rotação nos 3 eixos, acelerador, freio, colisão com os astros ----------
      const pilotando = !!acoesRef.current.naveLigada
      if (pilotando && !voo.ativo && nave && !compilando) {   // entra na nave: aparece à frente da câmera, apontando para onde ela olha
        voo.ativo = true; voo.vel.set(0, 0, 0); voo.w.set(0, 0, 0); voo.acel = 0.3; voo.nearAntes = camera.near; voo.camOff = null
        const dAlvo = camera.position.distanceTo(controles.target)
        voo.k = THREE.MathUtils.clamp(dAlvo * 0.03, 0.01, 2.5)
        voo.quat.copy(camera.quaternion)
        voo.pos.copy(camera.position).add(new THREE.Vector3(0, -0.28, -1.6).multiplyScalar(voo.k).applyQuaternion(camera.quaternion))
        controles.enabled = false; controles.autoRotate = false; seguir.pos = null; foco.atual = 'livre'
      } else if (!pilotando && voo.ativo) {   // sai: a câmera volta a girar em volta de onde a nave estava
        voo.ativo = false; controles.enabled = true; camera.up.set(0, 1, 0); camera.near = voo.nearAntes; camera.updateProjectionMatrix()
        controles.target.copy(voo.pos); controles.update(); universo.dobra = 0
      }
      if (nave) nave.grupo.visible = voo.ativo && !compilando
      if (compilando && universo.grupo) universo.grupo.visible = false
      if (voo.ativo && nave) {
        // astro mais perto (superfície): define a escala do voo
        let perto = null
        for (const [kk, c] of Object.entries(universo.corpos)) { c.obj.getWorldPosition(tmp); const d = tmp.distanceTo(voo.pos) - (c.raio || 0); if (!perto || d < perto.d) perto = { k: kk, nome: c.nome, d, c: tmp.clone(), raio: c.raio || 0 } }
        const alvoK = THREE.MathUtils.clamp((perto ? Math.max(0, perto.d) : 50) * 0.05, 0.01, 2.5)
        voo.k += (alvoK - voo.k) * Math.min(1, dt * 1.5)
        const k = voo.k
        if (viagem.ativa) {   // piloto automático (clicou num destino): a nave acompanha a câmera
          voo.quat.copy(camera.quaternion); voo.vel.set(0, 0, 0)
          voo.pos.copy(camera.position).add(new THREE.Vector3(0, -0.28, -1.6).multiplyScalar(k).applyQuaternion(camera.quaternion))
        } else {
          const T = (a) => teclas.has(a)
          // acelerador: W sobe, S desce (segurando); X zera; espaço freia
          if (T('w')) voo.acel = Math.min(1, voo.acel + dt * 0.6)
          if (T('s')) voo.acel = Math.max(0, voo.acel - dt * 0.8)
          const boost = T('shift')
          // rotação: A/D guinada, ↑/↓ arfagem, ←/→ ou Q/E rolagem, mais o arrasto do mouse
          const ent = new THREE.Vector3(
            ((T('arrowdown') ? 1 : 0) - (T('arrowup') ? 1 : 0)) * 0.9 - (voo.arrasto?.dy || 0),
            ((T('a') ? 1 : 0) - (T('d') ? 1 : 0)) * 0.9 - (voo.arrasto?.dx || 0),
            ((T('q') || T('arrowleft') ? 1 : 0) - (T('e') || T('arrowright') ? 1 : 0)) * 1.4)
          ent.clampScalar(-1.6, 1.6)
          voo.w.lerp(ent, 1 - Math.exp(-dt * 3.5))
          const dq = new THREE.Quaternion().setFromEuler(new THREE.Euler(voo.w.x * dt, voo.w.y * dt, voo.w.z * dt))
          voo.quat.multiply(dq).normalize()
          const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(voo.quat)
          const vMax = k * 22 * (boost ? 4 : 1)
          const desejada = frente.clone().multiplyScalar(voo.acel * vMax)
          if (T(' ')) { voo.vel.multiplyScalar(Math.exp(-dt * 3)); voo.acel = Math.max(0, voo.acel - dt * 1.5) }
          else voo.vel.lerp(desejada, 1 - Math.exp(-dt * (boost ? 1.6 : 0.9)))   // inércia: a nave "escorrega" nas curvas
          voo.pos.addScaledVector(voo.vel, dt)
          // não atravessa planetas: empurra para fora e tira a velocidade que ia para dentro
          if (perto && perto.raio) {
            const n = voo.pos.clone().sub(perto.c), min = perto.raio * 1.004 + k * 0.6
            if (n.length() < min) { n.normalize(); voo.pos.copy(perto.c).addScaledVector(n, min); const vn = voo.vel.dot(n); if (vn < 0) voo.vel.addScaledVector(n, -vn) }
          }
        }
        nave.grupo.position.copy(voo.pos); nave.grupo.quaternion.copy(voo.quat); nave.grupo.scale.setScalar(k)
        const velN = voo.vel.length()
        nave.atualizar(dt, t, { empuxo: viagem.ativa ? 0.9 : voo.acel, boost: teclas.has('shift'), guinada: voo.w.y, arfagem: voo.w.x, rolagem: voo.w.z })
        // câmera de perseguição (mola): atrás e um pouco acima; o horizonte gira junto quando a nave rola
        if (!viagem.ativa) {
          const atras = new THREE.Vector3(0, 0.3, 1.55 + Math.min(0.6, velN / Math.max(1e-6, k * 22) * 0.25)).multiplyScalar(k).applyQuaternion(voo.quat)
          // a mola age no deslocamento em relação à nave (não na posição do mundo): em alta velocidade a câmera não fica para trás
          if (!voo.camOff) voo.camOff = camera.position.clone().sub(voo.pos)
          voo.camOff.lerp(atras, 1 - Math.exp(-dt * 6))
          camera.position.copy(voo.pos).add(voo.camOff)
          const upN = new THREE.Vector3(0, 1, 0).applyQuaternion(voo.quat)
          voo.upCam.lerp(upN, 1 - Math.exp(-dt * 4)).normalize(); camera.up.copy(voo.upCam)
          const olhar = voo.pos.clone().add(new THREE.Vector3(0, 0.12, -0.9).multiplyScalar(k).applyQuaternion(voo.quat))
          camera.lookAt(olhar); controles.target.copy(olhar)
          const near = Math.max(0.0008, k * 0.08)
          if (Math.abs(camera.near - near) / near > 0.2) { camera.near = near; camera.updateProjectionMatrix() }
        }
        // dobra: com Shift e acelerador alto, linhas de luz e a lente abre
        const acelerando = teclas.has('shift') && voo.acel > 0.6
        const antes = dobraNave
        dobraNave = acelerando ? Math.min(0.7, dobraNave + dt * 1.2) : Math.max(0, dobraNave - dt * 2)
        if (!viagem.ativa && (dobraNave || antes)) { universo.dobra = dobraNave; camera.fov = 38 + dobraNave * 20; camera.updateProjectionMatrix() }
        if (t - ultimoHud > 0.2) {
          ultimoHud = t
          acoesRef.current.aoHud?.({ vel: velN, perto, empuxo: voo.acel, dobra: dobraNave, escala: k })
        }
      }
      if (!(voo.ativo && !viagem.ativa)) controles.update()   // no voo, quem posiciona a câmera é a perseguição
      // contagem do salto: as linhas de luz crescem; no salto, dobra máxima e a lente abre
      if (dim.estado === 'contagem' || dim.estado === 'dobra') {
        universo.dobra = dim.estado === 'dobra' ? 1 : dim.carga
        const fov = 38 + universo.dobra * (dim.estado === 'dobra' ? 55 : 25)
        if (Math.abs(camera.fov - fov) > 0.3) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix() }
      }
      if (t - ultimoSom > 0.1) { ultimoSom = t; som.atualizar({ ligado: voo.ativo, empuxo: viagem.ativa ? 0.9 : voo.acel, boost: teclas.has('shift'), dobra: Math.max(dobraNave, dim.estado ? universo.dobra : 0) }) }
      renderer.render(cena, camera)
      // rótulos dos astros (no modo explorar)
      const caixaAstros = astrosRef.current
      if (caixaAstros && controles.maxDistance > 50) {
        const w = el.clientWidth, h = el.clientHeight
        const cacheR = (caixaAstros._cache ||= new Map())
        for (const [k, c] of Object.entries(universo.corpos)) {
          if (k === 'terra') continue
          let div = cacheR.get(k)
          if (div && !div.isConnected) div = null
          if (!div) { div = document.createElement('div'); div.dataset.astro = k; div.className = 'absolute left-0 top-0 whitespace-nowrap rounded-md border border-white/15 bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur-sm transition-opacity'; const b = document.createElement('b'); b.textContent = c.nome; const sm = document.createElement('span'); sm.className = 'ml-1.5 text-white/60'; sm.textContent = c.distancia; div.append(b, sm); caixaAstros.appendChild(div) }
          if (!cacheR.has(k) || cacheR.get(k) !== div) cacheR.set(k, div)
          c.obj.getWorldPosition(tmp)
          const dist = tmp.distanceTo(camera.position)
          let extra = true
          if (c.superficie) extra = dist < 3.2 && tmp.clone().normalize().dot(camera.position.clone().sub(tmp)) > 0   // atrás da Terra não aparece
          else if (c.exo) extra = dist < 70 || foco.atual === k
          tmp.project(camera)
          const vis = extra && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && dist > c.raio * 2.2
          div.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w + 10}px, ${(-tmp.y * 0.5 + 0.5) * h - 12}px)`
          div.style.opacity = vis ? '1' : '0'
        }
      } else if (caixaAstros && caixaAstros.childElementCount) { caixaAstros.innerHTML = ''; caixaAstros._cache?.clear() }
      // rótulos: posição na tela e escondidos quando estão atrás do globo
      if (rotulosRef.current) rotulosRef.current.style.opacity = controles.target.length() < 0.5 && camera.position.length() < 8 ? '1' : '0'
      if (rotulos.length) {
        const w = el.clientWidth, h = el.clientHeight
        const cam = camera.position.clone().normalize()
        const usados = []
        // o servidor (último) tem prioridade; depois as cidades por volume. Rótulo que encostaria em outro fica escondido.
        ;[rotulos[rotulos.length - 1], ...rotulos.slice(0, -1)].forEach(({ div, pos }) => {
          tmp.copy(pos).applyMatrix4(globo.matrixWorld)
          const frente = tmp.clone().normalize().dot(cam) > 0.18
          tmp.project(camera)
          const x = (tmp.x * 0.5 + 0.5) * w + 8, y = (-tmp.y * 0.5 + 0.5) * h - 10
          const livre = usados.every(([ux, uy]) => Math.abs(ux - x) > 90 || Math.abs(uy - y) > 20)
          div.style.transform = `translate(${x}px, ${y}px)`
          div.style.opacity = frente && livre ? '1' : '0'
          if (frente && livre) usados.push([x, y])
        })
      }
    }
    laco()
    return () => {
      cancelAnimationFrame(quadro); ro.disconnect(); io.disconnect(); clearTimeout(retomar)
      clearTimeout(retomar)   // o "voltar a girar" não dispara depois de fechar a tela
      el.removeEventListener('pointermove', mover); el.removeEventListener('click', clicar); el.removeEventListener('pointerleave', sair); el.removeEventListener('dblclick', duplo)
      window.removeEventListener('keydown', tecla); window.removeEventListener('keyup', tecla); window.removeEventListener('blur', soltar)
      el.removeEventListener('pointerdown', arrastoIni); window.removeEventListener('pointermove', arrastoMove); window.removeEventListener('pointerup', arrastoFim)
      vivo = false; marcos.descartar(); exo?.descartar()
      universo.descartar(); sats.descartar(); nave?.descartar?.()
      som.descartar(); dim.obj?.descartar()
      controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      tex.dispose(); texNuvens.dispose(); if (texturas) Object.values(texturas).forEach((x) => x.dispose())
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // dados novos: recria só a camada dinâmica
  const chavePontos = JSON.stringify(pontos)
  useEffect(() => { montarRef.current?.() }, [chavePontos])
  useEffect(() => { mostrarSatsRef.current = mostrarSats; if (satsRef.current) satsRef.current.camada.visivel = mostrarSats }, [mostrarSats])
  // painel ao vivo dos satélites (posição da ISS etc.), 1 vez por segundo
  useEffect(() => {
    if (!mostrarSats) return undefined
    const t = setInterval(() => { const s = satsRef.current; if (s) setResumoSats({ ...s.camada.resumo(), fonte: s.fonte }) }, 1000)
    return () => clearInterval(t)
  }, [mostrarSats])
  useEffect(() => { acoesRef.current.girando = girando; acoesRef.current.girar?.(girando) }, [girando])
  useEffect(() => { acoesRef.current.explorar?.(explorar) }, [explorar])
  useEffect(() => { acoesRef.current.explorarExterno = (v) => setExplorar(v) }, [])
  useEffect(() => { acoesRef.current.aoFocar = (k) => { setInfo(k); setAba('dados') }; acoesRef.current.viajando = setViajando }, [])
  useEffect(() => { acoesRef.current.naveLigada = explorar && nave; acoesRef.current.aoHud = setHud; if (!nave) setHud(null) }, [explorar, nave])
  useEffect(() => { acoesRef.current.seguirIss = seguirIss && !explorar; if (seguirIss) acoesRef.current.girar?.(false) }, [seguirIss, explorar])
  useEffect(() => { acoesRef.current.tempo?.(explorar ? tempo : 1) }, [tempo, explorar])
  useEffect(() => { if (!explorar) { setInfo(null); setTour(false); setNave(false); setTempo(1) } }, [explorar])
  // salto hipersônico: 10 s de contagem (a dimensão é montada nesse tempo), dobra máxima e chegada
  const abortarSalto = () => {
    clearInterval(hiperTimer.current); hiperTimer.current = null
    const a = acoesRef.current
    if (a.dim) { a.dim.estado = null; a.dim.carga = 0 }
    setHiper(null)
  }
  const iniciarSalto = () => {
    const a = acoesRef.current
    if (hiperTimer.current || dentro || !a.dim) return
    a.som?.iniciar(); a.som?.bipe()
    let n = 10
    a.dim.estado = 'contagem'; a.dim.carga = 0
    setHiper({ n, prog: 0, fase: 'contagem' })
    let pronta = false, erro = ''
    a.prepararDimensao((p) => setHiper((h) => (h ? { ...h, prog: p } : h))).then(() => { pronta = true }).catch((e) => { erro = e?.message || 'falha ao montar' })
    hiperTimer.current = setInterval(() => {
      n -= 1
      if (erro) { abortarSalto(); return }
      a.dim.carga = ((10 - n) / 10) * 0.7
      if (n > 0) { setHiper((h) => (h ? { ...h, n } : h)); a.som?.bipe(n <= 3); return }
      clearInterval(hiperTimer.current); hiperTimer.current = null
      a.dim.estado = 'dobra'; a.som?.salto()
      setHiper((h) => (h ? { ...h, n: 0, fase: 'dobra' } : h))
      const chegar = () => { if (!pronta) { setTimeout(chegar, 200); return } a.dim.estado = 'dentro'; setHiper(null); setDentro(true); a.som?.dimensao(true) }
      setTimeout(chegar, 1500)
    }, 1000)
  }
  const voltarDimensao = () => { acoesRef.current.som?.dimensao(false); acoesRef.current.sairDimensao?.(); setDentro(false) }
  useEffect(() => { if (!(explorar && nave)) { if (hiperTimer.current) abortarSalto(); if (dentro) voltarDimensao() } }, [explorar, nave]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearInterval(hiperTimer.current), [])
  const alternarMudo = () => { const v = !mudo; setMudo(v); acoesRef.current.som?.iniciar(); acoesRef.current.som?.definirMudo(v) }
  // tour guiado: visita cada astro com a ficha aberta
  const ROTEIRO = ['terra', 'lua', 'sol', 'mercurio', 'venus', 'marte', 'cinturao', 'ceres', 'jupiter', 'europa', 'saturno', 'tita', 'urano', 'netuno', 'plutao', 'cometa', 'pleiades', 'orion', 'andromeda', 'magalhaes']
  const passoTour = useRef(0)
  useEffect(() => {
    if (!tour) return undefined
    const ir = () => { acoesRef.current.irPara?.(ROTEIRO[passoTour.current % ROTEIRO.length]); passoTour.current += 1 }
    ir()
    const t = setInterval(ir, 11000)
    return () => clearInterval(t)
  }, [tour]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const f = () => setTelaCheia(document.fullscreenElement === caixaRef.current)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const alternarTelaCheia = () => { if (document.fullscreenElement) document.exitFullscreen?.(); else caixaRef.current?.requestFullscreen?.().catch(() => {}) }
  const fichaExo = (k) => {
    const p = exoRef.current[k]; if (!p) return null
    const n = (v, c = 1) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: c }))
    return { nome: p.pl_name, tipo: `${p.classe} · estrela ${p.hostname}${p.st_spectype ? ` (${p.st_spectype})` : ''}`,
      dados: [['Distância', `${n(p.anos_luz)} anos-luz (${n(p.sy_dist, 2)} parsecs)`], ['Raio', p.pl_rade ? `${n(p.pl_rade, 2)} × a Terra` : '—'], ['Massa', p.pl_bmasse ? `${n(p.pl_bmasse, 1)} × a Terra` : '—'],
        ['Ano do planeta', p.pl_orbper ? `${n(p.pl_orbper, 2)} dias` : '—'], ['Temperatura de equilíbrio', p.pl_eqt ? `${n(p.pl_eqt, 0)} K (${n(p.pl_eqt - 273.15, 0)} °C)` : '—'],
        ['Temperatura da estrela', p.st_teff ? `${n(p.st_teff, 0)} K` : '—'], ['Descoberta', `${p.disc_year || '—'} · ${p.discoverymethod || '—'}`], ['Posição no céu', `AR ${n(p.ra, 2)}° · Dec ${n(p.dec, 2)}°`]],
      historia: 'Dados do NASA Exoplanet Archive (parâmetros compostos). A aparência no globo é ilustrativa, escolhida pela classe do planeta; a direção no céu é a real e a distância está fora de escala.',
      curiosidades: [`A luz da estrela ${p.hostname} leva cerca de ${n(p.anos_luz, 0)} anos para chegar até nós.`, p.discoverymethod === 'Transit' ? 'Descoberto pelo trânsito: a estrela fica um pouco mais fraca quando o planeta passa na frente.' : p.discoverymethod === 'Radial Velocity' ? 'Descoberto pela velocidade radial: o planeta faz a estrela "balançar" um pouco.' : `Método de descoberta: ${p.discoverymethod || 'não informado'}.`] }
  }
  const fichaLugar = (k) => { const m = MARCOS.find((x) => `lugar:${x[0]}` === k); return m && { nome: m[1], tipo: 'Lugar na Terra', dados: [['Latitude', `${m[2].toFixed(3).replace('.', ',')}°`], ['Longitude', `${m[3].toFixed(3).replace('.', ',')}°`]], historia: m[4], curiosidades: [m[0] === 'muralha' ? 'Mito comum: a muralha não é vista a olho nu da Lua nem da órbita baixa; ela é estreita e tem a cor do terreno.' : 'Coordenadas reais; o alfinete fica fora de escala para dar para achar.'] } }
  const ficha = info ? INFO_ASTROS[info] || (info.startsWith('exo:') ? fichaExo(info) : info.startsWith('lugar:') ? fichaLugar(info) : null) : null

  const botao = 'flex h-8 w-8 items-center justify-center hover:bg-white/10'
  return (
    <div ref={caixaRef} className="relative h-full w-full overflow-hidden bg-[#03070d]"> {/* marca: fundo do espaço atrás do globo */}
      <div ref={ref} className={`h-full w-full touch-none transition-opacity duration-700 [&>canvas]:h-full [&>canvas]:w-full ${className}`} role="img"
        aria-label="Globo 3D com a origem dos acessos e ataques, dia e noite pela hora real; arraste para girar" />
      <div ref={rotulosRef} className="pointer-events-none absolute inset-0 transition-opacity duration-500 [&>div]:left-0 [&>div]:top-0" />
      <div ref={astrosRef} className="pointer-events-none absolute inset-0" />
      <div ref={satRotulosRef} className="pointer-events-none absolute inset-0" />
      {mostrarSats && !explorar && resumoSats?.total > 0 && (
        <div className="absolute bottom-3 left-3 w-[17.5rem] max-w-[calc(100%-4rem)] rounded-lg border border-white/15 bg-black/60 p-2.5 text-[11px] text-white backdrop-blur"> {/* marca: painel flutua sobre o espaço */}
          <p className="flex items-center gap-1.5 font-semibold"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />Satélites ao vivo · {resumoSats.total}</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-white/75">
            {Object.entries(GRUPOS_SAT).filter(([k]) => resumoSats.porGrupo[k]).map(([k, g]) => (
              <li key={k} className="flex items-center gap-1 truncate"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `#${g.cor.toString(16).padStart(6, '0')}` }} />{g.nome} <span className="tabular text-white/50">{resumoSats.porGrupo[k]}</span></li>
            ))}
          </ul>
          {resumoSats.iss && (
            <div className="mt-2 border-t border-white/10 pt-1.5">
              <p className="font-medium text-yellow-100">Estação Espacial (ISS) agora</p>
              <p className="tabular text-white/75">{Math.abs(resumoSats.iss.lat).toFixed(2)}°{resumoSats.iss.lat >= 0 ? 'N' : 'S'} · {Math.abs(resumoSats.iss.lon).toFixed(2)}°{resumoSats.iss.lon >= 0 ? 'L' : 'O'}</p>
              <p className="tabular text-white/75">{Math.round(resumoSats.iss.alt)} km de altitude · {Math.round(resumoSats.iss.vel).toLocaleString('pt-BR')} km/h</p>
            </div>
          )}
          <p className="mt-1.5 text-[10px] text-white/45">Órbitas da {resumoSats.fonte?.fonte || 'CelesTrak'}, posição calculada aqui (SGP4). Apagados = na sombra da Terra.</p>
        </div>
      )}
      {explorar && nave && hud && !dentro && !hiper && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-4 rounded-lg border border-sky-300/20 bg-black/60 px-4 py-2 font-mono text-[11px] text-sky-100 backdrop-blur"> {/* marca: painel de voo da nave */}
          <span>ACELERADOR <b className="tabular-nums">{Math.round(hud.empuxo * 100)}%</b></span>
          <span>VEL <b className="tabular-nums">{Math.round(hud.vel / Math.max(1e-6, hud.escala || 1) * 50).toLocaleString('pt-BR')}</b> m/s</span>
          <span>DOBRA <b className="tabular-nums">{Math.round(hud.dobra / 0.7 * 100)}%</b></span>
          {hud.perto && <span>PERTO DE <b>{hud.perto.nome}</b></span>}
        </div>
      )}
      {seguirIss && !explorar && <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"><span className="rounded-full border border-yellow-200/30 bg-black/60 px-3 py-1 text-[11px] font-medium text-yellow-100 backdrop-blur">Seguindo a Estação Espacial Internacional</span></div>} {/* marca: aviso de câmera seguindo */}
      {viajando && <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center"><span className="rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[11px] font-medium tracking-wide text-sky-200 backdrop-blur">Em dobra espacial…</span></div>} {/* marca: aviso durante a viagem */}
      {explorar && (
        <div className="absolute left-3 top-3 flex max-h-[calc(100%-3rem)] w-48 flex-col overflow-hidden rounded-lg border border-white/15 bg-black/60 text-white backdrop-blur"> {/* marca: painel flutua sobre o espaço */}
          <div className="flex items-center justify-between border-b border-white/15 px-3 py-2"><span className="text-xs font-semibold">Viajar para</span><button onClick={() => setExplorar(false)} aria-label="Sair do modo universo" className="rounded p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button></div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-width:thin]">
            <div className="px-2 pb-1 pt-1.5"><input value={buscaAstro} onChange={(e) => setBuscaAstro(e.target.value)} placeholder="Buscar astro ou lugar" aria-label="Buscar astro ou lugar" className="h-7 w-full rounded border border-white/15 bg-white/5 px-2 text-[11px] text-white placeholder:text-white/40" /></div>
            {!buscaAstro && GRUPOS_ASTROS.map(([g, lista]) => (
              <div key={g}>
                <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-white/45">{g}</p>
                {lista.map((k) => <button key={k} onClick={() => { setTour(false); acoesRef.current.irPara?.(k) }} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-white/10 ${info === k ? 'bg-white/15' : ''}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_ASTRO[k] }} />{INFO_ASTROS[k]?.nome || k}</button>)}
              </div>
            ))}
            {(() => {
              const q = buscaAstro.trim().toLowerCase()
              const lugares = MARCOS.map(([k, nome]) => ({ k: `lugar:${k}`, nome, cor: '#f59e0b' })).filter((x) => !q || x.nome.toLowerCase().includes(q))
              const exos = exoLista.map((x) => ({ k: x.k, nome: x.nome, sub: `${x.al < 100 ? x.al.toFixed(1).replace('.', ',') : Math.round(x.al)} a.l.`, cor: '#a78bfa' })).filter((x) => !q || x.nome.toLowerCase().includes(q))
              const astros = q ? GRUPOS_ASTROS.flatMap(([, l]) => l).filter((k) => (INFO_ASTROS[k]?.nome || k).toLowerCase().includes(q)).map((k) => ({ k, nome: INFO_ASTROS[k]?.nome || k, cor: COR_ASTRO[k] })) : []
              const bloco = (titulo, l) => l.length > 0 && (
                <div key={titulo}>
                  <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-white/45">{titulo}</p>
                  {l.slice(0, q ? 60 : 400).map((x) => <button key={x.k} onClick={() => { setTour(false); acoesRef.current.irPara?.(x.k) }} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-white/10 ${info === x.k ? 'bg-white/15' : ''}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.cor }} /><span className="truncate">{x.nome}</span>{x.sub && <span className="ml-auto shrink-0 text-[10px] text-white/45">{x.sub}</span>}</button>)}
                </div>)
              return [bloco('Astros', astros), bloco('Lugares na Terra', lugares), bloco(`Exoplanetas · NASA (${exoLista.length})`, exos)]
            })()}
          </div>
          <div className="space-y-2 border-t border-white/15 px-3 py-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setTour((v) => !v)} className={`flex items-center justify-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] ${tour ? 'bg-white/20' : 'hover:bg-white/10'}`}><Route className="h-3 w-3" />{tour ? 'Parar tour' : 'Tour'}</button>
              <button onClick={() => { acoesRef.current.som?.iniciar(); setNave((v) => !v) }} className={`flex items-center justify-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] ${nave ? 'bg-white/20' : 'hover:bg-white/10'}`} title="Pilotar a nave pelo teclado"><Rocket className="h-3 w-3" />{nave ? 'Sair da nave' : 'Pilotar nave'}</button>
            </div>
            {nave && (
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <button onClick={hiper ? abortarSalto : iniciarSalto} disabled={dentro} className={`flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] disabled:opacity-40 ${hiper ? 'border-red-300/40 bg-red-500/20' : 'border-fuchsia-300/40 bg-fuchsia-500/15 hover:bg-fuchsia-500/25'}`} title="Contagem de 10 s e salto para outra dimensão"><Zap className="h-3 w-3" />{hiper ? 'Abortar salto' : 'Velocidade hipersônica'}</button>
                <button onClick={alternarMudo} className="rounded-md border border-white/15 px-2 py-1 hover:bg-white/10" aria-label={mudo ? 'Ligar o som da nave' : 'Desligar o som da nave'} title={mudo ? 'Ligar o som' : 'Desligar o som'}>{mudo ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}</button>
              </div>
            )}
            {tour && <button onClick={() => { acoesRef.current.irPara?.(ROTEIRO[passoTour.current % ROTEIRO.length]); passoTour.current += 1 }} className="flex w-full items-center justify-center gap-1 rounded-md border border-white/15 px-2 py-1 text-[11px] hover:bg-white/10"><SkipForward className="h-3 w-3" />Próximo destino</button>}
            <label className="block text-[10px] text-white/70"><span className="flex items-center justify-between"><span className="flex items-center gap-1"><FastForward className="h-3 w-3" />Tempo</span><span className="tabular-nums">{tempo}×</span></span>
              <input type="range" min={0} max={6} step={1} value={[0, 1, 5, 20, 100, 500, 2000].indexOf(tempo)} onChange={(e) => setTempo([0, 1, 5, 20, 100, 500, 2000][Number(e.target.value)])} className="w-full accent-sky-400" aria-label="Velocidade do tempo" /></label>
            {nave && <p className="text-[10px] leading-snug text-sky-200">W/S acelerador · A/D guinada · ↑/↓ nariz · Q/E ou ←/→ rolagem · arraste para apontar · Espaço freia · X corta o motor · Shift turbo e dobra · clique num destino para o piloto automático. Velocidade pela escala da nave (50 m).</p>}
            {!nave && <p className="text-[10px] leading-snug text-white/55">Role para aproximar · dois cliques num astro para ir até ele. Direções reais; tamanhos fora de escala.</p>}
          </div>
        </div>
      )}
      <AnimatePresenceLite mostrar={explorar && !!ficha}>
        {ficha && (
          <div className="absolute right-14 top-3 max-h-[70%] w-80 overflow-hidden rounded-lg border border-white/15 bg-black/65 text-white backdrop-blur max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:bottom-12 max-sm:w-auto max-sm:max-h-[45%]"> {/* marca: ficha do astro sobre o espaço */}
            <div className="flex items-start justify-between gap-2 border-b border-white/15 px-3 py-2">
              <div className="min-w-0"><p className="flex items-center gap-1.5 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_ASTRO[info] }} />{ficha.nome}</p><p className="text-[11px] text-white/60">{ficha.tipo}</p></div>
              <button onClick={() => setInfo(null)} aria-label="Fechar ficha" className="rounded p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex gap-1 border-b border-white/10 px-2 py-1.5 text-[11px]">{[['dados', 'Dados', Info], ['historia', 'História', Compass], ['curiosidades', 'Curiosidades', Orbit]].map(([k, r, I]) => <button key={k} onClick={() => setAba(k)} className={`flex items-center gap-1 rounded px-2 py-0.5 ${aba === k ? 'bg-white/15 font-medium' : 'text-white/65 hover:text-white'}`}><I className="h-3 w-3" />{r}</button>)}</div>
            <div className="max-h-56 overflow-y-auto px-3 py-2 text-xs leading-relaxed [scrollbar-width:thin]">
              {aba === 'dados' && <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">{ficha.dados.flatMap(([k, v]) => [<dt key={`${k}-t`} className="text-white/55">{k}</dt>, <dd key={`${k}-v`} className="text-white/90">{v}</dd>])}</dl>}
              {aba === 'historia' && <p className="text-white/85">{ficha.historia}</p>}
              {aba === 'curiosidades' && <ul className="space-y-1.5">{ficha.curiosidades.map((c) => <li key={c} className="flex gap-2 text-white/85"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sky-300" />{c}</li>)}</ul>}
            </div>
          </div>
        )}
      </AnimatePresenceLite>
      {!pronto && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/60">Desenhando o mapa…</div>}
      {hiper && hiper.fase === 'contagem' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center text-white">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-fuchsia-200">Velocidade hipersônica em</p>
          <p key={hiper.n} className="mt-1 font-mono text-[96px] font-bold leading-none tabular-nums text-white [animation:pulso-contagem_1s_ease-out] motion-reduce:animate-none">{hiper.n}</p>
          <div className="mt-4 h-1 w-56 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-fuchsia-400 transition-[width] duration-300" style={{ width: `${hiper.prog || 0}%` }} /></div>
          <p className="mt-1.5 text-[11px] text-white/70">{(hiper.prog || 0) < 100 ? `Abrindo o portal da outra dimensão… ${hiper.prog || 0}%` : 'Portal pronto'}</p>
        </div>
      )}
      {hiper && hiper.fase === 'dobra' && <div className="pointer-events-none absolute inset-0 z-20 bg-white [animation:clarao-salto_1.5s_ease-in_forwards] motion-reduce:hidden" />}
      {dentro && (
        <div className="absolute right-3 top-3 z-20 w-72 rounded-lg border border-fuchsia-300/25 bg-black/65 p-3 text-white backdrop-blur max-sm:left-3 max-sm:w-auto"> {/* marca: painel da outra dimensão */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-fuchsia-200">Outra dimensão · Ômega-7</p>
          <p className="mt-1 text-sm font-semibold">Civilização Arkan (ficção)</p>
          <ul className="mt-2 space-y-0.5 text-[11px] text-white/80">
            <li>Megacidade flutuante com elevador espacial até o anel orbital</li>
            <li>Frota de discos e naves-flecha, e a nave-mãe com raio de tração</li>
            <li>Portal de energia, cristais flutuantes e planeta anelado com cidades no lado noturno</li>
            <li>Dois sóis e céu de nebulosa</li>
          </ul>
          <p className="mt-2 text-[10px] text-white/55">W/S acelerador · A/D guinada · ↑/↓ nariz · Q/E rolagem · Shift turbo · Espaço freia</p>
          <div className="mt-2.5 flex gap-1.5">
            <button onClick={voltarDimensao} className="flex-1 rounded-md bg-white/90 px-2 py-1.5 text-[11px] font-medium text-slate-900 hover:bg-white">Voltar à nossa dimensão</button>
            <button onClick={alternarMudo} className="rounded-md border border-white/20 px-2 hover:bg-white/10" aria-label={mudo ? 'Ligar o som' : 'Desligar o som'}>{mudo ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}</button>
          </div>
        </div>
      )}
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-white/15 bg-black/50 text-white backdrop-blur">
        <button onClick={alternarTelaCheia} className={botao} aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'} title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}>{telaCheia ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
        <button onClick={() => setMostrarSats((v) => !v)} className={`${botao} border-b border-white/15 ${mostrarSats ? 'bg-white/15' : ''}`} aria-label={mostrarSats ? 'Esconder satélites' : 'Mostrar satélites'} title={mostrarSats ? 'Esconder satélites' : 'Mostrar satélites ao vivo'}><Satellite className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setExplorar(true); setNave((v) => !v || !explorar); setSeguirIss(false) }} className={`${botao} border-t border-white/15 ${explorar && nave ? 'bg-white/15' : ''}`} aria-label="Pilotar a nave" title="Pilotar a nave pelo universo"><Rocket className="h-3.5 w-3.5" /></button>
        {!explorar && <button onClick={() => { setMostrarSats(true); setSeguirIss((v) => !v) }} className={`${botao} border-t border-white/15 ${seguirIss ? 'bg-white/15' : ''}`} aria-label={seguirIss ? 'Parar de seguir a ISS' : 'Seguir a ISS'} title={seguirIss ? 'Parar de seguir a ISS' : 'Seguir a Estação Espacial ao vivo'}><Crosshair className="h-3.5 w-3.5" /></button>}
        <button onClick={() => setExplorar((v) => !v)} className={`${botao} border-t border-white/15 ${explorar ? 'bg-white/15' : ''}`} aria-label={explorar ? 'Voltar ao globo' : 'Explorar o universo'} title={explorar ? 'Voltar ao globo' : 'Explorar o universo'}>{explorar ? <Globe2 className="h-3.5 w-3.5" /> : <Orbit className="h-3.5 w-3.5" />}</button>
        <button onClick={() => acoesRef.current.zoom?.(0.8)} className={`${botao} border-t border-white/15`} aria-label="Aproximar" title="Aproximar"><Plus className="h-3.5 w-3.5" /></button>
        <button onClick={() => acoesRef.current.zoom?.(1.25)} className={`${botao} border-t border-white/15`} aria-label="Afastar" title="Afastar"><Minus className="h-3.5 w-3.5" /></button>
        <button onClick={() => acoesRef.current.inicio?.()} className={`${botao} border-t border-white/15`} aria-label="Voltar à vista inicial" title="Vista inicial"><RotateCcw className="h-3.5 w-3.5" /></button>
        <button onClick={() => setGirando((g) => !g)} className={`${botao} border-t border-white/15`} aria-label={girando ? 'Parar rotação' : 'Girar'} title={girando ? 'Parar rotação' : 'Girar'}>{girando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
      </div>
      <div ref={dicaRef} className="pointer-events-none absolute z-10 hidden rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl" /> {/* marca: dica flutua */}
    </div>
  )
}

// aparece com um fade simples (sem depender do framer-motion neste componente pesado)
function AnimatePresenceLite({ mostrar, children }) {
  return <div className={`transition-opacity duration-300 ${mostrar ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>{children}</div>
}
