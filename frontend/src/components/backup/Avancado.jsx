import { useEffect, useState } from 'react'
import { CalendarClock, Search, ShieldCheck, Undo2 } from 'lucide-react'
import { api, DIAS } from '../../api'
import { Aviso, Botao, Carregando, Interruptor, Modal, Selo, useToast } from '../ui'

// Recursos avançados do backup: agenda (o agente gera sozinho e guarda os N mais novos), conferir integridade,
// comparar dois backups e procurar linhas dentro de um backup para restaurar só elas.
export const fmtMB = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
export const fmtData = (v) => { const d = typeof v === 'number' ? new Date(v * 1000) : new Date(v); return isNaN(d) ? '—' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
const NOME_GRUPO = { essencial: 'Essencial', historico: 'Histórico', seguranca: 'Segurança', site: 'Site' }

export function Agenda({ agenda, grupos, aoSalvar }) {
  const toast = useToast()
  const [f, setF] = useState(() => ({ ...agenda, grupos: agenda.grupos || null }))
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setF({ ...agenda, grupos: agenda.grupos || null }) }, [agenda])
  const mudar = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const salvar = async (extra = {}) => {
    setSalvando(true)
    try {
      const corpo = { ...f, ...extra }
      await api.put('/api/backup-sistema/agenda', { ativo: corpo.ativo, frequencia: corpo.frequencia, hora: corpo.hora, dia_semana: Number(corpo.dia_semana), manter: Number(corpo.manter), grupos: corpo.grupos })
      toast(corpo.ativo ? 'Backup agendado salvo.' : 'Backup agendado desligado.'); aoSalvar()
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  return (
    <section className="cartao p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="titulo-secao flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" />Backup agendado</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">O agente do escritório gera o backup completo sozinho, no horário de Brasília, e apaga os agendados mais antigos. Se falhar, aparece na central de notificações.</p>
        </div>
        <Interruptor ligado={!!f.ativo} onChange={(v) => { mudar('ativo', v); salvar({ ativo: v }) }} rotulo="Backup agendado" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-sm"><span className="rotulo">Frequência</span>
          <select className="campo" value={f.frequencia} onChange={(e) => mudar('frequencia', e.target.value)}><option value="diario">Todo dia</option><option value="semanal">Uma vez por semana</option></select></label>
        {f.frequencia === 'semanal' && <label className="text-sm"><span className="rotulo">Dia</span>
          <select className="campo" value={f.dia_semana} onChange={(e) => mudar('dia_semana', e.target.value)}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>}
        <label className="text-sm"><span className="rotulo">Horário</span><input type="time" className="campo" value={f.hora} onChange={(e) => mudar('hora', e.target.value)} /></label>
        <label className="text-sm"><span className="rotulo">Guardar os últimos</span><input type="number" min={1} max={60} className="campo" value={f.manter} onChange={(e) => mudar('manter', e.target.value)} /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-sm">
        <button onClick={() => mudar('grupos', null)} className={`rounded-lg border px-2.5 py-1 ${!f.grupos ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>Tudo</button>
        {Object.keys(grupos).map((g) => { const on = f.grupos?.includes(g); return (
          <button key={g} onClick={() => mudar('grupos', on ? (f.grupos.filter((x) => x !== g).length ? f.grupos.filter((x) => x !== g) : null) : [...(f.grupos || []), g])}
            className={`rounded-lg border px-2.5 py-1 ${on ? 'border-primary bg-primary/10 font-medium' : 'border-border hover:bg-muted'}`}>{NOME_GRUPO[g] || g}</button>) })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Botao tamanho="sm" carregando={salvando} onClick={() => salvar()}>Salvar agenda</Botao>
        <p className="text-xs text-muted-foreground">
          {agenda.ativo && agenda.proximo ? `Próximo: ${fmtData(agenda.proximo)}. ` : 'Desligado. '}
          {agenda.ultimo ? (agenda.ultimo_ok ? `Último: ${fmtData(agenda.ultimo)}, ok.` : `Último: ${fmtData(agenda.ultimo)}, falhou (${agenda.ultimo_erro}).`) : 'Ainda não rodou.'}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Precisa de um agente ligado (Infra → Agentes). Sem agente, o backup diário do banco (às 02h) continua valendo.</p>
    </section>
  )
}

export function Conferir({ arquivo, aoFechar }) {
  const [d, setD] = useState(null), [erro, setErro] = useState('')
  useEffect(() => { api.get(`/api/backup-sistema/manifesto/${encodeURIComponent(arquivo)}`).then(setD).catch((e) => setErro(e.message)) }, [arquivo])
  return (
    <Modal aberto titulo="Conferir o backup" onFechar={aoFechar} largura="max-w-2xl">
      {erro ? <Aviso>{erro}</Aviso> : !d ? <Carregando /> : (
        <div className="space-y-3 text-sm">
          {d.integro ? <Aviso tipo="ok"><b>Íntegro.</b> Todas as tabelas batem com o sha256 gravado no manifesto.</Aviso>
            : <Aviso>Este arquivo foi alterado depois de gerado: pelo menos uma tabela não confere. Não restaure dele.</Aviso>}
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-xs">
            <dt className="text-muted-foreground">Gerado em</dt><dd>{fmtData(d.manifesto.gerado_em)}</dd>
            <dt className="text-muted-foreground">Por</dt><dd>{d.manifesto.gerado_por}</dd>
            {d.manifesto.tipo && <><dt className="text-muted-foreground">Tipo</dt><dd>{d.manifesto.tipo}</dd></>}
            {d.manifesto.versao_sistema && <><dt className="text-muted-foreground">Versão do sistema</dt><dd>{d.manifesto.versao_sistema}</dd></>}
            {d.manifesto.rotulo && <><dt className="text-muted-foreground">Nota</dt><dd>{d.manifesto.rotulo}</dd></>}
            <dt className="text-muted-foreground">Arquivos</dt><dd>{(d.manifesto.arquivos || []).length ? `${d.manifesto.arquivos.filter((a) => a.copia).length} copiado(s) (${fmtMB(d.manifesto.arquivos_bytes)}), guardados no Storage` : `${(d.manifesto.arquivos_3d || []).length} modelo(s) 3D listado(s), sem cópia`}</dd>
            <dt className="text-muted-foreground">Códigos</dt><dd>{(d.manifesto.codigos || []).length ? `${d.manifesto.codigos.length} arquivo(s): ${d.manifesto.codigos.filter((c) => c.startsWith('placas/')).length} placa(s) e instaladores` : 'não incluídos'}</dd>
          </dl>
          {(d.manifesto.arquivos || []).some((a) => a.copia) && <TrazerArquivos arquivo={arquivo} />}
          <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th className="px-3 py-1.5">Tabela</th><th className="px-3 py-1.5 text-right">Linhas</th><th className="px-3 py-1.5 text-right">Tamanho</th><th className="px-3 py-1.5">sha256</th></tr></thead>
              <tbody>{d.tabelas.map((t) => <tr key={t.tabela} className="border-t border-border/70"><td className="px-3 py-1 font-mono">{t.tabela}</td><td className="px-3 py-1 text-right tabular-nums">{t.linhas ?? '—'}</td><td className="px-3 py-1 text-right tabular-nums">{fmtMB(t.bytes)}</td>
                <td className="px-3 py-1">{t.ok === true ? <span className="text-emerald-600">confere</span> : t.ok === false ? <span className="font-medium text-red-600">não confere</span> : <span className="text-muted-foreground">sem hash</span>}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Devolve ao lugar os arquivos do backup que sumiram (ex.: modelo 3D apagado). Não sobrescreve os que existem.
function TrazerArquivos({ arquivo }) {
  const toast = useToast()
  const [palavra, setPalavra] = useState(''), [ocupado, setOcupado] = useState(false), [res, setRes] = useState(null)
  const ir = async () => {
    setOcupado(true)
    try { const r = await api.post('/api/backup-sistema/restaurar-arquivos', { arquivo, confirmacao: palavra }); setRes(r); toast(`${r.voltaram} arquivo(s) de volta; ${r.ja_existiam} já existiam.`) } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="font-medium">Trazer os arquivos de volta</p>
      <p className="text-xs text-muted-foreground">Copia de volta só os que não existem mais (por exemplo, um modelo 3D apagado). Nada que já existe é trocado. Digite RESTAURAR:</p>
      <div className="flex gap-2"><input className="campo font-mono" value={palavra} onChange={(e) => setPalavra(e.target.value)} aria-label="Digite RESTAURAR" />
        <Botao variante="secundario" carregando={ocupado} disabled={palavra !== 'RESTAURAR'} onClick={ir}>Trazer de volta</Botao></div>
      {res && <p className="text-xs text-muted-foreground">{res.voltaram} voltaram · {res.ja_existiam} já existiam · {res.falhas} falha(s)</p>}
    </div>
  )
}

export function Comparar({ a, b, aoFechar }) {
  const [d, setD] = useState(null), [erro, setErro] = useState('')
  useEffect(() => { api.get(`/api/backup-sistema/comparar?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`).then(setD).catch((e) => setErro(e.message)) }, [a, b])
  const mudou = d?.tabelas.filter((t) => t.entraram || t.sairam || t.mudaram || t.a !== t.b) || []
  return (
    <Modal aberto titulo="Comparar dois backups" onFechar={aoFechar} largura="max-w-2xl">
      {erro ? <Aviso>{erro}</Aviso> : !d ? <Carregando /> : (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">De <b className="text-foreground">{fmtData(d.a.gerado_em)}</b> para <b className="text-foreground">{fmtData(d.b.gerado_em)}</b>: {mudou.length ? `${mudou.length} tabela(s) mudaram` : 'nenhuma tabela mudou'}.</p>
          {mudou.length > 0 && (
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs"><thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th className="px-3 py-1.5">Tabela</th><th className="px-3 py-1.5 text-right">Antes</th><th className="px-3 py-1.5 text-right">Depois</th><th className="px-3 py-1.5 text-right">Entraram</th><th className="px-3 py-1.5 text-right">Saíram</th><th className="px-3 py-1.5 text-right">Mudaram</th></tr></thead>
                <tbody>{mudou.map((t) => <tr key={t.tabela} className="border-t border-border/70"><td className="px-3 py-1 font-mono">{t.tabela}</td><td className="px-3 py-1 text-right tabular-nums">{t.a}</td><td className="px-3 py-1 text-right tabular-nums">{t.b}</td>
                  <td className="px-3 py-1 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{t.entraram ?? '—'}</td><td className="px-3 py-1 text-right tabular-nums text-red-600">{t.sairam ?? '—'}</td><td className="px-3 py-1 text-right tabular-nums text-amber-700 dark:text-amber-400">{t.mudaram ?? '—'}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

const ESTADO = { nao_existe: ['Não existe hoje', 'vermelho'], diferente: ['Diferente hoje', 'ambar'], igual: ['Igual hoje', 'cinza'] }

// Procurar dentro do backup e restaurar só as linhas escolhidas (ex.: um ar ou uma cena apagada por engano)
export function Procurar({ arquivo, aoFechar }) {
  const toast = useToast()
  const [tabela, setTabela] = useState(''), [q, setQ] = useState(''), [d, setD] = useState(null), [carregando, setCarregando] = useState(false)
  const [tabelas, setTabelas] = useState([])   // só as que estão neste backup
  useEffect(() => {
    api.get(`/api/backup-sistema/manifesto/${encodeURIComponent(arquivo)}`).then((m) => {
      const nomes = m.tabelas.map((t) => t.tabela).sort()
      setTabelas(nomes); setTabela(nomes.includes('aparelhos') ? 'aparelhos' : nomes[0] || '')
    }).catch((e) => toast(e.message, 'erro'))
  }, [arquivo]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(new Set()), [palavra, setPalavra] = useState(''), [gravando, setGravando] = useState(false)
  const buscar = async () => {
    setCarregando(true); setSel(new Set())
    try { setD(await api.get(`/api/backup-sistema/linhas?arquivo=${encodeURIComponent(arquivo)}&tabela=${encodeURIComponent(tabela)}&q=${encodeURIComponent(q)}`)) } catch (e) { toast(e.message, 'erro'); setD(null) } finally { setCarregando(false) }
  }
  useEffect(() => { if (tabela) buscar() }, [tabela]) // eslint-disable-line react-hooks/exhaustive-deps
  const restaurar = async () => {
    setGravando(true)
    try {
      const r = await api.post('/api/backup-sistema/restaurar', { arquivo, modo: 'mesclar', tabelas: [tabela], chaves: [...sel], confirmacao: palavra })
      toast(`${r.tabelas[0]?.gravadas || 0} linha(s) de volta${r.seguranca ? '. Cópia de segurança guardada antes.' : '.'}`); setPalavra(''); buscar()
    } catch (e) { toast(e.message, 'erro') } finally { setGravando(false) }
  }
  const colunas = d?.linhas[0] ? Object.keys(d.linhas[0].linha).slice(0, 5) : []
  return (
    <Modal aberto titulo="Procurar dentro do backup" onFechar={aoFechar} largura="max-w-4xl">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <select className="campo w-auto" value={tabela} onChange={(e) => setTabela(e.target.value)} aria-label="Tabela">{tabelas.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); buscar() }}>
            <input className="campo min-w-0 flex-1" type="search" autoComplete="off" placeholder="Procurar (nome, id, texto)" value={q} onChange={(e) => setQ(e.target.value)} />
            <Botao tamanho="sm" variante="secundario" icone={Search} carregando={carregando} type="submit">Procurar</Botao>
          </form>
        </div>
        {d && <p className="text-xs text-muted-foreground">{d.achadas} de {d.total} linha(s){d.achadas > d.linhas.length ? ` (mostrando ${d.linhas.length})` : ''}.{!d.restauravel && ' Esta tabela não é restaurável.'}</p>}
        {d?.linhas.length > 0 && (
          <div className="max-h-[42vh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th className="px-2 py-1.5"><span className="sr-only">Escolher</span></th>{colunas.map((c) => <th key={c} className="px-2 py-1.5">{c}</th>)}<th className="px-2 py-1.5">Hoje</th></tr></thead>
              <tbody>{d.linhas.map((l) => (
                <tr key={l.chave || JSON.stringify(l.linha)} className="border-t border-border/70">
                  <td className="px-2 py-1">{d.restauravel && l.estado !== 'igual' && <input type="checkbox" aria-label="Restaurar esta linha" checked={sel.has(l.chave)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(l.chave); else n.delete(l.chave); setSel(n) }} />}</td>
                  {colunas.map((c) => <td key={c} className="max-w-[12rem] truncate px-2 py-1" title={l.linha[c] == null ? '' : String(l.linha[c])}>{l.linha[c] == null ? '—' : typeof l.linha[c] === 'object' ? JSON.stringify(l.linha[c]) : String(l.linha[c])}</td>)}
                  <td className="whitespace-nowrap px-2 py-1">{l.estado && <Selo cor={ESTADO[l.estado][1]}>{ESTADO[l.estado][0]}</Selo>}</td>
                </tr>))}</tbody></table>
          </div>
        )}
        {sel.size > 0 && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p>Trazer de volta <b>{sel.size}</b> linha(s) de <span className="font-mono">{tabela}</span> como estão no backup. Antes, o sistema guarda uma cópia de segurança da tabela. Digite <b>RESTAURAR</b>:</p>
            <div className="flex gap-2"><input className="campo font-mono" value={palavra} onChange={(e) => setPalavra(e.target.value)} aria-label="Digite RESTAURAR" />
              <Botao icone={Undo2} carregando={gravando} disabled={palavra !== 'RESTAURAR'} onClick={restaurar}>Restaurar linhas</Botao></div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function Uso({ uso }) {
  const itens = Object.entries(uso || {})
  if (!itens.length) return null
  const total = itens.reduce((a, [, v]) => a + v.bytes, 0)
  return (
    <div className="mt-3 rounded-lg border border-border p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="h-3.5 w-3.5" />Espaço usado no Storage: {fmtMB(total)}</p>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">{itens.map(([k, v], i) => <span key={k} title={`${k}: ${fmtMB(v.bytes)}`} style={{ width: `${(v.bytes / (total || 1)) * 100}%`, opacity: 1 - i * 0.2 }} className="bg-primary" />)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">{itens.map(([k, v]) => <li key={k}>{k}: {v.arquivos} · {fmtMB(v.bytes)}</li>)}</ul>
    </div>
  )
}

