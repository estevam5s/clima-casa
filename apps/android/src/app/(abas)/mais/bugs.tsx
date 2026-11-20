import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Botao, Carregando, Cartao, Chip, Erro, Selo, Tela, Texto, useCarregar } from '@/ui/base';

// Bugs: os abertos (do sistema e relatados), filtro por categoria e, para quem gerencia, procurar e rodar o autoteste
// dos cadastros (sala, transmissor, ar e botão numa transação desfeita no servidor).
const CATS: [string, string][] = [['', 'Todos'], ['cadastro', 'Cadastros'], ['tela', 'Telas'], ['servidor', 'Servidor'], ['atividade', 'Comandos'], ['agente', 'Agente']];
const GRAV: Record<string, string> = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };

export default function Bugs() {
  const t = useTema();
  const { dados, erro, atualizar, atualizando } = useCarregar<any>(() => api.get('/api/bugs'));
  const [cat, setCat] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [teste, setTeste] = useState<any>(null);
  const abertos = (dados?.itens || []).filter((b: any) => ['aberto', 'analisando'].includes(b.estado) && (!cat || b.categoria === cat));
  const procurar = async () => {
    setOcupado('procurar');
    try { const r = await api.post('/api/bugs/varrer'); Alert.alert('Procura concluída', r.achados ? `${r.achados} ponto(s) encontrados ou atualizados.` : 'Nada novo.'); atualizar(); }
    catch (e: any) { Alert.alert('Não deu', e.message); } finally { setOcupado(''); }
  };
  const autoteste = async () => {
    setOcupado('teste');
    try { setTeste(await api.post('/api/bugs/autoteste')); atualizar(); } catch (e: any) { Alert.alert('Não deu', e.message); } finally { setOcupado(''); }
  };
  const passos = teste?.passos || dados?.autoteste?.passos;
  return (
    <>
      <Stack.Screen options={{ title: 'Bugs', headerLargeTitle: false }} />
      {!dados && !erro ? <Carregando /> : (
        <Tela atualizando={atualizando} aoAtualizar={atualizar}>
          {erro ? <Erro msg={erro} /> : null}
          {dados?.gestor ? (
            <Cartao style={{ gap: 10 }}>
              <Texto peso="600">Procurar e testar</Texto>
              <Texto suave tam={13}>A procura confere comandos, fila do agente, permissões e cadastros. O autoteste cadastra e desfaz uma sala, um transmissor, um ar e um botão: nada fica gravado.</Texto>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Botao titulo="Procurar bugs" variante="secundario" pequeno carregando={ocupado === 'procurar'} onPress={procurar} />
                <Botao titulo="Rodar autoteste" pequeno carregando={ocupado === 'teste'} onPress={autoteste} />
              </View>
              {passos ? passos.map((p: any) => (
                <Texto key={p.nome} tam={13} cor={p.ok ? t.ok : t.perigo}>{p.ok ? '✓' : '✗'} <Texto tam={13}>{p.nome}</Texto></Texto>
              )) : null}
            </Cartao>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {CATS.map(([k, r]) => <Chip key={k} rotulo={r} ativo={cat === k} onPress={() => setCat(k)} />)}
          </View>
          {abertos.length === 0 ? <Cartao><Texto suave>Nenhum bug aberto{cat ? ' nesta categoria' : ''}.</Texto></Cartao> : abertos.map((b: any) => (
            <Cartao key={b.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Selo rotulo={GRAV[b.gravidade] || b.gravidade} tom={['alta', 'critica'].includes(b.gravidade) ? 'erro' : 'neutro'} />
                <Texto suave tam={12}>{b.origem === 'sistema' ? 'Sistema' : b.autor_nome} · {b.ocorrencias}×</Texto>
              </View>
              <Texto peso="600">{b.titulo}</Texto>
              <Texto suave tam={13}>{b.sugestao}</Texto>
            </Cartao>
          ))}
        </Tela>
      )}
    </>
  );
}
