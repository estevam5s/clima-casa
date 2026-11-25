import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, useDados } from '../ui'
import { ACOES, DetalheLog, ItemLog, TabelaAcoes, exportarLogs, useLinhaLogs } from '../logs/Comum'

// Abas extras da Atividade: por pessoa, por sala, por ar, mudanças nos ares (ligou/subiu/baixou…) e comparar períodos.
// Tudo respeita os projetos e ares de quem está olhando (o servidor filtra).
const PERIODOS = [[1, '24 h'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const tooltip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

function Periodo({ dias, setDias }) {
  return <div className="flex w-fit rounded-lg border border-border bg-card p-0.5 text-sm">{PERIODOS.map(([x, r]) => <button key={x} onClick={() => setDias(x)} className={`rounded-md px-3 py-1.5 ${dias === x ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{r}</button>)}</div>
}

function Grafico({ linhas }) {
  const dados = linhas.slice(0, 10).map((l) => ({ nome: l.nome.length > 18 ? `${l.nome.slice(0, 17)}…` : l.nome, ...Object.fromEntries(ACOES.slice(0, 4).map(([k]) => [k, l[k] || 0])) }))
  if (!dados.length) return null
  const cores = { ligou: '#059669', desligou: '#71717a', subiu: '#ea580c', baixou: '#0284c7' }
  return (
    <div className="h-72"><ResponsiveContainer><BarChart data={dados} margin={{ left: -18, right: 6 }}>
      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="nome" tickLine={false} axisLine={false} fontSize={11} interval={0} angle={-15} height={50} textAnchor="end" stroke="hsl(var(--muted-foreground))" />
      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
      <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={tooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
      {ACOES.slice(0, 4).map(([k, r]) => <Bar key={k} dataKey={k} name={r} stackId="a" fill={cores[k]} />)}
    </BarChart></ResponsiveContainer></div>
  )
}

export function PorGrupo({ tipo }) {
  const [dias, setDias] = useState(7)
  const [escolhido, setEscolhido] = useState(null)
  const { dados: d, erro } = useDados(() => api.get(`/api/atividade/pessoas?dias=${dias}`), [dias])
  const chave = { pessoas: 'pessoas', salas: 'salas', ares: 'ares' }[tipo]
  const rotulo = { pessoas: 'Pessoa', salas: 'Sala', ares: 'Ar' }[tipo]
  if (erro) return <Aviso>{erro}</Aviso>
  const linhas = d?.[chave] || []
  const filtro = escolhido ? (tipo === 'pessoas' ? (String(escolhido.id).startsWith('origem:') ? { origem: escolhido.id.slice(7) } : { pessoa: escolhido.id }) : tipo === 'salas' ? { sala: escolhido.id || '' } : { aparelho: escolhido.id }) : null
  return (
    <div className="space-y-6">
      <Periodo dias={dias} setDias={(x) => { setDias(x); setEscolhido(null) }} />
      {!d ? <Esqueleto className="h-80" /> : (<>
        <FaixaMetricas itens={[
          { rotulo: 'Comandos nos ares', valor: d.totais.atividade.ares, dica: `de ${d.totais.atividade.total} registros` },
          { rotulo: `${rotulo}s com uso`, valor: linhas.length },
          { rotulo: 'Ligou / desligou', valor: `${linhas.reduce((s, l) => s + (l.ligou || 0), 0)} / ${linhas.reduce((s, l) => s + (l.desligou || 0), 0)}` },
          { rotulo: 'Subiu / baixou temp.', valor: `${linhas.reduce((s, l) => s + (l.subiu || 0), 0)} / ${linhas.reduce((s, l) => s + (l.baixou || 0), 0)}` },
        ]} />
        <section className="cartao p-5"><h2 className="titulo-secao mb-2">O que mudou nos ares, por {rotulo.toLowerCase()}</h2><Grafico linhas={linhas} /></section>
        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Por {rotulo.toLowerCase()}</h2>
            <p className="text-xs text-muted-foreground">Toque numa linha para ver cada ação. {tipo === 'pessoas' && 'A pessoa é registrada a partir da versão 0.6.9; antes disso aparece a origem (painel, Alexa, agenda).'}</p></div>
          <TabelaAcoes linhas={linhas} rotulo={rotulo} aoEscolher={setEscolhido} />
        </section>
        {filtro && <Linha key={JSON.stringify(filtro)} titulo={`Ações: ${escolhido.nome}`} dias={dias} filtro={filtro} />}
      </>)}
    </div>
  )
}

function Linha({ titulo, dias, filtro = {} }) {
  const [ver, setVer] = useState(null)
  const { itens, mais, erro, carregando, carregarMais } = useLinhaLogs('/api/atividade/linha', { dias, limite: 100, ...filtro })
  return (
    <section className="cartao overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="titulo-secao">{titulo}</h2>
        <Botao tamanho="sm" variante="secundario" icone={Download} disabled={!itens?.length} onClick={() => exportarLogs(itens, 'atividade', 'csv')}>CSV</Botao>
      </div>
      {erro && <div className="p-4"><Aviso>{erro}</Aviso></div>}
      {!itens ? <div className="p-4"><Esqueleto className="h-40" /></div> : itens.length ? (
        <>
          <ul className="divide-y divide-border">{itens.map((r) => <ItemLog key={r.id} r={r} aoAbrir={setVer} />)}</ul>
          {mais && <div className="border-t border-border p-3 text-center"><Botao tamanho="sm" variante="secundario" carregando={carregando} onClick={carregarMais}>Carregar mais</Botao></div>}
        </>
      ) : <p className="p-5 text-sm text-muted-foreground">Nada no período.</p>}
      <DetalheLog r={ver} aoFechar={() => setVer(null)} />
    </section>
  )
}

export function Mudancas() {
  const [dias, setDias] = useState(7)
  const [tipo, setTipo] = useState('')
  const { itens } = useLinhaLogs('/api/atividade/linha', { dias, so_ares: true, limite: 400 })
  const lista = useMemo(() => (itens || []).filter((r) => !tipo || r.acao_ar === tipo), [itens, tipo])
  const [ver, setVer] = useState(null)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Periodo dias={dias} setDias={setDias} />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setTipo('')} className={`rounded-full border px-3 py-1 text-xs ${!tipo ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>Todas</button>
          {ACOES.map(([k, r, I, cor]) => <button key={k} onClick={() => setTipo(k)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${tipo === k ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground'}`}><I className={`h-3 w-3 ${cor}`} />{r} ({(itens || []).filter((x) => x.acao_ar === k).length})</button>)}
        </div>
      </div>
      <section className="cartao overflow-hidden">
        {!itens ? <div className="p-4"><Esqueleto className="h-64" /></div> : lista.length ? <ul className="divide-y divide-border">{lista.map((r) => <ItemLog key={r.id} r={r} aoAbrir={setVer} />)}</ul> : <p className="p-5 text-sm text-muted-foreground">Nenhuma mudança desse tipo no período.</p>}
      </section>
      <p className="text-xs text-muted-foreground">Cada comando é comparado com o estado anterior do mesmo ar. “Junto” = o ar mudou porque está na mesma zona de outro (o sinal infravermelho chega aos dois).</p>
      <DetalheLog r={ver} aoFechar={() => setVer(null)} />
    </div>
  )
}

export function Comparar() {
  const [dias, setDias] = useState(7)
  const agora = Math.floor(Date.now() / 1000)
  const { dados: atual } = useDados(() => api.get(`/api/atividade/pessoas?de=${agora - dias * 86400}&ate=${agora}`), [dias])
  const { dados: antes } = useDados(() => api.get(`/api/atividade/pessoas?de=${agora - 2 * dias * 86400}&ate=${agora - dias * 86400}`), [dias])
  const soma = (d, k) => (d?.pessoas || []).reduce((s, l) => s + (l[k] || 0), 0)
  const linhas = [['Registros', (d) => d?.totais.atividade.total], ['Comandos nos ares', (d) => d?.totais.atividade.ares], ['Falhas', (d) => d?.totais.atividade.falhas],
    ...ACOES.map(([k, r]) => [r, (d) => soma(d, k)])]
  const salas = useMemo(() => {
    const m = {}
    for (const s of antes?.salas || []) m[s.nome] = { nome: s.nome, antes: s.total, agora: 0 }
    for (const s of atual?.salas || []) m[s.nome] = { ...(m[s.nome] || { nome: s.nome, antes: 0 }), agora: s.total }
    return Object.values(m).sort((a, b) => b.agora - a.agora)
  }, [atual, antes])
  const Var = ({ a, b }) => {
    if (b == null || a == null) return null
    const d = a - b
    const I = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : Minus
    return <span className={`inline-flex items-center gap-0.5 text-xs ${d > 0 ? 'text-orange-600 dark:text-orange-400' : d < 0 ? 'text-sky-600 dark:text-sky-400' : 'text-muted-foreground'}`}><I className="h-3 w-3" />{b ? `${Math.round((d / b) * 100)}%` : d ? 'novo' : '0%'}</span>
  }
  return (
    <div className="space-y-6">
      <Periodo dias={dias} setDias={setDias} />
      {!atual || !antes ? <Esqueleto className="h-64" /> : (<>
        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Últimos {dias === 1 ? '24 h' : `${dias} dias`} × o período anterior do mesmo tamanho</h2></div>
          <table className="w-full text-sm"><thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border"><th className="px-5 py-2 font-medium">Item</th><th className="px-3 py-2 font-medium">Agora</th><th className="px-3 py-2 font-medium">Antes</th><th className="px-3 py-2 font-medium">Variação</th></tr></thead>
            <tbody className="divide-y divide-border">{linhas.map(([r, f]) => <tr key={r}><td className="px-5 py-2">{r}</td><td className="tabular px-3 py-2 font-medium">{f(atual) ?? 0}</td><td className="tabular px-3 py-2 text-muted-foreground">{f(antes) ?? 0}</td><td className="px-3 py-2"><Var a={f(atual) ?? 0} b={f(antes) ?? 0} /></td></tr>)}</tbody></table>
        </section>
        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Comandos nos ares por sala</h2></div>
          <table className="w-full text-sm"><tbody className="divide-y divide-border">{salas.map((s) => <tr key={s.nome}><td className="px-5 py-2">{s.nome}</td><td className="tabular px-3 py-2 font-medium">{s.agora}</td><td className="tabular px-3 py-2 text-muted-foreground">{s.antes}</td><td className="px-3 py-2"><Var a={s.agora} b={s.antes} /></td></tr>)}
            {!salas.length && <tr><td className="px-5 py-3 text-muted-foreground">Sem comandos nos dois períodos.</td></tr>}</tbody></table>
        </section>
      </>)}
    </div>
  )
}
