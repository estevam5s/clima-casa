import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { clone as clonarComOssos } from 'three/examples/jsm/utils/SkeletonUtils.js'

// caixa do modelo JÁ com o esqueleto aplicado: malhas com ossos costumam vir em centímetros na geometria e ser
// escaladas pelos ossos (medir só a geometria dá 100x o tamanho real)
export function caixaReal(modelo) {
  modelo.updateMatrixWorld(true)
  const caixa = new THREE.Box3(), b = new THREE.Box3()
  modelo.traverse((o) => {
    if (!o.isMesh) return
    if (o.isSkinnedMesh) { o.skeleton?.update?.(); o.computeBoundingBox(); b.copy(o.boundingBox).applyMatrix4(o.matrixWorld) }
    else { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld) }
    caixa.union(b)
  })
  return caixa
}
import { api } from '../../api'

// Visualizador de um avatar GLB: corpo inteiro centralizado com os pés visíveis, giro 360°, zoom limitado, luz de estúdio,
// sombra suave, animações com transição (crossfade) e expressões por morph target quando o modelo tiver.
// Não inventa animação: só toca os clips que existem no arquivo.
const cache = new Map()   // id → Promise<gltf> (cada viewer clona a cena; o arquivo é baixado uma vez)

export function carregarAvatar(id) {
  if (!cache.has(id)) {
    cache.set(id, api.get(`/api/avatares/${id}/arquivo`).then(({ url, ...meta }) => new Promise((ok, falha) => new GLTFLoader().load(url, (g) => { g.meta = meta; ok(g) }, undefined, falha))).catch((e) => { cache.delete(id); throw e }))
  }
  return cache.get(id)
}

const AvatarViewer = forwardRef(function AvatarViewer({ avatarId, animacao = null, velocidade = 1, repetir = true, expressao = null, intensidade = 1, fundoTransparente = true, aoCarregar, aoErro, className = 'h-96' }, ref) {
  const caixa = useRef(null), E = useRef({})
  const [estado, setEstado] = useState('carregando')
  useImperativeHandle(ref, () => ({ reiniciar: () => { const a = E.current.atual; if (a) { a.reset(); a.play() } } }))
  useEffect(() => {
    const el = caixa.current
    if (!el || !avatarId) return undefined
    let vivo = true
    setEstado('carregando')
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: fundoTransparente })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05
    renderer.domElement.style.display = 'block'; el.appendChild(renderer.domElement)
    const perda = (e) => { e.preventDefault(); setEstado('erro'); aoErro?.('O navegador perdeu o acesso à placa de vídeo. Recarregue a página.') }
    renderer.domElement.addEventListener('webglcontextlost', perda)
    const cena = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 100)
    cena.add(new THREE.HemisphereLight(0xffffff, 0x8b8b8b, 1.1))
    const chave = new THREE.DirectionalLight(0xffffff, 2.2); chave.position.set(2, 4, 3); chave.castShadow = true; chave.shadow.mapSize.set(1024, 1024); chave.shadow.radius = 4; cena.add(chave)
    const recorte = new THREE.DirectionalLight(0xdbeafe, 0.9); recorte.position.set(-3, 2.5, -2.5); cena.add(recorte)
    const chao = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.ShadowMaterial({ opacity: 0.22 })); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; cena.add(chao)
    const controles = new OrbitControls(cam, renderer.domElement); controles.enableDamping = true; controles.enablePan = false
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix() }
    medir(); const ro = new ResizeObserver(medir); ro.observe(el)
    const relogio = new THREE.Clock()
    let raf = 0
    const quadro = () => { raf = requestAnimationFrame(quadro); if (document.hidden) { relogio.getDelta(); return } const dt = Math.min(relogio.getDelta(), 0.05); E.current.mixer?.update(dt); controles.update(); renderer.render(cena, cam) }
    carregarAvatar(avatarId).then((gltf) => {
      if (!vivo) return
      const modelo = clonarComOssos(gltf.scene)   // clone que religa o esqueleto (malhas com ossos)
      modelo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
      // enquadra: altura do corpo inteiro, pés no chão
      const bb = caixaReal(modelo), tam = bb.getSize(new THREE.Vector3()), centro = bb.getCenter(new THREE.Vector3())
      modelo.position.x -= centro.x; modelo.position.z -= centro.z; modelo.position.y -= bb.min.y
      cena.add(modelo)
      const alt = tam.y || 1.8
      cam.position.set(alt * 0.9, alt * 0.62, alt * 2.4); controles.target.set(0, alt * 0.5, 0)
      controles.minDistance = alt * 0.8; controles.maxDistance = alt * 5; controles.maxPolarAngle = Math.PI * 0.55
      chao.scale.setScalar(alt)
      const mixer = new THREE.AnimationMixer(modelo)
      const acoes = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]))
      const morphs = []
      modelo.traverse((o) => { if (o.morphTargetDictionary) morphs.push(o) })
      E.current = { mixer, acoes, morphs, modelo, atual: null }
      try { if (localStorage.getItem('clima-debug-3d') === '1') window.__avatar = { ...E.current, cena, cam, controles, bb, alt } } catch { /* sem armazenamento */ }
      setEstado('pronto')
      aoCarregar?.({ clips: gltf.animations.map((c) => c.name), morphs: [...new Set(morphs.flatMap((m) => Object.keys(m.morphTargetDictionary)))], altura: alt })
    }).catch((e) => { if (vivo) { setEstado('erro'); aoErro?.(e?.message || 'Não deu para abrir o modelo.') } })
    quadro()
    return () => {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect(); controles.dispose()
      renderer.domElement.removeEventListener('webglcontextlost', perda)
      E.current.mixer?.stopAllAction()
      cena.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.()) } })
      renderer.dispose(); renderer.domElement.remove(); E.current = {}
    }
  }, [avatarId, fundoTransparente])   // eslint-disable-line react-hooks/exhaustive-deps

  // troca de animação com crossfade (0,35 s); sem clip pedido = para tudo
  useEffect(() => {
    const { acoes } = E.current
    if (!acoes || estado !== 'pronto') return
    const nova = animacao ? acoes[animacao] : null
    const velha = E.current.atual
    if (nova === velha) { if (nova) nova.timeScale = velocidade; return }
    if (nova) {
      nova.reset(); nova.setLoop(repetir ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); nova.clampWhenFinished = !repetir; nova.timeScale = velocidade
      nova.play(); if (velha) velha.crossFadeTo(nova, 0.35, false)
    } else if (velha) velha.fadeOut(0.3)
    E.current.atual = nova
  }, [animacao, estado, repetir, velocidade])
  useEffect(() => { if (E.current.atual) E.current.atual.timeScale = velocidade }, [velocidade])
  // expressão: zera as outras e liga a escolhida na intensidade pedida
  useEffect(() => {
    for (const m of E.current.morphs || []) {
      const dic = m.morphTargetDictionary
      for (const [nome, i] of Object.entries(dic)) m.morphTargetInfluences[i] = expressao && nome === expressao ? intensidade : 0
    }
  }, [expressao, intensidade, estado])
  return (
    <div className={`relative ${className}`}>
      <div ref={caixa} className="h-full w-full" role="img" aria-label="Avatar 3D: arraste para girar, role para aproximar" />
      {estado === 'carregando' && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Abrindo o modelo…</p>}
      {estado === 'erro' && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-600">Não deu para abrir o modelo.</p>}
    </div>
  )
})
export default AvatarViewer
