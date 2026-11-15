'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Cookie, Lock, X } from 'lucide-react'
import { SISTEMA_URL } from '@/lib/dados'
import { CHAVE_CONSENTIMENTO, lerConsentimento } from '@/lib/consentimento'

// Aviso de cookies (LGPD): aparece até a pessoa escolher, guarda a escolha por categoria, registra a prova do
// consentimento no sistema (sem IP em claro) e fica sempre acessível pelo botão flutuante para mudar de ideia.
// Textos, categorias e a lista de cookies vêm do sistema (Configurações → Cookies do site).
const PADRAO = {
  ativo: true, versao: 1, dias_validade: 180, posicao: 'rodape', titulo: 'Sua privacidade',
  texto: 'Usamos cookies essenciais para o site funcionar e ficar seguro. Com a sua permissão, usamos também cookies de preferências.',
  categorias: [{ id: 'essenciais', nome: 'Essenciais', obrigatoria: true, descricao: 'Necessários para o site funcionar.' }, { id: 'preferencias', nome: 'Preferências', obrigatoria: false, descricao: 'Lembram suas escolhas.' }],
  cookies: [],
}
const CACHE = 'zynio-cookies-config'

function idAnonimo() {
  try {
    let id = localStorage.getItem('zynio-cookies-id')
    if (!id) { id = crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; localStorage.setItem('zynio-cookies-id', id) }
    return id
  } catch { return `sem-armazenamento-${Date.now().toString(36)}` }
}

export default function Cookies() {
  const [cfg, setCfg] = useState(null)
  const [mostrar, setMostrar] = useState(false)
  const [detalhes, setDetalhes] = useState(false)
  const [escolhas, setEscolhas] = useState({})
  const [aberta, setAberta] = useState(null)
  const [salvo, setSalvo] = useState(null)

  useEffect(() => {
    let vivo = true
    const usar = (c) => {
      if (!vivo || !c?.ativo) return
      setCfg(c)
      const atual = lerConsentimento()
      setSalvo(atual)
      setEscolhas(Object.fromEntries(c.categorias.map((k) => [k.id, k.obrigatoria || !!atual?.escolhas?.[k.id]])))
      if (!atual || atual.versao !== c.versao) setTimeout(() => vivo && setMostrar(true), 900)
    }
    try { const c = JSON.parse(sessionStorage.getItem(CACHE) || 'null'); if (c) usar(c) } catch { /* sem cache */ }
    fetch(`${SISTEMA_URL}/api/site/cookies`).then((r) => (r.ok ? r.json() : PADRAO)).catch(() => PADRAO).then((c) => {
      try { sessionStorage.setItem(CACHE, JSON.stringify(c)) } catch { /* */ }
      usar(c)
    })
    const abrir = () => { setDetalhes(true); setMostrar(true) }
    window.addEventListener('zynio:cookies', abrir)
    return () => { vivo = false; window.removeEventListener('zynio:cookies', abrir) }
  }, [])

  const gravar = useCallback((acao, valores) => {
    if (!cfg) return
    const final = Object.fromEntries(cfg.categorias.map((k) => [k.id, k.obrigatoria ? true : !!valores[k.id]]))
    const registro = { versao: cfg.versao, escolhas: final, acao, quando: Date.now(), expira: Date.now() + cfg.dias_validade * 86400000 }
    try { localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify(registro)) } catch { /* */ }
    // sem consentimento de preferências: apaga o que for dessa categoria
    if (!final.preferencias) { try { localStorage.removeItem('clima-sessao-sistema') } catch { /* */ } }
    fetch(`${SISTEMA_URL}/api/site/cookies/consentimento`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_anonimo: idAnonimo(), versao: cfg.versao, acao, escolhas: final }),
    }).catch(() => {})
    setSalvo(registro); setEscolhas(final); setMostrar(false); setDetalhes(false)
    window.dispatchEvent(new CustomEvent('zynio:cookies-alterado', { detail: final }))
  }, [cfg])

  if (!cfg) return null
  const todos = Object.fromEntries(cfg.categorias.map((k) => [k.id, true]))
  const soEssenciais = Object.fromEntries(cfg.categorias.map((k) => [k.id, !!k.obrigatoria]))

  return (
    <>
      {!mostrar && salvo && (
        <button className="cookie-flutuante" onClick={() => { setDetalhes(true); setMostrar(true) }} aria-label="Preferências de cookies" title="Preferências de cookies">
          <Cookie size={20} strokeWidth={1.6} />
        </button>
      )}
      {mostrar && (
        <div className={`cookie-camada ${detalhes ? 'com-fundo' : ''}`} role="presentation" onClick={(e) => { if (e.target === e.currentTarget && detalhes && salvo) { setMostrar(false); setDetalhes(false) } }}>
          <section className={`cookie-aviso ${detalhes ? 'detalhes' : cfg.posicao}`} role="dialog" aria-modal={detalhes} aria-labelledby="cookie-titulo">
            <div className="cookie-topo">
              <span className="cookie-icone"><Cookie size={22} strokeWidth={1.6} /></span>
              <h2 id="cookie-titulo">{detalhes ? 'Preferências de cookies' : cfg.titulo}</h2>
              {salvo && <button className="cookie-fechar" onClick={() => { setMostrar(false); setDetalhes(false) }} aria-label="Fechar"><X size={18} /></button>}
            </div>
            <p className="cookie-texto">
              {detalhes ? 'Escolha o que o site pode usar. Os essenciais ficam sempre ligados porque o site não funciona sem eles. Você pode mudar quando quiser pelo botão de cookie no canto da tela.' : cfg.texto}{' '}
              <Link href="/privacidade#cookies" onClick={() => setMostrar(false)}>Política de privacidade</Link>
            </p>

            {detalhes && (
              <div className="cookie-categorias">
                {cfg.categorias.map((k) => {
                  const lista = cfg.cookies.filter((c) => c.categoria === k.id)
                  return (
                    <div key={k.id} className="cookie-categoria">
                      <div className="cookie-cat-linha">
                        <button className="cookie-cat-nome" onClick={() => setAberta(aberta === k.id ? null : k.id)} aria-expanded={aberta === k.id}>
                          <ChevronDown size={16} style={{ transform: aberta === k.id ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
                          {k.nome}<span className="cookie-qtd">{lista.length}</span>
                        </button>
                        {k.obrigatoria ? <span className="cookie-sempre"><Lock size={13} /> Sempre ligado</span> : (
                          <button role="switch" aria-checked={!!escolhas[k.id]} aria-label={k.nome} className={`cookie-chave ${escolhas[k.id] ? 'ligada' : ''}`}
                            onClick={() => setEscolhas({ ...escolhas, [k.id]: !escolhas[k.id] })}><span /></button>
                        )}
                      </div>
                      <p className="cookie-cat-desc">{k.descricao}</p>
                      {aberta === k.id && (
                        lista.length ? (
                          <div className="cookie-tabela">
                            <table><thead><tr><th>Nome</th><th>Provedor</th><th>Para quê</th><th>Duração</th></tr></thead>
                              <tbody>{lista.map((c) => <tr key={c.nome}><td>{c.nome}</td><td>{c.provedor}</td><td>{c.finalidade}</td><td>{c.duracao}</td></tr>)}</tbody></table>
                          </div>
                        ) : <p className="cookie-vazio">Nenhum cookie desta categoria em uso.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="cookie-botoes">
              {detalhes
                ? <button className="cookie-btn secundario" onClick={() => gravar('personalizar', escolhas)}>Salvar minhas escolhas</button>
                : <button className="cookie-btn secundario" onClick={() => setDetalhes(true)}>Personalizar</button>}
              <button className="cookie-btn secundario" onClick={() => gravar('rejeitar', soEssenciais)}>Só os essenciais</button>
              <button className="cookie-btn primario" onClick={() => gravar('aceitar_todos', todos)}>Aceitar todos</button>
            </div>
            {salvo && detalhes && <p className="cookie-rodape">Sua escolha atual vale até {new Date(salvo.expira).toLocaleDateString('pt-BR')}.</p>}
          </section>
        </div>
      )}
    </>
  )
}
