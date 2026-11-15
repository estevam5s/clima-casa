import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Archive, CalendarClock, Database, Gauge, Home, Lightbulb, ScrollText, Table2, Terminal, Users } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { useDados } from '../components/ui'
import Visao from '../components/supabase/Visao'
import Tabelas from '../components/supabase/Tabelas'
import Sql from '../components/supabase/Sql'
import { Autenticacao, Avisos, Backups, Banco, Desempenho, Registros, Rotinas } from '../components/supabase/Outras'

// Painel do Supabase dentro do sistema, com a mesma organização do dashboard oficial:
// menu do projeto à esquerda e cada ferramenta numa área própria. Tudo é só leitura, exceto pausar/rodar rotinas.
const GRUPOS = [
  [null, [['visao', 'Visão geral', Home]]],
  ['Banco de dados', [['tabelas', 'Editor de tabelas', Table2], ['sql', 'Editor SQL', Terminal], ['banco', 'Tabelas e tamanhos', Database], ['desempenho', 'Desempenho', Gauge]]],
  ['Plataforma', [['auth', 'Autenticação', Users], ['rotinas', 'Rotinas (cron)', CalendarClock], ['registros', 'Registros', ScrollText], ['backups', 'Backups', Archive]]],
  ['Revisão', [['avisos', 'Avisos', Lightbulb]]],
]
const CHEIA = new Set(['tabelas', 'sql'])

export default function Supabase() {
  const [params, setParams] = useSearchParams()
  const secao = params.get('secao') || 'visao'
  const tabela = params.get('tabela') || undefined
  const { sessao } = useProjeto()
  const { dados: avisos } = useDados(() => api.get('/api/supabase/avisos'))
  const nAvisos = (avisos || []).filter((a) => a.nivel !== 'info').length
  const irPara = (s, t) => setParams(t ? { secao: s, tabela: t } : { secao: s })

  return (
    <div className="-mx-4 -mb-16 -mt-6 sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col border-t border-border md:flex-row">
        <nav className="shrink-0 border-b border-border bg-muted/30 md:sticky md:top-16 md:h-[calc(100dvh-4rem)] md:w-56 md:overflow-y-auto md:border-b-0 md:border-r" aria-label="Seções do Supabase">
          <div className="hidden items-center gap-2.5 px-4 pb-3 pt-4 md:flex">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">Arcondicionado</p><p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Supabase · gratuito</p></div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-2 py-2 sem-barra md:block md:space-y-4 md:px-2 md:py-1">
            {GRUPOS.map(([titulo, itens]) => (
              <div key={titulo || 'inicio'} className="flex gap-1 md:block md:space-y-0.5">
                {titulo && <p className="hidden px-2.5 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:block">{titulo}</p>}
                {itens.map(([k, r, I]) => (
                  <button key={k} onClick={() => irPara(k)} className={`relative flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13.5px] md:w-full ${secao === k ? 'font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                    {secao === k && <motion.span layoutId="secao-supabase" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', duration: 0.3 }} />}
                    <I className="relative h-4 w-4" /><span className="relative whitespace-nowrap">{r}</span>
                    {k === 'avisos' && nAvisos > 0 && <span className="relative ml-auto rounded-full bg-amber-500/20 px-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{nAvisos}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        <main className={`min-w-0 flex-1 ${CHEIA.has(secao) ? 'p-4 sm:p-6' : 'mx-auto w-full max-w-6xl px-4 py-6 sm:px-6'}`}>
          {secao === 'visao' && <Visao irPara={irPara} />}
          {secao === 'tabelas' && <Tabelas inicial={tabela} />}
          {secao === 'sql' && <Sql dono={sessao?.papel === 'dono'} />}
          {secao === 'banco' && <Banco irPara={irPara} />}
          {secao === 'desempenho' && <Desempenho />}
          {secao === 'auth' && <Autenticacao />}
          {secao === 'rotinas' && <Rotinas />}
          {secao === 'registros' && <Registros />}
          {secao === 'backups' && <Backups />}
          {secao === 'avisos' && <Avisos />}
        </main>
      </div>
    </div>
  )
}
