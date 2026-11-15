import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive, ArchiveRestore, ArrowLeft, BellOff, Check, CheckCheck, ChevronDown, Copy, Download, Info, Mail, MailOpen, MapPin,
  MessageSquareText, MessagesSquare, Newspaper, Pin, PinOff, Plus, Search, Send, Smile, Star, StickyNote, Tag, Trash2, X, Zap,
} from 'lucide-react'
import { api } from '../api'
import { Aviso, Botao, Modal, useToast } from '../components/ui'

// Caixa de mensagens do site no formato de conversa: lista à esquerda (uma conversa por e-mail),
// conversa em balões à direita, respostas e notas internas, respostas prontas e painel do contato.
// Não há servidor de e-mail no sistema: "Responder" abre a mensagem pronta no e-mail de quem responde
// e registra a resposta na conversa.
const FILTROS = [['tudo', 'Tudo'], ['nao_lidas', 'Não lidas'], ['sem_resposta', 'Sem resposta'], ['favoritas', 'Favoritas'],
  ['contato', 'Contato'], ['novidades', 'Novidades'], ['respondidas', 'Respondidas']]
const EMOJIS = ['🙂', '😊', '👍', '🙏', '👏', '✅', '📞', '📅', '❄️', '🌡️', '💡', '🔧', '📍', '⏰', '🎉', '👋']
const CORES = ['#0f766a', '#2563eb', '#b45309', '#7c3aed', '#be123c', '#0891b2', '#4d7c0f', '#c2410c']

const corDe = (t) => CORES[[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length]
const iniciais = (nome, email) => (nome || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
const dia = (ts) => new Date(ts * 1000).toDateString()
function quandoCurto(ts) {
  const d = new Date(ts * 1000), hoje = new Date(), ontem = new Date(Date.now() - 86400000)
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  if (Date.now() - d < 6 * 86400000) return d.toLocaleDateString('pt-BR', { weekday: 'long' })
  return d.toLocaleDateString('pt-BR')
}
function separador(ts) {
  const d = new Date(ts * 1000), hoje = new Date(), ontem = new Date(Date.now() - 86400000)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const hora = (ts) => new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function Avatar({ nome, email, tamanho = 'h-11 w-11 text-sm' }) {
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${tamanho}`} style={{ background: corDe(email) }}>{iniciais(nome, email)}</span>
}

function Destacar({ texto, termo }) {
  if (!termo) return texto
  const i = texto.toLowerCase().indexOf(termo.toLowerCase())
  if (i < 0) return texto
  return <>{texto.slice(0, i)}<mark className="rounded bg-amber-300/60 px-0.5 text-inherit dark:bg-amber-500/40">{texto.slice(i, i + termo.length)}</mark>{texto.slice(i + termo.length)}</>
}

function MenuConversa({ c, aoAgir, aberto, setAberto }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(null) }
    document.addEventListener('mousedown', fora); return () => document.removeEventListener('mousedown', fora)
  }, [aberto, setAberto])
  const itens = [
    [c.fixada ? 'Desafixar' : 'Fixar no topo', c.fixada ? PinOff : Pin, { fixada: !c.fixada }],
    [c.favorita ? 'Tirar das favoritas' : 'Favoritar', Star, { favorita: !c.favorita }],
    [c.nao_lidas ? 'Marcar como lida' : 'Marcar como não lida', c.nao_lidas ? MailOpen : Mail, { lida: !!c.nao_lidas }],
    [c.silenciada ? 'Reativar avisos' : 'Silenciar', BellOff, { silenciada: !c.silenciada }],
    [c.arquivada ? 'Desarquivar' : 'Arquivar', c.arquivada ? ArchiveRestore : Archive, { arquivada: !c.arquivada }],
  ]
  return (
    <div ref={ref} className="absolute right-2 top-9 z-30 w-56 rounded-lg border border-border bg-card p-1 shadow-xl" onClick={(e) => e.stopPropagation()}> {/* marca: menu flutua */}
      {itens.map(([r, I, mud]) => <button key={r} onClick={() => { setAberto(null); aoAgir(c.email, mud) }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"><I className="h-4 w-4 text-muted-foreground" />{r}</button>)}
      <button onClick={() => { setAberto(null); aoAgir(c.email, null, 'apagar') }} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-muted dark:text-red-400"><Trash2 className="h-4 w-4" />Apagar conversa</button>
    </div>
  )
}

function ItemConversa({ c, ativa, termo, aoAbrir, aoAgir, menu, setMenu }) {
  const naoLida = c.nao_lidas > 0
  return (
    <div role="button" tabIndex={0} onClick={() => aoAbrir(c.email)} onKeyDown={(e) => e.key === 'Enter' && aoAbrir(c.email)}
      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${ativa ? 'bg-muted' : 'hover:bg-muted/60'}`}>
      <Avatar nome={c.nome} email={c.email} />
      <div className="min-w-0 flex-1 border-b border-border/60 pb-2.5 pt-0.5 group-last:border-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[15px] ${naoLida ? 'font-semibold' : 'font-medium'}`}><Destacar texto={c.nome || c.email} termo={termo} /></p>
          <span className={`shrink-0 text-[11px] ${naoLida ? 'font-medium text-primary' : 'text-muted-foreground'}`}>{quandoCurto(c.ultimo.quando)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {c.ultimo.de === 'admin' && <CheckCheck className="h-4 w-4 shrink-0 text-sky-500" />}
          {c.ultimo.de === 'nota' && <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
          {c.novidades && !c.contato && <Newspaper className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <p className={`min-w-0 flex-1 truncate text-[13px] ${naoLida ? 'text-foreground' : 'text-muted-foreground'}`}><Destacar texto={c.ultimo.texto} termo={termo} /></p>
          {c.silenciada && <BellOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {c.favorita && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          {c.fixada && <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          {naoLida && <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{c.nao_lidas}</span>}
        </div>
        {c.etiquetas?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.etiquetas.slice(0, 3).map((e) => <span key={e} className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">{e}</span>)}</div>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); setMenu(menu === c.email ? null : c.email) }} aria-label="Opções da conversa"
        className="absolute right-2 top-2 rounded-md bg-card/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"><ChevronDown className="h-4 w-4" /></button>
      {menu === c.email && <MenuConversa c={c} aoAgir={aoAgir} aberto setAberto={setMenu} />}
    </div>
  )
}

function Balao({ m, contato, termo, aoApagar }) {
  if (m.de === 'contato' && m.tipo === 'novidades' && !m.texto) {
    return <div className="my-2 flex justify-center"><span className="flex items-center gap-1.5 rounded-lg bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"><Newspaper className="h-3.5 w-3.5" />{contato.nome || contato.email} se inscreveu nas novidades · {hora(m.quando)}</span></div>
  }
  const meu = m.de !== 'contato', nota = m.de === 'nota'
  return (
    <motion.div initial={{ opacity: 0, y: 6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }}
      className={`group my-1 flex ${meu ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-[78%] rounded-lg px-3 pb-1.5 pt-2 text-[14.5px] leading-relaxed shadow-sm ${nota ? 'border border-amber-400/40 bg-amber-100 text-amber-950 dark:bg-amber-500/15 dark:text-amber-100'
        : meu ? 'rounded-tr-none bg-primary/90 text-primary-foreground' : 'rounded-tl-none border border-border bg-card'}`}> {/* marca: balão de conversa */}
        {nota && <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-80"><StickyNote className="h-3 w-3" />Nota interna{m.autor ? ` · ${m.autor}` : ''}</p>}
        {m.de === 'admin' && m.autor && <p className="mb-0.5 text-[11px] font-semibold opacity-80">{m.autor}</p>}
        {m.assunto && <p className="mb-0.5 font-semibold">{m.assunto}</p>}
        <p className="whitespace-pre-wrap break-words"><Destacar texto={m.texto || ''} termo={termo} /></p>
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${meu && !nota ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
          {m.de === 'admin' && <span>pelo e-mail ·</span>}{hora(m.quando)}{m.de === 'admin' && <CheckCheck className="h-3.5 w-3.5" />}
        </p>
        {meu && <button onClick={() => aoApagar(m)} aria-label="Apagar" className="absolute -left-8 top-1.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </motion.div>
  )
}

function RespostasProntas({ aberto, aoFechar, aoEscolher }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [editar, setEditar] = useState(false)
  useEffect(() => { if (aberto) api.get('/api/site/respostas-prontas').then(setLista).catch(() => setLista([])) }, [aberto])
  const salvar = async () => {
    try { setLista(await api.put('/api/site/respostas-prontas', lista.filter((x) => x.titulo.trim() && x.texto.trim()))); setEditar(false); toast('Respostas prontas salvas.') } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <Modal aberto={aberto} titulo="Respostas prontas" onFechar={aoFechar} largura="max-w-xl">
      {!lista ? <p className="text-sm text-muted-foreground">Carregando…</p> : editar ? (
        <div className="space-y-3">
          {lista.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex gap-2"><input value={r.titulo} maxLength={40} placeholder="Título" onChange={(e) => setLista(lista.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))} className="campo h-9 flex-1" />
                <button onClick={() => setLista(lista.filter((_, j) => j !== i))} className="rounded-md px-2 text-muted-foreground hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button></div>
              <textarea value={r.texto} maxLength={2000} rows={3} onChange={(e) => setLista(lista.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} className="campo" />
            </div>
          ))}
          <div className="flex justify-between gap-2">
            <Botao variante="secundario" icone={Plus} onClick={() => setLista([...lista, { titulo: '', texto: '' }])}>Nova resposta</Botao>
            <div className="flex gap-2"><Botao variante="secundario" onClick={() => setEditar(false)}>Cancelar</Botao><Botao onClick={salvar}>Salvar</Botao></div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map((r) => (
            <button key={r.titulo} onClick={() => aoEscolher(r.texto)} className="block w-full rounded-lg border border-border p-3 text-left hover:bg-muted">
              <p className="text-sm font-medium">{r.titulo}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.texto}</p>
            </button>
          ))}
          <Botao variante="secundario" icone={Zap} onClick={() => setEditar(true)} className="mt-2">Editar respostas prontas</Botao>
        </div>
      )}
    </Modal>
  )
}

function PainelContato({ dados, aoAgir, aoFechar }) {
  const toast = useToast()
  const [nova, setNova] = useState('')
  const { contato: c, estado: e } = dados
  const salvarEtiquetas = (lista) => aoAgir(c.email, { etiquetas: lista })
  return (
    <motion.aside initial={{ x: 24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 24, opacity: 0 }}
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-card sm:w-80 xl:static xl:z-auto">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3"><button onClick={aoFechar} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button><p className="text-sm font-medium">Dados do contato</p></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex flex-col items-center text-center">
          <Avatar nome={c.nome} email={c.email} tamanho="h-20 w-20 text-2xl" />
          <p className="mt-3 text-lg font-semibold">{c.nome || 'Sem nome'}</p>
          <button onClick={() => { navigator.clipboard?.writeText(c.email); toast('E-mail copiado.') }} className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">{c.email}<Copy className="h-3.5 w-3.5" /></button>
          {(c.cidade || c.pais) && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{[c.cidade, c.pais].filter(Boolean).join(', ')} (aproximado)</p>}
        </div>
        <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border p-3 text-center text-xs">
          <div><dt className="text-muted-foreground">Mensagens</dt><dd className="text-base font-semibold tabular">{c.total}</dd></div>
          <div><dt className="text-muted-foreground">Respostas</dt><dd className="text-base font-semibold tabular">{c.respostas}</dd></div>
          <div><dt className="text-muted-foreground">Notas</dt><dd className="text-base font-semibold tabular">{c.notas}</dd></div>
        </dl>
        <div className="text-sm"><p className="text-xs text-muted-foreground">Primeiro contato</p><p>{new Date(c.primeira * 1000).toLocaleString('pt-BR')}</p>
          {c.novidades && <p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><Newspaper className="h-3.5 w-3.5" />Inscrito nas novidades</p>}</div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Tag className="h-3.5 w-3.5" />Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {e.etiquetas.map((t) => <span key={t} className="flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{t}<button onClick={() => salvarEtiquetas(e.etiquetas.filter((x) => x !== t))} aria-label={`Tirar ${t}`}><X className="h-3 w-3" /></button></span>)}
          </div>
          <form onSubmit={(ev) => { ev.preventDefault(); if (nova.trim()) { salvarEtiquetas([...new Set([...e.etiquetas, nova.trim()])]); setNova('') } }} className="mt-2 flex gap-2">
            <input value={nova} onChange={(ev) => setNova(ev.target.value)} maxLength={24} placeholder="Ex.: orçamento, cliente" className="campo h-8 flex-1 text-sm" />
            <Botao tamanho="sm" variante="secundario" type="submit">Adicionar</Botao>
          </form>
        </div>
        <div className="space-y-1 border-t border-border pt-4">
          {[[e.favorita ? 'Tirar das favoritas' : 'Favoritar', Star, { favorita: !e.favorita }], [e.fixada ? 'Desafixar' : 'Fixar no topo', Pin, { fixada: !e.fixada }],
            [e.silenciada ? 'Reativar avisos' : 'Silenciar avisos', BellOff, { silenciada: !e.silenciada }], [e.arquivada ? 'Desarquivar' : 'Arquivar conversa', Archive, { arquivada: !e.arquivada }]].map(([r, I, m]) => (
            <button key={r} onClick={() => aoAgir(c.email, m)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"><I className="h-4 w-4 text-muted-foreground" />{r}</button>
          ))}
          <button onClick={() => aoAgir(c.email, null, 'apagar')} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-muted dark:text-red-400"><Trash2 className="h-4 w-4" />Apagar conversa</button>
        </div>
      </div>
    </motion.aside>
  )
}

export default function Mensagens() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filtro, setFiltro] = useState('tudo')
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(null)       // email
  const [conversa, setConversa] = useState(null)
  const [texto, setTexto] = useState('')
  const [nota, setNota] = useState(false)
  const [emoji, setEmoji] = useState(false)
  const [prontas, setProntas] = useState(false)
  const [info, setInfo] = useState(false)
  const [menu, setMenu] = useState(null)
  const [buscaConversa, setBuscaConversa] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const fimRef = useRef(null), buscaRef = useRef(null), campoRef = useRef(null)

  const carregarLista = useCallback(async () => {
    try { setLista(await api.get(`/api/site/conversas?filtro=${filtro}&busca=${encodeURIComponent(busca)}`)); setErro('') } catch (e) { setErro(e.message) }
  }, [filtro, busca])
  const carregarConversa = useCallback(async (email, marcarLida = false) => {
    if (!email) return
    try {
      const d = await api.get(`/api/site/conversa?email=${encodeURIComponent(email)}`)
      setConversa(d)
      if (marcarLida && d.linha.some((m) => m.de === 'contato' && !m.lida)) { await api.put(`/api/site/conversa?email=${encodeURIComponent(email)}`, { lida: true }); carregarLista() }
    } catch (e) { toast(e.message, 'erro'); setAberta(null) }
  }, [carregarLista, toast])

  useEffect(() => { const t = setTimeout(carregarLista, busca ? 250 : 0); return () => clearTimeout(t) }, [carregarLista, busca])
  // ao vivo: atualiza a cada 10 s e na hora em que a central avisa mensagem nova
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) { carregarLista(); if (aberta) carregarConversa(aberta) } }, 10000)
    const nova = () => { carregarLista(); if (aberta) carregarConversa(aberta) }
    window.addEventListener('clima:notificacao', nova)
    return () => { clearInterval(t); window.removeEventListener('clima:notificacao', nova) }
  }, [carregarLista, carregarConversa, aberta])
  // link direto da notificação (?id=) ou do e-mail (?email=)
  useEffect(() => {
    const email = params.get('email')
    const id = params.get('id')
    if (email) abrir(email)
    else if (id) api.get('/api/site/mensagens?filtro=entrada&limite=500').then((d) => { const m = d.itens.find((x) => String(x.id) === id); if (m) abrir(m.email) }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [conversa?.linha?.length, aberta])
  useEffect(() => {
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); buscaRef.current?.focus() }
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) { if (info) setInfo(false); else if (buscaConversa !== null) setBuscaConversa(null); else if (aberta) fechar() }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && lista?.itens?.length) {
        e.preventDefault()
        const i = lista.itens.findIndex((c) => c.email === aberta)
        const prox = lista.itens[Math.max(0, Math.min(lista.itens.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (prox) abrir(prox.email)
      }
    }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  })

  const abrir = (email) => {
    setAberta(email); setConversa(null); setTexto(''); setNota(false); setBuscaConversa(null); setEmoji(false)
    setParams({ email }, { replace: true }); carregarConversa(email, true)
    setTimeout(() => campoRef.current?.focus(), 200)
  }
  const fechar = () => { setAberta(null); setConversa(null); setInfo(false); setParams({}, { replace: true }) }
  const agir = async (email, mudanca, acao) => {
    try {
      if (acao === 'apagar') {
        if (!window.confirm('Apagar toda a conversa (mensagens, respostas e notas)? Não dá para desfazer.')) return
        await api.del(`/api/site/conversa?email=${encodeURIComponent(email)}`); toast('Conversa apagada.'); if (email === aberta) fechar()
      } else {
        await api.put(`/api/site/conversa?email=${encodeURIComponent(email)}`, mudanca)
        if (mudanca.arquivada !== undefined) toast(mudanca.arquivada ? 'Conversa arquivada.' : 'Conversa de volta à caixa de entrada.')
        if (email === aberta) carregarConversa(email)
      }
      carregarLista()
    } catch (e) { toast(e.message, 'erro') }
  }
  const enviar = async () => {
    const t = texto.trim()
    if (!t || !conversa || enviando) return
    setEnviando(true)
    try {
      if (!nota) {
        const assunto = `Re: ${conversa.contato.assunto || 'sua mensagem pelo site'}`
        window.open(`mailto:${conversa.contato.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(t)}`, '_blank')
      }
      await api.post(`/api/site/conversa/responder?email=${encodeURIComponent(conversa.contato.email)}`, { texto: t, nota })
      setTexto(''); setEmoji(false)
      if (campoRef.current) campoRef.current.style.height = 'auto'
      toast(nota ? 'Nota interna salva.' : 'Resposta aberta no seu e-mail e registrada na conversa.')
      carregarConversa(conversa.contato.email); carregarLista()
    } catch (e) { toast(e.message, 'erro') } finally { setEnviando(false) }
  }
  const apagarResposta = async (m) => {
    if (!window.confirm('Apagar este registro da conversa? (Um e-mail já enviado não é desfeito.)')) return
    try { await api.del(`/api/site/conversa/resposta/${m.rid}`); carregarConversa(aberta); carregarLista() } catch (e) { toast(e.message, 'erro') }
  }
  const exportar = async () => { try { toast(`Arquivo salvo: ${await api.baixar('/api/site/mensagens/exportar')}`) } catch (e) { toast(e.message, 'erro') } }
  const lerTodas = async () => {
    const naoLidas = (lista?.itens || []).filter((c) => c.nao_lidas)
    for (const c of naoLidas) await api.put(`/api/site/conversa?email=${encodeURIComponent(c.email)}`, { lida: true }).catch(() => {})
    toast(naoLidas.length ? `${naoLidas.length} conversa(s) marcada(s) como lida(s).` : 'Nada para marcar.'); carregarLista()
  }

  const linhaFiltrada = useMemo(() => {
    if (!conversa) return []
    if (!buscaConversa) return conversa.linha
    return conversa.linha.filter((m) => `${m.assunto || ''} ${m.texto || ''}`.toLowerCase().includes(buscaConversa.toLowerCase()))
  }, [conversa, buscaConversa])
  const contagem = lista?.contagem || {}

  return (
    <div className="-mx-4 -mb-16 -mt-6 sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      <div className="relative flex h-[calc(100dvh-4rem)] overflow-hidden border-t border-border bg-background">
        {/* lista de conversas */}
        <section className={`flex w-full shrink-0 flex-col border-r border-border bg-card md:w-[380px] ${aberta ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h1 className="text-[22px] font-semibold tracking-tight">Mensagens</h1>
            <div className="flex items-center gap-0.5">
              <button onClick={lerTodas} title="Marcar todas como lidas" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><CheckCheck className="h-[18px] w-[18px]" /></button>
              <button onClick={() => setProntas(true)} title="Respostas prontas" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Zap className="h-[18px] w-[18px]" /></button>
              <button onClick={exportar} title="Exportar CSV" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-[18px] w-[18px]" /></button>
            </div>
          </div>
          <div className="px-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar nome, e-mail ou mensagem (⌘K)"
                className="h-9 w-full rounded-lg border-0 bg-muted pl-9 pr-8 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2" aria-label="Pesquisar conversas" />
              {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar"><X className="h-4 w-4" /></button>}
            </label>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 sem-barra">
            {FILTROS.map(([k, r]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-[13px] transition-colors ${filtro === k ? 'border-primary/30 bg-primary/15 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                {r}{contagem[k] > 0 && k !== 'tudo' && <span className="text-[11px] opacity-80">{contagem[k]}</span>}
              </button>
            ))}
          </div>
          {filtro !== 'arquivadas' && contagem.arquivadas > 0 && (
            <button onClick={() => setFiltro('arquivadas')} className="mx-3 flex items-center gap-4 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Archive className="h-[18px] w-[18px] text-primary" /><span className="flex-1 text-left font-medium">Arquivadas</span><span className="text-xs text-muted-foreground">{contagem.arquivadas}</span></button>
          )}
          {filtro === 'arquivadas' && <button onClick={() => setFiltro('tudo')} className="mx-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" />Voltar para a caixa de entrada</button>}
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            {erro && <div className="p-2"><Aviso>{erro}</Aviso></div>}
            {!lista && !erro && Array.from({ length: 6 }).map((_, i) => <div key={i} className="m-1 flex animate-pulse items-center gap-3 p-2"><span className="h-11 w-11 rounded-full bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-muted" /><span className="block h-3 w-3/4 rounded bg-muted" /></span></div>)}
            {lista?.itens.length === 0 && (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <MessagesSquare className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium">{busca ? 'Nada encontrado' : filtro === 'tudo' ? 'Nenhuma mensagem ainda' : 'Nada neste filtro'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{busca ? 'Tente outro nome, e-mail ou trecho da mensagem.' : 'O que chegar pelos formulários de Contato e Novidades do site aparece aqui, com aviso e som.'}</p>
              </div>
            )}
            {lista?.itens.map((c) => <ItemConversa key={c.email} c={c} ativa={c.email === aberta} termo={busca} aoAbrir={abrir} aoAgir={agir} menu={menu} setMenu={setMenu} />)}
          </div>
        </section>

        {/* conversa */}
        <section className={`relative min-w-0 flex-1 flex-col ${aberta ? 'flex' : 'hidden md:flex'}`}>
          {!aberta ? (
            <div className="flex flex-1 flex-col items-center justify-center bg-muted/30 px-8 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/10"><MessageSquareText className="h-9 w-9 text-primary" strokeWidth={1.5} /></div>
              <h2 className="mt-5 text-xl font-semibold">Mensagens do site</h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">Escolha uma conversa para ler e responder. As respostas abrem no seu e-mail e ficam registradas aqui; notas internas só a equipe vê.</p>
              <p className="mt-6 text-xs text-muted-foreground">⌘K pesquisa · Alt + ↑ ↓ troca de conversa · Esc fecha</p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5">
                <button onClick={fechar} className="rounded-md p-1.5 hover:bg-muted md:hidden" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
                {conversa ? (
                  <button onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar nome={conversa.contato.nome} email={conversa.contato.email} tamanho="h-10 w-10 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{conversa.contato.nome || conversa.contato.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{conversa.contato.email}{conversa.contato.cidade ? ` · ${conversa.contato.cidade}` : ''}</span>
                    </span>
                  </button>
                ) : <span className="h-10 flex-1" />}
                <button onClick={() => setBuscaConversa(buscaConversa === null ? '' : null)} title="Pesquisar na conversa" className={`rounded-md p-2 hover:bg-muted ${buscaConversa !== null ? 'text-primary' : 'text-muted-foreground'}`}><Search className="h-[18px] w-[18px]" /></button>
                {conversa && <button onClick={() => agir(conversa.contato.email, { favorita: !conversa.estado.favorita })} title="Favoritar" className="rounded-md p-2 text-muted-foreground hover:bg-muted"><Star className={`h-[18px] w-[18px] ${conversa.estado.favorita ? 'fill-amber-400 text-amber-400' : ''}`} /></button>}
                {conversa && <button onClick={() => agir(conversa.contato.email, { arquivada: !conversa.estado.arquivada })} title={conversa.estado.arquivada ? 'Desarquivar' : 'Arquivar'} className="rounded-md p-2 text-muted-foreground hover:bg-muted">{conversa.estado.arquivada ? <ArchiveRestore className="h-[18px] w-[18px]" /> : <Archive className="h-[18px] w-[18px]" />}</button>}
                <button onClick={() => setInfo((v) => !v)} title="Dados do contato" className={`rounded-md p-2 hover:bg-muted ${info ? 'text-primary' : 'text-muted-foreground'}`}><Info className="h-[18px] w-[18px]" /></button>
              </header>
              <AnimatePresence>
                {buscaConversa !== null && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-b border-border bg-card">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <Search className="h-4 w-4 text-muted-foreground" />
                      <input autoFocus value={buscaConversa} onChange={(e) => setBuscaConversa(e.target.value)} placeholder="Pesquisar nesta conversa" className="h-8 flex-1 bg-transparent text-sm outline-none" />
                      <span className="text-xs text-muted-foreground">{buscaConversa ? `${linhaFiltrada.length} resultado(s)` : ''}</span>
                      <button onClick={() => setBuscaConversa(null)} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Fechar busca"><X className="h-4 w-4" /></button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative flex min-h-0 flex-1">
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="fundo-conversa flex-1 overflow-y-auto px-4 py-4 sm:px-[6%]">
                    {!conversa ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando a conversa…</p> : (
                      <>
                        <div className="mx-auto mb-4 max-w-md rounded-lg bg-amber-100/90 px-3 py-2 text-center text-[12px] text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                          Mensagens vindas dos formulários do site. Respostas saem pelo seu e-mail; notas internas ficam só no sistema.
                        </div>
                        {linhaFiltrada.map((m, i) => (
                          <div key={m.id}>
                            {(i === 0 || dia(m.quando) !== dia(linhaFiltrada[i - 1].quando)) && <div className="sticky top-0 z-10 my-3 flex justify-center"><span className="rounded-lg bg-card px-3 py-1 text-[12px] font-medium capitalize text-muted-foreground shadow-sm">{separador(m.quando)}</span></div>}
                            <Balao m={m} contato={conversa.contato} termo={buscaConversa} aoApagar={apagarResposta} />
                          </div>
                        ))}
                        <div ref={fimRef} />
                      </>
                    )}
                  </div>
                  {/* compositor */}
                  <div className="border-t border-border bg-card px-3 py-2.5">
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      <div className="flex rounded-lg border border-border p-0.5">
                        <button onClick={() => setNota(false)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ${!nota ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground'}`}><Mail className="h-3.5 w-3.5" />Responder por e-mail</button>
                        <button onClick={() => setNota(true)} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 ${nota ? 'bg-amber-500/15 font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}><StickyNote className="h-3.5 w-3.5" />Nota interna</button>
                      </div>
                      {conversa?.estado?.silenciada && <span className="flex items-center gap-1 text-muted-foreground"><BellOff className="h-3.5 w-3.5" />silenciada</span>}
                    </div>
                    <div className="relative flex items-end gap-2">
                      <AnimatePresence>
                        {emoji && (
                          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="absolute bottom-12 left-0 z-20 grid grid-cols-8 gap-1 rounded-xl border border-border bg-card p-2 shadow-xl"> {/* marca: menu flutua */}
                            {EMOJIS.map((e) => <button key={e} onClick={() => { setTexto((t) => t + e); campoRef.current?.focus() }} className="grid h-9 w-9 place-items-center rounded-md text-xl hover:bg-muted">{e}</button>)}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <button onClick={() => setEmoji((v) => !v)} title="Emojis" className="mb-1 rounded-full p-2 text-muted-foreground hover:bg-muted"><Smile className="h-5 w-5" /></button>
                      <button onClick={() => setProntas(true)} title="Respostas prontas" className="mb-1 rounded-full p-2 text-muted-foreground hover:bg-muted"><Zap className="h-5 w-5" /></button>
                      <textarea ref={campoRef} rows={1} value={texto} maxLength={5000}
                        onChange={(e) => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(160, e.target.scrollHeight)}px` }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                        placeholder={nota ? 'Escreva uma nota que só a equipe vê' : 'Digite a resposta (Enter envia, Shift+Enter quebra a linha)'}
                        className={`max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border px-3 py-2.5 text-[14.5px] outline-none ring-primary/40 focus:ring-2 ${nota ? 'border-amber-400/50 bg-amber-50 dark:bg-amber-500/10' : 'border-border bg-muted/50'}`} aria-label="Mensagem" />
                      <button onClick={enviar} disabled={!texto.trim() || enviando} aria-label="Enviar"
                        className={`mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40 ${nota ? 'bg-amber-500' : 'bg-primary'}`}>
                        {nota ? <Check className="h-5 w-5" /> : <Send className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </div>
                </div>
                <AnimatePresence>{info && conversa && <PainelContato dados={conversa} aoAgir={agir} aoFechar={() => setInfo(false)} />}</AnimatePresence>
              </div>
            </>
          )}
        </section>
      </div>
      <RespostasProntas aberto={prontas} aoFechar={() => setProntas(false)} aoEscolher={(t) => { setTexto(t); setProntas(false); setTimeout(() => campoRef.current?.focus(), 50) }} />
    </div>
  )
}
