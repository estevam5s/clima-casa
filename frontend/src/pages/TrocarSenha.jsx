import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { api } from '../api'
import { supabase } from '../supabase'
import { Aviso, Botao } from '../components/ui'

// Primeiro acesso de um usuário criado pelo administrador: troca a senha provisória antes de entrar.
export default function TrocarSenha({ aoTrocar }) {
  const [f, setF] = useState({ nova: '', confirma: '' })
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const forca = f.nova.length >= 14 ? 3 : f.nova.length >= 10 ? 2 : f.nova.length ? 1 : 0
  const enviar = async (e) => {
    e.preventDefault(); setErro('')
    if (f.nova.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (f.nova !== f.confirma) return setErro('As senhas não conferem.')
    setOcupado(true)
    try {
      const sb = await supabase()
      const { error } = await sb.auth.updateUser({ password: f.nova })
      if (error) throw new Error(error.message.includes('different from the old') ? 'Use uma senha diferente da provisória.' : error.message)
      await api.post('/api/conta/senha-trocada')
      aoTrocar()
    } catch (err) { setErro(err.message) } finally { setOcupado(false) }
  }
  const sair = async () => { await (await supabase()).auth.signOut().catch(() => {}); window.location.href = '/login' }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <form onSubmit={enviar} className="cartao w-full max-w-md space-y-4 p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary"><KeyRound className="h-5 w-5" /></span>
        <div>
          <h1 className="text-xl font-semibold">Crie a sua senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">Você entrou com uma senha provisória. Escolha uma senha só sua para continuar.</p>
        </div>
        <div><label className="rotulo" htmlFor="tn">Nova senha</label><input id="tn" type="password" autoComplete="new-password" className="campo" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} required minLength={8} autoFocus /></div>
        {forca > 0 && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full transition-all ${['', 'w-1/3 bg-red-500', 'w-2/3 bg-amber-500', 'w-full bg-emerald-500'][forca]}`} /></div>}
        <div><label className="rotulo" htmlFor="tc">Confirmar</label><input id="tc" type="password" autoComplete="new-password" className="campo" value={f.confirma} onChange={(e) => setF({ ...f, confirma: e.target.value })} required /></div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={sair} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><LogOut className="h-4 w-4" />Sair</button>
          <Botao type="submit" carregando={ocupado}>Salvar e entrar</Botao>
        </div>
      </form>
    </div>
  )
}
