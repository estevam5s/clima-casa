import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Download, History, ImagePlus, Palette, Pipette, RotateCcw, Save, Trash2, Upload, XCircle } from 'lucide-react'
import { api, dataHora } from '../../api'
import { MARCA_PADRAO, aplicarMarca, contraste, useMarca } from '../../marca'
import { Aviso, Botao, Interruptor, Modal, useToast } from '../ui'

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
  'Banner com data de início e fim', 'Cor da barra do navegador no celular']

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

function Bloco({ titulo, descricao, children }) {
  return (
    <section className="cartao p-5">
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

export default function WhiteLabel() {
  const { marca, setMarcaLocal } = useMarca()
  const [f, setF] = useState(marca)
  const [salvando, setSalvando] = useState(false)
  const [historico, setHistorico] = useState(null)
  const original = useRef(marca)
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
          <Botao variante="secundario" tamanho="sm" icone={History} onClick={abrirHistorico}>Versões</Botao>
          <Botao variante="secundario" tamanho="sm" icone={Download} onClick={exportar}>Exportar</Botao>
          <Botao variante="secundario" tamanho="sm" icone={Upload} onClick={() => importar.current?.click()}>Importar</Botao>
          <input ref={importar} type="file" accept="application/json" className="hidden" onChange={carregarJson} />
          <Botao variante="secundario" tamanho="sm" icone={RotateCcw} disabled={!mudou} onClick={() => setF(original.current)}>Descartar</Botao>
          <Botao tamanho="sm" icone={Save} carregando={salvando} disabled={!mudou} onClick={salvar}>Salvar</Botao>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Bloco titulo="Temas prontos" descricao="Aplica cores, fonte, cantos, densidade, menu e tema de uma vez. Ajuste o que quiser depois.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TEMAS_PRONTOS.map((t) => {
                const ativo = f.cor_primaria === t.cor_primaria && f.fonte === t.fonte && f.menu_estilo === t.menu_estilo
                return (
                  <button key={t.nome} onClick={() => { const { nome, ...resto } = t; setF((x) => ({ ...x, ...resto })) }}
                    className={`overflow-hidden rounded-lg border text-left transition-colors ${ativo ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-muted'}`}>
                    <div className="flex h-12" style={{ borderRadius: 0 }}>
                      <span className="w-1/4" style={{ background: t.menu_estilo === 'escuro' ? '#18181b' : t.menu_estilo === 'marca' ? t.cor_primaria : '#f4f4f5' }} />
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
                {[['sistema', 'Sistema (padrão)'], ['arredondada', 'Arredondada'], ['serifada', 'Serifada'], ['condensada', 'Condensada'], ['mono', 'Monoespaçada']].map(([k, r]) => <option key={k} value={k}>{r}</option>)}
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
            </div>
          </Bloco>

          <Bloco titulo="Comunicação" descricao="Avisos e contatos exibidos dentro do sistema.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm md:col-span-2">Banner de aviso no topo<Interruptor ligado={f.banner_ativo} onChange={set('banner_ativo')} rotulo="Banner" /></label>
              <div className="md:col-span-2 grid gap-4 sm:grid-cols-[1fr_160px]">
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

        <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <div className="cartao overflow-hidden">
            <p className="border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground">Pré-visualização</p>
            <div className="space-y-4 p-4">
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
            </div>
          </div>
          <div className="cartao p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Recursos de white label</p>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 xl:grid-cols-1">{RECURSOS.map((r) => <li key={r} className="flex items-center gap-1.5"><span className="h-1 w-1 rounded-full bg-primary" />{r}</li>)}</ul>
          </div>
          <Botao variante="secundario" icone={RotateCcw} className="w-full" onClick={padrao}>Restaurar marca padrão</Botao>
          {mudou && <Aviso tipo="alerta">Há alterações não salvas.</Aviso>}
        </aside>
      </div>

      <Modal aberto={!!historico} titulo="Versões anteriores" onFechar={() => setHistorico(null)}>
        {historico?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão salva ainda.</p>}
        <div className="divide-y divide-border">
          {historico?.map((h) => (
            <div key={h.indice} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: h.cor }} />{h.nome} · {dataHora(h.em)}</span>
              <Botao tamanho="sm" variante="secundario" onClick={() => restaurar(h.indice)}>Restaurar</Botao>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
