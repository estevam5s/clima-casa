import { Suspense, lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AirVent, ChevronRight, Minus, Plus, Power, Sparkles } from 'lucide-react'
import { MODOS, VENTILACAO, api, haQuanto, rotuloOrigem } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { useTema } from '../tema'
import { useMarca } from '../marca'
import { Aviso, Botao, Carregando, FaixaMetricas, Ponto, Selo, useToast } from '../components/ui'

const Cena3D = lazy(() => import('../components/Cena3D'))
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
  const [erro, setErro] = useState('')

  useEffect(() => {
    setDados(null)
    api.get(comFiltro('/api/painel', filtro)).then(setDados).catch((e) => setErro(e.message))
    api.get('/api/metricas?dias=14').then(setMetricas).catch(() => {})
  }, [filtro])

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
          { rotulo: 'Comandos nas últimas 24 h', valor: totais.comandos_24h, dica: totais.falhas_24h ? `${totais.falhas_24h} com falha` : 'nenhuma falha', tom: totais.falhas_24h ? 'ruim' : '' },
          { rotulo: 'Agendamentos ativos', valor: totais.agendamentos, dica: `${dados.projetos} projeto${dados.projetos === 1 ? '' : 's'} no total` },
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

      <motion.div custom={6} variants={entrar} initial="hidden" animate="show" className="cartao p-5">
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
