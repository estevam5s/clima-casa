// Última resposta de uma tela guardada no navegador, por pessoa: a tela abre na hora com o que viu da última vez e
// troca pelos dados novos assim que o servidor responde (o Painel levava ~2 s em branco). Vale 24 h; sai ao sair da conta.
const PREFIXO = 'clima-cache:'
const VALIDADE = 24 * 3600 * 1000

function usuario() {
  try { return JSON.parse(localStorage.getItem('clima-casa-auth') || 'null')?.user?.id || '' } catch { return '' }
}

export function lerCache(chave) {
  const uid = usuario()
  if (!uid) return null
  try {
    const v = JSON.parse(localStorage.getItem(`${PREFIXO}${uid}:${chave}`) || 'null')
    return v && Date.now() - v.em < VALIDADE ? v.dados : null
  } catch { return null }
}

export function gravarCache(chave, dados) {
  const uid = usuario()
  if (!uid) return
  try { localStorage.setItem(`${PREFIXO}${uid}:${chave}`, JSON.stringify({ em: Date.now(), dados })) } catch { /* cheio ou bloqueado */ }
}

export function limparCache() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)).forEach((k) => localStorage.removeItem(k)) } catch { /* sem armazenamento */ }
}
