import { useState } from 'react'
import { BellRing, Check, Download, Play } from 'lucide-react'
import { api, dataHora, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Interruptor, Selo, useDados, useToast } from '../components/ui'
import { motion } from 'framer-motion'

const AGENDA_LEGIVEL = {
'*/5 * * * *': 'a cada 5 min', '*/15 * * * *': 'a cada 15 min', '*/30 * * * *': 'a cada 30 min',
'5 * * * *': 'de hora em hora', '20 * * * *': 'de hora em hora', '0 5 * * *': 'diário, 2h',
'30 6 * * *': 'diário, 3h30', '45 6 * * *': 'diário, 3h45', '0 */6 * * *': 'a cada 6 h', '0 7 * * 0': 'domingo, 4h',
}

function Grafico({ dados }) {
  if (!dados.length) return <p className="py-6 text-center text-sm text-muted-foreground">As métricas aparecem depois da primeira hora de uso.</p>
  const max = Math.max(1, ...dados.map((d) => d.comandos))
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Comandos por dia">
        {dados.map((d) => (
          <div key={d.dia} className="group relative flex flex-1 flex-col justify-end" title={`${d.dia.split('-').reverse().slice(0, 2).join('/')}: ${d.comandos} comandos, ${d.falhas} falhas`}>
            <div className="w-full rounded-t-sm bg-marca-500/80" style={{ height: `${(d.comandos / max) * 100}%`, minHeight: d.comandos ? 3 : 0 }} />
            {d.falhas > 0 && <div className="w-full bg-red-500/80" style={{ height: `${(d.falhas / max) * 100}%`, minHeight: 2 }} />}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[10px] text-muted-foreground">
        {dados.map((d) => <span key={d.dia} className="flex-1 text-center">{d.dia.slice(8)}</span>)}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-marca-500" /> Comandos</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-red-500" /> Falhas</span>
      </div>
    </div>
  )
}

export default function Supabase() {
  const { dados, erro, recarregar } = useDados(() => Promise.all([
    api.get('/api/supabase/resumo'), api.get('/api/supabase/rotinas'), api.get('/api/metricas?dias=14'), api.get('/api/alertas'),
  ]))
  const [rodando, setRodando] = useState(null)
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [resumo, rotinas, metricas, alertas] = dados
  const uso = resumo.saude ? (resumo.saude.tamanho_banco_mb / resumo.limite_mb) * 100 : 0

  const executar = async (r) => {
    setRodando(r.jobname)
    try { await api.post(`/api/supabase/rotinas/${r.jobname}/executar`); toast(`${r.jobname.replace('clima_', '')} executada.`); recarregar() }
    catch (e) { toast(e.message, 'erro') } finally { setRodando(null) }
  }
  const alternar = async (r, ativo) => {
    try { await api.put(`/api/supabase/rotinas/${r.jobname}`, { ativo }); recarregar() } catch (e) { toast(e.message, 'erro') }
  }
  const baixar = async (b) => {
    const conteudo = await api.get(`/api/supabase/backups/${b.id}`)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(conteudo, null, 2)], { type: 'application/json' }))
    a.download = `clima-casa-backup-${new Date(b.criado_em * 1000).toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      <Cabecalho titulo="Supabase" descricao={`Banco de dados, rotinas automáticas (pg_cron) e backups do projeto ${resumo.projeto}.`} />

      <FaixaMetricas itens={[
        { rotulo: 'Uso do banco', valor: resumo.saude ? resumo.saude.tamanho_banco_mb : '—', casas: 1, sufixo: ' MB', dica: `${uso.toFixed(1)}% dos ${resumo.limite_mb} MB do plano gratuito`, tom: uso > 80 ? 'ruim' : 'bom' },
        { rotulo: 'Rotinas ativas', valor: rotinas.filter((r) => r.active).length, sufixo: ` / ${rotinas.length}`, dica: `${rotinas.reduce((t, r) => t + Number(r.falhas_7d || 0), 0)} falhas em 7 dias`, tom: rotinas.some((r) => Number(r.falhas_7d)) ? 'ruim' : '' },
        { rotulo: 'Backups guardados', valor: resumo.backups.length, dica: resumo.backups[0] ? `último ${haQuanto(resumo.backups[0].criado_em)}` : 'nenhum ainda' },
        { rotulo: 'Histórico guardado', valor: resumo.saude?.linhas_atividade ?? 0, dica: 'registros de atividade (90 dias)' },
      ]} />
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" title="Uso do banco">
        <motion.div className={`h-full rounded-full ${uso > 80 ? 'bg-red-500' : 'bg-primary'}`} initial={{ width: 0 }} animate={{ width: `${Math.min(100, uso)}%` }} transition={{ duration: 0.8 }} />
      </div>

      {alertas.length > 0 && (
        <div className="cartao mt-6 divide-y divide-border border-amber-300 dark:border-amber-800">
          <h2 className="flex items-center gap-2 px-4 py-3 text-sm font-semibold"><BellRing className="h-4 w-4 text-amber-600" /> Alertas abertos</h2>
          {alertas.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div><p>{a.mensagem}</p><p className="text-xs text-muted-foreground">{haQuanto(a.criado_em)}</p></div>
              <Botao variante="secundario" tamanho="sm" icone={Check} onClick={async () => { await api.post(`/api/alertas/${a.id}/resolver`); recarregar() }}>Resolver</Botao>
            </div>
          ))}
        </div>
      )}

      <div className="cartao mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold">Comandos por dia (14 dias)</h2>
        <Grafico dados={metricas} />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground ">Rotinas automáticas</h2>
      <div className="cartao overflow-x-auto">
        <table className="tabela w-full min-w-[720px]">
          <thead><tr><th>Rotina</th><th>Frequência</th><th>Última execução</th><th>7 dias</th><th>Ativa</th><th></th></tr></thead>
          <tbody>
            {rotinas.map((r) => (
              <tr key={r.jobid}>
                <td>
                  <p className="font-medium">{r.jobname.replace('clima_', '').replaceAll('_', ' ')}</p>
                  <p className="text-xs text-muted-foreground">{r.descricao}</p>
                </td>
                <td className="whitespace-nowrap text-muted-foreground dark:text-muted-foreground/70">{AGENDA_LEGIVEL[r.schedule] || r.schedule}</td>
                <td className="whitespace-nowrap">
                  {r.ultimo_em ? (
                    <span className="flex items-center gap-2">
                      {r.ultimo_status === 'succeeded' ? <Selo cor="verde">OK</Selo> : r.ultimo_status === 'failed' ? <Selo cor="vermelho">Falhou</Selo> : <Selo>{r.ultimo_status}</Selo>}
                      <span className="text-xs text-muted-foreground" title={dataHora(r.ultimo_em)}>{haQuanto(r.ultimo_em)}</span>
                    </span>
                  ) : <span className="text-xs text-muted-foreground">ainda não rodou</span>}
                </td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">{r.execucoes_7d} execuções{Number(r.falhas_7d) ? `, ${r.falhas_7d} falhas` : ''}</td>
                <td><Interruptor ligado={r.active} onChange={(v) => alternar(r, v)} rotulo={`Ativar ${r.jobname}`} /></td>
                <td><Botao variante="fantasma" tamanho="sm" icone={Play} carregando={rodando === r.jobname} onClick={() => executar(r)}>Rodar</Botao></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ajuda mt-2">Horários das rotinas no fuso de Brasília. O Supabase guarda as execuções por 7 dias.</p>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground ">Backups automáticos</h2>
      <div className="cartao divide-y divide-border">
        {resumo.backups.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">O primeiro backup é feito às 2h.</p>}
        {resumo.backups.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <div>
              <p>{dataHora(b.criado_em)}</p>
              <p className="text-xs text-muted-foreground">{b.aparelhos} aparelho(s), {b.codigos} botões · {(b.bytes / 1024).toFixed(1)} KB</p>
            </div>
            <Botao variante="secundario" tamanho="sm" icone={Download} onClick={() => baixar(b)}>Baixar</Botao>
          </div>
        ))}
      </div>
    </>
  )
}
