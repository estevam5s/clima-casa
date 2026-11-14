import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, KeyRound } from 'lucide-react'
import { api, haQuanto } from '../api'
import { Aviso, Botao, Cabecalho, Carregando, Modal, Ponto, useDados, useToast } from '../components/ui'

function Copiar({ rotulo, valor, segredo }) {
  const [ver, setVer] = useState(!segredo)
  const [ok, setOk] = useState(false)
  const copiar = async () => {
    await navigator.clipboard.writeText(valor)
    setOk(true)
    setTimeout(() => setOk(false), 1500)
  }
  return (
    <div>
      <span className="rotulo">{rotulo}</span>
      <div className="flex gap-1.5">
        <input readOnly className="campo font-mono text-xs" value={valor ? (ver ? valor : '•'.repeat(24)) : 'Defina a URL pública primeiro'} />
        {segredo && <Botao variante="secundario" tamanho="sm" className="h-auto" onClick={() => setVer(!ver)} aria-label="Mostrar">{ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Botao>}
        <Botao variante="secundario" tamanho="sm" className="h-auto" disabled={!valor} onClick={copiar} aria-label="Copiar">{ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Botao>
      </div>
    </div>
  )
}

const PASSOS = [
  ['Deixe o Clima Escritório acessível pela internet', 'A Amazon precisa alcançar este computador por HTTPS. Use um túnel (Cloudflare Tunnel ou túnel SSH para a sua VPS) e cole o endereço em "URL pública". O guia alexa/GUIA.md tem os comandos.'],
  ['Crie a Skill no Alexa Developer Console', 'developer.amazon.com/alexa/console/ask → Create Skill → nome "Clima Escritório", idioma Português (BR), modelo Smart Home. Copie o Skill ID.'],
  ['Crie a função Lambda na AWS', 'Região us-east-1 (Virgínia). Runtime Node.js 20, cole o código de alexa/lambda/index.mjs e preencha as variáveis CLIMA_URL e CLIMA_CHAVE com os valores abaixo. Adicione o gatilho "Alexa Smart Home" com o Skill ID.'],
  ['Ligue a Skill à Lambda', 'Na Skill, em Smart Home → Default endpoint, cole o ARN da Lambda.'],
  ['Configure a vinculação de conta', 'Em Account Linking: Auth Code Grant, cole as URLs de autorização e de token, o Client ID e o Client Secret abaixo. Authentication scheme: HTTP Basic. Copie as "Alexa Redirect URLs" (não precisa colar aqui).'],
  ['Ative no app Alexa', 'App Alexa → Mais → Skills → Suas Skills → Dev → Clima Escritório → Ativar. Faça login com a senha deste painel e autorize. Depois: "Alexa, descobrir dispositivos".'],
]

export default function Alexa() {
  const { dados, erro, setDados } = useDados(() => api.get('/api/alexa'))
  const [url, setUrl] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const toast = useToast()
  if (erro) return <Aviso>{erro}</Aviso>
  if (!dados) return <Carregando />
  const valorUrl = url ?? dados.url_publica

  const salvar = async (e) => {
    e.preventDefault()
    setSalvando(true)
    try {
      setDados(await api.put('/api/alexa', { url_publica: valorUrl }))
      toast('URL pública salva.')
      setUrl(null)
    } catch (e) { toast(e.message, 'erro') } finally { setSalvando(false) }
  }
  const executar = async () => {
    if (confirmar === 'revogar') { await api.post('/api/alexa/revogar'); toast('Vinculação revogada.') }
    else { await api.post('/api/alexa/nova-chave'); toast('Chaves novas geradas. Atualize a Skill e a Lambda.') }
    setDados(await api.get('/api/alexa'))
    setConfirmar(null)
  }

  return (
    <>
      <Cabecalho titulo="Alexa" descricao="Skill Smart Home própria: controle os aparelhos por voz, com temperatura e modo." />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="cartao px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Vinculação</p>
          <p className="mt-1 flex items-center gap-2 font-medium"><Ponto ativo={dados.vinculada} /> {dados.vinculada ? `Vinculada ${haQuanto(dados.vinculada_em)}` : 'Não vinculada'}</p>
        </div>
        <div className="cartao px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Aparelhos visíveis para a Alexa</p>
          <p className="mt-1 font-medium">{dados.aparelhos}</p>
        </div>
        <div className="cartao px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Último comando da Alexa</p>
          <p className="mt-1 truncate font-medium">{dados.ultima_diretiva ? `${dados.ultima_diretiva.acao} · ${haQuanto(dados.ultima_diretiva.quando)}` : 'Nenhum ainda'}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <form onSubmit={salvar} className="cartao space-y-3 p-5">
            <h2 className="text-sm font-semibold">URL pública</h2>
            <input className="campo" placeholder="https://clima.seudominio.com.br" value={valorUrl} onChange={(e) => setUrl(e.target.value)} />
            <p className="ajuda">Endereço HTTPS que leva até este Clima Escritório. Sem ela a Alexa não consegue mandar comandos.</p>
            <div className="flex justify-end"><Botao type="submit" carregando={salvando} disabled={valorUrl === dados.url_publica}>Salvar</Botao></div>
          </form>

          <div className="cartao space-y-4 p-5">
            <h2 className="text-sm font-semibold">Dados para a Skill e a Lambda</h2>
            <Copiar rotulo="URL de autorização (Web Authorization URI)" valor={dados.urls.autorizacao} />
            <Copiar rotulo="URL de token (Access Token URI)" valor={dados.urls.token} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Copiar rotulo="Client ID" valor={dados.client_id} />
              <Copiar rotulo="Client Secret" valor={dados.client_secret} segredo />
            </div>
            <hr className="border-border" />
            <Copiar rotulo="CLIMA_URL (variável da Lambda)" valor={dados.urls.diretivas} />
            <Copiar rotulo="CLIMA_CHAVE (variável da Lambda)" valor={dados.chave_lambda} segredo />
          </div>

          <div className="cartao flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <h2 className="text-sm font-semibold">Segurança</h2>
              <p className="text-sm text-muted-foreground">Revogue o acesso ou gere chaves novas se suspeitar de vazamento.</p>
            </div>
            <div className="flex gap-2">
              <Botao variante="secundario" disabled={!dados.vinculada} onClick={() => setConfirmar('revogar')}>Revogar vinculação</Botao>
              <Botao variante="secundario" icone={KeyRound} onClick={() => setConfirmar('chaves')}>Gerar chaves novas</Botao>
            </div>
          </div>
        </div>

        <div className="cartao h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Como ativar</h2>
          <ol className="space-y-4">
            {PASSOS.map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold ">{i + 1}</span>
                <div><p className="text-sm font-medium">{t}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{d}</p></div>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="mb-1 font-medium">Exemplos de comando</p>
"Alexa, ligar ar do quarto" · "Alexa, colocar ar do quarto em 23 graus" · "Alexa, aumentar a temperatura do ar do quarto" · "Alexa, desligar ar do quarto"
          </div>
        </div>
      </div>

      <Modal aberto={!!confirmar} titulo={confirmar === 'revogar' ? 'Revogar vinculação?' : 'Gerar chaves novas?'} onFechar={() => setConfirmar(null)}>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground/70">
          {confirmar === 'revogar'
            ? 'A Alexa para de controlar os aparelhos até você ativar a Skill de novo no app.'
            : 'O Client Secret e a CLIMA_CHAVE mudam e a vinculação atual é desfeita. Atualize a Skill, a Lambda e ative a Skill de novo.'}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="secundario" onClick={() => setConfirmar(null)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={executar}>Confirmar</Botao>
        </div>
      </Modal>
    </>
  )
}
