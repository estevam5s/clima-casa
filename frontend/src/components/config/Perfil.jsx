import { useRef, useState } from 'react'
import { Camera, Link2, Loader2, Trash2, Upload } from 'lucide-react'
import { api, validarSenhaNova } from '../../api'
import { supabase } from '../../supabase'
import { Aviso, Botao, Carregando, Secao, useDados, useToast } from '../ui'
import Turnstile from '../Turnstile'

export const avisarPerfil = () => window.dispatchEvent(new Event('clima:perfil'))
const iniciais = (n, e) => ((n || e || 'AD').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('') || 'AD').toUpperCase()

export function Avatar({ perfil, email, tamanho = 'h-8 w-8', texto = 'text-xs' }) {
  if (perfil?.avatar) return <img src={perfil.avatar} alt="" className={`${tamanho} shrink-0 rounded-full object-cover`} />
  return <span className={`flex ${tamanho} shrink-0 items-center justify-center rounded-full bg-muted ${texto} font-semibold uppercase`}>{iniciais(perfil?.nome, email)}</span>
}

function Foto({ perfil, email, aoMudar }) {
  const toast = useToast()
  const arquivo = useRef(null)
  const [link, setLink] = useState('')
  const [ocupado, setOcupado] = useState(null)
  const [arrastando, setArrastando] = useState(false)
  const enviar = async (corpo, tipo) => {
    setOcupado(tipo)
    try { aoMudar(await api.post('/api/perfil/avatar', corpo)); avisarPerfil(); toast('Foto atualizada.'); setLink('') } catch (e) { toast(e.message, 'erro') } finally { setOcupado(null) }
  }
  const lerArquivo = (f) => {
    if (!f) return
    if (f.size > 8 * 1024 * 1024) { toast('A imagem passa de 8 MB.', 'erro'); return }
    const r = new FileReader()
    r.onload = () => enviar({ dados: r.result }, 'arquivo')
    r.readAsDataURL(f)
  }
  const remover = async () => { try { aoMudar(await api.del('/api/perfil/avatar')); avisarPerfil(); toast('Foto removida.') } catch (e) { toast(e.message, 'erro') } }
  return (
    <Secao titulo="Foto do perfil" contexto="Aparece no menu lateral. Envie um arquivo ou cole um link de qualquer site">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <button type="button" onClick={() => arquivo.current?.click()} onDragOver={(e) => { e.preventDefault(); setArrastando(true) }} onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); lerArquivo(e.dataTransfer.files?.[0]) }}
          className={`group relative h-28 w-28 shrink-0 overflow-hidden rounded-full border-2 border-dashed ${arrastando ? 'border-primary' : 'border-transparent'}`} aria-label="Trocar foto">
          <Avatar perfil={perfil} email={email} tamanho="h-28 w-28" texto="text-2xl" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
            {ocupado === 'arquivo' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
          </span>
        </button>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" icone={Upload} carregando={ocupado === 'arquivo'} onClick={() => arquivo.current?.click()}>Enviar imagem</Botao>
            {perfil.avatar && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={remover}>Remover</Botao>}
            <input ref={arquivo} type="file" accept="image/*" className="hidden" onChange={(e) => { lerArquivo(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (link.trim()) enviar({ url: link.trim() }, 'link') }}>
            <label className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (imagem, perfil do GitHub, LinkedIn, site…)" className="campo h-9 pl-8 text-sm" aria-label="Link da imagem" />
            </label>
            <Botao tamanho="sm" variante="secundario" type="submit" carregando={ocupado === 'link'} disabled={!link.trim()}>Importar</Botao>
          </form>
          <p className="ajuda">PNG, JPG, WEBP, GIF, BMP ou TIFF até 8 MB. Também dá para arrastar o arquivo até a foto. Se o link for uma página, usamos a imagem de pré-visualização dela. A foto é recortada em quadrado e reduzida para 256 px.</p>
        </div>
      </div>
    </Secao>
  )
}

export default function Perfil() {
  const toast = useToast()
  const { dados: perfil, setDados, erro } = useDados(() => api.get('/api/perfil'))
  const { dados: sessao } = useDados(() => api.get('/api/sessao'))
  const [f, setF] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [mail, setMail] = useState({ novo: '', senha: '' })
  const [erroMail, setErroMail] = useState('')
  const [okMail, setOkMail] = useState('')
  const [senha, setSenha] = useState({ atual: '', nova: '', confirma: '' })
  const [erroSenha, setErroSenha] = useState('')
  // verificação contra robôs para conferir a senha atual (só aparece se a Cloudflare pedir); o token vale uma vez
  const [roboMail, setRoboMail] = useState(''), [roboSenha, setRoboSenha] = useState('')
  const refMail = useRef(null), refSenha = useRef(null)
  if (erro) return <Aviso>{erro}</Aviso>
  if (!perfil || !sessao) return <Carregando />
  const form = f || { nome: perfil.nome, cargo: perfil.cargo, telefone: perfil.telefone, bio: perfil.bio }
  const mudar = (k) => (e) => setF({ ...form, [k]: e.target.value })
  const email = sessao.email || ''

  const salvar = async (e) => {
    e.preventDefault(); setSalvando(true)
    try { setDados(await api.put('/api/perfil', form)); setF(null); avisarPerfil(); toast('Perfil salvo.') } catch (err) { toast(err.message, 'erro') } finally { setSalvando(false) }
  }
  // confere a senha atual no servidor (não troca a sessão deste navegador; com CAPTCHA no Supabase, o token vai junto)
  const reautenticar = async (s, token, ref) => {
    try { await api.post('/api/conta/conferir-senha', { senha: s, turnstile: token || null }) } finally { ref.current?.reiniciar() }
  }
  const trocarEmail = async (e) => {
    e.preventDefault(); setErroMail(''); setOkMail('')
    const novo = mail.novo.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) return setErroMail('Digite um e-mail válido.')
    if (novo === email.toLowerCase()) return setErroMail('Esse já é o seu e-mail.')
    try {
      await reautenticar(mail.senha, roboMail, refMail)
      const sb = await supabase()
      const { error } = await sb.auth.updateUser({ email: novo }, { emailRedirectTo: `${window.location.origin}/configuracoes?aba=perfil` })
      if (error) throw new Error(error.message)
      setMail({ novo: '', senha: '' })
      setOkMail(`Enviamos um link de confirmação para ${novo} (e um aviso para ${email}). O e-mail só muda depois que você clicar no link.`)
    } catch (err) { setErroMail(err.message) }
  }
  const trocarSenha = async (e) => {
    e.preventDefault(); setErroSenha('')
    if (senha.nova !== senha.confirma) return setErroSenha('As senhas novas não conferem.')
    if (senha.nova.length < 10) return setErroSenha('A senha nova precisa ter pelo menos 10 caracteres.')
    try {
      await reautenticar(senha.atual, roboSenha, refSenha)
      const sb = await supabase()
      await validarSenhaNova(senha.nova)
      const { error } = await sb.auth.updateUser({ password: senha.nova })
      if (error) throw new Error(error.message)
      api.post('/api/conta/senha-trocada').catch(() => {})   // aviso de segurança por e-mail
      setSenha({ atual: '', nova: '', confirma: '' }); toast('Senha alterada.')
    } catch (err) { setErroSenha(err.message) }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Foto perfil={perfil} email={email} aoMudar={setDados} />
        <Secao titulo="Informações" contexto="Nome e dados que aparecem no sistema">
          <form onSubmit={salvar} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="rotulo" htmlFor="pn">Nome</label><input id="pn" className="campo" maxLength={80} value={form.nome} onChange={mudar('nome')} placeholder="Como você quer ser chamado" /></div>
              <div><label className="rotulo" htmlFor="pc">Cargo</label><input id="pc" className="campo" maxLength={80} value={form.cargo} onChange={mudar('cargo')} placeholder="Ex.: Gerente do escritório" /></div>
              <div><label className="rotulo" htmlFor="pt">Telefone</label><input id="pt" className="campo" maxLength={40} value={form.telefone} onChange={mudar('telefone')} placeholder="(00) 00000-0000" inputMode="tel" /></div>
              <div><label className="rotulo">E-mail de acesso</label><input className="campo" value={email} disabled /></div>
            </div>
            <div><label className="rotulo" htmlFor="pb">Sobre</label><textarea id="pb" className="campo min-h-[90px]" maxLength={500} value={form.bio} onChange={mudar('bio')} placeholder="Uma linha sobre você ou sobre o escritório" /><p className="ajuda">{form.bio.length}/500</p></div>
            <div className="flex justify-end gap-2">
              {f && <Botao type="button" variante="secundario" onClick={() => setF(null)}>Descartar</Botao>}
              <Botao type="submit" carregando={salvando} disabled={!f}>Salvar informações</Botao>
            </div>
          </form>
        </Secao>
      </div>
      <div className="space-y-6">
        <Secao titulo="E-mail de acesso" contexto={`Hoje: ${email}`}>
          <form onSubmit={trocarEmail} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="rotulo" htmlFor="me">Novo e-mail</label><input id="me" type="email" className="campo" value={mail.novo} onChange={(e) => setMail({ ...mail, novo: e.target.value })} required autoComplete="email" /></div>
              <div><label className="rotulo" htmlFor="ms">Senha atual</label><input id="ms" type="password" className="campo" value={mail.senha} onChange={(e) => setMail({ ...mail, senha: e.target.value })} required autoComplete="current-password" /></div>
            </div>
            {erroMail && <Aviso>{erroMail}</Aviso>}
            {okMail && <Aviso tipo="ok">{okMail}</Aviso>}
            <Turnstile ref={refMail} aoMudar={setRoboMail} acao="conta" />
            <div className="flex justify-end"><Botao type="submit">Trocar e-mail</Botao></div>
          </form>
        </Secao>
        <Secao titulo="Senha" contexto="Pedimos a senha atual antes de trocar">
          <form onSubmit={trocarSenha} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><label className="rotulo" htmlFor="sa">Atual</label><input id="sa" type="password" autoComplete="current-password" className="campo" value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} required /></div>
              <div><label className="rotulo" htmlFor="sn">Nova</label><input id="sn" type="password" autoComplete="new-password" className="campo" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} required minLength={10} /></div>
              <div><label className="rotulo" htmlFor="sc">Confirmar</label><input id="sc" type="password" autoComplete="new-password" className="campo" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} required /></div>
            </div>
            {senha.nova && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full transition-all ${senha.nova.length >= 14 ? 'w-full bg-emerald-500' : senha.nova.length >= 10 ? 'w-2/3 bg-amber-500' : 'w-1/3 bg-red-500'}`} /></div>}
            {erroSenha && <Aviso>{erroSenha}</Aviso>}
            <Turnstile ref={refSenha} aoMudar={setRoboSenha} acao="conta" />
            <div className="flex justify-end"><Botao type="submit">Alterar senha</Botao></div>
          </form>
        </Secao>
      </div>
    </div>
  )
}
