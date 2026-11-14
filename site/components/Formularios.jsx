'use client'
import { useState } from 'react'
import { Mail } from 'lucide-react'
import Botao from './Botao'
import { SISTEMA_URL } from '@/lib/dados'

// As mensagens vão para o próprio sistema (vira notificação no sino do administrador).
async function enviar(corpo) {
  const r = await fetch(`${SISTEMA_URL}/api/site/contato`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  let dados = {}
  try { dados = await r.json() } catch { /* sem corpo */ }
  if (!r.ok) throw new Error(dados.detail || 'Não foi possível enviar agora. Tente de novo em instantes.')
  return dados
}

export function FormNovidades() {
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState(null)
  const enviarForm = async (e) => {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    try { await enviar({ tipo: 'novidades', email }); setEstado({ tipo: 'ok', msg: 'Pronto: você recebe as próximas novidades.' }); setEmail('') } catch (err) { setEstado({ tipo: 'erro', msg: err.message }) }
  }
  return (
    <form onSubmit={enviarForm}>
      <div className="grupo-form">
        <label htmlFor="email-novidades"><Mail size={18} strokeWidth={1.5} /></label>
        <input id="email-novidades" type="email" required placeholder="Seu e-mail" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        <Botao type="submit" disabled={estado?.tipo === 'enviando'}>{estado?.tipo === 'enviando' ? 'Enviando' : 'Assinar'}</Botao>
      </div>
      {estado?.msg && <p style={{ marginTop: 10, fontSize: 14, color: estado.tipo === 'ok' ? 'var(--primaria)' : '#ff6b6b' }}>{estado.msg}</p>}
    </form>
  )
}

export function FormContato({ compacto = false }) {
  const [f, setF] = useState({ nome: '', email: '', assunto: '', mensagem: '' })
  const [estado, setEstado] = useState(null)
  const mudar = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const enviarForm = async (e) => {
    e.preventDefault()
    setEstado({ tipo: 'enviando' })
    try {
      await enviar({ tipo: 'contato', ...f })
      setEstado({ tipo: 'ok', msg: 'Mensagem enviada. O administrador vê na central de notificações do sistema.' })
      setF({ nome: '', email: '', assunto: '', mensagem: '' })
    } catch (err) { setEstado({ tipo: 'erro', msg: err.message }) }
  }
  return (
    <form className="formulario" onSubmit={enviarForm}>
      <input className="campo" placeholder="Nome" required maxLength={80} value={f.nome} onChange={mudar('nome')} aria-label="Nome" />
      <input className="campo" type="email" placeholder="E-mail" required maxLength={200} value={f.email} onChange={mudar('email')} aria-label="E-mail" />
      {!compacto && <input className="campo" placeholder="Assunto" maxLength={120} value={f.assunto} onChange={mudar('assunto')} aria-label="Assunto" />}
      <textarea className="campo" placeholder="Mensagem" required maxLength={2000} value={f.mensagem} onChange={mudar('mensagem')} aria-label="Mensagem" />
      <Botao type="submit" disabled={estado?.tipo === 'enviando'}>{estado?.tipo === 'enviando' ? 'Enviando…' : 'Enviar mensagem'}</Botao>
      {estado?.msg && <p className={`aviso ${estado.tipo}`}>{estado.msg}</p>}
    </form>
  )
}
