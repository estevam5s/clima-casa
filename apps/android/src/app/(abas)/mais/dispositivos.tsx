import { Stack, useLocalSearchParams } from 'expo-router';
import { Alert, View } from 'react-native';
import { api } from '@/lib/api';
import { Botao, Carregando, Cartao, Chip, Erro, Selo, Tela, Texto, useCarregar } from '@/ui/base';

// Luzes (inclusive cada tecla de interruptor Novadigital), persianas, cafeteira e fechadura: a mesma API das telas do painel.
const TITULOS: Record<string, string> = { luz: 'Luzes', persiana: 'Persianas', cafeteira: 'Cafeteira', fechadura: 'Fechadura' };

export default function Dispositivos() {
  const { tipo = 'luz' } = useLocalSearchParams<{ tipo?: string }>();
  const { dados, erro, carregar, atualizar, atualizando } = useCarregar<any>(() => api.get(`/api/dispositivos?tipo=${tipo}`), [tipo]);
  const comando = async (id: number, acao: string, valor?: number) => {
    try { await api.post(`/api/dispositivos/${id}/comando`, { acao, valor }); carregar(); } catch (e: any) { Alert.alert('Não deu', e.message); }
  };
  return (
    <>
      <Stack.Screen options={{ title: TITULOS[tipo] || 'Aparelhos', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {tipo === 'luz' && dados?.sol ? <Cartao><Texto suave tam={12}>Pôr do sol hoje {dados.sol.por} · nascer {dados.sol.nascer}</Texto></Cartao> : null}
          {dados?.dispositivos?.length === 0 && <Cartao><Texto suave>Nada cadastrado. Cadastre e conecte no painel.</Texto></Cartao>}
          {dados?.dispositivos?.map((d: any) => {
            const r = d.resumo || {};
            return (
              <Cartao key={d.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Texto peso="600" style={{ flex: 1 }}>{d.nome}</Texto>
                  {r.tecla ? <Selo rotulo={`tecla ${String(r.tecla).replace('switch_', '')}`} /> : null}
                  <Selo rotulo={!d.conectado ? 'sem aparelho' : d.online ? 'online' : 'offline'} tom={d.conectado && d.online ? 'ok' : 'neutro'} />
                </View>
                <Texto suave tam={12}>{d.projeto_nome || 'Escritório todo'}</Texto>
                {d.conectado ? (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {tipo === 'luz' && <Botao pequeno titulo={r.ligada ? 'Apagar' : 'Acender'} onPress={() => comando(d.id, r.ligada ? 'desligar' : 'ligar')} />}
                    {tipo === 'luz' && r.brilho != null && [25, 50, 75, 100].map((b) => <Chip key={b} rotulo={`${b}%`} ativo={r.brilho === b} onPress={() => comando(d.id, 'brilho', b)} />)}
                    {tipo === 'persiana' && <><Botao pequeno titulo="Abrir" onPress={() => comando(d.id, 'abrir')} /><Botao pequeno variante="secundario" titulo="Parar" onPress={() => comando(d.id, 'parar')} /><Botao pequeno variante="secundario" titulo="Fechar" onPress={() => comando(d.id, 'fechar')} /></>}
                    {tipo === 'cafeteira' && <Botao pequeno titulo={r.ligada ? 'Desligar' : 'Ligar'} onPress={() => comando(d.id, r.ligada ? 'desligar' : 'ligar')} />}
                    {tipo === 'fechadura' && <Texto>{r.trancada ? 'Trancada' : 'Destrancada'}</Texto>}
                  </View>
                ) : null}
              </Cartao>
            );
          })}
        </Tela>
      )}
    </>
  );
}
