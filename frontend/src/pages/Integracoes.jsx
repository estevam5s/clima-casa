import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeftRight, CheckCircle2, ExternalLink, Link2, Plus, QrCode, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { api, haQuanto } from '../api'
import IntegracaoGoogle from '../components/IntegracaoGoogle'
import { Aviso, Botao, Cabecalho, Carregando, Interruptor, Modal, Ponto, Selo, useDados, useToast } from '../components/ui'

const PASSOS_ALEXA = [
  ['Escaneie o QR Code com o celular', 'O celular com o app Alexa da outra conta. Ele abre direto a skill "Sinric Pro".'],
  ['Toque em "Ativar para uso"', 'Entre com a conta do Sinric Pro (a mesma do portal). Várias Alexas podem usar a mesma conta.'],
  ['Pronto', 'Os aparelhos aparecem sozinhos. Se não aparecerem em 1 minuto, diga "Alexa, descobrir dispositivos".'],
]
// O que acontece em cada situação de troca (comportamento do Sinric Pro e da Alexa)
const CENARIOS = [
  ['Adicionar outra conta Alexa (as duas usam)', [
    'Na conta nova: app Alexa → Skills → "Sinric Pro" → Ativar → entrar com a MESMA conta do Sinric (QR Code ao lado).',
    'A conta antiga continua funcionando: as duas mandam comandos para o mesmo ar, e o estado aparece igual nas duas.',
    'Rotinas, grupos e cômodos são de cada conta Alexa: recrie na conta nova o que quiser usar lá.',
  ]],
  ['Trocar de conta (parar de usar a antiga)', [
    'Ative a skill Sinric Pro na conta nova e confira o diagnóstico abaixo.',
    'Na conta antiga: app Alexa → Mais → Skills → Sinric Pro → Desativar. Os aparelhos somem só dela.',
    'Nada muda aqui no sistema: os aparelhos, os botões gravados e o Sinric continuam iguais.',
  ]],
  ['Trocar ou adicionar um Echo na mesma conta', [
    'Não precisa fazer nada: todo Echo da mesma conta Amazon já enxerga os aparelhos.',
    'Para o "Alexa, ligar o ar" sem dizer o nome, coloque o Echo e o ar no mesmo grupo (cômodo) no app Alexa.',
  ]],
  ['Usar a skill própria em vez do Sinric', [
    'Cada conta Amazon que vincular a skill própria recebe um token separado; revogue os antigos em "Skill própria".',
    'Não use as duas integrações para o mesmo ar na mesma conta: a Alexa mostra o aparelho duplicado.',
  ]],
]
const COMANDOS = ['Alexa, ligar o ar da recepção', 'Alexa, colocar o ar da recepção em 23 graus', 'Alexa, ar da recepção no modo frio', 'Alexa, desligar o ar da recepção']

export default function Integracoes() {
  const { dados, erro, recarregar } = useDados(() => Promise.all([api.get('/api/sinric'), api.get('/api/aparelhos')]))
  const [disp, setDisp] = useState(null)
  const [carregandoDisp, setCarregandoDisp] = useState(false)
  const [form, setForm] = useState(null)
  const [conexao, setConexao] = useState(null)
  const [criando, setCriando] = useState(null)
  const toast = useToast()
  useEffect(() => { api.get('/api/sinric/conectar-alexa').then(setConexao).catch(() => {}) }, [])
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [cfg, aparelhos] = dados
  const ag = cfg.agente || {}
  const f = form || { api_key: cfg.api_key, app_key: cfg.app_key, app_secret: '' }

  const buscar = async () => {
    setCarregandoDisp(true)
    try { setDisp(await api.get('/api/sinric/dispositivos')) } catch (e) { toast(e.message, 'erro') } finally { setCarregandoDisp(false) }
  }
  const salvar = async (mudanca) => {
    try { await api.put('/api/sinric', { ativo: cfg.ativo, automatico: cfg.automatico, ...f, ...mudanca }); setForm(null); toast('Sinric Pro atualizado. O agente reconecta em até 30 s.'); recarregar() }
    catch (e) { toast(e.message, 'erro') }
  }
  const criar = async (a) => {
    setCriando(a.id)
    try { await api.post(`/api/aparelhos/${a.id}/sinric/criar`); toast(`${a.nome} criado no Sinric Pro. Aparece na Alexa em instantes.`); recarregar(); if (disp) buscar() }
    catch (e) { toast(e.message, 'erro') } finally { setCriando(null) }
  }
  const semSinric = aparelhos.filter((a) => !a.sinric_device_id)
  const vincular = async (aparelhoId, devId) => {
    await api.put(`/api/aparelhos/${aparelhoId}/sinric`, { sinric_device_id: devId || null })
    toast(devId ? 'Vinculado. O agente conecta em até 30 s.' : 'Vínculo removido.')
    recarregar(); buscar()
  }

  return (
    <>
      <Cabecalho titulo="Alexa e Google Home" descricao="Alexa e Google Home (Google Assistente, Nest, Android) pelo Sinric Pro: qualquer conta, sem criar skill própria." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cartao p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="titulo-secao">Sinric Pro</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Ponto ativo={ag.conectado} />
                  {ag.conectado ? `Conectado ${haQuanto(ag.desde)} · ${ag.dispositivos?.length || 0} aparelho(s)` : ag.erro ? `Erro: ${ag.erro}` : 'Desconectado (precisa do agente do Mac e de um aparelho vinculado)'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-sm">
                <span className="flex items-center gap-2">Ativo <Interruptor ligado={cfg.ativo} onChange={(v) => salvar({ ativo: v })} rotulo="Ativar Sinric Pro" /></span>
                <span className="flex items-center gap-2 text-muted-foreground" title="Cria no Sinric Pro todo aparelho novo marcado como disponível na Alexa e apaga quando o aparelho é removido">
                  Criar automaticamente <Interruptor ligado={cfg.automatico} onChange={(v) => salvar({ automatico: v })} rotulo="Criar no Sinric automaticamente" /></span>
              </div>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); salvar({}) }} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="rotulo" htmlFor="sk">Chave de API</label>
                <input id="sk" className="campo font-mono" value={f.api_key} onChange={(e) => setForm({ ...f, api_key: e.target.value })} />
                <p className="ajuda">Usada para listar os dispositivos (Credenciais → Suas chaves API).</p>
              </div>
              <div>
                <label className="rotulo" htmlFor="ak">Chave do App (App Key)</label>
                <input id="ak" className="campo font-mono" value={f.app_key} onChange={(e) => setForm({ ...f, app_key: e.target.value })} />
              </div>
              <div>
                <label className="rotulo" htmlFor="as">Senha do App (App Secret)</label>
                <input id="as" type="password" autoComplete="new-password" data-1p-ignore data-lpignore="true" className="campo font-mono" value={f.app_secret} placeholder={cfg.tem_secret ? 'Guardada. Preencha só para trocar.' : ''}
                  onChange={(e) => setForm({ ...f, app_secret: e.target.value })} />
              </div>
              <p className="ajuda sm:col-span-2">A App Key precisa ser a mesma escolhida no dispositivo do Sinric. Se a Alexa disser que o aparelho não responde e o portal mostrar "signature mismatched", a credencial do dispositivo é outra.</p>
              <div className="flex justify-end sm:col-span-2"><Botao type="submit" disabled={!form}>Salvar credenciais</Botao></div>
            </form>
          </motion.div>

          <IntegracaoGoogle cfg={cfg} aparelhos={aparelhos} />

          {semSinric.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }} className="cartao">
              <div className="p-5 pb-3">
                <h2 className="titulo-secao">Aparelhos ainda fora da Alexa</h2>
                <p className="text-xs text-muted-foreground">Um clique cria o dispositivo no Sinric Pro e vincula. Todas as Alexas conectadas passam a ver.</p>
              </div>
              <div className="divide-y divide-border border-t border-border">
                {semSinric.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0"><p className="truncate text-sm font-medium">{a.nome}</p><p className="truncate text-xs text-muted-foreground">{[a.projeto_nome, a.comodo].filter(Boolean).join(' · ')}</p></div>
                    {a.total_codigos > 0
                      ? <Botao tamanho="sm" icone={Plus} carregando={criando === a.id} onClick={() => criar(a)}>Criar no Sinric</Botao>
                      : <Link to={`/aparelhos/${a.id}`} className="shrink-0 text-xs text-muted-foreground underline">Grave os botões antes</Link>}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="cartao">
            <div className="flex items-center justify-between p-5 pb-3">
              <div>
                <h2 className="titulo-secao">Dispositivos no Sinric Pro</h2>
                <p className="text-xs text-muted-foreground">Vincule cada dispositivo de ar-condicionado a um aparelho do Clima Escritório</p>
              </div>
              <Botao variante="secundario" tamanho="sm" icone={RefreshCw} carregando={carregandoDisp} onClick={buscar}>{disp ? 'Atualizar' : 'Carregar'}</Botao>
            </div>
            {!disp ? <p className="px-5 pb-5 text-sm text-muted-foreground">Clique em Carregar para buscar na sua conta do Sinric Pro.</p> : (
              <div className="divide-y divide-border border-t border-border">
                {disp.length === 0 && <p className="p-5 text-sm text-muted-foreground">Nenhum dispositivo na conta.</p>}
                {disp.map((d) => (
                  <div key={d.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium"><Ponto ativo={d.online} /> {d.nome} <Selo>{d.tipo}</Selo></p>
                      <p className="truncate text-xs text-muted-foreground">{d.sala} · {d.id}</p>
                    </div>
                    {d.ar_condicionado ? (
                      <select className="campo sm:w-56" value={d.vinculado_a?.id || ''} aria-label={`Vincular ${d.nome}`}
                        onChange={(e) => (e.target.value ? vincular(+e.target.value, d.id) : d.vinculado_a && vincular(d.vinculado_a.id, null))}>
                        <option value="">Não vinculado</option>
                        {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.projeto_nome ? ` · ${a.projeto_nome}` : ''}</option>)}
                      </select>
                    ) : <span className="text-xs text-muted-foreground">Tipo não suportado</span>}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-border p-5 text-sm text-muted-foreground">
              Precisa de outro ar-condicionado? Crie em <a href="https://portal.sinric.pro/device/add" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-foreground underline">portal.sinric.pro <ExternalLink className="h-3 w-3" /></a> com o tipo "Window AC Unit" e a mesma App Key, depois clique em Atualizar. Sua conta do Sinric comporta {cfg?.limite_aparelhos ?? 3} dispositivo(s).
            </div>
          </motion.div>
        </div>

        <div className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pr-1 rolagem-fina">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="cartao p-5">
            <h2 className="flex items-center gap-2 titulo-secao"><Link2 className="h-4 w-4" /> Conectar outra Alexa</h2>
            {conexao && (
              <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-border bg-white p-4">
                <img src={conexao.qr} alt="QR Code da skill Sinric Pro" className="h-40 w-40" />
                <a href={conexao.skill_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800">
                  <QrCode className="h-3.5 w-3.5" /> Abrir a skill na Amazon
                </a>
              </div>
            )}
            <ol className="mt-4 space-y-4">
              {PASSOS_ALEXA.map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <div><p className="text-sm font-medium">{t}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{d}</p></div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-lg bg-muted p-3 text-xs">
              <p className="mb-1.5 font-medium">Comandos</p>
              <ul className="space-y-1 text-muted-foreground">{COMANDOS.map((c) => <li key={c}>"{c}"</li>)}</ul>
            </div>
          </motion.div>
          <TrocarContaAlexa conexao={conexao} aparelhos={aparelhos} />
          <ZonasAlexa />
          <DiagnosticoAlexa />
        </div>
      </div>
    </>
  )
}

// Diagnóstico ao vivo + o que acontece ao trocar de Alexa. Verifica as condições reais (agente, Sinric, vínculos,
// botões IR, último comando de voz) e acompanha o teste: fale um comando na Alexa nova e veja chegar aqui.
const ICONE_ESTADO = { ok: [CheckCircle2, 'text-emerald-600'], aviso: [AlertTriangle, 'text-amber-600'], erro: [XCircle, 'text-red-600'] }
const VEREDITO = {
  funciona: ['Vai funcionar na outra Alexa', 'Tudo pronto: conecte a conta nova e fale um comando de teste.', 'border-emerald-500/40 bg-emerald-500/5'],
  parcial: ['Conecta, mas com ressalvas', 'A Alexa vai achar os aparelhos; corrija os avisos para os comandos acionarem o ar.', 'border-amber-500/40 bg-amber-500/5'],
  nao_funciona: ['Ainda não vai funcionar', 'Resolva os itens em vermelho antes de conectar outra Alexa.', 'border-red-500/40 bg-red-500/5'],
}
function DiagnosticoAlexa() {
  const [d, setD] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [testando, setTestando] = useState(false)
  const [aberto, setAberto] = useState(0)
  const toast = useToast()
  const verificar = async () => {
    setCarregando(true)
    try { setD(await api.get('/api/sinric/diagnostico')) } catch (e) { toast(e.message, 'erro') } finally { setCarregando(false) }
  }
  useEffect(() => { verificar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // modo teste: confere a cada 5 s se chegou um comando de voz novo
  useEffect(() => {
    if (!testando) return undefined
    const antes = d?.itens.find((i) => i.chave === 'ultimo')?.detalhe
    const t = setInterval(async () => {
      try {
        const n = await api.get('/api/sinric/diagnostico')
        setD(n)
        const agora = n.itens.find((i) => i.chave === 'ultimo')?.detalhe
        if (agora && agora !== antes) { setTestando(false); toast('Comando de voz recebido: a nova Alexa está funcionando.') }
      } catch { /* tenta de novo */ }
    }, 5000)
    const fim = setTimeout(() => setTestando(false), 120000)
    return () => { clearInterval(t); clearTimeout(fim) }
  }, [testando]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = d ? VEREDITO[d.veredito] : null
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="cartao p-5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 titulo-secao"><ArrowLeftRight className="h-4 w-4" /> Trocar ou adicionar Alexa</h2>
        <Botao tamanho="sm" variante="secundario" icone={RefreshCw} carregando={carregando} onClick={verificar}>Verificar</Botao>
      </div>
      {v && (
        <div className={`mt-4 rounded-lg border p-3 ${v[2]}`}>
          <p className="text-sm font-semibold">{v[0]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{v[1]}</p>
        </div>
      )}
      {d && (
        <ul className="mt-3 space-y-2">
          {d.itens.map((i) => {
            const [I, cor] = ICONE_ESTADO[i.estado] || ICONE_ESTADO.aviso
            return (
              <li key={i.chave} className="flex gap-2 text-xs">
                <I className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cor}`} />
                <div><p className="font-medium">{i.titulo}</p><p className="text-muted-foreground">{i.detalhe}</p></div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-4 rounded-lg bg-muted p-3 text-xs">
        <p className="font-medium">Teste na Alexa nova</p>
        <p className="mt-0.5 text-muted-foreground">Clique em começar e diga, no Echo da conta nova, "Alexa, ligar o ar do escritório". Quando o comando chegar, avisamos aqui (espera até 2 min).</p>
        <Botao className="mt-2" tamanho="sm" variante={testando ? 'secundario' : 'primario'} onClick={() => setTestando((x) => !x)}>{testando ? 'Aguardando o comando… (parar)' : 'Começar teste'}</Botao>
      </div>
      <div className="mt-4 divide-y divide-border rounded-lg border border-border">
        {CENARIOS.map(([titulo, passos], k) => (
          <div key={titulo}>
            <button onClick={() => setAberto(aberto === k ? -1 : k)} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium hover:bg-muted" aria-expanded={aberto === k}>{titulo}<span className="text-muted-foreground">{aberto === k ? '−' : '+'}</span></button>
            {aberto === k && <ol className="list-decimal space-y-1 px-3 pb-3 pl-7 text-xs text-muted-foreground">{passos.map((p) => <li key={p}>{p}</li>)}</ol>}
          </div>
        ))}
      </div>
    </motion.div>
  )
}


// Zonas na Alexa: ares iguais no mesmo transmissor mudam juntos, então cada zona vira UM aparelho na Alexa
// (backend: sinric.organizar_zona). Primeiro a prévia do que muda no Sinric; só executa depois de confirmar.
function ZonasAlexa() {
  const { dados: zonas, recarregar } = useDados(() => api.get('/api/zonas'))
  const [alvo, setAlvo] = useState(null)   // { zona, nome, previa }
  const [ocupado, setOcupado] = useState(false)
  const toast = useToast()
  if (!zonas) return null
  const previa = async (z) => {
    const nome = z.nome.replace(/^Zona\s+(Smart IR\s*·\s*)?/i, 'Ar do ').trim()
    setOcupado(true)
    try { setAlvo({ zona: z, nome, previa: await api.post(`/api/sinric/zona/${z.id}`, { nome, executar: false }) }) }
    catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const atualizarPrevia = (nome) => setAlvo((a) => ({ ...a, nome }))
  const recalcular = async () => {   // ao sair do campo: a prévia passa a citar o nome novo
    if (!alvo || alvo.nome.trim().length < 3) return
    try { const previa = await api.post(`/api/sinric/zona/${alvo.zona.id}`, { nome: alvo.nome, executar: false }); setAlvo((a) => ({ ...a, previa })) } catch { /* mantém a prévia anterior */ }
  }
  const executar = async () => {
    setOcupado(true)
    try {
      await api.post(`/api/sinric/zona/${alvo.zona.id}`, { nome: alvo.nome, executar: true })
      toast(`Feito. Diga "Alexa, descobrir dispositivos" e depois "Alexa, ligue o ${alvo.nome.toLowerCase()}".`)
      setAlvo(null); recarregar()
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  return (
    <div className="cartao p-5">
      <h2 className="titulo-secao">Zonas na Alexa</h2>
      <p className="mt-2 text-sm text-muted-foreground">Ares do mesmo modelo no mesmo transmissor obedecem juntos. Na Alexa, cada zona deve ser <b>um</b> aparelho com um nome só (ex.: "Ar do salão"): assim a fala corresponde ao que acontece e gasta só um dispositivo do Sinric por zona.</p>
      {zonas.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhuma zona ainda. Elas aparecem quando dois ou mais ares iguais estão no mesmo transmissor (ou depois do teste de interferência em Transmissores).</p> : (
        <ul className="mt-3 divide-y divide-border">
          {zonas.map((z) => {
            const naAlexa = z.ares.filter((a) => a.sinric_device_id)
            return (
              <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="min-w-0"><b>{z.nome}</b> · {z.ares.length} ares<span className="block text-xs text-muted-foreground">{naAlexa.length === 1 ? `Na Alexa como 1 aparelho (${naAlexa[0].nome})` : naAlexa.length ? `${naAlexa.length} ares desta zona na Alexa, um por sala: falar com qualquer um muda os ${z.ares.length}` : 'Ainda fora da Alexa'}</span></span>
                <Botao tamanho="sm" variante="secundario" carregando={ocupado && !alvo} onClick={() => previa(z)}>Organizar na Alexa</Botao>
              </li>
            )
          })}
        </ul>
      )}
      <Modal aberto={!!alvo} titulo={`Organizar ${alvo?.zona?.nome || ''} na Alexa`} onFechar={() => setAlvo(null)}>
        {alvo && (
          <div className="space-y-3 text-sm">
            <label className="rotulo block">Nome que você vai falar para a Alexa
              <input className="campo mt-1" value={alvo.nome} maxLength={60} onChange={(e) => atualizarPrevia(e.target.value)} onBlur={recalcular} />
            </label>
            <p className="font-medium">O que vai mudar no Sinric:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">{alvo.previa.passos.map((p, i) => <li key={i}>{p.texto}</li>)}</ul>
            <Aviso tipo="alerta">Isto muda o que a Alexa conhece: frases e rotinas antigas com o nome anterior param de funcionar até você dizer "Alexa, descobrir dispositivos" e ajustar as rotinas.</Aviso>
            <div className="flex justify-end gap-2"><Botao variante="secundario" onClick={() => setAlvo(null)}>Cancelar</Botao><Botao carregando={ocupado} disabled={alvo.nome.trim().length < 3} onClick={executar}>Confirmar e aplicar</Botao></div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// Alexa nova com a MESMA conta do Sinric Pro: nada muda no sistema; é só ativar a skill nela e descobrir os aparelhos.
// Trocar (ou adicionar) a conta Amazon da Alexa: o sistema não troca a conta do Echo (só a Amazon faz isso), então o
// assistente leva a cada lugar certo, guarda o progresso neste navegador e confirma no fim, ao vivo, que o comando de voz
// da conta nova chegou (rota /api/sinric/ultimo-comando).
const AMAZON_DISPOSITIVOS = 'https://www.amazon.com.br/hz/mycd/digital-console/alldevices'
const APP_ALEXA = { ios: 'https://apps.apple.com/br/app/amazon-alexa/id944011620', android: 'https://play.google.com/store/apps/details?id=com.amazon.dee.app' }
function TrocarContaAlexa({ conexao, aparelhos }) {
  const CHAVE = 'clima-troca-alexa'
  const [feito, setFeito] = useState(() => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}') } catch { return {} } })
  const [espera, setEspera] = useState(null)   // { desde, achou, fim }
  const marcar = (k) => setFeito((f) => { const n = { ...f, [k]: !f[k] }; try { localStorage.setItem(CHAVE, JSON.stringify(n)) } catch { /* navegador sem armazenamento */ } return n })
  const naAlexa = (aparelhos || []).filter((a) => a.sinric_device_id).map((a) => a.nome)
  useEffect(() => {
    if (!espera || espera.achou || Date.now() > espera.fim) return undefined
    const t = setInterval(async () => {
      try {
        const r = await api.get('/api/sinric/ultimo-comando')
        if (r.comando && r.comando.quando >= espera.desde) setEspera((e) => ({ ...e, achou: r.comando }))
        else if (Date.now() > espera.fim) setEspera((e) => ({ ...e }))
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 3000)
    return () => clearInterval(t)
  }, [espera])
  const link = (href, rot) => <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">{rot}<ExternalLink className="h-3 w-3" /></a>
  const passos = [
    ['tirar', 'Tirar o Echo da conta antiga', <>Entre com a conta <b>antiga</b> na Amazon, abra o Echo e toque em <b>Cancelar registro</b>. {link(AMAZON_DISPOSITIVOS, 'Abrir meus dispositivos na Amazon')} <span className="block text-xs">Sem a opção? Redefina o Echo: segure o botão de Ação (o do ponto) uns 25 s, até a luz ficar laranja.</span></>],
    ['entrar', 'Configurar o Echo na conta nova', <>No app Alexa: Mais → Configurações → <b>Sair</b>, entre com a conta <b>nova</b> e em Dispositivos → + → Adicionar dispositivo → Amazon Echo. O Echo só precisa de internet (não precisa ser o Wi-Fi dos transmissores). App: {link(APP_ALEXA.ios, 'iPhone')} · {link(APP_ALEXA.android, 'Android')}</>],
    ['skill', 'Ativar a skill Sinric Pro', <>Na conta nova, ative a skill e entre com a <b>mesma conta do Sinric Pro</b> (a dos aparelhos). Pelo celular, o QR Code ao lado abre direto. {conexao?.skill_url ? link(conexao.skill_url, 'Abrir a skill na Amazon') : null}</>],
    ['descobrir', 'Descobrir os aparelhos', <>Diga <b>“Alexa, descobrir dispositivos”</b>. Devem aparecer {naAlexa.length ? <b>{naAlexa.join(', ')}</b> : 'os aparelhos que estão no Sinric'}.</>],
    ['antiga', 'Conta antiga (opcional)', <>Para a conta antiga não controlar mais os ares, desative nela a skill Sinric Pro (Mais → Skills e jogos → Suas skills). Rotinas e grupos não passam de uma conta para a outra.</>],
  ]
  const feitos = passos.filter(([k]) => feito[k]).length
  const ouvir = () => setEspera({ desde: Math.floor(Date.now() / 1000) - 5, achou: null, fim: Date.now() + 90000 })
  const exemplo = naAlexa[0] ? `Alexa, ligar o ${naAlexa.find((n) => /diretor/i.test(n)) || naAlexa[0]}` : 'Alexa, ligar o ar'
  return (
    <div className="cartao p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="titulo-secao">Passo a passo: trocar a conta da Alexa</h2>
        <span className="text-xs tabular text-muted-foreground">{feitos} de {passos.length} feitos</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">A troca da conta do Echo é feita no app e no site da Amazon: aqui estão os atalhos na ordem certa. A mesma conta do Sinric pode estar em várias Alexas.</p>
      <ol className="mt-3 space-y-2.5 text-sm">
        {passos.map(([k, t, d], i) => (
          <li key={k} className="flex gap-3">
            <button onClick={() => marcar(k)} aria-pressed={!!feito[k]} aria-label={`${t}: ${feito[k] ? 'feito' : 'marcar como feito'}`}
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular ${feito[k] ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-border bg-muted'}`}>
              {feito[k] ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span className={feito[k] ? 'text-muted-foreground' : ''}><b className={feito[k] ? 'line-through decoration-1' : ''}>{t}.</b> <span className="text-muted-foreground">{d}</span></span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Teste ao vivo</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Toque em “Esperar o comando” e diga <b>“{exemplo}”</b> no Echo da conta nova. Quando o comando chegar ao sistema, aparece aqui.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Botao tamanho="sm" variante="secundario" onClick={ouvir} disabled={!!espera && !espera.achou && Date.now() < espera.fim}>{espera && !espera.achou && Date.now() < espera.fim ? 'Esperando o comando…' : 'Esperar o comando'}</Botao>
          {espera?.achou && <span className={`text-sm ${espera.achou.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>{espera.achou.ok ? 'Chegou' : 'Chegou, mas falhou'}: {espera.achou.acao}{espera.achou.aparelho ? ` · ${espera.achou.aparelho}` : ''}{!espera.achou.ok && espera.achou.detalhe ? ` (${espera.achou.detalhe})` : ''}</span>}
          {espera && !espera.achou && Date.now() > espera.fim && <span className="text-sm text-muted-foreground">Nada chegou em 90 s. Confira se a skill foi ativada com a conta certa do Sinric e o diagnóstico abaixo.</span>}
        </div>
      </div>
    </div>
  )
}
