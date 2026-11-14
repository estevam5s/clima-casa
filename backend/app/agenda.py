"""Executa os agendamentos (verifica a cada 20 s). Dias: 0 = domingo … 6 = sábado."""
import asyncio
import datetime
import json
import logging

from . import clima, db, transmissor

log = logging.getLogger("clima.agenda")


def _rodar_pendentes(agora: datetime.datetime):
    hoje = (agora.weekday() + 1) % 7
    hhmm = agora.strftime("%H:%M")
    marca = agora.strftime("%Y-%m-%d ") + hhmm
    for ag in db.consultar("SELECT * FROM agendamentos WHERE ativo = 1 AND hora = ?", (hhmm,)):
        dias = {int(d) for d in ag["dias"].split(",") if d != ""}
        if hoje not in dias or ag["ultima_exec"] == marca:
            continue
        db.executar("UPDATE agendamentos SET ultima_exec = ? WHERE id = ?", (marca, ag["id"]))
        acao = json.loads(ag["acao"])
        try:
            clima.aplicar(ag["aparelho_id"], f"agenda:{ag['nome']}", **acao)
        except Exception as e:  # noqa: BLE001  (o erro já fica no registro de atividade)
            log.warning("agendamento %s falhou: %s", ag["id"], e)


async def laco():
    ciclo = 0
    while True:
        try:
            await asyncio.to_thread(_rodar_pendentes, datetime.datetime.now())
            if ciclo % 3 == 0:  # status online dos transmissores a cada ~1 min
                await asyncio.to_thread(transmissor.atualizar_online)
        except Exception as e:  # noqa: BLE001
            log.exception("erro no laço da agenda: %s", e)
        ciclo += 1
        await asyncio.sleep(20)
