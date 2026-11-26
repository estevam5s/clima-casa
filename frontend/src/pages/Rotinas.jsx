import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Clock3, History, LayoutDashboard, Play, Search, Sparkles, Timer, Workflow, XCircle, Zap } from 'lucide-react'
import { api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Botao, CabecalhoSecundario, Cabecalho, Carregando, FaixaMetricas, Vazio, useDados, useToast } from '../components/ui'

// Rotinas: Cenas, Automações e Agenda numa tela só (pedido do dono, 26/11/2026). As três telas continuam inteiras dentro das
// abas (CabecalhoSecundario deixa o título delas menor); /cenas, /automacoes e /agendamentos abrem a aba certa (main.jsx).
const Cenas = lazy(() => import('./Cenas'))
const Automacoes = lazy(() => import('./Automacoes'))
const Agendamentos = lazy(() => import('./Agendamentos'))

const ABAS = [
  ['geral', 'Visão geral', LayoutDashboard],
  ['cenas', 'Cenas', Sparkles],
  ['automacoes', 'Automações', Workflow],
  ['agenda', 'Agenda', CalendarClock],
  ['historico', 'Histórico', History],
]
const ORIGEM = { cena: ['Cena', Sparkles], automacao: ['Automação', Workflow], agenda: ['Agenda', CalendarClock] }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function proximas(lista, n = 5) {
  const agora = new Date(), saida = []
  for (const g of lista.filter((x) => x.ativo)) {
    const [h, m] = String(g.hora || '00:00').split(':').map(Number)
    for (let d = 0; d < 8; d++) {
      const quando = new Date(agora); quando.setDate(agora.getDate() + d); quando.setHours(h, m, 0, 0)
      if (quando > agora && (g.dias || []).includes(quando.getDay())) { saida.push({ quando, g }); break }
    }
  }
  return saida.sort((a, b) => a.quando - b.quando).slice(0, n)
}
const quandoTexto = (d) => {
  const hoje = new Date(), am = new Date(); am.setDate(hoje.getDate() + 1)
  const dia = d.toDateString() === hoje.toDateString() ? 'hoje' : d.toDateString() === am.toDateString() ? 'amanhã' : DIAS[d.getDay()]
  return `${dia} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
const origemBase = (o) => String(o || '').split(':')[0]

function useHistorico(limite = 40) {
  return useDados(() => Promise.all(['cena', 'automacao', 'agenda'].map((o) => api.get(`/api/atividade?origem=${o}&limite=${limite}`).catch(() => [])))
    .then((rs) => rs.flatMap((r) => (Array.isArray(r) ? r : r?.itens || [])).sort((a, b) => b.quando - a.quando)))
}

function LinhaHistorico({ e }) {
  const [rot, I] = ORIGEM[origemBase(e.origem)] || ['Rotina', Zap]
  const nome = String(e.origem || '').includes(':') ? String(e.origem).split(':').slice(1).join(':') : ''
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      {e.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
      <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"><I className="h-3 w-3" />{rot}</span>
      <span className="min-w-0 flex-1 truncate">{nome && <b className="font-medium">{nome} · </b>}{e.acao}{e.aparelho_nome ? ` · ${e.aparelho_nome}` : ''}{!e.ok && e.detalhe ? <span className="text-red-600 dark:text-red-400"> · {e.detalhe}</span> : null}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(e.quando)}</span>
    </li>
  )
}

function VisaoGeral({ irPara }) {
  const { filtro } = useProjeto()
  const toast = useToast()
  const [rodando, setRodando] = useState(null)
  const { dados, erro } = useDados(() => Promise.all([api.get(comFiltro('/api/cenas', filtro)), api.get('/api/automacoes'), api.get('/api/agendamentos'), api.get('/api/temporizadores')]), [filtro])
  const hist = useHistorico(20)
  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!dados) return <Carregando />
  const [cenas, autos, agenda, timers] = dados.map((x) => (Array.isArray(x) ? x : x?.itens || []))
  const ativas = autos.filter((a) => a.ativo).length, agAtivos = agenda.filter((g) => g.ativo).length
  const prox = proximas(agenda)
  const itensHist = hist.dados || []
  const falhas24 = itensHist.filter((e) => !e.ok && e.quando > Date.now() / 1000 - 86400).length
  const executar = async (c) => {
    setRodando(c.id)
    try { const r = await api.post(`/api/cenas/${c.id}/executar`); toast(r?.falhas?.length ? `${c.nome}: ${r.falhas.length} comando(s) falharam.` : `${c.nome} executada.`, r?.falhas?.length ? 'erro' : 'ok'); hist.recarregar?.() } catch (e) { toast(e.message, 'erro') } finally { setRodando(null) }
  }
  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Cenas', valor: cenas.length, dica: 'um toque, vários comandos' },
        { rotulo: 'Automações ativas', valor: `${ativas}/${autos.length}`, dica: 'agem sozinhas' },
        { rotulo: 'Agendamentos ativos', valor: `${agAtivos}/${agenda.length}`, dica: prox[0] ? `próximo ${quandoTexto(prox[0].quando)}` : timers.length ? `${timers.length} timer(s) agora` : 'nenhum programado' },
        { rotulo: 'Falhas em 24 h', valor: falhas24, dica: falhas24 ? 'veja o Histórico' : 'tudo certo' },
      ]} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="cartao p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="titulo-secao flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Cenas para executar</h2>
            <button type="button" onClick={() => irPara('cenas')} className="text-xs text-muted-foreground hover:text-foreground">Ver todas</button></div>
          {cenas.length ? (
            <ul className="mt-3 divide-y divide-border">{cenas.slice(0, 6).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate"><b className="font-medium">{c.nome}</b><span className="text-muted-foreground"> · {(c.acoes || []).length} comando(s){c.executada_em ? ` · última ${haQuanto(c.executada_em)}` : ''}</span></span>
                <Botao tamanho="sm" variante="secundario" icone={Play} carregando={rodando === c.id} onClick={() => executar(c)}>Executar</Botao>
              </li>))}</ul>
          ) : <Vazio icone={Sparkles} titulo="Nenhuma cena" descricao="Crie uma para ligar ou desligar vários ares com um toque." acao={<Botao tamanho="sm" onClick={() => irPara('cenas')}>Criar cena</Botao>} />}
        </section>
        <section className="cartao p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="titulo-secao flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" />Próximos horários</h2>
            <button type="button" onClick={() => irPara('agenda')} className="text-xs text-muted-foreground hover:text-foreground">Abrir a agenda</button></div>
          {prox.length ? (
            <ul className="mt-3 divide-y divide-border">{prox.map(({ quando, g }) => (
              <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 shrink-0 tabular text-muted-foreground">{quandoTexto(quando)}</span>
                <span className="min-w-0 flex-1 truncate"><b className="font-medium">{g.nome}</b>{g.aparelho_nome ? ` · ${g.aparelho_nome}` : ''}</span>
              </li>))}</ul>
          ) : <p className="mt-3 text-sm text-muted-foreground">Nenhum agendamento ativo nos próximos 7 dias.</p>}
          {timers.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Timer className="h-3.5 w-3.5" />Timers ativos</p>
              <ul className="mt-1.5 space-y-1 text-sm">{timers.slice(0, 4).map((t) => <li key={t.id} className="truncate">{t.aparelho_nome || `Ar #${t.aparelho_id}`} · {t.acao?.ligado === false || t.acao === 'desligar' ? 'desliga' : 'muda'} {haQuanto(t.executar_em)}</li>)}</ul>
            </div>
          )}
        </section>
        <section className="cartao p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="titulo-secao flex items-center gap-2"><Workflow className="h-4 w-4 text-primary" />Automações</h2>
            <button type="button" onClick={() => irPara('automacoes')} className="text-xs text-muted-foreground hover:text-foreground">Gerenciar</button></div>
          {autos.length ? (
            <ul className="mt-3 divide-y divide-border">{autos.slice(0, 6).map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`h-2 w-2 shrink-0 rounded-full ${a.ativo ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} title={a.ativo ? 'Ativa' : 'Pausada'} />
                <span className="min-w-0 flex-1 truncate"><b className="font-medium">{a.nome}</b><span className="text-muted-foreground"> · {a.disparos || 0} disparo(s){a.ultimo_disparo ? ` · último ${haQuanto(a.ultimo_disparo)}` : ''}</span></span>
              </li>))}</ul>
          ) : <Vazio icone={Workflow} titulo="Nenhuma automação" descricao="Ex.: desligar o ar 2 horas depois de ligado, ou ligar a sala quando a Alexa ligar outro ar." acao={<Botao tamanho="sm" onClick={() => irPara('automacoes')}>Criar automação</Botao>} />}
        </section>
        <section className="cartao p-5">
          <div className="flex items-center justify-between gap-2"><h2 className="titulo-secao flex items-center gap-2"><History className="h-4 w-4 text-primary" />Últimas execuções</h2>
            <button type="button" onClick={() => irPara('historico')} className="text-xs text-muted-foreground hover:text-foreground">Histórico completo</button></div>
          {itensHist.length ? <ul className="mt-3 divide-y divide-border">{itensHist.slice(0, 8).map((e) => <LinhaHistorico key={`${e.id}`} e={e} />)}</ul>
            : <p className="mt-3 text-sm text-muted-foreground">Nenhuma cena, automação ou agendamento rodou ainda.</p>}
        </section>
      </div>
    </div>
  )
}

function Historico() {
  const { dados, recarregar } = useHistorico(100)
  const [tipo, setTipo] = useState('')
  const [falhas, setFalhas] = useState(false)
  const [q, setQ] = useState('')
  const itens = useMemo(() => (dados || []).filter((e) => (!tipo || origemBase(e.origem) === tipo) && (!falhas || !e.ok)
    && (!q || `${e.origem} ${e.acao} ${e.aparelho_nome || ''} ${e.detalhe || ''}`.toLowerCase().includes(q.toLowerCase()))), [dados, tipo, falhas, q])
  if (!dados) return <Carregando />
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por nome, ar ou motivo" className="campo h-9 pl-8" aria-label="Procurar no histórico" /></div>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo h-9 w-auto" aria-label="Tipo de rotina">
          <option value="">Todas as rotinas</option><option value="cena">Cenas</option><option value="automacao">Automações</option><option value="agenda">Agenda</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={falhas} onChange={(e) => setFalhas(e.target.checked)} />Só falhas</label>
        <Botao tamanho="sm" variante="secundario" onClick={recarregar}>Atualizar</Botao>
      </div>
      <p className="mt-3 text-xs text-muted-foreground tabular">{itens.length} execução(ões) · {itens.filter((e) => !e.ok).length} falha(s)</p>
      {itens.length ? <ul className="mt-2 divide-y divide-border">{itens.map((e) => <LinhaHistorico key={`${e.id}`} e={e} />)}</ul>
        : <p className="mt-4 text-sm text-muted-foreground">Nada com esse filtro.</p>}
    </section>
  )
}

export default function Rotinas() {
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(([k]) => k === params.get('aba')) ? params.get('aba') : 'geral'
  const irPara = (k) => setParams((p) => { const n = new URLSearchParams(p); n.set('aba', k); return n })
  return (
    <div className="w-full">
      <Cabecalho titulo="Rotinas" descricao="Cenas, automações e agenda num lugar só: o que roda com um toque, sozinho por regra ou no horário marcado." />
      <div role="tablist" aria-label="Rotinas" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-border px-4 lg:mx-0 lg:px-0">
        {ABAS.map(([k, r, I]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => irPara(k)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <I className="h-4 w-4" />{r}
          </button>
        ))}
      </div>
      <CabecalhoSecundario.Provider value>
        <Suspense fallback={<Carregando />}>
          {aba === 'geral' && <VisaoGeral irPara={irPara} />}
          {aba === 'cenas' && <Cenas />}
          {aba === 'automacoes' && <Automacoes />}
          {aba === 'agenda' && <Agendamentos />}
          {aba === 'historico' && <Historico />}
        </Suspense>
      </CabecalhoSecundario.Provider>
    </div>
  )
}
