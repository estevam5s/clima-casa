import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Pencil, Play, Plus, Trash2, Workflow, X } from 'lucide-react'
import { DIAS, MODOS, VENTILACAO, api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'

const GATILHOS = { ligou: 'Quando ligar', desligou: 'Quando desligar', ligado_ha: 'Quando ficar ligado por', horario: 'Todo dia às' }
const ORIGENS = { qualquer: 'por qualquer meio', alexa: 'pela Alexa (skill própria)', sinric: 'pela Alexa/Google (Sinric)', painel: 'pelo painel ou app', agenda: 'pela agenda', cena: 'por uma cena' }
const MODELOS = [
  { nome: 'Boa noite: desligar sozinho', gatilho: { tipo: 'ligou', origem: 'qualquer' }, condicoes: { das: '22:00', ate: '05:00' }, acoes: [{ tipo: 'desligar_apos', minutos: 180 }] },
  { nome: 'Economia: ligado há 4 horas', gatilho: { tipo: 'ligado_ha', minutos: 240 }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: true, temperatura: 25 }] },
  { nome: 'Madrugada mais fresca', gatilho: { tipo: 'horario', hora: '03:00' }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: true, temperatura: 24, ventilador: 'baixa' }] },
]

function resumo(a, aparelhos, cenas) {
  const g = a.gatilho
  const ap = (id) => aparelhos.find((x) => x.id === id)?.nome || 'o aparelho'
  let txt = g.tipo === 'horario' ? `Às ${g.hora}` : g.tipo === 'ligado_ha' ? `${g.aparelho_id ? ap(g.aparelho_id) : 'Qualquer ar'} ligado há ${g.minutos} min`
    : `${g.aparelho_id ? ap(g.aparelho_id) : 'Qualquer ar'} ${g.tipo === 'ligou' ? 'ligado' : 'desligado'} ${ORIGENS[g.origem || 'qualquer']}`
  const c = a.condicoes || {}
  if (c.das && c.ate) txt += `, entre ${c.das} e ${c.ate}`
  if (c.dias?.length && c.dias.length < 7) txt += `, ${c.dias.map((d) => DIAS[d]).join('/')}`
  const acoes = a.acoes.map((x) => x.tipo === 'cena' ? `cena ${cenas.find((c2) => c2.id === x.cena_id)?.nome || ''}`
    : x.tipo === 'desligar_apos' ? `desligar após ${x.minutos} min`
      : `${x.aparelho_id ? ap(x.aparelho_id) : 'o mesmo ar'}: ${x.ligado === false ? 'desligar' : [x.modo && MODOS[x.modo], x.temperatura && `${x.temperatura}°`, x.ventilador && `vent. ${VENTILACAO[x.ventilador].toLowerCase()}`].filter(Boolean).join(', ') || 'ligar'}`)
  return [txt, acoes]
}

function Form({ inicial, aparelhos, cenas, aoSalvar, onFechar }) {
  const [f, setF] = useState(() => structuredClone(inicial || { nome: '', ativo: true, gatilho: { tipo: 'ligou', origem: 'qualquer' }, condicoes: {}, acoes: [{ tipo: 'desligar_apos', minutos: 120 }] }))
  const [erro, setErro] = useState('')
  const g = f.gatilho
  const setG = (k, v) => setF({ ...f, gatilho: { ...g, [k]: v === '' ? undefined : v } })
  const setC = (k, v) => setF({ ...f, condicoes: { ...f.condicoes, [k]: v || undefined } })
  const setA = (i, k, v) => setF({ ...f, acoes: f.acoes.map((a, n) => (n === i ? { ...a, [k]: v === '' ? undefined : v } : a)) })
  const enviar = async (e) => {
    e.preventDefault()
    try { await aoSalvar(f); onFechar() } catch (err) { setErro(err.message) }
  }
  const selAparelho = (valor, mudar, rotuloVazio) => (
    <select className="campo" value={valor ?? ''} onChange={(e) => mudar(e.target.value ? +e.target.value : '')}>
      <option value="">{rotuloVazio}</option>
      {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.projeto_nome ? ` · ${a.projeto_nome}` : ''}</option>)}
    </select>
  )
  return (
    <form onSubmit={enviar} className="space-y-5">
      <div><label className="rotulo" htmlFor="an">Nome</label><input id="an" className="campo" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required placeholder="Boa noite" /></div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Quando</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="campo" value={g.tipo} onChange={(e) => setF({ ...f, gatilho: { tipo: e.target.value, origem: 'qualquer' } })} aria-label="Gatilho">
            {Object.entries(GATILHOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
          </select>
          {g.tipo === 'horario' && <input type="time" className="campo" value={g.hora || ''} onChange={(e) => setG('hora', e.target.value)} required aria-label="Horário" />}
          {g.tipo === 'ligado_ha' && <div className="flex items-center gap-2"><input type="number" min={1} max={1440} className="campo" value={g.minutos || ''} onChange={(e) => setG('minutos', +e.target.value)} required aria-label="Minutos" /><span className="text-sm text-muted-foreground">min</span></div>}
          {g.tipo !== 'horario' && selAparelho(g.aparelho_id, (v) => setG('aparelho_id', v), 'Qualquer aparelho')}
          {(g.tipo === 'ligou' || g.tipo === 'desligou') && (
            <select className="campo" value={g.origem || 'qualquer'} onChange={(e) => setG('origem', e.target.value)} aria-label="Origem">
              {Object.entries(ORIGENS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Só se (opcional)</legend>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((d, i) => {
            const dias = f.condicoes.dias || []
            const on = dias.includes(i)
            return <button type="button" key={d} onClick={() => setC('dias', on ? dias.filter((x) => x !== i) : [...dias, i])}
              className={`h-8 w-11 rounded-md border text-xs ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{d}</button>
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          entre <input type="time" className="campo w-32" value={f.condicoes.das || ''} onChange={(e) => setC('das', e.target.value)} aria-label="Das" />
          e <input type="time" className="campo w-32" value={f.condicoes.ate || ''} onChange={(e) => setC('ate', e.target.value)} aria-label="Até" />
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Então</legend>
        {f.acoes.map((a, i) => {
          const ar = aparelhos.find((x) => x.id === a.aparelho_id) || aparelhos[0]
          return (
            <div key={i} className="space-y-2 rounded-md bg-muted/50 p-3">
              <div className="flex gap-2">
                <select className="campo" value={a.tipo} onChange={(e) => setF({ ...f, acoes: f.acoes.map((x, n) => (n === i ? { tipo: e.target.value } : x)) })} aria-label="Ação">
                  <option value="aparelho">Ajustar um aparelho</option><option value="desligar_apos">Desligar depois de</option><option value="cena">Executar cena</option>
                </select>
                <button type="button" onClick={() => setF({ ...f, acoes: f.acoes.filter((_, n) => n !== i) })} className="rounded-md px-2 text-muted-foreground hover:bg-muted" aria-label="Remover"><X className="h-4 w-4" /></button>
              </div>
              {a.tipo === 'cena' && (
                <select className="campo" value={a.cena_id || ''} onChange={(e) => setA(i, 'cena_id', +e.target.value)} required aria-label="Cena">
                  <option value="">Escolha a cena</option>{cenas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )}
              {a.tipo === 'desligar_apos' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2"><input type="number" min={1} max={1440} className="campo" value={a.minutos || ''} onChange={(e) => setA(i, 'minutos', +e.target.value)} required aria-label="Minutos" /><span className="text-sm text-muted-foreground">min</span></div>
                  {selAparelho(a.aparelho_id, (v) => setA(i, 'aparelho_id', v), 'O aparelho do gatilho')}
                </div>
              )}
              {a.tipo === 'aparelho' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {selAparelho(a.aparelho_id, (v) => setA(i, 'aparelho_id', v), 'O aparelho do gatilho')}
                  <select className="campo" value={a.ligado === false ? '0' : '1'} onChange={(e) => setA(i, 'ligado', e.target.value === '1')} aria-label="Ligar ou desligar">
                    <option value="1">Ligar / ajustar</option><option value="0">Desligar</option>
                  </select>
                  {a.ligado !== false && <>
                    <select className="campo" value={a.modo || ''} onChange={(e) => setA(i, 'modo', e.target.value)} aria-label="Modo"><option value="">Manter modo</option>{Object.entries(MODOS).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
                    <select className="campo" value={a.temperatura || ''} onChange={(e) => setA(i, 'temperatura', e.target.value ? +e.target.value : '')} aria-label="Temperatura">
                      <option value="">Manter temperatura</option>
                      {Array.from({ length: (ar?.temp_max ?? 30) - (ar?.temp_min ?? 16) + 1 }, (_, n) => (ar?.temp_min ?? 16) + n).map((t) => <option key={t} value={t}>{t}°C</option>)}
                    </select>
                    <select className="campo sm:col-span-2" value={a.ventilador || ''} onChange={(e) => setA(i, 'ventilador', e.target.value)} aria-label="Ventilação"><option value="">Manter ventilação</option>{Object.entries(VENTILACAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
                  </>}
                </div>
              )}
            </div>
          )
        })}
        <Botao type="button" variante="secundario" tamanho="sm" icone={Plus} onClick={() => setF({ ...f, acoes: [...f.acoes, { tipo: 'aparelho', ligado: true }] })}>Adicionar ação</Botao>
      </fieldset>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={onFechar}>Cancelar</Botao><Botao type="submit" disabled={!f.acoes.length}>Salvar automação</Botao></div>
    </form>
  )
}

export default function Automacoes() {
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get('/api/automacoes'), api.get('/api/aparelhos'), api.get('/api/cenas'), api.get('/api/temporizadores')]))
  const [modal, setModal] = useState(null)
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [autos, aparelhos, cenas, timers] = dados
  const salvar = async (f) => {
    if (modal?.id) await api.put(`/api/automacoes/${modal.id}`, f); else await api.post('/api/automacoes', f)
    toast('Automação salva.'); recarregar()
  }
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Cabecalho titulo="Automações" descricao="Regras que agem sozinhas: quando algo acontece (inclusive pela Alexa), o Clima Casa faz o resto."
        acoes={<Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Nova automação</Botao>} />

      {timers.length > 0 && (
        <div className="cartao mb-6 p-4">
          <p className="titulo-secao mb-2">Temporizadores ativos</p>
          {timers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>{t.aparelho_nome}: {t.acao.ligado === false ? 'desligar' : 'ajustar'} {haQuanto(t.executar_em).replace('há', 'em')}</span>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={async () => { await api.del(`/api/aparelhos/${t.aparelho_id}/temporizador`); recarregar() }}>Cancelar</button>
            </div>
          ))}
        </div>
      )}

      {autos.length === 0 ? (
        <>
          <Vazio icone={Workflow} titulo="Nenhuma automação" texto="Comece por um modelo pronto e ajuste do seu jeito." />
          <div className="mt-4 grid justify-center gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),300px))]">
            {MODELOS.map((m) => (
              <button key={m.nome} onClick={() => setModal({ modelo: m })} className="cartao p-4 text-left hover:border-primary">
                <p className="font-medium">{m.nome}</p>
                <p className="mt-1 text-xs text-muted-foreground">{resumo(m, aparelhos, cenas)[0]} → {resumo(m, aparelhos, cenas)[1].join(', ')}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {autos.map((a, i) => {
            const [quando, acoes] = resumo(a, aparelhos, cenas)
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`cartao flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${a.ativo ? '' : 'opacity-60'}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.nome}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{quando}</span><ArrowRight className="h-3.5 w-3.5" /><span className="text-foreground">{acoes.join(' · ')}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.disparos} disparo(s){a.ultimo_disparo ? ` · último ${haQuanto(a.ultimo_disparo)}` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Interruptor ligado={!!a.ativo} rotulo="Ativa" onChange={async (v) => { await api.put(`/api/automacoes/${a.id}`, { ...a, ativo: v }); recarregar() }} />
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" title="Rodar agora" onClick={async () => { await api.post(`/api/automacoes/${a.id}/executar`); toast('Executada.'); recarregar() }}><Play className="h-4 w-4" /></button>
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => setModal(a)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={async () => { await api.del(`/api/automacoes/${a.id}`); recarregar() }} aria-label="Apagar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar automação' : 'Nova automação'} onFechar={() => setModal(null)} largura="max-w-2xl">
        {modal && <Form inicial={modal.id ? modal : modal.modelo ? { ...modal.modelo, ativo: true } : null} aparelhos={aparelhos} cenas={cenas} aoSalvar={salvar} onFechar={() => setModal(null)} />}
      </Modal>
    </div>
  )
}
