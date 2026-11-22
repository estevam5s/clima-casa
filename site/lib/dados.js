// Conteúdo do site. Tudo aqui descreve o sistema real em ar-controle (nada inventado).
export const SISTEMA_URL = process.env.NEXT_PUBLIC_SISTEMA_URL || 'https://app.zynio.com.br'
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://zynio.com.br'
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAGBShkZWzPbreA_F'
export const ENTRAR_URL = `${SISTEMA_URL}/`  // raiz: quem já está logado entra direto; quem não está vai para o login
export const APPS_URL = `${SISTEMA_URL}/apps`
export const MARCA = 'Clima Escritório'

// Menu do topo: grupos com ícone e uma linha de explicação (painel largo no computador, sanfona no celular).
export const MENU = [
  { rotulo: 'Início', href: '/' },
  { rotulo: 'Produto', largo: true, grupos: [
    { titulo: 'Plataforma', itens: [
      { rotulo: 'Como funciona', href: '/como-funciona', icone: 'Workflow', desc: 'Do clique ao ar gelado, em 4 passos' },
      { rotulo: 'Funcionalidades', href: '/funcionalidades', icone: 'LayoutGrid', desc: 'Tudo o que o sistema faz' },
      { rotulo: 'Telas do sistema', href: '/telas', icone: 'MonitorSmartphone', desc: 'Capturas reais do painel' },
      { rotulo: 'Integrações', href: '/integracoes', icone: 'Plug', desc: 'Alexa, Google, Tuya, Spotify e mais' },
      { rotulo: 'Sobre o sistema', href: '/sobre', icone: 'Info', desc: 'Para quem é e como nasceu' },
    ] },
    { titulo: 'Recursos', itens: [
      { rotulo: 'Assistente de IA', href: '/assistente-ia', icone: 'Bot', desc: 'Converse e mande no escritório' },
      { rotulo: 'Bot do Telegram', href: '/bot-telegram', icone: 'Send', desc: '1.114 comandos no celular' },
      { rotulo: 'Mapa 3D', href: '/mapa-3d', icone: 'Building2', desc: 'O prédio, a equipe e a cidade' },
      { rotulo: 'Música com Spotify', href: '/escritorio-inteligente/musica', icone: 'Music2', desc: 'Toca no Echo e em rotinas' },
      { rotulo: 'Relatórios', href: '/funcionalidades/relatorios', icone: 'BarChart3', desc: 'Consumo e custo em 8 formatos' },
    ] },
  ] },
  { rotulo: 'Escritório', grupos: [
    { titulo: 'Escritório inteligente', itens: [
      { rotulo: 'Visão geral', href: '/escritorio-inteligente', icone: 'Building', desc: 'Tudo o que o painel comanda' },
      { rotulo: 'Ar-condicionado', href: '/escritorio-inteligente/ar-condicionado', icone: 'AirVent', desc: 'Por infravermelho, sem trocar o aparelho' },
      { rotulo: 'Iluminação', href: '/escritorio-inteligente/luzes', icone: 'Lightbulb', desc: 'Acende ao anoitecer, pelo pôr do sol real' },
      { rotulo: 'Cafeteira', href: '/escritorio-inteligente/cafeteira', icone: 'Coffee', desc: 'Café pronto e desligamento por segurança' },
      { rotulo: 'Persianas', href: '/escritorio-inteligente/persianas', icone: 'Blinds', desc: 'Fecham quando o sol esquenta' },
      { rotulo: 'Fechadura', href: '/escritorio-inteligente/fechadura', icone: 'DoorClosed', desc: 'Destrancar com senha e trancar sozinha' },
    ] },
  ] },
  { rotulo: 'Segurança', grupos: [
    { titulo: 'Proteção', itens: [
      { rotulo: 'Segurança', href: '/seguranca', icone: 'ShieldCheck', desc: 'Como o sistema protege o escritório' },
      { rotulo: 'Defesas contra ataques', href: '/seguranca/defesas', icone: 'ShieldAlert', desc: 'Firewall, bloqueios e criptografia' },
      { rotulo: 'Status do sistema', href: '/status', icone: 'Activity', desc: 'Ao vivo, a cada 30 segundos' },
      { rotulo: 'Privacidade', href: '/privacidade', icone: 'Lock', desc: 'O que guardamos e por quê (LGPD)' },
    ] },
  ] },
  { rotulo: 'Ajuda', grupos: [
    { titulo: 'Suporte', itens: [
      { rotulo: 'Perguntas frequentes', href: '/faq', icone: 'CircleHelp', desc: 'Respostas rápidas' },
      { rotulo: 'Glossário', href: '/glossario', icone: 'BookOpen', desc: 'Os termos do sistema' },
      { rotulo: 'Baixar os apps', href: '/baixar', icone: 'Download', desc: 'Android, iPhone, Mac, Windows e Linux' },
      { rotulo: 'Contato', href: '/contato', icone: 'Mail', desc: 'Fale com a equipe' },
    ] },
  ] },
  { rotulo: 'Novidades', grupos: [
    { titulo: 'Acompanhe', itens: [
      { rotulo: 'Todas as versões', href: '/novidades', icone: 'History', desc: 'O que entrou em cada publicação' },
      { rotulo: 'Destaques', href: '/novidades#destaques', icone: 'Sparkles', desc: 'As mudanças maiores, explicadas' },
      { rotulo: 'Newsletter', href: '/newsletter', icone: 'Newspaper', desc: 'As novidades no seu e-mail' },
    ] },
  ] },
]
export const itensDoMenu = (m) => (m.grupos || []).flatMap((g) => g.itens)

// Rodapé: links em categorias (mais curtas que a lista única de antes)
export const RODAPE = [
  { titulo: 'Produto', itens: [['Como funciona', '/como-funciona'], ['Funcionalidades', '/funcionalidades'], ['Telas', '/telas'], ['Integrações', '/integracoes'], ['Sobre', '/sobre']] },
  { titulo: 'Escritório', itens: [['Ar-condicionado', '/escritorio-inteligente/ar-condicionado'], ['Iluminação', '/escritorio-inteligente/luzes'], ['Cafeteira', '/escritorio-inteligente/cafeteira'], ['Persianas', '/escritorio-inteligente/persianas'], ['Fechadura', '/escritorio-inteligente/fechadura'], ['Música', '/escritorio-inteligente/musica']] },
  { titulo: 'Recursos', itens: [['Assistente de IA', '/assistente-ia'], ['Bot do Telegram', '/bot-telegram'], ['Mapa 3D', '/mapa-3d'], ['Novidades', '/novidades'], ['Newsletter', '/newsletter']] },
  { titulo: 'Ajuda e empresa', itens: [['Perguntas frequentes', '/faq'], ['Glossário', '/glossario'], ['Segurança', '/seguranca'], ['Status', '/status'], ['Contato', '/contato']] },
]
export const PLATAFORMAS = [
  { id: 'android', nome: 'Android', icone: 'siAndroid', detalhe: 'APK' },
  { id: 'iphone', nome: 'iPhone', icone: 'siApple', detalhe: 'iOS' },
  { id: 'mac', nome: 'macOS', icone: 'siApple', detalhe: 'Apple Silicon e Intel' },
  { id: 'windows', nome: 'Windows', icone: 'windows', detalhe: 'Instalador' },
  { id: 'linux', nome: 'Linux', icone: 'siLinux', detalhe: 'AppImage x64 e ARM' },
]

// ---------- escritório inteligente (uma página por aparelho) ----------
export const DISPOSITIVOS = [
  { slug: 'ar-condicionado', icone: 'AirVent', titulo: 'Ar-condicionado', curto: 'Ar',
    resumo: 'Os ares que já existem no escritório passam a obedecer ao painel, ao celular e à Alexa, por infravermelho, sem trocar nenhum aparelho.',
    texto: 'Um transmissor Wi-Fi Tuya SRW-004 aprende os botões do controle remoto original de cada ar e repete o sinal quando você manda. Para aparelhos Gree, gravar só o Desligar basta: o sistema gera os outros 300 botões pelo protocolo. Ares iguais na mesma sala viram uma zona e mudam juntos com um comando só.',
    lista: ['Ligar, desligar, modo, temperatura e ventilação', 'Agenda, automações, cenas e temporizador', 'Zonas para ares iguais na mesma sala', 'Relatório de horas ligado, kWh e custo', 'Travas: limite de comandos por minuto e proteção contra liga/desliga seguido'],
    precisa: ['Um transmissor Tuya SRW-004 por sala, com visão dos aparelhos', 'O agente num computador do escritório, na mesma rede'],
    sistema: '/aparelhos' },
  { slug: 'luzes', icone: 'Lightbulb', titulo: 'Iluminação', curto: 'Luzes',
    resumo: 'Luzes de cada sala no painel: acender, apagar, brilho, acender sozinha ao anoitecer e quando a porta é destrancada à noite.',
    texto: 'Funciona com lâmpadas, painéis, fitas de LED e interruptores de parede do Smart Life, e também com uma placa própria com relé. O pôr do sol é calculado para o escritório a cada dia, então o "acender ao anoitecer" acompanha a época do ano. Cada automação age uma vez por dia: se alguém apagar na mão, o sistema não acende de novo. Interruptores de várias teclas (como o Novadigital de 4 teclas) viram uma luz por tecla.',
    lista: ['Acender, apagar e brilho', 'Acender ao anoitecer pelo pôr do sol real', 'Acender quando a porta é destrancada à noite', 'Interruptor de parede com uma luz por tecla', 'No mapa 3D, as salas acendem conforme as luzes reais'],
    precisa: ['Lâmpada, painel, fita ou interruptor compatível com o app Smart Life (Wi-Fi 2,4 GHz)', 'Ou uma placa própria (ESP) com relé'],
    sistema: '/luzes' },
  { slug: 'cafeteira', icone: 'Coffee', titulo: 'Cafeteira', curto: 'Café',
    resumo: 'Ligar para aquecer, desligar, agenda de manhã, desligamento automático por segurança, estoque de cápsulas e os cafés do dia.',
    texto: 'A cafeteira fica numa tomada inteligente. O painel liga para aquecer antes de a equipe chegar e desliga sozinho depois de um tempo: sem tempo escolhido, a trava de segurança desliga em 90 minutos. A tela também acompanha o estoque de cápsulas e quantos cafés saíram no dia.',
    lista: ['Ligar e desligar pelo painel, celular e Alexa', 'Agenda de manhã', 'Desligamento automático (padrão de 90 minutos)', 'Estoque de cápsulas e cafés do dia', 'Na copa do mapa 3D, o café sai quando alguém faz'],
    precisa: ['Uma tomada inteligente compatível com o Smart Life'],
    sistema: '/cafeteira' },
  { slug: 'persianas', icone: 'Blinds', titulo: 'Persianas', curto: 'Persianas',
    resumo: 'Todas as janelas de todas as salas: abrir, fechar, parar e posição, por sala ou todas juntas, com agenda e fechamento automático quando o sol esquenta.',
    texto: 'Cada janela do mapa ganha a sua persiana. Dá para comandar uma, uma sala inteira ou todas de uma vez, escolher a posição e deixar que elas fechem sozinhas quando o sol esquenta. Fechar e parar passam sempre, mesmo com as travas de segurança ligadas.',
    lista: ['Abrir, fechar, parar e posição', 'Por janela, por sala ou todas juntas', 'Agenda', 'Fechar quando o sol esquentar', 'Ligadas às janelas do mapa 3D'],
    precisa: ['Motor de persiana compatível com o Smart Life', 'Ou uma placa própria com relés'],
    sistema: '/persianas' },
  { slug: 'fechadura', icone: 'DoorClosed', titulo: 'Fechadura', curto: 'Fechadura',
    resumo: 'A fechadura eletrônica da porta do escritório: estado, trancar e destrancar com a sua senha, trancar sozinha, aviso fora do expediente e quem fez o quê.',
    texto: 'Destrancar sempre pede a sua senha e a verificação anti-robô, e fica registrado quem fez. A porta pode trancar sozinha depois de um tempo, e o sistema avisa quando ela é aberta fora do expediente. Se algo parecer estranho, o dono ou um administrador isola a fechadura: ela passa a aceitar só trancar até ser liberada. Destrancar pela internet depende do modelo da fechadura (o sistema avisa quando não aceita).',
    lista: ['Estado da porta ao vivo', 'Destrancar só com senha', 'Trancar sozinha', 'Aviso fora do expediente', 'Histórico de quem fez o quê', 'Isolar em caso de suspeita'],
    precisa: ['Fechadura Wi-Fi compatível com o Smart Life'],
    sistema: '/fechadura' },
  { slug: 'musica', icone: 'Music2', titulo: 'Música com Spotify', curto: 'Música',
    resumo: 'O Spotify do escritório no painel: tocar, pausar, escolher onde toca (inclusive o Echo), buscar, playlists e rotinas por horário ou quando o ar liga.',
    texto: 'Conecte a conta Spotify Premium uma vez e o painel vira o controle do som do escritório. O Echo aparece como lugar para tocar quando a conta da Alexa tem o Spotify vinculado. As rotinas tocam uma playlist num horário ou quando um ar liga ou desliga, e a tela gera as frases que a Alexa entende para pedir música.',
    lista: ['Tocar, pausar, avançar e volume', 'Escolher onde toca, inclusive o Echo', 'Busca e playlists', 'Rotinas por horário ou quando o ar liga/desliga', 'Frases prontas para pedir à Alexa'],
    precisa: ['Uma conta Spotify Premium (o Spotify só deixa controlar com ela)'],
    sistema: '/musica' },
]

// ---------- funcionalidades (cartões "serviço") ----------
export const FUNCIONALIDADES = [
  { slug: 'infravermelho', icone: 'AirVent', titulo: 'Controle por infravermelho',
    resumo: 'O sistema grava os sinais do controle original de cada ar e os reenvia por um transmissor Wi-Fi SRW-004, sem trocar o aparelho.',
    texto: 'Ar-condicionado split comum só obedece ao controle remoto. O Clima Escritório usa um transmissor infravermelho Tuya SRW-004 (o mesmo do app Smart Life) para aprender cada botão do controle original e repetir o sinal quando você manda. A escolha do código é inteligente: procura o código exato de modo, temperatura e ventilação; se não tiver, usa a mesma temperatura com outra ventilação ou a temperatura gravada mais próxima.',
    lista: ['Gravação de botões em 30 segundos, direto pela tela do aparelho', 'Vários transmissores e vários ares por lugar', 'Reconexão automática quando o transmissor muda de IP ou é pareado de novo', 'Envio pelo agente local e, como reserva, pela nuvem Tuya'],
    tela: 'aparelho' },
  { slug: 'alexa-e-google', icone: 'Mic', titulo: 'Alexa e Google Home',
    resumo: 'Cada ar vira um dispositivo de voz pelo Sinric Pro: ligar, desligar, modo, temperatura e ventilação, também nas Rotinas da Alexa.',
    texto: 'O caminho principal é o Sinric Pro: cada ar marcado como "Disponível na Alexa" é criado no Sinric como um ar-condicionado e passa a responder na Alexa e no Google Home. Trocar o nome no painel troca o nome no Sinric. Há também uma skill própria (Smart Home API v3) com OAuth 2.0 e cenas como gatilho de voz, sem limite de dispositivos.',
    lista: ['"Alexa, ligar o ar do escritório em 23 graus"', 'Tela com 30 comandos prontos por aparelho', 'Receitas de Rotinas com frases suas', 'Skill própria opcional com cenas ("Alexa, ativar Reunião")'],
    tela: 'comandos-voz' },
  { slug: 'agenda-e-automacoes', icone: 'Workflow', titulo: 'Agenda e automações',
    resumo: 'Ligar às 7h30 em dias úteis, desligar depois de 3 horas ligado, disparar uma cena quando alguém liga a sala: tudo sozinho.',
    texto: 'A agenda roda no agente do escritório a cada 20 segundos. As automações seguem gatilho, condições e ações: ligou, desligou, ligado há N minutos ou horário; condições de dias e janela de horário (que pode virar a meia-noite); ações em aparelho, cena ou "desligar depois de X minutos". Ações de automação não disparam outras automações, então não existe laço.',
    lista: ['Grade da semana com a próxima execução', 'Modelos prontos de automação', 'Temporizador "desligar em X minutos" por aparelho', 'Cenas com várias ações em um toque'],
    tela: 'automacoes' },
  { slug: 'relatorios', icone: 'BarChart3', titulo: 'Relatórios com consumo e custo',
    resumo: 'Horas ligado, kWh e custo estimados por aparelho, mapa de uso por dia e hora, falhas e exportação em 8 formatos.',
    texto: 'O relatório soma o tempo entre cada "ligar" e o "desligar" seguinte, multiplica pela potência cadastrada de cada ar e pela tarifa de energia que você informa. Compara com o período anterior, mostra o horário de pico, as temperaturas mais pedidas e cada falha com o motivo. Exporta com as cores da sua marca.',
    lista: ['PDF, Word, Excel, CSV, HTML, XML, JSON e Markdown', 'Enviado por e-mail com o arquivo anexo, ao gerar', 'Período livre ou por aparelho', 'Tarifa editável na própria tela', 'Mapa de uso dia da semana × hora'],
    tela: 'relatorios' },
  { slug: 'seguranca', icone: 'ShieldCheck', titulo: 'Segurança com mapa 3D',
    resumo: 'Firewall de aplicação, bloqueio progressivo de IPs, criptografia AES-256 dos segredos e um globo 3D com a origem dos acessos.',
    texto: 'Toda requisição passa por um firewall: listas de IP e faixas, bloqueio por país, detecção de ferramentas de ataque e de assinaturas de injeção, e limite de requisições por minuto. Quem insiste é bloqueado por 15 minutos, depois 1 hora, 24 horas e 7 dias. Os segredos das integrações ficam cifrados no banco com AES-256-GCM. A tela de Segurança mostra um globo 3D com arcos até o servidor e gera relatório completo.',
    lista: ['Login com bloqueio depois de 5 senhas erradas', 'Globo 3D (Three.js) com acessos e ataques', 'IPs com nota de risco e bloqueio em um clique', 'Relatório de segurança em 8 formatos com recomendações'],
    tela: 'seguranca' },
  { slug: 'notificacoes', icone: 'BellRing', titulo: 'Central de notificações',
    resumo: 'Avisos guardados no banco, com abas, ações direto na notificação e preferências que valem em qualquer aparelho.',
    texto: 'Transmissor offline, ar sem botões gravados, falhas seguidas, IP bloqueado ou entrada por um IP novo viram notificação. Os avisos de condição somem sozinhos quando o problema é resolvido. Dá para resolver um alerta, desbloquear um IP ou reconectar um transmissor sem sair do sino.',
    lista: ['Abas Todas, Não lidas, Importantes e Segurança', 'Página própria com histórico, busca, filtros e ações em lote', 'Arquivar, restaurar e exportar em CSV', 'Som e contador só com as importantes', 'Contador também no ícone da aba do navegador'],
    tela: 'notificacoes' },
  { slug: 'white-label', icone: 'Palette', titulo: 'Marca própria',
    resumo: '34 opções para entregar o sistema com a identidade de quem usa: nome, logo, cores, fontes, textos do login e do menu.',
    texto: 'Em Configurações, a aba White label muda o sistema inteiro com prévia ao vivo: identidade, cores com contraste corrigido sozinho, tipografia, raio dos cantos, textos do login, nomes e itens do menu, banner de aviso, contatos de suporte, °C ou °F e relógio de 12 ou 24 horas. Guarda as 15 últimas versões e exporta em JSON.',
    lista: ['Prévia ao vivo antes de salvar', 'Histórico de versões com restauração', 'CSS próprio sanitizado', 'Tema claro, escuro ou do sistema'],
    tela: 'white-label' },
  { slug: 'apps', icone: 'MonitorSmartphone', titulo: 'Apps para todas as telas',
    resumo: 'Painel web instalável, app Android e apps para macOS, Windows e Linux, todos com o mesmo login e os mesmos aparelhos.',
    texto: 'O painel funciona como PWA e também como app nativo. A página de downloads reconhece o seu sistema e a arquitetura, mostra tamanho e SHA-256 de cada arquivo e gera um QR Code para instalar o APK direto no celular.',
    lista: ['Android (Expo SDK 58)', 'macOS Apple Silicon e Intel, Windows e Linux (Electron)', 'Barra de menus, bandeja e atalhos de teclado', 'Tela própria quando está sem internet'],
    tela: 'apps' },
  { slug: 'transmissores', icone: 'Radio', titulo: 'Transmissores que se ajustam',
    resumo: 'Mudou o Wi-Fi ou pareou de novo? O agente encontra o IP novo e busca a chave nova na conta Smart Life sozinho.',
    texto: 'O status do SRW-004 diz o que aconteceu: 900 é normal, 914 é chave errada (foi pareado de novo) e 905 é falta de resposta na rede. O agente varre a rede pelo ID do transmissor, grava o IP novo e busca a Local Key nova na conta Smart Life. Se o pareamento gerou outro ID, migra o cadastro e os aparelhos.',
    lista: ['Descoberta na rede local', 'Importar escolhendo a sala, um ou todos da conta Smart Life', 'Protocolo Tuya certo descoberto sozinho', 'Resumo de cada sala: transmissor próprio, dividido ou sem', 'Transmissor removido por engano volta como estava', 'Botão "Reconectar agora"'],
    tela: 'transmissores' },
  { slug: 'escritorio', icone: 'Lightbulb', titulo: 'Iluminação e o escritório inteiro',
    resumo: 'Luzes, cafeteira, persianas e fechadura no mesmo painel, com automações: acender ao anoitecer pelo pôr do sol real e ao destrancar a porta à noite.',
    texto: 'Além dos ares, o sistema comanda as luzes de cada sala (lâmpadas, painéis, fitas e interruptores Smart Life, ou uma placa própria com relé), a cafeteira numa tomada inteligente, os motores das persianas e a fechadura Wi-Fi. O pôr do sol é calculado para o escritório a cada dia, então "acender ao anoitecer" acompanha a época do ano. Cada automação age uma vez por dia: se alguém apagar na mão, o sistema não acende de novo.',
    lista: ['Acender, apagar e brilho de cada luz', 'Acender ao anoitecer e ao destrancar a porta à noite', 'Cafeteira com desligamento automático por segurança', 'Persianas que fecham com sol forte', 'Fechadura com auto trancar e aviso fora do expediente'] },
  { slug: 'mapa-3d', icone: 'Building2', titulo: 'Mapa 3D do escritório',
    resumo: 'O prédio de 11 andares na cidade, com o escritório no 9º: salas, ares, equipe no expediente, luzes à noite e pessoas que andam, sentam, tomam café e saem para a rua.',
    texto: 'Cada sala é um projeto e cada ar aparece no lugar certo, com a cor do modo. A equipe aparece só no expediente. Dá para controlar uma pessoa em 1ª ou 3ª pessoa: andar, sentar e trabalhar, fazer café na copa, descer pelo elevador e andar pelas ruas, calçadas, praças e pelo terminal. Previsão do tempo com chuva, semáforos, pedestres e, à noite, as salas acesas conforme as luzes de verdade.',
    lista: ['Prédio, cidade e terminal de ônibus em 3D', 'Equipe com nome, cargo e expediente', 'Controle da pessoa: andar, sentar, café e elevador', 'Carros dirigíveis com física, câmbio automático, nitro e voo', 'Multijogador: quem está no mapa aparece para os outros', 'Luzes à noite ligadas às lâmpadas reais', 'Previsão do tempo e chuva'],
    tela: 'painel' },
  { slug: 'assistente-de-ia', icone: 'Bot', titulo: 'Assistente de IA',
    resumo: 'Converse em português no painel, no Telegram, no celular ou no terminal: ele vê o estado real e age com as permissões de quem pergunta.',
    texto: 'O assistente usa modelos da NVIDIA com ferramentas que leem o sistema de verdade: ares, salas, zonas, transmissores, agentes, atividade, relatórios, tempo lá fora e os aparelhos do escritório. Mudar um ar acontece na hora; desligar todos e executar cenas só depois de você confirmar. No painel as conversas ficam salvas; no terminal (clima-ia) ele também conhece o código do projeto e nunca envia segredos.',
    lista: ['Chat com conversas salvas, comandos com /, anexos e ditado', 'No Telegram: escreva normalmente', 'No celular: tela própria no app Android', 'No terminal: clima-ia com modos de permissão'] },
  { slug: 'telegram', icone: 'Send', titulo: 'Bot do Telegram',
    resumo: '1.114 comandos com as suas permissões: o painel de cada ar no jeito do controle remoto, timers, relatórios, luzes, persianas, música e avisos.',
    texto: 'Cada pessoa vincula o próprio Telegram com um código de uso único gerado no painel. O menu mostra o estado no topo e navega por 28 categorias. Ações em lote pedem confirmação, e os avisos importantes podem chegar no Telegram.',
    lista: ['Ar atual e atalhos /23, /frio23, /mais', 'Timers prontos e relatórios por período', 'Confirmação em toda ação em lote', 'Avisos importantes no Telegram'] },
  { slug: 'backup-e-treinamento', icone: 'ShieldCheck', titulo: 'Backup, restauração e treinamento',
    resumo: 'Backup do sistema inteiro com restauração simulada antes de gravar, e provas de segurança e ISO com mais de mil perguntas.',
    texto: 'O backup junta todas as tabelas num arquivo com manifesto e verificação de integridade; os segredos continuam cifrados. A restauração mostra o que é novo, o que muda e o que sairia antes de gravar. O treinamento sorteia provas de um banco com 1.017 perguntas (segurança no dia a dia, LGPD, ISO/IEC 27001:2022 e normas ISO), com nota na hora e por e-mail.',
    lista: ['Backup completo e restauração com simulação', 'Backups automáticos diários', 'Provas com gabarito comentado', 'Aprovação conta na conformidade ISO 27001'] },
]
export const DESTAQUES = ['infravermelho', 'alexa-e-google', 'agenda-e-automacoes']

// ---------- telas (cartões "projeto") ----------
export const TELAS = [
  { slug: 'painel', titulo: 'Painel com o ar em 3D', resumo: 'Ar animado com display aceso, temperatura real de fora, controle rápido e integrações.', tags: ['Web', 'PWA', '3D'], img: 'painel.jpg',
    texto: 'A tela inicial mostra os ares ligados, os transmissores respondendo, os comandos do dia e um ar-condicionado em 3D que reage ao estado: display com a temperatura real de fora quando desligado, contagem até a temperatura ajustada ao ligar, faixa de luz e névoa na cor do modo.' },
  { slug: 'seguranca', titulo: 'Segurança com globo 3D', resumo: 'Origem dos acessos e ataques num globo animado, com arcos até o servidor.', tags: ['Firewall', 'Three.js', 'Relatório'], img: 'seguranca.jpg',
    texto: 'Postura de segurança de 0 a 100, globo 3D com colunas por cidade e arcos com rastro até o servidor, eventos ao vivo, IPs com nota de risco, países, rotas atacadas e bloqueios ativos. O relatório de segurança sai em 8 formatos.' },
  { slug: 'relatorios', titulo: 'Relatórios e exportação', resumo: 'Comandos, horas ligado, kWh e custo, com exportação em 8 formatos.', tags: ['PDF', 'Excel', 'Word'], img: 'relatorios.jpg',
    texto: 'Período livre, filtro por aparelho, comparação com o período anterior, comandos por dia empilhados por origem, horário de pico, temperaturas escolhidas, mapa de uso e falhas com o motivo.' },
  { slug: 'apps', titulo: 'Downloads dos apps', resumo: 'Logos reais, detecção do sistema, SHA-256 e QR Code do APK.', tags: ['Android', 'macOS', 'Windows'], img: 'apps.jpg',
    texto: 'A página reconhece o seu aparelho, inclusive Mac Intel ou Apple Silicon, mostra versão, tamanho e SHA-256 de cada arquivo e explica a instalação passo a passo.' },
  { slug: 'aparelho', titulo: 'Detalhe do aparelho', resumo: 'Mostrador de temperatura, modos, ventilação, temporizador e histórico.', tags: ['Controle', 'Gravação'], img: 'aparelho.jpg',
    texto: 'Cada ar tem métricas próprias, o mostrador animado, os modos e a ventilação que ele tem, botões extras gravados, desligamento automático e o histórico de comandos com o motivo de cada falha.' },
  { slug: 'notificacoes', titulo: 'Central de notificações', resumo: 'Abas, ações direto no aviso e preferências salvas no banco.', tags: ['Supabase', 'Alertas'], img: 'notificacoes.jpg',
    texto: 'Avisos com ação: abrir o aparelho, gravar botões, resolver alerta, desbloquear IP ou reconectar transmissor. Tudo fica no banco e vale em qualquer aparelho.' },
  { slug: 'comandos-voz', titulo: 'Comandos de voz', resumo: '30 comandos prontos por aparelho e receitas de Rotinas da Alexa.', tags: ['Alexa', 'Google'], img: 'comandos-voz.jpg',
    texto: 'A tela gera as frases que funcionam para cada aparelho, separadas por ligar e desligar, temperatura, modo e ventilação, e sugere Rotinas com frases suas.' },
  { slug: 'white-label', titulo: 'White label', resumo: 'Nome, logo, cores, fontes e textos com prévia ao vivo.', tags: ['Marca', 'Tema'], img: 'white-label.jpg',
    texto: 'Configure a identidade do sistema para cada cliente e veja o resultado antes de salvar. As versões anteriores ficam guardadas.' },
  { slug: 'transmissores', titulo: 'Transmissores IR', resumo: 'Status, IP, chave e aparelhos de cada SRW-004.', tags: ['Tuya', 'Rede local'], img: 'transmissores.jpg',
    texto: 'Mostra cada transmissor com IP, status, chave configurada e os aparelhos ligados a ele. Procura na rede, importa da conta Smart Life e reconecta sozinho.' },
  { slug: 'automacoes', titulo: 'Automações', resumo: 'Regras com gatilho, condições e ações, com modelos prontos.', tags: ['Agenda', 'Cenas'], img: 'automacoes.jpg',
    texto: 'Comece por um modelo pronto, como desligar sozinho à noite ou economizar depois de 4 horas ligado, e ajuste do seu jeito.' },
]
export const TELAS_HOME = ['painel', 'seguranca', 'relatorios', 'apps']

// ---------- como funciona (processo) ----------
export const PASSOS = [
  { n: '01', icone: 'Smartphone', titulo: 'Você comanda', texto: 'Pelo painel, pelo app, pela agenda ou pela voz com a Alexa e o Google.' },
  { n: '02', icone: 'Cloud', titulo: 'A nuvem recebe', texto: 'A API na Vercel valida o acesso e grava o comando no Supabase.' },
  { n: '03', icone: 'Cpu', titulo: 'O agente executa', texto: 'O agente num computador do escritório (Mac, PC Windows ou Raspberry Pi) lê a fila em cerca de 1 segundo.' },
  { n: '04', icone: 'AirVent', titulo: 'O ar obedece', texto: 'O transmissor SRW-004 envia o sinal infravermelho para o aparelho.' },
]

// ---------- tecnologias (logos "empresa") ----------
export const TECNOLOGIAS = ['siPython', 'siFastapi', 'siReact', 'siSupabase', 'siVercel', 'siThreedotjs']

// ---------- integrações (cartões "equipe") ----------
export const INTEGRACOES = [
  { icone: 'Mic', papel: 'Voz', nome: 'Amazon Alexa', href: '/funcionalidades/alexa-e-google' },
  { icone: 'siGooglehome', papel: 'Voz', nome: 'Google Home', href: '/funcionalidades/alexa-e-google' },
  { icone: 'Plug', papel: 'Ponte de voz', nome: 'Sinric Pro', href: '/funcionalidades/alexa-e-google' },
  { icone: 'Radio', papel: 'Infravermelho', nome: 'Tuya Smart IR', href: '/funcionalidades/transmissores' },
  { icone: 'siSpotify', papel: 'Música', nome: 'Spotify', href: '/escritorio-inteligente/musica' },
  { icone: 'siTelegram', papel: 'Celular', nome: 'Telegram', href: '/bot-telegram' },
  { icone: 'siNvidia', papel: 'Assistente de IA', nome: 'NVIDIA', href: '/assistente-ia' },
  { icone: 'siCloudflare', papel: 'DNS, e-mail e anti-robô', nome: 'Cloudflare', href: '/seguranca' },
]

// ---------- números (lista "prêmios") ----------
export const NUMEROS = [
  { onde: 'API', o_que: '426 rotas, todas com regra de permissão', quando: '0.4.9' },
  { onde: 'Supabase', o_que: '47 tabelas com RLS em todas', quando: '0.4.9' },
  { onde: 'Telegram', o_que: '1.114 comandos em 28 categorias, com as permissões de cada pessoa', quando: '0.4.9' },
  { onde: 'Versões', o_que: '52 versões publicadas, 467 mudanças registradas', quando: '0.5.1' },
  { onde: 'Treinamento', o_que: '1.017 perguntas de segurança e ISO', quando: '1.24' },
  { onde: 'Idiomas', o_que: 'Site em 6 idiomas: português, inglês, espanhol, francês, russo e coreano', quando: '0.4.9' },
  { onde: 'Relatórios', o_que: '8 formatos de exportação', quando: '1.0' },
  { onde: 'Apps', o_que: 'Android, iPhone, macOS, Windows, Linux e PWA', quando: '1.6' },
]
export const CONTADORES = [
  { n: 426, sufixo: '', rotulo: 'rotas de API' },
  { n: 47, sufixo: '', rotulo: 'tabelas no banco' },
  { n: 1114, sufixo: '', rotulo: 'comandos no Telegram' },
  { n: 52, sufixo: '', rotulo: 'versões publicadas' },
  { n: 6, sufixo: '', rotulo: 'idiomas no site' },
]

// ---------- comandos de voz (slider "depoimentos") ----------
export const COMANDOS = [
  { frase: 'Alexa, ligar o ar do escritório em 23 graus.', titulo: 'Ligar com temperatura', origem: 'Alexa e Google Home' },
  { frase: 'Alexa, colocar o ar do escritório no modo frio.', titulo: 'Trocar o modo', origem: 'Alexa e Google Home' },
  { frase: 'Alexa, colocar a velocidade do ar do escritório em 2.', titulo: 'Ajustar a ventilação', origem: 'Alexa e Google Home' },
  { frase: 'Alexa, fim do expediente.', titulo: 'Rotina: desliga todos os ares', origem: 'Rotinas da Alexa' },
  { frase: 'Alexa, ativar Reunião.', titulo: 'Cena pela skill própria', origem: 'Skill própria da Alexa' },
]

// ---------- novidades (histórico real do git) ----------
export const NOVIDADES = [
  { slug: 'ia-telegram-backup-treinamento', data: '2026-11-19', categoria: 'Versão', img: 'painel.jpg',
    titulo: 'Assistente de IA, Telegram com 498 comandos, backup completo e treinamento ISO',
    resumo: 'IA no painel, no Telegram, no celular e no terminal; mapa 3D multijogador com carros; backup e restauração; provas com mais de mil perguntas.',
    itens: ['Assistente de IA com conversas salvas e ações com confirmação', 'Bot do Telegram com 498 comandos em 22 categorias', 'Mapa 3D: carros com física, nitro e voo, multijogador', 'Backup do sistema inteiro e restauração simulada', 'Treinamento com 1.017 perguntas, nota na hora e por e-mail', 'Agenda, cenas e automações com modelos prontos'] },
  { slug: 'iluminacao-sala-transmissor-cidade', data: '2026-11-18', categoria: 'Versão', img: 'transmissores.jpg',
    titulo: 'Iluminação, um transmissor por sala e a cidade no mapa 3D',
    resumo: 'Luzes com acender ao anoitecer, cada sala com o seu transmissor, central de notificações em página, relatório por e-mail e o mapa 3D maior.',
    itens: ['Iluminação: acender ao anoitecer pelo pôr do sol real e ao destrancar a porta à noite', 'Resumo de salas e transmissores; protocolo do transmissor descoberto sozinho', 'Notificações com histórico, filtros e ações em lote', 'Relatório enviado por e-mail com o arquivo anexo', 'Mapa 3D: luzes à noite, café na copa e passeio pelas ruas', 'Agente que se recupera sozinho quando o computador troca de rede'] },
  { slug: 'notificacoes-seguranca-3d', data: '2026-11-14', categoria: 'Versão', img: 'notificacoes.jpg',
    titulo: 'Central de notificações, Segurança com globo 3D e temperatura real no display',
    resumo: 'Notificações guardadas no banco, tela de Segurança com mapa 3D de acessos e o ar em 3D mostrando a temperatura de fora.',
    itens: ['Notificações no Supabase com abas, marcar lidas, limpar, ações e preferências', 'Cabeçalho com barra de status: agente, ares ligados, transmissores e relógio', 'Tela de Segurança com globo 3D, eventos ao vivo, IPs com risco e relatório em 8 formatos', 'Acessos registrados com a localização aproximada do IP', 'Display do ar sempre aceso com a temperatura real de fora (Open-Meteo)', 'Página de apps com logos reais, SHA-256 e QR Code do APK'] },
  { slug: 'tema-white-label-firewall', data: '2026-11-14', categoria: 'Versão', img: 'white-label.jpg',
    titulo: 'Tema claro e escuro, white label, firewall e relatórios exportáveis',
    resumo: 'Marca própria com 34 opções, firewall de aplicação, criptografia dos segredos e relatórios com consumo e custo.',
    itens: ['Tema claro, escuro ou do sistema, aplicado antes da pintura', 'White label com prévia, histórico e exportar/importar', 'Firewall com listas de IP, países, assinaturas de ataque e bloqueio progressivo', 'Segredos cifrados com AES-256-GCM', 'Relatórios com horas, kWh e custo, exportados em 8 formatos'] },
  { slug: 'clima-escritorio-3d-login', data: '2026-11-14', categoria: 'Interface', img: 'painel.jpg',
    titulo: 'Clima Escritório: 3D animado, login novo e notificações',
    resumo: 'Menu lateral que empurra o conteúdo, telas em largura total, ar em 3D e um login novo.',
    itens: ['Menu lateral que abre empurrando o conteúdo', 'Ar-condicionado 3D animado ligado e desligado', 'Login novo com fundo animado e "esqueci a senha"', 'Transmissor só fica offline depois de 3 falhas seguidas'] },
  { slug: 'transmissores-se-reconfiguram', data: '2026-11-14', categoria: 'Transmissores', img: 'transmissores.jpg',
    titulo: 'Transmissores se reconfiguram sozinhos',
    resumo: 'Mudou de rede ou pareou de novo: o agente encontra o IP e a chave nova sem ajuda.',
    itens: ['Diagnóstico pelo status do SRW-004 (900, 914, 905)', 'Procura o IP novo na rede pelo ID', 'Busca a Local Key nova na conta Smart Life', 'Botão "Reconectar agora"'] },
  { slug: 'automacoes-e-voz', data: '2026-11-14', categoria: 'Automação', img: 'automacoes.jpg',
    titulo: 'Automações, temporizadores e comandos de voz',
    resumo: 'Regras com gatilho, condições e ações, temporizador por aparelho e a tela de comandos de voz.',
    itens: ['Automações disparadas inclusive pela Alexa', 'Temporizador "desligar daqui a X minutos"', 'Comandos de voz por aparelho e receitas de Rotinas', 'Cenas na skill própria da Alexa'] },
  { slug: 'interface-completa', data: '2026-11-14', categoria: 'Interface', img: 'aparelho.jpg',
    titulo: 'Interface mais completa e animada',
    resumo: 'Faixa de métricas, mostrador animado, filtros, linha do tempo e agenda semanal.',
    itens: ['Detalhe do aparelho com mostrador e abas animadas', 'Atividade em linha do tempo, ao vivo, com exportação CSV', 'Agenda com grade da semana e próxima execução'] },
]

// ---------- perguntas frequentes ----------
export const FAQ = [
  { p: 'Além do ar-condicionado, o que mais o sistema comanda?', r: 'Luzes, cafeteira, persianas, fechadura e música pelo Spotify. Os aparelhos Smart Life (Tuya) entram pela conta do app; também dá para usar uma placa própria com relé. Tudo aparece no painel, no app, na Alexa, no Telegram e no mapa 3D.' },
  { p: 'Que lâmpadas e interruptores funcionam?', r: 'Os que funcionam no app Smart Life, em Wi-Fi 2,4 GHz: lâmpadas, painéis, fitas de LED e interruptores de parede. Interruptor de várias teclas, como o Novadigital de 4 teclas, vira uma luz por tecla. Interruptor touch de parede costuma precisar de fio neutro na caixa.' },
  { p: 'A porta pode ser destrancada por qualquer um do painel?', r: 'Não. Destrancar pede a senha de quem está pedindo e a verificação anti-robô, só para quem tem permissão, e fica registrado quem fez. Trancar sempre funciona. Destrancar pela internet também depende do modelo da fechadura.' },
  { p: 'O site está em outros idiomas?', r: 'Sim: português, inglês, espanhol, francês, russo e coreano, no botão de idioma no topo. O sistema em si (o painel) continua em português.' },
  { p: 'O sistema sabe se o ar está ligado?', r: 'Não. Infravermelho só envia sinal. O painel mostra o último estado que o próprio sistema mandou; se alguém usar o controle original, ele fica desatualizado até o próximo comando.' },
  { p: 'Funciona com qualquer ar-condicionado?', r: 'Com qualquer aparelho que tenha controle remoto infravermelho. Cada ar precisa ter os botões gravados uma vez, pela tela do aparelho.' },
  { p: 'O que eu preciso comprar?', r: 'Um transmissor infravermelho Wi-Fi Tuya SRW-004 (o "Smart IR" do app Smart Life) por cômodo, com visão dos aparelhos. O resto é software.' },
  { p: 'E se o computador do escritório desligar?', r: 'Os comandos tentam a nuvem Tuya como reserva. Agenda e automações rodam no agente local e voltam quando ele volta.' },
  { p: 'Mudei o Wi-Fi do escritório. E agora?', r: 'Pareie o transmissor de novo no Smart Life (rede 2,4 GHz). Com a conta Smart Life conectada em Configurações, o agente encontra o IP e a chave nova sozinho.' },
  { p: 'Dá para usar com a Alexa e o Google ao mesmo tempo?', r: 'Sim. Pelo Sinric Pro cada ar aparece nos dois. O plano gratuito do Sinric aceita 3 dispositivos; a skill própria não tem esse limite.' },
  { p: 'O custo do relatório é exato?', r: 'É uma estimativa: tempo entre ligar e desligar × potência cadastrada × tarifa. Serve para comparar meses e aparelhos.' },
  { p: 'Meus dados ficam seguros?', r: 'O acesso é só do administrador, com bloqueio por tentativas. Os segredos das integrações são cifrados com AES-256-GCM e todas as tabelas têm RLS no Supabase.' },
]
