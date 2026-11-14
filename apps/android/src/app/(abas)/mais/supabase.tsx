import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { api, haQuanto } from '@/lib/api';
import { Botao, Carregando, Cartao, Erro, Selo, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

export default function Supabase() {
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any>(() => Promise.all([api.get('/api/supabase/resumo'), api.get('/api/supabase/rotinas')]));
  const [rodando, setRodando] = useState<string | null>(null);
  if (!dados && !erro) return <><Stack.Screen options={{ title: 'Supabase', headerLargeTitle: false }} /><Carregando /></>;
  const [resumo, rotinas] = dados ?? [null, []];
  const rodar = async (n: string) => {
    setRodando(n);
    try { await api.post(`/api/supabase/rotinas/${n}/executar`); carregar(); } catch (e: any) { Alert.alert('Erro', e.message); } finally { setRodando(null); }
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Supabase', headerLargeTitle: false }} />
      <Tela atualizando={atualizando} aoAtualizar={atualizar}>
        {erro ? <Erro msg={erro} /> : null}
        {resumo && (
          <Cartao style={{ gap: 4 }}>
            <Titulo>Banco de dados</Titulo>
            <Texto>{resumo.saude?.tamanho_banco_mb ?? '—'} MB de {resumo.limite_mb} MB · {resumo.backups.length} backups</Texto>
          </Cartao>
        )}
        <Titulo>Rotinas automáticas</Titulo>
        {rotinas.map((r: any) => (
          <Cartao key={r.jobid} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Texto peso="600" style={{ flex: 1 }}>{r.jobname.replace('clima_', '').replaceAll('_', ' ')}</Texto>
              <Switch value={r.active} onValueChange={async (v) => { await api.put(`/api/supabase/rotinas/${r.jobname}`, { ativo: v }); carregar(); }} />
            </View>
            <Texto suave tam={12}>{r.descricao}</Texto>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {r.ultimo_status ? <Selo rotulo={r.ultimo_status === 'succeeded' ? 'OK' : r.ultimo_status} tom={r.ultimo_status === 'succeeded' ? 'ok' : 'erro'} /> : <Selo rotulo="não rodou" />}
              <Texto suave tam={12}>{haQuanto(r.ultimo_em)}</Texto>
              <Botao titulo="Rodar" pequeno variante="secundario" carregando={rodando === r.jobname} onPress={() => rodar(r.jobname)} style={{ marginLeft: 'auto' }} />
            </View>
          </Cartao>
        ))}
      </Tela>
    </>
  );
}
