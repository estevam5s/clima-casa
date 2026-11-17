import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bug, ShieldCheck, Sparkles, Wrench } from 'lucide-react'
import { api } from '../api'
import { Botao, Modal } from './ui'

// "O que há de novo": conteúdo em backend/app/novidades.json (uma entrada por versão, mais nova primeiro).
export const SECOES = [
  ['novo', 'Novo', Sparkles],
  ['melhorias', 'Melhorias', Wrench],
  ['seguranca', 'Segurança', ShieldCheck],
  ['correcoes', 'Correções', Bug],
]

export const dataBR = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

export function Versao({ v, compacto = false }) {
  return (
    <div className="space-y-4">
      {v.resumo && <p className="text-sm text-muted-foreground">{v.resumo}</p>}
      {SECOES.map(([k, rotulo, I]) => (v[k] || []).length > 0 && (
        <section key={k}>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold"><I className="h-4 w-4 text-muted-foreground" aria-hidden />{rotulo}</h3>
          <ul className={`space-y-1 pl-5 text-sm ${compacto ? '' : 'leading-relaxed'}`}>
            {v[k].map((t) => <li key={t} className="list-disc marker:text-muted-foreground">{t}</li>)}
          </ul>
        </section>
      ))}
    </div>
  )
}

// Modal que abre sozinho uma vez por pessoa quando sai uma versão nova (a "vista" fica no banco, vale em todo aparelho).
export default function NovidadesModal() {
  const [d, setD] = useState(null)
  useEffect(() => {
    let vivo = true
    api.get('/api/novidades').then((r) => { if (vivo && r.mostrar) setD(r) }).catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!d) return null
  const v = d.versoes[0]
  const fechar = () => { api.post('/api/novidades/vista', { versao: d.atual }).catch(() => {}); setD(null) }
  return (
    <Modal aberto titulo={`O que há de novo · versão ${v.versao}`} onFechar={fechar} largura="max-w-2xl">
      <p className="-mt-1 mb-3 text-xs text-muted-foreground">{dataBR(v.data)} · {v.titulo}</p>
      <div className="max-h-[60vh] overflow-y-auto pr-1"><Versao v={v} compacto /></div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Link to="/novidades" onClick={fechar} className="inline-flex items-center rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">Ver todas as versões</Link>
        <Botao onClick={fechar}>Entendi</Botao>
      </div>
    </Modal>
  )
}
