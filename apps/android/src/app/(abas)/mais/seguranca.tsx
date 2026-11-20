import { Stack } from 'expo-router';
import { View } from 'react-native';
import { api } from '@/lib/api';
import { Carregando, Cartao, Erro, Selo, Tela, Texto, useCarregar } from '@/ui/base';

// Segurança: totais do firewall e a auditoria do bot do Telegram (a tela completa fica no painel).
export default function Seguranca() {
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(async () => {
    const [r, t] = await Promise.all([api.get('/api/seguranca/resumo'), api.get('/api/seguranca/telegram?horas=168').catch(() => null)]);
    return { r, t };
  });
  const pt = dados?.t?.por_tipo || {};
  return (
    <>
      <Stack.Screen options={{ title: 'Segurança', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          <Cartao style={{ gap: 4 }}>
            <Texto suave tam={12}>Últimos {dados?.r?.dias} dias</Texto>
            {Object.entries(dados?.r?.totais || {}).map(([k, v]) => <Texto key={k}>{k.replaceAll('_', ' ')}: <Texto peso="600">{String(v)}</Texto></Texto>)}
          </Cartao>
          {dados?.t ? (
            <Cartao style={{ gap: 6 }}>
              <Texto peso="600">Bot do Telegram (7 dias)</Texto>
              <Texto>{pt.comando || 0} comando(s) · {(pt.negado || 0) + (pt.flood || 0) + (pt.pin_errado || 0)} recusado(s) · {dados.t.vinculos.length} vínculo(s)</Texto>
              {dados.t.ips.slice(0, 6).map((i: any) => (
                <View key={i.ip} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Texto tam={12} style={{ flex: 1 }}>{i.ip} · {i.n} entrega(s)</Texto><Selo rotulo={i.telegram ? 'Telegram' : 'fora'} tom={i.telegram ? 'ok' : 'erro'} /></View>
              ))}
            </Cartao>
          ) : null}
        </Tela>
      )}
    </>
  );
}
