'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Search, X } from 'lucide-react'

// Linha do tempo de todas as versões do sistema (lib/versoes.json, copiado de backend/app/novidades.json na publicação).
import { ItensVersao, TIPOS, dataLonga, idVersao } from './ItensVersao'

export default function LinhaVersoes({ versoes }) {
  const [tipos, setTipos] = useState(TIPOS.map((t) => t.id))
  const [busca, setBusca] = useState('')
  const [ativa, setAtiva] = useState(versoes[0]?.versao)
  const q = busca.trim().toLowerCase()
  const visiveis = useMemo(() => versoes.filter((v) => {
    const itens = tipos.flatMap((t) => v[t] || [])
    if (!itens.length) return false
    if (!q) return true
    return `${v.versao} ${v.titulo} ${v.resumo}`.toLowerCase().includes(q) || itens.some((x) => x.toLowerCase().includes(q))
  }), [versoes, tipos, q])
  const contagem = (id) => versoes.reduce((n, v) => n + (v[id]?.length || 0), 0)
  // índice acompanha a leitura
  useEffect(() => {
    const obs = new IntersectionObserver((es) => { const e = es.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (e) setAtiva(e.target.dataset.versao) }, { rootMargin: '-20% 0px -70% 0px' })
    document.querySelectorAll('.versao-artigo').forEach((el) => obs.observe(el))
    return () => obs.disconnect()
  }, [visiveis])
  const meses = useMemo(() => {
    const g = []
    for (const v of visiveis) {
      const m = new Date(`${v.data}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      if (!g.length || g[g.length - 1].mes !== m) g.push({ mes: m, itens: [] })
      g[g.length - 1].itens.push(v)
    }
    return g
  }, [visiveis])
  const alternar = (id) => setTipos((t) => (t.includes(id) ? (t.length > 1 ? t.filter((x) => x !== id) : t) : [...t, id]))
  return (
    <div className="versoes">
      <div className="versoes-filtros">
        <div className="chips-tipo" role="group" aria-label="Tipos de mudança">
          {TIPOS.map((t) => (
            <button key={t.id} type="button" aria-pressed={tipos.includes(t.id)} onClick={() => alternar(t.id)} className={tipos.includes(t.id) ? 'ativo' : ''} style={{ '--cor': t.cor }}>
              <i />{t.rotulo}<span>{contagem(t.id)}</span>
            </button>
          ))}
        </div>
        <label className="busca-versoes">
          <Search size={18} />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas versões (ex.: Alexa, mapa, fechadura)" aria-label="Buscar nas versões" />
          {busca && <button type="button" onClick={() => setBusca('')} aria-label="Limpar busca"><X size={16} /></button>}
        </label>
      </div>
      <p className="versoes-total">{visiveis.length} de {versoes.length} versões</p>
      <div className="versoes-grade">
        <nav className="versoes-indice" aria-label="Índice de versões">
          <ul>{visiveis.map((v) => <li key={v.versao}><a href={`#${idVersao(v.versao)}`} className={ativa === v.versao ? 'ativo' : ''}><b>{v.versao}</b><span>{v.titulo}</span></a></li>)}</ul>
        </nav>
        <div className="versoes-lista">
          {meses.map((g) => (
            <section key={g.mes}>
              <h3 className="mes-versoes">{g.mes}</h3>
              {g.itens.map((v, i) => (
                <article key={v.versao} id={idVersao(v.versao)} data-versao={v.versao} className="versao-artigo">
                  <header>
                    <div className="versao-meta"><span className="numero-versao">{v.versao}</span>{versoes[0].versao === v.versao && <span className="selo-atual">versão atual</span>}<time dateTime={v.data}>{dataLonga(v.data)}</time></div>
                    <h4><Link href={`/novidades/versao/${v.versao}`}>{v.titulo}</Link></h4>
                    {v.resumo && <p>{v.resumo}</p>}
                  </header>
                  <ItensVersao v={v} tipos={tipos} busca={q && !`${v.versao} ${v.titulo} ${v.resumo}`.toLowerCase().includes(q) ? q : ''} />
                  <Link href={`/novidades/versao/${v.versao}`} className="leia-mais">Ver a versão {v.versao}<ArrowUpRight size={16} style={{ marginLeft: 6 }} /></Link>
                  {i < g.itens.length - 1 && <hr />}
                </article>
              ))}
            </section>
          ))}
          {!visiveis.length && <p className="versoes-vazio">Nenhuma versão com esse filtro.</p>}
        </div>
      </div>
    </div>
  )
}
