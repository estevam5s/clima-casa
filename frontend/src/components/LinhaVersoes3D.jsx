import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Linha do tempo das versões em 3D (Three.js): cada versão é um marco numa curva suave, do mais antigo (fundo) ao mais
// novo (frente). O tamanho do marco é a quantidade de mudanças; a cor, o tipo que mais aparece nela. Passar o mouse
// mostra a versão; clicar leva até ela na lista. Gira devagar; com "reduzir movimento" fica parada.
const COR = { novo: 0x0f766a, melhorias: 0x2563eb, seguranca: 0xb45309, correcoes: 0x64748b }

export default function LinhaVersoes3D({ versoes, ir }) {
  const ref = useRef(null)
  const [dica, setDica] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el || !versoes?.length) return undefined
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const escuro = document.documentElement.classList.contains('dark')
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 2.2, 9.5); camera.lookAt(0, 0, 0)
    cena.add(new THREE.HemisphereLight(0xffffff, escuro ? 0x0f172a : 0xe2e8f0, escuro ? 1.1 : 1.6))
    const sol = new THREE.DirectionalLight(0xffffff, 1.4); sol.position.set(3, 6, 5); cena.add(sol)
    const grupo = new THREE.Group(); cena.add(grupo)
    // da mais antiga para a mais nova
    const lista = [...versoes].reverse()
    const n = lista.length
    const pos = (i) => {
      const k = n > 1 ? i / (n - 1) : 0.5
      return new THREE.Vector3((k - 0.5) * 8.4, Math.sin(k * Math.PI * 1.6) * 0.7, Math.cos(k * Math.PI * 1.2) * 1.1 - 0.2)
    }
    const curva = new THREE.CatmullRomCurve3(lista.map((_, i) => pos(i)))
    if (n > 1) {
      const tubo = new THREE.Mesh(new THREE.TubeGeometry(curva, 120, 0.025, 8, false), new THREE.MeshStandardMaterial({ color: escuro ? 0x334155 : 0xcbd5e1, roughness: 0.6 }))
      grupo.add(tubo)
    }
    // pontinhos andando pela linha (o "tempo" passando)
    const nPts = 40, ptsGeo = new THREE.BufferGeometry(), arr = new Float32Array(nPts * 3)
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const pts = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ color: 0x14b8a6, size: 0.06, transparent: true, opacity: 0.8 }))
    if (n > 1) grupo.add(pts)
    const marcos = lista.map((v, i) => {
      const total = ['novo', 'melhorias', 'seguranca', 'correcoes'].reduce((s, k) => s + (v[k]?.length || 0), 0)
      const dom = ['novo', 'melhorias', 'seguranca', 'correcoes'].sort((a, b) => (v[b]?.length || 0) - (v[a]?.length || 0))[0]
      const raio = 0.14 + Math.min(0.26, total * 0.022)
      const atual = i === n - 1
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(raio, 3), new THREE.MeshStandardMaterial({ color: COR[dom], roughness: 0.35, metalness: 0.1, emissive: COR[dom], emissiveIntensity: atual ? 0.35 : 0.08 }))
      m.position.copy(pos(i)); m.userData = { v, total, raio, atual }; grupo.add(m)
      if (atual) {   // anel em volta da versão atual
        const anel = new THREE.Mesh(new THREE.TorusGeometry(raio + 0.12, 0.012, 8, 48), new THREE.MeshBasicMaterial({ color: COR[dom] }))
        anel.position.copy(m.position); m.userData.anel = anel; grupo.add(anel)
      }
      // haste até o "chão" (sombra da data)
      const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, m.position.y + 1.6, 6), new THREE.MeshBasicMaterial({ color: escuro ? 0x334155 : 0xcbd5e1 }))
      haste.position.set(m.position.x, (m.position.y - 1.6) / 2, m.position.z); grupo.add(haste)
      return m
    })
    const chao = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshBasicMaterial({ color: escuro ? 0x0f172a : 0xf1f5f9, transparent: true, opacity: 0.6 }))
    chao.rotation.x = -Math.PI / 2; chao.position.y = -1.6; cena.add(chao)
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(-9, -9)
    let sobre = null
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.z = w < 640 ? 13 : 9.5; camera.updateProjectionMatrix() }
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    const mv = (e) => { const r = el.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) }
    const sai = () => { mouse.set(-9, -9) }
    const clica = () => { if (sobre) ir(sobre.userData.v.versao) }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerleave', sai); el.addEventListener('click', clica)
    let raf = 0, t0 = performance.now(), visivel = true
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting }); io.observe(el)
    const quadro = (agora) => {
      raf = requestAnimationFrame(quadro)
      if (!visivel) return
      const t = Math.max(0, (agora - t0) / 1000)   // o 1º quadro pode vir com horário antes de t0
      if (!parado) grupo.rotation.y = Math.sin(t * 0.18) * 0.32
      if (n > 1) {
        for (let i = 0; i < nPts; i++) { const u = ((((i / nPts) + (parado ? 0 : t * 0.04)) % 1) + 1) % 1, p = curva.getPointAt(Math.min(0.9999, u)); arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z }
        ptsGeo.attributes.position.needsUpdate = true
      }
      ray.setFromCamera(mouse, camera)
      const hit = ray.intersectObjects(marcos)[0]?.object || null
      if (hit !== sobre) {
        sobre = hit; el.style.cursor = hit ? 'pointer' : 'default'
        if (hit) { const p = hit.getWorldPosition(new THREE.Vector3()).project(camera); setDica({ v: hit.userData.v, total: hit.userData.total, x: (p.x * 0.5 + 0.5) * 100, y: (-p.y * 0.5 + 0.5) * 100 }) } else setDica(null)
      }
      marcos.forEach((m) => {
        const alvo = m === sobre ? 1.35 : 1
        m.scale.setScalar(THREE.MathUtils.lerp(m.scale.x, alvo, 0.15))
        if (m.userData.anel) { m.userData.anel.rotation.x = Math.PI / 2 + Math.sin(t) * 0.25; m.userData.anel.rotation.y = parado ? 0 : t * 0.6 }
      })
      renderer.render(cena, camera)
    }
    raf = requestAnimationFrame(quadro)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect()
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerleave', sai); el.removeEventListener('click', clica)
      cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() })
      renderer.dispose(); renderer.domElement.remove()
    }
  }, [versoes, ir])
  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" role="img" aria-label={`Linha do tempo com ${versoes?.length || 0} versões; passe o mouse para ver cada uma e clique para ir até ela`} />
      {dica && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[130%] rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md" /* marca: dica flutua */ style={{ left: `${dica.x}%`, top: `${dica.y}%` }}>
          <p className="font-semibold">Versão {dica.v.versao}</p>
          <p className="max-w-[16rem] truncate text-muted-foreground">{dica.v.titulo}</p>
          <p className="tabular text-muted-foreground">{dica.total} mudança(s)</p>
        </div>
      )}
    </div>
  )
}
