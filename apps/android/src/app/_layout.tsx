import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ProvedorClima, useClima } from '@/lib/contexto';

SplashScreen.preventAutoHideAsync();

function Rotas() {
  const { sessao, carregando } = useClima();
  useEffect(() => { if (!carregando) SplashScreen.hideAsync(); }, [carregando]);
  if (carregando) return null;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!sessao}>
        <Stack.Screen name="(abas)" />
      </Stack.Protected>
      <Stack.Protected guard={!sessao}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
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
