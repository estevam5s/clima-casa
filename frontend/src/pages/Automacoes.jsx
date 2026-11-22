import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Copy, LayoutTemplate, Pencil, Play, Plus, Trash2, Workflow, X } from 'lucide-react'
import FerramentasLista, { baixarArquivo, normalizar, paraCsv } from '../components/FerramentasLista'
import { DIAS, MODOS, VENTILACAO, api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Modal, Vazio, useDados, useToast } from '../components/ui'

const GATILHOS = { ligou: 'Quando ligar', desligou: 'Quando desligar', ligado_ha: 'Quando ficar ligado por', horario: 'Todo dia às' }
const ORIGENS = { qualquer: 'por qualquer meio', alexa: 'pela Alexa (skill própria)', sinric: 'pela Alexa/Google (Sinric)', painel: 'pelo painel ou app', agenda: 'pela agenda', cena: 'por uma cena' }
const MODELOS = [
  { nome: 'Boa noite: desligar sozinho', gatilho: { tipo: 'ligou', origem: 'qualquer' }, condicoes: { das: '22:00', ate: '05:00' }, acoes: [{ tipo: 'desligar_apos', minutos: 180 }] },
  { nome: 'Economia: ligado há 4 horas', gatilho: { tipo: 'ligado_ha', minutos: 240 }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: true, temperatura: 25 }] },
  { nome: 'Madrugada mais fresca', gatilho: { tipo: 'horario', hora: '03:00' }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: true, temperatura: 24, ventilador: 'baixa' }] },
  { nome: 'Esqueceram ligado: desligar após 10 h', gatilho: { tipo: 'ligado_ha', minutos: 600 }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: false }] },
  { nome: 'Fim de semana: desligar em 1 h', gatilho: { tipo: 'ligou', origem: 'qualquer' }, condicoes: { dias: [0, 6] }, acoes: [{ tipo: 'desligar_apos', minutos: 60 }] },
  { nome: 'Ligou pela Alexa: timer de 2 h', gatilho: { tipo: 'ligou', origem: 'sinric' }, condicoes: {}, acoes: [{ tipo: 'desligar_apos', minutos: 120 }] },
  { nome: 'Fora do expediente: desligar em 30 min', gatilho: { tipo: 'ligou', origem: 'qualquer' }, condicoes: { das: '19:00', ate: '07:00' }, acoes: [{ tipo: 'desligar_apos', minutos: 30 }] },
  { nome: 'Fim do expediente às 18h', gatilho: { tipo: 'horario', hora: '18:00' }, condicoes: { dias: [1, 2, 3, 4, 5] }, acoes: [{ tipo: 'aparelho', ligado: false }] },
  { nome: 'Ligado há 2 h: modo economia', gatilho: { tipo: 'ligado_ha', minutos: 120 }, condicoes: {}, acoes: [{ tipo: 'aparelho', ligado: true, temperatura: 24, ventilador: 'baixa' }] },
]

// O que pode dar errado numa regra: ar ou cena que não existe mais, ar sem transmissor, duas regras no mesmo horário
// mandando coisas opostas para o mesmo ar
function problemas(a, autos, aparelhos, cenas) {
  const ares = new Map(aparelhos.map((x) => [x.id, x])), idsCenas = new Set(cenas.map((c) => c.id)), lista = []
  if (a.gatilho.aparelho_id && !ares.has(a.gatilho.aparelho_id)) lista.push('o ar do gatilho não existe mais')
  for (const ac of a.acoes) {
    if (ac.tipo === 'cena' && !idsCenas.has(ac.cena_id)) lista.push('a cena desta ação não existe mais')
    if (ac.tipo === 'aparelho' && ac.aparelho_id) {
      const ar = ares.get(ac.aparelho_id)
      if (!ar) lista.push('o ar desta ação não existe mais')
      else if (!ar.hub_id) lista.push(`${ar.nome} está sem transmissor: não vai obedecer`)
    }
  }
  if (a.ativo && a.gatilho.tipo === 'horario') {
    const dias = (x) => new Set(x.condicoes?.dias?.length ? x.condicoes.dias : [0, 1, 2, 3, 4, 5, 6])
    const meus = dias(a)
    for (const o of autos) {
      if (o.id === a.id || !o.ativo || o.gatilho.tipo !== 'horario' || o.gatilho.hora !== a.gatilho.hora || ![...dias(o)].some((d) => meus.has(d))) continue
      const choca = a.acoes.some((x) => x.tipo === 'aparelho' && o.acoes.some((y) => y.tipo === 'aparelho' && y.aparelho_id === x.aparelho_id && !!y.ligado !== !!x.ligado))
      if (choca) lista.push(`conflita com “${o.nome}” no mesmo horário (uma liga, a outra desliga)`)
    }
  }
  return lista
}

// como uma regra funciona (quando → se → então), sempre visível no topo
function ComoFunciona() {
  const passo = (n, t, d) => (
    <div className="flex-1 rounded-xl border border-border p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{n}</p>
      <p className="mt-0.5 text-sm font-medium">{t}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
    </div>
  )
  return (
    <div className="cartao mb-6 flex flex-col gap-2 p-4 md:flex-row md:items-stretch">
      {passo('Quando', 'O gatilho', 'Um ar ligou ou desligou (pelo painel, Alexa, agenda…), está ligado há X minutos, ou chegou um horário.')}
      <span className="hidden self-center text-muted-foreground md:block">→</span>
      {passo('Se', 'As condições (opcional)', 'Só em certos dias da semana e numa janela de horário (pode virar a meia-noite).')}
      <span className="hidden self-center text-muted-foreground md:block">→</span>
      {passo('Então', 'As ações', 'Muda um ar, executa uma cena ou marca um timer para desligar depois. Ações de automação não disparam outras.')}
    </div>
  )
}

function HistoricoAutos() {
  const { dados } = useDados(() => api.get('/api/atividade?origem=automacao&limite=15'))
  const itens = Array.isArray(dados) ? dados : dados?.itens || []
  return (
    <section className="cartao mt-6 p-5">
      <h2 className="titulo-secao">Últimos disparos</h2>
      {!itens.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum disparo registrado ainda. Cada vez que uma regra age aparece aqui (e na Atividade).</p> : (
        <ul className="mt-3 divide-y divide-border">
          {itens.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${e.ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="min-w-0 flex-1 truncate"><b className="font-medium">{String(e.origem).replace('automacao:', '')}</b> · {e.acao}{e.aparelho_nome ? ` · ${e.aparelho_nome}` : ''}</span>
              <span className="text-xs text-muted-foreground">{haQuanto(e.quando)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

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
  const [apagar, setApagar] = useState(null)
  const [modelos, setModelos] = useState(false)
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('todas')
  const [sel, setSel] = useState(new Set()), [emLote, setEmLote] = useState(false), [ordem, setOrdem] = useState('nome')
  const toast = useToast()
  const visiveis = useMemo(() => {
    if (!dados) return []
    const q = normalizar(busca.trim())
    const [autos, aparelhos, cenas] = dados
    const passa = (a) => {
      if (situacao === 'ativas' && !a.ativo) return false
      if (situacao === 'pausadas' && a.ativo) return false
      if (situacao === 'problemas' && !problemas(a, autos, aparelhos, cenas).length) return false
      if (GATILHOS[situacao] && a.gatilho.tipo !== situacao) return false
      if (!q) return true
      const [quando, acoes] = resumo(a, aparelhos, cenas)
      return normalizar(`${a.nome} ${quando} ${acoes.join(' ')}`).includes(q)
    }
    const chave = { nome: (a) => a.nome.toLowerCase(), disparos: (a) => -(a.disparos || 0), ultimo: (a) => -(a.ultimo_disparo || 0) }[ordem]
    return autos.filter(passa).sort((x, y) => (chave(x) > chave(y) ? 1 : chave(x) < chave(y) ? -1 : 0))
  }, [dados, busca, situacao, ordem])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [autos, aparelhos, cenas, timers] = dados
  // toda ação mostra o erro (antes, ligar/pausar, rodar e apagar falhavam em silêncio)
  const agir = async (fn, ok) => { try { await fn(); if (ok) toast(ok); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const ultimo = Math.max(0, ...autos.map((a) => a.ultimo_disparo || 0))
  const corpoDe = (a, extra = {}) => ({ nome: a.nome, ativo: !!a.ativo, gatilho: a.gatilho, condicoes: a.condicoes || {}, acoes: a.acoes, ...extra })
  const lote = async (acao) => {
    setEmLote(true); let ok = 0
    for (const a of autos.filter((x) => sel.has(x.id))) {
      try { if (acao === 'apagar') await api.del(`/api/automacoes/${a.id}`); else await api.put(`/api/automacoes/${a.id}`, corpoDe(a, { ativo: acao === 'ativar' })); ok++ } catch (e) { toast(`${a.nome}: ${e.message}`, 'erro') }
    }
    setEmLote(false); setSel(new Set()); toast(`${ok} automação(ões) ${acao === 'apagar' ? 'apagada(s)' : acao === 'ativar' ? 'ativada(s)' : 'pausada(s)'}.`); recarregar()
  }
  const exportarJson = () => baixarArquivo('automacoes.json', JSON.stringify({ tipo: 'automacoes', versao: 1, itens: autos.map((a) => ({ ...corpoDe(a),
    nomes: { gatilho: aparelhos.find((x) => x.id === a.gatilho.aparelho_id)?.nome, aparelhos: Object.fromEntries(a.acoes.filter((x) => x.aparelho_id).map((x) => [x.aparelho_id, aparelhos.find((y) => y.id === x.aparelho_id)?.nome])), cenas: Object.fromEntries(a.acoes.filter((x) => x.cena_id).map((x) => [x.cena_id, cenas.find((c) => c.id === x.cena_id)?.nome])) } })) }, null, 2), 'application/json')
  const exportarCsv = () => baixarArquivo('automacoes.csv', paraCsv(visiveis, [['nome', 'Nome'], [(a) => resumo(a, aparelhos, cenas)[0], 'Quando'], [(a) => resumo(a, aparelhos, cenas)[1].join(' · '), 'Faz'], [(a) => (a.ativo ? 'ativa' : 'pausada'), 'Estado'], ['disparos', 'Disparos'], [(a) => (a.ultimo_disparo ? new Date(a.ultimo_disparo * 1000).toLocaleString('pt-BR') : ''), 'Último disparo']]), 'text/csv')
  const importar = async (j) => {
    if (!j || j.tipo !== 'automacoes' || !Array.isArray(j.itens)) return toast('Este arquivo não é uma exportação de automações.', 'erro')
    const arPor = (id, nome) => (aparelhos.find((x) => x.id === id) || aparelhos.find((x) => x.nome === nome))?.id
    const cenaPor = (id, nome) => (cenas.find((x) => x.id === id) || cenas.find((x) => x.nome === nome))?.id
    let ok = 0, pulados = 0
    for (const it of j.itens) {
      const n = it.nomes || {}
      const gatilho = { ...it.gatilho, aparelho_id: it.gatilho.aparelho_id ? arPor(it.gatilho.aparelho_id, n.gatilho) : undefined }
      const acoes = it.acoes.map((x) => ({ ...x, aparelho_id: x.aparelho_id ? arPor(x.aparelho_id, n.aparelhos?.[x.aparelho_id]) : undefined, cena_id: x.cena_id ? cenaPor(x.cena_id, n.cenas?.[x.cena_id]) : undefined }))
      if ((it.gatilho.aparelho_id && !gatilho.aparelho_id) || acoes.some((x) => (x.tipo === 'cena' && !x.cena_id))) { pulados++; continue }
      try { await api.post('/api/automacoes', { nome: String(it.nome).slice(0, 80), ativo: false, gatilho, condicoes: it.condicoes || {}, acoes }); ok++ } catch { pulados++ }
    }
    toast(`${ok} importada(s), pausadas para você conferir${pulados ? `; ${pulados} pulada(s)` : ''}.`); recarregar()
  }
  const comProblema = autos.filter((a) => problemas(a, autos, aparelhos, cenas).length).length
  const salvar = async (f) => {
    if (modal?.id) await api.put(`/api/automacoes/${modal.id}`, f); else await api.post('/api/automacoes', f)
    toast('Automação salva.'); recarregar()
  }
  return (
    <div className="w-full">
      <Cabecalho titulo="Automações" descricao="Regras que agem sozinhas: quando algo acontece (inclusive pela Alexa), o Clima Escritório faz o resto."
        acoes={<>
          {autos.length > 0 && <Botao variante="secundario" icone={LayoutTemplate} onClick={() => setModelos(true)}>Modelos prontos</Botao>}
          <Botao icone={Plus} disabled={!aparelhos.length} onClick={() => setModal({})}>Nova automação</Botao>
        </>} />
      {autos.length > 0 && (
        <div className="mb-5">
          <FaixaMetricas itens={[
            { rotulo: 'Ativas', valor: autos.filter((a) => a.ativo).length, sufixo: ` / ${autos.length}`, dica: `${autos.filter((a) => !a.ativo).length} pausada(s)` },
            { rotulo: 'Disparos', valor: autos.reduce((n, a) => n + (a.disparos || 0), 0), dica: 'desde que foram criadas' },
            { rotulo: 'Último disparo', valor: ultimo ? haQuanto(ultimo).replace('há ', '') : '—', dica: ultimo ? new Date(ultimo * 1000).toLocaleString('pt-BR') : 'nenhuma disparou ainda' },
            { rotulo: 'Temporizadores', valor: timers.length, dica: timers.length ? 'em andamento' : 'nenhum agora' },
          ]} />
        </div>
      )}

      {timers.length > 0 && (
        <div className="cartao mb-6 p-4">
          <p className="titulo-secao mb-2">Temporizadores ativos</p>
          {timers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span>{t.aparelho_nome}: {t.acao.ligado === false ? 'desligar' : 'ajustar'} {haQuanto(t.executar_em).replace('há', 'em')}</span>
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => agir(() => api.del(`/api/aparelhos/${t.aparelho_id}/temporizador`), 'Temporizador cancelado.')}>Cancelar</button>
            </div>
          ))}
        </div>
      )}

      <ComoFunciona />
      {autos.length === 0 ? (
        <>
          <Vazio icone={Workflow} titulo="Nenhuma automação" texto="Comece por um modelo pronto e ajuste do seu jeito." />
          <div className="mt-4 grid justify-center gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
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
          {comProblema > 0 && <Aviso tipo="alerta"><b>{comProblema} automação(ões) com problema</b> (ar ou cena que não existe, ar sem transmissor ou conflito de horário). <button className="underline" onClick={() => setSituacao('problemas')}>Ver só elas</button></Aviso>}
          <FerramentasLista busca={busca} setBusca={setBusca} placeholder="Procurar por nome, ar ou ação" filtro={situacao} setFiltro={setSituacao}
            filtros={[['todas', 'Todas', autos.length], ['ativas', 'Ativas', autos.filter((a) => a.ativo).length], ['pausadas', 'Pausadas', autos.filter((a) => !a.ativo).length],
              ['horario', 'Horário'], ['ligou', 'Ao ligar'], ['desligou', 'Ao desligar'], ['ligado_ha', 'Ligado há'], ...(comProblema ? [['problemas', 'Com problema', comProblema]] : [])]}
            total={autos.length} mostrando={visiveis.length} exportarCsv={exportarCsv} exportarJson={exportarJson} importar={importar}
            extra={<select className="campo h-8 w-auto text-xs" value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar"><option value="nome">Nome</option><option value="disparos">Mais disparos</option><option value="ultimo">Disparo mais recente</option></select>} />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={visiveis.length > 0 && visiveis.every((a) => sel.has(a.id))} onChange={(e) => setSel(e.target.checked ? new Set(visiveis.map((a) => a.id)) : new Set())} />Selecionar todas as mostradas</label>
            {sel.size > 0 && <>
              <b className="ml-2">{sel.size} selecionada(s)</b>
              <Botao tamanho="sm" variante="secundario" carregando={emLote} onClick={() => lote('ativar')}>Ativar</Botao>
              <Botao tamanho="sm" variante="secundario" carregando={emLote} onClick={() => lote('pausar')}>Pausar</Botao>
              <Botao tamanho="sm" variante="perigo" carregando={emLote} onClick={() => lote('apagar')}>Apagar</Botao>
            </>}
          </div>
          {visiveis.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma automação com esse filtro.</p>}
          {visiveis.map((a, i) => {
            const [quando, acoes] = resumo(a, aparelhos, cenas)
            const pb = problemas(a, autos, aparelhos, cenas)
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}
                className={`cartao flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${a.ativo ? '' : 'opacity-70'} ${sel.has(a.id) ? 'border-primary/50' : ''}`}>
                <input type="checkbox" className="self-start sm:self-center" aria-label={`Selecionar ${a.nome}`} checked={sel.has(a.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(a.id); else n.delete(a.id); setSel(n) }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.nome}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{quando}</span><ArrowRight className="h-3.5 w-3.5" /><span className="text-foreground">{acoes.join(' · ')}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{a.disparos} disparo(s){a.ultimo_disparo ? ` · último ${haQuanto(a.ultimo_disparo)}` : ''}</p>
                  {pb.map((t) => <p key={t} className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{t}</p>)}
                </div>
                <div className="flex items-center gap-1">
                  <Interruptor ligado={!!a.ativo} rotulo="Ativa" onChange={(v) => agir(() => api.put(`/api/automacoes/${a.id}`, { ...a, ativo: v }), v ? 'Automação ativada.' : 'Automação pausada.')} />
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" title="Rodar agora" aria-label="Rodar agora" onClick={() => agir(() => api.post(`/api/automacoes/${a.id}/executar`), `${a.nome}: executada.`)}><Play className="h-4 w-4" /></button>
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" onClick={() => setModal(a)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted" title="Duplicar" aria-label="Duplicar" onClick={() => agir(() => api.post('/api/automacoes', corpoDe(a, { nome: `${a.nome} (cópia)`.slice(0, 80), ativo: false })), 'Cópia criada, pausada.')}><Copy className="h-4 w-4" /></button>
                  <button className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={() => setApagar(a)} aria-label="Apagar"><Trash2 className="h-4 w-4" /></button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      <Modal aberto={!!apagar} titulo={`Apagar a automação ${apagar?.nome || ''}?`} onFechar={() => setApagar(null)}>
        <p className="text-sm text-muted-foreground">Ela para de agir na hora. Se quiser só suspender, use o botão Ativa (dá para voltar depois).</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={() => { const a = apagar; setApagar(null); agir(() => api.del(`/api/automacoes/${a.id}`), 'Automação apagada.') }}>Apagar</Botao>
        </div>
      </Modal>
      <Modal aberto={modelos} titulo="Modelos prontos" onFechar={() => setModelos(false)} largura="max-w-2xl">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {MODELOS.map((m) => (
            <button key={m.nome} onClick={() => { setModelos(false); setModal({ modelo: m }) }} className="rounded-lg border border-border p-3 text-left hover:border-primary hover:bg-muted/50">
              <p className="text-sm font-medium">{m.nome}</p>
              <p className="mt-1 text-xs text-muted-foreground">{resumo(m, aparelhos, cenas)[0]} → {resumo(m, aparelhos, cenas)[1].join(', ')}</p>
            </button>
          ))}
        </div>
      </Modal>
      <Modal aberto={!!modal} titulo={modal?.id ? 'Editar automação' : 'Nova automação'} onFechar={() => setModal(null)} largura="max-w-2xl">
        {modal && <Form inicial={modal.id ? modal : modal.modelo ? { ...modal.modelo, ativo: true } : null} aparelhos={aparelhos} cenas={cenas} aoSalvar={salvar} onFechar={() => setModal(null)} />}
      </Modal>
      <HistoricoAutos />
    </div>
  )
}
