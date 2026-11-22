import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, CheckCircle2, Copy, Coffee, History, Moon, Pencil, Play, Plus, Power, Search, Snowflake, Sparkles, Sun, Trash2, Undo2, Wand2, X, XCircle } from 'lucide-react'
import { AgendarCena, desfazer, fotografia, previa } from '../components/CenasExtras'
import { baixarArquivo, paraCsv } from '../components/FerramentasLista'
import { MODOS, VENTILACAO, api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, useDados, useToast } from '../components/ui'
import { useRef } from 'react'

const ICONES = { sparkles: Sparkles, moon: Moon, sun: Sun, snowflake: Snowflake, coffee: Coffee, power: Power }

function Form({ inicial, aparelhos, projetoPadrao, projetos, aoSalvar, onFechar }) {
  const [f, setF] = useState(() => ({
    nome: inicial?.nome || '', icone: inicial?.icone || 'moon', projeto_id: inicial?.projeto_id ?? projetoPadrao ?? null,
    acoes: inicial?.acoes?.map(({ aparelho_nome, ...a }) => a) || (aparelhos[0] ? [{ aparelho_id: aparelhos[0].id, ligado: true, modo: 'frio', temperatura: 23, ventilador: 'auto' }] : []),
  }))
  const [erro, setErro] = useState('')
  const mudarAcao = (i, k, v) => setF({ ...f, acoes: f.acoes.map((a, n) => (n === i ? { ...a, [k]: v } : a)) })
  const enviar = async (e) => {
    e.preventDefault()
    try { await aoSalvar({ ...f, acoes: f.acoes.map((a) => ({ ...a, aparelho_id: +a.aparelho_id, temperatura: a.ligado ? +a.temperatura : null })) }); onFechar() } catch (err) { setErro(err.message) }
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div><label className="rotulo" htmlFor="cn">Nome</label><input id="cn" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Dormir, Chegar em casa…" required /></div>
        <div>
          <label className="rotulo" htmlFor="cp">Projeto</label>
          <select id="cp" className="campo" value={f.projeto_id ?? ''} onChange={(e) => setF({ ...f, projeto_id: e.target.value ? +e.target.value : null })}>
            <option value="">Nenhum</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>
      <div>
        <span className="rotulo">Ícone</span>
        <div className="flex gap-2">
          {Object.entries(ICONES).map(([k, I]) => (
            <button type="button" key={k} onClick={() => setF({ ...f, icone: k })} aria-label={k}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border ${f.icone === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}><I className="h-4 w-4" /></button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <span className="rotulo">Ações</span>
        {f.acoes.map((a, i) => {
          const ar = aparelhos.find((x) => x.id === +a.aparelho_id)
          return (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <select className="campo" value={a.aparelho_id} onChange={(e) => mudarAcao(i, 'aparelho_id', e.target.value)} aria-label="Aparelho">
                  {aparelhos.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.projeto_nome ? ` · ${x.projeto_nome}` : ''}</option>)}
                </select>
                <select className="campo w-32" value={a.ligado ? '1' : '0'} onChange={(e) => mudarAcao(i, 'ligado', e.target.value === '1')} aria-label="Ação">
                  <option value="1">Ligar</option><option value="0">Desligar</option>
                </select>
                <button type="button" className="rounded-md px-2 text-muted-foreground hover:bg-muted" onClick={() => setF({ ...f, acoes: f.acoes.filter((_, n) => n !== i) })} aria-label="Remover ação"><X className="h-4 w-4" /></button>
              </div>
              {a.ligado && ar && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <select className="campo" value={a.modo || 'frio'} onChange={(e) => mudarAcao(i, 'modo', e.target.value)} aria-label="Modo">
                    {ar.modos.split(',').map((m) => <option key={m} value={m}>{MODOS[m]}</option>)}
                  </select>
                  <select className="campo" value={a.temperatura || 23} onChange={(e) => mudarAcao(i, 'temperatura', e.target.value)} aria-label="Temperatura">
                    {Array.from({ length: ar.temp_max - ar.temp_min + 1 }, (_, n) => ar.temp_min + n).map((t) => <option key={t} value={t}>{t}°C</option>)}
                  </select>
                  <select className="campo" value={a.ventilador || 'auto'} onChange={(e) => mudarAcao(i, 'ventilador', e.target.value)} aria-label="Ventilação">
                    {Object.entries(VENTILACAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                  </select>
                </div>
              )}
            </div>
          )
        })}
        <Botao type="button" variante="secundario" tamanho="sm" icone={Plus} disabled={!aparelhos.length}
          onClick={() => setF({ ...f, acoes: [...f.acoes, { aparelho_id: aparelhos[0].id, ligado: false }] })}>Adicionar ação</Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit" disabled={!f.acoes.length}>Salvar</Botao></div>
    </form>
  )
}

// cenas sugeridas: montadas na hora com os ares que existem (só os que têm transmissor e o usuário controla)
function sugestoes(aparelhos) {
  const com = aparelhos.filter((a) => a.hub_id)
  const reuniao = com.filter((a) => /reuni/i.test(`${a.nome} ${a.projeto_nome || ''}`))
  const lig = (a, t, v = 'auto', m = 'frio') => ({ aparelho_id: a.id, ligado: true, modo: m, temperatura: Math.max(a.temp_min || 16, Math.min(a.temp_max || 30, t)), ventilador: v })
  const des = (a) => ({ aparelho_id: a.id, ligado: false, modo: null, temperatura: null, ventilador: null })
  return [
    { nome: 'Chegada', icone: 'sun', texto: 'Liga todos em frio 23°, ventilação automática', acoes: com.map((a) => lig(a, 23)) },
    { nome: 'Saída do escritório', icone: 'power', texto: 'Desliga todos', acoes: com.map(des) },
    { nome: 'Economia', icone: 'snowflake', texto: 'Todos em 25°, ventilação baixa', acoes: com.map((a) => lig(a, 25, 'baixa')) },
    { nome: 'Dia muito quente', icone: 'snowflake', texto: 'Todos em 21°, ventilação alta (por pouco tempo)', acoes: com.map((a) => lig(a, 21, 'alta')) },
    reuniao.length && { nome: 'Reunião', icone: 'coffee', texto: `Liga ${reuniao.map((a) => a.nome).join(', ')} em 22°`, acoes: reuniao.map((a) => lig(a, 22)) },
    { nome: 'Só ventilar', icone: 'moon', texto: 'Todos no modo ventilar (sem resfriar)', acoes: com.map((a) => lig(a, 24, 'media', 'ventilar')) },
  ].filter((x) => x && x.acoes.length)
}

function Sugeridas({ aparelhos, existentes, aoCriar }) {
  const toast = useToast()
  const [criando, setCriando] = useState(null)
  const lista = sugestoes(aparelhos).filter((s) => !existentes.some((c) => c.nome.toLowerCase() === s.nome.toLowerCase()))
  if (!lista.length) return null
  const criar = async (s) => {
    setCriando(s.nome)
    try { await api.post('/api/cenas', { nome: s.nome, icone: s.icone, projeto_id: null, acoes: s.acoes }); toast(`Cena "${s.nome}" criada com ${s.acoes.length} ar(es).`); aoCriar() } catch (e) { toast(e.message, 'erro') } finally { setCriando(null) }
  }
  return (
    <section className="cartao mb-6 p-5">
      <h2 className="titulo-secao flex items-center gap-2"><Wand2 className="h-4 w-4 text-primary" />Cenas sugeridas</h2>
      <p className="mt-1 text-sm text-muted-foreground">Montadas com os seus ares (só os que têm transmissor). Um clique cria; depois dá para editar.</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.map((s) => {
          const I = ICONES[s.icone] || Sparkles
          return (
            <div key={s.nome} className="flex items-start gap-3 rounded-xl border border-border p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><I className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{s.nome}</p><p className="text-xs text-muted-foreground">{s.texto} · {s.acoes.length} ar(es)</p></div>
              <Botao tamanho="sm" variante="secundario" icone={Plus} carregando={criando === s.nome} onClick={() => criar(s)}>Criar</Botao>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function HistoricoCenas() {
  const { dados } = useDados(() => api.get('/api/atividade?origem=cena&limite=12'))
  const itens = Array.isArray(dados) ? dados : dados?.itens || []
  if (!itens.length) return null
  return (
    <section className="cartao mt-6 p-5">
      <h2 className="titulo-secao flex items-center gap-2"><History className="h-4 w-4 text-primary" />Últimas execuções</h2>
      <ul className="mt-3 divide-y divide-border">
        {itens.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
            {e.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="h-4 w-4 shrink-0 text-red-600" />}
            <span className="min-w-0 flex-1 truncate"><b className="font-medium">{String(e.origem).replace('cena:', '')}</b> · {e.acao}{e.aparelho_nome ? ` · ${e.aparelho_nome}` : ''}</span>
            <span className="text-xs text-muted-foreground">{haQuanto(e.quando)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function Cenas() {
  const { filtro, projetos, projeto } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get(comFiltro('/api/cenas', filtro)), api.get('/api/aparelhos')]), [filtro])
  const [modal, setModal] = useState(null)
  const [rodando, setRodando] = useState(null)
  const [apagar, setApagar] = useState(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')
  const [agendar, setAgendar] = useState(null)
  const [ultima, setUltima] = useState(null)   // { nome, foto, em } para Desfazer
  const [desfazendo, setDesfazendo] = useState(false)
  const arq = useRef(null)
  const toast = useToast()
  const visiveis = useMemo(() => {
    if (!dados) return []
    const q = busca.trim().toLowerCase()
    const l = dados[0].filter((c) => !q || `${c.nome} ${c.projeto_nome || ''} ${c.acoes.map((a) => a.aparelho_nome).join(' ')}`.toLowerCase().includes(q))
    const chave = { recentes: (c) => -(c.executada_em || 0), nome: (c) => c.nome.toLowerCase(), comandos: (c) => -c.acoes.length }[ordem]
    return [...l].sort((a, b) => (chave(a) > chave(b) ? 1 : chave(a) < chave(b) ? -1 : 0))
  }, [dados, busca, ordem])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [cenas, aparelhos] = dados
  const semana = Date.now() / 1000 - 7 * 86400
  const envolvidos = new Set(cenas.flatMap((c) => c.acoes.map((a) => a.aparelho_id)))
  const duplicar = async (c) => {
    try {
      await api.post('/api/cenas', { nome: `${c.nome} (cópia)`.slice(0, 60), icone: c.icone, projeto_id: c.projeto_id ?? null,
        acoes: c.acoes.map(({ aparelho_id, ligado, modo, temperatura, ventilador }) => ({ aparelho_id, ligado, modo, temperatura, ventilador })) })
      toast('Cena duplicada.'); recarregar()
    } catch (e) { toast(e.message, 'erro') }
  }

  const executar = async (c) => {
    setRodando(c.id)
    const foto = fotografia(c, aparelhos)
    try {
      const r = await api.post(`/api/cenas/${c.id}/executar`)
      setUltima({ nome: c.nome, foto, em: Date.now() })
      const falhas = r.resultados.filter((x) => !x.ok)
      if (falhas.length) toast(`${c.nome}: ${falhas.length} de ${r.resultados.length} falharam. ${falhas[0].erro}`, 'erro')
      else toast(`${c.nome} executada.`)
      recarregar()
    } catch (e) { toast(e.message, 'erro') } finally { setRodando(null) }
  }

  const voltar = async () => {
    setDesfazendo(true)
    const n = await desfazer(ultima.foto)
    setDesfazendo(false); setUltima(null); toast(`${n} de ${ultima.foto.length} ar(es) de volta ao que estavam antes de "${ultima.nome}".`); recarregar()
  }
  const exportarJson = () => baixarArquivo('cenas.json', JSON.stringify({ tipo: 'cenas', versao: 1, itens: cenas.map((c) => ({ nome: c.nome, icone: c.icone, projeto_id: c.projeto_id, acoes: c.acoes.map(({ aparelho_id, aparelho_nome, ligado, modo, temperatura, ventilador }) => ({ aparelho_id, aparelho_nome, ligado, modo, temperatura, ventilador })) })) }, null, 2), 'application/json')
  const exportarCsv = () => baixarArquivo('cenas.csv', paraCsv(cenas.flatMap((c) => c.acoes.map((a) => ({ cena: c.nome, projeto: c.projeto_nome || '', ar: a.aparelho_nome, acao: a.ligado ? `${MODOS[a.modo] || 'Ligar'}${a.temperatura ? ` ${a.temperatura}°` : ''}` : 'Desligar' }))), [['cena', 'Cena'], ['projeto', 'Projeto'], ['ar', 'Ar'], ['acao', 'Ação']]), 'text/csv')
  const importar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    let j; try { j = JSON.parse(await f.text()) } catch { j = null }
    if (!j || j.tipo !== 'cenas' || !Array.isArray(j.itens)) return toast('Este arquivo não é uma exportação de cenas.', 'erro')
    let ok = 0, pulados = 0
    for (const c of j.itens) {
      const acoes = c.acoes.map((a) => { const ar = aparelhos.find((x) => x.id === a.aparelho_id) || aparelhos.find((x) => x.nome === a.aparelho_nome); return ar ? { aparelho_id: ar.id, ligado: a.ligado, modo: a.modo, temperatura: a.temperatura, ventilador: a.ventilador } : null }).filter(Boolean)
      if (!acoes.length) { pulados++; continue }
      try { await api.post('/api/cenas', { nome: String(c.nome).slice(0, 60), icone: c.icone || 'sparkles', projeto_id: c.projeto_id ?? null, acoes }); ok++ } catch { pulados++ }
    }
    toast(`${ok} cena(s) importada(s)${pulados ? `, ${pulados} pulada(s) (ares não encontrados)` : ''}.`); recarregar()
  }

  return (
    <div className="w-full">
      {ultima && Date.now() - ultima.em < 10 * 60000 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="flex-1"><b>{ultima.nome}</b> executada. Mudou algo que não devia?</span>
          <Botao tamanho="sm" variante="secundario" icone={Undo2} carregando={desfazendo} onClick={voltar}>Desfazer (voltar {ultima.foto.length} ar(es))</Botao>
          <button onClick={() => setUltima(null)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
      )}
      <Cabecalho titulo="Cenas" descricao="Um toque executa vários comandos: ligar a sala de reunião em 23° e desligar a recepção, por exemplo."
        acoes={<Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Nova cena</Botao>} />
      {cenas.length > 0 && (
        <>
          <div className="mb-5">
            <FaixaMetricas itens={[
              { rotulo: 'Cenas', valor: cenas.length, dica: `${cenas.filter((c) => !c.projeto_id).length} sem projeto` },
              { rotulo: 'Executadas em 7 dias', valor: cenas.filter((c) => c.executada_em > semana).length, dica: 'pelo painel, Alexa ou automação' },
              { rotulo: 'Ares envolvidos', valor: envolvidos.size, sufixo: ` / ${aparelhos.length}`, dica: 'em pelo menos uma cena' },
              { rotulo: 'Comandos por cena', valor: (cenas.reduce((n, c) => n + c.acoes.length, 0) / cenas.length).toFixed(1).replace('.', ','), dica: 'em média' },
            ]} />
          </div>
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,20rem)_auto] sm:justify-between">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="campo h-9 pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cena, projeto ou ar" type="search" name="busca-cenas" autoComplete="off" aria-label="Buscar cenas" />
            </label>
            <div className="flex flex-wrap gap-1.5">
              <select className="campo h-9 w-auto" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar">
                <option value="recentes">Usadas por último</option><option value="nome">Nome</option><option value="comandos">Mais comandos</option>
              </select>
              <Botao tamanho="sm" variante="secundario" onClick={exportarCsv}>CSV</Botao>
              <Botao tamanho="sm" variante="secundario" onClick={exportarJson}>Exportar</Botao>
              <input ref={arq} type="file" accept=".json,application/json" className="hidden" onChange={importar} />
              <Botao tamanho="sm" variante="secundario" onClick={() => arq.current?.click()}>Importar</Botao>
            </div>
          </div>
        </>
      )}
      <Sugeridas aparelhos={aparelhos} existentes={cenas} aoCriar={recarregar} />
      {cenas.length === 0 ? (
        <Vazio icone={Sparkles} titulo="Nenhuma cena" texto={aparelhos.length ? 'Crie "Dormir", "Sair de casa" ou "Chegar do trabalho".' : 'Cadastre um aparelho primeiro.'}
          acao={aparelhos.length > 0 && <Botao icone={Plus} onClick={() => setModal({})}>Nova cena</Botao>} />
      ) : (
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {visiveis.length === 0 && <p className="col-span-full py-10 text-center text-sm text-muted-foreground">Nenhuma cena com essa busca.</p>}
          {visiveis.map((c, i) => {
            const I = ICONES[c.icone] || Sparkles
            return (
              <motion.div key={c.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }} className="cartao group flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted"><I className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.projeto_nome || 'Sem projeto'} · {c.executada_em ? `executada ${haQuanto(c.executada_em)}` : 'nunca executada'}</p>
                  </div>
                  <div className="flex gap-0.5 opacity-60 group-hover:opacity-100">
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setModal(c)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => duplicar(c)} aria-label="Duplicar" title="Duplicar"><Copy className="h-4 w-4" /></button>
                    <button className="rounded-md p-1.5 hover:bg-muted hover:text-red-600" aria-label="Apagar" onClick={() => setApagar(c)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {(() => { const pv = previa(c, aparelhos); const muda = pv.filter((p) => p.situacao === 'muda').length, sem = pv.filter((p) => p.situacao === 'sem_tx' || p.situacao === 'sumiu').length; return (<>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {pv.map((a, n) => (
                    <li key={n} className="flex items-center justify-between gap-2">
                      <span className="min-w-0"><span className="block truncate text-muted-foreground">{a.aparelho_nome}</span>
                        <span className={`block text-[11px] ${a.situacao === 'sem_tx' || a.situacao === 'sumiu' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground/80'}`}>{a.texto}</span></span>
                      <span className={`shrink-0 font-medium ${a.situacao === 'igual' ? 'text-muted-foreground' : ''}`}>{a.ligado ? `${MODOS[a.modo] || 'Ligar'}${a.temperatura ? ` ${a.temperatura}°` : ''}` : 'Desligar'}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">{muda ? `${muda} ar(es) mudam agora` : 'Nada muda agora: tudo já está assim'}{sem ? ` · ${sem} não obedece(m)` : ''}</p>
                </>) })()}
                <div className="mt-3 flex gap-2">
                  <Botao className="flex-1" icone={Play} carregando={rodando === c.id} onClick={() => executar(c)}>Executar</Botao>
                  <Botao variante="secundario" icone={CalendarClock} onClick={() => setAgendar(c)} title="Executar sozinha num horário">Agendar</Botao>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      <HistoricoCenas />
      {agendar && <AgendarCena cena={agendar} aoFechar={() => setAgendar(null)} />}
      <Modal aberto={!!apagar} titulo={`Apagar a cena ${apagar?.nome || ''}?`} onFechar={() => setApagar(null)}>
        <p className="text-sm text-muted-foreground">Os ares não mudam. Se alguma automação ou frase da Alexa usa esta cena, ela deixa de funcionar.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { const c = apagar; setApagar(null); try { await api.del(`/api/cenas/${c.id}`); toast('Cena apagada.'); recarregar() } catch (e) { toast(e.message, 'erro') } }}>Apagar</Botao>
        </div>
      </Modal>
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar cena' : 'Nova cena'} onFechar={() => setModal(null)} largura="max-w-2xl">
        {modal && <Form inicial={modal.id ? modal : null} aparelhos={aparelhos} projetos={projetos} projetoPadrao={projeto?.id} onFechar={() => setModal(null)}
          aoSalvar={async (f) => { if (modal.id) await api.put(`/api/cenas/${modal.id}`, f); else await api.post('/api/cenas', f); toast('Cena salva.'); recarregar() }} />}
      </Modal>
    </div>
  )
}
