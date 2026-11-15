import { useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, BarChart3, Gauge, Home, Map as MapaIcone, Search, Snowflake, Wind } from 'lucide-react'
import { IR } from '../components/Atalhos'

// Página que não existe: explica sem termos técnicos, sugere o lugar certo e anima um ar-condicionado "soprando" o 404.
const ROTAS = [...IR.map(([, n, r]) => [n, r]), ['Apps', '/apps'], ['Integrações', '/integracoes'], ['Comandos da Alexa', '/comandos-alexa']]
function distancia(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return m[a.length][b.length]
}

export default function NaoEncontrado() {
  const { pathname } = useLocation()
  const navegar = useNavigate()
  const sugestao = useMemo(() => {
    const p = pathname.toLowerCase().replace(/\/+$/, '').split('/')[1] || ''
    const melhor = ROTAS.filter(([, r]) => r !== '/').map(([n, r]) => [n, r, distancia(p, r.slice(1))]).sort((a, b) => a[2] - b[2])[0]
    return melhor && melhor[2] <= Math.max(2, Math.floor(p.length / 3)) ? melhor : null
  }, [pathname])
  const flocos = Array.from({ length: 14 }, (_, i) => i)
  return (
    <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center overflow-hidden px-4 py-12 text-center">
      <div className="relative h-56 w-full max-w-md" aria-hidden>
        {/* ar-condicionado */}
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }}
          className="absolute left-1/2 top-2 h-16 w-64 -translate-x-1/2 rounded-2xl border border-border bg-card">
          <div className="absolute right-4 top-3 flex items-center gap-1.5 rounded-md bg-foreground/90 px-2 py-0.5 font-mono text-xs font-semibold text-background">
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>404</motion.span>
          </div>
          <div className="absolute inset-x-5 bottom-3 h-1.5 rounded-full bg-muted" />
          <motion.div className="absolute inset-x-5 bottom-3 h-1.5 origin-left rounded-full bg-primary/50" animate={{ scaleX: [0.2, 1, 0.2] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
        </motion.div>
        {/* vento e flocos saindo */}
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="absolute left-1/2 top-20 -translate-x-1/2 text-primary/40" initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: [0, 1, 0], y: [0, 40, 90], x: [(i - 1) * 10, (i - 1) * 40, (i - 1) * 70] }} transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.5, ease: 'easeOut' }}>
            <Wind className="h-7 w-7" />
          </motion.div>
        ))}
        {flocos.map((i) => (
          <motion.div key={`f${i}`} className="absolute top-20 text-sky-400/70 dark:text-sky-300/60" style={{ left: `${20 + ((i * 37) % 60)}%` }}
            initial={{ y: 0, opacity: 0, rotate: 0 }} animate={{ y: [0, 140], opacity: [0, 1, 0], rotate: [0, 180], x: [0, (i % 2 ? 1 : -1) * (10 + (i % 5) * 6)] }}
            transition={{ duration: 3 + (i % 4) * 0.6, repeat: Infinity, delay: i * 0.28, ease: 'easeIn' }}>
            <Snowflake className={i % 3 ? 'h-3 w-3' : 'h-4 w-4'} />
          </motion.div>
        ))}
      </div>
      <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="text-2xl font-semibold tracking-tight sm:text-3xl">Essa página não existe por aqui</motion.h1>
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        O endereço pode ter sido digitado errado ou a página mudou de lugar. Fique tranquilo: nada foi alterado nos seus ares e o sistema continua funcionando normalmente.
      </motion.p>
      {sugestao && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }} className="mt-5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm">
          Você quis dizer <Link to={sugestao[1]} className="font-semibold text-primary hover:underline">{sugestao[0]}</Link>?
        </motion.div>
      )}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-7 flex flex-wrap justify-center gap-2">
        <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar('/'))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" />Voltar</button>
        <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Home className="h-4 w-4" />Ir para o painel</Link>
        <button onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }))} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted"><Search className="h-4 w-4" />Procurar</button>
      </motion.div>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }} className="mt-10 grid w-full max-w-lg grid-cols-3 gap-2 text-sm">
        {[['Aparelhos', '/aparelhos', Gauge], ['Mapa', '/mapa', MapaIcone], ['Relatórios', '/relatorios', BarChart3]].map(([n, r, I]) => (
          <Link key={r} to={r} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-3 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"><I className="h-5 w-5" />{n}</Link>
        ))}
      </motion.div>
      <p className="mt-8 text-[11px] text-muted-foreground/70">Dica: aperte <kbd className="rounded border border-border px-1">?</kbd> para ver os atalhos de teclado.</p>
    </div>
  )
}
