# Testes feitos (27/11)

- `npx vite build` sem erro; eslint `no-undef` limpo no frontend; `ruff F821/E9` e `import app.main` ok; `rotas_sem_regra()` vazio.
- Playwright (dono, 1440 e 375) em /transmissores, /rotinas (fluxos, execuções, conexões, variáveis, calendário), /projetos, /tarefas,
  /bugs, /configuracoes, /seguranca?aba=integridade: sem erro de JS, sem 4xx/5xx, sem rolagem lateral (achados corrigidos: miniatura dos
  modelos de fluxo e relato de bug duplicado ao mesmo tempo).
- API de ponta a ponta: fluxo com soma → condição → texto → dado do sistema → escolher → lista; versões e restaurar; execuções; variáveis;
  conexão ntfy criada (mascarada) e apagada; fluxo de teste apagado.
- Origem de extensão: POST com `chrome-extension://` + Bearer passa; sem Bearer ou de outro site, 403.
- Diagnóstico: 11 itens conferidos ao vivo.
- **Não testado**: extensão num navegador real; integrações externas reais (Slack, WhatsApp etc.: dependem das chaves do dono);
  gatilhos de tempo/estado esperando o horário real (testados chamando a função direto).
