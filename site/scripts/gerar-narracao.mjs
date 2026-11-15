// Gera a narração do vídeo explicativo com o Fish Audio: um MP3 por capítulo em public/audio e lib/narracao.json
// (duração de cada áudio, usada para o ritmo das cenas). Rode de novo quando mudar as falas em lib/falas.js.
// A chave vem de FISH_API_KEY ou de ../docs/credentials/fish-audio.md (fora do Git) e nunca entra no site.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { FALAS, VOZ } from '../lib/falas.js'

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const chave = process.env.FISH_API_KEY || (fs.readFileSync(path.join(raiz, '../docs/credentials/fish-audio.md'), 'utf8').match(/sk-[A-Za-z0-9_-]{20,}/) || [])[0]
if (!chave) throw new Error('Sem chave do Fish Audio (FISH_API_KEY ou docs/credentials/fish-audio.md).')
const duracoes = {}
for (const [id, texto] of Object.entries(FALAS)) {
  const r = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', model: VOZ.modelo },
    body: JSON.stringify({ text: texto, reference_id: VOZ.id, format: 'mp3', mp3_bitrate: 128, normalize: true }),
  })
  if (!r.ok) throw new Error(`${id}: ${r.status} ${await r.text()}`)
  const arq = path.join(raiz, 'public/audio', `narracao-${id}.mp3`)
  fs.writeFileSync(arq, Buffer.from(await r.arrayBuffer()))
  const info = execFileSync('afinfo', [arq]).toString()
  duracoes[id] = Math.round(parseFloat(info.match(/estimated duration: ([\d.]+)/)[1]) * 100) / 100
  console.log(id, duracoes[id], 's')
}
fs.writeFileSync(path.join(raiz, 'lib/narracao.json'), JSON.stringify({ voz: VOZ.nome, gerado_em: new Date().toISOString(), duracoes }, null, 2))
