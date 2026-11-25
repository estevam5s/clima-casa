"""Vários computadores com o agente (ex.: o Mac no expediente e um PC Windows que fica no escritório).

Só um é o PRINCIPAL: executa a fila de comandos, mantém a Alexa (Sinric) conectada e roda agenda, automações e
rotinas de música. Os outros ficam de RESERVA e assumem sozinhos quando o principal some por mais de 45 s
(Mac fechado e levado para casa, PC desligado). Tudo mora no Supabase, então trocar de computador não perde nada.

- O posto de principal é um "aluguel" na tabela config (chave agente_lider), renovado a cada 15 s com um UPDATE
  condicional (só renova quem já é o dono ou quando o aluguel venceu): dois agentes nunca ficam principais juntos.
- Cada computador se anuncia em config agente_maquina:<id> (nome, sistema, papel, visto).
- "Preferido" (config agente_preferido): se estiver online, enxergar os transmissores e não for o principal, o principal cede.
- Quem não enxerga os transmissores não manda: cada computador anuncia quantos transmissores responde na rede dele
  (ve_transmissores). O principal "cego" por 3 batidas cede o posto se outro online enxerga; a reserva cega não tenta
  assumir. Assim o Mac levado para casa passa o comando ao PC do escritório, e retoma quando volta (se for o preferido).
- Ao perder o posto, o processo sai (código 3) e o serviço do sistema (launchd, Agendador do Windows, systemd)
  o reinicia já como reserva.
"""
import json
import logging
import glob
import os
import platform
import socket
import threading
import time
import uuid

from . import db

log = logging.getLogger("clima.coordenador")
ALUGUEL = 45      # segundos sem renovar até outro computador assumir
BATIDA = 15       # renova o aluguel 3 vezes dentro dos 45 s (era 10: cada batida são várias consultas ao banco)


def maquina_id() -> str:
    if os.environ.get("CLIMA_MAQUINA_ID"):
        return os.environ["CLIMA_MAQUINA_ID"][:40]
    arq = db.DADOS / "maquina.id"
    try:
        if arq.exists():
            return arq.read_text().strip()[:40]
        arq.parent.mkdir(parents=True, exist_ok=True)
        novo = f"{socket.gethostname().split('.')[0][:20]}-{uuid.uuid4().hex[:8]}".lower()
        arq.write_text(novo)
        return novo
    except OSError:
        return f"{socket.gethostname()[:20]}-sem-disco".lower()


MEU_ID = None


def _eu() -> str:
    global MEU_ID
    if MEU_ID is None:
        MEU_ID = maquina_id()
    return MEU_ID


_INICIO = time.time()


def _ler(caminho: str) -> str:
    try:
        with open(caminho, encoding="utf-8", errors="ignore") as f:
            return f.read().strip().strip("\x00")
    except OSError:
        return ""


_SUBTENSAO_EM: int | None = None


def saude() -> dict:
    """Como está este computador: modelo (Raspberry Pi informa), IP na rede local, temperatura do processador, memória,
    disco e carga. Só leitura do próprio sistema; o que não der para saber fica None (a tela mostra "—")."""
    import shutil
    d: dict = {"arquitetura": platform.machine(), "modelo": _ler("/proc/device-tree/model") or None, "ip": None,
               "temperatura": None, "memoria_total_mb": None, "memoria_livre_mb": None, "disco_livre_gb": None,
               "carga": None, "ligado_ha_s": int(time.time() - _INICIO)}
    try:   # IP da rede local (rota até a internet; nada é enviado)
        s_ = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s_.settimeout(0.5); s_.connect(("1.1.1.1", 80)); d["ip"] = s_.getsockname()[0]; s_.close()
    except OSError:
        pass
    t = _ler("/sys/class/thermal/thermal_zone0/temp")
    if t.isdigit():
        d["temperatura"] = round(int(t) / 1000, 1)
    mem = _ler("/proc/meminfo")
    if mem:
        kv = {l.split(":")[0]: int(l.split()[1]) for l in mem.splitlines() if len(l.split()) >= 2 and l.split()[1].isdigit()}
        d["memoria_total_mb"] = kv.get("MemTotal", 0) // 1024 or None
        d["memoria_livre_mb"] = kv.get("MemAvailable", 0) // 1024 or None
    try:
        d["disco_livre_gb"] = round(shutil.disk_usage(os.path.dirname(os.path.abspath(__file__))).free / 1e9, 1)
    except OSError:
        pass
    if hasattr(os, "getloadavg"):
        try:
            d["carga"] = round(os.getloadavg()[0], 2)
        except OSError:
            pass
    # por onde sai para a internet: cabo (eth/en) ou Wi-Fi (wl), pela rota padrão (Linux)
    for linha in (_ler("/proc/net/route") or "").splitlines()[1:]:
        c = linha.split()
        if len(c) > 2 and c[1] == "00000000":
            d["rede"] = "wifi" if c[0].startswith("wl") else "cabo" if c[0].startswith(("eth", "en")) else c[0]
            break
    # Raspberry Pi: sensor de tensão (rpi_volt). Fonte fraca agora e a última vez que aconteceu (desde que o agente ligou)
    global _SUBTENSAO_EM
    for h in sorted(glob.glob("/sys/class/hwmon/hwmon*")):
        if _ler(f"{h}/name") == "rpi_volt":
            agora_baixa = _ler(f"{h}/in0_lcrit_alarm") == "1"
            if agora_baixa:
                _SUBTENSAO_EM = int(time.time())
            d["subtensao"] = agora_baixa
            d["subtensao_em"] = _SUBTENSAO_EM
            break
    return d


def ordem_pendente() -> dict | None:
    """Pedido feito pelo painel para ESTE computador (ex.: reiniciar o agente), mais novo que o processo atual."""
    o = db.cfg(f"agente_ordem:{_eu()}")
    if o and int(o.get("em") or 0) > _INICIO:
        return o
    return None


def cumprir_ordens(papel: str):
    o = ordem_pendente()
    if not o:
        return
    db.set_cfg(f"agente_ordem:{_eu()}", None)
    if o.get("acao") == "reiniciar":
        db.registrar("agente", f"{socket.gethostname().split('.')[0]} reiniciando o agente a pedido do painel", detalhe=f"por {o.get('por') or '?'}")
        if papel == "principal":   # libera o posto na hora para um reserva assumir (ou este mesmo, ao voltar)
            db.executar("UPDATE config SET valor = ? WHERE chave = 'agente_lider'", (json.dumps({"id": "", "visto": 0}),))
        log.info("reiniciando a pedido do painel")
        os._exit(3)
    if o.get("acao") == "atualizar":
        from . import atualizar_agente
        try:
            r = atualizar_agente.aplicar(f"pedido do painel por {o.get('por') or '?'}")
        except Exception as e:  # noqa: BLE001
            db.registrar("agente", f"{socket.gethostname().split('.')[0]}: atualização falhou", ok=False, detalhe=str(e)[:300])
            db.set_cfg(f"agente_atualizar_falhou:{_eu()}", {"versao": atualizar_agente.versao_publicada(), "erro": str(e)[:300], "em": int(time.time())})
            return
        if r.get("mudou"):
            atualizar_agente._reiniciar(papel)
        else:
            db.registrar("agente", f"{socket.gethostname().split('.')[0]} já estava na versão mais nova ({r.get('versao')})")


def info(papel: str) -> dict:
    sistema = {"Darwin": "macOS", "Windows": "Windows", "Linux": "Linux"}.get(platform.system(), platform.system())
    versao = platform.mac_ver()[0] if sistema == "macOS" else platform.release()
    if sistema == "Linux":   # nome da distribuição (Raspberry Pi OS, Ubuntu, Fedora…) diz mais que a versão do kernel
        rel = {k: v.strip('"') for k, v in (l.split("=", 1) for l in (_ler("/etc/os-release") or "").splitlines() if "=" in l)}
        if rel.get("PRETTY_NAME"):
            sistema, versao = f"Linux · {rel['PRETTY_NAME']}", ""
    if os.path.exists("/.dockerenv"):
        versao = f"{versao} (Docker)".strip()
    from . import atualizar_agente
    return {"id": _eu(), "nome": socket.gethostname().split(".")[0], "sistema": f"{sistema} {versao}".strip(),
            "python": platform.python_version(), "papel": papel, "visto": int(time.time()),
            "versao": atualizar_agente.versao_local(), "docker": atualizar_agente.em_docker()}


def ve_transmissores() -> tuple[int | None, int]:
    """(quantos respondem daqui, total cadastrado com IP). None quando não há transmissor cadastrado (regra não se aplica)."""
    from concurrent.futures import ThreadPoolExecutor
    from . import transmissor
    try:
        ips = [h["ip"] for h in db.consultar("SELECT ip FROM hubs WHERE ip IS NOT NULL AND ip <> ''")]
    except Exception:  # noqa: BLE001
        return None, 0
    if not ips:
        return None, 0
    with ThreadPoolExecutor(max_workers=min(8, len(ips))) as ex:
        vistos = sum(1 for ok in ex.map(lambda ip: transmissor.porta_aberta(ip, timeout=1.5), ips) if ok)
    return vistos, len(ips)


_visao: dict = {"ve": None, "total": 0, "em": 0.0}


def anunciar(papel: str):
    try:
        # sonda no máximo a cada 30 s: o SRW-004 aceita poucas conexões e não pode atrapalhar um comando em andamento
        if time.time() - _visao["em"] > 30:
            ve, total = ve_transmissores()
            _visao.update({"ve": ve, "total": total, "em": time.time()})
        ve, total = _visao["ve"], _visao["total"]
        db.set_cfg(f"agente_maquina:{_eu()}", {**info(papel), "ve_transmissores": ve, "total_transmissores": total, "saude": saude()})
        cumprir_ordens(papel)
        try:
            from .transmissor import atender_qualquer
            atender_qualquer()
        except Exception as e:  # noqa: BLE001
            log.warning("pedido para qualquer agente falhou: %s", e)
        from . import atualizar_agente
        atualizar_agente.conferir(papel)
    except Exception as e:  # noqa: BLE001
        log.warning("não deu para anunciar o computador: %s", e)


def tentar_posto() -> bool:
    """Pega ou renova o posto de principal. True se este computador é o principal agora."""
    agora = int(time.time())
    valor = json.dumps({"id": _eu(), "visto": agora, "nome": socket.gethostname().split(".")[0]})
    linhas = db.consultar(
        "INSERT INTO config (chave, valor) VALUES ('agente_lider', ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor "
        "WHERE (config.valor::jsonb->>'id') = ? OR COALESCE((config.valor::jsonb->>'visto')::bigint, 0) < ? RETURNING chave",
        (valor, _eu(), agora - ALUGUEL))
    return bool(linhas)


def lider() -> dict | None:
    return db.cfg("agente_lider")


def preferido() -> str | None:
    return db.cfg("agente_preferido")


def maquinas() -> list[dict]:
    agora = int(time.time())
    out = []
    for r in db.consultar("SELECT chave, valor FROM config WHERE chave LIKE ?", ("agente_maquina:%",)):
        try:
            m = json.loads(r["valor"])
        except ValueError:
            continue
        m["online"] = agora - int(m.get("visto") or 0) < ALUGUEL
        out.append(m)
    lid = lider() or {}
    for m in out:
        m["principal"] = m["id"] == lid.get("id") and agora - int(lid.get("visto") or 0) < ALUGUEL
    return sorted(out, key=lambda m: (not m["principal"], not m["online"], m.get("nome", "")))


def _enxerga(m: dict) -> bool:
    """Sem a informação (agente antigo ou sem transmissor cadastrado) conta como enxergando: não muda o comportamento de antes."""
    return m.get("ve_transmissores") is None or int(m.get("ve_transmissores") or 0) > 0


def _preferido_online_e_outro() -> bool:
    p = preferido()
    if not p or p == _eu():
        return False
    m = db.cfg(f"agente_maquina:{p}") or {}
    return int(time.time()) - int(m.get("visto") or 0) < ALUGUEL and _enxerga(m)


def _outro_enxerga() -> bool:
    """Algum outro computador online enxerga os transmissores?"""
    agora = int(time.time())
    for m in maquinas():
        if m.get("id") != _eu() and agora - int(m.get("visto") or 0) < ALUGUEL and int(m.get("ve_transmissores") or 0) > 0:
            return True
    return False


def _estou_cego() -> bool:
    return _visao["ve"] == 0


# Cão de guarda: se o laço de coordenação parar de dar a volta (ex.: travado numa conexão morta), o processo sai e o
# serviço (launchd, tarefa do Windows, systemd) liga de novo. Sem isso o agente ficava horas "vivo" sem fazer nada.
_ultimo_ciclo = time.time()
LIMITE_PARADO = 180


def _girou():
    global _ultimo_ciclo
    _ultimo_ciclo = time.time()


_cao_ligado = False


def iniciar_cao_de_guarda():
    global _cao_ligado
    if _cao_ligado:
        return
    _cao_ligado = True
    _girou()

    def vigia():
        while True:
            time.sleep(30)
            parado = time.time() - _ultimo_ciclo
            if parado > LIMITE_PARADO:
                log.error("coordenação parada há %d s; reiniciando o agente", parado)
                os._exit(3)
    threading.Thread(target=vigia, daemon=True, name="cao-de-guarda").start()


def esperar_posto():
    """Bloqueia até este computador virar o principal (fica de reserva, se anunciando)."""
    avisou = False
    iniciar_cao_de_guarda()
    while True:
        _girou()
        try:
            if not _preferido_online_e_outro() and not (_estou_cego() and _outro_enxerga()) and tentar_posto():
                anunciar("principal")
                db.registrar("agente", f"{socket.gethostname().split('.')[0]} assumiu como agente principal", detalhe=info("principal")["sistema"])
                log.info("este computador é o agente principal")
                return
            anunciar("reserva")
            if not avisou:
                log.info("outro computador é o principal; este fica de reserva")
                avisou = True
        except Exception as e:  # noqa: BLE001  (sem internet: tenta de novo)
            log.warning("coordenação: %s", e)
        time.sleep(BATIDA)


def vigiar():
    """Renova o posto; se perder (ou se o preferido voltar), sai para o serviço reiniciar como reserva."""
    def laco():
        falhas = 0
        cego = 0
        while True:
            time.sleep(BATIDA)
            _girou()
            try:
                cego = cego + 1 if _estou_cego() else 0
                if cego >= 4 and _outro_enxerga():   # ~40 s cego (sondagem a cada 30 s)
                    db.executar("UPDATE config SET valor = ? WHERE chave = 'agente_lider'", (json.dumps({"id": "", "visto": 0}),))
                    db.registrar("agente", f"{socket.gethostname().split('.')[0]} não enxerga os transmissores e passou o posto de principal",
                                 detalhe="outro computador está na rede do escritório")
                    log.info("sem visão dos transmissores; cedendo o posto")
                    os._exit(3)
                if _preferido_online_e_outro():
                    db.executar("UPDATE config SET valor = ? WHERE chave = 'agente_lider'", (json.dumps({"id": "", "visto": 0}),))
                    db.registrar("agente", f"{socket.gethostname().split('.')[0]} passou o posto de principal para o computador preferido")
                    log.info("cedendo o posto ao computador preferido")
                    os._exit(3)
                if not tentar_posto():
                    db.registrar("agente", f"{socket.gethostname().split('.')[0]} perdeu o posto de principal e virou reserva")
                    log.warning("outro computador assumiu; saindo para reiniciar como reserva")
                    os._exit(3)
                anunciar("principal")
                falhas = 0
            except Exception as e:  # noqa: BLE001  (internet caiu: segura o posto até o aluguel vencer)
                falhas += 1
                log.warning("renovação do posto falhou (%s): %s", falhas, e)
    threading.Thread(target=laco, daemon=True, name="coordenador").start()
