import GuiaBotoes from './GuiaBotoes'
import { useState } from 'react'
import { MODOS } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Interruptor } from './ui'

// padrao: valores iniciais de um ar novo (ex.: vindo de Transmissores → "Adicionar ar a este transmissor")
export default function FormAparelho({ inicial, padrao = {}, hubs, aoSalvar, rotuloBotao = 'Salvar' }) {
  const { projetos, projeto } = useProjeto()
  // ar novo: sugere o transmissor da sala escolhida (antes caía sempre no primeiro da lista, até de outra sala)
  const hubDaSala = (pid) => {
    const da = hubs.filter((h) => pid && String(h.projeto_id) === String(pid))
    return da.length === 1 ? da[0].id : ''
  }
  const [hubManual, setHubManual] = useState(!!(inicial || padrao.hub_id))
  const [f, setF] = useState(() => ({
    nome: inicial?.nome || '',
    comodo: inicial?.comodo || '',
    marca: inicial?.marca || '',
    hub_id: inicial ? (inicial.hub_id || '') : (padrao.hub_id || hubDaSala(padrao.projeto_id ?? projeto?.id ?? projetos[0]?.id)),
    temp_min: inicial?.temp_min ?? 16,
    temp_max: inicial?.temp_max ?? 30,
    modos: inicial?.modos ? inicial.modos.split(',') : Object.keys(MODOS),
    alexa: inicial ? !!inicial.alexa : true,
    potencia_w: inicial?.potencia_w ?? 1000,
    projeto_id: inicial ? inicial.projeto_id : (padrao.projeto_id ?? projeto?.id ?? projetos[0]?.id ?? null),
  }))
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const mudar = (k) => (e) => {
    const v = e.target.value
    if (k === 'hub_id') setHubManual(true)
    if (k === 'projeto_id' && !hubManual && !inicial) return setF({ ...f, projeto_id: v, hub_id: hubDaSala(v) })
    setF({ ...f, [k]: v })
  }
  const hubEscolhido = hubs.find((h) => h.id === f.hub_id)
  const salaEscolhida = projetos.find((p) => String(p.id) === String(f.projeto_id))?.nome
  const outrasSalas = (hubEscolhido?.salas || []).filter((s) => s !== salaEscolhida)
  const alternarModo = (m) => setF({ ...f, modos: f.modos.includes(m) ? f.modos.filter((x) => x !== m) : [...f.modos, m] })

  const enviar = async (e) => {
    e.preventDefault()
    setErro('')
    setSalvando(true)
    try {
      await aoSalvar({ ...f, projeto_id: f.projeto_id ? +f.projeto_id : null, hub_id: f.hub_id || null, temp_min: +f.temp_min, temp_max: +f.temp_max, potencia_w: +f.potencia_w || 1000 })
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {!inicial && (
        <details className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Depois de adicionar: como gravar os botões do controle</summary>
          <div className="mt-3"><GuiaBotoes compacto /></div>
        </details>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="nome">Nome</label>
          <input id="nome" className="campo" value={f.nome} onChange={mudar('nome')} placeholder="Ar da recepção" required maxLength={60} />
          <p className="ajuda">É o nome que você vai falar para a Alexa.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="projeto">Projeto</label>
          <select id="projeto" className="campo" value={f.projeto_id ?? ''} onChange={mudar('projeto_id')}>
            <option value="">Sem projeto</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="rotulo" htmlFor="comodo">Cômodo</label>
          <input id="comodo" className="campo" value={f.comodo} onChange={mudar('comodo')} placeholder="Recepção" maxLength={40} />
        </div>
        <div>
          <label className="rotulo" htmlFor="marca">Marca do ar</label>
          <input id="marca" className="campo" value={f.marca} onChange={mudar('marca')} placeholder="LG, Samsung, Midea…" maxLength={40} />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="hub">Transmissor infravermelho</label>
          <select id="hub" className="campo" value={f.hub_id} onChange={mudar('hub_id')}>
            <option value="">Nenhum</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{h.nome}{h.projeto_nome ? ` · ${h.projeto_nome}` : ''}{h.online === 0 || h.online === false ? ' (sem resposta)' : ''}</option>)}
          </select>
          <p className="ajuda">O transmissor precisa estar na mesma sala e com visão do aparelho.</p>
          {hubEscolhido && outrasSalas.length > 0 && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Este transmissor já atende {outrasSalas.join(', ')}. Se {salaEscolhida || 'esta sala'} for fechada, use um transmissor só dela: ares iguais que o sinal alcança mudam juntos.
            </p>
          )}
          {hubEscolhido && !hubEscolhido.online && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Este transmissor não está respondendo agora: dá para salvar, mas os comandos só chegam quando ele voltar.</p>}
        </div>
        <div>
          <label className="rotulo" htmlFor="tmin">Temperatura mínima</label>
          <input id="tmin" type="number" min={10} max={35} className="campo" value={f.temp_min} onChange={mudar('temp_min')} />
        </div>
        <div>
          <label className="rotulo" htmlFor="tmax">Temperatura máxima</label>
          <input id="tmax" type="number" min={10} max={35} className="campo" value={f.temp_max} onChange={mudar('temp_max')} />
        </div>
        <div className="sm:col-span-2">
          <label className="rotulo" htmlFor="pot">Potência (W)</label>
          <input id="pot" type="number" min={100} max={10000} step={50} className="campo" value={f.potencia_w} onChange={mudar('potencia_w')} />
          <p className="ajuda">Usada para estimar consumo e custo nos relatórios. 9.000 BTU ≈ 800 W, 12.000 BTU ≈ 1.100 W, 18.000 BTU ≈ 1.650 W.</p>
        </div>
      </div>
      <div>
        <span className="rotulo">Modos que o aparelho tem</span>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MODOS).map(([m, r]) => (
            <button type="button" key={m} onClick={() => alternarModo(m)}
              className={`rounded-md border px-3 py-1.5 text-sm ${f.modos.includes(m) ? 'border-marca-600 bg-marca-50 text-marca-700 dark:bg-marca-700/20 dark:text-marca-100' : 'border-border text-muted-foreground dark:text-muted-foreground/70'}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5 ">
        <div>
          <p className="text-sm font-medium">Disponível na Alexa</p>
          <p className="text-xs text-muted-foreground">Aparece no app Alexa depois de "descobrir dispositivos".</p>
        </div>
        <Interruptor ligado={f.alexa} onChange={(v) => setF({ ...f, alexa: v })} rotulo="Disponível na Alexa" />
      </div>
      {!inicial && (
        <div className="rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Depois de adicionar: gravar os botões</p>
          <p className="mt-1">Abra o ar → aba Botões → Gravar. Comece pelo <b>Desligar</b>: visor do controle aceso, aperte o liga/desliga apontando para o transmissor. Ar Gree: só o Desligar e depois "Controle Gree → Gerar". Mesmo modelo de outro ar já gravado: "Copiar de outro ar".</p>
        </div>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end">
        <Botao type="submit" carregando={salvando}>{rotuloBotao}</Botao>
      </div>
    </form>
  )
}
