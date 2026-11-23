import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ProvedorClima, useClima } from '@/lib/contexto';
import { AvisoAtualizacao } from '@/lib/atualizacao';
import { TelaBloqueio, useBloqueio } from '@/ui/Bloqueio';

SplashScreen.preventAutoHideAsync();

function Rotas() {
  const { sessao, carregando, precisa2fa } = useClima();
  const dentro = !!sessao && !precisa2fa;
  const { travado, liberar } = useBloqueio();
  useEffect(() => { if (!carregando) SplashScreen.hideAsync(); }, [carregando]);
  if (carregando) return null;
  if (dentro && travado) return <TelaBloqueio aoLiberar={liberar} />;
  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={dentro}>
        <Stack.Screen name="(abas)" />
      </Stack.Protected>
      <Stack.Protected guard={!dentro}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
    <AvisoAtualizacao />
    </>
  );
}

export default function RootLayout() {
  const esquema = useColorScheme();
  return (
    <ThemeProvider value={esquema === 'dark' ? DarkTheme : DefaultTheme}>
      <ProvedorClima>
        <Rotas />
      </ProvedorClima>
    </ThemeProvider>
  );
}
