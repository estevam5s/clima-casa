// Peças comuns da tela Infra (Vercel, Cloudflare e agentes).
export const PROJETOS = [['clima-casa', 'App (app.zynio.com.br)'], ['clima-escritorio-site', 'Site (zynio.com.br)']]
export const bytes = (b) => { if (b == null) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; let v = b; while (v >= 1024 && i < 4) { v /= 1024; i++ } return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 2 : 1 })} ${u[i]}` }
export const num = (n) => (n ?? 0).toLocaleString('pt-BR')
export const dataHora = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')

export function Medidor({ rotulo, valor, limite, fmt = num, dica }) {
  const pct = limite ? Math.min(100, (valor / limite) * 100) : 0
  const cor = pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-primary'
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between gap-2"><p className="text-xs text-muted-foreground">{rotulo}</p><p className="text-[11px] tabular text-muted-foreground">{pct.toFixed(pct < 1 ? 2 : 0)}%</p></div>
      <p className="mt-1 text-sm font-semibold tabular">{fmt(valor)} <span className="font-normal text-muted-foreground">/ {fmt(limite)}</span></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(pct, 0.6)}%` }} /></div>
      {dica && <p className="mt-1.5 text-[11px] text-muted-foreground">{dica}</p>}
    </div>
  )
}

export function Dica({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null
  return <div /* marca: a dica flutua sobre o gráfico */ className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"><p className="mb-1 font-medium">{label}</p>{payload.map((p) => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {fmt ? fmt(p.value) : num(p.value)}</p>)}</div>
}
