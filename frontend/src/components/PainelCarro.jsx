import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

// Painel do carro sobre o 3D: velocímetro, conta-giros, câmbio automático (P R N D), luzes de ABS, controle de tração,
// estabilidade (ESC) e freio de mão, carga do nitro e altitude quando voa. No celular, pedais e volante na tela (segurar = pisar).
export default function PainelCarro({ estado, tecla, propulsores }) {
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
      const k = x ? `${x.kmh}|${Math.round(x.rpm / 100)}|${x.marcha}|${x.abs}|${x.tcs}|${x.esc}|${x.mao}|${x.cam}|${Math.round((x.nitro ?? 0) * 20)}|${x.nitroOn}|${x.voando}|${x.alt}` : ''
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
          <p className="text-right"><span className="block text-[10px] text-white/60">{h.voando ? 'altitude' : h.eletrico ? 'elétrico' : 'automático'}</span><span className="text-2xl font-bold tabular-nums">{h.voando ? `${h.alt} m` : h.marcha}</span></p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: frac > 0.9 ? '#ef4444' : frac > 0.75 ? '#f59e0b' : '#22c55e' }} /></div>
        <p className="mt-1 text-[10px] tabular-nums text-white/60">{h.rpm.toLocaleString('pt-BR')} rpm</p>
        <div className="mt-2 flex flex-wrap gap-1">{luz(h.abs, 'ABS', 'bg-amber-500 text-black')}{luz(h.tcs, 'TCS', 'bg-amber-500 text-black')}{luz(h.esc, 'ESC', 'bg-amber-500 text-black')}{luz(h.mao, 'FREIO', 'bg-red-600 text-white')}{h.voar && luz(h.voando, 'VOO', 'bg-sky-400 text-black')}</div>
        {h.nitro != null && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className={`text-[10px] font-bold ${h.nitroOn ? 'text-sky-300' : 'text-white/60'}`}>NITRO</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.round(h.nitro * 100)}%` }} /></div>
          </div>
        )}
        {!toque && <p className="mt-2 text-[10px] leading-snug text-white/60">{h.voando
          ? 'W empurra · S freia · A D vira · Espaço sobe · X desce · Shift nitro · T desliga os propulsores · E sai (pousado)'
          : `W acelera · S freia/ré · A D vira · Espaço freio de mão · Shift nitro${h.voar ? ' · T voa' : ''} · C câmera · H buzina · R desvira · E sai`}</p>}
      </div>
      {toque && (
        <div className="absolute bottom-14 left-0 right-0 z-10 flex items-end justify-between px-3">
          <div className="flex gap-2">
            <button aria-label="Virar à esquerda" className="rounded-xl border border-white/20 bg-black/55 p-4 text-white" onPointerDown={(e) => { e.preventDefault(); tecla('a', true) }} onPointerUp={() => tecla('a', false)} onPointerLeave={() => tecla('a', false)}><ArrowLeft className="h-5 w-5" /></button>
            <button aria-label="Virar à direita" className="rounded-xl border border-white/20 bg-black/55 p-4 text-white" onPointerDown={(e) => { e.preventDefault(); tecla('d', true) }} onPointerUp={() => tecla('d', false)} onPointerLeave={() => tecla('d', false)}><ArrowRight className="h-5 w-5" /></button>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              {h.voar && <button className="rounded-xl border border-white/20 bg-sky-700/80 px-3 py-2 text-xs font-semibold text-white" onClick={propulsores}>{h.voando ? 'Pousar' : 'Voar'}</button>}
              {h.voando && pedal('x', 'Descer', 'bg-black/55')}
              {h.nitro != null && pedal('shift', 'Nitro', 'bg-sky-700/80')}
            </div>
            <div className="flex gap-2">{pedal(' ', h.voando ? 'Subir' : 'Mão', 'bg-black/55')}{pedal('s', 'Freio', 'bg-red-700/80')}{pedal('w', 'Acelerar', 'bg-emerald-700/80')}</div>
          </div>
        </div>
      )}
    </>
  )
}
