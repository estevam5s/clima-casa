import { ChevronDown, Power } from 'lucide-react'

// Guia visual de como gravar os botões do controle remoto (usado no cadastro do ar, na aba Botões e na gravação).
// O ponto que confunde: o que importa é o VISOR DO CONTROLE (ele guarda o estado e manda tudo junto a cada toque),
// não se o ar está ligado ou desligado.
function Visor({ ligado = true, modo = 'FRIO', temp, vent = 'AUTO', destaque }) {
  return (
    <div className="w-36 shrink-0 rounded-[1.4rem] border border-border bg-zinc-200 p-2.5 shadow-inner dark:bg-zinc-800">
      <div className={`rounded-lg px-2 py-1.5 font-mono text-[11px] leading-tight ${ligado ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-zinc-300 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'}`}>
        <div className="flex justify-between"><span>{ligado ? modo : 'DESLIG.'}</span><span>{ligado ? vent : ''}</span></div>
        <div className="text-center text-2xl font-bold tabular-nums">{ligado ? `${temp}°` : '--'}</div>
      </div>
      <div className="mt-2 flex items-center justify-between px-1">
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${destaque === 'power' ? 'bg-red-600 text-white ring-4 ring-red-500/30' : 'bg-red-500/80 text-white'}`}><Power className="h-3.5 w-3.5" /></span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${destaque === 'menos' ? 'bg-primary text-primary-foreground ring-4 ring-primary/30' : 'bg-zinc-400/60 text-white'}`}><ChevronDown className="h-4 w-4" /></span>
      </div>
    </div>
  )
}

const PASSOS = [
  { titulo: '1. Grave o Desligar primeiro', visor: { ligado: true, temp: 24, destaque: 'power' },
    texto: <>Deixe o <b>visor do controle aceso</b> (ligado), em qualquer ajuste. Aqui no sistema escolha <b>Desligar</b>, clique em <b>Começar a gravar</b> e aperte <b>uma vez o botão liga/desliga</b> do controle, a 10–20 cm do transmissor. O ar pode estar ligado ou desligado: não importa.</> },
  { titulo: '2. Grave cada ajuste que vão usar', visor: { ligado: true, temp: 24, destaque: 'menos' },
    texto: <>Para gravar <b>Frio 23°</b>: no controle deixe Frio e a ventilação desejada, em <b>24°</b> (1° acima). Aqui escolha <b>Frio 23°</b>, clique em <b>Começar a gravar</b> e aperte <b>uma vez a seta de baixar</b>. O controle vai para 23° e manda o ajuste completo. Repita para 22°, 24°, 25°…</> },
  { titulo: 'Ar Gree? Só o passo 1', visor: { ligado: false, temp: 23 },
    texto: <>Nos ares <b>Gree</b>, o Desligar basta: na aba Botões use <b>Controle Gree → Conferir → Testar → Gerar</b> e o sistema cria os 300 ajustes. Outro ar igual? <b>Copiar de outro ar</b> copia todos os botões.</> },
]

export default function GuiaBotoes({ compacto = false }) {
  return (
    <div className={compacto ? 'space-y-3' : 'cartao space-y-4 p-5'}>
      {!compacto && (
        <div>
          <h3 className="titulo-secao">Como gravar os botões do controle</h3>
          <p className="mt-1 text-sm text-muted-foreground">O controle remoto do ar guarda o estado no visor e, a cada toque, manda <b>tudo junto</b>: ligado, modo, temperatura e ventilação. Por isso o que vale é o visor do controle, não o ar.</p>
        </div>
      )}
      <div className={`grid grid-cols-1 gap-3 ${compacto ? '' : 'lg:grid-cols-3'}`}>
        {PASSOS.map((p) => (
          <div key={p.titulo} className="flex gap-3 rounded-xl border border-border p-3">
            {!compacto && <Visor {...p.visor} />}
            <div className="min-w-0 text-sm">
              <p className="font-medium">{p.titulo}</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">{p.texto}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Não gravou? Aproxime a 5 cm, longe de lâmpadas e do sol, e aperte uma vez, firme. O computador do agente precisa estar na rede do escritório (o sistema confere antes de gravar).</p>
    </div>
  )
}
