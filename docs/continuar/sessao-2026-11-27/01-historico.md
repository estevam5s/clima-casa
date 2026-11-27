# Histórico

- **0.7.6**: correções do teste de todas as rotas e telas com uma conta de teste (visualizador) e o dono.
- **0.7.7**: Fluxos (estilo N8N), painel em 6 idiomas, commits em 3D, relatórios mais completos, clima-ia com arquivos e contas.
- **0.7.8**: Assistente no jeito do Claude (anônimo, artefatos, agendados, plugins, microfone pelo servidor), Backup e Infra mais completos,
  varredura de bugs ampliada, Treinamento dentro de Segurança.
- **0.7.9** (27/11):
  - Fluxos: `backend/app/fluxos_catalogo.py` com 107 gatilhos, 146 blocos de lógica e dados e 113 ações e integrações; 30 serviços externos
    por Conexões cifradas; escolha do modelo de IA; editor estilo IDE (desfazer/refazer, copiar/colar/duplicar, exportar/importar JSON,
    problemas, contexto, dados de teste, versões em `fluxos_versoes`); 13 modelos prontos.
  - Rotinas: abas Execuções, Conexões, Variáveis e Calendário.
  - Busca do topo com IA (`busca.py`), menu de Atalhos redesenhado, Projetos com cartões animados, Tarefas com Metas, recorrência e cores do Asana.
  - Configurações: Diagnóstico, Acessibilidade, Atalhos de teclado.
  - Bugs: trilha de passos, tela travada/em branco/API falhando; checagens novas (fluxos com erro, conexões apagadas, zonas órfãs, ar sem Desligar).
  - Segurança: selos de integridade refeitos com motivo (13 dias, causa: eventos de teste do 127.0.0.1 apagados depois de selados);
    cabeçalhos COOP/CORP também no portão (middleware.js); teste do security.txt passa pelo desafio da Vercel com curl.
  - Painel pré-traduzido: 7.794 textos extraídos do código (`scripts/extrair-textos-painel.mjs`) e traduzidos (`scripts/traduzir-painel.py`).
  - Extensão do navegador `apps/extensao` e apps 1.8.2 com Fluxos e Diagnóstico.
