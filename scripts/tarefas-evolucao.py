#!/usr/bin/env python3
"""Plano de evolução: 677 tarefas novas no projeto "Plano de melhorias" (Tarefas → Minhas tarefas do dono), com descrição em
blocos (por quê, o que fazer, pronto quando, onde mexer), prioridade, horas, etiquetas, prazo e subtarefas (checklist).

Blocos: 40 telas × 8 frentes (320), 25 módulos do backend × 5 frentes (125), 3 apps × 15 funções (45) e 187 tarefas de
evolução escritas uma a uma. Todas falam de partes que existem no sistema (rotas de main.jsx, arquivos de backend/app).
Rodar de novo não duplica (pula títulos que já existem). O envio ao GitHub Project é feito à parte (scripts/tarefas-github.py).

Uso: cd backend && ../.venv/bin/python ../scripts/tarefas-evolucao.py [--simular]
"""
import json
import sys
import time
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import db, tarefas  # noqa: E402

HOJE = date(2026, 11, 26)
PRAZO_DIAS = {"urgente": 14, "alta": 35, "media": 90, "baixa": 180}
ACIMA = {"baixa": "media", "media": "alta", "alta": "urgente", "urgente": "urgente"}


def descricao(porque, fazer, pronto, onde):
    linhas = [f"Por quê: {porque}", "", "O que fazer:"] + [f"- {x}" for x in fazer] + ["", "Pronto quando:"] + [f"- {x}" for x in pronto]
    if onde:
        linhas += ["", f"Onde mexer: {onde}"]
    return "\n".join(linhas)


# ------------------------------------------------------------------ 1) 40 telas × 8 frentes
# (rota, nome, seção, arquivo, principal?)
TELAS = [
    ("/", "Painel", "Painel e telas", "frontend/src/pages/Painel.jsx", True),
    ("/aparelhos", "Aparelhos", "Ares e automação", "frontend/src/pages/Aparelhos.jsx", True),
    ("/aparelhos/:id", "Detalhe do ar", "Ares e automação", "frontend/src/pages/Aparelho.jsx", True),
    ("/transmissores", "Transmissores", "Ares e automação", "frontend/src/pages/Transmissores.jsx", True),
    ("/rotinas", "Rotinas", "Ares e automação", "frontend/src/pages/Rotinas.jsx", True),
    ("/atividade", "Atividade", "Logs e auditoria", "frontend/src/pages/Atividade.jsx", False),
    ("/notificacoes", "Notificações", "Painel e telas", "frontend/src/pages/Notificacoes.jsx", False),
    ("/luzes", "Luzes", "Dispositivos", "frontend/src/pages/Luzes.jsx", False),
    ("/telegram", "Telegram", "Telegram", "frontend/src/pages/Telegram.jsx", False),
    ("/bugs", "Bugs", "Bugs e qualidade", "frontend/src/pages/Bugs.jsx", False),
    ("/tarefas", "Tarefas", "Tarefas", "frontend/src/pages/Tarefas.jsx", False),
    ("/ia", "Assistente de IA", "Assistente de IA", "frontend/src/pages/Ia.jsx", False),
    ("/backup", "Backup", "Infra e dados", "frontend/src/pages/Backup.jsx", False),
    ("/alexa", "Skill própria da Alexa", "Integrações", "frontend/src/pages/Alexa.jsx", False),
    ("/supabase", "Painel do Supabase", "Infra e dados", "frontend/src/pages/Supabase.jsx", False),
    ("/projetos", "Projetos (salas)", "Painel e telas", "frontend/src/pages/Projetos.jsx", False),
    ("/mapa", "Mapa do escritório", "Mapa 3D", "frontend/src/pages/Mapa.jsx", False),
    ("/relatorios", "Relatórios", "Relatórios e energia", "frontend/src/pages/Relatorios.jsx", False),
    ("/seguranca", "Segurança", "Segurança", "frontend/src/pages/Seguranca.jsx", True),
    ("/mensagens", "Mensagens do site", "Site", "frontend/src/pages/Mensagens.jsx", False),
    ("/integracoes", "Integrações (Alexa e Google)", "Integrações", "frontend/src/pages/Integracoes.jsx", False),
    ("/comandos-alexa", "Comandos de voz", "Integrações", "frontend/src/pages/ComandosAlexa.jsx", False),
    ("/apps", "Baixar apps", "Apps", "frontend/src/pages/Apps.jsx", False),
    ("/musica", "Música", "Integrações", "frontend/src/pages/Musica.jsx", False),
    ("/guia", "Guia (passo a passo)", "Documentação e processo", "frontend/src/pages/Guia.jsx", False),
    ("/novidades", "Novidades", "Documentação e processo", "frontend/src/pages/Novidades.jsx", False),
    ("/infra", "Infra (Vercel, Cloudflare, agentes)", "Infra e dados", "frontend/src/pages/Infra.jsx", False),
    ("/rede", "Rede", "Infra e dados", "frontend/src/pages/Rede.jsx", False),
    ("/cafeteira", "Cafeteira", "Dispositivos", "frontend/src/pages/Cafeteira.jsx", False),
    ("/persianas", "Persianas", "Dispositivos", "frontend/src/pages/Persianas.jsx", False),
    ("/fechadura", "Fechadura", "Dispositivos", "frontend/src/pages/Fechadura.jsx", False),
    ("/avatares", "Avatares 3D", "Mapa 3D", "frontend/src/pages/Avatares.jsx", False),
    ("/treinamento", "Treinamento de segurança", "Segurança", "frontend/src/pages/Treinamento.jsx", False),
    ("/emails", "E-mails", "Integrações", "frontend/src/pages/Emails.jsx", False),
    ("/analise", "Acessos e SEO", "Site", "frontend/src/pages/Analise.jsx", False),
    ("/idiomas", "Idiomas do site", "Site", "frontend/src/pages/Idiomas.jsx", False),
    ("/configuracoes", "Configurações", "Painel e telas", "frontend/src/pages/Configuracoes.jsx", False),
    ("/login", "Login", "Segurança", "frontend/src/pages/Login.jsx", True),
    ("/redefinir-senha", "Redefinir senha", "Segurança", "frontend/src/pages/RedefinirSenha.jsx", False),
    ("/entrar-app", "Entrar no app pelo navegador", "Apps", "frontend/src/pages/EntrarApp.jsx", False),
]

FRENTES_TELA = [
    ("e2e", "teste de ponta a ponta (Playwright)", "media", 4, ["teste", "e2e"],
     "o projeto não tem testes automatizados: o CI só compila e confere segredos. Uma tela quebrada só aparece quando alguém usa.",
     ["Roteiro Playwright com sessão temporária (receita da seção 4 do CLAUDE.md) que abre {rota} e passa pelas ações principais",
      "Interceptar os pedidos que mexem em algo real (ligar ar, enviar e-mail, apagar) e responder com dados de teste",
      "Conferir erros de JavaScript, respostas 4xx/5xx da /api e rolagem lateral em 1440 e 375 px"],
     ["O roteiro roda em menos de 1 minuto e falha quando a tela quebra", "Entra no CI como etapa manual (botão) para não gastar a cota do Supabase"],
     ["Escrever o roteiro da tela", "Interceptar ações com efeito real", "Rodar em 1440 e 375 px", "Ligar no CI (manual)"]),
    ("a11y", "acessibilidade (WCAG 2.2 AA)", "baixa", 3, ["acessibilidade"],
     "quem usa teclado ou leitor de tela precisa conseguir operar o sistema; é também exigência da LGPD e de compras públicas.",
     ["Rodar o axe-core na tela {rota} e corrigir o que for sério ou crítico",
      "Navegar só pelo teclado: ordem do Tab, foco visível e Esc fechando janelas",
      "Rótulos e aria-label em botões que só têm ícone; contraste 4,5:1 nos dois temas"],
     ["Zero violação séria no axe-core", "Dá para fazer a ação principal só com o teclado"],
     ["Rodar o axe-core", "Teste só com teclado", "Rótulos dos ícones", "Contraste nos dois temas"]),
    ("estados", "estados de carregando, vazio, erro e sem permissão", "baixa", 2, ["interface"],
     "telas que piscam, ficam em branco ou mostram erro técnico passam insegurança e geram chamados.",
     ["Esqueleto no carregamento (sem salto de layout)", "Estado vazio com o próximo passo (botão que resolve)",
      "Erro dizendo o que fazer e com Tentar de novo", "Sem permissão decidido só depois da sessão carregar (não pisca)"],
     ["Os quatro estados aparecem certos simulando rede lenta, lista vazia e erro 500"],
     ["Carregando", "Vazio com ação", "Erro com o que fazer", "Sem permissão sem piscar"]),
    ("desempenho", "desempenho (LCP < 2,5 s, INP < 200 ms)", "baixa", 3, ["desempenho"],
     "a tela precisa abrir rápido também no celular e em redes da Prefeitura; os números reais já são medidos em Acessos e SEO.",
     ["Ver em Acessos e SEO → O que melhorar os números de {rota} e o elemento responsável",
      "Cortar consultas repetidas, dividir o pacote, adiar o que fica abaixo da dobra e virtualizar listas com mais de 200 linhas",
      "Conferir que consultas automáticas usam devePuxar (cota de tráfego do Supabase)"],
     ["LCP p75 abaixo de 2,5 s e INP abaixo de 200 ms nos dados reais depois de 7 dias"],
     ["Medir a linha de base", "Corrigir o maior gargalo", "Conferir devePuxar", "Medir de novo em 7 dias"]),
    ("celular", "uso no celular (375 px)", "baixa", 2, ["celular", "interface"],
     "boa parte do uso é pelo celular (PWA e app); botões pequenos e tabelas largas atrapalham.",
     ["Sem rolagem lateral em 375 px", "Alvos de toque com 44 px", "Tabelas viram cartões ou rolam dentro do próprio quadro",
      "Teclado do celular não cobre o campo ativo"],
     ["Teste em 375 px sem rolagem lateral e com todas as ações alcançáveis com o polegar"],
     ["Sem rolagem lateral", "Toque de 44 px", "Tabelas no celular", "Teclado e campos"]),
    ("tema", "tema escuro e claro conferidos", "baixa", 1, ["interface", "tema"],
     "cores fixas e opacidades fora do padrão do Tailwind já deixaram selos brancos no tema escuro.",
     ["Abrir {rota} nos dois temas e procurar texto ilegível, fundo branco no escuro e ícones sumidos",
      "Trocar cores fixas por tokens (bg-card, text-muted-foreground) e conferir com a marca da empresa (white label)"],
     ["Nada ilegível nos dois temas nem com a cor da marca trocada"],
     ["Conferir no tema escuro", "Conferir no claro", "Conferir com outra cor de marca"]),
    ("ajuda", "ajuda no Guia e dica na própria tela", "baixa", 2, ["documentação"],
     "quem chega pela primeira vez não sabe o que a tela faz nem a ordem dos passos.",
     ["Capítulo ou trecho no Guia (pages/Guia.jsx) com o passo a passo de {rota}",
      "Dica curta na própria tela (ícone de ajuda) com link para o capítulo", "Atualizar docs/MANUAL.md e gerar o PDF"],
     ["O Guia explica a tela e a tela leva ao Guia"],
     ["Texto do Guia", "Dica na tela", "MANUAL.md e PDF"]),
    ("medicao", "medição de uso e de erros", "baixa", 2, ["dados", "observabilidade"],
     "sem números não dá para saber se uma mudança melhorou a tela ou se alguém desistiu no meio.",
     ["Registrar as ações principais de {rota} (sem dados pessoais) no coletor de análise",
      "Taxa de erro por ação (respostas 4xx/5xx) e tempo até concluir",
      "Mostrar em Acessos e SEO por tela"],
     ["Dá para ver, por semana, quantas vezes cada ação foi feita e quantas falharam"],
     ["Eventos das ações", "Taxa de erro", "Gráfico por tela"]),
]

# ------------------------------------------------------------------ 2) 25 módulos do backend × 5 frentes
MODULOS = [
    ("backend/app/rotas/api.py", "API principal (painel, aparelhos, transmissores)", "Ares e automação"),
    ("backend/app/rotas/contas.py", "contas, sessões e biometria", "Segurança"),
    ("backend/app/rotas/alexa.py", "OAuth e diretivas da skill própria", "Integrações"),
    ("backend/app/rotas/backup.py", "rotas de backup e restauração", "Infra e dados"),
    ("backend/app/rotas/bugs.py", "rotas de Bugs", "Bugs e qualidade"),
    ("backend/app/rotas/correio.py", "rotas de e-mail e webhook do Resend", "Integrações"),
    ("backend/app/rotas/dispositivos.py", "rotas de dispositivos (cafeteira, persianas, fechadura, luzes)", "Dispositivos"),
    ("backend/app/rotas/ia.py", "rotas do Assistente de IA", "Assistente de IA"),
    ("backend/app/rotas/infra.py", "rotas de Infra (Vercel, Cloudflare, agentes)", "Infra e dados"),
    ("backend/app/rotas/logs.py", "rotas de logs completos", "Logs e auditoria"),
    ("backend/app/rotas/musica.py", "rotas de música (Spotify)", "Integrações"),
    ("backend/app/rotas/site_gestao.py", "rotas do site (contato, idiomas, análise)", "Site"),
    ("backend/app/rotas/tarefas.py", "rotas de Tarefas e GitHub Projects", "Tarefas"),
    ("backend/app/rotas/telegram.py", "webhook e painel do Telegram", "Telegram"),
    ("backend/app/clima.py", "clima.aplicar (estado do ar → botão IR)", "Ares e automação"),
    ("backend/app/transmissor.py", "transmissor (envio, gravação, fila, autorreparo)", "Ares e automação"),
    ("backend/app/coordenador.py", "coordenador (principal e reserva dos agentes)", "Infra e dados"),
    ("backend/app/zonas.py", "zonas de ar", "Ares e automação"),
    ("backend/app/gree.py", "protocolo Gree", "Ares e automação"),
    ("backend/app/sinric.py", "Sinric Pro (Alexa e Google)", "Integrações"),
    ("backend/app/agenda.py", "agenda, temporizadores e laço do agente", "Ares e automação"),
    ("backend/app/notificacoes.py", "notificações", "Painel e telas"),
    ("backend/app/firewall.py", "firewall e bloqueio de IPs", "Segurança"),
    ("backend/app/relatorio.py", "relatórios e exportação", "Relatórios e energia"),
    ("backend/app/backup_sistema.py", "backup completo do sistema", "Infra e dados"),
]
FRENTES_MODULO = [
    ("testes", "testes automatizados (pytest)", "media", 5, ["teste", "backend"],
     "mudanças no {nome} são conferidas à mão; uma regressão só aparece em produção.",
     ["Criar backend/tests/ com pytest e um banco de teste isolado (schema.sql num Postgres local ou transação desfeita)",
      "Cobrir os caminhos principais e os erros esperados de {arquivo}", "Rodar no CI junto do ruff"],
     ["Cobertura de pelo menos 70% de {arquivo}", "O CI falha se um teste quebrar"],
     ["Estrutura do pytest", "Casos principais", "Casos de erro", "Rodar no CI"]),
    ("validacao", "validação de entradas e mensagens de erro", "media", 2, ["backend", "segurança"],
     "entrada sem limite ou mensagem técnica deixa a porta aberta para abuso e confunde quem usa.",
     ["Revisar os modelos Pydantic de {arquivo}: limites de tamanho, padrões e listas fechadas",
      "Toda mensagem de erro em pt-BR dizendo o que fazer, sem detalhe interno", "Recusar campos desconhecidos onde fizer sentido"],
     ["Nenhum campo sem limite", "Nenhuma mensagem com stack trace ou nome de função"],
     ["Revisar modelos", "Revisar mensagens", "Testes de entrada inválida"]),
    ("logs", "logs estruturados com id da requisição", "baixa", 3, ["observabilidade", "backend"],
     "hoje os logs são texto solto; achar o que aconteceu num pedido específico leva tempo.",
     ["Log em JSON (nível, módulo, id da requisição, usuário, duração) em {arquivo}",
      "Id da requisição gerado no middleware e devolvido no cabeçalho X-Request-Id", "Nunca registrar segredo, senha ou token"],
     ["Dá para seguir um pedido do navegador até o agente pelo id"],
     ["Formato JSON", "Id da requisição", "Mascarar segredos"]),
    ("docs", "documentação técnica", "baixa", 2, ["documentação", "backend"],
     "quem pega o código depois (pessoa ou agente) perde tempo descobrindo regras que só estão na cabeça de quem escreveu.",
     ["Docstrings nas funções públicas de {arquivo} explicando o porquê das regras",
      "Rotas com resumo, descrição e exemplo no OpenAPI (/docs fechado em produção, aberto no agente)", "Linha no mapa rápido do CLAUDE.md se ainda não existir"],
     ["Cada função pública explica o que faz e por quê", "OpenAPI com exemplos"],
     ["Docstrings", "OpenAPI com exemplos", "CLAUDE.md"]),
    ("falhas", "falhas, tempo esgotado e novas tentativas", "media", 3, ["confiabilidade", "backend"],
     "serviços de fora (Supabase, Tuya, Sinric, Vercel, GitHub, Resend) caem às vezes; o sistema precisa se recuperar sozinho.",
     ["Mapear em {arquivo} toda chamada externa e definir tempo-limite, novas tentativas com espera crescente e o que a tela mostra",
      "Falha de terceiro vira 424 ou 502 com mensagem clara, nunca 403 (conta no firewall)", "Teste simulando o serviço fora do ar"],
     ["Nenhuma chamada externa sem tempo-limite", "Serviço fora do ar não derruba a tela"],
     ["Mapear chamadas externas", "Tempo-limite e novas tentativas", "Simular falha"]),
]

# ------------------------------------------------------------------ 3) apps: 3 × 15 funções
APPS = [("Android", "apps/android/src/app/(abas)/mais/"), ("iPhone", "apps/ios/Telas/ e Mais.swift"), ("computador", "apps/desktop/src/main.js (MAIS_TELAS)")]
FUNCOES_APP = [
    ("Rotinas (cenas, automações e agenda numa tela)", "media", "a tela Rotinas do painel juntou as três; o app ainda mostra separado ou não mostra."),
    ("Bugs: relatar e acompanhar", "baixa", "quem usa o app encontra problema e precisa relatar com a tela e o aparelho."),
    ("Minhas tarefas com o quadro", "baixa", "as tarefas do Plano de melhorias e dos bugs só aparecem no painel web."),
    ("Logs completos (Segurança → Logs)", "baixa", "dono e admin acompanham pelo celular o que cada pessoa fez nos ares."),
    ("Aviso de entrada com notificação", "baixa", "o aviso \"Fulano entrou\" existe no painel; no app vira notificação do sistema."),
    ("Login com o e-mail da Prefeitura completado", "media", "o painel completa @floripa.sc.gov.br; o app precisa do mesmo campo e da mesma regra."),
    ("Testar conexão do transmissor", "media", "o teste que procura o IP sozinho ajuda quem está no escritório instalando."),
    ("Rede (velocidade e monitor)", "baixa", "a tela Rede do painel mede a conexão; no app é útil perto do transmissor."),
    ("Estado do backup", "baixa", "ver se o último backup deu certo sem abrir o computador."),
    ("Notificações com som e não perturbe", "media", "as preferências de som do painel não valem no app."),
    ("Mapa 2D leve das salas", "baixa", "o 3D é pesado no celular; uma planta 2D com o estado de cada ar resolve."),
    ("Atividade por pessoa, sala e ar", "baixa", "as abas novas da Atividade ainda não estão no app."),
    ("Relatórios: baixar PDF e enviar por e-mail", "baixa", "o relatório do mês é pedido em reunião, muitas vezes pelo celular."),
    ("Biometria do aparelho em todas as ações sensíveis", "media", "apagar, desligar todos e trocar configurações pedem confirmação forte."),
    ("Modo sem internet com o último estado", "baixa", "sem rede, o app hoje mostra erro; deveria mostrar o último estado com aviso."),
]

# ------------------------------------------------------------------ 4) 187 tarefas de evolução, uma a uma
# (seção, título, prioridade, horas, etiquetas, por quê, o que fazer (lista), pronto quando (lista), onde)
E = []


def ev(secao, titulo, prio, horas, etiquetas, porque, fazer, pronto, onde=""):
    E.append((secao, titulo, prio, horas, etiquetas, porque, fazer, pronto, onde))


S = "Ares e automação"
ev(S, "Pré-resfriar a sala antes de reunião marcada no calendário", "media", 8, ["ares", "agenda", "calendário"],
   "a sala de reunião fica quente nos primeiros minutos.", ["Ler o calendário da sala (Google/Outlook) pela API", "Ligar o ar X minutos antes, conforme a temperatura externa", "Desligar se a reunião for cancelada"],
   ["Ar liga sozinho antes da reunião e desliga quando cancelada"], "backend/app/agenda.py, novo calendario.py")
ev(S, "Desligar ares ligados sem ninguém no escritório (fora do expediente e sem presença)", "alta", 6, ["ares", "economia"],
   "ar esquecido ligado à noite é o maior desperdício medido.", ["Cruzar expediente (Configurações → Geral) com o último comando e a presença no mapa", "Avisar o responsável e desligar após confirmação ou tempo"],
   ["Nenhum ar ligado depois do expediente sem alguém confirmar"], "backend/app/geral.py")
ev(S, "Ajuste automático pela previsão do tempo (dia quente começa mais frio)", "media", 6, ["ares", "clima externo"],
   "em dias acima de 32 °C a sala demora a esfriar.", ["Usar clima_externo.agora e a previsão de 12 h", "Regra opcional por sala: começar 1 °C abaixo quando a máxima passar do limite"],
   ["Regra liga e desliga por sala e registra na Atividade"], "backend/app/clima_externo.py, automacao.py")
ev(S, "Limite de temperatura por sala com justificativa para sair da faixa", "media", 4, ["ares", "política"],
   "a faixa global da Geral não cobre salas com equipamentos (servidor).", ["Faixa por projeto (sala) com exceção pedida pelo usuário", "Exceção vira notificação para o responsável da sala"],
   ["Cada sala tem a sua faixa e as exceções ficam registradas"], "backend/app/geral.py, fisico.py")
ev(S, "Modo férias e feriado por sala", "baixa", 3, ["ares", "agenda"],
   "a agenda pula feriados para todos, mas salas fecham em datas diferentes.", ["Calendário de fechamento por sala", "Agenda e automações respeitam o fechamento"],
   ["Sala fechada não recebe comando de agenda"], "backend/app/feriados.py")
ev(S, "Detectar botão gravado errado pela reação do ar (sem apito)", "media", 6, ["ares", "ir"],
   "botão gravado ruim só é notado quando alguém percebe o ar parado.", ["Botão 'o ar apitou?' no fim de cada comando manual nos primeiros dias", "Marcar botões que nunca foram confirmados"],
   ["Lista de botões nunca confirmados por ar"], "frontend/src/pages/Aparelho.jsx")
ev(S, "Assistente de instalação de ar novo do começo ao fim", "media", 8, ["ares", "transmissor"],
   "instalar um ar hoje passa por 4 telas diferentes.", ["Passos: sala → transmissor → testar conexão → copiar ou gerar botões → teste do apito → Alexa", "Retomar de onde parou"],
   ["Um ar novo é instalado sem sair do assistente"], "frontend/src/pages/Aparelhos.jsx, Transmissores.jsx")
ev(S, "Teste de interferência guiado por celular (quem está no salão marca)", "media", 5, ["zonas"],
   "o teste de interferência precisa de alguém olhando os ares e outro no computador.", ["Link de uso único para o celular de quem está no salão", "A pessoa marca quem apitou e o painel grava as zonas"],
   ["Teste feito por uma pessoa só, com o celular"], "backend/app/zonas.py")
ev(S, "Histórico de estado de cada ar em gráfico de 24 h", "baixa", 4, ["ares", "gráfico"],
   "não dá para ver em que horas o ar ficou ligado num dia.", ["Linha do tempo ligado/desligado e temperatura por hora", "Comparar com o dia anterior"],
   ["Gráfico no detalhe do ar"], "frontend/src/pages/Aparelho.jsx")
ev(S, "Comando em lote com prévia (o que vai mudar em cada ar)", "baixa", 3, ["ares"],
   "ligar vários ares de uma vez sem ver o resultado assusta.", ["Prévia mostrando estado atual → novo e ares da mesma zona", "Confirmar e acompanhar ar por ar"],
   ["Lote mostra a prévia antes de enviar"], "frontend/src/pages/Aparelhos.jsx")
ev(S, "Fila de comandos visível por ar (o que está esperando o agente)", "baixa", 3, ["ares", "agente"],
   "quando o agente está lento, o usuário clica várias vezes.", ["Mostrar no cartão do ar o comando pendente e há quanto tempo", "Evitar comando duplicado na fila"],
   ["Comando repetido não entra duas vezes na fila"], "backend/app/transmissor.py")
ev(S, "Suporte a outras marcas além da Gree pelo protocolo (Midea, LG, Samsung)", "media", 16, ["ares", "ir", "protocolo"],
   "hoje só o Gree gera os 300 botões a partir do Desligar.", ["Estudar o protocolo IR de cada marca (ir_analise.py já reconhece alguns)", "Gerador por marca com teste do apito"],
   ["Pelo menos uma marca nova gerando botões"], "backend/app/gree.py, ir_analise.py")
ev(S, "Aprender botões pela nuvem Tuya quando o agente não está no escritório", "baixa", 6, ["transmissor", "tuya"],
   "gravar botão exige o agente na mesma rede.", ["Verificar se o modelo do transmissor aceita estudo pela nuvem", "Caminho alternativo com aviso de limitação"],
   ["Gravação pela nuvem quando o modelo permitir"], "backend/app/tuya_nuvem.py")
ev(S, "Cena por horário do sol (anoitecer, amanhecer)", "baixa", 3, ["rotinas"],
   "as luzes já seguem o pôr do sol; os ares e cenas não.", ["Gatilho 'anoitecer/amanhecer' em automações usando sol_do_dia", "Deslocamento em minutos"],
   ["Automação dispara no pôr do sol real"], "backend/app/automacao.py, dispositivos.py")
ev(S, "Automação por consumo (desligar ao passar de X kWh no dia)", "media", 5, ["rotinas", "energia"],
   "a meta de gasto da sala hoje só avisa.", ["Gatilho por kWh estimado do dia por ar ou sala", "Ação desligar ou avisar"],
   ["Regra corta o ar ao atingir a meta"], "backend/app/automacao.py, relatorio.py")
ev(S, "Simulador de rotina (o que aconteceria na semana)", "baixa", 5, ["rotinas"],
   "é difícil saber se agenda e automações vão se contradizer.", ["Linha do tempo da semana com tudo que vai rodar", "Avisar conflitos (liga e desliga no mesmo minuto)"],
   ["Conflitos aparecem antes de salvar"], "frontend/src/pages/Rotinas.jsx")
ev(S, "Desfazer última ação de rotina com um clique", "baixa", 3, ["rotinas"],
   "uma cena errada muda 8 ares e ninguém lembra como estavam.", ["Fotografia do estado antes de cada cena/automação", "Botão desfazer por 10 minutos"],
   ["Desfazer devolve os ares ao estado anterior"], "frontend/src/components/CenasExtras.jsx")
ev(S, "Modelos de rotina por tipo de sala (reunião, servidor, salão)", "baixa", 3, ["rotinas"],
   "cada sala tem um padrão de uso diferente.", ["Pacotes prontos de agenda + automação por tipo de sala", "Aplicar com prévia"],
   ["Pacote aplicado em uma sala em 2 cliques"], "frontend/src/pages/Rotinas.jsx")
ev(S, "Proteção contra liga-desliga rápido (compressor)", "alta", 3, ["ares", "segurança física"],
   "ligar e desligar várias vezes em poucos minutos estraga o compressor.", ["Intervalo mínimo entre desligar e ligar por ar (fisico.checar_ar)", "Aviso claro na tela e no Telegram"],
   ["Segundo liga em menos de 3 min é recusado com explicação"], "backend/app/fisico.py")
ev(S, "Manutenção preventiva: lembrete de limpeza de filtro por horas de uso", "media", 4, ["ares", "manutenção"],
   "filtro sujo gasta mais energia e piora o ar.", ["Contar horas ligadas por ar", "Lembrete a cada N horas com registro de quem limpou"],
   ["Lembrete aparece e some quando a limpeza é registrada"], "backend/app/aparelhos (novo campo), notificacoes.py")

S = "Relatórios e energia"
for t, p, h, porque, fazer, pronto in [
    ("Tarifa com bandeira tarifária da ANEEL no cálculo de gasto", "media", 4, "o gasto estimado usa tarifa fixa; a bandeira muda o valor real.", ["Cadastrar bandeira por mês (verde, amarela, vermelha)", "Recalcular o gasto do mês"], ["Relatório mostra o gasto com a bandeira do mês"]),
    ("Medidor de energia real por circuito (tomada inteligente ou medidor Tuya)", "media", 10, "o consumo hoje é estimado pela potência nominal.", ["Integrar medidor Tuya de energia ao agente", "Comparar estimado × medido"], ["Gasto real aparece ao lado do estimado"]),
    ("Relatório comparando salas (kWh por pessoa e por m²)", "baixa", 4, "salas de tamanhos diferentes não se comparam pelo total.", ["Cadastrar área e lotação por sala", "Índices por m² e por pessoa"], ["Ranking justo entre salas"]),
    ("Previsão de gasto do mês com base nos dias passados", "baixa", 3, "o gestor quer saber se vai estourar a meta antes do fim do mês.", ["Projeção linear e por dia da semana", "Aviso quando a projeção passar da meta"], ["Projeção no Painel e no relatório"]),
    ("Relatório de economia das automações (quanto cada regra poupou)", "baixa", 4, "não dá para mostrar o valor do sistema para a direção.", ["Estimar horas evitadas por regra (desligar esquecido, faixa)", "Total em kWh e R$"], ["Relatório mensal com a economia por regra"]),
    ("Exportar dados de energia em formato aberto (CSV/JSON) com dicionário", "baixa", 2, "auditoria e transparência pedem dados brutos.", ["Exportação com dicionário de campos", "Licença e descrição"], ["Arquivo baixa com o dicionário junto"]),
    ("Pegada de carbono estimada (fator de emissão do SIN)", "baixa", 3, "relatórios de sustentabilidade da Prefeitura pedem emissões.", ["Fator de emissão mensal do MCTI", "kg CO₂e por sala e total"], ["Relatório mostra a emissão do mês"]),
    ("Alerta de consumo fora do padrão (estatística por ar)", "media", 5, "um ar com problema gasta mais e ninguém percebe.", ["Média e desvio por ar e dia da semana", "Alerta quando passar de 2 desvios"], ["Alerta com o ar e o dia fora do padrão"]),
    ("Relatório agendado por e-mail para cada responsável de sala", "baixa", 3, "o relatório semanal vai só para dono e admins.", ["Assinatura por pessoa e sala", "Envio no horário escolhido"], ["Responsável recebe só a sua sala"]),
    ("Painel de energia para TV do escritório (modo quiosque)", "baixa", 4, "mostrar o consumo em tempo real ajuda a mudar hábitos.", ["Rota de quiosque só leitura com link de uso restrito", "Atualiza a cada 5 min (cota de tráfego)"], ["Tela cheia legível de longe"]),
    ("Comparar mês atual com o mesmo mês do ano anterior", "baixa", 2, "o verão distorce a comparação com o mês anterior.", ["Comparativo anual nos relatórios"], ["Gráfico ano contra ano"]),
    ("Custo por hora de reunião (ar da sala de reunião)", "baixa", 2, "ajuda a planejar reuniões longas no verão.", ["Custo médio por hora com o ar ligado na Reunião"], ["Número aparece no relatório da sala"]),
]:
    ev(S, t, p, h, ["energia", "relatórios"], porque, fazer, pronto, "backend/app/relatorio.py, frontend/src/pages/Relatorios.jsx")

S = "Segurança"
for t, p, h, porque, fazer, pronto, onde in [
    ("Exigir 2FA para dono e administradores", "alta", 3, "conta de admin sem segundo fator é o maior risco da conformidade.", ["Ligar exigir_2fa_admin depois que todos cadastrarem", "Tela guiando o cadastro do autenticador"], ["Admin sem 2FA não entra"], "backend/app/seguranca.py"),
    ("Passkey obrigatória para ações críticas (apagar, restaurar backup, trocar dono)", "alta", 5, "senha roubada não pode bastar para destruir dados.", ["Reautenticação com biometria antes da ação", "Janela de 5 minutos"], ["Ação crítica pede biometria"], "backend/app/rotas/contas.py"),
    ("Relatório de CSP (report-to) para achar bloqueios e ataques", "media", 3, "violação de CSP hoje passa despercebida.", ["Endpoint de relatório com limite", "Painel em Segurança"], ["Violações aparecem agrupadas"], "vercel.json, backend/app/main.py"),
    ("Rotação programada das chaves (Supabase, Resend, Sinric, Turnstile)", "media", 4, "chave que nunca troca vira risco quando vaza sem ninguém saber.", ["Calendário de rotação e lembrete", "Roteiro testado de troca sem parar o sistema"], ["Cada chave tem data da última troca"], "docs/seguranca/"),
    ("Varredura de dependências semanal com aviso (pip-audit e npm audit)", "media", 2, "vulnerabilidade nova aparece sem mudança no código.", ["Job semanal no CI", "Abre bug automático quando achar alta/crítica"], ["Bug criado com o pacote e a versão"], ".github/workflows/ci.yml"),
    ("Testes de segurança automatizados por papel (quem pode o quê)", "alta", 8, "uma rota nova pode abrir acesso a quem não devia.", ["Matriz papel × rota com o resultado esperado", "Rodar contra o servidor local"], ["Toda rota testada com os 5 papéis"], "backend/app/acesso.py"),
    ("Registro imutável dos logs fora do Supabase (cópia diária assinada)", "media", 5, "quem invade o banco pode apagar o rastro.", ["Exportar o selo diário (SHA-256) para outro armazenamento", "Conferir a cadeia na tela"], ["Selo conferido fora do banco"], "backend/app/conformidade.py"),
    ("Bloqueio por país configurável com exceções por pessoa", "baixa", 3, "o sistema é usado só no Brasil, mas há viagens.", ["Lista de países permitidos", "Exceção temporária por pessoa"], ["Acesso de fora bloqueado salvo exceção"], "backend/app/firewall.py"),
    ("Alerta de sessão em dois lugares ao mesmo tempo", "media", 3, "sessão roubada costuma aparecer em outro IP enquanto a original segue ativa.", ["Detectar a mesma conta ativa em IPs/países diferentes", "Aviso e opção de encerrar"], ["Aviso com encerrar as outras"], "backend/app/sessoes.py"),
    ("Política de senha com expiração para contas sem 2FA", "baixa", 2, "contas sem 2FA dependem só da senha.", ["Trocar a cada 180 dias se não houver 2FA"], ["Aviso 15 dias antes"], "backend/app/rotas/contas.py"),
    ("Teste de intrusão anual por terceiro e relatório", "media", 8, "a auditoria interna não substitui olhar externo.", ["Escopo, regras e janela", "Correções em tarefas"], ["Relatório arquivado com as correções"], "docs/seguranca/"),
    ("Honeypot de rotas falsas para detectar varredura", "baixa", 2, "robôs testam /wp-admin, /.env etc.", ["Rotas armadilha que bloqueiam o IP", "Sem impacto em quem usa"], ["IP que toca a armadilha é bloqueado"], "backend/app/firewall.py, middleware.js"),
    ("Assinatura dos instaladores do agente (hash publicado)", "media", 3, "quem baixa o instalador não tem como conferir a integridade.", ["Publicar SHA-256 dos scripts e do zip", "Instalador confere antes de rodar"], ["Instalador recusa arquivo alterado"], "frontend/public/instalar-agente.sh"),
    ("Inventário de dados pessoais (LGPD) com base legal por campo", "alta", 5, "a LGPD exige saber o que se guarda e por quê.", ["Mapa de tabelas × dados pessoais × finalidade × prazo", "Página para o encarregado"], ["Inventário aprovado pelo encarregado"], "backend/app/documentos.py"),
    ("Direitos do titular: exportar e apagar meus dados", "media", 5, "pedido de titular precisa de resposta em prazo.", ["Exportar (já existe Meus dados) e pedido de exclusão com aprovação", "Registro do atendimento"], ["Pedido atendido e registrado"], "backend/app/rotas/contas.py"),
    ("Retenção configurável por tipo de log", "baixa", 3, "90 dias de atividade fixos podem ser pouco ou demais.", ["Prazo por tabela em Configurações", "Limpeza no cron"], ["Prazo respeitado pelo cron"], "supabase/cron-jobs.json"),
]:
    ev(S, t, p, h, ["segurança"], porque, fazer, pronto, onde)

S = "Infra e dados"
for t, p, h, porque, fazer, pronto, onde in [
    ("Ambiente de homologação (Supabase e Vercel separados)", "alta", 10, "todo teste hoje mexe no banco de produção; o TestSprite e o Playwright precisam de um lugar seguro.", ["Projeto Supabase de teste com o schema.sql", "Projeto Vercel staging com chaves de teste do Turnstile", "Dados de exemplo sem dados pessoais"], ["Testes rodam sem tocar a produção"], "vercel.json, supabase/schema.sql"),
    ("Migrar para o plano Pro do Supabase ou reduzir tráfego de vez", "alta", 3, "a cota de tráfego estourou em novembro.", ["Medir 30 dias depois das versões 0.7.x", "Decidir com o dono"], ["Uso do mês abaixo de 4 GB ou plano trocado"], "components/supabase/UsoCota.jsx"),
    ("Cópia do banco fora do Supabase (diária, cifrada)", "alta", 5, "backup no mesmo provedor não protege de perder a conta.", ["pg_dump cifrado pelo agente para outro armazenamento", "Teste de restauração mensal"], ["Restauração testada a partir da cópia de fora"], "backend/app/backup_sistema.py"),
    ("Monitor externo de disponibilidade com página de status", "media", 3, "quando o sistema cai, ninguém sabe se é geral.", ["Checagem de /saude a cada minuto por serviço externo gratuito", "Página de status no site"], ["Aviso em até 2 minutos de queda"], "site/app/status"),
    ("Tempo de resposta das rotas no painel (p50/p95 por rota)", "media", 4, "lentidão no backend aparece só como reclamação.", ["Medir no middleware e guardar agregado por hora", "Gráfico em Acessos e SEO"], ["p95 por rota visível"], "backend/app/main.py"),
    ("Índices do banco revisados pelas consultas mais lentas", "media", 3, "algumas consultas leem milhares de linhas (pg_stat_statements).", ["Top 20 consultas por tempo total", "Criar ou ajustar índices"], ["Top 5 consultas com metade do tempo"], "supabase/schema.sql"),
    ("Particionar ou resumir a tabela atividade", "baixa", 5, "atividade cresce todo dia e pesa nas telas de logs.", ["Resumo diário e limpeza do detalhe antigo", "Consultas usam o resumo"], ["Telas de logs abrem em menos de 1 s"], "backend/app/logs.py"),
    ("Agente em contêiner oficial para Raspberry Pi e mini PC", "baixa", 5, "instalar por script varia de máquina para máquina.", ["Imagem Docker multiarquitetura", "Atualização automática"], ["Agente sobe com um comando"], "frontend/public/instalar-agente.sh"),
    ("Dois agentes sempre no escritório (principal e reserva físicos)", "alta", 2, "se o único agente cair, nenhum ar obedece.", ["Raspberry Pi como reserva fixa na rede dos transmissores", "Teste de troca"], ["Troca automática testada"], "backend/app/coordenador.py"),
    ("Alertas do agente por Telegram quando ficar cego", "media", 2, "agente fora da rede dos transmissores só vira notificação depois de 3 h.", ["Aviso em 10 minutos pelo Telegram", "Silenciar fora do expediente"], ["Aviso chega em 10 minutos"], "backend/app/bugs.py, telegram.py"),
    ("Limpeza automática de publicações antigas na Vercel", "baixa", 2, "Functions Storage cresce com publicações guardadas.", ["Manter as 10 mais novas por projeto, toda semana"], ["Espaço estável"], "backend/app/infra.py"),
    ("Painel de custos (Vercel, Supabase, Sinric, domínios)", "baixa", 4, "custos ficam espalhados em vários sites.", ["Lançar valores e vencimentos", "Aviso de renovação"], ["Custo mensal num lugar só"], "novo: pages/Custos.jsx"),
    ("Banco de dados de leitura para relatórios pesados", "baixa", 6, "relatórios grandes disputam conexão com o painel.", ["Réplica de leitura ou visão materializada", "Relatórios leem dela"], ["Relatório pesado não deixa o painel lento"], "backend/app/relatorio.py"),
    ("Teste de carga do backend (100 usuários simultâneos)", "media", 4, "não se sabe quanto a Vercel com 2 conexões aguenta.", ["k6 ou Locust no ambiente de homologação", "Ajustar pool e cache"], ["Relatório com o limite e o gargalo"], "backend/app/db.py"),
]:
    ev(S, t, p, h, ["infra"], porque, fazer, pronto, onde)

S = "Integrações"
for t, p, h, porque, fazer, pronto, onde in [
    ("Integração com Home Assistant (MQTT)", "baixa", 8, "várias prefeituras e empresas já usam Home Assistant.", ["Publicar estado dos ares em MQTT", "Receber comandos com a mesma checagem de permissão"], ["Ar aparece e obedece no Home Assistant"], "novo: backend/app/mqtt.py"),
    ("Suporte a Matter para os dispositivos compatíveis", "baixa", 12, "Matter é o padrão novo de casa e escritório inteligente.", ["Avaliar ponte Matter no agente", "Começar pelas tomadas"], ["Um dispositivo Matter controlado pelo sistema"], "backend/app/dispositivos.py"),
    ("Alexa: rotina por voz que roda uma cena do sistema", "media", 4, "a voz hoje controla ares, não cenas.", ["Expor cenas como cenas do Sinric", "Frases no catálogo"], ["\"Alexa, ligar fim do expediente\" roda a cena"], "backend/app/sinric.py"),
    ("Google Home com zonas como um aparelho só", "baixa", 4, "a Alexa já trata zona como um aparelho; o Google não.", ["Mesmo tratamento de organizar_zona"], ["Zona aparece como um aparelho no Google"], "backend/app/sinric.py"),
    ("Microsoft Teams: avisos e comandos", "baixa", 6, "a Prefeitura usa e-mail Outlook; Teams pode estar disponível.", ["Webhook de avisos", "Comando simples por bot"], ["Aviso chega no canal"], "novo: backend/app/teams.py"),
    ("WhatsApp para avisos críticos (via provedor oficial)", "baixa", 6, "nem todos usam Telegram.", ["Provedor oficial da API do WhatsApp", "Só avisos críticos, com opt-in"], ["Aviso crítico chega no WhatsApp"], "backend/app/notificacoes.py"),
    ("Webhooks de saída configuráveis (evento → URL)", "media", 5, "outros sistemas da Prefeitura podem querer reagir aos eventos.", ["Cadastro de webhook com segredo e assinatura", "Novas tentativas e registro"], ["Evento entregue com assinatura"], "novo: backend/app/webhooks.py"),
    ("API pública documentada com chaves por sistema", "media", 8, "integrações hoje dependem de login de pessoa.", ["Chaves de API com escopo e limite", "Documentação pública"], ["Outro sistema lê o estado com uma chave"], "backend/app/acesso.py"),
    ("Calendário Google/Outlook das salas", "media", 6, "pré-resfriar e relatórios por reunião dependem do calendário.", ["Ler eventos por sala (OAuth da conta institucional)", "Mostrar na tela Rotinas"], ["Reuniões aparecem por sala"], "novo: backend/app/calendario.py"),
    ("Spotify: rotinas por sala e volume por horário", "baixa", 3, "música ambiente só tem rotinas globais.", ["Rotina por sala e faixa de volume"], ["Rotina por sala funcionando"], "backend/app/musica.py"),
    ("Resend: modelo de e-mail para cada aviso crítico", "baixa", 3, "avisos críticos vão por notificação, nem sempre por e-mail.", ["Modelos por tipo e preferência por pessoa"], ["Pessoa escolhe quais avisos recebe por e-mail"], "backend/app/correio.py"),
    ("Exportar dados para o portal de dados abertos da Prefeitura", "baixa", 5, "transparência ativa sobre consumo de energia.", ["Conjunto mensal sem dados pessoais", "Formato do portal"], ["Conjunto publicado"], "backend/app/exportar.py"),
]:
    ev(S, t, p, h, ["integração"], porque, fazer, pronto, onde)

S = "Assistente de IA"
for t, p, h, porque, fazer, pronto in [
    ("IA sugere economia a partir dos relatórios da semana", "media", 5, "os dados existem, mas ninguém tem tempo de analisar.", ["Resumo semanal com 3 sugestões concretas", "Botão para criar a automação sugerida"], ["Sugestão vira automação com 1 clique"]),
    ("IA explica uma falha de comando em linguagem simples", "baixa", 3, "erros técnicos assustam quem não é de TI.", ["Botão 'explicar' em falhas da Atividade", "Resposta com o passo para resolver"], ["Explicação aparece na falha"]),
    ("IA cria rotinas por conversa (\"desligar tudo às 19h nos dias úteis\")", "media", 5, "montar automação pela tela tem muitos campos.", ["Ferramenta que monta a automação e mostra a prévia", "Confirmação antes de salvar"], ["Rotina criada pela conversa"]),
    ("IA responde dúvidas com o Guia e o MANUAL como fonte", "baixa", 4, "as perguntas repetem o que está no Guia.", ["Busca nos textos do Guia e do MANUAL", "Resposta com link do capítulo"], ["Resposta cita o capítulo"]),
    ("Avaliação das respostas da IA (painel de qualidade)", "baixa", 3, "o feedback já é gravado, mas não é analisado.", ["Taxa de respostas úteis por modelo e ferramenta", "Exemplos ruins para melhorar o prompt"], ["Painel com a taxa por semana"]),
    ("Limites de uso da IA por pessoa e por dia", "media", 2, "a chave da NVIDIA tem cota.", ["Limite configurável", "Aviso ao chegar perto"], ["Limite respeitado"]),
    ("IA no Telegram com memória da conversa por pessoa", "baixa", 3, "no Telegram cada pergunta começa do zero.", ["Guardar as últimas mensagens por chat", "Comando para limpar"], ["Pergunta seguinte entende o contexto"]),
    ("Modo offline da IA com modelo local no agente (opcional)", "baixa", 10, "sem internet externa a IA para.", ["Avaliar modelo pequeno no PC do escritório", "Só para perguntas simples"], ["Resposta sem chamar a nuvem"]),
    ("IA analisa bugs novos e sugere a causa provável", "media", 4, "o bug chega com o erro, mas sem diagnóstico.", ["Usar o prompt montado do bug e os arquivos prováveis", "Sugestão no histórico do bug"], ["Bug novo ganha sugestão em minutos"]),
    ("Resumo do dia para o dono (o que aconteceu, o que falhou)", "baixa", 3, "o dono acompanha por várias telas.", ["Resumo às 18h por Telegram ou e-mail", "Links para as telas"], ["Resumo chega todo dia útil"]),
]:
    ev(S, t, p, h, ["ia"], porque, fazer, pronto, "backend/app/ia.py, frontend/src/pages/Ia.jsx")

S = "Mapa 3D"
for t, p, h, porque, fazer, pronto in [
    ("Mapa 2D leve para celular com o estado dos ares", "media", 5, "o 3D é pesado no celular e gasta tráfego.", ["Planta SVG com as salas e os ares coloridos pelo estado", "Tocar no ar abre o controle"], ["Mapa abre em menos de 1 s no celular"]),
    ("Calor por sala no mapa (temperatura do ar e externa)", "baixa", 4, "ver onde está mais quente ajuda a decidir.", ["Cor da sala pela temperatura pedida", "Legenda"], ["Mapa mostra as salas por cor"]),
    ("Ocupação da sala no mapa (quem está no expediente)", "baixa", 3, "o mapa já sabe o expediente de cada pessoa.", ["Contador por sala", "Sala vazia com ar ligado destacada"], ["Sala vazia com ar ligado aparece em destaque"]),
    ("Editor de planta com medidas reais em metros", "baixa", 6, "a planta é em pixels; obras e mudanças pedem medidas.", ["Escala em metros e régua", "Importar planta em imagem como fundo"], ["Planta com medidas reais"]),
    ("Mapa 3D com qualidade automática pelo aparelho no primeiro acesso", "baixa", 3, "aparelhos fracos travam na primeira abertura.", ["Teste rápido de GPU antes de montar a cena", "Começar no nível certo"], ["Primeira abertura sem travar"]),
    ("Tour guiado do mapa para quem entra pela primeira vez", "baixa", 3, "os controles do avatar não são óbvios.", ["Passos curtos com destaque", "Não aparece de novo"], ["Tour termina em menos de 1 minuto"]),
    ("Modelos 3D sob demanda com tamanho máximo por arquivo", "media", 3, "modelos grandes estouraram a cota de tráfego.", ["Recusar GLB acima de 3 MB sem versão leve", "Gerar versão leve no envio"], ["Nenhum modelo acima do limite no mapa"]),
    ("Clicar no ar no 3D abre o controle completo", "baixa", 2, "o cartão do 3D tem menos opções que o Painel.", ["Mesmo controle do ArCartao"], ["Mesmas ações nos dois lugares"]),
]:
    ev(S, t, p, h, ["mapa"], porque, fazer, pronto, "frontend/src/components/Mapa3D.jsx, pages/Mapa.jsx")

S = "Telegram"
for t, p, h, porque, fazer, pronto in [
    ("Botões rápidos no Telegram para a sala da pessoa", "media", 3, "1.953 comandos é muito; cada pessoa usa 3.", ["Teclado com os ares da pessoa", "Favoritos no topo"], ["Ligar o ar da própria sala em 1 toque"]),
    ("Confirmação no Telegram para ações em lote", "media", 2, "desligar todos sem confirmação já aconteceu por engano.", ["Pedir confirmação com prévia"], ["Lote pede confirmação"]),
    ("Telegram: aviso quando um ar ficar ligado fora do expediente", "media", 2, "o aviso existe no painel, mas o dono não está sempre nele.", ["Mandar para o responsável da sala"], ["Aviso chega no Telegram"]),
    ("Telegram: relatório semanal com gráfico em imagem", "baixa", 3, "texto puro não mostra tendência.", ["Gerar PNG do gráfico no servidor", "Enviar às segundas"], ["Imagem chega com o resumo"]),
    ("Telegram: atendimento a bugs relatados pelo bot", "baixa", 3, "relatar bug pelo celular é mais rápido.", ["/bug com texto e foto", "Vira bug com tarefa"], ["Bug criado pelo Telegram"]),
    ("Telegram: grupos por sala com permissões", "baixa", 4, "equipes querem controlar a sua sala em grupo.", ["Vincular grupo a uma sala", "Só ares da sala"], ["Grupo controla só a sua sala"]),
    ("Telegram: limpeza de comandos pouco usados", "baixa", 2, "o menu ficou grande demais.", ["Ranking de uso por comando (logs do bot)", "Esconder os nunca usados do menu"], ["Menu com os mais usados"]),
]:
    ev(S, t, p, h, ["telegram"], porque, fazer, pronto, "backend/app/telegram.py, telegram_cmds.py")

S = "Tarefas"
for t, p, h, porque, fazer, pronto in [
    ("Bloqueios entre tarefas visíveis no quadro e no cronograma", "media", 4, "várias tarefas do plano só podem começar depois de outras.", ["Campo 'bloqueada por' e aviso no quadro", "Cronograma mostra a seta"], ["Tarefa bloqueada aparece marcada"]),
    ("Sprints com metas e gráfico de burndown", "baixa", 6, "o plano tem centenas de tarefas e precisa de ritmo.", ["Sprints de 2 semanas", "Burndown por horas estimadas"], ["Sprint com gráfico"]),
    ("Campos personalizados por projeto", "baixa", 6, "cada projeto pede um campo diferente (sala, ar, custo).", ["Texto, número, data e lista", "Filtros e quadro por campo"], ["Campo novo usado em filtro"]),
    ("Automação: tarefa concluída fecha o item no GitHub", "media", 2, "o Status vai para Concluído, mas o rascunho continua aberto.", ["Arquivar o item ou converter em issue fechada"], ["Item some da lista de abertos no GitHub"]),
    ("Converter rascunho do GitHub em issue do repositório", "baixa", 3, "issues têm histórico e menções; rascunhos não.", ["Botão converter na tarefa", "Guardar o link"], ["Tarefa ligada à issue"]),
    ("Horas trabalhadas por tarefa (apontamento)", "baixa", 4, "estimativa sem realizado não ensina a estimar.", ["Iniciar/parar contador", "Relatório estimado × realizado"], ["Relatório por pessoa e projeto"]),
    ("Modelos de tarefa com checklist (instalar ar, trocar transmissor)", "baixa", 2, "tarefas de operação se repetem.", ["Modelos com subtarefas"], ["Tarefa criada pelo modelo"]),
    ("Visão por responsável (quadro por pessoa)", "baixa", 3, "o dono quer ver a carga de cada um.", ["Agrupar o quadro por responsável"], ["Quadro por pessoa"]),
    ("Notificação de prazo chegando (1 dia antes)", "media", 2, "prazos passam sem aviso.", ["Aviso no sino e no Telegram"], ["Aviso um dia antes"]),
    ("Importar tarefas de planilha (CSV)", "baixa", 3, "planos antigos estão em planilha.", ["Mapear colunas e prévia"], ["Planilha importada sem duplicar"]),
]:
    ev(S, t, p, h, ["tarefas"], porque, fazer, pronto, "backend/app/tarefas.py, frontend/src/pages/Tarefas.jsx")

S = "Bugs e qualidade"
for t, p, h, porque, fazer, pronto in [
    ("Suíte de testes de ponta a ponta no CI com o ambiente de homologação", "alta", 10, "sem homologação os testes mexeriam em produção.", ["Playwright contra o staging", "Rodar a cada push na main"], ["CI vermelho quando uma tela quebrar"]),
    ("Captura de erro do navegador com o passo a passo (replay leve)", "media", 5, "o bug chega sem saber o que a pessoa fez antes.", ["Guardar as últimas 20 ações (sem dados digitados)", "Anexar ao bug"], ["Bug com os passos"]),
    ("Agrupar bugs pelo mesmo erro (assinatura da pilha)", "media", 3, "o mesmo erro vira vários bugs.", ["Assinatura pela mensagem e pela primeira linha da pilha", "Juntar automaticamente"], ["Mesmo erro vira um bug com várias ocorrências"]),
    ("Prioridade do bug pelo impacto (quantas pessoas afetadas)", "baixa", 2, "gravidade fixa não mostra o tamanho do problema.", ["Contar pessoas e sessões afetadas", "Subir a gravidade sozinho"], ["Bug que afeta muitos sobe de prioridade"]),
    ("Checagem de tipos no frontend (JSDoc ou TypeScript gradual)", "baixa", 12, "variável indefinida já deixou tela preta.", ["Começar por api.js, contexto e ui", "Checagem no CI"], ["CI confere os tipos dos arquivos migrados"]),
    ("Lint do frontend completo no CI (react-hooks e no-undef)", "media", 3, "hoje a checagem é feita à mão.", ["Config de eslint no repositório", "CI falha com erro"], ["CI roda o eslint"]),
    ("Testes de contrato da API (o que o front espera)", "baixa", 6, "mudar a resposta de uma rota quebra a tela sem aviso.", ["Esquemas das respostas principais", "Teste compara"], ["Mudança de formato quebra o teste"]),
    ("Revisão de código com checklist antes de publicar", "baixa", 2, "o checklist da seção 11 é seguido de memória.", ["Modelo de pull request com o checklist"], ["Toda publicação passa pelo checklist"]),
]:
    ev(S, t, p, h, ["qualidade"], porque, fazer, pronto, ".github/workflows/ci.yml")

S = "Painel e telas"
for t, p, h, porque, fazer, pronto in [
    ("Painel personalizável (arrastar cartões e escolher o que ver)", "baixa", 6, "cada papel quer ver coisas diferentes.", ["Grade de cartões com ordem salva por pessoa", "Esconder e mostrar"], ["Painel lembra a escolha"]),
    ("Busca global com ações (\"ligar ar da reunião\")", "media", 5, "a busca do menu só leva a telas.", ["Ações rápidas na busca (Ctrl+K)", "Respeitar permissões"], ["Ação executada pela busca"]),
    ("Modo de alto contraste e fonte maior", "baixa", 3, "acessibilidade para baixa visão.", ["Opção em Aparência", "Tokens próprios"], ["Modo aplicado em todas as telas"]),
    ("Onboarding da primeira entrada por papel", "baixa", 4, "pessoa nova não sabe por onde começar.", ["3 a 5 passos por papel", "Pular e retomar"], ["Pessoa nova faz a primeira ação guiada"]),
    ("Central de ajuda dentro do sistema (busca no Guia)", "baixa", 3, "o Guia é longo.", ["Busca por palavra no Guia", "Atalho ?"], ["Resposta em 2 cliques"]),
    ("Atalhos de teclado configuráveis", "baixa", 2, "os atalhos são fixos.", ["Lista editável em Configurações"], ["Atalho trocado funciona"]),
    ("Modo apresentação para reunião (sem menus)", "baixa", 2, "mostrar o painel em reunião expõe menus e dados.", ["Tela limpa com os números principais"], ["Modo ativado por atalho"]),
    ("Revisar todos os window.confirm restantes por Modal", "media", 3, "window.confirm trava a tela e foge do visual.", ["Trocar os ~25 pontos pelo confirmar()"], ["Nenhum window.confirm no código"]),
]:
    ev(S, t, p, h, ["interface"], porque, fazer, pronto, "frontend/src/components/")

S = "Dispositivos"
for t, p, h, porque, fazer, pronto in [
    ("Sensor de temperatura e umidade por sala (Tuya)", "alta", 6, "o sistema não sabe a temperatura real da sala; o ar não devolve estado.", ["Cadastrar sensores Tuya por sala", "Mostrar no Painel e no mapa", "Usar em automações"], ["Temperatura real por sala no Painel"]),
    ("Sensor de presença para desligar sala vazia", "alta", 6, "sala vazia com ar ligado é desperdício comum.", ["Sensor Tuya por sala", "Gatilho 'sala vazia há X min'"], ["Ar desliga com a sala vazia"]),
    ("Sensor de porta/janela aberta pausa o ar", "media", 4, "ar ligado com janela aberta gasta à toa.", ["Sensor de abertura", "Pausar e avisar"], ["Ar pausa com a janela aberta"]),
    ("Tomada inteligente com medição no ar do servidor", "media", 3, "a sala do servidor precisa de vigilância especial.", ["Medir consumo e avisar se cair a zero (ar parou)"], ["Aviso quando o ar do servidor parar"]),
    ("Fechadura: registro de entradas por pessoa", "baixa", 4, "a fechadura só abre e fecha.", ["Ler eventos de abertura com usuário", "Relatório"], ["Entradas por pessoa e horário"]),
    ("Persianas automáticas pelo sol e pela temperatura", "baixa", 4, "sol direto aquece as salas.", ["Fechar quando o sol bater e o ar estiver ligado"], ["Persiana fecha sozinha nesses casos"]),
    ("Cafeteira: agenda e aviso de água", "baixa", 2, "café pronto na chegada é um pedido comum.", ["Agenda por dia", "Aviso de reservatório (se o modelo informar)"], ["Café agendado funcionando"]),
    ("Placa ESP32 como transmissor IR próprio (protótipo)", "baixa", 16, "transmissores Tuya dependem da nuvem e do Smart Life.", ["Protótipo com receptor e emissor IR", "Falar com o agente pela rede local"], ["ESP32 envia um botão gravado"]),
]:
    ev(S, t, p, h, ["dispositivos"], porque, fazer, pronto, "backend/app/dispositivos.py")

S = "Logs e auditoria"
for t, p, h, porque, fazer, pronto in [
    ("Trilha de auditoria de mudanças de configuração (antes → depois)", "alta", 4, "não dá para saber quem mudou uma regra e o que era antes.", ["Guardar diff de cada mudança em config", "Tela com filtro por pessoa"], ["Cada mudança mostra antes e depois"]),
    ("Exportar logs para um SIEM (syslog/JSON)", "baixa", 4, "a TI da Prefeitura pode centralizar os eventos.", ["Envio periódico em formato padrão"], ["Eventos chegam no SIEM"]),
    ("Alerta de padrão anormal (muitos comandos de uma pessoa)", "media", 3, "conta comprometida pode sair ligando tudo.", ["Limite por pessoa e janela", "Aviso e bloqueio temporário"], ["Aviso disparado no teste"]),
    ("Relatório mensal de auditoria em PDF assinado", "baixa", 4, "auditorias pedem documento fechado.", ["PDF com hash e selo do dia"], ["PDF gerado todo mês"]),
    ("Busca nos logs por texto completo e por intervalo", "baixa", 3, "achar um evento antigo é lento.", ["Índice de texto no banco", "Filtro de data"], ["Busca em menos de 1 s"]),
    ("Linha do tempo de um ar com tudo que mexeu nele", "baixa", 3, "investigar um problema de um ar junta várias telas.", ["Comandos, rotinas, falhas e botões num lugar"], ["Linha do tempo no detalhe do ar"]),
]:
    ev(S, t, p, h, ["logs"], porque, fazer, pronto, "backend/app/logs.py")

S = "Apps"
for t, p, h, porque, fazer, pronto in [
    ("Notificações push nativas (Android e iPhone)", "media", 8, "o app só vê avisos quando aberto.", ["FCM e APNs por um serviço só", "Preferências por pessoa"], ["Aviso chega com o app fechado"]),
    ("Widget na tela inicial com os ares da pessoa", "baixa", 6, "abrir o app para ligar o ar é lento.", ["Widget Android e iOS"], ["Ligar pelo widget"]),
    ("Atalhos de voz do sistema (Siri e Google Assistente)", "baixa", 5, "a Alexa não está em todo lugar.", ["Atalhos para cenas e ares"], ["\"Ei Siri, ligar o ar\" funciona"]),
    ("Publicar o app Android na Play Store (teste interno)", "media", 6, "APK por link assusta e não atualiza sozinho.", ["Conta de desenvolvedor", "Faixa de teste interno"], ["Instalação pela loja"]),
    ("Publicar o app iPhone pelo TestFlight", "media", 6, "o iPhone hoje depende de instalação manual.", ["Conta Apple Developer", "TestFlight"], ["Instalação pelo TestFlight"]),
    ("Atualização automática do app desktop", "baixa", 4, "o app avisa versão nova, mas não atualiza.", ["electron-updater com os releases"], ["Atualiza ao reiniciar"]),
]:
    ev(S, t, p, h, ["apps"], porque, fazer, pronto, "apps/")

S = "Site"
for t, p, h, porque, fazer, pronto in [
    ("Página de status pública ligada ao monitor externo", "media", 3, "quando o sistema cai, a primeira pergunta é 'é só comigo?'.", ["Status por serviço e histórico de 90 dias"], ["Página atualizada a cada minuto"]),
    ("Estudo de caso do escritório (números reais, com autorização)", "baixa", 4, "o site não mostra resultado concreto.", ["Economia medida e depoimento autorizado"], ["Página publicada com dados reais"]),
    ("Acessibilidade do site (eMAG / WCAG)", "media", 5, "site público precisa seguir o eMAG.", ["Auditoria e correções", "Selo eMAG"], ["Sem violações sérias"]),
    ("Formulário de contato com roteamento por assunto", "baixa", 2, "mensagens chegam todas no mesmo lugar.", ["Assunto define quem recebe"], ["Mensagem chega no responsável"]),
    ("SEO técnico: dados estruturados e mapa do site por idioma", "baixa", 3, "o site está em 6 idiomas, mas o Google não vê todos.", ["hreflang e dados estruturados"], ["Search Console sem erros"]),
]:
    ev(S, t, p, h, ["site"], porque, fazer, pronto, "site/")

S = "Documentação e processo"
for t, p, h, porque, fazer, pronto in [
    ("Manual do administrador separado do manual do usuário", "media", 6, "o MANUAL mistura instalação e uso.", ["Dois documentos com público definido"], ["Dois PDFs publicados"]),
    ("Roteiros de incidente testados (ar não obedece, agente cego, cota estourada)", "media", 4, "os roteiros da seção 17 nunca foram ensaiados.", ["Simulado de cada roteiro"], ["Roteiro revisado depois do simulado"]),
    ("Registro de decisões de arquitetura (ADR)", "baixa", 3, "decisões ficam espalhadas nos diários.", ["Pasta docs/decisoes com um arquivo por decisão"], ["Decisões principais registradas"]),
    ("Política de versões e suporte dos apps", "baixa", 2, "não está claro até quando uma versão antiga funciona.", ["Versão mínima suportada", "Aviso de atualização obrigatória"], ["Política publicada"]),
    ("Treinamento em vídeo curto por tela principal", "baixa", 8, "pessoas preferem ver a ler.", ["Vídeos de até 2 minutos"], ["Vídeos no Guia"]),
    ("Plano de continuidade (sem internet, sem agente, sem Supabase)", "alta", 4, "o escritório precisa saber o que fazer quando o sistema parar.", ["Uso do controle remoto, contatos, prioridades"], ["Plano aprovado e impresso"]),
]:
    ev(S, t, p, h, ["documentação"], porque, fazer, pronto, "docs/")

S = "Pendências de operação"
for t, p, h, porque, fazer, pronto in [
    ("Deixar todos os 8 transmissores online ao mesmo tempo e conferir por 24 h", "urgente", 2, "durante a reconfiguração só um ficava online por vez.", ["Todos na tomada", "Conferir no Smart Life e em Transmissores por 24 h"], ["8 de 8 online por 24 h"]),
    ("Testar o apito de cada um dos 8 ares com o seu transmissor", "urgente", 2, "os ares têm botões copiados; falta a prova física.", ["Frio 24° pelo painel em cada ar com alguém na sala"], ["8 ares apitaram"]),
    ("Atualizar o PC EGOV para a última versão e confirmar que enxerga os transmissores", "alta", 1, "o EGOV não recebia os anúncios da rede (firewall).", ["Atualizar agente", "Testar conexão em cada transmissor pelo EGOV"], ["EGOV enxerga 8 de 8"]),
    ("Comprar o transmissor da sala de Reunião", "media", 1, "o Ar da reunião é o único sem transmissor.", ["Compra e instalação", "Importar e ligar ao ar"], ["Ar da reunião obedecendo"]),
    ("Cadastrar o token só com escopo project do GitHub em Tarefas", "alta", 1, "sem ele, a sincronização a cada 10 minutos não roda.", ["Gerar o token", "Colar em Tarefas → GitHub"], ["Sincronização automática rodando"]),
    ("Criar a conta de teste (visualizador) para o TestSprite", "media", 1, "os testes completos precisam de uma conta que não muda nada.", ["Conta @floripa.sc.gov.br com papel visualizador"], ["TestSprite entra com a conta de teste"]),
    ("Revisar com a TI o limite de aparelhos no Wi-Fi 2,4 GHz", "alta", 1, "os transmissores caíam um a um ao entrar o seguinte.", ["Confirmar limite e isolamento de clientes", "Rede própria para IoT se preciso"], ["Rede sem limite para os transmissores"]),
]:
    ev(S, t, p, h, ["operação"], porque, fazer, pronto, "")

S = "Ares e automação"
for t, p, h, porque, fazer, pronto in [
    ("Indicar no Painel quando o ar pode ter sido mudado pelo controle remoto", "baixa", 3, "o IR só vai num sentido e o painel fica desatualizado.", ["Pergunta discreta quando o estado não bate com o horário de uso"], ["Pessoa corrige o estado em 1 toque"]),
    ("Mudar vários ares de uma zona sem perder a independência dos outros", "baixa", 3, "zonas antigas atrapalham depois que cada ar ganhou transmissor.", ["Limpar zonas de transmissores que só têm um ar"], ["Nenhuma zona com um ar só"]),
    ("Velocidade de resposta do comando (meta de 2 s do clique ao apito)", "media", 4, "a fila na nuvem adiciona segundos.", ["Medir clique → agente → transmissor", "Reduzir a espera da fila depois de um comando"], ["p95 abaixo de 2 s"]),
    ("Tela de saúde de cada transmissor (sinal, quedas, última resposta)", "media", 4, "transmissores caem sem histórico.", ["Guardar quedas e tempo de resposta", "Gráfico de 7 dias"], ["Histórico por transmissor"]),
    ("Avisar quando dois transmissores ficarem com o mesmo IP", "media", 1, "IP repetido manda comando para o aparelho errado.", ["Já há checagem nos Bugs; mostrar também em Transmissores"], ["Aviso na tela"]),
    ("Programa de manutenção dos transmissores (reiniciar semanal)", "baixa", 2, "o SRW-004 fica instável depois de dias ligado.", ["Tomada inteligente reinicia de madrugada"], ["Reinício semanal registrado"]),
    ("Botão 'testar todos os ares' com roteiro de quem confere", "baixa", 3, "conferir os 8 ares hoje é manual.", ["Um ar por vez com pausa", "Marcar quem apitou"], ["Relatório do teste"]),
    ("Faixa de temperatura padrão por estação do ano", "baixa", 2, "no inverno a faixa ideal é outra.", ["Faixa por estação em Configurações → Geral"], ["Faixa troca sozinha na estação"]),
    ("Modo economia de pico (horário de ponta da distribuidora)", "media", 3, "o horário de ponta encarece a energia.", ["Janela de ponta configurável", "Subir 1 °C nesse horário"], ["Regra aplicada no horário de ponta"]),
    ("Dashboard de conforto (temperatura pedida × reclamações)", "baixa", 3, "conforto é subjetivo, mas dá para medir pedidos.", ["Botão 'está frio/quente' por sala", "Gráfico por sala"], ["Pedidos aparecem por sala"]),
]:
    ev(S, t, p, h, ["ares"], porque, fazer, pronto, "backend/app/clima.py, frontend/src/pages/Painel.jsx")

S = "Integrações"
for t, p, h, porque, fazer, pronto in [
    ("Sinric: renovar o plano manual antes de 17/11/2027", "media", 1, "o plano de 1 aparelho é de pagamento manual.", ["Lembrete 30 dias antes"], ["Plano renovado no prazo"]),
    ("Alexa: diagnóstico mostrando o último comando de cada ar", "baixa", 2, "quando a Alexa falha, não se sabe se o comando chegou.", ["Último comando por ar no diagnóstico"], ["Diagnóstico mostra por ar"]),
    ("Cloudflare: alerta de expiração do domínio e do DNSSEC", "media", 2, "domínio vencido derruba tudo.", ["Consultar vencimento no Registro.br (manual) e avisar"], ["Aviso 60 dias antes"]),
    ("Resend: monitorar reputação e taxa de devolução", "baixa", 2, "e-mails para a Prefeitura já voltaram.", ["Taxa por domínio de destino", "Aviso acima de 5%"], ["Aviso disparado no teste"]),
]:
    ev(S, t, p, h, ["integração"], porque, fazer, pronto, "backend/app/")

S = "Segurança"
for t, p, h, porque, fazer, pronto in [
    ("Login por SSO da Prefeitura (se houver provedor institucional)", "media", 8, "contas @floripa poderiam entrar com o login da rede.", ["Levantar com a TI o provedor (Azure AD/Google Workspace)", "OAuth/OIDC no Supabase"], ["Entrada com a conta institucional"]),
    ("Revisão trimestral de acessos (quem ainda precisa de quê)", "media", 2, "acessos antigos ficam esquecidos.", ["Lista para o dono confirmar", "Remover o que não for confirmado"], ["Revisão registrada"]),
    ("Bloquear contas inativas há 90 dias", "baixa", 2, "conta parada é alvo fácil.", ["Desativar com aviso antes"], ["Contas inativas desativadas"]),
    ("Cabeçalhos de segurança conferidos no CI (CSP, HSTS)", "baixa", 2, "uma mudança no vercel.json pode tirar um cabeçalho.", ["Teste do /saude com os cabeçalhos"], ["CI falha sem os cabeçalhos"]),
]:
    ev(S, t, p, h, ["segurança"], porque, fazer, pronto, "backend/app/, vercel.json")

S = "Infra e dados"
for t, p, h, porque, fazer, pronto in [
    ("Cache das leituras mais frequentes (painel, notificações) no servidor", "media", 4, "a mesma consulta é feita por várias pessoas no mesmo minuto.", ["Cache curto por usuário e escopo", "Invalidar ao mudar"], ["Menos leituras no pg_stat_statements"]),
    ("Medir o tráfego do Supabase por dia na própria tela", "media", 3, "o Egress só aparece no site do Supabase.", ["Somar pelos logs da Management API no agente", "Gráfico em Supabase → Uso"], ["Gráfico diário do tráfego"]),
    ("Arquivar notificações antigas em tabela fria", "baixa", 2, "notificações acumulam e pesam no sino.", ["Mover as de mais de 30 dias"], ["Sino lê só as recentes"]),
    ("Plano de recuperação do agente principal (imagem do cartão do Pi)", "baixa", 2, "um cartão SD queimado para o escritório.", ["Imagem pronta e roteiro"], ["Pi novo em 30 minutos"]),
]:
    ev(S, t, p, h, ["infra"], porque, fazer, pronto, "backend/app/")

S = "Relatórios e energia"
for t, p, h, porque, fazer, pronto in [
    ("Relatório no modelo da Prefeitura com assinatura digital (ICP-Brasil)", "baixa", 6, "documentos oficiais pedem assinatura válida.", ["Assinar o PDF com certificado A1 do órgão"], ["PDF assinado e válido no verificador do ITI"]),
    ("Indicadores de eficiência para o PROCEL/ESPLANADA (consumo por servidor)", "baixa", 4, "programas de eficiência pedem indicadores padronizados.", ["Calcular kWh por servidor e por m²"], ["Indicadores no relatório anual"]),
]:
    ev(S, t, p, h, ["energia"], porque, fazer, pronto, "backend/app/relatorio.py")


def montar() -> list[dict]:
    itens = []
    for rota, nome, secao, arq, principal in TELAS:
        for chave, rot, prio, horas, etiq, porque, fazer, pronto, subs in FRENTES_TELA:
            p = ACIMA[prio] if principal and chave in ("e2e", "desempenho", "a11y") else prio
            itens.append({"secao": secao, "titulo": f"{nome}: {rot}", "prioridade": p, "horas": horas, "etiquetas": ["evolução", "tela", *etiq],
                          "descricao": descricao(porque, [x.format(rota=rota) for x in fazer], pronto, f"{arq} (rota {rota})"), "subs": subs})
    for arq, nome, secao in MODULOS:
        for chave, rot, prio, horas, etiq, porque, fazer, pronto, subs in FRENTES_MODULO:
            itens.append({"secao": secao, "titulo": f"Backend · {nome}: {rot}", "prioridade": prio, "horas": horas, "etiquetas": ["evolução", *etiq],
                          "descricao": descricao(porque.format(nome=nome), [x.format(arquivo=arq) for x in fazer], [x.format(arquivo=arq) for x in pronto], arq), "subs": subs})
    for app, onde in APPS:
        for funcao, prio, porque in FUNCOES_APP:
            itens.append({"secao": "Apps", "titulo": f"App {app}: {funcao}", "prioridade": prio, "horas": 4, "etiquetas": ["evolução", "apps", app.lower()],
                          "descricao": descricao(porque, [f"Tela ou atalho no app {app} usando as mesmas rotas do painel", "Mesmas permissões do servidor (nada decidido só no app)",
                                                          "Nova versão do app com release no GitHub e versao_apps.json (regra 9 do CLAUDE.md)"],
                                                 [f"Função disponível no app {app} e testada num aparelho real"], onde),
                          "subs": ["Tela no app", "Testar num aparelho real", "Release e aviso de versão"]})
    for secao, titulo, prio, horas, etiq, porque, fazer, pronto, onde in E:
        itens.append({"secao": secao, "titulo": titulo, "prioridade": prio, "horas": horas, "etiquetas": ["evolução", *etiq],
                      "descricao": descricao(porque, fazer, pronto, onde),
                      "subs": ["Detalhar a solução e o impacto", "Implementar e testar (1440 e 375 px, sem erro no console)", "Publicar com entrada em Novidades e atualizar Guia e CLAUDE.md"]})
    return itens


def main():
    simular = "--simular" in sys.argv
    itens = montar()
    titulos = [i["titulo"] for i in itens]
    repetidos = {t for t in titulos if titulos.count(t) > 1}
    print(f"{len(itens)} tarefas montadas ({len(TELAS) * len(FRENTES_TELA)} telas, {len(MODULOS) * len(FRENTES_MODULO)} backend, "
          f"{len(APPS) * len(FUNCOES_APP)} apps, {len(E)} de evolução); repetidas: {len(repetidos)}")
    if simular:
        return
    dono = db.um("SELECT * FROM usuarios WHERE papel = 'dono' LIMIT 1")
    u = {**dono, "id": str(dono["id"])}
    pid = tarefas.projeto_por_nome("Plano de melhorias", u)
    secoes = {r["nome"]: r["id"] for r in db.consultar("SELECT id, nome FROM tarefas_secoes WHERE projeto_id = ?", (pid,))}
    faltam = sorted({i["secao"] for i in itens} - set(secoes))
    if faltam:
        raise SystemExit(f"Seções que não existem no projeto: {faltam}")
    existentes = {r["titulo"] for r in db.consultar("SELECT titulo FROM tarefas WHERE projeto_id = ?", (pid,))}
    base = time.time()
    n = subs = 0
    for k, i in enumerate(itens):
        if i["titulo"] in existentes:
            continue
        prazo = (HOJE + timedelta(days=PRAZO_DIAS[i["prioridade"]] + (k % 21))).isoformat()
        r = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, responsavel_id, prioridade, etiquetas, estimativa_h, prazo, ordem, "
                  "criado_por, criado_em, atualizado_em) VALUES (?,?,?,?,CAST(? AS uuid),?,CAST(? AS jsonb),?,?,?,CAST(? AS uuid),?,?) RETURNING id",
                  (pid, secoes[i["secao"]], i["titulo"][:300], i["descricao"], u["id"], i["prioridade"], json.dumps(i["etiquetas"]), i["horas"], prazo,
                   base + 1000 + k, u["id"], db.agora(), db.agora()))
        for j, s in enumerate(i["subs"]):
            db.executar("INSERT INTO tarefas (projeto_id, secao_id, pai_id, titulo, responsavel_id, prioridade, ordem, criado_por, criado_em, atualizado_em) "
                        "VALUES (?,?,?,?,CAST(? AS uuid),'nenhuma',?,CAST(? AS uuid),?,?)",
                        (pid, secoes[i["secao"]], r["id"], s, u["id"], j, u["id"], db.agora(), db.agora()))
            subs += 1
        tarefas.evento(r["id"], u, "Criou a tarefa (plano de evolução)")
        n += 1
    print(f"Projeto {pid}: {n} tarefa(s) nova(s) e {subs} subtarefa(s)")


if __name__ == "__main__":
    main()
