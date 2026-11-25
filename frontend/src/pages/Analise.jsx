import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart as GraficoLinha, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowRight, Download, ExternalLink, Gauge, Globe2, KeyRound, LineChart, MapPin, Monitor, MousePointerClick, RefreshCw, Search, Smartphone, Tablet, Timer } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { baixarArquivo, paraCsv } from '../components/FerramentasLista'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Secao, Selo, useToast } from '../components/ui'

// Acessos e SEO (backend/app/analise.py): quem acessa o site zynio.com.br e o sistema, por onde entra, o que clica, de onde é,
// quanto as páginas demoram (Web Vitals medidos em quem visita) e a auditoria de SEO de cada página do site.
const ABAS = [['geral', 'Visão geral', LineChart], ['rotas', 'Rotas e cliques', MousePointerClick], ['lugares', 'Lugares e aparelhos', MapPin],
  ['desempenho', 'Desempenho', Timer], ['seo', 'SEO', Search]]
const VITAIS = { LCP: ['Maior elemento visível', 'ms', '≤ 2,5 s bom · > 4 s ruim'], INP: ['Resposta ao clique', 'ms', '≤ 200 ms bom · > 500 ms ruim'],
  CLS: ['Estabilidade do layout', '', '≤ 0,1 bom · > 0,25 ruim'], FCP: ['Primeira pintura', 'ms', '≤ 1,8 s bom · > 3 s ruim'], TTFB: ['Resposta do servidor', 'ms', '≤ 0,8 s bom · > 1,8 s ruim'] }
const COR_NOTA = { bom: 'verde', melhorar: 'ambar', ruim: 'vermelho' }
const NOME_NOTA = { bom: 'bom', melhorar: 'precisa melhorar', ruim: 'ruim' }
const PAISES = (() => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }) } catch { return null } })()
const pais = (c) => (c && PAISES ? PAISES.of(c) || c : c || '-')
const fmtVital = (k, v) => (v == null ? '-' : k === 'CLS' ? v.toFixed(2).replace('.', ',') : v >= 1000 ? `${(v / 1000).toFixed(2).replace('.', ',')} s` : `${Math.round(v)} ms`)
const variacao = (agora, antes) => {
  if (!antes) return agora ? 'novo neste período' : ''
  const p = Math.round(((agora - antes) / antes) * 100)
  return `${p > 0 ? '+' : ''}${p}% vs período anterior`
}
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function SemanaHora({ dados }) {
  const max = Math.max(1, ...dados.map((x) => x.n))
  const v = (d, h) => dados.find((x) => x.dia === d && x.hora === h)?.n || 0
  if (!dados.length) return <p className="text-sm text-muted-foreground">Sem acessos neste período.</p>
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[620px] gap-[3px]" style={{ gridTemplateColumns: '2.5rem repeat(24, minmax(0, 1fr))' }}>
        <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px] text-muted-foreground tabular">{h % 3 === 0 ? h : ''}</span>)}
        {DIAS_SEMANA.map((nome, d) => (
          <div key={d} className="contents">
            <span className="text-xs text-muted-foreground">{nome}</span>
            {Array.from({ length: 24 }, (_, h) => { const n = v(d, h); return (
              <span key={h} title={`${nome} ${h}h: ${n} página(s)`} className="h-5 rounded-[3px] bg-primary" style={{ opacity: n ? 0.15 + (n / max) * 0.85 : 0.05 }} />) })}
          </div>
        ))}
      </div>
    </div>
  )
}

const duracao = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`)

function Barras({ itens, rotulo, valor, sub, vazio = 'Nada ainda neste período.' }) {
  const max = Math.max(1, ...itens.map(valor))
  if (!itens.length) return <p className="text-sm text-muted-foreground">{vazio}</p>
  return (
    <ul className="space-y-2.5">
      {itens.map((x, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate" title={String(rotulo(x))}>{rotulo(x)}</span><span className="shrink-0 tabular text-muted-foreground">{valor(x)}{sub ? ` ${sub(x)}` : ''}</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(valor(x) / max) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

function Geral({ d }) {
  const t = d.totais
  const dias = d.por_dia.map((x) => ({ ...x, dia: x.dia.slice(8, 10) + '/' + x.dia.slice(5, 7) }))
  const horas = Array.from({ length: 24 }, (_, h) => ({ hora: `${h}h`, n: d.por_hora.find((x) => x.hora === h)?.n || 0 }))
  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Online agora', valor: t.online, dica: 'abas abertas nos últimos 5 min', tom: t.online ? 'bom' : undefined },
        { rotulo: 'Visitantes', valor: t.visitantes, dica: `${t.sessoes} sessões · ${variacao(t.visitantes, d.anterior?.visitantes)}`, serie: d.por_dia.map((x) => x.sessoes), tom: d.anterior && t.visitantes > d.anterior.visitantes ? 'bom' : undefined },
        { rotulo: 'Páginas vistas', valor: t.paginas, dica: `${String(t.paginas_por_sessao).replace('.', ',')} por sessão · ${variacao(t.paginas, d.anterior?.paginas)}`, serie: d.por_dia.map((x) => x.paginas) },
        { rotulo: 'Tempo médio', valor: duracao(t.duracao_media_s), dica: `rejeição ${t.rejeicao}% · ${t.cliques} cliques`, tom: t.rejeicao > 70 ? 'ruim' : undefined },
      ]} />
      {!!d.recomendacoes.length && (
        <Secao titulo="O que melhorar" contexto="Tirado das medições deste período (só aparece o que foi medido)">
          <ul className="space-y-2">{d.recomendacoes.map((r, i) => (
            <li key={i} className="flex gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${r.gravidade === 'alta' ? 'text-red-600' : r.gravidade === 'media' ? 'text-amber-600' : 'text-muted-foreground'}`} />
              <div><p className="font-medium">{r.titulo}</p><p className="text-xs text-muted-foreground">{r.detalhe}</p></div>
            </li>))}
          </ul>
        </Secao>
      )}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Secao titulo="Por dia" contexto="Páginas vistas e sessões (horário de Brasília)">
          {dias.length ? (
            <div className="h-64"><ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dias} margin={{ left: -18, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="paginas" name="Páginas" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="sessoes" name="Sessões" stroke="#64748b" fill="#64748b" fillOpacity={0.08} strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer></div>
          ) : <p className="text-sm text-muted-foreground">Sem acessos neste período.</p>}
        </Secao>
        <Secao titulo="Online agora" contexto="Quem está com a página aberta">
          {d.online.length ? (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-sm">{d.online.map((o) => (
              <li key={o.sessao} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{o.rota}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{o.cidade || pais(o.pais)} · {o.dispositivo}</span>
              </li>))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Ninguém agora.</p>}
        </Secao>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Secao titulo="Dia da semana × hora" contexto="Páginas vistas (horário de Brasília): quanto mais forte, mais acesso">
          <SemanaHora dados={d.semana_hora || []} />
        </Secao>
        <Secao titulo="Quem são" contexto="Novos e recorrentes só para quem aceitou estatísticas (os demais são anônimos)">
          {(() => { const v = d.visitantes_tipo || {}; const tot = (v.novos || 0) + (v.recorrentes || 0) + (v.anonimas || 0); return tot ? (
            <div className="space-y-3 text-sm">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <span className="bg-primary" style={{ width: `${(v.novos / tot) * 100}%` }} /><span className="bg-emerald-500" style={{ width: `${(v.recorrentes / tot) * 100}%` }} /><span className="bg-slate-400" style={{ width: `${(v.anonimas / tot) * 100}%` }} />
              </div>
              {[['bg-primary', 'Novos', v.novos], ['bg-emerald-500', 'Voltaram', v.recorrentes], ['bg-slate-400', 'Sessões anônimas', v.anonimas]].map(([c, n, x]) => (
                <p key={n} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} /><span className="flex-1">{n}</span><span className="tabular text-muted-foreground">{x || 0}</span></p>))}
              <p className="text-xs text-muted-foreground">Cliques: {t.cliques} · {variacao(t.cliques, d.anterior?.cliques)}</p>
            </div>) : <p className="text-sm text-muted-foreground">Nada ainda neste período.</p> })()}
        </Secao>
      </div>
      <Secao titulo="Por hora do dia" contexto="Quando as pessoas mais acessam">
        <div className="h-48"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={horas} margin={{ left: -18, right: 8 }}>
            <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} stroke="hsl(var(--muted-foreground))" />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="n" name="Páginas" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div>
      </Secao>
    </div>
  )
}

function Rotas({ d }) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Secao titulo="Rotas mais vistas" contexto="Páginas vistas · sessões">
        <Barras itens={d.rotas} rotulo={(x) => x.rota} valor={(x) => x.paginas} sub={(x) => `· ${x.sessoes}`} />
      </Secao>
      <Secao titulo="Cliques mais feitos" contexto="Botões e links (só o rótulo, nunca o que foi digitado)">
        <Barras itens={d.cliques} rotulo={(x) => <><b className="font-medium">{x.nome}</b><span className="text-muted-foreground"> · {x.alvo || x.rota}</span></>} valor={(x) => x.n} />
      </Secao>
      <Secao titulo="Por onde entram" contexto="Primeira página de cada sessão">
        <Barras itens={d.entradas} rotulo={(x) => x.rota} valor={(x) => x.n} />
      </Secao>
      <Secao titulo="Por onde saem" contexto="Última página de cada sessão">
        <Barras itens={d.saidas} rotulo={(x) => x.rota} valor={(x) => x.n} />
      </Secao>
      <Secao titulo="De onde vêm" contexto={`Sites que mandaram visitas · ${d.diretas} diretas (sem origem)`} className="xl:col-span-2">
        <Barras itens={d.origens} rotulo={(x) => x.nome} valor={(x) => x.n} vazio="Nenhuma visita vinda de outro site ainda." />
      </Secao>
      <Secao titulo="Tempo e rolagem por página" contexto="Tempo até a próxima página da mesma sessão (até 30 min) · quanto da página a pessoa rolou" className="xl:col-span-2">
        {d.paginas_tempo?.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Página</th><th className="py-2 font-medium">Vistas</th><th className="py-2 font-medium">Tempo médio</th><th className="py-2 font-medium">Rolagem média</th></tr></thead>
            <tbody>{d.paginas_tempo.map((r) => (
              <tr key={r.rota} className="border-b border-border/60">
                <td className="max-w-[18rem] truncate py-2 font-mono text-xs">{r.rota}</td>
                <td className="py-2 tabular">{r.vistas}</td>
                <td className="py-2 tabular">{r.tempo_s == null ? '-' : duracao(r.tempo_s)}</td>
                <td className="py-2">{r.rolagem == null ? <span className="text-muted-foreground">-</span> : (
                  <span className="flex items-center gap-2"><span className="h-1.5 w-20 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-primary/70" style={{ width: `${r.rolagem}%` }} /></span><span className="tabular text-xs">{r.rolagem}%</span></span>)}</td>
              </tr>))}
            </tbody>
          </table></div>
        ) : <p className="text-sm text-muted-foreground">Nada ainda neste período.</p>}
        <p className="mt-2 text-xs text-muted-foreground">Rolagem: medida desde a versão 0.6.7. Página sem rolagem (cabe na tela) fica com "-".</p>
      </Secao>
      <Secao titulo="Caminhos mais comuns" contexto="De uma página para a seguinte na mesma sessão">
        {d.caminhos?.length ? (
          <ul className="space-y-2 text-sm">{d.caminhos.map((c, i) => (
            <li key={i} className="flex items-center gap-2"><code className="min-w-0 truncate text-xs">{c.de}</code><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><code className="min-w-0 flex-1 truncate text-xs">{c.para}</code><span className="tabular text-muted-foreground">{c.n}</span></li>))}
          </ul>) : <p className="text-sm text-muted-foreground">Ainda ninguém passou de uma página para outra neste período.</p>}
      </Secao>
      <Secao titulo="Campanhas" contexto="Links com utm_source, utm_medium e utm_campaign (só do site)">
        {d.campanhas?.length ? (
          <ul className="space-y-2 text-sm">{d.campanhas.map((c, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate"><b className="font-medium">{c.fonte}</b>{c.meio ? ` / ${c.meio}` : ''}{c.campanha ? ` · ${c.campanha}` : ''}</span><span className="shrink-0 tabular text-muted-foreground">{c.sessoes} sessões</span></li>))}
          </ul>) : <p className="text-sm text-muted-foreground">Nenhuma visita com UTM. Ex.: <code className="text-xs">zynio.com.br/?utm_source=instagram&amp;utm_campaign=lancamento</code></p>}
      </Secao>
    </div>
  )
}

function Lugares({ d }) {
  const icone = { celular: Smartphone, tablet: Tablet, computador: Monitor }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Secao titulo="Países" contexto="Sessões"><Barras itens={d.paises} rotulo={(x) => pais(x.nome)} valor={(x) => x.sessoes} /></Secao>
      <Secao titulo="Cidades" contexto="Sessões (localização aproximada, sem guardar o IP)">
        <Barras itens={d.cidades} rotulo={(x) => `${x.cidade}${x.regiao ? `, ${x.regiao}` : ''} · ${x.pais}`} valor={(x) => x.sessoes} />
      </Secao>
      <Secao titulo="Idiomas do navegador" contexto="Sessões"><Barras itens={d.idiomas} rotulo={(x) => x.nome} valor={(x) => x.sessoes} /></Secao>
      <Secao titulo="Aparelhos" contexto="Sessões">
        <ul className="space-y-3">{d.dispositivos.map((x) => { const I = icone[x.nome] || Monitor; return (
          <li key={x.nome} className="flex items-center gap-3 text-sm"><I className="h-4 w-4 text-muted-foreground" /><span className="flex-1 capitalize">{x.nome}</span><span className="tabular text-muted-foreground">{x.sessoes}</span></li>) })}
          {!d.dispositivos.length && <li className="text-sm text-muted-foreground">Nada ainda.</li>}
        </ul>
      </Secao>
      <Secao titulo="Navegadores" contexto="Sessões"><Barras itens={d.navegadores} rotulo={(x) => x.nome} valor={(x) => x.sessoes} /></Secao>
      <Secao titulo="Sistemas" contexto="Sessões"><Barras itens={d.sistemas} rotulo={(x) => x.nome} valor={(x) => x.sessoes} /></Secao>
    </div>
  )
}

// O que melhorar em cada rota: a métrica ruim, o elemento que causa (medido no navegador de quem usa) e a dica
function OQueMelhorar({ d }) {
  const lista = d.diagnostico || []
  return (
    <Secao titulo="O que melhorar" contexto="Rotas com alguma métrica fora do bom, a causa medida no navegador de quem usa e o que fazer. Atualiza conforme chegam novas medições.">
      {!lista.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma rota com métrica ruim ou para melhorar com 3 medições ou mais no período{d.origem === 'sistema' ? '. No sistema, LCP e CLS por rota passaram a ser medidos do jeito certo na versão 0.6.9: as rotas aparecem aqui conforme as pessoas usam' : ''}.</p>
      ) : (
        <ul className="divide-y divide-border">{lista.map((x) => (
          <li key={`${x.rota}-${x.metrica}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="flex shrink-0 items-center gap-2 sm:w-56">
              <Selo cor={COR_NOTA[x.nota]}>{x.metrica} {fmtVital(x.metrica, x.p75)}</Selo>
              <code className="truncate text-xs">{x.rota}</code>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p>{x.dica}</p>
              {x.elementos.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Elemento: {x.elementos.map((e) => <code key={e.el} className="mr-2 rounded bg-muted px-1">{e.el} ({e.n}×)</code>)}</p>}
              <p className="text-xs text-muted-foreground">{x.n} medições · {VITAIS[x.metrica][2]}</p>
            </div>
          </li>
        ))}</ul>
      )}
    </Secao>
  )
}

function Tendencia({ d }) {
  const [m, setM] = useState('LCP')
  const serie = (d.vitais_dias || []).map((x) => ({ ...x, rot: `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}` }))
  const limite = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] }[m]
  return (
    <section className="cartao p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="titulo-secao">Tendência por dia (p75)</h2>
        <div className="flex rounded-lg border border-border p-0.5 text-xs">{Object.keys(VITAIS).map((k) => <button key={k} onClick={() => setM(k)} className={`rounded-md px-2 py-1 ${m === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{k}</button>)}</div>
      </div>
      {serie.length ? <div className="h-56"><ResponsiveContainer><GraficoLinha data={serie} margin={{ left: -10, right: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="rot" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => fmtVital(m, v)} width={56} />
        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v) => fmtVital(m, v)} />
        <ReferenceLine y={limite[0]} stroke="#10b981" strokeDasharray="4 4" /><ReferenceLine y={limite[1]} stroke="#ef4444" strokeDasharray="4 4" />
        <Line type="monotone" dataKey={m} name={m} stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} connectNulls />
      </GraficoLinha></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">Sem medições no período.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Linha verde: limite do bom. Vermelha: acima dela é ruim.</p>
    </section>
  )
}

function PorAparelho({ d, chaves }) {
  const disp = d.vitais_dispositivo || {}
  const nomes = { celular: 'Celular', computador: 'Computador' }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao mb-3">Celular × computador (p75)</h2>
      {Object.keys(disp).length ? (
        <table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Aparelho</th>{chaves.map((k) => <th key={k} className="py-2 font-medium">{k}</th>)}</tr></thead>
          <tbody>{Object.entries(disp).map(([k, v]) => (
            <tr key={k} className="border-b border-border/60"><td className="py-2 font-medium">{nomes[k] || k}</td>
              {chaves.map((m) => <td key={m} className={`py-2 tabular ${v[m]?.nota === 'ruim' ? 'text-red-600 dark:text-red-400' : v[m]?.nota === 'melhorar' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{fmtVital(m, v[m]?.p75)}<span className="block text-[10px] text-muted-foreground">{v[m]?.n || 0} med.</span></td>)}</tr>
          ))}</tbody></table>
      ) : <p className="text-sm text-muted-foreground">Sem medições no período.</p>}
    </section>
  )
}

function Desempenho({ d }) {
  const chaves = Object.keys(VITAIS)
  const [ordem, setOrdem] = useState('')
  const rotasOrdenadas = useMemo(() => (ordem ? [...d.vitais_rotas].sort((a, b) => (b[ordem]?.p75 ?? -1) - (a[ordem]?.p75 ?? -1)) : d.vitais_rotas), [d.vitais_rotas, ordem])
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {chaves.map((k) => { const v = d.vitais[k]; const tot = v ? v.distribuicao.bom + v.distribuicao.melhorar + v.distribuicao.ruim : 0; return (
          <div key={k} className="cartao p-4">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{k}</p>{v?.nota && <Selo cor={COR_NOTA[v.nota]}>{NOME_NOTA[v.nota]}</Selo>}</div>
            <p className="text-xs text-muted-foreground">{VITAIS[k][0]}</p>
            <p className="mt-2 text-2xl font-semibold tabular">{fmtVital(k, v?.p75)}</p>
            <p className="text-[11px] text-muted-foreground">p75 de {v?.n || 0} medições · {VITAIS[k][2]}</p>
            {tot > 0 && <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
              <span className="bg-emerald-500" style={{ width: `${(v.distribuicao.bom / tot) * 100}%` }} /><span className="bg-amber-500" style={{ width: `${(v.distribuicao.melhorar / tot) * 100}%` }} /><span className="bg-red-500" style={{ width: `${(v.distribuicao.ruim / tot) * 100}%` }} />
            </div>}
          </div>) })}
      </div>
      <OQueMelhorar d={d} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Tendencia d={d} />
        <PorAparelho d={d} chaves={chaves} />
      </div>
      <Secao titulo="Por rota" contexto="p75 de cada métrica, medido em quem visitou (dado de campo, como no Search Console). Toque no nome da métrica para ordenar pelas piores.">
        {d.vitais_rotas.length ? (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Rota</th>{chaves.map((k) => <th key={k} className="py-2 font-medium"><button onClick={() => setOrdem(ordem === k ? '' : k)} className={`hover:text-foreground ${ordem === k ? 'font-semibold text-foreground' : ''}`}>{k}{ordem === k ? ' ↓' : ''}</button></th>)}<th className="py-2 text-right font-medium">Amostras</th></tr></thead>
            <tbody>{rotasOrdenadas.map((r) => (
              <tr key={r.rota} className="border-b border-border/60">
                <td className="max-w-[16rem] truncate py-2 font-mono text-xs">{r.rota}</td>
                {chaves.map((k) => <td key={k} className={`py-2 tabular ${r[k]?.nota === 'ruim' ? 'text-red-600 dark:text-red-400' : r[k]?.nota === 'melhorar' ? 'text-amber-600 dark:text-amber-400' : ''}`}>{fmtVital(k, r[k]?.p75)}</td>)}
                <td className="py-2 text-right tabular text-muted-foreground">{r.amostras}</td>
              </tr>))}
            </tbody>
          </table></div>
        ) : <p className="text-sm text-muted-foreground">Sem medições ainda: elas chegam conforme as pessoas abrem as páginas.</p>}
      </Secao>
      {d.origem === 'sistema' && (
        <Secao titulo="API do sistema" contexto="Tempo das chamadas (amostra de 1 em 5, todas as que falham), das mais lentas para as mais rápidas">
          {d.api.length ? (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Chamada</th><th className="py-2 font-medium">p50</th><th className="py-2 font-medium">p95</th><th className="py-2 font-medium">Falhas</th><th className="py-2 text-right font-medium">Amostras</th></tr></thead>
              <tbody>{d.api.map((a) => (
                <tr key={a.rota} className="border-b border-border/60">
                  <td className="max-w-[22rem] truncate py-2 font-mono text-xs">{a.rota}</td>
                  <td className="py-2 tabular">{Math.round(a.p50)} ms</td>
                  <td className={`py-2 tabular ${a.p95 > 2500 ? 'text-red-600 dark:text-red-400' : a.p95 > 1000 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{Math.round(a.p95)} ms</td>
                  <td className={`py-2 tabular ${a.erros ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>{a.erros}</td>
                  <td className="py-2 text-right tabular text-muted-foreground">{a.n}</td>
                </tr>))}
              </tbody>
            </table></div>
          ) : <p className="text-sm text-muted-foreground">Sem amostras ainda.</p>}
        </Secao>
      )}
      {!!d.erros.length && (
        <Secao titulo="Erros de JavaScript" contexto="Erros que aconteceram no navegador de quem usa">
          <Barras itens={d.erros} rotulo={(x) => `${x.nome} · ${x.rota}`} valor={(x) => x.n} />
        </Secao>
      )}
    </div>
  )
}

function Nota({ n, tamanho = 'h-14 w-14 text-base' }) {
  const cor = n >= 90 ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : n >= 50 ? 'border-amber-500 text-amber-600 dark:text-amber-400' : 'border-red-500 text-red-600 dark:text-red-400'
  return <span className={`flex shrink-0 items-center justify-center rounded-full border-[3px] font-semibold tabular ${cor} ${tamanho}`}>{n}</span>
}

function Seo() {
  const toast = useToast()
  const [s, setS] = useState(null)
  const [auditando, setAuditando] = useState(false)
  const [aberta, setAberta] = useState(null)
  const [psi, setPsi] = useState({ url: 'https://zynio.com.br/', estrategia: 'mobile', medindo: false })
  const [chave, setChave] = useState('')
  const carregar = () => api.get('/api/analise/seo').then(setS).catch((e) => toast(e.message, 'erro'))
  useEffect(() => { carregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const auditar = async () => { setAuditando(true); try { await api.post('/api/analise/seo/auditar'); await carregar(); toast('Auditoria concluída.') } catch (e) { toast(e.message, 'erro') } finally { setAuditando(false) } }
  const medir = async () => { setPsi((p) => ({ ...p, medindo: true })); try { await api.post('/api/analise/pagespeed', { url: psi.url, estrategia: psi.estrategia }); await carregar() } catch (e) { toast(e.message, 'erro') } finally { setPsi((p) => ({ ...p, medindo: false })) } }
  const salvarChave = async () => { try { await api.put('/api/analise/config', { psi_chave: chave }); setChave(''); carregar(); toast('Chave salva (cifrada).') } catch (e) { toast(e.message, 'erro') } }
  if (!s) return <Esqueleto className="h-72" />
  const a = s.auditoria
  const paginas = a?.paginas?.slice().sort((x, y) => x.nota - y.nota) || []
  const ultimaPsi = s.pagespeed.find((x) => x.url === psi.url && x.estrategia === psi.estrategia)
  return (
    <div className="space-y-6">
      <Secao titulo="Auditoria do site" contexto={a ? `Feita ${haQuanto(a.quando)} em ${a.segundos} s · ${a.sitemap} páginas do sitemap` : 'Lê o sitemap e confere cada página como um buscador'}
        acao={<Botao tamanho="sm" icone={RefreshCw} carregando={auditando} onClick={auditar}>{a ? 'Auditar de novo' : 'Auditar agora'}</Botao>}>
        {!a ? <p className="text-sm text-muted-foreground">Ainda não auditado. Leva de 10 a 30 segundos.</p> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-5">
              <Nota n={a.nota} tamanho="h-16 w-16 text-xl" />
              <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">robots.txt</p><p className="font-medium">{a.robots === 200 ? 'ok' : `erro ${a.robots}`}</p></div>
                <div><p className="text-xs text-muted-foreground">Páginas no sitemap</p><p className="font-medium tabular">{a.sitemap}</p></div>
                <div><p className="text-xs text-muted-foreground">Resposta média</p><p className="font-medium tabular">{a.ms_medio} ms</p></div>
                <div><p className="text-xs text-muted-foreground">Sistema (/saude)</p><p className="font-medium tabular">{a.sistema?.status === 200 ? `${a.sistema.ms} ms` : 'fora do ar'}</p></div>
              </div>
            </div>
            {a.sistema?.cabecalhos && (
              <div className="flex flex-wrap gap-1.5">{Object.entries(a.sistema.cabecalhos).map(([k, v]) => <Selo key={k} cor={v ? 'verde' : 'vermelho'}>{k}</Selo>)}</div>
            )}
            {!!a.gerais.length && <ul className="space-y-1 text-sm">{a.gerais.map((g, i) => <li key={i} className="flex gap-2"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${g.g === 'alta' ? 'text-red-600' : 'text-amber-600'}`} />{g.t}</li>)}</ul>}
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Página</th><th className="py-2 font-medium">Nota</th><th className="py-2 font-medium">Tempo</th><th className="py-2 font-medium">Título</th><th className="py-2 font-medium">Problemas</th></tr></thead>
              <tbody>{paginas.map((p) => (
                <tr key={p.url} className="cursor-pointer border-b border-border/60 align-top hover:bg-muted/40" onClick={() => setAberta(aberta === p.url ? null : p.url)}>
                  <td className="py-2 font-mono text-xs">{p.caminho}</td>
                  <td className="py-2"><Nota n={p.nota} tamanho="h-8 w-8 text-xs" /></td>
                  <td className="py-2 tabular">{p.ms} ms</td>
                  <td className="max-w-[18rem] py-2"><p className="truncate">{p.titulo || '-'}</p>
                    {aberta === p.url && <div className="mt-1 space-y-0.5 text-xs text-muted-foreground"><p>{p.descricao}</p><p>H1: {p.h1} · imagens: {p.imagens} · links: {p.links} · JSON-LD: {p.json_ld} · idiomas: {p.idiomas.join(', ') || 'nenhum'}</p></div>}</td>
                  <td className="py-2">{p.problemas.length ? <ul className="space-y-0.5 text-xs">{(aberta === p.url ? p.problemas : p.problemas.slice(0, 2)).map((x, i) => <li key={i} className={x.g === 'alta' ? 'text-red-600 dark:text-red-400' : x.g === 'media' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{x.t}</li>)}{aberta !== p.url && p.problemas.length > 2 && <li className="text-muted-foreground">+{p.problemas.length - 2}</li>}</ul> : <span className="text-xs text-emerald-600">nenhum</span>}</td>
                </tr>))}
              </tbody>
            </table></div>
          </div>
        )}
      </Secao>
      <Secao titulo="PageSpeed (Lighthouse do Google)" contexto="Nota de desempenho, acessibilidade, boas práticas e SEO de uma página, medida pelo Google">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="campo h-9 min-w-0 flex-1" value={psi.url} onChange={(e) => setPsi({ ...psi, url: e.target.value })} aria-label="Página">
            {(a?.paginas?.map((p) => p.url) || ['https://zynio.com.br/']).concat('https://app.zynio.com.br/login').map((u) => <option key={u} value={u}>{u.replace('https://', '')}</option>)}
          </select>
          <div className="flex rounded-lg border border-border p-0.5">{['mobile', 'desktop'].map((e) => <button key={e} onClick={() => setPsi({ ...psi, estrategia: e })} className={`rounded-md px-3 text-sm ${psi.estrategia === e ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{e === 'mobile' ? 'Celular' : 'Computador'}</button>)}</div>
          <Botao tamanho="sm" icone={Gauge} carregando={psi.medindo} onClick={medir} className="h-9">Medir</Botao>
        </div>
        {psi.medindo && <p className="mt-2 text-xs text-muted-foreground">O Google leva de 20 a 50 segundos para medir.</p>}
        {ultimaPsi && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-6">{Object.entries({ performance: 'Desempenho', accessibility: 'Acessibilidade', 'best-practices': 'Boas práticas', seo: 'SEO' }).map(([k, n]) => (
              <div key={k} className="flex flex-col items-center gap-1.5"><Nota n={ultimaPsi.categorias[k] ?? 0} /><span className="text-xs text-muted-foreground">{n}</span></div>))}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">{Object.entries(ultimaPsi.metricas).map(([k, v]) => <span key={k}><span className="text-muted-foreground">{k}</span> <b className="font-medium">{v || '-'}</b></span>)}</div>
            {!!ultimaPsi.oportunidades.length && <ul className="space-y-1 text-sm">{ultimaPsi.oportunidades.map((o) => <li key={o.titulo} className="flex justify-between gap-3"><span>{o.titulo}</span><span className="shrink-0 tabular text-muted-foreground">economia de {o.economia_ms} ms</span></li>)}</ul>}
            <p className="text-xs text-muted-foreground">Medido {haQuanto(ultimaPsi.quando)}.</p>
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs text-muted-foreground">Chave da API do PageSpeed (opcional; sem ela o Google limita as medições){s.psi_chave && <span className="ml-1 text-emerald-600">· configurada</span>}
            <input className="campo mt-1 h-9" type="password" autoComplete="new-password" value={chave} onChange={(e) => setChave(e.target.value)} placeholder={s.psi_chave ? 'deixe vazio para manter, "-" para apagar' : 'AIza…'} /></label>
          <Botao tamanho="sm" variante="secundario" icone={KeyRound} onClick={salvarChave} disabled={!chave} className="h-9">Salvar chave</Botao>
          <a className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:pb-2.5" href="https://developers.google.com/speed/docs/insights/v5/get-started" target="_blank" rel="noreferrer">Como criar<ExternalLink className="h-3 w-3" /></a>
        </div>
      </Secao>
    </div>
  )
}

function exportar(d) {
  const linhas = [
    ...d.rotas.map((r) => ({ secao: 'rotas', nome: r.rota, valor: r.paginas, extra: `${r.sessoes} sessões` })),
    ...(d.paginas_tempo || []).map((r) => ({ secao: 'tempo', nome: r.rota, valor: r.tempo_s ?? '', extra: r.rolagem == null ? '' : `rolagem ${r.rolagem}%` })),
    ...d.cliques.map((r) => ({ secao: 'cliques', nome: r.nome, valor: r.n, extra: r.alvo || r.rota })),
    ...d.origens.map((r) => ({ secao: 'origens', nome: r.nome, valor: r.n, extra: '' })),
    ...(d.campanhas || []).map((r) => ({ secao: 'campanhas', nome: [r.fonte, r.meio, r.campanha].filter(Boolean).join(' / '), valor: r.sessoes, extra: `${r.paginas} páginas` })),
    ...d.paises.map((r) => ({ secao: 'paises', nome: pais(r.nome), valor: r.sessoes, extra: '' })),
    ...d.cidades.map((r) => ({ secao: 'cidades', nome: `${r.cidade}, ${r.regiao} (${r.pais})`, valor: r.sessoes, extra: '' })),
    ...d.dispositivos.map((r) => ({ secao: 'aparelhos', nome: r.nome, valor: r.sessoes, extra: '' })),
    ...d.navegadores.map((r) => ({ secao: 'navegadores', nome: r.nome, valor: r.sessoes, extra: '' })),
    ...Object.entries(d.vitais).map(([k, v]) => ({ secao: 'web vitals (p75)', nome: k, valor: v.p75 ?? '', extra: `${v.n} medições · ${v.nota}` })),
  ]
  baixarArquivo(`acessos-${d.origem}-${d.dias}d.csv`, paraCsv(linhas, [['secao', 'Seção'], ['nome', 'Item'], ['valor', 'Valor'], ['extra', 'Detalhe']]), 'text/csv;charset=utf-8')
}

export default function Analise() {
  const { sessao } = useProjeto()
  const [aba, setAba] = useState(() => new URLSearchParams(location.search).get('aba') || 'geral')
  const [origem, setOrigem] = useState('site')
  const [dias, setDias] = useState(7)
  const [d, setD] = useState(null)
  const [erro, setErro] = useState(null)
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const emSeo = aba === 'seo'   // trocar entre as outras abas não busca de novo (o resumo é o mesmo)
  useEffect(() => {
    if (!pode || emSeo) return undefined
    let vivo = true
    const ler = () => api.get(`/api/analise/resumo?origem=${origem}&dias=${dias}`).then((r) => { if (vivo) { setD(r); setErro(null) } }).catch((e) => vivo && setErro(e.message))
    setD(null); ler()
    const t = setInterval(() => { if (!document.hidden) ler() }, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [origem, dias, emSeo, pode])
  const abas = useMemo(() => ABAS, [])
  if (!sessao) return <Esqueleto className="h-64" />
  if (!pode) return <Aviso>Só o dono e os administradores veem os acessos.</Aviso>
  return (
    <>
      <Cabecalho titulo="Acessos e SEO" descricao="Quem acessa o site e o sistema, por onde entra, o que clica, de onde é, quanto as páginas demoram e como o site aparece para os buscadores. Medição própria, sem cookies de terceiros e sem guardar IP." />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 border-b border-border">
          {abas.map(([k, n, I]) => <button key={k} onClick={() => setAba(k)} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{n}</button>)}
        </div>
        {aba !== 'seo' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex rounded-lg border border-border p-0.5">{[['site', 'Site', Globe2], ['sistema', 'Sistema', Monitor]].map(([k, n, I]) => <button key={k} onClick={() => setOrigem(k)} className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-sm ${origem === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}><I className="h-3.5 w-3.5" />{n}</button>)}</div>
            <Botao variante="secundario" tamanho="sm" disabled={!d} onClick={() => exportar(d)}><Download className="h-4 w-4" />CSV</Botao>
            <div className="flex rounded-lg border border-border p-0.5">{[1, 7, 30, 90].map((n) => <button key={n} onClick={() => setDias(n)} className={`rounded-md px-2.5 py-1 text-sm tabular ${dias === n ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n === 1 ? 'Hoje' : `${n} dias`}</button>)}</div>
          </div>
        )}
      </div>
      {aba === 'seo' ? <Seo /> : erro ? <Aviso>{erro}</Aviso> : !d ? <Esqueleto className="h-72" /> : (
        <>
          {aba === 'geral' && <Geral d={d} />}
          {aba === 'rotas' && <Rotas d={d} />}
          {aba === 'lugares' && <Lugares d={d} />}
          {aba === 'desempenho' && <Desempenho d={d} />}
        </>
      )}
    </>
  )
}
