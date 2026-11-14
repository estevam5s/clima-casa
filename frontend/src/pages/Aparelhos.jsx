import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AirVent, ChevronRight, Plus } from 'lucide-react'
import { MODOS, api } from '../api'
import { comFiltro, useProjeto } from '../contexto'
import FormAparelho from '../components/FormAparelho'
import { Aviso, Botao, Cabecalho, Carregando, Modal, Ponto, Selo, Vazio, useDados, useToast } from '../components/ui'

export default function Aparelhos() {
  const { filtro } = useProjeto()
  const { dados, erro } = useDados(() => Promise.all([api.get(comFiltro('/api/aparelhos', filtro)), api.get(comFiltro('/api/hubs', filtro))]), [filtro])
  const [params, setParams] = useSearchParams()
  const [busca, setBusca] = useState('')
  const navegar = useNavigate()
  const toast = useToast()
  const aberto = params.get('novo') === '1'
  const fechar = () => setParams({})

  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const [aparelhos, hubs] = dados
  const filtrados = aparelhos.filter((a) => `${a.nome} ${a.comodo} ${a.marca}`.toLowerCase().includes(busca.toLowerCase()))
  const comodos = [...new Set(filtrados.map((a) => a.comodo || 'Sem cômodo'))]

  const criar = async (f) => {
    const novo = await api.post('/api/aparelhos', f)
    toast(`${novo.nome} adicionado. Agora grave os botões do controle.`)
    navegar(`/aparelhos/${novo.id}?aba=botoes`)
  }

  return (
    <>
      <Cabecalho
        titulo="Aparelhos"
        descricao={`${aparelhos.length} ar-condicionado${aparelhos.length === 1 ? '' : 's'} cadastrado${aparelhos.length === 1 ? '' : 's'} em ${new Set(aparelhos.map((a) => a.comodo)).size} cômodo(s).`}
        acoes={<Botao icone={Plus} onClick={() => setParams({ novo: '1' })}>Adicionar aparelho</Botao>}
      />

      {hubs.length === 0 && (
        <div className="mb-4">
          <Aviso tipo="alerta">
            Nenhum transmissor cadastrado. <Link to="/transmissores" className="font-medium underline">Cadastre o SRW-004</Link> para poder controlar os aparelhos.
          </Aviso>
        </div>
      )}

      {aparelhos.length === 0 ? (
        <Vazio icone={AirVent} titulo="Nenhum aparelho ainda" texto="Comece cadastrando o primeiro ar-condicionado."
          acao={<Botao icone={Plus} onClick={() => setParams({ novo: '1' })}>Adicionar aparelho</Botao>} />
      ) : (
        <>
          <input className="campo mb-4 max-w-xs" placeholder="Buscar por nome, cômodo ou marca" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {comodos.map((c) => (
            <section key={c} className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c}</h2>
              <div className="cartao divide-y divide-border">
                {filtrados.filter((a) => (a.comodo || 'Sem cômodo') === c).map((a) => (
                  <Link key={a.id} to={`/aparelhos/${a.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/60">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-medium">
                        {a.nome}
                        {a.ligado ? <Selo cor="verde">Ligado</Selo> : <Selo>Desligado</Selo>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {a.projeto_nome ? `${a.projeto_nome} · ` : ''}{a.marca || 'Marca não informada'} · {a.ligado ? `${MODOS[a.modo]} ${a.temperatura}°C` : `último ajuste ${a.temperatura}°C`} · {a.total_codigos} botões
                      </p>
                    </div>
                    <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                      <Ponto ativo={a.hub_online} /> {a.hub_nome || 'Sem transmissor'}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <Modal aberto={aberto} titulo="Adicionar ar-condicionado" onFechar={fechar}>
        <FormAparelho hubs={hubs} aoSalvar={criar} rotuloBotao="Adicionar" />
      </Modal>
    </>
  )
}
