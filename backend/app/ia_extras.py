"""Assistente de IA (/ia): Artefatos e Agendados.

Artefatos: tudo que o assistente entregou em bloco de código (```linguagem … ```) nas conversas da pessoa: código, SQL,
JSON, tabelas, roteiros. A tela lista, mostra, copia e baixa como arquivo. Só da própria pessoa.

Agendados: um pedido que roda sozinho no horário escolhido (ex.: "todo dia útil às 8h, resumo dos ares e do tempo"). O agente
do escritório roda (agenda.laco → ciclo, a cada ~20 s) com as permissões de quem criou e SEMPRE em modo só leitura (nada muda
ar nem conta sozinho). A resposta vira uma conversa nova em /ia e um aviso no sino só para essa pessoa (chave "pessoal:").
Tabela ia_agendados.
"""
from __future__ import annotations

import datetime
import json
import logging
import re

from . import db

log = logging.getLogger("clima.ia_extras")
EXT = {"python": "py", "py": "py", "javascript": "js", "js": "js", "jsx": "jsx", "typescript": "ts", "ts": "ts", "tsx": "tsx", "sql": "sql",
       "json": "json", "bash": "sh", "sh": "sh", "shell": "sh", "zsh": "sh", "powershell": "ps1", "ps1": "ps1", "html": "html", "css": "css",
       "yaml": "yml", "yml": "yml", "xml": "xml", "markdown": "md", "md": "md", "csv": "csv", "ini": "ini", "toml": "toml", "dockerfile": "Dockerfile"}
BLOCO = re.compile(r"```([\w+#.-]*)[^\n]*\n(.*?)```", re.S)


def artefatos(uid: str, limite: int = 200) -> list[dict]:
    saida = []
    for c in db.consultar("SELECT id, titulo, mensagens, atualizado_em FROM ia_conversas WHERE usuario_id = ? ORDER BY atualizado_em DESC LIMIT 150", (uid,)):
        msgs = c["mensagens"] if isinstance(c["mensagens"], list) else json.loads(c["mensagens"] or "[]")
        for i, m in enumerate(msgs):
            if m.get("role") != "assistant" or not isinstance(m.get("content"), str):
                continue
            for k, b in enumerate(BLOCO.finditer(m["content"])):
                corpo = b.group(2).rstrip()
                if len(corpo.strip()) < 12:
                    continue
                ling = (b.group(1) or "texto").lower()
                primeira = next((l.strip() for l in corpo.splitlines() if l.strip()), "")[:80]
                saida.append({"id": f"{c['id']}-{i}-{k}", "conversa_id": c["id"], "conversa": c["titulo"], "linguagem": ling,
                              "extensao": EXT.get(ling, "txt"), "titulo": primeira, "linhas": corpo.count("\n") + 1,
                              "conteudo": corpo[:60000], "quando": c["atualizado_em"]})
                if len(saida) >= limite:
                    return saida
    return saida


# ---------------- agendados ----------------
def listar(uid: str) -> list[dict]:
    return db.consultar("SELECT * FROM ia_agendados WHERE usuario_id = ? ORDER BY hora", (uid,))


def salvar(uid: str, d: dict, aid: int | None = None) -> dict:
    hora = str(d.get("hora") or "08:00")
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", hora):
        raise ValueError("Hora inválida.")
    dias = sorted({int(x) for x in d.get("dias") or [] if str(x).isdigit() and 0 <= int(x) <= 6}) or [1, 2, 3, 4, 5]
    titulo, pedido = str(d.get("titulo") or "").strip()[:80], str(d.get("pedido") or "").strip()[:2000]
    if not titulo or len(pedido) < 5:
        raise ValueError("Dê um nome e escreva o pedido.")
    entregar = [x for x in (d.get("entregar") or ["sino"]) if x in ("sino", "email", "telegram")] or ["sino"]
    vals = (titulo, pedido, hora, json.dumps(dias), bool(d.get("ativo", True)), json.dumps(entregar))
    if aid:
        if not db.um("SELECT 1 AS ok FROM ia_agendados WHERE id = ? AND usuario_id = ?", (aid, uid)):
            raise LookupError("Agendado não encontrado.")
        db.executar("UPDATE ia_agendados SET titulo = ?, pedido = ?, hora = ?, dias = CAST(? AS jsonb), ativo = ?, entregar = CAST(? AS jsonb) WHERE id = ?", (*vals, aid))
    else:
        if (db.um("SELECT count(*) AS n FROM ia_agendados WHERE usuario_id = ?", (uid,)) or {}).get("n", 0) >= 20:
            raise ValueError("Limite de 20 agendados por pessoa.")
        aid = db.um("INSERT INTO ia_agendados (usuario_id, titulo, pedido, hora, dias, ativo, entregar, criado_em) VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?, CAST(? AS jsonb), ?) RETURNING id",
                    (uid, *vals, db.agora()))["id"]
    return db.um("SELECT * FROM ia_agendados WHERE id = ?", (aid,))


def rodar(ag: dict, origem: str = "agendado") -> dict:
    """Roda um agendado como a pessoa que criou (só leitura), salva como conversa e avisa."""
    from . import acesso, ia, notificacoes, telegram
    u = telegram._usuario(str(ag["usuario_id"]))
    if not u:
        raise RuntimeError("A conta de quem criou está desativada.")
    token = acesso.atual.set(u)
    try:
        r = ia.conversar([{"role": "user", "content": ag["pedido"]}], "agendado", origem=f"ia:{origem}", leitura=True)
    finally:
        acesso.atual.reset(token)
    texto = r.get("texto") or ""
    agora = db.agora()
    msgs = [{"role": "user", "content": ag["pedido"]}, {"role": "assistant", "content": texto, "modelo": r.get("modelo")}]
    cid = db.um("INSERT INTO ia_conversas (usuario_id, titulo, mensagens, criado_em, atualizado_em) VALUES (?, ?, CAST(? AS jsonb), ?, ?) RETURNING id",
                (str(ag["usuario_id"]), f"Agendado: {ag['titulo']}"[:120], json.dumps(msgs, ensure_ascii=False), agora, agora))["id"]
    db.executar("UPDATE ia_agendados SET ultima_exec = ?, ultimo_resultado = ?, ultima_conversa = ? WHERE id = ?", (agora, texto[:500], cid, ag["id"]))
    entregar = ag["entregar"] if isinstance(ag["entregar"], list) else json.loads(ag["entregar"] or '["sino"]')
    if "sino" in entregar:
        notificacoes.notificar(f"pessoal:ia_agendado:{ag['id']}:{agora}:{ag['usuario_id']}", "ia", "baixa", f"Agendado: {ag['titulo']}", texto[:400], f"/ia?c={cid}")
    if "email" in entregar:
        try:
            from . import correio
            correio.enviar(u["email"], "alerta", {"titulo": f"Agendado: {ag['titulo']}", "detalhe": texto[:3000], "gravidade": "media", "link": f"/ia?c={cid}"})
        except Exception as e:  # noqa: BLE001
            log.warning("agendado %s: e-mail: %s", ag["id"], e)
    if "telegram" in entregar:
        try:
            tg = telegram.cfg()
            for chat, v in (tg.get("vinculos") or {}).items():
                if str(v.get("usuario_id")) == str(ag["usuario_id"]):
                    telegram._enviar(chat, telegram._e(f"{ag['titulo']}\n\n{texto[:3500]}"))
        except Exception as e:  # noqa: BLE001
            log.warning("agendado %s: telegram: %s", ag["id"], e)
    return {"conversa_id": cid, "texto": texto}


def ciclo():
    """No agente principal, a cada ciclo do agenda.laco: roda os agendados da hora (horário de Brasília), uma vez por dia."""
    agora = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).replace(tzinfo=None)
    hhmm, hoje, dia = agora.strftime("%H:%M"), (agora.weekday() + 1) % 7, agora.strftime("%Y-%m-%d")
    for ag in db.consultar("SELECT * FROM ia_agendados WHERE ativo AND hora = ?", (hhmm,)):
        dias = ag["dias"] if isinstance(ag["dias"], list) else json.loads(ag["dias"] or "[]")
        if hoje not in dias or (ag.get("ultimo_dia") or "") == dia:
            continue
        db.executar("UPDATE ia_agendados SET ultimo_dia = ? WHERE id = ?", (dia, ag["id"]))
        try:
            rodar(ag)
        except Exception as e:  # noqa: BLE001
            db.executar("UPDATE ia_agendados SET ultimo_resultado = ? WHERE id = ?", (f"Erro: {str(e)[:300]}", ag["id"]))
            log.warning("agendado %s: %s", ag["id"], e)
