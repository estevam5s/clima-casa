import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, Cloud, Cpu, Download, Globe, Laptop, Pause, Play, Radio, Router, Server, ShieldCheck, Tv, Video, Wifi } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Botao, Secao, Selo } from '../ui'

// Recursos da tela Rede que rodam no navegador (sem precisar do agente): monitor ao vivo, mapa da rede, dados da
// conexão e calculadora. Tudo medido contra speed.cloudflare.com e contra o próprio painel (/saude), os únicos
// endereços que a política de segurança da página libera.
const CF = 'https://speed.cloudflare.com'
const DICA = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }
const agora = () => performance.now()
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10)

async function medirUma(alvo) {
  const url = alvo === 'painel' ? `/saude?r=${Math.random()}` : `${CF}/__down?bytes=0&r=${Math.random()}`
  const ctl = new AbortController(), limite = setTimeout(() => ctl.abort(), 3000)
  const t0 = agora()
  try { const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); await r.arrayBuffer(); return agora() - t0 } catch { return null } finally { clearTimeout(limite) }
}

// ------------------------------------------------------------------ monitor ao vivo
export function MonitorAoVivo() {
  const [rodando, setRodando] = useState(false)
  const [pontos, setPontos] = useState([])
  const [alvo, setAlvo] = useState('internet')
  const ref = useRef({ vivo: false })
  const parado = useReducedMotion()
  useEffect(() => () => { ref.current.vivo = false }, [])
  const iniciar = async () => {
    setPontos([]); setRodando(true); ref.current.vivo = true
    for (let i = 0; i < 120 && ref.current.vivo; i++) {
      const ms = await medirUma(alvo)
      setPontos((p) => [...p, { i: i + 1, ms: ms == null ? null : r1(ms), perdido: ms == null }])
      await new Promise((ok) => setTimeout(ok, 1000))
    }
    ref.current.vivo = false; setRodando(false)
  }
  const parar = () => { ref.current.vivo = false; setRodando(false) }
  const validos = pontos.filter((p) => p.ms != null).map((p) => p.ms)
  const media = validos.length ? validos.reduce((a, b) => a + b, 0) / validos.length : null
  const jitter = validos.length > 1 ? validos.slice(1).reduce((s, v, i) => s + Math.abs(v - validos[i]), 0) / (validos.length - 1) : null
  const perda = pontos.length ? (pontos.filter((p) => p.perdido).length / pontos.length) * 100 : null
  const picos = validos.filter((v) => media && v > media * 2.5).length
  const ultimo = pontos.at(-1)
  return (
    <Secao semPadding titulo="Monitor ao vivo" contexto="Uma medida por segundo durante 2 minutos: mostra quedas, picos e instabilidade que um teste rápido não pega"
      acao={<div className="flex items-center gap-2">
        <select className="campo h-9 w-auto text-sm" value={alvo} onChange={(e) => setAlvo(e.target.value)} disabled={rodando} aria-label="O que medir">
          <option value="internet">Internet (Cloudflare)</option><option value="painel">Este painel (servidor)</option>
        </select>
        {rodando ? <Botao tamanho="sm" variante="secundario" icone={Pause} onClick={parar}>Parar</Botao> : <Botao tamanho="sm" icone={Play} onClick={iniciar}>Começar</Botao>}
      </div>}>
      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-5">
        {[['Agora', ultimo ? (ultimo.perdido ? 'sem resposta' : `${ultimo.ms} ms`) : '—'], ['Média', media ? `${r1(media)} ms` : '—'], ['Variação', jitter ? `${r1(jitter)} ms` : '—'],
          ['Sem resposta', perda != null ? `${r1(perda)}%` : '—'], ['Picos', validos.length ? String(picos) : '—']].map(([r, v], k) => (
          <div key={r} className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{r}</p>
            <p className={`mt-1 text-lg font-semibold tabular ${k === 0 && rodando ? 'text-primary' : ''}`}>{v}</p>
          </div>
        ))}
      </div>
      <div className="relative h-60 p-3">
        {!pontos.length && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{rodando ? 'Medindo…' : 'Clique em Começar. Deixe a aba aberta durante a medição.'}</div>}
        {pontos.length > 0 && (
          <ResponsiveContainer>
            <AreaChart data={pontos} margin={{ left: -14, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="i" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit=" ms" width={56} />
              <Tooltip contentStyle={DICA} formatter={(v, k, p) => [p.payload.perdido ? 'sem resposta' : `${v} ms`, 'Latência']} labelFormatter={(l) => `${l}º segundo`} />
              {media && <ReferenceLine y={r1(media)} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: 'média', fontSize: 10, fill: 'hsl(var(--muted-foreground))', position: 'right' }} />}
              <Area type="monotone" dataKey="ms" stroke="hsl(var(--primary))" strokeWidth={2} fill="hsl(var(--primary))" fillOpacity={0.12} isAnimationActive={false} connectNulls={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {rodando && !parado && <motion.span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-red-500" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }} aria-hidden />}
      </div>
      <p className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">Mede deste navegador. Picos são medidas mais de 2,5 vezes acima da média (Wi-Fi fraco, download em outro aparelho, rede congestionada).</p>
    </Secao>
  )
}

// ------------------------------------------------------------------ mapa da rede (animado)
function Pacote({ d, cor, atraso, dur }) {
  const parado = useReducedMotion()
  if (parado) return null
  return (
    <circle r="3.2" fill={cor}>
      <animateMotion dur={`${dur}s`} repeatCount="indefinite" begin={`${atraso}s`} path={d} />
    </circle>
  )
}

export function MapaRede({ ultimoNav, ultimoAgente }) {
  const [dados, setDados] = useState(null)
  useEffect(() => {
    Promise.all([api.get('/api/agentes').catch(() => null), api.get('/api/hubs').catch(() => [])]).then(([ag, hubs]) => setDados({ ag, hubs: Array.isArray(hubs) ? hubs : [] }))
  }, [])
  const maquinas = dados?.ag?.maquinas || []
  const principal = maquinas.find((m) => m.principal) || maquinas.find((m) => m.online)
  const hubs = (dados?.hubs || []).slice(0, 8)
  const latTx = Object.fromEntries((ultimoAgente?.transmissores || []).map((t) => [t.nome, t.ms]))
  const W = 760, H = 330
  const nos = {
    voce: { x: 70, y: 70, t: 'Você', s: ultimoNav?.latencia ? `${ultimoNav.latencia} ms até a internet` : 'este navegador', I: Laptop },
    nuvem: { x: 300, y: 70, t: 'Internet e Cloudflare', s: ultimoNav?.colo ? `servidor ${ultimoNav.colo}` : 'zynio.com.br', I: Cloud },
    painel: { x: 530, y: 70, t: 'Painel (Vercel)', s: 'app.zynio.com.br', I: Server },
    agente: { x: 300, y: 200, t: principal ? (principal.nome || principal.id) : 'Agente do escritório', s: !dados ? 'carregando…' : principal ? (principal.online ? (principal.ve_transmissores === 0 ? 'online, sem ver os transmissores' : 'no comando, online') : 'offline') : 'nenhum online', I: Cpu },
    roteador: { x: 120, y: 280, t: 'Roteador do escritório', s: ultimoAgente?.ip_local ? `rede ${ultimoAgente.ip_local}` : 'rede local', I: Router },
  }
  const larg = hubs.length ? Math.min(110, 400 / hubs.length) : 0
  const hubsPos = hubs.map((h, i) => ({ ...h, x: 340 + i * larg, y: 290 }))
  const curva = (a, b) => `M ${a.x} ${a.y} C ${a.x} ${(a.y + b.y) / 2}, ${b.x} ${(a.y + b.y) / 2}, ${b.x} ${b.y}`
  const reta = (a, b) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`
  const corLat = (ms) => (ms == null ? 'hsl(var(--muted-foreground))' : ms < 40 ? '#059669' : ms < 100 ? '#d97706' : '#dc2626')
  const ligacoes = [
    { d: reta(nos.voce, nos.nuvem), cor: corLat(ultimoNav?.latencia), on: true },
    { d: reta(nos.nuvem, nos.painel), cor: '#059669', on: true },
    { d: curva(nos.nuvem, nos.agente), cor: principal?.online ? corLat(ultimoAgente?.latencia) : '#dc2626', on: !!principal?.online },
    { d: curva(nos.agente, nos.roteador), cor: principal?.online ? '#059669' : '#94a3b8', on: !!principal?.online },
    ...hubsPos.map((h) => ({ d: curva(nos.agente, h), cor: h.online ? corLat(latTx[h.nome]) : '#dc2626', on: !!h.online && !!principal?.online })),
  ]
  return (
    <Secao semPadding titulo="Mapa da rede" contexto="O caminho de um comando: do seu navegador até cada transmissor. Os pontos andando são o tráfego; a cor é a latência (verde boa, âmbar média, vermelho ruim ou fora do ar)">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + 30}`} className="mx-auto block w-full min-w-[640px] max-w-4xl" role="img" aria-label="Mapa da rede">
          {ligacoes.map((l, i) => (
            <g key={i}>
              <path d={l.d} fill="none" stroke={l.cor} strokeOpacity={l.on ? 0.55 : 0.3} strokeWidth="2" strokeDasharray={l.on ? undefined : '5 5'} />
              {l.on && <><Pacote d={l.d} cor={l.cor} atraso={(i * 0.37) % 2} dur={2.4} /><Pacote d={l.d} cor={l.cor} atraso={(i * 0.37 + 1.2) % 2.4} dur={2.4} /></>}
            </g>
          ))}
          {Object.entries(nos).map(([k, n]) => (
            <g key={k} transform={`translate(${n.x}, ${n.y})`}>
              <circle r="24" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
              <foreignObject x="-10" y="-10" width="20" height="20"><n.I className="h-5 w-5 text-foreground" /></foreignObject>
              <text y="40" textAnchor="middle" fontSize="12" fontWeight="600" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="5" paintOrder="stroke">{n.t.length > 26 ? `${n.t.slice(0, 26)}…` : n.t}</text>
              <text y="54" textAnchor="middle" fontSize="10.5" fill="hsl(var(--muted-foreground))" stroke="hsl(var(--card))" strokeWidth="5" paintOrder="stroke">{n.s}</text>
            </g>
          ))}
          {hubsPos.map((h) => (
            <g key={h.id} transform={`translate(${h.x}, ${h.y})`}>
              <circle r="15" fill="hsl(var(--card))" stroke={h.online ? '#059669' : '#dc2626'} strokeWidth="1.8" />
              <foreignObject x="-7" y="-7" width="14" height="14"><Radio className="h-3.5 w-3.5 text-foreground" /></foreignObject>
              <text y="30" textAnchor="middle" fontSize="10" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="4" paintOrder="stroke">{(h.nome || '').slice(0, 14)}</text>
              <text y="42" textAnchor="middle" fontSize="9.5" fill="hsl(var(--muted-foreground))" stroke="hsl(var(--card))" strokeWidth="4" paintOrder="stroke">{latTx[h.nome] != null ? `${latTx[h.nome]} ms` : h.online ? 'online' : 'offline'}</text>
            </g>
          ))}
          {!hubs.length && dados && <text x="560" y="290" textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">Nenhum transmissor cadastrado</text>}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
        {!dados ? <span>Carregando os agentes e os transmissores…</span> : <span>{maquinas.filter((m) => m.online).length} de {maquinas.length} computador(es) com o agente online</span>}
        <span>{hubs.filter((h) => h.online).length} de {(dados?.hubs || []).length} transmissor(es) online</span>
        {ultimoAgente?.quando && <span>latência dos transmissores: teste do escritório {haQuanto(ultimoAgente.quando)}</span>}
      </div>
    </Secao>
  )
}

// ------------------------------------------------------------------ dados da conexão
export function Conexao() {
  const [trace, setTrace] = useState(null)
  const [eventos, setEventos] = useState(() => [{ t: Date.now(), on: navigator.onLine }])
  const [rede, setRede] = useState(() => navigator.connection ? { tipo: navigator.connection.effectiveType, down: navigator.connection.downlink, rtt: navigator.connection.rtt, economia: navigator.connection.saveData } : null)
  const [painelMs, setPainelMs] = useState(null)
  useEffect(() => {
    fetch(`${CF}/cdn-cgi/trace`, { cache: 'no-store' }).then((r) => r.text()).then((t) => setTrace(Object.fromEntries(t.trim().split('\n').map((l) => l.split('='))))).catch(() => setTrace({}))
    Promise.all([medirUma('painel'), medirUma('painel'), medirUma('painel')]).then((l) => { const v = l.filter((x) => x != null); setPainelMs(v.length ? r1(Math.min(...v)) : null) })
    const on = () => setEventos((e) => [{ t: Date.now(), on: true }, ...e].slice(0, 8)), off = () => setEventos((e) => [{ t: Date.now(), on: false }, ...e].slice(0, 8))
    window.addEventListener('online', on); window.addEventListener('offline', off)
    const c = navigator.connection, mud = () => setRede({ tipo: c.effectiveType, down: c.downlink, rtt: c.rtt, economia: c.saveData })
    c?.addEventListener?.('change', mud)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); c?.removeEventListener?.('change', mud) }
  }, [])
  const ipv6 = trace?.ip?.includes(':')
  const linhas = [
    ['IP público', trace?.ip || '…', Globe], ['Versão do IP', trace?.ip ? (ipv6 ? 'IPv6' : 'IPv4') : '…', Globe],
    ['Protocolo', trace?.http ? trace.http.replace('http/', 'HTTP/').toUpperCase() : '…', Activity], ['Criptografia', trace?.tls || '…', ShieldCheck],
    ['Servidor da Cloudflare', trace?.colo ? `${trace.colo}${trace.loc ? ` (${trace.loc})` : ''}` : '…', Cloud], ['Cloudflare WARP', trace?.warp ? (trace.warp === 'off' ? 'desligado' : 'ligado') : '…', ShieldCheck],
    ['Resposta do painel', painelMs != null ? `${painelMs} ms` : '…', Server], ['Tipo de conexão (navegador)', rede ? `${(rede.tipo || '').toUpperCase()}${rede.down ? ` · ~${rede.down} Mbps` : ''}${rede.rtt ? ` · ~${rede.rtt} ms` : ''}` : 'o navegador não informa', Wifi],
  ]
  return (
    <Secao semPadding titulo="Esta conexão" contexto="O que o navegador e a Cloudflare dizem sobre a sua conexão agora">
      <dl className="grid gap-px bg-border sm:grid-cols-2">
        {linhas.map(([r, v, I], i) => (
          <motion.div key={r} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="flex items-center gap-3 bg-card px-4 py-3">
            <I className="h-4 w-4 shrink-0 text-muted-foreground" />
            <dt className="flex-1 text-sm text-muted-foreground">{r}</dt>
            <dd className="max-w-[55%] truncate text-right text-sm font-medium tabular" title={v}>{v}</dd>
          </motion.div>
        ))}
      </dl>
      <div className="border-t border-border px-4 py-3">
        <p className="mb-1.5 text-xs font-medium">Quedas desde que a tela abriu</p>
        <ul className="flex flex-wrap gap-1.5 text-xs">
          {eventos.map((e) => <li key={e.t}><Selo cor={e.on ? 'verde' : 'vermelho'}>{e.on ? 'conectado' : 'sem internet'} · {new Date(e.t).toLocaleTimeString('pt-BR')}</Selo></li>)}
        </ul>
        {rede?.economia && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">A economia de dados está ligada neste aparelho.</p>}
      </div>
    </Secao>
  )
}

// ------------------------------------------------------------------ calculadora: o que essa internet aguenta
const ARQUIVOS = [['Instalador do app (100 MB)', 100], ['Atualização do sistema (1 GB)', 1024], ['ISO do Windows (5 GB)', 5120], ['Backup do escritório (20 GB)', 20480]]
const tempoDe = (mb, mbps) => {
  if (!mbps) return '—'
  const s = (mb * 8) / mbps
  if (s < 60) return `${Math.max(1, Math.round(s))} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`
}
export function Calculadora({ ultimoNav, ultimoAgente }) {
  const [fonte, setFonte] = useState(ultimoAgente ? 'agente' : 'navegador')
  const r = fonte === 'agente' ? ultimoAgente : ultimoNav
  const [manual, setManual] = useState('')
  const down = Number(manual) || r?.download || 0, up = r?.upload || 0
  const usos = useMemo(() => [
    ['Chamadas de vídeo em HD ao mesmo tempo', Math.floor(Math.min(down / 3.8, up ? up / 3 : Infinity)), Video],
    ['Vídeos em 4K ao mesmo tempo', Math.floor(down / 25), Tv],
    ['Pessoas trabalhando na nuvem (e-mail, planilhas)', Math.floor(down / 1.5), Laptop],
  ], [down, up])
  return (
    <Secao semPadding titulo="O que esta internet aguenta" contexto="Contas com a velocidade medida (ou digite outra para comparar)"
      acao={<div className="flex items-center gap-2">
        <select className="campo h-9 w-auto text-sm" value={fonte} onChange={(e) => { setFonte(e.target.value); setManual('') }} aria-label="Qual medida usar">
          <option value="navegador">Este computador</option><option value="agente">Rede do escritório</option>
        </select>
        <input className="campo h-9 w-28 text-sm" inputMode="decimal" placeholder="Mbps" value={manual} onChange={(e) => setManual(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} aria-label="Outra velocidade em Mbps" />
      </div>}>
      {!down ? <p className="p-5 text-sm text-muted-foreground">Rode um teste de velocidade (aba Velocidade) ou digite uma velocidade em Mbps.</p> : (
        <div className="grid gap-6 p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo para baixar a {down.toLocaleString('pt-BR')} Mbps</p>
            <ul className="space-y-2">
              {ARQUIVOS.map(([n, mb], i) => (
                <li key={n} className="flex items-center gap-3 text-sm">
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="flex-1">{n}</span>
                  <motion.span key={`${n}-${down}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="font-semibold tabular">{tempoDe(mb, down)}</motion.span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ao mesmo tempo, com folga</p>
            <ul className="space-y-3">
              {usos.map(([n, v, I]) => (
                <li key={n}>
                  <div className="flex items-center gap-3 text-sm"><I className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="flex-1">{n}</span><span className="font-semibold tabular">{Number.isFinite(v) ? v : '—'}</span></div>
                  <span className="ml-7 mt-1 block h-1.5 overflow-hidden rounded-full bg-muted"><motion.span className="block h-full rounded-full bg-primary/70" initial={{ width: 0 }} animate={{ width: `${Math.min(100, (Number.isFinite(v) ? v : 0) * 4)}%` }} transition={{ duration: 0.6 }} /></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">Referências: chamada em HD usa ~3,8 Mbps para baixar e ~3 para enviar; 4K usa ~25 Mbps. São estimativas, não promessa do provedor.</p>
          </div>
        </div>
      )}
    </Secao>
  )
}
