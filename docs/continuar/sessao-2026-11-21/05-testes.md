# Testes de 21/11/2026

- Mapa (0.4.8): Chrome com GPU, abrir o prédio de ~2 s parado para 67 ms; programas WebGL 193 → 86; térreo pré-compilado (43 programas).
- Painel (0.4.9): /analise, /analise?aba=seo, /idiomas, /emails?aba=newsletter e o editor, em 1440 e 375, sem rolagem lateral e sem erro de JS.
- Backend: coleta e resumo com dados de teste (apagados), 5 modelos da newsletter montados, IA gerou newsletter só com fatos das versões (33 s).
- Site: home, novidades, versão, escritório inteligente, luzes, newsletter e baixar em 1440 e 375 sem rolagem lateral; menu em painel, seletor de idioma, menu do celular, rodapé.
- Apps: Android `tsc` ok e build EAS; iOS `xcodebuild` ok e .ipa; desktop electron-builder (mac x2, windows, linux x2).
- Não testado: envio real de campanha para inscritos (não há inscritos); PageSpeed (depende da cota do Google); auditoria de SEO em produção antes da publicação do site.
