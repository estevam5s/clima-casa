import { meta } from '@/lib/seo'
import Botao from '@/components/Botao'
import Icone from '@/components/Icone'
import { BannerPagina, Titulo } from '@/components/Secoes'
import { APPS_URL, ENTRAR_URL } from '@/lib/dados'

export const metadata = meta({ titulo: 'Baixar os apps', descricao: 'Clima Escritório para Android, Mac (Apple Silicon e Intel), Windows, Linux e como app instalado no navegador (PWA).', caminho: '/baixar', og: 'funcionalidade-apps' })

const APPS = [
  { icone: 'siAndroid', nome: 'Android', arquivo: 'APK', itens: ['Entrar com biometria (digital ou rosto)', 'Entrar com Google', 'Atualizações automáticas pela internet', 'Aviso quando sai uma versão nova'] },
  { icone: 'siApple', nome: 'macOS', arquivo: 'DMG · Apple Silicon e Intel', itens: ['Bloqueio com Touch ID', 'Ícone na barra de menus', 'Atalhos de teclado (⌘1 a ⌘9, ⌘K)', 'Aviso de versão nova'] },
  { icone: 'Monitor', nome: 'Windows', arquivo: 'Instalador EXE', itens: ['Windows Hello no login com biometria', 'Ícone na bandeja', 'Atalhos de teclado (Ctrl+1 a 9)', 'Iniciar com o Windows'] },
  { icone: 'siLinux', nome: 'Linux', arquivo: 'AppImage · x64 e ARM', itens: ['Sem instalação: é só abrir', 'Atalhos de teclado', 'Tela própria sem internet', 'Aviso de versão nova'] },
  { icone: 'Globe', nome: 'Navegador (PWA)', arquivo: 'Instalar pelo navegador', itens: ['Funciona em qualquer aparelho', 'Chaves de acesso (Face ID, digital)', 'Sempre na última versão', 'Sem download'] },
]

export default function Baixar() {
  return (
    <>
      <BannerPagina titulo="Baixar os apps" texto="O mesmo sistema no celular, no computador e no navegador." trilha={[{ rotulo: 'Apps' }]} />
      <section className="pt-130 pb-90">
        <div className="container">
          <Titulo sub="Escolha o seu" centro className="mb-50">Apps para todos os aparelhos</Titulo>
          <div className="grade-integracoes">
            {APPS.map((a) => (
              <article key={a.nome} className="cartao-integracao pf_fadeup">
                <header><span className="camada-icone"><Icone nome={a.icone} tamanho={26} /></span><div><h3>{a.nome}</h3><small>{a.arquivo}</small></div></header>
                <ul className="lista-check compacta">{a.itens.map((t) => <li key={t}><span>{t}</span></li>)}</ul>
              </article>
            ))}
          </div>
          <div className="caixa-aviso pf_fadeup">
            <p>Os arquivos ficam na área de apps do sistema, com o tamanho, a impressão digital (SHA-256) e o passo a passo de instalação de cada um. Entre com a sua conta para baixar.</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}><Botao href={APPS_URL} externo>Ir para os downloads</Botao><Botao href={ENTRAR_URL} externo className="contorno">Entrar no sistema</Botao></div>
          </div>
        </div>
      </section>
    </>
  )
}
