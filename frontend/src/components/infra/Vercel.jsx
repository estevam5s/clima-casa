import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowUpRight, ExternalLink, FileText, Globe, HardDrive, KeyRound, RefreshCw, Rocket, RotateCcw, Trash2, X } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Modal, Selo, useToast, confirmar } from '../ui'
import { Dica, Medidor, PROJETOS, bytes, dataHora, num } from './comum'

// Vercel do app e do site: lida e operada pelo agente do escritório (o token não fica na nuvem).
const COR_ESTADO = { READY: 'verde', ERROR: 'vermelho', BUILDING: 'ambar', QUEUED: 'ambar', INITIALIZING: 'ambar', CANCELED: 'cinza' }
const NOME_ESTADO = { READY: 'Pronta', ERROR: 'Erro', BUILDING: 'Construindo', QUEUED: 'Na fila', INITIALIZING: 'Iniciando', CANCELED: 'Cancelada' }

export function VercelGeral({ resumo, saude, uso, recarregar }) {
  const app = resumo?.projetos?.find((p) => p.nome === 'clima-casa'), site = resumo?.projetos?.find((p) => p.nome === 'clima-escritorio-site')
  const L = uso?.limites || resumo?.limites || {}
  const pubs = (resumo?.projetos || []).reduce((s, p) => s + p.publicacoes, 0)
  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Plano Vercel', valor: resumo ? (resumo.equipe.plano === 'hobby' ? 'Hobby (grátis)' : resumo.equipe.plano) : '…', dica: resumo?.equipe.nome },
        { rotulo: 'Região da API', valor: saude?.regiao || '…', dica: saude?.ambiente },
        { rotulo: 'Banco (Supabase)', valor: saude ? `${saude.banco_ms} ms` : '…', dica: 'tempo de uma consulta agora' },
        { rotulo: 'Agente do escritório', valor: saude ? (saude.agente_online ? 'Online' : 'Offline') : '…', tom: saude && !saude.agente_online ? 'ruim' : undefined, dica: saude?.fila ? `${saude.fila.total_1h ?? 0} comandos na última hora` : '' },
      ]} />
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

export function Uso({ uso, dias, setDias }) {
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

export function Publicacoes({ dono }) {
  const toast = useToast()
  const [projeto, setProjeto] = useState('clima-casa')
  const [dados, setDados] = useState(null), [erro, setErro] = useState('')
  const [log, setLog] = useState(null), [ocupado, setOcupado] = useState('')
  const carregar = useCallback(() => { setDados(null); setErro(''); api.get(`/api/infra/publicacoes?projeto=${projeto}&limite=60`).then(setDados).catch((e) => setErro(e.message)) }, [projeto])
  useEffect(() => { carregar() }, [carregar])
  const acao = async (d, a) => {
    const textos = { promover: `Colocar no ar a publicação de ${dataHora(d.criado)}? O site passa a servir essa versão na hora.`, republicar: 'Construir de novo esta publicação e pôr no ar?', cancelar: 'Cancelar esta publicação em andamento?', apagar: `Apagar a publicação de ${dataHora(d.criado)}? Não dá para desfazer.` }
    if (!await confirmar(textos[a])) return
    setOcupado(d.id + a)
    try { await api.post('/api/infra/publicacoes/acao', { projeto, id: d.id, acao: a }); toast('Feito.'); carregar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const [filtro, setFiltro] = useState('todos'), [busca, setBusca] = useState(''), [buscaLog, setBuscaLog] = useState('')
  const itens = (dados?.itens || []).filter((d) => (filtro === 'todos' || (filtro === 'erro' ? d.estado === 'ERROR' : filtro === 'pronto' ? d.estado === 'READY' : ['BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.estado)))
    && (!busca || `${d.url} ${d.origem || ''} ${d.criador || ''}`.toLowerCase().includes(busca.toLowerCase())))
  const contar = (f) => (dados?.itens || []).filter((d) => (f === 'erro' ? d.estado === 'ERROR' : f === 'pronto' ? d.estado === 'READY' : ['BUILDING', 'QUEUED', 'INITIALIZING'].includes(d.estado))).length
  const verLog = async (d) => { setBuscaLog(''); setLog({ d, linhas: null }); try { setLog({ d, linhas: (await api.get(`/api/infra/publicacoes/${d.id}/log?projeto=${projeto}`)).linhas }) } catch (e) { setLog({ d, linhas: [], erro: e.message }) } }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{PROJETOS.map(([k, n]) => <button key={k} onClick={() => setProjeto(k)} className={`rounded-md px-3 py-1.5 ${projeto === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{[['todos', 'Todas'], ['pronto', 'Prontas'], ['erro', 'Com erro'], ['andamento', 'Em andamento']].map(([k, n]) => <button key={k} onClick={() => setFiltro(k)} className={`rounded-md px-2.5 py-1.5 ${filtro === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}{k !== 'todos' && dados ? <span className="ml-1 tabular text-xs text-muted-foreground">{contar(k)}</span> : null}</button>)}</div>
        <input type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por endereço, commit ou autor" className="campo h-9 w-full sm:w-64" aria-label="Buscar publicações" />
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!dados ? (!erro && <Esqueleto className="h-80" />) : (
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Estado</th><th className="px-4 py-2 font-medium">Ambiente</th><th className="px-4 py-2 font-medium">Build</th><th className="px-4 py-2 font-medium">Endereço e origem</th><th className="px-4 py-2 text-right font-medium">Ações</th></tr></thead>
            <tbody className="divide-y divide-border">{!itens.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma publicação com esse filtro.</td></tr>}{itens.map((d) => (
              <tr key={d.id} className={d.atual ? 'bg-primary/5' : ''}>
                <td className="whitespace-nowrap px-4 py-2.5"><p className="font-medium">{dataHora(d.criado)}</p><p className="text-xs text-muted-foreground">{haQuanto(Math.floor(d.criado / 1000))}{d.criador ? ` · ${d.criador}` : ''}</p></td>
                <td className="px-4 py-2.5"><div className="flex items-center gap-1.5"><Selo cor={COR_ESTADO[d.estado] || 'cinza'}>{NOME_ESTADO[d.estado] || d.estado}</Selo>{d.atual && <Selo cor="verde">No ar</Selo>}</div></td>
                <td className="px-4 py-2.5 text-xs">{d.alvo === 'production' ? 'Produção' : 'Prévia'}</td>
                <td className="px-4 py-2.5 tabular text-muted-foreground">{d.duracao_s != null ? `${d.duracao_s} s` : '—'}</td>
                <td className="max-w-[18rem] px-4 py-2.5"><a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="block truncate text-muted-foreground hover:text-foreground hover:underline">{d.url}</a>{d.origem && <p className="truncate text-xs text-muted-foreground" title={d.origem}>{d.origem}</p>}</td>
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
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input type="search" autoComplete="off" value={buscaLog} onChange={(e) => setBuscaLog(e.target.value)} placeholder="Filtrar linhas" className="campo h-8 flex-1" aria-label="Filtrar o log" />
                <span className="text-xs text-muted-foreground">{log.linhas.filter((l) => /error|erro|failed|falh/i.test(l.texto)).length} linha(s) com erro</span>
                <Botao tamanho="sm" variante="secundario" onClick={() => { navigator.clipboard?.writeText(log.linhas.map((l) => l.texto).join('\n')); toast('Log copiado.') }}>Copiar</Botao>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-200">{log.linhas.filter((l) => !buscaLog || l.texto.toLowerCase().includes(buscaLog.toLowerCase())).map((l, i) => (
                <div key={i} className={/error|erro|failed|falh/i.test(l.texto) ? 'text-red-400' : /warn|aviso/i.test(l.texto) ? 'text-amber-300' : ''}><span className="select-none text-zinc-500">{l.t ? new Date(l.t).toLocaleTimeString('pt-BR') : ''}  </span>{l.texto}</div>))}{!log.linhas.length && 'Sem linhas.'}</pre>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export function Config({ resumo, dono, recarregar }) {
  const toast = useToast()
  const [projeto, setProjeto] = useState('clima-casa')
  const p = resumo?.projetos?.find((x) => x.nome === projeto)
  const [vars, setVars] = useState(null), [ocupado, setOcupado] = useState(false)
  const manter = Math.min(100, Math.max(3, p?.retencao?.deploymentsToKeep || 10))   // as mais novas que ficam (mesma regra da retenção)
  useEffect(() => { setVars(null); api.get(`/api/infra/variaveis?projeto=${projeto}`).then(setVars).catch(() => setVars({ itens: [] })) }, [projeto])
  const limpar = async () => {
    setOcupado(true)
    try {
      const sim = await api.post('/api/infra/limpar', { projeto, manter, simular: true })
      if (!sim.apagaria) { toast('Nada para apagar: só restam as mais novas.'); return }
      if (!await confirmar(`Apagar ${sim.apagaria} publicação(ões) antiga(s) de ${projeto}? Ficam as ${manter} mais novas e a que está no ar. Não dá para desfazer.`)) return
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
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-border p-2"><dt className="text-xs text-muted-foreground">Apaga depois de</dt><dd className="font-medium tabular">{p?.retencao ? `${p.retencao.expirationDays} dias` : '—'}</dd></div>
            <div className="rounded-md border border-border p-2"><dt className="text-xs text-muted-foreground">Mantém sempre</dt><dd className="font-medium tabular">{p?.retencao ? `as ${p.retencao.deploymentsToKeep} mais novas` : '—'}</dd></div>
          </dl>
          {/* a Vercel não muda mais a retenção pela API (17/11/2026): só no painel dela */}
          <p className="mt-2 text-xs text-muted-foreground">Para mudar a regra: na Vercel, projeto → Settings → Build and Deployment → Deployment Retention Policy.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`https://vercel.com/estevamsouzalaureth001s-projects/${projeto}/settings/build-and-deployment`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted">Abrir na Vercel</a>
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
