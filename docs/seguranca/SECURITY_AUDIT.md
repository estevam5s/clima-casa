# Auditoria de segurança e modelo de ameaças (20/11/2026)

Feita sobre o código real do repositório, a partir do roteiro `seguranca.md`. Só registra o que existe. Onde o
roteiro fala de algo que o sistema não usa (MQTT, firmware próprio, Kubernetes), está dito "não se aplica" e o porquê.

## 1. O que existe de verdade (superfície)

| Componente | Tecnologia | Exposição |
|---|---|---|
| Painel web/PWA + API | React (Vite) + FastAPI na Vercel (`app.zynio.com.br`) | Internet, HTTPS/HSTS, portão Turnstile, firewall próprio |
| Agente | o mesmo FastAPI em Mac/Windows/Linux do escritório | Só sai para a internet (Supabase, Vercel, Tuya, Sinric). Painel local em `127.0.0.1:8090` |
| Banco, Auth, Storage, cron | Supabase (Postgres pelo pooler 6543 com TLS verificado, RLS ligado em tudo) | Só o backend conecta; o navegador nunca lê o banco |
| Transmissores IR | Tuya SRW-004 na LAN (TCP 6668, protocolo 3.3/3.5 cifrado com a Local Key) | Só a rede local do escritório |
| Luzes, cafeteira, persianas, fechadura | Nuvem Tuya (Smart Life) ou **placa própria** (Arduino/ESP) que busca comandos por HTTPS | Placa: `POST /api/iot/sincronizar` com token único por aparelho |
| Alexa/Google | Sinric Pro (WebSocket assinado com HMAC) e skill própria opcional (OAuth 2.0) | Saída do agente; diretivas da skill com chave própria |
| Bots e IA | Telegram (webhook com segredo), Assistente (NVIDIA) com as permissões de quem pergunta | Internet |
| Apps | Android (Expo), desktop (Electron), iPhone | Mesma API com Bearer |

**Não se aplica**: MQTT (não há broker; nenhum dispositivo fala MQTT), firmware próprio dos transmissores (são
produtos Tuya fechados), Kubernetes/containers em produção (Vercel serverless + serviço do SO), Redis (não usado).
ESP32/ESP8266/Arduino só entram como **placa própria opcional**, sem placa instalada hoje.

## 2. Comandos que mexem em equipamento físico

| Origem | Caminho | Trava no servidor |
|---|---|---|
| Painel, apps, Telegram, IA, Alexa (skill e Sinric), agenda, automação, cena | `clima.aplicar` → fila `enviar` → agente → IR | permissão + escopo de projeto/ar (`acesso.py`), faixa de temperatura, **`fisico.checar_ar`** |
| Luz, cafeteira, persiana, fechadura | `dispositivos.comando` → nuvem Tuya ou fila da placa | permissão, escopo, senha+Turnstile para destrancar, **`fisico.checar_dispositivo`** |

## 3. STRIDE

| Ameaça | Exemplo neste sistema | Controle que existe | Lacuna (antes de hoje) |
|---|---|---|---|
| **S**poofing (identidade) | senha vazada de um usuário | Supabase Auth, 2FA TOTP, passkeys, bloqueio por conta e IP, HIBP, alerta de IP novo, CAPTCHA no Auth | 2FA não obrigatório para admin (decisão do dono) |
| Falsificar dispositivo | placa falsa sincronizando | token `cp_` único por aparelho, só o hash no banco, 20 falhas = 429 | — |
| **T**ampering | alterar comando na fila | fila só no banco (RLS), backend é o único escritor; logs selados com SHA-256 | comando IR velho podia sair até 120 s depois |
| Replay | placa offline executa pedido antigo | — | **sem validade por comando na fila da placa** |
| **R**epudiation | "não fui eu que destranquei" | `atividade` e `dispositivos_eventos` com origem e usuário, selo de integridade por hora | — |
| **I**nformation disclosure | segredo no bundle/log | segredos cifrados AES-256-GCM, varredura antes do commit, resultado de `infra` apagado ao ler | — |
| **D**oS na API | rajada de requisições | firewall por IP, escudo com modo de ataque da Vercel, limites por rota | — |
| DoS físico / abuso | automação em laço liga e desliga o ar sem parar | — | **sem limite por aparelho** |
| **E**levation of privilege | operador comanda ar de outra sala | `REGRAS`, escopo de projetos e de ares, `_pode_mexer_em` | — |
| Controle físico não autorizado | conta comprometida usando a fechadura | senha + Turnstile para destrancar, auto trancar, alerta fora do expediente | **sem como isolar o aparelho rapidamente** |

## 4. Matriz de riscos (impacto × probabilidade × explorabilidade, 1 a 3)

| Risco | I | P | E | Nota | Prioridade |
|---|---|---|---|---|---|
| Comando físico atrasado/repetido (replay, fila velha) | 3 | 2 | 2 | 12 | **Alta, corrigido hoje** |
| Automação em laço / rajada no mesmo aparelho | 2 | 2 | 3 | 12 | **Alta, corrigido hoje** |
| Conta comprometida mexendo em fechadura/ar | 3 | 1 | 2 | 6 | **Média, contenção nova hoje (isolar)** |
| Cafeteira esquecida ligada sem limite configurado | 3 | 1 | 3 | 9 | **Alta, corrigido hoje (padrão 90 min)** |
| Admin sem 2FA | 3 | 1 | 2 | 6 | Média, depende do dono |
| Rede do escritório sem VLAN para IoT | 2 | 1 | 1 | 2 | Baixa (recomendação em `SECURITY_IMPLEMENTATION_REPORT.md`) |
| Transmissor Tuya com firmware fechado | 2 | 1 | 1 | 2 | Aceito (sem alternativa no hardware) |

## 5. Correções desta rodada

Ver `SECURITY_IMPLEMENTATION_REPORT.md`.
