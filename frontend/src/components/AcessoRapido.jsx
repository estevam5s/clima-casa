import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, BarChart3, Bell, CalendarClock, DatabaseBackup, LayoutGrid, Lightbulb, Server, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { useToast } from './ui'

// Atalhos do topo: as áreas mais usadas a um clique e o backup na hora (JSON com aparelhos, botões gravados, agenda e
// transmissores; sem senhas nem chaves). O backup exige acesso a todos os projetos (o servidor confere).
const ITENS = [
  ['/automacoes', 'Automações', Workflow], ['/agendamentos', 'Agenda', CalendarClock], ['/cenas', 'Cenas', Sparkles],
  ['/luzes', 'Iluminação', Lightbulb], ['/notificacoes', 'Notificações', Bell], ['/relatorios', 'Relatórios', BarChart3, 'relatorios.ver'],
  ['/atividade', 'Atividade', Activity, 'atividade.ver'], ['/seguranca', 'Segurança', ShieldCheck, 'seguranca.gerenciar'], ['/infra?aba=agentes', 'Agentes', Server, 'configuracoes.gerenciar'],
]

export default function AcessoRapido() {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const ref = useRef(null)
  const navegar = useNavigate()
  const toast = useToast()
  const { sessao } = useProjeto()
  const dono = ['dono', 'admin'].includes(sessao?.papel)
  const perms = sessao?.permissoes || []
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const backup = async () => {
    setSalvando(true)
    try {
      const dados = await api.get('/api/backup')
      const url = URL.createObjectURL(new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' }))
      const a = Object.assign(document.createElement('a'), { href: url, download: `backup-clima-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json` })
      a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast(`Backup salvo: ${dados.aparelhos?.length || 0} ares, ${dados.codigos?.length || 0} botões e ${dados.agendamentos?.length || 0} agendamentos.`)
      setAberto(false)
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const visiveis = ITENS.filter(([, , , perm]) => !perm || dono || perms.includes(perm))
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label="Atalhos" title="Atalhos"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        <LayoutGrid className="h-4 w-4" /><span className="hidden xl:inline">Atalhos</span>
      </button>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }}
            className="absolute right-0 top-11 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] origin-top-right rounded-2xl border border-border bg-card p-3 shadow-2xl"> {/* marca: painel flutua */}
            <p className="px-1 pb-2 text-xs font-medium text-muted-foreground">Ir para</p>
            <div className="grid grid-cols-3 gap-1.5">
              {visiveis.map(([para, rotulo, Icone]) => (
                <button key={para} onClick={() => { setAberto(false); navegar(para) }}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-border px-2 py-3 text-xs hover:bg-muted">
                  <Icone className="h-4 w-4 text-primary" />{rotulo}
                </button>
              ))}
            </div>
            {dono && (
              <button onClick={backup} disabled={salvando} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left hover:bg-muted disabled:opacity-60">
                <DatabaseBackup className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0"><span className="block text-sm font-medium">{salvando ? 'Gerando backup…' : 'Backup agora'}</span>
                  <span className="block text-[11px] text-muted-foreground">Arquivo com ares, botões gravados, agenda e transmissores. Sem senhas nem chaves. O backup automático do banco continua todo dia às 02h.</span></span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
