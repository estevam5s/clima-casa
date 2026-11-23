import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Clock3, Crown, MousePointerClick, Route, Users } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../api'
import { Aviso, Carregando, FaixaMetricas, Secao, Vazio, useDados } from '../ui'

// Uso do sistema por pessoa: tempo com cada tela aberta e visível (o relógio para com a aba escondida ou 5 min sem
// mexer), dias de uso, telas preferidas e caminhos de uma tela para outra. Os números vêm de /api/usuarios/uso.
const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const CORES = ['#0f766a', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#059669', '#0891b2', '#64748b']
const DICA = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

export const tempo = (ms) => {
  const min = Math.round((ms || 0) / 60000)
  if (min < 1) return ms > 0 ? 'menos de 1 min' : '0 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
const diaCurto = (d) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
const iniciais = (n) => ((n || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase()

function Avatar({ u, tam = 'h-9 w-9' }) {
  return u?.avatar ? <img src={u.avatar} alt="" className={`${tam} shrink-0 rounded-full object-cover`} />
    : <span className={`flex ${tam} shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold`}>{iniciais(u?.nome)}</span>
}

// linha fina com a série diária de uma pessoa (SVG puro: dezenas de mini gráficos do recharts pesariam a tela)
function Faixinha({ serie, cor }) {
  const max = Math.max(1, ...serie.map((s) => s.ms))
  const pts = serie.map((s, i) => `${(i / Math.max(1, serie.length - 1)) * 100},${28 - (s.ms / max) * 26}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-7 w-24 shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={cor} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

export default function UsoSistema() {
  const [dias, setDias] = useState(30)
  const [sel, setSel] = useState(null)
  const parado = useReducedMotion()
  const { dados, erro } = useDados(() => api.get(`/api/usuarios/uso?dias=${dias}`), [dias])
  const nome = (rota) => dados?.nomes?.[rota] || rota
  const pessoa = (id) => dados?.usuarios?.[id] || { nome: 'Conta apagada' }
  const total = useMemo(() => (dados?.pessoas || []).reduce((s, p) => s + p.ms, 0), [dados])
  if (erro) return <Aviso>{erro}</Aviso>

  const seletor = (
    <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Período">
      {PERIODOS.map(([d, r]) => (
        <button key={d} onClick={() => { setDias(d); setSel(null) }} aria-pressed={dias === d}
          className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${dias === d ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          {dias === d && <motion.span layoutId="uso-periodo" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{r}</span>
        </button>
      ))}
    </div>
  )
  if (!dados) return <div className="space-y-4"><div className="flex justify-end">{seletor}</div><Carregando /></div>

  const pessoas = dados.pessoas
  const ativosDia = dados.dias.filter((d) => d.ms > 0)
  const maxP = Math.max(1, ...pessoas.map((p) => p.ms))
  const escolhida = pessoas.find((p) => p.id === sel)
  const serieDias = dados.dias.map((d) => ({ ...d, min: Math.round(d.ms / 60000), rotulo: diaCurto(d.dia) }))
  const telas = dados.telas.map((t) => ({ ...t, min: Math.round(t.ms / 60000), nome: nome(t.rota) }))
  const maxCel = Math.max(1, ...dados.matriz.flatMap((m) => Object.values(m.rotas)))
  const maxCam = Math.max(1, ...dados.caminhos.map((c) => c.n))
  const visitas = pessoas.reduce((s, p) => s + p.visitas, 0)
  const diasPessoa = pessoas.reduce((s, p) => s + p.dias_ativos, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">Quanto tempo cada pessoa passa no sistema e em quais telas. Conta só com a aba visível e alguém mexendo: 5 minutos parado, o relógio para. Nada do que foi digitado é guardado.</p>
        {seletor}
      </div>

      <FaixaMetricas itens={[
        { rotulo: 'Tempo de uso', valor: tempo(total), dica: `nos últimos ${dias} dias` },
        { rotulo: 'Pessoas que usaram', valor: pessoas.length, dica: `de ${Object.keys(dados.usuarios).length} conta(s)` },
        { rotulo: 'Telas abertas', valor: visitas, dica: `${dados.telas.length} telas diferentes` },
        { rotulo: 'Média por pessoa', valor: tempo(diasPessoa ? total / diasPessoa : 0), dica: 'por dia de uso', serie: serieDias.map((d) => d.min) },
      ]} />

      {!pessoas.length ? (
        <section className="cartao p-6"><Vazio icone={Clock3} titulo="Ainda sem tempo de uso registrado" texto="A contagem começou nesta versão. Assim que alguém usar o sistema, o tempo de cada tela aparece aqui (atualiza a cada minuto)." /></section>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Secao semPadding titulo="Tempo de uso por dia" contexto={`${ativosDia.length} dia(s) com uso · minutos somados de todas as pessoas`}>
              <div className="h-64 p-3">
                <ResponsiveContainer>
                  <AreaChart data={serieDias} margin={{ left: -14, right: 8, top: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={18} />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                    <Tooltip contentStyle={DICA} formatter={(v, k, p) => [`${tempo(p.payload.ms)} · ${p.payload.pessoas} pessoa(s)`, 'Uso']} labelFormatter={(l) => `Dia ${l}`} />
                    <Area type="monotone" dataKey="min" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.12} isAnimationActive={!parado} animationDuration={900} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Secao>
            <Secao semPadding titulo="Telas mais usadas" contexto="Tempo somado de todas as pessoas">
              <div className="h-64 p-3">
                <ResponsiveContainer>
                  <BarChart data={telas.slice(0, 8)} layout="vertical" margin={{ left: 4, right: 16, top: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="nome" width={118} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={DICA} formatter={(v, k, p) => [`${tempo(p.payload.ms)} · ${p.payload.visitas} visita(s) · ${p.payload.pessoas} pessoa(s)`, 'Tempo']} />
                    <Bar dataKey="min" radius={[0, 4, 4, 0]} isAnimationActive={!parado} animationDuration={800}>
                      {telas.slice(0, 8).map((t, i) => <Cell key={t.rota} fill={CORES[i % CORES.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Secao>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Secao semPadding titulo="Quem mais usa" contexto="Clique numa pessoa para ver as telas e os dias dela">
              <ol className="divide-y divide-border">
                {pessoas.map((p, i) => {
                  const u = pessoa(p.id)
                  return (
                    <motion.li key={p.id} initial={parado ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
                      <button onClick={() => setSel(sel === p.id ? null : p.id)} aria-expanded={sel === p.id}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${sel === p.id ? 'bg-primary/5' : 'hover:bg-muted/50'}`}>
                        <span className="hidden w-5 shrink-0 text-right text-xs tabular text-muted-foreground sm:block">{i + 1}</span>
                        <Avatar u={u} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium">{u.papel === 'dono' && <Crown className="h-3 w-3 shrink-0 text-amber-600" />}{u.nome}</span>
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                            <motion.span className="block h-full rounded-full" style={{ background: CORES[i % CORES.length] }}
                              initial={parado ? false : { width: 0 }} animate={{ width: `${(p.ms / maxP) * 100}%` }} transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 + Math.min(i, 8) * 0.04 }} />
                          </span>
                          <span className="mt-1 block truncate text-xs text-muted-foreground">{p.dias_ativos} dia(s) · {p.visitas} tela(s) abertas · mais em {nome(p.favorita)}</span>
                        </span>
                        <span className="hidden sm:block"><Faixinha serie={p.serie} cor={CORES[i % CORES.length]} /></span>
                        <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular sm:min-w-20">{tempo(p.ms)}</span>
                      </button>
                      <AnimatePresence initial={false}>
                        {sel === p.id && escolhida && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                            <div className="grid gap-4 border-t border-border bg-muted/30 px-4 py-4 sm:grid-cols-2">
                              <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Telas de {u.nome}</p>
                                <ul className="space-y-1.5">
                                  {escolhida.telas.map((t) => (
                                    <li key={t.rota} className="text-sm">
                                      <span className="flex justify-between gap-2"><span className="truncate">{nome(t.rota)}</span><span className="shrink-0 tabular text-muted-foreground">{tempo(t.ms)}</span></span>
                                      <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-primary/70" initial={{ width: 0 }} animate={{ width: `${(t.ms / escolhida.telas[0].ms) * 100}%` }} transition={{ duration: 0.5 }} /></span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Dia a dia</p>
                                <div className="h-36">
                                  <ResponsiveContainer>
                                    <BarChart data={escolhida.serie.map((s) => ({ ...s, min: Math.round(s.ms / 60000), rotulo: diaCurto(s.dia) }))} margin={{ left: -22, right: 4, top: 4 }}>
                                      <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" interval="preserveStartEnd" minTickGap={14} />
                                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                                      <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={DICA} formatter={(v, k, pp) => [tempo(pp.payload.ms), 'Uso']} />
                                      <Bar dataKey="min" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} isAnimationActive={!parado} />
                                    </BarChart>
                                  </ResponsiveContainer>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">{u.email}{u.cargo ? ` · ${u.cargo}` : ''}{escolhida.ultimo_dia ? ` · último uso em ${diaCurto(escolhida.ultimo_dia)}` : ''}</p>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  )
                })}
              </ol>
            </Secao>

            <div className="space-y-6">
              <Secao semPadding titulo="Caminhos mais comuns" contexto="De que tela para qual tela as pessoas vão">
                {!dados.caminhos.length ? <p className="p-5 text-sm text-muted-foreground">Ainda não há passagens entre telas no período.</p> : (
                  <ul className="space-y-2.5 p-4">
                    {dados.caminhos.map((c, i) => (
                      <motion.li key={`${c.de}>${c.para}`} initial={parado ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 truncate">{nome(c.de)}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate font-medium">{nome(c.para)}</span>
                          <span className="shrink-0 text-xs tabular text-muted-foreground">{c.n}× · {c.pessoas} pessoa(s)</span>
                        </div>
                        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-sky-500/70" initial={{ width: 0 }} animate={{ width: `${(c.n / maxCam) * 100}%` }} transition={{ duration: 0.6, delay: 0.05 * Math.min(i, 10) }} /></span>
                      </motion.li>
                    ))}
                  </ul>
                )}
              </Secao>
              <section className="grid grid-cols-3 gap-3">
                {[[Users, 'Pessoas no dia mais cheio', Math.max(0, ...dados.dias.map((d) => d.pessoas))], [Route, 'Telas diferentes usadas', dados.telas.length],
                  [MousePointerClick, 'Trocas de tela', dados.caminhos.reduce((s, c) => s + c.n, 0)]].map(([I, r, v]) => (
                  <div key={r} className="cartao p-3.5"><I className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-xl font-semibold tabular">{v}</p><p className="text-[11px] leading-snug text-muted-foreground">{r}</p></div>
                ))}
              </section>
            </div>
          </div>

          <Secao semPadding titulo="Quem usa o quê" contexto="Cada quadrado é o tempo de uma pessoa numa tela: quanto mais forte, mais tempo">
            <div className="overflow-x-auto p-4">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-xs">
                <thead><tr><th className="w-40 text-left font-medium text-muted-foreground">Pessoa</th>{dados.rotas_matriz.map((r) => <th key={r} className="px-1 text-center font-medium text-muted-foreground"><span className="block truncate">{nome(r)}</span></th>)}</tr></thead>
                <tbody>
                  {dados.matriz.map((m) => (
                    <tr key={m.id}>
                      <td className="truncate pr-2 text-sm">{pessoa(m.id).nome}</td>
                      {dados.rotas_matriz.map((r, j) => {
                        const v = m.rotas[r] || 0, k = v / maxCel
                        return (
                          <td key={r} className="p-0">
                            <motion.div title={`${pessoa(m.id).nome} · ${nome(r)}: ${tempo(v)}`} initial={parado ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.01 * j }}
                              className="flex h-9 items-center justify-center rounded-md tabular" style={{ background: v ? `hsl(var(--primary) / ${0.08 + k * 0.82})` : 'hsl(var(--muted) / 0.5)', color: k > 0.5 ? 'hsl(var(--primary-foreground))' : undefined }}>
                              {v ? Math.max(1, Math.round(v / 60000)) : ''}
                            </motion.div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">Números em minutos. As 8 telas com mais tempo no período.</p>
            </div>
          </Secao>
        </>
      )}
    </div>
  )
}
