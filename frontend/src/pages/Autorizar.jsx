import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Aviso, Botao, Carregando } from '../components/ui'

// Tela que a Alexa abre durante a vinculação de conta (OAuth authorization code).
export default function Autorizar() {
  const [p] = useSearchParams()
  const pedido = { client_id: p.get('client_id') || '', redirect_uri: p.get('redirect_uri') || '', state: p.get('state') || '' }
  const [valido, setValido] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const q = new URLSearchParams({ client_id: pedido.client_id, redirect_uri: pedido.redirect_uri, response_type: p.get('response_type') || '' })
    api.get(`/api/oauth/validar?${q}`).then(() => setValido(true)).catch((e) => { setValido(false); setErro(e.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const aprovar = async () => {
    setEnviando(true)
    try {
      const { redirect } = await api.post('/api/oauth/aprovar', pedido)
      window.location.href = redirect
    } catch (e) { setErro(e.message); setEnviando(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="cartao w-full max-w-sm p-6">
        {valido === null ? <Carregando /> : !valido ? <Aviso>{erro}</Aviso> : (
          <>
            <h1 className="text-lg font-semibold">Vincular à Alexa</h1>
            <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground/70">
              A Alexa poderá ver os aparelhos marcados como "Disponível na Alexa", ligar, desligar e mudar temperatura e modo.
              Você pode revogar a qualquer momento na tela Alexa do Clima Casa.
            </p>
            {erro && <div className="mt-4"><Aviso>{erro}</Aviso></div>}
            <div className="mt-6 flex gap-2">
              <Botao variante="secundario" className="flex-1" onClick={() => window.location.href = `${pedido.redirect_uri}?error=access_denied&state=${encodeURIComponent(pedido.state)}`}>Recusar</Botao>
              <Botao className="flex-1" carregando={enviando} onClick={aprovar}>Autorizar</Botao>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
