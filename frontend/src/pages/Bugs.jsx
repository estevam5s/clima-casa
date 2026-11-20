import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Bot, Bug, Check, CircleAlert, Copy, FlaskConical, Radar, Search, Trash2, X } from 'lucide-react'
import { api, haQuanto } from '../api'
import { errosRecentes } from '../errosTela'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, confirmar, useDados, useToast } from '../components/ui'

// Bugs: quem usa relata (o sistema anexa a página, o navegador e os últimos erros da tela) e o próprio sistema encontra
// (erros nas telas, erros 500 no servidor, falhas repetidas, rotas sem regra, agente parado). Cada bug tem sugestão de
// correção e um prompt pronto para a IA (clima-ia no terminal ou Claude Code).
const GRAV = { critica: ['Crítica', 'bg-red-600 text-white'], alta: ['Alta', 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'],
  media: ['Média', 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'], baixa: ['Baixa', 'bg-muted text-muted-foreground'] }
const ESTADOS = [['aberto', 'Aberto'], ['analisando', 'Analisando'], ['corrigido', 'Corrigido'], ['descartado', 'Descartado']]
const ABAS = [['abertos', 'Abertos'], ['sistema', 'Encontrados pelo sistema'], ['usuarios', 'Relatados'], ['fechados', 'Corrigidos e descartados']]
const CATEGORIAS = { cadastro: 'Cadastros', tela: 'Telas', servidor: 'Servidor', atividade: 'Comandos', agente: 'Agente', transmissor: 'Transmissores', 'segurança': 'Segurança' }
const COR_GRAV = { critica: 'bg-red-600', alta: 'bg-red-400', media: 'bg-amber-400', baixa: 'bg-zinc-400' }
// o que a procura confere (mostrado passo a passo enquanto roda)
const PASSOS_VARREDURA = ['Falhas repetidas nos comandos (24 h)', 'Pedidos com erro na fila do agente', 'Rotas que mudam dados sem regra de permissão',
  'Agente no escritório e transmissores', 'Cadastros: ares, salas, transmissores, botões, Alexa e zonas']

// Radar enquanto o sistema procura: cada conferência acende em sequência
function Varredura({ rodando, resultado }) {
  const reduzir = useReducedMotion()
  if (!rodando && !resultado) return null
  return (
    <motion.section initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="cartao mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-28 w-28 shrink-0" aria-hidden>
        <div className="absolute inset-0 rounded-full border border-primary/30" />
        <div className="absolute inset-4 rounded-full border border-primary/20" />
        <div className="absolute inset-9 rounded-full border border-primary/15" />
        {rodando && !reduzir && <motion.div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, hsl(var(--primary) / 0.35), transparent 30%)' }}
          animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }} />}
        <div className="absolute inset-0 flex items-center justify-center">{rodando ? <Radar className="h-6 w-6 text-primary" /> : <Check className="h-7 w-7 text-emerald-600" />}</div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{rodando ? 'Procurando problemas no sistema…' : resultado.achados ? `${resultado.achados} ponto(s) encontrados ou atualizados` : 'Procura concluída: nada novo'}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {PASSOS_VARREDURA.map((p, i) => (
            <motion.li key={p} className="flex items-center gap-2" initial={{ opacity: 0.35 }} animate={{ opacity: 1 }} transition={{ delay: reduzir ? 0 : (rodando ? i * 0.45 : 0) }}>
              <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: reduzir ? 0 : (rodando ? i * 0.45 + 0.2 : 0) }}>
                {rodando ? <span className="block h-2 w-2 rounded-full bg-primary/60" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </motion.span>
              <span className={rodando ? 'text-muted-foreground' : ''}>{p}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.section>
  )
}

// Autoteste: cadastra sala, transmissor, ar e botão numa transação desfeita e mostra cada passo
function Autoteste({ ultimo, aoTerminar }) {
  const toast = useToast()
  const reduzir = useReducedMotion()
  const [rodando, setRodando] = useState(false)
  const [r, setR] = useState(ultimo)
  const rodar = async () => {
    setRodando(true)
    try { const x = await api.post('/api/bugs/autoteste'); setR(x); const falhas = x.passos.filter((p) => !p.ok).length; toast(falhas ? `${falhas} passo(s) falharam: viraram bugs.` : 'Cadastros funcionando.', falhas ? 'erro' : undefined); aoTerminar() } catch (e) { toast(e.message, 'erro') } finally { setRodando(false) }
  }
  const ok = r?.passos?.filter((p) => p.ok).length || 0
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-primary" />Autoteste dos cadastros</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Cadastra uma sala, um transmissor, um ar e um botão de teste, lê como as telas leem e desfaz tudo. Nada fica gravado.</p>
        </div>
        <Botao variante="secundario" tamanho="sm" icone={FlaskConical} carregando={rodando} onClick={rodar}>Rodar autoteste</Botao>
      </div>
      {r?.passos && (
        <>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-emerald-500" initial={{ width: 0 }} animate={{ width: `${(ok / r.passos.length) * 100}%` }} transition={{ duration: reduzir ? 0 : 0.8 }} /></div>
          <p className="mt-1 text-xs text-muted-foreground">{ok} de {r.passos.length} passos ok · {haQuanto(r.em)}</p>
          <ul className="mt-3 space-y-1.5">
            {r.passos.map((p, i) => (
              <motion.li key={p.nome} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : i * 0.08 }}
                className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${p.ok ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>{p.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1"><span className="block">{p.nome}</span><span className="block truncate text-xs text-muted-foreground" title={p.detalhe}>{p.detalhe} · {p.ms} ms</span></span>
              </motion.li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// Últimos 14 dias: bugs novos por dia (barras) e a gravidade dos abertos (faixa empilhada)
function Panorama({ itens }) {
  const reduzir = useReducedMotion()
  const dias = useMemo(() => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    return Array.from({ length: 14 }, (_, i) => {
      const ini = hoje.getTime() / 1000 - (13 - i) * 86400
      return { ini, n: itens.filter((b) => b.criado_em >= ini && b.criado_em < ini + 86400).length }
    })
  }, [itens])
  const max = Math.max(1, ...dias.map((d) => d.n))
  const abertos = itens.filter((b) => ['aberto', 'analisando'].includes(b.estado))
  return (
    <section className="cartao p-5">
      <h2 className="font-medium">Últimos 14 dias</h2>
      <div className="mt-4 flex h-24 items-end gap-1" role="img" aria-label="Bugs novos por dia nos últimos 14 dias">
        {dias.map((d, i) => (
          <div key={d.ini} className="flex h-full flex-1 flex-col justify-end" title={`${new Date(d.ini * 1000).toLocaleDateString('pt-BR')}: ${d.n}`}>
            <motion.div className={`rounded-t ${d.n ? 'bg-primary' : 'bg-muted'}`} initial={{ height: 0 }} animate={{ height: `${d.n ? Math.max(8, (d.n / max) * 100) : 4}%` }} transition={{ delay: reduzir ? 0 : i * 0.03, duration: reduzir ? 0 : 0.5 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{new Date(dias[0].ini * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span><span>hoje</span></div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">Gravidade dos abertos</p>
      {abertos.length ? (
        <>
          <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-muted">
            {Object.keys(GRAV).map((g) => { const n = abertos.filter((b) => b.gravidade === g).length; return n ? <motion.div key={g} className={COR_GRAV[g]} initial={{ width: 0 }} animate={{ width: `${(n / abertos.length) * 100}%` }} transition={{ duration: reduzir ? 0 : 0.6 }} /> : null })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">{Object.entries(GRAV).map(([g, [r]]) => <span key={g} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${COR_GRAV[g]}`} />{r} {abertos.filter((b) => b.gravidade === g).length}</span>)}</div>
        </>
      ) : <p className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600"><Check className="h-4 w-4" />Nenhum aberto</p>}
    </section>
  )
}

function Relatar({ aoFechar, aoSalvar }) {
  const toast = useToast()
  const [f, setF] = useState({ titulo: '', descricao: '', passos: '', gravidade: 'media', pagina: '' })
  const [salvando, setSalvando] = useState(false)
  const enviar = async (e) => {
    e.preventDefault(); setSalvando(true)
    try {
      await api.post('/api/bugs', { ...f, navegador: navigator.userAgent.slice(0, 300), erros: errosRecentes.slice(0, 10) })
      toast('Bug relatado. Obrigado: ele já tem uma sugestão de correção.'); aoSalvar()
    } catch (err) { toast(err.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <Modal aberto titulo="Relatar um bug" onFechar={aoFechar} largura="max-w-xl">
      <form onSubmit={enviar} className="space-y-3">
        <label className="block"><span className="rotulo">Título</span><input className="campo mt-1" required minLength={4} maxLength={160} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ex.: o botão Desligar não responde no Ar do diretor" /></label>
        <label className="block"><span className="rotulo">O que aconteceu</span><textarea className="campo mt-1 min-h-24" required minLength={4} maxLength={4000} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="O que você esperava e o que apareceu (mensagem de erro, se teve)." /></label>
        <label className="block"><span className="rotulo">Passos para acontecer de novo (opcional)</span><textarea className="campo mt-1 min-h-16" maxLength={3000} value={f.passos} onChange={(e) => setF({ ...f, passos: e.target.value })} placeholder={'1. Abri Aparelhos\n2. Cliquei em…'} /></label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className="rotulo">Tela</span><input className="campo mt-1" maxLength={200} value={f.pagina} onChange={(e) => setF({ ...f, pagina: e.target.value })} placeholder="/aparelhos" /></label>
          <label className="block"><span className="rotulo">Gravidade</span>
            <select className="campo mt-1" value={f.gravidade} onChange={(e) => setF({ ...f, gravidade: e.target.value })}>
              {Object.entries(GRAV).map(([k, [r]]) => <option key={k} value={k}>{r}</option>)}
            </select></label>
        </div>
        <p className="text-xs text-muted-foreground">Vai junto: o navegador e {errosRecentes.length ? `os ${errosRecentes.length} último(s) erro(s) desta visita` : 'nenhum erro registrado nesta visita'}. Nada de senha ou dado pessoal.</p>
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" carregando={salvando}>Enviar</Botao></div>
      </form>
    </Modal>
  )
}

function Detalhe({ b, gestor, aoFechar, aoMudar }) {
  const toast = useToast()
  const copiar = (t, o) => { navigator.clipboard?.writeText(t); toast(`${o} copiado.`) }
  const estado = async (e) => { try { await api.put(`/api/bugs/${b.id}`, { estado: e }); toast('Estado atualizado.'); aoMudar() } catch (err) { toast(err.message, 'erro') } }
  const apagar = async () => {
    if (!(await confirmar(`Apagar o bug "${b.titulo}"?`, { ok: 'Apagar' }))) return
    try { await api.del(`/api/bugs/${b.id}`); aoFechar(); aoMudar() } catch (err) { toast(err.message, 'erro') }
  }
  const [g, cor] = GRAV[b.gravidade] || GRAV.media
  return (
    <Modal aberto titulo={b.titulo} onFechar={aoFechar} largura="max-w-3xl">
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-1.5 py-0.5 font-medium ${cor}`}>{g}</span>
          <span className="rounded bg-muted px-1.5 py-0.5">{b.origem === 'sistema' ? 'Encontrado pelo sistema' : `Relatado por ${b.autor_nome || 'usuário'}`}</span>
          {b.pagina && <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{b.pagina}</span>}
          <span className="text-muted-foreground">{b.ocorrencias}× · última {haQuanto(b.atualizado_em)}</span>
        </div>
        <p className="whitespace-pre-line">{b.descricao}</p>
        {b.passos && <div><p className="rotulo">Passos</p><p className="whitespace-pre-line text-muted-foreground">{b.passos}</p></div>}
        {b.contexto?.erros?.length > 0 && <div><p className="rotulo">Erros registrados</p><ul className="max-h-32 overflow-y-auto rounded bg-muted p-2 font-mono text-xs">{b.contexto.erros.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
        {b.contexto?.correcao && <div className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-3 dark:bg-emerald-950/40"><p className="rotulo text-emerald-800 dark:text-emerald-300">Como foi corrigido</p><p>{b.contexto.correcao}</p></div>}
        <div className="rounded-lg border border-border p-3"><p className="rotulo">Sugestão de correção</p><p>{b.sugestao}</p></div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2"><p className="rotulo flex items-center gap-1.5"><Bot className="h-4 w-4" />Prompt para a IA corrigir</p>
            <Botao tamanho="sm" variante="secundario" icone={Copy} onClick={() => copiar(b.prompt, 'Prompt')}>Copiar</Botao></div>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">{b.prompt}</pre>
          <p className="mt-2 text-xs text-muted-foreground">Cole no terminal: <code>clima-ia</code> (agente de IA do projeto) ou no Claude Code, na pasta do projeto.</p>
        </div>
        {gestor && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Estado</span>
            {ESTADOS.map(([k, r]) => <Botao key={k} tamanho="sm" variante={b.estado === k ? 'primario' : 'secundario'} onClick={() => estado(k)}>{r}</Botao>)}
            <Botao tamanho="sm" variante="fantasma" icone={Trash2} className="ml-auto" onClick={apagar}>Apagar</Botao>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function Bugs() {
  const toast = useToast()
  const reduzir = useReducedMotion()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/bugs'))
  const [aba, setAba] = useState('abertos')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [relatar, setRelatar] = useState(false)
  const [aberto, setAberto] = useState(null)
  const [varrendo, setVarrendo] = useState(false)
  const [resultado, setResultado] = useState(null)
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (dados?.itens || []).filter((b) => {
      const ab = ['aberto', 'analisando'].includes(b.estado)
      if (aba === 'abertos' && !ab) return false
      if (aba === 'sistema' && (b.origem !== 'sistema' || !ab)) return false
      if (aba === 'usuarios' && (b.origem !== 'usuario' || !ab)) return false
      if (aba === 'fechados' && ab) return false
      if (cat && (b.categoria || '') !== cat) return false
      return !t || `${b.titulo} ${b.descricao} ${b.pagina}`.toLowerCase().includes(t)
    })
  }, [dados, aba, q, cat])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const itens = dados.itens
  const abertos = itens.filter((b) => ['aberto', 'analisando'].includes(b.estado))
  const porCat = Object.keys(CATEGORIAS).map((k) => [k, abertos.filter((b) => b.categoria === k).length]).filter(([, n]) => n)
  const varrer = async () => {
    setVarrendo(true); setResultado(null)
    const inicio = Date.now()
    try {
      const r = await api.post('/api/bugs/varrer')
      await new Promise((ok) => setTimeout(ok, Math.max(0, (reduzir ? 0 : 2400) - (Date.now() - inicio))))   // deixa o radar mostrar os passos
      setResultado(r); recarregar()
    } catch (e) { toast(e.message, 'erro') } finally { setVarrendo(false) }
  }
  return (
    <div className="w-full">
      <Cabecalho titulo="Bugs" descricao="Relate o que não funciona. O sistema também procura problemas nele mesmo (telas, servidor, comandos, cadastros de ares e transmissores), sugere a correção e gera o prompt para a IA corrigir."
        acoes={<>
          {dados.gestor && <Botao variante="secundario" icone={Radar} carregando={varrendo} onClick={varrer}>Procurar bugs agora</Botao>}
          <Botao icone={Bug} onClick={() => setRelatar(true)}>Relatar bug</Botao>
        </>} />
      <Varredura rodando={varrendo} resultado={resultado} />
      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Abertos', valor: abertos.length, tom: abertos.length ? 'ruim' : 'bom', dica: `${abertos.filter((b) => ['alta', 'critica'].includes(b.gravidade)).length} de gravidade alta ou crítica` },
          { rotulo: 'Encontrados pelo sistema', valor: abertos.filter((b) => b.origem === 'sistema').length, dica: dados.ultima_varredura ? `última procura ${haQuanto(dados.ultima_varredura)}` : 'procura de hora em hora' },
          { rotulo: 'Relatados', valor: abertos.filter((b) => b.origem === 'usuario').length, dica: 'por quem usa' },
          { rotulo: 'Corrigidos', valor: itens.filter((b) => b.estado === 'corrigido').length, dica: 'no histórico' },
        ]} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="cartao min-w-0 overflow-hidden">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">
              {ABAS.map(([k, r]) => (
                <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`relative rounded-md px-3 py-1.5 text-sm ${aba === k ? 'font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
                  {aba === k && <motion.span layoutId="aba-bugs" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ duration: reduzir ? 0 : 0.2 }} />} {/* marca: aba ativa flutua */}
                  <span className="relative">{r}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block w-full max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input className="campo h-9 pl-9" type="search" name="busca-bugs" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no título, descrição ou tela" aria-label="Buscar bugs" /></label>
              {porCat.length > 0 && (
                <div className="flex flex-wrap gap-1" aria-label="Filtrar por categoria">
                  <button onClick={() => setCat('')} className={`rounded-full border px-2.5 py-1 text-xs ${!cat ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>Todas</button>
                  {porCat.map(([k, n]) => <button key={k} onClick={() => setCat(cat === k ? '' : k)} className={`rounded-full border px-2.5 py-1 text-xs ${cat === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{CATEGORIAS[k]} {n}</button>)}
                </div>
              )}
            </div>
          </div>
          {lista.length === 0 ? <div className="p-4"><Vazio icone={Bug} titulo="Nenhum bug aqui" texto={aba === 'abertos' ? 'Nada aberto. Encontrou algo estranho? Relate.' : 'Nada nesta aba.'} /></div> : (
            <ul className="divide-y divide-border">
              <AnimatePresence initial={!reduzir}>
                {lista.map((b, i) => {
                  const [g, cor] = GRAV[b.gravidade] || GRAV.media
                  return (
                    <motion.li key={b.id} layout={!reduzir} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ delay: reduzir ? 0 : Math.min(i, 12) * 0.03 }}>
                      <button onClick={() => setAberto(b)} className="group flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50">
                        <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${cor}`}>{g}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{b.titulo}</span>
                          <span className="block truncate text-xs text-muted-foreground">{b.origem === 'sistema' ? 'Sistema' : b.autor_nome} · {CATEGORIAS[b.categoria] || b.categoria || 'geral'} · {b.pagina || 'sem tela'} · {b.ocorrencias}× · {ESTADOS.find(([k]) => k === b.estado)?.[1]}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(b.atualizado_em)}</span>
                      </button>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </section>
        <div className="min-w-0 space-y-6">
          <Panorama itens={itens} />
          {dados.gestor && <Autoteste ultimo={dados.autoteste} aoTerminar={recarregar} />}
          <section className="cartao p-5 text-sm">
            <h2 className="flex items-center gap-2 font-medium"><CircleAlert className="h-4 w-4 text-primary" />O que vira bug sozinho</h2>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>Erro de JavaScript em qualquer tela</li>
              <li>Erro 500 no servidor</li>
              <li>Formulário recusado (cadastro de ar, transmissor, cena…)</li>
              <li>Comando que falha 3 vezes ou mais em 24 h</li>
              <li>Cadastro inconsistente: ar sem sala, transmissor sem chave, nomes repetidos na Alexa</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Bloqueio de IP por ataque não é bug: fica na tela Segurança.</p>
          </section>
        </div>
      </div>
      {relatar && <Relatar aoFechar={() => setRelatar(false)} aoSalvar={() => { setRelatar(false); recarregar() }} />}
      {aberto && <Detalhe b={aberto} gestor={dados.gestor} aoFechar={() => setAberto(null)} aoMudar={() => { setAberto(null); recarregar() }} />}
    </div>
  )
}
