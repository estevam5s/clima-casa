import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Copy, Download, ExternalLink, MonitorSmartphone, QrCode, ShieldCheck } from 'lucide-react'
import { DOWNLOADS, RELEASE, REPO, sistemaDetalhado } from '../apps'
import { api } from '../api'
import IconeMarca from '../components/IconeMarca'
import { Botao, Cabecalho, Secao, useToast } from '../components/ui'
import Repositorio from '../components/apps/Repositorio'
import { useProjeto } from '../contexto'

const mb = (b) => (b ? `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} MB` : '')
const COR = { android: 'bg-[#3DDC84]/15 text-[#1f9d55] dark:text-[#3DDC84]', ios: 'bg-foreground/10 text-foreground', mac: 'bg-foreground/10 text-foreground', windows: 'bg-[#0078D4]/15 text-[#0078D4]',
  linux: 'bg-[#FCC624]/20 text-foreground', pwa: 'bg-[#5A0FC8]/15 text-[#5A0FC8] dark:text-[#a98bff]' }
const RECURSOS = [
  ['Controle dos ares, cenas e agenda', [1, 1, 1, 1, 1]],
  ['Notificações do sistema', [1, 1, 1, 1, 1]],
  ['Fica na barra de menus / bandeja', [0, 1, 1, 1, 0]],
  ['Inicia junto com o computador', [0, 1, 1, 1, 0]],
  ['Atalhos de teclado (⌘1 a ⌘4)', [0, 1, 1, 1, 1]],
  ['Tela própria quando está sem internet', [1, 1, 1, 1, 1]],
  ['Google Authenticator (2 etapas)', [1, 1, 1, 1, 1]],
  ['Entrar com Google', [0, 1, 1, 1, 1]],
  ['Biometria (Face ID, digital, Windows Hello)', [0, 0, 0, 0, 1]],
  ['Mapa do escritório em 3D', [0, 1, 1, 1, 1]],
  ['Atualiza sozinho', [0, 0, 0, 0, 1]],
]
// apps de computador abrem o próprio sistema web: as telas novas chegam na hora; só o "casco" do app muda por versão
const REQUISITOS = [
  ['Android', 'Android 7.0 ou mais novo', '120 MB', 'Internet (Wi-Fi ou dados)'],
  ['iPhone e iPad', 'iOS 17 ou mais novo; instalar com xtool, AltStore ou Sideloadly', '15 MB', 'Internet e um Apple ID'],
  ['macOS', 'macOS 12 Monterey ou mais novo', '300 MB', 'Internet'],
  ['Windows', 'Windows 10 ou 11 (64 bits)', '400 MB', 'Internet'],
  ['Linux', 'Ubuntu 20.04+, Fedora 36+ ou Raspberry Pi OS 64 bits; libfuse2', '300 MB', 'Internet'],
  ['Web/PWA', 'Chrome, Edge, Brave, Firefox ou Safari atualizados', 'Nenhum', 'Internet'],
]
const PROBLEMAS = [
  ['macOS diz que o app "está danificado" ou "não pode ser aberto"', 'O app não é assinado pela Apple. Clique com o botão direito no app → Abrir → Abrir. Se ainda bloquear, rode no Terminal: xattr -dr com.apple.quarantine "/Applications/Clima Casa.app"'],
  ['Windows mostra "O Windows protegeu o computador"', 'É o SmartScreen avisando que o instalador é novo. Clique em "Mais informações" e depois em "Executar assim mesmo".'],
  ['Android não deixa instalar o APK', 'Ao abrir o arquivo, o Android pede para permitir apps "desta fonte" (o navegador ou o gerenciador de arquivos). Permita só para essa instalação.'],
  ['iPhone: "Desenvolvedor não confiável" ao abrir', 'Em Ajustes → Geral → VPN e Gerenciamento de Dispositivos, toque no seu Apple ID e em Confiar. No iOS 16+, ligue também o Modo de Desenvolvedor (Ajustes → Privacidade e Segurança).'],
  ['iPhone: o app parou de abrir depois de uma semana', 'Com Apple ID grátis a Apple limita a 7 dias. Instale de novo pelo xtool ou deixe o AltStore renovar sozinho.'],
  ['Linux: o AppImage não abre', 'Dê permissão de execução (chmod +x) e instale o libfuse2 (Ubuntu: sudo apt install libfuse2).'],
  ['O app pede um código depois da senha', 'Sua conta tem o Google Authenticator ligado. Abra o app autenticador e digite os 6 dígitos: a versão 1.1 envia sozinha ao completar.'],
  ['O app abre numa tela "Sem conexão"', 'Os apps precisam de internet para falar com o servidor. Quando a conexão voltar, toque em Tentar de novo.'],
]

// Notas do release (markdown do GitHub) mostradas sem o "código": tira HTML, selos, sumário e as seções técnicas;
// mantém resumo, destaques (tabela vira lista), instalação e como atualizar. Links e **negrito** viram texto formatado.
const SECOES_FORA = /^(sumário|downloads|commits|estatísticas|links|verificar o download|requisitos)/i
function inline(texto, k) {
  const partes = []
  const rx = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let ult = 0, m, i = 0
  while ((m = rx.exec(texto))) {
    if (m.index > ult) partes.push(texto.slice(ult, m.index))
    if (m[1]) partes.push(<b key={`${k}b${i++}`} className="font-medium text-foreground">{m[1]}</b>)
    else if (m[2]) partes.push(<code key={`${k}c${i++}`} className="rounded bg-muted px-1 font-mono text-[12px]">{m[2]}</code>)
    else partes.push(/^https?:\/\//.test(m[4]) ? <a key={`${k}a${i++}`} href={m[4]} target="_blank" rel="noreferrer" className="text-primary underline-offset-2 hover:underline">{m[3].replace(/`/g, '')}</a> : m[3])
    ult = rx.lastIndex
  }
  if (ult < texto.length) partes.push(texto.slice(ult))
  return partes
}
function NovidadesVersao({ notas }) {
  const blocos = []
  let fora = false, cab = null
  for (const bruta of (notas || '').split('\n')) {
    const l = bruta.trim()
    if (/^#{2,3}\s/.test(l)) {
      const t = l.replace(/^#+\s*/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
      fora = SECOES_FORA.test(t)
      if (!fora) blocos.push({ tipo: 'titulo', t })
      cab = null; continue
    }
    if (fora || !l || /^<|^---$|^#\s|!\[/.test(l)) continue
    if (/^\|/.test(l)) {
      const cel = l.split('|').slice(1, -1).map((c) => c.trim())
      if (cel.every((c) => /^:?-+:?$/.test(c))) continue
      if (!cab) { cab = cel; continue }
      blocos.push({ tipo: 'linha', t: `**${cel[0]}**: ${cel.slice(1).join(' · ')}` }); continue
    }
    cab = null
    blocos.push({ tipo: /^[-*]\s|^\d+\.\s/.test(l) ? 'linha' : 'texto', t: l.replace(/^[-*]\s|^\d+\.\s/, '') })
  }
  return (
    <div className="max-h-[26rem] overflow-y-auto overscroll-contain pr-1 text-sm" tabIndex={0} aria-label="Novidades da versão">
      {blocos.map((b, i) => b.tipo === 'titulo'
        ? <p key={i} className="pb-1 pt-3 font-medium first:pt-0">{b.t}</p>
        : b.tipo === 'linha'
          ? <p key={i} className="flex gap-2 py-0.5 text-muted-foreground"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" /><span>{inline(b.t, i)}</span></p>
          : <p key={i} className="py-0.5 text-muted-foreground">{inline(b.t, i)}</p>)}
    </div>
  )
}

function Problema({ p, r }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="border-b border-border last:border-0">
      <button onClick={() => setAberto((a) => !a)} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium" aria-expanded={aberto}>
        {p}<motion.span animate={{ rotate: aberto ? 180 : 0 }}><ChevronDown className="h-4 w-4 text-muted-foreground" /></motion.span>
      </button>
      <AnimatePresence initial={false}>{aberto && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pb-3 text-sm text-muted-foreground">{r}</motion.p>}</AnimatePresence>
    </div>
  )
}

const compararVersao = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0) }
  return 0
}
const COLUNAS = [['android', 'Android'], ['mac', 'macOS'], ['windows', 'Windows'], ['linux', 'Linux'], ['pwa', 'Web/PWA']]
const VERIFICAR = { mac: 'shasum -a 256 ~/Downloads/', linux: 'sha256sum ~/Downloads/', windows: 'certutil -hashfile %USERPROFILE%\\Downloads\\', android: 'sha256sum ', extensao: 'sha256sum ~/Downloads/' }

function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard?.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={rotulo}>
      {ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}{ok ? 'Copiado' : rotulo}
    </button>
  )
}

// baixa pelo servidor: com o token só de leitura configurado pelo dono, funciona para quem não tem acesso ao repositório
// privado no GitHub; sem token, cai no link do GitHub (só abre para quem tem acesso)
export async function baixarApp(d, toast) {
  try {
    const r = await api.get(`/api/apps/baixar/${encodeURIComponent(d.arquivo)}`)
    if (r.aviso && toast) toast(r.aviso)
    window.location.href = r.url
  } catch (e) { toast?.(e.message, 'erro') }
}

function BotaoBaixar({ d, rotulo = 'Baixar', grande = false }) {
  const toast = useToast()
  const [indo, setIndo] = useState(false)
  const ir = async () => { setIndo(true); await baixarApp(d, toast); setTimeout(() => setIndo(false), 1500) }
  return grande ? <Botao icone={Download} carregando={indo} onClick={ir}>{rotulo}</Botao>
    : <button onClick={ir} disabled={indo} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"><Download className="h-4 w-4" />{indo ? 'Gerando link…' : rotulo}</button>
}

function TokenDownloads() {
  const toast = useToast()
  const [estado, setEstado] = useState(null)
  const [token, setToken] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { api.get('/api/apps/github').then(setEstado).catch(() => {}) }, [])
  const salvar = async (t) => { setSalvando(true); try { setEstado(await api.put('/api/apps/github', { token: t })); setToken(''); toast(t ? 'Token conferido e salvo (cifrado). Os downloads já usam ele.' : 'Token removido.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) } }
  if (!estado) return null
  return (
    <section className="cartao mt-6 p-5">
      <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Downloads para quem não tem acesso ao GitHub (dono)</h2>
      <p className="mt-1 text-sm text-muted-foreground">O repositório é privado. Com um token <b>só de leitura</b>, o servidor pede o arquivo ao GitHub e entrega um link temporário: qualquer pessoa logada no painel baixa, sem conta no GitHub. O token fica cifrado e nunca vai ao navegador.</p>
      <p className="mt-2 text-sm">{estado.configurado ? <>Configurado {estado.mascara && <code className="text-xs">{estado.mascara}</code>}: downloads funcionando para todos.</> : 'Não configurado: hoje só baixa quem tem acesso ao repositório no GitHub.'}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Abra <a className="font-medium text-primary hover:underline" href={`https://github.com/settings/personal-access-tokens/new?name=${encodeURIComponent('Clima Escritorio - downloads')}&description=${encodeURIComponent('So leitura: links temporarios dos instaladores em app.zynio.com.br/apps')}&target_name=${estado.repo.split('/')[0]}&expires_in=none&contents=read`} target="_blank" rel="noreferrer">o GitHub com o token já preenchido</a> (nome, dono e Contents: Read-only).</li>
        <li>Repository access: <b>Only select repositories</b> → <code>{estado.repo}</code>.</li>
        <li>Confira que só <b>Contents: Read-only</b> está marcado (o GitHub soma Metadata: Read-only sozinho). <b>Generate token</b>, copie e cole abaixo.</li>
      </ol>
      <form onSubmit={(e) => { e.preventDefault(); salvar(token.trim()) }} className="mt-3 flex flex-wrap gap-2">
        <input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_…" aria-label="Token do GitHub (só leitura)" className="campo h-9 min-w-0 flex-1 font-mono" />
        <Botao type="submit" tamanho="sm" carregando={salvando} disabled={token.trim().length < 20}>Conferir e salvar</Botao>
        {estado.configurado && <Botao type="button" tamanho="sm" variante="secundario" onClick={() => salvar('')}>Remover</Botao>}
      </form>
      <p className="mt-2 text-xs text-muted-foreground">O sistema recusa tokens que podem escrever no repositório. Sem o token, o download passa por um agente atualizado que tenha o GitHub logado (hoje, o Mac).</p>
    </section>
  )
}

function CartaoApp({ d, meu, i }) {
  const [aberto, setAberto] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
      className={`cartao flex flex-col ${meu === d.id ? 'border-primary ring-1 ring-primary/30' : ''}`}>
      <div className="flex items-start gap-4 p-5">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${COR[d.plataforma]}`}><IconeMarca nome={d.plataforma} cor className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">{d.nome}{meu === d.id && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">Este aparelho</span>}</p>
          <p className="text-sm text-muted-foreground">{d.detalhe}</p>
          <p className="mt-1 text-xs text-muted-foreground">{[RELEASE.versao, mb(d.tamanho), d.requisitos].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-border px-5 py-3">
        <BotaoBaixar d={d} />
        <button onClick={() => setAberto((a) => !a)} className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground" aria-expanded={aberto}>
          Como instalar<motion.span animate={{ rotate: aberto ? 180 : 0 }}><ChevronDown className="h-4 w-4" /></motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-border px-5 py-4 text-sm">
              <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">{d.passos.map((p) => <li key={p}>{p}</li>)}</ol>
              {d.sha256 && (
                <div>
                  <p className="flex items-center justify-between text-xs font-medium">SHA-256 (confira se o arquivo é o original)<Copiar texto={d.sha256} /></p>
                  <code className="mt-1 block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">{d.sha256}</code>
                  <p className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <code className="truncate font-mono">{VERIFICAR[d.plataforma]}{d.arquivo}{d.plataforma === 'windows' ? ' SHA256' : ''}</code>
                    <Copiar texto={`${VERIFICAR[d.plataforma]}${d.arquivo}${d.plataforma === 'windows' ? ' SHA256' : ''}`} rotulo="Comando" />
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function Apps() {
  const { sessao } = useProjeto()
  const toast = useToast()
  const [meu, setMeu] = useState(null)
  const [pwa, setPwa] = useState(null)
  const [qr, setQr] = useState(null)
  const instalado = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  useEffect(() => { sistemaDetalhado().then(setMeu) }, [])
  useEffect(() => {
    const f = (e) => { e.preventDefault(); setPwa(e) }
    window.addEventListener('beforeinstallprompt', f)
    return () => window.removeEventListener('beforeinstallprompt', f)
  }, [])
  useEffect(() => { api.get('/api/apps/qr?alvo=android').then(setQr).catch(() => {}) }, [])
  useEffect(() => {   // veio do QR Code (?baixar=android): já começa o download
    const alvo = new URLSearchParams(location.search).get('baixar')
    const d = alvo && DOWNLOADS.find((x) => x.id === alvo)
    if (d) baixarApp(d, toast)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const [qrSite, setQrSite] = useState(null)
  useEffect(() => { api.get('/api/apps/qr?alvo=site').then(setQrSite).catch(() => {}) }, [])
  const desktop = typeof window !== 'undefined' ? window.climaDesktop : null
  const desatualizado = desktop?.versao && compararVersao(desktop.versao, RELEASE.versao) < 0
  const destaque = meu === 'ios' ? null : DOWNLOADS.find((d) => d.id === meu)   // iPhone não instala .ipa pelo navegador
  const total = DOWNLOADS.reduce((s, d) => s + (d.baixados || 0), 0)
  const instalarPwa = async () => {
    if (!pwa) return
    pwa.prompt()
    const r = await pwa.userChoice
    if (r.outcome === 'accepted') toast('App instalado. Ele aparece junto com os outros apps do computador.')
    setPwa(null)
  }

  return (
    <div className="w-full">
      <Cabecalho titulo="Baixar apps" descricao={`O mesmo login e os mesmos aparelhos no celular e no computador · versão ${RELEASE.versao}, publicada em ${new Date(RELEASE.publicado).toLocaleDateString('pt-BR')}.`}
        acoes={<a href={`${REPO}/releases`} target="_blank" rel="noreferrer"><Botao variante="secundario" icone={ExternalLink}>Todas as versões</Botao></a>} />

      {desktop && (
        <div className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${desatualizado ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
          <p className="text-sm">{desatualizado
            ? <>Você está no app <b>v{desktop.versao}</b>. Já existe a <b>{RELEASE.versao}</b>: baixe abaixo e instale por cima, sem perder nada.</>
            : <>Você está usando o app de computador <b>v{desktop.versao || '1.0.0'}</b>, a versão mais nova.</>}</p>
          {desatualizado && destaque && <BotaoBaixar d={destaque} rotulo={`Baixar ${RELEASE.versao}`} />}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cartao flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
          {destaque ? (
            <>
              <div className="flex items-center gap-5">
                <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${COR[destaque.plataforma]}`}><IconeMarca nome={destaque.plataforma} cor className="h-8 w-8" /></span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recomendado para este aparelho</p>
                  <p className="mt-1 text-xl font-semibold">Clima Escritório para {destaque.nome}</p>
                  <p className="text-sm text-muted-foreground">{[RELEASE.versao, mb(destaque.tamanho), destaque.requisitos].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              <span className="shrink-0"><BotaoBaixar d={destaque} rotulo={`Baixar ${mb(destaque.tamanho)}`} grande /></span>
            </>
          ) : (
            <div className="flex items-center gap-5">
              <span className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${COR.pwa}`}><MonitorSmartphone className="h-8 w-8" /></span>
              <div>
                <p className="text-xl font-semibold">{meu === 'ios' ? 'No iPhone e no iPad, use o app web' : 'Escolha a sua plataforma abaixo'}</p>
                <p className="text-sm text-muted-foreground">{meu === 'ios' ? 'No Safari: Compartilhar → Adicionar à Tela de Início. O app nativo instala por um computador: veja "iPhone e iPad" abaixo.' : 'Android, iPhone, macOS, Windows, Linux ou direto pelo navegador.'}</p>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="cartao flex items-center gap-4 p-5">
          {qr ? <img src={qr.qr} alt="QR Code para baixar o app de Android" className="h-28 w-28 shrink-0 rounded-lg bg-white p-1" /> : <span className="flex h-28 w-28 items-center justify-center rounded-lg bg-muted"><QrCode className="h-6 w-6 text-muted-foreground" /></span>}
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium"><IconeMarca nome="android" cor className="h-4 w-4" />No celular</p>
            <p className="mt-1 text-sm text-muted-foreground">Aponte a câmera do Android para baixar o APK direto no aparelho.</p>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
        {DOWNLOADS.map((d, i) => <CartaoApp key={d.id} d={d} meu={meu} i={i} />)}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: DOWNLOADS.length * 0.04 }} className="cartao flex flex-col">
          <div className="flex items-start gap-4 p-5">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${COR.pwa}`}><IconeMarca nome="pwa" cor className="h-6 w-6" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">App web (PWA)</p>
              <p className="text-sm text-muted-foreground">Instala direto do navegador, sem loja e sem download. Sempre na versão mais nova.</p>
              <p className="mt-1 text-xs text-muted-foreground">Chrome, Edge, Brave ou Safari (iPhone e Mac)</p>
            </div>
          </div>
          <div className="mt-auto border-t border-border px-5 py-3 text-sm">
            {instalado ? <p className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" />Você já está usando o app instalado.</p>
              : pwa ? <Botao tamanho="sm" icone={Download} onClick={instalarPwa}>Instalar agora</Botao>
                : <p className="text-muted-foreground">No menu do navegador, escolha <span className="text-foreground">Instalar app</span>. No iPhone: Compartilhar → <span className="text-foreground">Adicionar à Tela de Início</span>.</p>}
          </div>
        </motion.div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Secao titulo="O que cada app faz" contexto="Todos usam o mesmo login e falam com o mesmo servidor">
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="tabela w-full min-w-[560px]">
              <thead><tr><th>Recurso</th>{COLUNAS.map(([k, r]) => <th key={k} className="!text-center"><span className="inline-flex items-center gap-1.5"><IconeMarca nome={k} className="h-3.5 w-3.5" />{r}</span></th>)}</tr></thead>
              <tbody>{RECURSOS.map(([r, v]) => (
                <tr key={r}><td>{r}</td>{v.map((x, i) => <td key={i} className="text-center">{x ? <Check className="mx-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <span className="text-muted-foreground">—</span>}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </Secao>
        <Secao titulo={`Novidades da ${RELEASE.versao}`} contexto={`Publicada em ${new Date(RELEASE.publicado).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`}>
          <NovidadesVersao notas={RELEASE.notas} />
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground"><span>Downloads por arquivo</span><span className="tabular">{total} no total</span></p>
            {DOWNLOADS.map((d) => (
              <div key={d.id} className="flex items-center gap-2 py-1 text-xs">
                <span className="w-36 shrink-0 truncate">{d.nome}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${total ? ((d.baixados || 0) / Math.max(...DOWNLOADS.map((x) => x.baixados || 0), 1)) * 100 : 0}%` }} /></div>
                <span className="w-6 text-right tabular text-muted-foreground">{d.baixados || 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>Repositório privado: o botão Baixar pede o arquivo pelo servidor (token só de leitura), então funciona mesmo sem conta no GitHub. Cada arquivo tem o SHA-256 em "Como instalar" para conferir que é o original.</span>
          </div>
          <a href={`${REPO}/releases`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"><IconeMarca nome="github" className="h-4 w-4" />Todas as versões no GitHub</a>
        </Secao>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Secao titulo="Requisitos" contexto="O mínimo para cada plataforma">
          <div className="-mx-5 -my-5 overflow-x-auto">
            <table className="tabela w-full min-w-[560px]">
              <thead><tr><th>Plataforma</th><th>Sistema</th><th>Espaço</th><th>Conexão</th></tr></thead>
              <tbody>{REQUISITOS.map(([p, s2, e, c]) => <tr key={p}><td className="font-medium">{p}</td><td className="text-muted-foreground">{s2}</td><td className="tabular">{e}</td><td className="text-muted-foreground">{c}</td></tr>)}</tbody>
            </table>
          </div>
        </Secao>
        <Secao titulo="Abrir em outro aparelho" contexto="Leia com a câmera para abrir o sistema">
          <div className="flex items-center gap-4">
            {qrSite ? <img src={qrSite.qr} alt="QR Code para abrir o sistema" className="h-28 w-28 shrink-0 rounded-lg bg-white p-1" /> : <span className="flex h-28 w-28 items-center justify-center rounded-lg bg-muted"><QrCode className="h-6 w-6 text-muted-foreground" /></span>}
            <div className="min-w-0 space-y-2 text-sm">
              <p className="text-muted-foreground">Abre o sistema no celular ou no tablet; de lá dá para instalar o app web.</p>
              <p className="flex flex-wrap items-center gap-2"><code className="truncate rounded bg-muted px-1.5 py-0.5 text-xs">{window.location.origin}</code><Copiar texto={window.location.origin} rotulo="Copiar link" /></p>
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Esta página:<Copiar texto={`${window.location.origin}/apps`} rotulo="Copiar link dos downloads" /></p>
            </div>
          </div>
        </Secao>
      </div>

      {['dono', 'admin'].includes(sessao?.papel) && (
        <div className="mt-6">
          <Repositorio />
        </div>
      )}

      <div className="mt-6">
        <Secao titulo="Problemas comuns" contexto="O que costuma travar a instalação e como resolver">
          <div className="-my-3">{PROBLEMAS.map(([p, r]) => <Problema key={p} p={p} r={r} />)}</div>
        </Secao>
      </div>
      {sessao?.papel === 'dono' && <TokenDownloads />}
    </div>
  )
}
