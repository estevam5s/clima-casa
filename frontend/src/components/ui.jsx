import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

const VARIANTES = {
  primario: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
  secundario: 'border border-border bg-card text-foreground hover:bg-muted',
  perigo: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  fantasma: 'text-muted-foreground hover:bg-muted hover:text-foreground',
}

export function Botao({ variante = 'primario', carregando, icone: Icone, children, className = '', tamanho = 'md', ...props }) {
  const tam = tamanho === 'sm' ? 'h-8 px-3 text-sm gap-1.5' : 'h-10 px-4 text-sm gap-2'
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed ${tam} ${VARIANTES[variante]} ${className}`}
      disabled={carregando || props.disabled}
      {...props}
    >
      {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : Icone ? <Icone className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

export function Cabecalho({ titulo, descricao, acoes }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
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
          <div key={t.id} className="pointer-events-auto flex max-w-md items-start gap-2 rounded-lg bg-foreground px-4 py-3 text-sm text-background shadow-lg">
            {t.tipo === 'erro' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400 dark:text-red-600" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400 dark:text-emerald-600" />}
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useDados(carregar, deps = []) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState(null)
  const recarregar = useCallback(async () => {
    try {
      setDados(await carregar())
      setErro(null)
    } catch (e) {
      setErro(e.message)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { recarregar() }, [recarregar])
  return { dados, erro, recarregar, setDados }
}
