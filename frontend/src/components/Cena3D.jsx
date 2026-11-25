import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const COR_MODO = { frio: 0x4ea8ff, quente: 0xff8a3d, seco: 0x9ad1c8, ventilar: 0xd4d4d8, auto: 0x5eead4 }
const NOME_MODO = { frio: 'FRIO', quente: 'QUENTE', seco: 'SECO', ventilar: 'VENT', auto: 'AUTO' }
const VEL_VENT = { auto: 1, baixa: 0.6, media: 1, alta: 1.6 }
const N = 1100

// `forcado` vem do tema do React: na troca, o efeito daqui roda antes de a classe `dark` mudar no <html>.
function tema(forcado) {
  const escuro = typeof forcado === 'boolean' ? forcado : document.documentElement.classList.contains('dark')
  return { corpo: escuro ? 0xe9e9ec : 0xfbfbfb, aba: escuro ? 0xd2d2d7 : 0xe6e6ea, parede: escuro ? 0x141416 : 0xf0f0f2, escuro }
}

// Painel digital do aparelho (textura desenhada em canvas).
// Ligado: temperatura ajustada (com contagem animada), modo, ventilação e a temperatura de fora.
// Desligado: modo espera, mostra o ajuste guardado (igual ao controle), a temperatura de fora pequena e o relógio, em brilho baixo.
function criarPainel() {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 192
  const textura = new THREE.CanvasTexture(canvas)
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 4
  const desenhar = (estado, brilho, mostrada, varredura) => {
    const g = canvas.getContext('2d')
    g.clearRect(0, 0, 512, 192)
    g.fillStyle = '#07090b'; g.fillRect(0, 0, 512, 192)
    const temExt = estado.externa != null
    const ext = temExt ? `${Math.round(estado.externa)}°` : '--°'
    g.textBaseline = 'middle'
    if (brilho < 0.5) {
      // espera: o AJUSTE guardado (o mesmo número do controle ao lado), a temperatura de fora pequena e o relógio.
      // Antes o número grande era a de fora e parecia que o 3D e o controle discordavam (22/11/2026).
      const a = 0.55 * (1 - brilho * 2)
      g.globalAlpha = a
      g.fillStyle = '#9fd3ff'; g.shadowColor = '#4ea8ff'; g.shadowBlur = 16
      g.font = '600 118px ui-monospace, Menlo, monospace'
      g.fillText(`${estado.temperatura ?? '--'}°`, 26, 104)
      g.shadowBlur = 8; g.font = '600 30px -apple-system, sans-serif'
      g.fillText('AJUSTE', 340, 46)
      const agora = new Date()
      g.fillText(`${String(agora.getHours()).padStart(2, '0')}${agora.getSeconds() % 2 ? ':' : ' '}${String(agora.getMinutes()).padStart(2, '0')}`, 340, 92)
      g.font = '500 26px -apple-system, sans-serif'
      if (temExt) g.fillText(`FORA ${ext}${estado.umidade != null ? ` ${Math.round(estado.umidade)}%` : ''}`, 340, 140)
    }
    if (brilho > 0.02) {
      const cor = `#${(COR_MODO[estado.modo] ?? 0x4ea8ff).toString(16).padStart(6, '0')}`
      g.globalAlpha = Math.min(1, brilho)
      g.fillStyle = cor; g.shadowColor = cor; g.shadowBlur = 26
      g.font = '600 124px ui-monospace, Menlo, monospace'
      g.fillText(`${mostrada}°`, 22, 104)
      g.shadowBlur = 10; g.font = '600 38px -apple-system, sans-serif'
      g.fillText(NOME_MODO[estado.modo] ?? '', 330, 56)
      g.fillText(`V${{ baixa: 1, media: 2, alta: 3 }[estado.ventilador] ?? 'A'}`, 330, 104)
      g.font = '500 28px -apple-system, sans-serif'; g.globalAlpha = Math.min(1, brilho) * 0.75
      if (temExt) g.fillText(`EXT ${ext}`, 330, 150)
      // barras de potência da ventilação
      const n = { baixa: 1, media: 2, alta: 3 }[estado.ventilador] ?? 2
      for (let i = 0; i < 3; i++) { g.globalAlpha = Math.min(1, brilho) * (i < n ? 0.9 : 0.2); g.fillRect(430 + i * 18, 118 - i * 10, 12, 16 + i * 10) }
    }
    // reflexo que atravessa o vidro do display
    g.globalAlpha = 0.07; g.shadowBlur = 0
    const x = varredura * 700 - 100
    const grad = g.createLinearGradient(x, 0, x + 80, 0)
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(0.5, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad; g.fillRect(0, 0, 512, 192)
    g.globalAlpha = 1
    textura.needsUpdate = true
  }
  return { textura, desenhar }
}

// Textura de névoa (gradiente vertical suave) para o jato de ar frio.
function texturaNevoa() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256
  const g = c.getContext('2d')
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256)
  const lateral = g.createLinearGradient(0, 0, 64, 0)
  lateral.addColorStop(0, 'rgba(0,0,0,1)'); lateral.addColorStop(0.2, 'rgba(0,0,0,0)'); lateral.addColorStop(0.8, 'rgba(0,0,0,0)'); lateral.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = lateral; g.fillRect(0, 0, 64, 256)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Ar-condicionado split em 3D, animado o tempo todo. `estado` = { ligado, modo, ventilador, temperatura }.
export default function Cena3D({ estado, className = '', escuro, modeloId = null }) {
  const ref = useRef(null)
  const estadoRef = useRef(estado)
  estadoRef.current = estado

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const amp = calmo ? 0.4 : 1
    const t = tema(escuro)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)

    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
    camera.position.set(0, 0.3, 7.2)

    cena.add(new THREE.HemisphereLight(0xffffff, t.escuro ? 0x1c1c20 : 0xd8d8de, t.escuro ? 1.0 : 1.5))
    const sol = new THREE.DirectionalLight(0xffffff, t.escuro ? 1.3 : 1.7)
    sol.position.set(3, 4, 5)
    cena.add(sol)
    const brilho = new THREE.PointLight(0xffffff, 0, 6) // reflexo que percorre a carcaça
    cena.add(brilho)
    const luzModo = new THREE.PointLight(0x4ea8ff, 0, 5) // luz da cor do modo saindo da grelha
    cena.add(luzModo)

    // ---- unidade interna ----
    const unidade = new THREE.Group()
    const matCorpo = new THREE.MeshStandardMaterial({ color: t.corpo, roughness: 0.38, metalness: 0.06 })
    unidade.add(new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.15, 0.9, 6, 0.22), matCorpo))
    const frente = new THREE.Mesh(new RoundedBoxGeometry(4.0, 0.62, 0.06, 4, 0.03), new THREE.MeshStandardMaterial({ color: t.corpo, roughness: 0.28 }))
    frente.position.set(0, 0.16, 0.46)
    unidade.add(frente)
    const painel = criarPainel()
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 0.33), new THREE.MeshBasicMaterial({ map: painel.textura, transparent: true }))
    tela.position.set(1.28, 0.17, 0.495)
    unidade.add(tela)
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 16), new THREE.MeshBasicMaterial({ color: 0x3f3f46 }))
    led.position.set(1.84, 0.02, 0.5)
    unidade.add(led)
    // faixa de luz sob a grelha (cor do modo) e névoa do jato de ar
    const faixa = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.035), new THREE.MeshBasicMaterial({ color: 0x4ea8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    faixa.position.set(0, -0.5, 0.47)
    unidade.add(faixa)
    const nevoas = []
    const texNevoa = texturaNevoa()
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.9 - i * 0.3, 1.6), new THREE.MeshBasicMaterial({ map: texNevoa, color: 0x9fd3ff, transparent: true, opacity: 0,
        depthWrite: false, blending: t.escuro ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide }))
      m.position.set(0, -1.2, 0.95 + i * 0.12)
      m.rotation.x = -0.55 - i * 0.12
      unidade.add(m)
      nevoas.push(m)
    }
    // aleta principal (abre ao ligar e faz o swing)
    const pivoAba = new THREE.Group()
    pivoAba.position.set(0, -0.36, 0.44)
    const aba = new THREE.Mesh(new RoundedBoxGeometry(3.7, 0.18, 0.05, 2, 0.02), new THREE.MeshStandardMaterial({ color: t.aba, roughness: 0.45 }))
    aba.position.set(0, -0.08, 0)
    pivoAba.add(aba)
    unidade.add(pivoAba)
    // palhetas verticais da grelha (abanam quando ligado)
    const palhetas = []
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.13, 0.08), new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.6 }))
      p.position.set(-1.6 + i * 0.246, -0.42, 0.36)
      unidade.add(p)
      palhetas.push(p)
    }
    unidade.position.y = 1.0
    cena.add(unidade)

    // modelo 3D da marca (Avatares → espécie Ar-condicionado → "Usar nos ares"): entra no lugar da carcaça desenhada,
    // com a mesma tela de temperatura e o mesmo fluxo de ar. O arquivo fica no cache do navegador (não baixa de novo).
    const matsModelo = []
    if (modeloId) {
      import('./avatares/AvatarViewer').then(({ carregarAvatar }) => carregarAvatar(modeloId)).then((gl) => {
        if (!ref.current) return
        const m = gl.scene.clone(true)
        const caixa = new THREE.Box3().setFromObject(m), tam = caixa.getSize(new THREE.Vector3())
        const esc = 4.2 / Math.max(0.01, tam.x)
        m.scale.setScalar(esc)
        m.position.set(-(caixa.min.x + tam.x / 2) * esc, -(caixa.min.y + tam.y / 2) * esc + 0.05, -0.45 - caixa.min.z * esc)
        m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); matsModelo.push(o.material) } })
        const frenteZ = -0.45 + tam.z * esc
        ;[unidade.children[0], frente, led, pivoAba, contorno, ...palhetas].forEach((o) => { o.visible = false })
        tela.position.set(1.3, 0.2, frenteZ + 0.012)
        faixa.position.z = frenteZ - 0.05
        unidade.add(m)
        corAtual = '\u0000'   // reaplica a cor escolhida no mapa ao modelo
      }).catch((e) => { console.warn("modelo do ar:", e?.message) /* fica o desenho */ })
    }

    const parede = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: t.parede, roughness: 1 }))
    parede.position.z = -0.5
    cena.add(parede)
    // ar de cor escura (preto, grafite): luz suave na parede atrás, luz de recorte e contorno fino para ler a silhueta
    const texHalo = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c) })()
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.2), new THREE.MeshBasicMaterial({ map: texHalo, color: t.escuro ? 0x9fb4c8 : 0xffffff, transparent: true, opacity: 0, depthWrite: false }))
    halo.position.set(0, 1.0, -0.45); cena.add(halo)
    const recorte = new THREE.DirectionalLight(0xdfe9ff, 0); recorte.position.set(-2, 3, -3); cena.add(recorte)
    const recorte2 = new THREE.DirectionalLight(0xdfe9ff, 0); recorte2.position.set(3, 1.5, -2.5); cena.add(recorte2)
    const frontal = new THREE.DirectionalLight(0xffffff, 0); frontal.position.set(-1.5, 3, 6); cena.add(frontal)
    const contorno = new THREE.Mesh(new RoundedBoxGeometry(4.2, 1.15, 0.9, 6, 0.22), new THREE.MeshBasicMaterial({ color: 0xc9d4e0, side: THREE.BackSide, transparent: true, opacity: 0 }))
    contorno.scale.setScalar(1.012); unidade.add(contorno)

    // ---- fluxo de ar ----
    const pos = new Float32Array(N * 3)
    const vida = new Float32Array(N)
    const vel = new Float32Array(N * 3)
    const nascer = (i, espalhar) => {
      pos[i * 3] = (Math.random() - 0.5) * 3.6
      pos[i * 3 + 1] = 0.55
      pos[i * 3 + 2] = 0.5
      vel[i * 3] = (Math.random() - 0.5) * 0.18
      vel[i * 3 + 1] = -(0.35 + Math.random() * 0.4)
      vel[i * 3 + 2] = 0.55 + Math.random() * 0.55
      vida[i] = espalhar ? Math.random() : 0
    }
    for (let i = 0; i < N; i++) nascer(i, true)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const matP = new THREE.PointsMaterial({ size: 0.055, color: COR_MODO.frio, transparent: true, opacity: 0, depthWrite: false,
      blending: t.escuro ? THREE.AdditiveBlending : THREE.NormalBlending })
    const pontos = new THREE.Points(geo, matP)
    cena.add(pontos)

    // ---- interação: o aparelho acompanha o ponteiro e pode ser arrastado ----
    const ponteiro = { x: 0, y: 0 }
    let arrasto = null, giroManual = 0, giroAlvo = 0
    const mover = (e) => {
      const b = el.getBoundingClientRect()
      ponteiro.x = ((e.clientX - b.left) / b.width) * 2 - 1
      ponteiro.y = ((e.clientY - b.top) / b.height) * 2 - 1
      if (arrasto !== null) giroAlvo = arrasto.giro + (e.clientX - arrasto.x) / 160
    }
    const baixar = (e) => { arrasto = { x: e.clientX, giro: giroAlvo }; el.setPointerCapture?.(e.pointerId) }
    const soltar = () => { arrasto = null }
    const sair = () => { ponteiro.x = 0; ponteiro.y = 0 }
    el.addEventListener('pointermove', mover)
    el.addEventListener('pointerdown', baixar)
    el.addEventListener('pointerup', soltar)
    el.addEventListener('pointerleave', sair)

    const ajustar = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.position.z = camera.aspect < 1.2 ? 10 : 7.2
      camera.updateProjectionMatrix()
    }
    ajustar()
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    let visivel = true
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting })
    io.observe(el)

    const relogio = new THREE.Clock()
    let abertura = 0, intensidade = 0, pulso = 0, ultimoLigado = null, quadro
    let ultimoPainel = ''
    let corAtual = ''
    let brilhoEscuro = false
    let mostrada = estadoRef.current?.temperatura ?? 23
    const cor = new THREE.Color()
    const laco = () => {
      quadro = requestAnimationFrame(laco)
      if (!visivel || document.hidden) return
      const dt = Math.min(relogio.getDelta(), 0.05)
      const tempo = relogio.elapsedTime
      const e = estadoRef.current || {}
      // cor da carcaça escolhida no mapa (Editar planta → ar → cor)
      if ((e.cor || '') !== corAtual) {
        corAtual = e.cor || ''
        const c = new THREE.Color(corAtual || t.corpo)
        matsModelo.forEach((mt) => mt.color.copy(corAtual ? c : new THREE.Color(0xffffff)))
        matCorpo.color.copy(c); frente.material.color.copy(c); aba.material.color.copy(c).offsetHSL(0, 0, corAtual ? -0.04 : 0)
        if (!corAtual) aba.material.color.setHex(t.aba)
        const escura = c.getHSL({}).l < 0.4
        matCorpo.metalness = corAtual === '#9ca3af' ? 0.55 : escura ? 0.25 : 0.06; matCorpo.roughness = escura ? 0.22 : 0.38   // escura: preto piano, brilho mostra o volume
        frente.material.roughness = escura ? 0.16 : 0.28
        halo.material.opacity = escura ? (t.escuro ? 0.42 : 0.12) : 0
        recorte.intensity = escura ? 2.2 : 0; recorte2.intensity = escura ? 1.4 : 0; frontal.intensity = escura ? 1.6 : 0
        contorno.material.opacity = escura ? (t.escuro ? 0.22 : 0.12) : 0
        brilhoEscuro = escura
      }
      const ligado = !!e.ligado

      if (ultimoLigado !== null && ultimoLigado !== ligado) pulso = 1 // ligou ou desligou: pequeno "pulo"
      ultimoLigado = ligado
      pulso = Math.max(0, pulso - dt * 2.2)

      abertura += ((ligado ? 1 : 0) - abertura) * Math.min(1, dt * 2.6)
      intensidade += ((ligado ? 1 : 0) - intensidade) * Math.min(1, dt * 2)
      const swing = ligado ? Math.sin(tempo * 0.9) * 0.18 * amp : 0
      pivoAba.rotation.x = -abertura * 0.75 + swing * abertura
      palhetas.forEach((p, i) => { p.rotation.y = ligado ? Math.sin(tempo * 0.7 + i * 0.15) * 0.45 * amp * abertura : 0 })

      // LED: verde fixo ligado; vermelho "respirando" em espera
      if (ligado) led.material.color.setHex(0x22c55e)
      else led.material.color.setRGB(0.35 + 0.5 * (0.5 + 0.5 * Math.sin(tempo * 2.2)), 0.08, 0.08)

      // painel digital: a temperatura "conta" até o ajuste quando ele muda; reflexo passa a cada ~6 s
      const alvo = e.temperatura ?? 23   // ligado ou não, o número grande é o ajuste (igual ao controle)
      mostrada += (alvo - mostrada) * Math.min(1, dt * (ligado ? 2.2 : 4))
      const varredura = ((tempo / 6) % 1)
      const segundo = Math.floor(Date.now() / 1000)
      const chave = `${ligado}|${Math.round(mostrada)}|${e.modo}|${e.ventilador}|${e.externa}|${e.umidade}|${Math.round(intensidade * 20)}|${Math.round(varredura * 40)}|${segundo}`
      if (chave !== ultimoPainel) { painel.desenhar(e, intensidade, Math.round(mostrada), varredura); ultimoPainel = chave }

      // faixa de luz e névoa acompanham o modo e a ventilação
      faixa.material.color.copy(luzModo.color)
      faixa.material.opacity = intensidade * (0.65 + 0.25 * Math.sin(tempo * 3))
      nevoas.forEach((m, i) => {
        m.material.color.copy(luzModo.color).lerp(new THREE.Color(0xffffff), 0.45)
        m.material.opacity = intensidade * (0.16 - i * 0.035) * (0.75 + 0.25 * Math.sin(tempo * (1.1 + i * 0.4) + i))
        m.scale.y = 1 + 0.08 * Math.sin(tempo * 0.8 + i) * amp
        m.position.y = -1.2 - 0.05 * Math.sin(tempo * 0.6 + i)
      })

      cor.setHex(COR_MODO[e.modo] || COR_MODO.frio)
      matP.color.lerp(cor, Math.min(1, dt * 4))
      matP.opacity = 0.85 * intensidade
      luzModo.color.lerp(cor, Math.min(1, dt * 4))
      luzModo.intensity = intensidade * 2.2
      luzModo.position.set(0, 0.35, 1.2)

      const v = (VEL_VENT[e.ventilador] || 1) * (calmo ? 0.5 : 1)
      for (let i = 0; i < N; i++) {
        vida[i] += dt * 0.35 * v
        if (vida[i] >= 1) nascer(i, false)
        const k = i * 3
        pos[k] += vel[k] * dt * v * 2.2 + Math.sin(tempo * 1.3 + i) * 0.002 * v
        pos[k + 1] += vel[k + 1] * dt * v * 2.2 - 0.02 * dt
        pos[k + 2] += vel[k + 2] * dt * v * 2.2
      }
      geo.attributes.position.needsUpdate = true

      // movimento contínuo: flutua, gira, segue o ponteiro, reflexo percorrendo a carcaça
      giroManual += (giroAlvo - giroManual) * Math.min(1, dt * 6)
      const balanco = Math.sin(tempo * 0.45) * 0.28 * amp
      unidade.rotation.y += ((balanco + ponteiro.x * 0.35 + giroManual) - unidade.rotation.y) * Math.min(1, dt * 3)
      unidade.rotation.x += ((ponteiro.y * 0.12) - unidade.rotation.x) * Math.min(1, dt * 3)
      unidade.position.y = 1.0 + Math.sin(tempo * 0.9) * 0.06 * amp + pulso * 0.08
      const escala = 1 + Math.sin(tempo * 1.1) * 0.006 * amp + pulso * 0.03
      unidade.scale.setScalar(escala)
      pontos.rotation.y = unidade.rotation.y
      brilho.position.set(Math.sin(tempo * 0.6) * 3, 1.6, 1.6)
      brilho.intensity = (ligado ? 0.6 : 1.4) * (brilhoEscuro ? 2.4 : 1) * (0.6 + 0.4 * Math.sin(tempo * 0.6 + 1.2))   // reflexo que corre pela carcaça (mais forte no preto)
      camera.position.x = Math.sin(tempo * 0.25) * 0.5 * amp
      camera.lookAt(0, 0.45, 0)
      renderer.render(cena, camera)
    }
    camera.lookAt(0, 0.45, 0)
    laco()

    return () => {
      cancelAnimationFrame(quadro)
      ro.disconnect(); io.disconnect()
      el.removeEventListener('pointermove', mover)
      el.removeEventListener('pointerdown', baixar)
      el.removeEventListener('pointerup', soltar)
      el.removeEventListener('pointerleave', sair)
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.map?.dispose?.(); o.material?.dispose?.() })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={ref} className={`h-full w-full cursor-grab touch-pan-y active:cursor-grabbing [&>canvas]:h-full [&>canvas]:w-full ${className}`} role="img" aria-label="Ar-condicionado em 3D, animado; arraste para girar" />
}
