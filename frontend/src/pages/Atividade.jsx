import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, CalendarClock, Download, Mic, MonitorSmartphone, RefreshCw, Search, Settings2, Sparkles, Workflow } from 'lucide-react'
import { api, rotuloOrigem } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Selo } from '../components/ui'

const ORIGENS = [['', 'Todas'], ['painel', 'Painel e app'], ['alexa', 'Skill própria'], ['sinric', 'Alexa/Google'], ['agenda', 'Agenda'], ['cena', 'Cenas'], ['automacao', 'Automações'], ['sistema', 'Sistema']]
const ICONE = { painel: MonitorSmartphone, alexa: Mic, sinric: Mic, agenda: CalendarClock, cena: Sparkles, automacao: Workflow, agente: Bot, sistema: Settings2 }

function dia(ts) {
  const d = new Date(ts * 1000), hoje = new Date(), ontem = new Date(Date.now() - 86400000)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

export default function Atividade() {
  const [filtro, setFiltro] = useState({ origem: '', aparelho_id: '', falhas: false })
  const [itens, setItens] = useState(null)
  const [aparelhos, setAparelhos] = useState([])
  const [busca, setBusca] = useState('')
  const [fim, setFim] = useState(false)
  const [aoVivo, setAoVivo] = useState(true)
  const [erro, setErro] = useState('')

  const url = useCallback((antes) => {
    const p = new URLSearchParams({ limite: 100 })
    if (filtro.origem) p.set('origem', filtro.origem)
    if (filtro.aparelho_id) p.set('aparelho_id', filtro.aparelho_id)
    if (filtro.falhas) p.set('falhas', 'true')
    if (antes) p.set('antes', antes)
    return `/api/atividade?${p}`
  }, [filtro])

  useEffect(() => { api.get('/api/aparelhos').then(setAparelhos).catch(() => {}) }, [])
  useEffect(() => {
    setItens(null)
    api.get(url()).then((l) => { setItens(l); setFim(l.length < 100) }).catch((e) => setErro(e.message))
  }, [url])
  useEffect(() => { // ao vivo: busca o que chegou de novo a cada 15 s
    if (!aoVivo) return
    const t = setInterval(() => api.get(url()).then((novos) => setItens((atual) => {
      if (!atual) return novos
      const ids = new Set(atual.map((x) => x.id))
      return [...novos.filter((x) => !ids.has(x.id)), ...atual]
    })).catch(() => {}), 15000)
    return () => clearInterval(t)
  }, [aoVivo, url])

  const visiveis = useMemo(() => (itens || []).filter((t) => !busca || `${t.acao} ${t.aparelho_nome || ''} ${t.detalhe}`.toLowerCase().includes(busca.toLowerCase())), [itens, busca])
  const grupos = useMemo(() => {
    const g = []
    for (const t of visiveis) {
      const d = dia(t.quando)
      if (!g.length || g[g.length - 1].dia !== d) g.push({ dia: d, itens: [] })
      g[g.length - 1].itens.push(t)
    }
    return g
  }, [visiveis])

  const mais = async () => {
    const l = await api.get(url(itens[itens.length - 1].id))
    setItens([...itens, ...l]); setFim(l.length < 100)
  }
  const exportar = () => {
    const linhas = [['quando', 'aparelho', 'acao', 'origem', 'resultado', 'detalhe'], ...visiveis.map((t) => [
      new Date(t.quando * 1000).toISOString(), t.aparelho_nome || '', t.acao, rotuloOrigem(t.origem), t.ok ? 'ok' : 'falhou', t.detalhe || ''])]
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `clima-casa-atividade-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const total = visiveis.length
  const falhas = visiveis.filter((t) => !t.ok).length
  const porOrigem = visiveis.reduce((m, t) => { const o = t.origem.split(':')[0]; m[o] = (m[o] || 0) + 1; return m }, {})
  const principal = Object.entries(porOrigem).sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Cabecalho titulo="Atividade" descricao="Cada comando enviado, quem pediu e se o ar recebeu."
        acoes={<>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
            <RefreshCw className={`h-3.5 w-3.5 ${aoVivo ? 'animate-spin text-primary [animation-duration:3s]' : 'text-muted-foreground'}`} /> Ao vivo
            <Interruptor ligado={aoVivo} onChange={setAoVivo} rotulo="Atualizar ao vivo" />
          </label>
          <Botao variante="secundario" icone={Download} disabled={!total} onClick={exportar}>Exportar CSV</Botao>
        </>} />

      <FaixaMetricas itens={[
        { rotulo: 'Registros carregados', valor: total, dica: filtro.origem || filtro.aparelho_id || filtro.falhas ? 'com os filtros atuais' : 'mais recentes primeiro' },
        { rotulo: 'Sucesso', valor: total ? Math.round(((total - falhas) / total) * 100) : 0, sufixo: '%', tom: falhas ? 'ruim' : 'bom', dica: falhas ? `${falhas} falha(s)` : 'nenhuma falha' },
        { rotulo: 'Origem mais comum', valor: principal ? rotuloOrigem(principal[0]) : '—', dica: principal ? `${principal[1]} registro(s)` : '' },
        { rotulo: 'Aparelhos envolvidos', valor: new Set(visiveis.map((t) => t.aparelho_id).filter(Boolean)).size },
      ]} />

      <div className="my-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-64">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input className="campo pl-9" placeholder="Buscar ação ou aparelho" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ORIGENS.map(([k, r]) => (
            <button key={k} onClick={() => setFiltro({ ...filtro, origem: k })}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${filtro.origem === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}>{r}</button>
          ))}
        </div>
        <div className="flex items-center gap-3 lg:ml-auto">
          <select className="campo w-auto" value={filtro.aparelho_id} onChange={(e) => setFiltro({ ...filtro, aparelho_id: e.target.value })} aria-label="Aparelho">
            <option value="">Todos os aparelhos</option>{aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm"><input type="checkbox" checked={filtro.falhas} onChange={(e) => setFiltro({ ...filtro, falhas: e.target.checked })} className="h-4 w-4 accent-[hsl(var(--primary))]" /> Só falhas</label>
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!itens ? <Carregando /> : grupos.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">Nada encontrado.</p> : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.dia}>
              <h2 className="sticky top-16 z-10 mb-2 bg-background/90 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur first-letter:uppercase">{g.dia} · {g.itens.length}</h2>
              <ol className="relative ml-4 border-l border-border">
                <AnimatePresence initial={false}>
                  {g.itens.map((t) => {
                    const I = ICONE[t.origem.split(':')[0]] || Settings2
                    return (
                      <motion.li key={t.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="relative mb-1 pl-6">
                        <span className={`absolute -left-[13px] top-2.5 flex h-6 w-6 items-center justify-center rounded-full border bg-card ${t.ok ? 'border-border text-muted-foreground' : 'border-red-300 text-red-600 dark:border-red-900 dark:text-red-400'}`}>
                          <I className="h-3 w-3" />
                        </span>
                        <div className="flex flex-col gap-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-3">
                          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">{new Date(t.quando * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">{t.aparelho_nome && <span className="font-medium">{t.aparelho_nome}: </span>}{t.acao}</p>
                            {t.detalhe && <p className="truncate text-xs text-muted-foreground">{t.detalhe}</p>}
                          </div>
                          <span className="text-xs text-muted-foreground">{rotuloOrigem(t.origem)}</span>
                          {!t.ok && <Selo cor="vermelho">Falhou</Selo>}
                        </div>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ol>
            </section>
          ))}
          {!fim && <div className="text-center"><Botao variante="secundario" onClick={mais}>Carregar mais</Botao></div>}
        </div>
      )}
    </div>
  )
}
