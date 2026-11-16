import { AlertTriangle, CheckCircle2, Globe, Mail, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { Botao, Esqueleto, FaixaMetricas, Selo } from '../ui'
import { ErroCf, useCf } from './Cloudflare'

// Visão geral da infraestrutura: o domínio de ponta a ponta (Cloudflare + Vercel + Resend) e os quatro pilares.
const ICONE = { ok: [CheckCircle2, 'text-emerald-600 dark:text-emerald-400'], alerta: [AlertTriangle, 'text-amber-600 dark:text-amber-400'], erro: [XCircle, 'text-red-600 dark:text-red-400'] }
const DNSSEC = { active: 'ligado', pending: 'aguardando DS', disabled: 'desligado' }

export default function Visao({ resumo, saude, irPara }) {
  const cf = useCf('/api/infra/cf/resumo')
  const chk = useCf('/api/infra/cf/saude')
  const semToken = /CLOUDFLARE_API_TOKEN/.test(cf.erro || chk.erro || '')
  const pubs = (resumo?.projetos || []).reduce((s, p) => s + p.publicacoes, 0)
  const z = cf.d?.zona
  const email = cf.d?.email
  const grupos = chk.d ? [...new Set(chk.d.itens.map((i) => i.grupo))] : []
  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Domínio (Cloudflare)', valor: z ? (z.estado === 'active' ? 'Ativo' : z.estado) : semToken ? 'Não conectado' : '…', tom: semToken ? 'ruim' : undefined,
          dica: z ? `plano ${z.plano} · ${cf.d.registros} registros · DNSSEC ${typeof cf.d.dnssec === 'string' ? DNSSEC[cf.d.dnssec] || cf.d.dnssec : '—'}` : semToken ? 'falta o token no agente (aba Cloudflare → Token)' : '' },
        { rotulo: 'Vercel (site e app)', valor: resumo ? (resumo.equipe.plano === 'hobby' ? 'Hobby' : resumo.equipe.plano) : '…', dica: resumo ? `${pubs} publicações guardadas · região ${saude?.regiao || '…'}` : '' },
        { rotulo: 'Banco (Supabase)', valor: saude ? `${saude.banco_ms} ms` : '…', dica: 'tempo de uma consulta agora' },
        { rotulo: 'Agente do escritório', valor: saude ? (saude.agente_online ? 'Online' : 'Offline') : '…', tom: saude && !saude.agente_online ? 'ruim' : undefined,
          dica: saude?.fila ? `${saude.fila.total_1h ?? 0} comandos na última hora` : '' },
      ]} />

      {z && (
        <div className="grid gap-3 md:grid-cols-3">
          <button type="button" onClick={() => irPara('cloudflare/email')} className="cartao w-full min-w-0 p-4 text-left hover:bg-muted/40">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" />E-mails @{z.nome}</p>
            <p className="mt-1.5 font-semibold">{email?.erro ? 'sem permissão' : email ? `${email.ativas} endereços ativos` : '…'}</p>
            <p className="text-xs text-muted-foreground">{email && !email.erro ? `redirecionamento ${email.ativo ? 'ligado' : 'desligado'} · pega-tudo ${email.pega_tudo ? 'ligado' : 'desligado'}` : ''}</p>
          </button>
          <button type="button" onClick={() => irPara('cloudflare/seguranca')} className="cartao w-full min-w-0 p-4 text-left hover:bg-muted/40">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Nameservers</p>
            <p className="mt-1.5 truncate font-mono text-sm">{(z.nameservers || []).join(' · ')}</p>
            <p className="text-xs text-muted-foreground">{z.registrador ? `registrador de origem: ${z.registrador}` : 'registrado no Registro.br'}</p>
          </button>
          <button type="button" onClick={() => irPara('cloudflare/dns')} className="cartao w-full min-w-0 p-4 text-left hover:bg-muted/40">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Globe className="h-3.5 w-3.5" />DNS</p>
            <p className="mt-1.5 font-semibold">{cf.d.registros} registros · {cf.d.com_proxy} com proxy</p>
            <p className="text-xs text-muted-foreground">tudo em “DNS only”: o tráfego do site passa direto para a Vercel</p>
          </button>
        </div>
      )}

      <section className="cartao">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
          <div><h2 className="titulo-secao">Saúde do domínio</h2><p className="text-xs text-muted-foreground">Conferido agora no DNS da Cloudflare, na Vercel e no Resend</p></div>
          <div className="flex items-center gap-2">
            {chk.d && <span className="flex gap-1.5 text-xs"><Selo cor="verde">{chk.d.resumo.ok} ok</Selo>{!!chk.d.resumo.alerta && <Selo cor="ambar">{chk.d.resumo.alerta} atenção</Selo>}{!!chk.d.resumo.erro && <Selo cor="vermelho">{chk.d.resumo.erro} problema</Selo>}</span>}
            <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={() => { chk.setD(null); chk.carregar(); cf.carregar() }}>Conferir de novo</Botao>
          </div>
        </div>
        {chk.erro ? <div className="p-4"><ErroCf erro={chk.erro} tentar={chk.carregar} /></div> : !chk.d ? <Esqueleto className="m-4 h-64" /> : (
          <div className="divide-y divide-border">{grupos.map((g) => (
            <div key={g} className="p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
              <ul className="space-y-2">{chk.d.itens.filter((i) => i.grupo === g).map((i, k) => { const [I, cor] = ICONE[i.estado]; return (
                <li key={k} className="flex items-start gap-2.5 text-sm">
                  <I className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.nome}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{i.detalhe}</p>
                    {i.fazer && <p className="mt-0.5 text-xs">{i.fazer}</p>}
                  </div>
                </li>
              ) })}</ul>
            </div>
          ))}</div>
        )}
      </section>
    </div>
  )
}
