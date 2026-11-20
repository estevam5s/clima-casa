import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

// Passo a passo vivo: uma cena animada (controle → transmissor → ar) e a lista de passos. Cada passo diz se já está
// feito pelo estado real do sistema (vem de quem usa o componente); o primeiro que falta fica aberto.
// passos = [{ titulo, texto (nó), feito (bool | null = só informativo), acao: { rotulo, onClick | para | href } }]

function Cena({ etapa, reduzir }) {
  // etapa: 'controle' (gravação: controle → transmissor), 'ar' (envio: transmissor → ar), 'rede' (Wi-Fi: celular/agente → transmissor)
  const pulso = (de, ate, atraso = 0) => reduzir ? null : (
    <motion.circle r="4" fill="hsl(var(--primary))" initial={{ cx: de[0], cy: de[1], opacity: 0 }}
      animate={{ cx: [de[0], ate[0]], cy: [de[1], ate[1]], opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.4, repeat: Infinity, delay: atraso, ease: 'easeInOut' }} />
  )
  const ativo = (k) => (etapa === k ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.35)')
  return (
    <svg viewBox="0 0 360 120" className="h-28 w-full" role="img" aria-label="Controle remoto, transmissor no teto e ar-condicionado">
      {/* teto */}
      <line x1="10" y1="14" x2="350" y2="14" stroke="hsl(var(--border))" strokeWidth="2" />
      {/* transmissor (no teto) */}
      <g transform="translate(160 16)">
        <rect x="-22" y="0" width="44" height="18" rx="9" fill="hsl(var(--card))" stroke={etapa === 'ar' || etapa === 'controle' || etapa === 'rede' ? 'hsl(var(--primary))' : 'hsl(var(--border))'} strokeWidth="2" />
        <circle cx="0" cy="9" r="3" fill="hsl(var(--primary))" />
        <text x="0" y="34" textAnchor="middle" className="fill-muted-foreground text-[9px]">transmissor</text>
      </g>
      {/* controle remoto */}
      <g transform="translate(46 62)">
        <rect x="-11" y="0" width="22" height="46" rx="6" fill="hsl(var(--card))" stroke={ativo('controle')} strokeWidth="2" />
        <rect x="-7" y="5" width="14" height="9" rx="2" fill="hsl(var(--primary) / 0.25)" />
        <circle cx="0" cy="24" r="3.5" fill="#dc2626" />
        <text x="0" y="58" textAnchor="middle" className="fill-muted-foreground text-[9px]">controle</text>
      </g>
      {/* ar-condicionado */}
      <g transform="translate(286 30)">
        <rect x="-44" y="0" width="88" height="26" rx="5" fill="hsl(var(--card))" stroke={ativo('ar')} strokeWidth="2" />
        <line x1="-34" y1="19" x2="34" y2="19" stroke="hsl(var(--border))" strokeWidth="2" />
        <text x="0" y="40" textAnchor="middle" className="fill-muted-foreground text-[9px]">ar-condicionado</text>
      </g>
      {/* Wi-Fi */}
      {etapa === 'rede' && <g transform="translate(160 92)"><path d="M-14 0a20 20 0 0 1 28 0M-8 6a11 11 0 0 1 16 0" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" /><circle cx="0" cy="12" r="2.5" fill="hsl(var(--primary))" /><text x="0" y="26" textAnchor="middle" className="fill-muted-foreground text-[9px]">Wi-Fi 2,4 GHz · agente</text></g>}
      {/* feixes */}
      <line x1="56" y1="66" x2="146" y2="30" stroke={ativo('controle')} strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="182" y1="26" x2="244" y2="38" stroke={ativo('ar')} strokeWidth="1.5" strokeDasharray="4 4" />
      {etapa === 'controle' && pulso([56, 66], [146, 30])}
      {etapa === 'ar' && <>{pulso([182, 26], [244, 38])}{pulso([182, 26], [244, 38], 0.7)}</>}
      {etapa === 'rede' && pulso([160, 92], [160, 36])}
    </svg>
  )
}

export default function PassoAPasso({ titulo, descricao, passos, chave }) {
  const reduzir = useReducedMotion()
  const primeiro = passos.findIndex((p) => p.feito === false)
  const [aberto, setAberto] = useState(primeiro >= 0 ? primeiro : 0)
  const [fechado, setFechado] = useState(() => { try { return localStorage.getItem(`passo-${chave}`) === 'fechado' } catch { return false } })
  useEffect(() => { if (primeiro >= 0) setAberto(primeiro) }, [primeiro])
  const feitos = passos.filter((p) => p.feito === true).length
  const conta = passos.filter((p) => p.feito !== null).length
  const alternar = () => setFechado((v) => { try { localStorage.setItem(`passo-${chave}`, v ? 'aberto' : 'fechado') } catch { /* */ } return !v })
  const cena = passos[aberto]?.cena || 'controle'
  return (
    <section className="cartao overflow-hidden">
      <button onClick={alternar} className="flex w-full items-center gap-3 p-5 text-left" aria-expanded={!fechado}>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{feitos} de {conta}</span>
        <motion.span animate={{ rotate: fechado ? 0 : 180 }}><ChevronDown className="h-4 w-4 text-muted-foreground" /></motion.span>
      </button>
      <div className="mx-5 h-1 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${conta ? (feitos / conta) * 100 : 0}%` }} transition={{ duration: reduzir ? 0 : 0.8 }} /></div>
      <AnimatePresence initial={false}>
        {!fechado && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <ol className="space-y-1.5">
                {passos.map((p, i) => {
                  const ab = aberto === i
                  return (
                    <li key={p.titulo} className={`rounded-lg border ${ab ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
                      <button onClick={() => setAberto(ab ? -1 : i)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left" aria-expanded={ab}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${p.feito === true ? 'bg-emerald-500 text-white' : ab ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                          {p.feito === true ? <Check className="h-3.5 w-3.5" /> : i + 1}
                        </span>
                        <span className={`min-w-0 flex-1 text-sm ${p.feito === true ? 'text-muted-foreground' : 'font-medium'}`}>{p.titulo}</span>
                        {p.feito === false && i === primeiro && <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[11px] font-medium text-amber-700 dark:text-amber-300">próximo</span>}
                      </button>
                      <AnimatePresence initial={false}>
                        {ab && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="space-y-3 px-3 pb-3 pl-12 text-sm text-muted-foreground">
                              <div>{p.texto}</div>
                              {p.acao && (p.acao.para
                                ? <Link to={p.acao.para} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{p.acao.rotulo}</Link>
                                : p.acao.href
                                  ? <a href={p.acao.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">{p.acao.rotulo}<ExternalLink className="h-3 w-3" /></a>
                                  : <button onClick={p.acao.onClick} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">{p.acao.rotulo}</button>)}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  )
                })}
              </ol>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <Cena etapa={cena} reduzir={reduzir} />
                <p className="mt-2 text-center text-xs text-muted-foreground">{cena === 'rede' ? 'O transmissor entra no Wi-Fi e o agente do escritório fala com ele' : cena === 'ar' ? 'O sistema manda o sinal gravado; o transmissor repete para o ar' : 'Na gravação, o controle aponta para o transmissor, que aprende o sinal'}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
