import { validarSenhaNova } from '../api'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { supabase } from '../supabase'
import { Aviso, Botao } from '../components/ui'

// Aberta pelo link do e-mail "Esqueci a senha" (sessão de recuperação do Supabase).
export default function RedefinirSenha() {
  const [pronto, setPronto] = useState(false)
  const [valido, setValido] = useState(false)
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()

  useEffect(() => {
    let cancelar = () => {}
    supabase().then(async (sb) => {
      const { data } = sb.auth.onAuthStateChange((evento, sessao) => { if (evento === 'PASSWORD_RECOVERY' || sessao) { setValido(true); setPronto(true) } })
      cancelar = () => data.subscription.unsubscribe()
      const { data: s } = await sb.auth.getSession()
      if (s.session) setValido(true)
      setTimeout(() => setPronto(true), 1200)
    })
    return () => cancelar()
  }, [])

  const salvar = async (e) => {
    e.preventDefault()
    setErro('')
    if (senha.length < 10) return setErro('Use pelo menos 10 caracteres.')
    if (senha !== confirma) return setErro('As senhas não conferem.')
    setOcupado(true)
    const sb = await supabase()
    try { await validarSenhaNova(senha) } catch (err) { setOcupado(false); return setErro(err.message) }
    const { error } = await sb.auth.updateUser({ password: senha })
    setOcupado(false)
    if (error) return setErro(error.message)
    setOk(true)
    await sb.auth.signOut()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="cartao w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">Criar senha nova</h1>
        {!pronto ? <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          : ok ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">Senha alterada. Entre com a senha nova.</p>
              <Botao className="mt-5 w-full" onClick={() => navegar('/login')}>Ir para o login</Botao>
            </>
          ) : !valido ? (
            <div className="mt-4"><Aviso>Link inválido ou vencido. Peça outro em “Esqueci a senha” no login.</Aviso>
              <Botao variante="secundario" className="mt-4 w-full" onClick={() => navegar('/login')}>Voltar ao login</Botao></div>
          ) : (
            <form onSubmit={salvar} className="mt-5 space-y-4">
              <div><label className="rotulo" htmlFor="ns">Senha nova</label><input id="ns" type="password" autoComplete="new-password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={10} autoFocus /></div>
              <div><label className="rotulo" htmlFor="nc">Confirmar</label><input id="nc" type="password" autoComplete="new-password" className="campo" value={confirma} onChange={(e) => setConfirma(e.target.value)} required /></div>
              {erro && <Aviso>{erro}</Aviso>}
              <Botao type="submit" className="w-full" carregando={ocupado}>Salvar senha</Botao>
            </form>
          )}
      </div>
    </div>
  )
}
