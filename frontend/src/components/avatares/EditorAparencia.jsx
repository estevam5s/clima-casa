import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Brush, Download, Hand, PaintBucket, Pipette, Redo2, RotateCcw, Save, Undo2 } from 'lucide-react'
import { api } from '../../api'
import { Botao, Modal, useToast } from '../ui'
import { esquecerAvatar } from './AvatarViewer'
import { AJUSTES_PADRAO, aplicarOp, corNoPonto, pincelada, reconstruir, rgbHex } from './textura'

// Editor de aparência de um avatar .glb (qualquer modelo: pessoa, animal, veículo). Trabalha sobre o ORIGINAL guardado
// e reaplica os ajustes salvos: cores globais, recolorir região (clique no modelo), pincel, material e forma. Salvar
// gera um .glb novo (o original continua guardado para "Voltar ao original").
const FERRAMENTAS = [['girar', 'Girar', Hand], ['pincel', 'Pincel', Brush], ['recolorir', 'Recolorir região', PaintBucket], ['conta', 'Pegar cor', Pipette]]
const copia = (x) => JSON.parse(JSON.stringify(x))
const mesclar = (a) => ({ cor: { ...AJUSTES_PADRAO.cor, ...(a?.cor || {}) }, material: { ...AJUSTES_PADRAO.material, ...(a?.material || {}) },
  forma: { ...AJUSTES_PADRAO.forma, ...(a?.forma || {}) }, ops: [...(a?.ops || [])] })

function Faixa({ rotulo, valor, min, max, passo = 0.01, aoMudar, sufixo = '', fmt }) {
  return (
    <label className="block text-xs">
      <span className="flex justify-between"><span>{rotulo}</span><span className="tabular text-muted-foreground">{fmt ? fmt(valor) : valor}{sufixo}</span></span>
      <input type="range" min={min} max={max} step={passo} value={valor} onChange={(e) => aoMudar(+e.target.value)} className="mt-1 w-full accent-[hsl(var(--primary))]" aria-label={rotulo} />
    </label>
  )
}

function Grupo({ titulo, children, aberto = true }) {
  return (
    <details open={aberto} className="group border-b border-border py-3 last:border-0">
      <summary className="cursor-pointer select-none text-sm font-semibold">{titulo}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  )
}

export default function EditorAparencia({ avatar, aoSalvar, aoFechar }) {
  const toast = useToast()
  const caixa = useRef(null), E = useRef({})
  const [estado, setEstado] = useState('carregando')
  const [aj, setAj] = useState(() => mesclar(avatar.ajustes))
  const [hist, setHist] = useState({ antes: [], depois: [] })
  const [ferr, setFerr] = useState('girar')
  const [pincel, setPincel] = useState({ cor: '#c0392b', raio: 0.02, opac: 0.9, dureza: 0.6 })
  const [recor, setRecor] = useState({ para: '#1e40af', tol: 0.18, conectado: true })
  const [salvando, setSalvando] = useState('')
  const [restaurar, setRestaurar] = useState(false)
  const ajRef = useRef(aj); ajRef.current = aj
  const ferrRef = useRef(ferr); ferrRef.current = ferr
  const pincelRef = useRef(pincel); pincelRef.current = pincel
  const recorRef = useRef(recor); recorRef.current = recor

  const registrar = useCallback((novo) => { setHist((h) => ({ antes: [...h.antes.slice(-40), copia(ajRef.current)], depois: [] })); setAj(novo) }, [])

  // cena, carga do original e textura de trabalho
  useEffect(() => {
    const el = caixa.current
    let vivo = true
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.domElement.style.display = 'block'; el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 200)
    cena.add(new THREE.HemisphereLight(0xffffff, 0x8b8b8b, 1.2))
    const sol = new THREE.DirectionalLight(0xffffff, 2.1); sol.position.set(2, 4, 3); cena.add(sol)
    const contra = new THREE.DirectionalLight(0xdbeafe, 0.9); contra.position.set(-3, 2.5, -2.5); cena.add(contra)
    const grade = new THREE.GridHelper(10, 20, 0x9ca3af, 0xd4d4d8); grade.material.transparent = true; grade.material.opacity = 0.35; cena.add(grade)
    const controles = new OrbitControls(cam, renderer.domElement); controles.enableDamping = true
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix() }
    medir(); const ro = new ResizeObserver(medir); ro.observe(el)
    let raf = 0
    const quadro = () => { raf = requestAnimationFrame(quadro); controles.update(); renderer.render(cena, cam) }
    quadro()
    api.get(`/api/avatares/${avatar.id}/original`).then(({ url }) => new Promise((ok, falha) => new GLTFLoader().load(url, ok, undefined, falha))).then((gltf) => {
      if (!vivo) return
      const raiz = new THREE.Group(); raiz.name = avatar.nome
      const modelo = gltf.scene; raiz.add(modelo)
      const malhas = [], texs = new Map(), materiais = []
      modelo.traverse((o) => {
        if (!o.isMesh) return
        malhas.push(o)
        const lista = Array.isArray(o.material) ? o.material : [o.material]
        const novos = lista.map((m) => {
          const n = m.clone(); n.userData.orig = { roughness: m.roughness, metalness: m.metalness }
          if (m.map?.image && !texs.has(m.map.uuid)) {
            const img = m.map.image, W = img.width, H = img.height
            const c0 = document.createElement('canvas'); c0.width = W; c0.height = H
            const x0 = c0.getContext('2d', { willReadFrequently: true }); x0.drawImage(img, 0, 0)
            const base = x0.getImageData(0, 0, W, H)
            const trabalho = document.createElement('canvas'); trabalho.width = W; trabalho.height = H
            const tex = new THREE.CanvasTexture(trabalho); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace
            tex.wrapS = m.map.wrapS; tex.wrapT = m.map.wrapT; tex.anisotropy = 4
            texs.set(m.map.uuid, { base, canvas: trabalho, tex })
          }
          if (m.map) n.map = texs.get(m.map.uuid).tex
          materiais.push(n); return n
        })
        o.material = Array.isArray(o.material) ? novos : novos[0]
      })
      // centraliza com os pés no chão
      const bb = new THREE.Box3().setFromObject(modelo), tam = bb.getSize(new THREE.Vector3()), centro = bb.getCenter(new THREE.Vector3())
      modelo.position.set(-centro.x, -bb.min.y, -centro.z)
      cena.add(raiz)
      const alt = Math.max(tam.x, tam.y, tam.z) || 1.8
      cam.position.set(alt * 0.9, alt * 0.7, alt * 2.2); controles.target.set(0, tam.y * 0.5, 0)
      controles.minDistance = alt * 0.3; controles.maxDistance = alt * 6
      Object.assign(E.current, { renderer, cena, cam, controles, raiz, modelo, malhas, texs, materiais, alt, tamanho: tam })
      setEstado('pronto')
    }).catch((e) => { if (vivo) { setEstado('erro'); toast(e?.message || 'Não deu para abrir o modelo.', 'erro') } })

    // pintar e recolorir com o ponteiro (arrastar com o botão direito continua girando)
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2()
    const acertar = (ev) => {
      const r = renderer.domElement.getBoundingClientRect()
      ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ptr, cam)
      const hit = ray.intersectObjects(E.current.malhas || [], false)[0]
      if (!hit?.uv) return null
      const mat = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material
      const t = [...(E.current.texs?.values() || [])].find((x) => x.tex === mat?.map)
      return t ? { u: hit.uv.x - Math.floor(hit.uv.x), v: hit.uv.y - Math.floor(hit.uv.y), t } : null
    }
    let tracando = null
    const baixo = (ev) => {
      if (ev.button !== 0 || ferrRef.current === 'girar') return
      const h = acertar(ev)
      if (!h) return
      controles.enabled = false
      const f = ferrRef.current
      if (f === 'conta') { const c = corNoPonto(h.t.canvas, h.u, h.v); setPincel((p) => ({ ...p, cor: rgbHex(c) })); setRecor((p) => ({ ...p, para: rgbHex(c) })); toast(`Cor ${rgbHex(c)} escolhida.`); return }
      if (f === 'recolorir') {
        const de = corNoPonto(h.t.canvas, h.u, h.v)
        const op = { tipo: 'recolorir', de, para: recorRef.current.para, tol: recorRef.current.tol, conectado: recorRef.current.conectado, u: +h.u.toFixed(5), v: +h.v.toFixed(5) }
        const ctx = h.t.canvas.getContext('2d', { willReadFrequently: true }); aplicarOp(ctx, h.t.canvas.width, h.t.canvas.height, op); h.t.tex.needsUpdate = true
        E.current.semReconstruir = true
        registrar({ ...ajRef.current, ops: [...ajRef.current.ops, op] })
        return
      }
      const p = pincelRef.current
      tracando = { op: { tipo: 'traco', cor: p.cor, raio: p.raio, opac: p.opac, dureza: p.dureza, pts: [[+h.u.toFixed(5), +h.v.toFixed(5)]] }, t: h.t }
      pincelada(h.t.canvas.getContext('2d'), h.t.canvas.width, h.t.canvas.height, h.u, h.v, tracando.op); h.t.tex.needsUpdate = true
      renderer.domElement.setPointerCapture?.(ev.pointerId)
    }
    const mover = (ev) => {
      if (!tracando) return
      const h = acertar(ev)
      if (!h || h.t !== tracando.t) return
      const pts = tracando.op.pts, [u0, v0] = pts[pts.length - 1]
      if (Math.hypot(h.u - u0, h.v - v0) < tracando.op.raio * 0.3) return
      pts.push([+h.u.toFixed(5), +h.v.toFixed(5)])
      const ctx = h.t.canvas.getContext('2d'), W = h.t.canvas.width, H = h.t.canvas.height
      const passos = Math.ceil(Math.hypot((h.u - u0) * W, (h.v - v0) * H) / Math.max(1, tracando.op.raio * W * 0.35))
      if (passos < 60) for (let k = 1; k <= passos; k++) pincelada(ctx, W, H, u0 + ((h.u - u0) * k) / passos, v0 + ((h.v - v0) * k) / passos, tracando.op)
      h.t.tex.needsUpdate = true
    }
    const cima = () => {
      controles.enabled = true
      if (!tracando) return
      const op = tracando.op; tracando = null
      if (op.pts.length > 400) op.pts = op.pts.filter((_, i) => i % Math.ceil(op.pts.length / 400) === 0 || i === op.pts.length - 1)
      E.current.semReconstruir = true
      registrar({ ...ajRef.current, ops: [...ajRef.current.ops, op] })
    }
    renderer.domElement.addEventListener('pointerdown', baixo)
    renderer.domElement.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', cima)
    return () => {
      vivo = false; cancelAnimationFrame(raf); ro.disconnect(); controles.dispose()
      renderer.domElement.removeEventListener('pointerdown', baixo); renderer.domElement.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', cima)
      cena.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m?.map?.dispose?.(); m?.dispose?.() }) } })
      renderer.dispose(); renderer.domElement.remove(); E.current = {}
    }
  }, [avatar.id])   // eslint-disable-line react-hooks/exhaustive-deps

  // cores + operações → textura (debounce); material e forma → direto na cena
  useEffect(() => {
    if (estado !== 'pronto') return undefined
    if (E.current.semReconstruir) { E.current.semReconstruir = false; return undefined }   // traço/recolorir já foi desenhado
    const id = setTimeout(() => {
      for (const t of E.current.texs.values()) { reconstruir(t.base, t.canvas, aj); t.tex.needsUpdate = true }
    }, 70)
    return () => clearTimeout(id)
  }, [aj.cor, aj.ops, estado])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (estado !== 'pronto') return
    const m = aj.material
    for (const mat of E.current.materiais) {
      mat.roughness = m.aspereza ?? mat.userData.orig.roughness ?? 0.8
      mat.metalness = m.metal ?? mat.userData.orig.metalness ?? 0
      mat.emissive = new THREE.Color(m.emissao || '#000000'); mat.emissiveIntensity = m.emissaoForca || 0
      mat.transparent = (m.opacidade ?? 1) < 1; mat.opacity = m.opacidade ?? 1
      if (mat.flatShading !== !!m.plano) { mat.flatShading = !!m.plano; mat.needsUpdate = true }
      mat.wireframe = !!m.aramado
    }
    const f = aj.forma, r = E.current.raiz
    r.scale.set(f.escala * f.largura * (f.espelhar ? -1 : 1), f.escala * f.altura, f.escala * f.profundidade)
    r.rotation.y = THREE.MathUtils.degToRad(f.giro || 0)
  }, [aj.material, aj.forma, estado])

  const mudar = (grupo, campo, valor, registrarAgora = false) => {
    const novo = { ...aj, [grupo]: { ...aj[grupo], [campo]: valor } }
    if (registrarAgora) registrar(novo); else setAj(novo)
  }
  const marcarHist = () => setHist((h) => (h.antes.length && JSON.stringify(h.antes[h.antes.length - 1]) === JSON.stringify(aj) ? h : { antes: [...h.antes.slice(-40), copia(aj)], depois: [] }))
  const desfazer = () => setHist((h) => { if (!h.antes.length) return h; const ant = h.antes[h.antes.length - 1]; setAj(ant); return { antes: h.antes.slice(0, -1), depois: [copia(aj), ...h.depois] } })
  const refazer = () => setHist((h) => { if (!h.depois.length) return h; const [prox, ...resto] = h.depois; setAj(prox); return { antes: [...h.antes, copia(aj)], depois: resto } })
  useEffect(() => {
    const tecla = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer() }
    }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  })

  const exportar = async () => {
    const { raiz } = E.current
    return new GLTFExporter().parseAsync(raiz, { binary: true, maxTextureSize: 2048 })
  }
  const baixar = async () => {
    setSalvando('baixar')
    try {
      const glb = await exportar(), url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }))
      Object.assign(document.createElement('a'), { href: url, download: `${avatar.nome.replace(/[^\w-]+/g, '-').toLowerCase()}-editado.glb` }).click()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando('') }
  }
  const salvar = async () => {
    setSalvando('salvar')
    try {
      const glb = await exportar()
      const corpo = new Blob([glb], { type: 'model/gltf-binary' })
      const { upload_url: url } = await api.post(`/api/avatares/${avatar.id}/versao`, { tamanho: corpo.size, ajustes: aj })
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true' }, body: corpo })
      if (!r.ok) throw new Error(`Envio recusado (${r.status}).`)
      await api.post(`/api/avatares/${avatar.id}/versao/confirmar`, { ajustes: aj })
      esquecerAvatar(avatar.id)
      toast('Aparência salva. O mapa e a biblioteca usam a versão nova.'); aoSalvar?.()
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando('') }
  }
  const voltarOriginal = async () => {
    try {
      if (avatar.editado) await api.post(`/api/avatares/${avatar.id}/restaurar`)
      esquecerAvatar(avatar.id); registrar(mesclar(null)); setRestaurar(false); toast('O avatar voltou ao original.'); aoSalvar?.(true)
    } catch (e) { toast(e.message, 'erro') }
  }

  const c = aj.cor, m = aj.material, f = aj.forma
  const graus = (v) => `${Math.round(v)}°`, pct = (v) => `${Math.round(v * 100)}%`
  return (
    <section className="cartao overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative">
          <div ref={caixa} className="h-[420px] w-full bg-muted/30 sm:h-[560px]" role="img" aria-label="Modelo 3D em edição: arraste para girar, role para aproximar" style={{ cursor: ferr === 'girar' ? 'grab' : 'crosshair' }} />
          {estado === 'carregando' && <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Abrindo o original…</p>}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm" role="toolbar" aria-label="Ferramentas"> {/* marca: barra flutua sobre o 3D */}
            {FERRAMENTAS.map(([k, r, I]) => (
              <button key={k} onClick={() => setFerr(k)} aria-pressed={ferr === k} title={r} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs ${ferr === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}><I className="h-4 w-4" /><span className="hidden sm:inline">{r}</span></button>
            ))}
            <span className="mx-1 w-px bg-border" />
            <button onClick={desfazer} disabled={!hist.antes.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
            <button onClick={refazer} disabled={!hist.depois.length} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
          </div>
          <p className="absolute bottom-3 left-3 rounded bg-black/55 px-2 py-1 text-[11px] text-white">
            {ferr === 'girar' ? 'Arraste para girar, role para aproximar.' : ferr === 'pincel' ? 'Pinte arrastando sobre o modelo. Botão direito gira.' : ferr === 'recolorir' ? 'Clique numa parte (roupa, carroceria) para trocar a cor dela.' : 'Clique no modelo para pegar a cor.'}
          </p>
        </div>
        <div onPointerDownCapture={marcarHist} className="max-h-[560px] overflow-y-auto border-t border-border px-4 xl:border-l xl:border-t-0">
          <Grupo titulo="Cores do modelo">
            <Faixa rotulo="Matiz" valor={c.matiz} min={-180} max={180} passo={1} fmt={graus} aoMudar={(v) => mudar('cor', 'matiz', v)} />
            <Faixa rotulo="Saturação" valor={c.saturacao} min={0} max={2.5} fmt={pct} aoMudar={(v) => mudar('cor', 'saturacao', v)} />
            <Faixa rotulo="Brilho" valor={c.brilho} min={0.2} max={2} fmt={pct} aoMudar={(v) => mudar('cor', 'brilho', v)} />
            <Faixa rotulo="Contraste" valor={c.contraste} min={0.3} max={2} fmt={pct} aoMudar={(v) => mudar('cor', 'contraste', v)} />
            <div className="flex items-center gap-3 text-xs"><label className="flex items-center gap-2">Tingir<input type="color" value={c.tinta} onChange={(e) => mudar('cor', 'tinta', e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-border" aria-label="Cor para tingir" /></label>
              <div className="flex-1"><Faixa rotulo="Força" valor={c.tintaForca} min={0} max={1} fmt={pct} aoMudar={(v) => mudar('cor', 'tintaForca', v)} /></div></div>
          </Grupo>
          <Grupo titulo="Recolorir uma parte">
            <p className="text-xs text-muted-foreground">Escolha a cor nova e clique na parte do modelo (calça, camisa, carroceria). Luz e sombra continuam.</p>
            <div className="flex items-center gap-3 text-xs"><label className="flex items-center gap-2">Cor nova<input type="color" value={recor.para} onChange={(e) => setRecor({ ...recor, para: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-border" aria-label="Cor nova da região" /></label>
              <Botao tamanho="sm" variante={ferr === 'recolorir' ? 'primario' : 'secundario'} icone={PaintBucket} onClick={() => setFerr('recolorir')}>Clicar no modelo</Botao></div>
            <Faixa rotulo="Tolerância" valor={recor.tol} min={0.03} max={0.6} fmt={pct} aoMudar={(v) => setRecor({ ...recor, tol: v })} />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={recor.conectado} onChange={(e) => setRecor({ ...recor, conectado: e.target.checked })} />Só a região conectada ao clique</label>
          </Grupo>
          <Grupo titulo="Pincel">
            <div className="flex items-center gap-3 text-xs"><label className="flex items-center gap-2">Cor<input type="color" value={pincel.cor} onChange={(e) => setPincel({ ...pincel, cor: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-border" aria-label="Cor do pincel" /></label>
              <Botao tamanho="sm" variante={ferr === 'pincel' ? 'primario' : 'secundario'} icone={Brush} onClick={() => setFerr('pincel')}>Pintar</Botao></div>
            <Faixa rotulo="Tamanho" valor={pincel.raio} min={0.003} max={0.12} passo={0.001} fmt={(v) => `${Math.round(v * 2048)} px`} aoMudar={(v) => setPincel({ ...pincel, raio: v })} />
            <Faixa rotulo="Opacidade" valor={pincel.opac} min={0.05} max={1} fmt={pct} aoMudar={(v) => setPincel({ ...pincel, opac: v })} />
            <Faixa rotulo="Dureza da borda" valor={pincel.dureza} min={0} max={0.98} fmt={pct} aoMudar={(v) => setPincel({ ...pincel, dureza: v })} />
            <p className="text-[11px] text-muted-foreground">{aj.ops.length} operação(ões) de pintura e recolorir. Ctrl+Z desfaz.</p>
            {aj.ops.length > 0 && <Botao tamanho="sm" variante="fantasma" onClick={() => registrar({ ...aj, ops: [] })}>Apagar toda a pintura</Botao>}
          </Grupo>
          <Grupo titulo="Material" aberto={false}>
            <Faixa rotulo="Aspereza (fosco ↔ brilhante)" valor={m.aspereza ?? 0.8} min={0} max={1} fmt={pct} aoMudar={(v) => mudar('material', 'aspereza', v)} />
            <Faixa rotulo="Metal" valor={m.metal ?? 0} min={0} max={1} fmt={pct} aoMudar={(v) => mudar('material', 'metal', v)} />
            <div className="flex items-center gap-3 text-xs"><label className="flex items-center gap-2">Brilho próprio<input type="color" value={m.emissao} onChange={(e) => mudar('material', 'emissao', e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-border" aria-label="Cor do brilho próprio" /></label>
              <div className="flex-1"><Faixa rotulo="Força" valor={m.emissaoForca} min={0} max={2} fmt={pct} aoMudar={(v) => mudar('material', 'emissaoForca', v)} /></div></div>
            <Faixa rotulo="Opacidade" valor={m.opacidade} min={0.1} max={1} fmt={pct} aoMudar={(v) => mudar('material', 'opacidade', v)} />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!m.plano} onChange={(e) => mudar('material', 'plano', e.target.checked, true)} />Faces retas (low poly)</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!m.aramado} onChange={(e) => mudar('material', 'aramado', e.target.checked, true)} />Ver a malha (aramado)</label>
          </Grupo>
          <Grupo titulo="Forma e tamanho" aberto={false}>
            <Faixa rotulo="Escala" valor={f.escala} min={0.2} max={3} fmt={pct} aoMudar={(v) => mudar('forma', 'escala', v)} />
            <Faixa rotulo="Largura" valor={f.largura} min={0.5} max={1.8} fmt={pct} aoMudar={(v) => mudar('forma', 'largura', v)} />
            <Faixa rotulo="Altura" valor={f.altura} min={0.5} max={1.8} fmt={pct} aoMudar={(v) => mudar('forma', 'altura', v)} />
            <Faixa rotulo="Profundidade" valor={f.profundidade} min={0.5} max={1.8} fmt={pct} aoMudar={(v) => mudar('forma', 'profundidade', v)} />
            <Faixa rotulo="Girar" valor={f.giro} min={-180} max={180} passo={1} fmt={graus} aoMudar={(v) => mudar('forma', 'giro', v)} />
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!f.espelhar} onChange={(e) => mudar('forma', 'espelhar', e.target.checked, true)} />Espelhar (esquerda ↔ direita)</label>
            {E.current.tamanho && <p className="text-[11px] text-muted-foreground">Tamanho: {(E.current.tamanho.x * f.escala * f.largura).toFixed(2)} × {(E.current.tamanho.y * f.escala * f.altura).toFixed(2)} × {(E.current.tamanho.z * f.escala * f.profundidade).toFixed(2)} m</p>}
          </Grupo>
          <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-card p-4">
            <div className="flex flex-wrap gap-2">
              <Botao icone={Save} carregando={salvando === 'salvar'} disabled={estado !== 'pronto'} onClick={salvar}>Salvar aparência</Botao>
              <Botao variante="secundario" icone={Download} carregando={salvando === 'baixar'} disabled={estado !== 'pronto'} onClick={baixar}>Baixar .glb</Botao>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} onClick={() => setRestaurar(true)}>Voltar ao original</Botao>
              {aoFechar && <Botao tamanho="sm" variante="fantasma" onClick={aoFechar}>Fechar o editor</Botao>}
            </div>
          </div>
        </div>
      </div>
      <Modal aberto={restaurar} titulo="Voltar ao original?" onFechar={() => setRestaurar(false)}>
        <p className="text-sm text-muted-foreground">Cores, pintura, material e forma voltam ao arquivo importado. A versão editada é apagada.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setRestaurar(false)}>Cancelar</Botao><Botao variante="perigo" onClick={voltarOriginal}>Voltar ao original</Botao></div>
      </Modal>
    </section>
  )
}
