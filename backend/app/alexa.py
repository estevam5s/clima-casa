"""Skill Smart Home da Alexa (API v3): descoberta, ligar/desligar, temperatura, modo e relatório de estado."""
import uuid

from . import clima, db
from .seguranca import hash_token

MODO_PARA_ALEXA = {"frio": "COOL", "quente": "HEAT", "auto": "AUTO"}
ALEXA_PARA_MODO = {"COOL": "frio", "HEAT": "quente", "AUTO": "auto"}


def _id(aparelho_id):
    return f"ar-{aparelho_id}"


def _aparelho_id(endpoint_id: str) -> int:
    if not endpoint_id.startswith("ar-"):
        raise KeyError
    return int(endpoint_id[3:])


def token_valido(token: str | None) -> bool:
    if not token:
        return False
    t = db.um("SELECT expira FROM oauth_tokens WHERE hash = ? AND tipo = 'access'", (hash_token(token),))
    return bool(t and t["expira"] > db.agora())


def _header(namespace, nome, correlation=None):
    h = {"namespace": namespace, "name": nome, "payloadVersion": "3", "messageId": str(uuid.uuid4())}
    if correlation:
        h["correlationToken"] = correlation
    return h


def _propriedades(a: dict) -> list:
    agora = _iso()
    modo = MODO_PARA_ALEXA.get(a["modo"], "AUTO") if a["ligado"] else "OFF"
    return [
        {"namespace": "Alexa.PowerController", "name": "powerState",
         "value": "ON" if a["ligado"] else "OFF", "timeOfSample": agora, "uncertaintyInMilliseconds": 500},
        {"namespace": "Alexa.ThermostatController", "name": "thermostatMode",
         "value": modo, "timeOfSample": agora, "uncertaintyInMilliseconds": 500},
        {"namespace": "Alexa.ThermostatController", "name": "targetSetpoint",
         "value": {"value": float(a["temperatura"]), "scale": "CELSIUS"}, "timeOfSample": agora,
         "uncertaintyInMilliseconds": 500},
        {"namespace": "Alexa.EndpointHealth", "name": "connectivity",
         "value": {"value": "OK"}, "timeOfSample": agora, "uncertaintyInMilliseconds": 0},
    ]


def _iso():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.00Z")


def _erro(diretiva, tipo, mensagem):
    h = diretiva.get("header", {})
    ev = {"header": _header("Alexa", "ErrorResponse", h.get("correlationToken")),
          "payload": {"type": tipo, "message": mensagem}}
    if "endpoint" in diretiva:
        ev["endpoint"] = {"endpointId": diretiva["endpoint"]["endpointId"]}
    if tipo == "TEMPERATURE_VALUE_OUT_OF_RANGE":
        pass
    return {"event": ev}


def _descoberta():
    endpoints = []
    for a in db.consultar("SELECT * FROM aparelhos WHERE alexa = 1 ORDER BY nome"):
        endpoints.append({
            "endpointId": _id(a["id"]),
            "manufacturerName": "Clima Casa",
            "friendlyName": a["nome"],
            "description": f"Ar-condicionado{(' · ' + a['comodo']) if a['comodo'] else ''} (infravermelho)",
            "displayCategories": ["AIR_CONDITIONER"],
            "cookie": {},
            "capabilities": [
                {"type": "AlexaInterface", "interface": "Alexa", "version": "3"},
                {"type": "AlexaInterface", "interface": "Alexa.PowerController", "version": "3",
                 "properties": {"supported": [{"name": "powerState"}], "proactivelyReported": False,
                                "retrievable": True}},
                {"type": "AlexaInterface", "interface": "Alexa.ThermostatController", "version": "3",
                 "properties": {"supported": [{"name": "targetSetpoint"}, {"name": "thermostatMode"}],
                                "proactivelyReported": False, "retrievable": True},
                 "configuration": {"supportedModes": ["COOL", "HEAT", "AUTO", "OFF"], "supportsScheduling": False}},
                {"type": "AlexaInterface", "interface": "Alexa.EndpointHealth", "version": "3",
                 "properties": {"supported": [{"name": "connectivity"}], "proactivelyReported": False,
                                "retrievable": True}},
            ],
        })
    for c in db.consultar("SELECT id, nome FROM cenas ORDER BY nome"):  # cada cena vira "Alexa, ativar <nome>"
        endpoints.append({
            "endpointId": f"cena-{c['id']}", "manufacturerName": "Clima Casa", "friendlyName": c["nome"],
            "description": "Cena do Clima Casa", "displayCategories": ["SCENE_TRIGGER"], "cookie": {},
            "capabilities": [
                {"type": "AlexaInterface", "interface": "Alexa", "version": "3"},
                {"type": "AlexaInterface", "interface": "Alexa.SceneController", "version": "3", "supportsDeactivation": False},
            ],
        })
    return {"event": {"header": _header("Alexa.Discovery", "Discover.Response"), "payload": {"endpoints": endpoints}}}


def _resposta(diretiva, a, nome="Response"):
    return {
        "event": {"header": _header("Alexa", nome, diretiva["header"].get("correlationToken")),
                  "endpoint": {"endpointId": diretiva["endpoint"]["endpointId"]}, "payload": {}},
        "context": {"properties": _propriedades(a)},
    }


def _token(diretiva) -> str | None:
    p = diretiva.get("payload", {})
    return (diretiva.get("endpoint", {}).get("scope", {}).get("token")
            or p.get("scope", {}).get("token") or p.get("grantee", {}).get("token"))


def tratar(evento: dict) -> dict:
    diretiva = evento.get("directive") or {}
    h = diretiva.get("header", {})
    ns, nome = h.get("namespace"), h.get("name")

    if not token_valido(_token(diretiva)):
        db.registrar("alexa", f"{ns}.{nome} recusado", ok=False, detalhe="token inválido ou expirado")
        return _erro(diretiva, "INVALID_AUTHORIZATION_CREDENTIAL", "Token inválido ou expirado.")

    if ns == "Alexa.Authorization" and nome == "AcceptGrant":
        return {"event": {"header": _header("Alexa.Authorization", "AcceptGrant.Response"), "payload": {}}}

    if ns == "Alexa.Discovery":
        resp = _descoberta()
        db.registrar("alexa", f"Descoberta: {len(resp['event']['payload']['endpoints'])} aparelho(s)")
        return resp

    if ns == "Alexa.SceneController" and nome == "Activate":
        cena_id = int(diretiva["endpoint"]["endpointId"].removeprefix("cena-"))
        cena = db.um("SELECT * FROM cenas WHERE id = ?", (cena_id,))
        if not cena:
            return _erro(diretiva, "NO_SUCH_ENDPOINT", "Cena não existe mais.")
        for a in cena["acoes"]:
            try:
                clima.aplicar(a["aparelho_id"], f"cena:{cena['nome']}", ligado=a["ligado"], modo=a.get("modo"),
                              temperatura=a.get("temperatura"), ventilador=a.get("ventilador"))
            except Exception:  # noqa: BLE001  (falha fica na atividade; a cena segue)
                pass
        db.executar("UPDATE cenas SET executada_em = ? WHERE id = ?", (db.agora(), cena_id))
        db.registrar("alexa", f"Cena ativada por voz: {cena['nome']}")
        return {"event": {"header": _header("Alexa.SceneController", "ActivationStarted", h.get("correlationToken")),
                          "endpoint": {"endpointId": diretiva["endpoint"]["endpointId"]},
                          "payload": {"cause": {"type": "VOICE_INTERACTION"}, "timestamp": _iso()}},
                "context": {}}

    try:
        aparelho_id = _aparelho_id(diretiva["endpoint"]["endpointId"])
        a = clima.aparelho(aparelho_id)
    except (KeyError, ValueError):
        return _erro(diretiva, "NO_SUCH_ENDPOINT", "Aparelho não existe mais.")

    if ns == "Alexa" and nome == "ReportState":
        return _resposta(diretiva, a, "StateReport")

    p = diretiva.get("payload", {})
    try:
        if ns == "Alexa.PowerController":
            a = clima.aplicar(aparelho_id, "alexa", ligado=(nome == "TurnOn"))
        elif ns == "Alexa.ThermostatController" and nome == "SetTargetTemperature":
            alvo = p["targetSetpoint"]
            valor = alvo["value"] if alvo.get("scale", "CELSIUS") == "CELSIUS" else (alvo["value"] - 32) * 5 / 9
            valor = round(valor)
            if not a["temp_min"] <= valor <= a["temp_max"]:
                return {"event": {
                    "header": _header("Alexa", "ErrorResponse", h.get("correlationToken")),
                    "endpoint": {"endpointId": diretiva["endpoint"]["endpointId"]},
                    "payload": {"type": "TEMPERATURE_VALUE_OUT_OF_RANGE",
                                "message": "Temperatura fora da faixa do aparelho.",
                                "validRange": {"minimumValue": {"value": float(a["temp_min"]), "scale": "CELSIUS"},
                                               "maximumValue": {"value": float(a["temp_max"]), "scale": "CELSIUS"}}}}}
            a = clima.aplicar(aparelho_id, "alexa", ligado=True, temperatura=valor)
        elif ns == "Alexa.ThermostatController" and nome == "AdjustTargetTemperature":
            delta = round(p["targetSetpointDelta"]["value"])
            a = clima.aplicar(aparelho_id, "alexa", ligado=True, temperatura=a["temperatura"] + delta)
        elif ns == "Alexa.ThermostatController" and nome == "SetThermostatMode":
            modo = p["thermostatMode"]["value"]
            if modo == "OFF":
                a = clima.aplicar(aparelho_id, "alexa", ligado=False)
            elif modo in ALEXA_PARA_MODO:
                a = clima.aplicar(aparelho_id, "alexa", ligado=True, modo=ALEXA_PARA_MODO[modo])
            else:
                return _erro(diretiva, "UNSUPPORTED_THERMOSTAT_MODE", "Modo não suportado.")
        else:
            return _erro(diretiva, "INVALID_DIRECTIVE", f"Comando não suportado: {ns}.{nome}")
    except RuntimeError as e:
        return _erro(diretiva, "ENDPOINT_UNREACHABLE", str(e)[:200])
    except ValueError as e:
        return _erro(diretiva, "INVALID_VALUE", str(e)[:200])
    return _resposta(diretiva, a)
