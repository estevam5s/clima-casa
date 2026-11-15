// Índice das seções. A rolagem suave até a âncora fica com o Efeitos.jsx (ScrollSmoother).
export default function IndiceLegal({ itens }) {
  return (
    <ol className="legal-indice">
      {itens.map(([id, t], i) => <li key={id}><a href={`#${id}`}><span>{String(i + 1).padStart(2, '0')}</span>{t}</a></li>)}
    </ol>
  )
}
