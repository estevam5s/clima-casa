import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

// Fluxos (Rotinas → Fluxos no painel): ligar e desligar, executar agora e ver as últimas execuções de todos.
// Montar e editar os blocos continua no painel (a tela do celular é pequena para o desenho).
const quando = (s: number) => {
  const m = Math.round((Date.now() / 1000 - s) / 60);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
};

export default function Fluxos() {
  const t = useTema();
  const [rodando, setRodando] = useState<number | null>(null);
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => Promise.all([api.get('/api/fluxos'), api.get('/api/fluxos-execucoes?limite=15')]));
  const [fluxos, execucoes] = dados || [[], []];
  const ligar = async (f: any, v: boolean) => {
    try { await api.put(`/api/fluxos/${f.id}/ativo`, { ativo: v }); atualizar(); } catch (e: any) { Alert.alert('Fluxos', e.message); }
  };
  const executar = async (f: any) => {
    setRodando(f.id);
    try {
      const r: any = await api.post(`/api/fluxos/${f.id}/executar`, { dados: {} });
      Alert.alert(f.nome, r.estado === 'ok' ? `Rodou: ${r.passos.length} bloco(s).` : r.erro || 'Terminou com erro.');
      atualizar();
    } catch (e: any) { Alert.alert('Fluxos', e.message); } finally { setRodando(null); }
  };
  return (
    <>
      <Stack.Screen options={{ title: 'Fluxos', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {!fluxos.length ? <Cartao><Texto suave>Nenhum fluxo ainda. Crie no painel, em Rotinas → Fluxos.</Texto></Cartao> : null}
          {fluxos.map((f: any) => (
            <Cartao key={f.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Texto peso="600" style={{ flex: 1 }}>{f.nome}</Texto>
                <Switch value={!!f.ativo} onValueChange={(v) => ligar(f, v)} accessibilityLabel={`${f.ativo ? 'Desligar' : 'Ligar'} ${f.nome}`} />
              </View>
              <Texto suave tam={12}>{f.gatilhos.length ? f.gatilhos.join(' · ') : 'sem gatilho (só pelo botão)'} · {f.blocos} bloco(s)</Texto>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Texto suave tam={12}>{f.ultima_exec ? `Rodou ${quando(f.ultima_exec)} · ${f.ultimo_estado === 'ok' ? 'deu certo' : 'com erro'}` : 'Ainda não rodou'}</Texto>
                <Pressable onPress={() => executar(f)} disabled={rodando === f.id} accessibilityRole="button"
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: t.primaria, opacity: rodando === f.id ? 0.5 : 1 }}>
                  <Texto tam={13} style={{ color: t.primaria }}>{rodando === f.id ? 'Rodando…' : 'Executar'}</Texto>
                </Pressable>
              </View>
            </Cartao>
          ))}
          {execucoes.length ? (
            <Cartao style={{ gap: 10 }}>
              <Texto peso="600">Últimas execuções</Texto>
              {execucoes.map((e: any) => (
                <View key={e.id} style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: e.estado === 'ok' ? '#059669' : e.estado === 'erro' ? '#dc2626' : t.borda }} />
                  <View style={{ flex: 1 }}>
                    <Texto>{e.fluxo}</Texto>
                    <Texto suave tam={12}>{e.origem} · {quando(e.inicio)}{e.erro ? ` · ${e.erro}` : ''}</Texto>
                  </View>
                </View>
              ))}
            </Cartao>
          ) : null}
        </Tela>
      )}
    </>
  );
}
