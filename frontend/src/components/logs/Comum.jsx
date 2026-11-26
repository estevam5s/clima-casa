import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bot, Mail, MonitorSmartphone, Power, PowerOff, Settings2, ShieldAlert, SlidersHorizontal, Wind, X } from 'lucide-react'
import { api } from '../../api'
import { Botao, Modal } from '../ui'
import { devePuxar } from '../../ocioso'

// Peças do log completo usadas em Segurança → Logs, Atividade (Pessoas, Salas, Ares, Mudanças) e Uso do sistema.
export const ACOES = [
  ['ligou', 'Ligou', Power, 'text-emerald-600 dark:text-emerald-400'],
  ['desligou', 'Desligou', PowerOff, 'text-muted-foreground'],
  ['subiu', 'Subiu temp.', ArrowUp, 'text-orange-600 dark:text-orange-400'],
  ['baixou', 'Baixou temp.', ArrowDown, 'text-sky-600 dark:text-sky-400'],
  ['modo', 'Modo', SlidersHorizontal, 'text-violet-600 dark:text-violet-400'],
  ['ventilacao', 'Ventilação', Wind, 'text-teal-600 dark:text-teal-400'],
  ['config', 'Configurou', Settings2, 'text-muted-foreground'],
]
const ACAO = Object.fromEntries(ACOES.map((a) => [a[0], a]))
export const FONTES = { atividade: ['Atividade', MonitorSmartphone], seguranca: ['Segurança', ShieldAlert], telegram: ['Telegram', Bot], dispositivos: ['Dispositivos', Power], email: ['E-mails', Mail] }
export const ORIGENS = { painel: 'Painel/app', sinric: 'Alexa/Google', alexa: 'Skill Alexa', agenda: 'Agenda', cena: 'Cena', automacao: 'Automação', agente: 'Agente', sistema: 'Sistema', telegram: 'Telegram', musica: 'Música', ia: 'Assistente de IA' }
export const hora = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const horaCompleta = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function baixar(nome, tipo, texto) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href)
}
const celula = (v) => { const t = String(v ?? ''); return /^[=+\-@]/.test(t) ? `'${t}` : t }
export function exportarLogs(itens, nome, fmt) {
  if (fmt === 'json') return baixar(`${nome}.json`, 'application/json', JSON.stringify(itens, null, 1))
  const cab = ['quando', 'fonte', 'pessoa', 'sala', 'ar', 'acao', 'mudanca', 'resultado', 'detalhe', 'ip']
  const linhas = itens.map((r) => [horaCompleta(r.quando), FONTES[r.fonte]?.[0] || r.fonte, r.quem || ORIGENS[r.origem_base] || '', r.sala || '', r.aparelho || '', r.acao,
    r.acao_ar ? (ACAO[r.acao_ar]?.[1] || r.acao_ar) + (r.de != null ? ` ${r.de}° → ${r.para}°` : '') : '', r.ok ? 'ok' : 'falhou', r.detalhe || '', r.ip || '']
    .map((v) => `"${celula(v).replace(/"/g, '""')}"`).join(';'))
  baixar(`${nome}.csv`, 'text/csv;charset=utf-8', '﻿' + [cab.join(';'), ...linhas].join('\n'))
}

// Selo da mudança no ar (ligou, subiu 23° → 24°…)
export function SeloAcao({ r }) {
  const a = ACAO[r.acao_ar]
  if (!a) return null
  const [, rot, I, cor] = a
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium ${cor}`}>
      <I className="h-3 w-3" />{rot}{r.de != null ? ` ${r.de}°→${r.para}°` : ''}{r.junto ? ' · junto' : ''}
    </span>
  )
}

// Uma linha do log
export function ItemLog({ r, aoAbrir }) {
  const [rot, I] = FONTES[r.fonte] || ['', MonitorSmartphone]
  const quem = r.quem || (r.fonte === 'atividade' ? ORIGENS[r.origem_base] || r.origem_base : '') || (r.ip ? r.ip : '')
  return (
    <li>
      <button onClick={() => aoAbrir?.(r)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
        <span title={rot} className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${r.ok ? 'bg-muted text-muted-foreground' : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}><I className="h-3.5 w-3.5" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <b className="font-medium">{quem || 'Sistema'}</b>
            <span className="min-w-0 break-words text-foreground/90">{r.acao}</span>
            <SeloAcao r={r} />
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {hora(r.quando)}{r.aparelho ? ` · ${r.aparelho}` : ''}{r.sala ? ` · ${r.sala}` : ''}{r.ip ? ` · ${r.ip}${r.pais ? ` (${r.pais})` : ''}` : ''}{r.detalhe ? ` · ${r.detalhe}` : ''}
          </span>
        </span>
        {!r.ok && <span className="shrink-0 rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">falhou</span>}
      </button>
    </li>
  )
}

export function DetalheLog({ r, aoFechar }) {
  if (!r) return null
  const campos = [
    ['Quando', horaCompleta(r.quando)], ['Fonte', FONTES[r.fonte]?.[0] || r.fonte], ['Quem', r.quem || ORIGENS[r.origem_base] || '-'], ['Origem', r.origem],
    ['Sala', r.sala], ['Ar ou aparelho', r.aparelho], ['Ação', r.acao], ['Mudança no ar', r.acao_ar ? `${ACAO[r.acao_ar]?.[1]}${r.de != null ? ` (${r.de}° → ${r.para}°)` : ''}${r.junto ? ', respondeu junto com outro ar da zona' : ''}` : null],
    ['Resultado', r.ok ? 'Deu certo' : 'Falhou'], ['Detalhe', r.detalhe], ['IP', r.ip ? `${r.ip}${r.pais ? ` (${r.pais})` : ''}` : null], ['Navegador', r.agente],
    ['Tempo de resposta', r.ms != null ? `${r.ms} ms` : null], ['Registro', `${r.fonte} #${r.id}`],
  ].filter(([, v]) => v != null && v !== '')
  return (
    <Modal aberto titulo="Registro do log" onFechar={aoFechar}>
      <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-y-2 text-sm">
        {campos.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></div>)}
      </dl>
      <div className="mt-4 flex justify-end"><Botao variante="secundario" icone={X} onClick={aoFechar}>Fechar</Botao></div>
    </Modal>
  )
}

// Tabela de pessoas/salas/ares com quantas vezes ligou, desligou, subiu e baixou a temperatura
export function TabelaAcoes({ linhas, rotulo = 'Pessoa', aoEscolher, vazio = 'Nada no período.' }) {
  if (!linhas?.length) return <p className="px-5 py-4 text-sm text-muted-foreground">{vazio}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground"><tr className="border-b border-border">
          <th className="px-4 py-2 font-medium">{rotulo}</th><th className="px-3 py-2 font-medium">Total</th>
          {ACOES.map(([k, r]) => <th key={k} className="whitespace-nowrap px-3 py-2 font-medium">{r}</th>)}
          <th className="px-3 py-2 font-medium">Falhas</th><th className="px-3 py-2 font-medium">Último</th>
        </tr></thead>
        <tbody className="divide-y divide-border">{linhas.map((l) => (
          <tr key={l.id} onClick={aoEscolher ? () => aoEscolher(l) : undefined} className={aoEscolher ? 'cursor-pointer hover:bg-muted/40' : ''}>
            <td className="px-4 py-2 font-medium">{l.nome}</td><td className="tabular px-3 py-2">{l.total}</td>
            {ACOES.map(([k, , , cor]) => <td key={k} className={`tabular px-3 py-2 ${l[k] ? cor : 'text-muted-foreground/50'}`}>{l[k] || 0}</td>)}
            <td className={`tabular px-3 py-2 ${l.falhas ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/50'}`}>{l.falhas}</td>
            <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{l.ultimo ? hora(l.ultimo) : '-'}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

// Carrega uma linha do tempo paginada (rota que devolve {itens, mais, proximo})
export function useLinhaLogs(rota, params, { aoVivo = false } = {}) {
  const [itens, setItens] = useState(null)
  const [mais, setMais] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const chave = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== false)).toString()
  const ref = useRef(chave)
  ref.current = chave
  const carregar = useCallback(async (antes) => {
    setCarregando(true)
    try {
      const r = await api.get(`${rota}?${chave}${antes ? `&antes=${antes}` : ''}`)
      if (ref.current !== chave) return
      setItens((v) => (antes ? [...(v || []), ...r.itens] : r.itens)); setMais(r.mais); setErro('')
    } catch (e) { setErro(e.message) } finally { setCarregando(false) }
  }, [rota, chave])
  useEffect(() => { setItens(null); carregar() }, [carregar])
  useEffect(() => {
    if (!aoVivo) return undefined
    const t = setInterval(() => { if (devePuxar('logs')) carregar() }, 15000)
    return () => clearInterval(t)
  }, [aoVivo, carregar])
  const carregarMais = () => itens?.length && carregar(itens[itens.length - 1].quando)
  return { itens, mais, erro, carregando, recarregar: () => carregar(), carregarMais }
}
