import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Mic, Radio, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import { api, haQuanto } from '../api'
import { Botao, Ponto, Selo } from './ui'

// Google Home e Google Assistente pelo Sinric Pro (a mesma conta usada na Alexa): passo a passo com QR do app, quais
// ares o Google vê, frases que funcionam em português, rotinas e um teste ao vivo (fale no Google e veja chegar aqui).
const APP_GOOGLE = { ios: 'https://apps.apple.com/br/app/google-home/id680819774', android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.chromecast.app' }
const PASSOS = [
  ['Abra o app Google Home', 'No celular da conta Google que vai mandar nos ares (QR ao lado para baixar).'],
  ['Adicionar → Dispositivo → Funciona com o Google Home', 'Toque no “+”, escolha “Dispositivo” e depois “Funciona com o Google Home”.'],
  ['Procure “Sinric Pro” e entre', 'Use a MESMA conta do Sinric Pro do sistema. Os ares aparecem sozinhos.'],
  ['Escolha o cômodo de cada ar', 'Com o ar no mesmo cômodo do Nest/alto-falante, dá para dizer só “Ok Google, ligue o ar”.'],
]
const FRASES = (nome) => [
  `Ok Google, ligue o ${nome}`,
  `Ok Google, defina o ${nome} para 23 graus`,
  `Ok Google, mude o ${nome} para o modo frio`,
  `Ok Google, aumente a temperatura do ${nome}`,
  `Ok Google, qual é a temperatura do ${nome}?`,
  `Ok Google, desligue o ${nome}`,
  'Ok Google, desligue todos os ares',
  'Ok Google, sincronize meus dispositivos',
]
const ROTINAS = [
  ['Bom dia, escritório', 'Às 7h30 nos dias úteis: liga o ar da sala em 23° (Rotinas → Nova → Horário).'],
  ['Fim do expediente', '“Ok Google, fim do expediente”: desliga todos os ares de uma vez.'],
  ['Ao sair de casa', 'Com a localização do celular, desliga os ares quando a última pessoa sai.'],
]

export default function IntegracaoGoogle({ cfg, aparelhos }) {
  const ag = cfg?.agente || {}
  const naVoz = aparelhos.filter((a) => a.sinric_device_id)
  const nome = (naVoz[0]?.nome || 'ar do escritório').toLowerCase()
  const [teste, setTeste] = useState(null)   // { desde, comando }
  const timer = useRef(null)
  const [qr, setQr] = useState(null)
  useEffect(() => { api.get('/api/apps/qr?alvo=google_home').then((r) => setQr(r.qr)).catch(() => {}); return () => clearInterval(timer.current) }, [])
  const testar = () => {
    clearInterval(timer.current)
    const desde = Math.floor(Date.now() / 1000)
    setTeste({ desde, comando: null })
    timer.current = setInterval(async () => {
      try {
        const r = await api.get('/api/sinric/ultimo-comando')
        if (r.comando && r.comando.quando >= desde) { setTeste({ desde, comando: r.comando }); clearInterval(timer.current) }
        else if (Date.now() / 1000 - desde > 120) { setTeste((t) => ({ ...t, expirou: true })); clearInterval(timer.current) }
      } catch { /* tenta de novo */ }
    }, 2000)
  }
  const prontos = [
    [cfg?.ativo && !!cfg?.app_key, 'Sinric Pro configurado', cfg?.ativo ? 'credenciais salvas' : 'ligue o Sinric Pro acima'],
    [!!ag.conectado, 'Agente conectado ao Sinric', ag.conectado ? `há ${haQuanto(ag.desde).replace('há ', '')}` : 'precisa de um computador do escritório ligado'],
    [naVoz.length > 0, 'Ares disponíveis para voz', naVoz.length ? `${naVoz.length} ar(es)` : 'crie os ares no Sinric (lista “fora da Alexa”)'],
  ]
  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div>
          <h2 className="flex items-center gap-2 titulo-secao"><Smartphone className="h-4 w-4" />Google Home e Google Assistente</h2>
          <p className="mt-1 text-sm text-muted-foreground">Os mesmos ares da Alexa, pelo Sinric Pro: Nest, Google Home no celular, Android, Wear OS e Android Auto.</p>
        </div>
        <Selo cor={prontos.every((p) => p[0]) ? 'verde' : 'ambar'}>{prontos.every((p) => p[0]) ? 'Pronto para o Google' : 'Falta configurar'}</Selo>
      </div>
      <div className="grid grid-cols-1 gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-5">
          <ul className="grid gap-2 sm:grid-cols-3">{prontos.map(([ok, t, d]) => (
            <li key={t} className="flex gap-2 rounded-lg border border-border p-2.5 text-sm">{ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<span><b className="block font-medium">{t}</b><span className="text-xs text-muted-foreground">{d}</span></span></li>))}
          </ul>
          <ol className="space-y-3">{PASSOS.map(([t, d], i) => (
            <li key={t} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
              <div><p className="text-sm font-medium">{t}</p><p className="text-xs leading-relaxed text-muted-foreground">{d}</p></div></li>))}
          </ol>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Ares que o Google vê</p>
            {naVoz.length ? <div className="flex flex-wrap gap-1.5">{naVoz.map((a) => <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"><Ponto ativo={!!ag.conectado} />{a.nome}</span>)}</div>
              : <p className="text-sm text-muted-foreground">Nenhum ainda.</p>}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-muted p-3 text-xs">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium"><Mic className="h-3.5 w-3.5" />Frases que funcionam</p>
              <ul className="space-y-1 text-muted-foreground">{FRASES(nome).map((f) => <li key={f}>“{f}”</li>)}</ul>
            </div>
            <div className="rounded-lg bg-muted p-3 text-xs">
              <p className="mb-1.5 font-medium">Rotinas do Google Home</p>
              <ul className="space-y-2 text-muted-foreground">{ROTINAS.map(([t, d]) => <li key={t}><b className="text-foreground">{t}</b>: {d}</li>)}</ul>
            </div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-medium">Teste ao vivo</p><p className="text-xs text-muted-foreground">Clique, fale um comando no Google e veja ele chegar aqui (espera 2 minutos).</p></div>
              <Botao tamanho="sm" variante="secundario" icone={teste && !teste.comando && !teste.expirou ? Radio : RefreshCw} onClick={testar}>{teste && !teste.comando && !teste.expirou ? 'Esperando…' : 'Começar teste'}</Botao>
            </div>
            {teste?.comando && <p className={`mt-2 text-sm ${teste.comando.ok ? 'text-emerald-600' : 'text-red-600'}`}>{teste.comando.ok ? 'Chegou' : 'Chegou com erro'}: {teste.comando.acao}{teste.comando.aparelho ? ` · ${teste.comando.aparelho}` : ''}{teste.comando.detalhe ? ` · ${teste.comando.detalhe}` : ''}</p>}
            {teste?.expirou && !teste.comando && <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">Nenhum comando em 2 minutos: confira se a conta do Sinric no Google é a mesma e se o agente está conectado.</p>}
          </div>
          <p className="text-xs text-muted-foreground">Luzes, cafeteira, persianas e fechadura do Smart Life também entram no Google: no mesmo “Funciona com o Google Home”, procure “Smart Life” e entre com a conta do app.</p>
        </div>
        <div className="flex flex-col items-center gap-2.5 self-start rounded-lg border border-border bg-muted/40 p-4 text-center xl:sticky xl:top-4">
          <p className="text-xs font-medium">Baixar o app Google Home</p>
          {/* o QR precisa de fundo claro para a câmera ler: só ele fica no quadrado branco */}
          <div className="rounded-md bg-white p-2">{qr ? <img alt="QR Code do app Google Home" className="h-32 w-32" src={qr} /> : <div className="h-32 w-32" />}</div>
          <p className="text-[11px] text-muted-foreground">Aponte a câmera do celular (Android)</p>
          <div className="flex gap-3 text-xs">
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={APP_GOOGLE.android} target="_blank" rel="noreferrer">Android<ExternalLink className="h-3 w-3" /></a>
            <a className="inline-flex items-center gap-1 text-primary hover:underline" href={APP_GOOGLE.ios} target="_blank" rel="noreferrer">iPhone<ExternalLink className="h-3 w-3" /></a>
          </div>
        </div>
      </div>
    </section>
  )
}
