// Som da nave, gerado na hora pelo Web Audio (sem arquivo de áudio): ronco do motor (ruído marrom filtrado + dois
// osciladores graves), que sobe com o acelerador e o turbo; bipes da contagem regressiva; o "rasgo" do salto
// hipersônico; e um fundo de sintetizador na outra dimensão. O navegador só deixa tocar depois de um clique ou tecla:
// por isso `iniciar()` é chamado nos cliques e nas teclas da nave. Tudo leve: meia dúzia de nós de áudio.
const CHAVE = 'clima-nave-mudo'

export function criarSom() {
  let ctx = null, mestre, motorG, filtro, osc = [], oscG, oscF, pad = null
  let mudo = false
  try { mudo = localStorage.getItem(CHAVE) === '1' } catch { /* sem armazenamento */ }

  const iniciar = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    mestre = ctx.createGain(); mestre.gain.value = mudo ? 0 : 0.55; mestre.connect(ctx.destination)
    // ruído marrom (grave e encorpado, como turbina distante)
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
    let ult = 0
    for (let i = 0; i < n; i++) { const b = Math.random() * 2 - 1; ult = (ult + 0.02 * b) / 1.02; d[i] = ult * 3.2 }
    const ruido = ctx.createBufferSource(); ruido.buffer = buf; ruido.loop = true
    filtro = ctx.createBiquadFilter(); filtro.type = 'lowpass'; filtro.frequency.value = 220; filtro.Q.value = 0.8
    motorG = ctx.createGain(); motorG.gain.value = 0
    ruido.connect(filtro); filtro.connect(motorG); motorG.connect(mestre); ruido.start()
    // dois dente-de-serra levemente desafinados: o "zumbido" do motor
    oscF = ctx.createBiquadFilter(); oscF.type = 'lowpass'; oscF.frequency.value = 320
    oscG = ctx.createGain(); oscG.gain.value = 0
    oscF.connect(oscG); oscG.connect(mestre)
    osc = [48, 48.7].map((f) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(oscF); o.start(); return o })
  }

  // c = { ligado, empuxo 0..1, boost, dobra 0..1 }: alvo suave (setTargetAtTime), chamado várias vezes por segundo
  const atualizar = (c) => {
    if (!ctx) return
    const t = ctx.currentTime
    const e = c.ligado ? c.empuxo : 0, b = c.ligado && c.boost ? 1 : 0, dob = c.dobra || 0
    motorG.gain.setTargetAtTime(c.ligado ? 0.06 + e * 0.32 + b * 0.18 + dob * 0.2 : 0, t, 0.18)
    filtro.frequency.setTargetAtTime(180 + e * 800 + b * 1400 + dob * 2200, t, 0.25)
    oscG.gain.setTargetAtTime(c.ligado ? 0.015 + e * 0.06 + b * 0.03 : 0, t, 0.2)
    osc.forEach((o, i) => o.frequency.setTargetAtTime((40 + e * 45 + b * 35 + dob * 80) * (i ? 1.015 : 1), t, 0.3))
    oscF.frequency.setTargetAtTime(260 + e * 500 + b * 700, t, 0.25)
  }

  const bipe = (agudo = false) => {
    if (!ctx) return
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.value = agudo ? 1320 : 880
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + (agudo ? 0.6 : 0.16))
    o.connect(g); g.connect(mestre); o.start(t); o.stop(t + 0.7)
  }

  // salto: ruído com filtro que varre de grave a agudo e um tom que sobe (1,6 s)
  const salto = () => {
    if (!ctx) return
    const t = ctx.currentTime
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const r = ctx.createBufferSource(); r.buffer = buf
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(150, t); bp.frequency.exponentialRampToValueAtTime(6000, t + 1.5)
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.9); g.gain.exponentialRampToValueAtTime(0.001, t + 1.9)
    r.connect(bp); bp.connect(g); g.connect(mestre); r.start(t); r.stop(t + 2)
    const o = ctx.createOscillator(), og = ctx.createGain()
    o.type = 'triangle'; o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(1600, t + 1.5)
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.18, t + 1.2); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
    o.connect(og); og.connect(mestre); o.start(t); o.stop(t + 1.9)
  }

  // fundo da outra dimensão: acorde aberto que respira devagar
  const dimensao = (ligar) => {
    if (!ctx) return
    const t = ctx.currentTime
    if (ligar && !pad) {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 3)
      const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 0.12; lfoG.gain.value = 0.035; lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start()
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900
      const os = [110, 164.81, 207.65, 329.63].map((fr, i) => { const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = fr * (1 + (i - 1.5) * 0.002); o.connect(f); o.start(); return o })
      f.connect(g); g.connect(mestre)
      pad = { g, os: [...os, lfo] }
    } else if (!ligar && pad) {
      const p = pad; pad = null
      p.g.gain.setTargetAtTime(0, t, 0.5)
      setTimeout(() => p.os.forEach((o) => { try { o.stop() } catch { /* já parou */ } }), 2500)
    }
  }

  const definirMudo = (v) => {
    mudo = v
    try { localStorage.setItem(CHAVE, v ? '1' : '0') } catch { /* sem armazenamento */ }
    if (ctx) mestre.gain.setTargetAtTime(v ? 0 : 0.55, ctx.currentTime, 0.1)
  }

  const pausar = (v) => { if (ctx) (v ? ctx.suspend() : ctx.resume()).catch(() => {}) }
  const descartar = () => { if (ctx) { ctx.close().catch(() => {}); ctx = null; pad = null } }
  return { iniciar, atualizar, bipe, salto, dimensao, definirMudo, mudo: () => mudo, pausar, descartar }
}
