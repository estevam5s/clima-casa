import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { X } from 'lucide-react'
import DADOS from './ilhaDados.json'

// Ilha de Santa Catarina (Florianópolis) vista de cima, em 3D.
// O contorno da ilha e das lagoas é real (OpenStreetMap, ODbL). O relevo é ilustrativo: morros gerados por ruído dentro
// do contorno, sem dados de altitude. O continente é aproximado. 1 unidade = 100 m; relevo exagerado ~3x para aparecer.
const ESC = 1 / 100

function dentro(p, poli) {   // ponto no polígono (ray casting)
  let c = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, zi] = poli[i], [xj, zj] = poli[j]
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

// ruído suave determinístico (soma de senos em várias escalas): morros sem depender de biblioteca
const ruido = (x, z) => {
  let v = 0, a = 1, f = 1 / 26
  for (let o = 0; o < 4; o++) {
    v += a * (Math.sin(x * f + o * 1.7) * Math.cos(z * f * 0.8 + o * 2.3) + Math.sin((x + z) * f * 0.6 + o)) * 0.5
    a *= 0.5; f *= 2.1
  }
  return v
}

const ROTULOS = [
  ['centro', 'Centro · escritório', true], ['ponte', 'Ponte Hercílio Luz'], ['aeroporto', 'Aeroporto'],
  ['lagoa', 'Lagoa da Conceição'], ['jurere', 'Jurerê'], ['canasvieiras', 'Canasvieiras'], ['campeche', 'Campeche'],
  ['ufsc', 'UFSC'], ['pantano', 'Pântano do Sul'],
]

function rotulo(texto, destaque) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96
  const g = cv.getContext('2d')
  g.font = `600 ${destaque ? 40 : 34}px system-ui, sans-serif`
  const w = Math.min(500, g.measureText(texto).width + 36)
  g.fillStyle = destaque ? 'rgba(15,118,106,0.95)' : 'rgba(15,23,42,0.78)'
  g.beginPath(); g.roundRect((512 - w) / 2, 14, w, 64, 12); g.fill()
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(texto, 256, 47)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }))
  s.scale.set(48, 9, 1); s.renderOrder = 10
  return s
}

export default function VistaIlha3D({ aoFechar }) {
  const ref = useRef(null)
  const [carregado, setCarregado] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    cena.background = new THREE.Color(0x9cc8e8)
    cena.fog = new THREE.Fog(0x9cc8e8, 500, 1200)
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000)
    const ilha = DADOS.ilha.map(([x, z]) => [x * ESC, z * ESC])
    const lagoas = [DADOS.lagoa_conceicao, DADOS.lagoa_peri].map((l) => l.map(([x, z]) => [x * ESC, z * ESC]))
    const P = Object.fromEntries(Object.entries(DADOS.pontos).map(([k, [x, z]]) => [k, [x * ESC, z * ESC]]))
    const xs = ilha.map((p) => p[0]), zs = ilha.map((p) => p[1])
    const minX = Math.min(...xs) - 60, maxX = Math.max(...xs) + 20, minZ = Math.min(...zs) - 25, maxZ = Math.max(...zs) + 25
    const W = maxX - minX, D = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2
    // continente: aproximação da costa (mais perto da ilha na altura das pontes, onde a baía estreita)
    const costaCont = (z) => P.ponte[0] - 4.5 - 22 * Math.min(1, Math.abs(z - P.ponte[1]) / 160) ** 1.4 - (Math.abs(z - P.ponte[1]) > 12 ? Math.sin(z / 9) * 2.5 + Math.sin(z / 23 + 1) * 6 + Math.sin(z / 4.3) * 1.1 + 6 : 0)   // recortes de enseadas

    // terreno: grade com altura por ponto (dentro da ilha/continente = terra; lagoas e mar = abaixo da água)
    const NX = 220, NZ = Math.round(NX * D / W)
    const geo = new THREE.PlaneGeometry(W, D, NX, NZ); geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz)
    const pos = geo.attributes.position, n = pos.count
    const terra = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const naIlha = dentro([x, z], ilha) && !lagoas.some((l) => dentro([x, z], l))
      terra[i] = naIlha || x < costaCont(z) ? 1 : 0
    }
    // suaviza a máscara (praias em rampa) e calcula a altura
    const G = (i, j) => terra[j * (NX + 1) + i]
    const suave = new Float32Array(n)
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      let s = 0, c = 0
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a <= NX && b <= NZ) { s += G(a, b); c++ } }
      suave[j * (NX + 1) + i] = s / c
    }
    const cores = new Float32Array(n * 3), cor = new THREE.Color()
    const AREIA = new THREE.Color(0xe8dcb5), VERDE = new THREE.Color(0x4f8a4a), VERDE2 = new THREE.Color(0x2f5e34), PEDRA = new THREE.Color(0x7c7a6a), FUNDO = new THREE.Color(0x2f7fa8)
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), z = pos.getZ(i), m = suave[i]
      const morro = Math.max(0, ruido(x, z) + 0.35) * 3.2 * Math.max(0, (m - 0.55) / 0.45) ** 1.3
      const h = m < 0.5 ? -1.2 + m * 2 : (m - 0.5) * 1.6 + morro
      pos.setY(i, h)
      if (m < 0.5) cor.copy(FUNDO)
      else if (m < 0.68) cor.copy(AREIA)
      else cor.copy(VERDE).lerp(VERDE2, Math.min(1, morro / 3)).lerp(PEDRA, Math.max(0, morro - 3.6) / 2)
      cores.set([cor.r, cor.g, cor.b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3))
    geo.computeVertexNormals()
    const solo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }))
    cena.add(solo)
    // mar (plano transparente no nível 0, com brilho que se mexe devagar)
    const mar = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, D * 2), new THREE.MeshStandardMaterial({ color: 0x1f6f99, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.86 }))
    mar.rotation.x = -Math.PI / 2; mar.position.set(cx, 0.02, cz); cena.add(mar)
    // pontes (estilizadas): Hercílio Luz (pênsil) e as duas vizinhas, da ilha ao continente
    const matPonte = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.5, metalness: 0.4 })
    const [pX, pZ] = P.ponte, vao = 9
    for (const [dz, pensil] of [[0, true], [3.2, false], [5.4, false]]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(vao, 0.25, 0.7), matPonte); tab.position.set(pX - vao / 2 + 1.5, 0.9, pZ + dz); cena.add(tab)
      if (pensil) {
        for (const tx of [-2.2, 2.2]) { const torre = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.2, 0.9), matPonte); torre.position.set(pX - vao / 2 + 1.5 + tx, 2.1, pZ); cena.add(torre) }
        const curva = new THREE.CatmullRomCurve3([[-4.5, 1], [-2.2, 4.1], [0, 1.2], [2.2, 4.1], [4.5, 1]].map(([x, y]) => new THREE.Vector3(pX - vao / 2 + 1.5 + x, y, pZ)))
        const cabo = new THREE.Mesh(new THREE.TubeGeometry(curva, 40, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 }))
        cena.add(cabo)
      }
    }
    // marcador do escritório (centro) que pulsa
    const pino = new THREE.Group()
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0x0f766a }))
    haste.position.y = 4; pino.add(haste)
    const bola = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x14b8a6, emissive: 0x0f766a, emissiveIntensity: 0.6 }))
    bola.position.y = 8.6; pino.add(bola)
    const anel = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, side: THREE.DoubleSide }))
    anel.rotation.x = -Math.PI / 2; anel.position.y = 0.4; pino.add(anel)
    pino.position.set(P.centro[0], 0.5, P.centro[1]); cena.add(pino)
    // rótulos
    for (const [k, txt, dest] of ROTULOS) {
      if (!P[k]) continue
      const s = rotulo(txt, dest); s.position.set(P[k][0], dest ? 15 : 9, P[k][1]); cena.add(s)
    }
    const cont = rotulo('Continente'); cont.position.set(P.ponte[0] - 30, 8, P.ponte[1] - 20); cena.add(cont)
    // avião subindo do aeroporto em volta da ilha
    const aviao = new THREE.Group()
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 3.2, 4, 10), new THREE.MeshStandardMaterial({ color: 0xffffff })); fus.rotation.z = Math.PI / 2; aviao.add(fus)
    const asa = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 4.4), new THREE.MeshStandardMaterial({ color: 0xffffff })); aviao.add(asa)
    cena.add(aviao)
    // nuvens soltas
    const nuvens = []
    const matN = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85, flatShading: true })
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group()
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + Math.random() * 4, 0), matN); b.position.set(k * 5 - 7, Math.random() * 2, Math.random() * 4); g.add(b) }
      g.position.set(cx + (Math.random() - 0.5) * W * 1.6, 38 + Math.random() * 14, cz + (Math.random() - 0.5) * D); cena.add(g); nuvens.push(g)
    }
    cena.add(new THREE.HemisphereLight(0xffffff, 0x3b6b4b, 1.1))
    const sol = new THREE.DirectionalLight(0xfff4e0, 1.6); sol.position.set(-200, 300, 150); cena.add(sol)

    camera.position.set(P.centro[0] - 120, 170, P.centro[1] + 230)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.target.set(cx + 10, 0, cz); controles.enableDamping = true
    controles.maxPolarAngle = Math.PI * 0.47; controles.minDistance = 30; controles.maxDistance = 900
    controles.autoRotate = !parado; controles.autoRotateSpeed = 0.35
    controles.addEventListener('start', () => { controles.autoRotate = false })
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    let raf = 0, t0 = performance.now()
    const quadro = (agora) => {
      raf = requestAnimationFrame(quadro)
      const t = Math.max(0, (agora - t0) / 1000)
      if (!parado) {
        const k = (t * 0.04) % 1, a = k * Math.PI * 2
        aviao.position.set(P.aeroporto[0] + Math.sin(a) * 120, 6 + Math.min(1, k * 6) * 30, P.aeroporto[1] - Math.cos(a) * 220 + 200)
        aviao.rotation.y = -a + Math.PI / 2
        const pul = 1 + (Math.sin(t * 3) * 0.5 + 0.5) * 1.5; anel.scale.set(pul, pul, pul); anel.material.opacity = 1 - (pul - 1) / 1.6
        nuvens.forEach((g, i) => { g.position.x += (0.6 + (i % 3) * 0.2) * 0.016; if (g.position.x > cx + W) g.position.x = cx - W })
      }
      controles.update()
      renderer.render(cena, camera)
    }
    raf = requestAnimationFrame(quadro)
    setCarregado(true)
    const esc = (e) => { if (e.key === 'Escape') aoFechar?.() }
    window.addEventListener('keydown', esc)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', esc); controles.dispose()
      cena.traverse((o) => { o.geometry?.dispose?.(); if (o.material) { o.material.map?.dispose?.(); o.material.dispose?.() } })
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [aoFechar])
  return (
    <div className="absolute inset-0 z-30 bg-sky-200">
      <div ref={ref} className="h-full w-full overflow-hidden" role="img" aria-label="Ilha de Santa Catarina vista de cima, com o Centro, as pontes, as lagoas e o aeroporto marcados" />
      {!carregado && <div className="absolute inset-0 grid place-items-center text-sm text-slate-700">Montando a ilha…</div>}
      <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-md bg-black/60 px-3 py-2 text-xs text-white">
        <p className="font-semibold">Ilha de Santa Catarina · Florianópolis</p>
        <p className="mt-0.5 text-white/75">Arraste para girar, role para aproximar. Contorno real; relevo e continente são ilustração.</p>
      </div>
      <button onClick={aoFechar} className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-white/90 px-3 text-xs font-medium text-slate-900 hover:bg-white"><X className="h-3.5 w-3.5" />Voltar ao prédio</button>
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-800/80">Contornos © colaboradores do OpenStreetMap</p>
    </div>
  )
}
