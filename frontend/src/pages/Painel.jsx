import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AirVent, AlertTriangle, CheckCircle2, ChevronRight, Info, Map as MapaIcone, Minus, Plus, Power, Sparkles } from 'lucide-react'
import { MODOS, VENTILACAO, api, haQuanto, rotuloOrigem } from '../api'
import { lerCache, gravarCache } from '../cacheTela'
import { comFiltro, useProjeto } from '../contexto'
import { useTema } from '../tema'
import { useMarca } from '../marca'
import { Aviso, Botao, Carregando, Esqueleto, FaixaMetricas, Ponto, Selo, useToast } from '../components/ui'
import { completar } from '../mapaUtil'

const carregarCena3D = () => import('../components/Cena3D')
const Cena3D = lazy(carregarCena3D)
const Mapa3D = lazy(() => import('../components/Mapa3D'))
const Barras3D = lazy(() => import('../components/Barras3D'))
import MapaUso from '../components/MapaUso'
const CORES_ORIGEM = ['hsl(var(--primary))', '#2563a8', '#c2410c', '#7c3aed', '#0891b2', '#71717a']
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NOMES_ORIGEM = { painel: 'Painel', alexa: 'Alexa', sinric: 'Alexa/Google', agenda: 'Agenda', automacao: 'Automação', cena: 'Cena', sistema: 'Sistema', app: 'App' }

// Medidor do gasto do mês: arco animado; com meta, compara a projeção com ela
function Medidor({ mes }) {
  const alvo = mes.meta || Math.max(mes.projecao, 1)
  const pct = Math.min(1, mes.projecao / alvo)
  const pctAgora = Math.min(1, mes.custo / alvo)
  const R = 70, C = Math.PI * R
  const cor = !mes.meta ? 'hsl(var(--primary))' : mes.projecao > mes.meta ? '#dc2626' : mes.projecao > mes.meta * 0.85 ? '#d97706' : '#059669'
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 104" className="w-full max-w-[260px]">
        <path d="M20,94 A70,70 0 0 1 160,94" fill="none" stroke="hsl(var(--muted))" strokeWidth="14" strokeLinecap="round" />
        <motion.path d="M20,94 A70,70 0 0 1 160,94" fill="none" stroke={cor} strokeOpacity="0.3" strokeWidth="14" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ duration: 1.1, ease: 'easeOut' }} />
        <motion.path d="M20,94 A70,70 0 0 1 160,94" fill="none" stroke={cor} strokeWidth="14" strokeLinecap="round" strokeDasharray={C}
          initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pctAgora) }} transition={{ duration: 1.1, ease: 'easeOut', delay: 0.15 }} />
      </svg>
      <p className="-mt-12 text-3xl font-semibold tabular">{brl(mes.custo)}</p>
      <p className="mt-1 text-xs text-muted-foreground">gasto estimado em {mes.dias} dia(s) do mês</p>
      <dl className="mt-4 grid w-full grid-cols-3 divide-x divide-border rounded-lg border border-border text-center text-xs">
        <div className="py-2"><dt className="text-muted-foreground">Projeção</dt><dd className={`mt-0.5 font-semibold tabular ${mes.meta && mes.projecao > mes.meta ? 'text-red-600 dark:text-red-400' : ''}`}>{brl(mes.projecao)}</dd></div>
        <div className="py-2"><dt className="text-muted-foreground">Meta</dt><dd className="mt-0.5 font-semibold tabular">{mes.meta ? brl(mes.meta) : '—'}</dd></div>
        <div className="py-2"><dt className="text-muted-foreground">Consumo</dt><dd className="mt-0.5 font-semibold tabular">{mes.kwh.toLocaleString('pt-BR')} kWh</dd></div>
      </dl>
      {!mes.meta && <Link to="/projetos" className="mt-2 text-[11px] text-muted-foreground hover:text-foreground">Defina metas de gasto em Projetos</Link>}
    </div>
  )
}
const entrar = { hidden: { opacity: 0, y: 10 }, show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] } }) }

function DicaGrafico({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl"> {/* marca: dica do gráfico flutua */}
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} /> {p.name}: <span className="ml-auto font-mono text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  )
}

// monta o filho só quando o cartão chega perto da tela (os 3D de baixo não pesam na abertura do painel)
function QuandoVisivel({ children, fallback }) {
  const ref = useRef(null)
  const [ver, setVer] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || ver) return undefined
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) { setVer(true); io.disconnect() } }, { rootMargin: '300px' })
    io.observe(el)
    // monta também num momento ocioso depois da abertura, para não engasgar quando a rolagem chegar nele
    const ocioso = window.requestIdleCallback || ((f) => setTimeout(f, 1))
    const t = setTimeout(() => ocioso(() => setVer(true), { timeout: 4000 }), 2500)
    return () => { io.disconnect(); clearTimeout(t) }
  }, [ver])
  return <div ref={ref} className="h-full">{ver ? children : fallback}</div>
}

// Temperatura de fora (Open-Meteo) do lugar do projeto, atualizada a cada 5 min
function useFora(projetoId) {
  const [fora, setFora] = useState(null)
  useEffect(() => {
    const buscar = () => api.get(`/api/clima-externo${projetoId ? `?projeto_id=${projetoId}` : ''}`).then(setFora).catch(() => {})
    buscar()
    const t = setInterval(buscar, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [projetoId])
  return fora
}

// Ligaram ou mudaram pelo controle remoto: o ar não avisa (infravermelho só vai num sentido e o transmissor não tem
// sensor). A pessoa conta o que o ar está fazendo e o sistema atualiza SEM mandar sinal (rota /estado-real).
function EstadoPeloControle({ ar, aoMudar, fechar }) {
  const [f, setF] = useState({ ligado: true, modo: ar.modo || 'frio', temperatura: ar.temperatura, zona: false })
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const salvar = async () => {
    setOcupado(true)
    try { aoMudar(await api.post(`/api/aparelhos/${ar.id}/estado-real`, f)); toast('Estado atualizado (nenhum sinal enviado).'); fechar() }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-3 overflow-hidden rounded-md border border-border p-3 text-xs">
      <p className="mb-2 font-medium">Como o {ar.nome} está agora?</p>
      <div className="mb-2 flex gap-1" role="group" aria-label="Ligado ou desligado">
        {[[true, 'Ligado'], [false, 'Desligado']].map(([v, r]) => <button key={r} onClick={() => setF({ ...f, ligado: v })} className={`flex-1 rounded-md border px-2 py-1 ${f.ligado === v ? 'border-primary bg-primary/10 font-medium' : 'border-border'}`}>{r}</button>)}
      </div>
      {f.ligado && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <select value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value })} className="campo h-8 text-xs" aria-label="Modo">{ar.modos.split(',').map((m) => <option key={m} value={m}>{MODOS[m]}</option>)}</select>
          <label className="flex items-center gap-1"><input type="number" min={ar.temp_min} max={ar.temp_max} value={f.temperatura} onChange={(e) => setF({ ...f, temperatura: +e.target.value })} className="campo h-8 text-xs" aria-label="Temperatura" />°</label>
        </div>
      )}
      {ar.zona && <label className="mb-2 flex items-start gap-1.5 text-muted-foreground"><input type="checkbox" checked={f.zona} onChange={(e) => setF({ ...f, zona: e.target.checked })} className="mt-0.5" />Os outros {ar.zona.total - 1} da {ar.zona.nome} também mudaram (o controle atinge os iguais à vista)</label>}
      <div className="flex justify-end gap-2"><button onClick={fechar} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted">Cancelar</button><Botao tamanho="sm" carregando={ocupado} onClick={salvar}>Atualizar sem mandar sinal</Botao></div>
    </motion.div>
  )
}

// Um ar: 3D animado (ar saindo, cor do modo) + mostrador, modos e ligar/desligar. "compacto" = 3D em cima e controles
// embaixo (vários ares lado a lado); senão, 3D à esquerda e controles à direita.
function ControleAr({ ar, aoMudar, aparencia = {}, modelos = null, fora, compacto = false, cabecalho = null, extra = null }) {
  const { escuro } = useTema()
  const [ocupado, setOcupado] = useState(false)
  const [real, setReal] = useState(false)
  const toast = useToast()
  const mudar = async (e) => {
    setOcupado(true)
    try { aoMudar(await api.post(`/api/aparelhos/${ar.id}/estado`, e)) } catch (err) { toast(err.message, 'erro') } finally { setOcupado(false) }
  }
  const corTemp = !ar.ligado ? 'text-muted-foreground/50' : ar.modo === 'quente' ? 'text-quente' : 'text-frio dark:text-sky-400'
  return (
    <div className={compacto ? 'flex h-full flex-col' : 'grid md:grid-cols-[1.25fr_1fr]'}>
      <div className={`relative border-b border-border ${compacto ? 'h-56' : 'h-64 md:h-auto md:min-h-[320px] md:border-b-0 md:border-r'}`}>
        <Suspense fallback={<div className="h-full animate-pulse bg-muted" />}>
          <Cena3D key={`${escuro ? 'escuro' : 'claro'}-${modelos?.ares?.[String(ar.marca || '').trim().toLowerCase()] || 0}`} escuro={escuro} modeloId={modelos?.ares?.[String(ar.marca || '').trim().toLowerCase()] || null} estado={{ ...ar, cor: aparencia[ar.id]?.cor || '', externa: fora?.disponivel ? fora.temperatura : null, umidade: fora?.disponivel ? fora.umidade : null }} />
        </Suspense>
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs backdrop-blur">
          <Ponto ativo={ar.ligado} /> {ar.ligado ? `${MODOS[ar.modo]} · ventilação ${VENTILACAO[ar.ventilador].toLowerCase()}` : 'Desligado'}
        </div>
        {fora?.disponivel && !compacto && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} title={`Fonte: ${fora.fonte} · atualizado ${fora.atualizado?.slice(11, 16) || ''}`}
            className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-border bg-card/80 px-3 py-2 text-xs backdrop-blur">
            <p className="text-muted-foreground">Lá fora{fora.cidade ? ` · ${fora.cidade}` : ''}</p>
            <p className="mt-0.5 flex items-baseline gap-2"><span className="text-lg font-semibold tabular">{Math.round(fora.temperatura)}°</span>
              <span className="text-muted-foreground">sensação {Math.round(fora.sensacao)}° · {fora.umidade}% · {fora.condicao}</span></p>
            {!!ar.ligado && <p className="mt-0.5 text-muted-foreground">Diferença para o ajuste: <span className="tabular text-foreground">{Math.round(fora.temperatura - ar.temperatura)}°</span></p>}
          </motion.div>
        )}
      </div>
      <div className={`flex flex-1 flex-col ${compacto ? 'p-4' : 'p-5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {cabecalho || <p className="truncate text-base font-semibold">{ar.nome}</p>}
            <p className="truncate text-xs text-muted-foreground">{[ar.projeto_nome, ar.comodo && ar.comodo !== ar.projeto_nome ? ar.comodo : ''].filter(Boolean).join(' · ') || 'Sem cômodo'}</p>
          </div>
          <Link to={`/aparelhos/${ar.id}`} className="text-xs text-muted-foreground hover:text-foreground">Detalhes</Link>
        </div>
        <div className={`flex items-center justify-center gap-5 ${compacto ? 'my-4' : 'my-6'}`}>
          <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })} disabled={ocupado || ar.temperatura <= ar.temp_min || !ar.hub_id}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label={`Diminuir a temperatura do ${ar.nome}`}><Minus className="h-4 w-4" /></button>
          <motion.p key={`${ar.temperatura}-${ar.ligado}`} initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}
            className={`${compacto ? 'text-5xl' : 'text-6xl'} font-semibold tracking-tight tabular ${corTemp}`}>{ar.temperatura}<span className="align-top text-2xl">°</span></motion.p>
          <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })} disabled={ocupado || ar.temperatura >= ar.temp_max || !ar.hub_id}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label={`Aumentar a temperatura do ${ar.nome}`}><Plus className="h-4 w-4" /></button>
        </div>
        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
          {ar.modos.split(',').map((m) => (
            <button key={m} disabled={ocupado || !ar.hub_id} onClick={() => mudar({ ligado: true, modo: m })}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${ar.ligado && ar.modo === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{MODOS[m]}</button>
          ))}
        </div>
        {extra}
        {real && <EstadoPeloControle ar={ar} aoMudar={aoMudar} fechar={() => setReal(false)} />}
        {ar.zona && <p className="mb-3 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">Na <b>{ar.zona.nome}</b>: o transmissor manda o mesmo sinal para {ar.zona.outros.join(', ')}. O comando muda os {ar.zona.total} ares juntos.</p>}
        {!ar.hub_id && <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">Este ar ainda não tem transmissor: os comandos não têm por onde sair. Vincule um em <Link to={`/aparelhos/${ar.id}`} className="underline">Detalhes</Link>.</p>}
        <Botao className="mt-auto w-full" variante={ar.ligado ? 'secundario' : 'primario'} icone={Power} carregando={ocupado} disabled={!ar.hub_id}
          onClick={() => mudar({ ligado: !ar.ligado })}>{ar.ligado ? `Desligar` : `Ligar`}</Botao>
        {!real && <button onClick={() => setReal(true)} className="mt-2 text-center text-xs text-muted-foreground hover:text-foreground">Ligaram ou mudaram pelo controle? Atualizar o estado</button>}
        {!ar.total_codigos && <p className="ajuda mt-2 text-center">Grave os botões do controle original na tela do aparelho.</p>}
      </div>
    </div>
  )
}

function Destaque({ aparelhos, aoMudar, aparencia = {}, modelos = null, verSala }) {
  // abre num ar que dá para comandar (com transmissor): ligado primeiro. Um ar recém-cadastrado sem transmissor
  // não pode virar o padrão (deixava os botões desativados sem aviso).
  const padrao = () => (aparelhos.find((a) => a.ligado && a.hub_id) || aparelhos.find((a) => a.hub_id) || aparelhos[0])?.id
  const [id, setId] = useState(padrao)
  const ar = aparelhos.find((a) => a.id === id) || aparelhos[0]
  const fora = useFora(ar?.projeto_id)
  useEffect(() => { if (!aparelhos.some((a) => a.id === id)) setId(padrao()) }, [aparelhos, id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ar) return null
  const daSala = aparelhos.filter((a) => a.projeto_id && a.projeto_id === ar.projeto_id)
  return (
    <motion.div custom={4} variants={entrar} initial="hidden" animate="show" className="cartao overflow-hidden lg:col-span-2">
      <ControleAr ar={ar} aoMudar={aoMudar} aparencia={aparencia} modelos={modelos} fora={fora}
        cabecalho={
          <select value={ar.id} onChange={(e) => setId(Number(e.target.value))} aria-label="Escolher aparelho"
            className="-ml-1 w-full truncate rounded-md bg-transparent px-1 text-base font-semibold hover:bg-muted">
            {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        }
        extra={daSala.length > 1 && verSala ? (
          <button onClick={() => verSala(ar.projeto_id)} className="mb-3 inline-flex items-center justify-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            Ver os {daSala.length} ares de {ar.projeto_nome} lado a lado<ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : null} />
    </motion.div>
  )
}

// Vários ares de uma sala (projeto) lado a lado, cada um com o próprio 3D e os próprios controles. Quando um comando
// muda os ares que respondem juntos (mesmo transmissor e modelo), todos os cartões mudam juntos, com a animação.
function AresDaSala({ ares, aoMudar, aparencia = {}, modelos = null, titulo, fechar }) {
  const fora = useFora(ares[0]?.projeto_id)
  const ligados = ares.filter((a) => a.ligado).length
  return (
    <motion.section custom={4} variants={entrar} initial="hidden" animate="show" className="lg:col-span-3" aria-label={`Ares de ${titulo}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">{titulo}: {ares.length} ares</h2>
          <p className="text-xs text-muted-foreground">
            {ligados} ligado{ligados === 1 ? '' : 's'}
            {fora?.disponivel ? ` · lá fora ${Math.round(fora.temperatura)}° (${fora.condicao})` : ''}
          </p>
        </div>
        {fechar && <button onClick={fechar} className="text-xs text-muted-foreground hover:text-foreground">Ver um por vez</button>}
      </div>
      <div className={`grid grid-cols-1 gap-4 ${ares.length >= 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'}`}>
        {ares.map((ar, i) => (
          <motion.div key={ar.id} className="cartao overflow-hidden" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 * i, duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}>
            <ControleAr ar={ar} aoMudar={aoMudar} aparencia={aparencia} modelos={modelos} fora={fora} compacto />
          </motion.div>
        ))}
      </div>
    </motion.section>
  )
}

export default function Painel() {
  const { filtro, projeto } = useProjeto()
  const { marca } = useMarca()
  // abre com o que a pessoa viu da última vez (cacheTela) e troca quando o servidor responde
  const [dados, setDadosBrutos] = useState(() => lerCache(`painel:${filtro}`))
  const setDados = setDadosBrutos
  const chegou = (d) => { gravarCache(`painel:${filtro}`, d); setDadosBrutos(d) }   // grava mesmo se a pessoa já saiu da tela
  const [atualizado, setAtualizado] = useState(false)
  const [metricas, setMetricas] = useState(() => lerCache('metricas14') || [])
  const [analise, setAnalise] = useState(() => lerCache(`painel-analise:${filtro}`))
  const [vistaUso, setVistaUso] = useState(() => { try { return localStorage.getItem('clima-vista-uso') || 'grade' } catch { return 'grade' } })
  useEffect(() => { try { localStorage.setItem('clima-vista-uso', vistaUso) } catch { /* sem armazenamento */ } }, [vistaUso])
  const [planta, setPlanta] = useState(null)
  const [erro, setErro] = useState('')
  const [salaLado, setSalaLado] = useState(null)   // projeto cujos ares aparecem lado a lado (pedido no destaque)
  useEffect(() => { setSalaLado(null) }, [filtro])

  useEffect(() => {
    carregarCena3D().catch(() => {})   // só adianta o download; se falhar, o lazy() tenta de novo (e recarrega se a versão mudou)
    setAtualizado(false)
    setDadosBrutos(lerCache(`painel:${filtro}`))
    api.get(comFiltro('/api/painel', filtro)).then((d) => { chegou(d); setAtualizado(true) }).catch((e) => { setAtualizado(true); if (!lerCache(`painel:${filtro}`)) setErro(e.message) })
    api.get('/api/metricas?dias=14').then((m) => { setMetricas(m); gravarCache('metricas14', m) }).catch(() => {})
    setAnalise(lerCache(`painel-analise:${filtro}`))
    api.get(comFiltro('/api/painel/analise', filtro)).then((a) => { setAnalise(a); gravarCache(`painel-analise:${filtro}`, a) }).catch(() => setAnalise((x) => x || false))
  }, [filtro]) // eslint-disable-line react-hooks/exhaustive-deps
  // estado ao vivo: o que mudou pela Alexa, pelo celular, pela agenda ou por outra pessoa aparece sozinho (a cada 15 s,
  // só com a aba visível; volta a buscar na hora quando a aba volta)
  useEffect(() => {
    const buscar = () => { if (!document.hidden) api.get(comFiltro('/api/painel', filtro)).then(chegou).catch(() => {}) }
    const t = setInterval(buscar, 15000)
    document.addEventListener('visibilitychange', buscar)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', buscar) }
  }, [filtro])
  useEffect(() => {
    const buscar = () => { if (!document.hidden) api.get('/api/mapa').then(setPlanta).catch(() => {}) }
    buscar(); const t = setInterval(buscar, 60000); return () => clearInterval(t)   // planta do mapa muda pouco: 60 s
  }, [])
  const plantaPronta = useMemo(() => (planta ? { ...planta, mapa: completar(planta.mapa, planta.projetos, planta.ares) } : null), [planta])

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const { totais, aparelhos, atividade } = dados
  // o ar comandado e os que responderam junto (mesmo transmissor e modelo) mudam na tela, cada um com a animação dele
  const atualizar = (novo) => setDados((d) => {
    const estado = { ligado: novo.ligado, modo: novo.modo, temperatura: novo.temperatura, ventilador: novo.ventilador, ligado_desde: novo.ligado_desde }
    const juntos = new Set(novo.juntos || [])
    const lista = d.aparelhos.map((a) => (a.id === novo.id ? { ...a, ...novo } : juntos.has(a.id) ? { ...a, ...estado } : a))
    return { ...d, aparelhos: lista, totais: { ...d.totais, ligados: lista.filter((a) => a.ligado).length } }
  })
  const serie = metricas.map((m) => ({ dia: m.dia.slice(8, 10) + '/' + m.dia.slice(5, 7), comandos: m.comandos, falhas: m.falhas }))
  const status = [
    { nome: 'Agente do escritório', ok: dados.agente.online, det: dados.agente.online ? 'executando comandos' : `offline${dados.agente.visto_em ? `, visto ${haQuanto(dados.agente.visto_em)}` : ''}` },
    { nome: 'Sinric Pro (Alexa/Google)', ok: dados.sinric, det: dados.sinric ? 'conectado' : 'desconectado' },
    { nome: 'Nuvem Tuya', ok: dados.nuvem, det: dados.nuvem ? 'conta conectada' : 'sem conta' },
    { nome: 'Skill própria da Alexa', ok: dados.alexa, det: dados.alexa ? 'vinculada' : 'não vinculada' },
  ]

  return (
    <div className="space-y-6">
      <motion.div variants={entrar} initial="hidden" animate="show" className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{projeto ? projeto.nome : 'Todos os projetos'}</h1>
          {marca.boas_vindas && <p className="mt-1 text-sm text-foreground/80">{marca.boas_vindas}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            {totais.ligados} de {totais.aparelhos} aparelho{totais.aparelhos === 1 ? '' : 's'} ligado{totais.ligados === 1 ? '' : 's'} agora
            {dados.alertas > 0 && <> · <Link to="/supabase" className="text-amber-600 hover:underline dark:text-amber-400">{dados.alertas} alerta{dados.alertas > 1 ? 's' : ''}</Link></>}
            {!atualizado && <span className="ml-2 inline-flex items-center gap-1 text-xs"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />atualizando</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/cenas"><Botao variante="secundario" icone={Sparkles}>Cenas</Botao></Link>
          <Link to="/aparelhos?novo=1"><Botao icone={Plus}>Novo aparelho</Botao></Link>
        </div>
      </motion.div>

      {(() => {
        // o que impede o ar de obedecer agora, com o caminho para resolver
        const avisos = []
        if (totais.hubs && totais.hubs_online < totais.hubs) avisos.push({ t: `${totais.hubs - totais.hubs_online} transmissor${totais.hubs - totais.hubs_online > 1 ? 'es' : ''} fora da rede`, d: 'Os comandos não chegam ao ar. Confira se o transmissor está na tomada e no mesmo Wi-Fi 2,4 GHz do Mac.', l: '/transmissores', b: 'Ver transmissores' })
        const semBotao = aparelhos.filter((a) => !a.total_codigos)
        if (semBotao.length) avisos.push({ t: `${semBotao.map((a) => a.nome).join(', ')} sem botões gravados`, d: 'Sem o botão Desligar e as temperaturas gravados, o ar não liga nem desliga por aqui, pela Alexa ou pelo celular.', l: `/aparelhos/${semBotao[0].id}`, b: 'Gravar botões' })
        if (!dados.agente.online) avisos.push({ t: 'Agente do escritório offline', d: 'É o computador do escritório (Mac ou PC Windows) que manda o sinal ao transmissor. Ligue-o ou veja Infra → Agentes.', l: '/guia', b: 'Ver o passo a passo' })
        if (!avisos.length) return null
        return (
          <motion.div variants={entrar} initial="hidden" animate="show" className="cartao divide-y divide-border border-amber-300/60 dark:border-amber-700/50">
            {avisos.map((a) => (
              <div key={a.t} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <AlertTriangle className="hidden h-4 w-4 shrink-0 text-amber-500 sm:block" />
                <div className="min-w-0 flex-1"><p className="text-sm font-medium"><AlertTriangle className="mr-1.5 inline h-4 w-4 text-amber-500 sm:hidden" />{a.t}</p><p className="text-xs text-muted-foreground">{a.d}</p></div>
                <Link to={a.l} className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">{a.b}<ChevronRight className="h-3.5 w-3.5" /></Link>
              </div>
            ))}
          </motion.div>
        )
      })()}

      <motion.div variants={entrar} initial="hidden" animate="show" custom={1}>
        <FaixaMetricas itens={[
          { rotulo: 'Aparelhos ligados agora', valor: totais.ligados, sufixo: ` de ${totais.aparelhos}`, dica: totais.aparelhos ? `${Math.round((totais.ligados / totais.aparelhos) * 100)}% do escritório em uso` : 'nenhum aparelho cadastrado' },
          { rotulo: 'Transmissores online', valor: totais.hubs_online, sufixo: ` / ${totais.hubs}`, dica: totais.hubs_online === totais.hubs ? 'todos respondendo' : 'algum transmissor fora da rede', tom: totais.hubs_online === totais.hubs ? 'bom' : 'ruim' },
          { rotulo: 'Comandos nas últimas 24 h', valor: totais.comandos_24h, dica: totais.falhas_24h ? `${totais.falhas_24h} com falha` : 'nenhuma falha', tom: totais.falhas_24h ? 'ruim' : '', serie: metricas.map((m) => m.comandos) },
          analise ? { rotulo: 'Gasto estimado no mês', valor: brl(analise.mes.custo), dica: `projeção ${brl(analise.mes.projecao)}${analise.mes.meta ? ` · meta ${brl(analise.mes.meta)}` : ''}`, tom: analise.mes.meta && analise.mes.projecao > analise.mes.meta ? 'ruim' : undefined, serie: analise.semana.por_dia.map((d) => d.horas) }
            : { rotulo: 'Agendamentos ativos', valor: totais.agendamentos, dica: `${dados.projetos} projeto${dados.projetos === 1 ? '' : 's'} no total` },
        ]} />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        {(() => {
          // projeto escolhido com 2 ou mais ares (ou "ver lado a lado" no destaque): todos os ares da sala juntos
          const pid = salaLado || (projeto && aparelhos.filter((a) => a.projeto_id === projeto.id).length > 1 ? projeto.id : null)
          const daSala = pid ? aparelhos.filter((a) => a.projeto_id === pid) : []
          if (daSala.length > 1) return <AresDaSala ares={daSala} aoMudar={atualizar} aparencia={planta?.mapa?.ares || {}} modelos={planta?.mapa?.modelos} titulo={daSala[0].projeto_nome || 'Sala'} fechar={salaLado ? () => setSalaLado(null) : null} />
          return null
        })()}
        {aparelhos.length > 0 && !(salaLado || (projeto && aparelhos.filter((a) => a.projeto_id === projeto.id).length > 1)) ? <Destaque aparelhos={aparelhos} aoMudar={atualizar} aparencia={planta?.mapa?.ares || {}} modelos={planta?.mapa?.modelos} verSala={setSalaLado} /> : aparelhos.length > 0 ? null : (
          <div className="cartao flex flex-col items-center justify-center p-10 text-center lg:col-span-2">
            <AirVent className="mb-3 h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="font-medium">Nenhum aparelho neste projeto</p>
            <Link to="/aparelhos?novo=1" className="mt-4"><Botao icone={Plus}>Adicionar aparelho</Botao></Link>
          </div>
        )}
        <motion.div custom={5} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
          <h2 className="titulo-secao">Integrações</h2>
          <p className="text-xs text-muted-foreground">Estado de cada serviço agora</p>
          <ul className="mt-4 space-y-3">
            {status.map((s) => (
              <li key={s.nome} className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{s.det}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link to="/integracoes" className="mt-5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Configurar integrações <ChevronRight className="h-3 w-3" /></Link>
        </motion.div>
      </div>

      {analise && (
        <div className="grid gap-6 lg:grid-cols-3">
          <motion.div custom={6} variants={entrar} initial="hidden" animate="show" className="cartao p-5 lg:col-span-2">
            <div className="mb-3 flex items-end justify-between">
              <div><h2 className="titulo-secao">O que mudou na semana</h2><p className="text-xs text-muted-foreground">Leitura automática dos últimos 7 dias</p></div>
              <Link to="/relatorios" className="text-xs text-muted-foreground hover:text-foreground">Relatório completo</Link>
            </div>
            <ul className="space-y-2.5">
              {analise.semana.conclusoes.map((c, i) => {
                const [I, cor] = c.tipo === 'alerta' ? [AlertTriangle, 'text-amber-500'] : c.tipo === 'bom' ? [CheckCircle2, 'text-emerald-500'] : [Info, 'text-sky-500']
                return <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05 }} className="flex gap-2.5 text-sm"><I className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} /><span>{c.texto}</span></motion.li>
              })}
            </ul>
          </motion.div>
          <motion.div custom={7} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
            <h2 className="titulo-secao">Gasto com os ares</h2>
            <p className="mb-3 text-xs text-muted-foreground">Mês atual, estimado pela potência de cada aparelho</p>
            <Medidor mes={analise.mes} />
          </motion.div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div custom={8} variants={entrar} initial="hidden" animate="show" className="cartao overflow-hidden lg:col-span-2">
          <div className="flex items-end justify-between border-b border-border px-5 py-3.5">
            <div><h2 className="titulo-secao">Escritório ao vivo</h2><p className="text-xs text-muted-foreground">Planta em 3D com o estado de cada ar · arraste para girar</p></div>
            <Link to="/mapa" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><MapaIcone className="h-3.5 w-3.5" />Abrir o mapa</Link>
          </div>
          <div className="relative h-[320px] sm:h-[380px]">
            {plantaPronta ? (
              <QuandoVisivel fallback={<Esqueleto className="h-full rounded-none" />}><Suspense fallback={<Esqueleto className="h-full rounded-none" />}>
                <Mapa3D compacto mapa={plantaPronta.mapa} ares={plantaPronta.ares} projetos={plantaPronta.projetos} aoSelecionar={() => {}} />
              </Suspense></QuandoVisivel>
            ) : <Esqueleto className="h-full rounded-none" />}
          </div>
        </motion.div>
        <motion.div custom={9} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
          <h2 className="titulo-secao">De onde vêm os comandos</h2>
          <p className="text-xs text-muted-foreground">Últimos 7 dias</p>
          {!analise ? <Esqueleto className="mt-4 h-56" /> : !analise.semana.por_origem.length ? <p className="pt-16 text-center text-sm text-muted-foreground">Sem comandos na semana.</p> : (
            <>
              <div className="relative mx-auto mt-2 h-44 w-44">
                <ResponsiveContainer><PieChart><Pie data={analise.semana.por_origem.map((o) => ({ ...o, nome: NOMES_ORIGEM[o.origem] || o.origem }))} dataKey="comandos" nameKey="nome" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none">
                  {analise.semana.por_origem.map((o, i) => <Cell key={o.origem} fill={CORES_ORIGEM[i % CORES_ORIGEM.length]} />)}
                </Pie><Tooltip content={<DicaGrafico />} /></PieChart></ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-2xl font-semibold tabular">{analise.semana.resumo.comandos}</span><span className="text-[11px] text-muted-foreground">comandos</span></div>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {analise.semana.por_origem.map((o, i) => (
                  <li key={o.origem} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES_ORIGEM[i % CORES_ORIGEM.length] }} /><span className="flex-1">{NOMES_ORIGEM[o.origem] || o.origem}</span>
                    <span className="tabular text-muted-foreground">{o.comandos} · {Math.round((o.comandos / Math.max(1, analise.semana.resumo.comandos)) * 100)}%</span></li>
                ))}
              </ul>
            </>
          )}
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
      <motion.div custom={10} variants={entrar} initial="hidden" animate="show" className="cartao p-5 lg:col-span-2">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="titulo-secao">Comandos por dia</h2>
            <p className="text-xs text-muted-foreground">Enviados e com falha nos últimos 14 dias (todos os projetos)</p>
          </div>
          <Link to="/relatorios" className="text-xs text-muted-foreground hover:text-foreground">Relatórios</Link>
        </div>
        <div className="h-64">
          {serie.length === 0 ? <p className="pt-20 text-center text-sm text-muted-foreground">O gráfico aparece depois da primeira hora de uso.</p> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickLine={false} axisLine={false} width={30} fontSize={11} allowDecimals={false} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<DicaGrafico />} />
                <Area dataKey="falhas" name="Falhas" type="monotone" stroke="#dc2626" strokeDasharray="4 4" fill="none" strokeWidth={2} />
                <Area dataKey="comandos" name="Comandos" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>
        <motion.div custom={11} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
          <h2 className="titulo-secao">Uso por hora</h2>
          <p className="mb-3 text-xs text-muted-foreground">Comandos nos últimos 7 dias, horário de Brasília</p>
          <div className="h-56">
            {!analise ? <Esqueleto className="h-full" /> : (
              <ResponsiveContainer><BarChart data={analise.semana.por_hora.map((h) => ({ ...h, rotulo: `${h.hora}h` }))} margin={{ left: -18, right: 0 }}>
                <XAxis dataKey="rotulo" interval={5} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<DicaGrafico />} cursor={{ fill: 'hsl(var(--muted))' }} />
                <Bar dataKey="comandos" name="Comandos" radius={[3, 3, 0, 0]}>
                  {analise.semana.por_hora.map((h) => <Cell key={h.hora} fill={`hsl(var(--primary) / ${0.3 + (h.comandos / Math.max(1, ...analise.semana.por_hora.map((x) => x.comandos))) * 0.7})`} />)}
                </Bar>
              </BarChart></ResponsiveContainer>
            )}
          </div>
        </motion.div>
      </div>

      {analise && (
        <motion.div custom={12} variants={entrar} initial="hidden" animate="show" className="cartao overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-3.5">
            <div><h2 className="titulo-secao">Mapa de uso</h2><p className="text-xs text-muted-foreground">Comandos por dia da semana e hora, nos últimos 7 dias: quando o escritório mais mexe nos ares.</p></div>
            <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Vista do mapa de uso">
              {[['grade', 'Grade'], ['3d', '3D']].map(([k, r]) => <button key={k} onClick={() => setVistaUso(k)} aria-pressed={vistaUso === k} className={`rounded-md px-2.5 py-1 ${vistaUso === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{r}</button>)}
            </div>
          </div>
          {vistaUso === '3d'
            ? <div className="h-[300px] sm:h-[340px]"><QuandoVisivel fallback={<Esqueleto className="h-full rounded-none" />}><Suspense fallback={<Esqueleto className="h-full rounded-none" />}><Barras3D mapa={analise.semana.mapa_calor} /></Suspense></QuandoVisivel></div>
            : <MapaUso mapa={analise.semana.mapa_calor} />}
        </motion.div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <motion.div custom={7} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="titulo-secao">Aparelhos</h2>
              <p className="text-xs text-muted-foreground">Botões gravados e temperatura atual</p>
            </div>
            <Link to="/aparelhos" className="text-xs text-muted-foreground hover:text-foreground">Ver todos</Link>
          </div>
          <div className="space-y-5">
            {aparelhos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aparelho.</p>}
            {aparelhos.slice(0, 6).map((a) => {
              const pct = Math.min(100, Math.round((a.total_codigos / Math.max(1, a.temp_max - a.temp_min + 2)) * 100))
              return (
                <Link key={a.id} to={`/aparelhos/${a.id}`} className="block space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{a.nome}</p>
                    {a.ligado ? <Selo cor="verde">{MODOS[a.modo]} {a.temperatura}°</Selo> : <Selo>Desligado</Selo>}
                  </div>
                  <p className="text-xs text-muted-foreground">{[a.projeto_nome, a.comodo, a.hub_nome].filter(Boolean).join(' · ')}</p>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular">{a.total_codigos} botões</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </motion.div>

        <motion.div custom={8} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="titulo-secao">Atividade recente</h2>
              <p className="text-xs text-muted-foreground">Últimos comandos e eventos</p>
            </div>
            <Link to="/atividade" className="text-xs text-muted-foreground hover:text-foreground">Ver tudo</Link>
          </div>
          <ol className="space-y-4">
            {atividade.length === 0 && <p className="text-sm text-muted-foreground">Sem atividade ainda.</p>}
            {atividade.map((t, i) => (
              <motion.li key={t.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }} className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${t.ok ? 'bg-muted text-muted-foreground' : 'bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300'}`}>
                  {rotuloOrigem(t.origem).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">
                    {t.aparelho_nome && <span className="font-medium">{t.aparelho_nome} </span>}
                    <span className="text-muted-foreground">{t.acao.charAt(0).toLowerCase() + t.acao.slice(1)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{rotuloOrigem(t.origem)} · {haQuanto(t.quando)}{!t.ok && ' · falhou'}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      </div>
    </div>
  )
}
