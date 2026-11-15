import { useState } from 'react'
import { Check, Copy, Lock } from 'lucide-react'

export const kb = (b) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} kB` : `${b} B`)
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'))

// célula da grade: NULL apagado, segredo com cadeado, JSON compacto, booleano como selo
export function Celula({ v }) {
  if (v === null || v === undefined) return <span className="text-muted-foreground/50">NULL</span>
  if (v === '••••••' || v === '[cifrado]') return <span className="inline-flex items-center gap-1 text-muted-foreground"><Lock className="h-3 w-3" />{v === '[cifrado]' ? 'cifrado' : 'oculto'}</span>
  if (typeof v === 'boolean') return <span className={`rounded px-1.5 py-px text-[11px] font-medium ${v ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{String(v)}</span>
  if (typeof v === 'object') return <span className="text-sky-700 dark:text-sky-300">{JSON.stringify(v)}</span>
  return String(v)
}

export function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}{ok ? 'Copiado' : rotulo}
    </button>
  )
}

// grade de resultados (editor de tabelas e SQL): cabeçalho fixo, números à direita, rolagem nos dois sentidos
export function Grade({ colunas, linhas, ordem, direcao, aoOrdenar, aoAbrir, tipos = {} }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-max min-w-full border-separate border-spacing-0 font-mono text-[12.5px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-muted px-2 py-2 text-right font-sans text-[11px] font-normal text-muted-foreground">#</th>
            {colunas.map((c) => (
              <th key={c} onClick={() => aoOrdenar?.(c)} className={`max-w-[320px] border-b border-r border-border bg-muted px-3 py-1.5 text-left font-sans ${aoOrdenar ? 'cursor-pointer hover:bg-muted/70' : ''}`}>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium">{c}{ordem === c && <span className="text-primary">{direcao === 'asc' ? '↑' : '↓'}</span>}</span>
                {tipos[c] && <span className="block whitespace-nowrap text-[10.5px] font-normal text-muted-foreground">{tipos[c]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} onClick={() => aoAbrir?.(l)} className={`group ${aoAbrir ? 'cursor-pointer' : ''}`}>
              <td className="sticky left-0 border-b border-r border-border bg-card px-2 py-1.5 text-right font-sans text-[11px] text-muted-foreground group-hover:bg-muted">{i + 1}</td>
              {colunas.map((c) => (
                <td key={c} className={`max-w-[320px] truncate border-b border-r border-border bg-card px-3 py-1.5 group-hover:bg-muted/60 ${typeof l[c] === 'number' ? 'text-right tabular-nums' : ''}`} title={typeof l[c] === 'string' ? l[c] : undefined}>
                  <Celula v={l[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function paraCsv(colunas, linhas) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s }
  return [colunas.join(','), ...linhas.map((l) => colunas.map((c) => esc(l[c])).join(','))].join('\n')
}

export function baixarTexto(nome, texto, tipo = 'text/csv;charset=utf-8') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href)
}

export function TituloSecao({ titulo, descricao, acoes }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>{descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}</div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}
