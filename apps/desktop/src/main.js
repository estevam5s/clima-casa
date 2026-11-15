// Clima Casa — app desktop (Electron). Abre o painel publicado na Vercel numa janela nativa,
// com ícone na barra de menus, início automático opcional e tela própria quando estiver sem internet.
const { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, net } = require('electron')
const path = require('path')
const fs = require('fs')

const URL_APP = process.env.CLIMA_URL || 'https://app.zynio.com.br'
const ORIGEM = new URL(URL_APP).origin
// login com Google e verificação anti-robô acontecem dentro da janela (o retorno precisa voltar para o app)
const LOGIN_EXTERNO = [/^https:\/\/accounts\.google\.com\//, /^https:\/\/[\w-]+\.supabase\.co\/auth\//, /^https:\/\/challenges\.cloudflare\.com\//]
const ARQ_ESTADO = path.join(app.getPath('userData'), 'janela.json')
let janela = null
let bandeja = null
let saindo = false

if (!app.requestSingleInstanceLock()) app.quit()
ipcMain.on('versao-app', (e) => { e.returnValue = app.getVersion() })
app.on('second-instance', () => mostrar())

function lerEstado() {
  try { return JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8')) } catch { return { width: 1360, height: 860 } }
}
function salvarEstado() {
  if (!janela || janela.isMinimized() || janela.isFullScreen()) return
  try { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(janela.getBounds())) } catch { /* sem disco */ }
}

function carregar() {
  if (!janela) return
  if (!net.isOnline()) return janela.loadFile(path.join(__dirname, 'offline.html'))
  janela.loadURL(URL_APP).catch(() => janela.loadFile(path.join(__dirname, 'offline.html')))
}

function criarJanela() {
  const est = lerEstado()
  janela = new BrowserWindow({
    ...est, minWidth: 380, minHeight: 600, show: false, title: 'Clima Escritório',
    backgroundColor: '#0e0e10', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  janela.once('ready-to-show', () => janela.show())
  for (const ev of ['resize', 'move']) janela.on(ev, salvarEstado)
  janela.on('close', (e) => { if (!saindo && process.platform === 'darwin') { e.preventDefault(); janela.hide() } })
  // links para fora do Clima Casa (Amazon, Sinric, Supabase…) abrem no navegador padrão
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGEM) && !url.startsWith('file://') && !LOGIN_EXTERNO.some((r) => r.test(url))) { e.preventDefault(); shell.openExternal(url) }
  })
  janela.webContents.on('did-fail-load', (_e, codigo, _d, url) => {
    if (codigo !== -3 && url.startsWith(ORIGEM)) janela.loadFile(path.join(__dirname, 'offline.html'))
  })
  carregar()
}

function mostrar(rota) {
  if (!janela) criarJanela()
  if (rota) janela.loadURL(URL_APP + rota)
  janela.show(); janela.focus()
}

function montarBandeja() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
  img.setTemplateImage(false)
  bandeja = new Tray(img.resize({ width: 18, height: 18 }))
  bandeja.setToolTip('Clima Casa')
  const menu = () => Menu.buildFromTemplate([
    { label: 'Abrir Clima Casa', click: () => mostrar() },
    { type: 'separator' },
    { label: 'Painel', click: () => mostrar('/') },
    { label: 'Aparelhos', click: () => mostrar('/aparelhos') },
    { label: 'Cenas', click: () => mostrar('/cenas') },
    { label: 'Alexa e Google', click: () => mostrar('/integracoes') },
    { type: 'separator' },
    { label: 'Iniciar com o sistema', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, openAsHidden: true }) },
    { label: 'Recarregar', click: () => carregar() },
    { type: 'separator' },
    { label: 'Sair', click: () => { saindo = true; app.quit() } },
  ])
  bandeja.setContextMenu(menu())
  bandeja.on('click', () => mostrar())
}

function montarMenuApp() {
  const modelo = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'Ir', submenu: [
      { label: 'Painel', accelerator: 'CmdOrCtrl+1', click: () => mostrar('/') },
      { label: 'Aparelhos', accelerator: 'CmdOrCtrl+2', click: () => mostrar('/aparelhos') },
      { label: 'Cenas', accelerator: 'CmdOrCtrl+3', click: () => mostrar('/cenas') },
      { label: 'Relatórios', accelerator: 'CmdOrCtrl+4', click: () => mostrar('/relatorios') },
      { label: 'Configurações', accelerator: 'CmdOrCtrl+,', click: () => mostrar('/configuracoes') },
    ] },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo))
}

ipcMain.on('tentar-de-novo', () => carregar())

app.whenReady().then(() => {
  app.setAppUserModelId('com.estevam5s.climacasa.desktop')
  montarMenuApp()
  criarJanela()
  montarBandeja()
  app.on('activate', () => mostrar())
})
app.on('before-quit', () => { saindo = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
