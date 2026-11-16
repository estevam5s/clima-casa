"""Gera TODOS os botões de um ar Gree a partir de UM sinal gravado (o "Desligar").

Por que existe
--------------
Gravar à mão cada combinação (5 modos × 15 temperaturas × 4 ventilações = 300 botões) é inviável. O controle Gree
manda o estado completo em cada clique (modo, temperatura, ventilação, ligado/desligado) e o protocolo é conhecido.
Então basta UM sinal bom gravado do controle e este script monta os outros mudando só os bits certos, com os mesmos
tempos do sinal original (o que o ar já aceita). Foi assim que o "Ar do escritório" passou a mudar de temperatura
(16/11/2026): a gravação do "ligar" tinha vindo com defeito, o "desligar" estava perfeito, e tudo saiu dele.

Formato Gree (o que este script entende)
----------------------------------------
- Cabeçalho ~9000/4500 µs; bit 0 = marca ~650 + espaço ~570; bit 1 = marca ~650 + espaço ~1670.
- Cada quadro = bloco A (32 bits) + rodapé "010" + pausa ~20 ms + bloco B (32 bits). O controle manda 2 ou 3 quadros.
- Bytes LSB primeiro. Bloco A: byte0 = modo (bits 0-2: 0 auto, 1 frio, 2 seco, 3 ventilar, 4 quente),
  liga (bit 3), ventilação (bits 4-5: 0 auto, 1 baixa, 2 média, 3 alta); byte1 = temperatura - 16 (nibble baixo);
  byte2 = luz/turbo/etc. (fica como no controle).
- Soma de verificação (nibble alto do byte7) = (10 + nibbles baixos dos bytes 0-3 + nibbles altos dos bytes 4-6) & 15.
  O ar ignora em silêncio (nem apita) um sinal com a soma errada.
- Quadro de extensão com bytes 0 e 1 zerados: fica igual.

Uso (da pasta backend, com o .env do agente)
-------------------------------------------
  ../.venv/bin/python ../scripts/gree_gerar.py <id do aparelho>            # confere o sinal base e mostra o que faria
  ../.venv/bin/python ../scripts/gree_gerar.py <id> --gravar               # grava os 300 botões no aparelho
  ../.venv/bin/python ../scripts/gree_gerar.py <id> --testar frio 24 auto  # manda UM sinal gerado pelo transmissor do aparelho
  ../.venv/bin/python ../scripts/gree_gerar.py <id> --base frio_23_auto    # usa outro botão gravado como base

Pré-requisitos: o aparelho tem transmissor vinculado e um botão base gravado (de preferência "desligar") que FUNCIONA
(o ar apita e obedece). Se o script disser "não parece Gree", grave os botões à mão (tela do aparelho).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from tinytuya.Contrib.IRRemoteControlDevice import IRRemoteControlDevice as IR  # noqa: E402

from app import db  # noqa: E402

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


def main():
    ap = argparse.ArgumentParser(description="Gera os botões de um ar Gree a partir de um sinal gravado.")
    ap.add_argument("aparelho", type=int)
    ap.add_argument("--base", default="desligar", help="botão gravado usado como base (padrão: desligar)")
    ap.add_argument("--gravar", action="store_true", help="grava os 300 botões no aparelho")
    ap.add_argument("--testar", nargs=3, metavar=("MODO", "TEMP", "VENT"), help="manda um sinal gerado (ex.: frio 24 auto)")
    a = ap.parse_args()

    ar = db.um("SELECT id, nome, hub_id FROM aparelhos WHERE id = ?", (a.aparelho,))
    if not ar:
        sys.exit("Aparelho não encontrado.")
    linha = db.um("SELECT codigo FROM codigos WHERE aparelho_id = ? AND chave = ?", (a.aparelho, a.base))
    if not linha:
        sys.exit(f"O aparelho '{ar['nome']}' não tem o botão base '{a.base}' gravado. Grave o Desligar na tela do aparelho.")
    base = IR.base64_to_pulses(linha["codigo"])
    if not eh_gree(base):
        sys.exit(f"O sinal '{a.base}' ({len(base)} pulsos) não parece Gree (ou veio com defeito). Grave os botões à mão ou grave o base de novo.")
    a0 = quadros_gree(base)[0][0]
    print(f"{ar['nome']}: base '{a.base}' é Gree · modo {a0[0] & 7}, {'ligado' if a0[0] & 8 else 'desligado'}, "
          f"{(a0[1] & 15) + 16}°, ventilação {(a0[0] >> 4) & 3}, byte2 {a0[2]:02X} (mantido)")

    if a.testar:
        modo, temp, vent = a.testar
        p = gerar(base, True, MODOS[modo], int(temp), VENT[vent])
        if not ar["hub_id"]:
            sys.exit("O aparelho não tem transmissor vinculado.")
        from app import transmissor
        transmissor._enviar_local(transmissor.hub(ar["hub_id"]), IR.pulses_to_base64(p))
        print(f"Enviado: ligado, {modo}, {temp}°, ventilação {vent}. Confira se o ar apitou e mudou.")
        return

    total = len(MODOS) * len(TEMPS) * len(VENT)
    if not a.gravar:
        print(f"Geraria {total} botões ({len(MODOS)} modos × 16–30° × {len(VENT)} ventilações). Rode com --gravar para salvar.")
        return
    erradas = 0
    for m, mv in MODOS.items():
        for t in TEMPS:
            for v, vv in VENT.items():
                p = gerar(base, True, mv, t, vv)
                erradas += sum(1 for x, y in quadros_gree(p) if soma(x + y) != y[3] >> 4)
                db.executar("INSERT INTO codigos (aparelho_id, chave, rotulo, codigo, criado_em) VALUES (?,?,?,?,?) "
                            "ON CONFLICT (aparelho_id, chave) DO UPDATE SET codigo = excluded.codigo, criado_em = excluded.criado_em",
                            (a.aparelho, f"{m}_{t}_{v}", "gerado (Gree)", IR.pulses_to_base64(p), db.agora()))
    db.registrar("sistema", f"{total} botões gerados pelo protocolo Gree", aparelho_id=a.aparelho, detalhe=f"a partir de '{a.base}'")
    print(f"{total} botões gravados no '{ar['nome']}' · somas erradas: {erradas}")


if __name__ == "__main__":
    main()
