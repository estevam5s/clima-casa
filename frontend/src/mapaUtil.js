// Utilidades da planta do escritório usadas pelo Mapa e pelo Painel (planta 3D ao vivo).
const GRADE = 10
export const AR_L = 86
const snap = (v) => Math.round(v / GRADE) * GRADE
const copia = (o) => JSON.parse(JSON.stringify(o))
const salaDoPonto = (s, e) => { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h }

// Salas sem posição ganham um lugar automático (linhas da esquerda para a direita, tamanho pelo número de ares).
export function completar(mapa, projetos, ares) {
  const m = copia(mapa)
  const vagas = projetos.filter((p) => !m.salas[p.id])
  let x = 40, y = 40, alturaLinha = 0
  const ocupadas = Object.values(m.salas)
  if (ocupadas.length) y = Math.max(...ocupadas.map((s) => s.y + s.h)) + 40
  for (const p of vagas) {
    const n = ares.filter((a) => a.projeto_id === p.id).length
    const w = Math.max(320, Math.min(560, 200 + n * 130)), h = 260
    if (x + w > m.largura - 40) { x = 40; y += alturaLinha + 40; alturaLinha = 0 }
    m.salas[p.id] = { x, y, w, h }
    x += w + 40; alturaLinha = Math.max(alturaLinha, h)
  }
  const fundo = Math.max(0, ...Object.values(m.salas).map((s) => s.y + s.h))
  if (fundo + 40 > m.altura) m.altura = snap(fundo + 60)
  m.consumidos = []
  for (const p of projetos) {
    const s = m.salas[p.id]
    let sem = ares.filter((a) => a.projeto_id === p.id && !m.ares[a.id])
    // primeiro as vagas desenhadas na planta ("ar previsto" dentro da sala)
    const vagas = m.elementos.filter((e) => e.tipo === 'ar_previsto' && salaDoPonto(s, e))
    sem = sem.filter((a) => {
      const v = vagas.shift()
      if (!v) return true
      m.ares[a.id] = { x: v.x, y: v.y, rot: v.rot || 0 }; m.consumidos.push(v.id)
      return false
    })
    sem.forEach((a, i) => {
      const passo = s.w / (sem.length + 1)
      m.ares[a.id] = { x: snap(s.x + passo * (i + 1) - AR_L / 2), y: s.y + 30, rot: 0 }
    })
  }
  return m
}

