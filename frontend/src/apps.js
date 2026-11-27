// Downloads dos apps: último release do repositório privado no GitHub
// (abre para quem estiver logado no GitHub com acesso ao repositório).
// Tamanhos, SHA-256 e versão vêm de release.json (gerado por scripts/gerar-release-json.sh).
import release from './release.json'

export const REPO = 'https://github.com/estevam5s/clima-casa'
export const RELEASE = release
const base = `${REPO}/releases/latest/download`
const porNome = Object.fromEntries((release.arquivos || []).map((a) => [a.nome, a]))

export const DOWNLOADS = [
  { id: 'android', plataforma: 'android', nome: 'Android', detalhe: 'APK para celular e tablet', requisitos: 'Android 7.0 ou mais novo', arquivo: 'ClimaCasa-android.apk',
    passos: ['Baixe o APK no celular (ou leia o QR Code).', 'Abra o arquivo e permita "instalar apps desta fonte" quando o Android pedir.', 'Entre com o mesmo e-mail e senha do painel.'] },
  { id: 'ios', plataforma: 'ios', nome: 'iPhone e iPad', detalhe: 'App nativo em SwiftUI (.ipa sem assinatura)', requisitos: 'iOS 17 ou mais novo', arquivo: 'ClimaCasa-ios.ipa',
    passos: ['A Apple não deixa instalar .ipa direto do navegador: use um computador com o seu Apple ID.', 'Mac ou Linux com o xtool: xtool setup (uma vez, entra com o seu Apple ID) e depois xtool install ClimaCasa-ios.ipa com o iPhone no cabo.', 'Ou pelo AltStore / Sideloadly (Windows ou Mac): abra o .ipa e escolha o iPhone.', 'Com Apple ID grátis o app vale 7 dias: reinstale (ou use o AltStore, que renova sozinho). Login pelo navegador, Face ID depois.'] },
  { id: 'mac-arm', plataforma: 'mac', nome: 'macOS · Apple Silicon', detalhe: 'M1, M2, M3, M4', requisitos: 'macOS 12 Monterey ou mais novo', arquivo: 'ClimaCasa-mac-apple-silicon.dmg',
    passos: ['Abra o .dmg e arraste o Clima Escritório para Aplicativos.', 'Na primeira vez, clique com o botão direito no app → Abrir → Abrir (o app não é assinado pela Apple).', 'Ele fica na barra de menus; ⌘1 a ⌘4 trocam de tela.'] },
  { id: 'mac-intel', plataforma: 'mac', nome: 'macOS · Intel', detalhe: 'Macs com processador Intel', requisitos: 'macOS 12 Monterey ou mais novo', arquivo: 'ClimaCasa-mac-intel.dmg',
    passos: ['Abra o .dmg e arraste o Clima Escritório para Aplicativos.', 'Na primeira vez, clique com o botão direito no app → Abrir → Abrir.'] },
  { id: 'windows', plataforma: 'windows', nome: 'Windows', detalhe: 'Instalador para Windows 10 e 11', requisitos: 'Windows 10 ou 11, 64 bits', arquivo: 'ClimaCasa-windows.exe',
    passos: ['Execute o instalador.', 'Se o SmartScreen avisar, clique em "Mais informações" → "Executar assim mesmo".', 'O app fica na bandeja do sistema e pode iniciar com o Windows.'] },
  { id: 'linux', plataforma: 'linux', nome: 'Linux · x64', detalhe: 'AppImage, roda em qualquer distribuição', requisitos: 'Ubuntu 20.04+, Fedora 36+ ou equivalente', arquivo: 'ClimaCasa-linux-x64.AppImage',
    passos: ['Dê permissão de execução: chmod +x ClimaCasa-linux-x64.AppImage', 'Abra com dois cliques ou ./ClimaCasa-linux-x64.AppImage'] },
  { id: 'linux-arm', plataforma: 'linux', nome: 'Linux · ARM64', detalhe: 'Raspberry Pi 4/5 e outros ARM', requisitos: 'Raspberry Pi OS 64 bits ou equivalente', arquivo: 'ClimaCasa-linux-arm64.AppImage',
    passos: ['chmod +x ClimaCasa-linux-arm64.AppImage', './ClimaCasa-linux-arm64.AppImage'] },
  { id: 'extensao', plataforma: 'extensao', nome: 'Extensão do navegador', detalhe: 'Chrome, Edge, Brave e Firefox', requisitos: 'Chrome 121+, Edge 121+ ou Firefox 121+', arquivo: 'ClimaCasa-extensao.zip',
    passos: ['Baixe e descompacte o .zip numa pasta.', 'Chrome/Edge/Brave: abra chrome://extensions, ligue o Modo do desenvolvedor e clique em Carregar sem compactação → a pasta.', 'Firefox: about:debugging → Este Firefox → Carregar extensão temporária → manifest.json.', 'Entre no painel neste navegador: a extensão usa a mesma sessão.'] },
].map((d) => ({ ...d, url: `${base}/${d.arquivo}`, ...(porNome[d.arquivo] ? { tamanho: porNome[d.arquivo].tamanho, sha256: porNome[d.arquivo].sha256, baixados: porNome[d.arquivo].downloads } : {}) }))

export function sistemaAtual() {
  const ua = navigator.userAgent
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Mac/i.test(ua)) return 'mac-arm'
  if (/Win/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return /aarch64|arm/i.test(ua) ? 'linux-arm' : 'linux'
  return null
}

// Detecta Mac Intel × Apple Silicon quando o navegador informa a arquitetura (Chrome/Edge).
export async function sistemaDetalhado() {
  const base = sistemaAtual()
  if (base !== 'mac-arm' || !navigator.userAgentData?.getHighEntropyValues) return base
  try {
    const { architecture } = await navigator.userAgentData.getHighEntropyValues(['architecture'])
    return architecture === 'x86' ? 'mac-intel' : 'mac-arm'
  } catch { return base }
}
