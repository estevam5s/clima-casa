import { ExternalLink, Gauge, RefreshCw } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, Carregando, useDados } from '../ui'

// Uso e cota do plano grátis: banco e Storage medidos de verdade, pedidos por hora de cada serviço (API do Supabase, pelo
// agente) e o Egress com o link para o número oficial (a API não o entrega com o token do projeto).
const MB = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(2).replace('.', ',')} GB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`)
const SERV = [['rest', 'Banco (API)', 'bg-emerald-500'], ['auth', 'Login', 'bg-blue-500'], ['storage', 'Storage', 'bg-amber-500'], ['realtime', 'Realtime', 'bg-violet-500']]

function Barra({ rotulo, usado, cota, dica }) {
  const pc = Math.min(100, (usado / cota) * 100)
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-2"><p className="text-sm font-medium">{rotulo}</p><p className="text-sm tabular">{MB(usado)} <span className="text-muted-foreground">de {MB(cota)}</span></p></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${pc > 90 ? 'bg-red-500' : pc > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pc}%` }} /></div>
      <p className="mt-1.5 text-xs text-muted-foreground">{pc.toFixed(0)}% · {dica}</p>
    </div>
  )
}

export default function UsoCota() {
  const { dados: d, erro, recarregar } = useDados(() => api.get('/api/infra/supabase-uso'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Carregando />
  const storage = d.buckets.reduce((a, b) => a + b.bytes, 0)
  const max = Math.max(1, ...d.pedidos.map((h) => SERV.reduce((s, [k]) => s + (h[k] || 0), 0)))
  const tot = Object.fromEntries(SERV.map(([k]) => [k, d.pedidos.reduce((s, h) => s + (h[k] || 0), 0)]))
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="flex items-center gap-2 text-lg font-semibold"><Gauge className="h-5 w-5" />Uso e cota do plano grátis</h2>
          <p className="text-sm text-muted-foreground">Medido agora no projeto {d.ref}. A cota é da organização e vira todo mês.</p></div>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar}>Atualizar</Botao>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Barra rotulo="Banco de dados" usado={d.banco_bytes} cota={d.cotas.banco} dica="tamanho do Postgres (tabelas, índices e o que o próprio Supabase guarda)" />
        <Barra rotulo="Storage" usado={storage} cota={d.cotas.storage} dica={d.buckets.map((b) => `${b.bucket} ${MB(b.bytes)}`).join(' · ')} />
      </div>
      <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium">Egress (tráfego que sai do Supabase): cota de {MB(d.cotas.egress)} por mês</p>
        <p className="mt-1 text-muted-foreground">O número exato só aparece no painel do Supabase: a API não entrega o Egress com o token do projeto. Passou da cota, o Supabase dá um prazo e depois responde 402 (o sistema para) até o mês virar ou o plano mudar.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Modelos 3D ficam guardados em cada navegador (baixados uma vez, não a cada visita).</li>
          <li>As telas não consultam o servidor com a aba escondida; o sino a cada 60 s.</li>
          <li>O agente pergunta pela fila a cada 2,5 s parado (0,8 s logo depois de um comando).</li>
          <li>Backups copiam os arquivos dentro do Supabase; baixar um backup gasta tráfego, gerar não.</li>
        </ul>
        <a href="https://supabase.com/dashboard/org/grqepvojozsgnzjykmnj/usage" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-medium text-primary hover:underline">Ver o Egress no painel do Supabase<ExternalLink className="h-3.5 w-3.5" /></a>
      </section>
      <section className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-medium">Pedidos por hora (últimas 24 h)</p>
          <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">{SERV.map(([k, r, c]) => <span key={k} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${c}`} />{r}: <b className="tabular text-foreground">{tot[k].toLocaleString('pt-BR')}</b></span>)}</p></div>
        {d.erro && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{d.erro}</p>}
        {d.pedidos.length > 0 && (
          <div className="mt-3 flex h-36 items-end gap-1" role="img" aria-label="Pedidos por hora por serviço">
            {d.pedidos.map((h) => { const soma = SERV.reduce((s, [k]) => s + (h[k] || 0), 0); return (
              <div key={h.hora} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${new Date(h.hora + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}: ${soma} pedido(s)`}>
                {SERV.map(([k, , c]) => (h[k] ? <div key={k} className={c} style={{ height: `${(h[k] / max) * 100}%` }} /> : null))}
              </div>) })}
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Pedidos pela API do Supabase (login, Storage, Realtime). As consultas do agente e da nuvem vão direto ao Postgres e não entram aqui. Usuários com login: {d.usuarios_auth} (cota {d.cotas.mau.toLocaleString('pt-BR')} por mês).</p>
      </section>
    </div>
  )
}
