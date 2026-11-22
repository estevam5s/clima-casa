import { useEffect, useMemo, useState } from 'react'
import { Lightbulb, LightbulbOff, Link2, Moon, Plus, RefreshCw, Sunrise, Sunset, ToggleRight, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Agendas, ConectarAparelho, Estado, Historico, Travas, SemAparelho } from '../components/dispositivos/Comum'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'

// Iluminação do escritório: lâmpadas, painéis, fitas e interruptores Smart Life (ou placa própria). Ligar, desligar,
// brilho, acender ao anoitecer (pôr do sol real de hoje, calculado no servidor) e quando a porta é destrancada à noite.
const DIAS = [[1, 'S'], [2, 'T'], [3, 'Q'], [4, 'Q'], [5, 'S'], [6, 'S'], [7, 'D']]

function Automacoes({ d, aoSalvar, podeEditar, sol }) {
  const toast = useToast()
  const [an, setAn] = useState(d.config.anoitecer)
  const [fech, setFech] = useState(!!d.config.com_fechadura)
  const [brilho, setBrilho] = useState(d.config.brilho_padrao ?? 100)
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    try { aoSalvar(await api.put(`/api/dispositivos/${d.id}/config`, { anoitecer: an, com_fechadura: fech, brilho_padrao: +brilho })); toast('Automações salvas.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const acende = sol ? (() => { const [h, m] = sol.por.split(':').map(Number); const t = h * 60 + m - (an.antes_min || 0); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` })() : null
  return (
    <section className="cartao p-5">
      <h3 className="text-sm font-semibold">Automações</h3>
      <div className="mt-3 space-y-4">
        <div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span><b className="font-medium">Acender ao anoitecer</b><span className="block text-xs text-muted-foreground">{acende ? `Hoje acende às ${acende} (pôr do sol ${sol.por}) e não acende depois de ${an.ate}.` : 'Pelo pôr do sol real de cada dia.'}</span></span>
            <Interruptor ligado={!!an.ativo} onChange={(v) => setAn({ ...an, ativo: v })} rotulo="Acender ao anoitecer" />
          </label>
          {an.ativo && (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
              <label className="text-xs text-muted-foreground">Minutos antes do pôr do sol<input type="number" min="0" max="120" className="campo mt-1 h-8 w-28" value={an.antes_min ?? 15} onChange={(e) => setAn({ ...an, antes_min: +e.target.value })} disabled={!podeEditar} /></label>
              <label className="text-xs text-muted-foreground">Só até<input type="time" className="campo mt-1 h-8 w-28" value={an.ate || '19:30'} onChange={(e) => setAn({ ...an, ate: e.target.value })} disabled={!podeEditar} /></label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
                {DIAS.map(([n, r]) => {
                  const on = (an.dias || []).includes(n)
                  return <button key={n} type="button" disabled={!podeEditar} onClick={() => setAn({ ...an, dias: on ? an.dias.filter((x) => x !== n) : [...(an.dias || []), n].sort() })}
                    aria-pressed={on} className={`h-8 w-8 rounded-md border text-xs ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground'}`}>{r}</button>
                })}
              </div>
            </div>
          )}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span><b className="font-medium">Acender quando a porta for destrancada à noite</b><span className="block text-xs text-muted-foreground">Depende da fechadura conectada. Só entre o pôr e o nascer do sol.</span></span>
          <Interruptor ligado={fech} onChange={setFech} rotulo="Acender com a fechadura" />
        </label>
        <label className="block text-xs text-muted-foreground">Brilho ao acender sozinha: <b className="text-foreground">{brilho}%</b>
          <input type="range" min="1" max="100" value={brilho} onChange={(e) => setBrilho(+e.target.value)} className="mt-1 w-full accent-[hsl(var(--primary))]" disabled={!podeEditar} aria-label="Brilho padrão" />
        </label>
        <p className="text-[11px] text-muted-foreground">Cada automação age uma vez por dia (ou por porta destrancada): se alguém apagar na mão depois, o sistema não acende de novo. Elas rodam no agente do escritório.</p>
        {podeEditar && <Botao tamanho="sm" carregando={salvando} onClick={salvar}>Salvar automações</Botao>}
      </div>
    </section>
  )
}

function CartaoLuz({ d0, sol, podeControlar, podeGerenciar, aoRemover }) {
  const toast = useToast()
  const [d, setD] = useState(d0)
  const [ocupado, setOcupado] = useState('')
  const [conectar, setConectar] = useState(false)
  const [aberto, setAberto] = useState(false)
  const [versao, setVersao] = useState(0)
  const r = d.resumo || {}
  const [brilho, setBrilho] = useState(r.brilho ?? 100)
  const atualizar = (n) => { setD(n); setVersao((v) => v + 1) }
  const comando = async (acao, valor) => {
    setOcupado(acao)
    try { atualizar(await api.post(`/api/dispositivos/${d.id}/comando`, { acao, valor })) } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const remover = async () => {
    try { await api.del(`/api/dispositivos/${d.id}`); toast(`${d.nome} removida.`); aoRemover() } catch (e) { toast(e.message, 'erro') }
  }
  const acesa = r.ligada === true
  const temBrilho = r.brilho != null || d.driver === 'placa'
  return (
    <section className="cartao overflow-hidden">
      <div className={`flex items-start gap-3 p-4 ${acesa ? 'bg-amber-50/70 dark:bg-amber-500/10' : ''}`}>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${acesa ? 'bg-amber-400 text-amber-950' : 'bg-muted text-muted-foreground'}`}>
          {acesa ? <Lightbulb className="h-5 w-5" /> : <LightbulbOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{d.nome}</p><Estado d={d} /></div>
          <p className="text-xs text-muted-foreground">{r.tecla ? `Tecla ${r.tecla.split('_')[1]} · ` : ''}{d.projeto_nome || 'Escritório todo'}{d.conectado ? ` · ${acesa ? `acesa${r.brilho != null ? `, ${r.brilho}%` : ''}` : r.ligada === false ? 'apagada' : 'estado desconhecido'}` : ''}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-border p-4">
        {!d.conectado ? <SemAparelho compacto d={d} aoConectar={(aba) => setConectar(aba || true)} /> : (
          <>
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="sm" icone={Lightbulb} disabled={!podeControlar || acesa} carregando={ocupado === 'ligar'} onClick={() => comando('ligar')}>Acender</Botao>
              <Botao tamanho="sm" variante="secundario" icone={LightbulbOff} disabled={!podeControlar || r.ligada === false} carregando={ocupado === 'desligar'} onClick={() => comando('desligar')}>Apagar</Botao>
            </div>
            {temBrilho && (
              <label className="block text-xs text-muted-foreground">Brilho <b className="text-foreground">{brilho}%</b>
                <input type="range" min="1" max="100" value={brilho} disabled={!podeControlar} onChange={(e) => setBrilho(+e.target.value)}
                  onPointerUp={() => comando('brilho', brilho)} onKeyUp={(e) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && comando('brilho', brilho)}
                  className="mt-1 w-full accent-amber-500" aria-label={`Brilho de ${d.nome}`} />
              </label>
            )}
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="fantasma" onClick={() => setAberto(true)}>Automações e histórico</Botao>
          {podeGerenciar && <Botao tamanho="sm" variante="fantasma" icone={Link2} onClick={() => setConectar(true)}>{d.conectado ? 'Trocar aparelho' : 'Conectar'}</Botao>}
          {podeGerenciar && <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={remover}>Remover</Botao>}
        </div>
      </div>
      <ConectarAparelho d={d} aberto={!!conectar} abaInicial={conectar === 'placa' ? 'placa' : undefined} aoFechar={() => setConectar(false)} aoConectar={atualizar} />
      <Modal aberto={aberto} titulo={d.nome} onFechar={() => setAberto(false)} largura="max-w-2xl">
        {aberto && (
          <div className="space-y-4">
            <Automacoes d={d} sol={sol} aoSalvar={atualizar} podeEditar={podeGerenciar} />
            <Agendas d={d} acoes={r.tecla ? [['ligar', 'Acender'], ['desligar', 'Apagar']] : [['ligar', 'Acender'], ['desligar', 'Apagar'], ['brilho', 'Brilho (%)']]} aoSalvar={atualizar} podeEditar={podeGerenciar} />
            <Travas d={d} aoMudar={atualizar} />
            <Historico d={d} versao={versao} />
          </div>
        )}
      </Modal>
    </section>
  )
}

// interruptor de parede de várias teclas (Novadigital Touch Wi-Fi 4 teclas, Tuya): o painel imita o de vidro preto;
// cada círculo é uma tecla e acende quando a luz dela está ligada. Tocar no círculo liga/desliga só aquela tecla.
function PaineisInterruptor({ luzes, podeControlar, aoMudar }) {
  const toast = useToast()
  const [ocupado, setOcupado] = useState(null)
  const grupos = useMemo(() => {
    const m = new Map()
    for (const d of luzes) if (d.resumo?.tecla && d.tuya_id) { if (!m.has(d.tuya_id)) m.set(d.tuya_id, []); m.get(d.tuya_id).push(d) }
    return [...m.values()].map((l) => l.sort((a, b) => +a.resumo.tecla.split('_')[1] - +b.resumo.tecla.split('_')[1]))
  }, [luzes])
  if (!grupos.length) return null
  const alternar = async (d) => {
    setOcupado(d.id)
    try { await api.post(`/api/dispositivos/${d.id}/comando`, { acao: d.resumo.ligada ? 'desligar' : 'ligar' }); aoMudar() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {grupos.map((g) => (
        <section key={g[0].tuya_id} className="cartao p-4">
          <p className="truncate text-sm font-medium">{g[0].produto || 'Interruptor'}</p>
          <p className="mb-3 text-xs text-muted-foreground">{g.length} tecla(s) · {g[0].online ? 'online' : 'offline'}</p>
          {/* marca: placa de vidro preto do interruptor (como o aparelho de verdade) */}
          <div className="mx-auto grid aspect-[3/4] w-full max-w-[13rem] grid-cols-2 place-items-center gap-4 rounded-xl bg-neutral-950 p-6 ring-1 ring-neutral-800">
            {g.map((d) => {
              const on = d.resumo.ligada === true
              return (
                <button key={d.id} type="button" disabled={!podeControlar || ocupado === d.id} onClick={() => alternar(d)} aria-pressed={on}
                  title={`${d.nome}: ${on ? 'apagar' : 'acender'}`} aria-label={`${d.nome}: ${on ? 'apagar' : 'acender'}`}
                  className={`flex aspect-square w-full max-w-[4.5rem] items-center justify-center rounded-full border-2 transition-colors disabled:opacity-60 ${on ? 'border-cyan-300 bg-cyan-300/15 text-cyan-200' : 'border-cyan-900 text-cyan-900 hover:border-cyan-700'}`}>
                  <span className="text-xs font-semibold">{d.resumo.tecla.split('_')[1]}</span>
                </button>
              )
            })}
          </div>
          <ul className="mt-3 space-y-1 text-xs">{g.map((d) => <li key={d.id} className="flex justify-between gap-2"><span className="truncate"><b>{d.resumo.tecla.split('_')[1]}</b> · {d.nome}</span><span className={d.resumo.ligada ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>{d.resumo.ligada ? 'acesa' : d.resumo.ligada === false ? 'apagada' : '?'}</span></li>)}</ul>
        </section>
      ))}
    </div>
  )
}

// "Vai funcionar?": o interruptor Novadigital Touch Wi-Fi (1 a 4 teclas, Tuya/Smart Life, Alexa e Google) é o caso
// mais comum. O sistema conversa com ele pela nuvem Tuya (switch_1…switch_4); estas são as condições reais para dar certo.
const CONDICOES = [
  ['App certo', 'Parear no app Smart Life (a conta já conectada ao sistema). Pareado só no app da marca (Novo Digital), ele fica numa conta separada e não aparece aqui; nesse caso, remova lá e pareie de novo no Smart Life.'],
  ['Wi-Fi 2,4 GHz', 'O interruptor não enxerga redes 5 GHz. Use a mesma rede 2,4 GHz que os transmissores.'],
  ['Fio neutro', 'Confira na caixa se o seu modelo pede neutro na caixinha da parede. Sem neutro, só a versão "sem neutro" do fabricante funciona. Instalação elétrica com o disjuntor desligado, de preferência por eletricista.'],
  ['Carga por tecla', 'Respeite a potência máxima por tecla que está na caixa do produto (LED, fluorescente). Não ligue tomada nem motor numa tecla de luz.'],
  ['Uma tecla, uma luz', 'Em Adicionar interruptor, cada tecla vira uma luz com nome e sala. Acender, apagar, agenda, anoitecer e luz com a fechadura funcionam; brilho não (tecla só liga e desliga).'],
]
function Compatibilidade() {
  return (
    <section className="cartao mt-6 p-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ToggleRight className="h-4 w-4" />Vai funcionar? Interruptor Novadigital Touch Wi-Fi</h2>
        <span className="rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">Compatível (1, 2, 3 ou 4 teclas)</span>
      </div>
      <p className="mt-1.5 text-muted-foreground">É um aparelho Tuya, a mesma plataforma do Smart Life. O sistema já sabe ler cada tecla dele. Funciona se estas condições forem atendidas:</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 md:grid-cols-2">
        {CONDICOES.map(([t, d]) => <div key={t}><dt className="font-medium">{t}</dt><dd className="text-muted-foreground">{d}</dd></div>)}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Depois de instalado: Luzes → Adicionar interruptor → escolher o interruptor → dar nome e sala a cada tecla. Até ele aparecer na conta, nada é enviado.</p>
    </section>
  )
}

function AssistenteInterruptor({ aberto, projetos, aoFechar, aoCriar }) {
  const toast = useToast()
  const [lista, setLista] = useState(null), [erro, setErro] = useState('')
  const [info, setInfo] = useState(null), [linhas, setLinhas] = useState([])
  const [salvando, setSalvando] = useState(false)
  const procurar = () => { setErro(''); setLista(null); api.get('/api/dispositivos/disponiveis').then((r) => setLista((r.aparelhos || []).filter((a) => (a.tipos || [a.tipo]).includes('luz')))).catch((e) => setErro(e.message)) }
  useEffect(() => { if (aberto) { setInfo(null); procurar() } }, [aberto])   // eslint-disable-line react-hooks/exhaustive-deps
  const escolher = async (a) => {
    try {
      const t = await api.get(`/api/dispositivos/teclas/${a.id}`)
      setInfo(t)
      setLinhas(t.teclas.map((k) => ({ tecla: k, usar: !t.usadas.some((u) => u.tecla === k), nome: `${t.nome || 'Interruptor'} · tecla ${k.split('_')[1]}`, projeto_id: '' })))
    } catch (e) { toast(e.message, 'erro') }
  }
  const salvar = async () => {
    const teclas = linhas.filter((l) => l.usar && !info.usadas.some((u) => u.tecla === l.tecla)).map((l) => ({ tecla: l.tecla, nome: l.nome.trim(), projeto_id: l.projeto_id ? +l.projeto_id : null }))
    if (!teclas.length) return toast('Escolha pelo menos uma tecla.', 'erro')
    setSalvando(true)
    try { const r = await api.post('/api/dispositivos/interruptor', { tuya_id: info.id, teclas }); toast(`${r.criadas.length} tecla(s) cadastrada(s).`); aoCriar() } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <Modal aberto={aberto} titulo="Adicionar interruptor de parede" onFechar={aoFechar} largura="max-w-2xl">
      {!info ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Interruptores Wi-Fi Tuya (ex.: Novadigital Touch de 1, 2, 3 ou 4 teclas) pareados na conta Smart Life deste sistema.</p>
          {erro && <Aviso>{erro}</Aviso>}
          {!lista && !erro && <p className="text-muted-foreground">Procurando na conta Smart Life…</p>}
          {lista && !lista.length && (
            <div className="rounded-lg border border-border p-4">
              <p className="font-medium">Nenhum interruptor na conta ainda. Para parear:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Instale o interruptor com o fio neutro, se o modelo pedir, e ligue o disjuntor.</li>
                <li>Segure uma tecla por uns 6 s até a luz piscar rápido (modo de pareamento).</li>
                <li>No app <b className="text-foreground">Smart Life</b> (a mesma conta dos transmissores, não o app Novo Digital): + → Adicionar dispositivo, na rede Wi-Fi 2,4 GHz do escritório.</li>
                <li>Se ele já estiver no app Novo Digital, remova de lá antes: cada aparelho só fica numa conta.</li>
                <li>Volte aqui e toque em <b className="text-foreground">Procurar de novo</b>.</li>
              </ol>
            </div>
          )}
          <ul className="space-y-2">{(lista || []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <ToggleRight className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{a.nome}</p><p className="truncate text-xs text-muted-foreground">{a.produto || a.categoria} · {a.online ? 'online' : 'offline'}{a.teclas_em_uso ? ' · algumas teclas já cadastradas' : ''}</p></div>
              {a.ja_cadastrado ? <span className="text-xs text-muted-foreground">Já em uso como luz única</span> : <Botao tamanho="sm" onClick={() => escolher(a)}>Escolher</Botao>}
            </li>))}
          </ul>
          <Botao variante="secundario" icone={RefreshCw} onClick={procurar}>Procurar de novo</Botao>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p><b>{info.nome}</b> tem {info.teclas.length} tecla(s). Dê um nome e a sala de cada uma (o nome aparece no painel e no mapa).</p>
          {info.teclas.length === 0 && <Aviso tipo="alerta">Este aparelho não expõe teclas (switch_1, switch_2…) na nuvem. Use Cadastrar luz e Conectar.</Aviso>}
          <ul className="space-y-2">{linhas.map((l, i) => {
            const uso = info.usadas.find((u) => u.tecla === l.tecla)
            return (
              <li key={l.tecla} className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-[auto_minmax(0,1fr)_12rem]">
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" disabled={!!uso} checked={l.usar && !uso} onChange={(e) => setLinhas(linhas.map((x, j) => j === i ? { ...x, usar: e.target.checked } : x))} />Tecla {l.tecla.split('_')[1]}</label>
                {uso ? <span className="text-xs text-muted-foreground sm:col-span-2">Já cadastrada como "{uso.nome}"</span> : <>
                  <input className="campo h-8" maxLength={60} value={l.nome} onChange={(e) => setLinhas(linhas.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} aria-label={`Nome da tecla ${l.tecla.split('_')[1]}`} />
                  <select className="campo h-8" value={l.projeto_id} onChange={(e) => setLinhas(linhas.map((x, j) => j === i ? { ...x, projeto_id: e.target.value } : x))} aria-label={`Sala da tecla ${l.tecla.split('_')[1]}`}>
                    <option value="">Escritório todo</option>{(projetos || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select></>}
              </li>)
          })}</ul>
          <div className="flex justify-between gap-2"><Botao variante="secundario" onClick={() => setInfo(null)}>Voltar</Botao><Botao carregando={salvando} onClick={salvar}>Cadastrar teclas</Botao></div>
        </div>
      )}
    </Modal>
  )
}

export default function Luzes() {
  const toast = useToast()
  const { sessao, projetos } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/dispositivos?tipo=luz'))
  const [nova, setNova] = useState(null)
  const [tudo, setTudo] = useState('')
  const [assistente, setAssistente] = useState(false)
  const perms = sessao?.permissoes || []
  const dono = ['dono', 'admin'].includes(sessao?.papel)
  const podeGerenciar = dono || perms.includes('transmissores.gerenciar')
  const podeControlar = dono || perms.includes('aparelhos.controlar')
  const luzes = dados?.dispositivos
  const conta = useMemo(() => {
    const l = luzes || []
    return { total: l.length, conectadas: l.filter((d) => d.conectado).length, acesas: l.filter((d) => d.resumo?.ligada === true).length }
  }, [luzes])

  if (erro) return <Aviso>{erro}</Aviso>
  if (!luzes || !sessao) return <Carregando />

  const criar = async (nome, projeto_id) => {
    try { await api.post('/api/dispositivos', { tipo: 'luz', nome, projeto_id }); recarregar(); return true } catch (e) { toast(e.message, 'erro'); return false }
  }
  const umaPorSala = async () => {
    const ja = new Set(luzes.map((d) => d.projeto_id))
    const faltam = (projetos || []).filter((p) => !ja.has(p.id))
    let ok = 0
    for (const p of faltam) if (await criar(`Luz ${p.nome}`, p.id)) ok += 1
    toast(faltam.length ? `${ok} luz(es) cadastrada(s), uma por sala. Conecte cada uma ao aparelho dela.` : 'Todas as salas já têm luz cadastrada.')
  }
  const todas = async (acao) => {
    setTudo(acao)
    const alvo = luzes.filter((d) => d.conectado)
    let ok = 0, falhas = 0
    for (const d of alvo) { try { await api.post(`/api/dispositivos/${d.id}/comando`, { acao }); ok += 1 } catch { falhas += 1 } }
    toast(alvo.length ? `${ok} luz(es) ${acao === 'ligar' ? 'acesa(s)' : 'apagada(s)'}${falhas ? `, ${falhas} sem resposta` : ''}.` : 'Nenhuma luz conectada a um aparelho ainda.', falhas ? 'erro' : 'ok')
    setTudo(''); recarregar()
  }

  return (
    <div className="w-full">
      <Cabecalho titulo="Iluminação"
        descricao="Luzes de cada sala: acender, apagar, brilho, acender sozinha ao anoitecer e quando a porta é destrancada à noite."
        acoes={<>
          <Botao variante="secundario" icone={Lightbulb} disabled={!podeControlar || !conta.conectadas} carregando={tudo === 'ligar'} onClick={() => todas('ligar')}>Acender todas</Botao>
          <Botao variante="secundario" icone={LightbulbOff} disabled={!podeControlar || !conta.conectadas} carregando={tudo === 'desligar'} onClick={() => todas('desligar')}>Apagar todas</Botao>
          {podeGerenciar && <Botao variante="secundario" icone={ToggleRight} onClick={() => setAssistente(true)}>Adicionar interruptor</Botao>}
          {podeGerenciar && <Botao icone={Plus} onClick={() => setNova({ nome: '', projeto_id: '' })}>Cadastrar luz</Botao>}
        </>} />

      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Acesas agora', valor: conta.acesas, sufixo: ` / ${conta.conectadas}`, dica: conta.conectadas ? 'das luzes conectadas' : 'nenhuma conectada ainda' },
          { rotulo: 'Pôr do sol hoje', valor: dados.sol?.por || '—', dica: 'calculado para o escritório (Florianópolis)' },
          { rotulo: 'Nascer do sol', valor: dados.sol?.nascer || '—', dica: dados.noite ? 'agora é noite' : 'agora é dia' },
          { rotulo: 'Cadastradas', valor: conta.total, dica: `${conta.total - conta.conectadas} sem aparelho conectado` },
        ]} />
      </div>

      {dados.noite && conta.conectadas > 0 && conta.acesas === 0 && (
        <div className="mb-4"><Aviso tipo="alerta"><Moon className="mr-1 inline h-4 w-4" />Já é noite e todas as luzes estão apagadas.</Aviso></div>
      )}

      {!luzes.length ? (
        <Vazio icone={Lightbulb} titulo="Nenhuma luz cadastrada"
          texto="Cadastre as luzes de cada sala e conecte cada uma à lâmpada, painel, fita ou interruptor Smart Life (ou a uma placa própria). Sem aparelho, nada é enviado."
          acao={podeGerenciar && <Botao icone={Plus} onClick={umaPorSala}>Cadastrar uma luz por sala</Botao>} />
      ) : (
        <>
          {podeGerenciar && luzes.length < (projetos || []).length && (
            <p className="mb-3 text-sm text-muted-foreground">Faltam salas sem luz cadastrada. <button onClick={umaPorSala} className="font-medium text-primary hover:underline">Cadastrar uma luz para cada sala que falta</button></p>
          )}
          {luzes.some((d) => !d.conectado) && (
            <div className="mb-4"><Aviso tipo="alerta">
              {luzes.filter((d) => !d.conectado).length} de {luzes.length} luzes ainda não têm aparelho conectado: o cartão delas é só o cadastro e nenhum comando sai.
              Para controlar de verdade, pareie a lâmpada, o painel ou o interruptor de parede no app <b>Smart Life</b> (a conta já conectada ao sistema) ou use uma <b>placa própria</b> (Arduino/ESP com relé) e toque em Conectar no cartão.
            </Aviso></div>
          )}
          <PaineisInterruptor luzes={luzes} podeControlar={podeControlar} aoMudar={recarregar} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {luzes.map((d) => <CartaoLuz key={d.id} d0={d} sol={dados.sol} podeControlar={podeControlar} podeGerenciar={podeGerenciar} aoRemover={recarregar} />)}
          </div>
        </>
      )}

      <section className="cartao mt-6 p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Sunset className="h-4 w-4" />Como funciona</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Funciona com lâmpadas, painéis, fitas de LED e interruptores de parede da Smart Life (mesma conta dos transmissores), ou com uma placa própria (Arduino/ESP com relé).</li>
          <li>Interruptor de várias teclas (ex.: Novadigital Touch Wi-Fi de 4 teclas): use <b className="text-foreground">Adicionar interruptor</b>. Cada tecla vira uma luz com nome e sala próprios, e todas aparecem juntas no painel do interruptor.</li>
          <li>Acender e apagar vão pela nuvem da Smart Life: funcionam mesmo sem o computador do escritório ligado. As automações rodam no agente.</li>
          <li>O pôr do sol é calculado para cada dia (<Sunrise className="inline h-3.5 w-3.5" /> {dados.sol?.nascer} · <Sunset className="inline h-3.5 w-3.5" /> {dados.sol?.por} hoje). No mapa 3D, a sala fica iluminada à noite e escura quando a luz dela está apagada.</li>
        </ul>
      </section>

      <Compatibilidade />

      <AssistenteInterruptor aberto={assistente} projetos={projetos} aoFechar={() => setAssistente(false)} aoCriar={() => { setAssistente(false); recarregar() }} />
      <Modal aberto={!!nova} titulo="Cadastrar luz" onFechar={() => setNova(null)}>
        {nova && (
          <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await criar(nova.nome.trim(), nova.projeto_id ? +nova.projeto_id : null)) { toast('Luz cadastrada. Agora conecte ao aparelho.'); setNova(null) } }}>
            <label className="block"><span className="rotulo">Nome</span><input className="campo mt-1" required maxLength={60} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Luz da sala do diretor" /></label>
            <label className="block"><span className="rotulo">Sala</span>
              <select className="campo mt-1" value={nova.projeto_id} onChange={(e) => setNova({ ...nova, projeto_id: e.target.value })}>
                <option value="">Escritório todo (corredor, copa)</option>
                {(projetos || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setNova(null)}>Cancelar</Botao><Botao type="submit">Cadastrar</Botao></div>
          </form>
        )}
      </Modal>
    </div>
  )
}
