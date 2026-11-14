import { Stack, router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { api, haQuanto, rotuloOrigem } from '@/lib/api';
import { comFiltro, useClima } from '@/lib/contexto';
import { useTema } from '@/lib/tema';
import { ArCartao, type Ar } from '@/ui/ArCartao';
import { Botao, Carregando, Cartao, Chip, Erro, Ponto, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

export default function Inicio() {
  const t = useTema();
  const { projetos, projeto, setProjeto, filtro } = useClima();
  const { dados, setDados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get(comFiltro('/api/painel', filtro)), [filtro]);
  if (!dados && !erro) return <><Stack.Screen options={{ title: 'Início' }} /><Carregando /></>;
  const tot = dados?.totais;
  const status = dados ? [
    ['Agente do Mac', dados.agente.online], ['Alexa (Sinric Pro)', dados.sinric], ['Nuvem Tuya', dados.nuvem], ['Skill própria', dados.alexa],
  ] : [];
  const atualizarAr = (a: Ar) => setDados((d: any) => ({ ...d, aparelhos: d.aparelhos.map((x: Ar) => (x.id === a.id ? a : x)) }));
  return (
    <>
      <Stack.Screen options={{ title: projeto?.nome ?? 'Início' }} />
      <Tela atualizando={atualizando} aoAtualizar={atualizar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip rotulo="Todos" ativo={!projeto} onPress={() => setProjeto(null)} />
          {projetos.map((p) => <Chip key={p.id} rotulo={p.nome} ativo={projeto?.id === p.id} onPress={() => setProjeto(p.id)} />)}
        </ScrollView>
        {erro ? <Erro msg={erro} /> : null}
        {tot && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[['Aparelhos', `${tot.ligados}/${tot.aparelhos}`, 'ligados agora'], ['Transmissores', `${tot.hubs_online}/${tot.hubs}`, 'online'],
              ['Comandos 24 h', String(tot.comandos_24h), tot.falhas_24h ? `${tot.falhas_24h} com falha` : 'sem falhas'], ['Agenda', String(tot.agendamentos), 'ativos']].map(([r, v, d]) => (
              <Cartao key={r} style={{ flexBasis: '47%', flexGrow: 1, padding: 14 }}>
                <Texto suave tam={12}>{r}</Texto>
                <Texto tam={24} peso="600" style={{ marginTop: 4 }}>{v}</Texto>
                <Texto suave tam={11}>{d}</Texto>
              </Cartao>
            ))}
          </View>
        )}
        {dados?.alertas > 0 && (
          <Pressable onPress={() => router.push('/mais/alertas')}>
            <Cartao style={{ borderColor: '#f59e0b' }}><Texto cor="#d97706" peso="600">{dados.alertas} alerta(s) aberto(s) · ver</Texto></Cartao>
          </Pressable>
        )}
        <Cartao>
          <Titulo>Integrações</Titulo>
          <View style={{ marginTop: 8, gap: 8 }}>
            {status.map(([n, ok]) => (
              <View key={n as string} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ponto ativo={!!ok} /><Texto>{n as string}</Texto><Texto suave tam={12} style={{ marginLeft: 'auto' }}>{ok ? 'ativo' : 'inativo'}</Texto></View>
            ))}
          </View>
        </Cartao>
        <Titulo sub="Toque no nome para ver os detalhes">Aparelhos</Titulo>
        {dados?.aparelhos.length === 0 && <Cartao><Texto suave>Nenhum aparelho neste projeto.</Texto></Cartao>}
        {dados?.aparelhos.map((a: Ar) => <ArCartao key={a.id} ar={a} aoMudar={atualizarAr} />)}
        <Botao titulo="Executar uma cena" variante="secundario" onPress={() => router.push('/cenas')} />
        <Cartao>
          <Titulo>Atividade recente</Titulo>
          {dados?.atividade.map((x: any) => (
            <View key={x.id} style={{ paddingVertical: 8, borderTopWidth: 0.5, borderColor: t.borda }}>
              <Texto tam={13}>{x.aparelho_nome ? `${x.aparelho_nome}: ` : ''}{x.acao}</Texto>
              <Texto suave tam={11}>{rotuloOrigem(x.origem)} · {haQuanto(x.quando)}{x.ok ? '' : ' · falhou'}</Texto>
            </View>
          ))}
        </Cartao>
      </Tela>
    </>
  );
}
