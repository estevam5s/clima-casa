// Markdown mínimo para as respostas da IA: parágrafos, **negrito**, `código`, listas (- / 1.) e tabelas simples.
// Monta elementos React (nada de innerHTML): o texto do modelo nunca vira HTML.
function inline(t, k = 0) {
  const partes = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let ult = 0, m, i = 0
  while ((m = re.exec(t))) {
    if (m.index > ult) partes.push(t.slice(ult, m.index))
    const s = m[0]
    partes.push(s.startsWith('**') ? <b key={`${k}-${i++}`} className="font-semibold">{s.slice(2, -2)}</b>
      : <code key={`${k}-${i++}`} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{s.slice(1, -1)}</code>)
    ult = m.index + s.length
  }
  if (ult < t.length) partes.push(t.slice(ult))
  return partes
}

export default function MiniMarkdown({ texto }) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n')
  const blocos = []
  for (let i = 0; i < linhas.length;) {
    const l = linhas[i]
    if (/^\s*\|.*\|\s*$/.test(l)) {   // tabela
      const t = []
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) { t.push(linhas[i]); i++ }
      const cel = (x) => x.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const corpo = t.filter((x) => !/^[\s|:-]+$/.test(x))   // tira a linha |---|---|
      const [cab, ...resto] = corpo.map(cel)
      blocos.push(
        <div key={i} className="my-2 overflow-x-auto"><table className="w-full text-left text-xs">
          <thead><tr>{(cab || []).map((c, j) => <th key={j} className="border-b border-border px-2 py-1 font-medium">{inline(c, j)}</th>)}</tr></thead>
          <tbody>{resto.map((r, a) => <tr key={a} className="border-b border-border/60">{r.map((c, j) => <td key={j} className="px-2 py-1 align-top">{inline(c, j)}</td>)}</tr>)}</tbody>
        </table></div>)
      continue
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {   // lista
      const itens = [], num = /^\s*\d/.test(l)
      while (i < linhas.length && /^\s*([-*•]|\d+[.)])\s+/.test(linhas[i])) { itens.push(linhas[i].replace(/^\s*([-*•]|\d+[.)])\s+/, '')); i++ }
      const L = num ? 'ol' : 'ul'
      blocos.push(<L key={i} className={`my-1.5 space-y-0.5 pl-5 ${num ? 'list-decimal' : 'list-disc'}`}>{itens.map((x, j) => <li key={j}>{inline(x, j)}</li>)}</L>)
      continue
    }
    if (/^#{1,4}\s/.test(l)) { blocos.push(<p key={i} className="mt-2 font-semibold">{inline(l.replace(/^#+\s/, ''), i)}</p>); i++; continue }
    if (!l.trim()) { i++; continue }
    const p = []
    while (i < linhas.length && linhas[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#)/.test(linhas[i])) { p.push(linhas[i]); i++ }
    if (!p.length) { blocos.push(<p key={i}>{inline(linhas[i], i)}</p>); i++; continue }
    blocos.push(<p key={i} className="my-1">{inline(p.join(' '), i)}</p>)
  }
  return <div className="text-sm leading-relaxed">{blocos}</div>
}
