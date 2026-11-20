"""Painel do Supabase dentro do sistema: visão geral, editor de tabelas (só leitura), estrutura, SQL somente leitura,
usuários do Auth, registros das rotinas, desempenho das consultas e avisos (RLS, chaves, índices).

Regras de segurança:
- só o schema public aparece no editor de tabelas; o nome da tabela é conferido contra o catálogo antes de virar SQL;
- colunas com cara de segredo (chave, token, hash, senha…) e valores cifrados ("enc:v1:") saem mascarados;
- o SQL roda numa transação READ ONLY, com tempo máximo, um comando só e sem acesso aos schemas internos.
"""
import datetime as dt
import decimal
import json
import re
import time
import uuid

from . import db

SENSIVEL = re.compile(r"(^|_)(key|secret|segredo|token|hash|senha|password|credencial|credential|desafio|challenge|otp|recovery|"
                      r"sign_count)(_|$)|^chave_|_chave$|token|secret|^codigo$|^prova$|^cifrado$", re.I)
MASCARA = "••••••"
LIMITE_TEXTO = 400

# schemas e funções que o editor SQL não deixa tocar
SQL_BLOQUEADO = re.compile(
    r"\b(auth|vault|storage|pgsodium|supabase_functions|net|realtime|graphql|graphql_public|supabase_migrations)\s*\.|"
    r"\b(pg_authid|pg_shadow|pg_user_mapping|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|"
    r"dblink\w*|pg_sleep\w*|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|pg_rotate_logfile|"
    r"pg_file_write|copy|query_to_xml\w*|decrypted_secrets)\b", re.I)
SQL_INICIO = re.compile(r"^\s*(select|with|explain|show|table|values)\b", re.I)


def _valor(nome_col: str, v):
    if v is None or isinstance(v, bool):
        return v
    if SENSIVEL.search(nome_col):
        return MASCARA
    if isinstance(v, str) and "enc:v1:" in v[:12]:
        return "[cifrado]"
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(v))} bytes>"
    if isinstance(v, (dict, list)):
        return _limpar_json(v)
    if isinstance(v, dt.timedelta):
        return str(v)
    if isinstance(v, str) and len(v) > LIMITE_TEXTO:
        return v[:LIMITE_TEXTO] + "…"
    return v


def _limpar_json(v, prof=0):
    """Máscara recursiva em JSON: chaves com cara de segredo e textos cifrados."""
    if prof > 6:
        return "…"
    if isinstance(v, dict):
        return {k: (MASCARA if SENSIVEL.search(str(k)) and val not in (None, "", [], {}) else _limpar_json(val, prof + 1)) for k, val in v.items()}
    if isinstance(v, list):
        return [_limpar_json(x, prof + 1) for x in v[:200]]
    if isinstance(v, str):
        return "[cifrado]" if "enc:v1:" in v[:12] else (v[:LIMITE_TEXTO] + "…" if len(v) > LIMITE_TEXTO else v)
    return v


def _linha(d: dict) -> dict:
    return {k: _valor(k, v) for k, v in d.items()}


def _tabelas_validas() -> set:
    return {r["t"] for r in db.consultar("SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'")}


def _conferir(nome: str) -> str:
    if nome not in _tabelas_validas():
        raise ValueError("Tabela não encontrada no schema public.")
    return '"' + nome.replace('"', '""') + '"'


# ---------------- visão geral ----------------
def visao() -> dict:
    base = db.um("""SELECT version() AS versao, extract(epoch FROM pg_postmaster_start_time())::bigint AS iniciado_em,
        pg_database_size(current_database()) AS bytes,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS conexoes,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS conexoes_ativas,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conexoes,
        (SELECT round(100.0 * sum(blks_hit) / nullif(sum(blks_hit) + sum(blks_read), 0), 2) FROM pg_stat_database WHERE datname = current_database()) AS cache_hit,
        (SELECT round(100.0 * sum(idx_scan) / nullif(sum(idx_scan) + sum(seq_scan), 0), 2) FROM pg_stat_user_tables) AS uso_indice,
        (SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname = current_database()) AS transacoes,
        (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') AS tabelas,
        (SELECT coalesce(sum(n_live_tup), 0) FROM pg_stat_user_tables WHERE schemaname = 'public') AS linhas,
        (SELECT count(*) FROM auth.users) AS usuarios_auth,
        (SELECT count(*) FROM auth.mfa_factors WHERE status = 'verified') AS fatores_mfa,
        (SELECT count(*) FROM auth.sessions) AS sessoes_auth,
        (SELECT count(*) FROM cron.job WHERE jobname LIKE 'clima_%') AS rotinas,
        (SELECT count(*) FROM pg_policies WHERE schemaname = 'public') AS politicas""")
    v = {k: _valor(k, x) for k, x in base.items()}
    v["versao_curta"] = re.sub(r"^PostgreSQL ([\d.]+).*", r"\1", base["versao"])
    v["extensoes"] = db.consultar("SELECT e.extname AS nome, e.extversion AS versao, n.nspname AS schema FROM pg_extension e "
                                  "JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1")
    v["projeto"] = db.REF
    v["regiao"] = "us-east-2 (Ohio)"
    v["maiores"] = [_linha(r) for r in db.consultar(
        "SELECT relname AS tabela, pg_total_relation_size(relid) AS bytes, n_live_tup AS linhas FROM pg_stat_user_tables "
        "WHERE schemaname = 'public' ORDER BY 2 DESC LIMIT 8")]
    return v


# ---------------- tabelas ----------------
def tabelas() -> list:
    linhas = db.consultar("""
        SELECT c.relname AS nome, c.relrowsecurity AS rls, coalesce(s.n_live_tup, 0) AS linhas,
               pg_total_relation_size(c.oid) AS bytes, pg_relation_size(c.oid) AS bytes_dados,
               (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
               (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS indices,
               (SELECT count(*) FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = c.relname) AS colunas,
               EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary) AS tem_pk,
               coalesce(s.seq_scan, 0) AS leituras_seq, coalesce(s.idx_scan, 0) AS leituras_indice,
               coalesce(s.n_tup_ins, 0) AS inseridas, coalesce(s.n_tup_upd, 0) AS atualizadas, coalesce(s.n_tup_del, 0) AS apagadas,
               extract(epoch FROM greatest(s.last_autovacuum, s.last_vacuum))::bigint AS vacuum_em,
               obj_description(c.oid) AS descricao
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname""")
    return [_linha(r) for r in linhas]


def estrutura(nome: str) -> dict:
    _conferir(nome)
    colunas = db.consultar("""
        SELECT k.column_name AS nome, k.data_type AS tipo, k.udt_name AS tipo_pg, k.is_nullable = 'YES' AS nulo,
               k.column_default AS padrao, k.is_identity = 'YES' AS identidade, k.ordinal_position AS ordem,
               col_description(format('public.%I', k.table_name)::regclass, k.ordinal_position) AS descricao
        FROM information_schema.columns k WHERE k.table_schema = 'public' AND k.table_name = ? ORDER BY k.ordinal_position""", (nome,))
    pk = {r["c"] for r in db.consultar("""SELECT a.attname AS c FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid
        AND a.attnum = ANY(i.indkey) WHERE i.indrelid = format('public.%I', CAST(? AS text))::regclass AND i.indisprimary""", (nome,))}
    fks = db.consultar("""
        SELECT con.conname AS nome, pg_get_constraintdef(con.oid) AS definicao, cf.relname AS referencia
        FROM pg_constraint con JOIN pg_class cf ON cf.oid = con.confrelid
        WHERE con.conrelid = format('public.%I', CAST(? AS text))::regclass AND con.contype = 'f'""", (nome,))
    entrando = db.consultar("""
        SELECT con.conname AS nome, c.relname AS tabela, pg_get_constraintdef(con.oid) AS definicao
        FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
        WHERE con.confrelid = format('public.%I', CAST(? AS text))::regclass AND con.contype = 'f'""", (nome,))
    restricoes = db.consultar("""SELECT conname AS nome, contype AS tipo, pg_get_constraintdef(oid) AS definicao FROM pg_constraint
        WHERE conrelid = format('public.%I', CAST(? AS text))::regclass AND contype IN ('p','u','c') ORDER BY contype, conname""", (nome,))
    indices = db.consultar("""
        SELECT i.indexrelname AS nome, pg_get_indexdef(i.indexrelid) AS definicao, pg_relation_size(i.indexrelid) AS bytes,
               i.idx_scan AS usos, x.indisunique AS unico, x.indisprimary AS primario
        FROM pg_stat_user_indexes i JOIN pg_index x ON x.indexrelid = i.indexrelid
        WHERE i.schemaname = 'public' AND i.relname = ? ORDER BY i.indexrelname""", (nome,))
    politicas = db.consultar("""SELECT policyname AS nome, cmd AS comando, roles::text AS papeis, permissive AS tipo,
        qual AS usando, with_check AS checagem FROM pg_policies WHERE schemaname = 'public' AND tablename = ? ORDER BY policyname""", (nome,))
    gatilhos = db.consultar("""SELECT tgname AS nome, pg_get_triggerdef(oid) AS definicao FROM pg_trigger
        WHERE tgrelid = format('public.%I', CAST(? AS text))::regclass AND NOT tgisinternal""", (nome,))
    for c in colunas:
        c["pk"] = c["nome"] in pk
        c["sensivel"] = bool(SENSIVEL.search(c["nome"]))
    return {"nome": nome, "colunas": colunas, "fks": fks, "referenciada_por": entrando, "restricoes": restricoes,
            "indices": [_linha(i) for i in indices], "politicas": politicas, "gatilhos": gatilhos,
            "rls": bool(db.um("SELECT relrowsecurity AS r FROM pg_class WHERE oid = format('public.%I', CAST(? AS text))::regclass", (nome,))["r"]),
            "ddl": _ddl(nome, colunas, restricoes)}


def _ddl(nome, colunas, restricoes) -> str:
    partes = []
    for c in colunas:
        t = c["tipo_pg"] if c["tipo"] in ("USER-DEFINED", "ARRAY") else c["tipo"]
        linha = f'  "{c["nome"]}" {t}'
        if c["identidade"]:
            linha += " GENERATED BY DEFAULT AS IDENTITY"
        elif c["padrao"]:
            linha += f" DEFAULT {c['padrao']}"
        if not c["nulo"]:
            linha += " NOT NULL"
        partes.append(linha)
    partes += [f'  CONSTRAINT "{r["nome"]}" {r["definicao"]}' for r in restricoes]
    return f'CREATE TABLE public."{nome}" (\n' + ",\n".join(partes) + "\n);"


def linhas_tabela(nome: str, pagina: int = 1, por_pagina: int = 50, ordem: str = "", direcao: str = "desc", busca: str = "") -> dict:
    ident = _conferir(nome)
    cols = [r["c"] for r in db.consultar("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = 'public' "
                                          "AND table_name = ? ORDER BY ordinal_position", (nome,))]
    tipos = {r["c"]: r["t"] for r in db.consultar("SELECT column_name AS c, data_type AS t FROM information_schema.columns "
                                                    "WHERE table_schema = 'public' AND table_name = ?", (nome,))}
    por_pagina = max(10, min(int(por_pagina), 200))
    pagina = max(1, int(pagina))
    if ordem not in cols:
        ordem = "id" if "id" in cols else (cols[0] if cols else "")
    dir_sql = "ASC" if direcao == "asc" else "DESC"
    onde, params = "", []
    if busca.strip():
        pesquisaveis = [c for c in cols if not SENSIVEL.search(c)]
        if pesquisaveis:
            onde = "WHERE concat_ws(' ', " + ", ".join(f'"{c}"::text' for c in pesquisaveis) + ") ILIKE ?"
            params.append(f"%{busca.strip()[:100]}%")
    total = db.um(f"SELECT count(*) AS n FROM public.{ident} {onde}", tuple(params))["n"]
    ord_sql = f'ORDER BY "{ordem}" {dir_sql} NULLS LAST' if ordem else ""
    linhas = db.consultar(f"SELECT * FROM public.{ident} {onde} {ord_sql} LIMIT ? OFFSET ?",
                          tuple(params) + (por_pagina, (pagina - 1) * por_pagina))
    return {"colunas": [{"nome": c, "tipo": tipos.get(c, ""), "sensivel": bool(SENSIVEL.search(c))} for c in cols],
            "linhas": [_linha(r) for r in linhas], "total": total, "pagina": pagina, "por_pagina": por_pagina,
            "ordem": ordem, "direcao": dir_sql.lower()}


# ---------------- SQL somente leitura ----------------
def _limpar_sql(sql: str) -> str:
    s = re.sub(r"--[^\n]*", " ", sql)
    s = re.sub(r"/\*.*?\*/", " ", s, flags=re.S)
    return s.strip().rstrip(";").strip()


def rodar_sql(sql: str, limite: int = 500) -> dict:
    texto = _limpar_sql(sql or "")
    if not texto:
        raise ValueError("Escreva uma consulta.")
    if len(texto) > 20000:
        raise ValueError("Consulta grande demais (máximo de 20 mil caracteres).")
    if ";" in texto:
        raise ValueError("Rode um comando por vez (sem ponto e vírgula no meio).")
    if not SQL_INICIO.match(texto):
        raise ValueError("Só consultas de leitura: SELECT, WITH, EXPLAIN, SHOW, TABLE ou VALUES.")
    proibido = SQL_BLOQUEADO.search(texto)
    if proibido:
        raise ValueError(f"Por segurança, o editor não acessa “{proibido.group(0).strip(' .')}”. Use as abas Autenticação e Rotinas.")
    if re.search(r"\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|vacuum|reindex|cluster|lock|call|do|"
                 r"refresh|security|nextval|setval|pg_advisory\w*)\b", re.sub(r"'(?:[^']|'')*'", "''", texto), re.I):
        raise ValueError("Essa consulta tem um comando que altera dados. O editor é só de leitura.")
    limite = max(1, min(int(limite), 1000))
    inicio = time.perf_counter()
    with db.conexao() as con:
        con.execute("SET TRANSACTION READ ONLY")
        con.execute("SET LOCAL statement_timeout = '8s'")
        con.execute("SET LOCAL idle_in_transaction_session_timeout = '15s'")
        cur = con.execute(texto)
        colunas = [d.name for d in cur.description] if cur.description else []
        linhas = cur.fetchmany(limite + 1) if cur.description else []
    ms = round((time.perf_counter() - inicio) * 1000, 1)
    cortado = len(linhas) > limite
    return {"colunas": colunas, "linhas": [_linha(r) for r in linhas[:limite]], "ms": ms, "cortado": cortado,
            "total": min(len(linhas), limite)}


# ---------------- Auth ----------------
def usuarios_auth() -> list:
    linhas = db.consultar("""
        SELECT u.id, u.email, extract(epoch FROM u.created_at)::bigint AS criado_em,
               extract(epoch FROM u.last_sign_in_at)::bigint AS ultimo_login,
               u.email_confirmed_at IS NOT NULL AS confirmado, u.banned_until > now() AS suspenso,
               u.raw_app_meta_data->>'role' AS papel_auth, u.is_anonymous AS anonimo,
               coalesce((SELECT array_agg(DISTINCT i.provider) FROM auth.identities i WHERE i.user_id = u.id), '{}') AS provedores,
               (SELECT count(*) FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified') AS fatores,
               (SELECT count(*) FROM auth.sessions s WHERE s.user_id = u.id) AS sessoes,
               p.papel, p.nome
        FROM auth.users u LEFT JOIN public.usuarios p ON p.id = u.id ORDER BY u.created_at""")
    return [{k: (list(v) if isinstance(v, (list, tuple)) else _valor("x" if k in ("email", "nome") else k, v)) for k, v in r.items()} for r in linhas]


# ---------------- registros e desempenho ----------------
def registros(status: str = "", limite: int = 150) -> dict:
    filtro = "AND d.status = ?" if status in ("succeeded", "failed", "running") else ""
    params = (status,) if filtro else ()
    exec_ = db.consultar(f"""
        SELECT d.runid AS id, j.jobname AS rotina, d.status, d.return_message AS mensagem,
               extract(epoch FROM d.start_time)::bigint AS inicio,
               round(extract(epoch FROM (d.end_time - d.start_time)) * 1000)::int AS duracao_ms
        FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
        WHERE j.jobname LIKE 'clima_%' {filtro} ORDER BY d.start_time DESC LIMIT ?""", params + (min(int(limite), 500),))
    por_hora = db.consultar("""SELECT to_char(date_trunc('hour', d.start_time) at time zone 'America/Sao_Paulo', 'DD/MM HH24"h"') AS hora,
        count(*) FILTER (WHERE d.status = 'succeeded') AS ok, count(*) FILTER (WHERE d.status = 'failed') AS falhas
        FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
        WHERE j.jobname LIKE 'clima_%' AND d.start_time > now() - interval '24 hours'
        GROUP BY date_trunc('hour', d.start_time) ORDER BY date_trunc('hour', d.start_time)""")
    return {"execucoes": exec_, "por_hora": por_hora}


def desempenho() -> dict:
    consultas = []
    try:
        consultas = db.consultar("""
            SELECT left(regexp_replace(query, '\\s+', ' ', 'g'), 300) AS consulta, calls AS chamadas,
                   round(total_exec_time::numeric, 1) AS total_ms, round(mean_exec_time::numeric, 2) AS media_ms,
                   round(max_exec_time::numeric, 1) AS max_ms, rows AS linhas
            FROM extensions.pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
            WHERE r.rolname = current_user AND query NOT ILIKE '%pg_stat_statements%'
            ORDER BY total_exec_time DESC LIMIT 20""")
    except Exception:  # noqa: BLE001 - extensão pode não estar acessível
        consultas = []
    conexoes = db.consultar("""SELECT coalesce(state, 'sem estado') AS estado, coalesce(nullif(application_name, ''), usename::text, 'interno') AS app,
        count(*) AS n FROM pg_stat_activity WHERE datname = current_database() GROUP BY 1, 2 ORDER BY 3 DESC""")
    return {"consultas": [_linha(c) for c in consultas], "conexoes": conexoes}


# ---------------- avisos (como o "Advisors" do Supabase) ----------------
def avisos() -> list:
    lista = []
    for t in tabelas():
        if not t["rls"]:
            lista.append({"nivel": "erro", "tipo": "Segurança", "titulo": f"RLS desligado em {t['nome']}",
                          "detalhe": "Com a chave pública, qualquer pessoa poderia ler ou mudar esta tabela pela API REST.",
                          "correcao": f'ALTER TABLE public."{t["nome"]}" ENABLE ROW LEVEL SECURITY;'})
        elif not t["politicas"]:
            lista.append({"nivel": "info", "tipo": "Segurança", "titulo": f"{t['nome']}: RLS ligado sem política",
                          "detalhe": "Ninguém acessa pela API pública (só o servidor). Seguro; confira se é o desejado.", "correcao": ""})
        if not t["tem_pk"]:
            lista.append({"nivel": "alerta", "tipo": "Desempenho", "titulo": f"{t['nome']} sem chave primária",
                          "detalhe": "Sem chave primária, atualizações e replicação ficam mais lentas e arriscadas.", "correcao": ""})
        if t["linhas"] > 5000 and t["leituras_seq"] > 10 * max(1, t["leituras_indice"]):
            lista.append({"nivel": "alerta", "tipo": "Desempenho", "titulo": f"{t['nome']}: muitas leituras sem índice",
                          "detalhe": f"{t['leituras_seq']} leituras sequenciais contra {t['leituras_indice']} por índice.", "correcao": ""})
    for fk in db.consultar("""
        SELECT c.conrelid::regclass::text AS tabela, a.attname AS coluna FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND NOT EXISTS (
          SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1])"""):
        lista.append({"nivel": "info", "tipo": "Desempenho", "titulo": f"Chave estrangeira sem índice: {fk['tabela']}.{fk['coluna']}",
                      "detalhe": "Apagar na tabela referenciada fica lento quando a coluna não tem índice.",
                      "correcao": f'CREATE INDEX ON {fk["tabela"]} ("{fk["coluna"]}");'})
    for i in db.consultar("""SELECT s.relname AS tabela, s.indexrelname AS indice, pg_relation_size(s.indexrelid) AS bytes
        FROM pg_stat_user_indexes s JOIN pg_index x ON x.indexrelid = s.indexrelid
        WHERE s.schemaname = 'public' AND s.idx_scan = 0 AND NOT x.indisprimary AND NOT x.indisunique
          AND pg_relation_size(s.indexrelid) > 65536"""):
        lista.append({"nivel": "info", "tipo": "Desempenho", "titulo": f"Índice nunca usado: {i['indice']}",
                      "detalhe": f"Ocupa {round(i['bytes'] / 1024)} KB em {i['tabela']} e deixa as gravações mais lentas.", "correcao": ""})
    sem_mfa = db.consultar("""SELECT u.email FROM auth.users u JOIN public.usuarios p ON p.id = u.id
        WHERE p.papel IN ('dono', 'admin') AND NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = u.id AND f.status = 'verified')
          AND NOT EXISTS (SELECT 1 FROM public.passkeys k WHERE k.usuario_id = u.id)""")
    for u in sem_mfa:
        lista.append({"nivel": "alerta", "tipo": "Autenticação", "titulo": "Administrador sem verificação em duas etapas",
                      "detalhe": f"{u['email']} entra só com senha. Cadastre o autenticador ou a biometria.", "correcao": ""})
    ordem = {"erro": 0, "alerta": 1, "info": 2}
    return sorted(lista, key=lambda x: ordem[x["nivel"]])


# ---------------- catálogo avançado (20/11): índices, RLS, funções, gatilhos, extensões, conexões, bloqueios, ----------------
# storage, realtime, manutenção, cache, relações (diagrama do esquema) e tipos. Lista FECHADA de consultas: nada do usuário
# vira SQL; só o schema public (e contagens de storage/realtime, sem conteúdo). Texto de consulta das conexões sai mascarado.
CATALOGO = {
    "indices": """SELECT s.relname AS tabela, s.indexrelname AS indice, pg_get_indexdef(s.indexrelid) AS definicao,
        pg_relation_size(s.indexrelid) AS bytes, s.idx_scan AS usos, s.idx_tup_read AS lidas, x.indisunique AS unico, x.indisprimary AS primaria
        FROM pg_stat_user_indexes s JOIN pg_index x ON x.indexrelid = s.indexrelid WHERE s.schemaname = 'public'
        ORDER BY pg_relation_size(s.indexrelid) DESC""",
    "politicas": """SELECT c.relname AS tabela, c.relrowsecurity AS rls, c.relforcerowsecurity AS rls_forcado, p.policyname AS politica,
        p.cmd AS comando, p.permissive AS tipo, array_to_string(p.roles, ', ') AS papeis, p.qual AS usando, p.with_check AS checagem
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
        WHERE c.relkind IN ('r', 'p') ORDER BY c.relname, p.policyname""",
    "funcoes": """SELECT p.proname AS nome, pg_get_function_arguments(p.oid) AS argumentos, pg_get_function_result(p.oid) AS retorno,
        l.lanname AS linguagem, p.prosecdef AS security_definer, p.provolatile AS volatilidade,
        coalesce(array_to_string(p.proconfig, ', '), '') AS config, length(p.prosrc) AS tamanho
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' JOIN pg_language l ON l.oid = p.prolang
        WHERE p.prokind = 'f' ORDER BY p.proname""",
    "gatilhos": """SELECT c.relname AS tabela, t.tgname AS gatilho, pg_get_triggerdef(t.oid) AS definicao, t.tgenabled <> 'D' AS ativo
        FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
        WHERE NOT t.tgisinternal ORDER BY c.relname, t.tgname""",
    "extensoes": """SELECT a.name AS nome, a.default_version AS versao_disponivel, e.extversion AS versao_instalada,
        n.nspname AS schema, a.comment AS descricao
        FROM pg_available_extensions a LEFT JOIN pg_extension e ON e.extname = a.name LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
        ORDER BY (e.extversion IS NULL), a.name""",
    "conexoes": """SELECT pid, coalesce(usename::text, 'interno') AS usuario, coalesce(nullif(application_name, ''), backend_type) AS app,
        coalesce(state, '') AS estado, coalesce(wait_event_type || ': ' || wait_event, '') AS espera,
        extract(epoch FROM now() - backend_start)::int AS conectado_s,
        CASE WHEN state = 'active' THEN extract(epoch FROM now() - query_start)::numeric(10,2) END AS consulta_s,
        left(regexp_replace(coalesce(query, ''), '\\s+', ' ', 'g'), 160) AS consulta
        FROM pg_stat_activity WHERE datname = current_database() ORDER BY state = 'active' DESC, backend_start""",
    "bloqueios": """SELECT l.locktype AS tipo, coalesce(c.relname, '') AS objeto, l.mode AS modo, l.granted AS concedido, l.pid,
        coalesce(a.application_name, '') AS app, extract(epoch FROM now() - a.query_start)::int AS ha_s
        FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation LEFT JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.pid <> pg_backend_pid() AND (c.relname IS NULL OR c.relname NOT LIKE 'pg\\_%') ORDER BY l.granted, l.pid LIMIT 200""",
    "storage": """SELECT b.id AS bucket, b.public AS publico, b.file_size_limit AS limite_bytes,
        coalesce(array_to_string(b.allowed_mime_types, ', '), '') AS tipos, count(o.id) AS arquivos,
        coalesce(sum((o.metadata->>'size')::bigint), 0) AS bytes, max(o.created_at) AS ultimo
        FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id GROUP BY b.id, b.public, b.file_size_limit, b.allowed_mime_types
        ORDER BY 6 DESC""",
    "realtime": """SELECT p.pubname AS publicacao, coalesce(t.schemaname || '.' || t.tablename, '') AS tabela,
        p.pubinsert AS insere, p.pubupdate AS atualiza, p.pubdelete AS apaga
        FROM pg_publication p LEFT JOIN pg_publication_tables t ON t.pubname = p.pubname ORDER BY 1, 2""",
    "manutencao": """SELECT relname AS tabela, n_live_tup AS vivas, n_dead_tup AS mortas,
        CASE WHEN n_live_tup + n_dead_tup > 0 THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 1) ELSE 0 END AS mortas_pct,
        extract(epoch FROM greatest(last_vacuum, last_autovacuum))::bigint AS ultimo_vacuum,
        extract(epoch FROM greatest(last_analyze, last_autoanalyze))::bigint AS ultimo_analyze,
        autovacuum_count + vacuum_count AS vacuums, n_tup_ins AS insercoes, n_tup_upd AS atualizacoes, n_tup_del AS remocoes,
        pg_total_relation_size(relid) AS bytes
        FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_dead_tup DESC""",
    "cache": """SELECT 'tabelas' AS tipo, sum(heap_blks_hit) AS acertos, sum(heap_blks_read) AS leituras_disco,
        round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS taxa
        FROM pg_statio_user_tables
        UNION ALL SELECT 'índices', sum(idx_blks_hit), sum(idx_blks_read),
        round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) FROM pg_statio_user_indexes""",
    "relacoes": """SELECT c.conname AS nome, c.conrelid::regclass::text AS de, a.attname AS coluna, c.confrelid::regclass::text AS para,
        af.attname AS coluna_para, c.confdeltype AS ao_apagar
        FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = c.confkey[1]
        WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace ORDER BY 2""",
    "tipos": """SELECT t.typname AS tipo, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS valores
        FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
        GROUP BY t.typname ORDER BY 1""",
    "configuracao": """SELECT name AS parametro, setting AS valor, coalesce(unit, '') AS unidade, category AS categoria, short_desc AS descricao
        FROM pg_settings WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size',
        'statement_timeout', 'idle_in_transaction_session_timeout', 'timezone', 'server_version', 'wal_level', 'max_wal_size',
        'random_page_cost', 'default_transaction_isolation', 'ssl', 'log_min_duration_statement', 'autovacuum', 'max_worker_processes',
        'lock_timeout', 'search_path') ORDER BY category, name""",
}
VOLATIL = {"i": "immutable", "s": "stable", "v": "volatile"}
AO_APAGAR = {"a": "nada", "r": "restringe", "c": "cascata", "n": "anula", "d": "padrão"}
_SEGREDO_SQL = re.compile(r"('[^']{16,}'|\$\d+|enc:v1:\S+)")


def catalogo(tipo: str) -> list:
    sql = CATALOGO.get(tipo)
    if not sql:
        raise ValueError("Consulta desconhecida.")
    linhas = [_linha(dict(r)) for r in db.consultar(sql)]
    for r in linhas:
        if "volatilidade" in r:
            r["volatilidade"] = VOLATIL.get(r["volatilidade"], r["volatilidade"])
        if "ao_apagar" in r:
            r["ao_apagar"] = AO_APAGAR.get(r["ao_apagar"], r["ao_apagar"])
        if tipo == "conexoes" and r.get("consulta"):
            r["consulta"] = _SEGREDO_SQL.sub("'…'", r["consulta"])   # literais longos podem ser chaves: nunca saem
    return linhas
