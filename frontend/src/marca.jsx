import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { marcaAtual } from './marcaAtual'
import { definirNomeAba } from './favicon'
import { useTema } from './tema'

export const MARCA_PADRAO = {
  nome: 'Clima Escritório', nome_curto: 'Clima', slogan: 'O ar do escritório no ponto certo, antes de você chegar.',
  descricao: 'Ar-condicionados por infravermelho, com Alexa, agenda e automações.', logo: '', favicon: '',
  cor_primaria: '#0f766a', cor_destaque: '#2563a8', cor_alerta: '#dc2626', tema_padrao: 'sistema', fonte: 'sistema',
  escala: 100, raio: 12, densidade: 'confortavel', login_titulo: 'Entrar', login_subtitulo: 'Acesso do administrador do escritório.',
  login_fumaca: true, login_downloads: true, login_rodape: 'Sem cadastro: o acesso é só do administrador.', rodape: '',
  suporte_email: '', suporte_telefone: '', suporte_whatsapp: '', site: '', banner_ativo: false, banner_texto: '', banner_cor: 'info',
  boas_vindas: '', menu_rotulos: {}, menu_ocultos: [], css: '', meta_descricao: '', dominio: '', mostrar_creditos: true,
  unidade_temperatura: 'C', formato_hora: '24h',
}
const FONTES = {
  sistema: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  arredondada: 'ui-rounded, "SF Pro Rounded", "Nunito", -apple-system, sans-serif',
  serifada: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  condensada: '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", sans-serif',
}
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
export function aplicarMarca(m) {
  const raiz = document.documentElement
  const [h, s, l] = hexParaHsl(m.cor_primaria || '#0f766a')
  let estilo = document.getElementById('marca-vars')
  if (!estilo) { estilo = document.createElement('style'); estilo.id = 'marca-vars'; document.head.appendChild(estilo) }
  // contraste garantido: no claro a cor fica entre 22% e 42% de luminosidade; no escuro, entre 38% e 55%
  const claro = Math.min(42, Math.max(22, l)), escuro = Math.min(55, Math.max(38, l + 12))
  estilo.textContent = `:root{--primary:${h} ${s}% ${claro}%;--destaque:${m.cor_destaque};--alerta:${m.cor_alerta};--raio:${m.raio}px;--fonte:${FONTES[m.fonte] || FONTES.sistema}}
:root.dark{--primary:${h} ${Math.min(s, 80)}% ${escuro}%}`
  raiz.style.fontSize = `${(m.escala / 100) * (DENSIDADE[m.densidade] || 1) * 100}%`
  raiz.dataset.densidade = m.densidade
  let css = document.getElementById('marca-css')
  if (!css) { css = document.createElement('style'); css.id = 'marca-css'; document.head.appendChild(css) }
  css.textContent = m.css || ''
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.meta_descricao || m.descricao)
  Object.assign(marcaAtual, { unidade: m.unidade_temperatura, hora12: m.formato_hora === '12h', nome: m.nome, favicon: m.favicon || m.logo })
  definirNomeAba(m.nome, m.favicon || m.logo)
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
