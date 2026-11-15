import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AirVent, AlertTriangle, ArrowLeft, MessageCircle, Bell, BellOff, CheckCheck, CheckCircle2, Cpu, Mic, Radio, Settings, ShieldAlert, Trash2, Wrench, X, Zap,
} from 'lucide-react'
import { api, haQuanto, rotaSegura } from '../api'
import { atualizarAba } from '../favicon'
import { Interruptor, useToast } from './ui'
import { TONS, avisar, tocar } from '../som'

const ICONES = {
  alerta: [AlertTriangle, 'bg-amber-500/15 text-amber-600 dark:text-amber-400'],
  falha: [Zap, 'bg-red-500/15 text-red-600 dark:text-red-400'],
  transmissor: [Radio, 'bg-sky-500/15 text-sky-600 dark:text-sky-400'],
  agente: [Cpu, 'bg-red-500/15 text-red-600 dark:text-red-400'],
  alexa: [Mic, 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'],
  configuracao: [Wrench, 'bg-muted text-muted-foreground'],
  seguranca: [ShieldAlert, 'bg-rose-500/15 text-rose-600 dark:text-rose-400'],
  sistema: [AirVent, 'bg-primary/15 text-primary'],
  mensagem: [MessageCircle, 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'],
}
const ABAS = [['todas', 'Todas'], ['nao_lidas', 'Não lidas'], ['importantes', 'Importantes'], ['seguranca', 'Segurança']]
const diaHora = (ts) => new Date(ts * 1000).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')


// Busca a central a cada 30 s e ao trocar de tela; devolve também o status usado no cabeçalho.
export function useCentral() {
  const [dados, setDados] = useState(null)
  const [aba, setAba] = useState('todas')
  const local = useLocation()
  const vistas = useRef(null)   // ids não lidos já conhecidos: só toca para o que é novo de verdade
  const carregar = useCallback(() => api.get(`/api/notificacoes?filtro=${aba}`).then((d) => {
    setDados(d); atualizarAba(d.total)
    const naoLidas = d.itens.filter((n) => !n.lida && !n.resolvida)
    if (vistas.current) {
      const novas = naoLidas.filter((n) => !vistas.current.has(`${n.id}:${n.atualizado_em}`))
      if (novas.length) {
        const principal = novas.find((n) => n.gravidade === 'alta' || n.tipo === 'seguranca') || novas[0]
        avisar(principal, d.preferencias)
        window.dispatchEvent(new CustomEvent('clima:notificacao', { detail: novas }))
      }
    }
    vistas.current = new Set(naoLidas.map((n) => `${n.id}:${n.atualizado_em}`))
  }).catch(() => {}), [aba])
  useEffect(() => { carregar(); const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [carregar])
  useEffect(() => { carregar() }, [local.pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  return { dados, aba, setAba, carregar }
}

function Item({ n, aoAbrir, aoAtualizar }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const [Icone, cor] = ICONES[n.tipo] || ICONES.sistema
  const acao = async (e) => {
    e.stopPropagation()
    if (n.acao.tipo === 'link') { aoAbrir(n, n.acao.para); return }
    setOcupado(true)
    try { const r = await api.post(`/api/notificacoes/${n.id}/acao`); toast(r.mensagem) } catch (err) { toast(err.message, 'erro') } finally { setOcupado(false); aoAtualizar() }
  }
  const arquivar = async (e) => { e.stopPropagation(); await api.del(`/api/notificacoes/${n.id}`).catch(() => {}); aoAtualizar() }
  const alternarLida = async (e) => { e.stopPropagation(); await api.post(`/api/notificacoes/${n.id}/lida?lida=${!n.lida}`).catch(() => {}); aoAtualizar() }
  return (
    <motion.li layout initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }} onClick={() => aoAbrir(n, n.link)}
      className={`group relative flex cursor-pointer gap-3 border-b border-dashed border-border px-4 py-4 last:border-0 hover:bg-muted/50 ${n.resolvida ? 'opacity-60' : ''}`}>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cor}`}><Icone className="h-[18px] w-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={`flex-1 text-sm leading-snug ${n.lida ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{n.titulo}</p>
          {!n.lida && <button onClick={alternarLida} title="Marcar como lida" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Marcar como lida" />}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="capitalize">{diaHora(n.atualizado_em)}{n.ocorrencias > 1 ? ` · ${n.ocorrencias}×` : ''}</span>
          <span>{n.resolvida ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" />resolvida</span> : haQuanto(n.atualizado_em)}</span>
        </div>
        {n.detalhe && <p className="mt-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-relaxed text-foreground/85">{n.detalhe}</p>}
        {n.acao && !n.resolvida && (
          <div className="mt-2.5 flex gap-2">
            <button onClick={arquivar} className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-muted">Dispensar</button>
            <button onClick={acao} disabled={ocupado} className="h-8 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">{ocupado ? 'Aguarde…' : n.acao.rotulo}</button>
          </div>
        )}
      </div>
      <button onClick={arquivar} title="Limpar esta notificação" aria-label="Limpar notificação"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
    </motion.li>
  )
}

function Preferencias({ dados, voltar, aoAtualizar }) {
  const toast = useToast()
  const [p, setP] = useState(dados.preferencias)
  const salvar = async (novo) => {
    setP(novo)
    try { await api.put('/api/notificacoes/preferencias', novo); aoAtualizar() } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <div className="max-h-[520px] overflow-y-auto px-4 pb-4">
      <button onClick={voltar} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</button>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Mostrar</p>
      <div className="mt-2 divide-y divide-border rounded-lg border border-border">
        {Object.entries(dados.tipos).map(([k, r]) => {
          const [I, cor] = ICONES[k] || ICONES.sistema
          return (
            <div key={k} className="flex items-center gap-3 px-3 py-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${cor}`}><I className="h-3.5 w-3.5" /></span>
              <span className="flex-1 text-sm">{r}</span>
              <Interruptor ligado={!p.tipos_ocultos.includes(k)} rotulo={`Mostrar ${r}`}
                onChange={(v) => salvar({ ...p, tipos_ocultos: v ? p.tipos_ocultos.filter((t) => t !== k) : [...p.tipos_ocultos, k] })} />
            </div>
          )
        })}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Comportamento</p>
      <div className="mt-2 divide-y divide-border rounded-lg border border-border">
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Som ao chegar notificação nova</span><Interruptor ligado={p.som} onChange={(v) => { salvar({ ...p, som: v }); if (v) tocar(p.som_tom, p.som_volume) }} rotulo="Som" /></label>
        {p.som && (<>
          {[['som_tom', 'Toque normal', Object.keys(TONS).filter((k) => k !== 'alerta')], ['som_alerta', 'Toque de alerta (importantes e segurança)', Object.keys(TONS)]].map(([campo, rotulo, opcoes]) => (
            <div key={campo} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <span className="flex-1">{rotulo}</span>
              <select value={p[campo]} onChange={(e) => { salvar({ ...p, [campo]: e.target.value }); tocar(e.target.value, p.som_volume) }} className="campo h-8 w-auto py-0 text-sm" aria-label={rotulo}>
                {opcoes.map((k) => <option key={k} value={k}>{TONS[k].rotulo}</option>)}
              </select>
              <button onClick={() => tocar(p[campo], p.som_volume)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Ouvir</button>
            </div>
          ))}
          <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="w-28 shrink-0">Volume</span>
            <input type="range" min="5" max="100" step="5" value={p.som_volume} onChange={(e) => salvar({ ...p, som_volume: +e.target.value })} onMouseUp={() => tocar(p.som_tom, p.som_volume)} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Volume" />
            <span className="w-9 text-right text-xs tabular text-muted-foreground">{p.som_volume}%</span>
          </label>
          <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Tocar só para as importantes</span><Interruptor ligado={p.som_so_importantes} onChange={(v) => salvar({ ...p, som_so_importantes: v })} rotulo="Só importantes" /></label>
        </>)}
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Aviso do sistema (com a aba em segundo plano)</span><Interruptor ligado={p.desktop} onChange={async (v) => {
          if (v && 'Notification' in window && Notification.permission !== 'granted') {
            const r = await Notification.requestPermission().catch(() => 'denied')
            if (r !== 'granted') { toast('O navegador bloqueou os avisos. Libere em Configurações do site (cadeado na barra de endereço).', 'erro'); return }
          }
          salvar({ ...p, desktop: v })
        }} rotulo="Aviso do sistema" /></label>
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Vibrar no celular</span><Interruptor ligado={p.vibrar} onChange={(v) => salvar({ ...p, vibrar: v })} rotulo="Vibrar" /></label>
        <div className="px-3 py-2.5 text-sm">
          <label className="flex items-center gap-3"><span className="flex-1">Não perturbe</span><Interruptor ligado={p.nao_perturbe} onChange={(v) => salvar({ ...p, nao_perturbe: v })} rotulo="Não perturbe" /></label>
          {p.nao_perturbe && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">sem som de
              <input type="time" value={p.nao_perturbe_inicio} onChange={(e) => salvar({ ...p, nao_perturbe_inicio: e.target.value })} className="campo h-8 w-auto py-0 text-sm" aria-label="Início" />
              até
              <input type="time" value={p.nao_perturbe_fim} onChange={(e) => salvar({ ...p, nao_perturbe_fim: e.target.value })} className="campo h-8 w-auto py-0 text-sm" aria-label="Fim" />
            </div>
          )}
        </div>
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Contador só com as importantes</span><Interruptor ligado={p.contador_so_importantes} onChange={(v) => salvar({ ...p, contador_so_importantes: v })} rotulo="Contador só importantes" /></label>
        <label className="flex items-center gap-3 px-3 py-2.5 text-sm"><span className="flex-1">Limpar resolvidas depois de</span>
          <select value={p.arquivar_resolvidas_h} onChange={(e) => salvar({ ...p, arquivar_resolvidas_h: +e.target.value })} className="campo h-8 w-auto py-0 text-sm">
            {[[0, 'nunca'], [1, '1 hora'], [24, '1 dia'], [168, '7 dias'], [720, '30 dias']].map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">As preferências ficam no banco e valem em qualquer aparelho em que você entrar.</p>
    </div>
  )
}

export default function Notificacoes({ central }) {
  const { dados, aba, setAba, carregar } = central
  const [aberto, setAberto] = useState(false)
  const [config, setConfig] = useState(false)
  const [menuLimpar, setMenuLimpar] = useState(false)
  const navegar = useNavigate()
  const toast = useToast()
  const ref = useRef(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e) => { if (!ref.current?.contains(e.target)) { setAberto(false); setConfig(false); setMenuLimpar(false) } }
    const esc = (e) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const total = dados?.total || 0
  const cont = dados?.contagem || {}
  const abrir = async (n, para) => {
    if (!n.lida) api.post(`/api/notificacoes/${n.id}/lida`).catch(() => {})
    setAberto(false)
    if (para) navegar(rotaSegura(para))
    carregar()
  }
  const lerTodas = async () => { await api.post('/api/notificacoes/ler-todas'); carregar() }
  const limpar = async (somente) => { setMenuLimpar(false); await api.post(`/api/notificacoes/limpar?somente=${somente}`); toast('Notificações limpas.'); carregar() }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAberto(!aberto)} className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Notificações (${total} não lidas)`}>
        <Bell className="h-[18px] w-[18px]" />
        <AnimatePresence>
          {total > 0 && (
            <motion.span key={total} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-background tabular">
              {total > 99 ? '99+' : total}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {aberto && dados && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-[440px] max-w-[calc(100vw-1.5rem)] origin-top-right overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"> {/* marca: painel flutua */}
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <p className="text-base font-semibold">{config ? 'Preferências' : 'Suas notificações'}</p>
              {!config && (
                <div className="relative flex items-center gap-0.5">
                  <button onClick={lerTodas} title="Marcar todas como lidas" aria-label="Marcar todas como lidas" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><CheckCheck className="h-4 w-4" /></button>
                  <button onClick={() => setMenuLimpar((m) => !m)} title="Limpar notificações" aria-label="Limpar notificações" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => setConfig(true)} title="Preferências" aria-label="Preferências de notificação" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="h-4 w-4" /></button>
                  <AnimatePresence>
                    {menuLimpar && (
                      <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="absolute right-0 top-10 z-10 w-52 rounded-xl border border-border bg-card p-1 shadow-xl"> {/* marca: menu flutua */}
                        {[['lidas', 'Limpar as lidas'], ['resolvidas', 'Limpar as resolvidas'], ['todas', 'Limpar todas']].map(([k, r]) => (
                          <button key={k} onClick={() => limpar(k)} className={`w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${k === 'todas' ? 'text-red-600 dark:text-red-400' : ''}`}>{r}</button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
            {config ? <Preferencias dados={dados} voltar={() => setConfig(false)} aoAtualizar={carregar} /> : (
              <>
                <div className="px-4">
                  <div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-muted p-1">
                    {ABAS.map(([k, r]) => (
                      <button key={k} onClick={() => setAba(k)} className={`relative flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[13px] ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                        {aba === k && <motion.span layoutId="aba-notif" className="absolute inset-0 rounded-lg bg-background" transition={{ type: 'spring', duration: 0.3 }} />}
                        <span className="relative truncate">{r}</span>
                        <span className={`relative rounded-md px-1 text-[11px] tabular ${aba === k ? 'bg-muted' : ''}`}>{cont[k] ?? 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="mt-2 max-h-[min(520px,calc(100vh-220px))] overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {dados.itens.map((n) => <Item key={n.id} n={n} aoAbrir={abrir} aoAtualizar={carregar} />)}
                  </AnimatePresence>
                  {dados.itens.length === 0 && (
                    <li className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <BellOff className="h-6 w-6 text-muted-foreground" />
                      <p className="text-sm font-medium">{aba === 'todas' ? 'Nada pendente' : 'Nada nesta aba'}</p>
                      <p className="text-xs text-muted-foreground">Transmissores, agente e Alexa sem pendências. Avisos novos aparecem aqui.</p>
                    </li>
                  )}
                </ul>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
