import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, History, ImagePlus, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import { api, dataHora } from '../../api'
import { MARCA_PADRAO, aplicarMarca, useMarca } from '../../marca'
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
  'Domínio próprio', 'Créditos', 'CSS personalizado', 'Exportar e importar', 'Histórico de versões', 'Pré-visualização ao vivo', 'Restaurar padrão']

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
    if (arquivo.size > max) return erro(new Error('Imagem grande demais (máximo de 300 KB).'))
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
          <Bloco titulo="Identidade" descricao="Nome, textos e imagens que identificam o sistema.">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Nome do sistema"><input className="campo" value={f.nome} onChange={set('nome')} maxLength={60} /></Campo>
              <Campo rotulo="Nome curto" ajuda="Aparece no app instalado e em espaços pequenos."><input className="campo" value={f.nome_curto} onChange={set('nome_curto')} maxLength={20} /></Campo>
              <div className="md:col-span-2"><Campo rotulo="Slogan"><input className="campo" value={f.slogan} onChange={set('slogan')} maxLength={160} /></Campo></div>
              <div className="md:col-span-2"><Campo rotulo="Descrição"><input className="campo" value={f.descricao} onChange={set('descricao')} maxLength={200} /></Campo></div>
              {[['logo', 'Logo'], ['favicon', 'Ícone da aba (favicon)']].map(([k, r]) => (
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
            <div className="grid gap-4 sm:grid-cols-3">
              {[['cor_primaria', 'Principal'], ['cor_destaque', 'Destaque (gráficos)'], ['cor_alerta', 'Alerta']].map(([k, r]) => (
                <Campo key={k} rotulo={r}>
                  <div className="flex gap-2"><input type="color" value={f[k]} onChange={set(k)} className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-card p-1" aria-label={r} />
                    <input className="campo font-mono" value={f[k]} onChange={set(k)} maxLength={7} /></div>
                </Campo>
              ))}
            </div>
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
            </div>
          </Bloco>

          <Bloco titulo="Tela de login">
            <div className="grid gap-4 md:grid-cols-2">
              <Campo rotulo="Título"><input className="campo" value={f.login_titulo} onChange={set('login_titulo')} maxLength={60} /></Campo>
              <Campo rotulo="Subtítulo"><input className="campo" value={f.login_subtitulo} onChange={set('login_subtitulo')} maxLength={160} /></Campo>
              <div className="md:col-span-2"><Campo rotulo="Texto do rodapé"><input className="campo" value={f.login_rodape} onChange={set('login_rodape')} maxLength={160} /></Campo></div>
              <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm">Fumaça animada<Interruptor ligado={f.login_fumaca} onChange={set('login_fumaca')} rotulo="Fumaça animada" /></label>
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
