// Esqueleto + pesos + animações para um avatar PARADO (ex.: gerado no Tripo): de pé, braços ao lado do corpo, olhando +Z.
// Monta 12 ossos com o prefixo "clima_" (quadril, pescoco, ombro/cotovelo/coxa/joelho/tornozelo _0 = lado x<0, _1 = x>0).
// No mapa (Mapa3D.jsx, espelhoBoneco) esses ossos copiam as juntas do boneco do sistema: anda, senta, digita, café, moto.
// Uso (Node 20+):  npm i  →  node leve.mjs original.glb leve.glb 0.03  →  node rig.mjs leve.glb final.glb limites.json
// limites.json = alturas medidas no modelo (unidades do arquivo, pés em y=0): veja limites-estevam.json e meça com
// node pose.mjs (renderiza frente/lado em PNG, colorido por osso com "repouso cor"; poses: sentado, andando).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import fs from 'node:fs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(process.argv[2])
const root = doc.getRoot(), buffer = root.listBuffers()[0]
const prim = root.listMeshes()[0].listPrimitives()[0]
const P = prim.getAttribute('POSITION').getArray(), N = P.length / 3
const L = JSON.parse(fs.readFileSync(process.argv[4] || 'limites.json', 'utf8'))   // alturas medidas na malha
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const ehBraco = (x, y) => { const ax = Math.abs(x); if (y < L.maoBaixo || y > L.ombroTopo) return false; return y < L.maoTopo ? ax > L.maoDentro : ax > L.bracoDentro }
// centróide de uma faixa de altura numa região
const centro = (filtro, y0, y1) => { let sx = 0, sy = 0, sz = 0, n = 0; for (let i = 0; i < N; i++) { const x = P[i*3], y = P[i*3+1], z = P[i*3+2]; if (y >= y0 && y <= y1 && filtro(x, y)) { sx += x; sy += y; sz += z; n++ } } return [sx / n, (y0 + y1) / 2, sz / n] }
const J = {}
J.quadril = [0, L.quadril, centro((x, y) => Math.abs(x) < 0.08 && !ehBraco(x, y), L.quadril - 0.02, L.quadril + 0.02)[2]]
J.pescoco = [0, L.pescoco, centro((x) => Math.abs(x) < 0.06, L.pescoco - 0.015, L.pescoco + 0.015)[2]]
for (const [k, s] of [[0, -1], [1, 1]]) {
  const braco = (x, y) => ehBraco(x, y) && Math.sign(x) === s
  const perna = (x, y) => Math.sign(x) === s && !ehBraco(x, y)
  J[`ombro_${k}`] = centro(braco, L.ombro - 0.02, L.ombro + 0.02); J[`ombro_${k}`][1] = L.ombro
  J[`cotovelo_${k}`] = centro(braco, L.cotovelo - 0.015, L.cotovelo + 0.015)
  J[`coxa_${k}`] = [s * L.coxaX, L.coxa, J.quadril[2]]
  J[`joelho_${k}`] = centro(perna, L.joelho - 0.015, L.joelho + 0.015)
  J[`tornozelo_${k}`] = centro(perna, L.tornozelo - 0.01, L.tornozelo + 0.01)
}
for (const b of ['ombro', 'cotovelo']) { const m = (Math.abs(J[`${b}_0`][0]) + Math.abs(J[`${b}_1`][0])) / 2 + (b === 'ombro' ? 0.004 : 0); J[`${b}_0`][0] = -m; J[`${b}_1`][0] = m }
console.log(Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.map((n) => +n.toFixed(3))])))
const pais = { quadril: null, pescoco: 'quadril', ombro_0: 'quadril', ombro_1: 'quadril', cotovelo_0: 'ombro_0', cotovelo_1: 'ombro_1', coxa_0: 'quadril', coxa_1: 'quadril', joelho_0: 'coxa_0', joelho_1: 'coxa_1', tornozelo_0: 'joelho_0', tornozelo_1: 'joelho_1' }
const nomes = Object.keys(pais), idx = Object.fromEntries(nomes.map((n, i) => [n, i]))
// pesos por vértice
const JO = new Uint16Array(N * 4), WE = new Float32Array(N * 4)
for (let i = 0; i < N; i++) {
  const x = P[i*3], y = P[i*3+1], s = x < 0 ? 0 : 1
  const w = {}
  const add = (n, v) => { if (v > 0.001) w[n] = (w[n] || 0) + v }
  if (ehBraco(x, y)) {
    const a = ss(L.ombroTopo, L.ombroTopo - 0.06, y) * ss(L.bracoDentro - 0.005, L.bracoDentro + 0.025, Math.abs(x))   // ombro se mistura com o tronco
    const ante = ss(L.cotovelo + 0.025, L.cotovelo - 0.025, y)
    add('quadril', 1 - a); add(`ombro_${s}`, a * (1 - ante)); add(`cotovelo_${s}`, a * ante)
  } else if (y > L.pescoco - 0.03) {
    const c = ss(L.pescoco - 0.03, L.pescoco + 0.02, y); add('quadril', 1 - c); add('pescoco', c)
  } else {
    const perna = ss(L.coxa + 0.05, L.virilha, y)   // de cima do quadril até a virilha: quadril → coxa
    const lado = Math.abs(x) < 0.02 && y > L.virilha ? 0.5 : 1
    const canela = ss(L.joelho + 0.03, L.joelho - 0.03, y), pe = ss(L.tornozelo + 0.02, L.tornozelo - 0.01, y)
    add('quadril', 1 - perna)
    const pw = perna * lado
    add(`coxa_${s}`, pw * (1 - canela)); add(`joelho_${s}`, pw * canela * (1 - pe)); add(`tornozelo_${s}`, pw * canela * pe)
    if (lado < 1) { const o = 1 - s; add(`coxa_${o}`, perna * 0.5 * (1 - canela)) }
  }
  const lst = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4), tot = lst.reduce((a, b) => a + b[1], 0)
  lst.forEach(([n, v], k) => { JO[i*4+k] = idx[n]; WE[i*4+k] = v / tot })
}
// suaviza os pesos pelas arestas (2 passadas), para não rasgar nas emendas
const I = prim.getIndices().getArray(), viz = Array.from({ length: N }, () => new Set())
for (let t = 0; t < I.length; t += 3) for (const [a, b] of [[I[t], I[t+1]], [I[t+1], I[t+2]], [I[t+2], I[t]]]) { viz[a].add(b); viz[b].add(a) }
let dens = Array.from({ length: N }, (_, i) => { const m = new Map(); for (let k = 0; k < 4; k++) if (WE[i*4+k]) m.set(JO[i*4+k], WE[i*4+k]); return m })
for (let it = 0; it < 2; it++) {
  dens = dens.map((m, i) => { const r = new Map(m); for (const [j, v] of r) r.set(j, v * 2); for (const n of viz[i]) for (const [j, v] of dens[n]) r.set(j, (r.get(j) || 0) + v / viz[i].size * 1); const tot = [...r.values()].reduce((a, b) => a + b, 0); for (const [j, v] of r) r.set(j, v / tot); return r })
}
for (let i = 0; i < N; i++) { const lst = [...dens[i]].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = lst.reduce((a, b) => a + b[1], 0); for (let k = 0; k < 4; k++) { JO[i*4+k] = lst[k] ? lst[k][0] : 0; WE[i*4+k] = lst[k] ? lst[k][1] / tot : 0 } }
// nós dos ossos (sem rotação de repouso: só deslocamento em relação ao pai)
const cena = root.listScenes()[0], malhaNo = root.listNodes().find((n) => n.getMesh())
const raiz = doc.createNode('clima_raiz'); cena.addChild(raiz)
const nos = {}
for (const n of nomes) {
  const p = pais[n], pos = J[n].map((v, k) => v - (p ? J[p][k] : 0))
  nos[n] = doc.createNode(`clima_${n}`).setTranslation(pos); (p ? nos[p] : raiz).addChild(nos[n])
}
const ibm = new Float32Array(nomes.length * 16)
nomes.forEach((n, i) => { const [x, y, z] = J[n]; ibm.set([1,0,0,0, 0,1,0,0, 0,0,1,0, -x,-y,-z,1], i * 16) })
const skin = doc.createSkin('clima_esqueleto').setSkeleton(nos.quadril).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer))
nomes.forEach((n) => skin.addJoint(nos[n]))
malhaNo.setSkin(skin)
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(JO).setBuffer(buffer))
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(WE).setBuffer(buffer))
// animações (para a prévia em /avatares e para quem não usa o espelho do boneco)
const q = (x, y, z) => { const c1 = Math.cos(x/2), s1 = Math.sin(x/2), c2 = Math.cos(y/2), s2 = Math.sin(y/2), c3 = Math.cos(z/2), s3 = Math.sin(z/2); return [s1*c2*c3 + c1*s2*s3, c1*s2*c3 - s1*c2*s3, c1*c2*s3 + s1*s2*c3, c1*c2*c3 - s1*s2*s3] }   // XYZ
const clip = (nome, dur, n, f) => {
  const a = doc.createAnimation(nome), ts = Array.from({ length: n + 1 }, (_, k) => k * dur / n)
  const tIn = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(ts)).setBuffer(buffer)
  const amostras = ts.map((t) => f(t / dur))
  for (const osso of Object.keys(amostras[0])) {
    const [prop, alvo] = osso.endsWith('.pos') ? ['translation', osso.slice(0, -4)] : ['rotation', osso]
    const vals = amostras.flatMap((m) => prop === 'rotation' ? q(...m[osso]) : m[osso])
    const s = doc.createAnimationSampler().setInput(tIn).setOutput(doc.createAccessor().setType(prop === 'rotation' ? 'VEC4' : 'VEC3').setArray(new Float32Array(vals)).setBuffer(buffer)).setInterpolation('LINEAR')
    a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(nos[alvo]).setTargetPath(prop).setSampler(s))
  }
}
const qy = J.quadril[1], T = Math.PI * 2
clip('parado', 4, 40, (u) => { const r = Math.sin(u * T); return { 'quadril.pos': [0, qy + r * 0.002, J.quadril[2]], pescoco: [0.03 + r * 0.01, Math.sin(u * T) * 0.08, 0], ombro_0: [r * 0.02, 0, -0.05], ombro_1: [-r * 0.02, 0, 0.05], cotovelo_0: [-0.15, 0, 0], cotovelo_1: [-0.15, 0, 0] } })
clip('andando', 1.1, 22, (u) => { const c = Math.sin(u * T), j0 = Math.max(0, Math.sin(u * T + 1.3)), j1 = Math.max(0, -Math.sin(u * T + 1.3)); return {
  'quadril.pos': [0, qy + Math.abs(Math.cos(u * T)) * 0.012, J.quadril[2]], quadril: [0, c * 0.08, Math.sin(u * T) * 0.03],
  coxa_0: [c * 0.42, 0, 0], coxa_1: [-c * 0.42, 0, 0], joelho_0: [j0 * 0.75, 0, 0], joelho_1: [j1 * 0.75, 0, 0],
  tornozelo_0: [Math.sin(u * T - 0.6) * 0.28 - j0 * 0.2, 0, 0], tornozelo_1: [-Math.sin(u * T - 0.6) * 0.28 - j1 * 0.2, 0, 0],
  ombro_0: [-c * 0.38, 0, -0.07], ombro_1: [c * 0.38, 0, 0.07], cotovelo_0: [-0.35 - Math.max(0, -c) * 0.18, 0, 0], cotovelo_1: [-0.35 - Math.max(0, c) * 0.18, 0, 0], pescoco: [0.02, -c * 0.07, 0] } })
clip('sentado', 3, 30, (u) => { const r = Math.sin(u * T * 4); return { 'quadril.pos': [0, (J.joelho_0[1] + J.joelho_1[1]) / 2 + 0.01, J.quadril[2]], coxa_0: [-Math.PI / 2, 0, 0], coxa_1: [-Math.PI / 2, 0, 0], joelho_0: [Math.PI / 2, 0, 0], joelho_1: [Math.PI / 2, 0, 0], ombro_0: [-0.55, 0, 0], ombro_1: [-0.55, 0, 0], cotovelo_0: [-0.9 + r * 0.05, 0, 0], cotovelo_1: [-0.9 - r * 0.05, 0, 0], pescoco: [0.12, 0, 0] } })
await io.write(process.argv[3], doc)
console.log('ok')
