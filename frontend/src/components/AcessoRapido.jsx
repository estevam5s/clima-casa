import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AirVent, ArchiveRestore, BarChart3, Bell, Bot, Bug, Clock3, DatabaseBackup, FolderKanban, LayoutGrid, ListTodo, Lightbulb, Map as IconeMapa,
  Music, Network, Pin, PinOff, Radio, Search, Send, Server, Settings, ShieldCheck, Workflow,
} from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { IR } from './Atalhos'
import { useToast } from './ui'

// Atalhos do topo, no formato de menu de comando: busca, setas + Enter, a tecla de cada tela (as mesmas do "g" + letra),
// favoritos fixados e as últimas abertas (só neste navegador). Dono/admin: backup completo na hora e upload para restaurar.
const ITENS = [
  ['/aparelhos', 'Aparelhos', AirVent, 'Ligar, desligar e ajustar os ares', 'Controle'],
  ['/rotinas', 'Rotinas', Workflow, 'Cenas, automações, agenda e fluxos', 'Controle'],
  ['/rotinas?aba=fluxos', 'Fluxos', Network, 'Automações em blocos ligados por setas', 'Controle'],
  ['/transmissores', 'Transmissores', Radio, 'Smart IR: status, botões e zonas', 'Controle'],
  ['/luzes', 'Iluminação', Lightbulb, 'Lâmpadas e interruptores', 'Controle'],
  ['/mapa', 'Mapa 3D', IconeMapa, 'O escritório em 3D', 'Acompanhar'],
  ['/relatorios', 'Relatórios', BarChart3, 'Uso, custo e conclusões', 'Acompanhar', 'relatorios.ver'],
  ['/atividade', 'Atividade', Activity, 'Quem fez o quê e quando', 'Acompanhar', 'atividade.ver'],
  ['/notificacoes', 'Notificações', Bell, 'Avisos do sistema', 'Acompanhar'],
  ['/projetos', 'Projetos', FolderKanban, 'Salas, metas e gasto', 'Acompanhar'],
  ['/tarefas', 'Tarefas', ListTodo, 'Quadro e lista da equipe', 'Acompanhar'],
  ['/bugs', 'Bugs', Bug, 'Relatar e corrigir problemas', 'Acompanhar'],
  ['/musica', 'Música', Music, 'Spotify nos Echo', 'Acompanhar'],
  ['/ia', 'Assistente IA', Bot, 'Pergunte ou peça ao sistema', 'Sistema'],
  ['/telegram', 'Telegram', Send, 'Bot e avisos', 'Sistema'],
  ['/seguranca', 'Segurança', ShieldCheck, 'Firewall, logs, ISO e treinamento', 'Sistema'],
  ['/infra?aba=agentes', 'Agentes', Server, 'Computadores do escritório', 'Sistema', 'configuracoes.gerenciar'],
  ['/backup', 'Backup', DatabaseBackup, 'Cópias e restauração', 'Sistema', 'configuracoes.gerenciar'],
  ['/configuracoes', 'Configurações', Settings, 'Perfil, usuários e sistema', 'Sistema'],
]
const TECLA = Object.fromEntries(IR.map(([k, , para]) => [para, k]))
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem armazenamento */ } }
const sem = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function AcessoRapido() {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const [fixos, setFixos] = useState(() => ler('clima-atalhos-fixos'))
  const [recentes, setRecentes] = useState(() => ler('clima-atalhos-recentes'))
  const ref = useRef(null), lista = useRef(null)
  const navegar = useNavigate()
  const local = useLocation()
  const toast = useToast()
  const { sessao } = useProjeto()
  const dono = ['dono', 'admin'].includes(sessao?.papel)
  const perms = sessao?.permissoes || []
  // guarda as telas abertas (as 5 últimas, sem repetir a atual)
  useEffect(() => {
    const p = local.pathname + (local.pathname === '/rotinas' && local.search.includes('fluxos') ? '?aba=fluxos' : '')
    if (!ITENS.some(([para]) => para === p)) return
    setRecentes((r) => { const n = [p, ...r.filter((x) => x !== p)].slice(0, 5); gravar('clima-atalhos-recentes', n); return n })
  }, [local.pathname, local.search])
  useEffect(() => {
    if (!aberto) { setBusca(''); setAtivo(0); return undefined }
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const ir = (para) => { setAberto(false); navegar(para) }
  const fixar = (para) => setFixos((f) => { const n = f.includes(para) ? f.filter((x) => x !== para) : [...f, para].slice(-8); gravar('clima-atalhos-fixos', n); return n })
  const backup = async () => {
    setSalvando(true)
    try {
      const r = await api.post('/api/backup-sistema/gerar', {})
      const { url } = await api.get(`/api/backup-sistema/baixar/${encodeURIComponent(r.arquivo)}`)
      window.location.href = url
      const n = Object.values(r.tabelas).reduce((a, b) => a + b, 0)
      toast(`Backup completo: ${Object.keys(r.tabelas).length} tabelas, ${n.toLocaleString('pt-BR')} linhas. Ele também fica guardado em Backup.`)
      setAberto(false)
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const t = sem(busca.trim())
  const permitidos = ITENS.filter(([, , , , , perm]) => !perm || dono || perms.includes(perm))
  const secoes = useMemo(() => {
    const achar = (p) => permitidos.find(([para]) => para === p)
    if (t) return [['Resultados', permitidos.filter(([para, rot, , desc]) => sem(`${rot} ${desc} ${para}`).includes(t))]]
    const s = []
    const f = fixos.map(achar).filter(Boolean)
    if (f.length) s.push(['Fixados', f])
    const r = recentes.map(achar).filter((x) => x && !fixos.includes(x[0])).slice(0, 3)
    if (r.length) s.push(['Recentes', r])
    for (const g of ['Controle', 'Acompanhar', 'Sistema']) s.push([g, permitidos.filter((x) => x[4] === g && !fixos.includes(x[0]))])
    return s.filter(([, i]) => i.length)
  }, [t, fixos, recentes, permitidos.length])   // eslint-disable-line react-hooks/exhaustive-deps
  const planos = secoes.flatMap(([, i]) => i)
  useEffect(() => { setAtivo(0) }, [t])
  useEffect(() => { lista.current?.querySelector(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' }) }, [ativo])
  const tecla = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((a) => Math.min(planos.length - 1, a + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)) }
    if (e.key === 'Enter' && planos[ativo]) ir(planos[ativo][0])
  }
  let i = -1
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label="Atalhos" title="Atalhos"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        <LayoutGrid className="h-4 w-4" /><span className="topo-rotulo">Atalhos</span>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-[24rem] max-w-[calc(100vw-1.5rem)] origin-top-right overflow-hidden rounded-xl border border-border bg-card shadow-xl" role="dialog" aria-label="Atalhos"> {/* marca: painel flutua */}
            <label className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input autoFocus type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={tecla} placeholder="Ir para uma tela…" aria-label="Procurar atalho"
                className="campo-embutido min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
              <span className="flex shrink-0 gap-1 text-[10px] text-muted-foreground"><kbd className="rounded border border-border px-1">↑↓</kbd><kbd className="rounded border border-border px-1">↵</kbd></span>
            </label>
            <div ref={lista} className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5" role="listbox">
              {secoes.map(([g, itens]) => (
                <div key={g} className="mb-1">
                  <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">{g === 'Recentes' && <Clock3 className="h-3 w-3" />}{g === 'Fixados' && <Pin className="h-3 w-3" />}{g}</p>
                  {itens.map(([para, rotulo, Icone, desc]) => {
                    i++
                    const meu = i, sel = meu === ativo, fixo = fixos.includes(para)
                    return (
                      <div key={g + para} data-i={meu} role="option" aria-selected={sel} onMouseEnter={() => setAtivo(meu)}
                        className={`group flex items-center gap-3 rounded-lg px-2 py-1.5 ${sel ? 'bg-muted' : ''}`}>
                        <button onClick={() => ir(para)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Icone className={`h-4 w-4 shrink-0 ${sel ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{rotulo}</span><span className="block truncate text-[11px] text-muted-foreground">{desc}</span></span>
                        </button>
                        <button onClick={() => fixar(para)} aria-label={fixo ? `Desafixar ${rotulo}` : `Fixar ${rotulo}`} title={fixo ? 'Desafixar' : 'Fixar no topo'}
                          className={`rounded p-1 text-muted-foreground hover:text-foreground ${fixo || sel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{fixo ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}</button>
                        {TECLA[para] && <kbd className="shrink-0 rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground" title={`Teclas g e ${TECLA[para]}`}>g {TECLA[para]}</kbd>}
                      </div>
                    )
                  })}
                </div>
              ))}
              {!planos.length && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhuma tela com “{busca}”. Para buscar em tudo (inclusive com IA), use ⌘K.</p>}
            </div>
            {dono && !t && (
              <div className="border-t border-border p-1.5">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground">Ações</p>
                <button onClick={backup} disabled={salvando} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60">
                  <DatabaseBackup className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block text-sm">{salvando ? 'Gerando o backup…' : 'Baixar backup completo'}</span><span className="block text-[11px] text-muted-foreground">Banco inteiro num .zip, segredos cifrados</span></span>
                </button>
                <button onClick={() => ir('/backup?aba=restaurar')} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                  <ArchiveRestore className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1"><span className="block text-sm">Restaurar de um arquivo</span><span className="block text-[11px] text-muted-foreground">Enviar um backup, simular e restaurar</span></span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
