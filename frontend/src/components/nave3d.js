import * as THREE from 'three'

// Nave para voar pelo universo do globo: foguete de aço inox no estilo das naves reutilizáveis (corpo cilíndrico,
// nariz em ogiva, escudo térmico escuro na barriga, aletas de controle e 6 motores com chama). O modelo é desenhado
// aqui (sem logotipos de empresas). Fica presa à câmera, um pouco à frente e abaixo (visão de perseguição).
export function criarNave() {
  const g = new THREE.Group()
  // sem mapa de ambiente, metal muito espelhado sai preto: inox com metal moderado e um leve brilho próprio
  const inox = new THREE.MeshStandardMaterial({ color: 0xe3e7ec, metalness: 0.45, roughness: 0.32, emissive: 0x2a2f36, emissiveIntensity: 0.35 })
  const inoxEscuro = new THREE.MeshStandardMaterial({ color: 0xa9b0b9, metalness: 0.5, roughness: 0.4 })
  const escudo = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.15, roughness: 0.8 })
  const motor = new THREE.MeshStandardMaterial({ color: 0x3a3f47, metalness: 0.8, roughness: 0.4 })
  const R = 0.09, L = 0.95
  // o comprimento da nave fica no eixo Z (nariz para -Z, que é "para a frente" da câmera)
  const corpo = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 40, 1, false), inox); corpo.rotation.x = Math.PI / 2; g.add(corpo)
  // escudo térmico: metade de baixo do cilindro, um pouco por fora
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.008, R * 1.008, L * 0.98, 40, 1, true, -Math.PI * 0.38, Math.PI * 0.76), escudo); sh.rotation.x = Math.PI / 2; g.add(sh)
  // anéis de solda (detalhe do inox)
  for (let i = 0; i < 6; i++) { const a = new THREE.Mesh(new THREE.TorusGeometry(R * 1.004, 0.0015, 6, 40), inoxEscuro); a.position.z = -L / 2 + (i + 0.5) * (L / 6); g.add(a) }
  // nariz em ogiva
  const perfil = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return new THREE.Vector2(R * Math.sqrt(Math.max(0, 1 - t * t)) * (1 - t * 0.08), t * 0.32) })
  const nariz = new THREE.Mesh(new THREE.LatheGeometry(perfil, 40), inox); nariz.rotation.x = -Math.PI / 2; nariz.position.z = -L / 2; g.add(nariz)
  const narizSh = new THREE.Mesh(new THREE.LatheGeometry(perfil.map((v) => new THREE.Vector2(v.x * 1.01, v.y)), 40, Math.PI * 0.5, Math.PI), escudo); narizSh.rotation.x = -Math.PI / 2; narizSh.position.z = -L / 2; g.add(narizSh)
  // aletas: 2 na frente (pequenas) e 2 atrás (grandes), dos lados
  const aleta = (comp, larg, z, lado) => {
    const forma = new THREE.Shape(); forma.moveTo(0, 0); forma.lineTo(larg, comp * 0.15); forma.lineTo(larg, comp * 0.85); forma.lineTo(0, comp); forma.lineTo(0, 0)
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(forma, { depth: 0.006, bevelEnabled: false }), escudo)
    m.rotation.set(Math.PI / 2, 0, lado > 0 ? 0 : Math.PI); m.position.set(lado * R * 0.98, 0, z); g.add(m); return m
  }
  const aletas = [aleta(0.16, 0.05, -L / 2 - 0.05, 1), aleta(0.16, 0.05, -L / 2 - 0.05, -1), aleta(0.26, 0.1, L / 2 - 0.27, 1), aleta(0.26, 0.1, L / 2 - 0.27, -1)]
  // motores: 3 de nível do mar no meio e 3 de vácuo (sino maior) por fora
  const chamas = []
  const matChama = (cor) => new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  const motorEm = (x, y, raio, comp) => {
    const sino = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.55, raio, comp, 20, 1, true), motor); sino.rotation.x = Math.PI / 2; sino.position.set(x, y, L / 2 + comp / 2); g.add(sino)
    const nucleo = new THREE.Mesh(new THREE.ConeGeometry(raio * 0.7, 0.2, 16, 1, true), matChama(0xbfe3ff)); nucleo.rotation.x = -Math.PI / 2; nucleo.position.set(x, y, L / 2 + comp + 0.1); g.add(nucleo)
    const externa = new THREE.Mesh(new THREE.ConeGeometry(raio * 1.1, 0.36, 16, 1, true), matChama(0x5aa0ff)); externa.rotation.x = -Math.PI / 2; externa.position.set(x, y, L / 2 + comp + 0.18); externa.material.opacity = 0.35; g.add(externa)
    chamas.push({ nucleo, externa, base: L / 2 + comp, fase: Math.random() * 10 })
  }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; motorEm(Math.cos(a) * 0.028, Math.sin(a) * 0.028, 0.018, 0.035) }
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + Math.PI / 3; motorEm(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 0.026, 0.05) }
  const brilho = new THREE.PointLight(0x7fb4ff, 0, 1.6); brilho.position.set(0, 0, L / 2 + 0.3); g.add(brilho)
  // luzes de navegação: vermelha (esquerda), verde (direita), branca piscando no topo
  const luz = (cor, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: cor })); m.position.set(x, y, z); g.add(m); return m }
  const luzes = [luz(0xff3b30, -R - 0.1, 0, L / 2 - 0.15), luz(0x34c759, R + 0.1, 0, L / 2 - 0.15), luz(0xffffff, 0, R + 0.004, -0.1)]
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false })

  const estado = { empuxo: 0, inclina: 0, arfagem: 0 }
  // c = { empuxo 0..1, boost bool, lado -1..1, sobe -1..1 }
  const atualizar = (dt, t, c) => {
    const alvo = c.empuxo * (c.boost ? 1.6 : 1)
    estado.empuxo += (alvo - estado.empuxo) * Math.min(1, dt * 4)
    estado.inclina += ((-c.lado * 0.22) - estado.inclina) * Math.min(1, dt * 3)
    estado.arfagem += ((c.sobe * 0.18) - estado.arfagem) * Math.min(1, dt * 3)
    g.rotation.set(estado.arfagem + 0.04, 0.42, estado.inclina)   // vista de três quartos: mostra o casco inteiro
    for (const ch of chamas) {
      const piscar = 0.85 + Math.sin(t * 40 + ch.fase) * 0.08 + Math.random() * 0.07
      const k = Math.max(0.05, estado.empuxo) * piscar
      ch.nucleo.scale.y = k; ch.nucleo.position.z = ch.base + 0.1 * k
      ch.externa.scale.y = k * (c.boost ? 1.8 : 1); ch.externa.position.z = ch.base + 0.18 * k * (c.boost ? 1.8 : 1)
      ch.nucleo.material.opacity = 0.35 + 0.55 * Math.min(1, estado.empuxo)
      ch.externa.material.opacity = 0.12 + 0.3 * Math.min(1, estado.empuxo)
    }
    brilho.intensity = 0.2 + estado.empuxo * 2.2
    luzes[2].visible = (t % 1.2) < 0.12
    aletas[0].rotation.y = aletas[1].rotation.y = estado.arfagem * 0.8
  }
  return { grupo: g, atualizar, estado }
}

// estrelas cadentes no céu ao fundo: um risco que atravessa e some, de tempos em tempos
export function criarMeteoros(cena) {
  const lista = []
  const mat = () => new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  let proximo = 2
  return (dt) => {
    proximo -= dt
    if (proximo <= 0) {
      proximo = 2.5 + Math.random() * 5
      const dir = new THREE.Vector3().randomDirection(), ini = dir.clone().multiplyScalar(40 + Math.random() * 25)
      const vel = new THREE.Vector3().randomDirection().projectOnPlane(dir).normalize().multiplyScalar(18 + Math.random() * 14)
      const geo = new THREE.BufferGeometry().setFromPoints([ini, ini.clone()])
      const l = new THREE.Line(geo, mat()); l.frustumCulled = false; cena.add(l)
      lista.push({ l, ini, vel, vida: 0, dur: 0.7 + Math.random() * 0.6 })
    }
    for (let i = lista.length - 1; i >= 0; i--) {
      const m = lista[i]; m.vida += dt
      const k = m.vida / m.dur
      const cabeca = m.ini.clone().addScaledVector(m.vel, m.vida), cauda = cabeca.clone().addScaledVector(m.vel, -0.35)
      const p = m.l.geometry.attributes.position.array
      p[0] = cauda.x; p[1] = cauda.y; p[2] = cauda.z; p[3] = cabeca.x; p[4] = cabeca.y; p[5] = cabeca.z
      m.l.geometry.attributes.position.needsUpdate = true
      m.l.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.9
      if (k >= 1) { cena.remove(m.l); m.l.geometry.dispose(); m.l.material.dispose(); lista.splice(i, 1) }
    }
  }
}

// aurora nos dois polos: cortina de luz verde e roxa que ondula (gira junto com a Terra)
export function criarAurora(globo, raio) {
  const uniforms = { t: { value: 0 } }
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; uniform float t; void main(){ vUv = uv; vec3 p = position; p += normal * sin(uv.x*40.0 + t*1.7) * 0.004; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float t; void main(){ float onda = 0.55 + 0.45*sin(vUv.x*24.0 + t*1.3) * sin(vUv.x*7.0 - t*0.6); float v = smoothstep(0.0,0.25,vUv.y) * (1.0 - smoothstep(0.35,1.0,vUv.y)); vec3 cor = mix(vec3(0.15,1.0,0.55), vec3(0.65,0.3,1.0), vUv.y); gl_FragColor = vec4(cor, v * onda * 0.55); }',
  })
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.36, raio * 0.33, raio * 0.09, 96, 1, true), mat)
    m.position.y = s * raio * 0.95; m.renderOrder = 3; globo.add(m)
  }
  return (dt) => { uniforms.t.value += dt }
}
