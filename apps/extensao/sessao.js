// Roda só em app.zynio.com.br: quando a pessoa está logada no painel, passa o token de acesso (não o de renovação) para a extensão.
// O painel renova o token sozinho enquanto estiver aberto; a extensão nunca renova (renovar trocaria a sessão do painel).
function enviar() {
  try {
    const s = JSON.parse(localStorage.getItem('clima-casa-auth') || 'null')
    if (s?.access_token) chrome.runtime.sendMessage({ tipo: 'sessao', token: s.access_token, expira: s.expires_at || 0, nome: s.user?.user_metadata?.nome || s.user?.email || '' })
    else chrome.runtime.sendMessage({ tipo: 'saiu' })
  } catch { /* página sem acesso ao armazenamento */ }
}
enviar()
setInterval(enviar, 60000)
window.addEventListener('storage', (e) => { if (e.key === 'clima-casa-auth') enviar() })
