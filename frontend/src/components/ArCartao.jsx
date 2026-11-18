import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Minus, Plus, Power } from 'lucide-react'
import { MODOS, VENTILACAO, api } from '../api'
import { Dial, Ponto, useToast } from './ui'

// Cartão de um ar-condicionado com mostrador e controle rápido.
export default function ArCartao({ ar, aoMudar, indice = 0 }) {
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const ligado = !!ar.ligado
  const semIR = !ar.hub_id

  const mudar = async (estado) => {
    setOcupado(true)
    try { aoMudar?.({ ...ar, ...(await api.post(`/api/aparelhos/${ar.id}/estado`, estado)) }) }
    catch (e) { toast(e.message, 'erro') }
    finally { setOcupado(false) }
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: ocupado ? 0.6 : 1, y: 0 }} transition={{ delay: indice * 0.03, duration: 0.25 }}
      className={`cartao flex flex-col overflow-hidden ${ligado ? 'border-primary/40' : ''}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <Link to={`/aparelhos/${ar.id}`} className="group min-w-0">
          <p className="truncate font-medium group-hover:underline">{ar.nome}</p>
          <p className="truncate text-xs text-muted-foreground">{[ar.projeto_nome, ar.comodo].filter(Boolean).join(' · ') || 'Sem cômodo'}</p>
        </Link>
        <button onClick={() => mudar({ ligado: !ligado })} disabled={ocupado || semIR} aria-label={ligado ? 'Desligar' : 'Ligar'}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90 disabled:opacity-40 ${
            ligado ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground'}`}>
          <Power className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 py-1">
        <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })} disabled={ocupado || semIR || ar.temperatura <= ar.temp_min}
          className="rounded-full border border-border p-2 transition-colors hover:bg-muted disabled:opacity-30" aria-label="Diminuir temperatura"><Minus className="h-4 w-4" /></button>
        <Dial valor={ar.temperatura} min={ar.temp_min} max={ar.temp_max} ligado={ligado} modo={ar.modo} tamanho={136} />
        <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })} disabled={ocupado || semIR || ar.temperatura >= ar.temp_max}
          className="rounded-full border border-border p-2 transition-colors hover:bg-muted disabled:opacity-30" aria-label="Aumentar temperatura"><Plus className="h-4 w-4" /></button>
      </div>

      <p className="-mt-2 text-center text-xs text-muted-foreground">
        {semIR ? <Link to={`/aparelhos/${ar.id}`} className="text-amber-700 underline dark:text-amber-400">Sem transmissor: vincule um para comandar</Link>
          : ligado ? `${MODOS[ar.modo]} · ventilação ${VENTILACAO[ar.ventilador]?.toLowerCase()}` : 'Desligado'}
      </p>
      {ar.zona && <p className="mt-1 px-4 text-center text-[11px] text-amber-700 dark:text-amber-400" title={`Obedece junto com: ${ar.zona.outros.join(', ')}`}>{ar.zona.nome}: o comando muda os {ar.zona.total} ares</p>}

      <div className="mt-3 flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Ponto ativo={ar.hub_online} />{semIR ? 'Sem transmissor' : ar.hub_nome || 'Transmissor'}</span>
        <span className="flex items-center gap-2">
          {ar.sinric_device_id && <span title="Disponível na Alexa e no Google Home">Alexa</span>}
          {ar.total_codigos ? <span className="tabular">{ar.total_codigos} botões</span> : <Link to={`/aparelhos/${ar.id}?aba=botoes`} className="font-medium text-red-600 underline dark:text-red-400">sem botões: gravar</Link>}
        </span>
      </div>
    </motion.div>
  )
}
