"""Treinamento de segurança e conformidade com provas (rota /treinamento).

Banco com mais de mil perguntas, montado a partir de dados que dá para conferir (nada inventado):
- situações do dia a dia de segurança da informação e LGPD (escritas à mão, com explicação);
- ISO/IEC 27001:2022, Anexo A: número, tema (Organizacionais 5.x, Pessoas 6.x, Físicos 7.x, Tecnológicos 8.x) e o
  resumo de cada um dos 93 controles (os resumos são os do sistema, em conformidade.py, não o texto da norma);
- Estrutura Harmonizada (Anexo SL) das normas de sistema de gestão: as seções 4 a 10 e as subseções, valendo para
  ISO 9001, 14001, 45001, 27001, 22301, 50001, 37001, 37301, 42001 e 20000-1;
- catálogo de normas ISO: o foco de cada uma e se é certificável (só quando isso é claro).
A prova sorteia as perguntas no servidor e guarda quais foram (config, por usuário); a correção também é no servidor.
Ao terminar: nota na hora, acertos por trilha, gabarito com explicação e um e-mail com o resultado.
"""
from __future__ import annotations

import hashlib
import json
import random
import secrets
import time

from . import db

APROVACAO = 70
PROVAS = "treinamento_provas"   # config: {token: {usuario, ids, trilha, criado}} (sem segredo; vence em 3 h)
TEMAS = {"5": "Organizacionais", "6": "Pessoas", "7": "Físicos", "8": "Tecnológicos"}

# ----------------------------------------------------------------------------------- situações (escritas à mão)
SITUACOES = [
    ("Chegou um e-mail com o logo do sistema pedindo para entrar por um link e confirmar a senha. O que fazer?",
     ["Entrar e confirmar", "Não clicar; abrir o sistema digitando app.zynio.com.br e avisar o administrador", "Responder o e-mail com a senha", "Encaminhar para os colegas"], 1,
     "É phishing típico: o sistema nunca pede senha por e-mail. Abra o endereço digitando e avise quem cuida da segurança."),
    ("Um colega pediu o seu código de duas etapas para ligar o ar da sala dele.", ["Passar o código", "Não passar: cada pessoa usa a própria conta e o próprio acesso", "Passar só desta vez", "Mandar por mensagem"], 1,
     "O código de duas etapas é pessoal. Compartilhar quebra a rastreabilidade e o controle de acesso (ISO 27001 5.16, 5.17)."),
    ("Você vai sair da mesa por alguns minutos com o painel aberto.", ["Deixar como está", "Bloquear a tela (Windows+L ou Ctrl+Cmd+Q)", "Diminuir o brilho", "Fechar só a aba"], 1,
     "Tela bloqueada é o controle 7.7 (mesa limpa e tela limpa)."),
    ("Onde ficam as chaves e senhas do sistema (.env)?", ["Num e-mail para não perder", "Só no computador do agente e cifradas no servidor; nunca em chat, e-mail ou repositório", "Numa planilha compartilhada", "No grupo da equipe"], 1,
     "Segredo fora do lugar certo vaza. Se vazar, a chave é trocada na hora."),
    ("O ar de uma sala ligou sozinho de madrugada e ninguém agendou.", ["Ignorar", "Registrar como possível incidente e avisar o responsável", "Apagar o histórico", "Desligar e não falar nada"], 1,
     "Evento sem explicação vira registro de incidente (5.24 a 5.28). Nunca se apaga a trilha."),
    ("Qual senha é mais segura?", ["Nome do filho e o ano", "Uma frase longa e única para este sistema, guardada num gerenciador de senhas", "A mesma de outros sites com um número no fim", "123456 com um símbolo"], 1,
     "Comprimento e exclusividade importam mais que símbolos. Reaproveitar senha é o que mais causa invasão."),
    ("O código de instalação do agente (Raspberry/PC) vale por quanto tempo e quantas vezes?", ["Para sempre", "30 minutos, uma vez só", "Um dia, quantas vezes quiser", "Uma semana"], 1,
     "É de uso único e curto de propósito: se alguém copiar depois, já não vale."),
    ("Encontrou um pendrive no estacionamento com a etiqueta 'Salários'.", ["Ligar no computador do escritório para ver de quem é", "Não ligar; entregar à TI", "Ligar no computador de casa", "Formatar e usar"], 1,
     "Pendrive achado é isca clássica para instalar programa malicioso."),
    ("Alguém de fora pediu, por telefone, a lista de usuários dizendo ser do suporte.", ["Mandar por e-mail", "Recusar e confirmar a identidade pelo canal oficial antes de qualquer coisa", "Ler a lista pelo telefone", "Mandar só os nomes"], 1,
     "Engenharia social. Dados pessoais só saem com base legal e pelo canal oficial (LGPD)."),
    ("Destrancar a porta do escritório pelo sistema exige o quê?", ["Nada", "Ser dono ou administrador e confirmar", "Só estar logado", "Estar no Wi-Fi"], 1,
     "Ação física sensível pede papel alto e confirmação."),
    ("Recebeu um link de documento compartilhado de um remetente desconhecido pedindo login.", ["Entrar com a senha do trabalho", "Não entrar; conferir com quem mandou por outro canal", "Entrar pelo celular", "Encaminhar para a TI e entrar mesmo assim"], 1,
     "Página falsa de login é o golpe mais comum. Confira por outro canal."),
    ("Um visitante pede para usar o seu computador 'só para imprimir uma coisa'.", ["Deixar com a sua conta aberta", "Não deixar usar a sua conta; indicar o meio de impressão de visitantes", "Deixar e ficar olhando", "Emprestar a senha"], 1,
     "A sua conta registra tudo como se fosse você."),
    ("Qual é o jeito certo de descartar um HD antigo do escritório?", ["Jogar no lixo comum", "Apagar com ferramenta segura ou destruir, e registrar o descarte", "Vender sem formatar", "Formatar rápido"], 1,
     "Descarte seguro é o controle 7.14; formatar rápido não apaga os dados de verdade."),
    ("Você percebeu que mandou um relatório com dados pessoais para a pessoa errada.", ["Esperar ninguém perceber", "Avisar na hora o responsável para avaliar o incidente (pode exigir comunicar a ANPD)", "Apagar da sua caixa de saída", "Pedir para a pessoa apagar e pronto"], 1,
     "Incidente com dado pessoal pode exigir comunicação à ANPD e aos titulares (LGPD art. 48)."),
    ("O que fazer ao trocar de função e não precisar mais de um acesso?", ["Manter por garantia", "Pedir para retirar o acesso que não usa mais", "Passar para um colega", "Nada"], 1,
     "Menor privilégio (8.2) e revisão de acessos (5.18)."),
    ("Wi-Fi público do aeroporto: posso abrir o painel?", ["Sim, sem cuidado", "Sim pelo endereço com HTTPS e cadeado, sem salvar senha em computador público; o ideal é a rede do celular", "Não existe risco", "Só se desligar o antivírus"], 1,
     "O painel usa HTTPS, mas rede pública e computador alheio aumentam o risco."),
    ("Seu celular com o app do sistema foi roubado.", ["Comprar outro e seguir", "Encerrar as sessões em Perfil → Sessões e trocar a senha; avisar o administrador", "Esperar alguém achar", "Só bloquear o chip"], 1,
     "Encerrar sessões corta o acesso do aparelho perdido."),
    ("Um fornecedor pede acesso de administrador 'para configurar mais rápido'.", ["Dar acesso de dono", "Dar só o acesso necessário, por tempo limitado, e registrar", "Mandar a sua senha", "Recusar sem conversar"], 1,
     "Acesso de terceiros: mínimo necessário, com prazo e registro (5.19 a 5.22)."),
    ("Atualização de segurança do sistema operacional apareceu no meio do expediente.", ["Adiar para sempre", "Instalar assim que der (ou no fim do dia), sem ignorar", "Desligar as atualizações", "Só atualizar o navegador"], 1,
     "Gestão de vulnerabilidades técnicas é o controle 8.8."),
    ("Qual destas é uma boa prática de backup?", ["Uma cópia só, no mesmo computador", "Cópias regulares, uma fora do local, e teste de restauração", "Copiar uma vez por ano", "Backup só quando der problema"], 1,
     "Backup sem teste de restauração não garante nada (8.13)."),
    ("LGPD: o que é dado pessoal sensível?", ["Nome e e-mail", "Origem racial, convicção religiosa, opinião política, saúde, vida sexual, dado genético ou biométrico", "CPF", "Endereço comercial"], 1,
     "Definição do art. 5º, II, da LGPD."),
    ("LGPD: quem é o encarregado (DPO)?", ["Quem vende os dados", "A pessoa indicada pelo controlador para ser o canal com os titulares e a ANPD", "O titular", "O fornecedor de TI"], 1,
     "Art. 5º, VIII, e art. 41 da LGPD."),
    ("LGPD: em quanto tempo responder o pedido de confirmação de existência de dados em formato simplificado?", ["Imediatamente", "Até 30 dias", "Até 15 dias quando em formato completo; simplificado, de imediato", "Não há prazo"], 0,
     "Art. 19: formato simplificado de imediato; declaração completa em até 15 dias."),
    ("LGPD: qual destas é uma base legal para tratar dados pessoais?", ["Curiosidade", "Cumprimento de obrigação legal ou regulatória", "Interesse do vendedor", "Pedido de qualquer pessoa"], 1,
     "Art. 7º lista as bases legais (consentimento, obrigação legal, execução de contrato, legítimo interesse…)."),
    ("Qual atitude ajuda a evitar ransomware?", ["Abrir anexos de remetentes desconhecidos", "Desconfiar de anexos e links, manter atualizações e ter backup fora do computador", "Usar administrador no dia a dia", "Desligar o antivírus"], 1,
     "Ransomware entra por anexo/link e por falha não corrigida; backup separado é o que salva."),
]

# ----------------------------------------------------------------------------------- Estrutura Harmonizada (Anexo SL)
HS = [
    ("4", "Contexto da organização", [("4.1", "Entendendo a organização e seu contexto"), ("4.2", "Necessidades e expectativas das partes interessadas"),
                                       ("4.3", "Escopo do sistema de gestão"), ("4.4", "Sistema de gestão")]),
    ("5", "Liderança", [("5.1", "Liderança e comprometimento"), ("5.2", "Política"), ("5.3", "Papéis, responsabilidades e autoridades")]),
    ("6", "Planejamento", [("6.1", "Ações para abordar riscos e oportunidades"), ("6.2", "Objetivos e planejamento para alcançá-los"), ("6.3", "Planejamento de mudanças")]),
    ("7", "Apoio", [("7.1", "Recursos"), ("7.2", "Competência"), ("7.3", "Conscientização"), ("7.4", "Comunicação"), ("7.5", "Informação documentada")]),
    ("8", "Operação", [("8.1", "Planejamento e controle operacionais")]),
    ("9", "Avaliação de desempenho", [("9.1", "Monitoramento, medição, análise e avaliação"), ("9.2", "Auditoria interna"), ("9.3", "Análise crítica pela direção")]),
    ("10", "Melhoria", [("10.1", "Melhoria contínua"), ("10.2", "Não conformidade e ação corretiva")]),
]
# só onde a numeração confere com a Estrutura Harmonizada de 2021 (6.3 Planejamento de mudanças; 10.1 Melhoria contínua,
# 10.2 Não conformidade). A ISO 9001:2015, 14001:2015, 45001:2018, 22301:2019 e outras seguem a versão anterior do Anexo SL.
NORMAS_HS = ["Estrutura Harmonizada (Anexo SL, Diretivas ISO 2021)", "ISO/IEC 27001:2022 (segurança da informação)",
             "ISO/IEC 42001:2023 (inteligência artificial)", "ISO 37301:2021 (compliance)"]
EXTRAS_27001 = [("6.1.1", "Generalidades (ações para abordar riscos)", "6", "Planejamento"), ("6.1.2", "Avaliação de riscos de segurança da informação", "6", "Planejamento"),
                ("6.1.3", "Tratamento de riscos de segurança da informação", "6", "Planejamento"), ("8.2", "Avaliação de riscos de segurança da informação (execução)", "8", "Operação"),
                ("8.3", "Tratamento de riscos de segurança da informação (execução)", "8", "Operação")]

# ----------------------------------------------------------------------------------- catálogo de normas (foco, certificável?)
NORMAS = [
    ("ISO 9001", "Sistema de gestão da qualidade", True), ("ISO 14001", "Sistema de gestão ambiental", True),
    ("ISO 45001", "Sistema de gestão de saúde e segurança ocupacional", True), ("ISO/IEC 27001", "Sistema de gestão da segurança da informação (SGSI)", True),
    ("ISO/IEC 27002", "Guia de controles de segurança da informação", False), ("ISO/IEC 27005", "Gestão de riscos de segurança da informação", False),
    ("ISO/IEC 27017", "Controles de segurança para serviços em nuvem", None), ("ISO/IEC 27018", "Proteção de dados pessoais em nuvem pública", None),
    ("ISO/IEC 27701", "Gestão da privacidade da informação (extensão da 27001 e 27002)", True), ("ISO/IEC 27035", "Gestão de incidentes de segurança da informação", False),
    ("ISO/IEC 27032", "Diretrizes de cibersegurança", False), ("ISO/IEC 27031", "Prontidão da TIC para a continuidade de negócios", False),
    ("ISO/IEC 27037", "Identificação, coleta e preservação de evidência digital", False), ("ISO/IEC 27400", "Segurança e privacidade em IoT (diretrizes)", False),
    ("ISO/IEC 29100", "Estrutura (framework) de privacidade", False), ("ISO 22301", "Sistema de gestão de continuidade de negócios", True),
    ("ISO/IEC 20000-1", "Sistema de gestão de serviços de TI", True), ("ISO 31000", "Gestão de riscos: diretrizes", False),
    ("ISO 37001", "Sistema de gestão antissuborno", True), ("ISO 37301", "Sistema de gestão de compliance", True),
    ("ISO 50001", "Sistema de gestão de energia", True), ("ISO 22000", "Sistema de gestão da segurança de alimentos", True),
    ("ISO 26000", "Responsabilidade social (diretrizes)", False), ("ISO 19011", "Diretrizes para auditoria de sistemas de gestão", False),
    ("ISO 13485", "Sistema de gestão da qualidade para dispositivos médicos", True), ("ISO 21001", "Sistema de gestão para organizações educacionais", True),
    ("ISO 41001", "Sistema de gestão de facilities", True), ("ISO 55001", "Sistema de gestão de ativos", True),
    ("ISO 10002", "Tratamento de reclamações (diretrizes)", False), ("ISO 22316", "Resiliência organizacional (princípios)", False),
    ("ISO/IEC 42001", "Sistema de gestão de inteligência artificial", True), ("ISO/IEC 23894", "Gestão de riscos em inteligência artificial (orientações)", False),
    ("ISO/IEC 38500", "Governança de TI na organização", False), ("ISO/IEC 25010", "Modelo de qualidade de software e sistemas", None),
    ("ISO/IEC/IEEE 12207", "Processos do ciclo de vida de software", None), ("ISO/IEC 15408", "Critérios comuns para avaliação de segurança de produtos de TI", None),
    ("ISO 8000", "Qualidade de dados", None), ("ISO 30301", "Sistema de gestão de registros (documentos)", True),
]

TRILHAS = {
    "geral": ("Segurança no dia a dia e LGPD", "Situações reais do escritório, golpes, senhas, incidentes e LGPD"),
    "anexo_a": ("ISO/IEC 27001:2022 · Anexo A", "Os 93 controles: número, tema e o que cada um trata"),
    "estrutura": ("Estrutura Harmonizada das normas ISO", "Seções 4 a 10 do Anexo SL (2021), da ISO/IEC 27001:2022, 42001:2023 e 37301:2021"),
    "normas": ("Catálogo de normas ISO", "Para que serve cada norma e quais são certificáveis"),
    "completo": ("Simulado completo", "Mistura de todas as trilhas"),
}


def _id(texto: str) -> str:
    return hashlib.sha1(texto.encode()).hexdigest()[:12]


def _q(trilha, texto, opcoes, certa, explicacao, rnd):
    """Embaralha as opções de forma estável (a mesma pergunta sai sempre igual) e devolve a pergunta pronta."""
    idx = list(range(len(opcoes)))
    rnd.shuffle(idx)
    return {"id": _id(trilha + texto), "trilha": trilha, "texto": texto, "opcoes": [opcoes[i] for i in idx], "certa": idx.index(certa), "explicacao": explicacao}


def _banco() -> dict[str, dict]:
    from .conformidade import CONTROLES
    rnd = random.Random(2026)
    qs = []
    for t, o, c, e in SITUACOES:
        qs.append(_q("geral", t, o, c, e, rnd))
    # Anexo A
    ctr = [(i, TEMAS[i.split(".")[0]], tit) for i, _, tit, *_ in CONTROLES]
    for i, tema, tit in ctr:
        outros = [x for x in ctr if x[0] != i]
        mesmos_tema = [x for x in outros if x[1] == tema] or outros
        qs.append(_q("anexo_a", f"Na ISO/IEC 27001:2022, o controle {i} ('{tit}') pertence a qual tema do Anexo A?",
                     list(TEMAS.values()), list(TEMAS.values()).index(tema), f"Os controles {i.split('.')[0]}.x são do tema {tema} (5 Organizacionais, 6 Pessoas, 7 Físicos, 8 Tecnológicos).", rnd))
        dist = rnd.sample(mesmos_tema, min(3, len(mesmos_tema)))
        qs.append(_q("anexo_a", f"Qual é o número do controle do Anexo A que trata de: '{tit}'?", [i] + [d[0] for d in dist], 0,
                     f"É o controle {i} ({tema}).", rnd))
        dist2 = rnd.sample(outros, 3)
        qs.append(_q("anexo_a", f"O que trata o controle {i} do Anexo A da ISO/IEC 27001:2022 (resumo)?", [tit] + [d[2] for d in dist2], 0,
                     f"{i}: {tit}.", rnd))
        falso = rnd.choice([x for x in TEMAS.values() if x != tema])
        verdade = rnd.random() < 0.5
        qs.append(_q("anexo_a", f"Verdadeiro ou falso: o controle {i} ('{tit}') é do tema {tema if verdade else falso}.", ["Verdadeiro", "Falso"], 0 if verdade else 1,
                     f"{i} é do tema {tema}.", rnd))
    for k, (i, tema, tit) in enumerate(ctr):
        do_tema = [x for x in ctr if x[1] == tema and x[0] != i]
        fora = [x for x in ctr if x[1] != tema]
        if fora:
            d = rnd.sample(fora, 3)
            qs.append(_q("anexo_a", f"Qual destes controles do Anexo A é do tema {tema}?", [f"{i} · {tit}"] + [f"{x[0]} · {x[2]}" for x in d], 0, f"{i} é {tema}; os outros são de outros temas.", rnd))
        if k + 1 < len(ctr):
            prox = ctr[k + 1]
            d = rnd.sample([x for x in ctr if x[0] not in (i, prox[0])], 3)
            qs.append(_q("anexo_a", f"No Anexo A, qual controle vem logo depois do {i} ('{tit}')?", [f"{prox[0]} · {prox[2]}"] + [f"{x[0]} · {x[2]}" for x in d], 0,
                         f"A sequência é {i} → {prox[0]}.", rnd))
        outro = rnd.choice([x for x in ctr if x[0] != i])
        v = rnd.random() < 0.5
        qs.append(_q("anexo_a", f"Verdadeiro ou falso: o controle {i} do Anexo A trata de '{tit if v else outro[2]}'.", ["Verdadeiro", "Falso"], 0 if v else 1, f"{i}: {tit}.", rnd))
        if do_tema and len(fora) >= 1:
            d = rnd.sample(do_tema, min(3, len(do_tema)))
            if len(d) == 3:
                f0 = rnd.choice(fora)
                qs.append(_q("anexo_a", f"Qual destes controles NÃO é do tema {tema}?", [f"{f0[0]} · {f0[2]}"] + [f"{x[0]} · {x[2]}" for x in d], 0, f"{f0[0]} é do tema {f0[1]}.", rnd))
    contagem = {t: sum(1 for x in ctr if x[1] == t) for t in TEMAS.values()}
    for tema, n in contagem.items():
        erradas = sorted({n + 3, max(1, n - 4), n + 9} - {n})[:3]
        qs.append(_q("anexo_a", f"Quantos controles do Anexo A da ISO/IEC 27001:2022 são do tema {tema}?", [str(n)] + [str(e) for e in erradas], 0, f"O tema {tema} tem {n} controles.", rnd))
    qs.append(_q("anexo_a", "Quantos controles tem o Anexo A da ISO/IEC 27001:2022?", ["93", "114", "133", "35"], 0, "A versão 2022 tem 93 controles (a de 2013 tinha 114).", rnd))
    qs.append(_q("anexo_a", "Em quantos temas a ISO/IEC 27001:2022 agrupa os controles do Anexo A?", ["4", "14", "7", "10"], 0, "Organizacionais, Pessoas, Físicos e Tecnológicos.", rnd))
    # Estrutura Harmonizada
    subs = [(n, t, sec, titsec) for sec, titsec, lst in HS for n, t in lst]
    for norma in NORMAS_HS:
        lista = subs + (EXTRAS_27001 if "27001" in norma else [])
        for n, t, sec, titsec in lista:
            falso = rnd.choice([x for x in subs if x[0] != n])
            verdade = rnd.random() < 0.5
            qs.append(_q("estrutura", f"Verdadeiro ou falso: na {norma}, a subseção {n} é '{t if verdade else falso[1]}'.", ["Verdadeiro", "Falso"], 0 if verdade else 1,
                         f"{n} é '{t}'.", rnd))
            dist = rnd.sample([x for x in lista if x[0] != n], 3)
            qs.append(_q("estrutura", f"Na {norma}, a subseção {n} trata de:", [t] + [d[1] for d in dist], 0, f"{n} é '{t}', na seção {sec} ({titsec}).", rnd))
            qs.append(_q("estrutura", f"Na {norma}, em qual seção está '{t}'?", [f"{sec} · {titsec}"] + [f"{s} · {ts}" for s, ts, _ in rnd.sample([h for h in HS if h[0] != sec], 3)], 0,
                         f"'{t}' é a subseção {n}, da seção {sec} ({titsec}).", rnd))
    for sec, titsec, lst in HS:
        dist = rnd.sample([h for h in HS if h[0] != sec], 3)
        qs.append(_q("estrutura", f"Na Estrutura Harmonizada das normas ISO de sistema de gestão, a seção {sec} é:", [titsec] + [d[1] for d in dist], 0, f"Seção {sec}: {titsec}.", rnd))
    qs.append(_q("estrutura", "O ciclo por trás da Estrutura Harmonizada é:", ["PDCA (planejar, fazer, checar, agir)", "DMAIC", "5S", "Kanban"], 0, "As seções 6 (P), 8 (D), 9 (C) e 10 (A) seguem o PDCA.", rnd))
    # catálogo de normas
    for n, foco, cert in NORMAS:
        outros = [x for x in NORMAS if x[0] != n]
        d = rnd.sample(outros, 3)
        qs.append(_q("normas", f"Qual é o foco da {n}?", [foco] + [x[1] for x in d], 0, f"{n}: {foco}.", rnd))
        qs.append(_q("normas", f"Qual norma trata de: {foco.lower()}?", [n] + [x[0] for x in d], 0, f"É a {n}.", rnd))
        o = rnd.choice(outros)
        v = rnd.random() < 0.5
        qs.append(_q("normas", f"Verdadeiro ou falso: a {n} trata de {(foco if v else o[1]).lower()}.", ["Verdadeiro", "Falso"], 0 if v else 1, f"{n}: {foco}.", rnd))
        if cert is not None:
            qs.append(_q("normas", f"A {n} ({foco.lower()}) é uma norma certificável?", ["Sim, a organização pode ser certificada", "Não, é uma diretriz/guia"], 0 if cert else 1,
                         f"{n} {'tem requisitos e é certificável' if cert else 'é diretriz: orienta, mas não certifica'}.", rnd))
    return {q["id"]: q for q in qs}


_CACHE: dict = {}


def banco() -> dict[str, dict]:
    if not _CACHE:
        _CACHE.update(_banco())
    return _CACHE


def resumo() -> dict:
    b = banco()
    por = {}
    for q in b.values():
        por[q["trilha"]] = por.get(q["trilha"], 0) + 1
    return {"total": len(b), "por_trilha": por, "trilhas": [{"id": k, "nome": n, "descricao": d, "perguntas": por.get(k, len(b) if k == "completo" else 0)} for k, (n, d) in TRILHAS.items()]}


def iniciar(uid: str, trilha: str, quantidade: int) -> dict:
    if trilha not in TRILHAS:
        raise ValueError("Trilha inválida.")
    quantidade = max(5, min(100, int(quantidade)))
    b = banco()
    pool = [q for q in b.values() if trilha == "completo" or q["trilha"] == trilha]
    if trilha == "completo":   # equilibra as trilhas no simulado
        grupos = {}
        for q in pool:
            grupos.setdefault(q["trilha"], []).append(q)
        escolhidas, i = [], 0
        listas = [random.sample(g, len(g)) for g in grupos.values()]
        while len(escolhidas) < quantidade and any(listas):
            lst = listas[i % len(listas)]
            if lst:
                escolhidas.append(lst.pop())
            i += 1
    else:
        escolhidas = random.sample(pool, min(quantidade, len(pool)))
    token = secrets.token_urlsafe(12)
    p = {k: v for k, v in (db.cfg(PROVAS) or {}).items() if v.get("criado", 0) > time.time() - 3 * 3600}
    p[token] = {"usuario": uid, "ids": [q["id"] for q in escolhidas], "trilha": trilha, "criado": int(time.time())}
    db.set_cfg(PROVAS, p)
    return {"prova": token, "trilha": trilha, "nome": TRILHAS[trilha][0],
            "perguntas": [{"id": q["id"], "trilha": q["trilha"], "texto": q["texto"], "opcoes": q["opcoes"]} for q in escolhidas]}


def corrigir(uid: str, token: str, respostas: dict[str, int], u: dict) -> dict:
    todas = db.cfg(PROVAS) or {}
    p = todas.pop(token, None)
    if not p or p["usuario"] != uid:
        raise ValueError("Esta prova não existe ou já foi corrigida. Comece outra.")
    db.set_cfg(PROVAS, todas)
    b = banco()
    itens, acertos, por = [], 0, {}
    for qid in p["ids"]:
        q = b.get(qid)
        if not q:
            continue
        r = respostas.get(qid, -1)
        ok = r == q["certa"]
        acertos += ok
        t = por.setdefault(q["trilha"], [0, 0]); t[0] += ok; t[1] += 1
        itens.append({"id": qid, "texto": q["texto"], "opcoes": q["opcoes"], "resposta": r, "certa": q["certa"], "ok": ok, "explicacao": q["explicacao"], "trilha": q["trilha"]})
    total = len(itens) or 1
    nota = round(acertos / total * 100)
    aprovado = nota >= APROVACAO
    curso = f"treino-{p['trilha']}"
    db.executar("INSERT INTO treinamentos (usuario_id, curso, nota, aprovado, concluido_em) VALUES (?, ?, ?, ?, ?)", (uid, curso, nota, 1 if aprovado else 0, db.agora()))
    db.registrar("sistema", f"Treinamento ({TRILHAS[p['trilha']][0]}): {'aprovado' if aprovado else 'refazer'}", detalhe=f"{u.get('email', '')} · {nota}% ({acertos}/{total})")
    resultado = {"nota": nota, "aprovado": aprovado, "acertos": acertos, "total": total, "trilha": p["trilha"], "nome": TRILHAS[p["trilha"]][0],
                 "por_trilha": [{"trilha": k, "nome": TRILHAS.get(k, (k,))[0], "acertos": a, "total": n, "pct": round(a / n * 100)} for k, (a, n) in por.items()],
                 "itens": itens, "email": None}
    # e-mail com a nota (não derruba a correção se falhar)
    try:
        from . import correio
        if u.get("email") and correio.configurado():
            correio.enviar(u["email"], "treinamento", {"nome": u.get("nome") or "", "nota": nota, "aprovado": aprovado, "acertos": acertos, "total": total,
                                                        "trilha": TRILHAS[p["trilha"]][0], "por_trilha": [(x["nome"], f"{x['acertos']}/{x['total']} ({x['pct']}%)") for x in resultado["por_trilha"]]})
            resultado["email"] = u["email"]
    except Exception as e:  # noqa: BLE001
        resultado["email_erro"] = str(e)[:160]
    return resultado


def historico(uid: str) -> list[dict]:
    return db.consultar("SELECT curso, nota, aprovado, concluido_em FROM treinamentos WHERE usuario_id = ? ORDER BY concluido_em DESC LIMIT 30", (uid,))


def ranking() -> list[dict]:
    """Melhor nota de cada pessoa no último ano (para o dono/admin acompanhar a conformidade 6.3)."""
    return db.consultar("SELECT u.nome, u.email, max(t.nota) AS melhor, count(*) AS provas, max(t.concluido_em) AS ultima, bool_or(t.aprovado = 1) AS aprovado "
                        "FROM treinamentos t JOIN usuarios u ON u.id::text = t.usuario_id::text WHERE t.concluido_em > ? GROUP BY u.nome, u.email ORDER BY melhor DESC",
                        (db.agora() - 365 * 86400,))


def _json(o):
    return json.dumps(o, ensure_ascii=False)
