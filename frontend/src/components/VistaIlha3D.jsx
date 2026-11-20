import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Sky } from 'three/examples/jsm/objects/Sky.js'
import { X } from 'lucide-react'
import DADOS from './ilhaDados.json'
import RELEVO from './ilhaRelevo.json'

// Ilha de Santa Catarina (Florianópolis) em 3D, com relevo REAL.
// - Contorno da ilha e das lagoas: OpenStreetMap (ODbL).
// - Altitude da terra e profundidade do mar: Terrain Tiles (AWS Open Data; SRTM, GMTED, ETOPO1), grade de 150 m
//   gerada uma vez e guardada em ilhaRelevo.json (mesma projeção local: metros a partir de 27,60°S 48,50°O, x leste, z sul).
// - Cores de mata, areia e cidade são ilustrativas (não é foto de satélite). 1 unidade = 100 m; relevo exagerado 2,2x.
const ESC = 1 / 100
const EXAG = 2.2
const MX = 111320 * Math.cos((27.6 * Math.PI) / 180), MZ = 110570
const ll = (lat, lon) => [((lon + 48.5) * MX) * ESC, (-(lat + 27.6) * MZ) * ESC]   // lat/lon → cena

function dentro(p, poli) {   // ponto no polígono (ray casting)
  let c = false
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [xi, zi] = poli[i], [xj, zj] = poli[j]
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}

function alturas() {
  const bin = atob(RELEVO.alturas)
  const v = new Int16Array(bin.length / 2)
  for (let i = 0; i < v.length; i++) { const lo = bin.charCodeAt(i * 2), hi = bin.charCodeAt(i * 2 + 1); v[i] = (hi << 8 | lo) << 16 >> 16 }
  return v
}

// lugares reais (coordenadas aproximadas do centro de cada lugar)
const LUGARES = [
  ['Centro · escritório', -27.5966, -48.5487, true], ['Ponte Hercílio Luz', -27.5937, -48.5652], ['Aeroporto', -27.6703, -48.5525],
  ['Lagoa da Conceição', -27.6000, -48.4600], ['Jurerê', -27.4405, -48.4955], ['Canasvieiras', -27.4295, -48.4625], ['Ingleses', -27.4350, -48.3950],
  ['Santo Antônio de Lisboa', -27.5080, -48.5180], ['Barra da Lagoa', -27.5740, -48.4250], ['Joaquina', -27.6300, -48.4480],
  ['Campeche', -27.6800, -48.4800], ['Ilha do Campeche', -27.6960, -48.4650], ['Armação', -27.7480, -48.5050], ['Ribeirão da Ilha', -27.7150, -48.5620],
  ['Pântano do Sul', -27.7800, -48.5090], ['UFSC', -27.6010, -48.5190], ['Morro da Cruz', -27.5895, -48.5389], ['Estreito (continente)', -27.5920, -48.5800],
  ['São José (continente)', -27.6150, -48.6350],
]

function rotulo(texto, destaque) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 96
  const g = cv.getContext('2d')
  g.font = `600 ${destaque ? 40 : 32}px system-ui, sans-serif`
  const w = Math.min(630, g.measureText(texto).width + 36)
  g.fillStyle = destaque ? 'rgba(15,118,106,0.95)' : 'rgba(15,23,42,0.74)'
  g.beginPath(); g.roundRect((640 - w) / 2, 14, w, 64, 12); g.fill()
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(texto, 320, 47)
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }))
  s.scale.set(destaque ? 52 : 44, destaque ? 7.8 : 6.6, 1); s.renderOrder = 10
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 1, 6000)

    const ilha = DADOS.ilha.map(([x, z]) => [x * ESC, z * ESC])
    const lagoas = [DADOS.lagoa_conceicao, DADOS.lagoa_peri].map((l) => l.map(([x, z]) => [x * ESC, z * ESC]))
    const { nx, nz, passo, x0, z0 } = RELEVO
    const H = alturas()
    const W = (nx - 1) * passo * ESC, D = (nz - 1) * passo * ESC
    const cx = x0 * ESC + W / 2, cz = z0 * ESC + D / 2
    const xIlhaOeste = Math.min(...ilha.map((p) => p[0]))

    // ---- terreno: uma linha da grade = um vértice; terra pela ilha (contorno real) ou relevo real fora dela ----
    const geo = new THREE.PlaneGeometry(W, D, nx - 1, nz - 1); geo.rotateX(-Math.PI / 2); geo.translate(cx, 0, cz)
    const pos = geo.attributes.position, n = pos.count
    const terra = new Uint8Array(n), alt = new Float32Array(n)
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, x = pos.getX(k), z = pos.getZ(k), h = H[k]
      const naIlha = dentro([x, z], ilha)
      const naLagoa = naIlha && lagoas.some((l) => dentro([x, z], l))
      // fora da ilha: o continente (oeste) vale a partir de 3 m; ilhotas a leste só com morro de verdade (tira ruído do mar)
      const eTerra = naLagoa ? false : naIlha ? true : (x < xIlhaOeste + 8 ? h >= 3 : h >= 15)
      terra[k] = eTerra ? 1 : 0
      alt[k] = naLagoa ? -3 : eTerra ? Math.max(1.5, h) : Math.min(-1, h)
    }
    // distância (em células) até a água, para a faixa de areia e a cidade baixa
    const cores = new Float32Array(n * 3), c = new THREE.Color()
    const AREIA = new THREE.Color(0xe6d8ae), MATA = new THREE.Color(0x3f7a3a), MATA2 = new THREE.Color(0x24502a), CAMPO = new THREE.Color(0x7aa05a), ROCHA = new THREE.Color(0x8b8676), CIDADE = new THREE.Color(0xb9b4aa)
    const viz = (k, d) => { const j = Math.floor(k / nx), i = k % nx; for (let dj = -d; dj <= d; dj++) for (let di = -d; di <= d; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < nz && !terra[b * nx + a]) return true } return false }
    const cidades = [ll(-27.5966, -48.5487), ll(-27.5920, -48.5800), ll(-27.6150, -48.6350), ll(-27.4295, -48.4625), ll(-27.4350, -48.3950), ll(-27.6010, -48.5190)]
    for (let k = 0; k < n; k++) {
      const y = alt[k] / 100 * EXAG
      pos.setY(k, terra[k] ? Math.max(0.22, y) : Math.min(-0.5, y * 0.6 - 0.5))   // terra baixa sempre acima do mar (com as ondas)
      if (!terra[k]) { c.set(0x0f3d55); cores.set([c.r, c.g, c.b], k * 3); continue }
      const h = alt[k]
      const praia = h < 12 && viz(k, 1)
      const urb = h < 40 && cidades.some(([ux, uz]) => (pos.getX(k) - ux) ** 2 + (pos.getZ(k) - uz) ** 2 < 22)
      if (praia) c.copy(AREIA)
      else if (urb) c.copy(CIDADE)
      else c.copy(h < 25 ? CAMPO : MATA).lerp(MATA2, Math.min(1, h / 320)).lerp(ROCHA, Math.max(0, (h - 380) / 200))
      cores.set([c.r, c.g, c.b], k * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3))
    geo.computeVertexNormals()
    const solo = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }))
    solo.receiveShadow = true; solo.castShadow = true
    cena.add(solo)

    // ---- mar: cor pela profundidade real (raso turquesa → fundo azul escuro) e ondas leves ----
    const PS = 2   // metade da resolução da grade basta para o mar
    const mnx = Math.floor((nx - 1) / PS), mnz = Math.floor((nz - 1) / PS)
    const geoMar = new THREE.PlaneGeometry(W, D, mnx, mnz); geoMar.rotateX(-Math.PI / 2); geoMar.translate(cx, 0, cz)
    const pm = geoMar.attributes.position, coresMar = new Float32Array(pm.count * 3)
    const RASO = new THREE.Color(0x3fa9b5), MEIO = new THREE.Color(0x1d6f96), FUNDO = new THREE.Color(0x0c3d66), LAGOA = new THREE.Color(0x2e8a9a)
    for (let j = 0; j <= mnz; j++) for (let i = 0; i <= mnx; i++) {
      const k = Math.min(nz - 1, j * PS) * nx + Math.min(nx - 1, i * PS)
      const prof = -alt[k]
      if (alt[k] === -3) c.copy(LAGOA)
      else c.copy(RASO).lerp(MEIO, Math.min(1, prof / 15)).lerp(FUNDO, Math.max(0, Math.min(1, (prof - 15) / 40)))
      coresMar.set([c.r, c.g, c.b], (j * (mnx + 1) + i) * 3)
    }
    geoMar.setAttribute('color', new THREE.BufferAttribute(coresMar, 3))
    const matMar = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.93 })
    const mar = new THREE.Mesh(geoMar, matMar); mar.position.y = 0.05; mar.receiveShadow = true; cena.add(mar)
    const marBase = Float32Array.from(pm.array)
    // oceano em volta, além da grade
    const oceano = new THREE.Mesh(new THREE.PlaneGeometry(W * 8, D * 6), new THREE.MeshStandardMaterial({ color: 0x145a85, roughness: 0.25 }))
    oceano.rotation.x = -Math.PI / 2; oceano.position.set(cx, -1.2, cz); cena.add(oceano)

    // ---- céu com sol (Preetham) e luz do sol com sombras ----
    const ceu = new Sky(); ceu.scale.setScalar(5000); cena.add(ceu)
    const U = ceu.material.uniforms
    U.turbidity.value = 6; U.rayleigh.value = 1.6; U.mieCoefficient.value = 0.004; U.mieDirectionalG.value = 0.82
    const sol3 = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(58), THREE.MathUtils.degToRad(210))
    U.sunPosition.value.copy(sol3)
    cena.fog = new THREE.Fog(0xbcd6e6, 700, 2600)
    cena.add(new THREE.HemisphereLight(0xdbeafe, 0x2f4f3a, 0.9))
    const sol = new THREE.DirectionalLight(0xfff1dc, 2.4)
    sol.position.copy(sol3).multiplyScalar(600).add(new THREE.Vector3(cx, 0, cz)); sol.target.position.set(cx, 0, cz)
    sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048)
    Object.assign(sol.shadow.camera, { left: -W * 0.7, right: W * 0.7, top: D * 0.6, bottom: -D * 0.6, near: 10, far: 1600 }); sol.shadow.bias = -0.0008
    cena.add(sol, sol.target)

    // ---- pontes (Hercílio Luz pênsil e as duas vizinhas) ----
    const [pX, pZ] = ll(-27.5937, -48.5652)
    const matPonte = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, roughness: 0.5, metalness: 0.4 })
    const vao = 10
    for (const [dz, pensil] of [[0, true], [3.0, false], [5.0, false]]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(vao, 0.25, 0.7), matPonte); tab.position.set(pX, 0.9, pZ + dz); tab.castShadow = true; cena.add(tab)
      if (pensil) {
        for (const tx of [-2.3, 2.3]) { const torre = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.4, 0.9), matPonte); torre.position.set(pX + tx, 2.2, pZ); torre.castShadow = true; cena.add(torre) }
        const curva = new THREE.CatmullRomCurve3([[-5, 1], [-2.3, 4.3], [0, 1.2], [2.3, 4.3], [5, 1]].map(([x, y]) => new THREE.Vector3(pX + x, y, pZ)))
        cena.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 40, 0.07, 6), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 })))
      }
    }

    // ---- marcador do escritório e rótulos dos lugares (na altura do relevo) ----
    const altEm = (x, z) => { const i = Math.round((x / ESC - x0) / passo), j = Math.round((z / ESC - z0) / passo); return i >= 0 && j >= 0 && i < nx && j < nz ? Math.max(0, alt[j * nx + i]) / 100 * EXAG : 0 }
    const [ex, ez] = ll(-27.5966, -48.5487)
    const pino = new THREE.Group()
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 8, 8), new THREE.MeshStandardMaterial({ color: 0x0f766a })); haste.position.y = 4; pino.add(haste)
    const bola = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshStandardMaterial({ color: 0x14b8a6, emissive: 0x0f766a, emissiveIntensity: 0.7 })); bola.position.y = 8.6; pino.add(bola)
    const anel = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0x14b8a6, transparent: true, side: THREE.DoubleSide })); anel.rotation.x = -Math.PI / 2; anel.position.y = 0.4; pino.add(anel)
    pino.position.set(ex, altEm(ex, ez) + 0.3, ez); cena.add(pino)
    for (const [txt, la, lo, dest] of LUGARES) {
      const [x, z] = ll(la, lo)
      const s = rotulo(txt, dest); s.position.set(x, altEm(x, z) + (dest ? 15 : 8), z); cena.add(s)
    }

    // ---- avião saindo do aeroporto e nuvens com sombra ----
    const [aX, aZ] = ll(-27.6703, -48.5525)
    const aviao = new THREE.Group()
    const matAv = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 })
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 3.2, 4, 10), matAv); fus.rotation.z = Math.PI / 2; aviao.add(fus)
    aviao.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 4.4), matAv))
    aviao.traverse((o) => { o.castShadow = true }); cena.add(aviao)
    const nuvens = []
    const matN = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.72, depthWrite: false })
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group()
      for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(3 + Math.random() * 4, 10, 8), matN); b.position.set(k * 4.5 - 9, Math.random() * 2.5, Math.random() * 5); b.scale.y = 0.55; g.add(b) }   // nuvens sem sombra: no mar ela parecia mancha
      g.position.set(cx + (Math.random() - 0.5) * W * 1.6, 85 + Math.random() * 25, cz + (Math.random() - 0.5) * D); cena.add(g); nuvens.push(g)
    }

    camera.position.set(ex - 110, 120, ez + 190)
    const controles = new OrbitControls(camera, renderer.domElement)
    controles.target.set(ex + 25, 0, ez + 25); controles.enableDamping = true
    controles.maxPolarAngle = Math.PI * 0.46; controles.minDistance = 20; controles.maxDistance = 1100
    controles.autoRotate = !parado; controles.autoRotateSpeed = 0.3
    controles.addEventListener('start', () => { controles.autoRotate = false })
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    let raf = 0
    const t0 = performance.now()
    const quadro = (agora) => {
      raf = requestAnimationFrame(quadro)
      const t = Math.max(0, (agora - t0) / 1000)
      if (!parado) {
        const k = (t * 0.035) % 1, a = k * Math.PI * 2
        aviao.position.set(aX + Math.sin(a) * 130, 6 + Math.min(1, k * 6) * 32, aZ - Math.cos(a) * 220 + 200)
        aviao.rotation.y = -a + Math.PI / 2
        const pul = 1 + (Math.sin(t * 3) * 0.5 + 0.5) * 1.5; anel.scale.set(pul, pul, pul); anel.material.opacity = 1 - (pul - 1) / 1.6
        nuvens.forEach((g, i) => { g.position.x += (0.6 + (i % 3) * 0.2) * 0.016; if (g.position.x > cx + W) g.position.x = cx - W })
        // ondas: só no mar perto da câmera não compensa; mexe a superfície inteira de leve a cada 3 quadros
        if (Math.floor(t * 60) % 3 === 0) {
          const arr = pm.array
          for (let v = 0; v < pm.count; v++) arr[v * 3 + 1] = marBase[v * 3 + 1] + Math.sin(marBase[v * 3] * 0.35 + t * 1.2) * 0.04 + Math.cos(marBase[v * 3 + 2] * 0.3 + t) * 0.04
          pm.needsUpdate = true
        }
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
      <div ref={ref} className="h-full w-full overflow-hidden" role="img" aria-label="Ilha de Santa Catarina em 3D com o relevo real, as lagoas, as pontes, o aeroporto e os bairros marcados" />
      {!carregado && <div className="absolute inset-0 grid place-items-center text-sm text-slate-700">Montando a ilha…</div>}
      <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded-md bg-black/60 px-3 py-2 text-xs text-white">
        <p className="font-semibold">Ilha de Santa Catarina · Florianópolis</p>
        <p className="mt-0.5 text-white/75">Arraste para girar, role para aproximar. Contorno e relevo reais (morros exagerados 2,2x); cores ilustrativas.</p>
      </div>
      <button onClick={aoFechar} className="absolute right-3 top-3 inline-flex h-8 items-center gap-1.5 rounded-md bg-white/90 px-3 text-xs font-medium text-slate-900 hover:bg-white"><X className="h-3.5 w-3.5" />Voltar ao prédio</button>
      <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-slate-800/80">Contornos © OpenStreetMap · relevo: Terrain Tiles (AWS Open Data, SRTM)</p>
    </div>
  )
}
