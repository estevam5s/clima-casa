import { useCallback, useEffect, useState } from 'react'
import { Activity, AlertTriangle, Cloud, Globe, KeyRound, LayoutDashboard, Laptop, Mail, Rocket, Settings, ShieldCheck, ShieldHalf, Zap } from 'lucide-react'
import { api } from '../api'
import { useProjeto } from '../contexto'
import { Aviso, Cabecalho } from '../components/ui'
import Visao from '../components/infra/Visao'
import Agentes from '../components/infra/Agentes'
import { Config, Publicacoes, Uso, VercelGeral } from '../components/infra/Vercel'
import { CfDNS, CfEmail, CfSeguranca, CfToken, CfTurnstile } from '../components/infra/Cloudflare'

// Infra: o domínio de ponta a ponta. Vercel (site e app), Cloudflare (DNS, e-mails, DNSSEC, Turnstile) e os computadores
// com o agente. Vercel e Cloudflare são operadas PELO AGENTE do escritório: os tokens têm acesso amplo e não ficam na nuvem.
const GRUPOS = [
  ['geral', 'Visão geral', Activity, []],
  ['vercel', 'Vercel', Cloud, [['painel', 'Painel', LayoutDashboard], ['uso', 'Uso', Zap], ['publicacoes', 'Publicações', Rocket], ['config', 'Configurações', Settings]]],
  ['cloudflare', 'Cloudflare', Globe, [['dns', 'DNS', Globe], ['email', 'E-mails', Mail], ['turnstile', 'Turnstile', ShieldHalf], ['seguranca', 'Segurança', ShieldCheck], ['token', 'Token', KeyRound]]],
  ['agentes', 'Agentes', Laptop, []],
]
const ANTIGAS = { uso: 'vercel/uso', publicacoes: 'vercel/publicacoes', config: 'vercel/config' }   // abas salvas antes da divisão

function lerAba() {
  try {
    const a = localStorage.getItem('clima-infra-aba') || 'geral'
    return ANTIGAS[a] || a
  } catch { return 'geral' }
}

function Abas({ itens, ativa, onMudar, pequena }) {
  return (
    <div className={`flex gap-1 overflow-x-auto ${pequena ? 'mb-5' : 'mb-4 border-b border-border'}`} role="tablist">
      {itens.map(([k, n, I]) => (
        <button key={k} type="button" role="tab" aria-selected={ativa === k} onClick={() => onMudar(k)}
          className={pequena
            ? `flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${ativa === k ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`
            : `-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${ativa === k ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          <I className="h-4 w-4" />{n}
        </button>
      ))}
    </div>
  )
}

export default function Infra() {
  const { sessao } = useProjeto()
  const dono = sessao?.papel === 'dono'
  const [aba, setAba] = useState(lerAba)
  const [grupo, sub] = aba.split('/')
  const def = GRUPOS.find((g) => g[0] === grupo) || GRUPOS[0]
  const subAtiva = def[3].length ? (def[3].some((s) => s[0] === sub) ? sub : def[3][0][0]) : null
  const irPara = (a) => { setAba(a); try { localStorage.setItem('clima-infra-aba', a) } catch { /* sem armazenamento */ } }
  const [resumo, setResumo] = useState(null), [saude, setSaude] = useState(null), [uso, setUso] = useState(null), [dias, setDias] = useState(30)
  const [erro, setErro] = useState('')
  const carregar = useCallback(() => {
    setErro('')
    api.get('/api/infra/saude').then(setSaude).catch(() => {})
    api.get('/api/infra/resumo').then(setResumo).catch((e) => setErro(e.message))
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { setUso(null); api.get(`/api/infra/uso?dias=${dias}`).then(setUso).catch(() => {}) }, [dias])
  if (sessao && !['dono', 'admin'].includes(sessao.papel)) return <Aviso>Só o dono e os administradores veem a infraestrutura.</Aviso>

  const tela = {
    geral: <Visao resumo={resumo} saude={saude} irPara={irPara} />,
    'vercel/painel': <VercelGeral resumo={resumo} saude={saude} uso={uso} recarregar={carregar} />,
    'vercel/uso': <Uso uso={uso} dias={dias} setDias={setDias} />,
    'vercel/publicacoes': <Publicacoes dono={dono} />,
    'vercel/config': <Config resumo={resumo} dono={dono} recarregar={carregar} />,
    'cloudflare/dns': <CfDNS dono={dono} />,
    'cloudflare/email': <CfEmail dono={dono} />,
    'cloudflare/turnstile': <CfTurnstile />,
    'cloudflare/seguranca': <CfSeguranca dono={dono} />,
    'cloudflare/token': <CfToken />,
    agentes: <Agentes dono={dono} admin={sessao?.papel === 'admin'} />,
  }[subAtiva ? `${def[0]}/${subAtiva}` : def[0]]

  return (
    <div>
      <Cabecalho titulo="Infra" descricao="O domínio zynio.com.br de ponta a ponta: Vercel (site e app), Cloudflare (DNS, e-mails, DNSSEC, anti-robô) e os computadores com o agente. Vercel e Cloudflare são operadas pelo agente do escritório: os tokens não ficam na nuvem." />
      {erro && def[0] === 'vercel' && <div className="mb-4"><Aviso tipo="alerta"><span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />{erro}</span></Aviso></div>}
      <Abas itens={GRUPOS} ativa={def[0]} onMudar={(g) => irPara(g)} />
      {!!def[3].length && <Abas pequena itens={def[3]} ativa={subAtiva} onMudar={(s) => irPara(`${def[0]}/${s}`)} />}
      {tela}
    </div>
  )
}
