<div align="center">

<img src="frontend/public/icone-512.png" alt="Clima Escritório" width="120" />

# Clima Escritório: ar-condicionado por infravermelho, com Alexa, agenda e automações

**Liga, desliga e ajusta os ares do escritório pelo navegador, pelo celular, pelo computador ou pela voz, usando um transmissor Wi-Fi de infravermelho de R$ 60 no lugar do controle remoto.**

O sistema grava os sinais do controle original de cada ar e os reenvia por um transmissor **Tuya SRW-004** (NovaDigital / Smart Life). Em cima disso tem painel web instalável (PWA), apps para Android, macOS, Windows e Linux, **Alexa e Google Home**, agenda semanal, automações com gatilhos e condições, cenas, relatórios com consumo e custo estimados, marca própria (white label) e um firewall de aplicação.

🔗 **Painel:** [app.zynio.com.br](https://app.zynio.com.br) · 🌐 **Site:** [zynio.com.br](https://zynio.com.br) · 📦 **Downloads:** [Releases](https://github.com/estevam5s/clima-casa/releases) · 📘 **Manual:** [`docs/MANUAL.md`](docs/MANUAL.md)

> 🤝 **Vai continuar o projeto (pessoa ou agente)?** Leia o [`CLAUDE.md`](CLAUDE.md) inteiro antes da primeira mudança.
> Ele tem a arquitetura, as receitas de como mexer e as armadilhas que já aconteceram.

<br/>

![Python](https://img.shields.io/badge/Python_3.13-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy_Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Expo](https://img.shields.io/badge/Expo_SDK_58-000020?style=for-the-badge&logo=expo&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Alexa](https://img.shields.io/badge/Alexa_%2B_Google-00CAFF?style=for-the-badge&logo=amazonalexa&logoColor=white)
![Tuya](https://img.shields.io/badge/Tuya_SRW--004-FF4800?style=for-the-badge&logo=tuya&logoColor=white)

</div>

---

## 📑 Sumário

1. [O que é](#-o-que-é)
2. [Visão geral em números](#-visão-geral-em-números)
3. [Funcionalidades: controle dos ares](#-funcionalidades-controle-dos-ares)
4. [Funcionalidades: voz (Alexa e Google)](#-funcionalidades-voz-alexa-e-google)
5. [Funcionalidades: rotina do escritório](#-funcionalidades-rotina-do-escritório)
6. [Relatórios e exportação](#-relatórios-e-exportação)
7. [Marca própria (white label)](#-marca-própria-white-label)
8. [Aparência e tema](#-aparência-e-tema)
9. [Apps](#-apps)
10. [Arquitetura](#️-arquitetura)
11. [Stack tecnológica](#-stack-tecnológica)
12. [Estrutura de pastas](#-estrutura-de-pastas)
13. [Modelo de dados](#️-modelo-de-dados)
14. [Rotinas agendadas (pg_cron)](#-rotinas-agendadas-pg_cron)
15. [Rotas da aplicação](#️-rotas-da-aplicação)
16. [API](#-api)
17. [Segurança](#-segurança)
18. [Variáveis de ambiente](#️-variáveis-de-ambiente)
19. [Como rodar localmente](#-como-rodar-localmente)
20. [Deploy](#️-deploy)
21. [Scripts utilitários](#-scripts-utilitários)
22. [Roadmap](#-roadmap)
23. [FAQ](#-faq)
24. [Apêndice A: como o código IR é escolhido](#-apêndice-a-como-o-código-ir-é-escolhido)
25. [Apêndice B: reconfiguração automática do transmissor](#-apêndice-b-reconfiguração-automática-do-transmissor)
26. [Apêndice C: como o consumo é estimado](#-apêndice-c-como-o-consumo-é-estimado)
27. [Licença](#-licença)

---

## 🎯 O que é

Ar-condicionado split comum não tem Wi-Fi: só obedece ao controle remoto. O **SRW-004** é um "controle remoto universal" com Wi-Fi: aprende o sinal de cada botão e o repete. O app oficial (Smart Life) faz isso de forma limitada e sem agenda decente, relatório ou integração própria.

O Clima Escritório resolve:

- **Um painel só** para todos os ares de todos os lugares (escritório, casa, sala de reunião), com estado, temperatura e histórico.
- **Voz de verdade**: "Alexa, ligar o ar da recepção em 22 graus", pelo Sinric Pro ou por uma skill própria.
- **Rotina automática**: ligar às 7h30 em dias úteis, desligar depois de 3 horas ligado, ligar a cena "Reunião" quando alguém liga o ar da sala.
- **Visão de custo**: quantas horas cada ar ficou ligado e quanto isso custou, com exportação para PDF, Word, Excel e outros.
- **Marca do cliente**: nome, logo, cores, fontes, textos do login e do menu, para entregar o sistema com a identidade de quem usa.

Público: o administrador do lugar. Não há cadastro público: só entra quem tem `app_metadata.role = "admin"` no Supabase Auth.

---

## 📊 Visão geral em números

| Item | Quantidade |
|---|---|
| Telas no painel web | 20 |
| Rotas de API (`/api`, OAuth e Alexa) | 89 |
| Tabelas no Postgres (todas com RLS) | 19 (+ 2 de log das rotinas) |
| Rotinas pg_cron | 10 |
| Formatos de exportação de relatório | 8 (PDF, DOCX, XLSX, CSV, HTML, XML, JSON, Markdown) |
| Opções de marca própria | 34 |
| Apps nativos | 5 (Android, macOS Apple Silicon, macOS Intel, Windows, Linux x64/arm64) |
| Backend (Python) | ~3.800 linhas |
| Frontend (React) | ~5.500 linhas |

---

## ❄️ Funcionalidades: controle dos ares

| Recurso | Como funciona |
|---|---|
| Painel ao vivo | Faixa de métricas, ar em 3D (Three.js) com display, aleta e LED animados, controle rápido, gráfico de 14 dias e atividade recente |
| Detalhe do aparelho | Mostrador de temperatura, modos (frio, quente, ventilar, desumidificar, automático), ventilação, botões extras (swing, turbo, luz), temporizador e histórico |
| Gravação de botões | O transmissor entra em modo estudo por 30 s; você aperta o botão no controle original e o sinal é salvo em `codigos` |
| Vários lugares | **Projetos** separam escritório, casa e filiais; o seletor no menu filtra todas as telas |
| Vários transmissores | Cada ar aponta para um SRW-004; descoberta na rede local e importação da conta Smart Life (um ou todos) |
| Reconexão automática | Se o transmissor mudar de IP, de Wi-Fi ou for pareado de novo, o agente acha o novo endereço e a nova chave sozinho ([Apêndice B](#-apêndice-b-reconfiguração-automática-do-transmissor)) |
| Envio com plano B | Agente local primeiro; se ele estiver fora do ar, tenta a nuvem Tuya |
| Notificações | Central guardada no banco: abas (todas, não lidas, importantes, segurança), marcar como lida, limpar uma ou todas, ações direto na notificação (resolver alerta, desbloquear IP, reconectar transmissor), som e preferências por tipo |
| Barra de status | No lugar do título repetido: projeto, agente online, ares ligados, transmissores e relógio |
| Temperatura de fora | Temperatura, sensação e umidade reais (Open-Meteo) no display do ar em 3D e no painel |
| Busca ⌘K | Vai para qualquer tela ou aparelho pelo teclado |

---

## 🗣️ Funcionalidades: voz (Alexa e Google)

**Caminho principal: Sinric Pro.** Cada ar com "Disponível na Alexa" vira um dispositivo "Window AC Unit" no Sinric (criado e apagado automaticamente junto com o aparelho). Funciona na Alexa e no Google Home: ligar, desligar, modo, temperatura e ventilação. O plano gratuito do Sinric aceita 3 dispositivos.

**Alternativa: skill própria** (Smart Home API v3, sem limite de dispositivos). OAuth 2.0 com tela de consentimento própria, Lambda em `alexa/lambda/index.mjs` e **cenas** expostas como `SCENE_TRIGGER` ("Alexa, ativar Reunião"). Passo a passo em [`alexa/GUIA.md`](alexa/GUIA.md).

A tela **Comandos da Alexa** gera as frases que funcionam para cada aparelho e receitas de Rotinas.

---

## 🗓️ Funcionalidades: rotina do escritório

| Recurso | O que faz |
|---|---|
| Agenda | Dias da semana + horário + ação, com grade da semana e próxima execução |
| Automações | Gatilho (ligou, desligou, ligado há N min, horário) → condições (dias, janela de horário que pode virar a meia-noite) → ações (aparelho, cena, desligar depois de X min). Filtra pela origem (Alexa, painel, agenda, cena). Ações de automação não disparam outras automações |
| Cenas | Várias ações em sequência com um toque ou por voz |
| Temporizadores | "Desligar em 90 min", um por aparelho |
| Atividade | Linha do tempo de todo comando e evento, ao vivo, com filtros e exportação CSV |

---

## 📈 Relatórios e exportação

A tela **Relatórios** (`/relatorios`) consolida o período escolhido (7, 30, 90 dias, 12 meses ou datas livres) para todos os aparelhos ou um só:

- **Indicadores**: comandos e variação contra o período anterior de mesmo tamanho, taxa de sucesso, horas ligado, kWh e custo estimados, temperatura média escolhida.
- **Comandos por dia**, empilhados por origem (painel, Alexa, agenda, automação).
- **Horários de uso** com o horário de pico, **temperaturas escolhidas** e **mapa de uso** (dia da semana × hora).
- **De onde vêm os comandos** e **tabela por aparelho** ordenável, com total.
- **Falhas do período** com o motivo de cada uma.
- **Tarifa de energia** (R$/kWh) editável na própria tela; a **potência** de cada ar fica no cadastro do aparelho.

Exportação gerada no servidor (`GET /api/relatorios/exportar?formato=…`), sempre com a cor da marca:

| Formato | Conteúdo |
|---|---|
| **PDF** | Resumo, gráfico de barras por dia, tabelas, rodapé com página (reportlab) |
| **DOCX** | Documento editável no Word/Google Docs com todas as tabelas (python-docx) |
| **XLSX** | Uma aba por tabela, cabeçalho fixo, gráfico nativo do Excel (openpyxl) |
| **CSV** | ZIP com uma planilha por tabela, separador `;` e BOM para abrir certo no Excel |
| **HTML** | Página única com indicadores, gráfico e mapa de uso; imprime bem |
| **XML** | Estrutura para integração com outros sistemas |
| **JSON** | Os dados completos do relatório, para scripts e BI |
| **Markdown** | Para colar em wiki, Notion ou GitHub |

---

## 🏷️ Marca própria (white label)

Em **Configurações → Marca** (`/configuracoes?aba=marca`), com prévia ao vivo, histórico das últimas 15 versões, exportar/importar JSON e voltar ao padrão:

| Grupo | Opções |
|---|---|
| Identidade | nome, nome curto, slogan, descrição, logo, favicon, domínio |
| Cores | primária, destaque e alerta, com paletas prontas e contraste corrigido automaticamente |
| Tipografia e forma | fonte, escala do texto, densidade, raio dos cantos, CSS próprio (sanitizado) |
| Login | título, subtítulo, fundo animado, links de download, texto do rodapé |
| Menu e textos | renomear e esconder itens do menu, mensagem de boas-vindas no painel, banner de aviso (informação, sucesso, atenção) |
| Contato | e-mail, telefone e WhatsApp de suporte, site, rodapé, créditos |
| Regionais | °C ou °F, relógio 12 h ou 24 h, tema padrão, meta descrição |

A marca é pública (`GET /api/marca`) porque a tela de login também a usa. Imagens são limitadas a ~300 KB e SVG com script é recusado.

---

## 🌗 Aparência e tema

- Tema **claro, escuro ou do sistema**, trocado no cabeçalho ou em Configurações → Aparência, guardado no navegador.
- Script `public/tema.js` aplica o tema **antes da primeira pintura** (sem piscar branco).
- Transição suave entre temas; o ar em 3D troca de materiais junto.
- Animações respeitam `prefers-reduced-motion`.

---

## 📱 Apps

| App | Onde | Observação |
|---|---|---|
| Web / PWA | [clima-casa-lac.vercel.app](https://clima-casa-lac.vercel.app) | Instalável; `sw.js` guarda só a interface, `/api` nunca vai para o cache |
| Android | `ClimaCasa-android.apk` | Expo SDK 58 (`apps/android`) |
| macOS | `ClimaCasa-mac-apple-silicon.dmg`, `ClimaCasa-mac-intel.dmg` | Electron (`apps/desktop`), sem assinatura Apple |
| Windows | `ClimaCasa-windows.exe` | Instalador NSIS |
| Linux | `ClimaCasa-linux-x64.AppImage`, `ClimaCasa-linux-arm64.AppImage` | |

Os arquivos ficam nos [Releases](https://github.com/estevam5s/clima-casa/releases). O repositório é privado: o download exige estar logado no GitHub com acesso.

---

## 🏗️ Arquitetura

```
 Navegador / PWA / Desktop / Celular / Alexa / Google
              │ HTTPS (Bearer = token do Supabase Auth)
              ▼
 ┌──────────────────────────────┐        ┌───────────────────────────────┐
 │ Vercel (papel "nuvem")        │        │ Supabase                      │
 │ FastAPI em api/index.py       │◄──────►│ Postgres (pooler, TLS)        │
 │ + estáticos do frontend       │  SQL   │ Auth (login admin)            │
 │ + OAuth e diretivas da Alexa  │        │ pg_cron (10 rotinas clima_*)  │
 │ + firewall de aplicação       │        └──────────────▲────────────────┘
 └──────────────┬────────────────┘                       │
                │ grava em fila_comandos                 │ lê a fila (~1 s), heartbeat
                ▼                                        │
 ┌───────────────────────────────────────────────────────┴────────────────┐
 │ Agente no Mac (LaunchAgent com.climacasa.servidor, porta 8090)         │
 │ mesmo FastAPI + threads: fila, Sinric Pro (WebSocket), agenda,         │
 │ automações, temporizadores, saúde e reparo dos transmissores           │
 └──────────────┬─────────────────────────────────────────────────────────┘
                │ rede local (tinytuya, TCP 6668, protocolo 3.5)
                ▼
        SRW-004 ── infravermelho ──► ar-condicionado
```

### Princípios

- **Um código, dois papéis.** O mesmo FastAPI roda na Vercel (`PAPEL = "nuvem"`) e no Mac (`"agente"`). Só o agente abre threads e fala com a rede local.
- **A nuvem não alcança o escritório.** Todo comando que nasce na Vercel vira uma linha em `fila_comandos`; o agente executa e responde; a Vercel espera até 8 s.
- **Plano B pela nuvem Tuya** quando o agente está offline há mais de 45 s.
- **O front nunca lê o banco direto.** Tudo passa pela API, que valida o Bearer e o papel de admin.
- **Segredos cifrados em repouso** (AES-256-GCM) e nunca no bundle.
- **Honestidade:** o ar não informa estado de volta. Se alguém usar o controle original, o painel fica desatualizado até o próximo comando.

---

## 🧱 Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.13, FastAPI, psycopg 3 (autocommit, pool), tinytuya, sinricpro 6, cryptography |
| Relatórios | reportlab (PDF), python-docx (DOCX), openpyxl (XLSX) |
| Frontend | React 18, Vite 5, Tailwind CSS 3, framer-motion, recharts, three.js, lucide-react, react-router 6, supabase-js 2 |
| Banco e login | Supabase (Postgres 17, Auth, pg_cron) |
| Hospedagem | Vercel (região `cle1`, Python serverless + estáticos) |
| Agente local | LaunchAgent do macOS rodando de `~/Library/Application Support/ClimaCasa` |
| Voz | Sinric Pro (Alexa + Google Home); skill própria opcional com AWS Lambda |
| Apps | Expo SDK 58 (Android/iOS), Electron (macOS/Windows/Linux) |
| Hardware | Tuya SRW-004 (IR, Wi-Fi 2,4 GHz, protocolo 3.5) |

---

## 📁 Estrutura de pastas

```
ar-controle/
├── CLAUDE.md                guia completo para quem for mexer (leia primeiro)
├── README.md                este arquivo
├── .env                     segredos (gitignored, chmod 600)
├── api/index.py             entrada da Vercel
├── vercel.json              build, rewrites, headers, região
├── requirements.txt         deps Python da Vercel
├── iniciar.sh               roda o agente no terminal (dev)
├── instalar-servico.sh      instala/atualiza o agente como serviço do macOS
├── publicar-vercel.sh       publica na Vercel a partir de cópia sem .git
├── backend/
│   ├── requirements.txt     deps do agente (inclui sinricpro)
│   ├── supabase-ca.crt      CA raiz do pooler (TLS verificado)
│   └── app/
│       ├── main.py          FastAPI, middleware (firewall, CSRF, CSP, HSTS), SPA
│       ├── db.py            Postgres, config cifrada, registro de atividade
│       ├── cripto.py        AES-256-GCM para segredos em repouso
│       ├── firewall.py      listas de IP, bloqueio automático, assinaturas de ataque, limite de taxa
│       ├── seguranca.py     validação do Bearer e do papel admin
│       ├── clima.py         estado do ar → código IR
│       ├── transmissor.py   envio, gravação, descoberta, fila, reparo automático
│       ├── tuya_nuvem.py    conta Smart Life (QR), Local Key, envio pela nuvem
│       ├── sinric.py        Sinric Pro (REST + WebSocket)
│       ├── alexa.py         skill própria (Discovery, Power, Thermostat, Scene)
│       ├── automacao.py     automações, eventos, temporizadores
│       ├── agenda.py        laço da agenda e da saúde dos transmissores
│       ├── relatorio.py     consolidação do relatório + 8 exportadores
│       └── rotas/           api.py (painel) e alexa.py (OAuth + diretivas)
├── frontend/
│   ├── public/              manifest, sw.js, tema.js, ícones
│   └── src/
│       ├── main.jsx         rotas e proteção de login
│       ├── api.js           fetch com Bearer, download de arquivos
│       ├── tema.jsx         tema claro/escuro/sistema
│       ├── marca.jsx        aplica a marca própria (cores, fontes, textos)
│       ├── components/      Layout, ui (design system), Cena3D, Fumaca, config/WhiteLabel, config/PainelSeguranca
│       └── pages/           uma por rota
├── supabase/
│   ├── schema.sql           esquema completo e idempotente
│   └── cron-jobs.json       10 rotinas pg_cron
├── alexa/                   guia e Lambda da skill própria
├── apps/                    desktop (Electron) e android (Expo)
└── docs/                    MANUAL.md, Manual em PDF, gerar-pdf.sh
```

---

## 🗃️ Modelo de dados

Datas em epoch (segundos). RLS ligado em todas as tabelas; o backend conecta como dono pelo pooler.

| Tabela | Conteúdo |
|---|---|
| `config` | chave → JSON (modo de envio, tarifa, marca, segurança, credenciais cifradas) |
| `projetos` | lugares: nome, endereço, cor |
| `hubs` | transmissores: id Tuya, IP, Local Key (cifrada), versão, tipo de controle, online, problema |
| `aparelhos` | ares: nome falado na Alexa, cômodo, marca, faixa de temperatura, modos, estado, potência, projeto |
| `codigos` | sinais IR gravados por aparelho (`modo_temp_vent`, `desligar`, `extra_<nome>`) |
| `cenas`, `agendamentos`, `automacoes`, `temporizadores` | rotina do escritório |
| `atividade` | todo comando e evento: origem, ação, ok, detalhe |
| `fila_comandos` | ponte Vercel → agente (`enviar`, `aprender`, `descobrir`, `evento`, `reparar`) |
| `oauth_codigos`, `oauth_tokens` | OAuth da skill própria (só hashes) |
| `seguranca_ips` | IPs/CIDRs bloqueados ou permitidos, manuais ou automáticos, com expiração |
| `seguranca_eventos` | tentativas de login, scanners, limite de taxa, acessos negados |
| `metricas_diarias`, `alertas`, `backups`, `saude_sistema` | preenchidas pelas rotinas |

---

## ⏱️ Rotinas agendadas (pg_cron)

| Rotina | Quando (UTC) | O que faz |
|---|---|---|
| `clima_transmissores_offline` | a cada 5 min | marca offline o transmissor sem sinal há 10 min |
| `clima_oauth_expirados` | a cada 15 min | apaga códigos e tokens da Alexa vencidos |
| `clima_metricas_hora` | de hora em hora | consolida as métricas do dia (fuso de Brasília) |
| `clima_alerta_ligado_12h` | de hora em hora | alerta de ar ligado há mais de 12 h |
| `clima_alerta_falhas` | a cada 30 min | alerta com 3 ou mais falhas em 1 h |
| `clima_backup_diario` | 05:00 | snapshot JSON (guarda 14) |
| `clima_limpar_atividade` | 06:30 | atividade > 90 d, eventos de segurança > 30 d, bloqueios vencidos |
| `clima_limpar_logs_cron` | 06:45 | logs das rotinas |
| `clima_saude_banco` | a cada 6 h | tamanho do banco (limite de 500 MB do plano gratuito) |
| `clima_manutencao_semanal` | domingo 07:00 | ANALYZE |

---

## 🗺️ Rotas da aplicação

| Rota | Tela |
|---|---|
| `/login`, `/redefinir-senha` | entrar (fundo de fumaça em WebGL) e trocar senha esquecida |
| `/` | painel |
| `/projetos` | lugares |
| `/relatorios` | relatórios e exportação |
| `/aparelhos`, `/aparelhos/:id` | lista e detalhe |
| `/cenas`, `/automacoes`, `/agendamentos` | rotina |
| `/transmissores` | SRW-004 |
| `/integracoes`, `/comandos-alexa`, `/alexa` | Sinric Pro, frases de voz, skill própria |
| `/supabase` | rotinas, uso do banco, alertas, backups |
| `/atividade` | linha do tempo |
| `/seguranca` | segurança: mapa 3D de acessos, IPs, bloqueios, relatório |
| `/configuracoes?aba=geral\|aparencia\|marca\|seguranca\|contas\|sistema` | configurações |
| `/apps` | downloads |
| `/oauth/autorizar` | consentimento da vinculação da Alexa |

---

## 🔌 API

Prefixo `/api`, JSON, `Authorization: Bearer <token do Supabase>` obrigatório, exceto as rotas públicas. Erros sempre `{"detail": "mensagem em pt-BR"}`.

| Grupo | Rotas principais |
|---|---|
| Sessão | `POST /auth/entrar` (login com bloqueio por tentativas), `GET /supabase-config`, `GET /sessao` |
| Painel | `GET /painel`, `GET /metricas`, `GET /notificacoes`, `GET /atividade`, `GET /alertas` |
| Relatórios | `GET /relatorios`, `GET /relatorios/completo`, `GET /relatorios/exportar?formato=pdf\|docx\|xlsx\|csv\|html\|xml\|json\|md` |
| Aparelhos | CRUD em `/aparelhos`, `POST /aparelhos/{id}/estado`, `/aprender`, `/botoes/{chave}/enviar`, `/temporizador` |
| Transmissores | CRUD em `/hubs`, `/hubs/descobrir`, `/hubs/importar-todos`, `/hubs/reparar` |
| Rotina | CRUD em `/projetos`, `/cenas`, `/agendamentos`, `/automacoes` |
| Integrações | `/sinric`, `/alexa`, `/tuya/qr` |
| Marca | `GET /marca` (pública), `PUT /marca`, `/marca/historico`, `/marca/padrao` |
| Segurança | `GET\|PUT /seguranca`, `GET\|POST /seguranca/ips`, `DELETE /seguranca/ips/{id}`, `GET /seguranca/eventos` |
| Fora de `/api` | `POST /oauth/token`, `POST /alexa/diretiva`, `GET /saude` |

---

## 🔒 Segurança

| Camada | Controle |
|---|---|
| Login | Só admin, sem cadastro. Login passa por `POST /api/auth/entrar`, que bloqueia e-mail e IP depois de 5 falhas |
| Firewall de aplicação | Lista de IPs/CIDRs bloqueados e permitidos, bloqueio por país, detecção de ferramentas de ataque (sqlmap, nikto, nuclei…), assinaturas de SQLi/XSS/path traversal, limite de requisições por minuto |
| Bloqueio progressivo | Reincidência sobe o degrau: 15 min → 1 h → 24 h → 7 dias. O próprio administrador logado não é bloqueado por sessão vencida |
| Tela Segurança (`/seguranca`) | Postura de 0 a 100, **globo 3D** (Three.js) com a origem dos acessos e ataques e arcos animados até o servidor, eventos ao vivo, IPs com nota de risco e bloqueio em um clique, países, rotas atacadas, bloqueios ativos, regras do firewall |
| Relatório de segurança | PDF, DOCX, XLSX, CSV, HTML, XML, JSON e Markdown, com recomendações automáticas |
| Criptografia | TLS em tudo; segredos em repouso (Local Key, tokens Smart Life, Sinric, Alexa) com **AES-256-GCM** e contexto (AAD) por campo; chave mestra só em variável de ambiente |
| Banco | Pooler com TLS verificado contra a CA do Supabase; RLS em todas as tabelas; SQL sempre parametrizado |
| Navegador | CSP restrita, HSTS com preload, X-Frame-Options DENY, nosniff, COOP/CORP, `no-store` nas respostas dinâmicas, CSRF barrado por checagem de `Origin` |
| OAuth da Alexa | Códigos e tokens guardados só como hash; redirect restrito a domínios da Amazon; `/oauth/token` limitado a 20/min por IP |
| Marca própria | CSS sanitizado (sem `@import`, `url()`, `expression`), SVG com script recusado |

---

## ⚙️ Variáveis de ambiente

Ficam em `.env` (agente, gitignored) e nas variáveis do projeto na Vercel. **Nunca** no repositório.

| Variável | Onde | Uso |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | agente, Vercel | projeto e chave pública |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_PORT` | agente, Vercel | Postgres pelo pooler (5432 no agente, 6543 na Vercel) |
| `CLIMA_CHAVE_MESTRA` | agente, Vercel | chave AES-256 (32 bytes em base64) dos segredos em repouso. **Perder = reconectar Smart Life, Sinric e Alexa** |
| `SUPABASE_SECRET_KEY`, `SUPABASE_ACCESS_TOKEN` | só `.env` | manutenção (criar admin, aplicar schema e rotinas) |
| `SINRIC_API_KEY`, `SINRIC_APP_KEY`, `SINRIC_APP_SECRET` | `.env` | copiados para `config.sinric` (cifrado) na primeira execução |
| `VERCEL_TOKEN` | `.env` | `publicar-vercel.sh` |
| `CLIMA_PORTA`, `CLIMA_HOST`, `CLIMA_PAPEL`, `CLIMA_CONFIAR_PROXY` | opcionais | porta (8090), interface, papel, confiar em `x-forwarded-for` |

---

## 💻 Como rodar localmente

```bash
# backend (Python 3.13 com uv)
uv venv .venv --python 3.13
uv pip install --python .venv/bin/python -r backend/requirements.txt

# frontend (gera backend/static)
cd frontend && npm install && npm run build && cd ..

# agente
cd backend && ../.venv/bin/python -m app.main     # http://127.0.0.1:8090
```

Modo dev do frontend: `cd frontend && npm run dev` (Vite em :5173 com proxy para :8090).
Para simular a Vercel localmente: `CLIMA_PAPEL=nuvem CLIMA_PORTA=8793 …` (o serviço instalado já ocupa a 8090).

---

## ☁️ Deploy

```bash
cd frontend && npm run build && cd ..
./publicar-vercel.sh       # NUNCA "vercel deploy" direto na pasta com .git (plano Hobby bloqueia)
./instalar-servico.sh      # atualiza o agente no Mac
git push
```

Conferir depois: `GET /saude` (200), login, uma rota de cada área tocada.

---

## 🧰 Scripts utilitários

| Script | O que faz |
|---|---|
| `iniciar.sh` | sobe o agente no terminal |
| `scripts/gerar-release-json.sh` | atualiza versão, tamanhos e SHA-256 dos apps mostrados em `/apps` |
| `instalar-servico.sh [status\|remover]` | instala, mostra o estado ou remove o LaunchAgent |
| `publicar-vercel.sh` | build + deploy na Vercel a partir de uma cópia sem `.git` |
| `site/publicar.sh` | publica o site institucional (Next.js) na Vercel |
| `docs/gerar-pdf.sh` | gera `docs/Manual-Clima-Casa.pdf` a partir do `MANUAL.md` |

---

## 🧭 Roadmap

- [ ] Gravar os botões IR do primeiro ar (depende de alguém com o controle na mão).
- [ ] Validar o envio pela nuvem Tuya com o Mac desligado.
- [ ] Testar o APK num celular e publicar na loja.
- [ ] Criar a skill própria na Amazon (opcional; o Sinric já cobre).
- [ ] Sensor de temperatura ambiente para automações por temperatura real.
- [ ] Relatórios agendados por e-mail.
- [ ] Mais de um usuário com papéis (operador, só leitura).

---

## ❓ FAQ

**O sistema sabe se o ar está ligado?**
Não. Infravermelho só envia. O painel mostra o último estado que **ele** mandou.

**Funciona com qualquer ar-condicionado?**
Com qualquer um que tenha controle remoto infravermelho. Cada ar precisa ter os botões gravados uma vez.

**E se o Mac desligar?**
A Vercel tenta pela nuvem Tuya. Agenda e automações rodam no agente, então param até ele voltar.

**Mudei o Wi-Fi do escritório. E agora?**
Pareie o SRW-004 de novo no Smart Life (rede 2,4 GHz). O agente encontra o novo IP e a nova chave sozinho, se a conta Smart Life estiver conectada em Configurações.

**Posso usar com a marca de um cliente?**
Sim: Configurações → Marca. Exporte o JSON para reaproveitar em outra instalação.

**O custo do relatório é exato?**
Não, é estimativa ([Apêndice C](#-apêndice-c-como-o-consumo-é-estimado)). Serve para comparar meses e aparelhos.

---

## 🧮 Apêndice A: como o código IR é escolhido

1. Monta o estado desejado (ligado, modo, temperatura, ventilação) dentro da faixa do aparelho.
2. Procura o código exato `modo_temp_vent`.
3. Não achou? Mesmo modo e temperatura com outra ventilação.
4. Não achou? A temperatura gravada mais próxima no mesmo modo (o estado salvo passa a ser o do código enviado).
5. Desligar usa sempre o código `desligar`.

## 🔧 Apêndice B: reconfiguração automática do transmissor

O `status()` do SRW-004 responde com um código que diz o que houve:

| Código | Significado | O que o agente faz |
|---|---|---|
| `900` | ok (IR não tem estado) | nada |
| `914` | chave errada (pareado de novo) | busca a Local Key nova na conta Smart Life |
| `905` / `901` | não responde no IP | varre a rede pelo ID e grava o IP novo |

Se o novo pareamento gerou outro ID e há exatamente um transmissor novo na conta, migra o cadastro e os aparelhos para ele. Quando não consegue, mostra o problema na tela com a instrução.

## ⚡ Apêndice C: como o consumo é estimado

- **Horas ligado** = soma do tempo entre cada "ligar" bem-sucedido e o "desligar" seguinte; se não houve desligar, conta até o fim do período. Cada trecho é limitado a 24 h.
- **kWh** = horas × potência do aparelho (W) ÷ 1000. Potência padrão: 1.000 W.
- **Custo** = kWh × tarifa (padrão R$ 0,85/kWh, ajustável na tela).
- Referência de potência: 9.000 BTU ≈ 800 W, 12.000 BTU ≈ 1.100 W, 18.000 BTU ≈ 1.650 W, 24.000 BTU ≈ 2.200 W.

---

## 📄 Licença

Software proprietário. Todos os direitos reservados. Uso restrito ao titular do repositório e a quem ele autorizar.
