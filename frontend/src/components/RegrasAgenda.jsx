import { useEffect, useState } from 'react'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { api } from '../api'
import { Aviso, Botao, Interruptor, useToast } from './ui'

// Feriados e férias: a agenda não liga os ares em feriado (se a opção estiver ligada) nem durante uma pausa. O agente
// confere antes de cada disparo e registra na Atividade por que não ligou. Só dono e admin mudam (vale para todos).
const fmt = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })

export default function RegrasAgenda({ podeMudar }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [f, setF] = useState(null)
  const [nova, setNova] = useState({ data: '', nome: '' })
  const [salvando, setSalvando] = useState(false)
  const carregar = () => api.get('/api/agendamentos/regras').then((r) => { setD(r); setF(r.regras) }).catch(() => {})
  useEffect(() => { carregar() }, [])
  if (!d || !f) return null
  const salvar = async (mudanca = {}) => {
    const corpo = { ...f, ...mudanca }
    setSalvando(true)
    try { const r = await api.put('/api/agendamentos/regras', corpo); setD(r); setF(r.regras); toast('Regras da agenda salvas.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const hoje = new Date().toISOString().slice(0, 10)
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-secao flex items-center gap-2"><CalendarOff className="h-4 w-4" />Feriados e férias</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Em feriado ou durante uma pausa, os agendamentos não ligam nem desligam os ares (a Atividade mostra que foi pulado e por quê). Automações e cenas continuam normais.</p>
        </div>
        <Interruptor ligado={!!f.pular_feriados} disabled={!podeMudar || salvando} onChange={(v) => salvar({ pular_feriados: v })} rotulo="Não rodar em feriados" />
      </div>
      {d.hoje && <div className="mt-3"><Aviso tipo="alerta">Hoje a agenda não roda: {d.hoje}.</Aviso></div>}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="text-sm font-medium">Pausar tudo até (férias, recesso, reforma)</p>
          <div className="flex flex-wrap gap-2">
            <input type="date" className="campo w-auto" min={hoje} value={f.pausa_ate || ''} disabled={!podeMudar} onChange={(e) => setF({ ...f, pausa_ate: e.target.value || null })} aria-label="Pausar até" />
            <input className="campo min-w-0 flex-1" maxLength={80} placeholder="Motivo (opcional)" value={f.pausa_motivo || ''} disabled={!podeMudar} onChange={(e) => setF({ ...f, pausa_motivo: e.target.value })} />
          </div>
          {podeMudar && <div className="flex gap-2">
            <Botao tamanho="sm" carregando={salvando} onClick={() => salvar()}>Salvar pausa</Botao>
            {f.pausa_ate && <Botao tamanho="sm" variante="secundario" onClick={() => salvar({ pausa_ate: null, pausa_motivo: '' })}>Tirar pausa</Botao>}
          </div>}
          <p className="text-sm font-medium">Outras datas sem expediente</p>
          {podeMudar && <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!nova.data) return; salvar({ datas_extras: [...(f.datas_extras || []), nova] }); setNova({ data: '', nome: '' }) }}>
            <input type="date" className="campo w-auto" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} aria-label="Data" />
            <input className="campo min-w-0 flex-1" maxLength={60} placeholder="Ex.: ponto facultativo" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            <Botao tamanho="sm" variante="secundario" icone={Plus} type="submit" disabled={!nova.data}>Adicionar</Botao>
          </form>}
          {(f.datas_extras || []).length > 0 && <ul className="space-y-1 text-sm">{f.datas_extras.map((x) => (
            <li key={x.data} className="flex items-center gap-2"><span className="tabular-nums">{fmt(x.data)}</span><span className="flex-1 text-muted-foreground">{x.nome}</span>
              {podeMudar && <button onClick={() => salvar({ datas_extras: f.datas_extras.filter((y) => y.data !== x.data) })} className="rounded p-1 text-muted-foreground hover:text-red-600" aria-label={`Tirar ${x.data}`}><Trash2 className="h-3.5 w-3.5" /></button>}</li>))}</ul>}
          {!podeMudar && <p className="text-xs text-muted-foreground">Só o dono ou um administrador mudam (vale para a agenda de todos).</p>}
        </div>
        <div>
          <p className="text-sm font-medium">Próximos feriados</p>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto pr-1 text-sm rolagem-fina">{d.proximos.map((x) => (
            <li key={`${x.data}-${x.nome}`} className="flex items-center gap-2"><span className="w-36 shrink-0 tabular-nums">{fmt(x.data)}</span><span className="min-w-0 flex-1 truncate">{x.nome}</span><span className="text-xs text-muted-foreground">{x.tipo}</span></li>))}</ul>
          <p className="mt-2 text-xs text-muted-foreground">Nacionais, Carnaval, Corpus Christi (pontos facultativos) e o aniversário de Florianópolis (23/03). Outros: adicione ao lado.</p>
        </div>
      </div>
    </section>
  )
}
