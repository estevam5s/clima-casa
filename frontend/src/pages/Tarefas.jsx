import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import {
  Archive, BarChart3, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleCheck, Columns3, ExternalLink, Filter,
  GanttChart, Github, List, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search, Trash2, User, UserRound, X,
} from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, Modal, Vazio, useToast } from '../components/ui'

// Tarefas no estilo Asana (backend/app/tarefas.py, rotas/tarefas.py): projetos com seções, lista, quadro, calendário,
// cronograma e painel; detalhe com subtarefas, comentários e histórico; integração com o GitHub Projects.
const VISOES = [['lista', 'Lista', List], ['quadro', 'Quadro', Columns3], ['calendario', 'Calendário', CalendarDays], ['cronograma', 'Cronograma', GanttChart], ['painel', 'Painel', BarChart3]]
const PRIO = { nenhuma: ['Sem prioridade', 'text-muted-foreground', ''], baixa: ['Baixa', 'text-sky-600 dark:text-sky-400', 'bg-sky-500'], media: ['Média', 'text-amber-600 dark:text-amber-400', 'bg-amber-500'], alta: ['Alta', 'text-orange-600 dark:text-orange-400', 'bg-orange-500'], urgente: ['Urgente', 'text-red-600 dark:text-red-400', 'bg-red-500'] }
const CORES = ['#0f766a', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#475569']
const hojeISO = () => { const d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10) }
const fmtData = (s) => { if (!s) return ''; const [a, m, d] = s.split('-'); const hoje = hojeISO(); if (s === hoje) return 'Hoje'; const am = new Date(Date.now() - 3 * 3600e3 + 86400e3).toISOString().slice(0, 10); if (s === am) return 'Amanhã'; return `${d}/${m}${a !== hoje.slice(0, 4) ? `/${a.slice(2)}` : ''}` }
const atrasada = (t) => !t.concluida && t.prazo && t.prazo < hojeISO()
const iniciais = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()
const quando = (s) => new Date(s * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Avatar({ pessoa, tamanho = 'h-6 w-6 text-[10px]' }) {
  if (!pessoa) return <span className={`inline-flex ${tamanho} shrink-0 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground`}><User className="h-3 w-3" /></span>
  return pessoa.avatar
    ? <img src={pessoa.avatar} alt={pessoa.nome} title={pessoa.nome} className={`${tamanho} shrink-0 rounded-full object-cover`} />
    : <span title={pessoa.nome} className={`inline-flex ${tamanho} shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary`}>{iniciais(pessoa.nome)}</span>
}

function Prazo({ t }) {
  if (!t.prazo) return null
  return <span className={`text-xs tabular ${atrasada(t) ? 'font-medium text-red-600 dark:text-red-400' : t.prazo === hojeISO() ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{fmtData(t.prazo)}</span>
}

function Concluir({ t, aoMudar, pode }) {
  return (
    <button disabled={!pode} onClick={(e) => { e.stopPropagation(); aoMudar(t, { concluida: !t.concluida }) }} aria-label={t.concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
      className={`shrink-0 rounded-full transition-colors ${t.concluida ? 'text-emerald-600' : 'text-muted-foreground hover:text-emerald-600'}`}>
      {t.concluida ? <CircleCheck className="h-[18px] w-[18px]" /> : <Circle className="h-[18px] w-[18px]" />}
    </button>
  )
}

function Etiquetas({ lista }) {
  if (!lista?.length) return null
  return <span className="flex flex-wrap gap-1">{lista.map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{e}</span>)}</span>
}

// --------- Lista (seções com linhas) ---------
function Lista({ secoes, tarefas, pessoas, abrir, mudar, criar, mover, pode, renomearSecao, apagarSecao, novaSecao }) {
  const [fechadas, setFechadas] = useState({})
  const [arrastando, setArrastando] = useState(null)
  const [sobre, setSobre] = useState(null)
  const porSecao = (sid) => tarefas.filter((t) => (t.secao_id || 0) === (sid || 0))
  const soltar = (sid, antesDe) => {
    if (!arrastando) return
    const lista = porSecao(sid).filter((t) => t.id !== arrastando.id)
    const i = antesDe ? lista.findIndex((t) => t.id === antesDe) : lista.length
    const ant = lista[i - 1]?.ordem ?? (lista[0] ? lista[0].ordem - 2 : 0), prox = lista[i]?.ordem ?? ant + 2
    mover(arrastando, sid, (ant + prox) / 2); setArrastando(null); setSobre(null)
  }
  const blocos = [...secoes.map((s) => ({ ...s })), ...(porSecao(null).length ? [{ id: null, nome: 'Sem seção' }] : [])]
  return (
    <div className="cartao overflow-hidden">
      <div className="hidden grid-cols-[minmax(0,1fr)_9rem_6.5rem_7rem] gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
        <span>Tarefa</span><span>Responsável</span><span>Prazo</span><span>Prioridade</span>
      </div>
      {blocos.map((s) => {
        const itens = porSecao(s.id)
        return (
          <div key={s.id ?? 'sem'} onDragOver={(e) => { e.preventDefault(); setSobre(`s${s.id}`) }} onDrop={() => soltar(s.id, null)}
            className={sobre === `s${s.id}` && arrastando ? 'bg-primary/5' : ''}>
            <div className="group flex items-center gap-2 border-b border-border px-3 py-2">
              <button onClick={() => setFechadas((f) => ({ ...f, [s.id]: !f[s.id] }))} className="rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Abrir ou fechar a seção">
                <ChevronDown className={`h-4 w-4 transition-transform ${fechadas[s.id] ? '-rotate-90' : ''}`} />
              </button>
              <TituloEditavel valor={s.nome} pode={pode && s.id} aoSalvar={(n) => renomearSecao(s.id, n)} className="text-sm font-semibold" />
              <span className="text-xs text-muted-foreground tabular">{itens.length}</span>
              {pode && s.id && <button onClick={() => apagarSecao(s)} className="ml-auto hidden rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600 group-hover:block" aria-label={`Apagar a seção ${s.nome}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {!fechadas[s.id] && (
              <>
                {itens.map((t) => {
                  const p = pessoas.find((x) => x.id === t.responsavel_id)
                  return (
                    <div key={t.id} draggable={pode} onDragStart={() => setArrastando(t)} onDragEnd={() => { setArrastando(null); setSobre(null) }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setSobre(`t${t.id}`) }} onDrop={(e) => { e.stopPropagation(); soltar(s.id, t.id) }}
                      onClick={() => abrir(t.id)}
                      className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-4 py-2 text-sm hover:bg-muted/50 md:grid-cols-[minmax(0,1fr)_9rem_6.5rem_7rem] ${sobre === `t${t.id}` && arrastando?.id !== t.id ? 'border-t-2 border-t-primary' : ''} ${arrastando?.id === t.id ? 'opacity-40' : ''}`}>
                      <span className="flex min-w-0 items-center gap-2">
                        <Concluir t={t} aoMudar={mudar} pode={pode} />
                        <span className={`truncate ${t.concluida ? 'text-muted-foreground line-through' : ''}`}>{t.titulo}</span>
                        {t.subtarefas > 0 && <span className="shrink-0 text-[11px] text-muted-foreground tabular">{t.subtarefas_feitas}/{t.subtarefas}</span>}
                        {t.comentarios > 0 && <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><MessageSquare className="h-3 w-3" />{t.comentarios}</span>}
                        {t.github_item && <Github className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="No GitHub" />}
                        <span className="hidden lg:inline"><Etiquetas lista={t.etiquetas} /></span>
                      </span>
                      <span className="hidden items-center gap-2 md:flex"><Avatar pessoa={p} /><span className="truncate text-xs text-muted-foreground">{p?.nome || ''}</span></span>
                      <span className="hidden md:block"><Prazo t={t} /></span>
                      <span className={`hidden text-xs md:block ${PRIO[t.prioridade][1]}`}>{t.prioridade !== 'nenhuma' ? PRIO[t.prioridade][0] : ''}</span>
                      <span className="flex items-center gap-2 md:hidden"><Prazo t={t} /><Avatar pessoa={p} /></span>
                    </div>
                  )
                })}
                {pode && s.id && <NovaLinha aoCriar={(titulo) => criar({ titulo, secao_id: s.id })} />}
              </>
            )}
          </div>
        )
      })}
      {pode && <NovaSecao aoCriar={novaSecao} />}
    </div>
  )
}

function TituloEditavel({ valor, aoSalvar, pode, className = '' }) {
  const [ed, setEd] = useState(false)
  const [v, setV] = useState(valor)
  useEffect(() => setV(valor), [valor])
  if (!ed || !pode) return <span onDoubleClick={() => pode && setEd(true)} className={`min-w-0 truncate ${className}`} title={pode ? 'Clique duas vezes para renomear' : undefined}>{valor}</span>
  const fim = () => { setEd(false); if (v.trim() && v.trim() !== valor) aoSalvar(v.trim()); else setV(valor) }
  return <input autoFocus className={`campo h-7 min-w-0 flex-1 ${className}`} value={v} onChange={(e) => setV(e.target.value)} onBlur={fim} onKeyDown={(e) => { if (e.key === 'Enter') fim(); if (e.key === 'Escape') { setV(valor); setEd(false) } }} maxLength={80} />
}

function NovaLinha({ aoCriar, rotulo = 'Adicionar tarefa' }) {
  const [aberto, setAberto] = useState(false)
  const [v, setV] = useState('')
  const enviar = () => { if (v.trim()) { aoCriar(v.trim()); setV('') } }
  if (!aberto) return <button onClick={() => setAberto(true)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground"><Plus className="h-4 w-4" />{rotulo}</button>
  return (
    <div className="flex items-center gap-2 border-b border-border/70 px-4 py-1.5">
      <Circle className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <input autoFocus className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Nome da tarefa e Enter" value={v} maxLength={300}
        onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') { setAberto(false); setV('') } }} onBlur={() => { enviar(); setAberto(false) }} />
    </div>
  )
}

function NovaSecao({ aoCriar }) {
  const [v, setV] = useState('')
  const [aberto, setAberto] = useState(false)
  if (!aberto) return <button onClick={() => setAberto(true)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"><Plus className="h-4 w-4" />Adicionar seção</button>
  const fim = () => { if (v.trim()) aoCriar(v.trim()); setV(''); setAberto(false) }
  return <div className="px-4 py-2"><input autoFocus className="campo h-8" placeholder="Nome da seção" value={v} maxLength={80} onChange={(e) => setV(e.target.value)} onBlur={fim} onKeyDown={(e) => { if (e.key === 'Enter') fim(); if (e.key === 'Escape') setAberto(false) }} /></div>
}

// --------- Quadro (colunas = seções) ---------
function Quadro({ secoes, tarefas, pessoas, abrir, mudar, criar, mover, pode, novaSecao }) {
  const [arrastando, setArrastando] = useState(null)
  const [alvo, setAlvo] = useState(null)
  const soltar = (sid, antesDe) => {
    if (!arrastando) return
    const lista = tarefas.filter((t) => (t.secao_id || 0) === (sid || 0) && t.id !== arrastando.id)
    const i = antesDe ? lista.findIndex((t) => t.id === antesDe) : lista.length
    const ant = lista[i - 1]?.ordem ?? (lista[0] ? lista[0].ordem - 2 : 0), prox = lista[i]?.ordem ?? ant + 2
    mover(arrastando, sid, (ant + prox) / 2); setArrastando(null); setAlvo(null)
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:mx-0 lg:px-0">
      <div className="flex min-h-[60vh] gap-3">
        {secoes.map((s) => {
          const itens = tarefas.filter((t) => t.secao_id === s.id)
          return (
            <div key={s.id} onDragOver={(e) => { e.preventDefault(); setAlvo(`s${s.id}`) }} onDrop={() => soltar(s.id, null)}
              className={`flex w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/40 ${alvo === `s${s.id}` && arrastando ? 'ring-2 ring-primary/40' : ''}`}>
              <div className="flex items-center gap-2 px-3 py-2.5"><span className="truncate text-sm font-semibold">{s.nome}</span><span className="text-xs text-muted-foreground tabular">{itens.length}</span></div>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {itens.map((t) => {
                  const p = pessoas.find((x) => x.id === t.responsavel_id)
                  return (
                    <motion.div layout key={t.id} draggable={pode} onDragStart={() => setArrastando(t)} onDragEnd={() => { setArrastando(null); setAlvo(null) }}
                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setAlvo(`t${t.id}`) }} onDrop={(e) => { e.stopPropagation(); soltar(s.id, t.id) }}
                      onClick={() => abrir(t.id)}
                      className={`cursor-pointer rounded-lg border bg-card p-3 text-sm hover:border-muted-foreground/40 ${alvo === `t${t.id}` && arrastando?.id !== t.id ? 'border-t-2 border-t-primary' : 'border-border'} ${arrastando?.id === t.id ? 'opacity-40' : ''}`}>
                      {t.prioridade !== 'nenhuma' && <span className={`mb-1.5 block h-1 w-8 rounded-full ${PRIO[t.prioridade][2]}`} title={PRIO[t.prioridade][0]} />}
                      <div className="flex items-start gap-2"><Concluir t={t} aoMudar={mudar} pode={pode} /><span className={`min-w-0 break-words ${t.concluida ? 'text-muted-foreground line-through' : ''}`}>{t.titulo}</span></div>
                      {t.etiquetas?.length > 0 && <div className="mt-2"><Etiquetas lista={t.etiquetas} /></div>}
                      <div className="mt-2.5 flex items-center gap-2"><Avatar pessoa={p} /><Prazo t={t} />
                        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                          {t.subtarefas > 0 && <span className="tabular">{t.subtarefas_feitas}/{t.subtarefas}</span>}
                          {t.comentarios > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t.comentarios}</span>}
                          {t.github_item && <Github className="h-3 w-3" />}
                        </span>
                      </div>
                    </motion.div>
                  )
                })}
                {pode && <div className="rounded-lg"><NovaLinha rotulo="Adicionar" aoCriar={(titulo) => criar({ titulo, secao_id: s.id })} /></div>}
              </div>
            </div>
          )
        })}
        {pode && <div className="w-72 shrink-0 rounded-xl border border-dashed border-border"><NovaSecao aoCriar={novaSecao} /></div>}
      </div>
    </div>
  )
}

// --------- Calendário (mês) ---------
function Calendario({ tarefas, abrir, mudar, pode }) {
  const [ref, setRef] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const dias = useMemo(() => {
    const ini = new Date(ref); ini.setDate(1 - ini.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d })
  }, [ref])
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const semPrazo = tarefas.filter((t) => !t.prazo && !t.concluida).length
  return (
    <div className="cartao overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() - 1, 1))} className="rounded p-1 hover:bg-muted" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setRef(new Date(ref.getFullYear(), ref.getMonth() + 1, 1))} className="rounded p-1 hover:bg-muted" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-sm font-semibold capitalize">{ref.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
        <button onClick={() => { const d = new Date(); setRef(new Date(d.getFullYear(), d.getMonth(), 1)) }} className="ml-2 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">Hoje</button>
        {semPrazo > 0 && <span className="ml-auto text-xs text-muted-foreground">{semPrazo} sem prazo não aparecem aqui</span>}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="border-b border-border px-2 py-1.5 text-xs font-medium text-muted-foreground">{d}</div>)}
          {dias.map((d) => {
            const k = iso(d), doDia = tarefas.filter((t) => t.prazo === k), fora = d.getMonth() !== ref.getMonth()
            return (
              <div key={k} className={`min-h-[6.5rem] border-b border-r border-border p-1.5 ${fora ? 'bg-muted/30' : ''}`}>
                <span className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular ${k === hojeISO() ? 'bg-primary font-semibold text-primary-foreground' : fora ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}>{d.getDate()}</span>
                <div className="space-y-1">
                  {doDia.slice(0, 4).map((t) => (
                    <button key={t.id} onClick={() => abrir(t.id)} className={`flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] ${t.concluida ? 'bg-muted text-muted-foreground line-through' : atrasada(t) ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-primary/10 text-foreground'}`}>
                      <span onClick={(e) => { e.stopPropagation(); if (pode) mudar(t, { concluida: !t.concluida }) }}>{t.concluida ? <Check className="h-3 w-3" /> : <Circle className="h-3 w-3" />}</span>
                      <span className="truncate">{t.titulo}</span>
                    </button>
                  ))}
                  {doDia.length > 4 && <p className="px-1 text-[11px] text-muted-foreground">+{doDia.length - 4}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --------- Cronograma (barras do início ao prazo) ---------
function Cronograma({ tarefas, secoes, pessoas, abrir }) {
  const comData = tarefas.filter((t) => t.prazo || t.inicio)
  const [ini, setIni] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d })
  const DIAS = 42, larg = 34
  const dias = Array.from({ length: DIAS }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d })
  const idx = (s) => Math.round((new Date(`${s}T12:00:00`) - new Date(new Date(ini).setHours(12, 0, 0, 0))) / 86400e3)
  if (!comData.length) return <Vazio icone={GanttChart} titulo="Nenhuma tarefa com datas" texto="Dê um prazo (e, se quiser, um início) às tarefas para vê-las no cronograma." />
  return (
    <div className="cartao overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <button onClick={() => setIni(new Date(ini.getTime() - 14 * 86400e3))} className="rounded p-1 hover:bg-muted" aria-label="Voltar duas semanas"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => setIni(new Date(ini.getTime() + 14 * 86400e3))} className="rounded p-1 hover:bg-muted" aria-label="Avançar duas semanas"><ChevronRight className="h-4 w-4" /></button>
        <span className="text-sm text-muted-foreground">{dias[0].toLocaleDateString('pt-BR')} a {dias[DIAS - 1].toLocaleDateString('pt-BR')}</span>
      </div>
      <div className="overflow-x-auto">
        <div style={{ width: 240 + DIAS * larg }}>
          <div className="flex border-b border-border text-[10px] text-muted-foreground">
            <div className="w-60 shrink-0 px-3 py-1.5 text-xs font-medium">Tarefa</div>
            {dias.map((d) => <div key={d.toISOString()} style={{ width: larg }} className={`shrink-0 border-l border-border/60 py-1.5 text-center tabular ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-muted/40' : ''}`}>{d.getDate()}{d.getDate() === 1 || d === dias[0] ? <span className="block">{d.toLocaleDateString('pt-BR', { month: 'short' })}</span> : null}</div>)}
          </div>
          {secoes.map((s) => {
            const itens = comData.filter((t) => t.secao_id === s.id)
            if (!itens.length) return null
            return (
              <div key={s.id}>
                <div className="border-b border-border bg-muted/30 px-3 py-1 text-xs font-semibold">{s.nome}</div>
                {itens.map((t) => {
                  const a = idx(t.inicio || t.prazo), b = idx(t.prazo || t.inicio)
                  const x0 = Math.max(0, Math.min(a, b)), x1 = Math.min(DIAS - 1, Math.max(a, b))
                  const visivel = x1 >= 0 && x0 <= DIAS - 1
                  const p = pessoas.find((x) => x.id === t.responsavel_id)
                  return (
                    <div key={t.id} className="relative flex h-9 items-center border-b border-border/60">
                      <button onClick={() => abrir(t.id)} className="flex w-60 shrink-0 items-center gap-2 truncate px-3 text-left text-sm hover:text-primary"><Avatar pessoa={p} tamanho="h-5 w-5 text-[9px]" /><span className="truncate">{t.titulo}</span></button>
                      {visivel && <button onClick={() => abrir(t.id)} title={`${t.inicio || t.prazo} a ${t.prazo || t.inicio}`}
                        style={{ left: 240 + x0 * larg + 3, width: (x1 - x0 + 1) * larg - 6 }}
                        className={`absolute h-5 rounded-md text-[10px] text-white ${t.concluida ? 'bg-emerald-600/70' : atrasada(t) ? 'bg-red-500' : 'bg-primary'}`} />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// --------- Painel (números do projeto) ---------
function Painel({ tarefas, secoes, pessoas }) {
  const total = tarefas.length, feitas = tarefas.filter((t) => t.concluida).length, atras = tarefas.filter(atrasada).length
  const semResp = tarefas.filter((t) => !t.concluida && !t.responsavel_id).length
  const porPessoa = pessoas.map((p) => ({ p, n: tarefas.filter((t) => !t.concluida && t.responsavel_id === p.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const porSecao = secoes.map((s) => ({ s, n: tarefas.filter((t) => t.secao_id === s.id && !t.concluida).length }))
  const porPrio = Object.keys(PRIO).map((k) => ({ k, n: tarefas.filter((t) => t.prioridade === k && !t.concluida).length }))
  const semana = Array.from({ length: 8 }, (_, i) => { const fim = Date.now() / 1000 - (7 - i) * 7 * 86400; return { i, n: tarefas.filter((t) => t.concluida_em && t.concluida_em > fim - 7 * 86400 && t.concluida_em <= fim).length } })
  const max = (l) => Math.max(1, ...l.map((x) => x.n))
  return (
    <div className="space-y-6">
      <div className="cartao grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x">
        {[['Tarefas', total, ''], ['Concluídas', feitas, total ? `${Math.round((feitas / total) * 100)}%` : ''], ['Atrasadas', atras, atras ? 'prazo vencido' : 'nenhuma'], ['Sem responsável', semResp, 'abertas']].map(([r, v, d]) => (
          <div key={r} className="px-5 py-4"><p className="text-xs font-medium text-muted-foreground">{r}</p><p className={`mt-1 text-2xl font-semibold tabular ${r === 'Atrasadas' && v ? 'text-red-600 dark:text-red-400' : ''}`}>{v}</p><p className="text-xs text-muted-foreground">{d}</p></div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {[['Abertas por seção', porSecao.map((x) => ({ r: x.s.nome, n: x.n }))], ['Abertas por pessoa', porPessoa.map((x) => ({ r: x.p.nome, n: x.n }))], ['Abertas por prioridade', porPrio.map((x) => ({ r: PRIO[x.k][0], n: x.n }))]].map(([t, l]) => (
          <section key={t} className="cartao p-5"><h3 className="titulo-secao mb-3">{t}</h3>
            {l.length ? <ul className="space-y-2.5">{l.map((x) => <li key={x.r} className="text-sm"><div className="flex justify-between"><span className="truncate">{x.r}</span><span className="tabular text-muted-foreground">{x.n}</span></div><div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(x.n / max(l)) * 100}%` }} /></div></li>)}</ul> : <p className="text-sm text-muted-foreground">Nada aberto.</p>}
          </section>
        ))}
      </div>
      <section className="cartao p-5"><h3 className="titulo-secao">Concluídas por semana</h3><p className="mb-3 text-xs text-muted-foreground">Últimas 8 semanas</p>
        <div className="flex h-32 items-end gap-2">{semana.map((s) => <div key={s.i} className="flex flex-1 flex-col items-center gap-1"><span className="text-[11px] tabular text-muted-foreground">{s.n || ''}</span><div className="w-full rounded-t bg-primary/70" style={{ height: `${(s.n / max(semana)) * 100}%`, minHeight: s.n ? 4 : 1 }} /></div>)}</div>
      </section>
    </div>
  )
}

// --------- Detalhe da tarefa (painel lateral) ---------
function Detalhe({ id, pessoas, secoes, pode, aoFechar, aoMudou, abrir }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [coment, setComent] = useState('')
  const [etq, setEtq] = useState('')
  const [apagar, setApagar] = useState(false)
  const carregar = useCallback(() => api.get(`/api/tarefas/${id}`).then(setD).catch((e) => toast(e.message, 'erro')), [id, toast])
  useEffect(() => { setD(null); carregar() }, [carregar])
  useEffect(() => { const esc = (e) => e.key === 'Escape' && aoFechar(); window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [aoFechar])
  const salvar = async (campos) => { try { setD(await api.put(`/api/tarefas/${id}`, campos)); aoMudou() } catch (e) { toast(e.message, 'erro') } }
  const t = d?.tarefa
  return (
    <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.18 }}
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl"> {/* marca: painel flutua sobre a lista */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {t && <Botao tamanho="sm" variante={t.concluida ? 'secundario' : 'primario'} disabled={!pode} onClick={() => salvar({ concluida: !t.concluida })} icone={t.concluida ? RefreshCw : Check}>{t.concluida ? 'Reabrir' : 'Concluir'}</Botao>}
        {t?.github_url && <a href={t.github_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted"><Github className="h-4 w-4" />Issue<ExternalLink className="h-3 w-3" /></a>}
        <div className="ml-auto flex items-center gap-1">
          {pode && t && <button onClick={() => setApagar(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Apagar tarefa"><Trash2 className="h-4 w-4" /></button>}
          <button onClick={aoFechar} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      </div>
      {!t ? <div className="p-5"><Esqueleto className="h-40" /></div> : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {d.pai && <button onClick={() => abrir(d.pai.id)} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3 w-3" />{d.pai.titulo}</button>}
          <textarea key={`t${t.id}${t.atualizado_em}`} defaultValue={t.titulo} disabled={!pode} rows={1} maxLength={300}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== t.titulo && salvar({ titulo: e.target.value.trim() })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
            className="w-full resize-none bg-transparent text-xl font-semibold leading-snug outline-none" aria-label="Título" />
          <dl className="mt-3 grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Responsável</dt>
            <dd><select className="campo h-8" disabled={!pode} value={t.responsavel_id || ''} onChange={(e) => salvar({ responsavel_id: e.target.value || null })}><option value="">Ninguém</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></dd>
            <dt className="text-muted-foreground">Início</dt>
            <dd><input type="date" className="campo h-8" disabled={!pode} value={t.inicio || ''} onChange={(e) => salvar({ inicio: e.target.value })} /></dd>
            <dt className="text-muted-foreground">Prazo</dt>
            <dd className="flex items-center gap-2"><input type="date" className="campo h-8" disabled={!pode} value={t.prazo || ''} onChange={(e) => salvar({ prazo: e.target.value })} />{atrasada(t) && <span className="text-xs font-medium text-red-600 dark:text-red-400">atrasada</span>}</dd>
            {!t.pai_id && <><dt className="text-muted-foreground">Seção</dt>
              <dd><select className="campo h-8" disabled={!pode} value={t.secao_id || ''} onChange={(e) => salvar({ secao_id: +e.target.value })}>{secoes.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></dd></>}
            <dt className="text-muted-foreground">Prioridade</dt>
            <dd className="flex flex-wrap gap-1">{Object.entries(PRIO).map(([k, [r, c]]) => <button key={k} disabled={!pode} onClick={() => salvar({ prioridade: k })} className={`h-7 rounded-md border px-2 text-xs ${t.prioridade === k ? `border-primary bg-primary/10 font-medium ${c}` : 'border-border hover:bg-muted'}`}>{r}</button>)}</dd>
            <dt className="text-muted-foreground">Estimativa</dt>
            <dd className="flex items-center gap-2"><input type="number" min="0" step="0.5" className="campo h-8 w-24" disabled={!pode} defaultValue={t.estimativa_h ?? ''} key={`e${t.id}`} onBlur={(e) => salvar({ estimativa_h: e.target.value === '' ? null : +e.target.value })} /><span className="text-xs text-muted-foreground">horas</span></dd>
            <dt className="text-muted-foreground">Etiquetas</dt>
            <dd className="flex flex-wrap items-center gap-1">
              {t.etiquetas.map((e) => <span key={e} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs">{e}{pode && <button onClick={() => salvar({ etiquetas: t.etiquetas.filter((x) => x !== e) })} aria-label={`Tirar ${e}`}><X className="h-3 w-3" /></button>}</span>)}
              {pode && t.etiquetas.length < 12 && <input className="h-7 w-28 rounded-md border border-dashed border-border bg-transparent px-2 text-xs outline-none focus:border-primary" placeholder="+ etiqueta" value={etq} maxLength={30} onChange={(e) => setEtq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && etq.trim()) { salvar({ etiquetas: [...new Set([...t.etiquetas, etq.trim()])] }); setEtq('') } }} />}
            </dd>
          </dl>
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição</h4>
          <textarea key={`d${t.id}${t.atualizado_em}`} defaultValue={t.descricao} disabled={!pode} rows={5} maxLength={20000} placeholder="O que precisa ser feito, links, critérios de pronto…"
            onBlur={(e) => e.target.value !== t.descricao && salvar({ descricao: e.target.value })} className="campo mt-1.5 min-h-[6rem] w-full resize-y py-2" />
          {!t.pai_id && (
            <>
              <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subtarefas {d.subtarefas.length > 0 && <span className="tabular">({d.subtarefas.filter((s) => s.concluida).length}/{d.subtarefas.length})</span>}</h4>
              <div className="mt-1.5 rounded-lg border border-border">
                {d.subtarefas.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 border-b border-border/70 px-3 py-1.5 text-sm last:border-b-0">
                    <Concluir t={s} pode={pode} aoMudar={async (x, c) => { await api.put(`/api/tarefas/${x.id}`, c); carregar(); aoMudou() }} />
                    <button onClick={() => abrir(s.id)} className={`min-w-0 flex-1 truncate text-left hover:text-primary ${s.concluida ? 'text-muted-foreground line-through' : ''}`}>{s.titulo}</button>
                    <Avatar pessoa={pessoas.find((p) => p.id === s.responsavel_id)} tamanho="h-5 w-5 text-[9px]" /><Prazo t={s} />
                  </div>
                ))}
                {pode && <NovaLinha rotulo="Adicionar subtarefa" aoCriar={async (titulo) => { await api.post('/api/tarefas', { pai_id: t.id, titulo }); carregar(); aoMudou() }} />}
              </div>
            </>
          )}
          <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Comentários e histórico</h4>
          <ol className="mt-2 space-y-3">
            {d.comentarios.map((c) => c.tipo === 'evento' ? (
              <li key={c.id} className="flex gap-2 text-xs text-muted-foreground"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border" /><span><b className="font-medium text-foreground/80">{c.autor_nome || 'Sistema'}</b> · {c.texto} · {quando(c.criado_em)}</span></li>
            ) : (
              <li key={c.id} className="flex gap-2.5"><Avatar pessoa={pessoas.find((p) => p.id === c.autor_id) || { nome: c.autor_nome }} tamanho="h-7 w-7 text-[10px]" />
                <div className="min-w-0 flex-1 rounded-lg bg-muted/60 px-3 py-2"><p className="text-xs"><b className="font-medium">{c.autor_nome}</b> <span className="text-muted-foreground">{quando(c.criado_em)}</span></p><p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{c.texto}</p></div></li>
            ))}
          </ol>
          {pode && (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!coment.trim()) return; try { setD(await api.post(`/api/tarefas/${id}/comentarios`, { texto: coment.trim() })); setComent(''); aoMudou() } catch (er) { toast(er.message, 'erro') } }}>
              <textarea className="campo min-h-[2.5rem] flex-1 resize-y py-2" rows={2} placeholder="Escreva um comentário (o responsável recebe um aviso)" value={coment} maxLength={5000} onChange={(e) => setComent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) e.currentTarget.form.requestSubmit() }} />
              <Botao type="submit" tamanho="sm" disabled={!coment.trim()}>Comentar</Botao>
            </form>
          )}
        </div>
      )}
      <Modal aberto={apagar} titulo="Apagar esta tarefa?" onFechar={() => setApagar(false)}>
        <p className="text-sm text-muted-foreground">As subtarefas e os comentários vão junto. Se ela estiver no GitHub Projects, continua lá.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setApagar(false)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { try { await api.del(`/api/tarefas/${id}`); setApagar(false); aoMudou(); aoFechar() } catch (e) { toast(e.message, 'erro') } }}>Apagar</Botao></div>
      </Modal>
    </motion.aside>
  )
}

// --------- GitHub ---------
function GithubProjeto({ projeto, info, gestor, dono, aoMudou, aberto, aoFechar }) {
  const toast = useToast()
  const [token, setToken] = useState('')
  const [conta, setConta] = useState('')
  const [lista, setLista] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const g = projeto?.github
  const buscar = async () => { setOcupado(true); try { setLista((await api.get(`/api/tarefas-github/projetos?dono=${encodeURIComponent(conta.trim())}`)).projetos) } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) } }
  const ligar = async (p) => { setOcupado(true); try { await api.post(`/api/tarefas/projetos/${projeto.id}/github`, { dono: p.dono, numero: p.number }); toast(`Ligado a ${p.title}. As colunas de Status viraram seções; agora sincronize.`); aoMudou() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) } }
  return (
    <Modal aberto={aberto} titulo="GitHub Projects" onFechar={aoFechar} largura="max-w-xl">
      <div className="space-y-4 text-sm">
        {!info.conectado ? (
          dono ? (
            <div>
              <p className="text-muted-foreground">Cole um token do GitHub que só mexe em Projects. O sistema recusa token que também escreve em repositórios.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Projects da sua conta pessoal: <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href="https://github.com/settings/tokens/new?scopes=project&description=Clima%20Escritorio%20-%20Tarefas">token clássico com o escopo project</a> (já vem marcado).</li>
                <li>Projects de uma organização: fine-grained token com a organização como dono e <b>Organization → Projects: Read and write</b>.</li>
              </ol>
              <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); setOcupado(true); try { await api.put('/api/tarefas-github/token', { token: token.trim() }); setToken(''); toast('GitHub conectado.'); aoMudou() } catch (er) { toast(er.message, 'erro') } finally { setOcupado(false) } }}>
                <input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" className="campo h-9 flex-1 font-mono" placeholder="Cole o token do GitHub" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Token do GitHub" />
                <Botao type="submit" tamanho="sm" carregando={ocupado} disabled={token.trim().length < 20}>Conectar</Botao>
              </form>
            </div>
          ) : <Aviso tipo="alerta">O dono ainda não conectou o GitHub.</Aviso>
        ) : (
          <p className="flex items-center gap-2"><Github className="h-4 w-4" />Conectado como <b>{info.login}</b>{dono && <button className="ml-auto text-xs text-muted-foreground underline" onClick={async () => { await api.put('/api/tarefas-github/token', { token: '' }); aoMudou() }}>Desconectar</button>}</p>
        )}
        {info.conectado && g && (
          <div className="rounded-lg border border-border p-3">
            <p>Este projeto está ligado a <a href={g.url} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{g.titulo}</a> ({g.dono} #{g.numero}).</p>
            <p className="mt-1 text-xs text-muted-foreground">{g.sincronizado_em ? `Última sincronização: ${quando(g.sincronizado_em)}.` : 'Ainda não sincronizado.'} O Status do GitHub é a seção daqui; tarefa nova daqui vira rascunho lá; apagar aqui não apaga lá.</p>
            {gestor && <button className="mt-2 text-xs text-red-600 underline" onClick={async () => { await api.del(`/api/tarefas/projetos/${projeto.id}/github`); aoMudou() }}>Desligar do GitHub</button>}
          </div>
        )}
        {info.conectado && !g && gestor && (
          <div>
            <p className="text-muted-foreground">Escolha o Project do GitHub para ligar a <b>{projeto?.nome}</b>. Deixe a conta vazia para ver os seus.</p>
            <div className="mt-2 flex gap-2"><input className="campo h-9 flex-1" placeholder="Organização ou usuário (opcional)" value={conta} onChange={(e) => setConta(e.target.value)} maxLength={39} /><Botao tamanho="sm" variante="secundario" carregando={ocupado} onClick={buscar}>Procurar</Botao></div>
            {lista && (lista.length ? <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">{lista.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"><span className="min-w-0 flex-1 truncate">{p.title} <span className="text-xs text-muted-foreground">#{p.number} · {p.dono}</span></span><Botao tamanho="sm" onClick={() => ligar(p)} disabled={ocupado}>Ligar</Botao></li>))}</ul>
              : <p className="mt-2 text-muted-foreground">Nenhum Project aberto nessa conta.</p>)}
          </div>
        )}
      </div>
    </Modal>
  )
}

function NovoProjeto({ aberto, aoFechar, aoCriar }) {
  const [f, setF] = useState({ nome: '', descricao: '', cor: CORES[0], modelo: 'kanban' })
  const MODELOS = { kanban: ['A fazer', 'Fazendo', 'Feito'], sprint: ['Backlog', 'Nesta sprint', 'Em revisão', 'Pronto'], bugs: ['Novo', 'Analisando', 'Corrigindo', 'Testar', 'Resolvido'], simples: ['Tarefas'] }
  return (
    <Modal aberto={aberto} titulo="Novo projeto" onFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); aoCriar({ nome: f.nome.trim(), descricao: f.descricao.trim(), cor: f.cor, secoes: MODELOS[f.modelo] }) }}>
        <label className="block text-sm">Nome<input autoFocus className="campo mt-1" value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Instalação dos transmissores" /></label>
        <label className="block text-sm">Descrição<input className="campo mt-1" value={f.descricao} maxLength={2000} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
        <div className="text-sm">Cor<div className="mt-1 flex flex-wrap gap-1.5">{CORES.map((c) => <button type="button" key={c} onClick={() => setF({ ...f, cor: c })} aria-label={c} className={`h-7 w-7 rounded-full ${f.cor === c ? 'ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}`} style={{ background: c }} />)}</div></div>
        <div className="text-sm">Seções iniciais<div className="mt-1 grid grid-cols-2 gap-2">{Object.entries(MODELOS).map(([k, l]) => (
          <button type="button" key={k} onClick={() => setF({ ...f, modelo: k })} className={`rounded-lg border p-2 text-left text-xs ${f.modelo === k ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}><b className="block text-sm font-medium capitalize">{k === 'kanban' ? 'Quadro' : k === 'sprint' ? 'Sprint' : k === 'bugs' ? 'Correções' : 'Lista simples'}</b>{l.join(' · ')}</button>))}</div></div>
        <div className="flex justify-end gap-2 pt-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" disabled={!f.nome.trim()}>Criar projeto</Botao></div>
      </form>
    </Modal>
  )
}

// --------- Minhas tarefas (todas as pessoas que a pessoa é responsável) ---------
function Minhas({ abrir, mudar, versao }) {
  const [d, setD] = useState(null)
  useEffect(() => { api.get('/api/tarefas/minhas').then(setD).catch(() => setD({ tarefas: [] })) }, [versao])
  if (!d) return <Esqueleto className="h-64" />
  const grupos = [['Atrasadas', d.tarefas.filter(atrasada)], ['Hoje', d.tarefas.filter((t) => !t.concluida && t.prazo === hojeISO())],
    ['Próximos 7 dias', d.tarefas.filter((t) => !t.concluida && t.prazo > hojeISO() && t.prazo <= new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10))],
    ['Depois', d.tarefas.filter((t) => !t.concluida && (!t.prazo || t.prazo > new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10)))],
    ['Concluídas (7 dias)', d.tarefas.filter((t) => t.concluida)]]
  if (!d.tarefas.length) return <Vazio icone={UserRound} titulo="Nada com você agora" texto="Quando alguém marcar você como responsável de uma tarefa, ela aparece aqui." />
  return (
    <div className="cartao overflow-hidden">
      {grupos.filter(([, l]) => l.length).map(([g, l]) => (
        <div key={g}>
          <p className="border-b border-border bg-muted/30 px-4 py-1.5 text-xs font-semibold">{g} <span className="font-normal text-muted-foreground tabular">{l.length}</span></p>
          {l.map((t) => (
            <div key={t.id} onClick={() => abrir(t.id, t.projeto_id)} className="flex cursor-pointer items-center gap-3 border-b border-border/70 px-4 py-2 text-sm hover:bg-muted/50">
              <Concluir t={t} aoMudar={mudar} pode />
              <span className={`min-w-0 flex-1 truncate ${t.concluida ? 'text-muted-foreground line-through' : ''}`}>{t.titulo}</span>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><span className="h-2 w-2 rounded-full" style={{ background: t.projeto_cor }} />{t.projeto_nome}{t.secao_nome ? ` · ${t.secao_nome}` : ''}</span>
              <Prazo t={t} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Tarefas() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const [params, setParams] = useSearchParams()
  const [geral, setGeral] = useState(null)
  const [pessoas, setPessoas] = useState([])
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const [novo, setNovo] = useState(false)
  const [gh, setGh] = useState(false)
  const [sinc, setSinc] = useState(false)
  const [versao, setVersao] = useState(0)
  const [filtro, setFiltro] = useState({ q: '', resp: '', prio: '', concluidas: false })
  const [menuProj, setMenuProj] = useState(false)
  const pid = params.get('projeto') === 'minhas' ? 'minhas' : params.get('projeto') ? +params.get('projeto') : null
  const visao = VISOES.some(([k]) => k === params.get('visao')) ? params.get('visao') : (() => { try { return localStorage.getItem('clima-tarefas-visao') || 'lista' } catch { return 'lista' } })()
  const aberta = params.get('tarefa') ? +params.get('tarefa') : null
  const set = (mud) => { const p = new URLSearchParams(params); Object.entries(mud).forEach(([k, v]) => (v == null ? p.delete(k) : p.set(k, v))); setParams(p, { replace: true }) }
  const carregarGeral = useCallback(() => api.get('/api/tarefas/projetos').then(setGeral).catch((e) => setErro(e.message)), [])
  useEffect(() => { carregarGeral(); api.get('/api/tarefas/pessoas').then((r) => setPessoas(r.pessoas)).catch(() => {}) }, [carregarGeral])
  useEffect(() => { if (geral && pid == null) { const p = geral.projetos.find((x) => !x.arquivado); set({ projeto: p ? p.id : 'minhas' }) } }, [geral]) // eslint-disable-line react-hooks/exhaustive-deps
  const carregar = useCallback(() => { if (typeof pid === 'number') return api.get(`/api/tarefas/projetos/${pid}`).then((r) => { setDados(r); setErro(null) }).catch((e) => setErro(e.message)) }, [pid])
  useEffect(() => { setDados(null); carregar() }, [carregar])
  const recarregar = () => { carregar(); carregarGeral(); setVersao((v) => v + 1) }
  const pode = geral?.pode_editar
  const mudar = async (t, campos) => {
    setDados((d) => d && ({ ...d, tarefas: d.tarefas.map((x) => (x.id === t.id ? { ...x, ...campos } : x)) }))
    try { await api.put(`/api/tarefas/${t.id}`, campos); recarregar() } catch (e) { toast(e.message, 'erro'); carregar() }
  }
  const mover = async (t, secao_id, ordem) => {
    setDados((d) => d && ({ ...d, tarefas: d.tarefas.map((x) => (x.id === t.id ? { ...x, secao_id, ordem } : x)).sort((a, b) => a.ordem - b.ordem) }))
    try { await api.put('/api/tarefas-ordem', { itens: [{ id: t.id, secao_id, ordem }] }) } catch (e) { toast(e.message, 'erro'); carregar() }
  }
  const criar = async (campos) => { try { await api.post('/api/tarefas', { projeto_id: pid, ...campos }); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const secaoAcao = async (fn) => { try { setDados(await fn()) } catch (e) { toast(e.message, 'erro') } }
  const sincronizar = async () => {
    setSinc(true)
    try { const r = await api.post(`/api/tarefas/projetos/${pid}/github/sincronizar`); setDados(r); toast(`GitHub: ${r.vieram} vieram, ${r.atualizadas} atualizadas, ${r.enviadas} enviadas.`) } catch (e) { toast(e.message, 'erro') } finally { setSinc(false) }
  }
  const tarefas = useMemo(() => (dados?.tarefas || []).filter((t) => {
    if (!filtro.concluidas && t.concluida) return false
    if (filtro.q && !`${t.titulo} ${t.descricao} ${(t.etiquetas || []).join(' ')}`.toLowerCase().includes(filtro.q.toLowerCase())) return false
    if (filtro.resp === 'eu' && t.responsavel_id !== sessao?.id) return false
    if (filtro.resp === 'ninguem' && t.responsavel_id) return false
    if (filtro.resp && !['eu', 'ninguem'].includes(filtro.resp) && t.responsavel_id !== filtro.resp) return false
    if (filtro.prio && t.prioridade !== filtro.prio) return false
    return true
  }), [dados, filtro, sessao])
  const projeto = dados?.projeto
  const ativos = (geral?.projetos || []).filter((p) => !p.arquivado), arquivados = (geral?.projetos || []).filter((p) => p.arquivado)
  if (erro && !geral) return <Aviso>{erro}</Aviso>
  return (
    <div className="w-full min-w-0">
      <Cabecalho titulo="Tarefas" descricao="Projetos, quadros e prazos da equipe, com subtarefas, comentários e ligação com o GitHub Projects." />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav className="min-w-0" aria-label="Projetos de tarefas">
          <button onClick={() => setMenuProj((m) => !m)} className="mb-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm lg:hidden">
            {pid === 'minhas' ? 'Minhas tarefas' : projeto?.nome || 'Projetos'}<ChevronDown className="h-4 w-4" />
          </button>
          <div className={`${menuProj ? 'block' : 'hidden'} space-y-0.5 lg:block`}>
            <button onClick={() => { set({ projeto: 'minhas', tarefa: null }); setMenuProj(false) }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${pid === 'minhas' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}><UserRound className="h-4 w-4" />Minhas tarefas</button>
            <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">Projetos</p>
            {!geral ? <Esqueleto className="h-24" /> : ativos.map((p) => (
              <button key={p.id} onClick={() => { set({ projeto: p.id, tarefa: null }); setMenuProj(false) }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${pid === p.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.cor }} /><span className="min-w-0 flex-1 truncate">{p.nome}</span>
                {p.atrasadas > 0 && <span className="rounded bg-red-500/10 px-1 text-[10px] font-medium text-red-600 dark:text-red-400 tabular" title="atrasadas">{p.atrasadas}</span>}
                {p.no_github && <Github className="h-3 w-3 shrink-0" />}
                <span className="text-[11px] tabular">{p.total - p.feitas}</span>
              </button>
            ))}
            {pode && <button onClick={() => setNovo(true)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"><Plus className="h-4 w-4" />Novo projeto</button>}
            {arquivados.length > 0 && <details className="pt-2"><summary className="cursor-pointer px-3 py-1 text-xs text-muted-foreground">Arquivados ({arquivados.length})</summary>
              {arquivados.map((p) => <button key={p.id} onClick={() => set({ projeto: p.id, tarefa: null })} className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted/60"><Archive className="h-3.5 w-3.5" />{p.nome}</button>)}</details>}
          </div>
        </nav>
        <div className="min-w-0">
          {pid === 'minhas' ? <Minhas abrir={(id, p) => set({ tarefa: id, projeto: p })} mudar={async (t, c) => { await api.put(`/api/tarefas/${t.id}`, c); recarregar() }} versao={versao} />
            : !geral ? <Esqueleto className="h-72" />
            : !ativos.length && !arquivados.length ? (
              <Vazio icone={Columns3} titulo="Nenhum projeto ainda" texto="Crie um projeto para organizar as tarefas da equipe em lista, quadro, calendário e cronograma." acao={pode && <Botao icone={Plus} onClick={() => setNovo(true)}>Criar o primeiro projeto</Botao>} />
            ) : !dados ? (erro ? <Aviso>{erro}</Aviso> : <Esqueleto className="h-72" />) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded" style={{ background: projeto.cor }} />
                  <TituloEditavel valor={projeto.nome} pode={pode} className="text-lg font-semibold" aoSalvar={(nome) => secaoAcao(() => api.put(`/api/tarefas/projetos/${pid}`, { ...projeto, nome, descricao: projeto.descricao || '' }).then((r) => { carregarGeral(); return r }))} />
                  {projeto.github && <a href={projeto.github.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"><Github className="h-3 w-3" />{projeto.github.titulo}</a>}
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    {projeto.github && geral.github.conectado && <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={sinc} onClick={sincronizar} disabled={!pode}>Sincronizar</Botao>}
                    <Botao tamanho="sm" variante="secundario" icone={Github} onClick={() => setGh(true)}>GitHub</Botao>
                    {geral.gestor && <MenuProjeto projeto={projeto} aoArquivar={() => secaoAcao(() => api.put(`/api/tarefas/projetos/${pid}`, { ...projeto, descricao: projeto.descricao || '', arquivado: !projeto.arquivado }).then((r) => { carregarGeral(); return r }))}
                      aoApagar={async () => { await api.del(`/api/tarefas/projetos/${pid}`); set({ projeto: null }); setDados(null); carregarGeral() }} />}
                  </div>
                </div>
                <div className="mb-3 space-y-2">
                  <div className="flex gap-1 overflow-x-auto border-b border-border">{VISOES.map(([k, r, I]) => (
                    <button key={k} onClick={() => { set({ visao: k }); try { localStorage.setItem('clima-tarefas-visao', k) } catch { /* sem armazenamento */ } }} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${visao === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{r}</button>))}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative"><Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input type="search" autoComplete="off" className="campo h-8 w-44 pl-7 text-sm" placeholder="Procurar" value={filtro.q} onChange={(e) => setFiltro({ ...filtro, q: e.target.value })} aria-label="Procurar tarefas" /></label>
                    <select className="campo h-8 w-auto text-sm" value={filtro.resp} onChange={(e) => setFiltro({ ...filtro, resp: e.target.value })} aria-label="Filtrar por responsável"><option value="">Todos</option><option value="eu">Comigo</option><option value="ninguem">Sem responsável</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                    <select className="campo h-8 w-auto text-sm" value={filtro.prio} onChange={(e) => setFiltro({ ...filtro, prio: e.target.value })} aria-label="Filtrar por prioridade"><option value="">Qualquer prioridade</option>{Object.entries(PRIO).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={filtro.concluidas} onChange={(e) => setFiltro({ ...filtro, concluidas: e.target.checked })} className="accent-[hsl(var(--primary))]" />Concluídas</label>
                    {(filtro.q || filtro.resp || filtro.prio) && <button onClick={() => setFiltro({ q: '', resp: '', prio: '', concluidas: filtro.concluidas })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Filter className="h-3 w-3" />Limpar</button>}
                  </div>
                </div>
                {projeto.descricao && <p className="mb-3 text-sm text-muted-foreground">{projeto.descricao}</p>}
                {visao === 'lista' && <Lista secoes={dados.secoes} tarefas={tarefas} pessoas={pessoas} abrir={(id) => set({ tarefa: id })} mudar={mudar} criar={criar} mover={mover} pode={pode}
                  renomearSecao={(sid, nome) => secaoAcao(() => api.put(`/api/tarefas/secoes/${sid}`, { nome }))} apagarSecao={(s) => secaoAcao(() => api.del(`/api/tarefas/secoes/${s.id}`))}
                  novaSecao={(nome) => secaoAcao(() => api.post(`/api/tarefas/projetos/${pid}/secoes`, { nome }))} />}
                {visao === 'quadro' && <Quadro secoes={dados.secoes} tarefas={tarefas} pessoas={pessoas} abrir={(id) => set({ tarefa: id })} mudar={mudar} criar={criar} mover={mover} pode={pode}
                  novaSecao={(nome) => secaoAcao(() => api.post(`/api/tarefas/projetos/${pid}/secoes`, { nome }))} />}
                {visao === 'calendario' && <Calendario tarefas={tarefas} abrir={(id) => set({ tarefa: id })} mudar={mudar} pode={pode} />}
                {visao === 'cronograma' && <Cronograma tarefas={tarefas} secoes={dados.secoes} pessoas={pessoas} abrir={(id) => set({ tarefa: id })} />}
                {visao === 'painel' && <Painel tarefas={dados.tarefas} secoes={dados.secoes} pessoas={pessoas} />}
              </>
            )}
        </div>
      </div>
      <AnimatePresence>
        {aberta && <Detalhe key={aberta} id={aberta} pessoas={pessoas} secoes={dados?.secoes || []} pode={pode} aoFechar={() => set({ tarefa: null })} aoMudou={recarregar} abrir={(id) => set({ tarefa: id })} />}
      </AnimatePresence>
      <NovoProjeto aberto={novo} aoFechar={() => setNovo(false)} aoCriar={async (f) => { try { const r = await api.post('/api/tarefas/projetos', f); setNovo(false); await carregarGeral(); set({ projeto: r.projeto.id, tarefa: null }) } catch (e) { toast(e.message, 'erro') } }} />
      {geral && <GithubProjeto aberto={gh} aoFechar={() => setGh(false)} projeto={projeto} info={geral.github} gestor={geral.gestor} dono={geral.dono} aoMudou={() => { carregarGeral(); carregar() }} />}
    </div>
  )
}

function MenuProjeto({ projeto, aoArquivar, aoApagar }) {
  const [aberto, setAberto] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const ref = useRef(null)
  useEffect(() => { if (!aberto) return undefined; const f = (e) => !ref.current?.contains(e.target) && setAberto(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [aberto])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto(!aberto)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Mais opções do projeto"><MoreHorizontal className="h-4 w-4" /></button>
      {aberto && (
        <div className="absolute right-0 top-9 z-30 w-48 rounded-lg border border-border bg-card p-1 shadow-lg"> {/* marca: menu flutua */}
          <button onClick={() => { setAberto(false); aoArquivar() }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm hover:bg-muted"><Archive className="h-4 w-4" />{projeto.arquivado ? 'Desarquivar' : 'Arquivar'}</button>
          <button onClick={() => { setAberto(false); setConfirmar(true) }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-red-600 hover:bg-muted"><Trash2 className="h-4 w-4" />Apagar projeto</button>
        </div>
      )}
      <Modal aberto={confirmar} titulo={`Apagar ${projeto.nome}?`} onFechar={() => setConfirmar(false)}>
        <p className="text-sm text-muted-foreground">Todas as tarefas, subtarefas e comentários deste projeto somem. O que estiver no GitHub Projects continua lá. Para só esconder, use Arquivar.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Botao><Botao variante="perigo" onClick={() => { setConfirmar(false); aoApagar() }}>Apagar</Botao></div>
      </Modal>
    </div>
  )
}

