import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, BellRing, Building2, CalendarOff, Download, FileJson, Info, Power, RefreshCw, Thermometer } from 'lucide-react'
import { api } from '../../api'
import RegrasAgenda from '../RegrasAgenda'
import { Aviso, Botao, Carregando, Interruptor, Secao, useDados, useToast } from '../ui'

// Configurações → Geral: identificação, envio dos comandos, política de temperatura, proteções automáticas (o agente
// desliga ou avisa), limpeza, feriados, atualização dos agentes, backup, exportação e resumo do sistema.
const MODOS_ENVIO = [
  ['auto', 'Automático', 'Rede local primeiro; se o transmissor não responder, usa a nuvem Tuya.'],
  ['local', 'Só rede local', 'Nada passa pela internet. Só funciona com o transmissor na mesma rede.'],
  ['nuvem', 'Só nuvem', 'Sempre pela nuvem Tuya. Útil se este computador estiver em outra rede.'],
]
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const baixar = (nome, tipo, texto) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nome; a.click(); URL.revokeObjectURL(a.href) }

function Numero({ id, rotulo, valor, onChange, min = 0, max, sufixo, ajuda }) {
  return (
    <div>
      <label className="rotulo" htmlFor={id}>{rotulo}</label>
      <div className="flex items-center gap-2">
        <input id={id} type="number" inputMode="numeric" min={min} max={max} className="campo w-24" value={valor} onChange={(e) => onChange(Math.max(min, Math.min(max, +e.target.value || 0)))} />
        {sufixo && <span className="text-sm text-muted-foreground">{sufixo}</span>}
      </div>
      {ajuda && <p className="ajuda">{ajuda}</p>}
    </div>
  )
}

export default function Geral({ dados, salvar, sessao }) {
  const toast = useToast()
  const gestor = ['dono', 'admin'].includes(sessao?.papel)
  const { dados: g, setDados: setG } = useDados(() => api.get('/api/config/geral'))
  const { dados: sis, recarregar: recarregarSis } = useDados(() => api.get('/api/config/sistema'))
  const { dados: ag, setDados: setAg } = useDados(() => (gestor ? api.get('/api/agentes').catch(() => null) : Promise.resolve(null)), [gestor])
  const [f, setF] = useState(null)
  const [ident, setIdent] = useState({ nome_casa: dados.nome_casa, tarifa_kwh: dados.tarifa_kwh })
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (g && !f) setF(g) }, [g, f])

  const mudou = f && g && JSON.stringify({ ...f, ultimo: 0 }) !== JSON.stringify({ ...g, ultimo: 0 })
  const salvarGeral = async () => {
    setSalvando(true)
    try { const r = await api.put('/api/config/geral', { ...f, ultimo: undefined }); setG(r); setF(r); toast('Regras gerais salvas.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const exportar = async () => {
    try { const r = await api.get('/api/config/exportar'); baixar(`clima-escritorio-configuracoes-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(r, null, 2)); toast('Configurações exportadas (sem senhas nem chaves).') } catch (e) { toast(e.message, 'erro') }
  }
  const baixarBackup = async () => {
    try { const r = await api.get('/api/backup'); baixar(`clima-casa-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify(r, null, 2)) } catch (e) { toast(e.message, 'erro') }
  }
  const autoAtualizar = async (ativo) => {
    try { await api.put('/api/agentes/auto-atualizar', { ativo }); setAg({ ...ag, auto_atualizar: ativo }); toast(ativo ? 'Os agentes vão se atualizar sozinhos.' : 'Atualização automática desligada.') } catch (e) { toast(e.message, 'erro') }
  }
  const set = (k, v) => setF({ ...f, [k]: v })
  const setExp = (k, v) => setF({ ...f, expediente: { ...f.expediente, [k]: v } })

  return (
    <div className="space-y-6">
      {sis && (
        <section className="cartao p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="titulo-secao flex items-center gap-2"><Info className="h-4 w-4" />Resumo do sistema</h2>
              <p className="mt-1 text-sm text-muted-foreground">Versão <b className="font-medium text-foreground">{sis.versao}</b> de {new Date(`${sis.versao_data}T12:00`).toLocaleDateString('pt-BR')} ({sis.versoes} versões) · apps {sis.apps || '-'} · banco {sis.banco_mb.toLocaleString('pt-BR')} MB de 500 MB · agente no comando: {sis.principal || 'nenhum'}</p></div>
            <Botao tamanho="sm" variante="fantasma" icone={RefreshCw} onClick={recarregarSis}>Atualizar</Botao>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Object.entries(sis.contagens).map(([k, v]) => <div key={k} className="rounded-lg bg-muted/60 px-3 py-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="tabular text-lg font-semibold">{v.toLocaleString('pt-BR')}</dd></div>)}
          </dl>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="cartao p-5">
          <h2 className="titulo-secao flex items-center gap-2"><Building2 className="h-4 w-4" />Escritório e energia</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><label className="rotulo" htmlFor="nc">Nome do escritório</label><input id="nc" className="campo" maxLength={60} value={ident.nome_casa} onChange={(e) => setIdent({ ...ident, nome_casa: e.target.value })} /><p className="ajuda">Aparece nos relatórios e nas mensagens.</p></div>
            <div><label className="rotulo" htmlFor="tk">Tarifa de energia (R$ por kWh)</label><input id="tk" type="number" step="0.01" min="0" max="20" className="campo w-32" value={ident.tarifa_kwh} onChange={(e) => setIdent({ ...ident, tarifa_kwh: e.target.value })} /><p className="ajuda">Usada no gasto dos relatórios, do painel e do Telegram.</p></div>
          </div>
          <Botao className="mt-4" tamanho="sm" onClick={() => salvar({ nome_casa: ident.nome_casa, tarifa_kwh: +ident.tarifa_kwh })}>Salvar</Botao>
        </section>
        <section id="envio" className="cartao p-5">
          <h2 className="titulo-secao mb-4">Como os comandos são enviados</h2>
          <div className="space-y-2">
            {MODOS_ENVIO.map(([k, r, d]) => (
              <label key={k} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${dados.modo_envio === k ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="envio" className="mt-1 accent-[hsl(var(--primary))]" checked={dados.modo_envio === k} onChange={() => salvar({ modo_envio: k })} />
                <span><span className="block text-sm font-medium">{r}</span><span className="text-xs text-muted-foreground">{d}</span></span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {!f ? <Carregando /> : (
        <Secao titulo="Regras do escritório" contexto={gestor ? 'Valem para todos os ares e todas as pessoas. O agente do escritório confere a cada 5 minutos.' : 'Só o dono e os administradores mudam estas regras.'}>
          <fieldset disabled={!gestor} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Thermometer className="h-4 w-4" />Política de temperatura</h3>
              <p className="text-xs text-muted-foreground">Pedidos para ligar fora da faixa são recusados no painel, na Alexa, no Telegram, na agenda e nas automações. Desligar sempre passa. 0 = sem limite.</p>
              <div className="flex flex-wrap gap-4">
                <Numero id="tmin" rotulo="Mínima" valor={f.temp_min} max={30} sufixo="°" onChange={(v) => set('temp_min', v)} />
                <Numero id="tmax" rotulo="Máxima" valor={f.temp_max} max={30} sufixo="°" onChange={(v) => set('temp_max', v)} />
              </div>
              {f.temp_min > 0 && f.temp_max > 0 && f.temp_min > f.temp_max && <Aviso>A mínima não pode passar da máxima.</Aviso>}
            </div>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Power className="h-4 w-4" />Ar esquecido ligado</h3>
              <div className="flex flex-wrap gap-4">
                <Numero id="dap" rotulo="Desligar sozinho depois de" valor={f.desligar_apos_h} max={72} sufixo="horas" onChange={(v) => set('desligar_apos_h', v)} ajuda="0 = nunca. Avisa no sino quando desligar." />
                <Numero id="avl" rotulo="Avisar depois de" valor={f.aviso_ligado_h} max={72} sufixo="horas" onChange={(v) => set('aviso_ligado_h', v)} ajuda="0 = não avisar." />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4" />Expediente</h3>
              <label className="flex items-center gap-2 text-sm"><Interruptor ligado={f.aviso_fora_expediente} onChange={(v) => set('aviso_fora_expediente', v)} rotulo="Avisar ar ligado fora do expediente" />Avisar quando um ar estiver ligado fora do expediente</label>
              <div className="flex flex-wrap items-end gap-3">
                <div><label className="rotulo" htmlFor="ei">Começa</label><input id="ei" type="time" className="campo w-32" value={f.expediente.inicio} onChange={(e) => setExp('inicio', e.target.value)} /></div>
                <div><label className="rotulo" htmlFor="ef">Termina</label><input id="ef" type="time" className="campo w-32" value={f.expediente.fim} onChange={(e) => setExp('fim', e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap gap-1.5">{DIAS.map((d, i) => { const on = f.expediente.dias.includes(i); return (
                <button key={d} type="button" onClick={() => setExp('dias', on ? f.expediente.dias.filter((x) => x !== i) : [...f.expediente.dias, i])} aria-pressed={on}
                  className={`h-8 w-11 rounded-md border text-xs ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border text-muted-foreground'}`}>{d}</button>) })}</div>
            </div>
            <div className="space-y-3 rounded-xl border border-border p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Archive className="h-4 w-4" />Limpeza</h3>
              <Numero id="arq" rotulo="Arquivar notificações lidas há mais de" valor={f.arquivar_notif_dias} max={365} sufixo="dias" onChange={(v) => set('arquivar_notif_dias', v)} ajuda="0 = nunca. Arquivadas continuam na Central de notificações." />
              <p className="text-xs text-muted-foreground">A Atividade guarda 90 dias e os eventos de segurança 30 dias (rotinas do banco).</p>
            </div>
          </fieldset>
          {gestor && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Botao onClick={salvarGeral} carregando={salvando} disabled={!mudou || (f.temp_min > 0 && f.temp_max > 0 && f.temp_min > f.temp_max)}>Salvar regras</Botao>
              {mudou && <Botao variante="fantasma" onClick={() => setF(g)}>Desfazer</Botao>}
              {g?.ultimo?.em && <span className="text-xs text-muted-foreground">Última conferência do agente: {new Date(g.ultimo.em * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}{g.ultimo.desligados ? ` · ${g.ultimo.desligados} desligado(s)` : ''}{g.ultimo.arquivadas ? ` · ${g.ultimo.arquivadas} arquivada(s)` : ''}</span>}
            </div>
          )}
        </Secao>
      )}

      <Secao titulo="Feriados e férias" contexto="A agenda pula os horários em feriados e nos períodos cadastrados aqui.">
        <div className="flex items-start gap-2"><CalendarOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><RegrasAgenda podeMudar={gestor} /></div></div>
      </Secao>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {gestor && ag && (
          <section className="cartao p-5">
            <h2 className="titulo-secao">Atualização dos agentes</h2>
            <p className="mt-1 text-sm text-muted-foreground">Com isto ligado, cada computador do escritório baixa a versão nova sozinho (confere a cada 10 min).</p>
            <label className="mt-3 flex items-center gap-2 text-sm"><Interruptor ligado={!!ag.auto_atualizar} onChange={autoAtualizar} rotulo="Atualizar agentes sozinhos" />{ag.auto_atualizar ? 'Ligada' : 'Desligada'}</label>
            <Link to="/infra?aba=agentes" className="mt-3 inline-block text-sm text-primary hover:underline">Ver os agentes</Link>
          </section>
        )}
        <section className="cartao flex flex-col justify-between gap-3 p-5">
          <div><h2 className="titulo-secao">Backup rápido</h2><p className="mt-1 text-sm text-muted-foreground">Aparelhos, botões gravados e agendamentos em JSON. O backup completo, agendado e cifrado fica em Backup.</p></div>
          <div className="flex flex-wrap gap-2"><Botao variante="secundario" tamanho="sm" icone={Download} onClick={baixarBackup}>Baixar</Botao><Link to="/backup" className="inline-flex h-8 items-center rounded-md px-3 text-sm text-primary hover:underline">Abrir Backup</Link></div>
        </section>
        {gestor && (
          <section className="cartao flex flex-col justify-between gap-3 p-5">
            <div><h2 className="titulo-secao">Exportar configurações</h2><p className="mt-1 text-sm text-muted-foreground">Regras, zonas, marca, planta do mapa, rotinas de música e agenda do backup, sem nenhuma senha ou chave. Bom para guardar antes de mudar algo.</p></div>
            <Botao variante="secundario" tamanho="sm" icone={FileJson} onClick={exportar} className="self-start">Exportar JSON</Botao>
          </section>
        )}
      </div>
    </div>
  )
}
