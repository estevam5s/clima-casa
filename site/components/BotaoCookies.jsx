'use client'
import { abrirPreferenciasCookies } from '@/lib/consentimento'

export default function BotaoCookies({ children = 'Preferências de cookies', className = 'botao-cookies-rodape' }) {
  return <button type="button" className={className} onClick={abrirPreferenciasCookies}>{children}</button>
}
