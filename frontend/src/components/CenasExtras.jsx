import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { DIAS, MODOS, api } from '../api'
import { Botao, Modal, useToast } from './ui'

// O que a cena vai fazer agora, comparado com o estado que o sistema conhece de cada ar
export function previa(cena, aparelhos) {
  const porId = new Map(aparelhos.map((a) => [a.id, a]))
  return cena.acoes.map((ac) => {
    const ar = porId.get(ac.aparelho_id)
    if (!ar) return { ...ac, situacao: 'sumiu', texto: 'ar não existe mais' }
    if (!ar.hub_id) return { ...ac, situacao: 'sem_tx', texto: 'sem transmissor: não vai obedecer' }
    const igual = ac.ligado ? (ar.ligado && (!ac.modo || ac.modo === ar.modo) && (!ac.temperatura || ac.temperatura === ar.temperatura)) : !ar.ligado
    if (igual) return { ...ac, situacao: 'igual', texto: 'já está assim' }
    const agora = ar.ligado ? `${MODOS[ar.modo] || 'ligado'}${ar.temperatura ? ` ${ar.temperatura}°` : ''}` : 'desligado'
    return { ...ac, situacao: 'muda', texto: `agora: ${agora}` }
  })
}

// Estado de cada ar antes da cena, para "Desfazer" mandar de volta
export function fotografia(cena, aparelhos) {
  const porId = new Map(aparelhos.map((a) => [a.id, a]))
  return cena.acoes.map((ac) => porId.get(ac.aparelho_id)).filter(Boolean)
    .map((a) => ({ id: a.id, nome: a.nome, ligado: !!a.ligado, modo: a.modo, temperatura: a.temperatura, ventilador: a.ventilador }))
}

export async function desfazer(foto) {
  let ok = 0
  for (const a of foto) {
    try { await api.post(`/api/aparelhos/${a.id}/estado`, a.ligado ? { ligado: true, modo: a.modo, temperatura: a.temperatura, ventilador: a.ventilador } : { ligado: false }); ok++ } catch { /* segue para os outros */ }
  }
  return ok
}

// Agendar a cena = automação "no horário" que executa a cena (aparece em Automações, dá para pausar lá)
export function AgendarCena({ cena, aoFechar }) {
  const toast = useToast()
  const [hora, setHora] = useState('07:30'), [dias, setDias] = useState([1, 2, 3, 4, 5]), [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    try {
      await api.post('/api/automacoes', { nome: `${cena.nome} às ${hora}`.slice(0, 80), ativo: true, gatilho: { tipo: 'horario', hora }, condicoes: { dias }, acoes: [{ tipo: 'cena', cena_id: cena.id }] })
      toast(`Agendada: ${cena.nome} às ${hora}. Fica em Automações.`); aoFechar()
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <Modal aberto titulo={`Agendar a cena ${cena.nome}`} onFechar={aoFechar}>
      <div className="space-y-4 text-sm">
        <label className="block"><span className="rotulo">Horário</span><input type="time" className="campo w-40" value={hora} onChange={(e) => setHora(e.target.value)} /></label>
        <div><span className="rotulo">Dias</span>
          <div className="flex flex-wrap gap-1.5">{DIAS.map((d, i) => { const on = dias.includes(i); return (
            <button key={d} type="button" aria-pressed={on} onClick={() => setDias(on ? dias.filter((x) => x !== i) : [...dias, i].sort())}
              className={`h-8 w-11 rounded-md border text-xs ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{d}</button>) })}</div>
        </div>
        <p className="text-xs text-muted-foreground">Vira uma automação “no horário” que executa esta cena. Precisa do agente do escritório ligado.</p>
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao icone={CalendarClock} carregando={salvando} disabled={!dias.length} onClick={salvar}>Agendar</Botao></div>
      </div>
    </Modal>
  )
}
