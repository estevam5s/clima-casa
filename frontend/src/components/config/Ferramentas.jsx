import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { usePreferencias } from '../../preferencias'
import { Aviso, Botao, Carregando, Interruptor, useDados } from '../ui'

// Configurações → Acessibilidade, Atalhos de teclado e Diagnóstico (0.7.9).

export function Acessibilidade() {
  const [p, setP] = usePreferencias()
  const linhas = [
    ['alto_contraste', 'Alto contraste', 'Bordas e textos secundários mais fortes.'],
    ['reduzir_movimento', 'Reduzir animações', 'Tira transições e animações das telas, mesmo que o aparelho não peça.'],
    ['compacto', 'Modo compacto', 'Cartões com menos espaço: cabe mais coisa na tela.'],
    ['sublinhar_links', 'Sublinhar links', 'Deixa claro o que é clicável no texto.'],
    ['foco_forte', 'Foco bem visível', 'Contorno grosso no item escolhido pelo teclado (Tab).'],
  ]
  return (
    <div className="max-w-2xl space-y-6">
      <section className="cartao p-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="font-medium">Tamanho do texto</p><p className="text-sm text-muted-foreground">Vale para o painel inteiro, neste navegador.</p></div>
          <span className="tabular text-sm font-medium">{p.fonte_pct}%</span>
        </div>
        <input type="range" min={85} max={130} step={5} value={p.fonte_pct} onChange={(e) => setP({ fonte_pct: Number(e.target.value) })} className="mt-3 w-full accent-[hsl(var(--primary))]" aria-label="Tamanho do texto" />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Menor</span><button className="underline" onClick={() => setP({ fonte_pct: 100 })}>Voltar ao normal</button><span>Maior</span></div>
      </section>
      <section className="cartao divide-y divide-border">
        {linhas.map(([k, r, d]) => (
          <label key={k} className="flex items-center justify-between gap-4 p-4">
            <span><span className="block text-sm font-medium">{r}</span><span className="block text-xs text-muted-foreground">{d}</span></span>
            <Interruptor ligado={!!p[k]} onChange={(v) => setP({ [k]: v })} rotulo={r} />
          </label>
        ))}
      </section>
      <p className="text-xs text-muted-foreground">Estas escolhas ficam só neste navegador. Em outro computador ou no celular, ajuste de novo.</p>
    </div>
  )
}

const ATALHOS = [
  ['Geral', [['⌘ K  ou  Ctrl K', 'Buscar no sistema e perguntar à IA'], ['Tab (na busca)', 'Mandar a pergunta para a IA'], ['?', 'Ver os atalhos'], ['Esc', 'Fechar janela ou menu']]],
  ['Ir para (aperte g e depois a letra)', [['g p', 'Painel'], ['g a', 'Aparelhos'], ['g t', 'Transmissores'], ['g r', 'Relatórios'], ['g m', 'Mapa'], ['g c', 'Configurações']]],
  ['Fluxos (editor)', [['Ctrl S', 'Salvar'], ['Ctrl Enter', 'Executar'], ['Ctrl Z / Ctrl Shift Z', 'Desfazer / refazer'], ['Ctrl C / Ctrl V', 'Copiar e colar bloco'], ['Ctrl D', 'Duplicar bloco'], ['Delete', 'Apagar bloco ou ligação']]],
  ['Tarefas', [['Q', 'Tarefa rápida'], ['Enter', 'Abrir a tarefa escolhida']]],
  ['Mapa 3D', [['W A S D', 'Andar'], ['Shift', 'Correr'], ['V', 'Trocar câmera'], ['F', 'Sentar'], ['R', 'Chamar o elevador'], ['C', 'Café']]],
]
export function Atalhos() {
  const [p, setP] = usePreferencias()
  return (
    <div className="max-w-3xl space-y-4">
      <label className="cartao flex items-center justify-between gap-4 p-4">
        <span><span className="block text-sm font-medium">Atalhos de teclado ligados</span><span className="block text-xs text-muted-foreground">Desligue se algum atalho atrapalha o leitor de tela ou outro programa.</span></span>
        <Interruptor ligado={!!p.atalhos} onChange={(v) => setP({ atalhos: v })} rotulo="Atalhos de teclado" />
      </label>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ATALHOS.map(([g, lista]) => (
          <section key={g} className="cartao p-4">
            <p className="mb-2 text-sm font-medium">{g}</p>
            <ul className="space-y-1.5 text-sm">
              {lista.map(([k, d]) => <li key={k} className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{d}</span><kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]" translate="no">{k}</kbd></li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

const ICONE = { ok: [CheckCircle2, 'text-emerald-600'], alerta: [AlertTriangle, 'text-amber-500'], falha: [XCircle, 'text-red-600'] }
export function Diagnostico() {
  const reduzir = useReducedMotion()
  const [conferindo, setConferindo] = useState(false)
  const { dados, erro, recarregar } = useDados(() => api.get('/api/config/diagnostico'))
  const deNovo = async () => { setConferindo(true); try { await recarregar() } finally { setConferindo(false) } }
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const pct = Math.round((dados.ok / Math.max(1, dados.total)) * 100)
  return (
    <div className="max-w-3xl space-y-4">
      <div className="cartao flex flex-wrap items-center gap-4 p-5">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90"><circle cx="18" cy="18" r="15.5" className="fill-none stroke-muted" strokeWidth="3" />
            <motion.circle cx="18" cy="18" r="15.5" className={`fill-none ${pct >= 80 ? 'stroke-emerald-500' : pct >= 50 ? 'stroke-amber-500' : 'stroke-red-500'}`} strokeWidth="3" strokeLinecap="round"
              strokeDasharray="97.4" initial={{ strokeDashoffset: 97.4 }} animate={{ strokeDashoffset: 97.4 * (1 - pct / 100) }} transition={{ duration: reduzir ? 0 : 0.8 }} /></svg>
          <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular">{pct}%</span>
        </div>
        <div className="min-w-0 flex-1"><p className="font-medium">{dados.ok} de {dados.total} itens em ordem</p><p className="text-sm text-muted-foreground">Conferido {haQuanto(dados.medido_em)}, direto no banco e com o agente.</p></div>
        <Botao variante="secundario" icone={RefreshCw} carregando={conferindo} onClick={deNovo}>Conferir de novo</Botao>
      </div>
      <ul className="cartao divide-y divide-border">
        {dados.itens.map((i, k) => {
          const [I, cor] = ICONE[i.estado]
          return (
            <motion.li key={i.nome} initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: k * 0.03 }} className="flex items-center gap-3 p-3 text-sm">
              <I className={`h-4 w-4 shrink-0 ${cor}`} />
              <span className="min-w-0 flex-1"><span className="font-medium">{i.nome}</span><span className="block text-xs text-muted-foreground">{i.detalhe}</span></span>
              {i.link && i.estado !== 'ok' && <Link to={i.link} className="shrink-0 text-xs text-primary hover:underline">Ver</Link>}
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
