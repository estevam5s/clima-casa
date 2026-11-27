import React, { Suspense, lazy, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { vigiarErros } from './errosTela'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './index.css'
import { api, sessaoCompartilhada } from './api'
import Layout from './components/Layout'
import { Carregando, ToastProvider } from './components/ui'
import Login from './pages/Login'
import Painel from './pages/Painel'
const Aparelhos = lazy(() => import('./pages/Aparelhos'))
const Aparelho = lazy(() => import('./pages/Aparelho'))
const Transmissores = lazy(() => import('./pages/Transmissores'))
const Rotinas = lazy(() => import('./pages/Rotinas'))
const Atividade = lazy(() => import('./pages/Atividade'))
const Notificacoes = lazy(() => import('./pages/Notificacoes'))
const Luzes = lazy(() => import('./pages/Luzes'))
const Telegram = lazy(() => import('./pages/Telegram'))
const Bugs = lazy(() => import('./pages/Bugs'))
const Tarefas = lazy(() => import('./pages/Tarefas'))
const Ia = lazy(() => import('./pages/Ia'))
const Backup = lazy(() => import('./pages/Backup'))
const Alexa = lazy(() => import('./pages/Alexa'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const Autorizar = lazy(() => import('./pages/Autorizar'))
const EntrarApp = lazy(() => import('./pages/EntrarApp'))
import ProtecaoErro from './components/ProtecaoErro'
const Supabase = lazy(() => import('./pages/Supabase'))
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'))
const Projetos = lazy(() => import('./pages/Projetos'))
const Mapa = lazy(() => import('./pages/Mapa'))
const Relatorios = lazy(() => import('./pages/Relatorios'))
const Seguranca = lazy(() => import('./pages/Seguranca'))
const Mensagens = lazy(() => import('./pages/Mensagens'))
import TrocarSenha from './pages/TrocarSenha'
const Integracoes = lazy(() => import('./pages/Integracoes'))
import { ProjetoProvider } from './contexto'
import { TemaProvider } from './tema'
import { MarcaProvider } from './marca'
const ComandosAlexa = lazy(() => import('./pages/ComandosAlexa'))
const Apps = lazy(() => import('./pages/Apps'))
const Musica = lazy(() => import('./pages/Musica'))
const Guia = lazy(() => import('./pages/Guia'))
const Novidades = lazy(() => import('./pages/Novidades'))
const Infra = lazy(() => import('./pages/Infra'))
const Rede = lazy(() => import('./pages/Rede'))
const Cafeteira = lazy(() => import('./pages/Cafeteira'))
const Persianas = lazy(() => import('./pages/Persianas'))
const Fechadura = lazy(() => import('./pages/Fechadura'))
const Avatares = lazy(() => import('./pages/Avatares'))
const Emails = lazy(() => import('./pages/Emails'))
const Analise = lazy(() => import('./pages/Analise'))
const Idiomas = lazy(() => import('./pages/Idiomas'))
import { medirPagina } from './medicao'

function ComProtecao({ children }) {   // erro numa tela não deixa a página preta; trocar de tela tenta de novo
  const local = useLocation()
  useEffect(() => { medirPagina(local.pathname) }, [local.pathname])   // tela Acessos e SEO
  return <ProtecaoErro chave={local.pathname}>{children}</ProtecaoErro>
}

function Protegido({ children }) {
  const [estado, setEstado] = useState(null)
  const local = useLocation()
  const navegar = useNavigate()
  useEffect(() => {
    const sem = () => { try { localStorage.removeItem('clima-casa-auth') } catch { /* sem storage */ } }  // evita voltar ao login em laço
    const de = window.location.pathname + window.location.search
    sessaoCompartilhada().then((e) => { if (!e?.logado) sem(); setEstado(e) }).catch((err) => {
      if (err.precisa2fa) return navegar('/login', { replace: true, state: { de, etapa: '2fa' } })   // falta o código do autenticador
      sem(); setEstado({ logado: false })
    })
    const expirou = () => navegar('/login', { state: { de } })
    const pede2fa = () => navegar('/login', { state: { de, etapa: '2fa' } })
    window.addEventListener('clima:sessao-expirada', expirou)
    window.addEventListener('clima:2fa', pede2fa)
    const exige2fa = () => { if (!window.location.pathname.startsWith('/configuracoes')) navegar('/configuracoes?aba=seguranca', { state: { exige2fa: true } }) }
    window.addEventListener('clima:exige-2fa', exige2fa)
    return () => { window.removeEventListener('clima:sessao-expirada', expirou); window.removeEventListener('clima:2fa', pede2fa); window.removeEventListener('clima:exige-2fa', exige2fa) }
  }, [navegar])
  if (!estado) return <Carregando />
  if (!estado.logado) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />
  if (estado.exige_troca_senha) return <TrocarSenha aoTrocar={() => setEstado({ ...estado, exige_troca_senha: false })} />
  return children
}

import NaoEncontrado from './pages/NaoEncontrado'
import Cursor from './components/Cursor'
import { ligarSomDeClique } from './som'
import { lerPreferencias } from './preferencias'
import { iniciarTraducaoPainel } from './i18nPainel'

// Volta do login do Spotify (/musica?code=…&state=…): troca o código na hora, antes da checagem de login do painel.
// Funciona mesmo se o Spotify devolveu num navegador/app onde o painel não está logado; o resultado fica guardado
// nesta aba e aparece na tela Música.
;(() => {
  const u = new URL(window.location.href)
  const code = u.searchParams.get('code'), state = u.searchParams.get('state'), err = u.searchParams.get('error')
  if (u.pathname !== '/musica' || (!code && !err)) return
  window.history.replaceState(null, '', '/musica')
  const guardar = (x) => { try { sessionStorage.setItem('spotify-retorno', JSON.stringify(x)) } catch { /* sem armazenamento */ } window.__spotifyRetorno = x; window.dispatchEvent(new Event('spotify-retorno')) }
  if (err) { guardar({ ok: false, msg: err === 'access_denied' ? 'Login do Spotify cancelado.' : `O Spotify devolveu: ${err}` }); return }
  window.__spotifyRetorno = { processando: true }
  fetch('/api/musica/spotify-retorno', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, state }) })
    .then(async (r) => { const j = await r.json().catch(() => ({})); guardar(r.ok ? { ok: true, conta: j.conta } : { ok: false, msg: typeof j.detail === 'string' ? j.detail : `Falha ${r.status} ao concluir o login.` }) })
    .catch(() => guardar({ ok: false, msg: 'Sem conexão para concluir o login do Spotify. Tente de novo.' }))
})()

vigiarErros()
// depois que a primeira tela aparece, as telas mais usadas são baixadas em segundo plano (sem economia de dados ligada):
// trocar de tela continua instantâneo, sem o pacote inicial pesar
;(() => {
  const conexao = navigator.connection
  if (conexao?.saveData || /2g/.test(conexao?.effectiveType || '')) return
  const pre = () => ['Aparelhos', 'Aparelho', 'Projetos', 'Relatorios', 'Atividade', 'Transmissores', 'Configuracoes', 'Rotinas']
    .forEach((n, i) => setTimeout(() => import(`./pages/${n}.jsx`).catch(() => {}), i * 400))
  const ocioso = window.requestIdleCallback || ((f) => setTimeout(f, 2500))
  // espera a primeira tela pintar o conteúdo (≈ 4 s) antes de baixar as outras: antes a pré-carga começava em 0,2 s e
  // disputava a rede e o processador com os dados da tela aberta (piorava o LCP do Painel no celular)
  window.addEventListener('load', () => setTimeout(() => ocioso(pre, { timeout: 8000 }), 4000), { once: true })
})()
ligarSomDeClique(lerPreferencias)   // som ao clicar (preferência de cada navegador)
// idioma do painel escolhido antes (Português = nada a fazer)
setTimeout(iniciarTraducaoPainel, 0)
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TemaProvider>
    <MarcaProvider>
    <ToastProvider>
      <Cursor />
      <BrowserRouter future={{ v7_startTransition: true }}>
        <ComProtecao>
        {/* cada tela é baixada só quando é aberta: o pacote inicial tinha 3 MB com todas as telas juntas */}
        <Suspense fallback={<Carregando />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/oauth/autorizar" element={<Protegido><Autorizar /></Protegido>} />
          <Route path="/entrar-app" element={<Protegido><EntrarApp /></Protegido>} />
          <Route element={<Protegido><ProjetoProvider><Layout /></ProjetoProvider></Protegido>}>
            <Route index element={<Painel />} />
            <Route path="aparelhos" element={<Aparelhos />} />
            <Route path="aparelhos/:id" element={<Aparelho />} />
            <Route path="transmissores" element={<Transmissores />} />
            <Route path="rotinas" element={<Rotinas />} />
            <Route path="agendamentos" element={<Navigate to="/rotinas?aba=agenda" replace />} />
            <Route path="atividade" element={<Atividade />} />
            <Route path="notificacoes" element={<Notificacoes />} />
            <Route path="luzes" element={<Luzes />} />
            <Route path="telegram" element={<Telegram />} />
            <Route path="bugs" element={<Bugs />} />
            <Route path="tarefas" element={<Tarefas />} />
            <Route path="ia" element={<Ia />} />
            <Route path="backup" element={<Backup />} />
            <Route path="alexa" element={<Alexa />} />
            <Route path="supabase" element={<Supabase />} />
            <Route path="projetos" element={<Projetos />} />
            <Route path="mapa" element={<Mapa />} />
            <Route path="cenas" element={<Navigate to="/rotinas?aba=cenas" replace />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="seguranca" element={<Seguranca />} />
            <Route path="mensagens" element={<Mensagens />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="automacoes" element={<Navigate to="/rotinas?aba=automacoes" replace />} />
            <Route path="comandos-alexa" element={<ComandosAlexa />} />
            <Route path="apps" element={<Apps />} />
            <Route path="musica" element={<Musica />} />
            <Route path="guia" element={<Guia />} />
            <Route path="novidades" element={<Novidades />} />
            <Route path="infra" element={<Infra />} />
            <Route path="rede" element={<Rede />} />
            <Route path="cafeteira" element={<Cafeteira />} />
            <Route path="persianas" element={<Persianas />} />
            <Route path="fechadura" element={<Fechadura />} />
            <Route path="avatares" element={<Avatares />} />
            <Route path="treinamento" element={<Navigate to="/seguranca?aba=treinamento" replace />} />
            <Route path="emails" element={<Emails />} />
            <Route path="analise" element={<Analise />} />
            <Route path="idiomas" element={<Idiomas />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<NaoEncontrado />} />
          </Route>
        </Routes>
        </Suspense>
        </ComProtecao>
      </BrowserRouter>
    </ToastProvider>
    </MarcaProvider>
    </TemaProvider>
  </React.StrictMode>,
)

// PWA: registra o service worker (só em produção, para não atrapalhar o desenvolvimento)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
