import { siAndroid, siApple, siGithub, siIos, siLinux, siPwa } from 'simple-icons'

// Logotipos reais das plataformas (simple-icons). O Windows não está no simple-icons: desenho das 4 janelas.
const WINDOWS = { path: 'M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801', hex: '0078D4' }
const ICONES = { android: siAndroid, mac: siApple, apple: siApple, ios: siIos, linux: siLinux, windows: WINDOWS, github: siGithub, pwa: siPwa }

export default function IconeMarca({ nome, className = 'h-5 w-5', cor = false, titulo }) {
  const i = ICONES[nome]
  if (!i) return null
  return (
    <svg viewBox="0 0 24 24" className={className} role={titulo ? 'img' : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}
      fill={cor && !['000000', '181717'].includes(i.hex) ? `#${i.hex}` : 'currentColor'}>
      <path d={i.path} />
    </svg>
  )
}
