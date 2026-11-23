"""Rotas do assistente de IA: conversar, confirmar ação em lote e configuração (só o dono)."""
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import db, ia
from ..seguranca import exigir_login

rotas_ia = APIRouter(prefix="/api/ia", dependencies=[Depends(exigir_login)])


class MensagemIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=4000)


class ConversaIn(BaseModel):
    mensagens: list[MensagemIn] = Field(min_length=1, max_length=60)
    conversa_id: int | None = None      # com id, a conversa fica salva (lista à esquerda em /ia)
    modelo: str | None = Field(None, max_length=80)
    leitura: bool = False               # modo plano (terminal): só consulta, nenhuma ferramenta que muda algo
    estilo: str | None = Field(None, pattern="^(normal|conciso|explicativo|formal)$")
    pensar: bool = False                # raciocínio estendido ("Pensar mais")
    imagens: list[str] = Field(default_factory=list, max_length=2)   # data:image/… (prints, foto do controle)


class ConversaEditIn(BaseModel):
    titulo: str | None = Field(None, min_length=1, max_length=120)
    fixada: bool | None = None


class ConfirmarIn(BaseModel):
    confirmacao: str = Field(min_length=8, max_length=64)


class ConfigIn(BaseModel):
    api_key: str | None = Field(None, max_length=200)
    modelo: str | None = Field(None, max_length=80)
    ativo: bool | None = None
    telegram: bool | None = None


def _erro(e: Exception):
    if isinstance(e, PermissionError):
        raise HTTPException(403 if "permissão" in str(e) or "não é sua" in str(e) else 429, str(e))
    raise HTTPException(424, str(e))


@rotas_ia.get("/estado")
def estado():
    return ia.estado_publico() | {"terminal": {"instalar": "curl -fsSL https://app.zynio.com.br/instalar-ia.sh | bash",
                                              "instalar_windows": "irm https://app.zynio.com.br/instalar-ia.ps1 | iex",
                                              "comando": "clima-ia", "login": "clima-ia login"}}


class CompararIn(BaseModel):
    pergunta: str = Field(min_length=2, max_length=2000)
    modelos: list[str] = Field(min_length=2, max_length=3)


@rotas_ia.post("/comparar")
def comparar(d: CompararIn):
    """A mesma pergunta para 2 ou 3 modelos, lado a lado (só texto: nenhum deles age nos ares)."""
    try:
        return {"respostas": ia.comparar(d.pergunta, d.modelos)}
    except (PermissionError, RuntimeError) as e:
        _erro(e)


@rotas_ia.get("/modelos/saude")
def saude_modelos(forcar: bool = False):
    try:
        return ia.saude_modelos(forcar)
    except RuntimeError as e:
        _erro(e)


@rotas_ia.post("/conversar")
def conversar(d: ConversaIn):
    if d.mensagens[-1].role != "user":
        raise HTTPException(400, "A última mensagem precisa ser a sua pergunta.")
    try:
        r = ia.conversar([m.model_dump() for m in d.mensagens], "painel", modelo=d.modelo, leitura=d.leitura, estilo=d.estilo, pensar=d.pensar, imagens=d.imagens)
    except (PermissionError, RuntimeError) as e:
        _erro(e)
    # salva a conversa (nova ou existente) com a resposta; o título nasce da primeira pergunta
    uid = _uid()
    msgs = [m.model_dump() for m in d.mensagens] + [{"role": "assistant", "content": r["texto"], "acoes": r.get("acoes") or [], "modelo": r.get("modelo")}]
    agora = db.agora()
    if d.conversa_id and db.um("SELECT 1 AS ok FROM ia_conversas WHERE id = ? AND usuario_id = ?", (d.conversa_id, uid)):
        db.executar("UPDATE ia_conversas SET mensagens = CAST(? AS jsonb), atualizado_em = ? WHERE id = ?", (json.dumps(msgs[-80:], ensure_ascii=False), agora, d.conversa_id))
        r["conversa_id"] = d.conversa_id
    else:
        titulo = " ".join(d.mensagens[0].content.split())[:60] or "Nova conversa"
        r["conversa_id"] = db.um("INSERT INTO ia_conversas (usuario_id, titulo, mensagens, criado_em, atualizado_em) VALUES (?,?,CAST(? AS jsonb),?,?) RETURNING id",
                                 (uid, titulo, json.dumps(msgs[-80:], ensure_ascii=False), agora, agora))["id"]
        r["titulo"] = titulo
    return r


def _uid() -> str:
    from .. import acesso
    return str((acesso.atual.get() or {}).get("id") or "")


class AudioIn(BaseModel):
    audio: str = Field(min_length=100, max_length=3_000_000)   # base64 do WAV (até ~90 s em 16 kHz mono)
    formato: str = Field("wav", pattern="^(wav|mp3)$")


@rotas_ia.post("/transcrever")
def transcrever(d: AudioIn):
    """Mensagem de voz: o áudio gravado no navegador vira texto (a IA responde ao texto)."""
    from .. import ia_uso
    u = ia._u()
    ia_uso.checar(u)
    ia._limite(str(u.get("id") or "anon"))
    try:
        return {"texto": ia.transcrever(d.audio, d.formato)}
    except RuntimeError as e:
        _erro(e)


class PrefIn(BaseModel):
    estilo: str | None = Field(None, pattern="^(normal|conciso|explicativo|formal)$")
    instrucoes: str | None = Field(None, max_length=1500)
    pensar: bool | None = None
    voz: bool | None = None


@rotas_ia.get("/preferencias")
def ver_preferencias():
    return ia.preferencias(_uid())


@rotas_ia.put("/preferencias")
def mudar_preferencias(d: PrefIn):
    from .. import defesa
    if d.instrucoes and defesa.prompt_injection(d.instrucoes):
        raise HTTPException(400, "As instruções tentam mudar as regras do assistente. Escreva só como você quer as respostas.")
    return ia.salvar_preferencias(_uid(), d.model_dump())


class FeedbackIn(BaseModel):
    conteudo: str = Field(min_length=1, max_length=4000)   # o começo da resposta avaliada (acha a mensagem na conversa)
    valor: int = Field(ge=-1, le=1)
    motivo: str = Field("", max_length=300)


@rotas_ia.put("/conversas/{cid}/feedback")
def feedback(cid: int, d: FeedbackIn):
    """Gostei / não gostei de uma resposta (fica na conversa e na Atividade, para o dono ver o que melhorar)."""
    uid = _uid()
    c = db.um("SELECT mensagens FROM ia_conversas WHERE id = ? AND usuario_id = ?", (cid, uid))
    if not c:
        raise HTTPException(404, "Conversa não encontrada.")
    msgs = c["mensagens"] if isinstance(c["mensagens"], list) else json.loads(c["mensagens"] or "[]")
    alvo = next((m for m in reversed(msgs) if m.get("role") == "assistant" and str(m.get("content", "")).startswith(d.conteudo[:200])), None)
    if not alvo:
        raise HTTPException(404, "Resposta não encontrada nesta conversa.")
    alvo["feedback"] = d.valor
    if d.motivo:
        alvo["feedback_motivo"] = d.motivo
    db.executar("UPDATE ia_conversas SET mensagens = CAST(? AS jsonb) WHERE id = ?", (json.dumps(msgs, ensure_ascii=False), cid))
    if d.valor:
        db.registrar("ia", f"Resposta da IA avaliada: {'boa' if d.valor > 0 else 'ruim'}", ok=d.valor > 0, detalhe=d.motivo[:200])
    return {"ok": True}


@rotas_ia.get("/conversas")
def conversas(q: str = ""):
    sql, p = "SELECT id, titulo, fixada, atualizado_em FROM ia_conversas WHERE usuario_id = ?", [_uid()]
    if q.strip():
        sql += " AND (titulo ILIKE ? OR mensagens::text ILIKE ?)"; p += [f"%{q.strip()[:80]}%"] * 2
    return db.consultar(sql + " ORDER BY fixada DESC, atualizado_em DESC LIMIT 200", tuple(p))


@rotas_ia.get("/conversas/{cid}")
def conversa(cid: int):
    c = db.um("SELECT id, titulo, fixada, mensagens, atualizado_em FROM ia_conversas WHERE id = ? AND usuario_id = ?", (cid, _uid()))
    if not c:
        raise HTTPException(404, "Conversa não encontrada.")
    return c


@rotas_ia.put("/conversas/{cid}")
def editar_conversa(cid: int, d: ConversaEditIn):
    conversa(cid)
    if d.titulo is not None:
        db.executar("UPDATE ia_conversas SET titulo = ? WHERE id = ?", (d.titulo.strip(), cid))
    if d.fixada is not None:
        db.executar("UPDATE ia_conversas SET fixada = ? WHERE id = ?", (d.fixada, cid))
    return conversa(cid)


@rotas_ia.delete("/conversas/{cid}")
def apagar_conversa(cid: int):
    conversa(cid)
    db.executar("DELETE FROM ia_conversas WHERE id = ?", (cid,))
    return {"ok": True}


@rotas_ia.post("/confirmar")
def confirmar(d: ConfirmarIn):
    try:
        return ia.confirmar(d.confirmacao, "ia")
    except (PermissionError, RuntimeError, ValueError) as e:
        _erro(e)


@rotas_ia.put("/config")
def config(d: ConfigIn, request: Request):
    u = getattr(request.state, "u", None) or {}
    if u.get("papel") != "dono":
        raise HTTPException(403, "Só o dono configura o assistente de IA.")
    try:
        ia.salvar(d.api_key, d.modelo, d.ativo, d.telegram)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return ia.estado_publico()


# ---------------- limites de uso (sessão de 5 h e semana, como no Claude) ----------------
class LimitePessoaIn(BaseModel):
    sessao: int | None = Field(None, ge=1000, le=100_000_000)
    semana: int | None = Field(None, ge=1000, le=1_000_000_000)
    ilimitado: bool = False


class LimitesIn(BaseModel):
    sessao: int | None = Field(None, ge=1000, le=100_000_000)
    semana: int | None = Field(None, ge=1000, le=1_000_000_000)
    dono_ilimitado: bool | None = None
    usuarios: dict[str, LimitePessoaIn] | None = None


@rotas_ia.get("/uso")
def uso(request: Request):
    """O seu uso (todos). O dono também recebe a configuração e o uso de cada pessoa."""
    from .. import acesso, ia_uso
    u = acesso.atual.get() or getattr(request.state, "u", None) or {}
    r = {"meu": ia_uso.status(u), "janelas": {"sessao_h": 5, "semana_d": 7}}
    if u.get("papel") == "dono":
        r["config"] = ia_uso.config()
        r["pessoas"] = ia_uso.por_pessoa()
    return r


@rotas_ia.put("/limites")
def limites(d: LimitesIn, request: Request):
    u = getattr(request.state, "u", None) or {}
    if u.get("papel") != "dono":
        raise HTTPException(403, "Só o dono define os limites de uso da IA.")
    if d.sessao and d.semana and d.sessao > d.semana:
        raise HTTPException(400, "O limite da sessão de 5 horas não pode ser maior que o da semana.")
    from .. import ia_uso
    pessoas = {k: v.model_dump(exclude_none=True) for k, v in d.usuarios.items()} if d.usuarios is not None else None
    return ia_uso.salvar(d.sessao, d.semana, d.dono_ilimitado, pessoas)
