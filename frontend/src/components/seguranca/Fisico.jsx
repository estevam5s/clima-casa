import { useState } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { useProjeto } from '../../contexto'
import { Aviso, Botao, Carregando, useDados, useToast } from '../ui'

// Segurança → Comandos físicos (backend/app/fisico.py): as travas que valem para qualquer origem, os aparelhos isolados
// e o que foi recusado nas últimas 24 h. Isolar = o aparelho só aceita o estado seguro (desligar, fechar, parar, trancar).
const NOMES = { ar: 'Ar-condicionado', luz: 'Luz', cafeteira: 'Cafeteira', persiana: 'Persiana', fechadura: 'Fechadura' }

export default function Fisico() {
  const { dados, erro, recarregar } = useDados(() => api.get('/api/seguranca/fisico'))
  const { sessao } = useProjeto()
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const toast = useToast()
  const [novo, setNovo] = useState({ alvo: '', motivo: '' })
  const [ocupado, setOcupado] = useState('')
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const mudar = async (tipo, id, isolar, motivo = '') => {
    setOcupado(`${tipo}:${id}`)
    try { await api.post('/api/seguranca/isolar', { tipo, id, isolar, motivo }); toast(isolar ? 'Aparelho isolado.' : 'Aparelho liberado.'); setNovo({ alvo: '', motivo: '' }); recarregar() }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado('') }
  }
  const isolados = [...dados.isolados.aparelhos.map((x) => ({ ...x, tipo: 'aparelhos' })), ...dados.isolados.dispositivos.map((x) => ({ ...x, tipo: 'dispositivos' }))]
  const [tipoN, idN] = novo.alvo.split(':')
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="cartao p-5">
        <h2 className="titulo-secao">Travas em todo comando</h2>
        <p className="mt-1 text-sm text-muted-foreground">Conferidas no servidor antes de o sinal sair, venha de onde vier: painel, apps, Alexa, Telegram, Assistente de IA, agenda ou automação.</p>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="py-2 font-medium">Aparelho</th><th className="py-2 font-medium">Comandos por minuto</th></tr></thead>
          <tbody>{Object.entries(dados.limite_minuto).map(([k, n]) => <tr key={k} className="border-b border-border/60"><td className="py-2">{NOMES[k] || k}</td><td className="py-2 tabular">até {n}</td></tr>)}</tbody>
        </table>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Estado seguro sempre passa: {dados.seguras.join(', ')}. Nenhuma trava impede deixar o equipamento seguro.</li>
          <li>Ar: no máximo {dados.liga_desliga_10min} trocas de ligado/desligado em 10 min (protege o compressor; a proteção do fabricante continua valendo).</li>
          <li>Sinal de infravermelho parado na fila por mais de 20 s é descartado: o ar não liga minutos depois de a tela ter dito que falhou.</li>
          <li>Placa própria: pedido não buscado a tempo expira (destrancar em {dados.validade_placa_s.destrancar} s, o resto em {dados.validade_placa_s.padrao} s).</li>
          <li>Cafeteira sem tempo escolhido desliga sozinha em {dados.cafeteira_max_min} min.</li>
          <li>Temperatura sempre dentro da faixa cadastrada de cada ar.</li>
        </ul>
      </section>

      <section className="cartao p-5">
        <h2 className="titulo-secao">Aparelhos isolados</h2>
        <p className="mt-1 text-sm text-muted-foreground">Suspeita de uso indevido (comandos que ninguém reconhece, conta comprometida)? Isole o aparelho: ele passa a aceitar só o estado seguro até alguém liberar.</p>
        {!isolados.length ? <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-600" />Nenhum aparelho isolado.</p> : (
          <ul className="mt-4 space-y-2">{isolados.map((x) => (
            <li key={`${x.tipo}:${x.id}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0 flex-1"><p className="font-medium">{x.nome}</p><p className="text-xs text-muted-foreground">{x.motivo} · {x.por} · {haQuanto(x.em)}</p></div>
              {pode && <Botao tamanho="sm" variante="secundario" carregando={ocupado === `${x.tipo}:${x.id}`} onClick={() => mudar(x.tipo, x.id, false)}>Liberar</Botao>}
            </li>))}
          </ul>
        )}
        {pode && (
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
            <select className="campo h-9 sm:w-56" value={novo.alvo} onChange={(e) => setNovo({ ...novo, alvo: e.target.value })} aria-label="Aparelho para isolar">
              <option value="">Escolha o aparelho…</option>
              <optgroup label="Ares">{dados.opcoes.aparelhos.map((a) => <option key={a.id} value={`aparelhos:${a.id}`}>{a.nome}</option>)}</optgroup>
              <optgroup label="Luzes, cafeteira, persianas, fechadura">{dados.opcoes.dispositivos.map((a) => <option key={a.id} value={`dispositivos:${a.id}`}>{a.nome}</option>)}</optgroup>
            </select>
            <input className="campo h-9 min-w-0 flex-1" maxLength={200} placeholder="Motivo (fica na auditoria)" value={novo.motivo} onChange={(e) => setNovo({ ...novo, motivo: e.target.value })} aria-label="Motivo" />
            <Botao tamanho="sm" variante="perigo" className="h-9" disabled={!novo.alvo || novo.motivo.trim().length < 3} carregando={!!novo.alvo && ocupado === novo.alvo} onClick={() => mudar(tipoN, +idN, true, novo.motivo)}>Isolar</Botao>
          </div>
        )}
      </section>

      <section className="cartao p-5 xl:col-span-2">
        <h2 className="titulo-secao">Comandos recusados nas últimas 24 h</h2>
        {!dados.bloqueios_24h.length ? <p className="mt-2 text-sm text-muted-foreground">Nenhum comando foi recusado pelas travas.</p> : (
          <ul className="mt-3 divide-y divide-border text-sm">{dados.bloqueios_24h.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 py-2"><span className="h-2 w-2 rounded-full bg-red-500" /><span className="font-medium">{b.acao}</span>
              <span className="text-xs text-muted-foreground">{b.detalhe} · {haQuanto(b.quando)}</span></li>))}
          </ul>
        )}
      </section>
    </div>
  )
}
