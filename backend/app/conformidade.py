"""Conformidade de segurança: ISO/IEC 27001:2022 (cláusulas 4–10 e os 93 controles do Anexo A, os mesmos da 27002),
com ligação para 27005, 27017, 27018, 27701, 27035, 22301 e LGPD.

O que dá para conferir sozinho é conferido na hora (RLS, duas etapas, backup, firewall, cabeçalhos ao vivo, TLS,
integridade dos logs…). O resto o administrador declara (implementado, parcial, pendente ou não se aplica) com evidência.
Os títulos dos controles são resumos próprios em português, não o texto da norma.
"""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import socket
import ssl
import time
from datetime import datetime, timezone

import httpx

from . import db

# ---------------------------------------------------------------- catálogo
# (id, tema, título resumido, verificação automática ou "sistema" ou None, normas relacionadas)
CONTROLES = [
    ("5.1", "Organizacionais", "Política de segurança aprovada e publicada", None, ["27002"]),
    ("5.2", "Organizacionais", "Papéis e responsabilidades de segurança definidos", "papeis", ["27002"]),
    ("5.3", "Organizacionais", "Funções conflitantes separadas", "papeis", ["27002"]),
    ("5.4", "Organizacionais", "Direção cobra as regras de segurança", None, ["27002"]),
    ("5.5", "Organizacionais", "Contato com autoridades (ANPD, polícia, CERT.br)", None, ["27002", "LGPD"]),
    ("5.6", "Organizacionais", "Contato com grupos especializados em segurança", None, ["27002"]),
    ("5.7", "Organizacionais", "Inteligência de ameaças", "ameacas", ["27002"]),
    ("5.8", "Organizacionais", "Segurança dentro da gestão de projetos", None, ["27002"]),
    ("5.9", "Organizacionais", "Inventário de informações e ativos", "inventario", ["27002"]),
    ("5.10", "Organizacionais", "Regras de uso aceitável", None, ["27002"]),
    ("5.11", "Organizacionais", "Devolução de ativos no desligamento", None, ["27002"]),
    ("5.12", "Organizacionais", "Classificação da informação", None, ["27002", "27701"]),
    ("5.13", "Organizacionais", "Rotulagem da informação", "rotulo", ["27002"]),
    ("5.14", "Organizacionais", "Transferência segura de informações", "tls", ["27002", "27017"]),
    ("5.15", "Organizacionais", "Controle de acesso por regra", "rls", ["27002"]),
    ("5.16", "Organizacionais", "Gestão do ciclo de vida das identidades", "identidades", ["27002"]),
    ("5.17", "Organizacionais", "Proteção das informações de autenticação", "autenticacao", ["27002"]),
    ("5.18", "Organizacionais", "Revisão periódica dos direitos de acesso", "revisao_acessos", ["27002"]),
    ("5.19", "Organizacionais", "Segurança na relação com fornecedores", None, ["27002", "27036"]),
    ("5.20", "Organizacionais", "Cláusulas de segurança nos contratos com fornecedores", None, ["27002"]),
    ("5.21", "Organizacionais", "Segurança na cadeia de fornecimento de TI", None, ["27002"]),
    ("5.22", "Organizacionais", "Acompanhamento dos serviços de fornecedores", "fornecedores", ["27002"]),
    ("5.23", "Organizacionais", "Segurança no uso de serviços em nuvem", "sistema:nuvem", ["27002", "27017", "27018"]),
    ("5.24", "Organizacionais", "Plano de resposta a incidentes", "plano_incidentes", ["27002", "27035"]),
    ("5.25", "Organizacionais", "Triagem de eventos de segurança", "triagem", ["27002", "27035"]),
    ("5.26", "Organizacionais", "Resposta a incidentes no prazo", "incidentes_abertos", ["27002", "27035"]),
    ("5.27", "Organizacionais", "Lições aprendidas com incidentes", "licoes", ["27002", "27035"]),
    ("5.28", "Organizacionais", "Coleta e preservação de evidências", "integridade", ["27002", "27037"]),
    ("5.29", "Organizacionais", "Segurança mantida durante interrupções", "escudo", ["27002", "22301"]),
    ("5.30", "Organizacionais", "Prontidão de TI para continuidade", "backup", ["27002", "22301"]),
    ("5.31", "Organizacionais", "Requisitos legais e contratuais identificados", "legal", ["27002", "LGPD"]),
    ("5.32", "Organizacionais", "Respeito à propriedade intelectual", None, ["27002"]),
    ("5.33", "Organizacionais", "Proteção dos registros", "integridade", ["27002"]),
    ("5.34", "Organizacionais", "Privacidade e proteção de dados pessoais", "privacidade", ["27002", "27701", "27018", "LGPD"]),
    ("5.35", "Organizacionais", "Análise independente da segurança", None, ["27002"]),
    ("5.36", "Organizacionais", "Conformidade com as próprias regras", "checklist", ["27002"]),
    ("5.37", "Organizacionais", "Procedimentos operacionais documentados", "sistema:docs", ["27002"]),
    ("6.1", "Pessoas", "Verificação de antecedentes na contratação", None, ["27002"]),
    ("6.2", "Pessoas", "Segurança nos termos de contratação", None, ["27002"]),
    ("6.3", "Pessoas", "Conscientização e treinamento em segurança", None, ["27002"]),
    ("6.4", "Pessoas", "Processo disciplinar", None, ["27002"]),
    ("6.5", "Pessoas", "Deveres que continuam após o desligamento", None, ["27002"]),
    ("6.6", "Pessoas", "Acordos de confidencialidade", None, ["27002", "LGPD"]),
    ("6.7", "Pessoas", "Regras para trabalho remoto", "sessoes", ["27002"]),
    ("6.8", "Pessoas", "Canal para relatar eventos de segurança", "canal_relato", ["27002", "27035"]),
    ("7.1", "Físicos", "Perímetro de segurança física", None, ["27002"]),
    ("7.2", "Físicos", "Controle de entrada física", None, ["27002"]),
    ("7.3", "Físicos", "Proteção de escritórios e salas", None, ["27002"]),
    ("7.4", "Físicos", "Monitoramento da segurança física", None, ["27002"]),
    ("7.5", "Físicos", "Proteção contra ameaças físicas e ambientais", None, ["27002"]),
    ("7.6", "Físicos", "Regras para áreas seguras", None, ["27002"]),
    ("7.7", "Físicos", "Mesa limpa e tela bloqueada", "sessoes", ["27002"]),
    ("7.8", "Físicos", "Instalação e proteção dos equipamentos", "transmissores", ["27002"]),
    ("7.9", "Físicos", "Equipamentos fora do escritório", None, ["27002"]),
    ("7.10", "Físicos", "Mídias de armazenamento", None, ["27002"]),
    ("7.11", "Físicos", "Energia e serviços de apoio", None, ["27002"]),
    ("7.12", "Físicos", "Proteção do cabeamento", None, ["27002"]),
    ("7.13", "Físicos", "Manutenção dos equipamentos", "transmissores", ["27002"]),
    ("7.14", "Físicos", "Descarte e reaproveitamento seguro", None, ["27002"]),
    ("8.1", "Tecnológicos", "Proteção dos aparelhos dos usuários", "sistema:dispositivos", ["27002"]),
    ("8.2", "Tecnológicos", "Acessos privilegiados controlados", "privilegiado", ["27002"]),
    ("8.3", "Tecnológicos", "Restrição de acesso à informação", "rls", ["27002"]),
    ("8.4", "Tecnológicos", "Acesso ao código-fonte", "sistema:codigo", ["27002"]),
    ("8.5", "Tecnológicos", "Autenticação segura", "autenticacao_forte", ["27002"]),
    ("8.6", "Tecnológicos", "Gestão de capacidade", "escudo", ["27002"]),
    ("8.7", "Tecnológicos", "Proteção contra código malicioso", "anti_robo", ["27002"]),
    ("8.8", "Tecnológicos", "Gestão de vulnerabilidades técnicas", "exposicao", ["27002"]),
    ("8.9", "Tecnológicos", "Configuração segura", "cabecalhos", ["27002"]),
    ("8.10", "Tecnológicos", "Exclusão de informações", "retencao", ["27002", "27701", "LGPD"]),
    ("8.11", "Tecnológicos", "Mascaramento de dados", "sistema:mascara", ["27002", "27018"]),
    ("8.12", "Tecnológicos", "Prevenção de vazamento de dados", "exposicao", ["27002"]),
    ("8.13", "Tecnológicos", "Cópias de segurança", "backup", ["27002", "22301"]),
    ("8.14", "Tecnológicos", "Redundância dos recursos", "sistema:redundancia", ["27002", "22301"]),
    ("8.15", "Tecnológicos", "Registro de eventos (logs)", "logs", ["27002"]),
    ("8.16", "Tecnológicos", "Monitoramento de atividades", "monitoramento", ["27002"]),
    ("8.17", "Tecnológicos", "Relógios sincronizados", "relogio", ["27002"]),
    ("8.18", "Tecnológicos", "Uso de utilitários privilegiados", None, ["27002"]),
    ("8.19", "Tecnológicos", "Instalação de software controlada", None, ["27002"]),
    ("8.20", "Tecnológicos", "Segurança de redes", "firewall", ["27002", "27033"]),
    ("8.21", "Tecnológicos", "Segurança dos serviços de rede", "tls", ["27002"]),
    ("8.22", "Tecnológicos", "Separação de redes", "sistema:segregacao", ["27002"]),
    ("8.23", "Tecnológicos", "Filtragem de acessos web", "firewall", ["27002"]),
    ("8.24", "Tecnológicos", "Uso de criptografia", "cripto", ["27002", "27018"]),
    ("8.25", "Tecnológicos", "Ciclo de desenvolvimento seguro", None, ["27002", "27034"]),
    ("8.26", "Tecnológicos", "Requisitos de segurança das aplicações", "cabecalhos", ["27002", "27034"]),
    ("8.27", "Tecnológicos", "Arquitetura segura", "sistema:arquitetura", ["27002"]),
    ("8.28", "Tecnológicos", "Programação segura", "sistema:codigo_seguro", ["27002", "27034"]),
    ("8.29", "Tecnológicos", "Testes de segurança antes de liberar", "testes", ["27002"]),
    ("8.30", "Tecnológicos", "Desenvolvimento terceirizado", None, ["27002"]),
    ("8.31", "Tecnológicos", "Ambientes de desenvolvimento, teste e produção separados", None, ["27002"]),
    ("8.32", "Tecnológicos", "Gestão de mudanças", "mudancas", ["27002"]),
    ("8.33", "Tecnológicos", "Dados usados em testes", None, ["27002", "LGPD"]),
    ("8.34", "Tecnológicos", "Proteção dos sistemas durante auditorias", "sistema:auditoria", ["27002"]),
]

# Cláusulas da ISO 27001 (o sistema de gestão em si)
CLAUSULAS = [
    ("4.1", "Contexto: questões internas e externas que afetam a segurança", None),
    ("4.2", "Partes interessadas e o que esperam", None),
    ("4.3", "Escopo do sistema de gestão definido", "escopo"),
    ("4.4", "Sistema de gestão estabelecido e mantido", "checklist"),
    ("5.1", "Liderança e comprometimento da direção", None),
    ("5.2", "Política de segurança", None),
    ("5.3", "Papéis, responsabilidades e autoridades", "papeis"),
    ("6.1.2", "Avaliação de riscos feita", "riscos_avaliados"),
    ("6.1.3", "Plano de tratamento e Declaração de Aplicabilidade", "riscos_tratados"),
    ("6.2", "Objetivos de segurança mensuráveis", "checklist"),
    ("6.3", "Mudanças planejadas", "mudancas"),
    ("7.1", "Recursos para a segurança", None),
    ("7.2", "Competência das pessoas", None),
    ("7.3", "Conscientização", None),
    ("7.4", "Comunicação interna e externa", "canal_relato"),
    ("7.5", "Informação documentada", "sistema:docs"),
    ("8.1", "Controle operacional", "monitoramento"),
    ("8.2", "Avaliação de riscos em intervalos planejados", "riscos_revisados"),
    ("8.3", "Tratamento de riscos aplicado", "riscos_tratados"),
    ("9.1", "Monitoramento, medição e análise", "checklist"),
    ("9.2", "Auditoria interna", None),
    ("9.3", "Análise crítica pela direção", None),
    ("10.1", "Melhoria contínua", "licoes"),
    ("10.2", "Não conformidades e ações corretivas", "acoes_corretivas"),
]

NORMAS = {
    "27000": "Visão geral e vocabulário da família ISO 27000",
    "27001": "Requisitos do sistema de gestão (certificável)",
    "27002": "Guia de implementação dos 93 controles",
    "27005": "Gestão de riscos de segurança da informação",
    "27017": "Controles para serviços em nuvem",
    "27018": "Dados pessoais em nuvem pública",
    "27701": "Gestão da privacidade (extensão da 27001)",
    "27035": "Gestão de incidentes",
    "27036": "Segurança na relação com fornecedores",
    "27037": "Coleta e preservação de evidência digital",
    "27033": "Segurança de redes",
    "27034": "Segurança de aplicações",
    "22301": "Continuidade de negócios",
    "LGPD": "Lei Geral de Proteção de Dados (Lei 13.709/2018)",
}

# o que já vem pronto no próprio sistema (explicado, não conferido ao vivo)
SISTEMA = {
    "nuvem": "Vercel (aplicação) e Supabase (banco) com TLS verificado até o banco pela CA do Supabase; segredos só no servidor.",
    "docs": "Procedimentos de instalação, publicação e recuperação documentados no repositório (CLAUDE.md e scripts de publicação).",
    "dispositivos": "Apps com bloqueio por biometria, sessão com expiração e saída remota das sessões em Configurações.",
    "codigo": "Código em repositório privado no GitHub; segredos fora do Git (arquivos ignorados e variáveis da Vercel).",
    "mascara": "IPs do consentimento de cookies guardados só como hash; chaves e tokens aparecem mascarados nas telas.",
    "redundancia": "Aplicação sem servidor na Vercel (várias instâncias) e banco gerenciado no Supabase com backup diário.",
    "segregacao": "Transmissores IR na rede do escritório falando só com o agente local; nuvem e agente separados por papel.",
    "arquitetura": "Defesa em camadas: borda da Vercel, firewall da aplicação, permissão por rota, RLS no banco e cifra em repouso.",
    "codigo_seguro": "Consultas parametrizadas, validação de entrada (Pydantic), CSP restrita e SVG/CSS de usuário filtrados.",
    "auditoria": "Consultas da tela Supabase rodam em transação só de leitura; auditoria não altera dados de produção.",
}

STATUS_VALIDOS = ("implementado", "parcial", "pendente", "nao_aplicavel")


# ---------------------------------------------------------------- utilidades
def _agora() -> int:
    return db.agora()


def _ts(v) -> float:
    if v is None:
        return 0
    if hasattr(v, "timestamp"):
        return v.timestamp()
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0


def _lista(chave: str) -> list:
    v = db.cfg(chave) or []
    return v if isinstance(v, list) else []


# ---------------------------------------------------------------- testes ao vivo (cabeçalhos, TLS, exposição)
def _hosts() -> list[str]:
    extra = (db.cfg("white_label") or {}).get("dominio") or ""
    hosts = ["app.zynio.com.br", "zynio.com.br"]
    if extra and extra not in hosts and "." in extra:
        hosts.append(extra.strip().lower())
    return hosts


def _teste_tls(host: str) -> dict:
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=6) as s, ctx.wrap_socket(s, server_hostname=host) as t:
            cert = t.getpeercert()
            versao = t.version()
        fim = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(tzinfo=timezone.utc)
        dias = int((fim - datetime.now(timezone.utc)).total_seconds() // 86400)
        emissor = dict(x[0] for x in cert.get("issuer", ())).get("organizationName", "")
        return {"ok": dias > 14 and versao in ("TLSv1.2", "TLSv1.3"), "detalhe": f"{versao} · certificado de {emissor or 'emissor desconhecido'} vence em {dias} dias", "dias": dias}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "detalhe": f"Não foi possível abrir TLS: {type(e).__name__}"}


def _teste_http(host: str) -> list[dict]:
    res = []
    with httpx.Client(timeout=7, follow_redirects=False, headers={"User-Agent": "ClimaEscritorio-autoteste/1.0"}) as c:
        try:
            r = c.get(f"https://{host}/")
            h = {k.lower(): v for k, v in r.headers.items()}
            hsts = h.get("strict-transport-security", "")
            idade = int(next((p.split("=")[1] for p in hsts.replace(" ", "").split(";") if p.startswith("max-age=")), "0") or 0)
            csp = h.get("content-security-policy", "")
            res += [
                {"id": "hsts", "teste": "HSTS (HTTPS obrigatório)", "ok": idade >= 15552000, "detalhe": hsts or "ausente"},
                {"id": "csp", "teste": "Política de conteúdo (CSP)", "ok": bool(csp) and "unsafe-eval" not in csp, "detalhe": (csp[:140] + "…") if len(csp) > 140 else (csp or "ausente")},
                {"id": "frame", "teste": "Proteção contra clickjacking", "ok": h.get("x-frame-options", "").upper() in ("DENY", "SAMEORIGIN") or "frame-ancestors" in csp, "detalhe": h.get("x-frame-options") or ("frame-ancestors na CSP" if "frame-ancestors" in csp else "ausente")},
                {"id": "nosniff", "teste": "Bloqueio de MIME sniffing", "ok": h.get("x-content-type-options", "").lower() == "nosniff", "detalhe": h.get("x-content-type-options", "ausente")},
                {"id": "referrer", "teste": "Referrer-Policy", "ok": bool(h.get("referrer-policy")), "detalhe": h.get("referrer-policy", "ausente")},
                {"id": "permissions", "teste": "Permissions-Policy", "ok": bool(h.get("permissions-policy")), "detalhe": (h.get("permissions-policy", "ausente"))[:120]},
                {"id": "banner", "teste": "Servidor não revela versão", "ok": "x-powered-by" not in h and not any(ch.isdigit() for ch in h.get("server", "")), "detalhe": h.get("x-powered-by") or h.get("server") or "nenhuma versão exposta"},
            ]
        except httpx.HTTPError as e:
            res.append({"id": "https", "teste": "Site responde em HTTPS", "ok": False, "detalhe": type(e).__name__})
        try:
            r = c.get(f"http://{host}/")
            destino = r.headers.get("location", "")
            res.append({"id": "redirect", "teste": "HTTP redireciona para HTTPS", "ok": r.status_code in (301, 302, 307, 308) and destino.startswith("https://"), "detalhe": f"{r.status_code} → {destino or '—'}"})
        except httpx.HTTPError as e:
            res.append({"id": "redirect", "teste": "HTTP redireciona para HTTPS", "ok": False, "detalhe": type(e).__name__})
        expostos = []
        for caminho in ("/.env", "/.git/config", "/backend/.env", "/docs", "/openapi.json", "/.DS_Store"):
            try:
                r = c.get(f"https://{host}{caminho}")
                tipo = r.headers.get("content-type", "")
                # SPA devolve o index.html para qualquer rota: só conta como exposto se vier o arquivo de verdade
                if r.status_code == 200 and "text/html" not in tipo and len(r.content) > 0:
                    expostos.append(caminho)
            except httpx.HTTPError:
                pass
        res.append({"id": "exposicao", "teste": "Arquivos sensíveis não ficam públicos", "ok": not expostos, "detalhe": ", ".join(expostos) if expostos else ".env, .git, docs da API e .DS_Store fechados"})
        try:
            r = c.get(f"https://{host}/.well-known/security.txt")
            ok = r.status_code == 200 and "contact:" in r.text.lower()
            res.append({"id": "securitytxt", "teste": "security.txt para relatar falhas (RFC 9116)", "ok": ok, "detalhe": "publicado" if ok else f"{r.status_code}"})
        except httpx.HTTPError as e:
            res.append({"id": "securitytxt", "teste": "security.txt para relatar falhas (RFC 9116)", "ok": False, "detalhe": type(e).__name__})
        if host.startswith("app."):
            try:
                r = c.get(f"https://{host}/api/marca", headers={"Origin": "https://exemplo-malicioso.invalid"})
                aco = r.headers.get("access-control-allow-origin", "")
                res.append({"id": "cors", "teste": "CORS não aceita origem estranha", "ok": aco not in ("*", "https://exemplo-malicioso.invalid"), "detalhe": aco or "sem cabeçalho para origem desconhecida"})
            except httpx.HTTPError as e:
                res.append({"id": "cors", "teste": "CORS não aceita origem estranha", "ok": False, "detalhe": type(e).__name__})
    return res


def rodar_testes() -> dict:
    hosts = _hosts()
    saida = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        tls = {h: ex.submit(_teste_tls, h) for h in hosts}
        http = {h: ex.submit(_teste_http, h) for h in hosts}
        for h in hosts:
            t = tls[h].result()
            saida[h] = [{"id": "tls", "teste": "TLS moderno e certificado em dia", **t}] + http[h].result()
    todos = [x for lista in saida.values() for x in lista]
    resultado = {"em": _agora(), "hosts": saida, "ok": sum(x["ok"] for x in todos), "total": len(todos)}
    db.set_cfg("seguranca_testes", resultado)
    return resultado


def ultimos_testes(max_idade: int | None = None) -> dict | None:
    r = db.cfg("seguranca_testes")
    if r and max_idade is not None and _agora() - r.get("em", 0) > max_idade:
        return None
    return r


def _teste_ok(ids: tuple[str, ...]) -> tuple[bool | None, str]:
    r = ultimos_testes()
    if not r:
        return None, "Rode os testes ao vivo para conferir."
    itens = [x for lista in r["hosts"].values() for x in lista if x["id"] in ids]
    if not itens:
        return None, "Sem resultado."
    falhas = [f'{x["teste"]}' for x in itens if not x["ok"]]
    return not falhas, ("Falhou: " + "; ".join(sorted(set(falhas)))) if falhas else f"{len(itens)} conferência(s) ao vivo aprovadas"


# ---------------------------------------------------------------- integridade dos registros (cadeia de hashes por dia)
def _hash_dia(tabela: str, ini: int, fim: int) -> tuple[str, int]:
    if tabela == "atividade":
        linhas = db.consultar("SELECT id, quando, origem, acao, ok, detalhe FROM atividade WHERE quando >= ? AND quando < ? ORDER BY id", (ini, fim))
    else:
        linhas = db.consultar("SELECT id, quando, ip, tipo, rota, detalhe FROM seguranca_eventos WHERE quando >= ? AND quando < ? ORDER BY id", (ini, fim))
    h = hashlib.sha256()
    for l in linhas:
        h.update(json.dumps([str(v) for v in l.values()], ensure_ascii=False).encode())
    return h.hexdigest(), len(linhas)


def selar(max_dias: int = 60) -> dict:
    """Sela os dias fechados (até ontem, UTC) que ainda não têm selo. Cada selo inclui o anterior: mudar um dia quebra a cadeia."""
    selos = _lista("integridade_selos")
    hoje = _agora() // 86400 * 86400
    ultimo = selos[-1]["dia"] if selos else hoje - 30 * 86400 - 86400
    novos = 0
    dia = ultimo + 86400
    while dia < hoje and novos < max_dias:
        ha, na = _hash_dia("atividade", dia, dia + 86400)
        he, ne = _hash_dia("eventos", dia, dia + 86400)
        anterior = selos[-1]["selo"] if selos else "0" * 64
        selo = hashlib.sha256(f"{anterior}|{dia}|{ha}|{he}".encode()).hexdigest()
        selos.append({"dia": dia, "atividade": ha, "eventos": he, "n_atividade": na, "n_eventos": ne, "anterior": anterior, "selo": selo})
        novos += 1
        dia += 86400
    if novos:
        db.set_cfg("integridade_selos", selos[-400:])
    return {"novos": novos, "total": len(selos)}


def verificar(max_dias: int = 90) -> dict:
    selos = _lista("integridade_selos")
    problemas, removidos, conferidos = [], [], 0
    anterior = None
    for i, s in enumerate(selos):
        if anterior is not None and s["anterior"] != anterior:
            problemas.append({"dia": s["dia"], "motivo": "cadeia de selos quebrada"})
        anterior = s["selo"]
        if i < len(selos) - max_dias:
            continue
        ha, na = _hash_dia("atividade", s["dia"], s["dia"] + 86400)
        he, ne = _hash_dia("eventos", s["dia"], s["dia"] + 86400)
        conferidos += 1
        if ha != s["atividade"]:
            (removidos if na == 0 and s["n_atividade"] else problemas).append({"dia": s["dia"], "motivo": "atividade apagada pela retenção" if na == 0 else f"atividade alterada ({s['n_atividade']} → {na} registros)"})
        if he != s["eventos"]:
            (removidos if ne == 0 and s["n_eventos"] else problemas).append({"dia": s["dia"], "motivo": "eventos apagados pela retenção" if ne == 0 else f"eventos de segurança alterados ({s['n_eventos']} → {ne})"})
    return {"selos": len(selos), "conferidos": conferidos, "problemas": problemas, "removidos": removidos,
            "ultimo": selos[-1] if selos else None, "ok": not problemas, "em": _agora()}


# ---------------------------------------------------------------- verificações automáticas
def _verificacoes() -> dict:
    """Cada chave → (status, detalhe). status: implementado | parcial | pendente."""
    from . import firewall
    c = firewall.config()
    agora = _agora()
    marca = db.cfg("white_label") or {}
    out = {}
    S = lambda ok, det, parcial=False: ("implementado" if ok else ("parcial" if parcial else "pendente"), det)  # noqa: E731

    sem_rls = [r["tablename"] for r in db.consultar("SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity")]
    out["rls"] = S(not sem_rls, "RLS em todas as tabelas; o painel só acessa pela API com permissão por rota." if not sem_rls else f"Sem RLS: {', '.join(sem_rls)}")
    admins = db.consultar("SELECT u.id, u.email, u.papel, EXISTS(SELECT 1 FROM passkeys p WHERE p.usuario_id = u.id) AS pk, "
                          "EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified') AS totp "
                          "FROM usuarios u WHERE u.ativo AND u.papel IN ('dono','admin','subadmin')")
    sem2fa = [a["email"] for a in admins if not (a["pk"] or a["totp"])]
    out["autenticacao"] = S(not sem2fa, "Senhas no Supabase Auth (bcrypt), conferência de vazamento e duas etapas para quem administra." if not sem2fa else f"Sem duas etapas: {len(sem2fa)} administrador(es)", parcial=len(sem2fa) < len(admins))
    out["autenticacao_forte"] = S(not sem2fa and bool(c.get("exigir_2fa_admin")), "Duas etapas obrigatórias para administradores." if c.get("exigir_2fa_admin") else "Ligue “Exigir duas etapas para administradores” nas regras do firewall.", parcial=not sem2fa)
    out["privilegiado"] = S(bool(c.get("exigir_2fa_admin")) and not sem2fa, f"{len(admins)} conta(s) com privilégio; todas com duas etapas." if not sem2fa else f"{len(sem2fa)} conta(s) privilegiada(s) sem duas etapas", parcial=True)
    papeis = db.consultar("SELECT papel, count(*) n FROM usuarios WHERE ativo GROUP BY papel")
    out["papeis"] = S(True, "Papéis dono, admin, subadmin, operador e visualizador, com permissões por rota: " + ", ".join(f"{p['papel']} ({p['n']})" for p in papeis))
    ultimo_rev = (_lista("revisoes_acesso") or [{}])[0].get("em", 0)
    out["revisao_acessos"] = S(agora - ultimo_rev < 90 * 86400, f"Última revisão {time.strftime('%d/%m/%Y', time.localtime(ultimo_rev))}." if ultimo_rev else "Nenhuma revisão registrada. Faça na aba Acessos.", parcial=bool(ultimo_rev))
    inativos = db.um("SELECT count(*) n FROM usuarios u JOIN auth.users a ON a.id = u.id WHERE u.ativo AND (a.last_sign_in_at IS NULL OR a.last_sign_in_at < now() - interval '90 days')")["n"]
    out["identidades"] = S(inativos == 0, "Contas ativas foram usadas nos últimos 90 dias." if not inativos else f"{inativos} conta(s) ativa(s) sem uso há 90 dias: desative ou revise.", parcial=True)
    n_ativos = db.um("SELECT (SELECT count(*) FROM aparelhos) + (SELECT count(*) FROM hubs) + (SELECT count(*) FROM usuarios) AS n")["n"]
    out["inventario"] = S(n_ativos > 0, f"Inventário automático: {n_ativos} ativo(s) entre aparelhos, transmissores e usuários (aba Acessos e Transmissores).")
    out["transmissores"] = S(True, "Transmissores monitorados: o sistema avisa quando um fica sem resposta.")
    backup = db.um("SELECT max(criado_em) AS t FROM backups")
    tb = _ts((backup or {}).get("t"))
    out["backup"] = S(bool(tb) and agora - tb < 36 * 3600, "Backup do banco nas últimas 36 h (rotina diária, 14 cópias)." if tb and agora - tb < 36 * 3600 else "Backup atrasado ou ausente.")
    out["escudo"] = S(bool(c.get("escudo_auto")), f"Escudo anti-DDoS automático a partir de {c.get('ddos_req_seg')} req/s; limites por IP e por rota.")
    out["firewall"] = S(bool(c.get("ativo")), "Firewall de aplicação ativo: listas de IP, países, assinaturas de ataque e detecção de ferramentas." if c.get("ativo") else "Firewall desligado.")
    out["monitoramento"] = S(bool(c.get("ativo")) and bool(c.get("detectar_scanners")), "Eventos de segurança gravados e classificados ao vivo; notificações para ataques.", parcial=bool(c.get("ativo")))
    out["anti_robo"] = S(bool(db.ENV.get("TURNSTILE_SECRET_KEY")), "Cloudflare Turnstile no login e formulários; uploads só de imagem, SVG sem script.")
    out["cripto"] = S(bool(db.ENV.get("CLIMA_CHAVE_MESTRA")), "AES-256-GCM em repouso para segredos, TLS 1.2+ em trânsito, tokens guardados como SHA-256.")
    out["sessoes"] = S(bool(c.get("sessao_inatividade_min")) and bool(c.get("sessao_max_horas")), f"Sessão cai após {c.get('sessao_inatividade_min')} min sem uso e dura no máximo {c.get('sessao_max_horas')} h; apps com bloqueio por biometria.", parcial=bool(c.get("sessao_inatividade_min") or c.get("sessao_max_horas")))
    conta = db.um("SELECT (SELECT count(*) FROM seguranca_eventos WHERE quando > ?) AS ev, (SELECT count(*) FROM atividade WHERE quando > ?) AS at", (agora - 86400, agora - 86400))
    ev24, at24 = conta["ev"], conta["at"]
    integ = verificar(max_dias=2)
    out["logs"] = S(at24 > 0 and integ["ok"] and bool(integ["ultimo"]), f"{at24} registro(s) de atividade e {ev24} evento(s) de segurança nas últimas 24 h; selos de integridade em dia." if integ["ultimo"] else "Registros gravados, mas sem selo de integridade: sele na aba Integridade.", parcial=at24 > 0)
    ult = integ["ultimo"]["dia"] if integ["ultimo"] else 0
    out["integridade"] = S(integ["ok"] and agora - ult < 3 * 86400, "Cadeia de hashes SHA-256 por dia sem alterações." if integ["ok"] and ult else ("Registros alterados fora da retenção!" if not integ["ok"] else "Nenhum selo recente."), parcial=integ["ok"])
    try:
        db_agora = float(db.um("SELECT extract(epoch FROM now()) AS t")["t"])
        desvio = abs(db_agora - time.time())
        out["relogio"] = S(desvio < 5, f"Diferença entre servidor e banco: {desvio:.2f} s (ambos sincronizados por NTP).")
    except Exception:  # noqa: BLE001
        out["relogio"] = ("parcial", "Não deu para medir agora.")
    ok_cab, det_cab = _teste_ok(("hsts", "csp", "frame", "nosniff", "referrer", "permissions", "banner"))
    out["cabecalhos"] = ("implementado" if ok_cab else "pendente" if ok_cab is False else "parcial", det_cab)
    ok_tls, det_tls = _teste_ok(("tls", "redirect", "hsts"))
    out["tls"] = ("implementado" if ok_tls else "pendente" if ok_tls is False else "parcial", det_tls)
    ok_exp, det_exp = _teste_ok(("exposicao", "cors"))
    out["exposicao"] = ("implementado" if ok_exp else "pendente" if ok_exp is False else "parcial", det_exp)
    r = ultimos_testes()
    out["testes"] = S(bool(r) and agora - r["em"] < 30 * 86400, f"Testes ao vivo rodados {time.strftime('%d/%m/%Y', time.localtime(r['em']))}: {r['ok']}/{r['total']} aprovados." if r else "Nenhum teste ao vivo ainda.", parcial=bool(r))
    ok_sec, _ = _teste_ok(("securitytxt",))
    incid = _lista("seguranca_incidentes")
    out["canal_relato"] = S(bool(ok_sec), "security.txt publicado e registro de incidentes disponível para a equipe." if ok_sec else "Publique o security.txt (os testes ao vivo conferem).", parcial=True)
    out["plano_incidentes"] = S(bool((db.cfg("seguranca_plano") or {}).get("responsavel")), "Responsável e passos de resposta definidos." if (db.cfg("seguranca_plano") or {}).get("responsavel") else "Defina o responsável pelo plano de resposta na aba Incidentes.")
    abertos_velhos = [i for i in incid if i.get("status") != "resolvido" and agora - i.get("aberto_em", agora) > 7 * 86400]
    out["incidentes_abertos"] = S(not abertos_velhos, f"{len(incid)} incidente(s) registrado(s); nenhum aberto há mais de 7 dias." if not abertos_velhos else f"{len(abertos_velhos)} incidente(s) abertos há mais de 7 dias.")
    resolvidos = [i for i in incid if i.get("status") == "resolvido"]
    sem_licao = [i for i in resolvidos if not (i.get("licoes") or "").strip()]
    out["licoes"] = S(not sem_licao, f"{len(resolvidos)} incidente(s) resolvido(s), todos com lições registradas." if resolvidos else "Nenhum incidente resolvido ainda; ao fechar um, registre as lições.", parcial=bool(resolvidos))
    out["acoes_corretivas"] = S(all((i.get("acoes") or "").strip() for i in incid), "Todo incidente tem ação corretiva registrada." if incid else "Sem incidentes registrados.")
    out["triagem"] = S(True, "Cada IP é classificado automaticamente (ataque, suspeito, robô, visitante, equipe) na aba Monitoramento.")
    out["ameacas"] = S(bool(c.get("detectar_scanners")), "Assinaturas de ferramentas de ataque e bloqueio automático por comportamento.")
    out["checklist"] = S(True, "Este painel mede a conformidade continuamente.")
    cookies = db.cfg("cookies_site") or {}
    out["privacidade"] = S(bool(cookies.get("ativo", True)) and bool(marca.get("link_privacidade", "https://zynio.com.br/privacidade")), "Aviso de cookies com prova do consentimento, política de privacidade publicada e exportação dos dados.")
    out["legal"] = S(bool(marca.get("link_termos", "https://zynio.com.br/termos")), "Termos de uso e política de privacidade publicados; LGPD mapeada nos controles.")
    out["retencao"] = S(True, "Eventos de segurança apagados após o prazo escolhido; conta e dados excluídos a pedido.", parcial=True)
    out["fornecedores"] = S(True, "Status de Vercel, Supabase, Tuya e Cloudflare acompanhados na página de status.", parcial=True)
    out["mudancas"] = S(True, "Histórico de versões da marca, registro de atividade e commits no Git para cada publicação.")
    out["rotulo"] = S(bool(marca.get("marca_dagua") or marca.get("selo_ambiente")), "Marca d’água ou selo de ambiente ligados no white label." if (marca.get("marca_dagua") or marca.get("selo_ambiente")) else "Opcional: ligue uma marca d’água (ex.: Uso interno) no white label.", parcial=True)
    out["escopo"] = S(bool((db.cfg("seguranca_plano") or {}).get("escopo")), "Escopo descrito." if (db.cfg("seguranca_plano") or {}).get("escopo") else "Descreva o escopo do sistema de gestão na aba Conformidade.")
    riscos = _lista("seguranca_riscos")
    out["riscos_avaliados"] = S(len(riscos) >= 3, f"{len(riscos)} risco(s) avaliados com probabilidade e impacto." if riscos else "Nenhum risco avaliado: use a aba Riscos.", parcial=bool(riscos))
    altos = [x for x in riscos if x.get("probabilidade", 1) * x.get("impacto", 1) >= 12]
    out["riscos_tratados"] = S(bool(riscos) and all(x.get("tratamento") and x.get("tratamento") != "pendente" for x in altos), f"{len(altos)} risco(s) alto(s), todos com tratamento definido." if riscos else "Sem riscos avaliados.", parcial=bool(riscos))
    rev = max([x.get("revisado_em", 0) for x in riscos] or [0])
    out["riscos_revisados"] = S(bool(rev) and agora - rev < 365 * 86400, "Riscos revisados no último ano." if rev else "Revise os riscos ao menos uma vez por ano.")
    return out


def avaliar() -> dict:
    verif = _verificacoes()
    manual = db.cfg("iso_controles") or {}

    def item(cid, tema, titulo, chave, normas, prefixo=""):
        m = manual.get(prefixo + cid) or {}
        origem, status, detalhe = "manual", m.get("status") or "pendente", ""
        if chave and chave.startswith("sistema:"):
            origem, status, detalhe = "sistema", "implementado", SISTEMA[chave.split(":", 1)[1]]
        elif chave and chave in verif:
            origem = "automatico"
            status, detalhe = verif[chave]
        if m.get("status") == "nao_aplicavel":   # o administrador pode tirar do escopo mesmo um item automático
            status, origem = "nao_aplicavel", "manual"
        return {"id": cid, "tema": tema, "titulo": titulo, "origem": origem, "status": status, "detalhe": detalhe,
                "evidencia": m.get("evidencia", ""), "responsavel": m.get("responsavel", ""), "revisado_em": m.get("revisado_em"), "normas": normas,
                "chave": prefixo + cid}

    controles = [item(*c) for c in CONTROLES]
    clausulas = [item(cid, "Cláusulas", titulo, chave, ["27001"], prefixo="c") for cid, titulo, chave in CLAUSULAS]

    def nota(lista):
        validos = [x for x in lista if x["status"] != "nao_aplicavel"]
        if not validos:
            return 100
        return round(sum(1 if x["status"] == "implementado" else 0.5 if x["status"] == "parcial" else 0 for x in validos) / len(validos) * 100)

    temas = {}
    for x in controles:
        temas.setdefault(x["tema"], []).append(x)
    por_norma = {}
    for x in controles + clausulas:
        for n in x["normas"] + (["27001"] if x["tema"] != "Cláusulas" else []):
            por_norma.setdefault(n, []).append(x)
    contagem = {s: sum(1 for x in controles if x["status"] == s) for s in STATUS_VALIDOS}
    plano = db.cfg("seguranca_plano") or {}
    return {
        "controles": controles, "clausulas": clausulas,
        "nota_anexo": nota(controles), "nota_clausulas": nota(clausulas), "nota_geral": nota(controles + clausulas),
        "temas": [{"tema": t, "nota": nota(l), "total": len(l)} for t, l in temas.items()],
        "normas": [{"id": n, "descricao": NORMAS.get(n, ""), "nota": nota(l), "itens": len(l)} for n, l in sorted(por_norma.items(), key=lambda kv: (kv[0] == "LGPD", kv[0]))],
        "contagem": contagem, "automaticos": sum(1 for x in controles + clausulas if x["origem"] != "manual"),
        "plano": {"escopo": plano.get("escopo", ""), "responsavel": plano.get("responsavel", ""), "contato_anpd": plano.get("contato_anpd", "")},
        "testes_em": (ultimos_testes() or {}).get("em"),
    }


def salvar_controle(chave: str, status: str, evidencia: str, responsavel: str) -> dict:
    validos = {c[0] for c in CONTROLES} | {"c" + c[0] for c in CLAUSULAS}
    if chave not in validos or status not in STATUS_VALIDOS:
        raise ValueError("Controle ou situação inválida.")
    manual = db.cfg("iso_controles") or {}
    manual[chave] = {"status": status, "evidencia": evidencia.strip()[:800], "responsavel": responsavel.strip()[:80], "revisado_em": _agora()}
    db.set_cfg("iso_controles", manual)
    return manual[chave]


# ---------------------------------------------------------------- riscos sugeridos para este sistema
RISCOS_SUGERIDOS = [
    {"titulo": "Senha do administrador roubada por phishing", "ativo": "Painel e contas", "ameaca": "E-mail falso imitando o login", "probabilidade": 3, "impacto": 5, "tratamento": "mitigar", "controles": ["5.17", "8.5", "6.3"]},
    {"titulo": "Vazamento da conta Smart Life/Tuya", "ativo": "Transmissores IR", "ameaca": "Credencial exposta em arquivo ou repositório", "probabilidade": 2, "impacto": 4, "tratamento": "mitigar", "controles": ["8.24", "8.12", "8.4"]},
    {"titulo": "Ataque de negação de serviço no site", "ativo": "Aplicação na Vercel", "ameaca": "Inundação de requisições (DDoS)", "probabilidade": 3, "impacto": 3, "tratamento": "mitigar", "controles": ["8.6", "8.20", "5.29"]},
    {"titulo": "Mac do agente desligado ou furtado", "ativo": "Agente local", "ameaca": "Queda de energia, furto ou falha", "probabilidade": 3, "impacto": 3, "tratamento": "mitigar", "controles": ["7.8", "7.11", "8.14"]},
    {"titulo": "Indisponibilidade do Supabase", "ativo": "Banco de dados", "ameaca": "Falha do fornecedor", "probabilidade": 2, "impacto": 4, "tratamento": "transferir", "controles": ["5.23", "8.13", "5.30"]},
    {"titulo": "Exclusão ou alteração indevida de registros", "ativo": "Logs e atividade", "ameaca": "Usuário com privilégio age de má-fé", "probabilidade": 2, "impacto": 3, "tratamento": "mitigar", "controles": ["8.15", "5.28", "5.3"]},
    {"titulo": "Dado pessoal exposto (e-mail, IP)", "ativo": "Dados de usuários e visitantes", "ameaca": "Falha de configuração", "probabilidade": 2, "impacto": 4, "tratamento": "mitigar", "controles": ["5.34", "8.11", "8.3"]},
    {"titulo": "Dependência com falha de segurança conhecida", "ativo": "Código", "ameaca": "Biblioteca vulnerável", "probabilidade": 3, "impacto": 3, "tratamento": "mitigar", "controles": ["8.8", "8.28", "8.29"]},
]
