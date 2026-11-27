import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AirVent, ArrowLeft, Bell, Bot, CalendarClock, CalendarOff, CheckCircle2, Clock, CloudSun, Copy, Gauge, GitBranch, Globe, History,
  Hourglass, Lightbulb, Mail, Maximize2, Play, Plus, PowerOff, Repeat, Save, ScrollText, Search, Send, Sparkles, Thermometer, Timer,
  Trash2, Variable, Webhook, Workflow, XCircle, ZoomIn, ZoomOut,
} from 'lucide-react'
import { api, haQuanto } from '../../api'
import { useProjeto } from '../../contexto'
import { Aviso, Botao, Carregando, Interruptor, Selo, Vazio, confirmar, useDados, useToast } from '../ui'

// Fluxos no estilo do N8N (backend/app/fluxos.py): blocos ligados por setas. Arrastar o fundo move a tela, a roda do mouse
// aproxima, arrastar da bolinha da direita de um bloco até a da esquerda de outro cria a ligação. Executar mostra o caminho
// percorrido bloco a bloco. O catálogo de blocos vem do servidor (GET /api/fluxos/catalogo).

const ICONES = {
  gatilho_manual: Play, gatilho_horario: Clock, gatilho_intervalo: Repeat, gatilho_ar: AirVent, gatilho_ligado_ha: Hourglass,
  gatilho_temperatura: Thermometer, gatilho_webhook: Webhook, condicao: GitBranch, janela: CalendarClock, feriado: CalendarOff,
  esperar: Timer, ar_estado: Gauge, clima_fora: CloudSun, definir: Variable, ar: AirVent, desligar_todos: PowerOff, cena: Sparkles,
  dispositivo: Lightbulb, notificacao: Bell, registrar: ScrollText, email: Mail, telegram: Send, http: Globe, ia: Bot,
}
// cor de cada categoria: faixa do bloco e bolinhas (cores de estado, não decoração)
const COR = {
  gatilho: { faixa: 'bg-emerald-500', texto: 'text-emerald-600 dark:text-emerald-400', fundo: 'bg-emerald-500/10' },
  logica: { faixa: 'bg-amber-500', texto: 'text-amber-600 dark:text-amber-400', fundo: 'bg-amber-500/10' },
  acao: { faixa: 'bg-primary', texto: 'text-primary', fundo: 'bg-primary/10' },
  integracao: { faixa: 'bg-sky-500', texto: 'text-sky-600 dark:text-sky-400', fundo: 'bg-sky-500/10' },
}
const L = 232                 // largura do bloco
const Y_ENTRADA = 30          // altura da bolinha de entrada
const Y_PORTA = { saida: 30, sim: 30, nao: 58 }
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const NOME_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const novoId = () => Math.random().toString(36).slice(2, 9)

function resumoConfig(n, cat) {
  const c = n.config || {}
  const op = (k, id) => (cat?.opcoes?.[k] || []).find((o) => String(o.id) === String(id))?.nome
  const dias = (d) => (!d?.length ? '' : d.join() === '1,2,3,4,5' ? 'dias úteis' : d.length === 7 ? 'todo dia' : d.map((i) => NOME_DIA[i]).join(', '))
  switch (n.tipo) {
    case 'gatilho_horario': return `${c.hora || '--:--'} · ${dias(c.dias)}${c.pular_feriado ? ' · pula feriado' : ''}`
    case 'gatilho_intervalo': return `a cada ${c.minutos || '?'} min`
    case 'gatilho_ar': return `${{ ligou: 'ligou', desligou: 'desligou', qualquer: 'ligou ou desligou' }[c.evento] || 'mudou'} · ${op('ar', c.aparelho_id) || 'qualquer ar'}`
    case 'gatilho_ligado_ha': return `${c.minutos || '?'} min · ${op('ar', c.aparelho_id) || 'qualquer ar'}`
    case 'gatilho_temperatura': return `${c.sentido === 'abaixo' ? 'abaixo de' : 'acima de'} ${c.valor ?? '?'} °C`
    case 'gatilho_webhook': return c.token ? 'endereço gerado' : 'salve para gerar o endereço'
    case 'condicao': return `${c.campo || '?'} ${c.operador || '='} ${c.operador === 'vazio' ? '' : c.valor || '?'}`
    case 'janela': return `${c.inicio || '--'}–${c.fim || '--'} · ${dias(c.dias)}`
    case 'esperar': return `${c.segundos || '?'} s`
    case 'ar_estado': case 'ar': {
      const alvo = c.aparelho_id === 'evento' ? 'ar do gatilho' : op('ar', c.aparelho_id) || 'escolha o ar'
      if (n.tipo === 'ar_estado') return alvo
      return `${c.acao === 'desligar' ? 'Desligar' : 'Ligar'} · ${alvo}${c.acao !== 'desligar' && c.temperatura ? ` · ${c.temperatura} °C` : ''}`
    }
    case 'desligar_todos': return op('projeto', c.projeto_id) || 'todos os projetos'
    case 'cena': return op('cena', c.cena_id) || 'escolha a cena'
    case 'dispositivo': return `${c.acao || 'ligar'} · ${op('dispositivo', c.dispositivo_id) || 'escolha o aparelho'}`
    case 'notificacao': case 'email': return c.titulo || c.assunto || 'sem título'
    case 'telegram': case 'registrar': return (c.texto || 'sem texto').slice(0, 40)
    case 'http': return `${c.metodo || 'GET'} ${(c.url || 'sem URL').replace('https://', '').slice(0, 30)}`
    case 'ia': return (c.pedido || 'sem pedido').slice(0, 40)
    case 'definir': return `var.${c.nome || '?'} = ${c.valor || ''}`.slice(0, 40)
    case 'clima_fora': return op('projeto', c.projeto_id) || 'primeiro projeto'
    default: return ''
  }
}

function padraoConfig(def) {
  const c = {}
  for (const f of def.campos) {
    if (f.tipo === 'dias') c[f.nome] = [1, 2, 3, 4, 5]
    else if (f.tipo === 'hora') c[f.nome] = f.nome === 'fim' ? '18:00' : '08:00'
    else if (f.tipo === 'escolha') c[f.nome] = f.extra?.[0]?.[0] ?? ''
    else if (f.tipo === 'sim_nao') c[f.nome] = false
    else if (f.tipo === 'pessoas') c[f.nome] = []
    else if (f.tipo === 'numero') c[f.nome] = f.extra ? Math.max(f.extra.min, Math.min(f.extra.max, { minutos: 60, segundos: 10, valor: 30, temperatura: 23 }[f.nome] ?? f.extra.min)) : ''
    else c[f.nome] = ''
  }
  return c
}

// modelos prontos: só usam blocos do catálogo; o primeiro ar da lista entra onde precisa de um ar
function modelos(cat) {
  const ar = cat?.opcoes?.ar?.[0]?.id ?? ''
  const n = (id, tipo, x, y, config) => ({ id, tipo, x, y, config: { ...padraoConfig(cat.blocos[tipo]), ...config } })
  return [
    { nome: 'Ligar o ar antes do expediente', descricao: 'Dias úteis às 7h55, sem rodar em feriado ou férias.', icone: Clock,
      grafo: { nos: [n('g', 'gatilho_horario', 40, 80, { hora: '07:55', pular_feriado: true }), n('a', 'ar', 340, 80, { aparelho_id: ar, acao: 'ligar', modo: 'frio', temperatura: 23 }),
        n('r', 'registrar', 640, 80, { texto: 'Ar ligado antes do expediente ({{agora}})' })],
      ligacoes: [{ de: 'g', porta: 'saida', para: 'a' }, { de: 'a', porta: 'saida', para: 'r' }] } },
    { nome: 'Ar esquecido ligado à noite', descricao: 'Ligado há 2 h fora do horário: desliga e avisa no sino e no Telegram.', icone: Hourglass,
      grafo: { nos: [n('g', 'gatilho_ligado_ha', 40, 100, { minutos: 120 }), n('j', 'janela', 340, 100, { inicio: '07:00', fim: '19:00', dias: [1, 2, 3, 4, 5] }),
        n('d', 'ar', 640, 200, { aparelho_id: 'evento', acao: 'desligar' }), n('s', 'notificacao', 940, 140, { titulo: '{{evento.nome}} desligado', texto: 'Estava ligado há {{evento.minutos}} min fora do expediente.', gravidade: 'media' }),
        n('t', 'telegram', 940, 300, { texto: '{{evento.nome}} estava ligado fora do expediente e foi desligado.' })],
      ligacoes: [{ de: 'g', porta: 'saida', para: 'j' }, { de: 'j', porta: 'nao', para: 'd' }, { de: 'd', porta: 'saida', para: 's' }, { de: 'd', porta: 'saida', para: 't' }] } },
    { nome: 'Calor lá fora, ar no expediente', descricao: 'Rua acima de 30 °C em horário comercial: liga o ar em 22 °C.', icone: Thermometer,
      grafo: { nos: [n('g', 'gatilho_temperatura', 40, 100, { sentido: 'acima', valor: 30 }), n('j', 'janela', 340, 100, { inicio: '08:00', fim: '18:00' }),
        n('a', 'ar', 640, 60, { aparelho_id: ar, acao: 'ligar', modo: 'frio', temperatura: 22 }), n('s', 'notificacao', 940, 60, { titulo: 'Calor lá fora: {{fora.temperatura}} °C', texto: 'O ar foi ligado em 22 °C.' })],
      ligacoes: [{ de: 'g', porta: 'saida', para: 'j' }, { de: 'j', porta: 'sim', para: 'a' }, { de: 'a', porta: 'saida', para: 's' }] } },
    { nome: 'Bom dia com a previsão (IA)', descricao: 'Às 8h a IA escreve um resumo do tempo e manda no Telegram.', icone: Bot,
      grafo: { nos: [n('g', 'gatilho_horario', 40, 80, { hora: '08:00' }), n('f', 'clima_fora', 340, 80, {}),
        n('i', 'ia', 640, 80, { pedido: 'Escreva um bom dia curto para a equipe do escritório. Lá fora: {{fora.temperatura}} °C, sensação {{fora.sensacao}} °C, tempo {{fora.tipo}}. Sugira se vale ligar o ar.' }),
        n('t', 'telegram', 940, 80, { texto: '{{ia.texto}}' })],
      ligacoes: [{ de: 'g', porta: 'saida', para: 'f' }, { de: 'f', porta: 'saida', para: 'i' }, { de: 'i', porta: 'saida', para: 't' }] } },
    { nome: 'Webhook de outro sistema', descricao: 'Outro sistema chama o endereço e o painel avisa com o que veio.', icone: Webhook,
      grafo: { nos: [n('g', 'gatilho_webhook', 40, 80, {}), n('c', 'condicao', 340, 80, { campo: '{{webhook.acao}}', operador: '=', valor: 'desligar' }),
        n('d', 'desligar_todos', 640, 40, {}), n('s', 'notificacao', 640, 220, { titulo: 'Chegou: {{webhook.titulo}}', texto: '{{webhook}}' })],
      ligacoes: [{ de: 'g', porta: 'saida', para: 'c' }, { de: 'c', porta: 'sim', para: 'd' }, { de: 'c', porta: 'nao', para: 's' }] } },
  ]
}

// ---------------- lista ----------------
export default function Fluxos() {
  const { sessao } = useProjeto()
  const toast = useToast()
  const { dados: lista, recarregar, erro } = useDados(() => api.get('/api/fluxos'))
  const { dados: cat } = useDados(() => api.get('/api/fluxos/catalogo'))
  const [aberto, setAberto] = useState(null)   // id | { modelo }
  const pode = sessao?.permissoes?.includes('automacoes.gerenciar')
  const reduzir = useReducedMotion()

  const ligar = async (f, v) => { try { await api.put(`/api/fluxos/${f.id}/ativo`, { ativo: v }); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const apagar = async (f) => { if (!(await confirmar(`Apagar o fluxo "${f.nome}"? O histórico de execuções vai junto.`, { titulo: 'Apagar fluxo', ok: 'Apagar' }))) return; try { await api.del(`/api/fluxos/${f.id}`); recarregar(); toast('Fluxo apagado.') } catch (e) { toast(e.message, 'erro') } }
  const duplicar = async (f) => { try { await api.post(`/api/fluxos/${f.id}/duplicar`); recarregar(); toast('Cópia criada (desligada).') } catch (e) { toast(e.message, 'erro') } }

  if (aberto && cat) return <Editor cat={cat} id={typeof aberto === 'number' ? aberto : null} modelo={aberto?.modelo} pode={pode} aoFechar={() => { setAberto(null); recarregar() }} />
  if (erro) return <Aviso>{erro}</Aviso>
  if (!lista || !cat) return <Carregando />
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fluxos</h2>
          <p className="text-sm text-muted-foreground">Automações em blocos ligados por setas: um gatilho, condições e ações em sequência, com e-mail, Telegram, IA e chamadas a outros sistemas.</p>
        </div>
        {pode && <Botao icone={Plus} onClick={() => setAberto({ modelo: null })}>Novo fluxo</Botao>}
      </div>

      {pode && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Começar de um modelo</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {modelos(cat).map((m, i) => {
              const I = m.icone
              return (
                <motion.button key={m.nome} initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => setAberto({ modelo: m })} className="group flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left hover:border-primary/50 hover:bg-muted/50">
                  <span className="flex items-center gap-2 text-sm font-medium"><I className="h-4 w-4 text-primary" />{m.nome}</span>
                  <span className="text-xs text-muted-foreground">{m.descricao}</span>
                  <MiniGrafo grafo={m.grafo} cat={cat} />
                </motion.button>
              )
            })}
          </div>
        </section>
      )}

      {!lista.length ? (
        <Vazio icone={Workflow} titulo="Nenhum fluxo ainda" texto={pode ? 'Crie um do zero ou comece por um dos modelos acima.' : 'Quem gerencia as automações ainda não criou fluxos.'} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lista.map((f, i) => (
            <motion.li key={f.id} layout initial={reduzir ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}
              className="cartao flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setAberto(f.id)} className="min-w-0 text-left">
                  <p className="flex items-center gap-2 font-medium hover:text-primary"><Workflow className="h-4 w-4 shrink-0" /><span className="truncate">{f.nome}</span></p>
                  {f.descricao && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.descricao}</p>}
                </button>
                <Interruptor ligado={f.ativo} disabled={!pode} onChange={(v) => ligar(f, v)} rotulo={`${f.ativo ? 'Desligar' : 'Ligar'} ${f.nome}`} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {f.gatilhos.length ? f.gatilhos.map((g) => <Selo key={g} cor="verde">{g}</Selo>) : <Selo cor="ambar">sem gatilho</Selo>}
                <Selo>{f.blocos} bloco(s)</Selo>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  {f.ultimo_estado === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : f.ultimo_estado === 'erro' ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <History className="h-3.5 w-3.5" />}
                  {f.ultima_exec ? `Rodou ${haQuanto(f.ultima_exec)} · ${f.execucoes} vez(es)` : 'Ainda não rodou'}
                </span>
                <span className="flex gap-1">
                  <Botao tamanho="sm" variante="secundario" onClick={() => setAberto(f.id)}>Abrir</Botao>
                  {pode && <Botao tamanho="sm" variante="fantasma" icone={Copy} onClick={() => duplicar(f)} aria-label="Duplicar" />}
                  {pode && <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => apagar(f)} aria-label="Apagar" />}
                </span>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

function MiniGrafo({ grafo, cat }) {
  const nos = grafo.nos
  const xs = nos.map((n) => n.x), ys = nos.map((n) => n.y)
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0 + L, h = Math.max(...ys) - y0 + 70
  const pos = Object.fromEntries(nos.map((n) => [n.id, n]))
  return (
    <svg viewBox={`${x0 - 10} ${y0 - 10} ${w + 20} ${h + 20}`} className="mt-1 h-12 w-full" aria-hidden>
      {grafo.ligacoes.map((l, i) => { const a = pos[l.de], b = pos[l.para]; return a && b && <path key={i} d={curva(a.x + L, a.y + (Y_PORTA[l.porta] || 30), b.x, b.y + Y_ENTRADA)} className="fill-none stroke-muted-foreground/50" strokeWidth="6" /> })}
      {nos.map((n) => <rect key={n.id} x={n.x} y={n.y} width={L} height={60} rx="12" className={`${cat.blocos[n.tipo]?.cat === 'gatilho' ? 'fill-emerald-500/60' : cat.blocos[n.tipo]?.cat === 'logica' ? 'fill-amber-500/60' : cat.blocos[n.tipo]?.cat === 'integracao' ? 'fill-sky-500/60' : 'fill-primary/60'}`} />)}
    </svg>
  )
}

function curva(x1, y1, x2, y2) {
  const d = Math.max(60, Math.abs(x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + d} ${y1}, ${x2 - d} ${y2}, ${x2} ${y2}`
}

// ---------------- editor ----------------
function Editor({ cat, id, modelo, pode, aoFechar }) {
  const toast = useToast()
  const reduzir = useReducedMotion()
  const [carregado, setCarregado] = useState(!id)
  const [fid, setFid] = useState(id)
  const [nome, setNome] = useState(modelo?.nome || 'Novo fluxo')
  const [descricao, setDescricao] = useState(modelo?.descricao || '')
  const [ativo, setAtivo] = useState(false)
  const [nos, setNos] = useState(() => modelo?.grafo?.nos || [{ id: novoId(), tipo: 'gatilho_manual', x: 60, y: 120, config: {} }])
  const [ligacoes, setLigacoes] = useState(() => modelo?.grafo?.ligacoes || [])
  const [sel, setSel] = useState(null)              // { tipo: 'no' | 'lig', id }
  const [vista, setVista] = useState({ x: 40, y: 40, z: 1 })
  const [ligando, setLigando] = useState(null)      // { de, porta, x, y } enquanto arrasta uma seta
  const [sujo, setSujo] = useState(!id)
  const [salvando, setSalvando] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [execucao, setExecucao] = useState(null)    // última execução (passos)
  const [mostrados, setMostrados] = useState(0)     // quantos passos já acenderam na animação
  const [busca, setBusca] = useState('')
  const [painel, setPainel] = useState('blocos')    // celular: blocos | ajustes
  const tela = useRef(null)
  const arrasto = useRef(null)

  useEffect(() => {
    if (!id) return
    api.get(`/api/fluxos/${id}`).then((f) => {
      setNome(f.nome); setDescricao(f.descricao || ''); setAtivo(f.ativo); setNos(f.grafo?.nos || []); setLigacoes(f.grafo?.ligacoes || []); setCarregado(true)
    }).catch((e) => { toast(e.message, 'erro'); aoFechar() })
  }, [id])   // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (fn) => { fn(); setSujo(true) }
  const no = (nid) => nos.find((n) => n.id === nid)
  const def = (n) => cat.blocos[n?.tipo]

  // ---------- posição na tela <-> no desenho ----------
  const paraDesenho = useCallback((cx, cy) => {
    const r = tela.current.getBoundingClientRect()
    return { x: (cx - r.left - vista.x) / vista.z, y: (cy - r.top - vista.y) / vista.z }
  }, [vista])

  const adicionar = (tipo, onde) => {
    const r = tela.current?.getBoundingClientRect()
    const p = onde || (r ? paraDesenho(r.left + r.width / 2 - 100, r.top + r.height / 2 - 40) : { x: 100, y: 100 })
    const n = { id: novoId(), tipo, x: Math.round(p.x), y: Math.round(p.y), config: padraoConfig(cat.blocos[tipo]) }
    mudar(() => setNos((v) => [...v, n]))
    setSel({ tipo: 'no', id: n.id }); setPainel('ajustes')
  }
  const remover = useCallback(() => {
    if (!sel || !pode) return
    if (sel.tipo === 'no') mudar(() => { setNos((v) => v.filter((n) => n.id !== sel.id)); setLigacoes((v) => v.filter((l) => l.de !== sel.id && l.para !== sel.id)) })
    else mudar(() => setLigacoes((v) => v.filter((l) => `${l.de}|${l.porta}|${l.para}` !== sel.id)))
    setSel(null)
  }, [sel, pode])

  // ---------- arrastar (bloco, fundo) e ligar ----------
  const inicioBloco = (e, n) => {
    if (e.button !== 0 || e.target.closest('[data-porta]')) return
    e.stopPropagation()
    setSel({ tipo: 'no', id: n.id }); setPainel('ajustes')
    if (!pode) return
    arrasto.current = { tipo: 'no', id: n.id, cx: e.clientX, cy: e.clientY, x: n.x, y: n.y, moveu: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const inicioFundo = (e) => {
    if (e.button !== 0) return
    setSel(null)
    arrasto.current = { tipo: 'fundo', cx: e.clientX, cy: e.clientY, x: vista.x, y: vista.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const inicioPorta = (e, n, porta) => {
    e.stopPropagation(); e.preventDefault()
    if (!pode) return
    const p = paraDesenho(e.clientX, e.clientY)
    setLigando({ de: n.id, porta, ...p })
    arrasto.current = { tipo: 'ligar' }
    tela.current.setPointerCapture?.(e.pointerId)
  }
  const mover = (e) => {
    const a = arrasto.current
    if (!a) return
    if (a.tipo === 'no') {
      const dx = (e.clientX - a.cx) / vista.z, dy = (e.clientY - a.cy) / vista.z
      if (Math.abs(dx) + Math.abs(dy) > 2) a.moveu = true
      setNos((v) => v.map((n) => (n.id === a.id ? { ...n, x: Math.round((a.x + dx) / 4) * 4, y: Math.round((a.y + dy) / 4) * 4 } : n)))
    } else if (a.tipo === 'fundo') setVista((v) => ({ ...v, x: a.x + e.clientX - a.cx, y: a.y + e.clientY - a.cy }))
    else if (a.tipo === 'ligar') { const p = paraDesenho(e.clientX, e.clientY); setLigando((l) => l && { ...l, ...p }) }
  }
  const soltar = (e) => {
    const a = arrasto.current
    arrasto.current = null
    if (a?.tipo === 'no' && a.moveu) setSujo(true)
    if (a?.tipo === 'ligar' && ligando) {
      const alvo = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-entrada]')?.dataset.entrada
      const destino = alvo && no(alvo)
      if (destino && alvo !== ligando.de && def(destino)?.cat !== 'gatilho') {
        const nova = { de: ligando.de, porta: ligando.porta, para: alvo }
        if (!ligacoes.some((l) => l.de === nova.de && l.porta === nova.porta && l.para === nova.para)) mudar(() => setLigacoes((v) => [...v, nova]))
      }
      setLigando(null)
    }
  }
  const roda = (e) => {
    e.preventDefault()
    const r = tela.current.getBoundingClientRect()
    const fator = Math.exp(-e.deltaY * 0.0015)
    setVista((v) => {
      const z = Math.min(1.8, Math.max(0.35, v.z * fator))
      const mx = e.clientX - r.left, my = e.clientY - r.top
      return { z, x: mx - ((mx - v.x) * z) / v.z, y: my - ((my - v.y) * z) / v.z }
    })
  }
  useEffect(() => {   // roda do mouse sem rolar a página (listener não-passivo)
    const el = tela.current
    if (!el) return undefined
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  })
  const ajustar = useCallback(() => {
    const el = tela.current
    if (!el || !nos.length) return
    const r = el.getBoundingClientRect()
    const x0 = Math.min(...nos.map((n) => n.x)), y0 = Math.min(...nos.map((n) => n.y))
    const x1 = Math.max(...nos.map((n) => n.x + L)), y1 = Math.max(...nos.map((n) => n.y + 90))
    const z = Math.min(1.2, Math.max(0.35, Math.min((r.width - 80) / (x1 - x0), (r.height - 80) / (y1 - y0))))
    setVista({ z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z })
  }, [nos])
  useEffect(() => { if (carregado) requestAnimationFrame(ajustar) }, [carregado])   // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- teclado ----------
  useEffect(() => {
    const f = (e) => {
      if (e.target.closest('input,textarea,select,[contenteditable]')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); remover() }
      if (e.key === 'Escape') setSel(null)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); salvar() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  // ---------- salvar / executar ----------
  const salvar = async (extra = {}) => {
    if (!pode) return null
    setSalvando(true)
    try {
      const corpo = { nome: nome.trim() || 'Fluxo', descricao, grafo: { nos, ligacoes }, ...extra }
      const r = fid ? await api.put(`/api/fluxos/${fid}`, corpo) : await api.post('/api/fluxos', corpo)
      setFid(r.id); setNos(r.grafo.nos); setLigacoes(r.grafo.ligacoes); setAtivo(r.ativo); setSujo(false)
      toast('Fluxo salvo.')
      return r
    } catch (e) { toast(e.message, 'erro'); return null } finally { setSalvando(false) }
  }
  const executar = async () => {
    let alvo = fid
    if (!alvo || sujo) { const r = await salvar(); if (!r) return; alvo = r.id }
    setRodando(true); setExecucao(null); setMostrados(0)
    try {
      const r = await api.post(`/api/fluxos/${alvo}/executar`, { dados: {} })
      setExecucao(r)
      if (r.estado === 'ignorada') toast(r.erro, 'erro')
      else toast(r.estado === 'ok' ? `Fluxo rodou: ${r.passos.length} bloco(s).` : `Rodou com erro: ${r.erro}`, r.estado === 'ok' ? 'ok' : 'erro')
    } catch (e) { toast(e.message, 'erro') } finally { setRodando(false) }
  }
  const alternarAtivo = async (v) => {
    if (!fid || sujo) { const r = await salvar({ ativo: v }); if (r) setAtivo(r.ativo); return }
    try { const r = await api.put(`/api/fluxos/${fid}/ativo`, { ativo: v }); setAtivo(r.ativo); toast(v ? 'Fluxo ligado: os gatilhos passam a valer.' : 'Fluxo desligado.') } catch (e) { toast(e.message, 'erro') }
  }
  // anima o caminho percorrido: um bloco por vez
  useEffect(() => {
    if (!execucao?.passos?.length) return undefined
    if (reduzir) { setMostrados(execucao.passos.length); return undefined }
    let i = 0
    const t = setInterval(() => { i += 1; setMostrados(i); if (i >= execucao.passos.length) clearInterval(t) }, 320)
    return () => clearInterval(t)
  }, [execucao, reduzir])
  const estadoNo = useMemo(() => {
    const m = {}
    ;(execucao?.passos || []).slice(0, mostrados).forEach((p) => { m[p.no] = p })
    return m
  }, [execucao, mostrados])
  const ligacaoAcesa = (l) => { const p = estadoNo[l.de]; return p?.ok && p.porta === l.porta && estadoNo[l.para] }

  const sair = async () => {
    if (sujo && pode && !(await confirmar('Sair sem salvar as mudanças deste fluxo?', { titulo: 'Mudanças não salvas', ok: 'Sair sem salvar' }))) return
    aoFechar()
  }

  if (!carregado) return <Carregando />
  const selecionado = sel?.tipo === 'no' ? no(sel.id) : null
  const blocosFiltrados = Object.entries(cat.blocos).filter(([, b]) => !busca || `${b.rotulo} ${b.desc}`.toLowerCase().includes(busca.toLowerCase()))
  const pos = Object.fromEntries(nos.map((n) => [n.id, n]))

  return (
    <div className="flex flex-col gap-3">
      {/* barra do editor */}
      <div className="flex flex-wrap items-center gap-2">
        <Botao variante="fantasma" icone={ArrowLeft} onClick={sair}>Fluxos</Botao>
        <input value={nome} onChange={(e) => mudar(() => setNome(e.target.value))} disabled={!pode} aria-label="Nome do fluxo"
          className="campo h-9 min-w-0 flex-1 font-medium sm:max-w-sm" />
        {sujo && <Selo cor="ambar">não salvo</Selo>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm"><Interruptor ligado={ativo} disabled={!pode} onChange={alternarAtivo} rotulo="Fluxo ligado" />{ativo ? 'Ligado' : 'Desligado'}</label>
          <Botao variante="secundario" icone={Play} carregando={rodando} onClick={executar}>Executar</Botao>
          {pode && <Botao icone={Save} carregando={salvando} onClick={() => salvar()}>Salvar</Botao>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        {/* blocos */}
        <aside className={`cartao flex max-h-[70dvh] flex-col overflow-hidden ${painel === 'blocos' ? '' : 'hidden lg:flex'}`}>
          <div className="border-b border-border p-2">
            <label className="relative block"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar bloco" className="campo h-9 pl-8" /></label>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-2">
            {cat.categorias.map(([k, rot]) => {
              const itens = blocosFiltrados.filter(([, b]) => b.cat === k)
              if (!itens.length) return null
              return (
                <div key={k}>
                  <p className={`px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide ${COR[k].texto}`}>{rot}</p>
                  {itens.map(([tipo, b]) => {
                    const I = ICONES[tipo] || Workflow
                    return (
                      <button key={tipo} draggable={pode} disabled={!pode} onDragStart={(e) => e.dataTransfer.setData('text/fluxo-bloco', tipo)} onClick={() => adicionar(tipo)} title={b.desc}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60">
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${COR[k].fundo} ${COR[k].texto}`}><I className="h-3.5 w-3.5" /></span>
                        <span className="truncate">{b.rotulo}</span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </aside>

        {/* tela (no celular vem primeiro; blocos e ajustes ficam embaixo, nos botões) */}
        <div className="relative order-first lg:order-none">
          <div ref={tela} role="application" aria-label="Desenho do fluxo: arraste o fundo para mover, use a roda para aproximar"
            className="fluxo-tela relative h-[62dvh] min-h-[420px] touch-none overflow-hidden rounded-xl border border-border bg-muted/30 lg:h-[70dvh]"
            style={{ backgroundPosition: `${vista.x}px ${vista.y}px`, backgroundSize: `${22 * vista.z}px ${22 * vista.z}px` }}
            onPointerDown={inicioFundo} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={() => { arrasto.current = null; setLigando(null) }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const t = e.dataTransfer.getData('text/fluxo-bloco'); if (t) { e.preventDefault(); const p = paraDesenho(e.clientX, e.clientY); adicionar(t, { x: p.x - L / 2, y: p.y - 30 }) } }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
              <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" aria-hidden>
                {ligacoes.map((l) => {
                  const a = pos[l.de], b = pos[l.para]
                  if (!a || !b) return null
                  const k = `${l.de}|${l.porta}|${l.para}`
                  const d = curva(a.x + L, a.y + (Y_PORTA[l.porta] || 30), b.x, b.y + Y_ENTRADA)
                  const acesa = ligacaoAcesa(l)
                  const escolhida = sel?.tipo === 'lig' && sel.id === k
                  return (
                    <g key={k}>
                      <path d={d} className="pointer-events-auto cursor-pointer fill-none stroke-transparent" strokeWidth="14" onPointerDown={(e) => { e.stopPropagation(); setSel({ tipo: 'lig', id: k }) }} />
                      <path d={d} className={`fill-none ${escolhida ? 'stroke-primary' : acesa ? 'stroke-emerald-500' : l.porta === 'nao' ? 'stroke-red-400/70' : l.porta === 'sim' ? 'stroke-emerald-500/70' : 'stroke-muted-foreground/60'} ${ativo || acesa ? 'fluxo-correndo' : ''}`}
                        strokeWidth={escolhida || acesa ? 3 : 2} strokeDasharray={ativo || acesa ? '7 6' : undefined} />
                    </g>
                  )
                })}
                {ligando && <path d={curva(pos[ligando.de].x + L, pos[ligando.de].y + (Y_PORTA[ligando.porta] || 30), ligando.x, ligando.y)} className="fill-none stroke-primary" strokeWidth="2" strokeDasharray="5 5" />}
              </svg>
              {nos.map((n) => {
                const b = def(n)
                if (!b) return null
                const I = ICONES[n.tipo] || Workflow
                const st = estadoNo[n.id]
                const ativoSel = sel?.tipo === 'no' && sel.id === n.id
                return (
                  <motion.div key={n.id} initial={reduzir ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}
                    className={`absolute select-none rounded-xl border bg-card ${ativoSel ? 'border-primary ring-2 ring-primary/30' : 'border-border'} ${st ? (st.ok ? 'ring-2 ring-emerald-500/60' : 'ring-2 ring-red-500/60') : ''} ${pode ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={{ left: n.x, top: n.y, width: L }} onPointerDown={(e) => inicioBloco(e, n)} onDoubleClick={() => setPainel('ajustes')}>
                    <span className={`absolute inset-y-0 left-0 w-1 rounded-l-xl ${COR[b.cat].faixa}`} aria-hidden />
                    <div className="flex items-start gap-2.5 py-2.5 pl-3.5 pr-3">
                      <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${COR[b.cat].fundo} ${COR[b.cat].texto}`}><I className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.nome || b.rotulo}</p>
                        <p className="truncate text-xs text-muted-foreground">{resumoConfig(n, cat) || b.desc}</p>
                        {st && <p className={`mt-1 truncate text-[11px] ${st.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{st.ok ? st.resumo : st.erro}</p>}
                      </div>
                      {st && (st.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />)}
                    </div>
                    {b.portas.length > 1 && <div className="pb-2 pr-6 text-right text-[11px] leading-[28px] text-muted-foreground"><p>Sim</p><p>Não</p></div>}
                    {/* entrada (esquerda) */}
                    {b.cat !== 'gatilho' && <span data-entrada={n.id} title="Entrada" className="absolute -left-[7px] h-3.5 w-3.5 rounded-full border-2 border-card bg-muted-foreground/70" style={{ top: Y_ENTRADA - 7 }} />}
                    {/* saídas (direita) */}
                    {b.portas.map((p) => (
                      <span key={p} data-porta={p} title={`Arraste para ligar (${p === 'saida' ? 'saída' : p === 'sim' ? 'Sim' : 'Não'})`} onPointerDown={(e) => inicioPorta(e, n, p)}
                        className={`absolute -right-[8px] h-4 w-4 cursor-crosshair rounded-full border-2 border-card ${p === 'nao' ? 'bg-red-500' : p === 'sim' ? 'bg-emerald-500' : 'bg-primary'} transition-transform hover:scale-125`}
                        style={{ top: (Y_PORTA[p] || 30) - 8 }} />
                    ))}
                  </motion.div>
                )
              })}
            </div>
            {!nos.length && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted-foreground">Arraste um bloco da lista para cá. Comece por um gatilho.</p>}
          </div>
          {/* zoom */}
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            <button className="rounded p-1.5 hover:bg-muted" aria-label="Afastar" onClick={() => setVista((v) => ({ ...v, z: Math.max(0.35, v.z / 1.2) }))}><ZoomOut className="h-4 w-4" /></button>
            <span className="w-10 text-center text-xs tabular text-muted-foreground">{Math.round(vista.z * 100)}%</span>
            <button className="rounded p-1.5 hover:bg-muted" aria-label="Aproximar" onClick={() => setVista((v) => ({ ...v, z: Math.min(1.8, v.z * 1.2) }))}><ZoomIn className="h-4 w-4" /></button>
            <button className="rounded p-1.5 hover:bg-muted" aria-label="Ajustar à tela" onClick={ajustar}><Maximize2 className="h-4 w-4" /></button>
          </div>
          {sel && pode && <button onClick={remover} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted"><Trash2 className="h-3.5 w-3.5" />Apagar {sel.tipo === 'no' ? 'bloco' : 'ligação'} (Delete)</button>}
          <div className="mt-2 flex gap-2 lg:hidden">
            <Botao tamanho="sm" variante={painel === 'blocos' ? 'primario' : 'secundario'} onClick={() => setPainel('blocos')}>Blocos</Botao>
            <Botao tamanho="sm" variante={painel === 'ajustes' ? 'primario' : 'secundario'} onClick={() => setPainel('ajustes')}>Ajustes e histórico</Botao>
          </div>
        </div>

        {/* ajustes */}
        <aside className={`cartao max-h-[70dvh] overflow-y-auto p-3 ${painel === 'ajustes' ? '' : 'hidden lg:block'}`}>
          <AnimatePresence mode="wait">
            {selecionado ? (
              <motion.div key={selecionado.id} initial={reduzir ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                <Ajustes n={selecionado} b={def(selecionado)} cat={cat} fid={fid} pode={pode}
                  mudar={(patch) => mudar(() => setNos((v) => v.map((x) => (x.id === selecionado.id ? { ...x, ...patch, config: { ...x.config, ...(patch.config || {}) } } : x))))} />
              </motion.div>
            ) : (
              <motion.div key="fluxo" initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <p className="text-sm font-medium">Sobre o fluxo</p>
                <textarea value={descricao} onChange={(e) => mudar(() => setDescricao(e.target.value))} disabled={!pode} rows={3} placeholder="Para que serve este fluxo"
                  className="campo mt-2 w-full py-1.5 text-sm" aria-label="Descrição" />
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <li>Clique num bloco para ajustar. Arraste a bolinha da direita até outro bloco para ligar.</li>
                  <li>Condições têm duas saídas: verde (Sim) e vermelha (Não).</li>
                  <li>Ligado, os gatilhos rodam sozinhos no agente do escritório. Executar roda agora.</li>
                </ul>
                {fid && <Historico fid={fid} ultima={execucao} aoVer={(e) => { setExecucao(e); setMostrados(0) }} />}
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  )
}

function Ajustes({ n, b, cat, fid, pode, mudar }) {
  const toast = useToast()
  const c = n.config || {}
  const set = (k, v) => mudar({ config: { [k]: v } })
  const opcoes = (t) => cat.opcoes[t === 'ar_ou_evento' ? 'ar' : t] || []
  const urlGancho = c.token ? `${location.origin}/api/fluxos/gancho/${c.token}` : ''
  return (
    <div className="space-y-3">
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${COR[b.cat].texto}`}>{cat.categorias.find(([k]) => k === b.cat)?.[1]}</p>
        <p className="font-medium">{b.rotulo}</p>
        <p className="text-xs text-muted-foreground">{b.desc}</p>
      </div>
      <label className="block text-xs">Nome no desenho
        <input className="campo mt-1 h-9" value={n.nome || ''} placeholder={b.rotulo} disabled={!pode} onChange={(e) => mudar({ nome: e.target.value })} /></label>
      <fieldset disabled={!pode} className="space-y-3">
        {b.campos.map((f) => {
          const v = c[f.nome]
          const rotulo = <span className="mb-1 block text-xs">{f.rotulo}</span>
          if (f.tipo === 'textao') return <label key={f.nome} className="block">{rotulo}<textarea rows={4} className="campo w-full py-1.5 text-sm" value={v || ''} onChange={(e) => set(f.nome, e.target.value)} /></label>
          if (f.tipo === 'texto') return <label key={f.nome} className="block">{rotulo}<input className="campo h-9" value={v || ''} onChange={(e) => set(f.nome, e.target.value)} /></label>
          if (f.tipo === 'numero') return <label key={f.nome} className="block">{rotulo}<input type="number" className="campo h-9" min={f.extra?.min} max={f.extra?.max} value={v ?? ''} onChange={(e) => set(f.nome, e.target.value === '' ? '' : Number(e.target.value))} /></label>
          if (f.tipo === 'hora') return <label key={f.nome} className="block">{rotulo}<input type="time" className="campo h-9" value={v || ''} onChange={(e) => set(f.nome, e.target.value)} /></label>
          if (f.tipo === 'sim_nao') return <label key={f.nome} className="flex items-center justify-between gap-2 text-xs">{f.rotulo}<Interruptor ligado={!!v} onChange={(x) => set(f.nome, x)} rotulo={f.rotulo} /></label>
          if (f.tipo === 'escolha') return <label key={f.nome} className="block">{rotulo}<select className="campo h-9" value={v ?? ''} onChange={(e) => set(f.nome, e.target.value)}>{f.extra.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
          if (f.tipo === 'dias') return (
            <div key={f.nome}>{rotulo}<div className="flex gap-1">{DIAS.map((d, i) => {
              const on = (v || []).includes(i)
              return <button key={i} type="button" aria-pressed={on} title={NOME_DIA[i]} onClick={() => set(f.nome, on ? v.filter((x) => x !== i) : [...(v || []), i].sort())}
                className={`h-8 w-8 rounded-md text-xs font-medium ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{d}</button>
            })}</div></div>)
          if (['ar', 'ar_ou_evento', 'cena', 'dispositivo', 'projeto'].includes(f.tipo)) return (
            <label key={f.nome} className="block">{rotulo}<select className="campo h-9" value={v ?? ''} onChange={(e) => set(f.nome, e.target.value === '' ? '' : e.target.value === 'evento' ? 'evento' : Number(e.target.value))}>
              <option value="">{f.tipo === 'ar' || f.tipo === 'projeto' ? 'Qualquer / todos' : 'Escolha'}</option>
              {f.tipo === 'ar_ou_evento' && <option value="evento">O ar do gatilho</option>}
              {opcoes(f.tipo).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select></label>)
          if (f.tipo === 'pessoas') return (
            <div key={f.nome}>{rotulo}<div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">{opcoes('pessoas').map((p) => {
              const on = (v || []).includes(p.id)
              return <label key={p.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={on} className="accent-[hsl(var(--primary))]" onChange={() => set(f.nome, on ? v.filter((x) => x !== p.id) : [...(v || []), p.id])} />{p.nome}</label>
            })}</div></div>)
          if (f.tipo === 'segredo') return (
            <div key={f.nome}>{rotulo}{urlGancho ? (
              <div className="space-y-1.5">
                <code className="block break-all rounded-md bg-muted px-2 py-1.5 text-[11px]" translate="no">{urlGancho}</code>
                <div className="flex gap-1.5">
                  <Botao tamanho="sm" variante="secundario" icone={Copy} onClick={() => navigator.clipboard.writeText(urlGancho).then(() => toast('Endereço copiado.'))}>Copiar</Botao>
                  <Botao tamanho="sm" variante="fantasma" onClick={() => set(f.nome, '')}>Gerar outro (salve)</Botao>
                </div>
                <p className="text-[11px] text-muted-foreground">POST com JSON. Ex.: <code translate="no">{'{"acao":"desligar","titulo":"teste"}'}</code>. Só funciona com o fluxo ligado. Quem tiver o endereço consegue disparar: trate como senha.</p>
              </div>) : <p className="text-xs text-muted-foreground">{fid ? 'Salve para gerar o endereço.' : 'Salve o fluxo para gerar o endereço secreto.'}</p>}
            </div>)
          return null
        })}
      </fieldset>
      <details className="rounded-md border border-border p-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-foreground">Valores que dá para usar ({'{{...}}'})</summary>
        <ul className="mt-1.5 space-y-0.5" translate="no">
          {['{{agora}}', '{{fluxo.nome}}', '{{evento.nome}}', '{{evento.aparelho_id}}', '{{evento.minutos}}', '{{ar.temperatura}}', '{{ar.ligado}}', '{{fora.temperatura}}', '{{fora.tipo}}', '{{webhook.campo}}', '{{http.status}}', '{{http.json.campo}}', '{{ia.texto}}', '{{var.nome}}'].map((x) => <li key={x}><code>{x}</code></li>)}
        </ul>
      </details>
    </div>
  )
}

function Historico({ fid, ultima, aoVer }) {
  const [lista, setLista] = useState(null)
  useEffect(() => { api.get(`/api/fluxos/${fid}/execucoes?limite=20`).then(setLista).catch(() => setLista([])) }, [fid, ultima?.id])
  return (
    <div className="mt-4">
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><History className="h-4 w-4" />Execuções</p>
      {!lista ? <Carregando /> : !lista.length ? <p className="text-xs text-muted-foreground">Ainda não rodou.</p> : (
        <ul className="space-y-1">
          {lista.map((e) => (
            <li key={e.id}>
              <button onClick={() => aoVer(e)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
                {e.estado === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : e.estado === 'erro' ? <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" /> : <Timer className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{e.origem}{e.erro ? ` · ${e.erro}` : ''}</span>
                <span className="shrink-0 text-muted-foreground">{haQuanto(e.inicio)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
