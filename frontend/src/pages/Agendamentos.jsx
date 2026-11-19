import { useMemo, useState } from 'react'
import { CalendarClock, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import { DIAS, MODOS, VENTILACAO, api } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'
import { motion } from 'framer-motion'

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
  const ordenada = useMemo(() => (dados ? [...dados[0]].filter((g) => !filtroAr || String(g.aparelho_id) === filtroAr).sort((a, b) => a.hora.localeCompare(b.hora) || a.nome.localeCompare(b.nome)) : []), [dados, filtroAr])
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
            </div>
          )}
          {ordenada.map((g) => (
            <div key={g.id} className={`flex items-center gap-4 px-4 py-3 ${g.ativo ? '' : 'opacity-50'}`}>
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
