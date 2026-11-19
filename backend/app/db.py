"""Banco de dados no Supabase (Postgres via pooler, TLS verificado). O esquema está em supabase/schema.sql.

As consultas usam "?" como marcador (convertido para o formato do psycopg). Autocommit: uma ida à rede por consulta.
Mantém um pequeno pool de conexões persistentes e reconecta sozinho se a conexão cair.
"""
import json
import os
import queue
import re
import threading
import time
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

RAIZ = Path(__file__).resolve().parents[2]
DADOS = Path(os.environ.get("CLIMA_DADOS", RAIZ / "data"))
if not os.environ.get("VERCEL"):  # na Vercel o disco é só leitura
    DADOS.mkdir(exist_ok=True)

_TABELAS_COM_ID = {"aparelhos", "codigos", "agendamentos", "atividade", "alertas", "backups", "fila_comandos", "projetos", "cenas", "automacoes", "temporizadores", "seguranca_ips", "seguranca_eventos", "notificacoes", "site_mensagens", "passkeys", "site_respostas", "site_consentimentos", "dispositivos", "dispositivos_eventos", "avatares", "aceites", "treinamentos", "bugs"}
_RE_INSERT = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.I)
_pool: queue.LifoQueue = queue.LifoQueue(maxsize=2 if os.environ.get("VERCEL") else 6)
_criadas = 0
_trava = threading.Lock()


def carregar_env() -> dict:
    env = {}
    arq = RAIZ / ".env"
    if arq.exists():
        for linha in arq.read_text().splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                k, v = linha.split("=", 1)
                env[k.strip()] = v.strip()
    # variáveis do ambiente (Vercel) que o backend usa; prefixo fora desta lista NÃO chega ao código na nuvem
    # (VERIFICACAO_ ficou de fora até 17/11: o portão do app nunca gravava o passe e travava quando o cookie do site vencia)
    env.update({k: v for k, v in os.environ.items() if k.startswith(("SUPABASE_", "TUYA_", "CLIMA_", "TURNSTILE_", "VERIFICACAO_"))})
    return env


ENV = carregar_env()
REF = ENV.get("SUPABASE_URL", "").split("//")[-1].split(".")[0]


def _nova_conexao():
    if not (REF and ENV.get("SUPABASE_DB_PASSWORD")):
        raise RuntimeError("Faltam SUPABASE_URL e SUPABASE_DB_PASSWORD no .env.")
    # O pooler do Supabase usa a própria CA ("Supabase Root 2021 CA"), fixada em backend/supabase-ca.crt
    return psycopg.connect(
        host=ENV.get("SUPABASE_DB_HOST", "aws-1-us-east-2.pooler.supabase.com"),
        port=int(ENV.get("SUPABASE_DB_PORT", "6543" if os.environ.get("VERCEL") else "5432")),
        user=f"postgres.{REF}", password=ENV["SUPABASE_DB_PASSWORD"], dbname="postgres",
        sslmode="verify-full", sslrootcert=str(Path(__file__).resolve().parents[1] / "supabase-ca.crt"),
        autocommit=True, prepare_threshold=None, row_factory=dict_row, connect_timeout=15,
        application_name="clima-casa",
        # teste de vida da conexão: quando o computador troca de rede ou dorme, a conexão antiga morre sem avisar e a
        # consulta esperava para sempre (o agente ficava "vivo" sem fazer nada). Com keepalive vira erro em ~1 min.
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
    )


def _pegar():
    global _criadas
    try:
        return _pool.get_nowait()
    except queue.Empty:
        with _trava:
            if _criadas < _pool.maxsize:
                _criadas += 1
                try:
                    return _nova_conexao()
                except Exception:
                    _criadas -= 1
                    raise
        return _pool.get(timeout=20)


def _devolver(con, quebrada=False):
    global _criadas
    if quebrada:
        try:
            con.close()
        except Exception:
            pass
        with _trava:
            _criadas -= 1
    else:
        _pool.put(con)


def _sql(sql: str) -> str:
    return sql.replace("%", "%%").replace("?", "%s")


def _rodar(sql, params, buscar):
    for tentativa in (1, 2):
        con = _pegar()
        try:
            cur = con.execute(_sql(sql), tuple(params))
            linhas = cur.fetchall() if buscar and cur.description else None
            _devolver(con)
            return linhas
        except psycopg.OperationalError:
            _devolver(con, quebrada=True)  # conexão caiu: abre outra e tenta de novo
            if tentativa == 2:
                raise
        except Exception:
            _devolver(con, quebrada=con.closed or con.info.transaction_status != psycopg.pq.TransactionStatus.IDLE)
            raise


def agora() -> int:
    return int(time.time())


def iniciar():
    _rodar("SELECT 1", (), True)


@contextmanager
def conexao():
    """Conexão para vários comandos numa única transação."""
    con = _pegar()
    try:
        with con.transaction():
            yield con
        _devolver(con)
    except Exception:
        _devolver(con, quebrada=True)
        raise


def consultar(sql, params=()):
    return _rodar(sql, params, True) or []


def um(sql, params=()):
    linhas = consultar(sql, params)
    return linhas[0] if linhas else None


def executar(sql, params=()):
    m = _RE_INSERT.match(sql)
    if m and m.group(1).lower() in _TABELAS_COM_ID and "RETURNING" not in sql.upper():
        linhas = _rodar(sql + " RETURNING id", params, True)
        return linhas[0]["id"] if linhas else None
    _rodar(sql, params, False)
    return None


# configurações com segredos: guardadas cifradas (AES-256-GCM) — ver cripto.py
CHAVES_SENSIVEIS = {"tuya_conta", "tuya_qr_pendente", "sinric", "alexa", "segredo_sessao", "spotify", "email", "telegram"}


def cfg(chave, padrao=None):
    linha = um("SELECT valor FROM config WHERE chave = ?", (chave,))
    if not linha:
        return padrao
    valor = json.loads(linha["valor"])
    if isinstance(valor, str) and valor.startswith("enc:v1:"):
        from . import cripto
        valor = json.loads(cripto.decifrar(valor, f"cfg:{chave}"))
    return valor


def set_cfg(chave, valor):
    if valor is None:
        executar("DELETE FROM config WHERE chave = ?", (chave,))
    else:
        if chave in CHAVES_SENSIVEIS:
            from . import cripto
            valor = cripto.cifrar(json.dumps(valor), f"cfg:{chave}")
        executar(
            "INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
            (chave, json.dumps(valor)),
        )


def registrar(origem, acao, ok=True, aparelho_id=None, detalhe=""):
    executar(
        "INSERT INTO atividade (quando, aparelho_id, origem, acao, ok, detalhe) VALUES (?, ?, ?, ?, ?, ?)",
        (agora(), aparelho_id, origem, acao, 1 if ok else 0, str(detalhe)[:500]),
    )
