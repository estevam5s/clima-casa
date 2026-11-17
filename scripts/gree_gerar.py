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

from app.gree import MODOS, TEMPS, VENT, gerar, eh_gree, quadros_gree, soma  # noqa: E402  (lógica no módulo)


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
