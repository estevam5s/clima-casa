import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Carregando, Cartao, Chip, Erro, Tela, Texto, useCarregar } from '@/ui/base';

// Tarefas (mesmas do painel em /tarefas): "Minhas" mostra as que estão com você; cada projeto mostra as seções com as
// tarefas abertas. Tocar no círculo conclui; o campo no fim da seção cria uma tarefa nova nela.
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const fmt = (s?: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');

function Linha({ t, aoConcluir, extra }: { t: any; aoConcluir: () => void; extra?: string }) {
  const c = useTema();
  const atrasada = !t.concluida && t.prazo && t.prazo < hoje();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <Pressable onPress={aoConcluir} hitSlop={10} accessibilityLabel={t.concluida ? 'Reabrir' : 'Concluir'}
        style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.concluida ? c.ok : c.suave, backgroundColor: t.concluida ? c.ok : 'transparent' }} />
      <View style={{ flex: 1 }}>
        <Texto style={t.concluida ? { textDecorationLine: 'line-through', color: c.suave } : undefined}>{t.titulo}</Texto>
        {extra ? <Texto suave tam={12}>{extra}</Texto> : null}
      </View>
      {t.prazo ? <Texto tam={12} cor={atrasada ? c.perigo : c.suave}>{fmt(t.prazo)}</Texto> : null}
    </View>
  );
}

export default function Tarefas() {
  const c = useTema();
  const [aba, setAba] = useState<'minhas' | number>('minhas');
  const geral = useCarregar<any>(() => api.get('/api/tarefas/projetos'));
  const minhas = useCarregar<any>(() => api.get('/api/tarefas/minhas'));
  const proj = useCarregar<any>(() => (typeof aba === 'number' ? api.get(`/api/tarefas/projetos/${aba}`) : Promise.resolve(null)), [aba]);
  const [novo, setNovo] = useState<Record<number, string>>({});
  const concluir = async (t: any) => {
    try { await api.put(`/api/tarefas/${t.id}`, { concluida: !t.concluida }); minhas.atualizar(); proj.atualizar(); geral.atualizar(); }
    catch (e: any) { Alert.alert('Não deu', e.message); }
  };
  const criar = async (secao_id: number) => {
    const titulo = (novo[secao_id] || '').trim();
    if (!titulo || typeof aba !== 'number') return;
    try { await api.post('/api/tarefas', { projeto_id: aba, secao_id, titulo }); setNovo({ ...novo, [secao_id]: '' }); proj.atualizar(); geral.atualizar(); }
    catch (e: any) { Alert.alert('Não deu', e.message); }
  };
  const projetos = (geral.dados?.projetos || []).filter((p: any) => !p.arquivado);
  const atualizar = () => { geral.atualizar(); minhas.atualizar(); proj.atualizar(); };
  return (
    <>
      <Stack.Screen options={{ title: 'Tarefas', headerLargeTitle: false }} />
      {!geral.dados && !geral.erro ? <Carregando /> : (
        <Tela atualizando={geral.atualizando || minhas.atualizando} aoAtualizar={atualizar}>
          {geral.erro ? <Erro msg={geral.erro} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Chip rotulo="Minhas" ativo={aba === 'minhas'} onPress={() => setAba('minhas')} />
            {projetos.map((p: any) => <Chip key={p.id} rotulo={`${p.nome} · ${p.total - p.feitas}`} ativo={aba === p.id} onPress={() => setAba(p.id)} />)}
          </View>
          {aba === 'minhas' ? (
            !minhas.dados ? <Carregando /> : minhas.dados.tarefas.length === 0 ? (
              <Cartao><Texto suave>Nenhuma tarefa com você. Quando alguém marcar você como responsável, ela aparece aqui.</Texto></Cartao>
            ) : (
              <Cartao>
                {minhas.dados.tarefas.map((t: any) => <Linha key={t.id} t={t} aoConcluir={() => concluir(t)} extra={`${t.projeto_nome}${t.secao_nome ? ` · ${t.secao_nome}` : ''}`} />)}
              </Cartao>
            )
          ) : !proj.dados ? <Carregando /> : (
            proj.dados.secoes.map((s: any) => {
              const itens = proj.dados.tarefas.filter((t: any) => t.secao_id === s.id && !t.concluida);
              return (
                <Cartao key={s.id} style={{ gap: 2 }}>
                  <Texto peso="600">{s.nome} <Texto suave tam={12}>{itens.length}</Texto></Texto>
                  {itens.map((t: any) => <Linha key={t.id} t={t} aoConcluir={() => concluir(t)} />)}
                  {geral.dados?.pode_editar ? (
                    <TextInput value={novo[s.id] || ''} onChangeText={(v) => setNovo({ ...novo, [s.id]: v })} onSubmitEditing={() => criar(s.id)} returnKeyType="done"
                      placeholder="+ Adicionar tarefa" placeholderTextColor={c.suave} maxLength={300}
                      style={{ color: c.texto, borderTopWidth: 1, borderColor: c.borda, paddingVertical: 10, marginTop: 4 }} />
                  ) : null}
                </Cartao>
              );
            })
          )}
          <Texto suave tam={12}>Quadro, calendário, cronograma, comentários e GitHub Projects: no painel, em Tarefas.</Texto>
        </Tela>
      )}
    </>
  );
}
