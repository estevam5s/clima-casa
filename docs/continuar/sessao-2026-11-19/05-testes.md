# Como foi testado

- Servidor local `CLIMA_PAPEL=nuvem CLIMA_PORTA=8097` + sessão temporária (`sessao_teste.py criar/apagar`) + Playwright
  (chromium headless com swiftshader). O 3D no headless roda a ~2 quadros/s: medir por estado (`window.__mapa3d`), não por tempo.
- Telegram: comandos rodados com o Telegram simulado e as ações reais trocadas por funções falsas (nenhum sinal aos ares).
- Física do carro e da moto: simulação em Node (scratchpad `fisica.mjs`, `moto.mjs`).
- Backup: gerar + simular restauração de verdade (sem gravar) e apagar o arquivo de teste.
- Treinamento: prova iniciada e corrigida com um usuário de teste (uuid) apagado em seguida.
- Auditoria: ruff (F/E9), bandit (só falsos positivos conhecidos), pip-audit (sem vulnerabilidades), npm audit (2 moderadas do react-router, só SSR).
- Não testado: carro e moto num computador com placa de vídeo, multijogador com duas pessoas reais, e-mail para Outlook depois do aquecimento do domínio.
