import { useState } from 'react'
import { Copy, ExternalLink, KeyRound, Link2, ShieldCheck, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Vazio, confirmar, useDados, useToast } from '../components/ui'

// Bot do Telegram: vincular o próprio Telegram (código de uso único), ver os vínculos, comandos e a segurança.
// O dono configura o token do bot (fica cifrado no banco).
export default function Telegram() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/telegram/estado'))
  const [codigo, setCodigo] = useState(null)
  const [token, setToken] = useState('')
  const [ocupado, setOcupado] = useState('')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados || !sessao) return <Carregando />
  const dono = sessao.papel === 'dono'
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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
          <section className="cartao p-5">
            <h2 className="titulo-secao">Comandos e menu</h2>
            <ul className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
              {dados.comandos.map(([k, d]) => <li key={k}><code className="text-primary">/{k}</code> <span className="text-muted-foreground">{d}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Por texto: /ligar NOME, /desligar NOME, /temperatura NOME 23. No menu, botões para cada ar (ligar, desligar, ±2°), cenas e luzes.</p>
          </section>
          <section className="cartao p-5">
            <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" />Segurança do bot</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Só conversas privadas de pessoas vinculadas; grupos são ignorados.</li>
              <li>O bot age com as permissões de quem vinculou: projetos, ares e o que cada um pode fazer.</li>
              <li>Desligar todos e executar cena pedem confirmação por botão que vence em 60 segundos.</li>
              <li>Webhook só aceita o segredo do bot vindo dos endereços do Telegram.</li>
              <li>Até 20 comandos por minuto; quem tenta usar sem vínculo é bloqueado por 24 h após 5 tentativas.</li>
              <li>Conta desativada no sistema perde o vínculo na hora. Tudo fica na Atividade.</li>
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
      </div>
    </div>
  )
}
