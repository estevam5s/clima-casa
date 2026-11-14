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

export default function SegurancaConta() {
  return <div className="grid gap-6 xl:grid-cols-2"><Autenticador /><Biometria /></div>
}
