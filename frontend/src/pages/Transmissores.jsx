import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudDownload, Pencil, Radio, RefreshCw, Search, Trash2, Wand2 } from 'lucide-react'
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

export default function Transmissores() {
  const { filtro } = useProjeto()
  const { dados: hubs, erro, recarregar, setDados } = useDados(() => api.get(comFiltro('/api/hubs', filtro)), [filtro])
  const { dados: aparelhos } = useDados(() => api.get('/api/aparelhos'))
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

      {hubs.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <b className="text-foreground">Mudou de Wi-Fi?</b> Pareie o transmissor de novo no Smart Life (rede 2,4 GHz). O agente do Mac encontra o IP novo e busca a Local Key nova na conta Smart Life sozinho, em até 2 minutos. Os botões gravados continuam valendo.
        </div>
      )}
      {hubs.length > 0 && (
        <div className="mb-6">
          <FaixaMetricas itens={[
            { rotulo: 'Online agora', valor: hubs.filter((h) => h.online).length, sufixo: ` / ${hubs.length}`, tom: hubs.every((h) => h.online) ? 'bom' : 'ruim', dica: hubs.every((h) => h.online) ? 'todos respondendo na rede' : `${hubs.filter((h) => !h.online).map((h) => h.nome).join(', ')} sem resposta` },
            { rotulo: 'Aparelhos controlados', valor: hubs.reduce((s, h) => s + h.aparelhos, 0) },
            { rotulo: 'Com Local Key', valor: hubs.filter((h) => h.tem_chave).length, sufixo: ` / ${hubs.length}` },
            { rotulo: 'Envio pela nuvem', valor: hubs.filter((h) => h.funcoes_nuvem.length).length, sufixo: ` / ${hubs.length}`, dica: 'reserva quando o Mac está desligado' },
          ]} />
        </div>
      )}
      {hubs.length === 0 ? (
        <Vazio icone={Radio} titulo="Nenhum transmissor"
          texto="Pareie o SRW-004 no app Smart Life (Wi-Fi 2.4 GHz), conecte a conta em Configurações e importe por aqui." />
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
                <div><dt className="text-xs text-muted-foreground">Aparelhos vinculados</dt><dd>{h.aparelhos}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Envio pela nuvem</dt><dd>{h.funcoes_nuvem.length ? 'Disponível' : 'Importe da conta para ativar'}</dd></div>
              </dl>
              {aparelhos && aparelhos.filter((a) => a.hub_id === h.id).length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Aparelhos neste transmissor</p>
                  {aparelhos.filter((a) => a.hub_id === h.id).map((a) => (
                    <a key={a.id} href={`/aparelhos/${a.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                      <span className="truncate">{a.nome}{a.comodo ? <span className="text-muted-foreground"> · {a.comodo}</span> : null}</span>
                      <span className="text-xs text-muted-foreground tabular">{a.ligado ? `${a.temperatura}°` : 'desligado'}</span>
                    </a>
                  ))}
                </div>
              )}
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
