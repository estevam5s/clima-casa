// Clima Escritório: app desktop (Electron). Abre o sistema publicado numa janela nativa, com ícone na barra de menus,
// início automático, tela própria sem internet, bloqueio com Touch ID, atalhos de teclado e aviso de versão nova.
// As telas do sistema vêm do servidor: toda melhoria aparece sozinha. Só o "casco" do app precisa de download novo.
const { app, BrowserWindow, Menu, Notification, Tray, dialog, globalShortcut, nativeImage, net, session, shell, systemPreferences, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

const URL_APP = process.env.CLIMA_URL || 'https://app.zynio.com.br'
const ORIGEM = new URL(URL_APP).origin
// login com Google e verificação anti-robô acontecem dentro da janela (o retorno precisa voltar para o app)
// compara a origem inteira (startsWith deixaria passar https://app.zynio.com.br.outro-site.com)
const mesmaOrigem = (url) => { try { return new URL(url).origin === ORIGEM } catch { return false } }
const LOGIN_EXTERNO = [/^https:\/\/accounts\.google\.com\//, /^https:\/\/[\w-]+\.supabase\.co\/auth\//, /^https:\/\/challenges\.cloudflare\.com\//]
const ARQ_ESTADO = path.join(app.getPath('userData'), 'janela.json')
const ARQ_PREF = path.join(app.getPath('userData'), 'preferencias.json')
const ROTAS = [['Painel', '/'], ['Aparelhos', '/aparelhos'], ['Mapa do escritório', '/mapa'], ['Cenas', '/cenas'], ['Automações', '/automacoes'],
  ['Agenda', '/agendamentos'], ['Relatórios', '/relatorios'], ['Atividade', '/atividade'], ['Segurança', '/seguranca']]
// telas novas (1.4.0): no menu Ir e na bandeja, sem atalho de número (Cmd+1 a 9 já são as de cima)
const MAIS_TELAS = [['Assistente de IA', '/ia'], ['Notificações', '/notificacoes'], ['Treinamento e segurança', '/treinamento'], ['Backup e restauração', '/backup'],
  ['Telegram', '/telegram'], ['Música', '/musica'], ['Bugs', '/bugs'], ['Transmissores', '/transmissores']]
let janela = null, bandeja = null, saindo = false, travado = false, escondidaEm = null, novaVersao = null

if (!app.requestSingleInstanceLock()) app.quit()
ipcMain.on('versao-app', (e) => { e.returnValue = app.getVersion() })
app.on('second-instance', () => mostrar())

const ler = (arq, padrao) => { try { return { ...padrao, ...JSON.parse(fs.readFileSync(arq, 'utf8')) } } catch { return padrao } }
const pref = () => ler(ARQ_PREF, { touchId: false })
const salvarPref = (p) => { try { fs.writeFileSync(ARQ_PREF, JSON.stringify({ ...pref(), ...p })) } catch { /* sem disco */ } }
const touchIdDisponivel = () => process.platform === 'darwin' && systemPreferences.canPromptTouchID()

function salvarEstado() {
  if (!janela || janela.isMinimized() || janela.isFullScreen()) return
  try { fs.writeFileSync(ARQ_ESTADO, JSON.stringify(janela.getBounds())) } catch { /* sem disco */ }
}

function carregar(rota = '') {
  if (!janela) return
  if (travado) return janela.loadFile(path.join(__dirname, 'bloqueio.html'))
  if (!net.isOnline()) return janela.loadFile(path.join(__dirname, 'offline.html'))
  janela.loadURL(URL_APP + rota).catch(() => janela.loadFile(path.join(__dirname, 'offline.html')))
}

function criarJanela() {
  janela = new BrowserWindow({
    ...ler(ARQ_ESTADO, { width: 1360, height: 860 }), minWidth: 380, minHeight: 600, show: false, title: 'Clima Escritório',
    backgroundColor: '#0e0e10', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  })
  janela.once('ready-to-show', () => janela.show())
  for (const ev of ['resize', 'move']) janela.on(ev, salvarEstado)
  janela.on('hide', () => { escondidaEm = Date.now() })
  janela.on('blur', () => { escondidaEm = escondidaEm || Date.now() })
  janela.on('focus', () => {
    // voltou depois de 5 min fora: pede o Touch ID de novo
    if (pref().touchId && touchIdDisponivel() && escondidaEm && Date.now() - escondidaEm > 5 * 60_000 && !travado) bloquear()
    escondidaEm = null
  })
  janela.on('close', (e) => { if (!saindo && process.platform === 'darwin') { e.preventDefault(); janela.hide() } })
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (e, url) => {
    if (mesmaOrigem(url) || url.startsWith('file://') || LOGIN_EXTERNO.some((r) => r.test(url))) return
    e.preventDefault()
    // fora do app: só abre no navegador o que é página ou e-mail; outros esquemas (smb:, search-ms:…) abririam programas
    if (/^(https?|mailto):/i.test(url)) shell.openExternal(url)
  })
  janela.webContents.on('did-fail-load', (_e, codigo, _d, url) => {
    if (codigo !== -3 && url.startsWith(ORIGEM)) janela.loadFile(path.join(__dirname, 'offline.html'))
  })
  carregar()
}

function mostrar(rota) {
  if (!janela) criarJanela()
  if (rota && !travado) janela.loadURL(URL_APP + rota)
  janela.show(); janela.focus()
}

// ---------- Touch ID ----------
function bloquear() { travado = true; carregar() }
ipcMain.handle('desbloquear', async () => {
  try { await systemPreferences.promptTouchID('abrir o Clima Escritório'); travado = false; carregar(); return { ok: true } }
  catch { return { ok: false, erro: 'Não reconheceu. Tente de novo ou use a senha do Mac.' } }
})

// ---------- atalhos ----------
let janelaAtalhos = null
function mostrarAtalhos() {
  if (janelaAtalhos) return janelaAtalhos.focus()
  janelaAtalhos = new BrowserWindow({ width: 560, height: 620, title: 'Atalhos de teclado', resizable: false, minimizable: false, parent: janela || undefined,
    backgroundColor: '#0e0e10', webPreferences: { contextIsolation: true, sandbox: true } })
  janelaAtalhos.setMenuBarVisibility(false)
  janelaAtalhos.loadFile(path.join(__dirname, 'atalhos.html'))
  janelaAtalhos.on('closed', () => { janelaAtalhos = null })
}
// atalho dentro da página do sistema (o mesmo evento que o ⌘K do teclado dispara)
const naPagina = (js) => janela?.webContents.executeJavaScript(js).catch(() => {})

// ---------- versão nova do app ----------
const comparar = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0 }
async function procurarVersao(manual = false) {
  try {
    const r = await net.fetch(`${URL_APP}/api/apps/versao`, { cache: 'no-store' })
    const v = await r.json()
    if (v?.desktop?.versao && comparar(v.desktop.versao, app.getVersion()) > 0) {
      const primeira = novaVersao !== v.desktop.versao
      novaVersao = v.desktop.versao
      montarBandeja(); montarMenuApp()
      if (primeira || manual) avisarVersao(v)
    } else if (manual) {
      dialog.showMessageBox(janela, { type: 'info', message: 'Tudo em dia', detail: `Você está na versão mais recente (${app.getVersion()}). As telas do sistema se atualizam sozinhas.` })
    }
  } catch { if (manual) dialog.showMessageBox(janela, { type: 'warning', message: 'Sem conexão', detail: 'Não deu para procurar atualizações agora.' }) }
}
function avisarVersao(v) {
  const notas = (v.notas || []).map((n) => `• ${n}`).join('\n')
  if (Notification.isSupported()) {
    const n = new Notification({ title: `Clima Escritório ${v.desktop.versao} disponível`, body: (v.notas || []).slice(0, 2).join(' · ') || 'Clique para baixar.' })
    n.on('click', () => baixarVersao(v)); n.show()
  }
  dialog.showMessageBox(janela, {
    type: 'info', buttons: ['Baixar agora', 'Depois'], defaultId: 0, cancelId: 1,
    message: `Nova versão ${v.desktop.versao} do app`, detail: `${notas}\n\nVocê está na ${app.getVersion()}. Baixe e instale por cima; suas preferências continuam.`,
  }).then(({ response }) => { if (response === 0) baixarVersao(v) })
}
const baixarVersao = (v) => shell.openExternal(v?.desktop?.pagina || `${URL_APP}/apps`)

// ---------- bandeja e menu ----------
function montarBandeja() {
  if (!bandeja) {
    const img = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
    bandeja = new Tray(img.resize({ width: 18, height: 18 }))
    bandeja.setToolTip('Clima Escritório')
    bandeja.on('click', () => mostrar())
  }
  bandeja.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir Clima Escritório', click: () => mostrar() },
    ...(novaVersao ? [{ label: `Baixar a versão ${novaVersao}`, click: () => baixarVersao() }] : []),
    { type: 'separator' },
    ...ROTAS.slice(0, 5).map(([r, rota]) => ({ label: r, click: () => mostrar(rota) })),
    { label: 'Assistente de IA', click: () => mostrar('/ia') },
    { label: 'Mais telas', submenu: MAIS_TELAS.map(([r, rota]) => ({ label: r, click: () => mostrar(rota) })) },
    { type: 'separator' },
    { label: 'Iniciar com o sistema', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked, openAsHidden: true }) },
    ...(touchIdDisponivel() ? [{ label: 'Bloquear com Touch ID', type: 'checkbox', checked: pref().touchId, click: (i) => salvarPref({ touchId: i.checked }) }] : []),
    { label: 'Recarregar', click: () => carregar() },
    { type: 'separator' },
    { label: 'Sair', click: () => { saindo = true; app.quit() } },
  ]))
}

function montarMenuApp() {
  const mac = process.platform === 'darwin'
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: app.name, submenu: [
      { role: 'about', label: 'Sobre o Clima Escritório' },
      { label: novaVersao ? `Baixar a versão ${novaVersao}…` : 'Procurar atualização…', click: () => (novaVersao ? baixarVersao() : procurarVersao(true)) },
      { type: 'separator' }, { role: 'hide', label: 'Ocultar' }, { role: 'hideOthers', label: 'Ocultar outros' }, { type: 'separator' },
      { label: 'Sair', accelerator: 'Cmd+Q', click: () => { saindo = true; app.quit() } },
    ] }] : []),
    { label: 'Editar', submenu: [{ role: 'undo', label: 'Desfazer' }, { role: 'redo', label: 'Refazer' }, { type: 'separator' }, { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' }, { role: 'paste', label: 'Colar' }, { role: 'selectAll', label: 'Selecionar tudo' }] },
    { label: 'Ir', submenu: [
      ...ROTAS.map(([r, rota], i) => ({ label: r, accelerator: `CmdOrCtrl+${i + 1}`, click: () => mostrar(rota) })),
      { type: 'separator' },
      ...MAIS_TELAS.map(([r, rota]) => ({ label: r, ...(rota === '/ia' ? { accelerator: 'CmdOrCtrl+Shift+I' } : {}), click: () => mostrar(rota) })),
      { type: 'separator' },
      { label: 'Mensagens', click: () => mostrar('/mensagens') },
      { label: 'Configurações', accelerator: 'CmdOrCtrl+,', click: () => mostrar('/configuracoes') },
      { label: 'Buscar…', accelerator: 'CmdOrCtrl+K', click: () => naPagina("window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true}))") },
    ] },
    { label: 'Ver', submenu: [{ role: 'reload', label: 'Recarregar' }, { role: 'forceReload', label: 'Recarregar sem cache' }, { type: 'separator' },
      { role: 'resetZoom', label: 'Tamanho real' }, { role: 'zoomIn', label: 'Aumentar' }, { role: 'zoomOut', label: 'Diminuir' }, { type: 'separator' },
      { role: 'togglefullscreen', label: 'Tela cheia' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { label: 'Janela', submenu: [{ role: 'minimize', label: 'Minimizar' }, { role: 'close', label: 'Fechar' },
      ...(touchIdDisponivel() ? [{ type: 'separator' }, { label: 'Bloquear agora', accelerator: 'CmdOrCtrl+Shift+L', click: () => bloquear() }] : [])] },
    { label: 'Ajuda', submenu: [
      { label: 'Atalhos de teclado', accelerator: 'CmdOrCtrl+/', click: mostrarAtalhos },
      { label: 'Procurar atualização', click: () => procurarVersao(true) },
      { label: 'Abrir o site', click: () => shell.openExternal('https://zynio.com.br') },
    ] },
  ]))
}

ipcMain.on('tentar-de-novo', () => carregar())

app.whenReady().then(() => {
  app.setAppUserModelId('com.estevam5s.climacasa.desktop')
  // o Google recusa login em janelas que se identificam como "Electron": usa a identificação do Chrome
  const ua = session.defaultSession.getUserAgent().replace(/\s(Electron|clima-casa-desktop|Clima Casa)\/\S+/g, '')
  session.defaultSession.setUserAgent(ua)
  travado = pref().touchId && touchIdDisponivel()
  montarMenuApp()
  criarJanela()
  montarBandeja()
  globalShortcut.register('CommandOrControl+Shift+Space', () => { if (janela?.isVisible() && janela.isFocused()) janela.hide(); else mostrar() })
  setTimeout(() => procurarVersao(false), 8000)
  setInterval(() => procurarVersao(false), 6 * 3600_000)
  app.on('activate', () => mostrar())
})
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('before-quit', () => { saindo = true })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
