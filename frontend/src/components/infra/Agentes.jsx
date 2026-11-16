import { useCallback, useEffect, useState } from 'react'
import { Cpu, Laptop, Monitor, Star, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Selo, useToast } from '../ui'

export default function Agentes({ dono }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const carregar = useCallback(() => api.get('/api/agentes').then(setD).catch((e) => toast(e.message, 'erro')), [toast])
  useEffect(() => { carregar(); const t = setInterval(carregar, 10000); return () => clearInterval(t) }, [carregar])
  const preferir = async (id) => { try { setD(await api.post('/api/agentes/preferido', { id })); toast(id ? 'Computador preferido salvo. Ele assume em até 20 s se estiver ligado.' : 'Sem preferência: fica principal quem estiver ligado.') } catch (e) { toast(e.message, 'erro') } }
  const esquecer = async (id) => { if (!window.confirm('Tirar este computador da lista?')) return; try { setD(await api.post('/api/agentes/esquecer', { id })) } catch (e) { toast(e.message, 'erro') } }
  if (!d) return <Esqueleto className="h-64" />
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Pode ter o agente em mais de um computador (o Mac e um PC Windows no escritório, por exemplo). Só um é o <b className="text-foreground">principal</b> e manda os comandos; os outros ficam de <b className="text-foreground">reserva</b> e assumem sozinhos em até {d.aluguel_s} s se o principal sumir. Tudo fica no banco: trocar de computador não perde nada.</p>
      {!d.maquinas.length && <Aviso tipo="alerta">Nenhum computador com o agente novo ainda. Atualize o agente (Mac: ./instalar-servico.sh · Windows: instalar-windows.ps1).</Aviso>}
      <div className="grid gap-3 md:grid-cols-2">
        {d.maquinas.map((m) => { const I = /Windows/.test(m.sistema) ? Monitor : /Linux/.test(m.sistema) ? Cpu : Laptop; return (
          <div key={m.id} className={`cartao p-4 ${m.principal ? 'border-primary/50' : ''}`}>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border"><I className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-medium">{m.nome}{m.principal ? <Selo cor="verde">Principal</Selo> : m.online ? <Selo>Reserva</Selo> : <Selo cor="cinza">Desligado</Selo>}{d.preferido === m.id && <Selo cor="ambar">Preferido</Selo>}</p>
                <p className="text-xs text-muted-foreground">{m.sistema} · Python {m.python}</p>
                <p className="text-xs text-muted-foreground">{m.online ? 'visto agora' : `visto ${haQuanto(m.visto)}`} · id {m.id}</p>
              </div>
            </div>
            {dono && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                {d.preferido === m.id ? <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(null)}>Tirar preferência</Botao> : <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(m.id)}>Preferir este</Botao>}
                {!m.online && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={() => esquecer(m.id)}>Tirar da lista</Botao>}
              </div>
            )}
          </div>
        ) })}
      </div>
      <p className="text-xs text-muted-foreground">Preferido: quando ele está ligado, o principal passa o posto para ele. Útil para deixar o PC do escritório sempre no comando e o Mac só de reserva.</p>
    </div>
  )
}
