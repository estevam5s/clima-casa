"""Segurança dos comandos físicos (ares, luzes, cafeteira, persianas, fechadura).

O sistema mexe em equipamento de verdade: aqui ficam as travas que valem para QUALQUER origem (painel, app, Alexa,
Telegram, IA, agenda, automação), checadas no servidor antes de o comando sair:

- **Estado seguro sempre passa**: desligar, fechar, parar e trancar nunca são barrados (nem por limite, nem por
  isolamento). Uma trava de software nunca pode impedir alguém de deixar o equipamento num estado seguro.
- **Limite de frequência por aparelho** (anti-rajada e anti-laço de automação): conta no banco (vale para todas as
  instâncias da nuvem e para o agente), não na memória.
- **Anti-liga/desliga** do ar: no máximo `LIGA_DESLIGA_10MIN` trocas de ligado↔desligado em 10 min (compressor). Não
  substitui a proteção do fabricante; só evita que o sistema seja o causador de ciclos curtos.
- **Isolamento**: dono/admin isola um aparelho suspeito (`config.isolados`); ele só aceita o estado seguro até ser liberado.
- **Validade dos comandos** na fila da placa própria: comando velho não é executado (a placa que volta depois de 10 min
  offline não destranca a porta de um pedido antigo).
"""
from __future__ import annotations

from . import db

# ações que levam ao estado seguro (sempre permitidas)
SEGURAS = {"desligar", "fechar", "parar", "trancar"}

# limite de comandos por aparelho em 60 s (fora as ações seguras)
LIMITE_MINUTO = {"ar": 12, "luz": 10, "cafeteira": 4, "persiana": 12, "fechadura": 5}
LIGA_DESLIGA_10MIN = 8

# validade (s) de um comando parado na fila de uma placa própria
VALIDADE_PLACA = {"destrancar": 30, "padrao": 120}

# cafeteira sem limite configurado desliga sozinha depois disto (minutos)
CAFETEIRA_MAX_MIN = 90


class Bloqueado(RuntimeError):
    """Comando recusado por uma trava de segurança física (a mensagem diz o motivo e o que fazer)."""


def isolados() -> dict:
    v = db.cfg("isolados", {}) or {}
    return {"aparelhos": {str(k): x for k, x in (v.get("aparelhos") or {}).items()},
            "dispositivos": {str(k): x for k, x in (v.get("dispositivos") or {}).items()}}


def isolar(tipo: str, ident: int, ligar: bool, motivo: str, quem: str) -> dict:
    if tipo not in ("aparelhos", "dispositivos"):
        raise ValueError("Tipo inválido.")
    v = isolados()
    if ligar:
        v[tipo][str(ident)] = {"motivo": (motivo or "").strip()[:200] or "sem motivo informado", "por": quem, "em": db.agora()}
    else:
        v[tipo].pop(str(ident), None)
    db.set_cfg("isolados", v)
    if ligar and tipo == "dispositivos":   # placa própria: tira da fila o que ainda não saiu (fica só o estado seguro)
        import json
        d = db.um("SELECT fila FROM dispositivos WHERE id = ?", (ident,))
        fila = d and (d["fila"] if isinstance(d["fila"], list) else json.loads(d["fila"] or "[]"))
        if fila:
            db.executar("UPDATE dispositivos SET fila = CAST(? AS jsonb) WHERE id = ?",
                        (json.dumps([c for c in fila if c.get("acao") in SEGURAS]), ident))
    db.registrar("seguranca", f"{'Isolou' if ligar else 'Liberou'} {'o ar' if tipo == 'aparelhos' else 'o dispositivo'} #{ident}",
                 aparelho_id=ident if tipo == "aparelhos" else None, detalhe=f"por {quem}: {motivo or ''}"[:300])
    return v


def _evento_bloqueio(titulo: str, detalhe: str, aparelho_id: int | None = None):
    try:
        db.registrar("seguranca", titulo, ok=False, aparelho_id=aparelho_id, detalhe=detalhe[:300])
    except Exception:  # noqa: BLE001
        pass


def checar_ar(a: dict, novo: dict) -> None:
    """Antes de mandar o sinal a um ar. `a` = estado salvo, `novo` = estado pedido."""
    aid = a["id"]
    if not novo["ligado"]:
        return   # desligar sempre passa
    from . import geral
    motivo = geral.checar_temperatura(a, novo)   # política de temperatura (Configurações → Geral)
    if motivo:
        _evento_bloqueio("Comando recusado: fora da política de temperatura", f"{novo.get('temperatura')}°", aid)
        raise Bloqueado(motivo)
    iso = isolados()["aparelhos"].get(str(aid))
    if iso:
        _evento_bloqueio("Comando recusado: ar isolado", iso.get("motivo", ""), aid)
        raise Bloqueado(f"{a['nome']} está isolado por segurança ({iso.get('motivo')}). Só desligar é aceito até um dono ou admin "
                        "liberar em Segurança → Aparelhos isolados.")
    agora = db.agora()
    r = db.um("SELECT count(*) AS n FROM atividade WHERE aparelho_id = ? AND quando > ? AND ok = 1 AND origem <> 'seguranca' "
              "AND acao NOT LIKE 'Desligar%'", (aid, agora - 60))
    if r and r["n"] >= LIMITE_MINUTO["ar"]:
        _evento_bloqueio("Comando recusado: muitos comandos no ar", f"{r['n']} em 60 s", aid)
        raise Bloqueado(f"{a['nome']} recebeu {r['n']} comandos no último minuto. Espere um pouco antes de mandar outro "
                        "(trava contra rajadas e automações em laço; desligar continua liberado).")
    if not a["ligado"]:   # vai ligar: conta as trocas de ligado/desligado recentes
        r = db.um("SELECT count(*) AS n FROM atividade WHERE aparelho_id = ? AND quando > ? AND ok = 1 "
                  "AND (acao LIKE 'Ligar%' OR acao LIKE 'Desligar%')", (aid, agora - 600))
        if r and r["n"] >= LIGA_DESLIGA_10MIN:
            _evento_bloqueio("Comando recusado: liga/desliga seguido", f"{r['n']} trocas em 10 min", aid)
            raise Bloqueado(f"{a['nome']} foi ligado e desligado {r['n']} vezes em 10 minutos. Para proteger o compressor, "
                            "espere alguns minutos antes de ligar de novo.")


def checar_dispositivo(d: dict, acao: str) -> None:
    """Antes de comandar luz, cafeteira, persiana ou fechadura (Tuya ou placa própria)."""
    if acao in SEGURAS:
        return
    iso = isolados()["dispositivos"].get(str(d["id"]))
    if iso:
        _evento_bloqueio("Comando recusado: dispositivo isolado", f"{d['nome']}: {iso.get('motivo', '')}")
        raise Bloqueado(f"{d['nome']} está isolado por segurança ({iso.get('motivo')}). Só o estado seguro (desligar, fechar, "
                        "parar, trancar) é aceito até um dono ou admin liberar.")
    lim = LIMITE_MINUTO.get(d["tipo"], 10)
    r = db.um("SELECT count(*) AS n FROM dispositivos_eventos WHERE dispositivo_id = ? AND quando > ? AND ok = 1",
              (d["id"], db.agora() - 60))
    if r and r["n"] >= lim:
        _evento_bloqueio("Comando recusado: muitos comandos", f"{d['nome']}: {r['n']} em 60 s")
        raise Bloqueado(f"{d['nome']} recebeu {r['n']} comandos no último minuto. Espere um pouco "
                        "(trava contra rajadas e automações em laço; o estado seguro continua liberado).")


def validade_placa(acao: str) -> int:
    return VALIDADE_PLACA.get(acao, VALIDADE_PLACA["padrao"])


def resumo() -> dict:
    """Para a tela de Segurança e o checklist."""
    iso = isolados()
    return {"limite_minuto": LIMITE_MINUTO, "liga_desliga_10min": LIGA_DESLIGA_10MIN, "seguras": sorted(SEGURAS),
            "validade_placa_s": VALIDADE_PLACA, "cafeteira_max_min": CAFETEIRA_MAX_MIN,
            "isolados": {"aparelhos": iso["aparelhos"], "dispositivos": iso["dispositivos"]}}
