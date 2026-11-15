import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Blinds, Eye, Footprints, PenLine, Power, Trash2, UserRound, Video, X } from 'lucide-react'
import { ITEM } from '../catalogoMapa'
import { DIAS_SEMANA, girarPonto, situacaoExpediente } from '../mapaUtil'

// Cartões que abrem ao clicar em algo no 3D: persiana da janela, item eletrônico, pessoa (com controle em
// 1ª/3ª pessoa), escrita no vidro e o rascunho de uma escrita nova. Ficam dentro da área do 3D (funcionam em tela cheia).
const CANETAS = [['azul', '#1d4ed8', 'Azul'], ['preto', '#111827', 'Preta'], ['vermelho', '#dc2626', 'Vermelha']]
const caixaCls = 'absolute bottom-14 left-3 z-10 w-[min(21rem,calc(100%-1.5rem))] rounded-lg border border-border bg-card/95 p-3 text-sm shadow-lg backdrop-blur'
const btn = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-50'
const btnPri = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50'

function Topo({ icone: I, titulo, sub, fechar }) {
  return (
    <div className="mb-2 flex items-start gap-2">
      {I && <I className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{titulo}</p>{sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}</div>
      <button onClick={fechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar cartão"><X className="h-4 w-4" /></button>
    </div>
  )
}

export function CartaoMapa({ mapa, projetos, cartao, fechar, acoes, perm, ocupado, executar, controlar }) {
  const [valor, setValor] = useState(null)
  useEffect(() => setValor(null), [cartao])
  if (!cartao) return null
  const salaDe = (e) => { const [x, y] = girarPonto(e, e.w / 2, e.h / 2); const dentro = (s, m) => s && x > s.x - m && x < s.x + s.w + m && y > s.y - m && y < s.y + s.h + m; return projetos.find((p) => dentro(mapa.salas[p.id], 0)) || projetos.filter((p) => dentro(mapa.salas[p.id], 12)).sort((a, b) => mapa.salas[a.id].w * mapa.salas[a.id].h - mapa.salas[b.id].w * mapa.salas[b.id].h)[0] }

  if (cartao.tipo === 'janela') {
    const el = mapa.elementos.find((e) => e.id === cartao.id)
    if (!el) return null
    const atual = Number.isFinite(+el.aberta) ? +el.aberta : 42, v = valor ?? atual
    const mudar = (n) => executar(() => acoes.persiana(el.id, n))
    return (
      <div className={caixaCls}>
        <Topo icone={Blinds} titulo="Persiana" sub={`Janela · ${salaDe(el)?.nome || 'escritório'}`} fechar={fechar} />
        <p className="mb-2 text-xs text-muted-foreground">Deseja abrir ou fechar a persiana? Agora está {atual === 0 ? 'fechada' : atual >= 95 ? 'aberta' : `${atual}% aberta`}.</p>
        <div className="mb-2 grid grid-cols-3 gap-1.5">
          <button disabled={ocupado || !perm.controlar} onClick={() => mudar(0)} className={atual === 0 ? btnPri : btn}>Fechar</button>
          <button disabled={ocupado || !perm.controlar} onClick={() => mudar(50)} className={atual === 50 ? btnPri : btn}>Meia</button>
          <button disabled={ocupado || !perm.controlar} onClick={() => mudar(100)} className={atual >= 95 ? btnPri : btn}>Abrir</button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="w-16">Abertura</span>
          <input type="range" min="0" max="100" step="5" value={v} disabled={ocupado || !perm.controlar} onChange={(e) => setValor(+e.target.value)}
            onPointerUp={() => valor !== null && valor !== atual && mudar(valor)} onKeyUp={() => valor !== null && valor !== atual && mudar(valor)} className="flex-1 accent-[hsl(var(--primary))]" aria-label="Abertura da persiana" />
          <span className="w-9 text-right tabular-nums">{v}%</span>
        </label>
        {!perm.controlar && <p className="mt-2 text-xs text-muted-foreground">Sua conta não pode mexer nos itens do mapa.</p>}
      </div>
    )
  }

  if (cartao.tipo === 'item') {
    const el = mapa.elementos.find((e) => e.id === cartao.id)
    if (!el) return null
    const cat = ITEM[el.tipo] || {}, I = cat.icone || Power, ligado = el.ligado !== false
    return (
      <div className={caixaCls}>
        <Topo icone={I} titulo={el.rotulo || cat.nome || el.tipo} sub={`${el.modelo || cat.modelos?.[0] || ''} · ${salaDe(el)?.nome || 'escritório'}`} fechar={fechar} />
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Estado</p><p className={`font-medium ${ligado ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{ligado ? 'Ligado' : 'Desligado'}</p></div>
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Cor</p><p className="flex items-center gap-1 font-medium"><span className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: el.cor || cat.cor || '#ccc' }} />{el.cor ? 'própria' : 'padrão'}</p></div>
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Tamanho</p><p className="font-medium tabular-nums">{Math.round(el.w)}×{Math.round(el.h)} cm</p></div>
        </div>
        {cat.desc && <p className="mb-2 text-xs text-muted-foreground">{cat.desc}</p>}
        <button disabled={ocupado || !perm.controlar} onClick={() => executar(() => acoes.ligarItem(el.id, !ligado))} className={ligado ? btn : btnPri}><Power className="h-3.5 w-3.5" />{ligado ? 'Desligar' : 'Ligar'}</button>
        <p className="mt-2 text-[11px] text-muted-foreground">Item do mapa: liga e desliga só o desenho 3D, não um aparelho de verdade. Modelo, cor e lugar mudam em Editar planta.</p>
      </div>
    )
  }

  if (cartao.tipo === 'pessoa' || cartao.tipo === 'generico') {
    const p = cartao.tipo === 'pessoa' ? (mapa.pessoas || []).find((x) => x.id === cartao.id) : null
    if (cartao.tipo === 'pessoa' && !p) return null
    const sala = p && projetos.find((x) => String(x.id) === String(p.sala))
    return (
      <div className={caixaCls}>
        <Topo icone={UserRound} titulo={p ? p.nome : 'Pessoa sem cadastro'} sub={p ? [p.cargo, sala?.nome].filter(Boolean).join(' · ') : 'Dê nome e cargo para aparecer na equipe'} fechar={fechar} />
        {p && (
          <div className="mb-3 rounded-md border border-border p-2 text-xs">
            <p className="font-medium">{situacaoExpediente(p)}</p>
            <p className="text-muted-foreground">{p.inicio}–{p.fim} · {(p.dias || []).slice().sort().map((d) => DIAS_SEMANA[d]).join(', ') || 'sem dias'}</p>
          </div>
        )}
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">Controlar</p>
        <div className="mb-2 grid grid-cols-2 gap-1.5">
          <button onClick={() => controlar(cartao, '1')} className={btn}><Eye className="h-3.5 w-3.5" />1ª pessoa</button>
          <button onClick={() => controlar(cartao, '3')} className={btn}><Video className="h-3.5 w-3.5" />3ª pessoa</button>
        </div>
        {perm.admin && (p
          ? <button onClick={() => acoes.editarPessoa(p.id)} className={`${btn} w-full`}><PenLine className="h-3.5 w-3.5" />Editar nome, cargo, expediente e aparência</button>
          : <button onClick={() => acoes.editarPessoa(null, { posto: cartao.posto, sala: cartao.sala, aparencia: cartao.ap })} className={`${btnPri} w-full`}><PenLine className="h-3.5 w-3.5" />Cadastrar com nome e cargo</button>)}
      </div>
    )
  }

  if (cartao.tipo === 'escrita') {
    const es = (mapa.escritas || []).find((x) => x.id === cartao.id)
    if (!es) return null
    const caneta = CANETAS.find((c) => c[0] === es.cor) || CANETAS[0]
    return (
      <div className={caixaCls}>
        <Topo icone={PenLine} titulo="Escrita no vidro" sub={`Caneta ${caneta[2].toLowerCase()}${es.autor ? ` · ${es.autor}` : ''}`} fechar={fechar} />
        <p className="mb-3 whitespace-pre-wrap break-words rounded-md border border-border p-2 text-base" style={{ color: caneta[1], fontFamily: '"Bradley Hand", "Segoe Print", "Chalkboard SE", cursive' }}>{es.texto}</p>
        {perm.admin && (
          <div className="flex gap-1.5">
            <button onClick={() => acoes.editarEscrita(es)} className={btn}><PenLine className="h-3.5 w-3.5" />Editar</button>
            <button disabled={ocupado} onClick={() => executar(async () => { await acoes.salvarEscritas((mapa.escritas || []).filter((x) => x.id !== es.id)); fechar() })} className={btn}><Trash2 className="h-3.5 w-3.5" />Apagar</button>
          </div>
        )}
      </div>
    )
  }
  return null
}

export function RascunhoEscrita({ mapa, rascunho, setRascunho, acoes, ocupado, executar }) {
  if (!rascunho) return null
  const salvar = () => executar(async () => {
    const { novo, ...es } = rascunho
    const lista = (mapa.escritas || []).filter((x) => x.id !== es.id)
    await acoes.salvarEscritas([...lista, { ...es, texto: es.texto.trim() }])
    setRascunho(null)
  })
  return (
    <div className={caixaCls}>
      <Topo icone={PenLine} titulo={rascunho.novo ? 'Escrever no vidro' : 'Editar escrita'} sub={`Altura ${rascunho.altura.toFixed(2).replace('.', ',')} m · lado de quem escreve`} fechar={() => setRascunho(null)} />
      <textarea autoFocus rows={3} maxLength={160} value={rascunho.texto} onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
        placeholder="Ex.: Reunião 15h · trocar filtro do ar" className="campo mb-2 min-h-[4.5rem] w-full resize-none py-2 text-base"
        style={{ color: CANETAS.find((c) => c[0] === rascunho.cor)?.[1], fontFamily: '"Bradley Hand", "Segoe Print", "Chalkboard SE", cursive' }} />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {CANETAS.map(([k, cor, nome]) => (
          <button key={k} onClick={() => setRascunho({ ...rascunho, cor: k })} className={`${btn} ${rascunho.cor === k ? 'ring-2 ring-[hsl(var(--primary))]' : ''}`} aria-pressed={rascunho.cor === k}>
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: cor }} />{nome}
          </button>
        ))}
        <select value={rascunho.tamanho} onChange={(e) => setRascunho({ ...rascunho, tamanho: +e.target.value })} className="campo h-8 w-auto text-xs" aria-label="Tamanho da letra">
          <option value={1}>Letra pequena</option><option value={2}>Letra média</option><option value={3}>Letra grande</option><option value={4}>Letra enorme</option>
        </select>
      </div>
      <div className="flex justify-end gap-1.5">
        <button onClick={() => setRascunho(null)} className={btn}>Cancelar</button>
        <button disabled={ocupado || !rascunho.texto.trim()} onClick={salvar} className={btnPri}>Escrever</button>
      </div>
    </div>
  )
}

// barra do controle: quem está sendo controlado, câmera, dicas e setas na tela para toque
export function BarraControle({ controle, nome, mudarModo, sair, tecla }) {
  if (!controle) return null
  const toque = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const seta = (k, I, rot) => (
    <button key={k} aria-label={rot} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card/90 backdrop-blur active:bg-muted"
      onPointerDown={(e) => { e.preventDefault(); tecla(k, true) }} onPointerUp={() => tecla(k, false)} onPointerLeave={() => tecla(k, false)} onPointerCancel={() => tecla(k, false)}><I className="h-4 w-4" /></button>
  )
  return (
    <>
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 overflow-hidden rounded-lg border border-border bg-card/95 p-1 text-xs shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 px-2 font-medium"><Footprints className="h-3.5 w-3.5 text-primary" />{nome}</span>
        <button onClick={() => mudarModo('1')} className={`h-7 rounded-md px-2 ${controle.modo === '1' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted'}`}>1ª pessoa</button>
        <button onClick={() => mudarModo('3')} className={`h-7 rounded-md px-2 ${controle.modo === '3' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted'}`}>3ª pessoa</button>
        <button onClick={sair} className="h-7 rounded-md px-2 text-muted-foreground hover:bg-muted">Sair <kbd className="ml-0.5 text-[10px]">Esc</kbd></button>
      </div>
      {!toque && <p className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/45 px-2 py-1 text-[11px] text-white">W A S D andam · arraste para olhar · Shift corre · V troca a câmera</p>}
      {toque && (
        <div className="absolute bottom-14 left-3 z-10 grid grid-cols-3 gap-1">
          <span />{seta('w', ArrowUp, 'Andar para frente')}<span />
          {seta('q', ArrowLeft, 'Virar à esquerda')}{seta('s', ArrowDown, 'Andar para trás')}{seta('e', ArrowRight, 'Virar à direita')}
        </div>
      )}
    </>
  )
}
