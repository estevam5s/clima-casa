import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import UsoSistema, { tempo } from './UsoSistema'
import { AnimatePresence, motion } from 'framer-motion'
import { BarChart3, Check, Copy, Crown, Fingerprint, FolderPlus, KeyRound, LogOut, Pencil, Search, ShieldCheck, ShieldOff, Trash2, UserPlus, Users } from 'lucide-react'
import { api, haQuanto } from '../../api'
import Turnstile from '../Turnstile'
import { Aviso, Botao, Carregando, FaixaMetricas, Interruptor, Modal, Vazio, useDados, useToast } from '../ui'

const COR_PAPEL = {
  dono: 'bg-amber-500/15 text-amber-700 dark:text-amber-400', admin: 'bg-primary/15 text-primary', subadmin: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  operador: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', visualizador: 'bg-muted text-muted-foreground', personalizado: 'bg-violet-500/15 text-violet-700 dark:text-violet-400',
}
const iniciais = (n, e) => ((n || e || '?').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || '?').toUpperCase()

function SenhaGerada({ senha, email, aoFechar }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Modal aberto titulo="Senha provisória" onFechar={aoFechar}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Passe esta senha para <span className="text-foreground">{email}</span> por um canal seguro. Ela aparece só agora. No primeiro acesso o sistema pede para trocar.</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
          <code className="flex-1 break-all font-mono text-base">{senha}</code>
          <button onClick={() => { navigator.clipboard?.writeText(senha); setCopiado(true) }} className="rounded-md p-1.5 hover:bg-background" aria-label="Copiar senha">{copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
        </div>
        <div className="flex justify-end"><Botao onClick={aoFechar}>Pronto</Botao></div>
      </div>
    </Modal>
  )
}

function FormUsuario({ dados, usuario, aoSalvar, aoFechar }) {
  const toast = useToast()
  const novo = !usuario
  const papeis = dados.papeis.filter((p) => dados.papeis_permitidos.includes(p.id) || p.id === usuario?.papel)
  const [f, setF] = useState(() => ({
    nome: usuario?.nome || '', email: usuario?.email || '', cargo: usuario?.cargo || '', papel: usuario?.papel || 'operador',
    permissoes: usuario?.permissoes || dados.papeis.find((p) => p.id === 'operador').permissoes,
    acesso: usuario ? (usuario.projetos === '*' ? 'todos' : 'escolher') : (dados.eu.projetos === '*' ? 'todos' : 'escolher'),
    projetos: usuario && usuario.projetos !== '*' ? usuario.projetos : [], projeto_novo: '',
    ares_modo: usuario && Array.isArray(usuario.aparelhos) ? 'escolher' : 'todos', ares: usuario && Array.isArray(usuario.aparelhos) ? usuario.aparelhos : [],
    senhaModo: 'gerar', senha: '', convite: false, exige_troca_senha: usuario ? usuario.exige_troca_senha : true, ativo: usuario ? usuario.ativo : true,
  }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const podeEmail = dados.eu.papel === 'dono'
  const total = ['dono', 'admin'].includes(f.papel)
  const minhas = dados.eu.permissoes
  const projetosVisiveis = dados.eu.projetos === '*' ? dados.projetos : dados.projetos.filter((p) => dados.eu.projetos.includes(p.id))
  const grupos = useMemo(() => dados.permissoes.reduce((g, p) => ({ ...g, [p.grupo]: [...(g[p.grupo] || []), p] }), {}), [dados.permissoes])
  const mudarPapel = (papel) => {
    const base = dados.papeis.find((p) => p.id === papel)
    setF({ ...f, papel, permissoes: base.permissoes.filter((p) => minhas.includes(p)), acesso: ['admin', 'dono'].includes(papel) ? 'todos' : f.acesso })
  }
  const alternarPerm = (id) => setF({ ...f, papel: f.papel === 'personalizado' || total ? f.papel : 'personalizado', permissoes: f.permissoes.includes(id) ? f.permissoes.filter((p) => p !== id) : [...f.permissoes, id] })
  const alternarAr = (id) => setF({ ...f, ares: f.ares.includes(id) ? f.ares.filter((a) => a !== id) : [...f.ares, id] })
  const aresPorSala = (dados.ares || []).reduce((g, a) => ({ ...g, [a.projeto_nome || 'Sem projeto']: [...(g[a.projeto_nome || 'Sem projeto'] || []), a] }), {})
  const alternarProj = (id) => setF({ ...f, projetos: f.projetos.includes(id) ? f.projetos.filter((p) => p !== id) : [...f.projetos, id] })

  const salvar = async (e) => {
    e.preventDefault(); setErro('')
    if (!total && f.ares_modo === 'escolher' && !f.ares.length) return setErro('Escolha ao menos um ar, ou marque "Todos os ares".')
    if (f.acesso === 'escolher' && !total && f.ares_modo !== 'escolher' && !f.projetos.length) return setErro('Escolha ao menos um projeto ou comece do zero.')
    setSalvando(true)
    try {
      const corpo = { nome: f.nome, cargo: f.cargo, papel: f.papel, permissoes: f.permissoes, acesso: total ? 'todos' : f.acesso, projetos: f.projetos, projeto_novo: f.projeto_novo, exige_troca_senha: f.exige_troca_senha, ares_modo: total ? 'todos' : f.ares_modo, ares: f.ares }
      if (novo) {
        const r = await api.post('/api/usuarios', { ...corpo, email: f.email, convite: f.convite, gerar_senha: f.senhaModo === 'gerar', senha: f.senhaModo === 'definir' ? f.senha : null })
        toast(f.convite ? 'Convite enviado por e-mail.' : 'Usuário criado.')
        aoSalvar(r.senha ? { senha: r.senha, email: f.email } : null)
      } else {
        const emailNovo = f.email.trim().toLowerCase()
        if (podeEmail && emailNovo !== (usuario.email || '').toLowerCase()) await api.put(`/api/usuarios/${usuario.id}/email`, { email: emailNovo })
        await api.put(`/api/usuarios/${usuario.id}`, { ...corpo, ativo: f.ativo })
        toast('Usuário atualizado.'); aoSalvar(null)
      }
    } catch (err) { setErro(err.message) } finally { setSalvando(false) }
  }

  return (
    <Modal aberto titulo={novo ? 'Novo usuário' : `Editar ${usuario.nome || usuario.email}`} onFechar={aoFechar} largura="max-w-3xl">
      <form onSubmit={salvar} className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="rotulo" htmlFor="un">Nome</label><input id="un" className="campo" required maxLength={80} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div><label className="rotulo" htmlFor="ue">E-mail</label><input id="ue" type="email" className="campo" required disabled={!novo && !podeEmail} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            {!novo && podeEmail && f.email.trim().toLowerCase() !== (usuario.email || '').toLowerCase() && <p className="ajuda mt-1">A pessoa passa a entrar com o e-mail novo. O antigo e o novo recebem um aviso.</p>}
            {!novo && !podeEmail && <p className="ajuda mt-1">Só o dono do sistema troca o e-mail de login.</p>}</div>
          <div><label className="rotulo" htmlFor="uc">Cargo</label><input id="uc" className="campo" maxLength={80} placeholder="Ex.: Recepção, Gerente, TI" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} /></div>
          {!novo && usuario.papel !== 'dono' && <div className="flex items-end gap-3 pb-2 text-sm"><Interruptor ligado={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} rotulo={f.ativo ? 'Conta ativa' : 'Conta desativada'} /><span>{f.ativo ? 'Conta ativa' : 'Conta desativada (não entra)'}</span></div>}
        </div>

        <div>
          <p className="rotulo">Nível de acesso</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {papeis.map((p) => (
              <button key={p.id} type="button" onClick={() => mudarPapel(p.id)} disabled={usuario?.papel === 'dono'}
                className={`rounded-lg border p-3 text-left transition-colors ${f.papel === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>
                <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${COR_PAPEL[p.id]}`}>{p.id === 'dono' && <Crown className="h-3 w-3" />}{p.rotulo}</span>
                <span className="mt-1.5 block text-xs text-muted-foreground">{p.descricao}</span>
              </button>
            ))}
          </div>
        </div>

        {!total && (
          <div>
            <p className="rotulo">Permissões <span className="font-normal text-muted-foreground">(marcar ou desmarcar vira "Personalizado")</span></p>
            <div className="grid gap-4 sm:grid-cols-3">
              {Object.entries(grupos).map(([g, ps]) => (
                <div key={g} className="space-y-1.5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{g}</p>
                  {ps.map((p) => {
                    const bloqueada = !minhas.includes(p.id)
                    return (
                      <label key={p.id} className={`flex items-start gap-2 rounded-md px-1.5 py-1 text-sm ${bloqueada ? 'opacity-40' : 'cursor-pointer hover:bg-muted/50'}`} title={bloqueada ? 'Você não tem esta permissão para dar' : ''}>
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" disabled={bloqueada} checked={f.permissoes.includes(p.id)} onChange={() => alternarPerm(p.id)} />
                        <span>{p.descricao}</span>
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {!total && (
          <div>
            <p className="rotulo">Dados de ar-condicionado</p>
            {f.ares_modo === 'escolher' ? <p className="ajuda">As salas desta pessoa são as dos ares marcados em “Ares sob responsabilidade”.</p> : <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[['todos', 'Todos os projetos', 'Usa os mesmos ares, transmissores e rotinas que já existem', dados.eu.projetos === '*'],
                ['escolher', 'Escolher projetos', 'Só os lugares que você marcar abaixo', true],
                ['zero', 'Começar do zero', 'Cria um projeto vazio só para esta pessoa', true]].filter((o) => o[3]).map(([k, r, d]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, acesso: k })}
                  className={`rounded-lg border p-3 text-left ${f.acesso === k ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>
                  <span className="text-sm font-medium">{r}</span><span className="mt-1 block text-xs text-muted-foreground">{d}</span>
                </button>
              ))}
            </div>
            {f.acesso === 'escolher' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {projetosVisiveis.map((p) => (
                  <button key={p.id} type="button" onClick={() => alternarProj(p.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${f.projetos.includes(p.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{p.nome}</button>
                ))}
              </div>
            )}
            {f.acesso === 'zero' && (
              <div className="mt-3"><label className="rotulo" htmlFor="pz"><FolderPlus className="mr-1 inline h-4 w-4" />Nome do projeto novo</label>
                <input id="pz" className="campo" maxLength={60} placeholder={`Projeto de ${f.nome || 'novo usuário'}`} value={f.projeto_novo} onChange={(e) => setF({ ...f, projeto_novo: e.target.value })} />
                <p className="ajuda">Ele começa sem aparelhos. Transmissores, Smart Life e Alexa são do sistema todo e ficam com o administrador.</p></div>
            )}
            </>}
          </div>
        )}

        {!total && (
          <div>
            <p className="rotulo">Ares sob responsabilidade</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[['todos', 'Todos os ares', 'Todos os ares dos projetos escolhidos acima', dados.eu.aparelhos === '*'],
                ['escolher', 'Só estes ares', 'A pessoa vê e comanda só os ares marcados (ex.: o ar da mesa dela). As salas dela passam a ser as desses ares', true]].filter((o) => o[3]).map(([k, r, d]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, ares_modo: k })}
                  className={`rounded-lg border p-3 text-left ${f.ares_modo === k ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>
                  <span className="text-sm font-medium">{r}</span><span className="mt-1 block text-xs text-muted-foreground">{d}</span>
                </button>
              ))}
            </div>
            {f.ares_modo === 'escolher' && (
              <div className="mt-3 space-y-2">
                {Object.entries(aresPorSala).map(([sala, lista]) => (
                  <div key={sala}>
                    <p className="text-xs text-muted-foreground">{sala}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {lista.map((a) => (
                        <button key={a.id} type="button" onClick={() => alternarAr(a.id)} aria-pressed={f.ares.includes(a.id)}
                          className={`rounded-full border px-3 py-1 text-sm ${f.ares.includes(a.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>{a.nome}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {!(dados.ares || []).length && <p className="ajuda">Nenhum ar cadastrado ainda.</p>}
              </div>
            )}
          </div>
        )}

        {novo && (
          <div>
            <p className="rotulo">Primeiro acesso</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {[['gerar', 'Gerar senha forte'], ['definir', 'Eu defino a senha'], ['convite', 'Enviar convite por e-mail']].map(([k, r]) => (
                <button key={k} type="button" onClick={() => setF({ ...f, senhaModo: k, convite: k === 'convite' })}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm ${f.senhaModo === k ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>{r}</button>
              ))}
            </div>
            {f.senhaModo === 'definir' && <input type="text" className="campo mt-3" minLength={8} required placeholder="Senha provisória (mín. 8)" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} autoComplete="off" />}
            {f.senhaModo === 'convite' && <p className="ajuda mt-2">O Supabase envia um link para a pessoa criar a senha. O plano gratuito manda poucos e-mails por hora.</p>}
          </div>
        )}
        {f.senhaModo !== 'convite' && <div className="flex items-center gap-3 text-sm"><Interruptor ligado={f.exige_troca_senha} onChange={(v) => setF({ ...f, exige_troca_senha: v })} rotulo="Pedir para trocar a senha no primeiro acesso" /><span>Pedir para trocar a senha no primeiro acesso</span></div>}

        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" carregando={salvando}>{novo ? 'Criar usuário' : 'Salvar'}</Botao>
        </div>
      </form>
    </Modal>
  )
}

// Ações à vista na própria linha (o menu suspenso ficava cortado pela rolagem da tabela).
// Ação destrutiva pede confirmação numa janela do sistema, com o e-mail da pessoa e o que acontece.
function AcoesUsuario({ u, aoAtualizar, aoEditar, aoSenha }) {
  const toast = useToast()
  const [confirmar, setConfirmar] = useState(null)   // { titulo, texto, botao, perigo, fn, msg }
  const [rodando, setRodando] = useState(false)
  const executar = async () => {
    setRodando(true)
    try { await confirmar.fn(); toast(confirmar.msg); setConfirmar(null); aoAtualizar() } catch (e) { toast(e.message, 'erro') } finally { setRodando(false) }
  }
  const nome = u.nome || u.email
  const botoes = [
    { r: 'Editar acesso', I: Pencil, fn: aoEditar },
    { r: 'Nova senha', I: KeyRound, fn: () => setConfirmar({ titulo: 'Gerar senha nova', texto: `A senha atual de ${u.email} deixa de funcionar. A nova aparece uma vez só, para você passar à pessoa, e ela troca no primeiro acesso.`, botao: 'Gerar senha', fn: aoSenha, msg: 'Senha nova gerada.' }) },
    u.totp && { r: 'Remover 2FA', I: ShieldOff, fn: () => setConfirmar({ titulo: 'Remover o Google Authenticator', texto: `${nome} passa a entrar só com a senha até cadastrar o autenticador de novo. Use quando a pessoa perdeu o celular.`, botao: 'Remover 2FA', fn: () => api.del(`/api/usuarios/${u.id}/2fa`), msg: 'Verificação em duas etapas removida.' }) },
    { r: 'Encerrar sessões', I: LogOut, fn: () => setConfirmar({ titulo: 'Encerrar todas as sessões', texto: `${nome} sai de todos os aparelhos (navegador, celular e computador) e precisa entrar de novo. Use quando um aparelho for perdido ou a pessoa sair da equipe.`, botao: 'Encerrar sessões', perigo: true, fn: () => api.post(`/api/usuarios/${u.id}/sessoes/encerrar`), msg: 'Sessões encerradas.' }) },
    u.papel !== 'dono' && { r: 'Apagar', I: Trash2, perigo: true, fn: () => setConfirmar({ titulo: 'Apagar conta', texto: `A conta ${u.email} é apagada de vez: login, biometria e perfil. O histórico de atividade continua. Não dá para desfazer.`, botao: 'Apagar conta', perigo: true, fn: () => api.del(`/api/usuarios/${u.id}`), msg: 'Usuário apagado.' }) },
  ].filter(Boolean)
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {botoes.map(({ r, I, fn, perigo }) => (
          <button key={r} onClick={fn} title={r} aria-label={`${r}: ${u.email}`}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs font-medium transition-colors hover:border-border ${perigo ? 'text-red-600 hover:bg-red-500/10 dark:text-red-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
            <I className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{r}</span>
          </button>
        ))}
      </div>
      <Modal aberto={!!confirmar} titulo={confirmar?.titulo || ''} onFechar={() => !rodando && setConfirmar(null)}>
        {confirmar && (
          <div className="space-y-4 text-left">
            <p className="text-sm text-muted-foreground">{confirmar.texto}</p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Botao variante="secundario" onClick={() => setConfirmar(null)} disabled={rodando}>Cancelar</Botao>
              <Botao variante={confirmar.perigo ? 'perigo' : 'primario'} carregando={rodando} onClick={executar}>{confirmar.botao}</Botao>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

// Só o dono: passa o posto para outra conta ativa (o dono atual vira administrador). Pede o e-mail do novo dono digitado,
// a senha do dono e a verificação anti-robô; os dois recebem e-mail e fica na Atividade.
function TransferirDono({ u, aoFechar, aoFeito }) {
  const toast = useToast()
  const [confirmacao, setConfirmacao] = useState('')
  const [senhaDono, setSenhaDono] = useState('')
  const [robo, setRobo] = useState(null)
  const refRobo = useRef(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      await api.post(`/api/usuarios/${u.id}/transferir-dono`, { confirmacao: confirmacao.trim(), senha: senhaDono, turnstile: robo })
      toast(`${u.nome || u.email} agora é o dono. Você passou a administrador.`); aoFeito()
    } catch (err) { setErro(err.message); refRobo.current?.reiniciar?.() } finally { setOcupado(false) }
  }
  return (
    <Modal aberto titulo="Transferir o posto de dono" onFechar={aoFechar}>
      <form onSubmit={enviar} className="space-y-3">
        <Aviso tipo="alerta">{u.nome || u.email} passa a ser o dono, com acesso total e o poder de transferir de novo. Você vira administrador e perde as funções exclusivas do dono.</Aviso>
        <label className="block"><span className="rotulo">Para confirmar, digite o e-mail de {u.nome || 'quem vai receber'}</span>
          <input className="campo mt-1" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={u.email} autoComplete="off" required /></label>
        <label className="block"><span className="rotulo">A sua senha</span>
          <input type="password" className="campo mt-1" value={senhaDono} onChange={(e) => setSenhaDono(e.target.value)} autoComplete="current-password" required /></label>
        <Turnstile ref={refRobo} aoMudar={setRobo} acao="conta" />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="perigo" icone={Crown} carregando={ocupado} disabled={confirmacao.trim().toLowerCase() !== (u.email || '').toLowerCase() || !senhaDono}>Transferir</Botao>
        </div>
      </form>
    </Modal>
  )
}

// duas visões na mesma aba: as contas (quem entra e o que pode) e o uso do sistema (tempo, telas e caminhos)
export default function Usuarios() {
  const [params, setParams] = useSearchParams()
  const ver = params.get('ver') === 'uso' ? 'uso' : 'contas'
  const trocar = (v) => { const n = new URLSearchParams(params); if (v === 'uso') n.set('ver', 'uso'); else n.delete('ver'); setParams(n, { replace: true }) }
  return (
    <div className="space-y-6">
      <div className="flex w-full gap-1 rounded-lg border border-border p-0.5 sm:w-fit" role="tablist" aria-label="Usuários">
        {[['contas', 'Contas e acessos', Users], ['uso', 'Uso do sistema', BarChart3]].map(([k, r, I]) => (
          <button key={k} role="tab" aria-selected={ver === k} onClick={() => trocar(k)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm sm:flex-none ${ver === k ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {ver === k && <motion.span layoutId="usuarios-visao" className="absolute inset-0 rounded-md bg-muted" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
            <I className="relative h-4 w-4" /><span className="relative">{r}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={ver} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
          {ver === 'uso' ? <UsoSistema /> : <Contas />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Contas() {
  const toast = useToast()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/usuarios'))
  const { dados: uso } = useDados(() => api.get('/api/usuarios/uso?dias=30').catch(() => null))
  const usoDe = (id) => uso?.pessoas?.find((p) => p.id === id)
  const [form, setForm] = useState(null)        // 'novo' | usuário
  const [senha, setSenha] = useState(null)
  const [busca, setBusca] = useState('')
  const [transferir, setTransferir] = useState(null)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const lista = dados.itens.filter((u) => !busca || `${u.nome} ${u.email} ${u.cargo}`.toLowerCase().includes(busca.toLowerCase()))
  const nomeProjetos = (u) => (Array.isArray(u.aparelhos)
    ? `Ares: ${u.aparelhos.map((id) => (dados.ares || []).find((a) => a.id === id)?.nome || `#${id}`).join(', ')}`
    : u.projetos === '*' ? 'Todos os projetos' : u.projetos.map((id) => dados.projetos.find((p) => p.id === id)?.nome || `#${id}`).join(', ') || 'Nenhum')
  const novaSenha = async (u) => {
    const r = await api.post(`/api/usuarios/${u.id}/senha`, { gerar: true, exige_troca_senha: true })
    setSenha({ senha: r.senha, email: u.email })
  }
  const ativos = dados.itens.filter((u) => u.ativo).length
  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Usuários', valor: dados.itens.length, dica: `${ativos} ativo(s)` },
        { rotulo: 'Administradores', valor: dados.itens.filter((u) => ['dono', 'admin', 'subadmin'].includes(u.papel)).length, dica: 'dono, admin e subadmin' },
        { rotulo: 'Com Google Authenticator', valor: dados.itens.filter((u) => u.totp).length, tom: dados.itens.every((u) => u.totp) ? 'bom' : undefined, dica: 'verificação em duas etapas' },
        { rotulo: 'Com biometria', valor: dados.itens.filter((u) => u.passkeys).length, dica: `Face ID, digital ou Windows Hello · ${dados.itens.filter((u) => u.google).length} com Google` },
      ]} />
      <section className="cartao overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
          <label className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, e-mail ou cargo" className="campo h-9 pl-8 text-sm" aria-label="Buscar usuários" />
          </label>
          <Botao className="ml-auto" icone={UserPlus} onClick={() => setForm('novo')}>Novo usuário</Botao>
        </div>
        {lista.length === 0 ? <div className="p-6"><Vazio icone={Users} titulo="Ninguém encontrado" texto="Crie contas para quem também usa os ares." /></div> : (
          <>
          {/* celular: um cartão por pessoa (a tabela larga obrigava a rolar de lado) */}
          <ul className="divide-y divide-border md:hidden">
            {lista.map((u) => (
              <li key={u.id} className={`space-y-3 p-4 ${u.ativo ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-3">
                  {u.avatar ? <img src={u.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{iniciais(u.nome, u.email)}</span>}
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{u.nome || u.email.split('@')[0]}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${COR_PAPEL[u.papel]}`}>{u.papel === 'dono' && <Crown className="h-3 w-3" />}{u.papel_rotulo}</span>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-muted-foreground">Uso (30 d)</dt><dd className="font-medium tabular">{usoDe(u.id) ? tempo(usoDe(u.id).ms) : '—'}</dd></div>
                  <div><dt className="text-muted-foreground">Último acesso</dt><dd className="font-medium">{u.ultimo_acesso ? haQuanto(u.ultimo_acesso) : 'nunca'}</dd></div>
                  <div><dt className="text-muted-foreground">Segurança</dt><dd className="font-medium">{[u.totp && '2FA', u.passkeys && 'biometria', u.google && 'Google'].filter(Boolean).join(', ') || 'só senha'}</dd></div>
                </dl>
                <p className="truncate text-xs text-muted-foreground">{nomeProjetos(u)}</p>
                {u.pode_editar && <AcoesUsuario u={u} aoAtualizar={recarregar} aoEditar={() => setForm(u)} aoSenha={() => novaSenha(u)} />}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="tabela w-full min-w-[900px]">
              <thead><tr><th>Usuário</th><th>Nível</th><th>Projetos e ares</th><th>Segurança</th><th>Uso (30 dias)</th><th>Último acesso</th><th /></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id} className={u.ativo ? '' : 'opacity-50'}>
                    <td>
                      <div className="flex items-center gap-3">
                        {u.avatar ? <img src={u.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{iniciais(u.nome, u.email)}</span>}
                        <div className="min-w-0"><p className="truncate font-medium">{u.nome || u.email.split('@')[0]}{!u.ativo && <span className="ml-2 text-xs text-muted-foreground">(desativado)</span>}</p>
                          <p className="truncate text-xs text-muted-foreground">{u.email}{u.cargo ? ` · ${u.cargo}` : ''}</p></div>
                      </div>
                    </td>
                    <td><span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${COR_PAPEL[u.papel]}`}>{u.papel === 'dono' && <Crown className="h-3 w-3" />}{u.papel_rotulo}</span>
                      {!['dono', 'admin'].includes(u.papel) && <p className="mt-0.5 text-[11px] text-muted-foreground">{u.permissoes.length} permissão(ões)</p>}</td>
                    <td className="max-w-[200px] truncate text-sm text-muted-foreground" title={nomeProjetos(u)}>{nomeProjetos(u)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.totp ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>{u.totp ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}2FA</span>
                        <span title={u.google ? `Google conectado: ${u.google}` : 'Google não conectado (a pessoa conecta em Configurações → Segurança)'} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ${u.google ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400' : 'bg-muted text-muted-foreground'}`}>G</span>
                        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${u.passkeys ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}><Fingerprint className="h-3 w-3" />{u.passkeys || 0}</span>
                        {u.exige_troca_senha && <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-400"><KeyRound className="h-3 w-3" />troca de senha</span>}
                      </div>
                    </td>
                    <td className="text-sm tabular">{usoDe(u.id) ? <><span className="font-medium">{tempo(usoDe(u.id).ms)}</span><span className="block text-[11px] text-muted-foreground">{usoDe(u.id).dias_ativos} dia(s)</span></> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="text-sm text-muted-foreground">{u.ultimo_acesso ? haQuanto(u.ultimo_acesso) : 'nunca entrou'}</td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {dados.eu.papel === 'dono' && u.id !== dados.eu.id && u.ativo !== false && u.papel !== 'dono' && (
                          <button onClick={() => setTransferir(u)} title="Transferir o posto de dono" aria-label={`Transferir o posto de dono para ${u.nome || u.email}`}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-amber-600"><Crown className="h-4 w-4" /></button>
                        )}
                        {u.pode_editar && <AcoesUsuario u={u} aoAtualizar={recarregar} aoEditar={() => setForm(u)} aoSenha={() => novaSenha(u)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
      <p className="text-xs text-muted-foreground">As permissões valem no servidor, não só na tela: quem não tem acesso recebe "sem permissão" mesmo chamando a API direto. Ninguém consegue dar uma permissão que não tem.</p>
      {form && <FormUsuario dados={dados} usuario={form === 'novo' ? null : form} aoFechar={() => setForm(null)} aoSalvar={(s) => { setForm(null); recarregar(); if (s) setSenha(s) }} />}
      {senha && <SenhaGerada {...senha} aoFechar={() => setSenha(null)} />}
      {transferir && <TransferirDono u={transferir} aoFechar={() => setTransferir(null)} aoFeito={() => { setTransferir(null); window.location.reload() }} />}
    </div>
  )
}
