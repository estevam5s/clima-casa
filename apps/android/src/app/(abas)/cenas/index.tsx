import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api, haQuanto, MODOS } from '@/lib/api';
import { comFiltro, useClima } from '@/lib/contexto';
import { Botao, Carregando, Cartao, Erro, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

export default function Cenas() {
  const { filtro } = useClima();
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any[]>(() => api.get(comFiltro('/api/cenas', filtro)), [filtro]);
  const [rodando, setRodando] = useState<number | null>(null);
  const executar = async (c: any) => {
    setRodando(c.id);
    try {
      const r = await api.post(`/api/cenas/${c.id}/executar`);
      const f = r.resultados.filter((x: any) => !x.ok);
      Alert.alert(c.nome, f.length ? `${f.length} de ${r.resultados.length} falharam: ${f[0].erro}` : 'Executada.');
      carregar();
    } catch (e: any) { Alert.alert('Erro', e.message); } finally { setRodando(null); }
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Cenas' }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.length === 0 && <Cartao><Texto suave>Nenhuma cena. Crie no painel web em Cenas (ex.: “Dormir”).</Texto></Cartao>}
          {dados?.map((c) => (
            <Cartao key={c.id} style={{ gap: 10 }}>
              <Titulo sub={`${c.projeto_nome || 'Sem projeto'} · ${c.executada_em ? `executada ${haQuanto(c.executada_em)}` : 'nunca executada'}`}>{c.nome}</Titulo>
              {c.acoes.map((a: any, i: number) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Texto suave tam={13}>{a.aparelho_nome}</Texto>
                  <Texto tam={13} peso="500">{a.ligado ? `${MODOS[a.modo] || 'Ligar'}${a.temperatura ? ` ${a.temperatura}°` : ''}` : 'Desligar'}</Texto>
                </View>
              ))}
              <Botao titulo="Executar" carregando={rodando === c.id} onPress={() => executar(c)} />
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
