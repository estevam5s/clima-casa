import { useState } from 'react'
import { motion } from 'framer-motion'
import { Coffee, Moon, Pencil, Play, Plus, Power, Snowflake, Sparkles, Sun, Trash2, X } from 'lucide-react'
import { MODOS, VENTILACAO, api, haQuanto } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, Modal, Vazio, useDados, useToast } from '../components/ui'

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

export default function Cenas() {
  const { filtro, projetos, projeto } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get(comFiltro('/api/cenas', filtro)), api.get('/api/aparelhos')]), [filtro])
  const [modal, setModal] = useState(null)
  const [rodando, setRodando] = useState(null)
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [cenas, aparelhos] = dados

  const executar = async (c) => {
    setRodando(c.id)
    try {
      const r = await api.post(`/api/cenas/${c.id}/executar`)
      const falhas = r.resultados.filter((x) => !x.ok)
      if (falhas.length) toast(`${c.nome}: ${falhas.length} de ${r.resultados.length} falharam. ${falhas[0].erro}`, 'erro')
      else toast(`${c.nome} executada.`)
      recarregar()
    } finally { setRodando(null) }
  }

  return (
    <div className="w-full">
      <Cabecalho titulo="Cenas" descricao="Um toque executa vários comandos: ligar a sala de reunião em 23° e desligar a recepção, por exemplo."
        acoes={<Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Nova cena</Botao>} />
      {cenas.length === 0 ? (
        <Vazio icone={Sparkles} titulo="Nenhuma cena" texto={aparelhos.length ? 'Crie "Dormir", "Sair de casa" ou "Chegar do trabalho".' : 'Cadastre um aparelho primeiro.'}
          acao={aparelhos.length > 0 && <Botao icone={Plus} onClick={() => setModal({})}>Nova cena</Botao>} />
      ) : (
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {cenas.map((c, i) => {
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
                    <button className="rounded-md p-1.5 hover:bg-muted hover:text-red-600" aria-label="Apagar" onClick={async () => { await api.del(`/api/cenas/${c.id}`); recarregar() }}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {c.acoes.map((a, n) => (
                    <li key={n} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">{a.aparelho_nome}</span>
                      <span className="shrink-0 font-medium">{a.ligado ? `${MODOS[a.modo] || 'Ligar'}${a.temperatura ? ` ${a.temperatura}°` : ''}` : 'Desligar'}</span>
                    </li>
                  ))}
                </ul>
                <Botao className="mt-4 w-full" icone={Play} carregando={rodando === c.id} onClick={() => executar(c)}>Executar</Botao>
              </motion.div>
            )
          })}
        </div>
      )}
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar cena' : 'Nova cena'} onFechar={() => setModal(null)} largura="max-w-2xl">
        {modal && <Form inicial={modal.id ? modal : null} aparelhos={aparelhos} projetos={projetos} projetoPadrao={projeto?.id} onFechar={() => setModal(null)}
          aoSalvar={async (f) => { if (modal.id) await api.put(`/api/cenas/${modal.id}`, f); else await api.post('/api/cenas', f); toast('Cena salva.'); recarregar() }} />}
      </Modal>
    </div>
  )
}
