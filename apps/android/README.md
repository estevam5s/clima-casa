# Clima Escritório · app Android

App nativo (Expo / React Native) do **Clima Escritório**: controla os ares-condicionados do escritório pelo celular, com
login por senha, Google ou biometria. Ele conversa só com a API pública do sistema (`https://app.zynio.com.br/api`); os
comandos chegam aos ares pelo agente do escritório, igual ao painel web.

| | |
|---|---|
| Versão | `app.json` → `expo.version` (1.3.0) · pacote `com.estevam5s.climacasa` |
| Stack | Expo SDK 58, React Native 0.88, Expo Router, TypeScript |
| Distribuição | APK no release do GitHub (`ClimaCasa-android.apk`) e atualizações de JS por EAS Update (canal `preview`) |
| Regras do projeto | leia `AGENTS.md` e `CLAUDE.md` desta pasta antes de mexer (a API do Expo muda a cada SDK) |

## Sumário
1. [O que o app faz](#o-que-o-app-faz)
2. [Telas](#telas)
3. [Requisitos](#requisitos)
4. [Rodar em desenvolvimento](#rodar-em-desenvolvimento)
5. [Build e release](#build-e-release)
6. [Atualização do app](#atualização-do-app)
7. [Segurança](#segurança)
8. [Estrutura](#estrutura)
9. [Problemas comuns](#problemas-comuns)

## O que o app faz
- Liga, desliga e ajusta temperatura, modo e ventilação de cada ar (mesma lógica do painel: escolhe o botão gravado mais perto).
- Executa cenas e mostra o estado dos ares do projeto escolhido.
- Entra com **e-mail e senha** (pelo navegador, com CAPTCHA e PKCE), **Google** ou **biometria** (digital/rosto) depois do primeiro login.
- Bloqueia o app com biometria ao voltar do segundo plano (opcional).
- Avisa quando há versão nova (lê `/api/apps/versao`).

O que **não** está no app (use o painel web/PWA): mapa 3D, relatórios, iluminação, notificações em página, infraestrutura e segurança.

## Telas
| Rota (Expo Router) | Tela |
|---|---|
| `src/app/login.tsx` | Login: senha (pelo navegador), Google e biometria |
| `src/app/(abas)/inicio` | Resumo: ares ligados, atalhos |
| `src/app/(abas)/aparelhos` | Lista e controle de cada ar |
| `src/app/(abas)/cenas` | Cenas do projeto |
| `src/app/(abas)/mais` | Conta, projeto, biometria, versão e sair |

## Requisitos
- Node 20+, `npx eas-cli@latest` com a conta Expo do projeto (`estevam5s`, projeto `clima-casa`).
- Só variáveis públicas no app (`EXPO_PUBLIC_*`); nenhuma chave secreta entra no APK.

## Rodar em desenvolvimento
```bash
cd apps/android
npm install
npx expo start            # Expo Go ou build de desenvolvimento
npx tsc --noEmit          # checar tipos
npx expo lint             # lint
npx expo-doctor           # dependências compatíveis com o SDK
```

## Build e release
```bash
# APK (perfil preview, assinado pela EAS)
npx eas-cli@latest build -p android --profile preview
# só JavaScript (sem mudar código nativo): atualização pelo ar
npx eas-cli@latest update --channel preview --environment preview
```
Release do GitHub (`gh release create vX.Y.Z --repo estevam5s/clima-casa`) com o arquivo `ClimaCasa-android.apk`; notas em
`docs/releases/vX.Y.Z.md` (`node scripts/gerar-notas-release.mjs vX.Y.Z`). **Só depois** atualize
`backend/app/versao_apps.json`, que faz os apps avisarem da versão nova.

## Atualização do app
- **EAS Update**: mudanças só de JS chegam sozinhas na próxima abertura (canal `preview`).
- **APK novo**: necessário quando muda código nativo, permissão ou o SDK; o app avisa pelo `versao_apps.json`.

## Segurança
- Login por senha acontece no navegador (`/entrar-app`, com Turnstile) e volta por `climacasa://auth` com um código de uso
  único (2 min) trocado com PKCE SHA-256 (`src/lib/entrarNavegador.ts`).
- A sessão do Supabase fica no armazenamento local do app (`src/lib/supabase.ts`, fluxo PKCE, renovação automática); a biometria só destrava o app com a sessão já salva. Melhoria possível: guardar a sessão no `expo-secure-store`.
- O app só fala com `app.zynio.com.br` por HTTPS; as permissões de cada pessoa valem no servidor.

## Estrutura
```
src/app/         telas (Expo Router)
src/lib/         api, supabase, biometria, login pelo navegador, Google, tema, aviso de atualização
src/ui/          componentes (cartão do ar, bloqueio, base)
app.json         nome, versão, pacote, esquema climacasa://, plugins
eas.json         perfis de build e canais de atualização
```

## Problemas comuns
| Sintoma | O que fazer |
|---|---|
| Login por senha não volta ao app | confira o esquema `climacasa://auth` no `app.json` e se o navegador padrão abre links do app |
| "Sem agente" ao mandar comando | nenhum computador do escritório com o agente ligado (Infra → Agentes no painel) |
| Biometria não aparece | entre uma vez com senha ou Google; depois ative em Mais |
| Build falha depois de atualizar o Expo | `npx expo install --fix` e `npx expo-doctor` |
