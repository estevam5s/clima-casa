import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Keyboard, X } from 'lucide-react'
import { usePreferencias } from '../preferencias'

// Atalhos de teclado do sistema: "?" mostra a lista, "g" + letra navega (como no Gmail e no GitHub).
export const IR = [
  ['p', 'Painel', '/'], ['a', 'Aparelhos', '/aparelhos'], ['m', 'Mapa do escritório', '/mapa'], ['c', 'Cenas', '/cenas'], ['u', 'Automações', '/automacoes'],
  ['g', 'Agenda', '/agendamentos'], ['r', 'Relatórios', '/relatorios'], ['t', 'Atividade', '/atividade'], ['s', 'Segurança', '/seguranca'],
  ['e', 'Mensagens', '/mensagens'], ['j', 'Projetos', '/projetos'], ['i', 'Transmissores', '/transmissores'], ['b', 'Supabase', '/supabase'], ['o', 'Configurações', '/configuracoes'],
]
const GERAIS = [['⌘ K', 'Buscar em todo o sistema'], ['?', 'Mostrar esta lista'], ['Esc', 'Fechar janelas e menus'], ['g depois uma letra', 'Ir para uma tela (veja ao lado)']]
const emCampo = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))

export default function Atalhos() {
  const [aberto, setAberto] = useState(false)
  const [p] = usePreferencias()
  const navegar = useNavigate()
  const g = useRef(0)
  useEffect(() => {
    const abrir = () => setAberto(true)
    const tecla = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); setAberto((v) => !v) }
        return
      }
      if (emCampo(e.target) || !p.atalhos) return
      if (e.key === 'Escape') { setAberto(false); return }
      if (e.key === '?') { e.preventDefault(); setAberto((v) => !v); return }
      if (Date.now() - g.current < 1200) {
        const destino = IR.find(([k]) => k === e.key.toLowerCase())
        g.current = 0
        if (destino) { e.preventDefault(); setAberto(false); navegar(destino[2]) }
        return
      }
      if (e.key === 'g') g.current = Date.now()
    }
    window.addEventListener('keydown', tecla); window.addEventListener('clima:atalhos', abrir)
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('clima:atalhos', abrir) }
  }, [navegar, p.atalhos])
  const Tecla = ({ children }) => <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-b-2 border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-semibold">{children}</kbd>
  return (
    <AnimatePresence>
      {aberto && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setAberto(false)}>
          <motion.div role="dialog" aria-modal aria-labelledby="titulo-atalhos" initial={{ y: 12, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 12, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"> {/* marca: janela flutua */}
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Keyboard className="h-5 w-5" /></span>
              <div className="flex-1"><h2 id="titulo-atalhos" className="text-lg font-semibold">Atalhos de teclado</h2><p className="text-xs text-muted-foreground">No Windows e no Linux, Ctrl no lugar de ⌘. Desligue em Configurações → Aparência.</p></div>
              <button onClick={() => setAberto(false)} className="rounded-md p-1.5 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Gerais</p>
                <ul className="space-y-2 text-sm">{GERAIS.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{d}</span><Tecla>{k}</Tecla></li>)}</ul>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ir para (g + letra)</p>
                <ul className="space-y-2 text-sm">{IR.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{d}</span><span className="flex gap-1"><Tecla>g</Tecla><Tecla>{k}</Tecla></span></li>)}</ul>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
