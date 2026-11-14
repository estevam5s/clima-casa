import { Stack } from 'expo-router';
import { api } from '@/lib/api';
import { comFiltro, useClima } from '@/lib/contexto';
import { ArCartao, type Ar } from '@/ui/ArCartao';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

export default function Aparelhos() {
  const { filtro } = useClima();
  const { dados, setDados, erro, atualizar, atualizando } = useCarregar<Ar[]>(() => api.get(comFiltro('/api/aparelhos', filtro)), [filtro]);
  return (
    <>
      <Stack.Screen options={{ title: 'Aparelhos' }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.length === 0 && <Cartao><Texto suave>Nenhum aparelho. Cadastre pelo painel web em Aparelhos.</Texto></Cartao>}
          {dados?.map((a) => <ArCartao key={a.id} ar={a} aoMudar={(n) => setDados((l) => l!.map((x) => (x.id === n.id ? n : x)))} />)}
        </Tela>
      )}
    </>
  );
}
