import { useMemo, useState } from 'react'
import { Ban, Bot, KeyRound, LockOpen, RefreshCw, Search, ShieldCheck, Unlink } from 'lucide-react'
import { api, dataHora, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Secao, useDados, useToast, confirmar } from '../ui'

// Segurança → Telegram: tudo o que passou pelo bot (quem, o quê, resultado), os IPs que entregaram as mensagens
// (servidores do Telegram: ele não revela o IP de quem usa o bot), conversas, bloqueios, PINs e as regras em vigor.
const TIPOS = {
  comando: ['Comando', 'text-foreground'], clique: ['Botão', 'text-foreground'], ia: ['Texto para a IA', 'text-foreground'],
  negado: ['Sem vínculo', 'text-red-600 dark:text-red-400'], flood: ['Flood', 'text-amber-600 dark:text-amber-400'], bloqueado: ['Bloqueado', 'text-red-600 dark:text-red-400'],
  vinculo: ['Vínculo', 'text-emerald-600 dark:text-emerald-400'], pin_ok: ['PIN certo', 'text-emerald-600 dark:text-emerald-400'], pin_errado: ['PIN errado', 'text-red-600 dark:text-red-400'],
  pin_pedido: ['Pediu PIN', 'text-amber-600 dark:text-amber-400'], identidade: ['Identidade diferente', 'text-red-600 dark:text-red-400'], expirado: ['Vínculo expirou', 'text-muted-foreground'],
}

export default function TelegramSeg() {
  const toast = useToast()
  const [horas, setHoras] = useState(168)
  const [q, setQ] = useState(''), [tipo, setTipo] = useState('')
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/seguranca/telegram?horas=${horas}`), [horas])
  const lista = useMemo(() => (dados?.eventos || []).filter((e) => (!tipo || e.tipo === tipo) && (!q || `${e.chat} ${e.username} ${e.usuario_nome} ${e.texto} ${e.ip}`.toLowerCase().includes(q.toLowerCase()))), [dados, q, tipo])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Esqueleto className="h-96" />
  const pt = dados.por_tipo || {}
  const negados = (pt.negado || 0) + (pt.flood || 0) + (pt.pin_errado || 0) + (pt.identidade || 0) + (pt.bloqueado || 0)
  const acao = async (url, corpo, msg) => { try { await api.post(url, corpo); toast(msg); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const desvincular = async (chat, nome) => { if (!await confirmar(`Desvincular o Telegram de ${nome}? A pessoa precisa gerar um código novo para voltar.`)) return; try { await api.del(`/api/telegram/vinculo/${chat}`); toast('Desvinculado.'); recarregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {[[24, '24 h'], [168, '7 dias'], [720, '30 dias'], [2160, '90 dias']].map(([h, r]) => <button key={h} onClick={() => setHoras(h)} className={`h-8 rounded-md border px-3 text-xs ${horas === h ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{r}</button>)}
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={recarregar} className="ml-auto">Atualizar</Botao>
      </div>
      <FaixaMetricas itens={[
        { rotulo: 'Interações', valor: (pt.comando || 0) + (pt.clique || 0) + (pt.ia || 0), dica: `${pt.comando || 0} comandos · ${pt.ia || 0} textos para a IA` },
        { rotulo: 'Recusadas', valor: negados, dica: `${pt.negado || 0} sem vínculo · ${pt.flood || 0} flood · ${pt.pin_errado || 0} PIN errado` },
        { rotulo: 'Conversas bloqueadas', valor: dados.bloqueios.length, dica: 'agora' },
        { rotulo: 'Vínculos', valor: dados.vinculos.length, dica: `${dados.vinculos.filter((v) => v.pin).length} com PIN definido` },
      ]} />

      <Secao titulo="Regras do bot em vigor" contexto="Valem para todas as conversas">
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Webhook só aceita o segredo do bot e os IPs oficiais do Telegram ({dados.regras.redes.join(', ')}).</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Só conversas privadas vinculadas por código de uso único; o ID do Telegram tem que ser o mesmo do vínculo.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{dados.regras.limite_min} comandos por minuto; 3 estouros em 10 min bloqueiam a conversa por 1 h.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Sem vínculo: {dados.regras.falhas_bloqueio} tentativas e a conversa fica 24 h bloqueada.</li>
          <li className="flex gap-2"><KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />PIN para comandos críticos ({dados.regras.criticos.map((c) => `/${c}`).join(', ')}), válido {dados.regras.pin_min} min; {dados.regras.pin_erros} erros = 24 h bloqueado.</li>
          <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Vínculo sem uso por {dados.regras.vinculo_dias} dias expira; texto que tenta mudar as regras da IA é recusado.</li>
        </ul>
      </Secao>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Secao titulo="IPs que entregaram as mensagens" contexto="O Telegram não revela o IP de quem usa o bot: chegam só os servidores dele">
          {dados.ips.length ? (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">IP</th><th>Rede</th><th className="text-right">Entregas</th><th className="text-right">Última</th></tr></thead>
              <tbody>{dados.ips.map((r) => <tr key={r.ip} className="border-t border-border"><td className="py-1.5 font-mono text-xs">{r.ip}</td><td className={r.telegram ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}>{r.telegram ? 'Telegram (oficial)' : 'fora da rede do Telegram'}</td><td className="text-right tabular">{r.n}</td><td className="text-right text-xs text-muted-foreground">{haQuanto(r.ultimo)}</td></tr>)}</tbody></table>
          ) : <p className="text-sm text-muted-foreground">Nenhuma entrega no período.</p>}
        </Secao>
        <Secao titulo="Vínculos" contexto="Quem usa o bot com a própria conta">
          {dados.vinculos.length ? (
            <ul className="divide-y divide-border text-sm">{dados.vinculos.map((v) => (
              <li key={v.chat} className="flex flex-wrap items-center gap-2 py-2">
                <Bot className="h-4 w-4 text-muted-foreground" /><span className="min-w-0 flex-1"><b className="font-medium">{v.nome}</b> <span className="text-muted-foreground">@{v.telegram || '-'} · conversa {v.chat}</span>
                  <span className="block text-xs text-muted-foreground">desde {dataHora(v.desde)} · último uso {haQuanto(v.ultimo)} · {v.pin ? 'PIN definido' : 'sem PIN'}{v.tg_id ? '' : ' · vínculo antigo (sem ID gravado)'}</span></span>
                <Botao tamanho="sm" variante="fantasma" icone={Ban} onClick={() => acao('/api/seguranca/telegram/bloquear', { chat: v.chat, horas: 24 }, 'Conversa bloqueada por 24 h.')}>Bloquear 24 h</Botao>
                <Botao tamanho="sm" variante="fantasma" icone={Unlink} onClick={() => desvincular(v.chat, v.nome)}>Desvincular</Botao>
              </li>))}</ul>
          ) : <p className="text-sm text-muted-foreground">Ninguém vinculou o Telegram ainda.</p>}
        </Secao>
      </div>

      {dados.bloqueios.length > 0 && (
        <Secao titulo="Conversas bloqueadas agora">
          <ul className="divide-y divide-border text-sm">{dados.bloqueios.map((b) => (
            <li key={b.chat} className="flex items-center gap-2 py-2"><Ban className="h-4 w-4 text-red-600" /><span className="flex-1">Conversa {b.chat} · {b.motivo || 'tentativas'} · até {dataHora(b.ate)}</span>
              <Botao tamanho="sm" variante="secundario" icone={LockOpen} onClick={() => acao('/api/seguranca/telegram/desbloquear', { chat: b.chat }, 'Conversa desbloqueada.')}>Desbloquear</Botao></li>))}</ul>
        </Secao>
      )}

      <Secao titulo="Tudo o que passou pelo bot" contexto={`${lista.length} de ${dados.eventos.length} evento(s)`}>
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} type="search" autoComplete="off" placeholder="Procurar (pessoa, comando, IP)" className="campo h-9 w-64 pl-8" aria-label="Procurar eventos" /></label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo h-9 w-48" aria-label="Tipo"><option value="">Todos os tipos</option>{Object.entries(TIPOS).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">Quando</th><th>Tipo</th><th>Pessoa</th><th>Telegram</th><th>O quê</th><th>IP do Telegram</th></tr></thead>
            <tbody>{lista.slice(0, 200).map((e, i) => { const [r, cor] = TIPOS[e.tipo] || [e.tipo, '']; return (
              <tr key={i} className="border-t border-border align-top"><td className="whitespace-nowrap py-1.5 text-xs text-muted-foreground">{dataHora(e.quando)}</td><td className={`whitespace-nowrap text-xs font-medium ${cor}`}>{r}</td>
                <td className="text-xs">{e.usuario_nome || '-'}</td><td className="text-xs text-muted-foreground">@{e.username || '-'}<span className="block">{e.chat}</span></td><td className="max-w-[22rem] break-words font-mono text-xs">{e.texto}</td><td className="font-mono text-[11px] text-muted-foreground">{e.ip}</td></tr>) })}</tbody></table>
          {!lista.length && <p className="py-6 text-center text-sm text-muted-foreground">Nada no período.</p>}
        </div>
      </Secao>
    </div>
  )
}
