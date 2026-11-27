import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, Blocks, Braces, CalendarClock, ChevronsUpDown, Database, ExternalLink, FolderArchive, Gauge, GitBranch, Home, KeyRound, Lightbulb, ListTree, Network, PanelLeftClose, PanelLeftOpen, Plug, Radio, ScrollText, Search, Settings2, ShieldCheck, Table2, Terminal, Users, Wrench } from 'lucide-react'
import { siSupabase } from 'simple-icons'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, useDados } from '../components/ui'
import Visao from '../components/supabase/Visao'
import UsoCota from '../components/supabase/UsoCota'
import Tabelas from '../components/supabase/Tabelas'
import Sql from '../components/supabase/Sql'
import { Autenticacao, Avisos, Backups, Banco, Desempenho, Registros, Rotinas } from '../components/supabase/Outras'
import { Conexoes, Configuracao, Esquema, Extensoes, Funcoes, Indices, Manutencao, Politicas, Realtime, Storage } from '../components/supabase/Avancado'

// Painel do Supabase dentro do sistema, com a mesma organização do dashboard oficial:
// menu do projeto à esquerda e cada ferramenta numa área própria. Tudo é só leitura, exceto pausar/rodar rotinas.
const GRUPOS = [
  [null, [['visao', 'Visão geral', Home]]],
  ['Banco de dados', [['tabelas', 'Editor de tabelas', Table2], ['sql', 'Editor SQL', Terminal], ['esquema', 'Diagrama do esquema', Network], ['banco', 'Tabelas e tamanhos', Database],
    ['indices', 'Índices', ListTree], ['funcoes', 'Funções e gatilhos', Braces], ['extensoes', 'Extensões', Blocks]]],
  ['Segurança', [['politicas', 'Políticas (RLS)', ShieldCheck], ['auth', 'Autenticação', Users], ['avisos', 'Avisos', Lightbulb]]],
  ['Plataforma', [['uso', 'Uso e cota', Gauge], ['storage', 'Storage', FolderArchive], ['realtime', 'Realtime', Radio], ['rotinas', 'Rotinas (cron)', CalendarClock], ['backups', 'Backups', Archive]]],
  ['Observabilidade', [['desempenho', 'Desempenho', Gauge], ['conexoes', 'Conexões e bloqueios', Plug], ['manutencao', 'Manutenção e cache', Wrench], ['registros', 'Registros', ScrollText]]],
  ['Projeto', [['configuracao', 'Configuração', Settings2]]],
]
const CHEIA = new Set(['tabelas', 'sql'])
const lerMenu = () => { try { return localStorage.getItem('supa-menu') === 'fechado' } catch { return false } }

export default function Supabase() {
  const [params, setParams] = useSearchParams()
  const secao = params.get('secao') || 'visao'
  const tabela = params.get('tabela') || undefined
  const { sessao } = useProjeto()
  // o servidor exige configuracoes.gerenciar e acesso a todos os projetos: sem isso, a tela avisa em vez de ficar carregando
  const liberado = !sessao || (sessao.permissoes?.includes('configuracoes.gerenciar') && (sessao.projetos === undefined || sessao.projetos === '*'))
  const { dados: avisos } = useDados(() => (liberado ? api.get('/api/supabase/avisos') : Promise.resolve([])))
  const nAvisos = (avisos || []).filter((a) => a.nivel !== 'info').length
  const irPara = (s, t) => setParams(t ? { secao: s, tabela: t } : { secao: s })
  const [fechado, setFechado] = useState(lerMenu)
  const [busca, setBusca] = useState('')
  const alternar = () => setFechado((f) => { try { localStorage.setItem('supa-menu', f ? 'aberto' : 'fechado') } catch { /* sem armazenamento */ } return !f })
  const grupos = GRUPOS.map(([t, itens]) => [t, itens.filter(([, r]) => !busca || r.toLowerCase().includes(busca.toLowerCase()))]).filter(([, i]) => i.length)
  const atual = GRUPOS.flatMap(([t, i]) => i.map((x) => [t, ...x])).find((x) => x[1] === secao)

  const ref = 'elyqjdcsbfdvlsxomxen'
  if (!liberado) return <Aviso>O painel do Supabase é só para quem gerencia as configurações e vê todos os projetos.</Aviso>
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
        {/* menu do projeto: fixo e aberto (como o dashboard atual do Supabase), com busca; recolhe para ícones e lembra a escolha */}
        {/* a coluna vai até o fim da página (fundo e borda contínuos) e o conteúdo dela gruda logo abaixo da barra do sistema
            (top-16); antes o menu grudava por baixo da barra e terminava antes do fim, deixando um degrau ao rolar */}
        <nav className={`shrink-0 border-b border-border bg-card md:self-stretch md:border-b-0 md:border-r md:transition-[width] md:duration-150 ${fechado ? 'md:w-14' : 'md:w-60'}`} aria-label="Seções do Supabase">
          <div className="flex flex-col md:sticky md:top-16 md:h-[calc(100dvh-4rem)]">
            <div className={`hidden items-center gap-1 border-b border-border p-2 md:flex ${fechado ? 'justify-center' : ''}`}>
              {!fechado && (
                <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-2 text-[13px]">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar ferramenta" aria-label="Buscar ferramenta" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
                </label>
              )}
              <button onClick={alternar} title={fechado ? 'Abrir menu' : 'Recolher menu'} aria-label={fechado ? 'Abrir menu' : 'Recolher menu'} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                {fechado ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto px-2 py-2 sem-barra md:block md:flex-1 md:space-y-4 md:overflow-y-auto md:overflow-x-hidden md:py-3">
              {grupos.map(([titulo, itens]) => (
                <div key={titulo || 'inicio'} className="flex gap-1 md:block md:space-y-0.5">
                  {titulo && !fechado && <p className="hidden px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 md:block">{titulo}</p>}
                  {titulo && fechado && <div className="mx-2 mb-2 hidden border-t border-border md:block" />}
                  {itens.map(([k, r, I]) => (
                    <button key={k} onClick={() => irPara(k)} title={r} aria-current={secao === k ? 'page' : undefined}
                      className={`relative flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] md:w-full ${fechado ? 'md:justify-center' : ''} ${secao === k ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                      <I className="h-4 w-4 shrink-0" /><span className={`whitespace-nowrap ${fechado ? 'md:sr-only' : ''}`}>{r}</span>
                      {k === 'avisos' && nAvisos > 0 && (fechado
                        ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" aria-label={`${nAvisos} avisos`} />
                        : <span className="ml-auto rounded bg-amber-500/15 px-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{nAvisos}</span>)}
                    </button>
                  ))}
                </div>
              ))}
              {!grupos.length && <p className="px-2.5 text-xs text-muted-foreground">Nada com “{busca}”.</p>}
            </div>
            {!fechado && (
              <div className="hidden border-t border-border p-3 text-[11px] text-muted-foreground md:block">
                <p className="flex items-center gap-1.5"><KeyRound className="h-3 w-3" />Só leitura · segredos ocultos</p>
                <p className="mt-0.5 font-mono">{ref}</p>
              </div>
            )}
          </div>
        </nav>
        <main className={`min-w-0 flex-1 ${CHEIA.has(secao) ? 'p-4 sm:p-6' : 'w-full px-4 py-6 sm:px-6 xl:px-10'}`}>
          {atual?.[0] && !CHEIA.has(secao) && <p className="mb-1 text-xs text-muted-foreground">{atual[0]} <span aria-hidden>/</span> <span className="text-foreground">{atual[2]}</span></p>}
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
          {secao === 'esquema' && <Esquema irPara={irPara} />}
          {secao === 'indices' && <Indices />}
          {secao === 'funcoes' && <Funcoes />}
          {secao === 'extensoes' && <Extensoes />}
          {secao === 'politicas' && <Politicas />}
          {secao === 'uso' && <UsoCota />}
          {secao === 'storage' && <Storage />}
          {secao === 'realtime' && <Realtime />}
          {secao === 'conexoes' && <Conexoes />}
          {secao === 'manutencao' && <Manutencao />}
          {secao === 'configuracao' && <Configuracao />}
        </main>
      </div>
    </div>
  )
}
