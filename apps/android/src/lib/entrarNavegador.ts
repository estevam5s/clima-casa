import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { API_URL } from './api';
import { supabase } from './supabase';

// Entrar com e-mail e senha pelo navegador. O login por senha passa pelo CAPTCHA (Turnstile), que só funciona num
// navegador; por isso o app abre /entrar-app numa aba segura com um desafio PKCE (SHA-256 de um verificador aleatório que
// nunca sai deste celular). O site devolve climacasa://auth?codigo=…, de uso único e válido por 2 minutos, e o app troca
// código + verificador por uma sessão nova. Quem interceptar o link de volta não tem o verificador.
export async function entrarPeloNavegador(): Promise<'ok' | 'cancelado'> {
  const bytes = Crypto.getRandomBytes(48);
  const verificador = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const desafio = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verificador, { encoding: Crypto.CryptoEncoding.HEX });
  const volta = 'climacasa://auth';
  const r = await WebBrowser.openAuthSessionAsync(`${API_URL}/entrar-app?desafio=${desafio}`, volta);
  if (r.type !== 'success') return 'cancelado';
  const codigo = Linking.parse(r.url).queryParams?.codigo;
  if (typeof codigo !== 'string' || !codigo) throw new Error('O site não devolveu o código. Tente de novo.');
  const resp = await fetch(`${API_URL}/api/apps/login/trocar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo, verificador }),
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(typeof j.detail === 'string' ? j.detail : `Falha ${resp.status} ao entrar.`);
  const { error } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
  if (error) throw new Error(error.message);
  return 'ok';
}
