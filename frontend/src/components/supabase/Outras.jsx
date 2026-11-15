import { useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CircleCheck, CircleX, Download, Info, KeyRound, Loader2, Mail, Play, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react'
import { api, dataHora, haQuanto } from '../../api'
import { Botao, Esqueleto, Interruptor, Selo, useDados, useToast } from '../ui'
import { Copiar, TituloSecao, kb, num } from './comum'

const Carregando = () => <div className="grid gap-3"><Esqueleto className="h-10" /><Esqueleto className="h-64" /></div>

export function Banco({ irPara }) {
  const { dados } = useDados(() => api.get('/api/supabase/tabelas'))
  const [ord, setOrd] = useState('bytes')
  if (!dados) return <Carregando />
  const lista = [...dados].sort((a, b) => (ord === 'nome' ? a.nome.localeCompare(b.nome) : b[ord] - a[ord]))
  const max = Math.max(1, ...dados.map((t) => t.bytes))
  const total = dados.reduce((s, t) => s + t.bytes, 0)
  const Th = ({ k, children, className = '' }) => <th onClick={() => setOrd(k)} className={`cursor-pointer select-none hover:text-foreground ${className}`}>{children}{ord === k && ' ↓'}</th>
  return (
    <>
      <TituloSecao titulo="Banco de dados" descricao={`${dados.length} tabelas no schema public · ${kb(total)} no total. Clique numa tabela para abrir no editor.`} />
      <div className="cartao overflow-x-auto">
        <table className="tabela w-full min-w-[860px] text-sm">
          <thead><tr><Th k="nome">Tabela</Th><Th k="linhas" className="text-right">Linhas</Th><Th k="bytes">Tamanho</Th><th>RLS</th><Th k="politicas" className="text-right">Políticas</Th><Th k="indices" className="text-right">Índices</Th><Th k="leituras_indice" className="text-right">Leituras (índice / seq.)</Th><th className="text-right">Escritas</th></tr></thead>
          <tbody>
            {lista.map((t) => (
              <tr key={t.nome} onClick={() => irPara('tabelas', t.nome)} className="cursor-pointer hover:bg-muted/50">
                <td><span className="font-mono text-[13px]">{t.nome}</span>{!t.tem_pk && <span className="ml-2 text-[11px] text-amber-600">sem chave primária</span>}</td>
                <td className="text-right tabular-nums">{num(t.linhas)}</td>
                <td className="w-48"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(t.bytes / max) * 100}%` }} /></div><span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{kb(t.bytes)}</span></div></td>
                <td>{t.rls ? <ShieldCheck className="h-4 w-4 text-emerald-500" aria-label="ligado" /> : <ShieldAlert className="h-4 w-4 text-red-500" aria-label="desligado" />}</td>
                <td className="text-right tabular-nums">{t.politicas}</td>
                <td className="text-right tabular-nums">{t.indices}</td>
                <td className="text-right text-xs tabular-nums text-muted-foreground">{num(t.leituras_indice)} / {num(t.leituras_seq)}</td>
                <td className="text-right text-xs tabular-nums text-muted-foreground">{num(t.inseridas + t.atualizadas + t.apagadas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Desempenho() {
  const { dados } = useDados(() => api.get('/api/supabase/desempenho'))
  if (!dados) return <Carregando />
  const max = Math.max(1, ...dados.consultas.map((c) => c.total_ms))
  const totalCon = dados.conexoes.reduce((s, c) => s + c.n, 0)
  return (
    <>
      <TituloSecao titulo="Desempenho" descricao="Conexões abertas agora e as consultas que mais gastaram tempo do banco (pg_stat_statements)." />
      <section className="cartao mb-5 p-5">
        <h2 className="titulo-secao mb-3">Conexões ({totalCon})</h2>
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {dados.conexoes.map((c, i) => <motion.div key={i} title={`${c.estado} · ${c.app}: ${c.n}`} initial={{ width: 0 }} animate={{ width: `${(c.n / totalCon) * 100}%` }} className={c.estado === 'active' ? 'bg-primary' : c.estado === 'idle' ? 'bg-sky-400/70' : 'bg-muted-foreground/40'} style={{ borderRight: '2px solid hsl(var(--card))' }} />)}
        </div>
        <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">{dados.conexoes.map((c, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate text-muted-foreground">{c.app} · {c.estado}</span><span className="tabular-nums">{c.n}</span></li>)}</ul>
      </section>
      <section className="cartao overflow-x-auto">
        <h2 className="titulo-secao border-b border-border px-5 py-3.5">Consultas mais pesadas</h2>
        {dados.consultas.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Sem estatísticas de consultas disponíveis.</p> : (
          <table className="tabela w-full min-w-[820px] text-sm">
            <thead><tr><th>Consulta</th><th className="text-right">Chamadas</th><th className="text-right">Média</th><th className="text-right">Máx.</th><th className="w-44">Tempo total</th></tr></thead>
            <tbody>{dados.consultas.map((c, i) => (
              <tr key={i}><td className="max-w-[460px]"><p className="truncate font-mono text-[12px]" title={c.consulta}>{c.consulta}</p></td>
                <td className="text-right tabular-nums">{num(c.chamadas)}</td><td className="text-right tabular-nums">{c.media_ms} ms</td><td className="text-right tabular-nums">{num(c.max_ms)} ms</td>
                <td><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-amber-500/80" style={{ width: `${(c.total_ms / max) * 100}%` }} /></div><span className="w-16 text-right text-xs tabular-nums text-muted-foreground">{c.total_ms >= 1000 ? `${(c.total_ms / 1000).toFixed(1)} s` : `${c.total_ms} ms`}</span></div></td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  )
}

export function Autenticacao() {
  const { dados } = useDados(() => api.get('/api/supabase/auth'))
  if (!dados) return <Carregando />
  const com2fa = dados.filter((u) => u.fatores > 0).length
  return (
    <>
      <TituloSecao titulo="Autenticação" descricao={`${dados.length} usuário(s) no Supabase Auth · ${com2fa} com autenticador · cadastro público desligado. Para criar, editar ou remover, use Configurações → Usuários.`} />
      <div className="cartao overflow-x-auto">
        <table className="tabela w-full min-w-[860px] text-sm">
          <thead><tr><th>Usuário</th><th>Papel</th><th>Provedores</th><th>2FA</th><th className="text-right">Sessões</th><th>Último acesso</th><th>Criado</th></tr></thead>
          <tbody>{dados.map((u) => (
            <tr key={u.id}>
              <td><p className="font-medium">{u.nome || u.email}</p><p className="text-xs text-muted-foreground">{u.nome ? u.email : ''}{!u.confirmado && ' · e-mail não confirmado'}{u.suspenso && ' · suspenso'}</p><p className="font-mono text-[10.5px] text-muted-foreground/70">{u.id}</p></td>
              <td>{u.papel ? <Selo cor={u.papel === 'dono' ? 'azul' : 'cinza'}>{u.papel}</Selo> : <span className="text-xs text-muted-foreground">sem perfil</span>}</td>
              <td><span className="flex gap-1.5">{u.provedores.map((p) => <span key={p} title={p} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[11px]">{p === 'email' ? <Mail className="h-3 w-3" /> : <span className="font-bold">G</span>}{p === 'email' ? 'e-mail' : p}</span>)}</span></td>
              <td>{u.fatores > 0 ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Smartphone className="h-3.5 w-3.5" />ativo</span> : <span className="text-xs text-muted-foreground">não</span>}</td>
              <td className="text-right tabular-nums">{u.sessoes}</td>
              <td className="text-xs" title={u.ultimo_login ? dataHora(u.ultimo_login) : ''}>{u.ultimo_login ? haQuanto(u.ultimo_login) : 'nunca'}</td>
              <td className="text-xs text-muted-foreground">{dataHora(u.criado_em)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  )
}

const AGENDA_LEGIVEL = {
  '*/5 * * * *': 'a cada 5 min', '*/15 * * * *': 'a cada 15 min', '*/30 * * * *': 'a cada 30 min', '5 * * * *': 'de hora em hora', '20 * * * *': 'de hora em hora',
  '0 5 * * *': 'diário, 2h', '30 6 * * *': 'diário, 3h30', '45 6 * * *': 'diário, 3h45', '0 */6 * * *': 'a cada 6 h', '0 7 * * 0': 'domingo, 4h',
}
export function Rotinas() {
  const toast = useToast()
  const { dados, recarregar } = useDados(() => api.get('/api/supabase/rotinas'))
  const [rodando, setRodando] = useState(null)
  if (!dados) return <Carregando />
  const executar = async (r) => { setRodando(r.jobname); try { await api.post(`/api/supabase/rotinas/${r.jobname}/executar`); toast(`${r.jobname.replace('clima_', '')} executada.`); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setRodando(null) } }
  const alternar = async (r, ativo) => { try { await api.put(`/api/supabase/rotinas/${r.jobname}`, { ativo }); recarregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <>
      <TituloSecao titulo="Rotinas (pg_cron)" descricao={`${dados.filter((r) => r.active).length} de ${dados.length} ativas. Horários no fuso de Brasília; o Supabase guarda as execuções por 7 dias.`} />
      <div className="cartao overflow-x-auto">
        <table className="tabela w-full min-w-[760px]">
          <thead><tr><th>Rotina</th><th>Frequência</th><th>Última execução</th><th>7 dias</th><th>Ativa</th><th></th></tr></thead>
          <tbody>{dados.map((r) => (
            <tr key={r.jobid}>
              <td><p className="font-medium">{r.jobname.replace('clima_', '').replaceAll('_', ' ')}</p><p className="text-xs text-muted-foreground">{r.descricao}</p></td>
              <td className="whitespace-nowrap text-muted-foreground"><span className="block">{AGENDA_LEGIVEL[r.schedule] || r.schedule}</span><span className="font-mono text-[11px] opacity-70">{r.schedule}</span></td>
              <td className="whitespace-nowrap">{r.ultimo_em ? <span className="flex items-center gap-2">{r.ultimo_status === 'succeeded' ? <Selo cor="verde">OK</Selo> : r.ultimo_status === 'failed' ? <Selo cor="vermelho">Falhou</Selo> : <Selo>{r.ultimo_status}</Selo>}<span className="text-xs text-muted-foreground" title={dataHora(r.ultimo_em)}>{haQuanto(r.ultimo_em)}{r.duracao_ms != null ? ` · ${r.duracao_ms} ms` : ''}</span></span> : <span className="text-xs text-muted-foreground">ainda não rodou</span>}</td>
              <td className="whitespace-nowrap text-xs text-muted-foreground">{r.execucoes_7d} execuções{Number(r.falhas_7d) ? <span className="text-red-600">, {r.falhas_7d} falhas</span> : ''}</td>
              <td><Interruptor ligado={r.active} onChange={(v) => alternar(r, v)} rotulo={`Ativar ${r.jobname}`} /></td>
              <td><Botao variante="fantasma" tamanho="sm" icone={Play} carregando={rodando === r.jobname} onClick={() => executar(r)}>Rodar</Botao></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  )
}

export function Registros() {
  const [status, setStatus] = useState('')
  const { dados } = useDados(() => api.get(`/api/supabase/registros?status=${status}&limite=200`), [status])
  const Icone = { succeeded: CircleCheck, failed: CircleX, running: Loader2 }
  return (
    <>
      <TituloSecao titulo="Registros" descricao="Cada execução das rotinas agendadas, com a resposta do Postgres."
        acoes={<div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{[['', 'Todas'], ['succeeded', 'Sucesso'], ['failed', 'Falhas'], ['running', 'Rodando']].map(([k, r]) => <button key={k} onClick={() => setStatus(k)} className={`rounded-md px-3 py-1 ${status === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>)}</div>} />
      {!dados ? <Carregando /> : (
        <div className="cartao divide-y divide-border font-mono text-[12.5px]">
          {dados.execucoes.length === 0 && <p className="p-6 text-center font-sans text-sm text-muted-foreground">Nenhuma execução neste filtro.</p>}
          {dados.execucoes.map((e) => { const I = Icone[e.status] || Info; return (
            <div key={e.id} className="flex items-start gap-3 px-4 py-2 hover:bg-muted/40">
              <I className={`mt-0.5 h-4 w-4 shrink-0 ${e.status === 'succeeded' ? 'text-emerald-500' : e.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`} />
              <span className="w-36 shrink-0 text-muted-foreground">{new Date(e.inicio * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span className="w-44 shrink-0 truncate font-medium">{e.rotina.replace('clima_', '')}</span>
              <span className="min-w-0 flex-1 break-words text-muted-foreground">{e.mensagem}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{e.duracao_ms != null ? `${e.duracao_ms} ms` : ''}</span>
            </div>
          ) })}
        </div>
      )}
    </>
  )
}

export function Backups() {
  const { dados } = useDados(() => api.get('/api/supabase/resumo'))
  const baixar = async (b) => {
    const c = await api.get(`/api/supabase/backups/${b.id}`)
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }))
    a.download = `clima-backup-${new Date(b.criado_em * 1000).toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  if (!dados) return <Carregando />
  return (
    <>
      <TituloSecao titulo="Backups" descricao="Cópia diária (2h) de aparelhos, botões gravados, cenas, agenda e automações. Ficam guardadas as 14 mais recentes." />
      <div className="cartao divide-y divide-border">
        {dados.backups.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">O primeiro backup é feito às 2h.</p>}
        {dados.backups.map((b, i) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
              <div><p>{dataHora(b.criado_em)}{i === 0 && <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">mais recente</span>}</p><p className="text-xs text-muted-foreground">{b.aparelhos} aparelho(s), {b.codigos} botões · {kb(b.bytes)}</p></div></div>
            <Botao variante="secundario" tamanho="sm" icone={Download} onClick={() => baixar(b)}>Baixar JSON</Botao>
          </div>
        ))}
      </div>
    </>
  )
}

export function Avisos() {
  const { dados } = useDados(() => api.get('/api/supabase/avisos'))
  const [tipo, setTipo] = useState('')
  if (!dados) return <Carregando />
  const tipos = [...new Set(dados.map((a) => a.tipo))]
  const lista = dados.filter((a) => !tipo || a.tipo === tipo)
  const Icone = { erro: [CircleX, 'text-red-500'], alerta: [AlertTriangle, 'text-amber-500'], info: [Info, 'text-sky-500'] }
  return (
    <>
      <TituloSecao titulo="Avisos" descricao="Revisão automática de segurança e desempenho do banco, nos moldes do Advisors do Supabase."
        acoes={<div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">{[['', `Todos (${dados.length})`], ...tipos.map((t) => [t, t])].map(([k, r]) => <button key={k} onClick={() => setTipo(k)} className={`rounded-md px-3 py-1 ${tipo === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>)}</div>} />
      {lista.length === 0 ? <div className="cartao flex flex-col items-center p-10 text-center"><KeyRound className="h-8 w-8 text-emerald-500" /><p className="mt-3 font-medium">Nada a corrigir</p></div> : (
        <ul className="space-y-2">
          {lista.map((a, i) => { const [I, cor] = Icone[a.nivel]; return (
            <motion.li key={a.titulo} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="cartao flex items-start gap-3 px-4 py-3">
              <I className={`mt-0.5 h-5 w-5 shrink-0 ${cor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.titulo} <span className="ml-1 rounded bg-muted px-1.5 py-px text-[11px] font-normal text-muted-foreground">{a.tipo}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.detalhe}</p>
                {a.correcao && <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-[12px]">{a.correcao}</code><Copiar texto={a.correcao} /></div>}
              </div>
            </motion.li>
          ) })}
        </ul>
      )}
    </>
  )
}
