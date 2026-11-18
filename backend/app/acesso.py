"""Usuários, papéis, permissões e escopo de projetos.

Cada conta do Supabase Auth que entra no sistema tem uma linha em `usuarios`:
  papel       dono > admin > subadmin > operador > visualizador (ou personalizado)
  permissoes  lista de chaves de PERMISSOES (o papel só sugere o conjunto inicial)
  projetos    "*" (todos) ou lista de ids: limita aparelhos, transmissores, cenas, agenda, relatórios...

As regras valem no backend para toda rota /api (ver `checar_rota`), não só na interface.
A primeira conta com app_metadata.role = "admin" que entrar vira "dono" sozinha.
"""
import contextvars
import json
import re

from fastapi import HTTPException

from . import db

PERMISSOES = {
    "aparelhos.controlar": ("Controle", "Ligar, desligar e ajustar os ares, executar cenas e automações"),
    "aparelhos.gerenciar": ("Controle", "Cadastrar, editar e apagar aparelhos e gravar botões"),
    "cenas.gerenciar": ("Controle", "Criar e editar cenas"),
    "agenda.gerenciar": ("Controle", "Criar e editar agendamentos"),
    "automacoes.gerenciar": ("Controle", "Criar e editar automações"),
    "transmissores.gerenciar": ("Controle", "Cadastrar, importar e reparar transmissores IR"),
    "projetos.gerenciar": ("Controle", "Criar, editar e apagar projetos (lugares)"),
    "relatorios.ver": ("Dados", "Ver e exportar relatórios"),
    "atividade.ver": ("Dados", "Ver a linha do tempo de atividade"),
    "mensagens.ver": ("Dados", "Ler as mensagens do site"),
    "integracoes.gerenciar": ("Sistema", "Alexa, Google, Sinric e Smart Life"),
    "seguranca.gerenciar": ("Sistema", "Firewall, IPs e relatórios de segurança"),
    "configuracoes.gerenciar": ("Sistema", "Configurações gerais, marca, backup e rotinas do Supabase"),
    "usuarios.gerenciar": ("Sistema", "Criar e editar usuários e permissões"),
}
TODAS = list(PERMISSOES)
PAPEIS = {
    "dono": {"rotulo": "Dono", "nivel": 100, "descricao": "Acesso total. Não pode ser removido nem rebaixado.", "permissoes": TODAS},
    "admin": {"rotulo": "Administrador", "nivel": 80, "descricao": "Acesso total, inclusive criar outros administradores.", "permissoes": TODAS},
    "subadmin": {"rotulo": "Subadministrador", "nivel": 60, "descricao": "Gerencia aparelhos, rotina e usuários abaixo dele. Sem firewall, integrações e configurações do sistema.",
                 "permissoes": [p for p in TODAS if p not in ("seguranca.gerenciar", "integracoes.gerenciar", "configuracoes.gerenciar")]},
    "operador": {"rotulo": "Operador", "nivel": 40, "descricao": "Usa os ares no dia a dia: controle, agenda, relatórios e atividade.",
                 "permissoes": ["aparelhos.controlar", "agenda.gerenciar", "relatorios.ver", "atividade.ver"]},
    "visualizador": {"rotulo": "Visualizador", "nivel": 20, "descricao": "Só olha: painel, relatórios e atividade.", "permissoes": ["relatorios.ver", "atividade.ver"]},
    "personalizado": {"rotulo": "Personalizado", "nivel": 30, "descricao": "Você escolhe cada permissão.", "permissoes": ["aparelhos.controlar"]},
}

# Regras por rota: (métodos, padrão da rota do FastAPI, permissão). A primeira que casar vale.
# Rotas não listadas: GET liberado para qualquer usuário logado; o resto exige "configuracoes.gerenciar".
REGRAS = [
    ("*", r"^/api/(sessao|perfil|notificacoes|conta|clima-externo|apps/qr|novidades)", None),
    ("POST", r"^/api/aparelhos/\{aid\}/(estado|estado-real|botoes/\{chave\}/enviar|temporizador)$", "aparelhos.controlar"),
    ("DELETE", r"^/api/aparelhos/\{aid\}/temporizador$", "aparelhos.controlar"),
    ("POST", r"^/api/(cenas|automacoes)/\{\w+\}/executar$", "aparelhos.controlar"),
    ("POST", r"^/api/alertas/", "aparelhos.controlar"),
    ("GET", r"^/api/gravacoes/", "aparelhos.gerenciar"),
    ("*", r"^/api/aparelhos/\{aid\}/sinric", "integracoes.gerenciar"),
    ("POST", r"^/api/aparelhos/\{aid\}/zona$", "transmissores.gerenciar"),   # este ar muda (ou não) junto com a zona
    ("POST|PUT|DELETE", r"^/api/aparelhos", "aparelhos.gerenciar"),
    ("POST|PUT|DELETE", r"^/api/cenas", "cenas.gerenciar"),
    ("POST|PUT|DELETE", r"^/api/agendamentos", "agenda.gerenciar"),
    ("POST|PUT|DELETE", r"^/api/automacoes", "automacoes.gerenciar"),
    ("*", r"^/api/hubs/descobrir", "transmissores.gerenciar"),
    ("POST", r"^/api/hubs/\{hid\}/todos$", "aparelhos.controlar"),
    ("POST", r"^/api/zonas/\{zid\}/estado$", "aparelhos.controlar"),   # comando de uma zona (ares que obedecem juntos)
    ("PUT", r"^/api/zonas$", "transmissores.gerenciar"),   # ligar/desligar todos os ares de um transmissor
    ("POST|PUT|DELETE", r"^/api/hubs", "transmissores.gerenciar"),
    ("POST", r"^/api/projetos/\{pid\}/desligar$", "aparelhos.controlar"),
    ("GET", r"^/api/projetos/\{pid\}/exportar$", "projetos.gerenciar"),
    ("POST|PUT|DELETE", r"^/api/projetos", "projetos.gerenciar"),
    ("PUT", r"^/api/mapa$", "projetos.gerenciar"),
    # ações rápidas do mapa (a própria rota ainda confere quem pode mudar cor/modelo e escrever no vidro)
    ("POST", r"^/api/mapa/elementos/\{eid\}/estado$", "aparelhos.controlar"),
    ("POST", r"^/api/mapa/ares/\{aid\}/aparencia$", "projetos.gerenciar"),
    ("POST", r"^/api/mapa/salas/\{pid\}/aparencia$", None),
    ("POST", r"^/api/apps/login/codigo$", None),
    ("POST", r"^/api/(conta/termo/aceitar|treinamento/responder)$", None),   # cada pessoa aceita o termo e faz o treinamento
    # cafeteira, persianas e fechadura: comandar = controlar ares; cadastrar/configurar = gerenciar transmissores;
    # a fechadura é conferida na rota (só dono/admin, e destrancar pede a senha)
    ("GET", r"^/api/avatares(/\{avid\}/(arquivo|receita))?$", None),
    ("GET", r"^/api/dispositivos(/\{did\}/eventos|/placas)?$", None),
    ("*", r"^/api/avatares", "configuracoes.gerenciar"),   # importar/apagar (a rota ainda exige dono/admin); ler é liberado acima
    ("POST", r"^/api/dispositivos/\{did\}/(comando|atualizar|cafe)$", "aparelhos.controlar"),
    ("*", r"^/api/dispositivos", "transmissores.gerenciar"),   # qualquer pessoa logada gera o código do próprio login no app   # a rota confere: cores = projetos.gerenciar; abrir porta = controlar
    ("PUT", r"^/api/mapa/(pessoas|escritas|personagens)$", "projetos.gerenciar"),
    # música: tocar/pausar é controle do dia a dia; conta, credenciais e rotinas são integração
    ("POST", r"^/api/musica/comando$", "aparelhos.controlar"),
    ("*", r"^/api/musica/(credenciais|desconectar|retorno|rotinas)", "integracoes.gerenciar"),
    ("*", r"^/api/(relatorios|metricas|painel/analise)", "relatorios.ver"),
    ("*", r"^/api/atividade", "atividade.ver"),
    ("*", r"^/api/site/(mensagens|conversas?|respostas-prontas)", "mensagens.ver"),
    ("*", r"^/api/site/cookies/(config|relatorio|consentimento/|exportar|escanear)", "configuracoes.gerenciar"),
    ("*", r"^/api/(sinric|tuya|alexa/(?!comandos)|oauth/aprovar)", "integracoes.gerenciar"),
    ("GET|PUT", r"^/api/alexa$", "integracoes.gerenciar"),
    ("*", r"^/api/seguranca", "seguranca.gerenciar"),
    ("*", r"^/api/usuarios", "usuarios.gerenciar"),
    ("*", r"^/api/(backup|supabase/)", "configuracoes.gerenciar"),
    ("*", r"^/api/marca/", "configuracoes.gerenciar"),
    ("PUT", r"^/api/(config|marca)$", "configuracoes.gerenciar"),
]
_REGRAS = [(set(m.split("|")) if m != "*" else None, re.compile(p), perm) for m, p, perm in REGRAS]
# rotas que mostram dados de TODOS os projetos de uma vez (backup, tabelas do banco): só para quem vê todos os projetos
_SO_ACESSO_TOTAL = re.compile(r"^/api/(backup|supabase/)")

atual = contextvars.ContextVar("clima_usuario", default=None)   # usuário da requisição (dict de usuarios + "perm")


def _json(v, padrao):
    if v is None:
        return padrao
    if not isinstance(v, str):
        return v
    # jsonb já vem decodificado pelo psycopg: '"*"' chega como o texto "*" (todos os projetos), que não é JSON.
    try:
        return json.loads(v)
    except ValueError:
        return v


def carregar(auth_user: dict) -> dict:
    """Linha de `usuarios` para a conta do Supabase; cria o dono na primeira entrada do admin antigo."""
    uid = auth_user["id"]
    u = db.um("SELECT * FROM usuarios WHERE id = ?", (uid,))
    if not u and (auth_user.get("app_metadata") or {}).get("role") == "admin":
        tem_dono = db.um("SELECT 1 FROM usuarios WHERE papel = 'dono' LIMIT 1")
        papel = "admin" if tem_dono else "dono"
        nome = (db.cfg("perfil_admin") or {}).get("nome", "") if not tem_dono else ""
        db.executar("INSERT INTO usuarios (id, email, nome, papel, permissoes, projetos, criado_em) VALUES (?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb),?) "
                    "ON CONFLICT (id) DO NOTHING", (uid, auth_user.get("email", ""), nome, papel, json.dumps(TODAS), json.dumps("*"), db.agora()))
        u = db.um("SELECT * FROM usuarios WHERE id = ?", (uid,))
    if not u:
        raise HTTPException(403, "Esta conta ainda não tem acesso ao sistema. Peça a um administrador.")
    if not u["ativo"]:
        raise HTTPException(403, "Esta conta está desativada. Fale com um administrador.")
    u["id"] = str(u["id"])
    u["permissoes"] = TODAS if u["papel"] in ("dono", "admin") else _json(u["permissoes"], [])
    u["projetos"] = "*" if u["papel"] in ("dono", "admin") else _json(u["projetos"], "*")
    u["aparelhos"] = "*" if u["papel"] in ("dono", "admin") else _json(u.get("aparelhos"), "*")   # ares sob responsabilidade
    if u["email"] != auth_user.get("email") and auth_user.get("email"):
        db.executar("UPDATE usuarios SET email = ? WHERE id = ?", (auth_user["email"], uid))
        u["email"] = auth_user["email"]
    return u


def pode(perm: str | None, u: dict | None = None) -> bool:
    u = u or atual.get()
    return perm is None or (u is not None and perm in u["permissoes"])


def checar_rota(metodo: str, rota: str, u: dict):
    for metodos, padrao, perm in _REGRAS:
        if (metodos is None or metodo in metodos) and padrao.search(rota):
            if not pode(perm, u):
                raise HTTPException(403, f"Seu usuário não tem permissão para isto ({PERMISSOES[perm][1].lower()}).")
            if _SO_ACESSO_TOTAL.search(rota) and u.get("projetos") != "*":
                raise HTTPException(403, "Isto mostra os dados de todos os projetos: só para quem tem acesso a todos.")
            return
    if metodo != "GET" and not pode("configuracoes.gerenciar", u):
        raise HTTPException(403, "Seu usuário não tem permissão para alterar isto.")


# ---------- escopo de projetos ----------
def projetos_permitidos() -> list[int] | None:
    """None = todos os projetos; lista = só esses."""
    u = atual.get()
    if not u or u["projetos"] == "*":
        return None
    return [int(p) for p in u["projetos"]]


def aparelhos_permitidos() -> set[int] | None:
    """Ares sob responsabilidade: None = todos os ares dos projetos do usuário; conjunto = só esses ares."""
    u = atual.get()
    if not u or u.get("aparelhos", "*") == "*":
        return None
    return {int(i) for i in u["aparelhos"]}


def filtro_aparelhos(coluna: str = "a.id") -> tuple[str, tuple]:
    """Trecho " AND coluna IN (...)" para quem cuida só de alguns ares; vazio para os outros."""
    p = aparelhos_permitidos()
    if p is None:
        return "", ()
    if not p:
        return " AND false", ()
    return f" AND {coluna} IN ({','.join('?' * len(p))})", tuple(sorted(p))


def checar_aparelho(aid):
    p = aparelhos_permitidos()
    if p is not None and (aid is None or int(aid) not in p):
        raise HTTPException(403, "Este ar não está sob sua responsabilidade.")


def checar_projeto(pid):
    p = projetos_permitidos()
    if p is not None and (pid is None or int(pid) not in p):
        raise HTTPException(403, "Você não tem acesso a esse projeto.")


def filtro_sql(coluna: str = "projeto_id") -> tuple[str, tuple]:
    """Trecho " AND coluna IN (...)" para listas; vazio quando o usuário vê tudo."""
    p = projetos_permitidos()
    if p is None:
        return "", ()
    if not p:
        return " AND false", ()
    return f" AND {coluna} IN ({','.join('?' * len(p))})", tuple(p)


_DONO_DO_ID = {
    "aid": ("SELECT projeto_id FROM aparelhos WHERE id = ?", r"^/api/aparelhos/"),
    "hub_id": ("SELECT projeto_id FROM hubs WHERE id = ?", r"^/api/hubs/"),
    "cid": ("SELECT projeto_id FROM cenas WHERE id = ?", r"^/api/cenas/"),
    "pid": ("SELECT id AS projeto_id FROM projetos WHERE id = ?", r"^/api/projetos/"),
    "gid": ("SELECT a.projeto_id FROM agendamentos g JOIN aparelhos a ON a.id = g.aparelho_id WHERE g.id = ?", r"^/api/agendamentos/"),
}


def checar_escopo(rota: str, params: dict, query: dict):
    if "aid" in params and re.search(r"^/api/aparelhos/", rota):   # quem cuida só de alguns ares
        try:
            checar_aparelho(int(params["aid"]))
        except (TypeError, ValueError):
            pass
    if projetos_permitidos() is None:
        return
    if query.get("projeto_id"):
        checar_projeto(query["projeto_id"])
    for nome, (sql, padrao) in _DONO_DO_ID.items():
        if nome in params and re.search(padrao, rota):
            linha = db.um(sql, (params[nome],))
            if linha:
                checar_projeto(linha["projeto_id"])


def resumo(u: dict) -> dict:
    return {"id": u["id"], "email": u["email"], "nome": u["nome"], "cargo": u["cargo"], "papel": u["papel"],
            "papel_rotulo": PAPEIS.get(u["papel"], {}).get("rotulo", u["papel"]), "permissoes": u["permissoes"],
            "projetos": u["projetos"], "aparelhos": u.get("aparelhos", "*"), "exige_troca_senha": u["exige_troca_senha"]}
