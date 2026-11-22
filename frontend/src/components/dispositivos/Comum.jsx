import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Cpu, Link2, Plug, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { useProjeto } from '../../contexto'
import Placa from './Placa'
import { Aviso, Botao, Modal, Selo, useDados, useToast } from '../ui'

// Partes comuns da cafeteira, das persianas e da fechadura (aparelhos Tuya / Smart Life).
export const HARDWARE = {
  cafeteira: 'uma tomada inteligente Wi-Fi compatível com o app Smart Life (Tuya) na cafeteira',
  persiana: 'um motor de persiana/cortina Wi-Fi compatível com o Smart Life (Tuya) em cada janela',
  fechadura: 'uma fechadura Wi-Fi compatível com o Smart Life (Tuya) na porta do escritório',
  luz: 'uma lâmpada, painel, fita de LED ou interruptor de parede Wi-Fi compatível com o Smart Life (Tuya)',
}
const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']]

export function Estado({ d }) {
  if (!d.conectado) return <Selo cor="cinza">Sem aparelho conectado</Selo>
  return d.online ? <Selo cor="verde">Online{d.visto_em ? ` · lido ${haQuanto(d.visto_em)}` : ''}</Selo> : <Selo cor="ambar">Sem resposta</Selo>
}

export function SemAparelho({ d, aoConectar, compacto = false }) {
  if (compacto) return (   // vários cartões lado a lado (Luzes): uma linha só, a explicação inteira fica no topo da tela
    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      Sem aparelho: nenhum comando sai. <button onClick={() => aoConectar()} className="font-medium text-primary hover:underline">Conectar</button> · <button onClick={() => aoConectar('placa')} className="font-medium text-primary hover:underline">Código da placa</button>
    </p>
  )
  return (
    <Aviso tipo="alerta">
      <b>{d.nome}</b> ainda não tem aparelho conectado: o que aparece aqui é só o cadastro, nenhum comando sai. Para controlar de verdade, use {HARDWARE[d.tipo]} (pareie no app Smart Life, a mesma conta já conectada ao sistema) ou uma <b>placa própria</b> (Arduino UNO R4 WiFi, GIGA R1 WiFi, Opta, Nano 33 IoT, MKR WiFi 1010, Nano ESP32, ESP32 ou ESP8266) com relé.
      <span className="mt-2.5 flex flex-wrap gap-2">
        <button onClick={() => aoConectar()} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-current/30 px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"><Plug className="h-3.5 w-3.5" />Conectar aparelho Smart Life</button>
        <button onClick={() => aoConectar('placa')} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-current/30 px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"><Cpu className="h-3.5 w-3.5" />Código da placa própria (Arduino / ESP)</button>
      </span>
    </Aviso>
  )
}

// escolhe na conta Smart Life o aparelho de verdade para este item
export function ConectarAparelho({ d, aberto, aoFechar, aoConectar, abaInicial }) {
  const toast = useToast()
  const { dados, erro, recarregar } = useDados(() => (aberto ? api.get('/api/dispositivos/disponiveis') : Promise.resolve(null)), [aberto])
  const [ocupado, setOcupado] = useState('')
  const [aba, setAba] = useState(abaInicial || (d.driver === 'placa' ? 'placa' : 'tuya'))
  useEffect(() => { if (aberto && abaInicial) setAba(abaInicial) }, [aberto, abaInicial])
  const lista = (dados?.aparelhos || []).filter((a) => (a.tipos || [a.tipo]).includes(d.tipo))
  const [teclas, setTeclas] = useState(null)   // interruptor de várias teclas: qual tecla esta luz usa
  const conectar = async (tid, tecla) => {
    setOcupado(tecla || tid)
    try { aoConectar(await api.post(`/api/dispositivos/${d.id}/conectar`, { tuya_id: tid, tecla })); toast('Aparelho conectado.'); setTeclas(null); aoFechar() } catch (e) {
      if (d.tipo === 'luz' && !tecla && /teclas/.test(e.message)) { try { setTeclas(await api.get(`/api/dispositivos/teclas/${tid}`)) } catch (e2) { toast(e2.message, 'erro') } } else toast(e.message, 'erro')
    } finally { setOcupado('') }
  }
  return (
    <Modal aberto={aberto} titulo={`Conectar aparelho · ${d.nome}`} onFechar={aoFechar} largura="max-w-3xl">
      <div className="mb-4 flex gap-1 rounded-lg border border-border p-0.5" role="tablist">
        {[['tuya', 'Aparelho Smart Life (Tuya)'], ['placa', 'Placa própria (Arduino / ESP)']].map(([k, r]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`flex-1 rounded-md px-3 py-1.5 text-sm ${aba === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>))}
      </div>
      {aba === 'placa' ? <Placa d={d} aoMudar={aoConectar} /> : (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Aparelhos da conta Smart Life conectada que servem para {d.tipo === 'cafeteira' ? 'a cafeteira (tomadas)' : d.tipo === 'persiana' ? 'persianas (motores de cortina)' : d.tipo === 'luz' ? 'luzes (lâmpadas, painéis, fitas e interruptores de parede)' : 'a porta (fechaduras)'}.</p>
        {teclas && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <p className="font-medium">{teclas.nome}: interruptor de {teclas.teclas.length} teclas. Qual tecla acende esta luz?</p>
            <div className="mt-2 flex flex-wrap gap-2">{teclas.teclas.map((t) => { const uso = teclas.usadas.find((u) => u.tecla === t && u.id !== d.id); return (
              <Botao key={t} tamanho="sm" variante={uso ? 'secundario' : 'primario'} disabled={!!uso} carregando={ocupado === t} onClick={() => conectar(teclas.id, t)}>Tecla {t.split('_')[1]}{uso ? ` (${uso.nome})` : ''}</Botao>) })}</div>
          </div>
        )}
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
  const { dados } = useDados(() => api.get(`/api/dispositivos/${d.id}/eventos?limite=60`), [d.id, versao])
  const [filtro, setFiltro] = useState('todos')
  const lista = useMemo(() => (dados?.eventos || []).filter((e) => filtro === 'todos' || (filtro === 'falhas' ? !e.ok : !/^painel/.test(e.origem))), [dados, filtro])
  if (!dados) return null
  const dia = Date.now() / 1000 - 86400
  const hoje = dados.eventos.filter((e) => e.quando > dia), falhas = hoje.filter((e) => !e.ok).length
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Histórico</h2>
          <p className="text-xs text-muted-foreground"><span className="tabular">{hoje.length}</span> nas últimas 24 h{falhas ? <> · <span className="tabular text-red-600 dark:text-red-400">{falhas}</span> com falha</> : ''}</p>
        </div>
        <div className="flex gap-0.5 rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Filtrar histórico">
          {[['todos', 'Tudo'], ['falhas', 'Falhas'], ['auto', 'Automático']].map(([k, r]) => (
            <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k} className={`rounded-md px-2 py-1 ${filtro === k ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>))}
        </div>
      </div>
      {!lista.length ? <p className="mt-3 text-sm text-muted-foreground">{dados.eventos.length ? 'Nada com esse filtro.' : 'Nada ainda.'}</p> : (
        <ul className="mt-3 max-h-96 divide-y divide-border overflow-y-auto overscroll-contain text-sm rolagem-fina">{lista.map((e, i) => (
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

// Travas de segurança do aparelho (backend/app/fisico.py): valem para painel, app, Alexa, Telegram, IA e agenda.
// O estado seguro (desligar, fechar, parar, trancar) nunca é barrado. Dono/admin isola um aparelho suspeito.
const LIMITE = { luz: 10, cafeteira: 4, persiana: 12, fechadura: 5 }
const SEGURO = { luz: 'apagar', cafeteira: 'desligar', persiana: 'fechar ou parar', fechadura: 'trancar' }
export function Travas({ d, aoMudar }) {
  const toast = useToast()
  const { sessao } = useProjeto()
  const podeIsolar = ['dono', 'admin'].includes(sessao?.papel)
  const [motivo, setMotivo] = useState('')
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const iso = d.isolado
  const mudar = async (isolar) => {
    setOcupado(true)
    try {
      await api.post('/api/seguranca/isolar', { tipo: 'dispositivos', id: d.id, isolar, motivo })
      aoMudar?.(await api.get(`/api/dispositivos/um/${d.id}`)); toast(isolar ? `${d.nome} isolado.` : `${d.nome} liberado.`); setAberto(false); setMotivo('')
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <section className={`cartao p-5 ${iso ? 'border-red-500/50' : ''}`}>
      <div className="flex items-start gap-2">
        {iso ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{iso ? 'Isolado por segurança' : 'Travas de segurança'}</h2>
          {iso ? <p className="mt-1 text-xs text-muted-foreground">Motivo: {iso.motivo}. Só {SEGURO[d.tipo]} é aceito até liberar. {iso.por ? `Isolado por ${iso.por}.` : ''}</p>
            : <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                <li>No máximo {LIMITE[d.tipo] || 10} comandos por minuto, de qualquer origem (painel, Alexa, Telegram, IA, agenda): segura rajadas e automações em laço.</li>
                <li>{SEGURO[d.tipo][0].toUpperCase() + SEGURO[d.tipo].slice(1)} nunca é barrado: o estado seguro sempre passa.</li>
                {d.driver === 'placa' && <li>Pedido que a placa não buscou a tempo expira ({d.tipo === 'fechadura' ? 'destrancar: 30 s' : '2 min'}) e não é executado depois.</li>}
                {d.tipo === 'cafeteira' && <li>Desliga sozinha depois do tempo escolhido (sem tempo escolhido: 90 min). A proteção elétrica da própria cafeteira continua valendo.</li>}
              </ul>}
        </div>
      </div>
      {podeIsolar && (iso
        ? <Botao tamanho="sm" variante="secundario" className="mt-3" carregando={ocupado} onClick={() => mudar(false)}>Liberar o aparelho</Botao>
        : aberto
          ? <div className="mt-3 flex flex-wrap gap-2"><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Motivo (fica na auditoria)" className="campo h-8 min-w-0 flex-1" aria-label="Motivo do isolamento" />
              <Botao tamanho="sm" variante="perigo" carregando={ocupado} disabled={motivo.trim().length < 3} onClick={() => mudar(true)}>Isolar</Botao>
              <Botao tamanho="sm" variante="secundario" onClick={() => setAberto(false)}>Cancelar</Botao></div>
          : <button onClick={() => setAberto(true)} className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Isolar este aparelho (suspeita de uso indevido)</button>)}
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
