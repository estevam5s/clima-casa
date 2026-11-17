import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

// Entrar com Google: abre a tela do Google numa aba segura do navegador e volta para o app (climacasa://auth?code=…).
// PKCE: o código só vira sessão junto com o verificador guardado neste aparelho. Só entra quem já tem conta.
export async function entrarComGoogle(): Promise<'ok' | 'cancelado'> {
  const volta = Linking.createURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: volta, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) throw new Error(error?.message || 'Não foi possível abrir o Google.');
  const r = await WebBrowser.openAuthSessionAsync(data.url, volta);
  if (r.type !== 'success') return 'cancelado';
  const partes = new URLSearchParams((r.url.split('#')[1] || r.url.split('?')[1] || ''));
  const erro = partes.get('error_description');
  if (erro) throw new Error(/signups not allowed|not allowed/i.test(erro) ? 'Esta conta Google não está cadastrada no sistema. Peça acesso ao administrador.' : erro);
  const codigo = partes.get('code');
  if (!codigo) throw new Error('O Google não devolveu a sessão. Tente de novo.');
  const { error: e2 } = await supabase.auth.exchangeCodeForSession(codigo);
  if (e2) throw new Error(e2.message);
  return 'ok';
}
