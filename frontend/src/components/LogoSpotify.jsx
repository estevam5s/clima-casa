// Marca do Spotify (ícone): as diretrizes do Spotify pedem o logo junto do conteúdo e dos controles dele.
// Desenhado em SVG (sem imagem externa); cores oficiais: verde #1ED760 e arcos pretos.
export default function LogoSpotify({ className = 'h-5 w-5', titulo = 'Spotify' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={titulo}>
      <circle cx="12" cy="12" r="12" fill="#1ED760" />
      <g fill="none" stroke="#000" strokeLinecap="round">
        <path d="M5.6 9.1c4-1.3 8.9-1 12.6 1.2" strokeWidth="1.9" />
        <path d="M6.5 12.4c3.3-1 7.2-.7 10.1 1" strokeWidth="1.6" />
        <path d="M7.2 15.5c2.7-.7 5.5-.5 7.9.9" strokeWidth="1.3" />
      </g>
    </svg>
  )
}
