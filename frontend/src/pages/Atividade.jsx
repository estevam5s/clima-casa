import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, BarChart3, Bot, CalendarClock, Download, FileJson, ListTree, Mic, MonitorSmartphone, Music2, RefreshCw, Search, Settings2, Sparkles, Workflow, X } from 'lucide-react'
import { api, rotuloOrigem } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Esqueleto, FaixaMetricas, Interruptor, Selo } from '../components/ui'

// Atividade: tudo o que aconteceu (comandos, Alexa, agenda, automações, música, sistema), com linha do tempo
// filtrável (período, origem, aparelho, falhas, busca no servidor), detalhe de cada registro, exportação e análise.
const ORIGENS = [['', 'Todas'], ['painel', 'Painel e app'], ['sinric', 'Alexa/Google'], ['alexa', 'Skill própria'], ['agenda', 'Agenda'], ['cena', 'Cenas'], ['automacao', 'Automações'], ['musica', 'Música'], ['agente', 'Agente'], ['sistema', 'Sistema']]
const ICONE = { painel: MonitorSmartphone, alexa: Mic, sinric: Mic, agenda: CalendarClock, cena: Sparkles, automacao: Workflow, agente: Bot, sistema: Settings2, musica: Music2 }
const PERIODOS = [['', 'Tudo'], ['1', '24 h'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']]
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function dia(ts) {
  const d = new Date(ts * 1000), hoje = new Date(), ontem = new Date(Date.now() - 86400000)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const baixar = (nome, tipo, texto) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href) }

function Analise({ filtro }) {
  const [dias, setDias] = useState(7)
  const [d, setD] = useState(null)
  useEffect(() => {
    setD(null)
    const p = new URLSearchParams({ dias })
    if (filtro.origem) p.set('origem', filtro.origem)
    if (filtro.aparelho_id) p.set('aparelho_id', filtro.aparelho_id)
    api.get(`/api/atividade/analise?${p}`).then(setD).catch(() => setD(false))
  }, [dias, filtro.origem, filtro.aparelho_id])
  if (d === false) return <Aviso>Não deu para carregar a análise.</Aviso>
  const maxMapa = d ? Math.max(1, ...d.mapa.map((m) => m.n)) : 1
  const cel = (dow, h) => d?.mapa.find((m) => m.dow === dow && m.hora === h)?.n || 0
  return (
    <div className="space-y-6">
      <div className="flex w-fit rounded-lg border border-border bg-card p-0.5 text-sm">{[1, 7, 30, 90].map((x) => <button key={x} onClick={() => setDias(x)} className={`rounded-md px-3 py-1.5 ${dias === x ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{x === 1 ? '24 h' : `${x} dias`}</button>)}</div>
      {!d ? <Esqueleto className="h-96" /> : (<>
        <FaixaMetricas itens={[
          { rotulo: 'Registros', valor: d.total, dica: `nos últimos ${d.dias === 1 ? '24 h' : `${d.dias} dias`}` },
          { rotulo: 'Sucesso', valor: d.sucesso_pct ?? 0, sufixo: '%', tom: d.falhas ? 'ruim' : 'bom', dica: d.falhas ? `${d.falhas} falha(s)` : 'nenhuma falha' },
          { rotulo: 'Origem que mais usa', valor: d.por_origem[0] ? rotuloOrigem(d.por_origem[0].origem) : '—', dica: d.por_origem[0] ? `${d.por_origem[0].total} registro(s)` : '' },
          { rotulo: 'Ação mais comum', valor: d.acoes[0]?.acao?.slice(0, 22) || '—', dica: d.acoes[0] ? `${d.acoes[0].total}×` : '' },
        ]} />
        {d.falhas_comuns.length > 0 && (
          <section className="cartao">
            <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Falhas mais comuns e o que fazer</h2></div>
            <ul className="divide-y divide-border">{d.falhas_comuns.map((f) => (
              <li key={f.motivo} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{f.motivo}</p><p className="text-xs text-muted-foreground">{f.total}× · última {new Date(f.ultima * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{f.dica ? ` · ${f.dica}` : ''}</p></div>
                {f.link && <Link to={f.link} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Resolver<ArrowRight className="h-3.5 w-3.5" /></Link>}
              </li>
            ))}</ul>
          </section>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-2">Por dia</h2>
            <div className="h-56"><ResponsiveContainer><BarChart data={d.por_dia.map((x) => ({ ...x, ok: x.total - (x.falhas || 0), rot: x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) }))} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="rot" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="ok" name="Certo" stackId="a" fill="hsl(var(--primary))" /><Bar dataKey="falhas" name="Falhou" stackId="a" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-1">Hora × dia da semana</h2>
            <p className="mb-3 text-xs text-muted-foreground">Quanto mais forte, mais registros naquela hora (Brasília)</p>
            <div className="overflow-x-auto"><table className="text-[10px] text-muted-foreground"><tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <tr key={dow}><td className="pr-1.5">{DIAS[dow]}</td>{Array.from({ length: 24 }, (_, h) => { const n = cel(dow, h); return <td key={h} className="p-[1.5px]"><div title={`${DIAS[dow]} ${h}h: ${n}`} className="h-4 w-4 rounded-[3px]" style={{ background: n ? `hsl(var(--primary) / ${0.15 + (n / maxMapa) * 0.85})` : 'hsl(var(--muted))' }} /></td> })}</tr>
              ))}
              <tr><td />{Array.from({ length: 24 }, (_, h) => <td key={h} className="text-center">{h % 6 === 0 ? h : ''}</td>)}</tr>
            </tbody></table></div>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-3">Por origem</h2>
            <ul className="space-y-2">{d.por_origem.map((o) => { const pct = (o.total / Math.max(1, d.total)) * 100; return (
              <li key={o.origem} className="text-sm"><div className="flex justify-between"><span>{rotuloOrigem(o.origem)}</span><span className="tabular text-muted-foreground">{o.total}{o.falhas ? ` · ${o.falhas} falha(s)` : ''}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></li>
            ) })}</ul>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-3">Por aparelho e ações</h2>
            <ul className="mb-4 space-y-1.5 text-sm">{d.por_aparelho.map((a) => <li key={a.nome} className="flex justify-between"><span className="truncate">{a.nome}</span><span className="tabular text-muted-foreground">{a.total}{a.falhas ? ` · ${a.falhas} falha${a.falhas > 1 ? 's' : ''}` : ''}</span></li>)}</ul>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Ações mais comuns</p>
            <ul className="space-y-1 text-sm">{d.acoes.map((a) => <li key={a.acao} className="flex justify-between gap-2"><span className="truncate">{a.acao}</span><span className="tabular text-muted-foreground">{a.total}</span></li>)}</ul>
          </section>
        </div>
      </>)}
    </div>
  )
}

export default function Atividade() {
  const [aba, setAba] = useState('linha')
  const [filtro, setFiltro] = useState({ origem: '', aparelho_id: '', falhas: false, periodo: '' })
  const [itens, setItens] = useState(null)
  const [aparelhos, setAparelhos] = useState([])
  const [busca, setBusca] = useState(''), [buscaAtiva, setBuscaAtiva] = useState('')
  const [fim, setFim] = useState(false)
  const [aoVivo, setAoVivo] = useState(true)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(null)
  useEffect(() => { const t = setTimeout(() => setBuscaAtiva(busca.trim()), 350); return () => clearTimeout(t) }, [busca])

  const url = useCallback((antes) => {
    const p = new URLSearchParams({ limite: 150 })
    if (filtro.origem) p.set('origem', filtro.origem)
    if (filtro.aparelho_id) p.set('aparelho_id', filtro.aparelho_id)
    if (filtro.falhas) p.set('falhas', 'true')
    if (filtro.periodo) p.set('de', String(Math.floor(Date.now() / 1000) - +filtro.periodo * 86400))
    if (buscaAtiva) p.set('q', buscaAtiva)
    if (antes) p.set('antes', antes)
    return `/api/atividade?${p}`
  }, [filtro, buscaAtiva])

  useEffect(() => { api.get('/api/aparelhos').then(setAparelhos).catch(() => {}) }, [])
  useEffect(() => { setItens(null); api.get(url()).then((l) => { setItens(l); setFim(l.length < 150) }).catch((e) => setErro(e.message)) }, [url])
  useEffect(() => { // ao vivo: o que chegou de novo a cada 15 s
    if (!aoVivo || aba !== 'linha') return undefined
    const t = setInterval(() => { if (!document.hidden) api.get(url()).then((novos) => setItens((atual) => { if (!atual) return novos; const ids = new Set(atual.map((x) => x.id)); return [...novos.filter((x) => !ids.has(x.id)), ...atual] })).catch(() => {}) }, 15000)
    return () => clearInterval(t)
  }, [aoVivo, url, aba])

  const visiveis = itens || []
  const grupos = useMemo(() => { const g = []; for (const t of visiveis) { const d = dia(t.quando); if (!g.length || g[g.length - 1].dia !== d) g.push({ dia: d, itens: [] }); g[g.length - 1].itens.push(t) } return g }, [visiveis])
  const mais = async () => { const l = await api.get(url(itens[itens.length - 1].id)); setItens([...itens, ...l]); setFim(l.length < 150) }
  const nomeArq = (ext) => `clima-escritorio-atividade-${new Date().toISOString().slice(0, 10)}.${ext}`
  const exportarCsv = () => {
    const linhas = [['quando', 'aparelho', 'acao', 'origem', 'resultado', 'detalhe'], ...visiveis.map((t) => [new Date(t.quando * 1000).toISOString(), t.aparelho_nome || '', t.acao, rotuloOrigem(t.origem), t.ok ? 'ok' : 'falhou', t.detalhe || ''])]
    baixar(nomeArq('csv'), 'text/csv;charset=utf-8', '﻿' + linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\n'))
  }
  const exportarJson = () => baixar(nomeArq('json'), 'application/json', JSON.stringify(visiveis.map((t) => ({ ...t, quando_iso: new Date(t.quando * 1000).toISOString() })), null, 2))
  const total = visiveis.length, falhas = visiveis.filter((t) => !t.ok).length
  const porOrigem = visiveis.reduce((m, t) => { const o = t.origem.split(':')[0]; m[o] = (m[o] || 0) + 1; return m }, {})
  const principal = Object.entries(porOrigem).sort((a, b) => b[1] - a[1])[0]
  const filtrado = filtro.origem || filtro.aparelho_id || filtro.falhas || filtro.periodo || buscaAtiva

  return (
    <div className="w-full">
      <Cabecalho titulo="Atividade" descricao="Tudo o que aconteceu: cada comando, quem pediu (painel, Alexa, agenda, automação, música) e se deu certo."
        acoes={<>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"><RefreshCw className={`h-3.5 w-3.5 ${aoVivo ? 'animate-spin text-primary [animation-duration:3s]' : 'text-muted-foreground'}`} /> Ao vivo<Interruptor ligado={aoVivo} onChange={setAoVivo} rotulo="Atualizar ao vivo" /></label>
          <Botao variante="secundario" icone={Download} disabled={!total} onClick={exportarCsv}>CSV</Botao>
          <Botao variante="secundario" icone={FileJson} disabled={!total} onClick={exportarJson}>JSON</Botao>
        </>} />

      <div className="mb-5 flex gap-1 border-b border-border">
        {[['linha', 'Linha do tempo', ListTree], ['analise', 'Análise', BarChart3]].map(([k, n, I]) => <button key={k} onClick={() => setAba(k)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{n}</button>)}
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {aba === 'linha' && <div className="relative lg:w-72"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className="campo pl-9" placeholder="Buscar em tudo (ação, aparelho, detalhe)" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />{busca && <button onClick={() => setBusca('')} className="absolute right-2 top-2.5 rounded p-0.5 text-muted-foreground" aria-label="Limpar busca"><X className="h-4 w-4" /></button>}</div>}
          {aba === 'linha' && <div className="flex w-fit rounded-lg border border-border bg-card p-0.5 text-xs">{PERIODOS.map(([k, n]) => <button key={k} onClick={() => setFiltro({ ...filtro, periodo: k })} className={`rounded-md px-2.5 py-1.5 ${filtro.periodo === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>}
          <div className="flex items-center gap-3 lg:ml-auto">
            <select className="campo w-auto" value={filtro.aparelho_id} onChange={(e) => setFiltro({ ...filtro, aparelho_id: e.target.value })} aria-label="Aparelho"><option value="">Todos os aparelhos</option>{aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
            {aba === 'linha' && <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={filtro.falhas} onChange={(e) => setFiltro({ ...filtro, falhas: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Só falhas</label>}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">{ORIGENS.map(([k, r]) => <button key={k} onClick={() => setFiltro({ ...filtro, origem: k })} className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro.origem === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{r}</button>)}</div>
      </div>

      {aba === 'analise' ? <Analise filtro={filtro} /> : (<>
        <FaixaMetricas itens={[
          { rotulo: 'Registros carregados', valor: total, dica: filtrado ? 'com os filtros atuais' : 'mais recentes primeiro' },
          { rotulo: 'Sucesso', valor: total ? Math.round(((total - falhas) / total) * 100) : 0, sufixo: '%', tom: falhas ? 'ruim' : 'bom', dica: falhas ? `${falhas} falha(s)` : 'nenhuma falha' },
          { rotulo: 'Origem mais comum', valor: principal ? rotuloOrigem(principal[0]) : '—', dica: principal ? `${principal[1]} registro(s)` : '' },
          { rotulo: 'Aparelhos envolvidos', valor: new Set(visiveis.map((t) => t.aparelho_id).filter(Boolean)).size },
        ]} />
        <div className="mt-5">
          {erro && <Aviso>{erro}</Aviso>}
          {!itens ? <Carregando /> : grupos.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado{buscaAtiva ? ` para “${buscaAtiva}”` : ''}.</p> : (
            <div className="space-y-6">
              {grupos.map((g) => (
                <section key={g.dia}>
                  <h2 className="sticky top-16 z-10 mb-2 bg-background/90 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur first-letter:uppercase">{g.dia} · {g.itens.length}</h2>
                  <ol className="relative ml-4 border-l border-border">
                    <AnimatePresence initial={false}>
                      {g.itens.map((t) => { const I = ICONE[t.origem.split(':')[0]] || Settings2; return (
                        <motion.li key={t.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="relative mb-1 pl-6">
                          <span className={`absolute -left-[13px] top-2.5 flex h-6 w-6 items-center justify-center rounded-full border bg-card ${t.ok ? 'border-border text-muted-foreground' : 'border-red-300 text-red-600 dark:border-red-900 dark:text-red-400'}`}><I className="h-3 w-3" /></span>
                          <button onClick={() => setAberto(t)} className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-3">
                            <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">{new Date(t.quando * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                            <div className="min-w-0 flex-1"><p className="text-sm">{t.aparelho_nome && <span className="font-medium">{t.aparelho_nome}: </span>}{t.acao}</p>{t.detalhe && <p className="truncate text-xs text-muted-foreground">{t.detalhe}</p>}</div>
                            <span className="text-xs text-muted-foreground">{rotuloOrigem(t.origem)}</span>
                            {!t.ok && <Selo cor="vermelho">Falhou</Selo>}
                          </button>
                        </motion.li>
                      ) })}
                    </AnimatePresence>
                  </ol>
                </section>
              ))}
              {!fim && <div className="text-center"><Botao variante="secundario" onClick={mais}>Carregar mais</Botao></div>}
            </div>
          )}
        </div>
      </>)}

      {aberto && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) setAberto(null) }}>
          <aside className="h-full w-full max-w-md overflow-auto border-l border-border bg-card p-5 shadow-xl"> {/* marca: painel lateral flutua */}
            <div className="mb-4 flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">Registro #{aberto.id}</p><h2 className="text-base font-semibold">{aberto.acao}</h2></div><button onClick={() => setAberto(null)} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button></div>
            <dl className="space-y-3 text-sm">
              {[['Quando', new Date(aberto.quando * 1000).toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' })], ['Resultado', aberto.ok ? 'Deu certo' : 'Falhou'], ['Origem', `${rotuloOrigem(aberto.origem)} (${aberto.origem})`], ['Aparelho', aberto.aparelho_nome || '—'], ['Detalhe', aberto.detalhe || '—']].map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="mt-0.5 whitespace-pre-wrap break-words">{v}</dd></div>)}
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {aberto.aparelho_id && <Link to={`/aparelhos/${aberto.aparelho_id}`} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Abrir o aparelho<ArrowRight className="h-3.5 w-3.5" /></Link>}
              <button onClick={() => { setFiltro({ ...filtro, origem: aberto.origem.split(':')[0] }); setAberto(null) }} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Ver só esta origem</button>
              <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(aberto, null, 2))} className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Copiar JSON</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
