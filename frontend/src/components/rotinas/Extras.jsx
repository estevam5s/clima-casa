import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, KeyRound, Plug, Plus, Save, Search, Timer, Trash2, Variable, Workflow, XCircle } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { useProjeto } from '../../contexto'
import { Aviso, Botao, Carregando, Interruptor, Modal, Selo, Vazio, confirmar, useDados, useToast } from '../ui'

// Abas novas de Rotinas (0.7.9): Execuções dos fluxos, Conexões (integrações externas cifradas), Variáveis globais e Calendário
// (o que roda em cada dia: agenda + fluxos com horário). Dados de backend/app/rotas/fluxos.py e /api/agendamentos.

const gestor = (s) => ['dono', 'admin'].includes(s?.papel)

// ---------------- Execuções ----------------
export function Execucoes() {
  const [estado, setEstado] = useState('')
  const [q, setQ] = useState('')
  const [aberta, setAberta] = useState(null)
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/fluxos-execucoes?limite=300${estado ? `&estado=${estado}` : ''}`), [estado])
  const itens = useMemo(() => (dados || []).filter((e) => !q || `${e.fluxo} ${e.origem} ${e.erro || ''}`.toLowerCase().includes(q.toLowerCase())), [dados, q])
  const abrir = async (e) => { try { setAberta(await api.get(`/api/fluxos-execucoes/${e.id}`)) } catch { setAberta(null) } }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const ok = dados.filter((e) => e.estado === 'ok').length
  const media = dados.filter((e) => e.fim).reduce((s, e, _, a) => s + (e.fim - e.inicio) / a.length, 0)
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Execuções', dados.length], ['Com sucesso', `${dados.length ? Math.round((ok / dados.length) * 100) : 0}%`], ['Com erro', dados.filter((e) => e.estado === 'erro').length], ['Duração média', `${media.toFixed(1)} s`]].map(([r, v]) => (
          <div key={r} className="cartao p-3"><p className="text-xs text-muted-foreground">{r}</p><p className="text-xl font-semibold tabular">{v}</p></div>
        ))}
      </div>
      <div className="cartao p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por fluxo, origem ou erro" className="campo h-9 pl-8" aria-label="Procurar execuções" /></div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="campo h-9 w-auto" aria-label="Estado">
            <option value="">Todos os estados</option><option value="ok">Com sucesso</option><option value="erro">Com erro</option><option value="rodando">Rodando</option><option value="ignorada">Ignoradas</option>
          </select>
          <Botao tamanho="sm" variante="secundario" onClick={recarregar}>Atualizar</Botao>
        </div>
        {!itens.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhuma execução{q || estado ? ' com esse filtro' : ' ainda'}.</p> : (
          <ul className="mt-3 divide-y divide-border">
            {itens.map((e) => (
              <li key={e.id}>
                <button onClick={() => abrir(e)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-muted/40">
                  {e.estado === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : e.estado === 'erro' ? <XCircle className="h-4 w-4 shrink-0 text-red-600" /> : <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate"><b className="font-medium">{e.fluxo}</b> · {e.origem}{e.erro ? <span className="text-red-600 dark:text-red-400"> · {e.erro}</span> : null}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline tabular">{e.passos} bloco(s){e.fim ? ` · ${e.fim - e.inicio} s` : ''}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(e.inicio)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal aberto={!!aberta} onFechar={() => setAberta(null)} titulo={aberta ? `${aberta.fluxo} · execução #${aberta.id}` : ''}>
        {aberta && (
          <ol className="space-y-2 text-sm">
            {(aberta.passos || []).map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                {p.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                <span className="min-w-0 flex-1"><code className="text-xs" translate="no">{p.tipo}</code> <span className="text-muted-foreground">({p.ms} ms)</span><br />{p.ok ? p.resumo : <span className="text-red-600 dark:text-red-400">{p.erro}</span>}</span>
              </li>
            ))}
            {!aberta.passos?.length && <li className="text-muted-foreground">Sem blocos registrados.</li>}
          </ol>
        )}
      </Modal>
    </section>
  )
}

// ---------------- Conexões ----------------
export function Conexoes() {
  const { sessao } = useProjeto()
  const toast = useToast()
  const reduzir = useReducedMotion()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/fluxos-conexoes'))
  const [form, setForm] = useState(null)   // { id?, servico, nome, campos, rede_local }
  const [salvando, setSalvando] = useState(false)
  const pode = gestor(sessao)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const servicos = dados.servicos
  const salvar = async () => {
    setSalvando(true)
    try { await api.post('/api/fluxos-conexoes', form); toast('Conexão salva (cifrada).'); setForm(null); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const apagar = async (c) => {
    if (!(await confirmar(`Apagar a conexão "${c.nome}"? Os blocos que usam ela vão falhar até escolher outra.`, { titulo: 'Apagar conexão', ok: 'Apagar' }))) return
    try { await api.del(`/api/fluxos-conexoes/${c.id}`); recarregar(); toast('Conexão apagada.') } catch (e) { toast(e.message, 'erro') }
  }
  const s = form && servicos[form.servico]
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Conexões</h2>
          <p className="text-sm text-muted-foreground">Chaves e endereços dos serviços de fora que os fluxos usam. Ficam cifrados no banco e aparecem mascarados aqui. Só o dono e os administradores mexem.</p>
        </div>
        {pode && <Botao icone={Plus} onClick={() => setForm({ servico: 'slack', nome: '', campos: {}, rede_local: false })}>Nova conexão</Botao>}
      </div>
      {!dados.conexoes.length ? <Vazio icone={Plug} titulo="Nenhuma conexão" texto={`Dá para ligar ${Object.keys(servicos).length} serviços: Slack, Discord, Teams, WhatsApp, GitHub, Trello, Notion, Home Assistant e outros.`} /> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dados.conexoes.map((c, i) => (
            <motion.li key={c.id} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="cartao flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="truncate font-medium">{c.nome}</p><p className="text-xs text-muted-foreground">{servicos[c.servico]?.nome || c.servico}</p></div>
                {c.rede_local ? <Selo cor="ambar">rede local</Selo> : <Selo cor="verde">https</Selo>}
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground" translate="no">
                {(servicos[c.servico]?.campos || []).map((f) => <li key={f.nome} className="truncate">{f.rotulo}: <span className="font-mono">{c[f.nome] || '—'}</span></li>)}
              </ul>
              {pode && <div className="mt-auto flex gap-1.5 pt-1">
                <Botao tamanho="sm" variante="secundario" onClick={() => setForm({ id: c.id, servico: c.servico, nome: c.nome, rede_local: !!c.rede_local, campos: Object.fromEntries((servicos[c.servico]?.campos || []).map((f) => [f.nome, c[f.nome] || ''])) })}>Editar</Botao>
                <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => apagar(c)} aria-label={`Apagar ${c.nome}`} />
              </div>}
            </motion.li>
          ))}
        </ul>
      )}
      <Modal aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? 'Editar conexão' : 'Nova conexão'}>
        {form && (
          <div className="space-y-3 text-sm">
            <label className="block"><span className="rotulo">Serviço</span>
              <select className="campo h-9" value={form.servico} disabled={!!form.id} onChange={(e) => setForm({ ...form, servico: e.target.value, campos: {}, rede_local: false })}>
                {Object.entries(servicos).sort((a, b) => a[1].nome.localeCompare(b[1].nome)).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
              </select></label>
            <label className="block"><span className="rotulo">Nome (para achar nos blocos)</span><input className="campo h-9" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder={`${s?.nome} da equipe`} /></label>
            {s?.campos.map((f) => (
              <label key={f.nome} className="block"><span className="rotulo flex items-center gap-1">{f.segredo && <KeyRound className="h-3 w-3" />}{f.rotulo}</span>
                <input className="campo h-9 font-mono" type={f.segredo ? 'password' : 'text'} autoComplete="new-password" value={form.campos[f.nome] || ''}
                  onChange={(e) => setForm({ ...form, campos: { ...form.campos, [f.nome]: e.target.value } })} placeholder={f.segredo && form.id ? 'vazio = manter o atual' : ''} /></label>
            ))}
            {s?.rede_local && sessao?.papel === 'dono' && (
              <label className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-xs">
                <span>Está na rede do escritório (http://192.168…). Só roda no agente, pelos gatilhos automáticos.</span>
                <Interruptor ligado={form.rede_local} onChange={(v) => setForm({ ...form, rede_local: v })} rotulo="Rede local" />
              </label>)}
            <div className="flex justify-end gap-2 pt-1"><Botao variante="fantasma" onClick={() => setForm(null)}>Cancelar</Botao><Botao icone={Save} carregando={salvando} onClick={salvar}>Salvar</Botao></div>
          </div>
        )}
      </Modal>
    </section>
  )
}

// ---------------- Variáveis ----------------
export function Variaveis() {
  const { sessao } = useProjeto()
  const toast = useToast()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/fluxos-variaveis'))
  const [linhas, setLinhas] = useState(null)
  const pode = sessao?.permissoes?.includes('automacoes.gerenciar')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const atuais = linhas ?? Object.entries(dados).map(([k, v]) => ({ k, v: String(v) }))
  const salvar = async () => {
    try { await api.put('/api/fluxos-variaveis', { variaveis: Object.fromEntries(atuais.filter((l) => l.k.trim()).map((l) => [l.k.trim(), l.v])) }); toast('Variáveis salvas.'); setLinhas(null); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <section className="cartao max-w-3xl space-y-3 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Variable className="h-5 w-5" />Variáveis globais</h2>
        <p className="text-sm text-muted-foreground">Valores que todos os fluxos enxergam pelos blocos Ler e Gravar variável global (e Contador). Os fluxos também mudam estes valores quando rodam.</p>
      </div>
      {!atuais.length && <p className="text-sm text-muted-foreground">Nenhuma variável ainda.</p>}
      <ul className="space-y-2">
        {atuais.map((l, i) => (
          <li key={i} className="flex gap-2">
            <input className="campo h-9 w-40 font-mono" value={l.k} disabled={!pode} aria-label="Nome" placeholder="nome" onChange={(e) => setLinhas(atuais.map((x, j) => (j === i ? { ...x, k: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') } : x)))} />
            <input className="campo h-9 flex-1" value={l.v} disabled={!pode} aria-label="Valor" placeholder="valor" onChange={(e) => setLinhas(atuais.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
            {pode && <Botao variante="fantasma" icone={Trash2} aria-label="Remover" onClick={() => setLinhas(atuais.filter((_, j) => j !== i))} />}
          </li>
        ))}
      </ul>
      {pode && <div className="flex gap-2"><Botao variante="secundario" icone={Plus} onClick={() => setLinhas([...atuais, { k: '', v: '' }])}>Adicionar</Botao><Botao icone={Save} onClick={salvar} disabled={linhas === null}>Salvar</Botao></div>}
    </section>
  )
}

// ---------------- Calendário ----------------
const NOMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
export function Calendario() {
  const [base, setBase] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [dia, setDia] = useState(() => new Date().toDateString())
  const { dados, erro } = useDados(() => Promise.all([api.get('/api/agendamentos'), api.get('/api/fluxos'), api.get('/api/agendamentos/regras').catch(() => ({}))]))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [ag, fl, regras] = dados
  const agenda = (Array.isArray(ag) ? ag : ag?.itens || []).filter((g) => g.ativo)
  const fluxos = (fl || []).filter((f) => f.ativo)
  const feriados = Object.fromEntries((regras?.proximos || regras?.feriados || []).map((f) => [f.data, f.nome]))
  const ano = base.getFullYear(), mes = base.getMonth()
  const inicio = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay())
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i))
  const doDia = (d) => {
    const iso = d.toISOString().slice(0, 10)
    const fer = feriados[iso]
    const itens = agenda.filter((g) => (g.dias || []).includes(d.getDay())).map((g) => ({ hora: g.hora, nome: g.nome, tipo: 'Agenda', pula: fer && g.pular_feriado !== false }))
    fluxos.forEach((f) => f.gatilhos.forEach((g) => { const m = /^às (\d\d:\d\d)$/.exec(g); if (m) itens.push({ hora: m[1], nome: f.nome, tipo: 'Fluxo' }) }))
    return { fer, itens: itens.sort((a, b) => String(a.hora).localeCompare(String(b.hora))) }
  }
  const escolhido = dias.find((d) => d.toDateString() === dia) || new Date(dia)
  const det = doDia(escolhido)
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="cartao p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-5 w-5" />{base.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-1">
            <Botao tamanho="sm" variante="fantasma" icone={ChevronLeft} aria-label="Mês anterior" onClick={() => setBase(new Date(ano, mes - 1, 1))} />
            <Botao tamanho="sm" variante="secundario" onClick={() => { const d = new Date(); d.setDate(1); setBase(d); setDia(new Date().toDateString()) }}>Hoje</Botao>
            <Botao tamanho="sm" variante="fantasma" icone={ChevronRight} aria-label="Próximo mês" onClick={() => setBase(new Date(ano, mes + 1, 1))} />
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">{NOMES.map((n) => <span key={n}>{n}</span>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const { fer, itens } = doDia(d)
            const hoje = d.toDateString() === new Date().toDateString()
            return (
              <button key={d.toISOString()} onClick={() => setDia(d.toDateString())} aria-pressed={dia === d.toDateString()}
                className={`flex min-h-[64px] flex-col items-start rounded-md border p-1.5 text-left text-xs ${d.getMonth() !== mes ? 'opacity-40' : ''} ${dia === d.toDateString() ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:bg-muted/50'}`}>
                <span className={`tabular ${hoje ? 'rounded bg-primary px-1 text-primary-foreground' : ''}`}>{d.getDate()}</span>
                {fer && <span className="mt-0.5 w-full truncate text-[10px] text-amber-600 dark:text-amber-400">{fer}</span>}
                {!!itens.length && <span className="mt-auto text-[10px] text-muted-foreground tabular">{itens.length} rotina(s)</span>}
              </button>
            )
          })}
        </div>
      </div>
      <aside className="cartao p-4">
        <p className="font-medium">{escolhido.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        {det.fer && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Feriado: {det.fer}. A agenda que pula feriado não roda.</p>}
        {!det.itens.length ? <p className="mt-3 text-sm text-muted-foreground">Nada marcado para este dia.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {det.itens.map((it, i) => (
              <li key={i} className={`flex items-center gap-2 ${it.pula ? 'opacity-50 line-through' : ''}`}>
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="tabular">{it.hora}</span>
                <span className="min-w-0 flex-1 truncate">{it.nome}</span>
                <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{it.tipo === 'Fluxo' && <Workflow className="h-3 w-3" />}{it.tipo}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[11px] text-muted-foreground">Mostra a agenda e os fluxos com gatilho de horário. Fluxos por evento (ar ligou, chuva, bug novo…) não têm hora marcada.</p>
      </aside>
    </section>
  )
}
