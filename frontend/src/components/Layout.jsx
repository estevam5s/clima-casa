import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AirVent, BarChart3, CalendarClock, Check, ChevronsUpDown, Database, FolderKanban, Gauge,
  Download, Laptop, LogOut, Moon, Sun, Menu, MessageSquareQuote, Mic, Pin, PinOff, Plug, Radio, Search, Settings, ShieldCheck, Sparkles, Workflow, X, Globe, Inbox, Map as MapIcon, LifeBuoy,
} from 'lucide-react'
import { api } from '../api'
import { supabase } from '../supabase'
import { useProjeto } from '../contexto'
import Notificacoes, { useCentral } from './Notificacoes'
import { siteComSessao } from '../site'
import { Avatar } from './config/Perfil'
import { useTema } from '../tema'
import { useMarca, bannerNoAr, logoDaMarca } from '../marca'

export const GRUPOS = [
  { titulo: 'Visão geral', itens: [
    { para: '/', rotulo: 'Painel', icone: Gauge, fim: true },
    { para: '/projetos', rotulo: 'Projetos', icone: FolderKanban },
    { para: '/mapa', rotulo: 'Mapa do escritório', icone: MapIcon },
    { para: '/relatorios', rotulo: 'Relatórios', icone: BarChart3, perm: 'relatorios.ver' },
  ] },
  { titulo: 'Controle', itens: [
    { para: '/aparelhos', rotulo: 'Aparelhos', icone: AirVent },
    { para: '/cenas', rotulo: 'Cenas', icone: Sparkles },
    { para: '/automacoes', rotulo: 'Automações', icone: Workflow },
    { para: '/agendamentos', rotulo: 'Agenda', icone: CalendarClock },
    { para: '/transmissores', rotulo: 'Transmissores IR', icone: Radio },
  ] },
  { titulo: 'Integrações', itens: [
    { para: '/integracoes', rotulo: 'Alexa e Google', icone: Plug, perm: 'integracoes.gerenciar' },
    { para: '/comandos-alexa', rotulo: 'Comandos de voz', icone: MessageSquareQuote },
    { para: '/alexa', rotulo: 'Skill própria', icone: Mic, perm: 'integracoes.gerenciar' },
    { para: '/supabase', rotulo: 'Supabase', icone: Database, perm: 'configuracoes.gerenciar' },
  ] },
  { titulo: 'Sistema', itens: [
    { para: '/atividade', rotulo: 'Atividade', icone: Activity, perm: 'atividade.ver' },
    { para: '/seguranca', rotulo: 'Segurança', icone: ShieldCheck, perm: 'seguranca.gerenciar' },
    { para: '/mensagens', rotulo: 'Mensagens do site', icone: Inbox, contador: 'mensagens_nao_lidas', perm: 'mensagens.ver' },
    { para: '/configuracoes', rotulo: 'Configurações', icone: Settings },
    { para: '/apps', rotulo: 'Baixar apps', icone: Download },
  ] },
]
const TODAS = GRUPOS.flatMap((g) => g.itens)
const FECHADA = 64
const ABERTA = 264
const MOLA = { type: 'spring', stiffness: 380, damping: 34 }

function Marca({ aberta }) {
  const { marca } = useMarca()
  return (
    <Link to="/" className="flex h-9 min-w-0 items-center gap-2.5 px-1.5">
      {logoDaMarca(marca, document.documentElement.classList.contains('dark')) ? <img src={logoDaMarca(marca, document.documentElement.classList.contains('dark'))} alt="" className="h-7 w-7 shrink-0 rounded-lg object-contain" /> : (
        <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
          <path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      )}
      <motion.span animate={{ opacity: aberta ? 1 : 0, x: aberta ? 0 : -6 }} transition={{ duration: 0.15 }}
        className="truncate whitespace-pre text-[15px] font-semibold tracking-tight">{marca.nome}</motion.span>
    </Link>
  )
}

// Menu com os rótulos e itens ocultos do white label
function useGrupos() {
  const { marca } = useMarca()
  const { sessao } = useProjeto()
  const pode = (perm) => !perm || !sessao || sessao.permissoes?.includes(perm)
  return GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => !marca.menu_ocultos.includes(i.para) && pode(i.perm)).map((i) => ({ ...i, rotulo: marca.menu_rotulos[i.para] || i.rotulo })) }))
    .filter((g) => g.itens.length)
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

function ItemNav({ item, aberta, onClick, contadores }) {
  const I = item.icone
  const n = item.contador ? contadores?.[item.contador] || 0 : 0
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
          {n > 0 && (aberta
            ? <span className="ml-auto rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground tabular">{n > 99 ? '99+' : n}</span>
            : <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />)}
        </>
      )}
    </NavLink>
  )
}

function usePerfil() {
  const [perfil, setPerfil] = useState(null)
  useEffect(() => {
    const carregar = () => api.get('/api/perfil').then(setPerfil).catch(() => {})
    carregar()
    window.addEventListener('clima:perfil', carregar)
    return () => window.removeEventListener('clima:perfil', carregar)
  }, [])
  return perfil
}

function ConteudoSidebar({ aberta, aoNavegar, fixada, alternarFixar, contadores }) {
  const perfil = usePerfil()
  const { sessao } = useProjeto()
  const navegar = useNavigate()
  const sair = async () => { await (await supabase()).auth.signOut().catch(() => {}); navegar('/login') }
  const email = sessao?.email || ''
  const grupos = useGrupos()
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
      <nav className="sem-barra -mx-1 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-1 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-16px),transparent)] py-1">
        {grupos.map((g) => (
          <div key={g.titulo}>
            {aberta
              ? <p className="mb-1 whitespace-pre px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{g.titulo}</p>
              : <div className="mx-2.5 mb-2 mt-1 border-t border-border" />}
            <div className="space-y-0.5">{g.itens.map((i) => <ItemNav key={i.para} item={i} aberta={aberta} onClick={aoNavegar} contadores={contadores} />)}</div>
          </div>
        ))}
      </nav>
      <a href={siteComSessao(true)} className="mb-2 flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" title="Voltar ao site">
        <Globe className="h-[18px] w-[18px] shrink-0" />
        <motion.span animate={{ opacity: aberta ? 1 : 0 }} className="whitespace-pre">Voltar ao site</motion.span>
      </a>
      <div className="flex items-center gap-2.5 border-t border-border pt-3">
        <Link to="/configuracoes?aba=perfil" onClick={aoNavegar} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-90" title="Editar perfil">
          <Avatar perfil={perfil} email={email} />
          <motion.div animate={{ opacity: aberta ? 1 : 0 }} className="min-w-0 flex-1 whitespace-pre">
            <p className="truncate text-[13px] font-medium">{perfil?.nome || 'Administrador'}</p>
            <p className="truncate text-[11px] text-muted-foreground">{perfil?.cargo || email}</p>
          </motion.div>
        </Link>
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


// Barra de status no lugar do título repetido: lugar atual, agente, ares ligados, transmissores e relógio.
function BarraStatus({ status }) {
  const { projeto } = useProjeto()
  const [agora, setAgora] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15000); return () => clearInterval(t) }, [])
  const s = status || {}
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
      <span className="hidden truncate font-medium text-foreground sm:inline">{projeto ? projeto.nome : 'Todos os projetos'}</span>
      {status && (
        <>
          <span className="hidden text-border sm:inline">/</span>
          <Link to="/configuracoes?aba=sistema" className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted" title="Agente do Mac">
            <span className="relative flex h-2 w-2">
              {s.agente_online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />} {/* marca: pulso indica que o agente está vivo */}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${s.agente_online ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </span>
            {s.agente_online ? 'Agente online' : 'Agente offline'}
          </Link>
          <Link to="/aparelhos" className="hidden items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted md:flex" title="Ares ligados agora">
            <AirVent className="h-3.5 w-3.5" /><span className="tabular">{s.ligados}/{s.aparelhos}</span> ligados
          </Link>
          <Link to="/transmissores" className="hidden items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted lg:flex" title="Transmissores respondendo">
            <Radio className="h-3.5 w-3.5" /><span className="tabular">{s.hubs_online}/{s.hubs}</span> transmissores
          </Link>
        </>
      )}
      <span className="hidden whitespace-nowrap tabular xl:inline">· {agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '')}, {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  )
}

function BotaoTema() {
  const { escolha, setEscolha } = useTema()
  const ordem = ['claro', 'escuro', 'sistema']
  const icone = { claro: Sun, escuro: Moon, sistema: Laptop }[escolha]
  const I = icone
  return (
    <button onClick={() => setEscolha(ordem[(ordem.indexOf(escolha) + 1) % 3])} title={`Tema: ${escolha} (clique para trocar)`}
      aria-label={`Tema ${escolha}. Trocar tema`} className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={escolha} initial={{ rotate: -90, scale: 0.6, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }} className="block"><I className="h-[18px] w-[18px]" /></motion.span>
      </AnimatePresence>
    </button>
  )
}

// Botão "Ajuda" do cabeçalho com os contatos de suporte definidos no white label
function Ajuda({ marca }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora); return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const zap = (marca.suporte_whatsapp || '').replace(/\D/g, '')
  const itens = [
    marca.suporte_email && [`mailto:${marca.suporte_email}`, 'E-mail', marca.suporte_email],
    marca.suporte_telefone && [`tel:${marca.suporte_telefone.replace(/[^\d+]/g, '')}`, 'Telefone', marca.suporte_telefone],
    zap && [`https://wa.me/${zap}`, 'WhatsApp', marca.suporte_whatsapp],
    marca.site && [marca.site, 'Site', marca.site.replace(/^https?:\/\//, '')],
  ].filter(Boolean)
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAberto((a) => !a)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ajuda" title="Ajuda"><LifeBuoy className="h-[18px] w-[18px]" /></button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-border bg-card p-2 shadow-xl"> {/* marca: menu flutua */}
            <p className="px-3 pb-1 pt-2 text-sm font-semibold">Precisa de ajuda?</p>
            <p className="px-3 pb-2 text-xs text-muted-foreground">Fale com o suporte de {marca.nome}.</p>
            {itens.map(([href, r, v]) => (
              <a key={r} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                <span className="text-muted-foreground">{r}</span><span className="truncate font-medium">{v}</span>
              </a>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Banner() {
  const { marca } = useMarca()
  const [fechado, setFechado] = useState(() => { try { return sessionStorage.getItem('clima-banner') === marca.banner_texto } catch { return false } })
  if (!bannerNoAr(marca) || fechado) return null
  const cores = { info: 'bg-sky-600', alerta: 'bg-amber-600', sucesso: 'bg-emerald-600', marca: 'bg-primary' }
  return (
    <div className={`flex items-center justify-center gap-3 px-4 py-2 text-center text-sm text-white ${cores[marca.banner_cor] || cores.info}`} role="status">
      <span>{marca.banner_texto}</span>
      <button onClick={() => { setFechado(true); try { sessionStorage.setItem('clima-banner', marca.banner_texto) } catch { /* */ } }} aria-label="Fechar aviso" className="rounded p-0.5 hover:bg-white/20"><X className="h-4 w-4" /></button>
    </div>
  )
}

function Rodape() {
  const { marca } = useMarca()
  const contatos = [marca.suporte_email && `Suporte: ${marca.suporte_email}`, marca.suporte_telefone, marca.suporte_whatsapp && `WhatsApp ${marca.suporte_whatsapp}`].filter(Boolean)
  if (!marca.rodape && !contatos.length && !marca.mostrar_creditos) return null
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
      <span>{marca.rodape || `© ${new Date().getFullYear()} ${marca.nome}`}</span>
      <span className="flex flex-wrap gap-3">{contatos.map((c) => <span key={c}>{c}</span>)}{marca.mostrar_creditos && <span>Infravermelho · Alexa · Supabase</span>}</span>
    </footer>
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
  const { marca } = useMarca()
  const [fixada, setFixada] = useState(() => { try { return localStorage.getItem('clima-sidebar') === 'fixa' } catch { return false } })
  const [hover, setHover] = useState(false)
  const [movel, setMovel] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const desktop = useDesktop()
  const local = useLocation()
  const aberta = fixada || hover
  const central = useCentral()

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
        <ConteudoSidebar aberta={aberta} fixada={fixada} alternarFixar={alternarFixar} contadores={central.dados?.status} />
      </motion.aside>

      {/* Celular: gaveta lateral */}
      <AnimatePresence>
        {movel && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMovel(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-sidebar md:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
              <button onClick={() => setMovel(false)} className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted-foreground" aria-label="Fechar menu"><X className="h-5 w-5" /></button>
              <ConteudoSidebar aberta aoNavegar={() => setMovel(false)} contadores={central.dados?.status} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <motion.div className="min-w-0" initial={false} animate={{ paddingLeft: desktop ? (aberta ? ABERTA : FECHADA) : 0 }} transition={MOLA}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMovel(true)} className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
          <BarraStatus status={central.dados?.status} />
          {marca.selo_ambiente && <span className="hidden shrink-0 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 sm:inline">{marca.selo_ambiente}</span>}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPaleta(true)} className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted sm:flex">
              <Search className="h-4 w-4" /> <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
            </button>
            <button onClick={() => setPaleta(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted sm:hidden" aria-label="Buscar"><Search className="h-[18px] w-[18px]" /></button>
            <a href={siteComSessao(true)} className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title="Voltar ao site">
              <Globe className="h-4 w-4" /> Site
            </a>
            <Link to="/apps" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground lg:flex" title="Baixar os apps">
              <Download className="h-4 w-4" /> Apps
            </Link>
            {marca.mostrar_ajuda && (marca.suporte_email || marca.suporte_telefone || marca.suporte_whatsapp || marca.site) && <Ajuda marca={marca} />}
            <BotaoTema />
            <Notificacoes central={central} />
          </div>
        </header>
        <Banner />
        <main className="w-full px-4 pb-16 pt-6 sm:px-6 lg:px-8 2xl:px-10">
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Outlet />
          </motion.div>
          <Rodape />
        </main>
      </motion.div>
      <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
    </div>
  )
}
