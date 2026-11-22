import { useMemo, useState } from 'react'

// Mapa de uso (comandos por dia da semana × hora, últimos 7 dias): grade com a intensidade na cor da marca, totais por hora
// em cima, totais por dia à direita, o pico marcado e um resumo. Substitui as barras 3D como vista principal (mais fácil
// de ler e comparar; o 3D continua como opção no Painel).
const HORAS = Array.from({ length: 24 }, (_, h) => h)

export default function MapaUso({ mapa }) {
  const [dica, setDica] = useState(null)
  const d = useMemo(() => {
    const linhas = mapa || []
    const max = Math.max(1, ...linhas.flatMap((l) => l.horas))
    const porHora = HORAS.map((h) => linhas.reduce((s, l) => s + (l.horas[h] || 0), 0))
    const porDia = linhas.map((l) => l.horas.reduce((s, v) => s + v, 0))
    const total = porDia.reduce((s, v) => s + v, 0)
    let pico = null
    linhas.forEach((l, i) => l.horas.forEach((v, h) => { if (v && (!pico || v > pico.v)) pico = { i, h, v, dia: l.dia } }))
    const horaTop = porHora.indexOf(Math.max(...porHora)), diaTop = porDia.indexOf(Math.max(...porDia))
    // janela de uso: da 1ª à última hora com comando
    const usadas = HORAS.filter((h) => porHora[h] > 0)
    return { linhas, max, porHora, porDia, total, pico, horaTop, diaTop, maxHora: Math.max(1, ...porHora), maxDia: Math.max(1, ...porDia), janela: usadas.length ? [usadas[0], usadas[usadas.length - 1]] : null }
  }, [mapa])
  if (!d.linhas.length) return <p className="p-5 text-sm text-muted-foreground">Sem comandos nos últimos 7 dias.</p>
  const cor = (v) => (v ? `hsl(var(--primary) / ${0.14 + (v / d.max) * 0.86})` : 'hsl(var(--muted))')
  return (
    <div className="p-5">
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="text-xs text-muted-foreground">Comandos (7 dias)</p><p className="text-lg font-semibold tabular">{d.total}</p></div>
        <div><p className="text-xs text-muted-foreground">Pico</p><p className="text-lg font-semibold">{d.pico ? `${d.pico.dia} ${d.pico.h}h` : '-'}</p><p className="text-[11px] text-muted-foreground">{d.pico ? `${d.pico.v} comandos` : ''}</p></div>
        <div><p className="text-xs text-muted-foreground">Hora mais usada</p><p className="text-lg font-semibold">{d.total ? `${d.horaTop}h às ${d.horaTop + 1}h` : '-'}</p></div>
        <div><p className="text-xs text-muted-foreground">Uso do dia</p><p className="text-lg font-semibold">{d.janela ? `${d.janela[0]}h às ${d.janela[1] + 1}h` : '-'}</p><p className="text-[11px] text-muted-foreground">{d.total ? `dia mais usado: ${d.linhas[d.diaTop]?.dia}` : ''}</p></div>
      </div>
      <div className="relative -mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: '2.6rem repeat(24, minmax(0, 1fr)) 3rem' }} onMouseLeave={() => setDica(null)}>
          {/* totais por hora */}
          <span />
          {HORAS.map((h) => (
            <div key={`t${h}`} className="flex h-10 items-end" title={`${h}h: ${d.porHora[h]} comandos`}>
              <div className={`w-full rounded-t-sm ${h === d.horaTop && d.total ? 'bg-primary' : 'bg-primary/35'}`} style={{ height: `${(d.porHora[h] / d.maxHora) * 100}%`, minHeight: d.porHora[h] ? 2 : 0 }} />
            </div>
          ))}
          <span />
          {d.linhas.map((l, i) => (
            <div key={l.dia} className="contents">
              <span className={`flex items-center text-xs ${i === d.diaTop && d.total ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{l.dia}</span>
              {HORAS.map((h) => {
                const v = l.horas[h] || 0, pico = d.pico && d.pico.i === i && d.pico.h === h
                return (
                  <button key={h} type="button" aria-label={`${l.dia} ${h}h: ${v} comandos`} onMouseEnter={() => setDica({ dia: l.dia, h, v })} onFocus={() => setDica({ dia: l.dia, h, v })}
                    className={`aspect-square rounded-[4px] transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${pico ? 'ring-2 ring-foreground/70' : ''}`}
                    style={{ background: cor(v) }} />
                )
              })}
              <div className="flex items-center gap-1.5 pl-1.5" title={`${l.dia}: ${d.porDia[i]} comandos`}>
                <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(d.porDia[i] / d.maxDia) * 100}%` }} /></div>
                <span className="w-4 text-right text-[10px] tabular text-muted-foreground">{d.porDia[i]}</span>
              </div>
            </div>
          ))}
          <span />
          {HORAS.map((h) => <span key={`h${h}`} className="text-center text-[10px] tabular text-muted-foreground">{h % 3 === 0 ? `${h}h` : ''}</span>)}
          <span />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-h-4">{dica ? <><b className="text-foreground">{dica.dia} às {dica.h}h</b>: {dica.v} comando(s)</> : 'Passe o mouse (ou o dedo) numa célula para ver o número.'}</span>
        <span className="flex items-center gap-1.5">menos {[0, 0.25, 0.5, 0.75, 1].map((k) => <i key={k} className="h-3 w-3 rounded-[3px]" style={{ background: k ? `hsl(var(--primary) / ${0.14 + k * 0.86})` : 'hsl(var(--muted))' }} />)} mais</span>
      </div>
    </div>
  )
}
