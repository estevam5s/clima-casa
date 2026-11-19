import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, MessageSquareQuote, Search } from 'lucide-react'
import { api } from '../api'
import { Aviso, Cabecalho, Carregando, Selo, useDados, useToast, confirmar } from '../components/ui'
import CatalogoVoz from '../components/CatalogoVoz'
import { modelosAr } from '../vozAlexa'
import { useProjeto } from '../contexto'

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
  const toast = useToast()
  const { sessao } = useProjeto()
  const podeControlar = !!sessao?.permissoes?.includes('aparelhos.controlar')
  const modelos = useMemo(() => modelosAr({ aparelhos: dados?.aparelhos || [] }), [dados])
  // "Testar": faz pelo painel o mesmo que a frase faria (mesmo caminho: agente → transmissor → ar)
  const testar = async (f) => {
    const nome = String(f.alvo || '').replace(/^o /, '')
    const ap = (dados?.aparelhos || []).find((a) => a.nome === nome) || (dados?.aparelhos || [])[0]
    if (!ap) return
    if (!await confirmar(`Mandar agora para “${ap.nome}”: ${f.faz.toLowerCase()} (${JSON.stringify(f.acao).replace(/[{}"]/g, '').replace(/,/g, ', ')})? O ar recebe o comando de verdade.`)) return
    try { await api.post(`/api/aparelhos/${ap.id}/estado`, f.acao); toast(`Enviado para ${ap.nome}.`) } catch (e) { toast(e.message, 'erro') }
  }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const filtra = (f) => f.toLowerCase().includes(q.toLowerCase())

  return (
    <div className="w-full">
      <Cabecalho titulo="Comandos de voz" descricao={`${dados.total} comandos prontos para os seus aparelhos, mais as Rotinas da Alexa, que aceitam qualquer frase que você inventar.`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Aparelhos na Alexa</p><p className="mt-1 text-lg font-semibold">{dados.aparelhos.filter((a) => a.no_sinric).length} de {dados.aparelhos.length}</p><p className="text-xs text-muted-foreground">pelo Sinric Pro (grátis: até 3)</p></div>
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Frases prontas</p><p className="mt-1 text-lg font-semibold tabular">{(modelos.reduce((s2, m) => s2 + Object.values(m.lacunas).reduce((p2, v) => p2 * v.length, 1), 0) + dados.total).toLocaleString('pt-BR')}</p><p className="text-xs text-muted-foreground">mais qualquer frase sua numa Rotina</p></div>
        <div className="cartao p-4"><p className="text-xs text-muted-foreground">Não funcionou?</p><p className="mt-1 text-sm">Veja o diagnóstico da Alexa e o que falta.</p><Link to="/integracoes" className="text-xs font-medium text-primary hover:underline">Abrir diagnóstico</Link></div>
      </div>
      <div className="mb-6"><CatalogoVoz titulo="Todas as frases do ar-condicionado" modelos={modelos} onTestar={podeControlar ? testar : undefined}
        rodape={<>As frases de “Rotinas suas” precisam ser criadas no app Alexa (Mais → Rotinas → + → Voz). “Testar” manda o mesmo comando pelo painel, para conferir se o ar obedece sem precisar falar.</>} /></div>
      <h2 className="mb-3 text-sm font-semibold">Por aparelho</h2>
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <input className="campo pl-9" placeholder="Filtrar comandos" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
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
