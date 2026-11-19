import { useState } from 'react'
import { CalendarClock, Link2, Plug, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import Placa from './Placa'
import { Aviso, Botao, Modal, Selo, useDados, useToast } from '../ui'

// Partes comuns da cafeteira, das persianas e da fechadura (aparelhos Tuya / Smart Life).
export const HARDWARE = {
  cafeteira: 'uma tomada inteligente Wi-Fi compatível com o app Smart Life (Tuya) na cafeteira',
  persiana: 'um motor de persiana/cortina Wi-Fi compatível com o Smart Life (Tuya) em cada janela',
  fechadura: 'uma fechadura Wi-Fi compatível com o Smart Life (Tuya) na porta do escritório',
}
const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']]

export function Estado({ d }) {
  if (!d.conectado) return <Selo cor="cinza">Sem aparelho conectado</Selo>
  return d.online ? <Selo cor="verde">Online{d.visto_em ? ` · lido ${haQuanto(d.visto_em)}` : ''}</Selo> : <Selo cor="ambar">Sem resposta</Selo>
}

export function SemAparelho({ d, aoConectar }) {
  return (
    <Aviso tipo="alerta">
      <b>{d.nome}</b> ainda não tem aparelho conectado: o que aparece aqui é só o cadastro, nenhum comando sai. Para controlar de verdade, use {HARDWARE[d.tipo]} (pareie no app Smart Life, a mesma conta já conectada ao sistema) ou uma <b>placa própria</b> (Arduino UNO R4 WiFi, GIGA R1 WiFi, Opta, Nano 33 IoT, MKR WiFi 1010, Nano ESP32, ESP32 ou ESP8266) com relé. Depois,{' '}
      <button onClick={aoConectar} className="font-medium underline">conecte aqui</button>.
    </Aviso>
  )
}

// escolhe na conta Smart Life o aparelho de verdade para este item
export function ConectarAparelho({ d, aberto, aoFechar, aoConectar }) {
  const toast = useToast()
  const { dados, erro, recarregar } = useDados(() => (aberto ? api.get('/api/dispositivos/disponiveis') : Promise.resolve(null)), [aberto])
  const [ocupado, setOcupado] = useState('')
  const [aba, setAba] = useState(d.driver === 'placa' ? 'placa' : 'tuya')
  const lista = (dados?.aparelhos || []).filter((a) => (a.tipos || [a.tipo]).includes(d.tipo))
  const conectar = async (tid) => {
    setOcupado(tid)
    try { aoConectar(await api.post(`/api/dispositivos/${d.id}/conectar`, { tuya_id: tid })); toast('Aparelho conectado.'); aoFechar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  return (
    <Modal aberto={aberto} titulo={`Conectar aparelho · ${d.nome}`} onFechar={aoFechar} largura="max-w-3xl">
      <div className="mb-4 flex gap-1 rounded-lg border border-border p-0.5" role="tablist">
        {[['tuya', 'Aparelho Smart Life (Tuya)'], ['placa', 'Placa própria (Arduino / ESP)']].map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${aba === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>))}
      </div>
      {aba === 'placa' ? <Placa d={d} aoMudar={aoConectar} /> : (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Aparelhos da conta Smart Life conectada que servem para {d.tipo === 'cafeteira' ? 'a cafeteira (tomadas)' : d.tipo === 'persiana' ? 'persianas (motores de cortina)' : 'a porta (fechaduras)'}.</p>
        {erro && <Aviso>{erro}</Aviso>}
        {!dados && !erro && <p className="text-sm text-muted-foreground">Procurando na conta Smart Life…</p>}
        {dados && !lista.length && <Aviso tipo="alerta">Nenhum aparelho desse tipo na conta. Pareie no app Smart Life (Wi-Fi 2,4 GHz) e toque em Procurar de novo.</Aviso>}
        <ul className="space-y-2">{lista.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
            <Plug className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{a.nome}</p><p className="truncate text-xs text-muted-foreground">{a.produto || a.categoria} · {a.online ? 'online' : 'offline'}</p></div>
            {a.ja_cadastrado ? <Selo>Já em uso</Selo> : <Botao tamanho="sm" icone={Link2} carregando={ocupado === a.id} onClick={() => conectar(a.id)}>Conectar</Botao>}
          </li>))}
        </ul>
        <Botao variante="secundario" icone={RefreshCw} onClick={recarregar}>Procurar de novo</Botao>
      </div>)}
    </Modal>
  )
}

export function Historico({ d, versao }) {
  const { dados } = useDados(() => api.get(`/api/dispositivos/${d.id}/eventos?limite=40`), [d.id, versao])
  if (!dados) return null
  return (
    <section className="cartao p-5">
      <h2 className="text-sm font-semibold">Histórico</h2>
      {!dados.eventos.length ? <p className="mt-2 text-sm text-muted-foreground">Nada ainda.</p> : (
        <ul className="mt-3 divide-y divide-border text-sm">{dados.eventos.map((e, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 py-2">
            <span className={`h-2 w-2 rounded-full ${e.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="font-medium">{e.acao}</span>
            <span className="text-xs text-muted-foreground">{e.origem.replace('painel:', 'painel · ')} · {haQuanto(e.quando)}</span>
            {e.detalhe && <span className="w-full pl-4 text-xs text-muted-foreground">{e.detalhe}</span>}
          </li>))}
        </ul>
      )}
    </section>
  )
}

// agendas por dia e horário (a ação sai no laço do agente, que roda a cada 20 s)
export function Agendas({ d, acoes, aoSalvar, podeEditar }) {
  const toast = useToast()
  const [lista, setLista] = useState(d.config.agendas || [])
  const [salvando, setSalvando] = useState(false)
  const mudar = (i, k, v) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const salvar = async () => {
    setSalvando(true)
    try { aoSalvar(await api.put(`/api/dispositivos/${d.id}/config`, { agendas: lista })); toast('Agendas salvas.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <section className="cartao p-5">
      <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Agenda</h2></div>
      <p className="mt-1 text-xs text-muted-foreground">Rodam no computador do escritório (agente), no horário de Brasília.</p>
      <ul className="mt-3 space-y-2">{lista.map((a, i) => (
        <li key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
          <input type="time" value={a.hora} onChange={(e) => mudar(i, 'hora', e.target.value)} className="campo h-8 w-28" aria-label="Horário" disabled={!podeEditar} />
          <select value={a.acao} onChange={(e) => mudar(i, 'acao', e.target.value)} className="campo h-8 w-36" aria-label="Ação" disabled={!podeEditar}>{acoes.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
          {a.acao === 'brilho' && <input type="number" min="1" max="100" value={a.valor ?? 60} onChange={(e) => mudar(i, 'valor', +e.target.value)} className="campo h-8 w-20" aria-label="Brilho em %" disabled={!podeEditar} />}
          {a.acao === 'posicao' && <input type="number" min="0" max="100" value={a.valor ?? 50} onChange={(e) => mudar(i, 'valor', +e.target.value)} className="campo h-8 w-20" aria-label="Posição em %" disabled={!podeEditar} />}
          <div className="flex flex-wrap gap-1">{DIAS.map(([n, r]) => (
            <button key={n} type="button" disabled={!podeEditar} aria-pressed={(a.dias || []).includes(n)} onClick={() => mudar(i, 'dias', (a.dias || []).includes(n) ? a.dias.filter((x) => x !== n) : [...(a.dias || []), n].sort())}
              className={`h-7 rounded border px-1.5 text-[11px] ${(a.dias || []).includes(n) ? 'border-primary bg-primary/10' : 'border-border'}`}>{r}</button>))}
          </div>
          {podeEditar && <button onClick={() => setLista((l) => l.filter((_, j) => j !== i))} className="ml-auto rounded p-1 text-muted-foreground hover:text-red-600" aria-label="Apagar agenda"><Trash2 className="h-4 w-4" /></button>}
        </li>))}
      </ul>
      {podeEditar && (
        <div className="mt-3 flex gap-2">
          <Botao tamanho="sm" variante="secundario" icone={Plus} onClick={() => setLista((l) => [...l, { hora: '08:00', acao: acoes[0][0], dias: [1, 2, 3, 4, 5] }])}>Adicionar horário</Botao>
          <Botao tamanho="sm" carregando={salvando} onClick={salvar}>Salvar agenda</Botao>
        </div>
      )}
    </section>
  )
}

export function useDispositivos(tipo) {
  return useDados(() => api.get(`/api/dispositivos?tipo=${tipo}`).then((r) => r.dispositivos), [tipo])
}
