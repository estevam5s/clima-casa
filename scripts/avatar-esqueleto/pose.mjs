import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import * as THREE from 'three'
import sharp from 'sharp'
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[4] || 'rig.glb')
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0]
const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray()
const JO = prim.getAttribute('JOINTS_0').getArray(), WE = prim.getAttribute('WEIGHTS_0').getArray()
const skin = doc.getRoot().listSkins()[0], joints = skin.listJoints(), ibm = skin.getInverseBindMatrices().getArray()
const nomes = joints.map((j) => j.getName().replace('clima_', ''))
const poses = {
  sentado: { quadril: { pos: [0, 0.275, 0.016] }, coxa_0: [-Math.PI/2,0,0], coxa_1: [-Math.PI/2,0,0], joelho_0: [Math.PI/2,0,0], joelho_1: [Math.PI/2,0,0], ombro_0: [-0.55,0,0], ombro_1: [-0.55,0,0], cotovelo_0: [-0.9,0,0], cotovelo_1: [-0.9,0,0], pescoco: [0.12,0,0] },
  andando: { coxa_0: [0.42,0,0], coxa_1: [-0.42,0,0], joelho_1: [0.7,0,0], ombro_0: [-0.38,0,-0.07], ombro_1: [0.38,0,0.07], cotovelo_0: [-0.4,0,0], cotovelo_1: [-0.4,0,0] },
}
const pose = poses[process.argv[2]] || {}
// mundo de cada osso
const obj = {}
const raizO = new THREE.Object3D()
const mk = (node, pai) => { const o = new THREE.Object3D(); o.position.fromArray(node.getTranslation()); const n = node.getName().replace('clima_', ''); obj[n] = o; pai.add(o); for (const c of node.listChildren()) mk(c, o) }
mk(joints[0].listParents().find((p) => p.propertyType === 'Node'), raizO)
for (const [n, v] of Object.entries(pose)) { if (Array.isArray(v)) obj[n].rotation.set(...v); else obj[n].position.fromArray(v.pos) }
raizO.updateMatrixWorld(true)
const M = nomes.map((n, i) => new THREE.Matrix4().multiplyMatrices(obj[n].matrixWorld, new THREE.Matrix4().fromArray(ibm, i * 16)))
const Q = new Float32Array(P.length), v = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3()
for (let i = 0; i < P.length / 3; i++) { acc.set(0,0,0); v.fromArray(P, i*3); for (let k = 0; k < 4; k++) { const w = WE[i*4+k]; if (w) acc.addScaledVector(tmp.copy(v).applyMatrix4(M[JO[i*4+k]]), w) } acc.toArray(Q, i*3) }
const cores = [[200,200,200],[255,80,80],[80,255,80],[80,80,255],[255,255,80],[255,80,255],[80,255,255],[255,160,60],[160,60,255],[60,160,120],[200,120,160],[120,200,60]]
const S = 600
const render = (ax, ay, az, sx, arq) => {
  const buf = Buffer.alloc(S*S*3, 30), zb = new Float32Array(S*S).fill(-1e9)
  const pr = (i) => [S/2 + sx*Q[i*3+ax]*S/1.05, S - 10 - Q[i*3+ay]*S/1.05, Q[i*3+az]*(az === 2 ? 1 : sx)]
  for (let t = 0; t < I.length; t += 3) {
    const a = pr(I[t]), b = pr(I[t+1]), c = pr(I[t+2])
    const minx = Math.max(0, Math.floor(Math.min(a[0],b[0],c[0]))), maxx = Math.min(S-1, Math.ceil(Math.max(a[0],b[0],c[0])))
    const miny = Math.max(0, Math.floor(Math.min(a[1],b[1],c[1]))), maxy = Math.min(S-1, Math.ceil(Math.max(a[1],b[1],c[1])))
    const d = (b[0]-a[0])*(c[1]-a[1]) - (c[0]-a[0])*(b[1]-a[1]); if (Math.abs(d) < 1e-9) continue
    const col = cores[JO[I[t]*4]], sh = process.argv[3] === 'cor' ? 1 : 0
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const w1 = ((b[0]-x)*(c[1]-y) - (c[0]-x)*(b[1]-y))/d, w2 = ((c[0]-x)*(a[1]-y) - (a[0]-x)*(c[1]-y))/d, w3 = 1-w1-w2
      if (w1 < 0 || w2 < 0 || w3 < 0) continue
      const z = w1*a[2]+w2*b[2]+w3*c[2], k = y*S+x
      if (z > zb[k]) { zb[k] = z; const l = Math.max(0.3, Math.min(1, 0.6 + z*4)); for (let c2 = 0; c2 < 3; c2++) buf[k*3+c2] = (sh ? col[c2] : 220) * l }
    }
  }
  return sharp(buf, { raw: { width: S, height: S, channels: 3 } }).png().toFile(arq)
}
const nome = process.argv[2] || 'repouso'
await render(0, 1, 2, 1, `${nome}-frente.png`); await render(2, 1, 0, 1, `${nome}-lado.png`)
