import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Archive, ArchiveRestore, ArrowLeft, BellOff, Bell, Check, CheckCheck, ChevronDown, Copy, Download, FileDown, Info, Mail, MailOpen, MapPin,
  MessageSquareText, MessagesSquare, MoreVertical, Newspaper, Pin, PinOff, Plus, Reply, Search, Send, Smile, Star, StickyNote, Tag, Trash2, X, Zap,
} from 'lucide-react'
import { api, haQuanto } from '../api'
import { Aviso, Botao, Modal, useToast } from '../components/ui'

// Caixa de mensagens do site no formato de conversa: lista à esquerda (uma conversa por e-mail),
// conversa em balões à direita, respostas e notas internas, respostas prontas e painel do contato.
// Não há servidor de e-mail no sistema: "Responder" abre a mensagem pronta no e-mail de quem responde
// e registra a resposta na conversa.
const FILTROS = [['tudo', 'Tudo'], ['nao_lidas', 'Não lidas'], ['sem_resposta', 'Sem resposta'], ['favoritas', 'Favoritas'],
  ['contato', 'Contato'], ['novidades', 'Novidades'], ['respondidas', 'Respondidas']]
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

// Emojis por categoria + recentes (guardados neste navegador)
const EMOJIS = {
  Recentes: [],
  Rostos: ['😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎', '🤓', '🤗', '🤔', '😐', '😅', '😂', '🤣', '😇', '🙃', '😌', '😴', '😮', '😢', '😭', '😡', '🥶', '🥵', '😬', '🤝'], // marca: emojis do seletor (conteúdo que a pessoa escolhe)
  Gestos: ['👍', '👎', '👏', '🙌', '🙏', '👋', '✌️', '🤞', '👌', '🤙', '💪', '☝️', '👉', '👈', '👆', '👇', '✋', '🫶'], // marca: emojis do seletor (conteúdo que a pessoa escolhe)
  Clima: ['❄️', '🌡️', '☀️', '🌤️', '⛅', '🌧️', '⛈️', '🌬️', '💨', '💧', '🔥', '🌙', '⭐', '🌈', '🍃', '🌀'], // marca: emojis do seletor (conteúdo que a pessoa escolhe)
  Objetos: ['📞', '📱', '💻', '🖥️', '⌨️', '📅', '⏰', '⏱️', '🔧', '🔨', '🛠️', '💡', '🔌', '🔋', '📍', '📦', '📄', '📎', '✉️', '🧾', '💰', '🏢', '🏠', '🚗'], // marca: emojis do seletor (conteúdo que a pessoa escolhe)
  Símbolos: ['✅', '☑️', '✔️', '❌', '⚠️', '❗', '❓', '💬', '🔔', '🔕', '⭐', '❤️', '💙', '💚', '🎉', '🚀', '⬆️', '⬇️', '➡️', '🔁', '🆗', '🆕', '💯', '📌'], // marca: emojis do seletor (conteúdo que a pessoa escolhe)
}
const CHAVE_RECENTES = 'clima-emojis-recentes'
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao } catch { return padrao } }
const gravar = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem armazenamento */ } }
const chaveRascunho = (email) => `clima-rascunho:${email}`

function SeletorEmoji({ aoEscolher, aoFechar }) {
  const recentes = ler(CHAVE_RECENTES, [])
  const [aba, setAba] = useState(recentes.length ? 'Recentes' : 'Rostos')
  const ref = useRef(null)
  useEffect(() => {
    const fora = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest('[data-botao-emoji]')) aoFechar() }
    document.addEventListener('mousedown', fora); return () => document.removeEventListener('mousedown', fora)
  }, [aoFechar])
  const lista = aba === 'Recentes' ? recentes : EMOJIS[aba]
  const escolher = (e) => { gravar(CHAVE_RECENTES, [e, ...recentes.filter((x) => x !== e)].slice(0, 24)); aoEscolher(e) }
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 z-30 mb-2 w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-xl border border-border bg-card shadow-xl"> {/* marca: menu flutua */}
      <div className="flex border-b border-border">
        {Object.keys(EMOJIS).map((k) => (
          <button key={k} onClick={() => setAba(k)} className={`relative flex-1 py-2 text-[11px] font-medium ${aba === k ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
            {k}{aba === k && <motion.span layoutId="aba-emoji" className="absolute inset-x-2 bottom-0 h-0.5 rounded bg-primary" />}
          </button>
        ))}
      </div>
      <div className="grid h-52 grid-cols-8 content-start gap-0.5 overflow-y-auto p-2">
        {lista.length === 0 && <p className="col-span-8 py-8 text-center text-xs text-muted-foreground">Os emojis que você usar aparecem aqui.</p>}
        {lista.map((e) => <button key={e} onClick={() => escolher(e)} className="grid h-9 w-9 place-items-center rounded-md text-[22px] transition-transform hover:scale-110 hover:bg-muted">{e}</button>)} {/* marca: realce ao passar no emoji */}
      </div>
    </motion.div>
  )
}

function Menu({ itens, aoFechar, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const fora = (e) => { if (!ref.current?.contains(e.target)) aoFechar() }
    const esc = (e) => { if (e.key === 'Escape') aoFechar() }
    setTimeout(() => document.addEventListener('mousedown', fora))
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aoFechar])
  return (
    <motion.div ref={ref} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }} onClick={(e) => e.stopPropagation()}
      className={`absolute z-40 w-56 origin-top-right rounded-lg border border-border bg-card py-1.5 shadow-xl ${className}`}> {/* marca: menu flutua */}
      {itens.filter(Boolean).map(({ r, I, fn, perigo }) => (
        <button key={r} onClick={() => { aoFechar(); fn() }} className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted ${perigo ? 'text-red-600 dark:text-red-400' : ''}`}>
          <I className={`h-4 w-4 ${perigo ? '' : 'text-muted-foreground'}`} />{r}
        </button>
      ))}
    </motion.div>
  )
}

function itensDaConversa(c, aoAgir) {
  return [
    { r: c.fixada ? 'Desafixar' : 'Fixar no topo', I: c.fixada ? PinOff : Pin, fn: () => aoAgir(c.email, { fixada: !c.fixada }) },
    { r: c.favorita ? 'Tirar das favoritas' : 'Favoritar', I: Star, fn: () => aoAgir(c.email, { favorita: !c.favorita }) },
    { r: c.nao_lidas ? 'Marcar como lida' : 'Marcar como não lida', I: c.nao_lidas ? MailOpen : Mail, fn: () => aoAgir(c.email, { lida: !!c.nao_lidas }) },
    { r: c.silenciada ? 'Reativar avisos' : 'Silenciar avisos', I: c.silenciada ? Bell : BellOff, fn: () => aoAgir(c.email, { silenciada: !c.silenciada }) },
    { r: c.arquivada ? 'Desarquivar' : 'Arquivar', I: c.arquivada ? ArchiveRestore : Archive, fn: () => aoAgir(c.email, { arquivada: !c.arquivada }) },
    { r: 'Apagar conversa', I: Trash2, perigo: true, fn: () => aoAgir(c.email, null, 'apagar') },
  ]
}

function ItemConversa({ c, ativa, termo, aoAbrir, aoAgir, menu, setMenu }) {
  const naoLida = c.nao_lidas > 0
  const rascunho = !ativa && ler(chaveRascunho(c.email), '')
  return (
    <div role="button" tabIndex={0} onClick={() => aoAbrir(c.email)} onKeyDown={(e) => e.key === 'Enter' && aoAbrir(c.email)}
      className={`group relative flex cursor-pointer items-center gap-3 px-3 transition-colors ${ativa ? 'bg-muted' : 'hover:bg-muted/60'}`}>
      <Avatar nome={c.nome} email={c.email} tamanho="h-12 w-12 text-[15px]" />
      <div className="min-w-0 flex-1 border-b border-border/70 py-3 group-last:border-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-[16px] ${naoLida ? 'font-semibold' : ''}`}><Destacar texto={c.nome || c.email} termo={termo} /></p>
          <span className={`shrink-0 text-[12px] ${naoLida ? 'font-medium text-primary' : 'text-muted-foreground'}`}>{quandoCurto(c.ultimo.quando)}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {rascunho ? <p className="min-w-0 flex-1 truncate text-[14px]"><span className="font-medium text-primary">Rascunho: </span><span className="text-muted-foreground">{rascunho}</span></p> : <>
            {c.ultimo.de === 'admin' && <CheckCheck className="h-[18px] w-[18px] shrink-0 text-sky-500" />}
            {c.ultimo.de === 'nota' && <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
            {c.novidades && !c.contato && <Newspaper className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <p className={`min-w-0 flex-1 truncate text-[14px] ${naoLida ? 'text-foreground' : 'text-muted-foreground'}`}><Destacar texto={c.ultimo.texto} termo={termo} /></p>
          </>}
          {c.silenciada && <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
          {c.favorita && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
          {c.fixada && <Pin className="h-4 w-4 shrink-0 rotate-45 text-muted-foreground" />}
          {naoLida && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${c.silenciada ? 'bg-muted-foreground/50 text-background' : 'bg-primary text-primary-foreground'}`}>{c.nao_lidas}</motion.span>}
          <button onClick={(e) => { e.stopPropagation(); setMenu(menu === c.email ? null : c.email) }} aria-label="Opções da conversa"
            className={`-mr-1 shrink-0 overflow-hidden text-muted-foreground transition-all hover:text-foreground ${menu === c.email ? 'w-5' : 'w-0 group-hover:w-5 focus:w-5'}`}><ChevronDown className="h-5 w-5" /></button>
        </div>
        {c.etiquetas?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.etiquetas.slice(0, 3).map((e) => <span key={e} className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary">{e}</span>)}</div>}
      </div>
      {menu === c.email && <Menu itens={itensDaConversa(c, aoAgir)} aoFechar={() => setMenu(null)} className="right-3 top-12" />}
    </div>
  )
}

// "> trecho" no começo do texto vira o bloco de citação
function separarCitacao(texto = '') {
  const linhas = texto.split('\n')
  const cit = []
  while (linhas.length && linhas[0].startsWith('> ')) cit.push(linhas.shift().slice(2))
  if (cit.length && linhas[0] === '') linhas.shift()
  return { citacao: cit.join('\n'), corpo: linhas.join('\n') }
}

function Balao({ m, contato, termo, primeiro, assunto = true, aoApagar, aoCitar }) {
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  if (m.de === 'contato' && m.tipo === 'novidades' && !m.texto) {
    return <div className="my-2 flex justify-center"><span className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm"><Newspaper className="h-3.5 w-3.5" />{contato.nome || contato.email} se inscreveu nas novidades · {hora(m.quando)}</span></div> /* marca: aviso no fundo da conversa */
  }
  const meu = m.de !== 'contato', nota = m.de === 'nota'
  const { citacao, corpo } = separarCitacao(m.texto)
  const cor = nota ? 'balao-nota' : meu ? 'balao-meu' : 'balao-dele'
  const cauda = primeiro ? (meu ? 'cauda-meu rounded-tr-none' : 'cauda-dele rounded-tl-none') : ''
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className={`group flex ${meu ? 'justify-end' : 'justify-start'} ${primeiro ? 'mt-2.5' : 'mt-0.5'}`}>
      <div className={`relative max-w-[min(78%,620px)] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.45] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] ${cor} ${cauda}`}> {/* marca: balão de conversa */}
        <button onClick={() => setMenu((v) => !v)} aria-label="Opções da mensagem"
          className={`absolute right-1 top-1 z-10 rounded-full p-0.5 text-muted-foreground transition-opacity ${cor} ${menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><ChevronDown className="h-4 w-4" /></button>
        {menu && <Menu aoFechar={() => setMenu(false)} className={`top-7 w-48 ${meu ? 'right-0' : 'left-0'}`} itens={[
          !nota && { r: 'Responder citando', I: Reply, fn: () => aoCitar(m) },
          { r: 'Copiar texto', I: Copy, fn: () => { navigator.clipboard?.writeText(corpo || m.texto || ''); toast('Texto copiado.') } },
          meu && m.rid && { r: 'Apagar registro', I: Trash2, perigo: true, fn: () => aoApagar(m) },
        ]} />}
        {nota && <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-75"><StickyNote className="h-3 w-3" />Nota interna{m.autor ? ` · ${m.autor}` : ''}</p>}
        {m.de === 'admin' && m.autor && primeiro && <p className="mb-0.5 text-[12.5px] font-semibold text-primary">{m.autor}</p>}
        {!meu && primeiro && <p className="mb-0.5 text-[12.5px] font-semibold" style={{ color: corDe(contato.email) }}>{contato.nome || contato.email}</p>}
        {citacao && <div className="mb-1 rounded-md border-l-4 border-primary bg-black/5 px-2.5 py-1.5 text-[13px] text-muted-foreground dark:bg-white/5"><p className="line-clamp-3 whitespace-pre-wrap">{citacao}</p></div>}
        {m.assunto && assunto && <p className="mb-0.5 pr-5 font-semibold">{m.assunto}</p>}
        <p className="whitespace-pre-wrap break-words pr-1"><Destacar texto={corpo} termo={termo} />
          <span className="invisible inline-block w-[74px]" aria-hidden /></p>
        <span className={`absolute bottom-1 right-2 flex items-center gap-1 text-[11px] ${nota ? 'opacity-70' : 'text-muted-foreground'}`}>
          {hora(m.quando)}{m.de === 'admin' && <CheckCheck className="h-4 w-4 text-sky-500" />}
        </span>
      </div>
    </motion.div>
  )
}

const TRILHO = [['tudo', 'Conversas', MessagesSquare], ['nao_lidas', 'Não lidas', MailOpen], ['favoritas', 'Favoritas', Star], ['arquivadas', 'Arquivadas', Archive]]

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
  const [citar, setCitar] = useState(null)
  const [emoji, setEmoji] = useState(false)
  const [mais, setMais] = useState(false)
  const [menuTopo, setMenuTopo] = useState(false)
  const [menuLista, setMenuLista] = useState(false)
  const [prontas, setProntas] = useState(false)
  const [info, setInfo] = useState(false)
  const [menu, setMenu] = useState(null)
  const [buscaConversa, setBuscaConversa] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [noFim, setNoFim] = useState(true)
  const [novasAbaixo, setNovasAbaixo] = useState(0)
  const [divisor, setDivisor] = useState(null)     // { id, n } da 1ª não lida ao abrir
  const rolagemRef = useRef(null), buscaRef = useRef(null), campoRef = useRef(null), totalRef = useRef(0)

  const carregarLista = useCallback(async () => {
    try { setLista(await api.get(`/api/site/conversas?filtro=${filtro}&busca=${encodeURIComponent(busca)}`)); setErro('') } catch (e) { setErro(e.message) }
  }, [filtro, busca])
  const carregarConversa = useCallback(async (email, marcarLida = false) => {
    if (!email) return
    try {
      const d = await api.get(`/api/site/conversa?email=${encodeURIComponent(email)}`)
      setConversa(d)
      if (marcarLida) {
        const naoLidas = d.linha.filter((m) => m.de === 'contato' && !m.lida)
        setDivisor(naoLidas.length ? { id: naoLidas[0].id, n: naoLidas.length } : null)
        if (naoLidas.length) { await api.put(`/api/site/conversa?email=${encodeURIComponent(email)}`, { lida: true }); carregarLista() }
      }
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

  // rolagem: ao abrir vai para a 1ª não lida (ou o fim); mensagem nova só desce sozinha se já estava no fim
  const irParaFim = (suave = true) => { const el = rolagemRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? 'smooth' : 'auto' }); setNovasAbaixo(0) }
  useLayoutEffect(() => {
    const total = conversa?.linha?.length || 0
    const antes = totalRef.current
    totalRef.current = total
    if (!total) return
    if (antes === 0) {
      const alvo = divisor && document.getElementById('divisor-nao-lidas')
      if (alvo) alvo.scrollIntoView({ block: 'center' }); else irParaFim(false)
    } else if (total > antes) {
      if (noFim) irParaFim(); else setNovasAbaixo((n) => n + (total - antes))
    }
  }, [conversa?.linha?.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const aoRolar = (e) => {
    const el = e.currentTarget
    const fim = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setNoFim(fim); if (fim) setNovasAbaixo(0)
  }

  useEffect(() => {
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); buscaRef.current?.focus() }
      if (e.key === 'Escape' && !document.querySelector('[role=dialog]')) { if (citar) setCitar(null); else if (info) setInfo(false); else if (buscaConversa !== null) setBuscaConversa(null); else if (aberta) fechar() }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && lista?.itens?.length) {
        e.preventDefault()
        const i = lista.itens.findIndex((c) => c.email === aberta)
        const prox = lista.itens[Math.max(0, Math.min(lista.itens.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
        if (prox) abrir(prox.email)
      }
    }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  })

  const ajustarAltura = () => { const el = campoRef.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(144, el.scrollHeight)}px` } }
  const mudarTexto = (v) => { setTexto(v); if (aberta) gravar(chaveRascunho(aberta), v.trim() ? v : null) }
  const abrir = (email) => {
    totalRef.current = 0
    setAberta(email); setConversa(null); setNota(false); setCitar(null); setBuscaConversa(null); setEmoji(false); setDivisor(null); setNovasAbaixo(0); setNoFim(true)
    setTexto(ler(chaveRascunho(email), ''))
    setParams({ email }, { replace: true }); carregarConversa(email, true)
    setTimeout(() => { campoRef.current?.focus(); ajustarAltura() }, 200)
  }
  const fechar = () => { setAberta(null); setConversa(null); setInfo(false); setParams({}, { replace: true }); carregarLista() }
  const agir = async (email, mudanca, acao) => {
    try {
      if (acao === 'apagar') {
        if (!window.confirm('Apagar toda a conversa (mensagens, respostas e notas)? Não dá para desfazer.')) return
        await api.del(`/api/site/conversa?email=${encodeURIComponent(email)}`); gravar(chaveRascunho(email), null); toast('Conversa apagada.'); if (email === aberta) fechar()
      } else {
        await api.put(`/api/site/conversa?email=${encodeURIComponent(email)}`, mudanca)
        if (mudanca.arquivada !== undefined) toast(mudanca.arquivada ? 'Conversa arquivada.' : 'Conversa de volta à caixa de entrada.')
        if (mudanca.silenciada !== undefined) toast(mudanca.silenciada ? 'Avisos silenciados para esta conversa.' : 'Avisos reativados.')
        if (email === aberta) carregarConversa(email)
      }
      carregarLista()
    } catch (e) { toast(e.message, 'erro') }
  }
  const enviar = async () => {
    const corpo = texto.trim()
    if (!corpo || !conversa || enviando) return
    const final = citar ? `${separarCitacao(citar.texto).corpo.split('\n').slice(0, 3).map((l) => `> ${l}`).join('\n')}\n\n${corpo}` : corpo
    setEnviando(true)
    try {
      if (!nota) {
        const assunto = `Re: ${conversa.contato.assunto || 'sua mensagem pelo site'}`
        window.open(`mailto:${conversa.contato.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(final)}`, '_blank')
      }
      await api.post(`/api/site/conversa/responder?email=${encodeURIComponent(conversa.contato.email)}`, { texto: final, nota })
      setTexto(''); setEmoji(false); setCitar(null); gravar(chaveRascunho(conversa.contato.email), null)
      if (campoRef.current) campoRef.current.style.height = 'auto'
      setNoFim(true)
      toast(nota ? 'Nota interna salva.' : 'Resposta aberta no seu e-mail e registrada na conversa.')
      carregarConversa(conversa.contato.email); carregarLista()
    } catch (e) { toast(e.message, 'erro') } finally { setEnviando(false) }
  }
  const apagarResposta = async (m) => {
    if (!window.confirm('Apagar este registro da conversa? (Um e-mail já enviado não é desfeito.)')) return
    try { await api.del(`/api/site/conversa/resposta/${m.rid}`); carregarConversa(aberta); carregarLista() } catch (e) { toast(e.message, 'erro') }
  }
  const exportar = async () => { try { toast(`Arquivo salvo: ${await api.baixar('/api/site/mensagens/exportar')}`) } catch (e) { toast(e.message, 'erro') } }
  const exportarConversa = () => {
    if (!conversa) return
    const c = conversa.contato
    const linhas = conversa.linha.map((m) => `[${new Date(m.quando * 1000).toLocaleString('pt-BR')}] ${m.de === 'contato' ? (c.nome || c.email) : m.de === 'nota' ? `Nota interna${m.autor ? ` (${m.autor})` : ''}` : (m.autor || 'Equipe')}: ${m.assunto ? `${m.assunto} | ` : ''}${m.texto || '(inscrição nas novidades)'}`)
    const blob = new Blob([`Conversa com ${c.nome || ''} <${c.email}>\nExportada em ${new Date().toLocaleString('pt-BR')}\n\n${linhas.join('\n')}\n`], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `conversa-${c.email.replace(/[^a-z0-9]+/gi, '-')}.txt`; a.click(); URL.revokeObjectURL(a.href)
    toast('Conversa exportada.')
  }
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
  const ultimaDele = conversa?.linha?.filter((m) => m.de === 'contato').at(-1)
  const estadoConversa = conversa ? { ...conversa.estado, email: conversa.contato.email, nao_lidas: 0 } : null

  return (
    <div className="-mx-4 -mb-16 -mt-6 sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      <div className="relative flex h-[calc(100dvh-4rem)] overflow-hidden border-t border-border bg-background">
        {/* trilho de ícones */}
        <nav className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/40 py-3 md:flex" aria-label="Pastas">
          {TRILHO.map(([k, r, I]) => {
            const n = k === 'tudo' ? contagem.nao_lidas : k === 'nao_lidas' ? 0 : contagem[k]
            return (
              <button key={k} onClick={() => setFiltro(k)} title={r} aria-label={r}
                className={`relative grid h-10 w-10 place-items-center rounded-full transition-colors ${filtro === k ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
                <I className="h-5 w-5" />
                {n > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{n > 99 ? '99+' : n}</span>}
              </button>
            )
          })}
          <span className="my-2 h-px w-8 bg-border" />
          <button onClick={() => setProntas(true)} title="Respostas prontas" aria-label="Respostas prontas" className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><Zap className="h-5 w-5" /></button>
          <button onClick={exportar} title="Exportar todas (CSV)" aria-label="Exportar todas" className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-5 w-5" /></button>
        </nav>

        {/* lista de conversas */}
        <section className={`relative flex w-full shrink-0 flex-col border-r border-border bg-card md:w-[400px] ${aberta ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h1 className="text-[22px] font-semibold tracking-tight">{filtro === 'arquivadas' ? 'Arquivadas' : filtro === 'favoritas' ? 'Favoritas' : 'Conversas'}</h1>
            <div className="relative flex items-center gap-0.5">
              <button onClick={lerTodas} title="Marcar todas como lidas" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><CheckCheck className="h-5 w-5" /></button>
              <button onClick={() => setMenuLista((v) => !v)} title="Mais opções" aria-label="Mais opções" className={`rounded-full p-2 hover:bg-muted ${menuLista ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><MoreVertical className="h-5 w-5" /></button>
              {menuLista && <Menu aoFechar={() => setMenuLista(false)} className="right-0 top-10" itens={[
                { r: 'Respostas prontas', I: Zap, fn: () => setProntas(true) },
                { r: 'Marcar todas como lidas', I: CheckCheck, fn: lerTodas },
                { r: 'Arquivadas', I: Archive, fn: () => setFiltro('arquivadas') },
                { r: 'Exportar todas (CSV)', I: Download, fn: exportar },
              ]} />}
            </div>
          </div>
          <div className="px-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input ref={buscaRef} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar ou começar pelo nome (⌘K)"
                className="h-10 w-full rounded-lg border-0 bg-muted pl-10 pr-8 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2" aria-label="Pesquisar conversas" />
              {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-2.5 rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Limpar"><X className="h-4 w-4" /></button>}
            </label>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 sem-barra">
            {FILTROS.map(([k, r]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[13px] transition-colors ${filtro === k ? 'bg-primary/15 font-medium text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                {r}{contagem[k] > 0 && k !== 'tudo' && <span className="text-[11px] opacity-80">{contagem[k]}</span>}
              </button>
            ))}
          </div>
          {filtro !== 'arquivadas' && contagem.arquivadas > 0 && (
            <button onClick={() => setFiltro('arquivadas')} className="flex items-center gap-6 px-6 py-3 text-[15px] hover:bg-muted/60"><Archive className="h-5 w-5 text-primary" /><span className="flex-1 text-left font-medium">Arquivadas</span><span className="text-xs font-medium text-primary">{contagem.arquivadas}</span></button>
          )}
          {filtro === 'arquivadas' && <button onClick={() => setFiltro('tudo')} className="flex items-center gap-3 px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted/60"><ArrowLeft className="h-4 w-4" />Voltar para as conversas</button>}
          <div className="flex-1 overflow-y-auto pb-3">
            {erro && <div className="p-3"><Aviso>{erro}</Aviso></div>}
            {!lista && !erro && Array.from({ length: 7 }).map((_, i) => <div key={i} className="flex animate-pulse items-center gap-3 px-3 py-3"><span className="h-12 w-12 rounded-full bg-muted" /><span className="flex-1 space-y-2"><span className="block h-3 w-1/2 rounded bg-muted" /><span className="block h-3 w-3/4 rounded bg-muted" /></span></div>)}
            {lista?.itens.length === 0 && (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <MessagesSquare className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
                <p className="mt-3 text-sm font-medium">{busca ? 'Nada encontrado' : filtro === 'tudo' ? 'Nenhuma mensagem ainda' : 'Nada neste filtro'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{busca ? 'Tente outro nome, e-mail ou trecho da mensagem.' : 'O que chegar pelos formulários de Contato e Novidades do site aparece aqui, com aviso e som.'}</p>
              </div>
            )}
            {lista?.itens.map((c) => <ItemConversa key={c.email} c={c} ativa={c.email === aberta} termo={busca} aoAbrir={abrir} aoAgir={agir} menu={menu} setMenu={setMenu} />)}
            {lista?.itens.length > 0 && <p className="flex items-center justify-center gap-1.5 px-6 pt-6 text-center text-[11px] text-muted-foreground"><StickyNote className="h-3 w-3" />Notas internas ficam só no sistema; respostas saem pelo seu e-mail.</p>}
          </div>
        </section>

        {/* conversa */}
        <section className={`relative min-w-0 flex-1 flex-col ${aberta ? 'flex' : 'hidden md:flex'}`}>
          {!aberta ? (
            <div className="flex flex-1 flex-col items-center justify-center border-b-[6px] border-primary bg-muted/40 px-8 text-center">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="grid h-24 w-24 place-items-center rounded-full bg-primary/10"><MessageSquareText className="h-11 w-11 text-primary" strokeWidth={1.4} /></motion.div>
              <h2 className="mt-6 text-[28px] font-light">Mensagens do site</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">Leia e responda quem escreveu pelo site. As respostas abrem no seu e-mail e ficam registradas na conversa; notas internas só a equipe vê.</p>
              <div className="mt-8 flex flex-wrap justify-center gap-2 text-[11px] text-muted-foreground">
                {[['⌘K', 'pesquisar'], ['Alt ↑ ↓', 'trocar de conversa'], ['Enter', 'enviar'], ['Esc', 'fechar']].map(([k, r]) => <span key={k}><kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-sans">{k}</kbd> {r}</span>)}
              </div>
            </div>
          ) : (
            <>
              <header className="relative z-20 flex items-center gap-3 border-b border-border bg-card px-3 py-2">
                <button onClick={fechar} className="rounded-full p-1.5 hover:bg-muted md:hidden" aria-label="Voltar"><ArrowLeft className="h-5 w-5" /></button>
                {conversa ? (
                  <button onClick={() => setInfo(true)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar nome={conversa.contato.nome} email={conversa.contato.email} tamanho="h-10 w-10 text-sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-[16px]">{conversa.contato.nome || conversa.contato.email}</span>
                      <span className="block truncate text-xs text-muted-foreground">{ultimaDele ? `escreveu ${haQuanto(ultimaDele.quando)}` : conversa.contato.email}{conversa.contato.cidade ? ` · ${conversa.contato.cidade}` : ''} · clique para ver os dados</span>
                    </span>
                  </button>
                ) : <span className="flex flex-1 items-center gap-3"><span className="h-10 w-10 animate-pulse rounded-full bg-muted" /><span className="h-3 w-40 animate-pulse rounded bg-muted" /></span>}
                <button onClick={() => setBuscaConversa(buscaConversa === null ? '' : null)} title="Pesquisar na conversa" className={`rounded-full p-2 hover:bg-muted ${buscaConversa !== null ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><Search className="h-5 w-5" /></button>
                <div className="relative">
                  <button onClick={() => setMenuTopo((v) => !v)} title="Mais opções" aria-label="Mais opções" className={`rounded-full p-2 hover:bg-muted ${menuTopo ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><MoreVertical className="h-5 w-5" /></button>
                  {menuTopo && estadoConversa && <Menu aoFechar={() => setMenuTopo(false)} className="right-0 top-11" itens={[
                    { r: 'Dados do contato', I: Info, fn: () => setInfo(true) },
                    ...itensDaConversa(estadoConversa, agir).slice(0, 2),
                    { r: 'Marcar como não lida', I: Mail, fn: () => { agir(conversa.contato.email, { lida: false }); fechar() } },
                    ...itensDaConversa(estadoConversa, agir).slice(3, 5),
                    { r: 'Exportar conversa (.txt)', I: FileDown, fn: exportarConversa },
                    { r: 'Fechar conversa', I: X, fn: fechar },
                    itensDaConversa(estadoConversa, agir)[5],
                  ]} />}
                </div>
              </header>
              <AnimatePresence>
                {buscaConversa !== null && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="relative z-10 overflow-hidden border-b border-border bg-card">
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
                <div className="relative flex min-w-0 flex-1 flex-col">
                  <div ref={rolagemRef} onScroll={aoRolar} className="fundo-conversa flex-1 overflow-y-auto px-4 pb-3 pt-2 sm:px-[7%]">
                    {!conversa ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando a conversa…</p> : (
                      <>
                        <div className="mx-auto my-3 flex max-w-md items-start gap-2 rounded-lg bg-amber-100 px-3 py-2 text-left text-[12px] leading-snug text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />Mensagens vindas dos formulários do site. Respostas saem pelo seu e-mail; notas internas ficam só no sistema.
                        </div>
                        {linhaFiltrada.map((m, i) => {
                          const ant = linhaFiltrada[i - 1]
                          const novoDia = i === 0 || dia(m.quando) !== dia(ant.quando)
                          const temDivisor = divisor && m.id === divisor.id && !buscaConversa
                          const primeiro = novoDia || temDivisor || !ant || ant.de !== m.de || m.quando - ant.quando > 300
                          return (
                            <div key={m.id}>
                              {novoDia && <div className="sticky top-1 z-10 my-3 flex justify-center"><span className="rounded-lg bg-card px-3 py-1 text-[12.5px] capitalize text-muted-foreground shadow-sm">{separador(m.quando)}</span></div>} {/* marca: rótulo de data flutua sobre a conversa */}
                              {temDivisor && <div id="divisor-nao-lidas" className="-mx-4 my-3 bg-card/70 py-1.5 text-center text-[12.5px] font-medium text-primary sm:-mx-[7.5%]">{divisor.n} {divisor.n === 1 ? 'mensagem não lida' : 'mensagens não lidas'}</div>}
                              <Balao m={m} contato={conversa.contato} termo={buscaConversa} primeiro={primeiro} aoApagar={apagarResposta}
                                assunto={m.assunto !== linhaFiltrada.slice(0, i).reverse().find((x) => x.de === 'contato' && x.assunto)?.assunto}
                                aoCitar={(x) => { setCitar(x); setNota(false); setTimeout(() => campoRef.current?.focus(), 30) }} />
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                  <AnimatePresence>
                    {!noFim && conversa && (
                      <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} onClick={() => irParaFim()} aria-label="Ir para a última mensagem"
                        className="absolute bottom-[88px] right-5 z-10 grid h-11 w-11 place-items-center rounded-full bg-card text-muted-foreground shadow-lg hover:text-foreground"> {/* marca: botão flutua */}
                        <ChevronDown className="h-6 w-6" />
                        {novasAbaixo > 0 && <span className="absolute -top-1.5 left-1/2 flex h-5 min-w-5 -translate-x-1/2 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{novasAbaixo}</span>}
                      </motion.button>
                    )}
                  </AnimatePresence>
                  {/* compositor */}
                  <div className="border-t border-border bg-muted/50 px-3 py-2">
                    <AnimatePresence>
                      {citar && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <div className="mb-2 flex items-start gap-2 rounded-lg bg-card p-2">
                            <div className="min-w-0 flex-1 rounded-md border-l-4 border-primary bg-muted/60 px-2.5 py-1.5">
                              <p className="text-[12.5px] font-semibold text-primary">{citar.de === 'contato' ? (conversa?.contato.nome || conversa?.contato.email) : 'Você'}</p>
                              <p className="line-clamp-2 text-[13px] text-muted-foreground">{separarCitacao(citar.texto).corpo || citar.assunto}</p>
                            </div>
                            <button onClick={() => setCitar(null)} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Cancelar citação"><X className="h-4 w-4" /></button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {nota && <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"><StickyNote className="h-3.5 w-3.5" /><span className="flex-1">Nota interna: só a equipe vê, não vai para o contato.</span><button onClick={() => setNota(false)} className="font-medium underline-offset-2 hover:underline">Voltar para resposta</button></div>}
                    <div className="relative flex items-end gap-1.5">
                      <AnimatePresence>{emoji && <SeletorEmoji aoFechar={() => setEmoji(false)} aoEscolher={(e) => { const el = campoRef.current; const p = el?.selectionStart ?? texto.length; mudarTexto(texto.slice(0, p) + e + texto.slice(p)); setTimeout(() => { el?.focus(); el?.setSelectionRange(p + e.length, p + e.length) }) }} />}</AnimatePresence>
                      <div className="relative">
                        <button onClick={() => setMais((v) => !v)} title="Anexar ação" aria-label="Mais ações" className={`grid h-10 w-10 place-items-center rounded-full transition-transform hover:bg-muted ${mais ? 'rotate-45 text-foreground' : 'text-muted-foreground'}`}><Plus className="h-6 w-6" /></button>
                        {mais && <Menu aoFechar={() => setMais(false)} className="bottom-12 left-0 origin-bottom-left" itens={[
                          { r: 'Respostas prontas', I: Zap, fn: () => setProntas(true) },
                          { r: nota ? 'Escrever resposta' : 'Nota interna', I: nota ? Mail : StickyNote, fn: () => { setNota(!nota); setCitar(null); campoRef.current?.focus() } },
                          { r: 'Exportar conversa', I: FileDown, fn: exportarConversa },
                        ]} />}
                      </div>
                      <div className={`flex min-h-[42px] flex-1 items-end rounded-lg ${nota ? 'bg-amber-50 ring-1 ring-amber-400/50 dark:bg-amber-500/10' : 'bg-card'}`}>
                        <button data-botao-emoji onClick={() => setEmoji((v) => !v)} title="Emojis" aria-label="Emojis" className={`grid h-[42px] w-10 shrink-0 place-items-center ${emoji ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}><Smile className="h-[22px] w-[22px]" /></button>
                        <textarea ref={campoRef} rows={1} value={texto} maxLength={5000}
                          onChange={(e) => { mudarTexto(e.target.value); ajustarAltura() }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                          placeholder={nota ? 'Escreva uma nota que só a equipe vê' : 'Digite uma mensagem'}
                          className="max-h-36 min-h-[42px] flex-1 resize-none border-0 bg-transparent py-2.5 pr-3 text-[15px] shadow-none outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground" aria-label="Mensagem" />
                      </div>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={texto.trim() ? enviar : () => setProntas(true)} disabled={enviando} aria-label={texto.trim() ? 'Enviar' : 'Respostas prontas'} title={texto.trim() ? 'Enviar (Enter)' : 'Respostas prontas'}
                        className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full transition-colors disabled:opacity-50 ${texto.trim() ? (nota ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground') : 'text-muted-foreground hover:bg-muted'}`}>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span key={texto.trim() ? (nota ? 'n' : 's') : 'z'} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.12 }}>
                            {texto.trim() ? (nota ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />) : <Zap className="h-[22px] w-[22px]" />}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    </div>
                  </div>
                </div>
                <AnimatePresence>{info && conversa && <PainelContato dados={conversa} aoAgir={agir} aoFechar={() => setInfo(false)} />}</AnimatePresence>
              </div>
            </>
          )}
        </section>
      </div>
      <RespostasProntas aberto={prontas} aoFechar={() => setProntas(false)} aoEscolher={(t) => { mudarTexto(t); setProntas(false); setTimeout(() => { campoRef.current?.focus(); ajustarAltura() }, 50) }} />
    </div>
  )
}
