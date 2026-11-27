#!/usr/bin/env node
// Extrai do código do painel (frontend/src) os textos em português que aparecem na tela: texto entre tags JSX e strings
// com cara de frase (rótulos, títulos, avisos, placeholders). Números viram {0}, {1}… (igual ao i18nPainel.js), para casar
// com o que o navegador procura. Saída: JSON com a lista, usado por scripts/traduzir-painel.py (tradução antecipada).
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'frontend', 'src')
const arquivos = []
const andar = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) andar(p); else if (/\.(jsx|js)$/.test(f)) arquivos.push(p) } }
andar(RAIZ)
const textos = new Set()
const normal = (t) => t.replace(/\s+/g, ' ').trim()
const molde = (t) => { let i = 0; return t.replace(/\d+(?:[.,:/]\d+)*/g, () => `{${i++}}`) }
const pt = (t) => /[a-záéíóúâêôãõç]{3}/i.test(t) && /\s/.test(t.trim()) || /^[A-ZÁÉÍÓÚ][a-záéíóúâêôãõç]{3,}$/.test(t)
// classes do Tailwind ("flex items-center gap-2") não são texto da tela
const CLASSE = /^(!?-?(flex|grid|text-|bg-|p[trblxy]?-|m[trblxy]?-|w-|h-|gap-|rounded|border|shadow|items-|justify-|content-|absolute|relative|fixed|sticky|inset|hover:|sm:|md:|lg:|xl:|2xl:|block|inline|truncate|font-|leading-|tracking-|z-|top-|left-|right-|bottom-|opacity-|transition|duration-|ease-|delay-|space-|min-|max-|overflow|cursor-|ring|fill-|stroke-|col-|row-|order-|shrink|grow|self-|place-|aspect-|object-|tabular|sr-only|hidden|dark:|focus|group|peer|animate-|translate|rotate|scale|origin-|select-|pointer-|resize|outline|underline|uppercase|lowercase|italic|whitespace|break-|line-clamp|backdrop|accent-|disabled:|active:|first:|last:|placeholder:|divide|decoration|list-|clip|visible|invisible|isolate|mix-|blur|drop-|sepia|from-|to-|via-|size-|basis-|float|clear|contents|table|caption|align-|antialiased|not-|data-|aria-|\[|&|\d))/
const ehClasses = (t) => { const p = t.split(' ').filter(Boolean); return p.length > 0 && p.filter((x) => CLASSE.test(x)).length / p.length >= 0.5 }
const ruim = (t) => ehClasses(t) || /^(https?:|\/|\.|#|[a-z]+[A-Z]|[\w-]+\.(jsx?|css|json|png))/.test(t) || /[{}<>=;]|=>|\$\{|className|^[a-z0-9_-]+$/.test(t) || t.length > 400 || t.length < 2
for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8')
  // texto entre tags: >Texto aqui<
  for (const m of src.matchAll(/>\s*([^<>{}\n][^<>{}]*?)\s*</g)) { const t = normal(m[1]); if (pt(t) && !ruim(t)) textos.add(molde(t)) }
  // strings: 'Texto com espaço' "…" (inclui as que vão para placeholder, title, aria-label, toast)
  for (const m of src.matchAll(/(['"])((?:(?!\1)[^\\\n]|\\.){3,300})\1/g)) { const t = normal(m[2]); if (pt(t) && !ruim(t) && !/^(use|import|export)\b/.test(t)) textos.add(molde(t)) }
  // template strings sem expressão dentro
  for (const m of src.matchAll(/`([^`$\n]{3,300})`/g)) { const t = normal(m[1]); if (pt(t) && !ruim(t)) textos.add(molde(t)) }
}
const lista = [...textos].sort()
fs.writeFileSync(process.argv[2] || '/dev/stdout', JSON.stringify(lista, null, 0))
if (process.argv[2]) console.log(`${lista.length} textos extraídos de ${arquivos.length} arquivos`)
