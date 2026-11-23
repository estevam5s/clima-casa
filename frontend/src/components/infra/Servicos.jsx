import { CheckCircle2, CircleAlert, ExternalLink, Plug, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Carregando, Selo, useDados } from '../ui'

// Infra → Serviços: situação oficial dos serviços (páginas de status públicas) e os certificados dos domínios.
// Rede → Portas e serviços: do computador do agente, o que ele alcança (banco 6543, HTTPS, transmissores 6668).
const COR = { none: ['verde', 'Funcionando'], minor: ['ambar', 'Problema menor'], major: ['vermelho', 'Problema sério'], critical: ['vermelho', 'Fora do ar'], maintenance: ['azul', 'Manutenção'] }
const PAGINA = { Vercel: 'https://www.vercel-status.com', Supabase: 'https://status.supabase.com', Cloudflare: 'https://www.cloudflarestatus.com', Resend: 'https://resend-status.com' }
const quando = (t) => new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function Servicos() {
  const { dados: d, erro, recarregar } = useDados(() => api.get('/api/infra/servicos'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Carregando />
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Situação oficial agora de cada serviço de que o sistema depende, e quando os certificados dos domínios vencem. Lido em {quando(d.lido_em)}.</p>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {d.servicos.map((s) => { const [cor, rot] = COR[s.indicador] || ['cinza', 'Sem resposta']; return (
          <section key={s.servico} className="cartao p-4">
            <div className="flex items-center justify-between gap-2"><p className="font-medium">{s.servico}</p><Selo cor={cor}>{rot}</Selo></div>
            <p className="mt-1 text-sm text-muted-foreground">{s.descricao}</p>
            {s.incidentes.length > 0 && <ul className="mt-2 space-y-1 text-xs">{s.incidentes.map((i) => <li key={i.nome} className="flex gap-1.5"><CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600" />{i.nome}</li>)}</ul>}
            <a href={PAGINA[s.servico]} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline">Página de status<ExternalLink className="h-3 w-3" /></a>
          </section>) })}
      </div>
      <section className="cartao p-4">
        <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Certificados (HTTPS)</p>
        <ul className="mt-3 divide-y divide-border text-sm">{d.certificados.map((c) => (
          <li key={c.host} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1 font-mono text-xs">{c.host}</span>
            {c.erro ? <Selo cor="vermelho">Sem resposta ({c.erro})</Selo> : <>
              <span className="text-xs text-muted-foreground">{c.emissor} · vence {new Date(c.vence * 1000).toLocaleDateString('pt-BR')}</span>
              <Selo cor={c.dias < 14 ? 'vermelho' : c.dias < 30 ? 'ambar' : 'verde'}>{c.dias} dias</Selo></>}
          </li>))}</ul>
        <p className="mt-2 text-xs text-muted-foreground">A Vercel renova sozinha cerca de 30 dias antes. O registro CAA do domínio só deixa a Let's Encrypt e a Google emitirem.</p>
      </section>
    </div>
  )
}

export function Portas() {
  const { dados: d, erro, recarregar } = useDados(() => api.get('/api/infra/portas'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Carregando />
  const nuvem = d.resultados.filter((r) => r.tipo === 'nuvem'), local = d.resultados.filter((r) => r.tipo === 'local')
  const Lista = ({ itens }) => (
    <ul className="divide-y divide-border">{itens.map((r) => (
      <li key={`${r.host}:${r.porta}`} className="flex flex-wrap items-center gap-3 py-2 text-sm">
        {r.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
        <span className="min-w-0 flex-1"><b className="block font-medium">{r.nome}</b><span className="font-mono text-xs text-muted-foreground">{r.host}:{r.porta}</span></span>
        <span className={`text-xs tabular ${r.ok ? (r.ms > 300 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground') : 'text-red-600'}`}>{r.ok ? `${r.ms} ms` : r.erro === 'TimeoutError' ? 'sem resposta' : r.erro}</span>
      </li>))}</ul>)
  const bloqueada = nuvem.filter((r) => !r.ok)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-3xl text-sm text-muted-foreground">Testado agora pelo computador do agente <b className="text-foreground">{d.maquina}</b>: é por ele que os comandos chegam aos ares. Mostre esta tela à TI quando a rede for nova.</p>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar}>Testar de novo</Botao>
      </div>
      {bloqueada.length > 0 && <Aviso>Bloqueado nesta rede: {bloqueada.map((r) => `${r.nome}`).join(', ')}. Peça à TI para liberar a saída {[...new Set(bloqueada.map((r) => r.porta))].join(', ')}.</Aviso>}
      <section className="cartao p-4"><p className="mb-1 flex items-center gap-2 font-medium"><Plug className="h-4 w-4" />Internet e serviços</p><Lista itens={nuvem} /></section>
      <section className="cartao p-4"><p className="mb-1 font-medium">Transmissores na rede local (porta 6668)</p>
        {local.length ? <Lista itens={local} /> : <p className="text-sm text-muted-foreground">Nenhum transmissor com IP cadastrado.</p>}
        {local.some((r) => !r.ok) && <p className="mt-2 text-xs text-muted-foreground">Sem resposta: o computador do agente não está na mesma rede (ou VLAN) dos transmissores, ou o transmissor está desligado.</p>}
      </section>
    </div>
  )
}
