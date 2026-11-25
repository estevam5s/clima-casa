"""Log completo do sistema (Segurança → Logs, Atividade → Por pessoa/sala/ar, Configurações → Uso do sistema).

Junta numa linha do tempo só, com os mesmos filtros:
- atividade: tudo que o painel, a Alexa, a agenda, o Telegram e o agente fizeram (com a pessoa, desde a 0.6.9);
- seguranca_eventos: logins, negados, limite de pedidos, robôs, bloqueios (com IP e país);
- telegram_eventos: cada interação com o bot (com tempo de resposta e erro);
- dispositivos_eventos: luzes, persianas, cafeteira e fechadura;
- email_envios: e-mails enviados e o que aconteceu com eles.

As ações nos ares viram "ligou", "desligou", "subiu a temperatura", "baixou a temperatura", "mudou o modo" ou
"mudou a ventilação", comparando com o estado anterior do mesmo ar.
"""
from __future__ import annotations

import re
import time

from . import db

FONTES = {"atividade": "Atividade", "seguranca": "Segurança", "telegram": "Telegram", "dispositivos": "Dispositivos", "email": "E-mails"}
ACOES_AR = {"ligou": "Ligou", "desligou": "Desligou", "subiu": "Subiu a temperatura", "baixou": "Baixou a temperatura", "modo": "Mudou o modo",
            "ventilacao": "Mudou a ventilação", "repetiu": "Repetiu o comando", "config": "Configurou o ar"}
_TEMP = re.compile(r"(\d{2})\s*°")
_MODO = re.compile(r"Ligar:?\s*([A-Za-zçãéêíóú ]+?)\s+\d{2}\s*°", re.I)
_VENT = re.compile(r"ventila[çc][ãa]o\s+([a-zà-ú]+)", re.I)
_SEG_RUIDO = ("acesso",)
# quem aparece quando a ação não tem pessoa: automáticas, ou feitas antes da 0.6.9 (quando a Atividade ainda não guardava a pessoa)
SEM_PESSOA = {"sinric": "Alexa/Google", "alexa": "Alexa (skill)", "agenda": "Agenda", "cena": "Cena", "automacao": "Automação", "agente": "Agente",
              "sistema": "Sistema", "painel": "Painel (pessoa não registrada)", "telegram": "Telegram (pessoa não registrada)", "ia": "Assistente de IA", "musica": "Música"}   # "acesso" = cada pedido ao sistema: aparece só quando pedido de propósito (é muito volume)


def _estado(acao: str) -> dict | None:
    a = acao or ""
    if a.startswith("Desligar"):
        return {"ligado": False}
    if a.startswith("Ligar"):
        t = _TEMP.search(a)
        m = _MODO.search(a)
        v = _VENT.search(a)
        return {"ligado": True, "temp": int(t.group(1)) if t else None, "modo": (m.group(1).strip().lower() if m else None), "vent": (v.group(1).lower() if v else None)}
    return None


def classificar(linhas: list[dict]) -> None:
    """Marca `acao_ar` e `de`/`para` (temperatura) nas linhas da atividade, em ordem do tempo, por ar.
    O estado anterior de cada ar vem da própria lista (a primeira ação de cada ar no período é comparada com a anterior no banco)."""
    ares = {r["aparelho_id"] for r in linhas if r.get("aparelho_id")}
    antes: dict = {}
    if ares:
        primeiro = min((r["quando"] for r in linhas if r.get("aparelho_id")), default=0)
        marcas = ",".join("?" for _ in ares)
        for r in db.consultar(f"SELECT DISTINCT ON (aparelho_id) aparelho_id, acao FROM atividade WHERE aparelho_id IN ({marcas}) AND quando < ? AND ok = 1 "  # nosec B608
                              "AND (acao LIKE 'Ligar%' OR acao LIKE 'Desligar%') ORDER BY aparelho_id, quando DESC", (*ares, primeiro)):
            antes[r["aparelho_id"]] = _estado(r["acao"])
    for r in sorted(linhas, key=lambda x: (x["quando"], x.get("id") or 0)):
        aid = r.get("aparelho_id")
        if not aid or r.get("fonte", "atividade") != "atividade":
            continue
        e = _estado(r.get("acao"))
        if e is None:
            r["acao_ar"] = "config"
            continue
        ant = antes.get(aid)
        if not e["ligado"]:
            r["acao_ar"] = "desligou"
        elif not ant or not ant.get("ligado"):
            r["acao_ar"] = "ligou"
        elif e["temp"] is not None and ant.get("temp") is not None and e["temp"] != ant["temp"]:
            r["acao_ar"] = "subiu" if e["temp"] > ant["temp"] else "baixou"
            r["de"], r["para"] = ant["temp"], e["temp"]
        elif e["modo"] and ant.get("modo") and e["modo"] != ant["modo"]:
            r["acao_ar"] = "modo"
        elif e["vent"] and ant.get("vent") and e["vent"] != ant["vent"]:
            r["acao_ar"] = "ventilacao"
        else:
            r["acao_ar"] = "repetiu"
        if r.get("ok", 1):
            antes[aid] = e
        r["junto"] = "respondeu junto" in (r.get("acao") or "")


def _paralelo(tarefas: dict) -> dict:
    """Consultas independentes ao mesmo tempo, com o usuário da requisição (contextvars) em cada thread."""
    import contextvars
    from concurrent.futures import ThreadPoolExecutor
    if not tarefas:
        return {}
    with ThreadPoolExecutor(max_workers=min(6, len(tarefas))) as ex:
        fut = {k: ex.submit(contextvars.copy_context().run, fn) for k, fn in tarefas.items()}
        return {k: f.result() for k, f in fut.items()}


def _filtros_atividade(f: dict) -> tuple[str, list]:
    w, p = [], []
    if f.get("pessoa"):
        w.append("t.usuario_id = ?"); p.append(str(f["pessoa"]))
    if f.get("sala"):
        w.append("a.projeto_id = ?"); p.append(int(f["sala"]))
    if f.get("aparelho"):
        w.append("t.aparelho_id = ?"); p.append(int(f["aparelho"]))
    if f.get("origem"):
        w.append("split_part(t.origem, ':', 1) = ?"); p.append(f["origem"])
    if f.get("so_ares"):
        w.append("t.aparelho_id IS NOT NULL")
    if f.get("categoria") == "admin":
        w.append("t.aparelho_id IS NULL AND split_part(t.origem, ':', 1) IN ('painel', 'sistema')")
    if f.get("categoria") == "ares":
        w.append("t.aparelho_id IS NOT NULL")
    return ("".join(f" AND {x}" for x in w), p)


def consultar(fontes: list[str], desde: int, ate: int | None = None, q: str = "", falhas: bool = False, limite: int = 200,
              antes: int | None = None, filtros: dict | None = None, escopo: tuple[str, tuple] = ("", ())) -> list[dict]:
    """Linha do tempo unificada, mais nova primeiro. `antes` = paginação por quando. `escopo` = filtro de projetos de quem pede."""
    f = filtros or {}
    ate = ate or (db.agora() + 60)
    if antes:
        ate = min(ate, antes)
    lim = max(10, min(1000, limite))
    termo = f"%{q.strip()[:80]}%" if q and q.strip() else None
    pessoa_ou_sala = bool(f.get("pessoa") or f.get("sala") or f.get("aparelho") or f.get("so_ares") or f.get("categoria") or f.get("origem"))
    tarefas = {}

    def _f_atividade():
        saida = []
        w, p = _filtros_atividade(f)
        if termo:
            w += " AND (t.acao ILIKE ? OR t.detalhe ILIKE ? OR t.usuario ILIKE ? OR a.nome ILIKE ? OR pr.nome ILIKE ?)"; p += [termo] * 5
        if falhas:
            w += " AND t.ok = 0"
        w += escopo[0]; p += list(escopo[1])
        for r in db.consultar("SELECT t.id, t.quando, t.origem, t.acao, t.ok, t.detalhe, t.usuario, t.usuario_id, t.aparelho_id, a.nome AS aparelho, "  # nosec B608
                              "a.projeto_id AS sala_id, pr.nome AS sala FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                              f"WHERE t.quando >= ? AND t.quando < ?{w} ORDER BY t.quando DESC, t.id DESC LIMIT ?", (desde, ate, *p, lim)):
            r["fonte"] = "atividade"
            r["quem"] = r.pop("usuario") or ""
            r["origem_base"] = (r["origem"] or "").split(":")[0]
            saida.append(r)

        return saida

    def _f_seguranca():
        if not ("seguranca" in fontes and not pessoa_ou_sala):
            return []
        saida = []
        w, p = "", []
        if not f.get("com_acessos"):
            w += " AND tipo NOT IN (" + ",".join("?" for _ in _SEG_RUIDO) + ")"; p += list(_SEG_RUIDO)
        if f.get("tipo_seg"):
            w += " AND tipo = ?"; p.append(f["tipo_seg"])
        if f.get("ip"):
            w += " AND ip = ?"; p.append(f["ip"][:45])
        if termo:
            w += " AND (tipo ILIKE ? OR rota ILIKE ? OR detalhe ILIKE ? OR ip ILIKE ?)"; p += [termo] * 4
        if falhas:
            w += " AND tipo NOT IN ('login_ok', 'escudo_desligado', 'consentimento', 'site_contato')"
        for r in db.consultar(f"SELECT id, quando, ip, tipo, rota, detalhe, pais, agente FROM seguranca_eventos WHERE quando >= ? AND quando < ?{w} "  # nosec B608
                              "ORDER BY quando DESC, id DESC LIMIT ?", (desde, ate, *p, lim)):
            saida.append({"fonte": "seguranca", "id": r["id"], "quando": r["quando"], "acao": r["tipo"], "detalhe": f"{r['rota']} {r['detalhe']}".strip(),
                          "ip": r["ip"], "pais": r["pais"], "agente": r["agente"], "ok": 1 if r["tipo"] in ("login_ok", "escudo_desligado", "consentimento", "site_contato") else 0, "quem": ""})

        return saida

    def _f_telegram():
        if not ("telegram" in fontes and not (f.get("sala") or f.get("aparelho") or f.get("so_ares") or f.get("categoria") or f.get("origem"))):
            return []
        saida = []
        w, p = "", []
        if f.get("pessoa"):
            w += " AND usuario_id::text = ?"; p.append(str(f["pessoa"]))
        if termo:
            w += " AND (texto ILIKE ? OR erro ILIKE ? OR usuario_nome ILIKE ?)"; p += [termo] * 3
        if falhas:
            w += " AND NOT ok"
        for r in db.consultar(f"SELECT id, quando, usuario_id::text AS usuario_id, usuario_nome, username, tipo, texto, ok, ip, ms, erro FROM telegram_eventos "  # nosec B608
                              f"WHERE quando >= ? AND quando < ?{w} ORDER BY quando DESC, id DESC LIMIT ?", (desde, ate, *p, lim)):
            saida.append({"fonte": "telegram", "id": r["id"], "quando": r["quando"], "quem": r["usuario_nome"] or r["username"] or "", "usuario_id": r["usuario_id"],
                          "acao": f"{r['tipo']}: {r['texto']}", "ok": 1 if r["ok"] else 0, "detalhe": r["erro"] or "", "ip": r["ip"], "ms": r["ms"]})

        return saida

    def _f_dispositivos():
        if not ("dispositivos" in fontes and not (f.get("pessoa") or f.get("aparelho") or f.get("so_ares") or f.get("categoria") == "admin")):
            return []
        saida = []
        w, p = "", []
        if f.get("sala"):
            w += " AND d.projeto_id = ?"; p.append(int(f["sala"]))
        if termo:
            w += " AND (e.acao ILIKE ? OR e.detalhe ILIKE ? OR d.nome ILIKE ?)"; p += [termo] * 3
        if falhas:
            w += " AND e.ok = 0"
        for r in db.consultar("SELECT e.id, e.quando, e.acao, e.origem, e.ok, e.detalhe, d.nome, d.tipo, pr.nome AS sala FROM dispositivos_eventos e JOIN dispositivos d ON d.id = e.dispositivo_id "  # nosec B608
                              f"LEFT JOIN projetos pr ON pr.id = d.projeto_id WHERE e.quando >= ? AND e.quando < ?{w} ORDER BY e.quando DESC LIMIT ?", (desde, ate, *p, lim)):
            saida.append({"fonte": "dispositivos", "id": r["id"], "quando": r["quando"], "acao": f"{r['nome']}: {r['acao']}", "origem": r["origem"], "ok": r["ok"],
                          "detalhe": r["detalhe"] or "", "sala": r["sala"], "aparelho": r["nome"], "quem": ""})

        return saida

    def _f_email():
        if not ("email" in fontes and not pessoa_ou_sala):
            return []
        saida = []
        w, p = "", []
        if termo:
            w += " AND (tipo ILIKE ? OR assunto ILIKE ? OR estado ILIKE ?)"; p += [termo] * 3
        if falhas:
            w += " AND (estado IN ('bounced', 'complained', 'erro', 'failed') OR erro <> '')"
        for r in db.consultar(f"SELECT id, criado_em, tipo, para, assunto, estado, erro FROM email_envios WHERE criado_em >= ? AND criado_em < ?{w} "  # nosec B608
                              "ORDER BY criado_em DESC LIMIT ?", (desde, ate, *p, lim)):
            para = r["para"] or ""
            saida.append({"fonte": "email", "id": r["id"], "quando": r["criado_em"], "acao": f"E-mail {r['tipo']}: {r['estado']}", "quem": "",
                          "detalhe": f"para {para[:3]}…@{para.split('@')[-1] if '@' in para else ''} · {r['assunto'] or ''}" + (f" · {r['erro']}" if r["erro"] else ""),
                          "ok": 0 if (r["estado"] in ("bounced", "complained", "erro", "failed") or r["erro"]) else 1})

        return saida

    if "atividade" in fontes:
        tarefas["atividade"] = _f_atividade
    for k, fn in (("seguranca", _f_seguranca), ("telegram", _f_telegram), ("dispositivos", _f_dispositivos), ("email", _f_email)):
        if k in fontes:
            tarefas[k] = fn
    saida: list[dict] = [r for lst in _paralelo(tarefas).values() for r in lst]
    saida.sort(key=lambda r: (r["quando"], r.get("id") or 0), reverse=True)
    saida = saida[:lim]
    classificar([r for r in saida if r["fonte"] == "atividade"])
    return saida


def resumo(desde: int, ate: int | None = None, escopo: tuple[str, tuple] = ("", ())) -> dict:
    """Números do período: por fonte, por pessoa, por sala, o que cada pessoa fez nos ares, por hora e os IPs."""
    ate = ate or (db.agora() + 60)
    ef, ep = escopo
    base = "FROM atividade t LEFT JOIN aparelhos a ON a.id = t.aparelho_id LEFT JOIN projetos pr ON pr.id = a.projeto_id WHERE t.quando >= ? AND t.quando < ?" + ef
    pb = (desde, ate, *ep)
    r = _paralelo({  # nosec B608 (as partes do SQL são fixas; os valores vão como ?)
        "ativ": lambda: db.um("SELECT count(*) AS total, count(*) FILTER (WHERE t.ok = 0) AS falhas, count(*) FILTER (WHERE t.aparelho_id IS NOT NULL) AS ares, "
                              f"count(DISTINCT t.usuario_id) AS pessoas {base}", pb),
        "seg": lambda: db.um("SELECT count(*) FILTER (WHERE tipo <> 'acesso') AS total, count(*) FILTER (WHERE tipo = 'login_ok') AS logins, "
                             "count(*) FILTER (WHERE tipo IN ('login_falhou', 'auth_negado', 'token_invalido')) AS negados, "
                             "count(*) FILTER (WHERE tipo IN ('scanner', 'bloqueado', 'bot_bloqueado', 'ip_bloqueado_auto', 'rate_limit')) AS ataques, "
                             "count(DISTINCT ip) AS ips, count(*) FILTER (WHERE tipo = 'acesso') AS acessos FROM seguranca_eventos WHERE quando >= ? AND quando < ?", (desde, ate)),
        "tg": lambda: db.um("SELECT count(*) AS total, count(*) FILTER (WHERE tipo = 'erro') AS erros FROM telegram_eventos WHERE quando >= ? AND quando < ?", (desde, ate)),
        "disp": lambda: db.um("SELECT count(*) AS total, count(*) FILTER (WHERE ok = 0) AS falhas FROM dispositivos_eventos WHERE quando >= ? AND quando < ?", (desde, ate)),
        "em": lambda: db.um("SELECT count(*) AS total FROM email_envios WHERE criado_em >= ? AND criado_em < ?", (desde, ate)),
        # ações nos ares, classificadas depois (até 6 mil linhas no período)
        "linhas": lambda: db.consultar("SELECT t.id, t.quando, t.acao, t.ok, t.aparelho_id, t.usuario_id, COALESCE(NULLIF(t.usuario, ''), '') AS quem, "
                                       "split_part(t.origem, ':', 1) AS origem, a.nome AS aparelho, pr.id AS sala_id, pr.nome AS sala "
                                       f"{base} AND t.aparelho_id IS NOT NULL ORDER BY t.quando DESC LIMIT 6000", pb),
        "admin": lambda: db.consultar(f"SELECT COALESCE(NULLIF(t.usuario, ''), '(sistema)') AS quem, count(*) AS n {base} AND t.aparelho_id IS NULL "
                                      "AND split_part(t.origem, ':', 1) IN ('painel', 'sistema') GROUP BY 1 ORDER BY 2 DESC LIMIT 20", pb),
        "por_hora": lambda: db.consultar(f"SELECT EXTRACT(HOUR FROM to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC')::int AS hora, count(*) AS n {base} GROUP BY 1 ORDER BY 1", pb),
        "por_dia": lambda: db.consultar("SELECT to_char(to_timestamp(t.quando - 10800) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS dia, count(*) AS total, "
                                        f"count(*) FILTER (WHERE t.ok = 0) AS falhas, count(*) FILTER (WHERE t.aparelho_id IS NOT NULL) AS ares {base} GROUP BY 1 ORDER BY 1", pb),
        "seg_tipos": lambda: db.consultar("SELECT tipo, count(*) AS n FROM seguranca_eventos WHERE quando >= ? AND quando < ? AND tipo <> 'acesso' GROUP BY 1 ORDER BY 2 DESC", (desde, ate)),
        "ips": lambda: db.consultar("SELECT ip, max(pais) AS pais, count(*) AS n, count(*) FILTER (WHERE tipo IN ('login_falhou', 'scanner', 'bloqueado', 'rate_limit', 'auth_negado')) AS suspeitos "
                                    "FROM seguranca_eventos WHERE quando >= ? AND quando < ? AND tipo <> 'acesso' GROUP BY ip ORDER BY 3 DESC LIMIT 15", (desde, ate)),
        "origens": lambda: db.consultar(f"SELECT split_part(t.origem, ':', 1) AS origem, count(*) AS n {base} GROUP BY 1 ORDER BY 2 DESC", pb),
    })
    ativ, seg, tg, disp, em, linhas, admin, por_hora, por_dia, seg_tipos, ips, origens = (r["ativ"], r["seg"], r["tg"], r["disp"], r["em"], r["linhas"], r["admin"], r["por_hora"], r["por_dia"], r["seg_tipos"], r["ips"], r["origens"])
    classificar(linhas)
    pessoas: dict = {}
    salas: dict = {}
    ares: dict = {}
    for r in linhas:
        k = r.get("acao_ar") or "config"
        quem = r["quem"] or SEM_PESSOA.get(r["origem"], r["origem"] or "Sistema")
        pid = r.get("usuario_id") or f"origem:{r['origem']}"
        for chave, nome, d in ((pid, quem, pessoas), (r.get("sala_id") or 0, r.get("sala") or "Sem sala", salas), (r["aparelho_id"], r.get("aparelho") or "?", ares)):
            x = d.setdefault(chave, {"id": chave, "nome": nome, "total": 0, "falhas": 0, "junto": 0, **{a: 0 for a in ACOES_AR}, "ultimo": 0})
            x["total"] += 1
            x[k] = x.get(k, 0) + 1
            x["falhas"] += 0 if r["ok"] else 1
            x["junto"] += 1 if r.get("junto") else 0
            x["ultimo"] = max(x["ultimo"], r["quando"])
    selos = db.cfg("integridade_selos") or []
    ordem = lambda d: sorted(d.values(), key=lambda x: -x["total"])  # noqa: E731
    return {
        "desde": desde, "ate": ate,
        "totais": {"atividade": ativ, "seguranca": seg, "telegram": tg, "dispositivos": disp, "email": em},
        "pessoas": ordem(pessoas), "salas": ordem(salas), "ares": ordem(ares), "admin": admin,
        "por_hora": por_hora, "por_dia": por_dia, "seg_tipos": seg_tipos, "ips": ips, "origens": origens,
        "acoes_ar": ACOES_AR, "fontes": FONTES,
        "integridade": {"selos": len(selos), "ultimo": selos[-1]["dia"] if selos else None},
        "gerado_em": int(time.time()),
    }
