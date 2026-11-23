import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArchiveRestore, CheckCircle2, Database, DatabaseBackup, Download, FileArchive, FileSearch, GitCompare, PenLine, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { Agenda, Comparar, Conferir, Procurar, Uso, fmtData, fmtMB } from '../components/backup/Avancado'
import { gerarCodigo } from '../components/dispositivos/Placa'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, Modal, Vazio, useDados, useToast } from '../components/ui'

// Backup e restauração do sistema inteiro (só dono ou admin com acesso a todos os projetos).
// Gerar: todas as tabelas (ou as escolhidas) num .zip com manifesto e sha256 de cada tabela, guardado no Storage
// privado. Restaurar: envia o .zip, SIMULA (o que é novo, o que muda, o que sairia) e só grava com RESTAURAR.

// códigos e instaladores vão em base64: têm trechos como "curl ... | bash" que o firewall do sistema (corretamente) barra
const emBase64 = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => {
  const b = new TextEncoder().encode(v); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return [k, btoa(bin)]
}))

function Gerar({ tabelas, grupos, aoGerar }) {
  const toast = useToast()
  const [sel, setSel] = useState(() => new Set(Object.keys(grupos)))
  const [gerando, setGerando] = useState(false)
  const [tudo, setTudo] = useState(true)
  const [rotulo, setRotulo] = useState('')
  const [comArquivos, setComArquivos] = useState(true)
  const [comCodigos, setComCodigos] = useState(true)
  // códigos das placas (montados aqui, como na tela de cada aparelho, SEM o token: ele só aparece uma vez) e instaladores
  const montarCodigos = async () => {
    const extras = {}
    const lista = await api.get('/api/dispositivos').catch(() => [])
    const placas = (Array.isArray(lista) ? lista : lista.dispositivos || []).filter((d) => d.driver === 'placa' || d.placa_configurada || d.placa)
    const nomeArq = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').slice(0, 40).toLowerCase()
    for (const d of placas) extras[`placas/${d.id}-${nomeArq(d.nome)}.ino`] = gerarCodigo(d.tipo, d.placa || 'esp32', null, d.nome)
    for (const f of ['instalar-agente.sh', 'instalar-agente-mac.sh', 'instalar-agente.ps1', 'instalar-ia.sh', 'instalar-ia.ps1', 'clima-ia/clima_ia.py']) {
      try { const r = await fetch(`/${f}`, { cache: 'no-store' }); if (r.ok) extras[`instaladores/${f}`] = await r.text() } catch { /* sem o arquivo: segue */ }
    }
    extras['LEIA-ME.txt'] = `Códigos do Clima Escritório guardados no backup.\n\nplacas/: um código por aparelho com placa (Arduino/ESP). O TOKEN não vai no backup (o painel mostra uma vez só):\ndepois de restaurar, abra o aparelho no painel, gere um token novo e envie o código de novo para a placa.\n\ninstaladores/: agente do escritório (Windows, Mac, Linux, Raspberry Pi, Docker) e o clima-ia do terminal.\n`
    return { extras, placas: placas.length }
  }
  const lista = useMemo(() => (tudo ? null : tabelas.filter((t) => sel.has(t.grupo)).map((t) => t.nome)), [tudo, sel, tabelas])
  const gerar = async () => {
    setGerando(true)
    try {
      const r = await api.post('/api/backup-sistema/gerar', { tabelas: lista, rotulo, arquivos: comArquivos, extras: comCodigos ? emBase64((await montarCodigos()).extras) : null })
      const n = Object.values(r.tabelas).reduce((a, b) => a + b, 0)
      toast(`Backup pronto: ${Object.keys(r.tabelas).length} tabela(s), ${n.toLocaleString('pt-BR')} linha(s), ${fmtMB(r.tamanho)} em ${r.segundos} s.`)
      aoGerar(r.arquivo); setRotulo('')
    } catch (e) { toast(e.message, 'erro') } finally { setGerando(false) }
  }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><DatabaseBackup className="h-4 w-4 text-primary" />Fazer backup agora</h2>
      <p className="mt-1 text-sm text-muted-foreground">Gera um .zip com o banco (uma tabela por arquivo, manifesto e sha256 de cada uma). Os segredos vão cifrados, como estão no banco: o arquivo sozinho não revela chave nenhuma. Os modelos 3D continuam no Storage (entram como lista).</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setTudo(true)} className={`rounded-lg border px-3 py-1.5 text-sm ${tudo ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>Tudo ({tabelas.length} tabelas)</button>
        <button onClick={() => setTudo(false)} className={`rounded-lg border px-3 py-1.5 text-sm ${!tudo ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>Escolher grupos</button>
      </div>
      {!tudo && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(grupos).map(([k, g]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${sel.has(k) ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
              <input type="checkbox" className="mt-0.5" checked={sel.has(k)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(k); else n.delete(k); setSel(n) }} />
              <span><span className="font-medium capitalize">{k === 'historico' ? 'Histórico' : k === 'seguranca' ? 'Segurança' : k}</span><span className="block text-xs text-muted-foreground">{g.descricao}</span></span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${comArquivos ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
          <input type="checkbox" className="mt-0.5" checked={comArquivos} onChange={(e) => setComArquivos(e.target.checked)} />
          <span><b className="font-medium">Arquivos 3D e imagens</b><span className="block text-xs text-muted-foreground">Modelos dos avatares, carros e objetos do mapa (os "blenders"). Copiados dentro do Supabase, sem gastar tráfego; cada versão é guardada uma vez.</span></span>
        </label>
        <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${comCodigos ? 'border-primary/60 bg-primary/5' : 'border-border'}`}>
          <input type="checkbox" className="mt-0.5" checked={comCodigos} onChange={(e) => setComCodigos(e.target.checked)} />
          <span><b className="font-medium">Códigos das placas e instaladores</b><span className="block text-xs text-muted-foreground">Código de cada placa Arduino/ESP (sem o token, que se gera de novo) e os instaladores do agente para Windows, Mac, Linux e Raspberry Pi.</span></span>
        </label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">As tabelas já incluem tudo do banco: ares, botões gravados, transmissores, salas, cenas, agenda, automações, mapa, usuários e configurações (segredos cifrados).</p>
      <label className="mt-4 block text-sm"><span className="rotulo">Nota (opcional)</span>
        <input className="campo" maxLength={120} placeholder="Ex.: antes de trocar os transmissores" value={rotulo} onChange={(e) => setRotulo(e.target.value)} /></label>
      <Botao className="mt-4" icone={DatabaseBackup} carregando={gerando} onClick={gerar} disabled={!tudo && !sel.size}>{gerando ? 'Gerando…' : 'Gerar backup'}</Botao>
    </section>
  )
}

function Restaurar({ tabelas, aoMudar, preArquivo, setPreArquivo }) {
  const toast = useToast()
  const arq = useRef(null)
  const [enviando, setEnviando] = useState(0)
  const [sim, setSim] = useState(null)
  const [simulando, setSimulando] = useState(false)
  const [escolha, setEscolha] = useState(null)
  const [confirmar, setConfirmar] = useState(null)
  const [palavra, setPalavra] = useState('')
  const [gravando, setGravando] = useState(false)
  const [seguranca, setSeguranca] = useState(true)
  const restauravel = useMemo(() => new Set(tabelas.filter((t) => t.restauravel).map((t) => t.nome)), [tabelas])
  const enviar = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    if (!/\.zip$/i.test(f.name)) return toast('Escolha o .zip gerado por esta tela.', 'erro')
    try {
      const { arquivo, upload_url: url } = await api.post('/api/backup-sistema/envio', { tamanho: f.size })
      await new Promise((ok, falha) => {
        const x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('Content-Type', 'application/zip'); x.setRequestHeader('x-upsert', 'true')
        x.upload.onprogress = (ev) => ev.lengthComputable && setEnviando(Math.max(1, Math.round(ev.loaded / ev.total * 100)))
        x.onload = () => (x.status < 300 ? ok() : falha(new Error(`Envio recusado (${x.status}).`))); x.onerror = () => falha(new Error('Falha de rede no envio.')); x.send(f)
      })
      toast(`${f.name} enviado. Agora simule para ver o que muda.`); setPreArquivo(arquivo); aoMudar()
    } catch (err) { toast(err.message, 'erro') } finally { setEnviando(0) }
  }
  const simular = async (arquivo) => {
    setSimulando(true); setSim(null)
    try { const r = await api.post('/api/backup-sistema/restaurar', { arquivo, modo: 'simular' }); setSim({ arquivo, ...r }); setEscolha(new Set(r.tabelas.filter((t) => !t.pulada && (t.novas || t.mudam)).map((t) => t.tabela))) } catch (e) { toast(e.message, 'erro') } finally { setSimulando(false) }
  }
  const gravar = async () => {
    setGravando(true)
    try {
      const r = await api.post('/api/backup-sistema/restaurar', { arquivo: sim.arquivo, modo: confirmar, tabelas: [...escolha], confirmacao: palavra, seguranca })
      const n = r.tabelas.reduce((a, t) => a + (t.gravadas || 0), 0)
      toast(`Restaurado (${confirmar === 'mesclar' ? 'mesclando' : 'substituindo'}): ${n.toLocaleString('pt-BR')} linha(s) em ${r.tabelas.filter((t) => t.gravadas != null).length} tabela(s).${r.seguranca ? ' Para desfazer, use o backup "antes de restaurar" da lista.' : ''}`); aoMudar()
      setConfirmar(null); setPalavra(''); simular(sim.arquivo)
    } catch (e) { toast(e.message, 'erro') } finally { setGravando(false) }
  }
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><ArchiveRestore className="h-4 w-4 text-primary" />Restaurar (upload)</h2>
      <p className="mt-1 text-sm text-muted-foreground">Envie um backup ou escolha um da lista. Primeiro o sistema <b>simula</b>: mostra, tabela por tabela, o que é novo, o que muda e o que sairia. Nada é gravado até você confirmar com <b>RESTAURAR</b>. Sessões, logins e passkeys nunca são restaurados.</p>
      <input ref={arq} type="file" accept=".zip,application/zip" className="hidden" onChange={enviar} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao icone={Upload} variante="secundario" carregando={enviando > 0} onClick={() => arq.current?.click()}>{enviando ? `Enviando ${enviando}%` : 'Enviar um .zip de backup'}</Botao>
        {preArquivo && <Botao icone={RefreshCw} carregando={simulando} onClick={() => simular(preArquivo)}>Simular {preArquivo.slice(0, 28)}…</Botao>}
      </div>
      {sim && (
        <div className="mt-5">
          <p className="text-sm">Backup de <b>{fmtData(sim.manifesto.gerado_em)}</b>, gerado por {sim.manifesto.gerado_por}.</p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[34rem] text-left text-xs">
              <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2"><span className="sr-only">Escolher</span></th><th className="px-3 py-2">Tabela</th><th className="px-3 py-2 text-right">No backup</th><th className="px-3 py-2 text-right">Novas</th><th className="px-3 py-2 text-right">Mudam</th><th className="px-3 py-2 text-right">Iguais</th><th className="px-3 py-2 text-right">Só no banco</th></tr></thead>
              <tbody>
                {sim.tabelas.map((t) => (
                  <tr key={t.tabela} className="border-t border-border/70">
                    <td className="px-3 py-1.5">{!t.pulada && restauravel.has(t.tabela) && <input type="checkbox" aria-label={`Restaurar ${t.tabela}`} checked={escolha.has(t.tabela)} onChange={(e) => { const n = new Set(escolha); if (e.target.checked) n.add(t.tabela); else n.delete(t.tabela); setEscolha(n) }} />}</td>
                    <td className="px-3 py-1.5 font-mono">{t.tabela}{t.pulada && <span className="ml-2 font-sans text-muted-foreground">({t.pulada})</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.no_backup ?? '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${t.novas ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}`}>{t.novas ?? '—'}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${t.mudam ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>{t.mudam ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{t.iguais ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{t.sairiam ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">"Só no banco" = linhas que existem hoje e não estão no backup: com Mesclar elas ficam; com Substituir elas saem.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Botao icone={CheckCircle2} disabled={!escolha?.size} onClick={() => setConfirmar('mesclar')}>Mesclar {escolha?.size || 0} tabela(s)</Botao>
            <Botao icone={AlertTriangle} variante="perigo" disabled={!escolha?.size} onClick={() => setConfirmar('substituir')}>Substituir {escolha?.size || 0} tabela(s)</Botao>
          </div>
        </div>
      )}
      {confirmar && (
        <Modal aberto titulo={confirmar === 'mesclar' ? 'Mesclar o backup' : 'Substituir pelas tabelas do backup'} onFechar={() => { setConfirmar(null); setPalavra('') }}>
          <div className="space-y-3 text-sm">
            <p>{confirmar === 'mesclar' ? 'Linhas novas entram e as que mudaram voltam ao que está no backup. Nada é apagado.' : 'As tabelas escolhidas são APAGADAS e regravadas com o conteúdo do backup. O que só existe hoje some.'}</p>
            <p className="font-mono text-xs text-muted-foreground">{[...escolha].join(', ')}</p>
            <label className="flex items-start gap-2 rounded-lg border border-border p-2.5"><input type="checkbox" className="mt-0.5" checked={seguranca} onChange={(e) => setSeguranca(e.target.checked)} />
              <span>Guardar antes um backup destas tabelas (para desfazer). <span className="text-muted-foreground">Fica na lista como “antes de restaurar”; guarda os 5 últimos.</span></span></label>
            <p>Para continuar, digite <b>RESTAURAR</b>:</p>
            <input className="campo font-mono" value={palavra} onChange={(e) => setPalavra(e.target.value)} aria-label="Digite RESTAURAR" autoFocus />
            <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => { setConfirmar(null); setPalavra('') }}>Cancelar</Botao>
              <Botao variante={confirmar === 'substituir' ? 'perigo' : 'primario'} carregando={gravando} disabled={palavra !== 'RESTAURAR'} onClick={gravar}>{confirmar === 'mesclar' ? 'Mesclar agora' : 'Substituir agora'}</Botao></div>
          </div>
        </Modal>
      )}
    </section>
  )
}

export default function Backup() {
  const toast = useToast()
  const { sessao } = useProjeto()
  const pode = ['dono', 'admin'].includes(sessao?.papel)
  const { dados: tb, erro: erroT } = useDados(() => (pode ? api.get('/api/backup-sistema/tabelas') : Promise.resolve(null)), [pode])
  const { dados, erro, recarregar } = useDados(() => (pode ? api.get('/api/backup-sistema') : Promise.resolve(null)), [pode])
  const [preArquivo, setPreArquivo] = useState(() => new URLSearchParams(location.search).get('aba') === 'restaurar' ? null : null)
  const [apagar, setApagar] = useState(null)
  const [conferir, setConferir] = useState(null), [procurar, setProcurar] = useState(null), [comparar, setComparar] = useState([]), [verComparar, setVerComparar] = useState(false)
  const [editando, setEditando] = useState(null)   // { arquivo, rotulo }
  if (!sessao) return <Carregando />
  if (!pode) return <Aviso tipo="alerta">Backup e restauração são só do dono ou de um administrador.</Aviso>
  if (erro || erroT) return <Aviso>{erro || erroT}</Aviso>
  if (!dados || !tb) return <Carregando />
  const linhas = tb.tabelas.reduce((a, t) => a + t.linhas, 0)
  const baixar = async (arquivo) => { try { const { url } = await api.get(`/api/backup-sistema/baixar/${encodeURIComponent(arquivo)}`); window.location.href = url } catch (e) { toast(e.message, 'erro') } }
  const baixarAuto = async (b) => {
    try {
      const d = await api.get(`/api/backup-sistema/automatico/${b.id}`)
      const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
      Object.assign(document.createElement('a'), { href: url, download: `backup-automatico-${b.id}.json` }).click(); setTimeout(() => URL.revokeObjectURL(url), 3000)
    } catch (e) { toast(e.message, 'erro') }
  }
  const salvarRotulo = async () => { try { await api.put('/api/backup-sistema/rotulo', editando); setEditando(null); recarregar() } catch (e) { toast(e.message, 'erro') } }
  const marcarComparar = (arquivo) => setComparar((c) => (c.includes(arquivo) ? c.filter((x) => x !== arquivo) : [...c, arquivo].slice(-2)))
  const confirmarApagar = async () => { try { await api.del(`/api/backup-sistema/${encodeURIComponent(apagar)}`); toast('Backup apagado.'); setApagar(null); recarregar() } catch (e) { toast(e.message, 'erro') } }
  return (
    <div className="w-full">
      <Cabecalho titulo="Backup e restauração" descricao="Cópia completa do sistema (banco inteiro, com os segredos cifrados) e restauração com simulação antes de gravar." />
      <FaixaMetricas itens={[
        { rotulo: 'Tabelas no banco', valor: tb.tabelas.length, dica: `${tb.tabelas.filter((t) => t.restauravel).length} restauráveis` },
        { rotulo: 'Linhas (aprox.)', valor: linhas, dica: 'estimativa do Postgres' },
        { rotulo: 'Backups guardados', valor: dados.arquivos.length, dica: dados.arquivos[0] ? `último: ${fmtData(dados.arquivos[0].criado_em)}` : 'nenhum ainda' },
        { rotulo: 'Backup agendado', valor: dados.agenda?.ativo ? 'Ligado' : 'Desligado', dica: dados.agenda?.ativo && dados.agenda.proximo ? `próximo ${fmtData(dados.agenda.proximo)}` : 'agende abaixo' },
      ]} />
      {dados.agenda?.ativo && dados.agenda.ultimo && !dados.agenda.ultimo_ok && <div className="mt-4"><Aviso>O último backup agendado falhou: {dados.agenda.ultimo_erro}</Aviso></div>}
      {!dados.arquivos.length || (Date.now() - new Date(dados.arquivos[0].criado_em).getTime()) > 7 * 86400000
        ? <div className="mt-4"><Aviso tipo="alerta">{dados.arquivos.length ? 'O backup completo mais novo tem mais de 7 dias.' : 'Ainda não há backup completo.'} Gere um agora ou ligue o backup agendado.</Aviso></div> : null}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Gerar tabelas={tb.tabelas} grupos={tb.grupos} aoGerar={() => recarregar()} />
        <Restaurar tabelas={tb.tabelas} aoMudar={recarregar} preArquivo={preArquivo} setPreArquivo={setPreArquivo} />
      </div>
      <div className="mt-6"><Agenda agenda={dados.agenda} grupos={tb.grupos} aoSalvar={recarregar} /></div>
      <section className="cartao mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titulo-secao flex items-center gap-2"><FileArchive className="h-4 w-4 text-primary" />Backups guardados</h2>
          <Botao tamanho="sm" variante="secundario" icone={GitCompare} disabled={comparar.length !== 2} onClick={() => setVerComparar(true)}>{comparar.length === 2 ? 'Comparar os 2 marcados' : `Marque 2 para comparar (${comparar.length}/2)`}</Botao>
        </div>
        <Uso uso={dados.uso} />
        {!dados.arquivos.length ? <Vazio icone={Database} titulo="Nenhum backup ainda" texto="Gere o primeiro acima. Ele fica guardado aqui (Storage privado) e dá para baixar ou restaurar." /> : (
          <ul className="mt-3 divide-y divide-border">
            {dados.arquivos.map((a) => (
              <li key={a.arquivo} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <input type="checkbox" aria-label={`Marcar ${a.arquivo} para comparar`} checked={comparar.includes(a.arquivo)} onChange={() => marcarComparar(a.arquivo)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs">{a.arquivo}</span>
                  <span className="text-xs text-muted-foreground">{fmtData(a.criado_em)} · {fmtMB(a.tamanho)} · {a.tipo}</span>
                  {editando?.arquivo === a.arquivo ? (
                    <form className="mt-1 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); salvarRotulo() }}>
                      <input className="campo h-7 text-xs" autoFocus maxLength={120} value={editando.rotulo} onChange={(e) => setEditando({ ...editando, rotulo: e.target.value })} aria-label="Nota do backup" />
                      <Botao tamanho="sm" type="submit">Salvar</Botao>
                    </form>
                  ) : <button onClick={() => setEditando({ arquivo: a.arquivo, rotulo: a.rotulo || '' })} className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><PenLine className="h-3 w-3" />{a.rotulo || 'Adicionar nota'}</button>}
                </span>
                <Botao tamanho="sm" variante="secundario" icone={ShieldCheck} onClick={() => setConferir(a.arquivo)}>Conferir</Botao>
                <Botao tamanho="sm" variante="secundario" icone={FileSearch} onClick={() => setProcurar(a.arquivo)}>Procurar</Botao>
                <Botao tamanho="sm" variante="secundario" icone={Download} onClick={() => baixar(a.arquivo)}>Baixar</Botao>
                <Botao tamanho="sm" variante="secundario" icone={ArchiveRestore} onClick={() => { setPreArquivo(a.arquivo); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Usar para restaurar</Botao>
                <button onClick={() => setApagar(a.arquivo)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600" aria-label={`Apagar ${a.arquivo}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="cartao mt-6 p-5">
        <h2 className="titulo-secao flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Backups automáticos do banco</h2>
        <p className="mt-1 text-sm text-muted-foreground">Todo dia às 02h (Brasília) o banco guarda uma cópia dos ares, botões, agenda e configurações (mantém os 14 mais recentes). Servem de rede de segurança; para o sistema inteiro, use o backup completo acima.</p>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dados.automaticos.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><span className="block">{fmtData(b.criado_em)}</span><span className="text-xs text-muted-foreground">{fmtMB(b.tamanho)}</span></span>
              <button onClick={() => baixarAuto(b)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Baixar este backup automático"><Download className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>
      {conferir && <Conferir arquivo={conferir} aoFechar={() => setConferir(null)} />}
      {procurar && <Procurar arquivo={procurar} aoFechar={() => { setProcurar(null); recarregar() }} />}
      {verComparar && comparar.length === 2 && (() => { const ordem = (x) => -dados.arquivos.findIndex((a) => a.arquivo === x); const [a, b] = [...comparar].sort((x, y) => ordem(x) - ordem(y)); return <Comparar a={a} b={b} aoFechar={() => setVerComparar(false)} /> })()}
      {apagar && (
        <Modal aberto titulo="Apagar este backup?" onFechar={() => setApagar(null)}>
          <p className="text-sm">{apagar} será apagado do Storage. Isso não desfaz.</p>
          <div className="mt-4 flex justify-end gap-2"><Botao variante="secundario" onClick={() => setApagar(null)}>Cancelar</Botao><Botao variante="perigo" onClick={confirmarApagar}>Apagar</Botao></div>
        </Modal>
      )}
    </div>
  )
}
