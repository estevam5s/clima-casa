// Deixa o modelo leve para o mapa: solda vértices, simplifica (razão = 3º argumento) e reduz texturas a 1024 px JPEG.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, simplify, dedup, prune, textureCompress } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(process.argv[2])
await MeshoptSimplifier.ready
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(process.argv[4]||0.03), error: 0.002 }), dedup(), prune(),
  textureCompress({ encoder: sharp, resize: [1024, 1024], targetFormat: 'jpeg', quality: 85 }))
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) console.log('tri', p.getIndices().getCount()/3, 'vert', p.getAttribute('POSITION').getCount())
const bb = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION'); console.log('min', bb.getMin([]), 'max', bb.getMax([]))
await io.write(process.argv[3], doc)
