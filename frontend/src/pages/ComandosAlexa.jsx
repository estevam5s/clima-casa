import { useState } from 'react'
import { Check, Copy, MessageSquareQuote, Search } from 'lucide-react'
import { api } from '../api'
import { Aviso, Cabecalho, Carregando, Selo, useDados } from '../components/ui'

function Frase({ texto }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1200) }}
      className="group flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted">
      <span>“{texto}”</span>
      {ok ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60" />}
    </button>
  )
}

export default function ComandosAlexa() {
  const { dados, erro } = useDados(() => api.get('/api/alexa/comandos'))
  const [q, setQ] = useState('')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const filtra = (f) => f.toLowerCase().includes(q.toLowerCase())

  return (
    <div className="w-full">
      <Cabecalho titulo="Comandos de voz" descricao={`${dados.total} comandos prontos para os seus aparelhos, mais as Rotinas da Alexa, que aceitam qualquer frase que você inventar.`} />
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input className="campo pl-9" placeholder="Filtrar comandos" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {dados.aparelhos.length === 0 && <Aviso tipo="alerta">Nenhum aparelho disponível na Alexa. Marque "Disponível na Alexa" nos ajustes do aparelho.</Aviso>}
          {dados.aparelhos.map((a) => (
            <section key={a.id} className="cartao p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{a.nome}</h2>
                {a.projeto && <Selo>{a.projeto}</Selo>}
                {a.no_sinric ? <Selo cor="verde">Na Alexa e Google</Selo> : <Selo cor="ambar">Ainda fora do Sinric</Selo>}
                <span className="ml-auto text-xs text-muted-foreground">{a.total} comandos</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {a.grupos.map((g) => {
                  const frases = g.frases.filter(filtra)
                  if (!frases.length) return null
                  return (
                    <div key={g.titulo}>
                      <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{g.titulo}</p>
                      {frases.map((f) => <Frase key={f} texto={f} />)}
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          {dados.cenas.length > 0 && (
            <section className="cartao p-5">
              <h2 className="mb-1 text-base font-semibold">Cenas</h2>
              <p className="mb-3 text-xs text-muted-foreground">Pela skill própria cada cena vira um comando. Pelo Sinric, use uma Rotina da Alexa (ao lado).</p>
              {dados.cenas.filter((c) => filtra(c.nome)).map((c) => <Frase key={c.id} texto={`Alexa, ativar ${c.nome}`} />)}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <div className="cartao p-5">
            <h2 className="flex items-center gap-2 titulo-secao"><MessageSquareQuote className="h-4 w-4" /> Rotinas: frases suas</h2>
            <p className="mt-2 text-sm text-muted-foreground">No app Alexa: <b>Mais → Rotinas → +</b>. Em "Quando isto acontecer" escolha <b>Voz</b> e digite a frase. Em "Adicionar ação" escolha <b>Casa inteligente</b> → o ar → ligar, temperatura ou modo. Dá para colocar vários aparelhos e uma espera entre eles.</p>
            <div className="mt-4 space-y-3">
              {dados.rotinas.map((r) => (
                <div key={r.frase} className="rounded-lg bg-muted/60 p-3">
                  <p className="text-sm font-medium">“{r.frase}”</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.faz}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="cartao p-5 text-sm text-muted-foreground">
            <p className="titulo-secao mb-2 text-foreground">Rotinas com gatilho</p>
            Além da voz, a Rotina pode começar por horário, nascer/pôr do sol, chegar ou sair de casa (localização do celular) ou um alarme. Combine com as <a href="/automacoes" className="text-primary underline">automações</a> do Clima Escritório, como "desligar 3 h depois".
          </div>
        </aside>
      </div>
    </div>
  )
}
