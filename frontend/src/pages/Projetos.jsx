import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AirVent, FolderKanban, MapPin, Pencil, Plus, Radio, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, useDados, useToast } from '../components/ui'

const CORES = ['#0f766a', '#2563a8', '#c2410c', '#7c3aed', '#be123c', '#4d7c0f', '#0e7490', '#52525b']

function Form({ inicial, aoSalvar, onFechar }) {
  const [f, setF] = useState({ nome: inicial?.nome || '', descricao: inicial?.descricao || '', endereco: inicial?.endereco || '', cor: inicial?.cor || CORES[0] })
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault()
    try { await aoSalvar(f); onFechar() } catch (err) { setErro(err.message) }
  }
  return (
    <form onSubmit={enviar} className="space-y-4">
      <div><label className="rotulo" htmlFor="pn">Nome</label><input id="pn" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Casa da praia, Escritório…" required maxLength={60} /></div>
      <div><label className="rotulo" htmlFor="pe">Endereço</label><input id="pe" className="campo" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Opcional" maxLength={120} /></div>
      <div><label className="rotulo" htmlFor="pd">Descrição</label><input id="pd" className="campo" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Opcional" maxLength={200} /></div>
      <div>
        <span className="rotulo">Cor</span>
        <div className="flex gap-2">
          {CORES.map((c) => (
            <button type="button" key={c} onClick={() => setF({ ...f, cor: c })} aria-label={`Cor ${c}`}
              className={`h-8 w-8 rounded-lg transition-transform ${f.cor === c ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-card' : ''}`} style={{ background: c }} />
          ))}
        </div>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
    </form>
  )
}

export default function Projetos() {
  const { dados, erro, recarregar } = useDados(() => api.get('/api/projetos'))
  const { setAtual, recarregar: recarregarCtx } = useProjeto()
  const [modal, setModal] = useState(null)
  const toast = useToast()
  const navegar = useNavigate()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const atualizar = () => { recarregar(); recarregarCtx() }

  return (
    <div className="w-full">
      <Cabecalho titulo="Projetos" descricao="Cada projeto é um lugar (casa, escritório, loja) com os próprios transmissores, aparelhos e cenas."
        acoes={<Botao icone={Plus} onClick={() => setModal({})}>Novo projeto</Botao>} />
      {dados.length > 0 && (
        <div className="mb-6">
          <FaixaMetricas itens={[
            { rotulo: 'Projetos', valor: dados.length, dica: dados.map((p) => p.nome).slice(0, 3).join(', ') },
            { rotulo: 'Aparelhos ligados', valor: dados.reduce((t, p) => t + p.ligados, 0), sufixo: ` / ${dados.reduce((t, p) => t + p.aparelhos, 0)}` },
            { rotulo: 'Transmissores online', valor: dados.reduce((t, p) => t + p.transmissores_online, 0), sufixo: ` / ${dados.reduce((t, p) => t + p.transmissores, 0)}` },
            { rotulo: 'Cenas', valor: dados.reduce((t, p) => t + p.cenas, 0) },
          ]} />
        </div>
      )}
      {dados.length === 0 ? <Vazio icone={FolderKanban} titulo="Nenhum projeto" /> : (
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {dados.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="cartao group flex flex-col overflow-hidden">
              <div className="h-1.5" style={{ background: p.cor }} />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{p.nome}</p>
                    {p.endereco && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{p.endereco}</p>}
                  </div>
                  <div className="flex shrink-0 gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                    <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setModal(p)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-md p-1.5 hover:bg-muted hover:text-red-600" onClick={() => setModal({ ...p, apagar: true })} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {p.descricao && <p className="mt-2 text-sm text-muted-foreground">{p.descricao}</p>}
                <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
                  <div><dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><AirVent className="h-3 w-3" />Aparelhos</dt><dd className="mt-1 font-semibold tabular">{p.ligados}/{p.aparelhos}</dd></div>
                  <div><dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Radio className="h-3 w-3" />IR online</dt><dd className="mt-1 font-semibold tabular">{p.transmissores_online}/{p.transmissores}</dd></div>
                  <div><dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" />Cenas</dt><dd className="mt-1 font-semibold tabular">{p.cenas}</dd></div>
                </dl>
                <Botao variante="secundario" className="mt-4 w-full" onClick={() => { setAtual(p.id); navegar('/') }}>Abrir painel do projeto</Botao>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <Modal aberto={!!modal && !modal.apagar} titulo={modal?.id ? 'Editar projeto' : 'Novo projeto'} onFechar={() => setModal(null)}>
        {modal && !modal.apagar && (
          <Form inicial={modal.id ? modal : null} onFechar={() => setModal(null)} aoSalvar={async (f) => {
            if (modal.id) await api.put(`/api/projetos/${modal.id}`, f); else await api.post('/api/projetos', f)
            toast('Projeto salvo.'); atualizar()
          }} />
        )}
      </Modal>
      <Modal aberto={!!modal?.apagar} titulo={`Remover ${modal?.nome}?`} onFechar={() => setModal(null)}>
        <p className="text-sm text-muted-foreground">Os {modal?.aparelhos} aparelho(s) e {modal?.transmissores} transmissor(es) continuam cadastrados, só ficam sem projeto. As cenas do projeto são apagadas.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => {
            try { await api.del(`/api/projetos/${modal.id}`); toast('Projeto removido.'); setModal(null); atualizar() } catch (e) { toast(e.message, 'erro') }
          }}>Remover</Botao>
        </div>
      </Modal>
    </div>
  )
}
