import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, Copy, Download, FileCode2, MessageSquare, Play, Plug, Plus, Search, Trash2, X } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Botao, Carregando, Interruptor, Modal, Selo, confirmar, useToast } from '../ui'

// Painéis da barra lateral do Assistente (no jeito do Claude): Procurar, Artefatos, Agendados e Plugins.
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const NOME_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function Procurar({ fechar, abrir }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => api.get(`/api/ia/conversas${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setLista).catch(() => setLista([])), q ? 220 : 0)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal aberto titulo="Procurar conversas" onFechar={fechar} largura="max-w-2xl">
      <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input autoFocus type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Título ou texto da conversa" className="campo h-10 pl-9" /></label>
      <ul className="mt-3 max-h-[60vh] space-y-0.5 overflow-y-auto">
        {!lista ? <Carregando /> : !lista.length ? <p className="py-8 text-center text-sm text-muted-foreground">{q ? 'Nada com esse texto.' : 'Nenhuma conversa ainda.'}</p> : lista.map((c) => (
          <li key={c.id}><button onClick={() => { abrir(c.id); fechar() }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate text-sm">{c.titulo}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{c.atualizado_em ? haQuanto(c.atualizado_em) : ''}</span></button></li>))}
      </ul>
    </Modal>
  )
}

export function Artefatos({ fechar, abrir }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [sel, setSel] = useState(null)
  const [filtro, setFiltro] = useState('')
  useEffect(() => { api.get('/api/ia/artefatos').then((l) => { setLista(l); setSel(l[0] || null) }).catch(() => setLista([])) }, [])
  const linguagens = useMemo(() => [...new Set((lista || []).map((a) => a.linguagem))], [lista])
  const vis = (lista || []).filter((a) => !filtro || a.linguagem === filtro)
  const baixar = (a) => {
    const el = document.createElement('a')
    el.href = URL.createObjectURL(new Blob([a.conteudo], { type: 'text/plain' }))
    el.download = `${(a.conversa || 'artefato').replace(/[^\w-]+/g, '-').slice(0, 40)}.${a.extensao}`
    el.click()
  }
  return (
    <Modal aberto titulo="Artefatos" onFechar={fechar} largura="max-w-5xl">
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">Código, consultas, tabelas e textos que o assistente entregou nas suas conversas. Copie, baixe ou volte à conversa.</p>
      {!lista ? <Carregando /> : !lista.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground"><FileCode2 className="mx-auto mb-2 h-6 w-6" />Ainda não há artefatos. Peça um script, uma consulta SQL ou uma tabela e ele aparece aqui.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-2">
            {linguagens.length > 1 && <select className="campo h-9" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Linguagem"><option value="">Todas as linguagens</option>{linguagens.map((l) => <option key={l} value={l}>{l}</option>)}</select>}
            <ul className="max-h-[55vh] space-y-1 overflow-y-auto">{vis.map((a) => (
              <li key={a.id}><button onClick={() => setSel(a)} className={`w-full rounded-lg border px-3 py-2 text-left ${sel?.id === a.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                <span className="flex items-center gap-2 text-xs"><Selo>{a.linguagem}</Selo><span className="text-muted-foreground">{a.linhas} linha(s)</span></span>
                <span className="mt-1 block truncate font-mono text-xs">{a.titulo}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{a.conversa}</span></button></li>))}</ul>
          </div>
          <AnimatePresence mode="wait">
            {sel && (
              <motion.div key={sel.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{sel.conversa}</span>
                  <Botao tamanho="sm" variante="secundario" icone={Copy} onClick={() => navigator.clipboard.writeText(sel.conteudo).then(() => toast('Copiado.'))}>Copiar</Botao>
                  <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => baixar(sel)}>Baixar .{sel.extensao}</Botao>
                  <Botao tamanho="sm" variante="fantasma" icone={MessageSquare} onClick={() => { abrir(sel.conversa_id); fechar() }}>Abrir conversa</Botao>
                </div>
                <pre className="max-h-[55vh] overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed" translate="no"><code>{sel.conteudo}</code></pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </Modal>
  )
}

const VAZIO = { titulo: '', pedido: '', hora: '08:00', dias: [1, 2, 3, 4, 5], ativo: true, entregar: ['sino'] }
const EXEMPLOS = [
  { titulo: 'Bom dia do escritório', pedido: 'Resuma como estão os ares agora, o tempo lá fora e se algo falhou desde ontem. Sugira a temperatura para hoje.', hora: '08:00' },
  { titulo: 'Fim do expediente', pedido: 'Quais ares ainda estão ligados? Algum ligado há mais de 8 horas?', hora: '18:30' },
  { titulo: 'Resumo da semana', pedido: 'Faça um resumo dos últimos 7 dias: uso, custo estimado, falhas e o que chamou atenção.', hora: '17:00', dias: [5] },
]

export function Agendados({ fechar, abrir }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [f, setF] = useState(null)
  const [rodando, setRodando] = useState(null)
  const carregar = () => api.get('/api/ia/agendados').then(setLista).catch(() => setLista([]))
  useEffect(() => { carregar() }, [])
  const salvar = async () => {
    try { f.id ? await api.put(`/api/ia/agendados/${f.id}`, f) : await api.post('/api/ia/agendados', f); setF(null); carregar(); toast('Agendado salvo.') } catch (e) { toast(e.message, 'erro') }
  }
  const rodar = async (a) => {
    setRodando(a.id)
    try { const r = await api.post(`/api/ia/agendados/${a.id}/rodar`); toast('Rodou: a resposta virou uma conversa.'); carregar(); abrir(r.conversa_id); fechar() } catch (e) { toast(e.message, 'erro') } finally { setRodando(null) }
  }
  const apagar = async (a) => { if (!(await confirmar(`Apagar o agendado "${a.titulo}"?`, { titulo: 'Apagar agendado', ok: 'Apagar' }))) return; await api.del(`/api/ia/agendados/${a.id}`); carregar() }
  const alternar = async (a, v) => { try { await api.put(`/api/ia/agendados/${a.id}`, { ...a, ativo: v }); carregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <Modal aberto titulo="Agendados" onFechar={fechar} largura="max-w-3xl">
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">Pedidos que o assistente responde sozinho no horário marcado (horário de Brasília). Rodam no agente do escritório, só consultando: nada muda ar nem conta sozinho. A resposta vira uma conversa e chega no sino, no e-mail ou no Telegram.</p>
      {f ? (
        <div className="space-y-3">
          <label className="block text-sm">Nome<input className="campo mt-1 h-9" maxLength={80} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></label>
          <label className="block text-sm">Pedido<textarea className="campo mt-1 w-full py-2 text-sm" rows={4} maxLength={2000} value={f.pedido} onChange={(e) => setF({ ...f, pedido: e.target.value })} placeholder="Ex.: resuma o estado dos ares e o tempo lá fora" /></label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm">Hora<input type="time" className="campo mt-1 h-9 w-32" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></label>
            <div className="text-sm">Dias<div className="mt-1 flex gap-1">{DIAS.map((d, i) => { const on = f.dias.includes(i); return <button key={i} type="button" aria-pressed={on} title={NOME_DIA[i]} onClick={() => setF({ ...f, dias: on ? f.dias.filter((x) => x !== i) : [...f.dias, i].sort() })} className={`h-8 w-8 rounded-md text-xs font-medium ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{d}</button> })}</div></div>
            <div className="text-sm">Entregar em<div className="mt-1 flex gap-1">{[['sino', 'Sino'], ['email', 'E-mail'], ['telegram', 'Telegram']].map(([k, r]) => { const on = f.entregar.includes(k); return <button key={k} type="button" aria-pressed={on} onClick={() => setF({ ...f, entregar: on ? f.entregar.filter((x) => x !== k) : [...f.entregar, k] })} className={`h-8 rounded-md px-2.5 text-xs ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{r}</button> })}</div></div>
          </div>
          <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => setF(null)}>Cancelar</Botao><Botao icone={Check} onClick={salvar}>Salvar</Botao></div>
        </div>
      ) : !lista ? <Carregando /> : (
        <>
          {!lista.length && (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{EXEMPLOS.map((x) => (
              <button key={x.titulo} onClick={() => setF({ ...VAZIO, ...x })} className="rounded-lg border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/50">
                <span className="flex items-center gap-2 text-sm font-medium"><CalendarClock className="h-4 w-4 text-primary" />{x.titulo}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{x.hora} · {x.pedido.slice(0, 70)}…</span></button>))}</div>
          )}
          <ul className="space-y-2">{lista.map((a) => (
            <li key={a.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setF({ ...a })} className="min-w-0 text-left"><p className="truncate text-sm font-medium">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground">{a.hora} · {a.dias.length === 7 ? 'todo dia' : a.dias.join() === '1,2,3,4,5' ? 'dias úteis' : a.dias.map((i) => NOME_DIA[i]).join(', ')} · {a.entregar.join(', ')}</p></button>
                <Interruptor ligado={a.ativo} onChange={(v) => alternar(a, v)} rotulo={`Ligar ${a.titulo}`} />
              </div>
              {a.ultima_exec && <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">Último ({haQuanto(a.ultima_exec)}): {a.ultimo_resultado}</p>}
              <div className="mt-2 flex gap-1.5">
                <Botao tamanho="sm" variante="secundario" icone={Play} carregando={rodando === a.id} onClick={() => rodar(a)}>Testar agora</Botao>
                {a.ultima_conversa && <Botao tamanho="sm" variante="fantasma" icone={MessageSquare} onClick={() => { abrir(a.ultima_conversa); fechar() }}>Ver resposta</Botao>}
                <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => apagar(a)} aria-label="Apagar" />
              </div>
            </li>))}</ul>
          <div className="mt-3 flex justify-end"><Botao icone={Plus} onClick={() => setF({ ...VAZIO })}>Novo agendado</Botao></div>
        </>
      )}
    </Modal>
  )
}

export function Plugins({ fechar, prefs, mudarPrefs }) {
  const [lista, setLista] = useState(null)
  useEffect(() => { api.get('/api/ia/plugins').then(setLista).catch(() => setLista([])) }, [prefs?.plugins_off])
  const alternar = (id, ligar) => {
    const off = new Set(prefs?.plugins_off || [])
    if (ligar) off.delete(id); else off.add(id)
    mudarPrefs({ plugins_off: [...off] })
  }
  return (
    <Modal aberto titulo="Plugins" onFechar={fechar} largura="max-w-2xl">
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">O que o assistente pode usar nas suas conversas. Desligado, ele nem enxerga essas ferramentas. As permissões do seu usuário continuam valendo por cima disto.</p>
      {!lista ? <Carregando /> : (
        <ul className="divide-y divide-border rounded-lg border border-border">{lista.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted"><Plug className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{p.nome}</span><span className="block text-xs text-muted-foreground">{p.descricao} · {p.ferramentas} ferramenta(s)</span></span>
            <Interruptor ligado={p.ligado} onChange={(v) => alternar(p.id, v)} rotulo={`${p.ligado ? 'Desligar' : 'Ligar'} ${p.nome}`} />
          </li>))}</ul>
      )}
      <div className="mt-3 flex justify-end"><Botao variante="secundario" icone={X} onClick={fechar}>Fechar</Botao></div>
    </Modal>
  )
}
