import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronsDownUp, ChevronsUpDown, Download, Link2, Search } from 'lucide-react'
import { api } from '../api'
import { SECOES, dataBR } from '../components/Novidades'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Selo, Vazio, useDados, useToast } from '../components/ui'
import GraficoVersoes from '../components/GraficoVersoes'


// Histórico de versões (fonte: backend/app/novidades.json): linha do tempo em 3D, números, filtro por tipo, busca
// e cada versão por inteiro. Só o que entrou de verdade em cada publicação.
const COR_SECAO = { novo: 'bg-teal-600', melhorias: 'bg-blue-600', seguranca: 'bg-amber-600', correcoes: 'bg-slate-500' }
const total = (v) => SECOES.reduce((s, [k]) => s + (v[k]?.length || 0), 0)
const dias = (iso) => Math.round((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86400000)
const haQuanto = (iso) => { const d = dias(iso); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
const ancora = (v) => `v${v.replaceAll('.', '-')}`
// horário da versão: confirmado no ar (Vercel ou o próprio servidor) ou, para as antigas, o do commit que a registrou
const quando = (v) => v.no_ar_em || v.commit_em || null
const horaBR = (t) => new Date(t * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const diaBR = (t) => new Date(t * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' })
const diaChave = (t) => new Date(t * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const duracao = (s) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${(s / 3600).toFixed(1).replace('.', ',')} h` : `${(s / 86400).toFixed(1).replace('.', ',')} dias`)
const FONTE = { vercel: 'confirmado pela Vercel (publicação de produção)', servidor: 'confirmado pelo servidor ao entrar no ar' }
const PERIODOS = [['tudo', 'Tudo'], ['hoje', 'Hoje'], ['7', '7 dias'], ['30', '30 dias']]

function Horario({ v }) {
  if (v.no_ar_em) return <span className="inline-flex items-center gap-1" title={FONTE[v.no_ar_fonte] || 'confirmado'}><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />no ar em {horaBR(v.no_ar_em)}</span>
  if (v.commit_em) return <span title={`horário do commit ${v.commit || ''} que registrou a versão (a publicação dessa época não está mais guardada na Vercel)`}>registrada em {horaBR(v.commit_em)} (commit)</span>
  return <span>{dataBR(v.data)}</span>
}

export default function Novidades() {
  const { dados, erro } = useDados(() => api.get('/api/novidades'))
  const [tipo, setTipo] = useState('todos')
  const [busca, setBusca] = useState('')
  const [soNovas, setSoNovas] = useState(false)
  const [periodo, setPeriodo] = useState('tudo')
  const [fechadas, setFechadas] = useState(() => new Set())
  const toast = useToast()
  // "novas para mim": versões publicadas depois da última vez que esta pessoa abriu esta página (neste navegador)
  const [ultimaVisita] = useState(() => { try { return localStorage.getItem('novidades-pagina-vista') } catch { return null } })
  useEffect(() => { if (dados?.versoes?.[0]) { try { localStorage.setItem('novidades-pagina-vista', dados.versoes[0].versao) } catch { /* sem armazenamento */ } } }, [dados])
  const parado = useReducedMotion()
  const ir = useCallback((versao) => document.getElementById(ancora(versao))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), [])
  const versoes = dados?.versoes
  const filtradas = useMemo(() => {
    if (!versoes) return []
    const q = busca.trim().toLowerCase()
    const idxVisita = ultimaVisita ? versoes.findIndex((v) => v.versao === ultimaVisita) : -1
    const hoje = diaChave(Date.now() / 1000)
    const limite = periodo === 'tudo' || periodo === 'hoje' ? 0 : Date.now() / 1000 - Number(periodo) * 86400
    return versoes.filter((v, i) => !soNovas || (idxVisita >= 0 && i < idxVisita))
      .filter((v) => { const t = quando(v); return periodo === 'tudo' || (t && (periodo === 'hoje' ? diaChave(t) === hoje : t >= limite)) }).map((v) => {
      const secoes = SECOES.filter(([k]) => tipo === 'todos' || k === tipo).map(([k, rot, I]) => [k, rot, I, (v[k] || []).filter((t) => !q || t.toLowerCase().includes(q) || v.titulo.toLowerCase().includes(q))])
      return { v, secoes, n: secoes.reduce((s, x) => s + x[3].length, 0) }
    }).filter((x) => x.n > 0 || (!q && tipo === 'todos'))
  }, [versoes, tipo, busca, soNovas, ultimaVisita, periodo])
  const novas = useMemo(() => {
    const i = ultimaVisita && versoes ? versoes.findIndex((v) => v.versao === ultimaVisita) : -1
    return new Set(i > 0 ? versoes.slice(0, i).map((v) => v.versao) : [])
  }, [versoes, ultimaVisita])
  const copiarLink = (v) => { const u = `${location.origin}/novidades#${ancora(v)}`; navigator.clipboard?.writeText(u).then(() => toast('Link da versão copiado.')) }
  const baixarMd = () => {
    const md = (versoes || []).map((v) => [`## ${v.versao} · ${quando(v) ? horaBR(quando(v)) : dataBR(v.data)}${v.no_ar_em ? ' (no ar)' : v.commit_em ? ' (commit)' : ''}`, `**${v.titulo}**`, v.resumo || '', ...SECOES.flatMap(([k, rot]) => (v[k]?.length ? [`### ${rot}`, ...v[k].map((t) => `- ${t}`)] : []))].join('\n\n')).join('\n\n---\n\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([`# Novidades\n\n${md}\n`], { type: 'text/markdown' })); a.download = 'novidades.md'; a.click()
  }
  // índice que acompanha a leitura: a versão cujo topo já passou do cabeçalho fica marcada e o índice (que rola
  // sozinho, separado da página) se move até ela, sem mexer na rolagem da página
  const indice = useRef(null)
  const [ativa, setAtiva] = useState(null)
  useEffect(() => {
    if (!versoes?.length) return
    let quadro = 0
    const medir = () => {
      quadro = 0
      let atualV = versoes[0].versao
      for (const v of versoes) {
        const el = document.getElementById(ancora(v.versao))
        if (!el) continue
        if (el.getBoundingClientRect().top <= 140) atualV = v.versao; else break
      }
      setAtiva(atualV)
    }
    const pedir = () => { if (!quadro) quadro = requestAnimationFrame(medir) }
    medir()
    window.addEventListener('scroll', pedir, { passive: true })
    return () => { window.removeEventListener('scroll', pedir); if (quadro) cancelAnimationFrame(quadro) }
  }, [versoes, filtradas])
  useEffect(() => {
    const nav = indice.current, item = ativa && nav?.querySelector(`[data-versao="${ativa}"]`)
    if (!nav || !item) return
    const topo = item.offsetTop - nav.clientHeight / 2 + item.offsetHeight / 2
    nav.scrollTo({ top: Math.max(0, topo), behavior: parado ? 'auto' : 'smooth' })
  }, [ativa, parado])
  useEffect(() => { const h = location.hash.slice(1); if (h && dados) setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 200) }, [dados])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  if (!versoes?.length) return <Vazio icone={Search} titulo="Nenhuma versão registrada" texto="As novidades aparecem aqui a cada atualização do sistema." />
  const somas = Object.fromEntries(SECOES.map(([k]) => [k, versoes.reduce((s, v) => s + (v[k]?.length || 0), 0)]))
  const tudo = Object.values(somas).reduce((a, b) => a + b, 0)
  const primeira = versoes[versoes.length - 1]
  const atual = versoes[0]

  return (
    <div className="w-full min-w-0">
      <Cabecalho titulo="Novidades" descricao="Tudo o que mudou em cada versão: recursos novos, melhorias, segurança e correções, da mais nova para a mais antiga."
        acoes={<Botao variante="secundario" icone={Download} onClick={baixarMd}>Baixar histórico (.md)</Botao>} />

      {/* linha do tempo 3D com a versão atual ao lado */}
      <section className="cartao mb-6 grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="mb-2 text-sm font-semibold">Versões ao longo do tempo</p>
          <GraficoVersoes versoes={versoes} ir={ir} novas={novas} />
        </div>
        <div className="flex flex-col justify-between gap-4 p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><Selo cor="verde">Versão atual</Selo><span className="text-xs text-muted-foreground"><Horario v={atual} /></span></div>
            <p className="text-2xl font-semibold tracking-tight tabular">{atual.versao}</p>
            <p className="mt-1 text-sm font-medium">{atual.titulo}</p>
            {atual.resumo && <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{atual.resumo}</p>}
          </div>
          <div>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              {SECOES.map(([k]) => (atual[k]?.length || 0) > 0 && <span key={k} className={COR_SECAO[k]} style={{ width: `${(atual[k].length / Math.max(1, total(atual))) * 100}%` }} />)}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {SECOES.map(([k, rot]) => <li key={k} className="flex items-center gap-1.5 text-muted-foreground"><span className={`h-2 w-2 rounded-full ${COR_SECAO[k]}`} />{rot}<span className="ml-auto tabular text-foreground">{atual[k]?.length || 0}</span></li>)}
            </ul>
            <button onClick={() => ir(atual.versao)} className="mt-3 text-xs font-medium text-primary hover:underline">Ler a versão {atual.versao} inteira</button>
          </div>
        </div>
      </section>

      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Versões publicadas', valor: versoes.length, dica: `desde ${dataBR(primeira.data)}` },
          { rotulo: 'Mudanças registradas', valor: tudo, dica: `${somas.novo} recursos novos` },
          { rotulo: 'Itens de segurança', valor: somas.seguranca, dica: 'proteções que entraram' },
          { rotulo: 'Correções', valor: somas.correcoes, dica: `${somas.melhorias} melhorias` },
        ]} />
        {(() => {
          const ts = versoes.map(quando).filter(Boolean).sort((a, b) => b - a)
          const hoje = ts.filter((t) => diaChave(t) === diaChave(Date.now() / 1000)).length
          const semana = ts.filter((t) => t > Date.now() / 1000 - 7 * 86400).length
          const gaps = ts.slice(0, -1).map((t, i) => t - ts[i + 1]).filter((g) => g > 0)
          const medio = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0
          const conf = versoes.filter((v) => v.no_ar_em).length
          return (
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[['Publicadas hoje', hoje], ['Nos últimos 7 dias', semana], ['Intervalo médio entre versões', medio ? duracao(medio) : '—'], ['Horário confirmado no ar', `${conf} de ${versoes.length}`]].map(([r, x]) => (
                <div key={r} className="rounded-lg border border-border px-3 py-2"><p className="text-xs text-muted-foreground">{r}</p><p className="font-semibold tabular">{x}</p></div>))}
            </div>
          )
        })()}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* índice das versões (fixo ao rolar no computador) */}
        <nav aria-label="Versões" className="hidden lg:block">
          <div ref={indice} className="rolagem-fina sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain pr-1">
          <ol className="relative space-y-0.5 border-l border-border">
            {versoes.map((v, i) => (
              <li key={v.versao} data-versao={v.versao}>
                <button onClick={() => ir(v.versao)} aria-current={ativa === v.versao ? 'true' : undefined}
                  className={`group -ml-px flex w-full items-start gap-2 border-l-2 py-1.5 pl-3 text-left text-sm transition-colors ${ativa === v.versao ? 'border-primary bg-primary/5' : 'border-transparent hover:border-primary/60'}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium tabular">{v.versao}{i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="atual" />}</span>
                    <span className="block truncate text-xs text-muted-foreground group-hover:text-foreground">{v.titulo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          </div>
        </nav>

        <div className="min-w-0">
          {/* filtros */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de mudança">
              <button onClick={() => setSoNovas((x) => !x)} aria-pressed={soNovas} disabled={!novas.size}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50 ${soNovas ? 'border-emerald-600 bg-emerald-500/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                <span className="h-2 w-2 rounded-full bg-emerald-500" />Novas para mim<span className="tabular opacity-70">{novas.size}</span></button>
              {[['todos', 'Tudo', tudo], ...SECOES.map(([k, rot]) => [k, rot, somas[k]])].map(([k, rot, n]) => (
                <button key={k} onClick={() => setTipo(k)} aria-pressed={tipo === k}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${tipo === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {k !== 'todos' && <span className={`h-2 w-2 rounded-full ${COR_SECAO[k]}`} />}{rot}<span className="tabular opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-1" role="group" aria-label="Período">
              {PERIODOS.map(([k, r]) => <button key={k} onClick={() => setPeriodo(k)} aria-pressed={periodo === k}
                className={`h-8 rounded-md border px-2.5 text-xs font-medium ${periodo === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>{r}</button>)}
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas mudanças" className="campo h-8 pl-8 text-sm" aria-label="Buscar nas mudanças" type="search" autoComplete="off" />
            </label>
            <button onClick={() => setFechadas(fechadas.size ? new Set() : new Set(versoes.map((v) => v.versao)))} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted">
              {fechadas.size ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}{fechadas.size ? 'Abrir todas' : 'Recolher todas'}</button>
          </div>

          {filtradas.length === 0 ? <Vazio icone={Search} titulo="Nada encontrado" texto="Tente outra palavra ou mostre todos os tipos de mudança." /> : (
            <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">
              {filtradas.map(({ v, secoes, n }, i) => (<Fragment key={v.versao}>
                {(() => { const t = quando(v), ant = i > 0 ? quando(filtradas[i - 1].v) : null; if (!t || (ant && diaChave(ant) === diaChave(t))) return null
                  const doDia = filtradas.filter((x) => quando(x.v) && diaChave(quando(x.v)) === diaChave(t)).length
                  return <li key={`dia-${diaChave(t)}`} className="relative pl-7 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground first-letter:uppercase">{diaBR(t)} · {doDia} versão(ões)</li> })()}
                <motion.li key={v.versao} id={ancora(v.versao)} className="relative scroll-mt-20 pl-7"
                  initial={parado ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.25, delay: Math.min(i, 4) * 0.03 }}>
                  <span className={`absolute left-0 top-5 h-[15px] w-[15px] rounded-full border-2 border-background ${v === atual ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                  <article className="cartao p-5">
                    <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="text-lg font-semibold tabular">Versão {v.versao}</h2>
                      {v === atual && <Selo cor="verde">Atual</Selo>}
                      <span className="text-xs text-muted-foreground"><Horario v={v} /> · {haQuanto(v.data)}{v.antes ? ` · antes ${v.antes}` : ''}
                        {(() => { const idx = versoes.indexOf(v), ant = versoes[idx + 1]; const g = ant && quando(v) && quando(ant) ? quando(v) - quando(ant) : 0; return g > 0 ? ` · ${duracao(g)} depois da ${ant.versao}` : '' })()}</span>
                      {novas.has(v.versao) && <Selo cor="azul">Nova para você</Selo>}
                      <span className="ml-auto flex items-center gap-1 text-xs tabular text-muted-foreground">{n} de {total(v)} mudança(s)
                        <button onClick={() => copiarLink(v.versao)} className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label={`Copiar link da versão ${v.versao}`} title="Copiar link"><Link2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setFechadas((f) => { const x = new Set(f); x.has(v.versao) ? x.delete(v.versao) : x.add(v.versao); return x })} className="rounded p-1 hover:bg-muted hover:text-foreground" aria-label={fechadas.has(v.versao) ? 'Abrir' : 'Recolher'} title={fechadas.has(v.versao) ? 'Abrir' : 'Recolher'}>{fechadas.has(v.versao) ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}</button>
                      </span>
                      <p className="w-full text-sm font-medium">{v.titulo}</p>
                    </header>
                    {v.resumo && !busca && <p className="mb-4 text-sm text-muted-foreground">{v.resumo}</p>}
                    {!fechadas.has(v.versao) && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {secoes.filter((x) => x[3].length).map(([k, rot, I, itens]) => (
                        <section key={k} className="min-w-0 rounded-md border border-border p-3">
                          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${COR_SECAO[k]}`} /><I className="h-4 w-4 text-muted-foreground" aria-hidden />{rot}<span className="ml-auto text-xs font-normal tabular text-muted-foreground">{itens.length}</span></h3>
                          <ul className="space-y-1.5 pl-4 text-sm leading-relaxed [overflow-wrap:anywhere]">{itens.map((t) => <li key={t} className="list-disc marker:text-muted-foreground">{t}</li>)}</ul>
                        </section>
                      ))}
                    </div>}
                  </article>
                </motion.li>
              </Fragment>))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
