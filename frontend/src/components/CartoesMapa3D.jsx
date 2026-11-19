import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Blinds, Coffee, DoorClosed, DoorOpen, Eye, Footprints, PaintBucket, PenLine, Power, Trash2, UserRound, Video, X } from 'lucide-react'
import { CORES_ITEM, ELETRONICOS, ITEM } from '../catalogoMapa'
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

  if (cartao.tipo === 'sala') {
    const p = projetos.find((x) => String(x.id) === String(cartao.id)), s = mapa.salas[cartao.id]
    if (!p || !s) return null
    const portas = mapa.elementos.filter((e) => e.tipo === 'porta' && salaDe(e)?.id === p.id)
    const aberta = portas.some((e) => (Number.isFinite(+e.aberta) ? +e.aberta : 50) >= 50)
    const corPorta = portas[0]?.cor || ''
    const mudar = (x) => executar(() => acoes.aparenciaSala(p.id, x))
    const linha = (rot, chave, campo, atual) => (
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={rot}>
        <span className="w-14 shrink-0 text-xs text-muted-foreground">{rot}</span>
        <button disabled={ocupado} onClick={() => mudar({ [campo]: '' })} className={`h-6 rounded-full border px-2 text-[11px] ${!atual ? 'ring-2 ring-[hsl(var(--primary))]' : 'border-border'}`}>Padrão</button>
        {(chave === 'porta' ? [['#111111', 'Preta'], ['#9c6b3f', 'Madeira'], ['#f5f5f4', 'Branca'], ['#64748b', 'Cinza']] : CORES_ITEM.slice(0, 5)).map(([c, n]) => (
          <button key={c} disabled={ocupado} onClick={() => mudar({ [campo]: c })} title={n} aria-label={n} role="radio" aria-checked={atual === c}
            className={`h-6 w-6 rounded-full border ${atual === c ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--card))]' : 'border-border'}`} style={{ background: c }} />
        ))}
        <input type="color" disabled={ocupado} defaultValue={atual || '#888888'} onChange={(e) => { clearTimeout(window.__corS); const v = e.target.value; window.__corS = setTimeout(() => mudar({ [campo]: v }), 500) }}
          className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent" aria-label={`${rot}: qualquer cor`} title="Qualquer cor" />
      </div>
    )
    return (
      <div className={caixaCls}>
        <Topo icone={PaintBucket} titulo={p.nome} sub={`Sala · ${portas.length ? `${portas.length} porta(s), ${aberta ? 'aberta' : 'fechada'}` : 'sem porta própria'}`} fechar={fechar} />
        {portas.length > 0 && (
          <button disabled={ocupado || !perm.controlar} onClick={() => mudar({ porta_aberta: !aberta })} className={`${aberta ? btn : btnPri} mb-3 w-full`}>
            {aberta ? <DoorClosed className="h-3.5 w-3.5" /> : <DoorOpen className="h-3.5 w-3.5" />}{aberta ? 'Fechar a porta' : 'Abrir a porta'}
          </button>
        )}
        {perm.editarSala ? (
          <div className="space-y-2">
            {linha('Chão', 'piso', 'piso', s.cor_piso || '')}
            {linha('Cadeiras', 'cadeira', 'cadeira', s.cor_cadeira || '')}
            {linha('Mesas', 'mesa', 'mesa', s.cor_mesa || '')}
            {portas.length > 0 && linha('Porta', 'porta', 'porta', corPorta)}
          </div>
        ) : <p className="text-xs text-muted-foreground">Sua conta não muda as cores das salas.</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">Vale só para o desenho 3D. Porta fechada não deixa ninguém passar.</p>
      </div>
    )
  }

  if (cartao.tipo === 'item' && mapa.elementos.find((e) => e.id === cartao.id)?.tipo === 'porta') {
    const el = mapa.elementos.find((e) => e.id === cartao.id)
    const aberta = (Number.isFinite(+el.aberta) ? +el.aberta : 50) >= 50
    return (
      <div className={caixaCls}>
        <Topo icone={aberta ? DoorOpen : DoorClosed} titulo="Porta" sub={`${salaDe(el)?.nome || 'escritório'} · ${aberta ? 'aberta' : 'fechada'}`} fechar={fechar} />
        <button disabled={ocupado || !perm.controlar} onClick={() => executar(() => acoes.persiana(el.id, aberta ? 0 : 100))} className={`${aberta ? btn : btnPri} mb-3 w-full`}>
          {aberta ? <DoorClosed className="h-3.5 w-3.5" /> : <DoorOpen className="h-3.5 w-3.5" />}{aberta ? 'Fechar a porta' : 'Abrir a porta'}
        </button>
        {perm.decorar && (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Cor da porta">
            <span className="w-10 text-xs text-muted-foreground">Cor</span>
            <button disabled={ocupado} onClick={() => executar(() => acoes.decorar(el.id, { cor: '' }))} className={`h-6 rounded-full border px-2 text-[11px] ${!el.cor ? 'ring-2 ring-[hsl(var(--primary))]' : 'border-border'}`}>Madeira</button>
            {[['#111111', 'Preta'], ['#f5f5f4', 'Branca'], ['#64748b', 'Cinza'], ['#1e3a5f', 'Azul']].map(([c, n]) => (
              <button key={c} disabled={ocupado} onClick={() => executar(() => acoes.decorar(el.id, { cor: c }))} title={n} aria-label={n} role="radio" aria-checked={el.cor === c}
                className={`h-6 w-6 rounded-full border ${el.cor === c ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--card))]' : 'border-border'}`} style={{ background: c }} />
            ))}
          </div>
        )}
        {!perm.controlar && <p className="mt-2 text-xs text-muted-foreground">Sua conta não pode mexer nos itens do mapa.</p>}
      </div>
    )
  }

  if (cartao.tipo === 'item') {
    const el = mapa.elementos.find((e) => e.id === cartao.id)
    if (!el) return null
    const cat = ITEM[el.tipo] || {}, I = cat.icone || Power, ligado = el.ligado !== false
    const eletronico = ELETRONICOS.includes(el.tipo)
    const nome = el.rotulo || cat.nome || ({ porta: 'Porta', mesa: 'Fileira de mesas', estacao: 'Mesa individual' })[el.tipo] || el.tipo
    const corAtual = el.cor || ''
    const decorar = (x) => executar(() => acoes.decorar(el.id, x))
    return (
      <div className={caixaCls}>
        <Topo icone={I} titulo={nome} sub={[el.modelo || (cat.modelos?.length > 1 ? cat.modelos[0] : ''), salaDe(el)?.nome || 'escritório'].filter(Boolean).join(' · ')} fechar={fechar} />
        <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Estado</p><p className={`font-medium ${eletronico && ligado ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{eletronico ? (ligado ? 'Ligado' : 'Desligado') : 'Móvel'}</p></div>
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Cor</p><p className="flex items-center gap-1 font-medium"><span className="inline-block h-3 w-3 rounded-full border border-border" style={{ background: corAtual || cat.cor || '#ccc' }} />{corAtual ? (CORES_ITEM.find((c) => c[0] === corAtual)?.[1] || corAtual) : 'padrão'}</p></div>
          <div className="rounded-md border border-border p-2"><p className="text-muted-foreground">Tamanho</p><p className="font-medium tabular-nums">{Math.round(el.w)}×{Math.round(el.h)} cm</p></div>
        </div>
        {cat.desc && <p className="mb-2 text-xs text-muted-foreground">{cat.desc}</p>}
        {perm.decorar && (
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Cor">
              <button disabled={ocupado} onClick={() => decorar({ cor: '' })} className={`h-6 rounded-full border px-2 text-[11px] ${!corAtual ? 'ring-2 ring-[hsl(var(--primary))]' : 'border-border'}`}>Padrão</button>
              {CORES_ITEM.map(([c, n]) => <button key={c} disabled={ocupado} onClick={() => decorar({ cor: c })} title={n} aria-label={n} role="radio" aria-checked={corAtual === c}
                className={`h-6 w-6 rounded-full border ${corAtual === c ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--card))]' : 'border-border'}`} style={{ background: c }} />)}
              <input type="color" disabled={ocupado} defaultValue={corAtual || '#888888'} onBlur={(e) => e.target.value !== corAtual && decorar({ cor: e.target.value })} onChange={(e) => { clearTimeout(window.__corT); const v = e.target.value; window.__corT = setTimeout(() => decorar({ cor: v }), 500) }}
                className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent" aria-label="Qualquer cor" title="Qualquer cor" />
            </div>
            {cat.modelos?.length > 1 && el.tipo !== 'monitor' && (
              <select disabled={ocupado} value={el.modelo || cat.modelos[0]} onChange={(e) => decorar({ modelo: e.target.value })} className="campo h-8 text-xs" aria-label="Modelo">{cat.modelos.map((m) => <option key={m}>{m}</option>)}</select>
            )}
          </div>
        )}
        {eletronico && <button disabled={ocupado || !perm.controlar} onClick={() => executar(() => acoes.ligarItem(el.id, !ligado))} className={ligado ? btn : btnPri}><Power className="h-3.5 w-3.5" />{ligado ? 'Desligar' : 'Ligar'}</button>}
        <p className="mt-2 text-[11px] text-muted-foreground">{eletronico ? 'Item do mapa: liga e desliga só o desenho 3D, não um aparelho de verdade. ' : ''}Lugar e tamanho mudam em Editar planta.</p>
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
        <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Nome</dt><dd>{p ? p.nome : 'Figurante (sem cadastro)'}</dd>
          {p && <><dt className="text-muted-foreground">Sexo</dt><dd>{p.sexo === 'masculino' ? 'Masculino' : p.sexo === 'feminino' ? 'Feminino' : 'Não informado'}</dd></>}
          {p && <><dt className="text-muted-foreground">Cargo</dt><dd>{p.cargo || 'Não informado'}</dd></>}
          {(sala || cartao.sala) && <><dt className="text-muted-foreground">Sala</dt><dd>{sala?.nome || projetos.find((x) => String(x.id) === String(cartao.sala))?.nome}</dd></>}
          {cartao.agora && <><dt className="text-muted-foreground">Agora</dt><dd>{cartao.agora}{cartao.tela ? ` · ${cartao.tela}` : ''}</dd></>}
        </dl>
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
export function BarraControle({ controle, nome, mudarModo, sair, sentar, cafe, tecla, elevador, carro, camCarro, andar = 9 }) {
  if (!controle) return null
  if (controle.dirigindo) {   // dentro do carro: os pedais e o volante ficam no PainelCarro
    return (
      <>
        <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card/95 p-1 text-xs shadow-lg backdrop-blur">
          <span className="flex max-w-[16rem] items-center gap-1.5 truncate px-2 font-medium" title={controle.dirigindo}><Footprints className="h-3.5 w-3.5 shrink-0 text-primary" />Dirigindo: {controle.dirigindo}</span>
          <button onClick={camCarro} className="h-7 rounded-md px-2 text-muted-foreground hover:bg-muted">Câmera <kbd className="ml-0.5 text-[10px]">C</kbd></button>
          <button onClick={carro} className="h-7 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90">Sair do carro <kbd className="ml-0.5 text-[10px] opacity-80">E</kbd></button>
          <button onClick={sair} className="h-7 rounded-md px-2 text-muted-foreground hover:bg-muted">Parar <kbd className="ml-0.5 text-[10px]">Esc</kbd></button>
        </div>
        {controle.aviso && <p className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-md bg-amber-500/90 px-2 py-1 text-[11px] text-white">{controle.aviso}</p>}
      </>
    )
  }
  const toque = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const seta = (k, I, rot) => (
    <button key={k} aria-label={rot} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card/90 backdrop-blur active:bg-muted"
      onPointerDown={(e) => { e.preventDefault(); tecla(k, true) }} onPointerUp={() => tecla(k, false)} onPointerLeave={() => tecla(k, false)} onPointerCancel={() => tecla(k, false)}><I className="h-4 w-4" /></button>
  )
  return (
    <>
      <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border border-border bg-card/95 p-1 text-xs shadow-lg backdrop-blur">
        <span className="flex items-center gap-1.5 px-2 font-medium"><Footprints className="h-3.5 w-3.5 text-primary" />{nome}</span>
        <button onClick={() => mudarModo('1')} className={`h-7 rounded-md px-2 ${controle.modo === '1' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted'}`}>1ª pessoa</button>
        <button onClick={() => mudarModo('3')} className={`h-7 rounded-md px-2 ${controle.modo === '3' ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted'}`}>3ª pessoa</button>
        {controle.elevador && !controle.sentado && (
          <button onClick={elevador} className="h-7 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90">
            {controle.elevador === 'terreo' ? `Subir ao ${andar}º andar` : 'Descer ao térreo'} <kbd className="ml-0.5 text-[10px] opacity-80">R</kbd>
          </button>
        )}
        {controle.carro && !controle.sentado && !controle.viajando && (
          <button onClick={carro} className="h-7 rounded-md bg-primary px-2 font-medium text-primary-foreground hover:opacity-90" title={controle.carro}>Entrar no carro <kbd className="ml-0.5 text-[10px] opacity-80">E</kbd></button>
        )}
        {!controle.viajando && <button onClick={sentar} className="h-7 rounded-md px-2 font-medium text-primary hover:bg-muted">{controle.sentado ? 'Levantar' : 'Sentar'} <kbd className="ml-0.5 text-[10px]">F</kbd></button>}
        {!controle.viajando && !controle.sentado && cafe && <button onClick={cafe} className="flex h-7 items-center gap-1 rounded-md px-2 font-medium text-primary hover:bg-muted"><Coffee className="h-3.5 w-3.5" />Café <kbd className="ml-0.5 text-[10px]">C</kbd></button>}
        <button onClick={sair} className="h-7 rounded-md px-2 text-muted-foreground hover:bg-muted">Sair <kbd className="ml-0.5 text-[10px]">Esc</kbd></button>
      </div>
      {controle.aviso && <p className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-md bg-amber-500/90 px-2 py-1 text-[11px] text-white">{controle.aviso}</p>}
      {!toque && <p className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/45 px-2 py-1 text-[11px] text-white">{controle.viajando ? 'Elevador em movimento…' : controle.sentado ? 'Trabalhando: F levanta · V troca a câmera' : controle.elevador ? 'Elevador aqui: R chama e leva ao outro andar · W A S D andam' : 'W A S D andam · Shift corre · F senta · C café (na copa) · R elevador · V câmera'}</p>}
      {toque && (
        <div className="absolute bottom-14 left-3 z-10 grid grid-cols-3 gap-1">
          <span />{seta('w', ArrowUp, 'Andar para frente')}<span />
          {seta('q', ArrowLeft, 'Virar à esquerda')}{seta('s', ArrowDown, 'Andar para trás')}{seta('e', ArrowRight, 'Virar à direita')}
        </div>
      )}
    </>
  )
}
