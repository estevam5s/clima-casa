# Clima Casa

Controle de ar-condicionado por infravermelho com o transmissor Tuya SRW-004 (NovaDigital/Smart Life).
Tem painel web, banco e login no Supabase, publicação na Vercel e Skill da Alexa.

- **Produção:** https://clima-casa-lac.vercel.app
- **Supabase:** projeto `Arcondicionado` (`elyqjdcsbfdvlsxomxen`, us-east-2)

## Como funciona

```
Navegador / Alexa
   → Vercel (painel + API + OAuth da Alexa)
   → Supabase (Postgres, Auth, pg_cron)
   ← agente no Mac (lê a fila de comandos)
   → SRW-004 (rede local)
   → ar-condicionado
```

- A **Vercel** não alcança a rede de casa. Ela grava o comando na tabela `fila_comandos` e espera até 8 s.
- O **agente** (este projeto rodando no Mac) pega a fila, dispara o infravermelho e responde.
  Ele também roda a agenda e marca os transmissores como online.
- Se o agente estiver offline, a Vercel tenta pela **nuvem Tuya** (conta Smart Life conectada).

## Login

Pelo Supabase Auth, só com e-mail e senha. Não existe cadastro: o cadastro público está desligado no projeto.
Só a conta com `app_metadata.role = "admin"` entra. A senha pode ser trocada em Configurações.

## Supabase

- **Esquema:** `supabase/schema.sql`. São 13 tabelas, todas com RLS ligado; o administrador só tem leitura direta.
- **Rotinas:** `supabase/cron-jobs.json`, 10 jobs de pg_cron aplicados com a skill `supabase-cron` (prefixo `clima_`):

| Rotina | Quando | O que faz |
|---|---|---|
| transmissores_offline | a cada 5 min | marca offline o transmissor sem sinal há 10 min |
| oauth_expirados | a cada 15 min | apaga códigos e tokens da Alexa vencidos |
| metricas_hora | de hora em hora | consolida comandos, falhas e origem do dia |
| alerta_ligado_12h | de hora em hora | alerta quando um ar fica ligado mais de 12 h |
| alerta_falhas | a cada 30 min | alerta quando há 3 ou mais falhas em 1 h |
| backup_diario | 2h (Brasília) | snapshot em JSON, mantém 14 |
| limpar_atividade | 3h30 | apaga atividade > 90 dias, alertas resolvidos e fila antiga |
| limpar_logs_cron | 3h45 | apaga execuções de cron > 7 dias |
| saude_banco | a cada 6 h | mede o tamanho do banco (limite de 500 MB do plano gratuito) |
| manutencao_semanal | domingo, 4h | ANALYZE das tabelas principais |

A tela **Supabase** do painel mostra as rotinas, as execuções, os alertas, as métricas e os backups.
Por ela também dá para pausar ou rodar cada rotina.

## Rodar o agente no Mac

```bash
./iniciar.sh                  # agente + painel local em http://localhost:8090
./instalar-servico.sh         # inicia sozinho quando você entra no Mac (recomendado)
```

O `.env` precisa de `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_DB_PASSWORD`.
Ele está no `.gitignore`; nunca faça commit dele.

## Publicar na Vercel

```bash
vercel deploy --prod --yes
```

Variáveis de produção: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD` e
`SUPABASE_DB_PORT=6543` (pooler em modo transação). A função roda em `cle1`, na mesma região do banco.

## Estrutura

```
api/index.py         entrada da Vercel (usa o backend)
backend/app/         FastAPI: db (psycopg), seguranca (Supabase Auth), clima, transmissor (fila/local/nuvem),
                     tuya_nuvem, alexa, agenda, rotas/
backend/supabase-ca.crt   CA raiz do Supabase (TLS verificado no pooler)
frontend/            React + Vite + Tailwind + supabase-js
supabase/            schema.sql e cron-jobs.json
alexa/               Lambda e passo a passo da Skill
```

## Limitações

- Gravar botões e procurar na rede exigem o agente do Mac, porque usam a rede local.
- O ar não informa o estado de volta. Se alguém usar o controle original, o painel fica desatualizado.
- O envio pela nuvem Tuya, com o Mac desligado, depende do transmissor aceitar código gravado pela nuvem.
  Isso só dá para confirmar depois de importar o transmissor da conta Smart Life.

## Projetos, cenas e relatórios (v3)

- **Projetos:** cada lugar (casa, escritório…) tem os próprios transmissores, aparelhos e cenas. O seletor da sidebar filtra todas as telas.
- **Cenas:** um toque executa vários comandos (tabela `cenas`).
- **Relatórios:** comandos por dia, horários de uso, temperaturas mais usadas e uso por aparelho.

## Alexa e Google Home pelo Sinric Pro

O agente do Mac conecta cada aparelho que tem `sinric_device_id` ao Sinric Pro (SDK `sinricpro`, tipo
"Window AC Unit"). Qualquer conta Alexa ou Google Home que ativar a skill "Sinric Pro" com a mesma
conta passa a controlar os aparelhos. Configure em **Integrações** (chave de API, App Key e App Secret) e
vincule cada dispositivo. Quando o ar muda por outro caminho, o agente avisa o Sinric.

A App Key/App Secret precisa ser a **mesma credencial** escolhida no dispositivo do portal Sinric.
Se não for, o portal mostra "Message signature mismatched".

## Interface

React + Tailwind (tokens no padrão shadcn) + framer-motion (sidebar que recolhe e abre ao passar o mouse,
transições) + recharts (gráficos) + three.js (ar-condicionado 3D no painel). Busca com ⌘K.

## Apps (v4)

| App | Onde | Como usar |
|---|---|---|
| **PWA** | https://clima-casa-lac.vercel.app | No celular: "Adicionar à tela inicial". No Chrome/Edge do computador: ícone de instalar na barra de endereço. |
| **Desktop** (Electron 45) | `apps/desktop` | `npm start` para testar; `npm run dist:mac` / `dist:win` / `dist:linux` gera o instalador em `apps/desktop/dist`. |
| **Android/iOS** (Expo SDK 58) | `apps/android` · https://expo.dev/accounts/estevam5s/projects/clima-casa | APK: `npx eas-cli@latest build -p android --profile preview`. Teste local: `npx expo start`. |

Os três usam o mesmo login do Supabase (só administrador) e a mesma API da Vercel.

## Agente do Mac (serviço)

`./instalar-servico.sh` copia o agente para `~/Library/Application Support/ClimaCasa` (o macOS não deixa serviços
lerem `~/Documents`) e registra o LaunchAgent `com.climacasa.servidor`. Ele inicia com o Mac e reinicia se cair.
Log: `~/Library/Logs/ClimaCasa.log`. Rode o script de novo depois de mudar o código do backend.
`./instalar-servico.sh status` mostra se está rodando.

## Sinric Pro automático

Aparelho novo marcado como "Disponível na Alexa" → dispositivo criado no Sinric e vinculado sozinho.
Aparelho apagado → dispositivo removido do Sinric. Para outra Alexa: tela **Alexa e Google** → QR Code
(abre a skill oficial `amazon.com.br/dp/B07ZT5VDT8`) → ativar com a conta Sinric.
