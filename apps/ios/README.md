# Clima Escritório para iPhone (SwiftUI)

App nativo em Swift (iOS 17+) com as mesmas funcionalidades do app Android: login seguro pelo navegador (PKCE, com a
verificação anti-robô), Face ID, painel, aparelhos com controle completo (ligar, temperatura, modo, ventilação, timer,
botões extras), cenas, Assistente de IA com os modelos gratuitos da NVIDIA, salas, transmissores, luzes (e teclas de
interruptor), persianas, cafeteira, fechadura, música, agenda, automações, notificações, atividade, alertas, mensagens
com Kanban, novidades, segurança (com o bot do Telegram), Alexa/Google e o banco.

O projeto é um pacote SwiftPM no formato do [xtool](https://github.com/xtool-org/xtool) (sem projeto do Xcode).

## Instalar no iPhone (xtool)
```bash
brew install xtool-org/tap/xtool
xtool setup                 # uma vez: entra com o Apple ID (grátis serve) e instala o SDK
cd apps/ios
xtool dev                   # compila, assina e instala no iPhone conectado por cabo (ou na mesma rede)
```
Com Apple ID gratuito, o app vale 7 dias e precisa ser reinstalado (regra da Apple).

## Outros comandos
```bash
xtool dev build --triple arm64-apple-ios17.0-simulator   # .app para o simulador
xtool dev build --ipa -c release                          # .ipa (sem assinatura: para AltStore/Sideloadly)
xcodebuild -scheme ClimaEscritorio -destination 'generic/platform=iOS Simulator' build   # checagem de compilação
```
