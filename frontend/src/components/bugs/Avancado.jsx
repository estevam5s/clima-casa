import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Bot, Copy, CopyCheck, Link2, ListTodo, MessageSquare, Save, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Modal, confirmar, useDados, useToast } from '../ui'

// Bugs avançado: detalhe editável (gravidade, responsável, etiquetas, prazo, como foi corrigido), comentários com
// histórico, marcar como duplicado, criar tarefa, e as estatísticas (tempo até corrigir, recorrentes, atrasados).
export const GRAV = { critica: ['Crítica', 'bg-red-600 text-white'], alta: ['Alta', 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'],
  media: ['Média', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'], baixa: ['Baixa', 'bg-muted text-muted-foreground'] }
export const ESTADOS = [['aberto', 'Aberto'], ['analisando', 'Analisando'], ['corrigido', 'Corrigido'], ['descartado', 'Descartado']]
const TIPO_HIST = { comentario: 'comentou', estado: 'mudou o estado', gravidade: 'mudou a gravidade', responsavel: 'mudou o responsável', etiquetas: 'mudou as etiquetas',
  prazo: 'mudou o prazo', correcao: 'escreveu como foi corrigido', duplicado: 'juntou', tarefa: 'ligou a uma tarefa', criado: 'criou', titulo: 'mudou o título' }
const tooltip = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }

export function DetalheBug({ b, gestor, pessoas, todos, aoFechar, aoMudar }) {
  const toast = useToast()
  const [f, setF] = useState({ gravidade: b.gravidade, responsavel_id: b.responsavel_id || '', etiquetas: (b.etiquetas || []).join(', '), prazo: b.prazo || '', correcao: b.correcao || '' })
  const [hist, setHist] = useState(null)
  const [texto, setTexto] = useState('')
  const [dup, setDup] = useState('')
  const [ocupado, setOcupado] = useState('')
  const navegar = useNavigate()
  useEffect(() => { api.get(`/api/bugs/${b.id}/historico`).then(setHist).catch(() => setHist([])) }, [b.id])
  const copiar = (t, o) => { navigator.clipboard?.writeText(t); toast(`${o} copiado.`) }
  const executar = async (chave, fn, ok) => { setOcupado(chave); try { await fn(); if (ok) toast(ok); aoMudar(false) } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const salvar = () => executar('salvar', () => api.put(`/api/bugs/${b.id}/editar`, { ...f, etiquetas: f.etiquetas.split(',').map((x) => x.trim()).filter(Boolean) }), 'Bug atualizado.')
  const estado = (e) => executar(e, () => api.put(`/api/bugs/${b.id}`, { estado: e }), 'Estado atualizado.')
  const comentar = async (e) => { e.preventDefault(); if (!texto.trim()) return; setOcupado('coment'); try { setHist(await api.post(`/api/bugs/${b.id}/comentar`, { texto })); setTexto('') } catch (err) { toast(err.message, 'erro') } finally { setOcupado('') } }
  const tarefa = () => executar('tarefa', async () => { const r = await api.post(`/api/bugs/${b.id}/tarefa`); toast(r.ja_existia ? `Já existe a tarefa #${r.tarefa_id}.` : `Tarefa #${r.tarefa_id} criada em Tarefas → Plano de melhorias.`) })
  const duplicado = () => executar('dup', () => api.post(`/api/bugs/${b.id}/duplicado`, { de: +dup }), `Juntado ao bug #${dup}.`)
  const apagar = async () => { if (!(await confirmar(`Apagar o bug "${b.titulo}"?`, { ok: 'Apagar' }))) return; executar('apagar', async () => { await api.del(`/api/bugs/${b.id}`); aoFechar() }) }
  const [g, cor] = GRAV[b.gravidade] || GRAV.media
  return (
    <Modal aberto titulo={`#${b.id} ${b.titulo}`} onFechar={aoFechar} largura="max-w-4xl">
      <div className="grid grid-cols-1 gap-6 text-sm lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-medium ${cor}`}>{g}</span>
            <span className="rounded bg-muted px-1.5 py-0.5">{b.origem === 'sistema' ? 'Encontrado pelo sistema' : `Relatado por ${b.autor_nome || 'usuário'}`}</span>
            {b.pagina && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{b.pagina}</span>}
            {(b.etiquetas || []).map((e) => <span key={e} className="rounded-full border border-border px-2 py-0.5">{e}</span>)}
            <span className="text-muted-foreground">{b.ocorrencias}× · última {haQuanto(b.atualizado_em)}</span>
            {b.duplicado_de && <span className="rounded bg-muted px-1.5 py-0.5">duplicado de #{b.duplicado_de}</span>}
            {b.tarefa_id && <Link to={`/tarefas?projeto=${b.tarefa_projeto || 'projetos'}&tarefa=${b.tarefa_id}`} title="Abrir a tarefa no Plano de melhorias" className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">tarefa #{b.tarefa_id}{b.tarefa_prioridade ? ` · ${{ urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' }[b.tarefa_prioridade] || b.tarefa_prioridade}` : ''}{b.tarefa_concluida ? ' · concluída' : ''}</Link>}
          </div>
          <p className="whitespace-pre-line">{b.descricao}</p>
          {b.passos && <div><p className="rotulo">Passos</p><p className="whitespace-pre-line text-muted-foreground">{b.passos}</p></div>}
          {b.contexto?.erros?.length > 0 && <div><p className="rotulo">Erros registrados</p><ul className="max-h-32 overflow-y-auto rounded bg-muted p-2 font-mono text-xs">{b.contexto.erros.map((e, i) => <li key={i}>{typeof e === 'string' ? e : JSON.stringify(e)}</li>)}</ul></div>}
          {b.contexto?.detalhe && <details><summary className="cursor-pointer text-xs text-muted-foreground">Pilha do erro</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{b.contexto.detalhe}</pre></details>}
          {b.correcao && <div className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-3 dark:bg-emerald-950/40"><p className="rotulo text-emerald-800 dark:text-emerald-300">Como foi corrigido</p><p className="whitespace-pre-line">{b.correcao}</p></div>}
          <div className="rounded-lg border border-border p-3"><p className="rotulo">Sugestão de correção</p><p>{b.sugestao}</p></div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2"><p className="rotulo flex items-center gap-1.5"><Bot className="h-4 w-4" />Prompt para a IA corrigir</p>
              <Botao tamanho="sm" variante="secundario" icone={Copy} onClick={() => copiar(b.prompt, 'Prompt')}>Copiar</Botao></div>
            <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{b.prompt}</pre>
          </div>
          <div>
            <p className="rotulo flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />Comentários e histórico</p>
            {!hist ? <Esqueleto className="h-16" /> : (
              <ol className="mt-2 space-y-2 border-l border-border pl-4">
                {hist.map((h) => (
                  <li key={h.id} className="relative">
                    <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${h.tipo === 'comentario' ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                    <p className="text-xs text-muted-foreground"><b className="font-medium text-foreground">{h.autor_nome}</b> {TIPO_HIST[h.tipo] || h.tipo} · {haQuanto(h.quando)}</p>
                    {h.texto && <p className={`mt-0.5 whitespace-pre-line ${h.tipo === 'comentario' ? 'rounded-lg bg-muted/60 px-3 py-2' : 'text-xs'}`}>{h.texto}</p>}
                  </li>
                ))}
                {!hist.length && <li className="text-xs text-muted-foreground">Nada ainda.</li>}
              </ol>
            )}
            <form onSubmit={comentar} className="mt-3 flex gap-2">
              <input className="campo flex-1" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva um comentário" maxLength={2000} aria-label="Comentário" />
              <Botao type="submit" tamanho="sm" carregando={ocupado === 'coment'} disabled={!texto.trim()}>Comentar</Botao>
            </form>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="flex gap-2"><Botao tamanho="sm" variante="secundario" icone={Link2} onClick={() => copiar(`${window.location.origin}/bugs?bug=${b.id}`, 'Link')}>Copiar link</Botao></div>
          {gestor ? (<>
            <div><p className="rotulo">Estado</p><div className="grid grid-cols-2 gap-1.5">{ESTADOS.map(([k, r]) => <Botao key={k} tamanho="sm" variante={b.estado === k ? 'primario' : 'secundario'} carregando={ocupado === k} onClick={() => estado(k)}>{r}</Botao>)}</div></div>
            <div><label className="rotulo" htmlFor="bg">Gravidade</label><select id="bg" className="campo" value={f.gravidade} onChange={(e) => setF({ ...f, gravidade: e.target.value })}>{Object.entries(GRAV).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}</select></div>
            <div><label className="rotulo" htmlFor="br">Responsável</label><select id="br" className="campo" value={f.responsavel_id} onChange={(e) => setF({ ...f, responsavel_id: e.target.value })}><option value="">Ninguém</option>{(pessoas || []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <div><label className="rotulo" htmlFor="bp">Prazo</label><input id="bp" type="date" className="campo" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></div>
            <div><label className="rotulo" htmlFor="be">Etiquetas</label><input id="be" className="campo" value={f.etiquetas} onChange={(e) => setF({ ...f, etiquetas: e.target.value })} placeholder="mapa, celular, urgente" /><p className="ajuda">Separe com vírgula.</p></div>
            <div><label className="rotulo" htmlFor="bc">Como foi corrigido</label><textarea id="bc" rows={3} className="campo" value={f.correcao} onChange={(e) => setF({ ...f, correcao: e.target.value })} placeholder="Commit, arquivo, o que mudou" /></div>
            <Botao className="w-full" icone={Save} carregando={ocupado === 'salvar'} onClick={salvar}>Salvar</Botao>
            <div className="space-y-2 border-t border-border pt-4">
              <Botao className="w-full" variante="secundario" icone={ListTodo} carregando={ocupado === 'tarefa'} onClick={b.tarefa_id ? () => navegar(`/tarefas?projeto=${b.tarefa_projeto || 'projetos'}&tarefa=${b.tarefa_id}`) : tarefa}>{b.tarefa_id ? 'Ver a tarefa' : 'Criar tarefa'}</Botao>
              <div className="flex gap-2"><select className="campo h-9 min-w-0 flex-1" value={dup} onChange={(e) => setDup(e.target.value)} aria-label="Duplicado de"><option value="">Duplicado de…</option>{(todos || []).filter((x) => x.id !== b.id).slice(0, 200).map((x) => <option key={x.id} value={x.id}>#{x.id} {x.titulo.slice(0, 40)}</option>)}</select>
                <Botao tamanho="sm" variante="secundario" icone={CopyCheck} disabled={!dup} carregando={ocupado === 'dup'} onClick={duplicado}>Juntar</Botao></div>
              <Botao className="w-full" variante="fantasma" icone={Trash2} onClick={apagar}>Apagar</Botao>
            </div>
          </>) : <p className="text-xs text-muted-foreground">Estado atual: {ESTADOS.find(([k]) => k === b.estado)?.[1]}. Quem gerencia o sistema acompanha e responde aqui.</p>}
        </aside>
      </div>
    </Modal>
  )
}

export function Estatisticas() {
  const [dias, setDias] = useState(30)
  const { dados: d, erro } = useDados(() => api.get(`/api/bugs/estatisticas?dias=${dias}`), [dias])
  if (erro) return <Aviso>{erro}</Aviso>
  const serie = (() => {
    if (!d) return []
    const m = {}
    for (const x of d.criados) m[x.dia] = { dia: x.dia, criados: x.n, corrigidos: 0 }
    for (const x of d.corrigidos) m[x.dia] = { ...(m[x.dia] || { dia: x.dia, criados: 0 }), corrigidos: x.n }
    return Object.values(m).sort((a, b) => a.dia.localeCompare(b.dia)).map((x) => ({ ...x, rot: `${x.dia.slice(8, 10)}/${x.dia.slice(5, 7)}` }))
  })()
  const Lista = ({ titulo, itens }) => (
    <section className="cartao p-5"><h2 className="titulo-secao mb-3">{titulo}</h2>
      <ul className="space-y-1.5 text-sm">{itens.map((x) => <li key={x.k} className="flex justify-between gap-2"><span className="truncate">{x.k}</span><span className="tabular shrink-0 text-muted-foreground">{x.abertos} aberto(s) · {x.total}</span></li>)}</ul></section>
  )
  return (
    <div className="space-y-6">
      <div className="flex w-fit rounded-lg border border-border bg-card p-0.5 text-sm">{[7, 30, 90, 365].map((x) => <button key={x} onClick={() => setDias(x)} className={`rounded-md px-3 py-1.5 ${dias === x ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{x === 365 ? '1 ano' : `${x} dias`}</button>)}</div>
      {!d ? <Esqueleto className="h-80" /> : (<>
        <FaixaMetricas itens={[
          { rotulo: 'Criados', valor: d.criados.reduce((s, x) => s + x.n, 0), dica: `em ${dias} dias` },
          { rotulo: 'Corrigidos', valor: d.corrigidos_n, tom: 'bom' },
          { rotulo: 'Tempo até corrigir', valor: d.tempo_mediana_h != null ? `${d.tempo_mediana_h} h` : '-', dica: d.tempo_medio_h != null ? `mediana · média ${d.tempo_medio_h} h` : 'sem correções no período' },
          { rotulo: 'Reabertos', valor: d.reabertos, tom: d.reabertos ? 'ruim' : undefined, dica: `${d.atrasados.length} com prazo vencido` },
        ]} />
        <section className="cartao p-5"><h2 className="titulo-secao mb-2">Criados × corrigidos por dia</h2>
          {serie.length ? <div className="h-60"><ResponsiveContainer><BarChart data={serie} margin={{ left: -18, right: 6 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="rot" tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={tooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="criados" name="Criados" fill="#dc2626" radius={[3, 3, 0, 0]} /><Bar dataKey="corrigidos" name="Corrigidos" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <p className="text-sm text-muted-foreground">Nada no período.</p>}
        </section>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Lista titulo="Por gravidade" itens={d.por_gravidade} />
          <Lista titulo="Por categoria" itens={d.por_categoria} />
          <Lista titulo="Por responsável" itens={d.por_responsavel} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Lista titulo="Por tela" itens={d.por_pagina} />
          <section className="cartao p-5"><h2 className="titulo-secao mb-3">Os que mais se repetem</h2>
            <ul className="space-y-1.5 text-sm">{d.recorrentes.map((x) => <li key={x.id} className="flex justify-between gap-2"><Link to={`/bugs?bug=${x.id}`} className="truncate hover:underline">#{x.id} {x.titulo}</Link><span className="tabular shrink-0 text-muted-foreground">{x.ocorrencias}× · {x.estado}</span></li>)}</ul></section>
        </div>
        {d.atrasados.length > 0 && <section className="cartao p-5"><h2 className="titulo-secao mb-3">Prazo vencido</h2>
          <ul className="space-y-1.5 text-sm">{d.atrasados.map((x) => <li key={x.id} className="flex justify-between gap-2"><Link to={`/bugs?bug=${x.id}`} className="truncate hover:underline">#{x.id} {x.titulo}</Link><span className="shrink-0 text-red-600 dark:text-red-400">{x.prazo.split('-').reverse().join('/')}{x.responsavel_nome ? ` · ${x.responsavel_nome}` : ''}</span></li>)}</ul></section>}
      </>)}
    </div>
  )
}

const celula = (v) => { const t = String(v ?? ''); return /^[=+\-@]/.test(t) ? `'${t}` : t }
export function exportarBugs(itens, fmt) {
  const baixar = (nome, tipo, texto) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href) }
  const nome = `bugs-${new Date().toISOString().slice(0, 10)}`
  if (fmt === 'json') return baixar(`${nome}.json`, 'application/json', JSON.stringify(itens.map(({ prompt, ...b }) => b), null, 1))
  const cab = ['id', 'titulo', 'gravidade', 'estado', 'origem', 'categoria', 'pagina', 'ocorrencias', 'responsavel', 'etiquetas', 'prazo', 'criado', 'atualizado']
  const d = (ts) => (ts ? new Date(ts * 1000).toLocaleString('pt-BR') : '')
  const linhas = itens.map((b) => [b.id, b.titulo, b.gravidade, b.estado, b.origem, b.categoria, b.pagina, b.ocorrencias, b.responsavel_nome, (b.etiquetas || []).join(' '), b.prazo, d(b.criado_em), d(b.atualizado_em)]
    .map((v) => `"${celula(v).replace(/"/g, '""')}"`).join(';'))
  baixar(`${nome}.csv`, 'text/csv;charset=utf-8', '﻿' + [cab.join(';'), ...linhas].join('\n'))
}
