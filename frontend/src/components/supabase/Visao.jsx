import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { motion } from 'framer-motion'
import { BellRing, Check, Database, Server, ShieldCheck } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Botao, Esqueleto, FaixaMetricas, useDados } from '../ui'
import { TituloSecao, kb, num } from './comum'

const Dica = ({ active, payload, label }) => active && payload?.length ? (
  <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-lg"> {/* marca: dica do gráfico flutua */}
    <p className="font-medium">{label}</p>{payload.map((p) => <p key={p.dataKey} className="text-muted-foreground">{p.name}: <span className="font-medium text-foreground">{num(p.value)}</span></p>)}
  </div>
) : null

export default function Visao({ irPara }) {
  const { dados, recarregar } = useDados(() => Promise.all([api.get('/api/supabase/visao'), api.get('/api/metricas?dias=14'), api.get('/api/supabase/registros?limite=50'), api.get('/api/alertas'), api.get('/api/supabase/avisos')]))
  if (!dados) return <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-28" /><Esqueleto className="h-72" /></div>
  const [v, metricas, reg, alertas, avisos] = dados
  const usoMb = v.bytes / 1048576
  const uso = (usoMb / 500) * 100
  const diasNoAr = Math.max(0, Math.floor((Date.now() / 1000 - v.iniciado_em) / 86400))
  const serie = metricas.map((d) => ({ ...d, dia: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` }))
  const maxTab = Math.max(1, ...v.maiores.map((t) => t.bytes))
  const erros = avisos.filter((a) => a.nivel !== 'info').length
  return (
    <>
      <TituloSecao titulo="Visão geral do projeto" descricao="Saúde do banco, uso do plano gratuito e o que rodou nas últimas horas." />
      <div className="cartao mb-5 flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Database className="h-5 w-5" /></span>
          <div><p className="font-semibold">Arcondicionado</p><p className="font-mono text-xs text-muted-foreground">{v.projeto}</p></div>
        </div>
        <span className="flex items-center gap-2 text-sm"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>Saudável</span> {/* marca: pulso de status ao vivo */}
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div><dt className="text-xs text-muted-foreground">Região</dt><dd>{v.regiao}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Postgres</dt><dd>{v.versao_curta}</dd></div>
          <div><dt className="text-xs text-muted-foreground">No ar há</dt><dd>{diasNoAr ? `${diasNoAr} dia(s)` : 'menos de 1 dia'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Plano</dt><dd>Gratuito</dd></div>
        </dl>
        {erros > 0 && <button onClick={() => irPara('avisos')} className="ml-auto flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300"><ShieldCheck className="h-4 w-4" />{erros} aviso(s) para olhar</button>}
      </div>

      <FaixaMetricas itens={[
        { rotulo: 'Tamanho do banco', valor: usoMb, casas: 1, sufixo: ' MB', dica: `${uso.toFixed(1)}% dos 500 MB do plano`, tom: uso > 80 ? 'ruim' : 'bom' },
        { rotulo: 'Conexões', valor: v.conexoes, sufixo: ` / ${v.max_conexoes}`, dica: `${v.conexoes_ativas} ativa(s) agora` },
        { rotulo: 'Acerto de cache', valor: Number(v.cache_hit || 0), casas: 1, sufixo: '%', dica: Number(v.cache_hit) >= 99 ? 'leituras quase todas da memória' : 'abaixo de 99%: vale olhar', tom: Number(v.cache_hit) >= 99 ? 'bom' : 'ruim' },
        { rotulo: 'Linhas guardadas', valor: Number(v.linhas), dica: `${v.tabelas} tabelas · ${v.politicas} políticas RLS` },
      ]} />
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={`h-full rounded-full ${uso > 80 ? 'bg-red-500' : 'bg-primary'}`} initial={{ width: 0 }} animate={{ width: `${Math.max(1, Math.min(100, uso))}%` }} transition={{ duration: 0.9 }} /></div>

      {alertas.length > 0 && (
        <div className="cartao mt-5 divide-y divide-border border-amber-300 dark:border-amber-800">
          <h2 className="flex items-center gap-2 px-4 py-3 text-sm font-semibold"><BellRing className="h-4 w-4 text-amber-600" /> Alertas abertos</h2>
          {alertas.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div><p>{a.mensagem}</p><p className="text-xs text-muted-foreground">{haQuanto(a.criado_em)}</p></div>
              <Botao variante="secundario" tamanho="sm" icone={Check} onClick={async () => { await api.post(`/api/alertas/${a.id}/resolver`); recarregar() }}>Resolver</Botao>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="cartao p-5">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="titulo-secao">Comandos por dia</h2><span className="text-xs text-muted-foreground">últimos 14 dias</span></div>
          {serie.length ? (
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={serie} margin={{ left: -18, right: 6, top: 6 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Dica />} />
                  <Area type="monotone" dataKey="comandos" name="Comandos" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="falhas" name="Falhas" stroke="#dc2626" strokeWidth={1.5} fill="#dc2626" fillOpacity={0.06} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="py-16 text-center text-sm text-muted-foreground">As métricas aparecem depois da primeira hora de uso.</p>}
        </section>
        <section className="cartao p-5">
          <div className="mb-3 flex items-baseline justify-between"><h2 className="titulo-secao">Rotinas nas últimas 24 h</h2><button onClick={() => irPara('registros')} className="text-xs text-primary hover:underline">Ver registros</button></div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={reg.por_hora} margin={{ left: -24, right: 4, top: 6 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="hora" tick={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
                <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="ok" name="Com sucesso" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                <Bar dataKey="falhas" name="Falharam" stackId="a" fill="#dc2626" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="cartao p-5">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="titulo-secao">Maiores tabelas</h2><button onClick={() => irPara('banco')} className="text-xs text-primary hover:underline">Ver todas</button></div>
          <ul className="space-y-2.5">
            {v.maiores.map((t, i) => (
              <li key={t.tabela}>
                <button onClick={() => irPara('tabelas', t.tabela)} className="w-full text-left">
                  <div className="flex justify-between text-sm"><span className="font-mono text-[13px]">{t.tabela}</span><span className="tabular-nums text-muted-foreground">{kb(t.bytes)} · {num(t.linhas)} linhas</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary/70" initial={{ width: 0 }} animate={{ width: `${(t.bytes / maxTab) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.05 }} /></div>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="cartao p-5">
          <h2 className="titulo-secao mb-4">Plataforma</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            {[['Usuários no Auth', v.usuarios_auth], ['Fatores 2FA', v.fatores_mfa], ['Sessões abertas', v.sessoes_auth], ['Rotinas pg_cron', v.rotinas], ['Transações', num(v.transacoes)], ['Leituras por índice', `${v.uso_indice ?? 0}%`]].map(([r, x]) => (
              <div key={r}><dt className="text-xs text-muted-foreground">{r}</dt><dd className="mt-0.5 text-lg font-semibold tabular-nums">{x}</dd></div>
            ))}
          </dl>
          <p className="mb-2 mt-5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Server className="h-3.5 w-3.5" />Extensões instaladas</p>
          <div className="flex flex-wrap gap-1.5">{v.extensoes.map((e) => <span key={e.nome} className="rounded border border-border px-2 py-0.5 font-mono text-[11.5px]">{e.nome} <span className="text-muted-foreground">{e.versao}</span></span>)}</div>
        </section>
      </div>
    </>
  )
}
