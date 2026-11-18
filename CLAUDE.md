# CLAUDE.md — Clima Escritório (marca zynio)

Guia do projeto para quem (pessoa ou agente) for mexer nele. **Leia as seções 0 a 2 antes da primeira mudança**;
o resto é consulta. Problema em produção? Vá direto aos roteiros da **seção 17**. Vai publicar? **Seção 16** (novidades). Tudo em **pt-BR**: código, nomes, rotas, textos de interface e mensagens de erro.
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
7. **Toda publicação que muda o que o usuário vê ou usa ganha entrada nova em `backend/app/novidades.json`** (seção 16):
   versão, novo, melhorias, segurança, correções. Só fatos que entraram; o modal "O que há de novo" mostra isso a cada pessoa.
8. **Ar só obedece com um agente no escritório.** O agente principal precisa enxergar os transmissores (Infra → Agentes:
   "enxerga N de M"). Mac em casa + PC do escritório desligado = nenhum comando chega ao ar, mesmo com o painel "online".
   Antes de dizer que algo "funciona", confira isso e a Atividade.

### Onde mexer (mapa rápido)
| Quero mudar… | Arquivo(s) |
|---|---|
| Ligar/desligar/temperatura de um ar | `backend/app/clima.py` (`aplicar`, `responderam_juntos`) → `transmissor.py` |
| Instalar ar por ar com o mesmo transmissor (sem interferir no anterior) | `pages/Transmissores.jsx` (`LevarParaOutroAr`: PUT `/hubs/{id}/ares` com só o ar escolhido + projeto dele → copiar botões → teste sem mudar estado) |
| Vários ares num transmissor, **zonas** (ares iguais que obedecem juntos), teste de interferência, mover transmissor | `backend/app/zonas.py`, `rotas/api.py` (`_hub_publico`, `/zonas`, `/hubs/{id}/todos|ares|teste-interferencia`), `clima.aplicar`, `pages/Transmissores.jsx` (`ZonaControle`, `TesteInterferencia`, `EditarAres`) |
| Trocar a conta Amazon do Echo (assistente + teste ao vivo) | `pages/Integracoes.jsx` (`TrocarContaAlexa`), `GET /api/sinric/ultimo-comando`; link da Amazon: `amazon.com.br/hz/mycd/digital-console/alldevices` (Cancelar registro). A troca em si só a Amazon faz |
| Alexa por zona, diagnóstico da Alexa, ritmo dos eventos do Sinric | `backend/app/sinric.py` (`organizar_zona`, `notificar_estado`/`_esvaziar`), `rotas/api.py` (`/sinric/zona/{id}`, `/sinric/diagnostico`), `pages/Integracoes.jsx` (`ZonasAlexa`, `NovaAlexa`) |
| Previsão do tempo (painel e 3D) | `backend/app/clima_externo.py` (`agora`, `tipo_tempo`), `components/tempo3d.js`, cartão no `Mapa3D.jsx` |
| Cidade viva (pedestres, animais, semáforos, TICEN), monitores e sentar/trabalhar | `components/vida3d.js`, `predio3d.js` (semáforo, carros), `cidade3d.js`, `telas3d.js`, `Mapa3D.jsx` (`E.sentar`, `E.telas`) |
| Gerar botões Gree / copiar botões de outro ar | `backend/app/gree.py`, `rotas/api.py` (`/aparelhos/{id}/gree`, `/copiar-botoes`), `pages/Aparelho.jsx` (`AtalhosBotoes`), `scripts/gree_gerar.py` |
| "O que há de novo" (versões) | `backend/app/novidades.json`, `rotas/api.py` (`/novidades`), `components/Novidades.jsx`, `pages/Novidades.jsx` |
| Painel abre em qual ar / aviso "sem transmissor" / ares da sala lado a lado | `pages/Painel.jsx` (`Destaque`, `ControleAr`, `AresDaSala`: projeto com 2+ ares; `atualizar` aplica `juntos`), `components/ArCartao.jsx` |
| Gravação de botões IR | `transmissor.py` (`aprender`), tela `pages/Aparelho.jsx` |
| Quem é o computador principal do agente | `backend/app/coordenador.py`, tela Infra → Agentes |
| Alexa/Google (Sinric) | `backend/app/sinric.py`, tela `pages/Integracoes.jsx` |
| Frases de voz geradas | `frontend/src/vozAlexa.js`, `components/CatalogoVoz.jsx` |
| E-mails (Resend) | `backend/app/correio.py`, `rotas/correio.py`, `pages/Emails.jsx` |
| Música (Spotify) | `backend/app/musica.py`, `rotas/musica.py`, `pages/Musica.jsx` |
| Vercel pelo painel | `backend/app/infra.py`, `rotas/infra.py`, `pages/Infra.jsx`, `components/infra/Vercel.jsx` |
| Cloudflare pelo painel (DNS, e-mails, DNSSEC, Turnstile) | `backend/app/cloudflare.py`, `rotas/infra.py` (`/infra/cf/*`), `components/infra/Cloudflare.jsx`, `Visao.jsx` |
| Elevador e térreo (recepção) do mapa, cores das salas, portas abrir/fechar | `components/elevador3d.js` (`montarElevador`, `montarTerreo`), `Mapa3D.jsx` (`E.irElevador`, `passoViagem`, `E.trocarNivel`), `CartoesMapa3D.jsx` (cartão `sala` e de porta), `rotas/api.py` (`/mapa/salas/{pid}/aparencia`) |
| Página Novidades (linha do tempo 3D) | `pages/Novidades.jsx`, `components/LinhaVersoes3D.jsx` |
| Mapa 2D/3D do escritório | `pages/Mapa.jsx`, `components/Mapa3D.jsx`, `mapaUtil.js`, `predio3d.js` (prédio, ruas, grade A*), `cidade3d.js` (cidade em volta), `dispositivos3d.js`, `CartoesMapa3D.jsx`, `EquipeMapa.jsx`, `catalogoMapa.js` |
| Globo da Segurança | `components/Globo3D.jsx`, `universo.js`, `satelites3d.js`, `nave3d.js` |
| Relatórios e exportação | `relatorio.py`, `exportar.py`, `docx_simples.py` |
| Permissões de rota | `backend/app/acesso.py` (`REGRAS`) |
| Firewall / anti-robô | `firewall.py`, `turnstile.py`, `middleware.js` |
| Passo a passo para o usuário | `pages/Guia.jsx` (e `docs/MANUAL.md`) |
| Instalar o agente em outro PC (código de uso único) | `backend/app/convite.py`, `backend/convite_env.py`, `frontend/public/instalar-agente.ps1` (Windows) e `instalar-agente.sh` (Linux/Raspberry Pi 64 bits), `components/infra/Agentes.jsx` |
| Térreo: porta automática, sair para a calçada | `components/elevador3d.js` (`montarTerreo` → `tickPorta`, `paredes`, `limitesFora`), `Mapa3D.jsx` (`E.terreo`, grade do térreo com célula de 20 cm) |
| Vista da Ilha de Santa Catarina (botão "Ilha" no mapa) | `components/VistaIlha3D.jsx`, `components/ilhaDados.json` (contorno OSM, ODbL, metros a partir de 27,60°S 48,50°O) |
| Aviões, casas e pedestres da cidade | `components/vida3d.js` (`avioes`, `N_PED`), `components/cidade3d.js` (bairros de casas, `telhadoGeo`) |
| Relatório no modelo da Prefeitura (brasão, cabeçalho oficial) | `backend/app/relatorio.py` (`exportar(formato, d, modelo)`, `_cabecalho_oficial`, `_brasao`, `AZUL_PMF`), `assets/brasao-pmf.png`, `docx_simples.py` (`cabecalho`, `numerar_paginas`, `alinhar`), `pages/Relatorios.jsx` (modelo no menu Exportar) |
| Minutas de segurança (política, termos, SoA) | `backend/app/documentos.py`, `GET /api/seguranca/documentos[/{tipo}]`, `components/seguranca/Governanca.jsx` (`Documentos`, `ProximosPassos`) |
| Saúde do computador do agente, reiniciar à distância, Raspberry Pi | `coordenador.py` (`saude`, `cumprir_ordens`, `agente_ordem:<id>`), `rotas/infra.py` (`/agentes/reiniciar`), `components/infra/Agentes.jsx` (`Saude`, `GuiaRaspberry`) |
| Checagem antes de gravar botão / próximo ar | `GET /api/aparelhos/{id}/pronto-para-gravar` (`rotas/api.py`), `pages/Aparelho.jsx` (`Gravar`) |
| Aparelhos (grade, por sala, tabela, lote) | `pages/Aparelhos.jsx` (`problemasDoAr`, `emLote`), `components/ArCartao.jsx` |
| Busca no menu lateral | `components/Layout.jsx` (`CHAVES`, `ConteudoSidebar`) |
| Usuário responsável só por alguns ares | `usuarios.aparelhos` (`"*"` ou lista de ids), `acesso.aparelhos_permitidos/filtro_aparelhos/checar_aparelho`, `rotas/api.py` (`_escopo("a.projeto_id")` já inclui o filtro por ar, `_ids_aparelhos_permitidos`), `rotas/contas.py` (`_resolver_aparelhos`), `components/config/Usuarios.jsx` |

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

### Glossário
| Termo | O que é |
|---|---|
| **Agente** | o backend rodando num computador do escritório (Mac, PC Windows, Linux). Fala com os transmissores pela rede local |
| **Principal / reserva** | só um agente executa (o principal, aluguel em `config.agente_lider`); os outros esperam e assumem em até 45 s |
| **Preferido** | o computador que deve ficar no comando quando online e enxergando os transmissores (`config.agente_preferido`) |
| **Enxergar** | o agente alcança a porta 6668 do transmissor (`ve_transmissores` / `total_transmissores`) |
| **Nuvem** | o mesmo backend na Vercel; não alcança a rede do escritório e pede ao agente pela fila |
| **Fila** | tabela `fila_comandos`: a nuvem grava o pedido, o agente executa e grava o resultado |
| **Transmissor / hub** | o Smart IR SRW-004 (Tuya), tabela `hubs`. Um no teto atende até ~4 ares à vista |
| **Botão / código** | sinal infravermelho gravado (base64 de pulsos), tabela `codigos`; chave `modo_temp_vent` ou `desligar` |
| **Gree** | protocolo do controle Gree: com o Desligar gravado, o sistema gera os 300 ajustes (`gree.py`) |
| **Responder junto / zona** | ares do mesmo modelo à vista do mesmo transmissor obedecem ao mesmo sinal (o IR não tem endereço). O grupo é uma **zona** (`zonas.py`): um comando muda todos, e na Alexa a zona é UM aparelho |
| **Teste de interferência** | assistente que manda o sinal de um ar por vez; quem está no salão marca quem apitou; grava as zonas reais |
| **Portão** | página "Executando verificação de segurança" (Turnstile + cookie `zv`) antes do sistema |
| **Convite / código de instalação** | código de uso único (30 min) que leva o `.env` cifrado para um PC novo |
| **Novidades** | entradas de versão em `novidades.json`, mostradas uma vez a cada pessoa no modal "O que há de novo" |

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
├── scripts/                   gerar-repositorio.mjs (código-fonte em /apps), gerar-notas-release.mjs, gerar-release-json.sh,
│                              gree_gerar.py (gera os 300 botões de um ar Gree a partir do Desligar gravado)
├── backend/
│   ├── requirements.txt       deps do agente (inclui sinricpro)
│   ├── convite_env.py         decifra o .env no PC novo (roda antes de existir .env; não importa o app)
│   ├── supabase-ca.crt        CA raiz do pooler (TLS verificado)
│   └── app/
│       ├── main.py            FastAPI, middleware (CSRF/CSP/HSTS/firewall), ciclo de vida (agente: coordenador → threads)
│       ├── db.py              psycopg3 + pool, "?"→"%s", cfg()/set_cfg() (cifra CHAVES_SENSIVEIS), registrar()
│       ├── seguranca.py · acesso.py · sessoes.py · firewall.py · turnstile.py · cripto.py
│       ├── clima.py           estado do ar → código IR (aplicar), rótulos
│       ├── transmissor.py     envio local/fila/nuvem, aprender, descobrir, autorreparo, laço do agente, fila
│       ├── coordenador.py     agente em vários computadores (principal/reserva/preferido)
│       ├── convite.py         código de instalação do agente em outro PC (.env cifrado com scrypt + AES-GCM, uso único)
│       ├── gree.py            protocolo Gree: gera qualquer botão a partir do Desligar gravado (também usado pelo script)
│       ├── zonas.py           zonas de ar (ares iguais no mesmo transmissor): listar, quem_responde, gravar_do_teste
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
│       ├── novidades.json     "O que há de novo": uma entrada por versão (seção 16)
│       ├── versao_apps.json   última versão dos apps Android/desktop (os apps avisam)
│       └── rotas/  api.py (quase tudo) · contas.py (usuários, sessões, passkeys) · alexa.py (OAuth + diretivas)
│                   musica.py · infra.py · correio.py
├── frontend/                  React 18 + Vite 5 + Tailwind 3 + framer-motion + recharts + three
│   ├── public/                manifest, sw.js (PWA), tema.js, verificacao.js, instalar-agente.ps1, ícones (icone-192.png = logo dos e-mails)
│   └── src/
│       ├── main.jsx · api.js · supabase.js · contexto.jsx · tema.jsx · marca.jsx · preferencias.js
│       ├── mapaUtil.js        completar/colocarMoveis/postosDoMapa/expediente (horaBR, noExpediente)
│       ├── catalogoMapa.js    loja do mapa (itens, modelos, cores)
│       ├── vozAlexa.js        gerador de frases da Alexa (música e ar)
│       ├── components/        Layout, ui (design system), Mapa3D, Cena3D, Globo3D, Barras3D, CartoesMapa3D,
│       │                      EquipeMapa, CatalogoVoz, dispositivos3d, nave3d, predio3d, cidade3d, vida3d (pedestres, animais,
│       │                      TICEN), tempo3d (nuvens/chuva), telas3d (monitores), satelites3d, universo,
│       │                      Novidades (modal), infra/ (Visao, Vercel, Cloudflare, Agentes, comum)…
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
| Linux / Raspberry Pi | `sudo ./instalar-linux.sh` (ou por código: `curl -fsSL https://app.zynio.com.br/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh <código>`) | `sudo ./instalar-linux.sh status` | `journalctl -u clima-escritorio-agente` |

**Raspberry Pi / placas** (testado 17/11 em Debian 12 ARM64 no Docker, a base do Raspberry Pi OS; não testado num Pi de verdade): Pi 3B, 4 e 5
com **Raspberry Pi OS 64-bit** rodam o agente (o instalador por código põe o Python 3.13 à parte pelo uv em `/opt/clima-escritorio/python`;
todas as dependências têm pacote pronto para aarch64). **32 bits (armv7) não**: falta pacote pronto (cryptography, pillow…), o instalador
recusa. **Arduino, ESP32 e ESP8266 não rodam o agente** (é Python com Postgres/TLS/WebSocket); um ESP32 só serviria como transmissor IR
próprio no futuro (exigiria integração nova; não existe hoje). O código do backend compila no Python 3.11, 3.12 e 3.13.

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
| `usuarios`, `passkeys`, `webauthn_desafios`, `sessoes_fortes`, `sessoes_uso` | contas e sessões (`usuarios.novidades_vista` = última versão que a pessoa viu) |
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
Depois do envio, `responderam_juntos`: outro ar no mesmo transmissor com **o mesmo código** para aquela chave também muda de
estado no banco (e na Atividade, "respondeu junto"). A resposta traz `juntos: [ids]`.

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
- **Responsável por ar** (17/11, 1.6.0): `usuarios.aparelhos` = `"*"` (todos os ares dos projetos) ou lista de ids ("Só estes ares" no
  formulário; os projetos da pessoa passam a ser os desses ares). Valem no servidor: `_escopo("a.projeto_id")` soma
  `acesso.filtro_aparelhos("a.id")` (listas, painel, mapa, catálogo da Alexa, relatórios, atividade), `checar_escopo` recusa `aid` fora
  (403 "Este ar não está sob sua responsabilidade") e `_ids_aparelhos_permitidos` limita comandos. Consulta nova sobre a tabela de ares
  com outro alias: somar `acesso.filtro_aparelhos(...)` na mão. Dono/admin sempre `"*"`. Ninguém dá ar que não tem (`_resolver_aparelhos`).
  A Alexa (Sinric) é da conta do sistema, não por pessoa; e um ar de zona muda junto com os outros mesmo para quem cuida só dele (físico).
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
`agente_preferido` faz o principal ceder (só se o preferido estiver online **e** enxergar os transmissores). Cada computador anuncia
`ve_transmissores`/`total_transmissores` (porta 6668 de cada hub, sondada no máximo a cada 30 s: o SRW-004 aceita poucas conexões);
principal cego por ~40 s cede se outro online enxerga; reserva cega não tenta assumir. Preferido: dono **ou admin**.
**Instalar em outro PC** (`convite.py`): Infra → Agentes → código de uso único (30 min, dono ou admin). O agente cifra o `.env` com
scrypt(código)+AES-GCM e grava em `config.agente_convite:<id>` (banco não tem o código, só hash da prova). PC: `frontend/public/instalar-agente.ps1`
(fora do portão no `middleware.js`) → `POST /api/agentes/convite/resgatar` (pública, uso único, erro conta no firewall) → zip do código
(Storage) → `backend/convite_env.py` decifra → `instalar-windows.ps1`. Scripts .ps1 com BOM (acentos no PowerShell 5.1). Perdeu o posto → `os._exit(3)` e o serviço reinicia como reserva. O `main.py` só
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

### 7.13 Vários ares num transmissor
- Banco: vários `aparelhos` com o mesmo `hub_id` (o ar pode ser de outro projeto). Recomendado até **4** (`LIMITE_ARES_POR_TRANSMISSOR`),
  todos à vista (8–10 m, sem parede, divisória ou porta no caminho).
- `GET /api/hubs` traz por transmissor `ares` (id, nome, projeto, ligado, botões), `juntos` (grupos com o mesmo `desligar` =
  mesmo modelo) e `limite_recomendado`. A tela mostra "N de 4", aviso de ares que respondem juntos e de excesso.
- `POST /api/hubs/{id}/todos {ligado, modo?, temperatura?}` (`aparelhos.controlar`, respeita o escopo de projetos): um ar por vez,
  1,2 s entre eles; quem já mudou junto não recebe o sinal de novo. Devolve `feitos` e `falhas`.
- Botões sem gravar: `POST /api/aparelhos/{id}/copiar-botoes {de}` (mesmo modelo) e `POST /api/aparelhos/{id}/gree`
  `{acao: conferir|testar|gerar}` (Gree; testar manda Frio 24° pela fila; gerar grava 300 botões com rótulo "gerado (Gree)").
- "Adicionar ar a este transmissor" abre `/aparelhos?novo=1&hub=<id>&projeto=<id>` (`FormAparelho` aceita `padrao`).
- Ares **iguais** só ficam independentes com um transmissor para cada, perto e virado só para o seu ar.
- **Zonas** (`zonas.py`, `config.zonas` + `config.zonas_testadas`): `listar()` = zonas salvas + automáticas (mesmo Desligar no
  mesmo transmissor; transmissor já testado não ganha zona automática). `quem_responde()` é chamado em `clima.aplicar` ANTES do
  envio: os ares da zona mudam junto no banco (`responderam_juntos`) e os que estão na Alexa vão no `contexto.juntos` para o
  agente avisar o Sinric. Rotas: `GET|PUT /api/zonas`, `POST /api/zonas/{id}/estado` (um sinal, a zona inteira),
  `POST /api/hubs/{id}/teste-interferencia` (`enviar` não mexe no estado salvo; `gravar` = componentes conectados viram zonas),
  `PUT /api/hubs/{id}/ares` (planejar/mover: quem sai fica `hub_id = NULL`). `/api/aparelhos`, `/painel` e o detalhe trazem
  `zona {id, nome, total, outros}` para a tela avisar. Limite recomendado: 6 ares por transmissor.
- **Escritório (16/11)**: salão aberto; transmissor A = Escritório, Bancada, Analistas, Diretor, Deison (5 Gree iguais = zona
  "Salão"); B = Fabio e Devs; C = Reunião (a comprar). Roteiro: `docs/continuar/2026-11-16-nova-alexa-e-zonas.md`.

### 7.13b Alexa com zonas e muitos ares (`sinric.py`)
- Uma zona = **um** aparelho no Sinric (`organizar_zona`: renomeia/cria o representante e apaga os outros da zona; `executar=false`
  devolve só a prévia). Rota `POST /api/sinric/zona/{id}` `{nome, executar}`; tela Integrações → Zonas na Alexa (prévia + confirmar).
  **Mudar o Sinric muda o que a Alexa conhece: sempre mostrar a prévia e pedir o "sim" do dono.**
- Eventos para o Sinric: fila por aparelho com só o último estado, envia só os campos que mudaram, `INTERVALO_EVENTO` = 1,2 s
  entre eventos (rajadas são descartadas pelo Sinric). Reconexão zera `_enviado`.
- Diagnóstico (`/api/sinric/diagnostico`) também confere: zona por zona (1 aparelho na Alexa), capacidade (zonas + ares soltos ≤ 3
  no grátis) e se o agente no comando enxerga os transmissores.
- Alexa nova com a mesma conta: só ativar a skill Sinric Pro nela e "descobrir dispositivos" (cartão "Nova Alexa" em Integrações).

### 7.14 Um comando de ar, de ponta a ponta (onde olhar quando falha)
1. **Tela** (`Painel`/`ArCartao`/`Aparelho`/mapa) → `POST /api/aparelhos/{id}/estado`. Botões desativados = ar sem `hub_id`
   (a tela diz "sem transmissor"). Sem pedido na rede = problema na tela, não no backend.
2. **Nuvem** (`clima.aplicar`): escolhe o código. Erros "Nenhum botão gravado…" / "Botão Desligar ainda não foi gravado" saem aqui
   e vão para `atividade` com `ok = 0`.
3. **Fila** (`transmissor.enviar` no papel nuvem): linha `enviar` em `fila_comandos`, espera 8 s. "Tempo esgotado" = nenhum agente
   principal pegou (agente offline ou cego).
4. **Agente principal** (`processar_fila_uma_vez`) → `_enviar_local` (tinytuya, TCP 6668). `WinError 10048`/"sem resposta" = rede
   ou varredura UDP concorrente; "Local Key mudou" = pareado de novo.
5. **Transmissor → ar**: o ar apita se aceitou. Não apitou = sinal errado (Gree com soma errada, gravação ruim) ou sem visada.
Onde ver: Atividade (filtro falhas), `fila_comandos` (estado/erro), Infra → Agentes (quem é o principal e o que enxerga),
log do agente (`~/Library/Logs/ClimaCasa.log`, `data\agente.log` no Windows).

### 7.14b Raspberry Pi e saúde dos agentes (1.6.0 e 1.7.0)
- Instalação por código: `curl -fsSL https://app.zynio.com.br/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh <código>` (só 64 bits;
  Python 3.13 à parte pelo uv em `/opt/clima-escritorio/python`; código em `/opt/clima-escritorio/ar-controle`; serviço systemd do
  `instalar-linux.sh`). Passo a passo na tela Infra → Agentes (`GuiaRaspberry`): Imager com hostname `clima-agente`, usuário `clima`, SSH e
  Wi-Fi 2,4 GHz do escritório; `ssh clima@clima-agente.local`.
- Cada agente anuncia `saude` (modelo, IP, temperatura, memória, disco, carga, ligado há) em `agente_maquina:<id>`.
- "Reiniciar agente": `POST /api/agentes/reiniciar {id}` grava `agente_ordem:<id>`; o computador lê no próximo anúncio (~10 s), libera o
  posto se for principal e sai com `os._exit(3)` (o serviço o liga de novo).

### 7.15 Novidades a cada versão
`backend/app/novidades.json` → `GET /api/novidades` (logado; devolve `versoes`, `atual`, `vista`, `mostrar`) e
`POST /api/novidades/vista {versao}` (grava `usuarios.novidades_vista`). O `NovidadesModal` (no `Layout`, fora do bloco que remonta por
rota) abre uma vez por pessoa quando `atual > vista`, em qualquer aparelho. A primeira leitura de uma versão cria a notificação
`versao:<v>` (gravidade baixa, link `/novidades`). Página `/novidades` com o histórico. Processo na seção 16.

---

## 8. Interface web

### 8.1 Rotas (`frontend/src/main.jsx`; todas protegidas exceto `/login`, `/redefinir-senha`)
| Rota | Tela |
|---|---|
| `/` | Painel (abre num ar **com transmissor**, ligado primeiro; ar sem transmissor mostra aviso em vez de botões mudos): avisos do que impede o ar de obedecer, métricas, ar 3D grande (cor do mapa), integrações, semana, gasto, escritório 3D compacto, origens, uso por hora, barras 3D, aparelhos, atividade. Os 3D de baixo montam perto da tela ou no ocioso |
| `/projetos` | projetos com meta de gasto, aparelhos ao vivo, desligar todos, exportar |
| `/mapa` | mapa 2D (edição) e 3D (seção 8.2) |
| `/relatorios` | período livre, conclusões, comparativo, sessões, fora do expediente, exportar em 8 formatos |
| `/aparelhos`, `/aparelhos/:id` | lista e detalhe (mostrador, modos, botões, gravação, temporizador, histórico). Botões gravados: **Copiar de outro ar** e **Controle Gree** (Conferir → Testar → Gerar 300). `?novo=1&hub=&projeto=` abre o cadastro já preenchido |
| `/cenas`, `/automacoes`, `/agendamentos` | automação |
| `/transmissores` | SRW-004: status, importar, procurar na rede, reconectar; por cartão **Ares atendidos** (N de 4), Ligar/Desligar todos, aviso de ares que respondem juntos, Adicionar ar a este transmissor |
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
| `/guia` | **passo a passo** (19 capítulos: Smart Life, transmissores, botões, desligar de longe, agente no Windows, **um transmissor para vários ares**, Sinric, outra Alexa, Google, mapa, música, domínio e e-mails, problemas). `/guia#<id>` abre no capítulo |
| `/novidades` | linha do tempo das versões em 3D (Three.js, clicar leva à versão), versão atual com a proporção por tipo, números, filtro por tipo, busca, índice lateral e cada versão por inteiro; o modal "O que há de novo" aparece sozinho uma vez por versão |
| `/oauth/autorizar`, `/redefinir-senha`, `/login` | fluxos de conta |

### 8.2 Mapa (2D/3D)
- Planta em `config.mapa`: `salas` (por projeto), `ares` (posição + `modelo` split/cassete/piso_teto/janela + `cor`),
  `elementos` (porta, janela com `aberta` 0–100, mesa, estacao, bancada, gaveteiro, armário, sofá, dispositivos da loja com
  `modelo`/`cor`/`ligado`…), `auto`, `andar` (9º), `andares` (11, total do prédio), `pessoas` (nome, cargo, sala, posto, expediente, aparência) e `escritas`
  (caneta azul/preta/vermelha nos vidros).
- Vidro só na parede da porta das salas privativas, nas divisórias entre elas e na parede da bancada para o salão.
  `colocarMoveis` cria uma vez a mesa individual e a janela em frente à porta (ids em `mapa.auto`).
- Postos (`postosDoMapa`): mesa individual = id do elemento; fileira `id:i:a|b` (a = oeste/esquerda); bancada `id:i`;
  automático `sala-<id>`. Pessoa fora do expediente (Brasília) não aparece e o posto fica vazio.
- Prédio (`predio3d.js`): `andares` no total (térreo e 1º no pódio, 2º ao último na torre), escritório no `andar`. Torre com pele de
  vidro (`texturaCortina`), faixas brancas de sacada e colunas azuis (inspirado no prédio real), cobertura com platibanda, caixas
  d'água e condensadoras. O andar tem **corredor de 4,2 m** (`MARGEM` no `Mapa3D`; era 2,5 e o avatar enroscava) em volta das salas,
  guarda-corpo de vidro e a grade A* até a fachada (`E.limitesAndar`): ninguém sai da laje.
- **Elevador e térreo** (`elevador3d.js`, 17/11): núcleo com 2 carros encostado na parede de fora **ao lado da porta de entrada**,
  saindo para o corredor, portas viradas para o mesmo lado da porta. Cabine de verdade, folhas que correm, mostrador do andar.
  Controlando um avatar perto da porta do elevador: **R** (ou o botão) → abre, entra, fecha, tela "indo para" com a contagem, troca de
  nível, abre e sai (`E.viagem`, fases abrir/entrar/fechar/viajar/abrir2/sair; câmera de cinema). **Térreo** = recepção dentro do pódio
  (`predio.podio`, y = -yA): piso de pedra, balcão com recepcionista, painel de ripas com o nome, catracas (uma livre), sala de espera,
  colunas, vasos, placa de andares, segurança e 2 pessoas andando, com **grade própria** (`E.gradeAtiva`). `E.trocarNivel` esconde o
  andar inteiro (e os rótulos) no térreo; Esc no térreo devolve a pessoa ao andar, na frente do elevador. Inox com metal 0,45 (metal
  alto sem mapa de ambiente sai preto). Teste no Playwright: esperar as fases (`E.viagem.fase`), não tempo fixo (headless é lento).
- **Salas e portas**: `mapa.salas[pid]` tem `cor_piso`, `cor_cadeira`, `cor_mesa` (vazio = padrão; cadeiras/tampos recoloridos por sala
  depois de montar). Porta: `aberta >= 50` aberta (folha quase encostada na parede), `< 50` fechada (no vão, **bloqueia** a grade).
  Cartão da sala (clicar no chão) e cartão da porta. `POST /api/mapa/salas/{pid}/aparencia {piso, cadeira, mesa, porta, porta_aberta}`
  (cores = `projetos.gerenciar`; só abrir/fechar = `aparelhos.controlar`). Porta "da sala" = a menor sala que contém o centro dela.
  Tipo `coluna` = pilar redondo de concreto (o pilar-reuniao fica em frente à porta da Reunião). Planta ampliada em 17/11: Escritório
  1880×740, Reunião 870×340, fileira de baixo em y=1120 (cópia de antes: pedir ao dono, não versionada).
- Cidade (`cidade3d.js`): lotes de 24 m a cada 34 m (±170 m) fora do quarteirão e das avenidas, 7 estilos de prédio, praças, árvores
  e postes; skyline ao fundo. Tudo mesclado por material (`mergeGeometries`) e instâncias: ~20 chamadas de desenho. Na direção da
  câmera e perto do prédio, só prédios baixos. Nada de prédio real ou marca.
- **Tempo**: `GET /api/clima-externo` traz `tipo` (limpo, nublado, neblina, chuva, trovoada), `nuvens`, `proximas` (12 h) e
  `dias` (3). O `Mapa3D` busca a cada 10 min e chama `predio.definirTempo(tipo, nuvens)` (nuvens instanciadas, chuva em linhas,
  clarões, asfalto molhado; neblina/chuva encurtam a névoa). Cartão da previsão com Agora/Sol/Nublado/Chuva/Trovoada.
- **Vida** (`vida3d.js`, tudo instanciado): pedestres nas calçadas das quadras (`cidade3d` devolve `calcadas`/`pracas`), cães,
  pombos que voam quando alguém passa, gaivotas, gatos, quem atravessa nas faixas na fase de pedestres; **terminal inspirado no
  TICEN** do outro lado da avenida horizontal (3 plataformas cobertas, 6 ônibus com fila, passageiros). Semáforo no cruzamento
  (`predio3d`): ciclo de 30 s, carros freiam na retenção e guardam distância.
- **Monitores** (`telas3d.js`): textura por posto com semente própria e papel pela sala (Devs código, Analistas planilha/painel,
  Diretor/Deison/Fabio e-mail/agenda, Bancada terminal, Reunião slides); posto vazio = tela bloqueada. Redesenho só perto da câmera.
- **Sentar e trabalhar**: no controle, `F`/botão senta na cadeira livre a até 1,4 m (`E.sentar`); quem já estava sentado continua
  sentado ao ser controlado; parar o controle sentado deixa a pessoa trabalhando. Cartão da pessoa: nome, sexo, cargo, sala, agora.
  Figurante não senta em sala que tem equipe cadastrada. `PessoaMapa.sexo` (masculino/feminino/vazio).
- **Teste**: `localStorage['clima-debug-3d'] = '1'` expõe `window.__mapa3d` (estado do 3D) para o Playwright; nada além do próprio 3D.
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
**Verificação alternativa** (`verificacao.js`, igual em `frontend/public` e `site/public`): se o Turnstile não resolver em 7 s, der
erro ou nem carregar, o navegador resolve uma prova de trabalho (`GET /api/verificacao/desafio`: SHA-256 com 16 bits zero, HMAC com
`VERIFICACAO_SEGREDO`, 5 min) e manda `{prova}` no mesmo `POST /api/verificacao` (FastAPI `_prova_ok`; site `app/api/verificacao/pow.js`).
O login continua com Turnstile + firewall. Mudou o script? Suba o `?v=` em `middleware.js` e `site/lib/portao.mjs`.

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
- **Aparelhos/transmissores/automação**: `/aparelhos…` (estado, aprender, botões, temporizador, sinric, `gree`, `copiar-botoes`), `/hubs…`
  (+ `POST /hubs/{id}/todos`), `/projetos`,
  `/cenas`, `/agendamentos`, `/automacoes`, `GET /gravacoes/{job}`
- **Mapa**: `GET|PUT /mapa`, `POST /mapa/elementos/{id}/estado`, `POST /mapa/ares/{id}/aparencia`, `PUT /mapa/pessoas`, `PUT /mapa/escritas`
- **Relatórios**: `GET /relatorios/completo`, `GET /relatorios/exportar?formato=pdf|docx|xlsx|csv|html|xml|json|md`
- **Integrações**: `/sinric…` (+ `/sinric/diagnostico`), `/alexa…`, `/tuya…`
- **Música**: `/musica/estado|credenciais|conectar|retorno|desconectar|tocando|comando|buscar|playlists|rotinas|rotinas/testar`,
  pública `POST /musica/spotify-retorno`
- **E-mail**: `GET /email/estado`, `PUT /email/config` (chave vazia mantém, "-" apaga), `POST /email/dominio/provisionar|verificar`,
  `GET /email/modelos`, `GET /email/modelos/{tipo}/previa`, `POST /email/teste`, `GET /email/envios`, pública `POST /email/webhook`
- **Infra/agentes**: `GET /infra/saude|resumo|uso|publicacoes|publicacoes/{id}/log|variaveis`, `POST /infra/publicacoes/acao|limpar|retencao`,
  `GET /agentes`, `POST /agentes/preferido|esquecer|convite` (dono ou admin)
- **Segurança e marca**: `/seguranca…` (resumo, relatório, checklist, ips, eventos), `/marca…`, `/notificacoes…`
- **Zonas**: `GET|PUT /zonas`, `POST /zonas/{id}/estado`, `POST /hubs/{id}/teste-interferencia`, `PUT /hubs/{id}/ares`; Alexa: `POST /sinric/zona/{id}`
- **Novidades**: `GET /novidades`, `POST /novidades/vista` (qualquer usuário logado)
- **Agentes (público)**: `POST /agentes/convite/resgatar` (uso único; erro conta no firewall)
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
- **Novo ar numa sala** (sala = projeto): roteiro e prompt prontos em `docs/continuar/2026-11-16-ares-por-sala.md`. Pela tela:
  Transmissores → "Adicionar ar a este transmissor" → Botões gravados → Desligar → Controle Gree (ou Copiar de outro ar).
  Terminal: `scripts/gree_gerar.py <id>` (`--testar`, `--gravar`).
- **Nova versão para os usuários**: entrada no topo de `backend/app/novidades.json` (seção 16). Se os apps mudaram, também
  `docs/releases/vX.Y.Z.md` e, depois do release, `versao_apps.json`.
- **Commits**: pt-BR, terminar com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Checklist antes de entregar
1. `cd frontend && npx vite build` sem erro; auditor ≥ 98.
2. `cd backend && ../.venv/bin/python -c "import app.main"`.
3. Navegador (Playwright) com sessão temporária: telas tocadas em 1440 e 375, sem erro de JS, sem 4xx/5xx, sem rolagem lateral.
4. Entrada nova em `novidades.json` se o usuário vai notar a mudança (o `publicar-vercel.sh` avisa quando falta).
5. Commit (sem segredos) + push; `./publicar-vercel.sh`; `./instalar-servico.sh`; `/saude` 200; rotas novas 401 sem login
   (logo depois de publicar, a 1ª chamada pode cair na publicação antiga e dar 404: repita).
6. Apagar a sessão de teste e dados de teste do banco; relatar o que **não** foi testado. No Playwright, intercepte
   `POST /api/novidades/vista` para não marcar o dono como "já viu" (e feche o modal com Esc antes de clicar na tela).

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
- **Auditoria (rodar antes de releases grandes)**: `uvx pip-audit -r requirements.txt` e `-r backend/requirements.txt`;
  `cd frontend && npm audit --omit=dev` (e `site/`); `cd backend && uvx bandit -r app -ll -q`. Estado em 16/11: Python e site sem
  achados; frontend com aviso moderado do react-router (só SSR, que não usamos; correção exige v7); bandit B608 = falsos positivos
  (identificadores vêm de listas fechadas e valores vão como `?`), B104 = string "0.0.0.0" do firewall, não bind.
- **Permissões de rota**: `rotas_sem_regra()` (rotas/api.py) lista rotas que mudam dados sem regra em `acesso.REGRAS` (fora
  `/api/infra/`, `/api/email/`, `/api/agentes/`, que exigem `configuracoes.gerenciar` + papel de propósito). Aparece no checklist da
  tela Segurança; meta: vazio. As rotas públicas (sem login) são 23, todas com proteção própria (Turnstile, Svix, `state`, prova).
- **Auditoria completa (17/11, skill `cloudflare/security-audit-skill`)**: relatório em `~/security-audit-skill/clima-casa/run-1/`
  (`REPORT.md`, `NEEDS-VALIDATION.md`, `findings.json`). 18 pistas, todas corrigidas na 1.4.2. **Regras que ficaram** (não desfazer):
  - **Escopo de projetos não é só `checar_escopo`** (ele só olha `aid` em /aparelhos, `hub_id`, `cid`, `pid`, `gid`). Rota nova com
    outro nome de parâmetro (`hid`, `zid`, `/automacoes/{aid}`) ou que lista várias tabelas precisa checar na mão: `_exigir_aparelhos`,
    `_exigir_projeto`, `_ids_aparelhos_permitidos`, `_exigir_hub_inteiro` (zonas/teste: todos os ares do transmissor), `_exigir_hub_usavel`
    (vincular ar a transmissor), `_exigir_automacao` (gatilho sem ar = todos os ares), `_visibilidade_notificacoes` (notificações).
  - `/api/backup` e `/api/supabase/*` exigem acesso a **todos** os projetos (`acesso._SO_ACESSO_TOTAL`), além da permissão.
  - `contas._pode_mexer_em`: quem não é dono/admin só mexe em conta cujas permissões e projetos cabem nos dele.
  - `fila_comandos.resultado` de `infra` é apagado assim que a nuvem lê (`rotas/infra._via_agente`): resposta de agente pode ter segredo.
  - Alexa (skill própria): só dono/admin aprova; `oauth_*.usuario_id` prende o token a quem aprovou (`alexa.dono_valido`); troca de
    código/refresh com `DELETE … RETURNING`; diretiva só age em ar com `alexa = 1`.
  - Agente sem `proxy_headers` (só com `CLIMA_CONFIAR_PROXY=1`); instalador Windows tira a herança de permissão da pasta (`Proteger-Pasta`).
  - Planilhas: todo texto passa por `exportar.celula` (= + - @ viram texto). Login: limite por conta além do por IP (`firewall.falhas_da_conta`).
  - **CAPTCHA no Supabase Auth: LIGADO em 17/11/2026** (Attack Protection, provedor Turnstile, mesmo segredo `TURNSTILE_SECRET_KEY`). Desligar = os dois passos ao contrário (Supabase primeiro, depois `config.auth_captcha`). O código
    (`turnstile.no_supabase()` lê `config.auth_captcha.ativo`; com ele, `/api/auth/entrar` e `/api/conta/conferir-senha` mandam o token
    para o Supabase em `gotrue_meta_security.captcha_token` em vez de conferir antes). Ligar = PATCH na Management API
    (`security_captcha_enabled/provider/secret`) **e** `config.auth_captcha = {"ativo": true}` juntos. Efeito colateral: o **login por
    senha do app Android** para (ele chama o Supabase direto, sem Turnstile; Google continua) e o reserva do "esqueci a senha"
    (`/auth/v1/recover`) também; o caminho principal pelo Resend segue. Perfil confere a senha atual pelo servidor (`/api/conta/conferir-senha`).
  - Apps: Android com PKCE e desktop com filtro de esquema **só valem no próximo build/release**.
- **Conformidade ISO 27001 (17/11)**: nota 56% (anexo 60%). O sistema sela a integridade a cada hora (agente, `agenda.laco`). 8.18, 8.19 e
  8.25 são "do sistema" (`conformidade.SISTEMA`). Minutas no modelo da Prefeitura em `documentos.py` (nada vira "implementado" sozinho: a
  direção aprova e o admin marca com a evidência). Físicos e de pessoal: só a organização resolve; nunca marcar sem evidência.

---

## 13. Armadilhas conhecidas (já aconteceram)

| Sintoma | Causa / solução |
|---|---|
| Deploy "BLOCKED"/"Building…" para sempre | Hobby bloqueia autor fora do time: use `./publicar-vercel.sh` e apague os travados |
| `File size limit exceeded (100 MB)` | binários de `apps/` no envio; `.vercelignore` exclui `/apps`, `/docs`, `/site` (com âncora: sem ela some `frontend/src/components/apps`) |
| `fila_comandos_tipo_check` violada | tipo novo na fila sem ampliar a constraint |
| 500 só em produção num import | dependência removida ainda usada em outro arquivo: `grep -rnE "^\s*(from X\|import X)" backend/app` **sem cortar a saída** antes de tirar do requirements |
| f-string com `\` dentro da expressão | só funciona do Python 3.12 em diante: evite (quebrava `exportar.py`/`docx_simples.py` no 3.11, corrigido 17/11). Conferir: `uv run --python 3.11 --no-project python -m py_compile …` |
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
| Botões do Painel desativados sem motivo aparente | o ar escolhido não tem transmissor (ex.: "Ar dos devs"). O Painel agora abre num ar com transmissor e avisa |
| João (ou outro) "consegue pelo mapa e não pelo painel" | conferir qual ar está selecionado e se há agente principal enxergando os transmissores (seção 7.14) |
| `Cannot read properties of undefined (reading 'isReady')` | descartar material enquanto `compileAsync` roda; o descarte espera `E.compilacao` |
| Rolagem lateral só no `/mapa` (celular) | canvas mede o contêiner e a grade de coluna `auto` cresce junto: use `grid-cols-1` / `minmax(0,1fr)` |
| `/api/<rota nova>` 404 logo depois de publicar | 1ª chamada caiu na publicação antiga durante a troca do endereço; repita |
| Teste Playwright travado por um modal | é o "O que há de novo": intercepte `/api/novidades/vista` e aperte Esc |
| Instalador Windows: falha ao decifrar / acentos quebrados | PowerShell 5.1 grava UTF-8 **com BOM**: JSON com `UTF8Encoding($false)`, Python com `PYTHONUTF8=1` e `utf-8-sig` |
| `WinError 10048` no agente Windows | duas varreduras UDP (6666/6667) ao mesmo tempo (reparar + autorreparo). Passa sozinho; se repetir, reiniciar o serviço |
| `app.routes` do FastAPI só mostra `_IncludedRouter` | esta versão não achata: percorra os `APIRouter` (`rotas_sem_regra`) |
| `curl -X $1` com `set --` no zsh dá 405/404 falsos | separação de palavras do zsh; teste com comandos explícitos |
| Cintilação (listras) no asfalto do cruzamento | planos a 2 mm de distância brigam no depth buffer à distância: afaste ≥ 3 cm |
| Avatar sentado: trocar câmera volta "Sentar" | `mudarModo` precisa repassar `sentado` ao `setControle` |
| Dois ares Gree ligam juntos | é físico (zona). Não é bug: ver seção 7.13 |
| Portão do app volta para si mesmo / "Verificando…" para sempre | (1) `db.carregar_env` só lê do ambiente da Vercel os prefixos `SUPABASE_`, `TUYA_`, `CLIMA_`, `TURNSTILE_`, `VERIFICACAO_`: variável nova com outro prefixo NÃO chega à nuvem (até 17/11 o `VERIFICACAO_SEGREDO` não chegava e o app nunca gravava o passe). (2) Turnstile emperrado (Brave, bloqueadores): a verificação alternativa assume em 7 s |
| Checagem de segredos "passou" mas o commit seguiu | encadeie com `&&` (`test "$(git diff --cached \| grep -c …)" = 0 && git commit`); `;` ignora o resultado |
| `ERR_CERT_AUTHORITY_INVALID` / "Failed to fetch" no login, só em certas redes | firewall corporativo (Fortinet/FortiGate) fazendo inspeção SSL troca o certificado de `zynio.com.br` (domínio novo, de 14/11: o FortiGuard trata como não classificado). Conferir: `openssl s_client -connect app.zynio.com.br:443 -servername app.zynio.com.br \| openssl x509 -noout -issuer` (Fortinet = interceptado). Na hora: usar `https://clima-casa-lac.vercel.app` (Turnstile aceita; biometria não, o RP ID é zynio.com.br). De vez: a TI da rede libera `zynio.com.br` e `*.zynio.com.br` da inspeção, ou pedir a reclassificação no FortiGuard. Nunca instalar a CA do Fortinet num Mac pessoal. Essas redes também bloqueiam 5432/6543: o agente não alcança o banco lá |
| "name 'tinytuya' is not defined" (Procurar na rede 502) | `transmissor.py` importa tinytuya dentro das funções (a nuvem não precisa dele); função nova que usa tinytuya importa por conta própria. Antes de publicar: `uvx ruff check --select F821 backend/app` (nome não definido) |
| Ligaram pelo controle remoto e o painel não mudou | não tem como saber sozinho (IR só vai num sentido, o SRW-004 não tem sensor). Painel → "Ligaram ou mudaram pelo controle?" (`POST /aparelhos/{id}/estado-real`, sem sinal). Ar de sala fechada mudando "junto" no sistema: `POST /aparelhos/{id}/zona {junto:false}` (marca o transmissor como conferido) ou o teste de interferência |
| Superfície piscando no 3D só de longe | planos muito próximos brigam no buffer de profundidade: afastar ≥ 5 cm e/ou `polygonOffset`; o `camera.near` sobe para 0,6 m com a câmera longe (tick do Mapa3D) |
| Retenção da Vercel dá 400 "additional property `deploymentExpiration`" | a Vercel tirou a retenção da API (nov/2026): `infra.op_retencao` só avisa; mudar no painel (Settings → Build and Deployment → Deployment Retention Policy). Apagar publicações (`op_limpar`) continua pela API |
| 3D vaza por cima de outro cartão só em tela retina | `renderer.setSize(w, h, false)` não ajusta o CSS do canvas: use `setSize(w, h)` ou CSS `w-full h-full` no canvas |
| Rolagem lateral numa tela com gráficos/tabelas | grade sem coluna base (`grid gap-6 lg:grid-cols-…`) cresce pelo conteúdo no celular: `grid-cols-1` ou `minmax(0,1fr)` |
| `pip download --platform …` dá "Invalid requirement" no zsh | variável com várias opções não se divide no zsh: escreva as opções por extenso |
| Avatar preso na recepção do térreo | a grade do térreo precisa incluir `T.limitesFora` e as `T.paredes` (vão da porta livre); a porta automática abre a 3,4 m |
| Infra lenta / "agente não respondeu" | antes a fila era 1 por vez e as ops da Vercel seguravam tudo; agora `infra` roda em paralelo. Se voltar, medir a op direto no agente (`infra.executar`) |

---

## 14. Estado atual e pendências (16/11/2026, noite)

- **17/11, noite (1.7.0)**: diário completo da sessão e o comando para continuar numa sessão nova em
  `docs/continuar/sessao-2026-11-17/` (`continuar.sh`). Pendências principais: Alexa nova (descobrir dispositivos), Raspberry Pi em
  hardware, teste de interferência no salão, transmissor C, conformidade (2FA do Deison, responsável do plano, minutas aprovadas) e
  release dos apps.

- **17/11, fim da tarde (1.6.0)**: #12 **Ar do Fabio** (projeto 8, transmissor "Smart IR · Fabio e Devs"), #13 **Ar da reunião** (projeto 5,
  **sem transmissor** até o C ser comprado) e #4 **Ar dos devs** com 301 botões copiados do #1 (marca Gree). No mapa não sobram vagas.
  Sinric **9 de 9**: os 3 novos nas salas "Sala Fabio", "Devs" e "Reunião" (offline até um agente enxergar o transmissor B; Reunião só com
  transmissor). Ar do Fabio e Ar dos devs no mesmo transmissor B e iguais = zona automática de 2 (teste de interferência pendente).
  Usuário responsável por ares específicos e instalador do agente para Raspberry/Linux publicados.

- **Ares cadastrados (17/11)**: no transmissor "Smart IR · Escritório", 6 Gree iguais com 301 botões cada (copiados do Ar do escritório):
  #1 Ar do escritório, #7 Ar dos analistas, #8 Ar do diretor, #9 Ar servidor, #10 Ar Guilherme (os dois da Sala Bancada), #11 Ar do Deison → **zona
  automática** "Zona Smart IR · Escritório" (um sinal muda os 6). **Os 6 estão na Alexa** (decisão do dono, 17/11: um dispositivo por ar),
  cada um numa **sala do Sinric com o nome do projeto** (`sinric._sala_do_projeto`, cria a sala com o `homeId` da casa padrão; renomear
  ou mudar o projeto move a sala). O diagnóstico avisa "6 ares da zona na Alexa": é esperado; falar com um muda os 6 de verdade e o
  agente avisa o Sinric de todos (`contexto.juntos`). Teste físico pendente (precisa de agente no escritório e alguém no salão: teste de interferência).
  No mapa, as vagas viraram ares; sobram `ar-reuniao` e `ar-semnome` (Sala Fabio).
- **Ares (histórico)**: "Ar do escritório" (projeto Escritório) com **301 botões** (Desligar gravado + 300 gerados pelo protocolo Gree),
  no transmissor "Smart IR · Escritório", na Alexa (Sinric). Ligar, desligar e temperatura testados de verdade em 16/11 à tarde.
  "Ar dos devs" (projeto Devs, salão ao lado da TV, cor `#18181b`): **sem transmissor e sem botões**.
- **Transmissores**: "Smart IR · Escritório" (192.168.59.85, visto pela última vez 16/11 19:01) e "Smart IR · Sala Bancada"
  (`eb3f5451cddd399055p54z`, 192.168.59.14, visto 16/11 18:23). Os dois aparecem offline porque **nenhum agente no escritório**
  está ligado agora (não necessariamente desligados).
- **Agentes**: Mac do dono (MacBook-Air, principal agora, mas fora do escritório: enxerga 0 de 2) e **PC do João PMF-182063**
  (Windows 11, instalado por código em 16/11 ~18:35, **preferido**, enxergou 1 de 2, offline desde 19:02). Enquanto o PC do João
  estiver desligado e o Mac fora da rede, nenhum comando chega aos ares. Pendente: deixar um PC do escritório sempre ligado.
- **Painel**: corrigido em 16/11 (abria no "Ar dos devs" sem transmissor e os botões ficavam mudos).
- **Plano de transmissores do dono (16/11, noite)**: salão aberto; A "Smart IR · Escritório" atende Escritório, Bancada, Analistas,
  Diretor e Deison (5 Gree iguais = zona "Salão", ainda só o Ar do escritório cadastrado); B renomeado para **"Smart IR · Fabio e
  Devs"** (projeto Sala Fabio; o "Ar dos devs" foi vinculado a ele, ainda sem botões: copiar do Ar do escritório se for Gree igual);
  C (Reunião) ainda não comprado. Zonas e teste de interferência prontos, **teste real pendente** (precisa de alguém no salão).
- **Alexa definitiva**: mesma conta do Sinric. Pendente: organizar as zonas na Alexa (renomear "Ar do escritório" → "Ar do salão",
  só com o "sim" do dono) e ativar a skill na Alexa nova. Roteiro: `docs/continuar/2026-11-16-nova-alexa-e-zonas.md`.
- **Equipe**: projeto 7 renomeado para **Analistas**; Cássio e Alexandre com sexo masculino (aparecem só no expediente); **Deison**
  cadastrado (masculino, Sala Deison, cargo "Subsecretário" **a confirmar**, seg–sex 8h–18h).
- **Vários ares por transmissor**, **Gree pela tela** e **novidades por versão** (1.3.0 e 1.3.1) publicados em 16/11. Não testado com
  ares reais além do Ar do escritório (os outros transmissores ainda vão para o teto: `docs/continuar/2026-11-16-ares-por-sala.md`).
- **Mapa 3D**: prédio de 11 andares (escritório no 9º), cidade em volta, corredor e hall dos elevadores (`config.mapa.andares = 11`).
- **Resend**: domínio `zynio.com.br` verificado (16/11, São Paulo); remetente `nao-responda@zynio.com.br`; webhook com segredo
  cifrado; e-mail de teste entregue. **SMTP do Supabase Auth pelo Resend** (`smtp.resend.com:465`, usuário `resend`, senha = chave de
  envio; limite do Auth 30 e-mails/h). Trocar a chave do Resend = trocar também lá. Falta testar o "Esqueci a senha" de ponta a ponta.
- **Cloudflare**: Email Routing (contato@, suporte@, financeiro@, seguranca@ e pega-tudo → Gmail do dono). `CLOUDFLARE_API_TOKEN`
  ("Clima Escritorio - agente", sem validade, 9 permissões) só no `.env` do agente (o PC do João recebeu o `.env` pelo código).
  **DNSSEC ativo** (DS no Registro.br: keytag 2371, alg 13). Para desligar: tirar o DS no Registro.br, esperar 1 dia, depois a Cloudflare.
- **Spotify** conectado (Premium); Echo Show 5 aparece; nenhuma rotina criada.
- **Vercel** (17/11): Functions Storage estava em 3,32 GB (80 publicações do app × ~42 MB). Com o "sim" do dono: 70 publicações antigas do app
  e 7 do site apagadas (ficam as 10 mais novas de cada) e **retenção de 7 dias** nos dois projetos (feita no painel: a API não aceita mais).
  O número cai em alguns dias (a Vercel guarda as apagadas num período de recuperação antes de liberar o espaço).
- **Alexa (Sinric)**: plano grátis (3) + plano por aparelho de 5 (cobrança automática) + plano por aparelho de 1 (**pagamento manual
  com lembrete**: renovar à mão até 17/11/2027), comprados em 17/11/2026 = **9 aparelhos**, um para cada um dos 9 ares; gravado em
  `config.sinric.limite_aparelhos = 9`. Em uso: 1 ("Ar do escritório", online). "Ar dos devs" sem botões: só vai para a
  Alexa depois de gravar/copiar os botões (a rota recusa). Roteiro: `docs/continuar/2026-11-17-sinric-mais-aparelhos.md`.
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
  auditoria, saúde do domínio). Tarde: ar Gree funcionando (300 botões gerados), segundo transmissor (Sala Bancada), projeto Devs,
  agente no PC Windows por código de uso único (PC do João), quem não enxerga os transmissores não manda. Noite: Painel abre num ar com
  transmissor; um transmissor para vários ares; Gree e copiar botões pela tela; novidades por versão (1.3.0, 1.3.1); prédio de 11 andares
  com cidade, corredor e hall no mapa 3D; CLAUDE.md ampliado (glossário, fluxo do comando, versões, roteiros).
  Fim da noite (1.4.0): zonas de ar no salão aberto, teste de interferência, mover transmissor, Alexa por zona, previsão do tempo
  e chuva no 3D, semáforos, pedestres, animais, terminal (TICEN), sentar/trabalhar, monitores únicos, auditoria de segurança.

---

## 16. Versões e novidades (o que o usuário vê a cada atualização)

- **Fonte única**: `backend/app/novidades.json` → `versoes` (mais nova primeiro): `versao` (semver), `data` (AAAA-MM-DD), `titulo`,
  `resumo`, `novo[]`, `melhorias[]`, `seguranca[]`, `correcoes[]`. Seção vazia = `[]` (some da tela).
- **Quando criar entrada**: qualquer publicação que muda o que alguém vê ou usa. Ajuste interno sem efeito visível pode ir junto na
  próxima. Correção pequena no mesmo dia: versão de patch (1.3.1); recurso novo: menor (1.4.0); quebra de uso: maior.
- **Como escrever**: frases curtas, em pt-BR, do ponto de vista de quem usa ("Ligar todos no cartão do transmissor"), sem jargão
  (nada de nome de função), sem número inventado, sem promessa. Segurança: diga o que ficou mais protegido, nunca como atacar.
- **O que acontece**: depois do `publicar-vercel.sh`, cada pessoa vê o modal uma vez (salvo em `usuarios.novidades_vista`) e a central
  de notificações ganha "Versão X no ar". O script avisa (sem bloquear) quando há commits em `frontend/src`/`backend/app` depois da
  data da última versão.
- **Apps** (Android/desktop) têm processo próprio: `docs/releases/vX.Y.Z.md` + `gh release` + `versao_apps.json` (seção 10). As
  novidades do sistema web podem citar a versão dos apps quando sair junto.

---

## 17. Roteiros quando algo dá errado

**O ar não obedece (painel, Alexa ou agenda)**
1. Atividade → filtro "falhas": qual erro? (seção 7.14 diz em que etapa ele nasce.)
2. Infra → Agentes: existe principal **online** que **enxerga** o transmissor daquele ar? Se não: ligar o PC do escritório (ou levar o
   Mac para a rede do escritório). O preferido assume sozinho em até ~45 s.
3. Transmissores: o do ar está online? "Reconectar agora". Pareado de novo no Smart Life → o autorreparo busca a chave nova.
4. O ar apitou? Se não: posição/visada do transmissor; para Gree, "Conferir" na aba Botões; gravação ruim → gravar o Desligar de novo.

**Botões do painel desativados** → o ar escolhido não tem transmissor: vincular em Aparelho → Ajustes ou escolher outro ar.

**Agente "cego" (enxerga 0 de N)** → computador fora da rede do escritório, Wi-Fi diferente ou transmissor desligado. No Windows,
`powershell -ExecutionPolicy Bypass -File .\instalar-windows.ps1 status`; log em `data\agente.log`.

**Instalar o agente num PC novo** → Infra → Agentes → Instalar (dono ou admin) → código de 30 min → comando no PowerShell como admin.
Falhou ao decifrar: gerar código novo (uso único). Ver armadilhas (BOM/UTF-8).

**Portão "Executando verificação" parado** → esperar o vigia (20 s) ou "Tentar de novo"; abrir zynio.com.br também libera o cookie.

**Transmissor pareado de novo / Wi-Fi novo** → parear no Smart Life (2,4 GHz) com o agente na mesma rede; Transmissores → "Reconectar
agora". ID novo único → o cadastro migra sozinho e os botões continuam.

**Dois ares iguais mudando juntos** → é físico (seção 7.13): trate como zona (Transmissores → Testar interferência). Separar = um
transmissor para cada, perto e virado só para o seu ar, e refazer o teste.

**Alexa diz "ok" e o ar não muda** → Integrações → Diagnóstico: agente enxerga os transmissores? zona com 1 aparelho na Alexa?
botões gravados no ar representante? O último comando de voz aparece? Ver seção 7.13b.

**Transmissor levado para outra sala** → cartão do transmissor → "Ares deste transmissor": desmarque os que ficaram para trás.

**Publicação deu erro** → seção 13 (BLOCKED, 100 MB, import). Nunca `vercel deploy` na pasta com `.git`.
