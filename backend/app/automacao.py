"""Automações: gatilho → condições → ações, e temporizadores ("desligar daqui a X minutos").

Gatilhos (campo `gatilho.tipo`):
  ligou       aparelho (ou qualquer um) foi ligado; filtro opcional de origem (alexa, painel, agenda, cena, sinric)
  desligou    idem, ao desligar
  ligado_ha   aparelho está ligado há N minutos (dispara uma vez por vez que é ligado)
  horario     todo dia no horário HH:MM (respeitando os dias das condições)
Condições: dias (0=domingo…6), janela de horário das/ate (pode virar a meia-noite).
Ações: aparelho (estado), cena, desligar_apos (cria temporizador).
"""
import datetime
import json
import logging
import threading

from . import db

log = logging.getLogger("clima.automacao")
FUSO = datetime.timezone(datetime.timedelta(hours=-3))  # America/Sao_Paulo (sem horário de verão)


def _agora():
    return datetime.datetime.now(FUSO)


def _minutos(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def condicoes_ok(cond: dict, quando: datetime.datetime | None = None) -> bool:
    quando = quando or _agora()
    dias = cond.get("dias")
    if dias and (quando.weekday() + 1) % 7 not in dias:
        return False
    das, ate = cond.get("das"), cond.get("ate")
    if das and ate:
        m, a, b = quando.hour * 60 + quando.minute, _minutos(das), _minutos(ate)
        dentro = a <= m <= b if a <= b else (m >= a or m <= b)
        if not dentro:
            return False
    return True


def _origem_base(origem: str) -> str:
    return origem.split(":", 1)[0]


def executar_acoes(auto: dict, aparelho_evento: int | None = None):
    from . import clima
    origem = f"automacao:{auto['nome']}"
    for acao in auto["acoes"]:
        try:
            tipo = acao.get("tipo")
            if tipo == "aparelho":
                alvo = acao.get("aparelho_id") or aparelho_evento
                estado = {k: acao[k] for k in ("ligado", "modo", "temperatura", "ventilador") if acao.get(k) is not None}
                clima.aplicar(alvo, origem, **estado)
            elif tipo == "cena":
                cena = db.um("SELECT * FROM cenas WHERE id = ?", (acao["cena_id"],))
                for a in (cena or {}).get("acoes", []):
                    clima.aplicar(a["aparelho_id"], origem, ligado=a["ligado"], modo=a.get("modo"),
                                  temperatura=a.get("temperatura"), ventilador=a.get("ventilador"))
            elif tipo == "desligar_apos":
                alvo = acao.get("aparelho_id") or aparelho_evento
                criar_temporizador(alvo, int(acao.get("minutos", 60)), {"ligado": False}, origem)
        except Exception as e:  # noqa: BLE001  (cada ação falha sozinha; o erro já vai para a atividade)
            log.warning("automação %s: ação %s falhou: %s", auto["id"], acao, e)
    db.executar("UPDATE automacoes SET disparos = disparos + 1, ultimo_disparo = ? WHERE id = ?", (db.agora(), auto["id"]))
    db.registrar("automacao", f"Automação executada: {auto['nome']}", aparelho_id=aparelho_evento)


def _ativas(tipo: str) -> list[dict]:
    return db.consultar("SELECT * FROM automacoes WHERE ativo = 1 AND gatilho->>'tipo' = ?", (tipo,))


def processar_evento(aparelho_id: int, origem: str, ligado: bool):
    """Chamado quando um aparelho muda de estado. Ignora o que as próprias automações fizeram (evita laço)."""
    if origem.startswith("automacao"):
        return
    tipo = "ligou" if ligado else "desligou"
    try:
        from . import musica
        musica.evento_ar(aparelho_id, ligado)   # rotinas de música "quando o ar ligar/desligar"
    except Exception as e:  # noqa: BLE001
        log.warning("rotinas de música: %s", e)
    for auto in _ativas(tipo):
        g = auto["gatilho"]
        if g.get("aparelho_id") and int(g["aparelho_id"]) != aparelho_id:
            continue
        if g.get("origem") and g["origem"] != "qualquer" and _origem_base(origem) != g["origem"]:
            continue
        if condicoes_ok(auto["condicoes"]):
            executar_acoes(auto, aparelho_id)


def evento(aparelho_id: int, origem: str, ligado: bool):
    """Dispara a avaliação sem atrasar quem mudou o aparelho (Alexa, painel…)."""
    if origem.startswith("automacao"):
        return
    from . import transmissor
    if transmissor.PAPEL == "agente":
        threading.Thread(target=processar_evento, args=(aparelho_id, origem, ligado), daemon=True).start()
    else:  # na Vercel a função termina logo após responder: o agente avalia pela fila
        transmissor.enfileirar("evento", None, {"aparelho_id": aparelho_id, "origem": origem, "ligado": ligado})


def criar_temporizador(aparelho_id: int, minutos: int, acao: dict, origem: str = "painel") -> int:
    minutos = max(1, min(minutos, 24 * 60))
    db.executar("DELETE FROM temporizadores WHERE aparelho_id = ?", (aparelho_id,))  # um por aparelho
    tid = db.executar("INSERT INTO temporizadores (aparelho_id, acao, executar_em, origem, criado_em) VALUES (?, CAST(? AS jsonb), ?, ?, ?)",
                      (aparelho_id, json.dumps(acao), db.agora() + minutos * 60, origem, db.agora()))
    db.registrar(origem.split(":")[0] if origem.startswith(("painel", "alexa", "sinric")) else origem,
                 f"Temporizador: {'desligar' if acao.get('ligado') is False else 'ajustar'} em {minutos} min", aparelho_id=aparelho_id)
    return tid


def ciclo(agora_dt: datetime.datetime | None = None):
    """Roda a cada ~20 s no agente: horários, 'ligado há N min' e temporizadores vencidos."""
    from . import clima
    agora_dt = agora_dt or _agora()
    agora = db.agora()
    hhmm = agora_dt.strftime("%H:%M")
    for auto in _ativas("horario"):
        if auto["gatilho"].get("hora") != hhmm or (auto["ultimo_disparo"] or 0) > agora - 90:
            continue
        if condicoes_ok(auto["condicoes"], agora_dt):
            executar_acoes(auto, auto["gatilho"].get("aparelho_id"))
    for auto in _ativas("ligado_ha"):
        g = auto["gatilho"]
        minutos = int(g.get("minutos", 60))
        filtro = "AND id = ?" if g.get("aparelho_id") else ""
        params = (agora - minutos * 60, int(g["aparelho_id"])) if g.get("aparelho_id") else (agora - minutos * 60,)
        for a in db.consultar(f"SELECT id, ligado_desde FROM aparelhos WHERE ligado = 1 AND ligado_desde <= ? {filtro}", params):
            if (auto["ultimo_disparo"] or 0) >= a["ligado_desde"] + minutos * 60:
                continue  # já disparou nesta vez em que o ar foi ligado
            if condicoes_ok(auto["condicoes"], agora_dt):
                executar_acoes(auto, a["id"])
    for t in db.consultar("SELECT * FROM temporizadores WHERE executar_em <= ?", (agora,)):
        db.executar("DELETE FROM temporizadores WHERE id = ?", (t["id"],))
        try:
            clima.aplicar(t["aparelho_id"], f"automacao:temporizador", **t["acao"])
        except Exception as e:  # noqa: BLE001
            log.warning("temporizador %s falhou: %s", t["id"], e)
