import * as THREE from 'three'
import { equatorialParaTerra, naTerra } from './universo'

// Os 200 exoplanetas confirmados mais próximos (NASA Exoplanet Archive), na direção real da estrela no céu.
// Distância em escala logarítmica (fora de escala, como o resto do universo) e aparência ilustrativa pela classe:
// gigante gasoso, mini-Netuno ou rochoso (quente, temperado, gelado), pela temperatura de equilíbrio e pelo raio.
function classe(p) {
  const r = p.pl_rade || (p.pl_bmasse ? Math.cbrt(p.pl_bmasse) : 1.5), t = p.pl_eqt
  if (r >= 6 || (p.pl_bmasse || 0) > 60) return t && t > 900 ? 'gigante_quente' : 'gigante'
  if (r >= 2.2) return 'netuno'
  if (t == null) return 'rochoso'
  return t > 900 ? 'lava' : t > 400 ? 'deserto' : t > 180 ? 'temperado' : 'gelo'
}
export const NOME_CLASSE = { gigante_quente: 'Júpiter quente', gigante: 'Gigante gasoso', netuno: 'Mini-Netuno', lava: 'Rochoso muito quente', deserto: 'Rochoso quente', temperado: 'Rochoso temperado', gelo: 'Rochoso gelado', rochoso: 'Rochoso' }

function textura(cls, semente) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128
  const g = c.getContext('2d')
  let s = semente; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const base = { gigante_quente: ['#7c2d12', '#c2410c', '#fdba74'], gigante: ['#a16207', '#e7c58a', '#f5e6c8'], netuno: ['#1e3a8a', '#3b82f6', '#93c5fd'],
    lava: ['#1c1917', '#292524', '#f97316'], deserto: ['#78350f', '#b45309', '#e2b07a'], temperado: ['#1e3a8a', '#166534', '#e2e8f0'], gelo: ['#cbd5e1', '#e2e8f0', '#94a3b8'], rochoso: ['#57534e', '#78716c', '#a8a29e'] }[cls]
  g.fillStyle = base[0]; g.fillRect(0, 0, 256, 128)
  if (cls.startsWith('gigante') || cls === 'netuno') {   // faixas
    for (let y = 0; y < 128; y += 3 + r() * 8) { g.fillStyle = base[1 + Math.floor(r() * 2)]; g.globalAlpha = 0.35 + r() * 0.5; g.fillRect(0, y, 256, 2 + r() * 7) }
    g.globalAlpha = 1
  } else {
    for (let i = 0; i < 90; i++) { g.fillStyle = base[1 + Math.floor(r() * 2)]; g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.ellipse(r() * 256, 10 + r() * 108, 4 + r() * 22, 3 + r() * 10, 0, 0, Math.PI * 2); g.fill() }
    if (cls === 'lava') { g.strokeStyle = '#fb923c'; g.globalAlpha = 0.9; for (let i = 0; i < 40; i++) { g.beginPath(); g.moveTo(r() * 256, r() * 128); g.lineTo(r() * 256, r() * 128); g.lineWidth = 0.6 + r(); g.stroke() } }
    g.globalAlpha = 1
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}
const corEstrela = (teff) => { const t = teff || 3500; return t > 7000 ? 0xcfe0ff : t > 5800 ? 0xfff6e8 : t > 5000 ? 0xffe8b0 : t > 3900 ? 0xffc27a : 0xff9a5c }

export function criarExoplanetas(grupoUniverso, lista, quatTerra) {
  const grupo = new THREE.Group(); grupoUniverso.add(grupo)
  const corpos = {}, descartar = [], dados = {}
  const geo = new THREE.SphereGeometry(1, 32, 20); descartar.push(geo)
  const mats = {}
  const mat = (cls) => {
    if (!mats[cls]) { const tex = textura(cls, 97 + cls.length * 31); mats[cls] = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, emissive: cls === 'lava' || cls === 'gigante_quente' ? 0x4a1a05 : 0x000000, emissiveIntensity: 0.8 }); descartar.push(tex, mats[cls]) }
    return mats[cls]
  }
  const brilhoC = document.createElement('canvas'); brilhoC.width = brilhoC.height = 64
  const gb = brilhoC.getContext('2d'); const gr = gb.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  gb.fillStyle = gr; gb.fillRect(0, 0, 64, 64)
  const texBrilho = new THREE.CanvasTexture(brilhoC); descartar.push(texBrilho)
  const estrelas = new Map()
  lista.forEach((p, i) => {
    const e = equatorialParaTerra(p.ra, p.dec)
    const dist = 170 + 55 * Math.log10(Math.max(1.2, p.sy_dist))
    const cls = classe(p)
    const raio = THREE.MathUtils.clamp(0.3 + 0.1 * Math.sqrt(p.pl_rade || 1.5), 0.3, 1.1)
    // planetas da mesma estrela: em fila ao lado dela (a ordem segue o período)
    const k = `exo:${i}`
    let est = estrelas.get(p.hostname)
    if (!est) {
      const pos = naTerra(e.lat, e.lon, dist, quatTerra)
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrilho, color: corEstrela(p.st_teff), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      sp.scale.setScalar(3.2); sp.position.copy(pos); grupo.add(sp); descartar.push(sp.material)
      est = { pos, n: 0 }; estrelas.set(p.hostname, est)
    }
    est.n++
    const lado = new THREE.Vector3().crossVectors(est.pos, new THREE.Vector3(0, 1, 0)).normalize()
    const m = new THREE.Mesh(geo, mat(cls)); m.scale.setScalar(raio)
    m.position.copy(est.pos).addScaledVector(lado, 2.2 + est.n * 2.4)
    m.rotation.y = i; grupo.add(m)
    const anosLuz = p.sy_dist * 3.2616
    corpos[k] = { obj: m, raio, nome: p.pl_name, distancia: `${anosLuz < 100 ? anosLuz.toFixed(1).replace('.', ',') : Math.round(anosLuz)} anos-luz · ${NOME_CLASSE[cls]}`, giro: 0.03, exo: true }
    dados[k] = { ...p, classe: NOME_CLASSE[cls], anos_luz: anosLuz }
  })
  return { grupo, corpos, dados, descartar: () => descartar.forEach((d) => d.dispose()) }
}
