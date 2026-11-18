import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AirVent, ArrowDownUp, ChevronRight, LayoutGrid, Minus, Plus, Power, PowerOff, Rows3, Search, Table2, X } from 'lucide-react'
import { MODOS, api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import ArCartao from '../components/ArCartao'
import FormAparelho from '../components/FormAparelho'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Ponto, Selo, Vazio, useDados, useToast } from '../components/ui'

// Aparelhos: grade (controle rápido), por sala (cada projeto com ligar/desligar a sala inteira) e tabela (seleção e
// ações em lote). Filtros por estado, problema, sala e transmissor; tudo lembrado neste navegador.
const ESTADOS = [['todos', 'Todos'], ['ligados', 'Ligados'], ['desligados', 'Desligados'], ['problemas', 'Com problema']]
const ORDENS = [['sala', 'Sala'], ['nome', 'Nome'], ['ligados', 'Ligados primeiro'], ['temperatura', 'Temperatura']]

// o que impede o ar de obedecer (ou de estar na voz), do mais grave para o menos
export function problemasDoAr(a) {
  const p = []
  if (!a.hub_id) p.push(['Sem transmissor', 'vermelho'])
  else if (!a.hub_online) p.push(['Transmissor sem resposta', 'ambar'])
  if (!a.total_codigos) p.push(['Sem botões gravados', 'vermelho'])
  if (!a.sinric_device_id) p.push(['Fora da Alexa', 'cinza'])
  return p
}

function ler(chave, padrao) { try { return localStorage.getItem(chave) || padrao } catch { return padrao } }
function gravar(chave, v) { try { localStorage.setItem(chave, v) } catch { /* sem armazenamento */ } }

export default function Aparelhos() {
  const { filtro, projeto } = useProjeto()
  const { dados, erro, setDados } = useDados(() => Promise.all([api.get(comFiltro('/api/aparelhos', filtro)), api.get(comFiltro('/api/hubs', filtro))]), [filtro])
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const [estado, setEstado] = useState('todos')
  const [sala, setSala] = useState('')
  const [hubF, setHubF] = useState('')
  const [ordem, setOrdemS] = useState(() => ler('clima-ordem-aparelhos', 'sala'))
  const [visao, setVisaoS] = useState(() => ler('clima-visao-aparelhos', 'grade'))
  const [sel, setSel] = useState(() => new Set())
  const [ocupado, setOcupado] = useState('')
  const navegar = useNavigate()
  const toast = useToast()
  const aberto = params.get('novo') === '1'
  const setVisao = (v) => { setVisaoS(v); gravar('clima-visao-aparelhos', v) }
  const setOrdem = (v) => { setOrdemS(v); gravar('clima-ordem-aparelhos', v) }

  const [aparelhos, hubs] = dados || [[], []]
  const salas = useMemo(() => [...new Set(aparelhos.map((a) => a.projeto_nome || 'Sem sala'))].sort(), [aparelhos])
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const l = aparelhos.filter((a) => {
      if (q && !`${a.nome} ${a.comodo} ${a.marca} ${a.projeto_nome || ''} ${a.hub_nome || ''}`.toLowerCase().includes(q)) return false
      if (sala && (a.projeto_nome || 'Sem sala') !== sala) return false
      if (hubF && (hubF === 'sem' ? a.hub_id : a.hub_id !== hubF)) return false
      if (estado === 'ligados') return a.ligado
      if (estado === 'desligados') return !a.ligado
      if (estado === 'problemas') return problemasDoAr(a).some(([, c]) => c !== 'cinza')
      return true
    })
    const cmp = {
      nome: (a, b) => a.nome.localeCompare(b.nome),
      sala: (a, b) => (a.projeto_nome || '').localeCompare(b.projeto_nome || '') || a.nome.localeCompare(b.nome),
      ligados: (a, b) => (b.ligado - a.ligado) || a.nome.localeCompare(b.nome),
      temperatura: (a, b) => a.temperatura - b.temperatura || a.nome.localeCompare(b.nome),
    }[ordem] || (() => 0)
    return [...l].sort(cmp)
  }, [aparelhos, busca, sala, hubF, estado, ordem])

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />

  const ligados = aparelhos.filter((a) => a.ligado)
  const comProblema = aparelhos.filter((a) => problemasDoAr(a).some(([, c]) => c !== 'cinza'))
  const naAlexa = aparelhos.filter((a) => a.sinric_device_id).length
  // aplica a resposta e os ares que mudaram junto (zona: mesmo sinal no mesmo transmissor)
  const atualizar = (novo) => setDados(([l, h]) => [l.map((a) => (a.id === novo.id ? { ...a, ...novo }
    : (novo.juntos || []).includes(a.id) ? { ...a, ligado: novo.ligado, modo: novo.modo ?? a.modo, temperatura: novo.temperatura ?? a.temperatura } : a)), h])

  // comando para vários ares, um por vez (1,2 s entre eles: o transmissor não aceita rajada); quem já mudou junto é pulado
  const emLote = async (lista, estadoNovo, rotulo) => {
    setOcupado(rotulo)
    const feitos = new Set()
    let ok = 0, falha = 0
    for (const a of lista) {
      if (feitos.has(a.id)) { ok++; continue }
      if (!a.hub_id || !a.total_codigos) { falha++; continue }
      try {
        const r = await api.post(`/api/aparelhos/${a.id}/estado`, estadoNovo)
        atualizar(r); ok++; feitos.add(a.id); (r.juntos || []).forEach((j) => feitos.add(j))
        await new Promise((res) => setTimeout(res, 1200))
      } catch { falha++ }
    }
    toast(`${ok} de ${lista.length} ar(es) ${rotulo}.${falha ? ` ${falha} sem transmissor, sem botões ou com falha.` : ''}`, falha ? 'erro' : 'ok')
    setOcupado('')
  }
  const criar = async (f) => {
    const novo = await api.post('/api/aparelhos', f)
    toast(`${novo.nome} adicionado. Agora grave os botões do controle.`)
    navegar(`/aparelhos/${novo.id}?aba=botoes`)
  }
  const selecionados = filtrados.filter((a) => sel.has(a.id))
  const alternar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtroAtivo = busca || sala || hubF || estado !== 'todos'

  return (
    <>
      <Cabecalho
        titulo="Aparelhos"
        descricao={`${aparelhos.length} ar-condicionado${aparelhos.length === 1 ? '' : 's'} ${projeto ? `em ${projeto.nome}` : `em ${salas.length} sala${salas.length === 1 ? '' : 's'}`} · ${hubs.length} transmissor${hubs.length === 1 ? '' : 'es'}`}
        acoes={<>
          {ligados.length > 0 && <Botao variante="secundario" icone={PowerOff} carregando={ocupado === 'desligados'} onClick={() => emLote(ligados, { ligado: false }, 'desligados')}>Desligar {ligados.length} ligado{ligados.length === 1 ? '' : 's'}</Botao>}
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
            { rotulo: 'Prontos para comandar', valor: aparelhos.length - comProblema.length, sufixo: ` / ${aparelhos.length}`, tom: comProblema.length ? 'ruim' : 'bom', dica: comProblema.length ? `${comProblema.length} com problema: veja o filtro` : 'transmissor e botões em todos' },
            { rotulo: 'Na Alexa e Google', valor: naAlexa, sufixo: ` / ${aparelhos.length}`, dica: naAlexa === aparelhos.length ? 'todos disponíveis por voz' : 'veja Alexa e Google' },
            { rotulo: 'Transmissores online', valor: hubs.filter((h) => h.online).length, sufixo: ` / ${hubs.length}`, tom: hubs.every((h) => h.online) ? 'bom' : 'ruim' },
          ]} />

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input className="campo pl-9" placeholder="Buscar por nome, sala, marca, transmissor" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar aparelhos" />
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Estado">
              {ESTADOS.map(([k, r]) => (
                <button key={k} onClick={() => setEstado(k)} aria-pressed={estado === k} className={`relative rounded-md px-3 py-1.5 text-sm ${estado === k ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {estado === k && <motion.span layoutId="filtro-aparelhos" className="absolute inset-0 rounded-md bg-muted" transition={{ duration: 0.18 }} />}
                  <span className="relative">{r}{k === 'problemas' && comProblema.length > 0 && <span className="ml-1 tabular text-red-600 dark:text-red-400">{comProblema.length}</span>}</span>
                </button>
              ))}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              {salas.length > 1 && (
                <select className="campo sm:w-40" value={sala} onChange={(e) => setSala(e.target.value)} aria-label="Sala">
                  <option value="">Todas as salas</option>{salas.map((c) => <option key={c}>{c}</option>)}
                </select>
              )}
              {hubs.length > 0 && (
                <select className="campo sm:w-44" value={hubF} onChange={(e) => setHubF(e.target.value)} aria-label="Transmissor">
                  <option value="">Todos os transmissores</option>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nome}</option>)}<option value="sem">Sem transmissor</option>
                </select>
              )}
              <label className="relative col-span-2 sm:col-span-1">
                <ArrowDownUp className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <select className="campo pl-9 sm:w-44" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar por">{ORDENS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
              </label>
            </div>
            <div className="flex rounded-lg border border-border bg-card p-0.5 2xl:ml-auto" role="group" aria-label="Visualização">
              {[['grade', LayoutGrid, 'Grade'], ['salas', Rows3, 'Por sala'], ['tabela', Table2, 'Tabela']].map(([k, I, r]) => (
                <button key={k} onClick={() => setVisao(k)} aria-pressed={visao === k} title={r} className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-xs ${visao === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" /><span className="hidden sm:inline">{r}</span></button>
              ))}
            </div>
          </div>
          {filtroAtivo && <p className="flex items-center gap-2 text-xs text-muted-foreground">{filtrados.length} de {aparelhos.length} ar(es)<button onClick={() => { setBusca(''); setSala(''); setHubF(''); setEstado('todos') }} className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><X className="h-3 w-3" />Limpar filtros</button></p>}

          {filtrados.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum aparelho com esses filtros.</p>}

          <AnimatePresence mode="popLayout">
            {visao === 'grade' && (
              <motion.div key="grade" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))]">
                {filtrados.map((a, i) => <ArCartao key={a.id} ar={a} aoMudar={atualizar} indice={i} />)}
              </motion.div>
            )}
            {visao === 'salas' && (
              <motion.div key="salas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                {[...new Set(filtrados.map((a) => a.projeto_nome || 'Sem sala'))].map((s) => {
                  const da = filtrados.filter((a) => (a.projeto_nome || 'Sem sala') === s)
                  const lig = da.filter((a) => a.ligado).length
                  return (
                    <section key={s}>
                      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
                        <h2 className="text-sm font-semibold">{s}</h2>
                        <span className="text-xs text-muted-foreground">{da.length} ar(es) · {lig ? `${lig} ligado(s)` : 'todos desligados'}</span>
                        <div className="ml-auto flex gap-1.5">
                          <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === `ligar-${s}`} disabled={!!ocupado} onClick={() => emLote(da, { ligado: true }, `ligar-${s}`)}>Ligar a sala</Botao>
                          <Botao tamanho="sm" variante="secundario" icone={PowerOff} carregando={ocupado === `desligar-${s}`} disabled={!!ocupado || !lig} onClick={() => emLote(da.filter((a) => a.ligado), { ligado: false }, `desligar-${s}`)}>Desligar</Botao>
                        </div>
                      </div>
                      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))]">
                        {da.map((a, i) => <ArCartao key={a.id} ar={a} aoMudar={atualizar} indice={i} />)}
                      </div>
                    </section>
                  )
                })}
              </motion.div>
            )}
            {visao === 'tabela' && (
              <motion.div key="tabela" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="cartao overflow-hidden">
                {selecionados.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
                    <b>{selecionados.length} selecionado(s)</b>
                    <Botao tamanho="sm" variante="secundario" icone={Power} disabled={!!ocupado} carregando={ocupado === 'ligados'} onClick={() => emLote(selecionados, { ligado: true }, 'ligados')}>Ligar</Botao>
                    <Botao tamanho="sm" variante="secundario" icone={PowerOff} disabled={!!ocupado} carregando={ocupado === 'desligados'} onClick={() => emLote(selecionados, { ligado: false }, 'desligados')}>Desligar</Botao>
                    <span className="flex items-center gap-1">
                      {[22, 23, 24, 25].map((t) => <button key={t} disabled={!!ocupado} onClick={() => emLote(selecionados, { ligado: true, temperatura: t }, `em ${t}°`)} className="h-8 rounded-md border border-border px-2 text-xs tabular hover:bg-muted disabled:opacity-50">{t}°</button>)}
                    </span>
                    <button onClick={() => setSel(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Limpar seleção</button>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="w-10 px-4 py-2"><input type="checkbox" aria-label="Selecionar todos" checked={filtrados.length > 0 && selecionados.length === filtrados.length} onChange={(e) => setSel(e.target.checked ? new Set(filtrados.map((a) => a.id)) : new Set())} /></th>
                        <th className="px-2 py-2 font-medium">Ar</th><th className="px-2 py-2 font-medium">Sala</th><th className="px-2 py-2 font-medium">Estado</th>
                        <th className="px-2 py-2 font-medium">Transmissor</th><th className="px-2 py-2 font-medium">Botões</th><th className="px-2 py-2 font-medium">Situação</th><th className="px-2 py-2 font-medium">Atualizado</th><th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtrados.map((a) => {
                        const pb = problemasDoAr(a)
                        return (
                          <tr key={a.id} className={`hover:bg-muted/40 ${sel.has(a.id) ? 'bg-primary/5' : ''}`}>
                            <td className="px-4 py-2"><input type="checkbox" aria-label={`Selecionar ${a.nome}`} checked={sel.has(a.id)} onChange={() => alternar(a.id)} /></td>
                            <td className="px-2 py-2"><Link to={`/aparelhos/${a.id}`} className="font-medium hover:underline">{a.nome}</Link>{a.zona && <p className="text-[11px] text-amber-700 dark:text-amber-400">zona de {a.zona.total}</p>}</td>
                            <td className="px-2 py-2 text-muted-foreground">{a.projeto_nome || '—'}</td>
                            <td className="px-2 py-2">{a.ligado ? <Selo cor="verde">{MODOS[a.modo]} {a.temperatura}°</Selo> : <Selo>Desligado</Selo>}</td>
                            <td className="px-2 py-2"><span className="flex items-center gap-1.5 text-xs"><Ponto ativo={a.hub_online} />{a.hub_nome || 'Sem transmissor'}</span></td>
                            <td className="px-2 py-2 tabular">{a.total_codigos}</td>
                            <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{pb.length ? pb.map(([t, c]) => <Selo key={t} cor={c}>{t}</Selo>) : <Selo cor="verde">Pronto</Selo>}</div></td>
                            <td className="px-2 py-2 text-xs text-muted-foreground">{a.atualizado_em ? haQuanto(a.atualizado_em) : '—'}</td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button disabled={!!ocupado || !a.hub_id} onClick={() => emLote([a], { ligado: true, temperatura: a.temperatura - 1 }, 'ajustados')} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label={`Baixar a temperatura de ${a.nome}`}><Minus className="h-3.5 w-3.5" /></button>
                                <button disabled={!!ocupado || !a.hub_id} onClick={() => emLote([a], { ligado: true, temperatura: a.temperatura + 1 }, 'ajustados')} className="rounded p-1 hover:bg-muted disabled:opacity-30" aria-label={`Subir a temperatura de ${a.nome}`}><Plus className="h-3.5 w-3.5" /></button>
                                <Link to={`/aparelhos/${a.id}`} className="rounded p-1 hover:bg-muted" aria-label={`Abrir ${a.nome}`}><ChevronRight className="h-4 w-4" /></Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Modal aberto={aberto} titulo="Adicionar ar-condicionado" onFechar={() => setParams({})}>
        <FormAparelho hubs={hubs} aoSalvar={criar} rotuloBotao="Adicionar"
          padrao={{ hub_id: params.get('hub') || undefined, projeto_id: params.get('projeto') ? +params.get('projeto') : undefined }} />
      </Modal>
    </>
  )
}
