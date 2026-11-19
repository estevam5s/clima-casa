# Como foi testado

- Servidor local: `cd backend && CLIMA_PAPEL=nuvem CLIMA_PORTA=8097 ../.venv/bin/python -m app.main` (reinicie depois de mudar o backend: o servidor antigo responde "Tipo inválido" a rotas novas).
- Sessão temporária do dono: script `sessao_teste.py criar|apagar <sid>` (scratchpad; ver `docs/continuar/sessao-2026-11-17/05-testes.md`). Apagar sempre no fim.
- Playwright (`playwright-core` + chrome-headless-shell). Interceptar `/api/novidades` e `/api/conta/termo`; **bloquear com 418** os POST/PUT/DELETE que mudariam dados reais (remover transmissor, apagar cena…) e abrir/cancelar as confirmações.
- 3D: `localStorage['clima-debug-3d']='1'` → `window.__mapa3d.current` (E). Ex.: `E.iniciarControle(E.avatares.find(a => !a.av.userData.sentada).info, '3')`, `E.trocarNivel('terreo')`, `E.cafe()`, `E.aplicarLuzes({pid:false})`. Args `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` para FPS real.
- Desempenho: `PerformanceObserver({type:'longtask'})` e perfil de CPU pelo CDP (`Profiler.start/stop`) para achar o que trava.
- Hooks: script que procura `useX(` depois de `if (...) return` no mesmo componente (não há ESLint no projeto).
- E-mail: testar o envio sem mandar de verdade substituindo `httpx.post` por uma captura (ver relatório por e-mail).
