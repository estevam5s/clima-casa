# Extensão do navegador (Chrome, Edge, Brave, Firefox)

Liga e desliga os ares, roda cenas e mostra no ícone quantos avisos não lidos há no painel.

- **Sessão**: a extensão usa a mesma sessão do painel (`app.zynio.com.br`). Ela lê só o token de acesso; nunca o de renovação
  (renovar pela extensão trocaria a sessão do painel). Com o painel fechado por mais de 1 h, o token vence e a extensão pede para abrir o painel.
- **Permissões**: `storage`, `alarms` e acesso só a `https://app.zynio.com.br`.
- **Servidor**: o `main.py` aceita POST com origem `chrome-extension://`/`moz-extension://` **só com Bearer** (o token não vai sozinho de outro site).

Instalar sem loja: Chrome/Edge/Brave → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → esta pasta.
Firefox → `about:debugging` → Este Firefox → Carregar extensão temporária → `manifest.json`.
Pacote: `cd apps/extensao && zip -r ../../ClimaCasa-extensao.zip . -x README.md` (vai no release com os apps).
