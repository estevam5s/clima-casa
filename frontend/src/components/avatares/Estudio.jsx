import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Braces, Camera, Dices, Download, FileUp, Grid3x3, LayoutTemplate, Play, Redo2, RotateCw, Save, SlidersHorizontal, Undo2, Wand2 } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, useToast } from '../ui'
import { exportarGLB, construir, gerar, validar, PADRAO_CAO, PADRAO_GATO, PADRAO_HOMEM, PADRAO_MULHER } from './receita'

// Estúdio: monta pessoas e pets por parâmetros ou pela receita (JSON), mostra em 3D com as animações e grava o .glb na
// biblioteca (o mesmo arquivo que o mapa usa). Nada de código do usuário é executado: a receita é só dado.
const FUNDOS = { claro: [0xe7e5e4, 0xd6d3d1, null], escuro: [0x27272a, 0x3f3f46, 0x18181b], escritorio: [0xcbb89d, 0xb8a689, 0xeef2f6] }
const VISTAS = { frente: [0, 0.75, 2.4], lado: [2.4, 0.75, 0.01], costas: [0, 0.75, -2.4], tres4: [1.6, 0.9, 1.9], cima: [0.01, 2.6, 0.9] }

function Previa({ receita, clip, velocidade, vista, girar, fundo, grade: comGrade, aoPronto }) {
  const caixa = useRef(null), E = useRef({})
  useEffect(() => {
    const el = caixa.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)
    const cena = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
    camera.position.set(1.6, 1.4, 3.2)
    const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(0, 0.9, 0); ctl.enableDamping = true; ctl.minDistance = 0.6; ctl.maxDistance = 8; ctl.maxPolarAngle = Math.PI * 0.52
    cena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.4))
    const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(2.5, 4, 3); sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024)
    Object.assign(sol.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 }); cena.add(sol)
    const recorte = new THREE.DirectionalLight(0xbfd7ff, 0.8); recorte.position.set(-3, 2, -2); cena.add(recorte)
    const chao = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.MeshStandardMaterial({ color: 0xe7e5e4, roughness: 0.95 })); E.current.chao = chao
    chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; cena.add(chao)
    const grade = new THREE.GridHelper(4, 16, 0xbdbdbd, 0xd6d3d1); grade.position.y = 0.002; cena.add(grade); E.current.grade = grade
    const relogio = new THREE.Clock()
    let quadro
    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar)
      const w = el.clientWidth, h = el.clientHeight
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix() }
      const dt = relogio.getDelta()
      E.current.mixer?.update(dt * (E.current.vel || 1))
      ctl.update(); renderer.render(cena, camera)
    }
    desenhar()
    Object.assign(E.current, { cena, camera, ctl, renderer })
    // foto da prévia: desenha um quadro e copia o canvas na hora (sem guardar o buffer o tempo todo)
    aoPronto?.({ foto: () => { renderer.render(cena, camera); return renderer.domElement.toDataURL('image/png') } })
    return () => { cancelAnimationFrame(quadro); ctl.dispose(); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [])
  useEffect(() => {
    const e = E.current
    if (!e.cena || !receita) return
    if (e.modelo) { e.cena.remove(e.modelo); e.modelo.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.() } }) }
    let m
    try { m = construir(receita) } catch { return }
    e.modelo = m.cena; e.clips = m.clips; e.cena.add(m.cena)
    e.mixer = new THREE.AnimationMixer(m.cena)
    const bb = new THREE.Box3().setFromObject(m.cena), alt = bb.getSize(new THREE.Vector3()).y || 1
    e.ctl.target.set(0, alt * 0.52, 0)
    if (!e.enquadrado || e.alt !== Math.round(alt * 10)) { e.camera.position.set(alt * 0.95, alt * 0.85, alt * 1.9 + 0.4); e.enquadrado = true; e.alt = Math.round(alt * 10) }
    e.acao = null
  }, [receita])
  useEffect(() => {
    const e = E.current
    if (!e.mixer) return
    e.vel = velocidade
    const c = e.clips?.find((x) => x.name === clip)
    if (e.acao?.getClip() === c) return
    const nova = c ? e.mixer.clipAction(c) : null
    if (nova) { nova.reset().play(); if (e.acao) e.acao.crossFadeTo(nova, 0.25, false) } else e.mixer.stopAllAction()
    e.acao = nova
  }, [clip, velocidade, receita])
  // vista da câmera, giro automático, fundo e grade
  useEffect(() => {
    const e = E.current
    if (!e.camera || !vista) return
    const alt = (e.alt || 17) / 10, v = VISTAS[vista.nome] || VISTAS.tres4
    e.camera.position.set(v[0] * alt, v[1] * alt + alt * 0.1, v[2] * alt); e.ctl.target.set(0, alt * 0.52, 0); e.ctl.update()
  }, [vista])
  useEffect(() => { const e = E.current; if (e.ctl) { e.ctl.autoRotate = !!girar; e.ctl.autoRotateSpeed = 2.2 } }, [girar])
  useEffect(() => {
    const e = E.current; if (!e.cena) return
    const [ch, gr, ceu] = FUNDOS[fundo] || FUNDOS.claro
    e.chao.material.color.setHex(ch); e.grade.visible = comGrade !== false
    e.grade.material.color?.setHex?.(gr)
    e.cena.background = ceu == null ? null : new THREE.Color(ceu)
  }, [fundo, comGrade])
  return <div ref={caixa} className="h-[440px] w-full bg-muted/30 lg:h-[560px]" aria-label="Prévia 3D do modelo" />
}

const CORES_PELE = ['#f3d2b7', '#e8b991', '#d9a47c', '#c68a5e', '#a86e46', '#8a5636', '#6b3f26', '#4a2b1a']
const CABELOS = [['curto', 'Curto'], ['raspado', 'Raspado'], ['cacheado', 'Cacheado'], ['longo', 'Longo'], ['rabo', 'Rabo de cavalo'], ['coque', 'Coque'], ['careca', 'Careca']]
const ROUPAS = [['social', 'Camisa social'], ['camiseta', 'Camiseta'], ['blusa', 'Blusa'], ['jaqueta', 'Jaqueta'], ['moletom', 'Moletom']]

function Campo({ rotulo, children }) { return <label className="block text-xs text-muted-foreground">{rotulo}<div className="mt-1">{children}</div></label> }
function Cor({ valor, aoMudar, rotulo }) {
  return <Campo rotulo={rotulo}><div className="flex items-center gap-2"><input type="color" value={valor} onChange={(e) => aoMudar(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent" aria-label={rotulo} /><span className="font-mono text-[11px]">{valor}</span></div></Campo>
}

function Parametros({ p, setP }) {
  const m = (k) => (v) => setP({ ...p, [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.type === 'number' || v.target.type === 'range' ? +v.target.value : v.target.value) : v })
  if (p.especie !== 'pessoa') return (
    <div className="grid grid-cols-2 gap-3">
      <Campo rotulo="Porte"><select className="campo h-9" value={p.porte} onChange={m('porte')}><option value="pequeno">Pequeno</option><option value="medio">Médio</option><option value="grande">Grande</option></select></Campo>
      <Campo rotulo="Orelhas"><select className="campo h-9" value={p.orelhas} onChange={m('orelhas')}><option value="em_pe">Em pé</option><option value="caidas">Caídas</option></select></Campo>
      <Campo rotulo="Focinho"><select className="campo h-9" value={p.focinho} onChange={m('focinho')}><option value="curto">Curto</option><option value="medio">Médio</option><option value="longo">Longo</option></select></Campo>
      <span />
      <Cor rotulo="Pelagem" valor={p.pelagem} aoMudar={m('pelagem')} />
      <Cor rotulo="Barriga e patas" valor={p.mancha} aoMudar={m('mancha')} />
      <Cor rotulo="Olhos" valor={p.olhos} aoMudar={m('olhos')} />
      <Cor rotulo="Coleira" valor={p.coleira} aoMudar={m('coleira')} />
    </div>
  )
  return (
    <div className="grid grid-cols-2 gap-3">
      <Campo rotulo="Sexo"><select className="campo h-9" value={p.sexo} onChange={m('sexo')}><option value="masculino">Masculino</option><option value="feminino">Feminino</option></select></Campo>
      <Campo rotulo={`Altura: ${p.altura.toFixed(2)} m`}><input type="range" min="1.45" max="2.05" step="0.01" value={p.altura} onChange={m('altura')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
      <Campo rotulo="Corpo"><select className="campo h-9" value={p.corpo} onChange={m('corpo')}><option value="magro">Magro</option><option value="medio">Médio</option><option value="forte">Forte</option></select></Campo>
      <Campo rotulo="Cabelo"><select className="campo h-9" value={p.cabelo} onChange={m('cabelo')}>{CABELOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      <Campo rotulo="Barba"><select className="campo h-9" value={p.barba} onChange={m('barba')}><option value="nenhuma">Nenhuma</option><option value="curta">Curta</option><option value="cheia">Cheia</option></select></Campo>
      <Campo rotulo="Roupa"><select className="campo h-9" value={p.roupa} onChange={m('roupa')}>{ROUPAS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
      <Campo rotulo="Parte de baixo"><select className="campo h-9" value={p.inferior} onChange={m('inferior')}><option value="calca">Calça</option><option value="saia">Saia</option><option value="bermuda">Bermuda</option></select></Campo>
      <div className="flex flex-col justify-end gap-1.5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.oculos} onChange={m('oculos')} />Óculos</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.cracha} onChange={m('cracha')} />Crachá</label>
      </div>
      <div className="col-span-2 grid grid-cols-2 gap-1.5 rounded-md border border-border p-2 text-sm">
        <p className="col-span-2 text-xs text-muted-foreground">Acessórios</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.bone} onChange={m('bone')} />Boné</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.fone} onChange={m('fone')} />Fone com microfone</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.mochila} onChange={m('mochila')} />Mochila</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!p.relogio} onChange={m('relogio')} />Relógio</label>
        {p.bone && <Cor rotulo="Cor do boné" valor={p.cor_bone || '#1f2937'} aoMudar={m('cor_bone')} />}
        {p.mochila && <Cor rotulo="Cor da mochila" valor={p.cor_mochila || '#334155'} aoMudar={m('cor_mochila')} />}
      </div>
      <div className="col-span-2"><p className="text-xs text-muted-foreground">Pele</p><div className="mt-1 flex flex-wrap gap-1.5">{CORES_PELE.map((c) => <button key={c} type="button" onClick={() => setP({ ...p, pele: c })} aria-label={`Pele ${c}`} aria-pressed={p.pele === c} className={`h-7 w-7 rounded-full border-2 ${p.pele === c ? 'border-primary' : 'border-transparent'}`} style={{ background: c }} />)}<input type="color" value={p.pele} onChange={m('pele')} className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent" aria-label="Outra cor de pele" /></div></div>
      <Cor rotulo="Cabelo e barba" valor={p.cor_cabelo} aoMudar={m('cor_cabelo')} />
      <Cor rotulo="Olhos" valor={p.olhos} aoMudar={m('olhos')} />
      <Cor rotulo="Roupa" valor={p.cor_roupa} aoMudar={m('cor_roupa')} />
      <Cor rotulo="Calça / saia" valor={p.cor_inferior} aoMudar={m('cor_inferior')} />
      <Cor rotulo="Sapato" valor={p.sapato} aoMudar={m('sapato')} />
    </div>
  )
}

// modelos prontos de pessoas do escritório (só parâmetros; dá para ajustar depois)
const PRONTOS = [
  ['Diretor', { ...PADRAO_HOMEM, nome: 'Diretor', altura: 1.8, corpo: 'medio', cabelo: 'curto', barba: 'curta', roupa: 'social', cor_roupa: '#1f2937', cor_inferior: '#111827', relogio: true, cracha: true }],
  ['Analista', { ...PADRAO_MULHER, nome: 'Analista', cabelo: 'rabo', oculos: true, roupa: 'blusa', cor_roupa: '#0f766a', cor_inferior: '#1f2937', cracha: true }],
  ['Técnico de TI', { ...PADRAO_HOMEM, nome: 'Técnico de TI', cabelo: 'raspado', roupa: 'camiseta', cor_roupa: '#334155', cor_inferior: '#1e3a5f', fone: true, mochila: true, cor_mochila: '#0f172a', cracha: true }],
  ['Recepcionista', { ...PADRAO_MULHER, nome: 'Recepcionista', cabelo: 'coque', roupa: 'social', cor_roupa: '#f8fafc', inferior: 'saia', cor_inferior: '#1f2937', fone: true, cracha: true }],
  ['Segurança', { ...PADRAO_HOMEM, nome: 'Segurança', altura: 1.86, corpo: 'forte', cabelo: 'raspado', roupa: 'social', cor_roupa: '#0b0f19', cor_inferior: '#0b0f19', bone: true, cor_bone: '#0b0f19', cracha: true }],
  ['Estagiário', { ...PADRAO_HOMEM, nome: 'Estagiário', altura: 1.72, corpo: 'magro', cabelo: 'cacheado', roupa: 'moletom', cor_roupa: '#7c3aed', inferior: 'calca', cor_inferior: '#334155', mochila: true, cor_mochila: '#ea580c', cracha: true }],
  ['Desenvolvedora', { ...PADRAO_MULHER, nome: 'Desenvolvedora', cabelo: 'longo', cor_cabelo: '#111111', oculos: true, roupa: 'jaqueta', cor_roupa: '#1e293b', cor_inferior: '#475569', fone: true, cracha: true }],
  ['Cão do escritório', PADRAO_CAO], ['Gato do escritório', PADRAO_GATO],
]
const sortear = (base) => {
  const um = (l) => l[Math.floor(Math.random() * l.length)]
  if (base.especie !== 'pessoa') return { ...base, porte: um(['pequeno', 'medio', 'grande']), orelhas: um(['em_pe', 'caidas']), focinho: um(['curto', 'medio', 'longo']),
    pelagem: um(['#a8743f', '#2b2b2b', '#f2e6d4', '#7a7a7a', '#c97b2f', '#e8d3a8']), coleira: um(['#c0392b', '#2f6fd6', '#16a34a', '#f59e0b']) }
  const F = Math.random() < 0.5
  return { ...(F ? PADRAO_MULHER : PADRAO_HOMEM), nome: base.nome, altura: +(F ? 1.55 + Math.random() * 0.2 : 1.65 + Math.random() * 0.25).toFixed(2),
    corpo: um(['magro', 'medio', 'forte']), pele: um(CORES_PELE), cabelo: um(CABELOS.map((c) => c[0])), cor_cabelo: um(['#111111', '#2b1d14', '#4a2c1a', '#8a5a2b', '#c9a227', '#9ca3af']),
    barba: F ? 'nenhuma' : um(['nenhuma', 'nenhuma', 'curta', 'cheia']), roupa: um(ROUPAS.map((r) => r[0])), cor_roupa: um(['#2f5d8a', '#0f766a', '#7c2d12', '#334155', '#be185d', '#1f2937', '#f8fafc']),
    inferior: F ? um(['calca', 'saia', 'calca']) : um(['calca', 'calca', 'bermuda']), cor_inferior: um(['#1f2937', '#2b2f38', '#475569', '#1e3a5f']),
    oculos: Math.random() < 0.3, bone: Math.random() < 0.15, fone: Math.random() < 0.2, mochila: Math.random() < 0.2, relogio: Math.random() < 0.3, cracha: true }
}

export default function Estudio({ inicial, aoSalvar, pode }) {
  const toast = useToast()
  const [p, setPBruto] = useState(inicial?.parametros || PADRAO_HOMEM)
  // desfazer/refazer (Ctrl+Z / Ctrl+Shift+Z): guarda os parâmetros anteriores
  const hist = useRef({ antes: [], depois: [] })
  const setP = (novo) => setPBruto((atual) => { const v = typeof novo === 'function' ? novo(atual) : novo; if (v !== atual) { hist.current.antes.push(atual); hist.current.antes = hist.current.antes.slice(-60); hist.current.depois = [] } return v })
  const desfazer = () => setPBruto((atual) => { const v = hist.current.antes.pop(); if (!v) return atual; hist.current.depois.push(atual); return v })
  const refazer = () => setPBruto((atual) => { const v = hist.current.depois.pop(); if (!v) return atual; hist.current.antes.push(atual); return v })
  useEffect(() => {
    const t = (e) => { if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.target.closest?.('textarea,input')) return; e.preventDefault(); e.shiftKey ? refazer() : desfazer() }
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [vista, setVista] = useState(null), [girar, setGirar] = useState(false), [fundo, setFundo] = useState('claro'), [comGrade, setComGrade] = useState(true)
  const [prontos, setProntos] = useState(false)
  const camApi = useRef(null)
  const [manual, setManual] = useState(inicial?.manual ? inicial : null)   // receita editada à mão (os parâmetros ficam de lado)
  const [aba, setAba] = useState('parametros')
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState([])
  const [clip, setClip] = useState('Idle')
  const [vel, setVel] = useState(1)
  const [salvando, setSalvando] = useState(false)
  const [parteSel, setParteSel] = useState('')
  const arqRef = useRef(null)
  const receita = useMemo(() => manual || gerar(p), [manual, p])
  useEffect(() => { if (aba === 'codigo') setTexto(JSON.stringify({ ...receita, parametros: undefined }, null, 2)) }, [aba])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!receita.animacoes.some((a) => a.nome === clip)) setClip(receita.animacoes[0]?.nome || '') }, [receita, clip])
  const aplicarTexto = () => {
    let r
    try { r = JSON.parse(texto) } catch (e) { setErros([`JSON inválido: ${e.message}`]); return }
    const er = validar(r); setErros(er)
    if (!er.length) { setManual({ ...r, manual: true, especie: r.especie || p.especie }); toast('Receita aplicada.') }
  }
  const mudarParte = (id, k, v) => {
    const r = JSON.parse(JSON.stringify(receita)); const parte = r.partes.find((x) => x.id === id)
    if (!parte) return
    parte[k] = v; setManual({ ...r, manual: true })
  }
  const baixar = async (tipo) => {
    const nome = (receita.nome || 'modelo').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')
    const blob = tipo === 'glb' ? await exportarGLB(receita) : new Blob([JSON.stringify(receita, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${nome}.${tipo}`; a.click(); URL.revokeObjectURL(a.href)
  }
  const importarReceita = async (arq) => {
    try { const r = JSON.parse(await arq.text()); const er = validar(r); setErros(er); if (!er.length) { setManual({ ...r, manual: true }); toast('Receita importada.') } } catch (e) { setErros([`Arquivo inválido: ${e.message}`]) }
  }
  const salvar = async () => {
    setSalvando(true)
    try {
      const blob = await exportarGLB(receita)
      const { id, upload_url: url } = await api.post('/api/avatares/envio', {
        nome: receita.nome || 'Modelo do Estúdio', descricao: receita.especie === 'pessoa' ? 'Feito no Estúdio' : `Pet feito no Estúdio (${receita.especie === 'gato' ? 'gato' : 'cão'})`,
        origem: 'Feito no Estúdio do Clima Escritório', licenca: 'Próprio (gerado pelo sistema)', tamanho: blob.size, autorizado: true,
        especie: receita.especie === 'pessoa' ? 'pessoa' : receita.especie === 'gato' ? 'gato' : receita.especie === 'cao' ? 'cao' : 'outro',
        parametros: receita, escala_real: true,
      })
      const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true' }, body: blob })
      if (!r.ok) throw new Error(`Envio recusado (${r.status}).`)
      const a = await api.post(`/api/avatares/${id}/confirmar`)
      toast(`${a.nome} salvo na biblioteca com ${a.info.clips.length} animações.`); aoSalvar?.(a)
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const foto = () => { const url = camApi.current?.foto(); if (!url) return; const a = document.createElement('a'); a.href = url; a.download = `${(receita.nome || 'modelo').toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-')}.png`; a.click() }
  const numeros = useMemo(() => {
    try { const m = construir(receita); let tri = 0; m.cena.traverse((o) => { if (o.isMesh) { const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3; g.dispose() } }); return { partes: receita.partes.length, tri: Math.round(tri), anim: receita.animacoes.length } } catch { return null }
  }, [receita])
  const trocarEspecie = (e) => { setManual(null); setP(e === 'cao' ? PADRAO_CAO : e === 'gato' ? PADRAO_GATO : e === 'mulher' ? PADRAO_MULHER : PADRAO_HOMEM) }
  return (
    <section className="cartao overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="relative">
          <Previa receita={receita} clip={clip} velocidade={vel} vista={vista} girar={girar} fundo={fundo} grade={comGrade} aoPronto={(x) => { camApi.current = x }} />
          {/* barra da câmera: vistas prontas, giro, fundo, grade e foto */}
          <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card/90 p-1 text-xs">{/* marca: barra flutua sobre a prévia */}
            {[['frente', 'Frente'], ['tres4', '3/4'], ['lado', 'Lado'], ['costas', 'Costas'], ['cima', 'Cima']].map(([k, r]) => <button key={k} onClick={() => setVista({ nome: k, n: Date.now() })} className="rounded px-2 py-1 hover:bg-muted">{r}</button>)}
            <span className="mx-0.5 h-4 w-px bg-border" />
            <button onClick={() => setGirar((g) => !g)} aria-pressed={girar} title="Girar sozinho" aria-label="Girar sozinho" className={`rounded p-1.5 ${girar ? 'bg-primary/15 text-primary' : 'hover:bg-muted'}`}><RotateCw className="h-3.5 w-3.5" /></button>
            <button onClick={() => setComGrade((g) => !g)} aria-pressed={comGrade} title="Grade" aria-label="Grade" className={`rounded p-1.5 ${comGrade ? 'bg-primary/15 text-primary' : 'hover:bg-muted'}`}><Grid3x3 className="h-3.5 w-3.5" /></button>
            <select value={fundo} onChange={(e) => setFundo(e.target.value)} className="h-7 rounded border border-border bg-card px-1 text-xs" aria-label="Fundo"><option value="claro">Fundo claro</option><option value="escuro">Fundo escuro</option><option value="escritorio">Escritório</option></select>
            <button onClick={foto} title="Baixar foto (PNG)" aria-label="Baixar foto" className="rounded p-1.5 hover:bg-muted"><Camera className="h-3.5 w-3.5" /></button>
          </div>
          {numeros && <p className="absolute right-2 top-2 rounded-md bg-card/90 px-2 py-1 text-[11px] tabular text-muted-foreground">{numeros.partes} partes · {numeros.tri.toLocaleString('pt-BR')} triângulos · {numeros.anim} animações</p>}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-1.5 border-t border-border bg-card/90 p-2">
            {receita.animacoes.map((a) => (
              <button key={a.nome} onClick={() => setClip(a.nome)} className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs ${clip === a.nome ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}><Play className="h-3 w-3" />{a.nome}</button>))}
            <label className="ml-auto flex items-center gap-1.5 text-xs">Velocidade<input type="range" min="0.25" max="2" step="0.25" value={vel} onChange={(e) => setVel(+e.target.value)} className="w-16 accent-[hsl(var(--primary))]" /></label>
          </div>
        </div>
        <div className="flex max-h-[560px] flex-col border-t border-border lg:border-l lg:border-t-0">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <Botao tamanho="sm" variante="secundario" icone={LayoutTemplate} onClick={() => setProntos((v) => !v)}>Modelos prontos</Botao>
              <Botao tamanho="sm" variante="secundario" icone={Dices} onClick={() => { setManual(null); setP(sortear(p)) }}>Sortear</Botao>
              <span className="ml-auto flex gap-1">
                <button onClick={desfazer} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" className="rounded-md border border-border p-1.5 hover:bg-muted"><Undo2 className="h-3.5 w-3.5" /></button>
                <button onClick={refazer} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" className="rounded-md border border-border p-1.5 hover:bg-muted"><Redo2 className="h-3.5 w-3.5" /></button>
              </span>
            </div>
            {prontos && <div className="grid grid-cols-2 gap-1.5">{PRONTOS.map(([n, v]) => <button key={n} onClick={() => { setManual(null); setP(v); setProntos(false) }} className="rounded-md border border-border px-2 py-1.5 text-left text-xs hover:border-primary hover:bg-primary/5">{n}</button>)}</div>}
            <div className="flex flex-wrap gap-1.5">{[['homem', 'Homem'], ['mulher', 'Mulher'], ['cao', 'Cão'], ['gato', 'Gato']].map(([k, r]) => (
              <button key={k} onClick={() => trocarEspecie(k)} className={`h-8 rounded-md border px-3 text-xs ${(k === 'cao' || k === 'gato' ? receita.especie === k : receita.especie === 'pessoa' && (k === 'mulher') === (p.sexo === 'feminino')) ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{r}</button>))}
            </div>
            <input className="campo h-9" maxLength={60} value={manual ? manual.nome || '' : p.nome} onChange={(e) => (manual ? setManual({ ...manual, nome: e.target.value }) : setP({ ...p, nome: e.target.value }))} aria-label="Nome do modelo" placeholder="Nome do modelo" />
            <div className="flex gap-1 rounded-lg border border-border p-0.5" role="tablist">
              {[['parametros', 'Parâmetros', SlidersHorizontal], ['partes', 'Partes', Wand2], ['codigo', 'Receita (código)', Braces]].map(([k, r, I]) => (
                <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs ${aba === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}><I className="h-3.5 w-3.5" />{r}</button>))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {aba === 'parametros' && (manual ? (
              <Aviso tipo="alerta">Este modelo foi editado na receita. <button className="font-medium underline" onClick={() => setManual(null)}>Voltar aos parâmetros</button> (perde as mudanças feitas à mão).</Aviso>
            ) : <Parametros p={p} setP={setP} />)}
            {aba === 'partes' && (
              <ul className="space-y-1">{receita.partes.map((x) => (
                <li key={x.id} className={`rounded-md border px-2 py-1.5 text-xs ${parteSel === x.id ? 'border-primary' : 'border-border'}`}>
                  <div className="flex items-center gap-2">
                    <button className="min-w-0 flex-1 truncate text-left font-mono" onClick={() => setParteSel(parteSel === x.id ? '' : x.id)}>{x.pai ? '└ ' : ''}{x.id}</button>
                    <span className="text-muted-foreground">{x.forma || 'nenhuma'}</span>
                    {x.forma && x.forma !== 'nenhuma' && <input type="color" value={x.cor || '#cccccc'} onChange={(e) => mudarParte(x.id, 'cor', e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent" aria-label={`Cor de ${x.id}`} />}
                  </div>
                  {parteSel === x.id && (
                    <div className="mt-2 grid grid-cols-3 gap-1">{['pos', 'rot', 'esc'].map((k) => [0, 1, 2].map((i) => (
                      <label key={`${k}${i}`} className="text-[10px] text-muted-foreground">{k}.{'xyz'[i]}
                        <input type="number" step={k === 'rot' ? 5 : 0.01} className="campo h-7 px-1 text-xs" value={(x[k] || (k === 'esc' ? [1, 1, 1] : [0, 0, 0]))[i]}
                          onChange={(e) => { const v = [...(x[k] || (k === 'esc' ? [1, 1, 1] : [0, 0, 0]))]; v[i] = +e.target.value; mudarParte(x.id, k, v) }} /></label>)))}
                    </div>
                  )}
                </li>))}
              </ul>
            )}
            {aba === 'codigo' && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Partes articuladas (caixa, esfera, cápsula, cilindro, cone, toro, calota) e animações por quadros-chave. "pos" é a articulação no pai; "desloc" é onde a malha fica; rotações em graus. Só dados: nenhum código é executado.</p>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} className="campo h-80 w-full resize-y font-mono text-[11px] leading-relaxed" aria-label="Receita em JSON" />
                {erros.length > 0 && <Aviso><ul className="list-disc pl-4 text-xs">{erros.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul></Aviso>}
                <div className="flex flex-wrap gap-2">
                  <Botao tamanho="sm" onClick={aplicarTexto}>Aplicar</Botao>
                  <Botao tamanho="sm" variante="secundario" onClick={() => { try { setTexto(JSON.stringify(JSON.parse(texto), null, 2)); setErros([]) } catch (e) { setErros([`JSON inválido: ${e.message}`]) } }}>Formatar</Botao>
                  <Botao tamanho="sm" variante="secundario" icone={FileUp} onClick={() => arqRef.current?.click()}>Importar receita</Botao>
                  <input ref={arqRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && importarReceita(e.target.files[0])} />
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border p-4">
            <Botao icone={Save} carregando={salvando} disabled={!pode} onClick={salvar}>Salvar na biblioteca</Botao>
            <Botao variante="secundario" icone={Download} onClick={() => baixar('glb')}>.glb</Botao>
            <Botao variante="fantasma" icone={Download} onClick={() => baixar('json')}>Receita</Botao>
          </div>
        </div>
      </div>
    </section>
  )
}
