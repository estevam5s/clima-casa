// Utilidades da planta do escritório usadas pelo Mapa e pelo Painel (planta 3D ao vivo).
const GRADE = 10
export const AR_L = 86
const snap = (v) => Math.round(v / GRADE) * GRADE
const copia = (o) => JSON.parse(JSON.stringify(o))
const lim = (v, a, b) => Math.max(a, Math.min(b, v))
const salaDoPonto = (s, e) => { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h }

// Salas sem posição ganham um lugar automático (linhas da esquerda para a direita, tamanho pelo número de ares).
export function completar(mapa, projetos, ares) {
  const m = copia(mapa)
  // Projeto sem sala mas com o ar já posicionado (ex.: "Devs", um ar ao lado das mesas no salão) não ganha sala
  // inventada: no 3D ela viraria paredes que não existem.
  const semSalaPropria = (p) => ares.some((a) => a.projeto_id === p.id && m.ares[a.id])
  const vagas = projetos.filter((p) => !m.salas[p.id] && !semSalaPropria(p))
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
    if (!s) continue   // projeto sem sala própria: os ares dele já têm lugar no mapa
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
  colocarMoveis(m, projetos)
  return m
}

// ponto local (lx, ly) de um elemento girado em torno do próprio centro → coordenada da planta
export function girarPonto(e, lx, ly) {
  const t = (e.rot || 0) * Math.PI / 180, cx = e.w / 2, cy = e.h / 2
  const dx = lx - cx, dy = ly - cy
  return [e.x + cx + dx * Math.cos(t) - dy * Math.sin(t), e.y + cy + dx * Math.sin(t) + dy * Math.cos(t)]
}

// Salas privativas (de uma pessoa ou função: Analista, Diretor, Sala Deison…): não são o salão (a maior), nem reunião,
// bancada, copa ou recepção, e têm uma porta numa das bordas. Devolve a sala, o lado da porta e o centro da porta.
const NAO_PRIVATIVA = /bancada|reuni|escrit|sal[aã]o|copa|cozinha|recep|banheiro|apoio|t[eé]cnica|almox|dep[oó]sito/i
export function salasPrivativas(mapa, projetos) {
  const salas = projetos.filter((p) => mapa.salas[p.id]).map((p) => ({ ...mapa.salas[p.id], p }))
  if (!salas.length) return []
  const maior = Math.max(...salas.map((s) => s.w * s.h))
  const out = []
  for (const s of salas) {
    if (NAO_PRIVATIVA.test(s.p.nome) || s.w * s.h >= maior * 0.6) continue
    for (const e of mapa.elementos) {
      if (e.tipo !== 'porta') continue
      const [ax, ay] = girarPonto(e, 0, e.h), [bx, by] = girarPonto(e, e.w, e.h)
      const mx = (ax + bx) / 2, my = (ay + by) / 2
      const horiz = Math.abs(ay - by) < Math.abs(ax - bx)
      let lado = null
      if (horiz && mx > s.x && mx < s.x + s.w) lado = Math.abs(my - s.y) < 16 ? 'cima' : Math.abs(my - (s.y + s.h)) < 16 ? 'baixo' : null
      if (!horiz && my > s.y && my < s.y + s.h) lado = Math.abs(mx - s.x) < 16 ? 'esq' : Math.abs(mx - (s.x + s.w)) < 16 ? 'dir' : null
      if (lado) { out.push({ s, p: s.p, lado, porta: [mx, my] }); break }
    }
  }
  return out
}

// Uma vez por sala privativa: mesa individual de frente para a porta, do lado direito, e uma janela na parede
// em frente à porta (quando essa parede é externa). Viram elementos comuns: dá para mover, girar ou apagar.
// Os ids criados ficam em mapa.auto, para não voltarem depois de apagados.
export function colocarMoveis(m, projetos) {
  m.auto = Array.isArray(m.auto) ? m.auto : []
  const todas = Object.values(m.salas)
  if (!todas.length) return m
  const X0 = Math.min(...todas.map((s) => s.x)), Y0 = Math.min(...todas.map((s) => s.y))
  const X1 = Math.max(...todas.map((s) => s.x + s.w)), Y1 = Math.max(...todas.map((s) => s.y + s.h))
  const dentro = (s, e) => salaDoPonto(s, e)
  for (const { s, p, lado, porta } of salasPrivativas(m, projetos)) {
    const idMesa = `estacao-${p.id}`, idJanela = `janela-frente-${p.id}`
    const temMovel = m.elementos.some((e) => ['mesa', 'bancada', 'sofa', 'estacao'].includes(e.tipo) && dentro(s, e))
    if (!m.auto.includes(idMesa) && !temMovel) {
      // pessoa olhando para a parede da porta; mesa do lado direito da sala (visto da planta)
      const [rot, fx, fy] = { cima: [0, 0.7, 0.42], baixo: [180, 0.7, 0.58], esq: [270, 0.42, 0.7], dir: [90, 0.58, 0.7] }[lado]
      const cx = s.x + s.w * fx, cy = s.y + s.h * fy
      m.elementos.push({ id: idMesa, tipo: 'estacao', x: snap(cx - 60), y: snap(cy - 35), w: 120, h: 70, rot, rotulo: '' })
    }
    if (!m.auto.includes(idMesa)) m.auto.push(idMesa)
    if (!m.auto.includes(idJanela)) {
      const L = 140
      let el = null
      if (lado === 'cima' && Math.abs(s.y + s.h - Y1) < 8) el = { x: lim(porta[0] - L / 2, s.x + 20, s.x + s.w - L - 20), y: s.y + s.h - 5, rot: 0 }
      if (lado === 'baixo' && Math.abs(s.y - Y0) < 8) el = { x: lim(porta[0] - L / 2, s.x + 20, s.x + s.w - L - 20), y: s.y - 5, rot: 0 }
      if (lado === 'esq' && Math.abs(s.x + s.w - X1) < 8) el = { x: s.x + s.w - L / 2, y: lim(porta[1], s.y + 20 + L / 2, s.y + s.h - 20 - L / 2) - 5, rot: 90 }
      if (lado === 'dir' && Math.abs(s.x - X0) < 8) el = { x: s.x - L / 2, y: lim(porta[1], s.y + 20 + L / 2, s.y + s.h - 20 - L / 2) - 5, rot: 90 }
      if (el) m.elementos.push({ id: idJanela, tipo: 'janela', x: snap(el.x), y: el.y, w: L, h: 10, rot: el.rot, rotulo: '' })
      m.auto.push(idJanela)
    }
  }
  return m
}


// ---------- equipe (avatares com nome, cargo e expediente) ----------
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
// dia da semana e minuto do dia no horário de Brasília
export function horaBR(d = new Date()) {
  const x = new Date(d.getTime() - 3 * 3600e3)
  return { dia: x.getUTCDay(), min: x.getUTCHours() * 60 + x.getUTCMinutes() }
}
const minutos = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export function noExpediente(p, agora = horaBR()) {
  const ini = minutos(p.inicio || '08:00'), fim = minutos(p.fim || '18:00'), dias = p.dias || [1, 2, 3, 4, 5]
  if (ini === fim) return false
  if (ini < fim) return dias.includes(agora.dia) && agora.min >= ini && agora.min < fim
  return (dias.includes(agora.dia) && agora.min >= ini) || (dias.includes((agora.dia + 6) % 7) && agora.min < fim)   // turno que vira a noite
}
export function situacaoExpediente(p, agora = horaBR()) {
  const dias = p.dias || [1, 2, 3, 4, 5]
  if (!dias.length) return 'Sem dias de expediente'
  if (noExpediente(p, agora)) return `No expediente até ${p.fim || '18:00'}`
  const ini = minutos(p.inicio || '08:00')
  for (let k = 0; k < 8; k++) {
    const d = (agora.dia + k) % 7
    if (dias.includes(d) && (k > 0 || agora.min < ini)) return `Fora do expediente · volta ${k === 0 ? 'hoje' : k === 1 ? 'amanhã' : DIAS_SEMANA[d]} às ${p.inicio || '08:00'}`
  }
  return 'Fora do expediente'
}

// Lugares onde alguém pode sentar, com o mesmo id que a planta 3D usa: mesa individual (id do elemento),
// cada cadeira das fileiras de mesas (id:i:a|b), cada posto da bancada (id:i) e a mesa automática da sala (sala-<id>).
export function postosDoMapa(mapa, projetos) {
  const salas = projetos.filter((p) => mapa.salas[p.id]).map((p) => ({ ...mapa.salas[p.id], p }))
  const salaDe = (e) => { const [x, y] = girarPonto(e, e.w / 2, e.h / 2); return salas.find((s) => x > s.x && x < s.x + s.w && y > s.y && y < s.y + s.h) }
  const out = []
  for (const e of mapa.elementos) {
    const s = salaDe(e), nomeSala = s?.p.nome || 'Fora das salas'
    if (e.tipo === 'estacao') out.push({ id: e.id, rotulo: `${nomeSala} · ${e.rotulo || 'mesa individual'}`, sala: s ? String(s.p.id) : '' })
    if (e.tipo === 'mesa') {
      const n = Math.max(1, Math.floor(Math.max(e.w, e.h) * 0.01 / 1.25))
      for (let i = 0; i < n; i++) for (const l of ['a', 'b']) out.push({ id: `${e.id}:${i}:${l}`, rotulo: `${nomeSala} · ${e.rotulo || 'mesas'} · lugar ${i * 2 + (l === 'a' ? 1 : 2)}`, sala: s ? String(s.p.id) : '' })
    }
    if (e.tipo === 'bancada') {
      const longo = (e.h > e.w * 1.2 ? e.h : e.w) * 0.01, n = Math.max(1, Math.round(longo / 1.2))
      for (let i = 0; i < n; i++) out.push({ id: `${e.id}:${i}`, rotulo: `${nomeSala} · bancada · posto ${i + 1}`, sala: s ? String(s.p.id) : '' })
    }
  }
  const MOVEIS = ['mesa', 'bancada', 'sofa', 'estacao', 'gaveteiro']
  for (const s of salas) {
    if (/reuni/i.test(s.p.nome) || mapa.elementos.some((e) => MOVEIS.includes(e.tipo) && salaDe(e) === s)) continue
    out.push({ id: `sala-${s.p.id}`, rotulo: `${s.p.nome} · mesa da sala`, sala: String(s.p.id) })
  }
  return out
}
