import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// Chave publishable (pública). A secret nunca fica no app.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://elyqjdcsbfdvlsxomxen.supabase.co';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  // pkce: o Google devolve só um código de uso único, que sem o verificador guardado neste aparelho não vale nada
  // (com o fluxo antigo, os tokens vinham no endereço climacasa://, que outro app instalado poderia capturar)
  auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false, flowType: 'pkce' },
});

AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
