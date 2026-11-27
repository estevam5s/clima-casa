import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, Clock, History, Layers, ShieldCheck, Timer, XCircle } from 'lucide-react'
import { api, dataHora, haQuanto } from '../../api'
import { Esqueleto, Selo } from '../ui'

// Painel do backup (GET /api/backup-sistema/painel): o quanto se perderia hoje (RPO), quanto tempo leva voltar (RTO, medido no
// teste de restauração), a linha do tempo das cópias, o que a retenção 7/4/12 mantém, as maiores tabelas e quem mexeu.
const COR_TIPO = { 'gerado aqui': 'hsl(var(--primary))', agendado: '#2563a8', 'antes de restaurar': '#d97706', enviado: '#7c3aed' }
const mb = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`

function Indicador({ icone: I, rotulo, valor, dica, estado }) {
  const cor = { bom: 'text-emerald-600 dark:text-emerald-400', alerta: 'text-amber-600 dark:text-amber-400', ruim: 'text-red-600 dark:text-red-400' }[estado] || ''
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><I className="h-3.5 w-3.5" />{rotulo}</p>
      <p className={`mt-1 text-xl font-semibold tabular ${cor}`}>{valor}</p>
      <p className="text-xs text-muted-foreground">{dica}</p>
    </div>
  )
}

export default function PainelBackup({ versao }) {
  const reduzir = useReducedMotion()
  const [p, setP] = useState(null)
  useEffect(() => { api.get('/api/backup-sistema/painel').then(setP).catch(() => setP({ erro: true })) }, [versao])
  if (!p) return <Esqueleto className="h-80" />
  if (p.erro) return null
  const r = p.recuperacao
  const rpo = r.rpo_horas
  const maxLinhas = Math.max(1, ...p.maiores_tabelas.map((t) => t.linhas))
  const saem = p.retencao.filter((x) => !x.fica)
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Recuperação, histórico e retenção</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador icone={Clock} rotulo="Perda máxima hoje (RPO)" valor={rpo == null ? 'sem backup' : rpo < 48 ? `${rpo.toLocaleString('pt-BR')} h` : `${Math.round(rpo / 24)} dias`}
          dica="o que se perderia se precisasse voltar agora" estado={rpo == null ? 'ruim' : rpo <= 24 ? 'bom' : rpo <= 72 ? 'alerta' : 'ruim'} />
        <Indicador icone={Timer} rotulo="Tempo para restaurar (RTO)" valor={r.rto_segundos != null ? `${r.rto_segundos.toLocaleString('pt-BR')} s` : 'não medido'}
          dica={r.rto_segundos != null ? 'medido no último teste de restauração' : 'rode "Testar restauração" para medir'} estado={r.rto_segundos != null ? 'bom' : 'alerta'} />
        <Indicador icone={r.teste?.ok ? CheckCircle2 : XCircle} rotulo="Último teste de restauração" valor={r.teste?.em ? (r.teste.ok ? 'passou' : 'falhou') : 'nunca'}
          dica={r.teste?.em ? `${haQuanto(r.teste.em)} · ${r.teste.tabelas} tabela(s)` : 'confere se o backup volta de verdade'} estado={!r.teste?.em ? 'alerta' : r.teste.ok ? 'bom' : 'ruim'} />
        <Indicador icone={History} rotulo="Próximo backup agendado" valor={r.agenda?.ativo && r.agenda.proximo ? dataHora(r.agenda.proximo) : 'desligado'}
          dica={r.agenda?.ativo ? `${{ diario: 'todo dia', semanal: 'toda semana', '6h': 'a cada 6 h', '12h': 'a cada 12 h' }[r.agenda.frequencia] || r.agenda.frequencia} às ${r.agenda.hora}, no agente do escritório` : 'ligue em Agendamento, abaixo'} estado={r.agenda?.ativo ? 'bom' : 'alerta'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Linha do tempo das cópias</h3>
          {!p.linha_tempo.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma cópia guardada.</p> : (
            <div className="mt-2 h-48"><ResponsiveContainer width="100%" height="100%">
              <BarChart data={p.linha_tempo.map((a) => ({ ...a, mb: +(a.tamanho / 1048576).toFixed(2), dia: new Date(a.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }))} margin={{ top: 6, right: 6, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} MB`} />
                <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v, _n, it) => [`${v} MB`, it.payload.rotulo || it.payload.tipo]} labelFormatter={(_l, it) => it?.[0]?.payload?.arquivo || ''} />
                <Bar dataKey="mb" radius={[4, 4, 0, 0]}>{p.linha_tempo.map((a, i) => <Cell key={i} fill={COR_TIPO[a.tipo] || 'hsl(var(--muted-foreground))'} />)}</Bar>
              </BarChart></ResponsiveContainer></div>
          )}
          <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">{Object.entries(COR_TIPO).map(([k, c]) => <span key={k} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: c }} />{k}</span>)}</div>
        </div>
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-medium"><Layers className="h-4 w-4" />Maiores tabelas</h3>
          <ul className="mt-2 space-y-1.5">{p.maiores_tabelas.map((t, i) => (
            <li key={t.tabela} className="text-xs">
              <div className="flex justify-between gap-2"><span className="truncate font-mono">{t.tabela}</span><span className="shrink-0 tabular text-muted-foreground">{t.linhas.toLocaleString('pt-BR')} linhas{!t.restauravel && ' · não restaura'}</span></div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary/70" initial={{ width: reduzir ? `${(t.linhas / maxLinhas) * 100}%` : 0 }} animate={{ width: `${(t.linhas / maxLinhas) * 100}%` }} transition={{ delay: i * 0.03, duration: 0.5 }} /></div>
            </li>))}</ul>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Retenção 7 diários, 4 semanais e 12 mensais</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">O que a regra faria hoje com as cópias automáticas e as feitas antes de restaurar. As que você gera à mão nunca saem sozinhas.</p>
          {!p.retencao.length ? <p className="mt-2 text-sm text-muted-foreground">Ainda não há cópias automáticas: ligue o agendamento para a regra começar a valer.</p> : (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">{p.retencao.map((x) => (
              <li key={x.arquivo} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate font-mono">{x.arquivo}</span>
                {x.fica ? x.motivos.map((m) => <Selo key={m} cor="verde">{m}</Selo>) : <Selo cor="ambar">sai na próxima limpeza</Selo>}</li>))}</ul>
          )}
          {saem.length > 0 && <p className="mt-1 text-xs text-amber-600">{saem.length} cópia(s) saem na próxima limpeza.</p>}
        </div>
        <div>
          <h3 className="text-sm font-medium">Histórico de operações</h3>
          {!p.historico.length ? <p className="mt-2 text-sm text-muted-foreground">Nada ainda.</p> : (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">{p.historico.map((h, i) => (
              <li key={i} className="flex gap-2">{h.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                <span className="min-w-0 flex-1 truncate">{h.acao}{h.usuario ? ` · ${h.usuario}` : ''}{h.detalhe ? <span className="text-muted-foreground"> · {h.detalhe}</span> : ''}</span>
                <span className="shrink-0 text-muted-foreground">{haQuanto(h.quando)}</span></li>))}</ul>
          )}
        </div>
      </div>
    </section>
  )
}
