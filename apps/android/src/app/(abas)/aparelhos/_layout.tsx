import { Stack } from 'expo-router';
import { useTema } from '@/lib/tema';

export const unstable_settings = { anchor: 'index' };

export default function Pilha() {
  const t = useTema();
  return <Stack screenOptions={{ headerLargeTitle: true, headerTransparent: false, headerStyle: { backgroundColor: t.fundo }, headerTintColor: t.primaria, headerTitleStyle: { color: t.texto }, headerShadowVisible: false, contentStyle: { backgroundColor: t.fundo } }} />;
}
