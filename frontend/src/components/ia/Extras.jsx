import { useEffect, useRef, useState } from 'react'
import { Bell, Brain, Check, ChevronRight, Download, FileCode2, FolderGit2, FolderOpen, Gauge, Github, Laptop, LogOut, Palette, Plus, Search, Settings, Shield, SlidersHorizontal, Sparkles, Trash2, Upload, User, Wrench, X } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { useTema } from '../../tema'
import { Botao, Interruptor, Modal, useToast, confirmar } from '../ui'

// Partes do Assistente no estilo do Claude: Configurações (conta, aparência, personalização, capacidades, notificações,
// privacidade, uso), seletor de modelo com Esforço e "Mais modelos", e Projetos (instruções + arquivos/repositório).
export const ESFORCOS = [['baixo', 'Baixo', 'Respostas curtas e rápidas'], ['medio', 'Médio', 'Equilíbrio (padrão)'], ['alto', 'Alto', 'Pensa antes de responder'], ['maximo', 'Máximo', 'Pensa mais e lê mais do histórico e do projeto']]
const ESTILOS = [['normal', 'Normal'], ['conciso', 'Conciso'], ['explicativo', 'Explicativo'], ['formal', 'Formal']]
const TRABALHOS = ['Gestão e direção', 'Manutenção e facilities', 'TI e infraestrutura', 'Desenvolvimento de software', 'Administrativo', 'Atendimento', 'Outro']

function Linha({ titulo, ajuda, children }) {
  return (
    <div className="flex flex-col gap-2 border-b border-[var(--ia-borda)] py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><p className="text-sm">{titulo}</p>{ajuda && <p className="text-xs text-[var(--ia-suave)]">{ajuda}</p>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function ConfiguracoesIA({ fechar, prefs, mudarPrefs, sessao, abrirChave, UsoIA, dono }) {
  const toast = useToast()
  const { escolha, setEscolha } = useTema()
  const [aba, setAba] = useState('conta')
  const [q, setQ] = useState('')
  const [sessoes, setSessoes] = useState(null)
  useEffect(() => { if (aba === 'conta' && !sessoes) api.get('/api/conta/sessoes').then(setSessoes).catch(() => setSessoes([])) }, [aba, sessoes])
  const ABAS = [['conta', 'Conta', User], ['aparencia', 'Aparência', Palette], ['personalizacao', 'Personalização', SlidersHorizontal], ['capacidades', 'Capacidades', Wrench],
    ['notificacoes', 'Notificações', Bell], ['privacidade', 'Privacidade', Shield], ['uso', 'Uso', Gauge], ...(dono ? [['chave', 'Chave e modelos', Settings]] : [])]
  const visiveis = ABAS.filter(([, r]) => !q || r.toLowerCase().includes(q.toLowerCase()))
  const aparelho = (ag = '') => (ag.includes('·') ? ag.replace(' · ', ' (') + ')' : ag || 'Navegador')   // o servidor já guarda "Chrome · macOS"
  const encerrar = async (corpo, msg) => { try { await api.post('/api/conta/sessoes/encerrar', corpo); toast(msg); setSessoes(null) } catch (e) { toast(e.message, 'erro') } }
  const lista = Array.isArray(sessoes) ? sessoes : sessoes?.sessoes || []
  return (
    <Modal aberto titulo="Configurações" onFechar={fechar} largura="max-w-4xl">
      <div className="-m-1 grid min-h-[30rem] grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <nav className="space-y-0.5" aria-label="Áreas das configurações">
          <label className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--ia-borda)] px-2.5 py-1.5 text-sm"><Search className="h-4 w-4 text-[var(--ia-suave)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar" type="search" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Procurar nas configurações" /></label>
          {visiveis.map(([k, r, I], i) => (
            <div key={k}>{(k === 'aparencia' || k === 'uso') && i > 0 && <div className="my-1.5 border-t border-[var(--ia-borda)]" />}
              <button onClick={() => setAba(k)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm ${aba === k ? 'bg-[var(--ia-realce)] font-medium' : 'text-[var(--ia-suave)] hover:bg-[var(--ia-realce)] hover:text-[var(--ia-texto)]'}`}><I className="h-4 w-4" />{r}</button></div>))}
        </nav>
        <div className="min-w-0 sm:max-h-[65vh] sm:overflow-y-auto sm:pr-1">
          {aba === 'conta' && (<>
            <h3 className="text-base font-semibold">Perfil</h3>
            <Linha titulo="Foto" ajuda="A mesma do seu perfil do sistema (Configurações → Perfil)."><span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-[var(--ia-acento)] text-sm font-semibold text-[var(--ia-acento-texto)]">{sessao?.avatar ? <img src={sessao.avatar} alt="" className="h-full w-full object-cover" /> : (sessao?.nome || sessao?.email || '?').slice(0, 1).toUpperCase()}</span></Linha>
            <Linha titulo="Nome completo" ajuda="Muda em Configurações → Perfil."><span className="text-sm">{sessao?.nome || '-'}</span></Linha>
            <Linha titulo="Como o assistente deve chamar você?"><input className="campo h-9 w-56" key={prefs.chamar} defaultValue={prefs.chamar || ''} maxLength={40} placeholder={(sessao?.nome || '').split(' ')[0]} onBlur={(e) => e.target.value !== (prefs.chamar || '') && mudarPrefs({ chamar: e.target.value.trim() })} /></Linha>
            <Linha titulo="O que melhor descreve o seu trabalho?" ajuda="Ajusta o nível técnico das respostas."><select className="campo h-9 w-56" value={prefs.trabalho || ''} onChange={(e) => mudarPrefs({ trabalho: e.target.value })}><option value="">Escolher</option>{TRABALHOS.map((t) => <option key={t}>{t}</option>)}</select></Linha>
            <Linha titulo="E-mail"><span className="text-sm text-[var(--ia-suave)]">{sessao?.email}</span></Linha>
            <div className="mt-6 flex items-center justify-between"><h3 className="text-base font-semibold">Onde você está conectado</h3><Botao tamanho="sm" variante="secundario" icone={LogOut} onClick={() => encerrar({ todas_menos_esta: true }, 'As outras sessões foram encerradas.')}>Sair dos outros aparelhos</Botao></div>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-[var(--ia-borda)] text-left text-xs text-[var(--ia-suave)]"><th className="py-2 font-medium">Aparelho</th><th className="py-2 font-medium">Local</th><th className="py-2 font-medium">Entrou</th><th className="py-2 font-medium">Último uso</th></tr></thead>
              <tbody>{!sessoes ? <tr><td colSpan={4} className="py-3 text-[var(--ia-suave)]">Carregando…</td></tr> : lista.map((s, i) => (
                <tr key={s.id || i} className="border-b border-[var(--ia-borda)]/60">
                  <td className="py-2"><span className="flex items-center gap-2"><Laptop className="h-3.5 w-3.5 text-[var(--ia-suave)]" />{aparelho(s.agente)}{s.atual && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">Esta</span>}</span></td>
                  <td className="py-2 text-[var(--ia-suave)]">{[s.cidade, s.pais].filter(Boolean).join(', ') || '-'}</td>
                  <td className="py-2 text-[var(--ia-suave)]">{s.criado_em ? haQuanto(s.criado_em) : '-'}</td>
                  <td className="py-2 text-[var(--ia-suave)]">{s.visto_em ? haQuanto(s.visto_em) : '-'}</td>
                </tr>))}</tbody>
            </table></div>
          </>)}
          {aba === 'aparencia' && (<>
            <h3 className="text-base font-semibold">Aparência</h3>
            <Linha titulo="Tema"><div className="flex gap-1">{[['claro', 'Claro'], ['escuro', 'Escuro'], ['sistema', 'Automático']].map(([k, r]) => <button key={k} onClick={() => setEscolha(k)} className={`rounded-lg border px-3 py-1.5 text-sm ${escolha === k ? 'border-[var(--ia-acento)] font-medium' : 'border-[var(--ia-borda)]'}`}>{r}</button>)}</div></Linha>
            <Linha titulo="Fonte das conversas"><div className="flex flex-wrap gap-1">{[['padrao', 'Padrão', ''], ['sistema', 'Sistema', 'font-sans'], ['serifa', 'Serifada', 'font-serif'], ['mono', 'Mono', 'font-mono']].map(([k, r, c]) => <button key={k} onClick={() => mudarPrefs({ fonte: k })} className={`rounded-lg border px-3 py-1.5 text-sm ${c} ${(prefs.fonte || 'padrao') === k ? 'border-[var(--ia-acento)] font-medium' : 'border-[var(--ia-borda)]'}`}>{r}</button>)}</div></Linha>
            <Linha titulo="Largura das conversas" ajuda="Larga ajuda a ler código e tabelas."><div className="flex gap-1">{[['padrao', 'Padrão'], ['larga', 'Larga']].map(([k, r]) => <button key={k} onClick={() => mudarPrefs({ largura: k })} className={`rounded-lg border px-3 py-1.5 text-sm ${(prefs.largura || 'padrao') === k ? 'border-[var(--ia-acento)] font-medium' : 'border-[var(--ia-borda)]'}`}>{r}</button>)}</div></Linha>
            <Linha titulo="Sugestões na tela inicial"><Interruptor ligado={prefs.sugestoes !== false} onChange={(v) => mudarPrefs({ sugestoes: v })} rotulo="Sugestões" /></Linha>
          </>)}
          {aba === 'personalizacao' && (<>
            <h3 className="text-base font-semibold">Personalização</h3>
            <label className="mt-3 block"><span className="text-sm">Instruções para todas as conversas</span>
              <textarea className="campo mt-1 min-h-32 w-full py-2" maxLength={1500} key={prefs.instrucoes} defaultValue={prefs.instrucoes || ''} onBlur={(e) => e.target.value !== (prefs.instrucoes || '') && mudarPrefs({ instrucoes: e.target.value })}
                placeholder="Ex.: sou da manutenção; prefiro o nome da sala primeiro; sempre sugira a temperatura econômica." />
              <span className="text-xs text-[var(--ia-suave)]">As regras de segurança do assistente continuam valendo.</span></label>
            <Linha titulo="Estilo padrão"><div className="flex flex-wrap gap-1">{ESTILOS.map(([k, r]) => <button key={k} onClick={() => mudarPrefs({ estilo: k })} className={`rounded-lg border px-3 py-1.5 text-sm ${prefs.estilo === k ? 'border-[var(--ia-acento)] font-medium' : 'border-[var(--ia-borda)]'}`}>{r}</button>)}</div></Linha>
            <Linha titulo="Esforço padrão" ajuda="Também dá para trocar em cada mensagem, no seletor de modelo."><select className="campo h-9 w-44" value={prefs.esforco || 'medio'} onChange={(e) => mudarPrefs({ esforco: e.target.value })}>{ESFORCOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Linha>
          </>)}
          {aba === 'capacidades' && (<>
            <h3 className="text-base font-semibold">Capacidades</h3>
            <Linha titulo="Agir nos ares e dispositivos" ajuda="Desligado, o assistente só consulta e propõe (como o modo plano). Ações em lote sempre pedem Confirmar."><Interruptor ligado={prefs.agir !== false} onChange={(v) => mudarPrefs({ agir: v })} rotulo="Agir" /></Linha>
            <Linha titulo="Ler respostas em voz alta" ajuda="Voz em português do próprio aparelho."><Interruptor ligado={!!prefs.voz} onChange={(v) => mudarPrefs({ voz: v })} rotulo="Voz" /></Linha>
            <Linha titulo="Imagens" ajuda="Prints e fotos do controle vão para o modelo que enxerga imagens."><span className="text-xs text-[var(--ia-suave)]">sempre disponível</span></Linha>
            <Linha titulo="Mensagens de voz" ajuda="Grava, transcreve e envia (Ctrl/⌘+Shift+V)."><span className="text-xs text-[var(--ia-suave)]">sempre disponível</span></Linha>
            <Linha titulo="Projetos" ajuda="Instruções e arquivos (ou um repositório do GitHub) usados como contexto."><span className="text-xs text-[var(--ia-suave)]">no botão Projeto da caixa de mensagem</span></Linha>
          </>)}
          {aba === 'notificacoes' && (<>
            <h3 className="text-base font-semibold">Notificações</h3>
            <Linha titulo="Avisar quando a resposta chegar" ajuda="Com a aba escondida, o navegador mostra um aviso.">
              <Interruptor ligado={!!prefs.notificar} onChange={async (v) => { if (v && 'Notification' in window && Notification.permission !== 'granted') { const p = await Notification.requestPermission(); if (p !== 'granted') return toast('O navegador não deu permissão para avisos.', 'erro') } mudarPrefs({ notificar: v }) }} rotulo="Avisar" />
            </Linha>
          </>)}
          {aba === 'privacidade' && (<>
            <h3 className="text-base font-semibold">Privacidade</h3>
            <p className="mt-2 text-sm text-[var(--ia-suave)]">As conversas e os projetos são só seus (nem o dono vê). Nenhuma senha ou chave vai para o modelo: as ferramentas devolvem só nomes, estados e mensagens.</p>
            <Linha titulo="Exportar meus dados" ajuda="Conversas, projetos e preferências em JSON.">
              <Botao tamanho="sm" variante="secundario" icone={Download} onClick={async () => { const d = await api.get('/api/ia/exportar'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' })); a.download = `assistente-${new Date().toISOString().slice(0, 10)}.json`; a.click() }}>Exportar</Botao>
            </Linha>
            <Linha titulo="Apagar todas as conversas" ajuda="Não dá para desfazer. Os projetos continuam.">
              <Botao tamanho="sm" variante="perigo" icone={Trash2} onClick={async () => { if (!await confirmar('Apagar todas as suas conversas com o assistente? Não dá para desfazer.')) return; const r = await api.del('/api/ia/conversas'); toast(`${r.apagadas} conversa(s) apagada(s).`); fechar(true) }}>Apagar tudo</Botao>
            </Linha>
          </>)}
          {aba === 'uso' && (<><h3 className="mb-2 text-base font-semibold">Uso</h3>{UsoIA}</>)}
          {aba === 'chave' && (<><h3 className="text-base font-semibold">Chave e modelos</h3><p className="mt-2 text-sm text-[var(--ia-suave)]">Chave da NVIDIA, modelo padrão, terminal (clima-ia) e Telegram.</p><Botao className="mt-3" tamanho="sm" onClick={abrirChave}>Abrir configuração</Botao></>)}
        </div>
      </div>
    </Modal>
  )
}

// ---------- seletor de modelo no estilo do Claude ----------
export function SeletorModelo({ modelo, setModelo, modelos, esforco, setEsforco, IconeIA }) {
  const [aberto, setAberto] = useState(false)
  const [sub, setSub] = useState(null)   // 'esforco' | 'mais'
  const [q, setQ] = useState('')
  const fora = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const f = (e) => { if (fora.current && !fora.current.contains(e.target)) { setAberto(false); setSub(null) } }
    const esc = (e) => { if (e.key === 'Escape') { setAberto(false); setSub(null) } }
    document.addEventListener('mousedown', f); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', f); document.removeEventListener('keydown', esc) }
  }, [aberto])
  const atual = modelos.find((m) => m.id === modelo)
  const principais = modelos.filter((m) => m.ferramentas).slice(0, 4)
  const mais = modelos.filter((m) => !principais.includes(m) && (!q || `${m.nome} ${m.descricao}`.toLowerCase().includes(q.toLowerCase())))
  const nomeEsf = ESFORCOS.find(([k]) => k === (esforco || 'medio'))?.[1]
  const item = (m, curto) => (
    <button key={m.id} onClick={() => { setModelo(m.id); setAberto(false); setSub(null) }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--ia-realce)] ${m.id === modelo ? 'bg-[var(--ia-realce)]/60' : ''}`}>
      {IconeIA && <IconeIA empresa={m.empresa} className="mt-0.5 h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 font-medium">{m.nome}{!m.ferramentas && <span className="rounded border border-[var(--ia-borda)] px-1 text-[10px] font-normal text-[var(--ia-suave)]">só texto</span>}{m.ritmo === 'instavel' && <span className="rounded border border-amber-500/40 px-1 text-[10px] font-normal text-amber-600 dark:text-amber-400">instável</span>}</span>
        {!curto && <span className="block text-xs text-[var(--ia-suave)]">{m.descricao}</span>}</span>
      {m.id === modelo && <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />}
    </button>
  )
  return (
    <div className="relative" ref={fora}>
      <button onClick={() => { setAberto((v) => !v); setSub(null) }} aria-expanded={aberto} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-[var(--ia-texto)] hover:bg-[var(--ia-realce)]">
        {atual?.nome || 'Modelo'}<span className="text-[var(--ia-suave)]">{nomeEsf}</span>
      </button>
      {aberto && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--ia-borda)] bg-[var(--ia-caixa)] p-1 text-sm shadow-lg">{/* marca: escolha do modelo flutua */}
          {principais.map((m) => item(m))}
          <div className="my-1 border-t border-[var(--ia-borda)]" />
          <button onClick={() => setSub(sub === 'esforco' ? null : 'esforco')} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)] ${sub === 'esforco' ? 'bg-[var(--ia-realce)]' : ''}`}><span className="flex items-center gap-2"><Brain className="h-4 w-4 text-[var(--ia-suave)]" />Esforço</span><span className="flex items-center gap-1 text-[var(--ia-suave)]">{nomeEsf}<ChevronRight className="h-4 w-4" /></span></button>
          <button onClick={() => setSub(sub === 'mais' ? null : 'mais')} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)] ${sub === 'mais' ? 'bg-[var(--ia-realce)]' : ''}`}><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--ia-suave)]" />Mais modelos</span><ChevronRight className="h-4 w-4 text-[var(--ia-suave)]" /></button>
          <p className="border-t border-[var(--ia-borda)] px-3 pb-1.5 pt-2 text-[11px] text-[var(--ia-suave)]">Modelos gratuitos da NVIDIA. Os marcados "só texto" respondem, mas não agem nos ares.</p>
          {sub && (
            <div className="absolute bottom-0 right-full mr-2 max-h-[70vh] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-[var(--ia-borda)] bg-[var(--ia-caixa)] p-1 shadow-lg max-sm:right-0 max-sm:bottom-full max-sm:mb-2 max-sm:mr-0">{/* marca: submenu flutua */}
              {sub === 'esforco' ? ESFORCOS.map(([k, r, d]) => (
                <button key={k} onClick={() => { setEsforco(k); setSub(null) }} className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-[var(--ia-realce)]"><span><span className="block font-medium">{r}</span><span className="block text-xs text-[var(--ia-suave)]">{d}</span></span>{(esforco || 'medio') === k && <Check className="mt-0.5 h-4 w-4 text-sky-500" />}</button>
              )) : (<>
                <label className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5"><Search className="h-4 w-4 text-[var(--ia-suave)]" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar modelo" type="search" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Procurar modelo" /></label>
                {mais.map((m) => item(m, true))}
                {!mais.length && <p className="px-3 py-3 text-[var(--ia-suave)]">Nenhum.</p>}
              </>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- projetos ----------
const lerBase64 = (f) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = erro; r.readAsDataURL(f) })
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} M` : n >= 1000 ? `${Math.round(n / 1000)} mil` : `${n}`)

export function SeletorProjeto({ projetoId, setProjetoId, projetos, abrirProjetos, novoProjeto }) {
  const [aberto, setAberto] = useState(false)
  const [q, setQ] = useState('')
  const fora = useRef(null)
  useEffect(() => {
    if (!aberto) return undefined
    const f = (e) => { if (fora.current && !fora.current.contains(e.target)) setAberto(false) }
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f)
  }, [aberto])
  const atual = projetos.find((p) => p.id === projetoId)
  const lista = projetos.filter((p) => !q || p.nome.toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="relative" ref={fora}>
      <button onClick={() => setAberto((v) => !v)} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${atual ? 'bg-[var(--ia-realce)] text-[var(--ia-texto)]' : 'text-[var(--ia-suave)] hover:bg-[var(--ia-realce)]'}`} title="Projeto (contexto da conversa)">
        <FolderOpen className="h-4 w-4" /><span className="max-w-[9rem] truncate">{atual ? atual.nome : 'Projeto'}</span>
        {atual && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setProjetoId(null) }} onKeyDown={(e) => e.key === 'Enter' && setProjetoId(null)} aria-label="Tirar o projeto"><X className="h-3 w-3" /></span>}
      </button>
      {aberto && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-xl border border-[var(--ia-borda)] bg-[var(--ia-caixa)] p-1 text-sm shadow-lg">{/* marca: lista de projetos flutua */}
          <label className="flex items-center gap-2 rounded-lg px-2 py-1.5"><Search className="h-4 w-4 text-[var(--ia-suave)]" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar projetos" type="search" autoComplete="off" className="min-w-0 flex-1 bg-transparent outline-none" aria-label="Procurar projetos" /></label>
          <div className="max-h-60 overflow-y-auto">
            {lista.map((p) => <button key={p.id} onClick={() => { setProjetoId(p.id); setAberto(false) }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-[var(--ia-realce)]"><FolderOpen className="h-4 w-4 text-[var(--ia-suave)]" /><span className="min-w-0 flex-1 truncate">{p.nome}</span>{p.id === projetoId && <Check className="h-4 w-4 text-sky-500" />}</button>)}
            {!lista.length && <p className="px-3 py-2 text-[var(--ia-suave)]">{projetos.length ? 'Nenhum com esse nome.' : 'Nenhum projeto ainda.'}</p>}
          </div>
          <div className="border-t border-[var(--ia-borda)] pt-1">
            <button onClick={() => { setAberto(false); novoProjeto() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-[var(--ia-realce)]"><Plus className="h-4 w-4" />Novo projeto</button>
            <button onClick={() => { setAberto(false); abrirProjetos() }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[var(--ia-suave)] hover:bg-[var(--ia-realce)]"><FolderGit2 className="h-4 w-4" />Gerenciar projetos</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProjetosIA({ fechar, projetos, recarregar, usar, abrirConversa, inicial }) {
  const toast = useToast()
  const [sel, setSel] = useState(inicial ?? null)    // id, 'novo' ou null (lista)
  const [d, setD] = useState(null)
  const [f, setF] = useState({ nome: '', descricao: '', instrucoes: '' })
  const [repo, setRepo] = useState({ repo: '', ref: '' })
  const [ocupado, setOcupado] = useState('')
  const [q, setQ] = useState('')
  const arq = useRef(null)
  useEffect(() => {
    if (typeof sel !== 'number') { setD(null); setF({ nome: '', descricao: '', instrucoes: '' }); return }
    api.get(`/api/ia/projetos/${sel}`).then((r) => { setD(r); setF({ nome: r.nome, descricao: r.descricao, instrucoes: r.instrucoes }) }).catch((e) => toast(e.message, 'erro'))
  }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async () => {
    setOcupado('salvar')
    try {
      if (sel === 'novo') { const r = await api.post('/api/ia/projetos', f); recarregar(); setSel(r.id); toast('Projeto criado. Agora adicione arquivos ou um repositório.') }
      else { setD(await api.put(`/api/ia/projetos/${sel}`, f)); recarregar(); toast('Projeto salvo.') }
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const enviar = async (lista) => {
    const arquivos = [...lista]
    if (!arquivos.length) return
    const total = arquivos.reduce((a, x) => a + x.size, 0)
    if (total > 3_000_000) return toast('Até 3 MB por envio (o servidor recusa pedidos maiores). Envie em partes ou ligue o repositório do GitHub.', 'erro')
    setOcupado('arquivos')
    try {
      const corpo = await Promise.all(arquivos.map(async (x) => ({ nome: x.webkitRelativePath || x.name, base64: await lerBase64(x) })))
      const r = await api.post(`/api/ia/projetos/${sel}/arquivos`, { arquivos: corpo })
      setD(r); recarregar(); toast(`${r.adicionados} arquivo(s) de texto adicionado(s)${r.fora_do_limite ? `; ${r.fora_do_limite} ficaram de fora (limite do projeto)` : ''}.`)
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const ligarRepo = async () => {
    setOcupado('github')
    try { const r = await api.post(`/api/ia/projetos/${sel}/github`, repo); setD(r); recarregar(); toast(`${r.adicionados} arquivo(s) do repositório importado(s).`) }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const tirar = async (nomes) => { try { setD(await api.post(`/api/ia/projetos/${sel}/arquivos/tirar`, { nomes })); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const apagar = async () => {
    if (!await confirmar('Apagar este projeto? As conversas dele continuam, fora do projeto.')) return
    await api.del(`/api/ia/projetos/${sel}`); recarregar(); setSel(null)
  }
  const visiveis = projetos.filter((p) => !q || p.nome.toLowerCase().includes(q.toLowerCase()))
  return (
    <Modal aberto titulo={sel === null ? 'Projetos' : sel === 'novo' ? 'Novo projeto' : d?.nome || 'Projeto'} onFechar={fechar} largura="max-w-3xl">
      {sel === null ? (
        <div>
          <div className="flex gap-2"><label className="flex flex-1 items-center gap-2 rounded-lg border border-[var(--ia-borda)] px-2.5"><Search className="h-4 w-4 text-[var(--ia-suave)]" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar projetos" type="search" autoComplete="off" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" aria-label="Procurar projetos" /></label><Botao icone={Plus} onClick={() => setSel('novo')}>Novo projeto</Botao></div>
          <p className="mt-3 text-sm text-[var(--ia-suave)]">Um projeto junta instruções e arquivos (código, documentos, planilhas em CSV) que o assistente usa como contexto em todas as conversas dele. Dá para enviar um .zip do projeto ou ligar um repositório do GitHub.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visiveis.map((p) => (
              <button key={p.id} onClick={() => setSel(p.id)} className="rounded-xl border border-[var(--ia-borda)] p-4 text-left hover:bg-[var(--ia-realce)]">
                <span className="flex items-center gap-2 font-medium">{p.github ? <Github className="h-4 w-4" /> : <FolderOpen className="h-4 w-4" />}{p.nome}</span>
                {p.descricao && <span className="mt-1 block text-sm text-[var(--ia-suave)]">{p.descricao}</span>}
                <span className="mt-2 block text-xs text-[var(--ia-suave)]">{p.arquivos.length} arquivo(s) · {kb(p.caracteres)} caracteres · {p.conversas} conversa(s) · {haQuanto(p.atualizado_em)}</span>
              </button>))}
            {!visiveis.length && <p className="text-sm text-[var(--ia-suave)]">{projetos.length ? 'Nenhum com esse nome.' : 'Nenhum projeto ainda.'}</p>}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-3">
            {sel !== 'novo' && <button onClick={() => setSel(null)} className="text-xs text-[var(--ia-suave)] hover:underline">← Todos os projetos</button>}
            <label className="block text-sm">Nome<input autoFocus={sel === 'novo'} className="campo mt-1" value={f.nome} maxLength={80} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Sistema do restaurante" /></label>
            <label className="block text-sm">Descrição<input className="campo mt-1" value={f.descricao} maxLength={500} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Para que serve" /></label>
            <label className="block text-sm">Instruções do projeto<textarea className="campo mt-1 min-h-28 w-full py-2" maxLength={8000} value={f.instrucoes} onChange={(e) => setF({ ...f, instrucoes: e.target.value })} placeholder="Ex.: o projeto é em React + FastAPI; responda com o caminho do arquivo antes do código; siga o padrão dos arquivos enviados." /></label>
            <div className="flex flex-wrap gap-2"><Botao carregando={ocupado === 'salvar'} disabled={!f.nome.trim()} onClick={salvar}>{sel === 'novo' ? 'Criar projeto' : 'Salvar'}</Botao>
              {d && <Botao variante="secundario" onClick={() => { usar(d.id); fechar() }}>Conversar neste projeto</Botao>}
              {d && <Botao variante="fantasma" icone={Trash2} onClick={apagar}>Apagar</Botao>}</div>
            {d && (
              <div className="pt-3">
                <h4 className="text-sm font-semibold">Conversas do projeto</h4>
                <ul className="mt-1 space-y-0.5">{d.lista_conversas.map((c) => <li key={c.id}><button onClick={() => { abrirConversa(c.id, d.id); fechar() }} className="w-full truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--ia-realce)]">{c.titulo}</button></li>)}
                  {!d.lista_conversas.length && <li className="text-sm text-[var(--ia-suave)]">Nenhuma ainda.</li>}</ul>
              </div>
            )}
          </div>
          <aside className="space-y-3">
            {d ? (<>
              <div className="rounded-xl border border-[var(--ia-borda)] p-3">
                <p className="text-sm font-semibold">Conhecimento do projeto</p>
                <p className="text-xs text-[var(--ia-suave)]">{d.arquivos.length} arquivo(s) · {kb(d.caracteres)} caracteres (até 1,5 M)</p>
                <input ref={arq} type="file" multiple className="hidden" onChange={(e) => { enviar(e.target.files); e.target.value = '' }} />
                <div className="mt-2 flex flex-wrap gap-1.5"><Botao tamanho="sm" variante="secundario" icone={Upload} carregando={ocupado === 'arquivos'} onClick={() => arq.current?.click()}>Arquivos ou .zip</Botao></div>
                <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-xs">{d.arquivos.map((a) => (
                  <li key={a.nome} className="group flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-[var(--ia-realce)]"><FileCode2 className="h-3.5 w-3.5 shrink-0 text-[var(--ia-suave)]" /><span className="min-w-0 flex-1 truncate" title={a.nome}>{a.nome}</span><span className="text-[var(--ia-suave)]">{kb(a.tamanho)}</span>
                    <button onClick={() => tirar([a.nome])} className="opacity-0 group-hover:opacity-100" aria-label={`Tirar ${a.nome}`}><X className="h-3 w-3" /></button></li>))}</ul>
                {d.arquivos.length > 0 && <button onClick={() => tirar(d.arquivos.map((a) => a.nome))} className="mt-1 text-xs text-red-600 hover:underline">Tirar todos</button>}
              </div>
              <div className="rounded-xl border border-[var(--ia-borda)] p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold"><Github className="h-4 w-4" />Repositório do GitHub</p>
                {d.github && <p className="mt-1 text-xs text-[var(--ia-suave)]"><a href={d.github.url} target="_blank" rel="noreferrer" className="underline">{d.github.repo}</a> · {d.github.ref} · importado {haQuanto(d.github.importado_em)}</p>}
                <input className="campo mt-2 h-8 text-sm" placeholder="dono/repositorio ou link" value={repo.repo} onChange={(e) => setRepo({ ...repo, repo: e.target.value })} />
                <input className="campo mt-1.5 h-8 text-sm" placeholder="Branch (opcional)" value={repo.ref} onChange={(e) => setRepo({ ...repo, ref: e.target.value })} />
                <Botao className="mt-2 w-full" tamanho="sm" variante="secundario" carregando={ocupado === 'github'} disabled={repo.repo.trim().length < 3} onClick={ligarRepo}>{d.github ? 'Importar de novo' : 'Importar'}</Botao>
                <p className="mt-1.5 text-[11px] text-[var(--ia-suave)]">Repositórios públicos; os privados só se o token de leitura de Apps tiver acesso. Ficam de fora binários, node_modules e .env.</p>
              </div>
            </>) : <p className="text-sm text-[var(--ia-suave)]">Crie o projeto para adicionar arquivos ou um repositório.</p>}
          </aside>
        </div>
      )}
    </Modal>
  )
}
