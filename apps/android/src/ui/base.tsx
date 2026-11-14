import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTema } from '@/lib/tema';

export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; });
  const chave = JSON.stringify(deps);
  const carregar = useCallback(async () => {
    try { setDados(await fnRef.current()); setErro(''); } catch (e: any) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar, chave]);
  const atualizar = async () => { setAtualizando(true); await carregar(); setAtualizando(false); };
  return { dados, setDados, erro, carregar, atualizar, atualizando };
}

export function Tela({ children, atualizando, aoAtualizar }: { children: ReactNode; atualizando?: boolean; aoAtualizar?: () => void }) {
  const t = useTema();
  return (
    <ScrollView style={{ backgroundColor: t.fundo }} contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}
      refreshControl={aoAtualizar ? <RefreshControl refreshing={!!atualizando} onRefresh={aoAtualizar} tintColor={t.suave} /> : undefined}>
      {children}
    </ScrollView>
  );
}

export function Cartao({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTema();
  return <View style={[{ backgroundColor: t.cartao, borderColor: t.borda, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 16 }, style]}>{children}</View>;
}

export function Titulo({ children, sub }: { children: ReactNode; sub?: string }) {
  const t = useTema();
  return (
    <View style={{ marginBottom: 2 }}>
      <Text style={{ color: t.texto, fontSize: 15, fontWeight: '600' }}>{children}</Text>
      {sub ? <Text style={{ color: t.suave, fontSize: 12, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}

export function Texto({ children, suave, tam = 14, peso, cor, style }: { children: ReactNode; suave?: boolean; tam?: number; peso?: '400' | '500' | '600' | '700'; cor?: string; style?: any }) {
  const t = useTema();
  return <Text style={[{ color: cor ?? (suave ? t.suave : t.texto), fontSize: tam, fontWeight: peso ?? '400' }, style]}>{children}</Text>;
}

export function Botao({ titulo, onPress, variante = 'primario', carregando, desabilitado, pequeno, style }: {
  titulo: string; onPress: () => void; variante?: 'primario' | 'secundario' | 'perigo'; carregando?: boolean; desabilitado?: boolean; pequeno?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const t = useTema();
  const fundo = variante === 'primario' ? t.primaria : variante === 'perigo' ? t.perigo : t.cartao;
  const cor = variante === 'secundario' ? t.texto : '#fff';
  return (
    <Pressable disabled={desabilitado || carregando}
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [{
        backgroundColor: fundo, borderRadius: 10, height: pequeno ? 36 : 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
        borderWidth: variante === 'secundario' ? 1 : 0, borderColor: t.borda, opacity: desabilitado ? 0.45 : pressed ? 0.8 : 1,
      }, style]}>
      {carregando ? <ActivityIndicator color={cor} /> : <Text style={{ color: cor, fontWeight: '600', fontSize: pequeno ? 13 : 15 }}>{titulo}</Text>}
    </Pressable>
  );
}

export function Chip({ rotulo, ativo, onPress, desabilitado }: { rotulo: string; ativo?: boolean; onPress: () => void; desabilitado?: boolean }) {
  const t = useTema();
  return (
    <Pressable disabled={desabilitado} onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: ativo ? t.primaria : t.borda, backgroundColor: ativo ? t.primaria : 'transparent', opacity: desabilitado ? 0.4 : 1 }}>
      <Text style={{ color: ativo ? '#fff' : t.texto, fontSize: 13, fontWeight: '500' }}>{rotulo}</Text>
    </Pressable>
  );
}

export function Selo({ rotulo, tom = 'neutro' }: { rotulo: string; tom?: 'neutro' | 'ok' | 'erro' }) {
  const t = useTema();
  const cor = tom === 'ok' ? t.ok : tom === 'erro' ? t.perigo : t.suave;
  return <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: cor + '22' }}><Text style={{ color: cor, fontSize: 11, fontWeight: '600' }}>{rotulo}</Text></View>;
}

export function Ponto({ ativo }: { ativo?: boolean }) {
  const t = useTema();
  return <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ativo ? t.ok : t.suave + '66' }} />;
}

export function Carregando() {
  const t = useTema();
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: t.fundo }}><ActivityIndicator color={t.suave} /></View>;
}

export function Erro({ msg }: { msg: string }) {
  const t = useTema();
  return <Cartao style={{ borderColor: t.perigo }}><Texto cor={t.perigo}>{msg}</Texto></Cartao>;
}

export function Linha({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const t = useTema();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.borda, opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}
