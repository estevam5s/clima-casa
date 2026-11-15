'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AirVent, Check, Cloud, Cpu, Maximize2, Mic, Minimize2, Pause, Play, RotateCcw, Smartphone, Subtitles, Volume2, VolumeX, X } from 'lucide-react'
import { APPS_URL, ENTRAR_URL, MARCA } from '@/lib/dados'
import { FALAS } from '@/lib/falas'
import NARRACAO from '@/lib/narracao.json'

// cada cena dura pelo menos o tempo da fala gravada + uma folga para a animação respirar
const duracao = (id, minimo) => Math.max(minimo, (NARRACAO.duracoes?.[id] || 0) + 1.1)

// Vídeo explicativo feito em código (sem arquivo de vídeo): 7 cenas animadas com as telas reais do sistema,
// legendas, capítulos, barra de progresso arrastável, tela cheia e narração em português pela voz do navegador.
// Leve (só CSS + algumas imagens), nítido em qualquer tela e fácil de atualizar quando o produto muda.
const CENAS = [
  { id: 'problema', capitulo: 'O problema', dur: duracao('problema', 6.5), fala: FALAS.problema },
  { id: 'gravar', capitulo: 'Grave o controle', dur: duracao('gravar', 7.5), fala: FALAS.gravar },
  { id: 'comandar', capitulo: 'Comande de qualquer lugar', dur: duracao('comandar', 8), fala: FALAS.comandar },
  { id: 'caminho', capitulo: 'Como o comando chega', dur: duracao('caminho', 7.5), fala: FALAS.caminho },
  { id: 'automatizar', capitulo: 'Agenda e automações', dur: duracao('automatizar', 7.5), fala: FALAS.automatizar },
  { id: 'acompanhar', capitulo: 'Relatórios e segurança', dur: duracao('acompanhar', 7.5), fala: FALAS.acompanhar },
  { id: 'comecar', capitulo: 'Comece agora', dur: duracao('comecar', 6), fala: FALAS.comecar },
]
const TOTAL = CENAS.reduce((s, c) => s + c.dur, 0)
const INICIO = CENAS.reduce((a, c, i) => [...a, i ? a[i - 1] + CENAS[i - 1].dur : 0], [])
const tempo = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function Ondas({ n = 3, className = '' }) {
  return <span className={`vx-ondas ${className}`} aria-hidden>{Array.from({ length: n }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.45}s` }} />)}</span>
}
function ArSplit({ ligado, temp = '23' }) {
  return (
    <div className={`vx-ar ${ligado ? 'ligado' : ''}`} aria-hidden>
      <span className="vx-ar-display">{ligado ? `${temp}°` : '--'}</span><span className="vx-ar-led" /><span className="vx-ar-grade" />
      {ligado && <span className="vx-ar-vento">{[0, 1, 2, 3].map((i) => <i key={i} style={{ animationDelay: `${i * 0.3}s` }} />)}</span>}
    </div>
  )
}

function Cena({ c }) {
  switch (c.id) {
    case 'problema': return (
      <div className="vx-cena vx-problema">
        <h3 className="vx-h">Ar comum <span>não tem Wi-Fi</span></h3>
        <div className="vx-palco">
          <ArSplit />
          <div className="vx-controle e1"><span /><span /><span /><span /><Ondas n={2} className="vx-ir" /></div>
          <div className="vx-nota e2">Só funciona com alguém na sala, apontando o controle</div>
        </div>
      </div>
    )
    case 'gravar': return (
      <div className="vx-cena vx-gravar">
        <h3 className="vx-h">Um transmissor <span>aprende o controle</span></h3>
        <div className="vx-palco">
          <div className="vx-controle mini"><span /><span /><span /><span /><Ondas n={3} className="vx-ir" /></div>
          <div className="vx-transmissor e1"><span className="vx-gravando">REC</span><Ondas n={3} /></div>
          <ul className="vx-botoes">
            {['Ligar', 'Frio 23°', 'Ventilação', 'Desligar'].map((b, i) => <li key={b} style={{ animationDelay: `${1.2 + i * 1.1}s` }}><Check size={16} />{b}<em>gravado</em></li>)}
          </ul>
        </div>
      </div>
    )
    case 'comandar': return (
      <div className="vx-cena vx-comandar">
        <h3 className="vx-h">Comande <span>de qualquer lugar</span></h3>
        <div className="vx-palco">
          <div className="vx-navegador e1"><div className="vx-barra"><i /><i /><i /><b>app.zynio.com.br</b></div><img src="/telas/painel.jpg" alt="" />
            <span className="vx-cursor" /><span className="vx-clique" /></div>
          <div className="vx-celular e2"><div className="vx-cel-tela"><small>Ar do escritório</small><strong>23°</strong><em>Frio · ligado agora</em><span className="vx-cel-botao">Desligar</span></div></div>
          <div className="vx-balao e3"><Mic size={16} />“Alexa, ligar o ar do escritório”</div>
        </div>
      </div>
    )
    case 'caminho': return (
      <div className="vx-cena vx-caminho">
        <h3 className="vx-h">Do clique ao ar <span>em cerca de 1 segundo</span></h3>
        <div className="vx-fluxo">
          {[[Smartphone, 'Você', 'painel, app ou voz'], [Cloud, 'Nuvem', 'valida e grava o comando'], [Cpu, 'Agente', 'no computador do escritório'], [AirVent, 'Ar', 'recebe o infravermelho']].map(([I, t, d], i) => (
            <div key={t} className="vx-no" style={{ animationDelay: `${0.3 + i * 0.5}s` }}><span className="vx-no-icone"><I size={26} /></span><strong>{t}</strong><small>{d}</small></div>
          ))}
          <span className="vx-trilha"><i /></span>
        </div>
      </div>
    )
    case 'automatizar': return (
      <div className="vx-cena vx-automatizar">
        <h3 className="vx-h">O ar no ponto <span>antes de você chegar</span></h3>
        <div className="vx-palco">
          <div className="vx-navegador e1"><div className="vx-barra"><i /><i /><i /><b>Automações</b></div><img src="/telas/automacoes.jpg" alt="" /></div>
          <ol className="vx-linha-tempo">
            {[['07:30', 'Liga a sala em 23°'], ['12:00', 'Modo econômico no almoço'], ['19:00', 'Desliga tudo'], ['4 h ligado', 'Avisa e sobe 1°']].map(([h, t], i) => (
              <li key={h} style={{ animationDelay: `${0.8 + i * 1}s` }}><b>{h}</b>{t}</li>
            ))}
          </ol>
        </div>
      </div>
    )
    case 'acompanhar': return (
      <div className="vx-cena vx-acompanhar">
        <h3 className="vx-h">Tudo medido <span>e protegido</span></h3>
        <div className="vx-palco">
          <div className="vx-navegador e1"><div className="vx-barra"><i /><i /><i /><b>Relatórios</b></div><img src="/telas/relatorios.jpg" alt="" /></div>
          <div className="vx-navegador vx-sobre e2"><div className="vx-barra"><i /><i /><i /><b>Segurança</b></div><img src="/telas/seguranca.jpg" alt="" /></div>
          <div className="vx-selos">{['Horas ligado', 'kWh e custo', 'PDF · Excel · Word', 'Firewall e bloqueios'].map((t, i) => <span key={t} style={{ animationDelay: `${1.2 + i * 0.6}s` }}>{t}</span>)}</div>
        </div>
      </div>
    )
    default: return (
      <div className="vx-cena vx-comecar">
        <img src="/icone.svg" alt="" className="vx-logo" />
        <h3 className="vx-h">{MARCA}</h3>
        <p className="vx-sub">O ar do escritório no ponto certo, pelo painel, pelo celular ou pela voz.</p>
        <div className="vx-ctas"><a href={ENTRAR_URL} className="vx-cta">Entrar no sistema</a><a href={APPS_URL} className="vx-cta sec">Baixar os apps</a></div>
      </div>
    )
  }
}

export function PlayerExplicativo({ autoplay = false, aoFechar }) {
  const [t, setT] = useState(0)
  const [tocando, setTocando] = useState(autoplay)
  const [legenda, setLegenda] = useState(true)
  const [voz, setVoz] = useState(true)
  const audio = useRef(null), audioCena = useRef(-1), semAudio = useRef(false)
  const [cheia, setCheia] = useState(false)
  const caixa = useRef(null), ult = useRef(null), cenaFalada = useRef(-1)
  const cena = Math.max(0, INICIO.findLastIndex((s) => t >= s))
  const c = CENAS[cena]

  useEffect(() => {
    if (!tocando) { ult.current = null; return undefined }
    let q
    const passo = (ts) => {
      if (ult.current != null) setT((x) => { const n = x + (ts - ult.current) / 1000; if (n >= TOTAL) { setTocando(false); return TOTAL } return n })
      ult.current = ts; q = requestAnimationFrame(passo)
    }
    q = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(q)
  }, [tocando])

  // narração gravada (Fish Audio, um MP3 por capítulo) sincronizada com o tempo do vídeo; se o áudio falhar, usa a voz do navegador
  useEffect(() => {
    if (!audio.current) {
      audio.current = new Audio(); audio.current.preload = 'auto'
      audio.current.addEventListener('error', () => { semAudio.current = true })
    }
    const el = audio.current, sintese = window.speechSynthesis
    if (!voz || !tocando) { el.pause(); sintese?.cancel(); cenaFalada.current = -1; return }
    const dentro = t - INICIO[cena]
    if (!semAudio.current) {
      if (audioCena.current !== cena) {
        audioCena.current = cena
        el.src = `/audio/narracao-${c.id}.mp3`
        el.currentTime = Math.max(0, dentro)
      } else if (Math.abs(el.currentTime - dentro) > 0.6 && dentro < (NARRACAO.duracoes?.[c.id] || 0)) el.currentTime = dentro
      if (el.paused && dentro < (NARRACAO.duracoes?.[c.id] || 99)) el.play().catch(() => { semAudio.current = true })
      return
    }
    if (!sintese || cenaFalada.current === cena) return
    cenaFalada.current = cena
    sintese.cancel()
    const u = new SpeechSynthesisUtterance(c.fala); u.lang = 'pt-BR'; u.rate = 1.04
    const v = sintese.getVoices().find((x) => /pt-BR/i.test(x.lang)); if (v) u.voice = v
    sintese.speak(u)
  }, [cena, voz, tocando, c.fala, c.id, t])
  useEffect(() => () => { audio.current?.pause(); window.speechSynthesis?.cancel() }, [])

  const ir = useCallback((s) => { setT(Math.max(0, Math.min(TOTAL - 0.01, s))); cenaFalada.current = -1; audioCena.current = -1 }, [])
  const alternar = useCallback(() => { if (t >= TOTAL) { ir(0); setTocando(true) } else setTocando((v) => !v) }, [t, ir])
  const telaCheia = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await caixa.current?.requestFullscreen() } catch { /* sem suporte */ }
  }
  useEffect(() => {
    const f = () => setCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  const tecla = (e) => {
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); alternar() }
    if (e.key === 'ArrowRight') ir(INICIO[Math.min(CENAS.length - 1, cena + 1)])
    if (e.key === 'ArrowLeft') ir(INICIO[Math.max(0, t - INICIO[cena] > 1.5 ? cena : cena - 1)])
    if (e.key === 'f') telaCheia()
    if (e.key === 'c') setLegenda((v) => !v)
    if (e.key === 'Escape' && aoFechar && !document.fullscreenElement) aoFechar()
  }
  const arrastar = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const mover = (ev) => ir(((ev.clientX - r.left) / r.width) * TOTAL)
    mover(e)
    const solta = () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', solta) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', solta)
  }

  return (
    <div ref={caixa} className={`vx ${tocando ? '' : 'pausado'} ${cheia ? 'cheia' : ''}`} tabIndex={0} onKeyDown={tecla} role="region" aria-label={`Vídeo: como funciona o ${MARCA}`}>
      <div className="vx-quadro" onClick={alternar}>
        <div className="vx-fundo" aria-hidden><span className="vx-brilho b1" /><span className="vx-brilho b2" /><span className="vx-grade" /></div>
        <div className="vx-capitulo" key={`cap${cena}`}><b>{String(cena + 1).padStart(2, '0')}</b>{c.capitulo}</div>
        <div key={c.id} className="vx-cena-caixa"><Cena c={c} /></div>
        {legenda && <p className="vx-legenda" key={`leg${cena}`} aria-live="polite">{c.fala}</p>}
        {!tocando && (
          <button className="vx-play-grande" onClick={(e) => { e.stopPropagation(); alternar() }} aria-label={t >= TOTAL ? 'Ver de novo' : 'Reproduzir'}>
            {t >= TOTAL ? <RotateCcw size={30} /> : <Play size={30} fill="currentColor" />}
          </button>
        )}
      </div>
      <div className="vx-controles">
        <button onClick={alternar} aria-label={tocando ? 'Pausar' : 'Reproduzir'}>{tocando ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
        <span className="vx-tempo">{tempo(t)} / {tempo(TOTAL)}</span>
        <div className="vx-progresso" onPointerDown={arrastar} role="slider" aria-label="Posição do vídeo" aria-valuemin={0} aria-valuemax={Math.round(TOTAL)} aria-valuenow={Math.round(t)} tabIndex={-1}>
          {CENAS.map((s, i) => (
            <span key={s.id} className="vx-seg" style={{ flex: s.dur }} title={s.capitulo}>
              <i style={{ width: `${Math.max(0, Math.min(1, (t - INICIO[i]) / s.dur)) * 100}%` }} />
            </span>
          ))}
        </div>
        <button onClick={() => setLegenda((v) => !v)} aria-pressed={legenda} aria-label="Legendas" className={legenda ? 'ativo' : ''}><Subtitles size={18} /></button>
        <button onClick={() => setVoz((v) => !v)} aria-pressed={voz} aria-label={voz ? 'Desligar narração' : 'Ligar narração'} className={voz ? 'ativo' : ''}>{voz ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        <button onClick={telaCheia} aria-label="Tela cheia">{cheia ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
        {aoFechar && <button onClick={aoFechar} aria-label="Fechar"><X size={18} /></button>}
      </div>
      <ol className="vx-capitulos">
        {CENAS.map((s, i) => (
          <li key={s.id}><button className={i === cena ? 'atual' : ''} onClick={() => { ir(INICIO[i]); setTocando(true) }}>
            <b>{String(i + 1).padStart(2, '0')}</b>{s.capitulo}<small>{tempo(INICIO[i])}</small></button></li>
        ))}
      </ol>
    </div>
  )
}

// Capa no lugar do antigo bloco de vídeo: abre o player numa janela por cima do site
export function VideoExplicativo({ capa = '/telas/painel.jpg' }) {
  const [aberto, setAberto] = useState(false)
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  useEffect(() => { document.documentElement.style.overflow = aberto ? 'hidden' : ''; return () => { document.documentElement.style.overflow = '' } }, [aberto])
  return (
    <div className="video-imagem vx-capa">
      <img src={capa} alt={`Painel do ${MARCA}`} />
      <div className="vx-capa-info"><span>Vídeo · {tempo(TOTAL)}</span><strong>Como o {MARCA} funciona</strong><small>7 capítulos, narrado, com legendas</small></div>
      <div className="play"><button onClick={() => setAberto(true)} aria-label="Assistir ao vídeo explicativo"><Play size={26} fill="currentColor" /></button></div>
      {montado && aberto && createPortal(
        <div className="vx-modal" onClick={() => setAberto(false)} role="dialog" aria-modal="true" aria-label="Vídeo explicativo">
          <div className="vx-modal-caixa" onClick={(e) => e.stopPropagation()}>
            <PlayerExplicativo autoplay aoFechar={() => setAberto(false)} />
          </div>
        </div>, document.body)}
    </div>
  )
}
