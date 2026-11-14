import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const COR_MODO = { frio: 0x4ea8ff, quente: 0xff8a3d, seco: 0x9ad1c8, ventilar: 0xd4d4d8, auto: 0x5eead4 }
const VEL_VENT = { auto: 1, baixa: 0.6, media: 1, alta: 1.6 }
const N = 900

function corTema() {
  const escuro = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { corpo: escuro ? 0xe7e7ea : 0xfafafa, aba: escuro ? 0xcfcfd4 : 0xe4e4e7, parede: escuro ? 0x151517 : 0xf1f1f3, escuro }
}

// Ar-condicionado split em 3D com fluxo de ar. `estado` = { ligado, modo, ventilador, temperatura }.
export default function Cena3D({ estado, className = '' }) {
  const ref = useRef(null)
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tema = corTema()

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)

    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0.2, 7.2)

    cena.add(new THREE.HemisphereLight(0xffffff, tema.escuro ? 0x202024 : 0xdadade, tema.escuro ? 1.1 : 1.6))
    const sol = new THREE.DirectionalLight(0xffffff, tema.escuro ? 1.4 : 1.8)
    sol.position.set(3, 4, 5)
    cena.add(sol)

    // unidade interna
    const unidade = new THREE.Group()
    const matCorpo = new THREE.MeshStandardMaterial({ color: tema.corpo, roughness: 0.42, metalness: 0.05 })
    const corpo = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.15, 0.9, 6, 0.22), matCorpo)
    unidade.add(corpo)
    const frente = new THREE.Mesh(new RoundedBoxGeometry(4.0, 0.62, 0.06, 4, 0.03),
      new THREE.MeshStandardMaterial({ color: tema.corpo, roughness: 0.3 }))
    frente.position.set(0, 0.16, 0.46)
    unidade.add(frente)
    const aba = new THREE.Mesh(new RoundedBoxGeometry(3.7, 0.16, 0.05, 2, 0.02),
      new THREE.MeshStandardMaterial({ color: tema.aba, roughness: 0.5 }))
    aba.position.set(0, -0.42, 0.44)
    unidade.add(aba)
    const grelha = new THREE.Group()
    for (let i = 0; i < 18; i++) {
      const fenda = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x8e8e96 }))
      fenda.position.set(-1.7 + i * 0.2, -0.42, 0.4)
      grelha.add(fenda)
    }
    unidade.add(grelha)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshBasicMaterial({ color: 0x3f3f46 }))
    led.position.set(1.72, 0.03, 0.5)
    unidade.add(led)
    unidade.position.y = 1.0
    cena.add(unidade)

    // parede e sombra suave
    const parede = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: tema.parede, roughness: 1 }))
    parede.position.z = -0.5
    cena.add(parede)

    // partículas do fluxo de ar
    const pos = new Float32Array(N * 3)
    const vida = new Float32Array(N)
    const vel = new Float32Array(N * 3)
    const nascer = (i, espalhar) => {
      pos[i * 3] = (Math.random() - 0.5) * 3.6
      pos[i * 3 + 1] = 0.55
      pos[i * 3 + 2] = 0.5
      vel[i * 3] = (Math.random() - 0.5) * 0.15
      vel[i * 3 + 1] = -(0.35 + Math.random() * 0.35)
      vel[i * 3 + 2] = 0.55 + Math.random() * 0.5
      vida[i] = espalhar ? Math.random() : 0
    }
    for (let i = 0; i < N; i++) nascer(i, true)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const matP = new THREE.PointsMaterial({ size: 0.055, color: COR_MODO.frio, transparent: true, opacity: 0, depthWrite: false,
      blending: tema.escuro ? THREE.AdditiveBlending : THREE.NormalBlending })
    const pontos = new THREE.Points(geo, matP)
    cena.add(pontos)

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
    let abertura = 0, intensidade = 0, quadro
    const cor = new THREE.Color()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (!visivel) return
      const dt = Math.min(relogio.getDelta(), 0.05)
      const t = relogio.elapsedTime
      const e = estadoRef.current || {}
      const ligado = !!e.ligado
      abertura += ((ligado ? 1 : 0) - abertura) * Math.min(1, dt * 3)
      intensidade += ((ligado ? 1 : 0) - intensidade) * Math.min(1, dt * 2)
      aba.rotation.x = -abertura * 0.7
      aba.position.z = 0.44 + abertura * 0.05
      led.material.color.setHex(ligado ? 0x22c55e : 0x3f3f46)
      cor.setHex(COR_MODO[e.modo] || COR_MODO.frio)
      matP.color.lerp(cor, Math.min(1, dt * 4))
      matP.opacity = 0.85 * intensidade
      const v = (VEL_VENT[e.ventilador] || 1) * (reduzir ? 0 : 1)
      for (let i = 0; i < N; i++) {
        vida[i] += dt * 0.35 * v
        if (vida[i] >= 1) nascer(i, false)
        const k = i * 3
        pos[k] += vel[k] * dt * v * 2.2
        pos[k + 1] += vel[k + 1] * dt * v * 2.2 - 0.02 * dt
        pos[k + 2] += vel[k + 2] * dt * v * 2.2
        pos[k] += Math.sin(t * 1.3 + i) * 0.002 * v
      }
      geo.attributes.position.needsUpdate = true
      if (!reduzir) {
        unidade.rotation.y = Math.sin(t * 0.35) * 0.12
        unidade.position.y = 1.0 + Math.sin(t * 0.8) * 0.03
        pontos.rotation.y = unidade.rotation.y
        camera.position.x = Math.sin(t * 0.2) * 0.4
        camera.lookAt(0, 0.4, 0)
      }
      renderer.render(cena, camera)
    }
    camera.lookAt(0, 0.4, 0)
    laco()

    return () => {
      cancelAnimationFrame(quadro)
      ro.disconnect()
      io.disconnect()
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={ref} className={`h-full w-full [&>canvas]:h-full [&>canvas]:w-full ${className}`} role="img" aria-label="Ar-condicionado em 3D com o fluxo de ar" />
}
