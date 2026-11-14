import { useEffect, useRef, useState } from 'react'
import { Download, LogOut } from 'lucide-react'
import { api } from '../api'
import { supabase } from '../supabase'
import { Aviso, Botao, Cabecalho, Carregando, Ponto, useDados, useToast } from '../components/ui'

const MODOS_ENVIO = [
  ['auto', 'Automático', 'Rede local primeiro; se o transmissor não responder, usa a nuvem Tuya.'],
  ['local', 'Só rede local', 'Nada passa pela internet. Só funciona com o transmissor na mesma rede.'],
  ['nuvem', 'Só nuvem', 'Sempre pela nuvem Tuya. Útil se este computador estiver em outra rede.'],
]

function ContaSmartLife({ conta, aoMudar }) {
  const [codigo, setCodigo] = useState('')
  const [qr, setQr] = useState(null)
  const [erro, setErro] = useState('')
  const timer = useRef(null)
  const toast = useToast()
  useEffect(() => () => clearInterval(timer.current), [])

  const gerar = async (e) => {
    e.preventDefault()
    setErro('')
    try {
      const r = await api.post('/api/tuya/qr', { user_code: codigo })
      setQr(r.imagem)
      const inicio = Date.now()
      timer.current = setInterval(async () => {
        if (Date.now() - inicio > 180000) { clearInterval(timer.current); setQr(null); setErro('Tempo esgotado. Gere outro QR Code.'); return }
        try {
          const s = await api.get('/api/tuya/qr')
          if (s.estado === 'conectado') { clearInterval(timer.current); setQr(null); toast('Conta Smart Life conectada.'); aoMudar() }
        } catch { /* tenta de novo no próximo ciclo */ }
      }, 2500)
    } catch (e) { setErro(e.message) }
  }

  if (conta.conectada) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm"><Ponto ativo /> Conectada{conta.usuario ? ` como ${conta.usuario}` : ''} (código {conta.user_code})</p>
        <Botao variante="secundario" tamanho="sm" icone={LogOut} onClick={async () => { await api.del('/api/tuya'); aoMudar() }}>Desconectar</Botao>
      </div>
    )
  }
  if (qr) {
    return (
      <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
        <img src={qr} alt="QR Code de login Smart Life" className="h-44 w-44 rounded border border-border bg-card p-1" />
        <div className="text-sm">
          <p className="font-medium">Escaneie com o app Smart Life</p>
          <p className="mt-1 text-muted-foreground">Toque no ícone de leitor no canto superior direito, escaneie e confirme. Esta tela atualiza sozinha.</p>
        </div>
      </div>
    )
  }
  return (
    <form onSubmit={gerar} className="space-y-3">
      <div>
        <label className="rotulo" htmlFor="uc">Código do usuário</label>
        <div className="flex gap-2">
          <input id="uc" className="campo max-w-xs" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: Bah8ZRv" required />
          <Botao type="submit">Gerar QR Code</Botao>
        </div>
        <p className="ajuda">No Smart Life: Eu → engrenagem → Conta e segurança → Código do usuário.</p>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
    </form>
  )
}

export default function Configuracoes() {
  const { dados, erro, recarregar, setDados } = useDados(() => api.get('/api/config'))
  const [senha, setSenha] = useState({ atual: '', nova: '', confirma: '' })
  const [erroSenha, setErroSenha] = useState('')
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />

  const salvar = async (mudanca) => {
    try {
      setDados(await api.put('/api/config', { modo_envio: dados.modo_envio, nome_casa: dados.nome_casa, ...mudanca }))
      toast('Configuração salva.')
    } catch (e) { toast(e.message, 'erro') }
  }
  const trocarSenha = async (e) => {
    e.preventDefault()
    setErroSenha('')
    if (senha.nova !== senha.confirma) return setErroSenha('As senhas novas não conferem.')
    if (senha.nova.length < 8) return setErroSenha('A senha nova precisa ter pelo menos 8 caracteres.')
    try {
      const sb = await supabase()
      const { email } = await api.get('/api/sessao')
      const { error: errLogin } = await sb.auth.signInWithPassword({ email, password: senha.atual })
      if (errLogin) throw new Error('Senha atual incorreta.')
      const { error } = await sb.auth.updateUser({ password: senha.nova })
      if (error) throw new Error(error.message)
      setSenha({ atual: '', nova: '', confirma: '' })
      toast('Senha alterada no Supabase.')
    } catch (e) { setErroSenha(e.message) }
  }
  const baixarBackup = async () => {
    const dadosBackup = await api.get('/api/backup')
    const blob = new Blob([JSON.stringify(dadosBackup, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clima-casa-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <Cabecalho titulo="Configurações" />
      <div className="max-w-3xl space-y-6">
        <section className="cartao p-5">
          <h2 className="text-sm font-semibold">Conta Smart Life</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Traz a Local Key dos transmissores e permite enviar comandos pela nuvem quando você está fora de casa.</p>
          <ContaSmartLife conta={dados.tuya} aoMudar={recarregar} />
        </section>

        <section className="cartao p-5">
          <h2 className="mb-4 text-sm font-semibold">Como os comandos são enviados</h2>
          <div className="space-y-2">
            {MODOS_ENVIO.map(([k, r, d]) => (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${dados.modo_envio === k ? 'border-marca-600 bg-marca-50/60 dark:bg-marca-700/10' : 'border-border'}`}>
                <input type="radio" name="envio" className="mt-1 accent-marca-600" checked={dados.modo_envio === k} onChange={() => salvar({ modo_envio: k })} />
                <span><span className="block text-sm font-medium">{r}</span><span className="text-xs text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </div>
        </section>

        <form onSubmit={trocarSenha} className="cartao space-y-4 p-5">
          <h2 className="text-sm font-semibold">Senha do administrador (Supabase Auth)</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="rotulo" htmlFor="sa">Atual</label><input id="sa" type="password" autoComplete="current-password" className="campo" value={senha.atual} onChange={(e) => setSenha({ ...senha, atual: e.target.value })} required /></div>
            <div><label className="rotulo" htmlFor="sn">Nova</label><input id="sn" type="password" autoComplete="new-password" className="campo" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} required minLength={8} /></div>
            <div><label className="rotulo" htmlFor="sc">Confirmar</label><input id="sc" type="password" autoComplete="new-password" className="campo" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} required /></div>
          </div>
          {erroSenha && <Aviso>{erroSenha}</Aviso>}
          <div className="flex justify-end"><Botao type="submit">Alterar senha</Botao></div>
        </form>

        <section className="cartao flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Backup</h2>
            <p className="text-sm text-muted-foreground">Exporta agora aparelhos, botões gravados e agendamentos em JSON. Os backups diários automáticos ficam na tela Supabase.</p>
          </div>
          <Botao variante="secundario" icone={Download} onClick={baixarBackup}>Baixar backup</Botao>
        </section>
      </div>
    </>
  )
}
