'use client'
import { useCallback, useEffect, useState } from 'react'
import { Activity, AirVent, CalendarClock, Cpu, Database, RefreshCw, Server, Smartphone } from 'lucide-react'
import { SISTEMA_URL } from '@/lib/dados'

// Status ao vivo do sistema (lê /api/site/status a cada 30 s). Mostra só o que é seguro mostrar.
const fmt = (s) => (s == null ? '—' : s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`)

export default function Status() {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const buscar = useCallback(async () => {
    setCarregando(true)
    try { const r = await fetch(`${SISTEMA_URL}/api/site/status`, { cache: 'no-store' }); if (!r.ok) throw new Error(); setD(await r.json()); setErro(false) } catch { setErro(true) } finally { setCarregando(false) }
  }, [])
  useEffect(() => { buscar(); const t = setInterval(buscar, 30000); return () => clearInterval(t) }, [buscar])
  const itens = d ? [
    [Server, 'Sistema (API)', d.api.ok, 'respondendo'],
    [Database, 'Banco de dados', d.banco.ok, d.banco.ok ? `respondeu em ${d.banco.ms} ms` : 'sem resposta'],
    [Cpu, 'Agente do escritório', d.agente.ok, d.agente.ok ? `último sinal há ${fmt(d.agente.visto_ha_s)}` : `sem sinal há ${fmt(d.agente.visto_ha_s)}`],
    [AirVent, 'Transmissores infravermelho', d.transmissores.total === 0 || d.transmissores.online === d.transmissores.total, `${d.transmissores.online} de ${d.transmissores.total} na rede`],
    [CalendarClock, 'Rotinas automáticas', d.rotinas.falhas_24h === 0, `${d.rotinas.execucoes_24h} execuções em 24 h · ${d.rotinas.falhas_24h} falha(s)`],
    [Smartphone, 'Apps', true, `Android ${d.apps.android.versao} · computador ${d.apps.desktop.versao}`],
  ] : []
  const tudoOk = itens.every((i) => i[2])
  return (
    <div className="status-caixa">
      <div className={`status-geral ${erro ? 'ruim' : !d ? '' : tudoOk ? 'bom' : 'atencao'}`}>
        <span className="status-ponto" />
        <div><strong>{erro ? 'Não foi possível consultar o sistema agora' : !d ? 'Consultando…' : tudoOk ? 'Tudo funcionando' : 'Funcionando, com algum ponto de atenção'}</strong>
          <small>{d ? `Verificado às ${new Date(d.verificado_em * 1000).toLocaleTimeString('pt-BR')} · atualiza a cada 30 s` : 'Lendo o estado ao vivo'}</small></div>
        <button onClick={buscar} aria-label="Atualizar agora" className={carregando ? 'girando' : ''}><RefreshCw size={18} /></button>
      </div>
      <ul className="status-lista">
        {itens.map(([I, n, ok, det]) => (
          <li key={n}><span className="status-icone"><I size={20} /></span><div><strong>{n}</strong><small>{det}</small></div><span className={`status-selo ${ok ? 'bom' : 'atencao'}`}>{ok ? 'Normal' : 'Atenção'}</span></li>
        ))}
      </ul>
      <p className="status-nota"><Activity size={14} /> Se o agente do escritório ficar sem sinal, os comandos tentam a nuvem da Tuya e a Alexa continua respondendo pelo Sinric Pro.</p>
    </div>
  )
}
