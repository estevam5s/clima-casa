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

## Fase 4: respostas do dono (18/11, noite) e andamento
Feito:
- **Bot do Telegram** (1.14.0): @zynio_bot no ar (webhook em app.zynio.com.br, token cifrado em config.telegram). Falta o
  teste de ponta a ponta com um Telegram de verdade: painel → Telegram → Gerar código → abrir o link.
- **Testes de segurança**: token de uso único por lote (não depende mais de VERIFICACAO_SEGREDO igual no agente e na Vercel).

Bloqueado (precisa de ação do dono):
- **Raspberry Pi 3B**: o Mac não detectou o leitor de cartão (nada em `diskutil list` nem no USB). Reconectar o leitor e rodar
  `./scripts/preparar-cartao-raspberry.sh` (pede o disco, "APAGAR", SSID `Egov` e a senha do Wi-Fi digitada no Terminal, e o
  sudo). Depois: Infra → Agentes → Preferir o Raspberry.
- **Spotify pelo navegador**: a extensão do Claude não conecta (o dono usa Brave; precisa do Chrome com a extensão logada).

Feito também:
- **clima-ia** (agente de IA no terminal, NVIDIA Nemotron 3 Ultra): `./agente-ia/instalar.sh` → comando `clima-ia`; chave em
  `NVIDIA_API_KEY` no `.env`. Ferramentas com confirmação; segredos mascarados antes de sair da máquina.
- **Transferir o posto de dono** (1.15.0): Usuários → coroa; senha + Turnstile + e-mail digitado.

- **Bugs** (1.16.0): tabela `bugs`, relatos, erros de tela/500 automáticos, varredura de hora em hora, prompt para IA.
- **Minimapa** no mapa 3D (1.16.0) e **exportação com esqueleto** para o Blender (Estúdio de avatares).
- **Raspberry**: cartão detectado (disk4, 64 GB, tinha Raspberry Pi OS desktop de 2024). Script melhorado (watchdog, Wi-Fi
  sem economia, atualizações de segurança). Falta o dono rodar: `CLIMA_WIFI_SSID=Egov ./scripts/preparar-cartao-raspberry.sh`
  (digita disk4, APAGAR, a senha do Wi-Fi e a do Mac). Depois: Infra → Agentes → Preferir "clima-agente".

A fazer (decisões já tomadas pelo dono):
3. Apps por link temporário do Storage do Supabase (sem GitHub) + releases novos de Android e desktop (confirmado).
4. Treinamento com 1.000+ perguntas próprias (ISO e LGPD), nota na tela e por e-mail.
6. Segurança: relatório no modelo da Prefeitura e envio por e-mail.
7. Contadores nas rotas do menu lateral (além de Notificações e Mensagens).
8. Usuários: escolher as categorias de rotas que cada um acessa.
9. Supabase: mais funcionalidades da plataforma na tela.
10. Cafeteira e persianas: editor 3D da aparência ("blender").
11. Guia: impressão no modelo da PMF e mais completo.
12. Precificação: domínio + 9 dispositivos a US$ 3 cada, com itens adicionáveis.

