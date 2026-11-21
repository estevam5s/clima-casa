import Link from 'next/link'

// Botão verde do modelo: no hover o texto sobe e entra o texto de baixo. `hover` troca a cópia por outra frase
// (ex.: "ENTRAR NO SISTEMA" → "ABRIR O PAINEL"); sem ele, repete o mesmo texto.
export default function Botao({ href, children, hover, className = '', externo, ...props }) {
  const miolo = <span className="vira"><span className="txt">{children}</span><span className="txt" aria-hidden="true">{hover || children}</span></span>
  if (externo) return <a href={href} className={`botao ${className}`} {...props}>{miolo}</a>
  if (!href) return <button className={`botao ${className}`} {...props}>{miolo}</button>
  return <Link href={href} className={`botao ${className}`} {...props}>{miolo}</Link>
}
