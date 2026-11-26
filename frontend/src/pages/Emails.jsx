import { useCallback, useEffect, useState } from 'react'
import { Newspaper, CheckCircle2, Circle, Cloud, ExternalLink, Eye, KeyRound, Mail, MailCheck, RefreshCw, Search, Send, Settings2, ShieldCheck, BarChart3 } from 'lucide-react'
import Entregas from '../components/emails/Entregas'
import { api, haQuanto } from '../api'
import { useProjeto } from '../contexto'
import Newsletter from '../components/emails/Newsletter'
import { Aviso, Botao, Cabecalho, Esqueleto, FaixaMetricas, Interruptor, Modal, Selo, useToast } from '../components/ui'
import { devePuxar } from '../ocioso'

// E-mails: Resend (envio) + Cloudflare (DNS do domínio). Conexões, modelos com prévia e teste, histórico com os
// eventos de entrega (webhook) e quais e-mails o sistema manda sozinho.
const ABAS = [['conexoes', 'Conexões', Cloud], ['entregas', 'Entregas', BarChart3], ['newsletter', 'Newsletter', Newspaper], ['modelos', 'Modelos', Mail], ['historico', 'Histórico', MailCheck], ['automaticos', 'Automáticos', Settings2]]
const COR_ESTADO = { entregue: 'verde', aberto: 'verde', clicado: 'verde', enviado: 'azul', enviando: 'cinza', atrasado: 'ambar', devolvido: 'vermelho', falhou: 'vermelho', 'marcado como spam': 'vermelho' }
const NOMES_AUTO = {
  recuperar_senha: ['Recuperar a senha', 'Link de senha nova quando alguém usa “Esqueci a senha”. Sem o domínio verificado, o Supabase manda o e-mail padrão dele.'],
  boas_vindas: ['Boas-vindas / convite', 'Quando um usuário é criado: link para ele criar a própria senha (a senha temporária nunca vai por e-mail).'],
  senha_alterada: ['Senha alterada', 'Aviso de segurança sempre que a senha da conta muda.'],
  senha_redefinida: ['Senha redefinida pelo admin', 'Aviso para a pessoa quando um administrador muda a senha dela.'],
  acesso_novo: ['Acesso por IP novo', 'Aviso quando a conta entra por um IP que não aparecia há 30 dias.'],
  alerta: ['Alertas críticos e altos', 'Dono e administradores recebem os alertas graves do sistema (no máximo 1 por assunto a cada 6 h).'],
}

function Passo({ ok, titulo, children }) {
  return (
    <li className="flex gap-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{titulo}</p><div className="mt-1 text-sm text-muted-foreground">{children}</div></div>
    </li>
  )
}

function Segredo({ rotulo, salvo, valor, mudar, dica, placeholder }) {
  return (
    <label className="block text-xs text-muted-foreground">{rotulo} {salvo && <span className="text-emerald-600 dark:text-emerald-400">· salvo (cifrado)</span>}
      <input type="password" value={valor} onChange={(e) => mudar(e.target.value)} placeholder={salvo ? 'deixe vazio para manter · “-” para apagar' : placeholder} className="campo mt-1 h-9 font-mono" autoComplete="new-password" data-1p-ignore data-lpignore="true" data-form-type="other" />
      {dica && <span className="mt-1 block text-[11px]">{dica}</span>}
    </label>
  )
}

function Conexoes({ e, recarregar, dono }) {
  const toast = useToast()
  const [k, setK] = useState({ api_key_total: '', cloudflare_token: '', webhook_secret: '', api_key: '' })
  const [ocupado, setOcupado] = useState('')
  const [passos, setPassos] = useState(null)
  const salvar = async () => { setOcupado('salvar'); try { await api.put('/api/email/config', k); setK({ api_key_total: '', cloudflare_token: '', webhook_secret: '', api_key: '' }); toast('Conexões salvas.'); recarregar() } catch (err) { toast(err.message, 'erro') } finally { setOcupado('') } }
  const provisionar = async () => { setOcupado('prov'); try { const r = await api.post('/api/email/dominio/provisionar'); setPassos(r.passos); recarregar() } catch (err) { toast(err.message, 'erro') } finally { setOcupado('') } }
  const verificar = async () => { setOcupado('ver'); try { await api.post('/api/email/dominio/verificar'); recarregar(); toast('Conferido.') } catch (err) { toast(err.message, 'erro') } finally { setOcupado('') } }
  const dnsOk = e.dns.every((r) => r.ok)
  const verif = e.dominio.status === 'verified'
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="cartao p-5">
        <h2 className="titulo-secao">Caminho até e-mails com o seu domínio</h2>
        <ol className="mt-4 space-y-4">
          <Passo ok={e.chave_envio} titulo="1. Chave de envio do Resend">{e.chave_envio ? 'Salva e cifrada. Já dá para mandar testes para o e-mail da sua conta do Resend.' : 'Cole a chave de envio (re_…) ao lado.'}</Passo>
          <Passo ok={e.dominio.status !== 'não cadastrado'} titulo={`2. Domínio ${e.dominio.nome} no Resend`}>
            Precisa de uma chave do Resend com <b>acesso total</b>: em resend.com → API Keys → Create → Permission “Full access”. Com ela, o botão abaixo cadastra o domínio na região São Paulo.
          </Passo>
          <Passo ok={dnsOk} titulo="3. Registros DNS na Cloudflare">
            Com um token da Cloudflare (dash.cloudflare.com → My Profile → API Tokens → Create → modelo “Edit zone DNS”, zona {e.dominio.nome}), o sistema cria os registros sozinho. Sem token, copie da tabela para a Cloudflare (desligue o proxy laranja).
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-xs"><thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2 font-medium">Nome</th><th className="pr-2 font-medium">Tipo</th><th className="pr-2 font-medium">Para quê</th><th className="font-medium">No DNS público</th></tr></thead>
              <tbody>{e.dns.map((r) => <tr key={r.nome + r.tipo} className="border-t border-border"><td className="py-1.5 pr-2 font-mono">{r.nome}</td><td className="pr-2">{r.tipo}</td><td className="pr-2">{r.para}</td><td>{r.ok ? <Selo cor="verde">encontrado</Selo> : <Selo cor="ambar">falta</Selo>}</td></tr>)}</tbody></table></div>
            {e.dominio.registros?.length > 0 && (
              <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-foreground">Valores exatos que o Resend pediu</summary>
                <ul className="mt-1 space-y-1 text-[11px]">{e.dominio.registros.map((r) => <li key={r.record + r.name} className="break-all rounded bg-muted px-2 py-1 font-mono">{r.type} {r.name}{r.priority ? ` (prioridade ${r.priority})` : ''} → {r.value} <span className="text-muted-foreground">· {r.status}</span></li>)}</ul></details>
            )}
          </Passo>
          <Passo ok={verif} titulo="4. Domínio verificado">{verif ? `Verificado. Os e-mails saem de ${e.remetente}.` : `Estado no Resend: ${e.dominio.status}. Depois dos registros, a verificação leva de segundos a alguns minutos.`}</Passo>
          <Passo ok={e.webhook} titulo="5. Eventos de entrega (webhook)">
            No Resend → Webhooks → Add endpoint: URL <code className="break-all rounded bg-muted px-1 text-xs text-foreground">{e.webhook_url}</code>, eventos “email.*”. Copie o “Signing secret” (whsec_…) ao lado: o histórico passa a mostrar entregue, aberto, clicado e devolvido.
          </Passo>
        </ol>
        {dono && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          <Botao icone={Cloud} carregando={ocupado === 'prov'} disabled={!e.chave_total} onClick={provisionar}>Preparar domínio (Resend + Cloudflare)</Botao>
          <Botao variante="secundario" icone={RefreshCw} carregando={ocupado === 'ver'} onClick={verificar}>Conferir agora</Botao>
        </div>}
        {passos && <ul className="mt-3 space-y-1 rounded-lg border border-border p-3 text-xs">{passos.map((p) => <li key={p}>· {p}</li>)}</ul>}
      </section>
      <aside className="space-y-4">
        <div className="cartao space-y-3 p-5">
          <h2 className="titulo-secao flex items-center gap-2"><KeyRound className="h-4 w-4" />Chaves</h2>
          <p className="text-xs text-muted-foreground">Ficam cifradas no banco e nunca voltam para a tela.</p>
          <Segredo rotulo="Resend · chave de envio" salvo={e.chave_envio} valor={k.api_key} mudar={(v) => setK({ ...k, api_key: v })} placeholder="re_…" />
          <Segredo rotulo="Resend · chave com acesso total" salvo={e.chave_total} valor={k.api_key_total} mudar={(v) => setK({ ...k, api_key_total: v })} placeholder="re_…" dica="Só para cadastrar e conferir o domínio." />
          <Segredo rotulo="Cloudflare · token de DNS" salvo={e.cloudflare} valor={k.cloudflare_token} mudar={(v) => setK({ ...k, cloudflare_token: v })} placeholder="token “Edit zone DNS”" dica="Escopo só da zona zynio.com.br." />
          <Segredo rotulo="Resend · segredo do webhook" salvo={e.webhook} valor={k.webhook_secret} mudar={(v) => setK({ ...k, webhook_secret: v })} placeholder="whsec_…" />
          {dono ? <Botao className="w-full" carregando={ocupado === 'salvar'} onClick={salvar}>Salvar chaves</Botao> : <p className="text-xs text-muted-foreground">Só o dono muda as chaves.</p>}
        </div>
        <div className="cartao p-5 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Atalhos</p>
          <a className="flex items-center gap-1 hover:text-foreground" href="https://resend.com/api-keys" target="_blank" rel="noreferrer">Resend · API Keys<ExternalLink className="h-3 w-3" /></a>
          <a className="flex items-center gap-1 hover:text-foreground" href="https://resend.com/webhooks" target="_blank" rel="noreferrer">Resend · Webhooks<ExternalLink className="h-3 w-3" /></a>
          <a className="flex items-center gap-1 hover:text-foreground" href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">Cloudflare · API Tokens<ExternalLink className="h-3 w-3" /></a>
        </div>
      </aside>
    </div>
  )
}

function Modelos({ meuEmail }) {
  const toast = useToast()
  const [lista, setLista] = useState(null), [aberto, setAberto] = useState(null), [html, setHtml] = useState('')
  const [para, setPara] = useState(meuEmail || ''), [enviando, setEnviando] = useState(false)
  useEffect(() => { api.get('/api/email/modelos').then(setLista).catch(() => setLista([])) }, [])
  useEffect(() => {
    if (!aberto) return
    setHtml('')
    // a prévia roda isolada (sem origem): o logo vai embutido; no e-mail real ele vem do endereço público
    Promise.all([api.texto(`/api/email/modelos/${aberto.tipo}/previa`), fetch('/icone-192.png').then((r) => r.blob()).then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b) })).catch(() => null)])
      .then(([h, logo]) => setHtml(logo ? h.replaceAll('https://app.zynio.com.br/icone-192.png', logo) : h)).catch((e) => toast(e.message, 'erro'))
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps
  const testar = async () => { setEnviando(true); try { await api.post('/api/email/teste', { tipo: aberto.tipo, para }); toast(`Enviado para ${para}. Veja a caixa de entrada (e o spam).`) } catch (e) { toast(e.message, 'erro') } finally { setEnviando(false) } }
  if (!lista) return <Esqueleto className="h-64" />
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((m) => (
          <button key={m.tipo} onClick={() => setAberto(m)} className="cartao p-4 text-left transition-colors hover:border-primary/40">
            <div className="flex items-center justify-between gap-2"><p className="font-medium">{m.nome}</p>{m.automatico != null && (m.automatico ? <Selo cor="verde">automático</Selo> : <Selo>desligado</Selo>)}</div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Assunto: {m.assunto}</p>
            <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary"><Eye className="h-3.5 w-3.5" />Ver e testar</p>
          </button>
        ))}
      </div>
      {aberto && (
        <Modal aberto titulo={aberto.nome} onFechar={() => setAberto(null)} largura="max-w-3xl">
          <p className="mb-2 text-xs text-muted-foreground">Prévia com dados de exemplo · assunto: <b className="text-foreground">{aberto.assunto}</b></p>
          {html ? <iframe title="Prévia do e-mail" srcDoc={html} sandbox="" className="h-[60vh] w-full rounded-lg border border-border bg-white" /> : <Esqueleto className="h-[60vh]" />}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex-1 text-xs text-muted-foreground">Mandar um teste para<input value={para} onChange={(e) => setPara(e.target.value)} className="campo mt-1 h-9" placeholder="voce@exemplo.com" /></label>
            <Botao icone={Send} carregando={enviando} onClick={testar}>Enviar teste</Botao>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Sem o domínio verificado, o Resend só entrega para o e-mail dono da conta do Resend.</p>
        </Modal>
      )}
    </>
  )
}

function Historico() {
  const [itens, setItens] = useState(null), [q, setQ] = useState(''), [estado, setEstado] = useState(''), [det, setDet] = useState(null)
  const carregar = useCallback(() => { const p = new URLSearchParams({ limite: 200 }); if (q.trim()) p.set('q', q.trim()); if (estado) p.set('estado', estado); api.get(`/api/email/envios?${p}`).then(setItens).catch(() => setItens([])) }, [q, estado])
  useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t) }, [carregar])
  useEffect(() => { const t = setInterval(() => { if (devePuxar('emails')) carregar() }, 30000); return () => clearInterval(t) }, [carregar])
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-72"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar destino ou assunto" className="campo h-9 pl-8" aria-label="Buscar" /></label>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="campo h-9 w-auto" aria-label="Estado"><option value="">Todos os estados</option>{Object.keys(COR_ESTADO).map((s) => <option key={s}>{s}</option>)}</select>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} onClick={carregar}>Atualizar</Botao>
      </div>
      {!itens ? <Esqueleto className="h-64" /> : !itens.length ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum e-mail enviado ainda.</p> : (
        <div className="cartao overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm"><thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Quando</th><th className="px-4 py-2 font-medium">Para</th><th className="px-4 py-2 font-medium">Assunto</th><th className="px-4 py-2 font-medium">Estado</th></tr></thead>
            <tbody className="divide-y divide-border">{itens.map((x) => (
              <tr key={x.id} onClick={() => setDet(x)} className="cursor-pointer hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">{haQuanto(x.criado_em)}</td>
                <td className="max-w-[12rem] truncate px-4 py-2">{x.para}</td>
                <td className="max-w-[20rem] truncate px-4 py-2">{x.assunto}</td>
                <td className="px-4 py-2"><Selo cor={COR_ESTADO[x.estado] || 'cinza'}>{x.estado}</Selo></td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
      {det && (
        <Modal aberto titulo={det.assunto} onFechar={() => setDet(null)}>
          <dl className="space-y-2 text-sm">
            {[['Para', det.para], ['Tipo', det.tipo], ['Estado', det.estado], ['Enviado', new Date(det.criado_em * 1000).toLocaleString('pt-BR')], ['ID no Resend', det.resend_id || '—'], ['Erro', det.erro]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-all">{v}</dd></div>)}
          </dl>
          {(det.eventos || []).length > 0 && <><p className="mt-4 text-xs font-medium">Eventos</p><ul className="mt-1 space-y-1 text-xs">{det.eventos.map((ev, i) => <li key={i}>{new Date(ev.quando * 1000).toLocaleString('pt-BR')} · {ev.tipo}{ev.motivo ? ` · ${ev.motivo}` : ''}</li>)}</ul></>}
        </Modal>
      )}
    </div>
  )
}

function Automaticos({ e, recarregar, dono }) {
  const toast = useToast()
  const [nome, setNome] = useState(e.remetente_nome), [local, setLocal] = useState(e.remetente_local), [resp, setResp] = useState(e.responder_para)
  const salvar = async (extra) => { try { await api.put('/api/email/config', { remetente_nome: nome, remetente_local: local, responder_para: resp, ...extra }); toast('Salvo.'); recarregar() } catch (err) { toast(err.message, 'erro') } }
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="cartao divide-y divide-border">
        {Object.entries(NOMES_AUTO).map(([k, [n, d]]) => (
          <div key={k} className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{n}</p><p className="text-xs text-muted-foreground">{d}</p></div>
            <Interruptor ligado={!!e.automaticos[k]} disabled={!dono} rotulo={n} onChange={(v) => salvar({ automaticos: { ...e.automaticos, [k]: v } })} />
          </div>
        ))}
      </section>
      <section className="cartao space-y-3 p-5">
        <h2 className="titulo-secao">Remetente</h2>
        <label className="block text-xs text-muted-foreground">Nome que aparece<input value={nome} onChange={(x) => setNome(x.target.value)} disabled={!dono} className="campo mt-1 h-9" /></label>
        <label className="block text-xs text-muted-foreground">Endereço<div className="mt-1 flex items-center gap-1"><input value={local} onChange={(x) => setLocal(x.target.value.toLowerCase())} disabled={!dono} className="campo h-9" /><span className="text-sm">@zynio.com.br</span></div></label>
        <label className="block text-xs text-muted-foreground">Respostas vão para (opcional)<input value={resp} onChange={(x) => setResp(x.target.value)} disabled={!dono} className="campo mt-1 h-9" placeholder="contato@zynio.com.br" /></label>
        <p className="text-xs text-muted-foreground">Agora: <b className="text-foreground">{e.remetente}</b></p>
        {dono && <Botao onClick={() => salvar({})}>Salvar remetente</Botao>}
      </section>
    </div>
  )
}

export default function Emails() {
  const { sessao } = useProjeto()
  const dono = sessao?.papel === 'dono'
  const [aba, setAba] = useState(() => new URLSearchParams(window.location.search).get('aba') || 'conexoes')
  const [e, setE] = useState(null), [erro, setErro] = useState('')
  const carregar = useCallback(() => api.get('/api/email/estado').then(setE).catch((x) => setErro(x.message)), [])
  useEffect(() => { carregar() }, [carregar])
  if (sessao && !['dono', 'admin'].includes(sessao.papel)) return <Aviso>Só o dono e os administradores veem os e-mails.</Aviso>
  if (erro) return <Aviso>{erro}</Aviso>
  if (!e || !sessao) return <div className="grid gap-4"><Esqueleto className="h-24" /><Esqueleto className="h-80" /></div>
  const verif = e.dominio.status === 'verified'
  return (
    <div>
      <Cabecalho titulo="E-mails" descricao="Envio pelo Resend com o domínio zynio.com.br (DNS na Cloudflare): recuperação de senha, boas-vindas, avisos de segurança, alertas e a newsletter (campanhas com modelos e IA), com histórico de entrega." />
      {!verif && <div className="mb-5"><Aviso tipo="alerta">Domínio ainda não verificado: por enquanto o Resend só entrega para o e-mail da sua conta do Resend, e o “Esqueci a senha” usa o e-mail padrão do Supabase. Complete os passos em Conexões.</Aviso></div>}
      <div className="mb-6"><FaixaMetricas itens={[
        { rotulo: 'Domínio', valor: verif ? 'Verificado' : e.dominio.status === 'não cadastrado' ? 'Não cadastrado' : 'Pendente', tom: verif ? 'bom' : 'ruim', dica: e.dominio.nome },
        { rotulo: 'Enviados (30 dias)', valor: e.stats_30d.total || 0 },
        { rotulo: 'Entregues', valor: e.stats_30d.entregues || 0, dica: e.webhook ? `${e.stats_30d.abertos || 0} aberto(s)` : 'ligue o webhook para medir' },
        { rotulo: 'Com problema', valor: e.stats_30d.problemas || 0, tom: e.stats_30d.problemas ? 'ruim' : 'bom', dica: 'devolvidos, falhas e spam' },
      ]} /></div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map(([k, n, I]) => <button key={k} onClick={() => setAba(k)} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${aba === k ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><I className="h-4 w-4" />{n}</button>)}
      </div>
      {aba === 'conexoes' && <Conexoes e={e} recarregar={carregar} dono={dono} />}
      {aba === 'entregas' && <Entregas />}
      {aba === 'newsletter' && <Newsletter meuEmail={sessao?.email} />}
      {aba === 'modelos' && <Modelos meuEmail={sessao?.email} />}
      {aba === 'historico' && <Historico />}
      {aba === 'automaticos' && <Automaticos e={e} recarregar={carregar} dono={dono} />}
      <p className="mt-8 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Os registros SPF e DMARC da raiz do domínio continuam bloqueando e-mail falso no nome de zynio.com.br; o Resend passa no DMARC pela assinatura DKIM.</p>
    </div>
  )
}
