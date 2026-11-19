import { useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BellRing, Download, Globe2, ListTree, Network, Router, Server, Trash2, Wifi } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Interruptor, Selo, useToast, confirmar } from '../ui'

// Partes avançadas da tela Rede: nota de bufferbloat, teste de estabilidade (navegador), diagnóstico completo (agente),
// agenda com alertas, médias e exportação. Tudo medido; o que não deu para medir aparece como "—".
const BASE = 'https://speed.cloudflare.com'

// nota pela latência a mais quando a linha está ocupada (escala usada pelos testes públicos de bufferbloat)
export function notaBufferbloat(r) {
  if (r?.latencia == null || r?.latencia_carga == null) return null
  const extra = Math.max(0, r.latencia_carga - r.latencia)
  const [nota, cor] = extra < 5 ? ['A+', 'verde'] : extra < 30 ? ['A', 'verde'] : extra < 60 ? ['B', 'verde'] : extra < 200 ? ['C', 'ambar'] : extra < 400 ? ['D', 'vermelho'] : ['F', 'vermelho']
  return { nota, cor, extra: Math.round(extra) }
}

export function Bufferbloat({ r }) {
  const b = notaBufferbloat(r)
  if (!b) return null
  return <span className="inline-flex items-center gap-1.5 text-xs">Bufferbloat: <Selo cor={b.cor}>{b.nota}</Selo><span className="text-muted-foreground">+{b.extra} ms com a linha ocupada</span></span>
}

// ---------- estabilidade: 60 s de medidas de latência pelo navegador ----------
export function Estabilidade({ pode }) {
  const [pontos, setPontos] = useState([])
  const [rodando, setRodando] = useState(false)
  const [dur, setDur] = useState(60)
  const parar = useRef(false)
  useEffect(() => () => { parar.current = true }, [])
  const iniciar = async () => {
    setPontos([]); setRodando(true); parar.current = false
    const fim = performance.now() + dur * 1000
    let i = 0
    while (performance.now() < fim && !parar.current) {
      const t0 = performance.now()
      let ms = null
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 2000)
        await fetch(`${BASE}/__down?bytes=0&r=${Math.random()}`, { cache: 'no-store', signal: ctl.signal }); clearTimeout(tm)
        ms = Math.round((performance.now() - t0) * 10) / 10
      } catch { ms = null }
      const p = { i: i++, s: Math.round((performance.now() - (fim - dur * 1000)) / 100) / 10, ms }
      setPontos((l) => [...l, p])
      await new Promise((r) => setTimeout(r, Math.max(0, 500 - (performance.now() - t0))))
    }
    setRodando(false)
  }
  const st = useMemo(() => {
    const ok = pontos.filter((p) => p.ms != null).map((p) => p.ms)
    if (!ok.length) return null
    const s = [...ok].sort((a, b) => a - b)
    const med = s[Math.floor(s.length / 2)], p95 = s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
    const jit = ok.length > 1 ? ok.slice(1).reduce((a, v, k) => a + Math.abs(v - ok[k]), 0) / (ok.length - 1) : 0
    return { med, p95, min: s[0], max: s[s.length - 1], jit: Math.round(jit * 10) / 10, perdas: pontos.length - ok.length, picos: ok.filter((v) => v > med * 3 && v > med + 50).length, total: pontos.length }
  }, [pontos])
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Estabilidade deste computador</h2>
        <span className="text-xs text-muted-foreground">duas medidas de latência por segundo; mostra quedas e picos que o teste de velocidade não pega</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="campo h-9 w-32" value={dur} onChange={(e) => setDur(+e.target.value)} disabled={rodando} aria-label="Duração">{[30, 60, 120, 300].map((s) => <option key={s} value={s}>{s < 60 ? `${s} s` : `${s / 60} min`}</option>)}</select>
        {!rodando ? <Botao disabled={!pode} onClick={iniciar}>Medir estabilidade</Botao> : <Botao variante="secundario" onClick={() => { parar.current = true }}>Parar</Botao>}
      </div>
      {pontos.length > 1 && (
        <>
          <div className="mt-4 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pontos}>
                <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="s" unit=" s" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis unit=" ms" tickLine={false} axisLine={false} fontSize={11} width={52} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v) => (v == null ? 'sem resposta' : `${v} ms`)} />
                {st && <ReferenceLine y={st.med} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />}
                <Line dataKey="ms" stroke="hsl(var(--primary))" dot={false} isAnimationActive={false} strokeWidth={1.6} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {st && (
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-7">
              {[['Mediana', `${st.med} ms`], ['95%', `${st.p95} ms`], ['Mínima', `${st.min} ms`], ['Máxima', `${st.max} ms`], ['Jitter', `${st.jit} ms`], ['Sem resposta', `${st.perdas} de ${st.total}`], ['Picos', st.picos]].map(([n, v]) => (
                <div key={n}><dt className="text-xs text-muted-foreground">{n}</dt><dd className="font-semibold tabular">{v}</dd></div>))}
            </dl>
          )}
        </>
      )}
    </section>
  )
}

// ---------- diagnóstico completo pelo agente ----------
function Linha({ nome, valor, cor }) {
  return <li className="flex items-center justify-between gap-2 py-1.5 text-sm"><span className="min-w-0 truncate">{nome}</span>{cor ? <Selo cor={cor}>{valor}</Selo> : <span className="tabular text-muted-foreground">{valor}</span>}</li>
}
const corMs = (ms, bom = 60, medio = 200) => (ms == null ? 'vermelho' : ms < bom ? 'verde' : ms < medio ? 'ambar' : 'vermelho')

export function Diagnostico({ pode }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [rodando, setRodando] = useState(false)
  const [filtroLan, setFiltroLan] = useState('')
  useEffect(() => { api.get('/api/infra/rede/diagnostico').then((r) => setD(r.diagnostico)).catch(() => {}) }, [])
  const rodar = async () => { setRodando(true); try { setD(await api.post('/api/infra/rede/diagnostico')); toast('Diagnóstico concluído.') } catch (e) { toast(e.message, 'erro') } finally { setRodando(false) } }
  const lan = (d?.vizinhos || []).filter((v) => !filtroLan || v.ip.includes(filtroLan) || v.mac.includes(filtroLan.toLowerCase()) || (v.transmissor || '').toLowerCase().includes(filtroLan.toLowerCase()))
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-2">
        <ListTree className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Diagnóstico da rede do escritório</h2>
        {d && <span className="text-xs text-muted-foreground">{d.computador} · {haQuanto(d.quando)}</span>}
        <Botao className="ml-auto" tamanho="sm" carregando={rodando} disabled={!pode} onClick={rodar}>{d ? 'Rodar de novo' : 'Rodar diagnóstico'}</Botao>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Feito pelo agente (20 a 50 s): IP público, roteador, Wi-Fi, DNS, serviços que o sistema usa, caminho até a internet e aparelhos vistos na rede local.</p>
      {rodando && <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Medindo no computador do escritório…</p>}
      {!d && !rodando && <div className="mt-3"><Aviso tipo="alerta">Ainda sem diagnóstico. Precisa do agente do escritório online.</Aviso></div>}
      {d && (
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium"><Globe2 className="h-3.5 w-3.5" />Internet</p>
            <ul className="mt-1 divide-y divide-border">
              <Linha nome="IPv4 público" valor={d.ipv4?.ip || '—'} />
              <Linha nome="IPv6" valor={d.ipv6?.ip ? 'disponível' : 'sem IPv6'} cor={d.ipv6?.ip ? 'verde' : 'cinza'} />
              <Linha nome="Servidor Cloudflare" valor={d.ipv4?.colo || '—'} />
              <Linha nome="TLS / HTTP" valor={d.ipv4 ? `${d.ipv4.tls || '—'} · ${d.ipv4.http || '—'}` : '—'} />
              <Linha nome="IP local" valor={d.ip_local || '—'} />
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs font-medium"><Router className="h-3.5 w-3.5" />Roteador</p>
            <ul className="mt-1 divide-y divide-border">
              <Linha nome="Endereço" valor={d.gateway?.ip || '—'} />
              <Linha nome="Ping (mediana)" valor={d.gateway?.med != null ? `${d.gateway.med} ms` : 'sem resposta'} cor={corMs(d.gateway?.med, 5, 30)} />
              <Linha nome="Perda até o roteador" valor={d.gateway ? `${d.gateway.perda_pct}%` : '—'} cor={d.gateway ? (d.gateway.perda_pct === 0 ? 'verde' : 'vermelho') : undefined} />
            </ul>
            {d.wifi && (<>
              <p className="mt-4 flex items-center gap-1.5 text-xs font-medium"><Wifi className="h-3.5 w-3.5" />Wi-Fi do agente</p>
              <ul className="mt-1 divide-y divide-border">
                <Linha nome="Rede" valor={d.wifi.rede || '—'} />
                {d.wifi.sinal_dbm != null && <Linha nome="Sinal" valor={`${d.wifi.sinal_dbm} dBm`} cor={d.wifi.sinal_dbm > -60 ? 'verde' : d.wifi.sinal_dbm > -72 ? 'ambar' : 'vermelho'} />}
                {d.wifi.sinal_pct != null && <Linha nome="Sinal" valor={`${d.wifi.sinal_pct}%`} cor={d.wifi.sinal_pct > 70 ? 'verde' : d.wifi.sinal_pct > 45 ? 'ambar' : 'vermelho'} />}
                {d.wifi.ruido_dbm != null && <Linha nome="Ruído / margem" valor={`${d.wifi.ruido_dbm} dBm · ${d.wifi.sinal_dbm - d.wifi.ruido_dbm} dB`} />}
                <Linha nome="Canal / banda" valor={d.wifi.frequencia || '—'} />
                <Linha nome="Taxa" valor={d.wifi.taxa || '—'} />
              </ul>
              {/5\s*GHz/i.test(d.wifi.frequencia || '') && <p className="mt-1 text-[11px] text-muted-foreground">O agente está no 5 GHz; os transmissores só usam 2,4 GHz. Funciona se o roteador junta as duas bandas na mesma rede.</p>}
            </>)}
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium"><Server className="h-3.5 w-3.5" />Serviços do sistema (conexão TCP, 5 medidas)</p>
            <ul className="mt-1 divide-y divide-border">{(d.servicos || []).map((s) => <Linha key={s.nome} nome={s.nome} valor={s.ok ? `${s.med} ms${s.falhas ? ` · ${s.falhas} falha(s)` : ''}` : 'sem conexão'} cor={s.ok ? corMs(s.med, 80, 300) : 'vermelho'} />)}</ul>
            <p className="mt-4 text-xs font-medium">DNS</p>
            <ul className="mt-1 divide-y divide-border">
              {(d.dns || []).map((x) => <Linha key={x.nome} nome={`Sistema · ${x.nome}`} valor={x.ms != null ? `${x.ms} ms` : 'falhou'} cor={corMs(x.ms, 40, 150)} />)}
              {(d.doh || []).map((x) => <Linha key={x.resolvedor} nome={`DNS seguro (DoH) · ${x.resolvedor}`} valor={x.ms != null ? `${x.ms} ms` : 'sem acesso'} cor={corMs(x.ms, 60, 200)} />)}
            </ul>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium"><Network className="h-3.5 w-3.5" />Caminho até 1.1.1.1 (traceroute)</p>
            {d.rota?.length ? (
              <ol className="mt-2 space-y-1 text-xs">{d.rota.map((h) => (
                <li key={h.n} className="flex items-center gap-2"><span className="w-5 text-right tabular text-muted-foreground">{h.n}</span><span className="h-1.5 w-1.5 rounded-full bg-primary" /><span className="flex-1 truncate tabular">{h.ip || '* (não responde)'}</span><span className="tabular text-muted-foreground">{h.ms != null ? `${Math.round(h.ms)} ms` : ''}</span></li>))}
              </ol>) : <p className="mt-1 text-xs text-muted-foreground">Não deu para traçar neste computador.</p>}
            <p className="mt-4 text-xs font-medium">Aparelhos vistos na rede local ({d.vizinhos?.length || 0})</p>
            <input className="campo mt-1 h-8 text-xs" placeholder="Filtrar por IP, MAC ou transmissor" value={filtroLan} onChange={(e) => setFiltroLan(e.target.value)} />
            <ul className="mt-1 max-h-56 divide-y divide-border overflow-auto text-xs">{lan.map((v) => (
              <li key={v.ip} className="flex items-center gap-2 py-1"><span className="w-28 tabular">{v.ip}</span><span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">{v.mac}</span>{v.transmissor && <Selo cor="azul">{v.transmissor}</Selo>}</li>))}
            </ul>
            <p className="mt-1 text-[11px] text-muted-foreground">Lista do próprio computador (tabela ARP): não varre a rede, só mostra quem já conversou com ele.</p>
          </div>
        </div>
      )}
    </section>
  )
}

// ---------- agenda e alertas ----------
export function AgendaRede({ pode }) {
  const toast = useToast()
  const [c, setC] = useState(null)
  useEffect(() => { api.get('/api/infra/rede/agenda').then(setC).catch(() => {}) }, [])
  if (!c) return null
  const salvar = async () => { try { setC(await api.put('/api/infra/rede/agenda', c)); toast('Agenda salva.') } catch (e) { toast(e.message, 'erro') } }
  const num = (k) => (e) => setC({ ...c, [k]: e.target.value === '' ? null : +e.target.value })
  return (
    <section className="cartao p-5">
      <div className="flex items-center gap-2"><BellRing className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Teste automático e alertas</h2></div>
      <p className="mt-1 text-xs text-muted-foreground">O agente roda o teste sozinho e avisa na central de notificações quando passar dos limites ou um transmissor não responder.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm"><Interruptor ligado={c.ativo} onChange={(v) => setC({ ...c, ativo: v })} disabled={!pode} />Ligado</label>
        <label className="text-xs text-muted-foreground">A cada<select className="campo mt-1 h-9 w-28" value={c.a_cada_h} onChange={num('a_cada_h')} disabled={!pode}>{[1, 2, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h} h</option>)}</select></label>
        <label className="text-xs text-muted-foreground">Download mínimo (Mbps)<input type="number" min="0" className="campo mt-1 h-9 w-32" value={c.alerta_download_min ?? ''} onChange={num('alerta_download_min')} disabled={!pode} /></label>
        <label className="text-xs text-muted-foreground">Latência máxima (ms)<input type="number" min="0" className="campo mt-1 h-9 w-32" value={c.alerta_latencia_max ?? ''} onChange={num('alerta_latencia_max')} disabled={!pode} /></label>
        <label className="text-xs text-muted-foreground">Perda máxima (%)<input type="number" min="0" max="100" step="0.1" className="campo mt-1 h-9 w-28" value={c.alerta_perda_max ?? ''} onChange={num('alerta_perda_max')} disabled={!pode} /></label>
        <Botao disabled={!pode} onClick={salvar}>Salvar</Botao>
      </div>
      {c.ultimo > 0 && <p className="mt-2 text-xs text-muted-foreground">Último teste automático {haQuanto(c.ultimo)}.</p>}
    </section>
  )
}

// ---------- médias e exportação ----------
export function Resumo({ hist, aoLimpar, dono }) {
  const toast = useToast()
  const grupos = useMemo(() => {
    const lim = Date.now() / 1000 - 7 * 86400
    const g = {}
    for (const h of hist.filter((x) => x.quando > lim)) { const k = h.origem; (g[k] ||= []).push(h) }
    const media = (l, k) => { const v = l.map((x) => x[k]).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null }
    return Object.entries(g).map(([o, l]) => ({ o, n: l.length, down: media(l, 'download'), up: media(l, 'upload'), lat: media(l, 'latencia'), jit: media(l, 'jitter'), pior: Math.min(...l.map((x) => x.download ?? Infinity)) }))
  }, [hist])
  const baixar = (tipo) => {
    const cols = ['quando', 'origem', 'quem', 'download', 'upload', 'latencia', 'jitter', 'latencia_carga', 'perda_pct', 'ip', 'asn', 'colo', 'cidade']
    const txt = tipo === 'json' ? JSON.stringify(hist, null, 2)
      : [cols.join(';'), ...hist.map((h) => cols.map((c) => (c === 'quando' ? new Date(h.quando * 1000).toISOString() : String(h[c] ?? '').replace(/^[=+\-@]/, "'$&").replace(/;/g, ','))).join(';'))].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: tipo === 'json' ? 'application/json' : 'text/csv' })); a.download = `testes-rede.${tipo}`; a.click(); URL.revokeObjectURL(a.href)
  }
  const limpar = async () => { if (!await confirmar('Apagar todo o histórico de testes de rede? Não dá para desfazer.')) return; try { await api.del('/api/infra/rede/historico'); aoLimpar(); toast('Histórico apagado.') } catch (e) { toast(e.message, 'erro') } }
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Últimos 7 dias</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => baixar('csv')}>CSV</Botao>
          <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => baixar('json')}>JSON</Botao>
          {dono && <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={limpar}>Apagar histórico</Botao>}
        </div>
      </div>
      {!grupos.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum teste nos últimos 7 dias.</p> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1.5 font-medium">Onde</th><th className="font-medium">Testes</th><th className="font-medium">Download médio</th><th className="font-medium">Pior download</th><th className="font-medium">Upload médio</th><th className="font-medium">Latência média</th><th className="font-medium">Jitter médio</th></tr></thead>
            <tbody className="divide-y divide-border">{grupos.map((g) => (
              <tr key={g.o}><td className="py-1.5">{g.o === 'agente' ? 'Escritório (agente)' : 'Computadores'}</td><td className="tabular">{g.n}</td><td className="tabular">{g.down ?? '—'} Mbps</td><td className="tabular">{Number.isFinite(g.pior) ? `${g.pior} Mbps` : '—'}</td><td className="tabular">{g.up ?? '—'} Mbps</td><td className="tabular">{g.lat ?? '—'} ms</td><td className="tabular">{g.jit ?? '—'} ms</td></tr>))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
