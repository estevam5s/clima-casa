import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ArchiveRestore, Check, CheckCheck, Copy, Download, ExternalLink, Inbox, Mail, MailOpen, MapPin, Reply, Search, Trash2, X } from 'lucide-react'
import { api, dataHora, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Vazio, useDados, useToast } from '../components/ui'
import { SITE_URL } from '../site'

const FILTROS = [['entrada', 'Entrada'], ['nao_lidas', 'Não lidas'], ['contato', 'Contato'], ['novidades', 'Novidades'], ['respondidas', 'Respondidas'], ['arquivadas', 'Arquivadas']]
const iniciais = (n, e) => ((n || e || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase()

function Detalhe({ m, aoMudar, aoFechar }) {
  const toast = useToast()
  const [notas, setNotas] = useState(m.notas || '')
  useEffect(() => setNotas(m.notas || ''), [m.id, m.notas])
  const mudar = async (campos, msg) => {
    try { await api.put(`/api/site/mensagens/${m.id}`, campos); if (msg) toast(msg); aoMudar() } catch (e) { toast(e.message, 'erro') }
  }
  const apagar = async () => {
    if (!window.confirm('Apagar esta mensagem de vez? Não dá para desfazer.')) return
    try { await api.del(`/api/site/mensagens/${m.id}`); toast('Mensagem apagada.'); aoFechar(); aoMudar() } catch (e) { toast(e.message, 'erro') }
  }
  const assunto = m.tipo === 'novidades' ? 'Novidades do Clima Escritório' : `Re: ${m.assunto || 'sua mensagem pelo site'}`
  const corpo = m.tipo === 'contato' ? `\n\n---\nEm ${dataHora(m.quando)}, ${m.nome} escreveu:\n> ${m.mensagem.replace(/\n/g, '\n> ')}` : ''
  const mailto = `mailto:${m.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`
  return (
    <motion.div key={m.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="flex h-full flex-col">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{iniciais(m.nome, m.email)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{m.nome || 'Sem nome'}</p>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="truncate">{m.email}</span>
            <button onClick={() => { navigator.clipboard?.writeText(m.email); toast('E-mail copiado.') }} className="rounded p-1 hover:bg-muted" aria-label="Copiar e-mail"><Copy className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <button onClick={aoFechar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{dataHora(m.quando)} · {haQuanto(m.quando)}</span>
          {(m.cidade || m.pais) && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{[m.cidade, m.pais].filter(Boolean).join(', ')}</span>}
          <span className={`rounded px-1.5 py-0.5 font-medium ${m.tipo === 'contato' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>{m.tipo === 'contato' ? 'Contato' : 'Inscrição em novidades'}</span>
          {m.respondida && <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><Check className="h-3 w-3" />respondida</span>}
        </div>
        {m.tipo === 'contato' ? (
          <div>
            {m.assunto && <h2 className="mb-2 text-lg font-semibold">{m.assunto}</h2>}
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.mensagem}</p>
          </div>
        ) : <p className="text-[15px]">Esta pessoa pediu para receber as novidades do sistema pelo formulário do rodapé do site.</p>}
        <div>
          <label className="rotulo" htmlFor="notas">Notas internas</label>
          <textarea id="notas" className="campo min-h-[90px]" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} placeholder="Só você vê. Ex.: liguei dia 15, retornar na sexta." />
          {notas !== (m.notas || '') && <div className="mt-2 flex justify-end"><Botao tamanho="sm" onClick={() => mudar({ notas }, 'Notas salvas.')}>Salvar notas</Botao></div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border p-4">
        <a href={mailto} onClick={() => !m.respondida && mudar({ respondida: true })}><Botao tamanho="sm" icone={Reply}>Responder por e-mail</Botao></a>
        <Botao tamanho="sm" variante="secundario" icone={m.respondida ? X : Check} onClick={() => mudar({ respondida: !m.respondida }, m.respondida ? 'Marcada como não respondida.' : 'Marcada como respondida.')}>{m.respondida ? 'Não respondida' : 'Respondida'}</Botao>
        <Botao tamanho="sm" variante="secundario" icone={m.lida ? Mail : MailOpen} onClick={() => mudar({ lida: !m.lida })}>{m.lida ? 'Não lida' : 'Lida'}</Botao>
        <Botao tamanho="sm" variante="secundario" icone={m.arquivada ? ArchiveRestore : Archive} onClick={() => mudar({ arquivada: !m.arquivada }, m.arquivada ? 'Voltou para a entrada.' : 'Arquivada.')}>{m.arquivada ? 'Desarquivar' : 'Arquivar'}</Botao>
        <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={apagar} className="ml-auto text-red-600 dark:text-red-400">Apagar</Botao>
      </div>
    </motion.div>
  )
}

export default function Mensagens() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filtro, setFiltro] = useState('entrada')
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [marcadas, setMarcadas] = useState([])
  const selecionada = Number(params.get('id')) || null
  useEffect(() => { const t = setTimeout(() => setBuscaAtiva(busca), 300); return () => clearTimeout(t) }, [busca])
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/site/mensagens?filtro=${filtro}&busca=${encodeURIComponent(buscaAtiva)}`), [filtro, buscaAtiva])
  useEffect(() => { const t = setInterval(recarregar, 30000); return () => clearInterval(t) }, [recarregar])
  const itens = dados?.itens || []
  const c = dados?.contagem || {}
  const atual = useMemo(() => itens.find((m) => m.id === selecionada) || null, [itens, selecionada])
  // abrir marca como lida
  useEffect(() => {
    if (atual && !atual.lida) api.put(`/api/site/mensagens/${atual.id}`, { lida: true }).then(recarregar).catch(() => {})
  }, [atual?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const abrir = (id) => setParams(id ? { id: String(id) } : {})
  const alternar = (id) => setMarcadas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]))
  const lote = async (acao) => {
    if (acao === 'apagar' && !window.confirm(`Apagar ${marcadas.length} mensagem(ns) de vez?`)) return
    try { await api.post('/api/site/mensagens/lote', { ids: marcadas, acao }); setMarcadas([]); toast('Pronto.'); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  const exportar = async () => { try { toast(`Arquivo salvo: ${await api.baixar('/api/site/mensagens/exportar')}`) } catch (e) { toast(e.message, 'erro') } }

  return (
    <>
      <Cabecalho titulo="Mensagens do site" descricao="O que chega pelo formulário de contato e pela inscrição de novidades do site."
        acoes={<>
          <a href={`${SITE_URL}/contato`} target="_blank" rel="noreferrer"><Botao variante="secundario" icone={ExternalLink}>Ver formulário</Botao></a>
          <Botao variante="secundario" icone={Download} onClick={exportar}>Exportar CSV</Botao>
        </>} />
      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-[480px]" /></div>}
      {dados && (
        <div className="grid gap-6">
          <FaixaMetricas itens={[
            { rotulo: 'Na entrada', valor: c.entrada, dica: `${c.nao_lidas} não lida(s)`, tom: c.nao_lidas ? 'ruim' : 'bom' },
            { rotulo: 'Pedidos de contato', valor: c.contato, dica: `${c.respondidas} respondida(s) no total` },
            { rotulo: 'Inscritos em novidades', valor: c.inscritos, dica: 'e-mails únicos' },
            { rotulo: 'Últimos 7 dias', valor: c.semana, dica: `${c.arquivadas} arquivada(s)` },
          ]} />

          <section className="cartao overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
              <div className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                {FILTROS.map(([k, r]) => (
                  <button key={k} onClick={() => { setFiltro(k); setMarcadas([]) }} className={`relative flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm ${filtro === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                    {filtro === k && <motion.span layoutId="filtro-msg" className="absolute inset-0 rounded-md bg-background" transition={{ type: 'spring', duration: 0.3 }} />}
                    <span className="relative">{r}</span><span className="relative text-xs tabular text-muted-foreground">{c[k] ?? 0}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou texto" className="campo h-9 pl-8 text-sm" aria-label="Buscar mensagens" />
              </label>
            </div>
            <AnimatePresence>
              {marcadas.length > 0 && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-border bg-muted/50">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <span className="font-medium">{marcadas.length} selecionada(s)</span>
                    <Botao tamanho="sm" variante="secundario" icone={CheckCheck} onClick={() => lote('lida')}>Lidas</Botao>
                    <Botao tamanho="sm" variante="secundario" icone={Mail} onClick={() => lote('nao_lida')}>Não lidas</Botao>
                    <Botao tamanho="sm" variante="secundario" icone={filtro === 'arquivadas' ? ArchiveRestore : Archive} onClick={() => lote(filtro === 'arquivadas' ? 'desarquivar' : 'arquivar')}>{filtro === 'arquivadas' ? 'Desarquivar' : 'Arquivar'}</Botao>
                    <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => lote('apagar')} className="text-red-600 dark:text-red-400">Apagar</Botao>
                    <button onClick={() => setMarcadas([])} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Limpar seleção</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="grid min-h-[520px] lg:grid-cols-[minmax(320px,420px)_1fr]">
              <ul className={`divide-y divide-border overflow-y-auto lg:max-h-[640px] lg:border-r lg:border-border ${atual ? 'hidden lg:block' : ''}`}>
                {itens.length === 0 && <li className="p-6"><Vazio icone={Inbox} titulo={buscaAtiva ? 'Nada encontrado' : 'Nenhuma mensagem aqui'} texto={buscaAtiva ? 'Tente outra palavra.' : 'Quando alguém usar o formulário do site, a mensagem aparece nesta lista e no sino de notificações.'} /></li>}
                {itens.map((m) => (
                  <li key={m.id} className={`group flex cursor-pointer gap-3 px-4 py-3 transition-colors ${selecionada === m.id ? 'bg-muted' : 'hover:bg-muted/50'}`} onClick={() => abrir(m.id)}>
                    <input type="checkbox" checked={marcadas.includes(m.id)} onChange={() => alternar(m.id)} onClick={(e) => e.stopPropagation()} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" aria-label={`Selecionar mensagem de ${m.nome || m.email}`} />
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${m.tipo === 'contato' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>{iniciais(m.nome, m.email)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={`flex-1 truncate text-sm ${m.lida ? 'text-muted-foreground' : 'font-semibold'}`}>{m.nome || m.email}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{haQuanto(m.quando)}</span>
                      </div>
                      <p className={`truncate text-sm ${m.lida ? 'text-muted-foreground' : ''}`}>{m.tipo === 'contato' ? (m.assunto || 'Sem assunto') : 'Quer receber as novidades'}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.tipo === 'contato' ? m.mensagem : m.email}</p>
                    </div>
                    {!m.lida && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />}
                  </li>
                ))}
              </ul>
              <div className={`${atual ? '' : 'hidden lg:flex'} min-h-[520px] lg:max-h-[640px]`}>
                {atual ? <div className="w-full"><Detalhe m={atual} aoMudar={recarregar} aoFechar={() => abrir(null)} /></div> : (
                  <div className="flex w-full flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
                    <Mail className="h-8 w-8" /><p className="text-sm">Escolha uma mensagem para ler, responder e anotar.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
