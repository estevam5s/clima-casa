import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, CloudDownload, Pencil, Plus, Power, Radio, RefreshCw, Search, Trash2, Truck, Wand2, Wifi } from 'lucide-react'
import { api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Ponto, Selo, Vazio, useDados, useToast } from '../components/ui'
import { motion } from 'framer-motion'

function Importar({ onFechar, aoImportar }) {
  const { dados, erro } = useDados(() => api.get('/api/tuya/aparelhos'))
  const { dados: projetos } = useDados(() => api.get('/api/projetos'))
  const [sala, setSala] = useState('')
  const [importando, setImportando] = useState(null)
  const toast = useToast()
  if (erro) {
    return (
      <Aviso>
        {erro} {erro.includes('não conectada') && <Link to="/configuracoes" className="font-medium underline" onClick={onFechar}>Conectar conta</Link>}
      </Aviso>
    )
  }
  if (!dados) return <Carregando />
  const lista = [...dados].sort((a, b) => b.transmissor_ir - a.transmissor_ir)
  const importar = async (d) => {
    setImportando(d.id)
    try {
      await api.post(`/api/hubs/importar/${d.id}${sala ? `?projeto_id=${sala}` : ''}`)
      toast(`${d.nome} importado com Local Key.`)
      aoImportar()
      onFechar()
    } catch (e) {
      toast(e.message, 'erro')
      setImportando(null)
    }
  }
  return (
    <div>
      <label className="block pb-3">
        <span className="rotulo">Sala onde o transmissor vai ficar</span>
        <select className="campo mt-1" value={sala} onChange={(e) => setSala(e.target.value)} aria-label="Sala do transmissor">
          <option value="">Manter a atual (novo: primeira sala)</option>
          {(projetos || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <span className="ajuda mt-1 block">Um transmissor por sala fechada: o infravermelho não atravessa parede e não tem endereço.</span>
      </label>
    <div className="divide-y divide-border">
      {lista.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum aparelho na conta Smart Life.</p>}
      {lista.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium"><Ponto ativo={d.online} /> {d.nome}</p>
            <p className="truncate text-xs text-muted-foreground">{d.transmissor_ir ? 'Transmissor infravermelho' : d.produto || d.categoria} · {d.id}</p>
          </div>
          {d.cadastrado
            ? <Botao tamanho="sm" variante="secundario" carregando={importando === d.id} onClick={() => importar(d)}>Atualizar</Botao>
            : <Botao tamanho="sm" disabled={!d.transmissor_ir} carregando={importando === d.id} onClick={() => importar(d)}>Importar</Botao>}
        </div>
      ))}
    </div>
    </div>
  )
}

function Procurar({ onFechar, aoCadastrar }) {
  const { dados, erro } = useDados(() => api.get('/api/hubs/descobrir'))
  const [manual, setManual] = useState(null)
  const [f, setF] = useState({ nome: 'Transmissor IR', local_key: '' })
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <div className="py-10 text-center text-sm text-muted-foreground"><Carregando />Procurando aparelhos Tuya na rede (8 s)…</div>

  if (manual) {
    const salvar = async (e) => {
      e.preventDefault()
      try {
        await api.post('/api/hubs', { id: manual.id, ip: manual.ip, versao: manual.versao || '3.5', ...f })
        toast('Transmissor cadastrado.')
        aoCadastrar()
        onFechar()
      } catch (e) { toast(e.message, 'erro') }
    }
    return (
      <form onSubmit={salvar} className="space-y-4">
        <p className="text-sm text-muted-foreground">{manual.id} em {manual.ip}</p>
        <div><label className="rotulo" htmlFor="hn">Nome</label><input id="hn" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></div>
        <div>
          <label className="rotulo" htmlFor="hk">Local Key</label>
          <input id="hk" className="campo font-mono" value={f.local_key} onChange={(e) => setF({ ...f, local_key: e.target.value })} required />
          <p className="ajuda">Mais fácil: conecte a conta Smart Life em Configurações → Contas e use "Importar da conta", que traz a chave sozinho.</p>
        </div>
        <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={() => setManual(null)}>Voltar</Botao><Botao type="submit">Cadastrar</Botao></div>
      </form>
    )
  }

  return (
    <div className="divide-y divide-border">
      {dados.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum aparelho Tuya respondeu. Confira se o transmissor e este computador estão na mesma rede Wi-Fi.</p>}
      {dados.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{d.ip}</p>
            <p className="truncate text-xs text-muted-foreground">{d.id} · protocolo {d.versao}</p>
          </div>
          {d.cadastrado ? <Selo cor="verde">Cadastrado</Selo> : <Botao tamanho="sm" onClick={() => setManual(d)}>Cadastrar</Botao>}
        </div>
      ))}
    </div>
  )
}

function Editar({ hub, onFechar, aoSalvar }) {
  const { projetos } = useProjeto()
  const [f, setF] = useState({ nome: hub.nome, ip: hub.ip || '', versao: hub.versao, local_key: '', projeto_id: hub.projeto_id ?? '' })
  const toast = useToast()
  const salvar = async (e) => {
    e.preventDefault()
    try {
      await api.put(`/api/hubs/${hub.id}`, { ...f, local_key: f.local_key || null, projeto_id: f.projeto_id ? +f.projeto_id : null })
      toast('Transmissor atualizado.')
      aoSalvar()
      onFechar()
    } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <form onSubmit={salvar} className="space-y-4">
      <div>
        <label className="rotulo" htmlFor="epj">Projeto</label>
        <select id="epj" className="campo" value={f.projeto_id} onChange={(e) => setF({ ...f, projeto_id: e.target.value })}>
          <option value="">Sem projeto</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div><label className="rotulo" htmlFor="en">Nome</label><input id="en" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required /></div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <div><label className="rotulo" htmlFor="ei">IP na rede</label><input id="ei" className="campo" value={f.ip} onChange={(e) => setF({ ...f, ip: e.target.value })} placeholder="192.168.0.187" /></div>
        <div>
          <label className="rotulo" htmlFor="ev">Protocolo</label>
          <select id="ev" className="campo" value={f.versao} onChange={(e) => setF({ ...f, versao: e.target.value })}>
            {['3.1', '3.3', '3.4', '3.5'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="rotulo" htmlFor="ek">Nova Local Key</label>
        <input id="ek" className="campo font-mono" value={f.local_key} onChange={(e) => setF({ ...f, local_key: e.target.value })} placeholder="Deixe em branco para manter a atual" />
        <p className="ajuda">A chave muda sempre que o transmissor é pareado de novo no app.</p>
      </div>
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
    </form>
  )
}

// Orientação de troca de Wi-Fi: o que o sistema faz sozinho e o que só a pessoa pode fazer.
// Cada sala (projeto) e o transmissor dos ares dela: próprio, dividido com outra sala ou nenhum.
// O infravermelho não atravessa parede e não tem endereço: sala fechada que obedece sozinha = um transmissor só dela.
function SalasResumo({ hubs }) {
  const { dados: ares } = useDados(() => api.get('/api/aparelhos'))
  const [aberto, setAberto] = useState(false)
  if (!ares || !ares.length) return null
  const salasDoHub = Object.fromEntries(hubs.map((h) => [h.id, h.salas || []]))
  const porSala = {}
  for (const a of ares) {
    const nome = a.projeto_nome || 'Sem sala'
    const s = (porSala[nome] ||= { nome, ares: [], sem: [], divididos: new Set() })
    s.ares.push(a.nome)
    if (!a.hub_id) s.sem.push(a.nome)
    else if ((salasDoHub[a.hub_id] || []).length > 1) s.divididos.add(a.hub_nome || 'transmissor')
  }
  const salas = Object.values(porSala).sort((x, y) => x.nome.localeCompare(y.nome))
  const estado = (s) => (s.sem.length === s.ares.length ? 'sem' : s.sem.length ? 'parcial' : s.divididos.size ? 'dividido' : 'proprio')
  const cont = salas.reduce((c, s) => ({ ...c, [estado(s)]: (c[estado(s)] || 0) + 1 }), {})
  const tom = { proprio: 'verde', dividido: 'ambar', parcial: 'ambar', sem: 'vermelho' }
  const texto = (s) => ({
    proprio: 'Transmissor próprio',
    dividido: `Divide ${[...s.divididos].join(', ')} com outra sala`,
    parcial: `Sem transmissor: ${s.sem.join(', ')}`,
    sem: 'Nenhum transmissor',
  })[estado(s)]
  return (
    <section className="cartao mb-6 p-4">
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={aberto}>
        <div>
          <h2 className="titulo-secao">Salas e transmissores</h2>
          <p className="text-xs text-muted-foreground">
            {cont.proprio || 0} com transmissor próprio · {(cont.dividido || 0) + (cont.parcial || 0)} dividindo ou incompletas · {cont.sem || 0} sem transmissor
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <>
          <ul className="mt-3 divide-y divide-border text-sm">
            {salas.map((s) => (
              <li key={s.nome} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0"><span className="font-medium">{s.nome}</span> <span className="text-xs text-muted-foreground">· {s.ares.join(', ')}</span></span>
                <Selo cor={tom[estado(s)]}>{texto(s)}</Selo>
              </li>
            ))}
          </ul>
          <p className="ajuda mt-2">Salão aberto com vários projetos pode dividir um transmissor (os ares iguais mudam juntos). Sala fechada que deve obedecer sozinha precisa do seu.</p>
        </>
      )}
    </section>
  )
}

function GuiaRede() {
  const [aberto, setAberto] = useState(() => { try { return localStorage.getItem('clima-guia-rede') !== '0' } catch { return true } })
  const alternar = () => { const v = !aberto; setAberto(v); try { localStorage.setItem('clima-guia-rede', v ? '1' : '0') } catch { /* sem armazenamento */ } }
  return (
    <section className="cartao mb-6">
      <button onClick={alternar} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={aberto}>
        <span className="flex items-center gap-2 text-sm font-semibold"><Wifi className="h-4 w-4 text-primary" /> Mudou de Wi-Fi ou de lugar?</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="grid gap-6 border-t border-border px-4 py-4 text-sm lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-muted-foreground">
              O transmissor guarda o nome e a senha de um Wi-Fi só. Trocou a rede (roteador novo, senha nova, outro escritório), ele fica offline até
              ser pareado de novo. Isso é do próprio aparelho Tuya, não do sistema. Mesmo Wi-Fi, só reiniciou ou o roteador deu outro IP? Não precisa fazer nada.
            </p>
            <ol className="mt-3 space-y-2">
              {[
                ['No app Smart Life', 'abra o Smart IR, toque no lápis (ou "...") e em Remover dispositivo.'],
                ['No transmissor', 'segure o botão uns 5 segundos, até a luz piscar rápido.'],
                ['No Smart Life', 'toque em + → Adicionar dispositivo e escolha o Wi-Fi 2,4 GHz do roteador onde está o computador do agente. Rede 5 GHz não funciona; com o mesmo nome para as duas bandas, fique perto do roteador.'],
                ['Aqui no sistema', 'nada para apagar nem cadastrar. Em até 1 minuto o agente acha o IP novo e busca a chave nova na conta Smart Life. Para não esperar, clique em Reconectar agora.'],
              ].map(([q, t], i) => (
                <li key={q} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold tabular">{i + 1}</span>
                  <span><b className="font-medium">{q}:</b> <span className="text-muted-foreground">{t}</span></span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">O que precisa estar junto</p>
            <ul className="space-y-2">
              <li><b className="font-medium">Transmissor e computador do agente</b> <span className="text-muted-foreground">na mesma rede. É o agente (Mac ou outro PC ligado) que fala com o transmissor pela rede local.</span></li>
              <li><b className="font-medium">O painel, o celular e a Alexa</b> <span className="text-muted-foreground">não precisam: funcionam de qualquer lugar pela internet.</span></li>
              <li><b className="font-medium">Conta Smart Life conectada</b> <span className="text-muted-foreground">uma vez só, em <Link to="/configuracoes?aba=contas" className="text-primary hover:underline">Configurações → Contas</Link>. É por ela que o sistema pega a chave nova sozinho.</span></li>
              <li><b className="font-medium">Botões gravados</b> <span className="text-muted-foreground">continuam valendo. Não precisa gravar de novo.</span></li>
            </ul>
          </div>
        </div>
      )}
    </section>
  )
}

// Zona: ares que obedecem juntos a este transmissor (backend/app/zonas.py). Num salão aberto com ares iguais, um sinal
// chega a todos: o controle aqui é da zona inteira (é o que acontece de verdade).
function ZonaControle({ zona, ares, aoMudar, aoTestar }) {
  const [ocupado, setOcupado] = useState(null)
  const toast = useToast()
  const membros = ares.filter((a) => zona.aparelhos.includes(a.id))
  const ref = membros.find((a) => a.id === zona.alexa_aparelho_id) || membros[0]
  const mandar = async (estado, k) => {
    setOcupado(k)
    try { await api.post(`/api/zonas/${zona.id}/estado`, estado); toast(`Zona ${zona.nome}: comando enviado para os ${membros.length} ares.`); aoMudar() }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{zona.nome}</p>
        <Selo cor={zona.origem === 'teste' ? 'verde' : 'ambar'}>{zona.origem === 'teste' ? 'confirmada no teste' : 'pelos botões iguais'}</Selo>
      </div>
      <p className="ajuda mt-1">{membros.map((a) => a.nome).join(', ')} obedecem juntos: o infravermelho não tem endereço e os ares são do mesmo modelo. Um comando muda a zona inteira.</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Botao tamanho="sm" icone={Power} carregando={ocupado === 'ligar'} disabled={!!ocupado} onClick={() => mandar({ ligado: true }, 'ligar')}>Ligar zona</Botao>
        <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === 'desligar'} disabled={!!ocupado} onClick={() => mandar({ ligado: false }, 'desligar')}>Desligar zona</Botao>
        {ref && <span className="inline-flex items-center gap-1 rounded-md border border-border">
          <button className="px-2 py-1 text-sm hover:bg-muted disabled:opacity-40" disabled={!!ocupado || ref.temperatura <= 16} onClick={() => mandar({ ligado: true, temperatura: ref.temperatura - 1 }, 'temp')} aria-label="Diminuir temperatura da zona">−</button>
          <span className="w-10 text-center text-sm tabular">{ref.temperatura}°</span>
          <button className="px-2 py-1 text-sm hover:bg-muted disabled:opacity-40" disabled={!!ocupado || ref.temperatura >= 30} onClick={() => mandar({ ligado: true, temperatura: ref.temperatura + 1 }, 'temp')} aria-label="Aumentar temperatura da zona">+</button>
        </span>}
        <button className="text-xs text-primary underline-offset-2 hover:underline" onClick={aoTestar}>Testar interferência</button>
      </div>
    </div>
  )
}

// Assistente do teste de interferência: manda o sinal de um ar por vez (sem mexer no estado salvo) e quem está no salão
// marca quais ares apitaram. No fim, os grupos viram as zonas do transmissor.
function TesteInterferencia({ hub, onFechar, aoGravar }) {
  const ares = hub.ares || []
  const [i, setI] = useState(0)
  const [respostas, setRespostas] = useState({})
  const [enviado, setEnviado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  const atual = ares[i]
  const marcados = respostas[atual?.id] || []
  const jaNumGrupo = (id) => Object.entries(respostas).some(([a, l]) => +a !== id && (l.includes(id)))
  const enviar = async (comando) => {
    setOcupado(true)
    try { await api.post(`/api/hubs/${hub.id}/teste-interferencia`, { acao: 'enviar', aparelho_id: atual.id, comando }); setEnviado(true) }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const alternar = (id) => setRespostas((r) => ({ ...r, [atual.id]: marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id] }))
  const gravar = async () => {
    setOcupado(true)
    try {
      const r = await api.post(`/api/hubs/${hub.id}/teste-interferencia`, { acao: 'gravar', respostas })
      toast(r.zonas.length ? `${r.zonas.length} zona(s) gravada(s) para ${hub.nome}.` : 'Nenhum ar responde junto: cada um é comandado sozinho.')
      aoGravar(); onFechar()
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  if (ares.length < 2) return <p className="text-sm text-muted-foreground">O teste precisa de pelo menos dois ares neste transmissor.</p>
  if (!atual) {
    return (
      <div className="space-y-3 text-sm">
        <p>Teste concluído. Ao gravar, os ares que apitaram juntos viram uma zona; os demais ficam independentes.</p>
        <ul className="space-y-1 text-muted-foreground">{ares.map((a) => <li key={a.id}>{a.nome}: {(respostas[a.id] || []).length ? `apitou junto com ${(respostas[a.id]).map((x) => ares.find((y) => y.id === x)?.nome).join(', ')}` : 'sozinho ou não testado'}</li>)}</ul>
        <p className="ajuda">Depois, desligue a zona pelo cartão: o teste não muda o estado salvo dos ares.</p>
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => { setI(0); setEnviado(false) }}>Refazer</Botao><Botao carregando={ocupado} onClick={gravar}>Gravar zonas</Botao></div>
      </div>
    )
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">Precisa de alguém no salão olhando os ares. Ar {i + 1} de {ares.length}.</p>
      <div className="rounded-md border border-border p-3">
        <p className="font-medium">{atual.nome}</p>
        {jaNumGrupo(atual.id) && <p className="ajuda mt-1">Este ar já apitou junto com outro testado antes: dá para pular.</p>}
        {!atual.botoes ? <p className="mt-2 text-amber-700 dark:text-amber-400">Sem botões gravados: não dá para mandar sinal dele. Marque abaixo só se souber, ou pule.</p> : (
          <div className="mt-2 flex flex-wrap gap-2">
            <Botao tamanho="sm" carregando={ocupado} onClick={() => enviar('ligar')}>Mandar Ligar Frio 24°</Botao>
            <Botao tamanho="sm" variante="secundario" disabled={ocupado} onClick={() => enviar('desligar')}>Mandar Desligar</Botao>
          </div>
        )}
      </div>
      {(enviado || !atual.botoes) && (
        <div>
          <p className="mb-1.5 font-medium">Além dele, quais apitaram ou mudaram?</p>
          {ares.filter((a) => a.id !== atual.id).map((a) => (
            <label key={a.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={marcados.includes(a.id)} onChange={() => alternar(a.id)} />{a.nome}</label>
          ))}
        </div>
      )}
      <div className="flex justify-between gap-2">
        <Botao variante="secundario" disabled={i === 0} onClick={() => { setI(i - 1); setEnviado(false) }}>Voltar</Botao>
        <Botao onClick={() => { setI(i + 1); setEnviado(false) }}>{enviado || !atual.botoes || jaNumGrupo(atual.id) ? 'Próximo ar' : 'Pular'}</Botao>
      </div>
    </div>
  )
}

// Planejar ou mover: quais ares este transmissor atende agora. Quem sai fica sem transmissor (botões continuam salvos),
// para que um transmissor levado para outro lugar nunca dispare num ar que não vê mais.
function EditarAres({ hub, onFechar, aoSalvar }) {
  const { dados: lista } = useDados(() => api.get('/api/aparelhos'))
  const { projetos } = useProjeto()
  const [sel, setSel] = useState(() => (hub.ares || []).map((a) => a.id))
  const [projeto, setProjeto] = useState(hub.projeto_id || '')
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  if (!lista) return <Carregando />
  const salvar = async () => {
    setOcupado(true)
    try { await api.put(`/api/hubs/${hub.id}/ares`, { aparelhos: sel, projeto_id: projeto ? +projeto : null }); toast('Ares do transmissor atualizados.'); aoSalvar(); onFechar() }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">Marque os ares que este transmissor enxerga <b>agora</b>. Mudou o transmissor de lugar? Desmarque os que ficaram para trás: eles ficam sem transmissor (os botões continuam salvos) e nenhum comando sai para eles por engano.</p>
      <label className="rotulo block">Lugar do transmissor (projeto)
        <select className="campo mt-1" value={projeto} onChange={(e) => setProjeto(e.target.value)}>
          <option value="">Sem projeto</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {lista.map((a) => (
          <label key={a.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-0">
            <span className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(a.id)} onChange={() => setSel((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])} />{a.nome}<span className="text-muted-foreground"> · {a.projeto_nome || 'sem projeto'}</span></span>
            {a.hub_id && a.hub_id !== hub.id && <span className="text-xs text-amber-700 dark:text-amber-400">hoje em {a.hub_nome}</span>}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao carregando={ocupado} onClick={salvar}>Salvar</Botao></div>
    </div>
  )
}

// Instalar ar por ar com o MESMO transmissor: leva o transmissor para um ar (ele passa a atender só esse ar; o anterior
// fica "sem transmissor", com os botões guardados, e nenhum comando sai para ele por engano), põe os botões (copiando de
// um ar igual que já funciona, ou gravando) e testa sem mexer no estado salvo. Depois, "Próximo ar".
function LevarParaOutroAr({ hub, onFechar, aoMudar }) {
  const { dados: lista, recarregar } = useDados(() => api.get('/api/aparelhos'))
  const { projetos } = useProjeto()
  const toast = useToast()
  const [passo, setPasso] = useState(1)
  const [arId, setArId] = useState('')
  const [novo, setNovo] = useState(null)            // { nome, projeto_id } quando o ar ainda não existe
  const [deixados, setDeixados] = useState([])      // ares que ficaram sem transmissor nesta troca
  const [ocupado, setOcupado] = useState(null)
  const [teste, setTeste] = useState(null)          // { comando, ok }
  if (!lista) return <Carregando />
  const ar = lista.find((a) => a.id === +arId)
  const comBotoes = lista.filter((a) => a.total_codigos > 0)
  const levar = async () => {
    setOcupado('levar')
    try {
      let alvo = ar
      if (!alvo) {
        if (!novo?.nome?.trim() || !novo?.projeto_id) throw new Error('Dê um nome ao ar e escolha a sala (projeto).')
        const r = await api.post('/api/aparelhos', { nome: novo.nome.trim(), projeto_id: +novo.projeto_id, alexa: false })
        alvo = { id: r.id, nome: novo.nome.trim(), projeto_id: +novo.projeto_id }
      }
      const antes = (hub.ares || []).filter((a) => a.id !== alvo.id)
      await api.put(`/api/hubs/${hub.id}/ares`, { aparelhos: [alvo.id], projeto_id: alvo.projeto_id || null })
      setDeixados(antes); setArId(String(alvo.id)); setNovo(null)
      await recarregar(); aoMudar()
      setPasso(2)
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  const copiar = async (de) => {
    setOcupado('copiar')
    try { const r = await api.post(`/api/aparelhos/${arId}/copiar-botoes`, { de: +de }); toast(`${r.copiados} botões copiados.`); await recarregar(); aoMudar(); setPasso(3) }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  const testar = async (comando) => {
    setOcupado(comando); setTeste(null)
    try { await api.post(`/api/hubs/${hub.id}/teste-interferencia`, { acao: 'enviar', aparelho_id: +arId, comando }); setTeste({ comando, enviado: true }) }
    catch (e) { setTeste({ comando, erro: e.message }) } finally { setOcupado(null) }
  }
  const proximo = () => { setPasso(1); setArId(''); setNovo(null); setDeixados([]); setTeste(null) }
  const Passo = ({ n, titulo }) => (
    <div className={`flex items-center gap-2 text-xs ${passo === n ? 'font-semibold text-foreground' : passo > n ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${passo > n ? 'border-emerald-600 bg-emerald-600 text-white' : passo === n ? 'border-primary' : 'border-border'}`}>{passo > n ? <Check className="h-3 w-3" /> : n}</span>{titulo}
    </div>
  )
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><Passo n={1} titulo="Escolher o ar" /><ArrowRight className="h-3 w-3 text-muted-foreground" /><Passo n={2} titulo="Botões" /><ArrowRight className="h-3 w-3 text-muted-foreground" /><Passo n={3} titulo="Testar" /></div>

      {passo === 1 && <>
        <p className="text-muted-foreground">Leve o transmissor até a sala e aponte para o ar (até 8 m, sem parede no caminho). Aqui ele passa a atender <b>só este ar</b>: o que ele atendia antes fica sem transmissor, com os botões guardados, e nenhum comando sai para ele por engano.</p>
        <label className="rotulo block">Qual ar agora?
          <select className="campo mt-1" value={novo ? 'novo' : arId} onChange={(e) => { if (e.target.value === 'novo') { setNovo({ nome: '', projeto_id: '' }); setArId('') } else { setNovo(null); setArId(e.target.value) } }}>
            <option value="">Escolha…</option>
            {lista.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.projeto_nome || 'sem projeto'}{a.hub_id === hub.id ? ' (já neste transmissor)' : a.hub_id ? ` (hoje em ${a.hub_nome})` : ''}</option>)}
            <option value="novo">+ Ar que ainda não está no sistema</option>
          </select>
        </label>
        {novo && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rotulo block">Nome falado (ex.: Ar do diretor)<input className="campo mt-1" value={novo.nome} maxLength={60} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
            <label className="rotulo block">Sala (projeto)
              <select className="campo mt-1" value={novo.projeto_id} onChange={(e) => setNovo({ ...novo, projeto_id: e.target.value })}>
                <option value="">Escolha…</option>{projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          </div>
        )}
        {(hub.ares || []).filter((a) => a.id !== +arId).length > 0 && (arId || novo) && (
          <Aviso tipo="alerta">Vão ficar sem transmissor: {(hub.ares || []).filter((a) => a.id !== +arId).map((a) => a.nome).join(', ')}. Só obedecem de novo quando um transmissor voltar para a sala deles.</Aviso>
        )}
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao icone={Truck} carregando={ocupado === 'levar'} disabled={!arId && !novo} onClick={levar}>Levar o transmissor para este ar</Botao></div>
      </>}

      {passo === 2 && ar && <>
        <Aviso tipo="ok">{hub.nome} agora atende só <b>{ar.nome}</b>.{deixados.length ? ` Ficaram sem transmissor (botões guardados): ${deixados.map((a) => a.nome).join(', ')}.` : ''}</Aviso>
        {ar.total_codigos > 0 ? (
          <p className="text-muted-foreground">{ar.nome} já tem {ar.total_codigos} botões gravados.</p>
        ) : <>
          <p className="text-muted-foreground">{ar.nome} ainda não tem botões. Se for do <b>mesmo modelo</b> de um ar que já funciona (os Gree do escritório são iguais), copie os botões dele. Se for de outro modelo, grave o Desligar na tela do ar.</p>
          <div className="space-y-1.5">
            {comBotoes.filter((a) => a.id !== ar.id).map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                <span className="min-w-0 truncate">{a.nome} <span className="text-muted-foreground">· {a.total_codigos} botões</span></span>
                <Botao tamanho="sm" carregando={ocupado === 'copiar'} disabled={!!ocupado} onClick={() => copiar(a.id)}>Copiar destes</Botao>
              </div>
            ))}
          </div>
          <Link to={`/aparelhos/${ar.id}`} className="inline-block text-xs text-primary hover:underline">Outro modelo: gravar os botões na tela do ar</Link>
        </>}
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={proximo}>Escolher outro ar</Botao><Botao disabled={!(ar.total_codigos > 0)} onClick={() => setPasso(3)}>Testar</Botao></div>
      </>}

      {passo === 3 && ar && <>
        <p className="text-muted-foreground">Fique perto do <b>{ar.nome}</b> e mande um sinal. O teste não muda o estado salvo do ar. Ele tem que apitar; se outro ar apitar junto, os dois estão à vista do transmissor e vão obedecer juntos.</p>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" icone={Power} carregando={ocupado === 'ligar'} disabled={!!ocupado} onClick={() => testar('ligar')}>Ligar (Frio 24°)</Botao>
          <Botao variante="secundario" icone={Power} carregando={ocupado === 'desligar'} disabled={!!ocupado} onClick={() => testar('desligar')}>Desligar</Botao>
        </div>
        {teste?.erro && <Aviso tipo="erro">{teste.erro} {/agente|offline|tempo/i.test(teste.erro) ? 'O sinal sai pelo computador do escritório: ele precisa estar ligado e na mesma rede do transmissor.' : ''}</Aviso>}
        {teste?.enviado && <Aviso tipo="ok">Sinal enviado. O ar apitou? Se não, aproxime o transmissor e aponte para o ar (o LED do transmissor pisca a cada sinal).</Aviso>}
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={onFechar}>Concluir</Botao><Botao icone={ArrowRight} onClick={proximo}>Próximo ar</Botao></div>
      </>}
    </div>
  )
}

// Ares que este transmissor atende (até ~6 à vista num salão aberto) e as zonas (ares iguais que obedecem juntos).
function AresDoTransmissor({ hub, aoMudar, abrir }) {
  const [ocupado, setOcupado] = useState(null)
  const toast = useToast()
  const ares = hub.ares || []
  const limite = hub.limite_recomendado || 6
  const nomes = Object.fromEntries(ares.map((a) => [a.id, a.nome]))
  const naZona = new Set((hub.zonas || []).flatMap((z) => z.aparelhos))
  const todos = async (ligado) => {
    setOcupado(ligado ? 'ligar' : 'desligar')
    try {
      const r = await api.post(`/api/hubs/${hub.id}/todos`, { ligado })
      toast(r.falhas.length ? `${r.feitos.length} ok, ${r.falhas.length} com erro: ${r.falhas.map((f) => `${nomes[f.id] || f.id} (${f.erro})`).join('; ')}`
        : `${r.feitos.length} ar(es) ${ligado ? 'ligado(s)' : 'desligado(s)'}.`, r.falhas.length ? 'erro' : 'ok')
      aoMudar()
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  const novo = `/aparelhos?novo=1&hub=${encodeURIComponent(hub.id)}${hub.projeto_id ? `&projeto=${hub.projeto_id}` : ''}`
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ares atendidos</p>
        <span className={`text-xs tabular ${ares.length > limite ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{ares.length} de {limite} recomendados</span>
      </div>
      {ares.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum ar ainda.</p>}
      {ares.map((a) => (
        <Link key={a.id} to={`/aparelhos/${a.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
          <span className="min-w-0 truncate">{a.nome}{a.projeto_nome && a.projeto_id !== hub.projeto_id ? <span className="text-muted-foreground"> · {a.projeto_nome}</span> : null}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular">{a.botoes ? (a.ligado ? `${a.temperatura}°` : 'desligado') : <span className="text-amber-700 dark:text-amber-400">sem botões</span>}</span>
        </Link>
      ))}
      {(hub.zonas || []).map((z) => <ZonaControle key={z.id} zona={z} ares={ares} aoMudar={aoMudar} aoTestar={() => abrir('teste')} />)}
      {ares.length > limite && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Mais de {limite} ares num transmissor: confira se todos estão à vista dele (até 8–10 m, sem parede no caminho).</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ares.length > 1 && ares.some((a) => !naZona.has(a.id)) && <>
          <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === 'ligar'} disabled={!!ocupado} onClick={() => todos(true)}>Ligar todos</Botao>
          <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === 'desligar'} disabled={!!ocupado} onClick={() => todos(false)}>Desligar todos</Botao>
        </>}
        {ares.length > 1 && !(hub.zonas || []).length && <button className="text-xs text-primary hover:underline" onClick={() => abrir('teste')}>Testar interferência</button>}
        <Botao tamanho="sm" icone={Truck} onClick={() => abrir('levar')}>Levar para o próximo ar</Botao>
        <button className="text-xs text-primary hover:underline" onClick={() => abrir('ares')}>Ares deste transmissor (planejar ou mover)</button>
        <Link to={novo} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted"><Plus className="h-3.5 w-3.5" />Adicionar ar novo</Link>
      </div>
    </div>
  )
}

export default function Transmissores() {
  const { filtro } = useProjeto()
  const { dados: hubs, erro, recarregar, setDados } = useDados(() => api.get(comFiltro('/api/hubs', filtro)), [filtro])
  const [modal, setModal] = useState(null)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('todos')
  const [verificando, setVerificando] = useState(false)
  const [reparando, setReparando] = useState(false)
  const reparar = async () => {
    setReparando(true)
    try {
      const r = await api.post('/api/hubs/reparar')
      const ok = r.resultados.filter((x) => x.ok).length
      toast(r.resultados.length ? r.resultados.map((x) => `${x.nome}: ${x.mensagem}`).join(' · ') : 'Nada a reparar.', ok === r.resultados.length ? 'ok' : 'erro')
      recarregar()
    } catch (e) { toast(e.message, 'erro') } finally { setReparando(false) }
  }
  const toast = useToast()

  if (erro) return <Aviso>{erro}</Aviso>
  if (!hubs) return <Carregando />

  const verificar = async () => {
    setVerificando(true)
    try { setDados(await api.post('/api/hubs/verificar')) } finally { setVerificando(false) }
  }
  const remover = async (h) => {
    try {
      await api.del(`/api/hubs/${h.id}`)
      toast(`${h.nome} removido.`)
      setModal(null)
      recarregar()
    } catch (e) { toast(e.message, 'erro') }
  }

  return (
    <div className="w-full">
      <Cabecalho
        titulo="Transmissores"
        descricao="Aparelhos infravermelhos (SRW-004) que mandam os comandos para o ar-condicionado."
        acoes={<>
          <Botao variante="secundario" icone={RefreshCw} carregando={verificando} onClick={verificar}>Verificar</Botao>
          <Botao variante="secundario" icone={Wand2} carregando={reparando} onClick={reparar}>Reconectar agora</Botao>
          <Botao variante="secundario" icone={Search} onClick={() => setModal({ tipo: 'procurar' })}>Procurar na rede</Botao>
          <Botao variante="secundario" icone={CloudDownload} onClick={() => setModal({ tipo: 'importar' })}>Importar um</Botao>
          <Botao icone={CloudDownload} onClick={async () => {
            try {
              const r = await api.post('/api/hubs/importar-todos')
              const ok = r.importados.filter((x) => x.ok).length
              toast(r.importados.length ? `${ok} de ${r.importados.length} transmissores importados.` : 'Nenhum transmissor IR na conta Smart Life.', ok === r.importados.length ? 'ok' : 'erro')
              recarregar()
            } catch (e) { toast(e.message, 'erro') }
          }}>Importar todos</Botao>
        </>}
      />

      {hubs.length > 0 && <GuiaRede />}
      {hubs.length > 0 && <SalasResumo hubs={hubs} />}
      {hubs.length > 0 && (
        <div className="mb-6">
          <FaixaMetricas itens={[
            { rotulo: 'Online agora', valor: hubs.filter((h) => h.online).length, sufixo: ` / ${hubs.length}`, tom: hubs.every((h) => h.online) ? 'bom' : 'ruim', dica: hubs.every((h) => h.online) ? 'todos respondendo na rede' : `${hubs.filter((h) => !h.online).map((h) => h.nome).join(', ')} sem resposta` },
            { rotulo: 'Ares atendidos', valor: hubs.reduce((s, h) => s + h.aparelhos, 0), dica: `até ${hubs[0]?.limite_recomendado || 4} por transmissor` },
            { rotulo: 'Com Local Key', valor: hubs.filter((h) => h.tem_chave).length, sufixo: ` / ${hubs.length}` },
            { rotulo: 'Envio pela nuvem', valor: hubs.filter((h) => h.funcoes_nuvem.length).length, sufixo: ` / ${hubs.length}`, dica: 'reserva quando o Mac está desligado' },
          ]} />
        </div>
      )}
      {hubs.length > 1 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input className="campo pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, sala, ar ou IP" aria-label="Buscar transmissores" />
          </label>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Situação">
            {[['todos', 'Todos'], ['online', 'Online'], ['offline', 'Sem resposta'], ['problema', 'Com aviso']].map(([k, r]) => (
              <button key={k} onClick={() => setSituacao(k)} aria-pressed={situacao === k} className={`rounded-md px-3 py-1.5 text-sm ${situacao === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
            ))}
          </div>
        </div>
      )}
      {hubs.length === 0 ? (
        <Vazio icone={Radio} titulo="Nenhum transmissor"
          texto="Pareie o SRW-004 no app Smart Life (Wi-Fi 2.4 GHz), conecte a conta em Configurações → Contas e importe por aqui." />
      ) : (
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {hubs.filter((h) => {
            const q = busca.trim().toLowerCase()
            if (q && !`${h.nome} ${h.projeto_nome || ''} ${h.ip || ''} ${(h.ares || []).map((a) => `${a.nome} ${a.projeto_nome || ''}`).join(' ')}`.toLowerCase().includes(q)) return false
            if (situacao === 'online') return h.online
            if (situacao === 'offline') return !h.online
            if (situacao === 'problema') return !!h.problema || !h.tem_chave || !h.online
            return true
          }).sort((a, b) => (a.online - b.online) || a.nome.localeCompare(b.nome)).map((h) => (
            <motion.div key={h.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cartao p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium"><Ponto ativo={h.online} /> {h.nome}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{h.projeto_nome ? `${h.projeto_nome} · ` : ''}{h.id}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded p-1.5 text-muted-foreground hover:bg-muted" onClick={() => setModal({ tipo: 'editar', hub: h })} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 " onClick={() => setModal({ tipo: 'remover', hub: h })} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {(h.ares || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label="Salas atendidas">
                  {[...new Set(h.ares.map((a) => a.projeto_nome || 'Sem sala'))].map((s) => <span key={s} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{s}</span>)}
                </div>
              )}
              {(h.salas || []).length > 1 && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                  Atende {h.salas.length} salas. Se forem salas fechadas, cada uma precisa do seu transmissor: o sinal não atravessa parede, e ares iguais que ele alcança mudam juntos.
                </p>
              )}
              {h.problema && <div className="mt-3"><Aviso tipo="alerta">{h.problema}</Aviso></div>}
              {h.reparado_em && !h.problema && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Reconfigurado sozinho {haQuanto(h.reparado_em)}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">IP</dt><dd>{h.ip || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{h.online ? 'Online' : `Offline${h.visto_em ? `, visto ${haQuanto(h.visto_em)}` : ''}`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Local Key</dt><dd>{h.tem_chave ? 'Configurada' : <span className="text-amber-700 dark:text-amber-400">Falta</span>}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Formato de comando</dt><dd>{h.control_type ? `Tipo ${h.control_type}` : 'Definido ao gravar o 1º botão'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Envio pela nuvem</dt><dd>{h.funcoes_nuvem.length ? 'Disponível' : 'Importe da conta para ativar'}</dd></div>
              </dl>
              <AresDoTransmissor hub={h} aoMudar={recarregar} abrir={(t) => setModal({ tipo: t, hub: h })} />
            </motion.div>
          ))}
        </div>
      )}

      <Modal aberto={modal?.tipo === 'importar'} titulo="Importar da conta Smart Life" onFechar={() => setModal(null)}>
        {modal?.tipo === 'importar' && <Importar onFechar={() => setModal(null)} aoImportar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'procurar'} titulo="Procurar na rede local" onFechar={() => setModal(null)}>
        {modal?.tipo === 'procurar' && <Procurar onFechar={() => setModal(null)} aoCadastrar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'editar'} titulo="Editar transmissor" onFechar={() => setModal(null)}>
        {modal?.tipo === 'editar' && <Editar hub={modal.hub} onFechar={() => setModal(null)} aoSalvar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'teste'} titulo={`Teste de interferência · ${modal?.hub?.nome || ''}`} onFechar={() => setModal(null)}>
        {modal?.tipo === 'teste' && <TesteInterferencia hub={modal.hub} onFechar={() => setModal(null)} aoGravar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'levar'} titulo={`Instalar ar por ar · ${modal?.hub?.nome || ''}`} onFechar={() => setModal(null)} largura="max-w-xl">
        {modal?.tipo === 'levar' && <LevarParaOutroAr hub={modal.hub} onFechar={() => setModal(null)} aoMudar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'ares'} titulo={`Ares de ${modal?.hub?.nome || ''}`} onFechar={() => setModal(null)}>
        {modal?.tipo === 'ares' && <EditarAres hub={modal.hub} onFechar={() => setModal(null)} aoSalvar={recarregar} />}
      </Modal>
      <Modal aberto={modal?.tipo === 'remover'} titulo={`Remover ${modal?.hub?.nome}?`} onFechar={() => setModal(null)}>
        {(modal?.hub?.ares || []).length > 0 && (
          <div className="mb-3">
            <Aviso tipo="alerta">Estes ares param de obedecer: {modal.hub.ares.map((a) => a.nome).join(', ')}.</Aviso>
          </div>
        )}
        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">
          Os botões gravados continuam salvos. Se você importar este transmissor de novo nos próximos 30 dias, ele volta com o mesmo nome, sala e ares.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={() => remover(modal.hub)}>Remover</Botao>
        </div>
      </Modal>
    </div>
  )
}
