import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, CheckCircle2, CircleDashed, ClipboardCheck, Download, FileSpreadsheet, Fingerprint, Globe2, Link2, Lock, MinusCircle, Pencil, Play, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, UserX, XCircle } from 'lucide-react'
import { api, dataHora, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Interruptor, Modal, Secao, useDados, useToast } from '../ui'

// ---------------------------------------------------------------- comum
const ST = {
  implementado: ['Implementado', 'text-emerald-600 dark:text-emerald-400', 'bg-emerald-500', CheckCircle2],
  parcial: ['Parcial', 'text-amber-600 dark:text-amber-400', 'bg-amber-500', CircleDashed],
  pendente: ['Pendente', 'text-red-600 dark:text-red-400', 'bg-red-500', XCircle],
  nao_aplicavel: ['Não se aplica', 'text-muted-foreground', 'bg-zinc-400', MinusCircle],
}
const ORIGEM = { automatico: 'Conferido pelo sistema', sistema: 'Do próprio sistema', manual: 'Declarado' }
const corNota = (n) => (n >= 85 ? 'stroke-emerald-500' : n >= 60 ? 'stroke-amber-500' : 'stroke-red-500')

function Anel({ nota, tamanho = 64, rotulo }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative grid place-items-center" style={{ width: tamanho, height: tamanho }}>
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" className="stroke-muted" />
          <motion.circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round" className={corNota(nota)} strokeDasharray="97.4" initial={{ strokeDashoffset: 97.4 }} animate={{ strokeDashoffset: 97.4 * (1 - nota / 100) }} transition={{ duration: 1 }} /></svg>
        <span className="text-sm font-semibold tabular">{nota}%</span>
      </div>
      {rotulo && <span className="text-center text-[11px] text-muted-foreground">{rotulo}</span>}
    </div>
  )
}

function Situacao({ status }) {
  const [r, cor, , I] = ST[status] || ST.pendente
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${cor}`}><I className="h-3.5 w-3.5" />{r}</span>
}

// ---------------------------------------------------------------- Conformidade ISO
// minutas no modelo da Prefeitura: a direção revisa e assina; depois o controle é marcado com a evidência
function Documentos() {
  const toast = useToast()
  const { dados } = useDados(() => api.get('/api/seguranca/documentos'))
  const [baixando, setBaixando] = useState('')
  const baixar = async (tipo, f) => { setBaixando(tipo + f); try { await api.baixar(`/api/seguranca/documentos/${tipo}?formato=${f}`) } catch (e) { toast(e.message, 'erro') } finally { setBaixando('') } }
  return (
    <Secao titulo="Documentos do sistema de gestão" contexto="Minutas no modelo oficial da Prefeitura, montadas com os fatos deste sistema: revise, aprove, assine e marque o controle com a evidência">
      {!dados ? <div className="p-5"><Esqueleto className="h-32" /></div> : (
        <ul className="divide-y divide-border">
          {dados.documentos.map((d) => (
            <li key={d.tipo} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{d.titulo}</p><p className="text-xs text-muted-foreground">Atende {d.controles.join(', ')}</p></div>
              <div className="flex gap-1.5">
                <Botao tamanho="sm" variante="secundario" icone={Download} carregando={baixando === d.tipo + 'pdf'} onClick={() => baixar(d.tipo, 'pdf')}>PDF</Botao>
                <Botao tamanho="sm" variante="secundario" icone={Download} carregando={baixando === d.tipo + 'docx'} onClick={() => baixar(d.tipo, 'docx')}>Word</Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}

// o que falta para subir a nota, em ordem: o que o sistema já confere (depende de uma ação aqui), o que pede documento
// aprovado e o que é físico ou de pessoal (fora do software: só a organização resolve)
function ProximosPassos({ dados }) {
  const todos = [...dados.controles, ...dados.clausulas]
  const aqui = todos.filter((c) => c.origem === 'automatico' && (c.status === 'pendente' || c.status === 'parcial'))
  const fisico = dados.controles.filter((c) => (c.tema === 'Físicos' || c.tema === 'Pessoas') && c.status === 'pendente')
  const decl = todos.filter((c) => c.origem === 'manual' && c.status === 'pendente' && c.tema !== 'Físicos' && c.tema !== 'Pessoas')
  if (!aqui.length && !fisico.length && !decl.length) return null
  return (
    <Secao titulo="O que falta, em ordem" contexto="Nada aqui é marcado como feito sozinho: cada item pede uma ação real">
      <div className="grid gap-px bg-border lg:grid-cols-3">
        <div className="bg-card p-4">
          <p className="text-sm font-semibold">1. Ações no sistema ({aqui.length})</p>
          <p className="mb-2 text-xs text-muted-foreground">O sistema confere sozinho assim que for feito.</p>
          <ul className="space-y-1.5 text-xs">{aqui.slice(0, 10).map((c) => <li key={c.chave}><b className="tabular">{c.id}</b> · {c.detalhe || c.titulo}</li>)}</ul>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-semibold">2. Documentos para aprovar ({decl.length})</p>
          <p className="mb-2 text-xs text-muted-foreground">Baixe a minuta abaixo, aprove e assine; depois marque o controle com a evidência.</p>
          <ul className="space-y-1 text-xs">{decl.slice(0, 10).map((c) => <li key={c.chave}><b className="tabular">{c.id}</b> · {c.titulo}</li>)}{decl.length > 10 && <li className="text-muted-foreground">e mais {decl.length - 10}</li>}</ul>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-semibold">3. Físicos e de pessoal ({fisico.length})</p>
          <p className="mb-2 text-xs text-muted-foreground">Portaria, salas, treinamento, contratação: a organização resolve e registra a evidência. Se o controle não se aplica ao escopo, marque “Não se aplica” com o motivo.</p>
          <ul className="space-y-1 text-xs">{fisico.slice(0, 8).map((c) => <li key={c.chave}><b className="tabular">{c.id}</b> · {c.titulo}</li>)}{fisico.length > 8 && <li className="text-muted-foreground">e mais {fisico.length - 8}</li>}</ul>
        </div>
      </div>
    </Secao>
  )
}

// registros formais (aprovação da política, liderança, contexto, partes interessadas, recursos, auditoria interna,
// análise crítica) e contatos com autoridades e grupos: valem por 12 meses na conformidade
function Registros() {
  const toast = useToast()
  const { dados, recarregar } = useDados(() => api.get('/api/seguranca/registros'))
  const [f, setF] = useState(null)
  const [contatos, setContatos] = useState(null)
  if (!dados) return null
  const lista = contatos ?? dados.contatos
  const salvar = async (e) => { e.preventDefault(); try { await api.post('/api/seguranca/registros', f); toast('Registro salvo.'); setF(null); recarregar() } catch (err) { toast(err.message, 'erro') } }
  const salvarContatos = async () => { try { await api.put('/api/seguranca/contatos', lista); toast('Contatos salvos.'); setContatos(null); recarregar() } catch (err) { toast(err.message, 'erro') } }
  const ultimo = (t) => dados.registros.filter((r) => r.tipo === t).sort((a, b) => b.data - a.data)[0]
  return (
    <Secao titulo="Registros do sistema de gestão" contexto="Atas e aprovações que a norma pede (cláusulas 4, 5, 7 e 9): cada uma vale por 12 meses na nota">
      <ul className="divide-y divide-border">{Object.entries(dados.tipos).map(([k, r]) => { const u = ultimo(k); return (
        <li key={k} className="flex flex-wrap items-center gap-2 px-5 py-3">
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{r}</p><p className="text-xs text-muted-foreground">{u ? `${new Date(u.data * 1000).toLocaleDateString('pt-BR')} · ${u.responsavel} · ${u.resumo.slice(0, 90)}` : 'Sem registro'}</p></div>
          {u ? <Situacao status={Date.now() / 1000 - u.data < 365 * 86400 ? 'implementado' : 'parcial'} /> : <Situacao status="pendente" />}
          <Botao tamanho="sm" variante="secundario" onClick={() => setF({ tipo: k, data: new Date().toISOString().slice(0, 10), responsavel: '', resumo: '' })}>Registrar</Botao>
        </li>) })}
      </ul>
      <div className="border-t border-border px-5 py-4">
        <p className="text-sm font-medium">Contatos de segurança (5.5 e 5.6)</p>
        <p className="text-xs text-muted-foreground">Autoridades (ANPD, polícia, CERT.br), grupos de segurança, fornecedores e responsáveis internos.</p>
        <ul className="mt-2 space-y-2">{lista.map((c, i) => (
          <li key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_1.4fr_auto]">
            <input className="campo h-9" placeholder="Nome" value={c.nome} onChange={(e) => setContatos(lista.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
            <select className="campo h-9" value={c.tipo} onChange={(e) => setContatos(lista.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}><option value="autoridade">Autoridade</option><option value="grupo">Grupo</option><option value="fornecedor">Fornecedor</option><option value="interno">Interno</option></select>
            <input className="campo h-9" placeholder="E-mail, telefone ou site" value={c.contato} onChange={(e) => setContatos(lista.map((x, j) => (j === i ? { ...x, contato: e.target.value } : x)))} />
            <button type="button" onClick={() => setContatos(lista.filter((_, j) => j !== i))} className="rounded p-2 text-muted-foreground hover:text-red-600" aria-label="Remover contato"><Trash2 className="h-4 w-4" /></button>
          </li>))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Botao tamanho="sm" variante="secundario" icone={Plus} onClick={() => setContatos([...lista, { nome: '', tipo: 'autoridade', contato: '', quando_usar: '' }])}>Adicionar contato</Botao>
          {!lista.length && <Botao tamanho="sm" variante="secundario" onClick={() => setContatos([
            { nome: 'ANPD (Autoridade Nacional de Proteção de Dados)', tipo: 'autoridade', contato: 'https://www.gov.br/anpd', quando_usar: 'incidente com dado pessoal' },
            { nome: 'CERT.br', tipo: 'grupo', contato: 'cert@cert.br', quando_usar: 'ataques e incidentes de rede' }])}>Começar com ANPD e CERT.br</Botao>}
          {contatos && <Botao tamanho="sm" onClick={salvarContatos}>Salvar contatos</Botao>}
        </div>
      </div>
      <Modal aberto={!!f} titulo={f ? dados.tipos[f.tipo] : ''} onFechar={() => setF(null)}>
        {f && <form onSubmit={salvar} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Data<input type="date" className="campo mt-1" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required /></label>
            <label className="text-xs text-muted-foreground">Responsável<input className="campo mt-1" value={f.responsavel} onChange={(e) => setF({ ...f, responsavel: e.target.value })} required minLength={2} /></label>
          </div>
          <label className="block text-xs text-muted-foreground">Resumo (o que foi decidido ou verificado)<textarea className="campo mt-1 min-h-32" value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} required minLength={10} /></label>
          <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setF(null)}>Cancelar</Botao><Botao type="submit">Salvar registro</Botao></div>
        </form>}
      </Modal>
    </Secao>
  )
}

export function Conformidade() {
  const toast = useToast()
  const { dados, recarregar } = useDados(() => api.get('/api/seguranca/conformidade'))
  const [tema, setTema] = useState('todos')
  const [filtro, setFiltro] = useState('todos')
  const [norma, setNorma] = useState('')
  const [busca, setBusca] = useState('')
  const [editar, setEditar] = useState(null)
  const [plano, setPlano] = useState(null)
  const lista = useMemo(() => {
    if (!dados) return []
    const base = tema === 'Cláusulas' ? dados.clausulas : dados.controles.filter((c) => tema === 'todos' || c.tema === tema)
    const b = busca.toLowerCase()
    return base.filter((c) => (filtro === 'todos' || c.status === filtro || (filtro === 'manual' && c.origem === 'manual'))
      && (!norma || c.normas.includes(norma) || (norma === '27001' && c.tema !== 'Cláusulas') || (norma === '27001' && c.tema === 'Cláusulas'))
      && (!b || `${c.id} ${c.titulo} ${c.detalhe} ${c.evidencia}`.toLowerCase().includes(b)))
  }, [dados, tema, filtro, norma, busca])
  if (!dados) return <div className="grid gap-4"><Esqueleto className="h-40" /><Esqueleto className="h-96" /></div>

  const salvar = async (e) => {
    e.preventDefault()
    try { await api.put(`/api/seguranca/conformidade/${editar.chave}`, { status: editar.status, evidencia: editar.evidencia, responsavel: editar.responsavel }); toast(`Controle ${editar.id} atualizado.`); setEditar(null); recarregar() } catch (err) { toast(err.message, 'erro') }
  }
  const salvarPlano = async (e) => {
    e.preventDefault()
    try { await api.put('/api/seguranca/conformidade/plano', plano); toast('Plano salvo.'); setPlano(null); recarregar() } catch (err) { toast(err.message, 'erro') }
  }
  const c = dados.contagem
  return (
    <div className="grid gap-6">
      <section className="cartao p-5">
        <div className="flex flex-wrap items-center gap-6">
          <Anel nota={dados.nota_geral} tamanho={84} rotulo="Geral" />
          <Anel nota={dados.nota_anexo} rotulo="Anexo A (93)" />
          <Anel nota={dados.nota_clausulas} rotulo="Cláusulas 4–10" />
          {dados.temas.map((t) => <Anel key={t.tema} nota={t.nota} tamanho={52} rotulo={`${t.tema} (${t.total})`} />)}
          <div className="ml-auto min-w-[220px] space-y-2 text-sm">
            <p className="font-medium">ISO/IEC 27001:2022 · 27002</p>
            <p className="text-xs text-muted-foreground">{c.implementado} implementados · {c.parcial} parciais · {c.pendente} pendentes · {c.nao_aplicavel} fora do escopo. {dados.automaticos} itens conferidos pelo próprio sistema.</p>
            <div className="flex h-2 overflow-hidden rounded-full bg-muted">{['implementado', 'parcial', 'pendente', 'nao_aplicavel'].map((k) => <motion.span key={k} className={ST[k][2]} initial={{ width: 0 }} animate={{ width: `${(c[k] / 93) * 100}%` }} transition={{ duration: 0.8 }} />)}</div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Botao tamanho="sm" variante="secundario" icone={FileSpreadsheet} onClick={() => api.baixar('/api/seguranca/conformidade/declaracao?formato=csv').catch((e) => toast(e.message, 'erro'))}>Declaração (CSV)</Botao>
              <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => api.baixar('/api/seguranca/conformidade/declaracao?formato=html').catch((e) => toast(e.message, 'erro'))}>Declaração (HTML)</Botao>
              <Botao tamanho="sm" variante="secundario" icone={Pencil} onClick={() => setPlano({ ...dados.plano })}>Escopo e responsável</Botao>
            </div>
          </div>
        </div>
        {!dados.testes_em && <div className="mt-4"><Aviso tipo="alerta">Rode os testes ao vivo (aba Testes ao vivo) para o sistema conferir cabeçalhos, TLS e arquivos expostos; alguns controles dependem deles.</Aviso></div>}
      </section>

      <ProximosPassos dados={dados} />
      <Documentos />
      <Registros />

      <Secao titulo="Normas cobertas" contexto="Quanto de cada norma da família ISO 27000 (e da LGPD) os controles atendem hoje">
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {dados.normas.map((n) => (
            <button key={n.id} onClick={() => setNorma(norma === n.id ? '' : n.id)} className={`bg-card px-4 py-3 text-left transition-colors hover:bg-muted ${norma === n.id ? 'ring-2 ring-inset ring-primary' : ''}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-semibold">{n.id === 'LGPD' ? 'LGPD' : `ISO ${n.id}`}</span><span className={`text-sm font-semibold tabular ${n.nota >= 85 ? 'text-emerald-600 dark:text-emerald-400' : n.nota >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{n.nota}%</span></div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{n.descricao} · {n.itens} item(ns)</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className={`h-full ${n.nota >= 85 ? 'bg-emerald-500' : n.nota >= 60 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${n.nota}%` }} /></div>
            </button>
          ))}
        </div>
      </Secao>

      <Secao titulo="Checklist de controles" contexto={`${lista.length} item(ns)${norma ? ` · filtrando ISO ${norma}` : ''} · clique para registrar evidência`}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
          {['todos', 'Organizacionais', 'Pessoas', 'Físicos', 'Tecnológicos', 'Cláusulas'].map((t) => <button key={t} onClick={() => setTema(t)} className={`rounded-md px-2.5 py-1 text-xs ${tema === t ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{t === 'todos' ? 'Anexo A inteiro' : t}</button>)}
          <span className="mx-1 h-4 w-px bg-border" />
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="campo h-8 w-auto py-0 text-xs" aria-label="Filtrar situação">
            <option value="todos">Todas as situações</option><option value="pendente">Pendentes</option><option value="parcial">Parciais</option><option value="implementado">Implementados</option><option value="nao_aplicavel">Fora do escopo</option><option value="manual">Só os declarados</option></select>
          <label className="relative ml-auto"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar controle" className="campo h-8 w-48 pl-8 text-xs" aria-label="Buscar controle" /></label>
        </div>
        <ul className="divide-y divide-border">
          {lista.map((x) => (
            <li key={x.chave}>
              <button onClick={() => setEditar({ ...x })} className="grid w-full gap-1 px-5 py-3 text-left hover:bg-muted/50 sm:grid-cols-[64px_1fr_150px] sm:gap-4">
                <span className="font-mono text-xs text-muted-foreground">{x.tema === 'Cláusulas' ? `Cl. ${x.id}` : `A.${x.id}`}</span>
                <span className="min-w-0"><span className="block text-sm font-medium">{x.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{x.detalhe || x.evidencia || (x.origem === 'manual' ? 'Sem evidência registrada.' : '')}</span>
                  <span className="mt-1 flex flex-wrap gap-1">{x.normas.map((n) => <span key={n} className="rounded border border-border px-1 text-[10px] text-muted-foreground">{n}</span>)}<span className="text-[10px] text-muted-foreground">· {ORIGEM[x.origem]}{x.revisado_em ? ` · revisto ${haQuanto(x.revisado_em)}` : ''}</span></span></span>
                <span className="sm:text-right"><Situacao status={x.status} /></span>
              </button>
            </li>
          ))}
          {!lista.length && <li className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum controle com esse filtro.</li>}
        </ul>
      </Secao>

      <Modal aberto={!!editar} titulo={editar ? `${editar.tema === 'Cláusulas' ? 'Cláusula' : 'Controle A.'}${editar.id} · ${editar.titulo}` : ''} onFechar={() => setEditar(null)}>
        {editar && (
          <form onSubmit={salvar} className="space-y-4">
            {editar.origem !== 'manual' && <Aviso tipo="ok">{ORIGEM[editar.origem]}: {editar.detalhe}. A situação vem da verificação; aqui você pode juntar evidência ou tirar do escopo.</Aviso>}
            <div><span className="rotulo">Situação</span><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(ST).map(([k, [r]]) => (
              <button key={k} type="button" onClick={() => setEditar((x) => ({ ...x, status: k }))} disabled={editar.origem !== 'manual' && k !== 'nao_aplicavel' && k !== editar.status} className={`rounded-lg border px-2 py-2 text-xs font-medium disabled:opacity-40 ${editar.status === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{r}</button>))}</div></div>
            <label className="block"><span className="rotulo">Evidência</span><textarea className="campo h-28 py-2" value={editar.evidencia} onChange={(e) => setEditar((x) => ({ ...x, evidencia: e.target.value }))} maxLength={800} placeholder="Ex.: Política aprovada em 10/03/2026, arquivo no Drive da diretoria; treinamento anual registrado em ata." /></label>
            <label className="block"><span className="rotulo">Responsável</span><input className="campo" value={editar.responsavel} onChange={(e) => setEditar((x) => ({ ...x, responsavel: e.target.value }))} maxLength={80} /></label>
            <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setEditar(null)}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
          </form>
        )}
      </Modal>
      <Modal aberto={!!plano} titulo="Escopo do sistema de gestão" onFechar={() => setPlano(null)}>
        {plano && (
          <form onSubmit={salvarPlano} className="space-y-4">
            <label className="block"><span className="rotulo">Escopo (cláusula 4.3)</span><textarea className="campo h-28 py-2" value={plano.escopo} onChange={(e) => setPlano((x) => ({ ...x, escopo: e.target.value }))} maxLength={1500} placeholder="Ex.: Plataforma Clima Escritório (painel web, apps, agente local e transmissores IR) usada pela equipe do escritório." /></label>
            <label className="block"><span className="rotulo">Responsável pela segurança e pelos incidentes</span><input className="campo" value={plano.responsavel} onChange={(e) => setPlano((x) => ({ ...x, responsavel: e.target.value }))} maxLength={120} /></label>
            <label className="block"><span className="rotulo">Encarregado de dados (LGPD) ou contato com a ANPD</span><input className="campo" value={plano.contato_anpd} onChange={(e) => setPlano((x) => ({ ...x, contato_anpd: e.target.value }))} maxLength={200} /></label>
            <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setPlano(null)}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- Riscos (ISO 27005)
const TRATAMENTOS = [['pendente', 'Sem decisão'], ['mitigar', 'Mitigar'], ['aceitar', 'Aceitar'], ['transferir', 'Transferir'], ['evitar', 'Evitar']]
const nivel = (p, i) => { const n = p * i; return n >= 15 ? ['Crítico', 'bg-red-600 text-white'] : n >= 10 ? ['Alto', 'bg-orange-500 text-white'] : n >= 5 ? ['Médio', 'bg-amber-400 text-black'] : ['Baixo', 'bg-emerald-500 text-white'] } // marca: cores da matriz de risco
const VAZIO_RISCO = { titulo: '', ativo: '', ameaca: '', probabilidade: 3, impacto: 3, tratamento: 'pendente', controles: [], responsavel: '', plano: '' }

export function Riscos() {
  const toast = useToast()
  const { dados, setDados } = useDados(() => api.get('/api/seguranca/riscos'))
  const [form, setForm] = useState(null)
  const [celula, setCelula] = useState(null)
  if (!dados) return <Esqueleto className="h-96" />
  const salvar = async (e) => {
    e.preventDefault()
    const corpo = { ...form, controles: String(form.controlesTexto ?? form.controles.join(', ')).split(/[\s,;]+/).filter(Boolean) }
    delete corpo.controlesTexto; delete corpo.id; delete corpo.criado_em; delete corpo.revisado_em
    try { setDados(form.id ? await api.put(`/api/seguranca/riscos/${form.id}`, corpo) : await api.post('/api/seguranca/riscos', corpo)); setForm(null); toast('Risco salvo.') } catch (err) { toast(err.message, 'erro') }
  }
  const lista = dados.filter((r) => !celula || (r.probabilidade === celula[0] && r.impacto === celula[1])).sort((a, b) => b.probabilidade * b.impacto - a.probabilidade * a.impacto)
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Secao titulo="Matriz de risco" contexto="Probabilidade × impacto · clique numa célula para filtrar">
        <div className="p-5">
          <div className="grid grid-cols-[20px_repeat(5,1fr)] gap-1">
            {[5, 4, 3, 2, 1].map((p) => [
              <span key={`l${p}`} className="grid place-items-center text-[10px] text-muted-foreground">{p}</span>,
              ...[1, 2, 3, 4, 5].map((i) => {
                const n = dados.filter((r) => r.probabilidade === p && r.impacto === i).length
                const [, cor] = nivel(p, i)
                const ativo = celula && celula[0] === p && celula[1] === i
                return <button key={`${p}-${i}`} onClick={() => setCelula(ativo ? null : [p, i])} className={`grid aspect-square place-items-center rounded-md text-sm font-semibold transition-transform hover:scale-105 ${cor} ${n ? '' : 'opacity-35'} ${ativo ? 'ring-2 ring-foreground ring-offset-2 ring-offset-background' : ''}`} aria-label={`Probabilidade ${p}, impacto ${i}: ${n} risco(s)`}>{n || ''}</button>
              }),
            ])}
            <span />{[1, 2, 3, 4, 5].map((i) => <span key={i} className="text-center text-[10px] text-muted-foreground">{i}</span>)}
          </div>
          <p className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>↑ probabilidade</span><span>impacto →</span></p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Botao tamanho="sm" icone={Plus} onClick={() => setForm({ ...VAZIO_RISCO })}>Novo risco</Botao>
            <Botao tamanho="sm" variante="secundario" icone={Sparkles} onClick={async () => { try { setDados(await api.post('/api/seguranca/riscos/sugeridos')); toast('Riscos típicos deste sistema adicionados. Revise cada um.') } catch (e) { toast(e.message, 'erro') } }}>Sugerir riscos deste sistema</Botao>
          </div>
        </div>
      </Secao>
      <Secao titulo="Registro de riscos" contexto={`${lista.length} risco(s)${celula ? ` · probabilidade ${celula[0]}, impacto ${celula[1]}` : ''} · ISO 27005 e cláusula 6.1`}>
        {!lista.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum risco aqui. Comece pelos riscos sugeridos.</p>}
        <ul className="divide-y divide-border">
          {lista.map((r) => {
            const [n, cor] = nivel(r.probabilidade, r.impacto)
            return (
              <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-0.5 w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${cor}`}>{n} {r.probabilidade * r.impacto}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-xs text-muted-foreground">{[r.ativo, r.ameaca].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-xs"><span className={r.tratamento === 'pendente' ? 'text-red-600' : 'text-muted-foreground'}>{TRATAMENTOS.find(([k]) => k === r.tratamento)?.[1]}</span>{r.controles?.length ? <span className="text-muted-foreground"> · controles {r.controles.map((c) => `A.${c}`).join(', ')}</span> : null}{r.responsavel && <span className="text-muted-foreground"> · {r.responsavel}</span>}</p>
                  {r.plano && <p className="mt-1 text-xs text-muted-foreground">{r.plano}</p>}
                </div>
                <button onClick={() => setForm({ ...r, controlesTexto: (r.controles || []).join(', ') })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar risco"><Pencil className="h-4 w-4" /></button>
                <button onClick={async () => { if (window.confirm(`Apagar o risco “${r.titulo}”?`)) setDados(await api.del(`/api/seguranca/riscos/${r.id}`)) }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Apagar risco"><Trash2 className="h-4 w-4" /></button>
              </li>
            )
          })}
        </ul>
      </Secao>
      <Modal aberto={!!form} titulo={form?.id ? 'Editar risco' : 'Novo risco'} onFechar={() => setForm(null)} largura="max-w-xl">
        {form && (
          <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="rotulo">Risco</span><input className="campo" required minLength={3} maxLength={140} value={form.titulo} onChange={(e) => setForm((x) => ({ ...x, titulo: e.target.value }))} /></label>
            <label><span className="rotulo">Ativo afetado</span><input className="campo" maxLength={120} value={form.ativo} onChange={(e) => setForm((x) => ({ ...x, ativo: e.target.value }))} /></label>
            <label><span className="rotulo">Ameaça</span><input className="campo" maxLength={200} value={form.ameaca} onChange={(e) => setForm((x) => ({ ...x, ameaca: e.target.value }))} /></label>
            {[['probabilidade', 'Probabilidade'], ['impacto', 'Impacto']].map(([k, r]) => <label key={k}><span className="rotulo">{r} · {form[k]}</span><input type="range" min={1} max={5} value={form[k]} onChange={(e) => setForm((x) => ({ ...x, [k]: Number(e.target.value) }))} className="w-full accent-[hsl(var(--primary))]" /></label>)}
            <label><span className="rotulo">Tratamento</span><select className="campo" value={form.tratamento} onChange={(e) => setForm((x) => ({ ...x, tratamento: e.target.value }))}>{TRATAMENTOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
            <label><span className="rotulo">Controles do Anexo A</span><input className="campo font-mono" value={form.controlesTexto ?? form.controles.join(', ')} onChange={(e) => setForm((x) => ({ ...x, controlesTexto: e.target.value }))} placeholder="5.17, 8.5" /></label>
            <label className="sm:col-span-2"><span className="rotulo">Responsável</span><input className="campo" maxLength={80} value={form.responsavel} onChange={(e) => setForm((x) => ({ ...x, responsavel: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="rotulo">Plano de tratamento</span><textarea className="campo h-20 py-2" maxLength={600} value={form.plano} onChange={(e) => setForm((x) => ({ ...x, plano: e.target.value }))} /></label>
            <div className="flex justify-end gap-2 sm:col-span-2"><Botao type="button" variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- Incidentes (ISO 27035, controles 5.24 a 5.28)
const SEV = { baixa: 'bg-zinc-400', media: 'bg-amber-500', alta: 'bg-orange-500', critica: 'bg-red-600' }
const PASSOS = [['Detectar e registrar', 'Abra o incidente aqui com o que se sabe: quando, onde, o que foi visto.'], ['Conter', 'Bloqueie o IP ou a faixa, ligue o escudo, desative a conta afetada, troque a senha ou a chave exposta.'],
  ['Erradicar e recuperar', 'Remova a causa, restaure do backup se preciso e confira os selos de integridade.'], ['Comunicar', 'Havendo dado pessoal envolvido com risco relevante, comunique a ANPD e os titulares em prazo razoável (LGPD, art. 48).'],
  ['Aprender', 'Ao resolver, registre as lições e as ações corretivas para não se repetir.']]
const VAZIO_INC = { titulo: '', severidade: 'media', status: 'aberto', descricao: '', acoes: '', licoes: '', dados_pessoais: false, anpd_comunicada: false, ip: '' }

export function Incidentes() {
  const toast = useToast()
  const { dados, setDados } = useDados(() => api.get('/api/seguranca/incidentes'))
  const [form, setForm] = useState(null)
  if (!dados) return <Esqueleto className="h-96" />
  const atualizar = (itens) => setDados((d) => ({ ...d, itens }))
  const salvar = async (e) => {
    e.preventDefault()
    const { id, ...resto } = form
    const corpo = Object.fromEntries(Object.entries(resto).filter(([k]) => k in VAZIO_INC))
    try { atualizar(id ? await api.put(`/api/seguranca/incidentes/${id}`, corpo) : await api.post('/api/seguranca/incidentes', corpo)); setForm(null); toast('Incidente salvo.') } catch (err) { toast(err.message, 'erro') }
  }
  const abertos = dados.itens.filter((i) => i.status !== 'resolvido')
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Secao titulo="Incidentes de segurança" contexto={`${abertos.length} em aberto · ${dados.itens.length} no total`} acao={<Botao tamanho="sm" icone={Plus} onClick={() => setForm({ ...VAZIO_INC })}>Registrar incidente</Botao>}>
        {!dados.itens.length && <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum incidente registrado. Quando algo acontecer, registre aqui para ter o histórico e cumprir a LGPD.</p>}
        <ul className="divide-y divide-border">
          {dados.itens.map((i) => (
            <li key={i.id} className="px-5 py-3">
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${SEV[i.severidade]}`} title={`Severidade ${i.severidade}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{i.titulo}</p>
                  <p className="text-xs text-muted-foreground">Aberto {dataHora(i.aberto_em)}{i.por ? ` por ${i.por}` : ''} · {i.status === 'resolvido' ? `resolvido em ${Math.max(1, Math.round((i.resolvido_em - i.aberto_em) / 3600))} h` : i.status}{i.ip ? ` · IP ${i.ip}` : ''}</p>
                  {i.dados_pessoais && <p className={`mt-1 text-xs font-medium ${i.anpd_comunicada ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>{i.anpd_comunicada ? 'Dado pessoal envolvido · ANPD comunicada' : 'Dado pessoal envolvido · avalie comunicar a ANPD e os titulares'}</p>}
                  {i.linha?.length > 0 && <ol className="mt-2 space-y-0.5 border-l border-border pl-3 text-[11px] text-muted-foreground">{i.linha.slice(-4).map((l, k) => <li key={k}>{dataHora(l.em)} · {l.texto}</li>)}</ol>}
                </div>
                <button onClick={() => setForm({ ...VAZIO_INC, ...i })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Editar incidente"><Pencil className="h-4 w-4" /></button>
                <button onClick={async () => { if (window.confirm(`Apagar o incidente “${i.titulo}”? O histórico some junto.`)) atualizar(await api.del(`/api/seguranca/incidentes/${i.id}`)) }} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Apagar incidente"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </Secao>
      <Secao titulo="Plano de resposta" contexto={dados.plano?.responsavel ? `Responsável: ${dados.plano.responsavel}` : 'Defina o responsável em Conformidade → Escopo e responsável'}>
        <ol className="space-y-3 p-5">{PASSOS.map(([t, d], k) => <li key={t} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{k + 1}</span><span><span className="block text-sm font-medium">{t}</span><span className="block text-xs text-muted-foreground">{d}</span></span></li>)}</ol>
      </Secao>
      <Modal aberto={!!form} titulo={form?.id ? 'Editar incidente' : 'Registrar incidente'} onFechar={() => setForm(null)} largura="max-w-xl">
        {form && (
          <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="rotulo">O que aconteceu</span><input className="campo" required minLength={3} maxLength={140} value={form.titulo} onChange={(e) => setForm((x) => ({ ...x, titulo: e.target.value }))} /></label>
            <label><span className="rotulo">Severidade</span><select className="campo" value={form.severidade} onChange={(e) => setForm((x) => ({ ...x, severidade: e.target.value }))}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
            <label><span className="rotulo">Situação</span><select className="campo" value={form.status} onChange={(e) => setForm((x) => ({ ...x, status: e.target.value }))}><option value="aberto">Aberto</option><option value="contido">Contido</option><option value="resolvido">Resolvido</option></select></label>
            <label className="sm:col-span-2"><span className="rotulo">IP envolvido (opcional)</span><input className="campo font-mono" maxLength={60} value={form.ip} onChange={(e) => setForm((x) => ({ ...x, ip: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="rotulo">Descrição</span><textarea className="campo h-20 py-2" maxLength={2000} value={form.descricao} onChange={(e) => setForm((x) => ({ ...x, descricao: e.target.value }))} /></label>
            <label className="sm:col-span-2"><span className="rotulo">Ações tomadas e corretivas</span><textarea className="campo h-20 py-2" maxLength={2000} value={form.acoes} onChange={(e) => setForm((x) => ({ ...x, acoes: e.target.value }))} /></label>
            {form.status === 'resolvido' && <label className="sm:col-span-2"><span className="rotulo">Lições aprendidas</span><textarea className="campo h-20 py-2" maxLength={2000} value={form.licoes} onChange={(e) => setForm((x) => ({ ...x, licoes: e.target.value }))} /></label>}
            <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">Envolve dado pessoal<Interruptor ligado={form.dados_pessoais} onChange={(v) => setForm((x) => ({ ...x, dados_pessoais: v }))} rotulo="Dado pessoal" /></label>
            {form.dados_pessoais && <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">ANPD comunicada<Interruptor ligado={form.anpd_comunicada} onChange={(v) => setForm((x) => ({ ...x, anpd_comunicada: v }))} rotulo="ANPD comunicada" /></label>}
            <div className="flex justify-end gap-2 sm:col-span-2"><Botao type="button" variante="secundario" onClick={() => setForm(null)}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------- Revisão de acessos (5.15 a 5.18)
export function Acessos() {
  const toast = useToast()
  const { dados, setDados } = useDados(() => api.get('/api/seguranca/acessos'))
  const [nota, setNota] = useState('')
  if (!dados) return <Esqueleto className="h-96" />
  const comAlerta = dados.itens.filter((u) => u.alertas.length)
  const concluir = async () => { try { const revisoes = await api.post('/api/seguranca/acessos/revisao', { nota }); setDados((d) => ({ ...d, revisoes })); setNota(''); toast('Revisão registrada.') } catch (e) { toast(e.message, 'erro') } }
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Secao titulo="Contas e privilégios" contexto={`${dados.itens.length} conta(s) · ${comAlerta.length} com ponto de atenção`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-5 py-2 font-medium">Conta</th><th className="px-3 py-2 font-medium">Papel</th><th className="px-3 py-2 font-medium">Duas etapas</th><th className="px-3 py-2 font-medium">Último login</th><th className="px-5 py-2 font-medium">Atenção</th></tr></thead>
            <tbody className="divide-y divide-border">
              {dados.itens.map((u) => (
                <tr key={u.id} className={u.ativo ? '' : 'opacity-50'}>
                  <td className="px-5 py-2.5"><p className="font-medium">{u.nome || u.email}</p>{u.nome && <p className="text-xs text-muted-foreground">{u.email}</p>}</td>
                  <td className="px-3 py-2.5 capitalize">{u.papel}{!u.ativo && <span className="ml-1 text-xs">(inativa)</span>}</td>
                  <td className="px-3 py-2.5">{u.duas_etapas ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><Fingerprint className="h-3.5 w-3.5" />Sim</span> : <span className="text-xs text-muted-foreground">Não</span>}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.ultimo_login ? haQuanto(u.ultimo_login) : 'nunca'}</td>
                  <td className="px-5 py-2.5">{u.alertas.length ? u.alertas.map((a) => <span key={a} className="mr-1 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300"><UserX className="h-3 w-3" />{a}</span>) : <span className="text-xs text-muted-foreground">ok</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>
      <Secao titulo="Revisão periódica" contexto="ISO 27001 A.5.18 · recomendado a cada 90 dias">
        <div className="space-y-3 p-5">
          <p className="text-xs text-muted-foreground">Confira se cada pessoa ainda precisa do acesso que tem, desative quem saiu e cobre duas etapas de quem administra. Depois registre a revisão.</p>
          <textarea className="campo h-20 py-2" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={600} placeholder="Ex.: Desativado o acesso do estagiário; todos os admins com 2FA." />
          <Botao icone={ClipboardCheck} onClick={concluir} className="w-full">Registrar revisão concluída</Botao>
          <ul className="divide-y divide-border text-xs">{dados.revisoes.map((r) => <li key={r.em} className="py-2"><p className="font-medium">{dataHora(r.em)} · {r.contas} conta(s)</p><p className="text-muted-foreground">{r.por}{r.nota ? ` · ${r.nota}` : ''}</p></li>)}</ul>
          {!dados.revisoes.length && <p className="text-xs text-amber-600">Nenhuma revisão registrada ainda.</p>}
        </div>
      </Secao>
    </div>
  )
}

// ---------------------------------------------------------------- Testes ao vivo (cabeçalhos, TLS, exposição, CORS)
// Lote de mais de mil testes (no agente): anel de progresso, grade com um quadrado por teste acendendo, últimos resultados
// passando e barras por categoria. A tela pergunta o progresso a cada 0,8 s enquanto roda.
function TesteLote() {
  const toast = useToast()
  const [d, setD] = useState(null)
  const [completo, setCompleto] = useState(null)
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const carregar = async (full = false) => { const r = await api.get(`/api/seguranca/testes/lote${full ? '?completo=true' : ''}`); setD(r); if (full) setCompleto(r.resultado?.resultados || null); return r }
  useEffect(() => { carregar(true).catch(() => {}) }, [])
  useEffect(() => {
    if (!d?.progresso?.rodando) return undefined
    const t = setInterval(async () => { const r = await carregar().catch(() => null); if (r && !r.progresso.rodando) { clearInterval(t); carregar(true); toast(`Testes concluídos: ${r.resultado?.ok}/${r.resultado?.total} aprovados.`) } }, 800)
    return () => clearInterval(t)
  }, [d?.progresso?.rodando])   // eslint-disable-line react-hooks/exhaustive-deps
  const iniciar = async () => { try { const r = await api.post('/api/seguranca/testes/lote'); setCompleto(null); setD((x) => ({ ...(x || {}), progresso: { rodando: true, total: r.total, feitos: 0, falhas: 0, ultimos: [] } })) } catch (e) { toast(e.message, 'erro') } }
  if (!d) return <Esqueleto className="h-64" />
  const p = d.progresso || {}, res = d.resultado
  const total = p.rodando ? p.total : res?.total || 0, feitos = p.rodando ? p.feitos : res?.total || 0
  const pct = total ? Math.round(feitos / total * 100) : 0
  const lista = (completo || []).filter((r) => (!cat || r.cat === cat) && (!busca || r.nome.toLowerCase().includes(busca.toLowerCase())))
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90"><circle cx="50" cy="50" r="44" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <motion.circle cx="50" cy="50" r="44" fill="none" stroke={p.rodando ? 'hsl(var(--primary))' : res && res.ok === res.total ? '#10b981' : '#f59e0b'} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={276.5} initial={false} animate={{ strokeDashoffset: 276.5 * (1 - pct / 100) }} transition={{ duration: 0.6 }} /></svg>
          <div className="absolute inset-0 grid place-items-center text-center"><div><p className="text-xl font-semibold tabular">{p.rodando ? `${pct}%` : res ? `${Math.round(res.ok / res.total * 100)}%` : '—'}</p><p className="text-[10px] text-muted-foreground">{p.rodando ? 'testando' : res ? 'aprovados' : 'sem teste'}</p></div></div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Testes em lote: {total || 'mais de mil'} verificações reais</p>
          <p className="text-sm text-muted-foreground">Arquivos expostos, cabeçalhos em cada página, API sem login e com token falso, métodos HTTP, CORS, mensagens de erro, TLS, DNS e e-mail, cookies. Rodam no agente, 16 por vez, contra os próprios domínios.</p>
          {res && !p.rodando && <p className="mt-1 text-xs text-muted-foreground">Último lote: {res.ok}/{res.total} aprovados em {res.duracao_s} s · {new Date(res.em * 1000).toLocaleString('pt-BR')}</p>}
          {p.rodando && <p className="mt-1 text-xs tabular text-muted-foreground">{feitos} de {total} · {p.falhas} falha(s) até agora</p>}
        </div>
        <Botao icone={Play} carregando={!!p.rodando} onClick={iniciar}>{p.rodando ? 'Testando…' : 'Rodar todos os testes'}</Botao>
      </div>
      {p.erro && !p.rodando && <div className="mt-4"><Aviso>{p.erro}</Aviso></div>}
      {total > 0 && (
        <div className="mt-5 flex flex-wrap gap-[3px]" aria-label={`${feitos} de ${total} testes`}>
          {Array.from({ length: total }, (_, i) => {
            const r = completo?.[i]
            const feito = p.rodando ? i < feitos : true
            const cor = !feito ? 'bg-muted' : r ? (r.ok ? 'bg-emerald-500' : 'bg-red-500') : 'bg-primary/70'
            return <motion.span key={i} title={r ? `${r.nome}: ${r.det}` : undefined} className={`h-2.5 w-2.5 rounded-[2px] ${cor}`} initial={false} animate={{ scale: feito ? [1.6, 1] : 1 }} transition={{ duration: 0.35 }} />
          })}
        </div>
      )}
      {p.rodando && p.ultimos?.length > 0 && (
        <ul className="mt-4 max-h-40 overflow-hidden text-xs">{[...p.ultimos].reverse().slice(0, 8).map((u) => (
          <motion.li key={u.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 py-0.5">
            {u.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-red-600" />}<span className="truncate">{u.nome}</span><span className="ml-auto shrink-0 text-muted-foreground">{u.det}</span></motion.li>))}
        </ul>
      )}
      {res?.categorias && !p.rodando && (
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(res.categorias).map(([c, v]) => (
          <button key={c} onClick={() => setCat(cat === c ? '' : c)} className={`rounded-md border p-3 text-left ${cat === c ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
            <div className="flex items-center justify-between text-sm"><span className="font-medium">{c}</span><span className="tabular text-muted-foreground">{v.ok}/{v.total}</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={v.ok === v.total ? 'h-full bg-emerald-500' : 'h-full bg-amber-500'} initial={{ width: 0 }} animate={{ width: `${v.ok / v.total * 100}%` }} transition={{ duration: 0.8 }} /></div>
          </button>))}
        </div>
      )}
      {completo && !p.rodando && (
        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" /><input className="campo h-8 w-64 pl-8 text-sm" placeholder="Buscar teste" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
            <span className="text-xs text-muted-foreground">{lista.length} teste(s){cat ? ` em ${cat}` : ''} · falhas primeiro</span>
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-auto rounded-md border border-border text-xs">{[...lista].sort((a, b) => a.ok - b.ok).slice(0, 400).map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">{r.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
              <span className="min-w-0 flex-1 truncate">{r.nome}</span><span className="shrink-0 text-muted-foreground">{r.det}</span></li>))}
          </ul>
        </div>
      )}
    </section>
  )
}

export function TestesAoVivo() {
  const toast = useToast()
  const { dados, setDados } = useDados(() => api.get('/api/seguranca/testes'))
  const [rodando, setRodando] = useState(false)
  const rodar = async () => { setRodando(true); try { setDados(await api.post('/api/seguranca/testes')); toast('Testes concluídos.') } catch (e) { toast(e.message, 'erro') } finally { setRodando(false) } }
  if (!dados) return <Esqueleto className="h-96" />
  return (
    <div className="grid gap-6">
      <TesteLote />
      <section className="cartao flex flex-wrap items-center gap-4 p-5">
        {dados.total ? <Anel nota={Math.round((dados.ok / dados.total) * 100)} /> : <Globe2 className="h-10 w-10 text-muted-foreground" />}
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">Testes de fora para dentro</p>
          <p className="text-xs text-muted-foreground">{dados.em ? `Última rodada ${dataHora(dados.em)} · ${dados.ok} de ${dados.total} aprovados.` : 'Ainda não rodou.'} O servidor acessa os próprios domínios como um visitante faria e confere HTTPS, certificado, cabeçalhos, arquivos expostos, CORS e security.txt. Nada é alterado.</p></div>
        <Botao icone={rodando ? RefreshCw : Play} carregando={rodando} onClick={rodar}>Rodar agora</Botao>
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {Object.entries(dados.hosts || {}).map(([host, itens]) => (
          <Secao key={host} titulo={host} contexto={`${itens.filter((x) => x.ok).length}/${itens.length} aprovados`}>
            <ul className="divide-y divide-border">
              {itens.map((x) => (
                <li key={x.id} className="flex gap-3 px-5 py-2.5">
                  {x.ok ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
                  <span className="min-w-0"><span className="block text-sm font-medium">{x.teste}</span><span className="block break-all font-mono text-[11px] text-muted-foreground">{x.detalhe}</span></span>
                </li>
              ))}
            </ul>
          </Secao>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Integridade dos registros (5.28, 5.33, 8.15)
export function Integridade() {
  const toast = useToast()
  const { dados, setDados } = useDados(() => api.get('/api/seguranca/integridade'))
  const [selando, setSelando] = useState(false)
  if (!dados) return <Esqueleto className="h-80" />
  const selar = async () => { setSelando(true); try { setDados(await api.post('/api/seguranca/integridade/selar')); toast('Registros selados e conferidos.') } catch (e) { toast(e.message, 'erro') } finally { setSelando(false) } }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Secao titulo="Selos de integridade" contexto="Cadeia de hashes SHA-256 por dia sobre a atividade e os eventos de segurança">
        <div className="space-y-4 p-5">
          <div className={`flex items-center gap-3 rounded-lg border p-4 ${dados.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
            {dados.ok ? <ShieldCheck className="h-8 w-8 text-emerald-500" /> : <AlertTriangle className="h-8 w-8 text-red-500" />}
            <div><p className="text-sm font-semibold">{dados.ok ? 'Nenhum registro alterado' : `${dados.problemas.length} alteração(ões) encontrada(s)`}</p>
              <p className="text-xs text-muted-foreground">{dados.selos} dia(s) selado(s) · {dados.conferidos} conferido(s) agora{dados.ultimo ? ` · último selo do dia ${new Date(dados.ultimo.dia * 1000).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}` : ''}</p></div>
          </div>
          {dados.problemas.map((p, k) => <p key={k} className="flex items-center gap-2 text-sm text-red-600"><XCircle className="h-4 w-4" />{new Date(p.dia * 1000).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}: {p.motivo}</p>)}
          {dados.removidos.length > 0 && <p className="text-xs text-muted-foreground">{dados.removidos.length} dia(s) com registros apagados pela rotina de retenção (esperado).</p>}
          {dados.ultimo && <p className="flex items-start gap-2 break-all font-mono text-[11px] text-muted-foreground"><Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{dados.ultimo.selo}</p>}
          <Botao icone={Lock} carregando={selando} onClick={selar}>Selar dias pendentes e conferir</Botao>
        </div>
      </Secao>
      <Secao titulo="Como funciona" contexto="Evidência que resiste a adulteração">
        <ul className="space-y-2 p-5 text-xs text-muted-foreground">
          <li>Cada dia fechado vira um resumo SHA-256 de todas as linhas de atividade e de eventos de segurança.</li>
          <li>O selo de um dia inclui o selo do dia anterior: mudar ou apagar uma linha antiga quebra a cadeia dali em diante.</li>
          <li>Ao abrir esta aba os dias novos são selados e os últimos 90 são conferidos de novo.</li>
          <li>Linhas apagadas pela retenção configurada aparecem separadas, sem alarme.</li>
        </ul>
      </Secao>
    </div>
  )
}
