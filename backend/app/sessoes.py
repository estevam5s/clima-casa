"""Controle das sessões de login feito pelo próprio sistema (no plano gratuito o Supabase não oferece):

- inatividade: sem uso há mais de N minutos, a sessão é recusada (o login é pedido de novo);
- duração máxima: depois de N horas da entrada, pede login de novo, mesmo em uso;
- revogação: o usuário (ou um administrador) encerra uma sessão à distância e ela para de valer na hora;
- lista de sessões ativas com aparelho, IP e local aproximado.

O registro é gravado no máximo a cada 2 minutos por sessão, para não pesar em cada requisição.
"""
import time
from urllib.parse import unquote

from fastapi import HTTPException

from . import db

_vistos: dict[str, tuple[float, int, bool]] = {}   # session_id -> (último registro local, criado_em, revogada)


def _agente_curto(ua: str) -> str:
    ua = ua or ""
    so = next((n for k, n in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"), ("Windows", "Windows"), ("Mac OS", "macOS"), ("Linux", "Linux")) if k in ua), "Outro")
    nav = next((n for k, n in (("Electron", "App de computador"), ("Edg/", "Edge"), ("OPR/", "Opera"), ("Chrome/", "Chrome"), ("Firefox/", "Firefox"), ("Safari/", "Safari"), ("okhttp", "App Android"), ("Expo", "App Android")) if k in ua), "Navegador")
    return f"{nav} · {so}"


def registrar_uso(claims: dict, u: dict, request, cfg: dict):
    sid = claims.get("session_id")
    if not sid:
        return
    agora = time.time()
    em_memoria = _vistos.get(sid)
    if em_memoria and agora - em_memoria[0] < 120:
        if em_memoria[2]:
            raise HTTPException(401, "Esta sessão foi encerrada. Entre de novo.")
        _limites(em_memoria[1], em_memoria[0], cfg)
        return
    linha = db.um("SELECT criado_em, visto_em, revogada FROM sessoes_uso WHERE session_id = ?", (sid,))
    if linha and linha["revogada"]:
        _vistos[sid] = (agora, linha["criado_em"], True)
        raise HTTPException(401, "Esta sessão foi encerrada. Entre de novo.")
    if linha:
        _limites(linha["criado_em"], linha["visto_em"], cfg)
    h = request.headers
    from . import firewall
    ip = firewall.ip_do_pedido(request)
    criado = linha["criado_em"] if linha else int(claims.get("iat") or agora)
    db.executar("INSERT INTO sessoes_uso (session_id, usuario_id, criado_em, visto_em, ip, pais, cidade, agente) VALUES (?,?,?,?,?,?,?,?) "
                "ON CONFLICT (session_id) DO UPDATE SET visto_em = excluded.visto_em, ip = excluded.ip, pais = excluded.pais, cidade = excluded.cidade, agente = excluded.agente",
                (sid, u["id"], criado, int(agora), ip, h.get("x-vercel-ip-country", "")[:4], unquote(h.get("x-vercel-ip-city", ""))[:60], _agente_curto(h.get("user-agent", ""))))
    if len(_vistos) > 5000:
        _vistos.clear()
    _vistos[sid] = (agora, criado, False)


def _limites(criado: int, visto: float, cfg: dict):
    agora = time.time()
    inat = cfg.get("sessao_inatividade_min") or 0
    maxh = cfg.get("sessao_max_horas") or 0
    if inat and agora - visto > inat * 60:
        raise HTTPException(401, "Sua sessão expirou por inatividade. Entre de novo.")
    if maxh and agora - criado > maxh * 3600:
        raise HTTPException(401, "Sua sessão passou do tempo máximo. Entre de novo para continuar.")


def listar(usuario_id: str, sessao_atual: str = "") -> list[dict]:
    linhas = db.consultar("SELECT session_id, criado_em, visto_em, ip, pais, cidade, agente FROM sessoes_uso "
                          "WHERE usuario_id = ? AND NOT revogada AND visto_em > ? ORDER BY visto_em DESC LIMIT 30",
                          (usuario_id, db.agora() - 30 * 86400))
    for l in linhas:
        l["atual"] = l["session_id"] == sessao_atual
        l["id"] = l.pop("session_id")[:8]   # nunca devolve o id inteiro da sessão
    return linhas


def revogar(usuario_id: str, prefixo: str | None = None, exceto: str | None = None) -> int:
    """Encerra uma sessão (pelo prefixo mostrado na lista) ou todas, menos a atual."""
    linhas = db.consultar("SELECT session_id FROM sessoes_uso WHERE usuario_id = ? AND NOT revogada", (usuario_id,))
    alvo = [l["session_id"] for l in linhas if (prefixo and l["session_id"].startswith(prefixo)) or (not prefixo and l["session_id"] != exceto)]
    for sid in alvo:
        db.executar("UPDATE sessoes_uso SET revogada = true WHERE session_id = ?", (sid,))
        try:
            db.executar("DELETE FROM auth.sessions WHERE id = CAST(? AS uuid)", (sid,))   # também derruba o refresh token
        except Exception:  # noqa: BLE001
            pass
        _vistos[sid] = (time.time(), 0, True)
    return len(alvo)
