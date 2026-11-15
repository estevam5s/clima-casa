import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Mapa de uso em 3D: uma barra por dia da semana × hora, altura = comandos. As barras sobem ao abrir,
// a cena gira devagar (para ao arrastar) e passar o mouse mostra o valor. Respeita prefers-reduced-motion.
function corPrimaria() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().split(/\s+/)
  const [h, s, l] = [parseFloat(v[0]) || 173, parseFloat(v[1]) || 79, parseFloat(v[2]) || 26]
  return new THREE.Color().setHSL(h / 360, s / 100, l / 100)
}

export default function Barras3D({ mapa }) {
  const ref = useRef(null)
  const [dica, setDica] = useState(null)
  const chave = JSON.stringify(mapa)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const escuro = document.documentElement.classList.contains('dark')
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200)
    camera.position.set(10, 11.5, 15.5)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.enablePan = false; controles.minDistance = 10; controles.maxDistance = 45; controles.maxPolarAngle = Math.PI / 2.15
    controles.autoRotate = !calmo; controles.autoRotateSpeed = 0.6
    controles.target.set(0, 1, 0)
    cena.add(new THREE.HemisphereLight(0xffffff, escuro ? 0x1e293b : 0xcbd5e1, escuro ? 1.1 : 1.5))
    const sol = new THREE.DirectionalLight(0xffffff, escuro ? 1.4 : 1.8)
    sol.position.set(10, 22, 12); sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024)
    Object.assign(sol.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18 })
    cena.add(sol)
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), new THREE.MeshStandardMaterial({ color: escuro ? 0x111827 : 0xf1f5f9, roughness: 0.95 }))
    piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; cena.add(piso)
    const grade = new THREE.GridHelper(30, 30, escuro ? 0x334155 : 0xcbd5e1, escuro ? 0x1f2937 : 0xe2e8f0)
    grade.scale.set(1, 1, 0.4); grade.position.y = 0.01; cena.add(grade)

    const base = corPrimaria()
    const max = Math.max(1, ...mapa.flatMap((l) => l.horas))
    const barras = []
    const geo = new THREE.BoxGeometry(0.82, 1, 0.82)
    geo.translate(0, 0.5, 0)
    mapa.forEach((linha, d) => linha.horas.forEach((v, h) => {
      const f = v / max
      const cor = v ? base.clone().lerp(new THREE.Color(escuro ? 0x7dd3fc : 0x38bdf8), 1 - f) : new THREE.Color(escuro ? 0x1f2937 : 0xe2e8f0)
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cor, roughness: 0.45, metalness: 0.08, emissive: cor, emissiveIntensity: v ? 0.06 + f * 0.18 : 0 }))
      m.position.set((h - 11.5) * 1.05, 0, (d - 3) * 1.25)
      m.castShadow = true; m.receiveShadow = true
      m.userData = { alvo: v ? 0.15 + f * 6 : 0.06, v, rotulo: `${linha.dia} ${String(h).padStart(2, '0')}h`, atraso: (h + d * 3) * 18 }
      m.scale.y = calmo ? m.userData.alvo : 0.001
      cena.add(m); barras.push(m)
    }))
    // rótulos dos dias e de algumas horas
    const texto = (t, x, z, tam = 0.55) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64
      const g = c.getContext('2d'); g.fillStyle = escuro ? '#94a3b8' : '#64748b'; g.font = '600 34px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 64, 32)
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }))
      s.scale.set(tam * 2, tam, 1); s.position.set(x, 0.3, z); cena.add(s)
    }
    mapa.forEach((l, d) => texto(l.dia, -13.4, (d - 3) * 1.25))
    for (let h = 0; h < 24; h += 3) texto(`${h}h`, (h - 11.5) * 1.05, 5.1)

    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2()
    let marcada = null
    const mover = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(mouse, camera)
      const alvo = ray.intersectObjects(barras)[0]?.object
      if (marcada && marcada !== alvo) marcada.material.emissiveIntensity = marcada.userData.brilho
      if (alvo) {
        if (marcada !== alvo) { alvo.userData.brilho = alvo.material.emissiveIntensity; alvo.material.emissiveIntensity = 0.55 }
        setDica({ x: e.clientX - r.left, y: e.clientY - r.top, texto: `${alvo.userData.rotulo}: ${alvo.userData.v} comando(s)` })
      } else setDica(null)
      marcada = alvo || null
    }
    const sair = () => { setDica(null); if (marcada) marcada.material.emissiveIntensity = marcada.userData.brilho; marcada = null }
    renderer.domElement.addEventListener('pointermove', mover)
    renderer.domElement.addEventListener('pointerleave', sair)

    const ajustar = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix() }
    const obs = new ResizeObserver(ajustar); obs.observe(el); ajustar()
    let quadro, t0 = null, visivel = true
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting }); io.observe(el)
    const laco = (ts) => {
      quadro = requestAnimationFrame(laco)
      if (!visivel) return
      t0 ??= ts
      if (!calmo) for (const b of barras) {
        const k = Math.min(1, Math.max(0, (ts - t0 - b.userData.atraso) / 700))
        b.scale.y = Math.max(0.001, b.userData.alvo * (1 - Math.pow(1 - k, 3)))
      }
      controles.update(); renderer.render(cena, camera)
    }
    quadro = requestAnimationFrame(laco)
    return () => {
      cancelAnimationFrame(quadro); obs.disconnect(); io.disconnect(); controles.dispose()
      renderer.domElement.removeEventListener('pointermove', mover); renderer.domElement.removeEventListener('pointerleave', sair)
      cena.traverse((o) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose() } })
      renderer.dispose(); el.removeChild(renderer.domElement)
    }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="relative h-full w-full cursor-grab active:cursor-grabbing">
      {dica && <span className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-card px-2 py-1 text-xs shadow-lg" style={{ left: dica.x, top: dica.y - 8 }}>{dica.texto}</span>} {/* marca: dica flutua */}
    </div>
  )
}
