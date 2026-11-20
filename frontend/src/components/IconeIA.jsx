import { siGoogle, siKimi, siMeta, siMinimax, siMistralai, siNvidia } from 'simple-icons'

// Ícone real de cada fabricante de modelo de IA (simple-icons, SVG oficial). Quem não tem ícone público (Poolside,
// StepFun, Z.ai) fica com o monograma na cor da marca.
const ICONES = { nvidia: siNvidia, google: siGoogle, meta: siMeta, mistral: siMistralai, minimax: siMinimax, kimi: siKimi }
const MONOGRAMA = { poolside: ['P', '#3b82f6'], stepfun: ['S', '#2563eb'], zai: ['Z', '#111827'] }
export const EMPRESAS = { nvidia: 'NVIDIA', google: 'Google', meta: 'Meta', mistral: 'Mistral AI', minimax: 'MiniMax', kimi: 'Moonshot AI (Kimi)', poolside: 'Poolside', stepfun: 'StepFun', zai: 'Z.ai (Zhipu)' }

export default function IconeIA({ empresa, className = 'h-5 w-5' }) {
  const ic = ICONES[empresa]
  if (ic) {
    // Kimi é preto: no tema escuro usa a cor do texto para não sumir
    const cor = ic.hex === '000000' ? 'currentColor' : `#${ic.hex}`
    return <svg viewBox="0 0 24 24" className={className} role="img" aria-label={EMPRESAS[empresa] || empresa}><path d={ic.path} fill={cor} /></svg>
  }
  const [l, cor] = MONOGRAMA[empresa] || [(empresa || '?').slice(0, 1).toUpperCase(), '#6b7280']
  return <span className={`inline-flex items-center justify-center rounded-md text-[10px] font-bold text-white ${className}`} style={{ backgroundColor: cor }} aria-label={EMPRESAS[empresa] || empresa}>{l}</span>
}
