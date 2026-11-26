import { useEffect, useState } from 'react'

// Preferências deste navegador (não vão para o servidor): efeito do mouse, atalhos etc.
const CHAVE = 'clima-preferencias'
export const PADRAO = {
  cursor: false, cursor_estilo: 'anel_ponto', cursor_cor: 'marca', cursor_cor_hex: '#14b8a6', cursor_tamanho: 36,
  cursor_ponto_tamanho: 6, cursor_espessura: 1.5, cursor_suavidade: 20, cursor_esconder_seta: false, cursor_efeitos: [],
  cursor_modelo: 'sistema', cursor_modelo_tamanho: 32, atalhos: true, som_clique: true, som_clique_volume: 35,
}
// a empresa pode definir um padrão para quem nunca mexeu (White label → Cursor padrão)
let padraoEmpresa = {}
export function definirPadraoEmpresa(p) {
  padraoEmpresa = p || {}
  window.dispatchEvent(new CustomEvent('clima:preferencias', { detail: lerPreferencias() }))
}
export function lerPreferencias() {
  try { return { ...PADRAO, ...padraoEmpresa, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') } } catch { return { ...PADRAO, ...padraoEmpresa } }
}
export function salvarPreferencias(mudanca) {
  let atual = {}
  try { atual = JSON.parse(localStorage.getItem(CHAVE) || '{}') } catch { /* vazio */ }
  const gravar = { ...atual, ...mudanca }
  try { localStorage.setItem(CHAVE, JSON.stringify(gravar)) } catch { /* sem armazenamento */ }
  const nova = lerPreferencias()
  window.dispatchEvent(new CustomEvent('clima:preferencias', { detail: nova }))
  return nova
}
export function usePreferencias() {
  const [p, setP] = useState(lerPreferencias)
  useEffect(() => {
    const ouvir = (e) => setP(e.detail || lerPreferencias())
    const outraAba = (e) => { if (e.key === CHAVE || e.key === CHAVE_CURSORES) setP(lerPreferencias()) }
    window.addEventListener('clima:preferencias', ouvir); window.addEventListener('storage', outraAba)
    return () => { window.removeEventListener('clima:preferencias', ouvir); window.removeEventListener('storage', outraAba) }
  }, [])
  return [p, (m) => setP(salvarPreferencias(m))]
}

// ---- modelos de cursor enviados pelo usuário (ficam só neste navegador) ----
export const CHAVE_CURSORES = 'clima-cursores'
export const MAX_CURSORES = 8
export function lerCursores() {
  try { const l = JSON.parse(localStorage.getItem(CHAVE_CURSORES) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] }
}
export function salvarCursores(lista) {
  localStorage.setItem(CHAVE_CURSORES, JSON.stringify(lista.slice(0, MAX_CURSORES)))
  window.dispatchEvent(new CustomEvent('clima:preferencias', { detail: lerPreferencias() }))
}
