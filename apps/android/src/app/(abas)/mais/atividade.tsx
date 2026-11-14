import { Stack } from 'expo-router';
import { View } from 'react-native';
import { api, haQuanto, rotuloOrigem } from '@/lib/api';
import { Carregando, Cartao, Erro, Selo, Tela, Texto, useCarregar } from '@/ui/base';

export default function Atividade() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any[]>(() => api.get('/api/atividade?limite=100'));
  return (
    <>
      <Stack.Screen options={{ title: 'Atividade', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          <Cartao style={{ paddingVertical: 4 }}>
            {dados?.map((x) => (
              <View key={x.id} style={{ flexDirection: 'row', gap: 8, paddingVertical: 10, borderTopWidth: 0.5, borderColor: '#8883' }}>
                <View style={{ flex: 1 }}>
                  <Texto tam={13}>{x.aparelho_nome ? `${x.aparelho_nome}: ` : ''}{x.acao}</Texto>
                  <Texto suave tam={11}>{rotuloOrigem(x.origem)} · {haQuanto(x.quando)}{x.detalhe ? ` · ${x.detalhe}` : ''}</Texto>
                </View>
                <Selo rotulo={x.ok ? 'OK' : 'Falhou'} tom={x.ok ? 'ok' : 'erro'} />
              </View>
            ))}
          </Cartao>
        </Tela>
      )}
    </>
  );
}
