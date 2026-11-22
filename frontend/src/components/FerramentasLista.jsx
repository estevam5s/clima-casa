import { useRef } from 'react'
import { Download, FileJson, Search, Upload, X } from 'lucide-react'
import { Botao } from './ui'

// Barra comum das listas (Cenas, Automações, Agendamentos, Aparelhos, Transmissores): busca, filtro em pílulas,
// contagem, exportar (CSV para planilha e JSON para importar de volta) e importar um JSON exportado antes.
export function baixarArquivo(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  Object.assign(document.createElement('a'), { href: url, download: nome }).click()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

const celula = (v) => {
  const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  const seguro = /^[=+\-@]/.test(t) ? `'${t}` : t   // planilha não executa fórmula vinda do dado
  return /[";\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}
export function paraCsv(linhas, colunas) {
  const cab = colunas.map(([, r]) => celula(r)).join(';')
  return '﻿' + [cab, ...linhas.map((l) => colunas.map(([k]) => celula(typeof k === 'function' ? k(l) : l[k])).join(';'))].join('\n')
}

export default function FerramentasLista({ busca, setBusca, placeholder = 'Procurar', filtros = [], filtro, setFiltro, total, mostrando,
  exportarCsv, exportarJson, importar, extra = null }) {
  const arq = useRef(null)
  const ler = (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    f.text().then((t) => { try { importar(JSON.parse(t)) } catch { importar(null) } })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" autoComplete="off" className="campo pl-8 pr-8" placeholder={placeholder} value={busca} onChange={(e) => setBusca(e.target.value)} aria-label={placeholder} />
        {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Limpar busca"><X className="h-3.5 w-3.5" /></button>}
      </label>
      {filtros.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtro">
          {filtros.map(([k, r, n]) => (
            <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k}
              className={`h-8 rounded-md border px-2.5 text-xs ${filtro === k ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{r}{n != null && <span className="ml-1 text-muted-foreground">{n}</span>}</button>
          ))}
        </div>
      )}
      {total != null && <span className="text-xs text-muted-foreground">{mostrando === total ? `${total} no total` : `${mostrando} de ${total}`}</span>}
      <div className="ml-auto flex flex-wrap gap-1.5">
        {extra}
        {exportarCsv && <Botao tamanho="sm" variante="secundario" icone={Download} onClick={exportarCsv} title="Planilha (Excel, LibreOffice)">CSV</Botao>}
        {exportarJson && <Botao tamanho="sm" variante="secundario" icone={FileJson} onClick={exportarJson} title="Arquivo para importar de volta">Exportar</Botao>}
        {importar && <><input ref={arq} type="file" accept=".json,application/json" className="hidden" onChange={ler} />
          <Botao tamanho="sm" variante="secundario" icone={Upload} onClick={() => arq.current?.click()}>Importar</Botao></>}
      </div>
    </div>
  )
}

export const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
