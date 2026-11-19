"""Backup completo do sistema e restauração (rota /backup, só dono ou admin com acesso a todos os projetos).

Backup: um .zip com `manifesto.json` (versão, data, quem gerou, contagem por tabela, sha256 de cada arquivo) e um
`tabelas/<nome>.json` por tabela do schema public. Os segredos guardados em `config` vão como estão no banco, ou seja,
CIFRADOS (AES-256-GCM com CLIMA_CHAVE_MESTRA): o arquivo sozinho não revela nenhuma chave. Os modelos 3D (Storage)
entram como lista (nome, tamanho) e continuam no Supabase. O .zip vai para o bucket privado `backups-sistema` e o
download é por link assinado de 10 minutos (o arquivo não passa pela Vercel, que limita a resposta a 4,5 MB).

Restauração: o .zip é enviado direto ao Storage (link assinado) e o servidor lê, confere o sha256 de cada tabela e:
- `simular`: diz, por tabela, quantas linhas são novas, quantas mudam e quantas são iguais (não grava nada);
- `mesclar`: insere as novas e atualiza as que mudaram, pela chave primária (não apaga nada);
- `substituir`: apaga a tabela e grava a do backup (só tabelas escolhidas; pede a palavra RESTAURAR).
Tabelas de sessão/login/OAuth nunca são restauradas (voltariam sessões antigas).
"""
from __future__ import annotations

import hashlib
import io
import json
import secrets
import time
import zipfile

import httpx

from . import db

BUCKET = "backups-sistema"
LIMITE_ENVIO = 50 * 1024 * 1024   # limite por arquivo do plano do Supabase
NUNCA_RESTAURAR = {"sessoes_fortes", "sessoes_uso", "webauthn_desafios", "oauth_codigos", "oauth_tokens", "passkeys", "fila_comandos", "cron_log"}
GRUPOS = {
    "essencial": ("Ares, botões, transmissores, salas, cenas, agenda, automações, mapa e configurações",
                  ["aparelhos", "codigos", "hubs", "projetos", "cenas", "agendamentos", "automacoes", "temporizadores", "config", "dispositivos", "usuarios", "avatares"]),
    "historico": ("Atividade, métricas, alertas, notificações e e-mails", ["atividade", "metricas_diarias", "alertas", "notificacoes", "email_envios", "dispositivos_eventos"]),
    "seguranca": ("Firewall, eventos de segurança e treinamentos", ["seguranca_ips", "seguranca_eventos", "seguranca_ip_info", "treinamentos", "aceites", "bugs"]),
    "site": ("Mensagens e consentimentos do site, conversas da IA", ["site_mensagens", "site_respostas", "site_consentimentos", "ia_conversas"]),
}


def _cab():
    k = db.ENV["SUPABASE_SECRET_KEY"]
    return {"apikey": k, "Authorization": f"Bearer {k}"}


def _url():
    return db.ENV["SUPABASE_URL"]


def garantir_bucket():
    r = httpx.get(f"{_url()}/storage/v1/bucket/{BUCKET}", headers=_cab(), timeout=10)
    if r.status_code == 200:
        return
    httpx.post(f"{_url()}/storage/v1/bucket", headers=_cab(), timeout=10,
               json={"id": BUCKET, "name": BUCKET, "public": False, "file_size_limit": LIMITE_ENVIO, "allowed_mime_types": ["application/zip", "application/octet-stream"]})


def tabelas() -> list[dict]:
    """Tabelas do schema public com o número aproximado de linhas e a chave primária."""
    linhas = db.consultar("SELECT c.relname AS nome, c.reltuples::bigint AS aprox FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                          "WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname")
    pks = {}
    for r in db.consultar("SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu "
                          "ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema "
                          "WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY' ORDER BY kcu.ordinal_position"):
        pks.setdefault(r["table_name"], []).append(r["column_name"])
    grupo_de = {t: g for g, (_, ts) in GRUPOS.items() for t in ts}
    return [{"nome": t["nome"], "linhas": max(0, int(t["aprox"] or 0)), "pk": pks.get(t["nome"], []), "grupo": grupo_de.get(t["nome"], "outros"),
             "restauravel": t["nome"] not in NUNCA_RESTAURAR and bool(pks.get(t["nome"]))} for t in linhas]


def _nomes_validos() -> set[str]:
    return {t["nome"] for t in tabelas()}


def _ler_tabela(nome: str) -> list[dict]:
    # nome vem de _nomes_validos (catálogo do Postgres), nunca do usuário
    return db.consultar(f'SELECT * FROM "{nome}"')  # nosec B608


def _json(o) -> bytes:
    return json.dumps(o, ensure_ascii=False, default=str, separators=(",", ":")).encode()


def gerar(quem: str, escolhidas: list[str] | None = None) -> dict:
    """Monta o .zip com as tabelas (todas, ou as escolhidas) e guarda no Storage privado. Devolve o registro."""
    garantir_bucket()
    validas = _nomes_validos()
    alvo = [t for t in (escolhidas or sorted(validas)) if t in validas]
    buf = io.BytesIO()
    contagem, hashes = {}, {}
    t0 = time.time()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for t in alvo:
            linhas = _ler_tabela(t)
            dados = _json(linhas)
            z.writestr(f"tabelas/{t}.json", dados)
            contagem[t] = len(linhas)
            hashes[t] = hashlib.sha256(dados).hexdigest()
        arquivos3d = []
        try:
            r = httpx.post(f"{_url()}/storage/v1/object/list/avatares", headers=_cab(), json={"prefix": "", "limit": 1000}, timeout=20)
            arquivos3d = [{"nome": o["name"], "tamanho": (o.get("metadata") or {}).get("size")} for o in r.json()] if r.status_code == 200 else []
        except Exception:  # noqa: BLE001
            pass
        manifesto = {"sistema": "Clima Escritório", "versao_backup": 2, "gerado_em": db.agora(), "gerado_por": quem, "tabelas": contagem, "sha256": hashes,
                     "segredos": "os valores sensíveis da tabela config vão cifrados (precisam da mesma CLIMA_CHAVE_MESTRA para funcionar)",
                     "arquivos_3d": arquivos3d, "segundos": round(time.time() - t0, 1)}
        z.writestr("manifesto.json", json.dumps(manifesto, ensure_ascii=False, indent=2))
    conteudo = buf.getvalue()
    nome = time.strftime("backup-%Y-%m-%d-%H%M%S", time.gmtime(time.time() - 3 * 3600)) + f"-{secrets.token_hex(3)}.zip"
    r = httpx.post(f"{_url()}/storage/v1/object/{BUCKET}/{nome}", headers={**_cab(), "Content-Type": "application/zip", "x-upsert": "false"}, content=conteudo, timeout=120)
    if r.status_code >= 300:
        raise RuntimeError(f"O Storage não aceitou o backup ({r.status_code}).")
    db.registrar("painel", "Backup completo gerado", detalhe=f"{len(alvo)} tabela(s), {sum(contagem.values())} linha(s), {round(len(conteudo) / 1048576, 2)} MB · {quem}")
    return {"arquivo": nome, "tamanho": len(conteudo), "tabelas": contagem, "segundos": manifesto["segundos"]}


def listar() -> list[dict]:
    garantir_bucket()
    r = httpx.post(f"{_url()}/storage/v1/object/list/{BUCKET}", headers=_cab(), json={"prefix": "", "limit": 200, "sortBy": {"column": "created_at", "order": "desc"}}, timeout=20)
    if r.status_code != 200:
        return []
    return [{"arquivo": o["name"], "tamanho": (o.get("metadata") or {}).get("size"), "criado_em": o.get("created_at"),
             "tipo": "enviado" if o["name"].startswith("envio-") else "gerado"} for o in r.json() if o.get("name", "").endswith(".zip")]


def _nome_ok(nome: str) -> str:
    if not nome or "/" in nome or ".." in nome or not nome.endswith(".zip"):
        raise ValueError("Arquivo inválido.")
    return nome


def link(nome: str) -> str:
    _nome_ok(nome)
    r = httpx.post(f"{_url()}/storage/v1/object/sign/{BUCKET}/{nome}", headers=_cab(), json={"expiresIn": 600}, timeout=10)
    if r.status_code >= 300:
        raise KeyError("Backup não encontrado.")
    return f"{_url()}/storage/v1{r.json()['signedURL']}"


def apagar(nome: str):
    _nome_ok(nome)
    httpx.request("DELETE", f"{_url()}/storage/v1/object/{BUCKET}", headers=_cab(), json={"prefixes": [nome]}, timeout=10)
    db.registrar("painel", "Backup apagado", detalhe=nome)


def preparar_envio(tamanho: int) -> dict:
    """Link assinado para o navegador mandar o .zip direto ao Storage (não passa pela Vercel)."""
    if tamanho <= 0 or tamanho > LIMITE_ENVIO:
        raise ValueError("O arquivo precisa ter até 50 MB (limite do plano do Supabase).")
    garantir_bucket()
    nome = f"envio-{time.strftime('%Y%m%d-%H%M%S', time.gmtime())}-{secrets.token_hex(4)}.zip"
    r = httpx.post(f"{_url()}/storage/v1/object/upload/sign/{BUCKET}/{nome}", headers=_cab(), json={}, timeout=10)
    if r.status_code >= 300:
        raise RuntimeError("O Storage não gerou o link de envio.")
    return {"arquivo": nome, "upload_url": f"{_url()}/storage/v1{r.json().get('url')}"}


def _abrir(nome: str) -> tuple[dict, zipfile.ZipFile]:
    _nome_ok(nome)
    r = httpx.get(f"{_url()}/storage/v1/object/{BUCKET}/{nome}", headers=_cab(), timeout=120)
    if r.status_code != 200:
        raise KeyError("Backup não encontrado no Storage.")
    try:
        z = zipfile.ZipFile(io.BytesIO(r.content))
        man = json.loads(z.read("manifesto.json"))
    except (zipfile.BadZipFile, KeyError, json.JSONDecodeError) as e:
        raise ValueError("Não é um backup do Clima Escritório (falta o manifesto ou o .zip está corrompido).") from e
    if man.get("sistema") != "Clima Escritório":
        raise ValueError("Este .zip não é um backup do Clima Escritório.")
    return man, z


def _linhas_do_zip(man: dict, z: zipfile.ZipFile, t: str) -> list[dict]:
    dados = z.read(f"tabelas/{t}.json")
    esperado = (man.get("sha256") or {}).get(t)
    if esperado and hashlib.sha256(dados).hexdigest() != esperado:
        raise ValueError(f"A tabela {t} no arquivo foi alterada (o sha256 não confere). Restauração cancelada.")
    return json.loads(dados)


def _chave(linha: dict, pk: list[str]) -> tuple:
    return tuple(str(linha.get(c)) for c in pk)


def _igual(a: dict, b: dict) -> bool:
    return json.dumps(a, sort_keys=True, default=str) == json.dumps(b, sort_keys=True, default=str)


def restaurar(nome: str, modo: str, escolhidas: list[str] | None, quem: str) -> dict:
    if modo not in ("simular", "mesclar", "substituir"):
        raise ValueError("Modo inválido.")
    man, z = _abrir(nome)
    info = {t["nome"]: t for t in tabelas()}
    no_zip = [n[8:-5] for n in z.namelist() if n.startswith("tabelas/") and n.endswith(".json")]
    alvo = [t for t in (escolhidas or no_zip) if t in no_zip]
    resultado = []
    for t in alvo:
        meta = info.get(t)
        if not meta or not meta["restauravel"]:
            resultado.append({"tabela": t, "pulada": "não é restaurável (sessões/login, sem chave primária ou não existe mais)"}); continue
        linhas = _linhas_do_zip(man, z, t)
        pk = meta["pk"]
        atuais = {_chave(r, pk): r for r in _ler_tabela(t)}
        cols = {c["column_name"]: c["data_type"] for c in db.consultar("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name = ?", (t,))}
        novas = [r for r in linhas if _chave(r, pk) not in atuais]
        mudam = [r for r in linhas if _chave(r, pk) in atuais and not _igual({k: v for k, v in r.items() if k in cols}, {k: v for k, v in atuais[_chave(r, pk)].items() if k in r})]
        item = {"tabela": t, "no_backup": len(linhas), "atuais": len(atuais), "novas": len(novas), "mudam": len(mudam),
                "iguais": len(linhas) - len(novas) - len(mudam), "sairiam": len([k for k in atuais if k not in {_chave(r, pk) for r in linhas}]) if modo != "mesclar" else 0}
        if modo != "simular":
            gravar = linhas if modo == "substituir" else novas + mudam
            if modo == "substituir":
                db.executar(f'DELETE FROM "{t}"')  # nosec B608 (nome do catálogo)
            for r in gravar:
                cs = [c for c in r if c in cols]
                vals = [json.dumps(r[c], ensure_ascii=False) if cols[c] in ("jsonb", "json") and r[c] is not None and not isinstance(r[c], str) else r[c] for c in cs]
                marc = ",".join(("CAST(? AS jsonb)" if cols[c] == "jsonb" else "?") for c in cs)
                upd = ",".join(f'"{c}" = excluded."{c}"' for c in cs if c not in pk) or f'"{pk[0]}" = excluded."{pk[0]}"'
                db.executar(f'INSERT INTO "{t}" ({",".join(chr(34) + c + chr(34) for c in cs)}) OVERRIDING SYSTEM VALUE VALUES ({marc}) '  # nosec B608
                            f'ON CONFLICT ({",".join(chr(34) + c + chr(34) for c in pk)}) DO UPDATE SET {upd}', tuple(vals))
            # identidade continua depois do maior id restaurado
            if pk == ["id"] and cols.get("id") in ("bigint", "integer"):
                try:
                    db.executar(f"SELECT setval(pg_get_serial_sequence('public.\"{t}\"', 'id'), GREATEST((SELECT coalesce(max(id), 1) FROM \"{t}\"), 1))")  # nosec B608
                except Exception:  # noqa: BLE001
                    pass
            item["gravadas"] = len(gravar)
        resultado.append(item)
    if modo != "simular":
        db.registrar("painel", f"Backup restaurado ({modo})", detalhe=f"{nome} · {len(alvo)} tabela(s) · {quem}")
    return {"manifesto": {k: man.get(k) for k in ("gerado_em", "gerado_por", "versao_backup", "segredos")}, "modo": modo, "tabelas": resultado}
