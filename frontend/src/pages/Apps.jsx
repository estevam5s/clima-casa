import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Apple, Download, Github, Globe, Monitor, Smartphone, Terminal } from 'lucide-react'
import { DOWNLOADS, REPO, sistemaAtual } from '../apps'
import { Botao, Cabecalho } from '../components/ui'

const ICONES = { android: Smartphone, 'mac-arm': Apple, 'mac-intel': Apple, windows: Monitor, linux: Terminal, 'linux-arm': Terminal }

export default function Apps() {
  const meu = sistemaAtual()
  const [pwa, setPwa] = useState(null)
  useEffect(() => {
    const f = (e) => { e.preventDefault(); setPwa(e) }
    window.addEventListener('beforeinstallprompt', f)
    return () => window.removeEventListener('beforeinstallprompt', f)
  }, [])
  const destaque = DOWNLOADS.find((d) => d.id === meu)
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Cabecalho titulo="Baixar apps" descricao="O Clima Casa no celular e no computador, com o mesmo login e os mesmos aparelhos." />
      {destaque && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="cartao mb-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recomendado para este aparelho</p>
            <p className="mt-1 text-xl font-semibold">Clima Casa para {destaque.nome}</p>
            <p className="text-sm text-muted-foreground">{destaque.detalhe}</p>
          </div>
          <a href={destaque.url}><Botao icone={Download}>Baixar</Botao></a>
        </motion.div>
      )}
      <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),310px))]">
        {DOWNLOADS.map((d, i) => {
          const I = ICONES[d.id]
          return (
            <motion.a key={d.id} href={d.url} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="cartao group flex items-center gap-4 p-5 hover:border-primary">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><I className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block font-medium">{d.nome}</span><span className="block truncate text-xs text-muted-foreground">{d.detalhe}</span></span>
              <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </motion.a>
          )
        })}
        <div className="cartao flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted"><Globe className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-medium">App web (PWA)</span><span className="block text-xs text-muted-foreground">Instala direto do navegador, sem loja</span></span>
          {pwa ? <Botao tamanho="sm" onClick={() => pwa.prompt()}>Instalar</Botao> : <span className="text-xs text-muted-foreground">Menu do navegador → Instalar</span>}
        </div>
      </div>
      <div className="mt-8 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-foreground"><Github className="h-4 w-4" /> Repositório privado</p>
        <p className="mt-1">Os arquivos ficam no último release de <a href={`${REPO}/releases`} className="text-primary underline">github.com/estevam5s/clima-casa</a>. Para baixar, entre no GitHub com uma conta que tenha acesso. No Android, permita instalar apps desta fonte. No Mac, na primeira vez abra com botão direito → Abrir.</p>
      </div>
    </div>
  )
}
