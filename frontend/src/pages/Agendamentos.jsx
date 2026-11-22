import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock, Copy, History, Moon, Pencil, Plus, Sparkles, Sun, Timer, Trash2, XCircle } from 'lucide-react'
import { DIAS, MODOS, VENTILACAO, api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'
import { motion } from 'framer-motion'
import FerramentasLista, { baixarArquivo, normalizar, paraCsv } from '../components/FerramentasLista'
import RegrasAgenda from '../components/RegrasAgenda'
import { useProjeto } from '../contexto'

const ATALHOS = [['Todos os dias', [0, 1, 2, 3, 4, 5, 6]], ['Dias úteis', [1, 2, 3, 4, 5]], ['Fim de semana', [0, 6]]]

function Form({ inicial, aparelhos, aoSalvar, onFechar }) {
  const [f, setF] = useState(() => ({
    aparelho_id: inicial?.aparelho_id || aparelhos[0]?.id,
    nome: inicial?.nome || '',
    dias: inicial?.dias || [1, 2, 3, 4, 5],
    hora: inicial?.hora || '22:00',
    ligado: inicial ? inicial.acao.ligado : true,
    modo: inicial?.acao.modo || 'frio',
    temperatura: inicial?.acao.temperatura || 23,
    ventilador: inicial?.acao.ventilador || 'auto',
    ativo: inicial ? !!inicial.ativo : true,
  }))
  const [erro, setErro] = useState('')
  const ar = aparelhos.find((a) => a.id === +f.aparelho_id)
  const set = (k, v) => setF({ ...f, [k]: v })

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    try {
      const corpo = { ...f, aparelho_id: +f.aparelho_id, temperatura: +f.temperatura, nome: f.nome || (f.ligado ? `Ligar ${f.temperatura}°C` : 'Desligar') }
      if (inicial) await api.put(`/api/agendamentos/${inicial.id}`, corpo)
      else await api.post('/api/agendamentos', corpo)
      aoSalvar()
      onFechar()
    } catch (e) { setErro(e.message) }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="aa">Aparelho</label>
        <select id="aa" className="campo" value={f.aparelho_id} onChange={(e) => set('aparelho_id', e.target.value)}>
          {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.comodo ? ` · ${a.comodo}` : ''}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div><label className="rotulo" htmlFor="an">Nome</label><input id="an" className="campo" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Ligar antes de dormir" maxLength={60} /></div>
        <div><label className="rotulo" htmlFor="ah">Horário</label><input id="ah" type="time" className="campo" value={f.hora} onChange={(e) => set('hora', e.target.value)} required /></div>
      </div>
      <div>
        <span className="rotulo">Dias</span>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((d, i) => (
            <button type="button" key={d} onClick={() => set('dias', f.dias.includes(i) ? f.dias.filter((x) => x !== i) : [...f.dias, i])}
              className={`h-9 w-11 rounded-md border text-sm ${f.dias.includes(i) ? 'border-marca-600 bg-marca-600 text-white' : 'border-border'}`}>{d}</button>
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-xs">
          {ATALHOS.map(([r, d]) => <button type="button" key={r} className="text-marca-600 hover:underline dark:text-marca-500" onClick={() => set('dias', d)}>{r}</button>)}
        </div>
      </div>
      <div>
        <span className="rotulo">Ação</span>
        <div className="flex gap-2">
          {[[true, 'Ligar'], [false, 'Desligar']].map(([v, r]) => (
            <button type="button" key={r} onClick={() => set('ligado', v)}
              className={`rounded-md border px-4 py-1.5 text-sm ${f.ligado === v ? 'border-marca-600 bg-marca-600 text-white' : 'border-border'}`}>{r}</button>
          ))}
        </div>
      </div>
      {f.ligado && ar && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="rotulo" htmlFor="am">Modo</label>
            <select id="am" className="campo" value={f.modo} onChange={(e) => set('modo', e.target.value)}>
              {ar.modos.split(',').map((m) => <option key={m} value={m}>{MODOS[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="at">Temp.</label>
            <select id="at" className="campo" value={f.temperatura} onChange={(e) => set('temperatura', e.target.value)}>
              {Array.from({ length: ar.temp_max - ar.temp_min + 1 }, (_, i) => ar.temp_min + i).map((t) => <option key={t} value={t}>{t}°C</option>)}
            </select>
          </div>
          <div>
            <label className="rotulo" htmlFor="av">Ventilação</label>
            <select id="av" className="campo" value={f.ventilador} onChange={(e) => set('ventilador', e.target.value)}>
              {Object.entries(VENTILACAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </div>
        </div>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
    </form>
  )
}

// modelos prontos: cada um vira 1 ou 2 agendamentos por ar escolhido
const MODELOS = [
  { id: 'expediente', icone: Sun, nome: 'Expediente', texto: 'Liga 7h45 em 23° (frio) e desliga 18h05, dias úteis', itens: [
    { nome: 'Expediente: ligar', hora: '07:45', dias: [1, 2, 3, 4, 5], ligado: true, modo: 'frio', temperatura: 23, ventilador: 'auto' },
    { nome: 'Expediente: desligar', hora: '18:05', dias: [1, 2, 3, 4, 5], ligado: false }] },
  { id: 'esquecido', icone: Moon, nome: 'Rede de segurança', texto: 'Desliga às 19h30 todos os dias, para nada ficar ligado à noite', itens: [
    { nome: 'Desligar à noite (segurança)', hora: '19:30', dias: [0, 1, 2, 3, 4, 5, 6], ligado: false }] },
  { id: 'almoco', icone: Clock, nome: 'Pausa do almoço', texto: 'Sobe para 25° às 12h e volta a 23° às 13h15, dias úteis', itens: [
    { nome: 'Almoço: economia', hora: '12:00', dias: [1, 2, 3, 4, 5], ligado: true, modo: 'frio', temperatura: 25, ventilador: 'baixa' },
    { nome: 'Almoço: volta', hora: '13:15', dias: [1, 2, 3, 4, 5], ligado: true, modo: 'frio', temperatura: 23, ventilador: 'auto' }] },
  { id: 'sabado', icone: Sparkles, nome: 'Sábado meio período', texto: 'Liga 8h em 23° e desliga 12h30 aos sábados', itens: [
    { nome: 'Sábado: ligar', hora: '08:00', dias: [6], ligado: true, modo: 'frio', temperatura: 23, ventilador: 'auto' },
    { nome: 'Sábado: desligar', hora: '12:30', dias: [6], ligado: false }] },
]

function Modelos({ aparelhos, aoCriar }) {
  const toast = useToast()
  const [modelo, setModelo] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [criando, setCriando] = useState(false)
  const criar = async () => {
    setCriando(true)
    let n = 0
    try {
      for (const id of sel) for (const it of modelo.itens) { await api.post('/api/agendamentos', { ...it, aparelho_id: id, ativo: true }); n++ }
      toast(`${n} agendamento(s) criado(s) para ${sel.size} ar(es).`); setModelo(null); setSel(new Set()); aoCriar()
    } catch (e) { toast(`${n} criado(s); depois deu erro: ${e.message}`, 'erro'); aoCriar() } finally { setCriando(false) }
  }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Modelos prontos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Um clique cria a rotina para vários ares de uma vez. Dá para ajustar cada agendamento depois.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODELOS.map((m) => (
          <button key={m.id} onClick={() => { setModelo(m); setSel(new Set(aparelhos.filter((a) => a.hub_id).map((a) => a.id))) }} disabled={!aparelhos.length}
            className="flex flex-col items-start gap-1.5 rounded-xl border border-border p-4 text-left hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50">
            <m.icone className="h-5 w-5 text-primary" /><span className="text-sm font-medium">{m.nome}</span><span className="text-xs text-muted-foreground">{m.texto}</span>
          </button>
        ))}
      </div>
      <Modal aberto={!!modelo} titulo={`Modelo: ${modelo?.nome || ''}`} onFechar={() => setModelo(null)}>
        {modelo && (
          <div className="space-y-4">
            <ul className="space-y-1 text-sm">{modelo.itens.map((it) => <li key={it.nome} className="flex gap-2"><span className="w-12 font-semibold tabular-nums">{it.hora}</span><span>{it.ligado ? `Ligar ${MODOS[it.modo].toLowerCase()} ${it.temperatura}°` : 'Desligar'} · {it.dias.length === 7 ? 'todos os dias' : it.dias.map((d) => DIAS[d]).join(', ')}</span></li>)}</ul>
            <div>
              <div className="flex items-center justify-between"><span className="rotulo">Para quais ares</span>
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSel(sel.size === aparelhos.length ? new Set() : new Set(aparelhos.map((a) => a.id)))}>{sel.size === aparelhos.length ? 'Nenhum' : 'Todos'}</button></div>
              <div className="mt-1 grid max-h-56 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
                {aparelhos.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                    <input type="checkbox" checked={sel.has(a.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(a.id); else n.delete(a.id); setSel(n) }} />
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>{!a.hub_id && <span className="text-[10px] text-amber-600">sem transmissor</span>}
                  </label>
                ))}
              </div>
              <p className="ajuda mt-1">Ares iguais na mesma zona mudam juntos: escolher um da zona já basta.</p>
            </div>
            <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => setModelo(null)}>Cancelar</Botao><Botao carregando={criando} disabled={!sel.size} onClick={criar}>Criar {modelo.itens.length * sel.size} agendamento(s)</Botao></div>
          </div>
        )}
      </Modal>
    </section>
  )
}

function Timers() {
  const toast = useToast()
  const { dados, recarregar } = useDados(() => api.get('/api/temporizadores'))
  const [agora, setAgora] = useState(Date.now() / 1000)
  useEffect(() => { const t = setInterval(() => setAgora(Date.now() / 1000), 15000); return () => clearInterval(t) }, [])
  const cancelar = async (t) => { try { await api.del(`/api/aparelhos/${t.aparelho_id}/temporizador`); toast('Timer cancelado.'); recarregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><Timer className="h-4 w-4 text-primary" />Timers ativos</h2>
      {!dados?.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum timer agora. No detalhe do ar (ou pelo Telegram, "/desligarem60") dá para marcar "desligar daqui a…".</p> : (
        <ul className="mt-3 divide-y divide-border">
          {dados.map((t) => {
            const acao = typeof t.acao === 'string' ? JSON.parse(t.acao) : (t.acao || {})
            const min = Math.max(0, Math.round((t.executar_em - agora) / 60))
            return (
              <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-16 font-semibold tabular-nums">{min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`}</span>
                <span className="min-w-0 flex-1 truncate">{t.aparelho_nome} · {acao.ligado === false ? 'desliga' : 'liga'} às {new Date(t.executar_em * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}<span className="ml-1 text-xs text-muted-foreground">({t.origem})</span></span>
                <button onClick={() => cancelar(t)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-red-600">Cancelar</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Historico() {
  const { dados } = useDados(() => api.get('/api/atividade?origem=agenda&limite=15'))
  const itens = Array.isArray(dados) ? dados : dados?.itens || []
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><History className="h-4 w-4 text-primary" />Últimas execuções</h2>
      {!itens.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma execução registrada ainda. Cada horário que roda aparece aqui (e na Atividade).</p> : (
        <ul className="mt-3 divide-y divide-border">
          {itens.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              {e.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
              <span className="min-w-0 flex-1 truncate">{e.acao}<span className="ml-1 text-xs text-muted-foreground">{String(e.origem).replace('agenda:', '')}{e.aparelho_nome ? ` · ${e.aparelho_nome}` : ''}</span></span>
              <span className="text-xs text-muted-foreground">{haQuanto(e.quando)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function proxima(lista) {
  const agora = new Date()
  let melhor = null
  for (const g of lista.filter((x) => x.ativo)) {
    const [h, m] = g.hora.split(':').map(Number)
    for (let d = 0; d < 8; d++) {
      const quando = new Date(agora); quando.setDate(agora.getDate() + d); quando.setHours(h, m, 0, 0)
      if (quando > agora && g.dias.includes(quando.getDay())) { if (!melhor || quando < melhor.quando) melhor = { quando, g }; break }
    }
  }
  return melhor
}

function Semana({ lista }) {
  const hoje = new Date().getDay()
  const agoraPct = ((new Date().getHours() * 60 + new Date().getMinutes()) / 1440) * 100
  return (
    <div className="cartao overflow-x-auto p-4">
      <div className="min-w-[620px]">
        <div className="mb-1 ml-12 flex justify-between text-[10px] text-muted-foreground tabular">{['00h', '06h', '12h', '18h', '24h'].map((h) => <span key={h}>{h}</span>)}</div>
        {DIAS.map((d, i) => (
          <div key={d} className="flex items-center gap-2 py-1">
            <span className={`w-10 text-xs ${i === hoje ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{d}</span>
            <div className="relative h-7 flex-1 rounded-md bg-muted/60">
              {i === hoje && <span className="absolute inset-y-0 w-px bg-primary/60" style={{ left: `${agoraPct}%` }} title="agora" />}
              {lista.filter((g) => g.dias.includes(i)).map((g, n) => {
                const [h, m] = g.hora.split(':').map(Number)
                return (
                  <motion.span key={g.id} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: n * 0.03 + i * 0.02 }}
                    title={`${g.hora} · ${g.nome} · ${g.aparelho_nome}`}
                    className={`absolute top-1 h-5 -translate-x-1/2 rounded px-1.5 text-[10px] font-medium leading-5 tabular ${!g.ativo ? 'bg-muted-foreground/20 text-muted-foreground' : g.acao.ligado ? 'bg-primary text-primary-foreground' : 'bg-foreground/80 text-background'}`}
                    style={{ left: `${((h * 60 + m) / 1440) * 100}%` }}>{g.hora}</motion.span>
                )
              })}
            </div>
          </div>
        ))}
        <div className="ml-12 mt-2 flex gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Ligar</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-foreground/80" /> Desligar</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/20" /> Pausado</span>
        </div>
      </div>
    </div>
  )
}

export default function Agendamentos() {
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get('/api/agendamentos'), api.get('/api/aparelhos')]))
  const [modal, setModal] = useState(null)
  const toast = useToast()
  const [apagar, setApagar] = useState(null)
  const [filtroAr, setFiltroAr] = useState('')
  const [busca, setBusca] = useState(''), [estado, setEstado] = useState('todos'), [sel, setSel] = useState(new Set()), [emLote, setEmLote] = useState(false)
  const { sessao } = useProjeto()
  const ordenada = useMemo(() => (dados ? [...dados[0]]
    .filter((g) => !filtroAr || String(g.aparelho_id) === filtroAr)
    .filter((g) => estado === 'todos' || (estado === 'ativos' ? g.ativo : estado === 'pausados' ? !g.ativo : estado === 'ligar' ? g.acao.ligado : !g.acao.ligado))
    .filter((g) => !busca || normalizar(`${g.nome} ${g.aparelho_nome} ${g.hora}`).includes(normalizar(busca)))
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.nome.localeCompare(b.nome)) : []), [dados, filtroAr, estado, busca])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [lista, aparelhos] = dados

  const corpo = (g, extra = {}) => ({ ...g.acao, aparelho_id: g.aparelho_id, nome: g.nome, dias: g.dias, hora: g.hora, ativo: g.ativo, ...extra })
  const alternar = async (g, ativo) => {
    try { await api.put(`/api/agendamentos/${g.id}`, corpo(g, { ativo })); toast(ativo ? 'Agendamento ativado.' : 'Agendamento pausado.'); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  const duplicar = async (g) => {
    try { await api.post('/api/agendamentos', corpo(g, { nome: `${g.nome} (cópia)`.slice(0, 60), ativo: false })); toast('Cópia criada, pausada: ajuste e ative.'); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  const lote = async (acao) => {
    const alvo = lista.filter((g) => sel.has(g.id))
    setEmLote(true); let ok = 0
    for (const g of alvo) {
      try { if (acao === 'apagar') await api.del(`/api/agendamentos/${g.id}`); else await api.put(`/api/agendamentos/${g.id}`, corpo(g, { ativo: acao === 'ativar' })); ok++ } catch (e) { toast(`${g.nome}: ${e.message}`, 'erro') }
    }
    setEmLote(false); setSel(new Set()); toast(`${ok} agendamento(s) ${acao === 'apagar' ? 'apagado(s)' : acao === 'ativar' ? 'ativado(s)' : 'pausado(s)'}.`); recarregar()
  }
  const exportarJson = () => baixarArquivo('agendamentos.json', JSON.stringify({ tipo: 'agendamentos', versao: 1, itens: lista.map((g) => ({ nome: g.nome, aparelho_id: g.aparelho_id, aparelho_nome: g.aparelho_nome, dias: g.dias, hora: g.hora, acao: g.acao, ativo: !!g.ativo })) }, null, 2), 'application/json')
  const exportarCsv = () => baixarArquivo('agendamentos.csv', paraCsv(ordenada, [['hora', 'Hora'], ['nome', 'Nome'], ['aparelho_nome', 'Aparelho'], [(g) => descrever(g), 'Ação'], [(g) => dias(g.dias), 'Dias'], [(g) => (g.ativo ? 'ativo' : 'pausado'), 'Estado']]), 'text/csv')
  const importar = async (j) => {
    if (!j || j.tipo !== 'agendamentos' || !Array.isArray(j.itens)) return toast('Este arquivo não é uma exportação de agendamentos.', 'erro')
    let ok = 0, pulados = 0
    for (const it of j.itens) {
      const ar = aparelhos.find((a) => a.id === it.aparelho_id) || aparelhos.find((a) => a.nome === it.aparelho_nome)
      if (!ar) { pulados++; continue }
      try { await api.post('/api/agendamentos', { ...it.acao, aparelho_id: ar.id, nome: String(it.nome).slice(0, 60), dias: it.dias, hora: it.hora, ativo: false }); ok++ } catch { pulados++ }
    }
    toast(`${ok} importado(s), pausados para você conferir e ativar${pulados ? `; ${pulados} pulado(s) (ar não encontrado)` : ''}.`); recarregar()
  }
  const descrever = (g) => (g.acao.ligado
    ? `Ligar${g.acao.modo ? ` em ${MODOS[g.acao.modo].toLowerCase()}` : ''}${g.acao.temperatura ? ` ${g.acao.temperatura}°C` : ''}`
    : 'Desligar')
  const dias = (d) => (d.length === 7 ? 'Todos os dias' : d.join() === '1,2,3,4,5' ? 'Dias úteis' : d.join() === '0,6' ? 'Fim de semana' : d.map((i) => DIAS[i]).join(', '))

  return (
    <div className="w-full">
      <Cabecalho titulo="Agenda" descricao="Liga e desliga os aparelhos sozinho nos horários definidos. Precisa do Clima Escritório rodando."
        acoes={<Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Novo agendamento</Botao>} />
      {lista.length > 0 && (() => {
        const prox = proxima(lista)
        return (
          <div className="mb-6 space-y-4">
            <FaixaMetricas itens={[
              { rotulo: 'Próxima execução', valor: prox ? prox.g.hora : '—', dica: prox ? `${prox.g.nome} · ${prox.quando.toLocaleDateString('pt-BR', { weekday: 'long' })}` : 'nenhum ativo' },
              { rotulo: 'Ativos', valor: lista.filter((g) => g.ativo).length, sufixo: ` / ${lista.length}` },
              { rotulo: 'Disparos por semana', valor: lista.filter((g) => g.ativo).reduce((s, g) => s + g.dias.length, 0) },
              { rotulo: 'Aparelhos agendados', valor: new Set(lista.map((g) => g.aparelho_id)).size },
            ]} />
            <Semana lista={lista} />
          </div>
        )
      })()}
      <div className="mb-6"><RegrasAgenda podeMudar={['dono', 'admin'].includes(sessao?.papel)} /></div>
      <div className="mb-6"><Modelos aparelhos={aparelhos} aoCriar={recarregar} /></div>
      {lista.length > 0 && (
        <div className="mb-3 space-y-2">
          <FerramentasLista busca={busca} setBusca={setBusca} placeholder="Procurar agendamento ou ar" filtro={estado} setFiltro={setEstado}
            filtros={[['todos', 'Todos', lista.length], ['ativos', 'Ativos', lista.filter((g) => g.ativo).length], ['pausados', 'Pausados', lista.filter((g) => !g.ativo).length], ['ligar', 'Ligam'], ['desligar', 'Desligam']]}
            total={lista.length} mostrando={ordenada.length} exportarCsv={exportarCsv} exportarJson={exportarJson} importar={importar} />
          {sel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
              <b>{sel.size} selecionado(s)</b>
              <Botao tamanho="sm" variante="secundario" carregando={emLote} onClick={() => lote('ativar')}>Ativar</Botao>
              <Botao tamanho="sm" variante="secundario" carregando={emLote} onClick={() => lote('pausar')}>Pausar</Botao>
              <Botao tamanho="sm" variante="perigo" carregando={emLote} onClick={() => lote('apagar')}>Apagar</Botao>
              <button className="ml-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setSel(new Set())}>Limpar seleção</button>
            </div>
          )}
        </div>
      )}
      {lista.length === 0 ? (
        <Vazio icone={CalendarClock} titulo="Nenhum agendamento"
          texto={aparelhos.length ? 'Exemplo: ligar o ar da recepção às 7h30 em 23°C e desligar às 18h.' : 'Cadastre um aparelho primeiro.'}
          acao={aparelhos.length > 0 && <Botao icone={Plus} onClick={() => setModal({})}>Novo agendamento</Botao>} />
      ) : (
        <div className="cartao divide-y divide-border">
          {new Set(lista.map((g) => g.aparelho_id)).size > 1 && (
            <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <span className="text-xs text-muted-foreground">Ar</span>
              <select className="campo h-8 w-auto text-sm" value={filtroAr} onChange={(e) => setFiltroAr(e.target.value)} aria-label="Filtrar por ar">
                <option value="">Todos</option>
                {[...new Map(lista.map((g) => [g.aparelho_id, g.aparelho_nome])).entries()].map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
              <span className="text-xs text-muted-foreground">{ordenada.length} agendamento(s), por horário</span>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={ordenada.length > 0 && ordenada.every((g) => sel.has(g.id))} onChange={(e) => setSel(e.target.checked ? new Set(ordenada.map((g) => g.id)) : new Set())} />Selecionar todos</label>
            </div>
          )}
          {ordenada.map((g) => (
            <div key={g.id} className={`flex items-center gap-4 px-4 py-3 ${g.ativo ? '' : 'opacity-60'} ${sel.has(g.id) ? 'bg-primary/5' : ''}`}>
              <input type="checkbox" aria-label={`Selecionar ${g.nome}`} checked={sel.has(g.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(g.id); else n.delete(g.id); setSel(n) }} />
              <p className="w-14 text-lg font-semibold tabular-nums">{g.hora}</p>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{g.aparelho_nome} · {descrever(g)} · {dias(g.dias)}</p>
              </div>
              <Interruptor ligado={!!g.ativo} onChange={(v) => alternar(g, v)} rotulo="Ativo" />
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setModal(g)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => duplicar(g)} aria-label="Duplicar" title="Duplicar"><Copy className="h-4 w-4" /></button>
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Apagar" onClick={() => setApagar(g)}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2"><Timers /><Historico /></div>
      <Modal aberto={!!apagar} titulo={`Apagar ${apagar?.nome || 'o agendamento'}?`} onFechar={() => setApagar(null)}>
        <p className="text-sm text-muted-foreground">{apagar?.aparelho_nome} deixa de {apagar?.acao?.ligado ? 'ligar' : 'desligar'} sozinho às {apagar?.hora}. Para só suspender, use o botão Ativo.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { const g = apagar; setApagar(null); try { await api.del(`/api/agendamentos/${g.id}`); toast('Agendamento apagado.'); recarregar() } catch (e) { toast(e.message, 'erro') } }}>Apagar</Botao>
        </div>
      </Modal>
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar agendamento' : 'Novo agendamento'} onFechar={() => setModal(null)}>
        {modal && <Form inicial={modal.id ? modal : null} aparelhos={aparelhos} aoSalvar={recarregar} onFechar={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
