import { useEffect, useRef, useState } from 'react'
import { Bot, Check, Copy, KeyRound, SendHorizontal, Terminal, Trash2, X } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import MiniMarkdown from '../components/MiniMarkdown'
import { Aviso, Botao, Cabecalho, Carregando, Interruptor, useDados, useToast } from '../components/ui'

// Assistente de IA (NVIDIA): conversa com acesso aos ares, transmissores, agentes, cenas e atividade, com as permissões
// de quem usa. Comando de UM ar executa na hora; desligar todos e cenas pedem Confirmar. Também mostra como usar o
// mesmo agente no terminal (clima-ia) e, para o dono, a configuração (chave cifrada, modelo, Telegram).
const SUGESTOES = ['Quais ares estão ligados agora?', 'Coloca o ar do diretor em 23 graus', 'Por que os comandos não estão chegando?',
  'Desliga o ar dos devs daqui a 30 minutos', 'Como está o tempo lá fora?', 'Desliga todos os ares']
const GUARDA = 'clima-ia-conversa'

function ler() { try { return JSON.parse(sessionStorage.getItem(GUARDA) || '[]') } catch { return [] } }
function gravar(m) { try { sessionStorage.setItem(GUARDA, JSON.stringify(m.slice(-40))) } catch { /* sem armazenamento */ } }

function Conversa({ ativo }) {
  const toast = useToast()
  const [msgs, setMsgs] = useState(ler)
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const fim = useRef(null)
  useEffect(() => { gravar(msgs); fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs, pensando])
  const enviar = async (q) => {
    const pergunta = (q ?? texto).trim()
    if (!pergunta || pensando) return
    const hist = [...msgs, { role: 'user', content: pergunta }]
    setMsgs(hist); setTexto(''); setPensando(true)
    try {
      const r = await api.post('/api/ia/conversar', { mensagens: hist.filter((m) => m.role === 'user' || m.role === 'assistant').map(({ role, content }) => ({ role, content: content.slice(0, 4000) })).slice(-20) })
      setMsgs([...hist, { role: 'assistant', content: r.texto, acoes: r.acoes, confirmacoes: r.confirmacoes }])
    } catch (e) {
      setMsgs([...hist, { role: 'assistant', content: e.message, erro: true }])
    } finally { setPensando(false) }
  }
  const confirmar = async (i, c) => {
    try {
      const r = await api.post('/api/ia/confirmar', { confirmacao: c.confirmacao })
      setMsgs((m) => m.map((x, j) => j === i ? { ...x, confirmacoes: x.confirmacoes.map((y) => y === c ? { ...y, feito: r.texto } : y) } : x))
      toast(r.texto)
    } catch (e) { toast(e.message, 'erro') }
  }
  const cancelar = (i, c) => setMsgs((m) => m.map((x, j) => j === i ? { ...x, confirmacoes: x.confirmacoes.map((y) => y === c ? { ...y, feito: 'Cancelado.' } : y) } : x))
  return (
    <section className="cartao flex h-[calc(100vh-15rem)] min-h-[28rem] flex-col overflow-hidden">
      <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-xl py-6 text-center">
            <Bot className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-2 font-medium">Pergunte ou peça em português</p>
            <p className="mt-1 text-sm text-muted-foreground">Ele vê o estado real dos ares, transmissores e do agente, e só faz o que o seu usuário pode fazer.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} disabled={!ativo} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[min(42rem,92%)] rounded-2xl px-4 py-2.5 ${m.role === 'user' ? 'bg-primary text-primary-foreground' : m.erro ? 'border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200' : 'bg-muted'}`}>
              {m.role === 'user' ? <p className="whitespace-pre-wrap text-sm">{m.content}</p> : <MiniMarkdown texto={m.content} />}
              {(m.acoes || []).length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-xs">
                  {m.acoes.map((a, j) => <li key={j} className={a.ok === false ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
                    {a.ok === false ? `Não foi: ${a.ar || ''} ${a.erro || ''}` : a.ferramenta === 'temporizador' ? `Temporizador: ${a.ar} vai ${a.acao} em ${a.em_minutos} min` : `Enviado: ${a.ar} ${a.ligado ? `ligado · ${a.modo} ${a.temperatura}° · ventilação ${String(a.ventilacao || '').toLowerCase()}` : 'desligado'}${a.mudaram_junto?.length ? ` (mudou junto: ${a.mudaram_junto.join(', ')})` : ''}`}
                  </li>)}
                </ul>
              )}
              {(m.confirmacoes || []).map((c, j) => (
                <div key={j} className="mt-2 rounded-lg border border-amber-400/60 bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-medium">{c.descricao}</p>
                  {c.feito ? <p className="mt-1">{c.feito}</p> : (
                    <div className="mt-2 flex gap-2">
                      <Botao tamanho="sm" icone={Check} onClick={() => confirmar(i, c)}>Confirmar</Botao>
                      <Botao tamanho="sm" variante="secundario" icone={X} onClick={() => cancelar(i, c)}>Cancelar</Botao>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {pensando && <div className="flex justify-start"><div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">Consultando o sistema…</div></div>}
        <div ref={fim} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); enviar() }} className="flex items-end gap-2 border-t border-border p-3">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={1} maxLength={4000} disabled={!ativo}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
          placeholder={ativo ? 'Ex.: liga o ar do Deison em 22 graus, ventilação alta' : 'O assistente está desligado ou sem chave'} aria-label="Mensagem para a IA"
          className="campo max-h-40 min-h-10 flex-1 resize-y py-2" />
        {msgs.length > 0 && <Botao type="button" variante="fantasma" icone={Trash2} onClick={() => setMsgs([])} aria-label="Limpar a conversa" title="Limpar a conversa" />}
        <Botao type="submit" icone={SendHorizontal} carregando={pensando} disabled={!texto.trim() || !ativo}>Enviar</Botao>
      </form>
    </section>
  )
}

function Lateral({ dados, dono, recarregar }) {
  const toast = useToast()
  const [chave, setChave] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvar = async (extra) => {
    setSalvando(true)
    try { await api.put('/api/ia/config', extra); setChave(''); toast('Configuração salva.'); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const copiar = (t) => { navigator.clipboard?.writeText(t); toast('Copiado.') }
  return (
    <div className="space-y-6">
      <section className="cartao p-5">
        <h2 className="titulo-secao flex items-center gap-2"><Terminal className="h-4 w-4" />No terminal (clima-ia)</h2>
        <p className="mt-1 text-sm text-muted-foreground">O mesmo assistente, com acesso também ao código do projeto. Cada ação pede o seu "s" antes.</p>
        {[['Instalar (na pasta do projeto)', dados.terminal.instalar], ['Abrir', dados.terminal.comando], ['Uma pergunta só', 'clima-ia "quais ares estão ligados?"']].map(([r, c]) => (
          <div key={r} className="mt-3"><p className="text-xs text-muted-foreground">{r}</p>
            <div className="mt-1 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 font-mono text-xs"><span className="min-w-0 flex-1 truncate">{c}</span>
              <button onClick={() => copiar(c)} aria-label={`Copiar: ${c}`} className="text-muted-foreground hover:text-foreground"><Copy className="h-3.5 w-3.5" /></button></div></div>
        ))}
        <p className="mt-3 text-xs text-muted-foreground">Dentro dele: <code>/status</code>, <code>/modelo</code>, <code>/limpar</code>, <code>/sair</code>. Segredos são mascarados antes de qualquer envio.</p>
      </section>
      <section className="cartao p-5">
        <h2 className="titulo-secao">O que ele pode fazer</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Ver ares, transmissores, agente no comando, cenas, atividade e o tempo lá fora.</li>
          <li>Ligar, desligar, mudar modo, temperatura e ventilação de um ar (executa na hora).</li>
          <li>Programar desligar ou ligar daqui a N minutos.</li>
          <li>Desligar todos e executar cenas só depois de você tocar em Confirmar.</li>
          <li>Também no Telegram: mande qualquer texto para o bot.</li>
        </ul>
      </section>
      {dono && (
        <section className="cartao space-y-3 p-5">
          <h2 className="titulo-secao flex items-center gap-2"><KeyRound className="h-4 w-4" />Configuração (dono)</h2>
          <p className="text-xs text-muted-foreground">Chave da NVIDIA (build.nvidia.com): {dados.configurada ? <b className="font-mono">{dados.mascara}</b> : 'não configurada'}. Fica cifrada no banco.</p>
          <form onSubmit={(e) => { e.preventDefault(); salvar({ api_key: chave.trim() }) }} className="flex gap-2">
            <input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="nvapi-… (só para trocar)" aria-label="Chave da NVIDIA" className="campo h-9 min-w-0 flex-1 font-mono" />
            <Botao type="submit" tamanho="sm" carregando={salvando} disabled={chave.trim().length < 20}>Salvar</Botao>
          </form>
          <label className="block"><span className="rotulo">Modelo</span>
            <select className="campo mt-1 h-9" value={dados.modelo} onChange={(e) => salvar({ modelo: e.target.value })}>
              {dados.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select></label>
          <div className="flex items-center justify-between text-sm"><span>Assistente ligado</span><Interruptor ligado={dados.ativo} onChange={(v) => salvar({ ativo: v })} rotulo="Assistente ligado" /></div>
          <div className="flex items-center justify-between text-sm"><span>Responder no Telegram</span><Interruptor ligado={dados.telegram} onChange={(v) => salvar({ telegram: v })} rotulo="Responder no Telegram" /></div>
        </section>
      )}
    </div>
  )
}

export default function Ia() {
  const { sessao } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/ia/estado'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !sessao) return <Carregando />
  const ativo = dados.configurada && dados.ativo
  return (
    <div className="w-full">
      <Cabecalho titulo="Assistente de IA" descricao="Converse com o sistema: estado dos ares, transmissores e do agente, comandos com as suas permissões. Também no terminal e no Telegram." />
      {!dados.configurada && <div className="mb-4"><Aviso tipo="alerta">Falta a chave da NVIDIA. {sessao.papel === 'dono' ? 'Cole em Configuração, ao lado.' : 'Peça ao dono do sistema.'}</Aviso></div>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Conversa ativo={ativo} />
        <Lateral dados={dados} dono={sessao.papel === 'dono'} recarregar={recarregar} />
      </div>
    </div>
  )
}
