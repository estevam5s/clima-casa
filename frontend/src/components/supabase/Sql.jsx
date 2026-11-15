import { useEffect, useRef, useState } from 'react'
import { Clock, Download, FileCode2, Lock, Play, Save, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { Botao, useToast } from '../ui'
import { Copiar, Grade, baixarTexto, paraCsv } from './comum'

const MODELOS = [
  ['Tabelas e tamanhos', "select relname as tabela, n_live_tup as linhas,\n       pg_size_pretty(pg_total_relation_size(relid)) as tamanho\nfrom pg_stat_user_tables\norder by pg_total_relation_size(relid) desc"],
  ['Últimos comandos', "select to_timestamp(quando) as quando, origem, acao, ok, detalhe\nfrom atividade\norder by id desc\nlimit 50"],
  ['Falhas da semana', "select to_timestamp(quando)::date as dia, count(*) as falhas\nfrom atividade\nwhere ok = 0 and quando > extract(epoch from now() - interval '7 days')\ngroup by 1 order by 1 desc"],
  ['Uso por aparelho (30 dias)', "select a.nome, count(*) as comandos,\n       count(*) filter (where t.ok = 0) as falhas\nfrom atividade t join aparelhos a on a.id = t.aparelho_id\nwhere t.quando > extract(epoch from now() - interval '30 days')\ngroup by a.nome order by 2 desc"],
  ['Origem dos comandos', "select origem, count(*) as total\nfrom atividade\ngroup by origem order by 2 desc"],
  ['Eventos de segurança (24 h)', "select tipo, count(*) as total, count(distinct ip) as ips\nfrom seguranca_eventos\nwhere quando > extract(epoch from now() - interval '24 hours')\ngroup by tipo order by 2 desc"],
  ['IPs bloqueados', "select alvo, motivo, automatico, ocorrencias, to_timestamp(expira_em) as expira\nfrom seguranca_ips\nwhere tipo = 'bloqueado'\norder by id desc"],
  ['Execuções do pg_cron', "select j.jobname, d.status, d.start_time, d.end_time - d.start_time as duracao\nfrom cron.job_run_details d join cron.job j using (jobid)\norder by d.start_time desc\nlimit 30"],
  ['Políticas RLS', "select tablename as tabela, policyname as politica, cmd, roles\nfrom pg_policies where schemaname = 'public'\norder by 1, 2"],
  ['Consultas mais pesadas', "select left(query, 120) as consulta, calls, round(mean_exec_time::numeric, 2) as media_ms\nfrom extensions.pg_stat_statements\norder by total_exec_time desc\nlimit 15"],
]
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)) || [] } catch { return [] } }
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem armazenamento */ } }

export default function Sql({ dono }) {
  const toast = useToast()
  const [sql, setSql] = useState(() => localStorage.getItem('clima-sql-atual') || MODELOS[0][1])
  const [res, setRes] = useState(null)
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState(false)
  const [limite, setLimite] = useState(500)
  const [salvas, setSalvas] = useState(() => ler('clima-sql-salvas'))
  const [historico, setHistorico] = useState(() => ler('clima-sql-historico'))
  const [painel, setPainel] = useState('modelos')
  const campo = useRef(null), numeros = useRef(null)
  useEffect(() => { try { localStorage.setItem('clima-sql-atual', sql) } catch { /* */ } }, [sql])

  const rodar = async () => {
    const alvo = (() => { const el = campo.current; if (el && el.selectionEnd > el.selectionStart) return sql.slice(el.selectionStart, el.selectionEnd); return sql })()
    if (!alvo.trim() || rodando) return
    setRodando(true); setErro('')
    try {
      const r = await api.post('/api/supabase/sql', { sql: alvo, limite })
      setRes(r)
      const h = [{ sql: alvo.trim(), quando: Date.now(), ms: r.ms, linhas: r.total }, ...historico.filter((x) => x.sql !== alvo.trim())].slice(0, 30)
      setHistorico(h); gravar('clima-sql-historico', h)
    } catch (e) { setErro(e.message); setRes(null) } finally { setRodando(false) }
  }
  const salvar = () => {
    const nome = window.prompt('Nome da consulta', sql.split('\n')[0].slice(0, 40))
    if (!nome) return
    const s = [{ nome, sql }, ...salvas.filter((x) => x.nome !== nome)].slice(0, 50); setSalvas(s); gravar('clima-sql-salvas', s); setPainel('salvas'); toast('Consulta salva neste navegador.')
  }
  const linhas = sql.split('\n').length

  if (!dono) return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted"><Lock className="h-6 w-6 text-muted-foreground" /></span>
      <h2 className="mt-4 text-lg font-semibold">Editor SQL só para o dono</h2>
      <p className="mt-2 text-sm text-muted-foreground">Consultas livres no banco ficam restritas ao dono do sistema. Use o Editor de tabelas para ver os dados com segurança.</p>
    </div>
  )

  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] sm:-m-6">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="flex border-b border-border text-xs">
          {[['modelos', 'Modelos'], ['salvas', `Salvas (${salvas.length})`], ['historico', 'Histórico']].map(([k, r]) => (
            <button key={k} onClick={() => setPainel(k)} className={`flex-1 border-b-2 py-2.5 font-medium ${painel === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{r}</button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5 text-[13px]">
          {painel === 'modelos' && MODELOS.map(([n, q]) => <li key={n}><button onClick={() => setSql(q)} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-muted-foreground hover:bg-muted hover:text-foreground"><FileCode2 className="h-3.5 w-3.5 shrink-0" />{n}</button></li>)}
          {painel === 'salvas' && (salvas.length ? salvas.map((s) => (
            <li key={s.nome} className="group flex items-center rounded-md hover:bg-muted"><button onClick={() => setSql(s.sql)} className="flex-1 truncate px-2.5 py-2 text-left">{s.nome}</button>
              <button onClick={() => { const n = salvas.filter((x) => x.nome !== s.nome); setSalvas(n); gravar('clima-sql-salvas', n) }} className="px-2 text-muted-foreground opacity-0 hover:text-red-600 group-hover:opacity-100" aria-label="Apagar"><Trash2 className="h-3.5 w-3.5" /></button></li>
          )) : <li className="p-3 text-xs text-muted-foreground">Use “Salvar” para guardar consultas neste navegador.</li>)}
          {painel === 'historico' && (historico.length ? historico.map((h) => (
            <li key={h.quando}><button onClick={() => setSql(h.sql)} className="w-full rounded-md px-2.5 py-2 text-left hover:bg-muted"><p className="truncate font-mono text-[12px]">{h.sql.replace(/\s+/g, ' ')}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" />{new Date(h.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {h.linhas} linha(s) · {h.ms} ms</p></button></li>
          )) : <li className="p-3 text-xs text-muted-foreground">As consultas que você rodar aparecem aqui.</li>)}
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
          <span className="flex items-center gap-1.5 rounded bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><Lock className="h-3 w-3" />somente leitura</span>
          <span className="text-xs text-muted-foreground">tempo máximo 8 s · um comando por vez · schemas internos bloqueados</span>
          <div className="ml-auto flex items-center gap-2">
            <select value={limite} onChange={(e) => setLimite(Number(e.target.value))} className="campo h-8 w-auto py-0 text-xs">{[100, 500, 1000].map((n) => <option key={n} value={n}>até {n} linhas</option>)}</select>
            <Botao variante="secundario" tamanho="sm" icone={Save} onClick={salvar}>Salvar</Botao>
            <Botao tamanho="sm" icone={Play} carregando={rodando} onClick={rodar}>Rodar <kbd className="ml-1 hidden rounded bg-white/20 px-1 text-[10px] sm:inline">⌘↵</kbd></Botao>
          </div>
        </div>
        <div className="flex h-[38%] min-h-[160px] border-b border-border bg-card font-mono text-[13px] leading-[1.6]">
          <div ref={numeros} className="w-10 shrink-0 select-none overflow-hidden border-r border-border bg-muted/40 py-3 pr-2 text-right text-muted-foreground/70" aria-hidden>
            {Array.from({ length: linhas }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea ref={campo} value={sql} spellCheck={false} onChange={(e) => setSql(e.target.value)} aria-label="Consulta SQL"
            onScroll={(e) => { if (numeros.current) numeros.current.scrollTop = e.target.scrollTop }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); rodar() }
              if (e.key === 'Tab') { e.preventDefault(); const el = e.target, a = el.selectionStart; setSql(sql.slice(0, a) + '  ' + sql.slice(el.selectionEnd)); setTimeout(() => el.setSelectionRange(a + 2, a + 2)) }
            }}
            className="flex-1 resize-none bg-transparent px-3 py-3 outline-none focus-visible:ring-0 focus-visible:ring-offset-0" />
        </div>
        <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Resultado</span>
          {res && <span>{res.total} linha(s){res.cortado ? ` (mostrando as primeiras ${limite})` : ''} · {res.ms} ms</span>}
          {res?.linhas.length > 0 && <div className="ml-auto flex gap-2">
            <Copiar texto={JSON.stringify(res.linhas, null, 2)} rotulo="JSON" />
            <button onClick={() => baixarTexto('consulta.csv', paraCsv(res.colunas, res.linhas))} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-muted hover:text-foreground"><Download className="h-3.5 w-3.5" />CSV</button>
          </div>}
        </div>
        <div className="min-h-0 flex-1 bg-card">
          {erro && <pre className="m-3 whitespace-pre-wrap rounded-lg border border-red-500/30 bg-red-500/10 p-3 font-mono text-[12.5px] text-red-700 dark:text-red-300">{erro}</pre>}
          {!erro && !res && <p className="p-6 text-sm text-muted-foreground">Escolha um modelo ou escreva uma consulta e aperte ⌘↵ (Ctrl+Enter). Selecione um trecho para rodar só ele.</p>}
          {res && (res.linhas.length ? <Grade colunas={res.colunas} linhas={res.linhas} /> : <p className="p-6 text-sm text-muted-foreground">A consulta rodou e não devolveu linhas.</p>)}
        </div>
      </div>
    </div>
  )
}
