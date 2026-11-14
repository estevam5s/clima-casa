import * as L from 'lucide-react'
import * as SI from 'simple-icons'

// Ícone por nome: "siXxx" usa o logotipo real (simple-icons); o resto vem do lucide (traço fino, como no modelo).
export default function Icone({ nome, tamanho = 24, traco = 1.5, className = '' }) {
  if (nome?.startsWith('si')) {
    const i = SI[nome]
    if (!i) return null
    return <svg viewBox="0 0 24 24" width={tamanho} height={tamanho} className={className} fill="currentColor" aria-hidden="true"><path d={i.path} /></svg>
  }
  const C = L[nome] || L.Circle
  return <C size={tamanho} strokeWidth={traco} className={className} aria-hidden="true" />
}

export function nomeMarca(nome) {
  return SI[nome]?.title || nome
}
