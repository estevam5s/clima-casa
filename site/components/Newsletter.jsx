'use client'
import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, MailX, TriangleAlert } from 'lucide-react'
import Botao from './Botao'
import Turnstile from './Turnstile'
import { SISTEMA_URL } from '@/lib/dados'

// Volta dos links dos e-mails: ?confirmado=1 (inscrição confirmada), ?erro=link, ?sair=<token> (cancelar com um clique).
// Cancelar pede um clique na página (verificadores de link dos e-mails abrem links sozinhos e não podem cancelar ninguém).
export function EstadoNewsletter() {
  const p = useSearchParams()
  const [saiu, setSaiu] = useState(null)
  const token = p.get('sair')
  const cancelar = async () => {
    setSaiu('enviando')
    try {
      const r = await fetch(`${SISTEMA_URL}/api/site/newsletter/sair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      const j = await r.json().catch(() => ({}))
      setSaiu(j.ok ? 'ok' : 'erro')
    } catch { setSaiu('erro') }
  }
  if (p.get('confirmado')) return <div className="aviso-news ok"><CheckCircle2 size={22} /><div><b>Inscrição confirmada.</b> Você vai receber as próximas novidades. Sair é um clique em qualquer e-mail.</div></div>
  if (p.get('erro')) return <div className="aviso-news erro"><TriangleAlert size={22} /><div><b>Esse link não vale mais.</b> Peça a inscrição de novo no formulário abaixo.</div></div>
  if (token !== null) {
    if (saiu === 'ok') return <div className="aviso-news ok"><CheckCircle2 size={22} /><div><b>Pronto, você saiu da lista.</b> Não enviamos mais nada. Se mudar de ideia, é só assinar de novo.</div></div>
    return (
      <div className="aviso-news">
        <MailX size={22} />
        <div>
          <b>Cancelar a inscrição na newsletter?</b> Você deixa de receber as novidades por e-mail.
          {saiu === 'erro' && <p style={{ color: '#ff6b6b', marginTop: 6 }}>Não deu para cancelar por este link. Responda a qualquer e-mail da newsletter pedindo para sair.</p>}
          <div style={{ marginTop: 14 }}><Botao type="button" onClick={cancelar} disabled={saiu === 'enviando' || !token}>{saiu === 'enviando' ? 'Cancelando' : 'Cancelar inscrição'}</Botao></div>
        </div>
      </div>
    )
  }
  return null
}

// Cancelar sem o e-mail antigo: manda o link de cancelamento para o endereço (a resposta é igual para qualquer e-mail)
export function PedirSaida() {
  const [email, setEmail] = useState('')
  const [robo, setRobo] = useState('')
  const [estado, setEstado] = useState(null)
  const roboRef = useRef(null)
  const enviar = async (e) => {
    e.preventDefault(); setEstado('enviando')
    try {
      const r = await fetch(`${SISTEMA_URL}/api/site/newsletter/pedir-saida`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, turnstile: robo }) })
      const j = await r.json().catch(() => ({}))
      setEstado(r.ok ? 'ok' : j.detail || 'Não deu para enviar agora. Tente de novo.')
    } catch { setEstado('Não deu para enviar agora. Tente de novo.') } finally { roboRef.current?.reiniciar() }
  }
  return (
    <form onSubmit={enviar} className="sair-news" id="sair">
      <h4>Cancelar a inscrição</h4>
      <p>Escreva o e-mail inscrito. Se ele estiver na lista, chega um link para sair com um clique.</p>
      <div className="grupo-form">
        <input type="email" required maxLength={200} placeholder="E-mail inscrito" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="E-mail inscrito" />
        <Botao type="submit" disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando' : 'Pedir link'}</Botao>
      </div>
      <Turnstile ref={roboRef} aoMudar={setRobo} acao="newsletter_sair" />
      {estado === 'ok' && <p className="aviso-sair ok">Pronto. Se esse e-mail estiver inscrito, o link de cancelamento chega em instantes.</p>}
      {estado && estado !== 'ok' && estado !== 'enviando' && <p className="aviso-sair erro">{estado}</p>}
    </form>
  )
}
