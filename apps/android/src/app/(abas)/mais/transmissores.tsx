import { Stack } from 'expo-router';
import { View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Carregando, Cartao, Erro, Ponto, Tela, Texto, useCarregar } from '@/ui/base';

export default function Transmissores() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any[]>(() => api.get('/api/hubs'));
  return (
    <>
      <Stack.Screen options={{ title: 'Transmissores IR', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.map((h) => (
            <Cartao key={h.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ponto ativo={!!h.online} /><Texto peso="600">{h.nome}</Texto></View>
              <Texto suave tam={12}>{h.projeto_nome ? `${h.projeto_nome} · ` : ''}IP {h.ip || '—'} · {h.online ? 'online' : `offline${h.visto_em ? `, visto ${haQuanto(h.visto_em)}` : ''}`}</Texto>
              <Texto suave tam={12}>{h.aparelhos} aparelho(s) · formato {h.control_type ? `tipo ${h.control_type}` : 'definido ao gravar'}</Texto>
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
