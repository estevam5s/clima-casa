// Guarda o token vindo do painel e mostra no ícone quantos avisos não lidos existem (a cada 5 minutos).
const API = 'https://app.zynio.com.br'
const nav = globalThis.browser || globalThis.chrome

nav.runtime.onMessage.addListener((m, remetente) => {
  if (!remetente?.url?.startsWith(API)) return
  if (m.tipo === 'sessao') nav.storage.local.set({ token: m.token, expira: m.expira, nome: m.nome }).then(contar)
  if (m.tipo === 'saiu') nav.storage.local.remove(['token', 'expira', 'nome']).then(() => nav.action.setBadgeText({ text: '' }))
})

async function contar() {
  const { token, expira } = await nav.storage.local.get(['token', 'expira'])
  if (!token || (expira && expira * 1000 < Date.now())) { nav.action.setBadgeText({ text: '' }); return }
  try {
    const r = await fetch(`${API}/api/notificacoes`, { headers: { Authorization: `Bearer ${token}` } })
    if (!r.ok) return
    const d = await r.json()
    const n = d?.contagem?.nao_lidas || 0
    nav.action.setBadgeBackgroundColor({ color: '#0f766a' })
    nav.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' })
  } catch { /* sem rede */ }
}

nav.alarms.create('avisos', { periodInMinutes: 5 })
nav.alarms.onAlarm.addListener((a) => { if (a.name === 'avisos') contar() })
nav.runtime.onStartup?.addListener(contar)
nav.runtime.onInstalled?.addListener(contar)
