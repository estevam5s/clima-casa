import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, sessaoCompartilhada } from './api'

const Ctx = createContext(null)
const CHAVE = 'clima-projeto'

function lerSalvo() {
  try { return localStorage.getItem(CHAVE) || 'todos' } catch { return 'todos' }
}

// Projeto selecionado (casa, escritório…) + sessão do administrador.
export function ProjetoProvider({ children }) {
  const [projetos, setProjetos] = useState([])
  const [atual, setAtualState] = useState(lerSalvo)
  const [sessao, setSessao] = useState(null)

  const recarregar = useCallback(async () => {
    const lista = await api.get('/api/projetos').catch(() => [])
    setProjetos(lista)
    if (atual !== 'todos' && !lista.some((p) => String(p.id) === atual)) setAtual('todos')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    recarregar()
    sessaoCompartilhada().then(setSessao).catch(() => {})
  }, [recarregar])

  const setAtual = (v) => {
    setAtualState(String(v))
    try { localStorage.setItem(CHAVE, String(v)) } catch { /* modo privado */ }
  }

  const projeto = projetos.find((p) => String(p.id) === atual) || null
  const filtro = projeto ? `projeto_id=${projeto.id}` : ''
  return <Ctx.Provider value={{ projetos, projeto, atual, setAtual, filtro, recarregar, sessao }}>{children}</Ctx.Provider>
}

export const useProjeto = () => useContext(Ctx)

export const comFiltro = (caminho, filtro) => (filtro ? `${caminho}${caminho.includes('?') ? '&' : '?'}${filtro}` : caminho)
