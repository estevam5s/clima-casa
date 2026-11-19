import { useMemo, useState } from 'react'
import { Lightbulb, LightbulbOff, Link2, Moon, Plus, Sunrise, Sunset, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Agendas, ConectarAparelho, Estado, Historico, SemAparelho } from '../components/dispositivos/Comum'
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
          <p className="text-xs text-muted-foreground">{d.projeto_nome || 'Escritório todo'}{d.conectado ? ` · ${acesa ? `acesa${r.brilho != null ? `, ${r.brilho}%` : ''}` : r.ligada === false ? 'apagada' : 'estado desconhecido'}` : ''}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-border p-4">
        {!d.conectado ? <SemAparelho d={d} aoConectar={() => setConectar(true)} /> : (
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
      <ConectarAparelho d={d} aberto={conectar} aoFechar={() => setConectar(false)} aoConectar={atualizar} />
      <Modal aberto={aberto} titulo={d.nome} onFechar={() => setAberto(false)} largura="max-w-2xl">
        {aberto && (
          <div className="space-y-4">
            <Automacoes d={d} sol={sol} aoSalvar={atualizar} podeEditar={podeGerenciar} />
            <Agendas d={d} acoes={[['ligar', 'Acender'], ['desligar', 'Apagar'], ['brilho', 'Brilho (%)']]} aoSalvar={atualizar} podeEditar={podeGerenciar} />
            <Historico d={d} versao={versao} />
          </div>
        )}
      </Modal>
    </section>
  )
}

export default function Luzes() {
  const toast = useToast()
  const { sessao, projetos } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/dispositivos?tipo=luz'))
  const [nova, setNova] = useState(null)
  const [tudo, setTudo] = useState('')
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {luzes.map((d) => <CartaoLuz key={d.id} d0={d} sol={dados.sol} podeControlar={podeControlar} podeGerenciar={podeGerenciar} aoRemover={recarregar} />)}
          </div>
        </>
      )}

      <section className="cartao mt-6 p-5 text-sm text-muted-foreground">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Sunset className="h-4 w-4" />Como funciona</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Funciona com lâmpadas, painéis, fitas de LED e interruptores de parede da Smart Life (mesma conta dos transmissores), ou com uma placa própria (Arduino/ESP com relé).</li>
          <li>Acender e apagar vão pela nuvem da Smart Life: funcionam mesmo sem o computador do escritório ligado. As automações rodam no agente.</li>
          <li>O pôr do sol é calculado para cada dia (<Sunrise className="inline h-3.5 w-3.5" /> {dados.sol?.nascer} · <Sunset className="inline h-3.5 w-3.5" /> {dados.sol?.por} hoje). No mapa 3D, a sala fica iluminada à noite e escura quando a luz dela está apagada.</li>
        </ul>
      </section>

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
