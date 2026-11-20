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
