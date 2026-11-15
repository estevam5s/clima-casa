import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { autenticar, biometriaLigada } from '@/lib/biometria';
import { useClima } from '@/lib/contexto';
import { useTema } from '@/lib/tema';
import { Botao, Texto } from './base';

// Tela de bloqueio: aparece ao abrir o app e quando ele volta do segundo plano depois de 1 minuto.
export function useBloqueio() {
  const [travado, setTravado] = useState(() => biometriaLigada());
  const saiuEm = useRef<number | null>(null);
  useEffect(() => {
    const s = AppState.addEventListener('change', (e) => {
      if (e === 'background') saiuEm.current = Date.now();
      if (e === 'active' && saiuEm.current && biometriaLigada() && Date.now() - saiuEm.current > 60_000) setTravado(true);
    });
    return () => s.remove();
  }, []);
  const liberar = useCallback(() => setTravado(false), []);
  return { travado: travado && biometriaLigada(), liberar };
}

export function TelaBloqueio({ aoLiberar }: { aoLiberar: () => void }) {
  const t = useTema();
  const { sessao, sair } = useClima();
  const [erro, setErro] = useState('');
  const tentar = async () => { setErro(''); const r = await autenticar(); if (r.ok) aoLiberar(); else setErro(r.erro || ''); };
  useEffect(() => { autenticar().then((r) => (r.ok ? aoLiberar() : setErro(r.erro || ''))); }, [aoLiberar]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.fundo, justifyContent: 'center', padding: 28, gap: 14 }}>
      <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: t.primaria, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
        <Texto cor="#fff" tam={30} peso="700">*</Texto>
      </View>
      <Texto tam={22} peso="600" style={{ textAlign: 'center' }}>App bloqueado</Texto>
      <Texto suave style={{ textAlign: 'center' }}>Use a digital ou o rosto para entrar como {sessao?.user.email}.</Texto>
      {erro ? <Texto cor={t.perigo} style={{ textAlign: 'center' }}>{erro}</Texto> : null}
      <Botao titulo="Entrar com biometria" onPress={tentar} />
      <Botao titulo="Sair desta conta" variante="secundario" onPress={sair} />
    </SafeAreaView>
  );
}
