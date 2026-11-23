import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Download, Eye, FileCode2, FileJson, FileSpreadsheet, FileText, FileType2, Globe, Info, Mail, Printer, RefreshCw } from 'lucide-react'
import { avisoEmail } from '../emailAviso'
import { api, dataHora, rotuloOrigem } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Secao, useDados, useToast } from '../components/ui'
import { simboloTemp, temp } from '../marcaAtual'

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [365, '12 meses'], [0, 'Datas']]
const FORMATOS = [
  ['pdf', 'PDF', 'Relatório pronto para imprimir ou enviar', FileText],
  ['docx', 'Word (DOCX)', 'Editável no Word ou Google Docs', FileType2],
  ['xlsx', 'Excel (XLSX)', 'Uma aba por tabela, com gráfico', FileSpreadsheet],
  ['csv', 'CSV (ZIP)', 'Uma planilha por tabela, separador ;', FileSpreadsheet],
  ['html', 'HTML', 'Página única que abre em qualquer navegador', Globe],
  ['xml', 'XML', 'Para integrar com outros sistemas', FileCode2],
  ['json', 'JSON', 'Dados completos, para scripts e BI', FileJson],
  ['md', 'Markdown', 'Para colar em wiki, Notion ou GitHub', FileText],
]
const ORIGENS = [['painel', 'Painel', 'hsl(var(--primary))'], ['alexa', 'Alexa', '#2563a8'], ['agenda', 'Agenda', '#c2410c'], ['automacao', 'Automação', '#7c3aed'], ['cena', 'Cena', '#0891b2']]
const CORES_MODO = ['hsl(var(--primary))', '#2563a8', '#f59e0b', '#7c3aed', '#0891b2', '#71717a']
const varTxt = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR')}%`)
const eixo = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'hsl(var(--muted-foreground))' }
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
const diasAtras = (n) => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10)

function Dica({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xl"> {/* marca: dica do gráfico flutua */}
      <p className="font-medium">{label}</p>
      {payload.filter((p) => p.value).map((p) => <p key={p.dataKey} className="text-muted-foreground">{p.name}: <span className="font-mono text-foreground">{p.value}</span></p>)}
    </div>
  )
}

function MenuExportar({ consulta }) {
  const toast = useToast()
  const [aberto, setAberto] = useState(false)
  const [baixando, setBaixando] = useState(null)
  // modelo do PDF/Word: oficial da Prefeitura (brasão, cabeçalho e seções numeradas) ou o moderno da marca
  const [modelo, setModelo] = useState(() => { try { return localStorage.getItem('clima-rel-modelo') || 'pmf' } catch { return 'pmf' } })
  const mudarModelo = (m) => { setModelo(m); try { localStorage.setItem('clima-rel-modelo', m) } catch { /* sem armazenamento */ } }
  // ao gerar, manda também para o e-mail de quem gerou (com o arquivo anexo); a escolha fica salva neste navegador
  const [porEmail, setPorEmail] = useState(() => { try { return localStorage.getItem('clima-rel-email') !== '0' } catch { return true } })
  const mudarPorEmail = (v) => { setPorEmail(v); try { localStorage.setItem('clima-rel-email', v ? '1' : '0') } catch { /* sem armazenamento */ } }
  const enviarEmail = async (f) => {
    const q = Object.fromEntries(new URLSearchParams(consulta))
    const corpo = { formato: f, modelo, dias: +(q.dias || 30), inicio: q.inicio || null, fim: q.fim || null,
      projeto_id: q.projeto_id ? +q.projeto_id : null, aparelho_id: q.aparelho_id ? +q.aparelho_id : null }
    const r = await api.post('/api/relatorios/enviar', corpo)
    return r.enviados
  }
  const ref = useRef(null)
  useEffect(() => {
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])
  const baixar = async (f) => {
    setBaixando(f)
    try {
      const nome = await api.baixar(`/api/relatorios/exportar?formato=${f}&modelo=${modelo}&${consulta}`)
      toast(`Relatório salvo: ${nome}`)
      setAberto(false)
      if (porEmail) {
        try { const para = await enviarEmail(f); toast(avisoEmail(para, 'Também enviado por e-mail para')) } catch (e) { toast(`Baixado, mas o e-mail não foi: ${e.message}`, 'erro') }
      }
    } catch (e) { toast(e.message, 'erro') } finally { setBaixando(null) }
  }
  const soEnviar = async () => {
    setBaixando('email')
    try { const para = await enviarEmail('pdf'); toast(avisoEmail(para, 'Relatório em PDF enviado para')); setAberto(false) } catch (e) { toast(e.message, 'erro') } finally { setBaixando(null) }
  }
  return (
    <div ref={ref} className="relative">
      <Botao icone={Download} onClick={() => setAberto((a) => !a)}>Exportar<ChevronDown className="h-3.5 w-3.5" /></Botao>
      <AnimatePresence>
        {aberto && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
            className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-border bg-card p-1.5 shadow-xl"> {/* marca: menu flutua */}
            <div className="mb-1 border-b border-border px-3 pb-2 pt-1.5">
              <p className="text-xs font-medium text-muted-foreground">Modelo do PDF e do Word</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5" role="group" aria-label="Modelo do documento">
                {[['pmf', 'Prefeitura', 'Brasão, cabeçalho oficial, seções 1 – 1.1'], ['moderno', 'Moderno', 'Capa colorida com a marca']].map(([k, r, dsc]) => (
                  <button key={k} onClick={() => mudarModelo(k)} aria-pressed={modelo === k} title={dsc}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs ${modelo === k ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{r}<span className="block text-[10px] font-normal text-muted-foreground">{dsc}</span></button>
                ))}
              </div>
            </div>
            {FORMATOS.map(([f, nome, desc, Icone]) => (
              <button key={f} onClick={() => baixar(f)} disabled={!!baixando}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted disabled:opacity-60">
                <Icone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0"><span className="block text-sm font-medium">{baixando === f ? 'Gerando…' : nome}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
              </button>
            ))}
            <div className="mt-1 space-y-1.5 border-t border-border px-3 pb-1.5 pt-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={porEmail} onChange={(e) => mudarPorEmail(e.target.checked)} className="h-3.5 w-3.5 accent-[hsl(var(--primary))]" />
                Ao baixar, enviar também para o meu e-mail (arquivo anexo)
              </label>
              <button onClick={soEnviar} disabled={!!baixando} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs font-medium text-primary hover:underline disabled:opacity-60">
                <Mail className="h-3.5 w-3.5" />{baixando === 'email' ? 'Enviando…' : 'Só enviar por e-mail (PDF), sem baixar'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function MapaCalor({ mapa }) {
  const max = Math.max(1, ...mapa.flatMap((l) => l.horas))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] table-fixed border-separate border-spacing-[3px] text-[11px]">
        <thead><tr><th className="w-10" />{Array.from({ length: 24 }, (_, h) => <th key={h} className="font-normal text-muted-foreground">{h % 3 === 0 ? `${h}h` : ''}</th>)}</tr></thead>
        <tbody>
          {mapa.map((l, i) => (
            <tr key={l.dia}>
              <th className="pr-1 text-left font-normal text-muted-foreground">{l.dia}</th>
              {l.horas.map((v, h) => (
                <motion.td key={h} title={`${l.dia} ${h}h: ${v} comando(s)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (i * 24 + h) * 0.002 }}
                  className="h-5 rounded-[3px]" style={{ background: v ? `hsl(var(--primary) / ${0.15 + (v / max) * 0.85})` : 'hsl(var(--muted))' }} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        menos {[0.15, 0.4, 0.65, 1].map((o) => <span key={o} className="h-3 w-3 rounded-[3px]" style={{ background: `hsl(var(--primary) / ${o})` }} />)} mais
      </div>
    </div>
  )
}

function Tarifa({ valor, aoSalvar }) {
  const toast = useToast()
  const [v, setV] = useState(String(valor).replace('.', ','))
  useEffect(() => setV(String(valor).replace('.', ',')), [valor])
  const salvar = async () => {
    const n = Number(v.replace(',', '.'))
    if (!(n >= 0 && n <= 20)) { toast('Informe a tarifa em R$/kWh, entre 0 e 20.', 'erro'); return }
    if (n === valor) return
    try {
      const atual = await api.get('/api/config')
      await api.put('/api/config', { modo_envio: atual.modo_envio, nome_casa: atual.nome_casa, tarifa_kwh: n })
      toast('Tarifa atualizada.'); aoSalvar()
    } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Tarifa
      <span className="flex items-center rounded-lg border border-border bg-card pl-2.5">
        R$<input value={v} onChange={(e) => setV(e.target.value)} onBlur={salvar} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          inputMode="decimal" className="w-14 bg-transparent px-1.5 py-1.5 text-sm tabular text-foreground outline-none" aria-label="Tarifa de energia em reais por kWh" />
      </span>/kWh
    </label>
  )
}

export default function Relatorios() {
  const { filtro, projeto } = useProjeto()
  const [dias, setDias] = useState(30)
  const [inicio, setInicio] = useState(diasAtras(30))
  const [fim, setFim] = useState(hoje())
  const [aparelho, setAparelho] = useState('')
  const [ordem, setOrdem] = useState(['comandos', -1])
  const { dados: aparelhos } = useDados(() => api.get(comFiltro('/api/aparelhos', filtro)), [filtro])
  const consulta = useMemo(() => {
    const p = new URLSearchParams(dias ? { dias } : { inicio, fim })
    if (aparelho) p.set('aparelho_id', aparelho)
    return filtro ? `${p}&${filtro}` : String(p)
  }, [dias, inicio, fim, aparelho, filtro])
  const { dados, erro, recarregar } = useDados(() => api.get(`/api/relatorios/completo?${consulta}`), [consulta])

  const r = dados?.resumo
  const diario = useMemo(() => (dados?.por_dia || []).map((d) => ({ ...d, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}`, outros: Math.max(0, d.comandos - d.alexa - d.agenda - d.painel - d.automacao - (d.cena || 0)) })), [dados])
  const horas = (dados?.por_hora || []).map((h) => ({ ...h, rotulo: `${String(h.hora).padStart(2, '0')}h` }))
  const maxHora = Math.max(1, ...horas.map((h) => h.comandos))
  const pico = horas.reduce((m, h) => (h.comandos > m.comandos ? h : m), { comandos: 0 })
  const totalOrigem = (dados?.por_origem || []).reduce((s, o) => s + o.comandos, 0) || 1
  const linhas = useMemo(() => [...(dados?.por_aparelho || [])].sort((a, b) => ((a[ordem[0]] ?? 0) > (b[ordem[0]] ?? 0) ? 1 : -1) * ordem[1]), [dados, ordem])
  const ordenar = (c) => setOrdem(([oc, od]) => [c, oc === c ? -od : -1])
  const Cab = ({ c, children, dir }) => (
    <th className={dir ? '!text-right' : ''}><button onClick={() => ordenar(c)} className="inline-flex items-center gap-1 hover:text-foreground">{children}
      {ordem[0] === c && (ordem[1] < 0 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}</button></th>
  )
  const periodo = dados ? `${new Date(dados.inicio * 1000).toLocaleDateString('pt-BR')} a ${new Date(dados.fim * 1000).toLocaleDateString('pt-BR')}` : ''
  const variacao = r?.variacao_comandos_pct

  return (
    <>
      <Cabecalho titulo="Relatórios"
        descricao={`Uso, consumo estimado e falhas ${projeto ? `em ${projeto.nome}` : 'em todos os projetos'}${periodo ? ` · ${periodo}` : ''}.`}
        acoes={<>
          <Botao variante="secundario" icone={Eye} onClick={async () => {
            const w = window.open('', '_blank'); if (w) w.document.write('<p style="font:14px sans-serif;padding:24px">Gerando o relatório…</p>')
            try { const html = await api.texto(`/api/relatorios/exportar?formato=html&${consulta}`); if (w) { w.document.open(); w.document.write(html); w.document.close() } } catch (e) { if (w) w.close() }
          }} className="print:hidden">Pré-visualizar</Botao>
          <Botao variante="secundario" icone={Printer} onClick={() => window.print()} className="print:hidden">Imprimir</Botao>
          <MenuExportar consulta={consulta} />
        </>} />

      <div className="cartao mb-6 flex flex-wrap items-center gap-3 p-3 print:hidden">
        <div className="flex rounded-lg border border-border bg-background p-0.5">
          {PERIODOS.map(([d, rot]) => (
            <button key={d} onClick={() => setDias(d)} className={`relative rounded-md px-3 py-1.5 text-sm ${dias === d ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              {dias === d && <motion.span layoutId="periodo-rel" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', duration: 0.3 }} />}
              <span className="relative">{rot}</span>
            </button>
          ))}
        </div>
        {dias === 0 && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="campo h-9 w-auto" aria-label="Data inicial" />
            <span className="text-muted-foreground">até</span>
            <input type="date" value={fim} min={inicio} max={hoje()} onChange={(e) => setFim(e.target.value)} className="campo h-9 w-auto" aria-label="Data final" />
          </div>
        )}
        <select value={aparelho} onChange={(e) => setAparelho(e.target.value)} className="campo h-9 w-auto" aria-label="Filtrar por aparelho">
          <option value="">Todos os aparelhos</option>
          {(aparelhos || []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {dados && <Tarifa valor={dados.tarifa_kwh} aoSalvar={recarregar} />}
          <Botao variante="fantasma" tamanho="sm" icone={RefreshCw} onClick={recarregar} aria-label="Atualizar" />
        </div>
      </div>

      {erro && <Aviso>{erro}</Aviso>}
      {!dados && !erro && <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-72" /><Esqueleto className="h-56" /></div>}

      {dados && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <FaixaMetricas itens={[
            { rotulo: 'Comandos no período', valor: r.comandos, tom: variacao == null ? undefined : variacao >= 0 ? 'bom' : 'ruim',
              dica: variacao == null ? 'Sem dados do período anterior' : `${variacao > 0 ? '+' : ''}${variacao.toLocaleString('pt-BR')}% vs período anterior (${r.comandos_periodo_anterior})` },
            { rotulo: 'Taxa de sucesso', valor: r.sucesso_pct, casas: 1, sufixo: '%', tom: r.falhas ? 'ruim' : 'bom', dica: r.falhas ? `${r.falhas} falha(s)` : 'Nenhuma falha' },
            { rotulo: 'Horas ligado (estimado)', valor: r.horas_ligado, casas: 1, sufixo: 'h', dica: `${r.kwh.toLocaleString('pt-BR')} kWh estimados` },
            { rotulo: 'Custo estimado', valor: brl(r.custo), tom: r.variacao_custo_pct == null ? undefined : r.variacao_custo_pct <= 0 ? 'bom' : 'ruim', dica: `${varTxt(r.variacao_custo_pct)} vs anterior · projeção ${brl(r.projecao_mes ?? 0)}/mês` },
          ]} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Secao titulo="O que os números dizem" contexto="Leitura automática do período, a mesma que abre o PDF">
              <ul className="-my-1 space-y-2.5">
                {(dados.conclusoes || []).map((c, i) => {
                  const [I, cor] = c.tipo === 'alerta' ? [AlertTriangle, 'text-amber-500'] : c.tipo === 'bom' ? [CheckCircle2, 'text-emerald-500'] : [Info, 'text-sky-500']
                  return <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className="flex gap-2.5 text-sm"><I className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} /><span>{c.texto}</span></motion.li>
                })}
              </ul>
            </Secao>
            <Secao titulo="Comparado ao período anterior" contexto="Mesma duração, logo antes">
              <dl className="-my-1 divide-y divide-border text-sm">
                {[['Comandos', r.comandos, r.comandos_periodo_anterior, r.variacao_comandos_pct, (v) => v],
                  ['Horas ligado', r.horas_ligado, r.horas_periodo_anterior, r.variacao_horas_pct, (v) => `${(v ?? 0).toLocaleString('pt-BR')} h`],
                  ['Consumo', r.kwh, r.kwh_periodo_anterior, r.variacao_custo_pct, (v) => `${(v ?? 0).toLocaleString('pt-BR')} kWh`],
                  ['Custo', r.custo, r.custo_periodo_anterior, r.variacao_custo_pct, (v) => brl(v ?? 0)]].map(([rot, a, b, v, f]) => (
                  <div key={rot} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-muted-foreground">{rot}</dt>
                    <dd className="text-right"><span className="font-medium tabular">{f(a)}</span><span className="ml-2 text-xs text-muted-foreground">antes {f(b)}</span>
                      <span className={`ml-2 text-xs font-medium ${v == null ? 'text-muted-foreground' : v > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{varTxt(v)}</span></dd>
                  </div>
                ))}
                <div className="flex justify-between py-2"><dt className="text-muted-foreground">Fora do expediente</dt><dd className="tabular">{(r.fora_expediente_h ?? 0).toLocaleString('pt-BR')} h · {(r.fora_expediente_pct ?? 0).toLocaleString('pt-BR')}% · {brl(r.custo_fora_expediente ?? 0)}</dd></div>
                <div className="flex justify-between py-2"><dt className="text-muted-foreground">Projeção para 30 dias</dt><dd className="font-medium tabular">{brl(r.projecao_mes ?? 0)} <span className="text-xs font-normal text-muted-foreground">({(r.projecao_kwh_mes ?? 0).toLocaleString('pt-BR')} kWh)</span></dd></div>
              </dl>
            </Secao>
          </div>

          <Secao titulo="Comandos por dia" contexto="Empilhado por origem do comando">
            <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
              {ORIGENS.map(([k, rot, cor]) => <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />{rot}</span>)}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />Outros</span>
            </div>
            <div className="h-72">
              {diario.length === 0 ? <p className="pt-24 text-center text-sm text-muted-foreground">Nenhum comando no período. Escolha um período maior ou outro aparelho.</p> : (
                <ResponsiveContainer><BarChart data={diario} margin={{ left: 0, right: 8 }} maxBarSize={48}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rotulo" {...eixo} tickMargin={8} minTickGap={12} /><YAxis {...eixo} width={30} allowDecimals={false} />
                  <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  {ORIGENS.map(([k, rot, cor]) => <Bar key={k} dataKey={k} name={rot} stackId="o" fill={cor} />)}
                  <Bar dataKey="outros" name="Outros" stackId="o" fill="hsl(var(--muted-foreground) / 0.4)" radius={[3, 3, 0, 0]} />
                </BarChart></ResponsiveContainer>
              )}
            </div>
          </Secao>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Secao titulo="Horários de uso" contexto={pico.comandos ? `Pico às ${pico.rotulo} (horário de Brasília)` : 'Horário de Brasília'}>
              <div className="h-56">
                <ResponsiveContainer><BarChart data={horas} margin={{ left: 0, right: 0 }} maxBarSize={32}>
                  <XAxis dataKey="rotulo" {...eixo} interval={3} /><YAxis {...eixo} width={26} allowDecimals={false} />
                  <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="comandos" name="Comandos" radius={[3, 3, 0, 0]}>
                    {horas.map((h) => <Cell key={h.hora} fill={`hsl(var(--primary) / ${0.25 + (h.comandos / maxHora) * 0.75})`} />)}
                  </Bar>
                </BarChart></ResponsiveContainer>
              </div>
            </Secao>

            <Secao titulo="Temperaturas escolhidas" contexto={r.temperatura_media ? `Média de ${temp(r.temperatura_media)}${simboloTemp()} ao ligar` : 'Quantas vezes cada temperatura foi pedida'}>
              <div className="h-56">
                {dados.temperaturas.length === 0 ? <p className="pt-20 text-center text-sm text-muted-foreground">Nenhum “ligar” com temperatura no período.</p> : (
                  <ResponsiveContainer><BarChart data={dados.temperaturas.map((t) => ({ ...t, rotulo: `${temp(t.temperatura)}°` }))} margin={{ left: 0, right: 0 }}>
                    <XAxis dataKey="rotulo" {...eixo} /><YAxis {...eixo} width={26} allowDecimals={false} />
                    <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Bar dataKey="vezes" name="Vezes" fill="#2563a8" radius={[3, 3, 0, 0]} />
                  </BarChart></ResponsiveContainer>
                )}
              </div>
            </Secao>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Secao titulo="Mapa de uso" contexto="Dia da semana × hora do dia" className="lg:col-span-2">
              <MapaCalor mapa={dados.mapa_calor} />
            </Secao>
            <Secao titulo="De onde vêm os comandos" contexto={`${r.comandos} no período`}>
              {dados.por_origem.length === 0 ? <p className="text-sm text-muted-foreground">Sem comandos no período.</p> : (
                <ul className="space-y-3">
                  {dados.por_origem.map((o, i) => (
                    <li key={o.origem}>
                      <div className="flex justify-between text-sm"><span>{rotuloOrigem(o.origem)}</span><span className="tabular text-muted-foreground">{o.comandos} · {Math.round((o.comandos / totalOrigem) * 100)}%</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(o.comandos / totalOrigem) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.5 }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          </div>

          <Secao titulo="Por aparelho" contexto="Clique no título da coluna para ordenar. Consumo usa a potência cadastrada em cada aparelho.">
            <div className="-mx-5 -my-5 overflow-x-auto">
              <table className="tabela w-full min-w-[760px]">
                <thead><tr>
                  <Cab c="nome">Aparelho</Cab><Cab c="comandos" dir>Comandos</Cab><Cab c="ligou" dir>Vezes ligado</Cab><Cab c="falhas" dir>Falhas</Cab>
                  <Cab c="horas_ligado" dir>Horas ligado</Cab><Cab c="kwh" dir>kWh</Cab><Cab c="custo" dir>Custo</Cab><Cab c="ultimo">Último comando</Cab>
                </tr></thead>
                <tbody>
                  {linhas.map((a) => (
                    <tr key={a.id}>
                      <td><p className="font-medium">{a.nome}</p><p className="text-xs text-muted-foreground">{[a.comodo || 'Sem cômodo', `${a.potencia_w} W`].join(' · ')}</p></td>
                      <td className="text-right tabular">{a.comandos}</td><td className="text-right tabular">{a.ligou}</td>
                      <td className={`text-right tabular ${a.falhas ? 'text-red-600 dark:text-red-400' : ''}`}>{a.falhas}</td>
                      <td className="text-right tabular">{a.horas_ligado.toLocaleString('pt-BR')}</td>
                      <td className="text-right tabular">{a.kwh.toLocaleString('pt-BR')}</td>
                      <td className="text-right tabular">{brl(a.custo)}</td>
                      <td className="text-muted-foreground">{a.ultimo ? dataHora(a.ultimo) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {linhas.length > 1 && (
                  <tfoot><tr className="font-medium">
                    <td>Total</td><td className="text-right tabular">{r.comandos}</td><td className="text-right tabular">{linhas.reduce((s, a) => s + a.ligou, 0)}</td>
                    <td className="text-right tabular">{r.falhas}</td><td className="text-right tabular">{r.horas_ligado.toLocaleString('pt-BR')}</td>
                    <td className="text-right tabular">{r.kwh.toLocaleString('pt-BR')}</td><td className="text-right tabular">{brl(r.custo)}</td><td />
                  </tr></tfoot>
                )}
              </table>
            </div>
          </Secao>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Secao titulo="Horas ligado por dia" contexto="Soma de todos os aparelhos" className="lg:col-span-2">
              <div className="h-56">
                {diario.length === 0 ? <p className="pt-20 text-center text-sm text-muted-foreground">Sem sessões no período.</p> : (
                  <ResponsiveContainer><LineChart data={diario} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="rotulo" {...eixo} minTickGap={12} /><YAxis {...eixo} width={30} />
                    <Tooltip content={<Dica />} />
                    <Line type="monotone" dataKey="horas" name="Horas" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart></ResponsiveContainer>
                )}
              </div>
            </Secao>
            <Secao titulo="Modos escolhidos" contexto="Ao ligar">
              {!(dados.modos || []).length ? <p className="text-sm text-muted-foreground">Nenhum ligar com modo no período.</p> : (
                <div className="flex items-center gap-4">
                  <div className="h-40 w-40 shrink-0"><ResponsiveContainer><PieChart><Pie data={dados.modos} dataKey="vezes" nameKey="modo" innerRadius="58%" outerRadius="100%" stroke="none">
                    {dados.modos.map((m, i) => <Cell key={m.modo} fill={CORES_MODO[i % CORES_MODO.length]} />)}</Pie><Tooltip content={<Dica />} /></PieChart></ResponsiveContainer></div>
                  <ul className="space-y-1.5 text-sm">{dados.modos.map((m, i) => <li key={m.modo} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES_MODO[i % CORES_MODO.length] }} />{m.modo}<span className="tabular text-muted-foreground">{m.vezes}</span></li>)}</ul>
                </div>
              )}
            </Secao>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Secao titulo="Por dia da semana" contexto="Comandos e horas ligado">
              <div className="h-52">
                <ResponsiveContainer><BarChart data={dados.por_dia_semana || []} margin={{ left: 0, right: 0 }}>
                  <XAxis dataKey="dia" {...eixo} /><YAxis {...eixo} width={30} />
                  <Tooltip content={<Dica />} cursor={{ fill: 'hsl(var(--muted))' }} />
                  <Bar dataKey="horas" name="Horas ligado" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="comandos" name="Comandos" fill="#2563a8" radius={[3, 3, 0, 0]} />
                </BarChart></ResponsiveContainer>
              </div>
            </Secao>
            <Secao titulo="Por projeto" contexto="Custo estimado de cada lugar">
              {!(dados.por_projeto || []).length ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
                <ul className="space-y-3">{dados.por_projeto.map((pj, i) => {
                  const max = Math.max(...dados.por_projeto.map((x) => x.custo), 0.01)
                  return (<li key={pj.projeto}><div className="flex justify-between text-sm"><span className="font-medium">{pj.projeto}</span><span className="tabular text-muted-foreground">{brl(pj.custo)} · {pj.horas_ligado.toLocaleString('pt-BR')} h · {pj.aparelhos} ar(es)</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${(pj.custo / max) * 100}%` }} transition={{ delay: i * 0.05 }} /></div></li>)
                })}</ul>
              )}
            </Secao>
          </div>

          <Secao titulo="Sessões mais longas" contexto={`${r.sessoes ?? 0} sessão(ões) no período, média de ${(r.sessao_media_h ?? 0).toLocaleString('pt-BR')} h. Expediente: ${dados.expediente || 'seg a sex, 7h às 19h'}`}>
            {!(dados.sessoes || []).length ? <p className="text-sm text-muted-foreground">Nenhuma sessão completa (ligar seguido de desligar) no período.</p> : (
              <div className="-mx-5 -my-5 overflow-x-auto">
                <table className="tabela w-full min-w-[720px]">
                  <thead><tr><th>Aparelho</th><th>Ligou</th><th>Desligou</th><th className="!text-right">Horas</th><th className="!text-right">Fora do expediente</th><th>Ligado por</th><th>Desligado por</th></tr></thead>
                  <tbody>{dados.sessoes.slice(0, 10).map((x, i) => (
                    <tr key={i}><td className="font-medium">{x.aparelho}</td><td className="tabular">{dataHora(x.inicio)}</td><td className="tabular">{dataHora(x.fim)}</td>
                      <td className={`text-right tabular ${x.horas >= 10 ? 'font-medium text-amber-600' : ''}`}>{x.horas.toLocaleString('pt-BR')}</td><td className="text-right tabular">{x.fora_expediente_h.toLocaleString('pt-BR')} h</td>
                      <td>{rotuloOrigem(x.origem)}</td><td className="text-muted-foreground">{x.origem_fim === 'ainda ligado' ? 'ainda ligado' : rotuloOrigem(x.origem_fim)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Secao>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Secao titulo="Transmissores" contexto="Taxa de sucesso dos envios">
              {!(dados.por_transmissor || []).length ? <p className="text-sm text-muted-foreground">Sem dados.</p> : (
                <ul className="-my-2 divide-y divide-border">{dados.por_transmissor.map((h) => (
                  <li key={h.transmissor} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><span className="font-medium">{h.transmissor}</span><span className="block text-xs text-muted-foreground">{h.aparelhos} aparelho(s) · {h.comandos} comandos · {h.falhas} falha(s)</span></span>
                    <span className={`text-base font-semibold tabular ${h.sucesso_pct >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>{h.sucesso_pct.toLocaleString('pt-BR')}%</span></li>
                ))}</ul>
              )}
            </Secao>
            <Secao titulo="Automações e cenas" contexto="O que rodou sozinho no período">
              {!(dados.rotinas || []).length ? <p className="text-sm text-muted-foreground">Nenhuma automação ou cena rodou no período.</p> : (
                <ul className="-my-2 divide-y divide-border">{dados.rotinas.map((x) => (
                  <li key={x.tipo + x.nome} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span><span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[11px]">{x.tipo}</span>{x.nome}</span>
                    <span className="tabular text-muted-foreground">{x.execucoes} execução(ões){x.falhas ? <span className="text-red-600"> · {x.falhas} falha(s)</span> : ''}</span></li>
                ))}</ul>
              )}
            </Secao>
          </div>

          {(dados.motivos_falha?.length > 0 || dados.sucesso_por_origem?.length > 0) && (
            <Secao titulo="Confiabilidade" contexto="por que os comandos falharam e quanto cada origem acerta">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Motivos das falhas</p>
                  {dados.motivos_falha?.length ? <ul className="space-y-2.5">{dados.motivos_falha.map((m) => (
                    <li key={m.motivo} className="rounded-md border border-border p-2.5 text-sm">
                      <p className="flex items-center justify-between gap-2"><b className="font-medium">{m.motivo}</b><span className="tabular text-red-600">{m.vezes}×</span></p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{m.dica}</p>
                    </li>))}</ul> : <p className="text-sm text-muted-foreground">Nenhuma falha no período.</p>}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Taxa de sucesso por origem</p>
                  <ul className="space-y-2">{(dados.sucesso_por_origem || []).map((o) => (
                    <li key={o.origem} className="text-sm">
                      <div className="flex justify-between gap-2"><span>{({ painel: 'Painel e apps', sinric: 'Alexa e Google', alexa: 'Skill própria', agenda: 'Agenda', automacao: 'Automações', cena: 'Cenas', telegram: 'Telegram', ia: 'Assistente de IA' })[o.origem] || o.origem}</span>
                        <span className="tabular text-muted-foreground">{o.sucesso_pct}% de {o.comandos}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${o.sucesso_pct >= 95 ? 'bg-emerald-500' : o.sucesso_pct >= 80 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${o.sucesso_pct}%` }} /></div>
                    </li>))}</ul>
                </div>
              </div>
            </Secao>
          )}
          <Secao titulo="Falhas no período" contexto={dados.falhas.length ? `${dados.falhas.length} mais recentes` : 'Tudo certo'}>
            {dados.falhas.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum comando falhou neste período.</p> : (
              <ul className="-my-2 divide-y divide-border">
                {[...dados.falhas].reverse().slice(0, 15).map((f, i) => (
                  <li key={i} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4">
                    <span className="w-28 shrink-0 text-xs tabular text-muted-foreground">{dataHora(f.quando)}</span>
                    <span className="text-sm"><span className="font-medium">{f.aparelho}</span> · {f.acao} <span className="text-muted-foreground">({rotuloOrigem(f.origem)})</span></span>
                    <span className="truncate text-xs text-red-600 dark:text-red-400 sm:ml-auto sm:max-w-[40%]" title={f.detalhe}>{f.detalhe}</span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          <p className="text-xs text-muted-foreground">
            Horas ligado, consumo e custo são estimativas: contam o tempo entre cada “ligar” e o “desligar” seguinte (no máximo 24 h por vez) e usam a potência de cada aparelho. Se alguém usar o controle remoto original, o sistema não fica sabendo.
          </p>
        </div>
      )}
    </>
  )
}
