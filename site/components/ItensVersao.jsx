// Peças das versões que servem tanto à página do servidor quanto à linha do tempo (sem estado).
export const TIPOS = [
  { id: 'novo', rotulo: 'Novo', cor: '#9cfe4f' },
  { id: 'melhorias', rotulo: 'Melhoria', cor: '#8fb8ff' },
  { id: 'seguranca', rotulo: 'Segurança', cor: '#c4a6ff' },
  { id: 'correcoes', rotulo: 'Correção', cor: '#ffc46b' },
]
export const idVersao = (v) => `v-${v.replace(/\./g, '-')}`
export const dataLonga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

export function SeloTipo({ tipo }) {
  const t = TIPOS.find((x) => x.id === tipo)
  return <span className="selo-tipo" style={{ '--cor': t.cor }}>{t.rotulo}</span>
}

export function ItensVersao({ v, tipos = TIPOS.map((t) => t.id), busca = '' }) {
  const q = busca.trim().toLowerCase()
  return (
    <ul className="itens-versao">
      {TIPOS.filter((t) => tipos.includes(t.id)).flatMap((t) => (v[t.id] || []).filter((x) => !q || x.toLowerCase().includes(q)).map((x) => (
        <li key={t.id + x}><SeloTipo tipo={t.id} /><span>{x}</span></li>
      )))}
    </ul>
  )
}

