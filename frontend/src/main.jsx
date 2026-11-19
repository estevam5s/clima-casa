import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './index.css'
import { api } from './api'
import Layout from './components/Layout'
import { Carregando, ToastProvider } from './components/ui'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Aparelhos from './pages/Aparelhos'
import Aparelho from './pages/Aparelho'
import Transmissores from './pages/Transmissores'
import Agendamentos from './pages/Agendamentos'
import Atividade from './pages/Atividade'
import Notificacoes from './pages/Notificacoes'
import Luzes from './pages/Luzes'
import Alexa from './pages/Alexa'
import Configuracoes from './pages/Configuracoes'
import Autorizar from './pages/Autorizar'
import EntrarApp from './pages/EntrarApp'
import Supabase from './pages/Supabase'
import RedefinirSenha from './pages/RedefinirSenha'
import Projetos from './pages/Projetos'
import Mapa from './pages/Mapa'
import Cenas from './pages/Cenas'
import Relatorios from './pages/Relatorios'
import Seguranca from './pages/Seguranca'
import Mensagens from './pages/Mensagens'
import TrocarSenha from './pages/TrocarSenha'
import Integracoes from './pages/Integracoes'
import { ProjetoProvider } from './contexto'
import { TemaProvider } from './tema'
import { MarcaProvider } from './marca'
import Automacoes from './pages/Automacoes'
import ComandosAlexa from './pages/ComandosAlexa'
import Apps from './pages/Apps'
import Musica from './pages/Musica'
import Guia from './pages/Guia'
import Novidades from './pages/Novidades'
import Infra from './pages/Infra'
import Rede from './pages/Rede'
import Cafeteira from './pages/Cafeteira'
import Persianas from './pages/Persianas'
import Fechadura from './pages/Fechadura'
import Avatares from './pages/Avatares'
import Treinamento from './pages/Treinamento'
import Emails from './pages/Emails'

function Protegido({ children }) {
  const [estado, setEstado] = useState(null)
  const local = useLocation()
  const navegar = useNavigate()
  useEffect(() => {
    const sem = () => { try { localStorage.removeItem('clima-casa-auth') } catch { /* sem storage */ } }  // evita voltar ao login em laço
    const de = window.location.pathname + window.location.search
    api.get('/api/sessao').then((e) => { if (!e?.logado) sem(); setEstado(e) }).catch((err) => {
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TemaProvider>
    <MarcaProvider>
    <ToastProvider>
      <Cursor />
      <BrowserRouter>
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
            <Route path="agendamentos" element={<Agendamentos />} />
            <Route path="atividade" element={<Atividade />} />
            <Route path="notificacoes" element={<Notificacoes />} />
            <Route path="luzes" element={<Luzes />} />
            <Route path="alexa" element={<Alexa />} />
            <Route path="supabase" element={<Supabase />} />
            <Route path="projetos" element={<Projetos />} />
            <Route path="mapa" element={<Mapa />} />
            <Route path="cenas" element={<Cenas />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="seguranca" element={<Seguranca />} />
            <Route path="mensagens" element={<Mensagens />} />
            <Route path="integracoes" element={<Integracoes />} />
            <Route path="automacoes" element={<Automacoes />} />
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
            <Route path="treinamento" element={<Treinamento />} />
            <Route path="emails" element={<Emails />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<NaoEncontrado />} />
          </Route>
        </Routes>
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
