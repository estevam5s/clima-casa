import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Copy, Smartphone, Terminal } from 'lucide-react'
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
  const [codigoCli, setCodigoCli] = useState('')
  // cli=1: o pedido veio do clima-ia no terminal. Em vez de abrir climacasa://, mostra o código para colar lá
  // (de uso único, 2 min, e inútil sem o verificador que só o terminal tem).
  const cli = params.get('cli') === '1'
  const valido = /^[0-9a-f]{64}$/.test(desafio)
  const continuar = async () => {
    setErro(''); setEstado('enviando')
    try {
      const { codigo } = await api.post('/api/apps/login/codigo', { desafio })
      setEstado('pronto')
      if (cli) setCodigoCli(codigo)
      else window.location.href = `${VOLTA}?codigo=${encodeURIComponent(codigo)}`
    } catch (e) { setErro(e.message); setEstado('pergunta') }
  }
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="cartao w-full max-w-sm p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">{cli ? <Terminal className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}</span>
        <h1 className="mt-4 text-lg font-semibold">{cli ? 'Entrar no clima-ia (terminal)' : `Entrar no app ${marca?.nome || 'Clima Escritório'}`}</h1>
        {!valido ? (
          <p className="mt-2 text-sm text-muted-foreground">Este link não veio do app. Abra o app no celular e toque em “Entrar com e-mail e senha”.</p>
        ) : estado === 'pronto' && cli ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">Cole este código no terminal (vale 2 minutos, uma vez):</p>
            <button onClick={() => navigator.clipboard?.writeText(codigoCli)} className="mx-auto mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3 font-mono text-lg tracking-wider hover:bg-muted/70" aria-label="Copiar código">{codigoCli}<Copy className="h-4 w-4 text-muted-foreground" /></button>
          </>
        ) : estado === 'pronto' ? (
          <p className="mt-2 text-sm text-muted-foreground">Pronto. Se o app não abriu sozinho, volte para ele: a entrada é concluída lá.</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">{cli ? 'O clima-ia do seu terminal vai entrar com a sua conta e as suas permissões. Só continue se foi você que rodou "clima-ia login" agora.' : 'O app deste celular vai entrar com a sua conta. Só continue se foi você que tocou em Entrar no app agora.'}</p>
            {erro && <div className="mt-4 text-left"><Aviso>{erro}</Aviso></div>}
            <Botao className="mt-5 w-full" carregando={estado === 'enviando'} onClick={continuar}>{cli ? 'Gerar código para o terminal' : 'Continuar no app'}</Botao>
          </>
        )}
      </div>
    </div>
  )
}
