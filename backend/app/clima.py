"""Modelo do ar-condicionado: estado desejado → código IR gravado.

Controle de ar-condicionado manda o estado inteiro a cada toque, então cada combinação
(modo + temperatura + ventilação) é um código. A chave do código é "modo_temp_vent"
(ex.: frio_23_auto) e "desligar". Botões extras (swing, turbo...) usam "extra_<nome>".
"""
from . import db, transmissor

MODOS = {"frio": "Frio", "quente": "Quente", "ventilar": "Ventilar", "seco": "Desumidificar", "auto": "Automático"}
VENTILACAO = {"auto": "Automática", "baixa": "Baixa", "media": "Média", "alta": "Alta"}


def chave_estado(modo, temp, vent):
    return f"{modo}_{int(temp)}_{vent}"


def rotulo_chave(chave: str) -> str:
    if chave == "desligar":
        return "Desligar"
    if chave.startswith("extra_"):
        return chave[6:].replace("_", " ").capitalize()
    partes = chave.split("_")
    if len(partes) == 3 and partes[0] in MODOS:
        return f"{MODOS[partes[0]]} {partes[1]}° · ventilação {VENTILACAO.get(partes[2], partes[2]).lower()}"
    return chave


def validar_chave(chave: str):
    if chave == "desligar":
        return
    if chave.startswith("extra_") and len(chave) > 6 and all(c.isalnum() or c == "_" for c in chave):
        return
    partes = chave.split("_")
    if len(partes) == 3 and partes[0] in MODOS and partes[1].isdigit() and partes[2] in VENTILACAO:
        return
    raise ValueError("Botão inválido.")


def aparelho(aparelho_id: int) -> dict:
    a = db.um("SELECT * FROM aparelhos WHERE id = ?", (aparelho_id,))
    if not a:
        raise KeyError("Aparelho não encontrado.")
    return a


def codigos(aparelho_id: int) -> dict[str, str]:
    return {r["chave"]: r["codigo"] for r in db.consultar(
        "SELECT chave, codigo FROM codigos WHERE aparelho_id = ?", (aparelho_id,))}


def escolher_codigo(cods: dict, modo, temp, vent):
    """Exato → mesma temp/modo com outra ventilação → temperatura mais próxima no mesmo modo."""
    exato = chave_estado(modo, temp, vent)
    if exato in cods:
        return exato, False
    mesmo = [k for k in cods if k.startswith(f"{modo}_{int(temp)}_")]
    if mesmo:
        return sorted(mesmo)[0], True
    candidatos = []
    for k in cods:
        p = k.split("_")
        if len(p) == 3 and p[0] == modo and p[1].isdigit():
            candidatos.append((abs(int(p[1]) - int(temp)), p[2] != vent, k))
    if candidatos:
        return sorted(candidatos)[0][2], True
    return None, False


def aplicar(aparelho_id: int, origem: str, ligado=None, modo=None, temperatura=None, ventilador=None,
            notificar_sinric=True) -> dict:
    """Muda o estado do ar e dispara o código correspondente. Retorna o novo estado."""
    a = aparelho(aparelho_id)
    if not a["hub_id"]:
        raise RuntimeError("Este aparelho não tem transmissor vinculado.")
    novo = {
        "ligado": a["ligado"] if ligado is None else int(bool(ligado)),
        "modo": modo or a["modo"],
        "temperatura": int(temperatura if temperatura is not None else a["temperatura"]),
        "ventilador": ventilador or a["ventilador"],
    }
    if novo["modo"] not in MODOS:
        raise ValueError("Modo inválido.")
    if novo["ventilador"] not in VENTILACAO:
        raise ValueError("Ventilação inválida.")
    novo["temperatura"] = max(a["temp_min"], min(a["temp_max"], novo["temperatura"]))

    cods = codigos(aparelho_id)
    if novo["ligado"]:
        chave, aproximado = escolher_codigo(cods, novo["modo"], novo["temperatura"], novo["ventilador"])
        if not chave:
            msg = (f"Nenhum botão gravado para o modo {MODOS[novo['modo']].lower()}. "
                   "Grave pelo menos uma temperatura nesse modo.")
            db.registrar(origem, f"Ligar: {MODOS[novo['modo']]} {novo['temperatura']}°", ok=False, aparelho_id=aparelho_id, detalhe=msg)
            raise RuntimeError(msg)
        if aproximado:  # o estado real passa a ser o do código enviado
            m, t, v = chave.split("_")
            novo.update(modo=m, temperatura=int(t), ventilador=v)
        descricao = f"Ligar: {rotulo_chave(chave)}"
    else:
        chave = "desligar"
        if chave not in cods:
            db.registrar(origem, "Desligar", ok=False, aparelho_id=aparelho_id, detalhe="Botão 'Desligar' ainda não foi gravado.")
            raise RuntimeError("Botão 'Desligar' ainda não foi gravado.")
        descricao = "Desligar"

    contexto = {"aparelho": {**a, **novo}} if notificar_sinric and a.get("sinric_device_id") else None
    try:
        via = transmissor.enviar(a["hub_id"], cods[chave], contexto)
    except Exception as e:
        db.registrar(origem, descricao, ok=False, aparelho_id=aparelho_id, detalhe=str(e))
        raise RuntimeError(str(e))
    db.executar(
        "UPDATE aparelhos SET ligado = ?, modo = ?, temperatura = ?, ventilador = ?, atualizado_em = ?, "
        "ligado_desde = CASE WHEN ? = 1 THEN coalesce(CASE WHEN ligado = 1 THEN ligado_desde END, ?) END WHERE id = ?",
        (novo["ligado"], novo["modo"], novo["temperatura"], novo["ventilador"], db.agora(), novo["ligado"], db.agora(),
         aparelho_id),
    )
    db.registrar(origem, descricao, aparelho_id=aparelho_id, detalhe=f"via {via}")
    return {**aparelho(aparelho_id), "via": via}


def enviar_extra(aparelho_id: int, chave: str, origem: str) -> str:
    a = aparelho(aparelho_id)
    cods = codigos(aparelho_id)
    if chave not in cods:
        raise KeyError("Botão não gravado.")
    if not a["hub_id"]:
        raise RuntimeError("Este aparelho não tem transmissor vinculado.")
    try:
        via = transmissor.enviar(a["hub_id"], cods[chave])
    except Exception as e:
        db.registrar(origem, rotulo_chave(chave), ok=False, aparelho_id=aparelho_id, detalhe=str(e))
        raise RuntimeError(str(e))
    db.registrar(origem, rotulo_chave(chave), aparelho_id=aparelho_id, detalhe=f"via {via}")
    return via
