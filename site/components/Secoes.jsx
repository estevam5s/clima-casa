import Link from 'next/link'
import { Plus } from 'lucide-react'
import Botao from './Botao'
import Icone, { nomeMarca } from './Icone'
import Espiral from './Espiral'
import { CarrosselComandos } from './Interativos'
import { Acordeao } from './Interativos'
import { FormNovidades } from './Formularios'
import { DESTAQUES, DISPOSITIVOS, ENTRAR_URL, FAQ, FUNCIONALIDADES, INTEGRACOES, MARCA, NOVIDADES, NUMEROS, PASSOS, PLATAFORMAS, TECNOLOGIAS, TELAS, TELAS_HOME } from '@/lib/dados'

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
            <div className="caixa-texto empurra-direita pf_fadeup mb-50">
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
        <div className="linha duas-colunas-movel">
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
          <div className="lg-6"><div className="caixa-texto empurra-direita mb-50 pf_fadeup"><p>Contados no código da <span>versão 0.4.9</span>, publicada em novembro de 2026.</p></div></div>
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


// ---------- página inicial: o escritório inteiro ----------
export function SecaoEscritorio() {
  return (
    <section className="pt-130">
      <div className="container">
        <div className="linha alinha-fim">
          <div className="lg-6"><Titulo sub="Escritório inteligente" className="mb-50">Muito além do<br />ar-condicionado</Titulo></div>
          <div className="lg-6"><div className="caixa-texto empurra-direita pf_fadeup mb-50"><p>Luzes, cafeteira, persianas, fechadura e música no <span>mesmo painel</span>, com as mesmas permissões, agendas e automações.</p></div></div>
        </div>
        <div className="grade-dispositivos">
          {DISPOSITIVOS.map((d) => (
            <Link key={d.slug} href={`/escritorio-inteligente/${d.slug}`} className="cartao-dispositivo pf_fadeup">
              <span className="ic"><Icone nome={d.icone} tamanho={30} traco={1.3} /></span>
              <h4>{d.titulo}</h4>
              <p>{d.resumo}</p>
              <span className="leia-mais">Ver detalhes</span>
            </Link>
          ))}
        </div>
        <div className="texto-centro pf_fadeup" style={{ marginTop: 50 }}><Botao href="/escritorio-inteligente">Conhecer o escritório inteligente</Botao></div>
      </div>
    </section>
  )
}

const RECURSOS = [
  { icone: 'Bot', titulo: 'Assistente de IA', texto: 'Pergunte em português e ele age com as suas permissões: estado dos ares, salas, relatórios, tempo lá fora. Ações em lote só depois de você confirmar.', href: '/assistente-ia', itens: ['No painel, no Telegram e no celular', 'Conversas salvas', 'Comandos com /'] },
  { icone: 'Send', titulo: 'Bot do Telegram', texto: 'O painel de cada ar no jeito do controle remoto, timers, relatórios, luzes, persianas, música e avisos, com PIN e auditoria.', href: '/bot-telegram', itens: ['1.114 comandos', '28 categorias', 'Confirmação em ação em lote'] },
  { icone: 'Building2', titulo: 'Mapa 3D', texto: 'O prédio de 11 andares na cidade, com o escritório no 9º: salas, ares, luzes reais à noite, equipe no expediente e quem está no mapa agora.', href: '/mapa-3d', itens: ['Andar, sentar, café e elevador', 'Previsão do tempo com chuva', 'Qualidade que se ajusta ao computador'] },
  { icone: 'BarChart3', titulo: 'Relatórios', texto: 'Horas ligado, kWh e custo estimados por aparelho, comparação com o período anterior, horário de pico e falhas com o motivo.', href: '/funcionalidades/relatorios', itens: ['8 formatos, inclusive PDF', 'Modelo com cabeçalho oficial', 'Enviado por e-mail'] },
]
export function SecaoRecursos() {
  return (
    <section className="pt-130 pb-90">
      <div className="container">
        <Titulo sub="Recursos" centro anim="pf_zoomIn" className="mb-50">Mais do que ligar<br />e desligar</Titulo>
        <div className="grade-recursos">
          {RECURSOS.map((r) => (
            <article key={r.titulo} className="cartao-recurso pf_fadeup">
              <div className="topo"><span className="ic"><Icone nome={r.icone} tamanho={28} traco={1.3} /></span><h4>{r.titulo}</h4></div>
              <p>{r.texto}</p>
              <ul>{r.itens.map((x) => <li key={x}>{x}</li>)}</ul>
              <Link href={r.href} className="leia-mais">Saiba mais</Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const PROTECOES = [
  ['ShieldCheck', 'Travas em todo comando físico', 'Limite por aparelho, proteção do compressor e o estado seguro que sempre passa.'],
  ['Lock', 'Segredos cifrados', 'Chaves das integrações guardadas com AES-256-GCM; banco com RLS em todas as tabelas.'],
  ['ShieldAlert', 'Firewall próprio', 'Bloqueio progressivo de IPs, países, assinaturas de ataque e verificação anti-robô.'],
  ['KeyRound', 'Acesso forte', 'Verificação em duas etapas, chaves de acesso (biometria) e aviso de entrada por IP novo.'],
]
export function SecaoSeguranca() {
  return (
    <section className="cinza-escuro pt-130 pb-80">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-5">
            <div className="mb-50 pf_fadeup">
              <Titulo sub="Segurança" anim="" className="mb-30">Mexe em equipamento real,<br />com cuidado de verdade</Titulo>
              <p>Ar, porta e cafeteira são coisas físicas. Por isso cada comando passa por travas no servidor, venha do painel, da Alexa, do Telegram ou da IA.</p>
              <div style={{ marginTop: 30, display: 'flex', gap: 12, flexWrap: 'wrap' }}><Botao href="/seguranca">Ver a segurança</Botao><Botao href="/status" className="contorno">Status ao vivo</Botao></div>
            </div>
          </div>
          <div className="lg-7">
            <div className="grade-protecoes mb-50">
              {PROTECOES.map(([i, t, x]) => <div key={t} className="item-protecao pf_fadeup"><Icone nome={i} tamanho={26} traco={1.3} /><h5>{t}</h5><p>{x}</p></div>)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function IconeApp({ nome }) {
  if (nome === 'windows') return <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true"><path d="M3 5.5 10.5 4.5v7H3zM11.5 4.4 21 3v8.5h-9.5zM3 12.5h7.5v7L3 18.5zM11.5 12.5H21V21l-9.5-1.4z" /></svg>
  return <Icone nome={nome} tamanho={34} />
}
export function SecaoApps() {
  return (
    <section className="pt-130 pb-80">
      <div className="container">
        <div className="linha alinha-centro">
          <div className="lg-7"><Titulo sub="Apps" className="mb-50">No celular, no computador<br />e no navegador</Titulo></div>
          <div className="lg-5"><div className="mb-60 lg-texto-dir pf_fadeup"><Botao href="/baixar">Baixar os apps</Botao></div></div>
        </div>
        <div className="grade-apps">
          {PLATAFORMAS.map((p) => (
            <Link key={p.id} href={`/baixar#${p.id}`} className="cartao-app pf_fadeup">
              <IconeApp nome={p.icone} />
              <h5>{p.nome}</h5>
              <small>{p.detalhe}</small>
            </Link>
          ))}
          <a href={ENTRAR_URL} className="cartao-app pf_fadeup"><Icone nome="Globe" tamanho={34} /><h5>Navegador</h5><small>Instalável (PWA)</small></a>
        </div>
      </div>
    </section>
  )
}

export function SecaoFaqCurta() {
  return (
    <section className="pt-70 pb-90">
      <div className="container">
        <div className="linha">
          <div className="lg-4"><Titulo sub="Perguntas" className="mb-30">O que perguntam<br />antes de começar</Titulo><div className="pf_fadeup mb-50"><Botao href="/faq">Todas as perguntas</Botao></div></div>
          <div className="lg-8"><div className="mb-50"><Acordeao itens={FAQ.slice(0, 6)} /></div></div>
        </div>
      </div>
    </section>
  )
}

export function SecaoNewsletter() {
  return (
    <section className="pb-130">
      <div className="container">
        <div className="faixa-newsletter pf_fadeup">
          <div><h3>As novidades no seu e-mail</h3><p>Versões novas, recursos e dicas, no máximo algumas vezes por mês. <Link href="/newsletter">Saiba mais</Link></p></div>
          <FormNovidades />
        </div>
      </div>
    </section>
  )
}
