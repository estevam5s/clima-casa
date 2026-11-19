import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Award, BookOpenCheck, CheckCircle2, Flag, GraduationCap, Layers, ListChecks, Mail, RotateCcw, ShieldCheck, Timer, Trophy, XCircle } from 'lucide-react'
import { api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, FaixaMetricas, useDados, useToast } from '../components/ui'
import { avisoEmail } from '../emailAviso'

// Treinamento de segurança e conformidade: banco com mais de mil perguntas (situações do dia a dia, LGPD, ISO/IEC
// 27001:2022 Anexo A, Estrutura Harmonizada e o catálogo de normas ISO). A prova é sorteada e corrigida no servidor;
// o resultado sai na hora (nota, acertos por trilha, gabarito comentado) e vai por e-mail.
const ICONE = { geral: ShieldCheck, anexo_a: ListChecks, estrutura: Layers, normas: BookOpenCheck, completo: Trophy }
const NOMES_CURSO = { 'seguranca-2026': 'Situações (versão antiga)' }

function Escolha({ dados, iniciar, iniciando }) {
  const [trilha, setTrilha] = useState('completo')
  const [qtd, setQtd] = useState(20)
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" />Escolha a prova</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {dados.trilhas.map((t) => {
          const I = ICONE[t.id] || GraduationCap
          return (
            <button key={t.id} onClick={() => setTrilha(t.id)} className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${trilha === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>
              <I className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium leading-snug">{t.nome}</span>
              <span className="text-xs text-muted-foreground">{t.descricao}</span>
              <span className="mt-auto rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">{(t.id === 'completo' ? dados.total : t.perguntas).toLocaleString('pt-BR')} perguntas</span>
            </button>
          )
        })}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Quantas perguntas:</span>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {[10, 20, 40, 60, 100].map((n) => <button key={n} onClick={() => setQtd(n)} className={`rounded-md px-3 py-1 text-sm tabular-nums ${qtd === n ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{n}</button>)}
        </div>
        <Botao icone={ArrowRight} carregando={iniciando} onClick={() => iniciar(trilha, qtd)}>Começar a prova</Botao>
        <span className="text-xs text-muted-foreground">Aprovado com {dados.aprovacao}%. O resultado sai na hora e vai para o seu e-mail.</span>
      </div>
    </section>
  )
}

function Prova({ prova, terminar, enviando }) {
  const [i, setI] = useState(0)
  const [resp, setResp] = useState({})
  const [revisar, setRevisar] = useState(new Set())
  const [seg, setSeg] = useState(0)
  useEffect(() => { const t = setInterval(() => setSeg((s) => s + 1), 1000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const tecla = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return
      const q = prova.perguntas[i]
      if (/^[1-4]$/.test(e.key) && q.opcoes[+e.key - 1] != null) setResp((r) => ({ ...r, [q.id]: +e.key - 1 }))
      if (e.key === 'ArrowRight') setI((x) => Math.min(prova.perguntas.length - 1, x + 1))
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [i, prova])
  const q = prova.perguntas[i], n = prova.perguntas.length, feitas = Object.keys(resp).length
  const mmss = `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="cartao p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="font-medium">{prova.nome}</span>
          <span className="flex items-center gap-3 text-muted-foreground"><span className="flex items-center gap-1"><Timer className="h-4 w-4" />{mmss}</span><span className="tabular-nums">{feitas}/{n} respondidas</span></span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(feitas / n) * 100}%` }} /></div>
        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pergunta {i + 1} de {n}</p>
        <h2 className="mt-2 text-lg font-medium leading-snug">{q.texto}</h2>
        <div className="mt-5 space-y-2">
          {q.opcoes.map((o, k) => (
            <button key={k} onClick={() => setResp({ ...resp, [q.id]: k })}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${resp[q.id] === k ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50'}`}>
              <kbd className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold ${resp[q.id] === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>{k + 1}</kbd>
              <span className="pt-0.5">{o}</span>
            </button>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Botao variante="secundario" icone={ArrowLeft} disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</Botao>
            <Botao variante="secundario" icone={Flag} onClick={() => { const s = new Set(revisar); if (s.has(q.id)) s.delete(q.id); else s.add(q.id); setRevisar(s) }}>{revisar.has(q.id) ? 'Desmarcar' : 'Revisar depois'}</Botao>
          </div>
          {i < n - 1 ? <Botao icone={ArrowRight} onClick={() => setI(i + 1)}>Próxima</Botao>
            : <Botao icone={CheckCircle2} carregando={enviando} onClick={() => terminar(resp)}>Entregar a prova</Botao>}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">Atalhos: 1–4 escolhem a opção, ← → trocam de pergunta.</p>
      </section>
      <aside className="cartao h-fit p-4">
        <p className="text-sm font-medium">Mapa da prova</p>
        <div className="mt-3 grid grid-cols-8 gap-1.5 xl:grid-cols-6">
          {prova.perguntas.map((p, k) => (
            <button key={p.id} onClick={() => setI(k)} aria-label={`Ir para a pergunta ${k + 1}`}
              className={`relative h-8 rounded-md text-xs tabular-nums ${k === i ? 'ring-2 ring-primary' : ''} ${resp[p.id] != null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
              {k + 1}{revisar.has(p.id) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />respondida · <span className="mx-1 inline-block h-2 w-2 rounded-full bg-amber-500" />revisar</p>
          {feitas < n && <p>Faltam {n - feitas}. Pode entregar assim: as em branco contam como erradas.</p>}
        </div>
        <Botao className="mt-4 w-full" icone={CheckCircle2} variante={feitas === n ? 'primario' : 'secundario'} carregando={enviando} onClick={() => terminar(resp)}>Entregar ({feitas}/{n})</Botao>
      </aside>
    </div>
  )
}

function Resultado({ r, deNovo }) {
  const [soErradas, setSoErradas] = useState(false)
  const itens = soErradas ? r.itens.filter((x) => !x.ok) : r.itens
  const raio = 54, circ = 2 * Math.PI * raio
  return (
    <div className="space-y-6">
      <section className="cartao flex flex-col items-center gap-6 p-6 sm:flex-row">
        <svg viewBox="0 0 140 140" className="h-36 w-36 shrink-0" role="img" aria-label={`Nota ${r.nota}%`}>
          <circle cx="70" cy="70" r={raio} fill="none" stroke="hsl(var(--muted))" strokeWidth="12" />
          <circle cx="70" cy="70" r={raio} fill="none" stroke={r.aprovado ? '#059669' : '#d97706'} strokeWidth="12" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - r.nota / 100)} transform="rotate(-90 70 70)" />
          <text x="70" y="76" textAnchor="middle" className="fill-foreground text-[28px] font-bold">{r.nota}%</text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className={`flex items-center gap-2 text-xl font-semibold ${r.aprovado ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{r.aprovado ? <Award className="h-6 w-6" /> : <RotateCcw className="h-6 w-6" />}{r.aprovado ? 'Aprovado' : 'Quase lá: vale refazer'}</p>
          <p className="mt-1 text-sm text-muted-foreground">{r.nome} · {r.acertos} de {r.total} certas · mínimo 70%{r.aprovado ? ' · vale por 12 meses na conformidade (ISO/IEC 27001, 6.3)' : ''}</p>
          {r.email && <p className="mt-2 flex items-center gap-1.5 text-sm"><Mail className="h-4 w-4 text-primary" />{avisoEmail([r.email], 'Resultado enviado para')}</p>}
          {r.email_erro && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">O e-mail não saiu agora: {r.email_erro}</p>}
          <div className="mt-4 space-y-2">
            {r.por_trilha.map((t) => (
              <div key={t.trilha} className="flex items-center gap-3 text-xs">
                <span className="w-56 shrink-0 truncate">{t.nome}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${t.pct >= 70 ? 'bg-emerald-600' : 'bg-amber-500'}`} style={{ width: `${t.pct}%` }} /></div>
                <span className="w-20 text-right tabular-nums text-muted-foreground">{t.acertos}/{t.total} · {t.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <Botao icone={RotateCcw} onClick={deNovo}>Fazer outra prova</Botao>
      </section>
      <section className="cartao p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="titulo-secao">Gabarito comentado</h2>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soErradas} onChange={(e) => setSoErradas(e.target.checked)} />Só as que errei ({r.itens.filter((x) => !x.ok).length})</label>
        </div>
        <ol className="mt-4 space-y-4">
          {itens.map((q) => (
            <li key={q.id} className={`rounded-xl border p-4 ${q.ok ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
              <p className="flex gap-2 text-sm font-medium">{q.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}{q.texto}</p>
              <ul className="mt-2 space-y-1 pl-6 text-sm">
                {q.opcoes.map((o, k) => <li key={k} className={k === q.certa ? 'font-medium text-emerald-700 dark:text-emerald-400' : k === q.resposta ? 'text-red-700 line-through dark:text-red-400' : 'text-muted-foreground'}>{o}{k === q.certa ? ' ✓' : ''}</li>)}
                {q.resposta < 0 && <li className="text-xs text-muted-foreground">(em branco)</li>}
              </ul>
              <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs leading-relaxed">{q.explicacao}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export default function Treinamento() {
  const toast = useToast()
  const { dados, erro, recarregar } = useDados(() => api.get('/api/treinamento/v2'))
  const [prova, setProva] = useState(null)
  const [res, setRes] = useState(null)
  const [iniciando, setIniciando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const melhor = useMemo(() => (dados?.historico || []).reduce((m, h) => Math.max(m, h.nota), 0), [dados])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const valida = (dados.historico || []).find((h) => h.aprovado && h.concluido_em > Date.now() / 1000 - 365 * 86400)
  const iniciar = async (trilha, quantidade) => {
    setIniciando(true)
    try { setProva(await api.post('/api/treinamento/iniciar', { trilha, quantidade })); setRes(null); window.scrollTo({ top: 0 }) } catch (e) { toast(e.message, 'erro') } finally { setIniciando(false) }
  }
  const terminar = async (respostas) => {
    setEnviando(true)
    try { setRes(await api.post('/api/treinamento/corrigir', { prova: prova.prova, respostas })); setProva(null); recarregar(); window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) { toast(e.message, 'erro') } finally { setEnviando(false) }
  }
  return (
    <div className="w-full">
      <Cabecalho titulo="Treinamento e segurança" descricao="Provas sorteadas de um banco com mais de mil perguntas: segurança no dia a dia, LGPD, ISO/IEC 27001:2022 (Anexo A), Estrutura Harmonizada e normas ISO." />
      <FaixaMetricas itens={[
        { rotulo: 'Perguntas no banco', valor: dados.total, dica: `${Object.keys(dados.por_trilha).length} trilhas` },
        { rotulo: 'Sua melhor nota', valor: melhor, sufixo: '%', dica: `${dados.historico.length} prova(s)`, tom: melhor >= 70 ? 'bom' : '' },
        { rotulo: 'Aprovação válida', valor: valida ? 'Sim' : 'Não', dica: valida ? `desde ${new Date(valida.concluido_em * 1000).toLocaleDateString('pt-BR')}` : 'faça uma prova com 70% ou mais', tom: valida ? 'bom' : 'ruim' },
        { rotulo: 'Mínimo para aprovar', valor: dados.aprovacao, sufixo: '%', dica: 'vale 12 meses' },
      ]} />
      <div className="mt-6 space-y-6">
        {prova ? <Prova prova={prova} terminar={terminar} enviando={enviando} />
          : res ? <Resultado r={res} deNovo={() => setRes(null)} />
            : <Escolha dados={dados} iniciar={iniciar} iniciando={iniciando} />}
        {!prova && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="cartao p-5">
              <h2 className="titulo-secao">Seu histórico</h2>
              {dados.historico.length ? (
                <ul className="mt-3 divide-y divide-border text-sm">
                  {dados.historico.map((h, k) => (
                    <li key={k} className="flex items-center gap-3 py-2">
                      {h.aprovado ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                      <span className="min-w-0 flex-1 truncate">{NOMES_CURSO[h.curso] || dados.trilhas.find((t) => `treino-${t.id}` === h.curso)?.nome || h.curso}</span>
                      <span className="tabular-nums font-medium">{h.nota}%</span>
                      <span className="w-24 text-right text-xs text-muted-foreground">{haQuanto(h.concluido_em)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted-foreground">Nenhuma prova ainda.</p>}
            </section>
            {dados.ranking && (
              <section className="cartao p-5">
                <h2 className="titulo-secao">Equipe (último ano)</h2>
                <p className="mt-1 text-xs text-muted-foreground">Só dono e administradores veem. Conta para o controle 6.3 (conscientização) da ISO/IEC 27001.</p>
                <ul className="mt-3 divide-y divide-border text-sm">
                  {dados.ranking.map((p) => (
                    <li key={p.email} className="flex items-center gap-3 py-2">
                      {p.aprovado ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
                      <span className="min-w-0 flex-1 truncate">{p.nome || p.email}</span>
                      <span className="text-xs text-muted-foreground">{p.provas} prova(s)</span>
                      <span className="w-12 text-right font-medium tabular-nums">{p.melhor}%</span>
                    </li>
                  ))}
                  {!dados.ranking.length && <li className="py-2 text-muted-foreground">Ninguém fez prova ainda.</li>}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
