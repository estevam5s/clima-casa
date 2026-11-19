import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

// Painel do carro sobre o 3D: velocímetro, conta-giros, marcha e luzes de ABS, controle de tração e freio de mão.
// No celular, pedais e volante na tela (segurar = pisar).
export default function PainelCarro({ estado, tecla }) {
  const [h, setH] = useState(null)
  const toque = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const ult = useRef('')
  useEffect(() => {
    let raf = 0, t0 = 0
    const ler = (t) => {
      raf = requestAnimationFrame(ler)
      if (t - t0 < 66) return
      t0 = t
      const x = estado.current?.hudCarro
      const k = x ? `${x.kmh}|${Math.round(x.rpm / 100)}|${x.marcha}|${x.abs}|${x.tcs}|${x.mao}|${x.cam}` : ''
      if (k !== ult.current) { ult.current = k; setH(x ? { ...x } : null) }
    }
    raf = requestAnimationFrame(ler)
    return () => cancelAnimationFrame(raf)
  }, [estado])
  if (!h) return null
  const frac = Math.min(1, h.rpm / h.limite)
  const luz = (on, r, cor) => <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${on ? cor : 'bg-white/10 text-white/35'}`}>{r}</span>
  const pedal = (k, r, cls) => (
    <button aria-label={r} className={`select-none rounded-xl border border-white/20 px-4 py-3 text-xs font-semibold text-white active:scale-95 ${cls}`}
      onPointerDown={(e) => { e.preventDefault(); tecla(k, true) }} onPointerUp={() => tecla(k, false)} onPointerLeave={() => tecla(k, false)} onPointerCancel={() => tecla(k, false)}>{r}</button>
  )
  return (
    <>
      <div className={`pointer-events-none absolute left-3 z-10 w-44 rounded-xl bg-black/65 p-3 text-white sm:w-52 ${toque ? 'top-24' : 'bottom-3'}`}> {/* marca: painel do carro flutua sobre o 3D */}
        <div className="flex items-end justify-between">
          <p><span className="text-4xl font-bold tabular-nums">{h.kmh}</span> <span className="text-xs text-white/70">km/h</span></p>
          <p className="text-right"><span className="block text-[10px] text-white/60">marcha</span><span className="text-2xl font-bold">{h.marcha}</span></p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: frac > 0.9 ? '#ef4444' : frac > 0.75 ? '#f59e0b' : '#22c55e' }} /></div>
        <p className="mt-1 text-[10px] tabular-nums text-white/60">{h.rpm.toLocaleString('pt-BR')} rpm</p>
        <div className="mt-2 flex gap-1">{luz(h.abs, 'ABS', 'bg-amber-500 text-black')}{luz(h.tcs, 'TCS', 'bg-amber-500 text-black')}{luz(h.mao, 'FREIO', 'bg-red-600 text-white')}</div>
        {!toque && <p className="mt-2 text-[10px] leading-snug text-white/60">W acelera · S freia/ré · A D vira · Espaço freio de mão · C câmera · H buzina · R desvira · E sai</p>}
      </div>
      {toque && (
        <div className="absolute bottom-14 left-0 right-0 z-10 flex items-end justify-between px-3">
          <div className="flex gap-2">
            <button aria-label="Virar à esquerda" className="rounded-xl border border-white/20 bg-black/55 p-4 text-white" onPointerDown={(e) => { e.preventDefault(); tecla('a', true) }} onPointerUp={() => tecla('a', false)} onPointerLeave={() => tecla('a', false)}><ArrowLeft className="h-5 w-5" /></button>
            <button aria-label="Virar à direita" className="rounded-xl border border-white/20 bg-black/55 p-4 text-white" onPointerDown={(e) => { e.preventDefault(); tecla('d', true) }} onPointerUp={() => tecla('d', false)} onPointerLeave={() => tecla('d', false)}><ArrowRight className="h-5 w-5" /></button>
          </div>
          <div className="flex gap-2">{pedal(' ', 'Mão', 'bg-black/55')}{pedal('s', 'Freio', 'bg-red-700/80')}{pedal('w', 'Acelerar', 'bg-emerald-700/80')}</div>
        </div>
      )}
    </>
  )
}
