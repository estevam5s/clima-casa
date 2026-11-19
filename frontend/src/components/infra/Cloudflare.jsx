import { useCallback, useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Check, Copy, Download, ExternalLink, KeyRound, Lock, Mail, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Esqueleto, Interruptor, Modal, Selo, Vazio, useToast, confirmar } from '../ui'
import { Dica, num } from './comum'

// Cloudflare do zynio.com.br, operada pelo agente (CLOUDFLARE_API_TOKEN só no .env dele). Tudo é "DNS only": o site e o
// app são servidos pela Vercel, então aqui ficam DNS, DNSSEC, e-mail recebido, Turnstile e a auditoria da conta.
const ZONA = 'zynio.com.br'
const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const curto = (nome) => (nome === ZONA ? '@' : nome?.endsWith('.' + ZONA) ? nome.slice(0, -(ZONA.length + 1)) : nome)
const diaMes = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function useCf(caminho) {
  const [d, setD] = useState(null), [erro, setErro] = useState('')
  const carregar = useCallback(() => { setErro(''); return api.get(caminho).then(setD).catch((e) => setErro(e.message)) }, [caminho])
  useEffect(() => { setD(null); carregar() }, [carregar])
  return { d, setD, erro, carregar }
}

function Copiar({ texto }) {
  const [ok, setOk] = useState(false)
  return (
    <button type="button" aria-label="Copiar" title="Copiar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => { navigator.clipboard?.writeText(String(texto)).then(() => { setOk(true); setTimeout(() => setOk(false), 1500) }).catch(() => {}) }}>
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function Segmentos({ opcoes, valor, onChange }) {
  return <div className="flex w-fit rounded-lg border border-border bg-card p-0.5 text-sm">{opcoes.map(([k, n]) => <button key={k} type="button" onClick={() => onChange(k)} className={`rounded-md px-3 py-1.5 ${valor === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
}

const PERMISSOES = [
  ['Zona', 'Zone', 'Zone', 'Read', 'ler a zona, nameservers e plano'],
  ['Zona', 'Zone', 'DNS', 'Edit', 'ver, criar e mudar registros; DNSSEC'],
  ['Zona', 'Zone', 'Zone Settings', 'Read', 'ver SSL, TLS e outras opções'],
  ['Zona', 'Zone', 'Analytics', 'Read', 'gráficos de consultas DNS e e-mails recebidos'],
  ['Zona', 'Zone', 'Email Routing Rules', 'Edit', 'criar e ligar endereços @zynio.com.br'],
  ['Conta', 'Account', 'Email Routing Addresses', 'Edit', 'cadastrar e-mails de destino'],
  ['Conta', 'Account', 'Turnstile', 'Read', 'ver os widgets anti-robô'],
  ['Conta', 'Account', 'Account Analytics', 'Read', 'gráfico de desafios do Turnstile'],
  ['Conta', 'Account', 'Account Settings', 'Read', 'histórico de alterações (auditoria)'],
]

export function CfConectar({ compacto }) {
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><KeyRound className="h-4 w-4" />{compacto ? 'Criar ou trocar o token' : 'Conectar a Cloudflare'}</h2>
      {!compacto && <p className="mt-1 text-sm text-muted-foreground">A Cloudflare é operada pelo agente do escritório, como a Vercel: o token fica só no <code>.env</code> do computador do agente e nunca vai para a nuvem.</p>}
      <ol className="mt-4 space-y-3 text-sm">
        <li><b>1.</b> Abra <a className="inline-flex items-center gap-1 underline" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Cloudflare → My Profile → API Tokens<ExternalLink className="h-3 w-3" /></a> e clique em <b>Create Token</b> → <b>Create Custom Token</b>. Nome sugerido: “Clima Escritório · agente”.</li>
        <li><b>2.</b> Em <b>Permissions</b>, adicione uma linha para cada item:
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2 font-medium">Onde</th><th className="pr-2 font-medium">Permissão</th><th className="pr-2 font-medium">Nível</th><th className="font-medium">Para quê</th></tr></thead>
            <tbody>{PERMISSOES.map(([onde, a, b, n, para]) => <tr key={b} className="border-t border-border"><td className="py-1.5 pr-2">{onde}</td><td className="pr-2"><code>{a} · {b}</code></td><td className="pr-2"><code>{n}</code></td><td className="text-muted-foreground">{para}</td></tr>)}</tbody>
          </table></div>
        </li>
        <li><b>3.</b> Em <b>Zone Resources</b>: Include → Specific zone → <b>{ZONA}</b>. Em <b>Account Resources</b>: Include → a sua conta. Validade: deixe sem data ou ponha uma e anote para renovar.</li>
        <li><b>4.</b> Clique em <b>Continue to summary</b> → <b>Create Token</b> e copie o token (ele só aparece uma vez).</li>
        <li><b>5.</b> No computador do agente, abra o arquivo <code>.env</code> da pasta do projeto e acrescente uma linha: <code>CLOUDFLARE_API_TOKEN=</code> seguido do token. Não mande o token por chat nem e-mail.</li>
        <li><b>6.</b> Atualize o agente: no Mac, <code>./instalar-servico.sh</code>; no Windows ou Linux, rode o instalador de novo. Depois volte aqui e clique em Atualizar.</li>
      </ol>
    </section>
  )
}

export function ErroCf({ erro, tentar }) {
  if (!erro) return null
  if (/CLOUDFLARE_API_TOKEN/.test(erro)) return <CfConectar />
  return <Aviso tipo="alerta"><span className="flex flex-wrap items-center gap-2">{erro}{tentar && <button type="button" onClick={tentar} className="underline">Tentar de novo</button>}</span></Aviso>
}

function Grafico({ dados, series, tipo = 'area', altura = 'h-52' }) {
  const G = tipo === 'area' ? AreaChart : BarChart
  return (
    <div className={altura}><ResponsiveContainer>
      <G data={dados} margin={{ left: 0, right: 8, top: 6 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="rotulo" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={40} fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
        <Tooltip content={<Dica />} cursor={tipo === 'area' ? undefined : { fill: 'hsl(var(--muted))' }} />
        {series.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
        {series.map(([k, n, cor]) => tipo === 'area'
          ? <Area key={k} dataKey={k} name={n} type="monotone" stroke={cor} fill={cor} fillOpacity={0.12} strokeWidth={2} />
          : <Bar key={k} dataKey={k} name={n} fill={cor} stackId="s" radius={[2, 2, 0, 0]} />)}
      </G>
    </ResponsiveContainer></div>
  )
}

function Ranking({ titulo, itens, fmt = (x) => x }) {
  const max = Math.max(1, ...itens.map((i) => i.consultas))
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{titulo}</p>
      {!itens.length ? <p className="text-xs text-muted-foreground">Sem dados no período.</p> : (
        <ul className="space-y-1.5">{itens.map((i) => (
          <li key={i.nome} className="text-xs"><div className="flex justify-between gap-2"><span className="truncate font-mono">{fmt(i.nome)}</span><span className="tabular text-muted-foreground">{num(i.consultas)}</span></div>
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${(i.consultas / max) * 100}%` }} /></div></li>
        ))}</ul>
      )}
    </div>
  )
}

// ---------------- DNS ----------------
const TTLS = [[1, 'Automático'], [300, '5 min'], [3600, '1 hora'], [86400, '1 dia']]
const VAZIO = { tipo: 'A', nome: '', conteudo: '', ttl: 1, proxy: false, prioridade: 10, comentario: '' }

function FormRegistro({ inicial, onFechar, onSalvo }) {
  const toast = useToast()
  const editando = !!inicial?.id
  const [f, setF] = useState(() => editando ? { tipo: inicial.tipo, nome: curto(inicial.nome), conteudo: (inicial.conteudo || '').replace(/^"|"$/g, ''), ttl: inicial.ttl, proxy: inicial.proxy, prioridade: inicial.prioridade ?? 10, comentario: inicial.comentario || '' } : VAZIO)
  const [confirmar, setConfirmar] = useState(''), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'number' ? +e.target.value : e.target.value) : e }))
  const nomeFinal = !f.nome || f.nome === '@' ? ZONA : `${f.nome.replace(new RegExp(`\\.?${ZONA.replace(/\./g, '\\.')}$`), '')}.${ZONA}`
  const podeProxy = ['A', 'AAAA', 'CNAME'].includes(f.tipo)
  const salvar = async (e) => {
    e.preventDefault(); setOcupado(true); setErro('')
    const corpo = { ...f, nome: f.nome || '@', proxy: podeProxy && f.proxy, prioridade: ['MX', 'SRV'].includes(f.tipo) ? f.prioridade : null, comentario: f.comentario || null, confirmar: confirmar || null }
    try {
      await (editando ? api.put(`/api/infra/cf/dns/${inicial.id}`, corpo) : api.post('/api/infra/cf/dns', corpo))
      toast(editando ? 'Registro atualizado na Cloudflare.' : 'Registro criado na Cloudflare.'); onSalvo()
    } catch (x) { setErro(x.message) } finally { setOcupado(false) }
  }
  return (
    <Modal aberto titulo={editando ? `Editar ${inicial.tipo} ${curto(inicial.nome)}` : 'Novo registro DNS'} onFechar={onFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="space-y-3">
        {editando && inicial.protegido && <Aviso tipo="alerta">Registro protegido: serve a <b>{inicial.para}</b>. Mudar o valor errado pode tirar o site, o app ou os e-mails do ar.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <label className="rotulo">Tipo<select className="campo mt-1" value={f.tipo} onChange={set('tipo')} disabled={editando}>{['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA', 'SRV'].map((t) => <option key={t}>{t}</option>)}</select></label>
          <label className="rotulo">Nome<input className="campo mt-1 font-mono" value={f.nome} onChange={set('nome')} placeholder="@ para a raiz, ou ex.: status" required disabled={editando} /></label>
        </div>
        <label className="rotulo block">Conteúdo
          {f.tipo === 'TXT' ? <textarea className="campo mt-1 h-24 font-mono text-xs" value={f.conteudo} onChange={set('conteudo')} required placeholder="texto do registro, sem aspas" />
            : <input className="campo mt-1 font-mono" value={f.conteudo} onChange={set('conteudo')} required placeholder={{ A: '203.0.113.10', AAAA: '2001:db8::1', CNAME: 'destino.exemplo.com', MX: 'mx.exemplo.com', CAA: '0 issue "letsencrypt.org"', SRV: '1 443 destino.exemplo.com' }[f.tipo]} />}
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="rotulo">TTL<select className="campo mt-1" value={f.ttl} onChange={(e) => setF((x) => ({ ...x, ttl: +e.target.value }))}>{TTLS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
          {['MX', 'SRV'].includes(f.tipo) && <label className="rotulo">Prioridade<input type="number" min="0" max="65535" className="campo mt-1" value={f.prioridade} onChange={set('prioridade')} /></label>}
          {podeProxy && <div className="rotulo">Proxy da Cloudflare<div className="mt-2 flex items-center gap-2"><Interruptor ligado={f.proxy} onChange={set('proxy')} rotulo="Proxy" /><span className="text-xs text-muted-foreground">{f.proxy ? 'Laranja (proxy)' : 'DNS only'}</span></div></div>}
        </div>
        {podeProxy && f.proxy && <p className="ajuda">Nunca ligue o proxy nos endereços da Vercel (raiz, app, www): quebra o certificado. O sistema recusa.</p>}
        <label className="rotulo block">Comentário (opcional)<input className="campo mt-1" maxLength={100} value={f.comentario} onChange={set('comentario')} placeholder="ex.: página de status" /></label>
        <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs"><span className="text-muted-foreground">Fica assim: </span>{nomeFinal} <b>{f.tipo}</b> {['MX', 'SRV'].includes(f.tipo) ? `${f.prioridade} ` : ''}{f.conteudo || '…'}</div>
        {editando && inicial.protegido && <label className="rotulo block">Para confirmar, digite <code>{inicial.nome}</code><input className="campo mt-1 font-mono" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="off" /></label>}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao type="submit" carregando={ocupado} disabled={ocupado || (editando && inicial.protegido && confirmar.trim().toLowerCase() !== inicial.nome)}>{editando ? 'Salvar alteração' : 'Criar registro'}</Botao></div>
      </form>
    </Modal>
  )
}

function ApagarRegistro({ r, onFechar, onApagado }) {
  const toast = useToast()
  const [confirmar, setConfirmar] = useState(''), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('')
  const apagar = async () => {
    setOcupado(true); setErro('')
    try { await api.post(`/api/infra/cf/dns/${r.id}/apagar`, { confirmar: confirmar || null }); toast('Registro apagado.'); onApagado() } catch (x) { setErro(x.message) } finally { setOcupado(false) }
  }
  return (
    <Modal aberto titulo={`Apagar ${r.tipo} ${curto(r.nome)}?`} onFechar={onFechar}>
      <div className="space-y-3 text-sm">
        <p className="break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs">{r.nome} {r.tipo} {r.conteudo}</p>
        {r.protegido ? <Aviso tipo="alerta">Este registro serve a <b>{r.para}</b>. Apagar pode tirar o site, o app ou os e-mails do ar. Não dá para desfazer (só recriando à mão).</Aviso> : <p className="text-muted-foreground">Não dá para desfazer: para voltar, crie o registro de novo.</p>}
        {r.protegido && <label className="rotulo block">Digite <code>{r.nome}</code> para confirmar<input className="campo mt-1 font-mono" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="off" /></label>}
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao variante="perigo" icone={Trash2} carregando={ocupado} disabled={ocupado || (r.protegido && confirmar.trim().toLowerCase() !== r.nome)} onClick={apagar}>Apagar registro</Botao></div>
      </div>
    </Modal>
  )
}

export function CfDNS({ dono }) {
  const toast = useToast()
  const { d, erro, carregar } = useCf('/api/infra/cf/dns')
  const [busca, setBusca] = useState(''), [tipo, setTipo] = useState('todos')
  const [form, setForm] = useState(null), [apagar, setApagar] = useState(null)
  const [dias, setDias] = useState('7')
  const analise = useCf(`/api/infra/cf/dns/analise?dias=${dias}`)
  const itens = useMemo(() => (d?.itens || []).filter((r) => (tipo === 'todos' || r.tipo === tipo) && (!busca || `${r.nome} ${r.conteudo} ${r.para}`.toLowerCase().includes(busca.toLowerCase()))), [d, busca, tipo])
  const tipos = useMemo(() => ['todos', ...new Set((d?.itens || []).map((r) => r.tipo))], [d])
  const exportar = async () => {
    try {
      const r = await api.get('/api/infra/cf/dns/exportar')
      const url = URL.createObjectURL(new Blob([r.texto], { type: 'text/plain' }))
      const a = document.createElement('a'); a.href = url; a.download = r.arquivo; a.click(); URL.revokeObjectURL(url)
    } catch (e) { toast(e.message, 'erro') }
  }
  if (erro) return <ErroCf erro={erro} tentar={carregar} />
  return (
    <div className="space-y-6">
      <section className="cartao">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="relative min-w-[12rem] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input className="campo h-9 pl-8" placeholder="Buscar por nome, valor ou finalidade" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
          <select className="campo h-9 w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">{tipos.map((t) => <option key={t} value={t}>{t === 'todos' ? 'Todos os tipos' : t}</option>)}</select>
          <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
          {dono && <Botao tamanho="sm" variante="secundario" icone={Download} onClick={exportar}>Exportar zona</Botao>}
          {dono && <Botao tamanho="sm" icone={Plus} onClick={() => setForm({})}>Novo registro</Botao>}
        </div>
        {!d ? <Esqueleto className="m-4 h-64" /> : !itens.length ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum registro com esse filtro.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Tipo</th><th className="px-4 py-2 font-medium">Nome</th><th className="px-4 py-2 font-medium">Conteúdo</th><th className="px-4 py-2 font-medium">Proxy</th><th className="px-4 py-2 font-medium">Serve para</th>{dono && <th className="px-4 py-2 text-right font-medium">Ações</th>}</tr></thead>
              <tbody className="divide-y divide-border">{itens.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5"><Selo>{r.tipo}</Selo></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{curto(r.nome)}</td>
                  <td className="max-w-[22rem] px-4 py-2.5"><div className="flex items-center gap-1"><span className="truncate font-mono text-xs" title={r.conteudo}>{r.prioridade != null && r.tipo === 'MX' ? `${r.prioridade} ` : ''}{r.conteudo}</span><Copiar texto={r.conteudo} /></div></td>
                  <td className="px-4 py-2.5">{r.proxy ? <Selo cor="ambar">Proxy</Selo> : <span className="text-xs text-muted-foreground">DNS only</span>}</td>
                  <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-xs">{(r.protegido || r.travado) && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Protegido" />}{r.para}{r.travado && <Selo cor="azul">gerenciado</Selo>}</span></td>
                  {dono && <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {!r.travado && <button type="button" onClick={() => setForm(r)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="Editar" aria-label="Editar"><Pencil className="h-4 w-4" /></button>}
                    {!r.travado && <button type="button" onClick={() => setApagar(r)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" title="Apagar" aria-label="Apagar"><Trash2 className="h-4 w-4" /></button>}
                  </td>}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {d && <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">{d.itens.length} registros · cadeado = protegido (mudar exige digitar o nome) · “gerenciado” = travado pelo redirecionamento de e-mail.</p>}
      </section>

      <section className="cartao p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 className="titulo-secao">Consultas DNS</h2><p className="text-xs text-muted-foreground">Quantas vezes a internet perguntou pelos endereços do domínio (servidores da Cloudflare)</p></div><Segmentos opcoes={[['7', '7 dias'], ['30', '30 dias']]} valor={dias} onChange={setDias} /></div>
        {analise.erro ? <ErroCf erro={analise.erro} /> : !analise.d ? <Esqueleto className="h-52" /> : analise.d.indisponivel ? <Aviso tipo="alerta">A Cloudflare não liberou estes números: {analise.d.indisponivel}</Aviso> : (
          <>
            <p className="mb-2 text-2xl font-semibold tabular">{num(analise.d.total)} <span className="text-sm font-normal text-muted-foreground">consultas em {analise.d.dias} dias</span></p>
            <Grafico dados={analise.d.serie.map((s) => ({ ...s, rotulo: diaMes(s.dia) }))} series={[['consultas', 'Consultas', 'hsl(var(--primary))']]} />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Ranking titulo="Mais consultados" itens={analise.d.por_nome || []} fmt={curto} />
              <Ranking titulo="Por tipo" itens={analise.d.por_tipo || []} />
              <Ranking titulo="Por resposta" itens={analise.d.por_resposta || []} />
            </div>
          </>
        )}
      </section>
      {form && <FormRegistro inicial={form.id ? form : null} onFechar={() => setForm(null)} onSalvo={() => { setForm(null); carregar() }} />}
      {apagar && <ApagarRegistro r={apagar} onFechar={() => setApagar(null)} onApagado={() => { setApagar(null); carregar() }} />}
    </div>
  )
}

// ---------------- E-mail ----------------
const ESTADO_EMAIL = { ready: ['Ativo', 'verde'], enabled: ['Ativo', 'verde'], syncing: ['Sincronizando', 'ambar'], unconfigured: ['Não configurado', 'vermelho'], misconfigured: ['Registros com problema', 'vermelho'] }

export function CfEmail({ dono }) {
  const toast = useToast()
  const { d, setD, erro, carregar } = useCf('/api/infra/cf/email')
  const [novo, setNovo] = useState({ local: '', destino: '' }), [novoDestino, setNovoDestino] = useState('')
  const [pega, setPega] = useState(null), [ocupado, setOcupado] = useState('')
  useEffect(() => { if (d) setPega({ ativo: d.pega_tudo.ativa, acao: d.pega_tudo.acao === 'drop' ? 'drop' : 'forward', destino: d.pega_tudo.destinos?.[0] || '' }) }, [d])
  const verificados = (d?.destinos || []).filter((x) => x.verificado)
  const fazer = async (chave, f, msg) => { setOcupado(chave); try { setD(await f()); if (msg) toast(msg) } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const regra = (corpo, msg) => fazer(corpo.id || 'novo', () => api.post('/api/infra/cf/email/regra', corpo), msg)
  if (erro) return <ErroCf erro={erro} tentar={carregar} />
  if (!d) return <Esqueleto className="h-96" />
  const [rot, cor] = ESTADO_EMAIL[d.estado] || [d.estado || '—', 'cinza']
  const at = d.atividade || {}
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Redirecionamento</p><p className="mt-1.5 flex items-center gap-2 text-lg font-semibold">{d.ativo ? 'Ligado' : 'Desligado'}<Selo cor={cor}>{rot}</Selo></p><p className="text-xs text-muted-foreground">e-mails para @{ZONA} chegam nos destinos abaixo</p></div>
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Endereços</p><p className="mt-1.5 text-lg font-semibold tabular">{d.regras.filter((r) => r.ativa).length} ativos <span className="text-sm font-normal text-muted-foreground">de {d.regras.length}</span></p><p className="text-xs text-muted-foreground">pega-tudo {d.pega_tudo.ativa ? 'ligado' : 'desligado'}</p></div>
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Últimos 7 dias</p><p className="mt-1.5 text-lg font-semibold tabular">{at.serie ? num(at.serie.reduce((s, x) => s + x.recebidos, 0)) : '—'} <span className="text-sm font-normal text-muted-foreground">recebidos</span></p><p className="text-xs text-muted-foreground">{at.serie ? `${num(at.serie.reduce((s, x) => s + x.encaminhados, 0))} encaminhados · ${num(at.serie.reduce((s, x) => s + x.rejeitados, 0))} rejeitados` : 'sem dados'}</p></div>
      </div>

      <section className="cartao">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="titulo-secao">Endereços @{ZONA}</h2><p className="text-xs text-muted-foreground">Só recebem e encaminham. Para responder como eles, use “Enviar como” no Gmail com o SMTP do Resend.</p></div><Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao></div>
        {!d.regras.length ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum endereço ainda.</p> : (
          <ul className="divide-y divide-border">{d.regras.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{r.endereco}</p><p className="truncate text-xs text-muted-foreground">{r.acao === 'forward' ? `→ ${r.destinos.join(', ')}` : r.acao === 'drop' ? 'descarta' : r.acao}</p></div>
              <Interruptor ligado={r.ativa} disabled={!dono || !!ocupado} rotulo={`Ligar ${r.endereco}`} onChange={(v) => regra({ acao: v ? 'ligar' : 'desligar', id: r.id }, v ? 'Endereço ligado.' : 'Endereço desligado.')} />
              {dono && <button type="button" disabled={!!ocupado} onClick={async () => await confirmar(`Apagar ${r.endereco}? E-mails para ele passam a cair no pega-tudo (ou voltam com erro se ele estiver desligado).`) && regra({ acao: 'apagar', id: r.id }, 'Endereço apagado.')} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950" title="Apagar" aria-label={`Apagar ${r.endereco}`}><Trash2 className="h-4 w-4" /></button>}
            </li>
          ))}</ul>
        )}
        {dono && (
          <form className="flex flex-wrap items-end gap-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); regra({ acao: 'criar', local: novo.local, destino: novo.destino || verificados[0]?.email }, `${novo.local}@${ZONA} criado.`); setNovo({ local: '', destino: '' }) }}>
            <label className="rotulo min-w-[12rem] flex-1">Novo endereço<div className="mt-1 flex items-center"><input className="campo rounded-r-none" value={novo.local} onChange={(e) => setNovo((x) => ({ ...x, local: e.target.value.toLowerCase() }))} placeholder="comercial" pattern="[a-z0-9._+\-]{1,64}" required /><span className="flex h-10 items-center rounded-r-lg border border-l-0 border-border bg-muted px-2 text-xs text-muted-foreground">@{ZONA}</span></div></label>
            <label className="rotulo min-w-[12rem] flex-1">Encaminhar para<select className="campo mt-1" value={novo.destino} onChange={(e) => setNovo((x) => ({ ...x, destino: e.target.value }))}>{verificados.map((x) => <option key={x.email} value={x.email}>{x.email}</option>)}</select></label>
            <Botao type="submit" icone={Plus} disabled={!verificados.length || ocupado === 'novo'} carregando={ocupado === 'novo'}>Criar endereço</Botao>
          </form>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao p-5">
          <h2 className="titulo-secao">Pega-tudo</h2>
          <p className="mt-1 text-sm text-muted-foreground">O que fazer com e-mails para qualquer outro endereço @{ZONA} (erros de digitação, endereços antigos).</p>
          {pega && <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2"><Interruptor ligado={pega.ativo} disabled={!dono} rotulo="Pega-tudo" onChange={(v) => setPega((x) => ({ ...x, ativo: v }))} /><span className="text-sm">{pega.ativo ? 'Ligado' : 'Desligado: endereços desconhecidos voltam com erro'}</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="rotulo">Ação<select className="campo mt-1" disabled={!dono} value={pega.acao} onChange={(e) => setPega((x) => ({ ...x, acao: e.target.value }))}><option value="forward">Encaminhar</option><option value="drop">Descartar em silêncio</option></select></label>
              {pega.acao === 'forward' && <label className="rotulo">Para<select className="campo mt-1" disabled={!dono} value={pega.destino} onChange={(e) => setPega((x) => ({ ...x, destino: e.target.value }))}>{verificados.map((x) => <option key={x.email} value={x.email}>{x.email}</option>)}</select></label>}
            </div>
            {dono && <Botao carregando={ocupado === 'pega'} disabled={!!ocupado} onClick={() => fazer('pega', () => api.post('/api/infra/cf/email/pega-tudo', { ...pega, destino: pega.destino || verificados[0]?.email }), 'Pega-tudo salvo.')}>Salvar pega-tudo</Botao>}
          </div>}
        </section>
        <section className="cartao p-5">
          <h2 className="titulo-secao">Destinos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Caixas que recebem os encaminhamentos. Cada uma precisa confirmar pelo link que a Cloudflare manda.</p>
          <ul className="mt-3 divide-y divide-border text-sm">{d.destinos.map((x) => <li key={x.email} className="flex items-center justify-between gap-2 py-2"><span className="truncate">{x.email}</span>{x.verificado ? <Selo cor="verde">Confirmado</Selo> : <Selo cor="ambar">Aguardando confirmação</Selo>}</li>)}</ul>
          {dono && <form className="mt-3 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (await confirmar(`A Cloudflare vai mandar um e-mail de confirmação para ${novoDestino}. Continuar?`)) { fazer('dest', () => api.post('/api/infra/cf/email/destino', { email: novoDestino }), 'Destino cadastrado. Falta clicar no link de confirmação.'); setNovoDestino('') } }}>
            <input type="email" className="campo min-w-[12rem] flex-1" placeholder="outro@exemplo.com" value={novoDestino} onChange={(e) => setNovoDestino(e.target.value)} required />
            <Botao type="submit" variante="secundario" icone={Plus} disabled={ocupado === 'dest'}>Cadastrar destino</Botao>
          </form>}
        </section>
      </div>

      <section className="cartao p-5">
        <h2 className="titulo-secao">Atividade dos últimos 7 dias</h2>
        {at.indisponivel ? <Aviso tipo="alerta">A Cloudflare não liberou a atividade: {at.indisponivel}</Aviso> : !at.serie?.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum e-mail recebido no período.</p> : (
          <>
            <div className="mt-3"><Grafico tipo="bar" dados={at.serie.map((s) => ({ ...s, rotulo: diaMes(s.dia) }))} series={[['encaminhados', 'Encaminhados', 'hsl(var(--primary))'], ['rejeitados', 'Rejeitados', COR_RUIM]]} /></div>
            {!!at.ultimos?.length && (
              <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1.5 pr-2 font-medium">Quando</th><th className="pr-2 font-medium">De</th><th className="pr-2 font-medium">Para</th><th className="pr-2 font-medium">Resultado</th><th className="font-medium">SPF · DKIM · DMARC</th></tr></thead>
                <tbody className="divide-y divide-border">{at.ultimos.map((e, i) => <tr key={i}><td className="py-1.5 pr-2 whitespace-nowrap">{quando(e.quando)}</td><td className="max-w-[14rem] truncate pr-2">{e.de}</td><td className="pr-2">{e.para}</td><td className="pr-2"><Selo cor={e.estado === 'delivered' ? 'verde' : 'vermelho'}>{e.estado === 'delivered' ? 'Encaminhado' : e.estado}</Selo></td><td className="text-muted-foreground">{[e.spf, e.dkim, e.dmarc].map((v) => v || '—').join(' · ')}</td></tr>)}</tbody>
              </table></div>
            )}
            {!dono && <p className="mt-2 text-xs text-muted-foreground">A lista de mensagens (remetentes) só aparece para o dono.</p>}
          </>
        )}
      </section>
    </div>
  )
}

// ---------------- Turnstile ----------------
const CORES_EVENTO = ['hsl(var(--primary))', '#0ea5e9', '#f59e0b', '#dc2626', '#64748b']   // séries do recharts (não aceitam classe do Tailwind)
const COR_RUIM = CORES_EVENTO[3]
const COR_EVENTO = {   // vermelho só para falha; os resolvidos em tons da marca e azul
  challenge_issued: '#94a3b8', challenge_non_interactive_solved: 'hsl(var(--primary))', challenge_interactive_solved: '#0ea5e9',
  challenge_non_interactive_siteverify_solved: '#5eead4', challenge_interactive_siteverify_solved: '#7dd3fc',
}
const NOME_EVENTO = {
  challenge_issued: 'Desafios abertos', challenge_non_interactive_solved: 'Resolvidos sem clique', challenge_interactive_solved: 'Resolvidos com clique',
  challenge_non_interactive_siteverify_solved: 'Confirmados no servidor (sem clique)', challenge_interactive_siteverify_solved: 'Confirmados no servidor (com clique)',
  challenge_siteverify_failed_invalid_token: 'Recusados no servidor (token inválido)', challenge_failed: 'Falharam', challenge_interactive_failed: 'Falharam com clique',
}

export function CfTurnstile() {
  const [dias, setDias] = useState('7')
  const { d, erro, carregar } = useCf(`/api/infra/cf/turnstile?dias=${dias}`)
  if (erro) return <ErroCf erro={erro} tentar={carregar} />
  if (!d) return <Esqueleto className="h-80" />
  const ds = d.desafios || {}
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">O Turnstile protege o login, o “Esqueci a senha” e os formulários do site contra robôs, sem quebra-cabeça para quem é gente.</p>
      {!d.widgets.length ? <Vazio icone={ShieldCheck} titulo="Nenhum widget do Turnstile nesta conta" texto="Crie em Cloudflare → Turnstile e ponha as chaves no .env e na Vercel." /> : (
        <div className="grid gap-3 md:grid-cols-2">{d.widgets.map((w) => (
          <div key={w.sitekey} className="cartao p-4">
            <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-muted-foreground" />{w.nome}<Selo>{w.modo === 'managed' ? 'Gerenciado' : w.modo === 'invisible' ? 'Invisível' : w.modo === 'non-interactive' ? 'Sem interação' : w.modo}</Selo></p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">Chave do site (pública): <code className="truncate">{w.sitekey}</code><Copiar texto={w.sitekey} /></p>
            <p className="text-xs text-muted-foreground">Domínios: {w.dominios.join(', ') || '—'} · alterado {quando(w.alterado)}</p>
          </div>
        ))}</div>
      )}
      <section className="cartao p-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><h2 className="titulo-secao">Desafios por dia</h2><Segmentos opcoes={[['7', '7 dias'], ['30', '30 dias']]} valor={dias} onChange={setDias} /></div>
        {ds.indisponivel ? <Aviso tipo="alerta">A Cloudflare não liberou estes números: {ds.indisponivel}</Aviso> : !ds.serie?.length ? <p className="text-sm text-muted-foreground">Nenhum desafio no período.</p>
          : <Grafico tipo="bar" dados={ds.serie.map((s) => ({ ...s, rotulo: diaMes(s.dia) }))} series={ds.tipos.map((t) => [t, NOME_EVENTO[t] || t, /failed|invalid/.test(t) ? COR_RUIM : COR_EVENTO[t] || CORES_EVENTO[4]])} />}
      </section>
    </div>
  )
}

// ---------------- Segurança: DNSSEC, configurações da zona e auditoria ----------------
const ESTADO_DNSSEC = { active: ['Ligado', 'verde'], pending: ['Esperando o DS no Registro.br', 'ambar'], disabled: ['Desligado', 'cinza'], 'pending-disabled': ['Desligando', 'ambar'] }

export function CfSeguranca({ dono }) {
  const toast = useToast()
  const dnssec = useCf('/api/infra/cf/dnssec')
  const config = useCf('/api/infra/cf/config')
  const audit = useCf('/api/infra/cf/auditoria?limite=60')
  const [ocupado, setOcupado] = useState(false), [confirmar, setConfirmar] = useState(''), [desligar, setDesligar] = useState(false)
  const mudar = async (ligar) => {
    if (ligar && !await confirmar('Ligar o DNSSEC? Depois é preciso colar o registro DS no Registro.br; até lá nada muda para os visitantes.')) return
    setOcupado(true)
    try { dnssec.setD(await api.post('/api/infra/cf/dnssec', { ligar, confirmar: confirmar || null })); toast(ligar ? 'DNSSEC ligado na Cloudflare. Agora cole o DS no Registro.br.' : 'DNSSEC desligado.'); setDesligar(false) } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  if (dnssec.erro && /CLOUDFLARE_API_TOKEN/.test(dnssec.erro)) return <CfConectar />
  const ds = dnssec.d
  const [rot, cor] = ESTADO_DNSSEC[ds?.estado] || [ds?.estado || '—', 'cinza']
  return (
    <div className="space-y-6">
      <section className="cartao p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="titulo-secao">DNSSEC</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Assina as respostas do DNS para ninguém conseguir desviar quem digita {ZONA} para outro servidor. Funciona em duas partes: a Cloudflare assina, e o Registro.br publica a “impressão digital” (registro DS).</p></div>{ds && <Selo cor={cor}>{rot}</Selo>}</div>
        {dnssec.erro ? <div className="mt-3"><ErroCf erro={dnssec.erro} tentar={dnssec.carregar} /></div> : !ds ? <Esqueleto className="mt-3 h-24" /> : (
          <div className="mt-4 space-y-3">
            {ds.estado === 'disabled' && dono && <Botao icone={ShieldCheck} carregando={ocupado} onClick={() => mudar(true)}>Ligar DNSSEC</Botao>}
            {['pending', 'active'].includes(ds.estado) && ds.digest && (
              <>
                <p className="text-sm">{ds.estado === 'pending' ? <>Falta o último passo: no <a className="underline" href="https://registro.br/painel/" target="_blank" rel="noreferrer">Registro.br</a>, abra o domínio → <b>DNSSEC</b> → adicionar DS, com estes dados:</> : 'Dados do DS publicados no Registro.br:'}</p>
                <dl className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-3">
                  {[['Key tag', ds.tag], ['Algoritmo', ds.algoritmo], ['Tipo do digest', ds.tipo_digest]].map(([n, v]) => <div key={n}><dt className="text-xs text-muted-foreground">{n}</dt><dd className="flex items-center gap-1 font-mono">{v}<Copiar texto={v} /></dd></div>)}
                  <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Digest</dt><dd className="flex items-start gap-1 break-all font-mono text-xs">{ds.digest}<Copiar texto={ds.digest} /></dd></div>
                </dl>
                <p className="ajuda">DS errado no Registro.br derruba o domínio inteiro (site, app e e-mails). Copie com o botão e confira os quatro campos.</p>
              </>
            )}
            {dono && ['pending', 'active'].includes(ds.estado) && (!desligar ? <Botao variante="secundario" tamanho="sm" onClick={() => setDesligar(true)}>Desligar DNSSEC</Botao> : (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm">Antes de desligar aqui, <b>tire o DS no Registro.br</b> e espere um dia. Desligar com o DS ainda lá derruba o domínio.</p>
                <label className="rotulo block">Digite <code>{ZONA}</code> para confirmar<input className="campo mt-1 font-mono" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="off" /></label>
                <div className="flex gap-2"><Botao variante="secundario" tamanho="sm" onClick={() => setDesligar(false)}>Cancelar</Botao><Botao variante="perigo" tamanho="sm" carregando={ocupado} disabled={confirmar.trim().toLowerCase() !== ZONA} onClick={() => mudar(false)}>Desligar DNSSEC</Botao></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="cartao p-5">
        <h2 className="titulo-secao">Configurações da zona</h2>
        {config.erro ? <div className="mt-3"><ErroCf erro={config.erro} /></div> : !config.d ? <Esqueleto className="mt-3 h-32" /> : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{config.d.aviso}</p>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{config.d.itens.map((i) => <div key={i.id} className="flex justify-between gap-2 border-b border-border py-1.5"><dt className="text-muted-foreground">{i.nome}</dt><dd className="font-medium">{i.valor === 'on' ? 'Ligado' : i.valor === 'off' ? 'Desligado' : String(i.valor)}</dd></div>)}</dl>
          </>
        )}
      </section>

      <section className="cartao">
        <div className="flex items-center justify-between border-b border-border p-4"><div><h2 className="titulo-secao">Histórico de alterações</h2><p className="text-xs text-muted-foreground">Auditoria da conta na Cloudflare: quem mudou o quê, inclusive pelo painel e por este sistema</p></div><Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={audit.carregar}>Atualizar</Botao></div>
        {audit.erro ? <div className="p-4"><ErroCf erro={audit.erro} /></div> : !audit.d ? <Esqueleto className="m-4 h-48" /> : !audit.d.itens.length ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma alteração registrada.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Quem</th><th className="px-4 py-2 font-medium">O quê</th><th className="px-4 py-2 font-medium">Via</th><th className="px-4 py-2 font-medium">Resultado</th></tr></thead>
            <tbody className="divide-y divide-border">{audit.d.itens.map((i, k) => (
              <tr key={k}><td className="whitespace-nowrap px-4 py-2 text-xs">{quando(i.quando)}</td><td className="max-w-[12rem] truncate px-4 py-2 text-xs">{i.quem}</td><td className="px-4 py-2 text-xs"><span className="font-medium">{i.acao}</span>{i.recurso ? <span className="text-muted-foreground"> · {i.recurso}</span> : ''}</td><td className="px-4 py-2 text-xs text-muted-foreground">{i.via || '—'}</td><td className="px-4 py-2">{i.ok ? <Selo cor="verde">ok</Selo> : <Selo cor="vermelho">falhou</Selo>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  )
}

// ---------------- Token ----------------
export function CfToken() {
  const { d, erro, carregar } = useCf('/api/infra/cf/token')
  return (
    <div className="space-y-6">
      {erro && !/CLOUDFLARE_API_TOKEN/.test(erro) && <ErroCf erro={erro} tentar={carregar} />}
      {d && (
        <section className="cartao p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="titulo-secao">Token do agente</h2><Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Conferir de novo</Botao></div>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">{d.estado === 'active' ? <Selo cor="verde">Válido</Selo> : <Selo cor="vermelho">{d.estado}</Selo>}<span className="text-muted-foreground">{d.expira ? `vence em ${quando(d.expira)}` : 'sem data de validade'}</span></p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(d.permissoes).map(([n, ok]) => <li key={n} className="flex items-center gap-2">{ok ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-red-600" />}{n}{!ok && <span className="text-xs text-muted-foreground">sem permissão</span>}</li>)}</ul>
          {Object.values(d.permissoes).some((v) => !v) && <p className="ajuda mt-3">Para liberar o que falta, edite o token na Cloudflare (API Tokens → Edit) e acrescente as permissões da tabela abaixo. O valor do token não muda.</p>}
        </section>
      )}
      {!d && !erro && <Esqueleto className="h-40" />}
      <CfConectar compacto={!!d} />
    </div>
  )
}
