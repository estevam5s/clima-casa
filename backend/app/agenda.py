"""Executa os agendamentos (verifica a cada 20 s). Dias: 0 = domingo … 6 = sábado."""
import asyncio
import datetime
import json
import logging

from . import automacao, clima, db, transmissor

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
            await asyncio.to_thread(automacao.ciclo)
            try:
                from . import musica
                await asyncio.to_thread(musica.ciclo)   # rotinas de música por horário
            except Exception as e:  # noqa: BLE001
                log.warning("rotinas de música: %s", e)
            try:
                from . import vercel_ataque
                await asyncio.to_thread(vercel_ataque.sincronizar)   # escudo anti-DDoS → modo de ataque da Vercel
            except Exception as e:  # noqa: BLE001
                log.warning("escudo/Vercel: %s", e)
            if ciclo % 3 == 0:  # status online dos transmissores a cada ~1 min
                await asyncio.to_thread(transmissor.atualizar_online)
            try:   # cafeteira, persianas e fechadura: estado, agendas e regras de segurança
                from . import dispositivos
                await asyncio.to_thread(dispositivos.ciclo, ciclo)
            except Exception as e:  # noqa: BLE001
                log.warning("aparelhos do escritório: %s", e)
            if ciclo % 180 == 0:   # selo de integridade dos registros (SHA-256 por dia) a cada ~1 h: a cadeia fica sempre em dia
                try:
                    from . import conformidade
                    await asyncio.to_thread(conformidade.selar)
                except Exception as e:  # noqa: BLE001
                    log.warning("selo de integridade: %s", e)
        except Exception as e:  # noqa: BLE001
            log.exception("erro no laço da agenda: %s", e)
        ciclo += 1
        await asyncio.sleep(20)
