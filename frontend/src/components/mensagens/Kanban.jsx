import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, MessageSquare, Plus, Search, Settings2, Trash2, UserRound } from 'lucide-react'
import { api } from '../../api'
import { Botao, Modal, useToast } from '../ui'

// Kanban das pessoas que escreveram pelo site: cada contato é um cartão numa etapa (colunas configuráveis). Arrastar
// muda a etapa (e grava uma nota "Etapa: A → B" na conversa); o cartão mostra responsável, prioridade, prazo,
// próximo passo, etiquetas e mensagens não lidas. Clicar abre a conversa.
const PRIORIDADES = [['baixa', 'Baixa', 'bg-slate-500/15 text-slate-600 dark:text-slate-300'], ['normal', 'Normal', 'bg-sky-500/15 text-sky-700 dark:text-sky-300'],
  ['alta', 'Alta', 'bg-amber-500/15 text-amber-700 dark:text-amber-300'], ['urgente', 'Urgente', 'bg-red-500/15 text-red-700 dark:text-red-300']]
const PESO = { urgente: 0, alta: 1, normal: 2, baixa: 3 }
const inicial = (c) => (c.nome || c.email || '?').trim().slice(0, 1).toUpperCase()
const quando = (ts) => { const d = new Date(ts * 1000); return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
const diaISO = (ts) => (ts ? new Date(ts * 1000 - 3 * 3600e3).toISOString().slice(0, 10) : '')

function Cartao({ c, etapas, equipe, aoAbrir, aoMover, aoEditar, arrastando }) {
  const resp = equipe.find((u) => u.id === c.responsavel)
  const pri = PRIORIDADES.find(([k]) => k === c.prioridade) || PRIORIDADES[1]
  const vencido = c.prazo && c.prazo * 1000 < Date.now()
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.email); e.dataTransfer.effectAllowed = 'move'; arrastando(c.email) }} onDragEnd={() => arrastando(null)}
      className="group cursor-grab rounded-lg border border-border bg-card p-3 text-sm active:cursor-grabbing hover:border-primary/50">
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{inicial(c)}</span>
        <button onClick={() => aoAbrir(c.email)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-1.5"><b className="truncate font-medium">{c.nome || c.email.split('@')[0]}</b>{c.nao_lidas > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.nao_lidas}</span>}</span>
          <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">{quando(c.ultimo.quando)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{c.ultimo.de === 'contato' ? '' : c.ultimo.de === 'nota' ? 'Nota: ' : 'Você: '}{c.ultimo.texto}</p>
      {c.proximo_passo && <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs"><b className="font-medium">Próximo passo:</b> {c.proximo_passo}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 font-medium ${pri[2]}`}>{pri[1]}</span>
        {c.prazo && <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${vencido ? 'bg-red-500/15 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground'}`}>{vencido ? <AlertTriangle className="h-3 w-3" /> : <CalendarClock className="h-3 w-3" />}{new Date(c.prazo * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>}
        {(c.etiquetas || []).slice(0, 3).map((e) => <span key={e} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{e}</span>)}
        <span className="ml-auto flex items-center gap-1 text-muted-foreground" title={resp ? `Responsável: ${resp.nome}` : 'Sem responsável'}>
          {resp ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground/10 text-[10px] font-semibold text-foreground">{resp.nome.slice(0, 1).toUpperCase()}</span> : <UserRound className="h-3.5 w-3.5" />}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1 border-t border-border pt-2 opacity-70 group-hover:opacity-100 group-focus-within:opacity-100">
        <select value={c.etapa} onChange={(e) => aoMover(c, e.target.value)} className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 text-xs" aria-label={`Mover ${c.nome || c.email} para`}>
          {etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
        <button onClick={() => aoEditar(c)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Editar cartão" title="Responsável, prioridade, prazo"><Settings2 className="h-3.5 w-3.5" /></button>
        <button onClick={() => aoAbrir(c.email)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Abrir conversa" title="Abrir conversa"><MessageSquare className="h-3.5 w-3.5" /></button>
      </div>
    </article>
  )
}

function EditarCartao({ c, equipe, etiquetas, aoFechar, aoSalvar }) {
  const [f, setF] = useState({ responsavel: c.responsavel || '', prioridade: c.prioridade || 'normal', prazo: diaISO(c.prazo), proximo_passo: c.proximo_passo || '', etiquetas: (c.etiquetas || []).join(', ') })
  return (
    <Modal aberto titulo={c.nome || c.email} onFechar={aoFechar}>
      <form className="space-y-3 text-sm" onSubmit={(e) => { e.preventDefault(); aoSalvar({ responsavel: f.responsavel, prioridade: f.prioridade, prazo: f.prazo ? Math.floor(new Date(`${f.prazo}T18:00:00-03:00`).getTime() / 1000) : 0, proximo_passo: f.proximo_passo.trim(), etiquetas: f.etiquetas.split(',').map((x) => x.trim()).filter(Boolean) }) }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="rotulo">Responsável</span><select className="campo mt-1" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })}><option value="">Ninguém</option>{equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></label>
          <label className="block"><span className="rotulo">Prioridade</span><select className="campo mt-1" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>{PRIORIDADES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
          <label className="block"><span className="rotulo">Prazo</span><input type="date" className="campo mt-1" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></label>
          <label className="block"><span className="rotulo">Etiquetas (vírgula)</span><input className="campo mt-1" list="kanban-etiquetas" value={f.etiquetas} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} /><datalist id="kanban-etiquetas">{etiquetas.map((e) => <option key={e} value={e} />)}</datalist></label>
        </div>
        <label className="block"><span className="rotulo">Próximo passo</span><input className="campo mt-1" maxLength={200} value={f.proximo_passo} onChange={(e) => setF({ ...f, proximo_passo: e.target.value })} placeholder="Ex.: ligar na segunda para confirmar a visita" /></label>
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
      </form>
    </Modal>
  )
}

function EditarColunas({ etapas, aoFechar, aoSalvar }) {
  const [l, setL] = useState(etapas.map((e) => ({ ...e })))
  const mover = (i, d) => { const x = [...l]; const [a] = x.splice(i, 1); x.splice(i + d, 0, a); setL(x) }
  return (
    <Modal aberto titulo="Colunas do Kanban" onFechar={aoFechar}>
      <div className="space-y-2 text-sm">
        {l.map((e, i) => (
          <div key={e.id} className="flex items-center gap-2">
            <input type="color" value={e.cor} onChange={(ev) => setL(l.map((x, j) => j === i ? { ...x, cor: ev.target.value } : x))} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent" aria-label={`Cor de ${e.nome}`} />
            <input className="campo h-8 min-w-0 flex-1" maxLength={40} value={e.nome} onChange={(ev) => setL(l.map((x, j) => j === i ? { ...x, nome: ev.target.value } : x))} aria-label="Nome da coluna" />
            <button disabled={!i} onClick={() => mover(i, -1)} className="rounded p-1.5 hover:bg-muted disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
            <button disabled={i === l.length - 1} onClick={() => mover(i, 1)} className="rounded p-1.5 hover:bg-muted disabled:opacity-30" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
            <button disabled={l.length < 2} onClick={() => setL(l.filter((_, j) => j !== i))} className="rounded p-1.5 text-red-600 hover:bg-muted disabled:opacity-30" aria-label={`Apagar ${e.nome}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button disabled={l.length >= 12} onClick={() => setL([...l, { id: `col-${Date.now().toString(36)}`, nome: 'Nova coluna', cor: '#64748b' }])} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-40"><Plus className="h-4 w-4" />Adicionar coluna</button>
        <p className="text-xs text-muted-foreground">Quem estiver numa coluna apagada vai para a primeira.</p>
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao onClick={() => aoSalvar(l.map((x) => ({ ...x, nome: x.nome.trim() || 'Sem nome' })))}>Salvar colunas</Botao></div>
      </div>
    </Modal>
  )
}

export default function Kanban({ aoAbrir, versao }) {
  const toast = useToast()
  const [itens, setItens] = useState(null), [cfg, setCfg] = useState(null)
  const [busca, setBusca] = useState(''), [resp, setResp] = useState(''), [pri, setPri] = useState(''), [etq, setEtq] = useState('')
  const [editando, setEditando] = useState(null), [colunas, setColunas] = useState(false)
  const [sobre, setSobre] = useState(null), [arrastado, setArrastado] = useState(null)
  const carregar = useCallback(() => Promise.all([api.get('/api/site/conversas?filtro=tudo'), api.get('/api/site/kanban')]).then(([l, k]) => { setItens(l.itens); setCfg({ ...k, etiquetas: l.etiquetas }) }).catch((e) => toast(e.message, 'erro')), [toast])
  useEffect(() => { carregar() }, [carregar, versao])
  const salvar = async (c, mudanca, aviso) => {
    setItens((l) => l.map((x) => (x.email === c.email ? { ...x, ...mudanca, prazo: mudanca.prazo === 0 ? null : mudanca.prazo ?? x.prazo } : x)))
    try { await api.put(`/api/site/conversa?email=${encodeURIComponent(c.email)}`, mudanca); if (aviso) toast(aviso) } catch (e) { toast(e.message, 'erro'); carregar() }
  }
  const visiveis = useMemo(() => (itens || []).filter((c) => (!busca || `${c.nome} ${c.email} ${c.ultimo.texto}`.toLowerCase().includes(busca.toLowerCase()))
    && (!resp || (resp === '-' ? !c.responsavel : c.responsavel === resp)) && (!pri || c.prioridade === pri) && (!etq || (c.etiquetas || []).includes(etq))), [itens, busca, resp, pri, etq])
  if (!itens || !cfg) return <div className="grid flex-1 place-items-center text-sm text-muted-foreground">Carregando o Kanban…</div>
  const etapas = cfg.etapas
  const idsEtapa = new Set(etapas.map((e) => e.id))
  const daEtapa = (id, i) => visiveis.filter((c) => (idsEtapa.has(c.etapa) ? c.etapa : etapas[0].id) === id)
    .sort((a, b) => (PESO[a.prioridade] ?? 2) - (PESO[b.prioridade] ?? 2) || b.ultimo.quando - a.ultimo.quando)
  const soltar = (etapa) => { const c = itens.find((x) => x.email === arrastado); setSobre(null); if (c && c.etapa !== etapa) salvar(c, { etapa }, `${c.nome || c.email} → ${etapas.find((e) => e.id === etapa)?.nome}`) }
  const vencidos = visiveis.filter((c) => c.prazo && c.prazo * 1000 < Date.now()).length
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <h1 className="mr-2 text-[22px] font-semibold tracking-tight">Kanban</h1>
        <span className="text-xs text-muted-foreground">{visiveis.length} pessoa(s){vencidos ? ` · ${vencidos} com prazo vencido` : ''}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar pessoa" type="search" autoComplete="off" className="h-8 w-44 rounded-lg bg-muted pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary/40" aria-label="Procurar pessoa" /></label>
          <select value={resp} onChange={(e) => setResp(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-sm" aria-label="Filtrar por responsável"><option value="">Todos os responsáveis</option><option value="-">Sem responsável</option>{cfg.equipe.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select>
          <select value={pri} onChange={(e) => setPri(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-sm" aria-label="Filtrar por prioridade"><option value="">Toda prioridade</option>{PRIORIDADES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          {cfg.etiquetas?.length > 0 && <select value={etq} onChange={(e) => setEtq(e.target.value)} className="h-8 rounded-lg border border-border bg-card px-2 text-sm" aria-label="Filtrar por etiqueta"><option value="">Toda etiqueta</option>{cfg.etiquetas.map((e) => <option key={e} value={e}>{e}</option>)}</select>}
          <Botao tamanho="sm" variante="secundario" icone={Settings2} onClick={() => setColunas(true)}>Colunas</Botao>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {etapas.map((e, i) => {
          const l = daEtapa(e.id, i)
          return (
            <section key={e.id} onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id) }} onDragLeave={() => setSobre((s) => (s === e.id ? null : s))} onDrop={(ev) => { ev.preventDefault(); soltar(e.id) }}
              className={`flex w-[290px] shrink-0 flex-col rounded-xl border bg-muted/40 ${sobre === e.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} aria-label={`Coluna ${e.nome}`}>
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.cor }} />
                <h2 className="truncate text-sm font-semibold">{e.nome}</h2>
                <span className="ml-auto rounded-full bg-card px-2 text-xs tabular text-muted-foreground">{l.length}</span>
              </header>
              <div className="min-h-[6rem] flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {l.map((c) => <Cartao key={c.email} c={c} etapas={etapas} equipe={cfg.equipe} aoAbrir={aoAbrir} arrastando={setArrastado}
                  aoMover={(cc, et) => salvar(cc, { etapa: et }, `${cc.nome || cc.email} → ${etapas.find((x) => x.id === et)?.nome}`)} aoEditar={setEditando} />)}
                {!l.length && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Arraste uma pessoa para cá</p>}
              </div>
            </section>
          )
        })}
      </div>
      {editando && <EditarCartao c={editando} equipe={cfg.equipe} etiquetas={cfg.etiquetas || []} aoFechar={() => setEditando(null)} aoSalvar={async (m) => { await salvar(editando, m, 'Cartão salvo.'); setEditando(null) }} />}
      {colunas && <EditarColunas etapas={etapas} aoFechar={() => setColunas(false)} aoSalvar={async (l) => { try { const k = await api.put('/api/site/kanban', l); setCfg((c) => ({ ...c, ...k })); setColunas(false); toast('Colunas salvas.'); carregar() } catch (err) { toast(err.message, 'erro') } }} />}
    </div>
  )
}
