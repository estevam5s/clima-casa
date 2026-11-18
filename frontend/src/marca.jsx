import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { marcaAtual } from './marcaAtual'
import { definirNomeAba } from './favicon'
import { useTema } from './tema'
import { definirPadraoEmpresa } from './preferencias'

export const MARCA_PADRAO = {
  nome: 'Clima Escritório', nome_curto: 'Clima', slogan: 'O ar do escritório no ponto certo, antes de você chegar.',
  descricao: 'Ar-condicionados por infravermelho, com Alexa, agenda e automações.', logo: '', favicon: '',
  cor_primaria: '#0f766a', cor_destaque: '#2563a8', cor_alerta: '#dc2626', tema_padrao: 'sistema', fonte: 'sistema',
  escala: 100, raio: 12, densidade: 'confortavel', login_titulo: 'Entrar', login_subtitulo: 'Acesso do administrador do escritório.',
  login_fumaca: true, login_downloads: true, login_rodape: 'Sem cadastro: o acesso é só do administrador.', rodape: '',
  suporte_email: '', suporte_telefone: '', suporte_whatsapp: '', site: '', banner_ativo: false, banner_texto: '', banner_cor: 'info',
  boas_vindas: '', menu_rotulos: {}, menu_ocultos: [], css: '', meta_descricao: '', dominio: '', mostrar_creditos: true,
  unidade_temperatura: 'C', formato_hora: '24h',
  logo_escuro: '', menu_estilo: 'padrao', login_fundo: 'fumaca', login_imagem: '', login_cor: '#0f172a', animacoes: 'completas',
  selo_ambiente: '', mostrar_ajuda: true, link_privacidade: 'https://zynio.com.br/privacidade', link_termos: 'https://zynio.com.br/termos',
  banner_inicio: '', banner_fim: '',
  tom_neutro: 'zinco', estilo_botao: 'solido', estilo_cartao: 'borda', largura: 'padrao', icone_espessura: 20,
  login_layout: 'dividido', login_aviso: '', pagina_inicial: '/', mostrar_link_site: true,
  manutencao: false, manutencao_mensagem: '', manutencao_previsao: '', relatorio_logo: true, relatorio_rodape: '', relatorio_orgao: '',
  cor_sucesso: '#16a34a', cor_aviso: '#d97706', fonte_titulos: 'mesma', peso_titulos: 600, espaco_letras: 0,
  sombra: 'suave', borda_espessura: 1, fundo_app: 'liso', cabecalho_estilo: 'vidro', menu_largura: 264,
  alto_contraste: false, foco_reforcado: false, sublinhar_links: false, reduzir_transparencia: false,
  marca_dagua: '', marca_dagua_opacidade: 6, titulo_aba: '{sistema}',
  sazonal_ativo: false, sazonal_nome: '', sazonal_cor: '#b91c1c', sazonal_destaque: '#15803d', sazonal_inicio: '', sazonal_fim: '',
  cursor_empresa: false, cursor_empresa_estilo: 'anel_ponto', cursor_empresa_modelo: 'sistema', cursor_empresa_efeitos: [],
  rede_instagram: '', rede_linkedin: '', rede_youtube: '', abertura: false, abertura_texto: '',
}

// tema sazonal (Natal, aniversário da empresa…): troca as cores só dentro do período
export function sazonalNoAr(m, agora = new Date()) {
  if (!m.sazonal_ativo) return false
  if (m.sazonal_inicio && agora < new Date(m.sazonal_inicio)) return false
  if (m.sazonal_fim && agora > new Date(m.sazonal_fim)) return false
  return true
}

// escala de tons 50…950 a partir de uma cor (para CSS personalizado e para o kit da marca)
export function escalaDeTons(hex) {
  const [h, s] = hexParaHsl(hex)
  const luz = { 50: 97, 100: 94, 200: 86, 300: 76, 400: 62, 500: 50, 600: 42, 700: 34, 800: 27, 900: 21, 950: 13 }
  return Object.entries(luz).map(([k, l]) => [k, `hsl(${h} ${Math.min(95, s)}% ${l}%)`, h, Math.min(95, s), l])
}

// logo certo para o tema (o escuro cai no normal quando não foi enviado)
export const logoDaMarca = (m, escuro) => (escuro && m.logo_escuro) || m.logo

// banner com período: vale só entre início e fim, quando definidos
export function bannerNoAr(m, agora = new Date()) {
  if (!m.banner_ativo || !m.banner_texto) return false
  if (m.banner_inicio && agora < new Date(m.banner_inicio)) return false
  if (m.banner_fim && agora > new Date(m.banner_fim)) return false
  return true
}

// contraste WCAG entre duas cores #RRGGBB
export function contraste(a, b) {
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const FONTES = {
  sistema: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  arredondada: 'ui-rounded, "SF Pro Rounded", "Nunito", -apple-system, sans-serif',
  serifada: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  condensada: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif',
  inter: '"Inter Variable", -apple-system, sans-serif', manrope: '"Manrope Variable", -apple-system, sans-serif',
  dm_sans: '"DM Sans Variable", -apple-system, sans-serif', nunito: '"Nunito Variable", -apple-system, sans-serif',
  outfit: '"Outfit Variable", -apple-system, sans-serif', plex: '"IBM Plex Sans Variable", -apple-system, sans-serif',
}
// fontes hospedadas no próprio sistema (sem Google Fonts: nada de IP do usuário indo para terceiros); baixa só a escolhida
const CARREGAR_FONTE = {
  inter: () => import('@fontsource-variable/inter'), manrope: () => import('@fontsource-variable/manrope'),
  dm_sans: () => import('@fontsource-variable/dm-sans'), nunito: () => import('@fontsource-variable/nunito'),
  outfit: () => import('@fontsource-variable/outfit'), plex: () => import('@fontsource-variable/ibm-plex-sans'),
}
export const NOMES_FONTES = [['sistema', 'Sistema (padrão)'], ['inter', 'Inter'], ['manrope', 'Manrope'], ['dm_sans', 'DM Sans'], ['outfit', 'Outfit'],
  ['plex', 'IBM Plex Sans'], ['nunito', 'Nunito'], ['arredondada', 'Arredondada do sistema'], ['serifada', 'Serifada'], ['condensada', 'Condensada'], ['mono', 'Monoespaçada']]
const DENSIDADE = { compacta: 0.94, confortavel: 1, espacosa: 1.05 }

export function hexParaHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)]
}

// Aplica a marca no documento (também usada pela pré-visualização ao vivo).
export function aplicarMarca(marcaBase) {
  const raiz = document.documentElement
  const m = sazonalNoAr(marcaBase) ? { ...marcaBase, cor_primaria: marcaBase.sazonal_cor, cor_destaque: marcaBase.sazonal_destaque } : marcaBase
  const [h, s, l] = hexParaHsl(m.cor_primaria || '#0f766a')
  let estilo = document.getElementById('marca-vars')
  if (!estilo) { estilo = document.createElement('style'); estilo.id = 'marca-vars'; document.head.appendChild(estilo) }
  // contraste garantido: no claro a cor fica entre 22% e 42% de luminosidade; no escuro, entre 38% e 55%
  const claro = Math.min(42, Math.max(22, l)), escuro = Math.min(55, Math.max(38, l + 12))
  const tons = escalaDeTons(m.cor_primaria || '#0f766a').map(([k, , hh, ss, ll]) => `--marca-${k}:${hh} ${ss}% ${ll}%`).join(';')
  const fonteTitulos = m.fonte_titulos && m.fonte_titulos !== 'mesma' ? (FONTES[m.fonte_titulos] || FONTES.sistema) : 'var(--fonte)'
  estilo.textContent = `:root{--primary:${h} ${s}% ${claro}%;--destaque:${m.cor_destaque};--alerta:${m.cor_alerta};--sucesso:${m.cor_sucesso || '#16a34a'};--aviso:${m.cor_aviso || '#d97706'};--raio:${m.raio}px;--fonte:${FONTES[m.fonte] || FONTES.sistema};--fonte-titulos:${fonteTitulos};--peso-titulos:${m.peso_titulos || 600};--espaco-letras:${(m.espaco_letras || 0) / 100}em;--borda:${m.borda_espessura ?? 1}px;--dagua-opacidade:${(m.marca_dagua_opacidade || 6) / 100};${tons}}
:root.dark{--primary:${h} ${Math.min(s, 80)}% ${escuro}%}`
  raiz.style.fontSize = `${(m.escala / 100) * (DENSIDADE[m.densidade] || 1) * 100}%`
  raiz.dataset.densidade = m.densidade
  raiz.dataset.menu = m.menu_estilo || 'padrao'
  raiz.dataset.animacoes = m.animacoes || 'completas'
  raiz.dataset.tom = m.tom_neutro || 'zinco'
  raiz.dataset.estiloBotao = m.estilo_botao || 'solido'
  raiz.dataset.cartao = m.estilo_cartao || 'borda'
  raiz.dataset.largura = m.largura || 'padrao'
  raiz.style.setProperty('--icone', String((m.icone_espessura || 20) / 10))
  raiz.dataset.sombra = m.sombra || 'suave'
  raiz.dataset.fundo = m.fundo_app || 'liso'
  raiz.dataset.cabecalho = m.cabecalho_estilo || 'vidro'
  raiz.dataset.titulos = m.fonte_titulos && m.fonte_titulos !== 'mesma' ? 'proprio' : 'mesma'
  for (const [k, attr] of [['alto_contraste', 'altoContraste'], ['foco_reforcado', 'focoReforcado'], ['sublinhar_links', 'sublinharLinks'], ['reduzir_transparencia', 'semTransparencia']]) {
    if (m[k]) raiz.dataset[attr] = '1'; else delete raiz.dataset[attr]
  }
  CARREGAR_FONTE[m.fonte]?.().catch(() => {})
  if (m.fonte_titulos && m.fonte_titulos !== m.fonte) CARREGAR_FONTE[m.fonte_titulos]?.().catch(() => {})
  // barra do navegador no celular na cor da marca
  let tc = document.querySelector('meta[name="theme-color"]')
  if (!tc) { tc = document.createElement('meta'); tc.name = 'theme-color'; document.head.appendChild(tc) }
  tc.setAttribute('content', m.cor_primaria || '#0f766a')
  let css = document.getElementById('marca-css')
  if (!css) { css = document.createElement('style'); css.id = 'marca-css'; document.head.appendChild(css) }
  css.textContent = m.css || ''
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.meta_descricao || m.descricao)
  Object.assign(marcaAtual, { unidade: m.unidade_temperatura, hora12: m.formato_hora === '12h', nome: m.nome, favicon: m.favicon || m.logo })
  definirNomeAba(m.nome, m.favicon || m.logo, m.titulo_aba, m.nome_curto)
  definirPadraoEmpresa(m.cursor_empresa ? { cursor: true, cursor_estilo: m.cursor_empresa_estilo, cursor_modelo: m.cursor_empresa_modelo, cursor_efeitos: m.cursor_empresa_efeitos || [] } : {})
}

const Ctx = createContext({ marca: MARCA_PADRAO, recarregar: () => {}, setMarcaLocal: () => {} })

export function MarcaProvider({ children }) {
  const [marca, setMarca] = useState(() => {
    try { return { ...MARCA_PADRAO, ...JSON.parse(localStorage.getItem('clima-marca') || '{}') } } catch { return MARCA_PADRAO }
  })
  const { definirPadrao } = useTema()
  const recarregar = useCallback(async () => {
    try {
      const r = await fetch('/api/marca')
      if (!r.ok) return
      const m = { ...MARCA_PADRAO, ...(await r.json()) }
      setMarca(m)
      try { localStorage.setItem('clima-marca', JSON.stringify({ ...m, logo: m.logo.length < 60000 ? m.logo : '', favicon: '' })) } catch { /* cota */ }
    } catch { /* offline: usa a cópia local */ }
  }, [])
  useEffect(() => { recarregar() }, [recarregar])
  useEffect(() => { aplicarMarca(marca); definirPadrao?.(marca.tema_padrao) }, [marca, definirPadrao])
  return <Ctx.Provider value={{ marca, recarregar, setMarcaLocal: setMarca }}>{children}</Ctx.Provider>
}

export const useMarca = () => useContext(Ctx)
