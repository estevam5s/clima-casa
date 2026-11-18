# Como testar

## Servidor local e sessão temporária
```bash
cd backend && CLIMA_PAPEL=nuvem CLIMA_PORTA=8097 ../.venv/bin/python -m app.main   # papel nuvem: não fala com transmissores
```
- Sessão do dono por 1 h: script de exemplo no scratchpad da sessão (`sessao_teste.py criar|apagar <sid>`): `generate_link` (magiclink) → `verify` → grava em `sessoes_fortes` e o JSON em `localStorage['clima-casa-auth']`. **Apagar no fim** (`sessoes_fortes`, `sessoes_uso`, `auth.sessions`).
- Playwright (`playwright-core` + chrome-headless-shell). No mapa 3D use `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` para FPS real e `localStorage['clima-debug-3d']='1'` para `window.__mapa3d`.
- Sempre interceptar `**/api/novidades**` (senão marca o dono como "já viu") e `**/api/aparelhos/*/estado` (para não mandar comando de verdade).

## O que conferir
- `npx vite build` sem erro; auditor `node ~/.claude/skills/painel-senior/scripts/auditar.mjs frontend/src` ≥ 98.
- `uvx ruff check --select F821,F841,F811 backend/app` e `python -c "import app.main"`; `rotas_sem_regra()` vazio.
- Telas em 1440 e 375 sem rolagem lateral (grade sem coluna base cresce pelo conteúdo: use `grid-cols-1` ou `minmax(0,1fr)`).
- Térreo: descer de elevador (R), andar até a porta (abre sozinha) e sair para a calçada; ~60 FPS.

## Raspberry Pi sem Raspberry
```bash
docker run --rm --platform linux/arm64 -v <pasta-com-backend>:/src:ro debian:bookworm bash /src/teste.sh
```
`teste.sh`: `apt python3-venv`, `pip install uv`, `uv python install 3.13`, `uv venv`, `pip install -r backend/requirements.txt`, `import app...`.

## PDF e Word
- `relatorio.exportar(formato, dados, "pmf"|"moderno")`; `documentos.gerar(tipo, "pdf"|"docx")`.
- PDF: `pdftoppm -r 60 -png arquivo.pdf saida`. Word: `qlmanage -t -s 900 -o <pasta> arquivo.docx` (prévia do macOS).
