import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

// Diagnóstico do sistema (o mesmo de Configurações → Diagnóstico no painel): banco, agente, transmissores, e-mail, backup e bugs,
// conferidos ao vivo no servidor. Só para quem gerencia as configurações.
const COR: Record<string, string> = { ok: '#059669', alerta: '#d97706', falha: '#dc2626' };
const ROTULO: Record<string, string> = { ok: 'em ordem', alerta: 'atenção', falha: 'com problema' };
const TELA: Record<string, string> = { '/transmissores': '/mais/transmissores', '/bugs': '/mais/bugs', '/infra?aba=agentes': '/mais/transmissores', '/supabase': '/mais/supabase' };

export default function Diagnostico() {
  const t = useTema();
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/config/diagnostico'));
  const pct = dados ? Math.round((dados.ok / Math.max(1, dados.total)) * 100) : 0;
  return (
    <>
      <Stack.Screen options={{ title: 'Diagnóstico', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados ? (
            <>
              <Cartao style={{ gap: 4 }}>
                <Texto suave tam={12}>Conferido agora no servidor</Texto>
                <Texto peso="700" tam={28} style={{ color: pct >= 80 ? COR.ok : pct >= 50 ? COR.alerta : COR.falha }}>{pct}%</Texto>
                <Texto suave tam={12}>{dados.ok} de {dados.total} itens em ordem · puxe para conferir de novo</Texto>
              </Cartao>
              <Cartao style={{ gap: 12 }}>
                {dados.itens.map((i: any) => {
                  const destino = TELA[i.link];
                  return (
                    <Pressable key={i.nome} disabled={!destino || i.estado === 'ok'} onPress={() => destino && router.push(destino as any)} accessibilityRole={destino ? 'button' : undefined}
                      style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: COR[i.estado] }} accessibilityLabel={ROTULO[i.estado]} />
                      <View style={{ flex: 1 }}>
                        <Texto peso="600">{i.nome}</Texto>
                        <Texto suave tam={12}>{i.detalhe}</Texto>
                      </View>
                      {destino && i.estado !== 'ok' ? <Texto tam={12} style={{ color: t.primaria }}>Ver</Texto> : null}
                    </Pressable>
                  );
                })}
              </Cartao>
            </>
          ) : null}
        </Tela>
      )}
    </>
  );
}
