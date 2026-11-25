import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Copy, ExternalLink, KeyRound, Link2, ListChecks, ScrollText, ShieldCheck, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Vazio, confirmar, useDados, useToast } from '../components/ui'

const LogsTelegram = lazy(() => import('../components/telegram/Logs'))

// Bot do Telegram: vincular o próprio Telegram (código de uso único), ver os vínculos, comandos e a segurança.
// O dono configura o token do bot (fica cifrado no banco).
// PIN de 6 dígitos para os comandos críticos do bot (destrancar a porta, escudo, bloquear IP, reiniciar o agente…)
function PinCriticos() {
  const toast = useToast()
  const { dados, recarregar } = useDados(() => api.get('/api/telegram/pin'))
  const [pin, setPin] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!dados) return null
  const salvar = async (e) => { e.preventDefault(); setSalvando(true); try { await api.put('/api/telegram/pin', { pin }); setPin(''); toast('PIN salvo. No bot: /pin seguido dos 6 dígitos.'); recarregar() } catch (err) { toast(err.message, 'erro') } finally { setSalvando(false) } }
  const apagar = async () => { try { await api.del('/api/telegram/pin'); toast('PIN removido: os comandos críticos ficam travados no bot.'); recarregar() } catch (err) { toast(err.message, 'erro') } }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><KeyRound className="h-4 w-4" />PIN dos comandos críticos</h2>
      <p className="mt-1 text-sm text-muted-foreground">{dados.definido ? 'Você tem PIN definido.' : 'Sem PIN, os comandos críticos não rodam pelo bot.'} No bot, mande <code>/pin 123456</code> antes do comando; vale {dados.valido_min} min. 5 erros bloqueiam a conversa por 24 h.</p>
      <p className="mt-1 text-xs text-muted-foreground">Críticos: {dados.criticos.map((c) => `/${c}`).join(', ')}</p>
      <form onSubmit={salvar} className="mt-3 flex flex-wrap items-center gap-2">
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" placeholder="6 dígitos" className="campo h-9 w-36 font-mono tracking-widest" aria-label="Novo PIN" />
        <Botao type="submit" tamanho="sm" disabled={pin.length !== 6} carregando={salvando}>{dados.definido ? 'Trocar PIN' : 'Definir PIN'}</Botao>
        {dados.definido && <Botao type="button" tamanho="sm" variante="fantasma" onClick={apagar}>Remover</Botao>}
      </form>
    </section>
  )
}

// O que uma pessoa vê ao iniciar o bot: a apresentação (antes de vincular) e os primeiros passos (logo depois)
function BoasVindas({ total }) {
  const [aba, setAba] = useState('novo')
  const textos = {
    novo: ['Olá! Este é o bot do Clima Escritório: controla os ar-condicionados pelo Telegram, com as mesmas permissões do painel.',
      'O que dá para fazer: ligar, desligar, temperatura, modo e ventilação; timers (desligar às 18:00); cenas e agenda; relatórios e previsão do tempo; luzes, cafeteira, persianas e música; avisos; conversar com a IA.',
      `São ${total || 'mais de mil'} comandos em categorias.`,
      'Como começar: 1. entre no painel · 2. Telegram → Vincular meu Telegram · 3. toque no link ou mande /vincular CÓDIGO.',
      'Segurança: só quem vinculou usa; ações em lote pedem confirmação e as críticas, o PIN; perdeu o celular? Desvincule no painel.'],
    vinculado: ['Pronto! Este Telegram está ligado à sua conta.', '1. /ares mostra os seus ares · 2. /usar NOME escolhe o ar atual · 3. /desligar_1800 desliga às 18:00 · 4. /avisos sim recebe avisos · 5. crie o PIN no painel.',
      'Dicas: escreva do seu jeito; /buscar palavra; /menu por categoria; /oque_zona explica cada termo; /uso_ia mostra o seu limite.'],
  }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao">Boas-vindas do bot</h2>
      <p className="mt-1 text-sm text-muted-foreground">O que cada pessoa vê ao mandar /start: antes de vincular, uma apresentação; logo depois de vincular, os primeiros passos.</p>
      <div className="mt-3 flex w-fit rounded-lg bg-muted p-0.5 text-xs" role="tablist">
        {[['novo', 'Pessoa nova'], ['vinculado', 'Recém-vinculada']].map(([k, r]) => <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`rounded-md px-3 py-1 ${aba === k ? 'bg-background font-medium' : 'text-muted-foreground'}`}>{r}</button>)}
      </div>
      <div className="mt-3 space-y-2 rounded-xl bg-muted/60 p-3 text-sm">{textos[aba].map((t, i) => <p key={i}>{t}</p>)}</div>
    </section>
  )
}

export default function Telegram() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/telegram/estado'))
  const [codigo, setCodigo] = useState(null)
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [params, setParams] = useSearchParams()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !sessao) return <Carregando />
  const dono = sessao.papel === 'dono'
  const gestor = dono || sessao.papel === 'admin'
  const aba = ['comandos', ...(gestor ? ['logs'] : [])].includes(params.get('aba')) ? params.get('aba') : 'bot'
  const meus = dados.vinculos.filter((v) => v.usuario_id === sessao.id)
  const gerar = async () => {
    setOcupado('codigo')
    try { setCodigo(await api.post('/api/telegram/codigo')) } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const desvincular = async (v) => {
    if (!(await confirmar(`Desvincular o Telegram de ${v.nome || 'esta pessoa'}? O bot para de responder a ele na hora.`, { ok: 'Desvincular' }))) return
    try { await api.del(`/api/telegram/vinculo/${v.chat}`); toast('Telegram desvinculado.'); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  const configurar = async (e) => {
    e.preventDefault(); setOcupado('cfg')
    try { await api.post('/api/telegram/configurar', { token: token.trim() }); setToken(''); toast('Bot configurado: webhook, comandos e menu registrados.'); recarregar() } catch (err) { toast(err.message, 'erro') } finally { setOcupado('') }
  }
  return (
    <div className="w-full">
      <Cabecalho titulo="Telegram"
        descricao="Controle os ares, cenas e luzes pelo Telegram. O bot só responde a quem vinculou o próprio Telegram aqui, com as mesmas permissões do painel." />
      <div className="mb-6">
        <FaixaMetricas itens={[
          { rotulo: 'Bot', valor: dados.username ? `@${dados.username}` : '—', dica: dados.configurado ? 'configurado' : 'falta o dono configurar' },
          { rotulo: 'Webhook', valor: dados.webhook_ok ? 'Ativo' : 'Inativo', tom: dados.webhook_ok ? 'bom' : 'ruim', dica: dados.ultimo_erro ? `último erro: ${dados.ultimo_erro}` : 'hospedado em app.zynio.com.br' },
          { rotulo: 'Vínculos', valor: dados.vinculos.length, dica: sessao.papel === 'dono' || sessao.papel === 'admin' ? 'de todas as pessoas' : 'os seus' },
          { rotulo: 'Pendentes', valor: dados.pendentes ?? 0, dica: 'mensagens esperando o servidor' },
        ]} />
      </div>
      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Seções do Telegram">
        {[['bot', 'Bot e vínculos', Bot], ['comandos', 'Comandos', ListChecks], ...(gestor ? [['logs', 'Logs de uso e erros', ScrollText]] : [])].map(([k, r, I]) => (
          <button key={k} onClick={() => setParams(k === 'bot' ? {} : { aba: k }, { replace: true })}
            className={`relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${aba === k ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <I className="h-4 w-4" />{r}
          </button>
        ))}
      </nav>
      {aba === 'logs' && <Suspense fallback={<Carregando />}><LogsTelegram /></Suspense>}
      {aba === 'comandos' && <CatalogoComandos comandos={dados.comandos || []} categorias={dados.categorias || []} grande />}
      {aba === 'bot' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section className="cartao p-5">
            <h2 className="titulo-secao flex items-center gap-2"><Link2 className="h-4 w-4" />Vincular o meu Telegram</h2>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Clique em Gerar código (vale 10 minutos e uma vez só).</li>
              <li>Abra o link no celular (ou mande <code>/vincular CÓDIGO</code> para @{dados.username || 'zynio_bot'}).</li>
              <li>Pronto: o bot responde com o seu nome e o menu.</li>
            </ol>
            {codigo ? (
              <div className="mt-4 rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">Código (vale até {new Date(codigo.expira_em * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})</p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-widest">{codigo.codigo}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={codigo.link} target="_blank" rel="noreferrer"><Botao icone={ExternalLink}>Abrir no Telegram</Botao></a>
                  <Botao variante="secundario" icone={Copy} onClick={() => { navigator.clipboard?.writeText(`/vincular ${codigo.codigo}`); toast('Comando copiado.') }}>Copiar /vincular</Botao>
                </div>
              </div>
            ) : <Botao className="mt-4" icone={KeyRound} disabled={!dados.configurado} carregando={ocupado === 'codigo'} onClick={gerar}>Gerar código</Botao>}
            {meus.length > 0 && <p className="mt-3 text-xs text-emerald-700 dark:text-emerald-400">Você já tem {meus.length} Telegram vinculado.</p>}
          </section>

          <section className="cartao p-5">
            <h2 className="titulo-secao">Vínculos</h2>
            {dados.vinculos.length === 0 ? <div className="mt-3"><Vazio icone={Link2} titulo="Ninguém vinculado ainda" texto="Gere o código acima para vincular o seu Telegram." /></div> : (
              <ul className="mt-3 divide-y divide-border">
                {dados.vinculos.map((v) => (
                  <li key={v.chat} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0"><b className="font-medium">{v.nome}</b> <span className="text-xs text-muted-foreground">{v.telegram ? `@${v.telegram}` : ''} · desde {haQuanto(v.desde)}</span></span>
                    <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => desvincular(v)}>Desvincular</Botao>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <CatalogoComandos comandos={dados.comandos || []} categorias={dados.categorias || []} />
          <BoasVindas total={(dados.comandos || []).length} />
          <PinCriticos />
          <section className="cartao p-5">
            <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Segurança do bot</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Só conversas privadas de pessoas vinculadas; grupos são ignorados.</li>
              <li>O bot age com as permissões de quem vinculou: projetos, ares e o que cada um pode fazer.</li>
              <li>Desligar todos e executar cena pedem confirmação por botão que vence em 60 segundos.</li>
              <li>Webhook só aceita o segredo do bot vindo dos endereços do Telegram.</li>
              <li>Até 20 comandos por minuto; quem tenta usar sem vínculo é bloqueado por 24 h após 5 tentativas.</li>
              <li>Conta desativada no sistema perde o vínculo na hora. Tudo fica na Atividade.</li>
              <li>O ID do Telegram tem que ser o mesmo do vínculo; 3 estouros do limite em 10 min bloqueiam a conversa por 1 h.</li>
              <li>Comandos críticos pedem o PIN de 6 dígitos; vínculo sem uso por 60 dias expira.</li>
              <li>Toda interação fica na auditoria em Segurança → Telegram e nos Logs desta tela, com o tempo de resposta; erro de código vira bug automático.</li>
            </ul>
          </section>
          {dono && (
            <section className="cartao p-5">
              <h2 className="titulo-secao">Configurar o bot (dono)</h2>
              <p className="mt-1 text-xs text-muted-foreground">Token do @BotFather. Fica cifrado no banco; ao salvar, o sistema registra o webhook, os comandos e o menu.</p>
              <form onSubmit={configurar} className="mt-3 flex flex-wrap gap-2">
                <input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" className="campo h-9 min-w-[16rem] flex-1 font-mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder={dados.configurado ? 'Configurado. Cole só para trocar.' : '123456789:AA...'} aria-label="Token do bot" />
                <Botao type="submit" tamanho="sm" carregando={ocupado === 'cfg'} disabled={token.trim().length < 30}>{dados.configurado ? 'Trocar token' : 'Configurar'}</Botao>
              </form>
            </section>
          )}
        </div>
      </div>}
    </div>
  )
}

// Catálogo de comandos do bot: categorias, busca e quais pedem confirmação ou permissão.
function CatalogoComandos({ comandos, categorias, grande = false }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return comandos.filter((c) => (!cat || c.cat === cat) && (!t || c.nome.includes(t) || c.desc.toLowerCase().includes(t)))
  }, [comandos, q, cat])
  const conta = (id) => comandos.filter((c) => c.cat === id).length
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao">{comandos.length} comandos em {categorias.length} categorias</h2>
      <p className="mt-1 text-xs text-muted-foreground">No Telegram, /menu mostra o estado no topo (ares ligados, agente, tempo lá fora, notificações) e os atalhos; <b>Todos os comandos</b> navega por categoria com páginas. O menu “/” do Telegram lista os 100 mais usados. Também dá para escrever normalmente: a IA entende.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="search" autoComplete="off" className="campo h-9 flex-1" placeholder="Procurar comando (ex.: temperatura, gasto, persiana)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Procurar comando" />
        <select className="campo h-9 sm:w-56" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome} ({conta(c.id)})</option>)}
        </select>
      </div>
      <ul className={`mt-3 space-y-1.5 overflow-y-auto pr-1 text-sm ${grande ? 'max-h-[70vh]' : 'max-h-[28rem]'}`}>
        {lista.map((c) => (
          <li key={c.nome} className="flex flex-wrap items-baseline gap-x-2">
            <code className="text-primary">{c.uso}</code>
            <span className="min-w-0 flex-1 text-muted-foreground">{c.desc}</span>
            {c.confirmar && <span className="rounded bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">pede confirmação</span>}
            {c.restrito && <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">conforme permissão</span>}
          </li>
        ))}
        {!lista.length && <li className="text-muted-foreground">Nenhum comando com esse texto.</li>}
      </ul>
    </section>
  )
}
