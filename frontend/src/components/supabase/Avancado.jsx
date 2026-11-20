import { useMemo, useState } from 'react'
import { Download, RefreshCw, Search } from 'lucide-react'
import { api } from '../../api'
import { useDados, Carregando, Aviso } from '../ui'
import { baixarTexto, Celula, Copiar, kb, num, paraCsv, TituloSecao } from './comum'

// Ferramentas avançadas do /supabase (20/11): cada seção lê uma consulta fechada de /api/supabase/catalogo/{tipo}.
// Tudo só leitura. Tabela com busca, ordenação por coluna e CSV.

const quando = (s) => (s ? new Date(s * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca')
const dur = (s) => (s == null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h` : `${Math.floor(s / 86400)} d`)

function useCatalogo(tipo) {
  return useDados(() => api.get(`/api/supabase/catalogo/${tipo}`), [tipo])
}

// tabela genérica: colunas = [[chave, rótulo, formatar?, alinhar?]]
function Tabela({ linhas, colunas, nome, vazio = 'Nada aqui.', destaque }) {
  const [q, setQ] = useState('')
  const [ordem, setOrdem] = useState(null)
  const filtradas = useMemo(() => {
    let l = linhas || []
    if (q) { const t = q.toLowerCase(); l = l.filter((r) => colunas.some(([k]) => String(r[k] ?? '').toLowerCase().includes(t))) }
    if (ordem) {
      const [k, d] = ordem
      l = [...l].sort((a, b) => { const x = a[k], y = b[k]; const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? '')); return d === 'asc' ? c : -c })
    }
    return l
  }, [linhas, q, ordem, colunas])
  const ordenar = (k) => setOrdem((o) => (o && o[0] === k ? [k, o[1] === 'asc' ? 'desc' : 'asc'] : [k, 'desc']))
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar" aria-label="Filtrar" className="h-7 min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
        </label>
        <span className="text-xs text-muted-foreground">{num(filtradas.length)} de {num((linhas || []).length)}</span>
        <button onClick={() => baixarTexto(`${nome}.csv`, paraCsv(colunas.map(([k]) => k), filtradas))} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"><Download className="h-3.5 w-3.5" />CSV</button>
      </div>
      {filtradas.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">{vazio}</p> : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-10">
              <tr>{colunas.map(([k, r, , al]) => (
                <th key={k} onClick={() => ordenar(k)} className={`cursor-pointer whitespace-nowrap border-b border-border bg-muted px-3 py-2 font-medium hover:bg-muted/70 ${al === 'd' ? 'text-right' : 'text-left'}`}>
                  {r}{ordem?.[0] === k && <span className="ml-1 text-primary">{ordem[1] === 'asc' ? '↑' : '↓'}</span>}
                </th>))}</tr>
            </thead>
            <tbody>
              {filtradas.map((l, i) => (
                <tr key={i} className={`hover:bg-muted/50 ${destaque?.(l) ? 'bg-amber-500/5' : ''}`}>
                  {colunas.map(([k, , f, al]) => (
                    <td key={k} className={`max-w-[420px] truncate border-b border-border px-3 py-1.5 align-top ${al === 'd' ? 'text-right tabular-nums' : ''} ${al === 'm' ? 'font-mono text-[11.5px]' : ''}`} title={typeof l[k] === 'string' ? l[k] : undefined}>
                      {f ? f(l[k], l) : <Celula v={l[k]} />}
                    </td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Bloco({ tipo, titulo, descricao, colunas, vazio, destaque, antes }) {
  const { dados, erro, recarregar } = useCatalogo(tipo)
  return (
    <>
      <TituloSecao titulo={titulo} descricao={descricao} acoes={<button onClick={recarregar} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" />Atualizar</button>} />
      {erro ? <Aviso>{erro}</Aviso> : !dados ? <Carregando /> : (
        <div className="space-y-4">{antes?.(dados || [])}<Tabela linhas={dados} colunas={colunas} nome={tipo} vazio={vazio} destaque={destaque} /></div>
      )}
    </>
  )
}

function Numeros({ itens }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      {itens.map(([r, v, s]) => (
        <div key={r} className="bg-card px-4 py-3"><p className="text-xs text-muted-foreground">{r}</p><p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>{s && <p className="text-[11px] text-muted-foreground">{s}</p>}</div>
      ))}
    </div>
  )
}

const sim = (v) => <span className={`rounded px-1.5 py-px text-[11px] font-medium ${v ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>{v ? 'sim' : 'não'}</span>

export function Indices() {
  return <Bloco tipo="indices" titulo="Índices" descricao="Todos os índices do schema public, com tamanho e quantas vezes cada um foi usado desde a última estatística."
    destaque={(l) => !l.usos && !l.primaria && !l.unico}
    antes={(d) => <Numeros itens={[['Índices', num(d.length)], ['Tamanho total', kb(d.reduce((s, x) => s + (x.bytes || 0), 0))], ['Nunca usados', num(d.filter((x) => !x.usos && !x.primaria && !x.unico).length), 'fora chaves e únicos'], ['Únicos', num(d.filter((x) => x.unico).length)]]} />}
    colunas={[['tabela', 'Tabela'], ['indice', 'Índice', null, 'm'], ['bytes', 'Tamanho', kb, 'd'], ['usos', 'Usos', num, 'd'], ['lidas', 'Linhas lidas', num, 'd'], ['unico', 'Único', sim], ['definicao', 'Definição', (v) => <span className="font-mono text-[11px] text-muted-foreground">{v}</span>]]} />
}

export function Politicas() {
  return <Bloco tipo="politicas" titulo="Políticas (RLS)" descricao="Segurança por linha de cada tabela. Sem política, só o servidor (dono da conexão) acessa: a chave pública não lê nada."
    destaque={(l) => !l.rls}
    antes={(d) => { const t = [...new Set(d.map((x) => x.tabela))]; const sem = t.filter((n) => !d.find((x) => x.tabela === n)?.rls)
      return <Numeros itens={[['Tabelas', num(t.length)], ['RLS ligado', num(t.length - sem.length)], ['RLS desligado', num(sem.length), sem.length ? 'veja em Avisos' : 'nenhuma'], ['Políticas', num(d.filter((x) => x.politica).length)]]} /> }}
    colunas={[['tabela', 'Tabela'], ['rls', 'RLS', sim], ['politica', 'Política', (v) => v || <span className="text-muted-foreground">sem política</span>], ['comando', 'Comando'], ['tipo', 'Tipo'], ['papeis', 'Papéis'], ['usando', 'USING', (v) => <span className="font-mono text-[11px]">{v || ''}</span>], ['checagem', 'WITH CHECK', (v) => <span className="font-mono text-[11px]">{v || ''}</span>]]} />
}

export function Funcoes() {
  return (
    <div className="space-y-10">
      <Bloco tipo="funcoes" titulo="Funções do banco" descricao="Funções do schema public. SECURITY DEFINER roda com os direitos de quem criou: confira o search_path."
        destaque={(l) => l.security_definer && !String(l.config).includes('search_path')}
        colunas={[['nome', 'Nome', null, 'm'], ['argumentos', 'Argumentos', null, 'm'], ['retorno', 'Retorno', null, 'm'], ['linguagem', 'Linguagem'], ['volatilidade', 'Volatilidade'], ['security_definer', 'Security definer', sim], ['config', 'Configuração', null, 'm']]} />
      <Bloco tipo="gatilhos" titulo="Gatilhos" descricao="Triggers nas tabelas do schema public." vazio="Nenhum gatilho no schema public."
        colunas={[['tabela', 'Tabela'], ['gatilho', 'Gatilho', null, 'm'], ['ativo', 'Ativo', sim], ['definicao', 'Definição', null, 'm']]} />
      <Bloco tipo="tipos" titulo="Tipos enumerados" descricao="Enums do schema public." vazio="Nenhum enum: o sistema usa texto com checagem."
        colunas={[['tipo', 'Tipo', null, 'm'], ['valores', 'Valores']]} />
    </div>
  )
}

export function Extensoes() {
  return <Bloco tipo="extensoes" titulo="Extensões" descricao="Instaladas primeiro. Instalar ou remover é pelo painel do Supabase (aqui é só leitura)."
    destaque={(l) => l.versao_instalada && l.versao_disponivel !== l.versao_instalada}
    antes={(d) => <Numeros itens={[['Instaladas', num(d.filter((x) => x.versao_instalada).length)], ['Disponíveis', num(d.length)], ['Com atualização', num(d.filter((x) => x.versao_instalada && x.versao_disponivel !== x.versao_instalada).length)], ['pg_cron', d.find((x) => x.nome === 'pg_cron')?.versao_instalada || 'não']]} />}
    colunas={[['nome', 'Extensão', null, 'm'], ['versao_instalada', 'Instalada', (v) => v || <span className="text-muted-foreground">não</span>], ['versao_disponivel', 'Disponível'], ['schema', 'Schema'], ['descricao', 'Descrição']]} />
}

export function Conexoes() {
  return (
    <div className="space-y-10">
      <Bloco tipo="conexoes" titulo="Conexões ativas" descricao="Quem está conectado ao banco agora. Textos longos dentro das consultas saem ocultos."
        destaque={(l) => l.estado === 'idle in transaction'}
        antes={(d) => <Numeros itens={[['Conexões', num(d.length)], ['Ativas', num(d.filter((x) => x.estado === 'active').length)], ['Ociosas', num(d.filter((x) => x.estado === 'idle').length)], ['Presas em transação', num(d.filter((x) => x.estado === 'idle in transaction').length)]]} />}
        colunas={[['pid', 'PID', null, 'd'], ['usuario', 'Usuário'], ['app', 'Aplicação'], ['estado', 'Estado'], ['espera', 'Espera'], ['conectado_s', 'Conectado há', dur, 'd'], ['consulta_s', 'Consulta há', (v) => (v == null ? '' : `${v}s`), 'd'], ['consulta', 'Consulta', null, 'm']]} />
      <Bloco tipo="bloqueios" titulo="Bloqueios" descricao="Travas no banco. Linhas não concedidas estão esperando outra transação." vazio="Nenhum bloqueio agora."
        destaque={(l) => !l.concedido}
        colunas={[['tipo', 'Tipo'], ['objeto', 'Objeto', null, 'm'], ['modo', 'Modo'], ['concedido', 'Concedido', sim], ['pid', 'PID', null, 'd'], ['app', 'Aplicação'], ['ha_s', 'Há', dur, 'd']]} />
    </div>
  )
}

export function Storage() {
  return <Bloco tipo="storage" titulo="Storage" descricao="Buckets de arquivos, quantos arquivos e quanto ocupam. O conteúdo não aparece aqui."
    antes={(d) => <Numeros itens={[['Buckets', num(d.length)], ['Arquivos', num(d.reduce((s, x) => s + (x.arquivos || 0), 0))], ['Ocupado', kb(d.reduce((s, x) => s + (x.bytes || 0), 0))], ['Públicos', num(d.filter((x) => x.publico).length)]]} />}
    destaque={(l) => l.publico}
    colunas={[['bucket', 'Bucket', null, 'm'], ['publico', 'Público', sim], ['arquivos', 'Arquivos', num, 'd'], ['bytes', 'Ocupado', kb, 'd'], ['limite_bytes', 'Limite por arquivo', kb, 'd'], ['tipos', 'Tipos aceitos'], ['ultimo', 'Último envio']]} />
}

export function Realtime() {
  return <Bloco tipo="realtime" titulo="Realtime" descricao="Publicações do Postgres (o que o Realtime transmite). O mapa multijogador usa canal privado, não tabela."
    colunas={[['publicacao', 'Publicação', null, 'm'], ['tabela', 'Tabela', (v) => v || <span className="text-muted-foreground">nenhuma</span>], ['insere', 'INSERT', sim], ['atualiza', 'UPDATE', sim], ['apaga', 'DELETE', sim]]} />
}

export function Manutencao() {
  const cache = useCatalogo('cache')
  return (
    <div className="space-y-6">
      {cache.dados && (
        <Numeros itens={cache.dados.map((c) => [`Cache de ${c.tipo}`, c.taxa == null ? '—' : `${String(c.taxa).replace('.', ',')}%`, `${num(c.acertos)} da memória · ${num(c.leituras_disco)} do disco`]).concat([['Meta de cache', '99%', 'abaixo disso, falta memória'], ['Leituras do disco', num(cache.dados.reduce((s, c) => s + (c.leituras_disco || 0), 0)), 'tabelas e índices']])} />
      )}
      <Bloco tipo="manutencao" titulo="Manutenção (vacuum)" descricao="Linhas mortas se acumulam com atualizações e remoções; o autovacuum limpa. Muitas mortas = tabela inchada e consultas mais lentas."
        destaque={(l) => l.mortas_pct > 20 && l.mortas > 1000}
        colunas={[['tabela', 'Tabela'], ['vivas', 'Vivas', num, 'd'], ['mortas', 'Mortas', num, 'd'], ['mortas_pct', '% mortas', (v) => `${String(v).replace('.', ',')}%`, 'd'], ['bytes', 'Tamanho', kb, 'd'], ['ultimo_vacuum', 'Último vacuum', quando], ['ultimo_analyze', 'Último analyze', quando], ['insercoes', 'Inserções', num, 'd'], ['atualizacoes', 'Atualizações', num, 'd'], ['remocoes', 'Remoções', num, 'd']]} />
    </div>
  )
}

export function Configuracao() {
  return <Bloco tipo="configuracao" titulo="Configuração do Postgres" descricao="Parâmetros principais do servidor (só leitura)."
    colunas={[['parametro', 'Parâmetro', null, 'm'], ['valor', 'Valor', null, 'm'], ['unidade', 'Unidade'], ['categoria', 'Categoria'], ['descricao', 'Descrição']]} />
}

// ---------------- diagrama do esquema: tabelas ligadas pelas chaves estrangeiras ----------------
export function Esquema({ irPara }) {
  const rel = useCatalogo('relacoes')
  const tab = useDados(() => api.get('/api/supabase/tabelas'))
  const [foco, setFoco] = useState(null)
  if (rel.erro || tab.erro) return <Aviso>{rel.erro || tab.erro}</Aviso>
  if (!rel.dados || !tab.dados) return <Carregando />
  const limpar = (n) => n.replace(/^public\./, '').replaceAll('"', '')
  const arestas = rel.dados.map((r) => ({ ...r, de: limpar(r.de), para: limpar(r.para) }))
  const ligadas = new Set(arestas.flatMap((a) => [a.de, a.para]))
  const tabelas = [...tab.dados].sort((a, b) => (ligadas.has(b.nome) - ligadas.has(a.nome)) || a.nome.localeCompare(b.nome))
  // grade: tabelas com relação primeiro; posição calculada para desenhar as linhas
  const COLS = 5, L = 190, A = 64, GX = 40, GY = 46
  const pos = Object.fromEntries(tabelas.map((t, i) => [t.nome, { x: (i % COLS) * (L + GX) + 10, y: Math.floor(i / COLS) * (A + GY) + 10 }]))
  const W = COLS * (L + GX), H = Math.ceil(tabelas.length / COLS) * (A + GY) + 10
  const ativo = (n) => !foco || n === foco || arestas.some((a) => (a.de === foco && a.para === n) || (a.para === foco && a.de === n))
  return (
    <>
      <TituloSecao titulo="Diagrama do esquema" descricao={`${tabelas.length} tabelas e ${arestas.length} chaves estrangeiras. Clique numa tabela para destacar as ligações; duas vezes abre no editor.`} />
      <div className="overflow-auto rounded-lg border border-border bg-muted/30">
        <svg width={W} height={H} className="block" role="img" aria-label="Diagrama das tabelas e chaves estrangeiras">
          {arestas.map((a, i) => {
            const p = pos[a.de], q = pos[a.para]
            if (!p || !q) return null
            const x1 = p.x + L / 2, y1 = p.y + A / 2, x2 = q.x + L / 2, y2 = q.y + A / 2
            const on = !foco || a.de === foco || a.para === foco
            return <path key={i} d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={on ? 1.6 : 0.6} opacity={on ? 0.9 : 0.15}><title>{`${a.de}.${a.coluna} → ${a.para}.${a.coluna_para} (ao apagar: ${a.ao_apagar})`}</title></path>
          })}
          {tabelas.map((t) => {
            const p = pos[t.nome]
            const nr = arestas.filter((a) => a.de === t.nome || a.para === t.nome).length
            return (
              <g key={t.nome} transform={`translate(${p.x},${p.y})`} opacity={ativo(t.nome) ? 1 : 0.25} className="cursor-pointer" onClick={() => setFoco((f) => (f === t.nome ? null : t.nome))} onDoubleClick={() => irPara('tabelas', t.nome)}>
                <rect width={L} height={A} rx={6} fill="hsl(var(--card))" stroke={foco === t.nome ? 'hsl(var(--primary))' : 'hsl(var(--border))'} strokeWidth={foco === t.nome ? 2 : 1} />
                <rect width={L} height={24} rx={6} fill="hsl(var(--muted))" />
                <text x={10} y={16} fontSize="12" fontWeight="600" fill="hsl(var(--foreground))" fontFamily="ui-monospace,monospace">{t.nome.length > 22 ? t.nome.slice(0, 21) + '…' : t.nome}</text>
                <text x={10} y={42} fontSize="11" fill="hsl(var(--muted-foreground))">{num(t.linhas)} linhas · {kb(t.bytes)}</text>
                <text x={10} y={56} fontSize="11" fill="hsl(var(--muted-foreground))">{t.colunas ?? ''}{t.colunas != null ? ' colunas · ' : ''}{nr ? `${nr} ligações` : 'sem ligações'}{t.rls ? '' : ' · sem RLS'}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-6"><Tabela linhas={arestas} nome="relacoes" colunas={[['de', 'Tabela'], ['coluna', 'Coluna', null, 'm'], ['para', 'Referencia'], ['coluna_para', 'Coluna', null, 'm'], ['ao_apagar', 'Ao apagar'], ['nome', 'Restrição', null, 'm']]} /></div>
      <div className="mt-3 flex justify-end"><Copiar texto={arestas.map((a) => `${a.de}.${a.coluna} -> ${a.para}.${a.coluna_para}`).join('\n')} rotulo="Copiar relações" /></div>
    </>
  )
}
