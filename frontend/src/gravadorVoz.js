// Mensagem de voz do Assistente de IA: grava pelo microfone (MediaRecorder, funciona em qualquer navegador, inclusive no
// Brave, que não tem o reconhecimento de voz do Chrome), converte para WAV 16 kHz mono (o formato que a IA da NVIDIA
// entende) e devolve o base64 + um endereço local para tocar a gravação na conversa.
export const MAX_SEGUNDOS = 90

export async function iniciarGravacao(aoNivel) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não grava áudio.')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const rec = new MediaRecorder(stream)
  const pedacos = []
  rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data) }
  // nível do microfone para a barrinha animada
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const fonte = ctx.createMediaStreamSource(stream), analisador = ctx.createAnalyser()
  analisador.fftSize = 256; fonte.connect(analisador)
  const buf = new Uint8Array(analisador.frequencyBinCount)
  let raf = 0
  const medir = () => { analisador.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; aoNivel?.(Math.min(1, Math.sqrt(s / buf.length) / 40)); raf = requestAnimationFrame(medir) }
  medir()
  rec.start(250)
  const inicio = Date.now()
  const encerrar = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {}) }
  return {
    segundos: () => (Date.now() - inicio) / 1000,
    cancelar: () => { try { rec.stop() } catch { /* já parou */ } encerrar() },
    parar: () => new Promise((ok, falhou) => {
      rec.onstop = async () => {
        encerrar()
        try {
          const blob = new Blob(pedacos, { type: rec.mimeType || 'audio/webm' })
          ok({ ...(await paraWav(blob)), url: URL.createObjectURL(blob), segundos: Math.round((Date.now() - inicio) / 1000) })
        } catch (e) { falhou(e) }
      }
      rec.stop()
    }),
  }
}

async function paraWav(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
  ctx.close().catch(() => {})
  // reamostra para 16 kHz mono
  const taxa = 16000, n = Math.ceil(audio.duration * taxa)
  const off = new OfflineAudioContext(1, n, taxa)
  const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start()
  const dados = (await off.startRendering()).getChannelData(0)
  const wav = new DataView(new ArrayBuffer(44 + dados.length * 2))
  const txt = (o, s) => { for (let i = 0; i < s.length; i++) wav.setUint8(o + i, s.charCodeAt(i)) }
  txt(0, 'RIFF'); wav.setUint32(4, 36 + dados.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ')
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true); wav.setUint32(24, taxa, true)
  wav.setUint32(28, taxa * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true); txt(36, 'data'); wav.setUint32(40, dados.length * 2, true)
  for (let i = 0; i < dados.length; i++) { const v = Math.max(-1, Math.min(1, dados[i])); wav.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true) }
  const bytes = new Uint8Array(wav.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(bin), duracao: audio.duration }
}

// imagem anexada: reduz para no máximo 1280 px (o modelo não precisa de mais e o envio fica leve)
export async function imagemReduzida(arquivo) {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise((ok, falhou) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falhou; i.src = url })
    const k = Math.min(1, 1280 / Math.max(img.width, img.height))
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.85)
  } finally { URL.revokeObjectURL(url) }
}
