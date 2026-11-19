# Pendências (ordem de prioridade)

## Ação do dono / do escritório
1. Atualizar o agente do **PC do João** (Infra → Agentes → Instalar → código; PowerShell admin). Sem isso, correções de agente da 1.10/1.10.1 só valem com o Mac no comando.
2. Parear o **Ekaza Mini 3** no Smart Life (2,4 GHz) → Transmissores → Importar um (escolher a sala) → conferir protocolo/conexão → gravar o Desligar.
3. Um transmissor por sala fechada (Diretor, Deison, Bancada, Fabio, Reunião). Salão aberto pode dividir.
4. Testar interferência (Transmissores → Testar interferência) com uma pessoa em cada sala.
5. Spotify: adicionar a conta em User Management (precisa do e-mail da conta Spotify do escritório).

## Fase 3: feita em 18/11 (1.13.1)
- Auditoria: pip-audit (raiz e backend) e site sem achados; frontend com aviso moderado do react-router (open redirect por
  barra invertida e SSR): mitigado por `rotaSegura()` (recusa `\\`, `//` e protocolos); a correção exige react-router 7
  (quebra a navegação): fica para uma migração planejada. Bandit: só os falsos positivos conhecidos (B608/B104). Nenhum
  segredo no código, no histórico do git nem no bundle. `rotas_sem_regra()` vazio.
- Todos os `window.confirm` trocados por `confirmar()` (componente `ConfirmacaoGlobal` no Layout).
- Guia, MANUAL.md (seção 14A) e PDF; README da raiz; READMEs novos de `apps/android` e `apps/desktop`; site com
  Iluminação/escritório, Mapa 3D, transmissores por sala e a novidade de 18/11.

## Fase 4 (precisa da resposta do dono, perguntado em 18/11 e ainda sem resposta)
1. Agente de IA local "igual ao Claude Code": proposta = o próprio Claude Code + servidor MCP do sistema (ver/ligar/desligar ares) usando a API com token de serviço.
2. Transferir o posto de dono (proposta: dono atual vira admin; senha + confirmação do novo dono + e-mail aos dois).
3. Apps para quem não tem acesso ao GitHub: instaladores no Storage do Supabase com link assinado (a regra do projeto proíbe token do GitHub na Vercel).
4. Bot do Telegram: dono cria no @BotFather e passa o token (guardar cifrado); quem pode usar.
5. Treinamento: banco com 1.000+ perguntas próprias (ISO 27001/27002/27701/22301/9001/37001 + LGPD), nota na tela e por e-mail. "Todas as ISO" não é viável nem honesto.
6. Releases novos dos apps Android/desktop (publicar release é público: confirmar).
