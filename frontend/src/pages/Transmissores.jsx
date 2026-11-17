import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, CloudDownload, Pencil, Plus, Power, Radio, RefreshCw, Search, Trash2, Wand2, Wifi } from 'lucide-react'
import { api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Ponto, Selo, Vazio, useDados, useToast } from '../components/ui'
import { motion } from 'framer-motion'

function Importar({ onFechar, aoImportar }) {
  const { dados, erro } = useDados(() => api.get('/api/tuya/aparelhos'))
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
      await api.post(`/api/hubs/importar/${d.id}`)
      toast(`${d.nome} importado com Local Key.`)
      aoImportar()
      onFechar()
    } catch (e) {
      toast(e.message, 'erro')
      setImportando(null)
    }
  }
  return (
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

// Ares que este transmissor atende. Um SRW-004 no teto alcança 3–4 ares no mesmo ambiente; infravermelho não tem
// endereço, então ares do MESMO modelo à vista dele obedecem juntos (o backend marca isso em `juntos`).
function AresDoTransmissor({ hub, aoMudar }) {
  const [ocupado, setOcupado] = useState(null)
  const toast = useToast()
  const ares = hub.ares || []
  const limite = hub.limite_recomendado || 4
  const nomes = Object.fromEntries(ares.map((a) => [a.id, a.nome]))
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
      {hub.juntos?.length > 0 && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {hub.juntos.map((g) => g.map((i) => nomes[i] || `#${i}`).join(' e ')).join('; ')}: mesmo modelo de controle, respondem juntos a este transmissor.
          Para separar, use um transmissor para cada, cada um apontado só para o seu ar. <Link to="/guia#varios-ares" className="underline">Entenda</Link>
        </p>
      )}
      {ares.length > limite && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Mais de {limite} ares num transmissor: confira se todos estão à vista dele (até 8–10 m, sem parede no caminho).</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {ares.length > 1 && <>
          <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === 'ligar'} disabled={!!ocupado} onClick={() => todos(true)}>Ligar todos</Botao>
          <Botao tamanho="sm" variante="secundario" icone={Power} carregando={ocupado === 'desligar'} disabled={!!ocupado} onClick={() => todos(false)}>Desligar todos</Botao>
        </>}
        <Link to={novo} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-muted"><Plus className="h-3.5 w-3.5" />Adicionar ar a este transmissor</Link>
      </div>
    </div>
  )
}

export default function Transmissores() {
  const { filtro } = useProjeto()
  const { dados: hubs, erro, recarregar, setDados } = useDados(() => api.get(comFiltro('/api/hubs', filtro)), [filtro])
  const [modal, setModal] = useState(null)
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
    await api.del(`/api/hubs/${h.id}`)
    toast(`${h.nome} removido.`)
    setModal(null)
    recarregar()
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
      {hubs.length === 0 ? (
        <Vazio icone={Radio} titulo="Nenhum transmissor"
          texto="Pareie o SRW-004 no app Smart Life (Wi-Fi 2.4 GHz), conecte a conta em Configurações → Contas e importe por aqui." />
      ) : (
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {hubs.map((h) => (
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
              {h.problema && <div className="mt-3"><Aviso tipo="alerta">{h.problema}</Aviso></div>}
              {h.reparado_em && !h.problema && <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Reconfigurado sozinho {haQuanto(h.reparado_em)}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">IP</dt><dd>{h.ip || '—'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Status</dt><dd>{h.online ? 'Online' : `Offline${h.visto_em ? `, visto ${haQuanto(h.visto_em)}` : ''}`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Local Key</dt><dd>{h.tem_chave ? 'Configurada' : <span className="text-amber-700 dark:text-amber-400">Falta</span>}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Formato de comando</dt><dd>{h.control_type ? `Tipo ${h.control_type}` : 'Definido ao gravar o 1º botão'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Envio pela nuvem</dt><dd>{h.funcoes_nuvem.length ? 'Disponível' : 'Importe da conta para ativar'}</dd></div>
              </dl>
              <AresDoTransmissor hub={h} aoMudar={recarregar} />
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
      <Modal aberto={modal?.tipo === 'remover'} titulo={`Remover ${modal?.hub?.nome}?`} onFechar={() => setModal(null)}>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">
          {modal?.hub?.aparelhos ? `${modal.hub.aparelhos} aparelho(s) ficarão sem transmissor. ` : ''}Os botões gravados continuam salvos.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={() => remover(modal.hub)}>Remover</Botao>
        </div>
      </Modal>
    </div>
  )
}
