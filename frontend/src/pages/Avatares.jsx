import { useMemo, useState } from 'react'
import { Brush, Car, Dog, Library, MapPin, Pencil, PersonStanding, Play, RotateCcw, Search, Trash2, Upload, Users, Wand2 } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import AvatarViewer from '../components/avatares/AvatarViewer'
import Estudio from '../components/avatares/Estudio'
import EditorAparencia from '../components/avatares/EditorAparencia'
import { Aviso, Botao, Cabecalho, Carregando, Modal, Selo, Vazio, useDados, useToast } from '../components/ui'

// Biblioteca de avatares 3D (GLB). Só modelos que o dono pode usar: origem e licença ficam registradas.
// As animações que o mapa usa: parado (idle), andando (walking), sentado (sitting). As outras aparecem se o modelo tiver.
const PADRAO = [['idle', 'Parado'], ['walking', 'Andando'], ['running', 'Correndo'], ['sitting', 'Sentado'], ['typing', 'Digitando'], ['drinking', 'Bebendo'],
  ['talking', 'Falando'], ['waving', 'Acenando'], ['greeting', 'Cumprimentando'], ['thinking', 'Pensando'], ['happy', 'Feliz'], ['sad', 'Triste'],
  ['surprised', 'Surpreso'], ['pointing', 'Apontando'], ['listening', 'Ouvindo']]
const EXPR = [['neutral', 'Neutra'], ['happy', 'Feliz'], ['sad', 'Triste'], ['angry', 'Brava'], ['surprised', 'Surpresa'], ['confused', 'Confusa'], ['thinking', 'Pensativa']]
const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

function Importar({ aberto, aoFechar, aoImportar, limite }) {
  const toast = useToast()
  const [f, setF] = useState({ nome: '', descricao: '', origem: '', licenca: '', autorizado: false })
  const [arq, setArq] = useState(null)
  const [prog, setProg] = useState(null)
  const [erro, setErro] = useState('')
  const enviar = async (e) => {
    e.preventDefault(); setErro('')
    if (!arq) return setErro('Escolha um arquivo .glb.')
    if (arq.size > limite * 1048576) return setErro(`O arquivo tem ${mb(arq.size)}; o limite é ${limite} MB.`)
    try {
      setProg(0)
      const { id, upload_url: url } = await api.post('/api/avatares/envio', { ...f, tamanho: arq.size })
      await new Promise((ok, falha) => {   // direto para o Storage privado (não passa pela Vercel), com progresso
        const x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('Content-Type', 'model/gltf-binary'); x.setRequestHeader('x-upsert', 'true')
        x.upload.onprogress = (ev) => ev.lengthComputable && setProg(Math.round(ev.loaded / ev.total * 100))
        x.onload = () => (x.status < 300 ? ok() : falha(new Error(`Envio recusado (${x.status}).`))); x.onerror = () => falha(new Error('Falha de rede no envio.')); x.send(arq)
      })
      setProg(100)
      const a = await api.post(`/api/avatares/${id}/confirmar`)
      toast(`${a.nome} importado: ${a.info.clips.length} animação(ões).`); aoImportar(a); aoFechar()
      setF({ nome: '', descricao: '', origem: '', licenca: '', autorizado: false }); setArq(null)
    } catch (err) { setErro(err.message) } finally { setProg(null) }
  }
  return (
    <Modal aberto={aberto} titulo="Importar avatar 3D" onFechar={aoFechar}>
      <form className="space-y-3" onSubmit={enviar}>
        <p className="text-sm text-muted-foreground">Arquivo <b>.glb</b> (glTF binário), com texturas embutidas e sem compressão, até {limite} MB. FBX e DAE: converta no Blender antes (Arquivo → Exportar → glTF 2.0, formato .glb). Veja docs/AVATARES_3D.md.</p>
        <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => setArq(e.target.files?.[0] || null)} className="block w-full text-sm" aria-label="Arquivo .glb" />
        {arq && <p className="text-xs text-muted-foreground">{arq.name} · {mb(arq.size)}</p>}
        <input className="campo" required maxLength={60} placeholder="Nome (ex.: Analista de camisa azul)" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} aria-label="Nome" />
        <input className="campo" maxLength={300} placeholder="Descrição (opcional)" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} aria-label="Descrição" />
        <input className="campo" required minLength={3} maxLength={200} placeholder="Origem: quem fez ou de onde veio" value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} aria-label="Origem" />
        <input className="campo" required minLength={3} maxLength={200} placeholder="Licença ou autorização de uso" value={f.licenca} onChange={(e) => setF({ ...f, licenca: e.target.value })} aria-label="Licença" />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.autorizado} onChange={(e) => setF({ ...f, autorizado: e.target.checked })} />Declaro que tenho autorização para usar este modelo aqui. Personagens de jogos e outras obras protegidas só com licença do dono dos direitos.</label>
        {erro && <Aviso>{erro}</Aviso>}
        {prog != null && <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${prog}%` }} /></div>}
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit" icone={Upload} carregando={prog != null} disabled={!f.autorizado}>Importar</Botao></div>
      </form>
    </Modal>
  )
}

function QuemUsa({ avatar, mapa, aoSalvar, pode }) {
  const toast = useToast()
  const [salvando, setSalvando] = useState('')
  const pessoas = mapa?.pessoas || []
  const alternar = async (p) => {
    setSalvando(p.id)
    try {
      const novas = pessoas.map((x) => (x.id === p.id ? { ...x, avatar_id: x.avatar_id === avatar.id ? null : avatar.id } : x))
      await api.put('/api/mapa/pessoas', novas); aoSalvar(); toast('Equipe atualizada: o mapa usa o avatar novo na próxima abertura.')
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando('') }
  }
  if (!pessoas.length) return <p className="text-sm text-muted-foreground">Cadastre a equipe no Mapa para escolher quem usa este avatar.</p>
  return (
    <ul className="grid gap-2 sm:grid-cols-2">{pessoas.map((p) => (
      <li key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
        <span>{p.nome}<span className="ml-1 text-xs text-muted-foreground">{p.cargo}</span></span>
        {pode ? <Botao tamanho="sm" variante={p.avatar_id === avatar.id ? 'primario' : 'secundario'} carregando={salvando === p.id} onClick={() => alternar(p)}>{p.avatar_id === avatar.id ? 'Usando' : 'Usar'}</Botao>
          : p.avatar_id === avatar.id ? <Selo cor="verde">Usando</Selo> : null}
      </li>))}
    </ul>
  )
}

const ESPECIES = { pessoa: 'Pessoa', cao: 'Cão', gato: 'Gato', animal: 'Animal', veiculo: 'Veículo', outro: 'Outro' }

// Veículo nas ruas do mapa 3D: liga/desliga e a física (massa, potência, aderência, freios, câmbio, tração…)
const FISICA = [['massa', 'Massa', 150, 20000, 10, 'kg', 1400], ['potencia', 'Potência', 20, 1500, 5, 'cv', 520], ['aderencia', 'Aderência dos pneus', 0.4, 1.6, 0.01, '', 1.1],
  ['freio', 'Força de frenagem', 0.3, 1.5, 0.01, '', 1.1], ['velmax', 'Velocidade máxima', 40, 420, 5, 'km/h', 330], ['marchas', 'Marchas do automático', 3, 10, 1, '', 8],
  ['direcao', 'Esterço máximo', 15, 45, 1, '°', 32], ['suspensao', 'Suspensão (macia ↔ firme)', 0.3, 2, 0.05, '', 1], ['cg', 'Altura do centro de massa', 0.25, 1.5, 0.01, 'm', 0.42],
  ['comprimento', 'Comprimento real (0 = automático)', 0, 15, 0.1, 'm', 0]]
// liga/desliga: [chave, rótulo, explicação, padrão]
const OPCOES = [['esc', 'Controle de estabilidade (ESC)', 'segura a traseira: o carro não roda numa curva forte', 1], ['nitro', 'Nitro (Shift)', '+60% de potência por uns 4 s, recarrega sozinho', 1],
  ['eletrico', 'Motor elétrico', 'uma marcha, força máxima desde parado, zunido no lugar do ronco', 0], ['voar', 'Propulsores (voa com T)', 'decola, paira, sobe com Espaço e desce com X', 0],
  ['duasRodas', 'Moto (duas rodas)', 'inclina para dentro da curva; usa as rodas do próprio modelo', 0]]
function VeiculoNoMapa({ avatar, mapa, aoSalvar, pode }) {
  const toast = useToast()
  const lista = mapa?.veiculos || []
  const atual = lista.find((v) => v.avatar_id === avatar.id)
  const [f, setF] = useState(() => ({ tracao: 'traseira', ...Object.fromEntries(FISICA.map(([k, , , , , , p]) => [k, p])), ...Object.fromEntries(OPCOES.map(([k, , , p]) => [k, p])), ...(atual?.fisica || {}) }))
  const [salvando, setSalvando] = useState(false)
  const gravar = async (nova) => {
    setSalvando(true)
    try { await api.put('/api/mapa/veiculos', { veiculos: nova }); aoSalvar(); toast('Ruas do mapa atualizadas: vale na próxima abertura do mapa.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const alternar = () => gravar(atual ? lista.filter((v) => v.avatar_id !== avatar.id) : [...lista, { id: `v${avatar.id}`, avatar_id: avatar.id, nome: avatar.nome, rot: 0, fisica: f }])
  const salvarFisica = () => gravar(lista.map((v) => (v.avatar_id === avatar.id ? { ...v, fisica: f } : v)))
  return (
    <section className="cartao p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Car className="h-4 w-4 text-muted-foreground" />Nas ruas do mapa 3D</h2>
      <p className="mt-1 text-xs text-muted-foreground">No mapa, controle uma pessoa, desça pelo elevador, saia do prédio e aperte <b>E</b> perto do carro para dirigir. Câmbio automático: W acelera, S freia (parado, engata a ré), A/D vira, Espaço é o freio de mão, Shift o nitro, T liga os propulsores (se tiver), C troca a câmera, H buzina, E sai. Perto de um carro do trânsito ou de um estacionamento, E também pega ele.</p>
      {pode ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Botao tamanho="sm" variante={atual ? 'primario' : 'secundario'} carregando={salvando} onClick={alternar}>{atual ? 'Está nas ruas: tirar' : 'Colocar nas ruas'}</Botao>
            {atual && <span className="text-xs text-muted-foreground">{atual.x != null ? 'estacionado onde foi deixado' : 'vaga perto do prédio'}</span>}</div>
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {FISICA.map(([k, r, mn, mx, p, u]) => (
              <label key={k} className="block text-xs"><span className="flex justify-between"><span>{r}</span><span className="tabular text-muted-foreground">{f[k]}{u ? ` ${u}` : ''}</span></span>
                <input type="range" min={mn} max={mx} step={p} value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })} className="mt-1 w-full accent-[hsl(var(--primary))]" aria-label={r} /></label>
            ))}
            {OPCOES.map(([k, r, ex]) => (
              <label key={k} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked ? 1 : 0 })} />
                <span><span className="font-medium">{r}</span><span className="block text-muted-foreground">{ex}</span></span></label>
            ))}
            <label className="block text-xs">Tração<select className="campo mt-1 h-8" value={f.tracao} onChange={(e) => setF({ ...f, tracao: e.target.value })}><option value="traseira">Traseira</option><option value="dianteira">Dianteira</option><option value="4x4">Integral (4x4)</option></select></label>
          </div>
          {atual && <Botao className="mt-3" tamanho="sm" carregando={salvando} onClick={salvarFisica}>Salvar a física</Botao>}
        </>
      ) : <p className="mt-2 text-sm text-muted-foreground">{atual ? 'Este veículo está nas ruas do mapa.' : 'Fora das ruas do mapa.'}</p>}
    </section>
  )
}

function EditarDados({ avatar, aoFechar, aoSalvar }) {
  const toast = useToast()
  const [f, setF] = useState(avatar ? { nome: avatar.nome, descricao: avatar.descricao || '', origem: avatar.origem, licenca: avatar.licenca, especie: avatar.especie || 'pessoa' } : null)
  if (!avatar || !f) return null
  const salvar = async (e) => { e.preventDefault(); try { aoSalvar(await api.put(`/api/avatares/${avatar.id}`, f)); toast('Dados salvos.'); aoFechar() } catch (err) { toast(err.message, 'erro') } }
  return (
    <Modal aberto titulo={`Editar ${avatar.nome}`} onFechar={aoFechar}>
      <form className="space-y-3" onSubmit={salvar}>
        <input className="campo" required maxLength={60} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} aria-label="Nome" />
        <input className="campo" maxLength={300} placeholder="Descrição" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} aria-label="Descrição" />
        <input className="campo" required minLength={3} maxLength={200} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })} aria-label="Origem" />
        <input className="campo" required minLength={3} maxLength={200} value={f.licenca} onChange={(e) => setF({ ...f, licenca: e.target.value })} aria-label="Licença" />
        <select className="campo" value={f.especie} onChange={(e) => setF({ ...f, especie: e.target.value })} aria-label="Espécie">{Object.entries(ESPECIES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select>
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao type="submit">Salvar</Botao></div>
      </form>
    </Modal>
  )
}

// pets, mascotes e pessoas extras no escritório: cada um numa sala, parado ou passeando perto do ponto escolhido
function NoEscritorio({ avatares, mapa, projetos, aoSalvar, pode }) {
  const toast = useToast()
  const atuais = useMemo(() => (mapa?.elementos || []).filter((e) => e.tipo === 'personagem'), [mapa])
  const [lista, setLista] = useState(null)
  const [novo, setNovo] = useState({ avatar_id: '', sala: '', rotulo: '', passear: true })
  const l = lista ?? atuais
  const salas = (projetos || []).filter((p) => mapa?.salas?.[p.id])
  const nomeAv = (id) => avatares.find((a) => a.id === id)?.nome || 'avatar apagado'
  const salaDe = (e) => salas.find((p) => { const r = mapa.salas[p.id]; return e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h })?.nome || 'corredor'
  const adicionar = () => {
    const r = mapa.salas[novo.sala]
    if (!novo.avatar_id || !r) return toast('Escolha o avatar e a sala.', 'erro')
    const x = Math.round(r.x + r.w * (0.3 + Math.random() * 0.4)), y = Math.round(r.y + r.h * (0.3 + Math.random() * 0.4))
    setLista([...l, { id: `personagem-${Date.now().toString(36)}`, avatar_id: +novo.avatar_id, x, y, rotulo: novo.rotulo.trim() || nomeAv(+novo.avatar_id), passear: novo.passear }])
    setNovo({ ...novo, rotulo: '' })
  }
  const salvar = async () => {
    try { await api.put('/api/mapa/personagens', l.map(({ id, avatar_id, x, y, rotulo, passear }) => ({ id, avatar_id, x, y, rotulo, passear: passear !== false }))); setLista(null); aoSalvar(); toast('Escritório atualizado: o mapa mostra na próxima abertura.') }
    catch (e) { toast(e.message, 'erro') }
  }
  return (
    <section className="cartao p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Dog className="h-4 w-4 text-muted-foreground" />No escritório</h2>
      <p className="mt-1 text-xs text-muted-foreground">Pets, mascotes ou pessoas extras que ficam numa sala do mapa (não são da equipe). Quem passeia anda devagar perto do ponto escolhido.</p>
      {pode && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <select className="campo h-9" value={novo.avatar_id} onChange={(e) => setNovo({ ...novo, avatar_id: e.target.value })} aria-label="Avatar"><option value="">Avatar…</option>{avatares.map((a) => <option key={a.id} value={a.id}>{a.nome} ({ESPECIES[a.especie] || 'Pessoa'})</option>)}</select>
          <select className="campo h-9" value={novo.sala} onChange={(e) => setNovo({ ...novo, sala: e.target.value })} aria-label="Sala"><option value="">Sala…</option>{salas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
          <input className="campo h-9" maxLength={40} placeholder="Nome no mapa (opcional)" value={novo.rotulo} onChange={(e) => setNovo({ ...novo, rotulo: e.target.value })} aria-label="Nome no mapa" />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={novo.passear} onChange={(e) => setNovo({ ...novo, passear: e.target.checked })} />Passeia</label>
          <Botao tamanho="sm" variante="secundario" icone={MapPin} onClick={adicionar}>Colocar</Botao>
        </div>
      )}
      {!l.length ? <p className="mt-3 text-sm text-muted-foreground">Ninguém extra no escritório ainda.</p> : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{l.map((e) => (
          <li key={e.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{e.rotulo || nomeAv(e.avatar_id)}<span className="ml-1 text-xs text-muted-foreground">{nomeAv(e.avatar_id)} · {salaDe(e)} · {e.passear === false ? 'parado' : 'passeia'}</span></span>
            {pode && <button onClick={() => setLista(l.filter((x) => x.id !== e.id))} className="rounded p-1 text-muted-foreground hover:text-red-600" aria-label={`Tirar ${e.rotulo}`}><Trash2 className="h-4 w-4" /></button>}
          </li>))}
        </ul>
      )}
      {lista && <div className="mt-3 flex gap-2"><Botao onClick={salvar}>Salvar no mapa</Botao><Botao variante="secundario" onClick={() => setLista(null)}>Desfazer</Botao></div>}
    </section>
  )
}

export default function Avatares() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/avatares'))
  const { dados: mapa, recarregar: recMapa } = useDados(() => api.get('/api/mapa').then((m) => m.mapa || m))
  const [sel, setSel] = useState(null)
  const [busca, setBusca] = useState('')
  const [importar, setImportar] = useState(false)
  const [anim, setAnim] = useState(null)
  const [vel, setVel] = useState(1)
  const [repetir, setRepetir] = useState(true)
  const [expr, setExpr] = useState(null)
  const [intens, setIntens] = useState(1)
  const [apagar, setApagar] = useState(null)
  const [editar, setEditar] = useState(null)
  const [aba, setAba] = useState('biblioteca')
  const [noEstudio, setNoEstudio] = useState(null)
  const [editando, setEditando] = useState(null)
  const [versao, setVersao] = useState(0)
  const { dados: projetos } = useDados(() => api.get('/api/projetos').then((r) => r.projetos || r))
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const abrirNoEstudio = async (a) => { try { const { receita } = await api.get(`/api/avatares/${a.id}/receita`); setNoEstudio({ ...receita, manual: !receita.parametros, parametros: receita.parametros }); setAba('estudio') } catch (e) { toast(e.message, 'erro') } }
  const lista = useMemo(() => (dados?.avatares || []).filter((a) => a.estado === 'pronto' && (!busca || `${a.nome} ${a.origem} ${a.licenca}`.toLowerCase().includes(busca.toLowerCase()))), [dados, busca])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const atual = lista.find((a) => a.id === sel) || lista[0]
  const info = atual?.info || {}
  const escolher = (a) => { setSel(a.id); setAnim(a.info?.animacoes?.idle || null); setExpr(null) }
  return (
    <>
      <Cabecalho titulo="Avatares 3D" descricao="Personagens 3D (GLB) para a equipe e para o escritório: criar no Estúdio, importar, ver as animações, editar e colocar pets e mascotes nas salas."
        acoes={pode && <Botao icone={Upload} onClick={() => setImportar(true)}>Importar .glb</Botao>} />
      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-border p-0.5 sm:w-fit" role="tablist">
        {[['biblioteca', 'Biblioteca', Library], ['editor', 'Editor de aparência', Brush], ['estudio', 'Estúdio', Wand2], ['escritorio', 'No escritório', Dog]].map(([k, r, I]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${aba === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{r}</button>))}
      </div>
      {aba === 'estudio' && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">Monte uma pessoa, um cão ou um gato pelos parâmetros, ajuste parte por parte ou escreva a receita. “Salvar na biblioteca” gera o .glb com as animações e ele fica disponível para a equipe e para o escritório.</p>
          <Estudio key={noEstudio ? JSON.stringify(noEstudio).length : 'novo'} inicial={noEstudio} pode={pode} aoSalvar={(a) => { recarregar(); setNoEstudio(null); setAba('biblioteca'); escolher(a) }} />
        </>
      )}
      {aba === 'editor' && (() => {
        const alvo = (dados.avatares || []).find((a) => a.id === (editando?.id ?? atual?.id))
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Editando</span>
              <select className="campo h-9 w-auto" value={alvo?.id || ''} onChange={(e) => setEditando((dados.avatares || []).find((a) => a.id === +e.target.value))} aria-label="Avatar para editar">
                {(dados.avatares || []).filter((a) => a.estado === 'pronto').map((a) => <option key={a.id} value={a.id}>{a.nome} ({ESPECIES[a.especie] || 'Pessoa'})</option>)}
              </select>
              {alvo?.editado && <Selo cor="azul">versão editada</Selo>}
            </div>
            {!pode ? <Aviso tipo="alerta">Só o dono e os administradores editam a aparência dos avatares.</Aviso>
              : alvo ? <EditorAparencia key={`${alvo.id}-${versao}`} avatar={alvo} aoFechar={() => setAba('biblioteca')} aoSalvar={(reabrir) => { recarregar(); if (reabrir) setVersao((v) => v + 1) }} /> : <Vazio icone={Brush} titulo="Nenhum avatar" texto="Importe um .glb para editar." />}
          </>
        )
      })()}
      {aba === 'escritorio' && <NoEscritorio avatares={(dados.avatares || []).filter((a) => a.estado === 'pronto')} mapa={mapa} projetos={projetos} aoSalvar={recMapa} pode={pode} />}
      {aba === 'biblioteca' && (!lista.length ? <Vazio icone={PersonStanding} titulo="Nenhum avatar ainda" texto="Importe um .glb com animações (parado, andando, sentado). Sem avatar, o mapa usa o boneco desenhado pelo sistema." /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          {/* a lista rola sozinha (a página não): com 70+ modelos, rolar a página tirava o visualizador da tela */}
          <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className="campo pl-9" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar avatar" /></label>
            <p className="text-xs text-muted-foreground">{lista.length} modelo(s)</p>
            <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain pr-1 xl:max-h-[calc(100dvh-15rem)]">{lista.map((a) => (
              <li key={a.id}><button onClick={() => escolher(a)} className={`w-full rounded-lg border p-3 text-left ${atual?.id === a.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                <p className="truncate text-sm font-medium">{a.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{a.licenca}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{ESPECIES[a.especie] || 'Pessoa'} · {a.info?.clips?.length || 0} animação(ões) · {mb(a.tamanho)}{a.info?.esqueleto ? ' · com esqueleto' : ''}{a.editavel ? ' · Estúdio' : ''}</p>
              </button></li>))}
            </ul>
          </aside>
          {atual && (
            <div className="space-y-6">
              <section className="cartao overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]">
                  <AvatarViewer key={atual.id} avatarId={atual.id} animacao={anim} velocidade={vel} repetir={repetir} expressao={expr} intensidade={intens} className="h-[460px] bg-muted/30" aoErro={(m) => toast(m, 'erro')} />
                  <div className="space-y-4 border-t border-border p-4 lg:border-l lg:border-t-0">
                    <div><h2 className="font-semibold">{atual.nome}</h2>{atual.descricao && <p className="mt-1 text-sm text-muted-foreground">{atual.descricao}</p>}
                      <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground"><div><dt className="inline font-medium text-foreground">Origem: </dt><dd className="inline">{atual.origem}</dd></div><div><dt className="inline font-medium text-foreground">Licença: </dt><dd className="inline">{atual.licenca}</dd></div>
                        <div>{info.malhas} malha(s) · {info.materiais} material(is) · {info.ossos || 0} osso(s)</div></dl></div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1.5">Velocidade<input type="range" min="0.25" max="2" step="0.25" value={vel} onChange={(e) => setVel(+e.target.value)} className="w-20 accent-[hsl(var(--primary))]" /><span className="tabular">{vel}x</span></label>
                      <label className="flex items-center gap-1.5"><input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />Repetir</label>
                      <Botao tamanho="sm" variante="fantasma" icone={RotateCcw} onClick={() => { const a = anim; setAnim(null); setTimeout(() => setAnim(a), 50) }}>Recomeçar</Botao>
                    </div>
                    {pode && (
                      <div className="flex flex-wrap gap-2">
                        <Botao tamanho="sm" variante="secundario" icone={Pencil} onClick={() => setEditar(atual)}>Editar dados</Botao>
                        <Botao tamanho="sm" icone={Brush} onClick={() => { setEditando(atual); setAba('editor') }}>Editar aparência</Botao>
                        {atual.editavel && <Botao tamanho="sm" variante="secundario" icone={Wand2} onClick={() => abrirNoEstudio(atual)}>Abrir no Estúdio</Botao>}
                        <Botao tamanho="sm" variante="fantasma" icone={Trash2} onClick={() => setApagar(atual)}>Apagar</Botao>
                      </div>
                    )}
                  </div>
                </div>
              </section>
              <section className="cartao p-5">
                <h2 className="text-sm font-semibold">Animações</h2>
                <p className="mt-1 text-xs text-muted-foreground">O mapa usa Parado, Andando e Sentado. As que este modelo não tem ficam desligadas: importe uma versão do .glb com esse clip.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">{PADRAO.map(([k, r]) => {
                  const clip = info.animacoes?.[k]
                  return <button key={k} disabled={!clip} onClick={() => setAnim(clip)} title={clip ? `Clip: ${clip}` : 'Este modelo não tem esta animação'}
                    className={`inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${anim && anim === clip ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{clip && <Play className="h-3 w-3" />}{r}</button>
                })}</div>
                {info.clips?.length > 0 && <div className="mt-3"><p className="text-xs text-muted-foreground">Todos os clips do arquivo</p><div className="mt-1 flex flex-wrap gap-1">{info.clips.map((c) => <button key={c} onClick={() => setAnim(c)} className={`rounded border px-2 py-0.5 text-[11px] ${anim === c ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>{c}</button>)}</div></div>}
              </section>
              <section className="cartao p-5">
                <h2 className="text-sm font-semibold">Expressões</h2>
                {!info.morphs?.length ? <p className="mt-1 text-sm text-muted-foreground">Este modelo não tem expressões faciais (morph targets).</p> : (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button onClick={() => setExpr(null)} className={`h-8 rounded-md border px-2.5 text-xs ${!expr ? 'border-primary bg-primary/10' : 'border-border'}`}>Nenhuma</button>
                      {EXPR.map(([k, r]) => { const m = info.expressoes?.[k]; return <button key={k} disabled={!m} onClick={() => setExpr(m)} className={`h-8 rounded-md border px-2.5 text-xs disabled:opacity-40 ${expr && expr === m ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>{r}</button> })}
                      {info.morphs.filter((m) => !Object.values(info.expressoes || {}).includes(m)).slice(0, 20).map((m) => <button key={m} onClick={() => setExpr(m)} className={`h-8 rounded-md border px-2.5 text-xs ${expr === m ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>{m}</button>)}
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-xs">Intensidade<input type="range" min="0" max="1" step="0.05" value={intens} onChange={(e) => setIntens(+e.target.value)} className="w-40 accent-[hsl(var(--primary))]" /></label>
                  </>
                )}
              </section>
              <section className="cartao p-5">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-muted-foreground" />Quem usa no mapa</h2>
                <div className="mt-3">{(atual.especie || 'pessoa') === 'pessoa' ? <QuemUsa avatar={atual} mapa={mapa} aoSalvar={recMapa} pode={pode} />
                  : atual.especie === 'veiculo' ? <p className="text-sm text-muted-foreground">Veículos andam nas ruas: veja abaixo.</p>
                  : <p className="text-sm text-muted-foreground">Pets e mascotes não substituem pessoas da equipe: coloque na aba <button className="font-medium underline" onClick={() => setAba('escritorio')}>No escritório</button>.</p>}</div>
              </section>
              {atual.especie === 'veiculo' && <VeiculoNoMapa key={atual.id} avatar={atual} mapa={mapa} aoSalvar={recMapa} pode={pode} />}
            </div>
          )}
        </div>
      ))}
      <EditarDados key={editar?.id} avatar={editar} aoFechar={() => setEditar(null)} aoSalvar={() => recarregar()} />
      <Importar aberto={importar} aoFechar={() => setImportar(false)} aoImportar={(a) => { recarregar(); escolher(a) }} limite={dados.limite_mb} />
      <Modal aberto={!!apagar} titulo={`Apagar ${apagar?.nome}?`} onFechar={() => setApagar(null)}>
        <p className="text-sm text-muted-foreground">O arquivo sai do armazenamento e quem usa este avatar volta ao boneco desenhado pelo sistema. Não dá para desfazer.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { try { await api.del(`/api/avatares/${apagar.id}`); setApagar(null); setSel(null); recarregar(); toast('Avatar apagado.') } catch (e) { toast(e.message, 'erro') } }}>Apagar</Botao></div>
      </Modal>
    </>
  )
}
