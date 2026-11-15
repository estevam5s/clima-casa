// Ponte mínima e segura entre a página e o app (contextIsolation ligado, sem Node na página).
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('climaDesktop', {
  plataforma: process.platform,
  versao: ipcRenderer.sendSync('versao-app'),
  arquitetura: process.arch,
  tentarDeNovo: () => ipcRenderer.send('tentar-de-novo'),
})
