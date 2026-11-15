// Consentimento de cookies guardado no navegador (chave "zynio-cookies"): versão, escolhas por categoria e validade.
export const CHAVE_CONSENTIMENTO = 'zynio-cookies'

export function lerConsentimento() {
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CONSENTIMENTO) || 'null')
    if (!c || (c.expira && c.expira < Date.now())) return null
    return c
  } catch { return null }
}

// Pode usar a categoria? Essenciais sempre; o resto só com aceite explícito.
export function consentiu(categoria) {
  if (categoria === 'essenciais') return true
  return !!lerConsentimento()?.escolhas?.[categoria]
}

export function abrirPreferenciasCookies() {
  window.dispatchEvent(new Event('zynio:cookies'))
}
