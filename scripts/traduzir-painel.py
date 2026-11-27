#!/usr/bin/env python3
"""Tradução antecipada do painel: cadastra os textos extraídos do código (scripts/extrair-textos-painel.mjs) e traduz o que
falta em cada idioma pela IA, em lotes paralelos. Rodar depois de mudanças grandes na interface:
    node scripts/extrair-textos-painel.mjs /tmp/textos.json && .venv/bin/python scripts/traduzir-painel.py /tmp/textos.json
Texto revisado à mão nunca é sobrescrito. Sem a chave da NVIDIA, não faz nada."""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import db, ia, idiomas  # noqa: E402

textos = [idiomas.normalizar(t) for t in json.load(open(sys.argv[1]))]
textos = [t for t in dict.fromkeys(textos) if idiomas._valido_painel(t)]
agora = db.agora()
with db.conexao() as c:
    with c.cursor() as cur:
        cur.executemany("INSERT INTO painel_textos (texto, rotas, origem, ativo, visto_em) VALUES (%s, '[]'::jsonb, 'codigo', true, %s) ON CONFLICT (texto) DO NOTHING",
                        [(t, agora) for t in textos])
print(f"{len(textos)} textos cadastrados", flush=True)


def lote(idioma, lt):
    try:
        res = ia.json_da_resposta(ia.gerar(idiomas._prompt(idioma, "painel"), json.dumps(lt, ensure_ascii=False), max_tokens=min(6000, 300 + sum(map(len, lt)) * 2), temperatura=0.1))
    except Exception as e:  # noqa: BLE001
        return 0, str(e)[:80]
    if not isinstance(res, list) or len(res) != len(lt):
        return 0, "tamanho diferente"
    boas = [(pt, idioma, idiomas.normalizar(str(tr or ""))[:2400], db.agora()) for pt, tr in zip(lt, res)
            if tr and sorted(re.findall(r"\{\d+\}", pt)) == sorted(re.findall(r"\{\d+\}", str(tr)))]
    if boas:
        with db.conexao() as c:
            with c.cursor() as cur:
                cur.executemany("INSERT INTO painel_traducoes (texto, idioma, traducao, origem, revisada, atualizado_em) VALUES (%s,%s,%s,'ia',false,%s) "
                                "ON CONFLICT (texto, idioma) DO NOTHING", boas)
    return len(boas), ""


for idioma in idiomas.TRADUZIVEIS:
    for volta in range(2):   # segunda volta pega o que falhou na primeira
        faltam = [r["texto"] for r in db.consultar("SELECT s.texto FROM painel_textos s LEFT JOIN painel_traducoes t ON t.texto = s.texto AND t.idioma = ? "
                                                   "WHERE s.ativo AND t.texto IS NULL ORDER BY length(s.texto)", (idioma,))]
        if not faltam:
            break
        lotes, atual, soma = [], [], 0
        for t in faltam:
            if atual and (soma + len(t) > 2000 or len(atual) >= 60):
                lotes.append(atual); atual, soma = [], 0
            atual.append(t); soma += len(t)
        if atual:
            lotes.append(atual)
        with ThreadPoolExecutor(6) as ex:
            feitos = sum(n for n, _ in ex.map(lambda lt: lote(idioma, lt), lotes))
        print(f"{idioma}: volta {volta + 1}, {feitos} de {len(faltam)} traduzidos em {len(lotes)} lotes", flush=True)
idiomas.subir_versao("painel")
print("pronto", flush=True)
