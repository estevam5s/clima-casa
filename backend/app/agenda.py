"""Executa os agendamentos (verifica a cada 20 s). Dias: 0 = domingo … 6 = sábado."""
import asyncio
import datetime
import json
import logging

from . import automacao, clima, db, feriados, transmissor

log = logging.getLogger("clima.agenda")


def _rodar_pendentes(agora: datetime.datetime):
    hoje = (agora.weekday() + 1) % 7
    hhmm = agora.strftime("%H:%M")
    marca = agora.strftime("%Y-%m-%d ") + hhmm
    pendentes = db.consultar("SELECT * FROM agendamentos WHERE ativo = 1 AND hora = ?", (hhmm,))
    motivo = feriados.motivo_para_nao_rodar(agora.date()) if pendentes else None
    for ag in pendentes:
        dias = {int(d) for d in ag["dias"].split(",") if d != ""}
        if hoje not in dias or ag["ultima_exec"] == marca:
            continue
        db.executar("UPDATE agendamentos SET ultima_exec = ? WHERE id = ?", (marca, ag["id"]))
        if motivo:   # feriado ou férias: não manda o sinal, mas registra por que não ligou
            db.registrar(f"agenda:{ag['nome']}", "Agendamento não rodou", aparelho_id=ag["aparelho_id"], detalhe=motivo)
            continue
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
                from . import newsletter
                await asyncio.to_thread(newsletter.ciclo)   # campanhas agendadas da newsletter
            except Exception as e:  # noqa: BLE001
                log.warning("newsletter: %s", e)
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
            if ciclo % 180 == 90:   # varredura de segurança semanal (os 1.313 testes); avisa se aparecer falha
                try:
                    from . import testes_seguranca
                    await asyncio.to_thread(testes_seguranca.varredura_semanal)
                except Exception as e:  # noqa: BLE001
                    log.warning("varredura semanal: %s", e)
            if ciclo % 3 == 0:   # lembretes do Telegram (/lembrar_30min…): a cada ~1 min
                try:
                    from . import telegram_cmds_extra
                    await asyncio.to_thread(telegram_cmds_extra.lembretes_ciclo)
                except Exception as e:  # noqa: BLE001
                    log.warning("lembretes do Telegram: %s", e)
            if ciclo % 15 == 0:   # backup agendado (Backup → Agendar), a cada ~5 min confere se venceu
                try:
                    from . import backup_sistema
                    await asyncio.to_thread(backup_sistema.ciclo)
                    await asyncio.to_thread(backup_sistema.copia_local)   # cópia fora da nuvem (se ligada; no máximo a cada 30 min)
                except Exception as e:  # noqa: BLE001
                    log.warning("backup agendado: %s", e)
            if ciclo % 15 == 0:   # teste de velocidade agendado (Rede → Agendar), a cada ~5 min confere se venceu
                try:
                    from . import rede
                    await asyncio.to_thread(rede.ciclo)
                except Exception as e:  # noqa: BLE001
                    log.warning("teste de rede agendado: %s", e)
            if ciclo % 180 == 0:   # selo de integridade dos registros (SHA-256 por dia) a cada ~1 h: a cadeia fica sempre em dia
                try:
                    from . import conformidade
                    await asyncio.to_thread(conformidade.selar)
                except Exception as e:  # noqa: BLE001
                    log.warning("selo de integridade: %s", e)
                try:   # procura bugs no próprio sistema (falhas repetidas, rotas sem regra, agente parado…) de hora em hora
                    from . import bugs
                    await asyncio.to_thread(bugs.varrer)
                except Exception as e:  # noqa: BLE001
                    log.warning("varredura de bugs: %s", e)
        except Exception as e:  # noqa: BLE001
            log.exception("erro no laço da agenda: %s", e)
        ciclo += 1
        await asyncio.sleep(20)
