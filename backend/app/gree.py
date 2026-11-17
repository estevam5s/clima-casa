"""Protocolo Gree: monta qualquer botão de um ar Gree a partir de UM sinal gravado (de preferência o "Desligar").

O controle Gree manda o estado completo em cada clique. Copiamos o sinal base e trocamos só os bits de ligar, modo,
temperatura e ventilação, recalculando a soma de verificação (o ar ignora em silêncio um sinal com a soma errada).
Detalhes do formato e uso pela linha de comando: scripts/gree_gerar.py. Pela tela: Aparelho → Botões → "Gerar pelo
protocolo Gree" (rota POST /api/aparelhos/{id}/gree).
"""
from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice as IR

MODOS = {"auto": 0, "frio": 1, "seco": 2, "ventilar": 3, "quente": 4}   # chaves = nomes do sistema (clima.py)
VENT = {"auto": 0, "baixa": 1, "media": 2, "alta": 3}
TEMPS = range(16, 31)


def mapa(p: list[int]) -> list[list[list[int]]]:
    """Quadros → blocos → índices dos ESPAÇOS de cada bit (o espaço é o que diz se o bit é 0 ou 1)."""
    quadros, atual, bloco = [], None, None
    for i in range(0, len(p) - 1, 2):
        marca, espaco = p[i], p[i + 1]
        if marca > 6000:                       # cabeçalho: começa um quadro
            bloco = []; atual = [bloco]; quadros.append(atual); continue
        if atual is None:
            continue
        if espaco > 10000:                     # pausa entre o bloco A e o bloco B
            bloco = []; atual.append(bloco); continue
        bloco.append(i + 1)
    return quadros


def ler(p: list[int], idx: list[int]) -> list[int]:
    bits = [1 if p[j] > 1100 else 0 for j in idx[:32]]
    return [int("".join(map(str, bits[k:k + 8]))[::-1], 2) for k in range(0, 32, 8)]


def soma(b: list[int]) -> int:
    return (10 + sum(x & 15 for x in b[:4]) + sum(x >> 4 for x in b[4:7])) & 15


def quadros_gree(p: list[int]) -> list[tuple[list[int], list[int]]]:
    """Blocos A e B de cada quadro com dados (ignora o de extensão). Vazio = não é Gree."""
    out = []
    for q in mapa(p):
        if len(q) < 2 or len(q[0]) < 32 or len(q[1]) < 32:
            continue
        a, b = ler(p, q[0]), ler(p, q[1])
        if a[0] == 0 and a[1] == 0:
            continue
        out.append((a, b))
    return out


def eh_gree(p: list[int]) -> bool:
    qs = quadros_gree(p)
    return bool(qs) and all(soma(a + b) == b[3] >> 4 for a, b in qs)


def gerar(base: list[int], ligar=True, modo=None, temp=None, vent=None) -> list[int]:
    """Copia o sinal base trocando só os bits necessários; recalcula a soma de cada quadro."""
    p = list(base)
    espacos = [p[j] for q in mapa(p) for bl in q for j in bl]
    curto = round(sum(x for x in espacos if x < 1100) / max(1, sum(1 for x in espacos if x < 1100)))
    longo = round(sum(x for x in espacos if 1100 < x < 3000) / max(1, sum(1 for x in espacos if 1100 < x < 3000)))

    def escrever(idx, b4):
        for k in range(32):
            quer = (b4[k // 8] >> (k % 8)) & 1
            if quer != (1 if p[idx[k]] > 1100 else 0):   # só mexe no bit que mudou: o resto fica com o tempo original
                p[idx[k]] = longo if quer else curto

    for q in mapa(p):
        if len(q) < 2 or len(q[0]) < 32 or len(q[1]) < 32:
            continue
        a, b = ler(p, q[0]), ler(p, q[1])
        if a[0] == 0 and a[1] == 0:
            continue
        if ligar is not None:
            a[0] = (a[0] | 8) if ligar else (a[0] & ~8)
        if modo is not None:
            a[0] = (a[0] & ~7) | modo
        if vent is not None:
            a[0] = (a[0] & ~0x30) | (vent << 4)
        if temp is not None:
            a[1] = (a[1] & 0xF0) | (temp - 16)
        b[3] = (b[3] & 15) | (soma(a + b) << 4)
        escrever(q[0], a); escrever(q[1], b)
    return p


def pulsos(codigo_b64: str) -> list[int]:
    return IR.base64_to_pulses(codigo_b64)


def codigo(p: list[int]) -> str:
    return IR.pulses_to_base64(p)


def descrever(p: list[int]) -> dict:
    """Estado lido do primeiro quadro (para mostrar na tela)."""
    a = quadros_gree(p)[0][0]
    modos_inv = {v: k for k, v in MODOS.items()}
    vent_inv = {v: k for k, v in VENT.items()}
    return {"modo": modos_inv.get(a[0] & 7, str(a[0] & 7)), "ligado": bool(a[0] & 8), "temperatura": (a[1] & 15) + 16,
            "ventilacao": vent_inv.get((a[0] >> 4) & 3), "byte2": f"{a[2]:02X}"}


def todos(base: list[int]):
    """(chave, código) dos 300 botões: 5 modos × 16–30° × 4 ventilações, todos ligados."""
    for m, mv in MODOS.items():
        for t in TEMPS:
            for v, vv in VENT.items():
                yield f"{m}_{t}_{v}", codigo(gerar(base, True, mv, t, vv))
