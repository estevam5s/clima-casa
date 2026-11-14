import { Stack } from 'expo-router';
import { Alert, Switch, View } from 'react-native';
import { api, DIAS, MODOS } from '@/lib/api';
import { Carregando, Cartao, Erro, Linha, Tela, Texto, useCarregar } from '@/ui/base';

export default function Agenda() {
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any[]>(() => api.get('/api/agendamentos'));
  const alternar = async (g: any, ativo: boolean) => {
    await api.put(`/api/agendamentos/${g.id}`, { ...g.acao, aparelho_id: g.aparelho_id, nome: g.nome, dias: g.dias, hora: g.hora, ativo });
    carregar();
  };
  const apagar = (g: any) => Alert.alert('Apagar agendamento?', g.nome, [{ text: 'Cancelar', style: 'cancel' },
    { text: 'Apagar', style: 'destructive', onPress: async () => { await api.del(`/api/agendamentos/${g.id}`); carregar(); } }]);
  const dias = (d: number[]) => (d.length === 7 ? 'Todos os dias' : d.join() === '1,2,3,4,5' ? 'Dias úteis' : d.map((i) => DIAS[i]).join(', '));
  return (
    <>
      <Stack.Screen options={{ title: 'Agenda', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          <Cartao style={{ paddingVertical: 4 }}>
            {dados?.length === 0 && <Texto suave style={{ paddingVertical: 12 }}>Nenhum agendamento. Crie pelo painel web.</Texto>}
            {dados?.map((g) => (
              <Linha key={g.id} onPress={() => apagar(g)}>
                <Texto tam={20} peso="600" style={{ width: 62, fontVariant: ['tabular-nums'] }}>{g.hora}</Texto>
                <View style={{ flex: 1 }}>
                  <Texto peso="500">{g.nome}</Texto>
                  <Texto suave tam={12}>{g.aparelho_nome} · {g.acao.ligado ? `Ligar ${MODOS[g.acao.modo] ?? ''} ${g.acao.temperatura ?? ''}°` : 'Desligar'} · {dias(g.dias)}</Texto>
                </View>
                <Switch value={!!g.ativo} onValueChange={(v) => alternar(g, v)} />
              </Linha>
            ))}
          </Cartao>
          <Texto suave tam={12}>Toque num agendamento para apagar. Precisa do agente do Mac ligado para disparar.</Texto>
        </Tela>
      )}
    </>
  );
}
