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
import Alexa from './pages/Alexa'
import Configuracoes from './pages/Configuracoes'
import Autorizar from './pages/Autorizar'
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
    return () => { window.removeEventListener('clima:sessao-expirada', expirou); window.removeEventListener('clima:2fa', pede2fa) }
  }, [navegar])
  if (!estado) return <Carregando />
  if (!estado.logado) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />
  if (estado.exige_troca_senha) return <TrocarSenha aoTrocar={() => setEstado({ ...estado, exige_troca_senha: false })} />
  return children
}

function NaoEncontrado() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold">Página não encontrada</p>
      <a href="/" className="mt-2 inline-block text-sm text-marca-600 underline">Voltar ao painel</a>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TemaProvider>
    <MarcaProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/oauth/autorizar" element={<Protegido><Autorizar /></Protegido>} />
          <Route element={<Protegido><ProjetoProvider><Layout /></ProjetoProvider></Protegido>}>
            <Route index element={<Painel />} />
            <Route path="aparelhos" element={<Aparelhos />} />
            <Route path="aparelhos/:id" element={<Aparelho />} />
            <Route path="transmissores" element={<Transmissores />} />
            <Route path="agendamentos" element={<Agendamentos />} />
            <Route path="atividade" element={<Atividade />} />
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
