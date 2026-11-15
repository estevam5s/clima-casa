import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { API_URL } from './api';
import { useTema } from './tema';
import { Texto } from '@/ui/base';

// Duas camadas de atualização:
// 1) telas e funções novas chegam sozinhas pelo ar (EAS Update): baixa em segundo plano e pede para reiniciar;
// 2) quando sai um APK novo (mudança nativa), avisa e leva para a página de download.
const comparar = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0) }
  return 0
}
export const versaoApp = () => Constants.expoConfig?.version ?? '0.0.0';

export async function procurarAtualizacao(): Promise<{ pelaRede: boolean; apk?: { versao: string; notas: string[]; url: string } }> {
  let pelaRede = false;
  if (Updates.isEnabled && !__DEV__) {
    try {
      const r = await Updates.checkForUpdateAsync();
      if (r.isAvailable) { await Updates.fetchUpdateAsync(); pelaRede = true; }
    } catch { /* sem rede */ }
  }
  let apk;
  try {
    const v = await (await fetch(`${API_URL}/api/apps/versao`)).json();
    if (v?.android?.versao && comparar(v.android.versao, versaoApp()) > 0) apk = { versao: v.android.versao, notas: v.notas || [], url: v.android.pagina || `${API_URL}/apps` };
  } catch { /* sem rede */ }
  return { pelaRede, apk };
}

export function AvisoAtualizacao() {
  const t = useTema();
  const [estado, setEstado] = useState<Awaited<ReturnType<typeof procurarAtualizacao>> | null>(null);
  const [fechado, setFechado] = useState(false);
  const checar = useCallback(() => { procurarAtualizacao().then(setEstado).catch(() => {}); }, []);
  useEffect(() => {
    checar();
    const s = AppState.addEventListener('change', (e) => { if (e === 'active') checar(); });
    return () => s.remove();
  }, [checar]);
  if (fechado || !estado || (!estado.pelaRede && !estado.apk)) return null;
  const apk = estado.apk;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 96, borderRadius: 14, padding: 14, backgroundColor: t.cartao, borderWidth: 1, borderColor: t.borda,
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 8, gap: 8 }}>
      <Texto peso="600">{apk ? `Nova versão do app: ${apk.versao}` : 'Atualização pronta'}</Texto>
      <Texto suave tam={13}>{apk ? (apk.notas.slice(0, 2).join(' · ') || 'Baixe para ter as novidades e correções.') : 'Melhorias já foram baixadas. Reinicie para usar.'}</Texto>
      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
        <Pressable onPress={() => setFechado(true)} style={{ paddingVertical: 8, paddingHorizontal: 12 }}><Texto suave peso="500">Depois</Texto></Pressable>
        <Pressable onPress={() => (apk ? Linking.openURL(apk.url) : Updates.reloadAsync())}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.primaria }}>
          <Texto cor={t.primariaTexto} peso="600">{apk ? 'Baixar' : 'Reiniciar agora'}</Texto>
        </Pressable>
      </View>
    </View>
  );
}
