import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { supabase } from '../supabase'
import { DOWNLOADS, sistemaAtual } from '../apps'
import { Aviso, Botao, Carregando } from '../components/ui'

const ERROS = {
'Invalid login credentials': 'E-mail ou senha incorretos.',
'Email not confirmed': 'E-mail ainda não confirmado.',
}

export default function Login() {
  const [pronto, setPronto] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const navegar = useNavigate()
  const destino = useLocation().state?.de || '/'

  useEffect(() => {
    supabase()
      .then(async (sb) => {
        const { data } = await sb.auth.getSession()
        if (data.session) {
          try { await api.get('/api/sessao'); return navegar(destino, { replace: true }) } catch { await sb.auth.signOut() }
        }
        setPronto(true)
      })
      .catch((e) => { setErro(e.message); setPronto(true) })
  }, [navegar, destino])

  if (!pronto) return <Carregando />

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const sb = await supabase()
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) throw new Error(ERROS[error.message] || error.message)
      try {
        await api.get('/api/sessao')
      } catch (err) {
        await sb.auth.signOut()
        throw err
      }
      api.post('/api/sessao/registrar-login').catch(() => {})
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(err.message)
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="#0f766a" />
            <path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <span className="text-lg font-semibold tracking-tight">Clima Casa</span>
        </div>
        <h1 className="text-xl font-semibold">Entrar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acesso restrito ao administrador.</p>
        <form onSubmit={enviar} className="mt-6 space-y-4">
          <div>
            <label className="rotulo" htmlFor="email">E-mail</label>
            <input id="email" type="email" className="campo" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="rotulo" htmlFor="senha">Senha</label>
            <input id="senha" type="password" className="campo" autoComplete="current-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} required />
          </div>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" carregando={enviando} className="w-full">Entrar</Botao>
        </form>
        <div className="mt-8 border-t border-border pt-6">
          <p className="text-sm font-medium">Baixe o app</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DOWNLOADS.filter((d) => ['android', 'mac-arm', 'windows', 'linux'].includes(d.id)).map((d) => (
              <a key={d.id} href={d.url} className={`rounded-lg border px-3 py-2 text-center text-xs hover:bg-muted ${sistemaAtual() === d.id ? 'border-primary text-foreground' : 'border-border text-muted-foreground'}`}>{d.nome}</a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
