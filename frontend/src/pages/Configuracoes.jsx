import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { usePreferencias } from '../preferencias'
import { motion } from 'framer-motion'
import { Cookie, KeyRound, Laptop, LogOut, Moon, Paintbrush, Palette, Server, ShieldCheck, Sliders, Sun, UserRound, Users } from 'lucide-react'
import { useTema } from '../tema'
import WhiteLabel from '../components/config/WhiteLabel'
import ConfigCursor from '../components/config/ConfigCursor'
import Perfil from '../components/config/Perfil'
import Geral from '../components/config/Geral'
import Usuarios from '../components/config/Usuarios'
import SegurancaConta from '../components/config/SegurancaConta'
import { useProjeto } from '../contexto'
import PainelSeguranca from '../components/config/PainelSeguranca'
import CookiesSite from '../components/config/CookiesSite'
import { api } from '../api'
import { supabase } from '../supabase'
import { Aviso, Botao, Cabecalho, Carregando, Interruptor, Ponto, Secao, useDados, useToast } from '../components/ui'

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
        <p className="flex min-w-0 items-center gap-2 text-sm"><Ponto ativo /><span className="min-w-0 break-all">Conectada{conta.usuario ? ` como ${conta.usuario}` : ''}{conta.user_code ? ` (código ${conta.user_code})` : ''}</span></p>
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
        <h2 className="titulo-secao">Agente do escritório</h2>
        {info && <span className="flex items-center gap-2 text-sm"><Ponto ativo={info.online} /> {info.online ? 'online' : 'offline'}</span>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Programa que roda num computador da rede do escritório (Mac, PC com Windows, Linux ou Raspberry Pi): recebe os comandos pela fila do Supabase, dispara o infravermelho, conecta a Alexa (Sinric Pro), roda a agenda e as automações. Quem está no comando e a saúde de cada computador ficam em Infra → Agentes.</p>
      <div className="mt-4 space-y-2 rounded-lg bg-muted/60 p-3 font-mono text-xs">
        <p><span className="text-muted-foreground"># Mac: instalar ou atualizar, ver se está rodando</span><br />./instalar-servico.sh · ./instalar-servico.sh status</p>
        <p><span className="text-muted-foreground"># Linux e Raspberry Pi: ver se está rodando e o log</span><br />systemctl status clima-escritorio-agente · journalctl -u clima-escritorio-agente -f</p>
        <p><span className="text-muted-foreground"># Windows (PowerShell como administrador)</span><br />powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 status</p>
      </div>
      <a href="/infra?aba=agentes" className="mt-3 inline-block text-sm text-primary hover:underline">Abrir Infra → Agentes</a>
    </section>
  )
}

export default function Configuracoes() {
  const [params, setParams] = useSearchParams()
  const estadoNav = useLocation().state
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

  const pode = (perm) => !perm || sessao?.permissoes?.includes(perm)
  // [chave, nome, ícone, permissão, grupo, o que tem lá]
  const ABAS = [
    ['perfil', 'Perfil', UserRound, null, 'Você', 'Nome, foto, e-mail e senha'],
    ['seguranca', 'Segurança', ShieldCheck, null, 'Você', 'Duas etapas, biometria, sessões e firewall'],
    ['usuarios', 'Usuários', Users, 'usuarios.gerenciar', 'Equipe', 'Contas, permissões e uso do sistema'],
    ['geral', 'Geral', Sliders, 'configuracoes.gerenciar', 'Sistema', 'Regras do escritório, temperatura, expediente, feriados e envio'],
    ['marca', 'Aparência e marca', Paintbrush, null, 'Você', 'Tema, cursor, logo, favicon, cores e fontes'],
    ['contas', 'Contas', KeyRound, 'integracoes.gerenciar', 'Sistema', 'Smart Life e contas ligadas'],
    ['cookies', 'Cookies do site', Cookie, 'configuracoes.gerenciar', 'Sistema', 'Aviso e consentimentos do site'],
    ['sistema', 'Sistema', Server, 'configuracoes.gerenciar', 'Sistema', 'Agente e endereços do sistema'],
  ].filter((a) => pode(a[3]))
  const pedida = params.get('aba') === 'aparencia' ? 'marca' : params.get('aba')   // a antiga aba Aparência virou parte desta
  const aba = ABAS.some((a) => a[0] === pedida) ? pedida : (pode('configuracoes.gerenciar') ? 'geral' : 'perfil')
  const atual = ABAS.find((a) => a[0] === aba)
  const grupos = [...new Set(ABAS.map((a) => a[4]))]
  return (
    <div className="w-full min-w-0">
      <Cabecalho titulo="Configurações" descricao="Perfil, usuários e permissões, segurança da conta, aparência e o sistema." />
      {/* celular e tablet: abas que rolam de lado */}
      <div className="sem-barra -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 lg:hidden" role="tablist" aria-label="Áreas das configurações">
        {ABAS.map(([k, r, I]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setParams({ aba: k })}
            className={`relative -mb-px flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <I className="h-4 w-4" />{r}
            {aba === k && <motion.span layoutId="aba-config-m" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {/* computador: navegação lateral por grupo, com o que tem em cada área */}
        <nav className="hidden lg:block" aria-label="Áreas das configurações">
          <div className="sticky top-20 space-y-5">
            {grupos.map((g) => (
              <div key={g}>
                <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{g}</p>
                <ul className="space-y-0.5">
                  {ABAS.filter((a) => a[4] === g).map(([k, r, I, , , d]) => (
                    <li key={k}>
                      <button onClick={() => setParams({ aba: k })} aria-current={aba === k ? 'page' : undefined}
                        className={`group relative flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
                        {aba === k && <motion.span layoutId="aba-config" className="absolute inset-0 rounded-lg bg-muted" transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />}
                        {aba === k && <motion.span layoutId="aba-config-barra" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />}
                        <I className="relative mt-0.5 h-4 w-4 shrink-0" />
                        <span className="relative min-w-0"><span className="block text-sm font-medium">{r}</span><span className="block truncate text-[11px] leading-snug text-muted-foreground">{d}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
        <div className="min-w-0">
          <div className="mb-5 hidden border-b border-border pb-4 lg:block">
            <h2 className="text-lg font-semibold tracking-tight">{atual?.[1]}</h2><p className="text-sm text-muted-foreground">{atual?.[5]}</p>
          </div>
      <motion.div key={aba} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
      {aba === 'geral' && <Geral dados={dados} salvar={salvar} sessao={sessao} />}
      {aba === 'perfil' && <Perfil />}
      {aba === 'marca' && (
        <div className="space-y-10">
          <section>
            <h3 className="mb-1 text-base font-semibold">Só para você</h3>
            <p className="mb-4 text-sm text-muted-foreground">Tema, cursor e atalhos ficam salvos neste navegador e valem só para você.</p>
            <Aparencia />
          </section>
          {pode('configuracoes.gerenciar') ? (
            <section className="border-t border-border pt-8">
              <h3 className="mb-1 text-base font-semibold">Marca do sistema (white label)</h3>
              <p className="mb-4 text-sm text-muted-foreground">Logo do menu, ícone da aba, cores, fontes e manutenção: vale para todos que usam o sistema.</p>
              <WhiteLabel />
            </section>
          ) : <p className="border-t border-border pt-6 text-sm text-muted-foreground">A marca do sistema (logo, ícone da aba e cores) é configurada pelo dono ou por um administrador.</p>}
        </div>
      )}
      {aba === 'usuarios' && <Usuarios />}
      {aba === 'cookies' && <CookiesSite />}
      {aba === 'seguranca' && (
        <div className="space-y-8">
          {estadoNav?.exige2fa && <Aviso tipo="alerta">A política de segurança exige verificação em duas etapas para administradores. Cadastre o Google Authenticator ou a biometria abaixo para liberar o resto do sistema.</Aviso>}
          <SegurancaConta />
          {pode('seguranca.gerenciar') && <div><h2 className="mb-3 text-lg font-semibold">Firewall do sistema</h2><PainelSeguranca /></div>}
        </div>
      )}
      {aba === 'contas' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section id="smartlife" className="cartao min-w-0 p-5">
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
      </div>
    </div>
  )
}

function MouseETeclado() {
  const [p, setP] = usePreferencias()
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
      <Secao titulo="Mouse e cursor" contexto="Efeito que segue o mouse, modelo do ponteiro e cursores enviados (vale só neste navegador)">
        <ConfigCursor />
      </Secao>
      <Secao titulo="Teclado" contexto="Atalhos para usar o sistema sem o mouse">
        <label className="flex items-center justify-between gap-4 text-sm"><span><span className="font-medium">Atalhos de teclado</span><span className="block text-xs text-muted-foreground">"?" mostra a lista; "g" e uma letra abre uma tela (g p painel, g m mapa, g r relatórios…). O ⌘K continua sempre ligado.</span></span>
          <Interruptor ligado={p.atalhos} onChange={(v) => setP({ atalhos: v })} rotulo="Atalhos de teclado" /></label>
        <Botao variante="secundario" className="mt-4" onClick={() => window.dispatchEvent(new Event('clima:atalhos'))}>Ver todos os atalhos</Botao>
      </Secao>
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
      <MouseETeclado />
      <p className="text-sm text-muted-foreground">Agora: tema {escuro ? 'escuro' : 'claro'}. A escolha fica salva neste navegador; também dá para trocar pelo botão no topo da tela. A cor da marca, a fonte e o tamanho do texto ficam logo abaixo, em Marca do sistema.</p>
    </div>
  )
}
