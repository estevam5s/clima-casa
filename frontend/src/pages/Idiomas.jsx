import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CloudDownload, Download, ExternalLink, Languages, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, Interruptor, Secao, Selo, useToast } from '../components/ui'

// Idiomas do site zynio.com.br (backend/app/idiomas.py): quais idiomas aparecem no seletor do site, quanto de cada um está
// traduzido, tradução pela IA em lotes, revisão à mão e os textos novos vistos por quem visitou.
const SITE = 'https://zynio.com.br'
const FILTROS = [['todos', 'Todos'], ['faltando', 'Sem tradução'], ['ia', 'Feitos pela IA'], ['revisadas', 'Revisados']]

function Linha({ item, idioma, aoSalvar }) {
  const [v, setV] = useState(item.traducao || '')
  const [estado, setEstado] = useState('')
  const ref = useRef(item.traducao || '')
  useEffect(() => { setV(item.traducao || ''); ref.current = item.traducao || '' }, [item.traducao])
  const salvar = async () => {
    if (v.trim() === ref.current.trim()) return
    setEstado('salvando')
    try { await api.put('/api/idiomas/traducao', { texto: item.texto, idioma, traducao: v }); ref.current = v; setEstado('ok'); aoSalvar?.() } catch { setEstado('erro') }
  }
  return (
    <li className="grid grid-cols-1 gap-2 border-b border-border/60 py-3 md:grid-cols-2">
      <div className="min-w-0 text-sm">
        <p className="whitespace-pre-wrap break-words">{item.texto}</p>
        <p className="mt-1 truncate text-[11px] text-muted-foreground">{(item.rotas || []).slice(0, 3).join(' · ')}</p>
      </div>
      <div>
        <textarea lang={idioma} value={v} onChange={(e) => { setV(e.target.value); setEstado('') }} onBlur={salvar} rows={Math.min(5, Math.max(1, Math.ceil(item.texto.length / 60)))}
          className="campo min-h-9 w-full resize-y py-1.5 text-sm" placeholder="Sem tradução" aria-label="Tradução" />
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {item.revisada || estado === 'ok' ? <Selo cor="verde">revisada</Selo> : item.origem === 'ia' ? <Selo cor="azul">IA</Selo> : !item.traducao ? <Selo cor="ambar">falta</Selo> : null}
          {estado === 'salvando' && 'salvando…'}{estado === 'erro' && <span className="text-red-600">não salvou</span>}
          {item.origem === 'ia' && !item.revisada && estado !== 'ok' && item.traducao && <button className="hover:text-foreground" onClick={() => { setV(v); api.put('/api/idiomas/traducao', { texto: item.texto, idioma, traducao: v }).then(() => setEstado('ok')).catch(() => setEstado('erro')) }}>Marcar como revisada</button>}
        </div>
      </div>
    </li>
  )
}

export default function Idiomas() {
  const { sessao } = useProjeto()
  const toast = useToast()
  const [e, setE] = useState(null)
  const [erro, setErro] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [traduzindo, setTraduzindo] = useState(null)   // { idioma, feitos, faltam }
  const parar = useRef(false)
  const [idioma, setIdioma] = useState('en')
  const [filtro, setFiltro] = useState('todos')
  const [q, setQ] = useState('')
  const [lista, setLista] = useState(null)
  const [pagina, setPagina] = useState(0)
  const [pendentes, setPendentes] = useState(null)
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const carregar = useCallback(() => api.get('/api/idiomas').then((r) => { setE(r); setErro(null) }).catch((x) => setErro(x.message)), [])
  const carregarLista = useCallback(() => {
    const p = new URLSearchParams({ idioma, filtro, busca: q, limite: 60, depois: pagina * 60 })
    api.get(`/api/idiomas/textos?${p}`).then(setLista).catch(() => setLista({ itens: [], total: 0 }))
  }, [idioma, filtro, q, pagina])
  useEffect(() => { if (pode) carregar() }, [pode, carregar])
  useEffect(() => { if (pode) { const t = setTimeout(carregarLista, 250); return () => clearTimeout(t) } return undefined }, [pode, carregarLista])
  useEffect(() => { if (pode && e?.pendentes) api.get('/api/idiomas/textos?filtro=pendentes&idioma=en&limite=100').then(setPendentes).catch(() => {}) }, [pode, e?.pendentes])

  const buscar = async () => {
    setBuscando(true)
    try { const r = await api.post('/api/idiomas/buscar'); toast(`${r.novos} texto(s) novo(s), ${r.removidos} fora do site. O site tem ${r.total_site}.`); carregar(); carregarLista() } catch (x) { toast(x.message, 'erro') } finally { setBuscando(false) }
  }
  const traduzir = async (cod, refazer = false) => {
    parar.current = false
    setTraduzindo({ idioma: cod, feitos: 0, faltam: null })
    let feitos = 0, erros = 0
    while (!parar.current) {
      try {
        const r = await api.post('/api/idiomas/traduzir', { idioma: cod, lote: 30, refazer_ia: refazer })
        feitos += r.traduzidos
        setTraduzindo({ idioma: cod, feitos, faltam: r.faltam })
        if (!r.traduzidos || (!refazer && !r.faltam)) break
      } catch (x) {
        if (++erros >= 3) { toast(x.message, 'erro'); break }
      }
    }
    setTraduzindo(null); carregar(); carregarLista()
    toast(`${feitos} texto(s) traduzido(s).`)
  }
  const alternar = async (cod, ligado) => {
    const ativos = e.idiomas.filter((x) => x.codigo !== 'pt' && (x.codigo === cod ? ligado : x.ativo)).map((x) => x.codigo)
    try { setE(await api.put('/api/idiomas', { ativos })) } catch (x) { toast(x.message, 'erro') }
  }
  const decidir = async (aprovar, textos = null) => {
    try { const r = await api.post('/api/idiomas/pendentes', { aprovar, textos }); toast(`${r.n} texto(s) ${aprovar ? 'incluído(s)' : 'descartado(s)'}.`); carregar(); setPendentes(null) } catch (x) { toast(x.message, 'erro') }
  }

  if (!sessao) return <Esqueleto className="h-64" />
  if (!pode) return <Aviso>Só o dono e os administradores mexem nos idiomas do site.</Aviso>
  if (erro) return <Aviso>{erro}</Aviso>
  if (!e) return <Esqueleto className="h-72" />
  const atual = e.idiomas.find((x) => x.codigo === idioma)
  return (
    <>
      <Cabecalho titulo="Idiomas do site" descricao={`O site zynio.com.br em português e mais ${e.idiomas.length - 1} idiomas. O seletor fica no topo do site, ao lado de Entrar. ${e.total} textos no site.`}
        acoes={<>
          <Botao variante="secundario" icone={CloudDownload} carregando={buscando} onClick={buscar}>Buscar textos do site</Botao>
          <a href={SITE} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-muted">Abrir o site<ExternalLink className="h-3.5 w-3.5" /></a>
        </>} />
      {!e.total && <div className="mb-5"><Aviso tipo="alerta">Nenhum texto cadastrado ainda. Use “Buscar textos do site” depois de publicar o site (a publicação gera a lista).</Aviso></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {e.idiomas.map((x) => {
          const ocupado = traduzindo?.idioma === x.codigo
          return (
            <div key={x.codigo} className={`cartao p-4 ${idioma === x.codigo ? 'ring-1 ring-primary/40' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium"><span className="rounded border border-border px-1.5 text-[11px] font-semibold uppercase tabular text-muted-foreground">{x.codigo}</span>{x.nome}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{x.codigo === 'pt' ? 'Idioma original do site' : `${x.feitas} de ${e.total} · ${x.revisadas} revisados`}</p>
                </div>
                {x.codigo !== 'pt' && <Interruptor ligado={x.ativo} onChange={(v) => alternar(x.codigo, v)} rotulo={`Mostrar ${x.nome} no site`} />}
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${x.cobertura}%` }} /></div>
              <p className="mt-1 text-[11px] text-muted-foreground">{x.cobertura}% traduzido{x.ultima ? ` · atualizado ${haQuanto(x.ultima)}` : ''}</p>
              {x.codigo !== 'pt' && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ocupado ? (
                    <Botao tamanho="sm" variante="secundario" icone={X} onClick={() => { parar.current = true }}>Parar ({traduzindo.feitos}{traduzindo.faltam != null ? `, faltam ${traduzindo.faltam}` : ''})</Botao>
                  ) : (
                    <Botao tamanho="sm" icone={Sparkles} disabled={!!traduzindo || !x.faltam} onClick={() => traduzir(x.codigo)}>{x.faltam ? `Traduzir ${x.faltam} com IA` : 'Tudo traduzido'}</Botao>
                  )}
                  <Botao tamanho="sm" variante="secundario" onClick={() => { setIdioma(x.codigo); setPagina(0) }}>Revisar</Botao>
                  <a href={`${SITE}/?lang=${x.codigo}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Ver<ExternalLink className="h-3 w-3" /></a>
                  <button onClick={() => api.baixar(`/api/idiomas/exportar/${x.codigo}`).catch((y) => toast(y.message, 'erro'))} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-3 w-3" />JSON</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!!e.pendentes && (
        <Secao className="mt-6" titulo={`Textos novos vistos no site (${e.pendentes})`} contexto="Apareceram para quem visitou em outro idioma (mensagens depois de enviar um formulário, avisos). Só valem depois de incluir."
          acao={<div className="flex gap-2"><Botao tamanho="sm" icone={Check} onClick={() => decidir(true)}>Incluir todos</Botao><Botao tamanho="sm" variante="secundario" onClick={() => decidir(false)}>Descartar todos</Botao></div>}>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm">{(pendentes?.itens || []).map((p) => (
            <li key={p.texto} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{p.texto}</span>
              <button className="rounded p-1 text-emerald-600 hover:bg-muted" title="Incluir" onClick={() => decidir(true, [p.texto])}><Check className="h-4 w-4" /></button>
              <button className="rounded p-1 text-muted-foreground hover:bg-muted" title="Descartar" onClick={() => decidir(false, [p.texto])}><X className="h-4 w-4" /></button></li>))}
          </ul>
        </Secao>
      )}

      <Secao className="mt-6" titulo={`Revisar: ${atual?.nome || ''}`} contexto="A tradução salva ao sair do campo. Texto revisado à mão a IA não muda mais. Apagar o campo volta a ficar sem tradução."
        acao={atual && atual.ia > 0 && !traduzindo && <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={() => traduzir(idioma, true)}>Refazer o que a IA fez</Botao>}>
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <select className="campo h-9 lg:w-44" value={idioma} onChange={(x) => { setIdioma(x.target.value); setPagina(0) }} aria-label="Idioma">
            {e.idiomas.filter((x) => x.codigo !== 'pt').map((x) => <option key={x.codigo} value={x.codigo}>{x.nome}</option>)}
          </select>
          <div className="flex rounded-lg border border-border p-0.5">{FILTROS.map(([k, n]) => <button key={k} onClick={() => { setFiltro(k); setPagina(0) }} className={`rounded-md px-2.5 py-1 text-sm ${filtro === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
          <label className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input type="search" autoComplete="off" className="campo h-9 w-full pl-8" placeholder="Buscar no texto ou na tradução" value={q} onChange={(x) => { setQ(x.target.value); setPagina(0) }} /></label>
        </div>
        {!lista ? <Esqueleto className="h-48" /> : !lista.itens.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground"><Languages className="mx-auto mb-2 h-6 w-6" />Nada aqui com esse filtro.</p>
        ) : (
          <>
            <ul>{lista.itens.map((it) => <Linha key={it.texto} item={it} idioma={idioma} />)}</ul>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>{pagina * 60 + 1} a {pagina * 60 + lista.itens.length} de {lista.total}</span>
              <div className="flex gap-2"><Botao tamanho="sm" variante="secundario" disabled={!pagina} onClick={() => setPagina(pagina - 1)}>Anterior</Botao><Botao tamanho="sm" variante="secundario" disabled={(pagina + 1) * 60 >= lista.total} onClick={() => setPagina(pagina + 1)}>Próxima</Botao></div>
            </div>
          </>
        )}
      </Secao>
    </>
  )
}
