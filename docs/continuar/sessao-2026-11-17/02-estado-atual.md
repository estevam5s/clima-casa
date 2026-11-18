# Estado atual (17/11/2026, noite)

## Ares (9) e transmissores
| # | Ar | Projeto (sala) | Transmissor | Botões |
|---|---|---|---|---|
| 1 | Ar do escritório | Escritório | Smart IR · Escritório | 301 (Desligar gravado + 300 Gree) |
| 7 | Ar dos analistas | Analistas | Smart IR · Escritório | 301 (copiados) |
| 8 | Ar do diretor | Diretor | Smart IR · Escritório | 301 |
| 9 | Ar servidor | Sala Bancada | Smart IR · Escritório | 301 |
| 10 | Ar Guilherme | Sala Bancada | Smart IR · Escritório | 301 |
| 11 | Ar do Deison | Sala Deison | Smart IR · Escritório | 301 |
| 4 | Ar dos devs | Devs | Smart IR · Fabio e Devs | 301 |
| 12 | Ar do Fabio | Sala Fabio (8) | Smart IR · Fabio e Devs | 301 |
| 13 | Ar da reunião | Reunião (5) | **sem transmissor** (C ainda não comprado) | 301 |

- Zonas automáticas: "Zona Smart IR · Escritório" (6 ares: 1, 7, 8, 9, 10, 11) e "Zona Smart IR · Fabio e Devs" (4, 12). Um sinal muda a zona inteira (físico: IR não tem endereço).
- Teste físico de interferência: **não feito** (precisa de agente no escritório e alguém no salão).

## Agentes
- Mac do dono (MacBook-Air) e PC do João (Windows, preferido). Fora do expediente nenhum enxerga os transmissores: o painel mostra "online", mas comando não chega ao ar.
- Raspberry Pi: instalador pronto (`instalar-agente.sh`), **não instalado em hardware ainda**.

## Alexa / Sinric
- Sinric: 9 de 9 dispositivos, cada um na sala do projeto, online; `isAmazonAlexaLinked = true`.
- Conta Amazon nova do dono com a skill Sinric Pro: falta "Alexa, descobrir dispositivos" e o 1º comando de voz confirmado na Atividade.

## Usuários
- Dono e 2 admins (um é o Deison, sem 2FA). Responsável por ar disponível ("Só estes ares").

## Conformidade ISO 27001 (tela Segurança)
- Geral 56% · Anexo A 60% · 54 implementados, 3 parciais, 36 pendentes.
- Pendências técnicas que dependem de pessoas: 2FA dos admins, revisão de acessos, responsável do plano de incidentes, riscos (botão "riscos sugeridos"), escopo.

## Versões
- Web: 1.7.0 (17/11). Apps (Android/desktop): ver `backend/app/versao_apps.json` e as releases do GitHub.
