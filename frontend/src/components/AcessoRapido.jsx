import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AirVent, ArchiveRestore, BarChart3, Bell, Bot, Bug, DatabaseBackup, LayoutGrid, Lightbulb, Map as IconeMapa, Music, Radio,
  Search, Send, Server, ShieldCheck, Workflow,
} from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { useToast } from './ui'

// Atalhos do topo: busca rápida entre as áreas, as mais usadas a um clique e, para dono/admin, o backup COMPLETO do
// sistema na hora (o mesmo da página Backup: banco inteiro num .zip com segredos cifrados) e o upload para restaurar.
const GRUPOS = [
  ['Controle', [['/aparelhos', 'Aparelhos', AirVent], ['/rotinas', 'Rotinas', Workflow],
    ['/transmissores', 'Transmissores', Radio], ['/luzes', 'Iluminação', Lightbulb]]],
  ['Acompanhar', [['/mapa', 'Mapa 3D', IconeMapa], ['/relatorios', 'Relatórios', BarChart3, 'relatorios.ver'], ['/atividade', 'Atividade', Activity, 'atividade.ver'],
    ['/notificacoes', 'Notificações', Bell], ['/bugs', 'Bugs', Bug], ['/musica', 'Música', Music]]],
  ['Sistema', [['/ia', 'Assistente IA', Bot], ['/telegram', 'Telegram', Send], ['/seguranca', 'Segurança', ShieldCheck, 'seguranca.gerenciar'],
    ['/infra?aba=agentes', 'Agentes', Server, 'configuracoes.gerenciar'], ['/backup', 'Backup', DatabaseBackup, 'configuracoes.gerenciar']]],
]

export default function AcessoRapido() {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef(null)
  const navegar = useNavigate()
  const toast = useToast()
  const { sessao } = useProjeto()
  const dono = ['dono', 'admin'].includes(sessao?.papel)
  const perms = sessao?.permissoes || []
  useEffect(() => {
    if (!aberto) { setBusca(''); return undefined }
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const ir = (para) => { setAberto(false); navegar(para) }
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
  const t = busca.trim().toLowerCase()
  const grupos = GRUPOS.map(([g, itens]) => [g, itens.filter(([para, rotulo, , perm]) => (!perm || dono || perms.includes(perm)) && (!t || rotulo.toLowerCase().includes(t) || para.includes(t)))]).filter(([, i]) => i.length)
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label="Atalhos" title="Atalhos"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        <LayoutGrid className="h-4 w-4" /><span className="topo-rotulo">Atalhos</span>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-[26rem] max-w-[calc(100vw-1.5rem)] origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"> {/* marca: painel flutua */}
            <label className="m-2 flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 px-3 py-2 transition-colors focus-within:border-primary/50 focus-within:bg-background">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input autoFocus type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ir para…" aria-label="Procurar atalho"
                onKeyDown={(e) => { if (e.key === 'Enter' && grupos[0]?.[1][0]) ir(grupos[0][1][0][0]) }}
                className="campo-embutido min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden" />
              <kbd className="shrink-0 rounded border border-border px-1.5 text-[10px] text-muted-foreground">Enter</kbd>
            </label>
            <div className="border-b border-border" />
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {grupos.map(([g, itens]) => (
                <div key={g} className="mb-3 last:mb-0">
                  <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {itens.map(([para, rotulo, Icone]) => (
                      <button key={para} onClick={() => ir(para)} className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-2.5 text-xs hover:border-primary/40 hover:bg-muted">
                        <Icone className="h-4 w-4 text-primary" /><span className="truncate">{rotulo}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!grupos.length && <p className="px-1 py-4 text-center text-sm text-muted-foreground">Nenhum atalho com “{busca}”.</p>}
            </div>
            {dono && !t && (
              <div className="grid grid-cols-2 gap-2 border-t border-border bg-muted/30 p-3">
                <button onClick={backup} disabled={salvando} className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 disabled:opacity-60">
                  <DatabaseBackup className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0"><span className="block text-sm font-medium">{salvando ? 'Gerando…' : 'Backup completo'}</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">Banco inteiro num .zip (segredos cifrados)</span></span>
                </button>
                <button onClick={() => ir('/backup?aba=restaurar')} className="flex items-start gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40">
                  <ArchiveRestore className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0"><span className="block text-sm font-medium">Upload</span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">Enviar um backup, simular e restaurar</span></span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
