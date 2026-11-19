# Pendências (ordem de prioridade)

## Ação do dono / do escritório
1. Atualizar o agente do **PC do João** (Infra → Agentes → Instalar → código; PowerShell admin). Sem isso, correções de agente da 1.10/1.10.1 só valem com o Mac no comando.
2. Parear o **Ekaza Mini 3** no Smart Life (2,4 GHz) → Transmissores → Importar um (escolher a sala) → conferir protocolo/conexão → gravar o Desligar.
3. Um transmissor por sala fechada (Diretor, Deison, Bancada, Fabio, Reunião). Salão aberto pode dividir.
4. Testar interferência (Transmissores → Testar interferência) com uma pessoa em cada sala.
5. Spotify: adicionar a conta em User Management (precisa do e-mail da conta Spotify do escritório).

## Fase 3 (sem decisão)
- Auditoria de segurança completa (pip-audit, npm audit, bandit, rotas sem regra, revisar `window.confirm` restantes: ~25 pontos, ver `grep -rn "window.confirm" frontend/src`).
- READMEs (raiz, `apps/android`, `apps/desktop`) no mesmo formato; site `site/` com as funcionalidades novas (Iluminação, Notificações, cidade no 3D…).
- Guia (`pages/Guia.jsx`) e `docs/MANUAL.md` com Iluminação, Notificações, relatório por e-mail, café, ruas, um transmissor por sala.

## Fase 4 (precisa da resposta do dono, perguntado em 18/11 e ainda sem resposta)
1. Agente de IA local "igual ao Claude Code": proposta = o próprio Claude Code + servidor MCP do sistema (ver/ligar/desligar ares) usando a API com token de serviço.
2. Transferir o posto de dono (proposta: dono atual vira admin; senha + confirmação do novo dono + e-mail aos dois).
3. Apps para quem não tem acesso ao GitHub: instaladores no Storage do Supabase com link assinado (a regra do projeto proíbe token do GitHub na Vercel).
4. Bot do Telegram: dono cria no @BotFather e passa o token (guardar cifrado); quem pode usar.
5. Treinamento: banco com 1.000+ perguntas próprias (ISO 27001/27002/27701/22301/9001/37001 + LGPD), nota na tela e por e-mail. "Todas as ISO" não é viável nem honesto.
6. Releases novos dos apps Android/desktop (publicar release é público: confirmar).
