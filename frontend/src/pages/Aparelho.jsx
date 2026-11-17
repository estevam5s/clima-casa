import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CircleDot, Minus, Plus, Power, Radio, Trash2 } from 'lucide-react'
import { MODOS, VENTILACAO, api, haQuanto, rotuloOrigem } from '../api'
import FormAparelho from '../components/FormAparelho'
import { Aviso, Botao, Carregando, Dial, FaixaMetricas, Modal, Ponto, Selo, useDados, useToast } from '../components/ui'

const ABAS = [['controle', 'Controle'], ['botoes', 'Botões gravados'], ['ajustes', 'Ajustes']]

function Segmentos({ opcoes, valor, onChange, disabled }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(([k, r]) => (
        <button key={k} disabled={disabled} onClick={() => onChange(k)}
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${valor === k ? 'border-marca-600 bg-marca-600 text-white' : 'border-border hover:bg-muted'}`}>
          {r}
        </button>
      ))}
    </div>
  )
}

// ---------- gravação de botão ----------
function Gravar({ ar, preset, onFechar, aoGravar }) {
  const modos = ar.modos.split(',')
  const [tipo, setTipo] = useState(preset?.tipo || 'estado')
  const [modo, setModo] = useState(preset?.modo || ar.modo)
  const [temp, setTemp] = useState(preset?.temp || ar.temperatura)
  const [vent, setVent] = useState(preset?.vent || 'auto')
  const [extra, setExtra] = useState('')
  const [job, setJob] = useState(null)
  const [erro, setErro] = useState('')
  const timer = useRef(null)
  const toast = useToast()

  useEffect(() => () => clearInterval(timer.current), [])

  const chave = tipo === 'desligar' ? 'desligar'
    : tipo === 'extra' ? `extra_${extra.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
    : `${modo}_${temp}_${vent}`

  const iniciar = async () => {
    setErro('')
    try {
      const { job: id } = await api.post(`/api/aparelhos/${ar.id}/aprender`, { chave, rotulo: tipo === 'extra' ? extra.trim() : '' })
      setJob({ estado: 'iniciando', restante: 30 })
      timer.current = setInterval(async () => {
        try {
          const j = await api.get(`/api/gravacoes/${id}`)
          setJob(j)
          if (j.estado === 'ok') {
            clearInterval(timer.current)
            toast('Botão gravado.')
            aoGravar()
            onFechar()
          } else if (j.estado === 'erro') {
            clearInterval(timer.current)
            setErro(j.erro)
            setJob(null)
          }
        } catch (e) {
          clearInterval(timer.current)
          setErro(e.message)
          setJob(null)
        }
      }, 1000)
    } catch (e) {
      setErro(e.message)
    }
  }

  if (job) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-marca-50 dark:bg-marca-700/20">
          <Radio className="h-7 w-7 animate-pulse text-marca-600" />
        </div>
        <p className="font-medium">Aguardando o sinal do controle original</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
          {tipo === 'estado'
            ? <>Ajuste o controle em <b>{MODOS[modo]} {temp}°C, ventilação {VENTILACAO[vent].toLowerCase()}</b>, aponte para o transmissor a 10–20 cm e aperte um botão.</>
            : 'Aponte o controle para o transmissor a 10–20 cm e aperte o botão.'}
        </p>
        <p className="mt-4 text-2xl font-semibold tabular-nums">{job.restante}s</p>
        {job.tipo && !ar.hub?.control_type && <p className="mt-1 text-xs text-muted-foreground">Testando formato {job.tipo} de 2</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="rotulo">O que você vai gravar</span>
        <Segmentos opcoes={[['estado', 'Ligar em um ajuste'], ['desligar', 'Desligar'], ['extra', 'Outro botão']]} valor={tipo} onChange={setTipo} />
      </div>
      {tipo === 'estado' && (
        <>
          <div>
            <span className="rotulo">Modo</span>
            <Segmentos opcoes={modos.map((m) => [m, MODOS[m]])} valor={modo} onChange={setModo} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="rotulo" htmlFor="gt">Temperatura</label>
              <select id="gt" className="campo" value={temp} onChange={(e) => setTemp(+e.target.value)}>
                {Array.from({ length: ar.temp_max - ar.temp_min + 1 }, (_, i) => ar.temp_min + i).map((t) => <option key={t} value={t}>{t}°C</option>)}
              </select>
            </div>
            <div>
              <label className="rotulo" htmlFor="gv">Ventilação</label>
              <select id="gv" className="campo" value={vent} onChange={(e) => setVent(e.target.value)}>
                {Object.entries(VENTILACAO).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
              </select>
            </div>
          </div>
          <p className="ajuda">O controle do ar manda tudo junto (ligado, modo, temperatura e ventilação). Deixe o controle exatamente nesse ajuste antes de apertar.</p>
        </>
      )}
      {tipo === 'desligar' && <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">Com o ar ligado, aperte o botão de desligar do controle original.</p>}
      {tipo === 'extra' && (
        <div>
          <label className="rotulo" htmlFor="ge">Nome do botão</label>
          <input id="ge" className="campo" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Swing, Turbo, Luz do painel…" maxLength={30} />
        </div>
      )}
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao onClick={iniciar} icone={CircleDot} disabled={tipo === 'extra' && chave.length <= 6}>Começar a gravar</Botao>
      </div>
    </div>
  )
}

// ---------- temporizador ----------
// Atalhos para não gravar 300 botões à mão:
// - copiar de outro ar do mesmo modelo (mesmo controle remoto = mesmos sinais);
// - controle Gree: com o Desligar gravado, o sistema monta todos os outros (rota /gree; protocolo em backend/app/gree.py).
function AtalhosBotoes({ ar, aoMudar }) {
  const toast = useToast()
  const { dados: lista } = useDados(() => api.get('/api/aparelhos'))
  const [de, setDe] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [gree, setGree] = useState(null)       // resultado do "conferir"
  const [passo, setPasso] = useState(null)     // 'conferir' | 'testar' | 'gerar' em andamento
  const [testado, setTestado] = useState(false)
  const outros = (lista || []).filter((a) => a.id !== ar.id && a.total_codigos > 0)
  const temDesligar = ar.codigos.some((c) => c.chave === 'desligar')

  const copiar = async () => {
    setCopiando(true)
    try { const r = await api.post(`/api/aparelhos/${ar.id}/copiar-botoes`, { de: +de }); toast(`${r.copiados} botões copiados.`); aoMudar() }
    catch (e) { toast(e.message, 'erro') } finally { setCopiando(false) }
  }
  const greeAcao = async (acao) => {
    setPasso(acao)
    try {
      const r = await api.post(`/api/aparelhos/${ar.id}/gree`, { acao, modo: 'frio', temperatura: 24, ventilador: 'auto' })
      if (acao === 'conferir') setGree(r)
      if (acao === 'testar') { setTestado(true); toast('Enviado: Frio 24°. O ar apitou e mudou para 24°?') }
      if (acao === 'gerar') { toast(`${r.gerados} botões gerados.`); aoMudar() }
    } catch (e) { toast(e.message, 'erro'); if (acao === 'conferir') setGree({ erro: e.message }) } finally { setPasso(null) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold">Copiar de outro ar</h2>
        <p className="ajuda mt-1">Mesmo modelo de ar (o mesmo controle remoto)? Use os botões já gravados nele. Botões com o mesmo nome são substituídos.</p>
        {outros.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nenhum outro ar com botões ainda.</p> : (
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="campo min-w-0 flex-1" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Copiar botões de">
              <option value="">Escolha o ar…</option>
              {outros.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.total_codigos} botões</option>)}
            </select>
            <Botao variante="secundario" disabled={!de} carregando={copiando} onClick={copiar}>Copiar botões</Botao>
          </div>
        )}
      </div>
      <div className="cartao p-4">
        <h2 className="text-sm font-semibold">Controle Gree: gerar todos os botões</h2>
        <p className="ajuda mt-1">Com só o <b>Desligar</b> gravado, o sistema monta os 300 ajustes (5 modos, 16 a 30°, 4 ventilações).</p>
        {!temDesligar ? <p className="mt-3 text-sm text-muted-foreground">Grave primeiro o Desligar (abaixo).</p> : (
          <>
            <ol className="mt-3 space-y-2 text-sm">
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span>1. Conferir se o sinal é Gree</span>
                {gree && !gree.erro ? <Selo cor="verde">Gree · {gree.pulsos} pulsos</Selo> : <Botao tamanho="sm" variante="secundario" carregando={passo === 'conferir'} onClick={() => greeAcao('conferir')}>Conferir</Botao>}
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className={gree && !gree.erro ? '' : 'text-muted-foreground'}>2. Testar: mandar Frio 24°</span>
                <Botao tamanho="sm" variante="secundario" disabled={!gree || gree.erro || !ar.hub_id} carregando={passo === 'testar'} onClick={() => greeAcao('testar')}>{testado ? 'Testar de novo' : 'Testar'}</Botao>
              </li>
              <li className="flex flex-wrap items-center justify-between gap-2">
                <span className={testado ? '' : 'text-muted-foreground'}>3. O ar apitou e foi para 24°? Gerar</span>
                <Botao tamanho="sm" disabled={!testado} carregando={passo === 'gerar'} onClick={() => greeAcao('gerar')}>Gerar 300 botões</Botao>
              </li>
            </ol>
            {gree?.erro && <div className="mt-3"><Aviso>{gree.erro}</Aviso></div>}
          </>
        )}
      </div>
    </div>
  )
}

function Temporizador({ ar }) {
  const [ativo, setAtivo] = useState(null)
  const toast = useToast()
  const carregar = () => api.get('/api/temporizadores').then((l) => setAtivo(l.find((t) => t.aparelho_id === ar.id) || null)).catch(() => {})
  useEffect(() => { carregar() }, [ar.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const criar = async (min) => {
    try { await api.post(`/api/aparelhos/${ar.id}/temporizador`, { minutos: min, ligado: false }); toast(`Desliga em ${min >= 60 ? `${min / 60} h` : `${min} min`}.`); carregar() }
    catch (e) { toast(e.message, 'erro') }
  }
  return (
    <div className="cartao p-4">
      <h2 className="mb-1 text-sm font-semibold">Desligar automaticamente</h2>
      {ativo ? (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span>Desliga às {new Date(ativo.executar_em * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={async () => { await api.del(`/api/aparelhos/${ar.id}/temporizador`); carregar() }}>Cancelar</button>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted-foreground">Funciona mesmo se você ligou pela Alexa.</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[30, 60, 120, 240].map((m) => <Botao key={m} variante="secundario" tamanho="sm" onClick={() => criar(m)}>{m >= 60 ? `${m / 60} h` : `${m} min`}</Botao>)}
          </div>
        </>
      )}
    </div>
  )
}

// ---------- página ----------
export default function Aparelho() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') || 'controle'
  const { dados: ar, erro, recarregar, setDados } = useDados(() => api.get(`/api/aparelhos/${id}`), [id])
  const { dados: hubs } = useDados(() => api.get('/api/hubs'))
  const [ocupado, setOcupado] = useState(false)
  const [todosBotoes, setTodosBotoes] = useState(false)
  const [gravar, setGravar] = useState(null)
  const [apagar, setApagar] = useState(false)
  const toast = useToast()
  const navegar = useNavigate()

  if (erro) return <Aviso>{erro}</Aviso>
  if (!ar || !hubs) return <Carregando />

  const modos = ar.modos.split(',')
  const cods = new Set(ar.codigos.map((c) => c.chave))
  const extras = ar.codigos.filter((c) => c.chave.startsWith('extra_'))
  const semTransmissor = !ar.hub_id

  const mudar = async (estado) => {
    setOcupado(true)
    try {
      const novo = await api.post(`/api/aparelhos/${ar.id}/estado`, estado)
      setDados((d) => ({ ...d, ...novo }))
      if (novo.via === 'nuvem') toast('Enviado pela nuvem Tuya (transmissor fora da rede local).')
      recarregar()
    } catch (e) {
      toast(e.message, 'erro')
    } finally {
      setOcupado(false)
    }
  }

  const enviarExtra = async (chave) => {
    try {
      await api.post(`/api/aparelhos/${ar.id}/botoes/${chave}/enviar`)
      toast('Enviado.')
      recarregar()
    } catch (e) {
      toast(e.message, 'erro')
    }
  }

  const apagarBotao = async (chave) => {
    await api.del(`/api/aparelhos/${ar.id}/botoes/${chave}`)
    recarregar()
  }

  return (
    <>
      <Link to="/aparelhos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Aparelhos
      </Link>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{ar.nome}</h1>
        {ar.ligado ? <Selo cor="verde">Ligado</Selo> : <Selo>Desligado</Selo>}
        <p className="w-full text-sm text-muted-foreground">
          {[ar.comodo, ar.marca].filter(Boolean).join(' · ') || 'Sem cômodo'} · atualizado {haQuanto(ar.atualizado_em)}
        </p>
        {ar.zona && <p className="w-full text-sm text-amber-800 dark:text-amber-300">Na <b>{ar.zona.nome}</b>: obedece junto com {ar.zona.outros.join(', ')} (mesmo modelo, mesmo transmissor). <Link to="/transmissores" className="underline">Ver a zona</Link></p>}
      </div>

      <div className="mb-5">
        <FaixaMetricas itens={(() => {
          const semana = ar.atividade.filter((t) => t.quando > Date.now() / 1000 - 7 * 86400)
          const falhas = semana.filter((t) => !t.ok).length
          return [
            { rotulo: ar.ligado ? 'Ligado' : 'Desligado', valor: ar.temperatura, sufixo: '°C', dica: ar.ligado ? `${MODOS[ar.modo]} · desde ${ar.ligado_desde ? new Date(ar.ligado_desde * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}` : `última vez ${haQuanto(ar.atualizado_em)}` },
            { rotulo: 'Comandos recentes', valor: semana.length, dica: falhas ? `${falhas} com falha` : 'nenhuma falha', tom: falhas ? 'ruim' : '' },
            { rotulo: 'Botões gravados', valor: ar.codigos.length, dica: cods.has('desligar') ? 'inclui desligar' : 'falta gravar desligar', tom: cods.has('desligar') ? '' : 'ruim' },
            { rotulo: 'Alexa e Google', valor: ar.sinric_device_id ? 'Ativo' : 'Fora', dica: ar.sinric_device_id ? 'responde por voz' : 'ative em Alexa e Google', tom: ar.sinric_device_id ? 'bom' : '' },
          ]
        })()} />
      </div>

      <div className="mb-6 flex gap-1 border-b border-border">
        {ABAS.map(([k, r]) => (
          <button key={k} onClick={() => setParams({ aba: k })}
            className={`relative -mb-px px-3 py-2 text-sm font-medium transition-colors ${aba === k ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {r}
            {aba === k && <motion.span layoutId="aba-aparelho" className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {semTransmissor && aba !== 'ajustes' && (
        <div className="mb-4"><Aviso tipo="alerta">Este aparelho não tem transmissor vinculado. Escolha um na aba Ajustes.</Aviso></div>
      )}

      {aba === 'controle' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="cartao p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Ponto ativo={ar.hub?.online} /> {ar.hub ? `${ar.hub.nome} ${ar.hub.online ? 'online' : 'offline'}` : 'Sem transmissor'}
              </span>
              <Botao variante={ar.ligado ? 'secundario' : 'primario'} icone={Power} carregando={ocupado} disabled={semTransmissor}
                onClick={() => mudar({ ligado: !ar.ligado })}>
                {ar.ligado ? 'Desligar' : 'Ligar'}
              </Botao>
            </div>

            <div className="my-8 flex items-center justify-center gap-6 sm:gap-10">
              <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })} disabled={ocupado || semTransmissor || ar.temperatura <= ar.temp_min}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label="Diminuir">
                <Minus className="h-5 w-5" />
              </button>
              <Dial valor={ar.temperatura} min={ar.temp_min} max={ar.temp_max} ligado={!!ar.ligado} modo={ar.modo} tamanho={210} />
              <button onClick={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })} disabled={ocupado || semTransmissor || ar.temperatura >= ar.temp_max}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-border hover:bg-muted disabled:opacity-30" aria-label="Aumentar">
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="rotulo">Modo</span>
                <Segmentos opcoes={modos.map((m) => [m, MODOS[m]])} valor={ar.ligado ? ar.modo : null} disabled={ocupado || semTransmissor}
                  onChange={(m) => mudar({ ligado: true, modo: m })} />
              </div>
              <div>
                <span className="rotulo">Ventilação</span>
                <Segmentos opcoes={Object.entries(VENTILACAO)} valor={ar.ligado ? ar.ventilador : null} disabled={ocupado || semTransmissor}
                  onChange={(v) => mudar({ ligado: true, ventilador: v })} />
              </div>
            </div>
            {ar.codigos.length === 0 && (
              <p className="mt-5 text-sm text-muted-foreground">
                Nenhum botão gravado ainda. <button className="font-medium text-marca-600 underline" onClick={() => setParams({ aba: 'botoes' })}>Gravar botões</button>
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Temporizador ar={ar} />
            <div className="cartao p-4">
              <h2 className="mb-3 text-sm font-semibold">Outros botões</h2>
              {extras.length === 0 ? (
                <p className="text-sm text-muted-foreground">Swing, turbo e outros botões aparecem aqui depois de gravados.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {extras.map((c) => <Botao key={c.chave} variante="secundario" tamanho="sm" onClick={() => enviarExtra(c.chave)}>{c.descricao}</Botao>)}
                </div>
              )}
            </div>
            <div className="cartao">
              <h2 className="px-4 pb-2 pt-4 text-sm font-semibold">Histórico</h2>
              <div className="divide-y divide-border">
                {ar.atividade.length === 0 && <p className="px-4 pb-4 text-sm text-muted-foreground">Sem comandos ainda.</p>}
                {ar.atividade.map((t) => (
                  <div key={t.id} className="px-4 py-2 text-sm">
                    <p className="flex items-center justify-between gap-2"><span className="truncate">{t.acao}</span>{!t.ok && <Selo cor="vermelho">Falhou</Selo>}</p>
                    <p className="text-xs text-muted-foreground">{rotuloOrigem(t.origem)} · {haQuanto(t.quando)}{!t.ok && t.detalhe ? ` · ${t.detalhe}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {aba === 'botoes' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{ar.codigos.length} botões gravados. Clique numa temperatura ainda não gravada para gravar.</p>
            <Botao icone={CircleDot} disabled={semTransmissor} onClick={() => setGravar({})}>Gravar botão</Botao>
          </div>

          <AtalhosBotoes ar={ar} aoMudar={recarregar} />

          <div className="cartao p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Desligar</h2>
              {cods.has('desligar')
                ? <span className="flex items-center gap-2"><Selo cor="verde">Gravado</Selo><button className="text-muted-foreground/70 hover:text-red-600" onClick={() => apagarBotao('desligar')} aria-label="Apagar"><Trash2 className="h-4 w-4" /></button></span>
                : <Botao tamanho="sm" variante="secundario" disabled={semTransmissor} onClick={() => setGravar({ tipo: 'desligar' })}>Gravar</Botao>}
            </div>
            {modos.map((m) => {
              const temps = Array.from({ length: ar.temp_max - ar.temp_min + 1 }, (_, i) => ar.temp_min + i)
              return (
                <div key={m} className="border-t border-border py-3 ">
                  <p className="mb-2 text-sm font-medium">{MODOS[m]}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {temps.map((t) => {
                      const gravadas = ar.codigos.filter((c) => c.chave.startsWith(`${m}_${t}_`))
                      return (
                        <button key={t} disabled={semTransmissor}
                          title={gravadas.length ? gravadas.map((g) => g.descricao).join('\n') : 'Não gravado'}
                          onClick={() => setGravar({ tipo: 'estado', modo: m, temp: t })}
                          className={`h-9 w-12 rounded-md border text-sm tabular-nums ${gravadas.length ? 'border-marca-600 bg-marca-50 font-medium text-marca-700 dark:bg-marca-700/20 dark:text-marca-100' : 'border-dashed border-border text-muted-foreground/70 hover:border-muted-foreground/40 '}`}>
                          {t}°
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {ar.codigos.length > 0 && (
            <div className="cartao overflow-x-auto">
              <table className="tabela w-full">
                <thead><tr><th>Botão</th><th className="hidden sm:table-cell">Gravado</th><th className="w-10"></th></tr></thead>
                <tbody>
                  {(todosBotoes ? ar.codigos : ar.codigos.slice(0, 40)).map((c) => (
                    <tr key={c.chave}>
                      <td>{c.descricao}</td>
                      <td className="hidden text-muted-foreground sm:table-cell">{haQuanto(c.criado_em)}</td>
                      <td><button className="text-muted-foreground/70 hover:text-red-600" onClick={() => apagarBotao(c.chave)} aria-label="Apagar botão"><Trash2 className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ar.codigos.length > 40 && !todosBotoes && <button className="w-full border-t border-border py-2.5 text-sm text-primary hover:bg-muted" onClick={() => setTodosBotoes(true)}>Ver os {ar.codigos.length} botões</button>}
            </div>
          )}
        </div>
      )}

      {aba === 'ajustes' && (
        <div className="max-w-2xl space-y-6">
          <div className="cartao p-5">
            <FormAparelho inicial={ar} hubs={hubs} aoSalvar={async (f) => { await api.put(`/api/aparelhos/${ar.id}`, f); toast('Ajustes salvos.'); recarregar() }} />
          </div>
          <div className="cartao border-red-200 p-5 dark:border-red-900">
            <h2 className="text-sm font-semibold">Remover aparelho</h2>
            <p className="mt-1 text-sm text-muted-foreground">Apaga o aparelho, os botões gravados e os agendamentos dele.</p>
            <Botao variante="perigo" icone={Trash2} className="mt-3" onClick={() => setApagar(true)}>Remover</Botao>
          </div>
        </div>
      )}

      <Modal aberto={!!gravar} titulo="Gravar botão do controle original" onFechar={() => setGravar(null)}>
        {gravar && <Gravar ar={ar} preset={gravar} onFechar={() => setGravar(null)} aoGravar={recarregar} />}
      </Modal>

      <Modal aberto={apagar} titulo={`Remover ${ar.nome}?`} onFechar={() => setApagar(false)}>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">Os {ar.codigos.length} botões gravados também serão apagados. Isso não pode ser desfeito.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setApagar(false)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={async () => { await api.del(`/api/aparelhos/${ar.id}`); toast('Aparelho removido.'); navegar('/aparelhos') }}>Remover</Botao>
        </div>
      </Modal>
    </>
  )
}
