// Verificação alternativa do portão (prova de trabalho), igual à do sistema (backend/app/rotas/api.py, POW_BITS):
// quando o Turnstile emperra no navegador, o navegador acha um número que, junto do desafio assinado, dá um SHA-256 com
// POW_BITS bits zero no começo. Sem estado: o desafio leva validade (5 min) e assinatura HMAC com VERIFICACAO_SEGREDO.
import crypto from 'node:crypto'

export const POW_BITS = 16
const agora = () => Math.floor(Date.now() / 1000)
export const assinar = (desafio, bits, exp) => crypto.createHmac('sha256', process.env.VERIFICACAO_SEGREDO || '').update(`pow:${desafio}:${bits}:${exp}`).digest('hex')

export function novoDesafio() {
  const desafio = crypto.randomBytes(16).toString('hex'), exp = agora() + 300
  return { desafio, bits: POW_BITS, exp, assinatura: assinar(desafio, POW_BITS, exp) }
}

export function provaOk(p) {
  if (!p || !/^[0-9a-f]{32}$/.test(String(p.desafio)) || !/^[0-9a-f]{64}$/.test(String(p.assinatura))) return false
  const bits = Number(p.bits), exp = Number(p.exp), nonce = Number(p.nonce)
  if (!Number.isInteger(bits) || bits < POW_BITS || bits > 30 || !Number.isInteger(nonce) || nonce < 0 || nonce > 1e9) return false
  if (!(exp >= agora() && exp <= agora() + 600)) return false
  const esperado = Buffer.from(assinar(p.desafio, bits, exp)), dado = Buffer.from(String(p.assinatura))
  if (esperado.length !== dado.length || !crypto.timingSafeEqual(esperado, dado)) return false
  const h = crypto.createHash('sha256').update(`${p.desafio}:${nonce}`).digest()
  for (let i = 0; i < bits; i++) if ((h[i >> 3] >> (7 - (i & 7))) & 1) return false
  return true
}
