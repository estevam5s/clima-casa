import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'
import { simboloTemp, temp } from '../marcaAtual'
import { gravarCache, lerCache } from '../cacheTela'

const VARIANTES = {
  primario: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
  secundario: 'border border-border bg-card text-foreground hover:bg-muted disabled:opacity-50 disabled:hover:bg-card',
  perigo: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  fantasma: 'text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:hover:bg-transparent',
}

export function Botao({ variante = 'primario', carregando, icone: Icone, children, className = '', tamanho = 'md', ...props }) {
  const tam = tamanho === 'sm' ? 'h-8 px-3 text-sm gap-1.5' : 'h-10 px-4 text-sm gap-2'
  return (
    <button data-botao={variante}
      className={`inline-flex max-w-full items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed ${tam} ${VARIANTES[variante]} ${className}`}
      disabled={carregando || props.disabled}
      {...props}
    >
      {carregando ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : Icone ? <Icone className="h-4 w-4 shrink-0" /> : null}
      {typeof children === 'string' ? <span className="truncate">{children}</span> : children}
    </button>
  )
}

// Dentro de uma tela com abas (ex.: Rotinas), o cabeçalho da tela embutida vira subtítulo (h2 menor), sem repetir o h1.
export const CabecalhoSecundario = createContext(false)

export function Cabecalho({ titulo, descricao, acoes }) {
  const secundario = useContext(CabecalhoSecundario)
  const H = secundario ? 'h2' : 'h1'
  return (
    <div className={`${secundario ? 'mb-5' : 'mb-6'} flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between`}>
      <div className="min-w-0 sm:flex-1">
        <H className={secundario ? 'text-lg font-semibold tracking-tight' : 'text-2xl font-semibold tracking-tight'}>{titulo}</H>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0 sm:justify-end">{acoes}</div>}
    </div>
  )
}

export function Selo({ cor = 'cinza', children }) {
  const cores = {
    cinza: 'bg-muted text-muted-foreground',
    verde: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    vermelho: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    ambar: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    azul: 'bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  }
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${cores[cor]}`}>{children}</span>
}

export function Ponto({ ativo }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ativo ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
}

export function Interruptor({ ligado, onChange, disabled, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ligado)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${ligado ? 'bg-marca-600' : 'bg-muted-foreground/30'}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-card shadow transition-transform ${ligado ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

export function Modal({ aberto, titulo, onFechar, children, largura = 'max-w-lg' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const tecla = (e) => e.key === 'Escape' && onFechar()
    document.addEventListener('keydown', tecla)
    ref.current?.querySelector('input, select, textarea, button')?.focus()
    return () => document.removeEventListener('keydown', tecla)
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={`max-h-[92vh] w-full ${largura} overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{titulo}</h2>
          <button onClick={onFechar} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Vazio({ icone: Icone, titulo, texto, acao }) {
  return (
    <div className="cartao flex flex-col items-center px-6 py-12 text-center">
      {Icone && <Icone className="mb-3 h-8 w-8 text-muted-foreground/70" strokeWidth={1.5} />}
      <p className="font-medium">{titulo}</p>
      {texto && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

export function Carregando() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

export function Aviso({ tipo = 'erro', children }) {
  const estilo = tipo === 'erro'
    ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
    : tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
    : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2.5 text-sm ${estilo}`}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

// ---------- notificações ----------
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [itens, setItens] = useState([])
  const mostrar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setItens((l) => [...l, { id, texto, tipo }])
    setTimeout(() => setItens((l) => l.filter((i) => i.id !== id)), tipo === 'erro' ? 7000 : 3500)
  }, [])
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6" aria-live="polite">
        {itens.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg"> {/* marca: toast flutua */}
            {t.tipo === 'erro' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400 dark:text-red-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 dark:text-emerald-600" />}
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// cache (opcional): chave em cacheTela; a tela abre na hora com o que a pessoa viu da última vez e troca quando o
// servidor responde. Melhora o LCP das telas cujo conteúdo principal depende da API (ex.: Novidades, Bugs).
export function useDados(carregar, deps = [], { cache } = {}) {
  const [dados, setDados] = useState(() => (cache ? lerCache(cache) : null))
  const [erro, setErro] = useState(null)
  const recarregar = useCallback(async () => {
    try {
      const r = await carregar()
      setDados(r)
      if (cache) gravarCache(cache, r)
      setErro(null)
    } catch (e) {
      setErro(e.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { recarregar() }, [recarregar])
  return { dados, erro, recarregar, setDados }
}

// ---------- componentes de painel (faixa de métricas, mostrador, seção, esqueleto) ----------
export function NumeroAnimado({ valor, casas = 0 }) {
  const [v, setV] = useState(0)
  const alvo = Number(valor) || 0
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(alvo); return }
    let quadro
    const inicio = performance.now()
    const de = v
    const passo = (t) => {
      const p = Math.min(1, (t - inicio) / 700)
      setV(de + (alvo - de) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo]) // eslint-disable-line react-hooks/exhaustive-deps
  return <>{v.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas })}</>
}

// Faixa de métricas: um cartão com divisórias; a primeira métrica é a principal.
// Linha de tendência curta (sem eixo) para indicadores: desenha ao entrar e destaca o último ponto
export function Tendencia({ valores, cor = 'hsl(var(--primary))', altura = 28 }) {
  const max = Math.max(...valores, 1), min = Math.min(...valores, 0), w = 120
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * w, altura - 3 - ((v - min) / (max - min || 1)) * (altura - 6)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [ux, uy] = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${altura}`} className="mt-2 h-7 w-full max-w-[160px] overflow-visible" preserveAspectRatio="none" aria-hidden>
      <path d={`${d} L${w},${altura} L0,${altura} Z`} fill={cor} opacity="0.08" />
      <motion.path d={d} fill="none" stroke={cor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      <circle cx={ux} cy={uy} r="2.4" fill={cor} />
    </svg>
  )
}

export function FaixaMetricas({ itens }) {
  return (
    <div /* marca: esta é a faixa de métricas */ className="cartao grid grid-cols-2 divide-border overflow-hidden md:grid-cols-4 md:divide-x [&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(n+3)]:border-t-0 [&>*:nth-child(2)]:border-l md:[&>*:nth-child(2)]:border-l-0">
      {itens.map((m, i) => (
        <div key={m.rotulo} className="px-5 py-4">
          <p className="text-xs font-medium text-muted-foreground">{m.rotulo}</p>
          <p className={`mt-1.5 font-semibold leading-none tabular ${i === 0 ? 'text-[30px]' : 'text-2xl'}`}>
            {typeof m.valor === 'number' ? <NumeroAnimado valor={m.valor} casas={m.casas} /> : m.valor}
            {m.sufixo && <span className="ml-0.5 text-base font-medium text-muted-foreground">{m.sufixo}</span>}
          </p>
          {m.dica && <p className={`mt-1.5 text-xs ${m.tom === 'ruim' ? 'text-red-600 dark:text-red-400' : m.tom === 'bom' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{m.dica}</p>}
          {m.serie?.length > 1 && <Tendencia valores={m.serie} />}
        </div>
      ))}
    </div>
  )
}

export function Secao({ titulo, contexto, acao, children, className = '', semPadding = false }) {
  return (
    <section className={`cartao min-w-0 ${className}`}>
      <div className="flex items-end justify-between gap-3 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="titulo-secao">{titulo}</h2>
          {contexto && <p className="text-xs text-muted-foreground">{contexto}</p>}
        </div>
        {acao}
      </div>
      <div className={semPadding ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

export function Esqueleto({ className = '' }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}

// Mostrador circular de temperatura (arco de 270°), animado.
export function Dial({ valor, min, max, ligado, modo, tamanho = 220 }) {
  const mostrar = temp(valor), un = simboloTemp().slice(1)
  const r = 86, c = 2 * Math.PI * r, arco = c * 0.75
  const p = Math.max(0, Math.min(1, (valor - min) / Math.max(1, max - min)))
  const cor = !ligado ? 'hsl(var(--muted-foreground) / 0.35)' : modo === 'quente' ? '#c2410c' : modo === 'ventilar' ? 'hsl(var(--muted-foreground))' : '#2563a8'
  return (
    <svg viewBox="0 0 200 200" width={tamanho} height={tamanho} role="img" aria-label={`${valor} graus`}>
      <circle cx="100" cy="100" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${arco} ${c}`} transform="rotate(135 100 100)" />
      <circle cx="100" cy="100" r={r} fill="none" stroke={cor} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${arco * p} ${c}`} transform="rotate(135 100 100)"
        style={{ transition: 'stroke-dasharray 500ms cubic-bezier(.2,.7,.2,1), stroke 300ms' }} />
      {Array.from({ length: max - min + 1 }, (_, i) => {
        const ang = (135 + (270 * i) / Math.max(1, max - min)) * Math.PI / 180
        const x1 = 100 + Math.cos(ang) * 70, y1 = 100 + Math.sin(ang) * 70, x2 = 100 + Math.cos(ang) * 74, y2 = 100 + Math.sin(ang) * 74
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--border))" strokeWidth="1.5" />
      })}
      <text x="100" y="104" textAnchor="middle" fontSize="54" fontWeight="600" fill={ligado ? cor : 'hsl(var(--muted-foreground))'} style={{ fontVariantNumeric: 'tabular-nums' }}>{mostrar}°{un === 'F' ? 'F' : ''}</text>
      <text x="100" y="132" textAnchor="middle" fontSize="12" fill="hsl(var(--muted-foreground))">{temp(min)}° – {temp(max)}°</text>
    </svg>
  )
}

// Confirmação no visual do sistema (no lugar de window.confirm, que trava a página e foge do tema).
// Uso: if (!(await confirmar('Apagar X?', { ok: 'Apagar' }))) return. O <ConfirmacaoGlobal /> fica montado no Layout.
let pedirConfirmacao = null
export function confirmar(texto, { titulo = 'Confirmar', ok = 'Confirmar', perigo = true } = {}) {
  if (!pedirConfirmacao) return Promise.resolve(window.confirm(texto))   // fora do Layout (raro): cai no do navegador
  return new Promise((res) => pedirConfirmacao({ texto, titulo, ok, perigo, res }))
}
export function ConfirmacaoGlobal() {
  const [p, setP] = useState(null)
  useEffect(() => { pedirConfirmacao = setP; return () => { pedirConfirmacao = null } }, [])
  const fim = (v) => { p?.res(v); setP(null) }
  return (
    <Modal aberto={!!p} titulo={p?.titulo || 'Confirmar'} onFechar={() => fim(false)}>
      {p && (
        <>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{p.texto}</p>
          <div className="mt-5 flex justify-end gap-2">
            <Botao variante="secundario" onClick={() => fim(false)}>Cancelar</Botao>
            <Botao variante={p.perigo ? 'perigo' : 'primario'} onClick={() => fim(true)} autoFocus>{p.ok}</Botao>
          </div>
        </>
      )}
    </Modal>
  )
}
