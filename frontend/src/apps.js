// Downloads dos apps: último release do repositório privado no GitHub
// (abre para quem estiver logado no GitHub com acesso ao repositório).
export const REPO = 'https://github.com/estevam5s/clima-casa'
const base = `${REPO}/releases/latest/download`
export const DOWNLOADS = [
  { id: 'android', nome: 'Android', detalhe: 'APK para celular e tablet', arquivo: 'ClimaCasa-android.apk' },
  { id: 'mac-arm', nome: 'macOS (Apple Silicon)', detalhe: 'M1, M2, M3, M4…', arquivo: 'ClimaCasa-mac-apple-silicon.dmg' },
  { id: 'mac-intel', nome: 'macOS (Intel)', detalhe: 'Macs com processador Intel', arquivo: 'ClimaCasa-mac-intel.dmg' },
  { id: 'windows', nome: 'Windows', detalhe: 'Instalador para Windows 10 e 11', arquivo: 'ClimaCasa-windows.exe' },
  { id: 'linux', nome: 'Linux', detalhe: 'AppImage (x64)', arquivo: 'ClimaCasa-linux-x64.AppImage' },
  { id: 'linux-arm', nome: 'Linux ARM', detalhe: 'AppImage (arm64, Raspberry Pi 4/5)', arquivo: 'ClimaCasa-linux-arm64.AppImage' },
].map((d) => ({ ...d, url: `${base}/${d.arquivo}` }))

export function sistemaAtual() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/Mac/i.test(ua)) return 'mac-arm'
  if (/Win/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return null
}
