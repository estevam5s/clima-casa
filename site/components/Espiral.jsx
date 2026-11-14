// Espiral torcida em SVG (desenhada aqui, sem imagem): faixas que giram do centro até a borda.
export default function Espiral({ tamanho = 160, faixas = 18, torcao = 2.6, cor = 'rgba(255,255,255,.22)', fundo = 'transparent', className = '', esfera = false }) {
  const R = 100
  const caminhos = []
  const largura = Math.PI / faixas
  for (let k = 0; k < faixas; k++) {
    const a0 = (k * 2 * Math.PI) / faixas
    const ida = [], volta = []
    for (let i = 0; i <= 24; i++) {
      const r = (i / 24) * R
      const t = torcao * (r / R)
      ida.push([R + r * Math.cos(a0 + t), R + r * Math.sin(a0 + t)])
      volta.push([R + r * Math.cos(a0 + t + largura), R + r * Math.sin(a0 + t + largura)])
    }
    const pts = [...ida, ...volta.reverse()].map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
    caminhos.push(<path key={k} d={`${pts} Z`} fill={cor} />)
  }
  const id = `esf-${faixas}-${tamanho}`
  return (
    <svg viewBox="0 0 200 200" width={tamanho} height={tamanho} className={className} aria-hidden="true">
      {esfera && (
        <defs>
          <radialGradient id={id} cx="35%" cy="35%" r="70%"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></radialGradient>
        </defs>
      )}
      <circle cx="100" cy="100" r="100" fill={fundo} />
      {caminhos}
      {esfera && <circle cx="100" cy="100" r="100" fill={`url(#${id})`} />}
    </svg>
  )
}
