import { useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import {
  AirVent, BarChart3, Building2, CalendarClock, Check, ChevronDown, Copy, Download, Snowflake, FolderKanban, Home, LayoutGrid, List, Map as MapaIcone, MapPin, MoreHorizontal,
  Pencil, Plus, Power, Radio, Search, Sparkles, Stethoscope, Store, Trash2, User, Users, Workflow, WifiOff,
} from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Modal, NumeroAnimado, Vazio, useDados, useToast } from '../components/ui'
import { devePuxar } from '../ocioso'

const CORES = ['#0f766a', '#2563a8', '#c2410c', '#7c3aed', '#be123c', '#4d7c0f', '#0e7490', '#52525b']
const TIPOS = { escritorio: ['Escritório', Building2], sala: ['Sala', LayoutGrid], casa: ['Casa', Home], loja: ['Loja', Store], consultorio: ['Consultório', Stethoscope], outro: ['Outro', FolderKanban] }
const ORDENS = [['nome', 'Nome'], ['ligados', 'Mais ligados'], ['custo', 'Maior custo no mês'], ['uso', 'Mais usados (14 dias)']]
// transmissor da sala: infravermelho não atravessa parede, então sala fechada que obedece sozinha precisa do seu
const TX = {
  proprio: ['Transmissor próprio', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'],
  dividido: ['Divide transmissor', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'],
  parcial: ['Ar sem transmissor', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'],
  sem: ['Sem transmissor', 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'],
}
function SeloTx({ p }) {
  const t = TX[p.tx_estado]
  if (!t) return null
  const dica = p.tx_estado === 'dividido' ? 'O transmissor desta sala também atende outra sala: ares iguais que ele alcança mudam juntos.'
    : p.ares_sem_transmissor?.length ? `Sem transmissor: ${p.ares_sem_transmissor.join(', ')}` : 'Os ares desta sala têm transmissor só deles.'
  return <span title={dica} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${t[1]}`}><Radio className="h-3 w-3" />{t[0]}</span>
}
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ler = (k, p) => { try { return localStorage.getItem(k) || p } catch { return p } }

function Form({ inicial, aoSalvar, onFechar }) {
  const [f, setF] = useState({
    nome: inicial?.nome || '', descricao: inicial?.descricao || '', endereco: inicial?.endereco || '', cor: inicial?.cor || CORES[0],
    tipo: inicial?.tipo || 'escritorio', responsavel: inicial?.responsavel || '', meta_custo_mes: inicial?.meta_custo_mes ? String(inicial.meta_custo_mes).replace('.', ',') : '',
  })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const enviar = async (e) => {
    e.preventDefault(); setSalvando(true)
    try { await aoSalvar({ ...f, meta_custo_mes: Number(String(f.meta_custo_mes || '0').replace(',', '.')) || 0 }); onFechar() } catch (err) { setErro(err.message) } finally { setSalvando(false) }
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div>
        <span className="rotulo">Tipo de lugar</span>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TIPOS).map(([k, [r, I]]) => (
            <button type="button" key={k} onClick={() => setF({ ...f, tipo: k })} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${f.tipo === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}><I className="h-4 w-4" />{r}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="rotulo" htmlFor="pn">Nome</label><input id="pn" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Sala Bancada, Recepção…" required maxLength={60} /></div>
        <div><label className="rotulo" htmlFor="pr">Responsável</label><input id="pr" className="campo" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} placeholder="Quem cuida deste lugar" maxLength={80} /></div>
      </div>
      <div><label className="rotulo" htmlFor="pe">Endereço</label><input id="pe" className="campo" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Usado também para a temperatura de fora" maxLength={120} /></div>
      <div><label className="rotulo" htmlFor="pd">Descrição</label><input id="pd" className="campo" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Opcional" maxLength={200} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="rotulo" htmlFor="pm">Meta de gasto por mês</label>
          <div className="flex items-center rounded-lg border border-border bg-card pl-3 focus-within:ring-2 focus-within:ring-primary/40"><span className="text-sm text-muted-foreground">R$</span>
            <input id="pm" inputMode="decimal" className="w-full bg-transparent px-2 py-2 text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0" value={f.meta_custo_mes} onChange={(e) => setF({ ...f, meta_custo_mes: e.target.value.replace(/[^\d,.]/g, '') })} placeholder="0 = sem meta" /></div>
          <p className="ajuda">O card avisa quando a projeção do mês passa da meta.</p>
        </div>
        <div>
          <span className="rotulo">Cor</span>
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button type="button" key={c} onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`}
                className={`grid h-8 w-8 place-items-center rounded-lg transition-transform ${f.cor === c ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}`} style={{ background: c }}>{f.cor === c && <Check className="h-4 w-4 text-white" />}</button>
            ))}
          </div>
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit" carregando={salvando}>Salvar projeto</Botao></div>
    </form>
  )
}

function Menu({ itens, aoFechar }) {
  const ref = useRef(null)
  useEffect(() => {
    const fora = (e) => { if (!ref.current?.contains(e.target)) aoFechar() }
    setTimeout(() => document.addEventListener('mousedown', fora)); return () => document.removeEventListener('mousedown', fora)
  }, [aoFechar])
  return (
    <motion.div ref={ref} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.12 }}
      className="absolute right-0 top-9 z-30 w-52 origin-top-right rounded-lg border border-border bg-card py-1.5 shadow-xl"> {/* marca: menu flutua */}
      {itens.filter(Boolean).map(({ r, I, fn, perigo }) => (
        <button key={r} onClick={() => { aoFechar(); fn() }} className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-muted ${perigo ? 'text-red-600 dark:text-red-400' : ''}`}><I className="h-4 w-4 opacity-70" />{r}</button>
      ))}
    </motion.div>
  )
}

function Meta({ p }) {
  if (!p.meta_custo_mes) return <p className="text-xs text-muted-foreground">Gasto estimado no mês: <span className="font-medium text-foreground">{brl(p.custo_mes)}</span> · projeção {brl(p.projecao_mes)}</p>
  const pct = (p.projecao_mes / p.meta_custo_mes) * 100
  const cor = pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-muted-foreground">Projeção do mês <span className="font-medium text-foreground">{brl(p.projecao_mes)}</span></span><span className={pct > 100 ? 'font-medium text-red-600' : 'text-muted-foreground'}>meta {brl(p.meta_custo_mes)}</span></div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={`h-full rounded-full ${cor}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.7 }} /></div>
    </div>
  )
}

// anel de ares ligados (anima ao mudar)
function Anel({ ligados, total, cor }) {
  const r = 17, c = 2 * Math.PI * r, frac = total ? ligados / total : 0
  return (
    <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0 -rotate-90" role="img" aria-label={`${ligados} de ${total} ares ligados`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
      <motion.circle cx="22" cy="22" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={c}
        initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - frac) }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <text x="22" y="22" transform="rotate(90 22 22)" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[11px] font-semibold">{ligados}/{total}</text>
    </svg>
  )
}

// todos os ares do projeto, com liga/desliga direto (abre ao tocar em "Ver todos")
function AresDoProjeto({ p, aoMudar }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(null)
  const alternar = async (a) => {
    setOcupado(a.id)
    try { await api.post(`/api/aparelhos/${a.id}/estado`, { ligado: !a.ligado }); aoMudar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  return (
    <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
      {p.aparelhos.map((a, i) => (
        <motion.li key={a.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-2 py-1.5 text-sm">
          <span className={`h-2 w-2 shrink-0 rounded-full ${a.ligado ? 'bg-sky-500' : 'bg-muted-foreground/30'}`} />
          <span className="min-w-0 flex-1 truncate">{a.nome}</span>
          <span className="text-xs tabular text-muted-foreground">{a.ligado ? `${a.temperatura}°` : 'desligado'}</span>
          <button onClick={() => alternar(a)} disabled={ocupado === a.id || !a.hub_online && !a.ligado} title={!a.hub_online ? 'Transmissor offline' : undefined}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${a.ligado ? 'bg-sky-500' : 'bg-muted'}`} aria-label={`${a.ligado ? 'Desligar' : 'Ligar'} ${a.nome}`}>
            <motion.span layout className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow ${a.ligado ? 'left-[18px]' : 'left-0.5'}`} /> {/* marca: botão de liga flutua */}
          </button>
        </motion.li>
      ))}
    </motion.ul>
  )
}

// mapa de calor: comandos por dia (14 dias) em cada sala
function MapaCalor({ dados, aoAbrir }) {
  const reduzir = useReducedMotion()
  const max = Math.max(1, ...dados.flatMap((p) => p.serie.map((s) => s.comandos)))
  const hoje = new Date()
  const dias = Array.from({ length: 14 }, (_, i) => { const d = new Date(hoje); d.setDate(d.getDate() - 13 + i); return d })
  return (
    <section className="cartao mb-5 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="titulo-secao">Uso nos últimos 14 dias</h2>
        <p className="text-xs text-muted-foreground">Cada quadrado é um dia; quanto mais forte, mais comandos naquela sala</p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-1 text-xs">
          <thead><tr><th className="w-36" />{dias.map((d, i) => <th key={i} className="font-normal text-muted-foreground">{i % 2 === 0 ? d.getDate() : ''}</th>)}<th className="w-12 text-right font-normal text-muted-foreground">total</th></tr></thead>
          <tbody>{dados.map((p, li) => (
            <tr key={p.id}>
              <td><button onClick={() => aoAbrir(p)} className="max-w-36 truncate text-left font-medium hover:text-primary">{p.nome}</button></td>
              {p.serie.map((s, i) => (
                <td key={i} className="p-0">
                  <motion.div initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduzir ? 0 : li * 0.04 + i * 0.015 }}
                    className="h-5 rounded-[4px]" title={`${dias[i].toLocaleDateString('pt-BR')}: ${s.comandos} comando(s)${s.falhas ? `, ${s.falhas} falha(s)` : ''}`}
                    style={{ background: s.comandos ? p.cor : 'hsl(var(--muted))', opacity: s.comandos ? 0.25 + 0.75 * (s.comandos / max) : 1, outline: s.falhas ? '1.5px solid rgb(239 68 68)' : undefined }} />
                </td>
              ))}
              <td className="text-right tabular-nums text-muted-foreground">{p.comandos_14d}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Contorno vermelho = dia com falha de comando.</p>
    </section>
  )
}

// estado agora: climatizando (média das temperaturas dos ligados, com ondas) ou tudo desligado
function EstadoAgora({ p, ligados, reduzir }) {
  if (!p.aparelhos.length) return null
  const lig = p.aparelhos.filter((a) => a.ligado && a.temperatura)
  const media = lig.length ? Math.round(lig.reduce((s, a) => s + a.temperatura, 0) / lig.length) : null
  if (!ligados) return <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"><Power className="h-3 w-3" />Tudo desligado</span>
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>{[0, 1, 2].map((k) => <motion.span key={k} className="w-[2px] rounded-full bg-current" animate={reduzir ? { height: 8 } : { height: [4, 11, 4] }} transition={{ repeat: Infinity, duration: 1.1, delay: k * 0.18 }} />)}</span>
      Climatizando{media ? ` · média ${media}°` : ''}
    </span>
  )
}

function Cartao({ p, i, atual, acoes }) {
  const reduzir = useReducedMotion()
  const [menu, setMenu] = useState(false)
  const [todos, setTodos] = useState(false)
  const ligados = p.aparelhos.filter((a) => a.ligado).length
  const offline = p.transmissores.filter((h) => !h.online)
  const [tipoRot, TipoI] = TIPOS[p.tipo] || TIPOS.outro
  const temSerie = p.serie.some((s) => s.comandos)
  return (
    <motion.article layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: i * 0.04, type: 'spring', stiffness: 260, damping: 26 }}
      whileHover={reduzir ? undefined : { y: -3 }}
      className={`cartao group relative flex flex-col overflow-hidden transition-shadow hover:shadow-lg ${atual ? 'ring-2 ring-primary/50' : ''}`}>{/* marca: cartão sobe ao passar o mouse */}
      <div className="relative px-5 pb-4 pt-5">
        <motion.span className="absolute inset-x-0 top-0 h-1 origin-left" style={{ background: p.cor }} initial={{ scaleX: reduzir ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.1 + i * 0.04, duration: 0.6, ease: 'easeOut' }} />
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-white" style={{ background: p.cor }}><TipoI className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-base font-semibold">{p.nome}{atual && <span className="rounded bg-primary/15 px-1.5 py-px text-[10px] font-semibold text-primary">ATUAL</span>}</p>
            <p className="truncate text-xs text-muted-foreground">{tipoRot}{p.responsavel ? ` · ${p.responsavel}` : ''}{p.endereco ? ` · ${p.endereco}` : ''}</p>
          </div>
          {p.aparelhos.length > 0 && <Anel ligados={ligados} total={p.aparelhos.length} cor={p.cor} />}
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></button>
            {menu && <Menu aoFechar={() => setMenu(false)} itens={[
              { r: 'Editar', I: Pencil, fn: () => acoes.editar(p) },
              ligados > 0 && { r: `Desligar ${ligados} ar(es)`, I: Power, fn: () => acoes.desligar(p) },
              p.aparelhos.length > 0 && { r: 'Conforto: todos em 23° no frio', I: Snowflake, fn: () => acoes.conforto(p) },
              { r: 'Duplicar projeto', I: Copy, fn: () => acoes.duplicar(p) },
              { r: 'Ver no mapa', I: MapaIcone, fn: () => acoes.mapa(p) },
              { r: 'Relatório do projeto', I: BarChart3, fn: () => acoes.relatorio(p) },
              { r: 'Exportar (JSON)', I: Download, fn: () => acoes.exportar(p) },
              { r: 'Remover', I: Trash2, perigo: true, fn: () => acoes.remover(p) },
            ]} />}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5"><SeloTx p={p} /><EstadoAgora p={p} ligados={ligados} reduzir={reduzir} /></div>
        {p.descricao && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.descricao}</p>}
      </div>

      <div className="border-t border-border px-5 py-3">
        {p.aparelhos.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum aparelho neste projeto.</p> : (
          <ul className="space-y-1.5">
            {(todos ? [] : p.aparelhos.slice(0, 4)).map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <span className="relative flex h-2 w-2">{a.ligado && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />}<span className={`relative inline-flex h-2 w-2 rounded-full ${a.ligado ? 'bg-sky-500' : 'bg-muted-foreground/30'}`} /></span> {/* marca: ar ligado pulsa */}
                <button onClick={() => acoes.aparelho(a)} className="min-w-0 flex-1 truncate text-left hover:underline">{a.nome}</button>
                <span className="shrink-0 text-xs tabular text-muted-foreground">{a.ligado ? `${a.temperatura}° · ${a.ligado_desde ? haQuanto(a.ligado_desde).replace('há ', '') : 'ligado'}` : 'desligado'}</span>
                {!a.hub_online && <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Transmissor offline" />}
              </li>
            ))}
          </ul>
        )}
        {p.aparelhos.length > 0 && (
          <>
            <button onClick={() => setTodos((v) => !v)} className="mt-2 flex items-center gap-1 text-xs font-medium text-primary hover:underline" aria-expanded={todos}>
              {todos ? 'Fechar' : p.aparelhos.length > 4 ? `Ver todos os ${p.aparelhos.length} e ligar/desligar` : 'Ligar ou desligar aqui'}
              <motion.span animate={{ rotate: todos ? 180 : 0 }}><ChevronDown className="h-3.5 w-3.5" /></motion.span>
            </button>
            <AnimatePresence>{todos && <AresDoProjeto p={p} aoMudar={acoes.recarregar} />}</AnimatePresence>
          </>
        )}
      </div>

      <div className="border-t border-border px-5 py-3">
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-[11px] text-muted-foreground">Comandos em 14 dias</p><p className="text-lg font-semibold tabular leading-tight"><NumeroAnimado valor={p.comandos_14d} />{p.falhas_14d > 0 && <span className="ml-1.5 text-xs font-normal text-red-600">{p.falhas_14d} falha(s)</span>}</p></div>
          <div className="h-10 w-32">
            {temSerie ? (
              <ResponsiveContainer><AreaChart data={p.serie} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
                <Area type="monotone" dataKey="comandos" stroke={p.cor} strokeWidth={1.8} fill={p.cor} fillOpacity={0.12} isAnimationActive />
              </AreaChart></ResponsiveContainer>
            ) : <div className="flex h-full items-end"><div className="h-px w-full bg-border" /></div>}
          </div>
        </div>
        <div className="mt-3"><Meta p={p} /></div>
      </div>

      <dl className="grid grid-cols-3 border-t border-border text-center text-[11px] sm:grid-cols-6">
        {[[AirVent, 'Ares', `${ligados}/${p.aparelhos.length}`], [Radio, 'IR', `${p.transmissores.length - offline.length}/${p.transmissores.length}`], [Sparkles, 'Cenas', p.cenas],
          [Workflow, 'Autom.', p.automacoes], [CalendarClock, 'Agenda', p.agendamentos], [Users, 'Pessoas', p.pessoas]].map(([I, r, v]) => (
          <div key={r} className="border-border px-1 py-2.5 [&:not(:last-child)]:border-r max-sm:[&:nth-child(3)]:border-r-0 max-sm:[&:nth-child(n+4)]:border-t">
            <dt className="flex items-center justify-center gap-1 text-muted-foreground"><I className="h-3 w-3" />{r}</dt><dd className="mt-0.5 text-sm font-semibold tabular">{typeof v === 'number' ? <NumeroAnimado valor={v} /> : v}</dd>
          </div>
        ))}
      </dl>
      {offline.length > 0 && (
        <motion.button onClick={() => acoes.transmissores?.()} initial={reduzir ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }}
          className="flex w-full items-center gap-1.5 border-t border-amber-500/30 bg-amber-500/10 px-5 py-2 text-left text-xs text-amber-700 hover:bg-amber-500/15 dark:text-amber-300" title="Abrir Transmissores">
          <motion.span animate={reduzir ? undefined : { opacity: [1, 0.35, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}><WifiOff className="h-3.5 w-3.5 shrink-0" /></motion.span>
          <span className="min-w-0 flex-1 truncate">{offline[0].nome}: {offline[0].problema || 'transmissor offline'}{offline.length > 1 ? ` (+${offline.length - 1})` : ''}</span>
          <span className="shrink-0 font-medium">Ver →</span>
        </motion.button>
      )}

      <div className="mt-auto flex gap-2 border-t border-border p-3">
        <Botao className="flex-1" variante={atual ? 'secundario' : 'primario'} onClick={() => acoes.abrir(p)}>{atual ? 'Abrir painel' : 'Usar este projeto'}</Botao>
        {p.no_mapa && <Botao variante="secundario" icone={MapaIcone} onClick={() => acoes.mapa(p)} aria-label="Ver no mapa" />}
        {ligados > 0 && <Botao variante="secundario" icone={Power} onClick={() => acoes.desligar(p)} aria-label="Desligar todos" title="Desligar todos os ares" />}
      </div>
      <p className="px-5 pb-3 text-[11px] text-muted-foreground">{p.ultima_atividade ? `Último comando ${haQuanto(p.ultima_atividade)}` : 'Sem comandos nos últimos 14 dias'}</p>
    </motion.article>
  )
}

export default function Projetos() {
  const { dados, erro, recarregar } = useDados(() => api.get('/api/projetos/visao'))
  const { atual: projetoAtual, setAtual, recarregar: recarregarCtx } = useProjeto()
  const [modal, setModal] = useState(null)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [ordem, setOrdem] = useState('nome')
  const [vista, setVista] = useState(() => ler('clima-projetos-vista', 'grade'))
  const [soTx, setSoTx] = useState(false)   // só as salas que precisam de atenção no transmissor
  const [desligando, setDesligando] = useState(null)
  const [conforto, setConforto] = useState(null)
  const buscaRef = useRef(null)
  const toast = useToast()
  useEffect(() => {   // "/" vai para a busca
    const f = (e) => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { e.preventDefault(); buscaRef.current?.focus() } }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [])
  const navegar = useNavigate()
  useEffect(() => { const t = setInterval(() => { if (devePuxar('projetos')) recarregar() }, 30000); return () => clearInterval(t) }, [recarregar])
  useEffect(() => { try { localStorage.setItem('clima-projetos-vista', vista) } catch { /* */ } }, [vista])

  const lista = useMemo(() => {
    const l = (dados || []).filter((p) => (!soTx || ['sem', 'parcial', 'dividido'].includes(p.tx_estado)) && (!tipo || p.tipo === tipo) && (!busca || `${p.nome} ${p.endereco} ${p.responsavel} ${p.descricao} ${p.aparelhos.map((a) => a.nome).join(' ')}`.toLowerCase().includes(busca.toLowerCase())))
    const chave = { nome: (p) => p.nome.toLowerCase(), ligados: (p) => -p.aparelhos.filter((a) => a.ligado).length, custo: (p) => -p.custo_mes, uso: (p) => -p.comandos_14d }[ordem]
    return [...l].sort((a, b) => (chave(a) > chave(b) ? 1 : chave(a) < chave(b) ? -1 : 0))
  }, [dados, busca, tipo, ordem, soTx])

  if (erro) return <Aviso>{erro}</Aviso>
  const atualizar = () => { recarregar(); recarregarCtx() }
  const acoes = {
    transmissores: () => navegar('/transmissores'),
    editar: (p) => setModal(p), remover: (p) => setModal({ ...p, apagar: true }),
    abrir: (p) => { setAtual(p.id); navegar('/') },
    mapa: () => navegar('/mapa'),
    relatorio: (p) => { setAtual(p.id); navegar('/relatorios') },
    aparelho: (a) => navegar(`/aparelhos/${a.id}`),
    exportar: async (p) => { try { toast(`Arquivo salvo: ${await api.baixar(`/api/projetos/${p.id}/exportar`)}`) } catch (e) { toast(e.message, 'erro') } },
    desligar: (p) => setDesligando(p),   // confirma no próprio sistema (a caixa nativa do navegador travava a tela)
    conforto: (p) => setConforto(p),
    recarregar: () => recarregar(),
    duplicar: async (p) => {
      try {
        await api.post('/api/projetos', { nome: `${p.nome} (cópia)`.slice(0, 60), descricao: p.descricao || '', endereco: p.endereco || '', cor: p.cor, tipo: p.tipo,
          responsavel: p.responsavel || '', meta_custo_mes: Number(p.meta_custo_mes) || 0 })
        toast('Projeto duplicado (sem os aparelhos: cada ar fica em uma sala só).'); atualizar()
      } catch (e) { toast(e.message, 'erro') }
    },
  }
  const tot = (f) => (dados || []).reduce((s, p) => s + f(p), 0)
  const ligadosTotal = tot((p) => p.aparelhos.filter((a) => a.ligado).length)
  const metasEstouradas = (dados || []).filter((p) => p.meta_custo_mes && p.projecao_mes > p.meta_custo_mes)

  return (
    <div className="w-full">
      <Cabecalho titulo="Projetos" descricao="Cada projeto é um lugar (sala, escritório, casa, loja) com os próprios transmissores, aparelhos, cenas e metas de gasto."
        acoes={<Botao icone={Plus} onClick={() => setModal({})}>Novo projeto</Botao>} />
      {!dados ? <div className="grid gap-4"><Esqueleto className="h-24" /><div className="grid gap-4 md:grid-cols-3"><Esqueleto className="h-80" /><Esqueleto className="h-80" /><Esqueleto className="h-80" /></div></div> : (
        <>
          {dados.length > 0 && (
            <div className="mb-5">
              <FaixaMetricas itens={[
                { rotulo: 'Gasto estimado no mês', valor: brl(tot((p) => p.custo_mes)), dica: `projeção ${brl(tot((p) => p.projecao_mes))} · ${metasEstouradas.length ? `${metasEstouradas.length} acima da meta` : 'metas em dia'}`, tom: metasEstouradas.length ? 'ruim' : undefined },
                { rotulo: 'Ares ligados agora', valor: ligadosTotal, sufixo: ` / ${tot((p) => p.aparelhos.length)}`, dica: `${dados.filter((p) => p.aparelhos.some((a) => a.ligado)).length} projeto(s) com ar ligado` },
                { rotulo: 'Transmissores online', valor: tot((p) => p.transmissores.filter((h) => h.online).length), sufixo: ` / ${tot((p) => p.transmissores.length)}`, tom: tot((p) => p.transmissores.filter((h) => !h.online).length) ? 'ruim' : 'bom', dica: tot((p) => p.transmissores.filter((h) => !h.online).length) ? 'há transmissor fora da rede' : 'todos respondendo' },
                { rotulo: 'Projetos', valor: dados.length, dica: `${tot((p) => p.comandos_14d)} comandos em 14 dias` },
              ]} />
            </div>
          )}
          {dados.length > 1 && (() => {
            // comparativo entre as salas: gasto do mês (barra) com a meta marcada e o uso em 14 dias
            const max = Math.max(1, ...dados.map((p) => Math.max(p.projecao_mes || 0, p.meta_custo_mes || 0)))
            const maxUso = Math.max(1, ...dados.map((p) => p.comandos_14d || 0))
            const ord = [...dados].sort((x, y) => (y.projecao_mes || 0) - (x.projecao_mes || 0))
            return (
              <section className="cartao mb-5 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="titulo-secao">Comparativo das salas</h2>
                  <p className="text-xs text-muted-foreground">Barra = projeção de gasto no mês · traço = meta · número = comandos em 14 dias</p>
                </div>
                <ul className="mt-4 space-y-2.5">
                  {ord.map((p) => {
                    const acima = p.meta_custo_mes && p.projecao_mes > p.meta_custo_mes
                    return (
                      <li key={p.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_5.5rem_3rem] items-center gap-3 text-xs sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_6rem_4rem]">
                        <button onClick={() => acoes.relatorio(p)} className="truncate text-left font-medium hover:text-primary" title={`Relatório de ${p.nome}`}>{p.nome}</button>
                        <div className="relative h-3 rounded-full bg-muted">
                          <motion.div className={`h-full rounded-full ${acima ? 'bg-red-500' : 'bg-primary'}`} initial={{ width: 0 }} animate={{ width: `${((p.projecao_mes || 0) / max) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                          {p.meta_custo_mes > 0 && <span className="absolute -top-0.5 h-4 w-0.5 rounded bg-foreground/70" style={{ left: `${(p.meta_custo_mes / max) * 100}%` }} title={`Meta ${brl(p.meta_custo_mes)}`} />}
                        </div>
                        <span className={`text-right tabular-nums ${acima ? 'font-medium text-red-600' : ''}`}>{brl(p.projecao_mes || 0)}</span>
                        <span className="flex items-center justify-end gap-1 tabular-nums text-muted-foreground"><span className="inline-block h-1.5 rounded-full bg-sky-500/70" style={{ width: `${Math.max(2, ((p.comandos_14d || 0) / maxUso) * 28)}px` }} />{p.comandos_14d || 0}</span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })()}
          {dados.length > 0 && dados.some((p) => p.comandos_14d) && <MapaCalor dados={dados} aoAbrir={acoes.relatorio} />}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input ref={buscaRef} type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto, endereço ou aparelho  ( / )" aria-label="Buscar projeto" className="campo h-9 pl-9" />
            </label>
            <div className="flex gap-1 overflow-x-auto sem-barra">
              <button onClick={() => setTipo('')} className={`rounded-full px-3 py-1.5 text-[13px] ${!tipo ? 'bg-primary/15 font-medium text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>Todos</button>
              {Object.entries(TIPOS).filter(([k]) => dados.some((p) => p.tipo === k)).map(([k, [r]]) => (
                <button key={k} onClick={() => setTipo(k)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] ${tipo === k ? 'bg-primary/15 font-medium text-primary' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{r} <span className="opacity-70">{dados.filter((p) => p.tipo === k).length}</span></button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select value={ordem} onChange={(e) => setOrdem(e.target.value)} className="campo h-9 w-auto text-sm" aria-label="Ordenar">{ORDENS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
              <div className="flex rounded-lg border border-border bg-card p-0.5">
                {[['grade', LayoutGrid], ['lista', List]].map(([k, I]) => (
                  <button key={k} onClick={() => setVista(k)} aria-label={k === 'grade' ? 'Ver em grade' : 'Ver em lista'} className={`relative rounded-md p-1.5 ${vista === k ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {vista === k && <motion.span layoutId="vista-proj" className="absolute inset-0 rounded-md bg-muted" />}<I className="relative h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {dados.some((p) => ['sem', 'parcial', 'dividido'].includes(p.tx_estado)) && (
            <label className="mb-4 flex w-fit items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={soTx} onChange={(e) => setSoTx(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
              Só salas sem transmissor próprio ({dados.filter((p) => ['sem', 'parcial', 'dividido'].includes(p.tx_estado)).length})
            </label>
          )}
          {dados.length === 0 ? <Vazio icone={FolderKanban} titulo="Nenhum projeto" texto="Crie o primeiro lugar para cadastrar transmissores e aparelhos nele." acao={<Botao icone={Plus} onClick={() => setModal({})}>Novo projeto</Botao>} />
            : lista.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Nenhum projeto com esse filtro.</p>
              : vista === 'grade' ? (
                <motion.div layout className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,330px),1fr))]">
                  <AnimatePresence>{lista.map((p, i) => <Cartao key={p.id} p={p} i={i} atual={projetoAtual === p.id} acoes={acoes} />)}</AnimatePresence>
                </motion.div>
              ) : (
                <div className="cartao overflow-x-auto">
                  <table className="tabela w-full min-w-[900px]">
                    <thead><tr><th>Projeto</th><th>Responsável</th><th className="!text-right">Ares</th><th className="!text-right">IR online</th><th>Transmissor</th><th className="!text-right">Comandos 14 d</th><th className="!text-right">Gasto no mês</th><th>Meta</th><th /></tr></thead>
                    <tbody>{lista.map((p) => {
                      const lig = p.aparelhos.filter((a) => a.ligado).length
                      const pct = p.meta_custo_mes ? (p.projecao_mes / p.meta_custo_mes) * 100 : null
                      return (
                        <tr key={p.id} className={projetoAtual === p.id ? 'bg-primary/5' : ''}>
                          <td><span className="flex items-center gap-2.5"><span className="h-6 w-1.5 rounded-full" style={{ background: p.cor }} /><span><span className="block font-medium">{p.nome}</span><span className="text-xs text-muted-foreground">{(TIPOS[p.tipo] || TIPOS.outro)[0]}{p.endereco ? ` · ${p.endereco}` : ''}</span></span></span></td>
                          <td className="text-sm">{p.responsavel || <span className="text-muted-foreground">—</span>}</td>
                          <td className="text-right tabular">{lig > 0 ? <span className="font-medium text-sky-600">{lig}</span> : 0}/{p.aparelhos.length}</td>
                          <td className="text-right tabular">{p.transmissores.filter((h) => h.online).length}/{p.transmissores.length}</td>
                          <td><SeloTx p={p} /></td>
                          <td className="text-right tabular">{p.comandos_14d}</td>
                          <td className="text-right tabular">{brl(p.custo_mes)}</td>
                          <td className="w-40">{pct == null ? <span className="text-xs text-muted-foreground">sem meta</span> : <div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="w-9 text-right text-xs tabular text-muted-foreground">{Math.round(pct)}%</span></div>}</td>
                          <td className="whitespace-nowrap text-right">
                            <Botao variante="fantasma" tamanho="sm" onClick={() => acoes.abrir(p)}>Abrir</Botao>
                            <Botao variante="fantasma" tamanho="sm" icone={Pencil} onClick={() => acoes.editar(p)} aria-label="Editar" />
                          </td>
                        </tr>
                      )
                    })}</tbody>
                  </table>
                </div>
              )}
        </>
      )}

      <Modal aberto={!!modal && !modal.apagar} titulo={modal?.id ? `Editar ${modal.nome}` : 'Novo projeto'} onFechar={() => setModal(null)} largura="max-w-xl">
        {modal && !modal.apagar && (
          <Form inicial={modal.id ? modal : null} onFechar={() => setModal(null)} aoSalvar={async (f) => {
            if (modal.id) await api.put(`/api/projetos/${modal.id}`, f); else await api.post('/api/projetos', f)
            toast('Projeto salvo.'); atualizar()
          }} />
        )}
      </Modal>
      <Modal aberto={!!desligando} titulo={`Desligar os ares de ${desligando?.nome || ''}?`} onFechar={() => setDesligando(null)}>
        <p className="text-sm text-muted-foreground">Desliga os {desligando?.aparelhos?.filter((a) => a.ligado).length} ar(es) ligado(s) deste projeto, um por vez. Se o transmissor também atende outra sala, os ares iguais à vista dele desligam juntos.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setDesligando(null)}>Cancelar</Botao>
          <Botao variante="perigo" icone={Power} onClick={async () => {
            const p = desligando; setDesligando(null)
            try { const r = await api.post(`/api/projetos/${p.id}/desligar`); toast(r.falhas.length ? `${r.desligados} desligado(s); ${r.falhas.length} falharam.` : `${r.desligados} ar(es) desligado(s).`, r.falhas.length ? 'erro' : undefined); recarregar() } catch (e) { toast(e.message, 'erro') }
          }}>Desligar</Botao>
        </div>
      </Modal>
      <Modal aberto={!!conforto} titulo={`Conforto em ${conforto?.nome || ''}?`} onFechar={() => setConforto(null)}>
        <p className="text-sm text-muted-foreground">Liga os {conforto?.aparelhos?.length} ar(es) deste projeto em 23° no frio, um por vez. Ares iguais à vista do mesmo transmissor mudam juntos.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setConforto(null)}>Cancelar</Botao>
          <Botao icone={Snowflake} onClick={async () => {
            const p = conforto; setConforto(null)
            let ok = 0; const falhas = []
            for (const a of p.aparelhos) {
              try { await api.post(`/api/aparelhos/${a.id}/estado`, { ligado: true, modo: 'frio', temperatura: 23 }); ok++ } catch (e) { falhas.push(`${a.nome}: ${e.message}`) }
            }
            toast(falhas.length ? `${ok} em conforto; ${falhas.length} falharam (${falhas[0]}).` : `${ok} ar(es) em 23° no frio.`, falhas.length ? 'erro' : undefined); recarregar()
          }}>Ligar em 23°</Botao>
        </div>
      </Modal>
      <Modal aberto={!!modal?.apagar} titulo={`Remover ${modal?.nome}?`} onFechar={() => setModal(null)}>
        <p className="text-sm text-muted-foreground">Os {modal?.aparelhos?.length} aparelho(s) e {modal?.transmissores?.length} transmissor(es) continuam cadastrados, só ficam sem projeto. As cenas do projeto são apagadas e a sala sai do mapa.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => {
            try { await api.del(`/api/projetos/${modal.id}`); toast('Projeto removido.'); setModal(null); atualizar() } catch (e) { toast(e.message, 'erro') }
          }}>Remover</Botao>
        </div>
      </Modal>
    </div>
  )
}
