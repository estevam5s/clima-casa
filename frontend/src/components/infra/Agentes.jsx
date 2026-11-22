import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Container, Copy, Cpu, HardDrive, KeyRound, Laptop, MemoryStick, Monitor, Network, Radio, RotateCw, Server, Star, Thermometer, Trash2, Wifi } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Selo, useToast, confirmar } from '../ui'

// Computadores com o agente: quem fica no comando (preferido + regra "quem não enxerga os transmissores não manda")
// e a instalação de um PC Windows com código de uso único (o .env vai cifrado; só o código decifra, no PC).
const SERVIDOR = 'https://app.zynio.com.br'
const comandoLinux = (codigo, extra = '') => `curl -fsSL ${SERVIDOR}/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh ${codigo}${extra}`
const comandoMac = (codigo) => `curl -fsSL ${SERVIDOR}/instalar-agente-mac.sh -o /tmp/ia.sh && bash /tmp/ia.sh ${codigo}`
// Onde o agente roda: qualquer computador de 64 bits que fique ligado na rede dos transmissores
const PLATAFORMAS = [
  { id: 'windows', rotulo: 'Windows', sub: 'PC ou servidor', icone: Monitor },
  { id: 'mac', rotulo: 'Mac', sub: 'Apple Silicon ou Intel', icone: Laptop },
  { id: 'linux', rotulo: 'Linux', sub: 'PC, mini PC ou servidor', icone: Server },
  { id: 'raspberry', rotulo: 'Raspberry Pi', sub: '3B, 4 ou 5 (64 bits)', icone: Cpu },
  { id: 'docker', rotulo: 'Docker', sub: 'servidor da prefeitura', icone: Container },
]
const PASSOS = {
  windows: (c) => [
    <>No computador (Windows 10, 11 ou Windows Server 2019+), abra o menu Iniciar, digite <b>PowerShell</b>, clique com o botão direito e escolha <b>Executar como administrador</b>.</>,
    { texto: 'Cole este comando e aperte Enter (leva de 3 a 8 minutos na primeira vez):', cmd: comando(c) },
    <>Se o Windows perguntar, deixe a rede como <b>Privada</b> (Configurações → Rede → Perfil de rede). Em rede Pública ele não acha os transmissores.</>,
    'Não precisa deixar ninguém logado: o agente roda como tarefa do sistema e liga sozinho com o computador.',
  ],
  mac: (c) => [
    <>No Mac (macOS 12 ou mais novo), abra o <b>Terminal</b> (Spotlight → Terminal). Não use sudo.</>,
    { texto: 'Cole este comando e aperte Enter:', cmd: comandoMac(c) },
    <>Em Ajustes do Sistema → Bateria (ou Energia), impeça o repouso automático com a tela desligada: Mac dormindo não manda comando.</>,
    'O agente liga sozinho quando a pessoa entra no Mac.',
  ],
  linux: (c) => [
    <>Funciona em <b>Debian, Ubuntu, Linux Mint, Fedora, RHEL, Rocky, Alma, CentOS Stream, openSUSE e Arch</b>, de 64 bits (x86_64 ou ARM64), com systemd. Abra o terminal (ou entre por SSH).</>,
    { texto: 'Cole este comando:', cmd: comandoLinux(c) },
    'O instalador instala o que faltar pelo gerenciador do sistema (apt, dnf, yum, zypper ou pacman), põe o Python 3.13 à parte e cria o serviço que liga sozinho.',
    <>Servidor sem systemd ou que só aceita contêiner? Use a aba <b>Docker</b>.</>,
  ],
  raspberry: (c) => [
    <>Grave o <b>Raspberry Pi OS Lite (64-bit)</b> pelo Raspberry Pi Imager, com o Wi-Fi 2,4 GHz do escritório e o SSH ligado (passo a passo no quadro acima).</>,
    { texto: 'Entre por SSH no Raspberry e cole (leva de 10 a 20 minutos no Pi 3B):', cmd: comandoLinux(c) },
    'O sistema de 32 bits não serve (faltam bibliotecas prontas): o instalador avisa e para.',
  ],
  docker: (c) => [
    <>Para servidor Linux com <b>Docker</b> (e Docker Compose) na mesma rede dos transmissores. O contêiner usa a rede do servidor (<code>network_mode: host</code>) para falar com os transmissores.</>,
    { texto: 'No servidor, como administrador:', cmd: comandoLinux(c, ' --docker') },
    <>Ele cria <code>/opt/clima-escritorio/ar-controle/docker-compose.agente.yml</code> e sobe o contêiner <code>clima-escritorio-agente</code>, que reinicia sozinho. Logs: <code>docker logs -f clima-escritorio-agente</code>.</>,
    'Docker Desktop no Windows ou no Mac não serve para isto: lá o contêiner não enxerga a rede dos transmissores. Use as abas Windows ou Mac.',
  ],
}
// O que a rede precisa deixar passar (redes de órgão público costumam bloquear o banco ou inspecionar o HTTPS)
const REDE = [
  ['Saída TCP 443 (HTTPS)', 'app.zynio.com.br, *.supabase.co, api.sinric.pro e openapi.tuyaus.com, sem inspeção SSL (o firewall não pode trocar o certificado)'],
  ['Saída TCP 6543', '*.pooler.supabase.com: é o banco de dados. Muitas redes corporativas bloqueiam esta porta; sem ela o agente não funciona'],
  ['Rede local', 'TCP 6668 até cada transmissor e UDP 6666/6667 para achá-los (o computador precisa estar na mesma rede/VLAN dos transmissores)'],
  ['Sempre ligado', 'sem hibernar nem dormir; cabo de rede é melhor que Wi-Fi'],
]
const comando = (codigo) => `powershell -ExecutionPolicy Bypass -Command "irm ${SERVIDOR}/instalar-agente.ps1 -OutFile $env:TEMP\\ia.ps1; & $env:TEMP\\ia.ps1 -Codigo ${codigo}"`
const duracao = (s) => (s < 3600 ? `${Math.max(1, Math.round(s / 60))} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`)
// saúde do computador (o que ele mesmo informa a cada 10 s; "—" = o sistema não informa)
function Saude({ s }) {
  if (!s) return null
  const temp = s.temperatura, mem = s.memoria_total_mb ? Math.round(100 - (s.memoria_livre_mb / s.memoria_total_mb) * 100) : null
  const corTemp = temp == null ? '' : temp >= 75 ? 'text-red-600 dark:text-red-400' : temp >= 65 ? 'text-amber-700 dark:text-amber-400' : ''
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
      <div className="flex items-center gap-1" title="IP na rede do escritório"><Wifi className="h-3.5 w-3.5 text-muted-foreground" /><dd className="tabular">{s.ip || '—'}</dd></div>
      <div className={`flex items-center gap-1 ${corTemp}`} title="Temperatura do processador"><Thermometer className="h-3.5 w-3.5 text-muted-foreground" /><dd className="tabular">{temp == null ? '—' : `${temp} °C`}</dd></div>
      <div className="flex items-center gap-1" title="Memória em uso"><MemoryStick className="h-3.5 w-3.5 text-muted-foreground" /><dd className="tabular">{mem == null ? '—' : `${mem}% de ${(s.memoria_total_mb / 1024).toFixed(1)} GB`}</dd></div>
      <div className="flex items-center gap-1" title="Espaço livre no disco"><HardDrive className="h-3.5 w-3.5 text-muted-foreground" /><dd className="tabular">{s.disco_livre_gb == null ? '—' : `${s.disco_livre_gb} GB livres`}</dd></div>
      {s.modelo && <p className="col-span-full truncate text-muted-foreground" title={s.modelo}>{s.modelo}{s.arquitetura ? ` · ${s.arquitetura}` : ''}</p>}
      {s.ligado_ha_s != null && <p className="col-span-full text-muted-foreground">agente ligado há {duracao(s.ligado_ha_s)}{s.carga != null ? ` · carga ${s.carga}` : ''}</p>}
    </dl>
  )
}

// Raspberry Pi: do cartão de memória ao agente no comando (passo a passo; o comando de instalação sai do código abaixo)
function GuiaRaspberry() {
  const [so, setSo] = useState('mac')
  const ssh = 'ssh clima@clima-agente.local'
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><Cpu className="h-4 w-4" />Raspberry Pi como agente fixo do escritório</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Um Raspberry Pi 3B, 4 ou 5 ligado o tempo todo na rede do escritório vira o agente principal: gasta pouca energia e não depende de ninguém deixar o PC ligado. Depois de instalado, qualquer pessoa com conta controla os ares e os transmissores de todas as salas em app.zynio.com.br, do Windows, Mac, Linux ou celular, de casa ou do escritório: os comandos passam pelo Raspberry.</p>
      <ol className="mt-4 space-y-3 text-sm">
        <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>1.</b><span>No seu computador, instale o <b>Raspberry Pi Imager</b> (raspberrypi.com/software). Escolha o modelo, <b>Raspberry Pi OS Lite (64-bit)</b> e o cartão. Em “Editar configurações”: nome do computador <code className="rounded bg-muted px-1">clima-agente</code>, usuário <code className="rounded bg-muted px-1">clima</code> com uma senha sua, o <b>Wi-Fi 2,4 GHz do escritório</b> (o mesmo dos transmissores), fuso America/Sao_Paulo e, na aba Serviços, <b>ligar o SSH</b>.</span></li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>2.</b><span>Coloque o cartão no Raspberry, ligue na tomada perto do roteador (cabo de rede é ainda melhor) e espere 2 minutos.</span></li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>3.</b><div className="min-w-0 space-y-2"><span>Entre nele pela rede, de um computador no mesmo Wi-Fi:</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sistema do seu computador">
            {[['mac', 'Mac'], ['windows', 'Windows'], ['linux', 'Linux']].map(([k, r]) => <button key={k} onClick={() => setSo(k)} aria-pressed={so === k} className={`h-7 rounded-md border px-2.5 text-xs ${so === k ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>{r}</button>)}
          </div>
          <p className="text-xs text-muted-foreground">{so === 'windows' ? 'Abra o PowerShell (menu Iniciar → PowerShell) e cole:' : 'Abra o Terminal e cole:'}</p>
          <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-[11px] text-zinc-100">{ssh}</pre>
          <Copiar texto={ssh} rotulo="Copiar" />
          <p className="text-xs text-muted-foreground">Na primeira vez ele pergunta se confia no computador: digite <b>yes</b> e depois a senha que você escolheu. {so === 'windows' ? 'Se “clima-agente.local” não for achado, use o IP do Raspberry (aparece na lista de aparelhos do roteador).' : 'Sem resposta? Use o IP do Raspberry no lugar de clima-agente.local.'}</p></div></li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>4.</b><span>Gere o código de instalação aqui embaixo, abra “É um Raspberry Pi ou um Linux?” e cole o comando no Raspberry (pela janela do SSH). Leva de 10 a 20 minutos no Pi 3B.</span></li>
        <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>5.</b><span>Quando ele aparecer na lista acima, clique em <b>Preferir este</b>: ele fica no comando sempre que estiver ligado e enxergando os transmissores. O Mac e os PCs viram reserva.</span></li>
      </ol>
      <p className="mt-4 text-xs text-muted-foreground">Precisa destravar? “Reiniciar agente” no cartão do Raspberry funciona de qualquer lugar, sem SSH. Atualizar o sistema dele: gere um código novo e rode o mesmo comando. Use o sistema de 64 bits; Arduino, ESP32 e ESP8266 não rodam o agente.</p>
    </section>
  )
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Situação de um agente: só fica "Ativo" (verde e animado) quem está ligado E enxerga os transmissores, ou seja, está na
// mesma rede deles e consegue mandar nos ares. Ligado fora dessa rede = "Rodando, fora da rede" (âmbar, parado).
export function situacaoAgente(m) {
  if (!m.online) return { chave: 'desligado', rotulo: 'Desligado', texto: `visto ${haQuanto(m.visto)}`, cor: 'cinza' }
  if (m.ve_transmissores > 0) return { chave: 'ativo', rotulo: m.principal ? 'Ativo · no comando' : 'Ativo · reserva pronta', texto: `na rede dos transmissores (${m.ve_transmissores} de ${m.total_transmissores})`, cor: 'verde' }
  if (m.ve_transmissores == null) return { chave: 'rodando', rotulo: 'Rodando', texto: 'versão antiga do agente: não informa os transmissores', cor: 'ambar' }
  return { chave: 'fora', rotulo: 'Rodando · fora da rede', texto: 'ligado, mas não alcança os transmissores', cor: 'ambar' }
}

// Indicador animado: ondas saindo do ponto quando ativo (respeita "reduzir movimento"); parado nos outros estados
function Pulso({ chave, tamanho = 'h-3 w-3' }) {
  const cor = { ativo: 'bg-emerald-500', fora: 'bg-amber-500', rodando: 'bg-amber-500', desligado: 'bg-zinc-400 dark:bg-zinc-600' }[chave]
  return (
    <span className={`relative inline-flex ${tamanho} shrink-0`} aria-hidden="true">
      {chave === 'ativo' && <>
        <span className={`absolute inset-0 rounded-full ${cor} opacity-60 animate-ping motion-reduce:animate-none`} />
        <span className={`absolute -inset-1 rounded-full border border-emerald-500/40 animate-pulse motion-reduce:animate-none`} />
      </>}
      <span className={`relative inline-flex ${tamanho} rounded-full ${cor}`} />
    </span>
  )
}

// Barras que "transmitem" (só no ativo): um sinal visual de que os comandos estão passando por este computador
function Transmitindo() {
  return (
    <span className="inline-flex h-3.5 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <span key={i} className="w-[3px] origin-bottom rounded-sm bg-emerald-500 animate-[barra_1.1s_ease-in-out_infinite] motion-reduce:animate-none" style={{ height: `${40 + i * 20}%`, animationDelay: `${i * 0.15}s` }} />)}
      <style>{'@keyframes barra{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}'}</style>
    </span>
  )
}

const tipoAgente = (m) => (/Docker/.test(m.sistema) ? 'Docker' : /Raspberry|Raspbian/i.test(`${m.sistema} ${m.saude?.modelo || ''}`) ? 'Raspberry Pi' : /Windows/.test(m.sistema) ? 'PC Windows' : /Linux/.test(m.sistema) ? 'Linux' : 'Mac')

// Quadro do topo: quem está mandando nos ares agora e se isso funciona (alguém ativo na rede dos transmissores)
function NoComando({ maquinas }) {
  const principal = maquinas.find((m) => m.principal && m.online)
  const ativos = maquinas.filter((m) => situacaoAgente(m).chave === 'ativo')
  const sit = principal ? situacaoAgente(principal) : null
  const ok = sit?.chave === 'ativo'
  return (
    <div className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`} role="status" aria-live="polite">
      <Pulso chave={ok ? 'ativo' : principal ? 'fora' : 'desligado'} tamanho="h-4 w-4" />
      <div className="min-w-0 flex-1">
        {ok ? <>
          <p className="flex flex-wrap items-center gap-2 font-medium">Ares sob controle: <b>{principal.nome}</b> ({tipoAgente(principal)}) está ativo<Transmitindo /></p>
          <p className="text-sm text-muted-foreground">Na rede dos transmissores ({principal.ve_transmissores} de {principal.total_transmissores}). Painel, celular, Alexa e agenda funcionam de qualquer lugar.{principal.saude?.ligado_ha_s != null ? ` Rodando há ${duracao(principal.saude.ligado_ha_s)}.` : ''}</p>
        </> : principal ? <>
          <p className="font-medium">{principal.nome} está rodando, mas fora da rede dos transmissores</p>
          <p className="text-sm text-muted-foreground">Os comandos não chegam aos ares. Ligue um agente no escritório (Raspberry, PC) na mesma rede dos transmissores: ele assume sozinho em até 1 minuto.</p>
        </> : <>
          <p className="font-medium">Nenhum agente ligado</p>
          <p className="text-sm text-muted-foreground">Sem agente, nenhum comando chega aos ares. Ligue o Raspberry ou um PC do escritório.</p>
        </>}
      </div>
      {ativos.length > 1 && <Selo cor="verde">{ativos.length} ativos na rede (com reserva)</Selo>}
    </div>
  )
}

function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false)
  return (
    <Botao tamanho="sm" variante="secundario" icone={ok ? Check : Copy}
      onClick={() => navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1600) }).catch(() => {})}>
      {ok ? 'Copiado' : rotulo}
    </Botao>
  )
}

function Instalar({ maquinas, aoConectar }) {
  const toast = useToast()
  const [convite, setConvite] = useState(null), [ocupado, setOcupado] = useState(false), [agora, setAgora] = useState(Math.floor(Date.now() / 1000))
  const [plataforma, setPlataforma] = useState(() => { try { return localStorage.getItem('clima-agente-plataforma') || 'windows' } catch { return 'windows' } })
  const escolher = (id) => { setPlataforma(id); try { localStorage.setItem('clima-agente-plataforma', id) } catch { /* sem armazenamento */ } }
  const antes = useRef(new Set())
  useEffect(() => { const t = setInterval(() => setAgora(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(t) }, [])
  const gerar = async () => {
    setOcupado(true)
    try {
      antes.current = new Set(maquinas.map((m) => m.id))
      setConvite(await api.post('/api/agentes/convite'))
    } catch (e) { toast(e.message, 'erro') } finally { setOcupado(false) }
  }
  const novo = convite && maquinas.find((m) => !antes.current.has(m.id) && m.online)
  useEffect(() => { if (novo) aoConectar?.(novo) }, [novo?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const resta = convite ? convite.expira - agora : 0
  return (
    <section className="cartao p-5">
      <h2 className="titulo-secao flex items-center gap-2"><Monitor className="h-4 w-4" />Instalar o agente em outro computador</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Qualquer computador de 64 bits que fique ligado na mesma rede dos transmissores serve: PC ou servidor Windows, Mac, Linux (Debian, Ubuntu, Fedora, RHEL, openSUSE, Arch), Raspberry Pi 3B, 4 ou 5, ou um servidor com Docker. Vários podem ficar instalados ao mesmo tempo: um manda e os outros ficam de reserva. O comando baixa o sistema, recebe as chaves cifradas e instala o serviço; as chaves só são decifradas no computador, com o código.</p>
      <div className="mt-4 rounded-lg border border-border p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Network className="h-4 w-4" />O que a rede precisa liberar (para a TI da prefeitura)</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[11rem_1fr]">{REDE.map(([t, d]) => <div key={t} className="contents"><dt className="font-medium">{t}</dt><dd className="text-muted-foreground">{d}</dd></div>)}</dl>
        <p className="mt-2 text-xs text-muted-foreground">O instalador testa o banco e o HTTPS antes de terminar e diz o que está bloqueado.</p>
      </div>
      {!convite ? (
        <div className="mt-4"><Botao icone={KeyRound} carregando={ocupado} onClick={gerar}>Gerar código de instalação</Botao></div>
      ) : novo ? (
        <div className="mt-4"><Aviso tipo="ok"><b>{novo.nome}</b> conectado ({novo.sistema}). Ele aparece na lista abaixo como {novo.principal ? 'principal' : 'reserva'}. Para deixá-lo no comando, clique em “Preferir este”.</Aviso></div>
      ) : resta <= 0 ? (
        <div className="mt-4 space-y-3"><Aviso tipo="alerta">O código venceu sem ser usado.</Aviso><Botao icone={KeyRound} carregando={ocupado} onClick={gerar}>Gerar outro código</Botao></div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-lg font-semibold tracking-wider">{convite.codigo}</code>
            <Selo cor={resta < 300 ? 'ambar' : 'cinza'}>vale por {mmss(resta)} · uso único</Selo>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" role="tablist" aria-label="Tipo de computador">
            {PLATAFORMAS.map(({ id, rotulo, sub, icone: I }) => (
              <button key={id} role="tab" aria-selected={plataforma === id} onClick={() => escolher(id)}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm ${plataforma === id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
                <I className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0"><b className="block font-medium">{rotulo}</b><span className="block text-[11px] text-muted-foreground">{sub}</span></span>
              </button>
            ))}
          </div>
          <ol className="space-y-3 text-sm">
            {PASSOS[plataforma](convite.codigo).map((p, i) => (
              <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-2"><b>{i + 1}.</b>{p?.cmd ? (
                <div className="min-w-0 space-y-2"><span>{p.texto}</span>
                  <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{p.cmd}</pre>
                  <Copiar texto={p.cmd} rotulo="Copiar comando" /></div>
              ) : <span>{p}</span>}</li>
            ))}
          </ol>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />Esperando o PC se conectar…</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">O mesmo comando, com um código novo, também atualiza o computador depois. Sem internet direta? Copie a pasta e o .env por pendrive e rode o instalar-windows.ps1 (Linux: sudo ./instalar-linux.sh; Mac: ./instalar-servico.sh). Arduino, ESP32 e ESP8266 não rodam o agente.</p>
    </section>
  )
}

export default function Agentes({ dono, admin }) {
  const toast = useToast()
  const [d, setD] = useState(null)
  const carregar = useCallback(() => api.get('/api/agentes').then(setD).catch((e) => toast(e.message, 'erro')), [toast])
  const pode = dono || admin
  // o dono vê a seção de instalação: atualiza a cada 5 s para avisar logo que o PC conectou
  useEffect(() => { carregar(); const t = setInterval(carregar, pode ? 5000 : 10000); return () => clearInterval(t) }, [carregar, pode])
  const preferir = async (id) => { try { setD(await api.post('/api/agentes/preferido', { id })); toast(id ? 'Salvo. Ele assume em até 1 minuto se estiver ligado e enxergar os transmissores.' : 'Sem preferência: fica no comando quem já está, desde que enxergue os transmissores.') } catch (e) { toast(e.message, 'erro') } }
  const reiniciar = async (m) => { if (!await confirmar(`Reiniciar o agente em ${m.nome}? Ele fica uns 30 a 60 segundos sem mandar comandos.`)) return; try { const r = await api.post('/api/agentes/reiniciar', { id: m.id }); toast(r.mensagem) } catch (e) { toast(e.message, 'erro') } }
  const esquecer = async (id) => { if (!await confirmar('Tirar este computador da lista?')) return; try { setD(await api.post('/api/agentes/esquecer', { id })) } catch (e) { toast(e.message, 'erro') } }
  if (!d) return <Esqueleto className="h-64" />
  const preferido = d.maquinas.find((m) => m.id === d.preferido)
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <NoComando maquinas={d.maquinas} />
        <div><h2 className="titulo-secao">Quem fica no comando</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Só um computador é o <b className="text-foreground">principal</b> e manda os comandos para os ares; os outros ficam de <b className="text-foreground">reserva</b>. Quem não enxerga os transmissores (fora do Wi-Fi do escritório) passa o comando para quem enxerga. O <b className="text-foreground">preferido</b> retoma sozinho quando volta ao escritório.</p>
          <p className="mt-1 text-sm">{preferido ? <>Preferido agora: <b>{preferido.nome}</b>.</> : 'Sem preferido: fica quem já está no comando.'}</p></div>
        {!d.maquinas.length && <Aviso tipo="alerta">Nenhum computador com o agente ainda.</Aviso>}
        <div className="grid gap-3 md:grid-cols-2">
          {d.maquinas.map((m) => { const I = /Windows/.test(m.sistema) ? Monitor : /Docker/.test(m.sistema) ? Container : /Raspberry|Raspbian/i.test(`${m.sistema} ${m.saude?.modelo || ''}`) ? Cpu : /Linux/.test(m.sistema) ? Server : Laptop; const ve = m.ve_transmissores, tot = m.total_transmissores; return (
            <div key={m.id} className={`cartao p-4 transition-colors ${situacaoAgente(m).chave === 'ativo' ? 'border-emerald-500/50' : m.principal ? 'border-primary/50' : ''}`}>
              <div className="flex items-start gap-3">
                <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${situacaoAgente(m).chave === 'ativo' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'border-border'}`}>
                  <I className="h-5 w-5" />
                  <span className="absolute -right-1 -top-1"><Pulso chave={situacaoAgente(m).chave} /></span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">{m.nome}{m.principal ? <Selo cor="verde">Principal</Selo> : m.online ? <Selo>Reserva</Selo> : <Selo cor="cinza">Desligado</Selo>}{d.preferido === m.id && <Selo cor="ambar">Preferido</Selo>}</p>
                  {(() => { const st = situacaoAgente(m); return (
                    <p className={`mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-medium ${st.chave === 'ativo' ? 'text-emerald-700 dark:text-emerald-400' : st.chave === 'desligado' ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'}`}>
                      {st.chave === 'ativo' && <Transmitindo />}{st.rotulo}<span className="font-normal text-muted-foreground">· {st.texto}</span>
                    </p>) })()}
                  <p className="text-xs text-muted-foreground">{m.sistema} · Python {m.python}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs"><Radio className="h-3.5 w-3.5 text-muted-foreground" />{ve == null ? <span className="text-muted-foreground">visão dos transmissores: atualize o agente</span>
                    : ve > 0 ? <span>{m.online ? '' : 'da última vez, '}enxerga {ve} de {tot} transmissor{tot > 1 ? 'es' : ''}</span> : <span className="text-amber-700 dark:text-amber-400">não enxerga os transmissores (fora do escritório?)</span>}</p>
                  <p className="text-xs text-muted-foreground">{m.online ? 'visto agora' : `visto ${haQuanto(m.visto)}`} · id {m.id}</p>
                  {m.online && <Saude s={m.saude} />}
                </div>
              </div>
              {pode && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {d.preferido === m.id ? <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(null)}>Tirar preferência</Botao> : <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(m.id)}>Preferir este</Botao>}
                  {m.online && <Botao tamanho="sm" variante="secundario" icone={RotateCw} onClick={() => reiniciar(m)}>Reiniciar agente</Botao>}
                  {dono && !m.online && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={() => esquecer(m.id)}>Tirar da lista</Botao>}
                </div>
              )}
            </div>
          ) })}
        </div>
      </section>
      {pode && <GuiaRaspberry />}
      {pode ? <Instalar maquinas={d.maquinas} aoConectar={carregar} />
        : <p className="text-xs text-muted-foreground">Instalar o agente em outro computador é do dono e dos administradores (o código de instalação abre todas as chaves do sistema).</p>}
    </div>
  )
}
