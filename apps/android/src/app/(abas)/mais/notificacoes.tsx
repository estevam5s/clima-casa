import { Stack } from 'expo-router';
import { Pressable, View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Carregando, Cartao, Erro, Ponto, Selo, Tela, Texto, useCarregar } from '@/ui/base';

export default function Notificacoes() {
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/notificacoes'));
  return (
    <>
      <Stack.Screen options={{ title: 'Notificações', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.itens?.length === 0 && <Cartao><Texto suave>Tudo em dia.</Texto></Cartao>}
          {dados?.itens?.map((n: any) => (
            <Pressable key={n.id} onPress={async () => { if (!n.lida) { await api.post(`/api/notificacoes/${n.id}/lida`); carregar(); } }}>
              <Cartao style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {!n.lida ? <Ponto ativo /> : null}
                  <Texto peso="600" style={{ flex: 1 }}>{n.titulo}</Texto>
                  <Selo rotulo={n.gravidade} tom={n.gravidade === 'alta' || n.gravidade === 'critica' ? 'erro' : 'neutro'} />
                </View>
                {n.detalhe ? <Texto suave tam={12}>{n.detalhe}</Texto> : null}
                <Texto suave tam={11}>{haQuanto(n.quando)}{!n.lida ? ' · toque para marcar como lida' : ''}</Texto>
              </Cartao>
            </Pressable>
          ))}
        </Tela>
      )}
    </>
  );
}
