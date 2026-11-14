import Link from 'next/link'
import { Plus } from 'lucide-react'
import Botao from './Botao'
import Icone, { nomeMarca } from './Icone'
import Espiral from './Espiral'
import { CarrosselComandos } from './Interativos'
import { DESTAQUES, ENTRAR_URL, FUNCIONALIDADES, INTEGRACOES, MARCA, NOVIDADES, NUMEROS, PASSOS, TECNOLOGIAS, TELAS, TELAS_HOME } from '@/lib/dados'

export const dataBR = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace(' de ', ' ').replace('.', '').replace(' de ', ', ')

export function Titulo({ sub, children, centro, className = '', anim = 'pf_fadeup' }) {
  return (
    <div className={`titulo-secao ${centro ? 'texto-centro' : ''} ${anim} ${className}`}>
      <span className="sub-titulo">{sub}</span>
      <h2>{children}</h2>
    </div>
  )
}

export function CartaoFuncionalidade({ f, mt = '' }) {
  return (
    <div className={`cartao-icone pf_fadeup ${mt}`}>
      <div className="icone"><Icone nome={f.icone} tamanho={60} traco={1.2} /></div>
      <div className="conteudo">
        <h4>{f.titulo}</h4>
        <p>{f.resumo}</p>
        <Link href={`/funcionalidades/${f.slug}`} className="leia-mais">Saiba mais</Link>
      </div>
    </div>
  )
}

export function SecaoFuncionalidades() {
  const lista = DESTAQUES.map((s) => FUNCIONALIDADES.find((f) => f.slug === s))
  return (
    <section className="pt-125">
      <div className="container">
        <div className="linha alinha-fim">
          <div className="lg-6"><Titulo sub="Funcionalidades" className="mb-50">Tudo que o ar do escritório precisa em um painel só</Titulo></div>
          <div className="lg-6">
            <div className="caixa-texto lg-direita pf_fadeup mb-50" style={{ marginLeft: 'auto' }}>
              <p>Somos um <span>sistema completo de climatização</span> que conversa com o ar pelo infravermelho, sem trocar nenhum aparelho.</p>
            </div>
          </div>
        </div>
        <div className="linha centraliza">
          {lista.map((f, i) => <div key={f.slug} className="lg-4 md-6"><CartaoFuncionalidade f={f} mt={['', 'mt-60', 'mt-120'][i]} /></div>)}
        </div>
      </div>
    </section>
  )
}

export function CartaoTela({ t }) {
  return (
    <div className="item-tela mb-60 pf_fadeup">
      <div className="miniatura">
        <Link href={`/telas/${t.slug}`}><img src={`/telas/${t.img}`} alt={`Tela ${t.titulo}`} loading="lazy" /></Link>
        <div className="etiquetas">{t.tags.map((g) => <span key={g}>{g}</span>)}</div>
      </div>
      <div className="conteudo">
        <h4><Link href={`/telas/${t.slug}`}>{t.titulo}</Link></h4>
        <p>{t.resumo}</p>
      </div>
    </div>
  )
}

export function SecaoTelas() {
  const [a, b, c, d] = TELAS_HOME.map((s) => TELAS.find((t) => t.slug === s))
  return (
    <section className="pt-130">
      <div className="container">
        <Titulo sub="Telas reais" centro anim="pf_zoomIn" className="mb-50">Telas do sistema que<br />controla o escritório</Titulo>
        <div className="linha">
          <div className="lg-7"><CartaoTela t={a} /><CartaoTela t={b} /></div>
          <div className="lg-5">
            <CartaoTela t={c} /><CartaoTela t={d} />
            <div className="mb-60 pf_fadeup"><Botao href="/telas">Ver todas</Botao></div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SecaoProcesso({ classe = 'pt-70 pb-90' }) {
  return (
    <section className={classe}>
      <div className="container">
        <Titulo sub="Como funciona" centro anim="pf_zoomIn" className="mb-60">Do clique ao ar gelado,<br />passo a passo</Titulo>
        <div className="processo pf_fadeup">
          <div className="linha-processo" />
          <div className="linha">
            {PASSOS.map((p) => (
              <div key={p.n} className="lg-3 md-6">
                <div className="caixa-processo">
                  <div className="passo">Passo {p.n}</div>
                  <div className="cartao-passo mb-40">
                    <div className="icone"><Icone nome={p.icone} tamanho={44} traco={1.2} /></div>
                    <h5>{p.titulo}</h5>
                    <p>{p.texto}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export function SecaoTecnologias() {
  return (
    <section className="cinza-escuro pt-130 pb-80">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-5">
            <div className="mb-50 pf_fadeup">
              <Titulo sub="Tecnologia" anim="" className="mb-30">Construído sobre base confiável</Titulo>
              <p>O {MARCA} usa <span className="destaque">Python, FastAPI, React, Supabase, Vercel e Three.js</span>: banco com RLS em todas as tabelas, TLS até o banco e segredos cifrados com AES-256.</p>
            </div>
          </div>
          <div className="lg-7">
            <div className="lista-logos mb-50 pf_fadeup">
              <ul>{TECNOLOGIAS.map((t) => <li key={t}><div className="item-logo"><span className="logo"><Icone nome={t} />{nomeMarca(t)}</span></div></li>)}</ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SecaoIntegracoes() {
  return (
    <section className="pt-130 pb-80">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-7"><Titulo sub="Integrações" className="mb-50">Conheça quem trabalha<br />junto com o seu ar</Titulo></div>
          <div className="lg-5"><div className="mb-60 lg-texto-dir pf_fadeup"><Botao href="/funcionalidades/alexa-e-google">Ver integrações</Botao></div></div>
        </div>
        <div className="linha">
          {INTEGRACOES.map((it) => (
            <div key={it.nome} className="lg-3 md-6">
              <div className="item-integracao mb-40 pf_fadeup">
                <div className="imagem">
                  <Icone nome={it.icone} tamanho={120} traco={1} className="marca-grande" />
                  <div className="mais"><Link href={it.href} aria-label={`Saiba mais sobre ${it.nome}`}><Plus size={18} /></Link></div>
                </div>
                <div className="info"><span>{it.papel}</span><h5>{it.nome}</h5></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SecaoNumeros() {
  return (
    <section className="pb-85">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-6"><Titulo sub="Em números" className="mb-50">Números reais do sistema,<br />sem arredondar para cima</Titulo></div>
          <div className="lg-6"><div className="caixa-texto mb-50 pf_fadeup" style={{ marginLeft: 'auto' }}><p>Contados no código da <span>versão 1.0</span>, publicada em novembro de 2026.</p></div></div>
        </div>
        <div className="linha">
          <div className="lg-4"><div className="caixa-imagem mb-50 pf_fadeup"><img src="/telas/painel.jpg" alt="Painel do sistema" style={{ aspectRatio: '4/5', objectFit: 'cover', objectPosition: '20% top' }} /></div></div>
          <div className="lg-8">
            <div className="mb-30">
              {NUMEROS.map((n) => (
                <div key={n.o_que} className="item-numero mb-20 pf_fadeup">
                  <div className="onde"><h5>{n.onde}</h5></div>
                  <div className="oque"><h5>{n.o_que}</h5></div>
                  <div className="quando"><h5>{n.quando}</h5></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function SecaoComandos() {
  return (
    <section className="depoimentos cinza-escuro pt-130 pb-80">
      <div className="forma f1"><span /></div>
      <div className="forma f2"><span /></div>
      <div className="container">
        <Titulo sub="Comandos de voz" centro className="mb-50">Fale e o escritório obedece</Titulo>
        <div className="linha alinha-centro">
          <div className="lg-4"><div className="caixa-imagem dep mb-50 pf_fadeup"><img src="/telas/comandos-voz.jpg" alt="Tela de comandos de voz" /></div></div>
          <div className="lg-8">
            <div className="conteudo-dep mb-50 pf_fadeup">
              <div className="texto-vazado">Alexa</div>
              <CarrosselComandos />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function CartaoNovidade({ n }) {
  return (
    <div className="item-novidade mb-40 pf_fadeup">
      <div className="miniatura"><Link href={`/novidades/${n.slug}`}><img src={`/telas/${n.img}`} alt="" loading="lazy" /></Link></div>
      <div className="conteudo">
        <div className="categoria"><span>{n.categoria}</span></div>
        <h4><Link href={`/novidades/${n.slug}`}>{n.titulo}</Link></h4>
        <p>{n.resumo}</p>
        <Link href={`/novidades/${n.slug}`}>{dataBR(n.data)}</Link>
      </div>
    </div>
  )
}

export function SecaoNovidades() {
  return (
    <section className="pt-130 pb-90">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-7"><Titulo sub="Novidades" className="mb-50">Acompanhe o que mudou<br />no sistema</Titulo></div>
          <div className="lg-5"><div className="mb-60 lg-texto-dir pf_fadeup"><Botao href="/novidades">Ver todas as novidades</Botao></div></div>
        </div>
        <div className="linha">{NOVIDADES.slice(0, 2).map((n) => <div key={n.slug} className="xl-6"><CartaoNovidade n={n} /></div>)}</div>
      </div>
    </section>
  )
}

// Banner das páginas internas (título, texto com ícone, trilha e selo girando).
export function BannerPagina({ titulo, texto, trilha }) {
  const arco = 'M 80,80 m -58,0 a 58,58 0 1,1 116,0 a 58,58 0 1,1 -116,0'
  return (
    <section className="banner-pagina">
      <div className="circulo c1" /><div className="circulo c2" />
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-8">
            <h1 className="text-anm">{titulo}</h1>
            <div className="texto-banner pf_fadeup">
              <div className="icone"><Espiral tamanho={85} faixas={6} torcao={0.4} cor="#fff" /></div>
              <p>{texto}</p>
            </div>
          </div>
          <div className="lg-4 lado">
            <div className="pf_fadeup">
              <a className="selo" href={ENTRAR_URL} aria-label="Entrar no sistema">
                <svg viewBox="0 0 160 160" className="anel-texto gira"><defs><path id="arco-selo" d={arco} /></defs>
                  <text><textPath href="#arco-selo">Entrar no sistema • Entrar no sistema •</textPath></text></svg>
                <span className="centro"><img src="/icone.svg" alt="" /></span>
              </a>
              <ul className="trilha" style={{ marginTop: 30 }}>
                <li><Link href="/">Início</Link></li>
                {trilha.map((t, i) => <li key={t.rotulo} className={i === trilha.length - 1 ? 'ativo' : ''}>{t.href && i < trilha.length - 1 ? <Link href={t.href}>{t.rotulo}</Link> : t.rotulo}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
