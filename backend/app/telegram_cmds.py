"""Catálogo de comandos do bot do Telegram (1.490 comandos em 42 categorias; os da 0.6.8 em telegram_cmds_extra.py) e o menu navegável.

Cada comando é registrado com @cmd(nome, categoria, descrição, uso, arg, perm, papel, confirmar):
- `arg` diz o que o comando precisa: "ar" (um ar; sem nome usa o "ar atual" da conversa ou mostra a lista para escolher),
  "sala", "zona", "cena", "luz", "persiana", "auto", "texto" ou "num". Pelo menu, quem precisa de um item abre a lista.
- `perm`/`papel`: conferidos antes de rodar, com as permissões de QUEM vinculou o Telegram (as mesmas do painel).
- `confirmar`: ações em lote ou sensíveis pedem o botão Confirmar (nonce de uso único, 60 s) antes de executar.
Nada aqui fala com o Telegram direto: tudo passa por telegram._enviar (HTML, teclado inline).

Preferências por conversa (config `telegram_prefs`, sem segredo): ar atual, favoritos, recentes, avisos e silêncio.
"""
from __future__ import annotations

import datetime
import json
import re
import time

from . import db

C: dict[str, dict] = {}
CATS = [
    ("ares", "Ares", "Ligar, desligar, temperatura, modo, ventilação, timer e o ar atual"),
    ("atalhos", "Atalhos de temperatura", "Um toque: o ar atual vai para 16° a 30°"),
    ("salas", "Salas e zonas", "Comandos por sala (projeto) e por zona de ares iguais"),
    ("tx", "Transmissores", "Quem está online, capacidade, problemas e reconexão"),
    ("agentes", "Agentes", "Computadores do escritório, fila de comandos e saúde"),
    ("auto", "Automação", "Cenas, agendamentos, automações e temporizadores"),
    ("dados", "Relatórios", "Gasto, consumo, horas, ranking, falhas e comparações"),
    ("clima", "Tempo lá fora", "Previsão real, chuva, sol e temperatura recomendada"),
    ("disp", "Luzes e aparelhos", "Luzes, cafeteira, persianas e fechadura"),
    ("musica", "Música", "Spotify: tocar, pausar, volume, playlists"),
    ("avisos", "Notificações", "Notificações, alertas, bugs, novidades e avisos aqui"),
    ("seg", "Segurança", "Postura, IPs, escudo, sessões e checklist"),
    ("sistema", "Sistema", "Saúde, banco, backup, rotinas, Alexa e e-mail"),
    ("equipe", "Equipe e mapa", "Quem está no expediente, pessoas, avatares e veículos"),
    ("conta", "Minha conta", "Perfil, permissões, favoritos e preferências"),
    ("ia", "IA e ajuda", "Conversar com a IA, buscar comandos e ajuda"),
]
NOME_CAT = {k: r for k, r, _ in CATS}
PREFS = "telegram_prefs"
POR_PAGINA = 8


class Ctx:
    """Uma execução: conversa, usuário, mensagem a editar (clique em botão) e se a confirmação já foi dada."""
    def __init__(self, cid: str, u: dict, mid=None, confirmado=False):
        self.cid, self.u, self.mid, self.confirmado = cid, u, mid, confirmado

    def enviar(self, texto, botoes=None, editar=True):
        from . import telegram
        telegram._enviar(self.cid, texto, botoes if botoes is not None else [[{"text": "Menu", "callback_data": "m:menu"}]], self.mid if editar else None)


def cmd(nome, cat, desc, uso="", arg=None, perm=None, papel=None, confirmar=False, top=0):
    def reg(fn):
        C[nome] = {"nome": nome, "cat": cat, "desc": desc, "uso": uso or f"/{nome}", "arg": arg, "perm": perm, "papel": papel,
                   "confirmar": confirmar, "top": top, "fn": fn}
        return fn
    return reg


# ---------------- utilidades ----------------
def _e(t) -> str:
    import html
    return html.escape(str(t if t is not None else ""))


def tempo(seg) -> str:
    m = max(0, int(seg) // 60)
    if m < 60:
        return f"{m} min"
    if m < 1440:
        return f"{m // 60} h {m % 60:02d} min"
    return f"{m // 1440} d {(m % 1440) // 60} h"


def brl(v) -> str:
    return f"R$ {float(v or 0):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def num(v, casas=1) -> str:
    return f"{float(v or 0):,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def quando(ts) -> str:
    if not ts:
        return "nunca"
    d = datetime.datetime.fromtimestamp(int(ts), datetime.timezone(datetime.timedelta(hours=-3)))
    return d.strftime("%d/%m %H:%M")


def _dono_admin(ctx) -> bool:
    return ctx.u.get("papel") in ("dono", "admin")


def prefs(cid: str) -> dict:
    return ((db.cfg(PREFS) or {}).get(cid)) or {}


def salvar_prefs(cid: str, **mud):
    tudo = db.cfg(PREFS) or {}
    p = tudo.get(cid) or {}
    p.update(mud)
    tudo[cid] = p
    db.set_cfg(PREFS, tudo)
    return p


def ares(extra_where: str = "", params: tuple = ()) -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("a.projeto_id")
    fa, pa = acesso.filtro_aparelhos("a.id")
    return db.consultar("SELECT a.id, a.nome, a.ligado, a.modo, a.temperatura, a.ventilador, a.hub_id, a.projeto_id, a.ligado_desde, "
                        "a.temp_min, a.temp_max, a.potencia_w, pr.nome AS sala FROM aparelhos a LEFT JOIN projetos pr ON pr.id = a.projeto_id "
                        f"WHERE true{f}{fa}{extra_where} ORDER BY a.nome", tuple(p) + tuple(pa) + params)


def salas() -> list[dict]:
    from . import acesso
    f, p = acesso.filtro_sql("id")
    return db.consultar(f"SELECT id, nome, responsavel, meta_custo_mes FROM projetos WHERE true{f} ORDER BY nome", tuple(p))


def _achar(lista, texto, campo="nome"):
    t = (texto or "").strip().lower()
    if not t:
        return []
    if t.startswith("#") and t[1:].isdigit():
        return [x for x in lista if str(x["id"]) == t[1:]]
    exato = [x for x in lista if str(x[campo]).lower() == t]
    if exato:
        return exato
    return [x for x in lista if t in str(x[campo]).lower()]


def _lote_ares(ctx, alvo: list[dict], titulo: str, **estado):
    """Aplica o mesmo estado a vários ares, um por vez; quem já mudou junto (zona) não recebe o sinal de novo."""
    from . import clima
    feitos, falhas, ja = [], [], set()
    for a in alvo:
        if a["id"] in ja:
            feitos.append(a["nome"]); continue
        if not a["hub_id"]:
            falhas.append(f"{a['nome']} (sem transmissor)"); continue
        try:
            r = clima.aplicar(a["id"], "telegram", **estado)
            feitos.append(a["nome"]); ja.update(r.get("juntos") or [])
        except Exception as e:  # noqa: BLE001
            falhas.append(f"{a['nome']} ({str(e)[:60]})")
    txt = f"<b>{_e(titulo)}</b>\nEnviado para {len(feitos)} ar(es)" + (f": {_e(', '.join(feitos[:12]))}" if feitos else "") + "."
    if falhas:
        txt += f"\nSem resposta: {_e('; '.join(falhas[:8]))}"
    ctx.enviar(txt, [[{"text": "Ares", "callback_data": "m:ares"}, {"text": "Menu", "callback_data": "m:menu"}]])


def _painel(ctx, aid, aviso=""):
    from . import telegram
    telegram._painel_ar(ctx.cid, aid, ctx.mid, aviso=aviso)


def _aplicar(ctx, a, **estado):
    from . import telegram
    salvar_prefs(ctx.cid, atual=a["id"])
    telegram._aplicar(ctx.cid, a["id"], ctx.mid, **estado)


def _relatorio(dias: int, ate: int | None = None):
    from . import relatorio
    fim = ate or db.agora()
    return relatorio.montar(fim - dias * 86400, fim)


def _inicio_dia(delta=0) -> int:
    tz = datetime.timezone(datetime.timedelta(hours=-3))
    d = datetime.datetime.now(tz).replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=delta)
    return int(d.timestamp())


def _clima():
    from . import clima_externo
    pid = (db.um("SELECT min(id) AS id FROM projetos") or {}).get("id")
    return clima_externo.agora(pid, None)


# =====================================================================================================================
# ARES
# =====================================================================================================================
@cmd("ares", "ares", "Todos os ares que você controla", top=99)
def c_ares(ctx, a):
    from . import telegram
    telegram._lista_ares(ctx.cid, ctx.mid)


@cmd("ligados", "ares", "Só os ares ligados agora", top=98)
def c_ligados(ctx, a):
    from . import telegram
    telegram._lista_ares(ctx.cid, ctx.mid, so_ligados=True)


@cmd("desligados", "ares", "Ares desligados")
def c_desligados(ctx, a):
    lst = [x for x in ares() if not x["ligado"]]
    ctx.enviar("<b>Desligados</b> (toque para abrir):" if lst else "Todos os seus ares estão ligados.",
               [[{"text": x["nome"][:60], "callback_data": f"a:{x['id']}"}] for x in lst[:30]] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("ar", "ares", "Painel completo de um ar", "/ar NOME", arg="ar", top=97)
def c_ar(ctx, a):
    salvar_prefs(ctx.cid, atual=a["id"])
    _painel(ctx, a["id"])


@cmd("usar", "ares", "Escolhe o ar atual (os atalhos /16 a /30 e /frio etc. agem nele)", "/usar NOME", arg="ar", top=90)
def c_usar(ctx, a):
    salvar_prefs(ctx.cid, atual=a["id"])
    _painel(ctx, a["id"], aviso=f"<b>{_e(a['nome'])}</b> é o seu ar atual. Agora /23, /frio, /mais e /desligar agem nele.")


@cmd("atual", "ares", "Painel do ar atual", arg="ar?", top=89)
def c_atual(ctx, a):
    _painel(ctx, a["id"])


@cmd("ligar", "ares", "Liga um ar (sem nome: o ar atual)", "/ligar NOME", arg="ar?", perm="aparelhos.controlar", top=96)
def c_ligar(ctx, a):
    _aplicar(ctx, a, ligado=True)


@cmd("desligar", "ares", "Desliga um ar (sem nome: o ar atual)", "/desligar NOME", arg="ar?", perm="aparelhos.controlar", top=95)
def c_desligar(ctx, a):
    _aplicar(ctx, a, ligado=False)


def _graus(a, resto):
    m = re.search(r"(\d{2})", resto or "")
    return int(m.group(1)) if m else None


@cmd("temperatura", "ares", "Muda a temperatura", "/temperatura NOME 23", arg="ar?", perm="aparelhos.controlar", top=94)
def c_temperatura(ctx, a, resto=""):
    g = _graus(a, resto)
    if g is None:
        return ctx.enviar(f"Qual temperatura para <b>{_e(a['nome'])}</b>?", [[{"text": f"{x}°", "callback_data": f"t:{a['id']}:{x}"} for x in range(a['temp_min'], a['temp_max'] + 1)][i:i + 5] for i in range(0, 15, 5)] + [[{"text": "Menu", "callback_data": "m:menu"}]])
    _aplicar(ctx, a, temperatura=max(a["temp_min"], min(a["temp_max"], g)))


cmd("temp", "ares", "Igual a /temperatura (mais curto)", "/temp NOME 23", arg="ar?", perm="aparelhos.controlar")(c_temperatura)


@cmd("mais", "ares", "Sobe 1 grau", "/mais NOME", arg="ar?", perm="aparelhos.controlar", top=88)
def c_mais(ctx, a):
    _aplicar(ctx, a, temperatura=min(a["temp_max"], a["temperatura"] + 1))


@cmd("menos", "ares", "Desce 1 grau", "/menos NOME", arg="ar?", perm="aparelhos.controlar", top=87)
def c_menos(ctx, a):
    _aplicar(ctx, a, temperatura=max(a["temp_min"], a["temperatura"] - 1))


@cmd("mais2", "ares", "Sobe 2 graus", "/mais2 NOME", arg="ar?", perm="aparelhos.controlar")
def c_mais2(ctx, a):
    _aplicar(ctx, a, temperatura=min(a["temp_max"], a["temperatura"] + 2))


@cmd("menos2", "ares", "Desce 2 graus", "/menos2 NOME", arg="ar?", perm="aparelhos.controlar")
def c_menos2(ctx, a):
    _aplicar(ctx, a, temperatura=max(a["temp_min"], a["temperatura"] - 2))


MODOS = {"frio": ("frio", "Modo frio"), "quente": ("quente", "Modo quente"), "seco": ("seco", "Desumidificar"), "ventilar": ("ventilar", "Só ventilar"),
         "automatico": ("auto", "Modo automático")}
for _n, (_m, _d) in MODOS.items():
    def _fmodo(ctx, a, _m=_m):
        _aplicar(ctx, a, modo=_m)
    cmd(_n, "ares", f"{_d} (liga se estiver desligado)", f"/{_n} NOME", arg="ar?", perm="aparelhos.controlar", top=80 if _n == "frio" else 60)(_fmodo)


@cmd("modo", "ares", "Muda o modo: frio, quente, seco, ventilar ou auto", "/modo NOME frio", arg="ar?", perm="aparelhos.controlar")
def c_modo(ctx, a, resto=""):
    t = (resto or "").lower()
    m = next((v[0] for k, v in MODOS.items() if k in t or v[0] == t.strip()), None)
    if not m:
        return ctx.enviar(f"Qual modo para <b>{_e(a['nome'])}</b>?", [[{"text": r, "callback_data": f"o:{a['id']}:{k}"} for k, r in (("frio", "Frio"), ("quente", "Quente"), ("seco", "Seco"))],
                                                                    [{"text": r, "callback_data": f"o:{a['id']}:{k}"} for k, r in (("ventilar", "Ventilar"), ("auto", "Auto"))], [{"text": "Menu", "callback_data": "m:menu"}]])
    _aplicar(ctx, a, modo=m)


VENTS = {"ventbaixa": ("baixa", "Ventilação baixa"), "ventmedia": ("media", "Ventilação média"), "ventalta": ("alta", "Ventilação alta"), "ventauto": ("auto", "Ventilação automática")}
for _n, (_v, _d) in VENTS.items():
    def _fvent(ctx, a, _v=_v):
        _aplicar(ctx, a, ventilador=_v)
    cmd(_n, "ares", _d, f"/{_n} NOME", arg="ar?", perm="aparelhos.controlar")(_fvent)


@cmd("ventilacao", "ares", "Muda a ventilação: baixa, media, alta ou auto", "/ventilacao NOME alta", arg="ar?", perm="aparelhos.controlar")
def c_ventilacao(ctx, a, resto=""):
    t = (resto or "").lower()
    v = next((x for x in ("baixa", "media", "alta", "auto") if x in t.replace("é", "e")), None)
    if not v:
        return ctx.enviar(f"Qual ventilação para <b>{_e(a['nome'])}</b>?", [[{"text": r, "callback_data": f"v:{a['id']}:{k}"} for k, r in (("auto", "Auto"), ("baixa", "Baixa"), ("media", "Média"), ("alta", "Alta"))], [{"text": "Menu", "callback_data": "m:menu"}]])
    _aplicar(ctx, a, ventilador=v)


@cmd("conforto", "ares", "Frio 23° com ventilação automática (o ponto de conforto mais pedido)", "/conforto NOME", arg="ar?", perm="aparelhos.controlar")
def c_conforto(ctx, a):
    _aplicar(ctx, a, ligado=True, modo="frio", temperatura=max(a["temp_min"], min(a["temp_max"], 23)), ventilador="auto")


@cmd("economia", "ares", "Frio 25° e ventilação baixa: gasta menos", "/economia NOME", arg="ar?", perm="aparelhos.controlar")
def c_economia(ctx, a):
    _aplicar(ctx, a, ligado=True, modo="frio", temperatura=max(a["temp_min"], min(a["temp_max"], 25)), ventilador="baixa")


@cmd("gelar", "ares", "Frio na menor temperatura e ventilação alta (por pouco tempo)", "/gelar NOME", arg="ar?", perm="aparelhos.controlar")
def c_gelar(ctx, a):
    _aplicar(ctx, a, ligado=True, modo="frio", temperatura=a["temp_min"], ventilador="alta")


@cmd("timer", "ares", "Desliga daqui a N minutos", "/timer NOME 45", arg="ar?", perm="aparelhos.controlar", top=86)
def c_timer(ctx, a, resto=""):
    from . import telegram
    m = re.search(r"(\d+)", resto or "")
    if not m:
        return ctx.enviar(f"Desligar <b>{_e(a['nome'])}</b> em quanto tempo?", [[{"text": r, "callback_data": f"p:{a['id']}:{x}"} for x, r in ((15, "15 min"), (30, "30 min"), (60, "1 h"))],
                                                                              [{"text": r, "callback_data": f"p:{a['id']}:{x}"} for x, r in ((120, "2 h"), (240, "4 h"), (480, "8 h"))], [{"text": "Menu", "callback_data": "m:menu"}]])
    telegram._temporizador(ctx.cid, a["id"], max(1, min(1440, int(m.group(1)))), ctx.mid)


for _min in (15, 30, 60, 120, 240):
    def _ftimer(ctx, a, _min=_min):
        from . import telegram
        telegram._temporizador(ctx.cid, a["id"], _min, ctx.mid)
    cmd(f"desligarem{_min}", "ares", f"Desliga daqui a {tempo(_min * 60)}", f"/desligarem{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_ftimer)


@cmd("semtimer", "ares", "Cancela o timer de um ar", "/semtimer NOME", arg="ar?", perm="aparelhos.controlar")
def c_semtimer(ctx, a):
    from . import telegram
    telegram._temporizador(ctx.cid, a["id"], 0, ctx.mid)


@cmd("historico", "ares", "Últimos comandos de um ar (quem, quando, deu certo?)", "/historico NOME", arg="ar?", perm="atividade.ver")
def c_historico(ctx, a):
    ev = db.consultar("SELECT quando, origem, acao, ok FROM atividade WHERE aparelho_id = ? ORDER BY quando DESC LIMIT 12", (a["id"],))
    linhas = [f"{quando(e['quando'])} · {_e(e['acao'][:50])} · {_e(e['origem'])}{'' if e['ok'] else ' · <b>falhou</b>'}" for e in ev]
    ctx.enviar(f"<b>{_e(a['nome'])}</b>, últimos comandos:\n" + ("\n".join(linhas) or "Nada registrado."), [[{"text": "Painel do ar", "callback_data": f"a:{a['id']}"}, {"text": "Menu", "callback_data": "m:menu"}]])


@cmd("botoes", "ares", "Quantos botões gravados um ar tem e quais modos", "/botoes NOME", arg="ar?")
def c_botoes(ctx, a):
    rows = db.consultar("SELECT chave FROM codigos WHERE aparelho_id = ?", (a["id"],))
    chaves = [r["chave"] for r in rows]
    modos = sorted({c.split("_")[0] for c in chaves if c.count("_") == 2})
    temps = sorted({int(c.split("_")[1]) for c in chaves if c.count("_") == 2 and c.split("_")[1].isdigit()})
    ctx.enviar(f"<b>{_e(a['nome'])}</b>: {len(chaves)} botão(ões) gravado(s).\nDesligar: {'sim' if 'desligar' in chaves else '<b>não gravado</b>'}\n"
               f"Modos: {_e(', '.join(modos)) or 'nenhum'}\nTemperaturas: {f'{temps[0]}° a {temps[-1]}°' if temps else 'nenhuma'}")


@cmd("zonaar", "ares", "A zona do ar (ares iguais que mudam juntos)", "/zonaar NOME", arg="ar?")
def c_zonaar(ctx, a):
    from . import zonas
    z = zonas.de_aparelho(a["id"])
    if not z or z.get("total", 0) < 2:
        return ctx.enviar(f"<b>{_e(a['nome'])}</b> não está numa zona: só ele obedece ao sinal.")
    nomes = [x["nome"] for x in ares() if x["id"] in (z.get("aparelhos") or [])]
    ctx.enviar(f"<b>{_e(a['nome'])}</b> está na zona <b>{_e(z['nome'])}</b> com {z['total']} ares iguais: {_e(', '.join(nomes))}.\n"
               "O infravermelho não tem endereço: um comando muda todos eles.")


def _estado_real(ctx, a, ligado: bool):
    from .rotas import api as rapi
    rapi.estado_real(a["id"], rapi.EstadoRealIn(ligado=ligado))
    _painel(ctx, a["id"], aviso=f"Anotado: {_e(a['nome'])} está {'ligado' if ligado else 'desligado'} (nenhum sinal enviado).")


@cmd("estaligado", "ares", "Alguém ligou pelo controle remoto: anota sem mandar sinal", "/estaligado NOME", arg="ar?", perm="aparelhos.controlar")
def c_estaligado(ctx, a):
    _estado_real(ctx, a, True)


@cmd("estadesligado", "ares", "Alguém desligou pelo controle remoto: anota sem mandar sinal", "/estadesligado NOME", arg="ar?", perm="aparelhos.controlar")
def c_estadesligado(ctx, a):
    _estado_real(ctx, a, False)


@cmd("procurarar", "ares", "Procura ares pelo nome ou sala", "/procurarar texto", arg="texto")
def c_procurarar(ctx, txt):
    t = txt.lower()
    lst = [x for x in ares() if t in x["nome"].lower() or t in (x["sala"] or "").lower()]
    ctx.enviar(f"{len(lst)} ar(es) com “{_e(txt)}”:" if lst else f"Nenhum ar com “{_e(txt)}”.", [[{"text": x["nome"][:60], "callback_data": f"a:{x['id']}"}] for x in lst[:20]] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("semtransmissor", "ares", "Ares sem transmissor (não recebem comandos)")
def c_semtransmissor(ctx, a):
    lst = [x["nome"] for x in ares() if not x["hub_id"]]
    ctx.enviar("<b>Sem transmissor</b>: " + _e(", ".join(lst)) if lst else "Todos os seus ares têm transmissor.")


@cmd("ligadoshamuito", "ares", "Ares ligados há mais de 4 horas")
def c_ligadoshamuito(ctx, a):
    agora = db.agora()
    lst = [x for x in ares() if x["ligado"] and x["ligado_desde"] and agora - x["ligado_desde"] > 4 * 3600]
    ctx.enviar("\n".join(f"• {_e(x['nome'])}: {tempo(agora - x['ligado_desde'])}" for x in lst) or "Nenhum ar ligado há mais de 4 horas.",
               [[{"text": f"Desligar {x['nome']}"[:60], "callback_data": f"d:{x['id']}"}] for x in lst[:8]] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("maisantigo", "ares", "O ar ligado há mais tempo")
def c_maisantigo(ctx, a):
    lst = sorted([x for x in ares() if x["ligado"] and x["ligado_desde"]], key=lambda x: x["ligado_desde"])
    if not lst:
        return ctx.enviar("Nenhum ar ligado agora.")
    x = lst[0]
    ctx.enviar(f"<b>{_e(x['nome'])}</b> está ligado há {tempo(db.agora() - x['ligado_desde'])}.", [[{"text": "Desligar", "callback_data": f"d:{x['id']}"}, {"text": "Painel", "callback_data": f"a:{x['id']}"}]])


@cmd("tempoligado", "ares", "Há quanto tempo um ar está ligado", "/tempoligado NOME", arg="ar?")
def c_tempoligado(ctx, a):
    if not a["ligado"]:
        return ctx.enviar(f"{_e(a['nome'])} está desligado.")
    ctx.enviar(f"{_e(a['nome'])} está ligado há {tempo(db.agora() - (a['ligado_desde'] or db.agora()))}.")


@cmd("consumoar", "ares", "Horas, consumo e custo de um ar nos últimos 7 dias", "/consumoar NOME", arg="ar?", perm="relatorios.ver")
def c_consumoar(ctx, a):
    from . import relatorio
    fim = db.agora()
    d = relatorio.montar(fim - 7 * 86400, fim, aparelho_id=a["id"])
    r = d["resumo"]
    ctx.enviar(f"<b>{_e(a['nome'])}</b>, 7 dias (estimativa)\nHoras ligado: {num(r['horas_ligado'])} h\nConsumo: {num(r['kwh'])} kWh\nCusto: {brl(r['custo'])}\nComandos: {r['comandos']} ({r['falhas']} falha(s))")


@cmd("diagnostico", "ares", "Por que um ar não obedece? Confere transmissor, agente e botões", "/diagnostico NOME", arg="ar?", top=70)
def c_diagnostico(ctx, a):
    from . import coordenador, transmissor
    itens = []
    ok = True
    if not a["hub_id"]:
        itens.append("Sem transmissor: vincule um em Aparelho → Ajustes."); ok = False
    else:
        h = db.um("SELECT nome, online, problema, visto_em FROM hubs WHERE id = ?", (a["hub_id"],)) or {}
        itens.append(f"Transmissor {_e(h.get('nome'))}: {'online' if h.get('online') else 'sem contato desde ' + quando(h.get('visto_em'))}")
        if h.get("problema"):
            itens.append(f"Problema registrado: {_e(h['problema'][:140])}")
        ok = ok and bool(h.get("online"))
    princ = next((m for m in coordenador.maquinas() if m.get("principal")), None)
    if not transmissor.agente_online() or not princ:
        itens.append("Nenhum agente ligado no escritório: o comando não chega ao ar."); ok = False
    else:
        ve = princ.get("ve_transmissores") or 0
        itens.append(f"Agente no comando: {_e(princ['nome'])}, enxerga {ve} de {princ.get('total_transmissores') or 0} transmissor(es)")
        if not ve:
            itens.append("Ele não enxerga nenhum transmissor: está fora da rede do escritório?"); ok = False
    n = db.um("SELECT count(*) n, count(*) FILTER (WHERE chave = 'desligar') d FROM codigos WHERE aparelho_id = ?", (a["id"],))
    itens.append(f"Botões gravados: {n['n']} (Desligar {'gravado' if n['d'] else '<b>faltando</b>'})")
    ok = ok and n["n"] > 0 and n["d"] > 0
    ult = db.um("SELECT quando, acao, ok, detalhe FROM atividade WHERE aparelho_id = ? ORDER BY quando DESC LIMIT 1", (a["id"],))
    if ult:
        itens.append(f"Último comando: {quando(ult['quando'])} · {_e(ult['acao'][:40])} · {'ok' if ult['ok'] else 'falhou: ' + _e((ult['detalhe'] or '')[:100])}")
    ctx.enviar(f"<b>Diagnóstico: {_e(a['nome'])}</b>\n" + "\n".join(f"• {x}" for x in itens) +
               ("\n\nTudo certo do lado do sistema. Se o ar não apitar, confira a visada do transmissor." if ok else "\n\nResolva o item acima e tente de novo."),
               [[{"text": "Painel do ar", "callback_data": f"a:{a['id']}"}, {"text": "Agentes", "callback_data": "x:agentes"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("ligartodos", "ares", "Liga todos os seus ares (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_ligartodos(ctx, a):
    _lote_ares(ctx, [x for x in ares() if not x["ligado"]], "Ligar todos", ligado=True)


@cmd("desligartodos", "ares", "Desliga todos os ares ligados (pede confirmação)", perm="aparelhos.controlar", confirmar=True, top=93)
def c_desligartodos(ctx, a):
    _lote_ares(ctx, [x for x in ares() if x["ligado"]], "Desligar todos", ligado=False)


@cmd("todosem", "ares", "Todos os ares ligados na mesma temperatura (pede confirmação)", "/todosem 23", arg="num", perm="aparelhos.controlar", confirmar=True)
def c_todosem(ctx, n):
    _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos em {n}°", temperatura=max(16, min(30, int(n))))


@cmd("todosconforto", "ares", "Todos os ligados em frio 23° (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_todosconforto(ctx, a):
    _lote_ares(ctx, [x for x in ares() if x["ligado"]], "Todos no conforto", modo="frio", temperatura=23, ventilador="auto")


@cmd("todoseconomia", "ares", "Todos os ligados em 25° e ventilação baixa (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_todoseconomia(ctx, a):
    _lote_ares(ctx, [x for x in ares() if x["ligado"]], "Todos no modo economia", modo="frio", temperatura=25, ventilador="baixa")


@cmd("fimdoexpediente", "ares", "Desliga todos os ares e cancela os timers (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_fimdoexpediente(ctx, a):
    lst = ares()
    ids = [x["id"] for x in lst]
    if ids:
        db.executar(f"DELETE FROM temporizadores WHERE aparelho_id IN ({','.join('?' * len(ids))})", tuple(ids))
    _lote_ares(ctx, [x for x in lst if x["ligado"]], "Fim do expediente", ligado=False)


# atalhos de temperatura: /16 … /30 no ar atual
for _g in range(16, 31):
    def _fatalho(ctx, a, _g=_g):
        _aplicar(ctx, a, ligado=True, temperatura=max(a["temp_min"], min(a["temp_max"], _g)))
    cmd(str(_g), "atalhos", f"Ar atual em {_g}°", f"/{_g}", arg="ar?", perm="aparelhos.controlar", top=50 if _g in (20, 22, 23, 24) else 0)(_fatalho)
for _n, _m, _g, _d in (("frio22", "frio", 22, "Frio 22°"), ("frio24", "frio", 24, "Frio 24°"), ("quente26", "quente", 26, "Quente 26°"), ("quente28", "quente", 28, "Quente 28°")):
    def _fat2(ctx, a, _m=_m, _g=_g):
        _aplicar(ctx, a, ligado=True, modo=_m, temperatura=max(a["temp_min"], min(a["temp_max"], _g)))
    cmd(_n, "atalhos", f"{_d} no ar atual", f"/{_n}", arg="ar?", perm="aparelhos.controlar")(_fat2)


@cmd("atalhos", "atalhos", "Lista os atalhos de temperatura")
def c_atalhos(ctx, a):
    at = prefs(ctx.cid).get("atual")
    nome = next((x["nome"] for x in ares() if x["id"] == at), None)
    ctx.enviar(("Ar atual: <b>" + _e(nome) + "</b>\n" if nome else "Escolha o ar atual com /usar NOME.\n") +
               "Toque numa temperatura:", [[{"text": f"{g}°", "callback_data": f"x:{g}"} for g in range(i, min(31, i + 5))] for i in range(16, 31, 5)] + [[{"text": "Menu", "callback_data": "m:menu"}]])


# =====================================================================================================================
# SALAS E ZONAS
# =====================================================================================================================
@cmd("salas", "salas", "Salas (projetos) e quantos ares ligados em cada", top=85)
def c_salas(ctx, a):
    lst = ares()
    linhas, bt = [], []
    for s in salas():
        dela = [x for x in lst if x["projeto_id"] == s["id"]]
        if not dela:
            continue
        lig = sum(1 for x in dela if x["ligado"])
        linhas.append(f"• <b>{_e(s['nome'])}</b>: {lig} de {len(dela)} ligado(s)")
        bt.append([{"text": s["nome"][:60], "callback_data": f"xs:sala:{s['id']}"}])
    ctx.enviar("\n".join(linhas) or "Nenhuma sala com ares.", bt[:30] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("sala", "salas", "Ares de uma sala", "/sala NOME", arg="sala")
def c_sala(ctx, s):
    dela = [x for x in ares() if x["projeto_id"] == s["id"]]
    from . import clima
    bt = [[{"text": (f"● {x['nome']} · {clima.MODOS.get(x['modo'], x['modo'])} {x['temperatura']}°" if x["ligado"] else f"○ {x['nome']}")[:60], "callback_data": f"a:{x['id']}"}] for x in dela]
    bt.append([{"text": "Ligar a sala", "callback_data": f"xs:ligarsala:{s['id']}"}, {"text": "Desligar a sala", "callback_data": f"xs:desligarsala:{s['id']}"}])
    ctx.enviar(f"<b>{_e(s['nome'])}</b>" + (f" · responsável {_e(s['responsavel'])}" if s.get("responsavel") else ""), bt + [[{"text": "Salas", "callback_data": "x:salas"}, {"text": "Menu", "callback_data": "m:menu"}]])


@cmd("ligarsala", "salas", "Liga todos os ares de uma sala (pede confirmação)", "/ligarsala NOME", arg="sala", perm="aparelhos.controlar", confirmar=True)
def c_ligarsala(ctx, s):
    _lote_ares(ctx, [x for x in ares() if x["projeto_id"] == s["id"] and not x["ligado"]], f"Ligar {s['nome']}", ligado=True)


@cmd("desligarsala", "salas", "Desliga todos os ares de uma sala (pede confirmação)", "/desligarsala NOME", arg="sala", perm="aparelhos.controlar", confirmar=True)
def c_desligarsala(ctx, s):
    _lote_ares(ctx, [x for x in ares() if x["projeto_id"] == s["id"] and x["ligado"]], f"Desligar {s['nome']}", ligado=False)


@cmd("tempsala", "salas", "Temperatura para os ares ligados de uma sala", "/tempsala NOME 23", arg="sala", perm="aparelhos.controlar", confirmar=True)
def c_tempsala(ctx, s, resto=""):
    g = _graus(None, resto)
    if g is None:
        return ctx.enviar("Use: /tempsala NOME 23")
    _lote_ares(ctx, [x for x in ares() if x["projeto_id"] == s["id"] and x["ligado"]], f"{s['nome']} em {g}°", temperatura=max(16, min(30, g)))


@cmd("gastosala", "salas", "Gasto estimado de uma sala em 30 dias", "/gastosala NOME", arg="sala", perm="relatorios.ver")
def c_gastosala(ctx, s):
    from . import relatorio
    fim = db.agora()
    r = relatorio.montar(fim - 30 * 86400, fim, projeto_id=s["id"])["resumo"]
    meta = s.get("meta_custo_mes")
    ctx.enviar(f"<b>{_e(s['nome'])}</b>, 30 dias (estimativa)\nCusto: {brl(r['custo'])}\nConsumo: {num(r['kwh'])} kWh\nHoras ligado: {num(r['horas_ligado'])} h"
               + (f"\nMeta do mês: {brl(meta)} ({round(r['custo'] / meta * 100) if meta else 0}% usada)" if meta else ""))


@cmd("metas", "salas", "Metas de gasto por sala e quanto já foi usado", perm="relatorios.ver")
def c_metas(ctx, a):
    d = _relatorio(30)
    por = {p["projeto"]: p for p in d.get("por_projeto", [])}
    linhas = []
    for s in salas():
        if s.get("meta_custo_mes"):
            c = (por.get(s["nome"]) or {}).get("custo", 0)
            linhas.append(f"• {_e(s['nome'])}: {brl(c)} de {brl(s['meta_custo_mes'])} ({round(c / s['meta_custo_mes'] * 100)}%)")
    ctx.enviar("<b>Metas (30 dias)</b>\n" + ("\n".join(linhas) or "Nenhuma sala tem meta cadastrada. Defina em Projetos no painel."))


@cmd("rankingsalas", "salas", "Salas que mais gastaram em 30 dias", perm="relatorios.ver")
def c_rankingsalas(ctx, a):
    d = _relatorio(30)
    ctx.enviar("<b>Gasto por sala (30 dias)</b>\n" + "\n".join(f"{i + 1}. {_e(p['projeto'])}: {brl(p['custo'])}" for i, p in enumerate(d.get("por_projeto", [])[:10])) or "Sem dados.")


@cmd("salasligadas", "salas", "Salas com algum ar ligado agora")
def c_salasligadas(ctx, a):
    lst = ares()
    nomes = sorted({x["sala"] or "Sem sala" for x in lst if x["ligado"]})
    ctx.enviar("<b>Com ar ligado</b>: " + _e(", ".join(nomes)) if nomes else "Nenhuma sala com ar ligado.")


@cmd("responsaveis", "salas", "Responsável de cada sala")
def c_responsaveis(ctx, a):
    ctx.enviar("\n".join(f"• {_e(s['nome'])}: {_e(s.get('responsavel') or 'sem responsável')}" for s in salas()) or "Nenhuma sala.")


def _zonas_visiveis():
    from . import zonas
    ids = {x["id"] for x in ares()}
    return [z for z in zonas.listar() if set(z.get("aparelhos") or []) & ids]


@cmd("zonas", "salas", "Zonas: ares iguais no mesmo transmissor que mudam juntos")
def c_zonas(ctx, a):
    zs = _zonas_visiveis()
    ctx.enviar("\n".join(f"• <b>{_e(z['nome'])}</b>: {len(z.get('aparelhos') or [])} ares" for z in zs) or "Nenhuma zona.",
               [[{"text": z["nome"][:60], "callback_data": f"xs:zona:{z['id']}"[:64]}] for z in zs[:20]] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("zona", "salas", "Detalhe de uma zona", "/zona NOME", arg="zona")
def c_zona(ctx, z):
    nomes = [x["nome"] for x in ares() if x["id"] in (z.get("aparelhos") or [])]
    ctx.enviar(f"<b>{_e(z['nome'])}</b>\nAres: {_e(', '.join(nomes))}\nUm sinal muda todos.",
               [[{"text": "Ligar a zona", "callback_data": f"xs:ligarzona:{z['id']}"[:64]}, {"text": "Desligar a zona", "callback_data": f"xs:desligarzona:{z['id']}"[:64]}], [{"text": "Menu", "callback_data": "m:menu"}]])


def _estado_zona(ctx, z, **estado):
    from .rotas import api as rapi
    rapi.estado_zona(z["id"], rapi.EstadoZonaIn(**estado))
    ctx.enviar(f"<b>{_e(z['nome'])}</b>: enviado ({', '.join(f'{k} {v}' for k, v in estado.items())}).")


@cmd("ligarzona", "salas", "Liga uma zona inteira com um sinal", "/ligarzona NOME", arg="zona", perm="aparelhos.controlar", confirmar=True)
def c_ligarzona(ctx, z):
    _estado_zona(ctx, z, ligado=True)


@cmd("desligarzona", "salas", "Desliga uma zona inteira com um sinal", "/desligarzona NOME", arg="zona", perm="aparelhos.controlar", confirmar=True)
def c_desligarzona(ctx, z):
    _estado_zona(ctx, z, ligado=False)


@cmd("tempzona", "salas", "Temperatura de uma zona", "/tempzona NOME 23", arg="zona", perm="aparelhos.controlar")
def c_tempzona(ctx, z, resto=""):
    g = _graus(None, resto)
    if g is None:
        return ctx.enviar("Use: /tempzona NOME 23")
    _estado_zona(ctx, z, ligado=True, temperatura=max(16, min(30, g)))


@cmd("testadas", "salas", "Transmissores com o teste de interferência feito")
def c_testadas(ctx, a):
    t = db.cfg("zonas_testadas") or {}
    if isinstance(t, list):
        t = {k: {} for k in t}
    nomes = {h["id"]: h["nome"] for h in db.consultar("SELECT id, nome FROM hubs")}
    ctx.enviar("\n".join(f"• {_e(nomes.get(k, k))}: testado em {quando(v.get('em') if isinstance(v, dict) else v)}" for k, v in t.items()) or "Nenhum teste de interferência feito ainda (Transmissores → Testar interferência).")


# =====================================================================================================================
# TRANSMISSORES
# =====================================================================================================================
@cmd("transmissores", "tx", "Transmissores e quais ares cada um atende", top=84)
def c_transmissores(ctx, a):
    from . import telegram
    telegram._transmissores(ctx.cid, ctx.mid)


def _hubs():
    return db.consultar("SELECT id, nome, online, problema, visto_em, ip, versao FROM hubs ORDER BY nome")


@cmd("transmissor", "tx", "Detalhe de um transmissor", "/transmissor NOME", arg="texto")
def c_transmissor(ctx, txt):
    hs = _achar(_hubs(), txt)
    if len(hs) != 1:
        return ctx.enviar("Qual transmissor?", [[{"text": h["nome"][:60], "callback_data": f"xt:{h['id']}"[:64]}] for h in _hubs()[:20]])
    h = hs[0]
    deles = [x["nome"] for x in ares() if x["hub_id"] == h["id"]]
    ctx.enviar(f"<b>{_e(h['nome'])}</b>\n{'Online' if h['online'] else 'Sem contato'} · visto {quando(h['visto_em'])}\nProtocolo {_e(h['versao'])}\n"
               f"Ares ({len(deles)} de 4 recomendados): {_e(', '.join(deles)) or 'nenhum'}" + (f"\nProblema: {_e(h['problema'][:200])}" if h["problema"] else ""))


@cmd("txoffline", "tx", "Transmissores sem contato")
def c_txoffline(ctx, a):
    lst = [h for h in _hubs() if not h["online"]]
    ctx.enviar("\n".join(f"• {_e(h['nome'])}: visto {quando(h['visto_em'])}" for h in lst) or "Todos os transmissores estão online.")


@cmd("txonline", "tx", "Transmissores online")
def c_txonline(ctx, a):
    lst = [h for h in _hubs() if h["online"]]
    ctx.enviar("\n".join(f"• {_e(h['nome'])}" for h in lst) or "Nenhum transmissor online agora (o agente do escritório está ligado?).")


@cmd("capacidade", "tx", "Quantos ares cada transmissor atende (recomendado: até 4)")
def c_capacidade(ctx, a):
    n = {r["hub_id"]: r["n"] for r in db.consultar("SELECT hub_id, count(*) n FROM aparelhos WHERE hub_id IS NOT NULL GROUP BY hub_id")}
    ctx.enviar("\n".join(f"• {_e(h['nome'])}: {n.get(h['id'], 0)} de 4" + (" (acima do recomendado)" if n.get(h["id"], 0) > 4 else "") for h in _hubs()) or "Nenhum transmissor.")


@cmd("txsemar", "tx", "Transmissores sem nenhum ar vinculado")
def c_txsemar(ctx, a):
    usados = {r["hub_id"] for r in db.consultar("SELECT DISTINCT hub_id FROM aparelhos WHERE hub_id IS NOT NULL")}
    lst = [h["nome"] for h in _hubs() if h["id"] not in usados]
    ctx.enviar("Sem ar: " + _e(", ".join(lst)) if lst else "Todos os transmissores têm ar vinculado.")


@cmd("txproblemas", "tx", "Transmissores com problema registrado")
def c_txproblemas(ctx, a):
    lst = [h for h in _hubs() if h["problema"]]
    ctx.enviar("\n\n".join(f"<b>{_e(h['nome'])}</b>\n{_e(h['problema'][:300])}" for h in lst) or "Nenhum problema registrado.")


@cmd("reconectar", "tx", "Força a reconexão dos transmissores (procura IP e chave nova)", perm="transmissores.gerenciar", confirmar=True)
def c_reconectar(ctx, a):
    from .rotas import api as rapi
    try:
        r = rapi.reparar_hubs()
    except Exception as e:  # noqa: BLE001
        return ctx.enviar(f"Não deu: {_e(getattr(e, 'detail', None) or str(e))[:300]}")
    res = (r or {}).get("resultados") or []
    ctx.enviar("<b>Reconexão</b>\n" + ("\n".join(f"• {_e(x.get('nome') or x.get('id'))}: {_e(x.get('resultado') or x.get('estado') or x)}"[:200] for x in res) if res else "Feito."))


@cmd("ips", "tx", "IP e protocolo de cada transmissor (rede local)", papel=("dono", "admin"))
def c_ips(ctx, a):
    ctx.enviar("\n".join(f"• {_e(h['nome'])}: {_e(h['ip'] or '?')} · {_e(h['versao'])}" for h in _hubs()) or "Nenhum transmissor.")


# =====================================================================================================================
# AGENTES
# =====================================================================================================================
@cmd("agentes", "agentes", "Computadores do escritório e quem está no comando", top=83)
def c_agentes(ctx, a):
    from . import telegram
    telegram._agentes(ctx.cid, ctx.mid)


def _maquinas():
    from . import coordenador
    try:
        return coordenador.maquinas()
    except Exception:  # noqa: BLE001
        return []


@cmd("principal", "agentes", "Qual computador está no comando agora")
def c_principal(ctx, a):
    p = next((m for m in _maquinas() if m.get("principal")), None)
    ctx.enviar(f"No comando: <b>{_e(p['nome'])}</b> ({'online' if p.get('online') else 'offline'}), enxerga {p.get('ve_transmissores') or 0} de {p.get('total_transmissores') or 0} transmissor(es)." if p else "Nenhum computador no comando agora.")


@cmd("preferido", "agentes", "Computador preferido (assume quando enxerga os transmissores)")
def c_preferido(ctx, a):
    from . import coordenador
    pid = coordenador.preferido()
    m = next((x for x in _maquinas() if x.get("id") == pid), None)
    ctx.enviar(f"Preferido: <b>{_e(m['nome'])}</b> ({'online' if m.get('online') else 'offline'})." if m else "Nenhum preferido definido (Infra → Agentes no painel).")


@cmd("saudeagente", "agentes", "Disco, memória, temperatura e carga de cada computador")
def c_saudeagente(ctx, a):
    linhas = []
    for m in _maquinas():
        s = m.get("saude") or {}
        partes = [f"{num(s['disco_livre_gb'])} GB livres" if s.get("disco_livre_gb") is not None else None,
                  f"{s['memoria_livre_mb']} de {s['memoria_total_mb']} MB livres" if s.get("memoria_total_mb") else None,
                  f"{num(s['temperatura'])} °C" if s.get("temperatura") else None, f"carga {num(s['carga'], 2)}" if s.get("carga") is not None else None,
                  f"ligado há {tempo(s['ligado_ha_s'])}" if s.get("ligado_ha_s") else None]
        linhas.append(f"<b>{_e(m.get('nome'))}</b> · {'online' if m.get('online') else 'offline'}\n  " + " · ".join(x for x in partes if x))
    ctx.enviar("\n\n".join(linhas) or "Nenhum computador com o agente.")


@cmd("fila", "agentes", "Comandos esperando o agente agora")
def c_fila(ctx, a):
    lst = db.consultar("SELECT tipo, estado, criado_em FROM fila_comandos WHERE estado IN ('pendente','executando') ORDER BY id DESC LIMIT 15")
    ctx.enviar("\n".join(f"• {_e(f['tipo'])} · {_e(f['estado'])} · há {tempo(db.agora() - f['criado_em'])}" for f in lst) or "Fila vazia: nada esperando.")


@cmd("filaerros", "agentes", "Últimos erros da fila de comandos")
def c_filaerros(ctx, a):
    lst = db.consultar("SELECT tipo, erro, criado_em FROM fila_comandos WHERE estado = 'erro' ORDER BY id DESC LIMIT 8")
    ctx.enviar("\n".join(f"• {quando(f['criado_em'])} · {_e(f['tipo'])}: {_e((f['erro'] or '')[:120])}" for f in lst) or "Nenhum erro recente na fila.")


@cmd("latencia", "agentes", "Tempo médio para o agente executar um comando (24 h)")
def c_latencia(ctx, a):
    r = db.um("SELECT count(*) n, avg(fim_em - criado_em) m, max(fim_em - criado_em) x FROM fila_comandos WHERE tipo = 'enviar' AND estado = 'ok' AND criado_em > ? AND fim_em IS NOT NULL",
              (db.agora() - 86400,))
    ctx.enviar(f"Comandos de ar pela fila nas últimas 24 h: {r['n']}\nTempo médio: {num(r['m'] or 0)} s · maior: {num(r['x'] or 0)} s" if r["n"] else "Nenhum comando de ar pela fila nas últimas 24 h.")


@cmd("visto", "agentes", "Quando cada computador deu sinal de vida")
def c_visto(ctx, a):
    ctx.enviar("\n".join(f"• {_e(m.get('nome'))}: {quando(m.get('visto'))}" for m in _maquinas()) or "Nenhum computador.")


@cmd("reiniciaragente", "agentes", "Reinicia o agente de um computador", "/reiniciaragente NOME", arg="texto", papel=("dono", "admin"), confirmar=True)
def c_reiniciaragente(ctx, txt):
    ms = _achar(_maquinas(), txt)
    if len(ms) != 1:
        return ctx.enviar("Qual computador? Use /reiniciaragente NOME:\n" + "\n".join(f"• {_e(m.get('nome'))}" for m in _maquinas()))
    from .rotas import infra as rinfra
    r = rinfra.reiniciar_agente(rinfra.Reiniciar(id=ms[0]["id"]))
    ctx.enviar(_e(r.get("mensagem")))


# =====================================================================================================================
# AUTOMAÇÃO
# =====================================================================================================================
@cmd("cenas", "auto", "Executar uma cena", top=82)
def c_cenas(ctx, a):
    from . import telegram
    telegram._cenas(ctx.cid, ctx.mid)


def _cenas():
    from . import acesso
    f, p = acesso.filtro_sql("projeto_id")
    return db.consultar(f"SELECT id, nome FROM cenas WHERE true{f} ORDER BY nome", tuple(p))


@cmd("cena", "auto", "Executa uma cena pelo nome (pede confirmação)", "/cena NOME", arg="cena", perm="aparelhos.controlar", confirmar=True)
def c_cena(ctx, c):
    from .rotas import api as rapi
    r = rapi.executar_cena(int(c["id"]))
    falhas = [x for x in r.get("resultados", []) if not x["ok"]]
    ctx.enviar(f"Cena <b>{_e(c['nome'])}</b> executada." + (f" {len(falhas)} falha(s): {_e(falhas[0].get('erro', ''))[:160]}" if falhas else ""))


def _agendamentos():
    ids = [x["id"] for x in ares()] or [-1]
    return db.consultar(f"SELECT g.*, a.nome AS ar FROM agendamentos g LEFT JOIN aparelhos a ON a.id = g.aparelho_id WHERE g.aparelho_id IN ({','.join('?' * len(ids))}) ORDER BY g.hora", tuple(ids))


DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]   # como no banco e na tela: 0 = domingo


def _lista_dias(d) -> list[int]:
    if isinstance(d, (list, tuple)):
        return [int(x) for x in d]
    return [int(x) for x in str(d or "").replace("[", "").replace("]", "").split(",") if x.strip().isdigit()]


def _dias_txt(d):
    lst = sorted(set(_lista_dias(d)))
    if not lst or len(lst) == 7:
        return "todo dia"
    if lst == [1, 2, 3, 4, 5]:
        return "dias úteis"
    return ", ".join(DIAS[x % 7] for x in lst)


@cmd("agendamentos", "auto", "Agendamentos dos seus ares")
def c_agendamentos(ctx, a):
    lst = _agendamentos()
    ctx.enviar("\n".join(f"• {_e(g['hora'])} · {_e(g['nome'] or '')} · {_e(g['ar'])} · {_dias_txt(g['dias'])}{'' if g['ativo'] else ' (pausado)'}" for g in lst[:25]) or "Nenhum agendamento.")


@cmd("agendahoje", "auto", "O que está agendado para hoje")
def c_agendahoje(ctx, a):
    hoje = (datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).weekday() + 1) % 7   # 0 = domingo, como o agendador

    def vale(g):
        d = _lista_dias(g["dias"])
        return bool(g["ativo"]) and (not d or hoje in d)
    lst = [g for g in _agendamentos() if vale(g)]
    ctx.enviar("<b>Hoje</b>\n" + ("\n".join(f"• {_e(g['hora'])} · {_e(g['ar'])} · {_e(g['nome'] or '')}" for g in lst) or "Nada agendado para hoje."))


@cmd("proximos", "auto", "Próximos agendamentos de hoje (a partir de agora)")
def c_proximos(ctx, a):
    agora = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).strftime("%H:%M")
    hoje = (datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).weekday() + 1) % 7
    lst = [g for g in _agendamentos() if g["ativo"] and str(g["hora"]) >= agora and (not _lista_dias(g["dias"]) or hoje in _lista_dias(g["dias"]))]
    ctx.enviar("\n".join(f"• {_e(g['hora'])} · {_e(g['ar'])} · {_e(g['nome'] or '')}" for g in lst[:10]) or "Nada mais hoje.")


def _automacoes():
    return db.consultar("SELECT id, nome, ativo, disparos, ultimo_disparo FROM automacoes ORDER BY nome")


@cmd("automacoes", "auto", "Automações e quantas vezes cada uma disparou")
def c_automacoes(ctx, a):
    lst = _automacoes()
    ctx.enviar("\n".join(f"• {'●' if x['ativo'] else '○'} {_e(x['nome'])} · {x['disparos'] or 0} disparo(s) · último {quando(x['ultimo_disparo'])}" for x in lst) or "Nenhuma automação.")


def _auto_ativo(ctx, nome, ativo):
    from .rotas import api as rapi
    lst = _achar(_automacoes(), nome)
    if len(lst) != 1:
        return ctx.enviar("Qual automação?\n" + "\n".join(f"• {_e(x['nome'])}" for x in _automacoes()))
    rapi._automacao_permitida(lst[0]["id"])
    db.executar("UPDATE automacoes SET ativo = ? WHERE id = ?", (1 if ativo else 0, lst[0]["id"]))
    db.registrar("telegram", f"Automação {'ativada' if ativo else 'pausada'}: {lst[0]['nome']}")
    ctx.enviar(f"Automação <b>{_e(lst[0]['nome'])}</b> {'ativada' if ativo else 'pausada'}.")


@cmd("ativarauto", "auto", "Ativa uma automação", "/ativarauto NOME", arg="texto", perm="automacoes.gerenciar")
def c_ativarauto(ctx, txt):
    _auto_ativo(ctx, txt, True)


@cmd("pausarauto", "auto", "Pausa uma automação", "/pausarauto NOME", arg="texto", perm="automacoes.gerenciar")
def c_pausarauto(ctx, txt):
    _auto_ativo(ctx, txt, False)


@cmd("rodarauto", "auto", "Executa as ações de uma automação agora", "/rodarauto NOME", arg="texto", perm="aparelhos.controlar", confirmar=True)
def c_rodarauto(ctx, txt):
    from .rotas import api as rapi
    lst = _achar(_automacoes(), txt)
    if len(lst) != 1:
        return ctx.enviar("Qual automação? Use o nome exato.")
    rapi.executar_automacao(lst[0]["id"])
    ctx.enviar(f"Ações de <b>{_e(lst[0]['nome'])}</b> executadas.")


@cmd("timers", "auto", "Temporizadores marcados", top=60)
def c_timers(ctx, a):
    ids = [x["id"] for x in ares()] or [-1]
    lst = db.consultar(f"SELECT t.executar_em, t.acao, a.nome FROM temporizadores t JOIN aparelhos a ON a.id = t.aparelho_id WHERE t.aparelho_id IN ({','.join('?' * len(ids))}) ORDER BY t.executar_em", tuple(ids))
    def acao(x):
        v = json.loads(x) if isinstance(x, str) else (x or {})
        return "desliga" if v.get("ligado") is False else "liga"
    ctx.enviar("\n".join(f"• {_e(t['nome'])} {acao(t['acao'])} em {tempo(t['executar_em'] - db.agora())}" for t in lst) or "Nenhum temporizador marcado.")


@cmd("cancelartimers", "auto", "Cancela todos os temporizadores dos seus ares", perm="aparelhos.controlar", confirmar=True)
def c_cancelartimers(ctx, a):
    ids = [x["id"] for x in ares()] or [-1]
    n = db.um(f"SELECT count(*) n FROM temporizadores WHERE aparelho_id IN ({','.join('?' * len(ids))})", tuple(ids))["n"]
    db.executar(f"DELETE FROM temporizadores WHERE aparelho_id IN ({','.join('?' * len(ids))})", tuple(ids))
    db.registrar("telegram", "Temporizadores cancelados", detalhe=f"{n}")
    ctx.enviar(f"{n} temporizador(es) cancelado(s).")


@cmd("rotinaslog", "auto", "Últimas execuções de cenas e automações")
def c_rotinaslog(ctx, a):
    lst = db.consultar("SELECT quando, origem, acao, ok FROM atividade WHERE origem LIKE 'automacao:%' OR origem LIKE 'cena:%' ORDER BY quando DESC LIMIT 12")
    ctx.enviar("\n".join(f"• {quando(e['quando'])} · {_e(e['origem'])} · {_e(e['acao'][:40])}{'' if e['ok'] else ' (falhou)'}" for e in lst) or "Nenhuma execução registrada.")


# =====================================================================================================================
# RELATÓRIOS
# =====================================================================================================================
def _resumo_txt(titulo, d):
    r = d["resumo"]
    return (f"<b>{_e(titulo)}</b>\nComandos: {r['comandos']} ({num(r['sucesso_pct'])}% ok)\nHoras ligado: {num(r['horas_ligado'])} h\n"
            f"Consumo: {num(r['kwh'])} kWh\nCusto estimado: {brl(r['custo'])}\nFora do expediente: {num(r['fora_expediente_pct'])}%")


@cmd("relatorio", "dados", "Resumo dos últimos 7 dias", perm="relatorios.ver", top=81)
def c_relatorio(ctx, a):
    from . import telegram
    telegram._relatorio(ctx.cid, ctx.mid)


@cmd("hoje", "dados", "Resumo de hoje", perm="relatorios.ver", top=79)
def c_hoje(ctx, a):
    from . import relatorio
    ctx.enviar(_resumo_txt("Hoje", relatorio.montar(_inicio_dia(), db.agora())))


@cmd("ontem", "dados", "Resumo de ontem", perm="relatorios.ver")
def c_ontem(ctx, a):
    from . import relatorio
    ctx.enviar(_resumo_txt("Ontem", relatorio.montar(_inicio_dia(-1), _inicio_dia())))


@cmd("semana", "dados", "Resumo dos últimos 7 dias", perm="relatorios.ver")
def c_semana(ctx, a):
    ctx.enviar(_resumo_txt("Últimos 7 dias", _relatorio(7)))


@cmd("mes", "dados", "Resumo dos últimos 30 dias", perm="relatorios.ver")
def c_mes(ctx, a):
    ctx.enviar(_resumo_txt("Últimos 30 dias", _relatorio(30)))


@cmd("gasto", "dados", "Custo estimado em 30 dias e projeção", perm="relatorios.ver", top=78)
def c_gasto(ctx, a):
    r = _relatorio(30)["resumo"]
    ctx.enviar(f"<b>Gasto (30 dias, estimativa)</b>\n{brl(r['custo'])} ({num(r['kwh'])} kWh)\nPor dia: {brl(r['custo_dia'])}\nVariação: {num(r['variacao_custo_pct'])}% vs período anterior")


@cmd("gastohoje", "dados", "Custo estimado de hoje", perm="relatorios.ver")
def c_gastohoje(ctx, a):
    from . import relatorio
    r = relatorio.montar(_inicio_dia(), db.agora())["resumo"]
    ctx.enviar(f"Hoje até agora: {brl(r['custo'])} ({num(r['kwh'])} kWh, {num(r['horas_ligado'])} h ligado).")


@cmd("projecao", "dados", "Quanto a conta dos ares fica no mês, no ritmo atual", perm="relatorios.ver")
def c_projecao(ctx, a):
    r = _relatorio(7)["resumo"]
    ctx.enviar(f"No ritmo dos últimos 7 dias: <b>{brl(r['projecao_mes'])}</b> por mês ({num(r['projecao_kwh_mes'])} kWh).")


@cmd("kwh", "dados", "Consumo em kWh: hoje, 7 e 30 dias", perm="relatorios.ver")
def c_kwh(ctx, a):
    from . import relatorio
    h = relatorio.montar(_inicio_dia(), db.agora())["resumo"]["kwh"]
    ctx.enviar(f"Hoje: {num(h)} kWh\n7 dias: {num(_relatorio(7)['resumo']['kwh'])} kWh\n30 dias: {num(_relatorio(30)['resumo']['kwh'])} kWh")


@cmd("horas", "dados", "Horas ligado por ar (7 dias)", perm="relatorios.ver")
def c_horas(ctx, a):
    d = _relatorio(7)
    ctx.enviar("<b>Horas ligado (7 dias)</b>\n" + "\n".join(f"• {_e(p['nome'])}: {num(p.get('horas_ligado', 0))} h" for p in sorted(d["por_aparelho"], key=lambda x: -x.get("horas_ligado", 0))[:15]))


@cmd("ranking", "dados", "Ares mais usados (7 dias)", perm="relatorios.ver")
def c_ranking(ctx, a):
    d = _relatorio(7)
    ctx.enviar("<b>Mais usados (7 dias)</b>\n" + "\n".join(f"{i + 1}. {_e(p['nome'])}: {p['comandos']} comando(s), {brl(p.get('custo', 0))}" for i, p in enumerate(d["por_aparelho"][:10])))


@cmd("origens", "dados", "De onde vieram os comandos (painel, Alexa, Telegram…)", perm="relatorios.ver")
def c_origens(ctx, a):
    d = _relatorio(7)
    ctx.enviar("<b>Origem dos comandos (7 dias)</b>\n" + "\n".join(f"• {_e(o['origem'])}: {o['comandos']}" for o in d["por_origem"][:12]) or "Sem comandos.")


@cmd("pico", "dados", "Horário e dia de maior uso", perm="relatorios.ver")
def c_pico(ctx, a):
    d = _relatorio(30)
    h = max(d["por_hora"], key=lambda x: x["comandos"]) if d["por_hora"] else None
    s = max(d["por_dia_semana"], key=lambda x: x.get("horas", 0)) if d.get("por_dia_semana") else None
    ctx.enviar(f"Hora de pico: {h['hora']}h ({h['comandos']} comandos em 30 dias)" + (f"\nDia mais movimentado: {_e(s.get('dia'))}" if s else "") if h else "Sem dados.")


@cmd("foraexpediente", "dados", "Uso fora do expediente (30 dias)", perm="relatorios.ver")
def c_foraexpediente(ctx, a):
    r = _relatorio(30)["resumo"]
    ctx.enviar(f"Fora do expediente: {num(r['fora_expediente_h'])} h ({num(r['fora_expediente_pct'])}% do tempo ligado), cerca de {brl(r['custo_fora_expediente'])}.")


@cmd("comparar", "dados", "Esta semana contra a anterior", perm="relatorios.ver")
def c_comparar(ctx, a):
    r = _relatorio(7)["resumo"]
    ctx.enviar(f"<b>7 dias vs 7 anteriores</b>\nComandos: {r['comandos_periodo_anterior']} → {r['comandos']} ({num(r['variacao_comandos_pct'])}%)\n"
               f"Horas: {num(r['horas_periodo_anterior'])} → {num(r['horas_ligado'])} ({num(r['variacao_horas_pct'])}%)\nCusto: {brl(r['custo_periodo_anterior'])} → {brl(r['custo'])} ({num(r['variacao_custo_pct'])}%)")


@cmd("quemmudou", "dados", "Quem mudou um ar por último (origem)", "/quemmudou NOME", arg="ar?", perm="atividade.ver")
def c_quemmudou(ctx, a):
    ev = db.consultar("SELECT quando, origem, acao FROM atividade WHERE aparelho_id = ? AND ok = 1 ORDER BY quando DESC LIMIT 5", (a["id"],))
    ctx.enviar(f"<b>{_e(a['nome'])}</b>\n" + "\n".join(f"• {quando(e['quando'])} · {_e(e['origem'])} · {_e(e['acao'][:40])}" for e in ev) or "Nada registrado.")


@cmd("atividade", "dados", "Últimos 15 eventos do sistema", perm="atividade.ver", top=77)
def c_atividade(ctx, a):
    ids = [x["id"] for x in ares()] or [-1]
    lst = db.consultar(f"SELECT quando, origem, acao, ok FROM atividade WHERE aparelho_id IN ({','.join('?' * len(ids))}) OR aparelho_id IS NULL ORDER BY quando DESC LIMIT 15", tuple(ids))
    ctx.enviar("\n".join(f"{quando(e['quando'])} · {_e(e['acao'][:48])} · {_e(e['origem'])}{'' if e['ok'] else ' · falhou'}" for e in lst) or "Nada registrado.")


@cmd("falhas", "dados", "Comandos que falharam nas últimas 24 h", perm="atividade.ver", top=76)
def c_falhas(ctx, a):
    ids = [x["id"] for x in ares()] or [-1]
    lst = db.consultar(f"SELECT quando, origem, acao, detalhe FROM atividade WHERE ok = 0 AND quando > ? AND (aparelho_id IN ({','.join('?' * len(ids))}) OR aparelho_id IS NULL) ORDER BY quando DESC LIMIT 10",
                       (db.agora() - 86400, *ids))
    ctx.enviar("\n\n".join(f"{quando(e['quando'])} · <b>{_e(e['acao'][:48])}</b>\n{_e((e['detalhe'] or '')[:160])}" for e in lst) or "Nenhuma falha nas últimas 24 h.")


@cmd("telegramlog", "dados", "Comandos feitos pelo Telegram (24 h)", perm="atividade.ver")
def c_telegramlog(ctx, a):
    lst = db.consultar("SELECT quando, acao, ok FROM atividade WHERE origem LIKE 'telegram%' AND quando > ? ORDER BY quando DESC LIMIT 15", (db.agora() - 86400,))
    ctx.enviar("\n".join(f"{quando(e['quando'])} · {_e(e['acao'][:50])}{'' if e['ok'] else ' · falhou'}" for e in lst) or "Nenhum comando pelo Telegram nas últimas 24 h.")


@cmd("tarifa", "dados", "Tarifa de energia usada nas estimativas")
def c_tarifa(ctx, a):
    ctx.enviar(f"Tarifa: {brl(db.cfg('tarifa_kwh', 0.85))} por kWh (muda em Relatórios no painel).")


@cmd("temperaturamedia", "dados", "Temperatura média escolhida (30 dias)", perm="relatorios.ver")
def c_temperaturamedia(ctx, a):
    d = _relatorio(30)
    t = d["resumo"]["temperatura_media"]
    top = sorted(d.get("temperaturas", []), key=lambda x: -x["vezes"])[:3]
    ctx.enviar((f"Temperatura média escolhida: {num(t)}°C" if t else "Sem dados.") + ("\nMais pedidas: " + ", ".join(f"{x['temperatura']}° ({x['vezes']}x)" for x in top) if top else ""))


@cmd("sessoes", "dados", "Vezes que um ar ficou ligado 10 h ou mais (30 dias)", perm="relatorios.ver")
def c_sessoes(ctx, a):
    d = _relatorio(30)
    longas = [s for s in d.get("sessoes", []) if s.get("horas", 0) >= 10]
    ctx.enviar("\n".join(f"• {_e(s['aparelho'])}: {num(s['horas'])} h desde {quando(s['inicio'])}" for s in longas[:10]) or "Nenhuma sessão de 10 h ou mais em 30 dias.")


@cmd("conclusoes", "dados", "O que o relatório concluiu (30 dias)", perm="relatorios.ver", top=40)
def c_conclusoes(ctx, a):
    cs = _relatorio(30).get("conclusoes") or []
    ctx.enviar("<b>Conclusões (30 dias)</b>\n" + "\n".join(f"• {_e(c['texto'])}" for c in cs[:8]) if cs else "Sem conclusões: período sem uso.")


@cmd("diasemana", "dados", "Horas de uso por dia da semana (30 dias)", perm="relatorios.ver")
def c_diasemana(ctx, a):
    d = _relatorio(30)
    ctx.enviar("\n".join(f"• {_e(x['dia'])}: {num(x.get('horas', 0))} h" for x in d.get("por_dia_semana", [])) or "Sem dados.")


@cmd("alertas", "dados", "Alertas abertos (ar ligado demais, falhas seguidas)", top=59)
def c_alertas(ctx, a):
    lst = db.consultar("SELECT criado_em, mensagem FROM alertas WHERE NOT resolvido ORDER BY id DESC LIMIT 10")
    ctx.enviar("\n".join(f"• {quando(x['criado_em'])} · {_e(x['mensagem'][:160])}" for x in lst) or "Nenhum alerta aberto.")


@cmd("exportar", "dados", "Links para baixar o relatório em PDF, Excel ou Word", perm="relatorios.ver")
def c_exportar(ctx, a):
    ctx.enviar("O relatório completo abre no painel, com exportação em PDF, Word, Excel, CSV e outros:",
               [[{"text": "Abrir relatórios", "url": "https://app.zynio.com.br/relatorios"}], [{"text": "Menu", "callback_data": "m:menu"}]])


# =====================================================================================================================
# CLIMA EXTERNO
# =====================================================================================================================
@cmd("tempo", "clima", "Como está o tempo lá fora agora", top=75)
def c_tempo(ctx, a):
    d = _clima()
    if not d.get("disponivel"):
        return ctx.enviar("Previsão indisponível agora.")
    ctx.enviar(f"<b>{_e(d['cidade'])}</b> agora: {num(d['temperatura'])}°C, {_e(d['condicao'])}\nSensação {num(d['sensacao'])}°C · umidade {d['umidade']}% · vento {num(d['vento'])} km/h\n<i>Fonte: {_e(d.get('fonte'))}</i>")


@cmd("previsao", "clima", "Próximos 3 dias")
def c_previsao(ctx, a):
    d = _clima()
    ctx.enviar("\n".join(f"• {_e(x['data'][8:10])}/{_e(x['data'][5:7])}: {num(x['min'])}° a {num(x['max'])}°, {_e(x['condicao'])}, chuva {x['chuva']}%" for x in d.get("dias", [])) or "Previsão indisponível.")


@cmd("amanha", "clima", "Previsão de amanhã")
def c_amanha(ctx, a):
    dias = _clima().get("dias") or []
    x = dias[1] if len(dias) > 1 else None
    ctx.enviar(f"Amanhã: {num(x['min'])}° a {num(x['max'])}°, {_e(x['condicao'])}, chance de chuva {x['chuva']}%." if x else "Previsão indisponível.")


@cmd("chuva", "clima", "Vai chover nas próximas horas?")
def c_chuva(ctx, a):
    ps = _clima().get("proximas") or []
    com = [p for p in ps if (p.get("chuva") or 0) >= 40]
    ctx.enviar(("Chance de chuva às " + ", ".join(f"{p['hora']} ({p['chuva']}%)" for p in com[:6]) + ".") if com else "Sem chuva prevista nas próximas 12 horas.")


@cmd("horas12", "clima", "Temperatura hora a hora (12 h)")
def c_horas12(ctx, a):
    ps = _clima().get("proximas") or []
    ctx.enviar("\n".join(f"{_e(p['hora'])} · {num(p['temperatura'])}° · {_e(p['condicao'])} · chuva {p['chuva']}%" for p in ps) or "Previsão indisponível.")


@cmd("sol", "clima", "Nascer e pôr do sol hoje")
def c_sol(ctx, a):
    from . import dispositivos
    s = dispositivos.sol_do_dia()
    ctx.enviar(f"Nascer do sol: {s['nascer']} · pôr do sol: {s['por']} (horário de Brasília).")


@cmd("sensacao", "clima", "Sensação térmica lá fora")
def c_sensacao(ctx, a):
    d = _clima()
    ctx.enviar(f"Sensação térmica: {num(d.get('sensacao'))}°C (temperatura {num(d.get('temperatura'))}°C)." if d.get("disponivel") else "Indisponível.")


@cmd("umidade", "clima", "Umidade do ar lá fora")
def c_umidade(ctx, a):
    d = _clima()
    u = d.get("umidade")
    ctx.enviar(f"Umidade: {u}%." + (" Alta: o modo seco (desumidificar) ajuda o conforto." if u and u >= 75 else "") if d.get("disponivel") else "Indisponível.")


@cmd("vento", "clima", "Vento lá fora")
def c_vento(ctx, a):
    d = _clima()
    ctx.enviar(f"Vento: {num(d.get('vento'))} km/h." if d.get("disponivel") else "Indisponível.")


@cmd("recomendar", "clima", "Modo e temperatura sugeridos pelo tempo de agora")
def c_recomendar(ctx, a):
    d = _clima()
    if not d.get("disponivel"):
        return ctx.enviar("Indisponível.")
    t, u = d["temperatura"], d.get("umidade") or 0
    if t >= 28:
        s = "frio 23° a 24°"
    elif t >= 24:
        s = "frio 24° a 25°"
    elif t <= 16:
        s = "quente 22° a 24°"
    elif u >= 80:
        s = "seco (desumidificar)"
    else:
        s = "ventilar, ou desligado"
    ctx.enviar(f"Lá fora {num(t)}°C e {u}% de umidade. Sugestão: <b>{s}</b>.\n<i>Regra simples a partir da previsão; cada sala pode pedir outro ajuste.</i>")


@cmd("diferenca", "clima", "Diferença entre lá fora e o que os ares ligados estão pedindo")
def c_diferenca(ctx, a):
    d = _clima()
    lig = [x for x in ares() if x["ligado"]]
    if not d.get("disponivel") or not lig:
        return ctx.enviar("Sem ar ligado ou sem previsão agora.")
    ctx.enviar(f"Lá fora: {num(d['temperatura'])}°C\n" + "\n".join(f"• {_e(x['nome'])}: {x['temperatura']}° ({num(d['temperatura'] - x['temperatura'])}° de diferença)" for x in lig[:15]))


# =====================================================================================================================
# LUZES E APARELHOS
# =====================================================================================================================
def _disp(tipo=None):
    from . import dispositivos
    from .rotas import dispositivos as rd
    f, p = rd._escopo()
    return dispositivos.listar(tipo, f, p)


def _cmd_disp(ctx, d, acao, valor=None, msg=""):
    from . import acesso, dispositivos
    if not acesso.pode("aparelhos.controlar"):
        raise RuntimeError("seu usuário não tem permissão para isto.")
    from .rotas import dispositivos as rd
    rd._pegar(int(d["id"]))
    dispositivos.comando(int(d["id"]), acao, valor, f"telegram:{(ctx.u.get('nome') or '')[:20]}")
    ctx.enviar(msg or f"{_e(d['nome'])}: feito.")


@cmd("dispositivos", "disp", "Todos os aparelhos além dos ares (luzes, cafeteira, persianas, fechadura)")
def c_dispositivos(ctx, a):
    lst = _disp()
    ctx.enviar("\n".join(f"• {_e(d['nome'])} · {_e(d['tipo'])} · {'conectado' if d['conectado'] else 'sem aparelho conectado'}" for d in lst[:40]) or "Nenhum aparelho cadastrado.")


@cmd("luzes", "disp", "Acender e apagar as luzes", top=74)
def c_luzes(ctx, a):
    from . import telegram
    telegram._luzes(ctx.cid, ctx.mid)


def _um_disp(ctx, tipo, txt):
    lst = [d for d in _disp(tipo) if d["conectado"]] if tipo else _disp()
    ach = _achar(lst, txt) if txt else (lst if len(lst) == 1 else [])
    if len(ach) != 1:
        ctx.enviar("Qual? " + (", ".join(_e(d["nome"]) for d in lst[:20]) or "Nenhum conectado."))
        return None
    return ach[0]


@cmd("acender", "disp", "Acende uma luz", "/acender NOME", arg="texto", perm="aparelhos.controlar")
def c_acender(ctx, txt):
    d = _um_disp(ctx, "luz", txt)
    if d:
        _cmd_disp(ctx, d, "ligar", msg=f"{_e(d['nome'])}: acesa.")


@cmd("apagar", "disp", "Apaga uma luz", "/apagar NOME", arg="texto", perm="aparelhos.controlar")
def c_apagar(ctx, txt):
    d = _um_disp(ctx, "luz", txt)
    if d:
        _cmd_disp(ctx, d, "desligar", msg=f"{_e(d['nome'])}: apagada.")


@cmd("brilho", "disp", "Brilho de uma luz (1 a 100)", "/brilho NOME 60", arg="texto", perm="aparelhos.controlar")
def c_brilho(ctx, txt):
    m = re.search(r"(\d+)\s*%?$", txt)
    if not m:
        return ctx.enviar("Use: /brilho NOME 60")
    d = _um_disp(ctx, "luz", txt[:m.start()].strip())
    if d:
        _cmd_disp(ctx, d, "brilho", int(m.group(1)), f"{_e(d['nome'])}: brilho {m.group(1)}%.")


def _todas_luzes(ctx, acao):
    ok = 0
    for d in [d for d in _disp("luz") if d["conectado"]]:
        try:
            from . import dispositivos
            dispositivos.comando(int(d["id"]), acao, None, "telegram"); ok += 1
        except Exception:  # noqa: BLE001
            pass
    ctx.enviar(f"{ok} luz(es) {'acesa(s)' if acao == 'ligar' else 'apagada(s)'}.")


@cmd("acendertodas", "disp", "Acende todas as luzes (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_acendertodas(ctx, a):
    _todas_luzes(ctx, "ligar")


@cmd("apagartodas", "disp", "Apaga todas as luzes (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_apagartodas(ctx, a):
    _todas_luzes(ctx, "desligar")


@cmd("cafeteira", "disp", "Estado da cafeteira")
def c_cafeteira(ctx, a):
    lst = _disp("cafeteira")
    if not lst:
        return ctx.enviar("Nenhuma cafeteira cadastrada.")
    d = lst[0]
    r = d.get("resumo") or {}
    ctx.enviar(f"<b>{_e(d['nome'])}</b>: " + ("sem aparelho conectado (pareie a tomada no Smart Life)." if not d["conectado"] else f"{'ligada' if r.get('ligada') else 'desligada'}" + (f", {num(r['potencia_w'])} W" if r.get("potencia_w") else "")),
               [[{"text": "Ligar", "callback_data": "x:cafe"}, {"text": "Desligar", "callback_data": "x:desligarcafe"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("cafe", "disp", "Liga a cafeteira", perm="aparelhos.controlar", top=58)
def c_cafe(ctx, a):
    d = _um_disp(ctx, "cafeteira", "")
    if d:
        _cmd_disp(ctx, d, "ligar", msg="Cafeteira ligada.")


@cmd("desligarcafe", "disp", "Desliga a cafeteira", perm="aparelhos.controlar")
def c_desligarcafe(ctx, a):
    d = _um_disp(ctx, "cafeteira", "")
    if d:
        _cmd_disp(ctx, d, "desligar", msg="Cafeteira desligada.")


@cmd("persianas", "disp", "Persianas e a posição de cada uma")
def c_persianas(ctx, a):
    lst = _disp("persiana")
    ctx.enviar("\n".join(f"• {_e(d['nome'])}: " + (f"{(d.get('resumo') or {}).get('posicao', '?')}%" if d["conectado"] else "sem motor conectado") for d in lst) or "Nenhuma persiana cadastrada.")


def _todas_persianas(ctx, acao):
    ok = 0
    for d in [d for d in _disp("persiana") if d["conectado"]]:
        try:
            from . import dispositivos
            dispositivos.comando(int(d["id"]), acao, None, "telegram"); ok += 1
        except Exception:  # noqa: BLE001
            pass
    ctx.enviar(f"{ok} persiana(s): {acao}." if ok else "Nenhuma persiana com motor conectado.")


@cmd("abrirpersianas", "disp", "Abre todas as persianas (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_abrirpersianas(ctx, a):
    _todas_persianas(ctx, "abrir")


@cmd("fecharpersianas", "disp", "Fecha todas as persianas (pede confirmação)", perm="aparelhos.controlar", confirmar=True)
def c_fecharpersianas(ctx, a):
    _todas_persianas(ctx, "fechar")


@cmd("persiana", "disp", "Posição de uma persiana (0 fechada, 100 aberta)", "/persiana NOME 50", arg="texto", perm="aparelhos.controlar")
def c_persiana(ctx, txt):
    m = re.search(r"(\d+)\s*%?$", txt)
    if not m:
        return ctx.enviar("Use: /persiana NOME 50")
    d = _um_disp(ctx, "persiana", txt[:m.start()].strip())
    if d:
        _cmd_disp(ctx, d, "posicao", int(m.group(1)), f"{_e(d['nome'])}: {m.group(1)}%.")


@cmd("abrir", "disp", "Abre uma persiana", "/abrir NOME", arg="texto", perm="aparelhos.controlar")
def c_abrir(ctx, txt):
    d = _um_disp(ctx, "persiana", txt)
    if d:
        _cmd_disp(ctx, d, "abrir", msg=f"{_e(d['nome'])}: abrindo.")


@cmd("fechar", "disp", "Fecha uma persiana", "/fechar NOME", arg="texto", perm="aparelhos.controlar")
def c_fechar(ctx, txt):
    d = _um_disp(ctx, "persiana", txt)
    if d:
        _cmd_disp(ctx, d, "fechar", msg=f"{_e(d['nome'])}: fechando.")


@cmd("fechadura", "disp", "Estado da fechadura da porta")
def c_fechadura(ctx, a):
    lst = _disp("fechadura")
    if not lst:
        return ctx.enviar("Nenhuma fechadura cadastrada.")
    d = lst[0]
    r = d.get("resumo") or {}
    ctx.enviar(f"<b>{_e(d['nome'])}</b>: " + ("sem aparelho conectado." if not d["conectado"] else
               f"{'trancada' if r.get('trancada') else 'destrancada' if r.get('trancada') is False else 'estado desconhecido'}"
               + (f", porta {'aberta' if r.get('porta_aberta') else 'fechada'}" if r.get("porta_aberta") is not None else "") + (f", bateria {r['bateria']}" if r.get("bateria") else "")))


@cmd("trancar", "disp", "Tranca a porta (se o modelo aceitar pela internet)", perm="aparelhos.controlar", confirmar=True)
def c_trancar(ctx, a):
    d = _um_disp(ctx, "fechadura", "")
    if d:
        _cmd_disp(ctx, d, "trancar", msg="Pedido para trancar enviado.")


@cmd("destrancar", "disp", "Destranca a porta (pede confirmação; dono ou admin)", papel=("dono", "admin"), confirmar=True)
def c_destrancar(ctx, a):
    d = _um_disp(ctx, "fechadura", "")
    if d:
        _cmd_disp(ctx, d, "destrancar", msg="Pedido para destrancar enviado.")


@cmd("eventosdisp", "disp", "Últimos eventos de um aparelho", "/eventosdisp NOME", arg="texto")
def c_eventosdisp(ctx, txt):
    from . import dispositivos
    d = _um_disp(ctx, None, txt)
    if d:
        ev = dispositivos.eventos(int(d["id"]), 10)
        ctx.enviar(f"<b>{_e(d['nome'])}</b>\n" + ("\n".join(f"• {quando(e['quando'])} · {_e(e['acao'])} · {_e(e['origem'])}" for e in ev) or "Nada registrado."))


@cmd("enoite", "disp", "Já anoiteceu? (as luzes automáticas usam isto)")
def c_enoite(ctx, a):
    from . import dispositivos
    s = dispositivos.sol_do_dia()
    ctx.enviar(("Já é noite." if dispositivos.e_noite() else "Ainda é dia.") + f" Pôr do sol hoje: {s['por']}.")


# =====================================================================================================================
# MÚSICA
# =====================================================================================================================
def _musica(ctx, acao, msg, **kw):
    from . import acesso, musica
    if not acesso.pode("aparelhos.controlar"):
        raise RuntimeError("seu usuário não tem permissão para isto.")
    musica.comando(acao, **kw)
    ctx.enviar(msg, [[{"text": "Tocando agora", "callback_data": "x:musica"}, {"text": "Menu", "callback_data": "m:menu"}]])


@cmd("musica", "musica", "O que está tocando no Spotify", top=57)
def c_musica(ctx, a):
    from . import musica
    t = musica.tocando()
    if not t or not t.get("item"):
        return ctx.enviar("Nada tocando agora (ou o Spotify não está conectado).", [[{"text": "Tocar", "callback_data": "x:play"}, {"text": "Menu", "callback_data": "m:menu"}]])
    it = t["item"]
    art = ", ".join(x.get("name", "") for x in it.get("artists", []))
    ctx.enviar(f"{'Tocando' if t.get('is_playing') else 'Pausado'}: <b>{_e(it.get('name'))}</b> · {_e(art)}\nNo aparelho: {_e((t.get('device') or {}).get('name'))}",
               [[{"text": "Anterior", "callback_data": "x:anterior"}, {"text": "Pausar" if t.get("is_playing") else "Tocar", "callback_data": "x:pause" if t.get("is_playing") else "x:play"}, {"text": "Próxima", "callback_data": "x:proxima"}],
                [{"text": "Volume −", "callback_data": "x:maisbaixo"}, {"text": "Volume +", "callback_data": "x:maisalto"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("play", "musica", "Continua a música")
def c_play(ctx, a):
    _musica(ctx, "tocar", "Tocando.")


@cmd("pause", "musica", "Pausa a música")
def c_pause(ctx, a):
    _musica(ctx, "pausar", "Pausado.")


@cmd("proxima", "musica", "Próxima música")
def c_proxima(ctx, a):
    _musica(ctx, "proxima", "Próxima.")


@cmd("anterior", "musica", "Música anterior")
def c_anterior(ctx, a):
    _musica(ctx, "anterior", "Anterior.")


@cmd("volume", "musica", "Volume de 0 a 100", "/volume 40", arg="num")
def c_volume(ctx, n):
    _musica(ctx, "volume", f"Volume {int(n)}%.", volume=max(0, min(100, int(n))))


def _vol_rel(ctx, delta):
    from . import musica
    t = musica.tocando() or {}
    v = ((t.get("device") or {}).get("volume_percent") or 50) + delta
    _musica(ctx, "volume", f"Volume {max(0, min(100, v))}%.", volume=max(0, min(100, v)))


@cmd("maisalto", "musica", "Volume +10")
def c_maisalto(ctx, a):
    _vol_rel(ctx, 10)


@cmd("maisbaixo", "musica", "Volume −10")
def c_maisbaixo(ctx, a):
    _vol_rel(ctx, -10)


@cmd("tocar", "musica", "Procura e toca uma música, artista ou playlist", "/tocar nome da música", arg="texto")
def c_tocar(ctx, txt):
    from . import musica
    r = musica.buscar(txt, "track,playlist")
    item = ((r.get("tracks") or {}).get("items") or [None])[0] or ((r.get("playlists") or {}).get("items") or [None])[0]
    if not item:
        return ctx.enviar(f"Nada encontrado para “{_e(txt)}”.")
    _musica(ctx, "tocar", f"Tocando <b>{_e(item.get('name'))}</b>.", uri=item.get("uri"))


@cmd("aleatorio", "musica", "Liga ou desliga o modo aleatório", "/aleatorio sim|nao", arg="texto")
def c_aleatorio(ctx, txt):
    on = not (txt or "").lower().startswith("n")
    _musica(ctx, "aleatorio", f"Aleatório {'ligado' if on else 'desligado'}.", valor=on)


@cmd("repetir", "musica", "Repetir: musica, playlist ou nao", "/repetir playlist", arg="texto")
def c_repetir(ctx, txt):
    v = {"musica": "track", "música": "track", "playlist": "context", "nao": "off", "não": "off"}.get((txt or "").lower().strip(), "context")
    _musica(ctx, "repetir", f"Repetir: {_e(txt or 'playlist')}.", valor=v)


@cmd("aparelhosmusica", "musica", "Onde dá para tocar (Echo, computador, celular)")
def c_aparelhosmusica(ctx, a):
    from . import musica
    lst = musica.chamar("GET", "/me/player/devices").get("devices", [])
    ctx.enviar("\n".join(f"• {_e(d['name'])} ({_e(d['type'])}){' · ativo' if d.get('is_active') else ''}" for d in lst) or "Nenhum aparelho do Spotify disponível agora.")


@cmd("playlists", "musica", "Suas playlists")
def c_playlists(ctx, a):
    from . import musica
    lst = musica.playlists()[:15]
    ctx.enviar("\n".join(f"• {_e(p.get('name'))}" for p in lst) or "Nenhuma playlist.")


@cmd("rotinasmusica", "musica", "Rotinas de música (horário ou quando um ar liga)")
def c_rotinasmusica(ctx, a):
    from . import musica
    lst = musica.rotinas()
    ctx.enviar("\n".join(f"• {'●' if r.get('ativo', True) else '○'} {_e(r.get('nome') or r.get('id'))}" for r in lst) or "Nenhuma rotina de música.")


# =====================================================================================================================
# NOTIFICAÇÕES, BUGS, NOVIDADES E AVISOS
# =====================================================================================================================
def _notifs(filtro="todas", n=8):
    from . import notificacoes
    from .rotas import api as rapi
    r = notificacoes.listar(filtro, 60)
    vis = rapi._visibilidade_notificacoes()
    return [x for x in r["itens"] if vis is None or vis(x)][:n]


@cmd("notificacoes", "avisos", "Últimas notificações", top=73)
def c_notificacoes(ctx, a):
    from . import telegram
    telegram._notificacoes(ctx.cid, ctx.mid)


@cmd("naolidas", "avisos", "Notificações não lidas")
def c_naolidas(ctx, a):
    lst = _notifs("nao_lidas", 10)
    ctx.enviar("\n\n".join(f"<b>{_e(n['titulo'])}</b>\n{_e((n.get('detalhe') or '')[:160])}" for n in lst) or "Nada não lido.", [[{"text": "Marcar todas como lidas", "callback_data": "x:marcarlidas"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("importantes", "avisos", "Notificações importantes abertas")
def c_importantes(ctx, a):
    lst = _notifs("importantes", 10)
    ctx.enviar("\n\n".join(f"<b>{_e(n['titulo'])}</b>\n{_e((n.get('detalhe') or '')[:160])}" for n in lst) or "Nenhuma notificação importante aberta.")


@cmd("marcarlidas", "avisos", "Marca todas as notificações como lidas")
def c_marcarlidas(ctx, a):
    from .rotas import api as rapi
    rapi.ler_todas_notificacoes()
    ctx.enviar("Notificações marcadas como lidas.")


@cmd("bugs", "avisos", "Bugs abertos (seus, ou todos se você for dono ou admin)")
def c_bugs(ctx, a):
    w, p = ("", ()) if _dono_admin(ctx) else (" AND autor_id = ?", (ctx.u["id"],))
    lst = db.consultar(f"SELECT id, titulo, gravidade, estado FROM bugs WHERE estado IN ('aberto','analisando'){w} ORDER BY atualizado_em DESC LIMIT 15", p)
    ctx.enviar("\n".join(f"• #{b['id']} {_e(b['titulo'][:70])} · {_e(b['gravidade'])}" for b in lst) or "Nenhum bug aberto.")


@cmd("bugstodos", "avisos", "Últimos bugs, inclusive os corrigidos")
def c_bugstodos(ctx, a):
    w, p = ("", ()) if _dono_admin(ctx) else (" WHERE autor_id = ?", (ctx.u["id"],))
    lst = db.consultar(f"SELECT id, titulo, estado FROM bugs{w} ORDER BY atualizado_em DESC LIMIT 15", p)
    ctx.enviar("\n".join(f"• #{b['id']} {_e(b['titulo'][:70])} · {_e(b['estado'])}" for b in lst) or "Nenhum bug registrado.")


@cmd("bug", "avisos", "Detalhe de um bug", "/bug 12", arg="num")
def c_bug(ctx, n):
    b = db.um("SELECT * FROM bugs WHERE id = ?", (int(n),))
    if not b or (not _dono_admin(ctx) and str(b.get("autor_id")) != str(ctx.u["id"])):
        return ctx.enviar("Bug não encontrado.")
    corr = ((b.get("contexto") or {}) if isinstance(b.get("contexto"), dict) else {}).get("correcao")
    ctx.enviar(f"<b>#{b['id']} {_e(b['titulo'])}</b>\n{_e(b['estado'])} · {_e(b['gravidade'])} · {b['ocorrencias'] or 1} ocorrência(s)\n\n{_e((b['descricao'] or '')[:600])}"
               + (f"\n\n<b>Como foi corrigido:</b> {_e(str(corr)[:400])}" if corr else ""), [[{"text": "Abrir no painel", "url": "https://app.zynio.com.br/bugs"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("novidades", "avisos", "O que mudou na última versão do sistema", top=56)
def c_novidades(ctx, a):
    import pathlib
    v = json.loads((pathlib.Path(__file__).parent / "novidades.json").read_text(encoding="utf-8"))["versoes"][0]
    itens = (v.get("novo") or [])[:6] + (v.get("melhorias") or [])[:3]
    ctx.enviar(f"<b>Versão {_e(v['versao'])}</b>: {_e(v['titulo'])}\n" + "\n".join(f"• {_e(x)}" for x in itens), [[{"text": "Todas as versões", "url": "https://app.zynio.com.br/novidades"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("versao", "avisos", "Versão do sistema e dos apps")
def c_versao(ctx, a):
    import pathlib
    p = pathlib.Path(__file__).parent
    v = json.loads((p / "novidades.json").read_text(encoding="utf-8"))["versoes"][0]
    apps = json.loads((p / "versao_apps.json").read_text(encoding="utf-8")) if (p / "versao_apps.json").exists() else {}
    ctx.enviar(f"Sistema: <b>{_e(v['versao'])}</b> ({_e(v['data'])})" + (f"\nApps: {_e(apps.get('versao'))}" if apps.get("versao") else ""))


@cmd("avisos", "avisos", "Receber aqui os avisos importantes (ar ligado demais, falhas, segurança)", "/avisos sim|nao", top=55)
def c_avisos(ctx, a, resto=""):
    t = (resto or "").lower().strip()
    if t not in ("sim", "nao", "não", "on", "off"):
        on = prefs(ctx.cid).get("avisos")
        return ctx.enviar(f"Avisos aqui: <b>{'ligados' if on else 'desligados'}</b>. Só chegam avisos importantes, no máximo um por assunto a cada 6 horas.",
                          [[{"text": "Ligar avisos", "callback_data": "x:avisos:sim"}, {"text": "Desligar", "callback_data": "x:avisos:nao"}], [{"text": "Menu", "callback_data": "m:menu"}]])
    on = t in ("sim", "on")
    salvar_prefs(ctx.cid, avisos=on)
    ctx.enviar(f"Avisos {'ligados' if on else 'desligados'}.")


@cmd("silenciar", "avisos", "Pausa os avisos por N horas", "/silenciar 8", arg="num")
def c_silenciar(ctx, n):
    h = max(1, min(168, int(n)))
    salvar_prefs(ctx.cid, silencio_ate=int(time.time() + h * 3600))
    ctx.enviar(f"Avisos em silêncio por {h} h.")


@cmd("dessilenciar", "avisos", "Volta a receber avisos agora")
def c_dessilenciar(ctx, a):
    salvar_prefs(ctx.cid, silencio_ate=0)
    ctx.enviar("Avisos de volta.")


# =====================================================================================================================
# SEGURANÇA (dono e admin, ou quem gerencia segurança)
# =====================================================================================================================
@cmd("seguranca", "seg", "Postura de segurança (7 dias)", perm="seguranca.gerenciar", top=54)
def c_seguranca(ctx, a):
    from .rotas import api as rapi
    r = rapi.resumo_seguranca(7)
    t = r.get("totais") or r.get("resumo") or {}
    linhas = [f"{_e(k.replace('_', ' '))}: {_e(v)}" for k, v in list(t.items())[:10] if not isinstance(v, (dict, list))]
    ctx.enviar("<b>Segurança (7 dias)</b>\n" + ("\n".join(linhas) or "Sem eventos."), [[{"text": "Abrir no painel", "url": "https://app.zynio.com.br/seguranca"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("bloqueados", "seg", "IPs bloqueados agora", perm="seguranca.gerenciar")
def c_bloqueados(ctx, a):
    lst = db.consultar("SELECT id, alvo, motivo, expira_em FROM seguranca_ips WHERE tipo = 'bloqueado' AND (expira_em IS NULL OR expira_em > ?) ORDER BY criado_em DESC LIMIT 15", (db.agora(),))
    ctx.enviar("\n".join(f"• #{x['id']} {_e(x['alvo'])} · {_e((x['motivo'] or '')[:50])} · {'permanente' if not x['expira_em'] else 'até ' + quando(x['expira_em'])}" for x in lst) or "Nenhum IP bloqueado.")


@cmd("eventosseg", "seg", "Últimos eventos de segurança", perm="seguranca.gerenciar")
def c_eventosseg(ctx, a):
    lst = db.consultar("SELECT quando, tipo, ip, pais FROM seguranca_eventos ORDER BY quando DESC LIMIT 15")
    ctx.enviar("\n".join(f"{quando(e['quando'])} · {_e(e['tipo'])} · {_e(e['ip'])} {_e(e['pais'] or '')}" for e in lst) or "Nenhum evento.")


@cmd("tentativas", "seg", "Logins que falharam nas últimas 24 h", perm="seguranca.gerenciar")
def c_tentativas(ctx, a):
    r = db.um("SELECT count(*) n, count(DISTINCT ip) ips FROM seguranca_eventos WHERE tipo LIKE 'login_falh%' AND quando > ?", (db.agora() - 86400,))
    ctx.enviar(f"Logins que falharam (24 h): {r['n']} de {r['ips']} IP(s).")


@cmd("paises", "seg", "Acessos por país (24 h)", perm="seguranca.gerenciar")
def c_paises(ctx, a):
    lst = db.consultar("SELECT pais AS p, count(*) n FROM seguranca_eventos WHERE quando > ? GROUP BY 1 ORDER BY 2 DESC LIMIT 10", (db.agora() - 86400,))
    ctx.enviar("\n".join(f"• {_e(x['p'] or 'desconhecido')}: {x['n']}" for x in lst) or "Sem eventos nas últimas 24 h.")


@cmd("escudo", "seg", "Escudo anti-DDoS: ligado ou não", perm="seguranca.gerenciar")
def c_escudo(ctx, a):
    from . import firewall
    e = firewall.escudo()
    ctx.enviar(f"Escudo: <b>{'LIGADO' if e.get('ativo') else 'desligado'}</b>" + (f" desde {quando(e.get('desde'))}, motivo: {_e(e.get('motivo'))}" if e.get("ativo") else ""))


@cmd("desligarescudo", "seg", "Desliga o escudo anti-DDoS (dono)", papel=("dono",), confirmar=True)
def c_desligarescudo(ctx, a):
    from . import firewall
    firewall.desligar_escudo()
    db.registrar("telegram", "Escudo desligado pelo Telegram")
    ctx.enviar("Escudo desligado. O modo de ataque da Vercel sai na próxima sincronização do agente.")


@cmd("checklist", "seg", "Checklist de segurança conferido agora", perm="seguranca.gerenciar")
def c_checklist(ctx, a):
    from .rotas import api as rapi
    r = rapi.checklist_seguranca()
    itens = r.get("itens") or r if isinstance(r, list) else r.get("itens", [])
    ok = sum(1 for i in itens if i.get("ok"))
    ruins = [i for i in itens if not i.get("ok")]
    ctx.enviar(f"<b>Checklist</b>: {ok} de {len(itens)} ok" + ("\n" + "\n".join(f"• {_e(i.get('titulo') or i.get('nome'))}" for i in ruins[:10]) if ruins else ""))


@cmd("minhassessoes", "seg", "Onde a sua conta está aberta")
def c_minhassessoes(ctx, a):
    from . import sessoes
    lst = sessoes.listar(ctx.u["id"])
    ctx.enviar("\n".join(f"• {_e(s.get('cidade') or '?')} {_e(s.get('pais') or '')} · {_e((s.get('agente') or '')[:40])} · visto {quando(s.get('visto_em'))}" for s in lst[:10]) or "Nenhuma sessão aberta.")


@cmd("encerrarsessoes", "seg", "Encerra todas as suas sessões no painel (o Telegram continua)", confirmar=True)
def c_encerrarsessoes(ctx, a):
    from . import sessoes
    n = sessoes.revogar(ctx.u["id"])
    db.registrar("telegram", "Sessões encerradas pelo Telegram", detalhe=f"{n}")
    ctx.enviar(f"{n} sessão(ões) encerrada(s). Entre de novo no painel quando precisar.")


@cmd("bloquearip", "seg", "Bloqueia um IP por 24 h (dono)", "/bloquearip 203.0.113.7", arg="texto", papel=("dono",), confirmar=True)
def c_bloquearip(ctx, txt):
    import ipaddress
    from . import firewall
    try:
        ipaddress.ip_network(txt.strip(), strict=False)
    except ValueError:
        return ctx.enviar("IP inválido.")
    firewall.bloquear(txt.strip(), "bloqueado pelo Telegram", 1440, automatico=False)
    ctx.enviar(f"{_e(txt)} bloqueado por 24 h.")


@cmd("desbloquearip", "seg", "Remove um bloqueio pelo número (#) de /bloqueados", "/desbloquearip 12", arg="num", papel=("dono", "admin"))
def c_desbloquearip(ctx, n):
    from .rotas import api as rapi
    rapi.remover_ip(int(n))
    ctx.enviar(f"Bloqueio #{int(n)} removido.")


# =====================================================================================================================
# SISTEMA
# =====================================================================================================================
@cmd("saude", "sistema", "O sistema está no ar? Banco, agente e transmissores", top=72)
def c_saude(ctx, a):
    from . import transmissor
    t0 = time.time()
    db.um("SELECT 1 AS ok")
    ms = (time.time() - t0) * 1000
    h = db.um("SELECT count(*) FILTER (WHERE online = 1) on_, count(*) n FROM hubs")
    ctx.enviar(f"<b>Saúde</b>\nAPI: no ar\nBanco: respondeu em {num(ms, 0)} ms\nAgente no escritório: {'online' if transmissor.agente_online() else 'offline'}\nTransmissores online: {h['on_']} de {h['n']}")


@cmd("ping", "sistema", "Responde na hora (teste do bot)")
def c_ping(ctx, a):
    ctx.enviar(f"Pong. {quando(db.agora())}.")


@cmd("banco", "sistema", "Tamanho do banco (limite do plano: 500 MB)", papel=("dono", "admin"))
def c_banco(ctx, a):
    r = db.um("SELECT pg_database_size(current_database()) b")
    ctx.enviar(f"Banco: {num(r['b'] / 1048576)} MB de 500 MB.")


@cmd("backup", "sistema", "Último backup automático", papel=("dono", "admin"))
def c_backup(ctx, a):
    r = db.um("SELECT criado_em, length(dados::text) t FROM backups ORDER BY id DESC LIMIT 1")
    c = r["criado_em"] if r else None
    if r and hasattr(c, "timestamp"):
        r["criado_em"] = c.timestamp()
    ctx.enviar(f"Último backup: {quando(r['criado_em'])} ({num(r['t'] / 1024, 0)} KB). Guardamos os 14 mais recentes." if r else "Nenhum backup ainda.")


@cmd("cron", "sistema", "Últimas execuções das rotinas automáticas do banco", papel=("dono", "admin"))
def c_cron(ctx, a):
    lst = db.consultar("SELECT job_name, max(ran_at) ult FROM cron_log GROUP BY job_name ORDER BY job_name")
    def q(x):
        return quando(x.timestamp()) if hasattr(x, "timestamp") else _e(x)
    ctx.enviar("\n".join(f"• {_e(x['job_name'])}: {q(x['ult'])}" for x in lst) or "Sem registro das rotinas.")


@cmd("alexa", "sistema", "Alexa (Sinric): conectada e quantos ares", top=53)
def c_alexa(ctx, a):
    st = db.cfg("sinric_status") or {}
    n = db.um("SELECT count(*) n FROM aparelhos WHERE alexa = 1")["n"]
    ctx.enviar(f"Alexa (Sinric): {'conectada' if st.get('conectado') else 'desconectada'}\nAres na Alexa: {n}\nO agente do escritório mantém a conexão aberta.")


@cmd("email", "sistema", "E-mail (Resend): configurado e domínio", papel=("dono", "admin"))
def c_email(ctx, a):
    from . import correio
    ctx.enviar(f"E-mail: {'configurado' if correio.configurado() else 'não configurado'}\nDomínio: {'verificado' if correio.dominio_verificado() else 'não verificado'}\nRemetente: {_e(correio.remetente())}")


@cmd("emailsenviados", "sistema", "Últimos e-mails enviados", papel=("dono", "admin"))
def c_emailsenviados(ctx, a):
    lst = db.consultar("SELECT criado_em, tipo, estado FROM email_envios ORDER BY id DESC LIMIT 10")
    ctx.enviar("\n".join(f"• {quando(e['criado_em'])} · {_e(e['tipo'])} · {_e(e['estado'])}" for e in lst) or "Nenhum e-mail enviado.")


@cmd("integracoes", "sistema", "Estado das integrações (Alexa, Smart Life, Spotify, e-mail, IA)")
def c_integracoes(ctx, a):
    from . import correio, ia
    st = db.cfg("sinric_status") or {}
    sp = bool((db.cfg("spotify") or {}).get("refresh_token"))
    tu = bool(db.cfg("tuya_conta"))
    ctx.enviar(f"Alexa (Sinric): {'conectada' if st.get('conectado') else 'desconectada'}\nSmart Life: {'conectada' if tu else 'não conectada'}\n"
               f"Spotify: {'conectado' if sp else 'não conectado'}\nE-mail: {'pronto' if correio.configurado() else 'não configurado'}\nIA (NVIDIA): {'ativa' if ia.chave() and ia.cfg().get('ativo', True) else 'desligada'}")


@cmd("usuarios", "sistema", "Usuários do sistema", perm="usuarios.gerenciar")
def c_usuarios(ctx, a):
    lst = db.consultar("SELECT nome, papel, ativo, ultimo_acesso FROM usuarios ORDER BY papel, nome")
    ctx.enviar("\n".join(f"• {_e(u['nome'] or '?')} · {_e(u['papel'])}{'' if u['ativo'] else ' (inativo)'} · último acesso {quando(u['ultimo_acesso'])}" for u in lst))


@cmd("online", "sistema", "Quem usou o painel na última hora", perm="usuarios.gerenciar")
def c_online(ctx, a):
    lst = db.consultar("SELECT DISTINCT u.nome FROM sessoes_uso s JOIN usuarios u ON u.id::text = s.usuario_id::text WHERE s.visto_em > ? AND NOT s.revogada", (db.agora() - 3600,))
    ctx.enviar("Na última hora: " + _e(", ".join(u["nome"] or "?" for u in lst)) if lst else "Ninguém usou o painel na última hora.")


@cmd("telegramvinculos", "sistema", "Quem tem o Telegram vinculado", papel=("dono", "admin"))
def c_telegramvinculos(ctx, a):
    from . import telegram
    v = telegram.cfg().get("vinculos") or {}
    ctx.enviar("\n".join(f"• {_e(x.get('nome'))} (@{_e(x.get('telegram') or '-')}) desde {quando(x.get('desde'))}" for x in v.values()) or "Ninguém vinculado.")


@cmd("servidor", "sistema", "Onde o sistema roda")
def c_servidor(ctx, a):
    import os
    ctx.enviar(f"Painel e API: Vercel ({_e(os.environ.get('VERCEL_REGION') or 'cle1')})\nBanco: Supabase\nComandos de ar: agente no escritório, pela fila")


# =====================================================================================================================
# EQUIPE E MAPA
# =====================================================================================================================
def _pessoas():
    return (db.cfg("mapa") or {}).get("pessoas") or []


def _no_expediente(p, agora=None):
    tz = datetime.timezone(datetime.timedelta(hours=-3))
    d = agora or datetime.datetime.now(tz)
    if (d.isoweekday() not in (p.get("dias") or [1, 2, 3, 4, 5])):
        return False
    hm = d.strftime("%H:%M")
    return (p.get("inicio") or "08:00") <= hm < (p.get("fim") or "18:00")


@cmd("equipe", "equipe", "Pessoas cadastradas no mapa")
def c_equipe(ctx, a):
    ctx.enviar("\n".join(f"• {_e(p['nome'])} · {_e(p.get('cargo') or '')} · {_e(p.get('inicio'))}–{_e(p.get('fim'))}" for p in _pessoas()) or "Ninguém cadastrado no mapa.")


@cmd("quemesta", "equipe", "Quem está no expediente agora", top=52)
def c_quemesta(ctx, a):
    lst = [p for p in _pessoas() if _no_expediente(p)]
    ctx.enviar("No expediente agora: " + _e(", ".join(p["nome"] for p in lst)) if lst else "Ninguém no expediente agora.")


@cmd("expediente", "equipe", "Horário de cada pessoa")
def c_expediente(ctx, a):
    ctx.enviar("\n".join(f"• {_e(p['nome'])}: {_e(p.get('inicio'))} às {_e(p.get('fim'))}, {_dias_txt([d % 7 for d in (p.get('dias') or [])])}" for p in _pessoas()) or "Ninguém cadastrado.")


@cmd("pessoa", "equipe", "Ficha de uma pessoa do mapa", "/pessoa NOME", arg="texto")
def c_pessoa(ctx, txt):
    ps = _achar(_pessoas(), txt)
    if len(ps) != 1:
        return ctx.enviar("Quem? " + ", ".join(_e(p["nome"]) for p in _pessoas()))
    p = ps[0]
    sala = (db.um("SELECT nome FROM projetos WHERE id = ?", (int(p["sala"]),)) or {}).get("nome") if str(p.get("sala") or "").isdigit() else p.get("sala")
    ctx.enviar(f"<b>{_e(p['nome'])}</b>\nCargo: {_e(p.get('cargo') or '-')}\nSala: {_e(sala or '-')}\nExpediente: {_e(p.get('inicio'))} às {_e(p.get('fim'))}\nAgora: {'no expediente' if _no_expediente(p) else 'fora do expediente'}")


@cmd("mapa", "equipe", "Abre o mapa 3D do escritório")
def c_mapa(ctx, a):
    ctx.enviar("O mapa 3D abre no painel (prédio, salas, ares, equipe, cidade e carros):", [[{"text": "Abrir o mapa", "url": "https://app.zynio.com.br/mapa"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("avatares", "equipe", "Biblioteca de avatares 3D")
def c_avatares(ctx, a):
    lst = db.consultar("SELECT especie, count(*) n FROM avatares WHERE estado = 'pronto' GROUP BY especie ORDER BY 2 DESC")
    nomes = {"pessoa": "pessoas", "cao": "cães", "gato": "gatos", "animal": "animais", "veiculo": "veículos", "outro": "objetos"}
    ctx.enviar("<b>Avatares 3D</b>\n" + "\n".join(f"• {nomes.get(x['especie'], x['especie'])}: {x['n']}" for x in lst), [[{"text": "Abrir a biblioteca", "url": "https://app.zynio.com.br/avatares"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("veiculos", "equipe", "Veículos dirigíveis nas ruas do mapa")
def c_veiculos(ctx, a):
    lst = db.cfg("mapa_veiculos") or []
    def extra(f):
        f = f or {}
        return ", ".join(x for x in ((f"{int(f['potencia'])} cv" if f.get("potencia") else ""), ("elétrico" if f.get("eletrico") else ""), ("voa" if f.get("voar") else ""), ("moto" if f.get("duasRodas") else "")) if x)
    ctx.enviar("<b>Nas ruas do mapa</b>\n" + "\n".join(f"• {_e(v['nome'])}" + (f" ({_e(extra(v.get('fisica')))})" if extra(v.get("fisica")) else "") for v in lst) + "\n\nNo mapa: desça ao térreo, saia do prédio e aperte E perto de um carro (do trânsito também).")


@cmd("predio", "equipe", "O prédio do mapa: andares e onde fica o escritório")
def c_predio(ctx, a):
    m = db.cfg("mapa") or {}
    ctx.enviar(f"Prédio de {m.get('andares', 11)} andares; o escritório fica no {m.get('andar', 9)}º. Térreo com recepção e saída para a cidade.")


# =====================================================================================================================
# MINHA CONTA
# =====================================================================================================================
@cmd("eu", "conta", "Seu perfil: nome, papel e alcance", top=51)
def c_eu(ctx, a):
    from . import acesso
    u = ctx.u
    papel = acesso.PAPEIS.get(u["papel"], {}).get("rotulo", u["papel"])
    ctx.enviar(f"<b>{_e(u.get('nome') or u['email'])}</b>\nPapel: {_e(papel)}\nProjetos: {'todos' if u['projetos'] == '*' else len(u['projetos'])}\n"
               f"Ares: {'todos dos projetos' if u['aparelhos'] == '*' else len(u['aparelhos'])}\nPermissões: {len(u['permissoes'])}")


@cmd("permissoes", "conta", "O que você pode fazer")
def c_permissoes(ctx, a):
    from . import acesso
    ctx.enviar("<b>Suas permissões</b>\n" + "\n".join(f"• {_e(acesso.PERMISSOES[p][1])}" for p in ctx.u["permissoes"] if p in acesso.PERMISSOES))


@cmd("meusares", "conta", "Ares sob a sua responsabilidade")
def c_meusares(ctx, a):
    lst = ares()
    ctx.enviar(f"{len(lst)} ar(es): " + _e(", ".join(x["nome"] for x in lst)))


@cmd("favoritos", "conta", "Seus ares favoritos (um toque abre o painel)", top=69)
def c_favoritos(ctx, a):
    fav = prefs(ctx.cid).get("favs") or []
    lst = [x for x in ares() if x["id"] in fav]
    from . import clima
    ctx.enviar("<b>Favoritos</b>" if lst else "Sem favoritos. Use /fav NOME (ou o botão Favoritar no painel do ar).",
               [[{"text": (f"● {x['nome']} · {clima.MODOS.get(x['modo'], x['modo'])} {x['temperatura']}°" if x["ligado"] else f"○ {x['nome']}")[:60], "callback_data": f"a:{x['id']}"}] for x in lst] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("fav", "conta", "Adiciona um ar aos favoritos", "/fav NOME", arg="ar?")
def c_fav(ctx, a):
    fav = prefs(ctx.cid).get("favs") or []
    if a["id"] not in fav:
        fav = (fav + [a["id"]])[-12:]
    salvar_prefs(ctx.cid, favs=fav)
    ctx.enviar(f"<b>{_e(a['nome'])}</b> está nos favoritos.", [[{"text": "Favoritos", "callback_data": "x:favoritos"}, {"text": "Menu", "callback_data": "m:menu"}]])


@cmd("desfav", "conta", "Tira um ar dos favoritos", "/desfav NOME", arg="ar?")
def c_desfav(ctx, a):
    salvar_prefs(ctx.cid, favs=[x for x in (prefs(ctx.cid).get("favs") or []) if x != a["id"]])
    ctx.enviar(f"{_e(a['nome'])} saiu dos favoritos.")


@cmd("recentes", "conta", "Comandos que você usou por último")
def c_recentes(ctx, a):
    rec = prefs(ctx.cid).get("recentes") or []
    ctx.enviar("<b>Recentes</b>" if rec else "Nenhum comando recente.", [[{"text": f"/{n}", "callback_data": f"x:{n}"} for n in rec[i:i + 3]] for i in range(0, len(rec), 3)] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("limparrecentes", "conta", "Apaga a lista de recentes")
def c_limparrecentes(ctx, a):
    salvar_prefs(ctx.cid, recentes=[])
    ctx.enviar("Recentes apagados.")


@cmd("resumo", "conta", "Painel rápido: ares, tempo, agente e notificações", top=92)
def c_resumo(ctx, a):
    texto, bt = cabecalho(ctx), [[{"text": "Ares", "callback_data": "m:ares"}, {"text": "Ligados", "callback_data": "m:ligados"}], [{"text": "Menu", "callback_data": "m:menu"}]]
    ctx.enviar(texto, bt)


@cmd("bomdia", "conta", "Resumo do começo do dia: tempo, agenda e o que ficou ligado")
def c_bomdia(ctx, a):
    lig = [x["nome"] for x in ares() if x["ligado"]]
    d = _clima()
    hoje = len([g for g in _agendamentos() if g["ativo"]])
    ctx.enviar(f"Bom dia, {_e((ctx.u.get('nome') or '').split(' ')[0])}.\n" +
               (f"Lá fora: {num(d['temperatura'])}°C, {_e(d['condicao'])}.\n" if d.get("disponivel") else "") +
               (f"Ligados desde ontem: {_e(', '.join(lig))}.\n" if lig else "Nenhum ar ligado.\n") + f"Agendamentos ativos: {hoje}.")


@cmd("painel", "conta", "Link do painel")
def c_painel(ctx, a):
    ctx.enviar("Painel do Clima Escritório:", [[{"text": "Abrir o painel", "url": "https://app.zynio.com.br/"}], [{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("privacidade", "conta", "O que o bot guarda sobre você")
def c_privacidade(ctx, a):
    ctx.enviar("O bot guarda: o vínculo (seu id do Telegram ligado à sua conta), suas preferências aqui (ar atual, favoritos, recentes, avisos) e as últimas 12 mensagens da conversa com a IA (/esquecer apaga). "
               "Cada comando vai para a Atividade com a origem telegram. Nada é repassado a terceiros além da NVIDIA, só quando você conversa com a IA.")


@cmd("sobre", "conta", "Sobre o bot")
def c_sobre(ctx, a):
    ctx.enviar(f"Bot do Clima Escritório: {len(C)} comandos em {len(CATS)} categorias, com as suas permissões do painel. /menu navega, /buscar acha um comando, e você também pode escrever normalmente que a IA entende.")


@cmd("meuid", "conta", "Seu número de conversa no Telegram")
def c_meuid(ctx, a):
    ctx.enviar(f"Conversa: <code>{_e(ctx.cid)}</code>")


@cmd("sair", "conta", "Desvincula este Telegram")
def c_sair(ctx, a):
    from . import telegram
    telegram.desvincular(ctx.cid, "telegram")
    ctx.enviar("Telegram desvinculado. Para usar de novo, gere outro código no painel.", [])


# =====================================================================================================================
# IA E AJUDA
# =====================================================================================================================
@cmd("ia", "ia", "Conversar com a IA (ou só escreva uma mensagem)", "/ia pergunta", top=91)
def c_ia(ctx, a, resto=""):
    from . import telegram
    if resto:
        return telegram._ia(ctx.cid, resto, ctx.u)
    ctx.enviar("Escreva o que precisa, do seu jeito. Exemplos:\n- quais ares estão ligados?\n- liga o ar do Deison em 22 graus, ventilação alta\n"
               "- desliga o ar dos devs daqui a 30 minutos\n- por que o ar não obedece?\n\nA IA usa as suas permissões. Desligar todos e cenas pedem confirmação. /esquecer apaga a conversa.")


@cmd("perguntar", "ia", "Pergunta direta para a IA", "/perguntar texto", arg="texto")
def c_perguntar(ctx, txt):
    from . import telegram
    telegram._ia(ctx.cid, txt, ctx.u)


@cmd("esquecer", "ia", "Apaga a conversa com a IA")
def c_esquecer(ctx, a):
    from . import telegram
    telegram._historico(ctx.cid, limpar=True)
    ctx.enviar("Conversa com a IA apagada.")


@cmd("explicar", "ia", "A IA explica a última falha de comando")
def c_explicar(ctx, a):
    from . import telegram
    ult = db.um("SELECT acao, detalhe, origem FROM atividade WHERE ok = 0 ORDER BY quando DESC LIMIT 1")
    if not ult:
        return ctx.enviar("Nenhuma falha registrada.")
    telegram._ia(ctx.cid, f"Explique em poucas linhas e diga o que fazer: o comando '{ult['acao']}' (origem {ult['origem']}) falhou com: {ult['detalhe']}", ctx.u)


@cmd("dica", "ia", "A IA sugere como gastar menos com base nos últimos 7 dias", perm="relatorios.ver")
def c_dica(ctx, a):
    from . import telegram
    r = _relatorio(7)["resumo"]
    telegram._ia(ctx.cid, f"Com estes números dos últimos 7 dias, dê 3 dicas curtas e práticas para gastar menos com os ares: {json.dumps(r, ensure_ascii=False)[:1500]}", ctx.u)


@cmd("resumir", "ia", "A IA resume como está o escritório agora")
def c_resumir(ctx, a):
    from . import telegram
    telegram._ia(ctx.cid, "Resuma em até 5 linhas o estado geral agora: ares ligados, transmissores, agente e alguma falha recente.", ctx.u)


@cmd("menu", "ia", "Menu principal", top=100)
def c_menu(ctx, a):
    texto, bt = menu_principal(ctx)
    ctx.enviar(texto, bt)


cmd("start", "ia", "Começar (mostra o menu)")(c_menu)


@cmd("ajuda", "ia", "Como usar o bot e a segurança", top=67)
def c_ajuda(ctx, a):
    ctx.enviar("<b>Como usar</b>\n• /menu abre as categorias; cada botão roda o comando.\n• Escreva normalmente que a IA entende: <i>desliga o ar dos devs daqui a 1 hora</i>.\n"
               "• /usar NOME escolhe o ar atual; aí /23, /frio, /mais, /desligar agem nele.\n• /buscar palavra acha um comando entre os " + str(len(C)) + ".\n"
               "• /fav NOME guarda favoritos; /avisos sim recebe avisos importantes aqui.\n\n<b>Segurança</b>\nO bot só responde a quem vinculou o Telegram pelo painel e age com as permissões dessa pessoa. "
               "Ações em lote pedem confirmação. Perdeu o celular? No painel → Telegram → Desvincular.", [[{"text": "Todos os comandos", "callback_data": "x:comandos"}, {"text": "Menu", "callback_data": "m:menu"}]])


@cmd("comandos", "ia", "Todos os comandos por categoria")
def c_comandos(ctx, a):
    ctx.enviar(f"<b>{len(C)} comandos</b> em {len(CATS)} categorias. Escolha:", _grade_categorias())


@cmd("categorias", "ia", "Lista as categorias")
def c_categorias(ctx, a):
    ctx.enviar("\n".join(f"• <b>{_e(r)}</b> ({sum(1 for c in C.values() if c['cat'] == k)})" for k, r, d in CATS)[:4000], _grade_categorias())


@cmd("buscar", "ia", "Procura um comando pelo nome ou descrição", "/buscar temperatura", arg="texto", top=68)
def c_buscar(ctx, txt):
    t = txt.lower()
    lst = [c for c in C.values() if t in c["nome"] or t in c["desc"].lower()][:20]
    ctx.enviar((f"{len(lst)} comando(s) com “{_e(txt)}”:\n" + "\n".join(f"/{c['nome']} · {_e(c['desc'])}" for c in lst)) if lst else f"Nenhum comando com “{_e(txt)}”.",
               [[{"text": f"/{c['nome']}", "callback_data": f"x:{c['nome']}"} for c in lst[i:i + 3]] for i in range(0, min(9, len(lst)), 3)] + [[{"text": "Menu", "callback_data": "m:menu"}]])


@cmd("vincular", "ia", "Vincular este Telegram com o código do painel", "/vincular CÓDIGO")
def c_vincular(ctx, a):
    ctx.enviar("Este Telegram já está vinculado à sua conta.")


# =====================================================================================================================
# MENU NAVEGÁVEL
# =====================================================================================================================
def cabecalho(ctx) -> str:
    """Linha de estado no topo do menu: ares ligados, agente, tempo lá fora e notificações não lidas."""
    from . import transmissor
    lst = ares()
    lig = sum(1 for x in lst if x["ligado"])
    partes = [f"<b>Clima Escritório</b> · {_e((ctx.u.get('nome') or '').split(' ')[0])}", f"Ares ligados: <b>{lig}</b> de {len(lst)}",
              f"Agente: {'online' if transmissor.agente_online() else '<b>offline</b> (comandos não chegam aos ares)'}"]
    try:
        d = _clima()
        if d.get("disponivel"):
            partes.append(f"Lá fora: {num(d['temperatura'])}°C, {_e(d['condicao'])}")
    except Exception:  # noqa: BLE001
        pass
    try:
        n = len(_notifs("nao_lidas", 50))
        if n:
            partes.append(f"Notificações não lidas: {n}")
    except Exception:  # noqa: BLE001
        pass
    at = prefs(ctx.cid).get("atual")
    a = next((x for x in lst if x["id"] == at), None)
    if a:
        partes.append(f"Ar atual: {_e(a['nome'])} ({'ligado ' + str(a['temperatura']) + '°' if a['ligado'] else 'desligado'})")
    return "\n".join(partes)


CATS_POR_PAGINA = 30   # o Telegram aceita no máximo 100 botões por mensagem: com 100+ categorias, a grade vai em páginas


def _grade_categorias(pag: int = 0):
    total = (len(CATS) + CATS_POR_PAGINA - 1) // CATS_POR_PAGINA
    pag = max(0, min(pag, total - 1))
    parte = CATS[pag * CATS_POR_PAGINA:(pag + 1) * CATS_POR_PAGINA]
    bt = [[{"text": f"{r} ({sum(1 for c in C.values() if c['cat'] == k)})", "callback_data": f"k:{k}:0"} for k, r, _ in parte[i:i + 2]] for i in range(0, len(parte), 2)]
    nav = []
    if pag > 0:
        nav.append({"text": "Anterior", "callback_data": f"kp:{pag - 1}"})
    if total > 1:
        nav.append({"text": f"{pag + 1} de {total}", "callback_data": f"kp:{pag}"})
    if pag < total - 1:
        nav.append({"text": "Próxima", "callback_data": f"kp:{pag + 1}"})
    return bt + ([nav] if nav else []) + [[{"text": "Menu", "callback_data": "m:menu"}]]


def menu_principal(ctx):
    p = prefs(ctx.cid)
    bt = []
    at = p.get("atual")
    if at:
        bt.append([{"text": "Ar atual", "callback_data": f"a:{at}"}, {"text": "−1°", "callback_data": "x:menos"}, {"text": "+1°", "callback_data": "x:mais"}, {"text": "Desligar", "callback_data": "x:desligar"}])
    bt += [[{"text": "Ares", "callback_data": "m:ares"}, {"text": "Ligados", "callback_data": "m:ligados"}, {"text": "Favoritos", "callback_data": "x:favoritos"}],
           [{"text": "Salas", "callback_data": "x:salas"}, {"text": "Cenas", "callback_data": "m:cenas"}, {"text": "Timers", "callback_data": "x:timers"}],
           [{"text": "Status", "callback_data": "m:status"}, {"text": "Transmissores", "callback_data": "m:tx"}, {"text": "Agentes", "callback_data": "m:agentes"}],
           [{"text": "Hoje", "callback_data": "x:hoje"}, {"text": "Gasto", "callback_data": "x:gasto"}, {"text": "Tempo lá fora", "callback_data": "x:tempo"}],
           [{"text": "Horários", "callback_data": "k:horarios:0"}, {"text": "Relatórios", "callback_data": "k:dados:0"}, {"text": "Luzes e aparelhos", "callback_data": "k:disp:0"}],
           [{"text": "Avisos e bugs", "callback_data": "k:avisos:0"}, {"text": "Segurança", "callback_data": "k:seg:0"}, {"text": "Uso da IA", "callback_data": "x:uso_ia"}],
           [{"text": "Minhas tarefas", "callback_data": "x:tarefas"}, {"text": "Lembretes", "callback_data": "k:lembretes:0"}, {"text": "Previsão", "callback_data": "k:previsao:0"}],
           [{"text": "Fechamento", "callback_data": "x:checklist_fechamento"}, {"text": "Backup", "callback_data": "k:backup:0"}, {"text": "Acessos", "callback_data": "k:acessos:0"}],
           [{"text": "Por ar", "callback_data": "k:porar:0"}, {"text": "Por sala", "callback_data": "k:porsala:0"}, {"text": "Comparar", "callback_data": "k:comparar:0"}],
           [{"text": "Logs", "callback_data": "k:logs:0"}, {"text": "Quem fez o quê", "callback_data": "k:pessoas:0"}, {"text": "Meu histórico", "callback_data": "k:meuhist:0"}],
           [{"text": "Guia e glossário", "callback_data": "k:guia:0"}, {"text": "Conversar com a IA", "callback_data": "m:ia"}, {"text": "Novidades", "callback_data": "k:versoes:0"}],
           [{"text": f"Todos os comandos ({len(C)})", "callback_data": "x:comandos"}]]
    rec = [n for n in (p.get("recentes") or []) if n in C][:3]
    if rec:
        bt.append([{"text": f"/{n}", "callback_data": f"x:{n}"} for n in rec])
    bt.append([{"text": "Desligar todos os ares", "callback_data": "x:desligartodos"}])
    return cabecalho(ctx) + "\n\nO que você quer fazer? Também dá para escrever do seu jeito.", bt


def pagina_categoria(ctx, cat: str, pag: int):
    lst = sorted([c for c in C.values() if c["cat"] == cat], key=lambda c: (-c["top"], c["nome"]))
    total = max(1, (len(lst) + POR_PAGINA - 1) // POR_PAGINA)
    pag = max(0, min(pag, total - 1))
    fatia = lst[pag * POR_PAGINA:(pag + 1) * POR_PAGINA]
    texto = f"Menu › <b>{_e(NOME_CAT.get(cat, cat))}</b> · página {pag + 1} de {total}\n\n" + "\n".join(f"/{c['nome']} · {_e(c['desc'])}" for c in fatia)
    bt = [[{"text": f"/{c['nome']}", "callback_data": f"x:{c['nome']}"} for c in fatia[i:i + 2]] for i in range(0, len(fatia), 2)]
    nav = []
    if pag > 0:
        nav.append({"text": "Anterior", "callback_data": f"k:{cat}:{pag - 1}"})
    if pag < total - 1:
        nav.append({"text": "Próxima", "callback_data": f"k:{cat}:{pag + 1}"})
    if nav:
        bt.append(nav)
    bt.append([{"text": "Categorias", "callback_data": "x:comandos"}, {"text": "Menu", "callback_data": "m:menu"}])
    return texto, bt


# =====================================================================================================================
# EXECUÇÃO
# =====================================================================================================================
def _seletor(lst, cmd_nome, rotulo, extra=""):
    bt = [[{"text": str(x["nome"])[:60], "callback_data": f"xs:{cmd_nome}:{x['id']}{(':' + extra) if extra else ''}"[:64]}] for x in lst[:30]]
    return f"{rotulo}:", bt + [[{"text": "Menu", "callback_data": "m:menu"}]]


def _resolver(ctx, c, args: str, ent_id=None):
    """Acha o alvo do comando (ar, sala, zona, cena) pelo id do botão, pelo texto ou pelo ar atual. Devolve (alvo, resto) ou None
    (quando já mostrou a lista para escolher)."""
    tipo = c["arg"]
    if tipo in ("ar", "ar?"):
        lst = ares()
        if ent_id is not None:
            a = next((x for x in lst if str(x["id"]) == str(ent_id)), None)
            return (a, args) if a else None
        # "deison 23": o número no fim não faz parte do nome
        m = re.match(r"^(.*?)(?:\s+(\d{2})\s*°?)?\s*$", args or "")
        nome, resto = (m.group(1).strip(), (m.group(2) or "")) if m else (args, "")
        if c["nome"] in ("modo", "ventilacao"):
            partes = (args or "").rsplit(" ", 1)
            nome, resto = (partes[0], partes[1]) if len(partes) == 2 else ("", args or "")
            if not _achar(lst, nome):
                nome, resto = "", args
        if nome:
            ach = _achar(lst, nome)
            if len(ach) == 1:
                return ach[0], resto
            if c["arg"] == "ar?" and not ach and c["nome"] in ("temperatura", "temp", "modo", "ventilacao", "timer"):
                resto = args   # "/temperatura 23" sem nome: tudo é argumento
            else:
                t, bt = _seletor(ach or lst, c["nome"], "Qual ar?" if not ach else "Achei mais de um. Qual?", resto)
                ctx.enviar(t, bt); return None
        at = prefs(ctx.cid).get("atual")
        if tipo == "ar?" and at:
            a = next((x for x in lst if x["id"] == at), None)
            if a:
                return a, resto
        if len(lst) == 1:
            return lst[0], resto
        t, bt = _seletor(lst, c["nome"], "Qual ar? (dica: /usar NOME define o ar atual)", resto)
        ctx.enviar(t, bt); return None
    fontes = {"sala": (salas, "Qual sala?"), "zona": (_zonas_visiveis, "Qual zona?"), "cena": (_cenas, "Qual cena?")}
    if tipo in fontes:
        f, rot = fontes[tipo]
        lst = f()
        if ent_id is not None:
            x = next((x for x in lst if str(x["id"]) == str(ent_id)), None)
            return (x, args) if x else None
        m = re.match(r"^(.*?)(?:\s+(\d{2})\s*°?)?\s*$", args or "")
        nome, resto = (m.group(1).strip(), m.group(2) or "") if m else (args, "")
        ach = _achar(lst, nome) if nome else []
        if len(ach) == 1:
            return ach[0], resto
        t, bt = _seletor(ach or lst, c["nome"], rot, resto)
        ctx.enviar(t, bt); return None
    if tipo == "texto":
        if not (args or "").strip():
            ctx.enviar(f"Use: <code>{_e(c['uso'])}</code>\n{_e(c['desc'])}."); return None
        return args.strip(), ""
    if tipo == "num":
        m = re.search(r"(\d+)", args or "")
        if not m:
            ctx.enviar(f"Use: <code>{_e(c['uso'])}</code>\n{_e(c['desc'])}."); return None
        return m.group(1), ""
    return None, args


def executar(ctx: Ctx, nome: str, args: str = "", ent_id=None):
    from . import acesso, telegram
    c = C.get(nome)
    if not c:
        return ctx.enviar("Não conheço esse comando. Use /menu, /buscar ou escreva do seu jeito.", [[{"text": "Menu", "callback_data": "m:menu"}]])
    if c["perm"] and not acesso.pode(c["perm"]):
        return ctx.enviar("Seu usuário não tem permissão para isto.")
    if c["papel"] and ctx.u.get("papel") not in c["papel"]:
        return ctx.enviar("Só " + " ou ".join(c["papel"]) + " pode usar este comando.")
    # comandos críticos pedem o PIN (definido no painel) uma vez a cada 10 min por conversa
    if nome in telegram.CRITICOS and not telegram.pin_liberado(ctx.cid):
        telegram.auditar(ctx.cid, None, "pin_pedido", f"/{nome}", False, ctx.u)
        if not telegram.tem_pin(ctx.u["id"]):
            return ctx.enviar(f"/{nome} é um comando crítico e pede PIN. Defina o seu em app.zynio.com.br → Telegram → PIN dos comandos críticos.")
        return ctx.enviar(f"/{nome} é um comando crítico. Mande <b>/pin</b> seguido dos 6 dígitos (vale {telegram.PIN_MIN} min) e repita o comando.")
    r = _resolver(ctx, c, args, ent_id)
    if r is None:
        return
    alvo, resto = r
    if c["confirmar"] and not ctx.confirmado:
        desc = f"/{nome}" + (f" · {alvo['nome']}" if isinstance(alvo, dict) and alvo.get("nome") else (f" {alvo}" if alvo else "")) + (f" {resto}" if resto else "")
        return telegram._pedir_confirmacao(ctx.cid, "cmd", {"nome": nome, "args": args, "id": (alvo or {}).get("id") if isinstance(alvo, dict) else None},
                                           f"{_e(c['desc'])}\n<b>{_e(desc)}</b>")
    rec = [nome] + [x for x in (prefs(ctx.cid).get("recentes") or []) if x != nome]
    salvar_prefs(ctx.cid, recentes=rec[:9])
    import inspect
    fn = c["fn"]
    if "resto" in inspect.signature(fn).parameters:
        return fn(ctx, alvo, resto=resto or (args if c["arg"] is None else ""))
    return fn(ctx, alvo)


def para_telegram() -> list[dict]:
    """Os 100 comandos mais usados para o menu "/" do Telegram (o Telegram aceita até 100)."""
    lst = sorted(C.values(), key=lambda c: (-c["top"], list(NOME_CAT).index(c["cat"]), c["nome"]))[:100]
    return [{"command": c["nome"], "description": c["desc"][:256]} for c in lst]


def publico() -> list[dict]:
    return [{"nome": c["nome"], "cat": c["cat"], "categoria": NOME_CAT.get(c["cat"]), "desc": c["desc"], "uso": c["uso"], "confirmar": c["confirmar"],
             "restrito": bool(c["perm"] or c["papel"])} for c in sorted(C.values(), key=lambda c: (list(NOME_CAT).index(c["cat"]), -c["top"], c["nome"]))]


# =====================================================================================================================
# AVISOS (push) para quem pediu /avisos sim
# =====================================================================================================================
def avisar(chave: str, gravidade: str, titulo: str, detalhe: str = "", link: str = ""):
    """Chamado por notificacoes.notificar: manda o aviso importante para quem ligou os avisos (dono e admin).
    Um por assunto a cada 6 h por conversa; silêncio respeitado. Nunca derruba quem chamou."""
    if gravidade not in ("alta", "critica"):
        return
    try:
        from . import telegram
        c = telegram.cfg()
        if not c.get("token"):
            return
        tudo = db.cfg(PREFS) or {}
        alvos = [cid for cid, p in tudo.items() if p.get("avisos") and (p.get("silencio_ate") or 0) < time.time()]
        if not alvos:
            return
        e = db.cfg("telegram_avisados") or {}
        agora = time.time()
        e = {k: v for k, v in e.items() if v > agora - 6 * 3600}
        for cid in alvos:
            v = (c.get("vinculos") or {}).get(cid)
            if not v:
                continue
            u = db.um("SELECT papel, ativo FROM usuarios WHERE id = ?", (v["usuario_id"],))
            if not u or not u["ativo"] or u["papel"] not in ("dono", "admin"):
                continue
            k = f"{cid}:{chave}"[:160]
            if k in e:
                continue
            e[k] = agora
            bt = [[{"text": "Abrir", "url": f"https://app.zynio.com.br{link}" if link.startswith("/") else "https://app.zynio.com.br/notificacoes"}],
                  [{"text": "Silenciar 8 h", "callback_data": "x:silenciar:8"}]]
            try:
                telegram.chamar("sendMessage", chat_id=cid, text=f"<b>Aviso: {_e(titulo)}</b>\n{_e(str(detalhe)[:400])}"[:4000], parse_mode="HTML",
                                reply_markup={"inline_keyboard": bt}, disable_web_page_preview=True)
            except Exception:  # noqa: BLE001
                pass
        db.set_cfg("telegram_avisados", e)
    except Exception:  # noqa: BLE001
        pass


# =====================================================================================================================
# FAMÍLIAS DE ATALHOS (1.22.0): modo + temperatura, modo + ventilação, lotes, timers prontos, períodos, volume…
# Cada um é um comando de verdade (aparece no /comandos e na busca), com as mesmas permissões e confirmações.
# =====================================================================================================================
CATS += [
    ("modos", "Modo e temperatura", "Um toque: /frio23, /quente26, /seco24, /auto22, /ventilar25 (ar atual)"),
    ("modovent", "Modo e ventilação", "/frio_alta, /quente_baixa… no ar atual"),
    ("lote", "Todos de uma vez", "Todos os ligados numa temperatura ou modo, timers para todos, salas e zonas"),
    ("timers", "Timers prontos", "Desligar em 5 min a 12 h, ligar daqui a pouco, ligar por um tempo"),
    ("periodos", "Relatórios por período", "Gasto, consumo, horas, ranking e falhas em 1 a 90 dias"),
    ("presets", "Presets de aparelhos", "Persianas, luzes e volume em valores prontos"),
]
NOME_CAT.update({k: r for k, r, _ in CATS})
_NM = {"frio": "Frio", "quente": "Quente", "seco": "Desumidificar", "auto": "Automático", "ventilar": "Ventilar"}
_MD = {"frio": "frio", "quente": "quente", "seco": "seco", "auto": "auto", "ventilar": "ventilar"}

for _m in _NM:
    for _g in range(16, 31):
        if f"{_m}{_g}" in C:
            continue
        def _fmg(ctx, a, _m=_m, _g=_g):
            _aplicar(ctx, a, ligado=True, modo=_MD[_m], temperatura=max(a["temp_min"], min(a["temp_max"], _g)))
        cmd(f"{_m}{_g}", "modos", f"{_NM[_m]} {_g}° no ar atual (ou /{_m}{_g} NOME)", f"/{_m}{_g} NOME", arg="ar?", perm="aparelhos.controlar")(_fmg)
    for _v, _vn in (("baixa", "baixa"), ("media", "média"), ("alta", "alta"), ("auto", "automática")):
        def _fmv(ctx, a, _m=_m, _v=_v):
            _aplicar(ctx, a, ligado=True, modo=_MD[_m], ventilador=_v)
        cmd(f"{_m}_{_v}", "modovent", f"{_NM[_m]} com ventilação {_vn}", f"/{_m}_{_v} NOME", arg="ar?", perm="aparelhos.controlar")(_fmv)

# todos os ligados numa temperatura / modo / ventilação
for _g in range(16, 31):
    def _ftg(ctx, a, _g=_g):
        _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos em {_g}°", temperatura=_g)
    cmd(f"todos{_g}", "lote", f"Todos os ares ligados em {_g}° (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftg)
for _m in _NM:
    def _ftm(ctx, a, _m=_m):
        _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos em {_NM[_m].lower()}", modo=_MD[_m])
    cmd(f"todos{_m}", "lote", f"Todos os ares ligados no modo {_NM[_m].lower()} (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftm)
for _v, _vn in (("baixa", "baixa"), ("media", "média"), ("alta", "alta"), ("auto", "automática")):
    def _ftv(ctx, a, _v=_v):
        _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos com ventilação {_v}", ventilador=_v)
    cmd(f"todosvent{_v}", "lote", f"Todos os ares ligados com ventilação {_vn} (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftv)
for _min in (15, 30, 60, 120):
    def _ftt(ctx, a, _min=_min):
        from . import automacao
        lig = [x for x in ares() if x["ligado"]]
        for x in lig:
            automacao.criar_temporizador(x["id"], _min, {"ligado": False}, "telegram")
        ctx.enviar(f"{len(lig)} ar(es) desligam em {tempo(_min * 60)}." if lig else "Nenhum ar ligado.")
    cmd(f"desligartodosem{_min}", "lote", f"Todos os ligados desligam daqui a {tempo(_min * 60)} (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftt)
for _g in range(16, 31):
    def _fsg(ctx, s, _g=_g):
        _lote_ares(ctx, [x for x in ares() if x["projeto_id"] == s["id"] and x["ligado"]], f"{s['nome']} em {_g}°", temperatura=_g)
    cmd(f"sala{_g}", "lote", f"Ares ligados de uma sala em {_g}°", f"/sala{_g} NOME", arg="sala", perm="aparelhos.controlar")(_fsg)
    def _fzg(ctx, z, _g=_g):
        _estado_zona(ctx, z, ligado=True, temperatura=_g)
    cmd(f"zona{_g}", "lote", f"Uma zona inteira em {_g}° (um sinal)", f"/zona{_g} NOME", arg="zona", perm="aparelhos.controlar")(_fzg)


def _pausar_autos(ctx, ativo):
    n = db.um("SELECT count(*) n FROM automacoes WHERE ativo <> ?", (1 if ativo else 0,))["n"]
    db.executar("UPDATE automacoes SET ativo = ?", (1 if ativo else 0,))
    db.registrar("telegram", f"Todas as automações {'ativadas' if ativo else 'pausadas'}", detalhe=str(n))
    ctx.enviar(f"{n} automação(ões) {'ativada(s)' if ativo else 'pausada(s)'}.")


cmd("pausartodasautos", "auto", "Pausa todas as automações (pede confirmação)", perm="automacoes.gerenciar", confirmar=True)(lambda ctx, a: _pausar_autos(ctx, False))
cmd("ativartodasautos", "auto", "Ativa todas as automações (pede confirmação)", perm="automacoes.gerenciar", confirmar=True)(lambda ctx, a: _pausar_autos(ctx, True))

# timers prontos
for _min in (5, 10, 20, 45, 90, 180, 300, 360, 480, 600, 720):
    def _fdt(ctx, a, _min=_min):
        from . import telegram
        telegram._temporizador(ctx.cid, a["id"], _min, ctx.mid)
    cmd(f"desligarem{_min}", "timers", f"Desliga daqui a {tempo(_min * 60)}", f"/desligarem{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_fdt)
for _min in (15, 30, 45, 60, 90, 120, 180, 240):
    def _flp(ctx, a, _min=_min):
        from . import automacao
        automacao.criar_temporizador(a["id"], _min, {"ligado": False}, "telegram")
        _aplicar(ctx, a, ligado=True)
    cmd(f"ligarpor{_min}", "timers", f"Liga agora e desliga sozinho em {tempo(_min * 60)}", f"/ligarpor{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_flp)
for _min in (5, 10, 15, 30, 60, 120):
    def _fle(ctx, a, _min=_min):
        from . import automacao
        automacao.criar_temporizador(a["id"], _min, {"ligado": True}, "telegram")
        _painel(ctx, a["id"], aviso=f"<b>Timer:</b> liga em {tempo(_min * 60)}.")
    cmd(f"ligarem{_min}", "timers", f"Liga daqui a {tempo(_min * 60)}", f"/ligarem{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_fle)

# relatórios por período
for _d in (1, 3, 15, 60, 90):
    def _fgd(ctx, a, _d=_d):
        r = _relatorio(_d)["resumo"]; ctx.enviar(f"<b>Gasto em {_d} dia(s)</b> (estimativa): {brl(r['custo'])} · {num(r['kwh'])} kWh")
    cmd(f"gasto{_d}d", "periodos", f"Custo estimado em {_d} dia(s)", perm="relatorios.ver")(_fgd)
    def _fkd(ctx, a, _d=_d):
        r = _relatorio(_d)["resumo"]; ctx.enviar(f"<b>Consumo em {_d} dia(s)</b>: {num(r['kwh'])} kWh ({num(r['horas_ligado'])} h ligado)")
    cmd(f"kwh{_d}d", "periodos", f"Consumo em kWh em {_d} dia(s)", perm="relatorios.ver")(_fkd)
for _d in (1, 3, 15, 30, 60):
    def _fhd(ctx, a, _d=_d):
        d = _relatorio(_d)
        ctx.enviar(f"<b>Horas ligado ({_d} dia(s))</b>\n" + "\n".join(f"• {_e(p['nome'])}: {num(p.get('horas_ligado', 0))} h" for p in sorted(d["por_aparelho"], key=lambda x: -x.get("horas_ligado", 0))[:12]))
    cmd(f"horas{_d}d", "periodos", f"Horas ligado por ar em {_d} dia(s)", perm="relatorios.ver")(_fhd)
for _d in (1, 3, 15, 30, 90):
    def _frd(ctx, a, _d=_d):
        d = _relatorio(_d)
        ctx.enviar(f"<b>Mais usados ({_d} dia(s))</b>\n" + ("\n".join(f"{i + 1}. {_e(p['nome'])}: {p['comandos']} comando(s)" for i, p in enumerate(d["por_aparelho"][:10])) or "Sem dados."))
    cmd(f"ranking{_d}d", "periodos", f"Ares mais usados em {_d} dia(s)", perm="relatorios.ver")(_frd)
for _d in (3, 7, 30):
    def _ffd(ctx, a, _d=_d):
        n = db.um("SELECT count(*) n FROM atividade WHERE ok = 0 AND quando > ?", (db.agora() - _d * 86400,))["n"]
        ctx.enviar(f"{n} comando(s) falharam em {_d} dias." + (" Use /falhas para ver as últimas." if n else ""))
    cmd(f"falhas{_d}d", "periodos", f"Quantos comandos falharam em {_d} dias", perm="atividade.ver")(_ffd)
for _d in (1, 3, 14, 30, 60, 90):
    def _fpd(ctx, a, _d=_d):
        ctx.enviar(_resumo_txt(f"Últimos {_d} dia(s)", _relatorio(_d)))
    cmd(f"relatorio{_d}d", "periodos", f"Resumo completo dos últimos {_d} dia(s)", perm="relatorios.ver")(_fpd)


def _janela(titulo, ini, fim):
    from . import relatorio
    return _resumo_txt(titulo, relatorio.montar(ini, fim))


cmd("anteontem", "periodos", "Resumo de anteontem", perm="relatorios.ver")(lambda ctx, a: ctx.enviar(_janela("Anteontem", _inicio_dia(-2), _inicio_dia(-1))))
cmd("estasemana", "periodos", "Resumo desta semana (desde segunda)", perm="relatorios.ver")(
    lambda ctx, a: ctx.enviar(_janela("Esta semana", _inicio_dia(-datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).weekday()), db.agora())))
cmd("semanapassada", "periodos", "Resumo da semana passada", perm="relatorios.ver")(
    lambda ctx, a: ctx.enviar(_janela("Semana passada", _inicio_dia(-datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).weekday() - 7),
                                      _inicio_dia(-datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).weekday()))))
cmd("estemes", "periodos", "Resumo deste mês", perm="relatorios.ver")(
    lambda ctx, a: ctx.enviar(_janela("Este mês", _inicio_dia(1 - datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).day), db.agora())))


def _mes_passado(ctx, a):
    hoje = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3)))
    ini_este = _inicio_dia(1 - hoje.day)
    ult = datetime.datetime.fromtimestamp(ini_este - 86400, hoje.tzinfo)
    ctx.enviar(_janela("Mês passado", ini_este - ult.day * 86400, ini_este))


cmd("mespassado", "periodos", "Resumo do mês passado", perm="relatorios.ver")(_mes_passado)

# presets de aparelhos
for _p in (0, 25, 50, 75, 100):
    def _fpp(ctx, a, _p=_p):
        from . import acesso, dispositivos
        if not acesso.pode("aparelhos.controlar"):
            raise RuntimeError("seu usuário não tem permissão para isto.")
        ok = 0
        for d in [d for d in _disp("persiana") if d["conectado"]]:
            try:
                dispositivos.comando(int(d["id"]), "posicao", _p, "telegram"); ok += 1
            except Exception:  # noqa: BLE001
                pass
        ctx.enviar(f"{ok} persiana(s) em {_p}%." if ok else "Nenhuma persiana com motor conectado.")
    cmd(f"persianas{_p}", "presets", f"Todas as persianas em {_p}% ({'fechadas' if not _p else 'abertas' if _p == 100 else 'meio'})", perm="aparelhos.controlar")(_fpp)
for _b in (25, 50, 75, 100):
    def _flb(ctx, a, _b=_b):
        from . import acesso, dispositivos
        if not acesso.pode("aparelhos.controlar"):
            raise RuntimeError("seu usuário não tem permissão para isto.")
        ok = 0
        for d in [d for d in _disp("luz") if d["conectado"]]:
            try:
                dispositivos.comando(int(d["id"]), "brilho", _b, "telegram"); ok += 1
            except Exception:  # noqa: BLE001
                pass
        ctx.enviar(f"{ok} luz(es) em {_b}%." if ok else "Nenhuma luz com brilho conectada.")
    cmd(f"luzes{_b}", "presets", f"Todas as luzes acesas em {_b}% de brilho", perm="aparelhos.controlar")(_flb)
for _v in range(0, 101, 10):
    def _fvol(ctx, a, _v=_v):
        _musica(ctx, "volume", f"Volume {_v}%.", volume=_v)
    cmd(f"vol{_v}", "presets", f"Volume da música em {_v}%")(_fvol)
for _t, _r in (("seguranca", "segurança"), ("agente", "agente"), ("transmissor", "transmissores"), ("falha", "falhas de comando")):
    def _fnt(ctx, a, _t=_t, _r=_r):
        lst = [n for n in _notifs("todas", 60) if n.get("tipo") == _t][:8]
        ctx.enviar(f"<b>Notificações de {_r}</b>\n" + ("\n\n".join(f"<b>{_e(n['titulo'])}</b>\n{_e((n.get('detalhe') or '')[:160])}" for n in lst) or "Nenhuma."))
    cmd(f"notif{_t}", "avisos", f"Só as notificações de {_r}")(_fnt)


# =====================================================================================================================
# FAMÍLIAS 1.28.0 (+340): modo + temperatura + ventilação num toque, lotes por modo, salas e zonas por modo, mais
# timers, relatórios em mais períodos (inclusive de um ar), atividade por origem e por janela, notificações por
# gravidade, segurança por janela e mais presets. Mesmo padrão das famílias acima: comandos de verdade, mesmas
# permissões, e o que mexe em vários ares pede Confirmar.
# =====================================================================================================================
_ANTES_128 = len(C)
CATS += [
    ("completos", "Modo, temperatura e ventilação", "Um toque com tudo: /frio23alta, /quente25baixa, /seco24media…"),
    ("lotemodo", "Todos por modo", "Todos os ligados num modo e temperatura: /todosfrio23, /todosquente26…"),
    ("salamodo", "Salas e zonas por modo", "Uma sala ou zona inteira num modo e temperatura"),
    ("historico", "Atividade filtrada", "O que aconteceu por origem (Alexa, painel, agenda…) e por janela de horas"),
]
NOME_CAT.update({k: r for k, r, _ in CATS})
_VENT = (("baixa", "baixa"), ("media", "média"), ("alta", "alta"))
_FAIXA = range(18, 27)   # 18° a 26°: a faixa que se usa no dia a dia

# 1) modo + temperatura + ventilação no ar atual (ou no nome): /frio23alta
for _m in _NM:
    for _g in _FAIXA:
        for _v, _vn in _VENT:
            if f"{_m}{_g}{_v}" in C:
                continue
            def _fcomp(ctx, a, _m=_m, _g=_g, _v=_v):
                _aplicar(ctx, a, ligado=True, modo=_MD[_m], temperatura=max(a["temp_min"], min(a["temp_max"], _g)), ventilador=_v)
            cmd(f"{_m}{_g}{_v}", "completos", f"{_NM[_m]} {_g}° com ventilação {_vn} (ar atual ou /{_m}{_g}{_v} NOME)", f"/{_m}{_g}{_v} NOME",
                arg="ar?", perm="aparelhos.controlar")(_fcomp)

# 2) todos os ligados num modo e temperatura: /todosfrio23 (confirmação)
for _m in ("frio", "quente", "seco", "auto"):
    for _g in _FAIXA:
        def _ftmg(ctx, a, _m=_m, _g=_g):
            _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos em {_NM[_m].lower()} {_g}°", modo=_MD[_m], temperatura=_g)
        cmd(f"todos{_m}{_g}", "lotemodo", f"Todos os ligados em {_NM[_m].lower()} {_g}° (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftmg)

# 3) ligar todos (até os desligados) numa temperatura no frio: /ligartodos23 (confirmação)
for _g in _FAIXA:
    def _flt(ctx, a, _g=_g):
        _lote_ares(ctx, ares(), f"Ligar todos em {_g}°", ligado=True, modo="frio", temperatura=_g)
    cmd(f"ligartodos{_g}", "lotemodo", f"Liga todos os ares no frio a {_g}° (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_flt)

# 4) uma sala inteira num modo e temperatura (liga quem estiver desligado): /salafrio23 NOME
for _m in ("frio", "quente", "seco", "auto"):
    for _g in _FAIXA:
        def _fsmg(ctx, s, _m=_m, _g=_g):
            _lote_ares(ctx, [x for x in ares() if x["projeto_id"] == s["id"]], f"{s['nome']}: {_NM[_m].lower()} {_g}°", ligado=True, modo=_MD[_m], temperatura=_g)
        cmd(f"sala{_m}{_g}", "salamodo", f"Uma sala inteira em {_NM[_m].lower()} {_g}° (liga quem estiver desligado)", f"/sala{_m}{_g} NOME", arg="sala", perm="aparelhos.controlar")(_fsmg)

# 5) uma zona (ares que obedecem juntos) num modo e temperatura: /zonafrio23 NOME
for _m in ("frio", "quente"):
    for _g in _FAIXA:
        def _fzmg(ctx, z, _m=_m, _g=_g):
            _estado_zona(ctx, z, ligado=True, modo=_MD[_m], temperatura=_g)
        cmd(f"zona{_m}{_g}", "salamodo", f"Uma zona inteira em {_NM[_m].lower()} {_g}° (um sinal)", f"/zona{_m}{_g} NOME", arg="zona", perm="aparelhos.controlar")(_fzmg)

# 6) mais timers prontos
for _min in (25, 35, 40, 50, 75, 100, 150, 200, 270):
    if f"desligarem{_min}" in C:
        continue
    def _fdt2(ctx, a, _min=_min):
        from . import telegram
        telegram._temporizador(ctx.cid, a["id"], _min, ctx.mid)
    cmd(f"desligarem{_min}", "timers", f"Desliga daqui a {tempo(_min * 60)}", f"/desligarem{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_fdt2)
for _min in (5, 10, 20, 300, 360, 480):
    if f"ligarpor{_min}" in C:
        continue
    def _flp2(ctx, a, _min=_min):
        from . import automacao
        automacao.criar_temporizador(a["id"], _min, {"ligado": False}, "telegram")
        _aplicar(ctx, a, ligado=True)
    cmd(f"ligarpor{_min}", "timers", f"Liga agora e desliga sozinho em {tempo(_min * 60)}", f"/ligarpor{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_flp2)
for _min in (20, 45, 90, 180, 240):
    if f"ligarem{_min}" in C:
        continue
    def _fle2(ctx, a, _min=_min):
        from . import automacao
        automacao.criar_temporizador(a["id"], _min, {"ligado": True}, "telegram")
        _painel(ctx, a["id"], aviso=f"<b>Timer:</b> liga em {tempo(_min * 60)}.")
    cmd(f"ligarem{_min}", "timers", f"Liga daqui a {tempo(_min * 60)}", f"/ligarem{_min} NOME", arg="ar?", perm="aparelhos.controlar")(_fle2)
for _min in (5, 10, 20, 45, 90, 180, 240):
    if f"desligartodosem{_min}" in C:
        continue
    def _ftt2(ctx, a, _min=_min):
        from . import automacao
        lig = [x for x in ares() if x["ligado"]]
        for x in lig:
            automacao.criar_temporizador(x["id"], _min, {"ligado": False}, "telegram")
        ctx.enviar(f"{len(lig)} ar(es) desligam em {tempo(_min * 60)}." if lig else "Nenhum ar ligado.")
    cmd(f"desligartodosem{_min}", "lote", f"Todos os ligados desligam daqui a {tempo(_min * 60)} (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftt2)

# 7) relatórios em mais períodos
_DIAS = (2, 4, 5, 6, 7, 10, 14, 21, 30, 45, 120, 180, 365)
for _d in _DIAS:
    if f"gasto{_d}d" not in C:
        def _fgd2(ctx, a, _d=_d):
            r = _relatorio(_d)["resumo"]; ctx.enviar(f"<b>Gasto em {_d} dia(s)</b> (estimativa): {brl(r['custo'])} · {num(r['kwh'])} kWh · {num(r['horas_ligado'])} h ligado")
        cmd(f"gasto{_d}d", "periodos", f"Custo estimado em {_d} dia(s)", perm="relatorios.ver")(_fgd2)
    if f"kwh{_d}d" not in C:
        def _fkd2(ctx, a, _d=_d):
            r = _relatorio(_d)["resumo"]; ctx.enviar(f"<b>Consumo em {_d} dia(s)</b>: {num(r['kwh'])} kWh ({num(r['horas_ligado'])} h ligado)")
        cmd(f"kwh{_d}d", "periodos", f"Consumo em kWh em {_d} dia(s)", perm="relatorios.ver")(_fkd2)
for _d in (2, 4, 5, 7, 10, 14, 21, 45, 90):
    if f"horas{_d}d" not in C:
        def _fhd2(ctx, a, _d=_d):
            d = _relatorio(_d)
            ctx.enviar(f"<b>Horas ligado ({_d} dia(s))</b>\n" + ("\n".join(f"• {_e(p['nome'])}: {num(p.get('horas_ligado', 0))} h" for p in sorted(d["por_aparelho"], key=lambda x: -x.get("horas_ligado", 0))[:12]) or "Sem dados."))
        cmd(f"horas{_d}d", "periodos", f"Horas ligado por ar em {_d} dia(s)", perm="relatorios.ver")(_fhd2)
for _d in (2, 4, 5, 7, 10, 14, 21, 45, 60):
    if f"ranking{_d}d" not in C:
        def _frd2(ctx, a, _d=_d):
            d = _relatorio(_d)
            ctx.enviar(f"<b>Mais usados ({_d} dia(s))</b>\n" + ("\n".join(f"{i + 1}. {_e(p['nome'])}: {p['comandos']} comando(s)" for i, p in enumerate(d["por_aparelho"][:10])) or "Sem dados."))
        cmd(f"ranking{_d}d", "periodos", f"Ares mais usados em {_d} dia(s)", perm="relatorios.ver")(_frd2)
for _d in (1, 2, 5, 10, 14, 21, 60, 90):
    if f"falhas{_d}d" not in C:
        def _ffd2(ctx, a, _d=_d):
            n = db.um("SELECT count(*) n FROM atividade WHERE ok = 0 AND quando > ?", (db.agora() - _d * 86400,))["n"]
            ctx.enviar(f"{n} comando(s) falharam em {_d} dia(s)." + (" Use /falhas para ver as últimas." if n else ""))
        cmd(f"falhas{_d}d", "periodos", f"Quantos comandos falharam em {_d} dia(s)", perm="atividade.ver")(_ffd2)
for _d in (2, 4, 5, 7, 10, 21, 45, 120):
    if f"relatorio{_d}d" not in C:
        def _fpd2(ctx, a, _d=_d):
            ctx.enviar(_resumo_txt(f"Últimos {_d} dia(s)", _relatorio(_d)))
        cmd(f"relatorio{_d}d", "periodos", f"Resumo completo dos últimos {_d} dia(s)", perm="relatorios.ver")(_fpd2)

# 8) relatório de UM ar (ar atual ou pelo nome)
for _d in (1, 7, 30):
    def _fga(ctx, a, _d=_d):
        p = next((x for x in _relatorio(_d)["por_aparelho"] if x["id"] == a["id"]), None)
        ctx.enviar(f"<b>{_e(a['nome'])} · {_d} dia(s)</b>\n" + (f"Gasto: {brl(p['custo'])} · {num(p['kwh'])} kWh\nLigado: {num(p['horas_ligado'])} h em {p['sessoes']} sessão(ões)\n"
                                                                f"Comandos: {p['comandos']} ({p['falhas']} falha(s))" if p else "Sem uso no período."))
    cmd(f"usoar{_d}d", "periodos", f"Gasto, horas e comandos de um ar em {_d} dia(s)", f"/usoar{_d}d NOME", arg="ar?", perm="relatorios.ver")(_fga)

# 9) atividade por origem e por janela de horas
_ORIG = (("alexa", "Alexa (voz)", ("sinric", "alexa")), ("painel", "Painel e app", ("painel",)), ("agenda", "Agenda e cenas", ("agenda", "cena")),
         ("automacao", "Automações", ("automacao",)), ("telegram", "Telegram", ("telegram",)), ("ia", "Assistente de IA", ("ia",)),
         ("musica", "Música", ("musica",)), ("agente", "Agente do escritório", ("agente",)), ("sistema", "Sistema", ("sistema",)), ("mapa", "Mapa 3D", ("mapa",)))
for _k, _r, _pref in _ORIG:
    def _fori(ctx, a, _r=_r, _pref=_pref):
        cond = " OR ".join("origem LIKE ?" for _ in _pref)
        lst = db.consultar(f"SELECT quando, acao, ok FROM atividade WHERE ({cond}) ORDER BY quando DESC LIMIT 15", tuple(f"{p}%" for p in _pref))
        ctx.enviar(f"<b>Atividade · {_e(_r)}</b>\n" + ("\n".join(f"{quando(e['quando'])} · {_e(e['acao'][:52])}{'' if e['ok'] else ' · falhou'}" for e in lst) or "Nada registrado."))
    cmd(f"atividade_{_k}", "historico", f"Últimos eventos vindos de: {_r}", perm="atividade.ver")(_fori)
for _h in (1, 3, 6, 12, 24, 48):
    def _fjan(ctx, a, _h=_h):
        r = db.um("SELECT count(*) n, count(*) FILTER (WHERE ok = 0) f FROM atividade WHERE quando > ?", (db.agora() - _h * 3600,))
        lst = db.consultar("SELECT quando, origem, acao, ok FROM atividade WHERE quando > ? ORDER BY quando DESC LIMIT 12", (db.agora() - _h * 3600,))
        ctx.enviar(f"<b>Últimas {_h} h</b>: {r['n']} evento(s), {r['f']} falha(s)\n" + "\n".join(f"{quando(e['quando'])} · {_e(e['acao'][:44])} · {_e(e['origem'])}{'' if e['ok'] else ' · falhou'}" for e in lst))
    cmd(f"atividade{_h}h", "historico", f"Tudo o que aconteceu nas últimas {_h} h", perm="atividade.ver")(_fjan)
for _h in (1, 6, 12, 48):
    def _fseg(ctx, a, _h=_h):
        lst = db.consultar("SELECT tipo, count(*) n FROM seguranca_eventos WHERE quando > ? GROUP BY tipo ORDER BY n DESC LIMIT 12", (db.agora() - _h * 3600,))
        ctx.enviar(f"<b>Segurança · últimas {_h} h</b>\n" + ("\n".join(f"• {_e(e['tipo'])}: {e['n']}" for e in lst) or "Nenhum evento."))
    cmd(f"seguranca{_h}h", "seg", f"Eventos de segurança por tipo nas últimas {_h} h", perm="seguranca.gerenciar")(_fseg)

# 10) notificações por gravidade
for _gr, _gn in (("alta", "alta"), ("media", "média"), ("baixa", "baixa"), ("critica", "crítica")):
    def _fgr(ctx, a, _gr=_gr, _gn=_gn):
        lst = [n for n in _notifs("todas", 60) if n.get("gravidade") == _gr][:8]
        ctx.enviar(f"<b>Notificações de gravidade {_gn}</b>\n" + ("\n\n".join(f"<b>{_e(n['titulo'])}</b>\n{_e((n.get('detalhe') or '')[:160])}" for n in lst) or "Nenhuma."))
    cmd(f"notif_{_gr}", "avisos", f"Só as notificações de gravidade {_gn}")(_fgr)

# 11) mais presets de luzes e persianas
for _p in (10, 20, 30, 40, 60, 70, 80, 90):
    if f"persianas{_p}" not in C:
        def _fpp2(ctx, a, _p=_p):
            from . import acesso, dispositivos
            if not acesso.pode("aparelhos.controlar"):
                raise RuntimeError("seu usuário não tem permissão para isto.")
            ok = 0
            for d in [d for d in _disp("persiana") if d["conectado"]]:
                try:
                    dispositivos.comando(int(d["id"]), "posicao", _p, "telegram"); ok += 1
                except Exception:  # noqa: BLE001
                    pass
            ctx.enviar(f"{ok} persiana(s) em {_p}%." if ok else "Nenhuma persiana com motor conectado.")
        cmd(f"persianas{_p}", "presets", f"Todas as persianas em {_p}%", perm="aparelhos.controlar")(_fpp2)
    if f"luzes{_p}" not in C:
        def _flb2(ctx, a, _p=_p):
            from . import acesso, dispositivos
            if not acesso.pode("aparelhos.controlar"):
                raise RuntimeError("seu usuário não tem permissão para isto.")
            ok = 0
            for d in [d for d in _disp("luz") if d["conectado"]]:
                try:
                    dispositivos.comando(int(d["id"]), "brilho", _p, "telegram"); ok += 1
                except Exception:  # noqa: BLE001
                    pass
            ctx.enviar(f"{ok} luz(es) em {_p}%." if ok else "Nenhuma luz com brilho conectada.")
        cmd(f"luzes{_p}", "presets", f"Todas as luzes acesas em {_p}% de brilho", perm="aparelhos.controlar")(_flb2)
NOVOS_128 = len(C) - _ANTES_128


# =====================================================================================================================
# FAMÍLIAS 0.4.4 (20/11): horários fixos, previsão por hora, segurança por tipo, bugs, uso da IA, atividade por origem,
# todos os ligados em modo+ventilação, guia, glossário, telas e roteiros de problema. Tudo usa funções reais do sistema.
# =====================================================================================================================
_ANTES_044 = len(C)
CATS += [
    ("horarios", "Horários", "Desligar ou ligar o ar atual num horário: /desligar_1800, /ligar_0730"),
    ("guia", "Guia e glossário", "Passo a passo, o que é cada coisa, telas do painel e o que fazer quando algo falha"),
]
NOME_CAT.update({k: r for k, r, _ in CATS})
_BR = datetime.timezone(datetime.timedelta(hours=-3))
APP = "https://app.zynio.com.br"


def _minutos_ate(h: int, m: int) -> int:
    agora = datetime.datetime.now(_BR)
    alvo = agora.replace(hour=h, minute=m, second=0, microsecond=0)
    if alvo <= agora:
        alvo += datetime.timedelta(days=1)
    return max(1, round((alvo - agora).total_seconds() / 60))


# 1) horários: 06:00 a 23:30, de meia em meia hora (72 comandos)
for _h in range(6, 24):
    for _mm in (0, 30):
        _hm = f"{_h:02d}{_mm:02d}"

        def _fdh(ctx, a, _h=_h, _mm=_mm):
            from . import automacao
            mins = _minutos_ate(_h, _mm)
            automacao.criar_temporizador(a["id"], mins, {"ligado": False}, "telegram")
            _painel(ctx, a["id"], aviso=f"<b>Timer:</b> desliga às {_h:02d}:{_mm:02d} (em {tempo(mins * 60)}).")
        cmd(f"desligar_{_hm}", "horarios", f"Desliga o ar às {_h:02d}:{_mm:02d} (hoje ou amanhã)", f"/desligar_{_hm} NOME", arg="ar?", perm="aparelhos.controlar")(_fdh)

        def _flh(ctx, a, _h=_h, _mm=_mm):
            from . import automacao
            mins = _minutos_ate(_h, _mm)
            automacao.criar_temporizador(a["id"], mins, {"ligado": True}, "telegram")
            _painel(ctx, a["id"], aviso=f"<b>Timer:</b> liga às {_h:02d}:{_mm:02d} (em {tempo(mins * 60)}).")
        cmd(f"ligar_{_hm}", "horarios", f"Liga o ar às {_h:02d}:{_mm:02d} (hoje ou amanhã)", f"/ligar_{_hm} NOME", arg="ar?", perm="aparelhos.controlar")(_flh)

# 2) previsão hora a hora (12) e por dia (3)
for _n in range(1, 13):
    def _fph(ctx, a, _n=_n):
        d = _clima()
        x = (d.get("proximas") or [])[_n - 1:_n]
        if not x:
            return ctx.enviar("Previsão indisponível agora.")
        x = x[0]
        ctx.enviar(f"<b>Daqui a {_n} h ({_e(x['hora'])})</b>: {num(x['temperatura'])}°C, {_e(x['condicao'])}, chance de chuva {x['chuva']}%, nuvens {x['nuvens']}%")
    cmd(f"previsao_{_n}h", "clima", f"Tempo daqui a {_n} hora(s)")(_fph)
for _n in range(1, 4):
    def _fpd2(ctx, a, _n=_n):
        dias = _clima().get("dias") or []
        if len(dias) < _n:
            return ctx.enviar("Previsão indisponível agora.")
        x = dias[_n - 1]
        ctx.enviar(f"<b>{_e(x['data'][8:10])}/{_e(x['data'][5:7])}</b>: {num(x['min'])}° a {num(x['max'])}°, {_e(x['condicao'])}, chance de chuva {x['chuva']}%")
    cmd(f"dia_{_n}", "clima", "Previsão de hoje" if _n == 1 else ("Previsão de amanhã" if _n == 2 else "Previsão de depois de amanhã"))(_fpd2)


# 3) segurança: ataques por janela (5) e eventos por tipo (um comando por tipo)
def _eventos(horas: int, tipo: str | None = None) -> list[dict]:
    sql, p = "SELECT tipo, ip, pais, rota, quando FROM seguranca_eventos WHERE quando > ?", [db.agora() - horas * 3600]
    if tipo:
        sql += " AND tipo = ?"; p.append(tipo)
    return db.consultar(sql + " ORDER BY id DESC LIMIT 500", p)


for _h, _rot in ((1, "1 hora"), (6, "6 horas"), (24, "24 horas"), (72, "3 dias"), (168, "7 dias")):
    def _fat(ctx, a, _h=_h, _rot=_rot):
        ev = [e for e in _eventos(_h) if e["tipo"] not in ("acesso", "login_ok", "consentimento", "site_contato")]
        if not ev:
            return ctx.enviar(f"Nenhum ataque ou bloqueio nas últimas {_rot}.")
        por = {}
        for e in ev:
            por[e["tipo"]] = por.get(e["tipo"], 0) + 1
        ips = {}
        for e in ev:
            ips[e["ip"]] = ips.get(e["ip"], 0) + 1
        ctx.enviar(f"<b>Últimas {_rot}: {len(ev)} evento(s)</b>\n" + "\n".join(f"• {_e(t)}: {n}" for t, n in sorted(por.items(), key=lambda x: -x[1])[:12])
                   + "\n\n<b>IPs mais ativos</b>\n" + "\n".join(f"• <code>{_e(i)}</code>: {n}" for i, n in sorted(ips.items(), key=lambda x: -x[1])[:6]))
    cmd(f"ataques_{_h}h" if _h < 72 else f"ataques_{_h // 24}d", "seg", f"Ataques e bloqueios nas últimas {_rot}", perm="seguranca.gerenciar")(_fat)
try:
    from . import seguranca_relatorio as _sr
    _TIPOS = sorted(getattr(_sr, "ROTULOS", {}).items())
except Exception:  # noqa: BLE001
    _TIPOS = []
for _t, _r in _TIPOS:
    def _fet(ctx, a, _t=_t, _r=_r):
        ev = _eventos(168, _t)
        if not ev:
            return ctx.enviar(f"Nenhum evento \"{_e(_r)}\" nos últimos 7 dias.")
        ctx.enviar(f"<b>{_e(_r)} · 7 dias: {len(ev)}</b>\n" + "\n".join(f"• {quando(e['quando'])} · <code>{_e(e['ip'])}</code> {_e(e.get('pais') or '')} · {_e((e.get('rota') or '')[:40])}" for e in ev[:12]))
    cmd(f"ev_{_t}"[:32], "seg", f"Eventos de segurança: {_r} (7 dias)", perm="seguranca.gerenciar")(_fet)


# 4) bugs (7)
def _lista_bugs(ctx, filtro_sql="", params=(), titulo="Bugs abertos"):
    bs = db.consultar(f"SELECT id, titulo, gravidade, categoria, ocorrencias FROM bugs WHERE estado IN ('aberto','analisando'){filtro_sql} ORDER BY atualizado_em DESC LIMIT 15", params)
    ctx.enviar(f"<b>{titulo}: {len(bs)}</b>\n" + ("\n".join(f"• #{b['id']} [{_e(b['gravidade'])}] {_e(b['titulo'][:90])} ({b['ocorrencias']}×)" for b in bs) or "Nada aberto.")
               + f"\n\nDetalhes e prompt para a IA corrigir: {APP}/bugs")


cmd("bugs_abertos", "avisos", "Bugs abertos agora", perm="configuracoes.gerenciar")(lambda ctx, a: _lista_bugs(ctx))
for _c, _rot in (("cadastro", "de cadastro (ares, transmissores)"), ("tela", "de tela"), ("servidor", "do servidor"), ("atividade", "de comandos")):
    cmd(f"bugs_{_c}", "avisos", f"Bugs abertos {_rot}", perm="configuracoes.gerenciar")(
        lambda ctx, a, _c=_c, _rot=_rot: _lista_bugs(ctx, " AND categoria = ?", (_c,), f"Bugs {_rot}"))
cmd("bugs_criticos", "avisos", "Bugs abertos de gravidade alta ou crítica", perm="configuracoes.gerenciar")(
    lambda ctx, a: _lista_bugs(ctx, " AND gravidade IN ('alta','critica')", (), "Bugs graves"))


@cmd("autoteste", "avisos", "Testa os cadastros (sala, transmissor, ar, botão) sem gravar nada", perm="configuracoes.gerenciar")
def c_autoteste(ctx, a):
    from . import bugs
    ps = bugs.autoteste()
    ctx.enviar(f"<b>Autoteste: {sum(p['ok'] for p in ps)} de {len(ps)} ok</b>\n" + "\n".join(f"{'✔' if p['ok'] else '✘'} {_e(p['nome'])}" for p in ps))


@cmd("procurar_bugs", "avisos", "Procura problemas no sistema agora", perm="configuracoes.gerenciar")
def c_procurar_bugs(ctx, a):
    from . import bugs
    r = bugs.varrer()
    ctx.enviar(f"Procura concluída: {r['achados']} ponto(s) encontrados ou atualizados." if r["achados"] else "Procura concluída: nada novo.")


# 5) uso da IA (2)
@cmd("uso_ia", "ia", "Seu uso do Assistente: sessão de 5 horas e semana")
def c_uso_ia(ctx, a):
    from . import ia_uso
    s = ia_uso.status(ctx.u)
    if s["ilimitado"]:
        return ctx.enviar(f"Sua conta não tem limite. Usado: {s['sessao']['usado']:,} tokens na sessão e {s['semana']['usado']:,} na semana.".replace(",", "."))
    linhas = []
    for k, r in (("sessao", "Sessão (5 h)"), ("semana", "Semana (7 dias)")):
        j = s[k]
        barra = "█" * round(j["pct"] / 10) + "░" * (10 - round(j["pct"] / 10))
        linhas.append(f"<b>{r}</b> {barra} {j['pct']}%" + (f" · libera {ia_uso.hora_br(j['reinicia_em'])}" if j.get("reinicia_em") else ""))
    ctx.enviar("\n".join(linhas))


@cmd("limites_ia", "ia", "Limites de uso da IA definidos pelo dono", papel="dono")
def c_limites_ia(ctx, a):
    from . import ia_uso
    c = ia_uso.config()
    ctx.enviar(f"<b>Limites da IA</b>\nSessão de 5 h: {c['sessao']:,} tokens\nSemana: {c['semana']:,} tokens\nDono sem limite: {'sim' if c['dono_ilimitado'] else 'não'}\n"
               f"Exceções por pessoa: {len(c['usuarios'])}\nMude em {APP}/ia → Configurações.".replace(",", "."))


# 6) atividade por origem (10) e falhas por janela (3)
for _o, _r in (("painel", "pelo painel"), ("alexa", "pela Alexa"), ("agenda", "pela agenda"), ("automacao", "pelas automações"), ("cena", "pelas cenas"),
               ("telegram", "pelo Telegram"), ("ia", "pela IA"), ("musica", "da música"), ("sistema", "do sistema"), ("app", "pelos apps")):
    def _fori(ctx, a, _o=_o, _r=_r):
        rs = db.consultar("SELECT quando, acao, ok FROM atividade WHERE origem = ? ORDER BY id DESC LIMIT 12", (_o,))
        ctx.enviar(f"<b>Últimos comandos {_r}</b>\n" + ("\n".join(f"{'✔' if r['ok'] else '✘'} {quando(r['quando'])} · {_e(r['acao'][:70])}" for r in rs) or "Nada registrado."))
    cmd(f"origem_{_o}", "dados", f"Últimos comandos {_r}", perm="atividade.ver")(_fori)
for _h in (1, 6, 24):
    def _ffh(ctx, a, _h=_h):
        rs = db.consultar("SELECT quando, acao, detalhe FROM atividade WHERE ok = 0 AND quando > ? ORDER BY id DESC LIMIT 12", (db.agora() - _h * 3600,))
        ctx.enviar(f"<b>Falhas na última(s) {_h} h: {len(rs)}</b>\n" + ("\n".join(f"• {quando(r['quando'])} · {_e(r['acao'][:50])}: {_e((r['detalhe'] or '')[:60])}" for r in rs) or "Nenhuma."))
    cmd(f"falhas_{_h}h", "dados", f"Comandos que falharam na(s) última(s) {_h} h", perm="atividade.ver")(_ffh)

# 7) todos os ligados em modo + ventilação (20)
for _m in _NM:
    for _v, _vn in (("baixa", "baixa"), ("media", "média"), ("alta", "alta"), ("auto", "automática")):
        def _ftmv(ctx, a, _m=_m, _v=_v):
            _lote_ares(ctx, [x for x in ares() if x["ligado"]], f"Todos em {_NM[_m].lower()} com ventilação {_v}", modo=_MD[_m], ventilador=_v)
        cmd(f"todos_{_m}_{_v}", "lote", f"Todos os ligados em {_NM[_m].lower()} com ventilação {_vn} (pede confirmação)", perm="aparelhos.controlar", confirmar=True)(_ftmv)

# 8) guia: um comando por capítulo do passo a passo do painel (29)
_GUIA = [("como_funciona", "como-funciona", "Como o sistema funciona"), ("antes", "antes", "Antes de começar"), ("smart_life", "smart-life", "App Smart Life: transmissor no Wi-Fi"),
         ("conta_tuya", "conta-tuya", "Ligar a conta Smart Life ao sistema"), ("transmissores", "transmissores", "Trazer os transmissores"),
         ("aparelhos", "aparelhos", "Cadastrar o ar-condicionado"), ("botoes", "botoes", "Gravar os botões do controle"), ("remoto", "remoto", "Usar no dia a dia e desligar de longe"),
         ("windows", "windows", "Agente no PC Windows"), ("varios_ares", "varios-ares", "Um transmissor para vários ares (zonas)"),
         ("sala_transmissor", "sala-transmissor", "Um transmissor por sala"), ("sinric", "sinric", "Sinric Pro: a ponte para a Alexa"), ("alexa", "alexa", "Colocar na Alexa"),
         ("outra_alexa", "outra-alexa", "Integrar outra Alexa"), ("voz", "voz", "Comandos de voz e rotinas da Alexa"), ("google", "google", "Google Home"),
         ("mapa", "mapa", "Mapa do escritório"), ("musica", "musica", "Música com Spotify"), ("dominio", "dominio", "Domínio e e-mails"), ("luzes", "luzes", "Iluminação"),
         ("notificacoes", "notificacoes", "Notificações e relatórios por e-mail"), ("raspberry", "raspberry", "Raspberry Pi: agente 24 horas"), ("telegram", "telegram", "Bot do Telegram"),
         ("bugs", "bugs", "Bugs: relatar e corrigir com IA"), ("ia", "ia", "IA no terminal (clima-ia)"), ("relatorios", "seg-relatorio", "Relatórios oficiais e por e-mail"),
         ("dono", "dono", "Transferir o posto de dono"), ("avatares", "avatares", "Avatares 3D"), ("problemas", "problemas", "Quando algo não funciona")]
for _k, _id, _t in _GUIA:
    cmd(f"guia_{_k}", "guia", f"Passo a passo: {_t}")(
        lambda ctx, a, _id=_id, _t=_t: ctx.enviar(f"<b>{_e(_t)}</b>\nO passo a passo completo, com figuras, está no painel:", [[{"text": "Abrir o passo a passo", "url": f"{APP}/guia#{_id}"}], [{"text": "Menu", "callback_data": "m:menu"}]]))

# 9) glossário (16)
_GLOSS = [("agente", "Agente", "O programa que roda num computador do escritório (Mac, PC ou Raspberry Pi) e fala com os transmissores pela rede local. Sem agente ligado no escritório, nenhum comando chega aos ares."),
          ("principal", "Principal e reserva", "Só um agente executa por vez (o principal). Os outros ficam de reserva e assumem em até 45 segundos se o principal sumir."),
          ("preferido", "Agente preferido", "O computador que deve ficar no comando quando está ligado e enxerga os transmissores."),
          ("transmissor", "Transmissor", "O Smart IR (SRW-004) no teto: recebe o comando pelo Wi-Fi e manda o sinal infravermelho para o ar."),
          ("botao", "Botão gravado", "O sinal do controle remoto original, gravado uma vez. O sistema reenvia esse sinal pelo transmissor."),
          ("gree", "Gree", "Protocolo do controle Gree: com só o Desligar gravado, o sistema gera os 300 ajustes (modos, 16° a 30°, ventilações)."),
          ("zona", "Zona", "Ares iguais à vista do mesmo transmissor obedecem ao mesmo sinal (o infravermelho não tem endereço). Um comando muda todos da zona."),
          ("interferencia", "Teste de interferência", "Manda o sinal de um ar por vez; quem está na sala marca quem apitou. O resultado vira as zonas reais."),
          ("fila", "Fila de comandos", "A nuvem não alcança a rede do escritório: ela grava o pedido na fila e o agente executa e devolve o resultado."),
          ("sinric", "Sinric Pro", "A ponte entre a Alexa (ou o Google Home) e o sistema. Cada ar na Alexa é um aparelho do Sinric."),
          ("portao", "Portão", "A tela \"Executando verificação de segurança\" antes do sistema: barra robôs com o Turnstile da Cloudflare."),
          ("convite", "Código de instalação", "Código de uso único (30 minutos) que leva a configuração do agente para um computador novo."),
          ("escudo", "Escudo anti-DDoS", "Liga sozinho quando chegam pedidos demais e corta quem passa do limite. Com ele ligado, o login pode pedir uma verificação extra."),
          ("pin", "PIN do Telegram", "Seis dígitos que você cria no painel: comandos críticos pelo bot (desligar todos, bloquear IP) pedem o PIN."),
          ("tokens", "Tokens da IA", "Unidade que a IA usa para medir texto. Os limites da sessão (5 h) e da semana contam tokens."),
          ("novidades", "Novidades", "Cada publicação ganha um número em sequência (0.0.0, 0.0.1…) e a lista do que mudou aparece uma vez para cada pessoa.")]
for _k, _t, _d in _GLOSS:
    cmd(f"oque_{_k}", "guia", f"O que é: {_t}")(lambda ctx, a, _t=_t, _d=_d: ctx.enviar(f"<b>{_e(_t)}</b>\n{_e(_d)}"))

# 10) telas do painel (30)
_TELAS = [("painel", "/", "Painel"), ("projetos", "/projetos", "Projetos e salas"), ("mapa", "/mapa", "Mapa 2D/3D"), ("relatorios", "/relatorios", "Relatórios"),
          ("aparelhos", "/aparelhos", "Aparelhos"), ("cenas", "/cenas", "Cenas"), ("automacoes", "/automacoes", "Automações"), ("agenda", "/agendamentos", "Agenda"),
          ("transmissores", "/transmissores", "Transmissores"), ("luzes", "/luzes", "Iluminação"), ("musica", "/musica", "Música"), ("integracoes", "/integracoes", "Integrações (Alexa)"),
          ("comandos_alexa", "/comandos-alexa", "Frases da Alexa"), ("emails", "/emails", "E-mails"), ("supabase", "/supabase", "Banco de dados"), ("infra", "/infra", "Infraestrutura"),
          ("atividade", "/atividade", "Atividade"), ("seguranca", "/seguranca", "Segurança"), ("mensagens", "/mensagens", "Mensagens do site"), ("configuracoes", "/configuracoes", "Configurações"),
          ("apps", "/apps", "Baixar apps"), ("guia", "/guia", "Passo a passo"), ("novidades", "/novidades", "Novidades"), ("ia", "/ia", "Assistente de IA"),
          ("telegram", "/telegram", "Bot do Telegram"), ("bugs", "/bugs", "Bugs"), ("notificacoes", "/notificacoes", "Notificações"), ("backup", "/backup", "Backup"),
          ("treinamento", "/treinamento", "Treinamento"), ("avatares", "/avatares", "Avatares")]
for _k, _rota, _t in _TELAS:
    cmd(f"abrir_{_k}", "guia", f"Abrir a tela {_t} no painel")(
        lambda ctx, a, _rota=_rota, _t=_t: ctx.enviar(f"<b>{_e(_t)}</b>", [[{"text": f"Abrir {_t}", "url": f"{APP}{_rota}"}], [{"text": "Menu", "callback_data": "m:menu"}]]))

# 11) roteiros quando algo dá errado (9)
_PROB = [("ar_nao_obedece", "O ar não obedece", "1. /falhas mostra o erro.\n2. /agentes: existe um principal online que enxerga o transmissor?\n3. /transmissores: o do ar está online?\n4. O ar apitou? Se não: posição do transmissor ou gravação ruim (grave o Desligar de novo)."),
         ("sem_botoes", "Botões do painel desativados", "O ar escolhido não tem transmissor. Vincule em Aparelho → Ajustes ou escolha outro ar."),
         ("agente_cego", "Agente não enxerga os transmissores", "O computador está fora da rede do escritório, num Wi-Fi diferente, ou o transmissor está desligado. Ligue um computador do escritório."),
         ("transmissor_novo", "Transmissor pareado de novo / Wi-Fi novo", "Pareie no Smart Life (Wi-Fi 2,4 GHz) com o agente na mesma rede e use Transmissores → Reconectar agora."),
         ("dois_ares_juntos", "Dois ares iguais mudam juntos", "É físico: o mesmo sinal chega aos dois. Trate como zona (teste de interferência) ou use um transmissor para cada, virado só para o seu ar."),
         ("alexa_ok_nada", "A Alexa diz ok e o ar não muda", "Integrações → Diagnóstico: o agente enxerga os transmissores? A zona tem um aparelho na Alexa? O ar tem botões gravados?"),
         ("portao_parado", "Portão \"Verificando…\" parado", "Espere 20 s ou toque em Tentar de novo. Abrir zynio.com.br também libera."),
         ("login_bloqueado", "Não consigo entrar", "Confira o e-mail e use Esqueci a senha. Muitas tentativas bloqueiam o IP por um tempo; o dono libera em Segurança → IPs."),
         ("gravacao_sem_sinal", "Gravação: nenhum sinal recebido", "Aponte o controle para o transmissor a 10–30 cm e aperte o botão nos 30 s. Se repetir, o protocolo do transmissor pode estar errado: Transmissores → Reconectar.")]
for _k, _t, _d in _PROB:
    cmd(f"problema_{_k}", "guia", f"O que fazer: {_t}")(lambda ctx, a, _t=_t, _d=_d: ctx.enviar(f"<b>{_e(_t)}</b>\n{_e(_d)}", [[{"text": "Roteiro completo", "url": f"{APP}/guia#problemas"}], [{"text": "Menu", "callback_data": "m:menu"}]]))

NOVOS_044 = len(C) - _ANTES_044

from . import telegram_cmds_extra  # noqa: E402,F401  (14 categorias novas da 0.6.8: tarefas, backup, acessos, lembretes…)
from . import telegram_cmds_logs  # noqa: E402,F401  (0.6.9: logs, quem fez o quê, auditoria, segurança, uso, conversões, glossário, telas…)
