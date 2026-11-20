"""Aparelhos do escritório além dos ares: cafeteira, persianas, luzes e a fechadura da porta do escritório.

Hardware (Tuya / Smart Life, a mesma conta já conectada para os transmissores):
- cafeteira: TOMADA INTELIGENTE (categoria cz/pc/kg). A cafeteira de cápsulas não tem rede: o sistema liga e desliga a
  energia (pré-aquece e desliga sozinha); a cápsula e o botão de passar o café continuam na mão de alguém.
- persiana: MOTOR DE CORTINA/PERSIANA (categoria cl/clkg): abrir, fechar, parar e posição em %.
- luz: LÂMPADA, PAINEL, FITA ou INTERRUPTOR inteligente (categorias dj/dd/fwd/xdd/dc/tgq/tgkg/kg): ligar, desligar e brilho
  em %. Automações: acender ao anoitecer (pôr do sol real calculado para a posição do escritório) até uma hora, e acender
  quando a fechadura for destrancada à noite.
- fechadura: FECHADURA Wi-Fi (categoria ms/jtmspro…): estado, bateria e sensor de porta; trancar/destrancar pela internet
  só se o modelo aceitar comando remoto (muitos não aceitam: a tela diz).

Os comandos vão pela nuvem Tuya (POST /v1.1/m/thing/{id}/commands com os códigos-padrão de cada categoria), então
funcionam da Vercel também, sem depender do agente. O estado é lido da nuvem (status) no ciclo do agente (~1 min).
Nada é inventado: sem aparelho pareado, o item existe, mas a tela mostra "sem aparelho conectado" e nada é enviado.
"""
from __future__ import annotations

import datetime
import json
import re
import logging

from . import db

log = logging.getLogger("clima.dispositivos")
TIPOS = ("cafeteira", "persiana", "fechadura", "luz")
CATEGORIAS = {"cafeteira": {"cz", "pc", "kg", "tdq"}, "persiana": {"cl", "clkg"}, "fechadura": {"ms", "jtmspro", "jtmsbh", "videolock", "bxx", "gyms"},
              "luz": {"dj", "dd", "fwd", "xdd", "dc", "tgq", "tgkg", "kg", "fsd"}}
PADRAO_CONFIG = {
    "cafeteira": {"agendas": [], "desligar_apos_min": 45, "capsulas": 0, "capsulas_alerta": 5, "potencia_w": 1500},
    "persiana": {"agendas": [], "sol_forte": {"ativo": False, "temp_min": 27, "posicao": 30, "das": "10:00", "ate": "16:00"}},
    "fechadura": {"auto_trancar_min": 0, "alertar_fora_expediente": True, "expediente": ["07:00", "19:00"]},
    "luz": {"agendas": [], "anoitecer": {"ativo": False, "antes_min": 15, "ate": "19:30", "dias": [1, 2, 3, 4, 5]},
            "com_fechadura": False, "brilho_padrao": 100, "potencia_w": 40},
}

# posição do escritório para o pôr do sol (Florianópolis); o projeto pode ter outra cidade, mas o prédio é um só
LAT_ESCRITORIO, LON_ESCRITORIO = -27.5954, -48.5480


def sol_do_dia(data: datetime.date | None = None, lat: float = LAT_ESCRITORIO, lon: float = LON_ESCRITORIO) -> dict:
    """Nascer e pôr do sol (horário de Brasília, UTC-3) pela aproximação da NOAA (erro de 1-2 min)."""
    import math
    data = data or (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).date()
    n = data.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = 0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g) \
        - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g)
    phi = math.radians(lat)
    cos_h = (math.cos(math.radians(90.833)) - math.sin(phi) * math.sin(decl)) / (math.cos(phi) * math.cos(decl))
    h = math.degrees(math.acos(max(-1, min(1, cos_h))))
    def hm(minutos_utc):
        m = (minutos_utc - 180) % 1440
        return f"{int(m // 60):02d}:{int(m % 60):02d}"
    return {"nascer": hm(720 - 4 * (lon + h) - eqt), "por": hm(720 - 4 * (lon - h) - eqt)}


def _mais(hhmm: str, minutos: int) -> str:
    h, m = map(int, hhmm.split(":"))
    t = (h * 60 + m + minutos) % 1440
    return f"{t // 60:02d}:{t % 60:02d}"


def e_noite(agora_hhmm: str | None = None) -> bool:
    sol = sol_do_dia()
    hm = agora_hhmm or (datetime.datetime.utcnow() - datetime.timedelta(hours=3)).strftime("%H:%M")
    return hm >= sol["por"] or hm < sol["nascer"]


def _j(v, padrao):
    if v is None:
        return padrao
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except (TypeError, ValueError):
        return padrao


def _linha(d: dict) -> dict:
    d = dict(d)
    d["funcoes"] = _j(d.get("funcoes"), [])
    d["estado"] = _j(d.get("estado"), {})
    d["config"] = {**PADRAO_CONFIG.get(d["tipo"], {}), **_j(d.get("config"), {})}
    d["fila"] = _j(d.get("fila"), [])
    d["info_placa"] = _j(d.get("info_placa"), {})
    d["placa_configurada"] = bool(d.get("token_hash"))
    d.pop("token_hash", None)
    if d.get("driver") == "placa":   # placa própria: conectada quando já falou com o servidor; online se falou há < 20 s (ela sincroniza a cada 3 s)
        d["conectado"] = bool(d.get("ultimo_contato"))
        d["online"] = 1 if d.get("ultimo_contato") and db.agora() - int(d["ultimo_contato"]) < 20 else 0
        d["visto_em"] = d.get("ultimo_contato")
    else:
        d["conectado"] = bool(d.get("tuya_id"))
    d["resumo"] = resumo(d)
    return d


def listar(tipo: str | None = None, filtro_sql: str = "", params: tuple = ()) -> list[dict]:
    w, p = (" WHERE d.tipo = ?", (tipo,)) if tipo else (" WHERE true", ())
    linhas = db.consultar(f"SELECT d.*, pr.nome AS projeto_nome FROM dispositivos d LEFT JOIN projetos pr ON pr.id = d.projeto_id{w}{filtro_sql} ORDER BY d.tipo, pr.nome, d.nome", p + params)
    iso = _isolados()
    return [{**_linha(x), "isolado": iso.get(str(x["id"]))} for x in linhas]


def _isolados() -> dict:
    from . import fisico
    try:
        return fisico.isolados()["dispositivos"]
    except Exception:  # noqa: BLE001
        return {}


def um(did: int) -> dict:
    d = db.um("SELECT d.*, pr.nome AS projeto_nome FROM dispositivos d LEFT JOIN projetos pr ON pr.id = d.projeto_id WHERE d.id = ?", (did,))
    if not d:
        raise KeyError("Aparelho não encontrado.")
    return {**_linha(d), "isolado": _isolados().get(str(did))}


def evento(did: int, acao: str, origem: str = "painel", ok: bool = True, detalhe: str = ""):
    db.executar("INSERT INTO dispositivos_eventos (dispositivo_id, quando, acao, origem, ok, detalhe) VALUES (?,?,?,?,?,?)",
                (did, db.agora(), acao[:120], origem[:40], 1 if ok else 0, detalhe[:300]))


def eventos(did: int, limite: int = 60) -> list[dict]:
    return db.consultar("SELECT quando, acao, origem, ok, detalhe FROM dispositivos_eventos WHERE dispositivo_id = ? ORDER BY quando DESC LIMIT ?", (did, limite))


# ---------------- leitura do estado (nuvem Tuya) ----------------
def _ler_status(tuya_id: str) -> dict:
    from . import tuya_nuvem
    api = tuya_nuvem.manager().customer_api
    r = api.get(f"/v1.0/m/life/devices/{tuya_id}/status").get("result") or {}
    saida = {}
    for x in r.get("dpStatusRelationDTOS", []) or []:
        cod = x.get("statusCode") or x.get("code")
        if cod is not None:
            saida[cod] = x.get("value") if "value" in x else x.get("valueDesc")
    if not saida and isinstance(r, list):   # formato alternativo [{code, value}]
        saida = {x.get("code"): x.get("value") for x in r if x.get("code")}
    return saida


def atualizar(did: int) -> dict:
    d = um(did)
    if d.get("driver") == "placa" or not d["tuya_id"]:   # placa própria manda o estado sozinha
        return d
    try:
        st = _ler_status(d["tuya_id"])
        db.executar("UPDATE dispositivos SET estado = CAST(? AS jsonb), online = 1, visto_em = ? WHERE id = ?", (json.dumps(st), db.agora(), did))
        if d["tipo"] == "persiana" and d.get("mapa_elemento"):   # a janela do mapa acompanha o motor de verdade
            pos = resumo({**d, "estado": st}).get("posicao")
            if isinstance(pos, (int, float)):
                mapa = db.cfg("mapa") or {}
                el = next((e for e in mapa.get("elementos", []) if e.get("id") == d["mapa_elemento"]), None)
                if el and el.get("aberta") != int(pos):
                    el["aberta"] = int(pos); db.set_cfg("mapa", mapa)
    except Exception as e:  # noqa: BLE001
        db.executar("UPDATE dispositivos SET online = 0 WHERE id = ?", (did,))
        log.warning("status de %s: %s", d["nome"], e)
    return um(did)


def resumo(d: dict) -> dict:
    """Estado legível a partir dos códigos-padrão Tuya de cada categoria (o que não vier fica None)."""
    st, t = d.get("estado") or {}, d["tipo"]
    if d.get("driver") == "placa":   # a placa já manda os nomes do sistema
        if t == "cafeteira":
            return {"ligada": st.get("ligada"), "potencia_w": st.get("potencia_w"), "tensao_v": None}
        if t == "persiana":
            return {"posicao": st.get("posicao"), "movimento": st.get("movimento")}
        if t == "fechadura":
            return {"trancada": st.get("trancada"), "porta_aberta": st.get("porta_aberta"), "bateria": st.get("bateria"), "alarme": st.get("alarme")}
        if t == "luz":
            return {"ligada": st.get("ligada"), "brilho": st.get("brilho")}
    if t == "luz":
        tecla = (d.get("config") or {}).get("tecla")
        if tecla:   # uma tecla de um interruptor de várias teclas (Novadigital 4 teclas: switch_1…switch_4)
            return {"ligada": st.get(tecla), "brilho": None, "tecla": tecla, "luz_fundo": st.get("backlight_switch")}
        lig = next((st[k] for k in ("switch_led", "switch_1", "switch", "led_switch") if k in st), None)
        bruto = next(((k, st[k]) for k in ("bright_value_v2", "bright_value", "bright_value_1") if isinstance(st.get(k), (int, float))), None)
        brilho = None
        if bruto:   # v2 vai de 10 a 1000; as antigas de 25 a 255
            k, v = bruto
            brilho = round(max(0, min(100, (v - 10) / 990 * 100 if k == "bright_value_v2" else (v - 25) / 230 * 100)))
        return {"ligada": lig, "brilho": brilho}
    if t == "cafeteira":
        lig = next((st[k] for k in ("switch_1", "switch") if k in st), None)
        pot = st.get("cur_power")
        return {"ligada": lig, "potencia_w": (pot / 10 if isinstance(pot, (int, float)) and pot > 100 else pot), "tensao_v": (st.get("cur_voltage") / 10 if isinstance(st.get("cur_voltage"), (int, float)) else None)}
    if t == "persiana":
        pos = next((st[k] for k in ("percent_state", "percent_control", "position") if k in st), None)
        return {"posicao": pos, "movimento": st.get("work_state") or st.get("control")}
    if t == "fechadura":
        trav = st.get("lock_motor_state")
        if trav is None and "closed_opened" in st:
            trav = None
        return {"trancada": (not trav) if isinstance(trav, bool) else None, "porta_aberta": (st.get("closed_opened") == "open") if "closed_opened" in st else None,
                "bateria": st.get("residual_electricity") or st.get("battery_state"), "alarme": st.get("alarm_lock")}
    return {}


# ---------------- comandos ----------------
def _cmds(d: dict, acao: str, valor) -> list[dict]:
    f = set(d["funcoes"])
    if d["tipo"] == "cafeteira":
        cod = "switch_1" if "switch_1" in f or not f else "switch"
        if acao in ("ligar", "desligar"):
            return [{"code": cod, "value": acao == "ligar"}]
    if d["tipo"] == "luz" and (d.get("config") or {}).get("tecla"):
        tecla = d["config"]["tecla"]
        if acao in ("ligar", "desligar"):
            return [{"code": tecla, "value": acao == "ligar"}]
        raise RuntimeError("Tecla de interruptor só liga e desliga (não tem ajuste de brilho).")
    if d["tipo"] == "luz":
        cod = next((c for c in ("switch_led", "switch_1", "switch", "led_switch") if c in f), "switch_led" if not f else None)
        if acao in ("ligar", "desligar"):
            if not cod:
                raise RuntimeError("Esta luz não expõe o comando de ligar/desligar na nuvem.")
            return [{"code": cod, "value": acao == "ligar"}]
        if acao == "brilho":
            pct = max(1, min(100, int(valor if valor is not None else 100)))
            if "bright_value_v2" in f or not f:
                return [{"code": cod or "switch_led", "value": True}, {"code": "bright_value_v2", "value": int(10 + pct / 100 * 990)}]
            for k in ("bright_value", "bright_value_1"):
                if k in f:
                    return [{"code": cod or "switch_led", "value": True}, {"code": k, "value": int(25 + pct / 100 * 230)}]
            raise RuntimeError("Esta luz não tem ajuste de brilho (só liga e desliga).")
    if d["tipo"] == "persiana":
        if acao in ("abrir", "fechar", "parar"):
            return [{"code": "control", "value": {"abrir": "open", "fechar": "close", "parar": "stop"}[acao]}]
        if acao == "posicao":
            return [{"code": "percent_control", "value": max(0, min(100, int(valor)))}]
    if d["tipo"] == "fechadura":
        # comando remoto só nos modelos que expõem uma função de trava/destrava na nuvem
        for cod in ("remote_no_dp_key", "unlock_ble", "manual_lock", "lock", "switch_lock"):
            if cod in f:
                if cod in ("manual_lock", "lock", "switch_lock"):
                    return [{"code": cod, "value": acao == "trancar"}]
                if acao == "destrancar":
                    return [{"code": cod, "value": True}]
        raise RuntimeError("Esta fechadura não aceita trancar ou destrancar pela internet (o modelo não expõe o comando). "
                           "Estado, bateria e histórico continuam aparecendo aqui.")
    raise RuntimeError("Ação não reconhecida para este aparelho.")


ACOES_PLACA = {"cafeteira": {"ligar", "desligar"}, "persiana": {"abrir", "fechar", "parar", "posicao"}, "fechadura": {"trancar", "destrancar"},
               "luz": {"ligar", "desligar", "brilho"}}
ACOES = ACOES_PLACA   # ações válidas por tipo (a rota usa a mesma lista)


def comando(did: int, acao: str, valor=None, origem: str = "painel") -> dict:
    d = um(did)
    from . import fisico
    fisico.checar_dispositivo(d, acao)   # isolamento e limite por minuto (estado seguro sempre passa)
    if d.get("driver") == "placa":   # entra na fila; a placa busca em até ~2 s e confirma
        if not d["placa_configurada"]:
            raise RuntimeError(f"{d['nome']} ainda não tem placa configurada. Gere o código da placa em Conectar aparelho → Placa própria.")
        if acao not in ACOES_PLACA[d["tipo"]]:
            raise RuntimeError("Ação não vale para este aparelho.")
        import secrets
        fila = (d["fila"] + [{"id": secrets.token_hex(4), "acao": acao, "valor": valor, "em": db.agora()}])[-20:]
        db.executar("UPDATE dispositivos SET fila = CAST(? AS jsonb) WHERE id = ?", (json.dumps(fila), did))
        evento(did, _rotulo(acao, valor), origem, True, "enviado à placa" + ("" if d["online"] else " (offline: executa quando ela voltar)"))
        db.registrar(origem, f"{d['nome']}: {_rotulo(acao, valor)}", detalhe=f"{d['tipo']} · placa {d.get('placa') or ''}")
        return um(did)
    if not d["tuya_id"]:
        raise RuntimeError(f"{d['nome']} ainda não tem aparelho conectado. Pareie no Smart Life e importe em {d['tipo'].capitalize()} → Conectar aparelho.")
    from . import tuya_nuvem
    try:
        cmds = _cmds(d, acao, valor)
        resp = tuya_nuvem.manager().customer_api.post(f"/v1.1/m/thing/{d['tuya_id']}/commands", None, {"commands": cmds})
        if not resp.get("success"):
            raise RuntimeError(f"A nuvem Tuya recusou: {resp.get('msg') or resp.get('code')}")
    except Exception as e:
        evento(did, _rotulo(acao, valor), origem, False, str(e))
        raise
    evento(did, _rotulo(acao, valor), origem, True)
    db.registrar(origem, f"{d['nome']}: {_rotulo(acao, valor)}", detalhe=d["tipo"])
    return atualizar(did)


def _rotulo(acao, valor) -> str:
    return {"ligar": "Ligou", "desligar": "Desligou", "abrir": "Abriu", "fechar": "Fechou", "parar": "Parou", "trancar": "Trancou",
            "destrancar": "Destrancou", "posicao": f"Posição {valor}%", "brilho": f"Brilho {valor}%"}.get(acao, acao)


# ---------------- placa própria (Arduino / ESP) ----------------
PLACAS = {"uno_r4_wifi": "Arduino UNO R4 WiFi", "giga_r1_wifi": "Arduino GIGA R1 WiFi", "nano_33_iot": "Arduino Nano 33 IoT",
          "mkr_wifi_1010": "Arduino MKR WiFi 1010", "nano_esp32": "Arduino Nano ESP32", "esp32": "ESP32 (DevKit)", "esp8266": "ESP8266 (NodeMCU / Wemos D1)",
          "opta_wifi": "Arduino Opta WiFi", "portenta_h7": "Arduino Portenta H7"}


def _hash(token: str) -> str:
    import hashlib
    return hashlib.sha256(token.encode()).hexdigest()


def gerar_token_placa(did: int, placa: str) -> dict:
    """Liga o aparelho a uma placa própria. O token aparece uma vez (no banco fica só o hash); gerar de novo invalida o anterior."""
    import secrets
    if placa not in PLACAS:
        raise ValueError("Placa não suportada.")
    um(did)
    token = "cp_" + secrets.token_urlsafe(32)
    db.executar("UPDATE dispositivos SET driver = 'placa', placa = ?, token_hash = ?, ultimo_contato = NULL, fila = '[]'::jsonb WHERE id = ?", (placa, _hash(token), did))
    evento(did, f"Placa configurada: {PLACAS[placa]}", "painel")
    return {"token": token, "placa": placa, "nome_placa": PLACAS[placa]}


def voltar_para_tuya(did: int) -> dict:
    db.executar("UPDATE dispositivos SET driver = 'tuya', token_hash = NULL, ultimo_contato = NULL, fila = '[]'::jsonb WHERE id = ?", (did,))
    evento(did, "Placa desligada do sistema", "painel")
    return um(did)


def sincronizar(token: str, corpo: dict) -> dict | None:
    """Chamado pela placa a cada ~2 s: grava o estado que ela mandou, tira da fila o que ela confirmou e devolve o resto."""
    if not token.startswith("cp_"):
        return None
    d = db.um("SELECT id, tipo, fila, estado, nome, info_placa FROM dispositivos WHERE token_hash = ? AND driver = 'placa'", (_hash(token),))
    if not d:
        return None
    from . import fisico
    fila = _j(d["fila"], [])
    feitos = {str(x) for x in (corpo.get("feitos") or [])[:50]}
    agora_s = db.agora()
    vencidos = [c for c in fila if c["id"] not in feitos and agora_s - int(c.get("em") or 0) > fisico.validade_placa(c.get("acao"))]
    resto = [c for c in fila if c["id"] not in feitos and c not in vencidos]
    for c in vencidos:   # comando velho não é executado (a placa ficou offline): registra e descarta
        evento(d["id"], f"{_rotulo(c['acao'], c.get('valor'))} (expirou sem a placa buscar)", "placa", False,
               f"pedido há {agora_s - int(c.get('em') or 0)} s; refaça pelo painel se ainda quiser")
    estado = corpo.get("estado") if isinstance(corpo.get("estado"), dict) else _j(d["estado"], {})
    estado = {k: v for k, v in list(estado.items())[:20] if isinstance(k, str) and len(k) <= 30 and isinstance(v, (bool, int, float, str, type(None)))}
    info = {**_j(d.get("info_placa"), {}), **{k: corpo.get(k) for k in ("firmware", "placa", "rssi", "ip", "uptime_s", "heap") if corpo.get(k) is not None}}
    db.executar("UPDATE dispositivos SET estado = CAST(? AS jsonb), fila = CAST(? AS jsonb), info_placa = CAST(? AS jsonb), ultimo_contato = ?, online = 1 WHERE id = ?",
                (json.dumps(estado), json.dumps(resto), json.dumps(info, default=str)[:2000], db.agora(), d["id"]))
    for c in fila:
        if c["id"] in feitos:
            evento(d["id"], f"{_rotulo(c['acao'], c.get('valor'))} (confirmado pela placa)", "placa", True)
    return {"comandos": [{"id": c["id"], "acao": c["acao"], "valor": c.get("valor")} for c in resto], "intervalo_ms": 3000, "hora": db.agora()}


# ---------------- importar da conta Smart Life ----------------
def disponiveis() -> list[dict]:
    from . import tuya_nuvem
    # interruptor de várias teclas pode ter uma luz por tecla: ele só fica "em uso" quando é usado sem tecla
    ja = {r["tuya_id"] for r in db.consultar("SELECT tuya_id FROM dispositivos WHERE tuya_id IS NOT NULL AND coalesce(config->>'tecla', '') = ''")}
    com_tecla = {r["tuya_id"] for r in db.consultar("SELECT tuya_id FROM dispositivos WHERE tuya_id IS NOT NULL AND coalesce(config->>'tecla', '') <> ''")}
    saida = []
    for a in tuya_nuvem.listar_aparelhos():
        tipos = [t for t, cats in CATEGORIAS.items() if a["categoria"] in cats]
        if tipos:
            saida.append({**a, "tipo": tipos[0], "tipos": tipos, "ja_cadastrado": a["id"] in ja, "teclas_em_uso": a["id"] in com_tecla})
    return saida


def teclas_de(funcoes: list[str]) -> list[str]:
    """Teclas de um interruptor (switch_1, switch_2…) na ordem. Uma só = interruptor simples."""
    return sorted((f for f in funcoes if re.fullmatch(r"switch_\d+", f)), key=lambda x: int(x.split("_")[1]))


def teclas(tuya_id: str) -> dict:
    """Teclas do interruptor na conta Smart Life e quais já viraram luz no sistema."""
    from . import tuya_nuvem
    info = next((a for a in tuya_nuvem.listar_aparelhos() if a["id"] == tuya_id), None)
    if not info:
        raise KeyError("Aparelho não está na conta Smart Life conectada.")
    det = tuya_nuvem.detalhes(tuya_id)
    usadas = [{"tecla": (_j(r["config"], {}) or {}).get("tecla"), "id": r["id"], "nome": r["nome"]}
              for r in db.consultar("SELECT id, nome, config FROM dispositivos WHERE tuya_id = ? AND tipo = 'luz'", (tuya_id,))]
    return {"id": tuya_id, "nome": info.get("nome") or det.get("nome"), "produto": info.get("produto"), "categoria": info["categoria"],
            "online": info.get("online"), "teclas": teclas_de(det.get("funcoes") or []), "usadas": usadas,
            "luz_fundo": "backlight_switch" in (det.get("funcoes") or [])}


def conectar(did: int, tuya_id: str, tecla: str | None = None) -> dict:
    from . import tuya_nuvem
    d = um(did)
    info = next((a for a in tuya_nuvem.listar_aparelhos() if a["id"] == tuya_id), None)
    if not info:
        raise KeyError("Aparelho não está na conta Smart Life conectada.")
    if info["categoria"] not in CATEGORIAS[d["tipo"]]:
        raise ValueError(f"Esse aparelho ({info['produto'] or info['categoria']}) não é do tipo {d['tipo']}.")
    det = tuya_nuvem.detalhes(tuya_id)
    cfg = dict(d.get("config") or {})
    if d["tipo"] == "luz":
        tks = teclas_de(det.get("funcoes") or [])
        if tecla and tecla not in tks:
            raise ValueError(f"Este interruptor não tem a tecla {tecla} (tem: {', '.join(tks) or 'nenhuma'}).")
        if len(tks) > 1 and not tecla:
            raise ValueError(f"Este interruptor tem {len(tks)} teclas: escolha qual tecla esta luz usa (ou use Adicionar interruptor).")
        if tecla:
            cfg["tecla"] = tecla
        else:
            cfg.pop("tecla", None)
    db.executar("UPDATE dispositivos SET tuya_id = ?, categoria = ?, produto = ?, funcoes = CAST(? AS jsonb), online = ?, config = CAST(? AS jsonb) WHERE id = ?",
                (tuya_id, info["categoria"], info.get("produto") or "", json.dumps(det.get("funcoes") or []), 1 if info["online"] else 0, json.dumps(cfg), did))
    evento(did, "Aparelho conectado", "painel", True, info.get("produto") or info["categoria"])
    return atualizar(did)


# ---------------- automações (laço do agente, a cada ~20 s) ----------------
_ultimo: dict[str, str] = {}


def _hhmm(dt) -> str:
    return dt.strftime("%H:%M")


def ciclo(contador: int = 0):
    agora = datetime.datetime.now()
    dia = agora.isoweekday()   # 1 = segunda
    for d in listar():
        if not d["conectado"] and not d.get("placa_configurada"):
            continue
        cfg = d["config"]
        try:
            if contador % 3 == 0:
                d = atualizar(d["id"])
            for i, ag in enumerate(cfg.get("agendas") or []):
                if dia not in (ag.get("dias") or [1, 2, 3, 4, 5]) or ag.get("hora") != _hhmm(agora):
                    continue
                marca = f"{d['id']}:{i}:{agora:%Y%m%d%H%M}"
                if _ultimo.get(f"{d['id']}:{i}") == marca:
                    continue
                _ultimo[f"{d['id']}:{i}"] = marca
                comando(d["id"], ag.get("acao", "ligar"), ag.get("valor"), "agenda")
            r = d["resumo"]
            if d["tipo"] == "cafeteira" and r.get("ligada"):   # desliga sozinha depois de X min ligada (segurança)
                from . import fisico
                lim = int(cfg.get("desligar_apos_min") or 0) or fisico.CAFETEIRA_MAX_MIN   # sem limite escolhido: nunca fica ligada para sempre
                ult = db.um("SELECT quando FROM dispositivos_eventos WHERE dispositivo_id = ? AND acao = 'Ligou' AND ok = 1 ORDER BY quando DESC LIMIT 1", (d["id"],))
                if lim and ult and db.agora() - ult["quando"] > lim * 60:
                    comando(d["id"], "desligar", None, "segurança")
            if d["tipo"] == "persiana" and (cfg.get("sol_forte") or {}).get("ativo"):
                s = cfg["sol_forte"]
                if s.get("das", "10:00") <= _hhmm(agora) <= s.get("ate", "16:00") and contador % 15 == 0:
                    from . import clima_externo
                    try:
                        c = clima_externo.agora(d.get("projeto_id"), None)
                    except Exception:  # noqa: BLE001
                        c = {}
                    if c.get("temperatura") is not None and c["temperatura"] >= float(s.get("temp_min", 27)) and c.get("tipo") in ("limpo", None) \
                            and (r.get("posicao") is None or r["posicao"] > int(s.get("posicao", 30))):
                        comando(d["id"], "posicao", int(s.get("posicao", 30)), "sol forte")
            if d["tipo"] == "luz":
                _automacao_luz(d, cfg, r, agora, dia)
            if d["tipo"] == "fechadura":
                if r.get("trancada") is False:
                    lim = int(cfg.get("auto_trancar_min") or 0)
                    ult = db.um("SELECT quando FROM dispositivos_eventos WHERE dispositivo_id = ? AND acao = 'Destrancou' ORDER BY quando DESC LIMIT 1", (d["id"],))
                    if lim and ult and db.agora() - ult["quando"] > lim * 60:
                        try:
                            comando(d["id"], "trancar", None, "auto trancar")
                        except RuntimeError:
                            pass
                    ini, fim = cfg.get("expediente") or ["07:00", "19:00"]
                    if cfg.get("alertar_fora_expediente") and not (ini <= _hhmm(agora) <= fim) and contador % 15 == 0:
                        from . import notificacoes
                        notificacoes.notificar(f"fechadura:{d['id']}:aberta", "seguranca", "alta", f"{d['nome']} destrancada fora do expediente",
                                               "Confira a porta do escritório.", link="/fechadura")
        except Exception as e:  # noqa: BLE001
            log.warning("automação de %s: %s", d["nome"], e)


def _automacao_luz(d: dict, cfg: dict, r: dict, agora: datetime.datetime, dia: int):
    """Acende ao anoitecer (até a hora escolhida) e quando a fechadura é destrancada à noite. Uma vez por dia/evento:
    se alguém apagar na mão depois, o sistema não acende de novo."""
    hm = _hhmm(agora)
    sol = sol_do_dia(agora.date())
    an = cfg.get("anoitecer") or {}
    if an.get("ativo") and dia in (an.get("dias") or [1, 2, 3, 4, 5]):
        inicio, ate = _mais(sol["por"], -int(an.get("antes_min") or 0)), an.get("ate") or "19:30"
        marca = f"luz:{d['id']}:anoitecer:{agora:%Y%m%d}"
        if inicio <= hm < ate and _ultimo.get(marca) is None and r.get("ligada") is not True:
            _ultimo[marca] = hm
            alvo = int(cfg.get("brilho_padrao") or 100)
            try:
                comando(d["id"], "brilho" if alvo < 100 and _tem_brilho(d) else "ligar", alvo, "anoitecer")
            except RuntimeError as e:
                log.warning("anoitecer %s: %s", d["nome"], e)
    if cfg.get("com_fechadura") and (hm >= sol["por"] or hm < sol["nascer"]):
        ult = db.um("SELECT e.quando FROM dispositivos_eventos e JOIN dispositivos f ON f.id = e.dispositivo_id "
                    "WHERE f.tipo = 'fechadura' AND e.acao LIKE 'Destrancou%' AND e.ok = 1 ORDER BY e.quando DESC LIMIT 1")
        if ult and db.agora() - ult["quando"] < 120:
            marca = f"luz:{d['id']}:fechadura:{ult['quando']}"
            if _ultimo.get(marca) is None:
                _ultimo[marca] = hm
                if r.get("ligada") is not True:
                    try:
                        comando(d["id"], "ligar", None, "porta destrancada")
                    except RuntimeError as e:
                        log.warning("luz com a fechadura %s: %s", d["nome"], e)


def _tem_brilho(d: dict) -> bool:
    f = set(d.get("funcoes") or [])
    return d.get("driver") == "placa" or not f or bool(f & {"bright_value_v2", "bright_value", "bright_value_1"})
