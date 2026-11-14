import { useEffect, useState } from 'react'
import { api, dataHora, rotuloOrigem } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Selo } from '../components/ui'

export default function Atividade() {
  const [filtro, setFiltro] = useState({ origem: '', aparelho_id: '', falhas: false })
  const [itens, setItens] = useState(null)
  const [aparelhos, setAparelhos] = useState([])
  const [fim, setFim] = useState(false)
  const [erro, setErro] = useState('')

  const url = (antes) => {
    const p = new URLSearchParams({ limite: 50 })
    if (filtro.origem) p.set('origem', filtro.origem)
    if (filtro.aparelho_id) p.set('aparelho_id', filtro.aparelho_id)
    if (filtro.falhas) p.set('falhas', 'true')
    if (antes) p.set('antes', antes)
    return `/api/atividade?${p}`
  }

  useEffect(() => { api.get('/api/aparelhos').then(setAparelhos).catch(() => {}) }, [])
  useEffect(() => {
    setItens(null)
    api.get(url()).then((l) => { setItens(l); setFim(l.length < 50) }).catch((e) => setErro(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro])

  const mais = async () => {
    const l = await api.get(url(itens[itens.length - 1].id))
    setItens([...itens, ...l])
    setFim(l.length < 50)
  }

  return (
    <>
      <Cabecalho titulo="Atividade" descricao="Todos os comandos enviados, de onde vieram e se deram certo." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="campo w-auto" value={filtro.origem} onChange={(e) => setFiltro({ ...filtro, origem: e.target.value })} aria-label="Origem">
          <option value="">Todas as origens</option>
          <option value="painel">Painel</option>
          <option value="alexa">Alexa</option>
          <option value="agenda">Agenda</option>
          <option value="sistema">Sistema</option>
        </select>
        <select className="campo w-auto" value={filtro.aparelho_id} onChange={(e) => setFiltro({ ...filtro, aparelho_id: e.target.value })} aria-label="Aparelho">
          <option value="">Todos os aparelhos</option>
          {aparelhos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filtro.falhas} onChange={(e) => setFiltro({ ...filtro, falhas: e.target.checked })} className="h-4 w-4 accent-marca-600" />
          Só falhas
        </label>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {!itens ? <Carregando /> : (
        <div className="cartao overflow-x-auto">
          <table className="tabela w-full min-w-[560px]">
            <thead><tr><th>Quando</th><th>Aparelho</th><th>Ação</th><th>Origem</th><th>Resultado</th></tr></thead>
            <tbody>
              {itens.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nada encontrado.</td></tr>}
              {itens.map((t) => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{dataHora(t.quando)}</td>
                  <td>{t.aparelho_nome || '—'}</td>
                  <td>{t.acao}{t.detalhe && <p className="text-xs text-muted-foreground">{t.detalhe}</p>}</td>
                  <td className="whitespace-nowrap">{rotuloOrigem(t.origem)}</td>
                  <td>{t.ok ? <Selo cor="verde">OK</Selo> : <Selo cor="vermelho">Falhou</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {itens && !fim && <div className="mt-4 text-center"><Botao variante="secundario" onClick={mais}>Carregar mais</Botao></div>}
    </>
  )
}
