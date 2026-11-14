import Botao from '@/components/Botao'

export const metadata = { title: 'Página não encontrada' }

export default function NaoEncontrada() {
  return (
    <section className="banner-pagina erro-404" style={{ paddingBottom: 150 }}>
      <div className="circulo c1" /><div className="circulo c2" />
      <div className="container texto-centro">
        <h1 className="text-anm">404</h1>
        <h2 className="pf_fadeup" style={{ margin: '20px 0' }}>Essa página saiu para tomar um ar</h2>
        <p className="pf_fadeup" style={{ marginBottom: 40 }}>O endereço não existe ou mudou. Volte para o início ou entre direto no sistema.</p>
        <div className="pf_fadeup"><Botao href="/">Voltar ao início</Botao></div>
      </div>
    </section>
  )
}
