import Link from 'next/link'

// Botão verde do modelo: o texto sobe e é trocado por uma cópia no hover.
export default function Botao({ href, children, className = '', externo, ...props }) {
  const miolo = <span className="vira"><span className="txt">{children}</span><span className="txt" aria-hidden="true">{children}</span></span>
  if (externo) return <a href={href} className={`botao ${className}`} {...props}>{miolo}</a>
  if (!href) return <button className={`botao ${className}`} {...props}>{miolo}</button>
  return <Link href={href} className={`botao ${className}`} {...props}>{miolo}</Link>
}
