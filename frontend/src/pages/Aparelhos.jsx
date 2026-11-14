import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AirVent, ChevronRight, LayoutGrid, List, PowerOff, Plus, Search } from 'lucide-react'
import { MODOS, api } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import ArCartao from '../components/ArCartao'
import FormAparelho from '../components/FormAparelho'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Ponto, Selo, Vazio, useDados, useToast } from '../components/ui'

const FILTROS = [['todos', 'Todos'], ['ligados', 'Ligados'], ['desligados', 'Desligados'], ['sem_botoes', 'Sem botões gravados'], ['sem_alexa', 'Fora da Alexa']]

function lerVisao() { try { return localStorage.getItem('clima-visao-aparelhos') || 'grade' } catch { return 'grade' } }

export default function Aparelhos() {
  const { filtro, projeto } = useProjeto()
  const { dados, erro, setDados, recarregar } = useDados(() => Promise.all([api.get(comFiltro('/api/aparelhos', filtro)), api.get(comFiltro('/api/hubs', filtro))]), [filtro])
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('todos')
  const [comodo, setComodo] = useState('')
  const [visao, setVisaoState] = useState(lerVisao)
  const [desligando, setDesligando] = useState(false)
  const navegar = useNavigate()
  const toast = useToast()
  const aberto = params.get('novo') === '1'
  const setVisao = (v) => { setVisaoState(v); try { localStorage.setItem('clima-visao-aparelhos', v) } catch { /* sem storage */ } }

  const [aparelhos, hubs] = dados || [[], []]
  const comodos = useMemo(() => [...new Set(aparelhos.map((a) => a.comodo).filter(Boolean))].sort(), [aparelhos])
  const filtrados = aparelhos.filter((a) => {
    if (busca && !`${a.nome} ${a.comodo} ${a.marca} ${a.projeto_nome || ''}`.toLowerCase().includes(busca.toLowerCase())) return false
    if (comodo && a.comodo !== comodo) return false
    if (estado === 'ligados') return a.ligado
    if (estado === 'desligados') return !a.ligado
    if (estado === 'sem_botoes') return !a.total_codigos
    if (estado === 'sem_alexa') return !a.sinric_device_id
    return true
  })

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />

  const ligados = aparelhos.filter((a) => a.ligado)
  const botoes = aparelhos.reduce((s, a) => s + a.total_codigos, 0)
  const naAlexa = aparelhos.filter((a) => a.sinric_device_id).length
  const atualizar = (novo) => setDados(([l, h]) => [l.map((a) => (a.id === novo.id ? { ...a, ...novo } : a)), h])

  const desligarTodos = async () => {
    setDesligando(true)
    let ok = 0
    for (const a of ligados) {
      try { atualizar(await api.post(`/api/aparelhos/${a.id}/estado`, { ligado: false })); ok++ } catch { /* segue para o próximo */ }
    }
    toast(`${ok} de ${ligados.length} aparelho(s) desligado(s).`, ok === ligados.length ? 'ok' : 'erro')
    setDesligando(false)
  }
  const criar = async (f) => {
    const novo = await api.post('/api/aparelhos', f)
    toast(`${novo.nome} adicionado. Agora grave os botões do controle.`)
    navegar(`/aparelhos/${novo.id}?aba=botoes`)
  }

  return (
    <>
      <Cabecalho
        titulo="Aparelhos"
        descricao={`${aparelhos.length} ar-condicionado${aparelhos.length === 1 ? '' : 's'} ${projeto ? `em ${projeto.nome}` : 'em todos os projetos'} · ${comodos.length} cômodo${comodos.length === 1 ? '' : 's'}`}
        acoes={<>
          {ligados.length > 0 && <Botao variante="secundario" icone={PowerOff} carregando={desligando} onClick={desligarTodos}>Desligar {ligados.length} ligado{ligados.length === 1 ? '' : 's'}</Botao>}
          <Botao icone={Plus} onClick={() => setParams({ novo: '1' })}>Adicionar aparelho</Botao>
        </>}
      />

      {hubs.length === 0 && (
        <div className="mb-4"><Aviso tipo="alerta">Nenhum transmissor neste projeto. <Link to="/transmissores" className="font-medium underline">Cadastre um SRW-004</Link> para controlar os aparelhos.</Aviso></div>
      )}

      {aparelhos.length === 0 ? (
        <Vazio icone={AirVent} titulo="Nenhum aparelho ainda" texto="Cadastre o primeiro ar-condicionado, escolha o transmissor do cômodo e grave os botões do controle original."
          acao={<Botao icone={Plus} onClick={() => setParams({ novo: '1' })}>Adicionar aparelho</Botao>} />
      ) : (
        <div className="space-y-5">
          <FaixaMetricas itens={[
            { rotulo: 'Ligados agora', valor: ligados.length, sufixo: ` de ${aparelhos.length}`, dica: ligados.length ? ligados.map((a) => a.nome).slice(0, 2).join(', ') + (ligados.length > 2 ? '…' : '') : 'tudo desligado' },
            { rotulo: 'Botões gravados', valor: botoes, dica: `${aparelhos.filter((a) => !a.total_codigos).length} aparelho(s) sem botões`, tom: aparelhos.some((a) => !a.total_codigos) ? 'ruim' : 'bom' },
            { rotulo: 'Na Alexa e Google', valor: naAlexa, sufixo: ` / ${aparelhos.length}`, dica: naAlexa === aparelhos.length ? 'todos disponíveis por voz' : 'veja Alexa e Google' },
            { rotulo: 'Transmissores online', valor: hubs.filter((h) => h.online).length, sufixo: ` / ${hubs.length}` },
          ]} />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative lg:w-72">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input className="campo pl-9" placeholder="Buscar por nome, cômodo, marca" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aparelhos" />
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5">
              {FILTROS.map(([k, r]) => (
                <button key={k} onClick={() => setEstado(k)} className={`relative rounded-md px-3 py-1.5 text-sm ${estado === k ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {estado === k && <motion.span layoutId="filtro-aparelhos" className="absolute inset-0 rounded-md bg-muted" transition={{ duration: 0.18 }} />}
                  <span className="relative">{r}</span>
                </button>
              ))}
            </div>
            {comodos.length > 1 && (
              <select className="campo lg:w-44" value={comodo} onChange={(e) => setComodo(e.target.value)} aria-label="Cômodo">
                <option value="">Todos os cômodos</option>{comodos.map((c) => <option key={c}>{c}</option>)}
              </select>
            )}
            <div className="flex rounded-lg border border-border bg-card p-0.5 lg:ml-auto">
              <button onClick={() => setVisao('grade')} className={`rounded-md p-1.5 ${visao === 'grade' ? 'bg-muted' : 'text-muted-foreground'}`} aria-label="Ver em grade"><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setVisao('lista')} className={`rounded-md p-1.5 ${visao === 'lista' ? 'bg-muted' : 'text-muted-foreground'}`} aria-label="Ver em lista"><List className="h-4 w-4" /></button>
            </div>
          </div>

          {filtrados.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum aparelho com esses filtros.</p>}

          <AnimatePresence mode="popLayout">
            {visao === 'grade' ? (
              <motion.div key="grade" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))]">
                {filtrados.map((a, i) => <ArCartao key={a.id} ar={a} aoMudar={atualizar} indice={i} />)}
              </motion.div>
            ) : (
              <motion.div key="lista" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cartao divide-y divide-border">
                {filtrados.map((a) => (
                  <Link key={a.id} to={`/aparelhos/${a.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/60">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular ${a.ligado ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{a.temperatura}°</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">{a.nome} {a.ligado ? <Selo cor="verde">{MODOS[a.modo]}</Selo> : <Selo>Desligado</Selo>}</p>
                      <p className="truncate text-xs text-muted-foreground">{[a.projeto_nome, a.comodo, a.marca].filter(Boolean).join(' · ')} · {a.total_codigos} botões{a.sinric_device_id ? ' · Alexa' : ''}</p>
                    </div>
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><Ponto ativo={a.hub_online} /> {a.hub_nome || 'Sem transmissor'}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Modal aberto={aberto} titulo="Adicionar ar-condicionado" onFechar={() => setParams({})}>
        <FormAparelho hubs={hubs} aoSalvar={criar} rotuloBotao="Adicionar" />
      </Modal>
    </>
  )
}
