// Atualizações automáticas que respeitam quem está parado. Telas deixadas abertas (Painel num monitor, Mapa, Segurança)
// consultavam o servidor a cada 5 a 30 s o dia inteiro, e cada consulta conta no tráfego (Egress) do Supabase.
// Com a aba visível e alguém mexendo nos últimos 10 min: atualiza no ritmo normal. Parado: no máximo 1 vez a cada 5 min.
let ultimoUso = Date.now()
const PARADO_MS = 10 * 60 * 1000
const RITMO_PARADO_MS = 5 * 60 * 1000
const ultimas = {}
if (typeof window !== 'undefined') {
  const marcar = () => { ultimoUso = Date.now() }
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(ev, marcar, { passive: true, capture: true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) marcar() })
}

export function parado() { return Date.now() - ultimoUso > PARADO_MS }

// devePuxar('painel'): true quando vale consultar agora
export function devePuxar(chave) {
  if (typeof document !== 'undefined' && document.hidden) return false
  if (!parado()) { ultimas[chave] = Date.now(); return true }
  if (Date.now() - (ultimas[chave] || 0) >= RITMO_PARADO_MS) { ultimas[chave] = Date.now(); return true }
  return false
}
