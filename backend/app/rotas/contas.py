"""Usuários do sistema (criar, editar, papéis, permissões, projetos), troca de senha obrigatória,
Google Authenticator (remoção pelo admin) e passkeys (biometria: Face ID, digital, Windows Hello).

Criar/alterar contas usa a API admin do Supabase Auth com SUPABASE_SECRET_KEY (só no servidor).
"""
import base64
import json
import secrets
import string
import time
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import acesso, db
from ..seguranca import exigir_login, tem_totp

contas = APIRouter(prefix="/api", dependencies=[Depends(exigir_login)])
publico_contas = APIRouter(prefix="/api")


# ---------------- Supabase Auth (admin) ----------------
def _admin(metodo: str, caminho: str, **kw):
    chave = db.ENV.get("SUPABASE_SECRET_KEY")
    if not chave:
        raise HTTPException(503, "Falta a chave SUPABASE_SECRET_KEY no servidor para gerenciar contas.")
    r = httpx.request(metodo, f"{db.ENV['SUPABASE_URL']}/auth/v1{caminho}", timeout=15,
                      headers={"apikey": chave, "Authorization": f"Bearer {chave}"}, **kw)
    if r.status_code >= 400:
        try:
            msg = r.json().get("msg") or r.json().get("message") or r.json().get("error_description") or r.text
        except Exception:  # noqa: BLE001
            msg = r.text
        traducoes = {"already been registered": "Já existe uma conta com esse e-mail.", "Password should be at least": "A senha é curta demais.",
                     "weak": "Senha fraca: use letras, números e símbolos.", "Unable to validate email": "E-mail inválido."}
        for k, v in traducoes.items():
            if k.lower() in str(msg).lower():
                msg = v
        raise HTTPException(400, f"Supabase: {msg}")
    return r.json() if r.content else {}


def _gerar_senha(n=14):
    alfabeto = string.ascii_letters + string.digits + "!@#$%&*?"
    while True:
        s = "".join(secrets.choice(alfabeto) for _ in range(n))
        if any(c.islower() for c in s) and any(c.isupper() for c in s) and any(c.isdigit() for c in s) and any(c in "!@#$%&*?" for c in s):
            return s


def _nivel(papel):
    return acesso.PAPEIS.get(papel, {}).get("nivel", 0)


def _pode_atribuir_papel(ator: dict, papel: str) -> bool:
    if papel == "dono":
        return False
    if ator["papel"] in ("dono", "admin"):
        return True
    return _nivel(papel) < _nivel(ator["papel"])


def _pode_mexer_em(ator: dict, alvo: dict) -> bool:
    if alvo["papel"] == "dono":
        return ator["id"] == alvo["id"]
    if ator["papel"] in ("dono", "admin"):
        return True
    if _nivel(alvo["papel"]) >= _nivel(ator["papel"]):
        return False
    # Quem não é admin só mexe em conta que não tem nada além do que ele tem: senão, trocando a senha ou tirando o 2FA,
    # ele entraria como a outra pessoa e ganharia permissões ou projetos que não tem (a mesma regra de quem dá permissão).
    if not set(acesso._json(alvo.get("permissoes"), [])) <= set(ator["permissoes"]):
        return False
    pa = acesso._json(alvo.get("projetos"), "*")
    if ator["projetos"] != "*" and (pa == "*" or not set(pa) <= set(ator["projetos"])):
        return False
    return True


def _carregar_alvo(uid: str) -> dict:
    u = db.um("SELECT * FROM usuarios WHERE id = ?", (uid,))
    if not u:
        raise HTTPException(404, "Usuário não encontrado.")
    u["id"] = str(u["id"])
    u["permissoes"] = acesso._json(u["permissoes"], [])
    u["projetos"] = acesso._json(u["projetos"], "*")
    return u


def _validar_permissoes(ator: dict, perms: list[str]) -> list[str]:
    perms = [p for p in dict.fromkeys(perms) if p in acesso.PERMISSOES]
    sobrando = [p for p in perms if p not in ator["permissoes"]]
    if sobrando:
        raise HTTPException(403, "Você não pode dar permissões que você mesmo não tem.")
    return perms


def _resolver_projetos(ator: dict, modo: str, ids: list[int], nome_novo: str):
    if modo == "todos":
        if ator["projetos"] != "*":
            raise HTTPException(403, "Você só pode dar acesso aos projetos que você vê.")
        return "*"
    if modo == "zero":
        nome = (nome_novo or "").strip() or "Novo projeto"
        pid = db.executar("INSERT INTO projetos (nome, descricao, endereco, cor, criado_em) VALUES (?,?,?,?,?)",
                          (nome[:60], "Criado junto com um usuário (começou do zero)", "", "#0f766a", db.agora()))
        if ator["projetos"] != "*":
            db.executar("UPDATE usuarios SET projetos = CAST(? AS jsonb) WHERE id = ?", (json.dumps([*ator["projetos"], pid]), ator["id"]))
        return [pid]
    ids = sorted({int(i) for i in ids})
    if not ids:
        raise HTTPException(400, "Escolha ao menos um projeto, ou comece do zero.")
    if ator["projetos"] != "*" and not set(ids) <= set(ator["projetos"]):
        raise HTTPException(403, "Você só pode dar acesso aos projetos que você vê.")
    existentes = {p["id"] for p in db.consultar(f"SELECT id FROM projetos WHERE id IN ({','.join('?' * len(ids))})", ids)}
    if existentes != set(ids):
        raise HTTPException(400, "Algum projeto escolhido não existe mais.")
    return ids


def _publico(u: dict, auth: dict | None = None, passkeys: int = 0) -> dict:
    return {**{k: u.get(k) for k in ("id", "email", "nome", "cargo", "papel", "ativo", "exige_troca_senha", "criado_em", "ultimo_acesso", "avatar")},
            "permissoes": acesso.TODAS if u["papel"] in ("dono", "admin") else acesso._json(u["permissoes"], []),
            "projetos": "*" if u["papel"] in ("dono", "admin") else acesso._json(u["projetos"], "*"),
            "papel_rotulo": acesso.PAPEIS.get(u["papel"], {}).get("rotulo", u["papel"]),
            "totp": bool(auth and tem_totp(auth)), "ultimo_login": (auth or {}).get("last_sign_in_at"),
            "email_confirmado": bool((auth or {}).get("email_confirmed_at")), "passkeys": passkeys,
            "google": next((i.get("identity_data", {}).get("email") or "conectada" for i in (auth or {}).get("identities") or [] if i.get("provider") == "google"), None)}


# ---------------- usuários ----------------
@contas.get("/usuarios")
def listar_usuarios(request: Request):
    ator = request.state.u
    linhas = db.consultar("SELECT * FROM usuarios ORDER BY criado_em")
    try:
        auth = {a["id"]: a for a in _admin("GET", "/admin/users", params={"per_page": 500}).get("users", [])}
    except HTTPException:
        auth = {}
    pk = {str(r["usuario_id"]): r["n"] for r in db.consultar("SELECT usuario_id, count(*) AS n FROM passkeys GROUP BY usuario_id")}
    itens = []
    for u in linhas:
        u["id"] = str(u["id"])
        if ator["projetos"] != "*":   # quem tem acesso limitado só vê usuários dentro dos seus projetos
            pu = acesso._json(u["projetos"], "*")
            if pu == "*" or not set(pu) <= set(ator["projetos"]):
                if u["id"] != ator["id"]:
                    continue
        p = _publico(u, auth.get(u["id"]), pk.get(u["id"], 0))
        p["pode_editar"] = _pode_mexer_em(ator, u) and str(u["id"]) != ator["id"]
        itens.append(p)
    return {"itens": itens, "papeis": [{"id": k, **v} for k, v in acesso.PAPEIS.items()],
            "permissoes": [{"id": k, "grupo": g, "descricao": d} for k, (g, d) in acesso.PERMISSOES.items()],
            "projetos": db.consultar("SELECT id, nome FROM projetos ORDER BY nome"),
            "eu": {"id": ator["id"], "papel": ator["papel"], "permissoes": ator["permissoes"], "projetos": ator["projetos"]},
            "papeis_permitidos": [k for k in acesso.PAPEIS if _pode_atribuir_papel(ator, k)]}


class UsuarioIn(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    cargo: str = Field("", max_length=80)
    papel: str
    permissoes: list[str] = Field(default_factory=list, max_length=40)
    acesso: str = Field("escolher", pattern="^(todos|escolher|zero)$")
    projetos: list[int] = Field(default_factory=list, max_length=200)
    projeto_novo: str = Field("", max_length=60)
    senha: str | None = Field(None, max_length=200)
    gerar_senha: bool = True
    convite: bool = False
    exige_troca_senha: bool = True


@contas.post("/usuarios")
def criar_usuario(d: UsuarioIn, request: Request):
    ator = request.state.u
    if d.papel not in acesso.PAPEIS or not _pode_atribuir_papel(ator, d.papel):
        raise HTTPException(403, "Você não pode criar um usuário com esse papel.")
    perms = acesso.TODAS if d.papel in ("dono", "admin") else _validar_permissoes(ator, d.permissoes or acesso.PAPEIS[d.papel]["permissoes"])
    email = d.email.strip().lower()
    if db.um("SELECT 1 FROM usuarios WHERE lower(email) = ?", (email,)):
        raise HTTPException(409, "Já existe um usuário com esse e-mail.")
    senha = None
    from .. import correio
    link_convite = None
    if d.convite and correio.configurado() and correio.dominio_verificado() and correio.automatico("boas_vindas"):
        # convite com o e-mail da marca: o Supabase só gera o link e o Resend envia
        r_ = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/admin/generate_link", timeout=12, headers={"apikey": db.ENV["SUPABASE_SECRET_KEY"], "Authorization": f"Bearer {db.ENV['SUPABASE_SECRET_KEY']}"},
                        json={"type": "invite", "email": email, "data": {"nome": d.nome.strip()}, "redirect_to": "https://app.zynio.com.br/redefinir-senha"})
        if r_.status_code < 300:
            auth = r_.json(); link_convite = auth.get("action_link") or (auth.get("properties") or {}).get("action_link")
        else:
            auth = _admin("POST", "/invite", json={"email": email, "data": {"nome": d.nome.strip()}})
    elif d.convite:
        auth = _admin("POST", "/invite", json={"email": email, "data": {"nome": d.nome.strip()}})
    else:
        senha = d.senha if (d.senha and not d.gerar_senha) else _gerar_senha()
        if len(senha) < 8:
            raise HTTPException(400, "A senha precisa ter pelo menos 8 caracteres.")
        auth = _admin("POST", "/admin/users", json={"email": email, "password": senha, "email_confirm": True,
                                                     "user_metadata": {"nome": d.nome.strip()}, "app_metadata": {"papel": d.papel}})
    uid = auth.get("id") or (auth.get("user") or {}).get("id")
    try:
        projetos = "*" if d.papel in ("dono", "admin") else _resolver_projetos(ator, d.acesso, d.projetos, d.projeto_novo or f"Projeto de {d.nome.strip()}")
        db.executar("INSERT INTO usuarios (id, email, nome, cargo, papel, permissoes, projetos, ativo, exige_troca_senha, criado_em, criado_por) "
                    "VALUES (?,?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb),true,?,?,?)",
                    (uid, email, d.nome.strip(), d.cargo.strip(), d.papel, json.dumps(perms), json.dumps(projetos),
                     bool(d.exige_troca_senha and not d.convite), db.agora(), ator["id"]))
    except Exception:
        _admin("DELETE", f"/admin/users/{uid}")   # não deixa conta órfã no Supabase
        raise
    db.registrar("painel", f"Usuário criado: {email}", detalhe=f"papel {acesso.PAPEIS[d.papel]['rotulo']} · por {ator['email']}")
    try:   # boas-vindas: link para a pessoa criar a própria senha (a senha temporária nunca vai por e-mail)
        if correio.dominio_verificado():
            link = link_convite or correio.link_auth("recovery", email, "https://app.zynio.com.br/redefinir-senha")
            if link:
                correio.enviar_quieto(email, "boas_vindas", {"nome": d.nome.strip(), "email": email, "link": link, "papel": acesso.PAPEIS[d.papel]["rotulo"], "convidado_por": ator.get("nome") or ator["email"]})
    except Exception:  # noqa: BLE001
        pass
    return {"id": uid, "senha": senha, "convite": d.convite}


class UsuarioEdit(BaseModel):
    nome: str = Field(min_length=1, max_length=80)
    cargo: str = Field("", max_length=80)
    papel: str
    permissoes: list[str] = Field(default_factory=list, max_length=40)
    acesso: str = Field("escolher", pattern="^(todos|escolher|zero)$")
    projetos: list[int] = Field(default_factory=list, max_length=200)
    projeto_novo: str = Field("", max_length=60)
    ativo: bool = True
    exige_troca_senha: bool = False


@contas.put("/usuarios/{uid}")
def editar_usuario(uid: str, d: UsuarioEdit, request: Request):
    ator = request.state.u
    alvo = _carregar_alvo(uid)
    eu = str(alvo["id"]) == ator["id"]
    if not eu and not _pode_mexer_em(ator, alvo):
        raise HTTPException(403, "Você não pode alterar esse usuário.")
    if eu and (d.papel != alvo["papel"] or not d.ativo):
        raise HTTPException(400, "Você não pode mudar o próprio papel nem se desativar.")
    if alvo["papel"] == "dono" and (d.papel != "dono" or not d.ativo):
        raise HTTPException(400, "O dono não pode ser rebaixado nem desativado.")
    if d.papel not in acesso.PAPEIS:
        raise HTTPException(400, "Papel desconhecido.")
    if d.papel != alvo["papel"] and not _pode_atribuir_papel(ator, d.papel):
        raise HTTPException(403, "Você não pode dar esse papel.")
    if eu or alvo["papel"] == "dono":
        perms, projetos = alvo["permissoes"], alvo["projetos"]
    else:
        perms = acesso.TODAS if d.papel in ("dono", "admin") else _validar_permissoes(ator, d.permissoes)
        projetos = "*" if d.papel in ("dono", "admin") else _resolver_projetos(ator, d.acesso, d.projetos, d.projeto_novo or f"Projeto de {d.nome.strip()}")
    db.executar("UPDATE usuarios SET nome = ?, cargo = ?, papel = ?, permissoes = CAST(? AS jsonb), projetos = CAST(? AS jsonb), ativo = ?, "
                "exige_troca_senha = ? WHERE id = ?",
                (d.nome.strip(), d.cargo.strip(), d.papel, json.dumps(perms), json.dumps(projetos), d.ativo, d.exige_troca_senha, uid))
    if not d.ativo:
        from .. import seguranca
        seguranca._cache.clear()
    db.registrar("painel", f"Usuário alterado: {alvo['email']}", detalhe=f"papel {d.papel} · ativo {d.ativo} · por {ator['email']}")
    return {"ok": True}


class SenhaAdminIn(BaseModel):
    senha: str | None = Field(None, max_length=200)
    gerar: bool = True
    exige_troca_senha: bool = True


@contas.post("/usuarios/{uid}/senha")
def redefinir_senha_usuario(uid: str, d: SenhaAdminIn, request: Request):
    ator = request.state.u
    alvo = _carregar_alvo(uid)
    if str(alvo["id"]) == ator["id"] or not _pode_mexer_em(ator, alvo):
        raise HTTPException(403, "Use a aba Perfil para trocar a sua senha.")
    senha = d.senha if (d.senha and not d.gerar) else _gerar_senha()
    if len(senha) < 8:
        raise HTTPException(400, "A senha precisa ter pelo menos 8 caracteres.")
    _admin("PUT", f"/admin/users/{uid}", json={"password": senha})
    db.executar("UPDATE usuarios SET exige_troca_senha = ? WHERE id = ?", (d.exige_troca_senha, uid))
    db.registrar("painel", f"Senha redefinida: {alvo['email']}", detalhe=f"por {ator['email']}")
    try:
        from .. import correio
        if correio.dominio_verificado():
            link = correio.link_auth("recovery", alvo["email"], "https://app.zynio.com.br/redefinir-senha")
            correio.enviar_quieto(alvo["email"], "senha_redefinida", {"nome": alvo.get("nome"), "email": alvo["email"], "por": ator.get("nome") or ator["email"], "link": link})
    except Exception:  # noqa: BLE001
        pass
    return {"senha": senha}


@contas.delete("/usuarios/{uid}/2fa")
def remover_2fa_usuario(uid: str, request: Request):
    """Para quem perdeu o celular: remove os fatores TOTP da conta (a pessoa cadastra de novo)."""
    ator = request.state.u
    alvo = _carregar_alvo(uid)
    if str(alvo["id"]) != ator["id"] and not _pode_mexer_em(ator, alvo):
        raise HTTPException(403, "Você não pode alterar esse usuário.")
    fatores = _admin("GET", f"/admin/users/{uid}/factors")
    for f in fatores if isinstance(fatores, list) else fatores.get("factors", []):
        _admin("DELETE", f"/admin/users/{uid}/factors/{f['id']}")
    db.registrar("painel", f"Verificação em duas etapas removida: {alvo['email']}", detalhe=f"por {ator['email']}")
    return {"ok": True}


@contas.delete("/usuarios/{uid}")
def apagar_usuario(uid: str, request: Request):
    ator = request.state.u
    alvo = _carregar_alvo(uid)
    if str(alvo["id"]) == ator["id"]:
        raise HTTPException(400, "Você não pode apagar a própria conta por aqui.")
    if alvo["papel"] == "dono" or not _pode_mexer_em(ator, alvo):
        raise HTTPException(403, "Você não pode apagar esse usuário.")
    _admin("DELETE", f"/admin/users/{uid}")
    db.executar("DELETE FROM usuarios WHERE id = ?", (uid,))
    db.registrar("painel", f"Usuário apagado: {alvo['email']}", detalhe=f"por {ator['email']}")
    return {"ok": True}


@contas.get("/conta/sessoes")
def minhas_sessoes(request: Request):
    from .. import sessoes
    from ..seguranca import _claims
    atual = _claims(request.headers.get("authorization", "")[7:]).get("session_id", "")
    return sessoes.listar(request.state.u["id"], atual)


class RevogarIn(BaseModel):
    id: str | None = Field(None, min_length=8, max_length=8, pattern=r"^[0-9a-f-]{8}$")
    todas_menos_esta: bool = False


@contas.post("/conta/sessoes/encerrar")
def encerrar_sessoes(d: RevogarIn, request: Request):
    from .. import sessoes
    from ..seguranca import _claims
    atual = _claims(request.headers.get("authorization", "")[7:]).get("session_id", "")
    if not d.id and not d.todas_menos_esta:
        raise HTTPException(400, "Escolha uma sessão.")
    if d.id and atual.startswith(d.id):
        raise HTTPException(400, "Para sair desta sessão, use Sair.")
    n = sessoes.revogar(request.state.u["id"], d.id, exceto=atual)
    db.registrar("painel", "Sessões encerradas à distância", detalhe=f"{request.state.u['email']}: {n}")
    return {"encerradas": n}


@contas.post("/usuarios/{uid}/sessoes/encerrar")
def encerrar_sessoes_usuario(uid: str, request: Request):
    """Administrador derruba todas as sessões de alguém (ex.: celular perdido, desligamento)."""
    from .. import sessoes
    ator = request.state.u
    alvo = _carregar_alvo(uid)
    if str(alvo["id"]) != ator["id"] and not _pode_mexer_em(ator, alvo):
        raise HTTPException(403, "Você não pode alterar esse usuário.")
    n = sessoes.revogar(uid)
    db.registrar("painel", f"Todas as sessões encerradas: {alvo['email']}", detalhe=f"por {ator['email']} ({n})")
    return {"encerradas": n}


class ConferirSenhaIn(BaseModel):
    senha: str = Field(min_length=1, max_length=200)
    turnstile: str | None = Field(None, max_length=4096)


@contas.post("/conta/conferir-senha")
def conferir_senha(d: ConferirSenhaIn, request: Request):
    """Confere a senha atual (antes de trocar e-mail ou senha) sem trocar a sessão do navegador. A sessão que o Supabase
    abre para conferir é encerrada na hora. Com o CAPTCHA ligado no Supabase, o token do formulário vai junto."""
    import httpx
    from .. import firewall, turnstile
    u = request.state.u
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("senha_atual_errada",), 15) >= 5:
        raise HTTPException(429, "Muitas tentativas. Espere 15 minutos.")
    if turnstile.no_supabase() and not d.turnstile:
        raise HTTPException(400, "Confirme que você não é um robô (verificação da Cloudflare) e tente de novo.")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/token?grant_type=password", timeout=12,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]}, json={"email": u["email"], "password": d.senha, **turnstile.corpo_supabase(d.turnstile)})
    dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 and turnstile.recusado_pelo_captcha(dados):
        raise HTTPException(400, "A verificação contra robôs falhou ou expirou. Tente de novo.")
    if r.status_code != 200 or not dados.get("access_token"):
        firewall.registrar(ip, "senha_atual_errada", "/api/conta/conferir-senha", u["email"][:3] + "…")
        raise HTTPException(400, "Senha atual incorreta.")
    try:   # a sessão aberta só para conferir não fica viva
        httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/logout?scope=local", timeout=8,
                   headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"], "Authorization": f"Bearer {dados['access_token']}"})
    except httpx.HTTPError:
        pass
    return {"ok": True}


@contas.post("/conta/senha-trocada")
def senha_trocada(request: Request):
    u = request.state.u
    db.executar("UPDATE usuarios SET exige_troca_senha = false WHERE id = ?", (u["id"],))
    try:   # senha nova derruba as outras sessões (quem tinha a senha antiga não continua dentro)
        from .. import sessoes
        from ..seguranca import _claims
        atual = _claims(request.headers.get("authorization", "")[7:]).get("session_id", "")
        if atual:
            n = sessoes.revogar(u["id"], exceto=atual)
            if n:
                db.registrar("painel", "Outras sessões encerradas após troca de senha", detalhe=f"{u['email']}: {n}")
    except Exception:  # noqa: BLE001
        pass
    try:   # aviso de segurança para o dono da conta
        from .. import correio
        correio.enviar_quieto(u["email"], "senha_alterada", {**correio.contexto(request), "nome": u.get("nome"), "email": u["email"]})
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


# ---------------- passkeys (WebAuthn) ----------------
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _de_b64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _rp(request: Request) -> tuple[str, str]:
    """ID do site (domínio) e origem esperada, a partir do host da requisição."""
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost").split(",")[0].strip()
    nome = host.split(":")[0]
    esquema = "http" if nome in ("localhost", "127.0.0.1") else "https"
    rp_id = "zynio.com.br" if nome == "zynio.com.br" or nome.endswith(".zynio.com.br") else nome
    return rp_id, f"{esquema}://{host}"


def _guardar_desafio(tipo: str, desafio: bytes, usuario_id=None) -> str:
    did = uuid.uuid4().hex
    db.executar("DELETE FROM webauthn_desafios WHERE expira_em < ?", (db.agora(),))
    db.executar("INSERT INTO webauthn_desafios (id, usuario_id, tipo, desafio, expira_em) VALUES (?,?,?,?,?)",
                (did, usuario_id, tipo, _b64(desafio), db.agora() + 300))
    return did


def _usar_desafio(did: str, tipo: str) -> dict:
    d = db.um("SELECT * FROM webauthn_desafios WHERE id = ? AND tipo = ? AND expira_em > ?", (did, tipo, db.agora()))
    db.executar("DELETE FROM webauthn_desafios WHERE id = ?", (did,))
    if not d:
        raise HTTPException(400, "O pedido de biometria expirou. Tente de novo.")
    return d


@contas.get("/conta/passkeys")
def listar_passkeys(request: Request):
    return db.consultar("SELECT id, nome, criado_em, ultimo_uso, transportes, aaguid FROM passkeys WHERE usuario_id = ? ORDER BY criado_em",
                        (request.state.u["id"],))


@contas.post("/conta/passkeys/opcoes")
def opcoes_registro(request: Request):
    from webauthn import generate_registration_options, options_to_json
    from webauthn.helpers.structs import AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor, ResidentKeyRequirement, UserVerificationRequirement
    u = request.state.u
    rp_id, _ = _rp(request)
    existentes = db.consultar("SELECT credencial_id FROM passkeys WHERE usuario_id = ?", (u["id"],))
    opcoes = generate_registration_options(
        rp_id=rp_id, rp_name="Clima Escritório", user_id=uuid.UUID(u["id"]).bytes, user_name=u["email"], user_display_name=u["nome"] or u["email"],
        authenticator_selection=AuthenticatorSelectionCriteria(resident_key=ResidentKeyRequirement.REQUIRED, user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=_de_b64(e["credencial_id"])) for e in existentes], timeout=120000)
    did = _guardar_desafio("registro", opcoes.challenge, u["id"])
    return {"desafio_id": did, "opcoes": json.loads(options_to_json(opcoes))}


class RegistroIn(BaseModel):
    desafio_id: str = Field(max_length=64)
    credencial: dict
    nome: str = Field("", max_length=60)


@contas.post("/conta/passkeys")
def registrar_passkey(d: RegistroIn, request: Request):
    from webauthn import verify_registration_response
    u = request.state.u
    desafio = _usar_desafio(d.desafio_id, "registro")
    if str(desafio["usuario_id"]) != u["id"]:
        raise HTTPException(400, "Pedido de biometria de outra conta.")
    rp_id, origem = _rp(request)
    try:
        v = verify_registration_response(credential=d.credencial, expected_challenge=_de_b64(desafio["desafio"]), expected_rp_id=rp_id,
                                         expected_origin=origem, require_user_verification=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Não foi possível confirmar a biometria: {e}")
    transportes = (d.credencial.get("response") or {}).get("transports") or []
    db.executar("INSERT INTO passkeys (usuario_id, credencial_id, chave_publica, contador, transportes, nome, aaguid, criado_em) "
                "VALUES (?,?,?,?,CAST(? AS jsonb),?,?,?)",
                (u["id"], _b64(v.credential_id), _b64(v.credential_public_key), v.sign_count, json.dumps(transportes),
                 d.nome.strip() or "Chave de acesso", str(v.aaguid), db.agora()))
    db.registrar("painel", "Biometria cadastrada", detalhe=f"{u['email']} · {d.nome.strip() or 'Chave de acesso'}")
    return {"ok": True}


class NomeIn(BaseModel):
    nome: str = Field(min_length=1, max_length=60)


@contas.put("/conta/passkeys/{pid}")
def renomear_passkey(pid: int, d: NomeIn, request: Request):
    db.executar("UPDATE passkeys SET nome = ? WHERE id = ? AND usuario_id = ?", (d.nome.strip(), pid, request.state.u["id"]))
    return {"ok": True}


@contas.delete("/conta/passkeys/{pid}")
def apagar_passkey(pid: int, request: Request):
    db.executar("DELETE FROM passkeys WHERE id = ? AND usuario_id = ?", (pid, request.state.u["id"]))
    db.registrar("painel", "Biometria removida", detalhe=request.state.u["email"])
    return {"ok": True}


@publico_contas.post("/auth/passkey/opcoes")
def opcoes_login(request: Request):
    from webauthn import generate_authentication_options, options_to_json
    from webauthn.helpers.structs import UserVerificationRequirement
    rp_id, _ = _rp(request)
    opcoes = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED, timeout=120000)
    did = _guardar_desafio("login", opcoes.challenge)
    return {"desafio_id": did, "opcoes": json.loads(options_to_json(opcoes))}


class LoginPasskeyIn(BaseModel):
    desafio_id: str = Field(max_length=64)
    credencial: dict


@publico_contas.post("/auth/passkey/entrar")
def entrar_com_passkey(d: LoginPasskeyIn, request: Request):
    """Confere a assinatura da biometria e abre uma sessão do Supabase para a conta (link mágico emitido no servidor)."""
    from webauthn import verify_authentication_response
    from .. import firewall
    ip = firewall.ip_do_pedido(request)
    if firewall.falhas_recentes(ip, ("login_falhou",), 15) >= 10:
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos.")
    desafio = _usar_desafio(d.desafio_id, "login")
    cid = d.credencial.get("id") or d.credencial.get("rawId") or ""
    pk = db.um("SELECT * FROM passkeys WHERE credencial_id = ?", (cid,))
    if not pk:
        firewall.registrar(ip, "login_falhou", "/api/auth/passkey/entrar", "passkey desconhecida")
        raise HTTPException(401, "Essa biometria não está cadastrada no sistema. Entre com a senha e cadastre em Configurações → Segurança.")
    rp_id, origem = _rp(request)
    try:
        v = verify_authentication_response(credential=d.credencial, expected_challenge=_de_b64(desafio["desafio"]), expected_rp_id=rp_id,
                                           expected_origin=origem, credential_public_key=_de_b64(pk["chave_publica"]),
                                           credential_current_sign_count=pk["contador"], require_user_verification=True)
    except Exception as e:  # noqa: BLE001
        firewall.registrar(ip, "login_falhou", "/api/auth/passkey/entrar", "assinatura inválida")
        raise HTTPException(401, f"Biometria não confirmada: {e}")
    u = db.um("SELECT * FROM usuarios WHERE id = ?", (pk["usuario_id"],))
    if not u or not u["ativo"]:
        raise HTTPException(403, "Esta conta está desativada.")
    link = _admin("POST", "/admin/generate_link", json={"type": "magiclink", "email": u["email"]})
    hashed = link.get("hashed_token") or (link.get("properties") or {}).get("hashed_token")
    r = httpx.post(f"{db.ENV['SUPABASE_URL']}/auth/v1/verify", timeout=15, headers={"apikey": db.ENV["SUPABASE_PUBLISHABLE_KEY"]},
                   json={"type": "magiclink", "token_hash": hashed})
    if r.status_code != 200:
        raise HTTPException(502, "O Supabase não abriu a sessão. Tente de novo.")
    sessao = r.json()
    from ..seguranca import _claims
    cl = _claims(sessao["access_token"])
    if str(cl.get("sub", "")) != str(u["id"]):   # e-mail desatualizado em usuarios nunca abre a conta de outra pessoa
        raise HTTPException(409, "A conta desta biometria mudou de e-mail. Entre com a senha e cadastre a biometria de novo.")
    sid = cl.get("session_id", "")
    db.executar("INSERT INTO sessoes_fortes (session_id, usuario_id, criado_em, expira_em) VALUES (?,?,?,?) ON CONFLICT (session_id) DO NOTHING",
                (sid, u["id"], db.agora(), db.agora() + 30 * 86400))
    db.executar("UPDATE passkeys SET contador = ?, ultimo_uso = ? WHERE id = ?", (v.new_sign_count, db.agora(), pk["id"]))
    db.executar("UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?", (db.agora(), u["id"]))
    firewall.registrar(ip, "login_ok", "/api/auth/passkey/entrar", "biometria")
    db.registrar("sistema", "Login com biometria", detalhe=f"{u['email']} · {pk['nome']}")
    return {k: sessao.get(k) for k in ("access_token", "refresh_token", "expires_in", "expires_at", "token_type")}
