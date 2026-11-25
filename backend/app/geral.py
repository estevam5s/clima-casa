"""Configurações gerais do sistema (Configurações → Geral), guardadas em config.geral.

Tudo aqui tem efeito de verdade:
- temp_min / temp_max: política de temperatura. Pedido de ligar fora da faixa é recusado em clima.aplicar (via fisico.checar_ar).
  Desligar sempre passa. 0 = sem limite.
- desligar_apos_h: o agente desliga o ar que ficou ligado mais que N horas seguidas (0 = desligado).
- aviso_ligado_h: notificação quando um ar passa de N horas ligado (uma por vez que ligou).
- aviso_fora_expediente: notificação quando um ar está ligado fora do expediente (uma por ar por dia).
- arquivar_notif_dias: notificações lidas há mais de N dias vão para o arquivo sozinhas.
O ciclo roda no agente principal a cada ~5 min (agenda.laco).
"""
from __future__ import annotations

import datetime
import json

from . import db

CHAVE = "geral"
BRT = datetime.timezone(datetime.timedelta(hours=-3))
PADRAO = {"temp_min": 0, "temp_max": 0, "desligar_apos_h": 0, "aviso_ligado_h": 0, "aviso_fora_expediente": False,
          "expediente": {"inicio": "08:00", "fim": "18:00", "dias": [1, 2, 3, 4, 5]}, "arquivar_notif_dias": 0}


def cfg() -> dict:
    c = {**PADRAO, **(db.cfg(CHAVE) or {})}
    c["expediente"] = {**PADRAO["expediente"], **(c.get("expediente") or {})}
    return c


def salvar(d: dict) -> dict:
    c = cfg()
    for k in PADRAO:
        if k in d and d[k] is not None:
            c[k] = d[k]
    if c["temp_min"] and c["temp_max"] and c["temp_min"] > c["temp_max"]:
        raise ValueError("A temperatura mínima não pode ser maior que a máxima.")
    db.set_cfg(CHAVE, c)
    return c


def checar_temperatura(a: dict, novo: dict) -> str | None:
    """Mensagem de recusa se a temperatura pedida estiver fora da política (None = passa)."""
    if not novo.get("ligado"):
        return None
    c = cfg()
    t = novo.get("temperatura")
    if t is None:
        return None
    if c["temp_min"] and t < c["temp_min"]:
        return (f"A política do escritório não deixa ligar abaixo de {c['temp_min']}° (pedido: {t}°). "
                "Quem muda é o dono ou um administrador em Configurações → Geral.")
    if c["temp_max"] and t > c["temp_max"]:
        return (f"A política do escritório não deixa ligar acima de {c['temp_max']}° (pedido: {t}°). "
                "Quem muda é o dono ou um administrador em Configurações → Geral.")
    return None


def _no_expediente(c: dict, agora: datetime.datetime) -> bool:
    e = c["expediente"]
    dia = agora.isoweekday() % 7   # 0 = domingo … 6 = sábado
    if dia not in (e.get("dias") or []):
        return False
    hm = agora.strftime("%H:%M")
    return (e.get("inicio") or "00:00") <= hm < (e.get("fim") or "23:59")


def ciclo() -> dict:
    """Roda no agente principal: proteções e limpeza. Nunca derruba o laço."""
    from . import notificacoes
    c = cfg()
    agora_ts = db.agora()
    agora = datetime.datetime.now(BRT)
    feito = {"desligados": 0, "avisos": 0, "arquivadas": 0}
    ligados = db.consultar("SELECT a.id, a.nome, a.ligado_desde, p.nome AS sala FROM aparelhos a LEFT JOIN projetos p ON p.id = a.projeto_id "
                           "WHERE a.ligado = 1 AND a.ligado_desde IS NOT NULL")
    for a in ligados:
        horas = (agora_ts - int(a["ligado_desde"])) / 3600
        if c["desligar_apos_h"] and horas >= c["desligar_apos_h"]:
            try:
                from . import clima
                clima.aplicar(a["id"], "sistema:geral", ligado=False)
                feito["desligados"] += 1
                notificacoes.notificar(f"geral_desligou:{a['id']}:{a['ligado_desde']}", "alerta", "media", f"{a['nome']} desligado sozinho",
                                       f"Estava ligado havia {horas:.1f} h. Regra de Configurações → Geral: desligar depois de {c['desligar_apos_h']} h.", f"/aparelhos/{a['id']}")
            except Exception as e:  # noqa: BLE001
                db.registrar("sistema", f"Não deu para desligar {a['nome']} pela regra geral", ok=False, aparelho_id=a["id"], detalhe=str(e)[:300])
            continue
        if c["aviso_ligado_h"] and horas >= c["aviso_ligado_h"]:
            notificacoes.notificar(f"geral_ligado:{a['id']}:{a['ligado_desde']}", "alerta", "baixa", f"{a['nome']} ligado há {int(horas)} h",
                                   f"{a['sala'] or 'Sem sala'}. Aviso de Configurações → Geral (mais de {c['aviso_ligado_h']} h).", f"/aparelhos/{a['id']}")
            feito["avisos"] += 1
        if c["aviso_fora_expediente"] and not _no_expediente(c, agora):
            notificacoes.notificar(f"geral_fora:{a['id']}:{agora.date().isoformat()}", "alerta", "baixa", f"{a['nome']} ligado fora do expediente",
                                   f"{a['sala'] or 'Sem sala'}. Expediente: {c['expediente']['inicio']} às {c['expediente']['fim']}.", f"/aparelhos/{a['id']}")
            feito["avisos"] += 1
    if c["arquivar_notif_dias"]:
        r = db.consultar("UPDATE notificacoes SET arquivada = true WHERE lida AND NOT arquivada AND atualizado_em < ? RETURNING id",
                         (agora_ts - int(c["arquivar_notif_dias"]) * 86400,))
        feito["arquivadas"] = len(r)
    db.set_cfg("geral_ultimo", {"em": agora_ts, **feito})
    return feito


SEGURAS_EXPORTAR = ("modo_envio", "nome_casa", "tarifa_kwh", "geral", "agenda_regras", "zonas", "zonas_testadas", "white_label", "mapa", "mapa_modelos",
                    "mapa_veiculos", "musica_rotinas", "backup_agenda", "avatares_ordem")


def exportar() -> dict:
    """Configurações sem segredo (nada de CHAVES_SENSIVEIS), para guardar ou comparar."""
    saida = {}
    for k in SEGURAS_EXPORTAR:
        if k in db.CHAVES_SENSIVEIS:
            continue
        v = db.cfg(k)
        if v is not None:
            saida[k] = v
    return {"gerado_em": db.agora(), "versao": json.loads((__import__("pathlib").Path(__file__).parent / "novidades.json").read_text("utf-8"))["versoes"][0]["versao"],
            "config": saida}
