import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { api } from '@/lib/api';
import { Carregando, Cartao, Chip, Erro, Selo, Tela, Texto, useCarregar } from '@/ui/base';

// Mensagens do site: lista e Kanban por etapa (mover a pessoa de coluna).
export default function Mensagens() {
  const [modo, setModo] = useState<'lista' | 'kanban'>('lista');
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any>(async () => {
    const [l, k] = await Promise.all([api.get('/api/site/conversas?filtro=tudo'), api.get('/api/site/kanban')]);
    return { ...l, etapas: k.etapas };
  });
  const mover = async (email: string, etapa: string) => {
    try { await api.put(`/api/site/conversa?email=${encodeURIComponent(email)}`, { etapa }); carregar(); } catch (e: any) { Alert.alert('Não deu', e.message); }
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Mensagens', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}><Chip rotulo="Conversas" ativo={modo === 'lista'} onPress={() => setModo('lista')} /><Chip rotulo="Kanban" ativo={modo === 'kanban'} onPress={() => setModo('kanban')} /></View>
          {dados?.itens?.length === 0 && <Cartao><Texto suave>Nenhuma mensagem pelo site ainda.</Texto></Cartao>}
          {modo === 'lista' ? dados?.itens?.map((c: any) => (
            <Cartao key={c.email} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}><Texto peso="600" style={{ flex: 1 }}>{c.nome || c.email}</Texto>{c.nao_lidas ? <Selo rotulo={String(c.nao_lidas)} tom="ok" /> : null}</View>
              <Texto suave tam={12}>{c.ultimo?.texto}</Texto>
            </Cartao>
          )) : (
            <ScrollView horizontal contentContainerStyle={{ gap: 10 }}>
              {(dados?.etapas || []).map((e: any) => {
                const pessoas = (dados?.itens || []).filter((c: any) => (c.etapa || 'novo') === e.id);
                return (
                  <View key={e.id} style={{ width: 250, gap: 8 }}>
                    <Texto peso="600">{e.nome} · {pessoas.length}</Texto>
                    {pessoas.map((c: any) => (
                      <Cartao key={c.email} style={{ gap: 6 }}>
                        <Texto peso="500">{c.nome || c.email}</Texto>
                        <Texto suave tam={12} >{c.ultimo?.texto}</Texto>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {(dados?.etapas || []).filter((x: any) => x.id !== e.id).map((x: any) => <Chip key={x.id} rotulo={`→ ${x.nome}`} onPress={() => mover(c.email, x.id)} />)}
                        </View>
                      </Cartao>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Tela>
      )}
    </>
  );
}
