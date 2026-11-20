import * as THREE from 'three'

// Piloto de moto desenhado por código (para as motos do trânsito, que antes andavam "sozinhas"): capacete com viseira,
// jaqueta inclinada para a frente, braços até o guidão e pernas dobradas nas pedaleiras. Frente em +x (como o trânsito).
// H = altura da moto, L = comprimento; cores variam por semente.
const CORES = [[0xdc2626, 0x111827], [0x2563eb, 0x0f172a], [0xf59e0b, 0x1f2937], [0x16a34a, 0x111827], [0xf8fafc, 0x334155], [0x7c3aed, 0x111827]]
export function pilotoMoto(H = 1.1, L = 2.1, semente = 0) {
  const [corJaq, corCalca] = CORES[Math.abs(semente) % CORES.length]
  const jaq = new THREE.MeshStandardMaterial({ color: corJaq, roughness: 0.55 })
  const calca = new THREE.MeshStandardMaterial({ color: corCalca, roughness: 0.8 })
  const capa = new THREE.MeshStandardMaterial({ color: corJaq, roughness: 0.25, metalness: 0.3 })
  const viseira = new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 0.1, metalness: 0.6 })
  const luva = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
  const g = new THREE.Group()
  const banco = Math.max(0.55, H * 0.62)          // altura do assento
  const xs = -L * 0.08                           // assento um pouco atrás do meio
  const m = (geo, mat, x, y, z, rz = 0, rx = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.z = rz; o.rotation.x = rx; o.castShadow = true; g.add(o); return o }
  // quadril e tronco inclinado para a frente (posição de moto esportiva)
  m(new THREE.CapsuleGeometry(0.17, 0.12, 4, 8), calca, xs, banco + 0.12, 0, Math.PI / 2)
  m(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), jaq, xs + 0.2, banco + 0.42, 0, -0.95)
  // capacete e viseira
  m(new THREE.SphereGeometry(0.17, 14, 12), capa, xs + 0.47, banco + 0.7, 0)
  m(new THREE.SphereGeometry(0.135, 12, 10, -Math.PI / 2.4, Math.PI / 1.2, Math.PI / 3, Math.PI / 3), viseira, xs + 0.52, banco + 0.7, 0).rotation.y = -Math.PI / 2
  // braços até o guidão
  for (const z of [-0.2, 0.2]) {
    m(new THREE.CapsuleGeometry(0.06, 0.34, 4, 6), jaq, xs + 0.45, banco + 0.42, z, -1.25)
    m(new THREE.SphereGeometry(0.06, 8, 6), luva, xs + 0.65, banco + 0.32, z * 1.1)
    // coxa para a frente e canela para baixo/trás (pé na pedaleira)
    m(new THREE.CapsuleGeometry(0.085, 0.36, 4, 6), calca, xs + 0.12, banco + 0.06, z * 0.95, -1.35)
    m(new THREE.CapsuleGeometry(0.07, 0.34, 4, 6), calca, xs + 0.2, banco - 0.2, z * 1.05, 0.45)
    m(new THREE.BoxGeometry(0.22, 0.08, 0.1), luva, xs + 0.1, banco - 0.42, z * 1.1)
  }
  return g
}
