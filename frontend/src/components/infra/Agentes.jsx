import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, Cpu, KeyRound, Laptop, Monitor, Radio, Star, Trash2 } from 'lucide-react'
import { api, haQuanto } from '../../api'
import { Aviso, Botao, Esqueleto, Selo, useToast } from '../ui'

// Computadores com o agente: quem fica no comando (preferido + regra "quem não enxerga os transmissores não manda")
// e a instalação de um PC Windows com código de uso único (o .env vai cifrado; só o código decifra, no PC).
const SERVIDOR = 'https://app.zynio.com.br'
const comando = (codigo) => `powershell -ExecutionPolicy Bypass -Command "irm ${SERVIDOR}/instalar-agente.ps1 -OutFile $env:TEMP\\ia.ps1; & $env:TEMP\\ia.ps1 -Codigo ${codigo}"`
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
      <h2 className="titulo-secao flex items-center gap-2"><Monitor className="h-4 w-4" />Instalar em um PC Windows</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Um PC que fica ligado no escritório (mesmo Wi-Fi dos transmissores) mantém tudo funcionando quando o Mac vai embora. O comando abaixo baixa o sistema, recebe as chaves cifradas e instala o serviço. As chaves só são decifradas no PC, com o código.</p>
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
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />Esperando o PC se conectar…</p>
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">O mesmo comando, com um código novo, também atualiza o PC depois. Sem internet no PC? Copie a pasta e o .env por pendrive e rode o instalar-windows.ps1 (Guia → “Ir para casa com o Mac”).</p>
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
  const esquecer = async (id) => { if (!window.confirm('Tirar este computador da lista?')) return; try { setD(await api.post('/api/agentes/esquecer', { id })) } catch (e) { toast(e.message, 'erro') } }
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
                </div>
              </div>
              {pode && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {d.preferido === m.id ? <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(null)}>Tirar preferência</Botao> : <Botao tamanho="sm" variante="secundario" icone={Star} onClick={() => preferir(m.id)}>Preferir este</Botao>}
                  {dono && !m.online && <Botao tamanho="sm" variante="secundario" icone={Trash2} onClick={() => esquecer(m.id)}>Tirar da lista</Botao>}
                </div>
              )}
            </div>
          ) })}
        </div>
      </section>
      {pode ? <Instalar maquinas={d.maquinas} aoConectar={carregar} />
        : <p className="text-xs text-muted-foreground">Instalar o agente em outro computador é do dono e dos administradores (o código de instalação abre todas as chaves do sistema).</p>}
    </div>
  )
}
