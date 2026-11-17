import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// ---------------------------------------------------------------------------------------------------------------
// Tempo no mapa 3D, a partir da previsão real (Open-Meteo, GET /api/clima-externo → `tipo` e `nuvens`):
// - nuvens: uma geometria de nuvem (bolhas mescladas) repetida por instância; quantidade e cor seguem a cobertura;
// - chuva: segmentos de linha caindo numa caixa em volta do prédio (CPU, ~5 mil gotas, só quando chove);
// - trovoada: clarões (luz que pisca) de tempos em tempos;
// - neblina: fica por conta da névoa da cena (Mapa3D ajusta).
// montarTempo({ centro, raio, topo, noite, r }) → { grupo, aplicar(tipo, nuvens), tick(dt, t), luz }
// ---------------------------------------------------------------------------------------------------------------

function geoNuvem(r) {
  const partes = []
  const n = 6 + Math.floor(r() * 4)
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1)
    const s = 0.7 + r() * 0.8
    g.scale(s * 1.4, s * 0.8, s)
    g.translate((i - n / 2) * 1.1 + r() * 0.6, r() * 0.5, (r() - 0.5) * 1.4)
    partes.push(g)
  }
  const m = mergeGeometries(partes); partes.forEach((g) => g.dispose())
  return m
}

export function montarTempo({ centro, raio = 220, topo = 90, noite, r }) {
  const grupo = new THREE.Group()
  const [cx, cz] = centro
  // nuvens
  const MAX = 46
  const matNuvem = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92, depthWrite: false })
  const nuvens = new THREE.InstancedMesh(geoNuvem(r), matNuvem, MAX)
  nuvens.frustumCulled = false
  const dados = []
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), esc = new THREE.Vector3()
  for (let i = 0; i < MAX; i++) {
    const ang = r() * Math.PI * 2, d = 30 + r() * raio
    dados.push({ x: cx + Math.cos(ang) * d, z: cz + Math.sin(ang) * d, y: topo + r() * 40, s: 5 + r() * 7, rot: r() * Math.PI, vel: 1.2 + r() * 1.6 })
  }
  grupo.add(nuvens)
  // chuva
  const GOTAS = 5000, AREA = 150, ALT = topo + 10
  const pos = new Float32Array(GOTAS * 6)
  const vel = new Float32Array(GOTAS)
  for (let i = 0; i < GOTAS; i++) {
    const x = cx + (r() - 0.5) * AREA, z = cz + (r() - 0.5) * AREA, y = r() * ALT
    pos.set([x, y, z, x + 0.05, y + 0.7, z], i * 6); vel[i] = 18 + r() * 8
  }
  const geoChuva = new THREE.BufferGeometry(); geoChuva.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const chuva = new THREE.LineSegments(geoChuva, new THREE.LineBasicMaterial({ color: noite ? 0x8ea4c4 : 0xa9bfd6, transparent: true, opacity: 0.55 }))
  chuva.frustumCulled = false; chuva.visible = false; grupo.add(chuva)
  // clarão de trovoada
  const luz = new THREE.HemisphereLight(0xdfe8ff, 0x334155, 0); grupo.add(luz)
  let tipo = 'limpo', quantas = 0, proxRaio = 3, clarao = 0

  const aplicar = (novoTipo, cobertura = 0) => {
    tipo = novoTipo || 'limpo'
    const base = tipo === 'chuva' || tipo === 'trovoada' ? Math.max(cobertura, 85) : tipo === 'nublado' ? Math.max(cobertura, 55) : tipo === 'neblina' ? 40 : Math.min(cobertura, 25)
    quantas = Math.round((MAX * base) / 100)
    nuvens.count = quantas
    matNuvem.color.set(tipo === 'trovoada' ? 0x6b7280 : tipo === 'chuva' ? 0x9ca3af : tipo === 'nublado' ? 0xd1d5db : 0xffffff)
    if (noite) matNuvem.color.multiplyScalar(0.35)
    chuva.visible = tipo === 'chuva' || tipo === 'trovoada'
  }
  const tick = (dt, t) => {
    for (let i = 0; i < quantas; i++) {
      const n = dados[i]
      n.x += n.vel * dt; if (n.x > cx + raio + 40) n.x = cx - raio - 40
      v.set(n.x, n.y, n.z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), n.rot); esc.set(n.s, n.s * 0.8, n.s)
      m4.compose(v, q, esc); nuvens.setMatrixAt(i, m4)
    }
    nuvens.instanceMatrix.needsUpdate = true
    if (chuva.visible) {
      const p = geoChuva.attributes.position.array, k = Math.min(dt, 0.05)
      for (let i = 0; i < GOTAS; i++) {
        const o = i * 6, dy = vel[i] * k
        p[o + 1] -= dy; p[o + 4] -= dy
        if (p[o + 1] < 0) { p[o + 1] = ALT; p[o + 4] = ALT + 0.7 }
      }
      geoChuva.attributes.position.needsUpdate = true
    }
    if (tipo === 'trovoada') {
      proxRaio -= dt
      if (proxRaio <= 0) { clarao = 1; proxRaio = 4 + Math.random() * 9 }
    }
    clarao = Math.max(0, clarao - dt * 3)
    luz.intensity = clarao > 0 ? clarao * (Math.sin(t * 60) > 0 ? 3.2 : 1.2) : 0
  }
  return { grupo, aplicar, tick, get tipo() { return tipo } }
}
