import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { api } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Botao, Chip, Texto } from '@/ui/base';

// Assistente de IA (NVIDIA) no celular: a mesma conversa do painel (/ia), com as permissões de quem usa.
// Um ar muda na hora; desligar todos e cenas pedem Confirmar. As conversas ficam salvas no servidor.
type Msg = { role: 'user' | 'assistant'; content: string; confirmacoes?: { confirmacao: string; descricao: string; feito?: string }[]; erro?: boolean };
const SUGESTOES = ['Quais ares estão ligados?', 'Coloca o ar do diretor em 23 graus', 'Por que os comandos não chegam?', 'Quanto gastamos nesta semana?'];

// tira a marcação simples do texto (negrito, código, títulos) para ler bem sem renderizador de Markdown
const limpar = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#{1,4}\s*/gm, '').replace(/^\|.*\|$/gm, (l) => l.replace(/\|/g, '  ').trim());

export default function Ia() {
  const t = useTema();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [conversa, setConversa] = useState<number | null>(null);
  const lista = useRef<FlatList<Msg>>(null);
  useEffect(() => { setTimeout(() => lista.current?.scrollToEnd({ animated: true }), 80); }, [msgs, pensando]);

  const enviar = async (q?: string) => {
    const pergunta = (q ?? texto).trim();
    if (!pergunta || pensando) return;
    const hist: Msg[] = [...msgs, { role: 'user', content: pergunta }];
    setMsgs(hist); setTexto(''); setPensando(true);
    try {
      const r = await api.post('/api/ia/conversar', { mensagens: hist.map(({ role, content }) => ({ role, content: content.slice(0, 4000) })).slice(-20), conversa_id: conversa });
      setMsgs([...hist, { role: 'assistant', content: r.texto, confirmacoes: r.confirmacoes }]);
      if (r.conversa_id) setConversa(r.conversa_id);
    } catch (e: any) {
      setMsgs([...hist, { role: 'assistant', content: e?.message || 'A IA não respondeu agora.', erro: true }]);
    } finally { setPensando(false); }
  };
  const confirmar = async (i: number, c: { confirmacao: string }) => {
    try {
      const r = await api.post('/api/ia/confirmar', { confirmacao: c.confirmacao });
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, confirmacoes: x.confirmacoes?.map((y) => (y === c ? { ...y, feito: r.texto } : y)) } : x)));
    } catch (e: any) {
      setMsgs((m) => m.map((x, j) => (j === i ? { ...x, confirmacoes: x.confirmacoes?.map((y) => (y === c ? { ...y, feito: e?.message } : y)) } : x)));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Assistente de IA', headerLargeTitle: false, headerRight: () => (msgs.length ? <Pressable onPress={() => { setMsgs([]); setConversa(null); }} hitSlop={10}><Texto cor={t.primaria}>Nova</Texto></Pressable> : null) }} />
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.fundo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={lista}
          data={msgs}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingVertical: 40 }}>
              <Texto tam={22} peso="600">Pergunte ou peça</Texto>
              <Texto suave>Ele vê o estado real dos ares, transmissores e do agente, e só faz o que o seu usuário pode.</Texto>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{SUGESTOES.map((s) => <Chip key={s} rotulo={s} onPress={() => enviar(s)} />)}</View>
            </View>
          }
          renderItem={({ item: m, index: i }) => (
            <View style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={{ maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
                backgroundColor: m.role === 'user' ? t.primaria : m.erro ? '#fee2e2' : t.cartao, borderWidth: m.role === 'user' ? 0 : 1, borderColor: t.borda }}>
                <Texto cor={m.role === 'user' ? t.primariaTexto : m.erro ? '#991b1b' : t.texto}>{m.role === 'user' ? m.content : limpar(m.content)}</Texto>
                {m.confirmacoes?.map((c) => (
                  <View key={c.confirmacao} style={{ marginTop: 10, gap: 8 }}>
                    <Texto peso="600">{c.descricao}</Texto>
                    {c.feito ? <Texto suave>{c.feito}</Texto> : (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Botao titulo="Confirmar" pequeno onPress={() => confirmar(i, c)} />
                        <Botao titulo="Cancelar" pequeno variante="secundario" onPress={() => setMsgs((x) => x.map((y, j) => (j === i ? { ...y, confirmacoes: y.confirmacoes?.map((z) => (z === c ? { ...z, feito: 'Cancelado.' } : z)) } : y)))} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}
          ListFooterComponent={pensando ? <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={t.primaria} /><Texto suave>Consultando o sistema…</Texto></View> : undefined}
        />
        <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: t.borda, backgroundColor: t.cartao }}>
          <TextInput value={texto} onChangeText={setTexto} placeholder="Ex.: liga o ar do Deison em 22 graus" placeholderTextColor={t.suave} multiline maxLength={4000}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 12, borderWidth: 1, borderColor: t.borda, paddingHorizontal: 12, paddingVertical: 10, color: t.texto, backgroundColor: t.fundo }} />
          <Botao titulo="Enviar" onPress={() => enviar()} carregando={pensando} desabilitado={!texto.trim()} />
        </View>
      </KeyboardAvoidingView>
    </>
  );
}
