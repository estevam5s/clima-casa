"""Biblioteca de avatares 3D (GLB) para o mapa do escritório.

O dono importa personagens que tem autorização para usar (origem e licença ficam registradas). Fluxo:
1. `preparar_envio` cria um registro "enviando" e um endereço assinado de envio direto ao Storage privado do Supabase
   (bucket `avatares`): o arquivo não passa pela Vercel (limite de 4,5 MB por pedido).
2. O navegador envia o GLB direto para lá.
3. `confirmar` baixa só o começo do arquivo (cabeçalho + bloco JSON do glTF), confere que é GLB 2.0, recusa recursos
   externos (buffers/imagens por URL), lê animações, malhas, esqueleto e morph targets (expressões) e marca como pronto.
Ler o modelo: `endereco` devolve um link assinado de 10 min. Nada é publicado nem redistribuído.
"""
from __future__ import annotations

import json
import re
import secrets
import struct

import httpx

from . import db

BUCKET = "avatares"
LIMITE_BYTES = 30 * 1024 * 1024
# nomes de animação que o mapa usa, e palavras que costumam aparecer nos clips (Mixamo, Blender, exportações de jogos)
ANIMACOES = {
    "idle": ("idle", "parado", "stand", "breath"), "walking": ("walk", "andar", "andando"), "running": ("run", "correr", "jog"),
    "talking": ("talk", "falar", "conversa"), "waving": ("wave", "acenar", "aceno"), "greeting": ("greet", "hello", "cumpriment"),
    "thinking": ("think", "pensar"), "happy": ("happy", "feliz", "cheer"), "sad": ("sad", "triste"), "surprised": ("surpris", "surpres"),
    "pointing": ("point", "apontar"), "listening": ("listen", "ouvir"), "sitting": ("sit", "sentar", "sentado", "seat"),
    "typing": ("typing", "type", "digitar"), "drinking": ("drink", "beber", "coffee", "cafe"),
}
EXPRESSOES = {"neutral": ("neutral", "neutro"), "happy": ("happy", "smile", "feliz", "sorr"), "sad": ("sad", "triste"), "angry": ("angry", "raiva", "brav"),
              "surprised": ("surpris", "surpres"), "confused": ("confus",), "thinking": ("think", "pens")}


def _cab():
    k = db.ENV["SUPABASE_SECRET_KEY"]
    return {"apikey": k, "Authorization": f"Bearer {k}"}


def garantir_bucket():
    url = db.ENV["SUPABASE_URL"]
    r = httpx.get(f"{url}/storage/v1/bucket/{BUCKET}", headers=_cab(), timeout=10)
    if r.status_code == 200:
        return
    httpx.post(f"{url}/storage/v1/bucket", headers=_cab(), timeout=10,
               json={"id": BUCKET, "name": BUCKET, "public": False, "file_size_limit": LIMITE_BYTES, "allowed_mime_types": ["model/gltf-binary", "application/octet-stream"]})


def listar() -> list[dict]:
    return db.consultar("SELECT id, nome, descricao, origem, licenca, estado, tamanho, info, criado_em, especie, escala_real, parametros IS NOT NULL AS editavel, "
                        "ajustes, arquivo_original IS NOT NULL AS editado FROM avatares ORDER BY criado_em DESC")


ESPECIES = ("pessoa", "cao", "gato", "animal", "veiculo", "outro")


def receita(aid: int) -> dict | None:
    a = db.um("SELECT parametros FROM avatares WHERE id = ?", (aid,))
    return a["parametros"] if a else None


def editar(aid: int, d: dict) -> dict:
    campos = {k: v for k, v in d.items() if k in ("nome", "descricao", "origem", "licenca", "especie") and v is not None}
    if not campos:
        raise ValueError("Nada para mudar.")
    if "especie" in campos and campos["especie"] not in ESPECIES:
        raise ValueError("Espécie inválida.")
    sets = ", ".join(f"{k} = ?" for k in campos)   # chaves de uma lista fechada
    db.executar(f"UPDATE avatares SET {sets} WHERE id = ?", (*campos.values(), aid))  # nosec B608
    return db.um("SELECT id, nome, descricao, origem, licenca, estado, tamanho, info, criado_em, especie, escala_real FROM avatares WHERE id = ?", (aid,))


def preparar_envio(nome: str, descricao: str, origem: str, licenca: str, tamanho: int, autor: str,
                   especie: str = "pessoa", parametros: dict | None = None, escala_real: bool = False, substituir: int | None = None) -> dict:
    if tamanho <= 0 or tamanho > LIMITE_BYTES:
        raise ValueError(f"O arquivo precisa ter até {LIMITE_BYTES // 1024 // 1024} MB.")
    garantir_bucket()
    caminho = f"{secrets.token_hex(8)}.glb"
    if especie not in ESPECIES:
        raise ValueError("Espécie inválida.")
    if parametros is not None and len(json.dumps(parametros)) > 400_000:
        raise ValueError("A receita do modelo passou de 400 KB.")
    aid = db.um("INSERT INTO avatares (nome, descricao, origem, licenca, arquivo, tamanho, estado, criado_em, criado_por, especie, parametros, escala_real) "
                "VALUES (?,?,?,?,?,?, 'enviando', ?, ?, ?, CAST(? AS jsonb), ?) RETURNING id",
                (nome, descricao, origem, licenca, caminho, tamanho, db.agora(), autor, especie, json.dumps(parametros) if parametros is not None else None, 1 if escala_real else 0))["id"]
    url = db.ENV["SUPABASE_URL"]
    r = httpx.post(f"{url}/storage/v1/object/upload/sign/{BUCKET}/{caminho}", headers=_cab(), timeout=10, json={})
    if r.status_code >= 300:
        db.executar("DELETE FROM avatares WHERE id = ?", (aid,))
        raise RuntimeError("O Storage não gerou o endereço de envio. Tente de novo.")
    rel = r.json().get("url") or ""
    return {"id": aid, "upload_url": f"{url}/storage/v1{rel}"}


def _ler_json_glb(caminho: str) -> tuple[dict, int]:
    """Baixa só o começo do arquivo (Range) e devolve o JSON do glTF + o tamanho declarado."""
    url = db.ENV["SUPABASE_URL"]
    r = httpx.get(f"{url}/storage/v1/object/{BUCKET}/{caminho}", headers={**_cab(), "Range": "bytes=0-20"}, timeout=20)
    cab = r.content[:20]
    if len(cab) < 20 or cab[:4] != b"glTF":
        raise ValueError("Não é um arquivo GLB (glTF binário). Exporte do Blender como .glb.")
    versao, total = struct.unpack("<II", cab[4:12])
    tam_json, tipo = struct.unpack("<II", cab[12:20])
    if versao != 2 or tipo != 0x4E4F534A:   # 'JSON'
        raise ValueError("GLB fora do padrão 2.0.")
    if tam_json > 8 * 1024 * 1024:
        raise ValueError("Bloco de descrição grande demais.")
    r = httpx.get(f"{url}/storage/v1/object/{BUCKET}/{caminho}", headers={**_cab(), "Range": f"bytes=20-{19 + tam_json}"}, timeout=30)
    return json.loads(r.content.decode("utf-8")), total


def _classificar(nomes: list[str], tabela: dict) -> dict:
    saida = {}
    for chave, palavras in tabela.items():
        achado = next((n for n in nomes if any(p in n.lower() for p in palavras)), None)
        saida[chave] = achado
    return saida


def confirmar(aid: int) -> dict:
    a = db.um("SELECT * FROM avatares WHERE id = ?", (aid,))
    if not a:
        raise KeyError("Avatar não encontrado.")
    try:
        g, total = _ler_json_glb(a["arquivo"])
        externos = [b.get("uri") for b in g.get("buffers", []) + g.get("images", []) if b.get("uri") and not str(b.get("uri")).startswith("data:")]
        if externos:
            raise ValueError("O modelo aponta para arquivos externos (texturas ou buffers fora do .glb). Exporte tudo embutido num .glb só.")
        req = g.get("extensionsRequired", [])
        if any(e in ("KHR_draco_mesh_compression", "EXT_meshopt_compression") for e in req):
            raise ValueError("O modelo está comprimido (Draco/Meshopt). Exporte do Blender sem compressão.")
        if any(re.search(r"^(KHR_|EXT_)", e or "") is None for e in req):
            raise ValueError(f"Extensões obrigatórias desconhecidas: {', '.join(req)}.")
        clips = [an.get("name") or f"clip {i + 1}" for i, an in enumerate(g.get("animations", []))]
        morphs = []
        for m in g.get("meshes", []):
            nomes = (m.get("extras") or {}).get("targetNames") or []
            morphs += [n for n in nomes if n not in morphs]
        info = {"versao": g.get("asset", {}).get("version"), "gerador": (g.get("asset", {}).get("generator") or "")[:80],
                "malhas": len(g.get("meshes", [])), "materiais": len(g.get("materials", [])), "texturas": len(g.get("textures", [])),
                "esqueleto": bool(g.get("skins")), "ossos": sum(len(s.get("joints", [])) for s in g.get("skins", [])),
                "clips": clips[:80], "animacoes": _classificar(clips, ANIMACOES), "morphs": morphs[:120], "expressoes": _classificar(morphs, EXPRESSOES),
                "tamanho_declarado": total}
        db.executar("UPDATE avatares SET estado = 'pronto', info = CAST(? AS jsonb) WHERE id = ?", (json.dumps(info), aid))
        db.registrar("painel", f"Avatar 3D importado: {a['nome']}", detalhe=f"{len(clips)} animação(ões) · {a['licenca'][:60]}")
        return {**a, "estado": "pronto", "info": info}
    except Exception as e:
        apagar(aid)
        raise ValueError(str(e)) from e


def meta(aid: int) -> dict:
    return db.um("SELECT especie, escala_real FROM avatares WHERE id = ?", (aid,)) or {}


def endereco(aid: int) -> str:
    a = db.um("SELECT arquivo FROM avatares WHERE id = ? AND estado = 'pronto'", (aid,))
    if not a:
        raise KeyError("Avatar não encontrado.")
    url = db.ENV["SUPABASE_URL"]
    r = httpx.post(f"{url}/storage/v1/object/sign/{BUCKET}/{a['arquivo']}", headers=_cab(), timeout=10, json={"expiresIn": 600})
    if r.status_code >= 300:
        raise RuntimeError("Não deu para abrir o arquivo do avatar.")
    return f"{url}/storage/v1{r.json().get('signedURL') or r.json().get('signedUrl')}"


def apagar(aid: int):
    a = db.um("SELECT arquivo, arquivo_original, arquivo_novo FROM avatares WHERE id = ?", (aid,))
    if not a:
        return
    try:
        httpx.request("DELETE", f"{db.ENV['SUPABASE_URL']}/storage/v1/object/{BUCKET}", headers=_cab(), timeout=10,
                      json={"prefixes": [x for x in (a["arquivo"], a["arquivo_original"], a["arquivo_novo"]) if x]})
    except httpx.HTTPError:
        pass
    db.executar("DELETE FROM avatares WHERE id = ?", (aid,))


# ---------------- versão editada (editor de aparência) ----------------
def _assinar_envio(caminho: str) -> str:
    url = db.ENV["SUPABASE_URL"]
    r = httpx.post(f"{url}/storage/v1/object/upload/sign/{BUCKET}/{caminho}", headers=_cab(), timeout=10, json={})
    if r.status_code >= 300:
        raise RuntimeError("O Storage não gerou o endereço de envio. Tente de novo.")
    return f"{url}/storage/v1{r.json().get('url') or ''}"


def _apagar_arquivo(caminho: str | None):
    if not caminho:
        return
    try:
        httpx.request("DELETE", f"{db.ENV['SUPABASE_URL']}/storage/v1/object/{BUCKET}", headers=_cab(), timeout=10, json={"prefixes": [caminho]})
    except httpx.HTTPError:
        pass


def preparar_versao(aid: int, tamanho: int, ajustes: dict) -> dict:
    """O navegador exporta o .glb editado e envia direto ao Storage; o original fica guardado para restaurar."""
    a = db.um("SELECT id, arquivo_novo FROM avatares WHERE id = ? AND estado = 'pronto'", (aid,))
    if not a:
        raise KeyError("Avatar não encontrado.")
    if tamanho <= 0 or tamanho > LIMITE_BYTES:
        raise ValueError(f"O arquivo precisa ter até {LIMITE_BYTES // 1024 // 1024} MB.")
    if len(json.dumps(ajustes)) > 200_000:
        raise ValueError("Ajustes grandes demais.")
    _apagar_arquivo(a["arquivo_novo"])   # envio anterior que não foi confirmado
    caminho = f"{secrets.token_hex(8)}.glb"
    db.executar("UPDATE avatares SET arquivo_novo = ? WHERE id = ?", (caminho, aid))
    return {"upload_url": _assinar_envio(caminho)}


def confirmar_versao(aid: int, ajustes: dict) -> dict:
    a = db.um("SELECT * FROM avatares WHERE id = ?", (aid,))
    if not a or not a["arquivo_novo"]:
        raise KeyError("Nenhuma versão enviada para confirmar.")
    try:
        g, total = _ler_json_glb(a["arquivo_novo"])
    except Exception as e:
        _apagar_arquivo(a["arquivo_novo"]); db.executar("UPDATE avatares SET arquivo_novo = NULL WHERE id = ?", (aid,))
        raise ValueError(f"A versão editada não é um .glb válido: {e}") from e
    original = a["arquivo_original"] or a["arquivo"]
    if a["arquivo_original"]:
        _apagar_arquivo(a["arquivo"])   # versão editada anterior (o original nunca é apagado aqui)
    info = {**(a["info"] or {}), "malhas": len(g.get("meshes", [])), "materiais": len(g.get("materials", [])), "tamanho_declarado": total}
    db.executar("UPDATE avatares SET arquivo = ?, arquivo_original = ?, arquivo_novo = NULL, ajustes = CAST(? AS jsonb), tamanho = ?, info = CAST(? AS jsonb) WHERE id = ?",
                (a["arquivo_novo"], original, json.dumps(ajustes), total, json.dumps(info), aid))
    db.registrar("painel", f"Avatar 3D editado no editor: {a['nome']}")
    return {"ok": True}


def restaurar(aid: int) -> dict:
    a = db.um("SELECT * FROM avatares WHERE id = ?", (aid,))
    if not a or not a["arquivo_original"]:
        raise KeyError("Este avatar não tem versão editada.")
    _apagar_arquivo(a["arquivo"])
    db.executar("UPDATE avatares SET arquivo = arquivo_original, arquivo_original = NULL, ajustes = NULL WHERE id = ?", (aid,))
    db.registrar("painel", f"Avatar 3D voltou ao original: {a['nome']}")
    return {"ok": True}


def endereco_original(aid: int) -> str:
    a = db.um("SELECT COALESCE(arquivo_original, arquivo) AS arq FROM avatares WHERE id = ? AND estado = 'pronto'", (aid,))
    if not a:
        raise KeyError("Avatar não encontrado.")
    url = db.ENV["SUPABASE_URL"]
    r = httpx.post(f"{url}/storage/v1/object/sign/{BUCKET}/{a['arq']}", headers=_cab(), timeout=10, json={"expiresIn": 600})
    if r.status_code >= 300:
        raise RuntimeError("Não deu para abrir o arquivo do avatar.")
    return f"{url}/storage/v1{r.json().get('signedURL') or r.json().get('signedUrl')}"
