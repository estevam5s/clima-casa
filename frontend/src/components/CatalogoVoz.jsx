import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Play, Search } from 'lucide-react'
import { catalogo, categorias, contar } from '../vozAlexa'

// Lista de frases da Alexa gerada por modelos (pode ter centenas de milhares): categorias, busca, paginação,
// copiar e, quando a frase tem uma ação equivalente no painel, um botão "Testar".
function Frase({ f, onTestar }) {
  const [ok, setOk] = useState(false)
  const copiar = async () => { try { await navigator.clipboard.writeText(f.texto); setOk(true); setTimeout(() => setOk(false), 1200) } catch { /* sem área de transferência */ } }
  return (
    <li className="group flex items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted">
      <button onClick={copiar} className="min-w-0 flex-1 text-left text-sm" title="Copiar a frase">
        <span className="block">“{f.texto}”</span>
        <span className="block truncate text-[11px] text-muted-foreground">{f.cat} · {f.faz}</span>
      </button>
      {onTestar && f.acao && <button onClick={() => onTestar(f)} className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border px-2 text-[11px] font-medium opacity-70 hover:bg-card hover:opacity-100" title="Fazer pelo painel o mesmo que a frase faz"><Play className="h-3 w-3" />Testar</button>}
      <button onClick={copiar} className="shrink-0 rounded p-1 text-muted-foreground" aria-label="Copiar">{ok ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 opacity-40 group-hover:opacity-80" />}</button>
    </li>
  )
}

export default function CatalogoVoz({ modelos, onTestar, titulo = 'Frases para a Alexa', rodape }) {
  const [cat, setCat] = useState('')
  const [busca, setBusca] = useState('')
  const [atraso, setAtraso] = useState('')
  const [n, setN] = useState(40)
  useEffect(() => { const t = setTimeout(() => setAtraso(busca), 200); return () => clearTimeout(t) }, [busca])
  useEffect(() => setN(40), [cat, atraso, modelos])
  const total = useMemo(() => contar(modelos), [modelos])
  const cats = useMemo(() => categorias(modelos), [modelos])
  const c = useMemo(() => catalogo(modelos, { cat, busca: atraso }), [modelos, cat, atraso])
  const itens = useMemo(() => c.pagina(0, n), [c, n])
  return (
    <section className="cartao">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="titulo-secao">{titulo}</h2><p className="text-xs text-muted-foreground"><b className="text-foreground tabular">{total.toLocaleString('pt-BR')}</b> frases prontas com os seus dados · clique numa frase para copiar</p></div>
          <label className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (ex.: acorda 07:30, rock 80, 23 graus)" className="campo h-9 pl-8" aria-label="Buscar frases" /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button onClick={() => setCat('')} className={`h-7 rounded-full border px-2.5 text-xs ${!cat ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>Todas</button>
          {cats.map((x) => <button key={x.cat} onClick={() => setCat(x.cat === cat ? '' : x.cat)} className={`h-7 rounded-full border px-2.5 text-xs ${cat === x.cat ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{x.cat} <span className="tabular opacity-70">{x.n.toLocaleString('pt-BR')}</span></button>)}
        </div>
      </div>
      <div className="px-3 py-2">
        <p className="px-2.5 pb-1 text-xs text-muted-foreground">{c.total.toLocaleString('pt-BR')} frase(s){atraso ? ` com “${atraso}”` : ''}{cat ? ` em ${cat}` : ''}</p>
        {itens.length ? <ul className="max-h-[32rem] overflow-auto">{itens.map((f) => <Frase key={f.texto} f={f} onTestar={onTestar} />)}</ul> : <p className="px-2.5 py-6 text-sm text-muted-foreground">Nenhuma frase com isso. Tente outra palavra.</p>}
        {n < c.total && <div className="px-2.5 py-2"><button onClick={() => setN((x) => x + 80)} className="h-8 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Mostrar mais ({(c.total - n).toLocaleString('pt-BR')} restantes)</button></div>}
      </div>
      {rodape && <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">{rodape}</div>}
    </section>
  )
}
