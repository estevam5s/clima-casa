import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp, Check, ChevronDown, Copy, Download, KeyRound, Menu, MessageSquare, Mic, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
  Paperclip, Pencil, Pin, PinOff, Plus, RotateCcw, Search, Settings, Slash, Sparkles, Square, Terminal, Trash2, X,
} from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import MiniMarkdown from '../components/MiniMarkdown'
import IconeIA, { EMPRESAS } from '../components/IconeIA'
import { Aviso, Botao, Carregando, Interruptor, Modal, useDados, useToast } from '../components/ui'

// Assistente de IA (NVIDIA) no formato de chat com histórico: conversas salvas por pessoa (fixar, renomear, apagar,
// procurar), comandos com "/", anexar arquivo de texto, ditado por voz, escolha do modelo por mensagem, copiar,
// tentar de novo, editar a pergunta e exportar. As ferramentas usam as permissões de quem pergunta; desligar todos e
// cenas pedem Confirmar.
const COMANDOS = [
  { c: '/status', d: 'Resumo geral: ares, agente e transmissores', p: 'Me dê um resumo geral agora: ares ligados, agente no comando e transmissores.' },
  { c: '/ligados', d: 'Quais ares estão ligados', p: 'Quais ares estão ligados agora, com modo e temperatura?' },
  { c: '/ares', d: 'Todos os ares e o estado de cada um', p: 'Liste todos os meus ares com o estado de cada um.' },
  { c: '/salas', d: 'Salas e quantos ares ligados', p: 'Como estão as salas: quantos ares e quantos ligados em cada uma?' },
  { c: '/transmissores', d: 'Transmissores online e problemas', p: 'Como estão os transmissores? Algum offline ou com problema?' },
  { c: '/agentes', d: 'Computadores do escritório', p: 'Quais computadores estão com o agente e quem está no comando?' },
  { c: '/zonas', d: 'Ares que mudam juntos', p: 'Quais zonas existem e quais ares mudam juntos?' },
  { c: '/relatorio', d: 'Uso e custo dos últimos 7 dias', p: 'Faça um resumo dos últimos 7 dias: uso, consumo, custo e o que chama atenção.' },
  { c: '/economia', d: 'Dicas para gastar menos', p: 'Olhando os últimos 30 dias, como gastar menos com os ares? Dê 3 dicas práticas.' },
  { c: '/falhas', d: 'O que falhou e por quê', p: 'Quais comandos falharam recentemente e por quê? O que eu faço?' },
  { c: '/tempo', d: 'Tempo lá fora e sugestão', p: 'Como está o tempo lá fora e qual temperatura você sugere para os ares?' },
  { c: '/dispositivos', d: 'Luzes, persianas, cafeteira, fechadura', p: 'Como estão as luzes, persianas, cafeteira e a fechadura?' },
  { c: '/notificacoes', d: 'Últimas notificações', p: 'Quais são as últimas notificações importantes?' },
  { c: '/desligartodos', d: 'Desligar todos (pede confirmação)', p: 'Desliga todos os ares ligados.' },
  { c: '/nova', d: 'Começar outra conversa', acao: 'nova' },
  { c: '/exportar', d: 'Baixar a conversa em Markdown', acao: 'exportar' },
  { c: '/ajuda', d: 'O que dá para fazer aqui', acao: 'ajuda' },
]
const SUGESTOES = [['Estado', 'Quais ares estão ligados agora?'], ['Controle', 'Coloca o ar do diretor em 23 graus'], ['Diagnóstico', 'Por que os comandos não estão chegando?'],
  ['Timer', 'Desliga o ar dos devs daqui a 30 minutos'], ['Relatório', 'Quanto gastamos com os ares nesta semana?'], ['Tempo', 'Como está o tempo lá fora?']]
const AJUDA = `**O que dá para fazer aqui**
- Perguntar sobre ares, salas, zonas, transmissores, agentes, luzes, persianas, cafeteira, notificações e relatórios.
- Pedir para ligar, desligar, mudar modo, temperatura e ventilação de um ar, ou programar um timer (executa na hora).
- Desligar todos e executar cenas: só depois de você tocar em **Confirmar**.
- Comandos com \`/\` (digite / no começo), anexar arquivo de texto (clipe), ditar por voz (microfone) e escolher o modelo.
- Atalhos: **Enter** envia, **Shift+Enter** quebra linha, **Esc** para de esperar, **Ctrl/⌘+K** procura conversas.`

function saudacao(nome) {
  const h = new Date().getHours()
  return `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${nome ? `, ${nome}` : ''}`
}
function quando(ts) {
  const d = new Date(ts * 1000), hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function Acoes({ m }) {
  if (!(m.acoes || []).length) return null
  return (
    <ul className="mt-2 space-y-1 rounded-lg border border-border/70 px-3 py-2 text-xs">
      {m.acoes.map((a, j) => <li key={j} className={a.ok === false ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}>
        {a.ok === false ? `Não foi: ${a.ar || ''} ${a.erro || ''}` : a.ferramenta === 'temporizador' ? `Temporizador: ${a.ar} vai ${a.acao} em ${a.em_minutos} min`
          : `Enviado: ${a.ar} ${a.ligado ? `ligado · ${a.modo} ${a.temperatura}° · ventilação ${String(a.ventilacao || '').toLowerCase()}` : 'desligado'}${a.mudaram_junto?.length ? ` (mudou junto: ${a.mudaram_junto.join(', ')})` : ''}`}
      </li>)}
    </ul>
  )
}

function Lateral({ lista, atual, abrir, nova, busca, setBusca, recarregar, fechar, configurar, sessao, executar, recolher }) {
  const [menuConta, setMenuConta] = useState(false)
  const toast = useToast()
  const [menu, setMenu] = useState(null)
  const [renomear, setRenomear] = useState(null)
  const fixadas = lista.filter((c) => c.fixada), recentes = lista.filter((c) => !c.fixada)
  const acao = async (c, tipo) => {
    setMenu(null)
    try {
      if (tipo === 'fixar') await api.put(`/api/ia/conversas/${c.id}`, { fixada: !c.fixada })
      if (tipo === 'apagar') { await api.del(`/api/ia/conversas/${c.id}`); if (atual === c.id) nova() }
      recarregar()
    } catch (e) { toast(e.message, 'erro') }
  }
  const salvarNome = async (e) => {
    e.preventDefault()
    try { await api.put(`/api/ia/conversas/${renomear.id}`, { titulo: renomear.titulo }); setRenomear(null); recarregar() } catch (err) { toast(err.message, 'erro') }
  }
  const item = (c) => (
    <li key={c.id} className="group relative">
      {renomear?.id === c.id ? (
        <form onSubmit={salvarNome} className="px-1"><input autoFocus className="campo h-8 w-full text-sm" value={renomear.titulo} maxLength={120} onChange={(e) => setRenomear({ ...renomear, titulo: e.target.value })} onBlur={() => setRenomear(null)} aria-label="Novo nome da conversa" /></form>
      ) : (
        <button onClick={() => { abrir(c.id); fechar?.() }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${atual === c.id ? 'bg-[var(--ia-realce)] font-medium' : 'hover:bg-[var(--ia-realce)]'}`}>
          <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
        </button>
      )}
      <button onClick={() => setMenu(menu === c.id ? null : c.id)} aria-label={`Opções de ${c.titulo}`} className="absolute right-1 top-1 rounded p-1 text-muted-foreground opacity-0 hover:bg-background group-hover:opacity-100 focus:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
      {menu === c.id && (
        <div className="absolute right-0 top-8 z-20 w-40 rounded-lg border border-border bg-card p-1 text-sm shadow-lg">{/* marca: menu flutua */}
          <button onClick={() => acao(c, 'fixar')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">{c.fixada ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}{c.fixada ? 'Desafixar' : 'Fixar'}</button>
          <button onClick={() => { setMenu(null); setRenomear({ id: c.id, titulo: c.titulo }) }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"><Pencil className="h-3.5 w-3.5" />Renomear</button>
          <button onClick={() => acao(c, 'apagar')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-red-600 hover:bg-muted"><Trash2 className="h-3.5 w-3.5" />Apagar</button>
        </div>
      )}
    </li>
  )
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <span className="font-serif text-xl">Assistente</span>
        {recolher && <button onClick={recolher} className="rounded-lg p-1.5 text-[var(--ia-suave)] hover:bg-[var(--ia-realce)]" aria-label="Esconder conversas" title="Esconder conversas"><PanelLeftClose className="h-4 w-4" /></button>}
      </div>
      <div className="space-y-0.5 p-2">
        <button onClick={() => { nova(); fechar?.() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-[var(--ia-realce)]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ia-acento)] text-[var(--ia-acento-texto)]"><Plus className="h-3.5 w-3.5" /></span>Nova conversa</button>
        <button onClick={() => { executar?.('comandos'); fechar?.() }} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-[var(--ia-realce)]"><Slash className="ml-1 h-4 w-4 text-[var(--ia-suave)]" /><span className="ml-0.5">Comandos</span></button>
        <label className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm focus-within:bg-[var(--ia-realce)]">
          <Search className="ml-1 h-4 w-4 shrink-0 text-[var(--ia-suave)]" />
          <input id="ia-busca" type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--ia-texto)]" />
        </label>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversas">
        {fixadas.length > 0 && <><p className="px-2.5 pb-1 pt-3 text-xs font-medium text-[var(--ia-suave)]">Fixadas</p><ul className="space-y-0.5">{fixadas.map(item)}</ul></>}
        <p className="px-2.5 pb-1 pt-3 text-xs font-medium text-[var(--ia-suave)]">Recentes</p>
        {recentes.length ? <ul className="space-y-0.5">{recentes.map(item)}</ul> : <p className="px-2.5 text-xs text-muted-foreground">{busca ? 'Nada com esse texto.' : 'As conversas ficam aqui.'}</p>}
      </nav>
      <div className="relative p-2">
        {menuConta && (
          <div className="absolute bottom-full left-2 right-2 z-20 mb-1 rounded-xl border border-[var(--ia-borda)] bg-[var(--ia-caixa)] p-1 text-sm shadow-lg">{/* marca: menu da conta flutua */}
            <p className="truncate px-3 pb-1 pt-2 text-xs text-[var(--ia-suave)]">{sessao?.email}</p>
            <button onClick={() => { setMenuConta(false); configurar() }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)]"><Settings className="h-4 w-4" />Configurações e capacidades</button>
            <button onClick={() => { setMenuConta(false); executar?.('ajuda'); fechar?.() }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)]"><MessageSquare className="h-4 w-4" />O que dá para fazer</button>
            <button onClick={() => { setMenuConta(false); executar?.('exportar') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)]"><Download className="h-4 w-4" />Baixar a conversa</button>
          </div>
        )}
        <button onClick={() => setMenuConta((v) => !v)} aria-expanded={menuConta} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-[var(--ia-realce)]">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--ia-acento)] text-sm font-semibold text-[var(--ia-acento-texto)]">{(sessao?.nome || sessao?.email || '?').slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{(sessao?.nome || '').split(' ')[0] || 'Você'}</span><span className="block truncate text-xs text-[var(--ia-suave)]">{({ dono: 'Dono', admin: 'Administrador' })[sessao?.papel] || sessao?.papel}</span></span>
          <ChevronDown className="h-4 w-4 text-[var(--ia-suave)]" />
        </button>
      </div>
    </div>
  )
}

// Prévia de como o clima-ia aparece no terminal (mesmas cores do cliente: laranja do cabeçalho, lavanda do texto)
function PreviaTerminal() {
  const L = '#d77757', T = '#c0caf5', C = '#949494'
  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] p-3 font-mono text-[11px] leading-relaxed" aria-label="Prévia do clima-ia no terminal">
      <div className="rounded-md border p-2" style={{ borderColor: L }}>
        <span style={{ color: L }}>clima-ia</span> <span style={{ color: C }}>v1.5.0</span>
        <p className="mt-1" style={{ color: T }}>Conta do painel · modelo padrão</p>
        <p style={{ color: C }}>Digite / para ver os comandos · Shift+Tab muda o modo</p>
      </div>
      <p className="mt-2 bg-[#3a3a3a] px-1" style={{ color: T }}>❯ quais ares estão ligados?</p>
      <p className="mt-2"><span className="text-[#5faf5f]">●</span> <span style={{ color: T }}>Ar</span><span style={{ color: C }}>(</span><span className="text-[#7aa2f7]">Ar do diretor</span><span style={{ color: C }}>)</span></p>
      <p style={{ color: C }}>  ⎿  <span style={{ color: T }}>Frio 19° · ventilação alta</span></p>
      <p className="mt-2" style={{ color: L }}>✻ Resfriando… <span style={{ color: C }}>(4s · ctrl+c para interromper)</span></p>
      <div className="mt-2 border-y border-[#808080] py-0.5" style={{ color: T }}>❯</div>
      <p className="mt-1"><span className="text-[#5fafaf]">⏸ modo plano</span> <span style={{ color: C }}>(shift+tab para alternar) · só leitura</span></p>
    </div>
  )
}

function Configuracao({ dados, dono, recarregar, fechar }) {
  const toast = useToast()
  const [chave, setChave] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvar = async (extra) => {
    setSalvando(true)
    try { await api.put('/api/ia/config', extra); setChave(''); toast('Configuração salva.'); recarregar() } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const copiar = (t) => { navigator.clipboard?.writeText(t); toast('Copiado.') }
  return (
    <Modal aberto titulo="Assistente de IA" onFechar={fechar}>
      <div className="space-y-5 text-sm">
        <section>
          <h3 className="flex items-center gap-2 font-medium"><Terminal className="h-4 w-4" />No terminal (clima-ia)</h3>
          <p className="mt-1 text-muted-foreground">O mesmo assistente no terminal, no jeito do Claude Code: modos manual, aceitar e plano (Shift+Tab), comandos com "/", pedido de permissão antes de agir. Entra com a sua conta pelo navegador: nenhuma chave fica no computador.</p>
          {[['Instalar (macOS e Linux)', dados.terminal.instalar], ['Instalar (Windows, PowerShell)', dados.terminal.instalar_windows], ['Entrar', dados.terminal.login], ['Abrir', dados.terminal.comando], ['Uma pergunta só', 'clima-ia "quais ares estão ligados?"']].filter(([, c]) => c).map(([r, c]) => (
            <div key={r} className="mt-2"><p className="text-xs text-muted-foreground">{r}</p>
              <div className="mt-1 flex items-center gap-2 rounded-lg bg-[#1a1a1a] px-3 py-2 font-mono text-xs text-[#c0caf5]"><span aria-hidden className="text-[#d77757]">$</span><span className="min-w-0 flex-1 truncate">{c}</span>
                <button onClick={() => copiar(c)} aria-label={`Copiar: ${c}`} className="text-[#949494] hover:text-white"><Copy className="h-3.5 w-3.5" /></button></div></div>
          ))}
          <PreviaTerminal />
        </section>
        <section>
          <h3 className="font-medium">Ferramentas que ele usa</h3>
          <p className="mt-1 text-muted-foreground">Estado geral, ares, salas, zonas, transmissores, agentes, atividade, cenas, relatório, tempo lá fora, luzes e aparelhos, notificações, comandar um ar, timer, desligar todos e cenas (os dois últimos com Confirmar). No modo plano só as consultas. Dentro da pasta do projeto (com o agente instalado) ele também lê e edita o código. Também no Telegram: mande qualquer texto ao bot.</p>
        </section>
        {dono && (
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 font-medium"><KeyRound className="h-4 w-4" />Configuração (dono)</h3>
            <p className="text-xs text-muted-foreground">Chave da NVIDIA: {dados.configurada ? <b className="font-mono">{dados.mascara}</b> : 'não configurada'}. Fica cifrada no banco.</p>
            <form onSubmit={(e) => { e.preventDefault(); salvar({ api_key: chave.trim() }) }} className="flex gap-2">
              <input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={chave} onChange={(e) => setChave(e.target.value)} placeholder="nvapi-… (só para trocar)" aria-label="Chave da NVIDIA" className="campo h-9 min-w-0 flex-1 font-mono" />
              <Botao type="submit" tamanho="sm" carregando={salvando} disabled={chave.trim().length < 20}>Salvar</Botao>
            </form>
            <label className="block"><span className="rotulo">Modelo padrão</span>
              <select className="campo mt-1 h-9" value={dados.modelo} onChange={(e) => salvar({ modelo: e.target.value })}>
                {dados.modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select></label>
            <div className="flex items-center justify-between"><span>Assistente ligado</span><Interruptor ligado={dados.ativo} onChange={(v) => salvar({ ativo: v })} rotulo="Assistente ligado" /></div>
            <div className="flex items-center justify-between"><span>Responder no Telegram</span><Interruptor ligado={dados.telegram} onChange={(v) => salvar({ telegram: v })} rotulo="Responder no Telegram" /></div>
          </section>
        )}
      </div>
    </Modal>
  )
}

function Compositor({ texto, setTexto, enviar, parar, pensando, ativo, modelo, setModelo, modelos, executar, grande, escopo }) {
  const toast = useToast()
  const ta = useRef(null), arq = useRef(null)
  const [anexo, setAnexo] = useState(null)
  const [ouvindo, setOuvindo] = useState(false)
  const [sel, setSel] = useState(0)
  const reconhecer = useRef(null)
  useEffect(() => { const t = ta.current; if (!t) return; t.style.height = 'auto'; t.style.height = `${Math.min(240, t.scrollHeight)}px` }, [texto])
  const barra = texto.startsWith('/') && !texto.includes(' ') ? COMANDOS.filter((c) => c.c.startsWith(texto.toLowerCase())) : []
  useEffect(() => { setSel(0) }, [texto])
  const escolher = (c) => { if (c.acao) { setTexto(''); executar(c.acao) } else { setTexto(''); enviar(c.p) } }
  const mandar = () => {
    if (barra.length) return escolher(barra[sel] || barra[0])
    const corpo = anexo ? `${texto.trim()}\n\nArquivo anexado: ${anexo.nome}\n\`\`\`\n${anexo.conteudo}\n\`\`\`` : texto
    if (!corpo.trim()) return
    enviar(corpo); setAnexo(null)
  }
  const anexar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (f.size > 60000) return toast('Arquivo grande demais (até 60 KB de texto).', 'erro')
    const conteudo = (await f.text()).slice(0, 3000)
    setAnexo({ nome: f.name, conteudo }); toast(`${f.name} anexado (até 3 mil caracteres vão para a IA).`)
  }
  const ditar = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return toast('Este navegador não tem ditado por voz.', 'erro')
    if (ouvindo) { reconhecer.current?.stop(); return }
    const r = new SR(); r.lang = 'pt-BR'; r.interimResults = false; r.continuous = false
    r.onresult = (ev) => setTexto((t) => `${t ? `${t} ` : ''}${ev.results[0][0].transcript}`)
    r.onend = () => setOuvindo(false); r.onerror = () => setOuvindo(false)
    reconhecer.current = r; setOuvindo(true); r.start()
  }
  const seletor = <SeletorModelo modelo={modelo} setModelo={setModelo} modelos={modelos} />
  return (
    <div className={`relative w-full ${grande ? '' : ''}`}>
      {barra.length > 0 && (
        <ul className="absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg" role="listbox" aria-label="Comandos">{/* marca: menu de comandos flutua */}
          {barra.map((c, i) => (
            <li key={c.c}><button onMouseDown={(e) => { e.preventDefault(); escolher(c) }} onMouseEnter={() => setSel(i)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === sel ? 'bg-muted' : ''}`}>
              <code className="w-32 shrink-0 text-primary">{c.c}</code><span className="text-muted-foreground">{c.d}</span></button></li>
          ))}
        </ul>
      )}
      <div className="rounded-[20px] border border-[var(--ia-borda)] bg-[var(--ia-caixa)] shadow-[0_2px_10px_rgba(0,0,0,0.05)] focus-within:border-[var(--ia-suave)]">{/* marca: caixa de mensagem flutua */}
        {anexo && (
          <div className="flex items-center gap-2 px-4 pt-3 text-xs"><span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1"><Paperclip className="h-3.5 w-3.5" />{anexo.nome}</span>
            <button onClick={() => setAnexo(null)} aria-label="Tirar o anexo" className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></div>
        )}
        <textarea ref={ta} value={texto} onChange={(e) => setTexto(e.target.value)} rows={grande ? 2 : 1} maxLength={4000} disabled={!ativo}
          onKeyDown={(e) => {
            if (barra.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : barra.length - 1)) % barra.length); return }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); mandar() }
            if (e.key === 'Escape' && pensando) parar()
          }}
          placeholder={ativo ? (grande ? 'Como posso ajudar você hoje?' : 'Responder…') : 'O assistente está desligado ou sem chave'} aria-label="Mensagem para a IA"
          className="block w-full resize-none bg-transparent px-4 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-[var(--ia-suave)]" />
        <div className="flex items-center gap-1 px-2.5 pb-2.5 pt-1">
          <input ref={arq} type="file" accept=".txt,.md,.csv,.json,.log,.py,.js,.jsx,.ts,.sql,.yml,.yaml,.xml,.html" className="hidden" onChange={anexar} />
          <button onClick={() => arq.current?.click()} disabled={!ativo} title="Anexar arquivo de texto" aria-label="Anexar arquivo de texto" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Plus className="h-4 w-4" /></button>
          <button onClick={() => { setTexto('/'); ta.current?.focus() }} disabled={!ativo} title="Comandos" aria-label="Comandos" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><Slash className="h-4 w-4" /></button>
          <div className="flex-1" />
          {!grande && seletor}
          <button onClick={ditar} disabled={!ativo} title={ouvindo ? 'Parar o ditado' : 'Ditar por voz'} aria-label="Ditar por voz" className={`rounded-lg p-2 hover:bg-[var(--ia-realce)] ${ouvindo ? 'text-red-500' : 'text-[var(--ia-suave)]'}`}><Mic className="h-4 w-4" /></button>
          {pensando
            ? <button onClick={parar} aria-label="Parar" title="Parar (Esc)" className="rounded-xl bg-[var(--ia-texto)] p-2 text-[var(--ia-fundo)]"><Square className="h-4 w-4" /></button>
            : <button onClick={mandar} disabled={!ativo || (!texto.trim() && !anexo)} aria-label="Enviar" title="Enviar (Enter)" className="rounded-xl bg-[var(--ia-acento)] p-2 text-[var(--ia-acento-texto)] disabled:opacity-40"><ArrowUp className="h-4 w-4" /></button>}
        </div>
      </div>
      {grande && (
        <div className="mt-2 flex items-center justify-between gap-2 px-2 text-sm text-[var(--ia-suave)]">
          <span className="truncate">{escopo}</span>
          {seletor}
        </div>
      )}
    </div>
  )
}

const RITMO = { rapido: 'rápido', medio: 'médio', lento: 'lento', instavel: 'instável' }
function SeletorModelo({ modelo, setModelo, modelos }) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const atual = modelos.find((m) => m.id === modelo)
  const fora = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const f = (e) => { if (fora.current && !fora.current.contains(e.target)) setAberto(false) }
    const esc = (e) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', f); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const lista = modelos.filter((m) => !q || `${m.nome} ${EMPRESAS[m.empresa] || ''} ${m.descricao}`.toLowerCase().includes(q.toLowerCase()))
  const grupos = [...new Set(lista.map((m) => m.empresa))]
  return (
    <div className="relative" ref={fora}>
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--ia-texto)] hover:bg-[var(--ia-realce)]">
        {atual && <IconeIA empresa={atual.empresa} className="h-4 w-4" />}{atual?.nome || 'Modelo'}<ChevronDown className="h-3.5 w-3.5 text-[var(--ia-suave)]" />
      </button>
      {aberto && (
        <div className="absolute bottom-full right-0 z-30 mb-2 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-xl border border-[var(--ia-borda)] bg-[var(--ia-caixa)] text-sm shadow-lg">{/* marca: escolha do modelo flutua */}
          <div className="border-b border-[var(--ia-borda)] p-2">
            <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 focus-within:bg-[var(--ia-realce)]"><Search className="h-4 w-4 text-[var(--ia-suave)]" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Procurar entre ${modelos.length} modelos gratuitos da NVIDIA`} type="search" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--ia-suave)]" aria-label="Procurar modelo" /></label>
          </div>
          <div className="min-h-0 overflow-y-auto p-1">
            {grupos.map((g) => (
              <div key={g} className="py-1">
                <p className="flex items-center gap-1.5 px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--ia-suave)]"><IconeIA empresa={g} className="h-3.5 w-3.5" />{EMPRESAS[g] || g}</p>
                {lista.filter((m) => m.empresa === g).map((m) => (
                  <button key={m.id} onClick={() => { setModelo(m.id); setAberto(false) }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--ia-realce)] ${m.id === modelo ? 'bg-[var(--ia-realce)]' : ''}`}>
                    <IconeIA empresa={m.empresa} className="mt-0.5 h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{m.nome}</span>
                      <span className="block text-xs text-[var(--ia-suave)]">{m.descricao}</span>
                      <span className="mt-1 flex flex-wrap gap-1 text-[10px]">
                        <span className={`rounded px-1.5 py-0.5 ${m.ferramentas ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-[var(--ia-realce)] text-[var(--ia-suave)]'}`}>{m.ferramentas ? 'age nos ares' : 'só texto'}</span>
                        <span className={`rounded px-1.5 py-0.5 ${m.ritmo === 'instavel' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-[var(--ia-realce)] text-[var(--ia-suave)]'}`}>{RITMO[m.ritmo] || m.ritmo}</span>
                      </span>
                    </span>
                    {m.id === modelo && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ia-acento)]" />}
                  </button>
                ))}
              </div>
            ))}
            {!lista.length && <p className="px-3 py-4 text-[var(--ia-suave)]">Nenhum modelo com esse nome.</p>}
          </div>
          <p className="border-t border-[var(--ia-borda)] px-3 py-2 text-[11px] text-[var(--ia-suave)]">Todos os modelos de conversa do catálogo gratuito da NVIDIA disponíveis para a chave do sistema.</p>
        </div>
      )}
    </div>
  )
}

export default function Ia() {
  const toast = useToast()
  const { sessao, projeto } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/ia/estado'))
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState([])
  const [atual, setAtual] = useState(() => Number(new URLSearchParams(location.search).get('c')) || null)
  const [msgs, setMsgs] = useState([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [modelo, setModelo] = useState(null)
  const [lateral, setLateral] = useState(true)
  const [gaveta, setGaveta] = useState(false)
  const [config, setConfig] = useState(false)
  const pedido = useRef(0), fim = useRef(null)
  const carregarLista = () => api.get(`/api/ia/conversas${busca ? `?q=${encodeURIComponent(busca)}` : ''}`).then(setLista).catch(() => {})
  useEffect(() => { const t = setTimeout(carregarLista, busca ? 250 : 0); return () => clearTimeout(t) }, [busca])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (dados && !modelo) setModelo(dados.modelo) }, [dados, modelo])
  useEffect(() => {
    const u = new URL(location.href); if (atual) u.searchParams.set('c', atual); else u.searchParams.delete('c'); history.replaceState(null, '', u)
    if (!atual) { setMsgs([]); return }
    api.get(`/api/ia/conversas/${atual}`).then((c) => setMsgs(c.mensagens || [])).catch(() => { setAtual(null) })
  }, [atual])
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs, pensando])
  useEffect(() => {
    const tecla = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setLateral(true); setTimeout(() => document.getElementById('ia-busca')?.focus(), 30) } }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [])
  const nome = useMemo(() => (sessao?.nome || '').split(' ')[0], [sessao])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !sessao) return <Carregando />
  const ativo = dados.configurada && dados.ativo

  const nova = () => { pedido.current++; setPensando(false); setAtual(null); setMsgs([]); setTexto('') }
  const enviar = async (pergunta, base = msgs) => {
    const q = (pergunta || '').trim()
    if (!q || pensando) return
    const hist = [...base, { role: 'user', content: q }]
    setMsgs(hist); setTexto(''); setPensando(true)
    const meu = ++pedido.current
    try {
      const r = await api.post('/api/ia/conversar', { mensagens: hist.filter((m) => m.role === 'user' || m.role === 'assistant').map(({ role, content }) => ({ role, content: String(content).slice(0, 4000) })).slice(-20), conversa_id: atual, modelo })
      if (meu !== pedido.current) return   // parou ou trocou de conversa
      setMsgs([...hist, { role: 'assistant', content: r.texto, acoes: r.acoes, confirmacoes: r.confirmacoes, modelo: r.modelo }])
      if (r.conversa_id && r.conversa_id !== atual) { pedido.current++; setAtual(r.conversa_id); pedido.current-- }
      carregarLista()
    } catch (e) {
      if (meu === pedido.current) setMsgs([...hist, { role: 'assistant', content: e.message, erro: true }])
    } finally { if (meu === pedido.current) setPensando(false) }
  }
  const parar = () => { pedido.current++; setPensando(false); setMsgs((m) => [...m, { role: 'assistant', content: 'Parado. A resposta, se chegar, é ignorada.', erro: true }]) }
  const executar = (acao) => {
    if (acao === 'nova') return nova()
    if (acao === 'ajuda') return setMsgs((m) => [...m, { role: 'assistant', content: AJUDA, local: true }])
    if (acao === 'comandos') { setTexto('/'); setTimeout(() => document.querySelector('textarea[aria-label="Mensagem para a IA"]')?.focus(), 30); return }
    if (acao === 'exportar') {
      const md = msgs.map((m) => `### ${m.role === 'user' ? 'Você' : 'Assistente'}\n\n${m.content}\n`).join('\n')
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' })); a.download = `conversa-ia-${new Date().toISOString().slice(0, 10)}.md`; a.click()
    }
  }
  const confirmar = async (i, c) => {
    try {
      const r = await api.post('/api/ia/confirmar', { confirmacao: c.confirmacao })
      setMsgs((m) => m.map((x, j) => j === i ? { ...x, confirmacoes: x.confirmacoes.map((y) => y === c ? { ...y, feito: r.texto } : y) } : x)); toast(r.texto)
    } catch (e) { toast(e.message, 'erro') }
  }
  const cancelar = (i, c) => setMsgs((m) => m.map((x, j) => j === i ? { ...x, confirmacoes: x.confirmacoes.map((y) => y === c ? { ...y, feito: 'Cancelado.' } : y) } : x))
  const ultimaPergunta = [...msgs].reverse().find((m) => m.role === 'user')
  const deNovo = () => { const i = msgs.lastIndexOf(ultimaPergunta); if (i >= 0) enviar(ultimaPergunta.content, msgs.slice(0, i)) }
  const editar = (i) => { setTexto(msgs[i].content); setMsgs(msgs.slice(0, i)) }
  const copiar = (t) => { navigator.clipboard?.writeText(t); toast('Copiado.') }
  const titulo = lista.find((c) => c.id === atual)?.titulo
  const escopo = projeto ? `Contexto: ${projeto.nome}` : 'Contexto: todos os projetos'
  const compositor = (grande) => <Compositor texto={texto} setTexto={setTexto} enviar={(q) => enviar(q)} parar={parar} pensando={pensando} ativo={ativo} modelo={modelo} setModelo={setModelo} modelos={dados.modelos} executar={executar} grande={grande} escopo={escopo} />

  return (
    <div className="tela-ia -mx-4 -mb-16 -mt-6 flex h-[calc(100dvh-4rem)] min-h-[32rem] overflow-hidden bg-[var(--ia-fundo)] text-[var(--ia-texto)] sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      {lateral && (
        <aside className="hidden w-72 shrink-0 border-r border-[var(--ia-borda)] bg-[var(--ia-lateral)] md:block">
          <Lateral lista={lista} atual={atual} abrir={setAtual} nova={nova} busca={busca} setBusca={setBusca} recarregar={carregarLista} configurar={() => setConfig(true)} sessao={sessao} executar={executar} recolher={() => setLateral(false)} />
        </aside>
      )}
      {gaveta && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-black/40" aria-label="Fechar a lista" onClick={() => setGaveta(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[var(--ia-lateral)] text-[var(--ia-texto)] shadow-xl"><Lateral lista={lista} atual={atual} abrir={setAtual} nova={nova} busca={busca} setBusca={setBusca} recarregar={carregarLista} fechar={() => setGaveta(false)} configurar={() => { setGaveta(false); setConfig(true) }} sessao={sessao} executar={executar} /></aside>
        </div>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 px-3">
          <button onClick={() => setGaveta(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden" aria-label="Conversas"><Menu className="h-4 w-4" /></button>
          {!lateral && <button onClick={() => setLateral(true)} className="hidden rounded-md p-1.5 text-[var(--ia-suave)] hover:bg-[var(--ia-realce)] md:block" aria-label="Mostrar conversas" title="Mostrar conversas"><PanelLeftOpen className="h-4 w-4" /></button>}
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{titulo || (msgs.length ? 'Nova conversa' : '')}</p>
          {msgs.length > 0 && <button onClick={() => executar('exportar')} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Baixar a conversa" title="Baixar em Markdown"><Download className="h-4 w-4" /></button>}
          {msgs.length > 0 && <button onClick={nova} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Nova conversa" title="Nova conversa"><MessageSquare className="h-4 w-4" /></button>}
        </header>
        {!dados.configurada && <div className="px-4"><Aviso tipo="alerta">Falta a chave da NVIDIA. {sessao.papel === 'dono' ? 'Abra Terminal, capacidades e configuração, embaixo à esquerda.' : 'Peça ao dono do sistema.'}</Aviso></div>}
        {msgs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
            <h1 className="flex items-center gap-3 text-center font-serif text-[2rem] font-normal leading-tight tracking-tight sm:text-[2.6rem]"><Sparkles className="h-8 w-8 shrink-0 text-[var(--ia-acento)] sm:h-9 sm:w-9" />{saudacao(nome)}</h1>
            <p className="mt-2 text-center text-sm text-[var(--ia-suave)]">Pergunte ou peça: ele vê o estado real dos ares e só faz o que o seu usuário pode.</p>
            <div className="mt-6 w-full max-w-3xl">{compositor(true)}</div>
            <div className="mt-4 flex max-w-3xl flex-wrap justify-center gap-2">
              {SUGESTOES.map(([r, s]) => <button key={s} onClick={() => enviar(s)} disabled={!ativo} className="rounded-xl border border-[var(--ia-borda)] px-3 py-1.5 text-xs text-[var(--ia-suave)] hover:bg-[var(--ia-realce)] hover:text-[var(--ia-texto)] disabled:opacity-50"><b className="font-medium text-[var(--ia-texto)]">{r}</b> · {s}</button>)}
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
              <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6">
                {msgs.map((m, i) => m.role === 'user' ? (
                  <div key={i} className="group flex flex-col items-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[var(--ia-bolha)] px-4 py-2.5 text-[15px]">{m.content}</div>
                    <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => copiar(m.content)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Copiar"><Copy className="h-3.5 w-3.5" /></button>
                      <button onClick={() => editar(i)} disabled={pensando} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Editar e enviar de novo"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                ) : (
                  <div key={i} className="group">
                    <div className={`text-[15px] ${m.erro ? 'rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200' : ''}`}><MiniMarkdown texto={m.content} /></div>
                    <Acoes m={m} />
                    {(m.confirmacoes || []).map((c, j) => (
                      <div key={j} className="mt-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <p className="font-medium">{c.descricao}</p>
                        {c.feito ? <p className="mt-1">{c.feito}</p> : (
                          <div className="mt-2 flex gap-2"><Botao tamanho="sm" icone={Check} onClick={() => confirmar(i, c)}>Confirmar</Botao><Botao tamanho="sm" variante="secundario" icone={X} onClick={() => cancelar(i, c)}>Cancelar</Botao></div>
                        )}
                      </div>
                    ))}
                    {!m.local && (
                      <div className="mt-1.5 flex items-center gap-1 text-muted-foreground">
                        <button onClick={() => copiar(m.content)} className="rounded p-1 hover:bg-muted" aria-label="Copiar a resposta" title="Copiar"><Copy className="h-3.5 w-3.5" /></button>
                        {i === msgs.length - 1 && <button onClick={deNovo} disabled={pensando} className="rounded p-1 hover:bg-muted" aria-label="Tentar de novo" title="Tentar de novo"><RotateCcw className="h-3.5 w-3.5" /></button>}
                        {m.modelo && <span className="ml-1 text-[11px]">{dados.modelos.find((x) => x.id === m.modelo)?.nome || m.modelo}</span>}
                      </div>
                    )}
                  </div>
                ))}
                {pensando && <div className="flex items-center gap-2 text-sm text-[var(--ia-suave)]"><Sparkles className="h-4 w-4 animate-pulse text-[var(--ia-acento)]" />Consultando o sistema…</div>}
                <div ref={fim} />
              </div>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pb-4">{compositor(false)}
              <p className="mt-1.5 text-center text-[11px] text-[var(--ia-suave)]">A IA pode errar. Ações em lote pedem Confirmar; o ar não informa o estado de volta.</p></div>
          </>
        )}
      </main>
      {config && <Configuracao dados={dados} dono={sessao.papel === 'dono'} recarregar={recarregar} fechar={() => setConfig(false)} />}
    </div>
  )
}
