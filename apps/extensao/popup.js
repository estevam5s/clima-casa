// Janela da extensão: ares (ligar/desligar), cenas e avisos. Usa o token que o painel passou (fundo.js); sem token, explica o que fazer.
const API = 'https://app.zynio.com.br'
const nav = globalThis.browser || globalThis.chrome
const $ = (id) => document.getElementById(id)
let token = ''

function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag)
  Object.assign(e, props)
  for (const f of filhos) e.append(f)
  return e
}
async function api(metodo, caminho, corpo) {
  const r = await fetch(API + caminho, { method: metodo, headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  const d = await r.json().catch(() => null)
  if (r.status === 401) throw Object.assign(new Error('A sessão venceu. Abra o painel para renovar.'), { sessao: true })
  if (!r.ok) throw new Error(d?.detail || `Erro ${r.status}`)
  return d
}
function semSessao(msg) {
  $('conteudo').replaceChildren(
    el('p', { textContent: msg || 'Entre no painel neste navegador. A extensão usa a mesma sessão, sem pedir senha de novo.' }),
    el('p', { className: 'ajuda', textContent: 'Depois de entrar, feche e abra esta janela. Se o painel ficar fechado por mais de 1 hora, abra de novo para renovar.' }),
  )
}

async function carregar() {
  const s = await nav.storage.local.get(['token', 'expira', 'nome'])
  if (!s.token || (s.expira && s.expira * 1000 < Date.now())) return semSessao(s.token ? 'A sessão venceu. Abra o painel para renovar.' : '')
  token = s.token
  $('rodape').textContent = s.nome ? `Conectado como ${s.nome}` : ''
  try {
    const [ares, cenas, avisos] = await Promise.all([api('GET', '/api/aparelhos'), api('GET', '/api/cenas').catch(() => []), api('GET', '/api/notificacoes').catch(() => null)])
    const st = avisos?.status
    if (st) {
      $('estado').hidden = false
      $('estado').className = st.agente_online ? 'estado' : 'estado alerta'
      $('estado').textContent = st.agente_online ? `${st.ligados} de ${st.aparelhos} ares ligados · ${avisos.contagem?.nao_lidas || 0} aviso(s) não lido(s)` : 'Nenhum agente no escritório: os comandos não chegam aos ares.'
    }
    const lista = (Array.isArray(ares) ? ares : ares?.itens || []).filter((a) => a.hub_id)
    const blocos = [el('h2', { textContent: 'Ares' })]
    if (!lista.length) blocos.push(el('p', { className: 'ajuda', textContent: 'Nenhum ar com transmissor sob sua responsabilidade.' }))
    else blocos.push(el('ul', {}, ...lista.map(linhaAr)))
    const cs = Array.isArray(cenas) ? cenas : cenas?.itens || []
    if (cs.length) blocos.push(el('h2', { textContent: 'Cenas' }), el('ul', {}, ...cs.slice(0, 8).map(linhaCena)))
    $('conteudo').replaceChildren(...blocos)
  } catch (e) {
    if (e.sessao) return semSessao(e.message)
    $('conteudo').replaceChildren(el('p', { className: 'erro', textContent: e.message }))
  }
}

function linhaAr(a) {
  const botao = el('button', { className: a.ligado ? 'ligado' : '', textContent: a.ligado ? 'Ligado' : 'Desligado' })
  botao.setAttribute('aria-pressed', String(!!a.ligado))
  botao.setAttribute('aria-label', `${a.ligado ? 'Desligar' : 'Ligar'} ${a.nome}`)
  const sub = el('span', { className: 'sub', textContent: a.ligado ? `${a.temperatura ?? ''}° · ${a.modo || ''}` : (a.projeto_nome || a.comodo || '') })
  botao.addEventListener('click', async () => {
    botao.disabled = true
    try {
      const r = await api('POST', `/api/aparelhos/${a.id}/estado`, { ligado: !a.ligado })
      a.ligado = !!r.ligado; a.temperatura = r.temperatura; a.modo = r.modo
      botao.className = a.ligado ? 'ligado' : ''; botao.textContent = a.ligado ? 'Ligado' : 'Desligado'
      botao.setAttribute('aria-pressed', String(a.ligado))
      sub.textContent = a.ligado ? `${a.temperatura ?? ''}° · ${a.modo || ''}` : ''
    } catch (e) { sub.textContent = e.message; sub.className = 'sub erro' } finally { botao.disabled = false }
  })
  return el('li', {}, el('span', { className: 'nome' }, a.nome, sub), botao)
}
function linhaCena(c) {
  const botao = el('button', { textContent: 'Rodar' })
  botao.setAttribute('aria-label', `Rodar a cena ${c.nome}`)
  const sub = el('span', { className: 'sub' })
  botao.addEventListener('click', async () => {
    botao.disabled = true
    try { const r = await api('POST', `/api/cenas/${c.id}/executar`); sub.textContent = r?.falhas?.length ? `${r.falhas.length} comando(s) falharam` : 'Feito' } catch (e) { sub.textContent = e.message; sub.className = 'sub erro' } finally { botao.disabled = false }
  })
  return el('li', {}, el('span', { className: 'nome' }, c.nome, sub), botao)
}

carregar()
