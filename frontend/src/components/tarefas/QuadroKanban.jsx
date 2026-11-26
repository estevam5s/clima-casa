import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useReducedMotion } from 'framer-motion'
import { CalendarDays, Check, ChevronsLeftRight, Circle, CircleCheck, Flag, Github, MessageSquare, MoreHorizontal, Pencil, Plus, Tag, Trash2, User } from 'lucide-react'

/* Quadro de tarefas (visão "Quadro" de /tarefas), no design de docs/prompt/kanbam/kanbam.md.
   Arrastar é feito com eventos de ponteiro (sem biblioteca): o cartão sai da coluna e segue o cursor, o espaço que ele
   deixou fecha, um espaço abre onde ele vai cair e os outros deslizam. A posição de soltar é calculada num retrato da
   coluna SEM o cartão arrastado (medir ao vivo faz o espaço empurrar cartões para trás do ponteiro e piscar entre dois
   lugares). No celular, segurar o cartão por um instante começa a arrastar (passar o dedo continua rolando).
   Teclado: foco no cartão, espaço pega, setas movem (cada passo já salva), espaço solta, Esc devolve ao lugar. */

const cn = (...c) => c.filter(Boolean).join(' ')
const SQUIRCLE = '[corner-shape:squircle]'
const CHIP = 'inline-flex h-[22px] items-center gap-1 rounded-[7px] px-2 text-[11px] leading-none'
const GAP = 8
const LIFT = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }
const FLUXO = { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 }

const PRIORIDADE = {
  urgente: ['Urgente', 'bg-rose-50 text-rose-600 dark:bg-rose-500/[0.12] dark:text-rose-300'],
  alta: ['Alta', 'bg-amber-50 text-amber-700 dark:bg-amber-500/[0.12] dark:text-amber-300'],
  media: ['Média', 'bg-blue-50 text-blue-600 dark:bg-blue-500/[0.12] dark:text-blue-300'],
  baixa: ['Baixa', 'bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400'],
}
const PONTOS = ['bg-neutral-400', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-teal-500', 'bg-rose-500', 'bg-sky-500', 'bg-orange-500']
const TINTAS_ETIQUETA = ['text-blue-500', 'text-emerald-500', 'text-violet-500', 'text-rose-500', 'text-amber-500', 'text-teal-500']
const TINTAS_INICIAIS = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500']
const FEITO = /(conclu|feit|pront|entreg|done)/i

const hash = (s) => { let h = 0; for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h }
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const amanha = () => new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10)
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function prazo(t) {
  if (!t.prazo) return null
  const h = hoje()
  const texto = t.prazo === h ? 'Hoje' : t.prazo === amanha() ? 'Amanhã' : `${+t.prazo.slice(8)} ${MESES[+t.prazo.slice(5, 7) - 1]}${t.prazo.slice(0, 4) !== h.slice(0, 4) ? ` ${t.prazo.slice(2, 4)}` : ''}`
  const tom = t.concluida ? 'normal' : t.prazo < h ? 'atrasada' : t.prazo <= amanha() ? 'perto' : 'normal'
  return { texto, tom }
}
const progresso = (t) => (t.concluida ? 100 : t.subtarefas ? Math.round((t.subtarefas_feitas / t.subtarefas) * 100) : null)

export default function QuadroKanban({ secoes, tarefas, pessoas, abrir, mudar, criar, mover, pode, novaSecao, renomearSecao, apagarSecao }) {
  const reduzir = useReducedMotion()
  const [recolhidas, setRecolhidas] = useState(() => { try { return JSON.parse(localStorage.getItem('clima-quadro-recolhidas') || '[]') } catch { return [] } })
  useEffect(() => { try { localStorage.setItem('clima-quadro-recolhidas', JSON.stringify(recolhidas)) } catch { /* sem armazenamento */ } }, [recolhidas])

  // colunas = seções (+ "Sem seção" se houver tarefa solta)
  const colunas = useMemo(() => {
    const visiveis = tarefas   // o filtro "Concluídas" da página já decide quais chegam aqui
    const cols = secoes.map((s, i) => ({ id: s.id, nome: s.nome, ponto: FEITO.test(s.nome) ? 'bg-emerald-500' : PONTOS[i % PONTOS.length], tarefas: visiveis.filter((t) => t.secao_id === s.id) }))
    const soltas = visiveis.filter((t) => !t.secao_id || !secoes.some((s) => s.id === t.secao_id))
    return soltas.length ? [{ id: null, nome: 'Sem seção', ponto: 'bg-neutral-400', tarefas: soltas }, ...cols] : cols
  }, [secoes, tarefas])
  const chaveCol = (id) => String(id ?? 'sem')

  const [arraste, setArraste] = useState(null)   // {id, de, largura, altura, dx, dy}
  const [vaga, setVaga] = useState(null)          // {col, index}
  const [pego, setPego] = useState(null)          // id pego pelo teclado
  const [aviso, setAviso] = useState('')
  const [bordas, setBordas] = useState({ inicio: true, fim: true })
  const x = useMotionValue(0), y = useMotionValue(0)
  const trilho = useRef(null)
  const refsLista = useRef(new Map()), refsCol = useRef(new Map()), refsCartao = useRef(new Map())
  const arrasteRef = useRef(null), vagaRef = useRef(null), retrato = useRef(new Map()), rolar = useRef(0), raf = useRef(null)
  const origem = useRef(null), pendente = useRef(null)

  const medirBordas = useCallback(() => {
    const el = trilho.current
    if (el) setBordas({ inicio: el.scrollLeft < 8, fim: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }, [])
  useEffect(() => {
    medirBordas()
    const el = trilho.current
    if (!el) return undefined
    const ro = new ResizeObserver(medirBordas); ro.observe(el)
    return () => ro.disconnect()
  }, [medirBordas, colunas.length])
  const mascara = bordas.inicio && bordas.fim ? undefined
    : `linear-gradient(to right, transparent 0%, #000 ${bordas.inicio ? '0%' : '24px'}, #000 ${bordas.fim ? '100%' : 'calc(100% - 24px)'}, transparent 100%)`

  // foco volta ao cartão pego pelo teclado depois que ele muda de coluna (o cartão remonta)
  useEffect(() => {
    if (!pego) return
    const el = refsCartao.current.get(pego)
    if (el && document.activeElement !== el) el.focus({ preventScroll: true })
  }, [tarefas, pego])

  const achar = useCallback((id) => {
    for (const c of colunas) { const i = c.tarefas.findIndex((t) => t.id === id); if (i > -1) return { col: c.id, index: i, tarefa: c.tarefas[i] } }
    return null
  }, [colunas])

  // grava a posição: ordem entre os vizinhos da coluna de destino (sem a própria tarefa)
  const salvarPosicao = useCallback((tarefa, colId, index) => {
    const lista = (colunas.find((c) => c.id === colId)?.tarefas || []).filter((t) => t.id !== tarefa.id)
    const i = Math.min(index, lista.length)
    const ant = lista[i - 1]?.ordem ?? (lista[0] ? lista[0].ordem - 2 : 0)
    const prox = lista[i]?.ordem ?? ant + 2
    const atual = achar(tarefa.id)
    if (atual && atual.col === colId && atual.index === i) return
    mover(tarefa, colId, (ant + prox) / 2)
  }, [colunas, mover, achar])

  const tirarRetrato = useCallback((id, de) => {
    const mapa = new Map()
    refsLista.current.forEach((lista, k) => {
      const topo = lista.getBoundingClientRect().top
      const cartoes = Array.from(lista.querySelectorAll('[data-kanban-card]'))
      let tirado = -1, alturaTirada = 0
      const linhas = cartoes.map((el, i) => {
        const r = el.getBoundingClientRect()
        const eh = k === chaveCol(de) && el.dataset.kanbanCard === String(id)
        if (eh) { tirado = i; alturaTirada = r.height }
        return { top: r.top - topo, h: r.height, eh }
      })
      mapa.set(k, linhas.filter((l) => !l.eh).map((l, i) => l.top - (tirado > -1 && i >= tirado ? alturaTirada + GAP : 0) + l.h / 2))
    })
    retrato.current = mapa
  }, [])

  const vagaEm = useCallback((cx, cy) => {
    let dentro = null, perto = null, dist = Infinity
    refsCol.current.forEach((el, k) => {
      const r = el.getBoundingClientRect()
      if (cx >= r.left && cx <= r.right) dentro = k
      const d = Math.abs(cx - (r.left + r.width / 2)); if (d < dist) { dist = d; perto = k }
    })
    const k = dentro ?? perto
    if (k == null) return null
    const col = colunas.find((c) => chaveCol(c.id) === k)
    if (!col) return null
    const lista = refsLista.current.get(k)
    if (!lista) return { col: col.id, index: 0 }
    const topo = lista.getBoundingClientRect().top
    const meios = retrato.current.get(k) || []
    let index = meios.length
    for (let i = 0; i < meios.length; i++) if (cy < topo + meios[i]) { index = i; break }
    return { col: col.id, index }
  }, [colunas])

  const terminar = useCallback(() => {
    const a = arrasteRef.current, v = vagaRef.current
    if (a && v) { const t = tarefas.find((x2) => x2.id === a.id); if (t) salvarPosicao(t, v.col, v.index) }
    arrasteRef.current = null; vagaRef.current = null; rolar.current = 0
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = null
    setArraste(null); setVaga(null)
  }, [tarefas, salvarPosicao])

  useEffect(() => {
    if (!arraste) return undefined
    const mover2 = (e) => {
      const a = arrasteRef.current
      if (!a) return
      x.set(e.clientX - a.dx); y.set(e.clientY - a.dy)
      const nova = vagaEm(e.clientX, e.clientY), cur = vagaRef.current
      if (nova && (!cur || cur.col !== nova.col || cur.index !== nova.index)) { vagaRef.current = nova; setVaga(nova) }
      const tr = trilho.current
      if (tr) { const r = tr.getBoundingClientRect(); rolar.current = e.clientX < r.left + 72 ? -14 : e.clientX > r.right - 72 ? 14 : 0 }
    }
    const soltar = () => terminar()
    const tecla = (e) => { if (e.key === 'Escape') { vagaRef.current = null; terminar() } }
    const travarRolagem = (e) => e.preventDefault()   // celular: com o cartão no dedo, a página não rola
    window.addEventListener('pointermove', mover2)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('pointercancel', soltar)
    window.addEventListener('keydown', tecla)
    window.addEventListener('touchmove', travarRolagem, { passive: false })
    const passo = () => { if (rolar.current && trilho.current) trilho.current.scrollLeft += rolar.current; raf.current = requestAnimationFrame(passo) }
    raf.current = requestAnimationFrame(passo)
    return () => {
      window.removeEventListener('pointermove', mover2); window.removeEventListener('pointerup', soltar)
      window.removeEventListener('pointercancel', soltar); window.removeEventListener('keydown', tecla)
      window.removeEventListener('touchmove', travarRolagem)
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [arraste, terminar, vagaEm, x, y])

  const comecar = (e, t, colId, index, el) => {
    const r = el.getBoundingClientRect()
    const estado = { id: t.id, de: colId, largura: r.width, altura: r.height, dx: e.clientX - r.left, dy: e.clientY - r.top }
    x.set(e.clientX - estado.dx); y.set(e.clientY - estado.dy)
    tirarRetrato(t.id, colId)
    arrasteRef.current = estado; vagaRef.current = { col: colId, index }
    setArraste(estado); setVaga({ col: colId, index }); setPego(null)
  }

  // mouse: começa a arrastar depois de 5 px (senão é clique e abre a tarefa); toque: segurar 300 ms
  const apertar = (e, t, colId, index) => {
    if (!pode || e.button !== 0) return
    const el = e.currentTarget
    const ini = { x: e.clientX, y: e.clientY, toque: e.pointerType === 'touch', timer: null }
    pendente.current = ini
    const limpar = () => {
      clearTimeout(ini.timer)
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up)
      pendente.current = null
    }
    const mv = (ev) => {
      const d = Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y)
      if (ini.toque) { if (d > 8) limpar() } else if (d > 5) { limpar(); comecar(ev, t, colId, index, el) }
    }
    const up = () => limpar()
    if (ini.toque) ini.timer = setTimeout(() => { limpar(); navigator.vibrate?.(10); comecar(e, t, colId, index, el) }, 300)
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  const nomeCol = (id) => colunas.find((c) => c.id === id)?.nome || 'Sem seção'
  const teclado = (e, t) => {
    if (!pode) { if (e.key === 'Enter') abrir(t.id); return }
    const estaPego = pego === t.id
    if (e.key === 'Enter' && !estaPego) { e.preventDefault(); abrir(t.id); return }
    if (e.key === ' ' || (e.key === 'Enter' && estaPego)) {
      e.preventDefault()
      const at = achar(t.id)
      if (estaPego) { setPego(null); setAviso(at ? `${t.titulo} solta em ${nomeCol(at.col)}, posição ${at.index + 1}.` : '') }
      else { origem.current = at && { col: at.col, index: at.index }; setPego(t.id); setAviso(`${t.titulo} pega. Use as setas para mover; espaço solta, Esc desfaz.`) }
      return
    }
    if (e.key === 'Escape' && estaPego) {
      e.preventDefault()
      if (origem.current) salvarPosicao(t, origem.current.col, origem.current.index)
      setPego(null); setAviso(`Cancelado. ${t.titulo} voltou ao lugar.`); return
    }
    if (!estaPego) return
    const at = achar(t.id)
    if (!at) return
    const ci = colunas.findIndex((c) => c.id === at.col)
    let para = null
    if (e.key === 'ArrowUp') para = { col: at.col, index: Math.max(0, at.index - 1) }
    if (e.key === 'ArrowDown') para = { col: at.col, index: Math.min(colunas[ci].tarefas.length - 1, at.index + 1) }
    if (e.key === 'ArrowLeft' && ci > 0) para = { col: colunas[ci - 1].id, index: Math.min(at.index, colunas[ci - 1].tarefas.length) }
    if (e.key === 'ArrowRight' && ci < colunas.length - 1) para = { col: colunas[ci + 1].id, index: Math.min(at.index, colunas[ci + 1].tarefas.length) }
    if (para) {
      e.preventDefault()
      // a posição é contada sem a própria tarefa, então descer 1 = ficar depois do vizinho de baixo
      salvarPosicao(t, para.col, para.index)
      setAviso(`${t.titulo} em ${nomeCol(para.col)}, posição ${para.index + 1}.`)
    }
  }

  const arrastada = arraste ? tarefas.find((t) => t.id === arraste.id) : null
  const total = tarefas.length, feitas = tarefas.filter((t) => t.concluida).length
  const atrasadas = tarefas.filter((t) => !t.concluida && t.prazo && t.prazo < hoje()).length

  return (
    <div className="w-full select-none text-neutral-950 antialiased dark:text-neutral-50">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="tabular">{total} tarefa(s) · {feitas} concluída(s){atrasadas ? <> · <b className="font-medium text-red-600 dark:text-red-400">{atrasadas} atrasada(s)</b></> : null}</span>
        {recolhidas.length > 0 && <button type="button" onClick={() => setRecolhidas([])} className="underline-offset-2 hover:underline">Abrir todas as colunas</button>}
        {pode && <span className="ml-auto hidden sm:inline">Arraste os cartões entre as colunas (no teclado: espaço e setas)</span>}
      </div>

      <div ref={trilho} role="group" aria-label="Quadro do projeto" onScroll={medirBordas}
        style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
        className="flex items-start gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <LayoutGroup>
          {colunas.map((col) => {
            const k = chaveCol(col.id)
            const alvo = !!arraste && vaga?.col === col.id
            const recolhida = recolhidas.includes(k)
            const lista = col.tarefas.filter((t) => t.id !== arraste?.id)
            const conta = col.tarefas.length - (arraste && arraste.de === col.id ? 1 : 0) + (alvo ? 1 : 0)
            if (recolhida) {
              return (
                <button key={k} type="button" ref={(el) => { if (el) refsCol.current.set(k, el); else refsCol.current.delete(k) }}
                  onClick={() => setRecolhidas((r) => r.filter((x2) => x2 !== k))} title={`Abrir ${col.nome}`}
                  className={cn('flex w-11 shrink-0 flex-col items-center gap-2 rounded-[16px] py-3 bg-neutral-100/70 hover:bg-neutral-200/60 dark:bg-white/[0.04] dark:hover:bg-white/[0.08]', alvo && 'bg-neutral-200/60 dark:bg-white/[0.08]', SQUIRCLE)}>
                  <span className={cn('h-2 w-2 rounded-full', col.ponto)} />
                  <span className="text-[11px] font-medium tabular-nums text-neutral-500">{conta}</span>
                  <span className="text-[13px] font-medium [writing-mode:vertical-rl]">{col.nome}</span>
                </button>
              )
            }
            return (
              <div key={k} data-kanban-column={k} ref={(el) => { if (el) refsCol.current.set(k, el); else refsCol.current.delete(k) }}
                className={cn('w-[286px] shrink-0 rounded-[16px] p-3 transition-colors duration-200 bg-neutral-100/70 dark:bg-white/[0.04]', alvo && 'bg-neutral-200/60 dark:bg-white/[0.08]', SQUIRCLE)}>
                <Cabecalho col={col} conta={conta} pode={pode && col.id != null}
                  renomear={(nome) => renomearSecao?.(col.id, nome)} apagar={() => apagarSecao?.({ id: col.id, nome: col.nome })}
                  recolher={() => setRecolhidas((r) => [...r, k])} />
                <div ref={(el) => { if (el) refsLista.current.set(k, el); else refsLista.current.delete(k) }} className="mt-3 flex min-h-[8px] flex-col gap-2">
                  {lista.map((t, i) => (
                    <Fragment key={t.id}>
                      {alvo && vaga.index === i && <Vaga altura={arraste.altura} />}
                      <Cartao t={t} pessoas={pessoas} pego={pego === t.id} reduzir={!!reduzir} pode={pode} mudar={mudar}
                        elRef={(el) => { if (el) refsCartao.current.set(t.id, el); else refsCartao.current.delete(t.id) }}
                        aoApertar={(e) => apertar(e, t, col.id, i)}
                        aoClicar={() => { if (!arrasteRef.current) abrir(t.id) }}
                        aoTeclar={(e) => teclado(e, t)} />
                    </Fragment>
                  ))}
                  {alvo && vaga.index >= lista.length && <Vaga altura={arraste.altura} />}
                  {!lista.length && !alvo && <p className="px-2 py-3 text-center text-[12px] text-neutral-400">Nenhuma tarefa aqui</p>}
                </div>
                {pode && <NovaTarefa aoCriar={(titulo) => criar({ titulo, ...(col.id ? { secao_id: col.id } : {}) })} />}
              </div>
            )
          })}
        </LayoutGroup>
        {pode && novaSecao && <NovaColuna aoCriar={novaSecao} />}
      </div>

      <Trilho trilhoRef={trilho} />

      <AnimatePresence>
        {arraste && arrastada && (
          <motion.div style={{ x, y, width: arraste.largura }} initial={{ scale: 1, rotate: 0 }}
            animate={{ scale: reduzir ? 1 : 1.03, rotate: reduzir ? 0 : 1.6 }} exit={{ scale: 1, rotate: 0, opacity: 0 }} transition={LIFT}
            className="pointer-events-none fixed left-0 top-0 z-50 origin-top-left">
            <Casca t={arrastada} pessoas={pessoas} flutuando />
          </motion.div>
        )}
      </AnimatePresence>
      <p className="sr-only" role="status" aria-live="polite">{aviso}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ partes */

// Barra de rolagem própria: a nativa do macOS só aparece quando já se está rolando.
function Trilho({ trilhoRef }) {
  const ref = useRef(null)
  const [g, setG] = useState({ razao: 1, desloc: 0 })
  const [segurando, setSegurando] = useState(false)
  const medir = useCallback(() => {
    const el = trilhoRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setG({ razao: el.clientWidth / el.scrollWidth, desloc: max > 0 ? el.scrollLeft / max : 0 })
  }, [trilhoRef])
  useEffect(() => {
    const el = trilhoRef.current
    if (!el) return undefined
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = new ResizeObserver(medir); ro.observe(el); Array.from(el.children).forEach((c) => ro.observe(c))
    return () => { el.removeEventListener('scroll', medir); ro.disconnect() }
  }, [medir, trilhoRef])
  const irPara = useCallback((cx) => {
    const r0 = ref.current, el = trilhoRef.current
    if (!r0 || !el) return
    const r = r0.getBoundingClientRect(), w = r.width * g.razao
    el.scrollLeft = Math.max(0, Math.min(1, (cx - r.left - w / 2) / (r.width - w))) * (el.scrollWidth - el.clientWidth)
  }, [g.razao, trilhoRef])
  useEffect(() => {
    if (!segurando) return undefined
    const mv = (e) => irPara(e.clientX), up = () => setSegurando(false)
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }
  }, [segurando, irPara])
  if (g.razao >= 0.999) return null
  return (
    <div ref={ref} onPointerDown={(e) => { setSegurando(true); irPara(e.clientX) }} aria-hidden
      className="mt-3 h-[6px] w-full cursor-pointer rounded-full bg-black/[0.05] dark:bg-white/[0.07]">
      <div style={{ width: `${g.razao * 100}%`, marginLeft: `${g.desloc * (100 - g.razao * 100)}%` }}
        className={cn('h-full rounded-full transition-colors', segurando ? 'bg-black/40 dark:bg-white/50' : 'bg-black/20 hover:bg-black/30 dark:bg-white/25 dark:hover:bg-white/40')} />
    </div>
  )
}

function BotaoIcone({ rotulo, onClick, children }) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} onClick={onClick}
      className={cn('grid h-6 w-6 place-items-center rounded-[7px] transition-colors duration-150 text-neutral-400 hover:bg-black/[0.06] hover:text-neutral-800 active:bg-black/[0.1] dark:text-neutral-500 dark:hover:bg-white/[0.1] dark:hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30', SQUIRCLE)}>
      {children}
    </button>
  )
}

function Cabecalho({ col, conta, pode, renomear, apagar, recolher }) {
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(col.nome)
  const [confirmar, setConfirmar] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return undefined
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) { setMenu(false); setConfirmar(false) } }
    window.addEventListener('pointerdown', fora)
    return () => window.removeEventListener('pointerdown', fora)
  }, [menu])
  const salvar = () => { setEditando(false); if (nome.trim() && nome.trim() !== col.nome) renomear(nome.trim()); else setNome(col.nome) }
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', col.ponto)} />
      {editando
        ? <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={salvar} onKeyDown={(e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setNome(col.nome); setEditando(false) } }}
          aria-label="Nome da coluna" className="h-6 min-w-0 flex-1 rounded-[6px] border border-black/10 bg-white px-1.5 text-[13px] font-medium outline-none dark:border-white/15 dark:bg-neutral-900" />
        : <h3 className="m-0 truncate text-[13px] font-medium tracking-[-0.005em]" onDoubleClick={() => pode && setEditando(true)}>{col.nome}</h3>}
      <motion.span key={conta} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={FLUXO}
        className={cn('grid h-[18px] min-w-[18px] place-items-center rounded-[6px] px-1 text-[11px] font-medium tabular-nums bg-black/[0.06] text-neutral-500 dark:bg-white/[0.09] dark:text-neutral-400', SQUIRCLE)}>
        {conta}
      </motion.span>
      <span ref={ref} className="relative ml-auto flex items-center">
        <BotaoIcone rotulo={`Opções de ${col.nome}`} onClick={() => setMenu((m) => !m)}><MoreHorizontal aria-hidden className="h-3.5 w-3.5" /></BotaoIcone>
        {menu && (
          <div role="menu" className={cn('absolute right-0 top-7 z-30 w-48 rounded-[10px] border border-black/[0.08] bg-white p-1 text-[12.5px] shadow-[0_12px_28px_-10px_rgb(0_0_0/0.3)] dark:border-white/10 dark:bg-neutral-900', SQUIRCLE)}>
            {/* marca: menu flutuante, a única sombra do quadro além do cartão no ar */}
            <ItemMenu icone={ChevronsLeftRight} onClick={() => { setMenu(false); recolher() }}>Recolher coluna</ItemMenu>
            {pode && <ItemMenu icone={Pencil} onClick={() => { setMenu(false); setEditando(true) }}>Renomear</ItemMenu>}
            {pode && (confirmar
              ? <ItemMenu icone={Trash2} perigo onClick={() => { setMenu(false); setConfirmar(false); apagar() }}>Confirmar: apagar a coluna</ItemMenu>
              : <ItemMenu icone={Trash2} perigo onClick={() => setConfirmar(true)}>Apagar coluna</ItemMenu>)}
            {pode && confirmar && <p className="px-2 pb-1.5 pt-0.5 text-[11px] text-neutral-500">As tarefas dela vão para a primeira coluna.</p>}
          </div>
        )}
      </span>
    </div>
  )
}

function ItemMenu({ icone: I, perigo, onClick, children }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left hover:bg-black/[0.05] dark:hover:bg-white/[0.07]', perigo ? 'text-red-600 dark:text-red-400' : 'text-neutral-700 dark:text-neutral-200')}>
      <I aria-hidden className="h-3.5 w-3.5" />{children}
    </button>
  )
}

function Vaga({ altura }) {
  return (
    <motion.div layout data-kanban-placeholder initial={{ opacity: 0, scaleY: 0.7 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: 0.7 }} transition={FLUXO}
      style={{ height: altura }} className={cn('origin-top rounded-[12px] border border-dashed border-neutral-300 bg-black/[0.02] dark:border-white/15 dark:bg-white/[0.03]', SQUIRCLE)} />
  )
}

function Cartao({ t, pessoas, pego, reduzir, pode, mudar, elRef, aoApertar, aoClicar, aoTeclar }) {
  return (
    <motion.div ref={elRef} layout data-kanban-card={t.id} tabIndex={0} role="button"
      aria-roledescription="Cartão arrastável" aria-pressed={pego}
      aria-label={`${t.titulo}. Enter abre${pode ? ', espaço pega para mover' : ''}.`}
      onPointerDown={aoApertar} onClick={aoClicar} onKeyDown={aoTeclar}
      transition={reduzir ? { duration: 0 } : FLUXO} whileHover={reduzir ? undefined : { y: -1 }}
      className={cn(pode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', 'rounded-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 dark:focus-visible:ring-white/30', pego && 'ring-2 ring-neutral-900/40 dark:ring-white/50', SQUIRCLE)}>
      <Casca t={t} pessoas={pessoas} pode={pode} mudar={mudar} />
    </motion.div>
  )
}

function Casca({ t, pessoas, flutuando, pode, mudar }) {
  const pr = PRIORIDADE[t.prioridade]
  const etiqueta = t.etiquetas?.[0]
  const resto = (t.etiquetas?.length || 0) - 1
  const pz = prazo(t)
  const pg = progresso(t)
  const resp = pessoas.find((p) => p.id === t.responsavel_id)
  const nota = (t.descricao || '').split('\n').find((l) => l.trim())
  return (
    <div className={cn('rounded-[12px] border p-3 border-black/[0.06] bg-white dark:border-white/[0.08] dark:bg-neutral-900',
      flutuando ? 'shadow-[0_16px_32px_-12px_rgb(0_0_0/0.28)]' : 'shadow-[0_1px_2px_rgb(0_0_0/0.05)]', SQUIRCLE)}>
      {(pr || etiqueta) && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          {pr && <span className={cn(CHIP, 'font-medium', pr[1], SQUIRCLE)}><Flag aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.25} /><span>{pr[0]}</span></span>}
          {etiqueta && (
            <span className={cn(CHIP, 'font-normal bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300', SQUIRCLE)}>
              <Tag aria-hidden className={cn('h-3 w-3 shrink-0', TINTAS_ETIQUETA[hash(etiqueta) % TINTAS_ETIQUETA.length])} strokeWidth={2.25} />
              <span className="max-w-[120px] truncate">{etiqueta}</span>
            </span>
          )}
          {resto > 0 && <span className={cn(CHIP, 'bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400', SQUIRCLE)}>+{resto}</span>}
        </div>
      )}
      <div className="flex items-start gap-2">
        {mudar && (
          <button type="button" disabled={!pode} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); mudar(t, { concluida: !t.concluida }) }}
            aria-label={t.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
            className={cn('mt-[1px] shrink-0 rounded-full transition-colors', t.concluida ? 'text-emerald-500' : 'text-neutral-300 hover:text-emerald-500 dark:text-neutral-600')}>
            {t.concluida ? <CircleCheck className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
        )}
        <p className={cn('m-0 min-w-0 break-words text-[14px] font-medium leading-snug tracking-[-0.005em]', t.concluida && 'text-neutral-400 line-through dark:text-neutral-500')}>{t.titulo}</p>
      </div>
      {nota && <p className="m-0 mt-1 line-clamp-2 text-[12px] font-normal leading-snug text-neutral-500 dark:text-neutral-400">{nota}</p>}
      {(resp || pz || pg != null || t.comentarios > 0 || t.github_item) && (
        <>
          <div className="mt-3 h-px bg-black/[0.06] dark:bg-white/[0.08]" />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              {pz && (
                <span className={cn('inline-flex items-center gap-1 text-[11.5px] font-normal tabular-nums',
                  pz.tom === 'atrasada' ? 'text-red-600 dark:text-red-400' : pz.tom === 'perto' ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400')}
                  title={pz.tom === 'atrasada' ? 'Atrasada' : undefined}>
                  <CalendarDays aria-hidden className="h-3 w-3 shrink-0" strokeWidth={2.25} />{pz.texto}
                </span>
              )}
              {pg != null && <Anel valor={pg} titulo={t.subtarefas ? `${t.subtarefas_feitas} de ${t.subtarefas} subtarefas` : 'Concluída'} />}
              {t.comentarios > 0 && <span className="inline-flex items-center gap-0.5 text-[11.5px] tabular-nums text-neutral-500 dark:text-neutral-400" title={`${t.comentarios} comentário(s)`}><MessageSquare aria-hidden className="h-3 w-3" />{t.comentarios}</span>}
              {t.github_item && <Github aria-label="No GitHub Projects" className="h-3 w-3 text-neutral-400" />}
            </div>
            <Pessoa p={resp} />
          </div>
        </>
      )}
    </div>
  )
}

function Dica({ rotulo, children }) {
  return (
    <span className="group/dica relative flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 translate-y-1 opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/dica:translate-y-0 group-hover/dica:opacity-100 group-focus-within/dica:translate-y-0 group-focus-within/dica:opacity-100">
        <span className={cn('block whitespace-nowrap rounded-[7px] px-2 py-1 text-[11px] font-medium leading-none text-white dark:text-neutral-900 bg-neutral-900 dark:bg-neutral-100 shadow-[0_6px_16px_-4px_rgb(0_0_0/0.3)]', SQUIRCLE)}>{rotulo}</span>
        <span aria-hidden className="absolute left-1/2 top-full h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1.5px] bg-neutral-900 dark:bg-neutral-100" />
      </span>
    </span>
  )
}

function Pessoa({ p }) {
  if (!p) return <span title="Sem responsável" className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border border-dashed border-neutral-300 text-neutral-400 dark:border-white/20"><User aria-hidden className="h-3 w-3" /></span>
  const ini = (p.nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
  return (
    <Dica rotulo={p.nome}>
      <span tabIndex={0} aria-label={p.nome} className="grid h-[22px] w-[22px] shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white focus-visible:outline-none dark:ring-neutral-900">
        {p.avatar
          ? <img src={p.avatar} alt="" draggable={false} className="h-full w-full object-cover" />
          : <span className={cn('grid h-full w-full place-items-center text-[9.5px] font-medium text-white', TINTAS_INICIAIS[hash(p.nome) % TINTAS_INICIAIS.length])}>{ini}</span>}
      </span>
    </Dica>
  )
}

function Anel({ valor, titulo }) {
  const v = Math.max(0, Math.min(100, valor)), r = 6, c = 2 * Math.PI * r
  return (
    <span className="inline-flex items-center gap-1" title={titulo}>
      <svg viewBox="0 0 16 16" aria-hidden className="h-[14px] w-[14px] -rotate-90">
        <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-black/[0.09] dark:stroke-white/15" />
        <motion.circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={c} initial={false}
          animate={{ strokeDashoffset: c - (c * v) / 100 }} transition={FLUXO} className={v >= 100 ? 'stroke-emerald-500' : 'stroke-neutral-900 dark:stroke-neutral-100'} />
      </svg>
      <span className="text-[11.5px] font-normal tabular-nums text-neutral-500 dark:text-neutral-400">{v}%</span>
    </span>
  )
}

function NovaTarefa({ aoCriar }) {
  const [aberto, setAberto] = useState(false)
  const [titulo, setTitulo] = useState('')
  const enviar = () => { const v = titulo.trim(); if (v) aoCriar(v); setTitulo('') }
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)}
        className={cn('mt-2 flex w-full items-center gap-1.5 rounded-[10px] px-2 py-2 text-[12.5px] font-medium text-neutral-500 transition-colors hover:bg-black/[0.04] hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100', SQUIRCLE)}>
        <Plus aria-hidden className="h-3.5 w-3.5" />Adicionar tarefa
      </button>
    )
  }
  return (
    <div className={cn('mt-2 rounded-[12px] border border-black/[0.08] bg-white p-2 dark:border-white/[0.1] dark:bg-neutral-900', SQUIRCLE)}>
      <textarea autoFocus rows={2} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome da tarefa"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } if (e.key === 'Escape') { setAberto(false); setTitulo('') } }}
        className="w-full resize-none bg-transparent text-[13.5px] outline-none placeholder:text-neutral-400" />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button type="button" onClick={() => { setAberto(false); setTitulo('') }} className="rounded-[7px] px-2 py-1 text-[12px] text-neutral-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]">Cancelar</button>
        <button type="button" onClick={enviar} disabled={!titulo.trim()} className="inline-flex items-center gap-1 rounded-[7px] bg-neutral-900 px-2 py-1 text-[12px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900">
          <Check aria-hidden className="h-3 w-3" />Criar
        </button>
      </div>
    </div>
  )
}

function NovaColuna({ aoCriar }) {
  const [aberto, setAberto] = useState(false)
  const [nome, setNome] = useState('')
  const enviar = () => { const v = nome.trim(); if (v) aoCriar(v); setNome(''); setAberto(false) }
  return (
    <div className={cn('w-[286px] shrink-0 rounded-[16px] border border-dashed border-black/[0.1] p-3 dark:border-white/[0.1]', SQUIRCLE)}>
      {aberto
        ? <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={enviar} placeholder="Nome da coluna"
          onKeyDown={(e) => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') { setNome(''); setAberto(false) } }}
          className="h-8 w-full rounded-[8px] border border-black/10 bg-white px-2 text-[13px] outline-none dark:border-white/15 dark:bg-neutral-900" />
        : <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[12.5px] font-medium text-neutral-500 hover:bg-black/[0.04] hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-neutral-100">
          <Plus aria-hidden className="h-3.5 w-3.5" />Adicionar coluna
        </button>}
    </div>
  )
}
