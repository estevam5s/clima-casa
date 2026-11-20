import * as THREE from 'three'

// Heróis da biblioteca de avatares passando pela cidade do mapa (modelos do dono, sem animação: o movimento é feito
// aqui). Homem de Ferro voa alto em volta do prédio com o brilho dos propulsores; Goku voa mais baixo em "8" com a aura;
// Naruto corre pela calçada do quarteirão inclinado para a frente e dá saltos de vez em quando.
// Cada modelo é normalizado para 1,8 m, frente em +z (o invólucro é que aponta para onde vai).
function normalizar(cena, altura = 1.8) {
  const bb = new THREE.Box3().setFromObject(cena), s = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3())
  const k = altura / Math.max(0.01, s.y)
  const pivo = new THREE.Group(); pivo.add(cena)
  cena.position.set(-c.x * k, -c.y * k, -c.z * k); cena.scale.multiplyScalar(k)   // centro do corpo na origem do pivô
  cena.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false } })
  return pivo
}

function brilho(cor, raio) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(raio, 16, 12), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }))
  m.renderOrder = 2
  return m
}

export function montarHerois(pai, { centro, raio = 60, yChao = 0, rua = null }, modelos) {
  const g = new THREE.Group(); g.name = 'herois'; pai.add(g)
  const atores = []
  const [cx, cz] = centro
  if (modelos.ferro) {
    const corpo = normalizar(modelos.ferro, 1.9)
    corpo.rotation.x = Math.PI / 2          // deitado: voa de cabeça para a frente (+z)
    const env = new THREE.Group(); env.add(corpo)
    // propulsores: brilho nos pés e nas mãos + uma luz que acompanha
    for (const [x, y, z, r] of [[-0.12, 0, -0.95, 0.14], [0.12, 0, -0.95, 0.14], [-0.35, 0, 0.1, 0.08], [0.35, 0, 0.1, 0.08]]) { const b = brilho(0xfff1c4, r); b.position.set(x, y, z); env.add(b) }
    const jato = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }))
    jato.rotation.x = Math.PI / 2; jato.position.set(0, 0, -1.5); env.add(jato)
    const luz = new THREE.PointLight(0xffd9a0, 6, 14, 2); luz.position.set(0, 0, -1); env.add(luz)
    g.add(env)
    atores.push({ env, tick: (t) => {
      const a = t * 0.11, r = raio * 1.25
      const p = [cx + Math.cos(a) * r, yChao + 58 + Math.sin(t * 0.37) * 6, cz + Math.sin(a) * r * 0.75]
      const p2 = [cx + Math.cos(a + 0.05) * r, yChao + 58 + Math.sin((t + 0.4) * 0.37) * 6, cz + Math.sin(a + 0.05) * r * 0.75]
      env.position.set(...p); env.lookAt(...p2); env.rotateZ(Math.sin(t * 0.9) * 0.25 - 0.35)   // inclina na curva
      jato.scale.setScalar(0.85 + Math.sin(t * 40) * 0.12); luz.intensity = 5 + Math.sin(t * 33) * 1.2
    } })
  }
  if (modelos.goku) {
    const corpo = normalizar(modelos.goku, 1.75)
    const env = new THREE.Group(); env.add(corpo)
    const aura = brilho(0xffd84d, 1.15); aura.scale.set(0.75, 1.25, 0.75); env.add(aura)
    g.add(env)
    atores.push({ env, tick: (t) => {
      const a = t * 0.16, r = raio * 0.75
      const p = [cx + Math.sin(a) * r, yChao + 32 + Math.sin(t * 0.8) * 2.5, cz + Math.sin(a * 2) * r * 0.5]
      const p2 = [cx + Math.sin(a + 0.04) * r, p[1], cz + Math.sin((a + 0.04) * 2) * r * 0.5]
      env.position.set(...p); env.lookAt(...p2); corpo.rotation.x = 0.55   // inclinado para a frente ao voar
      aura.material.opacity = 0.22 + Math.sin(t * 9) * 0.08; aura.scale.set(0.75 + Math.sin(t * 7) * 0.04, 1.25, 0.75)
    } })
  }
  if (modelos.naruto && rua) {
    const corpo = normalizar(modelos.naruto, 1.65)
    const env = new THREE.Group(); env.add(corpo); g.add(env)
    // volta no quarteirão pela calçada (retângulo rua = [x0, z0, x1, z1]), 7 m/s, salto alto a cada ~11 s
    const [x0, z0, x1, z1] = rua, w = x1 - x0, h = z1 - z0, per = 2 * (w + h)
    const ponto = (s) => { s = ((s % per) + per) % per; if (s < w) return [x0 + s, z0]; s -= w; if (s < h) return [x1, z0 + s]; s -= h; if (s < w) return [x1 - s, z1]; s -= w; return [x0, z1 - s] }
    atores.push({ env, tick: (t) => {
      const s = t * 7, [x, z] = ponto(s), [xn, zn] = ponto(s + 0.5)
      const ciclo = t % 11, salto = ciclo < 1.4 ? Math.sin((ciclo / 1.4) * Math.PI) * 7 : 0
      const y = yChao + 0.83 + Math.abs(Math.sin(t * 11)) * 0.12 + salto
      env.position.set(x, y, z); env.lookAt(xn, y, zn)
      corpo.rotation.x = salto ? 0.25 : 0.62   // corrida inclinada para a frente
    } })
  }
  return {
    grupo: g,
    tick(dt, t) { for (const a of atores) a.tick(t) },
    descartar() { g.removeFromParent() },
  }
}
