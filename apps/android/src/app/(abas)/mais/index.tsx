import { Stack, router } from 'expo-router';
import { Alert, View } from 'react-native';
import { useClima } from '@/lib/contexto';
import { Cartao, Linha, Tela, Texto } from '@/ui/base';

const ITENS: [string, string, string][] = [
  ['Agenda', 'Horários automáticos', '/mais/agenda'],
  ['Atividade', 'Histórico de todos os comandos', '/mais/atividade'],
  ['Alertas', 'Avisos das rotinas do Supabase', '/mais/alertas'],
  ['Projetos', 'Casa, escritório e outros lugares', '/mais/projetos'],
  ['Transmissores IR', 'SRW-004 e status na rede', '/mais/transmissores'],
  ['Alexa e Google Home', 'Sinric Pro e como conectar outra Alexa', '/mais/integracoes'],
  ['Supabase', 'Rotinas automáticas, banco e backups', '/mais/supabase'],
];

export default function Mais() {
  const { sessao, sair } = useClima();
  return (
    <>
      <Stack.Screen options={{ title: 'Mais' }} />
      <Tela>
        <Cartao style={{ paddingVertical: 4 }}>
          {ITENS.map(([t, d, rota], i) => (
            <View key={rota} style={i === 0 ? { marginTop: -1 } : undefined}>
              <Linha onPress={() => router.push(rota as any)}>
                <View style={{ flex: 1 }}><Texto peso="500">{t}</Texto><Texto suave tam={12}>{d}</Texto></View>
                <Texto suave>›</Texto>
              </Linha>
            </View>
          ))}
        </Cartao>
        <Cartao>
          <Texto suave tam={12}>Conectado como</Texto>
          <Texto peso="500">{sessao?.user.email}</Texto>
          <Linha onPress={() => Alert.alert('Sair', 'Deseja sair da conta?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: sair }])}>
            <Texto cor="#dc2626" peso="500">Sair</Texto>
          </Linha>
        </Cartao>
      </Tela>
    </>
  );
}
