import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Cookie, ExternalLink, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { api, dataHora } from '../../api'
import { Aviso, Botao, Carregando, FaixaMetricas, Interruptor, Secao, useDados, useToast } from '../ui'

// Gestão do aviso de cookies do site (LGPD): textos, categorias, lista de cookies, nova versão (pede consentimento
// de novo a todos) e o relatório das escolhas registradas (prova do consentimento, sem IP em claro).
const ACOES = [['aceitar_todos', 'Aceitaram todos', '#22c55e'], ['personalizar', 'Personalizaram', '#f59e0b'], ['rejeitar', 'Só essenciais', '#64748b']]
const eixo = { tickLine: false, axisLine: false, fontSize: 11, stroke: 'hsl(var(--muted-foreground))' }

export default function CookiesSite() {
  const toast = useToast()
  const { dados: cfgInicial, erro } = useDados(() => api.get('/api/site/cookies/config'))
  const [dias, setDias] = useState(30)
  const { dados: rel, recarregar: recarregarRel } = useDados(() => api.get(`/api/site/cookies/relatorio?dias=${dias}`), [dias])
  const [cfg, setCfg] = useState(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (cfgInicial) setCfg(cfgInicial) }, [cfgInicial])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!cfg) return <Carregando />

  const muda = (k) => (v) => setCfg({ ...cfg, [k]: v?.target ? v.target.value : v })
  const salvar = async (novaVersao = false) => {
    if (novaVersao && !window.confirm('Pedir o consentimento de novo a todos os visitantes? O aviso volta a aparecer para quem já escolheu.')) return
    setSalvando(true)
    try { const r = await api.put('/api/site/cookies/config', { ...cfg, nova_versao: novaVersao }); setCfg(r); toast(novaVersao ? `Versão ${r.versao} publicada: o aviso aparece de novo para todos.` : 'Cookies do site salvos. O site usa a nova configuração na próxima visita.') } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const muCat = (i, campo, v) => setCfg({ ...cfg, categorias: cfg.categorias.map((c, j) => (j === i ? { ...c, [campo]: v } : c)) })
  const muCookie = (i, campo, v) => setCfg({ ...cfg, cookies: cfg.cookies.map((c, j) => (j === i ? { ...c, [campo]: v } : c)) })
  const apagarRegistro = async (id) => {
    if (!window.confirm('Apagar os registros de consentimento deste visitante (pedido do titular)?')) return
    try { await api.del(`/api/site/cookies/consentimento/${id}`); toast('Registros apagados.'); recarregarRel() } catch (e) { toast(e.message, 'erro') }
  }
  const serie = (rel?.por_dia || []).map((d) => ({ ...d, rotulo: `${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}` }))
  const taxa = (k) => (rel?.total ? Math.round((rel.acoes[k] / rel.total) * 100) : 0)

  return (
    <div className="space-y-6">
      <FaixaMetricas itens={[
        { rotulo: 'Escolhas registradas', valor: rel?.total ?? 0, dica: `${rel?.visitantes ?? 0} visitante(s) · últimos ${dias} dias` },
        { rotulo: 'Aceitaram todos', valor: taxa('aceitar_todos'), sufixo: '%', dica: `${rel?.acoes?.aceitar_todos ?? 0} escolha(s)` },
        { rotulo: 'Só essenciais', valor: taxa('rejeitar'), sufixo: '%', dica: `${rel?.acoes?.rejeitar ?? 0} escolha(s)` },
        { rotulo: 'Versão do aviso', valor: cfg.versao, dica: cfg.ativo ? 'aviso ligado no site' : 'aviso desligado', tom: cfg.ativo ? 'bom' : 'ruim' },
      ]} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Secao titulo="Aviso no site" contexto="O que o visitante vê na primeira visita"
          acao={<a href="https://zynio.com.br" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">Ver no site<ExternalLink className="h-3 w-3" /></a>}>
          <div className="space-y-4">
            <label className="flex items-center justify-between text-sm">Mostrar o aviso de cookies<Interruptor ligado={cfg.ativo} onChange={muda('ativo')} rotulo="Aviso ligado" /></label>
            <div><label className="rotulo" htmlFor="ck-titulo">Título</label><input id="ck-titulo" className="campo" maxLength={60} value={cfg.titulo} onChange={muda('titulo')} /></div>
            <div><label className="rotulo" htmlFor="ck-texto">Texto</label><textarea id="ck-texto" className="campo" rows={3} maxLength={600} value={cfg.texto} onChange={muda('texto')} />
              <p className="ajuda">{cfg.texto.length}/600 · o link para a Política de privacidade entra sozinho no fim.</p></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="rotulo" htmlFor="ck-pos">Posição</label>
                <select id="ck-pos" className="campo" value={cfg.posicao} onChange={muda('posicao')}><option value="rodape">Faixa no rodapé</option><option value="canto">Cartão no canto</option></select></div>
              <div><label className="rotulo" htmlFor="ck-dias">Validade da escolha</label>
                <select id="ck-dias" className="campo" value={cfg.dias_validade} onChange={(e) => setCfg({ ...cfg, dias_validade: +e.target.value })}>
                  {[[30, '30 dias'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano']].map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select></div>
            </div>
            {/* prévia fiel ao visual do site */}
            <div className="rounded-xl border border-[#313131] bg-[#18191b] p-4 text-[#9e9fa0]"> {/* marca: cores do site */}
              <p className="flex items-center gap-2 font-semibold text-white"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#9cfe4f]/10 text-[#9cfe4f]"><Cookie className="h-4 w-4" /></span>{cfg.titulo}</p>
              <p className="mt-2 text-xs leading-relaxed">{cfg.texto} <span className="text-[#9cfe4f] underline">Política de privacidade</span></p>
              <div className="mt-3 flex flex-wrap justify-end gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-[#313131] px-3 py-1.5 text-white">Personalizar</span>
                <span className="rounded-full border border-[#313131] px-3 py-1.5 text-white">Só os essenciais</span>
                <span className="rounded-full bg-[#9cfe4f] px-3 py-1.5 text-[#1a1a1a]">Aceitar todos</span>
              </div>
            </div>
          </div>
        </Secao>

        <Secao titulo="Categorias" contexto="Essenciais ficam sempre ligadas; as outras pedem consentimento"
          acao={<Botao tamanho="sm" variante="secundario" icone={Plus} disabled={cfg.categorias.length >= 8} onClick={() => setCfg({ ...cfg, categorias: [...cfg.categorias, { id: `extra_${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6) || 'nova'}`, nome: 'Nova categoria', descricao: '', obrigatoria: false }] })}>Categoria</Botao>}>
          <div className="space-y-3">
            {cfg.categorias.map((c, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <input className="campo h-9 flex-1" maxLength={40} value={c.nome} onChange={(e) => muCat(i, 'nome', e.target.value)} aria-label="Nome da categoria" />
                  <code className="rounded bg-muted px-1.5 py-1 text-[11px] text-muted-foreground">{c.id}</code>
                  {c.id === 'essenciais' ? <span className="text-xs text-muted-foreground">obrigatória</span> : (
                    <button onClick={() => setCfg({ ...cfg, categorias: cfg.categorias.filter((_, j) => j !== i), cookies: cfg.cookies.filter((k) => k.categoria !== c.id) })} className="rounded-md p-1.5 text-muted-foreground hover:text-red-600" aria-label="Remover categoria"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
                <textarea className="campo mt-2 text-sm" rows={2} maxLength={400} value={c.descricao} onChange={(e) => muCat(i, 'descricao', e.target.value)} aria-label="Descrição" />
              </div>
            ))}
          </div>
        </Secao>
      </div>

      <Secao titulo="Cookies e armazenamento" contexto="Lista mostrada ao visitante dentro de cada categoria"
        acao={<Botao tamanho="sm" variante="secundario" icone={Plus} onClick={() => setCfg({ ...cfg, cookies: [...cfg.cookies, { nome: '', categoria: 'essenciais', provedor: 'zynio.com.br', finalidade: '', duracao: '' }] })}>Cookie</Botao>}>
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="tabela w-full min-w-[860px]">
            <thead><tr><th>Nome</th><th>Categoria</th><th>Provedor</th><th>Para quê</th><th>Duração</th><th /></tr></thead>
            <tbody>
              {cfg.cookies.map((k, i) => (
                <tr key={i}>
                  <td><input className="campo h-8 text-sm" maxLength={60} value={k.nome} onChange={(e) => muCookie(i, 'nome', e.target.value)} aria-label="Nome" /></td>
                  <td><select className="campo h-8 py-0 text-sm" value={k.categoria} onChange={(e) => muCookie(i, 'categoria', e.target.value)} aria-label="Categoria">{cfg.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></td>
                  <td><input className="campo h-8 text-sm" maxLength={60} value={k.provedor} onChange={(e) => muCookie(i, 'provedor', e.target.value)} aria-label="Provedor" /></td>
                  <td><input className="campo h-8 text-sm" maxLength={200} value={k.finalidade} onChange={(e) => muCookie(i, 'finalidade', e.target.value)} aria-label="Finalidade" /></td>
                  <td><input className="campo h-8 w-32 text-sm" maxLength={40} value={k.duracao} onChange={(e) => muCookie(i, 'duracao', e.target.value)} aria-label="Duração" /></td>
                  <td><button onClick={() => setCfg({ ...cfg, cookies: cfg.cookies.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted-foreground hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="max-w-2xl text-sm text-muted-foreground">Mudou o que o site usa (um cookie novo, uma categoria nova)? Publique uma <b className="font-medium text-foreground">nova versão</b>: pela LGPD o consentimento antigo não vale para o que mudou, e o aviso volta a aparecer para todos.</p>
        <div className="flex gap-2">
          <Botao variante="secundario" icone={RefreshCw} carregando={salvando} onClick={() => salvar(true)}>Salvar e pedir de novo</Botao>
          <Botao icone={Save} carregando={salvando} onClick={() => salvar(false)}>Salvar</Botao>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Secao titulo="Escolhas por dia" contexto="O que os visitantes escolheram no aviso"
          acao={<select value={dias} onChange={(e) => setDias(+e.target.value)} className="campo h-8 w-auto py-0 text-sm">{[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select>}>
          <div className="h-60">
            <ResponsiveContainer><BarChart data={serie} margin={{ left: 0, right: 8 }} maxBarSize={28}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" {...eixo} minTickGap={12} /><YAxis {...eixo} width={28} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'hsl(var(--muted))' }} />
              {ACOES.map(([k, r, c], i) => <Bar key={k} dataKey={k} name={r} stackId="a" fill={c} radius={i === 2 ? [3, 3, 0, 0] : 0} />)}
            </BarChart></ResponsiveContainer>
          </div>
        </Secao>
        <Secao titulo="Aceite por categoria" contexto="Quantos liberaram cada uma">
          {!rel || !Object.keys(rel.categorias).length ? <p className="text-sm text-muted-foreground">Nenhuma escolha registrada ainda.</p> : (
            <ul className="space-y-3">{cfg.categorias.map((c) => { const v = rel.categorias[c.id] || { taxa: 0, aceitos: 0, total: 0 }; return (
              <li key={c.id}><div className="flex justify-between text-sm"><span>{c.nome}</span><span className="tabular text-muted-foreground">{v.taxa}% · {v.aceitos}/{v.total}</span></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v.taxa}%` }} /></div></li>) })}</ul>
          )}
        </Secao>
      </div>

      <Secao titulo="Registros de consentimento" contexto="Prova da escolha de cada visitante (identificador anônimo, sem IP em claro)">
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="tabela w-full min-w-[760px]">
            <thead><tr><th>Quando</th><th>Visitante</th><th>Escolha</th><th>Categorias liberadas</th><th>Versão</th><th>País</th><th /></tr></thead>
            <tbody>
              {(rel?.recentes || []).map((r, i) => (
                <tr key={i}>
                  <td className="text-xs text-muted-foreground">{dataHora(r.quando)}</td>
                  <td className="font-mono text-xs">{r.id_anonimo.slice(0, 12)}…</td>
                  <td className="text-sm">{ACOES.find((a) => a[0] === r.acao)?.[1] || r.acao}</td>
                  <td className="text-xs text-muted-foreground">{Object.entries(r.escolhas).filter(([, v]) => v).map(([k]) => cfg.categorias.find((c) => c.id === k)?.nome || k).join(', ')}</td>
                  <td className="text-xs tabular">v{r.versao}{r.versao !== cfg.versao && <span className="ml-1 text-amber-600">antiga</span>}</td>
                  <td className="text-xs">{r.pais || '—'}</td>
                  <td><button onClick={() => apagarRegistro(r.id_anonimo)} title="Apagar a pedido do titular" className="rounded-md p-1.5 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
              {!rel?.recentes?.length && <tr><td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">As escolhas aparecem aqui assim que os visitantes responderem ao aviso.</td></tr>}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  )
}
