import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { Compartment, EditorState } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { sql, PostgreSQL } from '@codemirror/lang-sql'
import { snippetCompletion } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'

// Editor SQL com cores (palavras-chave, funções, textos, números, comentários), autocompletar de tabelas e colunas reais
// do banco e trechos prontos (digite "sel", "join", "cte"… e escolha na lista). Ctrl/⌘+Enter roda; com trecho
// selecionado, roda só ele. As cores vêm dos tokens do tema (claro e escuro).
const TRECHOS = [
  ['sel', 'SELECT com filtro e limite', 'select ${colunas}\nfrom ${tabela}\nwhere ${condicao}\nlimit ${100}'],
  ['selc', 'Contar linhas', 'select count(*) from ${tabela}'],
  ['join', 'Junção entre duas tabelas', 'select ${a}.*, ${b}.${coluna}\nfrom ${tabela_a} ${a}\njoin ${tabela_b} ${b} on ${b}.id = ${a}.${chave}_id'],
  ['grp', 'Agrupar e contar', 'select ${coluna}, count(*) as total\nfrom ${tabela}\ngroup by 1\norder by 2 desc'],
  ['cte', 'WITH (consulta em etapas)', 'with ${base} as (\n  select ${colunas} from ${tabela}\n)\nselect * from ${base}'],
  ['dia', 'Por dia (datas em epoch)', "select to_timestamp(quando)::date as dia, count(*) as total\nfrom ${atividade}\nwhere quando > extract(epoch from now() - interval '${7} days')\ngroup by 1 order by 1 desc"],
  ['ult', 'Últimas linhas', 'select *\nfrom ${tabela}\norder by id desc\nlimit ${50}'],
  ['busca', 'Procurar texto (sem diferenciar maiúsculas)', "select *\nfrom ${tabela}\nwhere ${coluna} ilike '%${texto}%'\nlimit 100"],
  ['jan', 'Função de janela (ranking)', 'select ${coluna}, ${valor},\n       rank() over (order by ${valor} desc) as posicao\nfrom ${tabela}'],
  ['json', 'Ler campo de JSON', "select ${coluna}->>'${campo}' as ${campo}\nfrom ${tabela}\nwhere ${coluna} ? '${campo}'"],
  ['tam', 'Tamanho das tabelas', 'select relname as tabela, pg_size_pretty(pg_total_relation_size(relid)) as tamanho\nfrom pg_stat_user_tables\norder by pg_total_relation_size(relid) desc'],
  ['exp', 'Plano de execução', 'explain (format text)\n${select * from atividade limit 10}'],
  ['dist', 'DISTINCT ON (último por grupo)', 'select distinct on (${grupo}) *\nfrom ${tabela}\norder by ${grupo}, ${quando} desc'],
].map(([label, detail, corpo]) => snippetCompletion(corpo, { label, detail: `trecho · ${detail}`, type: 'text', boost: 10 }))

const cores = HighlightStyle.define([
  { tag: t.keyword, color: 'hsl(var(--sql-chave))', fontWeight: '600' },
  { tag: [t.operatorKeyword, t.operator], color: 'hsl(var(--sql-chave))' },
  { tag: [t.string, t.special(t.string)], color: 'hsl(var(--sql-texto))' },
  { tag: [t.number, t.bool, t.null], color: 'hsl(var(--sql-numero))' },
  { tag: t.comment, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: 'hsl(var(--sql-funcao))' },
  { tag: [t.typeName, t.className], color: 'hsl(var(--sql-tipo))' },
  { tag: [t.propertyName, t.special(t.name)], color: 'hsl(var(--foreground))' },
  { tag: t.punctuation, color: 'hsl(var(--muted-foreground))' },
])

const tema = EditorView.theme({
  '&': { height: '100%', fontSize: '13px', backgroundColor: 'transparent', color: 'hsl(var(--foreground))' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'hsl(var(--primary))', padding: '10px 0' },
  '.cm-gutters': { backgroundColor: 'hsl(var(--muted) / 0.4)', color: 'hsl(var(--muted-foreground) / 0.7)', borderRight: '1px solid hsl(var(--border))' },
  '.cm-activeLine': { backgroundColor: 'hsl(var(--muted) / 0.45)' },
  '.cm-activeLineGutter': { backgroundColor: 'hsl(var(--muted))', color: 'hsl(var(--foreground))' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'hsl(var(--primary) / 0.22) !important' },
  '.cm-matchingBracket': { backgroundColor: 'hsl(var(--primary) / 0.18)', outline: '1px solid hsl(var(--primary) / 0.5)' },
  '.cm-tooltip': { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', overflow: 'hidden' },
  '.cm-tooltip-autocomplete > ul': { fontFamily: 'ui-monospace, monospace', fontSize: '12.5px', maxHeight: '16em' },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'hsl(var(--primary) / 0.15)', color: 'hsl(var(--foreground))' },
  '.cm-completionDetail': { color: 'hsl(var(--muted-foreground))', fontStyle: 'normal', marginLeft: '10px' },
  '.cm-completionIcon': { display: 'none' },   // ícones padrão são emoji (🔑): o tipo já aparece no detalhe
  '.cm-snippetField': { backgroundColor: 'hsl(var(--primary) / 0.12)' },
})

const EditorSql = forwardRef(function EditorSql({ valor, aoMudar, aoRodar, esquema }, ref) {
  const caixa = useRef(null)
  const vista = useRef(null)
  const lingua = useRef(new Compartment())
  const rodar = useRef(aoRodar)
  rodar.current = aoRodar

  useImperativeHandle(ref, () => ({
    selecao: () => { const v = vista.current; if (!v) return ''; const s = v.state.selection.main; return s.empty ? '' : v.state.sliceDoc(s.from, s.to) },
    trocar: (texto) => { const v = vista.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: texto } }); v?.focus() },
  }))

  useEffect(() => {
    const v = new EditorView({
      parent: caixa.current,
      state: EditorState.create({
        doc: valor,
        extensions: [
          keymap.of([{ key: 'Mod-Enter', preventDefault: true, run: () => { rodar.current?.(); return true } }]),
          basicSetup,
          lingua.current.of(sql({ dialect: PostgreSQL, schema: {} })),
          PostgreSQL.language.data.of({ autocomplete: TRECHOS }),
          syntaxHighlighting(cores),
          tema,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => { if (u.docChanged) aoMudar(u.state.doc.toString()) }),
          EditorView.contentAttributes.of({ 'aria-label': 'Consulta SQL' }),
        ],
      }),
    })
    vista.current = v
    return () => v.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // esquema chega depois (tabelas e colunas do banco): troca só a parte da linguagem
  useEffect(() => {
    if (vista.current && esquema) vista.current.dispatch({ effects: lingua.current.reconfigure(sql({ dialect: PostgreSQL, schema: esquema, upperCaseKeywords: false })) })
  }, [esquema])

  return <div ref={caixa} className="h-full min-w-0 flex-1 overflow-hidden" />
})

export default EditorSql
