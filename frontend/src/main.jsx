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
import Projetos from './pages/Projetos'
import Cenas from './pages/Cenas'
import Relatorios from './pages/Relatorios'
import Integracoes from './pages/Integracoes'
import { ProjetoProvider } from './contexto'
import Automacoes from './pages/Automacoes'
import ComandosAlexa from './pages/ComandosAlexa'
import Apps from './pages/Apps'

function Protegido({ children }) {
  const [estado, setEstado] = useState(null)
  const local = useLocation()
  const navegar = useNavigate()
  useEffect(() => {
    api.get('/api/sessao').then(setEstado).catch(() => setEstado({ logado: false }))
    const expirou = () => navegar('/login', { state: { de: window.location.pathname + window.location.search } })
    window.addEventListener('clima:sessao-expirada', expirou)
    return () => window.removeEventListener('clima:sessao-expirada', expirou)
  }, [navegar])
  if (!estado) return <Carregando />
  if (!estado.logado) return <Navigate to="/login" replace state={{ de: local.pathname + local.search }} />
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
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="cenas" element={<Cenas />} />
            <Route path="relatorios" element={<Relatorios />} />
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
  </React.StrictMode>,
)

// PWA: registra o service worker (só em produção, para não atrapalhar o desenvolvimento)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
