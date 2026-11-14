import { Stack } from 'expo-router';
import { View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Botao, Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

export default function Alertas() {
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any[]>(() => api.get('/api/alertas'));
  return (
    <>
      <Stack.Screen options={{ title: 'Alertas', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.length === 0 && <Cartao><Texto suave>Nenhum alerta aberto.</Texto></Cartao>}
          {dados?.map((a) => (
            <Cartao key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}><Texto>{a.mensagem}</Texto><Texto suave tam={12}>{haQuanto(a.criado_em)}</Texto></View>
              <Botao titulo="Resolver" pequeno variante="secundario" onPress={async () => { await api.post(`/api/alertas/${a.id}/resolver`); carregar(); }} />
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
