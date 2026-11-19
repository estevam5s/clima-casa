import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Coffee, Flame, Link2, Package, Power, PowerOff, Timer, Zap } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { cafeteiraVermelha } from '../components/copa3d'
import { carregarAvatar } from '../components/avatares/AvatarViewer'
import { clone as clonarComOssos } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Agendas, ConectarAparelho, Estado, Historico, SemAparelho, useDispositivos } from '../components/dispositivos/Comum'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Vazio, useDados, useToast } from '../components/ui'

// a mesma cafeteira do mapa 3D, girando devagar (vapor quando está ligada)
function Maquina3D({ ligada }) {
  const ref = useRef(null), estado = useRef({ ligada })
  useEffect(() => { estado.current.ligada = ligada }, [ligada])
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio)); r.domElement.style.display = 'block'; el.appendChild(r.domElement)
    const cena = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10)
    cam.position.set(0.55, 0.42, 0.75); cam.lookAt(0, 0.15, 0)
    cena.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.6)); const sol = new THREE.DirectionalLight(0xffffff, 1.8); sol.position.set(1, 2, 1.5); cena.add(sol)
    const m = cafeteiraVermelha({ ligada }); cena.add(m.g)
    let vivo = true   // o modelo da biblioteca (Avatares) escolhido para a cafeteira; sem ele fica o desenho vermelho
    api.get('/api/mapa').then((mp) => { const id = (mp?.mapa || mp)?.modelos?.cafeteira; return id && carregarAvatar(id) }).then((gl) => { if (vivo && gl) m.trocar(clonarComOssos(gl.scene)) }).catch(() => { /* fica o desenho */ })
    const medir = () => { const w = el.clientWidth, h = el.clientHeight; r.setSize(w, h); cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix() }
    medir(); const ro = new ResizeObserver(medir); ro.observe(el)
    let raf = 0; const t0 = performance.now()
    const q = () => { raf = requestAnimationFrame(q); const t = (performance.now() - t0) / 1000; if (!parado) m.g.rotation.y = Math.sin(t * 0.4) * 0.6; m.animar(t, estado.current.ligada); r.render(cena, cam) }
    q()
    return () => { vivo = false; cancelAnimationFrame(raf); ro.disconnect(); cena.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.() }); r.dispose(); r.domElement.remove() }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={ref} className="h-56 w-full" role="img" aria-label={`Cafeteira ${ligada ? 'ligada' : 'desligada'}`} />
}

function Painel({ d0, aoMudar, podeGerenciar, podeControlar }) {
  const toast = useToast()
  const [d, setD] = useState(d0)
  const [ocupado, setOcupado] = useState('')
  const [conectar, setConectar] = useState(false)
  const [versao, setVersao] = useState(0)
  const [cfg, setCfg] = useState({ desligar_apos_min: d0.config.desligar_apos_min, capsulas: d0.config.capsulas, capsulas_alerta: d0.config.capsulas_alerta, potencia_w: d0.config.potencia_w })
  const { dados: ev } = useDados(() => api.get(`/api/dispositivos/${d.id}/eventos?limite=300`), [d.id, versao])
  const atualizar = (n) => { setD(n); aoMudar?.(n); setVersao((v) => v + 1) }
  const acao = async (a) => { setOcupado(a); try { atualizar(await api.post(`/api/dispositivos/${d.id}/comando`, { acao: a })); toast(a === 'ligar' ? 'Cafeteira ligada: em cerca de 1 minuto está quente.' : 'Cafeteira desligada.') } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const cafe = async () => { setOcupado('cafe'); try { atualizar(await api.post(`/api/dispositivos/${d.id}/cafe`)); toast('Café registrado.') } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const salvarCfg = async () => { setOcupado('cfg'); try { atualizar(await api.put(`/api/dispositivos/${d.id}/config`, cfg)); toast('Ajustes salvos.') } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const stats = useMemo(() => {
    const l = ev?.eventos || [], hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)
    const dia = (q) => new Date(q * 1000 - 3 * 3600e3).toISOString().slice(0, 10)
    const cafes = l.filter((e) => e.acao === 'Café')
    return { hoje: cafes.filter((e) => dia(e.quando) === hoje).length, semana: cafes.filter((e) => Date.now() / 1000 - e.quando < 7 * 86400).length,
      ligacoes: l.filter((e) => e.acao === 'Ligou' && e.ok).length }
  }, [ev])
  const ligada = d.resumo?.ligada
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="cartao overflow-hidden">
          <div className="bg-red-50/60 dark:bg-red-950/20"><Maquina3D ligada={!!ligada} /></div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{d.nome}</h2><Estado d={d} />{d.conectado && <span className="text-xs text-muted-foreground">{d.produto}</span>}</div>
            {!d.conectado && <SemAparelho d={d} aoConectar={() => setConectar(true)} />}
            <p className="text-sm text-muted-foreground">A cafeteira de cápsulas fica numa tomada inteligente: o sistema liga (para aquecer) e desliga. Colocar a cápsula e apertar para passar o café continuam sendo na máquina.</p>
            <div className="flex flex-wrap gap-2">
              <Botao icone={Power} disabled={!podeControlar || !d.conectado || ligada === true} carregando={ocupado === 'ligar'} onClick={() => acao('ligar')}>Ligar e aquecer</Botao>
              <Botao variante="secundario" icone={PowerOff} disabled={!podeControlar || !d.conectado || ligada === false} carregando={ocupado === 'desligar'} onClick={() => acao('desligar')}>Desligar</Botao>
              <Botao variante="secundario" icone={Coffee} disabled={!podeControlar} carregando={ocupado === 'cafe'} onClick={cafe}>Fiz um café</Botao>
              {podeGerenciar && <Botao variante="secundario" icone={Link2} onClick={() => setConectar(true)}>{d.conectado ? 'Trocar aparelho' : 'Conectar aparelho'}</Botao>}
            </div>
          </div>
        </section>
        <FaixaMetricas itens={[
          { rotulo: 'Cafés hoje', valor: stats.hoje, dica: `${stats.semana} nos últimos 7 dias` },
          { rotulo: 'Cápsulas', valor: d.config.capsulas ?? 0, tom: (d.config.capsulas ?? 0) <= (d.config.capsulas_alerta ?? 0) ? 'ruim' : 'bom', dica: `aviso com ${d.config.capsulas_alerta ?? 0} ou menos` },
          { rotulo: 'Potência agora', valor: d.resumo?.potencia_w != null ? Math.round(d.resumo.potencia_w) : '—', sufixo: d.resumo?.potencia_w != null ? ' W' : '', dica: 'medida pela tomada, se ela medir' },
          { rotulo: 'Vezes ligada', valor: stats.ligacoes, dica: 'nos últimos registros' },
        ]} />
      </div>
      <div className="space-y-6">
        <section className="cartao p-5">
          <h2 className="text-sm font-semibold">Ajustes</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground"><Timer className="mr-1 inline h-3.5 w-3.5" />Desligar sozinha depois de (min)<input type="number" min="0" max="600" className="campo mt-1 h-9" value={cfg.desligar_apos_min ?? 45} onChange={(e) => setCfg({ ...cfg, desligar_apos_min: +e.target.value })} disabled={!podeGerenciar} /></label>
            <label className="text-xs text-muted-foreground"><Package className="mr-1 inline h-3.5 w-3.5" />Cápsulas em estoque<input type="number" min="0" max="10000" className="campo mt-1 h-9" value={cfg.capsulas ?? 0} onChange={(e) => setCfg({ ...cfg, capsulas: +e.target.value })} disabled={!podeGerenciar} /></label>
            <label className="text-xs text-muted-foreground"><Flame className="mr-1 inline h-3.5 w-3.5" />Avisar com até (cápsulas)<input type="number" min="0" max="500" className="campo mt-1 h-9" value={cfg.capsulas_alerta ?? 5} onChange={(e) => setCfg({ ...cfg, capsulas_alerta: +e.target.value })} disabled={!podeGerenciar} /></label>
            <label className="text-xs text-muted-foreground"><Zap className="mr-1 inline h-3.5 w-3.5" />Potência da máquina (W)<input type="number" min="100" max="5000" className="campo mt-1 h-9" value={cfg.potencia_w ?? 1500} onChange={(e) => setCfg({ ...cfg, potencia_w: +e.target.value })} disabled={!podeGerenciar} /></label>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Desligar sozinha é segurança: se alguém esquecer ligada, ela desliga depois desse tempo (0 = nunca).</p>
          {podeGerenciar && <Botao tamanho="sm" className="mt-3" carregando={ocupado === 'cfg'} onClick={salvarCfg}>Salvar ajustes</Botao>}
        </section>
        <Agendas d={d} acoes={[['ligar', 'Ligar (aquecer)'], ['desligar', 'Desligar']]} aoSalvar={atualizar} podeEditar={podeGerenciar} />
        <Historico d={d} versao={versao} />
      </div>
      <ConectarAparelho d={d} aberto={conectar} aoFechar={() => setConectar(false)} aoConectar={atualizar} />
    </div>
  )
}

export default function Cafeteira() {
  const { sessao } = useProjeto()
  const { dados, erro } = useDispositivos('cafeteira')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const perms = sessao?.permissoes || []
  const dono = ['dono', 'admin'].includes(sessao?.papel)
  return (
    <>
      <Cabecalho titulo="Cafeteira" descricao="Ligar para aquecer, desligar, agenda de manhã, desligamento automático por segurança, estoque de cápsulas e cafés do dia." />
      {!dados.length ? <Vazio icone={Coffee} titulo="Nenhuma cafeteira cadastrada" texto="Peça ao administrador para cadastrar a cafeteira do escritório." />
        : dados.map((d) => <Painel key={d.id} d0={d} podeGerenciar={dono || perms.includes('transmissores.gerenciar')} podeControlar={dono || perms.includes('aparelhos.controlar')} />)}
    </>
  )
}
