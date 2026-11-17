"""Zonas de ar: ares que obedecem juntos ao mesmo transmissor.

Por que existe: infravermelho não tem endereço. Num salão aberto, ares do MESMO modelo à vista do mesmo transmissor
recebem o mesmo sinal e mudam todos juntos (no escritório: 5 Gree iguais no transmissor A). Software nenhum separa
isso; o que o sistema faz é tratar o grupo como uma ZONA: um comando muda a zona inteira e o painel, o mapa e a Alexa
mostram a verdade. Para comandar um ar sozinho é preciso um transmissor só para ele (perto e virado para ele).

Onde ficam: config "zonas" = [{id, nome, hub_id, aparelhos: [ids], alexa_aparelho_id, origem: "teste"|"manual"}].
Transmissor sem zona salva usa a zona automática: ares com o mesmo botão Desligar (mesmo controle) no mesmo transmissor.
O teste de interferência (rota /hubs/{id}/teste-interferencia) grava a zona com o que aconteceu de verdade.
"""
import re

from . import db

CHAVE = "zonas"
TESTADOS = "zonas_testadas"   # transmissores com teste de interferência feito: o resultado real vale, sem zona automática


def _salvas() -> list[dict]:
    return [z for z in (db.cfg(CHAVE) or []) if isinstance(z, dict) and z.get("id")]


def _automaticas(salvas: list[dict]) -> list[dict]:
    from . import clima
    com_zona = {z["hub_id"] for z in salvas} | set(db.cfg(TESTADOS) or [])
    out = []
    for h in db.consultar("SELECT id, nome FROM hubs ORDER BY nome"):
        if h["id"] in com_zona:
            continue
        for i, g in enumerate(clima.grupos_juntos(h["id"])):
            out.append({"id": f"auto-{h['id'][:10]}-{i}", "nome": f"Zona {h['nome']}", "hub_id": h["id"], "aparelhos": sorted(g),
                        "alexa_aparelho_id": None, "origem": "auto"})
    return out


def listar() -> list[dict]:
    """Zonas salvas + automáticas, com os nomes dos ares (só ares que ainda existem e estão no transmissor da zona)."""
    salvas = _salvas()
    todas = salvas + _automaticas(salvas)
    ares = {a["id"]: a for a in db.consultar("SELECT id, nome, hub_id, ligado, modo, temperatura, ventilador, sinric_device_id, projeto_id FROM aparelhos")}
    out = []
    for z in todas:
        ids = [i for i in z.get("aparelhos", []) if i in ares and ares[i]["hub_id"] == z["hub_id"]]
        if len(ids) < 2:
            continue   # zona de um ar só não é zona
        out.append({**z, "aparelhos": ids, "ares": [dict(ares[i]) for i in ids]})
    return out


def de_aparelho(aparelho_id: int) -> dict | None:
    return next((z for z in listar() if aparelho_id in z["aparelhos"]), None)


def salvar(zonas: list[dict]):
    limpas = []
    for z in zonas:
        zid = re.sub(r"[^\w-]", "", str(z.get("id") or ""))[:40]
        if not zid or zid.startswith("auto-"):
            zid = f"z-{db.agora()}-{len(limpas)}"
        limpas.append({"id": zid, "nome": str(z.get("nome") or "Zona")[:40], "hub_id": str(z["hub_id"])[:40],
                       "aparelhos": sorted({int(i) for i in z.get("aparelhos", [])}),
                       "alexa_aparelho_id": int(z["alexa_aparelho_id"]) if z.get("alexa_aparelho_id") else None,
                       "origem": z.get("origem") if z.get("origem") in ("teste", "manual") else "manual"})
    db.set_cfg(CHAVE, limpas)
    return limpas


def gravar_do_teste(hub_id: str, respostas: dict[int, list[int]]) -> list[dict]:
    """respostas: {ar comandado: [ares que apitaram/mudaram]} → grupos (componentes conectados) viram as zonas do transmissor."""
    pai: dict[int, int] = {}

    def achar(x):
        pai.setdefault(x, x)
        while pai[x] != x:
            pai[x] = pai[pai[x]]; x = pai[x]
        return x

    for a, lista in respostas.items():
        achar(int(a))
        for b in lista:
            pai[achar(int(b))] = achar(int(a))
    grupos: dict[int, list[int]] = {}
    for x in list(pai):
        grupos.setdefault(achar(x), []).append(x)
    outras = [z for z in _salvas() if z["hub_id"] != hub_id]
    hub = db.um("SELECT nome FROM hubs WHERE id = ?", (hub_id,)) or {"nome": hub_id}
    antigas = {tuple(z["aparelhos"]): z for z in _salvas() if z["hub_id"] == hub_id}
    novas = []
    for i, g in enumerate(sorted(grupos.values(), key=len, reverse=True)):
        if len(g) < 2:
            continue
        g = sorted(g)
        velha = antigas.get(tuple(g), {})
        novas.append({"id": velha.get("id") or f"z-{hub_id[:8]}-{i}", "nome": velha.get("nome") or f"Zona {hub['nome']}",
                      "hub_id": hub_id, "aparelhos": g, "alexa_aparelho_id": velha.get("alexa_aparelho_id"), "origem": "teste"})
    db.set_cfg(TESTADOS, sorted(set(db.cfg(TESTADOS) or []) | {hub_id}))
    return salvar(outras + novas)


def quem_responde(aparelho_id: int, hub_id: str, chave: str, codigo: str) -> list[int]:
    """Outros ares que mudam junto quando este recebe o sinal: a zona (se houver) ou, sem teste, quem tem o mesmo código."""
    z = de_aparelho(aparelho_id)
    if z:
        return [i for i in z["aparelhos"] if i != aparelho_id]
    if hub_id in (db.cfg(TESTADOS) or []):
        return []
    return [r["aparelho_id"] for r in db.consultar(
        "SELECT c.aparelho_id FROM codigos c JOIN aparelhos a ON a.id = c.aparelho_id "
        "WHERE a.hub_id = ? AND c.aparelho_id <> ? AND c.chave = ? AND c.codigo = ?", (hub_id, aparelho_id, chave, codigo))]


def mudar_junto(aparelho_id: int, junto: bool) -> list[dict]:
    """Tira um ar da zona do transmissor dele (sala fechada, não recebe o sinal do salão) ou põe de volta. Vira zona salva
    (manual) do transmissor: a automática não volta a juntá-lo. O teste de interferência continua sendo o jeito certo."""
    a = db.um("SELECT id, hub_id FROM aparelhos WHERE id = ?", (aparelho_id,))
    if not a or not a["hub_id"]:
        raise ValueError("Este ar não tem transmissor.")
    hub = a["hub_id"]
    todas = listar()
    do_hub = [z for z in todas if z["hub_id"] == hub]
    outras = [z for z in _salvas() if z["hub_id"] != hub]
    if junto:
        if do_hub:
            alvo = do_hub[0]
            if aparelho_id not in alvo["aparelhos"]:
                alvo = {**alvo, "aparelhos": sorted(alvo["aparelhos"] + [aparelho_id])}
            do_hub = [alvo] + do_hub[1:]
        else:   # sem zona no transmissor: junta com os ares do mesmo modelo dele (mesmo Desligar)
            from . import clima
            grupo = next((g for g in clima.grupos_juntos(hub) if aparelho_id in g), [aparelho_id])
            do_hub = [{"id": "", "nome": "Zona", "hub_id": hub, "aparelhos": sorted(set(grupo) | {aparelho_id}), "alexa_aparelho_id": None}]
    else:
        do_hub = [{**z, "aparelhos": [i for i in z["aparelhos"] if i != aparelho_id]} for z in do_hub]
    novas = [{k: z.get(k) for k in ("id", "nome", "hub_id", "aparelhos", "alexa_aparelho_id")} | {"origem": "manual"} for z in do_hub]
    # transmissor sem nenhuma zona salva voltaria à automática: guarda uma zona vazia de marcador (listar ignora zona com < 2 ares)
    if not novas:
        novas = [{"id": "", "nome": "Zona", "hub_id": hub, "aparelhos": [], "alexa_aparelho_id": None, "origem": "manual"}]
    # quem conhece a sala decidiu: vale a zona salva (sem o palpite por "mesmo código" do quem_responde)
    db.set_cfg(TESTADOS, sorted(set(db.cfg(TESTADOS) or []) | {hub}))
    return salvar(outras + novas)
