import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, BellOff, Check, CheckCheck, Download, ExternalLink, Mail, MailOpen, Search, Settings2, X } from 'lucide-react'
import { api, haQuanto, rotaSegura } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, useDados, useToast } from '../components/ui'
import { ICONES, Preferencias } from '../components/Notificacoes'

// Central de notificações em página: histórico completo (inclui as arquivadas), filtros, busca, ações em lote e CSV.
// O painel do sino no topo continua para o dia a dia; aqui é para procurar, revisar e limpar.

const ABAS = [['abertas', 'Abertas'], ['nao_lidas', 'Não lidas'], ['importantes', 'Importantes'], ['seguranca', 'Segurança'], ['arquivadas', 'Arquivadas']]
const PERIODOS = [['1', 'Últimas 24 h'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['0', 'Tudo']]
const GRAVIDADE = { alta: ['Importante', 'text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300'], media: ['Média', 'text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-300'], baixa: ['Baixa', 'text-muted-foreground bg-muted'] }

const diaDe = (ts) => {
  const d = new Date(ts * 1000), hoje = new Date()
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}
const hora = (ts) => new Date(ts * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const avisarCentral = () => window.dispatchEvent(new Event('clima:notificacoes-mudou'))

function exportarCsv(itens, tipos) {
  const esc = (v) => {
    let t = String(v ?? '')
    if (/^[=+\-@]/.test(t)) t = `'${t}`   // planilha não executa fórmula vinda de texto
    return `"${t.replace(/"/g, '""')}"`
  }
  const linhas = [['Quando', 'Tipo', 'Gravidade', 'Título', 'Detalhe', 'Lida', 'Resolvida', 'Arquivada', 'Ocorrências']]
  for (const n of itens) {
    linhas.push([new Date(n.atualizado_em * 1000).toLocaleString('pt-BR'), tipos[n.tipo] || n.tipo, n.gravidade, n.titulo, n.detalhe, n.lida ? 'sim' : 'não',
      n.resolvida ? 'sim' : 'não', n.arquivada ? 'sim' : 'não', n.ocorrencias || 1])
  }
  const blob = new Blob(['﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = `notificacoes-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function Linha({ n, tipos, marcado, aoMarcar, aoMudar }) {
  const toast = useToast()
  const navegar = useNavigate()
  const [ocupado, setOcupado] = useState(false)
  const [Icone, cor] = ICONES[n.tipo] || ICONES.sistema
  const [rotGrav, corGrav] = GRAVIDADE[n.gravidade] || GRAVIDADE.baixa
  const lote = async (acao) => {
    try { await api.post('/api/notificacoes/lote', { ids: [n.id], acao }); aoMudar() } catch (e) { toast(e.message, 'erro') }
  }
  const executar = async () => {
    if (n.acao?.tipo === 'link') { navegar(rotaSegura(n.acao.para)); return }
    setOcupado(true)
    try { const r = await api.post(`/api/notificacoes/${n.id}/acao`); toast(r.mensagem); aoMudar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const abrir = () => {
    if (!n.lida) api.post('/api/notificacoes/lote', { ids: [n.id], acao: 'lidas' }).then(avisarCentral).catch(() => {})
    if (n.link) navegar(rotaSegura(n.link))
  }
  return (
    <li className={`flex gap-3 px-4 py-3.5 sm:px-5 ${marcado ? 'bg-primary/5' : ''} ${n.resolvida || n.arquivada ? 'opacity-70' : ''}`}>
      <input type="checkbox" checked={marcado} onChange={aoMarcar} className="mt-3 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" aria-label={`Selecionar ${n.titulo}`} />
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cor}`}><Icone className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <p className={`min-w-0 flex-1 text-sm leading-snug ${n.lida ? 'text-foreground/80' : 'font-semibold text-foreground'}`}>
            {!n.lida && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" aria-label="não lida" />}
            {n.titulo}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground tabular" title={new Date(n.atualizado_em * 1000).toLocaleString('pt-BR')}>{hora(n.atualizado_em)} · {haQuanto(n.atualizado_em)}</span>
        </div>
        {n.detalhe && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{n.detalhe}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{tipos[n.tipo] || n.tipo}</span>
          <span className={`rounded-md px-1.5 py-0.5 ${corGrav}`}>{rotGrav}</span>
          {n.ocorrencias > 1 && <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">{n.ocorrencias}×</span>}
          {n.resolvida && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">resolvida</span>}
          {n.arquivada && <span className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">arquivada</span>}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {n.link && <Botao tamanho="sm" variante="secundario" icone={ExternalLink} onClick={abrir}>Abrir</Botao>}
          {n.acao && !n.resolvida && !n.arquivada && <Botao tamanho="sm" carregando={ocupado} onClick={executar}>{n.acao.rotulo}</Botao>}
          <Botao tamanho="sm" variante="fantasma" icone={n.lida ? Mail : MailOpen} onClick={() => lote(n.lida ? 'nao_lidas' : 'lidas')}>{n.lida ? 'Marcar não lida' : 'Marcar lida'}</Botao>
          {n.arquivada
            ? <Botao tamanho="sm" variante="fantasma" icone={ArchiveRestore} onClick={() => lote('restaurar')}>Restaurar</Botao>
            : <Botao tamanho="sm" variante="fantasma" icone={Archive} onClick={() => lote('arquivar')}>Arquivar</Botao>}
        </div>
      </div>
    </li>
  )
}

export default function Notificacoes() {
  const toast = useToast()
  const { dados: itens, erro, recarregar } = useDados(() => api.get('/api/notificacoes/historico?limite=500'))
  const { dados: central, recarregar: recarregarCentral } = useDados(() => api.get('/api/notificacoes'))
  const [aba, setAba] = useState('abertas')
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState('30')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [prefs, setPrefs] = useState(false)
  const tipos = central?.tipos || {}

  const mudou = () => { recarregar(); recarregarCentral(); avisarCentral(); setSel(new Set()) }

  const filtrados = useMemo(() => {
    if (!itens) return []
    const desde = +periodo ? Date.now() / 1000 - +periodo * 86400 : 0
    const t = q.trim().toLowerCase()
    return itens.filter((n) => {
      if (n.atualizado_em < desde) return false
      if (tipo && n.tipo !== tipo) return false
      if (aba === 'arquivadas') { if (!n.arquivada) return false } else if (n.arquivada) return false
      if (aba === 'nao_lidas' && n.lida) return false
      if (aba === 'importantes' && !(n.gravidade === 'alta' && !n.resolvida)) return false
      if (aba === 'seguranca' && n.tipo !== 'seguranca') return false
      if (t && !`${n.titulo} ${n.detalhe || ''}`.toLowerCase().includes(t)) return false
      return true
    })
  }, [itens, aba, tipo, periodo, q])

  const grupos = useMemo(() => {
    const g = []
    for (const n of filtrados) {
      const d = diaDe(n.atualizado_em)
      if (!g.length || g[g.length - 1][0] !== d) g.push([d, []])
      g[g.length - 1][1].push(n)
    }
    return g
  }, [filtrados])

  if (erro) return <Aviso>{erro}</Aviso>
  if (!itens) return <Carregando />

  const semana = Date.now() / 1000 - 7 * 86400
  const abertas = itens.filter((n) => !n.arquivada)
  const contagem = {
    abertas: abertas.length,
    nao_lidas: abertas.filter((n) => !n.lida).length,
    importantes: abertas.filter((n) => n.gravidade === 'alta' && !n.resolvida).length,
    seguranca: abertas.filter((n) => n.tipo === 'seguranca').length,
    arquivadas: itens.filter((n) => n.arquivada).length,
  }
  const todosMarcados = filtrados.length > 0 && filtrados.every((n) => sel.has(n.id))
  const marcarTodos = () => setSel(todosMarcados ? new Set() : new Set(filtrados.map((n) => n.id)))
  const alternar = (id) => setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x })
  const emLote = async (acao) => {
    try {
      const r = await api.post('/api/notificacoes/lote', { ids: [...sel], acao })
      toast(`${r.alteradas} notificação(ões) atualizada(s).`)
      mudou()
    } catch (e) { toast(e.message, 'erro') }
  }
  const lerTodas = async () => { try { await api.post('/api/notificacoes/ler-todas'); toast('Todas marcadas como lidas.'); mudou() } catch (e) { toast(e.message, 'erro') } }

  return (
    <div className="w-full">
      <Cabecalho titulo="Notificações"
        descricao="Tudo o que o sistema avisou: transmissores, agente, Alexa, segurança e alertas dos ares. Procure, filtre, resolva e arquive."
        acoes={<>
          <Botao variante="secundario" icone={CheckCheck} onClick={lerTodas} disabled={!contagem.nao_lidas}>Marcar todas como lidas</Botao>
          <Botao variante="secundario" icone={Download} onClick={() => exportarCsv(filtrados, tipos)} disabled={!filtrados.length}>Exportar CSV</Botao>
          <Botao variante="secundario" icone={Settings2} onClick={() => setPrefs(true)} disabled={!central}>Preferências</Botao>
        </>} />

      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Não lidas', valor: contagem.nao_lidas, tom: contagem.nao_lidas ? 'ruim' : 'bom', dica: contagem.nao_lidas ? 'esperando você' : 'em dia' },
          { rotulo: 'Importantes abertas', valor: contagem.importantes, tom: contagem.importantes ? 'ruim' : 'bom', dica: 'gravidade alta, sem resolver' },
          { rotulo: 'Segurança', valor: contagem.seguranca, dica: 'abertas no firewall e acessos' },
          { rotulo: 'Resolvidas sozinhas', valor: itens.filter((n) => n.resolvida && n.atualizado_em > semana).length, dica: 'nos últimos 7 dias' },
        ]} />
      </div>

      <section className="cartao overflow-hidden">
        <div className="space-y-3 border-b border-border p-4 sm:px-5">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Filtrar notificações">
            {ABAS.map(([k, r]) => (
              <button key={k} role="tab" aria-selected={aba === k} onClick={() => { setAba(k); setSel(new Set()) }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${aba === k ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}> {/* marca: aba ativa flutua sobre a faixa */}
                {r}<span className="rounded bg-muted px-1 text-[11px] tabular">{contagem[k]}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="campo h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no título ou no detalhe" aria-label="Buscar notificações"
                type="search" name="busca-notificacoes" autoComplete="off" />
            </label>
            <select className="campo h-9 w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
              <option value="">Todos os tipos</option>
              {Object.entries(tipos).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
            <select className="campo h-9 w-auto" value={periodo} onChange={(e) => setPeriodo(e.target.value)} aria-label="Período">
              {PERIODOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          </div>
          {filtrados.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2 text-muted-foreground">
                <input type="checkbox" checked={todosMarcados} onChange={marcarTodos} className="h-4 w-4 accent-[hsl(var(--primary))]" aria-label="Selecionar todas as visíveis" />
                {sel.size ? `${sel.size} selecionada(s)` : `Selecionar as ${filtrados.length}`}
              </label>
              {sel.size > 0 && (<>
                <Botao tamanho="sm" variante="secundario" icone={Check} onClick={() => emLote('lidas')}>Marcar lidas</Botao>
                <Botao tamanho="sm" variante="secundario" icone={Mail} onClick={() => emLote('nao_lidas')}>Marcar não lidas</Botao>
                {aba === 'arquivadas'
                  ? <Botao tamanho="sm" variante="secundario" icone={ArchiveRestore} onClick={() => emLote('restaurar')}>Restaurar</Botao>
                  : <Botao tamanho="sm" variante="secundario" icone={Archive} onClick={() => emLote('arquivar')}>Arquivar</Botao>}
                <button onClick={() => setSel(new Set())} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" />Limpar seleção</button>
              </>)}
            </div>
          )}
        </div>

        {filtrados.length === 0 ? (
          <div className="p-4">
            <Vazio icone={BellOff} titulo={aba === 'arquivadas' ? 'Nenhuma arquivada neste período' : 'Nada por aqui'}
              texto={q || tipo ? 'Nenhuma notificação com esses filtros. Mude a busca, o tipo ou o período.' : 'Quando o sistema avisar algo (transmissor sem resposta, agente desligado, Alexa, segurança), aparece aqui.'} />
          </div>
        ) : grupos.map(([dia, lista]) => (
          <div key={dia}>
            <p className="sticky top-0 z-[1] border-b border-border bg-muted/60 px-4 py-1.5 text-xs font-medium capitalize text-muted-foreground backdrop-blur sm:px-5">{dia} · {lista.length}</p>
            <ul className="divide-y divide-border">
              {lista.map((n) => <Linha key={n.id} n={n} tipos={tipos} marcado={sel.has(n.id)} aoMarcar={() => alternar(n.id)} aoMudar={mudou} />)}
            </ul>
          </div>
        ))}
        {itens.length >= 500 && <p className="border-t border-border px-5 py-2 text-xs text-muted-foreground">Mostrando as 500 mais recentes.</p>}
      </section>

      <Modal aberto={prefs} titulo="Preferências de notificação" onFechar={() => setPrefs(false)}>
        {prefs && central && <div className="-mx-4"><Preferencias dados={central} aoAtualizar={() => { recarregarCentral(); avisarCentral() }} /></div>}
      </Modal>
    </div>
  )
}
