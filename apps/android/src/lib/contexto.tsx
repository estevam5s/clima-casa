import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';
import { supabase } from './supabase';

type Projeto = { id: number; nome: string; cor: string; aparelhos: number; ligados: number };
type Ctx = {
  sessao: Session | null; carregando: boolean; projetos: Projeto[]; projeto: Projeto | null;
  precisa2fa: boolean; confirmar2fa: (codigo: string) => Promise<void>;
  setProjeto: (id: number | null) => void; filtro: string; recarregarProjetos: () => Promise<void>; sair: () => Promise<void>;
};
const Contexto = createContext<Ctx | null>(null);

export function ProvedorClima({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);
  // conta com Google Authenticator: a sessão só vale (aal2) depois do código de 6 dígitos
  const [precisa2fa, setPrecisa2fa] = useState(false);
  const conferirNivel = useCallback(async (s: Session | null) => {
    if (!s) { setPrecisa2fa(false); return; }
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setPrecisa2fa(!!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
  }, []);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [projetoId, setProjetoId] = useState<number | null>(() => {
    const v = localStorage.getItem('clima-projeto');
    return v && v !== 'todos' ? Number(v) : null;
  });

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { await conferirNivel(data.session); setSessao(data.session); setCarregando(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => { conferirNivel(s).finally(() => setSessao(s)); });
    return () => data.subscription.unsubscribe();
  }, [conferirNivel]);

  const confirmar2fa = useCallback(async (codigo: string) => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    const fator = (data?.totp || []).find((f) => f.status === 'verified');
    if (!fator) throw new Error('Nenhum autenticador cadastrado nesta conta.');
    const { error: e2 } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo });
    if (e2) throw new Error(/invalid|expired/i.test(e2.message) ? 'Código errado ou vencido. Confira a hora do celular e use o código novo.' : e2.message);
    setPrecisa2fa(false);
    api.post('/api/sessao/registrar-login').catch(() => {});
  }, []);

  const recarregarProjetos = useCallback(async () => {
    try { setProjetos(await api.get('/api/projetos')); } catch { /* sem rede */ }
  }, []);
  useEffect(() => {
    if (!sessao || precisa2fa) return;
    let ativo = true;
    api.get('/api/projetos').then((l) => { if (ativo) setProjetos(l); }).catch(() => {});
    return () => { ativo = false; };
  }, [sessao, precisa2fa]);

  const setProjeto = (id: number | null) => {
    setProjetoId(id);
    localStorage.setItem('clima-projeto', id ? String(id) : 'todos');
  };
  const projeto = projetos.find((p) => p.id === projetoId) ?? null;
  const filtro = projeto ? `projeto_id=${projeto.id}` : '';
  const sair = async () => { await supabase.auth.signOut(); };

  return (
    <Contexto.Provider value={{ sessao, carregando, projetos, projeto, setProjeto, filtro, recarregarProjetos, sair, precisa2fa, confirmar2fa }}>
      {children}
    </Contexto.Provider>
  );
}

export const useClima = () => useContext(Contexto)!;
export const comFiltro = (c: string, f: string) => (f ? `${c}${c.includes('?') ? '&' : '?'}${f}` : c);
