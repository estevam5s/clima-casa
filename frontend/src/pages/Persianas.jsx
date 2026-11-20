import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, ChevronUp, Link2, Pause, Sun } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Agendas, ConectarAparelho, Estado, Historico, Travas, useDispositivos } from '../components/dispositivos/Comum'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Selo, Vazio, useToast } from '../components/ui'

// persiana desenhada: lâminas que sobem/descem conforme a posição (0 = fechada, 100 = aberta)
function Desenho({ pos }) {
  const parado = useReducedMotion()
  const aberta = Math.max(0, Math.min(100, pos ?? 50))
  return (
    <div className="relative h-28 w-full overflow-hidden rounded-md border border-border bg-sky-100 dark:bg-sky-950/40" aria-hidden>
      <div className="absolute inset-x-6 bottom-3 top-6 rounded-sm border border-sky-200 bg-gradient-to-b from-sky-200 to-sky-50 dark:border-sky-900 dark:from-sky-900 dark:to-sky-950" />{/* marca: céu atrás do vidro */}
      <motion.div className="absolute inset-x-4 top-2 flex flex-col gap-[3px] overflow-hidden" initial={false} animate={{ height: `${Math.max(6, (100 - aberta) * 0.92)}%` }} transition={{ duration: parado ? 0 : 0.6 }}>
        {Array.from({ length: 22 }, (_, i) => <span key={i} className="block h-[5px] shrink-0 rounded-sm bg-stone-300 dark:bg-stone-500" />)}
      </motion.div>
      <span className="absolute inset-x-3 top-1 h-2 rounded bg-stone-400 dark:bg-stone-600" />
    </div>
  )
}

function Cartao({ d0, podeControlar, podeGerenciar, aoAbrir }) {
  const toast = useToast()
  const [d, setD] = useState(d0)
  const [pos, setPos] = useState(d0.resumo?.posicao ?? 50)
  const [ocupado, setOcupado] = useState('')
  const cmd = async (acao, valor) => {
    setOcupado(acao)
    try { const n = await api.post(`/api/dispositivos/${d.id}/comando`, { acao, valor }); setD(n); if (n.resumo?.posicao != null) setPos(n.resumo.posicao) }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const off = !podeControlar || !d.conectado
  return (
    <div className="cartao space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="truncate font-medium">{d.nome}</p><p className="text-xs text-muted-foreground">{d.projeto_nome || 'Escritório'}</p><div className="mt-1"><Estado d={d} /></div></div>
        <button onClick={() => aoAbrir(d)} className="text-xs font-medium text-primary hover:underline">Detalhes</button>
      </div>
      <Desenho pos={d.conectado ? (d.resumo?.posicao ?? pos) : pos} />
      <label className="block text-xs text-muted-foreground">Abertura: <b className="tabular text-foreground">{pos}%</b>
        <input type="range" min="0" max="100" step="5" value={pos} disabled={off} onChange={(e) => setPos(+e.target.value)} onMouseUp={() => cmd('posicao', pos)} onTouchEnd={() => cmd('posicao', pos)} onKeyUp={(e) => ['ArrowLeft', 'ArrowRight'].includes(e.key) && cmd('posicao', pos)} className="mt-1 w-full accent-[hsl(var(--primary))]" aria-label={`Abertura de ${d.nome}`} />
      </label>
      <div className="grid grid-cols-3 gap-1.5">
        <Botao tamanho="sm" variante="secundario" icone={ChevronUp} disabled={off} carregando={ocupado === 'abrir'} onClick={() => cmd('abrir')}>Abrir</Botao>
        <Botao tamanho="sm" variante="secundario" icone={Pause} disabled={off} carregando={ocupado === 'parar'} onClick={() => cmd('parar')}>Parar</Botao>
        <Botao tamanho="sm" variante="secundario" icone={ChevronDown} disabled={off} carregando={ocupado === 'fechar'} onClick={() => cmd('fechar')}>Fechar</Botao>
      </div>
      {!d.conectado && podeGerenciar && <button onClick={() => aoAbrir(d, true)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Link2 className="h-3.5 w-3.5" />Conectar o motor desta janela</button>}
    </div>
  )
}

function Detalhes({ d: d0, aoFechar, podeGerenciar, conectarAgora, aoMudar }) {
  const [conectar, setConectar] = useState(!!conectarAgora)
  const [d, setD] = useState(d0)
  return (
    <Modal aberto onFechar={aoFechar} titulo={d.nome} largura="max-w-2xl">
      <div className="space-y-4">
        <Agendas d={d} acoes={[['abrir', 'Abrir'], ['fechar', 'Fechar'], ['posicao', 'Posição (%)']]} aoSalvar={aoMudar} podeEditar={podeGerenciar} />
        <Travas d={d} aoMudar={(n) => { setD(n); aoMudar?.(n) }} />
        <Historico d={d} versao={0} />
        {podeGerenciar && <Botao variante="secundario" icone={Link2} onClick={() => setConectar(true)}>{d.conectado ? 'Trocar motor' : 'Conectar motor'}</Botao>}
      </div>
      <ConectarAparelho d={d} aberto={conectar} aoFechar={() => setConectar(false)} aoConectar={aoMudar} />
    </Modal>
  )
}

export default function Persianas() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const { dados, erro, recarregar } = useDispositivos('persiana')
  const [abrir, setAbrir] = useState(null)
  const [lote, setLote] = useState('')
  const [sol, setSol] = useState(null)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const perms = sessao?.permissoes || [], dono = ['dono', 'admin'].includes(sessao?.papel)
  const podeControlar = dono || perms.includes('aparelhos.controlar'), podeGerenciar = dono || perms.includes('transmissores.gerenciar')
  const conectadas = dados.filter((d) => d.conectado)
  const salas = [...new Set(dados.map((d) => d.projeto_nome || 'Escritório'))]
  const todas = async (lista, acao, valor) => {
    setLote(`${acao}${valor ?? ''}`)
    let ok = 0
    for (const d of lista.filter((x) => x.conectado)) { try { await api.post(`/api/dispositivos/${d.id}/comando`, { acao, valor }); ok++ } catch { /* segue */ } }
    toast(lista.some((x) => x.conectado) ? `${ok} persiana(s) receberam o comando.` : 'Nenhuma destas persianas tem motor conectado.', ok ? 'ok' : 'erro')
    setLote(''); recarregar()
  }
  const salvarSol = async () => {
    for (const d of dados) await api.put(`/api/dispositivos/${d.id}/config`, { sol_forte: sol })
    toast('Regra do sol aplicada a todas as persianas.'); setSol(null); recarregar()
  }
  const solAtual = dados[0]?.config?.sol_forte || { ativo: false, temp_min: 27, posicao: 30, das: '10:00', ate: '16:00' }
  return (
    <>
      <Cabecalho titulo="Persianas" descricao="Todas as janelas de todas as salas: abrir, fechar, parar e posição, por sala ou todas juntas, com agenda e fechamento automático quando o sol esquenta."
        acoes={podeControlar && <>
          <Botao variante="secundario" icone={ChevronUp} carregando={lote === 'abrir'} onClick={() => todas(dados, 'abrir')}>Abrir todas</Botao>
          <Botao variante="secundario" icone={ChevronDown} carregando={lote === 'fechar'} onClick={() => todas(dados, 'fechar')}>Fechar todas</Botao>
        </>} />
      <div className="mb-6"><FaixaMetricas itens={[
        { rotulo: 'Persianas', valor: dados.length, dica: `${salas.length} sala(s)` },
        { rotulo: 'Com motor conectado', valor: conectadas.length, sufixo: ` / ${dados.length}`, tom: conectadas.length ? 'bom' : 'ruim', dica: conectadas.length ? 'recebem comandos' : 'sem motor: só o desenho e o mapa mudam' },
        { rotulo: 'Abertas (média)', valor: conectadas.length ? Math.round(conectadas.reduce((s, d) => s + (d.resumo?.posicao ?? 0), 0) / conectadas.length) : '—', sufixo: conectadas.length ? '%' : '' },
        { rotulo: 'Sol forte', valor: solAtual.ativo ? 'Ligado' : 'Desligado', dica: solAtual.ativo ? `fecha até ${solAtual.posicao}% acima de ${solAtual.temp_min}°` : 'regra automática' },
      ]} /></div>
      {!conectadas.length && dados.length > 0 && <div className="mb-6"><Aviso tipo="alerta">Nenhuma persiana tem motor conectado ainda: os botões ficam desligados. Cada janela precisa de um motor de persiana Wi-Fi compatível com o Smart Life; depois de parear, use “Conectar o motor desta janela”. As persianas do mapa 3D continuam funcionando como desenho.</Aviso></div>}
      <section className="cartao mb-6 flex flex-wrap items-center gap-3 p-4">
        <Sun className="h-5 w-5 text-amber-500" />
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">Fechar quando o sol esquentar</p><p className="text-xs text-muted-foreground">Com céu limpo e a temperatura de fora acima do limite, no horário escolhido, as persianas descem até a posição definida (previsão real, Open-Meteo). Ajuda o ar-condicionado.</p></div>
        {solAtual.ativo ? <Selo cor="verde">Ligada</Selo> : <Selo>Desligada</Selo>}
        {podeGerenciar && <Botao tamanho="sm" variante="secundario" onClick={() => setSol({ ...solAtual })}>Configurar</Botao>}
      </section>
      {!dados.length ? <Vazio icone={Sun} titulo="Nenhuma persiana" texto="As persianas aparecem aqui a partir das janelas do mapa." /> : (
        <>
          {podeControlar && (
            <section className="cartao mb-6 divide-y divide-border">
              {salas.map((s2) => {
                const da = dados.filter((d) => (d.projeto_nome || 'Escritório') === s2)
                return (
                  <div key={s2} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm font-medium">{s2}<span className="ml-2 text-xs font-normal text-muted-foreground">{da.length} janela(s)</span></span>
                    <Botao tamanho="sm" variante="secundario" onClick={() => todas(da, 'abrir')}>Abrir</Botao>
                    <Botao tamanho="sm" variante="secundario" onClick={() => todas(da, 'posicao', 50)}>Meia</Botao>
                    <Botao tamanho="sm" variante="secundario" onClick={() => todas(da, 'fechar')}>Fechar</Botao>
                  </div>
                )
              })}
            </section>
          )}
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
            {dados.map((d) => <Cartao key={d.id} d0={d} podeControlar={podeControlar} podeGerenciar={podeGerenciar} aoAbrir={(x, c) => setAbrir({ d: x, conectar: c })} />)}
          </div>
        </>
      )}
      {abrir && <Detalhes d={abrir.d} conectarAgora={abrir.conectar} aoFechar={() => { setAbrir(null); recarregar() }} podeGerenciar={podeGerenciar} aoMudar={() => recarregar()} />}
      <Modal aberto={!!sol} titulo="Fechar quando o sol esquentar" onFechar={() => setSol(null)}>
        {sol && <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sol.ativo} onChange={(e) => setSol({ ...sol, ativo: e.target.checked })} />Ligar a regra em todas as persianas</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Temperatura de fora acima de (°C)<input type="number" min="10" max="45" className="campo mt-1 h-9" value={sol.temp_min} onChange={(e) => setSol({ ...sol, temp_min: +e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Descer até (% aberta)<input type="number" min="0" max="100" className="campo mt-1 h-9" value={sol.posicao} onChange={(e) => setSol({ ...sol, posicao: +e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Das<input type="time" className="campo mt-1 h-9" value={sol.das} onChange={(e) => setSol({ ...sol, das: e.target.value })} /></label>
            <label className="text-xs text-muted-foreground">Até<input type="time" className="campo mt-1 h-9" value={sol.ate} onChange={(e) => setSol({ ...sol, ate: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => setSol(null)}>Cancelar</Botao><Botao onClick={salvarSol}>Salvar</Botao></div>
        </div>}
      </Modal>
    </>
  )
}
