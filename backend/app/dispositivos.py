"""Aparelhos do escritório além dos ares: cafeteira, persianas e a fechadura da porta do escritório.

Hardware (Tuya / Smart Life, a mesma conta já conectada para os transmissores):
- cafeteira: TOMADA INTELIGENTE (categoria cz/pc/kg). A cafeteira de cápsulas não tem rede: o sistema liga e desliga a
  energia (pré-aquece e desliga sozinha); a cápsula e o botão de passar o café continuam na mão de alguém.
- persiana: MOTOR DE CORTINA/PERSIANA (categoria cl/clkg): abrir, fechar, parar e posição em %.
- fechadura: FECHADURA Wi-Fi (categoria ms/jtmspro…): estado, bateria e sensor de porta; trancar/destrancar pela internet
  só se o modelo aceitar comando remoto (muitos não aceitam: a tela diz).

Os comandos vão pela nuvem Tuya (POST /v1.1/m/thing/{id}/commands com os códigos-padrão de cada categoria), então
funcionam da Vercel também, sem depender do agente. O estado é lido da nuvem (status) no ciclo do agente (~1 min).
Nada é inventado: sem aparelho pareado, o item existe, mas a tela mostra "sem aparelho conectado" e nada é enviado.
"""
from __future__ import annotations

import datetime
import json
import logging

from . import db

log = logging.getLogger("clima.dispositivos")
TIPOS = ("cafeteira", "persiana", "fechadura")
CATEGORIAS = {"cafeteira": {"cz", "pc", "kg", "tdq"}, "persiana": {"cl", "clkg"}, "fechadura": {"ms", "jtmspro", "jtmsbh", "videolock", "bxx", "gyms"}}
PADRAO_CONFIG = {
    "cafeteira": {"agendas": [], "desligar_apos_min": 45, "capsulas": 0, "capsulas_alerta": 5, "potencia_w": 1500},
    "persiana": {"agendas": [], "sol_forte": {"ativo": False, "temp_min": 27, "posicao": 30, "das": "10:00", "ate": "16:00"}},
    "fechadura": {"auto_trancar_min": 0, "alertar_fora_expediente": True, "expediente": ["07:00", "19:00"]},
}


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
    d["conectado"] = bool(d.get("tuya_id"))
    d["resumo"] = resumo(d)
    return d


def listar(tipo: str | None = None, filtro_sql: str = "", params: tuple = ()) -> list[dict]:
    w, p = (" WHERE d.tipo = ?", (tipo,)) if tipo else (" WHERE true", ())
    linhas = db.consultar(f"SELECT d.*, pr.nome AS projeto_nome FROM dispositivos d LEFT JOIN projetos pr ON pr.id = d.projeto_id{w}{filtro_sql} ORDER BY d.tipo, pr.nome, d.nome", p + params)
    return [_linha(x) for x in linhas]


def um(did: int) -> dict:
    d = db.um("SELECT d.*, pr.nome AS projeto_nome FROM dispositivos d LEFT JOIN projetos pr ON pr.id = d.projeto_id WHERE d.id = ?", (did,))
    if not d:
        raise KeyError("Aparelho não encontrado.")
    return _linha(d)


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
    if not d["tuya_id"]:
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


def comando(did: int, acao: str, valor=None, origem: str = "painel") -> dict:
    d = um(did)
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
            "destrancar": "Destrancou", "posicao": f"Posição {valor}%"}.get(acao, acao)


# ---------------- importar da conta Smart Life ----------------
def disponiveis() -> list[dict]:
    from . import tuya_nuvem
    ja = {r["tuya_id"] for r in db.consultar("SELECT tuya_id FROM dispositivos WHERE tuya_id IS NOT NULL")}
    saida = []
    for a in tuya_nuvem.listar_aparelhos():
        tipo = next((t for t, cats in CATEGORIAS.items() if a["categoria"] in cats), None)
        if tipo:
            saida.append({**a, "tipo": tipo, "ja_cadastrado": a["id"] in ja})
    return saida


def conectar(did: int, tuya_id: str) -> dict:
    from . import tuya_nuvem
    d = um(did)
    info = next((a for a in tuya_nuvem.listar_aparelhos() if a["id"] == tuya_id), None)
    if not info:
        raise KeyError("Aparelho não está na conta Smart Life conectada.")
    if info["categoria"] not in CATEGORIAS[d["tipo"]]:
        raise ValueError(f"Esse aparelho ({info['produto'] or info['categoria']}) não é do tipo {d['tipo']}.")
    det = tuya_nuvem.detalhes(tuya_id)
    db.executar("UPDATE dispositivos SET tuya_id = ?, categoria = ?, produto = ?, funcoes = CAST(? AS jsonb), online = ? WHERE id = ?",
                (tuya_id, info["categoria"], info.get("produto") or "", json.dumps(det.get("funcoes") or []), 1 if info["online"] else 0, did))
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
        if not d["tuya_id"]:
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
                lim = int(cfg.get("desligar_apos_min") or 0)
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
