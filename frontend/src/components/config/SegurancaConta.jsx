import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Fingerprint, KeyRound, Laptop, Pencil, RefreshCw, ShieldCheck, ShieldOff, Smartphone, Trash2, X } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { supabase } from '../../supabase'
import { biometriaDisponivel, cadastrarBiometria, temBiometriaNoAparelho } from '../../webauthn'
import { Aviso, Botao, Secao, useToast } from '../ui'

const traduzir = (m = '') => (/invalid|expired/i.test(m) ? 'Código errado ou vencido. Confira a hora do celular e use o código novo.'
  : /aal2|AAL2/.test(m) ? 'Confirme um código do autenticador atual antes desta ação.' : m)

function CampoCodigo({ valor, setValor, autoFocus }) {
  return (
    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={valor} autoFocus={autoFocus} placeholder="000000" aria-label="Código de 6 dígitos"
      onChange={(e) => setValor(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className="campo w-40 text-center font-mono text-xl tracking-[0.4em]" />
  )
}

// Google Authenticator (TOTP), com o MFA do próprio Supabase: o backend passa a exigir o código em todo login.
function Autenticador() {
  const toast = useToast()
  const [fatores, setFatores] = useState(null)
  const [cadastro, setCadastro] = useState(null)   // { id, qr, segredo, substitui }
  const [codigo, setCodigo] = useState('')
  const [etapa, setEtapa] = useState(null)          // null | 'cancelar'
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const carregar = async () => {
    const sb = await supabase()
    const { data } = await sb.auth.mfa.listFactors()
    setFatores((data?.all || []).filter((f) => f.factor_type === 'totp'))
  }
  useEffect(() => { carregar() }, [])
  const ativo = (fatores || []).find((f) => f.status === 'verified')

  const iniciar = async () => {
    setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      for (const f of (fatores || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id })  // limpa tentativas antigas
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', issuer: 'Clima Escritório', friendlyName: `Autenticador ${new Date().toLocaleString('pt-BR')}` })
      if (error) throw new Error(error.message)
      setCadastro({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret, substitui: ativo?.id || null }); setCodigo('')
    } catch (e) { setErro(traduzir(e.message)) } finally { setOcupado(false) }
  }
  const confirmar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: cadastro.id, code: codigo })
      if (error) throw new Error(error.message)
      if (cadastro.substitui) await sb.auth.mfa.unenroll({ factorId: cadastro.substitui })   // troca de celular: remove o antigo
      toast(cadastro.substitui ? 'Autenticador trocado.' : 'Verificação em duas etapas ativada.')
      setCadastro(null); setCodigo(''); await carregar()
    } catch (err) { setErro(traduzir(err.message)); setCodigo('') } finally { setOcupado(false) }
  }
  const desistir = async () => {
    const sb = await supabase()
    if (cadastro) await sb.auth.mfa.unenroll({ factorId: cadastro.id }).catch(() => {})
    setCadastro(null); setCodigo(''); setErro(''); carregar()
  }
  const cancelar = async (e) => {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: ativo.id, code: codigo })   // prova que ainda tem o celular
      if (error) throw new Error(error.message)
      const { error: e2 } = await sb.auth.mfa.unenroll({ factorId: ativo.id })
      if (e2) throw new Error(e2.message)
      toast('Verificação em duas etapas desativada.'); setEtapa(null); setCodigo(''); await carregar()
    } catch (err) { setErro(traduzir(err.message)); setCodigo('') } finally { setOcupado(false) }
  }

  return (
    <Secao titulo="Verificação em duas etapas" contexto="Google Authenticator, Microsoft Authenticator, Authy ou 1Password"
      acao={ativo && !cadastro ? <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" />Ativa</span> : null}>
      <AnimatePresence mode="wait">
        {cadastro ? (
          <motion.div key="cadastro" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-6 sm:grid-cols-[200px_1fr]">
            <div className="rounded-xl bg-white p-3"><img src={cadastro.qr} alt="QR Code para o Google Authenticator" className="h-full w-full" /></div>
            <div className="space-y-4">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                <li>Abra o <strong>Google Authenticator</strong> no celular e toque em <strong>+</strong> → <strong>Ler código QR</strong>.</li>
                <li>Aponte para o código ao lado. Aparece "Clima Escritório".</li>
                <li>Digite abaixo o código de 6 dígitos que ele mostra.</li>
              </ol>
              <div className="text-xs text-muted-foreground">
                Sem câmera? Digite a chave no app (tipo "baseado no tempo"):
                <div className="mt-1 flex items-center gap-2"><code className="break-all rounded bg-muted px-2 py-1 font-mono text-[12px] text-foreground">{cadastro.segredo}</code>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(cadastro.segredo); setCopiado(true) }} className="rounded p-1 hover:bg-muted" aria-label="Copiar chave">{copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button></div>
              </div>
              <form onSubmit={confirmar} className="flex flex-wrap items-center gap-2">
                <CampoCodigo valor={codigo} setValor={setCodigo} autoFocus />
                <Botao type="submit" carregando={ocupado} disabled={codigo.length !== 6}>Confirmar e salvar</Botao>
                <Botao type="button" variante="fantasma" onClick={desistir}>Desistir</Botao>
              </form>
              {erro && <Aviso>{erro}</Aviso>}
            </div>
          </motion.div>
        ) : etapa === 'cancelar' ? (
          <motion.form key="cancelar" onSubmit={cancelar} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
            <p className="text-sm">Para desativar, digite um código atual do autenticador.</p>
            <div className="flex flex-wrap items-center gap-2">
              <CampoCodigo valor={codigo} setValor={setCodigo} autoFocus />
              <Botao type="submit" variante="perigo" carregando={ocupado} disabled={codigo.length !== 6}>Desativar</Botao>
              <Botao type="button" variante="fantasma" onClick={() => { setEtapa(null); setCodigo(''); setErro('') }}>Voltar</Botao>
            </div>
            {erro && <Aviso>{erro}</Aviso>}
          </motion.form>
        ) : (
          <motion.div key="estado" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="flex items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ativo ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{ativo ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}</span>
              <p className="text-sm text-muted-foreground">{ativo
                ? `Cadastrada em ${new Date(ativo.created_at).toLocaleDateString('pt-BR')}. Todo login com senha pede também o código de 6 dígitos do celular.`
                : 'Além da senha, o login passa a pedir um código de 6 dígitos que muda a cada 30 segundos no seu celular. Mesmo com a senha, ninguém entra sem ele.'}</p>
            </div>
            {fatores === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : (
              <div className="flex flex-wrap gap-2">
                {ativo ? (
                  <>
                    <Botao variante="secundario" icone={RefreshCw} carregando={ocupado} onClick={iniciar}>Trocar de celular</Botao>
                    <Botao variante="secundario" icone={X} onClick={() => { setEtapa('cancelar'); setErro('') }}>Desativar</Botao>
                  </>
                ) : <Botao icone={KeyRound} carregando={ocupado} onClick={iniciar}>Ativar com Google Authenticator</Botao>}
              </div>
            )}
            {erro && <Aviso>{erro}</Aviso>}
            <p className="text-xs text-muted-foreground">Perdeu o celular? Um administrador remove o autenticador em Configurações → Usuários, e você cadastra de novo.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Secao>
  )
}

function nomeDoAparelho() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone (Face ID / Touch ID)'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android (digital / rosto)'
  if (/Mac/.test(ua)) return 'Mac (Touch ID)'
  if (/Windows/.test(ua)) return 'Windows Hello'
  return 'Este aparelho'
}

function Biometria() {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [suporta, setSuporta] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null)
  const [erro, setErro] = useState('')
  const carregar = () => api.get('/api/conta/passkeys').then(setLista).catch((e) => setErro(e.message))
  useEffect(() => { carregar(); temBiometriaNoAparelho().then(setSuporta) }, [])
  const cadastrar = async () => {
    setErro(''); setOcupado(true)
    try { await cadastrarBiometria(nomeDoAparelho()); toast('Biometria cadastrada. No próximo login, use "Entrar com biometria".'); carregar() } catch (e) { setErro(e.message) } finally { setOcupado(false) }
  }
  const renomear = async (id, nome) => { try { await api.put(`/api/conta/passkeys/${id}`, { nome }); setEditando(null); carregar() } catch (e) { toast(e.message, 'erro') } }
  const remover = async (p) => {
    if (!window.confirm(`Remover "${p.nome}"? Esse aparelho deixa de entrar com biometria.`)) return
    try { await api.del(`/api/conta/passkeys/${p.id}`); toast('Biometria removida.'); carregar() } catch (e) { toast(e.message, 'erro') }
  }
  return (
    <Secao titulo="Biometria e chaves de acesso" contexto="Face ID, Touch ID, digital no Android ou Windows Hello: entrar sem digitar senha"
      acao={<Botao tamanho="sm" icone={Fingerprint} carregando={ocupado} disabled={!biometriaDisponivel()} onClick={cadastrar} className="whitespace-nowrap">Cadastrar aparelho</Botao>}>
      <div className="space-y-4">
        {suporta === false && <Aviso tipo="aviso">Este navegador não encontrou biometria neste aparelho. Ainda dá para cadastrar uma chave de segurança (USB/NFC) ou usar o celular por QR Code quando o navegador oferecer.</Aviso>}
        {erro && <Aviso>{erro}</Aviso>}
        {lista === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum aparelho cadastrado. Cadastre o celular ou o computador que você mais usa: o login fica com um toque no sensor.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((p) => {
              const Icone = /iPhone|Android|iPad/.test(p.nome) ? Smartphone : Laptop
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Icone className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    {editando === p.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); renomear(p.id, e.target.nome.value) }} className="flex gap-2">
                        <input name="nome" defaultValue={p.nome} maxLength={60} autoFocus className="campo h-8 text-sm" aria-label="Nome do aparelho" />
                        <Botao tamanho="sm" type="submit">Salvar</Botao>
                      </form>
                    ) : <p className="truncate text-sm font-medium">{p.nome}</p>}
                    <p className="text-xs text-muted-foreground">Cadastrado {haQuanto(p.criado_em)} · {p.ultimo_uso ? `último uso ${haQuanto(p.ultimo_uso)}` : 'ainda não usado'}</p>
                  </div>
                  <button onClick={() => setEditando(editando === p.id ? null : p.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Renomear"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => remover(p)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">A biometria fica no seu aparelho: o sistema guarda só uma chave pública. Login com biometria já vale como verificação em duas etapas.</p>
      </div>
    </Secao>
  )
}

const LogoGoogle = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

// Conta Google ligada ao usuário (identidade do Supabase Auth). Ligada, o botão "Entrar com Google" do login abre esta conta,
// mesmo que o e-mail do Google seja diferente do e-mail do sistema.
function ContaGoogle() {
  const toast = useToast()
  const [google, setGoogle] = useState(undefined)   // undefined = carregando, null = não ligada
  const [total, setTotal] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const carregar = async () => {
    const sb = await supabase()
    const { data, error } = await sb.auth.getUserIdentities()
    if (error) { setErro(error.message); setGoogle(null); return }
    const ids = data?.identities || []
    setTotal(ids.length)
    setGoogle(ids.find((i) => i.provider === 'google') || null)
  }
  useEffect(() => {
    // volta do Google: erro na URL (ex.: conta Google já ligada a outro usuário)
    const url = new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1))
    const e = url.get('error_description') || url.get('error')
    if (e) {
      setErro(/already|exists|linked/i.test(e) ? 'Essa conta Google já está ligada a outro usuário do sistema.' : `O Google não concluiu a conexão: ${e}`)
      window.history.replaceState(null, '', `${window.location.pathname}?aba=seguranca`)
    } else if (url.get('access_token') || url.get('code')) {
      toast('Conta Google conectada. Agora você pode entrar com o Google.')
      window.history.replaceState(null, '', `${window.location.pathname}?aba=seguranca`)
    }
    carregar().catch((x) => { setErro(x.message); setGoogle(null) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // (a URL só é limpa depois de o cliente do Supabase já ter lido os tokens: supabase() é criado antes, no layout)
  const conectar = async () => {
    setOcupado(true); setErro('')
    try {
      const sb = await supabase()
      const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: `${window.location.origin}/configuracoes?aba=seguranca`, queryParams: { prompt: 'select_account' } } })
      if (error) throw new Error(/manual linking/i.test(error.message) ? 'A conexão de contas está desligada no servidor de login.' : error.message)
    } catch (e) { setErro(e.message); setOcupado(false) }
  }
  const desconectar = async () => {
    if (!window.confirm('Desconectar a conta Google? Você volta a entrar só com e-mail e senha (ou biometria).')) return
    setOcupado(true); setErro('')
    try {
      const sb = await supabase()
      const { error } = await sb.auth.unlinkIdentity(google)
      if (error) throw new Error(error.message)
      toast('Conta Google desconectada.')
      await carregar()
    } catch (e) { setErro(e.message) } finally { setOcupado(false) }
  }
  const dados = google?.identity_data || {}
  return (
    <Secao titulo="Login com Google" contexto="Entre no sistema com a sua conta Google, sem digitar a senha">
      {erro && <div className="mb-4"><Aviso>{erro}</Aviso></div>}
      {google === undefined ? <p className="text-sm text-muted-foreground">Carregando…</p> : google ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border p-3">
            {dados.avatar_url ? <img src={dados.avatar_url} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-muted"><LogoGoogle /></span>}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium"><LogoGoogle className="h-4 w-4" />{dados.full_name || dados.name || 'Conta Google'}</p>
              <p className="truncate text-xs text-muted-foreground">{dados.email || google.email}{google.created_at ? ` · conectada ${haQuanto(Math.floor(new Date(google.created_at).getTime() / 1000))}` : ''}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" />Conectada</span>
          </div>
          <p className="text-sm text-muted-foreground">Na tela de login, use <b className="font-medium text-foreground">Entrar com Google</b> e escolha esta conta. Se você usa o Google Authenticator, o código continua sendo pedido.</p>
          <Botao variante="secundario" tamanho="sm" icone={X} carregando={ocupado} disabled={total < 2} onClick={desconectar}>Desconectar</Botao>
          {total < 2 && <p className="text-xs text-muted-foreground">É o único jeito de entrar desta conta: para desconectar, defina antes uma senha no Perfil.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Conecte uma conta Google para entrar com um clique. Pode ser um e-mail diferente do seu e-mail do sistema. Só você consegue conectar a sua conta, porque o Google pede a sua confirmação.</p>
          <button onClick={conectar} disabled={ocupado}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60 sm:w-auto sm:px-5">
            <LogoGoogle className="h-[18px] w-[18px]" />{ocupado ? 'Abrindo o Google…' : 'Conectar conta Google'}
          </button>
        </div>
      )}
    </Secao>
  )
}

// Sessões abertas da conta (aparelho, local, último uso) e encerrar à distância
function Sessoes() {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const carregar = () => api.get('/api/conta/sessoes').then(setLista).catch(() => setLista([]))
  useEffect(() => { carregar() }, [])
  const encerrar = async (corpo, msg) => {
    try { const r = await api.post('/api/conta/sessoes/encerrar', corpo); toast(`${msg} (${r.encerradas}).`); carregar() } catch (e) { toast(e.message, 'erro') }
  }
  const outras = (lista || []).filter((x) => !x.atual).length
  return (
    <Secao titulo="Sessões ativas" contexto="Onde a sua conta está aberta agora"
      acao={outras > 0 && <Botao variante="secundario" tamanho="sm" icone={X} onClick={() => window.confirm('Encerrar todas as outras sessões? Os outros aparelhos vão pedir login de novo.') && encerrar({ todas_menos_esta: true }, 'Sessões encerradas')}>Encerrar as outras</Botao>}>
      {!lista ? <p className="text-sm text-muted-foreground">Carregando…</p> : lista.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma sessão registrada ainda.</p> : (
        <ul className="divide-y divide-border">
          {lista.map((x) => (
            <li key={x.id} className="flex items-center gap-3 py-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${x.atual ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{/Android|iPhone|iPad/.test(x.agente) ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-medium">{x.agente}{x.atual && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">ESTE APARELHO</span>}</p>
                <p className="truncate text-xs text-muted-foreground">{[x.cidade, x.pais].filter(Boolean).join(', ') || 'Local desconhecido'} · {x.ip} · entrou {haQuanto(x.criado_em)} · último uso {haQuanto(x.visto_em)}</p>
              </div>
              {!x.atual && <Botao variante="secundario" tamanho="sm" onClick={() => encerrar({ id: x.id }, 'Sessão encerrada')}>Encerrar</Botao>}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Sessões sem uso expiram sozinhas, e cada login tem duração máxima (Segurança → Regras do firewall).</p>
    </Secao>
  )
}

export default function SegurancaConta() {
  return <div className="grid gap-6 xl:grid-cols-2"><ContaGoogle /><Autenticador /><Biometria /><Sessoes /></div>
}
