import { useSearchParams } from 'react-router-dom'
import { Archive, CalendarClock, ChevronsUpDown, Database, ExternalLink, Gauge, GitBranch, Home, Lightbulb, ScrollText, Table2, Terminal, Users } from 'lucide-react'
import { siSupabase } from 'simple-icons'
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

  const ref = 'elyqjdcsbfdvlsxomxen'
  return (
    <div className="tela-supa -mx-4 -mb-16 -mt-6 bg-background text-foreground sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      {/* barra do projeto, como no dashboard do Supabase: organização / projeto / ramo e o selo do ambiente */}
      <header className="flex h-12 items-center gap-2 border-y border-border bg-card px-3 text-[13px] sm:px-4">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" role="img" aria-label="Supabase"><path d={siSupabase.path} fill={`#${siSupabase.hex}`} /></svg>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        <span className="hidden truncate sm:inline">Clima Escritório</span>
        <span className="hidden rounded border border-border px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">Free</span>
        <span className="text-muted-foreground">/</span>
        <span className="flex items-center gap-1 truncate font-medium">Arcondicionado<ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" /></span>
        <span className="text-muted-foreground">/</span>
        <span className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono text-xs"><GitBranch className="h-3.5 w-3.5 text-muted-foreground" />main</span>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Produção</span>
        <a href={`https://supabase.com/dashboard/project/${ref}`} target="_blank" rel="noreferrer" className="ml-auto hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted md:flex"><ExternalLink className="h-3.5 w-3.5" />Abrir no Supabase</a>
      </header>
      <div className="flex min-h-[calc(100dvh-7rem)] flex-col md:flex-row">
        {/* menu de ícones que se abre ao passar o mouse (como o do Supabase); no celular vira faixa rolável */}
        <div className="relative shrink-0 md:w-14">
        <nav className="group/menu z-20 shrink-0 border-b border-border bg-card md:absolute md:inset-y-0 md:left-0 md:w-14 md:overflow-hidden md:border-b-0 md:border-r md:transition-[width] md:duration-150 md:hover:w-56 md:focus-within:w-56 md:hover:shadow-xl" aria-label="Seções do Supabase">{/* marca: menu flutua ao abrir */}
          <div className="flex gap-1 overflow-x-auto px-2 py-2 sem-barra md:sticky md:top-16 md:block md:space-y-3 md:overflow-visible md:px-2 md:py-2">
            {GRUPOS.map(([titulo, itens], gi) => (
              <div key={titulo || 'inicio'} className={`flex gap-1 md:block md:space-y-0.5 ${gi ? 'md:border-t md:border-border md:pt-3' : ''}`}>
                {itens.map(([k, r, I]) => (
                  <button key={k} onClick={() => irPara(k)} title={r} className={`relative flex shrink-0 items-center gap-3 rounded-md px-2.5 py-2 text-[13px] md:w-full ${secao === k ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                    <I className="h-[18px] w-[18px] shrink-0" /><span className="whitespace-nowrap md:opacity-0 md:transition-opacity md:group-hover/menu:opacity-100 md:group-focus-within/menu:opacity-100">{r}</span>
                    {k === 'avisos' && nAvisos > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 md:right-1.5 md:top-1.5" aria-label={`${nAvisos} avisos`} />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>
        </div>
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
