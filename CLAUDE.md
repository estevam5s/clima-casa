# CLAUDE.md — Clima Casa

Guia completo do projeto para quem (pessoa ou agente) for mexer nele. Leia inteiro antes da primeira mudança.
Tudo em **pt-BR**: código, nomes de variáveis, rotas, textos de interface e mensagens de erro.

---

## 1. O que é

**Clima Casa** controla ar-condicionados por **infravermelho** usando transmissores Wi-Fi **Tuya SRW-004**
(marca NovaDigital, app Smart Life). Ele grava os sinais do controle remoto original de cada ar e os reenvia
pelo transmissor, a partir de:

- painel web (PWA) em https://clima-casa-lac.vercel.app;
- app de celular (Expo/React Native) e app desktop (Electron);
- **Alexa e Google Home** via Sinric Pro, ou pela skill própria (Smart Home API v3);
- agenda, automações (gatilho → condições → ações), cenas e temporizadores.

Público: um administrador (dono da casa). Não existe cadastro: só login de quem tem `app_metadata.role = "admin"`
no Supabase Auth.

| Recurso | Endereço |
|---|---|
| Produção (web/PWA/API) | **https://app.zynio.com.br** (projeto Vercel `clima-casa`, região `cle1`); o endereço antigo https://clima-casa-lac.vercel.app continua no ar (apps Android/desktop usam ele) |
| Código (privado) | https://github.com/estevam5s/clima-casa |
| Releases (APK, DMG, EXE, AppImage) | https://github.com/estevam5s/clima-casa/releases |
| Banco, Auth, cron | Supabase, projeto **Arcondicionado**, ref `elyqjdcsbfdvlsxomxen`, região us-east-2 |
| App celular | https://expo.dev/accounts/estevam5s/projects/clima-casa (Expo SDK 58) |
| Alexa/Google | https://portal.sinric.pro (dispositivo "Ar do escritório" `6af888eb7d04ce9fd64d6777`) |
| Painel local do agente | http://localhost:8090 (a porta 8080 do Mac é de outro app; não use) |
| Site institucional | **https://zynio.com.br** (www redireciona; Next.js em `site/`, projeto Vercel `clima-escritorio-site`, região gru1) |
| Domínio | zynio.com.br no Registro.br (DNS do Registro.br: A @ → 216.198.79.1 e 64.29.17.1; CNAME www e app → vercel-dns) |
| Bloqueio de bots | Cloudflare Turnstile, widget "Zynio - Clima Escritorio" (hostnames zynio.com.br e subdomínios, os .vercel.app e localhost) |

---

## 2. Arquitetura

```
 Navegador / PWA / Desktop / App celular / Alexa / Google
              │ HTTPS (Bearer = token do Supabase Auth)
              ▼
 ┌──────────────────────────────┐        ┌───────────────────────────────┐
 │ Vercel (papel "nuvem")        │        │ Supabase                      │
 │ FastAPI em api/index.py       │◄──────►│ Postgres (pooler 6543, TLS)   │
 │ + estáticos do frontend       │  SQL   │ Auth (login admin)            │
 │ + OAuth e diretivas da Alexa  │        │ pg_cron (10 rotinas clima_*)  │
 └──────────────┬────────────────┘        └──────────────▲────────────────┘
                │ grava em fila_comandos                 │ lê a fila (poll ~1 s),
                ▼                                        │ heartbeat, eventos
 ┌───────────────────────────────────────────────────────┴────────────────┐
 │ Agente no Mac (papel "agente", LaunchAgent com.climacasa.servidor)     │
 │ mesmo FastAPI + threads: fila, Sinric Pro (WebSocket), agenda,         │
 │ automações, temporizadores, status dos transmissores                   │
 └──────────────┬─────────────────────────────────────────────────────────┘
                │ rede local (tinytuya, TCP 6668, protocolo 3.5)
                ▼
        SRW-004 (192.168.0.187) ── infravermelho ──► ar-condicionado
```

**Por que existe o agente:** a Vercel não alcança a rede de casa. Todo comando que nasce na nuvem vira uma
linha em `fila_comandos`; o agente executa e grava o resultado; a Vercel espera até 8 s. Se o agente estiver
offline (sem heartbeat há 45 s), a Vercel tenta a **nuvem Tuya** (conta Smart Life), que só funciona se o
transmissor aceitar o código gravado pela nuvem.

O **mesmo código** roda nos dois papéis. `transmissor.PAPEL` é `"nuvem"` quando existe a variável `VERCEL`,
senão `CLIMA_PAPEL` (padrão `"agente"`). Só o agente inicia as threads (fila, Sinric, agenda).

---

## 3. Estrutura de pastas

```
ar-controle/
├── CLAUDE.md                ← este arquivo
├── README.md                visão geral curta
├── .env                     SEGREDOS (gitignored) — ver §5
├── api/index.py             entrada da Vercel (importa backend/app/main.py)
├── vercel.json              build, rewrites, headers de segurança, região cle1
├── requirements.txt         deps Python da Vercel (sem sinricpro)
├── iniciar.sh               roda o agente pelo terminal (dev)
├── instalar-servico.sh      instala/atualiza o agente como serviço do macOS
├── publicar-vercel.sh       publica na Vercel a partir de cópia sem .git (OBRIGATÓRIO, ver §13)
├── backend/
│   ├── requirements.txt     deps do agente (inclui sinricpro)
│   ├── supabase-ca.crt      CA raiz do pooler do Supabase (TLS verificado)
│   ├── static/              build do frontend (gerado, gitignored)
│   └── app/
│       ├── main.py          FastAPI, middleware (CSRF/CSP/HSTS), ciclo de vida, SPA
│       ├── db.py            psycopg3 + pool + "?"→"%s", cfg()/set_cfg(), registrar()
│       ├── seguranca.py     valida o Bearer no Supabase Auth (cache 60 s), exige role admin
│       ├── clima.py         estado do ar → código IR (aplicar), rótulos, botões extras
│       ├── transmissor.py   envio local/fila/nuvem, gravação (aprender), descoberta, laço do agente
│       ├── tuya_nuvem.py    login Smart Life por QR, Local Key, envio pela nuvem Tuya
│       ├── sinric.py        Sinric Pro: REST (dispositivos, criar/apagar) + WebSocket (SDK) no agente
│       ├── alexa.py         skill própria: Discovery, Power, Thermostat, SceneController, ReportState
│       ├── automacao.py     automações, eventos, temporizadores, ciclo periódico
│       ├── agenda.py        laço de 20 s: agendamentos, automações, status dos transmissores
│       ├── cripto.py        AES-256-GCM ("enc:v1:") para segredos em repouso, chave em CLIMA_CHAVE_MESTRA
│       ├── firewall.py      listas de IP/CIDR, país, assinaturas de ataque, limite de taxa, bloqueio progressivo
│       ├── relatorio.py     consolida o relatório (montar) + exportadores pdf/docx/xlsx/csv/html/xml/json/md
│       ├── exportar.py      exportador genérico (resumo + seções de tabela + gráfico) nos mesmos 8 formatos
│       ├── seguranca_relatorio.py  dados da tela /seguranca (mapa, IPs, países, rotas) e o relatório de segurança
│       ├── notificacoes.py  central de notificações persistida (condições sincronizadas + eventos)
│       ├── clima_externo.py temperatura/umidade reais de fora (Open-Meteo, sem chave) para o display do ar
│       └── rotas/
│           ├── api.py       toda a API do painel (/api/…)
│           └── alexa.py     OAuth 2.0 da skill própria + /alexa/diretiva
├── frontend/                React 18 + Vite 5 + Tailwind 3 + framer-motion + recharts + three
│   ├── public/              manifest.webmanifest, sw.js (PWA), ícones
│   └── src/
│       ├── main.jsx         rotas, proteção de login, registro do service worker
│       ├── api.js           fetch com Bearer, ErroApi, MODOS, VENTILACAO, DIAS, rotuloOrigem
│       ├── supabase.js      cliente supabase-js (config vem de /api/supabase-config)
│       ├── contexto.jsx     projeto selecionado + sessão (ProjetoProvider/useProjeto)
│       ├── apps.js          links de download do release
│       ├── components/      Layout (sidebar/cabeçalho/⌘K), ui (design system), ArCartao, Cena3D, FormAparelho
│       └── pages/           uma por rota (ver §8)
├── supabase/
│   ├── schema.sql           esquema completo, idempotente (rodar inteiro de novo é seguro)
│   └── cron-jobs.json       10 rotinas pg_cron (aplicadas pela skill supabase-cron)
├── alexa/
│   ├── GUIA.md              passo a passo da skill própria (Amazon + AWS Lambda)
│   └── lambda/index.mjs     Lambda que repassa as diretivas ao /alexa/diretiva
├── apps/
│   ├── icone-1024.png       ícone mestre de todos os apps
│   ├── desktop/             Electron 45 (src/main.js, preload.js, offline.html)
│   └── android/             Expo SDK 58 (tem CLAUDE.md/AGENTS.md próprios — leia antes de mexer)
├── docs/
│   ├── MANUAL.md            manual do usuário (passo a passo: Smart Life, Smart IR, Alexa/Sinric, uso)
│   ├── Manual-Clima-Casa.pdf  o mesmo manual em PDF (regerar com docs/gerar-pdf.sh)
│   └── prompt/              prompts de design usados como referência (sidebar)
```

---

## 4. Como executar

### Requisitos
- Python **3.13** (o 3.15 do Homebrew não tem wheel do psycopg-binary). Use `uv`.
- Node 20+ (testado no 25), npm.
- Vercel CLI, `gh` (GitHub CLI) e `eas-cli` (via `npx eas-cli@latest`).

### Agente (backend) no Mac — desenvolvimento
```bash
uv venv .venv --python 3.13 && uv pip install --python .venv/bin/python -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..   # gera backend/static
cd backend && ../.venv/bin/python -m app.main            # http://127.0.0.1:8090
```
Variáveis úteis: `CLIMA_PORTA` (8090), `CLIMA_HOST` (127.0.0.1; `0.0.0.0` para a rede local),
`CLIMA_PAPEL=nuvem` (simula a Vercel localmente: não abre threads, usa a fila),
`CLIMA_SINRIC_DEBUG=1` (grava a última mensagem crua do Sinric em `data/sinric-ultima-msg.json`).

**Cuidado:** o serviço instalado já ocupa a 8090. Para testar outra instância use outra porta
(`CLIMA_PORTA=8793 CLIMA_PAPEL=nuvem …`) e encerre depois.

### Agente como serviço (produção no Mac)
```bash
./instalar-servico.sh           # copia para ~/Library/Application Support/ClimaCasa e registra o LaunchAgent
./instalar-servico.sh status    # estado + HTTP local
./instalar-servico.sh remover
tail -f ~/Library/Logs/ClimaCasa.log
```
O macOS (TCC) **não deixa serviços lerem ~/Documents**, por isso o agente roda de uma cópia.
**Depois de qualquer mudança no backend ou no frontend, rode `./instalar-servico.sh` de novo.**

### Frontend em modo dev
```bash
cd frontend && npm run dev      # Vite em :5173, proxy de /api e /oauth para :8090
```

### Publicar
```bash
cd frontend && npm run build && cd ..
./publicar-vercel.sh            # NUNCA "vercel deploy" direto na pasta com .git (ver §13)
./instalar-servico.sh           # atualiza o agente
git add -A && git commit && git push
```

---

## 5. Configuração e segredos

`ar-controle/.env` (gitignored, permissão 600). **Nunca** commitar, imprimir, colar em issue ou no bundle.

| Variável | Uso | Onde é usada |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | agente, Vercel, front (via API) |
| `SUPABASE_PUBLISHABLE_KEY` | chave pública | front e app (é pública por design) |
| `SUPABASE_SECRET_KEY` | admin do Auth | agente e Vercel (servidor): criar/editar contas, link mágico da biometria |
| `SUPABASE_ACCESS_TOKEN` | Management API (`sbp_…`) | aplicar schema/cron |
| `SUPABASE_DB_PASSWORD` | senha do Postgres | agente e Vercel |
| `SUPABASE_DB_HOST` / `SUPABASE_DB_PORT` | opcionais | padrão `aws-1-us-east-2.pooler.supabase.com`, 5432 (agente) / 6543 (Vercel) |
| `TUYA_DEVICE_ID`, `TUYA_LOCAL_KEY`, `TUYA_IP`, `TUYA_VERSION` | legado da v1; migrados para `hubs` na 1ª execução | agente |
| `SINRIC_API_KEY`, `SINRIC_APP_KEY`, `SINRIC_APP_SECRET` | Sinric Pro (copiados para `config.sinric` na 1ª execução) | agente |
| `VERCEL_TOKEN` | deploy | `publicar-vercel.sh` |
| `CLIMA_CHAVE_MESTRA` | chave AES-256 (32 bytes base64) dos segredos em repouso | agente **e** Vercel (a mesma!). Perder = reconectar Smart Life, Sinric e Alexa |
| `CLIMA_CONFIAR_PROXY` | opcional: confiar em `x-forwarded-for` fora da Vercel | firewall |

Vercel (produção) tem só: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_PORT=6543`,
`CLIMA_CHAVE_MESTRA` e `SUPABASE_SECRET_KEY` (para criar contas e o login com biometria; nunca no frontend).
O app Expo tem `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`
(em `apps/android/.env` e em `eas.json`; todas públicas).

Configurações de runtime ficam na tabela **`config`** (chave → JSON): `modo_envio` (auto/local/nuvem),
`nome_casa`, `tuya_conta` (token Smart Life), `sinric` (credenciais + ids descobertos + `automatico`),
`sinric_status`, `alexa` (client_id/secret, chave da Lambda, url pública), `agente_visto_em` (heartbeat),
`tarifa_kwh` (R$/kWh dos relatórios), `white_label` + `white_label_historico` (marca própria), `seguranca` (regras do
firewall). As chaves de `db.CHAVES_SENSIVEIS` (`tuya_conta`, `tuya_qr_pendente`, `sinric`, `alexa`, `segredo_sessao`)
e `hubs.local_key` são gravadas cifradas (`enc:v1:…`, AAD `cfg:<chave>` / `hub:local_key`); `cripto.migrar()` cifra
valores antigos na partida. `db.cfg/set_cfg` já cifram e decifram: não leia `config.valor` direto.

Arquivos de credenciais fora do repositório (pasta pai `projeto-deison/`): `supabase.md`, `portal.sinric.pro.md`,
`token-vercel.md`, `github.txt`. Ler só quando necessário, sempre mascarando ao exibir.

---

## 6. Banco de dados (Supabase)

Esquema em `supabase/schema.sql` (idempotente). Aplicar pela Management API
(`POST /v1/projects/{ref}/database/query` com o `SUPABASE_ACCESS_TOKEN`). Datas em **epoch segundos** (bigint) e
booleanos de negócio como 0/1, exceto nas tabelas das rotinas (timestamptz/boolean).

| Tabela | Conteúdo |
|---|---|
| `config` | chave/valor JSON (ver §5) |
| `projetos` | lugares (casa, escritório): nome, endereço, cor |
| `hubs` | transmissores SRW-004: id Tuya, ip, local_key, versão, `control_type` (1 = DPS 201/202, 2 = DPS 1–13), funções da nuvem, online, `problema`, `reparado_em`, projeto |
| `aparelhos` | ares: nome (é o nome falado na Alexa), cômodo, marca, hub, faixa de temperatura, modos, estado atual, `ligado_desde`, `alexa`, `sinric_device_id`, projeto |
| `codigos` | sinais IR gravados (base64) por aparelho; chave `modo_temp_vent`, `desligar` ou `extra_<nome>` |
| `cenas` | lista de ações (JSON) executadas juntas |
| `agendamentos` | dias + hora + ação |
| `automacoes` | gatilho, condições e ações (JSON), contagem de disparos |
| `temporizadores` | "desligar em X min" (um por aparelho) |
| `atividade` | todo comando/evento: origem, ação, ok, detalhe |
| `fila_comandos` | ponte Vercel → agente: `enviar`, `aprender`, `descobrir`, `evento`, `reparar` |
| `oauth_codigos`, `oauth_tokens` | OAuth da skill própria (só hashes) |
| `metricas_diarias`, `alertas`, `backups`, `saude_sistema` | preenchidas pelas rotinas pg_cron |
| `seguranca_ips` | IP/CIDR `bloqueado`/`permitido`, `automatico`, `ocorrencias`, `expira_em` (firewall) |
| `seguranca_eventos` | `acesso` (1 por IP a cada 10 min), `login_falhou`, `login_ok`, `scanner`, `rate_limit`, `auth_negado`, `ip_bloqueado_auto`…, com `pais`, `cidade`, `regiao`, `lat`, `lon` (cabeçalhos `x-vercel-ip-*`) |
| `notificacoes` | central de notificações: `chave` única, tipo, gravidade, título, detalhe, link, `acao` (jsonb), lida/arquivada/resolvida, ocorrências |
| `cron_log`, `cron_job_registry` | log/registro das rotinas (skill supabase-cron) |

`aparelhos.potencia_w` (padrão 1000) alimenta o consumo estimado dos relatórios.

**RLS** ligado em tudo; política `admin_le` (só leitura para o admin) nas tabelas de negócio. O backend conecta
como dono via pooler e não passa pelo RLS. O front **não** lê o banco direto: tudo passa pela API.

### Rotinas pg_cron (prefixo `clima_`, horários em UTC)
| Rotina | Quando | O que faz |
|---|---|---|
| transmissores_offline | */5 min | `online = 0` se `visto_em` > 10 min |
| oauth_expirados | */15 min | limpa códigos/tokens OAuth vencidos |
| metricas_hora | :05 de hora em hora | consolida `metricas_diarias` do dia (fuso de Brasília) |
| alerta_ligado_12h | :20 de hora em hora | alerta de ar ligado > 12 h; resolve ao desligar |
| alerta_falhas | */30 min | alerta com 3+ falhas em 1 h |
| backup_diario | 05:00 UTC | snapshot JSON (mantém 14) |
| limpar_atividade | 06:30 UTC | atividade > 90 d, alertas resolvidos > 30 d, fila > 1 d, eventos de segurança > 30 d, IPs vencidos, notificações arquivadas > 60 d |
| limpar_logs_cron | 06:45 UTC | `cron.job_run_details` > 7 d, `cron_log` > 30 d |
| saude_banco | */6 h | tamanho do banco (limite 500 MB do plano gratuito) |
| manutencao_semanal | domingo 07:00 UTC | ANALYZE |

Alterar rotinas: editar `supabase/cron-jobs.json` e rodar
`node ~/.claude/skills/supabase-cron/scripts/setup.mjs --jobs "$PWD/supabase/cron-jobs.json" --prefix clima_`.
Depois rode o SQL de cada rotina uma vez para validar. A tela **Supabase** do painel permite pausar e rodar na hora.

---

## 7. Fluxos principais

### 7.1 Mudar o estado de um ar (`clima.aplicar`)
1. Monta o estado desejado (ligado, modo, temperatura, ventilação) limitado à faixa do aparelho.
2. Escolhe o código: exato `modo_temp_vent` → mesmo modo/temperatura com outra ventilação → temperatura gravada
   mais próxima no mesmo modo (o estado salvo passa a ser o do código enviado). Desligar usa `desligar`.
3. `transmissor.enviar(hub, código, contexto)`: no agente envia local; na nuvem enfileira e espera 8 s;
   se falhar e `modo_envio = auto`, tenta a nuvem Tuya.
4. Atualiza `aparelhos`, registra em `atividade`, avisa o Sinric (para Alexa/Google mostrarem o estado) e, se
   mudou de desligado↔ligado, chama `automacao.evento`.

O ar **não** informa estado de volta: se alguém usar o controle original, o sistema fica desatualizado.

### 7.2 Gravar um botão (aprender)
`POST /api/aparelhos/{id}/aprender {chave}` → linha `aprender` na fila → o agente coloca o SRW-004 em modo
estudo (`receive_button`, 30 s). Se `control_type` ainda não é conhecido, tenta tipo 2 e depois 1 e grava o que
funcionou. A interface acompanha por `GET /api/gravacoes/{job}`. **Só funciona com o agente na mesma rede.**

### 7.3 Transmissores (Tuya)
- Descoberta: `tinytuya.deviceScan` (UDP) no agente.
- Local Key: login na conta Smart Life por QR Code (`tuya_nuvem`, cliente público da integração do Home
  Assistant `HA_3y9q4ak7g4ephrvke`) → "Importar um" ou "Importar todos" em Transmissores.
- Protocolo **3.5**, porta TCP 6668. `status()` devolve "json obj data unvalid" (normal em IR).
- Vários transmissores e vários ares por projeto são suportados; cada ar aponta para um hub.
- **Reconfiguração automática** (`transmissor.autorreparar`, chamada a cada ~60 s no agente e no botão
  "Reconectar agora" → `POST /api/hubs/reparar`, que vai pela fila tipo `reparar`): o `status()` do SRW-004 diz
  o que houve — `900` = ok (IR não tem estado), `914` = chave errada (foi pareado de novo), `905/901` = não
  responde no IP. Rede/IP: varre a LAN pelo ID e grava o IP novo. Chave: busca a Local Key nova na conta Smart Life
  (precisa estar conectada em Configurações). Se o pareamento gerou **outro ID** e há exatamente um transmissor
  novo na conta, migra o cadastro e os aparelhos para ele. Quando não consegue, grava `hubs.problema` (mostrado na
  tela) com a instrução. Também confere a chave dos online a cada 10 min e tenta reparar antes de um envio local
  falhar por IP. Tudo vai para a Atividade como "Transmissor reconfigurado sozinho".
- Mudar de Wi-Fi: só parear de novo no Smart Life (2,4 GHz); o Mac tem que estar na mesma rede.

### 7.4 Alexa e Google Home via Sinric Pro (caminho principal)
- O agente abre o WebSocket com o SDK `sinricpro` (v6) e registra cada aparelho com `sinric_device_id` como
  "Window AC Unit": liga/desliga, modo (COOL/HEAT/AUTO/ECO/OFF), temperatura, ventilação (0–3).
- O dispositivo no portal **precisa usar a mesma credencial** (App Key/Secret) do `.env`. Se não, o portal mostra
  "Message signature mismatched" (aconteceu com o dispositivo antigo do ESP32, já apagado).
- Automático (`config.sinric.automatico`): aparelho novo com "Disponível na Alexa" é criado no Sinric
  (`POST /api/v1/devices` com `productId`, `roomId`, `accessKeyId`) e apagado junto com o aparelho.
- Plano gratuito do Sinric: **3 dispositivos**. Hoje: 1 em uso.
- Outra Alexa: app Alexa → skill **Sinric Pro** (`amazon.com.br/dp/B07ZT5VDT8`) → entrar com a mesma conta.
  A tela "Alexa e Google" tem QR Code. A Amazon exige essa aprovação manual do dono da conta Alexa.

### 7.5 Skill própria (alternativa, sem limite de dispositivos)
OAuth 2.0 (Auth Code Grant) em `/oauth/autorizar` (tela React) + `/oauth/token`; diretivas em `/alexa/diretiva`
chamadas pela Lambda (`alexa/lambda/index.mjs`, header `X-Clima-Chave`). Expõe aparelhos (AIR_CONDITIONER) e
**cenas** (SCENE_TRIGGER, "Alexa, ativar Dormir"). Ainda depende de o dono criar a skill e a Lambda (`alexa/GUIA.md`).

### 7.6 Automações, temporizadores, agenda, cenas
- **Automações** (`automacao.py`): gatilhos `ligou`/`desligou` (com filtro de origem: alexa, sinric, painel,
  agenda, cena), `ligado_ha` (N min, uma vez por vez que liga) e `horario`; condições de dias e janela de horário
  (pode virar a meia-noite); ações `aparelho`, `cena`, `desligar_apos`. Ações de automação usam origem
  `automacao:<nome>` e **não** disparam outras automações (evita laço). Na Vercel o evento vai pela fila.
- **Temporizadores**: um por aparelho; o ciclo do agente executa os vencidos.
- **Agenda**: dias + HH:MM, checada a cada 20 s no agente (fuso local do Mac).
- **Cenas**: várias ações em sequência; cada falha é independente.

### 7.7 Usuários, permissões, 2FA e biometria
- `backend/app/acesso.py`: papéis (dono > admin > subadmin > operador > visualizador, ou personalizado), 14 permissões
  e `REGRAS` por rota (método + caminho do FastAPI → permissão). `seguranca.exigir_login` (async) valida o token,
  carrega `usuarios`, aplica a regra da rota e o escopo de projetos (`projetos`: "*" ou lista de ids). As listas usam
  `acesso.filtro_sql(...)`/`_escopo(...)` e as rotas por id conferem o projeto dono do item (`checar_escopo`).
  **Nova rota que muda dados? Confira se cai numa regra de `REGRAS`** (rota não listada que não seja GET exige
  `configuracoes.gerenciar`). O 1º admin antigo (`app_metadata.role = admin`) vira "dono" sozinho.
- Contas: `rotas/contas.py` usa a API admin do Supabase (precisa `SUPABASE_SECRET_KEY`, que está **só** nas variáveis
  da Vercel e no `.env`). Ninguém dá papel/permissão/projeto que não tem; o dono não pode ser rebaixado/apagado.
  "Começar do zero" cria um projeto vazio para a pessoa. Senha provisória → `exige_troca_senha` → tela TrocarSenha.
- Google Authenticator: MFA TOTP **nativo do Supabase** (supabase-js `mfa.enroll/challengeAndVerify/unenroll`). Com
  fator verificado, o backend só aceita token `aal2` (resposta 401 com cabeçalho `X-Clima-2FA: necessario` → o login
  pede o código). Admin remove o fator de quem perdeu o celular (`DELETE /api/usuarios/{id}/2fa`).
- Biometria: passkeys WebAuthn (`webauthn` 3.0.1 no backend, `frontend/src/webauthn.js`). RP ID = `zynio.com.br` quando o
  host é o domínio novo (vale para app.zynio.com.br), senão o próprio host (clima-casa-lac.vercel.app, localhost). Login com biometria abre a sessão via link mágico emitido no
  servidor e grava o `session_id` em `sessoes_fortes` (vale como segundo fator). Tabelas: `usuarios`, `passkeys`,
  `webauthn_desafios`, `sessoes_fortes`. Perfil (nome, cargo, telefone, bio, foto) agora é por usuário em `usuarios`.
- Teste de biometria sem sensor: Playwright + CDP `WebAuthn.addVirtualAuthenticator` (já feito, passou).
- Limitação: o app Android entra direto no Supabase e ainda não tem a tela do código do autenticador.

### 7.8 Autenticação (sessão)
Front e apps fazem login no Supabase Auth (e-mail + senha; cadastro público **desligado** no projeto). Cada chamada
manda `Authorization: Bearer <access_token>`; `seguranca.usuario_admin` valida no `/auth/v1/user` (cache 60 s) e
exige `app_metadata.role == "admin"`. Rotas públicas: `/api/supabase-config`, `/saude`, `/oauth/token`,
`/api/oauth/validar`, `/alexa/diretiva` (protegida pela chave da Lambda + token OAuth).
Trocar a senha: tela Configurações (reautentica e chama `updateUser`).

---

## 8. Interface web

Rotas (`frontend/src/main.jsx`), todas protegidas exceto `/login`:

| Rota | Tela |
|---|---|
| `/` | Painel: faixa de métricas, 3D (Three.js) com controle rápido, integrações, gráfico 14 d, aparelhos, atividade |
| `/projetos` | projetos (lugares) com resumo e troca rápida |
| `/relatorios` | período livre e por aparelho; horas/kWh/custo estimados, comparação com o período anterior, mapa dia×hora, origens, falhas; exportar em 8 formatos |
| `/aparelhos`, `/aparelhos/:id` | lista (grade/lista, filtros, desligar todos) e detalhe (mostrador, modos, botões, gravação, temporizador, histórico, ajustes) |
| `/cenas` | cenas |
| `/automacoes` | automações com modelos prontos e temporizadores ativos |
| `/agendamentos` | agenda com grade da semana e próxima execução |
| `/transmissores` | SRW-004: status, importar um/todos, procurar na rede, aparelhos de cada um |
| `/integracoes` | Sinric Pro (credenciais, vínculo, criar no Sinric, conectar outra Alexa por QR) |
| `/comandos-alexa` | comandos de voz gerados por aparelho + receitas de Rotinas |
| `/alexa` | skill própria (URLs OAuth, chaves, passo a passo) |
| `/supabase` | rotinas, uso do banco, alertas, gráfico, backups |
| `/atividade` | linha do tempo por dia, ao vivo, filtros, exportar CSV |
| `/seguranca` | postura, globo 3D de acessos (Three.js + world-atlas), eventos ao vivo, IPs com risco e ações, países, rotas atacadas, bloqueios, regras e relatório de segurança em 8 formatos |
| `/configuracoes?aba=` | `perfil` (foto por upload ou link, nome, cargo, telefone, sobre, troca de e-mail e de senha com a senha atual), `geral` (Smart Life, envio), `aparencia` (tema), `marca` (white label, 34 opções), `seguranca` (firewall), `contas` (senha), `sistema` (backup, agente) |
| `/mensagens` | caixa de entrada do site: filtros (entrada, não lidas, contato, novidades, respondidas, arquivadas), busca, leitura com notas internas, responder por e-mail, marcar respondida/lida, arquivar, apagar, ações em lote, exportar CSV; contador de não lidas no menu |
| `/apps` | downloads com logos reais (simple-icons), detecção do sistema e da arquitetura, tamanho e SHA-256 de cada arquivo, QR Code do APK, PWA, tabela de recursos. Dados do release em `frontend/src/release.json` (**rode `scripts/gerar-release-json.sh` depois de cada release**) |
| `/oauth/autorizar` | consentimento da vinculação de conta da Alexa |

### Cabeçalho, notificações e 3D
- O cabeçalho **não repete o título da página**: mostra a barra de status (projeto, agente online, ares ligados,
  transmissores, data/hora) vinda de `GET /api/notificacoes` → `status`, buscada por `useCentral()` a cada 30 s.
- Notificações (`components/Notificacoes.jsx`): abas Todas/Não lidas/Importantes/Segurança, marcar lidas, limpar
  (uma, lidas, resolvidas, todas), ações (resolver alerta, desbloquear IP, reconectar transmissor, abrir tela) e
  preferências (tipos ocultos, som, contador só importantes, limpar resolvidas depois de X h) salvas no banco.
  Condições (`cond:*`) se resolvem sozinhas quando o problema some; eventos (IP bloqueado, IP novo no login,
  transmissor reconfigurado) usam `notificacoes.notificar()`.
- `Cena3D`: display sempre aceso (desligado = temperatura real de fora + relógio; ligado = ajuste com contagem
  animada, modo, ventilação, EXT), faixa de luz e névoa na cor do modo. A temperatura de fora vem de
  `/api/clima-externo` (endereço do projeto → `config.clima_local` → IP de quem abriu o painel).
- Renomear um aparelho com `sinric_device_id` renomeia também no Sinric (`PUT /api/v1/devices` com o `id` no corpo).

### Turnstile (bloqueio de bots)
- `backend/app/turnstile.py` confere o token em `/api/auth/entrar`, `/api/auth/esqueci` (o "esqueci a senha" agora passa
  pelo servidor) e `/api/site/contato`. Chaves: `TURNSTILE_SITE_KEY` (pública, sai em `/api/supabase-config`) e
  `TURNSTILE_SECRET_KEY` (servidor; `.env` e Vercel). Sem a secreta, a checagem é pulada (dev).
- Widgets: `frontend/src/components/Turnstile.jsx` (login/esqueci) e `site/components/Turnstile.jsx` (formulários),
  modo `interaction-only`: invisível para a maioria. CSP libera `https://challenges.cloudflare.com` (script, frame, connect).
- O app Android entra direto no Supabase e não passa pelo Turnstile (o Supabase-level captcha está desligado de propósito).

### Prévias de compartilhamento (redes sociais)
- Site: `lib/seo.js` (`meta()`) em cada página: title, description, canonical, Open Graph completo (imagem 1200×630 JPEG com
  width/height/alt/secure_url), Twitter `summary_large_image`, JSON-LD (Organization, WebSite, SoftwareApplication), manifest e ícones.
- Banners em `site/public/og/*.jpg` (um por página, ~60–90 KB, bom para WhatsApp) gerados por
  `node scripts/gerar-og.mjs` a partir de `scripts/og-modelo.html` + capturas reais. **Rode de novo ao mudar textos/telas.**
- Sistema: meta tags em `frontend/index.html` (com `noindex`) e `frontend/public/og.jpg`.

### Site institucional (`site/`)
- Next.js 16 (App Router, JS) + GSAP 3.15 (ScrollSmoother, ScrollTrigger, SplitText) + lucide-react + simple-icons.
- Layout e efeitos seguem o modelo de agência (Agenko) **recriados em código próprio** (`app/globals.css`,
  `components/Efeitos.jsx`): `.text-anm` (letras entram da direita), `.pf_fadeup`, `.pf_zoomIn`, `.contar`,
  rolagem suave, botão com texto que vira, espirais em SVG (`Espiral.jsx`). Não copie arquivos do template.
- Conteúdo todo em `lib/dados.js` e só com fatos reais do sistema. Imagens em `public/telas` são capturas reais
  (sem IP, e-mail ou cidade: recorte/borre antes de publicar).
- Formulários (contato e novidades) fazem `POST /api/site/contato` no sistema: rota pública com CORS só para
  `CLIMA_SITE_ORIGENS` (padrão: o domínio do site e localhost:3100), limite de 5 por IP/hora, grava em
  `site_mensagens` e cria notificação.
- "Entrar no sistema" aponta para a raiz do sistema (não para /login): logado entra direto; o /login também
  redireciona na hora se já houver sessão válida no navegador.
- Menu do celular é uma tela cheia (`menu-movel`); submenus do desktop abrem um por vez (estado, não :hover).
- Rodar: `cd site && npm install && npm run dev` (porta 3100). Publicar: `site/publicar.sh` (cópia sem .git).
- O sistema tem o botão **Voltar ao site** (menu lateral, cabeçalho e login), endereço em `frontend/src/site.js`
  (`VITE_SITE_URL` sobrescreve).

### Design system (não fugir dele)
- Tokens HSL em `src/index.css` (`--background`, `--card`, `--muted`, `--border`, `--primary` = teal da marca
  `#0f766a`). Tema por classe: `html.dark` (Tailwind `darkMode: 'class'`), escolhido em `src/tema.jsx`
  (claro/escuro/sistema, `localStorage 'clima-tema'`) e aplicado antes da pintura por `public/tema.js`.
  A marca própria (`src/marca.jsx`) sobrescreve `--primary` etc. em tempo de execução; não fixe cores da marca. Tailwind mapeia (`bg-card`, `text-muted-foreground`…).
- Classes globais: `.cartao` (borda 1 px, sem sombra), `.campo`, `.rotulo`, `.ajuda`, `.tabela`, `.titulo-secao`.
- Componentes em `components/ui.jsx`: `Botao`, `Cabecalho`, `FaixaMetricas` (métricas num cartão com divisórias,
  a 1ª em destaque, números animados), `Dial` (mostrador de temperatura), `Secao`, `Selo`, `Ponto`, `Interruptor`,
  `Modal`, `Vazio`, `Carregando`, `Esqueleto`, `Aviso`, `useToast`, `useDados`.
- Layout: sidebar recolhida em 64 px que abre ao passar o mouse (framer-motion; alfinete fixa), grupos de rotas,
  seletor de projeto, cabeçalho fixo com busca ⌘K e alertas. Páginas de conteúdo centralizadas em `max-w-5xl`.
- Animação com função: entrada escalonada curta, indicadores com `layoutId`, números que contam. Respeitar
  `prefers-reduced-motion` (já tratado no CSS, no 3D e no `NumeroAnimado`).
- **Sem cara de IA**: nada de gradiente decorativo, emoji como ícone, pílulas "AI-powered", cartões iguais com
  ícone colorido, sombra em tudo, travessões na copy ou números inventados. Sombra só no que flutua (menu, modal,
  toast, dica de gráfico) com comentário `/* marca: … */`. Rodar o auditor antes de entregar:
  `node ~/.claude/skills/painel-senior/scripts/auditar.mjs frontend/src` (meta: ≥ 98).
- Copy: título com contexto, verbo no botão, erro que diz o que fazer.

---

## 9. API (resumo)

Prefixo `/api`, JSON, Bearer obrigatório (exceto as públicas de §7.7). Erros: `{"detail": "mensagem em pt-BR"}`;
validação vira 422 com "Confira o(s) campo(s): …".

- **Sessão**: `POST /auth/entrar` (login pelo backend, com bloqueio por e-mail/IP), `GET /supabase-config`, `GET /sessao`, `POST /sessao/registrar-login`
- **Relatórios**: `GET /relatorios/completo?dias=|inicio=&fim=&projeto_id=&aparelho_id=`, `GET /relatorios/exportar?formato=pdf|docx|xlsx|csv|html|xml|json|md&…`
- **Notificações**: `GET /notificacoes?filtro=todas|nao_lidas|importantes|seguranca` (inclui `status` do cabeçalho), `POST /notificacoes/{id}/lida`, `POST /notificacoes/ler-todas`, `DELETE /notificacoes/{id}` (limpa uma), `POST /notificacoes/limpar?somente=todas|lidas|resolvidas`, `POST /notificacoes/{id}/acao`, `PUT /notificacoes/preferencias`, `GET /notificacoes/historico`
- **Segurança (tela)**: `GET /seguranca/resumo?dias=`, `GET /seguranca/relatorio?formato=&dias=`, `DELETE /seguranca/eventos?dias=`
- **Mensagens do site**: `GET /site/mensagens?filtro=&busca=`, `PUT /site/mensagens/{id}`, `POST /site/mensagens/lote`, `DELETE /site/mensagens/{id}`, `GET /site/mensagens/exportar`
- **Perfil**: `GET|PUT /perfil`, `POST /perfil/avatar` (`dados` = data URL ou `url` = link; o servidor baixa com proteção SSRF, usa og:image se for página, recorta 256 px e regrava em WEBP), `DELETE /perfil/avatar`. Fica em `config.perfil_admin`.
- **Outros**: `GET /clima-externo?projeto_id=`, `GET /apps/qr?alvo=android|site`
- **Marca e segurança**: `GET /marca` (pública), `PUT /marca`, `GET /marca/historico`, `POST /marca/historico/{i}/restaurar`, `POST /marca/padrao`; `GET|PUT /seguranca`, `GET|POST /seguranca/ips`, `DELETE /seguranca/ips/{id}`, `GET /seguranca/eventos`
- **Painel e dados**: `GET /painel?projeto_id=`, `GET /metricas?dias=`, `GET /relatorios?dias=&projeto_id=`,
  `GET /atividade?origem=&aparelho_id=&falhas=&antes=&limite=`, `GET /alertas`, `POST /alertas/{id}/resolver`
- **Aparelhos**: `GET|POST /aparelhos`, `GET|PUT|DELETE /aparelhos/{id}`, `POST /aparelhos/{id}/estado`,
  `POST /aparelhos/{id}/aprender`, `GET /gravacoes/{job}`, `POST /aparelhos/{id}/botoes/{chave}/enviar`,
  `DELETE /aparelhos/{id}/botoes/{chave}`, `POST|DELETE /aparelhos/{id}/temporizador`, `GET /temporizadores`,
  `PUT /aparelhos/{id}/sinric`, `POST /aparelhos/{id}/sinric/criar`, `GET /catalogo`
- **Transmissores**: `GET|POST /hubs`, `PUT|DELETE /hubs/{id}`, `POST /hubs/verificar`, `GET /hubs/descobrir`,
  `POST /hubs/importar/{device_id}`, `POST /hubs/importar-todos`
- **Projetos / cenas / agenda / automações**: CRUD em `/projetos`, `/cenas` (+ `POST /cenas/{id}/executar`),
  `/agendamentos`, `/automacoes` (+ `POST /automacoes/{id}/executar`)
- **Integrações**: `GET|PUT /sinric`, `GET /sinric/dispositivos`, `GET /sinric/conectar-alexa`,
  `GET /alexa/comandos`, `GET|PUT /alexa`, `POST /alexa/revogar`, `POST /alexa/nova-chave`,
  `POST|GET /tuya/qr`, `DELETE /tuya`, `GET /tuya/aparelhos`
- **Supabase**: `GET /supabase/rotinas`, `PUT /supabase/rotinas/{nome}`, `POST /supabase/rotinas/{nome}/executar`,
  `GET /supabase/resumo`, `GET /supabase/backups/{id}`, `GET /backup`, `GET|PUT /config`
- **Alexa (fora de /api)**: `POST /oauth/token`, `POST /alexa/diretiva`; `GET /saude`

---

## 10. Apps

| App | Pasta | Construir | Observações |
|---|---|---|---|
| PWA | `frontend/public` | junto com o build | `sw.js` guarda só a interface; `/api` nunca vai para o cache. Mudou o shell? suba `VERSAO` no `sw.js` |
| Desktop | `apps/desktop` | `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 --x64 --win nsis --x64 --linux AppImage --x64` | Electron 45; carrega a URL de produção; bandeja, ⌘1–4, iniciar com o sistema, tela offline; sem assinatura Apple |
| Android/iOS | `apps/android` | `npx eas-cli@latest build -p android --profile preview` | Expo SDK 58, Expo Router com NativeTabs; login Supabase (sessão em `expo-sqlite/localStorage`), chama a API da Vercel. Antes de mexer: ler `apps/android/AGENTS.md`, rodar `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor` |

**Release**: renomeie os arquivos para os nomes fixos que o site usa (`apps.js`): `ClimaCasa-android.apk`,
`ClimaCasa-mac-apple-silicon.dmg`, `ClimaCasa-mac-intel.dmg`, `ClimaCasa-windows.exe`,
`ClimaCasa-linux-x64.AppImage`, `ClimaCasa-linux-arm64.AppImage`, e publique com
`gh release create vX.Y.Z --repo estevam5s/clima-casa …` (ou `gh release upload … --clobber`). O repositório é
privado: os links só baixam para quem está logado no GitHub com acesso.

---

## 11. Como mexer no projeto (receitas)

- **Nova rota de API**: em `backend/app/rotas/api.py` use `@api.<verbo>` (já exige admin), modelos Pydantic com
  limites, erros em pt-BR via `HTTPException` ou `_erro(e)`. Toda ação que muda algo → `db.registrar(...)`.
  SQL com marcador `?` (o `db` converte) — nunca formatar valores na string.
- **Nova tabela/coluna**: acrescente ao fim de `supabase/schema.sql` com `if not exists`, RLS e política
  `admin_le`; aplique pela Management API; se a tabela tem `id` identity, inclua o nome em `_TABELAS_COM_ID` no
  `db.py` (senão `executar` não devolve o id). jsonb entra com `CAST(? AS jsonb)` e `json.dumps`.
- **Nova tela**: arquivo em `frontend/src/pages`, rota em `main.jsx`, item no grupo certo em `GRUPOS`
  (`components/Layout.jsx`). Use `Cabecalho`, `FaixaMetricas`, `.cartao`; centralize com `mx-auto max-w-5xl`;
  estados de carregando, vazio e erro. Filtre por projeto com `useProjeto().filtro` + `comFiltro`.
- **Nova capacidade na Alexa**: Sinric → `sinric._callbacks` (e `notificar_estado`); skill própria → `alexa.tratar`
  e `_descoberta`. Atualize a tela `/comandos-alexa` (`/api/alexa/comandos`).
- **Novo gatilho/ação de automação**: `automacao.py` (+ validação em `AutomacaoIn` e formulário em `Automacoes.jsx`).
- **Mudou algo que o celular usa**: ajuste `apps/android/src`, rode as checagens do Expo e gere novo APK.
- **Mudou algo que o usuário vê?** Atualize `docs/MANUAL.md` e rode `docs/gerar-pdf.sh`.
- **Commits**: mensagem em pt-BR, terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  Antes do commit: `git grep -nE "sb_secret_|sbp_|vcp_|ghp_"` deve voltar vazio.

### Checklist antes de entregar
1. `cd frontend && npm run build` sem erro; auditor ≥ 98.
2. Backend importa: `.venv/bin/python -c "import sys;sys.path.insert(0,'backend');import app.main"`.
3. Smoke test com token admin real (login pelo Supabase) nas rotas tocadas, local e em produção.
4. `./publicar-vercel.sh`, `./instalar-servico.sh`, conferir `/saude` (200) e as rotas novas.
5. Commit + push.

---

## 12. Segurança

- **Firewall** (`firewall.py`, middleware em `main.py`): permitidos → bloqueados (IP/CIDR) → país → assinaturas
  (agente, caminho, SQLi/XSS) → limite por minuto; depois da resposta, 401/403 contam para o bloqueio progressivo.
  Quem teve `login_ok` nas últimas 24 h não é bloqueado por 401. Ao testar ataques localmente, limpe
  `seguranca_ips`/`seguranca_eventos` do IP 127.0.0.1 depois.
- Sem cadastro; só admin. Cookies não são usados para a API (Bearer), CSRF barrado por checagem de `Origin`.
- Headers: CSP restrita (`connect-src` só self + supabase), HSTS, X-Frame-Options DENY, nosniff.
- Segredos só no `.env` (agente) e nas variáveis da Vercel; `service_role`/secret do Supabase nunca no bundle.
- Pooler do Supabase com TLS **verificado** contra `backend/supabase-ca.crt` ("Supabase Root 2021 CA").
- OAuth da Alexa: códigos e tokens guardados só como hash SHA-256; redirect restrito a domínios da Amazon.
- O token pessoal do GitHub tem escopos amplos: **não** colocar na Vercel. Para downloads públicos, usar um
  token fine-grained só de leitura do repositório.

---

## 13. Armadilhas conhecidas (já aconteceram)

| Sintoma | Causa / solução |
|---|---|
| Deploy na Vercel fica "BLOCKED"/"Building…" para sempre | Plano Hobby bloqueia commits de autor fora do time. Publique com `./publicar-vercel.sh` (cópia sem `.git`) e apague deploys travados com `vercel rm` |
| `File size limit exceeded (100 MB)` no deploy | binários em `apps/` enviados; `.vercelignore` já exclui `apps` e `docs` |
| LaunchAgent sai com código 78 | o serviço não lê `~/Documents`; use `instalar-servico.sh` (roda da cópia em Application Support) |
| `CERTIFICATE_VERIFY_FAILED` no Postgres | falta `backend/supabase-ca.crt` no deploy ou `sslrootcert` errado |
| Consultas lentas (0,5–1 s) | pg8000 faz várias idas por consulta; o projeto usa psycopg3 com autocommit (1 ida). Do Brasil cada ida custa ~0,27 s; na Vercel (cle1) ~10 ms |
| `psycopg-binary` não instala | Python 3.15; use 3.13 |
| Fila "não respondeu a tempo" com o agente vivo | tabela nova com id sem estar em `_TABELAS_COM_ID` (insert não devolve id) |
| Sinric "signature mismatched" | dispositivo criado com outra credencial; recriar com a App Key do `.env` |
| Transmissor "offline" logo após reiniciar o serviço | passageiro; o status volta no ciclo seguinte (~60 s) |
| Transmissor com "Local Key mudou" | foi pareado de novo; conecte a conta Smart Life em Configurações → Contas (uma vez) e o agente se ajusta |
| `date > integer` no Postgres | parâmetro inteiro em aritmética de data: use `CAST(? AS integer)` |
| Manifesto/ícones da PWA vindo como HTML | cache da CDN; testar com `?v=…` |
| Porta 8080 ocupada | é outro app do usuário; o Clima Casa usa 8090 |

---

## 14. Estado atual e pendências

- Transmissor "Smart IR" (`eb3f5451cddd399055p54z`, 192.168.0.187) online; aparelho "Ar do escritório" vinculado a ele e
  ao Sinric. **Nenhum botão IR gravado ainda** — sem isso nenhum comando aciona o ar de verdade.
- Skill própria da Alexa ainda não criada na Amazon/AWS (opcional; o Sinric já cobre Alexa e Google).
- Envio pela nuvem Tuya com o Mac desligado não foi validado com este transmissor.
- APK v1.0.0 compilado e publicado no release, ainda não testado num celular.
