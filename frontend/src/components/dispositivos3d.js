import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// Dispositivos do mapa (itens da "loja"): cada um é um grupo na posição do elemento, com a frente para +z local
// (rot 0 = frente para baixo da planta). Devolve o grupo, os LEDs que piscam, o que gira e a caixa de clique.
// "ligado" apaga telas e LEDs e para a hélice; "cor" pinta o corpo; "modelo" troca a forma.

const mat = (c, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal })
const brilho = (c, k = 1.6) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.3 })

function caixa(pai, w, h, d, m, x, y, z, rx = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; o.receiveShadow = true; pai.add(o); return o
}
function arred(pai, w, h, d, r, m, x, y, z) {
  const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m)
  o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; pai.add(o); return o
}
function cilindro(pai, rt, rb, h, m, x, y, z, seg = 24) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m)
  o.position.set(x, y, z); o.castShadow = true; pai.add(o); return o
}

// frente do rack desenhada num canvas: servidores 1U/2U com baias de disco, switch com portas, patch panel e nobreak
function texturaRack(unidades) {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * unidades / 10)
  const g = c.getContext('2d'), u = c.height / unidades
  g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, c.width, c.height)
  const linhas = []
  let y = 0
  const plano = unidades >= 40
    ? [['patch', 1], ['switch', 1], ['vazio', 1], ['patch', 1], ['switch', 1], ['vazio', 2], ['srv', 2], ['srv', 2], ['srv', 1], ['srv', 1], ['srv', 2], ['vazio', 2], ['storage', 3], ['vazio', 1], ['srv', 2], ['srv', 2], ['vazio', 4], ['monitor', 1], ['vazio', 4], ['ups', 3], ['ups', 3]]
    : [['patch', 1], ['switch', 1], ['vazio', 1], ['srv', 2], ['srv', 1], ['storage', 2], ['vazio', 2], ['vazio', 2], ['ups', 3]]
  for (const [tipo, n] of plano) {
    if (y + n > unidades) break
    const y0 = y * u + 1, h = n * u - 2
    if (tipo === 'srv' || tipo === 'storage') {
      g.fillStyle = tipo === 'storage' ? '#1f2937' : '#27272a'; g.fillRect(8, y0, 240, h)
      const baias = tipo === 'storage' ? 12 : n === 1 ? 8 : 10
      for (let i = 0; i < baias; i++) { g.fillStyle = '#3f3f46'; g.fillRect(14 + i * (170 / baias), y0 + 3, 170 / baias - 3, h - 6); g.fillStyle = '#52525b'; g.fillRect(14 + i * (170 / baias), y0 + h - 7, 170 / baias - 3, 2) }
      g.fillStyle = '#a1a1aa'; g.fillRect(196, y0 + h / 2 - 2, 40, 4)
    } else if (tipo === 'switch') {
      g.fillStyle = '#1e293b'; g.fillRect(8, y0, 240, h)
      for (let i = 0; i < 24; i++) { g.fillStyle = '#0b0f14'; g.fillRect(14 + (i % 12) * 15, y0 + 2 + Math.floor(i / 12) * (h / 2), 12, h / 2 - 3) }
      const cores = ['#2563eb', '#16a34a', '#eab308', '#dc2626', '#f97316']
      for (let i = 0; i < 18; i++) { g.strokeStyle = cores[i % cores.length]; g.lineWidth = 2; g.beginPath(); g.moveTo(20 + (i % 12) * 15, y0 + h / 2); g.lineTo(20 + (i % 12) * 15 + 4, y0 + h + 6); g.stroke() }
    } else if (tipo === 'patch') {
      g.fillStyle = '#18181b'; g.fillRect(8, y0, 240, h)
      for (let i = 0; i < 24; i++) { g.fillStyle = '#d4d4d8'; g.fillRect(14 + i * 9.6, y0 + 3, 7, h - 6) }
    } else if (tipo === 'ups') {
      g.fillStyle = '#18181b'; g.fillRect(8, y0, 240, h)
      g.fillStyle = '#0c4a6e'; g.fillRect(100, y0 + 6, 56, 18); g.fillStyle = '#7dd3fc'; g.font = '600 11px system-ui'; g.fillText('100%', 112, y0 + 19)
      for (let i = 0; i < 16; i++) { g.fillStyle = '#27272a'; g.fillRect(14 + i * 14, y0 + h - 10, 10, 4) }
    } else if (tipo === 'monitor') {
      g.fillStyle = '#27272a'; g.fillRect(8, y0, 240, h)
    }
    if (tipo !== 'vazio' && tipo !== 'patch') linhas.push({ y: (y + n / 2) / unidades, tipo })
    y += n
  }
  // furos de fixação nas laterais
  g.fillStyle = '#3f3f46'; for (let i = 0; i < unidades * 3; i++) { g.fillRect(2, i * u / 3 + 2, 4, 3); g.fillRect(250, i * u / 3 + 2, 4, 3) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  return { t, linhas }
}

export function montarDispositivo(e, { x, z, ry, w, d, ALT, noite, sobreMovel }) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry
  const ligado = e.ligado !== false
  const cor = e.cor || null
  const leds = [], giram = []
  const preto = mat(0x18181b, 0.45), cinza = mat(0x3f3f46, 0.5), metal = mat(0xd4d4d8, 0.3, 0.7)
  const corpoM = (padrao, rough = 0.5, m = 0.05) => mat(cor || padrao, rough, m)
  const led = (pai, cx, cy, cz, c, piscar = true, r = 0.008) => {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), ligado ? brilho(c) : mat(0x27272a, 0.4))
    o.position.set(cx, cy, cz); pai.add(o); if (ligado && piscar) leds.push({ m: o, fase: Math.random() * 10, vel: 2 + Math.random() * 9 }); return o
  }
  // apoio baixo para itens de mesa que não estão em cima de um móvel
  const apoio = () => {
    if (sobreMovel) return 0.76
    const m = mat(0x8a6440, 0.6)
    caixa(g, 0.5, 0.03, 0.4, m, 0, 0.7, 0); for (const sx of [-0.22, 0.22]) caixa(g, 0.03, 0.69, 0.36, mat(0x52525b, 0.6), sx, 0.345, 0)
    return 0.715
  }
  let alvo = [Math.max(w, 0.3), 1.2, Math.max(d, 0.3), 0.6]
  const modelo = e.modelo || ''

  if (e.tipo === 'rack') {
    const U = /24U/.test(modelo) ? 24 : 42, aberto = /aberto/i.test(modelo)
    const H = U * 0.0445 + 0.2, L = Math.max(0.55, w), P = Math.max(0.6, d)
    const corpo = corpoM(0x18181b, 0.45, 0.3)
    if (aberto) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) caixa(g, 0.04, H, 0.04, corpo, sx * (L / 2 - 0.02), H / 2, sz * (P / 2 - 0.02))
      for (const yy of [0.04, H - 0.02]) caixa(g, L, 0.04, P, corpo, 0, yy, 0)
    } else {
      caixa(g, L, H, 0.02, corpo, 0, H / 2, -P / 2 + 0.01)
      for (const sx of [-1, 1]) caixa(g, 0.02, H, P, corpo, sx * (L / 2 - 0.01), H / 2, 0)
      caixa(g, L, 0.04, P, corpo, 0, H - 0.02, 0); caixa(g, L, 0.08, P, corpo, 0, 0.04, 0)
      for (let i = 0; i < 4; i++) cilindro(g, 0.03, 0.03, 0.02, preto, -L / 4 + (i % 2) * L / 2, H + 0.01, -P / 4 + Math.floor(i / 2) * P / 2)   // ventoinhas do teto
    }
    const { t, linhas } = texturaRack(U)
    const frente = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.06, H - 0.14), new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: ligado ? 0.12 : 0.02 }))
    frente.position.set(0, (H - 0.14) / 2 + 0.09, P / 2 - 0.09); g.add(frente)
    for (const l of linhas) {
      const yy = 0.09 + (1 - l.y) * (H - 0.14)
      const n = l.tipo === 'switch' ? 6 : l.tipo === 'ups' ? 2 : 3
      for (let i = 0; i < n; i++) led(g, L / 2 - 0.12 + i * 0.018 * (l.tipo === 'switch' ? -1 : 1) - (l.tipo === 'switch' ? 0.25 : 0), yy, P / 2 - 0.085, l.tipo === 'ups' ? 0x22c55e : i % 3 === 2 ? 0x3b82f6 : 0x22c55e, l.tipo !== 'ups', 0.006)
    }
    if (!aberto) {
      // porta de vidro fumê com puxador
      const porta = new THREE.Mesh(new THREE.BoxGeometry(L - 0.03, H - 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.35, roughness: 0.08, metalness: 0.2, depthWrite: false }))
      porta.position.set(0, H / 2, P / 2 - 0.005); porta.renderOrder = 2; g.add(porta)
      caixa(g, L, 0.03, 0.03, corpo, 0, H - 0.05, P / 2 - 0.005); caixa(g, L, 0.03, 0.03, corpo, 0, 0.09, P / 2 - 0.005)
      caixa(g, 0.02, 0.22, 0.03, metal, L / 2 - 0.06, H * 0.55, P / 2 + 0.01)
    }
    // cabos saindo pelo teto
    const cores = [0x2563eb, 0xeab308, 0x16a34a]
    cores.forEach((c, i) => cilindro(g, 0.012, 0.012, ALT - H, mat(c, 0.7), -0.1 + i * 0.05, H + (ALT - H) / 2, -P / 2 + 0.12, 8))
    alvo = [L, H, P, H / 2]
  } else if (e.tipo === 'roteador') {
    const parede = /parede/i.test(modelo), mesh = /mesh/i.test(modelo)
    const y = parede ? 2.0 : apoio()
    const corpo = corpoM(0x18181b, 0.35)
    if (mesh) {
      arred(g, 0.11, 0.2, 0.11, 0.04, corpoM(0xf8fafc, 0.4), 0, y + 0.1, 0)
      led(g, 0, y + 0.19, 0.056, 0x22d3ee, false, 0.01)
    } else {
      arred(g, 0.26, 0.04, 0.16, 0.012, corpo, 0, y + (parede ? 0 : 0.02), parede ? -d / 2 + 0.1 : 0)
      for (let i = 0; i < 4; i++) {
        const a = cilindro(g, 0.007, 0.009, 0.17, corpo, -0.1 + i * 0.066, y + 0.1, (parede ? -d / 2 + 0.1 : 0) - 0.07, 8)
        a.rotation.x = -0.15 + (i % 2) * 0.1; a.rotation.z = (i - 1.5) * 0.12
      }
      for (let i = 0; i < 5; i++) led(g, -0.08 + i * 0.04, y + (parede ? 0 : 0.02), (parede ? -d / 2 + 0.1 : 0) + 0.081, i === 0 ? 0x22c55e : 0x3b82f6, i > 0, 0.005)
    }
    alvo = [0.4, 0.4, 0.3, y + 0.1]
  } else if (e.tipo === 'nobreak') {
    const alto = /3 kVA/.test(modelo) ? 0.62 : 0.42
    arred(g, 0.2, alto, 0.42, 0.015, corpoM(0x18181b, 0.45), 0, alto / 2, 0)
    const vis = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), ligado ? brilho(0x38bdf8, 0.8) : mat(0x111827))
    vis.position.set(0, alto - 0.1, 0.212); g.add(vis)
    caixa(g, 0.035, 0.035, 0.01, cinza, 0, alto - 0.18, 0.212)
    led(g, 0.05, alto - 0.18, 0.214, 0x22c55e, false, 0.006)
    alvo = [0.3, alto, 0.5, alto / 2]
  } else if (e.tipo === 'impressora') {
    if (/piso/i.test(modelo)) {
      const corpo = corpoM(0xe5e7eb, 0.55)
      arred(g, 0.6, 0.62, 0.55, 0.02, mat(0x52525b, 0.6), 0, 0.31, 0)   // gabinete de bandejas
      for (let i = 0; i < 3; i++) { caixa(g, 0.56, 0.005, 0.01, preto, 0, 0.18 + i * 0.16, 0.277); caixa(g, 0.14, 0.02, 0.02, cinza, 0, 0.13 + i * 0.16, 0.285) }
      arred(g, 0.6, 0.38, 0.55, 0.03, corpo, 0, 0.81, 0)
      caixa(g, 0.42, 0.04, 0.3, preto, 0, 0.73, 0.2)   // saída de papel
      caixa(g, 0.3, 0.004, 0.22, mat(0xffffff, 0.9), 0, 0.755, 0.18)
      arred(g, 0.58, 0.08, 0.52, 0.02, corpo, 0, 1.04, 0)   // scanner
      const painel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.12), ligado ? brilho(0x60a5fa, 0.6) : preto); painel.position.set(0.15, 1.09, 0.22); painel.rotation.x = -0.5; g.add(painel)
      led(g, 0.27, 1.07, 0.27, 0x22c55e, false, 0.007)
      alvo = [0.65, 1.1, 0.6, 0.55]
    } else {
      const y = apoio()
      arred(g, 0.42, 0.16, 0.32, 0.02, corpoM(0x27272a, 0.5), 0, y + 0.08, 0)
      caixa(g, 0.24, 0.12, 0.004, mat(0xffffff, 0.9), 0, y + 0.2, -0.12, -0.3)
      led(g, 0.17, y + 0.12, 0.161, 0x22c55e, false, 0.006)
      alvo = [0.5, 0.4, 0.4, y + 0.1]
    }
  } else if (e.tipo === 'projetor') {
    const y = ALT - 0.32
    cilindro(g, 0.02, 0.02, ALT - y - 0.08, metal, 0, y + (ALT - y) / 2 + 0.04, 0, 10)
    caixa(g, 0.18, 0.02, 0.18, metal, 0, ALT - 0.01, 0)
    arred(g, 0.34, 0.1, 0.26, 0.025, corpoM(0xf8fafc, 0.4), 0, y, 0)
    const lente = cilindro(g, 0.035, 0.04, 0.03, preto, 0.08, y, 0.14, 20); lente.rotation.x = Math.PI / 2
    const vidro = new THREE.Mesh(new THREE.CircleGeometry(0.03, 20), ligado ? brilho(0xfef9c3, 2) : mat(0x1e3a8a, 0.1)); vidro.position.set(0.08, y, 0.156); g.add(vidro)
    if (ligado) {
      const feixe = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff7d6, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }))
      feixe.rotation.x = -Math.PI / 2 - 0.12; feixe.position.set(0.08, y - 0.2, 0.156 + 1.6); g.add(feixe)
    }
    led(g, -0.12, y + 0.02, 0.131, 0x22c55e, false, 0.006)
    alvo = [0.45, 0.4, 0.4, y]
  } else if (e.tipo === 'camera') {
    if (/dome/i.test(modelo)) {
      const y = ALT - 0.01
      cilindro(g, 0.08, 0.08, 0.02, corpoM(0xf8fafc, 0.4), 0, y, 0)
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0f172a, transparent: true, opacity: 0.75, roughness: 0.05 }))
      cup.position.y = y - 0.01; g.add(cup)
      led(g, 0.04, y - 0.03, 0.03, 0xef4444, true, 0.005)
      alvo = [0.25, 0.2, 0.25, y - 0.05]
    } else {
      const y = ALT - 0.25
      caixa(g, 0.08, 0.08, 0.02, corpoM(0xf8fafc), 0, y + 0.06, -d / 2 + 0.01)
      const braco = cilindro(g, 0.012, 0.012, 0.12, corpoM(0xf8fafc), 0, y + 0.03, -d / 2 + 0.07, 10); braco.rotation.x = Math.PI / 2.6
      const corpo = arred(g, 0.08, 0.08, 0.2, 0.02, corpoM(0xf8fafc, 0.4), 0, y, -d / 2 + 0.16); corpo.rotation.x = 0.35
      led(g, 0.025, y - 0.035, -d / 2 + 0.26, 0xef4444, true, 0.005)
      alvo = [0.25, 0.25, 0.4, y]
    }
  } else if (e.tipo === 'alexa') {
    const y = apoio()
    const corpo = corpoM(0x475569, 0.85)
    const anel = ligado ? brilho(0x22d3ee, 1.4) : mat(0x334155)
    if (/cilindro/i.test(modelo)) {
      cilindro(g, 0.05, 0.05, 0.15, corpo, 0, y + 0.075, 0, 28)
      const a = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 8, 28), anel); a.rotation.x = Math.PI / 2; a.position.y = y + 0.152; g.add(a)
      if (ligado) leds.push({ m: a, fase: 0, vel: 1.2, suave: true })
    } else if (/tela/i.test(modelo)) {
      const c = arred(g, 0.2, 0.13, 0.09, 0.02, corpo, 0, y + 0.065, 0); c.rotation.x = -0.25
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.095), ligado ? brilho(0x0ea5e9, 0.55) : mat(0x0b1220)); tela.position.set(0, y + 0.075, 0.036); tela.rotation.x = -0.25; g.add(tela)
    } else {
      const esf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.85), corpo); esf.position.y = y + 0.045; esf.castShadow = true; g.add(esf)
      const a = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 24), anel); a.rotation.x = Math.PI / 2; a.position.y = y + 0.004; g.add(a)
      if (ligado) leds.push({ m: a, fase: 0, vel: 1.2, suave: true })
    }
    alvo = [0.3, 0.3, 0.3, y + 0.1]
  } else if (e.tipo === 'quadro') {
    const grande = /180/.test(modelo), L = grande ? 1.8 : 1.2, H = grande ? 1.2 : 0.9, y = 0.95 + H / 2
    caixa(g, L + 0.04, H + 0.04, 0.025, metal, 0, y, -d / 2 + 0.015)
    caixa(g, L, H, 0.012, mat(cor || 0xf8fafc, 0.25), 0, y, -d / 2 + 0.032)
    caixa(g, L * 0.7, 0.03, 0.06, metal, 0, y - H / 2 - 0.02, -d / 2 + 0.05)
    ;[0x1d4ed8, 0x111827, 0xb91c1c].forEach((c, i) => cilindro(g, 0.008, 0.008, 0.12, mat(c, 0.5), -0.15 + i * 0.05, y - H / 2 + 0.0, -d / 2 + 0.06, 8).rotation.z = Math.PI / 2)
    alvo = [L, H, 0.2, y]
  } else if (e.tipo === 'ventilador') {
    const base = cilindro(g, 0.17, 0.19, 0.04, corpoM(0x18181b, 0.4), 0, 0.02, 0, 28); base.castShadow = true
    cilindro(g, 0.015, 0.015, 1.05, metal, 0, 0.55, 0, 10)
    arred(g, 0.12, 0.12, 0.16, 0.03, corpoM(0x18181b, 0.4), 0, 1.1, -0.02)
    const grade = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 6, 40), metal); grade.position.set(0, 1.1, 0.1); g.add(grade)
    const helice = new THREE.Group(); helice.position.set(0, 1.1, 0.08); g.add(helice)
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.006), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.75 })); p.position.y = 0.09; const b = new THREE.Group(); b.rotation.z = (i * Math.PI * 2) / 3; b.add(p); helice.add(b) }
    if (ligado) giram.push({ o: helice, eixo: 'z', vel: 18 })
    alvo = [0.45, 1.35, 0.45, 0.65]
  } else if (e.tipo === 'purificador') {
    cilindro(g, 0.13, 0.14, 0.62, corpoM(0xf8fafc, 0.45), 0, 0.31, 0, 32)
    cilindro(g, 0.12, 0.12, 0.012, preto, 0, 0.625, 0, 28)
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 8, 32), ligado ? brilho(0x22c55e, 1.2) : mat(0x334155)); a.rotation.x = Math.PI / 2; a.position.y = 0.633; g.add(a)
    if (ligado) leds.push({ m: a, fase: 0, vel: 0.8, suave: true })
    alvo = [0.35, 0.7, 0.35, 0.35]
  } else if (e.tipo === 'bebedouro') {
    arred(g, 0.32, 1.0, 0.32, 0.02, corpoM(0xf8fafc, 0.4), 0, 0.5, 0)
    caixa(g, 0.2, 0.01, 0.06, mat(0x9ca3af, 0.3, 0.6), 0, 0.62, 0.17)
    for (const sx of [-0.05, 0.05]) caixa(g, 0.03, 0.04, 0.03, mat(sx < 0 ? 0x2563eb : 0xdc2626, 0.4), sx, 0.75, 0.165)
    const galao = cilindro(g, 0.13, 0.13, 0.4, new THREE.MeshPhysicalMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.55, roughness: 0.05, transmission: 0.3 }), 0, 1.22, 0, 28)
    galao.castShadow = false
    cilindro(g, 0.05, 0.13, 0.06, galao.material, 0, 1.0, 0, 28)
    alvo = [0.4, 1.45, 0.4, 0.72]
  } else if (e.tipo === 'frigobar') {
    const corpo = corpoM(0xf8fafc, 0.35)
    arred(g, 0.48, 0.85, 0.5, 0.025, corpo, 0, 0.425, 0)
    caixa(g, 0.46, 0.005, 0.01, mat(0x9ca3af), 0, 0.62, 0.252)
    caixa(g, 0.025, 0.3, 0.035, metal, 0.19, 0.42, 0.265)
    alvo = [0.55, 0.9, 0.55, 0.45]
  } else if (e.tipo === 'cadeira') {
    const m = corpoM(0x334155, 0.6)
    arred(g, 0.48, 0.07, 0.46, 0.02, m, 0, 0.47, 0)
    const enc = arred(g, 0.46, 0.55, 0.06, 0.025, m, 0, 0.8, -0.22); enc.rotation.x = -0.1
    cilindro(g, 0.025, 0.025, 0.36, metal, 0, 0.26, 0, 10)
    for (let i = 0; i < 5; i++) { const p = new THREE.Group(); p.rotation.y = (i * Math.PI * 2) / 5; g.add(p); caixa(p, 0.03, 0.025, 0.3, preto, 0, 0.06, 0.14); const rd = cilindro(p, 0.025, 0.025, 0.02, preto, 0, 0.025, 0.28, 10); rd.rotation.z = Math.PI / 2 }
    alvo = [0.55, 1.1, 0.55, 0.55]
  }

  const hit = new THREE.Mesh(new THREE.BoxGeometry(alvo[0], alvo[1], alvo[2]), new THREE.MeshBasicMaterial({ visible: false }))
  hit.position.y = alvo[3]; hit.userData = { tipo: 'item', id: e.id }; g.add(hit)
  return { g, leds, giram, hit, noite }
}

// anima LEDs (piscar ou respirar) e hélices
export function animarDispositivos(lista, dt, t) {
  for (const d of lista) {
    for (const l of d.leds) {
      const k = l.suave ? 0.9 + Math.sin(t * l.vel + l.fase) * 0.6 : (Math.sin(t * l.vel + l.fase) > 0.2 ? 2 : 0.15)
      l.m.material.emissiveIntensity = k
    }
    for (const q of d.giram) q.o.rotation[q.eixo] += q.vel * dt
  }
}
