import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { supabase } from './supabase';

type Projeto = { id: number; nome: string; cor: string; aparelhos: number; ligados: number };
type Ctx = {
  sessao: Session | null; carregando: boolean; projetos: Projeto[]; projeto: Projeto | null;
  setProjeto: (id: number | null) => void; filtro: string; recarregarProjetos: () => Promise<void>; sair: () => Promise<void>;
};
const Contexto = createContext<Ctx | null>(null);

export function ProvedorClima({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState<number | null>(() => {
    const v = localStorage.getItem('clima-projeto');
    return v && v !== 'todos' ? Number(v) : null;
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setCarregando(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregarProjetos = useCallback(async () => {
    try { setProjetos(await api.get('/api/projetos')); } catch { /* sem rede */ }
  }, []);
  useEffect(() => {
    if (!sessao) return;
    let ativo = true;
    api.get('/api/projetos').then((l) => { if (ativo) setProjetos(l); }).catch(() => {});
    return () => { ativo = false; };
  }, [sessao]);

  const setProjeto = (id: number | null) => {
    setProjetoId(id);
    localStorage.setItem('clima-projeto', id ? String(id) : 'todos');
  };
  const projeto = projetos.find((p) => p.id === projetoId) ?? null;
  const filtro = projeto ? `projeto_id=${projeto.id}` : '';
  const sair = async () => { await supabase.auth.signOut(); };

  return (
    <Contexto.Provider value={{ sessao, carregando, projetos, projeto, setProjeto, filtro, recarregarProjetos, sair }}>
      {children}
    </Contexto.Provider>
  );
}

export const useClima = () => useContext(Contexto)!;
export const comFiltro = (c: string, f: string) => (f ? `${c}${c.includes('?') ? '&' : '?'}${f}` : c);
