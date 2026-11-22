import { Component } from 'react'
import { api } from '../api'
import { podeRecarregar, recarregarUmaVez, versaoTrocada } from '../errosTela'

// Rede de proteção das telas: um erro de JavaScript numa tela não deixa mais a página preta. Mostra o que houve,
// oferece recarregar ou voltar ao painel e manda o erro para a área de Bugs (o servidor deduplica).
export default class ProtecaoErro extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro, atualizando: versaoTrocada(erro) && podeRecarregar() }
  }

  componentDidCatch(erro, info) {
    if (versaoTrocada(erro) && recarregarUmaVez()) return   // publicação nova no meio do uso: recarrega, não é bug
    try {
      api.post('/api/bugs/erro-cliente', {
        mensagem: String(erro?.message || erro).slice(0, 500),
        pilha: `${erro?.stack || ''}\n${info?.componentStack || ''}`.slice(0, 3000),
        pagina: (location.pathname + location.search).slice(0, 200),
        navegador: navigator.userAgent.slice(0, 300),
      }).catch(() => {})
    } catch { /* sem rede: a tela de erro aparece mesmo assim */ }
  }

  componentDidUpdate(anterior) {
    if (this.state.erro && anterior.chave !== this.props.chave) this.setState({ erro: null })   // trocou de tela: tenta de novo
  }

  render() {
    if (!this.state.erro) return this.props.children
    if (this.state.atualizando) return <div className="flex min-h-[60dvh] items-center justify-center p-4 text-sm text-muted-foreground" role="status">Chegou uma versão nova do sistema. Atualizando…</div>
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4 text-foreground">
        <div className="cartao w-full max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">Esta tela encontrou um erro</h1>
          <p className="mt-2 text-sm text-muted-foreground">O erro já foi enviado para a área de Bugs. Recarregue a página; se continuar, volte ao painel.</p>
          <pre className="mt-4 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-left font-mono text-xs text-muted-foreground">{String(this.state.erro?.message || this.state.erro).slice(0, 300)}</pre>
          <div className="mt-5 flex justify-center gap-2">
            <button onClick={() => location.reload()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Recarregar</button>
            <button onClick={() => { location.href = '/' }} className="rounded-lg border border-border px-4 py-2 text-sm">Ir para o painel</button>
          </div>
        </div>
      </div>
    )
  }
}
