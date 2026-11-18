import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, Building2, Gamepad2, Gauge, Laptop, Radio, Timer, Tv, Video, Waves } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, Selo, useToast } from '../components/ui'

// Teste de velocidade (como o speed.cloudflare.com): do computador de quem abriu o painel (o navegador mede) e da rede do
// escritório (o agente mede e também o tempo de resposta de cada transmissor). Servidor de medição: speed.cloudflare.com.
const BASE = 'https://speed.cloudflare.com'
const agora = () => performance.now()
const mbps = (bytes, ms) => Math.round((bytes * 8) / Math.max(ms, 1) / 1000 * 100) / 100   // bytes em ms → Mbps
const mediana = (l) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10)

function lerL4(h) {
  const m = /cfL4;desc="\?([^"]+)"/.exec(h.get('server-timing') || '')
  if (!m) return null
  const kv = Object.fromEntries(m[1].split('&').map((x) => x.split('=')))
  return { enviados: +kv.sent || 0, perdidos: +kv.lost || 0 }
}

// medição no navegador: latência (20), download crescente com leitura em fluxo (velocidade ao vivo), latência com carga,
// upload crescente. aoProgresso({ fase, mbps, pct }) atualiza o velocímetro.
async function medirNavegador(aoProgresso, cancelado) {
  const r = {}
  const lat = []
  for (let i = 0; i < 20 && !cancelado(); i++) {
    const t0 = agora()
    const resp = await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' })
    await resp.arrayBuffer(); lat.push(agora() - t0)
    if (!r.ip) Object.assign(r, { ip: resp.headers.get('cf-meta-ip'), colo: resp.headers.get('cf-meta-colo'), cidade: resp.headers.get('cf-meta-city'), pais: resp.headers.get('cf-meta-country'), asn: resp.headers.get('cf-meta-asn') ? `AS${resp.headers.get('cf-meta-asn')}` : null })
    aoProgresso({ fase: 'latencia', pct: (i + 1) / 20 * 100, ms: lat[lat.length - 1] })
  }
  const ord = [...lat].sort((a, b) => a - b), base = ord.slice(0, Math.max(5, Math.floor(ord.length / 2)))
  r.latencia = r1(mediana(base)); r.latencia_min = r1(ord[0])
  r.jitter = r1(lat.slice(1).reduce((s, v, i) => s + Math.abs(v - lat[i]), 0) / Math.max(1, lat.length - 1))
  const rtt = (r.latencia || 0)
  // download
  const amostras = [], carga = []
  let pingando = false, l4 = null
  const pingar = async () => { pingando = true; while (pingando && !cancelado()) { const t0 = agora(); try { const x = await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store' }); await x.arrayBuffer(); carga.push(agora() - t0) } catch { /* segue */ } await new Promise((ok) => setTimeout(ok, 250)) } }
  for (const n of [100e3, 1e6, 10e6, 25e6, 50e6]) {
    if (cancelado()) break
    if (n >= 10e6 && !pingando) pingar()
    const t0 = agora()
    const resp = await fetch(`${BASE}/__down?bytes=${n}&r=${Math.random()}`, { cache: 'no-store' })
    l4 = lerL4(resp.headers) || l4
    const leitor = resp.body.getReader()
    let recebido = 0, ultimo = agora(), ultRec = 0
    for (;;) {
      const { done, value } = await leitor.read()
      if (done) break
      recebido += value.length
      const t = agora()
      if (t - ultimo > 200) { aoProgresso({ fase: 'download', mbps: mbps(recebido - ultRec, t - ultimo), pct: recebido / n * 100 }); ultimo = t; ultRec = recebido }
    }
    const dur = agora() - t0 - rtt
    if (n >= 1e6) amostras.push(mbps(recebido, dur))
    if (dur > 4000) break
  }
  pingando = false
  r.download = amostras.length ? r1(mediana([...amostras].sort((a, b) => a - b).slice(-3))) : null
  r.latencia_carga = carga.length ? r1(mediana(carga)) : null
  if (l4?.enviados) r.perda_pct = Math.round(l4.perdidos / l4.enviados * 10000) / 100
  aoProgresso({ fase: 'download', mbps: r.download, pct: 100 })
  // upload
  const up = []
  for (const n of [100e3, 1e6, 5e6, 10e6]) {
    if (cancelado()) break
    const corpo = new Uint8Array(n)
    const t0 = agora()
    await fetch(`${BASE}/__up?r=${Math.random()}`, { method: 'POST', body: corpo, cache: 'no-store' })
    const dur = agora() - t0 - rtt
    if (n >= 1e6) { up.push(mbps(n, dur)); aoProgresso({ fase: 'upload', mbps: up[up.length - 1], pct: 100 }) }
    if (dur > 4000) break
  }
  r.upload = up.length ? r1(mediana([...up].sort((a, b) => a - b).slice(-3))) : null
  r.navegador = navigator.userAgent.slice(0, 120)
  r.conexao = navigator.connection?.effectiveType || null
  return r
}

// velocímetro (escala logarítmica até 1 Gbps)
function Velocimetro({ valor, fase }) {
  const parado = useReducedMotion()
  const v = Math.max(0, valor || 0), k = Math.min(1, Math.log10(1 + v) / Math.log10(1001))
  const ang = -120 + k * 240
  const marcas = [0, 5, 10, 50, 100, 250, 500, 1000]
  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-sm">
      <svg viewBox="0 0 200 150" className="h-full w-full" role="img" aria-label={`${v.toLocaleString('pt-BR')} Mbps`}>
        <path d="M 30 125 A 80 80 0 1 1 170 125" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" strokeLinecap="round" />
        <motion.path d="M 30 125 A 80 80 0 1 1 170 125" fill="none" stroke={fase === 'upload' ? '#7c3aed' : 'hsl(var(--primary))'} strokeWidth="12" strokeLinecap="round"
          pathLength={1} initial={false} animate={{ pathLength: Math.max(0.001, k) }} transition={{ duration: parado ? 0 : 0.35 }} />
        {marcas.map((m) => { const kk = Math.log10(1 + m) / Math.log10(1001), a = (-120 + kk * 240 - 90) * Math.PI / 180; return <text key={m} x={100 + Math.cos(a) * 62} y={95 + Math.sin(a) * 62} fontSize="7" textAnchor="middle" fill="hsl(var(--muted-foreground))">{m}</text> })}
        <motion.line x1="100" y1="95" x2="100" y2="35" stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" style={{ originX: '100px', originY: '95px' }}
          initial={false} animate={{ rotate: ang }} transition={{ duration: parado ? 0 : 0.35 }} />
        <circle cx="100" cy="95" r="5" fill="hsl(var(--foreground))" />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <p className="text-3xl font-semibold tabular">{v ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'}<span className="ml-1 text-sm font-normal text-muted-foreground">Mbps</span></p>
      </div>
    </div>
  )
}

const ROT_Q = { boa: ['Boa', 'verde'], razoavel: ['Razoável', 'ambar'], ruim: ['Ruim', 'vermelho'] }
function Resultado({ r, titulo, icone: I }) {
  if (!r) return null
  const itens = [
    ['Download', r.download, 'Mbps', ArrowDown], ['Upload', r.upload, 'Mbps', ArrowUp], ['Latência', r.latencia, 'ms', Timer],
    ['Variação (jitter)', r.jitter, 'ms', Waves], ['Latência com carga', r.latencia_carga, 'ms', Gauge], ['Perda de pacotes (TCP)', r.perda_pct, '%', Radio],
  ]
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-2">
        <I className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-muted-foreground">{r.quem ? `${r.quem} · ` : ''}{r.quando ? haQuanto(r.quando) : 'agora'}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        {itens.map(([n, v, u, Ic]) => (
          <div key={n}><dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ic className="h-3.5 w-3.5" />{n}</dt>
            <dd className="mt-1 text-xl font-semibold tabular">{v == null ? '—' : v.toLocaleString('pt-BR')}<span className="ml-1 text-xs font-normal text-muted-foreground">{v == null ? '' : u}</span></dd></div>
        ))}
      </dl>
      {r.qualidade && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3 text-xs">
          {[['video_4k', 'Vídeo em 4K', Tv], ['chamadas', 'Chamadas de vídeo', Video], ['jogos', 'Jogos online', Gamepad2]].map(([k, n, Ic]) => (
            <span key={k} className="inline-flex items-center gap-1.5"><Ic className="h-3.5 w-3.5 text-muted-foreground" />{n}: <Selo cor={ROT_Q[r.qualidade[k]]?.[1] || 'cinza'}>{ROT_Q[r.qualidade[k]]?.[0] || '—'}</Selo></span>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        IP público {r.ip || '—'}{r.ip_local ? ` · IP local ${r.ip_local}` : ''}{r.asn ? ` · provedor ${r.asn}` : ''}{r.colo ? ` · servidor ${r.colo}` : ''}{r.cidade ? ` · ${r.cidade}` : ''}{r.dns_ms != null ? ` · DNS ${r.dns_ms} ms` : ''}{r.conexao ? ` · conexão ${r.conexao}` : ''}
      </p>
      {r.transmissores?.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-xs font-medium">Transmissores na rede do escritório (porta 6668)</p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">{r.transmissores.map((t) => (
            <li key={t.nome} className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"><span>{t.nome}<span className="ml-1 text-muted-foreground">{t.ip}</span></span>
              {t.ms != null ? <Selo cor={t.ms < 50 ? 'verde' : 'ambar'}>{t.ms} ms</Selo> : <Selo cor="vermelho">sem resposta</Selo>}</li>))}
          </ul>
        </div>
      )}
    </section>
  )
}

export default function Rede() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const [hist, setHist] = useState(null)
  const [erro, setErro] = useState('')
  const [rodando, setRodando] = useState('')
  const [prog, setProg] = useState({ fase: '', mbps: 0, pct: 0 })
  const [serie, setSerie] = useState([])
  const [meu, setMeu] = useState(null)
  const cancelar = useRef(false)
  const carregar = () => api.get('/api/infra/rede/historico').then((d) => setHist(d.historico)).catch((e) => setErro(e.message))
  useEffect(() => { carregar(); return () => { cancelar.current = true } }, [])
  const ultimoAgente = useMemo(() => (hist || []).find((h) => h.origem === 'agente'), [hist])
  const ultimoNav = useMemo(() => meu || (hist || []).find((h) => h.origem === 'navegador'), [hist, meu])
  const pode = ['dono', 'admin'].includes(sessao?.papel)

  const testarNavegador = async () => {
    setRodando('navegador'); setSerie([]); cancelar.current = false
    try {
      const r = await medirNavegador((p) => { setProg(p); if (p.mbps) setSerie((s) => [...s.slice(-80), { i: s.length, [p.fase]: p.mbps }]) }, () => cancelar.current)
      const salvo = await api.post('/api/infra/rede/resultado', r)
      setMeu(salvo); carregar(); toast('Teste deste computador concluído.')
    } catch (e) { toast(`Não deu para medir: ${e.message}`, 'erro') } finally { setRodando(''); setProg({ fase: '', mbps: 0, pct: 0 }) }
  }
  const testarAgente = async () => {
    setRodando('agente')
    try { await api.post('/api/infra/rede/teste'); await carregar(); toast('Teste da rede do escritório concluído.') }
    catch (e) { toast(e.message, 'erro') } finally { setRodando('') }
  }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!hist) return <Carregando />
  const grafico = [...hist].reverse().map((h) => ({ quando: new Date(h.quando * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), [`down_${h.origem}`]: h.download, [`up_${h.origem}`]: h.upload }))
  return (
    <>
      <Cabecalho titulo="Rede e velocidade" descricao="Velocidade de download e upload, latência, variação, latência com carga e perda: deste computador e da internet do escritório (pelo agente), com o tempo de resposta de cada transmissor." />
      {!pode && <div className="mb-4"><Aviso tipo="alerta">Só o dono e os administradores rodam e veem os testes.</Aviso></div>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="cartao p-5">
          <Velocimetro valor={rodando === 'navegador' ? prog.mbps : ultimoNav?.download} fase={prog.fase} />
          <p className="mt-2 text-center text-sm text-muted-foreground" aria-live="polite">
            {rodando === 'navegador' ? ({ latencia: 'Medindo a latência…', download: 'Medindo o download…', upload: 'Medindo o upload…' }[prog.fase] || 'Preparando…') : rodando === 'agente' ? 'O agente do escritório está medindo (20 a 40 s)…' : 'Pronto para testar'}
          </p>
          {rodando === 'navegador' && <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, prog.pct || 0)}%` }} /></div>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Botao icone={Laptop} carregando={rodando === 'navegador'} disabled={!!rodando || !pode} onClick={testarNavegador}>Testar este computador</Botao>
            <Botao variante="secundario" icone={Building2} carregando={rodando === 'agente'} disabled={!!rodando || !pode} onClick={testarAgente}>Testar a rede do escritório</Botao>
          </div>
          {serie.length > 2 && (
            <div className="mt-4 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={serie}><Area type="monotone" dataKey="download" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} isAnimationActive={false} /><Area type="monotone" dataKey="upload" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} isAnimationActive={false} /></AreaChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Servidor de medição: speed.cloudflare.com (o mais perto de você). O teste baixa e envia até ~80 MB. “Perda” vem da conexão TCP usada no teste.</p>
        </section>
        <div className="space-y-6">
          <Resultado r={ultimoNav} titulo="Este computador" icone={Laptop} />
          <Resultado r={ultimoAgente} titulo="Rede do escritório (agente)" icone={Building2} />
          {!ultimoNav && !ultimoAgente && <Aviso tipo="alerta">Nenhum teste ainda. Rode um dos dois ao lado.</Aviso>}
        </div>
      </div>

      {hist.length > 1 && (
        <section className="cartao mt-6 p-5">
          <h2 className="text-sm font-semibold">Histórico</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafico}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="quando" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" unit=" Mb" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Line dataKey="down_agente" name="Download · escritório" stroke="hsl(var(--primary))" connectNulls dot={{ r: 3 }} strokeWidth={2} />
                <Line dataKey="up_agente" name="Upload · escritório" stroke="#7c3aed" connectNulls dot={{ r: 3 }} strokeWidth={2} />
                <Line dataKey="down_navegador" name="Download · computadores" stroke="hsl(var(--primary))" strokeDasharray="4 3" connectNulls dot={{ r: 3 }} />
                <Line dataKey="up_navegador" name="Upload · computadores" stroke="#7c3aed" strokeDasharray="4 3" connectNulls dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-2 font-medium">Quando</th><th className="font-medium">Onde</th><th className="font-medium">Download</th><th className="font-medium">Upload</th><th className="font-medium">Latência</th><th className="font-medium">Jitter</th><th className="font-medium">Com carga</th></tr></thead>
              <tbody className="divide-y divide-border">{hist.slice(0, 20).map((h) => (
                <tr key={`${h.quando}-${h.origem}`}><td className="py-2 text-xs text-muted-foreground">{haQuanto(h.quando)}</td><td>{h.origem === 'agente' ? 'Escritório' : 'Computador'} <span className="text-xs text-muted-foreground">{h.quem}</span></td>
                  <td className="tabular">{h.download ?? '—'} Mbps</td><td className="tabular">{h.upload ?? '—'} Mbps</td><td className="tabular">{h.latencia ?? '—'} ms</td><td className="tabular">{h.jitter ?? '—'} ms</td><td className="tabular">{h.latencia_carga ?? '—'} ms</td></tr>))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
