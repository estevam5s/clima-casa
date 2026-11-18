# Sessão de 17/11/2026 · como continuar

Pasta com o que foi feito, o estado real e o que falta, para um Claude Code novo continuar sem perder nada.

| Arquivo | Para quê |
|---|---|
| `01-historico.md` | O que foi pedido e feito, em ordem (versões 1.4.2 a 1.7.0) |
| `02-estado-atual.md` | Ares, transmissores, agentes, Alexa/Sinric, contas e números de hoje |
| `03-pendencias.md` | O que ficou para depois, em ordem de prioridade, e o que depende do dono |
| `04-decisoes.md` | Decisões que o dono já tomou (não perguntar de novo) e regras físicas do sistema |
| `05-testes.md` | Como testar cada parte (sessão temporária, Playwright, Docker ARM, PDF/Word) |
| `PROMPT.md` | Texto para colar numa sessão nova do Claude Code |
| `continuar.sh` | Abre o Claude Code na pasta do projeto já com o `PROMPT.md` |

Abrir a sessão nova:

```bash
cd ~/Documents/projeto-deison/ar-controle
./docs/continuar/sessao-2026-11-17/continuar.sh
```

O `CLAUDE.md` da raiz é a fonte principal (arquitetura, regras de ouro, roteiros); esta pasta é o "diário" da sessão.
