import { useEffect, useRef, useState } from 'react'
import { MousePointer2, RotateCcw, Trash2, Upload } from 'lucide-react'
import { MAX_CURSORES, PADRAO, lerCursores, salvarCursores, usePreferencias } from '../../preferencias'
import { MODELOS, cursorDeImagem, cursorEmbutido, lerArquivoCursor } from '../../cursores'
import { Botao, Interruptor, useToast } from '../ui'
import { clique } from '../../som'

const ESTILOS = [['anel_ponto', 'Anel com ponto'], ['anel', 'Só o anel'], ['ponto', 'Só o ponto'], ['mira', 'Mira'], ['quadrado', 'Quadrado'],
  ['bolha', 'Bolha de luz'], ['sem_ponteiro', 'Sem ponteiro'], ['nenhum', 'Nenhum (só efeitos)']]
const EFEITOS = [['rastro', 'Rastro', 'Deixa uma trilha que some aos poucos.'], ['brilho', 'Brilho', 'Halo de luz em volta do anel e do ponto.'],
  ['ondas', 'Ondas no clique', 'Um círculo se abre onde você clica.'], ['faiscas', 'Faíscas no clique', 'Partículas saltam do clique.'],
  ['magnetico', 'Magnético', 'O anel abraça o botão ou link sob o mouse.'], ['arco_iris', 'Arco-íris', 'A cor vai mudando sem parar.']]
const CORES = [['marca', 'Cor da marca'], ['contraste', 'Texto do tema'], ['branco', 'Inverte o fundo'], ['personalizada', 'Escolher cor']]

function Opcao({ ativo, onClick, children, titulo }) {
  return <button type="button" title={titulo} onClick={onClick} className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${ativo ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>{children}</button>
}

function Faixa({ rotulo, valor, sufixo = 'px', ...props }) {
  return (
    <label className="block">
      <span className="rotulo flex justify-between"><span>{rotulo}</span><span className="tabular text-muted-foreground">{valor}{sufixo}</span></span>
      <input type="range" value={valor} {...props} className="w-full accent-[hsl(var(--primary))]" />
    </label>
  )
}

// miniatura de um modelo (embutido ou enviado), desenhada do mesmo jeito que o cursor real
function Miniatura({ chave, item, cor }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let vivo = true
    const pegar = (css) => css?.normal?.match(/url\((.+?)\)/)?.[1] || ''
    if (item) cursorDeImagem(item, 40).then((c) => vivo && setSrc(pegar(c))).catch(() => {})
    else setSrc(pegar(cursorEmbutido(chave, 40, cor)))
    return () => { vivo = false }
  }, [chave, item, cor])
  return src ? <img src={src} alt="" className="h-8 w-8 object-contain" /> : <MousePointer2 className="h-5 w-5 text-muted-foreground" />
}

export default function ConfigCursor() {
  const [p, setP] = usePreferencias()
  const [meus, setMeus] = useState(lerCursores)
  const arquivo = useRef(null)
  const toast = useToast()
  const toque = typeof window !== 'undefined' && !window.matchMedia('(pointer: fine)').matches
  const calmo = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const efeitos = Array.isArray(p.cursor_efeitos) ? p.cursor_efeitos : []
  const corModelo = p.cursor_cor === 'personalizada' ? p.cursor_cor_hex : p.cursor_cor === 'branco' ? '#ffffff' : p.cursor_cor

  useEffect(() => { const ouvir = () => setMeus(lerCursores()); window.addEventListener('clima:preferencias', ouvir); return () => window.removeEventListener('clima:preferencias', ouvir) }, [])

  const enviar = async (e) => {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    if (meus.length >= MAX_CURSORES) { toast(`Limite de ${MAX_CURSORES} cursores. Apague um para enviar outro.`, 'erro'); return }
    try {
      const item = await lerArquivoCursor(a)
      const lista = [item, ...meus]
      salvarCursores(lista); setMeus(lista); setP({ cursor_modelo: `meu:${item.id}` })
      toast(`Cursor “${item.nome}” enviado e em uso.`)
    } catch (err) { toast(err.message === 'QuotaExceededError' ? 'Sem espaço no navegador para mais cursores.' : err.message, 'erro') }
  }
  const apagar = (id) => {
    const lista = meus.filter((c) => c.id !== id)
    salvarCursores(lista); setMeus(lista)
    if (p.cursor_modelo === `meu:${id}`) setP({ cursor_modelo: 'sistema' })
  }
  const mudarPonta = (id, ponta) => { const lista = meus.map((c) => (c.id === id ? { ...c, ponta } : c)); salvarCursores(lista); setMeus(lista) }
  const alternarEfeito = (k) => setP({ cursor_efeitos: efeitos.includes(k) ? efeitos.filter((x) => x !== k) : [...efeitos, k] })
  const restaurar = () => setP(Object.fromEntries(Object.entries(PADRAO).filter(([k]) => k.startsWith('cursor'))))

  return (
    <div className="space-y-6">
      <label className="flex items-center justify-between gap-4 text-sm">
        <span><span className="font-medium">Efeito do cursor</span><span className="block text-xs text-muted-foreground">Forma que acompanha o mouse, cresce sobre botões e links e encolhe no clique.</span></span>
        <Interruptor ligado={p.cursor} onChange={(v) => setP({ cursor: v })} rotulo="Efeito do cursor" />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
        <span><span className="font-medium">Som ao clicar</span><span className="block text-xs text-muted-foreground">Um clique curto e baixo em botões e links. Vale só neste navegador.</span></span>
        <span className="flex items-center gap-3">
          {p.som_clique && <input type="range" min={5} max={100} step={5} value={p.som_clique_volume ?? 35} onChange={(e) => setP({ som_clique_volume: +e.target.value })}
            onPointerUp={() => clique(p.som_clique_volume ?? 35)} aria-label="Volume do clique" className="w-28 accent-[hsl(var(--primary))]" />}
          <Interruptor ligado={p.som_clique} onChange={(v) => setP({ som_clique: v })} rotulo="Som ao clicar" />
        </span>
      </div>
      {(toque || calmo) && <p className="text-xs text-amber-600">{toque ? 'Este aparelho usa toque: o cursor só muda com mouse ou trackpad.' : 'O sistema está com “reduzir movimento” ligado: o efeito que segue o mouse fica desligado. O modelo do ponteiro continua valendo.'}</p>}

      <div className={p.cursor ? 'space-y-5' : 'pointer-events-none space-y-5 opacity-50'}>
        <div><p className="rotulo">Estilo</p>
          <div className="flex flex-wrap gap-2">{ESTILOS.map(([k, r]) => <Opcao key={k} ativo={p.cursor_estilo === k} onClick={() => setP({ cursor_estilo: k })}
            titulo={k === 'sem_ponteiro' ? 'Esconde a seta do sistema: fica só o anel com o ponto' : undefined}>{r}</Opcao>)}</div>
          {p.cursor_estilo === 'sem_ponteiro' && <p className="ajuda">A seta do sistema some em todo o sistema. Ela volta sozinha em campos de texto.</p>}
        </div>
        <div><p className="rotulo">Cor</p>
          <div className="flex flex-wrap items-center gap-2">{CORES.map(([k, r]) => <Opcao key={k} ativo={p.cursor_cor === k} onClick={() => setP({ cursor_cor: k })}>{r}</Opcao>)}
            {p.cursor_cor === 'personalizada' && <input type="color" value={p.cursor_cor_hex} onChange={(e) => setP({ cursor_cor_hex: e.target.value })} className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-card p-1" aria-label="Cor do cursor" />}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Faixa rotulo="Tamanho do anel" valor={p.cursor_tamanho} min={12} max={120} step={2} onChange={(e) => setP({ cursor_tamanho: Number(e.target.value) })} />
          <Faixa rotulo="Tamanho do ponto" valor={p.cursor_ponto_tamanho} min={2} max={24} step={1} onChange={(e) => setP({ cursor_ponto_tamanho: Number(e.target.value) })} />
          <Faixa rotulo="Espessura do anel" valor={p.cursor_espessura} min={1} max={6} step={0.5} onChange={(e) => setP({ cursor_espessura: Number(e.target.value) })} />
          <Faixa rotulo="Velocidade para acompanhar" valor={p.cursor_suavidade} sufixo="%" min={5} max={100} step={5} onChange={(e) => setP({ cursor_suavidade: Number(e.target.value) })} />
        </div>
        <div><p className="rotulo">Efeitos</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {EFEITOS.map(([k, r, d]) => (
              <label key={k} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${efeitos.includes(k) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                <input type="checkbox" checked={efeitos.includes(k)} onChange={() => alternarEfeito(k)} className="mt-0.5 accent-[hsl(var(--primary))]" />
                <span><span className="font-medium">{r}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </div>
        </div>
        <label className="flex items-center justify-between gap-4 text-sm"><span>Esconder a seta em todos os estilos<span className="block text-xs text-muted-foreground">Mostra só o efeito. A seta volta sozinha em campos de texto.</span></span>
          <Interruptor ligado={p.cursor_esconder_seta} onChange={(v) => setP({ cursor_esconder_seta: v })} rotulo="Esconder a seta" /></label>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-sm font-medium">Modelo do ponteiro</p>
        <p className="mb-3 text-xs text-muted-foreground">Troca a própria seta do sistema. Vale mesmo com o efeito desligado. Sobre links e botões o modelo vira a versão de clique.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          <button type="button" onClick={() => setP({ cursor_modelo: 'sistema' })} className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs ${p.cursor_modelo === 'sistema' ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>
            <MousePointer2 className="h-6 w-6" />Do sistema</button>
          {Object.entries(MODELOS).map(([k, m]) => (
            <button key={k} type="button" onClick={() => setP({ cursor_modelo: k })} className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-xs ${p.cursor_modelo === k ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>
              <Miniatura chave={k} cor={corModelo} />{m.nome}</button>
          ))}
        </div>
        <div className="mt-4"><Faixa rotulo="Tamanho do modelo" valor={p.cursor_modelo_tamanho} min={16} max={96} step={4} onChange={(e) => setP({ cursor_modelo_tamanho: Number(e.target.value) })} />
          <p className="ajuda">Acima de 32 px alguns navegadores podem reduzir o desenho.</p></div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Meus cursores <span className="font-normal text-muted-foreground">{meus.length}/{MAX_CURSORES}</span></p>
            <Botao tamanho="sm" variante="secundario" icone={Upload} onClick={() => arquivo.current?.click()}>Enviar modelo</Botao>
            <input ref={arquivo} type="file" accept=".png,.svg,.webp,.gif,.jpg,.jpeg,.cur,.ico,image/png,image/svg+xml,image/webp,image/gif,image/jpeg,image/x-icon" className="hidden" onChange={enviar} />
          </div>
          {!meus.length && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">PNG, SVG, WEBP, GIF, JPG, CUR ou ICO até 200 KB. Imagem quadrada e com fundo transparente fica melhor. Os modelos ficam só neste navegador.</p>}
          <div className="divide-y divide-border">
            {meus.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <button type="button" onClick={() => setP({ cursor_modelo: `meu:${c.id}` })} className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border ${p.cursor_modelo === `meu:${c.id}` ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`} aria-label={`Usar ${c.nome}`}>
                  <Miniatura item={c} /></button>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.nome}{p.cursor_modelo === `meu:${c.id}` && <span className="ml-1.5 text-xs font-normal text-primary">em uso</span>}</p>
                  <div className="mt-1 flex gap-1.5 text-xs">{[['ponta', 'Clica na ponta'], ['centro', 'Clica no centro']].map(([k, r]) => <button key={k} type="button" onClick={() => mudarPonta(c.id, k)} className={`rounded px-1.5 py-0.5 ${c.ponta === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>)}</div></div>
                <button type="button" onClick={() => apagar(c.id)} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label={`Apagar ${c.nome}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Área de teste: passe o mouse e clique</p>
        <div className="flex flex-wrap items-center gap-3">
          <Botao tamanho="sm">Botão</Botao><a href="#teste-cursor" onClick={(e) => e.preventDefault()} className="text-sm text-primary underline">Um link</a>
          <input className="campo h-9 max-w-[180px]" placeholder="Campo de texto" aria-label="Campo de teste" />
          <Botao tamanho="sm" variante="secundario" icone={RotateCcw} onClick={restaurar}>Restaurar padrão</Botao>
        </div>
      </div>
    </div>
  )
}
