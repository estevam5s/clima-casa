// Confere o Turnstile (ou a prova de trabalho, quando o Turnstile emperra: ./pow.js) da tela de verificação e grava o
// passe assinado "zv" (12 h), igual ao do sistema.
import crypto from 'node:crypto'
import { provaOk } from './pow'

export async function POST(request) {
  const segredo = process.env.VERIFICACAO_SEGREDO, chaveSecreta = process.env.TURNSTILE_SECRET_KEY
  let corpo = {}
  try { corpo = await request.json() } catch { /* sem corpo */ }
  const token = String(corpo.turnstile || '').slice(0, 4000)
  if (corpo.prova) {
    if (!provaOk(corpo.prova)) return Response.json({ detail: 'A verificação expirou. Recarregue a página.' }, { status: 400 })
  } else if (!token) return Response.json({ detail: 'Falta a verificação.' }, { status: 400 })
  else if (chaveSecreta) {
    const ip = request.headers.get('x-real-ip') || ''
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: new URLSearchParams({ secret: chaveSecreta, response: token, ...(ip ? { remoteip: ip } : {}) }),
    }).then((x) => x.json()).catch(() => ({ success: true })) // Cloudflare fora do ar não tranca o site
    if (!r.success) return Response.json({ detail: 'A verificação contra robôs falhou.' }, { status: 400 })
  }
  if (!segredo) return Response.json({ ok: true })
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600
  const passe = `${exp}.${crypto.createHmac('sha256', segredo).update(String(exp)).digest('hex')}`
  const host = new URL(request.url).hostname
  const dominio = host.endsWith('zynio.com.br') ? '; Domain=.zynio.com.br' : ''
  return Response.json({ ok: true }, { headers: { 'set-cookie': `zv=${passe}; Max-Age=${12 * 3600}; Path=/; HttpOnly; Secure; SameSite=Lax${dominio}` } })
}
