import { useMemo, useState } from 'react'
import { Bot, Bug, Copy, Radar, Search, Trash2 } from 'lucide-react'
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
  const { dados, erro, recarregar } = useDados(() => api.get('/api/bugs'))
  const [aba, setAba] = useState('abertos')
  const [q, setQ] = useState('')
  const [relatar, setRelatar] = useState(false)
  const [aberto, setAberto] = useState(null)
  const [varrendo, setVarrendo] = useState(false)
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (dados?.itens || []).filter((b) => {
      const ab = ['aberto', 'analisando'].includes(b.estado)
      if (aba === 'abertos' && !ab) return false
      if (aba === 'sistema' && (b.origem !== 'sistema' || !ab)) return false
      if (aba === 'usuarios' && (b.origem !== 'usuario' || !ab)) return false
      if (aba === 'fechados' && ab) return false
      return !t || `${b.titulo} ${b.descricao} ${b.pagina}`.toLowerCase().includes(t)
    })
  }, [dados, aba, q])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const itens = dados.itens
  const abertos = itens.filter((b) => ['aberto', 'analisando'].includes(b.estado))
  const varrer = async () => {
    setVarrendo(true)
    try { const r = await api.post('/api/bugs/varrer'); toast(r.achados ? `${r.achados} ponto(s) encontrados ou atualizados.` : 'Nada novo encontrado.'); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setVarrendo(false) }
  }
  return (
    <div className="w-full">
      <Cabecalho titulo="Bugs" descricao="Relate o que não funciona. O sistema também procura problemas nele mesmo, sugere a correção e gera o prompt para a IA corrigir."
        acoes={<>
          {dados.gestor && <Botao variante="secundario" icone={Radar} carregando={varrendo} onClick={varrer}>Procurar bugs agora</Botao>}
          <Botao icone={Bug} onClick={() => setRelatar(true)}>Relatar bug</Botao>
        </>} />
      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Abertos', valor: abertos.length, tom: abertos.length ? 'ruim' : 'bom', dica: `${abertos.filter((b) => ['alta', 'critica'].includes(b.gravidade)).length} de gravidade alta ou crítica` },
          { rotulo: 'Encontrados pelo sistema', valor: abertos.filter((b) => b.origem === 'sistema').length, dica: dados.ultima_varredura ? `última procura ${haQuanto(dados.ultima_varredura)}` : 'procura de hora em hora' },
          { rotulo: 'Relatados', valor: abertos.filter((b) => b.origem === 'usuario').length, dica: 'por quem usa' },
          { rotulo: 'Corrigidos', valor: itens.filter((b) => b.estado === 'corrigido').length, dica: 'no histórico' },
        ]} />
      </div>
      <section className="cartao overflow-hidden">
        <div className="space-y-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" role="tablist">
            {ABAS.map(([k, r]) => <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`rounded-md px-3 py-1.5 text-sm ${aba === k ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>)} {/* marca: aba ativa flutua */}
          </div>
          <label className="relative block max-w-sm"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input className="campo h-9 pl-9" type="search" name="busca-bugs" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no título, descrição ou tela" aria-label="Buscar bugs" /></label>
        </div>
        {lista.length === 0 ? <div className="p-4"><Vazio icone={Bug} titulo="Nenhum bug aqui" texto={aba === 'abertos' ? 'Nada aberto. Encontrou algo estranho? Relate.' : 'Nada nesta aba.'} /></div> : (
          <ul className="divide-y divide-border">
            {lista.map((b) => {
              const [g, cor] = GRAV[b.gravidade] || GRAV.media
              return (
                <li key={b.id}>
                  <button onClick={() => setAberto(b)} className="flex w-full flex-wrap items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
                    <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${cor}`}>{g}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{b.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{b.origem === 'sistema' ? 'Sistema' : b.autor_nome} · {b.pagina || 'sem tela'} · {b.ocorrencias}× · {ESTADOS.find(([k]) => k === b.estado)?.[1]}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{haQuanto(b.atualizado_em)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {relatar && <Relatar aoFechar={() => setRelatar(false)} aoSalvar={() => { setRelatar(false); recarregar() }} />}
      {aberto && <Detalhe b={aberto} gestor={dados.gestor} aoFechar={() => setAberto(null)} aoMudar={() => { setAberto(null); recarregar() }} />}
    </div>
  )
}
