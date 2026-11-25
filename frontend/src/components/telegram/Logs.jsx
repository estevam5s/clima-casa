import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Download, RefreshCw, Search, Timer, X } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Modal, Vazio, useDados } from '../ui'

// Logs do bot do Telegram (dono/admin): uso por pessoa, comandos e botões mais usados, erros capturados,
// tempo de resposta e cada interação. Vem de telegram_eventos (o PIN nunca é gravado).
const TIPOS = { comando: 'Comando', clique: 'Botão', ia: 'Texto livre (IA)', erro: 'Erro', negado: 'Negado', flood: 'Excesso', bloqueado: 'Bloqueado', vinculo: 'Vínculo',
  pin_ok: 'PIN certo', pin_errado: 'PIN errado', pin_pedido: 'PIN pedido', identidade: 'Outro Telegram', injecao: 'Texto suspeito', expirado: 'Vínculo expirado' }
const hora = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const seg = (ms) => (ms == null ? '-' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`)
const tooltip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

function baixar(nome, tipo, texto) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href)
}
const celula = (v) => { const t = String(v ?? ''); return /^[=+\-@]/.test(t) ? `'${t}` : t }

export default function LogsTelegram() {
  const [dias, setDias] = useState(7)
  const [pessoa, setPessoa] = useState('')
  const [tipo, setTipo] = useState('')
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [soErros, setSoErros] = useState(false)
  const [ver, setVer] = useState(null)
  const qs = new URLSearchParams({ dias, limite: 300, ...(pessoa && { pessoa }), ...(tipo && { tipo }), ...(busca && { q: busca }), ...(soErros && { so_erros: 'true' }) })
  const { dados: d, erro, recarregar } = useDados(() => api.get(`/api/telegram/logs?${qs}`), [qs.toString()])
  const serie = useMemo(() => (d?.por_dia || []).map((x) => ({ ...x, ok: x.total - (x.erros || 0), rot: `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}` })), [d])
  const horas = useMemo(() => Array.from({ length: 24 }, (_, h) => ({ h: `${String(h).padStart(2, '0')}h`, n: d?.por_hora?.find((x) => x.hora === h)?.n || 0 })), [d])
  if (erro) return <Aviso>{erro}</Aviso>
  const r = d?.resumo
  const exportar = (fmt) => {
    if (!d) return
    if (fmt === 'json') return baixar(`telegram-logs-${dias}d.json`, 'application/json', JSON.stringify(d.eventos, null, 1))
    const cab = ['quando', 'pessoa', 'tipo', 'texto', 'ok', 'tempo_ms', 'erro']
    const linhas = d.eventos.map((e) => [hora(e.quando), e.usuario_nome || e.username || e.chat, TIPOS[e.tipo] || e.tipo, e.texto, e.ok ? 'sim' : 'não', e.ms ?? '', e.erro || ''].map((v) => `"${celula(v).replace(/"/g, '""')}"`).join(';'))
    baixar(`telegram-logs-${dias}d.csv`, 'text/csv;charset=utf-8', '﻿' + [cab.join(';'), ...linhas].join('\n'))
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{[1, 7, 30, 90].map((x) => <button key={x} onClick={() => setDias(x)} className={`rounded-md px-3 py-1.5 ${dias === x ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{x === 1 ? '24 h' : `${x} dias`}</button>)}</div>
        <select className="campo h-9 w-auto" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa">
          <option value="">Todas as pessoas</option>{(d?.pessoas || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="campo h-9 w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
          <option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <form onSubmit={(e) => { e.preventDefault(); setBusca(q.trim()) }} className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" autoComplete="off" className="campo h-9 pl-8" placeholder="Procurar comando, texto ou erro" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar nos logs" />
        </form>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={soErros} onChange={(e) => setSoErros(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Só erros</label>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao>
        <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => exportar('csv')}>CSV</Botao>
        <Botao tamanho="sm" variante="fantasma" onClick={() => exportar('json')}>JSON</Botao>
      </div>

      {!d ? <Esqueleto className="h-96" /> : (<>
        <FaixaMetricas itens={[
          { rotulo: 'Interações', valor: r.total, dica: `${r.conversas} conversa(s), ${r.pessoas} pessoa(s)` },
          { rotulo: 'Erros capturados', valor: r.erros, tom: r.erros ? 'ruim' : 'bom', dica: r.erros ? 'viram bug automático' : 'nenhum erro de código' },
          { rotulo: 'Negados', valor: r.negados, dica: 'sem vínculo, PIN, limite ou permissão' },
          { rotulo: 'Resposta média', valor: seg(r.ms_medio), dica: r.ms_p95 != null ? `95% em até ${seg(r.ms_p95)}` : 'medido desde a 0.6.9' },
        ]} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-2">Por dia</h2>
            {serie.length ? <div className="h-52"><ResponsiveContainer><BarChart data={serie} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="rot" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={tooltip} />
              <Bar dataKey="ok" name="Sem erro" stackId="a" fill="hsl(var(--primary))" /><Bar dataKey="erros" name="Erro" stackId="a" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">Sem uso no período.</p>}
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-2">Por hora (Brasília)</h2>
            <div className="h-52"><ResponsiveContainer><BarChart data={horas} margin={{ left: -18, right: 6 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="h" tickLine={false} axisLine={false} fontSize={10} interval={2} stroke="hsl(var(--muted-foreground))" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={tooltip} /><Bar dataKey="n" name="Interações" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
          </section>
        </div>

        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Uso por pessoa</h2></div>
          {d.por_pessoa.length ? <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">{['Pessoa', 'Total', 'Comandos', 'Botões', 'IA', 'Erros', 'Negados', 'Resposta média', 'Último uso'].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{d.por_pessoa.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setPessoa(p.id)} title="Filtrar por esta pessoa">
                <td className="px-4 py-2 font-medium">{p.nome}</td><td className="tabular px-4 py-2">{p.total}</td><td className="tabular px-4 py-2">{p.comandos}</td><td className="tabular px-4 py-2">{p.cliques}</td>
                <td className="tabular px-4 py-2">{p.ia}</td><td className={`tabular px-4 py-2 ${p.erros ? 'text-red-600 dark:text-red-400' : ''}`}>{p.erros}</td><td className="tabular px-4 py-2">{p.falhas - p.erros}</td>
                <td className="tabular px-4 py-2">{seg(p.ms_medio)}</td><td className="px-4 py-2 text-muted-foreground">{hora(p.ultimo)}</td>
              </tr>))}</tbody>
          </table></div> : <div className="p-5"><Vazio titulo="Ninguém usou o bot no período" /></div>}
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-3">Comandos mais usados</h2>
            <ul className="space-y-1.5 text-sm">{d.comandos.map((c) => <li key={c.comando} className="flex justify-between gap-2"><code className="truncate text-primary">{c.comando}</code><span className="tabular shrink-0 text-muted-foreground">{c.n}{c.falhas ? ` · ${c.falhas} falha(s)` : ''}</span></li>)}
              {!d.comandos.length && <li className="text-muted-foreground">Nenhum comando digitado.</li>}</ul>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-3">Botões mais tocados</h2>
            <ul className="space-y-1.5 text-sm">{d.cliques.map((c) => <li key={c.botao} className="flex justify-between gap-2"><code className="truncate">{c.botao}</code><span className="tabular text-muted-foreground">{c.n}</span></li>)}
              {!d.cliques.length && <li className="text-muted-foreground">Nenhum botão tocado.</li>}</ul>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao mb-3 flex items-center gap-2"><Timer className="h-4 w-4" />Respostas mais lentas</h2>
            <ul className="space-y-1.5 text-sm">{d.lentos.map((c, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{c.texto}</span><span className="tabular shrink-0 text-muted-foreground">{seg(c.ms)}</span></li>)}
              {!d.lentos.length && <li className="text-muted-foreground">Sem medições no período.</li>}</ul>
          </section>
        </div>

        <section className="cartao overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3"><AlertTriangle className="h-4 w-4 text-amber-500" /><h2 className="titulo-secao">Erros capturados</h2></div>
          {d.erros.length ? <ul className="divide-y divide-border">{d.erros.map((e) => (
            <li key={e.id} className="cursor-pointer px-5 py-3 hover:bg-muted/40" onClick={() => setVer(e)}>
              <p className="text-sm"><b className="font-medium">{e.usuario_nome || e.username}</b> <code className="text-xs">{e.texto}</code> <span className="text-xs text-muted-foreground">{hora(e.quando)} · {seg(e.ms)}</span></p>
              <p className="mt-0.5 truncate font-mono text-xs text-red-600 dark:text-red-400">{e.erro}</p>
            </li>))}</ul> : <p className="px-5 py-4 text-sm text-muted-foreground">Nenhum erro no período. Erros de código viram bug automático em Bugs.</p>}
        </section>

        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Cada interação ({d.eventos.length})</h2></div>
          <div className="max-h-[32rem] overflow-auto"><table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground"><tr className="border-b border-border">{['Quando', 'Pessoa', 'Tipo', 'O que', 'Tempo', ''].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">{d.eventos.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setVer(e)}>
                <td className="whitespace-nowrap px-4 py-1.5 text-muted-foreground">{hora(e.quando)}</td><td className="px-4 py-1.5">{e.usuario_nome || e.username || e.chat}</td>
                <td className="px-4 py-1.5">{TIPOS[e.tipo] || e.tipo}</td><td className="max-w-[22rem] truncate px-4 py-1.5 font-mono text-xs">{e.texto}</td>
                <td className="tabular px-4 py-1.5">{seg(e.ms)}</td><td className="px-4 py-1.5">{e.ok ? <span className="text-emerald-600">ok</span> : <span className="text-red-600 dark:text-red-400">falhou</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </section>
      </>)}

      {ver && (
        <Modal aberto titulo="Interação com o bot" onFechar={() => setVer(null)}>
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Quando</dt><dd>{hora(ver.quando)}</dd>
            <dt className="text-muted-foreground">Pessoa</dt><dd>{ver.usuario_nome || '-'} {ver.username ? `(@${ver.username})` : ''}</dd>
            <dt className="text-muted-foreground">Conversa</dt><dd className="font-mono text-xs">{ver.chat}</dd>
            <dt className="text-muted-foreground">Tipo</dt><dd>{TIPOS[ver.tipo] || ver.tipo}</dd>
            <dt className="text-muted-foreground">Texto</dt><dd className="break-words font-mono text-xs">{ver.texto || '-'}</dd>
            <dt className="text-muted-foreground">Resultado</dt><dd>{ver.ok ? 'Respondeu' : 'Falhou'} · {seg(ver.ms)}</dd>
            {ver.erro && <><dt className="text-muted-foreground">Erro</dt><dd className="whitespace-pre-wrap break-words font-mono text-xs text-red-600 dark:text-red-400">{ver.erro}</dd></>}
          </dl>
          <div className="mt-4 flex justify-end"><Botao variante="secundario" icone={X} onClick={() => setVer(null)}>Fechar</Botao></div>
        </Modal>
      )}
    </div>
  )
}
