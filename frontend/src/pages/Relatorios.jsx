import { useState } from 'react'
import { motion } from 'framer-motion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { dataHora, api, rotuloOrigem } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Cabecalho, Carregando, useDados } from '../components/ui'

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const eixo = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'hsl(var(--muted-foreground))' }

function Caixa({ titulo, sub, children, className = '', i = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={`cartao p-5 ${className}`}>
      <h2 className="titulo-secao">{titulo}</h2>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      <div className="mt-4">{children}</div>
    </motion.div>
  )
}

function Dica({ active, payload, label, sufixo = '' }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl"> {/* marca: dica do gráfico flutua */}<p className="font-medium">{label}{sufixo}</p>{payload.map((p) => <p key={p.dataKey} className="text-muted-foreground">{p.name}: <span className="font-mono text-foreground">{p.value}</span></p>)}</div>
}

export default function Relatorios() {
  const { filtro, projeto } = useProjeto()
  const [dias, setDias] = useState(30)
  const { dados, erro } = useDados(() => api.get(comFiltro(`/api/relatorios?dias=${dias}`, filtro)), [dias, filtro])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const total = dados.por_aparelho.reduce((s, a) => s + a.comandos, 0)
  const falhas = dados.por_aparelho.reduce((s, a) => s + a.falhas, 0)
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, '0')}h`, total: dados.por_hora.find((x) => x.hora === h)?.total || 0 }))
  const serie = dados.metricas.map((m) => ({ dia: m.dia.slice(8, 10) + '/' + m.dia.slice(5, 7), comandos: m.comandos, alexa: m.pela_alexa, agenda: m.pela_agenda }))
  const maxHora = Math.max(1, ...horas.map((h) => h.total))

  return (
    <>
      <Cabecalho titulo="Relatórios" descricao={`Uso dos aparelhos ${projeto ? `em ${projeto.nome}` : 'em todos os projetos'}.`}
        acoes={<div className="flex rounded-lg border border-border bg-card p-0.5">{PERIODOS.map(([d, r]) => (
          <button key={d} onClick={() => setDias(d)} className={`rounded-md px-3 py-1.5 text-sm ${dias === d ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
        ))}</div>} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[['Comandos', total], ['Taxa de sucesso', total ? `${Math.round(((total - falhas) / total) * 100)}%` : '—'], ['Origem mais usada', dados.por_origem[0] ? rotuloOrigem(dados.por_origem[0].origem) : '—']].map(([r, v], i) => (
          <motion.div key={r} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="cartao p-5">
            <p className="text-sm text-muted-foreground">{r}</p><p className="mt-2 text-2xl font-semibold tabular">{v}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Caixa titulo="Comandos por dia" sub="Total, pela Alexa e pela agenda" className="lg:col-span-2" i={1}>
          <div className="h-64">
            {serie.length === 0 ? <p className="pt-20 text-center text-sm text-muted-foreground">Sem dados no período.</p> : (
              <ResponsiveContainer><AreaChart data={serie} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" {...eixo} tickMargin={8} /><YAxis {...eixo} width={30} allowDecimals={false} />
                <Tooltip content={<Dica />} />
                <Area dataKey="comandos" name="Total" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.12)" strokeWidth={2} type="monotone" />
                <Area dataKey="alexa" name="Alexa" stroke="#2563a8" fill="none" strokeDasharray="4 4" strokeWidth={2} type="monotone" />
                <Area dataKey="agenda" name="Agenda" stroke="#c2410c" fill="none" strokeDasharray="2 3" strokeWidth={2} type="monotone" />
              </AreaChart></ResponsiveContainer>
            )}
          </div>
        </Caixa>

        <Caixa titulo="Horários de uso" sub="Comandos por hora do dia (Brasília)" i={2}>
          <div className="h-56">
            <ResponsiveContainer><BarChart data={horas} margin={{ left: 0, right: 0 }}>
              <XAxis dataKey="hora" {...eixo} interval={3} /><YAxis {...eixo} width={26} allowDecimals={false} />
              <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
              <Bar dataKey="total" name="Comandos" radius={[3, 3, 0, 0]}>
                {horas.map((h) => <Cell key={h.hora} fill={`hsl(var(--primary) / ${0.25 + (h.total / maxHora) * 0.75})`} />)}
              </Bar>
            </BarChart></ResponsiveContainer>
          </div>
        </Caixa>

        <Caixa titulo="Temperaturas mais usadas" sub="Quantas vezes cada temperatura foi escolhida" i={3}>
          <div className="h-56">
            {dados.temperaturas.length === 0 ? <p className="pt-16 text-center text-sm text-muted-foreground">Sem dados no período.</p> : (
              <ResponsiveContainer><BarChart data={dados.temperaturas.map((t) => ({ ...t, rotulo: `${t.temperatura}°` }))} margin={{ left: 0, right: 0 }}>
                <XAxis dataKey="rotulo" {...eixo} /><YAxis {...eixo} width={26} allowDecimals={false} />
                <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="total" name="Vezes" fill="#2563a8" radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer>
            )}
          </div>
        </Caixa>

        <Caixa titulo="Por aparelho" className="lg:col-span-2" i={4}>
          <div className="-mx-5 overflow-x-auto">
            <table className="tabela w-full min-w-[560px]">
              <thead><tr><th>Aparelho</th><th>Comandos</th><th>Vezes que ligou</th><th>Falhas</th><th>Último comando</th></tr></thead>
              <tbody>
                {dados.por_aparelho.map((a) => (
                  <tr key={a.id}>
                    <td><p className="font-medium">{a.nome}</p><p className="text-xs text-muted-foreground">{a.comodo || 'Sem cômodo'}</p></td>
                    <td className="tabular">{a.comandos}</td><td className="tabular">{a.ligou}</td>
                    <td className={`tabular ${a.falhas ? 'text-red-600 dark:text-red-400' : ''}`}>{a.falhas}</td>
                    <td className="text-muted-foreground">{a.ultimo ? dataHora(a.ultimo) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Caixa>
      </div>
    </>
  )
}
