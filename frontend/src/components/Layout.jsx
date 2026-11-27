import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { limparCache } from '../cacheTela'
import IconeMarca from './IconeMarca'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 as Loader, Activity, ListTodo, Languages, LineChart, AirVent, BarChart3, Bell, Blinds, BookOpen, Bot, Bug, Check, ChevronDown, Coffee, DoorClosed, ChevronsUpDown, Database, Download, FolderKanban, Gauge, Globe, GraduationCap, Inbox, Laptop, LifeBuoy, Lightbulb, LogOut, Mail, Megaphone, Map as MapIcon, Send, Menu, MessageSquareQuote, Mic, Moon, Music2, PersonStanding, Pin, PinOff, Plug, Radio, Search, Server, Settings, ShieldCheck, Sun, Wifi, Workflow, Wrench, X, DatabaseBackup } from 'lucide-react'
import { api } from '../api'
import { supabase } from '../supabase'
import { useProjeto } from '../contexto'
import { Carregando, ConfirmacaoGlobal } from './ui'
import { trocarTela } from '../usoTelas'
import AcessoRapido from './AcessoRapido'
import Notificacoes, { useCentral } from './Notificacoes'
import Atalhos from './Atalhos'
import NovidadesModal from './Novidades'
import AvisoEntradas from './AvisoEntradas'
import TermoAceite from './TermoAceite'
import { siteComSessao } from '../site'
import { Avatar } from './config/Perfil'
import { useTema } from '../tema'
import { IDIOMAS_PAINEL, aoMudarIdioma, idiomaAtual, mudarIdioma } from '../i18nPainel'
import { useMarca, bannerNoAr, logoDaMarca } from '../marca'
import { definirPagina } from '../favicon'

export const GRUPOS = [
  { titulo: 'Visão geral', itens: [
    { para: '/', rotulo: 'Painel', icone: Gauge, fim: true },
    { para: '/projetos', rotulo: 'Projetos', icone: FolderKanban },
    { para: '/mapa', rotulo: 'Mapa do escritório', icone: MapIcon },
    { para: '/avatares', rotulo: 'Avatares 3D', icone: PersonStanding },
    { para: '/relatorios', rotulo: 'Relatórios', icone: BarChart3, perm: 'relatorios.ver' },
  ] },
  { titulo: 'Controle', itens: [
    { para: '/aparelhos', rotulo: 'Aparelhos', icone: AirVent },
    { para: '/rotinas', rotulo: 'Rotinas', icone: Workflow },
    { para: '/transmissores', rotulo: 'Transmissores IR', icone: Radio },
    { para: '/musica', rotulo: 'Música', icone: Music2 },
  ] },
  { titulo: 'Escritório', itens: [
    { para: '/tarefas', rotulo: 'Tarefas', icone: ListTodo },
    { para: '/cafeteira', rotulo: 'Cafeteira', icone: Coffee },
    { para: '/luzes', rotulo: 'Iluminação', icone: Lightbulb },
    { para: '/persianas', rotulo: 'Persianas', icone: Blinds },
    { para: '/fechadura', rotulo: 'Fechadura', icone: DoorClosed },
  ] },
  { titulo: 'Integrações', itens: [
    { para: '/integracoes', rotulo: 'Alexa e Google', icone: Plug, perm: 'integracoes.gerenciar' },
    { para: '/comandos-alexa', rotulo: 'Comandos de voz', icone: MessageSquareQuote },
    { para: '/ia', rotulo: 'Assistente de IA', icone: Bot },
    { para: '/telegram', rotulo: 'Telegram', icone: Send },
    { para: '/emails', rotulo: 'E-mails', icone: Mail, perm: 'configuracoes.gerenciar' },
    { para: '/alexa', rotulo: 'Skill própria', icone: Mic, perm: 'integracoes.gerenciar' },
    { para: '/supabase', rotulo: 'Supabase', icone: Database, perm: 'configuracoes.gerenciar' },
    { para: '/backup', rotulo: 'Backup e restauração', icone: DatabaseBackup, perm: 'configuracoes.gerenciar' },
    { para: '/infra', rotulo: 'Infra', icone: Server, perm: 'configuracoes.gerenciar' },
    { para: '/rede', rotulo: 'Rede e velocidade', icone: Wifi, perm: 'configuracoes.gerenciar' },
  ] },
  { titulo: 'Sistema', itens: [
    { para: '/notificacoes', rotulo: 'Notificações', icone: Bell, contador: 'notificacoes' },
    { para: '/bugs', rotulo: 'Bugs', icone: Bug, contador: 'bugs' },
    { para: '/atividade', rotulo: 'Atividade', icone: Activity, perm: 'atividade.ver' },
    { para: '/seguranca', rotulo: 'Segurança', icone: ShieldCheck },   // todos veem: sem seguranca.gerenciar, a tela mostra só o Treinamento
    { para: '/mensagens', rotulo: 'Mensagens do site', icone: Inbox, contador: 'mensagens_nao_lidas', perm: 'mensagens.ver' },
    { para: '/analise', rotulo: 'Acessos e SEO', icone: LineChart, perm: 'configuracoes.gerenciar' },
    { para: '/idiomas', rotulo: 'Idiomas do site', icone: Languages, perm: 'configuracoes.gerenciar' },
    { para: '/configuracoes', rotulo: 'Configurações', icone: Settings },
    { para: '/apps', rotulo: 'Baixar apps', icone: Download },
    { para: '/guia', rotulo: 'Passo a passo', icone: BookOpen },
    { para: '/novidades', rotulo: 'Novidades', icone: Megaphone },
  ] },
]
const TODAS = GRUPOS.flatMap((g) => g.itens)
// sinônimos para a busca do menu (o rótulo já conta)
const CHAVES = {
  '/': 'inicio dashboard resumo', '/tarefas': 'todo to-do tarefa projeto kanban quadro asana github projects prazo sprint', '/notificacoes': 'avisos alertas sino central historico', '/luzes': 'luz lampada iluminacao anoitecer interruptor', '/telegram': 'bot telegram celular mensagem', '/bugs': 'erro problema defeito falha corrigir ia prompt', '/backup': 'backup restaurar upload copia seguranca dados zip exportar importar', '/ia': 'ia inteligencia artificial nvidia chat conversar terminal clima-ia assistente', '/projetos': 'salas lugares', '/mapa': 'planta 3d predio escritorio ilha florianopolis elevador',
  '/relatorios': 'pdf exportar consumo gasto energia', '/aparelhos': 'ar condicionado ares split botoes gravar', '/rotinas': 'cenas atalhos automacoes regras gatilhos agenda agendamentos horario temporizador timer',
  '/transmissores': 'ir infravermelho smart ir tuya hub controle remoto',
  '/musica': 'spotify som', '/integracoes': 'alexa google sinric echo voz', '/comandos-alexa': 'frases voz alexa', 
  '/alexa': 'skill', '/supabase': 'banco dados tabelas sql backup', '/infra': 'vercel cloudflare dns agentes raspberry pi computador servidor',
  '/atividade': 'historico log eventos', '/seguranca': 'firewall conformidade iso 27001 ips ataques', '/mensagens': 'contato site', '/analise': 'seo visitantes analytics desempenho performance cliques rotas web vitals pagespeed', '/idiomas': 'traducao ingles espanhol frances russo coreano idioma lingua', '/emails': 'resend correio newsletter campanha inscritos',
  '/configuracoes': 'usuarios contas perfil marca senha 2fa', '/apps': 'android desktop windows mac download', '/guia': 'ajuda manual tutorial',
  '/novidades': 'versoes changelog atualizacoes', '/rede': 'speedtest velocidade internet wifi download upload ping latencia jitter', '/cafeteira': 'cafe capsula copa tomada dolce', '/persianas': 'cortina janela sol', '/fechadura': 'porta tranca chave entrada', '/avatares': 'personagem boneco glb modelo 3d animacao sims', 
}
const semAcento = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function lerFechados() { try { return JSON.parse(localStorage.getItem('clima-menu-fechados') || '[]') } catch { return [] } }
const FECHADA = 64
const MOLA = { type: 'spring', stiffness: 380, damping: 34 }

function Marca({ aberta }) {
  const { marca } = useMarca()
  return (
    <Link to="/" className="flex h-9 min-w-0 items-center gap-2.5 px-1.5">
      {marca.logo_menu && aberta ? <img src={marca.logo_menu} alt={marca.nome} className="h-8 min-w-0 max-w-full object-contain object-left" /> : logoDaMarca(marca, document.documentElement.classList.contains('dark')) ? <img src={logoDaMarca(marca, document.documentElement.classList.contains('dark'))} alt="" className="h-7 w-7 shrink-0 rounded-lg object-contain" /> : (
        <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="hsl(var(--primary))" />
          <path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      )}
      {!(marca.logo_menu && aberta) && <motion.span animate={{ opacity: aberta ? 1 : 0, x: aberta ? 0 : -6 }} transition={{ duration: 0.15 }}
        className="truncate whitespace-pre text-[15px] font-semibold tracking-tight">{marca.nome}</motion.span>}
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
      {/* recolhida (64 px, 40 de área útil): quadrado centralizado com folga igual em volta da sigla; aberta: largura toda */}
      <button onClick={() => setMenu(!menu)} aria-label="Trocar projeto" title={aberta ? undefined : projeto?.nome || 'Todos os projetos'}
        className={`flex items-center rounded-lg border border-border bg-card text-left transition-colors hover:bg-muted ${aberta ? 'h-11 w-full gap-2.5 px-2' : 'mx-auto h-10 w-10 justify-center p-0'}`}>
        <span className={`flex shrink-0 items-center justify-center rounded-md font-semibold text-white ${aberta ? 'h-7 w-7 text-[11px]' : 'h-6 w-6 text-[10px]'}`} style={{ background: cor }}>
          {(projeto?.nome || 'Todos').slice(0, 2).toUpperCase()}
        </span>
        {aberta && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-w-0 flex-1 whitespace-pre">
          <span className="block truncate text-[13px] font-medium leading-tight">{projeto?.nome || 'Todos os projetos'}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{projetos.length} projeto{projetos.length === 1 ? '' : 's'}</span>
        </motion.span>}
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

function ConteudoSidebar({ aberta, aoNavegar, fixada, alternarFixar, contadores, aoBuscar }) {
  const perfil = usePerfil()
  const { sessao } = useProjeto()
  const { marca } = useMarca()
  const navegar = useNavigate()
  const sair = async () => { limparCache(); await (await supabase()).auth.signOut().catch(() => {}); navegar('/login') }
  const email = sessao?.email || ''
  const gruposTodos = useGrupos()
  const [busca, setBusca] = useState('')
  const [fechados, setFechados] = useState(lerFechados)
  const buscaRef = useRef(null)
  const navRef = useRef(null)
  const { pathname } = useLocation()
  // Ao abrir (a gaveta do celular monta de novo a cada abertura) e ao trocar de tela, o menu rola até o item
  // da tela atual. Mexe só na rolagem do próprio menu, nunca na da página.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const t = requestAnimationFrame(() => {
      const el = nav.querySelector('[aria-current="page"]')
      if (!el) return
      const n = nav.getBoundingClientRect(), r = el.getBoundingClientRect()
      if (r.top < n.top + 24 || r.bottom > n.bottom - 24) nav.scrollTop += r.top - n.top - (n.height - r.height) / 2
    })
    return () => cancelAnimationFrame(t)
  }, [pathname, aberta])
  const q = semAcento(busca.trim())
  const grupos = q ? gruposTodos.map((g) => ({ ...g, itens: g.itens.filter((i) => semAcento(`${i.rotulo} ${CHAVES[i.para] || ''}`).includes(q)) })).filter((g) => g.itens.length) : gruposTodos
  const alternarGrupo = (t) => setFechados((f) => { const n = f.includes(t) ? f.filter((x) => x !== t) : [...f, t]; try { localStorage.setItem('clima-menu-fechados', JSON.stringify(n)) } catch { /* sem armazenamento */ } return n })
  useEffect(() => {   // "/" foca a busca do menu (fora de campos de texto)
    const tecla = (e) => { if (e.key === '/' && aberta && !/input|textarea|select/i.test(document.activeElement?.tagName || '') && !document.activeElement?.isContentEditable) { e.preventDefault(); buscaRef.current?.focus() } }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [aberta])
  const irPrimeiro = (e) => {
    if (e.key === 'Escape') { setBusca(''); e.currentTarget.blur() }
    if (e.key === 'Enter') { const i = grupos[0]?.itens[0]; if (i) { navegar(i.para); setBusca(''); aoNavegar?.() } }
  }
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
      {aberta ? (
        <label className="relative -mb-1 block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={irPrimeiro} placeholder="Buscar no menu" aria-label="Buscar no menu" type="search" name="busca-menu" autoComplete="off" autoCorrect="off" spellCheck={false} data-1p-ignore data-lpignore="true" data-form-type="other"
            className="campo-embutido h-9 w-full rounded-lg border border-border bg-background/60 pl-8 pr-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary/60" />
          {busca ? <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar busca"><X className="h-3.5 w-3.5" /></button>
            : <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border px-1 text-[10px] text-muted-foreground">/</kbd>}
        </label>
      ) : (
        <button onClick={aoBuscar} className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" title="Buscar (⌘K)" aria-label="Buscar"><Search className="h-[18px] w-[18px]" /></button>
      )}
      <nav ref={navRef} className="sem-barra -mx-1 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-1 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-16px),transparent)] py-1"> {/* marca: esmaecer a rolagem do menu */}
        {grupos.map((g) => {
          const recolhido = aberta && !q && fechados.includes(g.titulo)
          return (
            <div key={g.titulo}>
              {aberta
                ? <button onClick={() => alternarGrupo(g.titulo)} aria-expanded={!recolhido} className="group/g mb-1 flex w-full items-center gap-1 whitespace-pre rounded px-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 hover:text-foreground">
                    {g.titulo}<span className="ml-1 tabular normal-case tracking-normal opacity-0 group-hover/g:opacity-100">{recolhido ? g.itens.length : ''}</span>
                    <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${recolhido ? '-rotate-90' : ''}`} />
                  </button>
                : <div className="mx-2.5 mb-2 mt-1 border-t border-border" />}
              {!recolhido && <div className="space-y-0.5">{g.itens.map((i) => <ItemNav key={i.para} item={i} aberta={aberta} onClick={() => { setBusca(''); aoNavegar?.() }} contadores={contadores} />)}</div>}
            </div>
          )
        })}
        {q && !grupos.length && (
          <div className="px-2.5 py-2 text-[13px] text-muted-foreground">
            <p>Nada no menu com “{busca.trim()}”.</p>
            <button onClick={() => { aoBuscar?.(); setBusca('') }} className="mt-1 font-medium text-primary hover:underline">Buscar em tudo (⌘K)</button>
          </div>
        )}
      </nav>
      {marca.mostrar_link_site !== false && <a href={siteComSessao(true)} className="mb-2 flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" title="Voltar ao site">
        <Globe className="h-[18px] w-[18px] shrink-0" />
        <motion.span animate={{ opacity: aberta ? 1 : 0 }} className="whitespace-pre">Voltar ao site</motion.span>
      </a>}
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

// Busca do topo (⌘K): telas e ares na hora; no servidor, o sistema inteiro com o escopo da pessoa (GET /api/busca); e "Perguntar
// à IA" (POST /api/busca/ia), que conhece todas as telas e consulta os dados, só lendo. Pergunta ("como…", "onde…", "?") chama a IA sozinha.
const PERGUNTA = /\?\s*$|^(como|onde|qual|quais|quanto|quantos|quando|por que|porque|o que|quem|posso|tem como|preciso)\b/i
function Paleta({ aberta, fechar }) {
  const [q, setQ] = useState('')
  const [remotos, setRemotos] = useState([])
  const [buscando, setBuscando] = useState(false)
  const [ia, setIa] = useState(null)        // { carregando } | { texto, links } | { erro }
  const [sel, setSel] = useState(0)
  const navegar = useNavigate()
  const ref = useRef(null)
  const pedidoIa = useRef(0)
  useEffect(() => {
    if (!aberta) return
    setQ(''); setSel(0); setRemotos([]); setIa(null)
    setTimeout(() => ref.current?.focus(), 10)
  }, [aberta])
  const perguntarIa = async (texto = q) => {
    const t = texto.trim()
    if (t.length < 3) return
    const meu = ++pedidoIa.current
    setIa({ carregando: true, q: t })
    try { const r = await api.post('/api/busca/ia', { q: t }); if (meu === pedidoIa.current) setIa({ ...r, q: t }) } catch (e) { if (meu === pedidoIa.current) setIa({ erro: e.message, q: t }) }
  }
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setRemotos([]); return undefined }
    setBuscando(true)
    const h = setTimeout(() => api.get(`/api/busca?q=${encodeURIComponent(t)}`).then((r) => setRemotos(r.resultados || [])).catch(() => setRemotos([])).finally(() => setBuscando(false)), 220)
    const hIa = PERGUNTA.test(t) && t.length > 8 ? setTimeout(() => perguntarIa(t), 900) : null
    return () => { clearTimeout(h); if (hIa) clearTimeout(hIa) }
  }, [q])   // eslint-disable-line react-hooks/exhaustive-deps
  const itens = useMemo(() => {
    const t = q.toLowerCase().trim()
    const telas = TODAS.filter((i) => !t || i.rotulo.toLowerCase().includes(t)).map((i) => ({ titulo: i.rotulo, tipo: 'Tela', link: i.para, icone: i.icone }))
    const vistos = new Set(telas.map((x) => x.link))
    const rem = remotos.filter((r) => !(r.tipo === 'Tela' && vistos.has(r.link))).map((r) => ({ ...r, icone: ICONE_TIPO[r.tipo] || Search }))
    const lista = [...(t.length >= 3 ? [{ ia: true, titulo: `Perguntar à IA: “${q.trim()}”`, tipo: 'IA', icone: Bot }] : []), ...telas.slice(0, t ? 6 : 8), ...rem]
    return lista.slice(0, 40)
  }, [q, remotos])
  const ir = (i) => { if (i.ia) return perguntarIa(); navegar(i.link); fechar() }
  const grupos = []
  itens.forEach((i, n) => { const g = i.ia ? 'Inteligência artificial' : i.tipo === 'Tela' ? 'Telas' : i.tipo; const x = grupos.find((y) => y[0] === g); if (x) x[1].push([i, n]); else grupos.push([g, [[i, n]]]) })
  return (
    <AnimatePresence>
      {aberta && (
        <motion.div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[10vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={fechar}>
          <motion.div initial={{ scale: 0.97, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, opacity: 0 }} transition={{ duration: 0.14 }}
            className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" /* marca: paleta flutua */ onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-border px-3">
              {buscando ? <Loader className="h-4 w-4 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 text-muted-foreground" />}
              <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setSel(0) }} placeholder="Buscar ou perguntar (ex.: onde vejo o gasto do mês?)" type="search" name="busca-paginas" autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other"
                className="campo-embutido h-12 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 placeholder:text-muted-foreground" aria-label="Buscar" /* marca: o foco aparece na borda da paleta */
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, itens.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
                  if (e.key === 'Enter' && itens[sel]) ir(itens[sel])
                  if (e.key === 'Tab' && q.trim().length >= 3) { e.preventDefault(); perguntarIa() }
                  if (e.key === 'Escape') fechar()
                }} />
              <kbd className="hidden rounded border border-border px-1.5 text-[10px] text-muted-foreground sm:block">Tab = IA</kbd>
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">ESC</kbd>
            </div>
            <AnimatePresence>
              {ia && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-muted/30">
                  <div className="max-h-64 overflow-y-auto px-4 py-3 text-sm">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground"><Bot className="h-3.5 w-3.5 text-primary" />Resposta da IA{ia.q ? ` · “${ia.q.slice(0, 60)}”` : ''}</p>
                    {ia.carregando ? <p className="flex items-center gap-2 text-muted-foreground"><Loader className="h-3.5 w-3.5 animate-spin" />Consultando o sistema…</p>
                      : ia.erro ? <p className="text-red-600 dark:text-red-400">{ia.erro}</p>
                        : <><div className="leading-relaxed [&_a]:text-primary"><MiniMarkdownBusca texto={ia.texto} ir={(l) => { navegar(l); fechar() }} /></div>
                          {ia.links?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{ia.links.map((l) => <button key={l.link} onClick={() => { navegar(l.link); fechar() }} className="rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/15">Abrir {l.titulo} →</button>)}</div>}</>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {itens.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{q.trim().length < 2 ? 'Digite o que procura: ar, sala, tarefa, bug, pessoa, tela… ou faça uma pergunta.' : buscando ? 'Procurando…' : 'Nada encontrado. Aperte Tab para perguntar à IA.'}</li>}
              {grupos.map(([g, lst]) => (
                <li key={g}>
                  <p className="px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{g}</p>
                  <ul>{lst.map(([i, n]) => (
                    <li key={`${i.tipo}-${i.link || 'ia'}-${n}`}>
                      <button onMouseEnter={() => setSel(n)} onClick={() => ir(i)} className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm ${n === sel ? 'bg-muted' : ''}`}>
                        <i.icone className={`h-4 w-4 shrink-0 ${i.ia ? 'text-primary' : 'text-muted-foreground'}`} />
                        <span className="min-w-0 flex-1"><span className="block truncate">{i.titulo}</span>{i.sub && <span className="block truncate text-[11px] text-muted-foreground">{i.sub}</span>}</span>
                        {i.ia ? <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">Tab</kbd> : <span className="shrink-0 text-xs text-muted-foreground">{i.tipo}</span>}
                      </button>
                    </li>))}</ul>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
const ICONE_TIPO = { Ar: AirVent, Sala: FolderKanban, Transmissor: Radio, Cena: Workflow, Automação: Workflow, Agenda: Workflow, Fluxo: Workflow, Tarefa: ListTodo,
  Bug, Pessoa: Settings, 'Aparelho do escritório': Lightbulb, 'Conversa com a IA': Bot, Versão: Megaphone, Tela: Search }
// links [texto](/rota) da resposta da IA viram navegação interna; o resto é texto (sem HTML cru)
function MiniMarkdownBusca({ texto, ir }) {
  return (texto || '').split('\n').filter((l) => l.trim()).map((linha, k) => (
    <p key={k} className="mb-1">{linha.split(/(\[[^\]]+\]\(\/[^)\s]*\)|\*\*[^*]+\*\*)/g).map((p, j) => {
      const m = p.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/)
      if (m) return <button key={j} onClick={() => ir(m[2])} className="text-primary underline-offset-2 hover:underline">{m[1]}</button>
      const b = p.match(/^\*\*([^*]+)\*\*$/)
      return b ? <b key={j} className="font-semibold">{b[1]}</b> : <span key={j}>{p.replace(/^[-*]\s+/, '• ')}</span>
    })}</p>))
}


// Barra de status no lugar do título repetido: lugar atual, agente, ares ligados, transmissores e relógio.
function BarraStatus({ status }) {
  const { projeto } = useProjeto()
  const [agora, setAgora] = useState(new Date())
  useEffect(() => { const t = setInterval(() => setAgora(new Date()), 15000); return () => clearInterval(t) }, [])
  const s = status || {}
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[13px] text-muted-foreground">
      <span className="topo-projeto max-w-[14rem] truncate font-medium text-foreground">{projeto ? projeto.nome : 'Todos os projetos'}</span>
      {/* os itens ficam sempre no lugar (com "–" até os dados chegarem): antes surgiam depois e empurravam o cabeçalho (CLS) */}
      <>
          <span className="topo-projeto text-border">/</span>
          <Link to="/configuracoes?aba=sistema" className="flex min-w-[7.75rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted" title="Agente do Mac">
            <span className="relative flex h-2 w-2">
              {s.agente_online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />} {/* marca: pulso indica que o agente está vivo */}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${!status ? 'bg-muted-foreground/40' : s.agente_online ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </span>
            {!status ? 'Agente…' : s.agente_online ? 'Agente online' : 'Agente offline'}
          </Link>
          <Link to="/aparelhos" className="topo-ligados shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted" title="Ares ligados agora">
            <AirVent className="h-3.5 w-3.5" /><span className="tabular">{status ? `${s.ligados}/${s.aparelhos}` : '–/–'}</span> ligados
          </Link>
          <Link to="/transmissores" className="topo-transmissores shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-1 hover:bg-muted" title="Transmissores respondendo">
            <Radio className="h-3.5 w-3.5" /><span className="tabular">{status ? `${s.hubs_online}/${s.hubs}` : '–/–'}</span> transmissores
          </Link>
      </>
      <span className="topo-data shrink-0 whitespace-nowrap tabular">· {agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace(/\./g, '')}, {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  )
}

// Idioma do painel: a tela troca na hora; o que ainda não tem tradução a IA traduz em segundos e fica guardado.
function SeletorIdioma() {
  const [aberto, setAberto] = useState(false)
  const [atual, setAtual] = useState(idiomaAtual)
  const [trocando, setTrocando] = useState(false)
  const ref = useRef(null)
  useEffect(() => aoMudarIdioma(setAtual), [])
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const escolher = async (c) => { setAberto(false); setTrocando(true); try { await mudarIdioma(c) } finally { setTrocando(false) } }
  return (
    <div ref={ref} className="relative" translate="no">
      <button onClick={() => setAberto((a) => !a)} aria-haspopup="menu" aria-expanded={aberto} title="Idioma do painel"
        className="flex items-center gap-1 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
        <Languages className={`h-[18px] w-[18px] ${trocando ? 'animate-pulse' : ''}`} />
        <span className="text-[11px] font-semibold uppercase tabular">{atual}</span>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div role="menu" initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}
            className="absolute right-0 z-50 mt-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-xl"> {/* marca: menu flutua */}
            <p className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">Idioma do painel</p>
            {IDIOMAS_PAINEL.map(([c, nome]) => (
              <button key={c} role="menuitemradio" aria-checked={atual === c} onClick={() => escolher(c)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted ${atual === c ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                <span className="w-6 text-[11px] font-semibold uppercase">{c}</span><span className="flex-1">{nome}</span>{atual === c && <Check className="h-4 w-4 text-primary" />}
              </button>))}
            <p className="border-t border-border px-2 pb-1 pt-2 text-[11px] leading-snug text-muted-foreground">Textos novos são traduzidos pela IA na primeira vez e ficam guardados. Para revisar: Idiomas → Painel.</p>
          </motion.div>
        )}
      </AnimatePresence>
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

const TELAS_CHEIAS = ['/ia', '/mensagens', '/musica', '/supabase']   // telas de ponta a ponta: sem rodapé (no /supabase ele sobrava sobre o menu)

function Rodape() {
  const { marca } = useMarca()
  const contatos = [marca.suporte_email && `Suporte: ${marca.suporte_email}`, marca.suporte_telefone, marca.suporte_whatsapp && `WhatsApp ${marca.suporte_whatsapp}`].filter(Boolean)
  if (!marca.rodape && !contatos.length && !marca.mostrar_creditos && !marca.rede_instagram && !marca.rede_linkedin && !marca.rede_youtube) return null
  return (
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
      <span>{marca.rodape || `© ${new Date().getFullYear()} ${marca.nome}`}</span>
      <span className="flex flex-wrap items-center gap-3">{contatos.map((c) => <span key={c}>{c}</span>)}
        {[['rede_instagram', 'Instagram'], ['rede_linkedin', 'LinkedIn'], ['rede_youtube', 'YouTube']].filter(([k]) => marca[k]).map(([k, r]) => <a key={k} href={marca[k]} target="_blank" rel="noopener noreferrer" className="hover:text-foreground hover:underline">{r}</a>)}
        {marca.mostrar_creditos && <span>Infravermelho · Alexa · Supabase</span>}</span>
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

// Tela para quem não é administrador enquanto o white label está em modo manutenção
function Manutencao({ marca }) {
  const prev = marca.manutencao_previsao ? new Date(marca.manutencao_previsao) : null
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <motion.div animate={{ rotate: [0, -12, 12, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2 }} className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
        <Wrench className="h-8 w-8" />
      </motion.div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">Estamos em manutenção</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{marca.manutencao_mensagem || 'O sistema está passando por ajustes. Os ares continuam funcionando normalmente pela Alexa e pelas automações.'}</p>
      {prev && !Number.isNaN(prev.getTime()) && <p className="mt-4 rounded-lg border border-border bg-card px-3 py-2 text-sm">Previsão de volta: <span className="font-medium">{prev.toLocaleString('pt-BR', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</span></p>}
      <button onClick={() => window.location.reload()} className="mt-6 text-sm text-primary hover:underline">Tentar de novo</button>
    </div>
  )
}

export default function Layout() {
  const { marca } = useMarca()
  const { sessao: sessaoLayout } = useProjeto()
  const emManutencao = marca.manutencao && sessaoLayout && !['dono', 'admin'].includes(sessaoLayout.papel)
  const [fixada, setFixada] = useState(() => { try { return localStorage.getItem('clima-sidebar') === 'fixa' } catch { return false } })
  const [hover, setHover] = useState(false)
  const [movel, setMovel] = useState(false)
  const [paleta, setPaleta] = useState(false)
  const desktop = useDesktop()
  const local = useLocation()
  const aberta = fixada || hover
  const central = useCentral()

  useEffect(() => setMovel(false), [local.pathname])
  useEffect(() => { trocarTela(local.pathname) }, [local.pathname])   // tempo de tela por pessoa (Configurações → Usuários)
  // nome da página no título da aba (formato definido no white label)
  useEffect(() => {
    const item = [...TODAS].sort((a, b) => b.para.length - a.para.length).find((i) => (i.para === '/' ? local.pathname === '/' : local.pathname.startsWith(i.para)))
    definirPagina(item ? (marca.menu_rotulos?.[item.para] || item.rotulo) : '')
  }, [local.pathname, marca.menu_rotulos])
  const PADRAO = Math.max(200, Math.min(320, Number(marca.menu_largura) || 264))
  // largura escolhida por quem usa (arrastar a borda, como no VS Code); guardada só neste navegador
  const [largura, setLargura] = useState(() => { try { const n = Number(localStorage.getItem('clima-sidebar-largura')); return n >= 200 && n <= 480 ? n : 0 } catch { return 0 } })
  const [arrastando, setArrastando] = useState(false)
  const ABERTA = largura || PADRAO
  const guardarLargura = (n) => { setLargura(n); try { n ? localStorage.setItem('clima-sidebar-largura', String(n)) : localStorage.removeItem('clima-sidebar-largura') } catch { /* sem storage */ } }
  const comecarArrastar = (e) => {
    e.preventDefault()
    const alca = e.currentTarget
    alca.setPointerCapture?.(e.pointerId)
    setArrastando(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const mover = (ev) => setLargura(Math.round(Math.max(200, Math.min(480, ev.clientX))))
    const soltar = (ev) => {
      alca.removeEventListener('pointermove', mover); alca.removeEventListener('pointerup', soltar); alca.removeEventListener('pointercancel', soltar)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      setArrastando(false)
      guardarLargura(Math.round(Math.max(200, Math.min(480, ev.clientX || ABERTA))))
      // soltou fora da barra: ela volta a fechar sozinha (se não estiver fixa)
      const r = alca.parentElement?.getBoundingClientRect()
      if (r && (ev.clientX > r.right + 8 || ev.clientX < r.left)) setHover(false)
    }
    alca.addEventListener('pointermove', mover); alca.addEventListener('pointerup', soltar); alca.addEventListener('pointercancel', soltar)
  }
  const teclaLargura = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); guardarLargura(Math.max(200, Math.min(480, ABERTA + (e.key === 'ArrowRight' ? 16 : -16)))) }
    if (e.key === 'Home') { e.preventDefault(); guardarLargura(0) }
  }
  const [abertura, setAbertura] = useState(() => { try { return marca.abertura && !sessionStorage.getItem('clima-abertura') } catch { return false } })
  useEffect(() => { if (!abertura) return undefined; try { sessionStorage.setItem('clima-abertura', '1') } catch { /* sem storage */ } const t = setTimeout(() => setAbertura(false), 1600); return () => clearTimeout(t) }, [abertura])
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
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-sidebar md:block ${hover && !fixada ? 'shadow-xl' : ''}`} /* marca: aberto pelo mouse, flutua sobre a tela */
        initial={false}
        animate={{ width: aberta || arrastando ? ABERTA : FECHADA }}
        transition={arrastando ? { duration: 0 } : MOLA}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => { if (!arrastando) setHover(false) }}
      >
        <ConteudoSidebar aberta={aberta || arrastando} fixada={fixada} alternarFixar={alternarFixar} contadores={central.dados?.status} aoBuscar={() => setPaleta(true)} />
        {(aberta || arrastando) && (
          <div role="separator" aria-orientation="vertical" aria-label="Largura do menu (arraste; duplo clique volta ao padrão)" aria-valuemin={200} aria-valuemax={480} aria-valuenow={ABERTA}
            tabIndex={0} title="Arraste para ajustar a largura · duplo clique volta ao padrão"
            onPointerDown={comecarArrastar} onDoubleClick={() => guardarLargura(0)} onKeyDown={teclaLargura}
            className={`group/alca absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none`}>
            <span className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${arrastando ? 'bg-primary' : 'bg-transparent group-hover/alca:bg-primary/60 group-focus-visible/alca:bg-primary'}`} />
          </div>
        )}
      </motion.aside>

      {/* Celular: gaveta lateral */}
      <AnimatePresence>
        {movel && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-black/40 md:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMovel(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-sidebar md:hidden"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ duration: 0.25, ease: 'easeInOut' }}>
              <button onClick={() => setMovel(false)} className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-muted-foreground" aria-label="Fechar menu"><X className="h-5 w-5" /></button>
              <ConteudoSidebar aberta aoNavegar={() => setMovel(false)} contadores={central.dados?.status} aoBuscar={() => { setMovel(false); setPaleta(true) }} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* só o menu FIXADO empurra o conteúdo; aberto pelo mouse ele passa por cima. Antes o hover mudava o paddingLeft da
          tela inteira, e o navegador conta isso como deslocamento de layout (CLS) em todas as rotas: era a maior causa medida. */}
      <motion.div className="min-w-0" initial={false} animate={{ paddingLeft: desktop ? (fixada ? ABERTA : FECHADA) : 0 }} transition={arrastando ? { duration: 0 } : MOLA}>
        <header data-cabecalho-app className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setMovel(true)} className="-ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button>
          <BarraStatus status={central.dados?.status} />
          {marca.selo_ambiente && <span className="hidden shrink-0 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300 sm:inline">{marca.selo_ambiente}</span>}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <button onClick={() => setPaleta(true)} className="topo-busca h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground hover:bg-muted">
              <Search className="h-4 w-4" /> <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-border px-1.5 text-[10px]">⌘K</kbd>
            </button>
            <button onClick={() => setPaleta(true)} className="topo-busca-icone rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Buscar"><Search className="h-[18px] w-[18px]" /></button>
            {marca.mostrar_link_site !== false && <a href={siteComSessao(true)} className="topo-link items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" title="Voltar ao site">
              <Globe className="h-4 w-4" /> <span className="topo-rotulo">Site</span>
            </a>}
            <a href="https://github.com/estevam5s/clima-casa" target="_blank" rel="noreferrer" className="topo-link items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" title="Código-fonte no GitHub" aria-label="Repositório no GitHub">
              <IconeMarca nome="github" className="h-4 w-4" /> <span className="topo-rotulo">GitHub</span>
            </a>
            <Link to="/apps" className="topo-apps items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" title="Baixar os apps" aria-label="Baixar os apps">
              <Download className="h-4 w-4" /> <span className="topo-rotulo">Apps</span>
            </Link>
            <AcessoRapido />
            {marca.mostrar_ajuda && (marca.suporte_email || marca.suporte_telefone || marca.suporte_whatsapp || marca.site) && <Ajuda marca={marca} />}
            <SeletorIdioma />
            <BotaoTema />
            <Notificacoes central={central} />
          </div>
        </header>
        <Banner />
        <NovidadesModal />
        <AvisoEntradas />
        <TermoAceite />
        <main className="w-full px-4 pb-16 pt-6 sm:px-6 lg:px-8 2xl:px-10">
          {/* altura mínima de uma tela: enquanto a página carrega, o rodapé fica abaixo da dobra e não "pula" quando os dados
              chegam (era o maior deslocamento de layout medido nas telas do sistema) */}
          <motion.div key={local.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className={TELAS_CHEIAS.some((t) => local.pathname.startsWith(t)) ? '' : 'min-h-[calc(100dvh-8.5rem)]'}>
      <Atalhos />
            {emManutencao ? <Manutencao marca={marca} /> : <Suspense fallback={<Carregando />}><Outlet /></Suspense>}
          </motion.div>
          {/* telas de app em tela cheia (chat, música): o rodapé empurrava a página para além da altura da tela */}
          {!TELAS_CHEIAS.some((t) => local.pathname.startsWith(t)) && <Rodape />}
        </main>
      </motion.div>
      <Paleta aberta={paleta} fechar={() => setPaleta(false)} />
      <ConfirmacaoGlobal />
      {marca.marca_dagua && <MarcaDagua texto={marca.marca_dagua} />}
      <AnimatePresence>
        {abertura && (
          <motion.div key="abertura" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45 }} className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-4 bg-background">
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', duration: 0.7 }}>
              {logoDaMarca(marca, document.documentElement.classList.contains('dark')) ? <img src={logoDaMarca(marca, document.documentElement.classList.contains('dark'))} alt="" className="h-20 w-20 object-contain" /> : <span className="block h-16 w-16 rounded-2xl bg-primary" />}
            </motion.div>
            <motion.p initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="text-lg font-semibold">{marca.nome}</motion.p>
            {marca.abertura_texto && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }} className="max-w-sm px-6 text-center text-sm text-muted-foreground">{marca.abertura_texto}</motion.p>}
            <motion.span className="h-1 w-32 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full bg-primary" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.3, ease: 'easeInOut' }} /></motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// marca d'água em mosaico (ex.: "Confidencial"): não atrapalha cliques e sai junto na captura de tela
function MarcaDagua({ texto }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" transform="rotate(-24 160 90)" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#808080">${texto.replace(/[<>&"']/g, '')}</text></svg>`
  return <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]" style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, opacity: 'var(--dagua-opacidade)' }} />
}
