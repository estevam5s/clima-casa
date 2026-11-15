'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, HelpCircle, Home, PlayCircle, Snowflake } from 'lucide-react'

// 404 do site: um ar-condicionado "soprando" o erro, linguagem simples e o caminho certo.
const PAGINAS = [['Início', '/'], ['Sobre o sistema', '/sobre'], ['Como funciona', '/como-funciona'], ['Funcionalidades', '/funcionalidades'], ['Telas', '/telas'],
  ['Integrações', '/integracoes'], ['Segurança', '/seguranca'], ['Status', '/status'], ['Baixar os apps', '/baixar'], ['Novidades', '/novidades'],
  ['Perguntas frequentes', '/faq'], ['Contato', '/contato'], ['Privacidade', '/privacidade'], ['Termos', '/termos']]
function dist(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return m[a.length][b.length]
}

export default function Pagina404() {
  const caminho = usePathname() || ''
  const rota = useRouter()
  const sugestao = useMemo(() => {
    const p = caminho.toLowerCase().split('/')[1] || ''
    if (!p) return null
    const [m] = PAGINAS.filter(([, r]) => r !== '/').map(([n, r]) => [n, r, dist(p, r.slice(1))]).sort((a, b) => a[2] - b[2])
    return m && m[2] <= Math.max(2, Math.floor(p.length / 3)) ? m : null
  }, [caminho])
  return (
    <section className="banner-pagina erro-404 p404">
      <div className="circulo c1" /><div className="circulo c2" />
      <div className="container texto-centro">
        <div className="p404-cena" aria-hidden>
          <div className="p404-ar"><span className="p404-display">404</span><span className="p404-led" /><span className="p404-grade" /></div>
          {[0, 1, 2, 3].map((i) => <span key={`v${i}`} className="p404-vento" style={{ animationDelay: `${i * 0.35}s`, left: `${30 + i * 13}%` }} />)}
          {Array.from({ length: 16 }, (_, i) => <Snowflake key={i} className="p404-floco" size={i % 3 ? 14 : 20} style={{ left: `${12 + ((i * 41) % 76)}%`, animationDelay: `${(i * 0.37) % 4}s`, animationDuration: `${3.2 + (i % 4) * 0.7}s` }} />)}
        </div>
        <h1 className="p404-titulo">Essa página saiu para tomar um ar</h1>
        <p className="p404-texto">O endereço foi digitado errado ou a página mudou de lugar. Nada de errado com você nem com o sistema: é só escolher para onde ir.</p>
        {sugestao && <p className="p404-sugestao">Você quis dizer <Link href={sugestao[1]}>{sugestao[0]}</Link>?</p>}
        <div className="p404-botoes">
          <button className="botao contorno" onClick={() => (window.history.length > 1 ? rota.back() : rota.push('/'))}><span className="vira"><span className="txt"><ArrowLeft size={16} /> Voltar</span><span className="txt" aria-hidden><ArrowLeft size={16} /> Voltar</span></span></button>
          <Link href="/" className="botao"><span className="vira"><span className="txt"><Home size={16} /> Ir para o início</span><span className="txt" aria-hidden><Home size={16} /> Ir para o início</span></span></Link>
        </div>
        <div className="p404-atalhos">
          {[[PlayCircle, 'Como funciona', '/como-funciona'], [BookOpen, 'Funcionalidades', '/funcionalidades'], [HelpCircle, 'Perguntas frequentes', '/faq']].map(([I, n, h]) => (
            <Link key={h} href={h}><I size={22} />{n}</Link>
          ))}
        </div>
      </div>
    </section>
  )
}
