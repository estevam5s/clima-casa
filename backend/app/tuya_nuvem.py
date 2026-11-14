"""Conta Smart Life: login por QR Code, lista de aparelhos, especificação e envio de comandos pela nuvem.

Usa o mesmo fluxo da integração Tuya do Home Assistant (sem precisar do iot.tuya.com).
O token fica na tabela config e é renovado automaticamente pelo SDK.
"""
import base64
import io
import json
import threading

import qrcode
from tuya_sharing import LoginControl, Manager, SharingTokenListener

from . import db

CLIENT_ID = "HA_3y9q4ak7g4ephrvke"
SCHEMA = "haauthorize"
CATEGORIA_IR = "wnykq"

_trava = threading.Lock()
_manager: Manager | None = None
_login = LoginControl()


class _Persistir(SharingTokenListener):
    def update_token(self, token_info):
        conta = db.cfg("tuya_conta") or {}
        conta["token"] = token_info
        db.set_cfg("tuya_conta", conta)


def conectada() -> bool:
    return bool(db.cfg("tuya_conta"))


def iniciar_qr(user_code: str) -> dict:
    user_code = user_code.strip()
    resp = _login.qr_code(CLIENT_ID, SCHEMA, user_code)
    if not resp.get("success"):
        raise ValueError(resp.get("msg") or "A Tuya recusou o código do usuário.")
    token = resp["result"]["qrcode"]
    img = qrcode.make(f"tuyaSmart--qrLogin?token={token}", box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    db.set_cfg("tuya_qr_pendente", {"token": token, "user_code": user_code})
    return {"imagem": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}


def checar_qr() -> dict:
    pendente = db.cfg("tuya_qr_pendente")
    if not pendente:
        return {"estado": "sem_qr"}
    ok, info = _login.login_result(pendente["token"], CLIENT_ID, pendente["user_code"])
    if not ok:
        return {"estado": "aguardando"}
    global _manager
    with _trava:
        db.set_cfg("tuya_conta", {
            "user_code": pendente["user_code"],
            "terminal_id": info["terminal_id"],
            "endpoint": info["endpoint"],
            "usuario": info.get("username") or "",
            "token": info,
        })
        db.set_cfg("tuya_qr_pendente", None)
        _manager = None
    db.registrar("sistema", "Conta Smart Life conectada")
    return {"estado": "conectado"}


def desconectar():
    global _manager
    with _trava:
        db.set_cfg("tuya_conta", None)
        _manager = None
    db.registrar("sistema", "Conta Smart Life desconectada")


def manager() -> Manager:
    global _manager
    with _trava:
        if _manager is None:
            conta = db.cfg("tuya_conta")
            if not conta:
                raise RuntimeError("Conta Smart Life não conectada. Conecte em Configurações.")
            _manager = Manager(CLIENT_ID, conta["user_code"], conta["terminal_id"], conta["endpoint"],
                               conta["token"], _Persistir())
        return _manager


def listar_aparelhos() -> list[dict]:
    m = manager()
    m.update_device_cache()
    saida = []
    for d in m.device_map.values():
        saida.append({
            "id": d.id, "nome": d.name, "categoria": d.category, "produto": getattr(d, "product_name", ""),
            "online": bool(d.online), "ip": getattr(d, "ip", ""), "sub": bool(getattr(d, "sub", False)),
            "transmissor_ir": d.category == CATEGORIA_IR,
        })
    return saida


def detalhes(device_id: str) -> dict:
    """local_key + mapa de DPs (para descobrir o formato de comando) + funções aceitas pela nuvem."""
    m = manager()
    if device_id not in m.device_map:
        m.update_device_cache()
    d = m.device_map.get(device_id)
    if not d:
        raise KeyError("Aparelho não encontrado na conta Smart Life.")
    api = m.customer_api
    spec = api.get(f"/v1.1/m/life/{device_id}/specifications").get("result") or {}
    status = api.get(f"/v1.0/m/life/devices/{device_id}/status").get("result") or {}
    dps = {str(r["dpId"]): r["statusCode"] for r in status.get("dpStatusRelationDTOS", [])}
    funcoes = [f["code"] for f in spec.get("functions", [])]
    if "201" in dps:
        control_type = 1
    elif "1" in dps or "7" in dps:
        control_type = 2
    else:
        control_type = None
    return {"id": d.id, "nome": d.name, "local_key": d.local_key, "ip": getattr(d, "ip", ""),
            "dps": dps, "funcoes": funcoes, "control_type": control_type}


def enviar_ir(device_id: str, codigo_b64: str, funcoes: list[str]):
    """Envia um código IR aprendido pela nuvem. Só funciona se o transmissor expõe a função ir_send."""
    api = manager().customer_api
    if "ir_send" in funcoes:
        valor = json.dumps({"control": "send_ir", "head": "", "key1": "1" + codigo_b64, "type": 0, "delay": 300})
        comandos = [{"code": "ir_send", "value": valor}]
    elif "send_ir" in funcoes or "mode" in funcoes:
        comandos = [{"code": "mode", "value": "study_key"}, {"code": "key_study", "value": codigo_b64}]
    else:
        raise RuntimeError("Este transmissor não aceita envio de código aprendido pela nuvem.")
    resp = api.post(f"/v1.1/m/thing/{device_id}/commands", None, {"commands": comandos})
    if not resp.get("success"):
        raise RuntimeError(f"Nuvem Tuya recusou: {resp.get('msg') or resp.get('code')}")
