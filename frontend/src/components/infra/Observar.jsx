import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CheckCircle2, CircleMinus, Gauge, RefreshCw, XCircle } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Carregando, Esqueleto, FaixaMetricas, Selo, useDados } from '../ui'

// Infra → Monitor da API, Integrações e Limites (backend/app/infra_extra.py). Tudo na nuvem, sem o agente.
const hora = (t, longo) => new Date(t * 1000).toLocaleString('pt-BR', longo ? { day: '2-digit', month: '2-digit', hour: '2-digit' } : { hour: '2-digit', minute: '2-digit' })
const ms = (v) => (v == null ? '-' : v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` : `${v} ms`)

export function MonitorApi() {
  const [horas, setHoras] = useState(24)
  const { dados: d, erro, recarregar } = useDados(() => api.get(`/api/infra/monitor?horas=${horas}`), [horas])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Esqueleto className="h-96" />
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Tempo de resposta e erros da API do sistema, medidos no navegador de quem usa (1 em cada 5 chamadas e todas as que falham). {d.amostras} medições.</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">{[[24, '24 h'], [72, '3 dias'], [168, '7 dias']].map(([h, r]) => <button key={h} onClick={() => setHoras(h)} className={`rounded-md px-2.5 py-1 text-sm ${horas === h ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{r}</button>)}</div>
          <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao>
        </div>
      </div>
      <FaixaMetricas itens={[
        { rotulo: 'Mediana (p50)', valor: ms(d.p50) }, { rotulo: '95% abaixo de (p95)', valor: ms(d.p95) }, { rotulo: '99% abaixo de (p99)', valor: ms(d.p99) },
        { rotulo: 'Chamadas com erro', valor: `${d.erro_pct.toLocaleString('pt-BR')}%`, dica: Object.entries(d.codigos).map(([k, v]) => `${k}: ${v}`).join(' · ') },
        { rotulo: 'Banco agora', valor: ms(d.banco_ms), dica: 'ida e volta de uma consulta, deste servidor' },
      ]} />
      <section className="cartao p-5">
        <h3 className="titulo-secao">Tempo de resposta e erros</h3>
        {!d.serie.length ? <p className="mt-2 text-sm text-muted-foreground">Sem medições no período.</p> : (
          <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%">
            <LineChart data={d.serie} margin={{ top: 6, right: 12, left: -6, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="quando" tickFormatter={(t) => hora(t, horas > 48)} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis yAxisId="ms" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}s` : `${v}ms`)} />
              <YAxis yAxisId="pct" orientation="right" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} labelFormatter={(t) => hora(t, true)}
                formatter={(v, n) => (n === 'Erros' ? [`${v}%`, n] : [ms(v), n])} />
              <Line yAxisId="ms" type="monotone" dataKey="p50" name="p50" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line yAxisId="ms" type="monotone" dataKey="p95" name="p95" stroke="#d97706" strokeWidth={2} dot={false} />
              <Line yAxisId="pct" type="monotone" dataKey="erro_pct" name="Erros" stroke="#dc2626" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </LineChart></ResponsiveContainer></div>
        )}
      </section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {[['Mais lentas (p95)', d.lentas], ['Mais chamadas', d.mais_chamadas]].map(([t, l]) => (
          <section key={t} className="cartao overflow-hidden">
            <h3 className="titulo-secao px-5 pt-4">{t}</h3>
            <div className="overflow-x-auto"><table className="tabela mt-2 w-full min-w-[420px]">
              <thead><tr><th>Tela</th><th className="!text-right">Chamadas</th><th className="!text-right">p50</th><th className="!text-right">p95</th><th className="!text-right">Erros</th></tr></thead>
              <tbody>{l.map((x) => <tr key={x.rota}><td className="font-mono text-xs">{x.rota}</td><td className="text-right tabular">{x.chamadas}</td><td className="text-right tabular">{ms(x.p50)}</td>
                <td className={`text-right tabular ${x.p95 > 3000 ? 'text-amber-600' : ''}`}>{ms(x.p95)}</td><td className={`text-right tabular ${x.erros ? 'text-red-600' : ''}`}>{x.erros}</td></tr>)}</tbody>
            </table></div>
          </section>))}
      </div>
    </div>
  )
}

const ESTADO = { ok: [CheckCircle2, 'text-emerald-600', 'verde', 'Funcionando'], atencao: [AlertTriangle, 'text-amber-600', 'ambar', 'Atenção'], falhou: [XCircle, 'text-red-600', 'vermelho', 'Falhou'], sem_config: [CircleMinus, 'text-muted-foreground', 'cinza', 'Não configurado'] }

export function Integracoes() {
  const reduzir = useReducedMotion()
  const { dados: d, erro, recarregar } = useDados(() => api.get('/api/infra/integracoes'))
  const [testando, setTestando] = useState(false)
  const testar = async () => { setTestando(true); try { await recarregar() } finally { setTestando(false) } }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Carregando />
  const ok = d.itens.filter((i) => i.estado === 'ok').length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cada serviço que o sistema usa, testado agora com as chaves dele (as chaves não saem do servidor). {ok} de {d.itens.length} funcionando.</p>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={testando} onClick={testar}>Testar de novo</Botao>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">{d.itens.map((i, k) => {
        const [I, cor, selo, rot] = ESTADO[i.estado] || ESTADO.falhou
        return (
          <motion.li key={i.servico} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.04 }} className="cartao flex items-start gap-3 p-4">
            <I className={`mt-0.5 h-5 w-5 shrink-0 ${cor}`} />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{i.servico}</p><Selo cor={selo}>{rot}</Selo></div>
              <p className="mt-0.5 text-sm text-muted-foreground">{i.detalhe}</p></div>
            <span className={`shrink-0 text-xs tabular ${i.ms > 3000 ? 'text-amber-600' : 'text-muted-foreground'}`}>{ms(i.ms)}</span>
          </motion.li>)
      })}</ul>
    </div>
  )
}

export function Limites() {
  const reduzir = useReducedMotion()
  const { dados: d, erro } = useDados(() => api.get('/api/infra/limites'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Carregando />
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Quanto do plano de cada serviço já foi usado. Perto de 100%, o serviço para ou fica só leitura: aja antes.</p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">{d.itens.map((x, i) => {
        const cor = x.pct == null ? 'bg-muted-foreground/50' : x.pct >= 90 ? 'bg-red-500' : x.pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
        return (
          <li key={x.nome} className="cartao p-4">
            <div className="flex items-baseline justify-between gap-2"><p className="flex items-center gap-1.5 font-medium"><Gauge className="h-4 w-4 text-muted-foreground" />{x.nome}</p><span className="text-xs text-muted-foreground">{x.fonte}</span></div>
            <p className="mt-1 text-lg font-semibold tabular">{x.usado.toLocaleString('pt-BR')}{x.limite ? <span className="text-sm font-normal text-muted-foreground"> de {x.limite.toLocaleString('pt-BR')} {x.unidade}</span> : <span className="text-sm font-normal text-muted-foreground"> {x.unidade}</span>}
              {x.pct != null && <span className={`ml-2 text-sm ${x.pct >= 90 ? 'text-red-600' : x.pct >= 70 ? 'text-amber-600' : 'text-emerald-600'}`}>{x.pct.toLocaleString('pt-BR')}%</span>}</p>
            {x.pct != null && <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><motion.div className={`h-full rounded-full ${cor}`} initial={{ width: reduzir ? `${Math.min(100, x.pct)}%` : 0 }} animate={{ width: `${Math.min(100, x.pct)}%` }} transition={{ delay: i * 0.05, duration: 0.6 }} /></div>}
            <p className="mt-1.5 text-xs text-muted-foreground">{x.dica}</p>
          </li>)
      })}</ul>
    </div>
  )
}
