import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { api } from '../api'
import { Botao, Modal } from './ui'

// Termo de Uso e Confidencialidade: cada pessoa aceita uma vez por versão (fica registrado com data e IP: ISO 27001
// 5.10, 6.2, 6.5 e 6.6). Enquanto não aceitar, o modal volta a cada abertura do painel.
export default function TermoAceite() {
  const [t, setT] = useState(null)
  const [li, setLi] = useState(false)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { api.get('/api/conta/termo').then(setT).catch(() => {}) }, [])
  if (!t || t.aceito) return null
  const aceitar = async () => { setEnviando(true); try { await api.post('/api/conta/termo/aceitar'); setT({ ...t, aceito: true }) } finally { setEnviando(false) } }
  return (
    <Modal aberto titulo="Termo de Uso e Confidencialidade" onFechar={() => {}}>
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />Versão {t.versao}. Leia e aceite para continuar usando o sistema.</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">{t.itens.map((x) => <li key={x}>{x}</li>)}</ol>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={li} onChange={(e) => setLi(e.target.checked)} />Li e concordo com o termo e com a Política de Segurança da Informação.</label>
        <div className="flex justify-end"><Botao disabled={!li} carregando={enviando} onClick={aceitar}>Aceitar e continuar</Botao></div>
      </div>
    </Modal>
  )
}
