import { useEffect, useState } from 'react'

// Preferências deste navegador (não vão para o servidor): efeito do mouse, atalhos etc.
const CHAVE = 'clima-preferencias'
export const PADRAO = { cursor: false, cursor_estilo: 'anel_ponto', cursor_cor: 'marca', cursor_tamanho: 36, cursor_esconder_seta: false, atalhos: true }
export function lerPreferencias() {
  try { return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') } } catch { return { ...PADRAO } }
}
export function salvarPreferencias(mudanca) {
  const nova = { ...lerPreferencias(), ...mudanca }
  try { localStorage.setItem(CHAVE, JSON.stringify(nova)) } catch { /* sem armazenamento */ }
  window.dispatchEvent(new CustomEvent('clima:preferencias', { detail: nova }))
  return nova
}
export function usePreferencias() {
  const [p, setP] = useState(lerPreferencias)
  useEffect(() => {
    const ouvir = (e) => setP(e.detail || lerPreferencias())
    const outraAba = (e) => { if (e.key === CHAVE) setP(lerPreferencias()) }
    window.addEventListener('clima:preferencias', ouvir); window.addEventListener('storage', outraAba)
    return () => { window.removeEventListener('clima:preferencias', ouvir); window.removeEventListener('storage', outraAba) }
  }, [])
  return [p, (m) => setP(salvarPreferencias(m))]
}
