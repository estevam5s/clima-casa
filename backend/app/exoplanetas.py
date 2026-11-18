"""Os 200 exoplanetas confirmados mais próximos do Sol, do NASA Exoplanet Archive (tabela pscomppars, dados públicos).

A nuvem consulta o arquivo uma vez e guarda em config.exoplanetas por 7 dias. A aparência dos planetas no globo é ilustrativa;
nome, estrela, posição no céu (RA/Dec), distância, raio, massa, período, temperatura e ano da descoberta são os do arquivo.
"""
from __future__ import annotations

import httpx

from . import db

URL = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
CAMPOS = "pl_name,hostname,ra,dec,sy_dist,pl_rade,pl_bmasse,pl_orbper,pl_eqt,disc_year,discoverymethod,st_spectype,st_teff"
CHAVE = "exoplanetas"
VALIDADE = 7 * 86400


def lista(forcar: bool = False) -> dict:
    c = db.cfg(CHAVE) or {}
    if c.get("lista") and not forcar and db.agora() - int(c.get("em") or 0) < VALIDADE:
        return c
    try:
        r = httpx.get(URL, params={"query": f"select {CAMPOS} from pscomppars where sy_dist is not null and ra is not null and dec is not null", "format": "json"},
                      timeout=40, headers={"User-Agent": "clima-escritorio/1.0"})
        r.raise_for_status()
        dados = sorted((x for x in r.json() if x.get("sy_dist")), key=lambda x: x["sy_dist"])[:200]
    except (httpx.HTTPError, ValueError):
        if c.get("lista"):
            return {**c, "aviso": "Não deu para atualizar agora; mostrando a última cópia."}
        raise
    novo = {"em": db.agora(), "fonte": "NASA Exoplanet Archive (pscomppars)", "lista": dados}
    db.set_cfg(CHAVE, novo)
    return novo
