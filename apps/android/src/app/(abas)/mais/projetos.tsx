import { Stack, router } from 'expo-router';
import { View } from 'react-native';
import { useClima } from '@/lib/contexto';
import { Botao, Cartao, Tela, Texto } from '@/ui/base';

export default function Projetos() {
  const { projetos, projeto, setProjeto, recarregarProjetos } = useClima();
  return (
    <>
      <Stack.Screen options={{ title: 'Projetos', headerLargeTitle: false }} />
      <Tela aoAtualizar={recarregarProjetos}>
        {projetos.map((p: any) => (
          <Cartao key={p.id} style={{ gap: 10, borderLeftWidth: 4, borderLeftColor: p.cor }}>
            <Texto peso="600" tam={16}>{p.nome}</Texto>
            <View style={{ flexDirection: 'row', gap: 18 }}>
              <Texto suave tam={12}>{p.ligados}/{p.aparelhos} ligados</Texto>
              <Texto suave tam={12}>{p.transmissores_online}/{p.transmissores} IR online</Texto>
              <Texto suave tam={12}>{p.cenas} cenas</Texto>
            </View>
            <Botao titulo={projeto?.id === p.id ? 'Selecionado' : 'Abrir este projeto'} variante={projeto?.id === p.id ? 'secundario' : 'primario'} pequeno
              onPress={() => { setProjeto(p.id); router.navigate('/inicio'); }} />
          </Cartao>
        ))}
        <Botao titulo="Ver todos os projetos juntos" variante="secundario" onPress={() => { setProjeto(null); router.navigate('/inicio'); }} />
      </Tela>
    </>
  );
}
