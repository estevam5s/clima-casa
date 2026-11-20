# Pendências
1. Dono: parear o interruptor Novadigital no app Smart Life (mesma conta dos transmissores, 2,4 GHz; tirar do app Novo Digital antes) → Luzes → Adicionar interruptor.
2. Dono: /musica → Reconectar (escopo streaming) e ligar Widevine no Brave.
3. Conformidade (só a organização): aprovar política (5.1) e compromisso da direção (5.4); contatos ANPD/CERT.br (5.5/5.6); responsável do plano de incidentes (5.24); revisão de acessos (5.18); 2 de 4 aceitaram o Termo (5.10/6.2/6.5/6.6); treinamento 0 de 4 (6.3); 2FA dos 3 admins (5.17/8.2/8.5); conta "Joao Silveira" (admin) nunca entrou: revisar/desativar (5.16); minutas dos controles manuais (5.8, 5.11, 5.12, 5.19–5.21, 5.32, 5.35, 6.1, 6.4, 7.9, 7.10, 8.30, 8.31, 8.33).
4. Opcional: token fine-grained só leitura do GitHub em Apps → Downloads (para baixar mesmo quando o agente no comando não for o Mac).
5. Auditor da interface em 95: gradiente em GuiaBotoes.jsx (de outra sessão).

## Depois da 1.28.0
- Medir o mapa num computador com placa de vídeo (o teste sem GPU não mostra a fluidez real).
- Kanban e WhatsApp: testados com mensagens de teste (apagadas); ainda não há mensagens reais do site.
- Telegram: o menu "/" do app mostra só 100 comandos (limite do Telegram); os 862 aparecem em /comandos e na busca.
- Auditor da interface em 95 (gradiente em GuiaBotoes.jsx, de outra sessão).

## Depois da 1.30.0 (apps 1.5.0)
- iPhone: o dono precisa rodar `xtool setup` (Apple ID) para instalar no aparelho; não foi testado num iPhone de verdade, só no simulador.
- clima-ia: o login pelo navegador (`clima-ia login` → `/entrar-app?cli=1`) não foi testado de ponta a ponta (precisa de login real);
  a conversa, o modo plano e o instalador foram testados com sessão temporária. A tela interativa (cabeçalho, Shift+Tab) só foi vista em código.
- Instalador Windows do clima-ia (`instalar-ia.ps1`) não foi testado num Windows.
- APK 1.5.0 não foi instalado num celular; desktop 1.5.0 não foi aberto depois do build.
- Auditor da interface em 93: 95 de antes menos as cores fixas da prévia do terminal em /ia (de propósito).

## Depois da 1.31.0
- clima-ia: a tela interativa (seletor com setas, Shift+Tab, régua de baixo) foi vista só em captura renderizada, não num terminal real aberto à mão.
- Limites da IA: a recusa ao estourar o limite foi testada só pela lógica da janela; ninguém tem limite baixo configurado ainda.
- Dono sem nome no perfil: a saudação do clima-ia fica "Bem-vindo de volta!" até preencher o nome em Configurações → Perfil.
