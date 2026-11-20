import { useMemo, useState } from 'react'
import { SECOES, dataBR } from './Novidades'

// Linha do tempo das versões em barras empilhadas (substitui o 3D): cada barra é uma versão, a altura é o número de
// mudanças e as cores são os tipos (novo, melhorias, segurança, correções). Passar o mouse mostra o resumo; clicar
// leva à versão. Versões do mesmo dia ficam lado a lado sob a mesma data.
const COR = { novo: '#0d9488', melhorias: '#2563eb', seguranca: '#d97706', correcoes: '#64748b' }

export default function GraficoVersoes({ versoes, ir, novas = new Set() }) {
  const [sobre, setSobre] = useState(null)
  const lista = useMemo(() => [...versoes].reverse(), [versoes])   // mais antiga à esquerda
  const max = Math.max(1, ...lista.map((v) => SECOES.reduce((s, [k]) => s + (v[k]?.length || 0), 0)))
  const L = 22, G = 6, ALT = 150, TOPO = 14
  const largura = lista.length * (L + G) + 40
  const dias = []
  // um rótulo de data por dia, e só se couber (dias com 1 versão grudados no anterior não ganham texto, só a linha)
  let ultimoRotulo = -99
  lista.forEach((v, i) => {
    if (i && v.data === lista[i - 1].data) return
    const texto = i - ultimoRotulo >= 5
    if (texto) ultimoRotulo = i
    dias.push({ i, data: v.data, texto })
  })
  const atual = sobre != null ? lista[sobre] : null
  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <svg viewBox={`0 0 ${largura} ${ALT + 62}`} width={Math.max(largura, 320)} height={ALT + 62} className="block min-w-full" role="img" aria-label={`Gráfico de ${lista.length} versões`}>
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="30" x2={largura} y1={TOPO + ALT * (1 - f)} y2={TOPO + ALT * (1 - f)} className="stroke-border" strokeDasharray="2 4" />)}
          <text x="24" y={TOPO + 4} textAnchor="end" className="fill-muted-foreground text-[9px]">{max}</text>
          <text x="24" y={TOPO + ALT} textAnchor="end" className="fill-muted-foreground text-[9px]">0</text>
          {lista.map((v, i) => {
            const x = 34 + i * (L + G)
            let y = TOPO + ALT
            const nova = novas.has(v.versao)
            return (
              <g key={v.versao} onMouseEnter={() => setSobre(i)} onMouseLeave={() => setSobre(null)} onFocus={() => setSobre(i)} onBlur={() => setSobre(null)}
                onClick={() => ir(v.versao)} onKeyDown={(e) => e.key === 'Enter' && ir(v.versao)} tabIndex={0} role="button" aria-label={`Versão ${v.versao}: ${v.titulo}`} className="cursor-pointer outline-none">
                <rect x={x - 2} y={TOPO} width={L + 4} height={ALT} rx="4" className={sobre === i ? 'fill-muted' : 'fill-transparent'} />
                {SECOES.map(([k]) => {
                  const n = v[k]?.length || 0
                  if (!n) return null
                  const h = (n / max) * ALT
                  y -= h
                  return <rect key={k} x={x} y={y} width={L} height={Math.max(1.5, h - 1)} rx="2" fill={COR[k]} opacity={sobre == null || sobre === i ? 1 : 0.45} />
                })}
                {nova && <circle cx={x + L / 2} cy={y - 7} r="3.5" fill="#10b981" />}
                <text x={x + L / 2 + 3} y={TOPO + ALT + 8} textAnchor="end" transform={`rotate(-55 ${x + L / 2 + 3} ${TOPO + ALT + 8})`} className="fill-muted-foreground text-[8px] tabular">{v.versao}</text>
              </g>
            )
          })}
          {dias.map(({ i, data, texto }) => (
            <g key={data}>
              <line x1={30 + i * (L + G)} x2={30 + i * (L + G)} y1={TOPO} y2={TOPO + ALT + 46} className="stroke-border" />
              {texto && <text x={33 + i * (L + G)} y={TOPO + ALT + 44} className="fill-foreground text-[9px] font-medium">{dataBR(data).replace(/ de \d{4}$/, '')}</text>}
            </g>
          ))}
        </svg>
      </div>
      {atual && (
        <div className="pointer-events-none absolute left-2 top-2 max-w-xs rounded-lg border border-border bg-card p-3 text-xs shadow-lg">{/* marca: dica flutua */}
          <p className="font-semibold tabular">Versão {atual.versao} <span className="font-normal text-muted-foreground">· {dataBR(atual.data)}</span></p>
          <p className="mt-0.5 line-clamp-2">{atual.titulo}</p>
          <ul className="mt-1.5 grid grid-cols-2 gap-x-3">{SECOES.map(([k, rot]) => <li key={k} className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR[k] }} />{rot}<b className="ml-auto text-foreground">{atual[k]?.length || 0}</b></li>)}</ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SECOES.map(([k, rot]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COR[k] }} />{rot}</span>)}
        {novas.size > 0 && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Nova desde a sua última visita</span>}
        <span className="ml-auto">Clique numa barra para ler a versão</span>
      </div>
    </div>
  )
}
