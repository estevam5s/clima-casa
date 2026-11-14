# Skill da Alexa: passo a passo

A Skill é sua, fica em modo de desenvolvimento e só a sua conta Amazon usa.
Não precisa passar pela certificação da Amazon.

```
"Alexa, ligar ar do quarto"
   → Amazon (Skill Smart Home)
   → AWS Lambda (alexa/lambda/index.mjs)
   → Vercel (clima-casa-lac.vercel.app)
   → fila no Supabase
   → agente do Clima Casa no Mac
   → SRW-004
   → ar-condicionado
```

Os valores marcados com ⟨…⟩ estão na tela **Alexa** do painel, com botão de copiar.

## 1. URL pública (HTTPS)

Já está pronta: **https://clima-casa-lac.vercel.app** (Vercel). A Alexa fala com a Vercel, a Vercel grava o
comando na fila do Supabase e o agente no Mac dispara o infravermelho. Não precisa de túnel.

## 2. Criar a Skill

1. Acesse https://developer.amazon.com/alexa/console/ask e entre com a **mesma conta do app Alexa**.
2. Clique em **Create Skill**:
   - Nome: `Clima Casa`
   - Locale: **Portuguese (BR)**
   - Experience: *Smart Home*
   - Model: **Smart Home**
   - Hosting: *Provision your own*
3. Copie o **Skill ID** (`amzn1.ask.skill...`).

## 3. Criar a Lambda (AWS)

1. Acesse https://console.aws.amazon.com/lambda na região **us-east-1 (N. Virginia)**.
   É a região que atende contas Alexa do Brasil.
2. Clique em **Create function**:
   - Nome: `clima-casa-alexa`
   - Runtime: **Node.js 20.x**
3. Em **Code**, renomeie o arquivo para `index.mjs`, cole o conteúdo de `alexa/lambda/index.mjs` e clique em **Deploy**.
4. Em **Configuration → Environment variables**, crie:
   - `CLIMA_URL` = ⟨CLIMA_URL⟩ (termina em `/alexa/diretiva`)
   - `CLIMA_CHAVE` = ⟨CLIMA_CHAVE⟩
5. Em **Configuration → General**, mude o *Timeout* para **8 s**.
6. Clique em **Add trigger → Alexa → Alexa Smart Home** e cole o Skill ID.
7. Copie o **ARN** da função (`arn:aws:lambda:us-east-1:...`).

## 4. Ligar a Skill à Lambda

Na Skill, vá em **Smart Home → Default endpoint**, cole o ARN e clique em **Save**.

## 5. Vinculação de conta (Account Linking)

| Campo | Valor |
|---|---|
| Authorization grant type | Auth Code Grant |
| Web Authorization URI | ⟨URL de autorização⟩ |
| Access Token URI | ⟨URL de token⟩ |
| Your Client ID | ⟨Client ID⟩ |
| Your Secret | ⟨Client Secret⟩ |
| Your Authentication Scheme | HTTP Basic (Recommended) |
| Scope | `controle` (qualquer texto) |
| Default Access Token Expiration Time | 3600 |

Clique em **Save**.

## 6. Ativar

1. No app Alexa, vá em **Mais → Skills e jogos → Suas Skills → Dev → Clima Casa → Ativar**.
2. Abre a tela de login do Clima Casa: entre com a senha do painel e toque em **Autorizar**.
3. Diga "Alexa, descobrir dispositivos". Os aparelhos marcados como "Disponível na Alexa" aparecem.

## Comandos

- "Alexa, ligar ar do quarto" e "Alexa, desligar ar do quarto"
- "Alexa, colocar ar do quarto em 23 graus"
- "Alexa, aumentar a temperatura do ar do quarto"
- "Alexa, colocar ar do quarto no modo frio" (frio, quente ou automático)

Para mudar a temperatura, o botão daquela temperatura precisa estar gravado. Se não estiver,
o sistema usa a temperatura gravada mais próxima e informa o valor real para a Alexa.

## Problemas comuns

| Sintoma | Causa |
|---|---|
| "O dispositivo não está respondendo" | Agente do Mac desligado ou transmissor offline. Veja o Painel e a tela Atividade. |
| A vinculação falha na hora | URL pública errada ou sem HTTPS. Teste abrindo `URL/saude` no celular. |
| Aparelho some na descoberta | "Disponível na Alexa" está desmarcado nos Ajustes do aparelho. |
| Erro 403 nos logs da Lambda | A CLIMA_CHAVE mudou. Copie de novo da tela Alexa. |
