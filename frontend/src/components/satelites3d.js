import * as THREE from 'three'
import { eciToGeodetic, gstime, propagate, twoline2satrec } from 'satellite.js'

// Satélites reais em volta do globo: posição calculada no navegador a cada fração de segundo pelo modelo SGP4, a
// partir dos elementos orbitais públicos (CelesTrak). Altura em escala real (raio da Terra = 6.371 km = 1 unidade):
// Starlink rente ao globo, GPS a ~4 raios. Quem está na sombra da Terra fica apagado. Estações e o Hubble têm nome,
// trilha da órbita (uma volta) e ficha com latitude, longitude, altitude e velocidade.
export const GRUPOS_SAT = {
  estacoes: { nome: 'Estações espaciais', cor: 0xfacc15 },
  visiveis: { nome: 'Visíveis a olho nu', cor: 0xf8fafc },
  starlink: { nome: 'Starlink', cor: 0x60a5fa },
  gps: { nome: 'GPS', cor: 0x34d399 },
  clima: { nome: 'Meteorológicos', cor: 0xf472b6 },
  ciencia: { nome: 'Científicos', cor: 0xc084fc },
}
const RT = 6371
const DESTAQUES = [/^ISS \(ZARYA\)/, /^CSS \(TIANHE\)/, /^HST$/, /^NOAA 19$/, /^TERRA$/]

function texturaBrilho() {
  const c = document.createElement('canvas'); c.width = c.height = 64
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

export function criarSatelites(globo, vetor, caixaRotulos) {
  const grupo = new THREE.Group(); globo.add(grupo)
  const tex = texturaBrilho()
  let sats = [], pontos = null, cores = null, base = null, trilhas = [], ultimo = 0, ultimaTrilha = 0
  const rotulos = []
  const posLatLon = (sr, data) => {
    const pv = propagate(sr, data)
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null
    const g = eciToGeodetic(pv.position, gstime(data))
    const lat = g.latitude * 180 / Math.PI, lon = g.longitude * 180 / Math.PI
    const v = pv.velocity ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0
    return { lat, lon, alt: g.height, vel: v * 3600 }
  }
  const carregar = (lista) => {
    grupo.clear(); trilhas = []; rotulos.forEach((r) => r.div.remove()); rotulos.length = 0
    sats = lista.map((s) => { try { return { ...s, sr: twoline2satrec(s.l1, s.l2) } } catch { return null } }).filter((s) => s && !s.sr.error)
    const n = sats.length
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    cores = new Float32Array(n * 3); base = new Float32Array(n * 3)
    sats.forEach((s, i) => { const c = new THREE.Color(GRUPOS_SAT[s.grupo]?.cor || 0xffffff); base.set([c.r, c.g, c.b], i * 3) })
    geo.setAttribute('color', new THREE.BufferAttribute(cores, 3))
    pontos = new THREE.Points(geo, new THREE.PointsMaterial({ size: 5, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: false }))
    grupo.add(pontos)
    // destaques: rótulo e trilha da órbita
    sats.forEach((s, i) => {
      if (!DESTAQUES.some((re) => re.test(s.nome))) return
      s.destaque = true
      const div = document.createElement('div')
      div.className = 'absolute left-0 top-0 whitespace-nowrap rounded border border-yellow-300/30 bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-yellow-100 backdrop-blur-sm transition-opacity'
      div.textContent = s.nome.replace(' (ZARYA)', '').replace(' (TIANHE)', ' Tiangong').replace(/^HST$/, 'Hubble')
      caixaRotulos?.appendChild(div)
      rotulos.push({ div, i })
      const linha = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: GRUPOS_SAT[s.grupo]?.cor || 0xffffff, transparent: true, opacity: 0.45 }))
      grupo.add(linha); trilhas.push({ linha, s })
    })
    ultimo = 0; ultimaTrilha = 0
  }
  const atualizarTrilhas = (agora) => {
    trilhas.forEach(({ linha, s }) => {
      const periodo = (2 * Math.PI / s.sr.no) * 60 * 1000   // no = rad/min
      const pts = []
      for (let k = 0; k <= 120; k++) {
        const p = posLatLon(s.sr, new Date(agora.getTime() + (k / 120 - 0.5) * periodo))
        if (p) pts.push(vetor(p.lat, p.lon, 1 + p.alt / RT))
      }
      linha.geometry.dispose(); linha.geometry = new THREE.BufferGeometry().setFromPoints(pts)
    })
  }
  const tmp = new THREE.Vector3()
  // sol: direção do Sol no referencial da Terra (para saber quem está na sombra)
  const atualizar = (t, camera, w, h, sol, mostrarRotulos) => {
    if (!pontos) return
    if (t - ultimo > 0.25) {
      ultimo = t
      const agora = new Date()
      const arr = pontos.geometry.attributes.position.array
      sats.forEach((s, i) => {
        const p = posLatLon(s.sr, agora)
        if (!p) { arr[i * 3] = arr[i * 3 + 1] = arr[i * 3 + 2] = 0; return }
        s.agora = p
        const v = vetor(p.lat, p.lon, 1 + p.alt / RT)
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z
        // sombra cilíndrica da Terra
        const d = v.dot(sol), perp = Math.sqrt(Math.max(0, v.lengthSq() - d * d))
        const k = d < 0 && perp < 1 ? 0.22 : 1
        cores[i * 3] = base[i * 3] * k; cores[i * 3 + 1] = base[i * 3 + 1] * k; cores[i * 3 + 2] = base[i * 3 + 2] * k
      })
      pontos.geometry.attributes.position.needsUpdate = true
      pontos.geometry.attributes.color.needsUpdate = true
      if (t - ultimaTrilha > 30 || !ultimaTrilha) { ultimaTrilha = t; atualizarTrilhas(agora) }
    }
    const cam = camera.position.clone().normalize()
    rotulos.forEach(({ div, i }) => {
      const arr = pontos.geometry.attributes.position.array
      tmp.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]).applyMatrix4(globo.matrixWorld)
      const frente = tmp.clone().normalize().dot(cam) > -0.05 || tmp.length() > 1.6
      tmp.project(camera)
      div.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w + 6}px, ${(-tmp.y * 0.5 + 0.5) * h - 8}px)`
      div.style.opacity = mostrarRotulos && grupo.visible && frente && tmp.z < 1 ? '1' : '0'
    })
  }
  const resumo = () => {
    const porGrupo = {}
    sats.forEach((s) => { porGrupo[s.grupo] = (porGrupo[s.grupo] || 0) + 1 })
    const iss = sats.find((s) => /^ISS \(ZARYA\)/.test(s.nome))
    return { total: sats.length, porGrupo, iss: iss?.agora || null }
  }
  const descartar = () => { rotulos.forEach((r) => r.div.remove()); tex.dispose(); grupo.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() }) }
  return { grupo, carregar, atualizar, resumo, descartar, set visivel(v) { grupo.visible = v } }
}
