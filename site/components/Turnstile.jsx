'use client'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { TURNSTILE_SITE_KEY } from '@/lib/dados'

// Cloudflare Turnstile: prova de que é uma pessoa antes de enviar o formulário (aparece só se precisar interagir).
let script = null
function carregar() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!script) {
    script = new Promise((ok, falha) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true; s.defer = true
      s.onload = () => ok(window.turnstile)
      s.onerror = () => { script = null; falha(new Error('turnstile')) }
      document.head.appendChild(s)
    })
  }
  return script
}

const Turnstile = forwardRef(function Turnstile({ aoMudar, acao = 'contato' }, ref) {
  const caixa = useRef(null)
  const widget = useRef(null)
  useImperativeHandle(ref, () => ({ reiniciar: () => { if (widget.current && window.turnstile) { window.turnstile.reset(widget.current); aoMudar('') } } }))
  useEffect(() => {
    let vivo = true
    carregar().then((ts) => {
      if (!vivo || !caixa.current) return
      widget.current = ts.render(caixa.current, {
        sitekey: TURNSTILE_SITE_KEY, theme: 'dark', action: acao, language: 'pt-br', appearance: 'interaction-only',
        callback: (t) => aoMudar(t), 'expired-callback': () => aoMudar(''), 'error-callback': () => aoMudar(''),
      })
    }).catch(() => aoMudar(''))
    return () => { vivo = false; if (widget.current && window.turnstile) window.turnstile.remove(widget.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={caixa} className="caixa-turnstile" />
})
export default Turnstile
