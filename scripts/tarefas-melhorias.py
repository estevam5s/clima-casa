#!/usr/bin/env python3
"""Cria o projeto "Plano de melhorias" em Tarefas com as melhorias e funcionalidades novas propostas para o sistema,
todas atribuídas ao dono (aparecem em Tarefas → Minhas tarefas). Rodar de novo não duplica: pula títulos que já existem.

Uso: cd backend && ../.venv/bin/python ../scripts/tarefas-melhorias.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import db, tarefas  # noqa: E402

# (seção, título, prioridade, horas estimadas, etiquetas, descrição)
T = [
    # ---------------- Pendências de operação (do diário) ----------------
    ("Pendências de operação", "Deixar um agente sempre ligado na rede do escritório", "urgente", 2, ["agente", "operação"],
     "Sem agente no escritório nenhum comando chega aos ares. Ligar o PC do João (preferido) ou levar o Raspberry Pi para a rede dos transmissores e conferir em Infra → Agentes se enxerga N de N."),
    ("Pendências de operação", "Atualizar o agente do PC do João (roda versão antiga)", "alta", 1, ["agente"],
     "O PC do João não anuncia versão: rodar o instalador por código uma vez. Depois disso ele se atualiza sozinho."),
    ("Pendências de operação", "Trocar a fonte do Raspberry Pi pela oficial 5 V 2,5 A", "alta", 1, ["raspberry", "hardware"],
     "O agente já registrou subtensão. Fonte fraca derruba o Pi e o agente."),
    ("Pendências de operação", "Fazer o teste de interferência no salão com alguém presente", "alta", 1, ["zonas", "ares"],
     "Transmissores → Testar interferência. Grava as zonas reais (quem apita junto) no lugar das zonas automáticas."),
    ("Pendências de operação", "Comprar e instalar o transmissor C da Reunião", "media", 2, ["transmissor", "compra"],
     "O Ar da reunião está sem transmissor. Depois: cadastrar, copiar os botões (Gree) e colocar na Alexa."),
    ("Pendências de operação", "Ativar a skill Sinric Pro na Alexa nova e descobrir dispositivos", "media", 1, ["alexa"],
     "Integrações → Nova Alexa. Mesma conta do Sinric."),
    ("Pendências de operação", "Cadastrar a verificação em duas etapas do Deison (admin)", "alta", 1, ["segurança", "conformidade"],
     "Admin sem 2FA é o principal ponto aberto da conformidade. Depois disso dá para ligar exigir_2fa_admin."),
    ("Pendências de operação", "Testar a gravação no GitHub Projects de ponta a ponta", "media", 1, ["tarefas", "github"],
     "Ligar um projeto, criar uma tarefa no painel e conferir o rascunho no GitHub; mover de seção e conferir o Status."),
    ("Pendências de operação", "Testar importar repositório privado no Assistente de IA", "baixa", 1, ["ia", "github"],
     "Precisa do token de leitura em Apps com acesso ao repositório."),
    ("Pendências de operação", "Ligar a cópia local do backup no agente e conferir a pasta", "media", 1, ["backup"],
     "Backup → Cópia local. Conferir data/backups no computador do agente depois de 30 min."),
    ("Pendências de operação", "Pedir a liberação do domínio zynio.com.br na inspeção SSL da rede da Prefeitura", "media", 1, ["rede", "ti"],
     "Fortinet troca o certificado: login falha em algumas redes. Pedir à TI ou reclassificar no FortiGuard."),
    ("Pendências de operação", "Decidir sobre o plano Pro do Supabase antes de 22/12", "alta", 1, ["supabase", "custo"],
     "A cota de tráfego estourou em novembro. Acompanhar o uso em Supabase → Uso e decidir se migra."),
    ("Pendências de operação", "Configurar o User Management do Spotify", "baixa", 1, ["música"],
     "Sem isso o Spotify devolve 403 para contas que não são a do dono."),

    # ---------------- Ares e automação ----------------
    ("Ares e automação", "Modo economia: subir 1° em todos os ares ligados com um toque", "media", 4, ["ares", "energia"],
     "Botão no Painel e comando no Telegram. Respeita zonas e a política de temperatura."),
    ("Ares e automação", "Pré-resfriar a sala antes da reunião marcada na agenda", "media", 6, ["ares", "agenda"],
     "Ligar o ar da sala X minutos antes de um evento cadastrado."),
    ("Ares e automação", "Desligar sozinho quando a sala fica vazia (sensor de presença)", "baixa", 12, ["ares", "sensor"],
     "Integração com sensor de presença Tuya; precisa comprar o sensor."),
    ("Ares e automação", "Temperatura sugerida pela previsão do tempo de cada dia", "baixa", 4, ["ares", "clima"],
     "Usar clima_externo para sugerir 23° a 25° conforme a temperatura lá fora."),
    ("Ares e automação", "Histórico de estado por ar em gráfico (ligado, temperatura, modo)", "media", 6, ["ares", "relatórios"],
     "Linha do tempo visual no detalhe do ar, a partir da Atividade classificada (ligou/subiu/baixou)."),
    ("Ares e automação", "Agenda por sala além de por ar", "media", 5, ["agenda"],
     "Um horário que liga/desliga todos os ares de uma sala."),
    ("Ares e automação", "Copiar uma automação para outros ares", "baixa", 3, ["automações"], "Duplicar com outro alvo em um clique."),
    ("Ares e automação", "Avisar quando o ar não apitou (confirmação manual pelo celular)", "baixa", 6, ["ares"],
     "Botão 'não obedeceu' que registra a falha física e sugere reposicionar o transmissor."),
    ("Ares e automação", "Modo férias: pausar toda a agenda por um período", "media", 3, ["agenda"],
     "Já existem as datas de férias nas regras; falta um botão rápido no topo da Agenda."),
    ("Ares e automação", "Limite de temperatura por sala (além do geral)", "baixa", 4, ["ares", "política"],
     "Configurações → Geral tem a faixa geral; permitir uma faixa diferente por sala."),
    ("Ares e automação", "Cenas com espera entre passos", "baixa", 4, ["cenas"], "Ex.: liga o ar, espera 10 min, fecha as persianas."),

    # ---------------- Relatórios e energia ----------------
    ("Relatórios e energia", "Relatório semanal automático por e-mail para dono e admins", "media", 5, ["relatórios", "e-mail"],
     "Toda segunda às 8h, com o gasto e as horas da semana anterior."),
    ("Relatórios e energia", "Meta de gasto mensal com alerta ao chegar em 80%", "media", 4, ["energia"],
     "As salas já têm meta; falta a notificação e o aviso no Telegram."),
    ("Relatórios e energia", "Comparar o gasto com a conta de luz real (lançamento manual)", "baixa", 4, ["energia"],
     "Campo para lançar o valor da fatura e ver a diferença para a estimativa."),
    ("Relatórios e energia", "Relatório por pessoa: o que cada um ligou e por quanto tempo", "media", 5, ["relatórios", "pessoas"],
     "Agora que a Atividade guarda a pessoa (0.6.9), dá para somar horas por quem ligou."),
    ("Relatórios e energia", "Exportar o relatório da Prefeitura agendado no fim do mês", "baixa", 3, ["relatórios"], "PDF oficial enviado no último dia útil."),
    ("Relatórios e energia", "Estimativa de consumo com potência real medida por tomada inteligente", "baixa", 8, ["energia", "hardware"],
     "Tomada Tuya com medição no circuito do ar para calibrar a potência cadastrada."),
    ("Relatórios e energia", "Painel de economia: quanto a política de temperatura economizou", "baixa", 5, ["energia"],
     "Comparar horas e temperatura antes e depois de ligar a regra."),

    # ---------------- Logs e auditoria ----------------
    ("Logs e auditoria", "Alerta quando alguém fizer muitas mudanças em pouco tempo", "media", 3, ["logs", "segurança"],
     "Ex.: 30 comandos em 5 min por uma pessoa vira notificação."),
    ("Logs e auditoria", "Exportar os logs assinados (com o selo de integridade do dia)", "baixa", 4, ["logs", "conformidade"],
     "CSV com o hash SHA-256 do dia para auditoria externa."),
    ("Logs e auditoria", "Guardar o IP e o aparelho em cada ação do painel", "media", 3, ["logs"],
     "A Atividade guarda a pessoa; somar IP e navegador ajuda a investigar."),
    ("Logs e auditoria", "Retenção configurável da Atividade (hoje 90 dias)", "baixa", 3, ["logs", "banco"],
     "Mudar a rotina limpar_atividade para ler a retenção de Configurações → Geral."),
    ("Logs e auditoria", "Busca salva nos logs (filtros favoritos)", "baixa", 2, ["logs"], "Guardar combinações de filtro por pessoa."),
    ("Logs e auditoria", "Relatório mensal de auditoria em PDF", "baixa", 5, ["logs", "conformidade"],
     "Logins, mudanças de usuário, bloqueios e comandos por pessoa no mês."),

    # ---------------- Segurança ----------------
    ("Segurança", "Exigir 2FA para administradores (depois do Deison cadastrar)", "alta", 1, ["segurança"],
     "Ligar exigir_2fa_admin em Segurança e testar o fluxo."),
    ("Segurança", "Revisão trimestral de acessos com lembrete", "media", 3, ["segurança", "conformidade"],
     "Lembrete para conferir quem tem acesso a quê (A.5.18)."),
    ("Segurança", "Aprovar as minutas de política e termos com a direção", "media", 2, ["conformidade"],
     "Segurança → Conformidade → Documentos."),
    ("Segurança", "Bloquear login de país novo até confirmação por e-mail", "baixa", 6, ["segurança"],
     "Hoje só avisa; opção de segurar a entrada até confirmar."),
    ("Segurança", "Senha de uso único para a fechadura com validade", "baixa", 6, ["fechadura", "segurança"],
     "Depende do modelo da fechadura aceitar senhas temporárias pela nuvem."),
    ("Segurança", "Rodar pip-audit, npm audit e bandit antes de cada release grande", "media", 1, ["segurança", "processo"],
     "Checklist da seção 12 do CLAUDE.md; registrar o resultado no diário."),
    ("Segurança", "Rotacionar o token do bot do Telegram a cada 6 meses", "baixa", 1, ["segurança", "telegram"], "Lembrete na agenda do dono."),

    # ---------------- Telegram ----------------
    ("Telegram", "Teclado de atalhos fixo com os 6 comandos favoritos", "baixa", 3, ["telegram"], "Reply keyboard com os favoritos de cada pessoa."),
    ("Telegram", "Resumo diário às 18h no Telegram (opcional por pessoa)", "media", 4, ["telegram"],
     "Ares ligados, gasto do dia e o que ficou ligado."),
    ("Telegram", "Gráfico em imagem no Telegram (gasto da semana)", "baixa", 6, ["telegram", "relatórios"], "Gerar PNG no servidor e mandar como foto."),
    ("Telegram", "Comandos por voz no Telegram (áudio vira comando)", "baixa", 5, ["telegram", "ia"],
     "Reusar a transcrição da IA (modelo Omni) para mensagens de voz."),
    ("Telegram", "Alerta no Telegram quando um erro do bot vira bug", "baixa", 2, ["telegram", "bugs"], "Para o dono, uma vez por bug."),

    # ---------------- Painel e telas ----------------
    ("Painel e telas", "Reduzir o LCP do Painel abaixo de 2,5 s", "alta", 6, ["desempenho"],
     "Acessos e SEO → Desempenho mostra 3,6 s no /. Adiar o 3D compacto e as barras 3D."),
    ("Painel e telas", "Zerar o CLS do Painel, Novidades e Bugs", "alta", 4, ["desempenho"],
     "Reservar altura dos cartões que carregam depois (CLS 0,21 a 0,38)."),
    ("Painel e telas", "Trocar os window.confirm restantes pelo Modal", "media", 3, ["interface"],
     "grep -rn window.confirm frontend/src: ~25 pontos antigos."),
    ("Painel e telas", "Modo escuro automático por horário", "baixa", 2, ["interface"], "Além de seguir o sistema, trocar às 18h."),
    ("Painel e telas", "Atalhos de teclado em todas as listas (j/k para navegar)", "baixa", 4, ["interface"], "Começar pela Atividade e Bugs."),
    ("Painel e telas", "Tela de status público (sem login) para a equipe", "baixa", 5, ["interface"],
     "Só mostra se o sistema e o agente estão no ar, sem dados internos."),
    ("Painel e telas", "Personalizar os cartões do Painel por pessoa", "media", 8, ["interface", "painel"], "Arrastar, esconder e fixar cartões."),
    ("Painel e telas", "Busca global (Ctrl+K) em ares, salas, tarefas, bugs e logs", "media", 8, ["interface"],
     "Uma caixa só que procura em tudo o que a pessoa pode ver."),
    ("Painel e telas", "Acessibilidade: revisar contraste e rótulos com leitor de tela", "media", 6, ["acessibilidade"], "Começar pelo Painel, Login e Aparelhos."),
    ("Painel e telas", "Tradução do painel para inglês e espanhol", "baixa", 16, ["idiomas"], "Reusar o motor de idiomas do site."),

    # ---------------- Mapa 3D ----------------
    ("Mapa 3D", "Modo leve do mapa para celulares fracos", "media", 6, ["mapa", "desempenho"], "Sem cidade, sem sombras e sem pedestres."),
    ("Mapa 3D", "Mostrar no mapa quem ligou cada ar (último comando)", "baixa", 3, ["mapa", "logs"], "Cartão do ar com a pessoa e a hora."),
    ("Mapa 3D", "Calor por sala no mapa (temperatura dos ares ligados)", "baixa", 5, ["mapa"], "Piso colorido por temperatura escolhida."),
    ("Mapa 3D", "Reduzir o tráfego do mapa (modelos mais leves e cache)", "alta", 6, ["mapa", "supabase"],
     "O mapa foi a maior causa do estouro de cota; medir de novo e cortar o que sobrar."),
    ("Mapa 3D", "Editar a planta direto no 3D (arrastar móveis)", "baixa", 16, ["mapa"], "Hoje a edição é só no 2D."),

    # ---------------- Tarefas ----------------
    ("Tarefas", "Tarefas recorrentes (toda semana, todo mês)", "media", 5, ["tarefas"], "Ex.: limpar filtros dos ares todo mês."),
    ("Tarefas", "Dependências entre tarefas (bloqueada por)", "baixa", 6, ["tarefas"], "Mostrar no cronograma."),
    ("Tarefas", "Anexos nas tarefas (fotos do problema)", "media", 5, ["tarefas"], "Storage privado com link assinado."),
    ("Tarefas", "Lembrete de prazo por e-mail e Telegram", "media", 3, ["tarefas", "notificações"], "Um dia antes e no dia."),
    ("Tarefas", "Formulário para a equipe pedir manutenção do ar", "media", 6, ["tarefas", "ares"],
     "Pedido vira tarefa no projeto de manutenção com a sala e o ar."),
    ("Tarefas", "Manutenção preventiva dos ares (limpeza de filtro a cada 30 dias)", "media", 3, ["tarefas", "ares"],
     "Tarefa recorrente por ar com o histórico de quem fez."),

    # ---------------- Bugs e qualidade ----------------
    ("Bugs e qualidade", "Testes automáticos do backend (pytest) no CI", "alta", 16, ["qualidade", "ci"],
     "Hoje o CI só compila e audita. Começar por clima.aplicar, acesso e logs."),
    ("Bugs e qualidade", "Testes de ponta a ponta das telas principais no CI (Playwright)", "media", 16, ["qualidade", "ci"],
     "Login com sessão de teste, Painel, Aparelhos e Atividade."),
    ("Bugs e qualidade", "Checagem no-undef do frontend no CI", "media", 2, ["qualidade", "ci"],
     "A variável indefinida já deixou uma tela preta em 20/11."),
    ("Bugs e qualidade", "Bug com print da tela anexado automaticamente", "baixa", 5, ["bugs"], "html2canvas no relato do usuário."),
    ("Bugs e qualidade", "SLA por gravidade nos bugs (crítica em 24 h)", "baixa", 3, ["bugs"], "Prazo automático ao criar conforme a gravidade."),

    # ---------------- Apps ----------------
    ("Apps", "Widget do Android com os ares favoritos", "media", 10, ["android"], "Ligar e desligar sem abrir o app."),
    ("Apps", "Notificações push no app Android e iPhone", "media", 12, ["apps", "notificações"], "Expo Notifications para os avisos importantes."),
    ("Apps", "Tela de Logs e Atividade por pessoa nos apps", "media", 6, ["apps", "logs"], "Versão simples da tela nova da 0.6.9."),
    ("Apps", "Atalhos da Siri no iPhone (ligar o ar da sala)", "baixa", 8, ["ios"], "App Intents."),
    ("Apps", "Assinar o app de Mac e Windows para não aparecer aviso de segurança", "baixa", 4, ["desktop"], "Certificado Apple Developer e Authenticode."),
    ("Apps", "Login por QR code do painel para o app", "baixa", 5, ["apps", "login"], "Escanear no computador já logado."),

    # ---------------- Infra e dados ----------------
    ("Infra e dados", "Backup também fora do Supabase (VPS ou outra nuvem)", "media", 5, ["backup", "infra"],
     "Hoje a cópia fica no Supabase e no agente; uma terceira cópia em outro provedor."),
    ("Infra e dados", "Monitor externo do /saude com aviso no Telegram", "media", 3, ["infra"], "Ex.: a cada 5 min a partir da VPS."),
    ("Infra e dados", "Painel de custos mensais (Vercel, Supabase, Sinric, domínio)", "baixa", 4, ["infra", "custo"], "Lançamento manual com lembrete de renovação."),
    ("Infra e dados", "Arquivar a Atividade antiga em arquivo no Storage antes de apagar", "baixa", 4, ["banco", "logs"],
     "Guardar os registros com mais de 90 dias compactados em vez de só apagar."),
    ("Infra e dados", "Índices revisados com pg_stat_statements", "media", 3, ["banco", "desempenho"], "Consultas lentas nos logs e relatórios."),
    ("Infra e dados", "Renovar o plano manual do Sinric até 17/11/2027", "baixa", 1, ["alexa", "custo"], "Pagamento manual com lembrete."),

    # ---------------- Integrações ----------------
    ("Integrações", "Google Home testado com a conta do escritório", "baixa", 2, ["google"], "Hoje só a Alexa foi testada de verdade."),
    ("Integrações", "Integrar ao sistema de clima da PMF", "media", 12, ["integração", "pmf"],
     "Há uma proposta de integração com o sistema de clima da Prefeitura: levantar API e dados disponíveis."),
    ("Integrações", "Calendário do Google/Outlook para pré-resfriar salas", "baixa", 8, ["integração", "agenda"], "Ler eventos da sala de reunião."),
    ("Integrações", "Webhook de saída para eventos do sistema", "baixa", 6, ["integração"], "Mandar ligou/desligou para outro sistema (n8n)."),
    ("Integrações", "Sensores de temperatura e umidade das salas", "media", 8, ["sensor", "hardware"],
     "Sensor Tuya por sala: mostrar a temperatura real ao lado da escolhida."),

    # ---------------- Documentação e processo ----------------
    ("Documentação e processo", "Manual em PDF atualizado com as telas da 0.6.9", "media", 3, ["documentação"], "docs/MANUAL.md + docs/gerar-pdf.sh."),
    ("Documentação e processo", "Vídeo curto de como usar o Painel e o Telegram", "baixa", 4, ["documentação"], "Para novos usuários da equipe."),
    ("Documentação e processo", "Guia de primeiros passos para quem entra na equipe", "media", 2, ["documentação"], "Login, 2FA, vincular Telegram e o termo de uso."),
    ("Documentação e processo", "Registrar cada sessão de trabalho no diário (docs/continuar)", "media", 1, ["processo"], "Regra de ouro 8 do CLAUDE.md."),
    ("Documentação e processo", "Revisar o README com a arquitetura e os comandos atuais", "baixa", 2, ["documentação"], "Manter junto com o CLAUDE.md a cada versão."),

    # ---------------- Dispositivos ----------------
    ("Dispositivos", "Parear as tomadas e motores Smart Life das persianas", "media", 3, ["persianas", "hardware"],
     "As 12 persianas estão cadastradas sem aparelho: a tela diz 'sem aparelho conectado'."),
    ("Dispositivos", "Parear a cafeteira e criar a rotina do café da manhã", "baixa", 2, ["cafeteira"], "Ligar às 7h50 nos dias úteis."),
    ("Dispositivos", "Configurar a primeira placa própria (ESP32) para um dispositivo", "baixa", 4, ["placas", "hardware"], "Cafeteira ou luz de teste."),
    ("Dispositivos", "Fechar todas as persianas ao fim do expediente", "baixa", 2, ["persianas", "automações"], "Depois de pareadas, uma cena no horário."),
    ("Dispositivos", "Luzes apagam sozinhas quando o último ar da sala desliga", "baixa", 4, ["luzes", "automações"], "Automação com gatilho de desligar."),

    # ---------------- Assistente de IA ----------------
    ("Assistente de IA", "IA responde com gráfico quando a pergunta pede números", "baixa", 6, ["ia"], "Ex.: gasto por sala na semana."),
    ("Assistente de IA", "Resumo semanal escrito pela IA no Painel", "baixa", 4, ["ia", "relatórios"], "O que mudou, o que gastou e o que falhou."),
    ("Assistente de IA", "IA sugere zonas a partir do teste de interferência", "baixa", 5, ["ia", "zonas"], "Explicar em linguagem simples quem responde junto."),
    ("Assistente de IA", "Limite de uso da IA por pessoa com aviso", "media", 2, ["ia", "custo"], "Já existe limite geral; detalhar por pessoa."),

    # ---------------- Site ----------------
    ("Site", "Melhorar o LCP do site zynio.com.br nas páginas mais acessadas", "media", 4, ["site", "desempenho"], "Ver Acessos e SEO → Desempenho → Site."),
    ("Site", "Página de estudos de caso com números reais do escritório", "baixa", 4, ["site"], "Só com números conferidos nos relatórios."),
    ("Site", "Formulário de contato com anexo", "baixa", 3, ["site"], "Para quem quer mandar foto do ar ou planta."),
    ("Site", "Newsletter mensal com as novidades das versões", "baixa", 2, ["site", "newsletter"], "Montar a campanha a partir do novidades.json."),
]


def main():
    dono = db.um("SELECT * FROM usuarios WHERE papel = 'dono' LIMIT 1")
    u = {**dono, "id": str(dono["id"])}
    secoes = []
    for s, *_ in T:
        if s not in secoes:
            secoes.append(s)
    pid = tarefas.projeto_por_nome("Plano de melhorias", u, cor="#2563eb", descricao="Melhorias e funcionalidades novas propostas para o Clima Escritório, por área.",
                                   secoes=tuple(secoes))
    ids_secao = {r["nome"]: r["id"] for r in db.consultar("SELECT id, nome FROM tarefas_secoes WHERE projeto_id = ?", (pid,))}
    for s in secoes:
        if s not in ids_secao:
            ids_secao[s] = db.um("INSERT INTO tarefas_secoes (projeto_id, nome, ordem) VALUES (?, ?, ?) RETURNING id", (pid, s, len(ids_secao)))["id"]
    existentes = {r["titulo"] for r in db.consultar("SELECT titulo FROM tarefas WHERE projeto_id = ?", (pid,))}
    import json
    n = 0
    for i, (s, titulo, prio, horas, etiquetas, desc) in enumerate(T):
        if titulo in existentes:
            continue
        r = db.um("INSERT INTO tarefas (projeto_id, secao_id, titulo, descricao, responsavel_id, prioridade, etiquetas, estimativa_h, ordem, criado_por, criado_em, atualizado_em) "
                  "VALUES (?,?,?,?,CAST(? AS uuid),?,CAST(? AS jsonb),?,?,?,?,?) RETURNING id",
                  (pid, ids_secao[s], titulo, desc, u["id"], prio, json.dumps(etiquetas), horas, time.time() + i, u["id"], db.agora(), db.agora()))
        tarefas.evento(r["id"], u, "Criou a tarefa (plano de melhorias)")
        n += 1
    print(f"Projeto {pid}: {n} tarefa(s) nova(s), {len(T)} no plano, {len(secoes)} seções")


if __name__ == "__main__":
    main()
