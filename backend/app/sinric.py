"""Integração com o Sinric Pro (Alexa, Google Home e app Sinric).

- Na nuvem (Vercel) e no agente: API REST do Sinric (listar dispositivos, testar a conta).
- Só no agente do Mac: conexão WebSocket pelo SDK oficial. Cada aparelho com `sinric_device_id`
  vira um "Window AC Unit" que recebe ligar/desligar, modo, temperatura e ventilação, e o agente
  manda de volta o estado quando o ar muda pelo painel, pela agenda ou pela Alexa própria.

Credenciais (tabela config, chave "sinric"): api_key (REST), app_key e app_secret (WebSocket).
"""
import asyncio
import logging
import os
import threading
import time

import httpx

from . import db

log = logging.getLogger("clima.sinric")
API = "https://api.sinric.pro/api/v1"
MODO_PARA_SINRIC = {"frio": "COOL", "quente": "HEAT", "auto": "AUTO", "seco": "ECO", "ventilar": "AUTO"}
SINRIC_PARA_MODO = {"COOL": "frio", "HEAT": "quente", "AUTO": "auto", "ECO": "seco"}
VENT_PARA_NIVEL = {"auto": 0, "baixa": 1, "media": 2, "alta": 3}
NIVEL_PARA_VENT = {0: "auto", 1: "baixa", 2: "media", 3: "alta"}

_estado = {"conectado": False, "dispositivos": [], "erro": None, "desde": None}
_loop: asyncio.AbstractEventLoop | None = None
_sdk = None


def config() -> dict:
    c = db.cfg("sinric") or {}
    if not c and db.ENV.get("SINRIC_APP_KEY"):  # primeira vez: vem do .env do agente
        c = {"api_key": db.ENV.get("SINRIC_API_KEY", ""), "app_key": db.ENV.get("SINRIC_APP_KEY", ""),
             "app_secret": db.ENV.get("SINRIC_APP_SECRET", ""), "ativo": True}
        db.set_cfg("sinric", c)
    return c


def config_publica() -> dict:
    c = config()
    mascara = lambda v: (v[:6] + "…" + v[-4:]) if v and len(v) > 12 else ("…" if v else "")
    return {"ativo": bool(c.get("ativo")), "automatico": c.get("automatico", True), "api_key": mascara(c.get("api_key", "")),
            "app_key": mascara(c.get("app_key", "")), "tem_secret": bool(c.get("app_secret")),
            "agente": db.cfg("sinric_status") or {}}


# ---------------- REST ----------------
def _token(api_key: str) -> str:
    r = httpx.post(f"{API}/auth", headers={"x-sinric-api-key": api_key}, timeout=15)
    dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or not dados.get("accessToken"):
        raise RuntimeError(dados.get("message") or "Chave de API do Sinric Pro recusada.")
    return dados["accessToken"]


def listar_dispositivos(api_key: str | None = None) -> list[dict]:
    api_key = api_key or config().get("api_key")
    if not api_key:
        raise RuntimeError("Informe a chave de API do Sinric Pro.")
    r = httpx.get(f"{API}/devices", headers={"Authorization": f"Bearer {_token(api_key)}"}, timeout=15)
    vinculos = {a["sinric_device_id"]: a for a in db.consultar(
        "SELECT id, nome, sinric_device_id FROM aparelhos WHERE sinric_device_id IS NOT NULL")}
    saida = []
    for d in r.json().get("devices", []):
        tipo = (d.get("product") or {}).get("code", "")
        saida.append({
            "id": d["id"], "nome": d.get("name"), "descricao": d.get("description", ""),
            "tipo": tipo.split(".")[-1], "ar_condicionado": tipo.endswith(("AC_UNIT", "THERMOSTAT")),
            "online": bool(d.get("isOnline")), "sala": (d.get("room") or {}).get("name", ""),
            "vinculado_a": ({"id": vinculos[d["id"]]["id"], "nome": vinculos[d["id"]]["nome"]}
                            if d["id"] in vinculos else None),
        })
    return saida


# ---------------- WebSocket (agente) ----------------
def _gravar_status():
    db.set_cfg("sinric_status", {**_estado, "atualizado_em": int(time.time())})


def _callbacks(dispositivo, aparelho_id: int):
    from . import clima

    async def rodar(**kw):
        try:
            await asyncio.to_thread(clima.aplicar, aparelho_id, "sinric", notificar_sinric=False, **kw)
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("Sinric → aparelho %s falhou: %s", aparelho_id, e)
            return False

    async def energia(ligado: bool):
        return await rodar(ligado=ligado)

    async def modo(m: str):
        if m == "OFF":
            return await rodar(ligado=False)
        return await rodar(ligado=True, modo=SINRIC_PARA_MODO.get(m, "auto"))

    async def temperatura(t: float):
        return await rodar(ligado=True, temperatura=round(t))

    async def ventilacao(valor: int, instancia: str = ""):
        return await rodar(ligado=True, ventilador=NIVEL_PARA_VENT.get(int(valor), "auto"))

    async def ajustar_vent(delta: int, instancia: str = ""):
        atual = VENT_PARA_NIVEL.get(clima.aparelho(aparelho_id)["ventilador"], 0)
        return await rodar(ligado=True, ventilador=NIVEL_PARA_VENT[max(0, min(3, atual + int(delta)))])

    dispositivo.on_power_state(energia)
    dispositivo.on_thermostat_mode(modo)
    dispositivo.on_target_temperature(temperatura)
    dispositivo.on_range_value(ventilacao)
    dispositivo.on_adjust_range_value(ajustar_vent)


async def _sessao(cfg: dict, vinculos: dict[str, int]):
    global _sdk
    from sinricpro import SinricPro, SinricProConfig
    from sinricpro.devices.sinric_pro_window_ac import SinricProWindowAC

    if os.environ.get("CLIMA_SINRIC_DEBUG"):  # diagnóstico: guarda a última mensagem crua recebida
        from sinricpro.core.signature import Signature
        _orig = Signature.validate

        def _validar(self, message):
            if isinstance(message, str):
                (db.DADOS / "sinric-ultima-msg.json").write_text(message)
            return _orig(self, message)
        Signature.validate = _validar
    SinricPro._instance = None  # o SDK é singleton; recriar a cada nova lista de dispositivos
    sp = SinricPro.get_instance()
    for dev_id, aparelho_id in vinculos.items():
        d = SinricProWindowAC(dev_id)
        _callbacks(d, aparelho_id)
        sp.add(d)

    def conectado():
        _estado.update(conectado=True, erro=None, desde=int(time.time()))
        _enviado.clear()   # sessão nova: o próximo estado de cada aparelho vai completo
        _gravar_status()
        db.registrar("sistema", f"Sinric Pro conectado ({len(vinculos)} aparelho(s))")

    def desconectado():
        _estado.update(conectado=False)
        _gravar_status()

    sp.on_connected(conectado)
    sp.on_disconnected(desconectado)
    await sp.begin(SinricProConfig(app_key=cfg["app_key"], app_secret=cfg["app_secret"],
                                   local_control=False, mdns=False))
    _sdk = sp
    return sp


async def _laco():
    atual: tuple = ()
    sp = None
    while True:
        try:
            cfg = config()
            vinculos = {r["sinric_device_id"]: r["id"] for r in db.consultar(
                "SELECT id, sinric_device_id FROM aparelhos WHERE sinric_device_id IS NOT NULL ORDER BY id")}
            desejado = (cfg.get("ativo"), cfg.get("app_key"), cfg.get("app_secret"), tuple(sorted(vinculos.items())))
            if desejado != atual:
                if sp:
                    await sp.stop()
                    sp = None
                _estado.update(conectado=False, dispositivos=list(vinculos), erro=None)
                if cfg.get("ativo") and cfg.get("app_key") and cfg.get("app_secret") and vinculos:
                    sp = await _sessao(cfg, vinculos)
                _gravar_status()
                atual = desejado
        except Exception as e:  # noqa: BLE001
            _estado.update(conectado=False, erro=str(e)[:200])
            _gravar_status()
            atual = ()
            log.warning("Sinric: %s", e)
        await asyncio.sleep(30)


def iniciar_no_agente():
    """Roda o cliente Sinric num event loop próprio, numa thread do agente."""
    global _loop
    _loop = asyncio.new_event_loop()
    threading.Thread(target=lambda: _loop.run_until_complete(_laco()), daemon=True, name="sinric").start()


# Eventos para o Sinric: o servidor limita o ritmo de eventos por aparelho (rajadas são descartadas e podem bloquear o
# aparelho por um tempo). Com zonas, um comando muda vários ares de uma vez. Então: cada aparelho tem UMA fila com só o
# último estado desejado; um envio por vez, só dos campos que mudaram, com INTERVALO entre eventos.
INTERVALO_EVENTO = 1.2
_pendente: dict[str, dict] = {}
_enviado: dict[str, dict] = {}
_enviando: set[str] = set()


def notificar_estado(aparelho: dict):
    """Avisa o Sinric (e a Alexa/Google) que o ar mudou por outro caminho. Só tem efeito no agente."""
    dev_id = aparelho.get("sinric_device_id")
    if not (dev_id and _loop and _sdk and _estado["conectado"]):
        return
    _pendente[dev_id] = {k: aparelho.get(k) for k in ("ligado", "modo", "temperatura", "ventilador")}
    if dev_id not in _enviando:
        _enviando.add(dev_id)
        asyncio.run_coroutine_threadsafe(_esvaziar(dev_id), _loop)


async def _esvaziar(dev_id: str):
    try:
        while dev_id in _pendente:
            alvo = _pendente.pop(dev_id)
            d = _sdk.get(dev_id) if _sdk else None
            if not d:
                return
            ja = _enviado.get(dev_id, {})
            eventos = []
            if ja.get("ligado") != bool(alvo["ligado"]):
                eventos.append(("ligado", bool(alvo["ligado"]), lambda v: d.send_power_state_event(v)))
            if alvo["ligado"]:
                if ja.get("modo") != alvo["modo"]:
                    eventos.append(("modo", alvo["modo"], lambda v: d.send_thermostat_mode_event(MODO_PARA_SINRIC.get(v, "AUTO"))))
                if ja.get("temperatura") != alvo["temperatura"]:
                    eventos.append(("temperatura", alvo["temperatura"], lambda v: d.send_target_temperature_event(float(v))))
                if ja.get("ventilador") != alvo["ventilador"]:
                    eventos.append(("ventilador", alvo["ventilador"], lambda v: d.send_range_value_event(VENT_PARA_NIVEL.get(v, 0))))
            for campo, valor, mandar in eventos:
                try:
                    await mandar(valor)
                    _enviado.setdefault(dev_id, {})[campo] = valor
                except Exception as e:  # noqa: BLE001  (Sinric fora ou limite: tenta de novo no próximo estado)
                    log.debug("evento Sinric não enviado (%s): %s", campo, e)
                await asyncio.sleep(INTERVALO_EVENTO)
    finally:
        _enviando.discard(dev_id)


# ---------------- automação: criar/apagar dispositivos e conectar Alexas ----------------
SKILL_ALEXA = "https://www.amazon.com.br/dp/B07ZT5VDT8"  # skill oficial "Sinric Pro"
PRODUTO_AC = "sinric.devices.types.AC_UNIT"


def _cabecalho():
    return {"Authorization": f"Bearer {_token(config()['api_key'])}"}


def _descobrir_ids(h) -> dict:
    """ID interno da credencial (accessKey), sala e produto AC. Guarda na config para não repetir."""
    c = config()
    if c.get("access_key_id") and c.get("room_id") and c.get("product_id"):
        return c
    prods = httpx.get(f"{API}/products", headers=h, timeout=15).json().get("products", [])
    c["product_id"] = next(p["id"] for p in prods if p.get("code") == PRODUTO_AC)
    salas = httpx.get(f"{API}/rooms", headers=h, timeout=15).json().get("rooms", [])
    if not salas:
        raise RuntimeError("Crie uma sala no portal do Sinric Pro primeiro.")
    c["room_id"] = salas[0]["id"]
    # a credencial é descoberta por um dispositivo já ligado ao agente com esta App Key
    for d in httpx.get(f"{API}/devices", headers=h, timeout=15).json().get("devices", []):
        if d["id"] in (_estado.get("dispositivos") or []) or db.um(
                "SELECT 1 FROM aparelhos WHERE sinric_device_id = ?", (d["id"],)):
            det = httpx.get(f"{API}/devices/{d['id']}", headers=h, timeout=15).json().get("device", {})
            if det.get("accessKey"):
                c["access_key_id"] = det["accessKey"]
                break
    if not c.get("access_key_id"):
        raise RuntimeError("Vincule pelo menos um dispositivo criado com esta App Key para o sistema aprender a credencial.")
    db.set_cfg("sinric", c)
    return c


def criar_dispositivo(aparelho: dict) -> str:
    h = _cabecalho()
    ids = _descobrir_ids(h)
    corpo = {"name": aparelho["nome"][:60],
             "description": f"Ar-condicionado por infravermelho via Clima Casa{(' · ' + aparelho['comodo']) if aparelho.get('comodo') else ''}"[:200],
             "productId": ids["product_id"], "roomId": ids["room_id"], "accessKeyId": ids["access_key_id"]}
    r = httpx.post(f"{API}/devices", headers=h, json=corpo, timeout=20)
    dados = r.json() if "json" in r.headers.get("content-type", "") else {}
    if not dados.get("success"):
        msg = dados.get("message") or f"HTTP {r.status_code}"
        if "limit" in msg.lower() or "subscription" in msg.lower():
            msg = "Limite de dispositivos do plano do Sinric Pro atingido (gratuito: 3)."
        raise RuntimeError(f"Sinric Pro recusou: {msg}")
    return dados["device"]["id"]


def renomear_dispositivo(device_id: str, nome: str, comodo: str = ""):
    """Troca o nome no Sinric Pro (é o nome que a Alexa e o Google usam). A Alexa atualiza na próxima descoberta."""
    h = _cabecalho()
    ids = _descobrir_ids(h)
    corpo = {"name": nome[:60], "description": f"Ar-condicionado por infravermelho via Clima Escritório{(' · ' + comodo) if comodo else ''}"[:200],
             "productId": ids["product_id"], "roomId": ids["room_id"], "accessKeyId": ids["access_key_id"], "id": device_id}
    r = httpx.put(f"{API}/devices", headers=h, json=corpo, timeout=20)  # a API do Sinric atualiza por PUT /devices com o id no corpo
    dados = r.json() if "json" in r.headers.get("content-type", "") else {}
    if not dados.get("success"):
        raise RuntimeError(f"Sinric Pro recusou a troca de nome: {dados.get('message') or r.status_code}")


def apagar_dispositivo(device_id: str):
    httpx.delete(f"{API}/devices/{device_id}", headers=_cabecalho(), timeout=20)


def conectar_alexa() -> dict:
    import base64
    import io
    import qrcode
    buf = io.BytesIO()
    qrcode.make(SKILL_ALEXA, box_size=8, border=2).save(buf, format="PNG")
    return {"skill_url": SKILL_ALEXA, "qr": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(),
            "google": "https://play.google.com/store/apps/details?id=com.google.android.apps.chromecast.app"}


def organizar_zona(zona: dict, nome_alexa: str, executar: bool) -> dict:
    """Uma zona = UM aparelho na Alexa (falar com qualquer ar da zona muda todos). Escolhe o ar que representa a zona,
    garante que ele exista no Sinric com o nome falado e tira do Sinric os outros ares da zona.
    executar=False só descreve o que seria feito (a tela pede confirmação: muda o que a Alexa conhece)."""
    ares = {a["id"]: a for a in db.consultar(
        f"SELECT a.*, (SELECT COUNT(*) FROM codigos c WHERE c.aparelho_id = a.id) AS botoes FROM aparelhos a "
        f"WHERE a.id IN ({','.join('?' * len(zona['aparelhos']))})", tuple(zona["aparelhos"]))}
    rep_id = zona.get("alexa_aparelho_id") if zona.get("alexa_aparelho_id") in ares else None
    rep_id = rep_id or next((i for i in zona["aparelhos"] if ares.get(i, {}).get("sinric_device_id")), None) \
        or next((i for i in zona["aparelhos"] if ares.get(i, {}).get("botoes")), None) or zona["aparelhos"][0]
    rep = ares[rep_id]
    passos = []
    if rep.get("sinric_device_id"):
        passos.append({"tipo": "renomear", "aparelho_id": rep_id, "texto": f"Renomear no Sinric '{rep['nome']}' para '{nome_alexa}' (a Alexa passa a chamar assim depois de 'descobrir dispositivos')."})
    else:
        passos.append({"tipo": "criar", "aparelho_id": rep_id, "texto": f"Criar no Sinric o aparelho '{nome_alexa}' ligado ao ar '{rep['nome']}' (conta 1 no limite do plano)."})
    for i in zona["aparelhos"]:
        if i != rep_id and ares[i].get("sinric_device_id"):
            passos.append({"tipo": "apagar", "aparelho_id": i, "texto": f"Tirar '{ares[i]['nome']}' do Sinric (ele muda junto com a zona; ficar na Alexa só confunde e gasta o limite)."})
    if not executar:
        return {"representante": rep_id, "passos": passos}
    for ps in passos:
        a = ares[ps["aparelho_id"]]
        if ps["tipo"] == "renomear":
            renomear_dispositivo(a["sinric_device_id"], nome_alexa, a.get("comodo") or "")
        elif ps["tipo"] == "criar":
            dev = criar_dispositivo({**a, "nome": nome_alexa})
            db.executar("UPDATE aparelhos SET sinric_device_id = ?, alexa = 1 WHERE id = ?", (dev, a["id"]))
        elif ps["tipo"] == "apagar":
            apagar_dispositivo(a["sinric_device_id"])
            db.executar("UPDATE aparelhos SET sinric_device_id = NULL, alexa = 0 WHERE id = ?", (a["id"],))
    db.registrar("painel", f"Alexa organizada por zona: {zona['nome']}", aparelho_id=rep_id, detalhe=" · ".join(p["tipo"] for p in passos))
    return {"representante": rep_id, "passos": passos, "feito": True}

