import { Stack } from 'expo-router';
import { Alert, View } from 'react-native';
import { api } from '@/lib/api';
import { Botao, Carregando, Cartao, Erro, Linha, Tela, Texto, useCarregar } from '@/ui/base';

export default function Musica() {
  const { dados: p, erro, carregar, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/musica/tocando'));
  const cmd = async (corpo: any) => { try { await api.post('/api/musica/comando', corpo); carregar(); } catch (e: any) { Alert.alert('Música', e.message); } };
  return (
    <>
      <Stack.Screen options={{ title: 'Música', headerLargeTitle: false }} />
      {!p && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {p ? (
            <Cartao style={{ gap: 8 }}>
              <Texto peso="600" tam={17}>{p.item?.nome || 'Nada tocando'}</Texto>
              <Texto suave>{p.item?.artistas || ''}{p.aparelho ? ` · ${p.aparelho.nome}` : ''}</Texto>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao pequeno variante="secundario" titulo="Anterior" onPress={() => cmd({ acao: 'anterior' })} />
                <Botao pequeno titulo={p.tocando ? 'Pausar' : 'Tocar'} onPress={() => cmd({ acao: p.tocando ? 'pausar' : 'tocar' })} />
                <Botao pequeno variante="secundario" titulo="Próxima" onPress={() => cmd({ acao: 'proxima' })} />
              </View>
            </Cartao>
          ) : null}
          <Cartao>
            <Texto suave tam={12}>Onde tocar</Texto>
            {(p?.aparelhos || []).map((a: any) => <Linha key={a.id} onPress={() => cmd({ acao: 'transferir', device_id: a.id })}><Texto style={{ flex: 1 }}>{a.nome}</Texto>{a.ativo ? <Texto peso="600">tocando</Texto> : null}</Linha>)}
            {(p?.aparelhos || []).length === 0 ? <Texto suave>Nenhum aparelho do Spotify aberto.</Texto> : null}
          </Cartao>
        </Tela>
      )}
    </>
  );
}
