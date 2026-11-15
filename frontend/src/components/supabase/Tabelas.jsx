import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Download, KeyRound, Link2, Lock, RefreshCw, Search, ShieldAlert, ShieldCheck, Table2, X } from 'lucide-react'
import { api } from '../../api'
import { Aviso, Botao, useDados, useToast } from '../ui'
import { Copiar, Grade, baixarTexto, kb, num, paraCsv } from './comum'

function Dados({ nome, aoAbrirLinha }) {
  const toast = useToast()
  const [pag, setPag] = useState(1)
  const [por, setPor] = useState(50)
  const [ordem, setOrdem] = useState('')
  const [dir, setDir] = useState('desc')
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  useEffect(() => { setPag(1); setOrdem(''); setBusca(''); setTermo('') }, [nome])
  useEffect(() => { const t = setTimeout(() => { setTermo(busca); setPag(1) }, 350); return () => clearTimeout(t) }, [busca])
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/supabase/tabelas/${encodeURIComponent(nome)}/linhas?pagina=${pag}&por_pagina=${por}&ordem=${ordem}&direcao=${dir}&busca=${encodeURIComponent(termo)}`), [nome, pag, por, ordem, dir, termo])
  const ordenar = (c) => { if (ordem === c || (!ordem && dados?.ordem === c)) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setOrdem(c); setDir('asc') } setPag(1) }
  const paginas = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1
  const exportar = () => { if (!dados) return; baixarTexto(`${nome}-pagina-${pag}.csv`, paraCsv(dados.colunas.map((c) => c.nome), dados.linhas)); toast('CSV da página baixado.') }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar linhas" className="campo h-8 w-56 pl-8 text-sm" />
        </label>
        <button onClick={recarregar} title="Atualizar" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
        <button onClick={exportar} title="Baixar CSV desta página" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-4 w-4" /></button>
        <span className="ml-auto text-xs text-muted-foreground">Só leitura · colunas com segredo aparecem ocultas</span>
      </div>
      <div className="relative min-h-0 flex-1">
        {erro && <div className="p-4"><Aviso>{erro}</Aviso></div>}
        {!dados && !erro && <p className="p-6 text-sm text-muted-foreground">Carregando linhas…</p>}
        {dados && (dados.linhas.length ? (
          <Grade colunas={dados.colunas.map((c) => c.nome)} tipos={Object.fromEntries(dados.colunas.map((c) => [c.nome, c.sensivel ? `${c.tipo} · oculto` : c.tipo]))}
            linhas={dados.linhas} ordem={dados.ordem} direcao={dados.direcao} aoOrdenar={ordenar} aoAbrir={aoAbrirLinha} />
        ) : <p className="p-10 text-center text-sm text-muted-foreground">{termo ? 'Nenhuma linha com esse filtro.' : 'Tabela vazia.'}</p>)}
      </div>
      {dados && (
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{dados.total ? `Linhas ${num((pag - 1) * dados.por_pagina + 1)}–${num(Math.min(pag * dados.por_pagina, dados.total))} de ${num(dados.total)}` : '0 linhas'}</span>
          <select value={por} onChange={(e) => { setPor(Number(e.target.value)); setPag(1) }} className="campo h-7 w-auto py-0 text-xs">{[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} por página</option>)}</select>
          <div className="ml-auto flex items-center gap-1">
            <button disabled={pag <= 1} onClick={() => setPag(pag - 1)} className="rounded-md border border-border p-1 disabled:opacity-40" aria-label="Página anterior"><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-2 tabular-nums">Página {pag} de {paginas}</span>
            <button disabled={pag >= paginas} onClick={() => setPag(pag + 1)} className="rounded-md border border-border p-1 disabled:opacity-40" aria-label="Próxima página"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

function Estrutura({ nome, verDdl }) {
  const { dados, erro } = useDados(() => api.get(`/api/supabase/tabelas/${encodeURIComponent(nome)}/estrutura`), [nome])
  if (erro) return <div className="p-4"><Aviso>{erro}</Aviso></div>
  if (!dados) return <p className="p-6 text-sm text-muted-foreground">Carregando a estrutura…</p>
  if (verDdl) return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mb-2 flex justify-end"><Copiar texto={dados.ddl} rotulo="Copiar SQL" /></div>
      <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-[12.5px] leading-relaxed">{dados.ddl}{dados.indices.filter((i) => !i.primario).map((i) => `\n${i.definicao};`).join('')}{dados.rls ? `\nALTER TABLE public."${nome}" ENABLE ROW LEVEL SECURITY;` : ''}{dados.politicas.map((p) => `\nCREATE POLICY "${p.nome}" ON public."${nome}" FOR ${p.comando} TO ${p.papeis.replace(/[{}]/g, '')}${p.usando ? ` USING (${p.usando})` : ''}${p.checagem ? ` WITH CHECK (${p.checagem})` : ''};`).join('')}</pre>
    </div>
  )
  const Bloco = ({ titulo, vazio, children, n }) => (
    <section className="cartao">
      <h3 className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm font-semibold">{titulo}<span className="text-xs font-normal text-muted-foreground">{n}</span></h3>
      {n ? children : <p className="px-4 py-4 text-sm text-muted-foreground">{vazio}</p>}
    </section>
  )
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      <Bloco titulo="Colunas" n={dados.colunas.length}>
        <table className="tabela w-full text-sm"><thead><tr><th>Nome</th><th>Tipo</th><th>Nulo</th><th>Padrão</th></tr></thead>
          <tbody>{dados.colunas.map((c) => (
            <tr key={c.nome}><td className="font-mono text-[13px]"><span className="flex items-center gap-1.5">{c.pk && <KeyRound className="h-3.5 w-3.5 text-amber-500" title="Chave primária" />}{c.nome}{c.sensivel && <Lock className="h-3 w-3 text-muted-foreground" title="Valor oculto no editor" />}</span>{c.descricao && <span className="block font-sans text-xs text-muted-foreground">{c.descricao}</span>}</td>
              <td className="font-mono text-xs text-sky-700 dark:text-sky-300">{c.tipo === 'USER-DEFINED' || c.tipo === 'ARRAY' ? c.tipo_pg : c.tipo}{c.identidade ? ' · identity' : ''}</td>
              <td className="text-xs">{c.nulo ? 'sim' : <span className="font-medium">não</span>}</td>
              <td className="max-w-[260px] truncate font-mono text-xs text-muted-foreground" title={c.padrao || ''}>{c.padrao || '—'}</td></tr>
          ))}</tbody></table>
      </Bloco>
      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="Políticas RLS" n={dados.politicas.length} vazio={dados.rls ? 'RLS ligado sem política: só o servidor acessa (seguro).' : 'RLS desligado nesta tabela.'}>
          <ul className="divide-y divide-border">{dados.politicas.map((p) => <li key={p.nome} className="px-4 py-2.5 text-sm"><p className="font-medium">{p.nome} <span className="ml-1 rounded bg-muted px-1.5 py-px text-[11px] font-normal">{p.comando}</span></p><p className="mt-0.5 font-mono text-xs text-muted-foreground">para {p.papeis.replace(/[{}]/g, '')}{p.usando ? ` · using (${p.usando})` : ''}</p></li>)}</ul>
        </Bloco>
        <Bloco titulo="Índices" n={dados.indices.length} vazio="Sem índices.">
          <ul className="divide-y divide-border">{dados.indices.map((i) => <li key={i.nome} className="px-4 py-2.5 text-sm"><p className="flex justify-between gap-2"><span className="font-medium">{i.nome}</span><span className="shrink-0 text-xs text-muted-foreground">{kb(i.bytes)} · {num(i.usos)} uso(s)</span></p><p className="mt-0.5 truncate font-mono text-xs text-muted-foreground" title={i.definicao}>{i.definicao.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /, '')}</p></li>)}</ul>
        </Bloco>
        <Bloco titulo="Relacionamentos" n={dados.fks.length + dados.referenciada_por.length} vazio="Não aponta para outras tabelas e ninguém aponta para ela.">
          <ul className="divide-y divide-border">
            {dados.fks.map((f) => <li key={f.nome} className="flex items-start gap-2 px-4 py-2.5 text-sm"><Link2 className="mt-0.5 h-4 w-4 text-primary" /><span>aponta para <span className="font-mono">{f.referencia}</span><span className="block font-mono text-xs text-muted-foreground">{f.definicao}</span></span></li>)}
            {dados.referenciada_por.map((f) => <li key={f.nome} className="flex items-start gap-2 px-4 py-2.5 text-sm"><Link2 className="mt-0.5 h-4 w-4 rotate-180 text-muted-foreground" /><span><span className="font-mono">{f.tabela}</span> aponta para esta<span className="block font-mono text-xs text-muted-foreground">{f.definicao}</span></span></li>)}
          </ul>
        </Bloco>
        <Bloco titulo="Restrições e gatilhos" n={dados.restricoes.length + dados.gatilhos.length} vazio="Nenhuma.">
          <ul className="divide-y divide-border">
            {dados.restricoes.map((r) => <li key={r.nome} className="px-4 py-2.5 text-sm"><p className="font-medium">{r.nome} <span className="ml-1 text-xs font-normal text-muted-foreground">{{ p: 'chave primária', u: 'única', c: 'checagem' }[r.tipo]}</span></p><p className="font-mono text-xs text-muted-foreground">{r.definicao}</p></li>)}
            {dados.gatilhos.map((g) => <li key={g.nome} className="px-4 py-2.5 text-sm"><p className="font-medium">{g.nome} <span className="ml-1 text-xs font-normal text-muted-foreground">gatilho</span></p><p className="truncate font-mono text-xs text-muted-foreground">{g.definicao}</p></li>)}
          </ul>
        </Bloco>
      </div>
    </div>
  )
}

export default function Tabelas({ inicial }) {
  const { dados: lista } = useDados(() => api.get('/api/supabase/tabelas'))
  const [atual, setAtual] = useState(inicial || null)
  const [aba, setAba] = useState('dados')
  const [filtro, setFiltro] = useState('')
  const [linha, setLinha] = useState(null)
  useEffect(() => { if (inicial) setAtual(inicial) }, [inicial])
  useEffect(() => { if (!atual && lista?.length) setAtual(lista.find((t) => t.nome === 'aparelhos')?.nome || lista[0].nome) }, [lista, atual])
  const visiveis = useMemo(() => (lista || []).filter((t) => t.nome.includes(filtro.toLowerCase())), [lista, filtro])
  const info = lista?.find((t) => t.nome === atual)
  return (
    <div className="-m-4 flex h-[calc(100dvh-4rem)] sm:-m-6">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">schema <span className="font-mono text-foreground">public</span></p>
          <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" /><input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Procurar tabela" className="campo h-8 pl-8 text-sm" /></label>
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5">
          {!lista && <li className="p-3 text-xs text-muted-foreground">Carregando…</li>}
          {visiveis.map((t) => (
            <li key={t.nome}>
              <button onClick={() => { setAtual(t.nome); setLinha(null) }} className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${atual === t.nome ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                <Table2 className="h-3.5 w-3.5 shrink-0" /><span className="flex-1 truncate font-mono">{t.nome}</span>
                {!t.rls && <ShieldAlert className="h-3.5 w-3.5 text-red-500" title="RLS desligado" />}
                <span className="text-[11px] tabular-nums opacity-70">{t.linhas >= 1000 ? `${(t.linhas / 1000).toFixed(1)}k` : t.linhas}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-3 py-2">
          <select value={atual || ''} onChange={(e) => setAtual(e.target.value)} className="campo h-8 w-auto font-mono text-sm lg:hidden">{(lista || []).map((t) => <option key={t.nome}>{t.nome}</option>)}</select>
          <h2 className="hidden font-mono text-[15px] font-semibold lg:block">{atual}</h2>
          {info && <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${info.rls ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/15 text-red-700 dark:text-red-300'}`}>{info.rls ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}{info.rls ? `RLS ligado · ${info.politicas} política(s)` : 'RLS desligado'}</span>}
          {info && <span className="text-xs text-muted-foreground">{num(info.linhas)} linhas · {kb(info.bytes)}</span>}
          <div className="ml-auto flex rounded-lg border border-border p-0.5 text-sm">
            {[['dados', 'Dados'], ['estrutura', 'Estrutura'], ['ddl', 'Definição']].map(([k, r]) => (
              <button key={k} onClick={() => setAba(k)} className={`relative rounded-md px-3 py-1 ${aba === k ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                {aba === k && <motion.span layoutId="aba-tabela" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', duration: 0.3 }} />}<span className="relative">{r}</span>
              </button>
            ))}
          </div>
        </div>
        {atual && (aba === 'dados' ? <Dados nome={atual} aoAbrirLinha={setLinha} /> : <Estrutura nome={atual} verDdl={aba === 'ddl'} />)}
        <AnimatePresence>
          {linha && (
            <motion.aside initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.18 }}
              className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-card shadow-2xl sm:w-[420px]"> {/* marca: gaveta flutua */}
              <div className="flex items-center gap-2 border-b border-border px-4 py-3"><p className="flex-1 text-sm font-semibold">Linha de <span className="font-mono">{atual}</span></p><Copiar texto={JSON.stringify(linha, null, 2)} rotulo="Copiar JSON" /><button onClick={() => setLinha(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button></div>
              <dl className="flex-1 divide-y divide-border overflow-y-auto">
                {Object.entries(linha).map(([k, v]) => (
                  <div key={k} className="px-4 py-2.5"><dt className="font-mono text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[13px]">{v === null ? <span className="text-muted-foreground/60">NULL</span> : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</dd></div>
                ))}
              </dl>
              <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">O editor é só de leitura. Mudanças nos dados são feitas pelas telas do sistema.</p>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
