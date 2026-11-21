import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Copy, Download, Eye, Image, LayoutTemplate, List, Mail, Minus, Monitor, MousePointerClick, Newspaper, Plus, Save,
  Send, Smartphone, Sparkles, SquareStack, Trash2, Type, UserPlus, Users, Wand2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, FaixaMetricas, Interruptor, Modal, Secao, Selo, confirmar as perguntar, useToast } from '../ui'

// Newsletter (backend/app/newsletter.py): campanhas com modelos visuais e blocos, prévia ao vivo, geração pela IA, envio de
// teste, agendamento e envio para quem confirmou a inscrição; inscritos com confirmação por e-mail (LGPD).
const COR_ESTADO = { rascunho: 'cinza', agendada: 'azul', enviando: 'ambar', enviada: 'verde' }
const COR_INSCRITO = { ativo: 'verde', pendente: 'ambar', cancelado: 'cinza', devolvido: 'vermelho' }
const BLOCOS = [
  ['titulo', 'Título', Type, { texto: 'Título da seção' }],
  ['texto', 'Texto', Type, { texto: 'Escreva aqui. Aceita **negrito** e [links](https://zynio.com.br).' }],
  ['lista', 'Lista', List, { itens: ['Primeiro item', 'Segundo item'] }],
  ['destaque', 'Destaque', SquareStack, { titulo: 'Destaque', texto: 'Um recado importante.' }],
  ['cartoes', 'Cartões', LayoutTemplate, { itens: [{ titulo: 'Recurso', texto: 'O que ele faz.', link: 'https://zynio.com.br/funcionalidades' }, { titulo: 'Outro recurso', texto: 'O que ele faz.', link: '' }] }],
  ['versao', 'Versão do sistema', Newspaper, { versao: '' }],
  ['imagem', 'Imagem', Image, { url: 'https://zynio.com.br/telas/painel.jpg', alt: 'Painel do Clima Escritório', link: '' }],
  ['botao', 'Botão', MousePointerClick, { rotulo: 'Ver as novidades', url: 'https://zynio.com.br/novidades' }],
  ['divisor', 'Divisor', Minus, {}],
]
const NOME_BLOCO = Object.fromEntries(BLOCOS.map((b) => [b[0], b[1]]))
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-')

function logoEmbutido() {
  return fetch('/icone-192.png').then((r) => r.blob()).then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b) })).catch(() => null)
}

function EditorBloco({ b, versoes, mudar }) {
  const campo = 'campo h-9 w-full'
  if (b.tipo === 'titulo') return <input className={campo} value={b.texto || ''} onChange={(e) => mudar({ texto: e.target.value })} placeholder="Título" />
  if (b.tipo === 'texto') return <textarea className="campo min-h-24 w-full py-2" value={b.texto || ''} onChange={(e) => mudar({ texto: e.target.value })} placeholder="Texto (**negrito**, [link](https://…))" />
  if (b.tipo === 'lista') return <textarea className="campo min-h-20 w-full py-2" value={(b.itens || []).join('\n')} onChange={(e) => mudar({ itens: e.target.value.split('\n') })} placeholder="Um item por linha" />
  if (b.tipo === 'destaque') return <div className="space-y-2"><input className={campo} value={b.titulo || ''} onChange={(e) => mudar({ titulo: e.target.value })} placeholder="Título do destaque" /><textarea className="campo min-h-16 w-full py-2" value={b.texto || ''} onChange={(e) => mudar({ texto: e.target.value })} placeholder="Texto" /></div>
  if (b.tipo === 'botao') return <div className="grid gap-2 sm:grid-cols-2"><input className={campo} value={b.rotulo || ''} onChange={(e) => mudar({ rotulo: e.target.value })} placeholder="Rótulo" /><input className={campo} value={b.url || ''} onChange={(e) => mudar({ url: e.target.value })} placeholder="https://…" /></div>
  if (b.tipo === 'imagem') return <div className="grid gap-2 sm:grid-cols-2"><input className={`${campo} sm:col-span-2`} value={b.url || ''} onChange={(e) => mudar({ url: e.target.value })} placeholder="Endereço da imagem (https://…)" /><input className={campo} value={b.alt || ''} onChange={(e) => mudar({ alt: e.target.value })} placeholder="Descrição (texto alternativo)" /><input className={campo} value={b.link || ''} onChange={(e) => mudar({ link: e.target.value })} placeholder="Link ao clicar (opcional)" /></div>
  if (b.tipo === 'versao') return <select className={campo} value={b.versao || ''} onChange={(e) => mudar({ versao: e.target.value })}><option value="">Escolha a versão…</option>{versoes.map((v) => <option key={v.versao} value={v.versao}>{v.versao} · {v.titulo}</option>)}</select>
  if (b.tipo === 'cartoes') return (
    <div className="space-y-2">{(b.itens || []).map((x, i) => (
      <div key={i} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_auto]">
        <input className={campo} value={x.titulo || ''} onChange={(e) => mudar({ itens: b.itens.map((y, j) => (j === i ? { ...y, titulo: e.target.value } : y)) })} placeholder="Título" />
        <input className={campo} value={x.link || ''} onChange={(e) => mudar({ itens: b.itens.map((y, j) => (j === i ? { ...y, link: e.target.value } : y)) })} placeholder="Link (opcional)" />
        <button className="rounded p-2 text-muted-foreground hover:bg-muted" onClick={() => mudar({ itens: b.itens.filter((_, j) => j !== i) })} aria-label="Tirar cartão"><Trash2 className="h-4 w-4" /></button>
        <textarea className="campo min-h-14 w-full py-2 sm:col-span-3" value={x.texto || ''} onChange={(e) => mudar({ itens: b.itens.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)) })} placeholder="Texto" />
      </div>))}
      {(b.itens || []).length < 6 && <Botao tamanho="sm" variante="secundario" icone={Plus} onClick={() => mudar({ itens: [...(b.itens || []), { titulo: '', texto: '', link: '' }] })}>Cartão</Botao>}
    </div>
  )
  return <p className="text-xs text-muted-foreground">Linha fina para separar seções.</p>
}

function GerarIa({ aberto, onFechar, aoGerar, modelos }) {
  const toast = useToast()
  const [f, setF] = useState({ tema: 'Resumo das novidades das últimas versões do sistema', tom: 'profissional', modelo: 'destaque', versoes: 3, tamanho: 'media', publico: '' })
  const [gerando, setGerando] = useState(false)
  const gerar = async () => {
    setGerando(true)
    try { const r = await api.post('/api/newsletter/ia', f); aoGerar(r); onFechar() } catch (e) { toast(e.message, 'erro') } finally { setGerando(false) }
  }
  return (
    <Modal aberto={aberto} titulo="Gerar newsletter com IA" onFechar={onFechar} largura="max-w-xl">
      <div className="space-y-3 text-sm">
        <label className="block"><span className="rotulo">Sobre o que é</span><textarea className="campo mt-1 min-h-20 w-full py-2" value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} maxLength={500} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="rotulo">Tom</span><select className="campo mt-1 h-9 w-full" value={f.tom} onChange={(e) => setF({ ...f, tom: e.target.value })}>{['profissional', 'próximo e simples', 'técnico', 'entusiasmado, sem exagero'].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label><span className="rotulo">Tamanho</span><select className="campo mt-1 h-9 w-full" value={f.tamanho} onChange={(e) => setF({ ...f, tamanho: e.target.value })}><option value="curta">Curta</option><option value="media">Média</option><option value="longa">Longa</option></select></label>
          <label><span className="rotulo">Modelo visual</span><select className="campo mt-1 h-9 w-full" value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })}>{Object.entries(modelos).map(([k, m]) => <option key={k} value={k}>{m.nome}</option>)}</select></label>
          <label><span className="rotulo">Usar as últimas versões</span><select className="campo mt-1 h-9 w-full" value={f.versoes} onChange={(e) => setF({ ...f, versoes: +e.target.value })}>{[1, 2, 3, 5, 8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
        </div>
        <label className="block"><span className="rotulo">Para quem (opcional)</span><input className="campo mt-1 h-9 w-full" value={f.publico} onChange={(e) => setF({ ...f, publico: e.target.value })} placeholder="Ex.: gestores do escritório, equipe de TI" maxLength={200} /></label>
        <p className="text-xs text-muted-foreground">A IA usa só os fatos das versões publicadas e do que o sistema faz: sem números, depoimentos ou promessas inventados. Revise antes de enviar.</p>
        <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao icone={Sparkles} carregando={gerando} onClick={gerar}>{gerando ? 'Escrevendo…' : 'Gerar'}</Botao></div>
      </div>
    </Modal>
  )
}

function Editor({ id, estado, voltar, meuEmail }) {
  const toast = useToast()
  const [c, setC] = useState(null)
  const [html, setHtml] = useState('')
  const [tela, setTela] = useState('computador')
  const [ia, setIa] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [para, setPara] = useState(meuEmail || '')
  const [enviando, setEnviando] = useState(null)
  const [confirmar, setConfirmar] = useState(false)
  const [agenda, setAgenda] = useState('')
  const logo = useRef(null)
  const sujo = useRef(false)
  useEffect(() => { logoEmbutido().then((l) => { logo.current = l }) }, [])
  useEffect(() => { api.get(`/api/newsletter/campanhas/${id}`).then((r) => { setC(r); setAgenda(r.agendada_para ? new Date(r.agendada_para * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '') }).catch((e) => toast(e.message, 'erro')) }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  // prévia ao vivo (400 ms depois de parar de digitar)
  useEffect(() => {
    if (!c) return undefined
    const t = setTimeout(() => {
      api.texto('/api/newsletter/previa', { titulo: c.titulo, assunto: c.assunto, previa: c.previa, modelo: c.modelo, cor: c.cor, blocos: c.blocos })
        .then((h) => setHtml(logo.current ? h.replaceAll('https://app.zynio.com.br/icone-192.png', logo.current) : h)).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [c?.titulo, c?.assunto, c?.previa, c?.modelo, c?.cor, JSON.stringify(c?.blocos)]) // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = (m) => { sujo.current = true; setC((x) => ({ ...x, ...m })) }
  const mudarBloco = (i, m) => mudar({ blocos: c.blocos.map((b, j) => (j === i ? { ...b, ...m } : b)) })
  const mover = (i, d) => { const b = [...c.blocos]; const [x] = b.splice(i, 1); b.splice(i + d, 0, x); mudar({ blocos: b }) }
  const enviada = c && ['enviando', 'enviada'].includes(c.estado)
  const salvar = async (extra = {}) => {
    setSalvando(true)
    try { const r = await api.put(`/api/newsletter/campanhas/${id}`, { titulo: c.titulo, assunto: c.assunto, previa: c.previa, modelo: c.modelo, cor: c.cor || '', blocos: c.blocos, ...extra }); setC((x) => ({ ...x, ...r })); sujo.current = false; return true }
    catch (e) { toast(e.message, 'erro'); return false } finally { setSalvando(false) }
  }
  const testar = async () => { if (sujo.current && !(await salvar())) return; setEnviando('teste'); try { await api.post(`/api/newsletter/campanhas/${id}/teste`, { para }); toast(`Teste enviado para ${para}.`) } catch (e) { toast(e.message, 'erro') } finally { setEnviando(null) } }
  const agendar = async (limpar = false) => {
    const ts = limpar ? null : Math.floor(new Date(agenda).getTime() / 1000)
    if (!limpar && !(ts > Date.now() / 1000)) return toast('Escolha uma data e hora no futuro.', 'erro')
    if (await salvar({ agendada_para: ts })) toast(limpar ? 'Agendamento tirado.' : 'Agendada. O agente do escritório envia na hora marcada.')
    return null
  }
  const enviarTodos = async () => {
    setConfirmar(false)
    if (sujo.current && !(await salvar())) return
    setEnviando('todos')
    try {
      let r
      do { r = await api.post(`/api/newsletter/campanhas/${id}/enviar`); setC((x) => ({ ...x, estado: r.estado, enviados: r.enviados, total: r.total })) } while (r.estado === 'enviando')
      toast(`Enviada para ${r.enviados} de ${r.total}.`)
    } catch (e) { toast(e.message, 'erro') } finally { setEnviando(null) }
  }
  if (!c) return <Esqueleto className="h-96" />
  const st = c.estatisticas?.por_estado || {}
  const entregues = (st.entregue || 0) + (st.aberto || 0) + (st.clicado || 0)
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Botao variante="secundario" tamanho="sm" icone={ArrowLeft} onClick={async () => { if (!sujo.current || (await perguntar('Sair sem salvar as mudanças?', { ok: 'Sair sem salvar' }))) voltar() }}>Campanhas</Botao>
        <Selo cor={COR_ESTADO[c.estado]}>{c.estado}</Selo>{c.ia && <Selo cor="azul">IA</Selo>}
        {c.agendada_para && c.estado === 'agendada' && <span className="text-xs text-muted-foreground">sai em {new Date(c.agendada_para * 1000).toLocaleString('pt-BR')}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {!enviada && <Botao tamanho="sm" variante="secundario" icone={Wand2} onClick={() => setIa(true)} disabled={!estado.ia}>Reescrever com IA</Botao>}
          {!enviada && <Botao tamanho="sm" icone={Save} carregando={salvando} onClick={() => salvar().then((ok) => ok && toast('Salvo.'))}>Salvar</Botao>}
        </div>
      </div>
      {enviada && (
        <div className="mb-4"><FaixaMetricas itens={[
          { rotulo: 'Enviados', valor: c.enviados || 0, dica: `de ${c.total} inscritos ativos` },
          { rotulo: 'Entregues', valor: entregues, dica: pct(entregues, c.enviados) },
          { rotulo: 'Abertos', valor: (st.aberto || 0) + (st.clicado || 0), dica: `${pct((st.aberto || 0) + (st.clicado || 0), entregues)} dos entregues` },
          { rotulo: 'Cliques', valor: st.clicado || 0, dica: `devolvidos ${st.devolvido || 0} · falhas ${st.falhou || 0}`, tom: st.devolvido || st.falhou ? 'ruim' : undefined },
        ]} /></div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset disabled={enviada} className="min-w-0 space-y-4">
          <Secao titulo="Cabeçalho do e-mail">
            <div className="grid gap-3">
              <label><span className="rotulo">Assunto</span><input className="campo mt-1 h-9 w-full" maxLength={150} value={c.assunto} onChange={(e) => mudar({ assunto: e.target.value })} placeholder="O que aparece na caixa de entrada" /></label>
              <label><span className="rotulo">Prévia (texto ao lado do assunto)</span><input className="campo mt-1 h-9 w-full" maxLength={200} value={c.previa} onChange={(e) => mudar({ previa: e.target.value })} /></label>
              <label><span className="rotulo">Título dentro do e-mail</span><input className="campo mt-1 h-9 w-full" maxLength={150} value={c.titulo} onChange={(e) => mudar({ titulo: e.target.value })} /></label>
              <div>
                <span className="rotulo">Modelo</span>
                <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(estado.modelos).map(([k, m]) => (
                  <button key={k} type="button" onClick={() => mudar({ modelo: k })} className={`rounded-lg border p-2.5 text-left text-xs ${c.modelo === k ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                    <p className="text-sm font-medium">{m.nome}</p><p className="mt-0.5 text-muted-foreground">{m.descricao}</p></button>))}
                </div>
              </div>
              <label className="flex items-center gap-3"><span className="rotulo">Cor de destaque</span><input type="color" value={c.cor || '#0f766a'} onChange={(e) => mudar({ cor: e.target.value })} className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent" />
                {c.cor && <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => mudar({ cor: '' })}>usar a cor da marca</button>}</label>
            </div>
          </Secao>
          <Secao titulo={`Conteúdo (${c.blocos.length} blocos)`} contexto="Monte o e-mail bloco a bloco; a prévia ao lado atualiza sozinha">
            <ol className="space-y-3">{c.blocos.map((b, i) => (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-1"><span className="flex-1 text-xs font-medium text-muted-foreground">{i + 1}. {NOME_BLOCO[b.tipo] || b.tipo}</span>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={!i} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={i === c.blocos.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => mudar({ blocos: [...c.blocos.slice(0, i + 1), JSON.parse(JSON.stringify(b)), ...c.blocos.slice(i + 1)] })} aria-label="Duplicar bloco"><Copy className="h-4 w-4" /></button>
                  <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={() => mudar({ blocos: c.blocos.filter((_, j) => j !== i) })} aria-label="Tirar bloco"><Trash2 className="h-4 w-4" /></button>
                </div>
                <EditorBloco b={b} versoes={estado.versoes} mudar={(m) => mudarBloco(i, m)} />
              </li>))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5">{BLOCOS.map(([k, n, I, base]) => (
              <button key={k} type="button" onClick={() => mudar({ blocos: [...c.blocos, { tipo: k, ...JSON.parse(JSON.stringify(base)), ...(k === 'versao' ? { versao: estado.versoes[0]?.versao || '' } : {}) }] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"><I className="h-3.5 w-3.5" />{n}</button>))}
            </div>
          </Secao>
        </fieldset>
        <div className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Secao titulo="Prévia" acao={<div className="flex rounded-lg border border-border p-0.5">{[['computador', Monitor], ['celular', Smartphone]].map(([k, I]) => <button key={k} onClick={() => setTela(k)} className={`rounded-md px-2 py-1 ${tela === k ? 'bg-muted' : 'text-muted-foreground'}`} aria-label={k}><I className="h-4 w-4" /></button>)}</div>}>
            <div className="flex justify-center rounded-lg bg-muted/50 p-2">
              {html ? <iframe title="Prévia da newsletter" srcDoc={html} sandbox="" className={`h-[65vh] rounded-md border border-border bg-white ${tela === 'celular' ? 'w-[375px] max-w-full' : 'w-full'}`} /> : <Esqueleto className="h-[65vh] w-full" />}
            </div>
            <p className="mt-2 truncate text-xs text-muted-foreground">Assunto: <b className="text-foreground">{c.assunto || '(sem assunto)'}</b> · {c.previa}</p>
          </Secao>
          {!enviada && (
            <Secao titulo="Enviar">
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1 text-xs text-muted-foreground">Teste para<input className="campo mt-1 h-9 w-full" value={para} onChange={(e) => setPara(e.target.value)} placeholder="voce@exemplo.com" /></label>
                  <Botao variante="secundario" icone={Send} carregando={enviando === 'teste'} onClick={testar}>Enviar teste</Botao>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className="flex-1 text-xs text-muted-foreground">Agendar para<input type="datetime-local" className="campo mt-1 h-9 w-full" value={agenda} onChange={(e) => setAgenda(e.target.value)} /></label>
                  <Botao variante="secundario" icone={CalendarClock} onClick={() => agendar(false)} disabled={!agenda}>Agendar</Botao>
                  {c.estado === 'agendada' && <Botao variante="secundario" onClick={() => agendar(true)}>Tirar</Botao>}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">{estado.contagem.ativos} inscrito(s) confirmado(s) recebem.</p>
                  <Botao icone={Mail} carregando={enviando === 'todos'} disabled={!estado.contagem.ativos || !c.blocos.length || !c.assunto} onClick={() => setConfirmar(true)}>Enviar agora</Botao>
                </div>
                {!estado.dominio_verificado && <Aviso tipo="alerta">Domínio ainda não verificado no Resend: só o teste para o e-mail da conta do Resend funciona.</Aviso>}
              </div>
            </Secao>
          )}
          {enviada && !!c.estatisticas?.envios?.length && (
            <Secao titulo="Destinatários">
              <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 text-sm">{c.estatisticas.envios.map((x) => <li key={x.para} className="flex items-center justify-between gap-2"><span className="truncate">{x.para}</span><Selo cor={{ entregue: 'verde', aberto: 'verde', clicado: 'verde', devolvido: 'vermelho', falhou: 'vermelho' }[x.estado] || 'cinza'}>{x.estado}</Selo></li>)}</ul>
            </Secao>
          )}
        </div>
      </div>
      <GerarIa aberto={ia} onFechar={() => setIa(false)} modelos={estado.modelos} aoGerar={(r) => mudar({ assunto: r.assunto, previa: r.previa, titulo: r.titulo, modelo: r.modelo, blocos: r.blocos })} />
      <Modal aberto={confirmar} titulo="Enviar a newsletter?" onFechar={() => setConfirmar(false)}>
        <p className="text-sm">“{c.assunto}” vai para <b>{estado.contagem.ativos}</b> inscrito(s) confirmado(s). Depois de enviada, a campanha não muda mais.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setConfirmar(false)}>Cancelar</Botao><Botao icone={Send} onClick={enviarTodos}>Enviar para todos</Botao></div>
      </Modal>
    </div>
  )
}

function Campanhas({ estado, abrir, recarregarEstado }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [ia, setIa] = useState(false)
  const carregar = useCallback(() => api.get('/api/newsletter/campanhas').then(setLista).catch(() => setLista([])), [])
  useEffect(() => { carregar() }, [carregar])
  const nova = async (dados = {}) => {
    try { const c = await api.post('/api/newsletter/campanhas', { titulo: 'Novidades do Clima Escritório', assunto: '', previa: '', modelo: estado.config.modelo_padrao, blocos: [{ tipo: 'texto', texto: 'Olá! Estas são as novidades do sistema.' }, { tipo: 'versao', versao: estado.versoes[0]?.versao || '' }, { tipo: 'botao', rotulo: 'Ver todas as novidades', url: 'https://zynio.com.br/novidades' }], ...dados }); abrir(c.id) }
    catch (e) { toast(e.message, 'erro') }
  }
  const apagar = async (c) => { if (!(await perguntar(`Apagar a campanha “${c.assunto || c.titulo}”?`, { ok: 'Apagar' }))) return; try { await api.del(`/api/newsletter/campanhas/${c.id}`); carregar(); recarregarEstado() } catch (e) { toast(e.message, 'erro') } }
  const duplicar = async (c) => { try { const r = await api.post(`/api/newsletter/campanhas/${c.id}/duplicar`); abrir(r.id) } catch (e) { toast(e.message, 'erro') } }
  if (!lista) return <Esqueleto className="h-48" />
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Botao icone={Plus} onClick={() => nova()}>Nova campanha</Botao>
        <Botao variante="secundario" icone={Sparkles} disabled={!estado.ia} onClick={() => setIa(true)} title={estado.ia ? '' : 'Configure a chave da NVIDIA em Assistente de IA'}>Gerar com IA</Botao>
      </div>
      {!lista.length ? (
        <div className="cartao p-8 text-center"><Newspaper className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-2 font-medium">Nenhuma campanha ainda</p><p className="text-sm text-muted-foreground">Comece do zero ou deixe a IA escrever a partir das últimas versões do sistema.</p></div>
      ) : (
        <ul className="space-y-2">{lista.map((c) => (
          <li key={c.id} className="cartao flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <button className="min-w-0 flex-1 text-left" onClick={() => abrir(c.id)}>
              <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{c.assunto || c.titulo || '(sem assunto)'}</p><Selo cor={COR_ESTADO[c.estado]}>{c.estado}</Selo>{c.ia && <Selo cor="azul">IA</Selo>}</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{estado.modelos[c.modelo]?.nome || c.modelo} · {c.enviada_em ? `enviada ${haQuanto(c.enviada_em)}` : c.estado === 'agendada' ? `agendada para ${new Date(c.agendada_para * 1000).toLocaleString('pt-BR')}` : `editada ${haQuanto(c.atualizado_em)}`}{c.criado_por ? ` · ${c.criado_por}` : ''}</p>
            </button>
            {c.estado === 'enviada' && <div className="flex gap-4 text-xs tabular text-muted-foreground"><span><b className="text-foreground">{c.enviados}</b> enviados</span><span><b className="text-foreground">{pct(c.abertos, c.entregues)}</b> abertos</span><span><b className="text-foreground">{c.clicados}</b> cliques</span></div>}
            <div className="flex gap-1">
              <button className="rounded p-2 text-muted-foreground hover:bg-muted" title="Abrir" onClick={() => abrir(c.id)}><Eye className="h-4 w-4" /></button>
              <button className="rounded p-2 text-muted-foreground hover:bg-muted" title="Duplicar" onClick={() => duplicar(c)}><Copy className="h-4 w-4" /></button>
              {c.estado !== 'enviando' && <button className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-red-600" title="Apagar" onClick={() => apagar(c)}><Trash2 className="h-4 w-4" /></button>}
            </div>
          </li>))}
        </ul>
      )}
      <GerarIa aberto={ia} onFechar={() => setIa(false)} modelos={estado.modelos} aoGerar={(r) => nova({ assunto: r.assunto, previa: r.previa, titulo: r.titulo, modelo: r.modelo, blocos: r.blocos, ia: true })} />
    </>
  )
}

function Inscritos({ recarregarEstado }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [filtro, setFiltro] = useState('')
  const [q, setQ] = useState('')
  const [novo, setNovo] = useState({ email: '', nome: '', confirmar: true })
  const [salvando, setSalvando] = useState(false)
  const carregar = useCallback(() => api.get(`/api/newsletter/inscritos?estado=${filtro}&busca=${encodeURIComponent(q)}`).then(setLista).catch(() => setLista([])), [filtro, q])
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t) }, [carregar])
  const adicionar = async () => {
    setSalvando(true)
    try { const r = await api.post('/api/newsletter/inscritos', novo); toast(r.estado === 'ativo' ? 'Inscrito ativo.' : 'Confirmação enviada para o e-mail.'); setNovo({ email: '', nome: '', confirmar: true }); carregar(); recarregarEstado() }
    catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const mudar = async (i, estado) => { try { await api.put(`/api/newsletter/inscritos/${i.id}`, { estado }); carregar(); recarregarEstado() } catch (e) { toast(e.message, 'erro') } }
  const apagar = async (i) => { if (!(await perguntar(`Apagar ${i.email} da lista? Some de vez; para só parar de enviar, prefira cancelar.`, { ok: 'Apagar' }))) return; try { await api.del(`/api/newsletter/inscritos/${i.id}`); carregar(); recarregarEstado() } catch (e) { toast(e.message, 'erro') } }
  return (
    <div className="space-y-4">
      <Secao titulo="Adicionar inscrito" contexto="Com a confirmação, a pessoa recebe um e-mail e só entra na lista depois de clicar (recomendado)">
        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto] md:items-center">
          <input className="campo h-9" type="email" placeholder="email@exemplo.com" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
          <input className="campo h-9" placeholder="Nome (opcional)" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          <label className="flex items-center gap-2 text-xs"><Interruptor ligado={novo.confirmar} onChange={(v) => setNovo({ ...novo, confirmar: v })} rotulo="Pedir confirmação" />{novo.confirmar ? 'Pedir confirmação' : 'Já autorizou'}</label>
          <Botao icone={UserPlus} carregando={salvando} disabled={!/^\S+@\S+\.\S+$/.test(novo.email)} onClick={adicionar}>Adicionar</Botao>
        </div>
        {!novo.confirmar && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Sem confirmação, você atesta que a pessoa autorizou receber (LGPD). Fica registrado na Atividade.</p>}
      </Secao>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex rounded-lg border border-border p-0.5">{[['', 'Todos'], ['ativo', 'Ativos'], ['pendente', 'Pendentes'], ['cancelado', 'Cancelados'], ['devolvido', 'Devolvidos']].map(([k, n]) => <button key={k} onClick={() => setFiltro(k)} className={`rounded-md px-2.5 py-1 text-sm ${filtro === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</div>
        <input type="search" autoComplete="off" className="campo h-9 flex-1" placeholder="Buscar e-mail ou nome" value={q} onChange={(e) => setQ(e.target.value)} />
        <Botao variante="secundario" icone={Download} onClick={() => api.baixar('/api/newsletter/inscritos/exportar').catch((e) => toast(e.message, 'erro'))}>CSV</Botao>
      </div>
      {!lista ? <Esqueleto className="h-40" /> : !lista.length ? <p className="py-6 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 h-6 w-6" />Ninguém aqui ainda. O formulário “Assinar” do rodapé do site e a página zynio.com.br/newsletter trazem inscritos.</p> : (
        <div className="cartao overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">E-mail</th><th className="py-2 font-medium">Estado</th><th className="py-2 font-medium">Origem</th><th className="py-2 font-medium">Desde</th><th className="py-2" /></tr></thead>
          <tbody>{lista.map((i) => (
            <tr key={i.id} className="border-b border-border/60">
              <td className="px-4 py-2"><p className="font-medium">{i.email}</p>{i.nome && <p className="text-xs text-muted-foreground">{i.nome}</p>}</td>
              <td className="py-2"><Selo cor={COR_INSCRITO[i.estado]}>{i.estado}</Selo></td>
              <td className="py-2 text-xs text-muted-foreground">{i.origem}{i.idioma && i.idioma !== 'pt' ? ` · ${i.idioma}` : ''}</td>
              <td className="py-2 text-xs text-muted-foreground">{haQuanto(i.confirmado_em || i.criado_em)}</td>
              <td className="py-2 pr-3 text-right"><div className="flex justify-end gap-1">
                {i.estado === 'ativo' ? <Botao tamanho="sm" variante="secundario" onClick={() => mudar(i, 'cancelado')}>Cancelar</Botao> : i.estado === 'cancelado' && <Botao tamanho="sm" variante="secundario" onClick={() => mudar(i, 'ativo')}>Reativar</Botao>}
                <button className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={() => apagar(i)} aria-label="Apagar"><Trash2 className="h-4 w-4" /></button></div></td>
            </tr>))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}

function Configuracao({ estado, recarregar }) {
  const toast = useToast()
  const [f, setF] = useState(estado.config)
  const salvar = async () => { try { await api.put('/api/newsletter/config', f); toast('Salvo.'); recarregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <Secao titulo="Remetente e padrões">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <label><span className="rotulo">Nome do remetente</span><input className="campo mt-1 h-9 w-full" value={f.remetente_nome} onChange={(e) => setF({ ...f, remetente_nome: e.target.value })} /></label>
        <label><span className="rotulo">Endereço</span><div className="mt-1 flex items-center gap-1"><input className="campo h-9 w-full" value={f.remetente_local} onChange={(e) => setF({ ...f, remetente_local: e.target.value.toLowerCase() })} /><span className="text-sm text-muted-foreground">@zynio.com.br</span></div></label>
        <label><span className="rotulo">Respostas vão para</span><input className="campo mt-1 h-9 w-full" value={f.responder_para} onChange={(e) => setF({ ...f, responder_para: e.target.value })} /></label>
        <label><span className="rotulo">Assinatura</span><input className="campo mt-1 h-9 w-full" value={f.assinatura} onChange={(e) => setF({ ...f, assinatura: e.target.value })} /></label>
        <label><span className="rotulo">Modelo padrão</span><select className="campo mt-1 h-9 w-full" value={f.modelo_padrao} onChange={(e) => setF({ ...f, modelo_padrao: e.target.value })}>{Object.entries(estado.modelos).map(([k, m]) => <option key={k} value={k}>{m.nome}</option>)}</select></label>
        <label className="flex items-center gap-3 sm:mt-6"><Interruptor ligado={f.boas_vindas} onChange={(v) => setF({ ...f, boas_vindas: v })} rotulo="Boas-vindas" /><span className="text-sm">E-mail de boas-vindas ao confirmar</span></label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Hoje sai como: <b className="text-foreground">{estado.remetente}</b>. Respostas chegam pelo Email Routing da Cloudflare no Gmail do dono.</p>
      <div className="mt-4"><Botao icone={Save} onClick={salvar}>Salvar</Botao></div>
    </Secao>
  )
}

export default function Newsletter({ meuEmail }) {
  const [estado, setEstado] = useState(null)
  const [erro, setErro] = useState(null)
  const [sub, setSub] = useState('campanhas')
  const [aberta, setAberta] = useState(null)
  const carregar = useCallback(() => api.get('/api/newsletter').then((r) => { setEstado(r); setErro(null) }).catch((e) => setErro(e.message)), [])
  useEffect(() => { carregar() }, [carregar])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!estado) return <Esqueleto className="h-64" />
  if (aberta) return <Editor id={aberta} estado={estado} meuEmail={meuEmail} voltar={() => { setAberta(null); carregar() }} />
  const k = estado.contagem
  return (
    <div className="space-y-5">
      <FaixaMetricas itens={[
        { rotulo: 'Inscritos ativos', valor: k.ativos, dica: `${k.semana} novos na semana` },
        { rotulo: 'Aguardando confirmação', valor: k.pendentes, dica: 'receberam o e-mail de confirmar' },
        { rotulo: 'Cancelados', valor: k.cancelados, dica: `${k.devolvidos} devolvidos` },
        { rotulo: 'Remetente', valor: <span className="text-base">{estado.config.remetente_local}@</span>, dica: estado.dominio_verificado ? 'domínio verificado' : 'domínio não verificado', tom: estado.dominio_verificado ? 'bom' : 'ruim' },
      ]} />
      {!estado.resend && <Aviso tipo="alerta">Conecte o Resend em Conexões para enviar.</Aviso>}
      <div className="flex gap-1 border-b border-border">{[['campanhas', 'Campanhas', Newspaper], ['inscritos', 'Inscritos', Users], ['config', 'Configuração', Mail]].map(([c, n, I]) => (
        <button key={c} onClick={() => setSub(c)} className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${sub === c ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{n}</button>))}
      </div>
      {sub === 'campanhas' && <Campanhas estado={estado} abrir={setAberta} recarregarEstado={carregar} />}
      {sub === 'inscritos' && <Inscritos recarregarEstado={carregar} />}
      {sub === 'config' && <Configuracao estado={estado} recarregar={carregar} />}
    </div>
  )
}
