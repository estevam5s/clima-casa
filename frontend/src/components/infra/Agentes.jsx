import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Cpu, HardDrive, KeyRound, Laptop, MemoryStick, Monitor, Radio, RotateCw, Star, Thermometer, Trash2, Wifi } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Selo, useToast, confirmar } from '../ui'

// Computadores com o agente: quem fica no comando (preferido + regra "quem não enxerga os transmissores não manda")
// e a instalação de um PC Windows com código de uso único (o .env vai cifrado; só o código decifra, no PC).
const SERVIDOR = 'https://app.zynio.com.br'
const comandoLinux = (codigo) => `curl -fsSL ${SERVIDOR}/instalar-agente.sh -o /tmp/ia.sh && sudo bash /tmp/ia.sh ${codigo}`
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
      <h2 className="titulo-secao flex items-center gap-2"><Monitor className="h-4 w-4" />Instalar em um PC Windows ou Raspberry Pi</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Um computador que fica ligado no escritório (mesmo Wi-Fi dos transmissores) mantém tudo funcionando quando o Mac vai embora: um PC Windows, um Linux ou um Raspberry Pi 3B, 4 ou 5 com o sistema de 64 bits. O comando baixa o sistema, recebe as chaves cifradas e instala o serviço. As chaves só são decifradas no computador, com o código.</p>
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
          <ol className="space-y-3 text-sm">
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>1.</b><span>No PC do escritório, abra o menu Iniciar, digite <b>PowerShell</b>, clique com o botão direito e escolha <b>Executar como administrador</b>.</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>2.</b><div className="min-w-0 space-y-2"><span>Cole este comando e aperte Enter (leva de 3 a 8 minutos na primeira vez):</span>
              <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{comando(convite.codigo)}</pre>
              <Copiar texto={comando(convite.codigo)} rotulo="Copiar comando" /></div></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>3.</b><span>Se o Windows perguntar, deixe a rede como <b>Privada</b> (Configurações → Rede → Wi-Fi → Perfil de rede). Em rede Pública ele não acha os transmissores.</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-2"><b>4.</b><span>Pronto: esta tela avisa quando o PC conectar. Não precisa deixar ninguém logado; o PC só tem que ficar ligado.</span></li>
          </ol>
          <details className="rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">É um Raspberry Pi ou um Linux?</summary>
            <div className="mt-3 space-y-2">
              <p className="text-muted-foreground">Use o mesmo código. No Raspberry, grave antes o <b className="text-foreground">Raspberry Pi OS (64-bit)</b> pelo Raspberry Pi Imager e ligue no Wi-Fi 2,4 GHz do escritório. Abra o Terminal (ou entre por SSH) e cole (leva de 10 a 20 minutos no Pi 3B):</p>
              <pre className="overflow-x-auto rounded-md bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-100">{comandoLinux(convite.codigo)}</pre>
              <Copiar texto={comandoLinux(convite.codigo)} rotulo="Copiar comando do Linux" />
              <p className="text-xs text-muted-foreground">O sistema de 32 bits não serve (faltam bibliotecas prontas). Arduino, ESP32 e ESP8266 não rodam o agente: ele precisa de um Linux, Windows ou macOS.</p>
            </div>
          </details>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />Esperando o PC se conectar…</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">O mesmo comando, com um código novo, também atualiza o PC depois. Sem internet no PC? Copie a pasta e o .env por pendrive e rode o instalar-windows.ps1 (no Linux, sudo ./instalar-linux.sh).</p>
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
        <div><h2 className="titulo-secao">Quem fica no comando</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Só um computador é o <b className="text-foreground">principal</b> e manda os comandos para os ares; os outros ficam de <b className="text-foreground">reserva</b>. Quem não enxerga os transmissores (fora do Wi-Fi do escritório) passa o comando para quem enxerga. O <b className="text-foreground">preferido</b> retoma sozinho quando volta ao escritório.</p>
          <p className="mt-1 text-sm">{preferido ? <>Preferido agora: <b>{preferido.nome}</b>.</> : 'Sem preferido: fica quem já está no comando.'}</p></div>
        {!d.maquinas.length && <Aviso tipo="alerta">Nenhum computador com o agente ainda.</Aviso>}
        <div className="grid gap-3 md:grid-cols-2">
          {d.maquinas.map((m) => { const I = /Windows/.test(m.sistema) ? Monitor : /Linux/.test(m.sistema) ? Cpu : Laptop; const ve = m.ve_transmissores, tot = m.total_transmissores; return (
            <div key={m.id} className={`cartao p-4 ${m.principal ? 'border-primary/50' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border"><I className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium">{m.nome}{m.principal ? <Selo cor="verde">Principal</Selo> : m.online ? <Selo>Reserva</Selo> : <Selo cor="cinza">Desligado</Selo>}{d.preferido === m.id && <Selo cor="ambar">Preferido</Selo>}</p>
                  <p className="text-xs text-muted-foreground">{m.sistema} · Python {m.python}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs"><Radio className="h-3.5 w-3.5 text-muted-foreground" />{ve == null ? <span className="text-muted-foreground">visão dos transmissores: atualize o agente</span>
                    : ve > 0 ? <span>enxerga {ve} de {tot} transmissor{tot > 1 ? 'es' : ''}</span> : <span className="text-amber-700 dark:text-amber-400">não enxerga os transmissores (fora do escritório?)</span>}</p>
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
