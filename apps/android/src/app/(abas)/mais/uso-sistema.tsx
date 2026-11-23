import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Erro, Tela, Texto, useCarregar } from '@/ui/base';

// Uso do sistema por pessoa (o mesmo de Configurações → Usuários → Uso do sistema no painel): tempo com cada tela
// aberta e visível, telas mais usadas e caminhos entre as telas. Só para quem gerencia usuários.
const tempo = (ms: number) => {
  const min = Math.round((ms || 0) / 60000);
  if (min < 1) return ms > 0 ? 'menos de 1 min' : '0 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

function Barra({ pct, cor }: { pct: number; cor: string }) {
  const t = useTema();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.borda, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.min(100, pct))}%`, height: '100%', backgroundColor: cor }} />
    </View>
  );
}

export default function UsoSistema() {
  const t = useTema();
  const [dias, setDias] = useState(30);
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get(`/api/usuarios/uso?dias=${dias}`), [dias]);
  const nome = (r: string) => dados?.nomes?.[r] || r;
  const total = (dados?.pessoas || []).reduce((s: number, p: any) => s + p.ms, 0);
  const maxP = Math.max(1, ...(dados?.pessoas || []).map((p: any) => p.ms));
  const maxT = Math.max(1, ...(dados?.telas || []).map((x: any) => x.ms));
  return (
    <>
      <Stack.Screen options={{ title: 'Uso do sistema', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[7, 30, 90].map((d) => (
              <Pressable key={d} onPress={() => setDias(d)} accessibilityRole="button" accessibilityState={{ selected: dias === d }}
                style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: dias === d ? t.primaria : t.borda, alignItems: 'center' }}>
                <Texto peso={dias === d ? '600' : '400'}>{d} dias</Texto>
              </Pressable>
            ))}
          </View>
          {dados ? (
            <>
              <Cartao style={{ gap: 4 }}>
                <Texto suave tam={12}>Tempo de uso nos últimos {dados.periodo} dias</Texto>
                <Texto peso="700" tam={28}>{tempo(total)}</Texto>
                <Texto suave tam={12}>{dados.pessoas.length} pessoa(s) · {dados.telas.length} tela(s) diferentes</Texto>
              </Cartao>
              {!dados.pessoas.length ? <Cartao><Texto suave>Ainda sem tempo de uso registrado. A contagem começou na versão 0.5.5 do sistema.</Texto></Cartao> : null}
              {dados.pessoas.length ? (
                <Cartao style={{ gap: 12 }}>
                  <Texto peso="600">Quem mais usa</Texto>
                  {dados.pessoas.map((p: any) => (
                    <View key={p.id} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Texto peso="500" style={{ flex: 1 }}>{dados.usuarios?.[p.id]?.nome || 'Conta apagada'}</Texto>
                        <Texto peso="600">{tempo(p.ms)}</Texto>
                      </View>
                      <Barra pct={(p.ms / maxP) * 100} cor={t.primaria} />
                      <Texto suave tam={12}>{p.dias_ativos} dia(s) · mais em {nome(p.favorita)}</Texto>
                    </View>
                  ))}
                </Cartao>
              ) : null}
              {dados.telas.length ? (
                <Cartao style={{ gap: 10 }}>
                  <Texto peso="600">Telas mais usadas</Texto>
                  {dados.telas.map((x: any) => (
                    <View key={x.rota} style={{ gap: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Texto>{nome(x.rota)}</Texto><Texto suave>{tempo(x.ms)}</Texto></View>
                      <Barra pct={(x.ms / maxT) * 100} cor="#2563eb" />
                    </View>
                  ))}
                </Cartao>
              ) : null}
              {dados.caminhos.length ? (
                <Cartao style={{ gap: 6 }}>
                  <Texto peso="600">Caminhos mais comuns</Texto>
                  {dados.caminhos.slice(0, 8).map((c: any) => <Texto key={`${c.de}>${c.para}`} tam={13}>{nome(c.de)} → {nome(c.para)} · {c.n}×</Texto>)}
                </Cartao>
              ) : null}
              <Texto suave tam={12}>Conta só com o sistema aberto e alguém mexendo (5 min parado, o relógio para). Nada do que foi digitado é guardado.</Texto>
            </>
          ) : null}
        </Tela>
      )}
    </>
  );
}
