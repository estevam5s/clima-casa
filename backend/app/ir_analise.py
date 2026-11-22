"""Reconhecer um sinal infravermelho gravado: qualidade, protocolo provável e (no Gree) o estado exato que ele manda.

Usado logo depois de gravar um botão (transmissor.processar_fila_uma_vez → "aprender") e na aba Botões do aparelho:
- poucos pulsos = ruído ou só a ponta do sinal (lâmpada, sol, controle longe);
- o cabeçalho (primeira marca e espaço, em µs) indica a família do controle;
- no Gree o sinal traz o estado inteiro (ligado, modo, temperatura, ventilação): o sistema confere se é o botão que a
  pessoa disse que ia gravar e, se não for (ex.: apertou a seta e o controle foi para 22° em vez de 23°), grava no
  botão certo e avisa, em vez de salvar um "Frio 23°" que na verdade liga em 22°.
"""
from __future__ import annotations

from . import gree

# (nome, marca µs, espaço µs) dos cabeçalhos mais comuns em controles de ar
CABECALHOS = [
    ("Gree / Elgin", 9000, 4500), ("LG", 8400, 4200), ("Samsung", 4500, 4500), ("Midea / Springer / Carrier", 4400, 4400),
    ("Daikin", 3500, 1700), ("Mitsubishi / Fujitsu", 3300, 1600), ("Panasonic", 3500, 1750), ("Hitachi", 3300, 1700),
    ("Electrolux / Philco", 6000, 7500), ("Komeco / TCL", 3000, 1600),
]


def _protocolo(p: list[int]) -> tuple[str, float]:
    if len(p) < 2:
        return "desconhecido", 0
    marca, espaco = p[0], p[1]
    melhor, nota = "desconhecido", 0.0
    for nome, m, e in CABECALHOS:
        erro = abs(marca - m) / m + abs(espaco - e) / e
        conf = max(0.0, 1 - erro)
        if conf > nota:
            melhor, nota = nome, conf
    return (melhor, round(nota, 2)) if nota >= 0.6 else ("desconhecido", round(nota, 2))


def analisar(codigo_b64: str, chave: str | None = None) -> dict:
    try:
        p = gree.pulsos(codigo_b64)
    except Exception:  # noqa: BLE001
        return {"ok": False, "motivo": "Código ilegível."}
    n = len(p)
    duracao = round(sum(p) / 1000)
    res: dict = {"ok": n >= 60, "pulsos": n, "duracao_ms": duracao}
    if n < 60:
        res["motivo"] = f"Só {n} pulsos: parece ruído ou a ponta do sinal. Aproxime o controle (5 a 10 cm) e aperte firme uma vez."
    nome, conf = _protocolo(p)
    res["protocolo"], res["confianca"] = nome, conf
    if gree.eh_gree(p):
        res["protocolo"], res["confianca"] = "Gree", 1.0
        try:
            d = gree.descrever(p)
            res["estado"] = d
            if chave:
                res.update(_conferir(chave, d))
        except Exception:  # noqa: BLE001
            pass
    return res


def _conferir(chave: str, d: dict) -> dict:
    """Compara o estado lido do sinal Gree com o botão escolhido. Devolve confere/chave_certa/aviso."""
    if chave == "desligar":
        if d["ligado"]:
            return {"confere": False, "aviso": f"O sinal liga o ar ({d['modo']} {d['temperatura']}°): para o Desligar, aperte o botão de ligar/desligar com o ar LIGADO no controle."}
        return {"confere": True}
    if chave.startswith("extra_"):
        return {}
    partes = chave.split("_")
    if len(partes) != 3:
        return {}
    modo, temp, vent = partes[0], int(partes[1]), partes[2]
    if not d["ligado"]:
        return {"confere": False, "aviso": "O sinal desliga o ar: grave este ajuste com o controle LIGADO."}
    certa = f"{d['modo']}_{d['temperatura']}_{d['ventilacao'] or vent}"
    if (d["modo"], d["temperatura"], d["ventilacao"] or vent) == (modo, temp, vent):
        return {"confere": True}
    return {"confere": False, "chave_certa": certa,
            "aviso": f"O controle mandou {d['modo']} {d['temperatura']}° (ventilação {d['ventilacao'] or '?'}), não {modo} {temp}° ({vent})."}
