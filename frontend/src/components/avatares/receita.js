import * as THREE from 'three'

// Estúdio de avatares: uma RECEITA (JSON) descreve o modelo por partes articuladas + animações por quadros-chave.
// O mesmo formato serve para a pessoa, o cão e o gato gerados pelos parâmetros e para o editor de código (sem executar
// código do usuário: só dados). construir() monta o THREE.Group e os AnimationClips; o GLTFExporter grava o .glb.
//
// parte: { id, pai, forma, tam, pos, rot (graus), esc, desloc, cor, rug, metal, oculta }
//   forma: caixa [l,a,p] · esfera [r] · capsula [r, comprimento] · cilindro [rTopo, rBase, altura] · cone [r, altura]
//          toro [r, tubo] · calota [r, abertura 0..1] · nenhuma (só articulação)
//   pos = onde fica a ARTICULAÇÃO no pai; desloc = onde a malha fica em relação à articulação (o membro gira na ponta)
// animação: { nome, duracao, trilhas: [{ parte, prop: rot|pos|esc, tempos: [...], valores: [[x,y,z], ...] }] }

const D = THREE.MathUtils.DEG2RAD
export const FORMAS = ['caixa', 'esfera', 'capsula', 'cilindro', 'cone', 'toro', 'calota', 'nenhuma']
export const LIMITES = { partes: 160, animacoes: 24, chaves: 2000 }

function geometria(forma, t = []) {
  switch (forma) {
    case 'caixa': return new THREE.BoxGeometry(t[0] ?? 0.1, t[1] ?? 0.1, t[2] ?? 0.1)
    case 'esfera': return new THREE.SphereGeometry(t[0] ?? 0.05, 24, 16)
    case 'capsula': return new THREE.CapsuleGeometry(t[0] ?? 0.04, t[1] ?? 0.2, 6, 14)
    case 'cilindro': return new THREE.CylinderGeometry(t[0] ?? 0.05, t[1] ?? t[0] ?? 0.05, t[2] ?? 0.1, 20)
    case 'cone': return new THREE.ConeGeometry(t[0] ?? 0.05, t[1] ?? 0.1, 20)
    case 'toro': return new THREE.TorusGeometry(t[0] ?? 0.05, t[1] ?? 0.01, 10, 24)
    case 'calota': return new THREE.SphereGeometry(t[0] ?? 0.1, 28, 16, 0, Math.PI * 2, 0, Math.PI * THREE.MathUtils.clamp(t[1] ?? 0.5, 0.05, 1))
    default: return null
  }
}

// confere a receita antes de montar (mensagens em pt-BR, para o editor mostrar)
export function validar(r) {
  const erros = []
  if (!r || typeof r !== 'object') return ['A receita precisa ser um objeto JSON.']
  if (!Array.isArray(r.partes) || !r.partes.length) erros.push('Falta a lista "partes".')
  const ids = new Set()
  for (const [i, p] of (r.partes || []).entries()) {
    if (!p.id || typeof p.id !== 'string' || !/^[\w-]{1,40}$/.test(p.id)) erros.push(`Parte ${i + 1}: "id" precisa ser texto simples (letras, números, _ e -).`)
    else if (ids.has(p.id)) erros.push(`Parte "${p.id}" repetida.`)
    ids.add(p.id)
    if (p.forma && !FORMAS.includes(p.forma)) erros.push(`Parte "${p.id}": forma "${p.forma}" não existe (use ${FORMAS.join(', ')}).`)
    if (p.cor && !/^#[0-9a-fA-F]{6}$/.test(p.cor)) erros.push(`Parte "${p.id}": cor precisa ser #rrggbb.`)
    for (const k of ['pos', 'rot', 'esc', 'desloc']) if (p[k] && (!Array.isArray(p[k]) || p[k].length !== 3 || p[k].some((v) => typeof v !== 'number' || !Number.isFinite(v)))) erros.push(`Parte "${p.id}": "${k}" precisa ser [x, y, z].`)
  }
  for (const p of r.partes || []) if (p.pai && !ids.has(p.pai)) erros.push(`Parte "${p.id}": pai "${p.pai}" não existe.`)
  if ((r.partes || []).length > LIMITES.partes) erros.push(`No máximo ${LIMITES.partes} partes.`)
  let chaves = 0
  for (const a of r.animacoes || []) {
    if (!a.nome) erros.push('Toda animação precisa de "nome".')
    for (const t of a.trilhas || []) {
      if (!ids.has(t.parte)) erros.push(`Animação "${a.nome}": parte "${t.parte}" não existe.`)
      if (!['rot', 'pos', 'esc'].includes(t.prop)) erros.push(`Animação "${a.nome}": prop precisa ser rot, pos ou esc.`)
      if (!Array.isArray(t.tempos) || !Array.isArray(t.valores) || t.tempos.length !== t.valores.length || !t.tempos.length) erros.push(`Animação "${a.nome}", parte "${t.parte}": "tempos" e "valores" precisam ter o mesmo tamanho.`)
      chaves += t.tempos?.length || 0
    }
  }
  if ((r.animacoes || []).length > LIMITES.animacoes) erros.push(`No máximo ${LIMITES.animacoes} animações.`)
  if (chaves > LIMITES.chaves * 4) erros.push('Quadros-chave demais.')
  return erros
}

export function construir(r) {
  const raiz = new THREE.Group(); raiz.name = (r.nome || 'modelo').replace(/[^\w-]/g, '_')
  const nos = {}
  const mats = new Map()
  const material = (p) => {
    const k = `${p.cor || '#cccccc'}|${p.rug ?? 0.75}|${p.metal ?? 0}`
    if (!mats.has(k)) { const m = new THREE.MeshStandardMaterial({ color: p.cor || '#cccccc', roughness: p.rug ?? 0.75, metalness: p.metal ?? 0 }); m.name = `mat_${mats.size}`; mats.set(k, m) }
    return mats.get(k)
  }
  for (const p of r.partes) {
    const no = new THREE.Group(); no.name = p.id
    no.position.fromArray(p.pos || [0, 0, 0])
    no.rotation.set(...(p.rot || [0, 0, 0]).map((v) => v * D))
    if (p.escNo) no.scale.fromArray(p.escNo)
    const g = geometria(p.forma, p.tam)
    if (g) {
      const m = new THREE.Mesh(g, material(p)); m.name = `${p.id}_malha`
      m.position.fromArray(p.desloc || [0, 0, 0])
      if (p.esc) m.scale.fromArray(p.esc)
      if (p.rotMalha) m.rotation.set(...p.rotMalha.map((v) => v * D))
      m.castShadow = true; m.receiveShadow = true
      no.add(m)
    }
    nos[p.id] = no
  }
  for (const p of r.partes) (p.pai ? nos[p.pai] : raiz).add(nos[p.id])
  for (const p of r.partes) if (p.oculta) nos[p.id].scale.setScalar(0.0001)
  const clips = (r.animacoes || []).map((a) => {
    const trilhas = []
    for (const t of a.trilhas || []) {
      const no = nos[t.parte]
      if (!no) continue
      if (t.prop === 'rot') {
        const q = new THREE.Quaternion(), e = new THREE.Euler(), vals = []
        for (const v of t.valores) { q.setFromEuler(e.set(v[0] * D, v[1] * D, v[2] * D)); vals.push(q.x, q.y, q.z, q.w) }
        trilhas.push(new THREE.QuaternionKeyframeTrack(`${no.name}.quaternion`, t.tempos, vals))
      } else {
        trilhas.push(new THREE.VectorKeyframeTrack(`${no.name}.${t.prop === 'pos' ? 'position' : 'scale'}`, t.tempos, t.valores.flat()))
      }
    }
    return new THREE.AnimationClip(a.nome, a.duracao || -1, trilhas)
  })
  return { cena: raiz, clips, nos }
}

export async function exportarGLB(r) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const { cena, clips } = construir(r)
  const buf = await new GLTFExporter().parseAsync(cena, { binary: true, animations: clips, onlyVisible: false })
  return new Blob([buf], { type: 'model/gltf-binary' })
}

// ---------------------------------------------------------------------------------------------------------------------
// Geradores por parâmetros (pessoa, cão, gato) → receita. Estilo próprio, simples e limpo (nada copiado de jogo).
// ---------------------------------------------------------------------------------------------------------------------
export const PADRAO_PESSOA = {
  especie: 'pessoa', nome: 'Pessoa', sexo: 'masculino', altura: 1.75, corpo: 'medio', pele: '#c68a5e', cabelo: 'curto', cor_cabelo: '#2b1d14',
  barba: 'nenhuma', oculos: false, roupa: 'social', cor_roupa: '#2f5d8a', inferior: 'calca', cor_inferior: '#2b2f38', sapato: '#1c1917', cracha: true, olhos: '#3b2a1e',
}
export const PADRAO_MULHER = { ...PADRAO_PESSOA, nome: 'Mulher', sexo: 'feminino', altura: 1.65, pele: '#d9a47c', cabelo: 'longo', cor_cabelo: '#4a2c1a', roupa: 'blusa', cor_roupa: '#b04a5a', inferior: 'calca', cor_inferior: '#24324a', sapato: '#3a2a22' }
export const PADRAO_HOMEM = { ...PADRAO_PESSOA, nome: 'Homem' }
export const PADRAO_CAO = { especie: 'cao', nome: 'Cão', porte: 'medio', pelagem: '#a8743f', mancha: '#f2e6d4', orelhas: 'caidas', focinho: 'medio', coleira: '#c0392b', olhos: '#1b1410' }
export const PADRAO_GATO = { especie: 'gato', nome: 'Gato', porte: 'medio', pelagem: '#7a7a7a', mancha: '#e8e1d6', orelhas: 'em_pe', focinho: 'curto', coleira: '#2f6fd6', olhos: '#7a9a2a' }

// helpers de trilha
const tr = (parte, prop, tempos, valores) => ({ parte, prop, tempos, valores })
const ciclo = (n, dur) => Array.from({ length: n + 1 }, (_, i) => Math.round(i * dur / n * 1000) / 1000)
const onda = (n, fn) => Array.from({ length: n + 1 }, (_, i) => fn(i / n * Math.PI * 2))

export function gerarPessoa(pp) {
  const p = { ...PADRAO_PESSOA, ...pp }
  const s = p.altura / 1.75, F = p.sexo === 'feminino'
  const larg = { magro: 0.88, medio: 1, forte: 1.14 }[p.corpo] || 1
  const ombro = (F ? 0.17 : 0.19) * s * larg, quadrilL = (F ? 0.105 : 0.09) * s
  const yQ = 0.96 * s, coxa = 0.43 * s, canela = 0.40 * s, braco = 0.28 * s, ante = 0.25 * s
  const mangaLonga = ['social', 'jaqueta', 'moletom'].includes(p.roupa)
  const saia = p.inferior === 'saia', bermuda = p.inferior === 'bermuda'
  const corBraco = mangaLonga ? p.cor_roupa : p.pele
  const corCanela = saia || bermuda ? p.pele : p.cor_inferior
  const P = []
  const add = (o) => P.push(o)
  add({ id: 'raiz', forma: 'nenhuma', pos: [0, 0, 0] })
  add({ id: 'quadril', pai: 'raiz', forma: 'esfera', tam: [0.14 * s], esc: [1.14 * larg * (F ? 1.06 : 1), 0.66, 0.7], pos: [0, yQ, 0], cor: saia ? p.cor_inferior : p.cor_inferior })
  add({ id: 'tronco', pai: 'quadril', forma: 'capsula', tam: [0.13 * s, 0.26 * s], esc: [1.38 * larg * (F ? 0.9 : 1), 1, 0.72], pos: [0, 0.05 * s, 0], desloc: [0, 0.25 * s, 0], cor: p.cor_roupa })
  if (p.roupa === 'social') {
    add({ id: 'gola', pai: 'tronco', forma: 'cilindro', tam: [0.06 * s, 0.075 * s, 0.05 * s], pos: [0, 0.43 * s, 0], cor: '#f4f4f2' })
    if (!F) add({ id: 'gravata', pai: 'tronco', forma: 'caixa', tam: [0.035 * s, 0.24 * s, 0.01 * s], pos: [0, 0.31 * s, 0.105 * s], rot: [-8, 0, 0], cor: '#3a3f4a' })
  }
  if (p.roupa === 'jaqueta') add({ id: 'ziper', pai: 'tronco', forma: 'caixa', tam: [0.012 * s, 0.42 * s, 0.01 * s], pos: [0, 0.26 * s, 0.108 * s], cor: '#d4d4d4', metal: 0.4, rug: 0.4 })
  if (p.cracha) {
    add({ id: 'cracha', pai: 'tronco', forma: 'caixa', tam: [0.055 * s, 0.075 * s, 0.006 * s], pos: [(F ? 0.06 : 0.065) * s, (F ? 0.2 : 0.26) * s, 0.112 * s], rot: [-6, 0, 0], cor: '#f8fafc', rug: 0.4 })
    add({ id: 'cracha_faixa', pai: 'cracha', forma: 'caixa', tam: [0.055 * s, 0.016 * s, 0.007 * s], pos: [0, 0.025 * s, 0], cor: '#0f766a' })
  }
  add({ id: 'pescoco', pai: 'tronco', forma: 'cilindro', tam: [0.045 * s, 0.05 * s, 0.1 * s], pos: [0, 0.43 * s, 0], desloc: [0, 0.04 * s, 0], cor: p.pele })
  add({ id: 'cabeca', pai: 'pescoco', forma: 'esfera', tam: [0.105 * s], esc: [0.92, 1.1, 1], pos: [0, 0.08 * s, 0], desloc: [0, 0.1 * s, 0.005 * s], cor: p.pele })
  add({ id: 'orelha_e', pai: 'cabeca', forma: 'esfera', tam: [0.022 * s], esc: [0.5, 1, 0.8], pos: [0.097 * s, 0.1 * s, 0], cor: p.pele })
  add({ id: 'orelha_d', pai: 'cabeca', forma: 'esfera', tam: [0.022 * s], esc: [0.5, 1, 0.8], pos: [-0.097 * s, 0.1 * s, 0], cor: p.pele })
  for (const [lado, x] of [['e', 1], ['d', -1]]) {
    add({ id: `olho_${lado}`, pai: 'cabeca', forma: 'esfera', tam: [0.016 * s], esc: [1, 1, 0.6], pos: [x * 0.036 * s, 0.115 * s, 0.093 * s], cor: '#f8f8f6', rug: 0.3 })
    add({ id: `iris_${lado}`, pai: `olho_${lado}`, forma: 'esfera', tam: [0.009 * s], esc: [1, 1, 0.5], pos: [0, 0, 0.007 * s], cor: p.olhos, rug: 0.25 })
    add({ id: `sobrancelha_${lado}`, pai: 'cabeca', forma: 'caixa', tam: [0.034 * s, 0.007 * s, 0.008 * s], pos: [x * 0.038 * s, 0.145 * s, 0.096 * s], rot: [0, 0, x * -6], cor: p.cor_cabelo })
  }
  add({ id: 'nariz', pai: 'cabeca', forma: 'esfera', tam: [0.016 * s], esc: [0.8, 1.2, 1], pos: [0, 0.09 * s, 0.104 * s], cor: p.pele })
  add({ id: 'boca', pai: 'cabeca', forma: 'caixa', tam: [0.038 * s, 0.008 * s, 0.006 * s], pos: [0, 0.055 * s, 0.098 * s], cor: F ? '#a5484f' : '#7d4a3f' })
  // cabelo
  const c = p.cor_cabelo
  if (p.cabelo !== 'careca') {
    const ab = { raspado: 0.4, curto: 0.46, longo: 0.55, rabo: 0.5, coque: 0.5, cacheado: 0.52 }[p.cabelo] ?? 0.46
    const vol = p.cabelo === 'raspado' ? 1.02 : p.cabelo === 'cacheado' ? 1.16 : 1.07
    add({ id: 'cabelo', pai: 'cabeca', forma: 'calota', tam: [0.108 * s * vol, ab], esc: [0.95, 1.06, 1.04], pos: [0, 0.115 * s, -0.008 * s], rot: [-14, 0, 0], cor: c, rug: 0.9 })
    if (p.cabelo === 'longo') {
      add({ id: 'cabelo_costas', pai: 'cabeca', forma: 'caixa', tam: [0.19 * s, 0.26 * s, 0.05 * s], pos: [0, 0.0, -0.075 * s], rot: [8, 0, 0], cor: c, rug: 0.9 })
      add({ id: 'mecha_e', pai: 'cabeca', forma: 'caixa', tam: [0.03 * s, 0.2 * s, 0.07 * s], pos: [0.095 * s, 0.02 * s, -0.02 * s], cor: c, rug: 0.9 })
      add({ id: 'mecha_d', pai: 'cabeca', forma: 'caixa', tam: [0.03 * s, 0.2 * s, 0.07 * s], pos: [-0.095 * s, 0.02 * s, -0.02 * s], cor: c, rug: 0.9 })
    }
    if (p.cabelo === 'rabo') add({ id: 'rabo_cavalo', pai: 'cabeca', forma: 'capsula', tam: [0.032 * s, 0.16 * s], pos: [0, 0.1 * s, -0.11 * s], rot: [24, 0, 0], desloc: [0, -0.09 * s, 0], cor: c, rug: 0.9 })
    if (p.cabelo === 'coque') add({ id: 'coque', pai: 'cabeca', forma: 'esfera', tam: [0.05 * s], pos: [0, 0.2 * s, -0.07 * s], cor: c, rug: 0.9 })
  }
  if (p.barba !== 'nenhuma') add({ id: 'barba', pai: 'cabeca', forma: 'esfera', tam: [0.085 * s], esc: [1.05, p.barba === 'cheia' ? 0.62 : 0.45, 0.9], pos: [0, 0.05 * s, 0.02 * s], cor: c, rug: 0.95 })
  if (p.oculos) {
    for (const x of [1, -1]) add({ id: `lente_${x > 0 ? 'e' : 'd'}`, pai: 'cabeca', forma: 'toro', tam: [0.024 * s, 0.0035 * s], pos: [x * 0.037 * s, 0.115 * s, 0.108 * s], cor: '#1f2937', metal: 0.3, rug: 0.4 })
    add({ id: 'ponte', pai: 'cabeca', forma: 'caixa', tam: [0.026 * s, 0.004 * s, 0.004 * s], pos: [0, 0.118 * s, 0.11 * s], cor: '#1f2937' })
  }
  // braços (articulação no ombro; a malha fica para baixo)
  for (const [lado, x] of [['e', 1], ['d', -1]]) {
    add({ id: `ombro_${lado}`, pai: 'tronco', forma: 'capsula', tam: [0.046 * s * larg, braco - 0.03 * s], pos: [x * ombro, 0.4 * s, 0], rot: [0, 0, x * 6], desloc: [0, -braco / 2, 0], cor: p.cor_roupa })
    add({ id: `cotovelo_${lado}`, pai: `ombro_${lado}`, forma: 'capsula', tam: [0.04 * s * larg, ante - 0.02 * s], pos: [0, -braco, 0], desloc: [0, -ante / 2, 0], cor: corBraco })
    add({ id: `mao_${lado}`, pai: `cotovelo_${lado}`, forma: 'esfera', tam: [0.045 * s], esc: [0.75, 1.1, 0.5], pos: [0, -ante, 0], desloc: [0, -0.045 * s, 0], cor: p.pele })
  }
  add({ id: 'xicara', pai: 'mao_d', forma: 'cilindro', tam: [0.03 * s, 0.026 * s, 0.07 * s], pos: [0, -0.06 * s, 0.035 * s], cor: '#f8fafc', rug: 0.3, oculta: true })
  // pernas
  for (const [lado, x] of [['e', 1], ['d', -1]]) {
    add({ id: `coxa_${lado}`, pai: 'quadril', forma: saia ? 'capsula' : 'capsula', tam: [0.066 * s * larg, coxa - 0.05 * s], pos: [x * quadrilL, -0.03 * s, 0], desloc: [0, -coxa / 2, 0], cor: saia ? p.pele : p.cor_inferior })
    add({ id: `joelho_${lado}`, pai: `coxa_${lado}`, forma: 'capsula', tam: [0.05 * s * larg, canela - 0.04 * s], pos: [0, -coxa, 0], desloc: [0, -canela / 2, 0], cor: corCanela })
    add({ id: `pe_${lado}`, pai: `joelho_${lado}`, forma: 'caixa', tam: [0.085 * s, 0.07 * s, 0.24 * s], pos: [0, -canela, 0], desloc: [0, -0.06 * s, 0.045 * s], cor: p.sapato, rug: 0.5 })
  }
  if (saia) add({ id: 'saia', pai: 'quadril', forma: 'cilindro', tam: [0.16 * s * larg, 0.25 * s * larg, 0.42 * s], pos: [0, 0.02 * s, 0], desloc: [0, -0.19 * s, 0], cor: p.cor_inferior })
  if (bermuda) for (const lado of ['e', 'd']) add({ id: `bermuda_${lado}`, pai: `coxa_${lado}`, forma: 'cilindro', tam: [0.075 * s * larg, 0.072 * s * larg, 0.08 * s], pos: [0, -coxa + 0.04 * s, 0], cor: p.cor_inferior })

  // ---------------- animações ----------------
  const Y = yQ, A = []
  const ombroRot = (x, lado) => [x, 0, (lado === 'e' ? 1 : -1) * 6]
  // Parado: respiração, olhar e leve balanço
  A.push({ nome: 'Idle', duracao: 4, trilhas: [
    tr('tronco', 'esc', ciclo(4, 4), onda(4, (a) => [1, 1 + 0.012 * Math.sin(a), 1 + 0.02 * Math.sin(a)])),
    tr('cabeca', 'rot', ciclo(4, 4), [[0, 0, 0], [0, 10, 0], [2, 0, 0], [0, -8, 0], [0, 0, 0]]),
    tr('quadril', 'pos', ciclo(4, 4), onda(4, (a) => [0.006 * Math.sin(a), Y, 0])),
    tr('ombro_e', 'rot', ciclo(2, 4), [ombroRot(0, 'e'), ombroRot(-3, 'e'), ombroRot(0, 'e')]),
    tr('ombro_d', 'rot', ciclo(2, 4), [ombroRot(0, 'd'), ombroRot(-3, 'd'), ombroRot(0, 'd')]),
    tr('cotovelo_e', 'rot', [0, 4], [[-8, 0, 0], [-8, 0, 0]]), tr('cotovelo_d', 'rot', [0, 4], [[-8, 0, 0], [-8, 0, 0]]),
  ] })
  const andar = (nome, dur, amp, joelho, braco, inclina, pulo) => {
    const n = 8, t = ciclo(n, dur)
    return { nome, duracao: dur, trilhas: [
      tr('coxa_e', 'rot', t, onda(n, (a) => [-amp * Math.sin(a), 0, 0])),
      tr('coxa_d', 'rot', t, onda(n, (a) => [amp * Math.sin(a), 0, 0])),
      tr('joelho_e', 'rot', t, onda(n, (a) => [joelho * Math.max(0, Math.sin(a - Math.PI / 2 - 0.6)) + 4, 0, 0])),
      tr('joelho_d', 'rot', t, onda(n, (a) => [joelho * Math.max(0, Math.sin(a + Math.PI / 2 - 0.6)) + 4, 0, 0])),
      tr('pe_e', 'rot', t, onda(n, (a) => [-8 * Math.cos(a), 0, 0])), tr('pe_d', 'rot', t, onda(n, (a) => [8 * Math.cos(a), 0, 0])),
      tr('ombro_e', 'rot', t, onda(n, (a) => ombroRot(braco * Math.sin(a), 'e'))),
      tr('ombro_d', 'rot', t, onda(n, (a) => ombroRot(-braco * Math.sin(a), 'd'))),
      tr('cotovelo_e', 'rot', t, onda(n, (a) => [-18 - (braco / 2) * Math.max(0, Math.sin(a)), 0, 0])),
      tr('cotovelo_d', 'rot', t, onda(n, (a) => [-18 - (braco / 2) * Math.max(0, -Math.sin(a)), 0, 0])),
      tr('quadril', 'pos', t, onda(n, (a) => [0, Y - pulo + pulo * Math.abs(Math.cos(a)), 0])),
      tr('quadril', 'rot', t, onda(n, (a) => [0, 6 * Math.sin(a), 0])),
      tr('tronco', 'rot', t, onda(n, (a) => [inclina, -9 * Math.sin(a), 0])),
      tr('cabeca', 'rot', t, onda(n, (a) => [-inclina / 2, 4 * Math.sin(a), 0])),
    ] }
  }
  A.push(andar('Walk', 1.05, 24, 38, 20, 3, 0.025 * s))
  A.push(andar('Run', 0.66, 42, 85, 45, 12, 0.06 * s))
  // Sentado (quadril na altura do assento ~0,48 m; mãos sobre a mesa)
  const sentadoBase = (extra = []) => [
    tr('quadril', 'pos', [0, 2], [[0, 0.56 * s, -0.04 * s], [0, 0.56 * s, -0.04 * s]]),
    tr('coxa_e', 'rot', [0, 2], [[-88, 0, -3], [-88, 0, -3]]), tr('coxa_d', 'rot', [0, 2], [[-88, 0, 3], [-88, 0, 3]]),
    tr('joelho_e', 'rot', [0, 2], [[88, 0, 0], [88, 0, 0]]), tr('joelho_d', 'rot', [0, 2], [[88, 0, 0], [88, 0, 0]]),
    tr('tronco', 'esc', ciclo(2, 2), [[1, 1, 1], [1, 1.01, 1.02], [1, 1, 1]]),
    ...extra,
  ]
  A.push({ nome: 'Sit', duracao: 2, trilhas: sentadoBase([
    tr('ombro_e', 'rot', [0, 2], [ombroRot(-30, 'e'), ombroRot(-30, 'e')]), tr('ombro_d', 'rot', [0, 2], [ombroRot(-30, 'd'), ombroRot(-30, 'd')]),
    tr('cotovelo_e', 'rot', [0, 2], [[-55, 0, 0], [-55, 0, 0]]), tr('cotovelo_d', 'rot', [0, 2], [[-55, 0, 0], [-55, 0, 0]]),
  ]) })
  A.push({ nome: 'Typing', duracao: 1.2, trilhas: sentadoBase([
    tr('ombro_e', 'rot', [0, 1.2], [ombroRot(-34, 'e'), ombroRot(-34, 'e')]), tr('ombro_d', 'rot', [0, 1.2], [ombroRot(-34, 'd'), ombroRot(-34, 'd')]),
    tr('cotovelo_e', 'rot', ciclo(6, 1.2), onda(6, (a) => [-58 + 4 * Math.sin(a * 2), 0, 0])),
    tr('cotovelo_d', 'rot', ciclo(6, 1.2), onda(6, (a) => [-58 + 4 * Math.cos(a * 2), 0, 0])),
    tr('mao_e', 'rot', ciclo(6, 1.2), onda(6, (a) => [8 * Math.sin(a * 3), 0, 0])), tr('mao_d', 'rot', ciclo(6, 1.2), onda(6, (a) => [8 * Math.cos(a * 3), 0, 0])),
    tr('cabeca', 'rot', [0, 0.6, 1.2], [[6, 0, 0], [7, 3, 0], [6, 0, 0]]),
  ]) })
  A.push({ nome: 'Drinking', duracao: 3.2, trilhas: [
    tr('xicara', 'esc', [0, 0.1, 3.1, 3.2], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]),
    tr('ombro_d', 'rot', [0, 0.8, 1.6, 2.4, 3.2], [ombroRot(-25, 'd'), ombroRot(-38, 'd'), ombroRot(-40, 'd'), ombroRot(-38, 'd'), ombroRot(-25, 'd')]),
    tr('cotovelo_d', 'rot', [0, 0.8, 1.6, 2.4, 3.2], [[-80, 0, 0], [-128, 0, 0], [-132, 0, 0], [-128, 0, 0], [-80, 0, 0]]),
    tr('cabeca', 'rot', [0, 0.8, 1.6, 2.4, 3.2], [[0, 0, 0], [-10, 0, 0], [-14, 0, 0], [-8, 0, 0], [0, 0, 0]]),
    tr('ombro_e', 'rot', [0, 3.2], [ombroRot(0, 'e'), ombroRot(0, 'e')]),
  ] })
  A.push({ nome: 'Wave', duracao: 1.6, trilhas: [
    tr('ombro_d', 'rot', [0, 1.6], [[0, 0, -155], [0, 0, -155]]),
    tr('cotovelo_d', 'rot', ciclo(4, 1.6), onda(4, (a) => [0, 0, 28 * Math.sin(a)])),
    tr('cabeca', 'rot', [0, 0.8, 1.6], [[0, -8, 4], [0, -8, 0], [0, -8, 4]]),
    tr('tronco', 'rot', [0, 1.6], [[0, 0, 3], [0, 0, 3]]),
  ] })
  A.push({ nome: 'Talking', duracao: 2.4, trilhas: [
    tr('boca', 'esc', ciclo(8, 2.4), onda(8, (a) => [1, 1 + 1.8 * Math.abs(Math.sin(a * 2)), 1])),
    tr('cabeca', 'rot', ciclo(4, 2.4), [[0, 0, 0], [4, 6, 0], [0, 0, 2], [3, -6, 0], [0, 0, 0]]),
    tr('ombro_e', 'rot', ciclo(4, 2.4), [ombroRot(-20, 'e'), ombroRot(-30, 'e'), ombroRot(-18, 'e'), ombroRot(-28, 'e'), ombroRot(-20, 'e')]),
    tr('cotovelo_e', 'rot', ciclo(4, 2.4), [[-60, 0, 0], [-75, 0, 0], [-55, 0, 0], [-70, 0, 0], [-60, 0, 0]]),
    tr('cotovelo_d', 'rot', ciclo(4, 2.4), [[-40, 0, 0], [-55, 0, 0], [-35, 0, 0], [-50, 0, 0], [-40, 0, 0]]),
  ] })
  A.push({ nome: 'Thinking', duracao: 3, trilhas: [
    tr('ombro_d', 'rot', [0, 3], [ombroRot(-28, 'd'), ombroRot(-28, 'd')]), tr('cotovelo_d', 'rot', [0, 3], [[-138, 0, 0], [-138, 0, 0]]),
    tr('ombro_e', 'rot', [0, 3], [[-18, 0, 30], [-18, 0, 30]]), tr('cotovelo_e', 'rot', [0, 3], [[-95, 0, 0], [-95, 0, 0]]),
    tr('cabeca', 'rot', ciclo(2, 3), [[-6, 8, 8], [-8, 12, 10], [-6, 8, 8]]),
  ] })
  A.push({ nome: 'Happy', duracao: 1, trilhas: [
    tr('quadril', 'pos', ciclo(4, 1), onda(4, (a) => [0, Y + 0.05 * s * Math.max(0, Math.sin(a)), 0])),
    tr('ombro_e', 'rot', [0, 1], [[0, 0, 140], [0, 0, 140]]), tr('ombro_d', 'rot', [0, 1], [[0, 0, -140], [0, 0, -140]]),
    tr('cotovelo_e', 'rot', ciclo(2, 1), [[0, 0, 15], [0, 0, 30], [0, 0, 15]]), tr('cotovelo_d', 'rot', ciclo(2, 1), [[0, 0, -15], [0, 0, -30], [0, 0, -15]]),
    tr('boca', 'esc', [0, 1], [[1.3, 2.2, 1], [1.3, 2.2, 1]]),
  ] })
  A.push({ nome: 'Pointing', duracao: 2, trilhas: [
    tr('ombro_d', 'rot', [0, 0.5, 2], [ombroRot(0, 'd'), ombroRot(-85, 'd'), ombroRot(-85, 'd')]),
    tr('cotovelo_d', 'rot', [0, 0.5, 2], [[-8, 0, 0], [-4, 0, 0], [-4, 0, 0]]),
    tr('cabeca', 'rot', [0, 0.5, 2], [[0, 0, 0], [0, -6, 0], [0, -6, 0]]),
  ] })
  // a xícara só aparece no clip de beber (nos outros fica escondida)
  for (const a of A) if (a.nome !== 'Drinking') a.trilhas.push(tr('xicara', 'esc', [0], [[0.0001, 0.0001, 0.0001]]))
  return { nome: p.nome, especie: 'pessoa', parametros: p, partes: P, animacoes: A }
}

export function gerarPet(pp) {
  const base = pp.especie === 'gato' ? PADRAO_GATO : PADRAO_CAO
  const p = { ...base, ...pp }
  const gato = p.especie === 'gato'
  const k = ({ pequeno: 0.7, medio: 1, grande: 1.35 }[p.porte] || 1) * (gato ? 0.62 : 1)
  const alturaPata = 0.28 * k, comp = 0.46 * k, rc = 0.12 * k * (gato ? 0.85 : 1)
  const yC = alturaPata + rc * 0.9
  const P = [], add = (o) => P.push(o)
  add({ id: 'raiz', forma: 'nenhuma' })
  add({ id: 'corpo', pai: 'raiz', forma: 'capsula', tam: [rc, comp], rotMalha: [90, 0, 0], esc: [1, 1, gato ? 0.95 : 1], pos: [0, yC, 0], cor: p.pelagem, rug: 0.95 })
  add({ id: 'barriga', pai: 'corpo', forma: 'capsula', tam: [rc * 0.8, comp * 0.8], rotMalha: [90, 0, 0], pos: [0, -rc * 0.22, 0.01], esc: [0.85, 1, 1], cor: p.mancha, rug: 0.95 })
  add({ id: 'pescoco', pai: 'corpo', forma: 'capsula', tam: [rc * 0.62, rc * 0.7], pos: [0, rc * 0.45, comp / 2 + rc * 0.3], rot: [-35, 0, 0], desloc: [0, rc * 0.35, 0], cor: p.pelagem, rug: 0.95 })
  add({ id: 'coleira', pai: 'pescoco', forma: 'toro', tam: [rc * 0.6, rc * 0.09], pos: [0, rc * 0.2, 0], rot: [90, 0, 0], cor: p.coleira, rug: 0.5 })
  add({ id: 'cabeca', pai: 'pescoco', forma: 'esfera', tam: [rc * (gato ? 0.95 : 0.8)], esc: [1, 0.92, 1.05], pos: [0, rc * 0.9, 0], rot: [35, 0, 0], cor: p.pelagem, rug: 0.95 })
  const fz = { curto: 0.5, medio: 0.85, longo: 1.2 }[p.focinho] || 0.85
  add({ id: 'focinho', pai: 'cabeca', forma: 'capsula', tam: [rc * 0.42, rc * 0.5 * fz], rotMalha: [90, 0, 0], pos: [0, -rc * 0.22, rc * (0.75 + 0.25 * fz)], cor: gato ? p.mancha : p.pelagem, rug: 0.95 })
  add({ id: 'nariz', pai: 'focinho', forma: 'esfera', tam: [rc * 0.16], esc: [1.2, 0.8, 1], pos: [0, rc * 0.12, rc * (0.3 + 0.28 * fz)], cor: gato ? '#c98a8a' : '#151515', rug: 0.35 })
  for (const [l, x] of [['e', 1], ['d', -1]]) {
    add({ id: `olho_${l}`, pai: 'cabeca', forma: 'esfera', tam: [rc * 0.17], esc: [1, gato ? 1.1 : 1, 0.6], pos: [x * rc * 0.42, rc * 0.18, rc * 0.78], cor: p.olhos, rug: 0.2 })
    if (p.orelhas === 'em_pe') add({ id: `orelha_${l}`, pai: 'cabeca', forma: 'cone', tam: [rc * 0.32, rc * (gato ? 0.6 : 0.75)], pos: [x * rc * 0.52, rc * 0.82, -rc * 0.05], rot: [-8, 0, x * -16], cor: p.pelagem, rug: 0.95 })
    else add({ id: `orelha_${l}`, pai: 'cabeca', forma: 'caixa', tam: [rc * 0.16, rc * 0.85, rc * 0.5], pos: [x * rc * 0.92, rc * 0.25, -rc * 0.05], rot: [0, 0, x * 14], desloc: [0, -rc * 0.25, 0], cor: p.mancha === p.pelagem ? p.pelagem : p.pelagem, rug: 0.95 })
  }
  if (gato) for (const [l, x] of [['e', 1], ['d', -1]]) add({ id: `bigode_${l}`, pai: 'focinho', forma: 'caixa', tam: [rc * 0.9, rc * 0.015, rc * 0.015], pos: [x * rc * 0.45, 0, rc * 0.35], rot: [0, x * 15, 0], cor: '#efefef' })
  // patas: articulação no ombro/quadril
  const pernas = [['fe', 1, 1], ['fd', -1, 1], ['te', 1, -1], ['td', -1, -1]]
  for (const [id, x, z] of pernas) {
    const perna = alturaPata + rc * 0.37   // do ombro/quadril até o centro do pé: o pé encosta no chão
    add({ id: `pata_${id}`, pai: 'corpo', forma: 'capsula', tam: [rc * 0.32, Math.max(0.02, perna - rc * 0.5)], pos: [x * rc * 0.55, -rc * 0.35, z * comp * 0.42], desloc: [0, -perna / 2, 0], cor: p.pelagem, rug: 0.95 })
    add({ id: `pe_${id}`, pai: `pata_${id}`, forma: 'esfera', tam: [rc * 0.3], esc: [1, 0.6, 1.25], pos: [0, -perna, rc * 0.08], cor: id.startsWith('f') ? p.mancha : p.pelagem, rug: 0.95 })
  }
  add({ id: 'rabo', pai: 'corpo', forma: 'capsula', tam: [rc * (gato ? 0.16 : 0.2), comp * (gato ? 0.55 : 0.38)], pos: [0, rc * 0.4, -comp / 2 - rc * 0.55], rot: [gato ? -55 : -40, 0, 0], desloc: [0, comp * (gato ? 0.3 : 0.2), 0], cor: p.pelagem, rug: 0.95 })
  if (gato) add({ id: 'rabo_ponta', pai: 'rabo', forma: 'capsula', tam: [rc * 0.15, comp * 0.3], pos: [0, comp * 0.58, 0], rot: [30, 0, 0], desloc: [0, comp * 0.16, 0], cor: p.pelagem, rug: 0.95 })
  const A = []
  const n = 8
  A.push({ nome: 'Idle', duracao: 3, trilhas: [
    tr('corpo', 'esc', ciclo(4, 3), onda(4, (a) => [1 + 0.02 * Math.sin(a), 1 + 0.02 * Math.sin(a), 1])),
    tr('cabeca', 'rot', ciclo(4, 3), [[35, 0, 0], [30, 18, 0], [38, 0, 6], [32, -15, 0], [35, 0, 0]]),
    tr('rabo', 'rot', ciclo(n, 3), onda(n, (a) => [gato ? -55 : -40, 0, (gato ? 12 : 22) * Math.sin(a * (gato ? 1 : 2))])),
  ] })
  const passo = (nome, dur, amp, pulo) => ({ nome, duracao: dur, trilhas: [
    tr('pata_fe', 'rot', ciclo(n, dur), onda(n, (a) => [amp * Math.sin(a), 0, 0])), tr('pata_td', 'rot', ciclo(n, dur), onda(n, (a) => [amp * Math.sin(a), 0, 0])),
    tr('pata_fd', 'rot', ciclo(n, dur), onda(n, (a) => [-amp * Math.sin(a), 0, 0])), tr('pata_te', 'rot', ciclo(n, dur), onda(n, (a) => [-amp * Math.sin(a), 0, 0])),
    tr('corpo', 'pos', ciclo(n, dur), onda(n, (a) => [0, yC + pulo * Math.abs(Math.sin(a)), 0])),
    tr('cabeca', 'rot', ciclo(n, dur), onda(n, (a) => [35 + 4 * Math.sin(a * 2), 0, 0])),
    tr('rabo', 'rot', ciclo(n, dur), onda(n, (a) => [gato ? -45 : -35, 0, 18 * Math.sin(a * 2)])),
  ] })
  A.push(passo('Walk', 0.8, 26, 0.012 * k))
  A.push(passo('Run', 0.42, 48, 0.05 * k))
  A.push({ nome: 'Sit', duracao: 2, trilhas: [
    tr('corpo', 'rot', [0, 2], [[-38, 0, 0], [-38, 0, 0]]), tr('corpo', 'pos', [0, 2], [[0, yC * 0.95, -comp * 0.22], [0, yC * 0.95, -comp * 0.22]]),
    tr('pata_te', 'rot', [0, 2], [[-50, 0, 0], [-50, 0, 0]]), tr('pata_td', 'rot', [0, 2], [[-50, 0, 0], [-50, 0, 0]]),
    tr('pata_fe', 'rot', [0, 2], [[38, 0, 0], [38, 0, 0]]), tr('pata_fd', 'rot', [0, 2], [[38, 0, 0], [38, 0, 0]]),
    tr('cabeca', 'rot', ciclo(2, 2), [[70, 0, 0], [66, 8, 0], [70, 0, 0]]),
    tr('rabo', 'rot', ciclo(4, 2), onda(4, (a) => [-10, 0, 10 * Math.sin(a)])),
  ] })
  A.push({ nome: 'Sleeping', duracao: 4, trilhas: [
    tr('corpo', 'pos', [0, 4], [[0, rc * 0.95, 0], [0, rc * 0.95, 0]]),
    tr('corpo', 'esc', ciclo(2, 4), [[1, 1, 1], [1.03, 1.04, 1], [1, 1, 1]]),
    ...pernas.map(([id]) => tr(`pata_${id}`, 'rot', [0, 4], [[id.startsWith('f') ? -80 : 80, 0, 0], [id.startsWith('f') ? -80 : 80, 0, 0]])),
    tr('cabeca', 'rot', [0, 4], [[78, 0, 0], [78, 0, 0]]), tr('pescoco', 'rot', [0, 4], [[-80, 0, 0], [-80, 0, 0]]),
    tr('rabo', 'rot', [0, 4], [[-95, 30, 0], [-95, 30, 0]]),
  ] })
  A.push({ nome: gato ? 'Happy' : 'Wag', duracao: 0.6, trilhas: [
    tr('rabo', 'rot', ciclo(n, 0.6), onda(n, (a) => [gato ? -75 : -55, 0, (gato ? 10 : 40) * Math.sin(a * 2)])),
    tr('cabeca', 'rot', ciclo(2, 0.6), [[30, 0, -6], [30, 0, 6], [30, 0, -6]]),
  ] })
  return { nome: p.nome, especie: p.especie, parametros: p, partes: P, animacoes: A }
}

export function gerar(p) { return p.especie === 'pessoa' ? gerarPessoa(p) : gerarPet(p) }
