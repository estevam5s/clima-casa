# CLAUDE.md — Clima Escritório (marca zynio)

Guia do projeto para quem (pessoa ou agente) for mexer nele. **Leia as seções 0 a 2 antes da primeira mudança**;
o resto é consulta. Tudo em **pt-BR**: código, nomes, rotas, textos de interface e mensagens de erro.
O repositório e alguns nomes técnicos ainda se chamam "clima-casa" (nome antigo): não renomeie (quebra apps,
caminhos de serviço e o projeto da Vercel).

---

## 0. Regras de ouro

1. **Segredos**: nunca commitar, imprimir, colar em issue/chat ou mandar para o bundle. Ficam no `.env` (gitignored),
   nas variáveis da Vercel ou **cifrados no banco** (`db.set_cfg` com a chave em `db.CHAVES_SENSIVEIS`). Arquivos de
   credenciais em `docs/credentials/` (gitignored): ler só quando preciso e **sempre mascarando** ao exibir.
   Antes de todo commit: `git diff --cached | grep -E "sb_secret_|sbp_|vcp_|ghp_|re_[A-Za-z0-9]{20}|whsec_|spak_"` deve voltar vazio.
   Nunca `git add -A` às cegas: liste os arquivos. E-mails pessoais também não entram em arquivos versionados.
2. **Produção**: publicar com `./publicar-vercel.sh` (nunca `vercel deploy` na pasta com `.git`) e atualizar o agente com
   `./instalar-servico.sh`. Ação irreversível (apagar publicações, mudar configuração de conta, enviar mensagem a terceiros)
   **só com confirmação explícita do dono**. Nada de `push --force`.
3. **Não inventar**: sem números, frases da Alexa, depoimentos ou funcionalidades que o sistema não tem. Item "do mapa"
   (loja, dispositivos 3D) é desenho, não aparelho: a interface tem que dizer isso.
4. **O agente é o único que fala com a rede do escritório e com a Vercel (token)**. A nuvem pede pela `fila_comandos`.
5. **Testar antes de entregar** (seção 11): build, import do backend, teste no navegador com sessão temporária, e em
   produção as rotas tocadas. Diga o que não foi testado.
6. **Sem cara de IA** na interface (seção 8.9) e copy direta em pt-BR.

### Onde mexer (mapa rápido)
| Quero mudar… | Arquivo(s) |
|---|---|
| Ligar/desligar/temperatura de um ar | `backend/app/clima.py` (`aplicar`) → `transmissor.py` |
| Gravação de botões IR | `transmissor.py` (`aprender`), tela `pages/Aparelho.jsx` |
| Quem é o computador principal do agente | `backend/app/coordenador.py`, tela Infra → Agentes |
| Alexa/Google (Sinric) | `backend/app/sinric.py`, tela `pages/Integracoes.jsx` |
| Frases de voz geradas | `frontend/src/vozAlexa.js`, `components/CatalogoVoz.jsx` |
| E-mails (Resend) | `backend/app/correio.py`, `rotas/correio.py`, `pages/Emails.jsx` |
| Música (Spotify) | `backend/app/musica.py`, `rotas/musica.py`, `pages/Musica.jsx` |
| Vercel pelo painel | `backend/app/infra.py`, `rotas/infra.py`, `pages/Infra.jsx`, `components/infra/Vercel.jsx` |
| Cloudflare pelo painel (DNS, e-mails, DNSSEC, Turnstile) | `backend/app/cloudflare.py`, `rotas/infra.py` (`/infra/cf/*`), `components/infra/Cloudflare.jsx`, `Visao.jsx` |
| Mapa 2D/3D do escritório | `pages/Mapa.jsx`, `components/Mapa3D.jsx`, `mapaUtil.js`, `predio3d.js`, `dispositivos3d.js`, `CartoesMapa3D.jsx`, `EquipeMapa.jsx`, `catalogoMapa.js` |
| Globo da Segurança | `components/Globo3D.jsx`, `universo.js`, `satelites3d.js`, `nave3d.js` |
| Relatórios e exportação | `relatorio.py`, `exportar.py`, `docx_simples.py` |
| Permissões de rota | `backend/app/acesso.py` (`REGRAS`) |
| Firewall / anti-robô | `firewall.py`, `turnstile.py`, `middleware.js` |
| Passo a passo para o usuário | `pages/Guia.jsx` (e `docs/MANUAL.md`) |

---

## 1. O que é

**Clima Escritório** controla ar-condicionados por **infravermelho** com transmissores Wi-Fi **Tuya SRW-004** ("Smart IR",
app Smart Life). Ele grava os sinais do controle remoto original e os reenvia pelo transmissor, a partir de:

- painel web/PWA (**https://app.zynio.com.br**), app Android (Expo) e app desktop (Electron);
- **Alexa e Google Home** via Sinric Pro (caminho principal) ou skill própria (opcional);
- agenda, automações, cenas, temporizadores e rotinas de música;
- mapa 3D do escritório (salas = projetos), com equipe, expediente e itens.

Usuários: **dono**, **admin** (Deison) e papéis abaixo (seção 7.7). Sem cadastro público.

| Recurso | Endereço / identificação |
|---|---|
| Produção (web/PWA/API) | **https://app.zynio.com.br** — projeto Vercel `clima-casa` (região `cle1`, Python 3.12). O endereço antigo `clima-casa-lac.vercel.app` continua no ar (apps antigos) |
| Site institucional | **https://zynio.com.br** (www redireciona) — Next.js em `site/`, projeto Vercel `clima-escritorio-site` (gru1) |
| Código (privado) | https://github.com/estevam5s/clima-casa · releases com APK/DMG/EXE/AppImage |
| Banco, Auth, cron, Storage | Supabase, projeto **Arcondicionado**, ref `elyqjdcsbfdvlsxomxen` (us-east-2) |
| App celular | Expo, conta `estevam5s`, projeto `clima-casa` (SDK 58) |
| Alexa/Google | Sinric Pro (dispositivo "Ar do escritório" `6af888eb7d04ce9fd64d6777`, plano grátis: 3 dispositivos) |
| E-mail | Resend (conta do dono); domínio `zynio.com.br` **verificado** em 16/11 (São Paulo, `sa-east-1`), remetente `nao-responda@zynio.com.br` (seção 7.10) |
| Música | Spotify Web API, app do dono no Spotify for Developers (conta Premium conectada em 15/11) |
| Domínio | `zynio.com.br` no Registro.br, **DNS na Cloudflare**. Registros "DNS only" (proxy laranja quebra o certificado da Vercel): A @ → 216.198.79.1 e 64.29.17.1; CNAME www e app → vercel-dns; TXT `google-site-verification`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all` (era `-all` até 16/11), DMARC `p=reject`; Resend: TXT `resend._domainkey`, CNAME `send`/`rsend`; Email Routing: MX `route1/2/3.mx.cloudflare.net` + TXT `cf2024-1._domainkey` (travados pela Cloudflare) |
| E-mails recebidos | Cloudflare Email Routing: `contato@`, `suporte@`, `financeiro@`, `seguranca@` e pega-tudo → Gmail do dono (destino verificado). Só recebe; enviar como esses endereços = "Enviar como" no Gmail pelo SMTP do Resend |
| Bloqueio de bots | Cloudflare Turnstile, widget "Zynio - Clima Escritorio" |
| Painel local do agente | http://localhost:8090 (a 8080 do Mac é de outro app) |

---

## 2. Arquitetura

```
 Navegador / PWA / Desktop / Celular / Alexa / Google / Resend (webhook)
              │ HTTPS (Bearer = token do Supabase Auth)
              ▼
 ┌────────────────────────────────┐          ┌──────────────────────────────┐
 │ Vercel (papel "nuvem")          │   SQL    │ Supabase                     │
 │ FastAPI (api/index.py)          │◄────────►│ Postgres (pooler 6543, TLS)  │
 │ + estáticos do frontend         │          │ Auth · pg_cron · Storage     │
 │ + OAuth/diretivas da Alexa      │          └──────────────▲───────────────┘
 └───────────────┬─────────────────┘                         │
                 │ grava em fila_comandos                    │ fila (~1 s), heartbeat,
                 │ (enviar, aprender, descobrir, evento,     │ aluguel de "principal"
                 │  reparar, infra)                          │
 ┌───────────────┴───────────────────────────────────────────┴──────────────┐
 │ Agente (papel "agente") em 1+ computadores do escritório:                │
 │ Mac (LaunchAgent) · PC Windows (tarefa agendada) · Linux (systemd).      │
 │ Só o PRINCIPAL executa: fila, Sinric (WebSocket), agenda, automações,    │
 │ rotinas de música, status dos transmissores e as operações da Vercel.    │
 │ Os outros ficam de RESERVA e assumem em até 45 s se o principal sumir.   │
 └──────────────┬──────────────────────────────┬────────────────────────────┘
                │ rede local (tinytuya, 6668)   │ HTTPS: Vercel API (token local),
                ▼                               ▼ Spotify, Resend
     SRW-004 ── infravermelho ──► ar
```

- **Por que existe o agente**: a Vercel não alcança a rede do escritório. Comando que nasce na nuvem vira linha em
  `fila_comandos`; o agente executa e grava o resultado; a nuvem espera (8 s para IR, até ~55 s para Infra). Agente
  offline (sem heartbeat há 45 s) → a nuvem tenta a nuvem Tuya (só funciona se o transmissor aceitar código gravado
  pela nuvem; o SRW-004 atual não expõe `ir_send`).
- **Mesmo código nos dois papéis**: `transmissor.PAPEL` = `"nuvem"` com a variável `VERCEL`, senão `CLIMA_PAPEL`
  (padrão `"agente"`). Só o agente principal inicia as threads (seção 7.9).
- **Tudo mora no Supabase**: trocar o computador do agente não perde aparelhos, botões, Alexa, agenda nem música.

---

## 3. Estrutura de pastas

```
ar-controle/
├── CLAUDE.md · README.md · .env (segredos, gitignored)
├── api/index.py               entrada da Vercel (importa backend/app/main.py)
├── vercel.json                build, rewrites, headers (CSP), funções (includeFiles/excludeFiles), cle1
├── middleware.js              portão anti-robô do sistema (Turnstile + cookie zv), código todo inline
├── requirements.txt           deps Python da Vercel (sem sinricpro, sem python-docx)
├── iniciar.sh                 agente pelo terminal (dev)
├── instalar-servico.sh        agente como serviço do macOS (copia para ~/Library/Application Support/ClimaCasa)
├── instalar-windows.ps1       agente como tarefa agendada no Windows (PowerShell admin)
├── instalar-linux.sh          agente como serviço systemd (Raspberry Pi, mini PC)
├── publicar-vercel.sh         publica a partir de cópia sem .git; roda scripts/gerar-repositorio.mjs antes
├── scripts/                   gerar-repositorio.mjs (código-fonte em /apps), gerar-notas-release.mjs, gerar-release-json.sh
├── backend/
│   ├── requirements.txt       deps do agente (inclui sinricpro)
│   ├── supabase-ca.crt        CA raiz do pooler (TLS verificado)
│   └── app/
│       ├── main.py            FastAPI, middleware (CSRF/CSP/HSTS/firewall), ciclo de vida (agente: coordenador → threads)
│       ├── db.py              psycopg3 + pool, "?"→"%s", cfg()/set_cfg() (cifra CHAVES_SENSIVEIS), registrar()
│       ├── seguranca.py · acesso.py · sessoes.py · firewall.py · turnstile.py · cripto.py
│       ├── clima.py           estado do ar → código IR (aplicar), rótulos
│       ├── transmissor.py     envio local/fila/nuvem, aprender, descobrir, autorreparo, laço do agente, fila
│       ├── coordenador.py     agente em vários computadores (principal/reserva/preferido)
│       ├── tuya_nuvem.py      Smart Life por QR, Local Key, envio pela nuvem Tuya
│       ├── sinric.py · alexa.py   Alexa/Google (Sinric) e skill própria
│       ├── automacao.py · agenda.py   automações, temporizadores, agenda (laço de 20 s)
│       ├── musica.py          Spotify (OAuth, player, busca, rotinas)
│       ├── correio.py         e-mail pelo Resend (modelos, envio, histórico, webhook, domínio + Cloudflare)
│       ├── infra.py           operações na Vercel (só no agente; lista fechada OPS); despacha as `cf_*`
│       ├── cloudflare.py      operações na Cloudflare da zona zynio.com.br (só no agente; token CLOUDFLARE_API_TOKEN)
│       ├── vercel_ataque.py   modo de ataque da Vercel junto com o escudo anti-DDoS
│       ├── relatorio.py · exportar.py · docx_simples.py · seguranca_relatorio.py
│       ├── notificacoes.py · clima_externo.py · supabase_painel.py · conformidade.py · perfil.py
│       └── rotas/  api.py (quase tudo) · contas.py (usuários, sessões, passkeys) · alexa.py (OAuth + diretivas)
│                   musica.py · infra.py · correio.py
├── frontend/                  React 18 + Vite 5 + Tailwind 3 + framer-motion + recharts + three
│   ├── public/                manifest, sw.js (PWA), tema.js, verificacao.js, ícones (icone-192.png = logo dos e-mails)
│   └── src/
│       ├── main.jsx · api.js · supabase.js · contexto.jsx · tema.jsx · marca.jsx · preferencias.js
│       ├── mapaUtil.js        completar/colocarMoveis/postosDoMapa/expediente (horaBR, noExpediente)
│       ├── catalogoMapa.js    loja do mapa (itens, modelos, cores)
│       ├── vozAlexa.js        gerador de frases da Alexa (música e ar)
│       ├── components/        Layout, ui (design system), Mapa3D, Cena3D, Globo3D, Barras3D, CartoesMapa3D,
│       │                      EquipeMapa, CatalogoVoz, dispositivos3d, nave3d, predio3d, satelites3d, universo…
│       └── pages/             uma por rota (seção 8)
├── supabase/  schema.sql (idempotente) · cron-jobs.json (10 rotinas)
├── alexa/     GUIA.md · lambda/index.mjs (skill própria)
├── apps/      desktop (Electron) · android (Expo; tem AGENTS.md próprio — leia antes)
├── site/      Next.js do zynio.com.br (publicar com site/publicar.sh)
└── docs/      MANUAL.md (+ PDF), releases/vX.Y.Z.md, credentials/ (gitignored)
```

---

## 4. Como executar

**Requisitos**: Python **3.13** no agente (3.15 do Homebrew não tem wheel do psycopg-binary; a Vercel usa 3.12 —
evite sintaxe só de 3.13), Node 20+, `uv`, Vercel CLI, `gh`, `npx eas-cli@latest`.

```bash
# agente em desenvolvimento
uv venv .venv --python 3.13 && uv pip install --python .venv/bin/python -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..        # gera backend/static
cd backend && ../.venv/bin/python -m app.main                 # http://127.0.0.1:8090
```
Variáveis: `CLIMA_PORTA` (8090), `CLIMA_HOST`, `CLIMA_PAPEL=nuvem` (simula a Vercel: sem threads, usa a fila),
`CLIMA_MAQUINA_ID` (força o id do computador; útil para testar dois agentes), `CLIMA_SINRIC_DEBUG=1`.
O serviço já ocupa a 8090: para testar, use outra porta (`CLIMA_PAPEL=nuvem CLIMA_PORTA=8097 …`) e encerre depois.

**Agente como serviço**
| Sistema | Instalar/atualizar | Ver | Log |
|---|---|---|---|
| macOS | `./instalar-servico.sh` (o macOS não deixa serviço ler ~/Documents: roda de uma cópia) | `./instalar-servico.sh status` | `~/Library/Logs/ClimaCasa.log` |
| Windows | PowerShell admin: `powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1` | `… status` | `data\agente.log` |
| Linux | `sudo ./instalar-linux.sh` | `sudo ./instalar-linux.sh status` | `journalctl -u clima-escritorio-agente` |

Depois de qualquer mudança no backend ou frontend: reinstalar o agente. O `.env` vai do Mac ao PC por pendrive/rede local.

**Frontend dev**: `cd frontend && npm run dev` (Vite :5173, proxy de /api e /oauth para :8090).

**Publicar**
```bash
cd frontend && npm run build && cd ..
git add <arquivos> && git commit -m "…" && git push
./publicar-vercel.sh      # gera repositorio.json + pacotes do código, copia sem .git e publica (alias app.zynio.com.br)
./instalar-servico.sh     # agente do Mac (no Windows/Linux, rode o instalador de novo)
curl -s -o /dev/null -w "%{http_code}" https://app.zynio.com.br/saude   # 200
```

**Testar logado sem senha** (servidor local `CLIMA_PAPEL=nuvem` na 8097 + Playwright): gerar sessão com
`/auth/v1/admin/generate_link` (magiclink) → `/auth/v1/verify`, gravar o `session_id` em `sessoes_fortes` e o JSON em
`localStorage['clima-casa-auth']`. A sessão vale 1 h. **Apague depois** (`sessoes_fortes`, `sessoes_uso`, `auth.sessions`).
Scripts de exemplo ficam no scratchpad da sessão; não versionar.

---

## 5. Configuração e segredos

`.env` (gitignored, 600):
| Variável | Uso | Onde |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | projeto e chave pública | agente, Vercel, front (via API) |
| `SUPABASE_SECRET_KEY` | admin do Auth (contas, links de recuperação/convite, biometria) | agente e Vercel (nunca no front) |
| `SUPABASE_ACCESS_TOKEN` | Management API (`sbp_…`) | schema/cron |
| `SUPABASE_DB_PASSWORD` (+ `_HOST`/`_PORT`) | Postgres | agente (5432) e Vercel (6543) |
| `SINRIC_API_KEY/APP_KEY/APP_SECRET` | Sinric (copiados para `config.sinric`) | agente |
| `VERCEL_TOKEN` | deploy **e** Infra (escopo amplo: **só** no agente, nunca na Vercel) | agente, `publicar-vercel.sh` |
| `CLOUDFLARE_API_TOKEN` | Infra → Cloudflare (zona zynio.com.br: DNS edit, e-mail, DNSSEC, analytics, Turnstile read, auditoria). **Só** no agente; o dono cria (lista de permissões em Infra → Cloudflare → Token) | agente |
| `CLIMA_CHAVE_MESTRA` | AES-256-GCM dos segredos em repouso. **A mesma** no agente e na Vercel. Perder = reconectar Smart Life, Sinric, Alexa, Spotify e Resend | todos |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, `VERIFICACAO_SEGREDO` | anti-robô | agente e Vercel (os dois projetos) |
| `TUYA_*` | legado (migrado para `hubs`) | agente |

Vercel (app) tem: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_PORT=6543`,
`CLIMA_CHAVE_MESTRA`, `TURNSTILE_*`, `VERIFICACAO_SEGREDO`. App Expo: só variáveis públicas (`EXPO_PUBLIC_*`).

**Tabela `config` (chave → JSON)**. Cifradas (`db.CHAVES_SENSIVEIS`): `tuya_conta`, `tuya_qr_pendente`, `sinric`, `alexa`,
`segredo_sessao`, `spotify`, `email`. Use sempre `db.cfg/set_cfg` (nunca leia `config.valor` direto). Outras:
`modo_envio`, `nome_casa`, `sinric_status`, `tarifa_kwh`, `white_label(_historico)`, `seguranca`, `escudo`, `mapa`,
`satelites_tle`, `musica_rotinas`, `agente_visto_em` (heartbeat), `agente_lider` (aluguel do principal),
`agente_maquina:<id>` (cada computador), `agente_preferido`.

Credenciais fora do repo (`docs/credentials/`, gitignored): `supabase.md`, `portal.sinric.pro.md`, `token-vercel.md`,
`github.txt`, `spotify.md`, `resend.md`, `fish-audio.md`, `outlook.md`, `sistema-admin.md`. `docs/contas.md` tem senha em
texto: **nunca** commitar.

---

## 6. Banco de dados (Supabase)

`supabase/schema.sql` é idempotente (rodar inteiro de novo é seguro). Aplicar pela Management API ou pelo `db` local.
Datas em **epoch segundos** (bigint); booleanos de negócio 0/1 (exceto tabelas das rotinas).

| Tabela | Conteúdo |
|---|---|
| `config` | chave/valor JSON (seção 5) |
| `projetos` | lugares/salas (nome, endereço, cor, tipo, responsável, meta de gasto) |
| `hubs` | transmissores: id Tuya, ip, local_key (cifrada), versão, `control_type`, funções da nuvem, online, `problema` |
| `aparelhos` | ares (nome falado na Alexa, cômodo, hub, faixa, modos, estado, `ligado_desde`, `alexa`, `sinric_device_id`, `potencia_w`) |
| `codigos` | sinais IR (base64) por aparelho: `modo_temp_vent`, `desligar`, `extra_<nome>` |
| `cenas`, `agendamentos`, `automacoes`, `temporizadores` | automação |
| `atividade` | todo comando/evento (origem, ação, ok, detalhe) |
| `fila_comandos` | ponte nuvem → agente. **Tipos permitidos pela constraint**: `enviar`, `aprender`, `descobrir`, `evento`, `reparar`, `infra` (tipo novo = ampliar a constraint) |
| `usuarios`, `passkeys`, `webauthn_desafios`, `sessoes_fortes`, `sessoes_uso` | contas e sessões |
| `notificacoes` | central de notificações |
| `seguranca_ips`, `seguranca_eventos`, `seguranca_ip_info` | firewall e tela Segurança |
| `site_mensagens`, consentimentos de cookies | site |
| `email_envios` | e-mails enviados (tipo, para, assunto, `resend_id`, estado, eventos do webhook) |
| `oauth_codigos`, `oauth_tokens` | skill própria (só hashes) |
| `metricas_diarias`, `alertas`, `backups`, `saude_sistema`, `cron_log`, `cron_job_registry` | rotinas pg_cron |

**RLS ligado em tudo** (tabela nova: `enable row level security`). O backend conecta como dono pelo pooler; o front nunca lê o banco.
Storage: bucket privado `codigo-fonte` (zip/tar.gz do código, link assinado de 2 min).

### Rotinas pg_cron (prefixo `clima_`, UTC)
| Rotina | Quando | O que faz |
|---|---|---|
| transmissores_offline | */5 min | `online = 0` se `visto_em` > 10 min |
| oauth_expirados | */15 min | limpa OAuth vencido |
| metricas_hora | :05 | consolida `metricas_diarias` (Brasília) |
| alerta_ligado_12h | :20 | alerta de ar ligado > 12 h |
| alerta_falhas | */30 min | 3+ falhas em 1 h |
| backup_diario | 05:00 | snapshot JSON (mantém 14) |
| limpar_atividade | 06:30 | atividade > 90 d, eventos de segurança > 30 d, fila > 1 d… |
| limpar_logs_cron | 06:45 | logs do cron |
| saude_banco | */6 h | tamanho (limite 500 MB) |
| manutencao_semanal | dom 07:00 | ANALYZE |

Alterar: `supabase/cron-jobs.json` + `node ~/.claude/skills/supabase-cron/scripts/setup.mjs --jobs "$PWD/supabase/cron-jobs.json" --prefix clima_`.

---

## 7. Fluxos principais

### 7.1 Mudar o estado de um ar (`clima.aplicar`)
Estado desejado limitado à faixa → código exato `modo_temp_vent` → outra ventilação → temperatura gravada mais próxima no
mesmo modo (e o estado salvo vira o do código enviado). Desligar usa `desligar`. `transmissor.enviar`: no agente, local;
na nuvem, fila (8 s); falhou e `modo_envio = auto` → nuvem Tuya. Depois: `aparelhos`, `atividade`, aviso ao Sinric e
`automacao.evento` (que também dispara as rotinas de música). O ar **não** informa estado de volta.

### 7.2 Gravar um botão
`POST /api/aparelhos/{id}/aprender {chave}` → fila `aprender` → SRW-004 em modo estudo (30 s). Descobre o `control_type`
(tenta 2 e 1). Acompanha por `GET /api/gravacoes/{job}`. **Só com o agente na mesma rede.**

### 7.3 Transmissores (Tuya)
Descoberta UDP (`tinytuya.deviceScan`), Local Key pela conta Smart Life (QR, cliente `HA_3y9q4ak7g4ephrvke`), protocolo 3.5,
TCP 6668. **Autorreparo** (`transmissor.autorreparar`, ~60 s e "Reconectar agora"): `900` ok, `914` chave errada (pareado de
novo → busca a chave nova), `905/901` sem resposta (varre a LAN pelo ID e grava o IP novo; ID novo único → migra o cadastro).
Trocar de Wi-Fi: parear de novo no Smart Life (2,4 GHz) com o computador do agente na mesma rede.

### 7.4 Alexa e Google (Sinric Pro)
O agente abre o WebSocket (`sinricpro` v6) e registra cada aparelho como "Window AC Unit". Dispositivo no portal **com a mesma
App Key** do `.env` (senão "signature mismatched"). `config.sinric.automatico`: aparelho "Disponível na Alexa" é criado/apagado
no Sinric. Outra Alexa: skill Sinric Pro com a mesma conta (QR em /integracoes). `GET /api/sinric/diagnostico` responde "vai
funcionar em outra Alexa?" e a tela tem teste ao vivo. A tela `/alexa` é da **skill própria opcional** (mostra o Sinric no topo).

### 7.5 Skill própria (opcional)
OAuth 2.0 em `/oauth/autorizar` + `/oauth/token`; diretivas em `/alexa/diretiva` pela Lambda (`X-Clima-Chave`). Expõe aparelhos e
cenas. Depende de o dono criar a skill e a Lambda (`alexa/GUIA.md`). Ainda não criada.

### 7.6 Automações, temporizadores, agenda, cenas
Gatilhos `ligou`/`desligou` (filtro de origem), `ligado_ha`, `horario`; condições de dias/janela (vira a meia-noite); ações
`aparelho`, `cena`, `desligar_apos`. Ações de automação (`automacao:<nome>`) não disparam outras. Agenda a cada 20 s no agente
(fuso local). Na Vercel o evento vai pela fila (`evento`).

### 7.7 Usuários, permissões, 2FA, biometria, sessões
- `acesso.py`: papéis dono > admin > subadmin > operador > visualizador (ou personalizado), 14 permissões, `REGRAS` por rota.
  **Rota nova que muda dados precisa cair numa regra** (não listada e não GET → exige `configuracoes.gerenciar`). Escopo de
  projetos (`"*"` ou lista) com `filtro_sql`/`_escopo`/`checar_projeto`.
- Contas (`rotas/contas.py`) pela API admin do Supabase. Senha provisória → `exige_troca_senha`. Ninguém dá o que não tem.
- 2FA: TOTP nativo do Supabase (token `aal2` exigido quando há fator; 401 `X-Clima-2FA`). Biometria: passkeys WebAuthn
  (RP ID `zynio.com.br`), login abre sessão por link mágico e grava em `sessoes_fortes`.
- Sessões (`sessoes.py`, `sessoes_uso`): inatividade (240 min) e duração máxima (168 h); revogar apaga em `auth.sessions`.
  `exigir_2fa_admin` existe mas está **desligado** (o Deison ainda não tem 2FA).
- Senha: mínimo 10 com classes (Supabase) + HIBP por k-anonimato no navegador (`validarSenhaNova`).
- Login pelo backend (`POST /api/auth/entrar`): Turnstile, bloqueio por e-mail/IP, IP novo → notificação + e-mail `acesso_novo`.
- Login com Google (marca "zynio", projeto `zynio-514802`, marca verificada); cada usuário liga o próprio Google (`linkIdentity`).

### 7.8 Esqueci a senha
`POST /api/auth/esqueci` (Turnstile, 5/h por IP). Se o Resend estiver pronto **e o domínio verificado**, o servidor gera o
link com `generate_link(type=recovery)` e manda o modelo `recuperar_senha` (com IP/local/navegador). Senão, chama
`/auth/v1/recover` e o Supabase manda o e-mail padrão dele. Responde igual exista ou não a conta. O link volta para
`/redefinir-senha` (evento `PASSWORD_RECOVERY`), que depois avisa `POST /api/conta/senha-trocada` → e-mail `senha_alterada`.

### 7.9 Agente em vários computadores (`coordenador.py`)
Aluguel em `config.agente_lider` renovado a cada 10 s por `INSERT … ON CONFLICT DO UPDATE … WHERE dono = eu OR vencido`
(vence em 45 s): nunca há dois principais. Cada computador se anuncia em `agente_maquina:<id>` (id em `data/maquina.id`).
`agente_preferido` faz o principal ceder. Perdeu o posto → `os._exit(3)` e o serviço reinicia como reserva. O `main.py` só
liga fila/Sinric/agenda depois de `esperar_posto()`. Tela: Infra → Agentes (preferir, tirar da lista). Testado: troca nos dois
sentidos em < 60 s.

### 7.10 E-mail (Resend + Cloudflare) — `correio.py`
- Configuração cifrada em `config.email`: `api_key` (envio), `api_key_total` (opcional, cadastrar/consultar domínio),
  `cloudflare_token` (opcional, "Edit zone DNS" da zona), `webhook_secret` (whsec_…), remetente (`nao-responda@zynio.com.br`),
  `responder_para`, `automaticos`.
- Modelos (`MODELOS`): `recuperar_senha`, `boas_vindas` (convite/usuário novo, link para criar a senha; senha nunca vai por
  e-mail), `senha_alterada`, `senha_redefinida` (pelo admin), `acesso_novo`, `alerta` (crítico/alto para dono e admins, 1 por
  título a cada 6 h; **desligado por padrão**), `teste`. HTML em tabelas, botão com VML para Outlook, modo escuro, texto puro,
  prévia, logo `https://app.zynio.com.br/icone-192.png`, cor da marca (white label).
- Envio: `correio.enviar` (grava em `email_envios`), `enviar_quieto` (automáticos: nunca derruba quem chamou, 5/h por destino e tipo).
- Domínio: `dns_publico()` confere no DNS público (DoH da Cloudflare, sem chave) DKIM `resend._domainkey`, os subdomínios de envio e
  DMARC. Desde nov/2026 o Resend ("Forge") pede **CNAME** `send` → `send.forge.rmta.net` e **CNAME** `rsend` → `rsend-sae1.forge.rmta.net`
  (não mais MX + TXT em `send`); a checagem aceita os dois formatos. Registros na Cloudflare (DNS only): TXT `resend._domainkey`,
  CNAME `send`, CNAME `rsend`. Domínio no Resend: id `3a1c15b9-8b9d-415b-9dc4-fefc4987a4ae`. Sem `api_key_total`, o botão não atualiza
  `config.email.dominio.status`; o estado `verified` foi gravado à mão (`correio.cfg()` → `c["dominio"]` → `salvar_cfg`). `provisionar()` (com a chave total e o token da Cloudflare) cadastra o domínio no Resend (região `sa-east-1`), cria os
  registros (proxy desligado) e pede a verificação. O SPF da raiz virou `v=spf1 include:_spf.mx.cloudflare.net ~all` (exigência do
  Email Routing, 16/11) e o DMARC `p=reject` **continua**: o Resend passa no DMARC pela assinatura DKIM. Nunca criar um segundo SPF na
  raiz (dois SPF = falha de validação); editar o existente.
- Webhook público `POST /api/email/webhook` com assinatura **Svix** verificada (5 min de tolerância); atualiza o estado sem rebaixar
  (aberto/clicado > entregue). Cadastrado no Resend em 16/11 com 7 eventos (`sent`, `delivered`, `delivery_delayed`, `bounced`,
  `complained`, `opened`, `clicked`); o `whsec_…` é o dono quem cola em /emails → Chaves.
- **Sem domínio verificado o Resend só entrega para o e-mail da própria conta do Resend** (remetente `onboarding@resend.dev`).

### 7.11 Música (Spotify) — `musica.py`
App do dono (Client ID/Secret cifrados em `config.spotify`), OAuth authorization code com `state` de uso único (10 min) e
Redirect URI `https://app.zynio.com.br/musica`. A troca do código acontece **em `main.jsx`, ao carregar a página** (antes da
checagem de login) por `POST /api/musica/spotify-retorno` (pública, protegida pelo `state`), para funcionar mesmo quando o Spotify
devolve num navegador/app sem login. Player, aparelhos (Echo aparece se a conta Alexa tiver o Spotify vinculado), busca,
playlists. Sem aparelho ativo, o play usa o primeiro disponível. Rotinas em `config.musica_rotinas` (horário ou ar ligou/desligou,
janela opcional) rodam no agente (`agenda.laco` → `musica.ciclo`, `automacao.processar_evento` → `musica.evento_ar`). Controlar
exige **Premium**. Tentativas e erros vão para Atividade (origem `musica`).

### 7.12 Infra (Vercel + Cloudflare) — `infra.py`, `cloudflare.py`
A nuvem enfileira `tipo = 'infra'` com `{op, args}`; o agente executa com o `VERCEL_TOKEN` local. `OPS`: `resumo`, `uso`
(`GET /v2/usage?type=requests|builds`, funciona no Hobby), `publicacoes`, `eventos` (log do build), `promover`, `republicar`,
`cancelar`, `apagar` (recusa a que está no ar), `limpar` (mantém as N mais novas e a do ar; para em 45 s), `retencao`, `env`
(só nomes). Só os projetos `clima-casa` e `clima-escritorio-site`. Alterar é só do dono. "Functions Storage" não sai pela API
(≈ publicações guardadas × pacote Python; não zera por mês, cai quando publicações expiram ou são apagadas).

**Cloudflare (`cloudflare.py`, ops `cf_*` no mesmo `infra.executar`/fila `infra`)**: token `CLOUDFLARE_API_TOKEN` só no `.env` do agente.
Zona e conta descobertas por `GET /zones?name=zynio.com.br` (cache 10 min). Ops: `cf_resumo`, `cf_saude` (checklist que une DNS da
Cloudflare + domínios da Vercel + `correio.dns_publico()`/Resend), `cf_token` (verify + teste de cada permissão), `cf_dns` (+ `para`,
`protegido`, `travado`), `cf_dns_criar|editar|apagar`, `cf_dns_exportar` (BIND), `cf_dns_analise` (GraphQL `dnsAnalyticsAdaptiveGroups`),
`cf_dnssec`/`cf_dnssec_mudar` (devolve o DS para o Registro.br), `cf_config` (só leitura), `cf_email` (Email Routing: regras, pega-tudo,
destinos, atividade GraphQL `emailRoutingAdaptive`; a lista de mensagens só para o dono), `cf_email_regra|pegatudo|destino`, `cf_turnstile`,
`cf_auditoria`. Travas no backend: registro protegido (Vercel, Resend, e-mail, SPF, DMARC, Google) só muda com `confirmar=<nome>`;
proxy laranja recusado nos endereços da Vercel; segundo SPF na raiz recusado; CNAME na raiz recusado; registros `meta.read_only`
(Email Routing) não editam. GraphQL que o plano grátis negar volta `indisponivel` com o motivo (a tela mostra, não inventa número).
Tudo é "DNS only": WAF, cache e métricas HTTP da Cloudflare não se aplicam (o tráfego é da Vercel).
Turnstile e auditoria filtram pelo domínio (a conta tem widgets de outros projetos do dono). Chamadas independentes rodam em paralelo
(`_paralelo`): resumo ~1,5 s, saúde ~2,7 s. **Fila**: itens `infra` rodam num pool de 4 threads no agente (`transmissor._infra_pool`), sem
segurar os comandos de infravermelho; os demais tipos seguem um por vez.

---

## 8. Interface web

### 8.1 Rotas (`frontend/src/main.jsx`; todas protegidas exceto `/login`, `/redefinir-senha`)
| Rota | Tela |
|---|---|
| `/` | Painel: avisos do que impede o ar de obedecer, métricas, ar 3D grande (cor do mapa), integrações, semana, gasto, escritório 3D compacto, origens, uso por hora, barras 3D, aparelhos, atividade. Os 3D de baixo montam perto da tela ou no ocioso |
| `/projetos` | projetos com meta de gasto, aparelhos ao vivo, desligar todos, exportar |
| `/mapa` | mapa 2D (edição) e 3D (seção 8.2) |
| `/relatorios` | período livre, conclusões, comparativo, sessões, fora do expediente, exportar em 8 formatos |
| `/aparelhos`, `/aparelhos/:id` | lista e detalhe (mostrador, modos, botões, gravação, temporizador, histórico) |
| `/cenas`, `/automacoes`, `/agendamentos` | automação |
| `/transmissores` | SRW-004: status, importar, procurar na rede, reconectar |
| `/musica` | player, onde tocar, rotinas, frases de voz geradas + "qualquer música vira comando", passo a passo da conexão |
| `/integracoes` | Sinric (credenciais, criar no Sinric, outra Alexa por QR, diagnóstico e teste ao vivo) |
| `/comandos-alexa` | catálogo de frases do ar (busca, categorias, **Testar** manda a ação pelo painel) + por aparelho |
| `/emails` | Conexões (passos Resend/Cloudflare, DNS público, chaves cifradas), Modelos (prévia + teste), Histórico (estados do webhook), Automáticos (liga/desliga cada e-mail, remetente) |
| `/alexa` | skill própria opcional (mostra o estado do Sinric no topo) |
| `/supabase` | painel no formato do Supabase (tabelas, SQL só leitura, rotinas, backups, avisos) |
| `/infra` | abas em dois níveis: **Visão geral** (saúde do domínio ao vivo), **Vercel** (painel, uso, publicações, configurações), **Cloudflare** (DNS com travas e consultas, e-mails @zynio.com.br, Turnstile, Segurança: DNSSEC/config/auditoria, Token), **Agentes**. Componentes em `components/infra/` |
| `/atividade` | linha do tempo (período, origem, aparelho, falhas, busca no servidor, detalhe, CSV/JSON) + **Análise** |
| `/seguranca` | postura, globo 3D, eventos ao vivo, IPs, países, regras, checklist, relatório |
| `/mensagens` | mensagens do site no estilo WhatsApp Web |
| `/configuracoes?aba=` | perfil, geral, aparência, marca (white label), segurança, contas, sistema |
| `/apps` | downloads, PWA, código-fonte (dono/admin) |
| `/guia` | **passo a passo** (18 capítulos: Smart Life, transmissores, botões, desligar de longe, Sinric, outra Alexa, Google, mapa, música, agente no Windows, domínio e e-mails, problemas) |
| `/oauth/autorizar`, `/redefinir-senha`, `/login` | fluxos de conta |

### 8.2 Mapa (2D/3D)
- Planta em `config.mapa`: `salas` (por projeto), `ares` (posição + `modelo` split/cassete/piso_teto/janela + `cor`),
  `elementos` (porta, janela com `aberta` 0–100, mesa, estacao, bancada, gaveteiro, armário, sofá, dispositivos da loja com
  `modelo`/`cor`/`ligado`…), `auto`, `andar` (9º), `pessoas` (nome, cargo, sala, posto, expediente, aparência) e `escritas`
  (caneta azul/preta/vermelha nos vidros).
- Vidro só na parede da porta das salas privativas, nas divisórias entre elas e na parede da bancada para o salão.
  `colocarMoveis` cria uma vez a mesa individual e a janela em frente à porta (ids em `mapa.auto`).
- Postos (`postosDoMapa`): mesa individual = id do elemento; fileira `id:i:a|b` (a = oeste/esquerda); bancada `id:i`;
  automático `sala-<id>`. Pessoa fora do expediente (Brasília) não aparece e o posto fica vazio.
- 3D: prédio (pódio + torre, clicar abre o andar), pessoas com A* numa grade de colisão, persianas clicáveis, itens com cartão
  (cor/modelo/ligar), escrita no vidro (dono/admin, altura 0,9–1,8 m), controle de avatar em 1ª/3ª pessoa (WASD, Shift, V, Esc),
  tela cheia, compilação de shaders assíncrona, para de desenhar fora da tela.
- Rotas: `GET/PUT /api/mapa`, `POST /api/mapa/elementos/{id}/estado` (persiana/ligar; cor/modelo só quem gerencia todos os
  projetos), `POST /api/mapa/ares/{id}/aparencia`, `PUT /api/mapa/pessoas`, `PUT /api/mapa/escritas`.
- Edição 2D: o clique depois de apertar num item cai no SVG (pointer capture): `cliqueDeItem` evita limpar a seleção.
- Projeto sem sala própria (ex.: **Devs**, só um ar ao lado das mesas no salão): `completar` não inventa sala quando o ar do projeto
  já tem posição em `mapa.ares` (senão o 3D desenharia paredes que não existem).

### 8.3 Globo da Segurança
Países (world-atlas), dia/noite pelo Sol real, atmosfera, arcos de acesso até o servidor, satélites reais (TLE da CelesTrak,
cache 6 h, SGP4 no navegador), "Seguir a ISS", estrelas cadentes, aurora, modo universo (Sol, Lua, planetas nas direções reais)
e **nave pilotável** (`nave3d.js`, desenhada por código, sem logotipo de empresa; HUD de empuxo/dobra/velocidade).

### 8.4 Cabeçalho e notificações
Barra de status (projeto, agente, ares, transmissores) de `GET /api/notificacoes`. Notificações com abas, ações e preferências;
condições se resolvem sozinhas; eventos via `notificacoes.notificar()` (que também chama `correio.avisar_admins`).

### 8.5 Anti-robô e portão
Turnstile no login, esqueci a senha e formulários do site. Portão "Executando verificação de segurança": cookie `zv` (12 h,
`.zynio.com.br`, `SameSite=Lax`) — `middleware.js` (sistema, código inline) e `site/proxy.js`. Passam direto: `/api`, `/alexa`,
`/oauth`, estáticos e robôs de busca/prévia. O portão preserva a query (`?code=` do Spotify chega intacto).

### 8.6 Site institucional (`site/`)
Next.js 16 + GSAP; conteúdo em `lib/dados.js` só com fatos reais; capturas sem dados pessoais; formulários → `POST /api/site/contato`
(CORS só `CLIMA_SITE_ORIGENS`). Prévias OG por página (`node scripts/gerar-og.mjs`). Páginas /como-funciona, /seguranca,
/integracoes, /status, /baixar, 404 animado, vídeo explicativo em código, aviso de cookies (Consent Mode v2, `?cookies=1` abre).
Rodar: `cd site && npm run dev` (3100); publicar: `site/publicar.sh`.

### 8.7 PWA, apps e preferências
`sw.js` guarda só a interface (suba `VERSAO` ao mudar o shell). Preferências do navegador em `preferencias.js` (cursor, atalhos
"?" e "g"+letra). White label: fontes @fontsource, tom do fundo, estilos, página inicial, **modo manutenção** (503 para quem não é
dono/admin) e logo/rodapé nos relatórios.

### 8.8 Design system
Tokens HSL em `src/index.css` (`--primary` = teal `#0f766a`, sobrescrito pela marca). Tema por classe `html.dark`.
Classes: `.cartao`, `.campo`, `.rotulo`, `.ajuda`, `.titulo-secao`. Componentes (`components/ui.jsx`): `Botao`, `Cabecalho`,
`FaixaMetricas`, `Dial`, `Secao`, `Selo` (cores: cinza, verde, vermelho, **ambar**, azul), `Ponto`, `Interruptor`, `Modal`,
`Vazio`, `Carregando`, `Esqueleto`, `Aviso` (erro/ok/alerta), `useToast`, `useDados`.

### 8.9 Sem cara de IA
Nada de gradiente decorativo, emoji como ícone, pílula "AI-powered", cartões iguais com ícone colorido, sombra em tudo, travessão
na copy ou número inventado. Sombra só no que flutua, com `/* marca: … */`. Auditor:
`node ~/.claude/skills/painel-senior/scripts/auditar.mjs frontend/src` (meta ≥ 98). Copy: título com contexto, verbo no botão,
erro que diz o que fazer. Respeitar `prefers-reduced-motion`.

---

## 9. API (resumo)

Prefixo `/api`, JSON, Bearer (exceto as públicas). Erros `{"detail": "…"}` em pt-BR; validação → 422 "Confira o(s) campo(s)".

- **Sessão/conta**: `POST /auth/entrar`, `POST /auth/esqueci`, `GET /supabase-config`, `GET /sessao`, `POST /sessao/registrar-login`,
  `POST /conta/senha-trocada`, `GET /conta/sessoes`, `POST /conta/sessoes/encerrar`, usuários em `/usuarios…` (contas.py)
- **Painel e dados**: `GET /painel`, `GET /painel/analise`, `GET /metricas`, `GET /atividade?origem&aparelho_id&falhas&antes&limite&de&ate&q`,
  `GET /atividade/analise?dias&origem&aparelho_id`, `GET /alertas`
- **Aparelhos/transmissores/automação**: `/aparelhos…` (estado, aprender, botões, temporizador, sinric), `/hubs…`, `/projetos`,
  `/cenas`, `/agendamentos`, `/automacoes`, `GET /gravacoes/{job}`
- **Mapa**: `GET|PUT /mapa`, `POST /mapa/elementos/{id}/estado`, `POST /mapa/ares/{id}/aparencia`, `PUT /mapa/pessoas`, `PUT /mapa/escritas`
- **Relatórios**: `GET /relatorios/completo`, `GET /relatorios/exportar?formato=pdf|docx|xlsx|csv|html|xml|json|md`
- **Integrações**: `/sinric…` (+ `/sinric/diagnostico`), `/alexa…`, `/tuya…`
- **Música**: `/musica/estado|credenciais|conectar|retorno|desconectar|tocando|comando|buscar|playlists|rotinas|rotinas/testar`,
  pública `POST /musica/spotify-retorno`
- **E-mail**: `GET /email/estado`, `PUT /email/config` (chave vazia mantém, "-" apaga), `POST /email/dominio/provisionar|verificar`,
  `GET /email/modelos`, `GET /email/modelos/{tipo}/previa`, `POST /email/teste`, `GET /email/envios`, pública `POST /email/webhook`
- **Infra/agentes**: `GET /infra/saude|resumo|uso|publicacoes|publicacoes/{id}/log|variaveis`, `POST /infra/publicacoes/acao|limpar|retencao`,
  `GET /agentes`, `POST /agentes/preferido|esquecer`
- **Segurança e marca**: `/seguranca…` (resumo, relatório, checklist, ips, eventos), `/marca…`, `/notificacoes…`
- **Outros**: `GET /satelites`, `GET /clima-externo`, `GET /apps/qr|versao|repositorio|codigo/{arquivo}`, `/site/…`, `/supabase/…`, `GET /backup`
- **Fora de /api**: `POST /oauth/token`, `POST /alexa/diretiva`, `GET /saude`

---

## 10. Apps

| App | Pasta | Construir | Notas |
|---|---|---|---|
| PWA | `frontend/public` | com o build | `/api` nunca vai ao cache |
| Desktop | `apps/desktop` | `CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dmg --arm64 --x64 --win nsis --x64 --linux AppImage --x64` | Electron 45; Touch ID, atalhos, aviso de versão; productName "Clima Casa" de propósito (mudar cria outro app) |
| Android | `apps/android` | `npx eas-cli@latest build -p android --profile preview`; só JS: `npx eas-cli@latest update --channel preview --environment preview` | ler `apps/android/AGENTS.md`; `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`; biometria, Google (`climacasa://auth`) |

Release: nomes fixos (`ClimaCasa-android.apk`, `-mac-apple-silicon.dmg`, `-mac-intel.dmg`, `-windows.exe`, `-linux-x64.AppImage`,
`-linux-arm64.AppImage`), `gh release create vX.Y.Z --repo estevam5s/clima-casa`, notas: `docs/releases/vX.Y.Z.md` +
`node scripts/gerar-notas-release.mjs vX.Y.Z`. **Só depois** suba `backend/app/versao_apps.json` (os apps avisam da versão nova).

---

## 11. Receitas

- **Nova rota**: `rotas/api.py` (ou um router próprio incluído em `main.py`), Pydantic com limites, erros pt-BR, `db.registrar(...)`
  em toda mudança, SQL com `?`. Confira `acesso.REGRAS`. Rota pública: router sem `exigir_login` e com proteção própria.
- **Nova tabela/coluna**: fim de `supabase/schema.sql` com `if not exists`, RLS ligado; aplicar; tabela com id identity →
  `_TABELAS_COM_ID` no `db.py` (ou `INSERT … RETURNING id` com `db.um`). jsonb: `CAST(? AS jsonb)` + `json.dumps`.
- **Novo tipo na fila**: tratar em `transmissor.processar_fila_uma_vez` **e** ampliar a constraint `fila_comandos_tipo_check`.
- **Nova operação de Infra**: função `op_<nome>` em `infra.py`, entrar em `OPS` (e em `ALTERAM` se muda algo), rota em `rotas/infra.py`
  (dono para alterar), botão em `Infra.jsx` com confirmação.
- **Novo e-mail**: entrada em `correio.MODELOS` + ramo em `correio.montar()` (assunto, blocos, texto puro, motivo, prévia), dados de
  exemplo em `EXEMPLO`, chamar `enviar_quieto(para, tipo, dados)` no evento, e se for automático, `AUTOMATICOS` + nome em `Emails.jsx`.
- **Novas frases da Alexa**: modelos em `vozAlexa.js` (só frases que a Alexa entende de verdade; `acao` se der para "Testar").
- **Novo item da loja do mapa**: `catalogoMapa.js` + modelo em `dispositivos3d.js`, tipo em `MAPA_TIPOS` no backend, desenho 2D em
  `Mapa.jsx` e, se eletrônico, a lista de eletrônicos.
- **Nova tela**: `pages/`, rota em `main.jsx`, item em `GRUPOS` (`Layout.jsx`), estados carregando/vazio/erro, capítulo no `Guia.jsx`.
  Telas que dependem do papel: só decidir depois que `sessao` carregar (senão pisca "sem permissão").
- **Mudou o que o usuário vê**: `Guia.jsx` + `docs/MANUAL.md` (`docs/gerar-pdf.sh`).
- **Commits**: pt-BR, terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Checklist antes de entregar
1. `cd frontend && npx vite build` sem erro; auditor ≥ 98.
2. `cd backend && ../.venv/bin/python -c "import app.main"`.
3. Navegador (Playwright) com sessão temporária: telas tocadas em 1440 e 375, sem erro de JS, sem 4xx/5xx, sem rolagem lateral.
4. Commit (sem segredos) + push; `./publicar-vercel.sh`; `./instalar-servico.sh`; `/saude` 200; rotas novas 401 sem login.
5. Apagar a sessão de teste e dados de teste do banco; relatar o que **não** foi testado.

---

## 12. Segurança

- Firewall (`firewall.py`): permitidos → bloqueados → país → assinaturas → limite por minuto; 401/403 contam para bloqueio
  progressivo (quem teve `login_ok` em 24 h é poupado). Ao testar ataques localmente, limpe `seguranca_ips`/`seguranca_eventos`
  do 127.0.0.1 depois. Escudo anti-DDoS liga o modo de ataque da Vercel (pelo agente).
- Bearer (sem cookies na API), CSRF por `Origin`, CSP restrita (imagens também de `*.scdn.co`/`*.spotifycdn.com`), HSTS,
  X-Frame-Options DENY, nosniff.
- Segredos em repouso: AES-256-GCM (`enc:v1:`) com AAD; pooler com TLS verificado (`backend/supabase-ca.crt`).
- OAuth da Alexa só com hashes. Webhook do Resend só com assinatura Svix. Retorno do Spotify só com `state` de uso único.
- Logs `atividade` e `seguranca_eventos` selados com SHA-256; `GET /api/seguranca/checklist` confere 18 controles ao vivo.
- Tokens amplos (GitHub, Vercel) **nunca** na Vercel; o token da Vercel só no agente.
- Vulnerabilidade/segredo vazado: rotacionar imediatamente (Supabase, Vercel, Sinric, Spotify, Resend, Turnstile).

---

## 13. Armadilhas conhecidas (já aconteceram)

| Sintoma | Causa / solução |
|---|---|
| Deploy "BLOCKED"/"Building…" para sempre | Hobby bloqueia autor fora do time: use `./publicar-vercel.sh` e apague os travados |
| `File size limit exceeded (100 MB)` | binários de `apps/` no envio; `.vercelignore` exclui `/apps`, `/docs`, `/site` (com âncora: sem ela some `frontend/src/components/apps`) |
| `fila_comandos_tipo_check` violada | tipo novo na fila sem ampliar a constraint |
| 500 só em produção num import | dependência removida ainda usada em outro arquivo: `grep -rnE "^\s*(from X\|import X)" backend/app` **sem cortar a saída** antes de tirar do requirements |
| f-string com `\` dentro da expressão | só funciona do Python 3.12 em diante: evite |
| Prévia de e-mail sem logo | iframe `srcdoc` sandbox não carrega imagem por URL: embutir como data URI só na prévia |
| Tela pisca "Só o dono…" | decisão por papel antes de `sessao` carregar |
| Câmera volta à vista inicial a cada mudança no mapa | `enquadrar()` só na primeira montagem |
| Painel engasga ao abrir | compilação de shaders: `renderer.compileAsync` antes do 1º quadro; 3D de baixo só perto da tela |
| Metal sem mapa de ambiente sai preto | `metalness` alto sem envMap: baixar para ~0,45 e dar luz própria |
| Ar preto some no fundo escuro | `Cena3D` dá halo, contorno e luz de recorte às cores escuras |
| Teste com data falsa derruba o login | sessão do Supabase vence; para expediente, mude o horário da pessoa e volte depois |
| Sessão de teste dá 401 | vale 1 h: recriar |
| Fila "não respondeu a tempo" com agente vivo | tabela com id fora de `_TABELAS_COM_ID` (insert não devolve id) |
| Sinric "signature mismatched" | dispositivo criado com outra credencial; recriar com a App Key do `.env` |
| LaunchAgent código 78 | serviço não lê ~/Documents: use `instalar-servico.sh` |
| `CERTIFICATE_VERIFY_FAILED` no Postgres | falta `backend/supabase-ca.crt` no deploy ou `sslrootcert` errado |
| Consultas lentas (0,5–1 s) | use psycopg3 com autocommit (1 ida); do Brasil cada ida custa ~0,27 s, na Vercel ~10 ms |
| `psycopg-binary` não instala | Python 3.15: use 3.13 |
| Transmissor "Local Key mudou" | foi pareado de novo; conectar a conta Smart Life em Configurações → Contas |
| `date > integer` no Postgres | use `CAST(? AS integer)` |
| Manifesto/ícones da PWA vindo como HTML | cache da CDN; testar com `?v=…` |
| Avisos `%c%d`/`fetch data:` no console do site | script do Turnstile, não nosso |
| Porta 8080 ocupada | outro app; o sistema usa 8090 |
| Portão "Executando verificação" parado em "Verificando…" | desafio do Turnstile emperrado do lado da Cloudflare (16/11). `verificacao.js` tem vigia de 20 s: reinicia o widget uma vez e depois mostra "Tentar de novo". Passar pelo site zynio.com.br também libera (cookie `zv` vale para o domínio todo) |
| Infra lenta / "agente não respondeu" | antes a fila era 1 por vez e as ops da Vercel seguravam tudo; agora `infra` roda em paralelo. Se voltar, medir a op direto no agente (`infra.executar`) |

---

## 14. Estado atual e pendências (16/11/2026)

- **Transmissor "Smart IR"** (`eb3f5451cddd399055p54z`) **offline** desde 15/11 00:10; a varredura do Mac não o encontra.
  Conferir tomada e Wi-Fi 2,4 GHz no escritório (e se o Mac está na mesma rede).
- **Nenhum botão IR gravado** no "Ar do escritório": nenhum comando aciona o ar de verdade (as falhas da Atividade são isso).
- Agente: só o Mac (principal). **PC Windows do escritório** ainda não instalado (`instalar-windows.ps1` não foi executado em Windows).
- **Resend**: domínio `zynio.com.br` **verificado** (16/11, São Paulo); remetente `nao-responda@zynio.com.br`; "Esqueci a senha" passa a
  usar o modelo próprio. Webhook cadastrado e segredo salvo (cifrado); e-mail de teste pelo domínio chegou como "entregue" (16/11).
  **SMTP do Supabase Auth pelo Resend** ligado em 16/11 (`smtp.resend.com:465`, usuário `resend`, senha = chave de envio, remetente
  `Clima Escritório <nao-responda@zynio.com.br>`; limite do Auth subiu para 30 e-mails/h). Trocar a chave do Resend = trocar também lá.
  Falta testar o "Esqueci a senha" de ponta a ponta.
- **Cloudflare**: Email Routing ativo (contato@, suporte@, financeiro@, seguranca@ e pega-tudo → Gmail do dono). Token
  `CLOUDFLARE_API_TOKEN` criado em 16/11 ("Clima Escritorio - agente", sem validade, zona zynio.com.br + conta, 9 permissões) e só no
  `.env` do Mac (o PC Windows, quando instalado, precisa do `.env` novo). Leituras e escritas testadas (TXT de teste criado/editado/apagado,
  travas recusando). **DNSSEC ativo** desde 16/11 (Cloudflare `active`; DS no Registro.br: keytag 2371, alg 13, digest SHA-256 conferido contra a DNSKEY
  publicada; publicado no .br em ~5 min; 8.8.8.8 valida com `ad`). Para desligar: tirar o DS no Registro.br, esperar 1 dia, depois desligar na
  Cloudflare. Saúde do domínio: só o alerta de CAA (opcional).
- **Spotify** conectado (Premium); Echo Show 5 aparece; nenhuma rotina criada.
- **Vercel**: ~2,1 GB "Functions Storage"; limpeza de 55 publicações antigas e retenção de 7 dias **aguardando confirmação do dono**.
  `python-docx` saiu (Word gerado por `docx_simples.py`).
- Skill própria da Alexa não criada (opcional). Deison (admin) sem 2FA. Equipe no mapa: Cássio e Alexandre (Analista, seg–sex 8h–18h,
  cargo e horário a confirmar).

---

## 15. Histórico resumido

- **14/11**: domínio zynio.com.br (Cloudflare), site, Turnstile, portão, login Google, white label, segurança.
- **15/11**: sessões e senha endurecidas; apps 1.2.0; mapa no prédio (vidros, janelas, avatares com física, 9º andar), satélites,
  diagnóstico de outra Alexa, código-fonte em /apps, notas de release; mapa com loja, equipe/expediente, persianas, escrita e
  controle de avatar; música (Spotify), passo a passo, Infra (Vercel pelo agente), agente em vários computadores
  (Windows/Linux), catálogo de voz, Atividade com análise, nave no globo; ar escuro legível no painel; Word sem python-docx.
- **16/11**: e-mail transacional pelo Resend (modelos, histórico, webhook, domínio verificado, SMTP do Supabase), CLAUDE.md reorganizado;
  e-mails @zynio.com.br pela Cloudflare Email Routing (SPF da raiz trocado); Infra unida com a Cloudflare (DNS, e-mails, DNSSEC, Turnstile,
  auditoria, saúde do domínio).
