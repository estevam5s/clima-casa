import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LogoSpotify from '../components/LogoSpotify'
import { CalendarClock, Disc3, ExternalLink, KeyRound, ListMusic, LogOut, Music2, Pause, Pencil, Play, Plus, Repeat, Repeat1, Search, Shuffle, SkipBack, SkipForward, Smartphone, Speaker, Trash2, Tv, Volume2, Zap } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Esqueleto, Interruptor, Modal, useToast, confirmar } from '../components/ui'
import { DIAS_SEMANA } from '../mapaUtil'
import CatalogoVoz from '../components/CatalogoVoz'
import { modelosMusica } from '../vozAlexa'

// Música: Spotify ligado ao escritório. Player (o que toca, onde toca, volume), busca, playlists e rotinas que
// tocam ou pausam sozinhas por horário ou quando um ar liga/desliga. Os Echo da Alexa aparecem como aparelhos
// quando a conta Alexa tem o Spotify vinculado.
const ICONE_APARELHO = { Computer: Tv, Smartphone, Speaker, TV: Tv, CastAudio: Speaker, Automobile: Speaker }
const fmt = (ms) => (ms == null ? '--:--' : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`)

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
        <li>Abra <a className="text-primary hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> e entre com a conta Spotify do escritório.</li>
        <li>Clique em <b className="text-foreground">Create app</b>. Nome e descrição à sua escolha.</li>
        <li>Em <b className="text-foreground">Redirect URIs</b>, cole exatamente: <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{estado.redirect_uri}</code></li>
        <li>Em <b className="text-foreground">Which API/SDKs</b>, marque <b className="text-foreground">Web API</b>, aceite os termos e salve.</li>
        <li>Abra <b className="text-foreground">Settings</b>, copie o <b className="text-foreground">Client ID</b> e clique em <b className="text-foreground">View client secret</b> para copiar o segredo.</li>
        <li>Em <b className="text-foreground">User Management</b>, adicione o e-mail da conta Spotify que vai tocar (app em modo de desenvolvimento só aceita contas listadas ali).</li>
      </ol>
      <form onSubmit={salvar} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Client ID<input value={id} onChange={(e) => setId(e.target.value)} required minLength={20} className="campo mt-1 h-9 font-mono" autoComplete="off" spellCheck={false} /></label>
        <label className="text-xs text-muted-foreground">Client Secret<input type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" value={segredo} onChange={(e) => setSegredo(e.target.value)} required minLength={20} className="campo mt-1 h-9 font-mono" /></label>
        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{estado.configurado ? `App atual: ${estado.client_id}. Salvar outro troca o app e pede login de novo.` : 'O segredo fica cifrado no banco; ninguém vê depois de salvo.'}</p>
          <Botao type="submit" icone={KeyRound} carregando={salvando}>Salvar app</Botao>
        </div>
      </form>
    </div>
  )
}

function Player({ podeControlar }) {
  const toast = useToast()
  const [p, setP] = useState(null), [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const ultimo = useRef(0)
  // com erro (Spotify recusando, conta sem acesso), espera 1 min entre tentativas em vez de insistir a cada 5 s
  const falhou = useRef(0)
  const carregar = useCallback(() => api.get('/api/musica/tocando').then((x) => { setP(x); setErro(''); falhou.current = 0; ultimo.current = Date.now() }).catch((e) => { setErro(e.message); falhou.current = Date.now() }), [])
  useEffect(() => { carregar(); const t = setInterval(() => { if (!document.hidden && (!falhou.current || Date.now() - falhou.current > 60000)) carregar() }, 5000); return () => clearInterval(t) }, [carregar])
  // barra de progresso anda sozinha entre as atualizações
  const [, tique] = useState(0)
  useEffect(() => { const t = setInterval(() => tique((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  const cmd = async (corpo) => {
    setOcupado(true)
    try { setP(await api.post('/api/musica/comando', corpo)); ultimo.current = Date.now() } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  if (erro) return <Aviso tipo="alerta">{erro}</Aviso>
  if (!p) return <Esqueleto className="h-48" />
  const it = p.item, prog = p.progresso_ms != null ? Math.min(it?.duracao_ms || 0, p.progresso_ms + (p.tocando ? Date.now() - ultimo.current : 0)) : null
  const desab = ocupado || !podeControlar
  return (
    <div className="cartao overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="relative h-40 w-40 shrink-0 self-center overflow-hidden rounded-lg border border-border bg-muted sm:self-start">
          {it?.capa ? <img src={it.capa} alt="" className="h-full w-full object-cover" /> : <Disc3 className={`absolute inset-0 m-auto h-14 w-14 text-muted-foreground ${p.tocando ? 'animate-spin [animation-duration:4s]' : ''}`} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-xs text-muted-foreground">{p.tocando ? 'Tocando agora' : it ? 'Pausado' : 'Nada tocando'}{p.aparelho ? ` · ${p.aparelho.nome}` : ''}</p>
          <p className="mt-0.5 truncate text-lg font-semibold">{it?.nome || 'Escolha uma playlist abaixo ou abra o Spotify em algum aparelho'}</p>
          <p className="truncate text-sm text-muted-foreground">{[it?.artistas, it?.album].filter(Boolean).join(' · ')}</p>
          {it && (
            <div className="mt-3 flex items-center gap-2 text-[11px] tabular text-muted-foreground">
              <span className="w-9 text-right">{fmt(prog)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${it.duracao_ms ? (prog / it.duracao_ms) * 100 : 0}%` }} /></div>
              <span className="w-9">{fmt(it.duracao_ms)}</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button disabled={desab} onClick={() => cmd({ acao: 'aleatorio', valor: !p.aleatorio })} aria-pressed={!!p.aleatorio} title="Aleatório" className={`flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-40 ${p.aleatorio ? 'text-primary' : ''}`}><Shuffle className="h-4 w-4" /></button>
            <button disabled={desab} onClick={() => cmd({ acao: 'anterior' })} title="Anterior" className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-40"><SkipBack className="h-4 w-4" /></button>
            <button disabled={desab} onClick={() => cmd({ acao: p.tocando ? 'pausar' : 'tocar' })} title={p.tocando ? 'Pausar' : 'Tocar'} className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40">{p.tocando ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}</button>
            <button disabled={desab} onClick={() => cmd({ acao: 'proxima' })} title="Próxima" className="flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-40"><SkipForward className="h-4 w-4" /></button>
            <button disabled={desab} onClick={() => cmd({ acao: 'repetir', valor: p.repetir === 'off' ? 'context' : p.repetir === 'context' ? 'track' : 'off' })} aria-pressed={p.repetir !== 'off'} title="Repetir" className={`flex h-9 w-9 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-40 ${p.repetir !== 'off' ? 'text-primary' : ''}`}>{p.repetir === 'track' ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}</button>
            {p.aparelho && (
              <label className="ml-auto flex min-w-[10rem] flex-1 items-center gap-2 text-xs text-muted-foreground sm:flex-none">
                <Volume2 className="h-4 w-4 shrink-0" />
                <input type="range" min="0" max="100" step="5" defaultValue={p.aparelho.volume ?? 50} key={p.aparelho.id + (p.aparelho.volume ?? '')} disabled={desab}
                  onPointerUp={(e) => cmd({ acao: 'volume', volume: +e.target.value })} onKeyUp={(e) => cmd({ acao: 'volume', volume: +e.target.value })} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Volume" />
              </label>
            )}
          </div>
        </div>
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Onde tocar · {p.aparelhos.length} aparelho(s) do Spotify</p>
        {p.aparelhos.length ? (
          <div className="flex flex-wrap gap-2">
            {p.aparelhos.map((d) => { const I = ICONE_APARELHO[d.tipo] || Speaker; return (
              <button key={d.id} disabled={desab || d.ativo || d.restrito} onClick={() => cmd({ acao: 'transferir', device_id: d.id })}
                className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm ${d.ativo ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'} disabled:cursor-default`}>
                <I className="h-4 w-4" />{d.nome}{d.ativo && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              </button>
            ) })}
          </div>
        ) : <p className="text-sm text-muted-foreground">Nenhum aparelho visível. Abra o Spotify no celular, no computador ou peça “Alexa, toque Spotify” para o Echo aparecer aqui.</p>}
      </div>
    </div>
  )
}

function Escolher({ aoEscolher, rotulo = 'Tocar' }) {
  const toast = useToast()
  const [q, setQ] = useState(''), [res, setRes] = useState(null), [listas, setListas] = useState(null)
  useEffect(() => { api.get('/api/musica/playlists').then(setListas).catch(() => setListas([])) }, [])
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined }
    const t = setTimeout(() => api.get(`/api/musica/buscar?q=${encodeURIComponent(q.trim())}`).then(setRes).catch((e) => toast(e.message, 'erro')), 350)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const Linha = ({ i }) => (
    <button onClick={() => aoEscolher(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
      {i.capa ? <img src={i.capa} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted"><Music2 className="h-4 w-4 text-muted-foreground" /></span>}
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.nome}</span><span className="block truncate text-xs text-muted-foreground">{({ playlist: 'Playlist', track: 'Música', album: 'Álbum', artist: 'Artista' })[i.tipo] || ''}{i.sub ? ` · ${i.sub}` : i.faixas != null ? ` · ${i.faixas} faixas` : ''}</span></span>
      <span className="text-xs font-medium text-primary">{rotulo}</span>
    </button>
  )
  const grupos = res ? [['Playlists', res.playlists], ['Músicas', res.tracks], ['Álbuns', res.albums], ['Artistas', res.artists]] : [['Suas playlists', listas]]
  return (
    <div>
      <label className="relative mb-3 block"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar música, artista, álbum ou playlist" className="campo h-9 pl-8" aria-label="Buscar no Spotify" /></label>
      <div className="max-h-[22rem] space-y-3 overflow-auto">
        {grupos.map(([t, l]) => (
          <div key={t}><p className="mb-1 px-2 text-xs font-medium text-muted-foreground">{t}</p>
            {l == null ? <Esqueleto className="h-24" /> : l.length ? l.map((i) => <Linha key={i.uri} i={i} />) : <p className="px-2 text-sm text-muted-foreground">Nada aqui.</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// passo a passo de conexão (aberto enquanto não conectou; recolhido depois)
function PassoConexao({ redirect, aberto }) {
  const passos = [
    ['Confira o Redirect URI', <>Em <a className="text-primary hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com</a> → seu app → <b className="text-foreground">Settings</b>, o Redirect URI tem que ser exatamente <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{redirect}</code>, sem barra no final.</>],
    ['Libere a sua conta em User Management', <>No mesmo app, abra <b className="text-foreground">User Management</b> e adicione o nome e o e-mail da conta Spotify que vai tocar. Sem isso, o Spotify autoriza, mas bloqueia o acesso à conta (o painel avisa quando for esse o caso).</>],
    ['Conecte pelo navegador', <>Abra <b className="text-foreground">app.zynio.com.br/musica</b> no navegador em que você está logado no painel e clique em <b className="text-foreground">Conectar com o Spotify</b>.</>],
    ['Entre no Spotify e aceite', <>Você volta para esta tela com a mensagem <b className="text-foreground">“Spotify conectado”</b>. Se algo der errado, o motivo aparece aqui e fica registrado em Atividade.</>],
    ['Para tocar', <>A conta precisa ser <b className="text-foreground">Premium</b>. Os Echo aparecem como aparelhos quando o Spotify está vinculado no app Alexa (Mais → Configurações → Música e podcasts → Vincular novo serviço → Spotify). Se nenhum aparelho estiver ativo, o play usa o primeiro disponível.</>],
  ]
  return (
    <details className="cartao group" open={aberto}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5">
        <span><span className="titulo-secao">Passo a passo da conexão</span><span className="block text-xs text-muted-foreground">Spotify for Developers, User Management e login</span></span>
        <span className="text-xs text-muted-foreground group-open:hidden">Mostrar</span><span className="hidden text-xs text-muted-foreground group-open:inline">Esconder</span>
      </summary>
      <ol className="divide-y divide-border border-t border-border">
        {passos.map(([t, d], i) => (
          <li key={t} className="flex gap-3 px-5 py-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold tabular text-muted-foreground">{i + 1}</span>
            <div className="min-w-0"><p className="text-sm font-medium">{t}</p><p className="mt-0.5 text-sm text-muted-foreground">{d}</p></div>
          </li>
        ))}
      </ol>
    </details>
  )
}

// qualquer música, álbum ou artista do catálogo do Spotify vira comando de voz (é daí que vêm os milhões de frases)
function MontadorFrase({ echos, podeControlar }) {
  const toast = useToast()
  const [item, setItem] = useState(null)
  const frases = item ? (() => {
    const onde = ['', ...echos.map((e) => ` no ${e}`)]
    const base = item.tipo === 'track' ? [`toca ${item.nome}${item.sub ? ` de ${item.sub.split(',')[0]}` : ''} no Spotify`, `toca a música ${item.nome} no Spotify`, `adiciona ${item.nome} na fila`]
      : item.tipo === 'album' ? [`toca o álbum ${item.nome}${item.sub ? ` de ${item.sub.split(',')[0]}` : ''} no Spotify`]
        : item.tipo === 'artist' ? [`toca ${item.nome} no Spotify`, `toca as mais tocadas de ${item.nome}`, `toca a rádio de ${item.nome}`]
          : [`toca a playlist ${item.nome} no Spotify`]
    return [...base.flatMap((b) => onde.map((o) => `Alexa, ${b}${o}`)), `Alexa, me acorda amanhã às 07:00 com ${item.nome}`]
  })() : []
  const tocar = async () => { try { await api.post('/api/musica/comando', { acao: 'tocar', uri: item.uri }); toast(`Tocando ${item.nome}.`) } catch (e) { toast(e.message, 'erro') } }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao">Qualquer música vira comando</h2>
      <p className="mb-3 text-xs text-muted-foreground">O catálogo do Spotify tem mais de 100 milhões de músicas, e cada uma, cada álbum e cada artista dá para pedir à Alexa. Busque e copie a frase pronta.</p>
      <Escolher rotulo="Ver frases" aoEscolher={setItem} />
      {item && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-3">{item.capa && <img src={item.capa} alt="" className="h-10 w-10 rounded object-cover" />}<div className="min-w-0 flex-1"><p className="truncate font-medium">{item.nome}</p><p className="truncate text-xs text-muted-foreground">{item.sub}</p></div>{podeControlar && <Botao tamanho="sm" icone={Play} onClick={tocar}>Tocar agora</Botao>}</div>
          <ul className="space-y-0.5">{frases.map((f) => <li key={f}><button onClick={() => navigator.clipboard?.writeText(f).then(() => toast('Frase copiada.'))} className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted">“{f}”</button></li>)}</ul>
        </div>
      )}
    </section>
  )
}

const NOVA = () => ({ id: `r-${Date.now().toString(36)}`, nome: '', ativo: true, gatilho: { tipo: 'horario', hora: '08:30', dias: [1, 2, 3, 4, 5], aparelho_id: null }, janela: { inicio: null, fim: null }, acao: { tipo: 'tocar', uri: null, nome: '', capa: '', aparelho_nome: '', volume: 30, aleatorio: true } })

function EditorRotina({ inicial, ares, aparelhosSpotify, onSalvar, onFechar }) {
  const [r, setR] = useState(inicial)
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
              <div className="flex gap-1">{[1, 2, 3, 4, 5, 6, 0].map((d) => { const on = g.dias.includes(d); return <button key={d} type="button" aria-pressed={on} onClick={() => mg('dias', on ? g.dias.filter((x) => x !== d) : [...g.dias, d])} className={`h-9 w-10 rounded-md border text-xs ${on ? 'border-transparent bg-primary font-medium text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>{DIAS_SEMANA[d]}</button> })}</div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground sm:col-span-1">Ar<select value={g.aparelho_id ?? ''} onChange={(e) => mg('aparelho_id', e.target.value ? +e.target.value : null)} className="campo mt-1 h-9"><option value="">Qualquer ar</option>{ares.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
              <label className="text-xs text-muted-foreground">Só entre<input type="time" value={r.janela.inicio || ''} onChange={(e) => setR({ ...r, janela: { ...r.janela, inicio: e.target.value || null } })} className="campo mt-1 h-9" /></label>
              <label className="text-xs text-muted-foreground">e<input type="time" value={r.janela.fim || ''} onChange={(e) => setR({ ...r, janela: { ...r.janela, fim: e.target.value || null } })} className="campo mt-1 h-9" /></label>
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
            escolhendo ? <Escolher rotulo="Escolher" aoEscolher={(i) => { setR((x) => ({ ...x, acao: { ...x.acao, uri: i.uri, nome: i.nome, capa: i.capa || '' } })); setEscolhendo(false) }} />
              : (
                <button type="button" onClick={() => setEscolhendo(true)} className="mb-3 flex w-full items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-left hover:bg-muted">
                  {a.capa ? <img src={a.capa} alt="" className="h-10 w-10 rounded object-cover" /> : <ListMusic className="h-5 w-5 text-muted-foreground" />}
                  <span className="flex-1">{a.uri ? <><b>{a.nome}</b><span className="block text-xs text-muted-foreground">Toque para trocar</span></> : 'Escolher playlist, álbum, artista ou música'}</span>
                </button>
              )
          )}
          {!escolhendo && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground sm:col-span-2">Aparelho<input list="aparelhos-spotify" value={a.aparelho_nome} onChange={(e) => ma('aparelho_nome', e.target.value)} className="campo mt-1 h-9" placeholder="O que estiver ativo" />
                <datalist id="aparelhos-spotify">{aparelhosSpotify.map((d) => <option key={d.id} value={d.nome} />)}</datalist></label>
              {(a.tipo === 'tocar' || a.tipo === 'volume') && <label className="text-xs text-muted-foreground">Volume {a.volume ?? '—'}%<input type="range" min="0" max="100" step="5" value={a.volume ?? 30} onChange={(e) => ma('volume', +e.target.value)} className="mt-3 w-full accent-[hsl(var(--primary))]" /></label>}
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
  const quando = g.tipo === 'horario' ? `Às ${g.hora} · ${g.dias.length === 7 ? 'todo dia' : [...g.dias].sort().map((d) => DIAS_SEMANA[d]).join(', ')}`
    : `Quando ${g.aparelho_id ? ares.find((x) => x.id === g.aparelho_id)?.nome || 'um ar' : 'qualquer ar'} ${g.tipo === 'ar_ligou' ? 'ligar' : 'desligar'}${r.janela?.inicio && r.janela?.fim ? ` (${r.janela.inicio}–${r.janela.fim})` : ''}`
  const a = r.acao
  const faz = a.tipo === 'tocar' ? `tocar ${a.nome || 'música'}${a.volume != null ? ` a ${a.volume}%` : ''}` : a.tipo === 'pausar' ? 'pausar' : a.tipo === 'volume' ? `volume em ${a.volume}%` : 'pular música'
  return `${quando} → ${faz}${a.aparelho_nome ? ` no ${a.aparelho_nome}` : ''}`
}

export default function Musica() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const admin = ['dono', 'admin'].includes(sessao?.papel)
  const podeControlar = !!sessao?.permissoes?.includes('aparelhos.controlar')
  const [estado, setEstado] = useState(null), [erro, setErro] = useState('')
  const [rotinas, setRotinas] = useState(null), [editando, setEditando] = useState(null)
  const [ares, setAres] = useState([]), [aparelhosSp, setAparelhosSp] = useState([])
  const [tocarModal, setTocarModal] = useState(false)
  const [minhasPl, setMinhasPl] = useState([])
  const voltou = useRef(false)

  const carregar = () => api.get('/api/musica/estado').then(setEstado).catch((e) => setErro(e.message))
  useEffect(() => { carregar(); api.get('/api/musica/rotinas').then(setRotinas).catch(() => setRotinas([])); api.get('/api/aparelhos').then((l) => setAres(Array.isArray(l) ? l : l.aparelhos || [])).catch(() => {}) }, [])
  // resultado da volta do login do Spotify (a troca do código é feita em main.jsx, assim que a página carrega)
  const [processando, setProcessando] = useState(() => !!window.__spotifyRetorno?.processando)
  useEffect(() => {
    const ver = () => {
      let x = window.__spotifyRetorno
      if (!x || x.processando) { try { x = JSON.parse(sessionStorage.getItem('spotify-retorno') || 'null') } catch { x = null } }
      if (!x || x.processando || voltou.current) return
      voltou.current = true; setProcessando(false)
      try { sessionStorage.removeItem('spotify-retorno') } catch { /* sem armazenamento */ }
      window.__spotifyRetorno = null
      if (x.ok) { toast(`Spotify conectado${x.conta ? `: ${x.conta}` : ''}.`); carregar() } else { toast(x.msg || 'Não deu para conectar o Spotify.', 'erro'); setErroLogin(x.msg || '') ; carregar() }
    }
    ver(); window.addEventListener('spotify-retorno', ver)
    return () => window.removeEventListener('spotify-retorno', ver)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [erroLogin, setErroLogin] = useState('')
  useEffect(() => { if (estado?.conectado) { api.get('/api/musica/tocando').then((p) => setAparelhosSp(p.aparelhos)).catch(() => {}); api.get('/api/musica/playlists').then(setMinhasPl).catch(() => {}) } }, [estado?.conectado])
  const modelosVoz = useMemo(() => modelosMusica({ playlists: minhasPl.map((p) => p.nome), echos: aparelhosSp.filter((d) => d.tipo === 'Speaker' || /echo|alexa/i.test(d.nome)).map((d) => d.nome) }), [minhasPl, aparelhosSp])

  const conectar = async () => { try { window.location.href = (await api.get('/api/musica/conectar')).url } catch (e) { toast(e.message, 'erro') } }
  const desconectar = async () => { if (!await confirmar('Desconectar a conta do Spotify? As rotinas param até conectar de novo.')) return; try { setEstado(await api.post('/api/musica/desconectar')) } catch (e) { toast(e.message, 'erro') } }
  const salvarRotinas = async (lista) => { try { setRotinas(await api.put('/api/musica/rotinas', lista)); return true } catch (e) { toast(e.message, 'erro'); return false } }
  const testar = async (r) => { try { await api.post('/api/musica/rotinas/testar', { id: r.id }); toast(`Rotina “${r.nome}” executada.`) } catch (e) { toast(e.message, 'erro') } }

  if (erro) return <Aviso>{erro}</Aviso>
  if (!estado) return <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-64" /></div>

  return (
    <div className="space-y-6">
      <Cabecalho titulo="Música" descricao="Spotify no escritório: o que toca, onde toca e rotinas que tocam ou pausam sozinhas por horário ou junto com os ares."
        acoes={estado.conectado ? (<>
          {podeControlar && <Botao icone={Play} onClick={() => setTocarModal(true)}>Tocar algo</Botao>}
          {admin && <Botao variante="secundario" icone={LogOut} onClick={desconectar}>Desconectar</Botao>}
        </>) : null} />

      {processando && <Aviso tipo="info">Concluindo o login do Spotify…</Aviso>}
      {erroLogin && !estado.conectado && <Aviso tipo="alerta">{erroLogin}</Aviso>}
      {estado.conectado ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {estado.conta?.foto ? <img src={estado.conta.foto} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted"><Music2 className="h-4 w-4" /></span>}
            <span className="flex items-center gap-1.5"><LogoSpotify className="h-5 w-5" /><b>{estado.conta?.nome || 'Conta Spotify'}</b> <span className="text-muted-foreground">· Spotify {estado.conta?.produto === 'premium' ? 'Premium' : estado.conta?.produto || ''}</span></span>
            {estado.conta?.produto && estado.conta.produto !== 'premium' && <span className="text-xs text-amber-600 dark:text-amber-400">Sem Premium o Spotify não deixa controlar a reprodução por aqui.</span>}
          </div>
          <Player podeControlar={podeControlar} />

          <section className="cartao">
            <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-3.5">
              <div><h2 className="titulo-secao">Rotinas de música</h2><p className="text-xs text-muted-foreground">Rodam no agente do Mac, junto com a Agenda (horário de Brasília)</p></div>
              {podeControlar && <Botao tamanho="sm" icone={Plus} onClick={() => setEditando(NOVA())}>Nova rotina</Botao>}
            </div>
            {rotinas == null ? <Esqueleto className="m-5 h-24" /> : rotinas.length ? (
              <ul className="divide-y divide-border">
                {rotinas.map((r) => (
                  <li key={r.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {r.acao.capa ? <img src={r.acao.capa} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">{r.gatilho.tipo === 'horario' ? <CalendarClock className="h-4 w-4" /> : <Zap className="h-4 w-4" />}</span>}
                      <div className="min-w-0"><p className="truncate font-medium">{r.nome}</p><p className="truncate text-xs text-muted-foreground">{descreverRotina(r, ares)}</p></div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Interruptor ligado={r.ativo} rotulo={`Ativar ${r.nome}`} disabled={!podeControlar} onChange={(v) => salvarRotinas(rotinas.map((x) => (x.id === r.id ? { ...x, ativo: v } : x)))} />
                      <Botao tamanho="sm" variante="secundario" icone={Play} disabled={!podeControlar} onClick={() => testar(r)}>Testar</Botao>
                      <button disabled={!podeControlar} onClick={() => setEditando(r)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={`Editar ${r.nome}`}><Pencil className="h-4 w-4" /></button>
                      <button disabled={!podeControlar} onClick={async () => await confirmar(`Apagar a rotina “${r.nome}”?`) && salvarRotinas(rotinas.filter((x) => x.id !== r.id))} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label={`Apagar ${r.nome}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-6 text-sm text-muted-foreground">
                <p className="mb-2">Nenhuma rotina ainda. Ideias:</p>
                <ul className="list-disc space-y-1 pl-5"><li>Seg a sex, 08:30: tocar a playlist do escritório a 25% no Echo da recepção.</li><li>Quando o ar da sala de reunião ligar (09h–18h): pausar a música.</li><li>Seg a sex, 18:00: pausar tudo.</li></ul>
              </div>
            )}
          </section>

          <CatalogoVoz titulo="Comandos de voz de música" modelos={modelosVoz}
            rodape={<>Para a Alexa tocar pelo Spotify sem dizer “no Spotify”: app Alexa → Mais → Configurações → Música e podcasts → Serviços padrão → Spotify. Frases com “me acorda” criam um alarme no Echo; “em todos os dispositivos” usa o grupo de música da Alexa.</>} />
          <MontadorFrase echos={aparelhosSp.map((d) => d.nome)} podeControlar={podeControlar} />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {admin ? <Configurar estado={estado} aoMudar={setEstado} /> : <Aviso tipo="alerta">O Spotify ainda não foi conectado. Peça ao dono ou a um administrador.</Aviso>}
          <div className="cartao p-5">
            <h2 className="titulo-secao">2. Conectar a conta</h2>
            <p className="mt-2 text-sm text-muted-foreground">Depois de salvar o app, entre com a conta Spotify. Para controlar a reprodução, ela precisa ser <b className="text-foreground">Premium</b>.</p>
            <Botao className="mt-4 w-full" icone={ExternalLink} disabled={!estado.configurado || !admin} onClick={conectar}><span className="inline-flex items-center gap-2"><LogoSpotify className="h-4 w-4" />Conectar com o Spotify</span></Botao>
            <h3 className="mt-6 text-sm font-semibold">E a Alexa?</h3>
            <p className="mt-1 text-sm text-muted-foreground">No app Alexa: Mais → Configurações → Música e podcasts → Vincular novo serviço → Spotify. Assim os Echo aparecem como aparelhos aqui e as rotinas podem tocar neles.</p>
          </div>
        </div>
      )}

      <PassoConexao redirect={estado.redirect_uri} aberto={!estado.conectado} />

      {editando && <EditorRotina inicial={editando} ares={ares} aparelhosSpotify={aparelhosSp} onFechar={() => setEditando(null)}
        onSalvar={async (r) => { const lista = rotinas.some((x) => x.id === r.id) ? rotinas.map((x) => (x.id === r.id ? r : x)) : [...rotinas, r]; if (await salvarRotinas(lista)) { setEditando(null); toast('Rotina salva.') } }} />}
      {tocarModal && (
        <Modal aberto titulo="Tocar no Spotify" onFechar={() => setTocarModal(false)} largura="max-w-xl">
          <Escolher aoEscolher={async (i) => { try { await api.post('/api/musica/comando', { acao: 'tocar', uri: i.uri }); toast(`Tocando ${i.nome}.`); setTocarModal(false) } catch (e) { toast(e.message, 'erro') } }} />
        </Modal>
      )}
    </div>
  )
}
