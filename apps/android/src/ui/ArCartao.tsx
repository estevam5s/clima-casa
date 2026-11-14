import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, MODOS } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Cartao, Ponto, Texto } from './base';

export type Ar = { id: number; nome: string; comodo: string; projeto_nome?: string; hub_id: string | null; hub_online?: number; hub_nome?: string;
  ligado: number; modo: string; temperatura: number; ventilador: string; temp_min: number; temp_max: number; modos: string; total_codigos: number; sinric_device_id?: string | null };

export function ArCartao({ ar, aoMudar }: { ar: Ar; aoMudar: (a: Ar) => void }) {
  const t = useTema();
  const [ocupado, setOcupado] = useState(false);
  const mudar = async (e: object) => {
    setOcupado(true);
    try { aoMudar({ ...ar, ...(await api.post(`/api/aparelhos/${ar.id}/estado`, e)) }); }
    catch (err: any) { Alert.alert('Não foi possível', err.message); }
    finally { setOcupado(false); }
  };
  const cor = !ar.ligado ? t.suave : ar.modo === 'quente' ? t.quente : t.frio;
  const botao = (rotulo: string, onPress: () => void, desab: boolean) => (
    <Pressable onPress={onPress} disabled={ocupado || desab || !ar.hub_id}
      style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: t.borda, alignItems: 'center', justifyContent: 'center', opacity: desab ? 0.3 : 1 }}>
      <Texto tam={20}>{rotulo}</Texto>
    </Pressable>
  );
  return (
    <Cartao style={{ opacity: ocupado ? 0.6 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/aparelhos/${ar.id}`)}>
          <Texto peso="600" tam={15}>{ar.nome}</Texto>
          <Texto suave tam={12}>{[ar.projeto_nome, ar.comodo].filter(Boolean).join(' · ') || 'Sem cômodo'}</Texto>
        </Pressable>
        <Pressable onPress={() => mudar({ ligado: !ar.ligado })} disabled={ocupado || !ar.hub_id}
          style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: ar.ligado ? t.primaria : 'transparent', borderWidth: 1, borderColor: ar.ligado ? t.primaria : t.borda }}>
          <Texto cor={ar.ligado ? '#fff' : t.suave} peso="700">⏻</Texto>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        {botao('−', () => mudar({ ligado: true, temperatura: ar.temperatura - 1 }), ar.temperatura <= ar.temp_min)}
        <View style={{ alignItems: 'center' }}>
          <Texto tam={38} peso="600" cor={cor} style={{ fontVariant: ['tabular-nums'] }}>{ar.temperatura}°</Texto>
          <Texto suave tam={12}>{ar.ligado ? MODOS[ar.modo] : 'Desligado'}</Texto>
        </View>
        {botao('+', () => mudar({ ligado: true, temperatura: ar.temperatura + 1 }), ar.temperatura >= ar.temp_max)}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ponto ativo={!!ar.hub_online} /><Texto suave tam={12}>{ar.hub_id ? (ar.hub_online ? 'Transmissor online' : 'Transmissor offline') : 'Sem transmissor'}</Texto></View>
        <Texto suave tam={12}>{ar.total_codigos} botões</Texto>
      </View>
    </Cartao>
  );
}
