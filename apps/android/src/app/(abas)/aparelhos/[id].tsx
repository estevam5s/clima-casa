import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { api, haQuanto, MODOS, rotuloOrigem, VENTILACAO } from '@/lib/api';
import { useTema } from '@/lib/tema';
import { Botao, Carregando, Cartao, Chip, Erro, Ponto, Selo, Tela, Texto, Titulo, useCarregar } from '@/ui/base';

export default function Aparelho() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTema();
  const { dados: ar, setDados, erro, carregar, atualizar, atualizando } = useCarregar<any>(() => api.get(`/api/aparelhos/${id}`), [id]);
  const [ocupado, setOcupado] = useState(false);
  const [gravando, setGravando] = useState<{ restante: number; rotulo: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  if (!ar && !erro) return <><Stack.Screen options={{ title: '' }} /><Carregando /></>;
  if (!ar) return <Tela><Erro msg={erro} /></Tela>;

  const mudar = async (e: object) => {
    setOcupado(true);
    try { const n = await api.post(`/api/aparelhos/${ar.id}/estado`, e); setDados((d: any) => ({ ...d, ...n })); carregar(); }
    catch (err: any) { Alert.alert('Não foi possível', err.message); }
    finally { setOcupado(false); }
  };
  const extra = async (chave: string) => {
    try { await api.post(`/api/aparelhos/${ar.id}/botoes/${chave}/enviar`); carregar(); } catch (e: any) { Alert.alert('Erro', e.message); }
  };
  const gravar = async (chave: string, rotulo: string) => {
    try {
      const { job } = await api.post(`/api/aparelhos/${ar.id}/aprender`, { chave });
      setGravando({ restante: 30, rotulo });
      timer.current = setInterval(async () => {
        try {
          const j = await api.get(`/api/gravacoes/${job}`);
          setGravando({ restante: j.restante, rotulo });
          if (j.estado === 'ok' || j.estado === 'erro') {
            clearInterval(timer.current!); setGravando(null);
            if (j.estado === 'ok') { Alert.alert('Botão gravado', rotulo); carregar(); } else Alert.alert('Não gravou', j.erro);
          }
        } catch (e: any) { clearInterval(timer.current!); setGravando(null); Alert.alert('Erro', e.message); }
      }, 1000);
    } catch (e: any) { Alert.alert('Não foi possível gravar', e.message); }
  };
  const pedirGravacao = () => {
    const chave = `${ar.modo}_${ar.temperatura}_${ar.ventilador}`;
    Alert.alert('Gravar botão', `Deixe o controle original em ${MODOS[ar.modo]} ${ar.temperatura}°, ventilação ${VENTILACAO[ar.ventilador].toLowerCase()}. Depois aponte para o transmissor e aperte um botão.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Desligar', onPress: () => gravar('desligar', 'Desligar') },
      { text: 'Este ajuste', onPress: () => gravar(chave, `${MODOS[ar.modo]} ${ar.temperatura}°`) },
    ]);
  };
  const vincularAlexa = async () => {
    try { await api.post(`/api/aparelhos/${ar.id}/sinric/criar`); Alert.alert('Pronto', 'O aparelho já aparece na Alexa e no Google Home.'); carregar(); }
    catch (e: any) { Alert.alert('Não foi possível', e.message); }
  };

  const modos: string[] = ar.modos.split(',');
  const extras = ar.codigos.filter((c: any) => c.chave.startsWith('extra_'));
  const cor = !ar.ligado ? t.suave : ar.modo === 'quente' ? t.quente : t.frio;
  return (
    <>
      <Stack.Screen options={{ title: ar.nome, headerLargeTitle: false }} />
      <Tela atualizando={atualizando} aoAtualizar={atualizar}>
        <Cartao>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ponto ativo={ar.hub?.online} /><Texto suave tam={12}>{ar.hub ? `${ar.hub.nome} ${ar.hub.online ? 'online' : 'offline'}` : 'Sem transmissor'}</Texto>
            <View style={{ marginLeft: 'auto' }}>{ar.ligado ? <Selo rotulo="Ligado" tom="ok" /> : <Selo rotulo="Desligado" />}</View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28, marginVertical: 22 }}>
            <Pressable disabled={ocupado || ar.temperatura <= ar.temp_min} onPress={() => mudar({ ligado: true, temperatura: ar.temperatura - 1 })}
              style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: t.borda, alignItems: 'center', justifyContent: 'center' }}><Texto tam={26}>−</Texto></Pressable>
            <View style={{ alignItems: 'center' }}>
              <Texto tam={64} peso="600" cor={cor}>{ar.temperatura}°</Texto>
              <Texto suave tam={12}>faixa {ar.temp_min}–{ar.temp_max}°</Texto>
            </View>
            <Pressable disabled={ocupado || ar.temperatura >= ar.temp_max} onPress={() => mudar({ ligado: true, temperatura: ar.temperatura + 1 })}
              style={{ width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: t.borda, alignItems: 'center', justifyContent: 'center' }}><Texto tam={26}>+</Texto></Pressable>
          </View>
          <Botao titulo={ar.ligado ? 'Desligar' : 'Ligar'} variante={ar.ligado ? 'secundario' : 'primario'} carregando={ocupado} desabilitado={!ar.hub_id} onPress={() => mudar({ ligado: !ar.ligado })} />
        </Cartao>
        <Cartao style={{ gap: 10 }}>
          <Titulo>Modo</Titulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {modos.map((m) => <Chip key={m} rotulo={MODOS[m]} ativo={!!ar.ligado && ar.modo === m} desabilitado={ocupado} onPress={() => mudar({ ligado: true, modo: m })} />)}
          </View>
          <Titulo>Ventilação</Titulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(VENTILACAO).map(([k, r]) => <Chip key={k} rotulo={r} ativo={!!ar.ligado && ar.ventilador === k} desabilitado={ocupado} onPress={() => mudar({ ligado: true, ventilador: k })} />)}
          </View>
        </Cartao>
        <Cartao style={{ gap: 10 }}>
          <Titulo sub="Funciona mesmo se ligou pela Alexa">Desligar automaticamente</Titulo>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[30, 60, 120, 240].map((m) => <Chip key={m} rotulo={m >= 60 ? `${m / 60} h` : `${m} min`} onPress={async () => {
              try { await api.post(`/api/aparelhos/${ar.id}/temporizador`, { minutos: m, ligado: false }); Alert.alert('Temporizador', `Desliga em ${m >= 60 ? `${m / 60} h` : `${m} min`}.`); } catch (e: any) { Alert.alert('Erro', e.message); }
            }} />)}
            <Chip rotulo="Cancelar" onPress={async () => { await api.del(`/api/aparelhos/${ar.id}/temporizador`); Alert.alert('Temporizador cancelado'); }} />
          </View>
        </Cartao>
        {extras.length > 0 && (
          <Cartao style={{ gap: 10 }}>
            <Titulo>Outros botões</Titulo>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{extras.map((c: any) => <Chip key={c.chave} rotulo={c.descricao} onPress={() => extra(c.chave)} />)}</View>
          </Cartao>
        )}
        <Cartao style={{ gap: 10 }}>
          <Titulo sub={`${ar.codigos.length} botões gravados do controle original`}>Botões</Titulo>
          {gravando ? (
            <View style={{ alignItems: 'center', padding: 10, gap: 6 }}>
              <Texto peso="600">Aguardando o controle: {gravando.rotulo}</Texto>
              <Texto suave tam={12}>Aponte o controle a 10–20 cm do transmissor e aperte o botão.</Texto>
              <Texto tam={28} peso="600">{gravando.restante}s</Texto>
            </View>
          ) : <Botao titulo="Gravar botão do controle" variante="secundario" desabilitado={!ar.hub_id} onPress={pedirGravacao} />}
        </Cartao>
        <Cartao style={{ gap: 10 }}>
          <Titulo sub={ar.sinric_device_id ? 'Disponível em todas as Alexas e no Google Home conectados' : 'Ainda não aparece na Alexa'}>Alexa e Google Home</Titulo>
          {!ar.sinric_device_id && <Botao titulo="Disponibilizar na Alexa" onPress={vincularAlexa} />}
        </Cartao>
        <Cartao>
          <Titulo>Histórico</Titulo>
          {ar.atividade.length === 0 && <Texto suave tam={13}>Sem comandos ainda.</Texto>}
          {ar.atividade.map((x: any) => (
            <View key={x.id} style={{ paddingVertical: 8, borderTopWidth: 0.5, borderColor: t.borda }}>
              <Texto tam={13}>{x.acao}{x.ok ? '' : ' · falhou'}</Texto>
              <Texto suave tam={11}>{rotuloOrigem(x.origem)} · {haQuanto(x.quando)}{!x.ok && x.detalhe ? ` · ${x.detalhe}` : ''}</Texto>
            </View>
          ))}
        </Cartao>
      </Tela>
    </>
  );
}
