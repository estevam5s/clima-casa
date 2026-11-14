"""Central de notificações persistida no Supabase (tabela notificacoes).

Dois tipos de origem:
  - condições (prefixo "cond:"): recalculadas por sincronizar() a partir do estado atual (alertas, falhas,
    transmissores, agente, Sinric, aparelhos sem botões). Quando a condição some, a notificação vira "resolvida".
  - eventos: gravados na hora por notificar() (IP bloqueado, novo acesso de administrador, transmissor
    reconfigurado…). Cada nova ocorrência volta a ficar "não lida", mesmo se tinha sido arquivada.
"""
import json
import threading
import time

from . import db

PREF_PADRAO = {"tipos_ocultos": [], "som": False, "contador_so_importantes": False, "arquivar_resolvidas_h": 24}
TIPOS = {"alerta": "Alertas", "falha": "Falhas de comando", "transmissor": "Transmissores", "agente": "Agente do Mac",
         "alexa": "Alexa e Google", "configuracao": "Configuração", "seguranca": "Segurança", "sistema": "Sistema"}
_ultima_sync = {"em": 0.0}
_trava = threading.Lock()


def preferencias() -> dict:
    return {**PREF_PADRAO, **(db.cfg("notificacoes_pref") or {})}


def notificar(chave: str, tipo: str, gravidade: str, titulo: str, detalhe: str = "", link: str = "", acao: dict | None = None):
    """Evento novo: grava ou reabre como não lida."""
    agora = db.agora()
    try:
        db.executar(
            "INSERT INTO notificacoes (chave, tipo, gravidade, titulo, detalhe, link, acao, criado_em, atualizado_em) "
            "VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?) ON CONFLICT (chave) DO UPDATE SET tipo = excluded.tipo, "
            "gravidade = excluded.gravidade, titulo = excluded.titulo, detalhe = excluded.detalhe, link = excluded.link, "
            "acao = excluded.acao, atualizado_em = excluded.atualizado_em, ocorrencias = notificacoes.ocorrencias + 1, "
            "lida = false, arquivada = false, resolvida = false",
            (chave[:120], tipo, gravidade, titulo[:200], str(detalhe)[:500], link[:200], json.dumps(acao) if acao else None, agora, agora))
    except Exception:  # noqa: BLE001  (notificação nunca derruba quem chamou)
        pass


def _condicoes() -> list[dict]:
    from . import transmissor
    itens, agora = [], db.agora()
    for a in db.consultar("SELECT id, mensagem, criado_em FROM alertas WHERE NOT resolvido ORDER BY id DESC LIMIT 20"):
        itens.append({"chave": f"cond:alerta-{a['id']}", "tipo": "alerta", "gravidade": "alta", "titulo": a["mensagem"],
                      "detalhe": "Alerta gerado pelas rotinas do Supabase.", "link": "/supabase",
                      "acao": {"rotulo": "Resolver", "tipo": "resolver_alerta", "alerta_id": a["id"]}})
    for f in db.consultar("SELECT t.aparelho_id, max(a.nome) AS nome, count(*) AS n, max(t.detalhe) AS detalhe FROM atividade t "
                          "JOIN aparelhos a ON a.id = t.aparelho_id WHERE t.ok = 0 AND t.quando > ? GROUP BY t.aparelho_id", (agora - 86400,)):
        itens.append({"chave": f"cond:falha-{f['aparelho_id']}", "tipo": "falha", "gravidade": "media",
                      "titulo": f"{f['nome']}: {f['n']} comando(s) falharam nas últimas 24 h", "detalhe": f["detalhe"] or "",
                      "link": f"/aparelhos/{f['aparelho_id']}", "acao": {"rotulo": "Abrir aparelho", "tipo": "link", "para": f"/aparelhos/{f['aparelho_id']}"}})
    for h in db.consultar("SELECT id, nome, problema FROM hubs WHERE online = 0 OR problema IS NOT NULL"):
        itens.append({"chave": f"cond:hub-{h['id']}", "tipo": "transmissor", "gravidade": "alta",
                      "titulo": f"Transmissor {h['nome']} {'com problema' if h['problema'] else 'offline'}",
                      "detalhe": h["problema"] or "Sem resposta na rede. O agente tenta reconectar sozinho.", "link": "/transmissores",
                      "acao": {"rotulo": "Reconectar agora", "tipo": "reparar_hub"}})
    if not transmissor.agente_online():
        itens.append({"chave": "cond:agente", "tipo": "agente", "gravidade": "alta", "titulo": "Agente do Mac offline",
                      "detalhe": "Sem ele os comandos, a Alexa, a agenda e as automações param.", "link": "/configuracoes?aba=sistema"})
    sinric_cfg, sinric_st = db.cfg("sinric") or {}, db.cfg("sinric_status") or {}
    if sinric_cfg.get("ativo") and sinric_st.get("dispositivos") and not sinric_st.get("conectado"):
        itens.append({"chave": "cond:sinric", "tipo": "alexa", "gravidade": "media", "titulo": "Alexa/Google desconectado (Sinric Pro)",
                      "detalhe": sinric_st.get("erro") or "O agente reconecta sozinho em até 30 s.", "link": "/integracoes"})
    for a in db.consultar("SELECT a.id, a.nome FROM aparelhos a WHERE NOT EXISTS (SELECT 1 FROM codigos c WHERE c.aparelho_id = a.id)"):
        itens.append({"chave": f"cond:sem-botoes-{a['id']}", "tipo": "configuracao", "gravidade": "baixa",
                      "titulo": f"{a['nome']} ainda não tem botões gravados", "detalhe": "Grave os botões do controle original para controlar o ar.",
                      "link": f"/aparelhos/{a['id']}?aba=botoes", "acao": {"rotulo": "Gravar botões", "tipo": "link", "para": f"/aparelhos/{a['id']}?aba=botoes"}})
    if not db.cfg("tuya_conta"):
        itens.append({"chave": "cond:smartlife", "tipo": "configuracao", "gravidade": "baixa", "titulo": "Conta Smart Life não conectada",
                      "detalhe": "Conecte uma vez para o transmissor se reconfigurar sozinho se for pareado de novo.", "link": "/configuracoes?aba=geral",
                      "acao": {"rotulo": "Conectar", "tipo": "link", "para": "/configuracoes?aba=geral"}})
    return itens


def sincronizar(forcar: bool = False):
    """Atualiza as notificações de condição. Roda no máximo a cada 20 s por instância."""
    with _trava:
        if not forcar and time.time() - _ultima_sync["em"] < 20:
            return
        _ultima_sync["em"] = time.time()
    agora = db.agora()
    atuais = _condicoes()
    for c in atuais:
        # nova ou reaberta (estava resolvida): entra como não lida; já existente: só atualiza o texto
        db.executar(
            "INSERT INTO notificacoes (chave, tipo, gravidade, titulo, detalhe, link, acao, criado_em, atualizado_em) "
            "VALUES (?,?,?,?,?,?,CAST(? AS jsonb),?,?) ON CONFLICT (chave) DO UPDATE SET titulo = excluded.titulo, "
            "detalhe = excluded.detalhe, gravidade = excluded.gravidade, link = excluded.link, acao = excluded.acao, "
            "atualizado_em = CASE WHEN notificacoes.resolvida THEN excluded.atualizado_em ELSE notificacoes.atualizado_em END, "
            "ocorrencias = notificacoes.ocorrencias + CASE WHEN notificacoes.resolvida THEN 1 ELSE 0 END, "
            "lida = CASE WHEN notificacoes.resolvida THEN false ELSE notificacoes.lida END, "
            "arquivada = CASE WHEN notificacoes.resolvida THEN false ELSE notificacoes.arquivada END, resolvida = false",
            (c["chave"], c["tipo"], c["gravidade"], c["titulo"], c["detalhe"], c["link"], json.dumps(c.get("acao")) if c.get("acao") else None, agora, agora))
    chaves = [c["chave"] for c in atuais] or ["-"]
    marcas = ",".join("?" * len(chaves))
    db.executar(f"UPDATE notificacoes SET resolvida = true, lida = true, atualizado_em = ? WHERE chave LIKE 'cond:%' "
                f"AND NOT resolvida AND chave NOT IN ({marcas})", (agora, *chaves))
    horas = preferencias()["arquivar_resolvidas_h"]
    if horas:
        db.executar("UPDATE notificacoes SET arquivada = true WHERE resolvida AND NOT arquivada AND atualizado_em < ?", (agora - horas * 3600,))


def listar(filtro: str = "todas", limite: int = 80) -> dict:
    sincronizar()
    pref = preferencias()
    ocultos = pref["tipos_ocultos"] or ["-"]
    marcas = ",".join("?" * len(ocultos))
    base = f"FROM notificacoes WHERE NOT arquivada AND tipo NOT IN ({marcas})"
    condicao = {"nao_lidas": " AND NOT lida", "importantes": " AND gravidade = 'alta' AND NOT resolvida",
                "seguranca": " AND tipo = 'seguranca'"}.get(filtro, "")
    itens = db.consultar(f"SELECT * {base}{condicao} ORDER BY resolvida, atualizado_em DESC LIMIT ?", (*ocultos, min(limite, 200)))
    cont = db.um(f"SELECT count(*) AS todas, count(*) FILTER (WHERE NOT lida) AS nao_lidas, "
                 f"count(*) FILTER (WHERE gravidade = 'alta' AND NOT resolvida) AS importantes, "
                 f"count(*) FILTER (WHERE tipo = 'seguranca') AS seguranca, "
                 f"count(*) FILTER (WHERE NOT lida AND gravidade = 'alta') AS nao_lidas_importantes {base}", ocultos)
    for i in itens:
        if isinstance(i.get("acao"), str):
            i["acao"] = json.loads(i["acao"])
    contador = cont["nao_lidas_importantes"] if pref["contador_so_importantes"] else cont["nao_lidas"]
    return {"itens": itens, "contagem": cont, "total": contador, "preferencias": pref, "tipos": TIPOS}


def executar_acao(nid: int) -> str:
    n = db.um("SELECT * FROM notificacoes WHERE id = ?", (nid,))
    if not n:
        raise ValueError("Notificação não encontrada.")
    acao = n["acao"] if isinstance(n["acao"], dict) else json.loads(n["acao"] or "null")
    if not acao:
        raise ValueError("Esta notificação não tem ação.")
    if acao["tipo"] == "resolver_alerta":
        db.executar("UPDATE alertas SET resolvido = true WHERE id = ?", (acao["alerta_id"],))
        msg = "Alerta resolvido."
    elif acao["tipo"] == "desbloquear_ip":
        from . import firewall
        db.executar("DELETE FROM seguranca_ips WHERE alvo = ? AND tipo = 'bloqueado'", (acao["alvo"],))
        firewall.invalidar()
        db.registrar("painel", f"IP desbloqueado pela notificação: {acao['alvo']}")
        msg = f"IP {acao['alvo']} desbloqueado."
    elif acao["tipo"] == "reparar_hub":
        from . import transmissor
        if transmissor.PAPEL == "agente":
            transmissor.autorreparar(forcar=True)
        elif transmissor.agente_online():
            transmissor.enfileirar("reparar", None, {})
        else:
            raise ValueError("O agente do Mac está offline: ele que procura o transmissor na rede.")
        msg = "Reconexão pedida ao agente. A notificação some sozinha quando o transmissor responder."
        return msg
    else:
        raise ValueError("Ação desconhecida.")
    db.executar("UPDATE notificacoes SET lida = true, resolvida = true, atualizado_em = ? WHERE id = ?", (db.agora(), nid))
    return msg
