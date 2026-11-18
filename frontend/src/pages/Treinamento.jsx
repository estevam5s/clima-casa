import { useState } from 'react'
import { CheckCircle2, GraduationCap, XCircle } from 'lucide-react'
import { api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Selo, useDados } from '../components/ui'

// Treinamento de segurança com prova (ISO 27001 6.3): 10 situações do dia a dia; aprovado com 70%. Vale por 12 meses.
export default function Treinamento() {
  const { dados, erro, recarregar } = useDados(() => api.get('/api/treinamento'))
  const [resp, setResp] = useState({})
  const [res, setRes] = useState(null)
  const [enviando, setEnviando] = useState(false)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const ultimo = dados.historico[0]
  const enviar = async () => {
    setEnviando(true)
    try { setRes(await api.post('/api/treinamento/responder', { respostas: dados.perguntas.map((p) => resp[p.n] ?? -1) })); recarregar(); window.scrollTo({ top: 0, behavior: 'smooth' }) } finally { setEnviando(false) }
  }
  return (
    <>
      <Cabecalho titulo="Treinamento de segurança" descricao="Dez situações do dia a dia do escritório. Aprovado com 70%; vale por 12 meses e conta na conformidade (ISO 27001)." />
      {ultimo && !res && <div className="mb-4"><Aviso tipo={ultimo.aprovado ? 'ok' : 'alerta'}>Última vez {haQuanto(ultimo.concluido_em)}: {ultimo.nota}% {ultimo.aprovado ? '(aprovado)' : '(refaça)'}.</Aviso></div>}
      {res && <div className="mb-4"><Aviso tipo={res.aprovado ? 'ok' : 'alerta'}>{res.aprovado ? `Aprovado com ${res.nota}%. Obrigado!` : `${res.nota}%: faltou pouco. Veja as respostas certas abaixo e refaça.`}</Aviso></div>}
      <ol className="space-y-4">{dados.perguntas.map((p) => {
        const certo = res && res.gabarito[p.n]
        return (
          <li key={p.n} className="cartao p-4">
            <p className="flex gap-2 text-sm font-medium"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{p.n + 1}. {p.texto}</p>
            <div className="mt-3 space-y-1.5">{p.opcoes.map((o, i) => (
              <label key={o} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${res ? (i === certo ? 'border-emerald-500/60 bg-emerald-500/5' : resp[p.n] === i ? 'border-red-500/50 bg-red-500/5' : 'border-border') : resp[p.n] === i ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
                <input type="radio" name={`p${p.n}`} className="mt-1" disabled={!!res} checked={resp[p.n] === i} onChange={() => setResp({ ...resp, [p.n]: i })} />
                <span className="flex-1">{o}</span>{res && i === certo && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}{res && resp[p.n] === i && i !== certo && <XCircle className="h-4 w-4 text-red-600" />}
              </label>))}
            </div>
          </li>)
      })}</ol>
      <div className="mt-6 flex gap-2">
        {!res ? <Botao carregando={enviando} disabled={Object.keys(resp).length < dados.perguntas.length} onClick={enviar}>Enviar respostas</Botao>
          : <Botao variante="secundario" onClick={() => { setRes(null); setResp({}) }}>Fazer de novo</Botao>}
        {Object.keys(resp).length < dados.perguntas.length && !res && <Selo>{Object.keys(resp).length} de {dados.perguntas.length} respondidas</Selo>}
      </div>
    </>
  )
}
