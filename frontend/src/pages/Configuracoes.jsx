import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, KeyRound, Laptop, LogOut, Moon, Paintbrush, Palette, Server, ShieldCheck, Sliders, Sun, UserRound, Users } from 'lucide-react'
import { useTema } from '../tema'
import WhiteLabel from '../components/config/WhiteLabel'
import Perfil from '../components/config/Perfil'
import Usuarios from '../components/config/Usuarios'
import SegurancaConta from '../components/config/SegurancaConta'
import { useProjeto } from '../contexto'
import PainelSeguranca from '../components/config/PainelSeguranca'
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

function Agente() {
  const [info, setInfo] = useState(null)
  useEffect(() => { api.get('/api/painel').then((d) => setInfo(d.agente)).catch(() => {}) }, [])
  return (
    <section id="agente" className="cartao scroll-mt-24 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="titulo-secao">Agente do Mac</h2>
        {info && <span className="flex items-center gap-2 text-sm"><Ponto ativo={info.online} /> {info.online ? 'online' : 'offline'}</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Programa que roda no Mac da casa: recebe os comandos pela fila do Supabase, dispara o infravermelho, conecta a Alexa (Sinric Pro), roda a agenda e as automações.</p>
      <div className="mt-4 space-y-2 rounded-lg bg-muted/60 p-3 font-mono text-xs">
        <p><span className="text-muted-foreground"># instalar ou atualizar</span><br />./instalar-servico.sh</p>
        <p><span className="text-muted-foreground"># ver se está rodando</span><br />./instalar-servico.sh status</p>
        <p><span className="text-muted-foreground"># log</span><br />tail -f ~/Library/Logs/ClimaCasa.log</p>
      </div>
    </section>
  )
}

export default function Configuracoes() {
  const [params, setParams] = useSearchParams()
  const { sessao } = useProjeto()
  const { dados, erro, recarregar, setDados } = useDados(() => api.get('/api/config'))
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />

  const salvar = async (mudanca) => {
    try {
      setDados(await api.put('/api/config', { modo_envio: dados.modo_envio, nome_casa: dados.nome_casa, ...mudanca }))
      toast('Configuração salva.')
    } catch (e) { toast(e.message, 'erro') }
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

  const pode = (perm) => !perm || sessao?.permissoes?.includes(perm)
  const ABAS = [['perfil', 'Perfil', UserRound], ['usuarios', 'Usuários', Users, 'usuarios.gerenciar'], ['seguranca', 'Segurança', ShieldCheck],
    ['geral', 'Geral', Sliders, 'configuracoes.gerenciar'], ['aparencia', 'Aparência', Palette], ['marca', 'White label', Paintbrush, 'configuracoes.gerenciar'],
    ['contas', 'Contas', KeyRound, 'integracoes.gerenciar'], ['sistema', 'Sistema', Server, 'configuracoes.gerenciar']].filter((a) => pode(a[3]))
  const pedida = params.get('aba')
  const aba = ABAS.some((a) => a[0] === pedida) ? pedida : (pode('configuracoes.gerenciar') ? 'geral' : 'perfil')
  return (
    <div className="w-full">
      <Cabecalho titulo="Configurações" descricao="Perfil, usuários e permissões, segurança da conta, aparência e o sistema." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map(([k, r, I]) => (
          <button key={k} onClick={() => setParams({ aba: k })}
            className={`relative -mb-px flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <I className="h-4 w-4" />{r}
            {aba === k && <motion.span layoutId="aba-config" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      <motion.div key={aba} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {aba === 'geral' && (
        <div className="grid gap-6 xl:grid-cols-2">
        <section id="envio" className="cartao p-5">
          <h2 className="mb-4 text-sm font-semibold">Como os comandos são enviados</h2>
          <div className="space-y-2">
            {MODOS_ENVIO.map(([k, r, d]) => (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${dados.modo_envio === k ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="envio" className="mt-1 accent-[hsl(var(--primary))]" checked={dados.modo_envio === k} onChange={() => salvar({ modo_envio: k })} />
                <span><span className="block text-sm font-medium">{r}</span><span className="text-xs text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </div>
        </section>
        <section className="cartao flex flex-col justify-between gap-3 p-5">
          <div>
            <h2 className="text-sm font-semibold">Backup agora</h2>
            <p className="text-sm text-muted-foreground">Exporta aparelhos, botões gravados e agendamentos em JSON. Os backups diários automáticos ficam na tela Supabase.</p>
          </div>
          <Botao variante="secundario" icone={Download} onClick={baixarBackup} className="self-start">Baixar backup</Botao>
        </section>
        </div>
      )}
      {aba === 'perfil' && <Perfil />}
      {aba === 'aparencia' && <Aparencia />}
      {aba === 'marca' && <WhiteLabel />}
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'seguranca' && (
        <div className="space-y-8">
          <SegurancaConta />
          {pode('seguranca.gerenciar') && <div><h2 className="mb-3 text-lg font-semibold">Firewall do sistema</h2><PainelSeguranca /></div>}
        </div>
      )}
      {aba === 'contas' && (
        <div className="grid gap-6 xl:grid-cols-2">
        <section id="smartlife" className="cartao p-5">
          <h2 className="text-sm font-semibold">Conta Smart Life</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">Traz a Local Key dos transmissores e permite enviar comandos pela nuvem quando você está fora.</p>
          <ContaSmartLife conta={dados.tuya} aoMudar={recarregar} />
        </section>
        <section className="cartao p-5"><h2 className="text-sm font-semibold">Senha e e-mail</h2><p className="mt-1 text-sm text-muted-foreground">Agora ficam na aba Perfil, junto com a foto e o nome.</p><a href="?aba=perfil" className="mt-3 inline-block text-sm text-primary hover:underline">Abrir Perfil</a></section>
        </div>
      )}
      {aba === 'sistema' && (
        <div className="grid gap-6 xl:grid-cols-2">
        <Agente />
        <section id="sobre" className="cartao p-5">
          <h2 className="titulo-secao">Sobre o sistema</h2>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[['Painel', 'app.zynio.com.br', 'https://app.zynio.com.br'], ['Código', 'github.com/estevam5s/clima-casa', 'https://github.com/estevam5s/clima-casa'],
              ['Banco e login', 'Supabase · projeto Arcondicionado', 'https://supabase.com/dashboard/project/elyqjdcsbfdvlsxomxen'], ['App celular', 'expo.dev · clima-casa', 'https://expo.dev/accounts/estevam5s/projects/clima-casa'],
              ['Alexa e Google', 'portal.sinric.pro', 'https://portal.sinric.pro'], ['Downloads', 'Baixar apps', '/apps']].map(([r, t, u]) => (
              <div key={r}><dt className="text-xs text-muted-foreground">{r}</dt><dd><a href={u} target={u.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-primary hover:underline">{t}</a></dd></div>
            ))}
          </dl>
        </section>
        </div>
      )}
      </motion.div>
    </div>
  )
}

function Aparencia() {
  const { escolha, setEscolha, escuro } = useTema()
  const opcoes = [['claro', 'Claro', Sun, 'Fundo claro, ideal para ambientes iluminados.'], ['escuro', 'Escuro', Moon, 'Menos brilho, confortável à noite.'],
    ['sistema', 'Seguir o sistema', Laptop, 'Acompanha o modo claro/escuro do aparelho.']]
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {opcoes.map(([k, r, I, d]) => (
          <button key={k} onClick={() => setEscolha(k)} className={`cartao overflow-hidden text-left transition-colors ${escolha === k ? 'border-primary ring-2 ring-primary/30' : 'hover:border-muted-foreground/40'}`}>
            <div className={`flex h-28 gap-2 p-3 ${k === 'escuro' ? 'bg-[#0e0e10]' : k === 'claro' ? 'bg-[#f6f6f7]' : 'bg-gradient-to-r from-[#f6f6f7] from-50% to-[#0e0e10] to-50%'}`}> {/* marca: miniatura fixa do tema claro/escuro, não segue o tema atual */}
              <span className={`w-10 rounded ${k === 'escuro' ? 'bg-[#17171a]' : 'bg-white'}`} /> {/* marca: miniatura fixa do tema claro/escuro, não segue o tema atual */}
              <span className="flex flex-1 flex-col gap-2"><span className={`h-4 rounded ${k === 'escuro' ? 'bg-[#17171a]' : 'bg-white'}`} /><span className="h-10 rounded bg-primary/70" /></span> {/* marca: miniatura fixa do tema claro/escuro, não segue o tema atual */}
            </div>
            <div className="flex items-start gap-3 p-4">
              <I className="mt-0.5 h-4 w-4" />
              <div><p className="text-sm font-medium">{r}{escolha === k && ' ·  em uso'}</p><p className="text-xs text-muted-foreground">{d}</p></div>
            </div>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">Agora: tema {escuro ? 'escuro' : 'claro'}. A escolha fica salva neste navegador; também dá para trocar pelo botão no topo da tela. A cor da marca, a fonte e o tamanho do texto ficam na aba White label.</p>
    </div>
  )
}
