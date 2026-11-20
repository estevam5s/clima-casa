"""Defesas extras do firewall (20/11): inspeção do CORPO das requisições, iscas (honeypot), robôs de IA, ferramentas de
ataque, password spraying e prompt injection no Assistente de IA.

- corpo: SQL injection (inclusive às cegas: sleep/benchmark/pg_sleep/waitfor), NoSQL ($where/$ne/$gt), injeção de comando,
  SSTI ({{7*7}}, ${...}), XXE (<!ENTITY), Log4Shell (${jndi:), prototype pollution (__proto__) e travessia de pasta.
  As assinaturas são fortes de propósito (não é palavra solta como "select"): texto comum não cai aqui.
- iscas: caminhos que só robô visita (/wp-login.php, /.env, /.git/config…). Quem pede um é bloqueado na hora, por 24 h.
- robôs de IA (GPTBot, ClaudeBot, CCBot…) e ferramentas (Hydra, sqlmap, Nuclei, ffuf…) não entram na API.
- prompt injection: pedidos ao Assistente que tentam trocar as regras dele, pedir segredos ou o "prompt do sistema"
  são recusados e viram evento de segurança (o Assistente nunca vê chaves, mas a tentativa conta como ataque).
Nada aqui guarda o conteúdo inteiro: o evento leva só o trecho que casou (até 120 caracteres).
"""
from __future__ import annotations

import json
import re

# ---------------- assinaturas no corpo (JSON ou formulário) ----------------
SQLI = re.compile(
    r"(\bunion\b[\s/*]+(all[\s/*]+)?select\b|\bselect\b[\s\S]{1,80}\bfrom\b[\s\S]{0,40}\b(information_schema|pg_catalog|mysql\.user|sqlite_master)\b|"
    r"\b(sleep|pg_sleep|benchmark)\s*\(\s*\d|\bwaitfor\s+delay\b|'\s*(or|and)\s+'?\d+'?\s*=\s*'?\d+|'\s*or\s+'[^']*'\s*=\s*'|"
    r";\s*(drop|truncate|alter)\s+table\b|\bxp_cmdshell\b|\binto\s+(out|dump)file\b|\bload_file\s*\(|/\*!\d{5})", re.I)
NOSQL = re.compile(r'"\$(where|ne|gt|gte|lt|regex|expr|function)"\s*:', re.I)
COMANDO = re.compile(r"(;|\|\||&&|\||`|\$\()\s*(cat|curl|wget|nc|ncat|bash|sh|powershell|python3?|perl|chmod|rm)\s+[-/\w]", re.I)
SSTI = re.compile(r"(\{\{\s*\d+\s*[*+]\s*\d+\s*\}\}|\{\{[^}]*(__class__|__globals__|config\.items|self\._)|<%=?\s*\d+\s*\*\s*\d+\s*%>|#\{\s*\d+\s*\*\s*\d+\s*\})", re.I)
XXE = re.compile(r"<!(DOCTYPE|ENTITY)[^>]*(SYSTEM|PUBLIC)", re.I)
LOG4J = re.compile(r"\$\{\s*(jndi|lower|upper|env|sys)\s*:", re.I)
PROTO = re.compile(r'"(__proto__|constructor"\s*:\s*\{\s*"prototype)"\s*:', re.I)
TRAVESSIA = re.compile(r"(\.\./){2,}|(%2e%2e%2f){2,}|/etc/(passwd|shadow)|c:\\windows\\win\.ini", re.I)
ASSINATURAS = (("sqli", SQLI), ("nosql", NOSQL), ("comando", COMANDO), ("ssti", SSTI), ("xxe", XXE), ("log4shell", LOG4J),
               ("prototype", PROTO), ("travessia", TRAVESSIA))

# rotas cujo corpo é texto livre de gente autorizada ou que já tem verificação própria: não passam pelo filtro de corpo
CORPO_LIVRE = ("/api/telegram/webhook", "/api/email/webhook", "/api/iot/", "/api/ia/", "/api/supabase/sql", "/api/bugs")

# ---------------- iscas: só robô pede isto ----------------
ISCAS = re.compile(r"^/(wp-login\.php|wp-admin/?|xmlrpc\.php|\.env(\.\w+)?|\.git/(config|HEAD)|\.aws/credentials|phpmyadmin/?|"
                   r"admin\.php|config\.php|\.DS_Store|server-status|actuator/(env|heapdump)|vendor/phpunit/.*|boaform/.*|"
                   r"cgi-bin/.*|HNAP1|owa/auth/.*|\.svn/entries|backup\.(zip|sql|tar\.gz)|db\.sql|dump\.sql)$", re.I)

# ---------------- robôs de IA e ferramentas de ataque ----------------
ROBOS_IA = re.compile(r"GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|CCBot|PerplexityBot|Bytespider|"
                      r"Google-Extended|Amazonbot|cohere-ai|Diffbot|ImagesiftBot|Omgilibot|FacebookBot|Meta-ExternalAgent|"
                      r"Applebot-Extended|YouBot|AI2Bot|Scrapy|PetalBot", re.I)
FERRAMENTAS = re.compile(r"\b(hydra|thc-hydra|medusa|ncrack|patator|crowbar|brutus|wfuzz|dirb|skipfish|fimap|burp|"
                         r"zaproxy|owasp[ _-]?zap|xray|afrog|katana|dalfox|ghauri|sqlninja|jsql|bbqsql|nosqlmap|tplmap|"
                         r"interactsh|projectdiscovery|naabu|subfinder|gau/|waybackurls|wapiti|vega/|joomscan|droopescan)\b", re.I)


def inspecionar_corpo(rota: str, corpo: bytes) -> tuple[str, str] | None:
    """Devolve (tipo, trecho) se o corpo traz uma assinatura de ataque; None se está limpo."""
    if not corpo or rota.startswith(CORPO_LIVRE):
        return None
    try:
        texto = corpo[:65536].decode("utf-8", "ignore")
    except Exception:  # noqa: BLE001
        return None
    # JSON: olha o texto cru (chaves como "$ne" e "__proto__") E os valores já decodificados (\u0027 vira ', %27 também),
    # senão bastaria escrever o ataque com escapes para passar
    from urllib.parse import unquote_plus
    if texto.lstrip().startswith(("{", "[")):
        partes = [texto]
        dado = corpo_json(corpo[:65536])
        def juntar(v, prof=0):
            if prof > 12:
                return
            if isinstance(v, dict):
                for k, x in v.items():
                    partes.append(str(k)); juntar(x, prof + 1)
            elif isinstance(v, list):
                for x in v[:500]:
                    juntar(x, prof + 1)
            elif isinstance(v, str):
                partes.append(v); partes.append(unquote_plus(v))
        juntar(dado)
        alvo = "\n".join(partes)
    else:
        alvo = unquote_plus(texto)
    for tipo, rx in ASSINATURAS:
        m = rx.search(alvo)
        if m:
            return tipo, alvo[max(0, m.start() - 20): m.end() + 20][:120]
    return None


# ---------------- prompt injection (Assistente de IA no painel e no Telegram) ----------------
INJECAO = re.compile(
    r"(ignor[ae]\w*\s+(todas?\s+)?(as\s+)?(instru|regras|ordens|orienta)|ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+(instructions|rules)|"
    r"disregard\s+(all|previous|your)\s+(instructions|rules)|esque[çc]a\s+(tudo|as\s+regras|suas\s+instru)|"
    r"(mostre|revele|imprima|repita|me\s+(d[êe]|passe|mande))\s+(o\s+|seu\s+|teu\s+)?(prompt|system\s*prompt|instru[çc][õo]es\s+(do\s+)?sistema)|"
    r"(reveal|print|show|repeat)\s+(your\s+|the\s+)?(system\s*prompt|hidden\s+instructions)|"
    r"(qual|me\s+(d[êe]|passe|mande)|mostre|revele)\s+(a\s+|o\s+)?(chave|token|senha|api[\s_-]?key|segredo|local[\s_-]?key|service[\s_-]?role)|"
    r"\b(DAN|jailbreak|modo\s+desenvolvedor|developer\s+mode|god\s*mode)\b|voc[êe]\s+agora\s+[ée]\s+(um|uma|o|a)\s+|"
    r"you\s+are\s+now\s+(a|an|the)\s+|act\s+as\s+(an?\s+)?(unrestricted|unfiltered)|sem\s+(restri[çc][õo]es|filtros|regras)\b|"
    r"<\s*/?\s*(system|assistant|im_start|im_end)\s*>|\[\s*(system|INST)\s*\]|###\s*(system|instruction))", re.I)


def prompt_injection(texto: str) -> str | None:
    """Trecho que denuncia uma tentativa de mudar as regras do Assistente (ou None)."""
    m = INJECAO.search(texto or "")
    return (texto[max(0, m.start() - 10): m.end() + 30])[:120] if m else None


def resumo_regras() -> dict:
    """Para a tela de Segurança: o que está ligado (sem expor as expressões)."""
    return {"corpo": [t for t, _ in ASSINATURAS], "iscas": True, "robos_ia": True, "ferramentas": True, "prompt_injection": True,
            "spraying": True, "limite_corpo_mb": 4}


def corpo_json(corpo: bytes):
    try:
        return json.loads(corpo or b"null")
    except ValueError:
        return None
