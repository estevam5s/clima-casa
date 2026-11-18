"""Documentos do sistema de gestão de segurança (ISO/IEC 27001) no modelo oficial da Prefeitura (brasão, cabeçalho
"Estado de Santa Catarina / Prefeitura Municipal de Florianópolis", seções "1 – …" / "1.1 – …").

São MINUTAS montadas com os fatos deste sistema (o que ele faz de verdade, quem são os fornecedores, como se responde a
um incidente). Nada aqui vira "implementado" sozinho: a direção revisa, aprova e assina; depois o administrador marca o
controle na aba Conformidade com a evidência (ex.: "Política aprovada em dd/mm, assinada por …").
"""
from __future__ import annotations

import html
import io

from . import db
from .relatorio import AZUL_PMF, _brasao, _cabecalho_oficial, _data, _data_extenso

# bloco: str (parágrafo) | ("lista", [str]) | ("tabela", [cab], [[...]])
Secao = tuple[str, list]


def _papeis() -> list[list[str]]:
    from . import acesso
    n = {r["papel"]: r["n"] for r in db.consultar("SELECT papel, count(*) n FROM usuarios WHERE ativo GROUP BY papel")}
    desc = {k: v[1] for k, v in getattr(acesso, "PERMISSOES", {}).items()}
    def perms(p):
        lista = p.get("permissoes") or []
        if set(lista) >= set(acesso.TODAS):
            return "Todas as permissões"
        return "; ".join(desc.get(x, x) for x in sorted(lista))[:700] or "Definidas por conta"
    return [[p["rotulo"], perms(p), str(n.get(k, 0))] for k, p in acesso.PAPEIS.items()]


FORNECEDORES = [
    ["Vercel", "Hospeda o painel e a API (nuvem)", "Contas, comandos, registros", "TLS; segredos só em variáveis do servidor"],
    ["Supabase", "Banco de dados, login e cópias", "Todos os dados do sistema", "TLS verificado; RLS em todas as tabelas; backup diário"],
    ["Cloudflare", "DNS, e-mail recebido e anti-robô (Turnstile)", "Domínio, e-mails recebidos", "DNSSEC; token só no agente"],
    ["Tuya / Smart Life", "Pareamento dos transmissores infravermelho", "Chaves dos transmissores", "Chave local cifrada no banco"],
    ["Sinric Pro", "Ponte com Alexa e Google", "Nomes e estado dos ares", "Credenciais cifradas; assinatura das mensagens"],
    ["Resend", "Envio de e-mails do sistema", "E-mail e nome do destinatário", "Domínio verificado (DKIM); webhook assinado"],
    ["Spotify", "Música nas rotinas (opcional)", "Conta de música conectada", "Token cifrado"],
    ["GitHub", "Código-fonte (repositório privado)", "Código, sem segredos", "Segredos fora do Git"],
    ["Open-Meteo / OpenStreetMap", "Previsão do tempo e mapa da ilha", "Nenhum dado pessoal", "Só consulta pública"],
]


def _catalogo() -> dict[str, tuple[str, list[Secao]]]:
    marca = (db.cfg("white_label") or {}).get("nome") or "Clima Escritório"
    return {
        "politica-seguranca": ("Política de Segurança da Informação", [
            ("Objetivo", [f"Estabelecer as regras para proteger as informações e o funcionamento do sistema {marca}, que controla os "
                          "ares-condicionados das salas por infravermelho, a partir do painel web, dos aplicativos e dos assistentes de voz."]),
            ("Escopo", ["Painel web e API, aplicativos (celular e computador), agentes instalados nos computadores do escritório (inclusive "
                        "Raspberry Pi), transmissores infravermelho, banco de dados e serviços de terceiros listados na seção Fornecedores."]),
            ("Princípios", [("lista", ["Confidencialidade: cada pessoa vê só os projetos e ares de que precisa.",
                                       "Integridade: todo comando fica registrado com selo de integridade (SHA-256) diário.",
                                       "Disponibilidade: um agente principal e reservas que assumem sozinhos em até 45 s; cópia diária do banco.",
                                       "Menor privilégio e registro de quem fez o quê."])]),
            ("Papéis e responsabilidades", ["Os papéis do sistema e as permissões de cada um:",
                                            ("tabela", ["Papel", "Permissões", "Contas ativas"], _papeis()),
                                            "O dono responde pela política; os administradores pela operação; cada usuário pela própria conta."]),
            ("Controle de acesso", [("lista", ["Contas individuais, sem cadastro público; acesso por papel e por projeto ou por ar.",
                                               "Senha forte (mínimo de 10 caracteres com classes) e conferência contra senhas vazadas.",
                                               "Duas etapas (aplicativo autenticador ou biometria) obrigatória para quem administra.",
                                               "Sessão encerra após inatividade e tem duração máxima; o usuário pode encerrar sessões abertas.",
                                               "Revisão dos acessos a cada 90 dias na aba Acessos da tela Segurança."])]),
            ("Proteção dos dados", [("lista", ["Segredos cifrados em repouso (AES-256-GCM) e trânsito só por TLS.",
                                               "Dados pessoais mínimos (nome, e-mail, cargo); IPs de consentimento guardados só como hash.",
                                               "Cópia diária do banco, mantendo 14 cópias."])]),
            ("Registros e monitoramento", ["Atividade e eventos de segurança ficam registrados, com selo de integridade diário, e podem ser "
                                           "consultados nas telas Atividade e Segurança. O firewall bloqueia comportamento de ataque e avisa os administradores."]),
            ("Incidentes", ["Qualquer suspeita (senha exposta, acesso estranho, comando que ninguém pediu) deve ser comunicada na hora ao "
                            "responsável pelo plano de resposta, conforme o Plano de Resposta a Incidentes."]),
            ("Conscientização e sanções", ["Todo usuário lê esta política e o Termo de Uso Aceitável antes de receber acesso. O descumprimento "
                                            "leva à suspensão da conta e às medidas administrativas cabíveis."]),
            ("Revisão", ["Esta política é revisada ao menos uma vez por ano ou quando houver mudança relevante no sistema."]),
        ]),
        "uso-aceitavel": ("Termo de Uso Aceitável", [
            ("Finalidade", [f"Definir como usar o sistema {marca} e os equipamentos ligados a ele."]),
            ("O que é permitido", [("lista", ["Ligar, desligar e ajustar os ares das salas sob sua responsabilidade, pelo painel, aplicativo ou voz.",
                                              "Criar cenas, agendas e automações para o expediente da sua sala.",
                                              "Gerar e compartilhar relatórios internamente."])]),
            ("O que não é permitido", [("lista", ["Compartilhar senha, código de duas etapas ou código de instalação do agente.",
                                                  "Usar a conta de outra pessoa ou tentar acessar salas e ares fora do seu acesso.",
                                                  "Desligar, mover ou parear de novo os transmissores sem avisar o administrador.",
                                                  "Instalar o agente em computador pessoal fora do escritório sem autorização.",
                                                  "Copiar dados do sistema para fora do ambiente de trabalho."])]),
            ("Cuidados", [("lista", ["Ative as duas etapas na sua conta (Configurações → Segurança).",
                                     "Bloqueie a tela ao sair do computador e saia do sistema em computadores compartilhados.",
                                     "Comunique na hora qualquer comportamento estranho do sistema ou dos ares."])]),
            ("Ciência", ["Declaro que li e concordo com este termo.", ("tabela", ["Nome", "Matrícula", "Data", "Assinatura"], [["", "", "", ""], ["", "", "", ""]])]),
        ]),
        "classificacao": ("Política de Classificação da Informação", [
            ("Níveis", [("tabela", ["Nível", "Quem pode ver", "Exemplos no sistema"], [
                ["Pública", "Qualquer pessoa", "Site institucional, página de status"],
                ["Interna", "Usuários com conta", "Relatórios de uso, mapa do escritório, agenda dos ares"],
                ["Restrita", "Administradores", "Registros de atividade e de segurança, lista de usuários, configurações"],
                ["Sigilosa", "Só o dono e o servidor", "Chaves e senhas (.env, chave mestra), códigos de instalação, tokens de integração"]])]),
            ("Tratamento", [("lista", ["Sigilosa: nunca em e-mail, chat ou repositório; cifrada em repouso; troca imediata se exposta.",
                                       "Restrita: só pelo painel, com login; exportações guardadas em pasta de acesso controlado.",
                                       "Interna: pode circular entre a equipe; marcar “Uso interno” quando impresso."])]),
            ("Rotulagem", ["Os relatórios e exportações levam o cabeçalho oficial e a data de emissão; o painel pode exibir marca d’água "
                           "“Uso interno” (Configurações → Marca)."]),
        ]),
        "resposta-incidentes": ("Plano de Resposta a Incidentes de Segurança", [
            ("Objetivo", ["Organizar a resposta a incidentes para reduzir o impacto e cumprir as obrigações legais (LGPD)."]),
            ("Etapas", [("tabela", ["Etapa", "O que fazer no sistema"], [
                ["Detectar", "Notificações de segurança, tela Segurança (eventos ao vivo) e relatos dos usuários."],
                ["Triar", "Classificar a gravidade; registrar o incidente na aba Incidentes com data e responsável."],
                ["Conter", "Bloquear IPs no firewall, ligar o escudo, encerrar sessões, desativar contas suspeitas."],
                ["Erradicar", "Trocar as chaves expostas (Supabase, Vercel, Sinric, Spotify, Resend, Turnstile, chave mestra)."],
                ["Recuperar", "Restaurar a cópia do banco se preciso; reinstalar o agente com código novo; conferir a Atividade."],
                ["Aprender", "Registrar as lições e as ações corretivas no próprio incidente."]])]),
            ("Comunicação", [("lista", ["Incidente com dado pessoal que possa causar risco ou dano relevante: comunicar a ANPD e os titulares "
                                        "no prazo da regulamentação vigente da ANPD.",
                                        "Incidentes de rede ou ataque: notificar o CERT.br (cert@cert.br).",
                                        "Equipe e direção: informar assim que o incidente for confirmado."])]),
            ("Responsável", ["Responsável pelo plano: ____________________________ (registre também na aba Incidentes)."]),
        ]),
        "continuidade": ("Plano de Continuidade do Controle dos Ares", [
            ("Objetivo", ["Manter o controle dos ares funcionando ou voltar a funcionar rápido quando algo falhar."]),
            ("Cenários e resposta", [("tabela", ["Falha", "Como o sistema reage", "O que a equipe faz"], [
                ["Computador do agente desligado", "Outro agente (reserva) assume em até 45 s", "Ligar o computador ou o Raspberry Pi"],
                ["Internet do escritório fora", "Nenhum comando remoto chega aos ares", "Usar o controle remoto original; o painel atualiza quando voltar"],
                ["Transmissor com Wi-Fi novo ou pareado de novo", "Autorreparo busca a chave nova e o IP novo", "Parear no Smart Life (2,4 GHz) e “Reconectar agora”"],
                ["Banco de dados indisponível", "Painel mostra erro; agenda espera", "Acompanhar o status do Supabase; restaurar cópia se houver perda"],
                ["Conta de assistente de voz trocada", "Comandos de voz param", "Ativar a skill Sinric Pro na conta nova e descobrir dispositivos"]])]),
            ("Cópias", ["Cópia automática do banco todo dia às 02:00 (horário de Brasília), mantendo 14 cópias: no pior caso perde-se o que "
                        "mudou desde a última cópia (até 24 h)."]),
            ("Teste do plano", ["Testar a troca de agente (desligar o principal e ver o reserva assumir) ao menos a cada 6 meses e registrar."]),
        ]),
        "fornecedores": ("Relação de Fornecedores e Requisitos de Segurança", [
            ("Fornecedores", [("tabela", ["Fornecedor", "Para que serve", "Dados envolvidos", "Proteção"], FORNECEDORES)]),
            ("Requisitos", [("lista", ["Contas dos fornecedores com duas etapas e no nome da organização sempre que possível.",
                                       "Chaves de acesso com o menor escopo possível, guardadas cifradas ou só no agente.",
                                       "Acompanhar a página de status e os avisos de segurança de cada fornecedor.",
                                       "Revisar esta lista uma vez por ano e ao contratar ou trocar um serviço."])]),
        ]),
        "termo-confidencialidade": ("Termo de Confidencialidade e Responsabilidade", [
            ("Compromisso", ["Ao receber acesso ao sistema, comprometo-me a manter em sigilo as informações restritas e sigilosas a que tiver "
                             "acesso, a usar minha conta só para as atividades do meu trabalho e a seguir a Política de Segurança da Informação."]),
            ("Após o desligamento", ["As obrigações de sigilo continuam após o fim do vínculo. No desligamento, a conta é desativada e os "
                                     "equipamentos e credenciais são devolvidos."]),
            ("Identificação", [("tabela", ["Nome", "Matrícula", "Cargo", "Data", "Assinatura"], [["", "", "", "", ""]])]),
        ]),
    }


TIPOS = {"politica-seguranca", "uso-aceitavel", "classificacao", "resposta-incidentes", "continuidade", "fornecedores", "termo-confidencialidade",
         "declaracao-aplicabilidade"}


def lista() -> list[dict]:
    cat = _catalogo()
    itens = [{"tipo": k, "titulo": t, "controles": CONTROLES_DOC.get(k, [])} for k, (t, _) in cat.items()]
    itens.append({"tipo": "declaracao-aplicabilidade", "titulo": "Declaração de Aplicabilidade (SoA)", "controles": ["6.1.3"]})
    return itens


CONTROLES_DOC = {
    "politica-seguranca": ["5.1", "5.2", "5.4", "cláusula 5.2"], "uso-aceitavel": ["5.10", "6.3"], "classificacao": ["5.12", "5.13"],
    "resposta-incidentes": ["5.5", "5.24", "5.26"], "continuidade": ["5.29", "5.30", "8.13"], "fornecedores": ["5.19", "5.21", "5.22"],
    "termo-confidencialidade": ["6.2", "6.5", "6.6"],
}


def _secoes_soa() -> list[Secao]:
    from . import conformidade
    a = conformidade.avaliar()
    rot = {"implementado": "Implementado", "parcial": "Parcial", "pendente": "Pendente", "nao_aplicavel": "Não se aplica"}
    linhas = [[x["id"], x["titulo"], rot[x["status"]], (x["detalhe"] or x["evidencia"] or "—")[:140]] for x in a["controles"]]
    return [("Resumo", [f"Conformidade do Anexo A: {a['nota_anexo']}%. Cláusulas 4 a 10: {a['nota_clausulas']}%. "
                        f"{a['contagem']['implementado']} controles implementados, {a['contagem']['parcial']} parciais, {a['contagem']['pendente']} pendentes."]),
            ("Controles do Anexo A", [("tabela", ["Controle", "Título", "Situação", "Como é atendido / evidência"], linhas)])]


def gerar(tipo: str, formato: str = "pdf", emitido_por: str = "") -> tuple[bytes, str, str, str]:
    if tipo not in TIPOS:
        raise KeyError("Documento não encontrado.")
    if tipo == "declaracao-aplicabilidade":
        titulo, secoes = "Declaração de Aplicabilidade · ISO/IEC 27001:2022", _secoes_soa()
    else:
        titulo, secoes = _catalogo()[tipo]
    agora = db.agora()
    meta = [["Situação", "MINUTA para revisão e aprovação da direção"], ["Versão", f"{_data(agora):%Y.%m.%d}"],
            ["Emissão", f"{_data(agora):%d/%m/%Y às %H:%M}"], ["Emitido por", emitido_por or "Sistema"]]
    if formato == "docx":
        return _docx(titulo, meta, secoes, agora), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx", titulo
    return _pdf(titulo, meta, secoes, agora), "application/pdf", "pdf", titulo


def _pdf(titulo, meta, secoes, agora) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas
    from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle
    L, A = A4
    azul, cinza, claro = colors.HexColor(AZUL_PMF), colors.HexColor("#71717a"), colors.HexColor("#e4e4e7")
    est = getSampleStyleSheet()
    corpo = ParagraphStyle("c", parent=est["Normal"], fontSize=10, leading=14.5)
    cel = ParagraphStyle("cel", parent=corpo, fontSize=8.5, leading=11)
    cab_st = ParagraphStyle("cab", parent=cel, textColor=colors.white, fontName="Helvetica-Bold")
    h1 = ParagraphStyle("h1", parent=corpo, fontName="Helvetica-Bold", fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=6, textColor=azul)
    tit = ParagraphStyle("t", parent=corpo, fontName="Helvetica-Bold", fontSize=15, leading=19, alignment=1, spaceAfter=10)
    brasao, linhas = _brasao(), _cabecalho_oficial()
    buf = io.BytesIO()

    class Numerada(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k); self._p = []

        def showPage(self):
            self._p.append(dict(self.__dict__)); self._startPage()

        def save(self):
            for i, e in enumerate(self._p, start=1):
                self.__dict__.update(e)
                self.setFont("Helvetica", 7.5); self.setFillColor(cinza); self.drawRightString(L - 20 * mm, 10 * mm, f"Página {i} de {len(self._p)}")
                super().showPage()
            super().save()

    def pagina(c, _d):
        c.saveState()
        if brasao:
            c.drawImage(ImageReader(io.BytesIO(brasao)), 22 * mm, A - 41 * mm, 18 * mm, 25 * mm, preserveAspectRatio=True, mask="auto")
        for i, t in enumerate(linhas[:3]):
            c.setFont("Times-Roman", 12.5 if i < 2 else 11); c.drawCentredString(L / 2 + 14 * mm, A - 22 * mm - i * 5.6 * mm, t)
        c.setLineWidth(0.6); c.line(20 * mm, A - 45 * mm, L - 20 * mm, A - 45 * mm)
        c.setStrokeColor(claro); c.line(20 * mm, 15 * mm, L - 20 * mm, 15 * mm)
        c.setFont("Helvetica", 7.5); c.setFillColor(cinza); c.drawString(20 * mm, 10 * mm, f"{titulo} · minuta")
        c.restoreState()

    doc = BaseDocTemplate(buf, pagesize=A4, title=titulo, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=50 * mm, bottomMargin=20 * mm)
    doc.addPageTemplates([PageTemplate("p", [Frame(20 * mm, 20 * mm, L - 40 * mm, A - 70 * mm)], onPage=pagina)])
    larg = L - 40 * mm

    def tabela(cab, dados, larguras=None):
        t = Table([[Paragraph(html.escape(str(x)), cab_st) for x in cab]] + [[Paragraph(html.escape(str(x)), cel) for x in l] for l in dados],
                  colWidths=larguras or [larg / len(cab)] * len(cab), repeatRows=1, hAlign="LEFT")
        t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), azul), ("GRID", (0, 0), (-1, -1), 0.4, claro), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                               ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        return t

    el = [Paragraph(html.escape(titulo), tit), tabela(["Identificação", ""], meta, [larg * 0.3, larg * 0.7]), Spacer(1, 8)]
    for i, (nome, blocos) in enumerate(secoes, start=1):
        el.append(Paragraph(html.escape(f"{i} – {nome}"), h1))
        for b in blocos:
            if isinstance(b, str):
                el += [Paragraph(html.escape(b), corpo), Spacer(1, 4)]
            elif b[0] == "lista":
                for j, x in enumerate(b[1], start=1):
                    el.append(Paragraph(html.escape(f"{i}.{j} – {x}"), ParagraphStyle("li", parent=corpo, leftIndent=12, firstLineIndent=-12)))
                el.append(Spacer(1, 4))
            elif b[0] == "tabela":
                el += [tabela(b[1], b[2]), Spacer(1, 6)]
    dir_st = ParagraphStyle("d", parent=corpo, alignment=2)
    ass = ParagraphStyle("a", parent=corpo, alignment=1, fontSize=9)
    el += [Spacer(1, 14), Paragraph(f"Florianópolis, {_data_extenso(agora)}.", dir_st), Spacer(1, 34),
           Table([[Paragraph("_______________________________<br/><b>Elaborado por</b>", ass), Paragraph("_______________________________<br/><b>Aprovado por (direção)</b>", ass)]],
                 colWidths=[larg / 2, larg / 2])]
    doc.build(el, canvasmaker=Numerada)
    return buf.getvalue()


def _docx(titulo, meta, secoes, agora) -> bytes:
    from .docx_simples import Documento, trecho
    cor = AZUL_PMF.lstrip("#")
    doc = Documento(cor_titulo=cor)
    doc.cabecalho = {"imagem": _brasao(), "linhas": _cabecalho_oficial(), "fonte": "Times New Roman", "largura_cm": 1.5}
    doc.numerar_paginas = True
    doc.rodape = f"{titulo} · minuta"
    doc.paragrafo(trecho(titulo, negrito=True, tam=15), alinhar="center", depois=160)
    doc.tabela(["Identificação", ""], meta, cor=cor)
    for i, (nome, blocos) in enumerate(secoes, start=1):
        doc.titulo_secao(f"{i} – {nome}", 1)
        for b in blocos:
            if isinstance(b, str):
                doc.paragrafo(b)
            elif b[0] == "lista":
                for j, x in enumerate(b[1], start=1):
                    doc.paragrafo(f"{i}.{j} – {x}", depois=40)
            elif b[0] == "tabela":
                doc.tabela(b[1], [[str(x) for x in l] for l in b[2]], cor=cor)
    doc.paragrafo(f"Florianópolis, {_data_extenso(agora)}.", alinhar="right", depois=500)
    doc.tabela(None, [[[trecho("_______________________________\n"), trecho("Elaborado por", negrito=True)],
                       [trecho("_______________________________\n"), trecho("Aprovado por (direção)", negrito=True)]]], zebra=None)
    doc.titulo = titulo
    return doc.salvar()
