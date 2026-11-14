import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, Power } from 'lucide-react'
import { MODOS, api } from '../api'
import { Ponto, useToast } from './ui'

export default function ArCartao({ ar, aoMudar }) {
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const ligado = !!ar.ligado

  const mudar = async (estado) => {
    setOcupado(true)
    try {
      const novo = await api.post(`/api/aparelhos/${ar.id}/estado`, estado)
      aoMudar?.({ ...ar, ...novo })
    } catch (e) {
      toast(e.message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const corModo = ar.modo === 'quente' ? 'text-quente' : 'text-frio dark:text-sky-400'

  return (
    <div className={`cartao flex flex-col p-4 transition-opacity ${ocupado ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <Link to={`/aparelhos/${ar.id}`} className="min-w-0 hover:underline">
          <p className="truncate font-medium">{ar.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ar.comodo || 'Sem cômodo'}{ar.hub_nome ? ` · ${ar.hub_nome}` : ''}
          </p>
        </Link>
        <button
          onClick={() => mudar({ ligado: !ligado })}
          disabled={ocupado || !ar.hub_id}
          aria-label={ligado ? 'Desligar' : 'Ligar'}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${
            ligado ? 'border-marca-600 bg-marca-600 text-white' : 'border-border text-muted-foreground hover:border-muted-foreground/40 '
          }`}
        >
          <Power className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          onClick={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })}
          disabled={ocupado || !ar.hub_id || ar.temperatura <= ar.temp_min}
          className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-30"
          aria-label="Diminuir temperatura"
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className={`text-3xl font-semibold tabular-nums ${ligado ? corModo : 'text-muted-foreground/70'}`}>
            {ar.temperatura}<span className="text-lg align-top">°C</span>
          </p>
          <p className="text-xs text-muted-foreground">{ligado ? MODOS[ar.modo] : 'Desligado'}</p>
        </div>
        <button
          onClick={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })}
          disabled={ocupado || !ar.hub_id || ar.temperatura >= ar.temp_max}
          className="rounded-md border border-border p-2 hover:bg-muted disabled:opacity-30"
          aria-label="Aumentar temperatura"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground ">
        <span className="flex items-center gap-1.5">
          <Ponto ativo={ar.hub_online} /> {ar.hub_id ? (ar.hub_online ? 'Transmissor online' : 'Transmissor offline') : 'Sem transmissor'}
        </span>
        <span>{ar.total_codigos} botões</span>
      </div>
    </div>
  )
}
