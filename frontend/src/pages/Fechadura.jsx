import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BatteryMedium, DoorClosed, DoorOpen, Link2, Lock, LockOpen, ShieldAlert, Timer } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import Turnstile from '../components/Turnstile'
import { ConectarAparelho, Estado, Historico, Travas, SemAparelho, useDispositivos } from '../components/dispositivos/Comum'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, useToast } from '../components/ui'

// Fechadura eletrônica da porta do escritório (só ela). Trancar/destrancar pela internet depende do modelo aceitar
// comando remoto; estado, bateria e sensor de porta aparecem quando a fechadura informa.
function Cadeado({ trancada }) {
  const parado = useReducedMotion()
  const cor = trancada === true ? 'text-emerald-600 dark:text-emerald-400' : trancada === false ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
  const I = trancada === false ? LockOpen : Lock
  return (
    <motion.div key={String(trancada)} initial={parado ? false : { scale: 0.85, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className={`mx-auto flex h-28 w-28 items-center justify-center rounded-full border-4 border-current ${cor}`}>
      <I className="h-12 w-12" />
    </motion.div>
  )
}

function Painel({ d0, pode }) {
  const toast = useToast()
  const [d, setD] = useState(d0)
  const [versao, setVersao] = useState(0)
  const [conectar, setConectar] = useState(false)
  const [ocupado, setOcupado] = useState('')
  const [pedir, setPedir] = useState(false)
  const [senha, setSenha] = useState('')
  const [robo, setRobo] = useState('')
  const refRobo = useRef(null)
  const [cfg, setCfg] = useState({ auto_trancar_min: d0.config.auto_trancar_min, alertar_fora_expediente: d0.config.alertar_fora_expediente, expediente: d0.config.expediente })
  const atualizar = (n) => { setD(n); setVersao((v) => v + 1) }
  const cmd = async (acao, extra = {}) => {
    setOcupado(acao)
    try { atualizar(await api.post(`/api/dispositivos/${d.id}/comando`, { acao, ...extra })); toast(acao === 'trancar' ? 'Porta trancada.' : 'Porta destrancada.'); setPedir(false); setSenha('') }
    catch (e) { toast(e.message, 'erro'); refRobo.current?.reiniciar?.() } finally { setOcupado('') }
  }
  const salvar = async () => { setOcupado('cfg'); try { atualizar(await api.put(`/api/dispositivos/${d.id}/config`, cfg)); toast('Ajustes salvos.') } catch (e) { toast(e.message, 'erro') } finally { setOcupado('') } }
  const r = d.resumo || {}
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section className="cartao space-y-4 p-6 text-center">
          <Cadeado trancada={r.trancada} />
          <div><p className="text-xl font-semibold">{r.trancada === true ? 'Trancada' : r.trancada === false ? 'Destrancada' : 'Estado desconhecido'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{d.nome}</p><div className="mt-2 flex justify-center"><Estado d={d} /></div></div>
          {!d.conectado && <div className="text-left"><SemAparelho d={d} aoConectar={(aba) => setConectar(aba || true)} /></div>}
          <div className="flex flex-wrap justify-center gap-2">
            <Botao icone={Lock} disabled={!pode || !d.conectado} carregando={ocupado === 'trancar'} onClick={() => cmd('trancar')}>Trancar</Botao>
            <Botao variante="secundario" icone={LockOpen} disabled={!pode || !d.conectado} onClick={() => setPedir(true)}>Destrancar…</Botao>
            {pode && <Botao variante="secundario" icone={Link2} onClick={() => setConectar(true)}>{d.conectado ? 'Trocar fechadura' : 'Conectar fechadura'}</Botao>}
          </div>
          {!pode && <p className="text-xs text-muted-foreground">Só o dono e os administradores trancam e destrancam.</p>}
        </section>
        <FaixaMetricas itens={[
          { rotulo: 'Porta', valor: r.porta_aberta == null ? '—' : r.porta_aberta ? 'Aberta' : 'Fechada', dica: 'sensor da fechadura, se tiver', tom: r.porta_aberta ? 'ruim' : undefined },
          { rotulo: 'Bateria', valor: r.bateria ?? '—', sufixo: typeof r.bateria === 'number' ? '%' : '', tom: typeof r.bateria === 'number' && r.bateria < 20 ? 'ruim' : undefined },
          { rotulo: 'Trancar sozinha', valor: d.config.auto_trancar_min ? `${d.config.auto_trancar_min} min` : 'Não' },
          { rotulo: 'Alarme', valor: r.alarme || 'Nenhum', tom: r.alarme ? 'ruim' : undefined },
        ]} />
      </div>
      <div className="space-y-6">
        <section className="cartao p-5">
          <h2 className="text-sm font-semibold">Regras de segurança</h2>
          <div className="mt-3 space-y-3">
            <label className="block text-xs text-muted-foreground"><Timer className="mr-1 inline h-3.5 w-3.5" />Trancar sozinha depois de destrancada (min, 0 = não)<input type="number" min="0" max="240" className="campo mt-1 h-9" value={cfg.auto_trancar_min ?? 0} onChange={(e) => setCfg({ ...cfg, auto_trancar_min: +e.target.value })} disabled={!pode} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cfg.alertar_fora_expediente} onChange={(e) => setCfg({ ...cfg, alertar_fora_expediente: e.target.checked })} disabled={!pode} /><ShieldAlert className="h-4 w-4 text-muted-foreground" />Avisar se ficar destrancada fora do expediente</label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground">Expediente das<input type="time" className="campo mt-1 h-9" value={cfg.expediente?.[0] || '07:00'} onChange={(e) => setCfg({ ...cfg, expediente: [e.target.value, cfg.expediente?.[1] || '19:00'] })} disabled={!pode} /></label>
              <label className="text-xs text-muted-foreground">até<input type="time" className="campo mt-1 h-9" value={cfg.expediente?.[1] || '19:00'} onChange={(e) => setCfg({ ...cfg, expediente: [cfg.expediente?.[0] || '07:00', e.target.value] })} disabled={!pode} /></label>
            </div>
          </div>
          {pode && <Botao tamanho="sm" className="mt-3" carregando={ocupado === 'cfg'} onClick={salvar}>Salvar regras</Botao>}
          <p className="mt-3 text-[11px] text-muted-foreground">Destrancar pela internet só funciona se o modelo da fechadura aceitar comando remoto; quando não aceita, a tela avisa e o resto (estado, bateria, histórico, avisos) continua.</p>
        </section>
        <Travas d={d} aoMudar={atualizar} />
        <Historico d={d} versao={versao} />
      </div>
      <Modal aberto={pedir} titulo="Destrancar a porta do escritório" onFechar={() => setPedir(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); cmd('destrancar', { senha, turnstile: robo }) }}>
          <p className="text-sm text-muted-foreground">Confirme a sua senha. Fica registrado quem destrancou e quando.</p>
          <input type="password" autoComplete="current-password" className="campo" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha" aria-label="Sua senha" />
          <Turnstile ref={refRobo} aoMudar={setRobo} acao="conta" />
          <div className="flex justify-end gap-2"><Botao variante="secundario" type="button" onClick={() => setPedir(false)}>Cancelar</Botao><Botao type="submit" icone={DoorOpen} carregando={ocupado === 'destrancar'} disabled={!senha}>Destrancar</Botao></div>
        </form>
      </Modal>
      <ConectarAparelho d={d} aberto={!!conectar} abaInicial={conectar === 'placa' ? 'placa' : undefined} aoFechar={() => setConectar(false)} aoConectar={atualizar} />
    </div>
  )
}

export default function Fechadura() {
  const { sessao } = useProjeto()
  const { dados, erro } = useDispositivos('fechadura')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  return (
    <>
      <Cabecalho titulo="Fechadura" descricao="A fechadura eletrônica da porta do escritório: estado, trancar e destrancar com a sua senha, trancar sozinha, aviso fora do expediente e quem fez o quê." />
      {!dados.length ? <Vazio icone={DoorClosed} titulo="Nenhuma fechadura cadastrada" texto="Peça ao administrador para cadastrar a fechadura da porta do escritório." />
        : dados.map((d) => <Painel key={d.id} d0={d} pode={pode} />)}
    </>
  )
}
