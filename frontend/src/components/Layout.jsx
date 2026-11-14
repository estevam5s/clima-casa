import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AirVent, BarChart3, Bell, CalendarClock, Check, ChevronsUpDown, Database, FolderKanban, Gauge,
  Download, LogOut, Menu, MessageSquareQuote, Mic, Pin, PinOff, Plug, Radio, Search, Settings, Sparkles, Workflow, X,
} from 'lucide-react'
import { api, haQuanto } from '../api'
import { supabase } from '../supabase'
import { useProjeto } from '../contexto'
import { atualizarAba } from '../favicon'

export const GRUPOS = [
  { titulo: 'Visão geral', itens: [
    { para: '/', rotulo: 'Painel', icone: Gauge, fim: true },
    { para: '/projetos', rotulo: 'Projetos', icone: FolderKanban },
    { para: '/relatorios', rotulo: 'Relatórios', icone: BarChart3 },
  ] },
  { titulo: 'Controle', itens: [
    { para: '/aparelhos', rotulo: 'Aparelhos', icone: AirVent },
    { para: '/cenas', rotulo: 'Cenas', icone: Sparkles },
    { para: '/automacoes', rotulo: 'Automações', icone: Workflow },
    { para: '/agendamentos', rotulo: 'Agenda', icone: CalendarClock },
    { para: '/transmissores', rotulo: 'Transmissores IR', icone: Radio },
  ] },
  { titulo: 'Integrações', itens: [
    { para: '/integracoes', rotulo: 'Alexa e Google', icone: Plug },
    { para: '/comandos-alexa', rotulo: 'Comandos de voz', icone: MessageSquareQuote },
    { para: '/alexa', rotulo: 'Skill própria', icone: Mic },
    { para: '/supabase', rotulo: 'Supabase', icone: Database },
  ] },
  { titulo: 'Sistema', itens: [
    { para: '/atividade', rotulo: 'Atividade', icone: Activity },
    { para: '/configuracoes', rotulo: 'Configurações', icone: Settings },
    { para: '/apps', rotulo: 'Baixar apps', icone: Download },
  ] },
]
const TODAS = GRUPOS.flatMap((g) => g.itens)
const FECHADA = 64
const ABERTA = 264
const MOLA = { type: 'spring', stiffness: 380, damping: 34 }

function Marca({ aberta }) {
  return (
    <Link to="/" className="flex h-9 items-center gap-2.5 px-1.5">
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
        <path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <motion.span animate={{ opacity: aberta ? 1 : 0, x: aberta ? 0 : -6 }} transition={{ duration: 0.15 }}
        className="whitespace-pre text-[15px] font-semibold tracking-tight">Clima Escritório</motion.span>
    </Link>
  )
}

function SeletorProjeto({ aberta }) {
  const { projetos, projeto, setAtual } = useProjeto()
  const [menu, setMenu] = useState(false)
  useEffect(() => { if (!aberta) setMenu(false) }, [aberta])
  const cor = projeto?.cor || 'hsl(var(--muted-foreground))'
  return (
    <div className="relative">
      <button onClick={() => setMenu(!menu)} aria-label="Trocar projeto"
        className="flex h-11 w-full items-center gap-2.5 rounded-lg border border-border bg-card px-[7px] text-left hover:bg-muted">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white" style={{ background: cor }}>
          {(projeto?.nome || 'Todos').slice(0, 2).toUpperCase()}
        </span>
        <motion.span animate={{ opacity: aberta ? 1 : 0 }} className="min-w-0 flex-1 whitespace-pre">
          <span className="block truncate text-[13px] font-medium leading-tight">{projeto?.nome || 'Todos os projetos'}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{projetos.length} projeto{projetos.length === 1 ? '' : 's'}</span>
        </motion.span>
        {aberta && <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {menu && aberta && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute left-0 right-0 top-12 z-50 rounded-lg border border-border bg-card p-1 shadow-lg">
            {[{ id: 'todos', nome: 'Todos os projetos', cor: 'hsl(var(--muted-foreground))' }, ...projetos].map((p) => (
              <button key={p.id} onClick={() => { setAtual(p.id); setMenu(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.cor }} />
                <span className="flex-1 truncate">{p.nome}</span>
                {String(projeto?.id || 'todos') === String(p.id) && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
            <Link to="/projetos" onClick={() => setMenu(false)} className="mt-1 block border-t border-border px-2 pb-1 pt-2 text-xs text-muted-foreground hover:text-foreground">
              Gerenciar projetos
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ItemNav({ item, aberta, onClick }) {
  const I = item.icone
  return (
    <NavLink to={item.para} end={item.fim} onClick={onClick} title={aberta ? undefined : item.rotulo}
      className={({ isActive }) => `group/link relative flex h-9 items-center gap-3 rounded-lg px-[11px] text-[13px] font-medium transition-colors ${
        isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'}`}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="nav-ativo" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />}
          <I className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
          <motion.span animate={{ opacity: aberta ? 1 : 0, display: aberta ? 'inline-block' : 'none' }} transition={{ duration: 0.12 }}
            className="whitespace-pre transition-transform duration-150 group-hover/link:translate-x-0.5">{item.rotulo}</motion.span>
        </>
      )}
    </NavLink>
  )
}

function ConteudoSidebar({ aberta, aoNavegar, fixada, alternarFixar }) {
  const { sessao } = useProjeto()
  const navegar = useNavigate()
  const sair = async () => { await (await supabase()).auth.signOut().catch(() => {}); navegar('/login') }
  const email = sessao?.email || ''
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden px-3 py-4">
      <div className="flex items-center justify-between">
        <Marca aberta={aberta} />
        {aberta && alternarFixar && (
          <button onClick={alternarFixar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={fixada ? 'Recolher automaticamente' : 'Manter aberta'} aria-label={fixada ? 'Desafixar sidebar' : 'Fixar sidebar'}>
            {fixada ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </button>
        )}
      </div>
      <SeletorProjeto aberta={aberta} />
      <nav className="-mx-1 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-1">
        {GRUPOS.map((g) => (
          <div key={g.titulo}>
            {aberta
              ? <p className="mb-1 whitespace-pre px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g.titulo}</p>
              : <div className="mx-2.5 mb-2 mt-1 border-t border-border" />}
            <div className="space-y-0.5">{g.itens.map((i) => <ItemNav key={i.para} item={i} aberta={aberta} onClick={aoNavegar} />)}</div>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2.5 border-t border-border pt-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">{email.slice(0, 2) || 'AD'}</span>
        <motion.div animate={{ opacity: aberta ? 1 : 0 }} className="min-w-0 flex-1 whitespace-pre">
          <p className="truncate text-[13px] font-medium">Administrador</p>
          <p className="truncate text-[11px] text-muted-foreground">{email}</p>
        </motion.div>
        {aberta && <button onClick={sair} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sair"><LogOut className="h-4 w-4" /></button>}
      </div>
    </div>
  )
}

function Paleta({ aberta, fechar }) {
  const [q, setQ] = useState('')
  const [aparelhos, setAparelhos] = useState([])
  const [sel, setSel] = useState(0)
  const navegar = useNavigate()
  const ref = useRef(null)
  useEffect(() => {
    if (!aberta) return
    setQ(''); setSel(0)
    api.get('/api/aparelhos').then(setAparelhos).catch(() => {})
    setTimeout(() => ref.current?.focus(), 10)
  }, [aberta])
  const itens = useMemo(() => {
    const t = q.toLowerCase()
    return [
      ...TODAS.map((i) => ({ rotulo: i.rotulo, tipo: 'Página', para: i.para, icone: i.icone })),
      ...aparelhos.map((a) => ({ rotulo: a.nome, tipo: a.projeto_nome || 'Aparelho', para: `/aparelhos/${a.id}`, icone: AirVent })),
    ].filter((i) => i.rotulo.toLowerCase().includes(t)).slice(0, 9)
  }, [q, aparelhos])
  const ir = (i) => { navegar(i.para); fechar() }
  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={fechar}>
          <motion.div initial={{ scale: 0.97, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.14 }}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl" /* marca: paleta flutua */ onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} placeholder="Buscar páginas e aparelhos…"
                className="h-12 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 placeholder:text-muted-foreground" aria-label="Buscar" /* marca: o foco aparece na borda da paleta */
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, itens.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                  if (e.key === 'Enter' && itens[sel]) ir(itens[sel])
                  if (e.key === 'Escape') fechar()
                }} />
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">ESC</kbd>
            </div>
            <ul className="max-h-80 overflow-y-auto p-1.5">
              {itens.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nada encontrado.</li>}
              {itens.map((i, n) => (
                <li key={i.para}>
                  <button onMouseEnter={() => setSel(n)} onClick={() => ir(i)}
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm ${n === sel ? 'bg-muted' : ''}`}>
                    <i.icone className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{i.rotulo}</span>
                    <span className="text-xs text-muted-foreground">{i.tipo}</span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const COR_GRAVIDADE = { alta: 'bg-red-500', media: 'bg-amber-500', baixa: 'bg-muted-foreground/50' }

function Notificacoes() {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState({ total: 0, itens: [] })
  const navegar = useNavigate()
  const local = useLocation()
  const ref = useRef(null)
  const carregar = useCallback(() => api.get('/api/notificacoes').then((d) => { setDados(d); atualizarAba(d.total) }).catch(() => {}), [])
  useEffect(() => { carregar(); const t = setInterval(carregar, 30000); return () => clearInterval(t) }, [carregar])
  useEffect(() => { carregar() }, [local.pathname, carregar]) // atualiza ao trocar de tela
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const total = dados.total
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto(!aberto)} className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Notificações (${total})`}>
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {total > 0 && (
            <motion.span key={total} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-background tabular">
              {total > 99 ? '99+' : total}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl"> {/* marca: menu flutua */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Notificações</p>
              <span className="text-xs text-muted-foreground">{total ? `${total} pedindo atenção` : 'tudo em ordem'}</span>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-1.5">
              {total === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma pendência. Transmissores, agente e Alexa funcionando.</p>}
              {dados.itens.map((n) => (
                <div key={n.id} className="group flex gap-3 rounded-lg px-3 py-2.5 hover:bg-muted">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_GRAVIDADE[n.gravidade]}`} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => { setAberto(false); navegar(n.link) }}>
                    <p className="text-sm leading-snug">{n.titulo}</p>
                    {n.detalhe && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.detalhe}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">{haQuanto(n.quando)}</p>
                  </button>
                  {n.alerta_id && (
                    <button className="self-start text-xs text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                      onClick={async () => { await api.post(`/api/alertas/${n.alerta_id}/resolver`); carregar() }}>Resolver</button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function useDesktop() {
  const [d, setD] = useState(() => window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const m = window.matchMedia('(min-width: 768px)')
    const f = () => setD(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return d
}

export default function Layout() {
  const [fixada, setFixada] = useState(() => { try { return localStorage.getItem('clima-sidebar') === 'fixa' } catch { return false } })
  const [hover, setHover] = useState(false)
  const [movel, setMovel] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const desktop = useDesktop()
  const local = useLocation()
  const aberta = fixada || hover
  const atual = TODAS.find((i) => (i.fim ? local.pathname === i.para : local.pathname.startsWith(i.para))) || TODAS[0]

  useEffect(() => setMovel(false), [local.pathname])
  useEffect(() => {
    const atalho = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta((p) => !p) } }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])
  const alternarFixar = () => setFixada((f) => {
    try { localStorage.setItem('clima-sidebar', f ? 'auto' : 'fixa') } catch { /* sem storage */ }
    return !f
  })

  return (
    <div className="min-h-screen">
      {/* Desktop: fica recolhida (só ícones) e abre ao passar o mouse; o alfinete deixa fixa */}
      <motion.aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-sidebar md:block"
        initial={false}
        animate={{ width: aberta ? ABERTA : FECHADA }}
        transition={MOLA}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      >
        <ConteudoSidebar aberta={aberta} fixada={fixada} alternarFixar={alternarFixar} />
      </motion.aside>

      {/* Celular: gaveta lateral */}
      <AnimatePresence>
        {movel && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMovel(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-sidebar md:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
              <button onClick={() => setMovel(false)} className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted-foreground" aria-label="Fechar menu"><X className="h-5 w-5" /></button>
              <ConteudoSidebar aberta aoNavegar={() => setMovel(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <motion.div className="min-w-0" initial={false} animate={{ paddingLeft: desktop ? (aberta ? ABERTA : FECHADA) : 0 }} transition={MOLA}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMovel(true)} className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
          <p className="truncate text-[15px] font-semibold">{atual.rotulo}</p>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPaleta(true)} className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted sm:flex">
              <Search className="h-4 w-4" /> <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
            </button>
            <button onClick={() => setPaleta(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted sm:hidden" aria-label="Buscar"><Search className="h-[18px] w-[18px]" /></button>
            <Link to="/apps" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:flex" title="Baixar os apps">
              <Download className="h-4 w-4" /> Apps
            </Link>
            <Notificacoes />
          </div>
        </header>
        <main className="w-full px-4 pb-16 pt-6 sm:px-6 lg:px-8 2xl:px-10">
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Outlet />
          </motion.div>
        </main>
      </motion.div>
      <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
    </div>
  )
}
