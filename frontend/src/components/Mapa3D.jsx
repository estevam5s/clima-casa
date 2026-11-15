import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Box, Building2, Clock, Eye, Moon, Pause, Play, RotateCcw, Sun } from 'lucide-react'

// Escritório em 3D montado a partir da mesma planta do mapa 2D (config.mapa):
// paredes com vão de porta e janela, pisos por sala (cor do projeto), mesas com PCs e cadeiras, ares de parede
// com fluxo de ar animado na cor do modo, pessoas animadas (sentadas digitando, andando pelo salão) e sombras.
// 1 unidade da planta = 1 cm. Mapa x → mundo x; mapa y → mundo z.
const S = 0.01
const COR_MODO = { frio: 0x3b82f6, quente: 0xf97316, ventilar: 0x14b8a6, seco: 0xa855f7, auto: 0x22c55e }
const AR_L = 86, AR_A = 22
const PELES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac]
const CABELOS = [0x2b1b12, 0x4a3122, 0x111111, 0x7a5230, 0x6b6b6b]
const ROUPAS = [0x1e3a5f, 0x335c67, 0x6b2737, 0x2f4858, 0x5b5f97, 0x3a5a40, 0x9a6324, 0x264653]

// gerador estável (a mesma planta sempre gera as mesmas pessoas)
function aleatorio(semente) {
  let s = semente >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// ponto local (lx, ly) de um elemento girado em torno do próprio centro → coordenada da planta
function girar(e, lx, ly) {
  const t = (e.rot || 0) * Math.PI / 180, cx = e.w / 2, cy = e.h / 2
  const dx = lx - cx, dy = ly - cy
  return [e.x + cx + dx * Math.cos(t) - dy * Math.sin(t), e.y + cy + dx * Math.sin(t) + dy * Math.cos(t)]
}

// Paredes = bordas das salas, unidas (parede compartilhada vira uma só) e cortadas nos vãos de porta e janela.
function paredes(salas, elementos) {
  const H = new Map(), V = new Map()
  const add = (m, k, a, b) => { const r = Math.round(k / 5) * 5; m.set(r, [...(m.get(r) || []), [Math.min(a, b), Math.max(a, b)]]) }
  for (const s of salas) {
    add(H, s.y, s.x, s.x + s.w); add(H, s.y + s.h, s.x, s.x + s.w)
    add(V, s.x, s.y, s.y + s.h); add(V, s.x + s.w, s.y, s.y + s.h)
  }
  const unir = (lista) => lista.sort((a, b) => a[0] - b[0]).reduce((acc, [a, b]) => {
    const u = acc[acc.length - 1]
    if (u && a <= u[1] + 1) u[1] = Math.max(u[1], b); else acc.push([a, b])
    return acc
  }, [])
  const vaos = []   // { horiz, k, a, b, tipo }
  for (const e of elementos) {
    let p1, p2
    if (e.tipo === 'porta') { p1 = girar(e, 0, e.h); p2 = girar(e, e.w, e.h) } else if (e.tipo === 'janela') { p1 = girar(e, 0, e.h / 2); p2 = girar(e, e.w, e.h / 2) } else continue
    const horiz = Math.abs(p1[1] - p2[1]) < Math.abs(p1[0] - p2[0])
    vaos.push(horiz ? { horiz, k: (p1[1] + p2[1]) / 2, a: Math.min(p1[0], p2[0]), b: Math.max(p1[0], p2[0]), tipo: e.tipo }
      : { horiz, k: (p1[0] + p2[0]) / 2, a: Math.min(p1[1], p2[1]), b: Math.max(p1[1], p2[1]), tipo: e.tipo })
  }
  const segs = []
  for (const [mapa, horiz] of [[H, true], [V, false]]) {
    for (const [k, lista] of mapa) {
      for (const [a, b] of unir(lista)) {
        const corte = vaos.filter((v) => v.horiz === horiz && Math.abs(v.k - k) < 16 && v.b > a && v.a < b).sort((x, y) => x.a - y.a)
        let ini = a
        for (const v of corte) {
          if (v.a > ini) segs.push({ horiz, k, a: ini, b: v.a, tipo: 'cheia' })
          segs.push({ horiz, k, a: Math.max(a, v.a), b: Math.min(b, v.b), tipo: v.tipo })
          ini = Math.max(ini, v.b)
        }
        if (ini < b) segs.push({ horiz, k, a: ini, b, tipo: 'cheia' })
      }
    }
  }
  return segs
}

// Pessoa low-poly com articulações (ombros, quadris, joelhos, pescoço) para animar.
function pessoa(r, sentada) {
  const g = new THREE.Group()
  const mat = (c, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough })
  const pele = mat(PELES[Math.floor(r() * PELES.length)], 0.6)
  const roupa = mat(ROUPAS[Math.floor(r() * ROUPAS.length)])
  const calca = mat(r() > 0.5 ? 0x1f2937 : 0x334155)
  const cabelo = mat(CABELOS[Math.floor(r() * CABELOS.length)], 0.9)
  const sapato = mat(0x111111)
  const capsula = (raio, comp, m) => { const x = new THREE.Mesh(new THREE.CapsuleGeometry(raio, comp, 6, 12), m); x.castShadow = true; return x }
  // quadril (raiz da pose)
  const quadril = new THREE.Group(); quadril.position.y = sentada ? 0.47 : 0.92; g.add(quadril)
  const tronco = capsula(0.17, 0.36, roupa); tronco.position.y = 0.3; quadril.add(tronco)
  const pescoco = new THREE.Group(); pescoco.position.y = 0.6; quadril.add(pescoco)
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 16), pele); cabeca.position.y = 0.13; cabeca.castShadow = true; pescoco.add(cabeca)
  const cab = new THREE.Mesh(new THREE.SphereGeometry(0.122, 20, 16, 0, Math.PI * 2, 0, Math.PI * (r() > 0.5 ? 0.55 : 0.62)), cabelo)
  cab.position.y = 0.145; cab.rotation.x = -0.25; pescoco.add(cab)
  const olhoM = mat(0x111111)
  for (const lado of [-1, 1]) { const o = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), olhoM); o.position.set(lado * 0.04, 0.14, 0.105); pescoco.add(o) }
  const bracos = [], pernas = []
  for (const lado of [-1, 1]) {
    const ombro = new THREE.Group(); ombro.position.set(lado * 0.22, 0.52, 0); quadril.add(ombro)
    const braco = capsula(0.055, 0.26, roupa); braco.position.y = -0.16; ombro.add(braco)
    const cotovelo = new THREE.Group(); cotovelo.position.y = -0.32; ombro.add(cotovelo)
    const ante = capsula(0.048, 0.22, pele); ante.position.y = -0.13; cotovelo.add(ante)
    bracos.push({ ombro, cotovelo })
    const quad = new THREE.Group(); quad.position.set(lado * 0.09, -0.02, 0); quadril.add(quad)
    const coxa = capsula(0.075, 0.3, calca); coxa.position.y = -0.2; quad.add(coxa)
    const joelho = new THREE.Group(); joelho.position.y = -0.42; quad.add(joelho)
    const canela = capsula(0.065, 0.3, calca); canela.position.y = -0.2; joelho.add(canela)
    const pe = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.22, 2, 0.03), sapato); pe.position.set(0, -0.4, 0.05); pe.castShadow = true; joelho.add(pe)
    pernas.push({ quad, joelho })
  }
  if (sentada) {
    pernas.forEach((p) => { p.quad.rotation.x = -Math.PI / 2; p.joelho.rotation.x = Math.PI / 2 })
    bracos.forEach((b) => { b.ombro.rotation.x = -0.55; b.cotovelo.rotation.x = -0.9 })
  }
  g.userData = { quadril, pescoco, bracos, pernas, fase: r() * 10, sentada }
  return g
}

function animarPessoa(p, t) {
  const { pescoco, bracos, pernas, fase, sentada, quadril } = p.userData
  if (sentada) {
    // digitando: antebraços batem, cabeça olha a tela e às vezes vira
    bracos.forEach((b, i) => { b.cotovelo.rotation.x = -0.9 + Math.sin(t * 9 + fase + i * 1.7) * 0.07 })
    pescoco.rotation.y = Math.sin(t * 0.35 + fase) > 0.93 ? Math.sin(t * 2 + fase) * 0.5 : 0
    pescoco.rotation.x = 0.12 + Math.sin(t * 0.8 + fase) * 0.03
    quadril.position.y = 0.47 + Math.sin(t * 1.6 + fase) * 0.004   // respiração
  } else {
    const c = Math.sin(t * 5.2 + fase)
    pernas[0].quad.rotation.x = c * 0.45; pernas[1].quad.rotation.x = -c * 0.45
    pernas[0].joelho.rotation.x = Math.max(0, -c) * 0.6; pernas[1].joelho.rotation.x = Math.max(0, c) * 0.6
    bracos[0].ombro.rotation.x = -c * 0.4; bracos[1].ombro.rotation.x = c * 0.4
    bracos.forEach((b) => { b.cotovelo.rotation.x = -0.25 })
    quadril.position.y = 0.92 + Math.abs(Math.cos(t * 5.2 + fase)) * 0.025
  }
}

// ---- luz do dia: hora de Brasília → posição do sol, cor do céu e se é noite ----
function horaBrasilia() {
  const d = new Date(Date.now() - 3 * 3600e3)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}
function ceuDaHora(h) {
  // 0 = meia-noite … 12 = meio-dia; elevação do sol simples (nasce 6h, põe 18h)
  const elev = Math.sin(((h - 6) / 12) * Math.PI)          // >0 de dia
  const noite = elev < -0.05
  const crepusculo = !noite && elev < 0.28
  const az = ((h - 6) / 12) * Math.PI                       // leste → oeste
  return { elev, noite, crepusculo, az, dia: !noite && !crepusculo }
}
function texturaCeu(c) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256
  const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256)
  const [topo, meio, base] = c.noite ? ['#05070f', '#0b1530', '#1c2742'] : c.crepusculo ? ['#2a3a6b', '#e2875a', '#f6c48f'] : ['#5aa0e6', '#9fcaf2', '#e7f1fa']
  gr.addColorStop(0, topo); gr.addColorStop(0.55, meio); gr.addColorStop(1, base)
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  return t
}
// pisos procedurais: madeira (tábuas), carpete (placas) e porcelanato (grade)
function texturaPiso(tipo, base) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d'); const r = aleatorio(tipo.length * 97)
  const cor = new THREE.Color(base)
  const tom = (k) => `#${cor.clone().offsetHSL(0, 0, k).getHexString()}`
  if (tipo === 'madeira') {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = tom((r() - 0.5) * 0.06); g.fillRect(0, i * 32, 256, 32)
      g.strokeStyle = tom(-0.12); g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke()
      const corte = r() * 256; g.beginPath(); g.moveTo(corte, i * 32); g.lineTo(corte, i * 32 + 32); g.stroke()
      g.strokeStyle = tom(-0.04); g.lineWidth = 0.6
      for (let k = 0; k < 3; k++) { g.beginPath(); const y = i * 32 + 6 + r() * 20; g.moveTo(0, y); g.bezierCurveTo(80, y + (r() - 0.5) * 6, 170, y + (r() - 0.5) * 6, 256, y); g.stroke() }
    }
  } else if (tipo === 'carpete') {
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = tom((x + y) % 2 ? -0.025 : 0.02); g.fillRect(x * 64, y * 64, 64, 64)
      for (let k = 0; k < 160; k++) { g.fillStyle = tom((r() - 0.5) * 0.1); g.fillRect(x * 64 + r() * 64, y * 64 + r() * 64, 1.4, 1.4) }
    }
  } else {
    g.fillStyle = tom(0); g.fillRect(0, 0, 256, 256)
    for (let k = 0; k < 600; k++) { g.fillStyle = tom((r() - 0.5) * 0.05); g.fillRect(r() * 256, r() * 256, 2, 2) }
    g.strokeStyle = tom(-0.1); g.lineWidth = 2
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(256, i * 128); g.stroke() }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return t
}

function etiqueta(texto, cor = '#ffffff', fundo = 'rgba(15,23,42,0.82)') {
  const c = document.createElement('canvas'); const g = c.getContext('2d')
  g.font = '600 44px system-ui, -apple-system, sans-serif'
  const w = Math.ceil(g.measureText(texto).width) + 48
  c.width = w; c.height = 76
  g.font = '600 44px system-ui, -apple-system, sans-serif'
  g.fillStyle = fundo; g.beginPath(); g.roundRect(0, 0, w, 76, 22); g.fill()
  g.fillStyle = cor; g.textBaseline = 'middle'; g.fillText(texto, 24, 40)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  sp.scale.set(w / 76 * 0.26, 0.26, 1); sp.renderOrder = 10
  return sp
}

export default function Mapa3D({ mapa, ares, projetos, filtro = 'todos', selecionado, aoSelecionar, compacto = false }) {
  const ref = useRef(null)
  const rotulosRef = useRef(null)
  const estado = useRef({})
  const [girando, setGirando] = useState(compacto && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [paredesAltas, setParedesAltas] = useState(true)
  const [pronto, setPronto] = useState(false)
  const [hora, setHora] = useState('agora')   // agora | dia | noite
  const [relogio, setRelogio] = useState(() => Math.floor(horaBrasilia() * 4))  // muda a cada 15 min
  // só remonta a cena quando algo visível muda (a lista chega nova a cada 10 s, mesmo igual)
  const chave = useMemo(() => JSON.stringify({ m: mapa, a: ares.map((a) => [a.id, a.ligado, a.modo, a.temperatura, a.projeto_id]), p: projetos.map((p) => [p.id, p.nome, p.cor]) }), [mapa, ares, projetos])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const escuro = document.documentElement.classList.contains('dark')
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    cena.background = new THREE.Color(escuro ? 0x0b0f14 : 0xeef1f4)
    cena.fog = new THREE.Fog(cena.background, 40, 80)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.dampingFactor = 0.07
    controles.maxPolarAngle = Math.PI / 2.15; controles.minDistance = 3; controles.maxDistance = 45
    controles.enableZoom = true; controles.zoomToCursor = true
    estado.current = { cena, camera, controles, renderer }
    setPronto(true)
    let quadro
    const relogio = new THREE.Clock()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (document.hidden) return
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      estado.current.tick?.(dt, calmo ? 0 : t)
      controles.update()
      renderer.render(cena, camera)
      estado.current.rotulos?.()
    }
    laco()
    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    ajustar()
    const ro = new ResizeObserver(ajustar); ro.observe(el)
    return () => {
      cancelAnimationFrame(quadro); ro.disconnect(); controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) })
      renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [])

  // monta (ou remonta) o escritório quando a planta, os ares ou a altura das paredes mudam
  useEffect(() => {
    const E = estado.current
    if (!E.cena) return undefined
    const { cena, camera, controles, renderer } = E
    const escuro = document.documentElement.classList.contains('dark')
    E.mundo && (cena.remove(E.mundo), E.mundo.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose?.(); m.dispose?.() }) }))
    const mundo = new THREE.Group(); E.mundo = mundo; cena.add(mundo)
    const salas = projetos.filter((p) => mapa.salas[p.id]).map((p) => ({ ...mapa.salas[p.id], p }))
    if (!salas.length) return undefined
    const x0 = Math.min(...salas.map((s) => s.x)), y0 = Math.min(...salas.map((s) => s.y))
    const x1 = Math.max(...salas.map((s) => s.x + s.w)), y1 = Math.max(...salas.map((s) => s.y + s.h))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const W = (mx) => (mx - cx) * S, Z = (my) => (my - cy) * S
    const ALT = paredesAltas ? 2.6 : 1.1
    const r = aleatorio(7)

    // luz pela hora real (ou forçada em Dia/Noite): sol, céu e luz de teto à noite
    const h = hora === 'dia' ? 13 : hora === 'noite' ? 21.5 : horaBrasilia()
    const ceu = ceuDaHora(h)
    E.ceu = ceu
    const fundoCeu = texturaCeu(ceu); cena.background = fundoCeu
    cena.fog = new THREE.Fog(new THREE.Color(ceu.noite ? 0x0b1530 : ceu.crepusculo ? 0xe2a07a : 0xdbe9f6), 45, 95)
    renderer.toneMappingExposure = ceu.noite ? 0.95 : 1.05
    mundo.add(new THREE.HemisphereLight(ceu.noite ? 0x3b4a7a : 0xffffff, escuro ? 0x1e293b : 0xb7c4cf, ceu.noite ? 0.35 : ceu.crepusculo ? 0.8 : 1.15))
    const sol = new THREE.DirectionalLight(ceu.noite ? 0x9db4ff : ceu.crepusculo ? 0xffb37a : 0xfff4e5, ceu.noite ? 0.35 : ceu.crepusculo ? 1.5 : 2.4)
    const tam = Math.max(x1 - x0, y1 - y0) * S
    const elev = Math.max(0.25, Math.abs(ceu.elev))
    sol.position.set(Math.cos(ceu.az) * tam * 0.9, tam * (0.35 + elev * 0.8), Math.sin(ceu.az) * tam * 0.5 + tam * 0.3); sol.castShadow = true
    sol.shadow.mapSize.set(2048, 2048); Object.assign(sol.shadow.camera, { left: -tam, right: tam, top: tam, bottom: -tam, near: 1, far: tam * 3 })
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 0.02
    mundo.add(sol)

    // terreno e pisos
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(tam * 4, tam * 4), new THREE.MeshStandardMaterial({ color: escuro ? 0x111827 : 0xdfe4e8, roughness: 1 }))
    chao.rotation.x = -Math.PI / 2; chao.position.y = -0.02; chao.receiveShadow = true; mundo.add(chao)
    chao.material.color.set(escuro || ceu.noite ? 0x1c2a1f : 0x9cb88e)
    const calcada = new THREE.Mesh(new THREE.PlaneGeometry((x1 - x0) * S + 2.4, (y1 - y0) * S + 2.4), new THREE.MeshStandardMaterial({ color: escuro || ceu.noite ? 0x2a2f36 : 0xc9ccd1, roughness: 0.95 }))
    calcada.rotation.x = -Math.PI / 2; calcada.position.y = -0.01; calcada.receiveShadow = true; mundo.add(calcada)
    // árvores do lado de fora (balançam com o vento)
    const arvores = []
    const matTronco = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9 })
    const matCopa = new THREE.MeshStandardMaterial({ color: ceu.noite ? 0x1f3d2b : 0x3f7d4e, roughness: 0.85, flatShading: true })
    const borda = [(x1 - x0) * S / 2 + 2.6, (y1 - y0) * S / 2 + 2.6]
    for (let i = 0; i < 14; i++) {
      const lado = i % 4, f = (Math.floor(i / 4) + 0.5 + r() * 0.3) / 4
      const ax = lado < 2 ? (f - 0.5) * borda[0] * 2 : (lado === 2 ? -1 : 1) * borda[0]
      const az = lado < 2 ? (lado === 0 ? -1 : 1) * borda[1] : (f - 0.5) * borda[1] * 2
      const tr = new THREE.Group(); tr.position.set(ax, 0, az); mundo.add(tr)
      const t1 = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.2, 8), matTronco); t1.position.y = 0.6; t1.castShadow = true; tr.add(t1)
      const copa = new THREE.Group(); copa.position.y = 1.5; tr.add(copa)
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 + r() * 0.25, 1), matCopa); b.position.set((r() - 0.5) * 0.5, k * 0.32, (r() - 0.5) * 0.5); b.castShadow = true; copa.add(b) }
      arvores.push({ copa, fase: r() * 6 })
    }
    const pisos = []
    for (const s of salas) {
      const tipoPiso = /reuni|diret/i.test(s.p.nome) ? 'carpete' : s.w * s.h > 300000 ? 'porcelanato' : 'madeira'
      const baseCor = tipoPiso === 'madeira' ? 0xb08a62 : tipoPiso === 'carpete' ? 0x6b7280 : 0xe7e5e4
      const tex = texturaPiso(tipoPiso, baseCor); tex.repeat.set((s.w * S) / (tipoPiso === 'porcelanato' ? 1.6 : 2.2), (s.h * S) / (tipoPiso === 'porcelanato' ? 1.6 : 2.2))
      const cor = new THREE.Color(0xffffff).lerp(new THREE.Color(s.p.cor || '#0f766a'), 0.12)
      if (escuro) cor.multiplyScalar(0.8)
      const piso = new THREE.Mesh(new THREE.PlaneGeometry(s.w * S, s.h * S), new THREE.MeshStandardMaterial({ color: cor, map: tex, roughness: tipoPiso === 'porcelanato' ? 0.35 : 0.8, metalness: tipoPiso === 'porcelanato' ? 0.05 : 0 }))
      piso.rotation.x = -Math.PI / 2; piso.position.set(W(s.x + s.w / 2), 0, Z(s.y + s.h / 2)); piso.receiveShadow = true
      piso.userData = { tipo: 'sala', id: s.p.id }
      mundo.add(piso); pisos.push(piso)
    }

    // paredes
    const matParede = new THREE.MeshStandardMaterial({ color: escuro ? 0xcbd5e1 : 0xfafaf9, roughness: 0.9 })
    const matTopo = new THREE.MeshStandardMaterial({ color: escuro ? 0x0f172a : 0x334155, roughness: 0.6 })
    const matVidro = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, roughness: 0.05, transmission: 0.6, transparent: true, opacity: 0.45 })
    const matMadeira = new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.7 })
    const ESP = 0.12
    const bloco = (horiz, k, a, b, ya, yb, mat, topo = false) => {
      const comp = (b - a) * S, alt = yb - ya
      if (comp <= 0.01 || alt <= 0) return
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : ESP, alt, horiz ? ESP : comp), mat)
      m.position.set(horiz ? W((a + b) / 2) : W(k), ya + alt / 2, horiz ? Z(k) : Z((a + b) / 2))
      m.castShadow = true; m.receiveShadow = true; mundo.add(m)
      if (topo) { const c = new THREE.Mesh(new THREE.BoxGeometry(horiz ? comp : ESP + 0.01, 0.02, horiz ? ESP + 0.01 : comp), matTopo); c.position.copy(m.position); c.position.y = yb + 0.01; mundo.add(c) }
    }
    for (const sg of paredes(salas, mapa.elementos)) {
      if (sg.tipo === 'cheia') bloco(sg.horiz, sg.k, sg.a, sg.b, 0, ALT, matParede, true)
      else if (sg.tipo === 'porta') { if (ALT > 2.1) bloco(sg.horiz, sg.k, sg.a, sg.b, 2.1, ALT, matParede, true) }
      else { // janela: parede embaixo, vidro, parede em cima
        bloco(sg.horiz, sg.k, sg.a, sg.b, 0, Math.min(0.95, ALT), matParede, ALT <= 0.95)
        if (ALT > 0.95) {
          const topoV = Math.min(2.1, ALT)
          const v = new THREE.Mesh(new THREE.BoxGeometry(sg.horiz ? (sg.b - sg.a) * S : 0.03, topoV - 0.95, sg.horiz ? 0.03 : (sg.b - sg.a) * S), matVidro)
          v.position.set(sg.horiz ? W((sg.a + sg.b) / 2) : W(sg.k), 0.95 + (topoV - 0.95) / 2, sg.horiz ? Z(sg.k) : Z((sg.a + sg.b) / 2)); mundo.add(v)
          if (ALT > 2.1) bloco(sg.horiz, sg.k, sg.a, sg.b, 2.1, ALT, matParede, true)
        }
      }
    }

    // luz de teto: painéis acesos (fortes à noite) e uma luz por sala
    const paineis = []
    const matPainel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: ceu.noite ? 1.6 : ceu.crepusculo ? 0.9 : 0.35 })   // só a face de baixo: de cima não aparece
    if (ALT > 2) for (const s of salas) {
      const nx = Math.max(1, Math.round((s.w * S) / 2.6)), nz = Math.max(1, Math.round((s.h * S) / 2.6))
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const pn = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), matPainel)
        pn.rotation.x = Math.PI / 2; pn.position.set(W(s.x + (s.w * (i + 0.5)) / nx), ALT - 0.015, Z(s.y + (s.h * (j + 0.5)) / nz)); mundo.add(pn)
      }
      if (ceu.noite || ceu.crepusculo) {
        const l = new THREE.PointLight(0xffe7c2, ceu.noite ? 1.6 : 0.8, Math.max(s.w, s.h) * S * 1.1, 1.6)
        l.position.set(W(s.x + s.w / 2), ALT - 0.3, Z(s.y + s.h / 2)); mundo.add(l); paineis.push(l)
      }
    }
    if (ceu.noite) matVidro.emissive = new THREE.Color(0xffd89a), matVidro.emissiveIntensity = 0.35

    // móveis e elementos
    const pessoas = [], caminhantes = []
    const matMesa = new THREE.MeshStandardMaterial({ color: escuro ? 0xd6d3d1 : 0xe7e5e4, roughness: 0.5 })
    const matPreto = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 })
    const matTela = new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x2563eb, emissiveIntensity: 0.35, roughness: 0.2 })
    const matCadeira = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })
    const caixa = (w, h, d, mat, x, y, z, ry = 0, pai = mundo) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; pai.add(m); return m
    }
    const cadeira = (pai, x, z, ry) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; pai.add(g)
      caixa(0.46, 0.06, 0.46, matCadeira, 0, 0.46, 0, 0, g); caixa(0.46, 0.5, 0.06, matCadeira, 0, 0.74, -0.22, 0, g)
      caixa(0.05, 0.42, 0.05, matPreto, 0, 0.22, 0, 0, g)
      return g
    }
    // estação: mesa + monitor + teclado + cadeira, opcionalmente com alguém sentado
    const estacao = (pai, x, z, ry, comPessoa, nome) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; pai.add(g)
      caixa(1.2, 0.04, 0.7, matMesa, 0, 0.74, 0, 0, g)
      for (const [px, pz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) caixa(0.04, 0.72, 0.04, matPreto, px, 0.36, pz, 0, g)
      caixa(0.6, 0.36, 0.03, matPreto, 0, 1.06, -0.22, 0, g)
      const tela = caixa(0.56, 0.32, 0.005, matTela, 0, 1.06, -0.203, 0, g); tela.castShadow = false
      caixa(0.05, 0.14, 0.05, matPreto, 0, 0.83, -0.24, 0, g)
      caixa(0.42, 0.015, 0.14, matPreto, 0, 0.77, 0.05, 0, g)
      cadeira(g, 0, 0.55, Math.PI)
      if (comPessoa) {
        const p = pessoa(r, true); p.position.set(0, 0, 0.5); p.rotation.y = Math.PI; g.add(p); pessoas.push(p)
        if (nome) { const et = etiqueta(nome); et.position.set(0, 1.75, 0.5); g.add(et) }
      }
      return g
    }
    for (const e of mapa.elementos) {
      const [mx, my] = girar(e, e.w / 2, e.h / 2)
      const x = W(mx), z = Z(my), ry = -(e.rot || 0) * Math.PI / 180
      const w = e.w * S, d = e.h * S
      if (e.tipo === 'mesa') {
        // fileira de estações dos dois lados do eixo mais comprido
        const longo = Math.max(w, d), curto = Math.min(w, d), vertical = d > w
        const n = Math.max(1, Math.floor(longo / 1.25))
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry + (vertical ? Math.PI / 2 : 0); mundo.add(g)
        for (let i = 0; i < n; i++) {
          const ax = -longo / 2 + longo * (i + 0.5) / n
          estacao(g, ax, -curto / 4 - 0.05, Math.PI, r() > 0.35)
          estacao(g, ax, curto / 4 + 0.05, 0, r() > 0.45)
        }
      } else if (e.tipo === 'bancada') {
        caixa(w, 0.05, d, matMesa, x, 0.9, z, ry)
        caixa(w * 0.98, 0.88, 0.04, matPreto, x, 0.45, z, ry)
      } else if (e.tipo === 'armario') {
        caixa(w, 1.0, d, matMadeira, x, 0.5, z, ry)
        caixa(w * 0.95, 0.03, d * 0.95, matMesa, x, 1.015, z, ry)
        const cafe = caixa(0.25, 0.32, 0.25, matPreto, x, 1.19, z, ry); cafe.castShadow = true   // cafeteira
      } else if (e.tipo === 'sofa') {
        caixa(w, 0.42, d, matCadeira, x, 0.21, z, ry); caixa(w, 0.4, 0.18, matCadeira, x, 0.6, z, ry)
      } else if (e.tipo === 'coluna') {
        caixa(w, ALT, d, matParede, x, ALT / 2, z, ry)
      } else if (e.tipo === 'parede') {
        caixa(w, ALT, d, matParede, x, ALT / 2, z, ry)
      } else if (e.tipo === 'planta') {
        const vaso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x78716c })); vaso.position.set(x, 0.175, z); vaso.castShadow = true; mundo.add(vaso)
        for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 1), new THREE.MeshStandardMaterial({ color: 0x2f855a, roughness: 0.9, flatShading: true })); f.position.set(x + (r() - 0.5) * 0.2, 0.55 + r() * 0.35, z + (r() - 0.5) * 0.2); f.castShadow = true; mundo.add(f) }
      } else if (e.tipo === 'monitor') {
        const vertical = d > w
        const tv = caixa(vertical ? 0.06 : w, 0.6, vertical ? d : 0.06, matPreto, x, 1.55, z, ry)
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(vertical ? d * 0.94 : w * 0.94, 0.54), new THREE.MeshStandardMaterial({ color: 0x0b1220, emissive: 0x38bdf8, emissiveIntensity: 0.25 }))
        tela.position.copy(tv.position); if (vertical) { tela.rotation.y = Math.PI / 2; tela.position.x += 0.035 } else tela.position.z += 0.035
        mundo.add(tela)
      } else if (e.tipo === 'porta') {
        // folha aberta a ~70° a partir da dobradiça (canto local 0,h)
        const [hx, hy] = girar(e, 0, e.h), [fx, fy] = girar(e, e.w, e.h)
        const ang = Math.atan2(fy - hy, fx - hx)
        const folha = new THREE.Group(); folha.position.set(W(hx), 0, Z(hy)); folha.rotation.y = -ang + 1.2; mundo.add(folha)
        caixa(e.w * S * 0.95, 2.05, 0.04, matMadeira, e.w * S * 0.475, 1.025, 0, 0, folha)
      }
    }

    // salas sem móvel ganham uma mesa de trabalho (com o dono da sala, quando o nome da sala é o de uma pessoa)
    const NAO_PESSOA = /^(sala\s+)?(bancada|reuni|escrit|sem nome|apoio|t[eé]cnica)/i
    for (const s of salas) {
      const temMovel = mapa.elementos.some((e) => ['mesa', 'bancada', 'sofa'].includes(e.tipo) && (() => { const [a, b] = girar(e, e.w / 2, e.h / 2); return a > s.x && a < s.x + s.w && b > s.y && b < s.y + s.h })())
      if (temMovel) continue
      const nomeSala = s.p.nome.trim()
      if (/reuni/i.test(nomeSala)) {
        const mx = W(s.x + s.w * 0.55), mz = Z(s.y + s.h * 0.5)
        const mesa = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.05, 1.1, 3, 0.02), matMadeira); mesa.position.set(mx, 0.75, mz); mesa.castShadow = true; mundo.add(mesa)
        caixa(0.08, 0.72, 0.6, matPreto, mx, 0.37, mz)
        for (let i = 0; i < 3; i++) { cadeira(mundo, mx - 0.8 + i * 0.8, mz - 0.85, 0); cadeira(mundo, mx - 0.8 + i * 0.8, mz + 0.85, Math.PI) }
        continue
      }
      const pessoaNome = /^sala\s+(.+)/i.test(nomeSala) && !NAO_PESSOA.test(nomeSala) ? nomeSala.replace(/^sala\s+/i, '') : null
      const vertical = s.h > s.w
      estacao(mundo, W(s.x + s.w * (vertical ? 0.5 : 0.62)), Z(s.y + s.h * 0.42), Math.PI, true, pessoaNome)
    }

    // gente andando pelo salão (a maior sala), em volta das mesas
    const salao = [...salas].sort((a, b) => b.w * b.h - a.w * a.h)[0]
    if (salao && salao.w * salao.h > 300000) {
      for (let i = 0; i < 5; i++) {
        const p = pessoa(r, false); mundo.add(p)
        const m = 70
        const pts = [[salao.x + m, salao.y + m + 40 * i], [salao.x + salao.w - m, salao.y + m + 40 * i], [salao.x + salao.w - m, salao.y + salao.h - m - 30 * i], [salao.x + m, salao.y + salao.h - m - 30 * i]]
          .map(([a, b]) => new THREE.Vector3(W(a), 0, Z(b)))
        const curva = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.2)
        caminhantes.push({ p, curva, t: i / 5, vel: 0.011 + r() * 0.007 })
        pessoas.push(p)
      }
    }

    // ares-condicionados
    const unidades = []
    const matAr = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.05 })
    const geoAr = new RoundedBoxGeometry(0.9, 0.3, 0.22, 4, 0.06)
    const texPonto = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    const montarAr = (pos, a, previsto) => {
      const mx = pos.x + AR_L / 2, my = pos.y + AR_A / 2
      const rot = (pos.rot || 0) * Math.PI / 180
      const dir = new THREE.Vector3(-Math.sin(rot), 0, Math.cos(rot))   // saída de ar (local +y da planta)
      const g = new THREE.Group()
      g.position.set(W(mx), Math.max(0.9, ALT - 0.38), Z(my)); g.rotation.y = -rot
      const corpo = new THREE.Mesh(geoAr, previsto ? new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.28 }) : matAr.clone())
      corpo.castShadow = !previsto; g.add(corpo)
      if (previsto) {
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoAr), new THREE.LineBasicMaterial({ color: 0x64748b })))
      } else {
        const grade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.03, 0.02), matPreto); grade.position.set(0, -0.1, 0.105); g.add(grade)
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), new THREE.MeshBasicMaterial({ color: a.ligado ? COR_MODO[a.modo] : 0x64748b })); led.position.set(0.36, 0.06, 0.112); g.add(led)
      }
      const alvo = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.6), new THREE.MeshBasicMaterial({ visible: false }))
      alvo.userData = previsto ? { tipo: 'elemento', id: a } : { tipo: 'ar', id: a.id }
      g.add(alvo); mundo.add(g)
      const u = { g, corpo, alvo, a, previsto, dir }
      if (!previsto && a.ligado) {
        // fluxo de ar: partículas saindo pela grade, descendo e abrindo em leque
        const N = 140, pos3 = new Float32Array(N * 3), vida = new Float32Array(N)
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos3, 3))
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, map: texPonto, color: COR_MODO[a.modo] || 0x14b8a6, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }))
        pts.position.copy(g.position); mundo.add(pts)
        const sem = []
        for (let i = 0; i < N; i++) { vida[i] = Math.random(); sem.push([(Math.random() - 0.5) * 0.8, Math.random()]) }
        u.fluxo = { pts, pos3, vida, sem }
        const luz = new THREE.PointLight(COR_MODO[a.modo] || 0x14b8a6, 0.6, 3.2); luz.position.copy(g.position).add(dir.clone().multiplyScalar(0.6)).setY(g.position.y - 0.5); mundo.add(luz)
        const temp = etiqueta(`${a.temperatura}°`, '#ffffff', `#${new THREE.Color(COR_MODO[a.modo] || 0x14b8a6).getHexString()}`); temp.position.set(0, 0.42, 0); temp.scale.multiplyScalar(0.8); g.add(temp)
      }
      unidades.push(u)
    }
    const consumidos = mapa.consumidos || []
    for (const a of ares) if (a.projeto_id && mapa.ares[a.id]) montarAr(mapa.ares[a.id], a, false)
    for (const e of mapa.elementos) if (e.tipo === 'ar_previsto' && !consumidos.includes(e.id)) montarAr({ x: e.x, y: e.y, rot: e.rot }, e.id, true)

    // "clima" da sala: névoa na cor do modo sobre o piso das salas com ar ligado (frio azul, quente laranja…)
    const climas = []
    for (const s of salas) {
      const lig = ares.filter((a) => a.projeto_id === s.p.id && a.ligado)
      if (!lig.length) continue
      const cv = document.createElement('canvas'); cv.width = cv.height = 128
      const g2 = cv.getContext('2d'); const gr = g2.createRadialGradient(64, 64, 4, 64, 64, 64)
      const c = new THREE.Color(COR_MODO[lig[0].modo] || 0x14b8a6)
      gr.addColorStop(0, `rgba(${c.r * 255},${c.g * 255},${c.b * 255},0.55)`); gr.addColorStop(1, `rgba(${c.r * 255},${c.g * 255},${c.b * 255},0)`)
      g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128)
      const tx = new THREE.CanvasTexture(cv)
      const nv = new THREE.Mesh(new THREE.PlaneGeometry(s.w * S * 0.96, s.h * S * 0.96), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }))
      nv.rotation.x = -Math.PI / 2; nv.position.set(W(s.x + s.w / 2), 0.03, Z(s.y + s.h / 2)); mundo.add(nv)
      climas.push({ m: nv, fase: r() * 6 })
    }

    // rótulos HTML das salas
    const caixaRot = rotulosRef.current
    caixaRot.innerHTML = ''
    const rot = salas.map((s) => {
      const lista = ares.filter((a) => a.projeto_id === s.p.id)
      const lig = lista.filter((a) => a.ligado).length
      const d = document.createElement('div')
      d.className = 'absolute left-0 top-0 whitespace-nowrap rounded-md border border-black/5 bg-white/90 px-2 py-1 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur transition-opacity dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100'
      d.innerHTML = ''
      const n = document.createElement('span'); n.textContent = s.p.nome; d.appendChild(n)
      const sub = document.createElement('span'); sub.className = 'ml-1.5 font-normal text-slate-500 dark:text-slate-400'
      sub.textContent = lista.length ? `${lig}/${lista.length} ligado(s)` : 'sem ar'; d.appendChild(sub)
      caixaRot.appendChild(d)
      return { d, v: new THREE.Vector3(W(s.x + s.w / 2), ALT + 0.35, Z(s.y + s.h / 2)) }
    })
    const tmp = new THREE.Vector3()
    E.rotulos = () => {
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight
      rot.forEach(({ d, v }) => {
        tmp.copy(v).project(camera)
        const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1
        d.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%, -50%)`
        d.style.opacity = vis ? '1' : '0'
      })
    }

    // animação
    E.tick = (dt, t) => {
      pessoas.forEach((p) => animarPessoa(p, t))
      arvores.forEach((a) => { a.copa.rotation.z = Math.sin(t * 0.9 + a.fase) * 0.035; a.copa.rotation.x = Math.cos(t * 0.7 + a.fase) * 0.025 })
      climas.forEach((c) => { c.m.material.opacity = 0.42 + Math.sin(t * 1.3 + c.fase) * 0.18 })
      matTela.emissiveIntensity = (ceu.noite ? 0.7 : 0.35) + Math.sin(t * 7) * 0.03 + (Math.sin(t * 0.37) > 0.97 ? 0.25 : 0)
      caminhantes.forEach((c) => {
        c.t = (c.t + dt * c.vel) % 1
        const a = c.curva.getPointAt(c.t), b = c.curva.getPointAt((c.t + 0.004) % 1)
        c.p.position.copy(a); c.p.rotation.y = Math.atan2(b.x - a.x, b.z - a.z)
      })
      unidades.forEach((u) => {
        if (u.fluxo) {
          const { pos3, vida, sem } = u.fluxo
          for (let i = 0; i < vida.length; i++) {
            vida[i] += dt * (0.35 + sem[i][1] * 0.25)
            if (vida[i] > 1) vida[i] -= 1
            const k = vida[i], lado = sem[i][0] * (0.4 + k * 1.1)
            const lx = lado, lz = 0.15 + k * 1.8, ly = -0.12 - k * k * 1.4
            // local → mundo (só rotação em y)
            const c = Math.cos(u.g.rotation.y), s = Math.sin(u.g.rotation.y)
            pos3[i * 3] = lx * c + lz * s; pos3[i * 3 + 1] = ly; pos3[i * 3 + 2] = -lx * s + lz * c
          }
          u.fluxo.pts.geometry.attributes.position.needsUpdate = true
          u.fluxo.pts.material.opacity = 0.5 + Math.sin(t * 3) * 0.05
        }
        const sel = E.sel && ((E.sel.tipo === 'ar' && u.a?.id === E.sel.id) || (E.sel.tipo === 'elemento' && u.a === E.sel.id))
        const alvo = sel ? 1.12 + Math.sin(t * 6) * 0.03 : 1
        u.g.scale.setScalar(THREE.MathUtils.lerp(u.g.scale.x, alvo, 0.2))
        if (!u.previsto) u.corpo.material.emissive?.setHex(sel ? 0x0f766a : 0x000000)
      })
      pisos.forEach((p) => { p.material.emissive?.setHex(E.sel?.tipo === 'sala' && E.sel.id === p.userData.id ? 0x0f2f2b : 0x000000) })
      const f = E.filtro || 'todos'
      unidades.forEach((u) => { if (!u.previsto) u.g.visible = f === 'todos' || (f === 'ligados' ? !!u.a.ligado : !u.a.ligado) })
    }

    // câmera enquadrando o prédio
    const enquadrar = (topo = false) => {
      const alvo = new THREE.Vector3(0, 0, 0)
      const dist = Math.max(x1 - x0, y1 - y0) * S * (topo ? 1.05 : 0.95) * (compacto ? 1.12 : 1)
      const destino = topo ? new THREE.Vector3(0, dist * 1.25, 0.01) : new THREE.Vector3(-dist * 0.25, dist * 0.78, dist * 0.78)
      const de = camera.position.clone(), deAlvo = controles.target.clone()
      if (!E.enquadrado) { camera.position.copy(destino); controles.target.copy(alvo); E.enquadrado = true; return }
      let t0 = null
      const passo = (ts) => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 800), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(de, destino, e); controles.target.lerpVectors(deAlvo, alvo, e); if (k < 1) requestAnimationFrame(passo) }
      requestAnimationFrame(passo)
    }
    enquadrar()
    E.enquadrar = enquadrar

    // clique e cursor
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
    const alvos = [...unidades.map((u) => u.alvo), ...pisos]
    const acerto = (ev) => {
      const b = renderer.domElement.getBoundingClientRect()
      mouse.set(((ev.clientX - b.left) / b.width) * 2 - 1, -((ev.clientY - b.top) / b.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      return ray.intersectObjects(alvos, false)[0]?.object.userData
    }
    let baixo = null
    const pd = (ev) => { baixo = [ev.clientX, ev.clientY] }
    // clique: seleciona e a câmera voa até a sala ou o ar
    const voar = (alvo, dist) => {
      const destino = alvo.clone().add(new THREE.Vector3(-dist * 0.35, dist * 0.85, dist * 0.75))
      const de = camera.position.clone(), deAlvo = controles.target.clone()
      let t0 = null
      const passo = (ts) => { t0 ??= ts; const k = Math.min(1, (ts - t0) / 900), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(de, destino, e); controles.target.lerpVectors(deAlvo, alvo, e); if (k < 1) requestAnimationFrame(passo) }
      requestAnimationFrame(passo)
    }
    const pu = (ev) => {
      if (baixo && Math.hypot(ev.clientX - baixo[0], ev.clientY - baixo[1]) < 5) {
        const u = acerto(ev); E.aoSelecionar?.(u?.tipo ? u : null)
        if (u?.tipo === 'sala') { const pz = pisos.find((x) => x.userData.id === u.id); if (pz) voar(pz.position.clone(), Math.max(pz.geometry.parameters.width, pz.geometry.parameters.height) * 0.9 + 2) }
        else if (u?.tipo === 'ar') { const un = unidades.find((x) => x.a?.id === u.id); if (un) voar(un.g.position.clone().setY(0.8), 4.5) }
      }
      baixo = null
    }
    const mv = (ev) => { const u = acerto(ev); renderer.domElement.style.cursor = u?.tipo === 'ar' || u?.tipo === 'elemento' ? 'pointer' : 'grab' }
    renderer.domElement.addEventListener('pointerdown', pd); renderer.domElement.addEventListener('pointerup', pu); renderer.domElement.addEventListener('pointermove', mv)
    return () => {
      renderer.domElement.removeEventListener('pointerdown', pd); renderer.domElement.removeEventListener('pointerup', pu); renderer.domElement.removeEventListener('pointermove', mv)
      texPonto.dispose(); fundoCeu.dispose()
    }
  }, [pronto, chave, paredesAltas, hora, hora === 'agora' ? relogio : 0]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { estado.current.filtro = filtro }, [filtro])
  useEffect(() => { const t = setInterval(() => setRelogio(Math.floor(horaBrasilia() * 4)), 60000); return () => clearInterval(t) }, [])

  useEffect(() => { estado.current.sel = selecionado; estado.current.aoSelecionar = aoSelecionar }, [selecionado, aoSelecionar])
  useEffect(() => { const c = estado.current.controles; if (c) { c.autoRotate = girando; c.autoRotateSpeed = 0.6 } }, [girando, pronto])

  const botao = 'flex h-8 items-center gap-1.5 px-2.5 text-xs hover:bg-black/5 dark:hover:bg-white/10'
  return (
    <div className={`relative w-full overflow-hidden ${compacto ? 'h-full' : 'h-[68vh] min-h-[440px]'}`}>
      <div ref={ref} className="h-full w-full touch-none [&>canvas]:h-full [&>canvas]:w-full" role="img" aria-label="Escritório em 3D com as salas, os ares e as pessoas; arraste para girar, role para aproximar" />
      <div ref={rotulosRef} className="pointer-events-none absolute inset-0" />
      <div className="absolute right-3 top-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur" role="group" aria-label="Iluminação">
        {[['agora', Clock, 'Agora'], ['dia', Sun, 'Dia'], ['noite', Moon, 'Noite']].map(([k, I, r], i) => (
          <button key={k} onClick={() => setHora(k)} className={`${botao} ${i ? 'border-l border-border' : ''} ${hora === k ? 'bg-black/5 font-medium dark:bg-white/10' : ''}`} title={k === 'agora' ? 'Luz da hora real (Brasília)' : `Simular ${r.toLowerCase()}`}><I className="h-3.5 w-3.5" />{r}</button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur">
        <button onClick={() => estado.current.enquadrar?.(false)} className={botao} title="Vista inicial"><RotateCcw className="h-3.5 w-3.5" />Inicial</button>
        <button onClick={() => estado.current.enquadrar?.(true)} className={`${botao} border-l border-border`} title="Ver de cima"><Eye className="h-3.5 w-3.5" />De cima</button>
        <button onClick={() => setParedesAltas((v) => !v)} className={`${botao} border-l border-border`} title="Altura das paredes">{paredesAltas ? <Box className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}{paredesAltas ? 'Paredes baixas' : 'Paredes altas'}</button>
        <button onClick={() => setGirando((g) => !g)} className={`${botao} border-l border-border`} title={girando ? 'Parar' : 'Girar'}>{girando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{girando ? 'Parar' : 'Girar'}</button>
      </div>
      <p className={`pointer-events-none absolute bottom-3 left-4 text-[11px] text-muted-foreground ${compacto ? 'hidden' : ''}`}>Arraste para girar · role para aproximar · clique numa sala ou num ar para ir até ele</p>
    </div>
  )
}
