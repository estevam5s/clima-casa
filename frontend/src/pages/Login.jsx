import { LogoGithub } from '../components/LogoGithub'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Fingerprint, ShieldCheck, Eye, EyeOff, LoaderCircle, MailCheck, Moon, Sun } from 'lucide-react'
import { api, rotaSegura } from '../api'
import { supabase } from '../supabase'
import { DOWNLOADS, sistemaAtual } from '../apps'
import IconeMarca from '../components/IconeMarca'
import { siteComSessao } from '../site'
import { biometriaDisponivel, entrarComBiometria } from '../webauthn'
import Turnstile from '../components/Turnstile'
import Fumaca from '../components/Fumaca'
import { useTema } from '../tema'
import { useMarca, logoDaMarca } from '../marca'

const TEMAS = {
  claro: { '--bg': '#efede7', '--paper': '#f7f6f2', '--sheet': '#e6e3db', '--ink': '#141513', '--muted': '#6f716b', '--line': '#dcd9d0',
    '--field': '#fbfaf7', '--accent': '#0f766a', '--btn': '#141513', '--btn-ink': '#f7f6f2', '--grain-blend': 'multiply' },
  escuro: { '--bg': '#0c0d0d', '--paper': '#121414', '--sheet': '#1a1c1c', '--ink': '#ecede8', '--muted': '#8d908c', '--line': '#262929',
    '--field': '#161818', '--accent': '#2dd4bf', '--btn': '#2dd4bf', '--btn-ink': '#0c0d0d', '--grain-blend': 'soft-light' },
}
const GRAO = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
const ERROS = { 'Invalid login credentials': 'E-mail ou senha incorretos.', 'Email not confirmed': 'E-mail ainda não confirmado.' }
const botaoAlt = 'flex h-12 min-w-0 items-center justify-center gap-2 rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-2 text-[14px] font-medium transition-[transform,border-color] duration-300 hover:border-[var(--muted)]/50 active:scale-[0.985] disabled:opacity-60'
const campo = 'mt-2 h-12 w-full rounded-[14px] border border-[var(--line)] bg-[var(--field)] px-4 text-[15px] text-[var(--ink)] shadow-[0_1px_2px_rgb(0_0_0/0.04)_inset] outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_18%,transparent)]'

function lembrado() { try { return localStorage.getItem('clima-email') || '' } catch { return '' } }

export default function Login() {
  const [pronto, setPronto] = useState(false)
  const [modo, setModo] = useState('entrar') // entrar | esqueci | enviado
  const [email, setEmail] = useState(lembrado)
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [lembrar, setLembrar] = useState(!!lembrado())
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const navegar = useNavigate()
  const estadoNav = useLocation().state
  const inicial = (() => { try { return JSON.parse(localStorage.getItem('clima-marca') || '{}').pagina_inicial || '/' } catch { return '/' } })()
  const destino = rotaSegura(estadoNav?.de || inicial)
  const veio2fa = estadoNav?.etapa === '2fa'
  const [codigo, setCodigoEstado] = useState('')
  const codigoAtual = useRef('')
  const setCodigo = (v) => { codigoAtual.current = v; setCodigoEstado(v) }
  const [robo, setRobo] = useState('')          // token do Turnstile ('' = ainda não, null = desligado)
  const roboRef = useRef(null)
  const [temBio, setTemBio] = useState(false)
  useEffect(() => { setTemBio(biometriaDisponivel()) }, [])
  const calmo = useReducedMotion()
  const { escuro, setEscolha } = useTema()
  const { marca } = useMarca()
  const tema = escuro ? 'escuro' : 'claro'
  const setTema = (t) => setEscolha(t)

  // Já tem sessão válida guardada? Vai direto (a rota protegida confere no servidor), sem mostrar o login.
  // Conferido UMA vez, ao abrir a página. (Antes era a cada render: logo depois da senha certa a sessão já fica
  // guardada e a tela sumia, ficando preta, justo quando ia pedir o código do Google Authenticator.)
  const [sessaoGuardada] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('clima-casa-auth') || 'null'); return !!(s?.access_token && (s.expires_at || 0) * 1000 > Date.now() + 5000) } catch { return false }
  })
  useEffect(() => { if (veio2fa) { setModo('2fa'); setPronto(true) } else if (sessaoGuardada) navegar(destino, { replace: true }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (veio2fa) { setModo('2fa'); setPronto(true); setOcupado(false) } }, [veio2fa])

  useEffect(() => {
    if (sessaoGuardada || veio2fa) return
    // Volta do Google: o Supabase devolve a sessão (ou o erro) na própria URL do /login
    const url = new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1))
    const erroGoogle = url.get('error_description') || url.get('error')
    const veioGoogle = !!(url.get('access_token') || url.get('code') || erroGoogle)
    // o cliente do Supabase lê a sessão do endereço (#access_token) ao ser criado: só depois limpamos a URL
    supabase().then(async (sb) => {
      if (veioGoogle) { await sb.auth.getSession(); window.history.replaceState(null, '', window.location.pathname) }
      if (erroGoogle) {
        const prov = (() => { try { return sessionStorage.getItem('clima-login-provedor') === 'github' ? 'GitHub' : 'Google' } catch { return 'Google' } })()
        setErro(/signup|not allowed|registr/i.test(erroGoogle)
          ? `Essa conta ${prov} não está ligada a nenhum usuário do sistema. Entre com e-mail e senha e conecte o ${prov} em Configurações → Segurança, ou peça ao administrador uma conta com esse e-mail.`
          : `O ${prov} não concluiu o login: ${erroGoogle}`)
        return setPronto(true)
      }
      const { data } = await sb.auth.getSession()
      if (data.session) {
        try {
          await api.get('/api/sessao')
          if (veioGoogle) api.post('/api/sessao/registrar-login', { metodo: (() => { try { return sessionStorage.getItem('clima-login-provedor') || 'google' } catch { return 'google' } })() }).catch(() => {})
          return navegar(destino, { replace: true })
        } catch (err) {
          if (err.precisa2fa) { setModo('2fa'); return setPronto(true) }   // conta com autenticador: falta o código
          await sb.auth.signOut()
          if (veioGoogle) setErro(err.message)
        }
      }
      setPronto(true)
    }).catch((e) => { setErro(e.message); setPronto(true) })
  }, [navegar, destino])

  const entrarGoogle = (provider = 'google') => async () => {
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      try { sessionStorage.setItem('clima-login-provedor', provider) } catch { /* sem armazenamento */ }
      const sb = await supabase()
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/login`, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
      })
      if (error) throw new Error(error.message)
    } catch (err) { setErro(err.message); setOcupado(false) }
  }

  const confirmar2fa = async (e, codigoDigitado) => {
    e?.preventDefault?.()
    const codigo = codigoDigitado ?? codigoAtual.current
    if (ocupado || codigo.replace(/\D/g, '').length !== 6) return
    setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      const { data, error } = await sb.auth.mfa.listFactors()
      if (error) throw new Error(error.message)
      const fator = (data?.totp || []).find((f) => f.status === 'verified')
      if (!fator) throw new Error('Nenhum autenticador cadastrado nesta conta.')
      const { error: errV } = await sb.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.replace(/\D/g, '') })
      if (errV) throw new Error(/invalid|expired/i.test(errV.message) ? 'Código errado ou vencido. Confira a hora do celular e tente o código novo.' : errV.message)
      await api.get('/api/sessao')
      navegar(destino, { replace: true })
    } catch (err) { setErro(err.message); setCodigo(''); setOcupado(false) }
  }
  const sairDoFluxo = async () => { await (await supabase()).auth.signOut().catch(() => {}); try { localStorage.removeItem('clima-casa-auth') } catch { /* */ } setModo('entrar'); setErro(''); setCodigo('') }
  const entrarBio = async () => {
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      const sessao = await entrarComBiometria()
      const { error } = await sb.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token })
      if (error) throw new Error(error.message)
      await api.get('/api/sessao')
      navegar(destino, { replace: true })
    } catch (err) { setErro(err.message); setOcupado(false) }
  }

  const sobe = (i) => ({
    initial: calmo ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(10px)' },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
    transition: { duration: 0.9, delay: 0.15 + i * 0.07, ease: [0.22, 1, 0.36, 1] },
  })

  const entrar = async (e) => {
    e.preventDefault()
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      // login passa pelo firewall do sistema (conta tentativas por IP e e-mail, bloqueio progressivo)
      if (robo === '') throw new Error('Aguarde a verificação contra robôs terminar e tente de novo.')
      const sessao = await api.post('/api/auth/entrar', { email: email.trim(), senha, turnstile: robo })
      const { error } = await sb.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token })
      if (error) throw new Error(ERROS[error.message] || error.message)
      try { lembrar ? localStorage.setItem('clima-email', email.trim()) : localStorage.removeItem('clima-email') } catch { /* sem storage */ }
      if (sessao.precisa_2fa) { setModo('2fa'); setOcupado(false); return }   // senha certa: falta o Google Authenticator
      try { await api.get('/api/sessao') } catch (err) { await sb.auth.signOut(); throw err }
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(err.message); setOcupado(false); roboRef.current?.reiniciar()
    }
  }

  const recuperar = async (e) => {
    e.preventDefault()
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      if (robo === '') throw new Error('Aguarde a verificação contra robôs terminar e tente de novo.')
      await api.post('/api/auth/esqueci', { email: email.trim(), turnstile: robo, voltar_para: `${window.location.origin}/redefinir-senha` })
      setModo('enviado')
    } catch (err) { setErro(err.message); roboRef.current?.reiniciar() } finally { setOcupado(false) }
  }

  const meu = sistemaAtual()
  if (sessaoGuardada && !veio2fa && modo === 'entrar') return null
  return (
    <div style={TEMAS[tema]} className={`relative grid min-h-dvh w-full grid-cols-1 gap-3 overflow-x-clip bg-[var(--bg)] p-3 text-[var(--ink)] transition-colors duration-700 ${marca.login_layout === 'centralizado' ? '' : 'lg:grid-cols-[1.08fr_1fr]'}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-40" style={{ backgroundImage: GRAO, mixBlendMode: 'var(--grain-blend)' }} />

      {/* esquerda: a fumaça numa pequena pilha de papel */}
      <section className={`relative z-[1] min-h-[38vh] lg:min-h-0 ${marca.login_layout === 'centralizado' ? 'hidden' : ''}`}>
        <div aria-hidden className="absolute inset-0 rotate-[-1.4deg] rounded-[28px] bg-[var(--sheet)] transition-colors duration-700" />
        <div aria-hidden className="absolute inset-0 rotate-[0.9deg] rounded-[28px] bg-[var(--paper)] transition-colors duration-700" />
        <div className="relative h-full overflow-hidden rounded-[28px] bg-[var(--paper)] transition-colors duration-700"> {/* marca: folha principal */}
          {marca.login_fundo === 'imagem' && marca.login_imagem && <img src={marca.login_imagem} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          {marca.login_fundo === 'cor' && <div className="absolute inset-0" style={{ background: marca.login_cor }} />}
          {pronto && (marca.login_fundo || 'fumaca') === 'fumaca' && marca.login_fumaca && <Fumaca escuro={escuro} />}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: GRAO, mixBlendMode: 'var(--grain-blend)' }} />
          <motion.div {...sobe(0)} className="absolute left-6 top-6 flex items-center gap-2.5">
            {logoDaMarca(marca, escuro) ? <img src={logoDaMarca(marca, escuro)} alt="" className="h-7 w-7 rounded-lg object-contain" /> : <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true"><rect width="32" height="32" rx="8" fill="hsl(var(--primary))" /><path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>}
            <span className="text-[15px] font-semibold tracking-[-0.02em]">{marca.nome}</span>
          </motion.div>
          <motion.div {...sobe(1)} className="absolute inset-x-6 bottom-6 hidden max-w-[26rem] sm:block">
            <p className="text-[28px] font-medium leading-[1.1] tracking-[-0.035em]">{marca.slogan}</p>
            <p className="mt-2 text-[13px] text-[var(--muted)]">{marca.descricao}</p>
          </motion.div>
        </div>
      </section>

      {/* direita: o formulário */}
      <section className="relative z-[1] flex items-center justify-center px-5 py-16 sm:px-10">
        {marca.mostrar_link_site !== false && <a href={siteComSessao(false)} className="absolute left-3 top-3 flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--field)] px-3.5 text-[13px] font-medium transition-transform duration-300 active:scale-95 sm:left-6 sm:top-6">
          <ArrowLeft className="h-4 w-4" /> Voltar ao site
        </a>}
        <button type="button" onClick={() => setTema(escuro ? 'claro' : 'escuro')} aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
          className="absolute right-3 top-3 flex h-9 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--field)] pl-2.5 pr-3.5 text-[13px] font-medium transition-transform duration-300 active:scale-95 sm:right-6 sm:top-6">
          <span className="relative grid h-4 w-4 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span key={tema} initial={{ opacity: 0, rotate: -90, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }} className="absolute">
                {escuro ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </span>
          {escuro ? 'Escuro' : 'Claro'}
        </button>

        <div className="w-full max-w-[460px]">
          <AnimatePresence mode="wait">
            {modo === 'entrar' && (
              <motion.div key="entrar" exit={{ opacity: 0, y: -6 }}>
                <motion.h1 {...sobe(2)} className="text-[34px] font-semibold leading-none tracking-[-0.045em]">{marca.login_titulo}</motion.h1>
                <motion.p {...sobe(3)} className="mt-3 text-[15px] text-[var(--muted)]">{marca.login_subtitulo}</motion.p>
                {marca.login_aviso && <motion.p {...sobe(3)} role="status" className="mt-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-snug">{marca.login_aviso}</motion.p>}
                {marca.manutencao && <motion.p {...sobe(3)} role="status" className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--field)] px-3.5 py-2.5 text-[13px] leading-snug">Sistema em manutenção: só administradores conseguem entrar agora.</motion.p>}
                <form onSubmit={entrar} className="mt-9 space-y-4">
                  <motion.div {...sobe(4)}>
                    <label htmlFor="email" className="text-[13px] font-medium">E-mail</label>
                    <input id="email" type="email" required autoComplete="username" placeholder="voce@empresa.com.br" value={email}
                      onChange={(e) => setEmail(e.target.value)} className={campo} autoFocus={!email} />
                  </motion.div>
                  <motion.div {...sobe(5)}>
                    <div className="flex items-baseline justify-between">
                      <label htmlFor="senha" className="text-[13px] font-medium">Senha</label>
                      <button type="button" onClick={() => { setModo('esqueci'); setErro('') }} className="text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]">Esqueci a senha</button>
                    </div>
                    <div className="relative">
                      <input id="senha" type={ver ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••" value={senha}
                        onChange={(e) => setSenha(e.target.value)} className={`${campo} pr-12`} autoFocus={!!email} />
                      <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                        className="absolute right-1.5 top-1/2 mt-1 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px] text-[var(--muted)] transition-colors hover:text-[var(--ink)]">
                        {ver ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                      </button>
                    </div>
                  </motion.div>
                  <motion.label {...sobe(6)} className="flex cursor-pointer items-center gap-2 text-[13px] text-[var(--muted)]">
                    <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Lembrar meu e-mail neste aparelho
                  </motion.label>
                  <Turnstile key="ts-entrar" ref={roboRef} aoMudar={setRobo} tema={escuro ? 'dark' : 'light'} acao="login" aparencia="always" className="min-h-[65px]" />
                  <AnimatePresence>
                    {erro && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      role="alert" className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{erro}</motion.p>}
                  </AnimatePresence>
                  <motion.div {...sobe(7)} className="pt-2">
                    <button type="submit" disabled={ocupado}
                      className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] transition-[transform,box-shadow] duration-300 hover:shadow-[0_14px_30px_-12px_var(--accent)] active:scale-[0.985] disabled:opacity-80">
                      {ocupado ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <>Entrar <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" /></>}
                    </button>
                    <div className="my-5 flex items-center gap-3 text-[12px] text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--line)]" />ou entre com<span className="h-px flex-1 bg-[var(--line)]" /></div>
                    <div className={`grid gap-2.5 ${temBio ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <button type="button" onClick={entrarGoogle('google')} disabled={ocupado} aria-label="Entrar com Google" title="Entrar com Google"
                        className={botaoAlt}>
                        <svg viewBox="0 0 48 48" className="h-[18px] w-[18px] shrink-0" aria-hidden="true">
                        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                        <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                        <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
                      </svg>
                        Google
                      </button>
                      <button type="button" onClick={entrarGoogle('github')} disabled={ocupado} aria-label="Entrar com GitHub" title="Entrar com GitHub" className={botaoAlt}>
                        <LogoGithub className="h-[18px] w-[18px] shrink-0" />
                        GitHub
                      </button>
                      {temBio && (
                        <button type="button" onClick={entrarBio} disabled={ocupado} aria-label="Entrar com biometria" title="Entrar com biometria (digital, rosto ou chave de acesso)" className={botaoAlt}>
                          <Fingerprint className="h-[18px] w-[18px] shrink-0" /> Biometria
                        </button>
                      )}
                    </div>
                  </motion.div>
                </form>
              </motion.div>
            )}

            {modo === '2fa' && (
              <motion.div key="2fa" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <ShieldCheck className="h-10 w-10 text-[var(--accent)]" strokeWidth={1.5} />
                <h1 className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.04em]">Verificação em duas etapas</h1>
                <p className="mt-3 text-[15px] text-[var(--muted)]">Abra o Google Authenticator e digite o código de 6 dígitos do Clima Escritório.</p>
                <form onSubmit={confirmar2fa} className="mt-8 space-y-4">
                  <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} autoFocus required value={codigo}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCodigo(v); if (v.length === 6) confirmar2fa(null, v) }}
                    aria-label="Código de 6 dígitos" placeholder="000000"
                    className={`${campo} text-center font-mono text-[28px] tracking-[0.5em]`} />
                  {erro && <p role="alert" className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{erro}</p>}
                  <button type="submit" disabled={ocupado || codigo.length !== 6} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] active:scale-[0.985] disabled:opacity-60">
                    {ocupado ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : 'Confirmar'}
                  </button>
                  <button type="button" onClick={sairDoFluxo} className="w-full text-center text-[13px] text-[var(--muted)] hover:text-[var(--ink)]">Entrar com outra conta</button>
                </form>
              </motion.div>
            )}

            {modo === 'esqueci' && (
              <motion.div key="esqueci" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
                <button onClick={() => { setModo('entrar'); setErro('') }} className="mb-6 flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--ink)]"><ArrowLeft className="h-4 w-4" /> Voltar</button>
                <h1 className="text-[30px] font-semibold leading-none tracking-[-0.04em]">Redefinir a senha</h1>
                <p className="mt-3 text-[15px] text-[var(--muted)]">Enviamos um link para o e-mail do administrador. Ele vale por 1 hora.</p>
                <form onSubmit={recuperar} className="mt-8 space-y-4">
                  <div>
                    <label htmlFor="email2" className="text-[13px] font-medium">E-mail</label>
                    <input id="email2" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} autoFocus />
                  </div>
                  <Turnstile key="ts-esqueci" ref={roboRef} aoMudar={setRobo} tema={escuro ? 'dark' : 'light'} acao="esqueci" aparencia="always" className="min-h-[65px]" />
                  {erro && <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">{erro}</p>}
                  <button type="submit" disabled={ocupado} className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] active:scale-[0.985] disabled:opacity-80">
                    {ocupado ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : 'Enviar link'}
                  </button>
                </form>
              </motion.div>
            )}

            {modo === 'enviado' && (
              <motion.div key="enviado" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                <MailCheck className="mx-auto h-10 w-10 text-[var(--accent)]" strokeWidth={1.5} />
                <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.04em]">Confira o e-mail</h1>
                <p className="mt-2 text-[15px] text-[var(--muted)]">Se {email} for o administrador, o link para criar uma senha nova chega em instantes.</p>
                <button onClick={() => setModo('entrar')} className="mt-6 text-[13px] font-medium underline-offset-4 hover:underline">Voltar para o login</button>
              </motion.div>
            )}
          </AnimatePresence>

          {marca.login_downloads && <>
          <motion.div {...sobe(9)} className="my-8 flex items-center gap-3 text-[12px] text-[var(--muted)]">
            <span className="h-px flex-1 bg-[var(--line)]" /> Apps <span className="h-px flex-1 bg-[var(--line)]" />
          </motion.div>
          <motion.div {...sobe(10)} className="grid grid-cols-2 gap-2.5">
            {DOWNLOADS.filter((d) => ['android', 'mac-arm', 'windows', 'linux'].includes(d.id)).map((d) => (
              <a key={d.id} href={d.url}
                className={`flex h-11 items-center justify-center gap-2 rounded-[14px] border bg-[var(--field)] text-[13px] font-medium transition-[transform,border-color] duration-300 hover:border-[var(--muted)]/50 active:scale-[0.98] ${meu === d.id ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}>
                <IconeMarca nome={d.plataforma} className="h-4 w-4" /> {d.nome.split(' · ')[0]}
              </a>
            ))}
          </motion.div>
          </>}
          <motion.p {...sobe(11)} className="mt-8 text-center text-[12px] text-[var(--muted)]">{marca.login_rodape}
            {(marca.link_privacidade || marca.link_termos) && <span className="mt-1.5 flex justify-center gap-3">{marca.link_privacidade && <a href={marca.link_privacidade} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Privacidade</a>}{marca.link_termos && <a href={marca.link_termos} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">Termos</a>}</span>}
            {marca.suporte_email && <> · <a href={`mailto:${marca.suporte_email}`} className="underline-offset-4 hover:underline">{marca.suporte_email}</a></>}</motion.p>
        </div>
      </section>
    </div>
  )
}
