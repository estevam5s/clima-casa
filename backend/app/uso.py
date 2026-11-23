"""Uso do sistema por pessoa: quanto tempo cada tela ficou aberta e visível, e por onde cada um navega.

O navegador soma o tempo da tela visível (aba em primeiro plano) e manda em lotes a cada minuto e ao esconder a aba
(POST /api/conta/uso-telas). Aqui só se somam números por pessoa, dia (Brasília) e tela. Nada do que foi digitado.
"""
import re
import time
from datetime import datetime, timedelta, timezone

from . import db

BRT = timezone(timedelta(hours=-3))
_ROTA = re.compile(r"^/[a-z0-9/_:-]{0,79}$")
MAX_MS = 3 * 3600 * 1000   # um envio nunca soma mais de 3 h numa tela (aba esquecida aberta não vira dia inteiro)

NOMES = {
    "/": "Painel", "/projetos": "Projetos", "/mapa": "Mapa do escritório", "/avatares": "Avatares 3D", "/relatorios": "Relatórios",
    "/aparelhos": "Aparelhos", "/aparelhos/:id": "Um ar", "/cenas": "Cenas", "/automacoes": "Automações", "/agendamentos": "Agenda",
    "/transmissores": "Transmissores", "/musica": "Música", "/cafeteira": "Cafeteira", "/luzes": "Iluminação", "/persianas": "Persianas",
    "/fechadura": "Fechadura", "/integracoes": "Integrações", "/comandos-alexa": "Comandos da Alexa", "/alexa": "Alexa", "/emails": "E-mails",
    "/supabase": "Supabase", "/infra": "Infra", "/rede": "Rede", "/atividade": "Atividade", "/seguranca": "Segurança", "/mensagens": "Mensagens",
    "/configuracoes": "Configurações", "/apps": "Apps", "/guia": "Guia", "/novidades": "Novidades", "/ia": "Assistente de IA", "/bugs": "Bugs",
    "/backup": "Backup", "/telegram": "Telegram", "/treinamento": "Treinamento", "/analise": "Acessos e SEO", "/idiomas": "Idiomas do site",
    "/notificacoes": "Notificações",
}


def normalizar(rota) -> str | None:
    r = str(rota or "").split("?")[0].split("#")[0].lower().rstrip("/") or "/"
    r = re.sub(r"/\d+(?=/|$)", "/:id", r)
    return r if _ROTA.match(r) else None


def _int(v, maximo: int) -> int:
    try:
        return max(0, min(maximo, int(float(v or 0))))
    except (TypeError, ValueError, OverflowError):
        return 0


def dia_de(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts or time.time(), BRT).strftime("%Y-%m-%d")


def gravar(usuario_id: str, telas: list[dict], caminhos: list[dict]) -> int:
    dia, n = dia_de(), 0
    for t in telas[:40]:
        if not isinstance(t, dict):
            continue
        rota = normalizar(t.get("rota"))
        ms = _int(t.get("ms"), MAX_MS)
        vis = _int(t.get("visitas"), 200)
        if not rota or (ms == 0 and vis == 0):
            continue
        db.executar("INSERT INTO uso_telas (usuario_id, dia, rota, ms, visitas) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT (usuario_id, dia, rota) DO UPDATE SET ms = uso_telas.ms + EXCLUDED.ms, visitas = uso_telas.visitas + EXCLUDED.visitas",
                    (usuario_id, dia, rota, ms, vis))
        n += 1
    for c in caminhos[:40]:
        if not isinstance(c, dict):
            continue
        de, para = normalizar(c.get("de")), normalizar(c.get("para"))
        k = _int(c.get("n"), 200)
        if not de or not para or de == para or not k:
            continue
        db.executar("INSERT INTO uso_caminhos (usuario_id, dia, de, para, n) VALUES (?, ?, ?, ?, ?) "
                    "ON CONFLICT (usuario_id, dia, de, para) DO UPDATE SET n = uso_caminhos.n + EXCLUDED.n", (usuario_id, dia, de, para, k))
        n += 1
    return n


def relatorio(ids: list[str], dias: int) -> dict:
    """Tempo por pessoa, por dia e por tela; caminhos mais comuns. ids = pessoas que quem pergunta pode ver."""
    if not ids:
        return {"dias": [], "pessoas": [], "telas": [], "caminhos": [], "matriz": [], "nomes": NOMES}
    desde = dia_de(time.time() - (dias - 1) * 86400)
    marcas = ",".join("?" for _ in ids)
    linhas = db.consultar(f"SELECT usuario_id::text AS uid, dia, rota, ms, visitas FROM uso_telas WHERE dia >= ? AND usuario_id::text IN ({marcas})", (desde, *ids))  # nosec B608
    cam = db.consultar(f"SELECT de, para, sum(n) AS n, count(DISTINCT usuario_id) AS pessoas FROM uso_caminhos WHERE dia >= ? AND usuario_id::text IN ({marcas}) "  # nosec B608
                       "GROUP BY de, para ORDER BY n DESC LIMIT 15", (desde, *ids))
    todos_dias = [dia_de(time.time() - (dias - 1 - i) * 86400) for i in range(dias)]
    por_dia = {d: {"dia": d, "ms": 0, "visitas": 0, "pessoas": set()} for d in todos_dias}
    pessoas, telas, matriz = {}, {}, {}
    for r in linhas:
        ms, vis, uid, rota = int(r["ms"]), int(r["visitas"]), r["uid"], r["rota"]
        d = por_dia.get(r["dia"])
        if d:
            d["ms"] += ms; d["visitas"] += vis; d["pessoas"].add(uid)
        p = pessoas.setdefault(uid, {"id": uid, "ms": 0, "visitas": 0, "dias": set(), "telas": {}, "serie": {}})
        p["ms"] += ms; p["visitas"] += vis; p["dias"].add(r["dia"])
        p["telas"][rota] = p["telas"].get(rota, 0) + ms
        p["serie"][r["dia"]] = p["serie"].get(r["dia"], 0) + ms
        t = telas.setdefault(rota, {"rota": rota, "ms": 0, "visitas": 0, "pessoas": set()})
        t["ms"] += ms; t["visitas"] += vis; t["pessoas"].add(uid)
        matriz[(uid, rota)] = matriz.get((uid, rota), 0) + ms
    top = sorted(telas.values(), key=lambda x: -x["ms"])[:12]
    rotas_top = [t["rota"] for t in top[:8]]
    saida_p = []
    for p in sorted(pessoas.values(), key=lambda x: -x["ms"]):
        fav = sorted(p["telas"].items(), key=lambda kv: -kv[1])
        saida_p.append({"id": p["id"], "ms": p["ms"], "visitas": p["visitas"], "dias_ativos": len(p["dias"]), "ultimo_dia": max(p["dias"]) if p["dias"] else None,
                        "favorita": fav[0][0] if fav else None, "telas": [{"rota": k, "ms": v} for k, v in fav[:8]],
                        "serie": [{"dia": d, "ms": p["serie"].get(d, 0)} for d in todos_dias]})
    return {
        "dias": [{"dia": d["dia"], "ms": d["ms"], "visitas": d["visitas"], "pessoas": len(d["pessoas"])} for d in por_dia.values()],
        "pessoas": saida_p,
        "telas": [{"rota": t["rota"], "ms": t["ms"], "visitas": t["visitas"], "pessoas": len(t["pessoas"])} for t in top],
        "matriz": [{"id": p["id"], "rotas": {r: matriz.get((p["id"], r), 0) for r in rotas_top}} for p in saida_p],
        "rotas_matriz": rotas_top,
        "caminhos": [{"de": c["de"], "para": c["para"], "n": int(c["n"]), "pessoas": int(c["pessoas"])} for c in cam],
        "nomes": NOMES,
    }


def apagar_de(usuario_id: str):
    db.executar("DELETE FROM uso_telas WHERE usuario_id::text = ?", (str(usuario_id),))
    db.executar("DELETE FROM uso_caminhos WHERE usuario_id::text = ?", (str(usuario_id),))
