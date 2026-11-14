import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Cloudflare Turnstile (bloqueio de bots). A chave pública vem de /api/supabase-config.
let script = null
function carregarScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!script) {
    script = new Promise((ok, falha) => {
      const s = document.createElement('script')
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      s.async = true; s.defer = true
      s.onload = () => ok(window.turnstile)
      s.onerror = () => { script = null; falha(new Error('Não foi possível carregar a verificação da Cloudflare.')) }
      document.head.appendChild(s)
    })
  }
  return script
}
let chave = null
const chaveTurnstile = () => chave || (chave = fetch('/api/supabase-config').then((r) => r.json()).then((c) => c.turnstile || '').catch(() => ''))

const Turnstile = forwardRef(function Turnstile({ aoMudar, tema = 'auto', acao = 'login', className = '' }, ref) {
  const caixa = useRef(null)
  const widget = useRef(null)
  const [ativo, setAtivo] = useState(true)
  useImperativeHandle(ref, () => ({ reiniciar: () => { if (widget.current && window.turnstile) { window.turnstile.reset(widget.current); aoMudar('') } } }))
  useEffect(() => {
    let vivo = true
    chaveTurnstile().then((sitekey) => {
      if (!sitekey) { setAtivo(false); aoMudar(null); return null }   // sem chave (desenvolvimento): segue sem verificação
      return carregarScript().then((ts) => {
        if (!vivo || !caixa.current) return
        widget.current = ts.render(caixa.current, {
          sitekey, theme: tema, action: acao, language: 'pt-br', appearance: 'interaction-only',
          callback: (t) => aoMudar(t), 'expired-callback': () => aoMudar(''), 'error-callback': () => aoMudar(''),
        })
      })
    }).catch(() => aoMudar(''))
    return () => { vivo = false; if (widget.current && window.turnstile) window.turnstile.remove(widget.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ativo) return null
  return <div ref={caixa} className={className} />
})
export default Turnstile
