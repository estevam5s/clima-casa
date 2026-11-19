import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LogoSpotify from '../components/LogoSpotify'
import {
  ArrowLeft, CalendarClock, Clock3, Disc3, ExternalLink, Heart, Home, KeyRound, Laptop, Library, ListMusic, ListOrdered, LogOut,
  Mic, Monitor, Music2, Pause, Pencil, Play, Plus, RefreshCw, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward, Smartphone,
  Speaker, Trash2, Tv, Volume1, Volume2, VolumeX, X, Zap,
} from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Esqueleto, Interruptor, Modal, useToast, confirmar } from '../components/ui'
import { DIAS_SEMANA } from '../mapaUtil'
import CatalogoVoz from '../components/CatalogoVoz'
import { modelosMusica } from '../vozAlexa'
import { usePlayerNavegador } from '../components/musica/playerNavegador'

// Música: Spotify ligado ao escritório, com a cara do Spotify (biblioteca à esquerda, conteúdo no meio, player
// fixo embaixo). O painel também vira um aparelho do Spotify (Web Playback SDK), então dá para tocar mesmo sem
// nenhum celular ou Echo com o Spotify aberto. Rotinas tocam/pausam por horário ou quando um ar liga/desliga,
// inclusive só quando foi a Alexa que mandou.
// marca: cores do Spotify só nesta tela (tokens sp-* do tailwind.config), de propósito.
const ICONE_APARELHO = { Computer: Laptop, Smartphone, Speaker, TV: Tv, CastAudio: Speaker, Automobile: Speaker, Tablet: Smartphone }
const fmt = (ms) => (ms == null ? '-:--' : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`)
const TIPO = { playlist: 'Playlist', track: 'Música', album: 'Álbum', artist: 'Artista', episode: 'Episódio' }
const ehEcho = (d) => d.tipo === 'Speaker' || /echo|alexa/i.test(d.nome)
const saudacao = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' }
const SUGESTOES = ['Lo-fi para trabalhar', 'Foco', 'MPB', 'Jazz', 'Bossa nova', 'Clássica', 'Pop brasileiro', 'Sertanejo']

// ---------- peças visuais ----------
function Capa({ src, tipo, className = '' }) {
  const redondo = tipo === 'artist'
  return src
    ? <img src={src} alt="" loading="lazy" className={`aspect-square w-full object-cover ${redondo ? 'rounded-full' : 'rounded-md'} ${className}`} />
    : <span className={`flex aspect-square w-full items-center justify-center bg-sp-realce text-sp-icone ${redondo ? 'rounded-full' : 'rounded-md'} ${className}`}><Music2 className="h-1/3 w-1/3" /></span>
}

function BotaoPlay({ onClick, tocando, tamanho = 'h-12 w-12', rotulo = 'Tocar', className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-label={tocando ? 'Pausar' : rotulo} title={tocando ? 'Pausar' : rotulo}
      className={`flex shrink-0 items-center justify-center rounded-full bg-sp-verde text-black transition-transform hover:scale-105 hover:bg-sp-verde-hover active:scale-95 ${tamanho} ${className}`}>
      {tocando ? <Pause className="h-[45%] w-[45%] fill-current" /> : <Play className="ml-[6%] h-[45%] w-[45%] fill-current" />}
    </button>
  )
}

function Cartao({ item, aoAbrir, aoTocar }) {
  return (
    <div className="group relative min-w-0 rounded-lg p-3 transition-colors hover:bg-sp-realce">
      <button type="button" onClick={() => aoAbrir(item)} className="block w-full text-left">
        <Capa src={item.capa} tipo={item.tipo} />
        <p className="mt-3 truncate text-sm font-semibold text-white">{item.nome}</p>
        <p className="mt-0.5 line-clamp-2 text-[13px] text-sp-texto2">{item.tipo === 'artist' ? 'Artista' : [TIPO[item.tipo], item.sub].filter(Boolean).join(' · ')}</p>
      </button>
      {aoTocar && <BotaoPlay onClick={() => aoTocar(item)} tamanho="h-11 w-11" className="absolute right-5 top-[calc(50%-1.5rem)] translate-y-2 opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 focus:opacity-100" />}
    </div>
  )
}

function Fileira({ titulo, itens, aoAbrir, aoTocar, acao }) {
  if (!itens?.length) return null
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-end justify-between gap-3 px-3"><h2 className="text-xl font-bold tracking-tight text-white">{titulo}</h2>{acao}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {itens.slice(0, 12).map((i) => <Cartao key={i.uri} item={i} aoAbrir={aoAbrir} aoTocar={aoTocar} />)}
      </div>
    </section>
  )
}

function ListaFaixas({ faixas, atual, tocando, aoTocar, mostrarAlbum = true, numerar = true }) {
  return (
    <div className="text-sm">
      <div className="mb-2 grid grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-4 border-b border-white/10 px-4 pb-2 text-xs text-sp-texto2 md:grid-cols-[2rem_minmax(0,4fr)_minmax(0,3fr)_3.5rem]">
        <span className="text-right">#</span><span>Título</span>{mostrarAlbum && <span className="hidden md:block">Álbum</span>}{!mostrarAlbum && <span className="hidden md:block" />}<Clock3 className="ml-auto h-4 w-4" aria-label="Duração" />
      </div>
      <ol>
        {faixas.map((f, n) => {
          const essa = atual === f.uri
          return (
            <li key={`${f.uri}-${n}`}>
              <button type="button" onClick={() => aoTocar(f)} className="group grid w-full grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-4 rounded-md px-4 py-2 text-left hover:bg-white/10 md:grid-cols-[2rem_minmax(0,4fr)_minmax(0,3fr)_3.5rem]">
                <span className="text-right tabular text-sp-texto2">
                  <span className={`group-hover:hidden ${essa ? 'text-sp-verde' : ''}`}>{essa && tocando ? <Volume2 className="ml-auto h-4 w-4" /> : numerar ? n + 1 : ''}</span>
                  <Play className="ml-auto hidden h-4 w-4 fill-white text-white group-hover:block" />
                </span>
                <span className="flex min-w-0 items-center gap-3">
                  {f.capa && <img src={f.capa} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />}
                  <span className="min-w-0">
                    <span className={`block truncate font-medium ${essa ? 'text-sp-verde' : 'text-white'}`}>{f.nome}</span>
                    <span className="flex items-center gap-1.5 truncate text-[13px] text-sp-texto2">{f.explicita && <span className="rounded-sm bg-sp-texto2 px-1 text-[9px] font-bold leading-[14px] text-black">E</span>}{f.artistas}</span>
                  </span>
                </span>
                <span className="hidden truncate text-[13px] text-sp-texto2 md:block">{mostrarAlbum ? f.album : ''}</span>
                <span className="text-right tabular text-[13px] text-sp-texto2">{fmt(f.duracao_ms)}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ---------- conexão (antes de conectar) ----------
function Configurar({ estado, aoMudar }) {
  const toast = useToast()
  const [id, setId] = useState(''), [segredo, setSegredo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const salvar = async (e) => {
    e.preventDefault(); setSalvando(true)
    try { aoMudar(await api.put('/api/musica/credenciais', { client_id: id.trim(), client_secret: segredo.trim() })); setId(''); setSegredo(''); toast('App do Spotify salvo. Agora conecte a conta.') } catch (err) { toast(err.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <div className="cartao p-5">
      <h2 className="titulo-secao">1. Criar o app no Spotify (uma vez)</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>Abra <a className="text-primary hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> e entre com a conta Spotify <b className="text-foreground">Premium</b> do escritório (conta grátis não libera a Web API).</li>
        <li>Clique em <b className="text-foreground">Create app</b>. Nome e descrição à sua escolha.</li>
        <li>Em <b className="text-foreground">Redirect URIs</b>, cole exatamente: <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{estado.redirect_uri}</code></li>
        <li>Em <b className="text-foreground">Which API/SDKs</b>, marque <b className="text-foreground">Web API</b> e <b className="text-foreground">Web Playback SDK</b>, aceite os termos e salve.</li>
        <li>Abra <b className="text-foreground">Settings</b>, copie o <b className="text-foreground">Client ID</b> e clique em <b className="text-foreground">View client secret</b> para copiar o segredo.</li>
        <li>Outra conta Spotify vai tocar? Adicione o e-mail dela em <b className="text-foreground">User Management</b> (o dono do app já está liberado).</li>
      </ol>
      <form onSubmit={salvar} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Client ID<input value={id} onChange={(e) => setId(e.target.value)} required minLength={20} className="campo mt-1 h-9 font-mono" autoComplete="off" spellCheck={false} /></label>
        <label className="text-xs text-muted-foreground">Client Secret<input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={segredo} onChange={(e) => setSegredo(e.target.value)} required minLength={20} className="campo mt-1 h-9 font-mono" /></label>
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-muted-foreground">{estado.configurado ? `App atual: ${estado.client_id}. Salvar outro troca o app e pede login de novo.` : 'O segredo fica cifrado no banco; ninguém vê depois de salvo.'}</p>
          <Botao type="submit" icone={KeyRound} carregando={salvando}>Salvar app</Botao>
        </div>
      </form>
    </div>
  )
}

// ---------- rotinas ----------
const NOVA = (extra = {}) => ({
  id: `r-${Date.now().toString(36)}`, nome: '', ativo: true,
  gatilho: { tipo: 'horario', hora: '08:30', dias: [1, 2, 3, 4, 5], aparelho_id: null, origem: 'qualquer' },
  janela: { inicio: null, fim: null },
  acao: { tipo: 'tocar', uri: null, nome: '', capa: '', aparelho_nome: '', volume: 30, aleatorio: true },
  ...extra,
})
const ORIGENS = [['qualquer', 'Qualquer origem'], ['alexa', 'Pela Alexa'], ['painel', 'Pelo painel ou app'], ['agenda', 'Pela agenda ou cena']]

function Escolher({ aoEscolher, rotulo = 'Escolher' }) {
  const toast = useToast()
  const [q, setQ] = useState(''), [res, setRes] = useState(null)
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined }
    const t = setTimeout(() => api.get(`/api/musica/buscar?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => toast(e.message, 'erro')), 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const grupos = res ? [['Playlists', res.playlists], ['Músicas', res.tracks], ['Álbuns', res.albums], ['Artistas', res.artists]] : []
  return (
    <div>
      <label className="relative mb-3 block"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar música, artista, álbum ou playlist" className="campo h-9 pl-8" aria-label="Buscar no Spotify" type="search" autoComplete="off" /></label>
      <div className="max-h-[22rem] space-y-3 overflow-auto">
        {!res && <p className="px-2 text-sm text-muted-foreground">Digite pelo menos 2 letras.</p>}
        {grupos.map(([t, l]) => (l?.length ? (
          <div key={t}><p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t}</p>
            {l.map((i) => (
              <button key={i.uri} type="button" onClick={() => aoEscolher(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                {i.capa ? <img src={i.capa} alt="" className={`h-10 w-10 shrink-0 object-cover ${i.tipo === 'artist' ? 'rounded-full' : 'rounded'}`} /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted"><Music2 className="h-4 w-4 text-muted-foreground" /></span>}
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.nome}</span><span className="block truncate text-xs text-muted-foreground">{TIPO[i.tipo]}{i.sub ? ` · ${i.sub}` : ''}</span></span>
                <span className="text-xs font-medium text-primary">{rotulo}</span>
              </button>
            ))}
          </div>
        ) : null))}
      </div>
    </div>
  )
}

function EditorRotina({ inicial, ares, aparelhosSpotify, onSalvar, onFechar }) {
  const [r, setR] = useState(() => ({ ...inicial, gatilho: { origem: 'qualquer', ...inicial.gatilho } }))
  const [escolhendo, setEscolhendo] = useState(false)
  const g = r.gatilho, a = r.acao
  const mg = (k, v) => setR((x) => ({ ...x, gatilho: { ...x.gatilho, [k]: v } }))
  const ma = (k, v) => setR((x) => ({ ...x, acao: { ...x.acao, [k]: v } }))
  const valido = r.nome.trim() && (g.tipo !== 'horario' || g.hora) && (a.tipo !== 'tocar' || a.uri)
  return (
    <Modal aberto titulo={inicial.nome ? `Rotina: ${inicial.nome}` : 'Nova rotina de música'} onFechar={onFechar} largura="max-w-2xl">
      <div className="grid gap-4 text-sm">
        <label className="text-xs text-muted-foreground">Nome<input value={r.nome} maxLength={60} onChange={(e) => setR({ ...r, nome: e.target.value })} className="campo mt-1 h-9" placeholder="Ex.: Abertura do escritório" /></label>
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium">Quando</legend>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[['horario', 'Num horário', CalendarClock], ['ar_ligou', 'Quando um ar ligar', Zap], ['ar_desligou', 'Quando um ar desligar', Zap]].map(([k, n, I]) => (
              <button key={k} type="button" onClick={() => mg('tipo', k)} className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs ${g.tipo === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}><I className="h-3.5 w-3.5" />{n}</button>
            ))}
          </div>
          {g.tipo === 'horario' ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-muted-foreground">Hora<input type="time" value={g.hora || ''} onChange={(e) => mg('hora', e.target.value)} className="campo mt-1 h-9 w-28" /></label>
              <div className="flex flex-wrap gap-1">{[1, 2, 3, 4, 5, 6, 0].map((d) => { const on = g.dias.includes(d); return <button key={d} type="button" aria-pressed={on} onClick={() => mg('dias', on ? g.dias.filter((x) => x !== d) : [...g.dias, d])} className={`h-9 w-10 rounded-md border text-xs ${on ? 'border-transparent bg-primary font-medium text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>{DIAS_SEMANA[d]}</button> })}</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs text-muted-foreground">Ar<select value={g.aparelho_id ?? ''} onChange={(e) => mg('aparelho_id', e.target.value ? +e.target.value : null)} className="campo mt-1 h-9"><option value="">Qualquer ar</option>{ares.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">Quem mandou<select value={g.origem || 'qualquer'} onChange={(e) => mg('origem', e.target.value)} className="campo mt-1 h-9">{ORIGENS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">Só entre<input type="time" value={r.janela.inicio || ''} onChange={(e) => setR({ ...r, janela: { ...r.janela, inicio: e.target.value || null } })} className="campo mt-1 h-9" /></label>
              <label className="text-xs text-muted-foreground">e<input type="time" value={r.janela.fim || ''} onChange={(e) => setR({ ...r, janela: { ...r.janela, fim: e.target.value || null } })} className="campo mt-1 h-9" /></label>
              {g.origem === 'alexa' && <p className="text-xs text-muted-foreground sm:col-span-2">Vale quando alguém pede à Alexa (ou ao Google) para ligar ou desligar o ar. Pedidos pelo painel, app ou agenda não disparam esta rotina.</p>}
            </div>
          )}
        </fieldset>
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium">Fazer</legend>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[['tocar', 'Tocar'], ['pausar', 'Pausar'], ['volume', 'Mudar volume'], ['proxima', 'Pular música']].map(([k, n]) => (
              <button key={k} type="button" onClick={() => ma('tipo', k)} className={`h-8 rounded-md border px-2.5 text-xs ${a.tipo === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>{n}</button>
            ))}
          </div>
          {a.tipo === 'tocar' && (
            escolhendo ? <Escolher aoEscolher={(i) => { setR((x) => ({ ...x, acao: { ...x.acao, uri: i.uri, nome: i.nome, capa: i.capa || '' } })); setEscolhendo(false) }} />
              : (
                <button type="button" onClick={() => setEscolhendo(true)} className="mb-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-left hover:bg-muted">
                  {a.capa ? <img src={a.capa} alt="" className="h-10 w-10 rounded object-cover" /> : <ListMusic className="h-5 w-5 text-muted-foreground" />}
                  <span className="flex-1">{a.uri ? <><b>{a.nome}</b><span className="block text-xs text-muted-foreground">Clique para trocar</span></> : 'Escolher playlist, álbum, artista ou música'}</span>
                </button>
              )
          )}
          {!escolhendo && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground sm:col-span-2">Aparelho<input list="aparelhos-spotify" value={a.aparelho_nome} onChange={(e) => ma('aparelho_nome', e.target.value)} className="campo mt-1 h-9" placeholder="O que estiver ativo" autoComplete="off" />
                <datalist id="aparelhos-spotify">{aparelhosSpotify.map((d) => <option key={d.id} value={d.nome} />)}</datalist></label>
              {(a.tipo === 'tocar' || a.tipo === 'volume') && <label className="text-xs text-muted-foreground">Volume {a.volume ?? 30}%<input type="range" min="0" max="100" step="5" value={a.volume ?? 30} onChange={(e) => ma('volume', +e.target.value)} className="mt-3 w-full accent-[hsl(var(--primary))]" /></label>}
              {a.tipo === 'tocar' && <label className="flex items-center gap-2 text-xs sm:col-span-3"><input type="checkbox" checked={!!a.aleatorio} onChange={(e) => ma('aleatorio', e.target.checked)} />Embaralhar</label>}
            </div>
          )}
        </fieldset>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao disabled={!valido} onClick={() => onSalvar({ ...r, nome: r.nome.trim() })}>Salvar rotina</Botao>
        </div>
      </div>
    </Modal>
  )
}

function descreverRotina(r, ares) {
  const g = r.gatilho
  const quem = g.origem === 'alexa' ? ' pela Alexa' : g.origem === 'painel' ? ' pelo painel' : g.origem === 'agenda' ? ' pela agenda' : ''
  const quando = g.tipo === 'horario' ? `Às ${g.hora}, ${g.dias.length === 7 ? 'todo dia' : [...g.dias].sort().map((d) => DIAS_SEMANA[d]).join(', ')}`
    : `Quando ${g.aparelho_id ? ares.find((x) => x.id === g.aparelho_id)?.nome || 'um ar' : 'qualquer ar'} ${g.tipo === 'ar_ligou' ? 'ligar' : 'desligar'}${quem}${r.janela?.inicio && r.janela?.fim ? ` (${r.janela.inicio} às ${r.janela.fim})` : ''}`
  const a = r.acao
  const faz = a.tipo === 'tocar' ? `tocar ${a.nome || 'música'}${a.volume != null ? ` a ${a.volume}%` : ''}` : a.tipo === 'pausar' ? 'pausar' : a.tipo === 'volume' ? `volume em ${a.volume}%` : 'pular música'
  return `${quando}: ${faz}${a.aparelho_nome ? ` no ${a.aparelho_nome}` : ''}`
}

// ---------- página ----------
export default function Musica() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const admin = ['dono', 'admin'].includes(sessao?.papel)
  const podeControlar = !!sessao?.permissoes?.includes('aparelhos.controlar')
  const [estado, setEstado] = useState(null), [erro, setErro] = useState('')
  const [erroLogin, setErroLogin] = useState('')
  const voltou = useRef(false)
  const [processando, setProcessando] = useState(() => !!window.__spotifyRetorno?.processando)

  const carregarEstado = () => api.get('/api/musica/estado').then(setEstado).catch((e) => setErro(e.message))
  useEffect(() => { carregarEstado() }, [])
  // resultado da volta do login do Spotify (a troca do código é feita em main.jsx, assim que a página carrega)
  useEffect(() => {
    const ver = () => {
      let x = window.__spotifyRetorno
      if (!x || x.processando) { try { x = JSON.parse(sessionStorage.getItem('spotify-retorno') || 'null') } catch { x = null } }
      if (!x || x.processando || voltou.current) return
      voltou.current = true; setProcessando(false)
      try { sessionStorage.removeItem('spotify-retorno') } catch { /* sem armazenamento */ }
      window.__spotifyRetorno = null
      if (x.ok) toast(`Spotify conectado${x.conta ? `: ${x.conta}` : ''}.`); else { toast(x.msg || 'Não deu para conectar o Spotify.', 'erro'); setErroLogin(x.msg || '') }
      carregarEstado()
    }
    ver(); window.addEventListener('spotify-retorno', ver)
    return () => window.removeEventListener('spotify-retorno', ver)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const conectar = async () => { try { window.location.href = (await api.get('/api/musica/conectar')).url } catch (e) { toast(e.message, 'erro') } }
  const desconectar = async () => { if (!await confirmar('Desconectar a conta do Spotify? As rotinas param até conectar de novo.')) return; try { setEstado(await api.post('/api/musica/desconectar')) } catch (e) { toast(e.message, 'erro') } }

  if (erro) return <Aviso>{erro}</Aviso>
  if (!estado) return <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-[60vh]" /></div>

  if (!estado.conectado) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3"><LogoSpotify className="h-8 w-8" /><div><h1 className="text-2xl font-semibold tracking-tight">Música</h1><p className="text-sm text-muted-foreground">Ligue a conta Spotify do escritório para tocar pelo painel, pela Alexa e por rotinas.</p></div></div>
        {processando && <Aviso tipo="info">Concluindo o login do Spotify…</Aviso>}
        {erroLogin && <Aviso tipo="alerta">{erroLogin}</Aviso>}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {admin ? <Configurar estado={estado} aoMudar={setEstado} /> : <Aviso tipo="alerta">O Spotify ainda não foi conectado. Peça ao dono ou a um administrador.</Aviso>}
          <div className="cartao p-5">
            <h2 className="titulo-secao">2. Conectar a conta</h2>
            <p className="mt-2 text-sm text-muted-foreground">Depois de salvar o app, entre com a conta Spotify. Para controlar a reprodução, ela precisa ser <b className="text-foreground">Premium</b>.</p>
            <Botao className="mt-4 w-full" icone={ExternalLink} disabled={!estado.configurado || !admin} onClick={conectar}><span className="inline-flex items-center gap-2"><LogoSpotify className="h-4 w-4" />Conectar com o Spotify</span></Botao>
            <h3 className="mt-6 text-sm font-semibold">E a Alexa?</h3>
            <p className="mt-1 text-sm text-muted-foreground">No app Alexa: Mais, Configurações, Música e podcasts, Vincular novo serviço, Spotify. Assim os Echo aparecem como aparelhos aqui e as rotinas podem tocar neles.</p>
          </div>
        </div>
      </div>
    )
  }
  return <Estudio estado={estado} admin={admin} podeControlar={podeControlar} sessao={sessao} conectar={conectar} desconectar={desconectar} />
}

function Estudio({ estado, admin, podeControlar, sessao, conectar, desconectar }) {
  const toast = useToast()
  const [p, setP] = useState(null), [erroP, setErroP] = useState('')
  const [aba, setAba] = useState('inicio')
  const [aberto, setAberto] = useState(null)     // uri da playlist/álbum/artista aberta
  const [inicio, setInicio] = useState(null)
  const [painel, setPainel] = useState(null)     // 'fila' | 'aparelhos' | null
  const [ares, setAres] = useState([])
  const [rotinas, setRotinas] = useState(null), [editando, setEditando] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [buscaQ, setBuscaQ] = useState('')
  const ultimo = useRef(0), falhou = useRef(0)

  const carregarP = useCallback(() => api.get('/api/musica/tocando').then((x) => { setP(x); setErroP(''); falhou.current = 0; ultimo.current = Date.now() }).catch((e) => { setErroP(e.message); falhou.current = Date.now() }), [])
  const nomePlayer = `Painel Clima · ${(sessao?.nome || sessao?.email || 'navegador').split(/[ @]/)[0]}`
  const nav = usePlayerNavegador(podeControlar && estado.player_navegador, nomePlayer, () => setTimeout(carregarP, 300))

  useEffect(() => { carregarP(); const t = setInterval(() => { if (!document.hidden && (!falhou.current || Date.now() - falhou.current > 60000)) carregarP() }, 5000); return () => clearInterval(t) }, [carregarP])
  useEffect(() => { if (nav.pronto) setTimeout(carregarP, 800) }, [nav.pronto, carregarP])
  useEffect(() => {
    api.get('/api/musica/inicio').then(setInicio).catch(() => setInicio({ recentes: [], curtidas: [], top_artistas: [], top_faixas: [], playlists: [] }))
    api.get('/api/musica/rotinas').then(setRotinas).catch(() => setRotinas([]))
    api.get('/api/aparelhos').then((l) => setAres(Array.isArray(l) ? l : l.aparelhos || [])).catch(() => {})
  }, [])
  // a barra de progresso anda sozinha entre as atualizações
  const [, tique] = useState(0)
  useEffect(() => { const t = setInterval(() => tique((x) => x + 1), 1000); return () => clearInterval(t) }, [])

  const aparelhos = p?.aparelhos || []
  const cmd = async (corpo, aviso) => {
    if (!podeControlar) { toast('Sua conta não pode controlar a música.', 'erro'); return false }
    nav.ativar()
    // nada tocando em lugar nenhum: usa este navegador como aparelho
    if (!corpo.device_id && !aparelhos.some((d) => d.ativo) && nav.pronto && ['tocar'].includes(corpo.acao)) corpo = { ...corpo, device_id: nav.id }
    setOcupado(true)
    try { setP(await api.post('/api/musica/comando', corpo)); ultimo.current = Date.now(); if (aviso) toast(aviso); return true } catch (e) { toast(e.message, 'erro'); return false } finally { setOcupado(false) }
  }
  const tocarItem = (i, contexto) => cmd({ acao: 'tocar', uri: i.uri, ...(contexto ? { contexto } : {}) }, `Tocando ${i.nome}.`)
  const abrir = (i) => { if (i.tipo === 'track') { tocarItem(i); return } setAberto(i.uri); setAba('detalhe') }

  const salvarRotinas = async (lista) => { try { setRotinas(await api.put('/api/musica/rotinas', lista)); return true } catch (e) { toast(e.message, 'erro'); return false } }
  const testar = async (r) => { try { await api.post('/api/musica/rotinas/testar', { id: r.id }); toast(`Rotina "${r.nome}" executada.`) } catch (e) { toast(e.message, 'erro') } }
  const echos = aparelhos.filter(ehEcho)
  const modelosVoz = useMemo(() => modelosMusica({ playlists: (inicio?.playlists || []).map((x) => x.nome), echos: echos.map((d) => d.nome) }), [inicio, echos.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const ABAS = [['inicio', 'Início', Home], ['buscar', 'Buscar', Search], ['rotinas', 'Rotinas', CalendarClock], ['alexa', 'Alexa', Mic]]
  const irAba = (k) => { setAba(k); setAberto(null) }

  return (
    <div className="-mx-4 -mb-16 -mt-6 bg-sp-preto text-white sm:-mx-6 lg:-mx-8 2xl:-mx-10">
      <div className="flex flex-col gap-2 p-2 lg:h-[calc(100dvh-4rem)]">
        {(estado.faltam_escopos?.length > 0 && admin) && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sp-aviso px-4 py-3 text-sm">
            <RefreshCw className="h-4 w-4 text-sp-verde" />
            <span className="min-w-0 flex-1">Reconecte o Spotify uma vez para liberar o <b>player neste navegador</b> e a seção <b>Suas mais ouvidas</b>.</span>
            <button type="button" onClick={conectar} className="h-8 rounded-full bg-white px-4 text-sm font-bold text-black hover:scale-105">Reconectar</button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 gap-2">
          <Biblioteca inicio={inicio} aberto={aberto} abrir={abrir} />
          <div className="relative flex min-w-0 flex-1 flex-col rounded-lg bg-sp-base lg:overflow-hidden">
            <div className="sticky top-16 z-10 flex rounded-t-lg lg:static items-center gap-2 overflow-x-auto bg-sp-base/95 px-4 py-3 backdrop-blur [scrollbar-width:none] sm:px-6">
              {aba === 'detalhe' && <button type="button" onClick={() => setAba('inicio')} aria-label="Voltar" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/60 hover:bg-black"><ArrowLeft className="h-4 w-4" /></button>}
              {ABAS.map(([k, n, I]) => (
                <button key={k} type="button" onClick={() => irAba(k)} aria-pressed={aba === k}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${aba === k ? 'bg-white text-black' : 'bg-white/[.07] text-white hover:bg-white/[.12]'}`}><I className="h-4 w-4" />{n}</button>
              ))}
              <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                <span className="hidden items-center gap-2 text-sm text-sp-texto3 md:flex"><LogoSpotify className="h-5 w-5" />{estado.conta?.nome}{estado.conta?.produto === 'premium' && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">Premium</span>}</span>
                {admin && <button type="button" onClick={desconectar} title="Desconectar o Spotify" aria-label="Desconectar o Spotify" className="flex h-8 w-8 items-center justify-center rounded-full text-sp-texto3 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>}
              </div>
            </div>
            <div className="px-1 pb-10 sm:px-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {erroP && <div className="mx-3 mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{erroP}</div>}
              {aba === 'inicio' && <Inicio dados={inicio} p={p} abrir={abrir} tocar={tocarItem} irBuscar={(q) => { setBuscaQ(q); setAba('buscar') }} />}
              {aba === 'buscar' && <Buscar key={buscaQ} inicial={buscaQ} abrir={abrir} tocar={tocarItem} atual={p?.item?.uri} tocando={p?.tocando} />}
              {aba === 'detalhe' && aberto && <Detalhe uri={aberto} p={p} abrir={abrir} cmd={cmd} />}
              {aba === 'rotinas' && <Rotinas rotinas={rotinas} ares={ares} podeControlar={podeControlar} setEditando={setEditando} salvarRotinas={salvarRotinas} testar={testar} />}
              {aba === 'alexa' && <Alexa echos={echos} aparelhos={aparelhos} podeControlar={podeControlar} nova={(x) => setEditando(NOVA(x))} modelosVoz={modelosVoz} irRotinas={() => setAba('rotinas')} />}
            </div>
          </div>
          {painel && <PainelLateral tipo={painel} fechar={() => setPainel(null)} p={p} nav={nav} cmd={cmd} />}
        </div>
        <BarraPlayer p={p} ocupado={ocupado || !podeControlar} cmd={cmd} ultimo={ultimo} painel={painel} setPainel={setPainel} nav={nav} />
      </div>
      {editando && <EditorRotina inicial={editando} ares={ares} aparelhosSpotify={aparelhos} onFechar={() => setEditando(null)}
        onSalvar={async (r) => { const lista = (rotinas || []).some((x) => x.id === r.id) ? rotinas.map((x) => (x.id === r.id ? r : x)) : [...(rotinas || []), r]; if (await salvarRotinas(lista)) { setEditando(null); toast('Rotina salva.'); setAba('rotinas') } }} />}
    </div>
  )
}

function Biblioteca({ inicio, aberto, abrir }) {
  const [filtro, setFiltro] = useState('playlist')
  const itens = filtro === 'playlist' ? (inicio?.playlists || []).map((x) => ({ ...x, tipo: 'playlist', sub: `Playlist · ${x.dono || ''}` })) : (inicio?.top_artistas || [])
  return (
    <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-lg bg-sp-base lg:flex">
      <div className="flex items-center gap-2 px-5 pb-2 pt-4 text-sp-texto3"><Library className="h-5 w-5" /><span className="font-bold text-white">Sua Biblioteca</span></div>
      <div className="flex gap-2 px-4 py-2">
        {[['playlist', 'Playlists'], ['artist', 'Artistas']].map(([k, n]) => <button key={k} type="button" onClick={() => setFiltro(k)} className={`h-8 rounded-full px-3 text-sm ${filtro === k ? 'bg-white text-black' : 'bg-white/[.07] hover:bg-white/[.12]'}`}>{n}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtro === 'playlist' && (
          <div className="flex w-full items-center gap-3 rounded-md p-2">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-sp-curtidas text-white" /* marca: capa das Músicas Curtidas */><Heart className="h-5 w-5 fill-current" /></span>
            <span className="min-w-0"><span className="block truncate text-[15px] text-white">Músicas Curtidas</span><span className="block text-[13px] text-sp-texto2">{inicio?.curtidas_total != null ? `${inicio.curtidas_total} músicas` : 'Playlist'}</span></span>
          </div>
        )}
        {inicio == null ? <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded bg-white/5" />)}</div>
          : itens.length ? itens.map((i) => (
            <button key={i.uri} type="button" onClick={() => abrir(i)} className={`flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/[.07] ${aberto === i.uri ? 'bg-white/10' : ''}`}>
              <span className="w-12 shrink-0"><Capa src={i.capa} tipo={i.tipo} /></span>
              <span className="min-w-0"><span className={`block truncate text-[15px] ${aberto === i.uri ? 'text-sp-verde' : 'text-white'}`}>{i.nome}</span><span className="block truncate text-[13px] text-sp-texto2">{i.tipo === 'artist' ? 'Artista' : i.sub}</span></span>
            </button>
          )) : (
            <div className="m-2 rounded-lg bg-sp-campo p-4">
              <p className="font-bold">{filtro === 'playlist' ? 'Nenhuma playlist nesta conta' : 'Ainda sem artistas do momento'}</p>
              <p className="mt-1 text-sm text-sp-texto3">{filtro === 'playlist' ? 'As playlists que você cria ou segue no Spotify aparecem aqui.' : 'Aparecem depois de ouvir um pouco (e de reconectar, se o aviso pedir).'}</p>
            </div>
          )}
      </div>
    </aside>
  )
}

function Inicio({ dados, p, abrir, tocar, irBuscar }) {
  if (!dados) return <div className="space-y-4 p-3"><div className="h-10 w-48 animate-pulse rounded bg-white/5" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded bg-white/5" />)}</div></div>
  const rapidos = [...(dados.playlists || []).map((x) => ({ ...x, tipo: 'playlist' })), ...(dados.recentes || []).map((f) => ({ nome: f.album || f.nome, uri: f.album_uri || f.uri, capa: f.capa, tipo: f.album_uri ? 'album' : 'track' }))]
    .filter((x, i, l) => x.uri && l.findIndex((y) => y.uri === x.uri) === i).slice(0, 8)
  const vazio = !rapidos.length && !dados.curtidas?.length && !dados.top_artistas?.length
  return (
    <div className="pt-2">
      <h1 className="mb-4 px-3 text-2xl font-bold tracking-tight sm:text-3xl">{saudacao()}</h1>
      {rapidos.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-2 px-3 sm:grid-cols-2 xl:grid-cols-4">
          {rapidos.map((i) => (
            <div key={i.uri} className="group flex h-14 items-center gap-3 overflow-hidden rounded bg-white/[.07] pr-2 transition-colors hover:bg-white/[.16]">
              <button type="button" onClick={() => abrir(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="w-14 shrink-0"><Capa src={i.capa} tipo="album" className="rounded-none" /></span>
                <span className="truncate text-sm font-bold">{i.nome}</span>
              </button>
              <BotaoPlay tamanho="h-9 w-9" onClick={() => tocar(i)} className="opacity-0 shadow-lg group-hover:opacity-100 focus:opacity-100" />
            </div>
          ))}
        </div>
      )}
      {vazio && (
        <section className="mx-3 mb-8 rounded-lg bg-sp-aviso p-5">
          <p className="text-lg font-bold">Esta conta ainda não tem histórico</p>
          <p className="mt-1 text-sm text-sp-texto3">O Início se monta com o que a conta ouve, curte e segue no Spotify. Comece por uma busca:</p>
          <div className="mt-4 flex flex-wrap gap-2">{SUGESTOES.map((s) => <button key={s} type="button" onClick={() => irBuscar(s)} className="h-9 rounded-full bg-white/[.07] px-4 text-sm hover:bg-white/[.14]">{s}</button>)}</div>
        </section>
      )}
      <Fileira titulo="Tocadas recentemente" itens={dados.recentes?.map((f) => ({ ...f, tipo: 'track', sub: f.artistas, capa: f.capa_grande || f.capa }))} aoAbrir={abrir} aoTocar={tocar} />
      <Fileira titulo="Suas playlists" itens={dados.playlists?.map((x) => ({ ...x, tipo: 'playlist', sub: x.dono }))} aoAbrir={abrir} aoTocar={tocar} />
      <Fileira titulo="Seus artistas do momento" itens={dados.top_artistas} aoAbrir={abrir} aoTocar={tocar} />
      <Fileira titulo="Suas mais ouvidas" itens={dados.top_faixas?.map((f) => ({ ...f, tipo: 'track', sub: f.artistas, capa: f.capa_grande || f.capa }))} aoAbrir={abrir} aoTocar={tocar} />
      {dados.curtidas?.length > 0 && (
        <section className="mb-8 px-3">
          <h2 className="mb-3 text-xl font-bold tracking-tight">Músicas Curtidas</h2>
          <ListaFaixas faixas={dados.curtidas} atual={p?.item?.uri} tocando={p?.tocando} aoTocar={(f) => tocar(f)} />
        </section>
      )}
    </div>
  )
}

function Buscar({ inicial, abrir, tocar, atual, tocando }) {
  const toast = useToast()
  const [q, setQ] = useState(inicial || ''), [res, setRes] = useState(null), [filtro, setFiltro] = useState('tudo'), [carregando, setCarregando] = useState(false)
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined }
    setCarregando(true)
    const t = setTimeout(() => api.get(`/api/musica/buscar?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => toast(e.message, 'erro')).finally(() => setCarregando(false)), 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const faixas = (res?.tracks || []).map((t) => ({ nome: t.nome, uri: t.uri, artistas: t.sub, capa: t.capa, duracao_ms: null }))
  const melhor = res && (res.artists?.[0] || res.playlists?.[0] || res.albums?.[0])
  return (
    <div className="pt-2">
      <label className="relative mx-3 mb-4 block max-w-xl">
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-sp-texto3" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="O que você quer ouvir?" type="search" autoComplete="off" aria-label="Buscar no Spotify"
          className="h-12 w-full rounded-full border-2 border-transparent bg-sp-campo pl-12 pr-4 text-[15px] text-white placeholder:text-sp-texto2 hover:bg-sp-campo-hover focus:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" />
      </label>
      {!res && !carregando && (
        <div className="px-3">
          <h2 className="mb-3 text-xl font-bold">Ideias para começar</h2>
          <div className="flex flex-wrap gap-2">{SUGESTOES.map((s) => <button key={s} type="button" onClick={() => setQ(s)} className="h-9 rounded-full bg-white/[.07] px-4 text-sm hover:bg-white/[.14]">{s}</button>)}</div>
        </div>
      )}
      {carregando && !res && <div className="px-3 text-sm text-sp-texto3">Buscando…</div>}
      {res && (
        <>
          <div className="mb-5 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
            {[['tudo', 'Tudo'], ['tracks', 'Músicas'], ['artists', 'Artistas'], ['albums', 'Álbuns'], ['playlists', 'Playlists']].map(([k, n]) => <button key={k} type="button" onClick={() => setFiltro(k)} className={`h-8 shrink-0 rounded-full px-3 text-sm ${filtro === k ? 'bg-white text-black' : 'bg-white/[.07] hover:bg-white/[.12]'}`}>{n}</button>)}
          </div>
          {filtro === 'tudo' ? (
            <>
              <div className="mb-8 grid grid-cols-1 gap-6 px-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                {melhor && (
                  <section>
                    <h2 className="mb-3 text-xl font-bold">Melhor resultado</h2>
                    <div className="group relative rounded-lg bg-sp-cartao p-5 transition-colors hover:bg-sp-realce">
                      <button type="button" onClick={() => abrir(melhor)} className="block text-left">
                        <span className="block w-24"><Capa src={melhor.capa} tipo={melhor.tipo} /></span>
                        <span className="mt-4 block truncate text-3xl font-bold">{melhor.nome}</span>
                        <span className="mt-1 block text-sm text-sp-texto3">{TIPO[melhor.tipo]}{melhor.sub ? ` · ${melhor.sub}` : ''}</span>
                      </button>
                      <BotaoPlay onClick={() => tocar(melhor)} className="absolute bottom-5 right-5 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus:opacity-100" />
                    </div>
                  </section>
                )}
                {faixas.length > 0 && <section className="min-w-0"><h2 className="mb-3 text-xl font-bold">Músicas</h2><ListaFaixas faixas={faixas.slice(0, 5)} atual={atual} tocando={tocando} aoTocar={tocar} mostrarAlbum={false} numerar={false} /></section>}
              </div>
              <Fileira titulo="Artistas" itens={res.artists} aoAbrir={abrir} aoTocar={tocar} />
              <Fileira titulo="Álbuns" itens={res.albums} aoAbrir={abrir} aoTocar={tocar} />
              <Fileira titulo="Playlists" itens={res.playlists} aoAbrir={abrir} aoTocar={tocar} />
            </>
          ) : filtro === 'tracks' ? <div className="px-3"><ListaFaixas faixas={faixas} atual={atual} tocando={tocando} aoTocar={tocar} mostrarAlbum={false} /></div>
            : <Fileira titulo={{ artists: 'Artistas', albums: 'Álbuns', playlists: 'Playlists' }[filtro]} itens={res[filtro]} aoAbrir={abrir} aoTocar={tocar} />}
          {!faixas.length && !res.artists?.length && !res.albums?.length && !res.playlists?.length && <p className="px-3 text-sp-texto3">Nada encontrado para "{q}".</p>}
        </>
      )}
    </div>
  )
}

function Detalhe({ uri, p, abrir, cmd }) {
  const [d, setD] = useState(null), [erro, setErro] = useState('')
  useEffect(() => { setD(null); setErro(''); api.get(`/api/musica/detalhe?uri=${encodeURIComponent(uri)}`).then(setD).catch((e) => setErro(e.message)) }, [uri])
  if (erro) return <div className="m-3 rounded-lg bg-sp-aviso p-5 text-sm text-sp-texto3">{erro}</div>
  if (!d) return <div className="flex items-end gap-6 p-6"><div className="h-48 w-48 animate-pulse rounded bg-white/5" /><div className="h-12 w-72 animate-pulse rounded bg-white/5" /></div>
  const tocandoEste = p?.tocando && p?.contexto === d.uri
  const total = d.tipo === 'artist' ? (d.seguidores != null ? `${d.seguidores.toLocaleString('pt-BR')} seguidores` : '') : [d.dono, d.ano, d.total ? `${d.total} músicas` : ''].filter(Boolean).join(' · ')
  return (
    <div>
      <header className="flex flex-col items-center gap-5 bg-sp-topo px-4 pb-6 pt-4 sm:flex-row sm:items-end sm:px-6">
        <span className="w-44 shrink-0 sm:w-52"><Capa src={d.capa} tipo={d.tipo} /></span>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium">{TIPO[d.tipo]}</p>
          <h1 className="my-2 break-words text-3xl font-black tracking-tight sm:text-5xl xl:text-6xl">{d.nome}</h1>
          {d.descricao && <p className="mb-2 line-clamp-2 text-sm text-sp-texto3">{d.descricao.replace(/<[^>]+>/g, '')}</p>}
          <p className="text-sm text-sp-texto1">{total}</p>
        </div>
      </header>
      <div className="flex items-center gap-6 px-4 py-5 sm:px-6">
        <BotaoPlay tamanho="h-14 w-14" tocando={tocandoEste} onClick={() => (tocandoEste ? cmd({ acao: 'pausar' }) : cmd({ acao: 'tocar', uri: d.uri }, `Tocando ${d.nome}.`))} />
        <button type="button" onClick={() => cmd({ acao: 'aleatorio', valor: !p?.aleatorio })} aria-pressed={!!p?.aleatorio} title="Aleatório" className={`${p?.aleatorio ? 'text-sp-verde' : 'text-sp-texto3 hover:text-white'}`}><Shuffle className="h-7 w-7" /></button>
      </div>
      <div className="px-1 sm:px-3">
        {d.faixas_bloqueadas ? (
          <div className="mx-3 rounded-lg bg-sp-aviso p-5 text-sm text-sp-texto3">O Spotify não mostra a lista de músicas desta playlist para apps em modo de desenvolvimento (só para playlists criadas pela própria conta). Dá para tocar a playlist inteira no botão verde.</div>
        ) : d.faixas?.length ? (
          <>
            {d.tipo === 'artist' && <h2 className="mb-3 px-3 text-xl font-bold">Populares</h2>}
            <ListaFaixas faixas={d.faixas} atual={p?.item?.uri} tocando={p?.tocando} mostrarAlbum={d.tipo !== 'album'}
              aoTocar={(f) => cmd({ acao: 'tocar', uri: f.uri, ...(d.tipo !== 'artist' ? { contexto: d.uri } : {}) }, `Tocando ${f.nome}.`)} />
          </>
        ) : d.tipo !== 'artist' && <p className="px-3 text-sm text-sp-texto3">Sem músicas para mostrar.</p>}
        {d.tipo === 'artist' && !d.faixas?.length && <p className="mx-3 mb-6 rounded-lg bg-sp-aviso p-4 text-sm text-sp-texto3">O Spotify não libera as mais tocadas do artista para apps em modo de desenvolvimento. O botão verde toca o artista.</p>}
        {d.albuns?.length > 0 && <div className="mt-6"><Fileira titulo="Discografia" itens={d.albuns} aoAbrir={abrir} aoTocar={(i) => cmd({ acao: 'tocar', uri: i.uri }, `Tocando ${i.nome}.`)} /></div>}
      </div>
    </div>
  )
}

function Rotinas({ rotinas, ares, podeControlar, setEditando, salvarRotinas, testar }) {
  return (
    <div className="px-3 pt-2">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight">Rotinas de música</h1><p className="text-sm text-sp-texto3">Tocam ou pausam sozinhas por horário ou quando um ar liga ou desliga. Rodam no agente do escritório (horário de Brasília).</p></div>
        {podeControlar && <button type="button" onClick={() => setEditando(NOVA())} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-black hover:scale-105"><Plus className="h-4 w-4" />Nova rotina</button>}
      </div>
      {rotinas == null ? <div className="h-24 animate-pulse rounded-lg bg-white/5" /> : rotinas.length ? (
        <ul className="divide-y divide-white/10 overflow-hidden rounded-lg bg-sp-cartao">
          {rotinas.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="w-12 shrink-0">{r.acao.capa ? <Capa src={r.acao.capa} /> : <span className="flex aspect-square w-full items-center justify-center rounded-md bg-sp-realce">{r.gatilho.tipo === 'horario' ? <CalendarClock className="h-5 w-5 text-sp-texto3" /> : r.gatilho.origem === 'alexa' ? <Mic className="h-5 w-5 text-sp-texto3" /> : <Zap className="h-5 w-5 text-sp-texto3" />}</span>}</span>
                <div className="min-w-0"><p className="truncate font-semibold">{r.nome}</p><p className="truncate text-[13px] text-sp-texto2">{descreverRotina(r, ares)}</p></div>
              </div>
              <div className="flex items-center gap-1.5">
                <Interruptor ligado={r.ativo} rotulo={`Ativar ${r.nome}`} disabled={!podeControlar} onChange={(v) => salvarRotinas(rotinas.map((x) => (x.id === r.id ? { ...x, ativo: v } : x)))} />
                <button type="button" disabled={!podeControlar} onClick={() => testar(r)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/30 px-3 text-xs font-semibold hover:border-white disabled:opacity-40"><Play className="h-3.5 w-3.5" />Testar</button>
                <button type="button" disabled={!podeControlar} onClick={() => setEditando(r)} className="rounded-full p-2 text-sp-texto3 hover:bg-white/10 hover:text-white" aria-label={`Editar ${r.nome}`}><Pencil className="h-4 w-4" /></button>
                <button type="button" disabled={!podeControlar} onClick={async () => await confirmar(`Apagar a rotina "${r.nome}"?`) && salvarRotinas(rotinas.filter((x) => x.id !== r.id))} className="rounded-full p-2 text-sp-texto3 hover:bg-white/10 hover:text-white" aria-label={`Apagar ${r.nome}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg bg-sp-cartao p-5 text-sm text-sp-texto3">
          <p className="mb-2 font-semibold text-white">Nenhuma rotina ainda</p>
          <ul className="list-disc space-y-1 pl-5"><li>Seg a sex, 08:30: tocar a playlist do escritório a 25% no Echo.</li><li>Quando o ar da sala de reunião ligar (9h às 18h): pausar a música.</li><li>Seg a sex, 18:00: pausar tudo.</li></ul>
          <p className="mt-3">Para automações com a Alexa, veja a aba <b className="text-white">Alexa</b>.</p>
        </div>
      )}
    </div>
  )
}

function Alexa({ echos, aparelhos, podeControlar, nova, modelosVoz, irRotinas }) {
  const echo = echos[0]?.nome || ''
  const modelos = [
    { titulo: 'Alexa ligou um ar: tocar música', texto: 'Quando alguém pedir à Alexa para ligar um ar, entre 8h e 18h, começa a tocar no Echo.', icone: Mic,
      dados: { nome: 'Alexa ligou o ar: música', gatilho: { tipo: 'ar_ligou', hora: null, dias: [1, 2, 3, 4, 5], aparelho_id: null, origem: 'alexa' }, janela: { inicio: '08:00', fim: '18:00' }, acao: { tipo: 'tocar', uri: null, nome: '', capa: '', aparelho_nome: echo, volume: 25, aleatorio: true } } },
    { titulo: 'Alexa desligou um ar: pausar', texto: 'Quando a Alexa desligar um ar, a música para.', icone: Pause,
      dados: { nome: 'Alexa desligou o ar: pausar', gatilho: { tipo: 'ar_desligou', hora: null, dias: [1, 2, 3, 4, 5], aparelho_id: null, origem: 'alexa' }, janela: { inicio: null, fim: null }, acao: { tipo: 'pausar', uri: null, nome: '', capa: '', aparelho_nome: '', volume: null, aleatorio: null } } },
    { titulo: 'Abertura do expediente no Echo', texto: 'Seg a sex, 08:00: toca no Echo em volume baixo.', icone: CalendarClock,
      dados: { nome: 'Abertura do expediente', gatilho: { tipo: 'horario', hora: '08:00', dias: [1, 2, 3, 4, 5], aparelho_id: null, origem: 'qualquer' }, janela: { inicio: null, fim: null }, acao: { tipo: 'tocar', uri: null, nome: '', capa: '', aparelho_nome: echo, volume: 20, aleatorio: true } } },
    { titulo: 'Fim do expediente: pausar', texto: 'Seg a sex, 18:00: pausa o que estiver tocando.', icone: Clock3,
      dados: { nome: 'Fim do expediente', gatilho: { tipo: 'horario', hora: '18:00', dias: [1, 2, 3, 4, 5], aparelho_id: null, origem: 'qualquer' }, janela: { inicio: null, fim: null }, acao: { tipo: 'pausar', uri: null, nome: '', capa: '', aparelho_nome: '', volume: null, aleatorio: null } } },
  ]
  return (
    <div className="space-y-6 px-3 pt-2">
      <div><h1 className="text-2xl font-bold tracking-tight">Alexa e música</h1><p className="text-sm text-sp-texto3">Os Echo tocam pelo Spotify Connect, e as rotinas daqui podem reagir aos pedidos de voz feitos à Alexa.</p></div>

      <section className="rounded-lg bg-sp-cartao p-5">
        <h2 className="mb-3 text-lg font-bold">Echo visíveis agora</h2>
        {echos.length ? (
          <ul className="flex flex-wrap gap-2">{echos.map((d) => <li key={d.id} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm ${d.ativo ? 'bg-sp-verde font-semibold text-black' : 'bg-white/[.07]'}`}><Speaker className="h-4 w-4" />{d.nome}{d.ativo && ' · tocando'}</li>)}</ul>
        ) : (
          <div className="text-sm text-sp-texto3">
            <p className="text-white">Nenhum Echo aparece no Spotify agora{aparelhos.length ? ` (o Spotify vê ${aparelhos.length} outro${aparelhos.length > 1 ? 's' : ''} aparelho${aparelhos.length > 1 ? 's' : ''})` : ''}.</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>No app Alexa: Mais, Configurações, Música e podcasts, Vincular novo serviço, Spotify. Entre com a mesma conta Spotify daqui ({'conta conectada no topo'}).</li>
              <li>Em Música e podcasts, Serviços padrão, escolha Spotify (assim "Alexa, toca jazz" já usa o Spotify).</li>
              <li>Peça uma vez "Alexa, toca Spotify" no Echo: depois disso ele aparece aqui e nas rotinas.</li>
            </ol>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3"><h2 className="text-lg font-bold">Automações prontas</h2><button type="button" onClick={irRotinas} className="text-sm font-semibold text-sp-texto3 hover:text-white hover:underline">Ver rotinas</button></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {modelos.map((m) => { const I = m.icone; return (
            <button key={m.titulo} type="button" disabled={!podeControlar} onClick={() => nova(m.dados)} className="flex items-start gap-4 rounded-lg bg-sp-cartao p-4 text-left transition-colors hover:bg-sp-realce disabled:opacity-50">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-sp-realce"><I className="h-5 w-5 text-sp-verde" /></span>
              <span className="min-w-0"><span className="block font-semibold">{m.titulo}</span><span className="mt-0.5 block text-[13px] text-sp-texto2">{m.texto}</span><span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-white"><Plus className="h-3.5 w-3.5" />Usar este modelo</span></span>
            </button>
          ) })}
        </div>
      </section>

      <section className="rounded-lg bg-sp-cartao p-5 text-sm text-sp-texto3">
        <h2 className="mb-2 text-lg font-bold text-white">Rotina no app Alexa (ar e música numa frase)</h2>
        <p>Os ares estão na Alexa pelo Sinric, então uma rotina do próprio app Alexa pode fazer as duas coisas juntas:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>App Alexa: Mais, Rotinas, +.</li>
          <li>Quando: Voz, por exemplo "Alexa, abrir o escritório".</li>
          <li>Ação: Casa inteligente, escolha o ar e "Ligar". Outra ação: Música e podcasts, "Spotify" e o que tocar, no Echo da sala.</li>
          <li>Salve. Ao falar a frase, o ar liga pelo sistema e a rotina "Alexa ligou um ar" daqui também pode agir.</li>
        </ol>
      </section>

      <MontadorFrase echos={echos.map((d) => d.nome)} />

      <div className="overflow-hidden rounded-lg [&_.cartao]:border-white/10 [&_.cartao]:bg-sp-cartao [&_.cartao]:text-white">
        <CatalogoVoz titulo="Frases de música para a Alexa" modelos={modelosVoz}
          rodape={<>Frases com "me acorda" criam um alarme no Echo; "em todos os dispositivos" usa o grupo de música da Alexa.</>} />
      </div>
    </div>
  )
}

// qualquer música, álbum ou artista do catálogo vira frase pronta para a Alexa
function MontadorFrase({ echos }) {
  const toast = useToast()
  const [q, setQ] = useState(''), [res, setRes] = useState(null), [item, setItem] = useState(null)
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined }
    const t = setTimeout(() => api.get(`/api/musica/buscar?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => toast(e.message, 'erro')), 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = res ? [...(res.tracks || []).slice(0, 4), ...(res.artists || []).slice(0, 2), ...(res.albums || []).slice(0, 2), ...(res.playlists || []).slice(0, 2)] : []
  const frases = item ? (() => {
    const onde = ['', ...echos.map((e) => ` no ${e}`)]
    const de = item.sub ? ` de ${item.sub.split(',')[0]}` : ''
    const base = item.tipo === 'track' ? [`toca ${item.nome}${de} no Spotify`, `adiciona ${item.nome} na fila`]
      : item.tipo === 'album' ? [`toca o álbum ${item.nome}${de} no Spotify`]
        : item.tipo === 'artist' ? [`toca ${item.nome} no Spotify`, `toca a rádio de ${item.nome}`]
          : [`toca a playlist ${item.nome} no Spotify`]
    return [...base.flatMap((b) => onde.map((o) => `Alexa, ${b}${o}`)), `Alexa, me acorda amanhã às 07:00 com ${item.nome}`]
  })() : []
  return (
    <section className="rounded-lg bg-sp-cartao p-5">
      <h2 className="text-lg font-bold">Qualquer música vira comando de voz</h2>
      <p className="mb-3 text-sm text-sp-texto3">Busque uma música, artista, álbum ou playlist e copie a frase pronta para falar com a Alexa.</p>
      <label className="relative block max-w-xl"><Search className="absolute left-3.5 top-3 h-4 w-4 text-sp-texto3" />
        <input value={q} onChange={(e) => { setQ(e.target.value); setItem(null) }} type="search" autoComplete="off" placeholder="Ex.: Tom Jobim" aria-label="Buscar para montar a frase"
          className="h-10 w-full rounded-full border border-transparent bg-sp-campo pl-10 pr-4 text-sm text-white placeholder:text-sp-texto2 focus:border-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" /></label>
      {!item && opcoes.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {opcoes.map((i) => (
            <button key={i.uri} type="button" onClick={() => setItem(i)} className="flex items-center gap-3 rounded-md p-2 text-left hover:bg-white/[.07]">
              <span className="w-10 shrink-0"><Capa src={i.capa} tipo={i.tipo} /></span>
              <span className="min-w-0"><span className="block truncate text-sm">{i.nome}</span><span className="block truncate text-xs text-sp-texto2">{TIPO[i.tipo]}{i.sub ? ` · ${i.sub}` : ''}</span></span>
            </button>
          ))}
        </div>
      )}
      {item && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-3"><span className="w-10 shrink-0"><Capa src={item.capa} tipo={item.tipo} /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.nome}</span><span className="block truncate text-xs text-sp-texto2">{TIPO[item.tipo]}</span></span><button type="button" onClick={() => setItem(null)} className="text-xs font-semibold text-sp-texto3 hover:text-white">Trocar</button></div>
          <ul>{frases.map((f) => <li key={f}><button type="button" onClick={() => navigator.clipboard?.writeText(f).then(() => toast('Frase copiada.'))} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/[.07]">"{f}"</button></li>)}</ul>
        </div>
      )}
    </section>
  )
}

function PainelLateral({ tipo, fechar, p, nav, cmd }) {
  const [fila, setFila] = useState(null), [erro, setErro] = useState('')
  useEffect(() => { if (tipo === 'fila') api.get('/api/musica/fila').then(setFila).catch((e) => setErro(e.message)) }, [tipo, p?.item?.uri])
  const aparelhos = p?.aparelhos || []
  return (
    <aside className="fixed inset-x-2 bottom-24 top-20 z-30 flex flex-col overflow-hidden rounded-lg bg-sp-base shadow-2xl md:static md:inset-auto md:w-[340px] md:shrink-0 md:shadow-none">
      <div className="flex items-center justify-between px-4 py-3"><h2 className="font-bold">{tipo === 'fila' ? 'Fila' : 'Conectar a um aparelho'}</h2><button type="button" onClick={fechar} aria-label="Fechar" className="rounded-full p-1.5 text-sp-texto3 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {tipo === 'fila' ? (erro ? <p className="px-2 text-sm text-sp-texto3">{erro}</p> : !fila ? <div className="h-24 animate-pulse rounded bg-white/5" /> : (
          <>
            <p className="px-2 pb-2 text-sm font-bold">Tocando agora</p>
            {fila.atual ? <FaixaPequena f={fila.atual} destaque /> : <p className="px-2 text-sm text-sp-texto3">Nada tocando.</p>}
            <p className="px-2 pb-2 pt-4 text-sm font-bold">A seguir</p>
            {fila.proximas.length ? fila.proximas.map((f, i) => <FaixaPequena key={`${f.uri}-${i}`} f={f} onClick={() => cmd({ acao: 'tocar', uri: f.uri })} />) : <p className="px-2 text-sm text-sp-texto3">A fila está vazia.</p>}
          </>
        )) : (
          <>
            {p?.aparelho && <div className="mb-3 rounded-lg bg-sp-verde/10 p-3"><p className="text-xs text-sp-verde">Aparelho atual</p><p className="flex items-center gap-2 font-bold text-sp-verde"><Volume2 className="h-4 w-4" />{p.aparelho.nome}</p></div>}
            <p className="px-2 pb-2 text-sm font-bold">Selecione outro aparelho</p>
            {aparelhos.filter((d) => !d.ativo).map((d) => { const I = d.id === nav.id ? Monitor : ICONE_APARELHO[d.tipo] || Speaker; return (
              <button key={d.id} type="button" disabled={d.restrito} onClick={() => cmd({ acao: 'transferir', device_id: d.id }, `Tocando em ${d.nome}.`)} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/[.07] disabled:opacity-40">
                <I className="h-6 w-6 shrink-0 text-sp-texto3" /><span className="min-w-0"><span className="block truncate">{d.nome}</span><span className="block text-xs text-sp-texto2">{d.id === nav.id ? 'Este navegador' : ehEcho(d) ? 'Echo / Alexa' : d.tipo}</span></span>
              </button>
            ) })}
            {!aparelhos.some((d) => d.id === nav.id) && nav.pronto && (
              <button type="button" onClick={() => cmd({ acao: 'transferir', device_id: nav.id }, 'Tocando neste navegador.')} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/[.07]"><Monitor className="h-6 w-6 text-sp-texto3" /><span><span className="block">Este navegador</span><span className="block text-xs text-sp-texto2">Painel Clima</span></span></button>
            )}
            {!aparelhos.length && !nav.pronto && <p className="px-2 text-sm text-sp-texto3">Nenhum aparelho visível. Abra o Spotify no celular ou no computador, ou peça "Alexa, toca Spotify" para o Echo aparecer aqui.</p>}
            {nav.erro && <p className="mx-2 mt-3 rounded-md bg-amber-500/10 p-3 text-xs text-amber-200">{nav.erro}</p>}
          </>
        )}
      </div>
    </aside>
  )
}

function FaixaPequena({ f, destaque, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-white/[.07] disabled:cursor-default">
      <span className="w-12 shrink-0"><Capa src={f.capa} /></span>
      <span className="min-w-0"><span className={`block truncate ${destaque ? 'text-sp-verde' : 'text-white'}`}>{f.nome}</span><span className="block truncate text-[13px] text-sp-texto2">{f.artistas}</span></span>
    </button>
  )
}

function BarraPlayer({ p, ocupado, cmd, ultimo, painel, setPainel, nav }) {
  const it = p?.item
  const prog = p?.progresso_ms != null && it ? Math.min(it.duracao_ms || 0, p.progresso_ms + (p.tocando ? Date.now() - ultimo.current : 0)) : null
  const pct = it?.duracao_ms && prog != null ? (prog / it.duracao_ms) * 100 : 0
  const vol = p?.aparelho?.volume
  const [volLocal, setVolLocal] = useState(null)
  const seek = (e) => { if (!it?.duracao_ms) return; const r = e.currentTarget.getBoundingClientRect(); cmd({ acao: 'posicao', posicao_ms: Math.round(((e.clientX - r.left) / r.width) * it.duracao_ms) }) }
  const VolI = (volLocal ?? vol) === 0 ? VolumeX : (volLocal ?? vol) < 50 ? Volume1 : Volume2
  const semAparelho = p && !p.aparelho
  return (
    <div className="sticky bottom-0 z-20 rounded-lg bg-sp-preto">
      {semAparelho && (
        <div className="mb-1 flex flex-wrap items-center gap-2 rounded-md bg-sp-verde px-4 py-1.5 text-sm font-medium text-black">
          <Speaker className="h-4 w-4" />
          {nav.pronto ? <>Nada tocando. O play vai tocar <b>neste navegador</b>, ou escolha outro aparelho.</> : nav.erro ? <span className="min-w-0 flex-1">{nav.erro}</span> : <>Nenhum aparelho do Spotify ativo. Abra o Spotify em algum aparelho ou escolha um Echo.</>}
        </div>
      )}
      {p?.aparelho && <div className="mb-1 hidden items-center justify-end gap-1.5 px-4 text-xs font-medium text-sp-verde md:flex"><Volume2 className="h-3.5 w-3.5" />Tocando em {p.aparelho.nome}</div>}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="w-14 shrink-0">{it ? <Capa src={it.capa} /> : <span className="flex aspect-square w-full items-center justify-center rounded-md bg-sp-realce"><Disc3 className={`h-6 w-6 text-sp-icone ${p?.tocando ? 'animate-spin [animation-duration:4s]' : ''}`} /></span>}</span>
          <div className="min-w-0"><p className="truncate text-sm font-medium text-white">{it?.nome || 'Nada tocando'}</p><p className="truncate text-xs text-sp-texto3">{it?.artistas || 'Escolha algo no Início ou em Buscar'}</p></div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-4 md:gap-5">
            <button type="button" disabled={ocupado} onClick={() => cmd({ acao: 'aleatorio', valor: !p?.aleatorio })} aria-pressed={!!p?.aleatorio} title="Aleatório" className={`hidden disabled:opacity-40 md:block ${p?.aleatorio ? 'text-sp-verde' : 'text-sp-texto3 hover:text-white'}`}><Shuffle className="h-4 w-4" /></button>
            <button type="button" disabled={ocupado} onClick={() => cmd({ acao: 'anterior' })} title="Anterior" className="hidden text-sp-texto3 hover:text-white disabled:opacity-40 md:block"><SkipBack className="h-5 w-5 fill-current" /></button>
            <button type="button" disabled={ocupado && !p} onClick={() => cmd({ acao: p?.tocando ? 'pausar' : 'tocar' })} title={p?.tocando ? 'Pausar' : 'Tocar'} aria-label={p?.tocando ? 'Pausar' : 'Tocar'} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black hover:scale-105 disabled:opacity-40">{p?.tocando ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>
            <button type="button" disabled={ocupado} onClick={() => cmd({ acao: 'proxima' })} title="Próxima" aria-label="Próxima" className="text-sp-texto3 hover:text-white disabled:opacity-40"><SkipForward className="h-5 w-5 fill-current" /></button>
            <button type="button" disabled={ocupado} onClick={() => cmd({ acao: 'repetir', valor: p?.repetir === 'off' ? 'context' : p?.repetir === 'context' ? 'track' : 'off' })} aria-pressed={p?.repetir && p.repetir !== 'off'} title="Repetir" className={`hidden disabled:opacity-40 md:block ${p?.repetir && p.repetir !== 'off' ? 'text-sp-verde' : 'text-sp-texto3 hover:text-white'}`}>{p?.repetir === 'track' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}</button>
          </div>
          <div className="hidden w-full max-w-xl items-center gap-2 text-[11px] tabular text-sp-texto2 md:flex">
            <span className="w-10 text-right">{fmt(prog)}</span>
            <button type="button" onClick={seek} disabled={!it || ocupado} aria-label="Posição da música" className="group flex h-3 flex-1 items-center">
              <span className="relative h-1 w-full rounded-full bg-sp-trilho"><span className="absolute inset-y-0 left-0 rounded-full bg-white group-hover:bg-sp-verde" style={{ width: `${pct}%` }} /></span>
            </button>
            <span className="w-10">{fmt(it?.duracao_ms)}</span>
          </div>
        </div>
        <div className="hidden items-center justify-end gap-3 md:flex">
          <button type="button" onClick={() => setPainel(painel === 'fila' ? null : 'fila')} aria-pressed={painel === 'fila'} title="Fila" className={painel === 'fila' ? 'text-sp-verde' : 'text-sp-texto3 hover:text-white'}><ListOrdered className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPainel(painel === 'aparelhos' ? null : 'aparelhos')} aria-pressed={painel === 'aparelhos'} title="Conectar a um aparelho" className={painel === 'aparelhos' || p?.aparelho ? 'text-sp-verde' : 'text-sp-texto3 hover:text-white'}><Speaker className="h-4 w-4" /></button>
          <VolI className="h-4 w-4 shrink-0 text-sp-texto3" />
          <input type="range" min="0" max="100" step="5" value={volLocal ?? vol ?? 50} disabled={ocupado || !p?.aparelho} aria-label="Volume"
            onChange={(e) => setVolLocal(+e.target.value)} onPointerUp={(e) => { cmd({ acao: 'volume', volume: +e.target.value }).then(() => setVolLocal(null)) }} onKeyUp={(e) => cmd({ acao: 'volume', volume: +e.target.value })}
            className="w-28 accent-sp-verde disabled:opacity-40" />
        </div>
        <button type="button" onClick={() => setPainel(painel === 'aparelhos' ? null : 'aparelhos')} className="text-sp-texto3 md:hidden" aria-label="Aparelhos"><Speaker className="h-5 w-5" /></button>
      </div>
      {it && <div className="mx-2 mb-1 h-0.5 overflow-hidden rounded-full bg-sp-trilho md:hidden"><div className="h-full bg-white" style={{ width: `${pct}%` }} /></div>}
    </div>
  )
}
