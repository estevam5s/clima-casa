'use client'
import { consentiu } from '@/lib/consentimento'
import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import Botao from './Botao'
import { ENTRAR_URL } from '@/lib/dados'

/*
  O site e o sistema ficam em domínios diferentes, então o site não enxerga a sessão do sistema
  (e navegadores como Brave e Safari bloqueiam cookies entre sites). Por isso o próprio sistema avisa:
  - "Voltar ao site" de dentro do sistema (logado) abre o site com ?sessao=1
  - "Voltar ao site" da tela de login, ou depois de sair, abre com ?sessao=0
  O site guarda o aviso neste navegador por 30 dias e tira o parâmetro da barra de endereço.
  Sem aviso, o botão mostra "LOGIN".
*/
const CHAVE = 'clima-sessao-sistema'
const VALIDADE = 30 * 24 * 3600 * 1000

function lerSessao() {
  try {
    const url = new URL(window.location.href)
    const p = url.searchParams.get('sessao')
    if (p === '1' || p === '0') {
      // lembrar entre visitas é cookie de preferência: só com consentimento
      if (p === '1' && consentiu('preferencias')) localStorage.setItem(CHAVE, String(Date.now() + VALIDADE))
      else localStorage.removeItem(CHAVE)
      url.searchParams.delete('sessao')
      window.history.replaceState(window.history.state, '', url.pathname + (url.search ? url.search : '') + url.hash)
    }
    if (p === '1') return true
    return Number(localStorage.getItem(CHAVE) || 0) > Date.now()
  } catch { return false }
}

export function useSessaoSistema() {
  const [logado, setLogado] = useState(false)
  useEffect(() => {
    setLogado(lerSessao())
    const mudou = (e) => { if (e.key === CHAVE) setLogado(lerSessao()) }
    window.addEventListener('storage', mudou)
    return () => window.removeEventListener('storage', mudou)
  }, [])
  return logado
}

// Botão principal do cabeçalho e do menu do celular.
export function BotaoEntrar(props) {
  const logado = useSessaoSistema()
  return <Botao href={ENTRAR_URL} externo {...props}>{logado ? 'ENTRAR NO SISTEMA' : 'LOGIN'}</Botao>
}

// Texto de link simples (rodapé e páginas).
export function TextoEntrar({ logado: textoLogado = 'Entrar no sistema', deslogado = 'Fazer login' }) {
  const logado = useSessaoSistema()
  return <a href={ENTRAR_URL}>{logado ? textoLogado : deslogado}</a>
}

// Botão "voltar ao topo" flutuante: aparece depois de rolar, com anel de progresso da página.
export function VoltarTopo() {
  const [progresso, setProgresso] = useState(0)
  useEffect(() => {
    let quadro
    const medir = () => {
      quadro = null
      const alto = document.documentElement.scrollHeight - window.innerHeight
      setProgresso(alto > 0 ? Math.min(1, window.scrollY / alto) : 0)
    }
    const rolar = () => { if (!quadro) quadro = requestAnimationFrame(medir) }
    medir()
    window.addEventListener('scroll', rolar, { passive: true })
    window.addEventListener('resize', rolar)
    return () => { window.removeEventListener('scroll', rolar); window.removeEventListener('resize', rolar); if (quadro) cancelAnimationFrame(quadro) }
  }, [])
  const visivel = progresso > 0.08
  const r = 22, c = 2 * Math.PI * r
  return (
    <a href="#topo" className={`voltar-topo ${visivel ? 'visivel' : ''}`} aria-label="Voltar ao topo" tabIndex={visivel ? 0 : -1}>
      <svg viewBox="0 0 50 50" aria-hidden="true" className="anel-progresso">
        <circle cx="25" cy="25" r={r} className="trilho" />
        <circle cx="25" cy="25" r={r} className="anel" strokeDasharray={c} strokeDashoffset={c * (1 - progresso)} />
      </svg>
      <ArrowUp size={20} />
    </a>
  )
}
