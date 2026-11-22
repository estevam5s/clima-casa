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

Recursos avançados:
- backup agendado (config `backup_agenda`): diário ou semanal num horário de Brasília, rodado pelo agente (`ciclo`),
  com retenção dos N mais recentes, aviso na central de notificações se falhar;
- backup de segurança automático ANTES de mesclar/substituir (arquivo `antes-restaurar-…`, guarda os 5 últimos);
- conferir a integridade de um arquivo (sha256 de cada tabela), ver o manifesto, comparar dois backups;
- procurar linhas dentro de um backup e restaurar só as escolhidas (ex.: um ar apagado por engano);
- rótulo (nota) por arquivo em `config.backup_rotulos` e uso do Storage.
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


PREFIXOS = {"backup": "gerado aqui", "auto": "agendado", "antes": "antes de restaurar", "envio": "enviado por upload"}


def _versao_sistema() -> str:
    try:
        import pathlib
        return json.loads((pathlib.Path(__file__).with_name("novidades.json")).read_text(encoding="utf-8"))["versoes"][0]["versao"]
    except Exception:  # noqa: BLE001
        return ""


def gerar(quem: str, escolhidas: list[str] | None = None, prefixo: str = "backup", rotulo: str = "") -> dict:
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
        manifesto = {"sistema": "Clima Escritório", "versao_backup": 3, "versao_sistema": _versao_sistema(), "tipo": PREFIXOS.get(prefixo, prefixo),
                     "rotulo": rotulo[:120], "gerado_em": db.agora(), "gerado_por": quem, "tabelas": contagem, "sha256": hashes,
                     "segredos": "os valores sensíveis da tabela config vão cifrados (precisam da mesma CLIMA_CHAVE_MESTRA para funcionar)",
                     "arquivos_3d": arquivos3d, "segundos": round(time.time() - t0, 1)}
        z.writestr("manifesto.json", json.dumps(manifesto, ensure_ascii=False, indent=2))
    conteudo = buf.getvalue()
    nome = f"{prefixo}-" + time.strftime("%Y-%m-%d-%H%M%S", time.gmtime(time.time() - 3 * 3600)) + f"-{secrets.token_hex(3)}.zip"
    r = httpx.post(f"{_url()}/storage/v1/object/{BUCKET}/{nome}", headers={**_cab(), "Content-Type": "application/zip", "x-upsert": "false"}, content=conteudo, timeout=120)
    if r.status_code >= 300:
        raise RuntimeError(f"O Storage não aceitou o backup ({r.status_code}).")
    if rotulo:
        _gravar_rotulo(nome, rotulo)
    db.registrar("painel" if prefixo != "auto" else "agenda", f"Backup {PREFIXOS.get(prefixo, '')} gerado".replace("  ", " "),
                 detalhe=f"{len(alvo)} tabela(s), {sum(contagem.values())} linha(s), {round(len(conteudo) / 1048576, 2)} MB · {quem}")
    return {"arquivo": nome, "tamanho": len(conteudo), "tabelas": contagem, "segundos": manifesto["segundos"]}


def listar() -> list[dict]:
    garantir_bucket()
    r = httpx.post(f"{_url()}/storage/v1/object/list/{BUCKET}", headers=_cab(), json={"prefix": "", "limit": 200, "sortBy": {"column": "created_at", "order": "desc"}}, timeout=20)
    if r.status_code != 200:
        return []
    rotulos = db.cfg("backup_rotulos", {}) or {}
    return [{"arquivo": o["name"], "tamanho": (o.get("metadata") or {}).get("size"), "criado_em": o.get("created_at"),
             "tipo": PREFIXOS.get(o["name"].split("-", 1)[0], "gerado aqui"), "rotulo": rotulos.get(o["name"], "")}
            for o in r.json() if o.get("name", "").endswith(".zip")]


def _gravar_rotulo(nome: str, rotulo: str):
    r = dict(db.cfg("backup_rotulos", {}) or {})
    if rotulo.strip():
        r[nome] = rotulo.strip()[:120]
    else:
        r.pop(nome, None)
    db.set_cfg("backup_rotulos", r)


def rotular(nome: str, rotulo: str):
    _nome_ok(nome)
    _gravar_rotulo(nome, rotulo)


def _reter(prefixo: str, manter: int) -> list[str]:
    """Apaga os arquivos mais antigos de um tipo (agendados, antes de restaurar), mantendo os `manter` mais novos."""
    velhos = [a["arquivo"] for a in listar() if a["arquivo"].startswith(prefixo + "-")][max(1, manter):]
    if velhos:
        httpx.request("DELETE", f"{_url()}/storage/v1/object/{BUCKET}", headers=_cab(), json={"prefixes": velhos}, timeout=20)
        r = dict(db.cfg("backup_rotulos", {}) or {})
        if any(v in r for v in velhos):
            db.set_cfg("backup_rotulos", {k: v for k, v in r.items() if k not in velhos})
    return velhos


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
    _gravar_rotulo(nome, "")
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


def restaurar(nome: str, modo: str, escolhidas: list[str] | None, quem: str, chaves: list[str] | None = None, seguranca: bool = True) -> dict:
    """`chaves` (com UMA tabela): restaura só essas linhas, pela chave primária (texto; várias colunas separadas por |).
    `seguranca`: antes de gravar, guarda um backup das tabelas que vão mudar (para desfazer)."""
    if modo not in ("simular", "mesclar", "substituir"):
        raise ValueError("Modo inválido.")
    man, z = _abrir(nome)
    info = {t["nome"]: t for t in tabelas()}
    no_zip = [n[8:-5] for n in z.namelist() if n.startswith("tabelas/") and n.endswith(".json")]
    alvo = [t for t in (escolhidas or no_zip) if t in no_zip]
    if chaves is not None:
        if len(alvo) != 1:
            raise ValueError("Para restaurar linhas escolhidas, escolha uma tabela só.")
        if modo == "substituir":
            raise ValueError("Linhas escolhidas só podem ser mescladas (substituir apagaria o resto da tabela).")
    antes = None
    if modo != "simular" and seguranca and [t for t in alvo if t in info]:
        antes = gerar(quem, [t for t in alvo if t in info], prefixo="antes", rotulo=f"antes de restaurar {nome}")["arquivo"]
        _reter("antes", 5)
    resultado = []
    for t in alvo:
        meta = info.get(t)
        if not meta or not meta["restauravel"]:
            resultado.append({"tabela": t, "pulada": "não é restaurável (sessões/login, sem chave primária ou não existe mais)"}); continue
        linhas = _linhas_do_zip(man, z, t)
        pk = meta["pk"]
        if chaves is not None:
            quero = set(chaves)
            linhas = [r for r in linhas if "|".join(_chave(r, pk)) in quero]
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
        db.registrar("painel", f"Backup restaurado ({modo}{', linhas escolhidas' if chaves is not None else ''})",
                     detalhe=f"{nome} · {len(alvo)} tabela(s) · {quem}" + (f" · cópia de segurança {antes}" if antes else ""))
    return {"manifesto": {k: man.get(k) for k in ("gerado_em", "gerado_por", "versao_backup", "versao_sistema", "rotulo", "segredos")},
            "modo": modo, "tabelas": resultado, "seguranca": antes}


# ---------- conferir, comparar e procurar dentro de um backup ----------
def manifesto(nome: str) -> dict:
    """Manifesto + conferência do sha256 de cada tabela (o arquivo está íntegro?)."""
    man, z = _abrir(nome)
    conferencia = []
    for n in z.namelist():
        if not (n.startswith("tabelas/") and n.endswith(".json")):
            continue
        t = n[8:-5]
        dados = z.read(n)
        esperado = (man.get("sha256") or {}).get(t)
        conferencia.append({"tabela": t, "linhas": (man.get("tabelas") or {}).get(t), "bytes": len(dados),
                            "ok": (hashlib.sha256(dados).hexdigest() == esperado) if esperado else None})
    conferencia.sort(key=lambda c: -(c["bytes"]))
    return {"arquivo": nome, "manifesto": {k: v for k, v in man.items() if k not in ("sha256", "tabelas")}, "tabelas": conferencia,
            "integro": all(c["ok"] is not False for c in conferencia), "sem_hash": sum(1 for c in conferencia if c["ok"] is None)}


def comparar(a: str, b: str) -> dict:
    """O que mudou de um backup (a, mais antigo) para outro (b): por tabela, linhas que entraram, saíram e mudaram."""
    ma, za = _abrir(a)
    mb, zb = _abrir(b)
    pks = {t["nome"]: t["pk"] for t in tabelas()}
    nomes = lambda z: {n[8:-5] for n in z.namelist() if n.startswith("tabelas/") and n.endswith(".json")}  # noqa: E731
    saida = []
    for t in sorted(nomes(za) | nomes(zb)):
        la = _linhas_do_zip(ma, za, t) if t in nomes(za) else []
        lb = _linhas_do_zip(mb, zb, t) if t in nomes(zb) else []
        pk = pks.get(t) or []
        if not pk:
            saida.append({"tabela": t, "a": len(la), "b": len(lb), "entraram": None, "sairam": None, "mudaram": None}); continue
        da, dbb = {_chave(r, pk): r for r in la}, {_chave(r, pk): r for r in lb}
        mud = sum(1 for k in da.keys() & dbb.keys() if not _igual(da[k], dbb[k]))
        saida.append({"tabela": t, "a": len(la), "b": len(lb), "entraram": len(dbb.keys() - da.keys()), "sairam": len(da.keys() - dbb.keys()), "mudaram": mud})
    saida.sort(key=lambda x: -((x["entraram"] or 0) + (x["sairam"] or 0) + (x["mudaram"] or 0)))
    return {"a": {"arquivo": a, "gerado_em": ma.get("gerado_em")}, "b": {"arquivo": b, "gerado_em": mb.get("gerado_em")}, "tabelas": saida}


def linhas(nome: str, tabela: str, busca: str = "", limite: int = 50) -> dict:
    """Linhas de uma tabela dentro do backup (com busca por texto) e se cada uma existe hoje igual, diferente ou não existe."""
    man, z = _abrir(nome)
    info = {t["nome"]: t for t in tabelas()}
    if f"tabelas/{tabela}.json" not in z.namelist():
        raise KeyError("Esta tabela não está no backup.")
    meta = info.get(tabela)
    pk = (meta or {}).get("pk") or []
    todas = _linhas_do_zip(man, z, tabela)
    b = busca.strip().lower()
    achadas = [r for r in todas if not b or b in " ".join(str(v) for v in r.values() if v is not None).lower()]   # só valores, não nomes de coluna
    atuais = {_chave(r, pk): r for r in _ler_tabela(tabela)} if pk and meta else {}
    saida = []
    for r in achadas[:limite]:
        k = _chave(r, pk) if pk else None
        estado = None if not pk else ("nao_existe" if k not in atuais else "igual" if _igual(r, {c: v for c, v in atuais[k].items() if c in r}) else "diferente")
        # valores longos (sinais IR em base64, JSON grandes) cortados para a tela
        curta = {c: (v if not isinstance(v, str) or len(v) <= 160 else v[:157] + "…") for c, v in r.items()}
        saida.append({"chave": "|".join(k) if k else None, "estado": estado, "linha": curta})
    return {"tabela": tabela, "pk": pk, "restauravel": bool(meta and meta["restauravel"]), "total": len(todas), "achadas": len(achadas), "linhas": saida}


# ---------- backup agendado (rodado pelo agente a cada ~5 min) ----------
AGENDA_PADRAO = {"ativo": False, "frequencia": "diario", "hora": "03:00", "dia_semana": 0, "manter": 7, "grupos": None}


def agenda() -> dict:
    a = {**AGENDA_PADRAO, **(db.cfg("backup_agenda", {}) or {})}
    a["proximo"] = _proximo(a) if a["ativo"] else None
    return a


def salvar_agenda(d: dict) -> dict:
    atual = {**AGENDA_PADRAO, **(db.cfg("backup_agenda", {}) or {})}
    for k in ("ativo", "frequencia", "hora", "dia_semana", "manter", "grupos"):
        if k in d:
            atual[k] = d[k]
    atual.pop("devido", None)   # horário mudou: recalcula
    db.set_cfg("backup_agenda", atual)
    return agenda()


def _agora_br() -> time.struct_time:
    return time.gmtime(time.time() - 3 * 3600)


def _proximo(a: dict) -> int:
    """Próximo horário (epoch) em que o backup agendado deve rodar."""
    h, m = (int(x) for x in a["hora"].split(":"))
    agora = time.time()
    br = _agora_br()
    base = agora - (br.tm_hour * 3600 + br.tm_min * 60 + br.tm_sec) + h * 3600 + m * 60   # hoje, no horário, em Brasília
    for d in range(0, 8):
        quando = base + d * 86400
        dia_semana = (time.gmtime(quando - 3 * 3600).tm_wday + 1) % 7   # 0 = domingo
        if quando > agora and (a["frequencia"] == "diario" or dia_semana == int(a["dia_semana"])):
            return int(quando)
    return int(base + 86400)


def ciclo():
    """No agente: se o agendado venceu, gera, aplica a retenção e registra o resultado."""
    a = {**AGENDA_PADRAO, **(db.cfg("backup_agenda", {}) or {})}
    if not a.get("ativo"):
        return
    devido = a.get("devido") or _proximo(a)
    if time.time() < devido:
        if not a.get("devido"):
            db.set_cfg("backup_agenda", {**a, "devido": devido})
        return
    grupos = a.get("grupos")
    escolhidas = [t for g in grupos for t in GRUPOS.get(g, ("", []))[1]] if grupos else None
    try:
        r = gerar("agendado", escolhidas, prefixo="auto")
        apagados = _reter("auto", int(a.get("manter") or 7))
        a.update({"ultimo": int(time.time()), "ultimo_ok": True, "ultimo_arquivo": r["arquivo"], "ultimo_erro": "", "apagados": len(apagados)})
    except Exception as e:  # noqa: BLE001
        a.update({"ultimo": int(time.time()), "ultimo_ok": False, "ultimo_erro": str(e)[:200]})
        try:
            from . import notificacoes
            notificacoes.notificar("backup_agendado", "sistema", "alta", "O backup agendado falhou", str(e)[:200], "/backup")
        except Exception:  # noqa: BLE001
            pass
    a["devido"] = _proximo(a)
    db.set_cfg("backup_agenda", a)


def uso() -> dict:
    """Espaço que os backups ocupam no Storage, por tipo."""
    por = {}
    for a in listar():
        t = por.setdefault(a["tipo"], {"arquivos": 0, "bytes": 0})
        t["arquivos"] += 1; t["bytes"] += a["tamanho"] or 0
    return {"por_tipo": por, "bytes": sum(t["bytes"] for t in por.values())}
