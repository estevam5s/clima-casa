import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertOctagon, Bot, Mail, Ban, ChevronDown, ClipboardList, FileLock2, Radar, Scale, Users, ShieldAlert, Download, FileCode2, FileJson, FileSpreadsheet, FileText, FileType2, Globe2, MapPin, Pause, Play, RefreshCw, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react'
import { avisoEmail } from '../emailAviso'
import { api, dataHora, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Modal, Secao, useDados, useToast, confirmar } from '../components/ui'
import PainelSeguranca from '../components/config/PainelSeguranca'
import { useSearchParams } from 'react-router-dom'
import { Acessos, Conformidade, Incidentes, Integridade, Riscos, TestesAoVivo } from '../components/seguranca/Governanca'
import TelegramSeg from '../components/seguranca/TelegramSeg'
import Fisico from '../components/seguranca/Fisico'

const Globo3D = lazy(() => import('../components/Globo3D'))

// O globo é a parte mais pesada da tela: só carrega quando a pessoa chega perto dele rolando a página.
function QuandoPerto({ children, reserva }) {
  const ref = useRef(null)
  const [perto, setPerto] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || perto) return undefined
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setPerto(true) }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [perto])
  return <div ref={ref} className="h-full w-full">{perto ? children : reserva}</div>
}
const PERIODOS = [[1, '24 h'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias']]
const CATS = [['acesso', 'Acessos', '#2dd4bf'], ['login', 'Logins', '#22c55e'], ['robo', 'Robôs inofensivos', '#f59e0b'], ['ataque', 'Ataques reais', '#ef4444']]
const FORMATOS = [['pdf', 'PDF', FileText], ['docx', 'Word (DOCX)', FileType2], ['xlsx', 'Excel (XLSX)', FileSpreadsheet], ['csv', 'CSV (ZIP)', FileSpreadsheet],
  ['html', 'HTML', Globe2], ['xml', 'XML', FileCode2], ['json', 'JSON', FileJson], ['md', 'Markdown', FileText]]
const eixo = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'hsl(var(--muted-foreground))' }
const COR_EVENTO = { ataque: 'bg-red-500', login: 'bg-emerald-500', acesso: 'bg-teal-400', robo: 'bg-amber-500' }
const NIVEIS = [
  ['ataque', 'Ataque real', 'bg-red-500', 'text-red-600 dark:text-red-400', 'Tentou senha, token falso, ferramenta de ataque ou varredura.'],
  ['suspeito', 'Suspeito', 'bg-orange-500', 'text-orange-600 dark:text-orange-400', 'Errou a senha uma vez. Vale acompanhar.'],
  ['robo', 'Robô inofensivo', 'bg-amber-500', 'text-amber-600 dark:text-amber-400', 'Servidor de nuvem, antivírus de link ou prévia do WhatsApp que só abriu a página.'],
  ['visitante', 'Visitante', 'bg-teal-400', 'text-teal-600 dark:text-teal-400', 'Abriu a página sem estar logado e não tentou nada.'],
  ['confiavel', 'Equipe', 'bg-emerald-500', 'text-emerald-600 dark:text-emerald-400', 'Já entrou com a senha certa ou é da rede do escritório.'],
]
const NIVEL = Object.fromEntries(NIVEIS.map((n) => [n[0], n]))

// Cada IP do período foi conferido: o que ele realmente fez, não só "recebeu 401".
function Analise({ analise, total }) {
  const soma = Math.max(1, NIVEIS.reduce((s, [k]) => s + (analise[k] || 0), 0))
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="titulo-secao">Verificação dos alertas</h2>
        <p className="text-xs text-muted-foreground">{total} IP(s) analisados pelo que fizeram, pelo navegador e pelo dono do IP (nome reverso)</p>
      </div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {NIVEIS.map(([k, , cor], i) => analise[k] ? (
          <motion.div key={k} className={`h-full ${cor}`} initial={{ width: 0 }} animate={{ width: `${(analise[k] / soma) * 100}%` }} transition={{ delay: 0.1 + i * 0.08, duration: 0.6, ease: 'easeOut' }} />
        ) : null)}
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"> {/* marca: efeito de alerta/fundo do globo */}
        {NIVEIS.map(([k, r, cor, texto, d]) => (
          <div key={k} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`h-2 w-2 rounded-full ${cor}`} />{r}</dt>
            <dd className={`mt-0.5 text-2xl font-semibold tabular ${analise[k] && k === 'ataque' ? texto : ''}`}>{analise[k] || 0}</dd>
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{d}</p>
          </div>
        ))}
      </dl>
      {!analise.ataque && <p className="mt-4 flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-4 w-4 shrink-0" />Nenhum ataque real no período. Robôs e visitantes sem login só viram a tela de entrada, que pede senha e verificação anti-robô.</p>}
    </section>
  )
}

function Dica({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl"> {/* marca: dica do gráfico flutua */}
      <p className="font-medium">{label}</p>
      {payload.filter((p) => p.value).map((p) => <p key={p.dataKey} className="text-muted-foreground">{p.name}: <span className="font-mono text-foreground">{p.value}</span></p>)}
    </div>
  )
}

function Exportar({ dias }) {
  const toast = useToast()
  const [aberto, setAberto] = useState(false)
  const [gerando, setGerando] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora); return () => document.removeEventListener('mousedown', fora)
  }, [])
  // modelo do PDF/Word (oficial da Prefeitura ou moderno) e envio por e-mail: escolhas guardadas neste navegador
  const ler = (k, p) => { try { return localStorage.getItem(k) ?? p } catch { return p } }
  const gravar = (k, v) => { try { localStorage.setItem(k, v) } catch { /* sem armazenamento */ } }
  const [modelo, setModelo] = useState(() => ler('clima-seg-modelo', 'pmf'))
  const [porEmail, setPorEmail] = useState(() => ler('clima-seg-email', '1') !== '0')
  const enviar = async (f) => (await api.post('/api/seguranca/relatorio/enviar', { formato: f, dias: Math.min(90, +dias || 30), modelo })).enviados
  const baixar = async (f) => {
    setGerando(f)
    try {
      toast(`Relatório salvo: ${await api.baixar(`/api/seguranca/relatorio?formato=${f}&dias=${dias}&modelo=${modelo}`)}`); setAberto(false)
      if (porEmail) { try { toast(avisoEmail(await enviar(f), 'Também enviado para')) } catch (e) { toast(`Baixado, mas o e-mail não foi: ${e.message}`, 'erro') } }
    } catch (e) { toast(e.message, 'erro') } finally { setGerando(null) }
  }
  const soEnviar = async () => {
    setGerando('email')
    try { toast(avisoEmail(await enviar('pdf'), 'Relatório em PDF enviado para')); setAberto(false) } catch (e) { toast(e.message, 'erro') } finally { setGerando(null) }
  }
  return (
    <div ref={ref} className="relative">
      <Botao icone={Download} onClick={() => setAberto((a) => !a)}>Relatório<ChevronDown className="h-3.5 w-3.5" /></Botao>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-card p-1.5 shadow-xl"> {/* marca: menu flutua */}
            <p className="px-3 pb-1 pt-2 text-xs text-muted-foreground">Postura, IPs, países, rotas atacadas, bloqueios, eventos e recomendações dos últimos {dias} dia(s)</p>
            <div className="mx-3 mb-1 mt-1 grid grid-cols-2 gap-1.5 border-b border-border pb-2" role="group" aria-label="Modelo do PDF e do Word">
              {[['pmf', 'Prefeitura', 'Brasão e cabeçalho oficial'], ['moderno', 'Moderno', 'Cores da marca']].map(([k, r, dsc]) => (
                <button key={k} onClick={() => { setModelo(k); gravar('clima-seg-modelo', k) }} aria-pressed={modelo === k} title={dsc}
                  className={`rounded-md border px-2 py-1.5 text-left text-xs ${modelo === k ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{r}<span className="block text-[10px] font-normal text-muted-foreground">{dsc}</span></button>
              ))}
            </div>
            {FORMATOS.map(([f, r, I]) => (
              <button key={f} onClick={() => baixar(f)} disabled={!!gerando} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-60">
                <I className="h-4 w-4 text-muted-foreground" />{gerando === f ? 'Gerando…' : r}
              </button>
            ))}
            <div className="mt-1 space-y-1.5 border-t border-border px-3 pb-1.5 pt-2">
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={porEmail} onChange={(e) => { setPorEmail(e.target.checked); gravar('clima-seg-email', e.target.checked ? '1' : '0') }} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />Ao baixar, enviar também para o meu e-mail</label>
              <button onClick={soEnviar} disabled={!!gerando} className="flex items-center gap-2 text-xs font-medium text-primary hover:underline disabled:opacity-60"><Mail className="h-3.5 w-3.5" />{gerando === 'email' ? 'Enviando…' : 'Só enviar por e-mail (PDF)'}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AcoesIp({ ip, bloqueado, aoMudar }) {
  const toast = useToast()
  const enviar = async (corpo, msg) => {
    try { await api.post('/api/seguranca/ips', { alvo: ip, motivo: 'pela tela de Segurança', ...corpo }); toast(msg); aoMudar() } catch (e) { toast(e.message, 'erro') }
  }
  if (bloqueado) return null
  return (
    <span className="flex justify-end gap-1">
      <button onClick={() => enviar({ tipo: 'bloqueado', minutos: 1440 }, `IP ${ip} bloqueado por 24 h.`)} title="Bloquear por 24 h" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"><Ban className="h-3.5 w-3.5" /></button>
      <button onClick={() => enviar({ tipo: 'bloqueado', minutos: null }, `IP ${ip} bloqueado de vez.`)} title="Bloquear de vez" className="rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-red-600">sempre</button>
      {/^\d+\.\d+\.\d+\.\d+$/.test(ip) && <button onClick={async () => { const faixa = ip.replace(/\.\d+$/, '.0/24'); if (await confirmar(`Bloquear a faixa inteira ${faixa} (256 endereços) por 24 h?`)) api.post('/api/seguranca/ips', { alvo: faixa, motivo: 'faixa pela tela de Segurança', tipo: 'bloqueado', minutos: 1440 }).then(() => { toast(`Faixa ${faixa} bloqueada por 24 h.`); aoMudar() }).catch((e) => toast(e.message, 'erro')) }} title="Bloquear a faixa /24 por 24 h" className="rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-red-600">/24</button>}
      <button onClick={() => enviar({ tipo: 'permitido', minutos: null }, `IP ${ip} nunca será bloqueado.`)} title="Nunca bloquear" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-emerald-600"><UserCheck className="h-3.5 w-3.5" /></button>
    </span>
  )
}

// Escudo anti-DDoS: alerta vermelho durante ataque, taxa ao vivo e controle manual.
function Escudo({ escudo, aoMudar }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(null)   // antes de qualquer return: regra dos hooks
  if (!escudo) return null
  const ativo = escudo.ativo
  const c = escudo.config || {}
  const taxa = escudo.taxa || { req_seg: 0, ips_min: 0 }
  const pct = Math.min(100, Math.round((taxa.req_seg / Math.max(1, c.ddos_req_seg || 60)) * 100))
  const mudar = async (acao, confirmado = false) => {
    // ligar à mão bloqueia logins (a Vercel desafia todo acesso): confirma no sistema, explicando o efeito
    if (!confirmado) { setConfirmar(acao); return }
    setConfirmar(null)
    setOcupado(true)
    try { aoMudar(await api.post('/api/seguranca/escudo', { acao, minutos: c.escudo_minutos || 30 })); toast(acao === 'ligar' ? 'Escudo ligado.' : 'Escudo desligado.') } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const restante = ativo ? Math.max(0, Math.round((escudo.ate - Date.now() / 1000) / 60)) : 0
  return (
    <>
      <AnimatePresence>
        {ativo && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="alerta-ataque relative overflow-hidden rounded-xl border border-red-500/60 bg-red-600 p-5 text-white"> {/* marca: alerta de ataque */}
            <div className="relative flex flex-wrap items-center gap-4">
              <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15"><span className="absolute inset-0 animate-ping rounded-full bg-white/25" /><ShieldAlert className="h-6 w-6" /></span> {/* marca: efeito de alerta/fundo do globo */}
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold">Ataque em massa: escudo ligado</p>
                <p className="text-sm text-white/85">{escudo.motivo}. Limites endurecidos, {escudo.bloqueados_no_ataque} IP(s) bloqueado(s) automaticamente{escudo.vercel ? ' e modo de ataque da Vercel ativo' : ''}. Desliga sozinho em {restante} min.</p>
              </div>
              <Botao variante="secundario" carregando={ocupado} onClick={() => mudar('desligar')} className="!border-white/40 !bg-white/10 !text-white hover:!bg-white/20">Desligar escudo</Botao>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Modal aberto={!!confirmar} titulo={confirmar === 'ligar' ? 'Ligar o escudo anti-DDoS?' : 'Desligar o escudo agora?'} onFechar={() => setConfirmar(null)}>
        {confirmar === 'ligar' ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Use só durante um ataque de verdade. Enquanto estiver ligado (até {c.escudo_minutos || 30} min):</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><b className="text-foreground">Ninguém consegue entrar no sistema</b> (a Vercel desafia todo acesso e o login é barrado). Quem já está logado continua usando.</li>
              <li>Os apps do celular e do computador podem parar de responder.</li>
              <li>Os ares continuam obedecendo pelo agente do escritório e pela Alexa.</li>
            </ul>
          </div>
        ) : <p className="text-sm text-muted-foreground">Os limites voltam ao normal e o modo de ataque da Vercel é desligado.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Botao>
          <Botao variante={confirmar === 'ligar' ? 'perigo' : 'primario'} onClick={() => mudar(confirmar, true)}>{confirmar === 'ligar' ? 'Ligar mesmo assim' : 'Desligar'}</Botao>
        </div>
      </Modal>
      <section className="cartao p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className={`h-4 w-4 ${ativo ? 'text-red-500' : 'text-emerald-500'}`} />Escudo anti-DDoS</h2>
            <p className="text-xs text-muted-foreground">{c.escudo_auto ? `Liga sozinho com ${c.ddos_req_seg} req/s ou ${c.ddos_ips_min} IPs/min` : 'Automático desligado (Regras do firewall)'} · rajada máxima {c.rajada_10s} req em 10 s por IP</p>
          </div>
          {!ativo && <Botao variante="perigo" tamanho="sm" icone={ShieldAlert} carregando={ocupado} onClick={() => mudar('ligar')}>Ligar escudo agora</Botao>}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Requisições por segundo agora</p>
            <p className="mt-1 text-2xl font-semibold tabular">{taxa.req_seg}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {c.ddos_req_seg}</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><motion.div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} animate={{ width: `${Math.max(2, pct)}%` }} /></div>
          </div>
          <div><p className="text-xs text-muted-foreground">IPs diferentes no último minuto</p><p className="mt-1 text-2xl font-semibold tabular">{taxa.ips_min}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {c.ddos_ips_min}</span></p></div>
          <div><p className="text-xs text-muted-foreground">Proteção da borda</p><p className="mt-1 text-sm">{c.escudo_vercel ? 'Modo de ataque da Vercel liga junto com o escudo' : 'Só o escudo do sistema'}</p></div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Medição desta instância do servidor. A Vercel também filtra ataques volumétricos na borda antes de chegarem aqui.</p>
      </section>
    </>
  )
}

// Checklist ao vivo: cada item é conferido no servidor agora (não é uma lista estática)
function Checklist() {
  const { dados } = useDados(() => api.get('/api/seguranca/checklist'))
  const [aberto, setAberto] = useState(false)
  if (!dados) return null
  const falhas = dados.itens.filter((x) => !x.ok)
  const grupos = [...new Set(dados.itens.map((x) => x.grupo))]
  return (
    <section className="cartao">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center gap-4 px-5 py-4 text-left" aria-expanded={aberto}>
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" /><motion.circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" className={dados.nota >= 90 ? 'stroke-emerald-500' : dados.nota >= 70 ? 'stroke-amber-500' : 'stroke-red-500'} strokeDasharray="97.4" initial={{ strokeDashoffset: 97.4 }} animate={{ strokeDashoffset: 97.4 * (1 - dados.nota / 100) }} transition={{ duration: 1 }} /></svg>
          <span className="text-sm font-semibold tabular-nums">{dados.nota}%</span>
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="titulo-secao">Checklist de proteção</h2>
          <p className="text-xs text-muted-foreground">{dados.ok} de {dados.total} controles ativos agora{falhas.length ? ` · falta: ${falhas.map((x) => x.item).join(', ')}` : ' · tudo no lugar'}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border">
            <div className="grid gap-x-8 gap-y-5 p-5 md:grid-cols-2">
              {grupos.map((g) => (
                <div key={g}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                  <ul className="space-y-2">
                    {dados.itens.filter((x) => x.grupo === g).map((x) => (
                      <li key={x.item} className="flex gap-2.5 text-sm">
                        {x.ok ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                        <span><span className="font-medium">{x.item}</span><span className="block text-xs text-muted-foreground">{x.detalhe}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

const ABAS = [['monitoramento', 'Monitoramento', Activity], ['conformidade', 'Conformidade ISO', Scale], ['riscos', 'Riscos', ClipboardList], ['incidentes', 'Incidentes', AlertOctagon],
  ['fisico', 'Comandos físicos', ShieldCheck], ['acessos', 'Acessos', Users], ['telegram', 'Telegram', Bot], ['testes', 'Testes ao vivo', Radar], ['integridade', 'Integridade', FileLock2]]

export default function Seguranca() {
  const [params, setParams] = useSearchParams()
  const aba = ABAS.some(([k]) => k === params.get('aba')) ? params.get('aba') : 'monitoramento'
  const barra = (
    <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções da segurança">
      {ABAS.map(([k, r, I]) => (
        <button key={k} onClick={() => setParams(k === 'monitoramento' ? {} : { aba: k }, { replace: true })} className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm ${aba === k ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
          <I className="h-4 w-4" />{r}
          {aba === k && <motion.span layoutId="aba-seg" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </nav>
  )
  if (aba !== 'monitoramento') {
    const Comp = { conformidade: Conformidade, riscos: Riscos, incidentes: Incidentes, fisico: Fisico, acessos: Acessos, telegram: TelegramSeg, testes: TestesAoVivo, integridade: Integridade }[aba]
    const desc = { conformidade: 'ISO/IEC 27001:2022 e 27002 com ligação para 27005, 27017, 27018, 27701, 27035, 22301 e LGPD. O que dá para conferir sozinho é conferido na hora.',
      riscos: 'Avaliação e tratamento de riscos (ISO 27005, cláusula 6.1 da 27001).', incidentes: 'Registro, resposta e lições de incidentes (ISO 27035 e LGPD).',
      fisico: 'Travas que valem para todo comando que mexe em equipamento real, aparelhos isolados e comandos recusados.',
      acessos: 'Quem tem acesso a quê, duas etapas e revisão periódica (A.5.15 a A.5.18).', telegram: 'Auditoria do bot do Telegram: cada interação, quem fez, o resultado, os IPs que entregaram, vínculos, PINs e bloqueios.', testes: 'Conferência externa de HTTPS, certificado, cabeçalhos, arquivos expostos e CORS.',
      integridade: 'Selos SHA-256 encadeados que mostram se algum registro foi alterado.' }[aba]
    return (
      <>
        <Cabecalho titulo="Segurança" descricao={desc} />
        {barra}
        <Comp />
      </>
    )
  }
  return <Monitoramento barra={barra} />
}

function Monitoramento({ barra }) {
  const toast = useToast()
  const [dias, setDias] = useState(7)
  const [aoVivo, setAoVivo] = useState(true)
  const [local, setLocal] = useState(null)
  const [buscaIp, setBuscaIp] = useState('')
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/seguranca/resumo?dias=${dias}`), [dias])
  const { dados: escudo, setDados: setEscudo, recarregar: recarregarEscudo } = useDados(() => api.get('/api/seguranca/escudo'))
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) recarregarEscudo() }, 5000); return () => clearInterval(t) }, [recarregarEscudo])
  useEffect(() => {
    if (!aoVivo) return undefined
    const t = setInterval(recarregar, 15000)
    return () => clearInterval(t)
  }, [aoVivo, recarregar])
  const t = dados?.totais
  const serie = useMemo(() => (dados?.por_dia || []).map((d) => ({ ...d, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` })), [dados])
  const horas = (dados?.por_hora || []).map((n, h) => ({ hora: `${String(h).padStart(2, '0')}h`, eventos: n }))
  const ips = (dados?.ips || []).filter((i) => !buscaIp || i.ip.includes(buscaIp) || (i.cidade || '').toLowerCase().includes(buscaIp.toLowerCase()) || (i.pais || '').toLowerCase().includes(buscaIp.toLowerCase()))
  const maxPais = Math.max(1, ...(dados?.paises || []).map((p) => p.eventos))
  const desbloquear = async (id, alvo) => { try { await api.del(`/api/seguranca/ips/${id}`); toast(`${alvo} desbloqueado.`); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const limparAntigos = async () => { try { await api.del('/api/seguranca/eventos?dias=30'); toast('Eventos com mais de 30 dias apagados.'); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const varAtaques = t && t.ataques_periodo_anterior ? Math.round(((t.ataques - t.ataques_periodo_anterior) / t.ataques_periodo_anterior) * 100) : null

  return (
    <>
      <Cabecalho titulo="Segurança" descricao="Quem acessa o sistema, de onde vem, o que o firewall barrou e o que está bloqueado agora."
        acoes={<>
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            {PERIODOS.map(([d, r]) => (
              <button key={d} onClick={() => setDias(d)} className={`relative rounded-md px-3 py-1.5 text-sm ${dias === d ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                {dias === d && <motion.span layoutId="periodo-seg" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', duration: 0.3 }} />}
                <span className="relative">{r}</span>
              </button>
            ))}
          </div>
          <Botao variante="secundario" icone={aoVivo ? Pause : Play} onClick={() => setAoVivo((v) => !v)}>{aoVivo ? 'Ao vivo' : 'Pausado'}</Botao>
          <Exportar dias={dias} />
        </>} />
      {barra}

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-[520px]" /></div>}
      {dados && (
        <div className="grid grid-cols-1 gap-6">
          <FaixaMetricas itens={[
            { rotulo: 'Postura de segurança', valor: t.postura, sufixo: '/100', tom: t.postura >= 80 ? 'bom' : 'ruim', dica: t.postura >= 80 ? 'Sem sinais de ataque persistente' : 'Veja as recomendações no relatório' },
            { rotulo: 'Ataques reais', valor: t.ataques, tom: t.ataques ? 'ruim' : 'bom', dica: varAtaques == null ? `${t.logins_falhos} login(s) recusado(s) · ${t.sem_login} visita(s) sem login` : `${varAtaques > 0 ? '+' : ''}${varAtaques}% vs período anterior` },
            { rotulo: 'Acessos e logins', valor: t.acessos + t.logins_ok, dica: `${t.logins_ok} login(s) aceito(s)` },
            { rotulo: 'Origens', valor: t.ips_unicos, sufixo: ' IPs', dica: `${t.paises} país(es) · ${t.bloqueados_agora} bloqueado(s) agora` },
          ]} />

          <Escudo escudo={escudo} aoMudar={setEscudo} />

          <Checklist />

          <Analise analise={dados.analise} total={t.ips_unicos} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="cartao relative overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div>
                  <h2 className="titulo-secao">Mapa de acessos</h2>
                  <p className="text-xs text-muted-foreground">{dados.pontos.length ? `${dados.pontos.length} local(is) · arcos até o servidor (${dados.servidor.nome})` : 'Os locais aparecem conforme o sistema recebe acessos pela internet'}</p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {CATS.map(([k, r, c]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{r}</span>)}
                </div>
              </div>
              <div className="relative h-[460px] sm:h-[560px]">
                <QuandoPerto reserva={<div className="flex h-full items-center justify-center bg-[#03070d] text-sm text-white/60">Carregando o globo…</div>}> {/* marca: fundo do globo */}
                  <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#03070d] text-sm text-white/60">Carregando o globo…</div>}> {/* marca: efeito de alerta/fundo do globo */}
                    <Globo3D pontos={dados.pontos} servidor={dados.servidor} aoSelecionar={setLocal} ataque={!!escudo?.ativo} />
                  </Suspense>
                </QuandoPerto>
                <AnimatePresence>
                  {local && (
                    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                      className="absolute right-4 top-4 w-64 rounded-xl border border-border bg-card/95 p-4 text-sm shadow-xl backdrop-blur"> {/* marca: cartão flutua */}
                      <button onClick={() => setLocal(null)} className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-3.5 w-3.5" /></button>
                      <p className="flex items-center gap-1.5 font-medium"><MapPin className="h-4 w-4 text-primary" />{local.cidade || 'Local desconhecido'}{local.pais ? `, ${local.pais}` : ''}</p>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><dt className="text-muted-foreground">IPs</dt><dd className="text-base font-semibold tabular">{local.ips}</dd></div>
                        <div><dt className="text-muted-foreground">Acessos</dt><dd className="text-base font-semibold tabular">{local.acesso}</dd></div>
                        <div><dt className="text-muted-foreground">Logins</dt><dd className="text-base font-semibold tabular">{local.login}</dd></div>
                        <div><dt className="text-muted-foreground">Ataques</dt><dd className={`text-base font-semibold tabular ${local.ataque ? 'text-red-600 dark:text-red-400' : ''}`}>{local.ataque}</dd></div>
                      </dl>
                      <p className="mt-2 text-xs text-muted-foreground">Último evento {haQuanto(local.ultimo)} · {local.lat.toFixed(2)}, {local.lon.toFixed(2)}</p>
                      <button onClick={() => setBuscaIp(local.cidade || local.pais || '')} className="mt-3 text-xs text-primary hover:underline">Ver IPs deste local</button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-white/55">Arraste para girar · clique num ponto · dia e noite pela hora real</p>
              </div>
            </section>

            <Secao titulo="Ao vivo" contexto={aoVivo ? 'Atualiza a cada 15 s' : 'Pausado'} acao={<button onClick={recarregar} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Atualizar"><RefreshCw className="h-4 w-4" /></button>}>
              <ul className="-my-2 max-h-[540px] space-y-0 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {dados.recentes.slice(0, 40).map((e) => (
                    <motion.li key={e.id} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-3 border-b border-border py-2.5 last:border-0">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_EVENTO[e.categoria]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex justify-between gap-2 text-sm"><span className="font-medium">{e.rotulo}</span><span className="shrink-0 text-xs text-muted-foreground">{haQuanto(e.quando)}</span></p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{e.ip}{e.cidade || e.pais ? ` · ${[e.cidade, e.pais].filter(Boolean).join(', ')}` : ''}</p>
                        {e.veredito && <p className="text-[11px] text-muted-foreground">{e.veredito}</p>}
                        <p className="truncate text-xs text-muted-foreground">{e.rota}{e.detalhe && e.detalhe.length < 60 ? ` · ${e.detalhe}` : ''}</p>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
                {dados.recentes.length === 0 && <li className="py-10 text-center text-sm text-muted-foreground">Nenhum evento no período.</li>}
              </ul>
            </Secao>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Secao titulo="Eventos por dia" contexto="Acessos, logins e ataques barrados">
              <div className="h-64">
                <ResponsiveContainer><BarChart data={serie} margin={{ left: 0, right: 8 }} maxBarSize={36}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rotulo" {...eixo} minTickGap={10} tickMargin={8} /><YAxis {...eixo} width={30} allowDecimals={false} />
                  <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  {CATS.map(([k, r, c], i) => <Bar key={k} dataKey={k} name={r} stackId="s" fill={c} radius={i === 2 ? [3, 3, 0, 0] : 0} />)}
                </BarChart></ResponsiveContainer>
              </div>
            </Secao>
            <Secao titulo="Horário dos eventos" contexto="Horário de Brasília">
              <div className="h-64">
                <ResponsiveContainer><BarChart data={horas} margin={{ left: 0, right: 0 }} maxBarSize={18}>
                  <XAxis dataKey="hora" {...eixo} interval={3} /><YAxis {...eixo} width={26} allowDecimals={false} />
                  <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="eventos" name="Eventos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart></ResponsiveContainer>
              </div>
            </Secao>
          </div>

          <Secao titulo="IPs" contexto="Ordenados por risco · bloqueie ou libere direto da lista"
            acao={<input value={buscaIp} onChange={(e) => setBuscaIp(e.target.value)} placeholder="Filtrar por IP, cidade ou país" className="campo h-8 w-56 text-sm" aria-label="Filtrar IPs" />}>
            <div className="-mx-5 -my-5 overflow-x-auto">
              <table className="tabela w-full min-w-[1040px]">
                <thead><tr><th>IP</th><th>Local</th><th>Veredito</th><th className="!text-right">Eventos</th><th className="!text-right">Ataques</th><th>Risco</th><th>O que fez</th><th>Último</th><th /></tr></thead>
                <tbody>
                  {ips.slice(0, 100).map((i) => (
                    <tr key={i.ip}>
                      <td className="font-mono text-xs">{i.ip}{i.bloqueado && <span className="ml-2 rounded bg-red-500/15 px-1.5 py-0.5 font-sans text-[11px] text-red-600 dark:text-red-400">bloqueado</span>}</td>
                      <td className="text-muted-foreground">{[i.cidade, i.pais].filter(Boolean).join(', ') || (i.privado ? 'rede local' : '—')}{i.provedor && <p className="text-[11px]">{i.provedor}</p>}</td>
                      <td className="max-w-[240px]" title={i.veredito.motivo + (i.ptr ? ` · ${i.ptr}` : '')}>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${NIVEL[i.veredito.nivel][3]}`}><span className={`h-1.5 w-1.5 rounded-full ${NIVEL[i.veredito.nivel][2]}`} />{i.veredito.rotulo}</span>
                        <p className="truncate text-[11px] text-muted-foreground">{i.veredito.motivo}</p>
                      </td>
                      <td className="text-right tabular">{i.eventos}</td>
                      <td className={`text-right tabular ${i.ataques ? 'text-red-600 dark:text-red-400' : ''}`}>{i.ataques}</td>
                      <td><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${i.risco}%` }} className={`h-full rounded-full ${i.risco >= 60 ? 'bg-red-500' : i.risco >= 25 ? 'bg-amber-500' : 'bg-emerald-500'}`} /></div><span className="text-xs tabular text-muted-foreground">{i.risco}</span></div></td>
                      <td className="max-w-[260px] truncate text-xs text-muted-foreground" title={i.tipos.map((x) => dados.rotulos[x] || x).join(', ')}>{i.tipos.map((x) => dados.rotulos[x] || x).join(', ')}</td>
                      <td className="text-xs text-muted-foreground">{dataHora(i.ultimo)}</td>
                      <td><AcoesIp ip={i.ip} bloqueado={i.bloqueado} aoMudar={recarregar} /></td>
                    </tr>
                  ))}
                  {ips.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum IP no período{buscaIp ? ' com esse filtro' : ''}.</td></tr>}
                </tbody>
              </table>
            </div>
          </Secao>

          <div className="grid gap-6 lg:grid-cols-3">
            <Secao titulo="Países" contexto={`${dados.paises.length} no período`}>
              {dados.paises.length === 0 ? <p className="text-sm text-muted-foreground">Sem país identificado (acessos pela rede local não têm país).</p> : (
                <ul className="space-y-3">{dados.paises.slice(0, 10).map((p, i) => (
                  <li key={p.pais}>
                    <div className="flex justify-between text-sm"><span>{p.nome}</span><span className="tabular text-muted-foreground">{p.eventos}{p.ataques ? ` · ${p.ataques} ataque(s)` : ''}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={`h-full rounded-full ${p.ataques ? 'bg-red-500' : 'bg-primary'}`} initial={{ width: 0 }} animate={{ width: `${(p.eventos / maxPais) * 100}%` }} transition={{ delay: i * 0.04 }} /></div>
                  </li>
                ))}</ul>
              )}
            </Secao>
            <Secao titulo="Rotas mais atacadas" contexto="Onde as ferramentas tentaram entrar">
              {dados.rotas_atacadas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma tentativa no período.</p> : (
                <ul className="divide-y divide-border">{dados.rotas_atacadas.map((r) => <li key={r.rota} className="flex justify-between gap-3 py-2 text-sm"><code className="truncate font-mono text-xs">{r.rota}</code><span className="tabular text-muted-foreground">{r.n}</span></li>)}</ul>
              )}
            </Secao>
            <Secao titulo="Bloqueados agora" contexto={`${dados.bloqueados.length} IP(s) ou faixa(s)`}>
              {dados.bloqueados.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" />Nenhum bloqueio ativo.</p> : (
                <ul className="divide-y divide-border">{dados.bloqueados.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2 text-sm">
                    <div className="min-w-0 flex-1"><p className="font-mono text-xs">{b.alvo}</p><p className="truncate text-xs text-muted-foreground">{b.motivo || 'sem motivo'} · {b.expira_em ? `até ${dataHora(b.expira_em)}` : 'permanente'}</p></div>
                    <button onClick={() => desbloquear(b.id, b.alvo)} className="rounded-md px-2 py-1 text-xs text-primary hover:bg-muted">Desbloquear</button>
                  </li>
                ))}</ul>
              )}
            </Secao>
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold">Regras, listas e eventos</h2>
            <PainelSeguranca />
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 break-words rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <span>A localização vem do IP (borda da Vercel) e é aproximada. Acessos são registrados uma vez por IP a cada 10 minutos; eventos com mais de 30 dias são apagados pela rotina diária.</span>
            <Botao variante="secundario" tamanho="sm" icone={Trash2} onClick={limparAntigos}>Apagar eventos com mais de 30 dias</Botao>
          </div>
        </div>
      )}
    </>
  )
}
