import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AirVent, Armchair, ArrowRight, Box, ChevronRight, Columns2, DoorOpen, Expand, Grid3x3, LayoutGrid, Leaf, Minus, Pencil, Plus,
  Monitor, Power, RotateCw, Save, Square, Table2, Trash2, Type, Undo2, X, ZoomIn, ZoomOut, AppWindow, Snowflake, Sun, Wind, Droplets, Sparkles,
} from 'lucide-react'
import { api, haQuanto, MODOS, VENTILACAO } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, useDados, useToast } from '../components/ui'

// Mapa do escritório: planta em SVG onde cada sala é um projeto e cada sala pode ter vários ares.
// Ver: estado ao vivo de cada ar (cor do modo, fluxo de ar animado quando ligado) e controle direto.
// Editar (quem pode gerenciar projetos): mover e redimensionar salas, posicionar ares, portas, janelas e móveis.
const GRADE = 10
const COR_MODO = { frio: '#3b82f6', quente: '#f97316', ventilar: '#14b8a6', seco: '#a855f7', auto: '#22c55e' }
const ICONE_MODO = { frio: Snowflake, quente: Sun, ventilar: Wind, seco: Droplets, auto: Sparkles }
const AR_L = 86, AR_A = 22
const ELEMENTOS = [
  ['porta', 'Porta', DoorOpen, 80, 80], ['janela', 'Janela', AppWindow, 120, 10], ['mesa', 'Mesa', Table2, 140, 70],
  ['bancada', 'Bancada', Columns2, 240, 60], ['armario', 'Armário', Box, 90, 40], ['sofa', 'Sofá', Armchair, 160, 60],
  ['parede', 'Parede', Square, 200, 10], ['coluna', 'Coluna', Grid3x3, 30, 30], ['planta', 'Planta', Leaf, 34, 34], ['monitor', 'Monitor', Monitor, 100, 10],
  ['texto', 'Texto', Type, 120, 30], ['ar_previsto', 'Ar previsto', AirVent, 86, 22],
]
const NOME_EL = Object.fromEntries(ELEMENTOS.map((e) => [e[0], e[1]]))
const snap = (v) => Math.round(v / GRADE) * GRADE
const lim = (v, a, b) => Math.max(a, Math.min(b, v))
const copia = (o) => JSON.parse(JSON.stringify(o))

const salaDoPonto = (s, e) => { const cx = e.x + e.w / 2, cy = e.y + e.h / 2; return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h }

// Salas sem posição ganham um lugar automático (linhas da esquerda para a direita, tamanho pelo número de ares).
function completar(mapa, projetos, ares) {
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

function Fluxo({ cor }) {
  // três ondas saindo da saída de ar (eixo +y no sistema do aparelho)
  return (
    <g className="fluxo-ar" stroke={cor} fill="none" strokeLinecap="round" strokeWidth="2.2">
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M ${AR_L / 2 - 26} ${AR_A + 8} Q ${AR_L / 2} ${AR_A + 20} ${AR_L / 2 + 26} ${AR_A + 8}`} style={{ animationDelay: `${i * 0.6}s` }} />
      ))}
    </g>
  )
}

function ArNoMapa({ a, pos, selecionado, ocupado, apagado, aoClicar, aoArrastar, editando }) {
  const cor = a.ligado ? COR_MODO[a.modo] || '#14b8a6' : null
  const rot = pos.rot || 0
  const deitado = rot === 90 || rot === 270
  // nome sempre na horizontal, do lado de dentro: em cima (saída para baixo), embaixo (saída para cima) ou acima do aparelho em pé
  const nome = rot === 180 ? [AR_L / 2, AR_A + 14] : deitado ? [AR_L / 2, AR_A / 2 - AR_L / 2 - 7] : [AR_L / 2, -6]
  const texto = a.nome.length > 22 ? `${a.nome.slice(0, 21)}…` : a.nome
  return (
    <g transform={`translate(${pos.x} ${pos.y})`} opacity={apagado ? 0.35 : 1}
      onPointerDown={editando ? aoArrastar : undefined} onClick={aoClicar} className={editando ? 'cursor-move' : 'cursor-pointer'}
      role="button" aria-label={`${a.nome}: ${a.ligado ? `ligado em ${a.temperatura} graus, ${MODOS[a.modo]}` : 'desligado'}`}>
      <title>{`${a.nome} · ${a.ligado ? `${a.temperatura}° ${MODOS[a.modo]}` : 'desligado'}`}</title>
      <g transform={`rotate(${rot} ${AR_L / 2} ${AR_A / 2})`}>
        {a.ligado && <Fluxo cor={cor} />}
        {selecionado && <rect x="-6" y="-6" width={AR_L + 12} height={AR_A + 12} rx="9" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeDasharray="4 3" />}
        <rect width={AR_L} height={AR_A} rx="6" fill="hsl(var(--card))" stroke={cor || 'hsl(var(--muted-foreground))'} strokeWidth={a.ligado ? 2 : 1.4} />
        <line x1="10" x2={AR_L - 10} y1={AR_A - 6} y2={AR_A - 6} stroke="hsl(var(--border))" strokeWidth="2" strokeLinecap="round" />
        <circle cx={AR_L - 10} cy="7" r="2.6" fill={a.ligado ? cor : 'hsl(var(--muted-foreground))'} className={ocupado ? 'animate-pulse' : ''} />
      </g>
      <text x={AR_L / 2} y={AR_A / 2 + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="600" fill="hsl(var(--foreground))" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {a.ligado ? `${a.temperatura}°` : 'desl.'}
      </text>
      <text x={nome[0]} y={nome[1]} fontSize="10.5" textAnchor="middle" fill="hsl(var(--muted-foreground))">{texto}</text>
    </g>
  )
}

function Elemento({ e, selecionado, editando, aoArrastar, aoClicar }) {
  const tracos = 'hsl(var(--muted-foreground))'
  const preench = 'hsl(var(--muted))'
  let corpo
  switch (e.tipo) {
    case 'porta':
      corpo = <><line x1="0" y1={e.h} x2={e.w} y2={e.h} stroke="hsl(var(--background))" strokeWidth="8" />
        <line x1="0" y1={e.h} x2="0" y2="0" stroke={tracos} strokeWidth="2" />
        <path d={`M 0 0 A ${e.w} ${e.h} 0 0 1 ${e.w} ${e.h}`} fill="none" stroke={tracos} strokeDasharray="4 3" /></>
      break
    case 'janela':
      corpo = <><rect width={e.w} height={e.h} fill="#bae6fd" opacity="0.55" stroke="#0ea5e9" strokeWidth="1.2" />
        <line x1="0" x2={e.w} y1={e.h / 2} y2={e.h / 2} stroke="#0ea5e9" strokeWidth="1" /></>
      break
    case 'parede':
      corpo = <rect width={e.w} height={e.h} fill="hsl(var(--foreground))" opacity="0.85" />
      break
    case 'coluna':
      corpo = <rect width={e.w} height={e.h} fill="hsl(var(--foreground))" opacity="0.7" rx="2" />
      break
    case 'planta':
      corpo = <><circle cx={e.w / 2} cy={e.h / 2} r={Math.min(e.w, e.h) / 2} fill="#22c55e" opacity="0.25" stroke="#16a34a" />
        <circle cx={e.w / 2} cy={e.h / 2} r={Math.min(e.w, e.h) / 5} fill="#16a34a" opacity="0.6" /></>
      break
    case 'monitor':
      corpo = <><rect width={e.w} height={e.h} rx="2" fill="hsl(var(--foreground))" opacity="0.8" />
        <text x={e.w / 2} y={e.h + 14} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">{e.rotulo || 'Monitor'}</text></>
      break
    case 'ar_previsto':
      corpo = <><rect width={e.w} height={e.h} rx="6" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.4" strokeDasharray="5 4" />
        <text x={e.w / 2} y={e.h / 2 + 3.5} textAnchor="middle" fontSize="9.5" fill="hsl(var(--muted-foreground))"
          transform={e.rot ? `rotate(${-e.rot} ${e.w / 2} ${e.h / 2})` : undefined}>{e.rot === 90 || e.rot === 270 ? 'ar' : 'ar previsto'}</text></>
      break
    case 'texto':
      corpo = <text x={e.w / 2} y={e.h / 2 + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill="hsl(var(--muted-foreground))">{e.rotulo || 'Texto'}</text>
      break
    case 'bancada':
      corpo = <><rect width={e.w} height={e.h} rx="4" fill={preench} stroke={tracos} strokeWidth="1.2" />
        {Array.from({ length: Math.max(1, Math.floor(e.w / 70)) }, (_, i) => <circle key={i} cx={35 + i * 70} cy={e.h + 12} r="9" fill="none" stroke={tracos} strokeWidth="1" />)}</>
      break
    case 'mesa':
      corpo = <><rect width={e.w} height={e.h} rx="6" fill={preench} stroke={tracos} strokeWidth="1.2" />
        <circle cx={e.w / 2} cy={-12} r="9" fill="none" stroke={tracos} strokeWidth="1" /><circle cx={e.w / 2} cy={e.h + 12} r="9" fill="none" stroke={tracos} strokeWidth="1" /></>
      break
    case 'sofa':
      corpo = <><rect width={e.w} height={e.h} rx="12" fill={preench} stroke={tracos} strokeWidth="1.2" />
        <rect x="8" y="8" width={e.w - 16} height={e.h * 0.45} rx="6" fill="none" stroke={tracos} strokeWidth="1" /></>
      break
    default: // armario
      corpo = <><rect width={e.w} height={e.h} fill={preench} stroke={tracos} strokeWidth="1.2" />
        <line x1="0" y1="0" x2={e.w} y2={e.h} stroke={tracos} strokeWidth="0.8" /><line x1={e.w} y1="0" x2="0" y2={e.h} stroke={tracos} strokeWidth="0.8" /></>
  }
  const vertical = e.h > e.w * 1.4
  const rotulo = e.rotulo && ['mesa', 'bancada', 'armario', 'sofa'].includes(e.tipo)
  return (
    <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot || 0} ${e.w / 2} ${e.h / 2})`} onPointerDown={editando ? aoArrastar : undefined}
      onClick={aoClicar} className={editando || e.tipo === 'ar_previsto' ? 'cursor-pointer' : ''} style={{ pointerEvents: editando || e.tipo === 'ar_previsto' ? 'all' : 'none' }}>
      {corpo}
      {rotulo && <text x={e.w / 2} y={e.h / 2 + 4} textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground))"
        transform={vertical ? `rotate(-90 ${e.w / 2} ${e.h / 2})` : undefined}>{e.rotulo}</text>}
      {selecionado && <rect x="-5" y="-5" width={e.w + 10} height={e.h + 10} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.6" strokeDasharray="4 3" />}
    </g>
  )
}

// Controle de um ar: liga/desliga, temperatura, modo e ventilação.
function ControleAr({ a, aoMudar, podeControlar, compacto = false }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const mudar = async (estado) => {
    setOcupado(true)
    try { aoMudar(await api.post(`/api/aparelhos/${a.id}/estado`, estado)) } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const modos = (a.modos || '').split(',').filter(Boolean)
  const cor = a.ligado ? COR_MODO[a.modo] : undefined
  if (compacto) {
    return (
      <div className="flex items-center gap-3 py-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor || 'hsl(var(--muted-foreground))' }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{a.nome}</p>
          <p className="text-xs text-muted-foreground">{a.ligado ? `${a.temperatura}° · ${MODOS[a.modo]}` : 'Desligado'}{!a.botoes ? ' · sem botões gravados' : ''}</p>
        </div>
        <button disabled={!podeControlar || ocupado} onClick={() => mudar({ ligado: !a.ligado })} aria-label={a.ligado ? `Desligar ${a.nome}` : `Ligar ${a.nome}`}
          className={`grid h-8 w-8 place-items-center rounded-md border transition-colors disabled:opacity-50 ${a.ligado ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:bg-muted'}`}
          style={a.ligado ? { background: cor } : undefined}><Power className={`h-4 w-4 ${ocupado ? 'animate-pulse' : ''}`} /></button>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 transition-colors" style={{ borderColor: cor || 'hsl(var(--border))' }}>
          <div className="text-center">
            <p className="text-3xl font-semibold leading-none tabular">{a.temperatura}°</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{a.ligado ? MODOS[a.modo] : 'desligado'}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Botao variante={a.ligado ? 'secundario' : 'primario'} icone={Power} carregando={ocupado} disabled={!podeControlar} onClick={() => mudar({ ligado: !a.ligado })}>
            {a.ligado ? 'Desligar' : 'Ligar'}
          </Botao>
          <div className="flex items-center gap-1.5">
            <button disabled={!podeControlar || ocupado || a.temperatura <= a.temp_min} onClick={() => mudar({ temperatura: a.temperatura - 1, ligado: true })}
              className="grid h-9 flex-1 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40" aria-label="Baixar 1 grau"><Minus className="h-4 w-4" /></button>
            <button disabled={!podeControlar || ocupado || a.temperatura >= a.temp_max} onClick={() => mudar({ temperatura: a.temperatura + 1, ligado: true })}
              className="grid h-9 flex-1 place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40" aria-label="Subir 1 grau"><Plus className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Modo</p>
        <div className="flex flex-wrap gap-1.5">
          {modos.map((m) => {
            const I = ICONE_MODO[m] || AirVent
            const ativo = a.ligado && a.modo === m
            return (
              <button key={m} disabled={!podeControlar || ocupado} onClick={() => mudar({ modo: m, ligado: true })}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${ativo ? 'border-transparent text-white' : 'border-border hover:bg-muted'}`}
                style={ativo ? { background: COR_MODO[m] } : undefined}><I className="h-3.5 w-3.5" />{MODOS[m]}</button>
            )
          })}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Ventilação</p>
        <div className="grid grid-cols-4 gap-1 rounded-lg border border-border p-0.5">
          {Object.entries(VENTILACAO).map(([k, r]) => (
            <button key={k} disabled={!podeControlar || ocupado} onClick={() => mudar({ ventilador: k, ligado: true })}
              className={`rounded-md px-1 py-1.5 text-xs transition-colors disabled:opacity-50 ${a.ventilador === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Mapa() {
  const toast = useToast()
  const navegar = useNavigate()
  const { atual, setAtual, sessao } = useProjeto()
  const { dados, erro, recarregar, setDados } = useDados(() => api.get('/api/mapa'))
  const [editando, setEditando] = useState(false)
  const [rascunho, setRascunho] = useState(null)
  const [historico, setHistorico] = useState([])
  const [sel, setSel] = useState(null) // { tipo: 'sala'|'ar'|'elemento', id }
  const [filtro, setFiltro] = useState('todos')
  const [zoom, setZoom] = useState(1)
  const [salvando, setSalvando] = useState(false)
  const svgRef = useRef(null)
  const caixaRef = useRef(null)
  const arrasto = useRef(null)
  const podeControlar = !!sessao?.permissoes?.includes('aparelhos.controlar')

  // ao vivo: atualiza o estado dos ares a cada 10 s (fora da edição)
  useEffect(() => {
    if (editando) return undefined
    const t = setInterval(() => { if (!document.hidden) recarregar() }, 10000)
    return () => clearInterval(t)
  }, [editando, recarregar])

  const base = useMemo(() => (dados ? completar(dados.mapa, dados.projetos, dados.ares) : null), [dados])
  const mapa = editando ? rascunho : base
  const ares = dados?.ares || []
  const projetos = dados?.projetos || []
  const porSala = useMemo(() => Object.fromEntries(projetos.map((p) => [p.id, ares.filter((a) => a.projeto_id === p.id)])), [projetos, ares])

  const atualizarAr = useCallback((novo) => {
    setDados((d) => ({ ...d, ares: d.ares.map((a) => (a.id === novo.id ? { ...a, ...novo } : a)) }))
  }, [setDados])

  // ---------- edição ----------
  const mexer = (fn) => setRascunho((r) => { setHistorico((h) => [...h.slice(-49), r]); const n = copia(r); fn(n); return n })
  const desfazer = () => setHistorico((h) => { if (!h.length) return h; setRascunho(h[h.length - 1]); return h.slice(0, -1) })
  const comecarEdicao = () => { const r = copia(base); r.elementos = r.elementos.filter((e) => !(r.consumidos || []).includes(e.id)); r.consumidos = []; setRascunho(r); setHistorico([]); setEditando(true); setSel(null) }
  const sairEdicao = () => {
    if (historico.length && !window.confirm('Descartar as mudanças da planta?')) return
    setEditando(false); setRascunho(null); setSel(null)
  }
  const salvar = async () => {
    setSalvando(true)
    try {
      const corpo = { largura: rascunho.largura, altura: rascunho.altura, salas: rascunho.salas, ares: rascunho.ares, elementos: rascunho.elementos }
      setDados(await api.put('/api/mapa', corpo)); setEditando(false); setRascunho(null); setHistorico([])
      toast('Planta salva.')
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const ponto = (ev) => {
    const svg = svgRef.current
    const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY
    return p.matrixTransform(svg.getScreenCTM().inverse())
  }
  const iniciar = (tipo, id, modo = 'mover') => (ev) => {
    ev.stopPropagation(); ev.preventDefault()
    const p0 = ponto(ev)
    arrasto.current = { tipo, id, modo, p0, antes: copia(rascunho), mexeu: false }
    setSel({ tipo, id })
    svgRef.current.setPointerCapture?.(ev.pointerId)
  }
  const mover = (ev) => {
    const a = arrasto.current
    if (!a) return
    const p = ponto(ev)
    const dx = snap(p.x - a.p0.x), dy = snap(p.y - a.p0.y)
    if (!dx && !dy && !a.mexeu) return
    a.mexeu = true
    const n = copia(a.antes)
    if (a.tipo === 'sala') {
      const s = n.salas[a.id], s0 = a.antes.salas[a.id]
      if (a.modo === 'mover') {
        s.x = lim(s0.x + dx, 0, n.largura - s.w); s.y = lim(s0.y + dy, 0, n.altura - s.h)
        const mx = s.x - s0.x, my = s.y - s0.y
        for (const ar of porSala[a.id] || []) { const q = n.ares[ar.id]; if (q) { q.x += mx; q.y += my } } // os ares vão junto
      } else {
        s.w = lim(s0.w + dx, 120, n.largura - s.x); s.h = lim(s0.h + dy, 100, n.altura - s.y)
      }
    } else if (a.tipo === 'ar') {
      const q = n.ares[a.id], q0 = a.antes.ares[a.id]
      const ar = ares.find((x) => String(x.id) === String(a.id))
      const s = ar && n.salas[ar.projeto_id]
      q.x = s ? lim(q0.x + dx, s.x, s.x + s.w - AR_L) : q0.x + dx
      q.y = s ? lim(q0.y + dy, s.y, s.y + s.h - AR_A) : q0.y + dy
    } else {
      const e = n.elementos.find((x) => x.id === a.id), e0 = a.antes.elementos.find((x) => x.id === a.id)
      if (a.modo === 'mover') { e.x = lim(e0.x + dx, 0, n.largura - 10); e.y = lim(e0.y + dy, 0, n.altura - 10) } else { e.w = Math.max(10, e0.w + dx); e.h = Math.max(4, e0.h + dy) }
    }
    setRascunho(n)
  }
  const soltar = () => {
    const a = arrasto.current
    arrasto.current = null
    if (a?.mexeu) setHistorico((h) => [...h.slice(-49), a.antes])
  }
  const adicionar = (tipo) => {
    const def = ELEMENTOS.find((e) => e[0] === tipo)
    const id = `${tipo}-${Date.now().toString(36)}`
    const caixa = caixaRef.current
    const cx = (caixa.scrollLeft + caixa.clientWidth / 2) / (caixa.scrollWidth || 1) * rascunho.largura
    const cy = (caixa.scrollTop + caixa.clientHeight / 2) / (caixa.scrollHeight || 1) * rascunho.altura
    const desvio = (rascunho.elementos.length % 6) * 30   // cada novo nasce um pouco ao lado do anterior
    mexer((n) => n.elementos.push({ id, tipo, x: snap(lim(cx - def[3] / 2 + desvio, 0, n.largura - def[3])), y: snap(lim(cy - def[4] / 2 + desvio, 0, n.altura - def[4])), w: def[3], h: def[4], rot: 0, rotulo: tipo === 'texto' ? 'Recepção' : '' }))
    setSel({ tipo: 'elemento', id })
  }
  const girar = () => {
    if (!sel || sel.tipo === 'sala') return
    mexer((n) => {
      const o = sel.tipo === 'ar' ? n.ares[sel.id] : n.elementos.find((e) => e.id === sel.id)
      if (o) o.rot = ((o.rot || 0) + 90) % 360
    })
  }
  const apagarEl = () => { if (sel?.tipo === 'elemento') { mexer((n) => { n.elementos = n.elementos.filter((e) => e.id !== sel.id) }); setSel(null) } }
  const reorganizar = () => {
    if (!window.confirm('Reorganizar todas as salas automaticamente? Os elementos ficam onde estão.')) return
    mexer((n) => { const r = completar({ ...n, salas: {}, ares: {} }, projetos, ares); n.salas = r.salas; n.ares = r.ares; n.altura = r.altura })
  }
  useEffect(() => {
    if (!editando) return undefined
    const tecla = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.tipo === 'elemento') { e.preventDefault(); apagarEl() }
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) girar()
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); desfazer() }
      if (e.key === 'Escape') setSel(null)
      const d = { ArrowLeft: [-GRADE, 0], ArrowRight: [GRADE, 0], ArrowUp: [0, -GRADE], ArrowDown: [0, GRADE] }[e.key]
      if (d && sel) {
        e.preventDefault()
        mexer((n) => {
          const o = sel.tipo === 'sala' ? n.salas[sel.id] : sel.tipo === 'ar' ? n.ares[sel.id] : n.elementos.find((x) => x.id === sel.id)
          if (o) { o.x += d[0]; o.y += d[1] }
        })
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !mapa) return <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-[560px]" /></div>

  // fora da edição, o mapa enquadra só a área desenhada (sem sobra de grade vazia)
  const caixas = [...Object.values(mapa.salas), ...mapa.elementos]
  const vb = editando || !caixas.length ? [0, 0, mapa.largura, mapa.altura] : (() => {
    const x0 = Math.max(0, Math.min(...caixas.map((c) => c.x)) - 40), y0 = Math.max(0, Math.min(...caixas.map((c) => c.y)) - 50)
    const x1 = Math.min(mapa.largura, Math.max(...caixas.map((c) => c.x + c.w)) + 40), y1 = Math.min(mapa.altura, Math.max(...caixas.map((c) => c.y + c.h)) + 50)
    return [x0, y0, Math.max(600, x1 - x0), Math.max(380, y1 - y0)]
  })()
  const ligados = ares.filter((a) => a.ligado)
  const media = ligados.length ? Math.round(ligados.reduce((s, a) => s + a.temperatura, 0) / ligados.length) : null
  const potencia = ligados.reduce((s, a) => s + (a.potencia_w || 1000), 0) / 1000
  const salasLigadas = projetos.filter((p) => (porSala[p.id] || []).some((a) => a.ligado)).length
  const visivel = (a) => filtro === 'todos' || (filtro === 'ligados' ? a.ligado : !a.ligado)
  const salaSel = sel?.tipo === 'sala' ? projetos.find((p) => String(p.id) === String(sel.id)) : null
  const arSel = sel?.tipo === 'ar' ? ares.find((a) => String(a.id) === String(sel.id)) : null
  const elSel = sel?.tipo === 'elemento' ? mapa.elementos.find((e) => e.id === sel.id) : null
  const semSala = ares.filter((a) => !a.projeto_id)
  const todosNaSala = async (pid, ligar) => {
    const lista = (porSala[pid] || []).filter((a) => !!a.ligado !== ligar)
    for (const a of lista) {
      try { atualizarAr(await api.post(`/api/aparelhos/${a.id}/estado`, { ligado: ligar })) } catch (e) { toast(`${a.nome}: ${e.message}`, 'erro') }
    }
    if (!lista.length) toast(ligar ? 'Todos já estão ligados.' : 'Todos já estão desligados.')
  }
  const novoArNaSala = (pid) => { setAtual(pid); navegar('/aparelhos?novo=1') }

  return (
    <div className="w-full">
      <Cabecalho titulo="Mapa do escritório" descricao="A planta com cada sala (projeto) e os ares dela. Clique num ar para controlar; edite a planta para desenhar o escritório."
        acoes={editando ? (<>
          <Botao variante="secundario" icone={Undo2} disabled={!historico.length} onClick={desfazer}>Desfazer</Botao>
          <Botao variante="secundario" icone={X} onClick={sairEdicao}>Cancelar</Botao>
          <Botao icone={Save} carregando={salvando} onClick={salvar}>Salvar planta</Botao>
        </>) : (<>
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {[['todos', 'Todos'], ['ligados', 'Ligados'], ['desligados', 'Desligados']].map(([k, r]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`relative rounded-md px-3 py-1.5 text-sm ${filtro === k ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                {filtro === k && <motion.span layoutId="filtro-mapa" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', duration: 0.3 }} />}
                <span className="relative">{r}</span>
              </button>
            ))}
          </div>
          {dados.pode_editar && <Botao variante="secundario" icone={Pencil} onClick={comecarEdicao}>Editar planta</Botao>}
        </>)} />

      {!editando && (
        <div className="mb-6">
          <FaixaMetricas itens={[
            { rotulo: 'Ares ligados agora', valor: ligados.length, sufixo: ` / ${ares.length}`, dica: ares.length ? `${salasLigadas} de ${projetos.length} sala(s) com ar ligado` : 'Nenhum ar cadastrado' },
            { rotulo: 'Temperatura média', valor: media ?? '—', sufixo: media != null ? '°C' : '', dica: media != null ? 'dos ares ligados' : 'tudo desligado' },
            { rotulo: 'Potência estimada', valor: potencia, casas: 1, sufixo: ' kW', dica: 'soma da potência dos ligados' },
            { rotulo: 'Salas', valor: projetos.length, dica: `${ares.length} ar(es) no total${semSala.length ? ` · ${semSala.length} sem sala` : ''}` },
          ]} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="cartao relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            {editando ? (
              <div className="flex flex-wrap items-center gap-1">
                {ELEMENTOS.map(([k, r, I]) => (
                  <button key={k} onClick={() => adicionar(k)} title={`Adicionar ${r.toLowerCase()}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"><I className="h-3.5 w-3.5" />{r}</button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {Object.entries(COR_MODO).map(([k, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{MODOS[k]}</span>)}
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />Desligado</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              {editando && <button onClick={reorganizar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Reorganizar salas"><LayoutGrid className="h-4 w-4" /></button>}
              <button onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Afastar"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-10 text-center text-xs tabular text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Aproximar"><ZoomIn className="h-4 w-4" /></button>
              <button onClick={() => { setZoom(1); caixaRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' }) }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Caber na tela"><Expand className="h-4 w-4" /></button>
            </div>
          </div>
          <div ref={caixaRef} className="max-h-[72vh] overflow-auto bg-card">
            <svg ref={svgRef} viewBox={vb.join(' ')} style={{ width: `${zoom * 100}%`, minWidth: zoom * 640 }} className="block select-none touch-none"
              onPointerMove={editando ? mover : undefined} onPointerUp={soltar} onPointerLeave={soltar} onClick={() => setSel(null)}>
              <defs>
                <pattern id="grade-fina" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" /></pattern>
                <pattern id="grade" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="url(#grade-fina)" /><path d="M 100 0 L 0 0 0 100" fill="none" stroke="hsl(var(--border))" strokeWidth="1" /></pattern>
              </defs>
              <rect width={mapa.largura} height={mapa.altura} fill="hsl(var(--card))" />
              <rect width={mapa.largura} height={mapa.altura} fill="url(#grade)" opacity={editando ? 1 : 0.55} />
              {editando && <rect width={mapa.largura} height={mapa.altura} fill="none" stroke="hsl(var(--primary))" strokeDasharray="8 6" strokeWidth="1.5" opacity="0.6" />}

              {/* salas */}
              {projetos.map((p) => {
                const s = mapa.salas[p.id]
                if (!s) return null
                const lista = porSala[p.id] || []
                const lig = lista.filter((a) => a.ligado).length
                const marcada = sel?.tipo === 'sala' && String(sel.id) === String(p.id)
                const doContexto = atual && atual === p.id
                return (
                  <g key={p.id}>
                    <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={p.cor || '#0f766a'} fillOpacity={lig ? 0.1 : 0.04}
                      stroke="hsl(var(--foreground))" strokeOpacity="0.8" strokeWidth="5" strokeLinejoin="miter"
                      onPointerDown={editando ? iniciar('sala', p.id) : undefined}
                      onClick={(e) => { e.stopPropagation(); setSel({ tipo: 'sala', id: p.id }) }}
                      className={editando ? 'cursor-move' : 'cursor-pointer'} />
                    {(marcada || doContexto) && <rect x={s.x - 7} y={s.y - 7} width={s.w + 14} height={s.h + 14} fill="none" stroke={marcada ? 'hsl(var(--primary))' : p.cor} strokeWidth="2" strokeDasharray={marcada ? '6 4' : undefined} rx="3" pointerEvents="none" />}
                    <g pointerEvents="none">
                      <text x={s.x + 16} y={s.y + s.h - 36} fontSize="17" fontWeight="650" fill="hsl(var(--foreground))">{p.nome}</text>
                      <text x={s.x + 16} y={s.y + s.h - 16} fontSize="12" fill="hsl(var(--muted-foreground))">
                        {lista.length ? `${lista.length} ar(es) · ${lig ? `${lig} ligado(s)` : 'todos desligados'}` : 'Nenhum ar nesta sala'}
                      </text>
                      <rect x={s.x + 14} y={s.y + s.h - 70} width="4" height="16" rx="2" fill={p.cor || '#0f766a'} />
                    </g>
                    {editando && <rect x={s.x + s.w - 14} y={s.y + s.h - 14} width="16" height="16" rx="3" fill="hsl(var(--primary))" className="cursor-nwse-resize"
                      onPointerDown={iniciar('sala', p.id, 'tamanho')} />}
                  </g>
                )
              })}

              {/* elementos */}
              {mapa.elementos.filter((e) => !(mapa.consumidos || []).includes(e.id)).map((e) => (
                <g key={e.id}>
                  <Elemento e={e} editando={editando && dados.edita_elementos} selecionado={sel?.tipo === 'elemento' && sel.id === e.id}
                    aoArrastar={iniciar('elemento', e.id)} aoClicar={(ev) => { ev.stopPropagation(); if (editando || e.tipo === 'ar_previsto') setSel({ tipo: 'elemento', id: e.id }) }} />
                  {editando && dados.edita_elementos && sel?.id === e.id && !e.rot && <rect x={e.x + e.w - 6} y={e.y + e.h - 6} width="12" height="12" rx="2" fill="hsl(var(--primary))"
                    className="cursor-nwse-resize" onPointerDown={iniciar('elemento', e.id, 'tamanho')} />}
                </g>
              ))}

              {/* ares */}
              {ares.filter((a) => a.projeto_id && mapa.ares[a.id]).map((a) => (
                <ArNoMapa key={a.id} a={a} pos={mapa.ares[a.id]} editando={editando} apagado={!editando && !visivel(a)}
                  selecionado={sel?.tipo === 'ar' && String(sel.id) === String(a.id)}
                  aoArrastar={iniciar('ar', a.id)} aoClicar={(e) => { e.stopPropagation(); setSel({ tipo: 'ar', id: a.id }) }} />
              ))}
            </svg>
          </div>
          <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            {editando ? 'Arraste salas, ares e elementos · quadrado azul no canto redimensiona · R gira · Delete apaga · setas ajustam · ⌘Z desfaz'
              : `Atualiza sozinho a cada 10 s${dados.mapa.atualizado_em ? ` · planta editada ${haQuanto(dados.mapa.atualizado_em)}` : ' · planta automática: clique em Editar planta para desenhar o escritório'}`}
          </p>
        </section>

        {/* painel lateral */}
        <aside className="space-y-4">
          <AnimatePresence mode="wait">
            {editando ? (
              <motion.div key="edicao" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="cartao space-y-4 p-5">
                <h2 className="titulo-secao">Planta</h2>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-muted-foreground">Largura<input type="number" min="400" max="6000" step="50" value={rascunho.largura}
                    onChange={(e) => mexer((n) => { n.largura = lim(+e.target.value || 400, 400, 6000) })} className="campo mt-1 h-9" /></label>
                  <label className="text-xs text-muted-foreground">Altura<input type="number" min="300" max="6000" step="50" value={rascunho.altura}
                    onChange={(e) => mexer((n) => { n.altura = lim(+e.target.value || 300, 300, 6000) })} className="campo mt-1 h-9" /></label>
                </div>
                {sel ? (
                  <div className="space-y-3 border-t border-border pt-4 text-sm">
                    <p className="font-medium">{sel.tipo === 'sala' ? projetos.find((p) => String(p.id) === String(sel.id))?.nome
                      : sel.tipo === 'ar' ? ares.find((a) => String(a.id) === String(sel.id))?.nome : NOME_EL[elSel?.tipo]}</p>
                    {elSel && elSel.tipo !== 'ar_previsto' && ['texto', 'mesa', 'bancada', 'armario', 'sofa', 'monitor'].includes(elSel.tipo) && <input placeholder="Nome (opcional)" value={elSel.rotulo} maxLength={40} onChange={(e) => mexer((n) => { n.elementos.find((x) => x.id === sel.id).rotulo = e.target.value })} className="campo h-9" aria-label="Texto" />}
                    {sel.tipo === 'sala' && (
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Posição {rascunho.salas[sel.id].x}, {rascunho.salas[sel.id].y}</span><span>Tamanho {rascunho.salas[sel.id].w} × {rascunho.salas[sel.id].h}</span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {sel.tipo !== 'sala' && <Botao tamanho="sm" variante="secundario" icone={RotateCw} onClick={girar}>Girar 90°</Botao>}
                      {sel.tipo === 'elemento' && <Botao tamanho="sm" variante="perigo" icone={Trash2} onClick={apagarEl}>Apagar</Botao>}
                    </div>
                  </div>
                ) : <p className="border-t border-border pt-4 text-sm text-muted-foreground">Clique numa sala, num ar ou num elemento para ajustar. Use a barra acima do mapa para adicionar portas, janelas e móveis.</p>}
                {!dados.edita_elementos && <p className="text-xs text-muted-foreground">Você só pode mexer nas salas e nos ares dos seus projetos. Paredes, portas e móveis ficam com quem vê todos os projetos.</p>}
              </motion.div>
            ) : elSel?.tipo === 'ar_previsto' ? (
              <motion.div key={`vaga-${elSel.id}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="cartao p-5">
                {(() => {
                  const sala = projetos.find((p) => mapa.salas[p.id] && salaDoPonto(mapa.salas[p.id], elSel))
                  return (<>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div><p className="text-xs text-muted-foreground">{sala ? sala.nome : 'Fora das salas'}</p><h2 className="text-base font-semibold">Ar previsto, ainda não cadastrado</h2></div>
                      <button onClick={() => setSel(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
                    </div>
                    <p className="text-sm text-muted-foreground">Este lugar da planta tem um ar-condicionado que o sistema ainda não controla. Cadastre o aparelho {sala ? `no projeto ${sala.nome}` : ''}: ele aparece aqui sozinho, no lugar desta vaga.</p>
                    {sala && sessao?.permissoes?.includes('aparelhos.gerenciar') && <Botao className="mt-4 w-full" icone={Plus} onClick={() => novoArNaSala(sala.id)}>Cadastrar este ar</Botao>}
                  </>)
                })()}
              </motion.div>
            ) : arSel ? (
              <motion.div key={`ar-${arSel.id}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="cartao p-5">
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{projetos.find((p) => p.id === arSel.projeto_id)?.nome}{arSel.comodo ? ` · ${arSel.comodo}` : ''}</p>
                    <h2 className="truncate text-base font-semibold">{arSel.nome}</h2>
                  </div>
                  <button onClick={() => setSel(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
                </div>
                {!arSel.botoes && <div className="mb-4"><Aviso tipo="alerta">Nenhum botão do controle gravado: os comandos ainda não chegam ao ar. Grave em Detalhes → Botões.</Aviso></div>}
                <ControleAr a={arSel} aoMudar={atualizarAr} podeControlar={podeControlar} />
                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs">
                  <div><dt className="text-muted-foreground">Transmissor</dt><dd className="mt-0.5 font-medium">{arSel.hub_nome ? `${arSel.hub_nome} · ${arSel.hub_online ? 'online' : 'offline'}` : 'nenhum'}</dd></div>
                  <div><dt className="text-muted-foreground">Botões gravados</dt><dd className="mt-0.5 font-medium tabular">{arSel.botoes}</dd></div>
                  <div><dt className="text-muted-foreground">{arSel.ligado ? 'Ligado' : 'Última mudança'}</dt><dd className="mt-0.5 font-medium">{arSel.ligado && arSel.ligado_desde ? haQuanto(arSel.ligado_desde) : arSel.atualizado_em ? haQuanto(arSel.atualizado_em) : '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Desliga sozinho</dt><dd className="mt-0.5 font-medium">{arSel.desliga_em ? new Date(arSel.desliga_em * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'não'}</dd></div>
                </dl>
                <Link to={`/aparelhos/${arSel.id}`} className="mt-4 flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Detalhes, botões e histórico<ArrowRight className="h-4 w-4" /></Link>
              </motion.div>
            ) : salaSel ? (
              <motion.div key={`sala-${salaSel.id}`} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="cartao p-5">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ background: salaSel.cor }} />Sala</p>
                    <h2 className="truncate text-base font-semibold">{salaSel.nome}</h2>
                    {salaSel.descricao && <p className="text-xs text-muted-foreground">{salaSel.descricao}</p>}
                  </div>
                  <button onClick={() => setSel(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
                </div>
                {(porSala[salaSel.id] || []).length ? (
                  <>
                    <div className="mb-2 flex gap-2">
                      <Botao tamanho="sm" icone={Power} disabled={!podeControlar} onClick={() => todosNaSala(salaSel.id, true)}>Ligar todos</Botao>
                      <Botao tamanho="sm" variante="secundario" disabled={!podeControlar} onClick={() => todosNaSala(salaSel.id, false)}>Desligar todos</Botao>
                    </div>
                    <div className="divide-y divide-border">
                      {(porSala[salaSel.id] || []).map((a) => (
                        <div key={a.id} className="flex items-center gap-1">
                          <div className="flex-1"><ControleAr a={a} aoMudar={atualizarAr} podeControlar={podeControlar} compacto /></div>
                          <button onClick={() => setSel({ tipo: 'ar', id: a.id })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label={`Abrir ${a.nome}`}><ChevronRight className="h-4 w-4" /></button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-sm text-muted-foreground">Esta sala ainda não tem ar-condicionado cadastrado.</p>}
                {sessao?.permissoes?.includes('aparelhos.gerenciar') && (
                  <button onClick={() => novoArNaSala(salaSel.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Plus className="h-4 w-4" />Adicionar ar nesta sala</button>
                )}
              </motion.div>
            ) : (
              <motion.div key="salas" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="cartao">
                <div className="border-b border-border px-5 py-3.5">
                  <h2 className="titulo-secao">Salas</h2>
                  <p className="text-xs text-muted-foreground">Ares de cada projeto, do mais ligado para o menos</p>
                </div>
                <ul className="p-2">
                  {[...projetos].sort((a, b) => (porSala[b.id] || []).filter((x) => x.ligado).length - (porSala[a.id] || []).filter((x) => x.ligado).length).map((p, i) => {
                    const lista = porSala[p.id] || []
                    const lig = lista.filter((a) => a.ligado)
                    return (
                      <motion.li key={p.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                        <button onClick={() => setSel({ tipo: 'sala', id: p.id })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted">
                          <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: p.cor }} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{p.nome}</span>
                            <span className="block text-xs text-muted-foreground">{lista.length} ar(es) · {lig.length ? `${lig.length} ligado(s) · ${lig.map((a) => `${a.temperatura}°`).join(', ')}` : 'desligados'}</span>
                          </span>
                          <span className="flex gap-0.5">{lista.map((a) => <span key={a.id} className="h-2 w-2 rounded-full" style={{ background: a.ligado ? COR_MODO[a.modo] : 'hsl(var(--border))' }} />)}</span>
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
                {semSala.length > 0 && (
                  <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    Sem sala: {semSala.map((a) => <Link key={a.id} to={`/aparelhos/${a.id}`} className="text-primary hover:underline">{a.nome}</Link>).reduce((acc, el, i) => (i ? [...acc, ', ', el] : [el]), [])}. Defina o projeto no aparelho para ele aparecer no mapa.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  )
}
