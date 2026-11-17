import { api } from '../api'
import { Versao, dataBR } from '../components/Novidades'
import { Aviso, Cabecalho, Carregando, Selo, useDados } from '../components/ui'

// Histórico de versões (fonte: backend/app/novidades.json).
export default function Novidades() {
  const { dados, erro } = useDados(() => api.get('/api/novidades'))
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Cabecalho titulo="Novidades" descricao="O que mudou em cada versão do sistema: recursos novos, melhorias, segurança e correções." />
      <ol className="space-y-6">
        {dados.versoes.map((v, i) => (
          <li key={v.versao} className="cartao p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Versão {v.versao}</h2>
              {i === 0 && <Selo cor="verde">Atual</Selo>}
              <span className="text-xs text-muted-foreground">{dataBR(v.data)}</span>
              <p className="w-full text-sm font-medium">{v.titulo}</p>
            </div>
            <Versao v={v} />
          </li>
        ))}
      </ol>
    </div>
  )
}
