# O que foi feito
- Música 1.22.0 (19/11): tela no estilo Spotify, player no navegador (Web Playback SDK), rotinas disparadas pela Alexa; app do Spotify novo (conta Estevam Souza, Premium) com Web API + Web Playback SDK.
- 1.25.0 (20/11):
  - /cafeteira: a vermelha antiga não pisca mais (modelo só aparece quando o certo chega).
  - /mapa: monitores/teclados/mouses/PCs da biblioteca voltaram (altura NaN: a 4ª posição do monitor é a tela, não a altura); trânsito e carros carregam no ocioso depois do escritório.
  - /avatares: lista da Biblioteca rola sozinha.
  - Bugs: isReady (compilarSeguro no lugar de compileAsync), EMAXCONNSESSION (porta 6543 em todo lugar), transmissor parado vira notificação. Bugs 10–21 fechados.
  - /apps: download sem acesso ao GitHub pelo agente (op app_link; token do `gh` do Mac lido na hora).
  - Releases do GitHub: logo pelo app.zynio.com.br, selos numa linha, "Como atualizar" e "Problemas comuns" (todas as 5 releases).
  - /ia: visual do Claude (paleta quente .tela-ia, conta na lateral, serifa, modelo abaixo da caixa).
  - /luzes: interruptor de várias teclas (Novadigital 4 teclas): uma luz por tecla, painel de vidro preto, escolha da tecla ao conectar.
  - Conformidade: testes ao vivo rodados de novo (aprovados); o resto é ação da organização.

## Tarde (1.26.0 a 1.28.0)
- 1.26.0: /ia sem rodapé (página cabia além da tela) e 13 modelos gratuitos da NVIDIA testados (11 agem nos ares) com ícones reais
  (simple-icons); /novidades com gráfico de versões em barras (o 3D foi removido), "novas para mim", link, recolher, baixar .md;
  /mensagens no visual do WhatsApp Web (.tela-zap) + Kanban (site_conversas: etapa, responsavel, prioridade, prazo, proximo_passo,
  ordem; config mensagens_etapas; GET/PUT /api/site/kanban); /supabase no design do Supabase (.tela-supa, barra do projeto, menu de ícones).
- 1.27.0: mapa com Homem de Ferro (37), Goku (36) e Naruto (44) em config.mapa_modelos.herois (herois3d.js); motos do trânsito com
  piloto (piloto3d.js) e de frente (fisica.inverter na moto 38); sinaleiras instanciadas nos cruzamentos (cidade3d tickSinais);
  cidade N=9; mais pedestres; direção mais suave; E.preparar (texturas uma por quadro + compilação escondida) para modelos tardios.
- 1.28.0: Telegram +364 comandos (862); Estúdio com modelos prontos, sortear, acessórios, desfazer/refazer, vistas, fundos, foto e números.

## Fim da tarde (1.29.0, 1.30.0 e apps 1.5.0)
- 1.29.0: firewall com inspeção do corpo (SQLi, NoSQL, comando, SSTI, XXE, Log4Shell, prototype, travessia), iscas, robôs de IA,
  ferramentas de ataque, spraying, tarpit no login, prompt injection; bot do Telegram com auditoria (`telegram_eventos`), identidade,
  flood, PIN para comandos críticos e aba Telegram em /seguranca. Site com 5 páginas novas.
- App de iPhone em SwiftUI (`apps/ios`, xtool): compila e roda no simulador com dados reais; `.ipa` de release sem assinatura.
- Apps 1.5.0 no GitHub (release v1.5.0, 7 arquivos, incluindo `ClimaCasa-ios.ipa`); /apps mostra o iPhone com o passo a passo.
- 1.30.0: clima-ia no terminal (`frontend/public/clima-ia/clima_ia.py`, instaladores `instalar-ia.sh`/`.ps1`, login PKCE por
  `/entrar-app?cli=1`, modo plano = `leitura` em `/api/ia/conversar`); /supabase com menu fixo e busca, largura total e 10 telas novas
  (`components/supabase/Avancado.jsx`, `GET /api/supabase/catalogo/{tipo}` com consultas fechadas).

## Fim do dia (1.31.0)
- clima-ia: interface verde no formato do Claude Code com o logo do sistema em pixels (`frontend/public/clima-ia/clima_ia.py`, v1.6.0);
  o agente local (`agente-ia/clima_ia.py`) carrega a mesma tela desse arquivo. Seletor de modelo com setas, /uso, comandos de segurança
  (/seguranca, /ataques, /ips, /ip, /bloquear, /desbloquear, /escudo, /sessoes, /telegram, /integridade, /analisar, /diagnostico,
  /atualizar, /auditoria), segredos colados ocultados antes de enviar.
- Limites da IA (`backend/app/ia_uso.py`, tabela `ia_uso`, config `ia_limites`): sessão de 5 h e semana de 7 dias em tokens, começando
  no primeiro uso (método do Claude). Padrão 300 mil / 2 milhões; dono sem limite por padrão. `GET /api/ia/uso`, `PUT /api/ia/limites` (dono).
- Bugs: #23 descartado (era o firewall bloqueando os meus testes locais); `checar_cadastros()` na varredura, `autoteste()` com transação
  desfeita (`POST /api/bugs/autoteste`), 422 de quem está logado vira bug "Formulário recusado". Tela com radar, filtro por categoria, 14 dias.
- Cadastros corrigidos: ID de transmissor com espaço (500), IP/protocolo sem validação, ar com nome vazio ou repetido, editar ar sem sala.
- Editor SQL com CodeMirror 6 (`components/supabase/EditorSql.jsx`), colunas de `GET /api/supabase/catalogo/colunas`.

## Noite (0.4.4 e apps 1.6.0)
- **Tela preta no /entrar-app** (bug #25): a mudança do login do terminal apagou a linha `const desafio = …`. Corrigido, e criado
  `components/ProtecaoErro.jsx` em volta de todas as rotas (`main.jsx`, `ComProtecao`): erro de tela vira aviso + bug. Varredura
  `no-undef` no frontend achou mais um: `manter` em `components/infra/Vercel.jsx` (botão de limpar publicações). Corrigido.
- **Versões em sequência**: as 44 entradas de `novidades.json` viraram 0.0.0 … 0.4.3 (número antigo em `antes`); `usuarios.novidades_vista`
  e `notificacoes` `versao:*` migrados. Esta publicação é a 0.4.4.
- **Telegram**: 252 comandos novos (1.114), famílias em `telegram_cmds.py` "FAMÍLIAS 0.4.4"; `/start` sem vínculo mostra `_apresentacao`
  (sem contar como tentativa negada, 1 a cada 10 min) e o vínculo mostra `_primeiros_passos`. Prévia em /telegram (`BoasVindas`).
- **Ilha**: relevo real de `ilhaRelevo.json` (Terrain Tiles da AWS, grade de 150 m, int16 em base64), céu `Sky`, sombras, mar com cor
  pela profundidade, 19 lugares reais.
- **Passo a passo vivo**: `components/PassoAPasso.jsx` (cena animada controle → transmissor → ar) em Transmissores (`PassosTransmissor`)
  e na aba Botões (`PassosDoAr`, usa `/pronto-para-gravar`).
- **Projetos**: anel de ligados, liga/desliga por ar no cartão, Conforto 23°, duplicar, mapa de calor de 14 dias, atalho "/".
- **Apps 1.6.0**: Android (`mais/bugs.tsx`, `mais/uso-ia.tsx`), iOS (`Telas/Diagnostico.swift`), desktop (`MAIS_TELAS`). Regra nova no
  CLAUDE.md §0 item 9: toda atualização do sistema atualiza os apps, o release e o deploy.

## 0.4.5 e apps 1.6.1 (fim da noite)
- **Nave da Segurança**: som do motor pelo Web Audio (`components/somNave.js`), botão de mudo; **velocidade hipersônica** com contagem de 10 s
  e salto para outra dimensão (`components/dimensao3d.js`, montada em etapas durante a contagem e descartada ao voltar).
- **Botão GitHub** no topo do painel (`Layout.jsx`) e "Código no GitHub" nos apps 1.6.1 (release v1.6.1 com os 7 arquivos).
- **Varredura de segredos** antes de deixar o repositório público: gitleaks no histórico (166 commits), regex de todos os formatos do
  projeto e os valores exatos do `.env` no histórico. Só apareceu a chave pública do Supabase (`eas.json`, pública por desenho). Nada a rotacionar.
- **Disco cheio** (ENOSPC) travou o build do Windows e o xtool; com o "sim" do dono, apagamos builds antigos do desktop (1.3 a 1.5) e pastas
  temporárias de release. Os arquivos do release passaram a ser preparados com link físico (`ln`), sem ocupar espaço.
- **iPhone**: app instalado pelo xtool no iPhone do dono (login do xtool feito pelo dono; 2 certificados de desenvolvimento revogados com o
  "sim" dele). Apple ID grátis: vale 7 dias, reinstalar com `xtool install apps/ios/xtool/ClimaEscritorio.ipa`.

## 0.4.6: avatar 3D do Estevam
- O GLB do Tripo (`blender-estevam/estevam.glb`, 62 MB, 2 milhões de triângulos) era estático (sem esqueleto nem animação).
  `scripts/avatar-esqueleto/`: `leve.mjs` (60 mil triângulos, texturas 1024) → `rig.mjs` (12 ossos `clima_*`, pesos por região
  suavizados, clips parado/andando/sentado) → 2,7 MB, **avatar 73** na biblioteca, ligado à pessoa Estevam (`p-mwkun7r7`) no mapa.
- `Mapa3D.jsx` `espelhoBoneco`: os ossos copiam as juntas do boneco invisível (passo preso ao chão, sentar/digitar, café, moto);
  na 1ª pessoa o osso do pescoço encolhe (sem cabeça na frente da câmera). Na 3ª pessoa o nome não cobre mais a câmera.
- Testado no Playwright: sentado na mesa, controlar sentado, levantar (F), andar (W) em 3ª e 1ª pessoa, sentar de novo; sem erro de JS.
  Não testado: o avatar em celular e na moto/carro.

## 0.4.7 (fim da tarde): travas físicas, mapa mais leve, topo e rolagens
- Segurança (roteiro `seguranca.md`): `backend/app/fisico.py` com limite por aparelho, anti liga/desliga do ar, isolar aparelho
  (só estado seguro passa), validade de 20 s para o sinal IR na fila e de 30/120 s na fila da placa, cafeteira com 90 min padrão.
  Tela Segurança → Comandos físicos e cartão Travas nas telas de Luzes/Cafeteira/Persianas/Fechadura. Auditoria STRIDE, relatório e
  roteiros de incidente em `docs/seguranca/`. Testes: 12 casos com banco simulado + consultas reais só leitura.
- Mapa: faixas e palmeiras mescladas (entorno 1.877 → 833 malhas), luz por ar ligado removida, 1 luz real por calçada,
  qualidade automática (resolução/sombra/frequência da sombra) guardada por navegador.
- Topo com menu fixo por container query; foco dos campos embutidos; tema claro→escuro no ar 3D (useLayoutEffect no tema);
  Novidades com índice que rola separado e acompanha a leitura; Integrações com coluna direita rolando sozinha.
- Interruptor Novadigital 4 teclas: compatível (Tuya, `switch_1…4`); cartão "Vai funcionar?" em Luzes com as condições.
