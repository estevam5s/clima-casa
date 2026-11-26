import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LogIn, Volume2, VolumeX, X } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { devePuxar } from '../ocioso'
import { tocar } from '../som'

// Aviso "Fulano entrou" no canto superior direito, com som, para dono e admins (GET /api/presenca/entradas).
// Consulta a cada 30 s com a aba visível (devePuxar: parado há 10 min, no máximo a cada 5 min). Some sozinho em 8 s.
const METODO = { senha: 'com e-mail e senha', google: 'com o Google', github: 'com o GitHub', biometria: 'com biometria' }
const CHAVE_SOM = 'clima-aviso-entrada-som'
const somLigado = () => { try { return localStorage.getItem(CHAVE_SOM) !== '0' } catch { return true } }
const iniciais = (n) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()

export default function AvisoEntradas() {
  const { sessao } = useProjeto()
  const gestor = sessao && ['dono', 'admin'].includes(sessao.papel)
  const [avisos, setAvisos] = useState([])
  const [som, setSom] = useState(somLigado)
  const desde = useRef(0)
  const calmo = useReducedMotion()

  useEffect(() => {
    if (!gestor) return undefined
    let vivo = true
    const buscar = async (primeira) => {
      try {
        const r = await api.get(`/api/presenca/entradas?desde=${desde.current || 0}`)
        if (!vivo) return
        const novos = primeira ? [] : r.itens   // ao abrir a tela, não avisa quem entrou antes
        desde.current = Math.max(r.agora, ...r.itens.map((x) => x.quando))
        if (!novos.length) return
        setAvisos((a) => [...a, ...novos.map((x) => ({ ...x, chave: `${x.id}` }))].slice(-4))
        if (somLigado()) tocar('mensagem', 60)
      } catch { /* sem rede: tenta no próximo */ }
    }
    buscar(true)
    const t = setInterval(() => { if (devePuxar('entradas')) buscar(false) }, 30000)
    return () => { vivo = false; clearInterval(t) }
  }, [gestor])

  useEffect(() => {
    if (!avisos.length) return undefined
    const t = setTimeout(() => setAvisos((a) => a.slice(1)), 8000)
    return () => clearTimeout(t)
  }, [avisos])

  const alternarSom = () => { const v = !som; setSom(v); try { localStorage.setItem(CHAVE_SOM, v ? '1' : '0') } catch { /* sem armazenamento */ } }
  if (!gestor) return null
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 top-16 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {avisos.map((a) => (
          <motion.div key={a.chave} role="status" layout
            initial={calmo ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={calmo ? { opacity: 0 } : { opacity: 0, x: 40 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            /* marca: aviso flutuante sobre a tela, por isso a sombra */
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_14px_32px_-12px_rgb(0_0_0/0.35)]">
            {a.avatar
              ? <img src={a.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{iniciais(a.nome)}</span>}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium"><LogIn className="h-3.5 w-3.5 shrink-0 text-emerald-600" />{a.nome || 'Alguém'} entrou</p>
              <p className="truncate text-xs text-muted-foreground">
                {METODO[a.metodo] || 'no sistema'} · {new Date(a.quando * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {a.papel ? ` · ${a.papel}` : ''}
              </p>
            </div>
            <button type="button" onClick={alternarSom} title={som ? 'Tirar o som destes avisos' : 'Ligar o som destes avisos'} aria-label={som ? 'Tirar o som' : 'Ligar o som'}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">{som ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}</button>
            <button type="button" onClick={() => setAvisos((v) => v.filter((x) => x.chave !== a.chave))} aria-label="Fechar aviso"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
