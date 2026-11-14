import { Stack } from 'expo-router';
import { Alert, Switch, View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Botao, Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

const GATILHO: Record<string, string> = { ligou: 'Quando ligar', desligou: 'Quando desligar', ligado_ha: 'Ligado há', horario: 'Às' };

export default function Automacoes() {
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any[]>(() => api.get('/api/automacoes'));
  const descrever = (g: any) => (g.tipo === 'horario' ? `Às ${g.hora}` : g.tipo === 'ligado_ha' ? `Ligado há ${g.minutos} min` : `${GATILHO[g.tipo]}${g.origem && g.origem !== 'qualquer' ? ` (${g.origem})` : ''}`);
  return (
    <>
      <Stack.Screen options={{ title: 'Automações', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.length === 0 && <Cartao><Texto suave>Nenhuma automação. Crie no painel web em Automações (há modelos prontos).</Texto></Cartao>}
          {dados?.map((a) => (
            <Cartao key={a.id} style={{ gap: 8, opacity: a.ativo ? 1 : 0.6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Texto peso="600" style={{ flex: 1 }}>{a.nome}</Texto>
                <Switch value={!!a.ativo} onValueChange={async (v) => { await api.put(`/api/automacoes/${a.id}`, { ...a, ativo: v }); carregar(); }} />
              </View>
              <Texto suave tam={12}>{descrever(a.gatilho)} → {a.acoes.length} ação(ões) · {a.disparos} disparo(s){a.ultimo_disparo ? ` · ${haQuanto(a.ultimo_disparo)}` : ''}</Texto>
              <Botao titulo="Rodar agora" pequeno variante="secundario" onPress={async () => {
                try { await api.post(`/api/automacoes/${a.id}/executar`); Alert.alert(a.nome, 'Executada.'); carregar(); } catch (e: any) { Alert.alert('Erro', e.message); }
              }} />
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
