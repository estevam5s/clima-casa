import { useState } from 'react'
import { CalendarClock, Pencil, Plus, Trash2 } from 'lucide-react'
import { DIAS, MODOS, VENTILACAO, api } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'

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

export default function Agendamentos() {
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get('/api/agendamentos'), api.get('/api/aparelhos')]))
  const [modal, setModal] = useState(null)
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [lista, aparelhos] = dados

  const alternar = async (g, ativo) => {
    await api.put(`/api/agendamentos/${g.id}`, { ...g.acao, aparelho_id: g.aparelho_id, nome: g.nome, dias: g.dias, hora: g.hora, ativo })
    recarregar()
  }
  const descrever = (g) => (g.acao.ligado
    ? `Ligar${g.acao.modo ? ` em ${MODOS[g.acao.modo].toLowerCase()}` : ''}${g.acao.temperatura ? ` ${g.acao.temperatura}°C` : ''}`
    : 'Desligar')
  const dias = (d) => (d.length === 7 ? 'Todos os dias' : d.join() === '1,2,3,4,5' ? 'Dias úteis' : d.join() === '0,6' ? 'Fim de semana' : d.map((i) => DIAS[i]).join(', '))

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Cabecalho titulo="Agenda" descricao="Liga e desliga os aparelhos sozinho nos horários definidos. Precisa do Clima Casa rodando."
        acoes={<Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Novo agendamento</Botao>} />
      {lista.length === 0 ? (
        <Vazio icone={CalendarClock} titulo="Nenhum agendamento"
          texto={aparelhos.length ? 'Exemplo: ligar o ar do quarto às 22h em 23°C e desligar às 6h.' : 'Cadastre um aparelho primeiro.'}
          acao={aparelhos.length > 0 && <Botao icone={Plus} onClick={() => setModal({})}>Novo agendamento</Botao>} />
      ) : (
        <div className="cartao divide-y divide-border">
          {lista.map((g) => (
            <div key={g.id} className={`flex items-center gap-4 px-4 py-3 ${g.ativo ? '' : 'opacity-50'}`}>
              <p className="w-14 text-lg font-semibold tabular-nums">{g.hora}</p>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{g.aparelho_nome} · {descrever(g)} · {dias(g.dias)}</p>
              </div>
              <Interruptor ligado={!!g.ativo} onChange={(v) => alternar(g, v)} rotulo="Ativo" />
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setModal(g)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
              <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 " aria-label="Apagar"
                onClick={async () => { await api.del(`/api/agendamentos/${g.id}`); toast('Agendamento apagado.'); recarregar() }}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar agendamento' : 'Novo agendamento'} onFechar={() => setModal(null)}>
        {modal && <Form inicial={modal.id ? modal : null} aparelhos={aparelhos} aoSalvar={recarregar} onFechar={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
