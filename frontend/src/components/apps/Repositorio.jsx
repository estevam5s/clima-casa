import { Fragment, Suspense, lazy, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BookOpen, ChevronDown, ChevronRight, Copy, Download, File, FileArchive, Folder, GitBranch, GitCommitHorizontal, History, Lock, Package, Search, Tag } from 'lucide-react'
import { api } from '../../api'
import { Botao, Carregando, NumeroAnimado, Selo, useDados, useToast } from '../ui'

const HorizonteContribuicoes = lazy(() => import('./HorizonteContribuicoes'))

// Código-fonte no formato do GitHub: cabeçalho do repositório (privado, ramo, versão, commits, releases, linguagens),
// abas Código (lista da raiz com o último commit de cada item, navegação pelas pastas, README), Commits (por dia, com
// arquivos e linhas +/−), Versões (notas e arquivos de cada release) e Baixar (zip/tar.gz com SHA-256).
// Dados de GET /api/apps/repositorio, gerado a cada publicação; só dono e admin veem.

const kb = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`)
const relativo = (s) => {
  const d = Date.now() / 1000 - s
  if (d < 3600) return `há ${Math.max(1, Math.round(d / 60))} min`
  if (d < 86400) return `há ${Math.round(d / 3600)} h`
  if (d < 86400 * 30) return `há ${Math.round(d / 86400)} dia(s)`
  return new Date(s * 1000).toLocaleDateString('pt-BR')
}
const iniciais = (n) => n.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

// ---- markdown simples, sem HTML cru (vira elementos React) ----
function inline(texto, k = 0) {
  let txt = texto
  const out = []
  txt = txt.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '')   // imagens/selos e HTML ficam de fora
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g
  let ult = 0, m
  while ((m = re.exec(txt))) {
    if (m.index > ult) out.push(txt.slice(ult, m.index))
    const t = m[0]
    if (t.startsWith('`')) out.push(<code key={`${k}-${m.index}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{t.slice(1, -1)}</code>)
    else if (t.startsWith('**')) out.push(<strong key={`${k}-${m.index}`}>{t.slice(2, -2)}</strong>)
    else {
      const [, rot, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)
      const seguro = /^(https?:|mailto:|#|\/)/.test(href)
      out.push(seguro ? <a key={`${k}-${m.index}`} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{rot}</a> : rot)
    }
    ult = m.index + t.length
  }
  if (ult < txt.length) out.push(txt.slice(ult))
  return out
}
export function Markdown({ texto }) {
  const blocos = useMemo(() => {
    const linhas = (texto || '').replace(/\r/g, '').split('\n')
    const out = []
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      if (/^\s*<\/?[a-zA-Z][^>]*>\s*$/.test(l) || /^\s*(!\[[^\]]*\]\([^)]*\)\s*)+$/.test(l)) continue   // linha só de HTML ou de selos
      if (/^```/.test(l)) { const ini = i + 1; while (i + 1 < linhas.length && !/^```/.test(linhas[i + 1])) i++; out.push({ t: 'code', v: linhas.slice(ini, i + 1).join('\n') }); i++; continue }
      if (/^#{1,6}\s/.test(l)) { out.push({ t: 'h', n: l.match(/^#+/)[0].length, v: l.replace(/^#+\s*/, '') }); continue }
      if (/^\s*\|/.test(l)) { const rows = []; while (i < linhas.length && /^\s*\|/.test(linhas[i])) { rows.push(linhas[i]); i++ } i--; out.push({ t: 'tab', v: rows.filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())) }); continue }
      if (/^\s*([-*]|\d+\.)\s/.test(l)) { const itens = []; const ord = /^\s*\d+\./.test(l); while (i < linhas.length && /^\s*([-*]|\d+\.)\s/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*([-*]|\d+\.)\s/, '')); i++ } i--; out.push({ t: ord ? 'ol' : 'ul', v: itens }); continue }
      if (/^>\s?/.test(l)) { out.push({ t: 'q', v: l.replace(/^>\s?/, '') }); continue }
      if (/^(-{3,}|\*{3,})$/.test(l.trim())) { out.push({ t: 'hr' }); continue }
      if (l.trim()) { let p = l; while (i + 1 < linhas.length && linhas[i + 1].trim() && !/^(#|```|\s*\||\s*([-*]|\d+\.)\s|>)/.test(linhas[i + 1])) p += ` ${linhas[++i]}`; out.push({ t: 'p', v: p }) }
    }
    return out
  }, [texto])
  const H = ['', 'text-xl font-semibold border-b border-border pb-1.5 mt-6', 'text-lg font-semibold border-b border-border pb-1 mt-6', 'text-base font-semibold mt-5', 'text-sm font-semibold mt-4', 'text-sm font-semibold mt-3', 'text-xs font-semibold mt-3']
  return (
    <div className="space-y-3 text-sm leading-relaxed [&>*:first-child]:mt-0">
      {blocos.map((b, i) => {
        if (b.t === 'h') { const T = `h${Math.min(6, b.n + 1)}`; return <T key={i} className={H[b.n]}>{inline(b.v, i)}</T> }
        if (b.t === 'code') return <pre key={i} className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{b.v}</code></pre>
        if (b.t === 'ul') return <ul key={i} className="list-disc space-y-1 pl-5">{b.v.map((x, k) => <li key={k}>{inline(x, `${i}-${k}`)}</li>)}</ul>
        if (b.t === 'ol') return <ol key={i} className="list-decimal space-y-1 pl-5">{b.v.map((x, k) => <li key={k}>{inline(x, `${i}-${k}`)}</li>)}</ol>
        if (b.t === 'q') return <blockquote key={i} className="border-l-2 border-border pl-3 text-muted-foreground">{inline(b.v, i)}</blockquote>
        if (b.t === 'hr') return <hr key={i} className="border-border" />
        if (b.t === 'tab') return (
          <div key={i} className="overflow-x-auto"><table className="tabela text-xs"><thead><tr>{b.v[0]?.map((c, k) => <th key={k}>{inline(c, k)}</th>)}</tr></thead>
            <tbody>{b.v.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c, `${k}-${j}`)}</td>)}</tr>)}</tbody></table></div>
        )
        return <p key={i}>{inline(b.v, i)}</p>
      })}
    </div>
  )
}

function Avatar({ nome, pequeno }) {
  const cor = nome === 'Claude' ? 'bg-[#d97757]/15 text-[#b4532a]' : 'bg-primary/15 text-primary'
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${cor} ${pequeno ? 'h-5 w-5 text-[9px]' : 'h-7 w-7 text-[11px]'}`} aria-hidden>{iniciais(nome)}</span>
}

function Copiar({ texto }) {
  const toast = useToast()
  return <button onClick={() => { navigator.clipboard?.writeText(texto); toast('Copiado.') }} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copiar" aria-label="Copiar"><Copy className="h-3.5 w-3.5" /></button>
}

function Codigo({ r }) {
  const [pasta, setPasta] = useState('')
  const itens = useMemo(() => {
    if (!pasta) return r.raiz.map((x) => ({ nome: x.nome, pasta: x.pasta, ultimo: x.ultimo }))
    const pre = `${pasta}/`, mapa = new Map()
    for (const f of r.arquivos) {
      if (!f.caminho.startsWith(pre)) continue
      const resto = f.caminho.slice(pre.length), [primeiro] = resto.split('/')
      const ehPasta = resto.includes('/')
      const at = mapa.get(primeiro) || { nome: primeiro, pasta: ehPasta, tamanho: 0, arquivos: 0 }
      at.tamanho += f.tamanho; at.arquivos += 1; mapa.set(primeiro, at)
    }
    return [...mapa.values()].sort((a, b) => (b.pasta - a.pasta) || a.nome.localeCompare(b.nome))
  }, [pasta, r])
  const ult = r.commits[0]
  const partes = pasta ? pasta.split('/') : []
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs">
          <Avatar nome={ult.autor} pequeno />
          <span className="font-medium">{ult.autor}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{ult.titulo}</span>
          <code className="text-muted-foreground">{ult.curto}</code>
          <span className="text-muted-foreground">· {relativo(ult.quando)}</span>
          <span className="flex items-center gap-1 font-medium"><History className="h-3.5 w-3.5" />{r.total_commits} commits</span>
        </div>
        {pasta && (
          <div className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs">
            <button onClick={() => setPasta('')} className="font-medium text-primary hover:underline">clima-casa</button>
            {partes.map((p, i) => <Fragment key={i}><span className="text-muted-foreground">/</span><button onClick={() => setPasta(partes.slice(0, i + 1).join('/'))} className={i === partes.length - 1 ? 'font-semibold' : 'text-primary hover:underline'}>{p}</button></Fragment>)}
          </div>
        )}
        <ul className="divide-y divide-border text-sm">
          {pasta && <li><button onClick={() => setPasta(partes.slice(0, -1).join('/'))} className="w-full px-3 py-2 text-left text-muted-foreground hover:bg-muted/50">..</button></li>}
          {itens.map((x) => (
            <li key={x.nome} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40">
              {x.pasta ? <Folder className="h-4 w-4 shrink-0 text-sky-600" /> : <File className="h-4 w-4 shrink-0 text-muted-foreground" />}
              {x.pasta ? <button onClick={() => setPasta(pasta ? `${pasta}/${x.nome}` : x.nome)} className="min-w-0 truncate text-left hover:text-primary hover:underline">{x.nome}</button> : <span className="min-w-0 truncate">{x.nome}</span>}
              <span className="ml-auto hidden min-w-0 flex-1 truncate text-right text-xs text-muted-foreground sm:block">{x.ultimo ? x.ultimo.titulo : x.pasta ? `${x.arquivos} arquivo(s)` : ''}</span>
              <span className="w-20 shrink-0 text-right text-xs tabular text-muted-foreground">{x.ultimo ? relativo(x.ultimo.quando) : kb(x.tamanho)}</span>
            </li>
          ))}
        </ul>
      </div>
      {!pasta && (
        <div className="rounded-lg border border-border">
          <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-medium"><BookOpen className="h-3.5 w-3.5" />README.md</p>
          <div className="max-h-[640px] overflow-y-auto p-5"><Markdown texto={r.readme} /></div>
        </div>
      )}
    </div>
  )
}

const chaveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const DIAS_HORIZONTE = 371   // 53 semanas, como no GitHub

function Commits({ r }) {
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null)
  const [medida, setMedida] = useState('commits')   // commits | linhas
  const [dia, setDia] = useState(null)               // 'AAAA-MM-DD' escolhido no horizonte
  const [mostrar, setMostrar] = useState(40)
  const [semanas, setSemanas] = useState(12)
  const reduzir = useReducedMotion()
  const tags = useMemo(() => Object.fromEntries((r.releases || []).filter((x) => x.sha).map((x) => [x.sha, x.tag])), [r])
  const fim = useMemo(() => new Date(), [])
  // série por dia (do mais antigo para hoje) a partir de todos os commits do repositorio.json
  const { serie, numeros } = useMemo(() => {
    const porDia = {}
    let mais = 0, menos = 0
    const autores = new Set()
    for (const c of r.commits) {
      const k = chaveDia(new Date(c.quando * 1000))
      const v = medida === 'commits' ? 1 : (c.mais + c.menos)
      porDia[k] = (porDia[k] || 0) + v
      mais += c.mais; menos += c.menos
      autores.add(c.autor); (c.coautores || []).forEach((a) => autores.add(a))
    }
    const lista = []
    for (let i = DIAS_HORIZONTE - 1; i >= 0; i--) lista.push(porDia[chaveDia(new Date(fim.getTime() - i * 86400000))] || 0)
    const ativos = Object.keys(porDia).length
    return { serie: lista, numeros: { commits: r.commits.length, mais, menos, autores: autores.size, ativos, media: ativos ? r.commits.length / ativos : 0 } }
  }, [r, medida, fim])
  const lista = r.commits.filter((c) => (!busca || `${c.titulo} ${c.corpo} ${c.curto} ${c.autor}`.toLowerCase().includes(busca.toLowerCase()))
    && (!dia || chaveDia(new Date(c.quando * 1000)) === dia))
  const dias = []
  for (const c of lista.slice(0, mostrar)) {
    const d = new Date(c.quando * 1000).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    if (!dias.length || dias[dias.length - 1][0] !== d) dias.push([d, []])
    dias[dias.length - 1][1].push(c)
  }
  const escolherDia = (d, v) => { if (!v) return; const k = chaveDia(d); setDia((x) => (x === k ? null : k)); setMostrar(40) }
  const NUMS = [['Commits', numeros.commits], ['Linhas adicionadas', numeros.mais, 'text-emerald-600 dark:text-emerald-400', '+'], ['Linhas removidas', numeros.menos, 'text-red-600 dark:text-red-400', '−'],
    ['Autores', numeros.autores], ['Dias com commit', numeros.ativos], ['Commits por dia ativo', Math.round(numeros.media * 10) / 10]]
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {NUMS.map(([rot, v, cor, pre], i) => (
          <motion.div key={rot} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }} className="rounded-lg border border-border px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{rot}</dt>
            <dd className={`tabular text-xl font-semibold ${cor || ''}`}>{pre}<NumeroAnimado valor={v} casas={rot.includes('por dia') ? 1 : 0} /></dd>
          </motion.div>))}
      </dl>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="O que medir">
            {[['commits', 'Commits'], ['linhas', 'Linhas alteradas']].map(([k, rot]) => (
              <button key={k} role="tab" aria-selected={medida === k} onClick={() => setMedida(k)} className={`rounded-md px-2.5 py-1 text-sm ${medida === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{rot}</button>))}
          </div>
          <div className="flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Período">
            {[[12, '12 semanas'], [26, '6 meses'], [53, '1 ano']].map(([k, rot]) => (
              <button key={k} role="tab" aria-selected={semanas === k} onClick={() => setSemanas(k)} className={`rounded-md px-2.5 py-1 text-sm ${semanas === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{rot}</button>))}
          </div>
          <p className="w-full text-xs text-muted-foreground">Clique num dia para ver só os commits dele. No horizonte, arraste para girar; as setas do teclado leem cada dia.</p>
        </div>
        <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl bg-muted" />}>
          <HorizonteContribuicoes key={`${medida}-${semanas}`} semanas={semanas} periodo={{ 12: 'nas últimas 12 semanas', 26: 'nos últimos 6 meses', 53: 'no último ano' }[semanas]} title={medida === 'commits' ? 'Commits no repositório' : 'Linhas alteradas por dia'} data={serie} endDate={fim}
            noun={medida === 'commits' ? ['commit', 'commits'] : ['linha', 'linhas']} defaultSkyline sound={false} className="!max-w-none" onDia={escolherDia} />
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block w-full max-w-sm"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => { setBusca(e.target.value); setMostrar(40) }} placeholder="Buscar nos commits (título, autor, código)" className="campo h-9 pl-8" type="search" autoComplete="off" /></label>
        {dia && <button onClick={() => setDia(null)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs text-primary hover:bg-primary/15">
          Só {new Date(`${dia}T12:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} · limpar</button>}
        <span className="text-xs text-muted-foreground">{lista.length} commit(s)</span>
      </div>
      <div className="relative">
        <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px bg-border" />
        {dias.map(([d, cs]) => (
          <section key={d} className="relative mb-5 pl-10">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="absolute left-[9px] grid h-[13px] w-[13px] place-items-center rounded-full border-2 border-primary bg-background" aria-hidden />
              <GitCommitHorizontal className="h-4 w-4" />{d} · {cs.length} commit(s)</p>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {cs.map((c, i) => (
                <motion.li key={c.sha} initial={reduzir ? false : { opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-20px' }}
                  transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.035 }}>
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <Avatar nome={c.autor} />
                    <div className="min-w-0 flex-1">
                      <button onClick={() => setAberto(aberto === c.sha ? null : c.sha)} aria-expanded={aberto === c.sha} className="text-left text-sm font-medium hover:text-primary hover:underline">{c.titulo}</button>
                      {tags[c.sha] && <span className="ml-2 inline-block"><Selo cor="verde"><Tag className="mr-1 inline h-3 w-3" />{tags[c.sha]}</Selo></span>}
                      <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <b className="font-medium text-foreground">{c.autor}</b>{c.coautores.length > 0 && <>e {c.coautores.join(', ')}</>} fez o commit {relativo(c.quando)}
                        <span className="tabular text-emerald-600">+{c.mais}</span><span className="tabular text-red-600">−{c.menos}</span>
                        <span>· {c.total_arquivos} arquivo(s)</span>
                      </p>
                      {/* barra proporcional de linhas: cresce ao aparecer */}
                      <div className="mt-1.5 flex h-1 max-w-[220px] overflow-hidden rounded-full bg-muted" aria-hidden>
                        <motion.i className="block h-full bg-emerald-500" initial={{ width: 0 }} whileInView={{ width: `${(c.mais / Math.max(1, c.mais + c.menos)) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
                        <motion.i className="block h-full bg-red-500" initial={{ width: 0 }} whileInView={{ width: `${(c.menos / Math.max(1, c.mais + c.menos)) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }} />
                      </div>
                    </div>
                    <code className="hidden rounded border border-border px-1.5 py-0.5 text-xs sm:block" translate="no">{c.curto}</code>
                    <Copiar texto={c.sha} />
                  </div>
                  <AnimatePresence initial={false}>
                    {aberto === c.sha && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                        <div className="border-t border-border bg-muted/30 px-4 py-3">
                          {c.corpo && <pre className="mb-3 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{c.corpo}</pre>}
                          <p className="mb-1.5 text-xs text-muted-foreground">Commit <code>{c.sha}</code>{c.pais[0] && <> · pai <code>{c.pais[0].slice(0, 7)}</code></>}</p>
                          <ul className="max-h-72 space-y-0.5 overflow-y-auto text-xs">
                            {c.arquivos.map((f) => {
                              const t = f.mais + f.menos || 1
                              return (
                                <li key={f.caminho} className="flex items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate font-mono" translate="no">{f.caminho}</span>
                                  {f.binario ? <span className="text-muted-foreground">binário</span> : <><span className="w-12 text-right tabular text-emerald-600">+{f.mais}</span><span className="w-12 text-right tabular text-red-600">−{f.menos}</span>
                                    <span className="flex w-16 gap-px" aria-hidden>{Array.from({ length: 5 }, (_, k) => <i key={k} className={`h-2 flex-1 ${k < Math.round((f.mais / t) * 5) ? 'bg-emerald-500' : k < Math.round((f.mais / t) * 5) + Math.round((f.menos / t) * 5) ? 'bg-red-500' : 'bg-muted-foreground/25'}`} />)}</span></>}
                                </li>
                              )
                            })}
                            {c.total_arquivos > c.arquivos.length && <li className="text-muted-foreground">+ {c.total_arquivos - c.arquivos.length} arquivo(s)</li>}
                          </ul>
                          <a href={`https://github.com/${r.repositorio}/commit/${c.sha}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-primary hover:underline">Ver no GitHub (precisa de acesso ao repositório)</a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {lista.length > mostrar && <div className="text-center"><Botao variante="secundario" onClick={() => setMostrar((m) => m + 60)}>Mostrar mais ({lista.length - mostrar} restantes)</Botao></div>}
      {!lista.length && <p className="text-sm text-muted-foreground">Nenhum commit {busca ? `com "${busca}"` : 'nesse dia'}.</p>}
    </div>
  )
}

function Baixar({ r, baixar, baixando }) {
  const porRotulo = {}
  for (const p of r.pacotes) (porRotulo[p.rotulo] ||= []).push(p)
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Clonar com o git</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Para quem tem acesso ao repositório privado no GitHub.</p>
        <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">git clone https://github.com/{r.repositorio}.git</code><Copiar texto={`git clone https://github.com/${r.repositorio}.git`} /></div>
      </div>
      {Object.entries(porRotulo).map(([rot, ps]) => (
        <div key={rot} className="rounded-lg border border-border">
          <p className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium"><Package className="h-4 w-4" />{rot}{ps[0].atual && <Selo cor="verde">atual</Selo>}<code className="ml-auto text-xs font-normal text-muted-foreground">{ps[0].sha}</code></p>
          <ul className="divide-y divide-border">
            {ps.map((p) => (
              <li key={p.arquivo} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <FileArchive className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Código-fonte ({p.formato})</span>
                <span className="text-xs tabular text-muted-foreground">{kb(p.tamanho)}</span>
                <span className="hidden min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground md:block" title="SHA-256">{p.sha256}</span>
                <Botao tamanho="sm" variante={p.atual && p.formato === 'zip' ? 'primario' : 'secundario'} icone={Download} carregando={baixando === p.arquivo} onClick={() => baixar(p.arquivo)} className="ml-auto">Baixar</Botao>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!r.pacotes.length && <p className="text-sm text-muted-foreground">Nenhum pacote gerado ainda. Eles são criados a cada publicação.</p>}
    </div>
  )
}

function Versoes({ r }) {
  const [aberta, setAberta] = useState(r.releases?.[0]?.tag)
  return (
    <div className="space-y-3">
      {(r.releases || []).map((v, i) => (
        <div key={v.tag} className="rounded-lg border border-border">
          <button onClick={() => setAberta(aberta === v.tag ? null : v.tag)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
            {aberta === v.tag ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-semibold">{v.nome || v.tag}</span>
            {i === 0 && <Selo cor="verde">mais recente</Selo>}
            <span className="flex items-center gap-1 text-xs text-muted-foreground"><Tag className="h-3 w-3" />{v.tag}</span>
            {v.sha && <code className="text-xs text-muted-foreground">{v.sha.slice(0, 7)}</code>}
            <span className="ml-auto text-xs text-muted-foreground">{new Date(v.publicado_em).toLocaleDateString('pt-BR')}</span>
          </button>
          {aberta === v.tag && (
            <div className="border-t border-border px-5 py-4">
              {v.corpo ? <Markdown texto={v.corpo} /> : <p className="text-sm text-muted-foreground">Sem notas.</p>}
              {v.arquivos.length > 0 && (
                <div className="mt-4">
                  <p className="mb-1.5 text-xs font-medium">Arquivos ({v.arquivos.length})</p>
                  <ul className="divide-y divide-border rounded-md border border-border text-xs">
                    {v.arquivos.map((a) => <li key={a.nome} className="flex items-center gap-2 px-3 py-1.5"><Package className="h-3.5 w-3.5 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{a.nome}</span><span className="tabular text-muted-foreground">{kb(a.tamanho)}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {!r.releases?.length && <p className="text-sm text-muted-foreground">Nenhuma release publicada.</p>}
    </div>
  )
}

export default function Repositorio() {
  const { dados: r, erro } = useDados(() => api.get('/api/apps/repositorio'))
  const [aba, setAba] = useState('codigo')
  const [baixando, setBaixando] = useState(null)
  const toast = useToast()
  if (erro) return <div className="cartao p-5 text-sm text-muted-foreground"><Lock className="mb-2 h-4 w-4" />{erro}</div>
  if (!r) return <Carregando />
  const baixar = async (arq) => {
    setBaixando(arq)
    try { const { url } = await api.get(`/api/apps/codigo/${arq}`); window.location.href = url } catch (e) { toast(e.message, 'erro') } finally { setTimeout(() => setBaixando(null), 1200) }
  }
  const totalBytes = r.linguagens.reduce((s, l) => s + l.bytes, 0) || 1
  const atual = r.pacotes.find((p) => p.atual && p.formato === 'zip')
  const ABAS = [['codigo', 'Código', BookOpen], ['commits', `Commits ${r.total_commits}`, History], ['versoes', `Versões ${r.releases?.length || 0}`, Tag], ['baixar', 'Baixar', Download]]
  return (
    <section className="cartao overflow-hidden" aria-label="Código-fonte">
      <div className="space-y-3 border-b border-border p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold"><span className="font-normal text-muted-foreground">{r.repositorio.split('/')[0]} / </span>{r.repositorio.split('/')[1]}</h2>
          <Selo>Privado</Selo>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {atual && <Botao tamanho="sm" icone={Download} carregando={baixando === atual.arquivo} onClick={() => baixar(atual.arquivo)}>Baixar código (.zip)</Botao>}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><GitBranch className="h-3.5 w-3.5" />{r.ramo}</span>
          <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />versão <b className="font-semibold text-foreground">{r.versao}</b></span>
          <span className="flex items-center gap-1"><History className="h-3.5 w-3.5" />{r.total_commits} commits</span>
          <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" />{r.releases?.length || 0} releases</span>
          <span>{r.arquivos.length} arquivos · {kb(r.arquivos.reduce((s, f) => s + f.tamanho, 0))}</span>
          <span>atualizado {relativo(r.gerado_em)}</span>
        </div>
        <div>
          <div className="flex h-2 overflow-hidden rounded-full">{r.linguagens.map((l) => <span key={l.nome} style={{ width: `${(l.bytes / totalBytes) * 100}%`, background: l.cor }} title={l.nome} />)}</div>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">{r.linguagens.map((l) => <li key={l.nome} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: l.cor }} /><b className="font-medium">{l.nome}</b><span className="text-muted-foreground">{((l.bytes / totalBytes) * 100).toFixed(1)}%</span></li>)}</ul>
        </div>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3" role="tablist">
        {ABAS.map(([k, rot, I]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${aba === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{rot}</button>
        ))}
      </div>
      <div className="p-5">
        {aba === 'codigo' && <Codigo r={r} />}
        {aba === 'commits' && <Commits r={r} />}
        {aba === 'versoes' && <Versoes r={r} />}
        {aba === 'baixar' && <Baixar r={r} baixar={baixar} baixando={baixando} />}
      </div>
    </section>
  )
}
