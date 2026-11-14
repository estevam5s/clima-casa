import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const COR_MODO = { frio: 0x4ea8ff, quente: 0xff8a3d, seco: 0x9ad1c8, ventilar: 0xd4d4d8, auto: 0x5eead4 }
const NOME_MODO = { frio: 'FRIO', quente: 'QUENTE', seco: 'SECO', ventilar: 'VENT', auto: 'AUTO' }
const VEL_VENT = { auto: 1, baixa: 0.6, media: 1, alta: 1.6 }
const N = 1100

function tema() {
  const escuro = document.documentElement.classList.contains('dark')
  return { corpo: escuro ? 0xe9e9ec : 0xfbfbfb, aba: escuro ? 0xd2d2d7 : 0xe6e6ea, parede: escuro ? 0x141416 : 0xf0f0f2, escuro }
}

// Painel digital do aparelho (textura desenhada em canvas): temperatura e modo.
function criarPainel() {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 96
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  const desenhar = (estado, brilho) => {
    const g = canvas.getContext('2d')
    g.clearRect(0, 0, 256, 96)
    g.fillStyle = '#0b0d0f'; g.fillRect(0, 0, 256, 96)
    if (brilho > 0.02) {
      const cor = `#${(COR_MODO[estado.modo] ?? 0x4ea8ff).toString(16).padStart(6, '0')}`
      g.globalAlpha = brilho
      g.fillStyle = cor; g.shadowColor = cor; g.shadowBlur = 14
      g.font = '600 62px ui-monospace, Menlo, monospace'; g.textBaseline = 'middle'
      g.fillText(`${estado.temperatura}°`, 14, 52)
      g.shadowBlur = 6; g.font = '600 20px -apple-system, sans-serif'
      g.fillText(NOME_MODO[estado.modo] ?? '', 160, 38)
      g.fillText(`V${{ baixa: 1, media: 2, alta: 3 }[estado.ventilador] ?? 'A'}`, 160, 66)
      g.globalAlpha = 1
    }
    textura.needsUpdate = true
  }
  return { textura, desenhar }
}

// Ar-condicionado split em 3D, animado o tempo todo. `estado` = { ligado, modo, ventilador, temperatura }.
export default function Cena3D({ estado, className = '' }) {
  const ref = useRef(null)
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const amp = calmo ? 0.4 : 1
    const t = tema()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0.3, 7.2)

    cena.add(new THREE.HemisphereLight(0xffffff, t.escuro ? 0x1c1c20 : 0xd8d8de, t.escuro ? 1.0 : 1.5))
    const sol = new THREE.DirectionalLight(0xffffff, t.escuro ? 1.3 : 1.7)
    sol.position.set(3, 4, 5)
    cena.add(sol)
    const brilho = new THREE.PointLight(0xffffff, 0, 6) // reflexo que percorre a carcaça
    cena.add(brilho)
    const luzModo = new THREE.PointLight(0x4ea8ff, 0, 5) // luz da cor do modo saindo da grelha
    cena.add(luzModo)

    // ---- unidade interna ----
    const unidade = new THREE.Group()
    const matCorpo = new THREE.MeshStandardMaterial({ color: t.corpo, roughness: 0.38, metalness: 0.06 })
    unidade.add(new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.15, 0.9, 6, 0.22), matCorpo))
    const frente = new THREE.Mesh(new RoundedBoxGeometry(4.0, 0.62, 0.06, 4, 0.03), new THREE.MeshStandardMaterial({ color: t.corpo, roughness: 0.28 }))
    frente.position.set(0, 0.16, 0.46)
    unidade.add(frente)
    const painel = criarPainel()
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.23), new THREE.MeshBasicMaterial({ map: painel.textura, transparent: true }))
    tela.position.set(1.42, 0.17, 0.495)
    unidade.add(tela)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), new THREE.MeshBasicMaterial({ color: 0x3f3f46 }))
    led.position.set(1.84, 0.02, 0.5)
    unidade.add(led)
    // aleta principal (abre ao ligar e faz o swing)
    const pivoAba = new THREE.Group()
    pivoAba.position.set(0, -0.36, 0.44)
    const aba = new THREE.Mesh(new RoundedBoxGeometry(3.7, 0.18, 0.05, 2, 0.02), new THREE.MeshStandardMaterial({ color: t.aba, roughness: 0.45 }))
    aba.position.set(0, -0.08, 0)
    pivoAba.add(aba)
    unidade.add(pivoAba)
    // palhetas verticais da grelha (abanam quando ligado)
    const palhetas = []
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.13, 0.08), new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.6 }))
      p.position.set(-1.6 + i * 0.246, -0.42, 0.36)
      unidade.add(p)
      palhetas.push(p)
    }
    unidade.position.y = 1.0
    cena.add(unidade)

    const parede = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: t.parede, roughness: 1 }))
    parede.position.z = -0.5
    cena.add(parede)

    // ---- fluxo de ar ----
    const pos = new Float32Array(N * 3)
    const vida = new Float32Array(N)
    const vel = new Float32Array(N * 3)
    const nascer = (i, espalhar) => {
      pos[i * 3] = (Math.random() - 0.5) * 3.6
      pos[i * 3 + 1] = 0.55
      pos[i * 3 + 2] = 0.5
      vel[i * 3] = (Math.random() - 0.5) * 0.18
      vel[i * 3 + 1] = -(0.35 + Math.random() * 0.4)
      vel[i * 3 + 2] = 0.55 + Math.random() * 0.55
      vida[i] = espalhar ? Math.random() : 0
    }
    for (let i = 0; i < N; i++) nascer(i, true)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const matP = new THREE.PointsMaterial({ size: 0.055, color: COR_MODO.frio, transparent: true, opacity: 0, depthWrite: false,
      blending: t.escuro ? THREE.AdditiveBlending : THREE.NormalBlending })
    const pontos = new THREE.Points(geo, matP)
    cena.add(pontos)

    // ---- interação: o aparelho acompanha o ponteiro e pode ser arrastado ----
    const ponteiro = { x: 0, y: 0 }
    let arrasto = null, giroManual = 0, giroAlvo = 0
    const mover = (e) => {
      const b = el.getBoundingClientRect()
      ponteiro.x = ((e.clientX - b.left) / b.width) * 2 - 1
      ponteiro.y = ((e.clientY - b.top) / b.height) * 2 - 1
      if (arrasto !== null) giroAlvo = arrasto.giro + (e.clientX - arrasto.x) / 160
    }
    const baixar = (e) => { arrasto = { x: e.clientX, giro: giroAlvo }; el.setPointerCapture?.(e.pointerId) }
    const soltar = () => { arrasto = null }
    const sair = () => { ponteiro.x = 0; ponteiro.y = 0 }
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerdown', baixar)
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointerleave', sair)

    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.position.z = camera.aspect < 1.2 ? 10 : 7.2
      camera.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    let visivel = true
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting })
    io.observe(el)

    const relogio = new THREE.Clock()
    let abertura = 0, intensidade = 0, pulso = 0, ultimoLigado = null, quadro
    let ultimoPainel = ''
    const cor = new THREE.Color()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (!visivel || document.hidden) return
      const dt = Math.min(relogio.getDelta(), 0.05)
      const tempo = relogio.elapsedTime
      const e = estadoRef.current || {}
      const ligado = !!e.ligado

      if (ultimoLigado !== null && ultimoLigado !== ligado) pulso = 1 // ligou ou desligou: pequeno "pulo"
      ultimoLigado = ligado
      pulso = Math.max(0, pulso - dt * 2.2)

      abertura += ((ligado ? 1 : 0) - abertura) * Math.min(1, dt * 2.6)
      intensidade += ((ligado ? 1 : 0) - intensidade) * Math.min(1, dt * 2)
      const swing = ligado ? Math.sin(tempo * 0.9) * 0.18 * amp : 0
      pivoAba.rotation.x = -abertura * 0.75 + swing * abertura
      palhetas.forEach((p, i) => { p.rotation.y = ligado ? Math.sin(tempo * 0.7 + i * 0.15) * 0.45 * amp * abertura : 0 })

      // LED: verde fixo ligado; vermelho "respirando" em espera
      if (ligado) led.material.color.setHex(0x22c55e)
      else led.material.color.setRGB(0.35 + 0.5 * (0.5 + 0.5 * Math.sin(tempo * 2.2)), 0.08, 0.08)

      // painel digital (só redesenha quando muda)
      const chave = `${ligado}|${e.temperatura}|${e.modo}|${e.ventilador}|${Math.round(intensidade * 10)}`
      if (chave !== ultimoPainel) { painel.desenhar(e, intensidade); ultimoPainel = chave }

      cor.setHex(COR_MODO[e.modo] || COR_MODO.frio)
      matP.color.lerp(cor, Math.min(1, dt * 4))
      matP.opacity = 0.85 * intensidade
      luzModo.color.lerp(cor, Math.min(1, dt * 4))
      luzModo.intensity = intensidade * 2.2
      luzModo.position.set(0, 0.35, 1.2)

      const v = (VEL_VENT[e.ventilador] || 1) * (calmo ? 0.5 : 1)
      for (let i = 0; i < N; i++) {
        vida[i] += dt * 0.35 * v
        if (vida[i] >= 1) nascer(i, false)
        const k = i * 3
        pos[k] += vel[k] * dt * v * 2.2 + Math.sin(tempo * 1.3 + i) * 0.002 * v
        pos[k + 1] += vel[k + 1] * dt * v * 2.2 - 0.02 * dt
        pos[k + 2] += vel[k + 2] * dt * v * 2.2
      }
      geo.attributes.position.needsUpdate = true

      // movimento contínuo: flutua, gira, segue o ponteiro, reflexo percorrendo a carcaça
      giroManual += (giroAlvo - giroManual) * Math.min(1, dt * 6)
      const balanco = Math.sin(tempo * 0.45) * 0.28 * amp
      unidade.rotation.y += ((balanco + ponteiro.x * 0.35 + giroManual) - unidade.rotation.y) * Math.min(1, dt * 3)
      unidade.rotation.x += ((ponteiro.y * 0.12) - unidade.rotation.x) * Math.min(1, dt * 3)
      unidade.position.y = 1.0 + Math.sin(tempo * 0.9) * 0.06 * amp + pulso * 0.08
      const escala = 1 + Math.sin(tempo * 1.1) * 0.006 * amp + pulso * 0.03
      unidade.scale.setScalar(escala)
      pontos.rotation.y = unidade.rotation.y
      brilho.position.set(Math.sin(tempo * 0.6) * 3, 1.6, 1.6)
      brilho.intensity = (ligado ? 0.6 : 1.4) * (0.6 + 0.4 * Math.sin(tempo * 0.6 + 1.2))
      camera.position.x = Math.sin(tempo * 0.25) * 0.5 * amp
      camera.lookAt(0, 0.45, 0)
      renderer.render(cena, camera)
    }
    camera.lookAt(0, 0.45, 0)
    laco()

    return () => {
      cancelAnimationFrame(quadro)
      ro.disconnect(); io.disconnect()
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerdown', baixar)
      el.removeEventListener('pointerup', soltar)
      el.removeEventListener('pointerleave', sair)
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.() })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={ref} className={`h-full w-full cursor-grab touch-pan-y active:cursor-grabbing [&>canvas]:h-full [&>canvas]:w-full ${className}`} role="img" aria-label="Ar-condicionado em 3D, animado; arraste para girar" />
}
