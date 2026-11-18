import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { api } from '../api'
import { useMarca } from '../marca'
import { Aviso, Botao } from '../components/ui'

// Login do app Android pelo navegador: o app abre esta página numa aba segura com um desafio PKCE. A pessoa já passou
// pelo login normal do site (Turnstile, duas etapas); aqui ela confirma e a página devolve um código de uso único ao app.
// O endereço de volta é fixo (climacasa://auth): nenhum link de fora escolhe para onde o código vai.
const VOLTA = 'climacasa://auth'

export default function EntrarApp() {
  const [params] = useSearchParams()
  const { marca } = useMarca()
  const [estado, setEstado] = useState('pergunta')
  const [erro, setErro] = useState('')
  const desafio = params.get('desafio') || ''
  const valido = /^[0-9a-f]{64}$/.test(desafio)
  const continuar = async () => {
    setErro(''); setEstado('enviando')
    try {
      const { codigo } = await api.post('/api/apps/login/codigo', { desafio })
      setEstado('pronto')
      window.location.href = `${VOLTA}?codigo=${encodeURIComponent(codigo)}`
    } catch (e) { setErro(e.message); setEstado('pergunta') }
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="cartao w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Smartphone className="h-6 w-6" /></span>
        <h1 className="mt-4 text-lg font-semibold">Entrar no app {marca?.nome || 'Clima Escritório'}</h1>
        {!valido ? (
          <p className="mt-2 text-sm text-muted-foreground">Este link não veio do app. Abra o app no celular e toque em “Entrar com e-mail e senha”.</p>
        ) : estado === 'pronto' ? (
          <p className="mt-2 text-sm text-muted-foreground">Pronto. Se o app não abriu sozinho, volte para ele: a entrada é concluída lá.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">O app deste celular vai entrar com a sua conta. Só continue se foi você que tocou em Entrar no app agora.</p>
            {erro && <div className="mt-4 text-left"><Aviso>{erro}</Aviso></div>}
            <Botao className="mt-5 w-full" carregando={estado === 'enviando'} onClick={continuar}>Continuar no app</Botao>
          </>
        )}
      </div>
    </div>
  )
}
