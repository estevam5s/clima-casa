import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, ArrowUpRight, Cloud, Cpu, Database, ExternalLink, FileText, Globe, HardDrive, KeyRound, Laptop, Monitor, RefreshCw, Rocket, RotateCcw, Server, Star, Trash2, X, Zap } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, Modal, Selo, useToast } from '../components/ui'

// Infra: a Vercel do sistema (app e site) e os computadores com o agente. A Vercel é lida e operada PELO AGENTE do
// escritório (o token tem acesso amplo e não fica na nuvem); por isso esta tela precisa do agente online.
const ABAS = [['geral', 'Visão geral', Activity], ['uso', 'Uso', Zap], ['publicacoes', 'Publicações', Rocket], ['agentes', 'Agentes', Laptop], ['config', 'Configurações', KeyRound]]
const PROJETOS = [['clima-casa', 'App (app.zynio.com.br)'], ['clima-escritorio-site', 'Site (zynio.com.br)']]
const bytes = (b) => { if (b == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = b; while (v >= 1024 && i < 4) { v /= 1024; i++ } return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 2 : 1 })} ${u[i]}` }
const num = (n) => (n ?? 0).toLocaleString('pt-BR')
const dataHora = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const COR_ESTADO = { READY: 'verde', ERROR: 'vermelho', BUILDING: 'ambar', QUEUED: 'ambar', INITIALIZING: 'ambar', CANCELED: 'cinza' }
const NOME_ESTADO = { READY: 'Pronta', ERROR: 'Erro', BUILDING: 'Construindo', QUEUED: 'Na fila', INITIALIZING: 'Iniciando', CANCELED: 'Cancelada' }

function Medidor({ rotulo, valor, limite, fmt = num, dica }) {
  const pct = limite ? Math.min(100, (valor / limite) * 100) : 0
  const cor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-primary'
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-[11px] tabular text-muted-foreground">{pct.toFixed(pct < 1 ? 2 : 0)}%</p></div>
      <p className="mt-1 text-sm font-semibold tabular">{fmt(valor)} <span className="font-normal text-muted-foreground">/ {fmt(limite)}</span></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(pct, 0.6)}%` }} /></div>
      {dica && <p className="mt-1.5 text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  )
}

function Dica({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"><p className="mb-1 font-medium">{label}</p>{payload.map((p) => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmt ? fmt(p.value) : num(p.value)}</p>)}</div>
}

function Geral({ resumo, saude, uso, recarregar }) {
  const app = resumo?.projetos?.find((p) => p.nome === 'clima-casa'), site = resumo?.projetos?.find((p) => p.nome === 'clima-escritorio-site')
  const L = uso?.limites || resumo?.limites || {}
  const pubs = (resumo?.projetos || []).reduce((s, p) => s + p.publicacoes, 0)
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Plano Vercel', resumo ? (resumo.equipe.plano === 'hobby' ? 'Hobby (grátis)' : resumo.equipe.plano) : '…', Cloud, resumo?.equipe.nome],
          ['Região da API', saude?.regiao || '…', Globe, saude?.ambiente],
          ['Banco (Supabase)', saude ? `${saude.banco_ms} ms` : '…', Database, 'tempo de uma consulta agora'],
          ['Agente do escritório', saude ? (saude.agente_online ? 'Online' : 'Offline') : '…', Server, saude?.fila ? `${saude.fila.total_1h ?? 0} comandos na última hora` : ''],
        ].map(([r, v, I, d]) => (
          <div key={r} className="cartao p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><I className="h-3.5 w-3.5" />{r}</div><p className="mt-1.5 text-lg font-semibold">{v}</p>{d && <p className="truncate text-xs text-muted-foreground">{d}</p>}</div>
        ))}
      </div>
      <section className="cartao p-5">
        <div className="mb-3 flex items-end justify-between"><div><h2 className="titulo-secao">Uso nos últimos 30 dias</h2><p className="text-xs text-muted-foreground">Conta inteira da Vercel (todos os projetos), contra os limites do plano Hobby</p></div>
          <a href="https://vercel.com/estevamsouzalaureth001s-projects/~/usage" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Ver na Vercel<ArrowUpRight className="h-3 w-3" /></a></div>
        {!uso ? <Esqueleto className="h-32" /> : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Medidor rotulo="Requisições (CDN)" valor={uso.total.requisicoes} limite={L.requisicoes} dica={`${Math.round((uso.total.cache / Math.max(1, uso.total.requisicoes)) * 100)}% saíram do cache`} />
            <Medidor rotulo="Invocações de função" valor={uso.total.invocacoes} limite={L.invocacoes} dica={`${num(uso.total.erros)} com erro ou tempo esgotado`} />
            <Medidor rotulo="Transferência (saída)" valor={uso.total.saida} limite={L.transferencia_rapida} fmt={bytes} />
            <Medidor rotulo="Memória das funções (GB-hora)" valor={uso.total.gb_horas} limite={L.gb_horas} fmt={(v) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} />
            <Medidor rotulo="Minutos de build" valor={Math.round(uso.total.build_s / 60)} limite={L.build_min} dica={`${uso.total.builds} builds · ${uso.total.builds_falhos} falharam`} />
            <div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Publicações guardadas (app + site)</p><p className="mt-1 text-sm font-semibold tabular">{pubs} <span className="font-normal text-muted-foreground">· app {app?.publicacoes ?? '—'} · site {site?.publicacoes ?? '—'}</span></p><p className="mt-1.5 text-[11px] text-muted-foreground">Cada uma guarda o pacote da função: é o que pesa em “Functions Storage” (a Vercel não informa esse número pela API). Diminui quando publicações expiram ou são apagadas, em Configurações.</p></div>
          </div>
        )}
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {[app, site].filter(Boolean).map((p) => (
          <section key={p.id} className="cartao p-5">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div><h2 className="titulo-secao">{p.nome === 'clima-casa' ? 'App' : 'Site'} · {p.nome}</h2><p className="text-xs text-muted-foreground">{p.framework || 'sem framework (Vite + Python)'} · Node {p.node}</p></div>
              {p.ataque ? <Selo cor="vermelho">Modo de ataque ligado</Selo> : <Selo cor="verde">Normal</Selo>}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">No ar desde</dt><dd className="font-medium">{p.producao ? haQuanto(Math.floor(p.producao.criado / 1000)) : '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Publicações guardadas</dt><dd className="font-medium tabular">{p.publicacoes}{p.com_erro ? <span className="text-red-600 dark:text-red-400"> · {p.com_erro} com erro</span> : ''}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Retenção</dt><dd className="font-medium">{p.retencao ? `${p.retencao.expirationDays} dias · mantém ${p.retencao.deploymentsToKeep}` : 'padrão'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Mais antiga</dt><dd className="font-medium">{p.mais_antiga ? dataHora(p.mais_antiga) : '—'}</dd></div>
            </dl>
            <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
              {p.dominios.map((d) => <li key={d.nome} className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-muted-foreground" /><a href={`https://${d.nome}`} target="_blank" rel="noreferrer" className="hover:underline">{d.nome}</a>{d.redireciona && <span className="text-xs text-muted-foreground">→ {d.redireciona}</span>}{d.verificado === false && <Selo cor="ambar">não verificado</Selo>}</li>)}
            </ul>
          </section>
        ))}
      </div>
      <div className="flex justify-end"><Botao variante="secundario" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao></div>
    </div>
  )
}

function Uso({ uso, dias, setDias }) {
  if (!uso) return <Esqueleto className="h-96" />
  const serie = uso.serie.map((s) => ({ ...s, rotulo: s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7), saida_mb: s.saida / 1048576, build_min: s.build_s / 60 }))
  const graf = (titulo, chave, nome, cor, fmt, tipo = 'area', extra) => (
    <section className="cartao p-5">
      <h3 className="mb-2 text-sm font-semibold">{titulo}</h3>
      <div className="h-52"><ResponsiveContainer>{tipo === 'area' ? (
        <AreaChart data={serie} margin={{ left: 0, right: 8, top: 6 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" minTickGap={16} /><YAxis tickLine={false} axisLine={false} width={44} fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={fmt} />
          <Tooltip content={<Dica fmt={fmt} />} /><Area dataKey={chave} name={nome} type="monotone" stroke={cor} fill={cor} fillOpacity={0.12} strokeWidth={2} />{extra}</AreaChart>
      ) : (
        <BarChart data={serie} margin={{ left: 0, right: 8, top: 6 }}><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" minTickGap={16} /><YAxis tickLine={false} axisLine={false} width={44} fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={fmt} />
          <Tooltip content={<Dica fmt={fmt} />} cursor={{ fill: 'hsl(var(--muted))' }} /><Bar dataKey={chave} name={nome} fill={cor} radius={[3, 3, 0, 0]} />{extra}</BarChart>
      )}</ResponsiveContainer></div>
    </section>
  )
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5 text-sm self-start w-fit">{[7, 14, 30].map((d) => <button key={d} onClick={() => setDias(d)} className={`rounded-md px-3 py-1.5 ${dias === d ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{d} dias</button>)}</div>
      <div className="grid gap-6 lg:grid-cols-2">
        {graf('Requisições por dia', 'requisicoes', 'Requisições', 'hsl(var(--primary))', (v) => num(Math.round(v)), 'area', <Area dataKey="cache" name="Do cache" type="monotone" stroke="#0ea5e9" fill="none" strokeDasharray="4 4" strokeWidth={1.5} />)}
        {graf('Invocações de função', 'invocacoes', 'Invocações', '#8b5cf6', (v) => num(Math.round(v)), 'area', <Area dataKey="erros" name="Com erro" type="monotone" stroke="#dc2626" fill="none" strokeWidth={1.5} />)}
        {graf('Transferência de saída (MB)', 'saida_mb', 'MB', '#0ea5e9', (v) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 'bar')}
        {graf('Minutos de build', 'build_min', 'Minutos', '#f59e0b', (v) => (v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }), 'bar')}
      </div>
      <section className="cartao p-5">
        <h3 className="mb-3 text-sm font-semibold">Requisições por projeto da conta</h3>
        <ul className="space-y-2">{uso.por_projeto.map((p) => (
          <li key={p.nome} className="text-sm"><div className="flex justify-between"><span className={PROJETOS.some(([k]) => k === p.nome) ? 'font-medium' : 'text-muted-foreground'}>{p.nome}</span><span className="tabular text-muted-foreground">{num(p.requisicoes)} · {p.pct}%</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} /></div></li>
        ))}</ul>
      </section>
    </div>
  )
}

function Publicacoes({ dono }) {
  const toast = useToast()
  const [projeto, setProjeto] = useState('clima-casa')
  const [dados, setDados] = useState(null), [erro, setErro] = useState('')
  const [log, setLog] = useState(null), [ocupado, setOcupado] = useState('')
  const carregar = useCallback(() => { setDados(null); setErro(''); api.get(`/api/infra/publicacoes?projeto=${projeto}&limite=60`).then(setDados).catch((e) => setErro(e.message)) }, [projeto])
  useEffect(() => { carregar() }, [carregar])
  const acao = async (d, a) => {
    const textos = { promover: `Colocar no ar a publicação de ${dataHora(d.criado)}? O site passa a servir essa versão na hora.`, republicar: 'Construir de novo esta publicação e pôr no ar?', cancelar: 'Cancelar esta publicação em andamento?', apagar: `Apagar a publicação de ${dataHora(d.criado)}? Não dá para desfazer.` }
    if (!window.confirm(textos[a])) return
    setOcupado(d.id + a)
    try { await api.post('/api/infra/publicacoes/acao', { projeto, id: d.id, acao: a }); toast('Feito.'); carregar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const verLog = async (d) => { setLog({ d, linhas: null }); try { setLog({ d, linhas: (await api.get(`/api/infra/publicacoes/${d.id}/log?projeto=${projeto}`)).linhas }) } catch (e) { setLog({ d, linhas: [], erro: e.message }) } }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{PROJETOS.map(([k, n]) => <button key={k} onClick={() => setProjeto(k)} className={`rounded-md px-3 py-1.5 ${projeto === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados ? (!erro && <Esqueleto className="h-80" />) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Estado</th><th className="px-4 py-2 font-medium">Build</th><th className="px-4 py-2 font-medium">Endereço</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr></thead>
            <tbody className="divide-y divide-border">{dados.itens.map((d) => (
              <tr key={d.id} className={d.atual ? 'bg-primary/5' : ''}>
                <td className="whitespace-nowrap px-4 py-2.5"><p className="font-medium">{dataHora(d.criado)}</p><p className="text-xs text-muted-foreground">{haQuanto(Math.floor(d.criado / 1000))}{d.criador ? ` · ${d.criador}` : ''}</p></td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><Selo cor={COR_ESTADO[d.estado] || 'cinza'}>{NOME_ESTADO[d.estado] || d.estado}</Selo>{d.atual && <Selo cor="verde">No ar</Selo>}</div></td>
                <td className="px-4 py-2.5 tabular text-muted-foreground">{d.duracao_s != null ? `${d.duracao_s} s` : '—'}</td>
                <td className="max-w-[16rem] truncate px-4 py-2.5"><a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hover:underline">{d.url}</a></td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right">
                  <button onClick={() => verLog(d)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Log do build" aria-label="Log do build"><FileText className="h-4 w-4" /></button>
                  {dono && d.estado === 'READY' && !d.atual && <button disabled={!!ocupado} onClick={() => acao(d, 'promover')} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Colocar no ar (voltar para esta versão)" aria-label="Colocar no ar"><RotateCcw className="h-4 w-4" /></button>}
                  {dono && d.atual && <button disabled={!!ocupado} onClick={() => acao(d, 'republicar')} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Construir de novo" aria-label="Construir de novo"><Rocket className="h-4 w-4" /></button>}
                  {dono && ['BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.estado) && <button disabled={!!ocupado} onClick={() => acao(d, 'cancelar')} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Cancelar" aria-label="Cancelar"><X className="h-4 w-4" /></button>}
                  {dono && !d.atual && <button disabled={!!ocupado} onClick={() => acao(d, 'apagar')} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" title="Apagar" aria-label="Apagar"><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {log && (
        <Modal aberto titulo={`Log do build · ${dataHora(log.d.criado)}`} onFechar={() => setLog(null)} largura="max-w-3xl">
          {log.erro ? <Aviso>{log.erro}</Aviso> : !log.linhas ? <Esqueleto className="h-64" /> : (
            <pre className="max-h-[60vh] overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-200">{log.linhas.map((l) => `${l.t ? new Date(l.t).toLocaleTimeString('pt-BR') : ''}  ${l.texto}`).join('\n') || 'Sem linhas.'}</pre>
          )}
        </Modal>
      )}
    </div>
  )
}

function Agentes({ dono }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const carregar = useCallback(() => api.get('/api/agentes').then(setD).catch((e) => toast(e.message, 'erro')), [toast])
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t) }, [carregar])
  const preferir = async (id) => { try { setD(await api.post('/api/agentes/preferido', { id })); toast(id ? 'Computador preferido salvo. Ele assume em até 20 s se estiver ligado.' : 'Sem preferência: fica principal quem estiver ligado.') } catch (e) { toast(e.message, 'erro') } }
  const esquecer = async (id) => { if (!window.confirm('Tirar este computador da lista?')) return; try { setD(await api.post('/api/agentes/esquecer', { id })) } catch (e) { toast(e.message, 'erro') } }
  if (!d) return <Esqueleto className="h-64" />
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Pode ter o agente em mais de um computador (o Mac e um PC Windows no escritório, por exemplo). Só um é o <b className="text-foreground">principal</b> e manda os comandos; os outros ficam de <b className="text-foreground">reserva</b> e assumem sozinhos em até {d.aluguel_s} s se o principal sumir. Tudo fica no banco: trocar de computador não perde nada.</p>
      {!d.maquinas.length && <Aviso tipo="alerta">Nenhum computador com o agente novo ainda. Atualize o agente (Mac: ./instalar-servico.sh · Windows: instalar-windows.ps1).</Aviso>}
      <div className="grid gap-3 md:grid-cols-2">
        {d.maquinas.map((m) => { const I = /Windows/.test(m.sistema) ? Monitor : /Linux/.test(m.sistema) ? Cpu : Laptop; return (
          <div key={m.id} className={`cartao p-4 ${m.principal ? 'border-primary/50' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border"><I className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">{m.nome}{m.principal ? <Selo cor="verde">Principal</Selo> : m.online ? <Selo>Reserva</Selo> : <Selo cor="cinza">Desligado</Selo>}{d.preferido === m.id && <Selo cor="ambar">Preferido</Selo>}</p>
                <p className="text-xs text-muted-foreground">{m.sistema} · Python {m.python}</p>
                <p className="text-xs text-muted-foreground">{m.online ? 'visto agora' : `visto ${haQuanto(m.visto)}`} · id {m.id}</p>
              </div>
            </div>
            {dono && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {d.preferido === m.id ? <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(null)}>Tirar preferência</Botao> : <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(m.id)}>Preferir este</Botao>}
                {!m.online && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={() => esquecer(m.id)}>Tirar da lista</Botao>}
              </div>
            )}
          </div>
        ) })}
      </div>
      <p className="text-xs text-muted-foreground">Preferido: quando ele está ligado, o principal passa o posto para ele. Útil para deixar o PC do escritório sempre no comando e o Mac só de reserva.</p>
    </div>
  )
}

function Config({ resumo, dono, recarregar }) {
  const toast = useToast()
  const [projeto, setProjeto] = useState('clima-casa')
  const p = resumo?.projetos?.find((x) => x.nome === projeto)
  const [dias, setDias] = useState(30), [manter, setManter] = useState(10)
  useEffect(() => { if (p?.retencao) { setDias(p.retencao.expirationDays); setManter(p.retencao.deploymentsToKeep) } }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [vars, setVars] = useState(null), [ocupado, setOcupado] = useState(false)
  useEffect(() => { setVars(null); api.get(`/api/infra/variaveis?projeto=${projeto}`).then(setVars).catch(() => setVars({ itens: [] })) }, [projeto])
  const salvarRet = async () => { setOcupado(true); try { await api.post('/api/infra/retencao', { projeto, dias, manter }); toast('Retenção salva na Vercel.'); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) } }
  const limpar = async () => {
    setOcupado(true)
    try {
      const sim = await api.post('/api/infra/limpar', { projeto, manter, simular: true })
      if (!sim.apagaria) { toast('Nada para apagar: só restam as mais novas.'); return }
      if (!window.confirm(`Apagar ${sim.apagaria} publicação(ões) antiga(s) de ${projeto}? Ficam as ${manter} mais novas e a que está no ar. Não dá para desfazer.`)) return
      const r = await api.post('/api/infra/limpar', { projeto, manter })
      toast(`${r.apagadas} apagada(s).${r.faltam ? ` Faltam ${r.faltam}: clique de novo.` : ''}`); recarregar()
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm w-fit">{PROJETOS.map(([k, n]) => <button key={k} onClick={() => setProjeto(k)} className={`rounded-md px-3 py-1.5 ${projeto === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao p-5">
          <h2 className="titulo-secao flex items-center gap-2"><HardDrive className="h-4 w-4" />Espaço das publicações</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cada publicação guarda o pacote da função. Menos publicações guardadas = menos “Functions Storage”. A Vercel apaga sozinha as mais velhas que a retenção, sempre mantendo as mais novas.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Apagar depois de (dias)<input type="number" min="1" max="365" value={dias} disabled={!dono} onChange={(e) => setDias(+e.target.value)} className="campo mt-1 h-9" /></label>
            <label className="text-xs text-muted-foreground">Manter sempre as mais novas<input type="number" min="3" max="100" value={manter} disabled={!dono} onChange={(e) => setManter(+e.target.value)} className="campo mt-1 h-9" /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao disabled={!dono || ocupado} onClick={salvarRet}>Salvar retenção</Botao>
            <Botao variante="secundario" icone={Trash2} disabled={!dono || ocupado} onClick={limpar}>Apagar antigas agora</Botao>
          </div>
          {!dono && <p className="mt-2 text-xs text-muted-foreground">Só o dono muda a retenção e apaga publicações.</p>}
        </section>
        <section className="cartao p-5">
          <h2 className="titulo-secao flex items-center gap-2"><KeyRound className="h-4 w-4" />Variáveis de ambiente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Só os nomes e onde valem. Os valores nunca saem da Vercel; para mudar, use o painel da Vercel.</p>
          {!vars ? <Esqueleto className="mt-3 h-40" /> : (
            <ul className="mt-3 divide-y divide-border text-sm">{vars.itens.map((v) => <li key={v.nome} className="flex items-center justify-between gap-2 py-1.5"><code className="truncate text-xs">{v.nome}</code><span className="shrink-0 text-xs text-muted-foreground">{v.alvos.join(', ')}</span></li>)}</ul>
          )}
          <a href={`https://vercel.com/estevamsouzalaureth001s-projects/${projeto}/settings/environment-variables`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Abrir na Vercel<ExternalLink className="h-3 w-3" /></a>
        </section>
      </div>
    </div>
  )
}

export default function Infra() {
  const { sessao } = useProjeto()
  const dono = sessao?.papel === 'dono'
  const [aba, setAba] = useState(() => { try { return localStorage.getItem('clima-infra-aba') || 'geral' } catch { return 'geral' } })
  const mudarAba = (a) => { setAba(a); try { localStorage.setItem('clima-infra-aba', a) } catch { /* sem armazenamento */ } }
  const [resumo, setResumo] = useState(null), [saude, setSaude] = useState(null), [uso, setUso] = useState(null), [dias, setDias] = useState(30)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => {
    setErro('')
    api.get('/api/infra/saude').then(setSaude).catch(() => {})
    api.get('/api/infra/resumo').then(setResumo).catch((e) => setErro(e.message))
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setUso(null); api.get(`/api/infra/uso?dias=${dias}`).then(setUso).catch(() => {}) }, [dias])
  const conteudo = useMemo(() => ({
    geral: <Geral resumo={resumo} saude={saude} uso={uso} recarregar={carregar} />,
    uso: <Uso uso={uso} dias={dias} setDias={setDias} />,
    publicacoes: <Publicacoes dono={dono} />,
    agentes: <Agentes dono={dono} />,
    config: <Config resumo={resumo} dono={dono} recarregar={carregar} />,
  }), [resumo, saude, uso, dias, dono, carregar])
  if (sessao && !['dono', 'admin'].includes(sessao.papel)) return <Aviso>Só o dono e os administradores veem a infraestrutura.</Aviso>
  return (
    <div>
      <Cabecalho titulo="Infra" descricao="Vercel do app e do site (uso, publicações, retenção, variáveis) e os computadores com o agente. A Vercel é operada pelo agente do escritório: o token não fica na nuvem." />
      {erro && <div className="mb-4"><Aviso tipo="alerta"><span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />{erro}</span></Aviso></div>}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map(([k, n, I]) => (
          <button key={k} onClick={() => mudarAba(k)} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{n}</button>
        ))}
      </div>
      {conteudo[aba]}
    </div>
  )
}
