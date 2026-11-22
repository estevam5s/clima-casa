import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkPlus, CheckCircle2, Copy, Download, FileDown, GitCompare, History, ImagePlus, Laptop, Palette, Pipette, RotateCcw, Save, Search, Smartphone, Trash2, Upload, Wrench, XCircle } from 'lucide-react'
import { api, dataHora } from '../../api'
import { MARCA_PADRAO, NOMES_FONTES, aplicarMarca, contraste, escalaDeTons, sazonalNoAr, useMarca } from '../../marca'
import { MODELOS } from '../../cursores'
import { Aviso, Botao, Interruptor, Modal, useToast } from '../ui'

import MarcaExtras from './MarcaExtras'
const PALETAS = [
  ['Teal (padrão)', '#0f766a', '#2563a8'], ['Azul corporativo', '#1d4ed8', '#0891b2'], ['Grafite', '#27272a', '#52525b'],
  ['Verde', '#15803d', '#0d9488'], ['Vinho', '#9f1239', '#be123c'], ['Laranja', '#c2410c', '#b45309'],
  ['Índigo', '#4338ca', '#0369a1'], ['Petróleo', '#155e75', '#0f766a'],
]
const ROTAS = [['/', 'Painel'], ['/projetos', 'Projetos'], ['/relatorios', 'Relatórios'], ['/aparelhos', 'Aparelhos'], ['/cenas', 'Cenas'],
  ['/automacoes', 'Automações'], ['/agendamentos', 'Agenda'], ['/transmissores', 'Transmissores IR'], ['/integracoes', 'Alexa e Google'],
  ['/comandos-alexa', 'Comandos de voz'], ['/alexa', 'Skill própria'], ['/supabase', 'Supabase'], ['/atividade', 'Atividade'], ['/apps', 'Baixar apps']]
const RECURSOS = ['Nome do sistema', 'Nome curto (app instalado)', 'Slogan e descrição', 'Logo', 'Ícone da aba', 'Cor principal', 'Cor de destaque',
  'Cor de alerta', 'Paletas prontas', 'Tema padrão', 'Fonte', 'Tamanho do texto', 'Cantos arredondados', 'Densidade', 'Título e subtítulo do login',
  'Fumaça do login', 'Downloads no login', 'Rodapé do login', 'Banner de aviso global', 'Boas-vindas no painel', 'Rodapé do sistema',
  'Contatos de suporte', 'Renomear itens do menu', 'Ocultar itens do menu', 'Unidade de temperatura', 'Formato de hora', 'Descrição para buscadores',
  'Domínio próprio', 'Créditos', 'CSS personalizado', 'Exportar e importar', 'Histórico de versões', 'Pré-visualização ao vivo', 'Restaurar padrão',
  'Temas prontos', 'Cores tiradas do logo', 'Verificador de contraste (WCAG)', 'Logo do tema escuro', 'Estilo do menu lateral', 'Nível de animações',
  'Fundo do login (fumaça, cor ou imagem)', 'Links de privacidade e termos no login', 'Selo de ambiente no cabeçalho', 'Botão de ajuda com contatos',
  'Banner com data de início e fim', 'Cor da barra do navegador no celular', '6 fontes hospedadas no sistema (Inter, Manrope, DM Sans…)',
  'Tom do fundo (zinco, pedra, ardósia, oliva)', 'Estilo dos botões (sólido, contorno, pílula)', 'Estilo dos cartões (borda, sombra, plano)',
  'Largura do conteúdo', 'Espessura dos ícones', 'Login centralizado ou dividido', 'Aviso na tela de login', 'Página inicial depois do login',
  'Mostrar ou esconder "Voltar ao site"', 'Modo manutenção (só administradores entram)', 'Previsão de volta na manutenção',
  'Logo da empresa nos relatórios', 'Rodapé próprio nos relatórios (razão social, CNPJ)', 'Pré-visualização no celular',
  'Cores de sucesso e de aviso', 'Escala de tons 50 a 950 (variáveis CSS)', 'Auditoria de acessibilidade de todas as cores', 'Fonte própria para os títulos',
  'Peso dos títulos', 'Espaçamento entre letras', 'Intensidade das sombras', 'Espessura das bordas', 'Fundo do sistema (liso, pontos, grade, gradiente)',
  'Cabeçalho (vidro, sólido ou na cor da marca)', 'Largura do menu lateral', 'Alto contraste', 'Foco do teclado reforçado', 'Links sublinhados',
  'Sem transparências', 'Marca d’água (ex.: Confidencial)', 'Formato do título da aba', 'Tema sazonal com período (Natal, Outubro Rosa…)',
  'Cursor padrão da empresa', 'Redes sociais no rodapé', 'Tela de abertura com o logo', 'Temas próprios salvos', 'Comparar versões campo a campo',
  'Kit da marca para baixar', 'Busca nas opções', 'Índice das seções']

// temas completos: cores, fonte, cantos, densidade, menu e tema padrão de uma vez
const TEMAS_PRONTOS = [
  { nome: 'Escritório (padrão)', cor_primaria: '#0f766a', cor_destaque: '#2563a8', cor_alerta: '#dc2626', fonte: 'sistema', raio: 12, densidade: 'confortavel', menu_estilo: 'padrao', tema_padrao: 'sistema' },
  { nome: 'Corporativo', cor_primaria: '#1d4ed8', cor_destaque: '#0891b2', cor_alerta: '#dc2626', fonte: 'sistema', raio: 6, densidade: 'compacta', menu_estilo: 'escuro', tema_padrao: 'claro' },
  { nome: 'Clínica', cor_primaria: '#0e7490', cor_destaque: '#16a34a', cor_alerta: '#e11d48', fonte: 'arredondada', raio: 16, densidade: 'espacosa', menu_estilo: 'padrao', tema_padrao: 'claro' },
  { nome: 'Grafite', cor_primaria: '#27272a', cor_destaque: '#71717a', cor_alerta: '#dc2626', fonte: 'sistema', raio: 8, densidade: 'confortavel', menu_estilo: 'escuro', tema_padrao: 'escuro' },
  { nome: 'Indústria', cor_primaria: '#c2410c', cor_destaque: '#b45309', cor_alerta: '#b91c1c', fonte: 'condensada', raio: 4, densidade: 'compacta', menu_estilo: 'marca', tema_padrao: 'escuro' },
  { nome: 'Advocacia', cor_primaria: '#7f1d1d', cor_destaque: '#a16207', cor_alerta: '#b91c1c', fonte: 'serifada', raio: 6, densidade: 'confortavel', menu_estilo: 'marca', tema_padrao: 'claro' },
  { nome: 'Tecnologia', cor_primaria: '#4338ca', cor_destaque: '#0369a1', cor_alerta: '#dc2626', fonte: 'mono', raio: 10, densidade: 'compacta', menu_estilo: 'escuro', tema_padrao: 'escuro' },
  { nome: 'Natureza', cor_primaria: '#15803d', cor_destaque: '#0d9488', cor_alerta: '#c2410c', fonte: 'arredondada', raio: 18, densidade: 'espacosa', menu_estilo: 'marca', tema_padrao: 'claro' },
]

// cor mais marcante de uma imagem (média dos pixels mais saturados), para sugerir a paleta a partir do logo
function corDoLogo(url) {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 48
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, 48, 48)
      const d = g.getImageData(0, 0, 48, 48).data
      const px = []
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue
        const [r, gg, b] = [d[i], d[i + 1], d[i + 2]], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b)
        const sat = mx ? (mx - mn) / mx : 0, luz = (mx + mn) / 510
        if (luz > 0.12 && luz < 0.88) px.push([sat, r, gg, b])
      }
      if (!px.length) return ok(null)
      px.sort((a, b) => b[0] - a[0])
      const top = px.slice(0, Math.max(8, Math.floor(px.length * 0.15)))
      const m = [1, 2, 3].map((k) => Math.round(top.reduce((s2, p) => s2 + p[k], 0) / top.length))
      ok(`#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`)
    }
    img.onerror = () => ok(null)
    img.src = url
  })
}

function Contraste({ cor }) {
  const linhas = [['Texto branco sobre a cor (botões)', cor, '#ffffff'], ['Cor sobre fundo claro (links)', cor, '#ffffff'], ['Cor sobre fundo escuro', cor, '#0b0b0f']]
  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Contraste (WCAG 2.1)</p>
      {linhas.map(([r, a, b], i) => {
        const v = contraste(a, b), ok = v >= 4.5, medio = v >= 3
        return (
          <div key={i} className="flex items-center justify-between gap-3 py-1 text-sm">
            <span className="flex items-center gap-2"><span className="grid h-6 w-10 place-items-center rounded text-[10px] font-bold" style={{ background: i === 0 ? a : b, color: i === 0 ? b : a }}>Aa</span>{r}</span>
            <span className={`flex items-center gap-1 text-xs font-medium tabular ${ok ? 'text-emerald-600 dark:text-emerald-400' : medio ? 'text-amber-600' : 'text-red-600'}`}>
              {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}{v.toFixed(1)}:1 {ok ? (v >= 7 ? 'AAA' : 'AA') : medio ? 'só texto grande' : 'baixo'}
            </span>
          </div>
        )
      })}
      <p className="mt-1 text-[11px] text-muted-foreground">O sistema ainda ajusta a luminosidade sozinho no claro e no escuro; isto mostra a cor exata escolhida.</p>
    </div>
  )
}

function Campo({ rotulo, ajuda, children }) {
  return <div><span className="rotulo">{rotulo}</span>{children}{ajuda && <p className="ajuda">{ajuda}</p>}</div>
}

const BuscaCtx = createContext('')
const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const ancora = (t) => `wl-${semAcento(t).replace(/[^a-z0-9]+/g, '-')}`
function Bloco({ titulo, descricao, palavras = '', children }) {
  const busca = useContext(BuscaCtx)
  if (busca && !semAcento(`${titulo} ${descricao || ''} ${palavras}`).includes(semAcento(busca))) return null
  return (
    <section id={ancora(titulo)} className="cartao scroll-mt-24 p-5">
      <h3 className="titulo-secao">{titulo}</h3>
      {descricao && <p className="mb-4 text-xs text-muted-foreground">{descricao}</p>}
      <div className={descricao ? '' : 'mt-4'}>{children}</div>
    </section>
  )
}

function lerImagem(arquivo, max = 300_000) {
  return new Promise((ok, erro) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(arquivo.type)) return erro(new Error('Use PNG, JPG, WEBP ou SVG.'))
    if (arquivo.size > max) return erro(new Error(`Imagem grande demais (máximo de ${Math.round(max / 1000)} KB).`))
    const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => erro(new Error('Não foi possível ler a imagem.')); r.readAsDataURL(arquivo)
  })
}

const SECOES = ['Temas prontos', 'Meus temas', 'Identidade', 'Cores', 'Tipografia e layout', 'Acabamento', 'Cores avançadas', 'Tipografia dos títulos', 'Superfícies',
  'Acessibilidade', 'Tela de login', 'Abertura e redes', 'Marca d’água e aba', 'Tema sazonal', 'Cursor padrão', 'Comunicação', 'Modo manutenção',
  'Relatórios exportados', 'Menu lateral', 'Regional e avançado']
const SAZONAIS = [['Natal', '#b91c1c', '#15803d'], ['Outubro Rosa', '#db2777', '#be185d'], ['Novembro Azul', '#1d4ed8', '#0369a1'], ['Copa', '#15803d', '#ca8a04'], ['Aniversário', '#7c3aed', '#c026d3']]
const EFEITOS_CURSOR = [['rastro', 'Rastro'], ['brilho', 'Brilho'], ['ondas', 'Ondas'], ['faiscas', 'Faíscas'], ['magnetico', 'Magnético'], ['arco_iris', 'Arco-íris']]
const NOMES_CAMPOS = { cor_primaria: 'Cor principal', cor_destaque: 'Cor de destaque', cor_alerta: 'Cor de alerta', nome: 'Nome', fonte: 'Fonte', raio: 'Cantos', tema_padrao: 'Tema padrão', menu_estilo: 'Menu', densidade: 'Densidade', escala: 'Tamanho do texto' }

// todas as cores contra fundo claro e escuro, com nota geral
function Auditoria({ f }) {
  const cores = [['Principal', f.cor_primaria], ['Destaque', f.cor_destaque], ['Alerta', f.cor_alerta], ['Sucesso', f.cor_sucesso], ['Aviso', f.cor_aviso]].filter(([, c]) => /^#[0-9a-f]{6}$/i.test(c || ''))
  const testes = cores.flatMap(([n, c]) => [[n, c, '#ffffff', 'no claro'], [n, c, '#0b0b0f', 'no escuro']])
  const ok = testes.filter(([, a, b]) => contraste(a, b) >= 3).length
  const nota = Math.round((ok / Math.max(1, testes.length)) * 100)
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex items-center justify-between"><p className="text-xs font-medium text-muted-foreground">Auditoria de acessibilidade (texto grande e ícones, 3:1)</p>
        <span className={`text-sm font-semibold tabular ${nota >= 90 ? 'text-emerald-600 dark:text-emerald-400' : nota >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{nota}%</span></div>
      <div className="grid gap-1 sm:grid-cols-2">
        {testes.map(([n, a, b, onde]) => { const v = contraste(a, b); return (
          <div key={n + onde} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2"><span className="grid h-5 w-8 place-items-center rounded text-[9px] font-bold" style={{ background: b, color: a }}>Aa</span>{n} {onde}</span>
            <span className={`tabular ${v >= 4.5 ? 'text-emerald-600 dark:text-emerald-400' : v >= 3 ? 'text-amber-600' : 'text-red-600'}`}>{v.toFixed(1)}:1</span>
          </div>) })}
      </div>
    </div>
  )
}

function Tons({ cor, toast }) {
  const tons = escalaDeTons(cor)
  const css = tons.map(([k, v]) => `  --marca-${k}: ${v};`).join('\n')
  return (
    <div>
      <div className="flex overflow-hidden rounded-lg border border-border">{tons.map(([k, v]) => <span key={k} title={`${k} · ${v}`} className="flex h-12 flex-1 items-end justify-center pb-1 text-[9px] font-medium" style={{ background: v, color: Number(k) >= 500 ? '#fff' : '#111' }}>{k}</span>)}</div>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(`:root {\n${css}\n}`); toast('Variáveis copiadas. Use como hsl(var(--marca-500)) no CSS personalizado.') }} className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Copy className="h-3.5 w-3.5" />Copiar variáveis CSS</button>
    </div>
  )
}

// página HTML com logo, cores, tons, fontes e regras de uso, para mandar a quem faz material da empresa
function baixarKit(f) {
  const esc = (t) => String(t || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const linha = (n, c) => `<div class="cor"><span style="background:${c}"></span><b>${n}</b><code>${c}</code></div>`
  const tons = escalaDeTons(f.cor_primaria).map(([k, v]) => `<span style="background:${v};color:${Number(k) >= 500 ? '#fff' : '#111'}">${k}</span>`).join('')
  const fonte = (NOMES_FONTES.find(([k]) => k === f.fonte) || [])[1] || f.fonte
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kit da marca · ${esc(f.nome)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:32px 16px;color:#18181b;background:#fafafa}main{max-width:860px;margin:auto}h1{margin:0 0 4px}section{background:#fff;border:1px solid #e4e4e7;border-radius:${f.raio}px;padding:20px;margin:16px 0}
.cor{display:flex;align-items:center;gap:12px;margin:8px 0}.cor span{width:48px;height:32px;border-radius:6px;border:1px solid #0001}.cor code{color:#71717a}.tons{display:flex;border-radius:8px;overflow:hidden}.tons span{flex:1;padding:22px 0 6px;text-align:center;font-size:11px}
img{max-height:96px;max-width:240px}.logos{display:flex;gap:24px;flex-wrap:wrap;align-items:center}.escuro{background:#0b0b0f;padding:12px;border-radius:8px}</style>
<main><h1>${esc(f.nome)}</h1><p>${esc(f.slogan)}</p>
<section><h2>Logo</h2><div class="logos">${f.logo ? `<img src="${f.logo}" alt="Logo">` : '<p>Sem logo enviado.</p>'}${f.logo_escuro ? `<div class="escuro"><img src="${f.logo_escuro}" alt="Logo no escuro"></div>` : ''}</div></section>
<section><h2>Cores</h2>${linha('Principal', f.cor_primaria)}${linha('Destaque', f.cor_destaque)}${linha('Alerta', f.cor_alerta)}${linha('Sucesso', f.cor_sucesso)}${linha('Aviso', f.cor_aviso)}<h3>Tons da cor principal</h3><div class="tons">${tons}</div></section>
<section><h2>Tipografia</h2><p>Texto: <b>${esc(fonte)}</b> · Títulos com peso ${f.peso_titulos} · Cantos de ${f.raio}px</p></section>
<section><h2>Contato</h2><p>${esc([f.site, f.suporte_email, f.suporte_telefone].filter(Boolean).join(' · ') || 'Sem contatos cadastrados.')}</p></section>
<p style="color:#71717a;font-size:12px">Gerado em ${new Date().toLocaleString('pt-BR')}.</p></main></html>`
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  a.download = `kit-da-marca-${f.nome_curto.toLowerCase().replace(/\W+/g, '-')}.html`; a.click(); URL.revokeObjectURL(a.href)
}

function MeusTemas({ f, setF, toast }) {
  const [temas, setTemas] = useState(null)
  const [nome, setNome] = useState('')
  useEffect(() => { api.get('/api/marca/temas').then(setTemas).catch(() => setTemas([])) }, [])
  const salvar = async () => {
    if (!nome.trim()) return
    try { setTemas(await api.post('/api/marca/temas', { nome: nome.trim(), valores: f })); setNome(''); toast('Tema salvo. Ele fica disponível para todos os administradores.') } catch (e) { toast(e.message, 'erro') }
  }
  const apagar = async (n) => { try { setTemas(await api.del(`/api/marca/temas/${encodeURIComponent(n)}`)) } catch (e) { toast(e.message, 'erro') } }
  return (
    <div className="space-y-3">
      <div className="flex gap-2"><input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={40} placeholder="Nome do tema (ex.: Filial Centro)" onKeyDown={(e) => e.key === 'Enter' && salvar()} />
        <Botao variante="secundario" icone={BookmarkPlus} disabled={!nome.trim()} onClick={salvar} className="shrink-0 whitespace-nowrap">Salvar o atual</Botao></div>
      {temas?.length === 0 && <p className="text-xs text-muted-foreground">Nenhum tema salvo. Monte cores, fontes e acabamento e guarde aqui para trocar depois com um clique.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {temas?.map((t) => (
          <div key={t.nome} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <span className="flex shrink-0 overflow-hidden rounded"><span className="h-6 w-4" style={{ background: t.valores.cor_primaria }} /><span className="h-6 w-4" style={{ background: t.valores.cor_destaque }} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.nome}</span><span className="block text-[11px] text-muted-foreground">{dataHora(t.em)}</span></span>
            <Botao tamanho="sm" variante="secundario" onClick={() => { setF((x) => ({ ...x, ...t.valores })); toast(`Tema “${t.nome}” aplicado. Salve para valer.`) }}>Aplicar</Botao>
            <button onClick={() => apagar(t.nome)} className="rounded-md p-1.5 text-muted-foreground hover:text-red-600" aria-label={`Apagar ${t.nome}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WhiteLabel() {
  const { marca, setMarcaLocal } = useMarca()
  const [f, setF] = useState(marca)
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState(null)
  const original = useRef(marca)
  const [aparelho, setAparelho] = useState('computador')
  const [busca, setBusca] = useState('')
  const [comparar, setComparar] = useState(null)
  const importar = useRef(null)
  const toast = useToast()
  const mudou = JSON.stringify(f) !== JSON.stringify(original.current)

  useEffect(() => { aplicarMarca(f) }, [f]) // pré-visualização ao vivo
  useEffect(() => () => aplicarMarca(original.current), []) // ao sair sem salvar, volta ao que estava
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v?.target ? (v.target.type === 'number' || v.target.type === 'range' ? +v.target.value : v.target.value) : v }))

  const salvar = async () => {
    setSalvando(true)
    try {
      const novo = await api.put('/api/marca', f)
      original.current = novo; setF(novo); setMarcaLocal(novo)
      toast('White label salvo e aplicado em todo o sistema.')
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const imagem = (campo) => async (e) => {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    try { setF((x) => ({ ...x, [campo]: '' })); const url = await lerImagem(a); setF((x) => ({ ...x, [campo]: url })) } catch (err) { toast(err.message, 'erro') }
  }
  const exportar = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: 'application/json' }))
    a.download = `white-label-${f.nome_curto.toLowerCase().replace(/\W+/g, '-')}.json`; a.click(); URL.revokeObjectURL(a.href)
  }
  const carregarJson = async (e) => {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    try { setF({ ...MARCA_PADRAO, ...JSON.parse(await a.text()) }); toast('Configuração carregada. Revise e salve.') } catch { toast('Arquivo JSON inválido.', 'erro') }
  }
  const abrirHistorico = async () => setHistorico(await api.get('/api/marca/historico'))
  const compararVersao = async (i) => {
    try {
      const v = await api.get(`/api/marca/historico/${i}`)
      const difs = Object.keys(v.marca).filter((k) => JSON.stringify(v.marca[k]) !== JSON.stringify(original.current[k]))
      setComparar({ em: v.em, indice: i, difs: difs.map((k) => [k, v.marca[k], original.current[k]]) })
    } catch (e) { toast(e.message, 'erro') }
  }
  const restaurar = async (i) => {
    const novo = await api.post(`/api/marca/historico/${i}/restaurar`)
    original.current = novo; setF(novo); setMarcaLocal(novo); setHistorico(null); toast('Versão restaurada.')
  }
  const padrao = async () => {
    const novo = await api.post('/api/marca/padrao')
    original.current = novo; setF(novo); setMarcaLocal(novo); toast('Marca padrão restaurada.')
  }

  return (
    <div className="space-y-6">
      <div className="cartao flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">White label</p>
          <p className="text-xs text-muted-foreground">{RECURSOS.length} recursos. As mudanças aparecem na hora; nada vale até você salvar.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Botao variante="secundario" tamanho="sm" icone={FileDown} onClick={() => baixarKit(f)}>Kit da marca</Botao>
          <Botao variante="secundario" tamanho="sm" icone={History} onClick={abrirHistorico}>Versões</Botao>
          <Botao variante="secundario" tamanho="sm" icone={Download} onClick={exportar}>Exportar</Botao>
          <Botao variante="secundario" tamanho="sm" icone={Upload} onClick={() => importar.current?.click()}>Importar</Botao>
          <input ref={importar} type="file" accept="application/json" className="hidden" onChange={carregarJson} />
          <Botao variante="secundario" tamanho="sm" icone={RotateCcw} disabled={!mudou} onClick={() => setF(original.current)}>Descartar</Botao>
          <Botao tamanho="sm" icone={Save} carregando={salvando} disabled={!mudou} onClick={salvar}>Salvar</Botao>
        </div>
      </div>

      <div className="space-y-3">
        <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="campo pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar opção (ex.: cursor, sombra, login, contraste)" aria-label="Buscar nas opções do white label" /></label>
        {!busca && <nav className="flex flex-wrap gap-1.5" aria-label="Seções do white label">{SECOES.map((t) => <a key={t} href={`#${ancora(t)}`} onClick={(e) => { e.preventDefault(); document.getElementById(ancora(t))?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">{t}</a>)}</nav>}
      </div>

      <BuscaCtx.Provider value={busca}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Bloco titulo="Temas prontos" descricao="Aplica cores, fonte, cantos, densidade, menu e tema de uma vez. Ajuste o que quiser depois.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"> {/* marca: amostras dos temas prontos */}
              {TEMAS_PRONTOS.map((t) => {
                const ativo = f.cor_primaria === t.cor_primaria && f.fonte === t.fonte && f.menu_estilo === t.menu_estilo
                return (
                  <button key={t.nome} onClick={() => { const { nome, ...resto } = t; setF((x) => ({ ...x, ...resto })) }}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${ativo ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted'}`}>
                    <div className="flex h-12" style={{ borderRadius: 0 }}>
                      <span className="w-1/4" style={{ background: t.menu_estilo === 'escuro' ? '#18181b' : t.menu_estilo === 'marca' ? t.cor_primaria : '#f4f4f5' }} /> {/* marca: amostras dos temas prontos */}
                      <span className="flex flex-1 items-end gap-1 p-1.5" style={{ background: t.tema_padrao === 'escuro' ? '#0b0b0f' : '#ffffff' }}>
                        <span className="h-3 w-8" style={{ background: t.cor_primaria, borderRadius: t.raio / 3 }} /><span className="h-2 w-5" style={{ background: t.cor_destaque, borderRadius: t.raio / 3 }} />
                      </span>
                    </div>
                    <p className="px-2.5 py-1.5 text-xs font-medium">{t.nome}</p>
                  </button>
                )
              })}
            </div>
          </Bloco>

          <Bloco titulo="Meus temas" descricao="Guarde combinações de cores, fontes e acabamento com um nome e troque com um clique." palavras="salvar tema favorito filial">
            <MeusTemas f={f} setF={setF} toast={toast} />
          </Bloco>

          <Bloco titulo="Identidade" descricao="Nome, textos e imagens que identificam o sistema.">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Nome do sistema"><input className="campo" value={f.nome} onChange={set('nome')} maxLength={60} /></Campo>
              <Campo rotulo="Nome curto" ajuda="Aparece no app instalado e em espaços pequenos."><input className="campo" value={f.nome_curto} onChange={set('nome_curto')} maxLength={20} /></Campo>
              <div className="md:col-span-2"><Campo rotulo="Slogan"><input className="campo" value={f.slogan} onChange={set('slogan')} maxLength={160} /></Campo></div>
              <div className="md:col-span-2"><Campo rotulo="Descrição"><input className="campo" value={f.descricao} onChange={set('descricao')} maxLength={200} /></Campo></div>
              {[['logo', 'Logo'], ['logo_escuro', 'Logo no tema escuro'], ['favicon', 'Ícone da aba (favicon)']].map(([k, r]) => (
                <Campo key={k} rotulo={r} ajuda="PNG, JPG, WEBP ou SVG até 300 KB. Quadrado fica melhor.">
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted">
                      {f[k] ? <img src={f[k]} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}
                    </span>
                    <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Enviar<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={imagem(k)} /></label>
                    {f[k] && <button className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-red-600" onClick={() => set(k)('')} aria-label="Remover"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </Campo>
              ))}
              <Campo rotulo="Site"><input className="campo" value={f.site} onChange={set('site')} placeholder="https://" /></Campo>
              <Campo rotulo="Domínio próprio" ajuda="Aponte o domínio para a Vercel (CNAME cname.vercel-dns.com) e adicione no projeto."><input className="campo" value={f.dominio} onChange={set('dominio')} placeholder="clima.suaempresa.com.br" /></Campo>
            </div>
          </Bloco>

          <Bloco titulo="Cores" descricao="O sistema ajusta a luminosidade sozinho para manter o texto legível no claro e no escuro.">
            <div className="mb-4 flex flex-wrap gap-2">
              {PALETAS.map(([n, p, d]) => (
                <button key={n} onClick={() => setF((x) => ({ ...x, cor_primaria: p, cor_destaque: d }))} title={n}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${f.cor_primaria === p ? 'border-primary' : 'border-border hover:bg-muted'}`}>
                  <span className="flex"><span className="h-4 w-4 rounded-l" style={{ background: p }} /><span className="h-4 w-4 rounded-r" style={{ background: d }} /></span>{n}
                </button>
              ))}
            </div>
            {f.logo && <Botao variante="secundario" tamanho="sm" icone={Pipette} className="mb-4" onClick={async () => { const c = await corDoLogo(f.logo); if (c) { setF((x) => ({ ...x, cor_primaria: c })); toast(`Cor principal tirada do logo: ${c}`) } else toast('Não achei uma cor marcante no logo.', 'erro') }}>Usar a cor do logo</Botao>}
            <div className="grid gap-4 sm:grid-cols-3">
              {[['cor_primaria', 'Principal'], ['cor_destaque', 'Destaque (gráficos)'], ['cor_alerta', 'Alerta']].map(([k, r]) => (
                <Campo key={k} rotulo={r}>
                  <div className="flex gap-2"><input type="color" value={f[k]} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-card p-1" aria-label={r} />
                    <input className="campo font-mono" value={f[k]} onChange={set(k)} maxLength={7} /></div>
                </Campo>
              ))}
            </div>
            {/^#[0-9a-fA-F]{6}$/.test(f.cor_primaria) && <Contraste cor={f.cor_primaria} />}
          </Bloco>

          <Bloco titulo="Tipografia e layout">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Fonte"><select className="campo" value={f.fonte} onChange={set('fonte')}>
                {NOMES_FONTES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select></Campo>
              <Campo rotulo="Densidade"><select className="campo" value={f.densidade} onChange={set('densidade')}>
                <option value="compacta">Compacta</option><option value="confortavel">Confortável</option><option value="espacosa">Espaçosa</option></select></Campo>
              <Campo rotulo={`Tamanho do texto · ${f.escala}%`}><input type="range" min={85} max={120} value={f.escala} onChange={set('escala')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              <Campo rotulo={`Cantos arredondados · ${f.raio}px`}><input type="range" min={0} max={24} value={f.raio} onChange={set('raio')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              <Campo rotulo="Tema padrão" ajuda="Vale para quem ainda não escolheu um tema."><select className="campo" value={f.tema_padrao} onChange={set('tema_padrao')}>
                <option value="sistema">Seguir o sistema</option><option value="claro">Claro</option><option value="escuro">Escuro</option></select></Campo>
              <Campo rotulo="Menu lateral"><select className="campo" value={f.menu_estilo} onChange={set('menu_estilo')}>
                <option value="padrao">Acompanha o tema</option><option value="escuro">Sempre escuro</option><option value="marca">Na cor da marca</option></select></Campo>
              <Campo rotulo="Animações" ajuda="Quem pede menos movimento no aparelho já recebe animações reduzidas."><select className="campo" value={f.animacoes} onChange={set('animacoes')}>
                <option value="completas">Completas</option><option value="reduzidas">Reduzidas</option><option value="desligadas">Desligadas</option></select></Campo>
            </div>
          </Bloco>

          <Bloco titulo="Acabamento" descricao="Detalhes que mudam a cara do sistema inteiro sem trocar as cores.">
            <div className="space-y-5">
              <Campo rotulo="Tom do fundo e das bordas">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[['zinco', 'Zinco', '#f4f4f5', '#e4e4e7'], ['pedra', 'Pedra', '#f5f3f0', '#e2ddd6'], ['ardosia', 'Ardósia', '#f1f4f8', '#d9e0ea'], ['oliva', 'Oliva', '#f3f5f0', '#dde3d6']].map(([k, r, a, b]) => (
                    <button key={k} type="button" onClick={() => set('tom_neutro')(k)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${f.tom_neutro === k ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted'}`}>
                      <span className="flex overflow-hidden rounded"><span className="h-5 w-3" style={{ background: a }} /><span className="h-5 w-3" style={{ background: b }} /></span>{r}
                    </button>
                  ))} {/* marca: amostras dos tons neutros */}
                </div>
              </Campo>
              <div className="grid gap-4 md:grid-cols-2">
                <Campo rotulo="Botões"><div className="flex gap-2">{[['solido', 'Sólido'], ['contorno', 'Contorno'], ['pilula', 'Pílula']].map(([k, r]) => (
                  <button key={k} type="button" onClick={() => set('estilo_botao')(k)} className={`flex-1 border px-2 py-2 text-xs font-medium ${k === 'pilula' ? 'rounded-full' : 'rounded-lg'} ${f.estilo_botao === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{r}</button>))}</div></Campo>
                <Campo rotulo="Cartões"><div className="flex gap-2">{[['borda', 'Com borda'], ['sombra', 'Com sombra'], ['plano', 'Plano']].map(([k, r]) => (
                  <button key={k} type="button" onClick={() => set('estilo_cartao')(k)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${f.estilo_cartao === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{r}</button>))}</div></Campo>
                <Campo rotulo="Largura do conteúdo" ajuda="Em telas grandes."><select className="campo" value={f.largura} onChange={set('largura')}>
                  <option value="padrao">Padrão (leitura confortável)</option><option value="larga">Larga</option><option value="total">Toda a tela</option></select></Campo>
                <Campo rotulo={`Espessura dos ícones · ${(f.icone_espessura / 10).toFixed(1)}`}><input type="range" min={12} max={28} step={1} value={f.icone_espessura} onChange={set('icone_espessura')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              </div>
            </div>
          </Bloco>


          <Bloco titulo="Cores avançadas" descricao="Sucesso e aviso, a escala de tons da cor principal e a auditoria de contraste de todas as cores." palavras="sucesso aviso tons paleta 50 950 variaveis acessibilidade contraste wcag">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {[['cor_sucesso', 'Sucesso'], ['cor_aviso', 'Aviso']].map(([k, r]) => (
                  <Campo key={k} rotulo={r}><div className="flex gap-2"><input type="color" value={f[k]} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-card p-1" aria-label={r} /><input className="campo font-mono" value={f[k]} onChange={set(k)} maxLength={7} /></div></Campo>
                ))}
              </div>
              {/^#[0-9a-fA-F]{6}$/.test(f.cor_primaria) && <Tons cor={f.cor_primaria} toast={toast} />}
              <Auditoria f={f} />
            </div>
          </Bloco>

          <Bloco titulo="Tipografia dos títulos" descricao="Títulos com fonte e peso próprios, e o espaço entre as letras do sistema inteiro." palavras="fonte titulo peso negrito letras espacamento">
            <div className="grid gap-4 md:grid-cols-3">
              <Campo rotulo="Fonte dos títulos"><select className="campo" value={f.fonte_titulos} onChange={set('fonte_titulos')}><option value="mesma">A mesma do texto</option>{NOMES_FONTES.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
              <Campo rotulo={`Peso dos títulos · ${f.peso_titulos}`}><input type="range" min={400} max={800} step={100} value={f.peso_titulos} onChange={set('peso_titulos')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              <Campo rotulo={`Espaço entre letras · ${(f.espaco_letras / 100).toFixed(2)}em`}><input type="range" min={-3} max={6} step={1} value={f.espaco_letras} onChange={set('espaco_letras')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
            </div>
            <p className="mt-3 text-2xl" style={{ fontFamily: 'var(--fonte-titulos)', fontWeight: f.peso_titulos }}>Sala de reunião a 23°</p>
          </Bloco>

          <Bloco titulo="Superfícies" descricao="Sombra, bordas, fundo, cabeçalho e menu." palavras="sombra borda fundo pontos grade gradiente cabecalho vidro menu largura">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Sombra dos cartões"><div className="flex gap-2">{[['nenhuma', 'Nenhuma'], ['suave', 'Suave'], ['media', 'Média'], ['forte', 'Forte']].map(([k, r]) => <button key={k} type="button" onClick={() => set('sombra')(k)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium ${f.sombra === k ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>{r}</button>)}</div></Campo>
              <Campo rotulo={`Espessura das bordas · ${f.borda_espessura}px`}><input type="range" min={0} max={3} step={1} value={f.borda_espessura} onChange={set('borda_espessura')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              <Campo rotulo="Fundo do sistema"><div className="grid grid-cols-4 gap-2">{[['liso', 'Liso'], ['pontos', 'Pontos'], ['grade', 'Grade'], ['gradiente', 'Gradiente']].map(([k, r]) => (
                <button key={k} type="button" onClick={() => set('fundo_app')(k)} className={`rounded-lg border px-1 pb-1.5 pt-1 text-[11px] font-medium ${f.fundo_app === k ? 'border-primary text-primary ring-1 ring-primary' : 'border-border hover:bg-muted'}`}>
                  <span className="mb-1 block h-8 rounded-md bg-background" style={k === 'pontos' ? { backgroundImage: 'radial-gradient(hsl(var(--foreground) / .25) 1px, transparent 1px)', backgroundSize: '6px 6px' } : k === 'grade' ? { backgroundImage: 'linear-gradient(hsl(var(--foreground) / .15) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / .15) 1px, transparent 1px)', backgroundSize: '8px 8px' } : k === 'gradiente' ? { backgroundImage: 'radial-gradient(circle at 80% 0, hsl(var(--primary) / .35), transparent 70%)' } : {}} />{r}</button>))}</div></Campo> {/* marca: amostras do fundo */}
              <Campo rotulo="Cabeçalho"><select className="campo" value={f.cabecalho_estilo} onChange={set('cabecalho_estilo')}><option value="vidro">Vidro (desfoca o conteúdo)</option><option value="solido">Sólido</option><option value="marca">Na cor da marca</option></select></Campo>
              <Campo rotulo={`Largura do menu aberto · ${f.menu_largura}px`}><input type="range" min={200} max={320} step={8} value={f.menu_largura} onChange={set('menu_largura')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
            </div>
          </Bloco>

          <Bloco titulo="Acessibilidade" descricao="Vale para todos os usuários. Quem pede menos movimento no aparelho já recebe animações reduzidas." palavras="contraste foco teclado links sublinhado transparencia leitura">
            <div className="grid gap-2 md:grid-cols-2">
              {[['alto_contraste', 'Alto contraste', 'Textos secundários e bordas mais escuros.'], ['foco_reforcado', 'Foco do teclado reforçado', 'Contorno grosso no item focado com Tab.'],
                ['sublinhar_links', 'Links sublinhados', 'Ajuda quem não distingue cores.'], ['reduzir_transparencia', 'Sem transparências', 'Tira o efeito vidro do cabeçalho e dos painéis.']].map(([k, r, d]) => (
                <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm"><span>{r}<span className="block text-xs text-muted-foreground">{d}</span></span><Interruptor ligado={f[k]} onChange={set(k)} rotulo={r} /></label>
              ))}
            </div>
          </Bloco>

          <Bloco titulo="Tela de login">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Título"><input className="campo" value={f.login_titulo} onChange={set('login_titulo')} maxLength={60} /></Campo>
              <Campo rotulo="Subtítulo"><input className="campo" value={f.login_subtitulo} onChange={set('login_subtitulo')} maxLength={160} /></Campo>
              <div className="md:col-span-2"><Campo rotulo="Texto do rodapé"><input className="campo" value={f.login_rodape} onChange={set('login_rodape')} maxLength={160} /></Campo></div>
              <Campo rotulo="Fundo do painel do login"><select className="campo" value={f.login_fundo} onChange={set('login_fundo')}>
                <option value="fumaca">Fumaça animada</option><option value="cor">Cor sólida</option><option value="imagem">Imagem</option></select></Campo>
              {f.login_fundo === 'cor' && <Campo rotulo="Cor do fundo"><div className="flex gap-2"><input type="color" value={f.login_cor} onChange={set('login_cor')} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-card p-1" aria-label="Cor do fundo" /><input className="campo font-mono" value={f.login_cor} onChange={set('login_cor')} maxLength={7} /></div></Campo>}
              {f.login_fundo === 'imagem' && (
                <Campo rotulo="Imagem do fundo" ajuda="JPG, PNG ou WEBP até 1 MB. Foto do escritório funciona bem.">
                  <div className="flex items-center gap-3">
                    <span className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted">{f.login_imagem ? <img src={f.login_imagem} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-5 w-5 text-muted-foreground" />}</span>
                    <label className="cursor-pointer rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Escolher<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const a = e.target.files?.[0]; e.target.value = ''; if (!a) return; try { const url = await lerImagem(a, 1_000_000); setF((x) => ({ ...x, login_imagem: url })) } catch (err) { toast(err.message, 'erro') } }} /></label>
                    {f.login_imagem && <button onClick={() => setF((x) => ({ ...x, login_imagem: '' }))} className="rounded-md p-1.5 text-muted-foreground hover:text-red-600" aria-label="Remover"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </Campo>
              )}
              <Campo rotulo="Link da política de privacidade"><input className="campo" value={f.link_privacidade} onChange={set('link_privacidade')} placeholder="https://" /></Campo>
              <Campo rotulo="Link dos termos de uso"><input className="campo" value={f.link_termos} onChange={set('link_termos')} placeholder="https://" /></Campo>
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">Botões de download<Interruptor ligado={f.login_downloads} onChange={set('login_downloads')} rotulo="Downloads" /></label>
              <Campo rotulo="Layout do login"><select className="campo" value={f.login_layout} onChange={set('login_layout')}>
                <option value="dividido">Dividido (imagem ao lado)</option><option value="centralizado">Centralizado (só o formulário)</option></select></Campo>
              <Campo rotulo="Página inicial depois de entrar"><select className="campo" value={f.pagina_inicial} onChange={set('pagina_inicial')}>
                {ROTAS.map(([r, n]) => <option key={r} value={r}>{n}</option>)}<option value="/mapa">Mapa do escritório</option><option value="/seguranca">Segurança</option></select></Campo>
              <div className="md:col-span-2"><Campo rotulo="Aviso na tela de login" ajuda="Ex.: Sistema em atualização às 18h. Vazio = sem aviso."><input className="campo" value={f.login_aviso} onChange={set('login_aviso')} maxLength={200} /></Campo></div>
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm md:col-span-2">Mostrar o botão “Voltar ao site”<Interruptor ligado={f.mostrar_link_site} onChange={set('mostrar_link_site')} rotulo="Voltar ao site" /></label>
            </div>
          </Bloco>


          <Bloco titulo="Abertura e redes" descricao="Tela de abertura com o logo (uma vez por sessão) e links das redes no rodapé." palavras="splash abertura instagram linkedin youtube redes sociais">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm md:col-span-2">Tela de abertura ao entrar<Interruptor ligado={f.abertura} onChange={set('abertura')} rotulo="Tela de abertura" /></label>
              {f.abertura && <div className="md:col-span-2"><Campo rotulo="Frase da abertura" ajuda="Opcional. Aparece embaixo do nome."><input className="campo" value={f.abertura_texto} onChange={set('abertura_texto')} maxLength={120} /></Campo></div>}
              {[['rede_instagram', 'Instagram', 'https://instagram.com/suaempresa'], ['rede_linkedin', 'LinkedIn', 'https://linkedin.com/company/suaempresa'], ['rede_youtube', 'YouTube', 'https://youtube.com/@suaempresa']].map(([k, r, ph]) => (
                <Campo key={k} rotulo={r}><input className="campo" value={f[k]} onChange={set(k)} placeholder={ph} /></Campo>))}
            </div>
          </Bloco>

          <Bloco titulo="Marca d’água e aba" descricao="Texto discreto sobre todas as telas e o formato do título da aba do navegador." palavras="marca dagua confidencial titulo aba navegador">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Marca d’água" ajuda="Ex.: Confidencial, Uso interno. Vazio = sem marca d’água."><input className="campo" value={f.marca_dagua} onChange={set('marca_dagua')} maxLength={60} /></Campo>
              <Campo rotulo={`Intensidade · ${f.marca_dagua_opacidade}%`}><input type="range" min={2} max={20} value={f.marca_dagua_opacidade} onChange={set('marca_dagua_opacidade')} className="w-full accent-[hsl(var(--primary))]" /></Campo>
              <div className="md:col-span-2"><Campo rotulo="Título da aba" ajuda="Use {pagina}, {sistema} e {curto}. Ex.: {pagina} · {sistema}">
                <input className="campo font-mono" value={f.titulo_aba} onChange={set('titulo_aba')} maxLength={80} />
                <div className="mt-2 flex flex-wrap gap-1.5">{['{sistema}', '{pagina} · {sistema}', '{curto} | {pagina}', '{pagina}'].map((m) => <button key={m} type="button" onClick={() => set('titulo_aba')(m)} className="rounded border border-border px-2 py-0.5 font-mono text-[11px] hover:bg-muted">{m}</button>)}</div>
                <p className="mt-2 text-xs text-muted-foreground">Fica assim: <b>{(f.titulo_aba || '{sistema}').replace(/\{sistema\}/g, f.nome).replace(/\{curto\}/g, f.nome_curto).replace(/\{pagina\}/g, 'Configurações')}</b></p></Campo></div>
            </div>
          </Bloco>

          <Bloco titulo="Tema sazonal" descricao="Troca as cores sozinho durante um período e volta ao normal depois. As outras opções continuam as mesmas." palavras="natal outubro rosa novembro azul copa aniversario sazonal periodo">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm md:col-span-2 ${sazonalNoAr(f) ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                <span>Tema sazonal ligado<span className="block text-xs text-muted-foreground">{f.sazonal_ativo ? (sazonalNoAr(f) ? 'No ar agora.' : 'Fora do período: as cores normais continuam.') : 'Desligado.'}</span></span><Interruptor ligado={f.sazonal_ativo} onChange={set('sazonal_ativo')} rotulo="Tema sazonal" /></label>
              <div className="flex flex-wrap gap-2 md:col-span-2">{SAZONAIS.map(([n, a, b]) => <button key={n} type="button" onClick={() => setF((x) => ({ ...x, sazonal_nome: n, sazonal_cor: a, sazonal_destaque: b }))} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${f.sazonal_nome === n ? 'border-primary' : 'border-border hover:bg-muted'}`}><span className="flex"><span className="h-4 w-4 rounded-l" style={{ background: a }} /><span className="h-4 w-4 rounded-r" style={{ background: b }} /></span>{n}</button>)}</div>
              <Campo rotulo="Nome"><input className="campo" value={f.sazonal_nome} onChange={set('sazonal_nome')} maxLength={40} /></Campo>
              <div className="grid grid-cols-2 gap-2">{[['sazonal_cor', 'Principal'], ['sazonal_destaque', 'Destaque']].map(([k, r]) => <Campo key={k} rotulo={r}><input type="color" value={f[k]} onChange={set(k)} className="h-10 w-full cursor-pointer rounded-lg border border-border bg-card p-1" aria-label={r} /></Campo>)}</div>
              <Campo rotulo="Começa em"><input type="datetime-local" className="campo" value={f.sazonal_inicio} onChange={set('sazonal_inicio')} /></Campo>
              <Campo rotulo="Termina em"><input type="datetime-local" className="campo" value={f.sazonal_fim} onChange={set('sazonal_fim')} /></Campo>
            </div>
          </Bloco>

          <Bloco titulo="Cursor padrão" descricao="Efeito do mouse que todos recebem enquanto não escolherem o próprio em Configurações → Aparência." palavras="cursor mouse ponteiro efeito padrao empresa">
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">Definir um cursor padrão<Interruptor ligado={f.cursor_empresa} onChange={set('cursor_empresa')} rotulo="Cursor padrão" /></label>
              <div className={f.cursor_empresa ? 'grid gap-4 md:grid-cols-2' : 'pointer-events-none grid gap-4 opacity-50 md:grid-cols-2'}>
                <Campo rotulo="Estilo"><select className="campo" value={f.cursor_empresa_estilo} onChange={set('cursor_empresa_estilo')}>{[['anel_ponto', 'Anel com ponto'], ['anel', 'Só o anel'], ['ponto', 'Só o ponto'], ['mira', 'Mira'], ['quadrado', 'Quadrado'], ['bolha', 'Bolha de luz'], ['sem_ponteiro', 'Sem ponteiro'], ['nenhum', 'Nenhum (só efeitos)']].map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></Campo>
                <Campo rotulo="Modelo do ponteiro"><select className="campo" value={f.cursor_empresa_modelo} onChange={set('cursor_empresa_modelo')}><option value="sistema">Do sistema</option>{Object.entries(MODELOS).map(([k, m]) => <option key={k} value={k}>{m.nome}</option>)}</select></Campo>
                <div className="flex flex-wrap gap-2 md:col-span-2">{EFEITOS_CURSOR.map(([k, r]) => { const on = (f.cursor_empresa_efeitos || []).includes(k); return <button key={k} type="button" onClick={() => setF((x) => ({ ...x, cursor_empresa_efeitos: on ? x.cursor_empresa_efeitos.filter((e) => e !== k) : [...(x.cursor_empresa_efeitos || []), k] }))} className={`rounded-lg border px-3 py-1.5 text-xs ${on ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-border hover:bg-muted'}`}>{r}</button> })}</div>
              </div>
            </div>
          </Bloco>

          <Bloco titulo="Comunicação" descricao="Avisos e contatos exibidos dentro do sistema.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm md:col-span-2">Banner de aviso no topo<Interruptor ligado={f.banner_ativo} onChange={set('banner_ativo')} rotulo="Banner" /></label>
              <div className="md:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <Campo rotulo="Texto do banner"><input className="campo" value={f.banner_texto} onChange={set('banner_texto')} maxLength={200} placeholder="Manutenção do ar da sala na sexta às 14h" /></Campo>
                <Campo rotulo="Cor"><select className="campo" value={f.banner_cor} onChange={set('banner_cor')}><option value="info">Informação</option><option value="alerta">Alerta</option><option value="sucesso">Sucesso</option><option value="marca">Marca</option></select></Campo>
              </div>
              <Campo rotulo="Mostrar a partir de" ajuda="Vazio = já."><input type="datetime-local" className="campo" value={f.banner_inicio} onChange={set('banner_inicio')} /></Campo>
              <Campo rotulo="Esconder depois de" ajuda="Vazio = até desligar."><input type="datetime-local" className="campo" value={f.banner_fim} onChange={set('banner_fim')} /></Campo>
              <Campo rotulo="Selo de ambiente no cabeçalho" ajuda="Ex.: Homologação, Treinamento. Vazio = sem selo."><input className="campo" value={f.selo_ambiente} onChange={set('selo_ambiente')} maxLength={24} /></Campo>
              <label className="flex items-center justify-between self-end rounded-lg border border-border px-3 py-2.5 text-sm">Botão de ajuda no cabeçalho<Interruptor ligado={f.mostrar_ajuda} onChange={set('mostrar_ajuda')} rotulo="Ajuda" /></label>
              <div className="md:col-span-2"><Campo rotulo="Boas-vindas no painel"><input className="campo" value={f.boas_vindas} onChange={set('boas_vindas')} maxLength={200} /></Campo></div>
              <div className="md:col-span-2"><Campo rotulo="Rodapé do sistema"><input className="campo" value={f.rodape} onChange={set('rodape')} maxLength={200} placeholder={`© ${new Date().getFullYear()} ${f.nome}`} /></Campo></div>
              <Campo rotulo="E-mail de suporte"><input type="email" className="campo" value={f.suporte_email} onChange={set('suporte_email')} /></Campo>
              <Campo rotulo="Telefone"><input className="campo" value={f.suporte_telefone} onChange={set('suporte_telefone')} /></Campo>
              <Campo rotulo="WhatsApp"><input className="campo" value={f.suporte_whatsapp} onChange={set('suporte_whatsapp')} /></Campo>
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">Mostrar créditos<Interruptor ligado={f.mostrar_creditos} onChange={set('mostrar_creditos')} rotulo="Créditos" /></label>
            </div>
          </Bloco>

          <Bloco titulo="Modo manutenção" descricao="Enquanto estiver ligado, só dono e administradores usam o sistema; os demais veem uma tela de aviso. Vale também para a API.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm md:col-span-2 ${f.manutencao ? 'border-amber-500/50 bg-amber-500/10' : 'border-border'}`}>
                <span className="flex items-center gap-2"><Wrench className="h-4 w-4" />Sistema em manutenção</span><Interruptor ligado={f.manutencao} onChange={set('manutencao')} rotulo="Manutenção" /></label>
              <div className="md:col-span-2"><Campo rotulo="Mensagem para quem tentar entrar"><input className="campo" value={f.manutencao_mensagem} onChange={set('manutencao_mensagem')} maxLength={200} placeholder="Estamos trocando os transmissores das salas. Voltamos logo." /></Campo></div>
              <Campo rotulo="Previsão de volta" ajuda="Opcional. Aparece na tela de aviso."><input type="datetime-local" className="campo" value={f.manutencao_previsao} onChange={set('manutencao_previsao')} /></Campo>
            </div>
          </Bloco>

          <Bloco titulo="Relatórios exportados" descricao="Como a marca aparece no PDF, Word e HTML gerados em Relatórios.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">Logo na capa<Interruptor ligado={f.relatorio_logo} onChange={set('relatorio_logo')} rotulo="Logo nos relatórios" /></label>
              <p className="self-center text-xs text-muted-foreground">{f.logo ? (/svg/.test(f.logo.slice(0, 30)) ? 'Logo em SVG não entra no PDF: envie PNG ou JPG.' : 'Usa o logo enviado em Identidade.') : 'Envie um logo em Identidade.'}</p>
              <div className="md:col-span-2"><Campo rotulo="Rodapé dos relatórios" ajuda="Ex.: razão social e CNPJ. Vazio = data de geração."><input className="campo" value={f.relatorio_rodape} onChange={set('relatorio_rodape')} maxLength={200} /></Campo></div>
              <div className="md:col-span-2"><Campo rotulo="Órgão no cabeçalho oficial" ajuda="3ª linha embaixo de “Prefeitura Municipal de Florianópolis” no modelo Prefeitura (ex.: o nome da secretaria). Vazio = só as duas linhas."><input className="campo" value={f.relatorio_orgao || ''} onChange={set('relatorio_orgao')} maxLength={120} /></Campo></div>
            </div>
          </Bloco>

          <Bloco titulo="Menu lateral" descricao="Renomeie ou esconda itens. Configurações e o Painel sempre ficam visíveis.">
            <div className="divide-y divide-border">
              {ROTAS.map(([rota, padraoNome]) => (
                <div key={rota} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2 sm:grid-cols-[160px_1fr_auto]">
                  <span className="hidden text-sm text-muted-foreground sm:block">{padraoNome}</span>
                  <input className="campo h-9" placeholder={padraoNome} value={f.menu_rotulos[rota] || ''} maxLength={40}
                    onChange={(e) => setF((x) => ({ ...x, menu_rotulos: { ...x.menu_rotulos, [rota]: e.target.value } }))} aria-label={`Rótulo de ${padraoNome}`} />
                  {rota === '/' ? <span className="w-11" /> : <Interruptor ligado={!f.menu_ocultos.includes(rota)} rotulo={`Mostrar ${padraoNome}`}
                    onChange={(v) => setF((x) => ({ ...x, menu_ocultos: v ? x.menu_ocultos.filter((r) => r !== rota) : [...x.menu_ocultos, rota] }))} />}
                </div>
              ))}
            </div>
          </Bloco>

          <Bloco titulo="Regional e avançado">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Temperatura"><select className="campo" value={f.unidade_temperatura} onChange={set('unidade_temperatura')}><option value="C">Celsius (°C)</option><option value="F">Fahrenheit (°F)</option></select></Campo>
              <Campo rotulo="Hora"><select className="campo" value={f.formato_hora} onChange={set('formato_hora')}><option value="24h">24 horas</option><option value="12h">12 horas (AM/PM)</option></select></Campo>
              <div className="md:col-span-2"><Campo rotulo="Descrição para buscadores e compartilhamento"><input className="campo" value={f.meta_descricao} onChange={set('meta_descricao')} maxLength={200} /></Campo></div>
              <div className="md:col-span-2"><Campo rotulo="CSS personalizado" ajuda="Sem @import, url() ou expression (bloqueados por segurança). Ex.: .cartao { border-width: 2px }">
                <textarea className="campo h-32 py-2 font-mono text-xs" value={f.css} onChange={set('css')} spellCheck={false} /></Campo></div>
            </div>
          </Bloco>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 rolagem-fina">
          <div className="cartao overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2"><p className="text-xs font-medium text-muted-foreground">Pré-visualização</p>
              <div className="flex rounded-md border border-border p-0.5">{[['computador', Laptop], ['celular', Smartphone]].map(([k, I]) => <button key={k} onClick={() => setAparelho(k)} aria-label={k} className={`rounded p-1 ${aparelho === k ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}><I className="h-3.5 w-3.5" /></button>)}</div></div>
            <motion.div layout className={`mx-auto space-y-4 p-4 ${aparelho === 'celular' ? 'my-3 max-w-[230px] rounded-[26px] border-[6px] border-foreground/80 bg-background' : ''}`}>
              {f.manutencao && <p className="flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300"><Wrench className="h-3 w-3" />Manutenção ligada</p>}
              <div className="flex items-center gap-2.5">
                {f.logo ? <img src={f.logo} alt="" className="h-8 w-8 rounded-lg object-contain" /> : <span className="h-8 w-8 rounded-lg bg-primary" />}
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{f.nome}</p><p className="truncate text-[11px] text-muted-foreground">{f.slogan}</p></div>
              </div>
              <div className="cartao p-3">
                <p className="text-xs text-muted-foreground">Ligados agora</p>
                <p className="mt-1 text-2xl font-semibold tabular">2 <span className="text-sm text-muted-foreground">de 4</span></p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-primary" animate={{ width: '50%' }} /></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao tamanho="sm">Botão principal</Botao><Botao tamanho="sm" variante="secundario">Secundário</Botao>
              </div>
              <div className="flex gap-2 text-xs"><span className="rounded px-1.5 py-0.5 text-white" style={{ background: f.cor_destaque }}>Destaque</span><span className="rounded px-1.5 py-0.5 text-white" style={{ background: f.cor_alerta }}>Alerta</span></div>
              <AnimatePresence>{f.banner_ativo && f.banner_texto && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-md bg-sky-600 px-2 py-1.5 text-center text-xs text-white">{f.banner_texto}</motion.p>}</AnimatePresence>
            </motion.div>
          </div>
          <div className="cartao p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recursos de white label</p>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 xl:grid-cols-1">{RECURSOS.map((r) => <li key={r} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-primary" />{r}</li>)}</ul>
          </div>
          <Botao variante="secundario" icone={RotateCcw} className="w-full" onClick={padrao}>Restaurar marca padrão</Botao>
          {mudou && <Aviso tipo="alerta">Há alterações não salvas.</Aviso>}
        </aside>
      </div>
      </BuscaCtx.Provider>
      <MarcaExtras f={f} />

      <Modal aberto={!!historico} titulo="Versões anteriores" onFechar={() => setHistorico(null)}>
        {historico?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão salva ainda.</p>}
        <div className="divide-y divide-border">
          {historico?.map((h) => (
            <div key={h.indice} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: h.cor }} />{h.nome} · {dataHora(h.em)}</span>
              <span className="flex gap-1.5"><Botao tamanho="sm" variante="secundario" icone={GitCompare} onClick={() => compararVersao(h.indice)}>Comparar</Botao><Botao tamanho="sm" variante="secundario" onClick={() => restaurar(h.indice)}>Restaurar</Botao></span>
            </div>
          ))}
        </div>
      </Modal>
      <Modal aberto={!!comparar} titulo="Comparar com a versão salva agora" onFechar={() => setComparar(null)}>
        {comparar && (comparar.difs.length === 0 ? <p className="text-sm text-muted-foreground">Esta versão é igual à atual (sem contar imagens).</p> : (
          <div className="max-h-[60vh] overflow-auto">
            <p className="mb-2 text-xs text-muted-foreground">Versão de {dataHora(comparar.em)} · {comparar.difs.length} diferença(s)</p>
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th className="py-1.5 pr-2 font-medium">Campo</th><th className="py-1.5 pr-2 font-medium">Antes</th><th className="py-1.5 font-medium">Agora</th></tr></thead>
              <tbody className="divide-y divide-border">{comparar.difs.map(([k, a, b]) => {
                const fmt = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded" style={{ background: v }} />{v}</span> : typeof v === 'boolean' ? (v ? 'sim' : 'não') : (JSON.stringify(v) || '').replace(/^"|"$/g, '').slice(0, 60) || '—')
                return <tr key={k}><td className="py-1.5 pr-2 font-medium">{NOMES_CAMPOS[k] || k.replace(/_/g, ' ')}</td><td className="py-1.5 pr-2 text-muted-foreground">{fmt(a)}</td><td className="py-1.5">{fmt(b)}</td></tr>
              })}</tbody></table>
            <Botao className="mt-3" tamanho="sm" variante="secundario" onClick={() => { restaurar(comparar.indice); setComparar(null) }}>Restaurar esta versão</Botao>
          </div>))}
      </Modal>
    </div>
  )
}
