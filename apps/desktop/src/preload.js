// Ponte mínima e segura entre a página e o app (contextIsolation ligado, sem Node na página).
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('climaDesktop', {
  plataforma: process.platform,
  tentarDeNovo: () => ipcRenderer.send('tentar-de-novo'),
})
