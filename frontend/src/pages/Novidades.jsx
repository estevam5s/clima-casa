import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'
import { api } from '../api'
import { SECOES, dataBR } from '../components/Novidades'
import { Aviso, Cabecalho, Carregando, FaixaMetricas, Selo, Vazio, useDados } from '../components/ui'

const LinhaVersoes3D = lazy(() => import('../components/LinhaVersoes3D'))

// Histórico de versões (fonte: backend/app/novidades.json): linha do tempo em 3D, números, filtro por tipo, busca
// e cada versão por inteiro. Só o que entrou de verdade em cada publicação.
const COR_SECAO = { novo: 'bg-teal-600', melhorias: 'bg-blue-600', seguranca: 'bg-amber-600', correcoes: 'bg-slate-500' }
const total = (v) => SECOES.reduce((s, [k]) => s + (v[k]?.length || 0), 0)
const dias = (iso) => Math.round((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86400000)
const haQuanto = (iso) => { const d = dias(iso); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
const ancora = (v) => `v${v.replaceAll('.', '-')}`

export default function Novidades() {
  const { dados, erro } = useDados(() => api.get('/api/novidades'))
  const [tipo, setTipo] = useState('todos')
  const [busca, setBusca] = useState('')
  const parado = useReducedMotion()
  const ir = useCallback((versao) => document.getElementById(ancora(versao))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), [])
  const versoes = dados?.versoes
  const filtradas = useMemo(() => {
    if (!versoes) return []
    const q = busca.trim().toLowerCase()
    return versoes.map((v) => {
      const secoes = SECOES.filter(([k]) => tipo === 'todos' || k === tipo).map(([k, rot, I]) => [k, rot, I, (v[k] || []).filter((t) => !q || t.toLowerCase().includes(q) || v.titulo.toLowerCase().includes(q))])
      return { v, secoes, n: secoes.reduce((s, x) => s + x[3].length, 0) }
    }).filter((x) => x.n > 0 || (!q && tipo === 'todos'))
  }, [versoes, tipo, busca])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  if (!versoes?.length) return <Vazio icone={Search} titulo="Nenhuma versão registrada" texto="As novidades aparecem aqui a cada atualização do sistema." />
  const somas = Object.fromEntries(SECOES.map(([k]) => [k, versoes.reduce((s, v) => s + (v[k]?.length || 0), 0)]))
  const tudo = Object.values(somas).reduce((a, b) => a + b, 0)
  const primeira = versoes[versoes.length - 1]
  const atual = versoes[0]

  return (
    <div className="w-full min-w-0">
      <Cabecalho titulo="Novidades" descricao="Tudo o que mudou em cada versão: recursos novos, melhorias, segurança e correções, da mais nova para a mais antiga." />

      {/* linha do tempo 3D com a versão atual ao lado */}
      <section className="cartao mb-6 grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[220px] min-w-0 overflow-hidden border-b border-border sm:h-[280px] lg:border-b-0 lg:border-r">
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/40" />}><LinhaVersoes3D versoes={versoes} ir={ir} /></Suspense>
        </div>
        <div className="flex flex-col justify-between gap-4 p-5">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2"><Selo cor="verde">Versão atual</Selo><span className="text-xs text-muted-foreground">{dataBR(atual.data)} · {haQuanto(atual.data)}</span></div>
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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        {/* índice das versões (fixo ao rolar no computador) */}
        <nav aria-label="Versões" className="hidden lg:block">
          <ol className="sticky top-20 space-y-0.5 border-l border-border">
            {versoes.map((v, i) => (
              <li key={v.versao}>
                <button onClick={() => ir(v.versao)} className="group -ml-px flex w-full items-start gap-2 border-l-2 border-transparent py-1.5 pl-3 text-left text-sm hover:border-primary">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium tabular">{v.versao}{i === 0 && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-label="atual" />}</span>
                    <span className="block truncate text-xs text-muted-foreground group-hover:text-foreground">{v.titulo}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0">
          {/* filtros */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de mudança">
              {[['todos', 'Tudo', tudo], ...SECOES.map(([k, rot]) => [k, rot, somas[k]])].map(([k, rot, n]) => (
                <button key={k} onClick={() => setTipo(k)} aria-pressed={tipo === k}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${tipo === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {k !== 'todos' && <span className={`h-2 w-2 rounded-full ${COR_SECAO[k]}`} />}{rot}<span className="tabular opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas mudanças" className="campo h-8 pl-8 text-sm" aria-label="Buscar nas mudanças" />
            </label>
          </div>

          {filtradas.length === 0 ? <Vazio icone={Search} titulo="Nada encontrado" texto="Tente outra palavra ou mostre todos os tipos de mudança." /> : (
            <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">
              {filtradas.map(({ v, secoes, n }, i) => (
                <motion.li key={v.versao} id={ancora(v.versao)} className="relative scroll-mt-20 pl-7"
                  initial={parado ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ duration: 0.25, delay: Math.min(i, 4) * 0.03 }}>
                  <span className={`absolute left-0 top-5 h-[15px] w-[15px] rounded-full border-2 border-background ${v === atual ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} aria-hidden />
                  <article className="cartao p-5">
                    <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="text-lg font-semibold tabular">Versão {v.versao}</h2>
                      {v === atual && <Selo cor="verde">Atual</Selo>}
                      <span className="text-xs text-muted-foreground">{dataBR(v.data)} · {haQuanto(v.data)}</span>
                      <span className="ml-auto text-xs tabular text-muted-foreground">{n} de {total(v)} mudança(s)</span>
                      <p className="w-full text-sm font-medium">{v.titulo}</p>
                    </header>
                    {v.resumo && !busca && <p className="mb-4 text-sm text-muted-foreground">{v.resumo}</p>}
                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                      {secoes.filter((x) => x[3].length).map(([k, rot, I, itens]) => (
                        <section key={k} className="min-w-0 rounded-md border border-border p-3">
                          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><span className={`h-2 w-2 rounded-full ${COR_SECAO[k]}`} /><I className="h-4 w-4 text-muted-foreground" aria-hidden />{rot}<span className="ml-auto text-xs font-normal tabular text-muted-foreground">{itens.length}</span></h3>
                          <ul className="space-y-1.5 pl-4 text-sm leading-relaxed">{itens.map((t) => <li key={t} className="list-disc marker:text-muted-foreground">{t}</li>)}</ul>
                        </section>
                      ))}
                    </div>
                  </article>
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
