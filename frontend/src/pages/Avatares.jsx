import { useMemo, useState } from 'react'
import { PersonStanding, Play, RotateCcw, Search, Trash2, Upload, Users } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import AvatarViewer from '../components/avatares/AvatarViewer'
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
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const lista = useMemo(() => (dados?.avatares || []).filter((a) => a.estado === 'pronto' && (!busca || `${a.nome} ${a.origem} ${a.licenca}`.toLowerCase().includes(busca.toLowerCase()))), [dados, busca])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const atual = lista.find((a) => a.id === sel) || lista[0]
  const info = atual?.info || {}
  const escolher = (a) => { setSel(a.id); setAnim(a.info?.animacoes?.idle || null); setExpr(null) }
  return (
    <>
      <Cabecalho titulo="Avatares 3D" descricao="Personagens 3D (GLB) para as pessoas do mapa: importar, ver as animações e expressões e escolher quem usa cada um."
        acoes={pode && <Botao icone={Upload} onClick={() => setImportar(true)}>Importar avatar</Botao>} />
      {!lista.length ? <Vazio icone={PersonStanding} titulo="Nenhum avatar ainda" texto="Importe um .glb com animações (parado, andando, sentado). Sem avatar, o mapa usa o boneco desenhado pelo sistema." /> : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-3">
            <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input className="campo pl-9" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar avatar" /></label>
            <ul className="space-y-2">{lista.map((a) => (
              <li key={a.id}><button onClick={() => escolher(a)} className={`w-full rounded-lg border p-3 text-left ${atual?.id === a.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}>
                <p className="truncate text-sm font-medium">{a.nome}</p>
                <p className="truncate text-xs text-muted-foreground">{a.licenca}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{a.info?.clips?.length || 0} animação(ões) · {mb(a.tamanho)}{a.info?.esqueleto ? ' · com esqueleto' : ''}</p>
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
                    {pode && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={() => setApagar(atual)}>Apagar avatar</Botao>}
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
                <div className="mt-3"><QuemUsa avatar={atual} mapa={mapa} aoSalvar={recMapa} pode={pode} /></div>
              </section>
            </div>
          )}
        </div>
      )}
      <Importar aberto={importar} aoFechar={() => setImportar(false)} aoImportar={(a) => { recarregar(); escolher(a) }} limite={dados.limite_mb} />
      <Modal aberto={!!apagar} titulo={`Apagar ${apagar?.nome}?`} onFechar={() => setApagar(null)}>
        <p className="text-sm text-muted-foreground">O arquivo sai do armazenamento e quem usa este avatar volta ao boneco desenhado pelo sistema. Não dá para desfazer.</p>
        <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { try { await api.del(`/api/avatares/${apagar.id}`); setApagar(null); setSel(null); recarregar(); toast('Avatar apagado.') } catch (e) { toast(e.message, 'erro') } }}>Apagar</Botao></div>
      </Modal>
    </>
  )
}
