# Clima Escritório · app desktop

App para **macOS, Windows e Linux** (Electron) que abre o painel do **Clima Escritório** numa janela própria, com ícone na
bandeja, atalho global, Touch ID no Mac e aviso de versão nova. Ele carrega o painel de `https://app.zynio.com.br` (as
mesmas telas do navegador); sem internet, mostra uma página de "sem conexão" com tentar de novo.

| | |
|---|---|
| Versão | `package.json` → `version` (1.3.0) |
| Stack | Electron 45 (`src/main.js`, `src/preload.js`) |
| Nome do produto | "Clima Casa" de propósito (mudar cria outro app no sistema) |
| Distribuição | release do GitHub: `ClimaCasa-mac-apple-silicon.dmg`, `-mac-intel.dmg`, `-windows.exe`, `-linux-x64.AppImage`, `-linux-arm64.AppImage` |

## Sumário
1. [O que o app faz](#o-que-o-app-faz)
2. [Requisitos](#requisitos)
3. [Rodar em desenvolvimento](#rodar-em-desenvolvimento)
4. [Build e release](#build-e-release)
5. [Atualização do app](#atualização-do-app)
6. [Segurança](#segurança)
7. [Estrutura](#estrutura)
8. [Problemas comuns](#problemas-comuns)

## O que o app faz
- Janela própria com todo o painel (ares, mapa 3D, iluminação, notificações, relatórios, infra…).
- **Bandeja** (ícone perto do relógio): abrir, ir direto às 5 telas mais usadas, recarregar e baixar a versão nova quando houver.
- **Atalho global** `Cmd/Ctrl + Shift + Espaço` para mostrar ou esconder a janela.
- **Touch ID** no Mac para destravar o app (opcional).
- **Iniciar com o sistema** (opção na bandeja).
- **Aviso de versão nova** (notificação do sistema e janela com as notas), lido de `/api/apps/versao`.
- Página **offline** quando não há internet, com "Tentar de novo".

## Requisitos
- Node 20+.
- Para gerar o instalador do Mac sem assinatura de desenvolvedor: `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## Rodar em desenvolvimento
```bash
cd apps/desktop
npm install
npm start          # abre o app apontando para app.zynio.com.br
```

## Build e release
```bash
cd apps/desktop
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 --x64 --win nsis --x64 --linux AppImage --x64
```
Renomeie os arquivos para os nomes fixos do release (tabela acima), publique com
`gh release create vX.Y.Z --repo estevam5s/clima-casa` e notas em `docs/releases/vX.Y.Z.md`. **Só depois** atualize
`backend/app/versao_apps.json` (os apps avisam da versão nova).

## Atualização do app
O conteúdo (telas) atualiza sozinho, porque vem do servidor a cada abertura. O instalador só precisa ser trocado quando muda
o próprio app (bandeja, atalhos, Touch ID, Electron): o aviso de versão leva ao release.

## Segurança
- A janela só carrega `app.zynio.com.br`; links de fora abrem no navegador do sistema.
- Janela com `contextIsolation`, `sandbox` e sem `nodeIntegration`; `preload.js` expõe só o necessário (versão do app, desbloquear com Touch ID, tentar de novo).
- O login, as permissões e o 2FA são os do próprio sistema (servidor).

## Estrutura
```
src/main.js        janela, bandeja, atalho global, Touch ID, aviso de versão, página offline
src/preload.js     ponte mínima entre a janela e o app
src/offline.html   sem internet
src/bloqueio.html  tela de Touch ID
src/atalhos.html   lista de atalhos de teclado
src/tray*.png      ícone da bandeja
build/             ícones e recursos do instalador
```

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| macOS diz que o app não pode ser aberto | botão direito → Abrir (o instalador não é assinado pela Apple) |
| Janela em branco | sem internet ou firewall da rede bloqueando `zynio.com.br` (ver CLAUDE.md, armadilha do Fortinet); use "Tentar de novo" |
| Atalho global não funciona | outro app usa `Cmd/Ctrl + Shift + Espaço`; feche-o ou troque o atalho em `src/main.js` |
| Aviso de versão não aparece | `backend/app/versao_apps.json` ainda não foi atualizado depois do release |
