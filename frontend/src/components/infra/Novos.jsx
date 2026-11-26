import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Cpu, ExternalLink, Globe, Lock, Mail, RefreshCw, Server, ShieldCheck, ShieldHalf, Wifi, XCircle } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Selo } from '../ui'
import { devePuxar } from '../../ocioso'

// Telas novas da Infra: Vercel → Domínios (como a aba Domains da Vercel), Cloudflare → Visão geral da zona (como a
// página inicial do painel da Cloudflare) e Placas IoT (Arduino / ESP32 / ESP8266 ligados ao sistema).

function useDado(caminho) {
  const [d, setD] = useState(null), [erro, setErro] = useState(''), [carregando, setCarregando] = useState(false)
  const ler = () => { setCarregando(true); setErro(''); api.get(caminho).then(setD).catch((e) => setErro(e.message)).finally(() => setCarregando(false)) }
  useEffect(ler, [caminho]) // eslint-disable-line react-hooks/exhaustive-deps
  return { d, erro, carregando, ler }
}

// ---------------- Vercel → Domínios ----------------
export function VercelDominios() {
  const { d, erro, carregando, ler } = useDado('/api/infra/dominios')
  const [aberto, setAberto] = useState(null)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Esqueleto className="h-72" />
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Os endereços de cada projeto, como o DNS aponta para a Vercel e se está tudo certo. Lido {haQuanto(d.lido_em)}.</p>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={carregando} onClick={ler}>Atualizar</Botao></div>
      {d.projetos.map((p) => (
        <section key={p.projeto} className="cartao overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3"><p className="font-medium">{p.projeto === 'clima-casa' ? 'App' : 'Site'} <span className="font-mono text-xs text-muted-foreground">· {p.projeto}</span></p>
            <span className="text-xs text-muted-foreground">{p.dominios.length} domínio(s)</span></div>
          <ul className="divide-y divide-border">{p.dominios.map((x) => {
            const ok = x.verificado && !x.mal_configurado
            const chave = `${p.projeto}:${x.nome}`
            return (
              <li key={x.nome}>
                <button className="flex w-full flex-wrap items-center gap-3 px-5 py-3.5 text-left hover:bg-muted/40" onClick={() => setAberto(aberto === chave ? null : chave)} aria-expanded={aberto === chave}>
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <a href={`https://${x.nome}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="min-w-0 truncate font-medium hover:underline">{x.nome}</a>
                  {x.redireciona && <span className="text-xs text-muted-foreground">→ {x.redireciona} ({x.codigo_redirecionamento || 307})</span>}
                  <span className="ml-auto flex items-center gap-1.5 text-xs">{ok ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" />Configuração válida</> : <><XCircle className="h-4 w-4 text-red-600" />{x.verificado ? 'DNS mal configurado' : 'Não verificado'}</>}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${aberto === chave ? 'rotate-180' : ''}`} />
                </button>
                {aberto === chave && (
                  <div className="grid gap-3 bg-muted/30 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><p className="text-xs text-muted-foreground">Apontado por</p><p className="font-medium">{x.configurado_por || (x.nome.endsWith('.vercel.app') ? 'Vercel' : '—')}</p></div>
                    <div><p className="text-xs text-muted-foreground">Registros A esperados</p><p className="font-mono text-xs">{x.valores_a.join(', ') || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">CNAME esperado</p><p className="break-all font-mono text-xs">{x.cnames.join(', ') || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">Servidores de nome</p><p className="font-mono text-xs">{x.nameservers.join(', ') || '—'}</p></div>
                    {!!x.conflitos.length && <div className="sm:col-span-2 lg:col-span-4"><Aviso tipo="alerta">Registros em conflito: {x.conflitos.map((c) => `${c.type || ''} ${c.name || ''} ${c.value || ''}`).join(' · ')}</Aviso></div>}
                    {x.criado && <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Adicionado em {new Date(x.criado).toLocaleDateString('pt-BR')}{x.ramo ? ` · ramo ${x.ramo}` : ''}</p>}
                  </div>
                )}
              </li>)
          })}</ul>
          {!!p.aliases.length && (
            <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">Produção atende: {p.aliases.map((a) => <a key={a.alias} href={`https://${a.alias}`} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 font-mono hover:text-foreground">{a.alias}<ExternalLink className="h-3 w-3" /></a>)}</div>
          )}
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Os registros ficam na Cloudflare (Cloudflare → DNS), sempre “DNS only”. Domínio novo: adicione no painel da Vercel e crie o registro que ela pedir; esta tela confere se ficou certo.</p>
    </div>
  )
}

// ---------------- Cloudflare → Visão geral ----------------
const NOMES_SSL = { ssl: 'Modo SSL', min_tls_version: 'TLS mínimo', tls_1_3: 'TLS 1.3', always_use_https: 'Sempre HTTPS', http3: 'HTTP/3', ipv6: 'IPv6' }
export function CfVisao({ irPara }) {
  const { d, erro, carregando, ler } = useDado('/api/infra/cf/visao')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!d) return <Esqueleto className="h-72" />
  const z = d.zona
  const atalhos = [['cloudflare/dns', 'DNS', Globe, `${d.registros.total} registros`], ['cloudflare/email', 'E-mails', Mail, d.email ? `${d.email.regras ?? d.email.enderecos ?? 0} regra(s)` : 'Email Routing'],
    ['cloudflare/turnstile', 'Turnstile', ShieldHalf, `${d.turnstile ?? 0} widget(s)`], ['cloudflare/seguranca', 'Segurança', ShieldCheck, `DNSSEC ${d.dnssec === 'active' ? 'ativo' : 'desligado'}`]]
  return (
    <div className="space-y-6">
      <section className="cartao p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xl font-semibold">{z.nome}<Selo cor={z.estado === 'active' && !z.pausada ? 'verde' : 'ambar'}>{z.pausada ? 'pausada' : z.estado === 'active' ? 'Ativa' : z.estado}</Selo></p>
            <p className="mt-1 text-sm text-muted-foreground">Plano {z.plano} · configuração {z.tipo === 'full' ? 'completa (nameservers da Cloudflare)' : z.tipo} · ativa desde {z.ativa_desde ? new Date(z.ativa_desde).toLocaleDateString('pt-BR') : '—'}</p>
          </div>
          <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={carregando} onClick={ler}>Atualizar</Botao>
        </div>
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Nameservers (no Registro.br)</p>{(z.nameservers || []).map((n) => <p key={n} className="font-mono text-xs">{n}</p>)}</div>
          <div><p className="text-xs text-muted-foreground">DNSSEC</p><p className="flex items-center gap-1.5 font-medium">{d.dnssec === 'active' ? <><Lock className="h-4 w-4 text-emerald-600" />Ativo</> : <><AlertTriangle className="h-4 w-4 text-amber-600" />{d.dnssec || 'desligado'}</>}</p></div>
          <div><p className="text-xs text-muted-foreground">Registros DNS</p><p className="font-medium">{d.registros.total} <span className="text-xs font-normal text-muted-foreground">{Object.entries(d.registros.por_tipo).map(([t, n]) => `${t} ${n}`).join(' · ')}</span></p><p className="text-xs text-muted-foreground">{d.registros.com_proxy} com proxy</p></div>
          <div><p className="text-xs text-muted-foreground">Zona criada em</p><p className="font-medium">{z.criada ? new Date(z.criada).toLocaleDateString('pt-BR') : '—'}</p></div>
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{atalhos.map(([k, n, I, sub]) => (
        <button key={k} onClick={() => irPara(k)} className="cartao flex items-center gap-3 p-4 text-left hover:border-primary/40">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600"><I className="h-5 w-5" /></span>
          <span className="min-w-0"><b className="block text-sm font-medium">{n}</b><span className="truncate text-xs text-muted-foreground">{sub}</span></span><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></button>))}
      </div>
      <section className="cartao p-5">
        <p className="titulo-secao">SSL/TLS e rede</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">{Object.entries(NOMES_SSL).map(([k, n]) => (
          <div key={k} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{n}</p><p className="font-medium">{String(d.ssl[k] ?? '—').replace(/^on$/, 'ligado').replace(/^off$/, 'desligado').replace(/^full$/, 'completo')}</p></div>))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{d.aviso}</p>
      </section>
      {!!d.dicas.length && <Aviso tipo="alerta">{d.dicas.join(' ')}</Aviso>}
    </div>
  )
}

// ---------------- Placas IoT (Arduino / ESP32 / ESP8266) ----------------
const PAGINA = { luz: '/luzes', cafeteira: '/cafeteira', persiana: '/persianas', fechadura: '/fechadura' }
export function PlacasIoT() {
  const [lista, setLista] = useState(null), [erro, setErro] = useState('')
  const ler = () => api.get('/api/dispositivos').then((r) => setLista(r.dispositivos || r)).catch((e) => setErro(e.message))
  useEffect(() => { ler(); const t = setInterval(() => { if (devePuxar('infra')) ler() }, 10000); return () => clearInterval(t) }, [])
  const placas = useMemo(() => (lista || []).filter((d) => d.driver === 'placa'), [lista])
  const semAparelho = useMemo(() => (lista || []).filter((d) => !d.conectado && d.driver !== 'placa'), [lista])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!lista) return <Esqueleto className="h-64" />
  const online = placas.filter((p) => p.online).length
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[['Placas ligadas ao sistema', placas.length], ['Online agora', `${online} de ${placas.length}`], ['Comandos esperando', placas.reduce((s, p) => s + (p.fila?.length || 0), 0)], ['Aparelhos sem hardware', semAparelho.length]].map(([r, v]) => (
          <div key={r} className="cartao px-4 py-3"><p className="text-xs text-muted-foreground">{r}</p><p className="mt-1 text-2xl font-semibold tabular">{v}</p></div>))}
      </div>
      <section className="cartao overflow-hidden">
        <div className="border-b border-border px-5 py-3"><p className="titulo-secao">Placas</p><p className="text-xs text-muted-foreground">Cada placa busca os comandos no servidor a cada 3 s, por HTTPS, com o token só dela. Atualiza a cada 10 s.</p></div>
        {!placas.length ? <p className="px-5 py-6 text-sm text-muted-foreground">Nenhuma placa ainda. Gere o código na página do aparelho (Luzes, Cafeteira, Persianas ou Fechadura → Código da placa própria).</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-2 font-medium">Aparelho</th><th className="py-2 font-medium">Placa</th><th className="py-2 font-medium">Estado</th><th className="py-2 font-medium">Wi-Fi</th><th className="py-2 font-medium">IP</th><th className="py-2 font-medium">Firmware</th><th className="py-2 font-medium">Ligada há</th><th className="py-2" /></tr></thead>
            <tbody>{placas.map((p) => { const i = p.info_placa || {}; return (
              <tr key={p.id} className="border-b border-border/60">
                <td className="px-5 py-2.5"><p className="font-medium">{p.nome}</p><p className="text-xs text-muted-foreground">{p.tipo}</p></td>
                <td className="py-2.5 text-xs">{i.placa || '—'}</td>
                <td className="py-2.5">{p.online ? <Selo cor="verde">Online</Selo> : p.conectado ? <Selo cor="ambar">sem contato {p.visto_em ? haQuanto(p.visto_em) : ''}</Selo> : <Selo>esperando a 1ª conexão</Selo>}{p.fila?.length ? <span className="ml-1.5 text-xs text-amber-700 dark:text-amber-400">{p.fila.length} na fila</span> : null}</td>
                <td className="py-2.5 text-xs">{i.rssi != null ? <span className="inline-flex items-center gap-1"><Wifi className="h-3.5 w-3.5" />{i.rssi} dBm{i.rssi < -75 ? ' (fraco)' : ''}</span> : '—'}</td>
                <td className="py-2.5 font-mono text-xs">{i.ip || '—'}</td>
                <td className="py-2.5 text-xs">{i.firmware || '—'}</td>
                <td className="py-2.5 text-xs">{i.uptime_s != null ? (i.uptime_s > 86400 ? `${Math.floor(i.uptime_s / 86400)} d` : i.uptime_s > 3600 ? `${Math.floor(i.uptime_s / 3600)} h` : `${Math.floor(i.uptime_s / 60)} min`) : '—'}</td>
                <td className="py-2.5 pr-5 text-right"><Link to={PAGINA[p.tipo] || '/'} className="text-xs text-primary hover:underline">Abrir</Link></td>
              </tr>) })}</tbody>
          </table></div>
        )}
      </section>
      <section className="cartao p-5 text-sm">
        <p className="flex items-center gap-2 titulo-secao"><Cpu className="h-4 w-4" />O que um Arduino ou ESP32 faz aqui</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div><p className="font-medium text-emerald-700 dark:text-emerald-400">Faz</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Substitui a tomada ou o interruptor Smart Life: liga e desliga luz, cafeteira, motor de persiana e fecho de porta por relé.</li>
              <li>Brilho de fita de LED (PWM), posição da persiana pelo tempo de curso, sensor de porta aberta.</li>
              <li>Placas: Arduino UNO R4 WiFi, GIGA R1 WiFi, Opta, Portenta H7, Nano 33 IoT, MKR WiFi 1010, Nano ESP32, ESP32 e ESP8266.</li>
            </ul></div>
          <div><p className="font-medium text-red-700 dark:text-red-400">Não faz (hoje)</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Rodar o agente do escritório: ele é Python com banco, TLS e WebSocket; para isso use um computador ou um Raspberry Pi (Infra → Agentes).</li>
              <li>Mandar infravermelho para o ar: os ares continuam pelos transmissores Tuya SRW-004. Um ESP32 com LED infravermelho precisaria de uma integração nova.</li>
            </ul></div>
        </div>
        {!!semAparelho.length && <p className="mt-4 text-xs text-muted-foreground">Esperando hardware (Smart Life ou placa): {semAparelho.map((x) => x.nome).join(', ')}.</p>}
        <div className="mt-4 flex flex-wrap gap-2">{Object.entries(PAGINA).map(([t, r]) => <Link key={t} to={r} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted"><Server className="h-3.5 w-3.5" />Código para {t === 'luz' ? 'luzes' : t === 'persiana' ? 'persianas' : t}</Link>)}</div>
      </section>
    </div>
  )
}
