import { useMemo, useState } from 'react'
import { Plus, Search, Trash2, UserRound, X } from 'lucide-react'
import { CATALOGO, CORES_ITEM } from '../catalogoMapa'
import { DIAS_SEMANA, horaBR, noExpediente, situacaoExpediente } from '../mapaUtil'
import { Modal } from './ui'

// Equipe do mapa: cada pessoa vira um avatar com nome e cargo acima da cabeça, sentada no posto dela durante o
// expediente (horário de Brasília) e fora do escritório no resto do tempo.
export const PELES = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e']
export const CABELOS = ['#111111', '#2b1b12', '#4a3122', '#7a5230', '#b8860b', '#d6c08a', '#6b6b6b', '#a33b20']
const ROUPAS = ['#1e3a5f', '#335c67', '#6b2737', '#2f4858', '#5b5f97', '#3a5a40', '#9a6324', '#264653', '#f8fafc', '#111827', '#be185d', '#0f766a']
const CALCAS = ['#1f2937', '#334155', '#3b4252', '#1e3a8a', '#78716c', '#111111', '#e7e5e4']
const ESTILOS = [['curto', 'Curto'], ['lateral', 'Curto de lado'], ['raspado', 'Raspado'], ['careca', 'Careca'], ['cacheado', 'Cacheado'], ['longo', 'Longo'], ['rabo', 'Rabo de cavalo'], ['coque', 'Coque']]
const TRAJES = [['camisa', 'Camisa'], ['social', 'Social (paletó e gravata)'], ['camiseta', 'Camiseta'], ['blusa', 'Blusa'], ['saia', 'Blusa e saia']]

export function novaPessoa(preset = {}) {
  return {
    id: `p-${Date.now().toString(36)}`, nome: '', cargo: '', sala: preset.sala || '', posto: preset.posto || '',
    inicio: '08:00', fim: '18:00', dias: [1, 2, 3, 4, 5],
    aparencia: { pele: '#f1c27d', cabelo: 'curto', cor_cabelo: '#2b1b12', roupa: '#1e3a5f', calca: '#1f2937', sapato: '#111111', traje: 'camisa', corpo: 'a', oculos: false, barba: false, cracha: true, ...(preset.aparencia || {}) },
  }
}

function Cores({ lista, valor, mudar, rotulo }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={rotulo}>
      {lista.map((c) => (
        <button key={c} type="button" onClick={() => mudar(c)} role="radio" aria-checked={valor === c} aria-label={c}
          className={`h-6 w-6 rounded-full border ${valor === c ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--card))]' : 'border-border'}`} style={{ background: c }} />
      ))}
      <input type="color" value={valor || '#000000'} onChange={(e) => mudar(e.target.value)} className="h-6 w-8 cursor-pointer rounded border border-border bg-transparent" aria-label={`${rotulo}: outra cor`} />
    </div>
  )
}

// silhueta simples para ver as cores antes de salvar
function Previa({ ap }) {
  const cabeloCurto = ['curto', 'lateral', 'raspado'].includes(ap.cabelo)
  return (
    <svg viewBox="0 0 80 120" className="h-28 w-20 shrink-0 rounded-md border border-border bg-muted/40" aria-hidden="true">
      {ap.cabelo === 'longo' && <rect x="24" y="14" width="32" height="40" rx="12" fill={ap.cor_cabelo} />}
      <rect x="36" y="34" width="8" height="8" fill={ap.pele} />
      <ellipse cx="40" cy="24" rx="12" ry="14" fill={ap.pele} />
      {ap.cabelo !== 'careca' && <path d={cabeloCurto ? 'M28 22 Q40 4 52 22 Q46 14 28 22Z' : 'M27 24 Q40 0 53 24 Q48 12 27 24Z'} fill={ap.cor_cabelo} opacity={ap.cabelo === 'raspado' ? 0.6 : 1} />}
      {ap.cabelo === 'coque' && <circle cx="40" cy="8" r="5" fill={ap.cor_cabelo} />}
      {ap.cabelo === 'cacheado' && <circle cx="40" cy="16" r="14" fill={ap.cor_cabelo} />}
      {ap.oculos && <g stroke="#18181b" strokeWidth="1.2" fill="none"><circle cx="35" cy="25" r="3.5" /><circle cx="45" cy="25" r="3.5" /><path d="M38.5 25h3" /></g>}
      {ap.barba && <path d="M30 28 Q40 44 50 28 Q40 36 30 28Z" fill={ap.cor_cabelo} />}
      <path d={ap.corpo === 'b' ? 'M27 42 Q40 38 53 42 L56 78 L24 78Z' : 'M23 42 Q40 37 57 42 L54 78 L26 78Z'} fill={ap.traje === 'social' ? '#f8fafc' : ap.roupa} />
      {ap.traje === 'social' && <><path d="M23 42 L34 42 L36 78 L26 78Z M57 42 L46 42 L44 78 L54 78Z" fill={ap.roupa} /><path d="M39 44 L41 44 L42 62 L40 65 L38 62Z" fill="#7f1d1d" /></>}
      {ap.cracha && <rect x="42" y="54" width="7" height="9" rx="1" fill="#fff" stroke="#0f766a" />}
      {ap.traje === 'saia'
        ? <><path d="M25 78 L55 78 L58 96 L22 96Z" fill={ap.calca} /><rect x="30" y="96" width="7" height="16" fill={ap.pele} /><rect x="43" y="96" width="7" height="16" fill={ap.pele} /></>
        : <><rect x="27" y="78" width="12" height="34" fill={ap.calca} /><rect x="41" y="78" width="12" height="34" fill={ap.calca} /></>}
      <rect x="25" y="112" width="14" height="5" rx="2" fill={ap.sapato} /><rect x="41" y="112" width="14" height="5" rx="2" fill={ap.sapato} />
    </svg>
  )
}

export function EditorPessoa({ inicial, postos, projetos, ocupado, onSalvar, onApagar, onFechar, dentro = false }) {
  const [p, setP] = useState(inicial)
  const ap = p.aparencia
  const muda = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const mudaAp = (k, v) => setP((x) => ({ ...x, aparencia: { ...x.aparencia, [k]: v } }))
  const postosDaSala = postos.filter((x) => !p.sala || x.sala === String(p.sala))
  const valido = p.nome.trim().length > 0 && /^\d\d:\d\d$/.test(p.inicio) && /^\d\d:\d\d$/.test(p.fim)
  return (
    <div className={dentro ? 'absolute inset-0 z-20 flex items-start justify-center overflow-auto bg-black/30 p-3 backdrop-blur-[1px]' : 'fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-black/40 p-4'}
      onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <form className="my-auto w-full max-w-xl rounded-xl border border-border bg-card p-5 text-sm shadow-xl" onSubmit={(e) => { e.preventDefault(); if (valido) onSalvar({ ...p, nome: p.nome.trim(), cargo: p.cargo.trim() }) }}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div><h2 className="text-base font-semibold">{inicial.nome ? `Editar ${inicial.nome}` : 'Nova pessoa da equipe'}</h2><p className="text-xs text-muted-foreground">Aparece no 3D com nome e cargo, no posto dela, durante o expediente.</p></div>
          <button type="button" onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Nome<input required maxLength={40} value={p.nome} onChange={(e) => muda('nome', e.target.value)} className="campo mt-1 h-9" placeholder="Ex.: Deison" /></label>
          <label className="text-xs text-muted-foreground">Cargo<input maxLength={40} value={p.cargo} onChange={(e) => muda('cargo', e.target.value)} className="campo mt-1 h-9" placeholder="Ex.: Analista de TI" /></label>
          <label className="text-xs text-muted-foreground">Sala<select value={p.sala} onChange={(e) => setP((x) => ({ ...x, sala: e.target.value, posto: '' }))} className="campo mt-1 h-9">
            <option value="">Qualquer sala</option>{projetos.map((s) => <option key={s.id} value={String(s.id)}>{s.nome}</option>)}</select></label>
          <label className="text-xs text-muted-foreground">Posto (onde senta)<select value={p.posto} onChange={(e) => { const po = postos.find((x) => x.id === e.target.value); setP((x) => ({ ...x, posto: e.target.value, sala: po?.sala || x.sala })) }} className="campo mt-1 h-9">
            <option value="">Primeiro lugar livre da sala</option>{postosDaSala.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}</select></label>
        </div>

        <fieldset className="mt-4 border-t border-border pt-3">
          <legend className="mb-2 text-xs font-medium">Expediente (horário de Brasília)</legend>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted-foreground">Entrada<input type="time" value={p.inicio} onChange={(e) => muda('inicio', e.target.value)} className="campo mt-1 h-9 w-28" /></label>
            <label className="text-xs text-muted-foreground">Saída<input type="time" value={p.fim} onChange={(e) => muda('fim', e.target.value)} className="campo mt-1 h-9 w-28" /></label>
            <div className="flex gap-1" role="group" aria-label="Dias da semana">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = p.dias.includes(d)
                return <button key={d} type="button" aria-pressed={on} onClick={() => muda('dias', on ? p.dias.filter((x) => x !== d) : [...p.dias, d])}
                  className={`h-9 w-10 rounded-md border text-xs ${on ? 'border-transparent bg-primary font-medium text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>{DIAS_SEMANA[d]}</button>
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{situacaoExpediente(p)}. Turno que passa da meia-noite (ex.: 22:00 às 06:00) também vale.</p>
        </fieldset>

        <fieldset className="mt-4 border-t border-border pt-3">
          <legend className="mb-2 text-xs font-medium">Aparência</legend>
          <div className="flex gap-4">
            <Previa ap={ap} />
            <div className="grid flex-1 gap-2.5">
              <div><p className="mb-1 text-xs text-muted-foreground">Pele</p><Cores lista={PELES} valor={ap.pele} mudar={(v) => mudaAp('pele', v)} rotulo="Cor da pele" /></div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-muted-foreground">Cabelo<select value={ap.cabelo} onChange={(e) => mudaAp('cabelo', e.target.value)} className="campo mt-1 h-8">{ESTILOS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
                <label className="text-xs text-muted-foreground">Roupa<select value={ap.traje} onChange={(e) => mudaAp('traje', e.target.value)} className="campo mt-1 h-8">{TRAJES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              </div>
              <div><p className="mb-1 text-xs text-muted-foreground">Cor do cabelo</p><Cores lista={CABELOS} valor={ap.cor_cabelo} mudar={(v) => mudaAp('cor_cabelo', v)} rotulo="Cor do cabelo" /></div>
            </div>
          </div>
          <div className="mt-2.5 grid gap-2.5">
            <div><p className="mb-1 text-xs text-muted-foreground">{ap.traje === 'social' ? 'Paletó' : 'Camisa / blusa'}</p><Cores lista={ROUPAS} valor={ap.roupa} mudar={(v) => mudaAp('roupa', v)} rotulo="Cor da roupa" /></div>
            <div><p className="mb-1 text-xs text-muted-foreground">{ap.traje === 'saia' ? 'Saia' : 'Calça'}</p><Cores lista={CALCAS} valor={ap.calca} mudar={(v) => mudaAp('calca', v)} rotulo="Cor da calça" /></div>
            <div><p className="mb-1 text-xs text-muted-foreground">Sapato</p><Cores lista={['#111111', '#3f2a1d', '#7a4a2a', '#f8fafc', '#1e3a8a']} valor={ap.sapato} mudar={(v) => mudaAp('sapato', v)} rotulo="Cor do sapato" /></div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              <span className="flex overflow-hidden rounded-md border border-border">{[['a', 'Corpo A'], ['b', 'Corpo B']].map(([k, n]) => <button key={k} type="button" onClick={() => mudaAp('corpo', k)} className={`px-2.5 py-1 ${ap.corpo === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}>{n}</button>)}</span>
              {[['oculos', 'Óculos'], ['barba', 'Barba'], ['cracha', 'Crachá']].map(([k, n]) => (
                <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={!!ap[k]} onChange={(e) => mudaAp(k, e.target.checked)} />{n}</label>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-border pt-4">
          {onApagar ? <button type="button" disabled={ocupado} onClick={onApagar} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"><Trash2 className="h-4 w-4" />Tirar da equipe</button> : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className="h-9 rounded-md border border-border px-3 text-sm hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={ocupado || !valido} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">{ocupado ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

export function PainelEquipe({ pessoas, projetos, admin, onNova, onEditar }) {
  const agora = horaBR()
  const ordenadas = [...pessoas].sort((a, b) => (noExpediente(b, agora) - noExpediente(a, agora)) || a.nome.localeCompare(b.nome))
  const presentes = pessoas.filter((p) => noExpediente(p, agora)).length
  return (
    <div className="cartao">
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-3.5">
        <div><h2 className="titulo-secao">Equipe</h2><p className="text-xs text-muted-foreground">{pessoas.length ? `${presentes} de ${pessoas.length} no expediente agora` : 'Dê nome, cargo e horário a cada avatar'}</p></div>
        {admin && <button onClick={onNova} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted"><Plus className="h-3.5 w-3.5" />Pessoa</button>}
      </div>
      {pessoas.length ? (
        <ul className="max-h-80 overflow-auto p-2">
          {ordenadas.map((p) => {
            const on = noExpediente(p, agora)
            return (
              <li key={p.id}>
                <button onClick={() => admin && onEditar(p.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${admin ? 'hover:bg-muted' : 'cursor-default'}`}>
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: p.aparencia?.roupa || '#334155' }}>
                    {p.nome.split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[hsl(var(--card))] ${on ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.nome}{p.cargo && <span className="font-normal text-muted-foreground"> · {p.cargo}</span>}</span>
                    <span className="block truncate text-xs text-muted-foreground">{situacaoExpediente(p, agora)}{p.sala ? ` · ${projetos.find((x) => String(x.id) === String(p.sala))?.nome || ''}` : ''}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground"><UserRound className="h-5 w-5 shrink-0" />{admin ? 'No 3D, clique numa pessoa e em "Cadastrar com nome e cargo", ou use o botão Pessoa.' : 'Ninguém cadastrado ainda.'}</div>
      )}
    </div>
  )
}

// "Loja" do mapa: catálogo de itens para pôr na planta (é grátis: não compra nada, só desenha no escritório)
export function LojaMapa({ aberto, onFechar, onAdicionar }) {
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState('Todos')
  const [escolha, setEscolha] = useState({})
  const grupos = useMemo(() => ['Todos', ...new Set(CATALOGO.map((c) => c.grupo))], [])
  const lista = CATALOGO.filter((c) => (grupo === 'Todos' || c.grupo === grupo) && (!busca || `${c.nome} ${c.desc} ${c.modelos.join(' ')}`.toLowerCase().includes(busca.toLowerCase())))
  return (
    <Modal aberto={aberto} titulo="Loja do escritório" onFechar={onFechar} largura="max-w-3xl">
      <p className="mb-3 text-sm text-muted-foreground">Escolha modelo e cor e coloque na planta. Os itens são só do mapa: não compram nem conectam aparelhos.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item" className="campo h-9 pl-8" aria-label="Buscar item" /></label>
        <div className="flex flex-wrap gap-1">{grupos.map((g) => <button key={g} onClick={() => setGrupo(g)} className={`h-8 rounded-md px-2.5 text-xs ${grupo === g ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted'}`}>{g}</button>)}</div>
      </div>
      <div className="grid max-h-[60vh] gap-2 overflow-auto sm:grid-cols-2">
        {lista.map((c) => {
          const I = c.icone, esc = escolha[c.tipo] || { modelo: c.modelos[0], cor: c.cor }
          const set = (k, v) => setEscolha((x) => ({ ...x, [c.tipo]: { ...esc, [k]: v } }))
          return (
            <div key={c.tipo} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border"><I className="h-4 w-4" /></span>
                <div className="min-w-0"><p className="font-medium">{c.nome}</p><p className="text-xs text-muted-foreground">{c.desc}</p></div>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {c.modelos.length > 1 && <select value={esc.modelo} onChange={(e) => set('modelo', e.target.value)} className="campo h-8 w-auto text-xs" aria-label={`Modelo de ${c.nome}`}>{c.modelos.map((m) => <option key={m}>{m}</option>)}</select>}
                {c.tipo !== 'ar_previsto' && c.tipo !== 'planta' && (
                  <div className="flex gap-1">{CORES_ITEM.slice(0, 7).map(([cor, nome]) => <button key={cor} onClick={() => set('cor', cor)} aria-label={nome} title={nome} className={`h-5 w-5 rounded-full border ${esc.cor === cor ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1 ring-offset-[hsl(var(--card))]' : 'border-border'}`} style={{ background: cor }} />)}</div>
                )}
              </div>
              <button onClick={() => onAdicionar(c, esc)} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:opacity-90"><Plus className="h-3.5 w-3.5" />Colocar na planta</button>
            </div>
          )
        })}
        {!lista.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nada com “{busca}”.</p>}
      </div>
    </Modal>
  )
}
