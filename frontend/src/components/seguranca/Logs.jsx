import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Building2, Download, FileLock2, Radio, RefreshCw, Search, ShieldAlert, UserRound } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Interruptor, useDados } from '../ui'
import { DetalheLog, FONTES, ItemLog, ORIGENS, TabelaAcoes, exportarLogs, hora, useLinhaLogs } from '../logs/Comum'

// Segurança → Logs: tudo o que acontece no sistema numa linha do tempo (atividade com a pessoa, segurança, Telegram,
// dispositivos e e-mails), o que cada pessoa fez em cada ar e sala, auditoria administrativa e eventos de segurança.
const VISOES = [['tudo', 'Linha do tempo', Activity], ['pessoas', 'Por pessoa', UserRound], ['salas', 'Salas e ares', Building2],
  ['auditoria', 'Auditoria', FileLock2], ['seguranca', 'Segurança', ShieldAlert]]
const PERIODOS = [[1, '24 h'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const tooltip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

export default function Logs() {
  const [visao, setVisao] = useState('tudo')
  const [dias, setDias] = useState(7)
  const { dados: res, erro } = useDados(() => api.get(`/api/seguranca/logs/resumo?dias=${dias}`), [dias])
  const [filtro, setFiltro] = useState({})
  const irPara = (v, f) => { setFiltro(f); setVisao(v) }
  if (erro) return <Aviso>{erro}</Aviso>
  const t = res?.totais
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{PERIODOS.map(([x, r]) => <button key={x} onClick={() => setDias(x)} className={`rounded-md px-3 py-1.5 ${dias === x ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{r}</button>)}</div>
        <div className="flex flex-wrap rounded-lg border border-border bg-card p-0.5 text-sm">
          {VISOES.map(([k, r, I]) => <button key={k} onClick={() => irPara(k, {})} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${visao === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}><I className="h-3.5 w-3.5" />{r}</button>)}
        </div>
      </div>
      {!res ? <Esqueleto className="h-24" /> : (
        <FaixaMetricas itens={[
          { rotulo: 'Registros na Atividade', valor: t.atividade.total, dica: `${t.atividade.ares} nos ares · ${t.atividade.falhas} falha(s)` },
          { rotulo: 'Eventos de segurança', valor: t.seguranca.total, dica: `${t.seguranca.logins} login(s) · ${t.seguranca.negados} negado(s) · ${t.seguranca.ataques} barrado(s)` },
          { rotulo: 'Telegram', valor: t.telegram.total, tom: t.telegram.erros ? 'ruim' : undefined, dica: `${t.telegram.erros} erro(s) · dispositivos ${t.dispositivos.total} · e-mails ${t.email.total}` },
          { rotulo: 'Integridade', valor: res.integridade.selos, dica: res.integridade.ultimo ? `selos diários · último ${new Date(res.integridade.ultimo * 1000).toLocaleDateString('pt-BR')}` : 'sem selos ainda' },
        ]} />
      )}
      {visao === 'tudo' && <Linha dias={dias} opcoes={res?.opcoes} inicial={filtro} />}
      {visao === 'pessoas' && <Pessoas res={res} dias={dias} aoEscolher={(p) => irPara('tudo', { pessoa: String(p.id).startsWith('origem:') ? '' : p.id, origem: String(p.id).startsWith('origem:') ? p.id.slice(7) : '' })} />}
      {visao === 'salas' && <Salas res={res} aoSala={(s) => irPara('tudo', { sala: s.id || '', fontes: 'atividade,dispositivos' })} aoAr={(a) => irPara('tudo', { aparelho: a.id, fontes: 'atividade' })} />}
      {visao === 'auditoria' && <Auditoria res={res} dias={dias} />}
      {visao === 'seguranca' && <Seg res={res} dias={dias} aoIp={(ip) => irPara('tudo', { ip, fontes: 'seguranca' })} />}
    </div>
  )
}

function Linha({ dias, opcoes, inicial = {}, fixo = {} }) {
  const [fontes, setFontes] = useState(inicial.fontes ? inicial.fontes.split(',') : Object.keys(FONTES))
  const [pessoa, setPessoa] = useState(inicial.pessoa || '')
  const [sala, setSala] = useState(inicial.sala || '')
  const [aparelho, setAparelho] = useState(inicial.aparelho || '')
  const [origem, setOrigem] = useState(inicial.origem || '')
  const [ip, setIp] = useState(inicial.ip || '')
  const [q, setQ] = useState('')
  const [busca, setBusca] = useState('')
  const [falhas, setFalhas] = useState(false)
  const [acessos, setAcessos] = useState(false)
  const [aoVivo, setAoVivo] = useState(false)
  const [ver, setVer] = useState(null)
  const params = { fontes: fontes.join(','), dias, q: busca, falhas, pessoa, sala, aparelho, origem, ip, com_acessos: acessos, limite: 150, ...fixo }
  const { itens, mais, erro, carregando, recarregar, carregarMais } = useLinhaLogs('/api/seguranca/logs', params, { aoVivo })
  const alternar = (f) => setFontes((v) => (v.includes(f) ? (v.length > 1 ? v.filter((x) => x !== f) : v) : [...v, f]))
  const aresSala = (opcoes?.ares || []).filter((a) => !sala || String(a.projeto_id) === String(sala))
  return (
    <section className="cartao overflow-hidden">
      <div className="space-y-3 border-b border-border p-4">
        {!fixo.fontes && <div className="flex flex-wrap gap-1.5">
          {Object.entries(FONTES).map(([k, [r, I]]) => (
            <button key={k} onClick={() => alternar(k)} aria-pressed={fontes.includes(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${fontes.includes(k) ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground'}`}><I className="h-3.5 w-3.5" />{r}</button>
          ))}
        </div>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <select className="campo h-9" value={pessoa} onChange={(e) => setPessoa(e.target.value)} aria-label="Pessoa"><option value="">Todas as pessoas</option>{(opcoes?.pessoas || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <select className="campo h-9" value={sala} onChange={(e) => { setSala(e.target.value); setAparelho('') }} aria-label="Sala"><option value="">Todas as salas</option>{(opcoes?.salas || []).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          <select className="campo h-9" value={aparelho} onChange={(e) => setAparelho(e.target.value)} aria-label="Ar"><option value="">Todos os ares</option>{aresSala.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
          <select className="campo h-9" value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Origem"><option value="">Todas as origens</option>{Object.entries(ORIGENS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
          <form onSubmit={(e) => { e.preventDefault(); setBusca(q.trim()) }} className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" autoComplete="off" className="campo h-9 pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar e Enter" aria-label="Procurar no log" />
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2"><Interruptor ligado={falhas} onChange={setFalhas} rotulo="Só falhas" />Só falhas</label>
          <label className="flex items-center gap-2"><Interruptor ligado={acessos} onChange={setAcessos} rotulo="Incluir cada acesso" />Incluir cada acesso ao sistema</label>
          <label className="flex items-center gap-2"><Interruptor ligado={aoVivo} onChange={setAoVivo} rotulo="Ao vivo" /><Radio className={`h-3.5 w-3.5 ${aoVivo ? 'text-emerald-500' : 'text-muted-foreground'}`} />Ao vivo (15 s)</label>
          {ip && <button onClick={() => setIp('')} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">IP {ip} ✕</button>}
          <span className="flex-1" />
          <Botao tamanho="sm" variante="fantasma" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao>
          <Botao tamanho="sm" variante="secundario" icone={Download} disabled={!itens?.length} onClick={() => exportarLogs(itens, `logs-${dias}d`, 'csv')}>CSV</Botao>
          <Botao tamanho="sm" variante="fantasma" disabled={!itens?.length} onClick={() => exportarLogs(itens, `logs-${dias}d`, 'json')}>JSON</Botao>
        </div>
      </div>
      {erro && <div className="p-4"><Aviso>{erro}</Aviso></div>}
      {!itens ? <div className="p-4"><Esqueleto className="h-64" /></div> : itens.length ? (
        <>
          <ul className="divide-y divide-border">{itens.map((r) => <ItemLog key={`${r.fonte}-${r.id}`} r={r} aoAbrir={setVer} />)}</ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span>{itens.length} registro(s)</span>
            {mais && <Botao tamanho="sm" variante="secundario" carregando={carregando} onClick={carregarMais}>Carregar mais</Botao>}
          </div>
        </>
      ) : <p className="p-6 text-center text-sm text-muted-foreground">Nada com esses filtros no período.</p>}
      <DetalheLog r={ver} aoFechar={() => setVer(null)} />
    </section>
  )
}

function Pessoas({ res, aoEscolher }) {
  if (!res) return <Esqueleto className="h-64" />
  return (
    <div className="space-y-6">
      <section className="cartao overflow-hidden">
        <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">O que cada pessoa fez nos ares</h2>
          <p className="text-xs text-muted-foreground">Ligou, desligou, subiu ou baixou a temperatura comparado com o estado anterior do mesmo ar. Toque numa linha para ver cada ação. A pessoa é registrada a partir da versão 0.6.9; antes disso aparece a origem.</p></div>
        <TabelaAcoes linhas={res.pessoas} aoEscolher={aoEscolher} />
      </section>
      <section className="cartao p-5">
        <h2 className="titulo-secao mb-3">Ações administrativas por pessoa</h2>
        <ul className="space-y-1.5 text-sm">{res.admin.map((a) => <li key={a.quem} className="flex justify-between"><span>{a.quem}</span><span className="tabular text-muted-foreground">{a.n}</span></li>)}
          {!res.admin.length && <li className="text-muted-foreground">Nenhuma no período.</li>}</ul>
      </section>
    </div>
  )
}

function Salas({ res, aoSala, aoAr }) {
  if (!res) return <Esqueleto className="h-64" />
  return (
    <div className="space-y-6">
      <section className="cartao overflow-hidden">
        <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Por sala</h2><p className="text-xs text-muted-foreground">Toque numa sala para ver tudo o que aconteceu nela.</p></div>
        <TabelaAcoes linhas={res.salas} rotulo="Sala" aoEscolher={aoSala} />
      </section>
      <section className="cartao overflow-hidden">
        <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">Por ar</h2></div>
        <TabelaAcoes linhas={res.ares} rotulo="Ar" aoEscolher={aoAr} />
      </section>
    </div>
  )
}

function Auditoria({ dias }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Ações administrativas: usuários, senhas, e-mails de login, sessões, backup, configurações, marca, DNS, Vercel, transmissores, mapa e integrações. Ações nos ares ficam na Linha do tempo.</p>
      <Linha dias={dias} fixo={{ fontes: 'atividade', categoria: 'admin' }} />
    </div>
  )
}

function Seg({ res, dias, aoIp }) {
  const serie = useMemo(() => (res?.seg_tipos || []).map((x) => ({ ...x })), [res])
  if (!res) return <Esqueleto className="h-64" />
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="cartao p-5">
          <h2 className="titulo-secao mb-2">Eventos por tipo</h2>
          <div className="h-64"><ResponsiveContainer><BarChart data={serie} layout="vertical" margin={{ left: 40, right: 12 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="tipo" tickLine={false} axisLine={false} fontSize={11} width={110} stroke="hsl(var(--muted-foreground))" />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={tooltip} /><Bar dataKey="n" name="Eventos" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} />
          </BarChart></ResponsiveContainer></div>
        </section>
        <section className="cartao overflow-hidden">
          <div className="border-b border-border px-5 py-3"><h2 className="titulo-secao">IPs com mais eventos</h2><p className="text-xs text-muted-foreground">Toque para ver o que cada IP fez. Bloquear e liberar fica em <Link to="/seguranca" className="underline">Monitoramento</Link>.</p></div>
          <ul className="divide-y divide-border text-sm">{res.ips.map((i) => (
            <li key={i.ip}><button onClick={() => aoIp(i.ip)} className="flex w-full justify-between gap-2 px-5 py-2 text-left hover:bg-muted/40">
              <span className="font-mono text-xs">{i.ip} <span className="text-muted-foreground">{i.pais}</span></span>
              <span className="tabular text-muted-foreground">{i.n}{i.suspeitos ? <span className="ml-2 text-red-600 dark:text-red-400">{i.suspeitos} suspeito(s)</span> : null}</span>
            </button></li>))}</ul>
        </section>
      </div>
      <Linha dias={dias} fixo={{ fontes: 'seguranca' }} />
      <p className="text-xs text-muted-foreground">Gerado {hora(res.gerado_em)}. Cada acesso comum ao sistema ({res.totais.seguranca.acessos} no período) fica de fora; ligue “Incluir cada acesso” para ver.</p>
    </div>
  )
}
