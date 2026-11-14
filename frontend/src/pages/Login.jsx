import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Download, Eye, EyeOff, LoaderCircle, MailCheck, Moon, Sun } from 'lucide-react'
import { api } from '../api'
import { supabase } from '../supabase'
import { DOWNLOADS, sistemaAtual } from '../apps'
import Fumaca from '../components/Fumaca'
import { useTema } from '../tema'
import { useMarca } from '../marca'

const TEMAS = {
  claro: { '--bg': '#efede7', '--paper': '#f7f6f2', '--sheet': '#e6e3db', '--ink': '#141513', '--muted': '#6f716b', '--line': '#dcd9d0',
    '--field': '#fbfaf7', '--accent': '#0f766a', '--btn': '#141513', '--btn-ink': '#f7f6f2', '--grain-blend': 'multiply' },
  escuro: { '--bg': '#0c0d0d', '--paper': '#121414', '--sheet': '#1a1c1c', '--ink': '#ecede8', '--muted': '#8d908c', '--line': '#262929',
    '--field': '#161818', '--accent': '#2dd4bf', '--btn': '#2dd4bf', '--btn-ink': '#0c0d0d', '--grain-blend': 'soft-light' },
}
const GRAO = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"
const ERROS = { 'Invalid login credentials': 'E-mail ou senha incorretos.', 'Email not confirmed': 'E-mail ainda não confirmado.' }
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
  const destino = useLocation().state?.de || '/'
  const calmo = useReducedMotion()
  const { escuro, setEscolha } = useTema()
  const { marca } = useMarca()
  const tema = escuro ? 'escuro' : 'claro'
  const setTema = (t) => setEscolha(t)

  useEffect(() => {
    supabase().then(async (sb) => {
      const { data } = await sb.auth.getSession()
      if (data.session) {
        try { await api.get('/api/sessao'); return navegar(destino, { replace: true }) } catch { await sb.auth.signOut() }
      }
      setPronto(true)
    }).catch((e) => { setErro(e.message); setPronto(true) })
  }, [navegar, destino])

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
      const sessao = await api.post('/api/auth/entrar', { email: email.trim(), senha })
      const { error } = await sb.auth.setSession({ access_token: sessao.access_token, refresh_token: sessao.refresh_token })
      if (error) throw new Error(ERROS[error.message] || error.message)
      try { await api.get('/api/sessao') } catch (err) { await sb.auth.signOut(); throw err }
      try { lembrar ? localStorage.setItem('clima-email', email.trim()) : localStorage.removeItem('clima-email') } catch { /* sem storage */ }
      navegar(destino, { replace: true })
    } catch (err) {
      setErro(err.message); setOcupado(false)
    }
  }

  const recuperar = async (e) => {
    e.preventDefault()
    if (ocupado) return
    setErro(''); setOcupado(true)
    try {
      const sb = await supabase()
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
      if (error) throw new Error(error.message)
      setModo('enviado')
    } catch (err) { setErro(err.message) } finally { setOcupado(false) }
  }

  const meu = sistemaAtual()
  return (
    <div style={TEMAS[tema]} className="relative grid min-h-dvh w-full grid-cols-1 gap-3 overflow-x-clip bg-[var(--bg)] p-3 text-[var(--ink)] transition-colors duration-700 lg:grid-cols-[1.08fr_1fr]">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-40" style={{ backgroundImage: GRAO, mixBlendMode: 'var(--grain-blend)' }} />

      {/* esquerda: a fumaça numa pequena pilha de papel */}
      <section className="relative z-[1] min-h-[38vh] lg:min-h-0">
        <div aria-hidden className="absolute inset-0 rotate-[-1.4deg] rounded-[28px] bg-[var(--sheet)] transition-colors duration-700" />
        <div aria-hidden className="absolute inset-0 rotate-[0.9deg] rounded-[28px] bg-[var(--paper)] transition-colors duration-700" />
        <div className="relative h-full overflow-hidden rounded-[28px] bg-[var(--paper)] transition-colors duration-700"> {/* marca: folha principal */}
          {pronto && marca.login_fumaca && <Fumaca escuro={escuro} />}
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: GRAO, mixBlendMode: 'var(--grain-blend)' }} />
          <motion.div {...sobe(0)} className="absolute left-6 top-6 flex items-center gap-2.5">
            {marca.logo ? <img src={marca.logo} alt="" className="h-7 w-7 rounded-lg object-contain" /> : <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true"><rect width="32" height="32" rx="8" fill="hsl(var(--primary))" /><path d="M16 6v20M7.3 11l17.4 10M7.3 21l17.4-10" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>}
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

        <div className="w-full max-w-[380px]">
          <AnimatePresence mode="wait">
            {modo === 'entrar' && (
              <motion.div key="entrar" exit={{ opacity: 0, y: -6 }}>
                <motion.h1 {...sobe(2)} className="text-[34px] font-semibold leading-none tracking-[-0.045em]">{marca.login_titulo}</motion.h1>
                <motion.p {...sobe(3)} className="mt-3 text-[15px] text-[var(--muted)]">{marca.login_subtitulo}</motion.p>
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
                  <AnimatePresence>
                    {erro && <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      role="alert" className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">{erro}</motion.p>}
                  </AnimatePresence>
                  <motion.div {...sobe(7)} className="pt-2">
                    <button type="submit" disabled={ocupado}
                      className="group relative flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--btn)] text-[15px] font-medium text-[var(--btn-ink)] transition-[transform,box-shadow] duration-300 hover:shadow-[0_14px_30px_-12px_var(--accent)] active:scale-[0.985] disabled:opacity-80">
                      {ocupado ? <LoaderCircle className="h-[18px] w-[18px] animate-spin" /> : <>Entrar <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" /></>}
                    </button>
                  </motion.div>
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
                <Download className="h-4 w-4" /> {d.nome.replace(' (Apple Silicon)', '')}
              </a>
            ))}
          </motion.div>
          </>}
          <motion.p {...sobe(11)} className="mt-8 text-center text-[12px] text-[var(--muted)]">{marca.login_rodape}
            {marca.suporte_email && <> · <a href={`mailto:${marca.suporte_email}`} className="underline-offset-4 hover:underline">{marca.suporte_email}</a></>}</motion.p>
        </div>
      </section>
    </div>
  )
}
