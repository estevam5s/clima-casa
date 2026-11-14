import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// Globo de acessos em Three.js: continentes em pontos, marcadores por cidade (altura = volume),
// arcos animados de cada origem até o servidor e pulsos para os eventos recentes.
// pontos: [{lat, lon, cidade, pais, acesso, login, ataque, ips}], servidor: {lat, lon, nome}
const R = 1
const CORES = { ataque: 0xef4444, login: 0x22c55e, acesso: 0x2dd4bf }

function vetor(lat, lon, r = R) {
  const phi = (90 - lat) * Math.PI / 180
  const theta = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

function categoria(p) {
  return p.ataque > 0 ? 'ataque' : p.login > 0 ? 'login' : 'acesso'
}

// Pontos dos continentes: desenha o mapa (world-atlas) num canvas equirretangular e amostra os pixels de terra.
async function pontosTerra() {
  const [{ feature }, terra] = await Promise.all([import('topojson-client'), import('world-atlas/land-110m.json')])
  const geo = feature(terra.default || terra, (terra.default || terra).objects.land)
  const L = 720, A = 360
  const c = document.createElement('canvas'); c.width = L; c.height = A
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  const px = ([lon, lat]) => [(lon + 180) / 360 * L, (90 - lat) / 180 * A]
  for (const f of geo.features) {
    const polis = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const poli of polis) {
      g.beginPath()
      for (const anel of poli) anel.forEach((p, i) => { const [x, y] = px(p); i ? g.lineTo(x, y) : g.moveTo(x, y) })
      g.fill('evenodd')
    }
  }
  const dados = g.getImageData(0, 0, L, A).data
  const saida = []
  for (let lat = -84; lat <= 84; lat += 1.6) {
    const passo = 1.6 / Math.max(0.2, Math.cos(lat * Math.PI / 180))
    for (let lon = -180; lon < 180; lon += passo) {
      const x = Math.floor((lon + 180) / 360 * L), y = Math.floor((90 - lat) / 180 * A)
      if (dados[(y * L + x) * 4] > 128) saida.push(vetor(lat, lon, R * 1.002))
    }
  }
  return saida
}

function texturaPonto() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d')
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export default function Globo3D({ pontos = [], servidor, recentes = [], aoSelecionar, className = '' }) {
  const ref = useRef(null)
  const dicaRef = useRef(null)
  const dadosRef = useRef({ pontos, recentes })
  dadosRef.current = { pontos, recentes }
  const montarRef = useRef(null)
  const zoomRef = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const escuro = document.documentElement.classList.contains('dark')
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 0.6, 3.1)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.enableDamping = true; controles.dampingFactor = 0.06
    controles.enablePan = false; controles.enableZoom = false // a roda rola a página; zoom pelos botões
    controles.minDistance = 1.7; controles.maxDistance = 5
    controles.autoRotate = !calmo; controles.autoRotateSpeed = 0.45
    controles.rotateSpeed = 0.6

    const globo = new THREE.Group()
    cena.add(globo)
    // esfera base + atmosfera (fresnel)
    globo.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64),
      new THREE.MeshBasicMaterial({ color: escuro ? 0x0b1120 : 0xe8eef3, transparent: true, opacity: escuro ? 0.96 : 0.9 })))
    const atmosfera = new THREE.Mesh(new THREE.SphereGeometry(R * 1.18, 64, 64), new THREE.ShaderMaterial({
      uniforms: { cor: { value: new THREE.Color(escuro ? 0x2dd4bf : 0x0f766a) } },
      vertexShader: 'varying vec3 n; void main(){ n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 cor; varying vec3 n; void main(){ float i = pow(0.62 - dot(n, vec3(0,0,1.0)), 3.0); gl_FragColor = vec4(cor, 1.0) * i; }',
      blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true, depthWrite: false,
    }))
    cena.add(atmosfera)
    // grade de latitude/longitude bem leve
    const matGrade = new THREE.LineBasicMaterial({ color: escuro ? 0x1e293b : 0xcbd5e1, transparent: true, opacity: 0.5 })
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = []; for (let lon = -180; lon <= 180; lon += 5) pts.push(vetor(lat, lon, R * 1.001))
      globo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matGrade))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts = []; for (let lat = -90; lat <= 90; lat += 5) pts.push(vetor(lat, lon, R * 1.001))
      globo.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matGrade))
    }
    const tex = texturaPonto()
    pontosTerra().then((vs) => {
      const geo = new THREE.BufferGeometry().setFromPoints(vs)
      globo.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.024, map: tex, transparent: true, depthWrite: false,
        color: escuro ? 0x5eead4 : 0x0f766a, opacity: escuro ? 0.9 : 0.85 })))
    }).catch(() => {})

    // servidor
    const posServ = vetor(servidor?.lat ?? 41.5, servidor?.lon ?? -81.7, R * 1.01)
    const serv = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), new THREE.MeshBasicMaterial({ color: escuro ? 0xffffff : 0x0f172a }))
    serv.position.copy(posServ); globo.add(serv)
    const anelServ = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.036, 48), new THREE.MeshBasicMaterial({ color: escuro ? 0xffffff : 0x0f172a, transparent: true, side: THREE.DoubleSide }))
    anelServ.position.copy(posServ); anelServ.lookAt(posServ.clone().multiplyScalar(2)); globo.add(anelServ)

    // camada dinâmica (marcadores, arcos e cometas) recriada quando os dados mudam
    let dinamica = new THREE.Group(); globo.add(dinamica)
    let marcadores = [], cometas = [], aneis = []
    const montar = () => {
      globo.remove(dinamica)
      dinamica.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      dinamica = new THREE.Group(); globo.add(dinamica)
      marcadores = []; cometas = []; aneis = []
      const { pontos: ps } = dadosRef.current
      const max = Math.max(1, ...ps.map((p) => p.acesso + p.login + p.ataque))
      ps.forEach((p, idx) => {
        const cat = categoria(p)
        const cor = CORES[cat]
        const total = p.acesso + p.login + p.ataque
        const base = vetor(p.lat, p.lon, R)
        const altura = 0.04 + 0.28 * Math.sqrt(total / max)
        // coluna de luz
        const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.009, altura, 8), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85 }))
        coluna.position.copy(base.clone().multiplyScalar(1 + altura / 2))
        coluna.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), base.clone().normalize())
        coluna.userData = { ponto: p }
        dinamica.add(coluna); marcadores.push(coluna)
        // alvo clicável maior (invisível)
        const alvo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), new THREE.MeshBasicMaterial({ visible: false }))
        alvo.position.copy(base); alvo.userData = { ponto: p }; dinamica.add(alvo); marcadores.push(alvo)
        // anel pulsando na base
        const anel = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.018, 32), new THREE.MeshBasicMaterial({ color: cor, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
        anel.position.copy(base.clone().multiplyScalar(1.003)); anel.lookAt(base.clone().multiplyScalar(2))
        anel.userData.fase = idx * 0.37
        dinamica.add(anel); aneis.push(anel)
        // arco até o servidor
        const fim = posServ.clone()
        const dist = base.distanceTo(fim)
        if (dist < 0.02) return
        const meio = base.clone().add(fim).multiplyScalar(0.5).normalize().multiplyScalar(R + dist * 0.45)
        const curva = new THREE.QuadraticBezierCurve3(base.clone().multiplyScalar(1.002), meio, fim)
        dinamica.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(64)),
          new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: cat === 'ataque' ? 0.55 : 0.3, depthWrite: false })))
        // cometa com rastro percorrendo o arco
        const rastro = 14
        const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: rastro }, () => new THREE.Vector3()))
        const tam = new Float32Array(rastro).map((_, i) => 1 - i / rastro)
        geo.setAttribute('alpha', new THREE.BufferAttribute(tam, 1))
        const pontosCometa = new THREE.Points(geo, new THREE.PointsMaterial({ size: cat === 'ataque' ? 0.05 : 0.038, map: tex, color: cor, transparent: true,
          depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 }))
        dinamica.add(pontosCometa)
        cometas.push({ curva, geo, t: Math.random(), vel: (cat === 'ataque' ? 0.35 : 0.22) * (0.8 + Math.random() * 0.4) })
      })
    }
    montar()
    montarRef.current = montar
    zoomRef.current = (fator) => {
      const d = Math.min(controles.maxDistance, Math.max(controles.minDistance, camera.position.length() * fator))
      camera.position.setLength(d); controles.update()
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
      const hit = ray.intersectObjects(marcadores)[0]
      sobre = hit?.object.userData.ponto || null
      el.style.cursor = sobre ? 'pointer' : 'grab'
      const d = dicaRef.current
      if (!d) return
      if (sobre) {
        d.style.display = 'block'
        d.style.left = `${e.clientX - b.left + 14}px`; d.style.top = `${e.clientY - b.top + 14}px`
        d.innerHTML = ''
        const linhas = [[`${sobre.cidade || 'Local desconhecido'}${sobre.pais ? `, ${sobre.pais}` : ''}`, 'font-weight:600'],
          [`${sobre.ips} IP(s) · ${sobre.acesso} acesso(s) · ${sobre.login} login(s)`, ''], [`${sobre.ataque} ataque(s) barrado(s)`, sobre.ataque ? 'color:#ef4444' : '']]
        linhas.forEach(([t, st]) => { const p = document.createElement('p'); p.textContent = t; p.style.cssText = st; d.appendChild(p) })
      } else d.style.display = 'none'
    }
    const clicar = () => { if (sobre) aoSelecionar?.(sobre) }
    const sair = () => { if (dicaRef.current) dicaRef.current.style.display = 'none' }
    el.addEventListener('pointermove', mover); el.addEventListener('click', clicar); el.addEventListener('pointerleave', sair)
    controles.addEventListener('start', () => { controles.autoRotate = false })
    controles.addEventListener('end', () => { setTimeout(() => { controles.autoRotate = !calmo }, 4000) })

    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar); ro.observe(el)
    // começa olhando para o Brasil / Américas
    globo.rotation.y = -0.9
    const relogio = new THREE.Clock()
    let quadro
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (document.hidden) return
      const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime
      cometas.forEach((c) => {
        c.t = (c.t + dt * c.vel) % 1
        const pos = c.geo.attributes.position
        for (let i = 0; i < pos.count; i++) {
          const p = c.curva.getPoint(Math.max(0, c.t - i * 0.012))
          pos.setXYZ(i, p.x, p.y, p.z)
        }
        pos.needsUpdate = true
      })
      aneis.forEach((a) => {
        const f = ((t * 0.8 + a.userData.fase) % 1)
        a.scale.setScalar(1 + f * 3.5); a.material.opacity = 0.9 * (1 - f)
      })
      const fs = (t * 0.6) % 1
      anelServ.scale.setScalar(1 + fs * 2.5); anelServ.material.opacity = 1 - fs
      controles.update()
      renderer.render(cena, camera)
    }
    laco()
    return () => {
      cancelAnimationFrame(quadro); ro.disconnect()
      el.removeEventListener('pointermove', mover); el.removeEventListener('click', clicar); el.removeEventListener('pointerleave', sair)
      controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      tex.dispose(); renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // dados novos: recria só a camada dinâmica
  useEffect(() => { montarRef.current?.() }, [pontos])

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div ref={ref} className="h-full w-full touch-none [&>canvas]:h-full [&>canvas]:w-full" role="img" aria-label="Globo 3D com a origem dos acessos e ataques; arraste para girar e role para aproximar" />
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur">
        <button onClick={() => zoomRef.current?.(0.82)} className="px-2.5 py-1.5 text-sm hover:bg-muted" aria-label="Aproximar">+</button>
        <button onClick={() => zoomRef.current?.(1.22)} className="border-t border-border px-2.5 py-1.5 text-sm hover:bg-muted" aria-label="Afastar">−</button>
      </div>
      <div ref={dicaRef} className="pointer-events-none absolute z-10 hidden rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl" /> {/* marca: dica flutua */}
    </div>
  )
}
