import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AirVent, AlertTriangle, CheckCircle2, ChevronRight, Info, Map as MapaIcone, Minus, Plus, Power, Sparkles } from 'lucide-react'
import { MODOS, VENTILACAO, api, haQuanto, rotuloOrigem } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { useTema } from '../tema'
import { useMarca } from '../marca'
import { Aviso, Botao, Carregando, Esqueleto, FaixaMetricas, Ponto, Selo, useToast } from '../components/ui'
import { completar } from '../mapaUtil'

const Cena3D = lazy(() => import('../components/Cena3D'))
const Mapa3D = lazy(() => import('../components/Mapa3D'))
const Barras3D = lazy(() => import('../components/Barras3D'))
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

function Destaque({ aparelhos, aoMudar }) {
  const { escuro } = useTema()
  const [id, setId] = useState(() => (aparelhos.find((a) => a.ligado) || aparelhos[0])?.id)
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const ar = aparelhos.find((a) => a.id === id) || aparelhos[0]
  const [fora, setFora] = useState(null)
  useEffect(() => { if (!aparelhos.some((a) => a.id === id)) setId(aparelhos[0]?.id) }, [aparelhos, id])
  useEffect(() => {
    if (!ar) return undefined
    const buscar = () => api.get(`/api/clima-externo${ar.projeto_id ? `?projeto_id=${ar.projeto_id}` : ''}`).then(setFora).catch(() => {})
    buscar()
    const t = setInterval(buscar, 5 * 60 * 1000) // a temperatura de fora atualiza a cada 5 min
    return () => clearInterval(t)
  }, [ar?.projeto_id])
  if (!ar) return null
  const mudar = async (e) => {
    setOcupado(true)
    try { aoMudar(await api.post(`/api/aparelhos/${ar.id}/estado`, e)) } catch (err) { toast(err.message, 'erro') } finally { setOcupado(false) }
  }
  const corTemp = !ar.ligado ? 'text-muted-foreground/50' : ar.modo === 'quente' ? 'text-quente' : 'text-frio dark:text-sky-400'
  return (
    <motion.div custom={4} variants={entrar} initial="hidden" animate="show" className="cartao overflow-hidden lg:col-span-2">
      <div className="grid md:grid-cols-[1.25fr_1fr]">
        <div className="relative h-64 border-b border-border md:h-auto md:min-h-[320px] md:border-b-0 md:border-r">
          <Suspense fallback={<div className="h-full animate-pulse bg-muted" />}>
            <Cena3D key={escuro ? 'escuro' : 'claro'} estado={{ ...ar, externa: fora?.disponivel ? fora.temperatura : null, umidade: fora?.disponivel ? fora.umidade : null }} />
          </Suspense>
          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs backdrop-blur">
            <Ponto ativo={ar.ligado} /> {ar.ligado ? `${MODOS[ar.modo]} · ventilação ${VENTILACAO[ar.ventilador].toLowerCase()}` : 'Desligado'}
          </div>
          {fora?.disponivel && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} title={`Fonte: ${fora.fonte} · atualizado ${fora.atualizado?.slice(11, 16) || ''}`}
              className="pointer-events-none absolute bottom-4 left-4 rounded-xl border border-border bg-card/80 px-3 py-2 text-xs backdrop-blur">
              <p className="text-muted-foreground">Lá fora{fora.cidade ? ` · ${fora.cidade}` : ''}</p>
              <p className="mt-0.5 flex items-baseline gap-2"><span className="text-lg font-semibold tabular">{Math.round(fora.temperatura)}°</span>
                <span className="text-muted-foreground">sensação {Math.round(fora.sensacao)}° · {fora.umidade}% · {fora.condicao}</span></p>
              {!!ar.ligado && <p className="mt-0.5 text-muted-foreground">Diferença para o ajuste: <span className="tabular text-foreground">{Math.round(fora.temperatura - ar.temperatura)}°</span></p>}
            </motion.div>
          )}
        </div>
        <div className="flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <select value={ar.id} onChange={(e) => setId(Number(e.target.value))} aria-label="Escolher aparelho"
                className="-ml-1 w-full truncate rounded-md bg-transparent px-1 text-base font-semibold hover:bg-muted">
                {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
              <p className="truncate text-xs text-muted-foreground">{[ar.projeto_nome, ar.comodo].filter(Boolean).join(' · ') || 'Sem cômodo'}</p>
            </div>
            <Link to={`/aparelhos/${ar.id}`} className="text-xs text-muted-foreground hover:text-foreground">Detalhes</Link>
          </div>
          <div className="my-6 flex items-center justify-center gap-5">
            <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })} disabled={ocupado || ar.temperatura <= ar.temp_min || !ar.hub_id}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label="Diminuir"><Minus className="h-4 w-4" /></button>
            <motion.p key={`${ar.temperatura}-${ar.ligado}`} initial={{ scale: 0.92, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}
              className={`text-6xl font-semibold tracking-tight tabular ${corTemp}`}>{ar.temperatura}<span className="align-top text-2xl">°</span></motion.p>
            <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })} disabled={ocupado || ar.temperatura >= ar.temp_max || !ar.hub_id}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label="Aumentar"><Plus className="h-4 w-4" /></button>
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {ar.modos.split(',').map((m) => (
              <button key={m} disabled={ocupado || !ar.hub_id} onClick={() => mudar({ ligado: true, modo: m })}
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${ar.ligado && ar.modo === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{MODOS[m]}</button>
            ))}
          </div>
          <Botao className="mt-auto w-full" variante={ar.ligado ? 'secundario' : 'primario'} icone={Power} carregando={ocupado} disabled={!ar.hub_id}
            onClick={() => mudar({ ligado: !ar.ligado })}>{ar.ligado ? 'Desligar' : 'Ligar'}</Botao>
          {!ar.total_codigos && <p className="ajuda mt-2 text-center">Grave os botões do controle original na tela do aparelho.</p>}
        </div>
      </div>
    </motion.div>
  )
}

export default function Painel() {
  const { filtro, projeto } = useProjeto()
  const { marca } = useMarca()
  const [dados, setDados] = useState(null)
  const [metricas, setMetricas] = useState([])
  const [analise, setAnalise] = useState(null)
  const [planta, setPlanta] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setDados(null)
    api.get(comFiltro('/api/painel', filtro)).then(setDados).catch((e) => setErro(e.message))
    api.get('/api/metricas?dias=14').then(setMetricas).catch(() => {})
    setAnalise(null)
    api.get(comFiltro('/api/painel/analise', filtro)).then(setAnalise).catch(() => setAnalise(false))
  }, [filtro])
  useEffect(() => {
    const buscar = () => { if (!document.hidden) api.get('/api/mapa').then(setPlanta).catch(() => {}) }
    buscar(); const t = setInterval(buscar, 20000); return () => clearInterval(t)
  }, [])
  const plantaPronta = useMemo(() => (planta ? { ...planta, mapa: completar(planta.mapa, planta.projetos, planta.ares) } : null), [planta])

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const { totais, aparelhos, atividade } = dados
  const atualizar = (novo) => setDados((d) => {
    const lista = d.aparelhos.map((a) => (a.id === novo.id ? { ...a, ...novo } : a))
    return { ...d, aparelhos: lista, totais: { ...d.totais, ligados: lista.filter((a) => a.ligado).length } }
  })
  const serie = metricas.map((m) => ({ dia: m.dia.slice(8, 10) + '/' + m.dia.slice(5, 7), comandos: m.comandos, falhas: m.falhas }))
  const status = [
    { nome: 'Agente do Mac', ok: dados.agente.online, det: dados.agente.online ? 'executando comandos' : `offline${dados.agente.visto_em ? `, visto ${haQuanto(dados.agente.visto_em)}` : ''}` },
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
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/cenas"><Botao variante="secundario" icone={Sparkles}>Cenas</Botao></Link>
          <Link to="/aparelhos?novo=1"><Botao icone={Plus}>Novo aparelho</Botao></Link>
        </div>
      </motion.div>

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
        {aparelhos.length > 0 ? <Destaque aparelhos={aparelhos} aoMudar={atualizar} /> : (
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
          <div className="relative h-[380px]">
            {plantaPronta ? (
              <Suspense fallback={<Esqueleto className="h-full rounded-none" />}>
                <Mapa3D compacto mapa={plantaPronta.mapa} ares={plantaPronta.ares} projetos={plantaPronta.projetos} aoSelecionar={() => {}} />
              </Suspense>
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
          <div className="flex items-end justify-between border-b border-border px-5 py-3.5">
            <div><h2 className="titulo-secao">Mapa de uso em 3D</h2><p className="text-xs text-muted-foreground">Cada barra é um dia da semana numa hora; a altura é o número de comandos (7 dias). Passe o mouse para ver o valor.</p></div>
          </div>
          <div className="h-[340px]"><Suspense fallback={<Esqueleto className="h-full rounded-none" />}><Barras3D mapa={analise.semana.mapa_calor} /></Suspense></div>
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
