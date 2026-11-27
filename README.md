<div align="center">

<img src="frontend/public/icone-512.png" alt="Clima Escritório" width="112" />

# Clima Escritório

**Ar-condicionado, luzes, cafeteira, persianas e fechadura do escritório num painel só: pelo navegador, pelo celular, pelo computador, pelo Telegram ou pela voz.**

O sistema grava os sinais do controle remoto original de cada ar e os reenvia por um transmissor Wi-Fi de infravermelho
**Tuya SRW-004** (Smart Life). Os demais aparelhos entram pela nuvem Smart Life ou por uma placa própria (Arduino, ESP32).
Tudo roda numa API na Vercel com banco no Supabase e um **agente** num computador do escritório, o único que fala com a rede local.

[Painel](https://app.zynio.com.br) · [Site](https://zynio.com.br) · [Downloads](https://github.com/estevam5s/clima-casa/releases) · [Manual](docs/MANUAL.md) · [Guia para quem vai mexer no código](CLAUDE.md)

![Python](https://img.shields.io/badge/Python_3.13-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite_5-646CFF?style=flat-square&logo=vite&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-000000?style=flat-square&logo=threedotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=flat-square&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Next.js](https://img.shields.io/badge/Site_Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![Expo](https://img.shields.io/badge/Expo_SDK_58-000020?style=flat-square&logo=expo&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-47848F?style=flat-square&logo=electron&logoColor=white)
![Swift](https://img.shields.io/badge/iOS_Swift-F05138?style=flat-square&logo=swift&logoColor=white)

</div>

> **Vai continuar o projeto (pessoa ou agente de IA)?** Leia as seções 0 a 2 do [`CLAUDE.md`](CLAUDE.md) antes da primeira
> mudança. Ele tem as regras de ouro, o mapa "quero mudar X → arquivo Y", as receitas e as armadilhas que já aconteceram.
> O diário de cada sessão de trabalho fica em [`docs/continuar/`](docs/continuar/) (a mais recente em `ATUAL.md`).

---

## Sumário

1. [Em números](#em-números)
2. [Como funciona em 30 segundos](#como-funciona-em-30-segundos)
3. [Hardware suportado](#hardware-suportado)
4. [Funcionalidades](#funcionalidades)
5. [Arquitetura](#arquitetura)
6. [Um comando de ponta a ponta](#um-comando-de-ponta-a-ponta)
7. [Stack](#stack)
8. [Estrutura do repositório](#estrutura-do-repositório)
9. [Banco de dados](#banco-de-dados)
10. [API](#api)
11. [Usuários e permissões](#usuários-e-permissões)
12. [Segurança](#segurança)
13. [Configuração e segredos](#configuração-e-segredos)
14. [Rodar localmente](#rodar-localmente)
15. [Instalar o agente no escritório](#instalar-o-agente-no-escritório)
16. [Publicar](#publicar)
17. [Apps](#apps)
18. [Versões e novidades](#versões-e-novidades)
19. [Testes e checklist de entrega](#testes-e-checklist-de-entrega)
20. [Problemas comuns](#problemas-comuns)
21. [Perguntas frequentes](#perguntas-frequentes)
22. [Apêndices técnicos](#apêndices-técnicos)
23. [Backup](#backup)
24. [Cota do Supabase (plano grátis)](#cota-do-supabase-plano-grátis)
25. [Repositórios e CI/CD](#repositórios-e-cicd)
26. [Licença](#licença)

---

## Em números

Conferidos no código em 27/11/2026.

| Item | Quantidade |
|---|---|
| Telas no painel web | 43 rotas (muitas com abas: Segurança tem 10, Atividade 7) |
| Rotas da API (contando cada método) | 519 |
| Tabelas no Postgres, todas com RLS | 56 |
| Rotinas agendadas (pg_cron) | 10 |
| Comandos do bot do Telegram | 1.953, em 102 categorias |
| Perguntas no treinamento de segurança e ISO | 1.017 |
| Formatos de exportação de relatório | 8 (PDF, DOCX, XLSX, CSV, HTML, XML, JSON, Markdown) |
| Idiomas do site institucional | 6 (português, inglês, espanhol, francês, russo, coreano) |
| Blocos dos Fluxos (estilo N8N) | 366: 107 gatilhos, 146 de lógica e dados, 113 ações e integrações (30 serviços externos) |
| Versões publicadas do sistema | 80 (numeração em sequência desde 0.0.0), com o horário em que cada uma entrou no ar |
| Testes de segurança automáticos | 1.325 (rodam sozinhos toda semana) |
| Apps nativos | Android, iPhone, macOS (Apple Silicon e Intel), Windows, Linux (x64 e arm64), versão 1.8.2, e extensão para Chrome, Edge, Brave e Firefox |
| Backend Python | ~32 mil linhas |
| Frontend React | ~42 mil linhas (mais ~5 mil do site) |

---

## Como funciona em 30 segundos

1. Ar split comum não tem Wi-Fi: só obedece ao controle remoto. O **SRW-004** aprende o sinal de cada botão e o repete.
2. O **agente** (o mesmo backend, rodando num computador do escritório) fala com o SRW-004 pela rede local, porta 6668.
3. O painel, os apps, a Alexa, o Google, o Telegram e a agenda pedem o comando à **API na Vercel**, que grava o pedido numa
   fila no Supabase. O agente pega o pedido em cerca de 1 segundo, manda o infravermelho e grava o resultado.
4. Sem agente ligado no escritório, nenhum comando chega aos ares, mesmo com o painel aberto e "online".

O infravermelho só vai num sentido: o ar não diz se está ligado. O painel mostra o último estado que **o sistema** mandou.
Se alguém usar o controle remoto, há o botão "Ligaram ou mudaram pelo controle?" para acertar o estado sem mandar sinal.

---

## Hardware suportado

| Aparelho | Como entra no sistema | Observações |
|---|---|---|
| **Ar-condicionado** (qualquer marca com controle IR) | Transmissor **Tuya SRW-004** (Smart IR) | Um transmissor atende até ~4 ares à vista (8 a 10 m, sem parede). Ares **iguais** no alcance do mesmo transmissor mudam juntos e viram uma **zona**. No protocolo **Gree**, gravando só o Desligar, o sistema gera os outros 300 botões |
| **Luzes** (lâmpadas, fitas, interruptores) | Nuvem **Smart Life** (Tuya) ou placa própria | Interruptor de parede com várias teclas (ex.: Novadigital 4 teclas) vira uma luz por tecla. Acende ao anoitecer pelo pôr do sol real |
| **Cafeteira** | Tomada inteligente Smart Life ou placa com relé | Desliga sozinha por segurança depois do tempo configurado |
| **Persianas** | Motor Smart Life ou placa (relé de subir/descer) | Posição por porcentagem; ligadas às janelas do mapa 3D |
| **Fechadura** | Fechadura Wi-Fi Smart Life ou placa | Destrancar pela internet depende do modelo; o sistema avisa quando não aceita |
| **Placa própria** | Arduino UNO R4 WiFi, GIGA R1, Opta, Portenta H7, Nano 33 IoT, MKR WiFi 1010, Nano ESP32, ESP32, ESP8266 | O painel gera o código pronto (com token só da placa). Ela busca os comandos por HTTPS a cada 3 s. Tela **Infra → Placas IoT** mostra as placas online, sinal do Wi-Fi, IP e firmware |
| **Computador do agente** | macOS, Windows, Linux, **Raspberry Pi 3B/4/5 com sistema de 64 bits** | Arduino e ESP32 **não** rodam o agente (ele é Python com Postgres, TLS e WebSocket) |
| **Assistentes de voz** | Alexa e Google Home pelo **Sinric Pro** | Skill própria da Alexa existe como opção (`alexa/`) |

### Parear um aparelho Smart Life (exemplo: interruptor Novadigital de 4 teclas)

1. Instale o interruptor com **fio neutro** na caixa (sem neutro ele não liga o Wi-Fi) e respeite a carga máxima por tecla.
2. No celular, ligado ao **Wi-Fi 2,4 GHz** do escritório (5 GHz não funciona), abra o app **Smart Life** (não o app da marca).
3. Segure uma tecla por ~6 s até a luz piscar rápido. No app: **+ → Adicionar dispositivo**, aceite o que ele encontrar,
   escolha a rede e digite a senha do Wi-Fi.
4. Se não achar no modo rápido, segure de novo até piscar devagar (modo AP) e use "Modo AP" no app.
5. Teste no Smart Life as quatro teclas. Depois, no painel: **Luzes → Adicionar interruptor**. O sistema lê as teclas
   (`switch_1` a `switch_4`) e cria uma luz para cada uma, com nome e sala.

A conta Smart Life precisa estar conectada em **Configurações → Contas** (QR Code lido pelo app Smart Life). Só liga e desliga:
interruptor de tecla não tem regulagem de brilho.

---

## Funcionalidades

### Ares

| Recurso | O que faz |
|---|---|
| Painel | Abre num ar com transmissor (ligado primeiro), avisa o que impede o ar de obedecer, ar em 3D, ares da sala lado a lado, gasto, semana e **mapa de uso** (grade dia × hora com pico) |
| Detalhe do ar | Mostrador, modos, ventilação, temporizador, histórico, botões gravados, copiar botões de outro ar igual, gerar botões Gree |
| Gravar botão | O transmissor entra em modo estudo por 30 s. O sistema **reconhece o sinal** (protocolo, pulsos e, no Gree, o ajuste que ele manda) e, se você gravou o ajuste errado, salva no botão certo e avisa. "Conferir agora" revisa todos os botões |
| Transmissores | Assistente **Adicionar transmissor** (importar da conta Smart Life, procurar na rede ou cadastrar à mão) com **teste de conexão** que corrige o protocolo Tuya (3.3/3.4/3.5). Reconexão automática quando muda IP ou chave |
| Vários ares por transmissor | Ligar/desligar todos, aviso de ares que respondem juntos, **teste de interferência** (um ar por vez, quem está na sala marca quem apitou) que grava as zonas reais |
| Responsável por ar | Um usuário pode cuidar só de alguns ares; o servidor recusa os outros |

### Voz, Telegram e IA

| Recurso | O que faz |
|---|---|
| Alexa e Google Home | Pelo Sinric Pro: ligar, desligar, modo, temperatura, ventilação. Uma zona vira **um** aparelho na Alexa. Diagnóstico ("vai funcionar em outra Alexa?") e teste ao vivo |
| Comandos da Alexa | Catálogo de frases que a Alexa entende, por aparelho, com botão Testar |
| Bot do Telegram | 1.953 comandos em 102 categorias, com as permissões de quem vinculou. Painel do ar no estilo do controle remoto, timers, relatórios, logs, auditoria, lote com confirmação, avisos importantes. Tela **Logs de uso e erros**: uso por pessoa, comandos mais usados, tempo de resposta e cada erro (vira bug automático) |
| Assistente de IA (`/ia`) | Modelos da NVIDIA com ferramentas que veem o estado real e agem **com as permissões de quem pergunta**. Conversas salvas, comandos com `/`, **mensagem de voz** (transcrita no servidor, funciona no Brave), imagens, estilos de resposta, "Pensar mais", instruções pessoais, ouvir a resposta, avaliar |
| IA no terminal (`clima-ia`) | Cliente no estilo do Claude Code: configuração na primeira execução (tema, cor, tema do código, modo), `/config`, `/retomar`, comandos diretos dos ares. Instaladores para macOS, Linux (Debian/Ubuntu, Fedora, Arch, openSUSE, WSL) e Windows |

Instalar o `clima-ia`:

```bash
# macOS / Linux / WSL
curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash
```
```powershell
# Windows (PowerShell)
irm https://app.zynio.com.br/instalar-ia.ps1 | iex
```

### Rotina do escritório

| Recurso | O que faz |
|---|---|
| Agenda | Dias + horário + ação, com modelos prontos e histórico |
| Automações | Gatilho (ligou, desligou, ligado há N min, horário) → condições (dias, janela que pode virar a meia-noite) → ações (ar, cena, desligar depois de X min). Ações de automação não disparam outras |
| Cenas | Várias ações com um toque ou por voz |
| Temporizadores | "Desligar em 90 min", um por aparelho |
| Música | Spotify (conta Premium): player, aparelhos (Echo incluso), rotinas por horário ou quando um ar liga |
| Luzes, cafeteira, persianas, fechadura | Telas próprias, agendas, automações e travas de segurança por aparelho |
| Fluxos | Editor em blocos estilo N8N, com cara de IDE (desfazer, copiar e colar, versões, dados de teste, painel de problemas): 107 gatilhos (eventos da Atividade, segurança, bugs, tarefas, e-mails, aparelhos do escritório, tempo lá fora, gasto, sol, expediente, cron), 146 blocos de lógica e dados e 113 ações e integrações (Slack, Discord, Teams, WhatsApp, SMS, ntfy, GitHub, Trello, Notion, Jira, Home Assistant, n8n e outros), com escolha do modelo de IA |
| Rotinas | Nove abas: visão geral, cenas, automações, agenda, fluxos, execuções, conexões (chaves cifradas), variáveis globais e calendário |

### Mapa 3D

Prédio de 11 andares numa cidade (escritório no 9º, térreo com recepção, elevador), equipe com expediente, monitores com o
trabalho de cada sala, previsão do tempo e chuva reais, trânsito com semáforos, pedestres, terminal de ônibus, avatares 3D
(GLB) com editor de aparência, **carros dirigíveis** com física (câmbio automático, ABS, controle de tração, nitro, voo) e
**multijogador** pelo Supabase Realtime. Controles: W A S D andar, F sentar, C café, R elevador, V câmera, Esc sair.

### Gestão

| Recurso | O que faz |
|---|---|
| Relatórios | Período livre, comparação com o período anterior, horas ligado, kWh e custo estimados, mapa de uso, falhas. Exporta em 8 formatos (inclusive no **modelo da Prefeitura**, com brasão) e manda por e-mail |
| Atividade | Linha do tempo de todo comando e evento **com a pessoa que fez** (desde a 0.6.9), análise, busca no servidor, exportação e as abas Por pessoa, Por sala, Por ar, Mudanças nos ares (ligou, desligou, subiu ou baixou a temperatura) e Comparar períodos |
| Logs (Segurança → Logs) | Atividade, eventos de segurança, Telegram, dispositivos e e-mails numa linha do tempo só, com filtros por pessoa, sala, ar e origem, ao vivo, auditoria administrativa e exportação |
| Regras do escritório | Configurações → Geral: faixa de temperatura permitida (vale em todos os canais), desligar ou avisar ar esquecido ligado, aviso fora do expediente, arquivar notificações, feriados, exportar configurações |
| Tarefas | Estilo Asana: projetos, seções, lista, quadro, calendário, cronograma, painel, Página inicial, Caixa de entrada, Portfólios, Metas, tarefas que se repetem, cores do Asana e GitHub Projects. Projeto **Plano de melhorias** com 110 tarefas (`scripts/tarefas-melhorias.py`) |
| Notificações | Central com abas, ações direto na notificação, lote, preferências e aviso de versão nova |
| Backup e restauração | Zip com SHA-256 por tabela no Storage privado; simular, mesclar ou substituir (digitando `RESTAURAR`). Sessões, passkeys e a fila nunca são restaurados |
| Treinamento | Provas sorteadas de 1.017 perguntas (LGPD, Anexo A da ISO/IEC 27001:2022, Estrutura Harmonizada) com resultado por e-mail |
| Conformidade | Checagem dos controles da ISO 27001 e minutas de política, termos e declaração de aplicabilidade |
| Marca própria | Nome, logo, cores, fontes, textos do login e do menu, modo manutenção, histórico de versões |
| Bugs | Erros de tela, do servidor e do bot viram registro automático. Responsável, prazo, etiquetas, comentários com histórico, duplicado, criar tarefa, ações em lote, estatísticas (tempo até corrigir, recorrentes) e o prompt pronto para a IA corrigir. O relato leva os últimos passos da visita; tela travada, tela em branco e API falhando seguido também viram bug |
| Busca (⌘K) | Procura em ares, salas, transmissores, rotinas, tarefas, bugs, pessoas e versões, e responde perguntas com a IA apontando a tela |
| Configurações | Perfil, segurança, usuários, regras do escritório, marca, contas, cookies, sistema, **Diagnóstico** ao vivo, **Acessibilidade** (tamanho do texto, contraste, animações, foco) e **Atalhos de teclado** |
| Uso do sistema | Tempo de cada pessoa em cada tela e o que cada uma fez nos ares e no sistema, com entradas, Telegram e IA |
| Acessos e SEO | Analytics próprio do site e do sistema; Desempenho com Web Vitals por rota, o elemento que atrasa ou desloca cada página, tendência por dia e celular × computador |

### Infra (dono e administradores)

A tela `/infra` opera a Vercel e a Cloudflare **pelo agente do escritório**: os tokens têm acesso amplo e nunca vão para a nuvem.

| Aba | Conteúdo |
|---|---|
| Visão geral | Saúde do domínio ao vivo: DNS, certificados da Vercel, e-mail (DKIM/SPF/DMARC), banco e fila |
| Vercel | Painel dos dois projetos, **uso** do plano (requisições, invocações, transferência, GB-hora, builds), **publicações** com filtro por estado, busca por commit, voltar a uma versão, construir de novo, cancelar, apagar e **log do build** com busca e erros destacados; **domínios** (como o DNS aponta, conflitos, endereços de produção); configurações e limpeza de publicações antigas |
| Cloudflare | **Visão geral da zona** (estado, nameservers, DNSSEC, SSL/TLS, registros por tipo), **DNS** com travas nos registros críticos, exportar em BIND e consultas por tipo; **e-mails** @zynio.com.br (Email Routing); **Turnstile**; **segurança** (DNSSEC, configurações, auditoria); **token** (cada permissão testada) |
| Agentes | Computadores com o agente: quem é o principal, quem enxerga os transmissores, saúde (CPU, memória, disco, temperatura), reiniciar à distância, instalar em outro PC por código de uso único, guia do Raspberry Pi |
| Placas IoT | Arduino/ESP ligados ao sistema: online, comandos na fila, Wi-Fi, IP, firmware, há quanto tempo ligada |
| Serviços | Situação oficial agora da Vercel, Supabase, Cloudflare e Resend (incidentes abertos) e dias até cada certificado vencer |
| Portas e rede | Do computador do agente: alcança o banco (6543), o painel, Supabase, Sinric, Tuya, Resend e cada transmissor (6668), com o tempo |

Em **Agentes**, só fica verde e animado ("Ativo") o computador que está ligado **e** na rede dos transmissores; o Raspberry Pi
aparece em 3D (LEDs, calor do processador, dados pelo cabo ou Wi-Fi, aviso de fonte fraca).

O que **não** existe e por quê: logs de execução em tempo real da Vercel (a API não responde no plano atual) e métricas HTTP,
cache e WAF da Cloudflare (todos os registros são "DNS only"; o tráfego vai direto para a Vercel).

### Site institucional (`site/`)

Next.js em [zynio.com.br](https://zynio.com.br): páginas de produto, segurança, integrações, status, downloads, novidades
(todas as versões), newsletter com confirmação e **cancelamento pelo próprio site**, em 6 idiomas (tradução gerada por IA e
revisável na tela **Idiomas** do painel), analytics próprio sem IP e auditoria de SEO.

---

## Arquitetura

```
 Navegador / PWA / Apps / Alexa / Google / Telegram / Resend (webhook)
              │ HTTPS (Bearer = token do Supabase Auth)
              ▼
 ┌────────────────────────────────┐          ┌──────────────────────────────┐
 │ Vercel (papel "nuvem")          │   SQL    │ Supabase                     │
 │ FastAPI (api/index.py)          │◄────────►│ Postgres (pooler 6543, TLS)  │
 │ + estáticos do frontend         │          │ Auth · pg_cron · Storage     │
 │ + portão anti-robô (middleware) │          │ Realtime (mapa multijogador) │
 └───────────────┬─────────────────┘          └──────────────▲───────────────┘
                 │ grava em fila_comandos                    │ fila (~1 s), heartbeat,
                 │ (enviar, aprender, testar, infra…)        │ aluguel do "principal"
 ┌───────────────┴───────────────────────────────────────────┴──────────────┐
 │ Agente em 1 ou mais computadores do escritório                           │
 │ macOS (LaunchAgent) · Windows (tarefa agendada) · Linux/Raspberry Pi     │
 │ (systemd). Só o PRINCIPAL executa: fila, Sinric (WebSocket), agenda,     │
 │ automações, música, saúde dos transmissores, Vercel e Cloudflare.        │
 │ Os outros ficam de reserva e assumem em até 45 s.                        │
 └──────────────┬──────────────────────────────┬────────────────────────────┘
                │ rede local (tinytuya, 6668)   │ HTTPS: Vercel, Cloudflare,
                ▼                               ▼ Spotify, Resend, Tuya, NVIDIA
     SRW-004 ── infravermelho ──► ar
```

**Princípios**

- **Um código, dois papéis.** O mesmo FastAPI roda na Vercel (`nuvem`) e no escritório (`agente`). Só o agente abre threads e fala com a rede local.
- **Nunca dois principais.** Aluguel em `config.agente_lider` renovado a cada 10 s com `INSERT … ON CONFLICT … WHERE dono = eu OR vencido`. O computador **preferido** assume quando está online e enxerga os transmissores.
- **O front nunca lê o banco.** Tudo passa pela API, que valida o token, o papel e o escopo de projetos e ares.
- **Segredos cifrados em repouso** (AES-256-GCM com contexto por campo) e nunca no bundle.
- **Tudo mora no Supabase**: trocar o computador do agente não perde aparelhos, botões, Alexa, agenda nem música.

---

## Um comando de ponta a ponta

| Etapa | Onde | Erro típico e o que significa |
|---|---|---|
| 1. Tela | `POST /api/aparelhos/{id}/estado` | Botões desativados = ar sem transmissor |
| 2. Escolha do sinal | `clima.aplicar` | "Nenhum botão gravado…" = falta gravar |
| 3. Fila | `transmissor.enviar` grava em `fila_comandos` e espera 8 s | "Tempo esgotado" = nenhum agente principal pegou |
| 4. Agente | `processar_fila_uma_vez` → `_enviar_local` (TCP 6668) | "Nada respondeu" = rede; "Local Key mudou" = pareado de novo |
| 5. Ar | infravermelho | Não apitou = sinal errado ou sem visada |

Onde olhar: **Atividade** (filtro de falhas), **Infra → Agentes** (quem é o principal e o que enxerga), log do agente
(`~/Library/Logs/ClimaCasa.log` no Mac, `data\agente.log` no Windows, `journalctl -u clima-escritorio-agente` no Linux).

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.13 (Vercel em 3.12), FastAPI, psycopg 3 com pool, tinytuya, sinricpro 6, cryptography, httpx |
| Relatórios | reportlab (PDF), gerador próprio de DOCX, openpyxl (XLSX) |
| Frontend | React 18, Vite 5, Tailwind CSS 3, framer-motion, recharts, three.js, lucide-react, react-router 6, supabase-js 2 |
| Site | Next.js 16, GSAP, motor de tradução próprio |
| Banco e login | Supabase: Postgres, Auth (senha, Google, TOTP, passkeys), pg_cron, Storage, Realtime |
| Hospedagem | Vercel (app em `cle1`, site em `gru1`); DNS, e-mail recebido e Turnstile na Cloudflare |
| E-mail | Resend (domínio verificado), webhook assinado (Svix) |
| IA | NVIDIA (modelos Nemotron, inclusive o que ouve áudio e o que vê imagens) |
| Apps | Expo SDK 58 (Android), Swift (iPhone), Electron (macOS, Windows, Linux) |

---

## Estrutura do repositório

```
ar-controle/
├── CLAUDE.md            guia completo para quem vai mexer (regras, mapa, receitas, armadilhas)
├── api/index.py         entrada da Vercel
├── vercel.json          build, rewrites, cabeçalhos (CSP, Permissions-Policy), região
├── middleware.js        portão anti-robô do painel (Turnstile + prova de trabalho)
├── publicar-vercel.sh   publica a partir de uma cópia sem .git
├── instalar-servico.sh  agente como serviço do macOS
├── instalar-windows.ps1 · instalar-linux.sh   agente no Windows e no Linux/Raspberry Pi
├── backend/app/
│   ├── main.py          FastAPI, middleware de segurança, ciclo de vida do agente
│   ├── db.py            Postgres, config cifrada, registro de atividade
│   ├── clima.py · transmissor.py · ir_analise.py · gree.py · zonas.py   ares e infravermelho
│   ├── coordenador.py · convite.py   agente em vários computadores, instalação por código
│   ├── dispositivos.py  luzes, cafeteira, persianas, fechadura (Smart Life e placa própria)
│   ├── sinric.py · alexa.py · telegram.py · telegram_cmds.py · ia.py   voz, bot e IA
│   ├── infra.py · cloudflare.py   Vercel e Cloudflare (só no agente)
│   ├── correio.py · newsletter.py · musica.py · relatorio.py · backup_sistema.py · treinamento.py
│   ├── acesso.py · firewall.py · turnstile.py · cripto.py · sessoes.py · fisico.py   segurança
│   ├── novidades.json   "O que há de novo" (uma entrada por versão)
│   └── rotas/           api.py, contas.py, infra.py, ia.py, dispositivos.py, telegram.py, …
├── frontend/
│   ├── public/          PWA, instaladores (agente e clima-ia), cliente clima-ia
│   └── src/             pages/ (uma por rota), components/ (ui, 3D, infra, dispositivos, …)
├── site/                site institucional (Next.js), publicar com site/publicar.sh
├── supabase/            schema.sql (idempotente) e cron-jobs.json
├── apps/                android (Expo), desktop (Electron), ios (Swift)
├── agente-ia/           clima-ia completo, que roda dentro do projeto
├── alexa/               skill própria opcional (guia e Lambda)
├── scripts/             gree_gerar.py, release dos apps, cartão do Raspberry Pi, avatares
└── docs/                MANUAL.md, releases/, continuar/ (diário das sessões)
```

---

## Banco de dados

`supabase/schema.sql` é idempotente (rodar de novo é seguro). Datas em epoch (segundos). **RLS ligado em todas as tabelas**:
o backend conecta como dono pelo pooler e o navegador nunca lê o banco direto.

| Grupo | Tabelas principais |
|---|---|
| Configuração | `config` (chave → JSON; as sensíveis cifradas) |
| Lugares e aparelhos | `projetos`, `hubs` (transmissores), `aparelhos`, `codigos` (sinais IR), `dispositivos`, `dispositivos_eventos` |
| Rotina | `cenas`, `agendamentos`, `automacoes`, `temporizadores` |
| Operação | `atividade`, `fila_comandos` (tipos: `enviar`, `aprender`, `descobrir`, `evento`, `reparar`, `infra`, `testar`), `notificacoes` |
| Contas | `usuarios`, `passkeys`, `webauthn_desafios`, `sessoes_fortes`, `sessoes_uso` |
| Segurança | `seguranca_ips`, `seguranca_eventos`, `seguranca_ip_info` |
| Comunicação | `email_envios`, `newsletter_inscritos`, `newsletter_campanhas`, `site_mensagens` |
| IA e site | `ia_conversas`, `site_textos`, `site_traducoes`, `analise_eventos` |
| Rotinas | `metricas_diarias`, `alertas`, `backups`, `saude_sistema`, `cron_log`, `cron_job_registry` |

**Rotinas pg_cron** (prefixo `clima_`, UTC): transmissores offline (5 min), OAuth vencido (15 min), métricas (de hora em hora),
alerta de ar ligado há 12 h, alerta de falhas (30 min), backup diário (05:00, guarda 14), limpeza de atividade e logs,
tamanho do banco (6 h) e ANALYZE semanal.

---

## API

Prefixo `/api`, JSON, `Authorization: Bearer <token do Supabase>`. Erros sempre `{"detail": "mensagem em pt-BR"}`;
validação devolve 422 "Confira o(s) campo(s)".

| Grupo | Rotas principais |
|---|---|
| Sessão e conta | `POST /auth/entrar`, `POST /auth/esqueci`, `GET /sessao`, `GET /conta/seguranca`, `GET /conta/meus-dados`, `/conta/sessoes` |
| Painel | `GET /painel`, `GET /metricas`, `GET /atividade`, `GET /notificacoes` |
| Ares | `/aparelhos…` (estado, aprender, botões, `botoes/analise`, `gree`, `copiar-botoes`, temporizador), `GET /gravacoes/{job}` |
| Transmissores e zonas | `/hubs…` (`testar`, `todos`, `ares`, `teste-interferencia`), `GET\|PUT /zonas` |
| Aparelhos Smart Life e placas | `/dispositivos…` |
| Rotina | `/projetos`, `/cenas`, `/agendamentos`, `/automacoes` |
| Voz | `/sinric…` (diagnóstico, zona, último comando), `/alexa…` |
| IA | `/ia/conversar`, `/ia/conversas…`, `/ia/transcrever`, `/ia/preferencias` |
| Relatórios | `GET /relatorios/completo`, `GET /relatorios/exportar?formato=…`, `POST /relatorios/enviar` |
| Infra | `/infra/saude\|resumo\|uso\|publicacoes\|dominios`, `/infra/cf/…` (visão, DNS, e-mail, DNSSEC, Turnstile, auditoria), `/agentes…` |
| Públicas | `POST /site/contato`, `/site/newsletter/…`, `POST /email/webhook` (Svix), `POST /agentes/convite/resgatar`, `GET /saude` |

As rotas públicas têm proteção própria (Turnstile, assinatura, `state` de uso único ou prova de trabalho).

---

## Usuários e permissões

Sem cadastro público. Papéis: **dono > admin > subadmin > operador > visualizador** (ou personalizado), com 14 permissões e
regras por rota em `backend/app/acesso.py`. Cada pessoa pode ter acesso a alguns projetos (salas) e até a **alguns ares**.
Ninguém dá a outra pessoa o que não tem. Toda rota que muda dados precisa cair numa regra; `rotas_sem_regra()` lista as que
faltam (meta: vazio, e hoje está vazio).

Login com senha (mínimo 10 caracteres, conferida contra vazamentos conhecidos), **Google**, **2FA (TOTP)** e **biometria
(passkeys)**. Sessões com limite de inatividade e duração máxima, revogáveis. Em **Configurações → Segurança**, cada pessoa vê
a nota de segurança da própria conta, as últimas entradas e tentativas, liga alertas por e-mail (senha errada 3 vezes em 1 h,
entrada de IP novo) e baixa os próprios dados.

---

## Segurança

| Camada | Controle |
|---|---|
| Portão | Página de verificação (Turnstile, com prova de trabalho como reserva) antes do painel e do site |
| Login | Turnstile (também no Supabase Auth), bloqueio por conta e por IP, aviso de IP novo |
| Firewall de aplicação | Listas de IP, país, assinaturas de ataque, limite por minuto, bloqueio progressivo; escudo anti-DDoS liga o modo de ataque da Vercel |
| Navegador | CSP restrita, HSTS, X-Frame-Options DENY, nosniff, COOP/CORP, Origin-Agent-Cluster, X-Permitted-Cross-Domain-Policies, CSRF por `Origin`, microfone só no próprio domínio |
| Dados | AES-256-GCM em repouso, TLS verificado até o banco, RLS em tudo, SQL parametrizado, logs selados com SHA-256 |
| Comandos físicos | Limite por aparelho, isolar aparelho, validade dos comandos na fila (comando velho não é executado) |
| Tokens amplos | Vercel, Cloudflare e GitHub só no `.env` do agente, nunca na Vercel |
| Auditoria | `uvx pip-audit`, `npm audit`, `bandit`; checklist de 18 controles ao vivo na tela Segurança |
| Testes de ataque | 1.325 testes (arquivos expostos, cabeçalhos, API sem login e com token falso, CORS, métodos HTTP, redirecionamento aberto, Host falso, XSS refletido, COOP/CORP, TLS, DNS e e-mail), com varredura automática semanal e notificação |
| Conta | Alerta de entrada da mesma conta em dois países em menos de 6 h; aviso de IP novo; sessões com inatividade e duração máxima |
| Domínio | CAA (só Let's Encrypt e Google emitem certificado), DNSSEC, SPF, DKIM, DMARC `p=reject`, `security.txt` (RFC 9116) |
| E-mail | Lista de bloqueio automática: quem devolveu ou marcou spam não recebe mais nada (protege a reputação do domínio) |

Achou uma vulnerabilidade? Escreva para `seguranca@zynio.com.br`. Segredo vazado:
rotacione na hora (Supabase, Vercel, Cloudflare, Sinric, Spotify, Resend, Turnstile, NVIDIA).

---

## Configuração e segredos

O `.env` fica na raiz (gitignored, permissão 600) e nas variáveis do projeto na Vercel. **Nunca** no repositório, em issue
ou no bundle.

| Variável | Onde | Para quê |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | agente e Vercel | projeto e chave pública |
| `SUPABASE_SECRET_KEY` | agente e Vercel | administração do Auth |
| `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_PORT` (6543) | agente e Vercel | Postgres pelo pooler |
| `SUPABASE_ACCESS_TOKEN` | só `.env` | schema e rotinas |
| `CLIMA_CHAVE_MESTRA` | agente e Vercel (a mesma) | cifra dos segredos em repouso. Perder = reconectar Smart Life, Sinric, Spotify e Resend |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `VERIFICACAO_SEGREDO` | agente e Vercel | anti-robô |
| `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN` | **só** agente | publicar e tela Infra |
| `SINRIC_*`, `NVIDIA_API_KEY` | agente | copiados para o banco cifrados |
| `CLIMA_PORTA`, `CLIMA_PAPEL`, `CLIMA_MAQUINA_ID` | opcionais | porta (8090), simular a nuvem, id do computador |

A Vercel só repassa ao código variáveis com os prefixos `SUPABASE_`, `TUYA_`, `CLIMA_`, `TURNSTILE_` e `VERIFICACAO_`.
Antes de cada commit, o diff não pode ter nada parecido com chave (`git diff --cached | grep -E "sb_secret_|sbp_|vcp_|ghp_|whsec_|nvapi-"`).

---

## Rodar localmente

Requisitos: Python **3.13** (o 3.15 do Homebrew não tem o psycopg pronto), Node 20+, `uv`.

```bash
uv venv .venv --python 3.13
uv pip install --python .venv/bin/python -r backend/requirements.txt
cd frontend && npm install && npm run build && cd ..   # gera backend/static
cd backend && ../.venv/bin/python -m app.main          # http://127.0.0.1:8090
```

- Frontend com recarga: `cd frontend && npm run dev` (Vite em :5173, proxy para :8090).
- Simular a Vercel: `CLIMA_PAPEL=nuvem CLIMA_PORTA=8097 ../.venv/bin/python -m app.main` (a 8090 é do serviço instalado).
- Site: `cd site && npm install && npm run dev` (porta 3100).

---

## Instalar o agente no escritório

| Sistema | Como |
|---|---|
| macOS | `./instalar-servico.sh` (roda de uma cópia em `~/Library/Application Support/ClimaCasa`, porque serviço não lê `~/Documents`) |
| Windows | **Infra → Agentes → Instalar** gera um código de 30 min; no PowerShell como administrador, rode o comando que a tela mostra |
| Mac (por código, sem a pasta do projeto) | `curl -fsSL https://app.zynio.com.br/instalar-agente-mac.sh -o /tmp/ia.sh && bash /tmp/ia.sh <código>` |
| Linux (Debian, Ubuntu, Fedora, RHEL, Rocky, openSUSE, Arch) e Raspberry Pi 64 bits | `curl -fsSL https://app.zynio.com.br/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh <código>` |
| Servidor com Docker (sem systemd) | o mesmo comando com `--docker` no fim: sobe o contêiner `clima-escritorio-agente` com a rede do servidor |
| Cartão do Raspberry pronto no Mac | `./scripts/preparar-cartao-raspberry.sh` (grava o sistema, Wi-Fi, código e `.env`; o 1º boot espera rede, DNS e relógio e instala tudo) |

Guia completo do Raspberry Pi (acesso, rede da prefeitura por cabo ou Wi-Fi, o que pedir à TI, problemas): [`docs/RASPBERRY.md`](docs/RASPBERRY.md).

**O que a rede precisa liberar**: saída TCP 443 (sem inspeção SSL) e **6543** (banco do Supabase, a porta mais bloqueada em redes
corporativas), e o computador na mesma rede/VLAN dos transmissores (TCP 6668, UDP 6666/6667). O instalador testa e diz o que está
bloqueado; depois, **Rede → Portas e serviços** mostra o mesmo a qualquer momento.

Depois confira em **Infra → Agentes**: o principal precisa aparecer online e **enxergando N de N** transmissores.
Recomendação: um computador do escritório sempre ligado (ou um Raspberry Pi) como **preferido**.

---

## Publicar

```bash
cd frontend && npm run build && cd ..
git add <arquivos> && git commit -m "…" && git push
./publicar-vercel.sh        # NUNCA "vercel deploy" na pasta com .git
./instalar-servico.sh       # atualiza o agente do Mac (Windows/Linux: rodar o instalador de novo)
cd site && ./publicar.sh    # site (SEM_TEXTOS=1 pula a extração de textos para tradução)
curl -s -o /dev/null -w "%{http_code}" https://app.zynio.com.br/saude   # 200
```

---

## Apps

| App | Arquivo no release | Pasta | Como construir |
|---|---|---|---|
| Android | `ClimaCasa-android.apk` | `apps/android` | `npx eas-cli@latest build -p android --profile preview` |
| iPhone | `ClimaCasa-ios.ipa` | `apps/ios` | `xtool dev build --ipa -c release` |
| macOS | `ClimaCasa-mac-apple-silicon.dmg`, `ClimaCasa-mac-intel.dmg` | `apps/desktop` | `electron-builder` |
| Windows | `ClimaCasa-windows.exe` | `apps/desktop` | `electron-builder` |
| Linux | `ClimaCasa-linux-x64.AppImage`, `ClimaCasa-linux-arm64.AppImage` | `apps/desktop` | `electron-builder` |
| Extensão do navegador | `ClimaCasa-extensao.zip` | `apps/extensao` | `cd apps/extensao && zip -r ../../ClimaCasa-extensao.zip . -x README.md` (Chrome, Edge, Brave e Firefox; usa a sessão do painel) |
| Web / PWA | instalável pelo navegador | `frontend/public` | junto com o build |

Os downloads também saem pela tela **Apps** do painel, sem precisar de acesso ao GitHub (link temporário pedido pelo servidor).
Depois do release: `scripts/gerar-release-json.sh` e `backend/app/versao_apps.json` (os apps avisam da versão nova).
Detalhes em [`apps/android/README.md`](apps/android/README.md) e [`apps/desktop/README.md`](apps/desktop/README.md).

---

## Versões e novidades

Toda publicação que muda o que alguém vê ganha uma entrada no topo de `backend/app/novidades.json` (versão em sequência:
0.0.0 … 0.0.9, 0.1.0 …). Cada pessoa vê o modal "O que há de novo" uma vez, a central de notificações avisa e a página
`/novidades` (e a do site) mostra o histórico inteiro. Os apps têm numeração própria (1.8.1).

---

## Testes e checklist de entrega

1. `cd frontend && npx vite build` sem erro.
2. `cd backend && ../.venv/bin/python -c "import app.main"` e `uvx ruff check --select F821 backend/app`.
3. ESLint só com `no-undef` no `frontend/src` (variável indefinida já deixou tela preta).
4. Navegador (Playwright) com sessão temporária: telas tocadas em 1440 e 375 px, sem erro de JS, sem 4xx/5xx, sem rolagem lateral.
5. Publicar, conferir `/saude` 200 e rotas novas 401 sem login.
6. Apagar a sessão e os dados de teste; dizer o que não foi testado.

---

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| O ar não obedece | Infra → Agentes: existe principal online **enxergando** o transmissor? Senão, ligar o PC do escritório |
| Botões do painel desativados | O ar não tem transmissor: vincular em Aparelho → Ajustes |
| Dois ares iguais mudam juntos | É físico (o infravermelho não tem endereço): trate como zona ou dê um transmissor para cada |
| "Nenhum sinal recebido" ao gravar | Protocolo Tuya errado: use **Testar conexão** no cartão do transmissor (ele corrige) |
| Transmissor "Local Key mudou" | Foi pareado de novo: com a conta Smart Life conectada, "Reconectar agora" busca a chave nova |
| Portão parado em "Verificando…" | Espere 20 s ou "Tentar de novo"; abrir zynio.com.br também libera |
| Erro de certificado só em certas redes | Firewall corporativo interceptando HTTPS: use `https://clima-casa-lac.vercel.app` ou peça à TI para liberar o domínio |
| Publicação "BLOCKED" | Use `./publicar-vercel.sh` (cópia sem `.git`) |
| Página lenta ou pulando | Acessos e SEO → Sistema → Desempenho → O que melhorar: a rota, a métrica e o elemento responsável, medidos em quem usa |
| Comando recusado "política do escritório" | A temperatura pedida está fora da faixa de Configurações → Geral (dono ou admin muda) |
| Quem desligou o ar? | Segurança → Logs ou Atividade → Por ar: cada ação tem a pessoa (desde a 0.6.9) |

A lista completa, com dezenas de casos que já aconteceram, está na seção 13 do [`CLAUDE.md`](CLAUDE.md).

---

## Perguntas frequentes

**Cada ar precisa do seu transmissor?**
Não. Um SRW-004 atende vários ares à vista. Mas ares **iguais** recebem o mesmo sinal e mudam juntos; para comandá-los
separados, cada um precisa de um transmissor perto e virado só para ele, ou estar em salas fechadas diferentes.

**Funciona com qualquer ar-condicionado?**
Com qualquer um que tenha controle remoto infravermelho. Cada modelo precisa ter os botões gravados uma vez (ou copiados de
um ar igual; no Gree, gerados a partir do Desligar).

**E se o computador do escritório desligar?**
Os comandos ficam sem ter quem os execute. Outro computador com o agente assume em até 45 s; por isso vale ter dois.

**Dá para usar Arduino ou ESP32?**
Sim, como placa própria para luzes, cafeteira, persianas e fechadura (código gerado no painel). Não para rodar o agente nem,
por enquanto, para mandar infravermelho aos ares.

**O custo do relatório é exato?**
Não, é estimativa (horas ligado × potência × tarifa). Serve para comparar meses e aparelhos.

---

## Apêndices técnicos

### A. Como o sinal do ar é escolhido

1. Monta o estado desejado (ligado, modo, temperatura, ventilação) dentro da faixa do aparelho.
2. Procura o botão exato `modo_temp_vent`; senão, mesma temperatura com outra ventilação; senão, a temperatura gravada mais
   próxima no mesmo modo (e o estado salvo vira o do sinal enviado).
3. Desligar usa sempre `desligar`.
4. Depois do envio, os outros ares da mesma zona mudam junto no banco e na Alexa.

### B. Reconexão automática do transmissor

| Resposta | Significado | O que o agente faz |
|---|---|---|
| `900` | ok | nada |
| `914` | chave errada (pareado de novo) | busca a Local Key nova na conta Smart Life |
| `905` / `901` | não responde no IP | varre a rede pelo ID e grava o IP novo; ID novo único → migra o cadastro |

O protocolo (3.3, 3.4 ou 3.5) é testado e corrigido sozinho.

### C. Reconhecimento do botão gravado

`backend/app/ir_analise.py` lê a quantidade de pulsos e o cabeçalho para dizer o protocolo (Gree, NEC, Midea, Samsung,
LG e outros) e a confiança. No Gree, decodifica o ajuste (modo, temperatura, ventilação) e compara com o botão que foi
pedido; se não bate e o ajuste existe no ar, grava no botão certo.

### D. Consumo estimado

- Horas ligado = soma dos trechos entre "ligar" e o "desligar" seguinte (cada trecho limitado a 24 h).
- kWh = horas × potência (W) ÷ 1000; custo = kWh × tarifa (editável na tela).
- Referência: 9.000 BTU ≈ 800 W, 12.000 ≈ 1.100 W, 18.000 ≈ 1.650 W, 24.000 ≈ 2.200 W.

---

## Backup

Backup → **Gerar backup** guarda tudo: as tabelas do banco (ares, botões, transmissores, salas, cenas, agenda, automações, mapa,
usuários, configurações com segredos cifrados), os **arquivos 3D** (avatares, carros, objetos; copiados dentro do Supabase, sem
tráfego, uma vez por versão) e os **códigos** das placas Arduino/ESP (sem o token, que se gera de novo) e dos instaladores.
Agendado (diário ou semanal, com retenção), conferir integridade (sha256), comparar dois backups, procurar e restaurar só algumas
linhas, cópia automática antes de restaurar e "trazer os arquivos de volta". Gerar não gasta tráfego; **baixar** um backup gasta.

## Cota do Supabase (plano grátis)

5 GB de tráfego (Egress) por mês, 1 GB de Storage e 0,5 GB de banco. Passou da cota, há um prazo e depois o projeto responde 402.
O que o sistema faz para caber: modelos 3D guardados em cada navegador; telas que não consultam com a aba escondida (o sino a cada
60 s); agente que pergunta pela fila a cada 2,5 s parado (~44 MB/dia, medido); pacotes antigos do código apagados a cada publicação.
**Supabase → Uso e cota** mostra banco, Storage e pedidos por hora; o Egress em GB só aparece no painel do Supabase.

## Repositórios e CI/CD

`estevam5s/clima-casa` e `PMF-projetos/clima-casa` ficam iguais nos dois sentidos (workflow `sincronizar-repositorios.yml`, chaves
SSH de deploy, sem forçar). O CI (`ci.yml`) roda nos dois: segredos no código, backend (ruff, Python 3.11, import, pip-audit),
painel e site (build e npm audit). A produção é publicada à mão (`publicar-vercel.sh`, que confere a versão no ar). Detalhes na
seção 18 do `CLAUDE.md`.

---

## Licença

Software proprietário. Todos os direitos reservados. Uso restrito ao titular do repositório e a quem ele autorizar.
